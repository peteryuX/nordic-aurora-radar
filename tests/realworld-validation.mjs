/**
 * Nordic Aurora Radar — Independent Real-World Public-Data Validation Suite
 *
 * Blind, out-of-sample scientific audit against FOUR independent official public archives
 * (ZERO hand-crafted scenarios, ZERO overfitting):
 *   1. NASA CDAWeb HAPI OMNI2_H0_MRG1HR (Full continuous 2024–2025: ~17,255 real hours of
 *      L1 solar wind + Arctic ground magnetometer Auroral Electrojet AE/AL + Kp + Dst)
 *   2. GFZ Potsdam Hp30 (30-minute high-resolution planetary geomagnetic index)
 *   3. NOAA SWPC Official Propagated Solar Wind (bow-shock arrival ETA cross-check)
 *   4. AviationWeather.gov Official Airport METAR Ceilometers (9 Arctic & global aurora
 *      airports: live observed sky cover vs MET Norway & Open-Meteo layered cloud forecasts)
 *
 * Run: node tests/realworld-validation.mjs
 */

import * as api from '../src/aurora-engine.js';

const UA = 'NordicAuroraRadar-Validation/2.0 (https://github.com/peteryuX/nordic-aurora-radar)';

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function calcRocAuc(pairs) {
  const sorted = [...pairs].sort((a, b) => a.s - b.s);
  let nPos = 0, nNeg = 0, sumRankPos = 0;
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j < sorted.length && sorted[j].s === sorted[i].s) j++;
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k].y) { nPos++; sumRankPos += avgRank; }
      else nNeg++;
    }
    i = j;
  }
  return (nPos && nNeg) ? (sumRankPos - nPos * (nPos + 1) / 2) / (nPos * nNeg) : NaN;
}

function calcSpearman(xs, ys) {
  const rank = (arr) => {
    const idx = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const r = new Array(arr.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j < idx.length && idx[j].v === idx[i].v) j++;
      const avg = (i + j + 1) / 2;
      for (let k = i; k < j; k++) r[idx[k].i] = avg;
      i = j;
    }
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const n = xs.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return (dx > 0 && dy > 0) ? num / Math.sqrt(dx * dy) : NaN;
}

/** Convert standard aviation METAR sky cover & weather phenomena to observed optical sky obscuration (0-100%) */
function metarObservedCloudPct(m) {
  const coverMap = { CLR: 0, SKC: 0, CAVOK: 0, NCD: 0, NSC: 0, FEW: 19, SCT: 44, BKN: 75, OVC: 100, OVX: 100 };
  let pct = coverMap[String(m.cover || '').toUpperCase()];
  if (pct === undefined) pct = 0;
  if (Array.isArray(m.clouds) && m.clouds.length) {
    // Low/mid clouds (< 20,000 ft) weigh 100%; high cirrus (>= 20,000 ft) weighs 30%
    let trans = 1;
    for (const c of m.clouds) {
      const frac = (coverMap[String(c.cover || '').toUpperCase()] ?? 0) / 100;
      const baseFt = Number(c.base);
      const wt = (Number.isFinite(baseFt) && baseFt >= 20000) ? 0.30 : 1.0;
      trans *= (1 - frac * wt);
    }
    pct = Math.round(100 * (1 - trans));
  }
  const wx = String(m.wxString || '');
  if (/\b(FG|FZFG|OVX)\b/.test(wx)) pct = Math.max(pct, 90);
  else if (/\b(\+?SN|BLSN|SHSN|RA|SHRA)\b/.test(wx)) pct = Math.max(pct, 60);
  return Math.max(0, Math.min(100, pct));
}

console.log('\n====================================================================');
console.log('  NORDIC AURORA RADAR — INDEPENDENT REAL-WORLD PUBLIC-DATA AUDIT');
console.log('====================================================================');

let failed = false;

// ---------------------------------------------------------------------------
// [1] NASA CDAWeb HAPI OMNI2_H0_MRG1HR — Full Continuous 2024–2025 (~17,255h)
// ---------------------------------------------------------------------------
console.log('\n[1] NASA CDAWeb OMNI2 Full 2024–2025 Continuous Blind Backtest (Zero Fitting)');
const omniYears = [2024, 2025];
const omniRows = [];
for (const yr of omniYears) {
  const url = `https://cdaweb.gsfc.nasa.gov/hapi/data?id=OMNI2_H0_MRG1HR&parameters=BY_GSM1800,BZ_GSM1800,N1800,V1800,Pressure1800,KP1800,DST1800,AE1800,AL_INDEX1800&time.min=${yr}-01-01T00:00:00Z&time.max=${yr}-12-31T23:00:00Z&format=json`;
  const j = await fetchJson(url, 20000);
  if (Array.isArray(j?.data)) omniRows.push(...j.data);
}

const l1Scores = [], fusedScores = [], aes = [], kps = [];
const l1VsAe300 = [], l1VsAe500 = [], l1VsKp4 = [], fusedVsAe300 = [], fusedVsAe500 = [];
const osloStormVsQuiet = [], hobartStormVsQuiet = [];
const omniByIsoHour = new Map();
const tierBins = [
  { name: '0–17  (Quiet)', lo: 0, hi: 17, n: 0, ae300: 0, ae500: 0, sumAe: 0, sumKp: 0 },
  { name: '18–39 (Fair) ', lo: 18, hi: 39, n: 0, ae300: 0, ae500: 0, sumAe: 0, sumKp: 0 },
  { name: '40–64 (Good) ', lo: 40, hi: 64, n: 0, ae300: 0, ae500: 0, sumAe: 0, sumKp: 0 },
  { name: '65–99 (Prime)', lo: 65, hi: 99, n: 0, ae300: 0, ae500: 0, sumAe: 0, sumKp: 0 }
];

let prevNw = 0;
for (const row of omniRows) {
  const [t, by, bz, n, v, p, kp10, dst, ae] = row;
  if (bz > 900 || by > 900 || v > 9000 || n > 900 || p > 90 || kp10 > 95 || Math.abs(dst) > 9000 || ae > 9000) continue;
  const kp = kp10 / 10;
  const nw = api.computeNewellCoupling(v, by, bz);

  // Pure L1-only (blind: NO Kp, NO Dst, NO OVATION, NO HPI)
  const scL1 = api.computeAuroraScore({
    lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -20,
    bz, speed: v, kp: 0, ovation: null, hpiGw: null, newell: nw,
    preconditionedNewell60: prevNw, pdyn: p, mlt: 0, effMoonPct: 0
  });
  // Fused (L1 + Kp + Kyoto Dst)
  const scFused = api.computeAuroraScore({
    lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -20,
    bz, speed: v, kp, ovation: null, hpiGw: null, newell: nw,
    preconditionedNewell60: prevNw, pdyn: p, dst, mlt: 0, effMoonPct: 0
  });

  // Mid-latitude real storm (Dst <= -100 nT) vs quiet (Dst > -20 & Kp <= 2) discrimination
  if (dst <= -100 || (dst > -20 && kp <= 2.0)) {
    const isIntenseStorm = dst <= -100;
    const scOslo = api.computeAuroraScore({
      lat: 59.91, lon: 10.75, cloudNow: 0, sunAlt: -20,
      bz, speed: v, kp, ovation: null, hpiGw: null, newell: nw,
      preconditionedNewell60: prevNw, pdyn: p, dst, mlt: 0, effMoonPct: 0
    });
    const scHobart = api.computeAuroraScore({
      lat: -42.88, lon: 147.33, cloudNow: 0, sunAlt: -20,
      bz, speed: v, kp, ovation: null, hpiGw: null, newell: nw,
      preconditionedNewell60: prevNw, pdyn: p, dst, mlt: 0, effMoonPct: 0
    });
    osloStormVsQuiet.push({ s: scOslo.total, y: isIntenseStorm });
    hobartStormVsQuiet.push({ s: scHobart.total, y: isIntenseStorm });
  }

  omniByIsoHour.set(String(t).slice(0, 13), { nw, scL1: scL1.total, v, bz, by });
  prevNw = nw;

  l1Scores.push(scL1.total); fusedScores.push(scFused.total);
  aes.push(ae); kps.push(kp);
  l1VsAe300.push({ s: scL1.total, y: ae >= 300 });
  l1VsAe500.push({ s: scL1.total, y: ae >= 500 });
  l1VsKp4.push({ s: scL1.total, y: kp >= 4.0 });
  fusedVsAe300.push({ s: scFused.total, y: ae >= 300 });
  fusedVsAe500.push({ s: scFused.total, y: ae >= 500 });

  const b = tierBins.find(x => scFused.total >= x.lo && scFused.total <= x.hi);
  if (b) { b.n++; if (ae >= 300) b.ae300++; if (ae >= 500) b.ae500++; b.sumAe += ae; b.sumKp += kp; }
}

const aucL1Ae300 = calcRocAuc(l1VsAe300);
const aucL1Ae500 = calcRocAuc(l1VsAe500);
const aucL1Kp4 = calcRocAuc(l1VsKp4);
const aucFusedAe300 = calcRocAuc(fusedVsAe300);
const aucFusedAe500 = calcRocAuc(fusedVsAe500);
const rhoL1Ae = calcSpearman(l1Scores, aes);
const rhoFusedAe = calcSpearman(fusedScores, aes);
const aucOsloStorm = calcRocAuc(osloStormVsQuiet);
const aucHobartStorm = calcRocAuc(hobartStormVsQuiet);

console.log(`  Valid Continuous Hours      : N=${l1Scores.length.toLocaleString()} (2024–2025 NASA OMNI2)`);
console.log(`  Pure L1-only vs AE >= 300nT : ROC-AUC=${aucL1Ae300.toFixed(4)} | Spearman ρ=${rhoL1Ae.toFixed(4)}`);
console.log(`  Pure L1-only vs AE >= 500nT : ROC-AUC=${aucL1Ae500.toFixed(4)} | vs Kp>=4.0 AUC=${aucL1Kp4.toFixed(4)}`);
console.log(`  Fused(L1+Kp+Dst) vs AE>=300 : ROC-AUC=${aucFusedAe300.toFixed(4)} | Spearman ρ=${rhoFusedAe.toFixed(4)}`);
console.log(`  Fused(L1+Kp+Dst) vs AE>=500 : ROC-AUC=${aucFusedAe500.toFixed(4)}`);
console.log(`  Mid-Lat Intense Storm (Dst<=-100 vs Quiet) : Oslo AUC=${aucOsloStorm.toFixed(4)} | Hobart AUC=${aucHobartStorm.toFixed(4)}`);
console.log('\n  Empirical Ground-Truth Reliability by UI Score Tier (Alta dark clear sky):');
console.log('  Score Tier    |     N | Mean AE | AE>=300 nT | AE>=500 nT | Mean Kp');
console.log('  --------------+-------+---------+------------+------------+--------');
let prevMeanAe = -1;
for (const b of tierBins) {
  if (!b.n) continue;
  const meanAe = b.sumAe / b.n;
  console.log(`  ${b.name} | ${String(b.n).padStart(5)} | ${String(Math.round(meanAe)).padStart(4)} nT | ${(100 * b.ae300 / b.n).toFixed(1).padStart(9)}% | ${(100 * b.ae500 / b.n).toFixed(1).padStart(9)}% | ${(b.sumKp / b.n).toFixed(2).padStart(6)}`);
  if (meanAe <= prevMeanAe) { console.error('FAIL: Empirical Mean AE not strictly monotonic across UI score tiers!'); failed = true; }
  prevMeanAe = meanAe;
}

if (aucL1Ae500 < 0.85 || aucFusedAe300 < 0.88 || aucFusedAe500 < 0.90) {
  console.error('FAIL: Out-of-sample NASA OMNI2 ROC-AUC fell below physical skill floor!');
  failed = true;
}

// ---------------------------------------------------------------------------
// [2] GFZ Potsdam Hp30 (30-min High-Res Geomagnetic Index — 2024 Storm + Quiet)
// ---------------------------------------------------------------------------
console.log('\n[2] GFZ Potsdam Hp30 (30-min Planetary Index vs Pure L1 Coupling)');
try {
  // Sample 3 full diverse months: May 2024 (G5 Gannon), Oct 2024 (G4), Feb 2025 (winter quiet/moderate)
  const windows = [
    ['2024-05-01T00:00:00Z', '2024-05-31T23:30:00Z'],
    ['2024-10-01T00:00:00Z', '2024-10-31T23:30:00Z'],
    ['2025-02-01T00:00:00Z', '2025-02-28T23:30:00Z']
  ];
  const hpPairs4 = [], hpPairs5 = [], hpXs = [], hpYs = [];
  for (const [start, end] of windows) {
    const j = await fetchJson(`https://kp.gfz-potsdam.de/app/json/?start=${start}&end=${end}&index=Hp30`, 15000);
    const dts = j?.datetime || [], vals = j?.Hp30 || [];
    for (let i = 0; i < dts.length; i++) {
      const hrKey = String(dts[i]).slice(0, 13);
      const omni = omniByIsoHour.get(hrKey);
      const hp = Number(vals[i]);
      if (!omni || !Number.isFinite(hp)) continue;
      hpXs.push(omni.scL1); hpYs.push(hp);
      hpPairs4.push({ s: omni.scL1, y: hp >= 4.0 });
      hpPairs5.push({ s: omni.scL1, y: hp >= 5.0 });
    }
  }
  const aucHp4 = calcRocAuc(hpPairs4);
  const aucHp5 = calcRocAuc(hpPairs5);
  const rhoHp = calcSpearman(hpXs, hpYs);
  console.log(`  Matched 30-min Windows      : N=${hpXs.length.toLocaleString()} (May 2024 + Oct 2024 + Feb 2025)`);
  console.log(`  Pure L1-only vs Hp30 >= 4.0 : ROC-AUC=${aucHp4.toFixed(4)} | Spearman ρ=${rhoHp.toFixed(4)}`);
  console.log(`  Pure L1-only vs Hp30 >= 5.0 : ROC-AUC=${aucHp5.toFixed(4)}`);
  if (aucHp5 < 0.80) { console.error('FAIL: Pure L1 vs GFZ Hp30>=5.0 ROC-AUC below 0.80!'); failed = true; }
} catch (e) {
  console.log(`  GFZ Potsdam Hp30 unavailable: ${e.message}`);
}

// ---------------------------------------------------------------------------
// [3] NOAA SWPC Live Propagated Solar Wind, Kyoto Dst & WSA-ENLIL Cross-Check
// ---------------------------------------------------------------------------
console.log('\n[3] Live NOAA Propagated Solar Wind, Kyoto Dst & WSA-ENLIL Audit');
try {
  const [propJson, dstJson, enlilJson, magJson, windJson] = await Promise.all([
    fetchJson('https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json'),
    fetchJson('https://services.swpc.noaa.gov/products/kyoto-dst.json'),
    fetchJson('https://services.swpc.noaa.gov/json/enlil_time_series.json', 20000),
    fetchJson('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
    fetchJson('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json')
  ]);
  const prop = api.parsePropagatedSolarWind(propJson, Date.now());
  const dst = api.parseKyotoDst(dstJson, Date.now());
  const enlil = api.parseEnlilForecast(enlilJson, Date.now());
  const mag = api.parseMagSeries(magJson, 180);
  const wind = api.parseWindSeries(windJson, 180);
  const balBase = api.computeBallisticCoupling(mag, wind, Date.now(), null);
  const balSynced = api.computeBallisticCoupling(mag, wind, Date.now(), prop?.etaMin ?? null);

  console.log(`  NOAA Propagated SW ETA      : ${prop ? `${prop.etaMin} min (v=${prop.speed} km/s, Bz=${prop.bz} nT)` : 'N/A'}`);
  console.log(`  Engine ETA (Fixed vs Synced): fixed=${balBase.etaMin} min | NOAA-synced=${balSynced.etaMin} min (|Δ|=${prop ? Math.abs(balSynced.etaMin - prop.etaMin) : '--'} min)`);
  console.log(`  Kyoto WDC Live Dst          : ${dst ? `${dst.dst} nT (6h min=${dst.min6h} nT, class=${dst.stormClass})` : 'N/A'}`);
  console.log(`  WSA-ENLIL 96h MHD Forecast  : ${enlil ? `maxV=${enlil.maxSpeed} km/s, maxN=${enlil.maxDensity} p/cc, CME=${enlil.hasCme}` : 'N/A'}`);
  if (!prop || !dst || !enlil) { console.error('FAIL: One of the new NOAA live parsers returned null on live feed!'); failed = true; }
} catch (e) {
  console.log(`  NOAA live cross-check error: ${e.message}`);
}

// ---------------------------------------------------------------------------
// [4] Live Airport METAR Ceilometer Ground-Truth Cloud Validation (9 Airports)
// ---------------------------------------------------------------------------
console.log('\n[4] Live Airport METAR Ceilometer Ground-Truth vs Layered Cloud Forecasts');
const AIRPORTS = [
  { icao: 'ENAT', city: 'Alta', lat: 69.976, lon: 23.372, tz: 'Europe/Oslo', nordic: true },
  { icao: 'ENTC', city: 'Tromsø', lat: 69.683, lon: 18.919, tz: 'Europe/Oslo', nordic: true },
  { icao: 'ESNQ', city: 'Kiruna', lat: 67.822, lon: 20.337, tz: 'Europe/Stockholm', nordic: true },
  { icao: 'EFRO', city: 'Rovaniemi', lat: 66.565, lon: 25.830, tz: 'Europe/Helsinki', nordic: true },
  { icao: 'BIRK', city: 'Reykjavik', lat: 64.130, lon: -21.941, tz: 'Atlantic/Reykjavik', nordic: false },
  { icao: 'PAFA', city: 'Fairbanks', lat: 64.815, lon: -147.856, tz: 'America/Anchorage', nordic: false },
  { icao: 'CYZF', city: 'Yellowknife', lat: 62.463, lon: -114.440, tz: 'America/Yellowknife', nordic: false },
  { icao: 'YMHB', city: 'Hobart', lat: -42.836, lon: 147.510, tz: 'Australia/Hobart', nordic: false },
  { icao: 'NZQN', city: 'Queenstown', lat: -45.021, lon: 168.739, tz: 'Pacific/Auckland', nordic: false }
];

try {
  const icaoStr = AIRPORTS.map(a => a.icao).join(',');
  const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${AIRPORTS.map(a => a.lat).join(',')}&longitude=${AIRPORTS.map(a => a.lon).join(',')}&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,weather_code,visibility&timezone=auto&timeformat=unixtime&forecast_days=2`;
  const [metars, omAll, ...metRes] = await Promise.all([
    fetchJson(`https://aviationweather.gov/api/data/metar?ids=${icaoStr}&format=json`),
    fetchJson(omUrl),
    ...AIRPORTS.map(a => a.nordic
      ? fetchJson(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${a.lat.toFixed(4)}&lon=${a.lon.toFixed(4)}`).catch(() => null)
      : Promise.resolve(null))
  ]);
  const metarByIcao = new Map((Array.isArray(metars) ? metars : []).map(m => [m.icaoId, m]));
  const omList = Array.isArray(omAll) ? omAll : [omAll];
  const now = new Date();

  console.log('  ICAO | City        | METAR Obs   | Obs% | App Layered% | Raw Total% | |ΔApp| | |ΔRaw|');
  console.log('  -----+-------------+-------------+------+--------------+------------+--------+-------');
  let sumAppErr = 0, sumRawErr = 0, nAir = 0;
  for (let i = 0; i < AIRPORTS.length; i++) {
    const a = AIRPORTS[i];
    const m = metarByIcao.get(a.icao);
    if (!m) continue;
    const obsPct = metarObservedCloudPct(m);
    const metHrs = metRes[i] ? api.parseMetNorwayHourly12(metRes[i], a.lat, a.lon, a.tz, now) : [];
    const omHrs = omList[i]?.hourly ? api.parseOpenMeteoHourly12(omList[i].hourly, a.lat, a.lon, omList[i].timezone || a.tz, now) : [];
    const appHrs = metHrs.length ? metHrs : omHrs;
    if (!appHrs.length) continue;
    const appPct = appHrs[0].block;
    const rawPct = metRes[i]
      ? Math.round(metRes[i]?.properties?.timeseries?.[0]?.data?.instant?.details?.cloud_area_fraction ?? appPct)
      : Math.round(omList[i]?.hourly?.cloud_cover?.[0] ?? appPct);
    const eApp = Math.abs(appPct - obsPct);
    const eRaw = Math.abs(rawPct - obsPct);
    sumAppErr += eApp; sumRawErr += eRaw; nAir++;
    const obsLabel = `${m.cover || '--'}${m.wxString ? ' ' + m.wxString : ''}`.slice(0, 11);
    console.log(`  ${a.icao} | ${a.city.padEnd(11)} | ${obsLabel.padEnd(11)} | ${String(obsPct).padStart(3)}% | ${String(appPct).padStart(11)}% | ${String(rawPct).padStart(9)}% | ${String(eApp).padStart(5)}% | ${String(eRaw).padStart(5)}%`);
  }
  if (nAir > 0) {
    console.log(`  Summary (N=${nAir} airports)    : App Layered MAE=${(sumAppErr / nAir).toFixed(1)}% vs Raw Total MAE=${(sumRawErr / nAir).toFixed(1)}%`);
  }
} catch (e) {
  console.log(`  METAR live validation error: ${e.message}`);
}

console.log('\n====================================================================\n');
if (failed) process.exit(1);
