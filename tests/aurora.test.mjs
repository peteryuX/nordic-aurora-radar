import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as engine from '../src/aurora-engine.js';
import * as charts from '../src/charts.js';
import * as storage from '../src/storage.js';
import * as dataClient from '../src/data-client.js';
import { evaluateHistoricalBenchmark, evaluateAstronomyBenchmark } from './benchmark.mjs';

const api = { ...engine, ...charts };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const allSrcRelFiles = () => fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).sort().map(f => `src/${f}`);

test('1. Solar elevation astronomy matches equinox, midnight sun, and polar night', () => {
  const midnightSun = api.computeSolarElevation(new Date('2026-06-21T00:00:00Z'), 69.97, 23.27);
  assert.ok(midnightSun > 3 && midnightSun < 7, `Expected Alta midnight sun 3..7°, got ${midnightSun}`);

  const polarNight = api.computeSolarElevation(new Date('2026-12-21T11:00:00Z'), 69.97, 23.27);
  assert.ok(polarNight < -2 && polarNight > -6, `Expected Alta polar night noon -6..-2°, got ${polarNight}`);

  const eqNoon = api.computeSolarElevation(new Date('2026-03-20T12:07:00Z'), 0, 0);
  assert.ok(eqNoon > 89, `Expected equator equinox noon >89°, got ${eqNoon}`);
});

test('2. Lunar phase, elevation, and Krisciunas-Schaefer opposition surge illuminance', () => {
  const fullMoon = api.getMoonState(new Date('2026-11-24T14:53:00Z'), 69.97, 23.27);
  assert.ok(fullMoon.pct >= 98, `Expected Full Moon >=98%, got ${fullMoon.pct}`);

  const newMoon = api.getMoonState(new Date('2026-11-09T07:02:00Z'), 69.97, 23.27);
  assert.ok(newMoon.pct <= 2, `Expected New Moon <=2%, got ${newMoon.pct}`);
  if (!newMoon.up) assert.equal(newMoon.effMoonPct, 0);

  // Quarter moon (~50% illuminated) has only ~9% of Full Moon lux due to opposition surge
  const quarter = api.getMoonState(new Date('2026-11-17T06:00:00Z'), 0, 0);
  assert.ok(quarter.pct >= 40 && quarter.pct <= 60, `Quarter moon pct=${quarter.pct}`);
  assert.ok(quarter.effMoonPct <= 18, `Quarter moon effMoonPct should reflect opposition surge (<=18%), got ${quarter.effMoonPct}`);
});

test('3. Layered cloud occlusion handles cirrus, fog, and total-cloud cap', () => {
  assert.equal(api.computeEffectiveCloud(0, 0, 0, 0), 0);
  assert.equal(api.computeEffectiveCloud(100, 0, 0, 0), 100);
  assert.equal(api.computeEffectiveCloud(0, 0, 100, 0), 30);
  assert.equal(api.computeEffectiveCloud(0, 0, 0, 100), 100);
  assert.equal(api.computeEffectiveCloud(50, 50, 0, 0), 75);
  assert.equal(api.computeEffectiveCloud(90, 90, 0, 0, 20), 28);
});

test('4. IGRF-14 / AACGM geomagnetic latitude, NH+SH MLT, and Kp thresholds', () => {
  const alta = api.computeGeomagneticLat(69.97, 23.27);
  const oslo = api.computeGeomagneticLat(59.91, 10.75);
  const taipei = api.computeGeomagneticLat(25.03, 121.56);
  const hobart = api.computeGeomagneticLat(-42.88, 147.33);
  const capeTown = api.computeGeomagneticLat(-33.92, 18.42);

  const minneapolis = api.computeGeomagneticLat(44.98, -93.27);
  const winnipeg = api.computeGeomagneticLat(49.90, -97.14);
  const london = api.computeGeomagneticLat(51.51, -0.13);

  assert.ok(alta > 65 && alta < 70, `Alta magLat=${alta}`);
  assert.ok(oslo > 56 && oslo < 61, `Oslo magLat=${oslo}`);
  assert.ok(taipei > 13 && taipei < 20, `Taipei magLat=${taipei}`);
  assert.ok(hobart < -52 && hobart > -55, `Hobart IGRF-14 Apex-110 lat=${hobart}`);
  assert.ok(capeTown < -40 && capeTown > -44, `Cape Town true IGRF-14 Apex-110 lat=${capeTown} (must unblock G5)`);
  // Non-dipole Hudson Bay / North Atlantic multipoles verified vs AACGMv2
  assert.ok(minneapolis > 53 && minneapolis < 55, `Minneapolis IGRF-14 Apex-110 lat=${minneapolis}`);
  assert.ok(winnipeg > 57.5 && winnipeg < 59.5, `Winnipeg IGRF-14 Apex-110 lat=${winnipeg}`);
  assert.ok(london > 46.5 && london < 48.5, `London IGRF-14 Apex-110 lat=${london}`);
  // Continuous across equator (zero jump at lat = 0)
  assert.ok(Math.abs(api.computeGeomagneticLat(0.01, 15) - api.computeGeomagneticLat(-0.01, 15)) < 0.5);

  assert.equal(api.requiredKpForMagLat(Math.abs(alta)), 0);
  assert.ok(api.requiredKpForMagLat(Math.abs(oslo)) >= 3);
  assert.equal(api.requiredKpForMagLat(Math.abs(taipei)), 9);

  const mltN = api.computeMLT(new Date('2026-11-23T22:00:00Z'), 69.97, 23.27);
  const mltS = api.computeMLT(new Date('2026-11-23T14:00:00Z'), -42.88, 147.33);
  assert.ok(mltN >= 0 && mltN < 24, `NH MLT out of range: ${mltN}`);
  assert.ok(mltS >= 0 && mltS < 24, `SH MLT out of range: ${mltS}`);
  // Hobart (UTC+10/11) at 14:00 UTC is local midnight (~00:00-01:00 MLT)
  assert.ok(mltS >= 22 || mltS <= 3, `Hobart 14:00Z should be near magnetic midnight, got MLT=${mltS}`);
});

test('5. Solar wind coupling, dynamic pressure, shock detector, wind chill, and extreme CME L1 ETA', () => {
  assert.equal(api.computeNewellCoupling(500, 0, 5), 0);
  const nwWeak = api.computeNewellCoupling(400, 0, -2);
  const nwStrong = api.computeNewellCoupling(650, 0, -8);
  assert.ok(nwStrong > nwWeak * 4);

  const pdyn = api.computeDynamicPressure(500, 10);
  assert.ok(Math.abs(pdyn - 4.18) < 0.05, `Expected ~4.18 nPa, got ${pdyn}`);

  const calmWind = [{ time_tag: '2026-11-23T21:00:00', speed: 350, density: 4 }, { time_tag: '2026-11-23T21:05:00', speed: 360, density: 4.5 }];
  assert.equal(api.detectPressureShock(calmWind).active, false);
  const shockWind = [{ time_tag: '2026-11-23T21:00:00', speed: 350, density: 4 }, { time_tag: '2026-11-23T21:05:00', speed: 600, density: 12 }];
  assert.equal(api.detectPressureShock(shockWind).active, true);

  assert.equal(api.computeWindChill(15, 10), 15);
  assert.ok(api.computeWindChill(-10, 10) < -18);

  // L1 ETA supports extreme CMEs (1800 km/s -> 13 min, NOT cliff back to 45 min!)
  assert.ok(api.computeL1EtaMin(700) < api.computeL1EtaMin(350));
  assert.ok(api.computeL1EtaMin(1800) <= 15 && api.computeL1EtaMin(1800) >= 8, `Expected 1800 km/s ETA 8..15m, got ${api.computeL1EtaMin(1800)}`);
  assert.equal(api.computeL1EtaMin(50), 45);
});

test('6. NOAA 1-minute Kp parser skips provisional trailing 0Z placeholders without breaking true 0.00', () => {
  const liveLike = [
    { time_tag: '2026-11-23T21:44:00', estimated_kp: 0.33, kp: '0P' },
    { time_tag: '2026-11-23T21:45:00', estimated_kp: 0.33, kp: '0P' },
    { time_tag: '2026-11-23T21:46:00', estimated_kp: 0, kp: '0Z' },
    { time_tag: '2026-11-23T21:47:00', estimated_kp: 0, kp: '0Z' },
    { time_tag: '2026-11-23T21:48:00', estimated_kp: 0, kp: '0Z' }
  ];
  assert.equal(api.parseLatestKp(liveLike).kp, 0.33);

  const stormLike = [
    { time_tag: '2026-11-23T21:00:00', estimated_kp: 5.33, kp: '5P' },
    { time_tag: '2026-11-23T21:01:00', estimated_kp: 0, kp: '0Z' },
    { time_tag: '2026-11-23T21:02:00', estimated_kp: 0, kp: '0Z' }
  ];
  assert.equal(api.parseLatestKp(stormLike).kp, 5.33);

  const trueZero = [1, 2, 3, 4, 5, 6].map(i => ({ time_tag: `2026-11-23T21:0${i}:00`, estimated_kp: 0, kp: '0Z' }));
  assert.equal(api.parseLatestKp(trueZero).kp, 0);

  const kp3h = [
    { time_tag: '2026-11-23T15:00:00', Kp: 1.67 },
    { time_tag: '2026-11-23T18:00:00', Kp: 0.67 }
  ];
  assert.equal(api.parseLatestKp(kp3h).kp, 0.67);
});

test('7. NOAA mag, wind, Kp forecast, OVATION, HPI, and GOES parsers filter bad/fill values and Safari timestamps', () => {
  // Safari-safe UTC parsing with space separator
  assert.equal(api.parseUtcMs('2026-11-23 21:51:00'), Date.parse('2026-11-23T21:51:00Z'));

  const magRows = [
    { time_tag: '2026-11-23T21:51:00', active: true, bz_gsm: -4.2, by_gsm: 1.1, bt: 5.0 },
    { time_tag: '2026-11-23T21:50:00', active: false, bz_gsm: 9.9, by_gsm: 0, bt: 9.9 },
    { time_tag: '2026-11-23T21:49:00', active: true, bz_gsm: -999.9, by_gsm: -999.9, bt: -999.9 },
    { time_tag: '2026-11-23T21:48:00', active: true, bz_gsm: -2.0, by_gsm: 0.5, bt: 3.1 }
  ];
  const parsedMag = api.parseMagSeries(magRows, 10);
  assert.equal(parsedMag.length, 2);
  assert.equal(parsedMag[0].bz, -2.0);
  assert.equal(parsedMag[1].bz, -4.2);

  const windRows = [
    { time_tag: '2026-11-23T21:51:00', active: true, proton_speed: 450, proton_density: 6.2 },
    { time_tag: '2026-11-23T21:50:00', active: true, proton_speed: -999.9, proton_density: -999.9 },
    { time_tag: '2026-11-23T21:49:00', active: true, proton_speed: 0, proton_density: 5 },
    { time_tag: '2026-11-23T21:48:00', active: false, proton_speed: 800, proton_density: 20 }
  ];
  const parsedWind = api.parseWindSeries(windRows, 10);
  assert.equal(parsedWind.length, 1);
  assert.equal(parsedWind[0].speed, 450);

  const fcObj = api.parseKpForecast([{ time_tag: '2026-11-23T21:00:00', kp: 2.33, observed: 'predicted' }]);
  assert.equal(fcObj.length, 1);
  assert.equal(fcObj[0].kp, 2.33);
  const fcArr = api.parseKpForecast([['time_tag', 'kp', 'observed'], ['2026-11-23 21:00:00', '3.00', 'predicted']]);
  assert.equal(fcArr.length, 1);
  assert.equal(fcArr[0].kp, 3);

  const ov = { coordinates: [[338, 64, 18], [0, 70, 22], [147, -43, 5]] };
  assert.equal(api.lookupOvationProb(ov, 64.14, -21.94), 18);
  assert.equal(api.lookupOvationProb(ov, 70.0, -0.1), 22);
  assert.equal(api.lookupOvationProb(ov, -42.88, 147.33), 5);

  const hpiTxt = '# comment\n2026-11-23_21:50  2026-11-23_23:07  28  19\n';
  assert.equal(api.parseHemiPower(hpiTxt, 69.97).gw, 28);
  assert.equal(api.parseHemiPower(hpiTxt, -45.0).gw, 19);

  const goesRows = [
    { time_tag: '2026-11-23T21:30:00Z', Hp: 80, arcjet_flag: false },
    { time_tag: '2026-11-23T21:35:00Z', Hp: 82, arcjet_flag: false },
    { time_tag: '2026-11-23T21:40:00Z', Hp: 85, arcjet_flag: false },
    { time_tag: '2026-11-23T21:45:00Z', Hp: 90, arcjet_flag: false },
    { time_tag: '2026-11-23T21:48:00Z', Hp: 999, arcjet_flag: true },
    { time_tag: '2026-11-23T21:50:00Z', Hp: 100, arcjet_flag: false }
  ];
  const sub = api.parseGoesSubstorm(goesRows);
  assert.ok(sub.jumpNt >= 18 && sub.active === true);
});

test('8. MET Norway cloud_area_fraction cap & exact-hour boundary + Open-Meteo unixtime & half-hour TZ alignment', () => {
  const metMock = {
    properties: {
      timeseries: [
        { time: '2026-11-23T20:00:00Z', data: { instant: { details: { air_temperature: -5, cloud_area_fraction_low: 80, cloud_area_fraction: 80 } } } },
        { time: '2026-11-23T21:00:00Z', data: { instant: { details: { air_temperature: -3, cloud_area_fraction_low: 55, cloud_area_fraction_medium: 55, cloud_area_fraction_high: 40, cloud_area_fraction: 60 } } } },
        { time: '2026-11-23T22:00:00Z', data: { instant: { details: { air_temperature: -2, cloud_area_fraction_low: 20, cloud_area_fraction: 20 } } } }
      ]
    }
  };
  const metHrs = api.parseMetNorwayHourly12(metMock, 69.97, 23.27, 'Europe/Oslo', new Date('2026-11-23T21:00:00.000Z'));
  assert.equal(metHrs[0].time, '22:00');
  // Without totalCap, random overlap(55,55,40) = 82%; with totalCap=60, capped to <= 68%!
  assert.ok(metHrs[0].block <= 68, `MET Norway cloud should be capped by cloud_area_fraction, got ${metHrs[0].block}`);

  // Open-Meteo half-hour timezone ISO mode (Adelaide +10:30)
  const omIso = {
    time: ['2026-11-24T00:00', '2026-11-24T01:00'],
    cloud_cover_low: [10, 20], cloud_cover_mid: [0, 0], cloud_cover_high: [0, 0],
    cloud_cover: [10, 20], precipitation: [0, 0], temperature_2m: [18, 17], wind_speed_10m: [10, 10]
  };
  const omHrsIso = api.parseOpenMeteoHourly12(omIso, -34.93, 138.6, 'Australia/Adelaide', new Date('2026-11-23T13:45:00Z'), 37800);
  assert.equal(omHrsIso[0].time, '00:00');
  assert.equal(omHrsIso[0].dtMs, Date.parse('2026-11-23T14:00:00Z'));
  assert.equal(omHrsIso[0].isDay, false);

  // Open-Meteo DST-proof Unix timestamp mode (timeformat=unixtime)
  const t0Sec = Math.floor(Date.parse('2026-11-23T21:00:00Z') / 1000);
  const omUnix = {
    time: [t0Sec - 3600, t0Sec, t0Sec + 3600],
    cloud_cover_low: [80, 15, 25], cloud_cover_mid: [0, 0, 0], cloud_cover_high: [0, 0, 0],
    cloud_cover: [80, 15, 25], precipitation: [0, 0, 0], temperature_2m: [2, 1, 0], wind_speed_10m: [10, 10, 10]
  };
  const omHrsUnix = api.parseOpenMeteoHourly12(omUnix, 64.15, -21.94, 'Atlantic/Reykjavik', new Date('2026-11-23T21:10:00Z'));
  assert.equal(omHrsUnix[0].time, '21:00');
  assert.equal(omHrsUnix[0].block, 15);
});

test('9. Aurora scoring invariants, monotonicity, and zero contradiction with hourly forecast & verdict', () => {
  const taipei = api.computeAuroraScore({ lat: 25.03, lon: 121.56, cloudNow: 0, sunAlt: -30, bz: -10, speed: 600, kp: 6, ovation: 0 });
  assert.equal(taipei.total, 0);
  assert.equal(taipei.outOfZone, 'low-lat');

  const daylight = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: 5, bz: -10, speed: 600, kp: 6, ovation: 80 });
  assert.equal(daylight.total, 0);
  assert.equal(daylight.isTooBright, true);

  const cloudy = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 85, sunAlt: -25, bz: -6, speed: 550, kp: 4, ovation: 55, hpiGw: 50 });
  const clear = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -25, bz: -6, speed: 550, kp: 4, ovation: 55, hpiGw: 50 });
  const quiet = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -25, bz: 2, speed: 320, kp: 0.33, ovation: 10, hpiGw: 12 });
  assert.ok(clear.total > cloudy.total);
  assert.ok(clear.total > quiet.total);
  assert.ok(clear.total >= 65 && clear.total <= 99);

  const nowMs = Date.parse('2026-11-23T22:00:00Z');
  const hrs = [
    { time: '23:00', dtMs: nowMs, block: 10, clear: 90, txt: '🌟 晴', temp: -4, windMs: 3, windChill: -8, isDay: false, sunAlt: -35 },
    { time: '00:00', dtMs: nowMs + 3600000, block: 10, clear: 90, txt: '🌟 晴', temp: -4, windMs: 3, windChill: -8, isDay: false, sunAlt: -38 }
  ];
  const hero = api.computeAuroraScore({
    lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -35,
    bz: -7, speed: 580, kp: 4, ovation: 60, hpiGw: 55, newell: 8500,
    mlt: api.computeMLT(new Date(nowMs), 69.97, 23.27),
    effMoonPct: api.getMoonState(new Date(nowMs), 69.97, 23.27).effMoonPct
  });
  const fc12 = api.scoreHourlyForecast12(hrs, {
    lat: 69.97, lon: 23.27, kpForecast: [], fallbackKp: 4, ovation: 60, hpiGw: 55,
    bz: -7, speed: 580, newell: 8500
  });
  assert.equal(fc12.hours[0].score, hero.total, 'Hour-0 forecast score must match hero score');

  const hobart = api.computeAuroraScore({ lat: -42.88, lon: 147.33, cloudNow: 10, sunAlt: -25, bz: 0, speed: 350, kp: 1, ovation: 0 });
  assert.equal(hobart.outOfZone, 'need-storm');
  assert.equal(hobart.grade, '🌍 極光帶偏南');
  assert.equal(api.tGrade(hobart.grade, 'en'), 'Oval South');
  const vHobartEn = api.evaluateVerdict({ lat: -42.88, lon: 147.33, bestDark: hrs[0], kp: 1, scoreObj: hobart, lang: 'en' });
  const vHobartZh = api.evaluateVerdict({ lat: -42.88, lon: 147.33, bestDark: hrs[0], kp: 1, scoreObj: hobart, lang: 'zh' });
  assert.match(vHobartEn.title, /south/i);
  assert.match(vHobartZh.title, /更南邊/);

  for (const sc of [taipei, daylight, cloudy, clear, quiet, hobart]) {
    assert.ok(api.tGrade(sc.grade, 'en') !== sc.grade, `Missing English tGrade for ${sc.grade}`);
    const vZh = api.evaluateVerdict({ lat: 69.97, lon: 23.27, bestDark: hrs[0], kp: 2, scoreObj: sc, lang: 'zh' });
    const vEn = api.evaluateVerdict({ lat: 69.97, lon: 23.27, bestDark: hrs[0], kp: 2, scoreObj: sc, lang: 'en' });
    assert.ok(vZh.title && vZh.lead && vEn.title && vEn.lead);
  }
});

test('10. Solar wind trend banner aligns with Newell chart energy zone', () => {
  const series = Array.from({ length: 40 }, (_, i) => ({
    time_tag: `2026-11-23T21:${String(i).padStart(2, '0')}:00`,
    bz: -3.5, by: 1.0, bt: 3.6
  }));
  const bal = api.computeBallisticCoupling(series, 700);
  const lastE = bal.energy120[bal.energy120.length - 1];
  assert.ok(lastE >= 62, `Expected Active zone >=62, got ${lastE}`);
  const trendZh = api.summarizeEnergyTrend(series, 700, bal, 'zh');
  const trendEn = api.summarizeEnergyTrend(series, 700, bal, 'en');
  assert.equal(trendZh.good, true);
  assert.equal(trendEn.good, true);
  assert.match(trendZh.text, /活躍區/);
  assert.match(trendEn.text, /Active zone/);
});

test('11. All 10 NORDIC_CORRIDORS are winter-open, land-safe, unique, fit SVG wedges, and stay west of Russian border', () => {
  assert.equal(api.NORDIC_CORRIDORS.length, 10);
  const validKeys = new Set(['E', 'N', 'S', 'W']);
  for (const c of api.NORDIC_CORRIDORS) {
    assert.ok(c.pts.length >= 2 && c.pts.length <= 4, `Expected 2..4 winter-open corridors, got ${c.pts.length}`);
    const keys = c.pts.map(p => p.key);
    assert.equal(new Set(keys).size, keys.length, 'Duplicate cardinal keys in corridor');
    for (const p of c.pts) {
      assert.ok(validKeys.has(p.key), `Invalid cardinal key ${p.key}`);
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon));
      assert.ok(Number.isFinite(p.roadKm) && p.roadKm > 0, `Missing verified roadKm on ${p.label}`);
      assert.ok(p.lon <= 30.85, `Point ${p.label} lon=${p.lon} crosses Russian border`);
      assert.equal(p.isOcean, false);
      const shortName = p.label.replace(/^往[東西南北]+\s*/, '');
      assert.ok(shortName.length <= 13, `Radar wedge label too long (${shortName.length}): ${shortName}`);
    }
  }
});

test('12. All SVG builders produce clean markup with strictly uniform X-axis intervals', () => {
  const sky = api.buildSkySceneSVG({ cloudPct: 40, auroraScore: 55, moonUp: true, moonPct: 70, isTooBright: false });
  assert.ok(sky.includes('<rect') && !sky.includes('NaN') && !sky.includes('undefined'));

  const series = Array.from({ length: 120 }, (_, i) => {
    const t = new Date(Date.parse('2026-11-23T20:00:00Z') + i * 60000);
    return { time_tag: t.toISOString().slice(0, 19), bz: i > 80 ? -5 : -1, by: 1 };
  });
  const bal = api.computeBallisticCoupling(series, 400);
  const bzSvg = api.buildBzChartSVG(series, 'Europe/Oslo', 400, bal, 'zh');
  assert.ok(bzSvg.includes('<polyline') && !bzSvg.includes('NaN') && !bzSvg.includes('undefined'));
  const bzTicks = [...bzSvg.matchAll(/<text[^>]*y="163"[^>]*>(\d{2}:\d{2})<\/text>/g)].map(m => m[1]);
  assert.deepEqual(bzTicks, ['22:30', '23:00', '23:30'], `Expected uniform 30-min ticks, got ${JSON.stringify(bzTicks)}`);
  assert.equal(api.utcTagToLocalHM('2026-11-23T20:59:00', 'Europe/Oslo', 60), '22:59');

  const hrs = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((22 + i) % 24).padStart(2, '0')}:00`,
    clear: i === 3 ? 90 : 50, block: i === 3 ? 10 : 50,
    score: i === 3 ? 72 : 30, temp: -2, isDay: false
  }));
  const waveSvg = api.buildSkyWaveSVG(hrs, hrs[3], 5, 'zh');
  assert.ok(waveSvg.includes('<polyline') && !waveSvg.includes('NaN') && !waveSvg.includes('undefined'));
  const waveTicks = [...waveSvg.matchAll(/<text[^>]*y="170"[^>]*>(\d{2}:\d{2})<\/text>/g)].map(m => m[1]);
  assert.deepEqual(waveTicks, ['22:00', '00:00', '02:00', '04:00', '06:00', '08:00']);

  const dirs = [
    { key: 'here', label: '📍 目前位置', lat: 69.97, lon: 23.27, avg3h: 80, isOcean: false },
    { key: 'N', label: '往東北 Skaidi', lat: 70.43, lon: 24.50, avg3h: 25, isOcean: false },
    { key: 'E', label: '往東 Lakselv', lat: 70.05, lon: 24.97, avg3h: 50, isOcean: false },
    { key: 'S', label: '往南 Kautokeino', lat: 69.01, lon: 23.04, avg3h: 70, isOcean: false },
    { key: 'W', label: '往西 Burfjord', lat: 69.94, lon: 22.05, avg3h: 90, isOcean: false }
  ];
  const radarSvg = api.buildCompassRadarSVG(dirs, { lat: 69.97, lon: 23.27 }, 'zh');
  assert.ok(radarSvg.includes('Skaidi') && !radarSvg.includes('NaN') && !radarSvg.includes('undefined'));
});

test('13. Wording consistency audit across all source files: zero awkward legacy labels remain', () => {
  const forbidden = ['此刻抵地', '已抵地球', '天空清朗', '看見指數', '天黑暗空', '貼LINE', '極光視覺', '視覺總覽', '熱呼呼的晚餐'];
  const files = ['index.html', 'src/aurora-engine.js', 'src/charts.js', 'src/app.js'];
  for (const rel of files) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const term of forbidden) {
      assert.ok(!content.includes(term), `Legacy awkward term "${term}" appears in ${rel}`);
    }
  }
});

test('14. Live API end-to-end smoke test (enabled with LIVE_TEST=1)', { skip: process.env.LIVE_TEST !== '1' }, async () => {
  const hdrs = { 'User-Agent': 'nordic-aurora-radar-test/1.0' };
  const fetchRetry = async (url, asText = false) => {
    for (let i = 0; i < 2; i++) {
      try {
        const r = await fetch(url, { headers: hdrs });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return asText ? await r.text() : await r.json();
      } catch (e) {
        if (i === 1) throw e;
        await new Promise(res => setTimeout(res, 600));
      }
    }
  };
  const [mag, wind, kp1m, ov, hpi, goes1, goes2, kpfc, scales, geo1h, alerts, met, om] = await Promise.all([
    fetchRetry('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json'),
    fetchRetry('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json'),
    fetchRetry('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json'),
    fetchRetry('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'),
    fetchRetry('https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt', true),
    fetchRetry('https://services.swpc.noaa.gov/json/goes/primary/magnetometers-6-hour.json'),
    fetchRetry('https://services.swpc.noaa.gov/json/goes/secondary/magnetometers-6-hour.json'),
    fetchRetry('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'),
    fetchRetry('https://services.swpc.noaa.gov/products/noaa-scales.json'),
    fetchRetry('https://services.swpc.noaa.gov/json/geospace/geospace_pred_est_kp_1_hour.json'),
    fetchRetry('https://services.swpc.noaa.gov/products/alerts.json'),
    fetchRetry('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=69.9689&lon=23.2716'),
    fetchRetry('https://api.open-meteo.com/v1/forecast?latitude=64.1466&longitude=-21.9426&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation&timezone=auto&timeformat=unixtime&forecast_days=4')
  ]);

  const magS = api.parseMagSeries(mag, 180);
  const windS = api.parseWindSeries(wind, 180);
  const kpObj = api.parseLatestKp(kp1m);
  const ovAlta = api.lookupOvationProb(ov, 69.9689, 23.2716);
  const hpiObj = api.parseHemiPower(hpi, 69.9689);
  const goesSub = api.mergeGoesSubstorm(api.parseGoesSubstorm(goes1), api.parseGoesSubstorm(goes2));
  const kpFcList = api.parseKpForecast(kpfc);
  const scParsed = api.parseNoaaGeomagneticScales(scales);
  const geoParsed = api.parseGeospacePredKp1h(geo1h, Date.now());
  const alertParsed = api.parseNoaaAlerts(alerts, Date.now());
  const met12 = api.parseMetNorwayHourly12(met, 69.9689, 23.2716, 'Europe/Oslo', new Date());
  const om12 = api.parseOpenMeteoHourly12(om.hourly, 64.1466, -21.9426, om.timezone, new Date());

  assert.ok(magS.length > 0 && windS.length > 0 && kpObj && Number.isFinite(ovAlta));
  assert.ok(hpiObj && goesSub && kpFcList.length > 10 && scParsed && scParsed.days.length === 3);
  assert.ok(geoParsed && Number.isFinite(geoParsed.maxNext60Kp), 'Geospace 1h Kp failed live parse');
  assert.equal(typeof alertParsed.active, 'boolean');
  assert.equal(met12.length, 12);
  assert.equal(om12.length, 12);
});

test('15. 50-city global regression test: zero G1/G4 false negatives and accurate daylight/hemisphere gates', () => {
  const CITIES = [
    ['Alta', 69.97, 23.27, 'oval'], ['Tromso', 69.65, 18.96, 'oval'], ['Lofoten', 68.23, 14.57, 'oval'],
    ['Senja', 69.35, 17.48, 'oval'], ['Narvik', 68.44, 17.43, 'oval'], ['Abisko', 68.35, 18.83, 'oval'],
    ['Kiruna', 67.86, 20.23, 'oval'], ['Kirkenes', 69.73, 30.05, 'oval'], ['Rovaniemi', 66.50, 25.73, 'oval'],
    ['Inari', 68.91, 27.03, 'oval'], ['Longyearbyen', 78.22, 15.63, 'polar'], ['Oslo', 59.91, 10.75, 'sub'],
    ['Bergen', 60.39, 5.32, 'sub'], ['Trondheim', 63.43, 10.40, 'oval'], ['Stockholm', 59.33, 18.07, 'sub'],
    ['Helsinki', 60.17, 24.94, 'sub'], ['Reykjavik', 64.15, -21.94, 'oval'], ['Akureyri', 65.69, -18.13, 'oval'],
    ['Ilulissat', 69.22, -51.10, 'polar'], ['Nuuk', 64.18, -51.69, 'oval'], ['Inverness', 57.48, -4.22, 'sub'],
    ['Edinburgh', 55.95, -3.19, 'sub'], ['Murmansk', 68.96, 33.08, 'oval'], ['London', 51.51, -0.13, 'mid'],
    ['Berlin', 52.52, 13.41, 'mid'], ['Fairbanks', 64.84, -147.72, 'oval'], ['Anchorage', 61.22, -149.90, 'sub'],
    ['Utqiagvik', 71.29, -156.79, 'oval'], ['Yellowknife', 62.45, -114.37, 'oval'], ['Whitehorse', 60.72, -135.06, 'oval'],
    ['Churchill', 58.77, -94.17, 'oval'], ['Iqaluit', 63.75, -68.52, 'oval'], ['Banff', 51.18, -115.57, 'sub'],
    ['Calgary', 51.04, -114.07, 'sub'], ['Winnipeg', 49.90, -97.14, 'sub'], ['StJohns', 47.56, -52.71, 'sub'],
    ['Seattle', 47.61, -122.33, 'mid'], ['Minneapolis', 44.98, -93.27, 'mid'], ['Sapporo', 43.06, 141.35, 'storm'],
    ['Asahikawa', 43.77, 142.37, 'storm'], ['Tokyo', 35.68, 139.65, 'low'], ['Taipei', 25.03, 121.57, 'low'],
    ['Singapore', 1.35, 103.82, 'low'], ['Hobart', -42.88, 147.33, 'sub'], ['Queenstown', -45.03, 168.66, 'sub'],
    ['Invercargill', -46.41, 168.35, 'sub'], ['Dunedin', -45.88, 170.50, 'sub'], ['Melbourne', -37.81, 144.96, 'mid'],
    ['Ushuaia', -54.80, -68.30, 'storm'], ['McMurdo', -77.84, 166.69, 'polar']
  ];
  assert.equal(CITIES.length, 50);

  for (const [name, lat, lon, tier] of CITIES) {
    const day = api.computeAuroraScore({ lat, lon, cloudNow: 0, sunAlt: 15, bz: -1, speed: 350, kp: 1, ovation: 0 });
    assert.equal(day.total, 0, `${name} daylight must be 0`);
    if (tier === 'oval' || tier === 'sub' || tier === 'polar') {
      assert.equal(day.grade, '☀️ 天色過亮', `${name} daylight should show Too Bright, got ${day.grade}`);
    }
    if (tier === 'low') assert.equal(day.outOfZone, 'low-lat');

    const g1 = api.computeAuroraScore({
      lat, lon, cloudNow: 10, sunAlt: -25, bz: -7, speed: 550, kp: 5,
      ovation: tier === 'oval' ? 75 : (tier === 'sub' ? 35 : 0),
      hpiGw: 65, newell: Math.round(api.computeNewellCoupling(550, 2, -7)), mlt: 0.5, effMoonPct: 0
    });
    if (tier === 'oval') assert.ok(g1.total >= 65, `${name} G1 should be >=65, got ${g1.total}`);
    if (tier === 'sub') assert.ok(g1.total >= 40, `${name} G1 should be >=40, got ${g1.total}`);
    if (tier === 'low') assert.equal(g1.total, 0);

    const g4 = api.computeAuroraScore({
      lat, lon, cloudNow: 10, sunAlt: -25, bz: -18, speed: 750, kp: 8,
      ovation: tier === 'low' ? 0 : 35,
      hpiGw: 140, newell: Math.round(api.computeNewellCoupling(750, 2, -18)), mlt: 0.5, effMoonPct: 0
    });
    if (tier !== 'low') assert.ok(g4.total >= 40, `${name} G4 should be >=40, got ${g4.total}`);
    else assert.equal(g4.total, 0);
  }
});

test('16. True geomagnetic azimuth, 300km G5 red aurora, and naked-eye vs camera classification', () => {
  // Alta points NNW (~334°), Fairbanks points NNE (~21°), Queenstown points SSW (~200°)
  const altaAz = api.computeAuroraBearing(69.97, 23.27);
  const fairAz = api.computeAuroraBearing(64.84, -147.72);
  const qtAz = api.computeAuroraBearing(-45.03, 168.66);
  assert.ok(altaAz >= 325 && altaAz <= 345, `Alta bearing expected ~334° NNW, got ${altaAz}`);
  assert.ok(fairAz >= 10 && fairAz <= 32, `Fairbanks bearing expected ~21° NNE, got ${fairAz}`);
  assert.ok(qtAz >= 190 && qtAz <= 212, `Queenstown bearing expected ~200° SSW, got ${qtAz}`);

  // Sapporo during G5 storm (Kp 8.5): 300km red aurora MUST be visible above horizon (not 'below')!
  const sapporoG5 = api.computeViewingGeometry({ lat: 43.06, lon: 141.35, kp: 8.5, mlt: 0.5, lang: 'en' });
  assert.equal(sapporoG5.mode, 'low', `Sapporo G5 should show low horizon red aurora, got ${sapporoG5.mode}`);

  // Svalbard strong storm -> overhead equatorward
  const svalbard = api.computeViewingGeometry({ lat: 78.22, lon: 15.63, kp: 6, mlt: 0.5, lang: 'zh' });
  assert.equal(svalbard.mode, 'overhead-eq');

  // Naked-eye vs camera-first visibility classification
  const brightEye = api.classifyViewingMode({ scoreObj: { total: 75, auroraScore: 80, skyScore: 85, outOfZone: null, isTooBright: false }, geom: { mode: 'overhead' }, effMoonPct: 10, lang: 'en' });
  assert.equal(brightEye.tier, 'naked-eye');
  const lowHorizonCam = api.classifyViewingMode({ scoreObj: { total: 30, auroraScore: 45, skyScore: 80, outOfZone: null, isTooBright: false }, geom: { mode: 'low' }, effMoonPct: 10, lang: 'zh' });
  assert.equal(lowHorizonCam.tier, 'camera-first');
});

test('17. Shareable city URL parser and builder validate coordinates, sanitize names, and round-trip cleanly', () => {
  const built = api.buildShareUrl(
    'https://peteryux.github.io/nordic-aurora-radar/?lat=1&lon=2&lang=zh',
    { name: '挪威・Tromsø', nameEn: 'Norway · Tromsø', lat: 69.6492, lon: 18.9553 },
    'en'
  );
  const parsed = api.parseUrlLocation(new URL(built).search);
  assert.ok(parsed);
  assert.equal(parsed.lat, 69.6492);
  assert.equal(parsed.lon, 18.9553);
  assert.equal(parsed.name, '挪威・Tromsø');
  assert.equal(parsed.nameEn, 'Norway · Tromsø');

  assert.equal(api.parseUrlLocation('?lat=999&lon=10'), null);
  assert.equal(api.parseUrlLocation('?lat=abc&lon=10'), null);
  const xss = api.parseUrlLocation('?lat=60.1699&lon=24.9384&name=%3Cscript%3EHelsinki%3C/script%3E');
  assert.ok(xss && !xss.name.includes('<') && !xss.name.includes('>'));
});

test('18. Sub-auroral 12h forecast has zero +1h/+2h ghost score spikes when Kp is quiet', () => {
  const baseMs = Date.parse('2026-11-23T22:00:00Z');
  const hrs = Array.from({ length: 6 }, (_, i) => ({
    time: `${String((23 + i) % 24).padStart(2, '0')}:00`,
    dtMs: baseMs + i * 3600000,
    block: 5, clear: 95, txt: '🌟 晴', temp: 2, windMs: 2, windChill: 0, isDay: false, sunAlt: -30
  }));
  // Hobart & Queenstown at quiet Kp=1.0, ovation=0 -> every hour must stay strictly 0
  for (const [name, lat, lon] of [['Hobart', -42.88, 147.33], ['Queenstown', -45.03, 168.66]]) {
    const res = api.scoreHourlyForecast12(hrs, {
      lat, lon, kpForecast: [], fallbackKp: 1.0, ovation: 0, hpiGw: 12, bz: 1.0, speed: 350, newell: 200
    });
    for (let i = 0; i < res.hours.length; i++) {
      assert.equal(res.hours[i].score, 0, `${name} hour +${i}h should be 0 at Kp 1.0, got ${res.hours[i].score}`);
    }
  }
});

test('19. [P0] Sudden CME/substorm before Kp updates MUST NOT be hard-blocked at mid-latitudes', () => {
  // Edinburgh, Hobart, Queenstown, Seattle during CME onset (Bz -18, 680 km/s, Newell 18000, GOES +35 nT, HPI 110 GW)
  // while 1m/3h Kp is still lagging at 2.5 and overhead OVATION is only 3%
  const targets = [
    ['Edinburgh', 55.95, -3.19],
    ['Hobart', -42.88, 147.33],
    ['Queenstown', -45.03, 168.66],
    ['Seattle', 47.61, -122.33]
  ];
  for (const [name, lat, lon] of targets) {
    const sc = api.computeAuroraScore({
      lat, lon, cloudNow: 10, sunAlt: -25,
      bz: -18, speed: 680, kp: 2.5, ovation: 3,
      hpiGw: 110, substormJumpNt: 35, pdyn: 12, shockJumpNpa: 8, newell: 18000,
      mlt: 21.5, effMoonPct: 0
    });
    assert.equal(sc.outOfZone, null, `${name} CME/substorm onset must NOT be blocked by Gate 2`);
    assert.ok(sc.total >= 45, `${name} CME/substorm onset should score >=45, got ${sc.total}`);
  }
});

test('20. [P0] Active G4/G5 storm during civil twilight (-5°) MUST NOT be mislabeled Clear · Quiet', () => {
  const twStorm = api.computeAuroraScore({
    lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -5.0,
    bz: -20, speed: 750, kp: 8, ovation: 95, hpiGw: 150, newell: 25000, mlt: 0.5, effMoonPct: 0
  });
  assert.notEqual(twStorm.grade, '🌌 晴朗但極光弱', 'G5 storm in twilight must never be called Clear · Quiet!');
  assert.ok(twStorm.total >= 20 || twStorm.grade === '🌅 暮光漸暗', `Expected >=20 or Twilight Active, got ${twStorm.total} (${twStorm.grade})`);
  const verdict = api.evaluateVerdict({ lat: 69.97, lon: 23.27, bestDark: null, kp: 8, scoreObj: twStorm, lang: 'en' });
  assert.ok(!/quiet/i.test(verdict.title), `Verdict must not say quiet during G5 twilight: ${verdict.title}`);
});

test('21. [P0] Alert engine fires for broken-cloud G4 storms, substorms, and incoming CME shocks', () => {
  // Broken clouds (72% cloud -> skyScore 28%) during G4 storm (auroraScore 95)
  const gapStorm = api.shouldTriggerAuroraAlert({
    sc: { total: 34, skyScore: 28, auroraScore: 95, outOfZone: null, isTooBright: false },
    goesSub: { active: false }, scNext: { total: 35 }, bal: { shockActive: false }
  });
  assert.equal(gapStorm.fire, true);

  // Incoming CME shock (scNext=72, quiet now=20)
  const incoming = api.shouldTriggerAuroraAlert({
    sc: { total: 20, skyScore: 80, auroraScore: 25, outOfZone: null, isTooBright: false },
    goesSub: { active: false },
    scNext: { total: 72, outOfZone: null, isTooBright: false },
    bal: { shockActive: true, etaMin: 28 }
  });
  assert.equal(incoming.fire, true);
  assert.equal(incoming.reason, 'incoming');
});

test('22. [P1] Ballistic L1 coupling anchors to nowMs under telemetry lag & Chart 1 splits >5min gaps', () => {
  const series = Array.from({ length: 60 }, (_, i) => {
    const t = new Date(Date.parse('2026-11-23T21:15:00Z') + i * 60000);
    return { time_tag: t.toISOString().slice(0, 19), bz: i >= 40 ? -8 : 0, by: 0 };
  });
  // Without lag (now = lastTs): Earth-arriving window is 45m earlier -> bz ~ 0
  const balNoLag = api.computeBallisticCoupling(series, 533, Date.parse('2026-11-23T22:14:00Z'));
  assert.equal(balNoLag.nowBz, 0);
  // With 45-min telemetry lag (now = 23:00Z while lastTs = 22:14Z): latest L1 surge (-8) IS hitting Earth right now!
  const balLagged = api.computeBallisticCoupling(series, 533, Date.parse('2026-11-23T23:00:00Z'));
  assert.ok(balLagged.nowBz <= -7, `Under 45m lag, latest L1 bz (-8) should be hitting Earth now, got ${balLagged.nowBz}`);

  // Telemetry gap >5 min splits into 2 polylines + dashed gap line
  const gapped = [
    ...Array.from({ length: 15 }, (_, i) => ({ time_tag: new Date(Date.parse('2026-11-23T20:00:00Z') + i * 60000).toISOString().slice(0, 19), bz: -2, by: 0 })),
    ...Array.from({ length: 15 }, (_, i) => ({ time_tag: new Date(Date.parse('2026-11-23T20:30:00Z') + i * 60000).toISOString().slice(0, 19), bz: -6, by: 0 }))
  ];
  const svg = api.buildBzChartSVG(gapped, 'UTC', 400, null, 'en');
  const polylines = svg.match(/<polyline/g) || [];
  assert.equal(polylines.length, 2, `Expected 2 separate polylines across 15-min dropout, got ${polylines.length}`);
});

test('23. NOAA G1-G5 scales parser & 3-Night Outlook handle active watches, dark windows, and polar day', () => {
  const mockScales = {
    '0': { DateStamp: '2026-11-24', G: { Scale: '0', Text: 'none' } },
    '1': { DateStamp: '2026-11-24', G: { Scale: '1', Text: 'minor' } },
    '2': { DateStamp: '2026-11-25', G: { Scale: '2', Text: 'moderate' } },
    '3': { DateStamp: '2026-11-26', G: { Scale: '0', Text: 'none' } }
  };
  const sc = api.parseNoaaGeomagneticScales(mockScales);
  assert.equal(sc.active, true);
  assert.equal(sc.currentScale, 0);
  assert.equal(sc.maxForecastScale, 2);
  assert.equal(sc.peakDate, '2026-11-25');

  // 3-Night Outlook for Alta in winter (3 nights, Night 2 has Kp 6 + 90% clear -> Promising)
  const now = new Date('2026-11-23T22:00:00Z');
  const cloudPoints = [
    { dtMs: Date.parse('2026-11-23T23:00:00Z'), clear: 15, block: 85, isDay: false },
    { dtMs: Date.parse('2026-11-24T22:00:00Z'), clear: 90, block: 10, isDay: false },
    { dtMs: Date.parse('2026-11-25T22:00:00Z'), clear: 40, block: 60, isDay: false }
  ];
  const kpForecast = [
    { ts: Date.parse('2026-11-23T23:00:00Z'), kp: 1.5 },
    { ts: Date.parse('2026-11-24T22:00:00Z'), kp: 6.0 },
    { ts: Date.parse('2026-11-25T22:00:00Z'), kp: 2.0 }
  ];
  const nights = api.summarize3NightOutlook({
    cloudPoints, kpForecast, currentKp: 1.5,
    lat: 69.97, lon: 23.27, timeZone: 'Europe/Oslo', nowDate: now, lang: 'en'
  });
  assert.equal(nights.length, 3);
  assert.equal(nights[1].tone, 'good');
  assert.equal(nights[1].gScale, 2);
  assert.equal(nights[1].bestClear, 90);
});

test('24. All 8 GLOBAL_CORRIDORS (Reykjavik, Akureyri, Fairbanks, Yellowknife, Whitehorse, Queenstown, Lake Tekapo, Hobart) are valid and matched', () => {
  assert.equal(api.GLOBAL_CORRIDORS.length, 8);
  const validKeys = new Set(['E', 'N', 'S', 'W']);
  for (const c of api.GLOBAL_CORRIDORS) {
    assert.ok(c.pts.length >= 2 && c.pts.length <= 4, `Expected 2..4 winter-open corridors, got ${c.pts.length}`);
    const keys = c.pts.map(p => p.key);
    assert.equal(new Set(keys).size, keys.length, 'Duplicate cardinal keys in global corridor');
    for (const p of c.pts) {
      assert.ok(validKeys.has(p.key), `Invalid cardinal key ${p.key}`);
      assert.ok(Number.isFinite(p.roadKm) && p.roadKm > 0, `Missing roadKm on ${p.label}`);
      assert.equal(p.isOcean, false);
      const shortName = p.label.replace(/^往[東西南北]+\s*/, '');
      assert.ok(shortName.length <= 13, `Global wedge label too long (${shortName.length}): ${shortName}`);
    }
    const matched = api.computeCompassPoints(c.match[0], c.match[1]);
    assert.equal(matched[1].label, c.pts[0].label);
  }
  // Regression: here=38% vs Borgarnes=20% must recommend Borgarnes (never call 20% "overcast"!)
  const sum = api.summarizeCompass([
    { key: 'here', label: '目前位置', avg3h: 38, isOcean: false },
    { key: 'N', label: '往北 Borgarnes', avg3h: 20, isOcean: false },
    { key: 'E', label: '往東 Þingvellir', avg3h: 100, isOcean: false }
  ], 'zh');
  assert.equal(sum.bestKey, 'N');
  assert.equal(sum.good, true);
  assert.ok(!sum.text.includes('同樣多雲'), `20% clear sky must never be called overcast: ${sum.text}`);
});

test('25. Historical 72-case storm & false-alarm benchmark, 3-pt spike rejection, preconditioning & cloud consensus', () => {
  const hist = evaluateHistoricalBenchmark();
  assert.equal(hist.count, 72);
  assert.equal(hist.visibility.fn, 0, `Visibility FNR must be 0%, got ${hist.visibility.fn} FN`);
  assert.ok(hist.visibility.accuracy >= 0.95, `Expected >=95% visibility accuracy, got ${(hist.visibility.accuracy * 100).toFixed(1)}%`);
  assert.ok(hist.visibility.mcc >= 0.95, `Expected visibility MCC >= 0.95, got ${hist.visibility.mcc}`);
  assert.ok(hist.calibration.rocAuc >= 0.99, `Expected ROC-AUC >= 0.99, got ${hist.calibration.rocAuc}`);
  assert.ok(hist.calibration.brier <= 0.14, `Expected Brier <= 0.14, got ${hist.calibration.brier}`);
  assert.equal(hist.alert.fn, 0, `Alert FNR must be 0%, got ${hist.alert.fn} FN`);
  assert.ok(hist.alert.accuracy >= 0.95, `Expected >=95% alert accuracy, got ${(hist.alert.accuracy * 100).toFixed(1)}%`);

  // 3-point causal median rejects 1-min -45 nT spike (interior AND tail) while passing real step shocks
  const spiked = Array.from({ length: 80 }, (_, i) => ({
    time_tag: new Date(Date.parse('2026-11-24T20:00:00Z') + i * 60000).toISOString().slice(0, 19),
    bz: (i === 65 || i === 79) ? -45.0 : 1.0, by: 0.5
  }));
  const balSpike = api.computeBallisticCoupling(spiked, 400);
  assert.equal(balSpike.nextBz, 1);
  assert.equal(balSpike.cleanLatestBz, 1);

  const sustained = Array.from({ length: 120 }, (_, i) => ({
    time_tag: new Date(Date.parse('2026-11-24T19:00:00Z') + i * 60000).toISOString().slice(0, 19),
    bz: i < 110 ? -6.0 : -0.5, by: 1.0
  }));
  const balPre = api.computeBallisticCoupling(sustained, 500);
  assert.equal(balPre.preconditioned, true);
  assert.ok(balPre.avgNewell60 >= 8000);
  const scNoPre = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -25, bz: -0.5, speed: 500, kp: 1.5, ovation: 30, newell: 1800, mlt: 0 });
  const scWithPre = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -25, bz: -0.5, speed: 500, kp: 1.5, ovation: 30, newell: 1800, preconditionedNewell60: balPre.avgNewell60, mlt: 0 });
  assert.ok(scWithPre.auroraScore > scNoPre.auroraScore, 'Preconditioning should lift substorm readiness');

  // Dual-model cloud consensus detection
  const agree = api.evaluateCloudConsensus([{ block: 20 }, { block: 25 }, { block: 30 }], [{ block: 25 }, { block: 30 }, { block: 35 }]);
  const diverge = api.evaluateCloudConsensus([{ block: 15 }, { block: 20 }, { block: 20 }], [{ block: 75 }, { block: 75 }, { block: 70 }]);
  assert.equal(agree.level, 'high');
  assert.equal(diverge.level, 'low');
  assert.ok(diverge.diffPct >= 50);
});

test('26. Independent NASA JPL Horizons DE441 solar & lunar ephemeris accuracy across 22 global checkpoints', () => {
  const astro = evaluateAstronomyBenchmark();
  assert.equal(astro.count, 22);
  assert.ok(astro.sunAlt.max < 0.05, `Solar elevation max error vs JPL DE441 too high: ${astro.sunAlt.max}°`);
  assert.ok(astro.moonAlt.max < 1.2, `Lunar elevation max error vs JPL DE441 too high: ${astro.moonAlt.max}°`);
  assert.ok(astro.moonIllum.max < 1.5, `Lunar illumination max error vs JPL DE441 too high: ${astro.moonIllum.max}%`);
});

test('27. Geospace 1h MHD Kp, NOAA SWPC Alerts, dual GOES merger, +1h L1 sync & strict security/GEO audit', () => {
  // 1. NOAA Geospace 1h forward predicted Kp
  const nowMs = Date.parse('2026-11-24T22:00:00Z');
  const geo = api.parseGeospacePredKp1h([
    { model_prediction_time: '2026-11-24T22:00:00Z', k: 1.67 },
    { model_prediction_time: '2026-11-24T22:35:00Z', k: 5.33 },
    { model_prediction_time: '2026-11-24T22:55:00Z', k: 4.00 }
  ], nowMs);
  assert.equal(geo.nowPredKp, 1.67);
  assert.equal(geo.maxNext60Kp, 5.33);

  // 2. NOAA SWPC official alerts (Sudden Impulse CME shock, K5 storm, and stale expiry)
  const alertShock = api.parseNoaaAlerts([
    { product_id: 'EF3A', issue_datetime: '2026-11-24 21:30:00.000', message: 'SUMMARY: Geomagnetic Sudden Impulse' },
    { product_id: 'K05A', issue_datetime: '2026-11-24 21:45:00.000', message: 'ALERT: Geomagnetic K-index of 5' }
  ], nowMs);
  assert.equal(alertShock.active, true);
  assert.equal(alertShock.kind, 'cme-shock');

  const alertStale = api.parseNoaaAlerts([
    { product_id: 'K07A', issue_datetime: '2026-11-24 12:00:00.000', message: 'ALERT: Geomagnetic K-index of 7' }
  ], nowMs, 3);
  assert.equal(alertStale.active, false);

  // 3. Dual-sector GOES magnetometer merger picks stronger East/West dipolarization jump
  const merged = api.mergeGoesSubstorm({ jumpNt: 6, active: false }, { jumpNt: 26, active: true });
  assert.equal(merged.active, true);
  assert.equal(merged.jumpNt, 26);
  assert.equal(merged.sector, 'west');

  // 4. Hour +1 in scoreHourlyForecast12 syncs with incoming L1 shock & Geospace 1h Kp
  const hrs = [0, 1, 2].map(i => ({
    time: `${String(22 + i).padStart(2, '0')}:00`,
    dtMs: nowMs + i * 3600000,
    block: 10, clear: 90, txt: '🌟 晴', temp: -3, precip: 0, windMs: 2, windChill: -6, isDay: false, sunAlt: -25
  }));
  const quietNowShockNext = api.scoreHourlyForecast12(hrs, {
    lat: 69.97, lon: 23.27, kpForecast: [], fallbackKp: 1.0, ovation: 15,
    bz: 1.0, nextBz: -14.0, speed: 620, newell: 400, nextNewell: 30000, predKp1h: 5.5
  });
  assert.ok(quietNowShockNext.hours[1].score > quietNowShockNext.hours[0].score + 25,
    `Hour +1 should surge on incoming L1 shock (${quietNowShockNext.hours[0].score} -> ${quietNowShockNext.hours[1].score})`);

  // 5. Security & AI-Search (GEO) invariants across HTML & repo root
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('http-equiv="Content-Security-Policy"'), 'Missing CSP meta header');
  assert.ok(html.includes("script-src 'self'"), 'CSP must lock script-src to self');
  assert.ok(html.includes('name="referrer" content="no-referrer"'), 'Missing no-referrer policy');
  assert.ok(html.includes('application/ld+json'), 'Missing JSON-LD structured data for AI Search/SEO');
  for (const rel of ['index.html', 'src/app.js', 'src/charts.js']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const badBlank = [...src.matchAll(/target="_blank"(?![^>]*noopener[^>]*noreferrer)/g)];
    assert.equal(badBlank.length, 0, `${rel} has target="_blank" without rel="noopener noreferrer"`);
  }
  for (const f of ['llms.txt', 'robots.txt', 'sitemap.xml', 'SECURITY.md']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `Missing required security/GEO file: ${f}`);
  }
});

test('28. explainAuroraScore single-source-of-truth across 72 events, confidence precedence & Chart 1/2 X/Y alignment', () => {
  const histData = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'historical-events.json'), 'utf8'));
  for (const ev of histData.events) {
    const raw = api.computeAuroraScore(ev.input);
    const expZh = api.explainAuroraScore({ ...ev.input, lang: 'zh' });
    const expEn = api.explainAuroraScore({ ...ev.input, lang: 'en' });
    assert.equal(expZh.score.total, raw.total, `Score drift on ${ev.id}`);
    assert.equal(expEn.score.total, raw.total, `EN score drift on ${ev.id}`);
    assert.ok(expZh.bottleneck.headline && !expZh.bottleneck.headline.includes('undefined') && !expZh.bottleneck.headline.includes('NaN'));
    assert.ok(expEn.bottleneck.headline && !expEn.bottleneck.headline.includes('undefined') && !expEn.bottleneck.headline.includes('NaN'));
    assert.equal(expZh.disclaimer.items.length, 3);
    assert.equal(expEn.disclaimer.items.length, 3);
  }

  // Hard gates
  assert.equal(api.explainAuroraScore({ lat: 25.03, lon: 121.57, cloudNow: 0, sunAlt: -30, kp: 9 }).bottleneck.key, 'gate-low-lat');
  assert.equal(api.explainAuroraScore({ lat: 52.52, lon: 13.41, cloudNow: 0, sunAlt: -30, kp: 1, ovation: 0 }).bottleneck.key, 'gate-need-storm');
  assert.equal(api.explainAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -2.0, kp: 5 }).bottleneck.key, 'gate-daylight');

  // Physics breakdowns: smooth cloud softening, smooth twilight softening, mid-lat reachFactor < 0.85, moon weight tapering
  const broken = api.explainAuroraScore({ lat: 60.17, lon: 24.94, cloudNow: 72, sunAlt: -30, bz: -18, speed: 600, kp: 8, ovation: 80, hpiGw: 140, newell: 36000, mlt: 0 });
  assert.equal(broken.bottleneck.key, 'cloud-gaps');
  assert.ok(broken.breakdown.cloudExp < 0.78, `Expected storm-softened cloudExp < 0.78, got ${broken.breakdown.cloudExp}`);

  const tw = api.explainAuroraScore({ lat: 57.48, lon: -4.22, cloudNow: 5, sunAlt: -5.5, bz: -22, speed: 680, kp: 8.3, ovation: 82, hpiGw: 150, newell: 48000, mlt: 22 });
  assert.equal(tw.bottleneck.key, 'twilight');
  assert.ok(tw.breakdown.twilightExp < 0.65, `Expected storm-softened twilightExp < 0.65, got ${tw.breakdown.twilightExp}`);

  const reach = api.explainAuroraScore({ lat: 52.52, lon: 13.41, cloudNow: 0, sunAlt: -30, bz: -7, speed: 500, kp: 5.0, ovation: 0, hpiGw: 60, newell: 14500, mlt: 0 });
  assert.equal(reach.bottleneck.key, 'oval-reach');
  assert.ok(reach.breakdown.reachFactor < 0.85);

  const modMoon = api.explainAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -30, kp: 2, ovation: 30, effMoonPct: 90 });
  const stormMoon = api.explainAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -30, kp: 8, ovation: 95, hpiGw: 160, newell: 48000, effMoonPct: 90 });
  assert.ok(stormMoon.breakdown.moonWeight < modMoon.breakdown.moonWeight, 'Moon weight must taper during bright storms');

  // Confidence precedence: model-diverge (low) MUST beat sat-lag (medium) while listing BOTH reasons & exact numbers
  const conf = api.explainAuroraScore({
    lat: 68.35, lon: 18.83, cloudNow: 20, sunAlt: -25, kp: 3, ovation: 45,
    usedMet: true, noaaOk: true, noaaLagMin: 60,
    cloudConsensus: { metAvg3h: 20, omAvg3h: 60, diffPct: 40, level: 'low' },
    lang: 'en'
  });
  assert.equal(conf.confidence.level, 'low');
  assert.equal(conf.confidence.primaryReason, 'model-diverge');
  assert.ok(conf.confidence.reasons.includes('model-diverge') && conf.confidence.reasons.includes('sat-lag'));
  assert.ok(conf.confidence.details.join(' ').includes('40%') && conf.confidence.details.join(' ').includes('60'));

  // Unified Chart 1 & Chart 2 left-axis alignment (padL = 56) and higher-is-better cues
  const ser = Array.from({ length: 40 }, (_, i) => ({
    time_tag: new Date(Date.parse('2026-11-24T20:00:00Z') + i * 60000).toISOString().slice(0, 19), bz: -3, by: 1
  }));
  const hrs = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((20 + i) % 24).padStart(2, '0')}:00`, clear: 50, block: 50, score: 25, temp: 0, isDay: false
  }));
  const svg1 = api.buildBzChartSVG(ser, 'UTC', 420, api.computeBallisticCoupling(ser, 420), 'zh');
  const svg2 = api.buildSkyWaveSVG(hrs, hrs[2], 2, 'zh');
  assert.ok(svg1.includes('x1="56"') && svg2.includes('x1="56"'), 'Chart 1 & Chart 2 must share identical padL=56 axis');
  assert.ok(svg1.includes('↑ 越高越強') && svg2.includes('↑ 越高越好'), 'Both charts must state higher=better clearly');
});

test('29. Bilingual city localization repairs cached/URL Chinese names when switching to English', () => {
  const staleAlta = { name: '挪威・阿爾塔', nameEn: '挪威・阿爾塔', lat: 69.9689, lon: 23.2716 };
  assert.equal(api.resolveCityDisplayName(staleAlta, 'en'), 'Norway · Alta');
  assert.equal(api.resolveCityDisplayName(staleAlta, 'zh'), '挪威・Alta');

  const parsedAlta = api.parseUrlLocation('?lat=69.9689&lon=23.2716&name=%E6%8C%AA%E5%A8%81%E3%83%BB%E9%98%BF%E7%88%BE%E5%A1%94');
  assert.equal(parsedAlta.name, '挪威・Alta');
  assert.equal(parsedAlta.nameEn, 'Norway · Alta');

  const parsedCustom = api.parseUrlLocation('?lat=25.0330&lon=121.5654&name=%E5%8F%B0%E7%81%A3%E3%83%BB%E5%8F%B0%E5%8C%97');
  assert.equal(parsedCustom.name, '台灣・台北');
  assert.equal(parsedCustom.nameEn, '');

  const geoEn = { countryName: 'Norway', city: 'Alta', locality: 'Bossekop' };
  assert.equal(api.formatReverseGeo(geoEn, 'en'), 'Norway · Alta (Bossekop)');
  const geoZh = { countryName: '挪威', city: '阿爾塔', locality: '市中心' };
  assert.equal(api.formatReverseGeo(geoZh, 'zh'), '挪威・阿爾塔（市中心）');
});

// ====== Exhaustive Chaos, Physics Regression, Fuzz, Monotonicity, i18n & Security Suite ======

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('30. Universal chaos & malformed-payload resilience across all 13 upstream parsers', () => {
  const HTML_502 = '<!DOCTYPE html><html><body><h1>502 Bad Gateway</h1><p>nginx 1.24 502 0</p></body></html>';
  const CHAOS = [null, undefined, '', 0, false, {}, [], [null, undefined, 42, 'str', {}], HTML_502, { error: 'rate limit', code: 429 }];
  const now = new Date('2026-11-24T22:00:00Z');

  for (const bad of CHAOS) {
    assert.deepEqual(api.parseMagSeries(bad, 10), []);
    assert.deepEqual(api.parseWindSeries(bad, 10), []);
    assert.equal(api.parseLatestActiveWind(bad), null);
    assert.deepEqual(api.parseKpForecast(bad), []);
    assert.equal(api.parseLatestKp(bad), null);
    assert.equal(api.lookupOvationProb(bad, 69.97, 23.27), null);
    assert.equal(api.parseHemiPower(bad, 69.97), null);
    assert.equal(api.parseGoesSubstorm(bad, -75, now.getTime()), null);
    assert.equal(api.parseGeospacePredKp1h(bad, now.getTime()), null);
    assert.equal(api.parseNoaaAlerts(bad, now.getTime()).active, false);
    assert.equal(api.parseNoaaGeomagneticScales(bad), null);
    assert.deepEqual(api.parseMetNorwayHourly12(bad, 69.97, 23.27, 'Europe/Oslo', now), []);
    assert.deepEqual(api.parseMetNorwayMultiDay(bad, 69.97, 23.27, 'Europe/Oslo', now), []);
    assert.deepEqual(api.parseOpenMeteoHourly12(bad, 69.97, 23.27, 'Europe/Oslo', now), []);
    assert.deepEqual(api.parseOpenMeteoMultiDay(bad, 69.97, 23.27, 'Europe/Oslo', now), []);
    assert.equal(api.formatReverseGeo(bad, 'en'), null);
    assert.equal(api.evaluateCloudConsensus(bad, bad), null);
  }

  // Specific adversarial defects previously found during audit:
  // 1. HTML 502 with 4-token numeric line must NEVER parse as HPI 502 GW
  assert.equal(api.parseHemiPower('nginx 1.24 502 0\n', 69.97), null);

  // 2. OVATION null coordinates must NEVER match (0, 0), negative lon must wrap, and 4 corners must bilinearly interpolate
  assert.equal(api.lookupOvationProb({ coordinates: [[null, null, 88]] }, 0, 0), null);
  assert.equal(api.lookupOvationProb({ coordinates: [[23, 70, null], [23, 70, -5], [23, 70, 150]] }, 70, 23), null);
  assert.equal(api.lookupOvationProb({ coordinates: [[-180, 65, 42]] }, 65, -180), 42);
  assert.equal(api.lookupOvationProb({ coordinates: [[-180, 65, 42]] }, 65, 270), null); // 90 deg away must NOT match!
  const ovGrid = { coordinates: [[23, 69, 20], [24, 69, 40], [23, 70, 60], [24, 70, 80]] };
  assert.equal(api.lookupOvationProb(ovGrid, 69.5, 23.5), 50, 'Bilinear midpoint of [20,40,60,80] must be 50');

  // 3. Out-of-range Kp fill values (-999 / 99) rejected
  assert.equal(api.parseLatestKp([{ time_tag: '2026-11-24T21:00:00Z', estimated_kp: -999 }, { time_tag: '2026-11-24T21:01:00Z', Kp: 99 }]), null);
  assert.deepEqual(api.parseKpForecast([{ time_tag: '2026-11-24T21:00:00Z', kp: -5 }, { time_tag: '2026-11-24T22:00:00Z', kp: 15 }]), []);

  // 4. Missing time_tag in mag/wind must NEVER sort last as "undefined"
  const magMissing = [
    { time_tag: '2026-11-24T21:00:00Z', active: true, bz_gsm: -5.0 },
    { active: true, bz_gsm: 9.0 },
    { time_tag: 'not-a-date', active: true, bz_gsm: 8.0 }
  ];
  const pm = api.parseMagSeries(magMissing, 10);
  assert.equal(pm.length, 1);
  assert.equal(pm[0].bz, -5.0);

  // 5. GOES -99999 fill values must NEVER trigger +100080 nT false substorm
  const goesFill = [
    { time_tag: '2026-11-24T21:30:00Z', Hp: -99999 },
    { time_tag: '2026-11-24T21:35:00Z', Hp: -99999 },
    { time_tag: '2026-11-24T21:40:00Z', Hp: 80 },
    { time_tag: '2026-11-24T21:45:00Z', Hp: 81 },
    { time_tag: '2026-11-24T21:50:00Z', Hp: 82 }
  ];
  assert.equal(api.parseGoesSubstorm(goesFill, -75, now.getTime()), null); // only 3 valid rows < 5

  // 6. Invalid item.time in MET Norway and NaN/null time/cloud in Open-Meteo must skip without throwing or turning null->0% cloud
  const metBadTime = {
    properties: {
      timeseries: [
        { time: 'not-a-date', data: { instant: { details: { cloud_area_fraction: 10 } } } },
        { time: '2026-11-24T22:00:00Z', data: { instant: { details: { cloud_area_fraction: 40, air_temperature: 'NaN' } } } }
      ]
    }
  };
  const metParsed = api.parseMetNorwayHourly12(metBadTime, 69.97, 23.27, 'Mars/Olympus', now);
  assert.equal(metParsed.length, 1);
  assert.equal(metParsed[0].block, 40);

  const omNullCloud = {
    time: [NaN, null, Math.floor(now.getTime() / 1000)],
    cloud_cover: [null, null, null],
    cloud_cover_low: [null, null, 85],
    cloud_cover_mid: [null, null, 0],
    cloud_cover_high: [null, null, 0]
  };
  const omParsed = api.parseOpenMeteoHourly12(omNullCloud, 69.97, 23.27, 'Europe/Oslo', now);
  assert.equal(omParsed.length, 1);
  assert.equal(omParsed[0].block, 85, 'Null cloud_cover must NOT become totalCap=0 -> 8% clear!');

  const omMissingLayers = {
    time: [Math.floor(now.getTime() / 1000)],
    cloud_cover: [90],
    cloud_cover_low: [null], cloud_cover_mid: [null], cloud_cover_high: [null]
  };
  assert.equal(api.parseOpenMeteoHourly12(omMissingLayers, 69.97, 23.27, 'Europe/Oslo', now)[0].block, 90);
});

test('31. Physics regressions: no latitude inversion, SWPC CANCEL, GOES diurnal/sector guard, fog/snow, dtMs consensus & dark-only outlook', () => {
  // 1. Latitude inversion guard: Oslo/Edinburgh must NEVER outscore oval-core Alta under same solar wind
  const swCommon = { cloudNow: 10, sunAlt: -30, bz: -10, speed: 550, kp: 0, ovation: 5, hpiGw: 30, newell: api.computeNewellCoupling(550, 2, -10), mlt: 0, effMoonPct: 0 };
  const scAlta = api.computeAuroraScore({ lat: 69.97, lon: 23.27, ...swCommon });
  const scOslo = api.computeAuroraScore({ lat: 59.91, lon: 10.75, ...swCommon });
  const scEdin = api.computeAuroraScore({ lat: 55.95, lon: -3.19, ...swCommon });
  assert.ok(scAlta.total >= scOslo.total && scAlta.total >= scEdin.total,
    `Oval-core Alta (${scAlta.total}) must >= Oslo (${scOslo.total}) & Edinburgh (${scEdin.total})`);

  // 2. Steady high Pdyn without jump + northward IMF must NOT false-alarm
  const steadyWind = Array.from({ length: 20 }, (_, i) => ({
    time_tag: new Date(Date.parse('2026-11-24T21:40:00Z') + i * 60000).toISOString().slice(0, 19),
    speed: 550, density: 11.2 // steady ~5.66 nPa, jump = 0
  }));
  const shSteady = api.detectPressureShock(steadyWind, Date.parse('2026-11-24T22:00:00Z'));
  assert.equal(shSteady.active, false, 'Steady high Pdyn without jump must not flag shockActive');

  const calmNorth = api.shouldTriggerAuroraAlert({
    sc: { total: 5, skyScore: 90, auroraScore: 6, outOfZone: null, isTooBright: false },
    goesSub: { active: false },
    scNext: { total: 5, skyScore: 90, auroraScore: 6, outOfZone: null, isTooBright: false },
    bal: { shockActive: true, etaMin: 35 }
  });
  assert.equal(calmNorth.fire, false, 'Northward IMF steady pressure must never fire incoming alert');

  // 3. SWPC CANCEL WARNING & Valid To expiration
  const nowMs = Date.parse('2026-11-24T22:00:00Z');
  const cancelled = api.parseNoaaAlerts([
    { product_id: 'K06W', issue_datetime: '2026-11-24 21:00:00.000', message: 'WARNING: Geomagnetic K-index of 6 expected\nValid To: 2026 Nov 25 0300 UTC' },
    { product_id: 'K06W', issue_datetime: '2026-11-24 21:40:00.000', message: 'CANCEL WARNING: Geomagnetic K-index of 6' }
  ], nowMs);
  assert.equal(cancelled.active, false, 'CANCEL WARNING must invalidate earlier K06W');

  const expired = api.parseNoaaAlerts([
    { product_id: 'K06W', issue_datetime: '2026-11-24 20:30:00.000', message: 'WARNING: Geomagnetic K-index of 6\nValid To: 2026 Nov 24 2130 UTC' }
  ], nowMs);
  assert.equal(expired.active, false, 'Expired Valid To warning must not remain active');

  // 4. GOES dayside slow diurnal drift vs nightside dipolarization + opposite-hemisphere attenuation
  const daysideRamp = Array.from({ length: 26 }, (_, i) => ({
    time_tag: new Date(Date.parse('2026-11-24T16:35:00Z') + i * 60000).toISOString().slice(0, 19), // 12:00 LT at GOES-East (-75°)
    Hp: 85 + i * 0.65 // +16.2 nT slow linear diurnal rise over 25 min (~6.5 nT / 10m)
  }));
  assert.equal(api.parseGoesSubstorm(daysideRamp, -75, Date.parse('2026-11-24T17:02:00Z')).active, false, 'Slow dayside GOES diurnal drift must not false-alarm');

  const westOnlySub = api.mergeGoesSubstorm(null, { jumpNt: 24, active: true }, 23.27); // Alta is 160° away from GOES-West (-137°)
  assert.equal(westOnlySub.sector, 'west');
  assert.ok(westOnlySub.jumpNt < 15 && westOnlySub.active === false, 'Opposite-hemisphere GOES-West substorm should be attenuated for Nordics');

  // 5. Open-Meteo WMO fog (45/48) & active snowfall occlusion
  const omFogSnow = {
    time: [Math.floor(nowMs / 1000), Math.floor(nowMs / 1000) + 3600],
    cloud_cover: [10, 20], cloud_cover_low: [10, 20], cloud_cover_mid: [0, 0], cloud_cover_high: [0, 0],
    weather_code: [45, 73], precipitation: [0, 1.2], temperature_2m: [-12, -5], wind_speed_10m: [5, 10]
  };
  const omFS = api.parseOpenMeteoHourly12(omFogSnow, 64.84, -147.72, 'America/Anchorage', new Date(nowMs));
  assert.ok(omFS[0].block >= 80, `WMO 45 ice fog must yield >=80% occlusion, got ${omFS[0].block}`);
  assert.ok(omFS[1].block >= 70, `Active 1.2mm/h snow must yield >=70% occlusion, got ${omFS[1].block}`);

  // 6. dtMs-aligned opposite-phase cloud consensus catches 100% disagreement masked by equal 3h means
  const t0 = nowMs;
  const metOpp = [{ dtMs: t0, block: 0 }, { dtMs: t0 + 3600000, block: 100 }, { dtMs: t0 + 7200000, block: 100 }];
  const omOpp = [{ dtMs: t0, block: 100 }, { dtMs: t0 + 3600000, block: 100 }, { dtMs: t0 + 7200000, block: 0 }];
  const oppCons = api.evaluateCloudConsensus(metOpp, omOpp);
  assert.equal(oppCons.level, 'low', `Opposite-phase clouds must flag low consensus, got ${oppCons.level} (diff=${oppCons.diffPct})`);

  // 7. 3-Night Outlook: never clone tonight's storm onto +2 Nights when future Kp is missing
  const nightsNoFutureKp = api.summarize3NightOutlook({
    cloudPoints: [{ dtMs: Date.parse('2026-11-23T23:00:00Z'), clear: 85, block: 15, isDay: false }],
    kpForecast: [{ ts: Date.parse('2026-11-23T21:00:00Z'), kp: 7.0 }],
    currentKp: 7.0, lat: 69.97, lon: 23.27, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-23T22:00:00Z'), lang: 'en'
  });
  assert.equal(nightsNoFutureKp[2].kpAvailable, false, '+2 Nights with no Kp forecast must not clone tonight Kp 7.0');
  assert.equal(nightsNoFutureKp[2].gScale, 0);

  // 8. lookupForecastKp matches [ts, ts + 3h) bin start instead of pulling next bin 90 min early
  const fcBins = [
    { ts: Date.parse('2026-11-24T21:00:00Z'), kp: 2.0 },
    { ts: Date.parse('2026-11-25T00:00:00Z'), kp: 6.0 }
  ];
  assert.equal(api.lookupForecastKp(fcBins, new Date('2026-11-24T22:45:00Z'), 1), 2.0);
  assert.equal(api.lookupForecastKp(fcBins, new Date('2026-11-25T00:15:00Z'), 1), 6.0);
});

test('32. computeAuroraScore domain & adversarial NaN/Infinity invariants across 320 seeded states', () => {
  const rand = mulberry32(0xA02026);
  const badVals = [NaN, Infinity, -Infinity, null, undefined, -1000, 1e6];
  // 20 adversarial NaN/extreme combinations
  for (let i = 0; i < 20; i++) {
    const bv = badVals[i % badVals.length];
    const sc = api.computeAuroraScore({
      lat: i % 3 === 0 ? bv : 69.97, lon: i % 4 === 0 ? bv : 23.27,
      cloudNow: i % 2 === 0 ? bv : 20, sunAlt: i % 5 === 0 ? bv : -25,
      bz: bv, speed: bv, kp: bv, ovation: bv, hpiGw: bv, newell: bv,
      substormJumpNt: bv, pdyn: bv, shockJumpNpa: bv, effMoonPct: bv, mlt: bv
    });
    assert.ok(Number.isInteger(sc.total) && sc.total >= 0 && sc.total <= 99, `Bad total=${sc.total}`);
    assert.ok(Number.isInteger(sc.skyScore) && sc.skyScore >= 0 && sc.skyScore <= 100);
    assert.ok(Number.isInteger(sc.auroraScore) && sc.auroraScore >= 0 && sc.auroraScore <= 100);
    assert.ok(Number.isInteger(sc.darkScore) && sc.darkScore >= 0 && sc.darkScore <= 100);
    assert.ok(Number.isFinite(sc.twilightFactor) && sc.twilightFactor >= 0 && sc.twilightFactor <= 1);
    assert.ok(api.tGrade(sc.grade, 'en') !== sc.grade, `Missing EN tGrade for ${sc.grade}`);
  }
  // 300 seeded global states
  for (let i = 0; i < 300; i++) {
    const lat = -85 + rand() * 170;
    const lon = -180 + rand() * 360;
    const sunAlt = -45 + rand() * 75;
    const sc = api.computeAuroraScore({
      lat, lon, cloudNow: rand() * 100, sunAlt,
      bz: -40 + rand() * 55, speed: 250 + rand() * 1400, kp: rand() * 9,
      ovation: rand() < 0.2 ? null : rand() * 100,
      hpiGw: rand() < 0.2 ? null : 5 + rand() * 220,
      newell: rand() < 0.2 ? null : rand() * 70000,
      substormJumpNt: rand() < 0.7 ? 0 : rand() * 45,
      pdyn: rand() < 0.5 ? null : rand() * 25,
      shockJumpNpa: rand() < 0.7 ? 0 : rand() * 15,
      mlt: rand() * 24, effMoonPct: rand() * 100
    });
    assert.ok(Number.isInteger(sc.total) && sc.total >= 0 && sc.total <= 99);
    assert.ok(Number.isInteger(sc.darkScore) && sc.darkScore >= 0 && sc.darkScore <= 100);
    if (sunAlt >= -4) { assert.equal(sc.total, 0); assert.equal(sc.isTooBright, true); }
    if (Math.abs(api.computeGeomagneticLat(lat, lon)) < 32) { assert.equal(sc.total, 0); assert.equal(sc.outOfZone, 'low-lat'); }
  }
});

test('33. Strict monotonicity invariants (clear sky 100->0 step 1%, aurora drivers, darkness, zero OVATION cliff)', () => {
  const rand = mulberry32(0x5EED42);
  const testCoords = [
    [69.97, 23.27], [64.15, -21.94], [59.91, 10.75], [55.95, -3.19], [-42.88, 147.33], [-45.03, 168.66]
  ];
  for (let s = 0; s < 30; s++) {
    const [lat, lon] = testCoords[s % testCoords.length];
    const base = {
      lat, lon, cloudNow: 15, sunAlt: -25,
      bz: -2 - rand() * 25, speed: 400 + rand() * 450, kp: 2 + rand() * 7,
      ovation: 15 + rand() * 80, hpiGw: 20 + rand() * 180,
      newell: 4000 + rand() * 45000, mlt: rand() * 24, effMoonPct: rand() * 90
    };
    // 1. Strict clear-sky monotonicity across every single 1% cloud step (100 -> 0)
    let prev = -1;
    for (let c = 100; c >= 0; c--) {
      const cur = api.computeAuroraScore({ ...base, cloudNow: c }).total;
      assert.ok(cur >= prev, `Cloud monotonicity broken at seed=${s}, cloud=${c}: ${cur} < ${prev}`);
      prev = cur;
    }
    // 2. Monotonicity in Kp, OVATION, Newell, substormJumpNt, and darkness
    let prevKp = -1;
    for (let k = 0; k <= 9; k += 1) {
      const cur = api.computeAuroraScore({ ...base, kp: k }).total;
      assert.ok(cur >= prevKp, `Kp monotonicity broken at kp=${k}: ${cur} < ${prevKp}`);
      prevKp = cur;
    }
    let prevOv = -1;
    for (let ov = 0; ov <= 100; ov += 5) {
      const cur = api.computeAuroraScore({ ...base, ovation: ov }).total;
      assert.ok(cur >= prevOv, `OVATION monotonicity broken at ov=${ov}: ${cur} < ${prevOv}`);
      prevOv = cur;
    }
    let prevDark = -1;
    for (let alt = 2; alt >= -20; alt -= 2) {
      const cur = api.computeAuroraScore({ ...base, sunAlt: alt }).total;
      assert.ok(cur >= prevDark, `Twilight monotonicity broken at sunAlt=${alt}: ${cur} < ${prevDark}`);
      prevDark = cur;
    }
    let prevMoon = -1;
    for (let m = 100; m >= 0; m -= 10) {
      const cur = api.computeAuroraScore({ ...base, effMoonPct: m }).total;
      assert.ok(cur >= prevMoon, `Moonlight monotonicity broken at effMoon=${m}: ${cur} < ${prevMoon}`);
      prevMoon = cur;
    }
  }

  // Zero +38pt cliff across OVATION 14% -> 15% in Berlin
  const b14 = api.computeAuroraScore({ lat: 52.52, lon: 13.41, cloudNow: 0, sunAlt: -25, bz: -10, speed: 550, kp: 3, ovation: 14, newell: 18000 });
  const b15 = api.computeAuroraScore({ lat: 52.52, lon: 13.41, cloudNow: 0, sunAlt: -25, bz: -10, speed: 550, kp: 3, ovation: 15, newell: 18000 });
  assert.ok(b15.total - b14.total <= 6, `OVATION 14%->15% jump too steep: ${b14.total} -> ${b15.total}`);
});

test('34. 500+ fuzzed zero-NaN / zero-undefined / zero-CJK(en) SVG integrity & epoch-1970 DoS guard', () => {
  const rand = mulberry32(0x5F6600D);
  const badPattern = /(?:NaN|undefined|Infinity|\bnull\b)/;
  const cjkRe = /[\u3400-\u9fff\uf900-\ufaff]/;

  // 150 SkySceneSVGs
  for (let i = 0; i < 150; i++) {
    const svg = api.buildSkySceneSVG({
      cloudPct: i % 15 === 0 ? NaN : (-20 + rand() * 140),
      auroraScore: i % 17 === 0 ? NaN : (-10 + rand() * 120),
      moonUp: rand() > 0.5, moonPct: i % 19 === 0 ? undefined : rand() * 100,
      isTooBright: rand() > 0.7
    });
    assert.ok(!badPattern.test(svg), `SkySceneSVG leaked NaN/undef at i=${i}`);
  }

  // 150 BzChartSVGs (incl. corrupt 1970-01-01 infinite-loop DoS check!)
  const tDos0 = Date.now();
  const dosSvg = api.buildBzChartSVG([
    { time_tag: '1970-01-01T00:00:00Z', bz: -2, by: 0 },
    { time_tag: '2026-11-24T22:00:00Z', bz: -6, by: 1 }
  ], 'Europe/Oslo', 450, null, 'en');
  assert.ok(Date.now() - tDos0 < 200, 'Corrupt 1970 timestamp must NOT hang buildBzChartSVG');
  assert.ok(!badPattern.test(dosSvg) && !cjkRe.test(dosSvg));

  for (let i = 0; i < 150; i++) {
    const lang = i % 2 === 0 ? 'en' : 'zh';
    const len = i % 10 === 0 ? 1 : (2 + Math.floor(rand() * 40));
    const tBase = Date.parse('2026-11-24T20:00:00Z');
    const ser = Array.from({ length: len }, (_, k) => ({
      time_tag: k === 1 && i % 13 === 0 ? 'bad-date' : new Date(tBase + k * (i % 7 === 0 ? 600000 : 60000)).toISOString().slice(0, 19),
      bz: i % 11 === 0 ? NaN : (-20 + rand() * 30), by: rand() * 5
    }));
    const bal = i % 3 === 0 ? api.computeBallisticCoupling(ser, 200 + rand() * 1200) : null;
    const svg = api.buildBzChartSVG(ser, i % 9 === 0 ? 'Bad/TZ' : 'Europe/Oslo', i % 13 === 0 ? NaN : 450, bal, lang);
    assert.ok(!badPattern.test(svg), `BzChartSVG leaked NaN/undef at i=${i}`);
    if (lang === 'en') assert.ok(!cjkRe.test(svg), `BzChartSVG EN leaked CJK at i=${i}`);
  }

  // 150 SkyWaveSVGs
  for (let i = 0; i < 150; i++) {
    const lang = i % 2 === 0 ? 'en' : 'zh';
    const len = i % 12 === 0 ? 0 : (2 + Math.floor(rand() * 12));
    const hrs = Array.from({ length: len }, (_, k) => ({
      time: k === 0 && i % 14 === 0 ? '' : `${String((20 + k) % 24).padStart(2, '0')}:00`,
      clear: i % 11 === 0 ? NaN : rand() * 100,
      score: i % 9 === 0 ? NaN : rand() * 99,
      temp: i % 13 === 0 ? NaN : (-35 + rand() * 65),
      isDay: rand() > 0.7
    }));
    const svg = api.buildSkyWaveSVG(hrs, hrs[1] || null, Math.floor(rand() * 15) - 2, lang);
    assert.ok(!badPattern.test(svg), `SkyWaveSVG leaked NaN/undef at i=${i}`);
    if (lang === 'en') assert.ok(!cjkRe.test(svg), `SkyWaveSVG EN leaked CJK at i=${i}`);
  }

  // 100 CompassRadarSVGs (all corridors + unavailable + XSS payload + missing keys)
  assert.equal(api.buildCompassRadarSVG([{ key: 'here', avg3h: 20 }, { key: 'N', avg3h: 10 }, { key: 'X', avg3h: 10 }, { key: 'Y', avg3h: 10 }, { key: 'Z', avg3h: 10 }], { lat: 69.97, lon: 23.27 }, 'en'), '');
  for (let i = 0; i < 100; i++) {
    const lang = i % 2 === 0 ? 'en' : 'zh';
    const c = api.CHASE_CORRIDORS[i % api.CHASE_CORRIDORS.length];
    const pts = i % 4 === 0 ? api.computeCompassPoints(60 + rand() * 10, 10 + rand() * 20, 60) : [{ key: 'here', label: '📍 目前位置', lat: c.match[0], lon: c.match[1], isOcean: false }, ...c.pts];
    const dirs = pts.map((p, idx) => ({
      ...p,
      label: idx === 1 && i === 0 ? '往東北 <script>x</script>' : p.label,
      avg3h: idx === 2 && i % 5 === 0 ? null : Math.round(rand() * 100),
      unavailable: idx === 2 && i % 5 === 0,
      isOcean: idx === 3 && i % 6 === 0
    }));
    const svg = api.buildCompassRadarSVG(dirs, { lat: c.match[0], lon: c.match[1] }, lang);
    assert.ok(!badPattern.test(svg), `CompassRadarSVG leaked NaN/undef at i=${i}`);
    assert.ok(!svg.includes('<script>'), 'CompassRadarSVG must XML-escape labels');
    if (lang === 'en') assert.ok(!cjkRe.test(svg), `CompassRadarSVG EN leaked CJK at i=${i}: ${svg}`);
  }
});

test('35. explainAuroraScore 100% parity & confidence precedence across 300 seeded fuzz states', () => {
  const rand = mulberry32(0xE491A1);
  const cjkRe = /[\u3400-\u9fff\uf900-\ufaff]/;
  for (let i = 0; i < 300; i++) {
    const lang = i % 2 === 0 ? 'en' : 'zh';
    const params = {
      lat: -75 + rand() * 150, lon: -180 + rand() * 360,
      cloudNow: rand() * 100, sunAlt: -35 + rand() * 50,
      bz: -30 + rand() * 40, speed: 300 + rand() * 900, kp: rand() * 9,
      ovation: rand() < 0.2 ? null : rand() * 100,
      hpiGw: rand() < 0.2 ? null : 10 + rand() * 200,
      newell: rand() < 0.2 ? null : rand() * 55000,
      effMoonPct: rand() * 100, moonPct: rand() * 100, moonAltDeg: -20 + rand() * 60,
      noaaOk: rand() > 0.15, noaaLagMin: rand() > 0.7 ? 65 : 5,
      usedMet: rand() > 0.3, cloudSpan3h: rand() > 0.7 ? 55 : 15,
      cloudConsensus: rand() > 0.6 ? { metAvg3h: 20, omAvg3h: 65, diffPct: 45, level: 'low' } : null,
      lang
    };
    const raw = api.computeAuroraScore(params);
    const exp = api.explainAuroraScore(params);
    assert.equal(exp.score.total, raw.total);
    assert.equal(exp.score.grade, api.tGrade(raw.grade, lang));
    assert.equal(exp.breakdown.skyScore, raw.skyScore);
    assert.equal(exp.breakdown.auroraScore, raw.auroraScore);
    assert.equal(exp.breakdown.darkScore, raw.darkScore);
    const allTxt = [exp.score.formulaText, exp.bottleneck.label, exp.bottleneck.headline, exp.bottleneck.detail, exp.confidence.badgeText, exp.confidence.headline, ...exp.confidence.details].join(' ');
    assert.ok(!/(?:NaN|undefined)/.test(allTxt), `explainAuroraScore leaked NaN/undefined at i=${i}`);
    if (lang === 'en') assert.ok(!cjkRe.test(allTxt), `explainAuroraScore EN leaked CJK at i=${i}: ${allTxt}`);
  }
});

test('36. Full i18n zero-CJK-leak audit across engine outputs & HTML-to-applyStaticI18n coverage', () => {
  const cjkRe = /[\u3400-\u9fff\uf900-\ufaff]/;
  for (const s of ['☀️ 白天', '🌅 晨昏光', '❄️ 雪', '🌧️ 雨雪', '🌟 晴', '⛅ 縫', '☁️ 陰']) {
    assert.ok(!cjkRe.test(api.tSky(s, 'en')), `tSky EN leaked CJK for ${s}`);
  }
  for (const d of ['📍 目前位置', '往東北 Skaidi', '往西北 Alta', '往東南 Oslo', '往西南 Bergen', '往北 60 km', '往南 60 km', '往東 60 km', '往西 60 km']) {
    assert.ok(!cjkRe.test(api.tDirLabel(d, 'en')), `tDirLabel EN leaked CJK for ${d}`);
  }
  const moonEn = api.getMoonState(new Date('2026-11-24T22:00:00Z'), 69.97, 23.27, 'en');
  assert.ok(!cjkRe.test(moonEn.desc), `getMoonState EN desc leaked CJK: ${moonEn.desc}`);

  const geomEn = api.computeViewingGeometry({ lat: 69.97, lon: 23.27, kp: 3, mlt: 0, lang: 'en' });
  assert.ok(!cjkRe.test(geomEn.shortText) && !cjkRe.test(geomEn.direction));

  // Verify every static Chinese text element with an id in index.html is handled in src/app.js or src/i18n.js
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const uiCode = ['src/app.js', 'src/i18n.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const htmlIdsWithCjk = [...html.matchAll(/<([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>([^<]*[\u3400-\u9fff][^<]*)<\/\1>/gi)];
  const exemptedDynamicIds = new Set(['locName', 'tsLiveTotal']);
  for (const [, , id] of htmlIdsWithCjk) {
    if (exemptedDynamicIds.has(id)) continue;
    const handled = uiCode.includes(`'${id}'`) || uiCode.includes(`"${id}"`) || new RegExp(`\\b${id}\\s*:`).test(uiCode);
    assert.ok(handled, `HTML element #${id} has CJK default text but is not referenced in src/app.js or src/i18n.js!`);
  }
});

test('37. Strict CSP, SW manifest integrity, zero 3rd-party JS & XSS/sink hygiene audit', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const srcFiles = allSrcRelFiles();
  const allSrcCode = srcFiles.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

  // 1. Parse CSP directives strictly
  const cspMatch = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  assert.ok(cspMatch, 'CSP meta tag missing');
  const csp = cspMatch[1];
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("script-src 'self'") && !csp.includes("'unsafe-eval'"));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(csp), 'script-src must never allow unsafe-inline');
  assert.ok(csp.includes("object-src 'none'") && csp.includes("base-uri 'self'") && csp.includes("form-action 'none'"));

  // Every fetch() origin across all src/*.js must be allowlisted in connect-src
  const connectMatch = csp.match(/connect-src\s+([^;]+)/);
  assert.ok(connectMatch, 'connect-src missing');
  const allowedConnect = new Set(connectMatch[1].trim().split(/\s+/));
  const fetchUrls = [...allSrcCode.matchAll(/fetch(?:WithTimeout)?\(\s*[`'"](https:\/\/[^/'"`]+)/g)].map(m => m[1]);
  assert.ok(fetchUrls.length >= 10, 'Expected >=10 fetch origins across src/*.js');
  for (const origin of new Set(fetchUrls)) {
    assert.ok(allowedConnect.has(origin), `Origin ${origin} fetched in src/*.js is missing from CSP connect-src!`);
  }

  // 2. Zero external 3rd-party JS or CSS tags
  assert.equal([...html.matchAll(/<script[^>]+src="https?:/gi)].length, 0, 'Zero external 3rd-party JS allowed');
  assert.equal([...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="https?:/gi)].length, 0, 'Zero external CSS allowed');

  // 3. Valid JSON-LD, manifest.json, and all sw.js SHELL_ASSETS exist on disk + cover EVERY src/*.js module
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLdMatch, 'JSON-LD missing');
  assert.doesNotThrow(() => JSON.parse(jsonLdMatch[1]));
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')));

  const assetsMatch = swJs.match(/SHELL_ASSETS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(assetsMatch, 'SHELL_ASSETS missing in sw.js');
  const assets = [...assetsMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const assetSet = new Set(assets);
  assert.ok(assets.length >= 10);
  for (const rel of assets) {
    if (rel === './') continue;
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `SW SHELL_ASSET does not exist on disk: ${rel}`);
  }
  for (const srcRel of srcFiles) {
    assert.ok(assetSet.has(`./${srcRel}`), `Module ./${srcRel} MUST be listed in sw.js SHELL_ASSETS for offline PWA support!`);
  }

  // 4. Zero dangerous sinks (eval, new Function, document.write, inline on*= handlers)
  for (const rel of ['index.html', ...srcFiles, 'sw.js']) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(!/\beval\s*\(/.test(content), `eval() found in ${rel}`);
    assert.ok(!/\bnew\s+Function\s*\(/.test(content), `new Function() found in ${rel}`);
    assert.ok(!/\bdocument\.write\s*\(/.test(content), `document.write() found in ${rel}`);
  }
  assert.equal([...html.matchAll(/\son[a-z]+\s*=/gi)].length, 0, 'Inline event handlers forbidden under strict CSP');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(css.includes('env(safe-area-inset-top') && css.includes('env(safe-area-inset-bottom'),
    'styles.css must guard both top (notch/Dynamic Island) and bottom safe-area insets for standalone PWA');
});

test('38. Kyoto Dst, NOAA Propagated SW & WSA-ENLIL parsers + chaos resilience + recovery-phase physics', () => {
  const nowMs = Date.parse('2026-11-24T12:00:00Z');
  // Chaos payloads must never throw
  for (const bad of [null, undefined, '', 42, {}, [], [null], [['time_tag', 'dst']], [{ time_tag: 'bad', dst: 'NaN' }]]) {
    assert.doesNotThrow(() => api.parseKyotoDst(bad, nowMs));
    assert.doesNotThrow(() => api.parsePropagatedSolarWind(bad, nowMs));
    assert.doesNotThrow(() => api.parseEnlilForecast(bad, nowMs));
  }

  // 1. Kyoto Dst object-array & legacy 2D-array formats + stale filter
  const dstObj = api.parseKyotoDst([
    { time_tag: '2026-11-24T10:00:00', dst: -120 },
    { time_tag: '2026-11-24T11:00:00', dst: -145 }
  ], nowMs);
  assert.equal(dstObj.dst, -145);
  assert.equal(dstObj.stormClass, 'intense');
  const dstLegacy = api.parseKyotoDst([['time_tag', 'dst'], ['2026-11-24 11:00:00', '-62']], nowMs);
  assert.equal(dstLegacy.dst, -62);
  assert.equal(dstLegacy.stormClass, 'moderate');
  assert.equal(api.parseKyotoDst([{ time_tag: '2026-11-20T00:00:00', dst: -100 }], nowMs), null);

  // Recovery-phase guard: moderate Dst -60 during quiet northward Bz must NOT inflate score, while intense Dst -150 boosts mid-lat
  const quietRecov = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -20, bz: 4, speed: 380, kp: 1.5, dst: -60 });
  const quietBase = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: -20, bz: 4, speed: 380, kp: 1.5, dst: 0 });
  assert.equal(quietRecov.total, quietBase.total, 'Quiet northward-Bz recovery phase Dst=-60 must not inflate score');

  const intenseMid = api.computeAuroraScore({ lat: 55.95, lon: -3.19, cloudNow: 0, sunAlt: -20, bz: -4, speed: 500, kp: 3.0, dst: -180, mlt: 0 });
  assert.equal(intenseMid.outOfZone, null, 'Intense ring-current storm Dst=-180 must unblock Edinburgh even if Kp lags');
  assert.ok(intenseMid.effKp >= 7.0, `Expected effKp >= 7.0 for Dst=-180, got ${intenseMid.effKp}`);

  // 2. NOAA Propagated Solar Wind ETA synchronization
  const prop = api.parsePropagatedSolarWind([
    ['time_tag', 'speed', 'density', 'temperature', 'bx', 'by', 'bz', 'bt', 'vx', 'vy', 'vz', 'propagated_time_tag'],
    ['2026-11-24T11:20:00Z', 310, 2.0, 40000, 1, 2, -3, 4, -310, 0, 0, '2026-11-24T12:24:00Z']
  ], nowMs);
  assert.equal(prop.etaMin, 64);
  const mag = Array.from({ length: 10 }, (_, i) => ({ time_tag: new Date(nowMs - (10 - i) * 60000).toISOString().slice(0, 19), bz: -5, by: 2 }));
  const balSync = api.computeBallisticCoupling(mag, 310, nowMs, prop.etaMin);
  assert.equal(balSync.etaMin, 64, 'computeBallisticCoupling should synchronize with NOAA official propagated ETA');
});

test('39. WSA-ENLIL CME/HSS parser handles reverse-chronological feed & tags matching 3-Night Outlook card', () => {
  const nowDate = new Date('2026-11-24T20:00:00Z');
  const nowMs = nowDate.getTime();
  // Reverse-chronological rows matching real NOAA enlil_time_series.json order
  const enlil = api.parseEnlilForecast([
    { time_tag: '2026-11-26T02:00:00', v_r: 680, earth_particles_per_cm3: 18, cloud: 1 },
    { time_tag: '2026-11-25T23:00:00', v_r: 620, earth_particles_per_cm3: 12, cloud: 1 },
    { time_tag: '2026-11-24T22:00:00', v_r: 360, earth_particles_per_cm3: 4, cloud: 0 }
  ], nowMs);
  assert.ok(enlil && enlil.hasCme && enlil.maxSpeed === 680 && enlil.active);

  const nights = api.summarize3NightOutlook({
    cloudPoints: [
      { dtMs: Date.parse('2026-11-24T22:00:00Z'), clear: 80, isDay: false },
      { dtMs: Date.parse('2026-11-25T23:00:00Z'), clear: 75, isDay: false }
    ],
    kpForecast: [], currentKp: 2.0,
    lat: 69.97, lon: 23.27, timeZone: 'UTC', nowDate, lang: 'en', enlilForecast: enlil
  });
  assert.equal(nights[0].enlilTag, '');
  assert.ok(nights[1].enlilTag.includes('CME ~680km/s'), `Expected Tomorrow night CME tag, got "${nights[1].enlilTag}"`);

  // GPS reverse-geocoding anti-Simplified-Chinese guard (BigDataCloud returns 北雷萨 even for zh-Hant)
  const zhGeo = { countryCode: 'NO', countryName: '挪威', city: '北雷萨', locality: '北雷萨' };
  const enGeo = { countryCode: 'NO', countryName: 'Norway', city: 'Nordreisa', locality: 'Nordreisa' };
  assert.equal(api.formatReverseGeo(zhGeo, 'zh', enGeo), '挪威・Nordreisa');
  assert.equal(api.formatReverseGeo(zhGeo, 'zh'), '挪威・北雷薩');
  assert.equal(api.formatReverseGeo({ countryCode: 'FI', countryName: '芬兰', city: '伊纳里' }, 'zh', { countryCode: 'FI', countryName: 'Finland', city: 'Inari' }), '芬蘭・Inari');
});

test('40. Dark-window countdown, distance km, Chinese search, cross-tab action synthesizer & Clear Sky % compass', () => {
  const cjkRe = /[\u3400-\u9fff\uf900-\ufaff]/;

  // 1. Distance km (Alta <-> Tromso ~173 km; Tromso <-> Reykjavik >1500 km)
  const dAltaTromso = api.computeDistanceKm(69.9689, 23.2716, 69.6492, 18.9553);
  assert.ok(dAltaTromso > 160 && dAltaTromso < 185, `Expected ~173 km, got ${dAltaTromso}`);
  const dTromsoRvk = api.computeDistanceKm(69.6492, 18.9553, 64.1466, -21.9426);
  assert.ok(dTromsoRvk > 1600, `Expected >1600 km, got ${dTromsoRvk}`);

  // 2. Chinese city query normalization (Traditional & Simplified)
  assert.equal(api.normalizeChineseCityQuery('冰島'), 'Reykjavik');
  assert.equal(api.normalizeChineseCityQuery('特罗姆瑟'), 'Tromso');
  assert.equal(api.normalizeChineseCityQuery('黃刀鎮'), 'Yellowknife');
  assert.equal(api.normalizeChineseCityQuery('Fairbanks'), 'Fairbanks');

  // 3. computeDarkWindow across all 4 Arctic regimes
  const dwWait = api.computeDarkWindow(new Date('2026-03-15T12:00:00Z'), 69.6492, 18.9553, 'Europe/Oslo');
  assert.equal(dwWait.state, 'twilight-wait');
  assert.ok(dwWait.nextDarkHM && dwWait.darkInMin > 60, `Expected valid dark countdown, got ${JSON.stringify(dwWait)}`);

  const dwDark = api.computeDarkWindow(new Date('2026-03-15T22:00:00Z'), 69.6492, 18.9553, 'Europe/Oslo');
  assert.equal(dwDark.state, 'dark');
  assert.ok(dwDark.darkEndHM && dwDark.darkRemainMin > 60, `Expected valid dawn countdown, got ${JSON.stringify(dwDark)}`);

  const dwPolarNight = api.computeDarkWindow(new Date('2026-12-21T12:00:00Z'), 78.15, 16.04, 'Arctic/Longyearbyen');
  assert.equal(dwPolarNight.state, 'polar-night');

  const dwMidnightSun = api.computeDarkWindow(new Date('2026-06-21T22:00:00Z'), 69.6492, 18.9553, 'Europe/Oslo');
  assert.equal(dwMidnightSun.state, 'midnight-sun');

  // 4. Unified Clear Sky % polarity in summarizeCompass & buildCompassRadarSVG
  const dirs = [
    { key: 'here', label: '📍 目前位置', lat: 69.6492, lon: 18.9553, avg3h: 85, nowC: 90, temp: -3, distKm: 0, isOcean: false },
    { key: 'E', label: '往東 Skibotn', lat: 69.39, lon: 20.27, avg3h: 20, nowC: 15, temp: -6, distKm: 62, isOcean: false },
    { key: 'N', label: '往北 Kvaløya', lat: 69.75, lon: 18.5, avg3h: 80, nowC: 80, temp: -2, distKm: 22, isOcean: false },
    { key: 'S', label: '往南 Balsfjord', lat: 69.24, lon: 19.22, avg3h: 70, nowC: 70, temp: -4, distKm: 47, isOcean: false },
    { key: 'W', label: '往西 Sommarøy', lat: 69.63, lon: 18.01, avg3h: 90, nowC: 90, temp: -1, distKm: 36, isOcean: false }
  ];
  const compZh = api.summarizeCompass(dirs, 'zh');
  const compEn = api.summarizeCompass(dirs, 'en');
  assert.equal(compZh.bestKey, 'E');
  assert.equal(compZh.bestClear, 80);
  assert.equal(compZh.hereClear, 15);
  assert.equal(compZh.diff, 65);
  assert.ok(compZh.text.includes('80%'), `Expected Clear Sky 80% in ZH compass summary: ${compZh.text}`);
  assert.ok(compEn.text.includes('80% clear') && !cjkRe.test(compEn.text), `Expected EN clear sky summary without CJK: ${compEn.text}`);

  const svgZh = api.buildCompassRadarSVG(dirs, { lat: 69.6492, lon: 18.9553 }, 'zh');
  const svgEn = api.buildCompassRadarSVG(dirs, { lat: 69.6492, lon: 18.9553 }, 'en');
  assert.ok(svgZh.includes('✓ 80%') && svgZh.includes('晴 15%'), 'ZH radar SVG should show Clear Sky % with status glyph');
  assert.ok(svgEn.includes('✓ 80%') && !cjkRe.test(svgEn), 'EN radar SVG should show Clear Sky % with status glyph and zero CJK');

  // 5. Cross-tab synthesizeTonightAction (DRIVE, GO, WAIT, SLEEP, DAYLIGHT)
  const scCloudyActive = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 88, sunAlt: -20, bz: -8, speed: 550, kp: 4 });
  const driveAct = api.synthesizeTonightAction({ lat: 69.65, lon: 18.96, sc: scCloudyActive, dirResults: dirs, kp: 4, lang: 'en' });
  assert.equal(driveAct.actionType, 'drive');
  assert.equal(driveAct.ctaView, 'dir');
  assert.ok(driveAct.lead.includes('80% clear') && driveAct.lead.includes('62 km') && !cjkRe.test(driveAct.title + driveAct.lead));

  const scClearActive = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 10, sunAlt: -20, bz: -8, speed: 550, kp: 4 });
  const goAct = api.synthesizeTonightAction({ lat: 69.65, lon: 18.96, sc: scClearActive, dirResults: dirs, kp: 4, lang: 'zh' });
  assert.equal(goAct.actionType, 'go');
  assert.equal(goAct.ctaView, null);

  const scDay = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 10, sunAlt: 10, bz: -5, speed: 450, kp: 3 });
  const dayAct = api.synthesizeTonightAction({ lat: 69.65, lon: 18.96, sc: scDay, darkWin: dwWait, kp: 3, lang: 'en' });
  assert.equal(dayAct.actionType, 'daylight');
  assert.ok(dayAct.lead.includes(dwWait.nextDarkHM) && !cjkRe.test(dayAct.lead));

  const allCloudyDirs = dirs.map(d => ({ ...d, avg3h: 92, nowC: 92 }));
  const scQuietCloudy = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 95, sunAlt: -20, bz: 3, speed: 340, kp: 1 });
  const sleepAct = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96, sc: scQuietCloudy, dirResults: allCloudyDirs,
    nights3: [
      { label: 'Tonight', tone: '', bestNightScore: 5, badge: 'Cloudy' },
      { label: 'Tomorrow', tone: 'good', bestNightScore: 52, badge: 'Promising' },
      { label: 'Wed', tone: 'good', bestNightScore: 84, badge: 'Promising' }
    ],
    kp: 1, lang: 'en'
  });
  assert.equal(sleepAct.actionType, 'sleep');
  assert.ok(sleepAct.lead.includes('Wed'), `Expected SLEEP to recommend strictly highest-scoring future night (Wed), got: ${sleepAct.lead}`);

  // 6. 3-Night Outlook exposes bestNightScore for highest-score highlight
  const nightsOrd = api.summarize3NightOutlook({
    cloudPoints: [
      { dtMs: Date.parse('2026-11-24T22:00:00Z'), clear: 65, isDay: false },
      { dtMs: Date.parse('2026-11-25T22:00:00Z'), clear: 95, isDay: false }
    ],
    kpForecast: [
      { ts: Date.parse('2026-11-24T21:00:00Z'), kp: 2.5 },
      { ts: Date.parse('2026-11-25T21:00:00Z'), kp: 5.5 }
    ],
    currentKp: 2.5, lat: 69.97, lon: 23.27, timeZone: 'UTC',
    nowDate: new Date('2026-11-24T20:00:00Z'), lang: 'en'
  });
  assert.ok(nightsOrd[1].bestNightScore > nightsOrd[0].bestNightScore, `Expected Night 2 score (${nightsOrd[1].bestNightScore}) > Night 1 (${nightsOrd[0].bestNightScore})`);
});

test('41. Modular storage.js (SWR LRU, legacy cleanup, corrupt-JSON recovery, offline hydration) & data-client.js (pure snapshot + abort)', async () => {
  // In-memory mock Storage
  const mem = new Map();
  const mockStore = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };

  // 1. Corrupt JSON self-heals & invalid coordinates are rejected
  mockStore.setItem(storage.STORAGE_KEYS.POS, '{broken json');
  assert.equal(storage.loadSavedPos(mockStore), null);
  assert.equal(mem.has(storage.STORAGE_KEYS.POS), false, 'Corrupt POS JSON should be auto-removed');
  assert.equal(storage.sanitizeSavedPos({ lat: 999, lon: 10 }), null);
  const cleanPos = storage.sanitizeSavedPos({ lat: 64.1466, lon: -21.9426, name: '<b>Bad</b>', tz: 'Not/A_TZ', mode: 'weird' });
  assert.equal(cleanPos.tz, 'auto');
  assert.equal(cleanPos.mode, 'manual');
  assert.ok(!cleanPos.name.includes('<'), 'sanitizeSavedPos must strip angle brackets');

  // 2. SWR cache enforces 5-city LRU cap, prevents cross-city pollution, and cleans up legacy v4 key
  const nowMs = Date.parse('2026-11-24T22:00:00Z');
  mockStore.setItem(storage.STORAGE_KEYS.LEGACY_CACHE, JSON.stringify({ ts: nowMs - 1000, lat: 69.97, lon: 23.27, score: { total: 50 } }));
  for (let i = 0; i < 6; i++) {
    const p = { lat: 60 + i * 2, lon: 10 + i * 2, tz: 'UTC' };
    storage.writeSwrCacheEntry(p, { ts: nowMs + i * 1000, lat: p.lat, lon: p.lon, score: { total: 40 + i } }, mockStore);
  }
  assert.equal(mem.has(storage.STORAGE_KEYS.LEGACY_CACHE), false, 'Writing v6 SWR must remove legacy v4 cache key');
  const swrMap = storage.readSwrCacheMap(mockStore);
  assert.equal(Object.keys(swrMap).length, storage.SWR_MAX_LOCATIONS, 'SWR cache must evict beyond SWR_MAX_LOCATIONS');
  assert.equal(storage.findMatchingOfflineCache({ lat: 60, lon: 10 }, nowMs + 10000, mockStore), null, 'Oldest 6th city must be evicted');
  assert.equal(storage.findMatchingOfflineCache({ lat: 70, lon: 20 }, nowMs + 10000, mockStore)?.score?.total, 45);

  // 3. Pure computeLiveSnapshot + buildSwrPayload + hydrateOfflineState full round-trip
  const pos = { name: '挪威・Alta', nameEn: 'Norway · Alta', lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo' };
  const now = new Date('2026-11-24T22:00:00Z');
  const hereHrs = Array.from({ length: 12 }, (_, i) => ({
    dtMs: now.getTime() + i * 3600000,
    time: `${String((23 + i) % 24).padStart(2, '0')}:00`,
    block: 15, clear: 85, temp: -5, windMs: 3, windChill: -9, precip: 0, txt: '🌟 晴', isDay: false
  }));
  const snap = dataClient.computeLiveSnapshot({
    pos, now,
    noaa: {
      magSeries: [{ time_tag: '2026-11-24T21:55:00', bz: -7, by: 2 }],
      windSeries: [{ time_tag: '2026-11-24T21:55:00', speed: 520, density: 6 }],
      kpForecast: [], bz: -7, speed: 520, kp: 4.0, ovation: 65, hpiGw: 55, noaaOk: true, noaaLagMin: 5
    },
    wx: {
      hereHrs, multiDayPts: [{ dtMs: now.getTime(), clear: 85, isDay: false }],
      dirResults: [{ key: 'here', label: '📍 目前位置', lat: pos.lat, lon: pos.lon, avg3h: 15, nowC: 15, temp: -5, distKm: 0 }],
      weatherSourceLabel: 'Yr.no官方', usedMet: true, cloudConsensus: null
    },
    moon: api.getMoonState(now, pos.lat, pos.lon)
  });
  assert.ok(snap.renderState.sc.total >= 50 && snap.scoredHours.length === 12);

  const payload = storage.buildSwrPayload({
    pos, lang: 'en', posName: pos.nameEn, snapshot: snap.renderState,
    verdict: { title: 'Go', lead: 'Clear' }, skySub: '-5°C', aurSub: 'Kp 4.0', darkSub: 'Dark', nowMs: now.getTime()
  });
  const rehydrated = storage.hydrateOfflineState(payload, pos, now.getTime() + 120000);
  assert.ok(rehydrated && rehydrated.scoredHours.length === 12 && rehydrated.renderState.sc.total === snap.renderState.sc.total);

  // 4. fetchWithTimeout respects parent AbortSignal immediately
  const parentCtrl = new AbortController();
  parentCtrl.abort();
  await assert.rejects(
    () => dataClient.fetchWithTimeout('https://example.test', {
      signal: parentCtrl.signal,
      fetchImpl: (_u, { signal }) => new Promise((_, rej) => {
        if (signal.aborted) rej(new Error('Aborted'));
      })
    }),
    /Aborted/
  );
});

test('42. Winter safety gates, geodesic 70°N cache, 3-sector radar SVG, sustained 3-Night outlook & global extreme edge cases', () => {
  // 1. Gale & blowing-snow corridors must NEVER be promoted to DRIVE
  const blizzardDirs = [
    { key: 'here', label: '📍 目前位置', avg3h: 92, isOcean: false, temp: -6, maxWind3h: 4, maxPrecip3h: 0 },
    { key: 'N', label: '往北 Lyngen', avg3h: 15, isOcean: false, roadKm: 75, temp: -8, maxWind3h: 15, maxPrecip3h: 0.4 },
    { key: 'S', label: '往南 Skibotn', avg3h: 20, isOcean: false, roadKm: 118, temp: -5, maxWind3h: 10, maxPrecip3h: 0.6 },
    { key: 'E', label: '往東 Kvaløya', avg3h: 88, isOcean: false, roadKm: 35, temp: -4, maxWind3h: 5, maxPrecip3h: 0 }
  ];
  assert.equal(api.isCorridorHazard(blizzardDirs[1]), true, '15 m/s gale must be hazard');
  assert.equal(api.isCorridorHazard(blizzardDirs[2]), true, '10 m/s + freezing precip blowing snow must be hazard');
  assert.equal(api.isCorridorHazard(blizzardDirs[3]), false, '5 m/s calm route must not be hazard');

  const sumHazZh = api.summarizeCompass(blizzardDirs, 'zh');
  const sumHazEn = api.summarizeCompass(blizzardDirs, 'en');
  assert.equal(sumHazZh.good, false, 'Must not recommend driving when only clearer routes are hazardous');
  assert.equal(sumHazZh.hazardOnly, true);
  assert.match(sumHazZh.text, /強風／吹雪|風險/);
  assert.match(sumHazEn.text, /hazardous|high wind/i);

  const actHaz = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96,
    sc: { total: 12, skyScore: 10, auroraScore: 72, darkScore: 100, isTooBright: false, outOfZone: null, effKp: 4, magLat: 66.5 },
    dirResults: blizzardDirs, kp: 4.0, lang: 'en'
  });
  assert.notEqual(actHaz.actionType, 'drive', 'synthesizeTonightAction must NEVER recommend DRIVE into gale/blizzard');

  // When a safe clear route ALSO exists alongside a gale route, prefer the safe route
  const mixedDirs = [
    blizzardDirs[0],
    blizzardDirs[1],
    { key: 'S', label: '往南 Skibotn', avg3h: 22, isOcean: false, roadKm: 118, temp: -7, maxWind3h: 4, maxPrecip3h: 0 }
  ];
  const sumSafe = api.summarizeCompass(mixedDirs, 'en');
  assert.equal(sumSafe.good, true);
  assert.equal(sumSafe.bestKey, 'S', 'Must pick safe clear Skibotn over gale-force Lyngen');
  const actSafe = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96,
    sc: { total: 12, skyScore: 10, auroraScore: 72, darkScore: 100, isTooBright: false, outOfZone: null, effKp: 4, magLat: 66.5 },
    dirResults: mixedDirs, kp: 4.0, lang: 'en'
  });
  assert.equal(actSafe.actionType, 'drive');
  assert.match(actSafe.lead, /118 km road/, 'Drive lead must cite verified roadKm');

  // 2. High-latitude 70°N offline SWR cache uses true geodesic km (<= 20 km), not broken degree hypot
  const mem = new Map();
  const mockStore = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
  const nowMs = Date.parse('2026-11-24T22:00:00Z');
  storage.writeSwrCacheEntry({ lat: 70.0, lon: 23.0 }, { ts: nowMs, lat: 70.0, lon: 23.0, score: { total: 77 } }, mockStore);
  // 0.30° E at 70°N is only ~11.4 km (old Math.hypot <= 0.15 wrongly missed it!)
  assert.equal(storage.findMatchingOfflineCache({ lat: 70.0, lon: 23.3 }, nowMs + 60000, mockStore)?.score?.total, 77);
  // 0.80° E at 70°N is ~30.5 km (> 20 km) -> must NOT match
  assert.equal(storage.findMatchingOfflineCache({ lat: 70.0, lon: 23.8 }, nowMs + 60000, mockStore), null);

  // 3. 3-sector buildCompassRadarSVG (Akureyri / Abisko / Yellowknife / Tekapo): zero Google Maps <a> links + non-color glyphs
  const akureyriPts = api.computeCompassPoints(65.6885, -18.1262);
  assert.equal(akureyriPts.length, 4, 'Akureyri has here + 3 winter-open corridors (no closed F26 south)');
  const akDirs = akureyriPts.map((p, i) => ({
    ...p, avg3h: i === 1 ? 15 : (i === 2 ? 50 : 20), maxWind3h: i === 3 ? 14 : 3, maxPrecip3h: 0, temp: -4
  }));
  const akSvgEn = api.buildCompassRadarSVG(akDirs, { lat: 65.6885, lon: -18.1262 }, 'en');
  const akSvgZh = api.buildCompassRadarSVG(akDirs, { lat: 65.6885, lon: -18.1262 }, 'zh');
  assert.ok(akSvgEn.includes('No Winter Rd') && akSvgZh.includes('無冬季路'), 'Closed direction must show No Winter Rd');
  assert.ok(akSvgEn.includes('✓ 85%') && akSvgEn.includes('~ 50%') && akSvgEn.includes('⚠ 80%'), 'SVG wedges must render Red-Light-safe status glyphs');
  assert.ok(!akSvgEn.includes('google.com/maps') && !akSvgEn.includes('<a '), 'SVG wedges must NOT contain accidental Google Maps links');

  // 4. 3-Night Outlook anti-cherry-pick: 1 fluke clear hour in overcast night averages to 2h sustained clear sky
  const flukePts = [
    { dtMs: Date.parse('2026-11-24T20:00:00Z'), clear: 10, block: 90, isDay: false },
    { dtMs: Date.parse('2026-11-24T21:00:00Z'), clear: 80, block: 20, isDay: false },
    { dtMs: Date.parse('2026-11-24T22:00:00Z'), clear: 10, block: 90, isDay: false },
    { dtMs: Date.parse('2026-11-24T23:00:00Z'), clear: 10, block: 90, isDay: false }
  ];
  const n3 = api.summarize3NightOutlook({
    cloudPoints: flukePts,
    kpForecast: [{ ts: Date.parse('2026-11-24T21:00:00Z'), kp: 3.0 }],
    currentKp: 3.0, lat: 69.97, lon: 23.27, timeZone: 'Europe/Oslo',
    nowDate: new Date('2026-11-24T19:00:00Z'), lang: 'en'
  });
  assert.equal(n3[0].bestClear, 45, 'Single fluke 80% hour flanked by 10% overcast must average to 45% (2h sustained)');
  assert.equal(n3[0].clearDarkHrs, 1);

  // 5. Global extremes (Antimeridian, Antarctica, Equator, Pole) & 5 new hubs (Inari, Kiruna, Akureyri, Whitehorse, Tekapo)
  for (const [lat, lon] of [[-44.0, 179.9], [-77.85, 166.67], [0.0, 0.0], [89.5, 0.0]]) {
    const pts = api.computeCompassPoints(lat, lon, 60);
    assert.equal(pts.length, 5);
    assert.equal(pts[1].isGeneric, true, 'Non-hub generic fallback points must carry isGeneric=true');
    for (const p of pts) {
      assert.ok(Number.isFinite(p.lat) && p.lat >= -90 && p.lat <= 90);
      assert.ok(Number.isFinite(p.lon) && p.lon >= -180 && p.lon <= 180);
    }
    const sc = api.computeAuroraScore({ lat, lon, cloudNow: 20, sunAlt: -15, kp: 3, bz: -3, speed: 450 });
    assert.ok(Number.isFinite(sc.total) && sc.total >= 0 && sc.total <= 99);
  }
  for (const [lat, lon, zhKey, enKey] of [
    [68.9060, 27.0275, 'Inari', 'Finland · Inari'],
    [67.8558, 20.2253, 'Kiruna', 'Sweden · Kiruna'],
    [65.6885, -18.1262, 'Akureyri', 'Iceland · Akureyri'],
    [60.7212, -135.0568, 'Whitehorse', 'Canada · Whitehorse'],
    [-44.0047, 170.4771, 'Lake Tekapo', 'New Zealand · Lake Tekapo']
  ]) {
    const m = api.matchKnownCity(lat, lon);
    assert.ok(m && m.zh.includes(zhKey) && m.en === enKey, `Missing KNOWN_CITIES entry for ${enKey}`);
  }
  assert.equal(api.normalizeChineseCityQuery('阿克雷里'), 'Akureyri');
  assert.equal(api.normalizeChineseCityQuery('蒂卡波'), 'Lake Tekapo');
});

test('43. Global dual-model NWP routing/blending & Airport METAR Laser Ceilometer Optimal Interpolation', () => {
  const nowMs = Date.parse('2026-11-24T21:30:00Z');

  // 1. Station matching (all key hubs within 55 km; distant ocean/Tokyo returns null)
  const nearTromso = api.findNearestMetarStation(69.6492, 18.9553);
  assert.equal(nearTromso?.icao, 'ENTC');
  assert.ok(nearTromso.distKm <= 10);
  const nearMsp = api.findNearestMetarStation(44.9778, -93.2650);
  assert.equal(nearMsp?.icao, 'KMSP');
  assert.equal(nearMsp?.iemId, 'MSP', 'CONUS US stations must use 3-letter FAA ID on IEM');
  assert.equal(api.findNearestMetarStation(35.6762, 139.6503), null, 'Tokyo outside 55km registry must return null');
  assert.equal(api.findNearestMetarStation(NaN, 18), null);

  // 2. IEM JSON & MET Norway raw METAR parsers + 90-min freshness / chaos rejection
  const iemOvc = api.parseIemMetarCurrent({
    data: [{ station: 'CYZF', utc_valid: '2026-11-24T21:00:00Z', skyc1: 'OVC', skyl1: 300, wxcodes: ['-SN', 'BR'], raw: 'CYZF 242100Z OVC003 -SN BR' }]
  }, nowMs);
  assert.ok(iemOvc && iemOvc.effCloud === 100 && iemOvc.ceilingM === 91 && iemOvc.skyCode === 'OVC' && iemOvc.ageMin === 30);

  const iemClr = api.parseIemMetarCurrent({
    data: [{ station: 'PAFA', utc_valid: '2026-11-24T21:10:00Z', skyc1: 'CLR', skyl1: null, raw: 'PAFA 242110Z CLR' }]
  }, nowMs);
  assert.ok(iemClr && iemClr.effCloud === 0 && iemClr.clearPct === 100 && iemClr.ceilingM === null);

  // Stale (>90m) & malformed payloads must safely return null
  assert.equal(api.parseIemMetarCurrent({ data: [{ station: 'PAFA', utc_valid: '2026-11-24T19:00:00Z', skyc1: 'CLR' }] }, nowMs), null);
  assert.equal(api.parseIemMetarCurrent(null, nowMs), null);
  assert.equal(api.parseIemMetarCurrent({ data: [{}] }, nowMs), null);

  const metNo = api.parseMetNorwayMetarText(
    'ENTC 242050Z 19010KT 9999 FEW012 01/M01 Q1029=\nENTC 242120Z 19014KT 9999 -RA SCT008 BKN011 01/M00 Q1028=',
    nowMs
  );
  assert.ok(metNo && metNo.icao === 'ENTC' && metNo.ageMin === 10 && metNo.effCloud >= 85 && metNo.ceilingM === 335);
  assert.equal(api.parseMetNorwayMetarText('garbage text', nowMs), null);

  // 3. Strictly causal Optimal Interpolation assimilation (innovation decays across +0h..+3h, untouched at +4h)
  const baseHrs = Array.from({ length: 6 }, (_, i) => ({
    time: `${String(21 + i).padStart(2, '0')}:00`, dtMs: nowMs + i * 3600000,
    block: 10, clear: 90, txt: '🌟 晴', temp: -5, precip: 0, windMs: 2, isDay: false, sunAlt: -20
  }));
  const fus = api.assimilateMetarNowcast(baseHrs, iemOvc, 5);
  assert.equal(fus.applied, true);
  assert.equal(fus.discrepancyFlag, true, '90% forecast-vs-METAR gap must flag discrepancy');
  assert.ok(fus.hours[0].block > fus.hours[1].block && fus.hours[1].block > fus.hours[2].block && fus.hours[2].block > fus.hours[3].block, 'OI weight must decay monotonically +0h -> +3h');
  assert.equal(fus.hours[4].block, 10, 'Hours >= +4h must remain untouched NWP forecast');
  assert.equal(fus.hours[0].block + fus.hours[0].clear, 100);
  // Distant station (>55km) must NOT be assimilated
  assert.equal(api.assimilateMetarNowcast(baseHrs, iemOvc, 80).applied, false);

  // 4. Regional dual-model selector, extractor, 50/50 blender & global dual-model confidence
  assert.equal(api.selectOpenMeteoModels(69.65, 18.96), null, 'Nordic box uses MET Norway primary');
  assert.deepEqual(api.selectOpenMeteoModels(64.13, -21.94), ['best_match', 'icon_seamless'], 'Iceland must use best_match + icon_seamless');
  assert.deepEqual(api.selectOpenMeteoModels(62.46, -114.44), ['best_match', 'ecmwf_ifs025'], 'Canada/Global must use best_match + ecmwf_ifs025');

  const multiHourly = {
    time: [Math.floor(nowMs / 1000), Math.floor(nowMs / 1000) + 3600],
    cloud_cover_best_match: [20, 40], cloud_cover_low_best_match: [20, 40], cloud_cover_mid_best_match: [0, 0], cloud_cover_high_best_match: [0, 0],
    cloud_cover_icon_seamless: [80, 60], cloud_cover_low_icon_seamless: [80, 60], cloud_cover_mid_icon_seamless: [0, 0], cloud_cover_high_icon_seamless: [0, 0],
    precipitation_best_match: [0, 0], temperature_2m_best_match: [1, 1], wind_speed_10m_best_match: [10, 10]
  };
  const hBm = api.extractOpenMeteoModelHourly(multiHourly, 'best_match');
  const hIc = api.extractOpenMeteoModelHourly(multiHourly, 'icon_seamless');
  const hrs1 = api.parseOpenMeteoHourly12(hBm, 64.13, -21.94, 'Atlantic/Reykjavik', new Date(nowMs), 0);
  const hrs2 = api.parseOpenMeteoHourly12(hIc, 64.13, -21.94, 'Atlantic/Reykjavik', new Date(nowMs), 0);
  const blended = api.blendHourlyForecasts(hrs1, hrs2);
  assert.equal(blended[0].block, 50, '50/50 physical blend of 20% and 80% must equal 50%');
  assert.equal(blended[1].block, 50, '50/50 physical blend of 40% and 60% must equal 50%');

  // Global dual-model consensus outside Nordics must unlock High confidence & NOT claim MET Norway 2.5km
  const expGlobal = api.explainAuroraScore({
    lat: 64.13, lon: -21.94, cloudNow: 15, sunAlt: -20, bz: -5, speed: 500, kp: 3.5,
    usedMet: false, noaaOk: true, noaaLagMin: 5, lang: 'en',
    cloudConsensus: { metAvg3h: 15, omAvg3h: 20, diffPct: 5, mae3h: 5, matchedHours: 3, level: 'high' }
  });
  assert.equal(expGlobal.confidence.level, 'high', 'Dual-model consensus outside Nordics must achieve High confidence');
  assert.ok(!expGlobal.confidence.headline.includes('MET Norway'), `Non-Nordic confidence copy must not mention MET Norway: ${expGlobal.confidence.headline}`);

  // 5. Hardened METAR edge-case regressions (TEMPO/RMK strip, CB/VV///, compound -DZRA, Feb-31 Date.UTC rollover)
  const tempoClr = api.parseMetNorwayMetarText('ENTC 242120Z 19008KT CAVOK 01/M01 Q1028 TEMPO BKN015 RMK WIND 2600FT 30017KT=', nowMs);
  assert.ok(tempoClr && tempoClr.effCloud === 0 && tempoClr.skyCode === 'CLR', 'Future TEMPO BKN015 must NOT overwrite current CAVOK');
  const cbSky = api.parseMetarSkyCover([], [], '', 'ENTC 242120Z 19014KT 9999 -DZRA BKN008CB 01/M00 Q1028');
  assert.ok(cbSky && cbSky.effCloud >= 85 && cbSky.skyCode === 'BKN' && cbSky.ceilingM === 244 && cbSky.hasPrecipFog, 'Must parse BKN008CB and compound -DZRA');
  const vvObs = api.parseMetarSkyCover([], [], '', 'CYZF 242100Z 02008KT 1/2SM SN VV/// M10/M10');
  assert.ok(vvObs && vvObs.effCloud === 100 && vvObs.skyCode === 'VV', 'VV/// obscured sky must yield effCloud=100, skyCode=VV');
  const snOnly = api.parseMetarSkyCover([], [], '-SN', 'ENTC 242100Z -SN');
  assert.ok(snOnly && snOnly.skyCode === 'WX' && snOnly.effCloud >= 85, 'Snow without sky layer must NOT return skyCode CLR');
  // Feb 31 Date.UTC rollover guard: Jan 31 METAR evaluated on Mar 4 must be rejected as stale (NOT wrapped to Mar 3!)
  const mar4Ms = Date.parse('2026-03-04T00:10:00Z');
  assert.equal(api.parseMetNorwayMetarText('ENTC 312350Z 19008KT CAVOK 00/M02 Q1010=', mar4Ms), null, 'Date.UTC Feb-31 rollover must not resurrect stale Jan-31 METAR');
});

test('44. Overcast CME shock verdict never contradicts score with fake rising copy', () => {
  const scNow = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 91, sunAlt: -20, bz: -8, speed: 550, kp: 5 });
  const scNext = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 95, sunAlt: -20, bz: -12, speed: 650, kp: 5 });
  const actZh = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96, sc: scNow, scNext, bal: { etaMin: 34, shockActive: true }, lang: 'zh'
  });
  const actEn = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96, sc: scNow, scNext, bal: { etaMin: 34, shockActive: true }, lang: 'en'
  });
  assert.ok(!actZh.lead.includes('升至'), `Overcast shock must not say 升至 when scNext=${scNext.total}: ${actZh.lead}`);
  assert.ok(actZh.lead.includes('厚雲') && actZh.ctaView === 'dir', 'Overcast shock must warn about clouds and link to Clear-Sky Radar');
  assert.ok(!actEn.title.toLowerCase().includes('rising') && actEn.ctaView === 'dir', `EN overcast shock must not claim rising: ${actEn.title}`);

  // Chart 2: ★ HH:MM Best badge must stay anchored over far-left best hour (x=56), never shifted to middle daytime!
  const hrsLeftBest = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((6 + i) % 24).padStart(2, '0')}:00`,
    clear: i === 0 ? 63 : 30, block: i === 0 ? 37 : 70, score: i === 0 ? 18 : 0, temp: 2,
    isDay: i >= 3 && i <= 8
  }));
  const svgLeft = api.buildSkyWaveSVG(hrsLeftBest, hrsLeftBest[0], 0, 'zh');
  assert.ok(svgLeft.includes('★ 06:00 最佳'), 'Best badge must include exact best hour 06:00');
  assert.ok(svgLeft.includes('x1="56.0" y1="22"'), 'Best vertical pointer stem must anchor directly to 06:00 (x=56)');
  assert.ok(svgLeft.includes('x="56.0" y="2"'), 'Best pill must sit at left edge above 06:00, not shifted to x=224');
  assert.ok(svgLeft.includes('白天過亮'), 'Contiguous daylight band must be clearly labeled');
});

test('45. Gate 0B parity & edge-case regressions (hour[0] Hero match, BR mist, CME warn, 6h Night+2, view strip, Abisko)', async () => {
  const { computeLiveSnapshot } = await import('../src/data-client.js');

  // 1. hour[0] score must strictly equal Hero Ring sc.total even with upstream L1 shock + Kyoto Dst -160 nT + twilight boundary
  const now = new Date('2026-03-20T17:05:00Z'); // Near twilight in Alta (69.97°N)
  const hrs12 = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((18 + i) % 24).padStart(2, '0')}:00`,
    dtMs: now.getTime() + i * 3600000 + 1500000,
    block: 10, clear: 90, txt: '🌟 晴', temp: -4, precip: 0, windMs: 3, windChill: -7,
    isDay: false, sunAlt: -12 // Intentionally differs from now sunAlt to test nowOverride parity
  }));
  const magSeries = [
    { time_tag: '2026-03-20 16:00:00.000', bz: -2, by: 1 },
    { time_tag: '2026-03-20 17:04:00.000', bz: -14, by: 2 }
  ];
  const windSeries = [
    { time_tag: '2026-03-20 16:00:00.000', speed: 380, density: 4 },
    { time_tag: '2026-03-20 17:04:00.000', speed: 700, density: 28 } // Upstream L1 shock NOT yet at Earth
  ];
  const pos = { name: '挪威・Alta', nameEn: 'Norway · Alta', lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo' };
  const moon = api.getMoonState(now, pos.lat, pos.lon);
  const snap = computeLiveSnapshot({
    pos, now, moon,
    noaa: { magSeries, windSeries, kpForecast: [], bz: -14, speed: 700, kp: 4.0, ovation: 55, hpiGw: 45, kyotoDst: { dst: -160 }, noaaOk: true },
    wx: { hereHrs: hrs12, multiDayPts: [], dirResults: [] }
  });
  assert.equal(snap.scoredHours[0].score, snap.renderState.sc.total, 'hours[0].score must exactly match Hero Ring sc.total');

  // 2. parseMetarSkyCover excludes shallow mist (BR) from 85% overcast clamp
  const brClear = api.parseMetarSkyCover(['CLR'], [null], 'BR', 'ENTC 242100Z 00000KT 3000 BR SKC M18/M20 Q1024');
  assert.ok(brClear && brClear.effCloud === 0 && !brClear.hasPrecipFog, `Clear sky with runway mist BR must stay clear, got ${brClear?.effCloud}%`);

  // 3. parseNoaaAlerts distinguishes CME Sudden Impulse WARNING from arrived SUMMARY
  const tNow = Date.parse('2026-03-20T18:00:00Z');
  const cmeWarn = api.parseNoaaAlerts([
    { product_id: 'WARSUD', issue_datetime: '2026-03-20 17:40:00.000', message: 'WARNING: Geomagnetic Sudden Impulse expected' }
  ], tNow);
  assert.equal(cmeWarn.kind, 'cme-shock');
  assert.equal(cmeWarn.isWarning, true, 'WARSUD warning must set isWarning=true');
  const cmeArr = api.parseNoaaAlerts([
    { product_id: 'EF3A', issue_datetime: '2026-03-20 17:40:00.000', message: 'SUMMARY: Geomagnetic Sudden Impulse 24 nT' }
  ], tNow);
  assert.equal(cmeArr.kind, 'cme-shock');
  assert.equal(cmeArr.isWarning, false, 'EF3A arrival summary must set isWarning=false');

  // 4. parseMetNorwayMultiDay preserves 6h step duration & next_6_hours precipitation; 3-Night sums real hours & avoids false mid-lat Kp gate when Kp missing
  const met6h = {
    properties: {
      timeseries: [
        { time: '2026-11-26T18:00:00Z', data: { instant: { details: { cloud_area_fraction: 10, cloud_area_fraction_low: 10, cloud_area_fraction_medium: 0, cloud_area_fraction_high: 0 } }, next_6_hours: { details: { precipitation_amount: 0 } } } },
        { time: '2026-11-27T00:00:00Z', data: { instant: { details: { cloud_area_fraction: 10, cloud_area_fraction_low: 10, cloud_area_fraction_medium: 0, cloud_area_fraction_high: 0 } }, next_6_hours: { details: { precipitation_amount: 0 } } } },
        { time: '2026-11-27T06:00:00Z', data: { instant: { details: { cloud_area_fraction: 10, cloud_area_fraction_low: 10, cloud_area_fraction_medium: 0, cloud_area_fraction_high: 0 } }, next_6_hours: { details: { precipitation_amount: 9.0 } } } }
      ]
    }
  };
  const mdPts = api.parseMetNorwayMultiDay(met6h, 69.97, 23.27, 'Europe/Oslo', new Date('2026-11-24T20:00:00Z'));
  assert.equal(mdPts[0].stepHrs, 6, '6-hour MET Norway step must record stepHrs=6');
  assert.ok(mdPts[2].block >= 65, `Heavy next_6_hours precipitation (9mm/6h=1.5mm/h) must occlude sky, got ${mdPts[2].block}`);
  const osloNights = api.summarize3NightOutlook({
    cloudPoints: mdPts, kpForecast: [], currentKp: 2.0,
    lat: 59.91, lon: 10.75, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-24T20:00:00Z'), lang: 'en'
  });
  assert.equal(osloNights[2].kpAvailable, false);
  assert.equal(osloNights[2].badge, 'Pending', `Mid-lat +2 Nights with missing Kp must show Pending, not false Kp gate: ${osloNights[2].badge}`);
  assert.ok(osloNights[2].clearDarkHrs >= 12, `6h MET Norway clear steps must sum to >=12 hrs, got ${osloNights[2].clearDarkHrs}`);

  // 5. buildShareUrl strips transient ?view=dir shortcut param; Abisko corridor puts Torneträsk E and Kiruna S
  const cleanedUrl = api.buildShareUrl('https://peteryux.github.io/nordic-aurora-radar/?view=dir&lang=zh', pos, 'en');
  assert.ok(!cleanedUrl.includes('view='), `buildShareUrl must strip transient view param: ${cleanedUrl}`);
  const abiskoPts = api.computeCompassPoints(68.3495, 18.8312);
  const abE = abiskoPts.find(p => p.key === 'E');
  const abS = abiskoPts.find(p => p.key === 'S');
  assert.ok(abE?.label.includes('Torneträsk') && abS?.label.includes('Kiruna'), 'Abisko E must be Torneträsk and S must be Kiruna');
});

test('46. Gate 1 1P UX regressions: honest Cloudy <30% 3-Night verdict & consumer Overview zero-jargon contract', () => {
  // 1. Reproduces real-device screenshot case (20% clear sky, Kp 2.7, no G2+ storm):
  //    must honestly classify as Cloudy / 雲偏厚 instead of misleading Watchable / 可留意
  const nowDate = new Date('2026-11-24T18:00:00Z');
  const cloudyPts = [
    { dtMs: Date.parse('2026-11-24T20:00:00Z'), clear: 20, isDay: false },
    { dtMs: Date.parse('2026-11-24T21:00:00Z'), clear: 20, isDay: false },
    { dtMs: Date.parse('2026-11-24T22:00:00Z'), clear: 18, isDay: false },
    { dtMs: Date.parse('2026-11-25T21:00:00Z'), clear: 82, isDay: false },
    { dtMs: Date.parse('2026-11-25T22:00:00Z'), clear: 85, isDay: false }
  ];
  const kpF = [
    { ts: Date.parse('2026-11-24T21:00:00Z'), kp: 2.7 },
    { ts: Date.parse('2026-11-25T21:00:00Z'), kp: 3.3 }
  ];
  const zhNights = api.summarize3NightOutlook({
    cloudPoints: cloudyPts, kpForecast: kpF, currentKp: 2.7,
    lat: 69.97, lon: 23.27, timeZone: 'Europe/Oslo', nowDate, lang: 'zh'
  });
  const enNights = api.summarize3NightOutlook({
    cloudPoints: cloudyPts, kpForecast: kpF, currentKp: 2.7,
    lat: 69.97, lon: 23.27, timeZone: 'Europe/Oslo', nowDate, lang: 'en'
  });
  assert.equal(zhNights[0].badge, '雲偏厚', `20% clear / Kp 2.7 must classify as 雲偏厚, got ${zhNights[0].badge}`);
  assert.equal(zhNights[0].tone, '', `20% clear / Kp 2.7 must not get warm/good tone, got ${zhNights[0].tone}`);
  assert.equal(enNights[0].badge, 'Cloudy', `20% clear / Kp 2.7 must classify as Cloudy, got ${enNights[0].badge}`);
  assert.equal(zhNights[1].tone, 'good', 'Clear 82%+ night must stay good');

  // 2. Consumer UI (src/app.js) must NOT render od-enlil (CME ~489km/s) jargon onto 3-Night Outlook cards
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  assert.ok(!appSrc.includes('od-enlil'), 'Consumer 3-Night Outlook cards must not render od-enlil CME speed jargon');
  assert.ok(appSrc.includes('syncBannerBudget'), 'App must enforce Banner Budget = 1 arbitration');
});



