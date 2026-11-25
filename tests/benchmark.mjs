/**
 * Nordic Aurora Radar — Quantitative Forecast Quality Benchmark
 *
 * Evaluates our pure scientific engine against:
 *   1. Real historical geomagnetic storms, Nordic substorms, CME onsets & false-alarm traps
 *      (tests/fixtures/historical-events.json) -> Confusion Matrix, FNR, Recall, Precision, F1
 *   2. Independent NASA JPL Horizons DE441 solar & lunar ephemeris ground truth
 *      (tests/fixtures/astronomy-reference.json) -> Max & MAE error in degrees / %
 *   3. Telemetry robustness: 3-point median spike rejection & 60-min substorm preconditioning
 *   4. (When LIVE_TEST=1) Live multi-source cross-validation across 5 Nordic cities
 *      (MET Norway 2.5km vs Open-Meteo, NOAA 1m Kp vs 3h Kp, OVATION grid coverage)
 *
 * Usage:
 *   node tests/benchmark.mjs
 *   LIVE_TEST=1 node tests/benchmark.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '../src/aurora-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HIST_PATH = path.join(__dirname, 'fixtures', 'historical-events.json');
const ASTRO_PATH = path.join(__dirname, 'fixtures', 'astronomy-reference.json');

function pct(num, den) {
  return den > 0 ? `${(100 * num / den).toFixed(1)}%` : 'N/A';
}

function isPredictedVisible(sc) {
  return sc.total >= 18 || sc.grade === '⚡ 雲縫極光' || sc.grade === '🌅 暮光漸暗';
}

function calcMetrics({ tp, fn, tn, fp }) {
  const total = tp + fn + tn + fp;
  const recall = (tp + fn) ? tp / (tp + fn) : 1;
  const fnr = (tp + fn) ? fn / (tp + fn) : 0;
  const specificity = (tn + fp) ? tn / (tn + fp) : 1;
  const precision = (tp + fp) ? tp / (tp + fp) : 1;
  const f1 = (precision + recall) ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = total ? (tp + tn) / total : 1;
  const mccDen = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  const mcc = mccDen > 0 ? (tp * tn - fp * fn) / mccDen : 0;
  return { tp, fn, tn, fp, total, recall, fnr, specificity, precision, f1, accuracy, mcc };
}

function classifyDomainSlice(ev) {
  if (ev.category === 'Partial-Outage') return 'Partial Feed Outages';
  if (['False-Alarm-Trap', 'Low-Lat-Control', 'GOES-Diurnal-Trap'].includes(ev.category)) return 'False-Alarm & Controls';
  if (['Overcast-Block', 'Daylight-Trap', 'Snow-Fog-Trap', 'Broken-Cloud-Storm', 'Twilight-Storm'].includes(ev.category)) return 'Weather & Daylight Traps';
  if (ev.input.lat < 0) return 'Southern Hemisphere';
  if (ev.input.lat >= 62) return 'Arctic Oval';
  return 'Sub-Auroral & Mid-Lat';
}

function calcRocAuc(posScores, negScores) {
  if (!posScores.length || !negScores.length) return 1;
  let wins = 0;
  for (const p of posScores) {
    for (const n of negScores) {
      if (p > n) wins += 1;
      else if (p === n) wins += 0.5;
    }
  }
  return wins / (posScores.length * negScores.length);
}

async function fetchJsonRetry(url, headers, retries = 1) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { headers });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(res => setTimeout(res, 600));
    }
  }
  throw lastErr;
}

export function evaluateHistoricalBenchmark() {
  const data = JSON.parse(fs.readFileSync(HIST_PATH, 'utf8'));
  const vis = { tp: 0, fn: 0, tn: 0, fp: 0 };
  const alrt = { tp: 0, fn: 0, tn: 0, fp: 0 };
  const visMisses = [];
  const alertMisses = [];
  const posScores = [];
  const negScores = [];
  const alertScores = [];
  const fairOnlyScores = [];
  let brierSum = 0;
  let posCount = 0;

  const tiers = [
    { label: '0–17  (Blocked/Quiet)', lo: 0, hi: 17, n: 0, visPos: 0, alrtPos: 0, scoreSum: 0 },
    { label: '18–39 (Fair/Camera)  ', lo: 18, hi: 39, n: 0, visPos: 0, alrtPos: 0, scoreSum: 0 },
    { label: '40–64 (Good)         ', lo: 40, hi: 64, n: 0, visPos: 0, alrtPos: 0, scoreSum: 0 },
    { label: '65–99 (Prime)        ', lo: 65, hi: 99, n: 0, visPos: 0, alrtPos: 0, scoreSum: 0 }
  ];
  const sliceMap = new Map();

  for (const ev of data.events) {
    const sc = api.computeAuroraScore(ev.input);
    const predVis = isPredictedVisible(sc);
    if (ev.expectedVisible && predVis) vis.tp++;
    else if (ev.expectedVisible && !predVis) { vis.fn++; visMisses.push({ type: 'FN', ev, sc }); }
    else if (!ev.expectedVisible && !predVis) vis.tn++;
    else { vis.fp++; visMisses.push({ type: 'FP', ev, sc }); }

    const goesSub = ev.input.substormJumpNt >= 15
      ? { active: true, jumpNt: ev.input.substormJumpNt }
      : { active: false, jumpNt: ev.input.substormJumpNt || 0 };
    const bal = { shockActive: (ev.input.shockJumpNpa || 0) >= 3, etaMin: 35 };
    const alertRes = api.shouldTriggerAuroraAlert({ sc, goesSub, scNext: sc, bal });
    const predAlert = alertRes.fire;
    if (ev.expectedAlert && predAlert) alrt.tp++;
    else if (ev.expectedAlert && !predAlert) { alrt.fn++; alertMisses.push({ type: 'FN', ev, sc, alertRes }); }
    else if (!ev.expectedAlert && !predAlert) alrt.tn++;
    else { alrt.fp++; alertMisses.push({ type: 'FP', ev, sc, alertRes }); }

    // Continuous calibration & separation tracking
    const pProb = sc.total / 99;
    const y = ev.expectedVisible ? 1 : 0;
    brierSum += Math.pow(pProb - y, 2);
    if (ev.expectedVisible) {
      posCount++;
      posScores.push(sc.total);
      if (ev.expectedAlert) alertScores.push(sc.total);
      else fairOnlyScores.push(sc.total);
    } else {
      negScores.push(sc.total);
    }

    const tier = tiers.find(t => sc.total >= t.lo && sc.total <= t.hi);
    if (tier) {
      tier.n++;
      if (ev.expectedVisible) tier.visPos++;
      if (ev.expectedAlert) tier.alrtPos++;
      tier.scoreSum += sc.total;
    }

    const sName = classifyDomainSlice(ev);
    if (!sliceMap.has(sName)) {
      sliceMap.set(sName, { name: sName, tp: 0, fn: 0, tn: 0, fp: 0, posSum: 0, posN: 0, negSum: 0, negN: 0 });
    }
    const sl = sliceMap.get(sName);
    if (ev.expectedVisible) {
      sl.posSum += sc.total; sl.posN++;
      if (predVis) sl.tp++; else sl.fn++;
    } else {
      sl.negSum += sc.total; sl.negN++;
      if (!predVis) sl.tn++; else sl.fp++;
    }
  }

  const N = data.events.length;
  const brier = N ? +(brierSum / N).toFixed(4) : 0;
  const baseRate = N ? posCount / N : 0.5;
  const brierRef = baseRate * (1 - baseRate);
  const bss = brierRef > 0 ? +(1 - brier / brierRef).toFixed(4) : 1;
  const rocAuc = +calcRocAuc(posScores, negScores).toFixed(4);
  const minPos = posScores.length ? Math.min(...posScores) : 0;
  const maxNeg = negScores.length ? Math.max(...negScores) : 0;
  const gapMargin = minPos - maxNeg;
  const meanOf = arr => arr.length ? +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1) : null;

  const slices = [...sliceMap.values()].map(sl => ({
    name: sl.name,
    ...calcMetrics(sl),
    meanPos: sl.posN ? +(sl.posSum / sl.posN).toFixed(1) : null,
    meanNeg: sl.negN ? +(sl.negSum / sl.negN).toFixed(1) : null
  }));

  return {
    visibility: calcMetrics(vis),
    alert: calcMetrics(alrt),
    calibration: {
      brier, bss, rocAuc, minPos, maxNeg, gapMargin,
      meanAlert: meanOf(alertScores),
      meanFairOnly: meanOf(fairOnlyScores),
      meanNeg: meanOf(negScores),
      tiers: tiers.map(t => ({
        label: t.label, n: t.n,
        visRate: t.n ? +(100 * t.visPos / t.n).toFixed(1) : null,
        alertRate: t.n ? +(100 * t.alrtPos / t.n).toFixed(1) : null,
        meanScore: t.n ? +(t.scoreSum / t.n).toFixed(1) : null
      }))
    },
    slices,
    visMisses,
    alertMisses,
    count: N
  };
}

export function evaluateAstronomyBenchmark() {
  const data = JSON.parse(fs.readFileSync(ASTRO_PATH, 'utf8'));
  const rows = [];
  for (const cp of data.checkpoints) {
    const dt = new Date(cp.utc);
    const predSun = api.computeSolarElevation(dt, cp.lat, cp.lon);
    const moon = api.getMoonState(dt, cp.lat, cp.lon);
    const sunErr = Math.abs(predSun - cp.jplSunAltDeg);
    const moonAltErr = Math.abs(moon.altDeg - cp.jplMoonAltDeg);
    const moonPctErr = Math.abs(moon.pct - cp.jplMoonIllumPct);
    rows.push({
      id: cp.id,
      sunPred: +predSun.toFixed(3), sunRef: cp.jplSunAltDeg, sunErr: +sunErr.toFixed(3),
      moonAltPred: +moon.altDeg.toFixed(3), moonAltRef: cp.jplMoonAltDeg, moonAltErr: +moonAltErr.toFixed(3),
      moonPctPred: moon.pct, moonPctRef: cp.jplMoonIllumPct, moonPctErr: +moonPctErr.toFixed(2)
    });
  }
  const stat = key => {
    const vals = rows.map(r => r[key]);
    const maxVal = Math.max(...vals);
    const meanVal = vals.reduce((s, v) => s + v, 0) / vals.length;
    const worst = rows.find(r => r[key] === maxVal);
    return { max: +maxVal.toFixed(3), mae: +meanVal.toFixed(3), worstId: worst?.id };
  };
  return {
    source: data.source,
    count: rows.length,
    sunAlt: stat('sunErr'),
    moonAlt: stat('moonAltErr'),
    moonIllum: stat('moonPctErr'),
    rows
  };
}

export async function evaluateLiveCrossCheck() {
  const hdrs = { 'User-Agent': 'nordic-aurora-radar-benchmark/1.0' };
  const CITIES = [
    { name: 'Alta', lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo' },
    { name: 'Tromsø', lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' },
    { name: 'Abisko', lat: 68.3495, lon: 18.8312, tz: 'Europe/Stockholm' },
    { name: 'Kirkenes', lat: 69.7271, lon: 30.0458, tz: 'Europe/Oslo' },
    { name: 'Rovaniemi', lat: 66.5039, lon: 25.7294, tz: 'Europe/Helsinki' }
  ];
  const now = new Date();
  const [kp1m, kp3h, ov, mag] = await Promise.all([
    fetchJsonRetry('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', hdrs),
    fetchJsonRetry('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', hdrs),
    fetchJsonRetry('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', hdrs),
    fetchJsonRetry('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', hdrs)
  ]);
  const kp1Obj = api.parseLatestKp(kp1m);
  const kp3Obj = api.parseLatestKp(kp3h);
  const magS = api.parseMagSeries(mag, 180);
  const lagMin = magS.length ? api.computeDataLagMin(magS[magS.length - 1].time_tag, now.getTime()) : null;
  const ovCoords = Array.isArray(ov?.coordinates) ? ov.coordinates.length : 0;

  const cityChecks = await Promise.all(CITIES.map(async c => {
    const [metJ, omJ] = await Promise.all([
      fetchJsonRetry(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${c.lat}&lon=${c.lon}`, hdrs),
      fetchJsonRetry(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation,weather_code,visibility&timezone=auto&timeformat=unixtime&forecast_days=2`, hdrs)
    ]);
    const metHrs = api.parseMetNorwayHourly12(metJ, c.lat, c.lon, c.tz, now);
    const omHrs = api.parseOpenMeteoHourly12(omJ.hourly, c.lat, c.lon, c.tz, now, omJ.utc_offset_seconds);
    const cons = api.evaluateCloudConsensus(metHrs, omHrs);
    const metT = +(metHrs.slice(0, 3).reduce((s, h) => s + h.temp, 0) / 3).toFixed(1);
    const omT = +(omHrs.slice(0, 3).reduce((s, h) => s + h.temp, 0) / 3).toFixed(1);
    return {
      name: c.name,
      metCloud3h: cons?.metAvg3h ?? null,
      omCloud3h: cons?.omAvg3h ?? null,
      cloudDiff: cons?.diffPct ?? null,
      consensus: cons?.level ?? 'unknown',
      metTemp3h: metT,
      omTemp3h: omT,
      tempDiff: +Math.abs(metT - omT).toFixed(1)
    };
  }));

  return {
    kp1m: kp1Obj?.kp ?? null,
    kp3h: kp3Obj?.kp ?? null,
    kpDiff: (kp1Obj && kp3Obj) ? +Math.abs(kp1Obj.kp - kp3Obj.kp).toFixed(2) : null,
    ovGridPoints: ovCoords,
    noaaMagLagMin: lagMin,
    cityChecks
  };
}

// CLI Runner
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hist = evaluateHistoricalBenchmark();
  const astro = evaluateAstronomyBenchmark();

  console.log('\n====================================================================');
  console.log('  NORDIC AURORA RADAR — REGRESSION & EPHEMERIS SANITY REPORT');
  console.log('====================================================================\n');

  console.log(`[1] Curated/Synthetic Scenario Regression Guardrails (${hist.count} Cases — NOT Real-World Accuracy)`);
  const v = hist.visibility;
  const cal = hist.calibration;
  console.log(`  Visibility Confusion Matrix : TP=${v.tp}  FN=${v.fn}  TN=${v.tn}  FP=${v.fp}`);
  console.log(`  Recall (Sensitivity)        : ${pct(v.tp, v.tp + v.fn)}  (False Negative Rate: ${pct(v.fn, v.tp + v.fn)})`);
  console.log(`  Specificity (Trap Rejection): ${pct(v.tn, v.tn + v.fp)}  (False Positive Rate: ${pct(v.fp, v.tn + v.fp)})`);
  console.log(`  Precision / F1 / Accuracy   : ${pct(v.tp, v.tp + v.fp)} / ${(v.f1 * 100).toFixed(1)}% / ${pct(v.tp + v.tn, v.total)}`);
  console.log(`  MCC / ROC-AUC / Brier (BSS) : MCC=${v.mcc.toFixed(4)} | AUC=${cal.rocAuc.toFixed(4)} | BS=${cal.brier} (BSS=${cal.bss})`);
  console.log(`  Score Tier Separation       : Alert mean=${cal.meanAlert} | Fair-only mean=${cal.meanFairOnly} | Neg mean=${cal.meanNeg} | Gap(minPos-maxNeg)=${cal.minPos}-${cal.maxNeg} (+${cal.gapMargin})`);
  if (hist.visMisses.length) {
    console.log('  Visibility Misclassifications:');
    for (const m of hist.visMisses) {
      console.log(`    - [${m.type}] ${m.ev.id} (${m.ev.city}): total=${m.sc.total}, aur=${m.sc.auroraScore}, sky=${m.sc.skyScore}, grade=${m.sc.grade}`);
    }
  }

  const a = hist.alert;
  console.log(`\n  Alert Engine Matrix         : TP=${a.tp}  FN=${a.fn}  TN=${a.tn}  FP=${a.fp}`);
  console.log(`  Alert Recall / Spec / MCC   : ${pct(a.tp, a.tp + a.fn)} / ${pct(a.tn, a.tn + a.fp)} / MCC=${a.mcc.toFixed(4)} (Acc: ${pct(a.tp + a.tn, a.total)})`);
  if (hist.alertMisses.length) {
    console.log('  Alert Misclassifications:');
    for (const m of hist.alertMisses) {
      console.log(`    - [${m.type}] ${m.ev.id} (${m.ev.city}): total=${m.sc.total}, fire=${m.alertRes.fire}, reason=${m.alertRes.reason}`);
    }
  }

  console.log('\n  Ordinal Score-Tier Reliability Table:');
  console.log('  Tier                  |  N | MeanScore | Emp. Vis % | Emp. Alert %');
  console.log('  ----------------------+----+-----------+------------+-------------');
  for (const t of cal.tiers) {
    console.log(
      `  ${t.label} | ${String(t.n).padStart(2)} | ${String(t.meanScore ?? '--').padStart(9)} | ${String(t.visRate !== null ? t.visRate + '%' : '--').padStart(10)} | ${String(t.alertRate !== null ? t.alertRate + '%' : '--').padStart(12)}`
    );
  }

  console.log('\n  Stratified Domain Breakdown:');
  console.log('  Domain Slice             |  N | TP/FN/TN/FP | Recall |  Spec  | MeanPos | MeanNeg');
  console.log('  -------------------------+----+-------------+--------+--------+---------+--------');
  for (const s of hist.slices) {
    const rec = s.tp + s.fn ? pct(s.tp, s.tp + s.fn) : '   --';
    const spec = s.tn + s.fp ? pct(s.tn, s.tn + s.fp) : '   --';
    const mat = `${s.tp}/${s.fn}/${s.tn}/${s.fp}`;
    console.log(
      `  ${s.name.padEnd(24)} | ${String(s.total).padStart(2)} | ${mat.padStart(11)} | ${rec.padStart(6)} | ${spec.padStart(6)} | ${String(s.meanPos ?? '--').padStart(7)} | ${String(s.meanNeg ?? '--').padStart(7)}`
    );
  }

  console.log(`\n[2] Independent Astronomy Ephemeris Audit (${astro.count} NASA JPL Horizons DE441 Checkpoints)`);
  console.log(`  Solar Elevation Error       : MAE=${astro.sunAlt.mae}°  Max=${astro.sunAlt.max}° (worst: ${astro.sunAlt.worstId})`);
  console.log(`  Lunar Elevation Error       : MAE=${astro.moonAlt.mae}°  Max=${astro.moonAlt.max}° (worst: ${astro.moonAlt.worstId})`);
  console.log(`  Lunar Illumination Error    : MAE=${astro.moonIllum.mae}%  Max=${astro.moonIllum.max}% (worst: ${astro.moonIllum.worstId})`);

  // Telemetry spike rejection check (interior AND tail spike!)
  const quietWithSpike = Array.from({ length: 80 }, (_, i) => ({
    time_tag: new Date(Date.parse('2026-11-24T20:00:00Z') + i * 60000).toISOString().slice(0, 19),
    bz: (i === 65 || i === 79) ? -45.0 : 1.0,
    by: 0.5
  }));
  const balSpike = api.computeBallisticCoupling(quietWithSpike, 400);
  console.log(`\n[3] Telemetry Robustness (Interior + Latest-Tail 1-min -45 nT Sensor Spike Rejection)`);
  console.log(`  Filtered incoming Bz (true +1.0 nT): ${balSpike.nextBz} nT | cleanLatestBz: ${balSpike.cleanLatestBz} nT`);

  let liveFailed = false;
  if (process.env.LIVE_TEST === '1') {
    console.log('\n[4] Live Multi-Source Cross-Validation (5 Nordic Cities + NOAA)');
    try {
      const live = await evaluateLiveCrossCheck();
      console.log(`  NOAA Kp 1m vs 3h            : 1m=${live.kp1m} vs 3h=${live.kp3h} (|Δ|=${live.kpDiff})`);
      console.log(`  NOAA OVATION Grid / Mag Lag : ${live.ovGridPoints} grid pts | RTSW lag=${live.noaaMagLagMin} min`);
      console.log('  City        | MET 3h Cloud | OM 3h Cloud | |ΔCloud| | Consensus | MET Temp | OM Temp | |ΔTemp|');
      console.log('  ------------+--------------+-------------+----------+-----------+----------+---------+--------');
      for (const c of live.cityChecks) {
        console.log(
          `  ${c.name.padEnd(11)} | ${String(c.metCloud3h + '%').padStart(12)} | ${String(c.omCloud3h + '%').padStart(11)} | ${String(c.cloudDiff + '%').padStart(8)} | ${c.consensus.padEnd(9)} | ${String(c.metTemp3h + '°C').padStart(8)} | ${String(c.omTemp3h + '°C').padStart(7)} | ${String(c.tempDiff + '°C').padStart(6)}`
        );
      }
    } catch (e) {
      liveFailed = true;
      console.error('  Live cross-check error:', e.message);
    }
  }

  console.log('\n====================================================================\n');

  // Strict quality & calibration gate assertions
  const failed = [];
  if (v.fn > 0) failed.push(`Visibility FNR > 0 (${v.fn} false negatives)`);
  if (v.accuracy < 0.95) failed.push(`Visibility accuracy ${(v.accuracy * 100).toFixed(1)}% < 95%`);
  if (v.mcc < 0.90) failed.push(`Visibility MCC ${v.mcc.toFixed(3)} < 0.90`);
  if (a.mcc < 0.88) failed.push(`Alert MCC ${a.mcc.toFixed(3)} < 0.88`);
  if (cal.rocAuc < 0.98) failed.push(`ROC-AUC ${cal.rocAuc} < 0.98`);
  if (cal.brier > 0.14) failed.push(`Brier score ${cal.brier} > 0.14`);
  if (cal.bss < 0.45) failed.push(`Brier skill score ${cal.bss} < 0.45`);
  for (const s of hist.slices) {
    if (s.fn > 0) failed.push(`Slice "${s.name}" has ${s.fn} false negative(s)`);
    if (s.accuracy < 0.90) failed.push(`Slice "${s.name}" accuracy ${(s.accuracy * 100).toFixed(1)}% < 90%`);
  }
  if (astro.sunAlt.max > 0.15) failed.push(`Solar elevation max error ${astro.sunAlt.max}° > 0.15°`);
  if (astro.moonAlt.max > 2.0) failed.push(`Lunar elevation max error ${astro.moonAlt.max}° > 2.0°`);
  if (astro.moonIllum.max > 2.0) failed.push(`Lunar illumination max error ${astro.moonIllum.max}% > 2.0%`);
  if (Math.abs(balSpike.nextBz - 1.0) > 0.05 || Math.abs(balSpike.cleanLatestBz - 1.0) > 0.05) {
    failed.push(`Spike filter failed: nextBz=${balSpike.nextBz}, cleanLatestBz=${balSpike.cleanLatestBz}`);
  }
  if (liveFailed) failed.push('Live cross-check failed');

  if (failed.length) {
    console.error('BENCHMARK QUALITY GATE FAILED:', failed.join('; '));
    process.exit(1);
  }
}
