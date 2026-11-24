/**
 * Nordic Aurora Radar — Live Data Transport, LRU Cache & Forecast Assembler
 *
 * Isolates all network I/O (14 NOAA SWPC feeds, MET Norway 2.5km layered clouds,
 * 5-point Open-Meteo backfill, BigDataCloud/Open-Meteo geocoding), AbortController
 * timeout hygiene, bounded MET Norway LRU caching, and pure live snapshot scoring.
 */

import {
  isInNordicMetBox, computeCompassPoints, computeDistanceKm,
  computeSolarElevation, getMoonState, computeGeomagneticLat,
  requiredKpForMagLat, computeMLT, computeDataLagMin,
  computeBallisticCoupling, computeAuroraScore,
  parseMagSeries, parseWindSeries, parseKpForecast, lookupForecastKp,
  parseLatestKp, lookupOvationProb, parseHemiPower, parseGoesSubstorm, mergeGoesSubstorm,
  parseGeospacePredKp1h, parseNoaaAlerts, parseNoaaGeomagneticScales,
  parseKyotoDst, parsePropagatedSolarWind, parseEnlilForecast,
  parseMetNorwayHourly12, parseMetNorwayMultiDay,
  parseOpenMeteoHourly12, parseOpenMeteoMultiDay, evaluateCloudConsensus,
  scoreHourlyForecast12, findBestDarkWindow, summarize3NightOutlook,
  normalizeChineseCityQuery, hasCjkChars, matchKnownCity, formatReverseGeo
} from './aurora-engine.js';

const MET_CACHE_MAX = 25;
const MET_STALE_MAX_MS = 90 * 60 * 1000;
const metCache = new Map();
const metInflight = new Map();

const safeJson = r => (r && r.ok ? r.json().catch(() => null) : Promise.resolve(null));
const safeText = r => (r && r.ok ? r.text().catch(() => null) : Promise.resolve(null));

/** Timeout + parent-AbortSignal protected fetch so a hung TCP socket never freezes the UI */
export async function fetchWithTimeout(url, { timeoutMs = 7500, signal = null, fetchImpl = fetch, ...opts } = {}) {
  const ctrl = new AbortController();
  const onParentAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onParentAbort);
  }
}

function setMetCacheLru(key, entry) {
  if (metCache.has(key)) metCache.delete(key);
  metCache.set(key, entry);
  while (metCache.size > MET_CACHE_MAX) {
    const oldest = metCache.keys().next().value;
    metCache.delete(oldest);
  }
}

/** Bounded LRU + inflight-deduped MET Norway 2.5km point forecast */
export async function fetchMetNorwayPoint(lat, lon, signal) {
  const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const nowMs = Date.now();
  const cached = metCache.get(k);
  if (cached && nowMs < cached.expiresAt) {
    setMetCacheLru(k, cached);
    return cached.data;
  }
  if (metInflight.has(k)) return metInflight.get(k);

  const reqPromise = (async () => {
    try {
      const r = await fetchWithTimeout(
        `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`,
        { timeoutMs: 7000, signal }
      );
      if (!r || !r.ok) {
        return (cached && nowMs - cached.ts < MET_STALE_MAX_MS) ? cached.data : null;
      }
      const data = await r.json().catch(() => null);
      if (!data?.properties?.timeseries?.length) {
        return (cached && nowMs - cached.ts < MET_STALE_MAX_MS) ? cached.data : null;
      }
      const expHdr = Date.parse(r.headers?.get?.('Expires') || '');
      const expiresAt = Number.isFinite(expHdr)
        ? Math.max(nowMs + 5 * 60 * 1000, Math.min(nowMs + 30 * 60 * 1000, expHdr))
        : nowMs + 15 * 60 * 1000;
      setMetCacheLru(k, { ts: nowMs, expiresAt, data });
      return data;
    } catch {
      return (cached && nowMs - cached.ts < MET_STALE_MAX_MS) ? cached.data : null;
    } finally {
      metInflight.delete(k);
    }
  })();

  metInflight.set(k, reqPromise);
  return reqPromise;
}

/** Background 6h-cached WSA-ENLIL CME/HSS forecast (non-blocking) */
export async function fetchEnlilBackground() {
  try {
    const r = await fetchWithTimeout('https://services.swpc.noaa.gov/json/enlil_time_series.json', { timeoutMs: 12000 });
    const json = await safeJson(r);
    return json ? parseEnlilForecast(json, Date.now()) : null;
  } catch {
    return null;
  }
}

/** Track 1: 13 parallel fault-isolated NOAA SWPC space-weather endpoints */
export async function fetchNoaaBundle({ pos, now, signal, cachedEnlil = null, isCurrent = () => true, onProgress = null }) {
  const res = {
    bz: null, speed: null, kp: null, ovation: null, hpiGw: null,
    goesSub: null, noaaScales: null, geo1h: null, noaaAlert: null,
    kyotoDst: null, propSw: null, enlilForecast: cachedEnlil,
    noaaOk: false, magSeries: [], windSeries: [], kpForecast: [], noaaLagMin: null
  };
  try {
    const [mR, wR, k1R, oR, hpiR, g1R, g2R, kfcR, scR, geoR, alR, dstR, propR] = await Promise.all([
      fetchWithTimeout('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', { timeoutMs: 10000, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/json/goes/primary/magnetometers-6-hour.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/json/goes/secondary/magnetometers-6-hour.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-scales.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/json/geospace/geospace_pred_est_kp_1_hour.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/products/alerts.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/products/kyoto-dst.json', { timeoutMs: 7500, signal }).catch(() => null),
      fetchWithTimeout('https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json', { timeoutMs: 7500, signal }).catch(() => null)
    ]);
    const [mJ, wJ, k1J, ovJson, hpiTxt, g1J, g2J, kfcJ, scJ, geoJ, alJ, dstJ, propJ] = await Promise.all([
      safeJson(mR), safeJson(wR), safeJson(k1R), safeJson(oR), safeText(hpiR),
      safeJson(g1R), safeJson(g2R), safeJson(kfcR), safeJson(scR), safeJson(geoR), safeJson(alR),
      safeJson(dstR), safeJson(propR)
    ]);
    if (!isCurrent()) return res;

    const nowMs = now.getTime();
    if (mJ) res.magSeries = parseMagSeries(mJ, 180);
    if (wJ) res.windSeries = parseWindSeries(wJ, 180);
    if (kfcJ) res.kpForecast = parseKpForecast(kfcJ);
    if (scJ) res.noaaScales = parseNoaaGeomagneticScales(scJ);
    if (geoJ) res.geo1h = parseGeospacePredKp1h(geoJ, nowMs);
    if (alJ) res.noaaAlert = parseNoaaAlerts(alJ, nowMs);
    if (dstJ) res.kyotoDst = parseKyotoDst(dstJ, nowMs);
    if (propJ) res.propSw = parsePropagatedSolarWind(propJ, nowMs);

    const lastMag = res.magSeries.length ? res.magSeries[res.magSeries.length - 1] : null;
    const wind = res.windSeries.length ? res.windSeries[res.windSeries.length - 1] : null;
    let kpObj = k1J ? parseLatestKp(k1J) : null;
    if (!kpObj) {
      const k3R = await fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { timeoutMs: 6500, signal }).catch(() => null);
      const k3J = await safeJson(k3R);
      if (!isCurrent()) return res;
      if (k3J) kpObj = parseLatestKp(k3J);
    }

    const hpiObj = hpiTxt ? parseHemiPower(hpiTxt, pos.lat) : null;
    res.goesSub = mergeGoesSubstorm(
      g1J ? parseGoesSubstorm(g1J, -75, nowMs) : null,
      g2J ? parseGoesSubstorm(g2J, -137, nowMs) : null,
      pos.lon
    );

    if (lastMag) { res.bz = lastMag.bz; res.noaaLagMin = computeDataLagMin(lastMag.time_tag, nowMs); }
    if (wind) res.speed = wind.speed;
    if (kpObj) res.kp = kpObj.kp;
    else if (Number.isFinite(res.geo1h?.nowPredKp)) res.kp = res.geo1h.nowPredKp;
    if (ovJson) res.ovation = lookupOvationProb(ovJson, pos.lat, pos.lon);
    if (hpiObj) res.hpiGw = hpiObj.gw;
    if (lastMag || wind || kpObj || res.ovation !== null || res.geo1h) res.noaaOk = true;

    if (isCurrent() && typeof onProgress === 'function') {
      const progBal = computeBallisticCoupling(res.magSeries, res.windSeries.length ? res.windSeries : res.speed, nowMs, res.propSw?.etaMin ?? null);
      onProgress({
        magSeries: res.magSeries, chartSeries: res.magSeries.slice(-120),
        speed: res.speed, bz: res.bz, hpiGw: res.hpiGw, goesSub: res.goesSub,
        noaaScales: res.noaaScales, noaaAlert: res.noaaAlert, kyotoDst: res.kyotoDst, bal: progBal,
        noaaOk: res.noaaOk, noaaLagMin: res.noaaLagMin, pos
      });
    }
  } catch {}
  return res;
}

/** Track 2: Parallel Elevation + MET Norway 2.5km + 5-point Open-Meteo backfill */
export async function fetchWeatherBundle({ pos, now, signal, isCurrent = () => true }) {
  const out = {
    metOk: false, hereHrs: [], multiDayPts: [], dirResults: [],
    weatherSourceLabel: '氣象', usedMet: false, cloudConsensus: null, resolvedTz: pos.tz
  };
  try {
    const pts = computeCompassPoints(pos.lat, pos.lon, 60);
    const needElev = pts.slice(1).some(p => p.label.includes('60 km'));
    const inNordic = isInNordicMetBox(pos.lat, pos.lon);

    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,weather_code,visibility&timezone=auto&timeformat=unixtime&forecast_days=4`;
    const elevPromise = needElev
      ? fetchWithTimeout(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}`, { timeoutMs: 3500, signal }).then(safeJson).catch(() => null)
      : Promise.resolve(null);
    const omPromise = fetchWithTimeout(omUrl, { timeoutMs: 7500, signal }).then(safeJson).catch(() => null);
    const metPromise = inNordic
      ? Promise.all(pts.map(p => fetchMetNorwayPoint(p.lat, p.lon, signal)))
      : Promise.resolve(null);

    const [elJson, omData, metList] = await Promise.all([elevPromise, omPromise, metPromise]);
    if (!isCurrent()) return out;

    if (Array.isArray(elJson?.elevation)) {
      pts.forEach((pt, i) => { if (i > 0 && Number(elJson.elevation[i]) <= 0) pt.isOcean = true; });
    }
    const omList = omData ? (Array.isArray(omData) ? omData : [omData]) : [];
    if (omList[0]?.timezone) out.resolvedTz = omList[0].timezone;

    const summarizePoint = (pt, hrs) => {
      const distKm = pt.key === 'here' ? 0 : Math.round(computeDistanceKm(pos.lat, pos.lon, pt.lat, pt.lon));
      if (!hrs.length) {
        return { ...pt, distKm, unavailable: true, nowC: null, avg3h: null, min12: null, temp: null, maxPrecip3h: 0, maxWind3h: 0 };
      }
      const first3 = hrs.slice(0, 3);
      const avg3h = Math.round(first3.reduce((s, h) => s + h.block, 0) / first3.length);
      const maxPrecip3h = Math.max(...first3.map(h => Number(h.precip || 0)));
      const maxWind3h = Math.max(...first3.map(h => Number(h.windMs || 0)));
      return {
        ...pt, distKm, unavailable: false, nowC: hrs[0].block, avg3h,
        min12: Math.min(...hrs.map(h => h.block)), temp: hrs[0].temp, maxPrecip3h, maxWind3h
      };
    };

    const metHereHrs = metList?.[0] ? parseMetNorwayHourly12(metList[0], pos.lat, pos.lon, out.resolvedTz, now) : [];
    if (metHereHrs.length) {
      out.usedMet = true; out.metOk = true; out.weatherSourceLabel = 'Yr.no官方';
      out.hereHrs = metHereHrs;
      out.multiDayPts = parseMetNorwayMultiDay(metList[0], pos.lat, pos.lon, out.resolvedTz, now);
      pts.forEach((pt, i) => {
        let hrs = i === 0
          ? metHereHrs
          : (metList[i] ? parseMetNorwayHourly12(metList[i], pt.lat, pt.lon, out.resolvedTz, now) : []);
        if (!hrs.length && omList[i]?.hourly) {
          const ptTz = omList[i].timezone || out.resolvedTz;
          hrs = parseOpenMeteoHourly12(omList[i].hourly, pt.lat, pt.lon, ptTz, now, omList[i].utc_offset_seconds);
        }
        out.dirResults.push(summarizePoint(pt, hrs));
      });
      if (omList[0]?.hourly) {
        const omHereHrs = parseOpenMeteoHourly12(omList[0].hourly, pos.lat, pos.lon, out.resolvedTz, now, omList[0].utc_offset_seconds);
        out.cloudConsensus = evaluateCloudConsensus(metHereHrs, omHereHrs);
      }
    } else if (omList[0]?.hourly) {
      const omHereHrs = parseOpenMeteoHourly12(omList[0].hourly, pos.lat, pos.lon, out.resolvedTz, now, omList[0].utc_offset_seconds);
      if (omHereHrs.length) {
        out.metOk = true; out.weatherSourceLabel = 'Open-Meteo';
        out.hereHrs = omHereHrs;
        out.multiDayPts = parseOpenMeteoMultiDay(omList[0].hourly, pos.lat, pos.lon, out.resolvedTz, now, omList[0].utc_offset_seconds);
        pts.forEach((pt, i) => {
          const ptTz = omList[i]?.timezone || out.resolvedTz;
          const hrs = i === 0
            ? omHereHrs
            : (omList[i]?.hourly ? parseOpenMeteoHourly12(omList[i].hourly, pt.lat, pt.lon, ptTz, now, omList[i].utc_offset_seconds) : []);
          out.dirResults.push(summarizePoint(pt, hrs));
        });
      }
    }
  } catch {}
  return out;
}

/**
 * Pure forecast assembler: combines live NOAA telemetry & Weather bundle into
 * NOW score, +ETA forward score, 12h scored hours, and 3-Night Outlook.
 */
export function computeLiveSnapshot({ pos, now, noaa, wx, moon }) {
  const {
    magSeries = [], windSeries = [], kpForecast = [], bz = null, speed = null, kp = null,
    ovation = null, hpiGw = null, goesSub = null, noaaScales = null, geo1h = null,
    noaaAlert = null, kyotoDst = null, propSw = null, enlilForecast = null,
    noaaOk = false, noaaLagMin = null
  } = noaa || {};
  const { hereHrs = [], multiDayPts = [], dirResults = [], weatherSourceLabel = '氣象', usedMet = false, cloudConsensus = null } = wx || {};
  const nowMs = now.getTime();
  const bal = computeBallisticCoupling(magSeries, windSeries.length ? windSeries : speed, nowMs, propSw?.etaMin ?? null);
  const c0 = hereHrs[0].block;
  const sunAltNow = computeSolarElevation(now, pos.lat, pos.lon);
  const mltNow = computeMLT(now, pos.lat, pos.lon);
  const predKp1h = geo1h?.maxNext60Kp ?? null;

  const scored12 = scoreHourlyForecast12(hereHrs, {
    lat: pos.lat, lon: pos.lon,
    kpForecast, fallbackKp: kp ?? 0, ovation, hpiGw,
    bz: bal.nowBz ?? bz, nextBz: bal.nextBz, speed,
    newell: bal.nowNewell, nextNewell: bal.nextNewell,
    predKp1h, preconditionedNewell60: bal.avgNewell60,
    substormJumpNt: goesSub ? goesSub.jumpNt : 0,
    pdyn: bal.nowPdyn ?? bal.pdyn, shockJumpNpa: bal.nowShockJumpNpa || bal.shockJumpNpa
  });
  const bestDark = scored12.bestAurora || findBestDarkWindow(hereHrs);
  const selectedHourIdx = bestDark ? Math.max(0, scored12.hours.findIndex(h => h.time === bestDark.time)) : 0;

  // NOW score uses Earth-arriving window (nowBz, nowNewell, nowPdyn) + Kyoto Dst ring current
  const sc = computeAuroraScore({
    lat: pos.lat, lon: pos.lon,
    cloudNow: c0, sunAlt: sunAltNow,
    bz: bal.nowBz ?? bz, speed, kp, ovation,
    hpiGw, substormJumpNt: goesSub ? goesSub.jumpNt : 0,
    pdyn: bal.nowPdyn, shockJumpNpa: bal.nowShockJumpNpa,
    newell: bal.nowNewell, preconditionedNewell60: bal.avgNewell60,
    dst: kyotoDst?.dst ?? null,
    mlt: mltNow, effMoonPct: moon.effMoonPct
  });

  // +ETA Forward score uses incoming L1 wind, symmetric Geospace 1h MHD blend, and blended OVATION
  const nextDt = new Date(nowMs + bal.etaMin * 60000);
  const nextHourIdx = Math.min(hereHrs.length - 1, Math.max(0, Math.round(bal.etaMin / 60)));
  const cNext = hereHrs[nextHourIdx] ? hereHrs[nextHourIdx].block : c0;
  const moonNext = getMoonState(nextDt, pos.lat, pos.lon);
  const mltNext = computeMLT(nextDt, pos.lat, pos.lon);
  const baseKpNext = lookupForecastKp(kpForecast, nextDt, kp ?? 0);
  const surgeNext = (Number.isFinite(bal.nextBz) && bal.nextBz <= -5) || bal.shockActive;
  const kpNext = Number.isFinite(predKp1h)
    ? (surgeNext ? Math.max(baseKpNext, predKp1h) : +(0.70 * predKp1h + 0.30 * baseKpNext).toFixed(2))
    : baseKpNext;
  const absMagNext = Math.abs(computeGeomagneticLat(pos.lat, pos.lon));
  const neededKpNext = requiredKpForMagLat(absMagNext + 2.0 * Math.cos((mltNext - 0.5) * Math.PI / 12));
  const estOvNext = neededKpNext > 1.5
    ? Math.max(0, Math.min(95, (kpNext - neededKpNext + 1.5) * 18))
    : Math.min(95, kpNext * 15);
  const ovNext = ovation !== null ? Math.round(0.65 * ovation + 0.35 * estOvNext) : null;

  const scNext = computeAuroraScore({
    lat: pos.lat, lon: pos.lon,
    cloudNow: cNext, sunAlt: computeSolarElevation(nextDt, pos.lat, pos.lon),
    bz: bal.nextBz ?? bz, speed, kp: kpNext, ovation: ovNext,
    hpiGw, substormJumpNt: goesSub ? Math.round(goesSub.jumpNt * 0.5) : 0,
    pdyn: bal.pdyn, shockJumpNpa: bal.shockJumpNpa,
    newell: bal.nextNewell, preconditionedNewell60: bal.avgNewell60,
    dst: kyotoDst?.dst ?? null,
    mlt: mltNext, effMoonPct: moonNext.effMoonPct
  });

  const nights3 = summarize3NightOutlook({
    cloudPoints: multiDayPts, kpForecast, currentKp: kp,
    lat: pos.lat, lon: pos.lon, timeZone: pos.tz, nowDate: now,
    enlilForecast
  });

  return {
    scoredHours: scored12.hours,
    bestAurora: scored12.bestAurora,
    selectedHourIdx,
    renderState: {
      pos, magSeries, chartSeries: magSeries.slice(-120), speed, bz, kp, ovation, hpiGw, goesSub,
      noaaScales, noaaAlert, kyotoDst, enlilForecast, predKp1h, bal, noaaOk, noaaLagMin, hereHrs, dirResults,
      weatherSourceLabel, usedMet, cloudConsensus, sunAltNow, mltNow, moon, sc, scNext,
      bestDark, nights3, multiDayPts, kpForecast, fetchedAt: now
    }
  };
}

/** Bilingual reverse-geocoding helper (prefers English locality to avoid Simplified Chinese leaks) */
export async function reverseGeocodeBilingual(lat, lon) {
  try {
    const [zhRes, enRes] = await Promise.all([
      fetchWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh-Hant`, { timeoutMs: 4500 }).catch(() => null),
      fetchWithTimeout(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, { timeoutMs: 4500 }).catch(() => null)
    ]);
    const zhJson = await safeJson(zhRes);
    const enJson = await safeJson(enRes);
    const zhName = (zhJson || enJson) ? formatReverseGeo(zhJson || enJson, 'zh', enJson) : null;
    const enName = enJson ? formatReverseGeo(enJson, 'en') : null;
    return { zhName, enName };
  } catch {
    return { zhName: null, enName: null };
  }
}

export async function reverseGeocodeSingle(lat, lon, lang) {
  try {
    const res = await fetchWithTimeout(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
      { timeoutMs: 4000 }
    );
    const enJson = await safeJson(res);
    if (!enJson) return null;
    return lang === 'en' ? formatReverseGeo(enJson, 'en') : formatReverseGeo(enJson, 'zh', enJson);
  } catch {
    return null;
  }
}

/** Search city by Chinese alias or Latin spelling via Open-Meteo geocoding */
export async function geocodeCityQuery(rawQuery) {
  const qNorm = normalizeChineseCityQuery(rawQuery);
  const queryLang = hasCjkChars(qNorm) ? 'zh' : 'en';
  let r = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(qNorm)}&count=1&language=${queryLang}`,
    { timeoutMs: 4500 }
  );
  let d = await safeJson(r);
  if (!d?.results?.length && queryLang === 'zh') {
    r = await fetchWithTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(qNorm)}&count=1&language=en`,
      { timeoutMs: 4500 }
    );
    d = await safeJson(r);
  }
  if (!d?.results?.length) return null;
  const g = d.results[0];
  const matched = matchKnownCity(g.latitude, g.longitude);
  const fallbackZh = (g.country && g.country !== g.name) ? `${g.country}・${g.name}` : g.name;
  const fallbackEn = (g.country && g.country !== g.name) ? `${g.country} · ${g.name}` : g.name;
  return {
    name: matched ? matched.zh : fallbackZh,
    nameEn: matched ? matched.en : (hasCjkChars(fallbackEn) ? `${g.latitude.toFixed(2)}°, ${g.longitude.toFixed(2)}°` : fallbackEn),
    lat: g.latitude,
    lon: g.longitude,
    tz: g.timezone || matched?.tz || 'UTC',
    mode: 'manual',
    accuracy: null
  };
}
