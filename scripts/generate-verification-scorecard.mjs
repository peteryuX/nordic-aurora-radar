/**
 * Daily Automated 30-Day Independent Instrument Verification Scorecard Generator
 *
 * Blind, zero-circularity scientific verification against independent public instruments:
 *   1. Cloud Forecast Audit (9 Global Aurora Airports):
 *      - Independent ground truth: AviationWeather.gov / IEM official airport METAR laser ceilometers
 *      - Evaluated model: RAW layered effective cloud (MET Norway 2.5 km + Open-Meteo dual-model,
 *        strictly BEFORE any METAR assimilation -> zero target leakage) vs Raw Total Cloud baseline
 *      - Prospective rolling ledger (verification/ledger.json): locks +3h / +6h / +12h forecasts
 *        at t0 and grades them prospectively on subsequent runs against historical IEM METAR
 *        alongside Naive Persistence (obs(t0)).
 *   2. Geomagnetic Activity Audit (30-Day Rolling):
 *      - Independent ground truth: GFZ Potsdam 30-minute Hp30 index (rolling 30 days)
 *      - Evaluated predictor: Pure L1 solar-wind Newell coupling (strictly stripping Kp & Dst!)
 *      - Enforces strict small-sample guard (<5 active events -> rocAuc: null, never inflated).
 *
 * Atomic publish: NEVER overwrites verification/latest.json if upstream feeds fail or yield NaN.
 * Run: node scripts/generate-verification-scorecard.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '../src/aurora-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERIF_DIR = path.join(ROOT, 'verification');
const LEDGER_PATH = path.join(VERIF_DIR, 'ledger.json');
const LATEST_PATH = path.join(VERIF_DIR, 'latest.json');

const UA = 'NordicAuroraRadar-DailyVerify/1.0 (https://github.com/peteryuX/nordic-aurora-radar)';

const AIRPORTS = [
  { icao: 'ENTC', name: 'Tromsø',      lat: 69.6833, lon: 18.9189, nordic: true  },
  { icao: 'ENAT', name: 'Alta',        lat: 69.9761, lon: 23.3717, nordic: true  },
  { icao: 'ESNQ', name: 'Kiruna',      lat: 67.8219, lon: 20.3368, nordic: true  },
  { icao: 'EFRO', name: 'Rovaniemi',   lat: 66.5648, lon: 25.8304, nordic: true  },
  { icao: 'BIRK', name: 'Reykjavik',   lat: 64.1300, lon: -21.9406, nordic: false },
  { icao: 'PAFA', name: 'Fairbanks',   lat: 64.8151, lon: -147.8563, nordic: false },
  { icao: 'CYZF', name: 'Yellowknife', lat: 62.4628, lon: -114.4403, nordic: false },
  { icao: 'NZQN', name: 'Queenstown',  lat: -45.0211, lon: 168.7392, nordic: false },
  { icao: 'YMHB', name: 'Hobart',      lat: -42.8361, lon: 147.5103, nordic: false }
];

async function fetchJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchText(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function metarObservedCloudPct(m) {
  const coverMap = { CLR: 0, SKC: 0, CAVOK: 0, NCD: 0, NSC: 0, FEW: 19, SCT: 44, BKN: 75, OVC: 100, OVX: 100 };
  let pct = coverMap[String(m.cover || '').toUpperCase()];
  if (pct === undefined) pct = 0;
  if (Array.isArray(m.clouds) && m.clouds.length) {
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

function parseRawMetarCloudPct(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (/\b(CAVOK|SKC|CLR|NCD|NSC)\b/.test(raw)) return 0;
  const coverMap = { FEW: 19, SCT: 44, BKN: 75, OVC: 100, VV: 100 };
  const matches = [...raw.matchAll(/\b(FEW|SCT|BKN|OVC|VV)(\d{3})\b/g)];
  if (!matches.length) return null;
  let trans = 1;
  for (const m of matches) {
    const frac = (coverMap[m[1]] ?? 0) / 100;
    const baseFt = Number(m[2]) * 100;
    const wt = baseFt >= 20000 ? 0.30 : 1.0;
    trans *= (1 - frac * wt);
  }
  let pct = Math.round(100 * (1 - trans));
  if (/\b(FG|FZFG)\b/.test(raw)) pct = Math.max(pct, 90);
  return Math.max(0, Math.min(100, pct));
}

function calcRocAuc(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 10) return null;
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
  if (nPos < 5 || nNeg < 5) return null;
  return +((sumRankPos - nPos * (nPos + 1) / 2) / (nPos * nNeg)).toFixed(3);
}

function loadLedger() {
  try {
    if (fs.existsSync(LEDGER_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return {
          cloudPending: Array.isArray(parsed.cloudPending) ? parsed.cloudPending : [],
          cloudGraded: Array.isArray(parsed.cloudGraded) ? parsed.cloudGraded : [],
          cloudZeroLead: Array.isArray(parsed.cloudZeroLead) ? parsed.cloudZeroLead : [],
          l1Graded: Array.isArray(parsed.l1Graded) ? parsed.l1Graded : []
        };
      }
    }
  } catch {}
  return { cloudPending: [], cloudGraded: [], cloudZeroLead: [], l1Graded: [] };
}

async function fetchRawNwpForecast(ap) {
  const results = [];
  if (ap.nordic) {
    try {
      const j = await fetchJson(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${ap.lat.toFixed(4)}&lon=${ap.lon.toFixed(4)}`, 12000);
      const ts = j?.properties?.timeseries;
      if (Array.isArray(ts)) {
        for (const row of ts.slice(0, 16)) {
          const dtMs = Date.parse(row.time);
          const d = row?.data?.instant?.details;
          if (!Number.isFinite(dtMs) || !d) continue;
          const total = Number(d.cloud_area_fraction ?? 0);
          const eff = api.computeEffectiveCloud(
            d.cloud_area_fraction_low ?? total,
            d.cloud_area_fraction_medium ?? total * 0.5,
            d.cloud_area_fraction_high ?? 0,
            d.fog_area_fraction ?? 0,
            total
          );
          results.push({ dtMs, effCloud: Math.round(eff), rawTotal: Math.round(total) });
        }
        if (results.length) return results;
      }
    } catch {}
  }
  const om = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${ap.lat.toFixed(4)}&longitude=${ap.lon.toFixed(4)}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&forecast_days=2&timezone=GMT`,
    12000
  );
  const times = om?.hourly?.time;
  if (!Array.isArray(times)) return [];
  for (let i = 0; i < Math.min(48, times.length); i++) {
    const dtMs = Date.parse(times[i] + 'Z');
    const total = Number(om.hourly.cloud_cover?.[i] ?? 0);
    const eff = api.computeEffectiveCloud(
      om.hourly.cloud_cover_low?.[i] ?? total,
      om.hourly.cloud_cover_mid?.[i] ?? total * 0.5,
      om.hourly.cloud_cover_high?.[i] ?? 0,
      0,
      total
    );
    results.push({ dtMs, effCloud: Math.round(eff), rawTotal: Math.round(total) });
  }
  return results;
}

async function fetchIemHistoricalMetar(icao, startMs, endMs) {
  const s = new Date(startMs - 30 * 60000);
  const e = new Date(endMs + 30 * 60000);
  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${icao}&data=metar&year1=${s.getUTCFullYear()}&month1=${s.getUTCMonth() + 1}&day1=${s.getUTCDate()}&year2=${e.getUTCFullYear()}&month2=${e.getUTCMonth() + 1}&day2=${e.getUTCDate()}&tz=Etc%2FUTC&format=onlycomma&latlon=no&elev=no&missing=M&trace=T&direct=no&report_type=3&report_type=4`;
  const txt = await fetchText(url, 15000);
  const obs = [];
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const idx1 = line.indexOf(',');
    const idx2 = line.indexOf(',', idx1 + 1);
    if (idx1 < 0 || idx2 < 0) continue;
    const tsStr = line.slice(idx1 + 1, idx2).trim().replace(' ', 'T') + 'Z';
    const raw = line.slice(idx2 + 1).trim();
    const dtMs = Date.parse(tsStr);
    const cloud = parseRawMetarCloudPct(raw);
    if (Number.isFinite(dtMs) && cloud !== null) obs.push({ dtMs, cloud });
  }
  return obs;
}

async function run() {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const cutoff30d = nowMs - 30 * 86400000;
  const ledger = loadLedger();

  // ---- TRACK A: Independent 9-Airport METAR Laser Ceilometer Verification ----
  let liveMetars = [];
  try {
    const ids = AIRPORTS.map(a => a.icao).join(',');
    const arr = await fetchJson(`https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`, 15000);
    if (Array.isArray(arr)) liveMetars = arr;
  } catch (e) {
    console.warn('[warn] AviationWeather METAR fetch failed:', e.message);
  }
  const metarByIcao = new Map();
  for (const m of liveMetars) {
    const id = String(m.icaoId || '').toUpperCase();
    if (!id) continue;
    const obsMs = Number.isFinite(m.obsTime) ? m.obsTime * 1000 : Date.parse(m.reportTime || '');
    if (!Number.isFinite(obsMs)) continue;
    const prev = metarByIcao.get(id);
    if (!prev || obsMs > prev.obsMs) {
      metarByIcao.set(id, { obsMs, cloud: metarObservedCloudPct(m) });
    }
  }

  // 1. Grade any previously locked prospective forecasts (+3h/+6h/+12h) whose valid time has passed!
  const dueByIcao = new Map();
  const stillPending = [];
  for (const item of ledger.cloudPending) {
    if (!item || !Number.isFinite(item.validMs)) continue;
    if (item.validMs < cutoff30d) continue;
    if (item.validMs <= nowMs - 20 * 60000) {
      if (!dueByIcao.has(item.icao)) dueByIcao.set(item.icao, []);
      dueByIcao.get(item.icao).push(item);
    } else {
      stillPending.push(item);
    }
  }
  for (const [icao, items] of dueByIcao.entries()) {
    const minMs = Math.min(...items.map(x => x.validMs));
    const maxMs = Math.max(...items.map(x => x.validMs));
    let hist = [];
    try {
      hist = await fetchIemHistoricalMetar(icao, minMs, maxMs);
    } catch {}
    for (const it of items) {
      let best = null, bestDiff = Infinity;
      for (const h of hist) {
        const d = Math.abs(h.dtMs - it.validMs);
        if (d < bestDiff) { bestDiff = d; best = h; }
      }
      // Strict ±25 min matching rule (never force mismatched timestamps!)
      if (best && bestDiff <= 25 * 60000) {
        ledger.cloudGraded.push({
          icao, leadH: it.leadH, validMs: it.validMs,
          obsCloud: best.cloud,
          effCloud: it.effCloud,
          rawTotal: it.rawTotal,
          persistCloud: it.persistCloud
        });
      }
    }
  }

  // 2. Fetch fresh raw NWP for all 9 airports: log lead=0h snapshot + lock prospective +3h/+6h/+12h forecasts
  let airportsCheckedNow = 0;
  for (const ap of AIRPORTS) {
    const obs = metarByIcao.get(ap.icao);
    if (!obs || Math.abs(nowMs - obs.obsMs) > 90 * 60000) continue;
    let fc = [];
    try {
      fc = await fetchRawNwpForecast(ap);
    } catch { continue; }
    if (!fc.length) continue;
    airportsCheckedNow++;

    // Nearest hour to current METAR obs (strictly raw NWP BEFORE METAR assimilation)
    let f0 = fc[0], f0Diff = Math.abs(fc[0].dtMs - obs.obsMs);
    for (const h of fc) {
      const d = Math.abs(h.dtMs - obs.obsMs);
      if (d < f0Diff) { f0Diff = d; f0 = h; }
    }
    if (f0Diff <= 65 * 60000) {
      ledger.cloudZeroLead.push({
        icao: ap.icao, ts: obs.obsMs,
        obsCloud: obs.cloud, effCloud: f0.effCloud, rawTotal: f0.rawTotal
      });
    }
    // Lock prospective +3h, +6h, +12h forecasts for future grading
    for (const leadH of [3, 6, 12]) {
      const targetMs = nowMs + leadH * 3600000;
      let hit = null, hd = Infinity;
      for (const h of fc) {
        const d = Math.abs(h.dtMs - targetMs);
        if (d < hd) { hd = d; hit = h; }
      }
      if (hit && hd <= 45 * 60000) {
        stillPending.push({
          icao: ap.icao, leadH, issuedMs: nowMs, validMs: hit.dtMs,
          effCloud: hit.effCloud, rawTotal: hit.rawTotal, persistCloud: obs.cloud
        });
      }
    }
  }

  // Trim all rolling ledgers to 30 days
  ledger.cloudPending = stillPending.filter(x => x.validMs >= cutoff30d).slice(-400);
  ledger.cloudGraded = ledger.cloudGraded.filter(x => x.validMs >= cutoff30d).slice(-1200);
  ledger.cloudZeroLead = ledger.cloudZeroLead.filter(x => x.ts >= cutoff30d).slice(-400);

  // Compute cloud stats (prefer prospective graded once >= 12 samples exist, otherwise report zero-lead + prospective counts honestly)
  const useProspective = ledger.cloudGraded.length >= 12;
  const cloudPool = useProspective ? ledger.cloudGraded : ledger.cloudZeroLead;
  let layeredMae = null, rawTotalMae = null, persistMae = null, falseClearRate = null;
  if (cloudPool.length >= 3) {
    let sEff = 0, sRaw = 0, sPers = 0, nPers = 0, fcClearPreds = 0, fcFalseClears = 0;
    for (const r of cloudPool) {
      sEff += Math.abs(r.effCloud - r.obsCloud);
      sRaw += Math.abs(r.rawTotal - r.obsCloud);
      if (Number.isFinite(r.persistCloud)) { sPers += Math.abs(r.persistCloud - r.obsCloud); nPers++; }
      // False-clear trap: model predicts >=65% clear (<=35% cloud) while ceilometer observes >=75% overcast
      if (r.effCloud <= 35) {
        fcClearPreds++;
        if (r.obsCloud >= 75) fcFalseClears++;
      }
    }
    layeredMae = +(sEff / cloudPool.length).toFixed(1);
    rawTotalMae = +(sRaw / cloudPool.length).toFixed(1);
    persistMae = nPers >= 3 ? +(sPers / nPers).toFixed(1) : null;
    falseClearRate = fcClearPreds >= 5 ? +((fcFalseClears / fcClearPreds) * 100).toFixed(1) : null;
  }

  // ---- TRACK B: 30-Day Independent GFZ Potsdam Hp30 + Pure-L1 Solar-Wind Audit ----
  const start30Iso = new Date(cutoff30d).toISOString().slice(0, 19) + 'Z';
  const endNowIso = new Date(nowMs).toISOString().slice(0, 19) + 'Z';
  let gfzHp = null;
  try {
    gfzHp = await fetchJson(`https://kp.gfz.de/app/json/?start=${start30Iso}&end=${endNowIso}&index=Hp30`, 15000);
  } catch (e) {
    console.warn('[warn] GFZ Hp30 fetch failed:', e.message);
  }
  const hpMap = new Map();
  let gfzBins = 0, gfzActive = 0, gfzStorm = 0;
  if (gfzHp && Array.isArray(gfzHp.datetime) && Array.isArray(gfzHp.Hp30)) {
    for (let i = 0; i < gfzHp.datetime.length; i++) {
      const ms = Date.parse(gfzHp.datetime[i]);
      const val = Number(gfzHp.Hp30[i]);
      if (!Number.isFinite(ms) || !Number.isFinite(val)) continue;
      const bin30 = Math.floor(ms / 1800000);
      hpMap.set(bin30, val);
      gfzBins++;
      if (val >= 4.0) gfzActive++;
      if (val >= 5.0) gfzStorm++;
    }
  }

  // Pure L1 RTSW 1m -> ballistic arrival -> match independent GFZ Hp30 bins (strictly zero Kp/Dst leakage!)
  try {
    const [magRaw, windRaw] = await Promise.all([
      fetchJson('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', 12000),
      fetchJson('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json', 12000)
    ]);
    const mag = api.parseMagSeries(magRaw, 1440);
    const wind = api.parseWindSeries(windRaw, 1440);
    const windByMin = new Map();
    for (const w of wind) {
      const mKey = Math.floor(Date.parse(w.time_tag + (w.time_tag.endsWith('Z') ? '' : 'Z')) / 60000);
      if (Number.isFinite(mKey)) windByMin.set(mKey, w.speed);
    }
    const existingBins = new Set(ledger.l1Graded.map(x => x.bin30));
    // Group L1 Newell coupling by arrival 30-min bin
    const arrivalBuckets = new Map();
    for (const pt of mag) {
      const ms = Date.parse(pt.time_tag + (pt.time_tag.endsWith('Z') ? '' : 'Z'));
      if (!Number.isFinite(ms)) continue;
      const spd = windByMin.get(Math.floor(ms / 60000)) || 400;
      const etaMin = api.computeL1EtaMin(spd);
      const arrBin30 = Math.floor((ms + etaMin * 60000) / 1800000);
      const newell = api.computeNewellCoupling(spd, pt.by || 0, pt.bz);
      if (!arrivalBuckets.has(arrBin30)) arrivalBuckets.set(arrBin30, []);
      arrivalBuckets.get(arrBin30).push(newell);
    }
    for (const [bin30, vals] of arrivalBuckets.entries()) {
      if (existingBins.has(bin30) || vals.length < 10 || !hpMap.has(bin30)) continue;
      const avgNewell = vals.reduce((a, b) => a + b, 0) / vals.length;
      const hpVal = hpMap.get(bin30);
      ledger.l1Graded.push({
        bin30,
        ts: bin30 * 1800000,
        newell: +avgNewell.toFixed(0),
        hp30: +hpVal.toFixed(2)
      });
    }
  } catch (e) {
    console.warn('[warn] RTSW L1 fetch failed:', e.message);
  }

  ledger.l1Graded = ledger.l1Graded.filter(x => x.ts >= cutoff30d).slice(-1600);
  const l1Pairs = ledger.l1Graded.map(x => ({ s: x.newell, y: x.hp30 >= 4.0 ? 1 : 0 }));
  const l1PosCount = l1Pairs.reduce((a, p) => a + p.y, 0);
  const l1RocAuc = calcRocAuc(l1Pairs);
  const l1SmallSample = l1PosCount < 5 || l1Pairs.length < 24;

  // Validate before writing (atomic guardrail: never write corrupted / NaN JSON!)
  const hasValidCloud = Number.isFinite(layeredMae);
  const hasValidGeomag = gfzBins >= 200;
  if (!hasValidCloud && !hasValidGeomag) {
    console.error('Aborting publish: neither cloud nor geomagnetic independent feed succeeded.');
    process.exit(1);
  }

  const latest = {
    version: 1,
    generatedAt: nowIso,
    windowDays: 30,
    cloudAudit: {
      mode: useProspective ? 'prospective-lead' : 'raw-nwp-nowcast',
      samples: cloudPool.length,
      prospectiveSamples: ledger.cloudGraded.length,
      pendingProspective: ledger.cloudPending.length,
      airportsCheckedNow,
      layeredMaePct: layeredMae,
      rawTotalMaePct: rawTotalMae,
      persistenceMaePct: persistMae,
      falseClearRatePct: falseClearRate
    },
    geomagAudit: {
      gfzHp30Bins30d: gfzBins,
      activeEvents30d: gfzActive,
      stormEvents30d: gfzStorm,
      l1MatchedBins: l1Pairs.length,
      l1ActiveEvents: l1PosCount,
      l1RocAuc: l1SmallSample ? null : l1RocAuc,
      smallSampleGuard: l1SmallSample
    },
    sources: [
      'AviationWeather.gov & IEM Official Airport METAR Ceilometers (9 stations)',
      'GFZ Potsdam 30-min Hp30 Geomagnetic Index',
      'NOAA SWPC DSCOVR/ACE Real-Time L1 Solar Wind'
    ],
    disclaimerZh: '僅驗證原始數值預報雲量與地磁擾動準度（對照當地氣象觀測站雷射測雲儀與 GFZ Hp30），非單點肉眼極光保證。',
    disclaimerEn: 'Verifies raw NWP cloud forecasts and geomagnetic activity against independent airport METAR ceilometers and GFZ Hp30 — not a local naked-eye visibility guarantee.'
  };

  const jsonStr = JSON.stringify(latest, null, 2);
  if (/\bNaN\b|\bInfinity\b/.test(jsonStr)) {
    throw new Error('Validation failed: NaN/Infinity detected in scorecard payload');
  }

  fs.mkdirSync(VERIF_DIR, { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n', 'utf8');
  fs.writeFileSync(LATEST_PATH, jsonStr + '\n', 'utf8');
  console.log('Generated verification/latest.json:');
  console.log(jsonStr);
}

run().catch(err => {
  console.error('Verification scorecard error:', err);
  process.exit(1);
});
