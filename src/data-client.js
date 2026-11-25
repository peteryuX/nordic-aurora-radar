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
  findNearestMetarStation, parseIemMetarCurrent, parseMetNorwayMetarText,
  assimilateMetarNowcast, selectOpenMeteoModels, extractOpenMeteoModelHourly, blendHourlyForecasts,
  scoreHourlyForecast12, findBestDarkWindow, summarize3NightOutlook,
  normalizeChineseCityQuery, hasCjkChars, matchKnownCity, formatReverseGeo
} from './aurora-engine.js';

const MET_CACHE_MAX = 25;
const MET_STALE_MAX_MS = 90 * 60 * 1000;
const metCache = new Map();
const metInflight = new Map();
const metarCache = new Map();
const METAR_CACHE_TTL_MS = 10 * 60 * 1000;

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

// Global planetary NOAA cache (2-min TTL): switching cities reuses the 5.6 MB global telemetry in 0ms / 0KB
const NOAA_GLOBAL_TTL_MS = 2 * 60 * 1000;
let noaaRawCache = null;

/** Track 1: 13 parallel fault-isolated NOAA SWPC space-weather endpoints (+ 1 background cached WSA-ENLIL = 14 total) */
export async function fetchNoaaBundle({ pos, now, signal, cachedEnlil = null, force = false, isCurrent = () => true, onProgress = null }) {
  const res = {
    bz: null, speed: null, kp: null, ovation: null, hpiGw: null,
    goesSub: null, noaaScales: null, geo1h: null, noaaAlert: null,
    kyotoDst: null, propSw: null, enlilForecast: cachedEnlil,
    noaaOk: false, magSeries: [], windSeries: [], kpForecast: [], noaaLagMin: null
  };
  try {
    const nowMs = now.getTime();
    let raw = null;
    if (!force && noaaRawCache && (nowMs - noaaRawCache.ts) < NOAA_GLOBAL_TTL_MS) {
      raw = noaaRawCache.raw;
    } else {
      const [mR, wR, k1R, oR, hpiR, g1R, g2R, kfcR, scR, geoR, alR, dstR, propR] = await Promise.all([
        fetchWithTimeout('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', { timeoutMs: 6500, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json', { timeoutMs: 6500, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', { timeoutMs: 5500, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', { timeoutMs: 6500, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/json/goes/primary/magnetometers-6-hour.json', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/json/goes/secondary/magnetometers-6-hour.json', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { timeoutMs: 5500, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-scales.json', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/json/geospace/geospace_pred_est_kp_1_hour.json', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/products/alerts.json', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/products/kyoto-dst.json', { timeoutMs: 4200, signal }).catch(() => null),
        fetchWithTimeout('https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json', { timeoutMs: 4200, signal }).catch(() => null)
      ]);
      const [mJ, wJ, k1J, ovJson, hpiTxt, g1J, g2J, kfcJ, scJ, geoJ, alJ, dstJ, propJ] = await Promise.all([
        safeJson(mR), safeJson(wR), safeJson(k1R), safeJson(oR), safeText(hpiR),
        safeJson(g1R), safeJson(g2R), safeJson(kfcR), safeJson(scR), safeJson(geoR), safeJson(alR),
        safeJson(dstR), safeJson(propR)
      ]);
      if (!isCurrent()) return res;

      let kpObj = k1J ? parseLatestKp(k1J) : null;
      if (!kpObj) {
        const k3R = await fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { timeoutMs: 4500, signal }).catch(() => null);
        const k3J = await safeJson(k3R);
        if (!isCurrent()) return res;
        if (k3J) kpObj = parseLatestKp(k3J);
      }

      const prevRaw = (noaaRawCache && (nowMs - noaaRawCache.ts) <= 15 * 60 * 1000) ? noaaRawCache.raw : null;
      const freshMag = mJ ? parseMagSeries(mJ, 180) : [];
      const freshWind = wJ ? parseWindSeries(wJ, 180) : [];
      const freshKfc = kfcJ ? parseKpForecast(kfcJ) : [];
      raw = {
        magSeries: freshMag.length ? freshMag : (prevRaw?.magSeries || []),
        windSeries: freshWind.length ? freshWind : (prevRaw?.windSeries || []),
        kpForecast: freshKfc.length ? freshKfc : (prevRaw?.kpForecast || []),
        noaaScales: (scJ ? parseNoaaGeomagneticScales(scJ) : null) || prevRaw?.noaaScales || null,
        geo1h: (geoJ ? parseGeospacePredKp1h(geoJ, nowMs) : null) || prevRaw?.geo1h || null,
        noaaAlert: (alJ ? parseNoaaAlerts(alJ, nowMs) : null) || prevRaw?.noaaAlert || null,
        kyotoDst: (dstJ ? parseKyotoDst(dstJ, nowMs) : null) || prevRaw?.kyotoDst || null,
        propSw: (propJ ? parsePropagatedSolarWind(propJ, nowMs) : null) || prevRaw?.propSw || null,
        kpObj: kpObj || prevRaw?.kpObj || null,
        ovJson: ovJson || noaaRawCache?.raw?.ovJson || null,
        hpiTxt: hpiTxt || prevRaw?.hpiTxt || null,
        g1Sub: (g1J ? parseGoesSubstorm(g1J, -75, nowMs) : null) || prevRaw?.g1Sub || null,
        g2Sub: (g2J ? parseGoesSubstorm(g2J, -137, nowMs) : null) || prevRaw?.g2Sub || null
      };
      if (raw.magSeries.length || raw.windSeries.length || raw.kpObj || raw.ovJson || raw.geo1h) {
        noaaRawCache = { ts: nowMs, raw };
      }
    }

    res.magSeries = raw.magSeries;
    res.windSeries = raw.windSeries;
    res.kpForecast = raw.kpForecast;
    res.noaaScales = raw.noaaScales;
    res.geo1h = raw.geo1h;
    res.noaaAlert = raw.noaaAlert;
    res.kyotoDst = raw.kyotoDst;
    res.propSw = raw.propSw;

    const lastMag = res.magSeries.length ? res.magSeries[res.magSeries.length - 1] : null;
    const wind = res.windSeries.length ? res.windSeries[res.windSeries.length - 1] : null;
    const hpiObj = raw.hpiTxt ? parseHemiPower(raw.hpiTxt, pos.lat) : null;
    res.goesSub = mergeGoesSubstorm(raw.g1Sub, raw.g2Sub, pos.lon);

    if (lastMag) { res.bz = lastMag.bz; res.noaaLagMin = computeDataLagMin(lastMag.time_tag, nowMs); }
    if (wind) res.speed = wind.speed;
    if (raw.kpObj) res.kp = raw.kpObj.kp;
    else if (Number.isFinite(res.geo1h?.nowPredKp)) res.kp = res.geo1h.nowPredKp;
    if (raw.ovJson) res.ovation = lookupOvationProb(raw.ovJson, pos.lat, pos.lon);
    if (hpiObj) res.hpiGw = hpiObj.gw;
    if (lastMag || wind || raw.kpObj || res.ovation !== null || res.geo1h) res.noaaOk = true;

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

/** Fault-isolated live airport METAR laser ceilometer fetch (10-min TTL + 60-min stale-on-error fallback, zero blocking) */
export async function fetchLiveMetar(station, nowMs = Date.now(), signal = null) {
  if (!station?.icao) return null;
  const cached = metarCache.get(station.icao);
  if (cached && nowMs - cached.ts < METAR_CACHE_TTL_MS && Number.isFinite(cached.obs?.obsMs)) {
    const liveAge = Math.max(0, Math.round((nowMs - cached.obs.obsMs) / 60000));
    if (liveAge <= 90) return { ...cached.obs, ageMin: liveAge };
  }

  let obs = null;
  try {
    // Norwegian airports: prefer official MET Norway tafmetar (zero extra host), fallback to IEM
    if (station.icao.startsWith('EN')) {
      const r = await fetchWithTimeout(
        `https://api.met.no/weatherapi/tafmetar/1.0/metar.txt?icao=${encodeURIComponent(station.icao)}`,
        { timeoutMs: 3200, signal }
      ).catch(() => null);
      const txt = await safeText(r);
      if (txt) obs = parseMetNorwayMetarText(txt, nowMs);
    }
    if (!obs && station.iemId) {
      const r = await fetchWithTimeout(
        `https://mesonet.agron.iastate.edu/api/1/currents.json?station=${encodeURIComponent(station.iemId)}`,
        { timeoutMs: 3200, signal }
      ).catch(() => null);
      const j = await safeJson(r);
      if (j) obs = parseIemMetarCurrent(j, nowMs);
    }
  } catch {}

  if (obs) {
    if (metarCache.size >= 16) metarCache.delete(metarCache.keys().next().value);
    metarCache.set(station.icao, { ts: nowMs, obs });
    return obs;
  }
  // Stale-on-error fallback: preserve real observation age so Daley OI decays smoothly instead of snapping scores
  if (cached && Number.isFinite(cached.obs?.obsMs)) {
    const liveAge = Math.max(0, Math.round((nowMs - cached.obs.obsMs) / 60000));
    if (liveAge <= 60) return { ...cached.obs, ageMin: liveAge };
  }
  return null;
}

/** Track 2: Parallel Elevation + MET Norway 2.5km + Dual-Model Open-Meteo + Live Airport METAR Ceilometer */
export async function fetchWeatherBundle({ pos, now, signal, isCurrent = () => true }) {
  const out = {
    metOk: false, hereHrs: [], multiDayPts: [], dirResults: [],
    weatherSourceLabel: '氣象', usedMet: false, cloudConsensus: null, resolvedTz: pos.tz,
    metarObs: null, metarFusion: null
  };
  try {
    const pts = computeCompassPoints(pos.lat, pos.lon, 60);
    const needElev = pts.slice(1).some(p => p.label.includes('60 km'));
    const inNordic = isInNordicMetBox(pos.lat, pos.lon);
    const dualModels = selectOpenMeteoModels(pos.lat, pos.lon);
    const nearMetar = findNearestMetarStation(pos.lat, pos.lon, 55);

    // Inside Nordics, request independent ecmwf_ifs025 from Open-Meteo (instead of best_match, which mirrors MET Nordic)
    const modelParam = dualModels ? `&models=${dualModels.join(',')}` : (inNordic ? '&models=ecmwf_ifs025' : '');
    const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,weather_code,visibility&timezone=auto&timeformat=unixtime&forecast_days=4${modelParam}`;
    const elevPromise = needElev
      ? fetchWithTimeout(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}`, { timeoutMs: 3500, signal }).then(safeJson).catch(() => null)
      : Promise.resolve(null);
    const omPromise = fetchWithTimeout(omUrl, { timeoutMs: 7500, signal }).then(safeJson).catch(() => null);
    const metPromise = inNordic
      ? Promise.all(pts.map(p => fetchMetNorwayPoint(p.lat, p.lon, signal)))
      : Promise.resolve(null);
    const metarPromise = nearMetar
      ? fetchLiveMetar(nearMetar, now.getTime(), signal).catch(() => null)
      : Promise.resolve(null);

    const [elJson, omData, metList, metarRaw] = await Promise.all([elevPromise, omPromise, metPromise, metarPromise]);
    if (!isCurrent()) return out;

    if (Array.isArray(elJson?.elevation)) {
      pts.forEach((pt, i) => { if (i > 0 && Number(elJson.elevation[i]) <= 0) pt.isOcean = true; });
    }
    const omList = omData ? (Array.isArray(omData) ? omData : [omData]) : [];
    if (omList[0]?.timezone) {
      out.resolvedTz = omList[0].timezone;
    } else if (out.resolvedTz === 'auto' && inNordic) {
      // Fallback IANA timezone inside Nordic MET box when Open-Meteo fails (Finland EET/EEST vs Norway/Sweden CET/CEST)
      out.resolvedTz = (pos.lon >= 20.6 && pos.lat < 69.15 && pos.lat >= 59.5) ? 'Europe/Helsinki' : 'Europe/Oslo';
    }

    const parseOmPoint = (omObj, lat, lon, ptTz, horizon = 12) => {
      if (!omObj?.hourly) return { hrs: [], multiDay: [], hrs1: [], hrs2: [] };
      if (dualModels) {
        const h1 = extractOpenMeteoModelHourly(omObj.hourly, dualModels[0]);
        const h2 = extractOpenMeteoModelHourly(omObj.hourly, dualModels[1]);
        const hrs1 = h1 ? parseOpenMeteoHourly12(h1, lat, lon, ptTz, now, omObj.utc_offset_seconds, horizon) : [];
        const hrs2 = h2 ? parseOpenMeteoHourly12(h2, lat, lon, ptTz, now, omObj.utc_offset_seconds, horizon) : [];
        if (hrs1.length || hrs2.length) {
          const md1 = h1 ? parseOpenMeteoMultiDay(h1, lat, lon, ptTz, now, omObj.utc_offset_seconds) : [];
          const md2 = h2 ? parseOpenMeteoMultiDay(h2, lat, lon, ptTz, now, omObj.utc_offset_seconds) : [];
          return {
            hrs: blendHourlyForecasts(hrs1, hrs2),
            multiDay: blendHourlyForecasts(md1, md2),
            hrs1, hrs2
          };
        }
      }
      const hrs = parseOpenMeteoHourly12(omObj.hourly, lat, lon, ptTz, now, omObj.utc_offset_seconds, horizon);
      const multiDay = parseOpenMeteoMultiDay(omObj.hourly, lat, lon, ptTz, now, omObj.utc_offset_seconds);
      return { hrs, multiDay, hrs1: hrs, hrs2: [] };
    };

    const summarizePoint = (pt, hrs) => {
      const distKm = pt.key === 'here' ? 0 : Math.round(computeDistanceKm(pos.lat, pos.lon, pt.lat, pt.lon));
      if (!hrs.length) {
        return { ...pt, distKm, unavailable: true, nowC: null, avg3h: null, min12: null, temp: null, maxPrecip3h: 0, maxWind3h: 0 };
      }
      const first3 = hrs.slice(0, 3);
      const first12 = hrs.slice(0, 12);
      const avg3h = Math.round(first3.reduce((s, h) => s + h.block, 0) / first3.length);
      const maxPrecip3h = Math.max(...first3.map(h => Number(h.precip || 0)));
      const maxWind3h = Math.max(...first3.map(h => Number(h.windMs || 0)));
      return {
        ...pt, distKm, unavailable: false, nowC: hrs[0].block, avg3h,
        min12: Math.min(...first12.map(h => h.block)), temp: hrs[0].temp, maxPrecip3h, maxWind3h
      };
    };

    const dirHrsList = [];
    const metHereHrs = metList?.[0] ? parseMetNorwayHourly12(metList[0], pos.lat, pos.lon, out.resolvedTz, now, 24) : [];
    if (metHereHrs.length) {
      out.usedMet = true; out.metOk = true; out.weatherSourceLabel = 'Yr.no 官方';
      out.hereHrs = metHereHrs;
      let metMulti = parseMetNorwayMultiDay(metList[0], pos.lat, pos.lon, out.resolvedTz, now);
      if (omList[0]?.hourly) {
        const omHere = parseOmPoint(omList[0], pos.lat, pos.lon, out.resolvedTz, 24);
        if (omHere.hrs.length) {
          out.cloudConsensus = evaluateCloudConsensus(metHereHrs.slice(0, 12), omHere.hrs.slice(0, 12));
          // Preserve 2.5km MEPS fjord rain-shadow precision at +0..2h normally;
          // if live local airport METAR (<=25km) proves ECMWF is >=20 pts closer to actual sky than Yr.no, apply 50/50 damping over +0..5h before Daley OI
          if (out.cloudConsensus?.level === 'low') {
            const metarConfirmsEcmwf = Boolean(
              metarRaw && nearMetar && nearMetar.distKm <= 25 && (metarRaw.ageMin ?? 99) <= 60 &&
              Number.isFinite(metarRaw.effCloud) &&
              Number.isFinite(metHereHrs[0]?.block) && Number.isFinite(omHere.hrs[0]?.block) &&
              (Math.abs(metarRaw.effCloud - metHereHrs[0].block) - Math.abs(metarRaw.effCloud - omHere.hrs[0].block)) >= 20
            );
            out.hereHrs = metHereHrs.map((h, idx) => {
              if (!metarConfirmsEcmwf && idx < 3) return h;
              if (!Number.isFinite(h?.dtMs) || !Number.isFinite(h?.block)) return h;
              const omM = omHere.hrs.find(s => s && Number.isFinite(s.dtMs) && Math.abs(s.dtMs - h.dtMs) <= 15 * 60000);
              if (!omM || !Number.isFinite(omM.block)) return h;
              const omW = (metarConfirmsEcmwf && idx <= 5) ? 0.50 : 0.25;
              const block = Math.max(0, Math.min(100, Math.round((1 - omW) * h.block + omW * omM.block)));
              const clear = 100 - block;
              let txt = h.txt;
              if (!h.isDay && txt !== undefined) {
                const pr = Number(h.precip || 0);
                const tp = Number(h.temp || 0);
                txt = pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (block <= 25 ? '🌟 晴' : block <= 65 ? '⛅ 縫' : '☁️ 陰');
              }
              return { ...h, block, clear, ...(txt !== undefined ? { txt } : {}) };
            });
          }
        }
        // Backfill MET Norway's coarse 6h steps after +48h with hourly ECMWF points so Night +2 gets true 1h resolution
        if (omHere.multiDay.length && metMulti.some(p => (p.stepHrs || 1) > 1)) {
          const fineMet = metMulti.filter(p => (p.stepHrs || 1) <= 1);
          const lastFineMs = fineMet.length ? fineMet[fineMet.length - 1].dtMs : -Infinity;
          const tailOm = omHere.multiDay.filter(p => Number.isFinite(p?.dtMs) && p.dtMs > lastFineMs + 30 * 60000);
          if (tailOm.length) metMulti = [...fineMet, ...tailOm];
        }
      }
      out.multiDayPts = metMulti;
      pts.forEach((pt, i) => {
        let hrs = i === 0
          ? out.hereHrs
          : (metList[i] ? parseMetNorwayHourly12(metList[i], pt.lat, pt.lon, out.resolvedTz, now, 12) : []);
        if (!hrs.length && omList[i]?.hourly) {
          const ptTz = omList[i].timezone || out.resolvedTz;
          hrs = parseOmPoint(omList[i], pt.lat, pt.lon, ptTz, 12).hrs;
        }
        dirHrsList.push(hrs);
        out.dirResults.push(summarizePoint(pt, hrs));
      });
    } else if (omList[0]?.hourly) {
      const p0 = parseOmPoint(omList[0], pos.lat, pos.lon, out.resolvedTz, 24);
      if (p0.hrs.length) {
        out.metOk = true;
        out.weatherSourceLabel = p0.hrs1.length && p0.hrs2.length
          ? (dualModels?.[1] === 'icon_seamless' ? 'Open-Meteo+ICON' : 'Open-Meteo+ECMWF')
          : (inNordic ? 'ECMWF' : 'Open-Meteo');
        out.hereHrs = p0.hrs;
        out.multiDayPts = p0.multiDay;
        if (p0.hrs1.length && p0.hrs2.length) {
          out.cloudConsensus = evaluateCloudConsensus(p0.hrs1.slice(0, 12), p0.hrs2.slice(0, 12));
        }
        pts.forEach((pt, i) => {
          const ptTz = omList[i]?.timezone || out.resolvedTz;
          const hrs = i === 0 ? p0.hrs : parseOmPoint(omList[i], pt.lat, pt.lon, ptTz, 12).hrs;
          dirHrsList.push(hrs);
          out.dirResults.push(summarizePoint(pt, hrs));
        });
      }
    }

    // Causal Optimal Interpolation with nearby live Airport METAR Laser Ceilometer (+0h..+3h)
    if (metarRaw && nearMetar && out.hereHrs.length) {
      const fusion = assimilateMetarNowcast(out.hereHrs, metarRaw, nearMetar.distKm);
      if (fusion.applied) {
        out.hereHrs = fusion.hours;
        out.metarObs = { ...metarRaw, name: nearMetar.name, distKm: nearMetar.distKm };
        out.metarFusion = fusion;
        // Keep Tonight's multiDayPts synced with METAR-fused +0..3h cloud values
        if (out.multiDayPts.length) {
          const fusedHead = out.hereHrs.slice(0, 4).filter(h => Number.isFinite(h?.dtMs));
          out.multiDayPts = out.multiDayPts.map(p => {
            const m = fusedHead.find(h => Math.abs(h.dtMs - p.dtMs) <= 15 * 60000);
            return m ? { ...p, block: m.block, clear: m.clear } : p;
          });
        }
        if (out.dirResults[0]) {
          out.dirResults[0] = summarizePoint(pts[0], out.hereHrs);
        }
        // Only apply airport METAR OI to same-basin corridors (<=20 km); never smear coastal stratus across fjord rain shadows
        for (let i = 1; i < pts.length; i++) {
          if (!dirHrsList[i]?.length || pts[i]?.isOcean) continue;
          const dMetar = computeDistanceKm(pts[i].lat, pts[i].lon, nearMetar.lat, nearMetar.lon);
          if (Number.isFinite(dMetar) && dMetar <= 20) {
            const cFus = assimilateMetarNowcast(dirHrsList[i], metarRaw, dMetar);
            if (cFus.applied) out.dirResults[i] = summarizePoint(pts[i], cFus.hours);
          }
        }
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
  const {
    hereHrs = [], multiDayPts = [], dirResults = [], weatherSourceLabel = '氣象',
    usedMet = false, cloudConsensus = null, metarObs = null, metarFusion = null
  } = wx || {};
  const nowMs = now.getTime();
  const bal = computeBallisticCoupling(magSeries, windSeries.length ? windSeries : speed, nowMs, propSw?.etaMin ?? null);
  const c0 = hereHrs[0].block;
  const sunAltNow = computeSolarElevation(now, pos.lat, pos.lon);
  const mltNow = computeMLT(now, pos.lat, pos.lon);
  const predKp1h = geo1h?.maxNext60Kp ?? null;
  const dstVal = kyotoDst?.dst ?? null;

  const scored12 = scoreHourlyForecast12(hereHrs, {
    lat: pos.lat, lon: pos.lon,
    kpForecast, fallbackKp: kp ?? 0, ovation, hpiGw,
    bz: bal.nowBz ?? bz, nextBz: bal.nextBz, speed,
    newell: bal.nowNewell, nextNewell: bal.nextNewell,
    predKp1h, preconditionedNewell60: bal.avgNewell60,
    nextPreconditionedNewell60: bal.nextAvgNewell60 ?? bal.avgNewell60,
    substormJumpNt: goesSub ? goesSub.jumpNt : 0,
    pdyn: bal.nowPdyn, nextPdyn: bal.pdyn,
    shockJumpNpa: bal.nowShockJumpNpa, nextShockJumpNpa: bal.shockJumpNpa,
    dst: dstVal,
    nowOverride: { sunAlt: sunAltNow, moon, mlt: mltNow }
  });
  const bestDark = scored12.bestTonight || scored12.bestAurora || findBestDarkWindow(hereHrs);
  const selectedHourIdx = bestDark
    ? Math.max(0, scored12.hours.findIndex(h => (Number.isFinite(bestDark.dtMs) && Number.isFinite(h.dtMs)) ? h.dtMs === bestDark.dtMs : h.time === bestDark.time))
    : 0;

  // NOW score uses Earth-arriving window (nowBz, nowNewell, nowPdyn) + Kyoto Dst ring current
  const sc = computeAuroraScore({
    lat: pos.lat, lon: pos.lon,
    cloudNow: c0, sunAlt: sunAltNow,
    bz: bal.nowBz ?? bz, speed, kp, ovation,
    hpiGw, substormJumpNt: goesSub ? goesSub.jumpNt : 0,
    pdyn: bal.nowPdyn, shockJumpNpa: bal.nowShockJumpNpa,
    newell: bal.nowNewell, preconditionedNewell60: bal.avgNewell60,
    dst: dstVal,
    mlt: mltNow, effMoonPct: moon.effMoonPct
  });

  // +ETA Forward score uses incoming L1 wind, symmetric Geospace 1h MHD blend, and nearest cloud hour
  const nextDt = new Date(nowMs + bal.etaMin * 60000);
  const nextTargetMs = nextDt.getTime();
  let nextHourIdx = 0;
  let bestDtDiff = Infinity;
  for (let i = 0; i < hereHrs.length; i++) {
    const dtMs = hereHrs[i]?.dtMs;
    if (!Number.isFinite(dtMs)) continue;
    const d = Math.abs(dtMs - nextTargetMs);
    if (d < bestDtDiff) { bestDtDiff = d; nextHourIdx = i; }
  }
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
    newell: bal.nextNewell, preconditionedNewell60: bal.nextAvgNewell60 ?? bal.avgNewell60,
    dst: dstVal,
    mlt: mltNext, effMoonPct: moonNext.effMoonPct
  });

  const nights3 = summarize3NightOutlook({
    cloudPoints: multiDayPts, kpForecast, currentKp: kp,
    lat: pos.lat, lon: pos.lon, timeZone: pos.tz, nowDate: now,
    enlilForecast, chartHours: scored12.hours
  });

  return {
    scoredHours: scored12.hours,
    bestAurora: scored12.bestAurora,
    selectedHourIdx,
    renderState: {
      pos, magSeries, chartSeries: magSeries.slice(-120), speed, bz, kp, ovation, hpiGw, goesSub,
      noaaScales, noaaAlert, kyotoDst, enlilForecast, predKp1h, bal, noaaOk, noaaLagMin, hereHrs, dirResults,
      weatherSourceLabel, usedMet, cloudConsensus, metarObs, metarFusion, sunAltNow, mltNow, moon, sc, scNext,
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
    if (lang === 'en') {
      const res = await fetchWithTimeout(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
        { timeoutMs: 4000 }
      );
      const enJson = await safeJson(res);
      return enJson ? formatReverseGeo(enJson, 'en') : null;
    }
    const { zhName } = await reverseGeocodeBilingual(lat, lon);
    return zhName;
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
  const fallbackZh = (g.country && g.country !== g.name) ? `${g.country} · ${g.name}` : g.name;
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
