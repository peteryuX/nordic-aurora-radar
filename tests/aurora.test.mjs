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
  assert.equal(api.tGrade(hobart.grade, 'en'), 'Needs storm');
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
  const bzTicks = [...bzSvg.matchAll(/<text[^>]*y="150"[^>]*>(\d{2}:\d{2})<\/text>/g)].map(m => m[1]);
  assert.deepEqual(bzTicks, ['22:30', '23:00', '23:30'], `Expected uniform 30-min ticks, got ${JSON.stringify(bzTicks)}`);
  assert.equal(api.utcTagToLocalHM('2026-11-23T20:59:00', 'Europe/Oslo', 60), '22:59');

  const hrs = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((22 + i) % 24).padStart(2, '0')}:00`,
    clear: i === 3 ? 90 : 50, block: i === 3 ? 10 : 50,
    score: i === 3 ? 72 : 30, temp: -2, isDay: false
  }));
  const waveSvg = api.buildSkyWaveSVG(hrs, hrs[3], 5, 'zh');
  assert.ok(waveSvg.includes('class="sc-bar"') && !waveSvg.includes('<polyline') && !waveSvg.includes('NaN') && !waveSvg.includes('undefined'));
  const waveTicks = [...waveSvg.matchAll(/<text[^>]*y="148"[^>]*>(\d{2}:\d{2})<\/text>/g)].map(m => m[1]);
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
    { name: '挪威 · Tromsø', nameEn: 'Norway · Tromsø', lat: 69.6492, lon: 18.9553 },
    'en'
  );
  const parsed = api.parseUrlLocation(new URL(built).search);
  assert.ok(parsed);
  assert.equal(parsed.lat, 69.6492);
  assert.equal(parsed.lon, 18.9553);
  assert.equal(parsed.name, '挪威 · Tromsø');
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
  assert.ok(svg1.includes('太陽風能量') && svg2.includes('觀測指數'), 'Both charts must label their single Y-axis metric clearly');
});

test('29. Bilingual city localization repairs cached/URL Chinese names when switching to English', () => {
  const staleAlta = { name: '挪威 · 阿爾塔', nameEn: '挪威 · 阿爾塔', lat: 69.9689, lon: 23.2716 };
  assert.equal(api.resolveCityDisplayName(staleAlta, 'en'), 'Norway · Alta');
  assert.equal(api.resolveCityDisplayName(staleAlta, 'zh'), '挪威 · Alta');

  const parsedAlta = api.parseUrlLocation('?lat=69.9689&lon=23.2716&name=%E6%8C%AA%E5%A8%81%E3%83%BB%E9%98%BF%E7%88%BE%E5%A1%94');
  assert.equal(parsedAlta.name, '挪威 · Alta');
  assert.equal(parsedAlta.nameEn, 'Norway · Alta');

  const parsedCustom = api.parseUrlLocation('?lat=25.0330&lon=121.5654&name=%E5%8F%B0%E7%81%A3%E3%83%BB%E5%8F%B0%E5%8C%97');
  assert.equal(parsedCustom.name, '台灣 · 台北');
  assert.equal(parsedCustom.nameEn, '');

  const geoEn = { countryName: 'Norway', city: 'Alta', locality: 'Bossekop' };
  assert.equal(api.formatReverseGeo(geoEn, 'en'), 'Norway · Alta (Bossekop)');
  const geoZh = { countryName: '挪威', city: '阿爾塔', locality: '市中心' };
  assert.equal(api.formatReverseGeo(geoZh, 'zh'), '挪威 · 阿爾塔（市中心）');
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
  assert.equal(api.formatReverseGeo(zhGeo, 'zh', enGeo), '挪威 · Nordreisa');
  assert.equal(api.formatReverseGeo(zhGeo, 'zh'), '挪威 · 北雷薩');
  assert.equal(api.formatReverseGeo({ countryCode: 'FI', countryName: '芬兰', city: '伊纳里' }, 'zh', { countryCode: 'FI', countryName: 'Finland', city: 'Inari' }), '芬蘭 · Inari');
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
  assert.ok(svgZh.includes('✓ 80%') && svgZh.includes('晴空 15%') && svgZh.includes('data-dir-key="E"'), 'ZH radar SVG should show unified Clear Sky % with status glyph and clickable data-dir-key');
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
  const pos = { name: '挪威 · Alta', nameEn: 'Norway · Alta', lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo' };
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
  assert.ok(akSvgEn.includes('Closed in winter') && akSvgZh.includes('冬季封閉'), 'Closed direction must show Closed in winter');
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
  assert.ok(/雲層偏厚|厚雲|多雲/.test(actZh.lead) && actZh.ctaView === 'dir', 'Overcast shock must warn about clouds and link to Clear-Sky Radar');
  assert.ok(!actEn.title.toLowerCase().includes('rising') && actEn.ctaView === 'dir', `EN overcast shock must not claim rising: ${actEn.title}`);

  // Chart 2: Frameless HH:MM Best callout must stay anchored over far-left best hour (x=56), never shifted to middle daytime!
  const hrsLeftBest = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((6 + i) % 24).padStart(2, '0')}:00`,
    clear: i === 0 ? 63 : 30, block: i === 0 ? 37 : 70, score: i === 0 ? 18 : 0, temp: 2,
    isDay: i >= 3 && i <= 8
  }));
  const svgLeft = api.buildSkyWaveSVG(hrsLeftBest, hrsLeftBest[0], 0, 'zh');
  const svgLeftUnsel = api.buildSkyWaveSVG(hrsLeftBest, hrsLeftBest[0], 1, 'zh');
  assert.ok(svgLeft.includes('>06:00 最佳<'), 'Best callout must include exact best hour 06:00');
  assert.ok(svgLeftUnsel.includes('data-role="best-dot" cx="56.0"'), 'Best indicator dot must anchor directly to 06:00 (x=56)');
  assert.ok(svgLeft.includes('x="92.0" y="13.5"'), 'Best callout must stay clamped near left edge above 06:00, not shifted to x=224');
  assert.ok(svgLeft.includes('天色過亮'), 'Contiguous daylight band must be clearly labeled');
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
  const pos = { name: '挪威 · Alta', nameEn: 'Norway · Alta', lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo' };
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
  assert.equal(osloNights[2].badge, 'Updating', `Mid-lat +2 Nights with missing Kp must show Updating, not false Kp gate: ${osloNights[2].badge}`);
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
  assert.equal(zhNights[0].badge, '雲層過厚', `20% clear / Kp 2.7 must classify as 雲層過厚, got ${zhNights[0].badge}`);
  assert.equal(zhNights[0].tone, '', `20% clear / Kp 2.7 must not get warm/good tone, got ${zhNights[0].tone}`);
  assert.equal(enNights[0].badge, 'Cloudy', `20% clear / Kp 2.7 must classify as Cloudy, got ${enNights[0].badge}`);
  // Clear 82%+ night is never Cloudy; its tone follows the unified 0-99 tiers (full moon + Kp 3.3 peaks just under 40 → Watch)
  assert.notEqual(zhNights[1].tone, '', 'Clear 82%+ night must never be classified Cloudy/Weak');
  assert.equal(zhNights[1].tone, zhNights[1].bestNightScore >= 40 ? 'good' : 'warn', 'Clear night tone must follow unified 40-point Good threshold');

  // 2. Consumer UI (src/app.js) must NOT render od-enlil (CME ~489km/s) jargon onto 3-Night Outlook cards
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  assert.ok(!appSrc.includes('od-enlil'), 'Consumer 3-Night Outlook cards must not render od-enlil CME speed jargon');
  assert.ok(appSrc.includes('syncBannerBudget'), 'App must enforce Banner Budget = 1 arbitration');
});

test('47. 24-hour forecast physics & UX guardrails (24h parsing, 6h-step guard, +3h Kp leak guard, bestTonight, dtMs & midnight SVG)', () => {
  const now = new Date('2026-11-24T20:00:00Z'); // 21:00 CET in Tromsø
  const nowMs = now.getTime();

  // 1. MET Norway 24h parser stops cleanly if feed switches to 6h steps early
  const metSeries = [];
  for (let i = 0; i < 20; i++) {
    metSeries.push({
      time: new Date(nowMs + i * 3600000).toISOString(),
      data: { instant: { details: { cloud_area_fraction: 15, air_temperature: -5, wind_speed: 3 } } }
    });
  }
  // Inject 6h jump after hour 19
  metSeries.push({
    time: new Date(nowMs + 25 * 3600000).toISOString(),
    data: { instant: { details: { cloud_area_fraction: 10, air_temperature: -6, wind_speed: 2 } } }
  });
  const parsedMet = api.parseMetNorwayHourly12({ properties: { timeseries: metSeries } }, 69.65, 18.96, 'Europe/Oslo', now, 24);
  assert.equal(parsedMet.length, 20, `6h-step guard must stop cleanly at 20 hourly steps, got ${parsedMet.length}`);
  assert.ok(parsedMet[0].nightKey && parsedMet[0].localDate, 'Parsed hours must include astronomical nightKey & localDate');

  // 2. Open-Meteo 24h parser returns 24 hours when requested, while default remains 12 (backwards compatibility)
  const omTimes = Array.from({ length: 36 }, (_, i) => Math.floor((nowMs + i * 3600000) / 1000));
  const omHourly = {
    time: omTimes,
    cloud_cover: omTimes.map(() => 20),
    cloud_cover_low: omTimes.map(() => 10),
    cloud_cover_mid: omTimes.map(() => 10),
    cloud_cover_high: omTimes.map(() => 0),
    temperature_2m: omTimes.map(() => -4),
    wind_speed_10m: omTimes.map(() => 12),
    precipitation: omTimes.map(() => 0)
  };
  assert.equal(api.parseOpenMeteoHourly12(omHourly, 69.65, 18.96, 'Europe/Oslo', now).length, 12);
  const om24 = api.parseOpenMeteoHourly12(omHourly, 69.65, 18.96, 'Europe/Oslo', now, null, 24);
  assert.equal(om24.length, 24, 'Open-Meteo 24h horizon must return 24 hourly rows');

  // 3. +3h Kp storm-leakage guardrail: missing kpForecast must NEVER clone live Kp 7.5 onto +12h..+23h
  const scoredLeak = api.scoreHourlyForecast12(om24, {
    lat: 69.65, lon: 18.96, kpForecast: [], fallbackKp: 7.5, bz: -18, speed: 680
  });
  assert.equal(scoredLeak.hours[0].kpFc, 7.5, 'Hour 0 keeps live Kp 7.5');
  assert.ok(scoredLeak.hours[12].kpFc <= 2.5, `Hour +12 without kpForecast must damp fallback Kp <= 2.5, got ${scoredLeak.hours[12].kpFc}`);

  // 4. bestTonight isolates tonight's nightKey even when tomorrow evening (+22h) has higher Kp
  const kpTomorrowStorm = [
    { ts: nowMs, kp: 2.0 },
    { ts: nowMs + 3 * 3600000, kp: 2.0 },
    { ts: nowMs + 6 * 3600000, kp: 2.0 },
    { ts: nowMs + 21 * 3600000, kp: 6.5 }
  ];
  const scoredSplit = api.scoreHourlyForecast12(om24, {
    lat: 69.65, lon: 18.96, kpForecast: kpTomorrowStorm, fallbackKp: 2.0
  });
  assert.equal(scoredSplit.bestTonight.nightKey, scoredSplit.activeNightKey, 'bestTonight must stay within tonight nightKey');
  assert.notEqual(scoredSplit.bestAurora.nightKey, scoredSplit.activeNightKey, 'bestAurora across 24h picks tomorrow storm');

  // 5. 24h SVG renders cleanly with midnight boundary, 4h X-ticks (<=6 ticks), and zero NaN
  const svg24Zh = api.buildSkyWaveSVG(scoredSplit.hours, scoredSplit.bestAurora, 2, 'zh');
  const svg24En = api.buildSkyWaveSVG(scoredSplit.hours, scoredSplit.bestAurora, 2, 'en');
  assert.ok(!svg24Zh.includes('NaN') && !svg24En.includes('NaN'), '24h SVG must contain zero NaN');
  assert.ok(svg24Zh.includes('data-role="midnight-line"'), '24h SVG must draw calm midnight boundary hairline');
  assert.ok(!svg24Zh.includes('stroke-dasharray'), '24h SVG must stay calm with zero dashed-line clutter');
  assert.ok(!/[\u3400-\u9fff]/.test(svg24En), 'EN 24h SVG must contain zero CJK characters');
});

test('48. Morning-hour 3-Night rollover & VLM QA regressions (Lofoten 09:03 winter, Reykjavik 08:22 activeNightKey, overcast daylight)', () => {
  // 1. Reproduces user iPhone screenshot: Lofoten 09:03 AM CET on Nov 25 (winter, dark at 15:00!)
  //    MUST show 今晚 11/25 (NOT 今晚 11/24 天色偏亮 無暗空!)
  const lofotenMorning = new Date('2026-11-25T08:03:00Z'); // 09:03 CET
  const lofotenPts = [
    { dtMs: Date.parse('2026-11-25T08:30:00Z'), clear: 15, isDay: true },  // 09:30 CET daytime
    { dtMs: Date.parse('2026-11-25T10:30:00Z'), clear: 25, isDay: true },  // 11:30 CET daytime
    { dtMs: Date.parse('2026-11-25T16:30:00Z'), clear: 68, isDay: false }, // 17:30 CET TONIGHT dark!
    { dtMs: Date.parse('2026-11-25T17:30:00Z'), clear: 64, isDay: false },
    { dtMs: Date.parse('2026-11-25T18:30:00Z'), clear: 66, isDay: false },
    { dtMs: Date.parse('2026-11-26T18:30:00Z'), clear: 74, isDay: false },
    { dtMs: Date.parse('2026-11-26T19:30:00Z'), clear: 72, isDay: false }
  ];
  const lofotenNights = api.summarize3NightOutlook({
    cloudPoints: lofotenPts,
    kpForecast: [
      { ts: Date.parse('2026-11-25T18:00:00Z'), kp: 3.7 },
      { ts: Date.parse('2026-11-26T18:00:00Z'), kp: 5.0 }
    ],
    currentKp: 2.7, lat: 68.23, lon: 14.56, timeZone: 'Europe/Oslo', nowDate: lofotenMorning, lang: 'zh'
  });
  assert.equal(lofotenNights[0].label, '今晚 11/25', `At 09:03 AM on 11/25, Night 0 must be 今晚 11/25, got ${lofotenNights[0].label}`);
  assert.notEqual(lofotenNights[0].badge, '天色過亮', `Winter Lofoten 09:03 AM must NEVER show 天色偏亮 / 無暗空, got ${lofotenNights[0].badge}`);
  assert.ok(lofotenNights[0].bestClear >= 60, `Expected tonight clear sky >=60%, got ${lofotenNights[0].bestClear}%`);

  // 2. Late-night 02:00 AM with remaining dark hours still stays on tonight's active session (11/24)
  const lateNight = new Date('2026-11-25T01:00:00Z'); // 02:00 CET
  const latePts = [
    { dtMs: Date.parse('2026-11-25T01:30:00Z'), clear: 80, isDay: false },
    { dtMs: Date.parse('2026-11-25T02:30:00Z'), clear: 82, isDay: false }
  ];
  const lateNights = api.summarize3NightOutlook({
    cloudPoints: latePts, kpForecast: [{ ts: Date.parse('2026-11-25T00:00:00Z'), kp: 4.0 }],
    currentKp: 4.0, lat: 68.23, lon: 14.56, timeZone: 'Europe/Oslo', nowDate: lateNight, lang: 'zh'
  });
  assert.equal(lateNights[0].label, '今晚 11/24', 'At 02:00 AM with dark hours remaining, Night 0 stays on ongoing 11/24 night');

  // 3. Reykjavik 08:22 AM (pre-sunrise dark) must set activeNightKey to TODAY (2026-11-25) so tonight 02:00 is not Tomorrow
  const rvkNow = new Date('2026-11-25T08:00:00Z');
  const rvkTimes = Array.from({ length: 24 }, (_, i) => Math.floor((rvkNow.getTime() + i * 3600000) / 1000));
  const rvk24 = api.parseOpenMeteoHourly12({
    time: rvkTimes, cloud_cover: rvkTimes.map(() => 20), temperature_2m: rvkTimes.map(() => 2),
    wind_speed_10m: rvkTimes.map(() => 10), precipitation: rvkTimes.map(() => 0)
  }, 64.15, -21.94, 'Atlantic/Reykjavik', rvkNow, 0, 24);
  const rvkScored = api.scoreHourlyForecast12(rvk24, { lat: 64.15, lon: -21.94, fallbackKp: 3.0 });
  assert.equal(rvkScored.activeNightKey, '2026-11-25', '08:00 AM pre-sunrise activeNightKey must be today (2026-11-25)');

  // 4. Overcast daylight wait (<25% clear) must not call 5% clear "Best window / 今晚最晴時段"
  const qtAct = api.synthesizeTonightAction({
    lat: -45.03, lon: 168.66,
    sc: { total: 0, skyScore: 7, auroraScore: 2, darkScore: 0, isTooBright: true, outOfZone: null },
    bestDark: { time: '05:00', clear: 5, score: 0 },
    darkWin: { state: 'twilight-wait', nextDarkHM: '21:28', darkInMin: 6 },
    kp: 1.0, lang: 'zh'
  });
  assert.ok(!qtAct.lead.includes('最晴時段'), `5% clear overcast must not say 最晴時段: ${qtAct.lead}`);
  assert.ok(/雲層偏厚|厚雲|多雲/.test(qtAct.lead), `5% clear overcast must honestly mention clouds: ${qtAct.lead}`);
});



test('49. 3-Night Outlook unified 0-99 scoring parity, unified tiers & explicit ★ Best label', () => {
  // 1. Reproduces user iPhone screenshot (Lofoten 10:15 AM, full moon): Tonight peaked at ~32 on the 24h chart
  //    but the old ad-hoc formula labeled all three nights green 條件佳. Now every night uses computeAuroraScore.
  const mk = (day, hours, clears) => hours.map((h, i) => ({ dtMs: Date.parse(`2026-11-${day}T${String(h).padStart(2, '0')}:30:00Z`), clear: clears[i], isDay: false }));
  const pts = [
    ...mk(25, [16, 17, 18, 19, 20, 21, 22], [68, 64, 66, 60, 55, 50, 48]),
    ...mk(26, [16, 17, 18, 19, 20, 21, 22, 23], [73, 73, 73, 73, 73, 73, 73, 73]),
    ...mk(27, [18, 19, 20], [48, 48, 48])
  ];
  const kpF = [
    { ts: Date.parse('2026-11-25T18:00:00Z'), kp: 3.7 },
    { ts: Date.parse('2026-11-26T18:00:00Z'), kp: 5.0 },
    { ts: Date.parse('2026-11-27T18:00:00Z'), kp: 3.7 }
  ];
  const args = { cloudPoints: pts, kpForecast: kpF, currentKp: 2.7, lat: 68.23, lon: 14.56, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-25T09:15:00Z') };
  const zh = api.summarize3NightOutlook({ ...args, lang: 'zh' });
  const en = api.summarize3NightOutlook({ ...args, lang: 'en' });

  // Parity: Tonight's peak equals the max of the SAME computeAuroraScore over its dark hours
  const tonightPts = pts.filter(p => p.dtMs < Date.parse('2026-11-26T06:00:00Z'));
  const directPeak = Math.max(...tonightPts.map(p => {
    const dt = new Date(p.dtMs);
    return api.computeAuroraScore({
      lat: 68.23, lon: 14.56, cloudNow: 100 - p.clear, sunAlt: api.computeSolarElevation(dt, 68.23, 14.56),
      bz: 0, speed: 400, kp: 3.7, ovation: null, mlt: api.computeMLT(dt, 68.23, 14.56),
      effMoonPct: api.getMoonState(dt, 68.23, 14.56).effMoonPct
    }).total;
  }));
  assert.equal(zh[0].bestNightScore, directPeak, `Tonight peak must equal computeAuroraScore peak ${directPeak}, got ${zh[0].bestNightScore}`);
  assert.ok(zh[0].bestNightScore < 40, `Full-moon 66% / Kp 3.7 night must stay below Good tier, got ${zh[0].bestNightScore}`);
  assert.equal(zh[0].tone, 'warn');
  assert.equal(zh[0].badge, '普通');
  assert.ok(zh[1].bestNightScore > zh[0].bestNightScore && zh[1].bestNightScore >= 40, `73% / Kp 5.0 G1 night must clearly outscore tonight, got ${zh[1].bestNightScore}`);
  assert.equal(zh[1].tone, 'good');
  assert.ok(['適合觀測', '極佳'].includes(zh[1].badge), `Good night badge must be a unified tier, got ${zh[1].badge}`);
  assert.ok(zh[2].bestNightScore < zh[1].bestNightScore && zh[2].tone !== 'good', '48% / Kp 3.7 night must not be labeled Good');
  assert.ok(zh.every(n => n.scoreAvailable === true), 'All three scored nights expose scoreAvailable');
  assert.ok(!zh.some(n => ['條件佳', '可留意', '有機會'].includes(n.badge)), 'Legacy vague badges must be gone');
  assert.ok(!en.some(n => ['Prime', 'Watch', 'Promising', 'Weak'].includes(n.badge)), 'EN tiers must use Excellent/Good/Fair/Low');
  assert.ok(!en.some(n => /[\u3400-\u9fff]/.test(`${n.label}${n.badge}`)), 'EN outlook must contain zero CJK');

  // 1b. When the hourly chart (with live L1 solar wind blended into +1..3h) covers tonight, its peak IS tonight's score
  const chartHours = tonightPts.map((p, i) => ({ dtMs: p.dtMs, isDay: false, score: i === 1 ? 93 : 20 }));
  const withChart = api.summarize3NightOutlook({ ...args, lang: 'zh', chartHours });
  assert.equal(withChart[0].bestNightScore, 93, `Tonight ~score must equal hourly chart peak 93, got ${withChart[0].bestNightScore}`);
  assert.equal(withChart[0].badge, '極佳');
  assert.equal(api.summarize3NightOutlook({ ...args, lang: 'en', chartHours })[0].badge, 'Excellent');
  assert.equal(withChart[1].bestNightScore, zh[1].bestNightScore, 'Nights beyond chart coverage keep their own unified score');

  // 2. scoreAvailable is false for Updating / Too bright / Out of zone so the UI shows a status instead of a fake score
  const pending = api.summarize3NightOutlook({ cloudPoints: [], kpForecast: [], currentKp: null, lat: 68.23, lon: 14.56, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-25T09:15:00Z'), lang: 'en' });
  assert.ok(pending.every(n => n.scoreAvailable === false && n.badge === 'Updating'));
  const polarDay = api.summarize3NightOutlook({
    cloudPoints: [{ dtMs: Date.parse('2026-06-21T22:00:00Z'), clear: 90, isDay: true }],
    kpForecast: [{ ts: Date.parse('2026-06-21T21:00:00Z'), kp: 5 }], currentKp: 5,
    lat: 69.65, lon: 18.96, timeZone: 'Europe/Oslo', nowDate: new Date('2026-06-21T12:00:00Z'), lang: 'en'
  });
  assert.equal(polarDay[0].badge, 'Too bright');
  assert.equal(polarDay[0].scoreAvailable, false);
  const taipei = api.summarize3NightOutlook({ cloudPoints: pts, kpForecast: kpF, currentKp: 3, lat: 25.03, lon: 121.56, timeZone: 'Asia/Taipei', nowDate: new Date('2026-11-25T09:15:00Z'), lang: 'en' });
  assert.ok(taipei.every(n => n.scoreAvailable === false && n.badge === 'Out of zone'));

  // 3. Consumer UI: explicit ★ Best pill gated at the unified 40-point Good tier
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  assert.ok(appSrc.includes('od-flag-pill'), '3-Night best night must carry an explicit ★ Best pill');
  assert.ok(appSrc.includes("(n.bestNightScore ?? 0) < 40"), '★ Best must only appear when the top night reaches the Good tier');
  assert.ok(!appSrc.includes('od-tilde'), 'Scores are bare integers (no ~ prefix)');
  assert.ok(appSrc.includes('outlookInfoBtn'), 'Forecast uncertainty is explained via the card-level info button');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  assert.ok(!/\.od-best\s*\{[^}]*var\(--green-bg\)/.test(css), 'Best night must not use the unexplained green background fill');
});

test('50. Bilingual copy, localization & single-metric chart clarity lint gate (zh-TW / EN / color semantics / 24h / °C-°F)', async () => {
  const { STATIC_TEXT_MAP, LOADING_PLACEHOLDER_MAP } = await import('../src/i18n.js');

  // 1. Static text & loading placeholder maps: zero CJK in EN, zero banned mainland/HK terms or legacy EN jargon, no /100 or ~score
  const BANNED_ZH = /信息|默认|屏幕|视频|貼士|數據|網絡|分佈|持平|天頂|後晚|・|＆|\.\.\./;
  const BANNED_EN = /\b(Prime Conditions|Latitude Gate|Daylight Gate|All Pillars|Conf:|laser adj|No Winter Rd|Ov \d)/;
  const SCORE_TILDE = /~\s*\d/;
  const SLASH_100 = /\/100\b/;
  const ZH_SCORE_FEN = /指數[^。，；\n]{0,12}\d+\s*分(?!鐘)/;

  for (const [k, pair] of Object.entries({ ...STATIC_TEXT_MAP, ...LOADING_PLACEHOLDER_MAP })) {
    const [zh, en] = pair;
    if (k !== 'langBtn') assert.ok(!/[\u3400-\u9fff]/.test(en), `EN static key ${k} leaked CJK: ${en}`);
    assert.ok(!BANNED_ZH.test(zh), `ZH static key ${k} contains banned wording/punctuation: ${zh}`);
    assert.ok(!BANNED_EN.test(en), `EN static key ${k} contains banned jargon: ${en}`);
    assert.ok(!SCORE_TILDE.test(zh) && !SCORE_TILDE.test(en), `Static key ${k} uses banned ~score prefix`);
    assert.ok(!SLASH_100.test(zh) && !SLASH_100.test(en), `Static key ${k} uses banned /100 suffix`);
    assert.ok(!ZH_SCORE_FEN.test(zh), `ZH static key ${k} uses 分 as score unit: ${zh}`);
  }

  // 2. Engine outputs (verdict, synthesizeTonightAction, explainAuroraScore, summarize3NightOutlook, tGrade) across representative states
  const nowDate = new Date('2026-11-25T20:00:00Z');
  const states = [
    api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 10, sunAlt: -15, bz: -8, speed: 620, kp: 5.2, ovation: 75 }),
    api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 85, sunAlt: -15, bz: -6, speed: 550, kp: 4.5, ovation: 60 }),
    api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 10, sunAlt: 5, bz: -2, speed: 400, kp: 2.0, ovation: 20 }),
    api.computeAuroraScore({ lat: 25.03, lon: 121.56, cloudNow: 10, sunAlt: -20, bz: -2, speed: 400, kp: 3.0, ovation: 0 })
  ];
  for (const sc of states) {
    for (const lang of ['zh', 'en']) {
      const v = api.evaluateVerdict({ lat: 69.65, lon: 18.96, kp: 4.0, scoreObj: sc, lang });
      const act = api.synthesizeTonightAction({ lat: 69.65, lon: 18.96, sc, kp: 4.0, lang });
      const exp = api.explainAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 10, sunAlt: -15, bz: -5, speed: 500, kp: 4.0, ovation: 50, lang });
      const gr = api.tGrade(sc.grade, lang);
      const blob = [v.kicker, v.title, v.lead, act.title, act.lead, act.ctaLabel, exp.bottleneck.label, exp.confidence.badgeText, gr].join(' | ');
      if (lang === 'en') {
        assert.ok(!/[\u3400-\u9fff]/.test(blob), `EN engine output leaked CJK: ${blob}`);
        assert.ok(!BANNED_EN.test(blob), `EN engine output contains banned jargon: ${blob}`);
      } else {
        assert.ok(!BANNED_ZH.test(blob), `ZH engine output contains banned wording: ${blob}`);
        assert.ok(!ZH_SCORE_FEN.test(blob), `ZH engine output uses 分 as score unit: ${blob}`);
      }
      assert.ok(!SLASH_100.test(blob), `${lang} engine output contains /100: ${blob}`);
      assert.ok(!/[!！]/.test(`${v.title}${act.title}`), `${lang} verdict title must not use exclamation mark: ${v.title}`);
    }
  }

  // 3. 3-Night Outlook date/weekday format, badge length budgets & unified tier colors (no blue for Low, no red for Cloudy)
  const pts = [0, 1, 2].flatMap(d => [20, 22, 23].map(h => ({
    dtMs: Date.UTC(2026, 10, 25 + d, h, 0, 0),
    clear: d === 0 ? 15 : (d === 1 ? 88 : 55),
    isDay: false
  })));
  const kpF = [0, 1, 2].map(d => ({ ts: Date.UTC(2026, 10, 25 + d, 21, 0, 0), kp: d === 1 ? 5.5 : 2.3 }));
  const nEn = api.summarize3NightOutlook({ cloudPoints: pts, kpForecast: kpF, currentKp: 2.3, lat: 69.65, lon: 18.96, timeZone: 'Europe/Oslo', nowDate, lang: 'en' });
  const nZh = api.summarize3NightOutlook({ cloudPoints: pts, kpForecast: kpF, currentKp: 2.3, lat: 69.65, lon: 18.96, timeZone: 'Europe/Oslo', nowDate, lang: 'zh' });
  for (const n of nEn) {
    assert.match(n.dayLabel, /^(Tonight|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/, `EN dayLabel invalid: ${n.dayLabel}`);
    assert.ok(!/^\d{1,2}\/\d{1,2}$/.test(n.dateLabel), `EN dateLabel must never use numeric M/D: ${n.dateLabel}`);
    assert.ok(n.badge.length <= 12, `EN od-badge exceeds 12-char budget: ${n.badge}`);
  }
  for (const n of nZh) {
    assert.match(n.dayLabel, /^(今晚|週[一二三四五六日])$/, `ZH dayLabel invalid: ${n.dayLabel}`);
    assert.ok(n.badge.length <= 6, `ZH od-badge exceeds 6-char budget: ${n.badge}`);
  }
  assert.equal(nEn[0].badge, 'Cloudy');
  assert.equal(nEn[0].badgeColor, '#8b94a5', 'Cloudy night must use muted grey (never red)');
  assert.equal(nEn[0].bestWindow, '', 'Cloudy/Low (<18) night must not show a fake peak time window');
  assert.ok(['#34f0b0', '#25b88a'].includes(nEn[1].badgeColor), `Good/Excellent night must use green/emerald, got ${nEn[1].badgeColor}`);
  assert.equal(nEn[1].bestWindow, '21–00', `21–23 UTC (22–00 CET) evening peak must produce 21–00 window, got ${nEn[1].bestWindow}`);

  // 4. Single-metric hourly chart clarity + zero dual-axis polyline + separated clear-sky strip + no temperature row
  const hrs24 = Array.from({ length: 24 }, (_, i) => ({
    dtMs: Date.UTC(2026, 10, 25, 11 + i, 0, 0),
    time: `${String((11 + i) % 24).padStart(2, '0')}:00`,
    clear: i < 4 ? 20 : 85,
    block: i < 4 ? 80 : 15,
    score: i < 4 ? 0 : (i === 11 ? 52 : 30),
    temp: -4,
    isDay: i < 4
  }));
  const waveEn = api.buildSkyWaveSVG(hrs24, hrs24[11], 11, 'en');
  const waveZh = api.buildSkyWaveSVG(hrs24, hrs24[11], 11, 'zh');
  assert.ok(!waveEn.includes('<polyline') && !waveZh.includes('<polyline'), 'Hourly chart must NOT overlay a clear-sky polyline on the score Y-axis');
  assert.ok(waveEn.includes('data-role="y-title"') && waveEn.includes('Score (0–99)'), 'EN hourly chart must label its single Y-axis metric');
  assert.ok(waveZh.includes('data-role="y-title"') && waveZh.includes('觀測指數'), 'ZH hourly chart must label its single Y-axis metric');
  assert.ok(waveEn.includes('>Clear<') && waveZh.includes('>晴空<'), 'Hourly chart must render the separated clear-sky context strip');
  assert.ok(!waveEn.includes('°') && !waveZh.includes('°'), 'Hourly chart axis must not clutter X-axis with temperature degrees');
  assert.ok(!waveEn.includes('#2ed39e') && !waveEn.includes('#818cf8'), 'Hourly chart must use CSS variables (zero hardcoded hex leaks in red-mode)');

  // 5. Solar wind & compass color semantics: Low/Cloudy = var(--muted), Red = driving hazard ONLY
  const bzLow = api.buildBzChartSVG(
    Array.from({ length: 20 }, (_, i) => ({ time_tag: `2026-11-25 20:${String(i).padStart(2, '0')}:00`, bz: 2 })),
    'UTC', 350, null, 'en'
  );
  assert.ok(bzLow.includes('data-role="y-title"') && bzLow.includes('var(--muted)'), 'Bz chart Low state must use var(--muted), not blue');
  assert.ok(!bzLow.includes('#66bdff') && !bzLow.includes('#22d3ee'), 'Bz chart must not use hardcoded blue/cyan hex');

  const radarCloudy = api.buildCompassRadarSVG([
    { key: 'here', avg3h: 90 },
    { key: 'N', label: '往西北 Grøtfjord', lat: 69.7794, lon: 18.5453, roadKm: 42, avg3h: 90, maxWind3h: 3, maxPrecip3h: 0, temp: -2 },
    { key: 'E', label: '往東南 Skibotn', lat: 69.3911, lon: 20.2683, roadKm: 118, avg3h: 20, maxWind3h: 15, maxPrecip3h: 1, temp: -3 }
  ], { lat: 69.6492, lon: 18.9553 }, 'en');
  assert.ok(radarCloudy.includes('var(--muted)') && radarCloudy.includes('var(--red)'), 'Radar must use muted grey for cloudy and reserve red strictly for hazards');
  assert.ok(radarCloudy.includes('data-km="42"') && radarCloudy.includes('data-km="118"') && !radarCloudy.includes(' A146,146'), 'Radar must use continuous 360° polar plotting (not rigid 4-pie wedges)');

  // 6. Fixed 24h chart, °C/°F unit switcher & zero-hex ring glow in app/HTML
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  assert.ok(!html.includes('hz12Btn') && !html.includes('hz24Btn'), 'Fixed 24h chart must not include legacy 12h/24h toggle');
  assert.ok(html.includes('id="unitBtn"') && appSrc.includes('detectTempUnit') && !appSrc.includes('fmtTempC'), 'App must support °C/°F via detectTempUnit + fmtTemp + #unitBtn');
  assert.ok(!appSrc.includes('${sc.color}88'), 'Ring drop-shadow must use CSS var color-mix (zero hex leak in red-mode)');

  // 7. SEO & AI-Search (GEO) integrity: clean canonical (no conflicting ?lang=en hreflang/sitemap), sitemap, robots.txt, llms-full.txt & 10 valid spot pages
  assert.ok(html.includes('rel="canonical"') && !html.includes('hreflang="en"'), 'index.html must keep clean self-canonical without conflicting ?lang=en hreflang');
  const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  assert.ok(!sitemap.includes('?lang=en'), 'sitemap.xml must only list canonical URLs (no ?lang=en duplicate)');
  const robots = fs.readFileSync(path.join(ROOT, 'robots.txt'), 'utf8');
  const llmsFull = fs.readFileSync(path.join(ROOT, 'llms-full.txt'), 'utf8');
  assert.ok(robots.includes('OAI-SearchBot') && robots.includes('PerplexityBot') && robots.includes('Sitemap:'), 'robots.txt must welcome AI search crawlers and point to sitemap.xml');
  assert.ok(llmsFull.includes('Tromsø') && llmsFull.includes('Queenstown'), 'llms-full.txt must document global & Nordic destinations');
  for (const slug of ['tromso', 'lofoten', 'alta', 'abisko', 'rovaniemi', 'reykjavik', 'akureyri', 'fairbanks', 'yellowknife', 'queenstown']) {
    const spHtml = fs.readFileSync(path.join(ROOT, 'spots', slug, 'index.html'), 'utf8');
    assert.ok(sitemap.includes(`/spots/${slug}/`), `sitemap.xml missing /spots/${slug}/`);
    assert.ok(spHtml.includes(`spots/${slug}/`) && !spHtml.includes('NaN') && !spHtml.includes('undefined'), `spot page ${slug} invalid`);
    const ldMatch = spHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(ldMatch && JSON.parse(ldMatch[1])['@graph'].length >= 2, `spot page ${slug} must contain valid JSON-LD`);
  }

  // 8. Central glossary (src/glossary.js) is the single source of truth & precached in sw.js
  const { TERMS } = await import('../src/glossary.js');
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(swSrc.includes('./src/glossary.js'), 'sw.js SHELL_ASSETS must precache ./src/glossary.js');
  assert.equal(TERMS.clearSky.zh, '晴空率', 'Central glossary clearSky zh term must stay 晴空率');
  for (const rel of ['src/aurora-engine.js', 'src/charts.js', 'src/i18n.js', 'src/app.js']) {
    const modSrc = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.ok(modSrc.includes('./glossary.js'), `${rel} must import central TERMS from ./glossary.js`);
  }
  // 9. Trust Sheet official verification links use canonical live visual pages (not stale 3-day text or raw JSON)
  assert.ok(html.includes('https://www.spaceweather.gov/communities/aurora-dashboard-experimental'), 'index.html must link to NOAA Aurora Dashboard');
  assert.ok(html.includes('https://www.spaceweather.gov/products/alerts-watches-and-warnings'), 'index.html must link to live NOAA Storm Alerts & Watches');
  assert.ok(html.includes('https://www.spaceweather.gov/products/solar-wind') && html.includes('https://kp.gfz.de/en/hp30-hp60'), 'index.html must link to NOAA Solar Wind and GFZ Hp30');
  assert.ok(!html.includes('swpc.noaa.gov/products/3-day-forecast') && !html.includes('spaceweather.gov/products/3-day-forecast'), 'Trust Sheet must not link to twice-daily stale 3-day-forecast text page');

  // 10. v28 credibility & stability guardrails: Night+1/+2 2h fluke-smoothing, Nordic ECMWF, <=20km corridor METAR, per-feed fallback & horizon-honest UI
  const flukePts = [
    ...[18, 19, 20, 21, 22].map((h, i) => ({ dtMs: Date.parse(`2026-11-26T${h}:00:00Z`), clear: i === 2 ? 95 : 5, isDay: false })),
    ...[18, 19, 20, 21, 22].map((h) => ({ dtMs: Date.parse(`2026-11-27T${h}:00:00Z`), clear: 95, isDay: false }))
  ];
  const flukeOut = api.summarize3NightOutlook({
    cloudPoints: flukePts,
    kpForecast: [{ ts: Date.parse('2026-11-26T18:00:00Z'), kp: 5.0 }, { ts: Date.parse('2026-11-27T18:00:00Z'), kp: 5.0 }],
    currentKp: 3, lat: 69.65, lon: 18.96, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-25T12:00:00Z'), lang: 'en'
  });
  assert.ok(flukeOut[1].bestNightScore < flukeOut[2].bestNightScore - 20, `Night+1 1h cloud fluke (${flukeOut[1].bestNightScore}) must score well below sustained clear Night+2 (${flukeOut[2].bestNightScore})`);
  const dcSrc = fs.readFileSync(path.join(ROOT, 'src/data-client.js'), 'utf8');
  assert.ok(dcSrc.includes('models=ecmwf_ifs025'), 'Nordic Open-Meteo comparison must request independent ecmwf_ifs025');
  assert.ok(dcSrc.includes('dMetar <= 20') && !dcSrc.includes('dMetar <= 55'), 'Corridor METAR OI must be capped at <=20 km to protect inland rain shadows');
  assert.ok(dcSrc.includes('prevRaw?.magSeries') && dcSrc.includes('liveAge <= 60'), 'NOAA & METAR must retain stale-on-error fallback to prevent score cliffs');
  assert.ok(appSrc.includes('chartHours: state.renderState.scoredHours'), 'Background ENLIL re-render must preserve chartHours parity');
  assert.ok(html.includes('id="tsConfDetail"') && !html.includes('id="outlookNote" class="od-note" hidden'), 'Trust Sheet must include #tsConfDetail and #outlookNote must be visible by default');

  // 11. v34 Dynamic Type, zero-bleed scrim, unified 夜空暗度 vocabulary, zero SVG white-RGBA leaks & Early Warning meter
  const cssSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const chartsSrc = fs.readFileSync(path.join(ROOT, 'src/charts.js'), 'utf8');
  assert.ok(cssSrc.includes('-apple-system-body') && !cssSrc.includes('html { font-size: 16px;'), 'CSS must support iOS Dynamic Type instead of locking html to fixed 16px');
  assert.ok(cssSrc.includes('body.a11y-large .factors') && cssSrc.includes('body.a11y-large .outlook-grid'), 'CSS must provide Dynamic Type reflow for 3-col metrics and 3-night outlook');
  assert.ok(cssSrc.includes('body::after') && cssSrc.includes('body.red-mode::after'), 'CSS must render a fixed bottom edge scrim beneath floating nav to prevent iOS home-indicator text bleed');
  assert.ok(appSrc.includes('syncFontScaleClass') && appSrc.includes("'a11y-large'"), 'app.js must compute live root font-size scale for real iOS Dynamic Type reflow');
  assert.ok(!html.includes('與月光') && !appSrc.includes('月光 ${') && !appSrc.includes('月亮已落下'), 'Overview UI must unify darkness terminology to 夜空暗度/暗度/全暗 (zero 月光 vocabulary drift)');
  assert.ok(!chartsSrc.includes('rgba(255,255,255'), 'src/charts.js must use CSS custom properties (--chart-grid/--chart-axis/--svg-cloud-fill) with zero hardcoded white RGBA red-mode leaks');
  const mFull = api.getMoonState(new Date('2026-11-24T14:53:00Z'), 69.97, 23.27);
  assert.equal(typeof mFull.waxing, 'boolean', 'getMoonState must expose boolean waxing phase');
  const moonCrescentSvg = api.buildMoonPhaseIcon({ pct: 28, up: true, waxing: true, isTooBright: false });
  assert.ok(moonCrescentSvg.includes('var(--moon-fill)') && !moonCrescentSvg.includes('#fff'), 'Moon phase icon must use var(--moon-fill) for zero-leak red-mode');
  const skyIcoSvg = api.buildSkyFactorIcon(90, false);
  const aurIcoSvg = api.buildAuroraFactorIcon(82);
  const odIcoSvg = api.buildOutlookSkyIcon({ score: 84, clearPct: 94, scoreAvailable: true });
  assert.ok(skyIcoSvg.includes('<svg') && aurIcoSvg.includes('<svg') && odIcoSvg.includes('<svg'), 'All visual micro-icons must render valid SVGs');
  const swMeterOpen = api.buildSolarWindMeterHtml({ bz: -6.8, speed: 540, en: false });
  const swMeterBuild = api.buildSolarWindMeterHtml({ bz: -2.0, speed: 500, energy: 34, en: false });
  const swMeterNull = api.buildSolarWindMeterHtml({ bz: null, speed: null, en: false });
  assert.ok(swMeterOpen.includes('sw-meter-dot') && swMeterOpen.includes('可能爆發'), 'Early-warning signal bar must render human-readable burst signal meter');
  assert.ok(swMeterBuild.includes('var(--amber)') && swMeterBuild.includes('sw-axis-on">增強'), 'Early-warning meter must match curve/badge unified building threshold (>=25)');
  assert.equal(swMeterNull, '', 'Early-warning signal bar must hide cleanly when Bz is unavailable');

  // 12. v35 interactive 2h satellite curve scrubbing (#bzChart + #bzDetail)
  assert.ok(html.includes('id="bzDetail"') && appSrc.includes('bindBzScrubbing') && appSrc.includes('selectBzPoint'), '2h satellite chart must wire interactive scrubbing and #bzDetail readout');
  const bzSeries = Array.from({ length: 24 }, (_, i) => ({
    time_tag: new Date(Date.UTC(2026, 10, 25, 14, i * 5, 0)).toISOString().replace('T', ' ').slice(0, 19),
    bz: i < 12 ? 0.8 : -4.2,
    bt: 6.5
  }));
  const bzScrubSvg = api.buildBzChartSVG(bzSeries, 'Europe/Oslo', 480, api.computeBallisticCoupling(bzSeries, 480), 'zh', 14);
  const bzNoScrubSvg = api.buildBzChartSVG(bzSeries, 'Europe/Oslo', 480, api.computeBallisticCoupling(bzSeries, 480), 'zh', -1);
  assert.ok(bzScrubSvg.includes('data-role="scrubber"') && bzScrubSvg.includes('data-role="scrubber-dot"'), 'buildBzChartSVG must render interactive vertical scrubber hairline and active point dot when selectedIdx is set');
  assert.ok(!bzNoScrubSvg.includes('data-role="scrubber"'), 'buildBzChartSVG must omit scrubber elements when selectedIdx is -1');

  // 13. v36 Direction B (Nordic Atmospheric 1P) & 5-expert cross-generational P0 contracts
  assert.ok(!cssSrc.includes('body.red-mode .hero-tag'), 'v36 must remove legacy sepia filter hack on .hero-tag in red-mode');
  assert.ok(cssSrc.includes('grid-template-columns: 25fr 37fr 38fr;'), 'Solar-wind meter axis must align honestly to real 25%/62% thresholds');
  assert.ok(cssSrc.includes('minmax(4.2em, auto) 20px 1fr auto'), 'a11y-large 3-night outlook must keep EN/ZH day labels aligned');
  assert.ok(cssSrc.includes('body.red-mode .dir.hazard'), 'red-mode must distinguish hazard cards structurally (dashed border)');
  assert.ok(html.includes('id="hrPrevBtn"') && html.includes('id="hrNextBtn"') && html.includes('id="bzPrevBtn"') && html.includes('id="bzNextBtn"'), 'Both interactive charts must provide glove-friendly 44px stepper buttons');
  assert.ok(html.includes('id="ringSubLbl" class="ring-sub"') && !html.includes('id="ringSubLbl" class="sr-only"'), 'Hero score label (觀測指數) must be visible above the score');
  assert.ok(!html.includes('class="f-track"'), '3-condition strip must drop shouting mini progress bars');
  assert.ok(appSrc.includes('fmtWinterDrive') && appSrc.includes('auroraStrengthWord') && appSrc.includes('仍要導航'), 'app.js must expose winter drive time, plain aurora strength word, and honest hazard navigation CTA');
  assert.ok(appSrc.includes('420 - 56 - 10'), 'bindWaveScrubbing plotW must match buildSkyWaveSVG padR=10 with zero touch drift');
  // Verify WCAG AA (>=4.5:1) contrast of all red-mode text tokens against red-mode --surface (#0e0101)
  const relLum = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (h1, h2) => {
    const l1 = relLum(h1), l2 = relLum(h2);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const redBlock = cssSrc.match(/body\.red-mode\s*\{([^}]+)\}/)?.[1] || '';
  const redTok = name => redBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  const redSurf = redTok('surface');
  assert.ok(redSurf, 'body.red-mode must define hex --surface');
  for (const tok of ['text', 'text-soft', 'muted', 'green', 'amber', 'blue', 'red']) {
    const hex = redTok(tok);
    assert.ok(hex, `body.red-mode must define hex --${tok}`);
    const ratio = contrast(hex, redSurf);
    assert.ok(ratio >= 4.5, `body.red-mode --${tok} (${hex}) vs --surface (${redSurf}) contrast ${ratio.toFixed(2)}:1 < 4.5:1 WCAG AA`);
  }

  // 14. v37 Zero-Filter GPU Atmospheric Breathing & Arctic Battery Gate
  const skyClear = api.buildSkySceneSVG({ cloudPct: 10, auroraScore: 86, moonUp: false, moonPct: 14, isTooBright: false });
  const skyCloudy = api.buildSkySceneSVG({ cloudPct: 86, auroraScore: 20, moonUp: true, moonPct: 78, isTooBright: false });
  const skyDay = api.buildSkySceneSVG({ cloudPct: 30, auroraScore: 80, moonUp: false, moonPct: 0, isTooBright: true });
  for (const s of [skyClear, skyCloudy, skyDay]) {
    assert.ok(!s.includes('<filter') && !s.includes('feGaussianBlur'), 'v37 buildSkySceneSVG must eliminate all per-frame SVG blur filters');
  }
  assert.ok(skyClear.includes('class="star-tw"') && skyClear.includes('aurCoreG'), 'Clear dark sky should render subtle star twinkle and soft feathered aurora core');
  assert.ok(!skyCloudy.includes('class="star-tw"') && !skyDay.includes('class="star-tw"'), 'Overcast or bright sky must omit star twinkle');
  assert.ok(skyCloudy.includes('cldSoftG'), 'Cloudy sky must render zero-filter radial feathered cloud gradients');
  assert.ok(cssSrc.includes('contain: strict;') && cssSrc.includes('translate3d('), 'styles.css must isolate .sky-backdrop with contain: strict and GPU translate3d');
  assert.ok(cssSrc.includes('body.red-mode .star-tw') && cssSrc.includes('body.anim-paused .star-tw'), 'Ambient sky & star twinkle must pause in red-mode and anim-paused');
  assert.ok(appSrc.includes('state.redModeEnabled') && appSrc.includes("state.activeView !== 'home'") && appSrc.includes('state.alertEnabled') && appSrc.includes('> 220'), 'syncAnimBatteryGuard must pause ambient GPU breathing on red-mode, non-home tabs, Wake-Lock monitor, and scrollY > 220');

  // 15. v38 1P 120fps ProMotion Scroll & Touch Architecture
  const skyBlk = cssSrc.match(/\.sky-backdrop\s*\{([^}]+)\}/)?.[1] || '';
  assert.ok(skyBlk.includes('position: absolute') && !skyBlk.includes('position: fixed'), '.sky-backdrop must scroll naturally with Hero (position: absolute) to eliminate fixed-sky header seam');
  assert.ok(cssSrc.includes('.hdr::before') && cssSrc.includes('body.is-scrolled .hdr::before { opacity: 1; }') && !cssSrc.includes('backdrop-filter 0.22s'), 'Sticky header must pre-mount glass layer on ::before and animate opacity only (zero backdrop-filter transition stutter)');
  const cardBlk = cssSrc.match(/\.card\s*\{([^}]+)\}/)?.[1] || '';
  const skyBodyBlk = cssSrc.match(/\.sky-body\s*\{([^}]+)\}/)?.[1] || '';
  assert.ok(!cardBlk.includes('backdrop-filter') && !skyBodyBlk.includes('backdrop-filter'), 'Scrolling .card and .sky-body must omit backdrop-filter for 120fps iOS scroll');
  assert.ok(!appSrc.includes('ptr.style.height'), 'Pull-to-refresh must never mutate height in touchmove (zero full-page reflow)');
  assert.ok(appSrc.includes('cachedRect = svg.getBoundingClientRect()') && appSrc.includes('schedulePick('), 'Chart scrubbers must cache getBoundingClientRect on pointerdown and coalesce pointermove in rAF');

  // 16. v39 Live-Verified Accuracy & Numerical Stability Guardrails
  // (a) IEM CAVOK/NCD/NSC with null skyc1..4 (e.g. Rovaniemi EFRO) must parse cleanly as 0% cloud / 100% clear
  const efroNow = Date.UTC(2026, 10, 25, 18, 5, 0);
  const efroParsed = api.parseIemMetarCurrent({
    data: [{
      station: 'EFRO', utc_valid: '2026-11-25T17:50:00Z',
      skyc1: null, skyc2: null, skyc3: null, skyc4: null,
      skyl1: null, skyl2: null, skyl3: null, skyl4: null,
      wxcodes: null, raw: 'EFRO 251750Z AUTO 01008KT 330V030 CAVOK M03/M06 Q1022'
    }]
  }, efroNow);
  assert.ok(efroParsed && efroParsed.effCloud === 0 && efroParsed.clearPct === 100 && efroParsed.skyCode === 'CLR', `IEM CAVOK with null skyc1..4 must parse as 0% cloud, got ${JSON.stringify(efroParsed)}`);

  // (b) NOAA 3h UT boundary provisional 0Z reset (00:00..00:14 / 18:00..18:14 UTC) must carry settled prior-bin Kp up to 14 min
  const kpBoundaryRows = [
    { time_tag: '2026-11-25T17:58:00', estimated_kp: 3.33, kp_index: 3 },
    { time_tag: '2026-11-25T17:59:00', estimated_kp: 3.33, kp_index: 3 },
    ...Array.from({ length: 11 }, (_, m) => ({
      time_tag: `2026-11-25T18:${String(m).padStart(2, '0')}:00`, estimated_kp: 0, kp_index: 0
    }))
  ];
  const kpSettled = api.parseLatestKp(kpBoundaryRows);
  assert.equal(kpSettled?.kp, 3.33, 'parseLatestKp must not collapse to 0.0 during first 15 min of a 3h UT bin reset');

  // (c) Smooth AR(1) Geospace 1h MHD decay over +1h..+3h eliminates +2h phantom Kp cliffs
  const baseT = Date.UTC(2026, 10, 25, 18, 0, 0);
  const hrsFlat = Array.from({ length: 6 }, (_, i) => ({
    dtMs: baseT + i * 3600000, time: `${String(19 + i).padStart(2, '0')}:00`,
    clear: 95, block: 5, sunAlt: -25, isDay: false, temp: -4
  }));
  const kfcJump = [
    { ts: baseT, kp: 3.33 },
    { ts: baseT + 3 * 3600000, kp: 4.0 }
  ];
  const scDecay = api.scoreHourlyForecast12(hrsFlat, {
    lat: 66.50, lon: 25.73, kpForecast: kfcJump, fallbackKp: 0.67,
    bz: 2.1, nextBz: 2.1, speed: 375, predKp1h: 0.67
  });
  assert.ok(scDecay.hours[2].kpFc < 2.8 && scDecay.hours[2].kpFc > scDecay.hours[1].kpFc, `Hour +2 kpFc (${scDecay.hours[2].kpFc}) must bridge smoothly between +1h (${scDecay.hours[1].kpFc}) and +4h (${scDecay.hours[4].kpFc})`);
  assert.ok(scDecay.hours[3].kpFc > scDecay.hours[2].kpFc && scDecay.hours[3].kpFc < 4.0, `Hour +3 kpFc (${scDecay.hours[3].kpFc}) must ramp smoothly toward 4.0`);

  // (d) METAR-verified ECMWF weighting & zero-flicker same-city SWR guard
  assert.ok(dcSrc.includes('metarConfirmsEcmwf'), 'data-client.js must apply METAR-verified ECMWF weighting when Yr.no misses active cloud decks');
  assert.ok(appSrc.includes('sameCityRendered') && appSrc.includes('!forceNoaa && !sameCityRendered'), 'refreshAll must not overwrite live same-city UI with stale SWR cache during 5-min auto-refresh');
});

test('51. Norway live weather & Kp audit: Svalbard AROME Arctic, 45m 0Z bin guard, obs-calibrated footer & Kirkenes road link', () => {
  const appSrc = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

  // (a) Svalbard (78.22°N, 15.63°E) must be inside Nordic MET box for official MET Norway AROME Arctic 2.5km
  assert.equal(api.isInNordicMetBox(78.2232, 15.6267), true, 'Svalbard Longyearbyen must use official MET Norway AROME Arctic');
  assert.equal(api.isInNordicMetBox(69.6492, 18.9553), true, 'Tromsø must remain inside Nordic MET box');
  assert.equal(api.isInNordicMetBox(64.1466, -21.9426), false, 'Reykjavik must remain outside Nordic MET box');

  // (b) 3h UT boundary all-zero startup persisting 20-40 min (e.g. 18:00..18:25 UTC after settled Kp 1.0)
  const kp25mZero = [
    { time_tag: '2026-11-25T17:58:00', estimated_kp: 1.0, kp_index: 1 },
    { time_tag: '2026-11-25T17:59:00', estimated_kp: 1.0, kp_index: 1 },
    ...Array.from({ length: 26 }, (_, m) => ({
      time_tag: `2026-11-25T18:${String(m).padStart(2, '0')}:00`, estimated_kp: 0, kp_index: 0
    }))
  ];
  assert.equal(api.parseLatestKp(kp25mZero)?.kp, 1.0, 'parseLatestKp must hold settled prior-bin Kp >= 0.67 while all startup samples in new 3h bin are still 0');

  // Genuine quiet day (prior bin 0.33 -> 0.0 for 25m) must NOT be artificially held
  const kpQuietZero = [
    { time_tag: '2026-11-25T17:59:00', estimated_kp: 0.33, kp_index: 0 },
    ...Array.from({ length: 26 }, (_, m) => ({
      time_tag: `2026-11-25T18:${String(m).padStart(2, '0')}:00`, estimated_kp: 0, kp_index: 0
    }))
  ];
  assert.equal(api.parseLatestKp(kpQuietZero)?.kp, 0, 'Genuine quiet Kp 0.33 -> 0 must report 0');

  // (c) Local weather-station calibration resolves model-diverge low confidence cleanly without cryptic airport footer tags
  const ccDiv = { level: 'low', diffPct: 45, metAvg3h: 24, omAvg3h: 69 };
  const expRaw = api.explainAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 67, sunAlt: -20, kp: 1, ovation: 8, usedMet: true, cloudConsensus: ccDiv, metarCalibrated: false, lang: 'zh' });
  assert.equal(expRaw.confidence.level, 'low');
  assert.equal(expRaw.confidence.primaryReason, 'model-diverge');

  const expCal = api.explainAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 67, sunAlt: -20, kp: 1, ovation: 8, usedMet: true, cloudConsensus: ccDiv, metarCalibrated: true, lang: 'zh' });
  assert.equal(expCal.confidence.level, 'medium');
  assert.equal(expCal.confidence.primaryReason, 'obs-calibrated');
  assert.ok(expCal.confidence.badgeText.includes('已參照當地實測'), `Expected calm local obs badge, got ${expCal.confidence.badgeText}`);

  const expCalEn = api.explainAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 67, sunAlt: -20, kp: 1, ovation: 8, usedMet: true, cloudConsensus: ccDiv, metarCalibrated: true, lang: 'en' });
  assert.equal(expCalEn.confidence.primaryReason, 'obs-calibrated');
  assert.ok(!/[\u4e00-\u9fff]/.test(expCalEn.confidence.badgeText + expCalEn.confidence.headline), 'EN obs-calibrated copy must not leak CJK');

  // (d) Global copy & regional consistency: zero cryptic airport labels anywhere in UI, clear moon wording,
  //     pole-aware Southern Hemisphere direction, honest straight-line GPS CTA, and tight global road-link bounds
  const htmlSrc = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const i18nSrc = fs.readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  const fmtSrc = fs.readFileSync(new URL('../src/copy-formatters.js', import.meta.url), 'utf8');
  const uiCopySrc = appSrc + '\n' + fmtSrc;
  assert.ok(!uiCopySrc.includes('機場') && !htmlSrc.includes('機場') && !i18nSrc.includes('機場'), 'UI copy must use plain 當地氣象站 wording instead of cryptic 機場');
  assert.ok(uiCopySrc.includes("'滿月'") && uiCopySrc.includes("'有亮月'"), 'Darkness pillar moon sub-label must clearly distinguish 滿月 / 有亮月');
  assert.ok(uiCopySrc.includes('朝頭頂與南方觀察') && uiCopySrc.includes('look overhead and south'), 'Southern Hemisphere hero cue must point south, not north');
  assert.ok(appSrc.includes('bestDir.isGeneric') && appSrc.includes('直線 ~'), 'Generic GPS compass CTA must label straight-line distance honestly');
  assert.ok(appSrc.includes('else if (pos.lon >= 4)') && appSrc.includes('pos.lon < 26 || pos.lat >= 69.0'), 'Nordic road links must cover Finnmark/Kirkenes and exclude UK/Scotland');
  assert.ok(appSrc.includes('pos.lat >= 59 && pos.lon >= -126'), 'NWT Highways road link must not leak onto eastern North America');

  // (e) 3-Night Outlook clear-sky vs peak-Kp timing mismatch (e.g. Oslo Thu 11/26: 100% clear at Kp 2.7, 0% clear at Kp 5 G1)
  const osloThuBase = Date.UTC(2026, 10, 26, 16, 30, 0);
  const osloMismatchPts = [
    { dtMs: osloThuBase,               clear: 100, block: 0,   sunAlt: -10, isDay: false, stepHrs: 1 },
    { dtMs: osloThuBase + 1 * 3600000, clear: 100, block: 0,   sunAlt: -16, isDay: false, stepHrs: 1 },
    { dtMs: osloThuBase + 2 * 3600000, clear: 85,  block: 15,  sunAlt: -22, isDay: false, stepHrs: 1 },
    { dtMs: osloThuBase + 5 * 3600000, clear: 0,   block: 100, sunAlt: -38, isDay: false, stepHrs: 1 },
    { dtMs: osloThuBase + 6 * 3600000, clear: 0,   block: 100, sunAlt: -42, isDay: false, stepHrs: 1 },
    { dtMs: osloThuBase + 7 * 3600000, clear: 0,   block: 100, sunAlt: -45, isDay: false, stepHrs: 1 }
  ];
  const osloMismatchKfc = [
    { ts: Date.UTC(2026, 10, 26, 15, 0, 0), kp: 2.67 },
    { ts: Date.UTC(2026, 10, 26, 18, 0, 0), kp: 2.67 },
    { ts: Date.UTC(2026, 10, 26, 21, 0, 0), kp: 5.0 },
    { ts: Date.UTC(2026, 10, 27, 0, 0, 0),  kp: 5.0 }
  ];
  const osloN3 = api.summarize3NightOutlook({
    cloudPoints: osloMismatchPts, kpForecast: osloMismatchKfc, currentKp: 1,
    lat: 59.9139, lon: 10.7522, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-25T18:50:00Z'), lang: 'zh'
  });
  const thu = osloN3[1];
  assert.equal(thu.peakCloudMismatch, true, 'Oslo Thu 11/26 must flag peakCloudMismatch when clear evening misses overcast Kp 5 storm');
  assert.equal(thu.kpPeakClear, 0, 'kpPeakClear must report 0% clear during the overcast Kp 5 storm');
  assert.equal(thu.badge, '強極光時雲厚', 'Mismatch night badge must clearly explain why score is low');

  const osloN3En = api.summarize3NightOutlook({
    cloudPoints: osloMismatchPts, kpForecast: osloMismatchKfc, currentKp: 1,
    lat: 59.9139, lon: 10.7522, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-25T18:50:00Z'), lang: 'en'
  });
  assert.equal(osloN3En[1].badge, 'Cloudy at peak');
  assert.equal(api.traditionalRegionName('NO', 'Norway'), '挪威', 'English city search in zh-TW must localize country code NO -> 挪威');
});

test('52. Live GPS nowcast (5m Nordic radar + 15m Open-Meteo current) & anti-loophole property fuzzing (300 nights, 360 UT bins, all IEM null shapes)', () => {
  // (a) Nordic radar box excludes Svalbard (HTTP 422) while covering mainland Norway/Sweden/Finland
  assert.equal(api.isInNordicRadarBox(69.6492, 18.9553), true, 'Tromsø inside Nordic radar box');
  assert.equal(api.isInNordicRadarBox(68.3495, 18.8312), true, 'Abisko inside Nordic radar box');
  assert.equal(api.isInNordicRadarBox(66.5039, 25.7294), true, 'Rovaniemi inside Nordic radar box');
  assert.equal(api.isInNordicRadarBox(78.2232, 15.6267), false, 'Svalbard outside Nordic radar box (422)');

  // (b) 5-min MET Norway Nowcast parser + snow squall occlusion + stale guard
  const nowMs = Date.UTC(2026, 10, 25, 19, 10, 0);
  const squallJson = {
    properties: {
      meta: { updated_at: '2026-11-25T19:05:00Z', radar_coverage: 'ok' },
      timeseries: [
        { time: '2026-11-25T19:05:00Z', data: { instant: { details: { air_temperature: -1.8, wind_speed: 6.2, precipitation_rate: 0.7 } } } },
        { time: '2026-11-25T19:10:00Z', data: { instant: { details: { precipitation_rate: 1.1 } } } }
      ]
    }
  };
  const rad = api.parseMetNorwayNowcast(squallJson, nowMs);
  assert.ok(rad && rad.precipRate === 0.7 && rad.peakPrecip30m === 1.1 && rad.ageMin === 5);
  assert.equal(api.parseMetNorwayNowcast({ properties: { meta: { updated_at: '2026-11-25T18:00:00Z', radar_coverage: 'ok' }, timeseries: [{}] } }, nowMs), null, 'Stale >30m radar must be rejected');
  assert.equal(api.parseMetNorwayNowcast({ properties: { meta: { updated_at: '2026-11-25T19:05:00Z', radar_coverage: 'no coverage' }, timeseries: [{}] } }, nowMs), null, 'No radar coverage must return null');

  // (c) 15-min Open-Meteo current parser + assimilation precedence (radar overrides false clear; METAR beats 15m NWP)
  const omCur = api.parseOpenMeteoCurrent({
    current: { time: Math.floor((nowMs - 10 * 60000) / 1000), cloud_cover: 82, temperature_2m: -14.2, wind_speed_10m: 18, precipitation: 0, weather_code: 3 }
  }, nowMs);
  assert.ok(omCur && omCur.cloud === 82 && omCur.effCloud === 82 && omCur.windMs === 5);

  const clearHrs = [{ dtMs: nowMs, time: '20:00', block: 20, clear: 80, temp: -1, windMs: 2, windChill: -4, precip: 0, isDay: false, txt: '🌟 晴' }];
  const fusedRadar = api.assimilateLiveGpsNowcast(clearHrs, { radarNowcast: rad, omCurrent: omCur, hasFreshMetar: true, usedMet: true });
  assert.equal(fusedRadar.radarActive, true);
  assert.ok(fusedRadar.hours[0].block >= 90 && fusedRadar.hours[0].clear <= 10, `Active 5m radar snow squall must suppress false clear sky, got clear=${fusedRadar.hours[0].clear}%`);
  assert.equal(fusedRadar.hours[0].txt, '❄️ 雪');

  const remoteFused = api.assimilateLiveGpsNowcast(clearHrs, { radarNowcast: null, omCurrent: omCur, hasFreshMetar: false, usedMet: false });
  assert.equal(remoteFused.source, 'gps-15m');
  assert.ok(remoteFused.hours[0].block > 20 && remoteFused.hours[0].block < 82, 'Remote GPS 15m current must blend smoothly without snapping');

  const metarGuarded = api.assimilateLiveGpsNowcast(clearHrs, { radarNowcast: null, omCurrent: omCur, hasFreshMetar: true, usedMet: false });
  assert.equal(metarGuarded.applied, false, '15m Open-Meteo NWP must NEVER override a fresh local ground weather-station METAR');

  // (d) Exhaustive 8×45 = 360 UT boundary rollover minute sweep: parseLatestKp must NEVER collapse from Kp>=0.67 to 0 during all-zero startup
  for (let h = 0; h < 24; h += 3) {
    const prevH = (h + 23) % 24;
    const prevDay = h === 0 ? 24 : 25;
    for (let m = 0; m < 45; m++) {
      const rows = [
        { time_tag: `2026-11-${String(prevDay).padStart(2, '0')}T${String(prevH).padStart(2, '0')}:59:00`, estimated_kp: 1.33, kp_index: 1 },
        ...Array.from({ length: m + 1 }, (_, k) => ({
          time_tag: `2026-11-25T${String(h).padStart(2, '0')}:${String(k).padStart(2, '0')}:00`, estimated_kp: 0, kp_index: 0
        }))
      ];
      assert.equal(api.parseLatestKp(rows)?.kp, 1.33, `UT rollover ${h}:${m} collapsed to 0`);
    }
  }

  // (e) All IEM null-column raw METAR fallback sky codes
  const iemCases = [
    ['CAVOK', 0, 'CLR'], ['NCD', 0, 'CLR'], ['NSC', 0, 'CLR'],
    ['FEW015', 19, 'FEW'], ['SCT020', 44, 'SCT'], ['BKN012', 75, 'BKN'], ['OVC008', 100, 'OVC']
  ];
  for (const [tok, expCloud, expCode] of iemCases) {
    const parsed = api.parseIemMetarCurrent({
      data: [{
        station: 'TEST', utc_valid: '2026-11-25T19:00:00Z',
        skyc1: null, skyc2: null, skyc3: null, skyc4: null,
        skyl1: null, skyl2: null, skyl3: null, skyl4: null,
        wxcodes: null, raw: `TEST 251900Z AUTO 01005KT ${tok} M02/M05 Q1020`
      }]
    }, nowMs);
    assert.ok(parsed && parsed.effCloud === expCloud && parsed.skyCode === expCode, `IEM null-array fallback failed for ${tok}: got ${JSON.stringify(parsed)}`);
  }

  // (f) Property-based 3-Night contradiction fuzzing across 200 seeded randomized scenarios
  let seed = 424242;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 200; i++) {
    const lat = 58 + rnd() * 14;
    const lon = 10 + rnd() * 18;
    const base = Date.UTC(2026, 10, 26, 16, 30, 0);
    const earlyClear = Math.round(rnd() * 100);
    const lateClear = Math.round(rnd() * 100);
    const earlyKp = +(1 + rnd() * 2.2).toFixed(2);
    const lateKp = +(3.3 + rnd() * 3.2).toFixed(2);
    const pts = Array.from({ length: 12 }, (_, h) => {
      const clr = h < 4 ? earlyClear : lateClear;
      return { dtMs: base + h * 3600000, clear: clr, block: 100 - clr, sunAlt: -25, isDay: false, stepHrs: 1 };
    });
    const kfc = [
      { ts: Date.UTC(2026, 10, 26, 15, 0, 0), kp: earlyKp },
      { ts: Date.UTC(2026, 10, 26, 18, 0, 0), kp: earlyKp },
      { ts: Date.UTC(2026, 10, 26, 21, 0, 0), kp: lateKp },
      { ts: Date.UTC(2026, 10, 27, 0, 0, 0), kp: lateKp },
      { ts: Date.UTC(2026, 10, 27, 3, 0, 0), kp: lateKp }
    ];
    const n3 = api.summarize3NightOutlook({
      cloudPoints: pts, kpForecast: kfc, currentKp: 1,
      lat, lon, timeZone: 'Europe/Oslo', nowDate: new Date('2026-11-25T19:00:00Z'), lang: 'zh'
    });
    const d1 = n3[1];
    if (d1.scoreAvailable && d1.bestNightScore < 18 && d1.bestClear >= 45 && d1.maxKp >= 3.0 && d1.kpPeakClear !== null && d1.kpPeakClear < 30 && (d1.bestClear - d1.kpPeakClear) >= 25) {
      assert.equal(d1.peakCloudMismatch, true, `Fuzz #${i} missed peakCloudMismatch: ${JSON.stringify(d1)}`);
      assert.equal(d1.badge, '強極光時雲厚', `Fuzz #${i} badge mismatch: ${d1.badge}`);
    }
  }
});

test('53. v43 Dual-Model +4..23h Ensemble, Honest RSS Uncertainty Range & Live/Trend SVG Split', () => {
  const baseMs = Date.UTC(2026, 10, 25, 19, 0, 0);
  const mkMet = (i, block) => ({
    dtMs: baseMs + i * 3600000,
    time: `${String((20 + i) % 24).padStart(2, '0')}:00`,
    block, clear: 100 - block, temp: -4.2, windMs: 3.1, windChill: -9, precip: i === 5 ? 0.4 : 0,
    isDay: i >= 14 && i <= 17, sunAlt: (i >= 14 && i <= 17) ? 2 : -22, txt: i === 5 ? '❄️ 雪' : '🌟 晴'
  });
  const mkOm = (i, block) => ({
    dtMs: baseMs + i * 3600000,
    time: `${String((20 + i) % 24).padStart(2, '0')}:00`,
    block, clear: 100 - block, temp: 1.5, windMs: 9.0, precip: 0, isDay: false
  });

  // (a) Nordic horizon-aware blending: +0..2h pure MEPS, +3h 0.25 transition, +4..23h 50/50 ensemble
  const metHrs = Array.from({ length: 24 }, (_, i) => mkMet(i, 20));
  const omHrs = Array.from({ length: 24 }, (_, i) => mkOm(i, 80));
  const blended = api.blendNordicHourlyForecasts(metHrs, omHrs, { metarConfirmsEcmwf: false });
  assert.equal(blended[0].block, 20, '+0h preserves 2.5km MEPS');
  assert.equal(blended[2].block, 20, '+2h preserves 2.5km MEPS');
  assert.equal(blended[3].block, 35, '+3h applies 0.25 smooth transition (0.75*20 + 0.25*80 = 35)');
  assert.equal(blended[4].block, 50, '+4h applies 50/50 ensemble (0.5*20 + 0.5*80 = 50)');
  assert.equal(blended[23].block, 50, '+23h applies 50/50 ensemble');
  for (let i = 0; i < 24; i++) {
    assert.equal(blended[i].cloudSpread, 60, `hr ${i} raw cloudSpread must be 60`);
    assert.equal(blended[i].clearLow, 20, `hr ${i} clearLow must be 20`);
    assert.equal(blended[i].clearHigh, 80, `hr ${i} clearHigh must be 80`);
    assert.equal(blended[i].temp, -4.2, `hr ${i} must preserve MEPS surface temp`);
    assert.equal(blended[i].windMs, 3.1, `hr ${i} must preserve MEPS surface wind`);
  }
  assert.equal(blended[5].txt, '❄️ 雪', 'Precip >= 0.1 must preserve snow icon even when blended cloud drops');

  // (b) When live METAR confirms ECMWF >=20 pts closer, +0..3h blends at 0.50
  const confirmed = api.blendNordicHourlyForecasts(metHrs, omHrs, { metarConfirmsEcmwf: true });
  assert.equal(confirmed[0].block, 50, 'METAR-confirmed ECMWF damps +0h at 0.50');
  assert.equal(confirmed[3].block, 50, 'METAR-confirmed ECMWF damps +3h at 0.50');

  // (c) Unmatched timestamps must emit null spread (never fake 0)
  const partialOm = omHrs.slice(0, 6);
  const partialBlend = api.blendNordicHourlyForecasts(metHrs, partialOm);
  assert.equal(partialBlend[5].cloudSpread, 60);
  assert.equal(partialBlend[6].cloudSpread, null);
  assert.equal(partialBlend[6].clearLow, null);
  assert.equal(partialBlend[6].clearHigh, null);

  // (d) Global blendHourlyForecasts emits cloudSpread/clearLow/clearHigh on matched hours and null on unmatched
  const gBlend = api.blendHourlyForecasts(metHrs.slice(0, 8), partialOm);
  assert.equal(gBlend[0].block, 50);
  assert.equal(gBlend[0].cloudSpread, 60);
  assert.equal(gBlend[0].clearLow, 20);
  assert.equal(gBlend[0].clearHigh, 80);
  assert.equal(gBlend[7].cloudSpread, null);

  // (e) scoreHourlyForecast12 RSS uncertainty invariants across 24h (Tromsø)
  const kpFc = Array.from({ length: 10 }, (_, k) => ({ ts: baseMs + k * 3 * 3600000, kp: 3.0 }));
  const scored = api.scoreHourlyForecast12(blended, {
    lat: 69.65, lon: 18.96, kpForecast: kpFc, fallbackKp: 3.0, bz: -3, speed: 460
  });
  for (let i = 0; i < 24; i++) {
    const h = scored.hours[i];
    assert.ok(Number.isFinite(h.scoreLow) && Number.isFinite(h.scoreHigh), `hr ${i} finite score bounds`);
    assert.ok(h.scoreLow >= 0 && h.scoreLow <= h.score && h.score <= h.scoreHigh && h.scoreHigh <= 99,
      `hr ${i} invariant failed: ${h.scoreLow} <= ${h.score} <= ${h.scoreHigh}`);
    if (i < 4) {
      assert.equal(h.scoreLow, h.score, `hr ${i} live nowcast has zero uncertainty band`);
      assert.equal(h.scoreHigh, h.score, `hr ${i} live nowcast has zero uncertainty band`);
    } else if (h.isDay || h.outOfZone) {
      assert.equal(h.scoreLow, 0, `gated hr ${i} scoreLow must be 0`);
      assert.equal(h.scoreHigh, 0, `gated hr ${i} scoreHigh must be 0`);
    } else {
      assert.ok(h.scoreHigh > h.scoreLow, `ungated Trend hr ${i} with spread=60 must have non-zero band, got ${h.scoreLow}..${h.scoreHigh}`);
    }
  }

  // (f) Both models agree on 100% overcast -> 0..0 even at +10h
  const ovcHrs = Array.from({ length: 12 }, (_, i) => ({
    ...mkMet(i, 100), cloudSpread: 0, clearLow: 0, clearHigh: 0, isDay: false, sunAlt: -25
  }));
  const ovcScored = api.scoreHourlyForecast12(ovcHrs, { lat: 69.65, lon: 18.96, kpForecast: kpFc, fallbackKp: 5.0 });
  assert.equal(ovcScored.hours[8].score, 0);
  assert.equal(ovcScored.hours[8].scoreLow, 0);
  assert.equal(ovcScored.hours[8].scoreHigh, 0);

  // (g) Wider cloudSpread yields strictly wider (or equal) uncertainty band than 0 cloudSpread
  const agreeHrs = blended.map(h => ({ ...h, cloudSpread: 0, clearLow: h.clear, clearHigh: h.clear }));
  const agreeScored = api.scoreHourlyForecast12(agreeHrs, { lat: 69.65, lon: 18.96, kpForecast: kpFc, fallbackKp: 3.0 });
  assert.ok(
    (scored.hours[6].scoreHigh - scored.hours[6].scoreLow) > (agreeScored.hours[6].scoreHigh - agreeScored.hours[6].scoreLow),
    'Model cloud disagreement (spread=60) must widen score range vs model agreement (spread=0)'
  );

  // (h) Out-of-zone Taipei stays 0..0 on every hour
  const taipeiScored = api.scoreHourlyForecast12(blended, { lat: 25.03, lon: 121.56, kpForecast: kpFc, fallbackKp: 5.0 });
  for (const h of taipeiScored.hours) {
    assert.equal(h.score, 0);
    assert.equal(h.scoreLow, 0);
    assert.equal(h.scoreHigh, 0);
  }

  // (i) buildSkyWaveSVG renders Live/Trend split, bilingual zone tags, conditional whiskers, and midnight collision guard
  const svgZh = api.buildSkyWaveSVG(scored.hours, scored.bestAurora, 6, 'zh');
  const svgEn = api.buildSkyWaveSVG(scored.hours, scored.bestAurora, 6, 'en');
  assert.ok(svgZh.includes('data-role="horizon-split"'), 'ZH SVG includes Live/Trend divider');
  assert.ok(svgZh.includes('>即時<') && svgZh.includes('>趨勢<'), 'ZH SVG includes 即時 / 趨勢 zone tags');
  assert.ok(svgEn.includes('>Live<') && svgEn.includes('>Trend<'), 'EN SVG includes Live / Trend zone tags');
  assert.ok(!/[\u4e00-\u9fff]/.test(svgEn), 'EN SVG must have zero CJK leakage');
  assert.ok(!svgZh.includes('NaN') && !svgEn.includes('NaN'), 'SVG must contain zero NaN');
  assert.ok(svgZh.includes('data-role="score-range"'), 'Wide-spread Trend bars render conditional score-range whiskers');

  // Midnight at index 4 sits 7.7px right of the inter-bar Live/Trend split: both render cleanly without overlap
  const midAt4 = scored.hours.map((h, i) => ({
    ...h, time: `${String((20 + i) % 24).padStart(2, '0')}:00`
  }));
  const svgMid4 = api.buildSkyWaveSVG(midAt4, midAt4[10], 10, 'zh');
  assert.ok(svgMid4.includes('data-role="horizon-split"') && svgMid4.includes('data-role="midnight-line"'), 'Both Live/Trend rail divider and calm midnight hairline render cleanly without collision');
  assert.ok(!svgMid4.includes('stroke-dasharray'), '24h chart must not accumulate noisy dashed lines');
  assert.ok(svgMid4.includes('>明天<'), 'Midnight label 明天 still renders cleanly');
});

test('54. v47 Route A Scientific Upgrades: 51-Member ECMWF Layered Ensemble, SMHI Lapland Stations & NOAA Geospace 1h MHD Dst', async () => {
  const nowMs = Date.UTC(2026, 10, 25, 20, 15, 0);
  const baseStartSec = Math.floor(Date.UTC(2026, 10, 25, 20, 0, 0) / 1000);

  // (a) ECMWF 51-member layered cloud ensemble parser: thin cirrus vs opaque low stratus per member
  const ensHourly = { time: Array.from({ length: 24 }, (_, i) => baseStartSec + i * 3600) };
  for (let m = 0; m < 51; m++) {
    const sfx = m === 0 ? '' : `_member${String(m).padStart(2, '0')}`;
    // Spread members linearly from 0% to 100% low cloud on hr 6; pure thin high cirrus (100% high, 0% low/mid) on hr 0
    ensHourly[`cloud_cover${sfx}`] = Array.from({ length: 24 }, (_, i) => i === 0 ? 100 : Math.round((m / 50) * 100));
    ensHourly[`cloud_cover_low${sfx}`] = Array.from({ length: 24 }, (_, i) => i === 0 ? 0 : Math.round((m / 50) * 100));
    ensHourly[`cloud_cover_mid${sfx}`] = Array.from({ length: 24 }, () => 0);
    ensHourly[`cloud_cover_high${sfx}`] = Array.from({ length: 24 }, (_, i) => i === 0 ? 100 : 0);
  }
  const ensHrs = api.parseEcmwfCloudEnsemble({ hourly: ensHourly }, new Date(nowMs), 24);
  assert.equal(ensHrs.length, 24);
  assert.equal(ensHrs[0].ensMembers, 51);
  // Thin cirrus (100% high, 0% low/mid) yields effective cloud 30% -> 70% clear across all 51 members!
  assert.equal(ensHrs[0].ensBlockP50, 30, '100% high cirrus with 0% low/mid must yield 30% effective block');
  assert.equal(ensHrs[0].ensClearP50, 70);
  assert.equal(ensHrs[0].ensClearProb, 100, 'All 51 thin-cirrus members have clear=70% >= 55%');
  // Uniform 0..100% low cloud across 51 members on hr 6: P10=10, P50=50, P90=90 -> clearP10=10, clearP50=50, clearP90=90
  assert.equal(ensHrs[6].ensBlockP10, 10);
  assert.equal(ensHrs[6].ensBlockP50, 50);
  assert.equal(ensHrs[6].ensBlockP90, 90);
  assert.equal(ensHrs[6].ensClearP10, 10);
  assert.equal(ensHrs[6].ensClearP50, 50);
  assert.equal(ensHrs[6].ensClearP90, 90);
  assert.equal(ensHrs[6].ensSpread, 80);
  assert.ok(ensHrs[6].ensClearProb >= 40 && ensHrs[6].ensClearProb <= 50, `Expected ~45% clearProb (block<=45), got ${ensHrs[6].ensClearProb}`);

  // Reject hours with <15 valid members
  const tinyEns = { hourly: { time: [baseStartSec], cloud_cover: [20], cloud_cover_member01: [30] } };
  assert.equal(api.parseEcmwfCloudEnsemble(tinyEns, new Date(nowMs), 24).length, 0, '<15 members must be rejected');

  // (b) Nordic & Global fusion with 51-member ensemble
  const metHrs = Array.from({ length: 24 }, (_, i) => ({
    dtMs: (baseStartSec + i * 3600) * 1000 + 1800000,
    time: `${String((21 + i) % 24).padStart(2, '0')}:00`,
    block: 20, clear: 80, temp: -6, windMs: 2, precip: 0, isDay: false, sunAlt: -20, txt: '🌟 晴'
  }));
  const omHrs = metHrs.map(h => ({ ...h, block: 90, clear: 10, precip: 0 }));
  const nordicEns = api.blendNordicHourlyForecasts(metHrs, omHrs, { metarConfirmsEcmwf: false, ensHrs });
  assert.equal(nordicEns[0].block, 20, '+0h preserves pure 2.5km MEPS');
  assert.equal(nordicEns[2].block, 20, '+2h preserves pure 2.5km MEPS');
  // At +6h: MEPS=20, 51-member median=50 -> 50/50 = 35 (NOT 55 from noisy single-run 90!)
  assert.equal(nordicEns[6].block, 35, '+6h blends MEPS (20) with 51-member median (50) -> 35');
  assert.equal(nordicEns[6].clearLow, 10, 'Outer clearLow captures min(detLow=10, ensClearP10=10)');
  assert.equal(nordicEns[6].clearHigh, 90, 'Outer clearHigh expands to ensClearP90=90');
  assert.equal(nordicEns[6].ensMembers, 51);

  // Heavy-precip guard: when deterministic ECMWF has precip >= 0.5 and higher block than ENS median
  const omWet = metHrs.map(h => ({ ...h, block: 90, clear: 10, precip: 1.2 }));
  const nordicWet = api.blendNordicHourlyForecasts(metHrs, omWet, { metarConfirmsEcmwf: false, ensHrs });
  // synopticBlock = 0.5*50 + 0.5*90 = 70 -> 0.5*20 + 0.5*70 = 45
  assert.equal(nordicWet[6].block, 45, 'Heavy-precip guard prevents ENS median from undercutting deterministic storm');

  // Iceland global mode (replaceSecondaryFromIdx: Infinity) preserves verified best_match+ICON point forecast while attaching P10..P90
  const icelandBlend = api.blendHourlyForecasts(metHrs, omHrs, { ensHrs, replaceSecondaryFromIdx: Infinity });
  assert.equal(icelandBlend[6].block, 55, 'Iceland preserves exact 50/50 best_match+ICON point forecast (0.5*20+0.5*90=55)');
  assert.equal(icelandBlend[6].clearHigh, 90, 'Iceland still expands clearHigh to ensClearP90');
  assert.equal(icelandBlend[6].ensMembers, 51);

  // (c) SMHI Swedish Lapland ground stations + parser + 0.68 OI gain
  const abiskoSmhi = api.findNearestSmhiCloudStation(68.3495, 18.8312, 55);
  assert.ok(abiskoSmhi && abiskoSmhi.id === '188790' && abiskoSmhi.distKm < 2, `Abisko must match SMHI 188790 (<2km), got ${JSON.stringify(abiskoSmhi)}`);
  assert.equal(api.findNearestMetarStation(68.3495, 18.8312, 55), null, 'Abisko has no airport METAR within 55km');

  const smhiGood = api.parseSmhiCloudObs({ value: [{ date: nowMs - 15 * 60000, value: '12', quality: 'G' }] }, nowMs, '188790');
  assert.ok(smhiGood && smhiGood.source === 'SMHI' && smhiGood.effCloud === 12 && smhiGood.clearPct === 88 && smhiGood.skyCode === 'FEW' && smhiGood.ageMin === 15);
  assert.equal(api.parseSmhiCloudObs({ value: [{ date: nowMs - 15 * 60000, value: '12', quality: 'Y' }] }, nowMs, '188790'), null, 'Suspect quality Y must be rejected');
  assert.equal(api.parseSmhiCloudObs({ value: [{ date: nowMs - 120 * 60000, value: '12', quality: 'G' }] }, nowMs, '188790'), null, 'Stale >90m SMHI obs must be rejected');
  assert.equal(api.parseSmhiCloudObs({ value: [{ date: nowMs - 15 * 60000, value: '125', quality: 'G' }] }, nowMs, '188790'), null, 'Out-of-range >100% must be rejected');

  const smhiFus = api.assimilateMetarNowcast(omHrs, smhiGood, 0.8);
  const metarFus = api.assimilateMetarNowcast(omHrs, { ...smhiGood, source: 'MET Norway' }, 0.8);
  assert.equal(smhiFus.applied, true);
  assert.ok(smhiFus.weight0 < metarFus.weight0, `SMHI peak gain (0.68) must be slightly more conservative than METAR (0.72): ${smhiFus.weight0} vs ${metarFus.weight0}`);
  assert.ok(smhiFus.hours[0].clear > 50, `Abisko SMHI 88% clear must lift false overcast NWP, got clear=${smhiFus.hours[0].clear}%`);

  // (d) NOAA Geospace 1h Forward MHD Dst parser + despike + safe combination with Kyoto Dst
  const mhdRows = Array.from({ length: 110 }, (_, k) => {
    const t = new Date(nowMs - 55 * 60000 + k * 60000).toISOString().slice(0, 19);
    // Steady -15 nT until now, then smooth CME drop to -65 nT ahead; inject single-minute -300 nT glitch at k=80
    let dst = k < 55 ? -15 : Math.round(-15 - ((k - 55) / 54) * 50);
    if (k === 80) dst = -300;
    return { time_tag: t, dst };
  });
  const mhd = api.parseGeospaceDst1h(mhdRows, nowMs);
  assert.ok(mhd && mhd.nowDst >= -20 && mhd.nowDst <= -12, `nowDst should be ~-15 nT, got ${JSON.stringify(mhd)}`);
  assert.ok(mhd.nextDst <= -55 && mhd.nextDst >= -68, `10m rolling nextDst must capture smooth -65 nT CME drop while rejecting -300 nT spike, got ${mhd.nextDst}`);
  assert.ok(mhd.minDst > -100, `3-pt median despiker must reject -300 nT 1m spike, got minDst=${mhd.minDst}`);
  assert.equal(api.parseGeospaceDst1h([{ time_tag: new Date(nowMs - 45 * 60000).toISOString().slice(0, 19), dst: -40 }], nowMs), null, 'Stale >30m MHD Dst must return null');

  const resQuiet = api.resolveEffectiveDst({ dst: -12 }, { nowDst: -18, nextDst: -60 });
  assert.equal(resQuiet.dstNow, -12, 'NOW preserves ground-truth Kyoto when MHD within 20 nT');
  assert.equal(resQuiet.dstNext, Math.round(0.25 * -12 + 0.75 * -60), '+ETA weights forward deepening MHD Dst 75%');
  assert.equal(resQuiet.usedMhd, true);

  const resSurge = api.resolveEffectiveDst({ dst: -10 }, { nowDst: -55, nextDst: -70 });
  assert.equal(resSurge.dstNow, Math.round(0.30 * -10 + 0.70 * -55), 'NOW responds when MHD detects >20 nT rapid main-phase drop');

  // (e) Live smoke verification of all 3 Route A endpoints when LIVE_TEST=1
  if (process.env.LIVE_TEST === '1') {
    const [rEns, rSmhi, rDst] = await Promise.all([
      fetch('https://ensemble-api.open-meteo.com/v1/ensemble?latitude=69.65&longitude=18.96&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&models=ecmwf_ifs025&timeformat=unixtime&forecast_hours=26').then(r => r.json()),
      fetch('https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/16/station/188790/period/latest-hour/data.json').then(r => r.json()),
      fetch('https://services.swpc.noaa.gov/json/geospace/geospace_dst_1_hour.json').then(r => r.json())
    ]);
    const liveEns = api.parseEcmwfCloudEnsemble(rEns, new Date(), 24);
    assert.ok(liveEns.length >= 20 && liveEns[0].ensMembers >= 40, `Live ECMWF ensemble returned ${liveEns.length}h / ${liveEns[0]?.ensMembers}m`);
    const liveDst = api.parseGeospaceDst1h(rDst, Date.now());
    assert.ok(liveDst && Number.isFinite(liveDst.nowDst) && Number.isFinite(liveDst.nextDst), `Live Geospace MHD Dst failed: ${JSON.stringify(liveDst)}`);
    // SMHI Abisko may have empty latest-hour briefly during top-of-hour rollover, so verify valid JSON schema or parsed obs
    assert.ok(rSmhi && Array.isArray(rSmhi.value), 'Live SMHI Abisko 188790 returned valid JSON schema');
  }
});

test('55. Tonight 3-Night Outlook maxKp parity with 24h live-calibrated chart (no phantom stale-bin Kp 4.0)', () => {
  // Reproduces Tromsø 22:20 CET (21:20 UTC) when NOAA 3h forecast left stale 4.00 in 21:00 UTC bin
  // while live 1m Kp=1.0 and Geospace 1h MHD predKp1h=0.67, and rest of tonight is 3.00 / 3.33 / 2.67.
  const nowDate = new Date('2026-11-25T21:20:00Z');
  const baseMs = Date.UTC(2026, 10, 25, 21, 0, 0);
  const hrs24 = Array.from({ length: 24 }, (_, i) => {
    const dtMs = baseMs + i * 3600000;
    const hrCet = (22 + i) % 24;
    const isDay = hrCet >= 10 && hrCet <= 13;
    return {
      dtMs, time: `${String(hrCet).padStart(2, '0')}:00`,
      block: 35, clear: 65, temp: -1, windMs: 3, precip: 0, isDay, sunAlt: isDay ? 1 : -18
    };
  });
  const kpFc = [
    { ts: Date.UTC(2026, 10, 25, 21, 0, 0), kp: 4.0 },
    { ts: Date.UTC(2026, 10, 26, 0, 0, 0), kp: 3.0 },
    { ts: Date.UTC(2026, 10, 26, 3, 0, 0), kp: 3.33 },
    { ts: Date.UTC(2026, 10, 26, 6, 0, 0), kp: 2.67 },
    { ts: Date.UTC(2026, 10, 26, 18, 0, 0), kp: 3.67 },
    { ts: Date.UTC(2026, 10, 26, 21, 0, 0), kp: 5.0 },
    { ts: Date.UTC(2026, 10, 27, 0, 0, 0), kp: 4.33 }
  ];
  const scored = api.scoreHourlyForecast12(hrs24, {
    lat: 69.6492, lon: 18.9553, kpForecast: kpFc, fallbackKp: 1.0,
    bz: 0.5, nextBz: 0.5, speed: 380, predKp1h: 0.67
  });
  const chartTonightMaxKp = Math.max(...scored.hours.slice(0, 11).filter(h => !h.isDay).map(h => h.kpFc));
  assert.ok(chartTonightMaxKp <= 3.4, `Chart tonight max Kp should be ~3.33, got ${chartTonightMaxKp}`);

  const nights = api.summarize3NightOutlook({
    cloudPoints: hrs24, kpForecast: kpFc, currentKp: 1.0,
    lat: 69.6492, lon: 18.9553, timeZone: 'Europe/Oslo', nowDate, chartHours: scored.hours, lang: 'zh'
  });
  assert.equal(nights[0].maxKp, +chartTonightMaxKp.toFixed(1), `Tonight card maxKp (${nights[0].maxKp}) must match 24h chart max (${chartTonightMaxKp.toFixed(1)}), never phantom 4.0`);
  assert.equal(nights[1].maxKp, 5.0, 'Tomorrow night must still capture post-chart Kp 5.0 G1 storm');
  assert.equal(nights[1].gScale, 1, 'Tomorrow night must still flag G1');
});

test('56. v50 World-Class Upgrades: FMI Nordic Ground Magnetometers, Finnish Lapland Cloud Sensors, Adaptive BMA & Substorm Phase', async () => {
  const nowMs = Date.UTC(2026, 10, 26, 4, 30, 0);

  // (a) FMI WFS Magnetometer parser: DC-offset invariance (2306 nT quiet baseline), 1-sample spike rejection, real -180 nT negative bay
  const mkMagXml = (vals) => `<wfs:FeatureCollection>${vals.map((v, k) => {
    const t = new Date(nowMs - (vals.length - 1 - k) * 5 * 60000).toISOString().slice(0, 19) + 'Z';
    return `<wfs:member><BsWfs:BsWfsElement><BsWfs:Location><gml:Point><gml:pos>69.05800 20.77470 </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>${t}</BsWfs:Time><BsWfs:ParameterName>MAGNX_PT1M_AVG</BsWfs:ParameterName><BsWfs:ParameterValue>${v}</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>`;
  }).join('')}</wfs:FeatureCollection>`;

  // Quiet night with huge arbitrary DC baseline (14690 nT) + single isolated -500 nT glitch spike -> MUST stay quiet!
  const quietVals = Array.from({ length: 24 }, (_, k) => k === 12 ? 14190 : 14690 + (k % 2 ? 3 : -3));
  const quietMag = api.parseFmiMagnetometerWfs(mkMagXml(quietVals), 69.6492, 18.9553, nowMs);
  assert.ok(quietMag && quietMag.code === 'KIL' && quietMag.active === false && quietMag.groundSubstormJumpNt === 0,
    `Quiet 14690 nT baseline + single glitch must stay quiet, got ${JSON.stringify(quietMag)}`);

  // Real overhead westward auroral electrojet negative bay (-180 nT drop over 20 min at Kilpisjärvi, 2306 nT DC baseline)
  const bayVals = Array.from({ length: 24 }, (_, k) => k < 18 ? 2306 : Math.round(2306 - ((k - 17) / 6) * 180));
  const bayMag = api.parseFmiMagnetometerWfs(mkMagXml(bayVals), 69.6492, 18.9553, nowMs);
  assert.ok(bayMag && bayMag.code === 'KIL' && bayMag.active === true && bayMag.bayDropNt >= 150 && bayMag.groundSubstormJumpNt >= 30,
    `Real -180 nT overhead bay must activate substorm detector, got ${JSON.stringify(bayMag)}`);

  // Out-of-range (>600 km, e.g. Iceland) returns null
  assert.equal(api.parseFmiMagnetometerWfs(mkMagXml(bayVals), 64.1466, -21.9426, nowMs), null, 'Iceland >600km from FMI chain must return null');

  // (b) FMI Finnish Lapland n_man cloud parser (oktas 0..8, NaN rejection, nearest station)
  const fmiCloudXml = `<wfs:FeatureCollection>
    <wfs:member><BsWfs:BsWfsElement><BsWfs:Location><gml:Point><gml:pos>69.03905 20.81379 </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>${new Date(nowMs - 10 * 60000).toISOString()}</BsWfs:Time><BsWfs:ParameterName>n_man</BsWfs:ParameterName><BsWfs:ParameterValue>1.0</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>
    <wfs:member><BsWfs:BsWfsElement><BsWfs:Location><gml:Point><gml:pos>69.03905 20.81379 </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>${new Date(nowMs - 5 * 60000).toISOString()}</BsWfs:Time><BsWfs:ParameterName>n_man</BsWfs:ParameterName><BsWfs:ParameterValue>NaN</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>
  </wfs:FeatureCollection>`;
  const fmiObs = api.parseFmiCloudObs(fmiCloudXml, 69.045, 20.80, nowMs);
  assert.ok(fmiObs && fmiObs.source === 'FMI' && fmiObs.effCloud === 13 && fmiObs.clearPct === 87 && fmiObs.skyCode === 'FEW',
    `Kilpisjärvi 1 okta must yield 13% cloud / 87% clear while ignoring NaN, got ${JSON.stringify(fmiObs)}`);

  // (c) Inverse-Variance Bayesian Model Averaging (BMA) — Tromsø marine stratus miss vs Abisko blue hole
  // Live Tromsø case: MEPS missed 1,250m stratus (6%), ECMWF caught it (86%), ENTC METAR ground truth = 75%
  const wTromso = api.computeAdaptiveBmaWeight(6, 86, 75, 4, 10);
  assert.ok(wTromso >= 0.78 && wTromso <= 0.85, `Tromsø obs-verified ECMWF BMA weight must be ~0.82-0.85, got ${wTromso}`);
  // Abisko blue-hole case: MEPS caught clear sky (14%), coarse ECMWF smeared overcast (88%), SMHI obs = 10%
  const wAbisko = api.computeAdaptiveBmaWeight(14, 88, 10, 1, 10);
  assert.ok(wAbisko >= 0.15 && wAbisko <= 0.22, `Abisko obs-verified MEPS BMA weight must keep ECMWF low (~0.15-0.22), got ${wAbisko}`);
  // Agreeing models (<18 pts apart) return null (preserve prior)
  assert.equal(api.computeAdaptiveBmaWeight(40, 50, 45, 5, 10), null);

  // Verify BMA fixes Tromsø +0..2h false optimism in blendNordicHourlyForecasts while relaxing smoothly to 50/50 by +6h
  const baseStart = Date.UTC(2026, 10, 25, 21, 0, 0);
  const metMiss = Array.from({ length: 12 }, (_, i) => ({
    dtMs: baseStart + i * 3600000, time: `${String((22 + i) % 24).padStart(2, '0')}:00`,
    block: 6, clear: 94, temp: -1, windMs: 3, precip: 0, isDay: false, sunAlt: -20, txt: '🌟 晴'
  }));
  const omHit = metMiss.map(h => ({ ...h, block: 86, clear: 14 }));
  const bmaBlended = api.blendNordicHourlyForecasts(metMiss, omHit, { metarConfirmsEcmwf: true, bmaWeight2: wTromso });
  assert.ok(bmaBlended[0].block >= 68, `Tromsø +0h BMA block (${bmaBlended[0].block}%) must reflect ~75% stratus instead of 46% 50/50`);
  assert.ok(bmaBlended[2].block >= 55 && bmaBlended[2].block < bmaBlended[0].block, `Tromsø +2h BMA block (${bmaBlended[2].block}%) must relax smoothly`);
  assert.equal(bmaBlended[6].block, 46, '+6h relaxes cleanly back to 50/50 prior');

  // (d) Substorm phase classifier
  const pActive = api.computeSubstormPhase({ fmiMag: bayMag });
  assert.equal(pActive.phase, 'active');
  assert.equal(pActive.groundTriggered, true);
  const pLoad = api.computeSubstormPhase({ bal: { energy120: [42], avgNewell60: 3600 }, fmiMag: quietMag });
  assert.equal(pLoad.phase, 'loading');
  const pRec = api.computeSubstormPhase({ fmiMag: { ...quietMag, level: 'moderate', active: false }, kyotoDst: { dst: -55 } });
  assert.equal(pRec.phase, 'recovery');
  const pQuiet = api.computeSubstormPhase({ bal: { energy120: [5], avgNewell60: 400 }, fmiMag: quietMag });
  assert.equal(pQuiet.phase, 'quiet');

  // (e) Live smoke verification of opendata.fmi.fi WFS (Magnetometer + Lapland cloud n_man) when LIVE_TEST=1
  if (process.env.LIVE_TEST === '1') {
    const start180 = new Date(Date.now() - 180 * 60000).toISOString().slice(0, 19) + 'Z';
    const endNow = new Date().toISOString().slice(0, 19) + 'Z';
    const start35 = new Date(Date.now() - 35 * 60000).toISOString().slice(0, 19) + 'Z';
    const [magXml, cldXml] = await Promise.all([
      fetch(`https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::magnetometer::simple&starttime=${start180}&endtime=${endNow}&parameters=MAGNX_PT1M_AVG&timestep=5`).then(r => r.text()),
      fetch(`https://opendata.fmi.fi/wfs?service=WFS&version=2.0.0&request=getFeature&storedquery_id=fmi::observations::weather::simple&bbox=20,66,30,70&parameters=n_man&starttime=${start35}`).then(r => r.text())
    ]);
    const liveMag = api.parseFmiMagnetometerWfs(magXml, 69.6492, 18.9553, Date.now());
    assert.ok(liveMag && liveMag.code === 'KIL' && Number.isFinite(liveMag.amp60Nt), `Live FMI KIL magnetometer failed: ${JSON.stringify(liveMag)}`);
    const liveCld = api.parseFmiCloudObs(cldXml, 69.045, 20.80, Date.now());
    assert.ok(liveCld && liveCld.source === 'FMI' && liveCld.effCloud >= 0 && liveCld.effCloud <= 100, `Live FMI Kilpisjärvi cloud obs failed: ${JSON.stringify(liveCld)}`);
  }
});

test('57. v51 UX & Product Fixes: Layered Clouds, FMI Mag SVG, Iceland Cams, Region-Honest Trust Sheet & Bilingual Chips', async () => {
  const { SKY_CAMS, renderTrustStatGrid } = await import('../src/i18n.js');
  const { buildFmiMagChartSVG } = await import('../src/charts.js');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  // (a) Layered clouds preserved in both MET Norway and Open-Meteo hourly parsers
  const nowSec = Math.floor(Date.UTC(2026, 10, 25, 21, 0, 0) / 1000);
  const omPayload = {
    hourly: {
      time: [nowSec, nowSec + 3600],
      cloud_cover: [80, 60],
      cloud_cover_low: [15, 20],
      cloud_cover_mid: [30, 25],
      cloud_cover_high: [90, 70],
      temperature_2m: [-2, -3],
      wind_speed_10m: [4, 4],
      precipitation: [0, 0]
    }
  };
  const omHrs = api.parseOpenMeteoHourly12(omPayload.hourly, 69.65, 18.96, 'Europe/Oslo', new Date(nowSec * 1000 - 60000));
  assert.equal(omHrs[0].cloudLow, 15);
  assert.equal(omHrs[0].cloudMid, 30);
  assert.equal(omHrs[0].cloudHigh, 90);

  // (b) FMI Magnetometer parser exposes 3h despiked series & buildFmiMagChartSVG renders clean zero-dashed SVG
  const nowMs = Date.UTC(2026, 10, 26, 4, 30, 0);
  const bayVals = Array.from({ length: 24 }, (_, k) => k < 18 ? 2306 : Math.round(2306 - ((k - 17) / 6) * 180));
  const magXml = `<wfs:FeatureCollection>${bayVals.map((v, k) => {
    const t = new Date(nowMs - (bayVals.length - 1 - k) * 5 * 60000).toISOString().slice(0, 19) + 'Z';
    return `<wfs:member><BsWfs:BsWfsElement><BsWfs:Location><gml:Point><gml:pos>69.05800 20.77470 </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>${t}</BsWfs:Time><BsWfs:ParameterName>MAGNX_PT1M_AVG</BsWfs:ParameterName><BsWfs:ParameterValue>${v}</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>`;
  }).join('')}</wfs:FeatureCollection>`;
  const bayMag = api.parseFmiMagnetometerWfs(magXml, 69.6492, 18.9553, nowMs);
  assert.ok(Array.isArray(bayMag.series) && bayMag.series.length === 24, 'FMI mag parser must expose 3h series');
  const magSvg = buildFmiMagChartSVG(bayMag, 'Europe/Oslo', 'zh');
  assert.ok(magSvg.includes('<polyline') && magSvg.includes('0 nT') && !magSvg.includes('NaN'), 'FMI mag SVG must render valid waveform');
  assert.ok(!magSvg.includes('stroke-dasharray'), 'FMI mag SVG must avoid dashed lines');

  // (c) Official Iceland Vegagerðin cameras in SKY_CAMS + CSP img-src whitelist
  const icelandCams = Object.values(SKY_CAMS).filter(c => c.region === 'iceland');
  assert.equal(icelandCams.length, 3, 'Must include 3 official Iceland Vegagerðin cameras');
  assert.ok(icelandCams.every(c => c.url.startsWith('https://www.vegagerdin.is/')), 'Iceland cams must use official vegagerdin.is URLs');
  assert.ok(htmlSrc.includes('https://www.vegagerdin.is'), 'CSP img-src must whitelist vegagerdin.is');

  // (d) Region-honest Trust Sheet stat grid: FMI/Yr.no shown in Tromsø, hidden in Queenstown
  const fakeGrid = { innerHTML: '' };
  const fake$ = (id) => (id === 'tsStatGrid' ? fakeGrid : null);
  renderTrustStatGrid(fake$, { lat: 69.6492, lon: 18.9553 }, false);
  assert.ok(fakeGrid.innerHTML.includes('FMI') && fakeGrid.innerHTML.includes('Yr.no'), 'Tromsø Trust Sheet should show FMI & Yr.no');
  renderTrustStatGrid(fake$, { lat: -45.0312, lon: 168.6626 }, false);
  assert.ok(!fakeGrid.innerHTML.includes('FMI') && !fakeGrid.innerHTML.includes('Yr.no'), 'Queenstown Trust Sheet must NEVER claim Nordic FMI/Yr.no');
  renderTrustStatGrid(fake$, { lat: -45.0312, lon: 168.6626 }, true);
  assert.ok(!/[\u4e00-\u9fff]/.test(fakeGrid.innerHTML), 'EN Trust Sheet stat grid must have zero CJK');

  // (e) Zero dead open-meteo.com/en/docs links & default city is Tromsø
  assert.ok(!appSrc.includes('open-meteo.com/en/docs'), 'Must never link users to developer open-meteo.com/en/docs');
  assert.ok(appSrc.includes("name: '挪威 · Tromsø'") && htmlSrc.includes('>挪威 · Tromsø<'), 'Default city must be Tromsø');

  // (f) All 18 preset city chips carry bilingual data-lbl-zh & pure-English data-lbl-en
  const chipMatches = [...htmlSrc.matchAll(/<button[^>]*data-lbl-zh="([^"]+)"[^>]*data-lbl-en="([^"]+)"/g)];
  assert.equal(chipMatches.length, 18, `All 18 preset chips must carry bilingual labels, got ${chipMatches.length}`);
  assert.ok(chipMatches.every(([, , enLbl]) => !/[\u4e00-\u9fff]/.test(enLbl)), 'EN chip labels must have zero CJK');

  // (g) v52 Scrub-bar never displays unreadable wide X–Y score/cloud ranges, and 24h chart renders at most 1 range halo (selected bar only)
  assert.ok(!appSrc.includes('scoreLow}–${h.scoreHigh}') && !appSrc.includes('clearLow}%–${h.clearHigh}%'),
    'Scrub-bar must show single best-estimate point values + plain uncertainty tag instead of unreadable X–Y intervals');
  const mockTrendHrs = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((18 + i) % 24).padStart(2, '0')}:00`,
    isDay: false, outOfZone: false, clear: 55, block: 45, score: 48, scoreLow: 10, scoreHigh: 78
  }));
  const waveOnly1 = api.buildSkyWaveSVG(mockTrendHrs, mockTrendHrs[6], 6, 'zh');
  const haloCount = (waveOnly1.match(/data-role="score-range"/g) || []).length;
  assert.equal(haloCount, 1, `24h chart should show range halo ONLY on the selected Trend bar, got ${haloCount}`);
});

test('58. v53 Clear-Sky Navigation Safety: No Generic Drive Links, EXTENDED_CORRIDORS, Radar 60km Dedup & Stay-Local Guard', async () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  // (a) EXTENDED_CORRIDORS preserves legacy counts (10 Nordic + 8 Global) + adds 8 verified winter hubs (incl. Oslo) with >=0.30° separation
  assert.equal(api.NORDIC_CORRIDORS.length, 10);
  assert.equal(api.GLOBAL_CORRIDORS.length, 8);
  assert.equal(api.EXTENDED_CORRIDORS.length, 8);
  assert.equal(api.CHASE_CORRIDORS.length, 26);
  for (const c of api.EXTENDED_CORRIDORS) {
    assert.ok(c.pts.length >= 2 && c.pts.length <= 4, `Extended hub ${c.match} must have 2..4 routes`);
    const keys = new Set();
    for (const p of c.pts) {
      assert.ok(['N', 'E', 'S', 'W'].includes(p.key), `Invalid key ${p.key}`);
      assert.ok(!keys.has(p.key), `Duplicate key ${p.key}`);
      keys.add(p.key);
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.roadKm > 0 && p.isOcean === false);
      const shortName = p.label.replace(/^往[東西南北]+\s*/, '');
      assert.ok(shortName.length <= 13, `Radar pill name too long: ${shortName}`);
    }
  }
  for (let i = 0; i < api.CHASE_CORRIDORS.length; i++) {
    for (let j = i + 1; j < api.CHASE_CORRIDORS.length; j++) {
      const a = api.CHASE_CORRIDORS[i].match, b = api.CHASE_CORRIDORS[j].match;
      const d = Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180));
      assert.ok(d >= 0.30, `Hubs ${a} and ${b} overlap too closely (${d.toFixed(2)}°)`);
    }
  }
  // Svalbard MUST stay generic (never offer 60 km road driving in polar-bear backcountry)
  const svalPts = api.computeCompassPoints(78.2232, 15.6267, 60);
  assert.equal(svalPts[1].isGeneric, true);

  // (b) Radar SVG pill deduplicates "60km · 60km" on generic points
  const genDirs = svalPts.map((p, idx) => ({ ...p, avg3h: idx === 0 ? 80 : 20, nowC: 50, temp: -8, maxWind3h: 4, maxPrecip3h: 0 }));
  const radarZh = api.buildCompassRadarSVG(genDirs, { lat: 78.2232, lon: 15.6267 }, 'zh');
  const radarEn = api.buildCompassRadarSVG(genDirs, { lat: 78.2232, lon: 15.6267 }, 'en');
  assert.ok(!radarZh.includes('60km<tspan') && !radarEn.includes('60km<tspan'), 'Radar SVG must never render duplicate 60km · 60km');
  assert.ok(radarZh.includes('>北<tspan') && radarEn.includes('>N<tspan'), 'Generic radar pills must render clean 北 · 60km / N · 60km');

  // (c) summarizeCompass: 100% clear says 已晴空 / Already clear; generic best says 看區域 / View area without quoting distance
  const clearDirs = svalPts.map((p) => ({ ...p, avg3h: 0, nowC: 0, temp: -10, maxWind3h: 2, maxPrecip3h: 0 }));
  const sumClearZh = api.summarizeCompass(clearDirs, 'zh');
  const sumClearEn = api.summarizeCompass(clearDirs, 'en');
  assert.ok(sumClearZh.bestKey === 'here' && sumClearZh.text.includes('已晴空'));
  assert.ok(sumClearEn.bestKey === 'here' && sumClearEn.text.includes('Already clear'));
  const sumGenZh = api.summarizeCompass(genDirs, 'zh');
  const sumGenEn = api.summarizeCompass(genDirs, 'en');
  assert.ok(sumGenZh.text.includes('看區域') && !sumGenZh.text.includes('「往北 60 km」'));
  assert.ok(sumGenEn.text.includes('View area') && !sumGenEn.text.includes('"North 60 km"'));

  // (d) Hero CTA guards against bestKey === 'here' & generic panel uses area search instead of travelmode=driving
  assert.ok(appSrc.includes("compassSum.bestKey !== 'here'"), 'Hero CTA must never match dirResults[0] (here)');
  assert.ok(appSrc.includes('google.com/maps/search/?api=1&query='), 'Generic & stay-local compass cards must open area map search');
});

test('59. v54 Wave 1 Field-Reliability & Scientific-Accuracy Blitz', async () => {
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const dcSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'data-client.js'), 'utf8');
  const { SKY_CAMS } = await import('../src/i18n.js');

  // (a) SW v54+: protects /spots/ from poisoning root ./index.html + cache-first SWR for static assets
  const swVer = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer >= 54, `sw.js cache version must be >= 54, got ${swVer}`);
  assert.ok(swSrc.includes("url.pathname.includes('/spots/')"), 'sw.js must guard /spots/ routes from overwriting ./index.html');

  // (b) FMI magnetometer distance box (<=600 km) & sharp recovery guard
  assert.equal(api.isInFmiNordicBox(69.6492, 18.9553), true, 'Tromsø must be inside FMI Nordic box');
  assert.equal(api.isInFmiNordicBox(66.5039, 25.7294), true, 'Rovaniemi must be inside FMI Nordic box');
  assert.equal(api.isInFmiNordicBox(60.3913, 5.3221), false, 'Bergen (>600 km from FMI chain) must be outside FMI box');

  const nowMs = Date.UTC(2026, 10, 26, 4, 30, 0);
  // Sharp recovery: deep dip 25 min ago (-220 nT) followed by steep rebound back to -90 nT (+130 nT recovery)
  const recVals = [
    2300, 2300, 2300, 2300, 2300, 2300, 2300, 2300, 2300, 2300, 2300, 2300,
    2280, 2240, 2180, 2120, 2080, 2080, 2100, 2130, 2160, 2190, 2210, 2215
  ];
  const recXml = `<wfs:FeatureCollection>${recVals.map((v, k) => {
    const t = new Date(nowMs - (recVals.length - 1 - k) * 5 * 60000).toISOString().slice(0, 19) + 'Z';
    return `<wfs:member><BsWfs:BsWfsElement><BsWfs:Location><gml:Point><gml:pos>69.05800 20.77470 </gml:pos></gml:Point></BsWfs:Location><BsWfs:Time>${t}</BsWfs:Time><BsWfs:ParameterName>MAGNX_PT1M_AVG</BsWfs:ParameterName><BsWfs:ParameterValue>${v}</BsWfs:ParameterValue></BsWfs:BsWfsElement></wfs:member>`;
  }).join('')}</wfs:FeatureCollection>`;
  const recMag = api.parseFmiMagnetometerWfs(recXml, 69.6492, 18.9553, nowMs);
  assert.ok(recMag && recMag.active === false, `Sharp recovery phase must not stay active: ${JSON.stringify(recMag)}`);

  // (c) Thin-cirrus protection in assimilateLiveGpsNowcast (unlayered 95% total cloud must not crush clear cirrus hour[0])
  const cirrusHrs = [{
    dtMs: nowMs, block: 28, clear: 72, cloudLow: 5, cloudMid: 8, cloudHigh: 85, precip: 0, temp: -2, windMs: 3
  }, {
    dtMs: nowMs + 3600000, block: 28, clear: 72, cloudLow: 5, cloudMid: 8, cloudHigh: 85, precip: 0, temp: -2, windMs: 3
  }];
  const cirrusRes = api.assimilateLiveGpsNowcast(cirrusHrs, {
    omCurrent: { effCloud: 95, isFog: false, precip: 0 }, hasFreshMetar: false, usedMet: false
  });
  assert.equal(cirrusRes.hours[0].block, 28, `Thin cirrus hour[0] block (${cirrusRes.hours[0].block}%) must not be dragged up by unlayered total cloud`);
  const stratusRes = api.assimilateLiveGpsNowcast([{ ...cirrusHrs[0], cloudLow: 60, cloudHigh: 10 }, cirrusHrs[1]], {
    omCurrent: { effCloud: 95, isFog: false, precip: 0 }, hasFreshMetar: false, usedMet: false
  });
  assert.ok(stratusRes.hours[0].block >= 45, `Real low-cloud hour[0] (${stratusRes.hours[0].block}%) must still assimilate 15m GPS cloud`);

  // (d) FMI ground substorm wired into synthesizeTonightAction, shouldTriggerAuroraAlert & explainAuroraScore
  const fmiActive = { active: true, bayDropNt: 165, code: 'KIL', groundSubstormJumpNt: 45 };
  const fmiAlert = api.shouldTriggerAuroraAlert({
    sc: { total: 32, isTooBright: false, skyScore: 55, auroraScore: 45 },
    goesSub: null,
    fmiMag: fmiActive,
    scNext: null, bal: null
  });
  assert.equal(fmiAlert.fire, true, 'Active FMI substorm must trigger alert even without GOES substorm');
  assert.equal(fmiAlert.reason, 'substorm', 'FMI substorm alert must report substorm reason');
  const fmiAct = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96,
    sc: { total: 42, skyScore: 65, auroraScore: 60, isTooBright: false, grade: 'good', outOfZone: null },
    scNext: null, bal: null, goesSub: null, fmiMag: fmiActive,
    bestDark: null, dirResults: [], nights3: [], darkWin: { isDarkNow: true },
    kp: 3.0, mlt: 23.0, effMoonPct: 0, lang: 'en'
  });
  assert.equal(fmiAct.actionType, 'go', 'Active FMI substorm under usable sky must trigger go action');
  const fmiExp = api.explainAuroraScore({
    lat: 69.65, lon: 18.96, cloudNow: 20, sunAlt: -18, bz: -3, speed: 450, kp: 3,
    substormJumpNt: 45, substormSource: 'FMI', lang: 'en'
  });
  const fmiExpZh = api.explainAuroraScore({
    lat: 69.65, lon: 18.96, cloudNow: 20, sunAlt: -18, bz: -3, speed: 450, kp: 3,
    substormJumpNt: 45, substormSource: 'FMI', lang: 'zh'
  });
  assert.ok(fmiExp.bottleneck.detail.includes('FMI substorm'), `Expected FMI substorm in detail: ${fmiExp.bottleneck.detail}`);
  assert.ok(fmiExpZh.bottleneck.detail.includes('FMI 地磁爆發'), `Expected FMI 地磁爆發 in detail: ${fmiExpZh.bottleneck.detail}`);

  // (e) Compass SVG closed-road tag ONLY on explicit closedDirs (Akureyri S = yes, Vík S Atlantic = no)
  const vikPts = api.computeCompassPoints(63.4186, -19.0060, 60).map((p, i) => ({
    ...p, avg3h: i === 0 ? 80 : 25, nowC: 30, temp: -1, maxWind3h: 5, maxPrecip3h: 0
  }));
  const vikSvg = api.buildCompassRadarSVG(vikPts, { lat: 63.4186, lon: -19.0060 }, 'en');
  assert.ok(!vikSvg.includes('Closed in winter'), 'Vík South (open Atlantic) must never be labeled Closed in winter');
  const akuPts = api.computeCompassPoints(65.6835, -18.0878, 60).map((p, i) => ({
    ...p, avg3h: i === 0 ? 80 : 25, nowC: 30, temp: -4, maxWind3h: 4, maxPrecip3h: 0
  }));
  const akuSvg = api.buildCompassRadarSVG(akuPts, { lat: 65.6835, lon: -18.0878 }, 'en');
  assert.ok(akuSvg.includes('Closed in winter'), 'Akureyri South (F26 Highland track) must still display Closed in winter');

  // (f) summarizeEnergyTrend requires lastE >= 25 for good=true (no green badge when energy has faded to 12)
  const fadedEnergy = api.summarizeEnergyTrend([
    { bz: -8, speed: 550 }, { bz: -7, speed: 540 }, { bz: 2, speed: 350 }, { bz: 3, speed: 340 }
  ], 340, 'en');
  assert.equal(fadedEnergy.good, false, 'Faded northward Bz must not report good=true energy trend');

  // (g) Iceland 24/7 METAR stations, isRoadCam flag, single-attempt METAR guard, iOS input zoom fix, history.state & copy hygiene
  for (const icao of ['BIVM', 'BIHN', 'BIIS']) {
    assert.ok(api.METAR_STATIONS.some(s => s.icao === icao), `Missing Iceland METAR station ${icao}`);
  }
  assert.ok(SKY_CAMS.is_hel.isRoadCam && SKY_CAMS.is_vik.isRoadCam && SKY_CAMS.is_aku.isRoadCam, 'Iceland road cams must set isRoadCam: true');
  assert.ok(dcSrc.includes('let metarTried = false'), 'fetchGroundStation must guard against duplicate sequential METAR timeouts');
  assert.ok(appSrc.includes('history.replaceState(history.state'), 'syncBrowserUrl must preserve history.state');
  assert.ok(!appSrc.includes('虛線右側'), 'app.js must not reference obsolete 虛線右側 legend');
  assert.ok(cssSrc.includes('font-size: 1rem') && htmlSrc.includes('enterkeyhint="search"'), 'City search input must prevent iOS Safari forced zoom');
});

test('60. v55 Zero-Cold-Prompt Silent GPS Auto-Follow & Arctic Nearby-City Suggestion', () => {
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // (a) Never acts when permission is not granted (zero cold popups) or when URL has explicit ?lat=&lon=
  const tromsoGps = { lat: 69.6492, lon: 18.9553, mode: 'gps' };
  const abiskoCoords = { gpsLat: 68.3495, gpsLon: 18.8312 };
  assert.equal(api.evaluateSilentGpsDecision({ currentPos: tromsoGps, ...abiskoCoords, permissionState: 'prompt' }).action, 'ignore');
  assert.equal(api.evaluateSilentGpsDecision({ currentPos: tromsoGps, ...abiskoCoords, permissionState: 'denied' }).action, 'ignore');
  assert.equal(api.evaluateSilentGpsDecision({ currentPos: tromsoGps, ...abiskoCoords, permissionState: 'granted', hasUrlOverride: true }).action, 'ignore');

  // (b) Follow mode ('gps'): moved >=5 km inside aurora zone -> auto-switch; <5 km -> refresh-coords
  const movedRes = api.evaluateSilentGpsDecision({ currentPos: tromsoGps, ...abiskoCoords, permissionState: 'granted' });
  assert.equal(movedRes.action, 'auto-switch', `Expected auto-switch on 145 km road trip, got ${JSON.stringify(movedRes)}`);
  assert.ok(movedRes.distKm >= 130 && movedRes.distKm <= 160);
  const sameRes = api.evaluateSilentGpsDecision({ currentPos: tromsoGps, gpsLat: 69.655, gpsLon: 18.96, permissionState: 'granted' });
  assert.equal(sameRes.action, 'refresh-coords');

  // (c) Flying home to low latitude (Taipei 25°N) must NOT overwrite an Arctic cached GPS city into 0/99
  const homeRes = api.evaluateSilentGpsDecision({ currentPos: tromsoGps, gpsLat: 25.033, gpsLon: 121.565, permissionState: 'granted' });
  assert.equal(homeRes.action, 'ignore-low-lat');

  // (d) Manual mode: never hijacks screen; suggests switching only when physically in aurora zone (>=48°) and >=25 km away
  const manualReyk = { lat: 64.1466, lon: -21.9426, mode: 'manual' };
  const landedTromso = api.evaluateSilentGpsDecision({ currentPos: manualReyk, gpsLat: 69.6492, gpsLon: 18.9553, permissionState: 'granted' });
  assert.equal(landedTromso.action, 'suggest-nearby');
  const homeManual = api.evaluateSilentGpsDecision({ currentPos: manualReyk, gpsLat: 25.033, gpsLon: 121.565, permissionState: 'granted' });
  assert.equal(homeManual.action, 'ignore', 'Low-latitude manual visitor must never see a GPS switch suggestion');

  // (e) App & HTML & SW wiring guards
  const swVer = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer >= 55, `sw.js cache version must be >= 55, got ${swVer}`);
  assert.ok(htmlSrc.includes('id="gpsSuggestBanner"') && htmlSrc.includes('id="gpsSuggestBtn"'), 'index.html must include #gpsSuggestBanner inside #bannerSlot');
  assert.ok(appSrc.includes("navigator.permissions.query({ name: 'geolocation' })") && appSrc.includes("if (permState !== 'granted') return;"),
    'checkSilentGpsUpdate must strictly check permissions === granted before ever calling getCurrentPosition');
});

test('61. v56 Wave 2: Shareable PNG Forecast Card, Multi-City Trip Watchlist & 15 Live SEO Spot Pages', async () => {
  const { buildShareCardPayload } = await import('../src/share-card.js');
  const { loadWatchlist, toggleWatchlistCity, isCityInWatchlist, WATCHLIST_MAX } = await import('../src/storage.js');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const sitemap = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');

  // (a) Share card pure payload normalizer (ZH + EN, tomorrow-night honesty, clean filename & watermark)
  const cardZh = buildShareCardPayload({
    pos: { name: '挪威 · Tromsø', nameEn: 'Norway · Tromsø', lat: 69.6492, lon: 18.9553 },
    posName: '挪威 · Tromsø',
    sc: { total: 78, grade: 'prime', isTooBright: false },
    skyVal: '88%', skySub: '-4°C', aurVal: '活躍', aurSub: 'Kp 4.3', darkVal: '100%', darkSub: '全暗',
    heroCue: '現在適合出門，肉眼可見，朝頭頂與北方觀察',
    bestAurora: { time: '23:00', score: 82 }, bestIsNextNight: false,
    nights3: [{ dayLabel: '今晚', bestNightScore: 82, bestClearPct: 88, isBest: true }],
    localTimeStr: '21:30', lang: 'zh'
  });
  assert.equal(cardZh.total, 78);
  assert.equal(cardZh.tier, 'prime');
  assert.equal(cardZh.pillars.length, 3);
  assert.ok(cardZh.peakLine.includes('今晚最佳時段') && cardZh.fileName.startsWith('aurora-norway-troms'));
  assert.ok(cardZh.footerUrl.includes('peteryux.github.io/nordic-aurora-radar'));

  const cardEnNext = buildShareCardPayload({
    pos: { nameEn: 'Iceland · Vík' }, posName: 'Iceland · Vík',
    sc: { total: 45, grade: 'good' }, bestAurora: { time: '22:00', score: 52 }, bestIsNextNight: true, lang: 'en'
  });
  assert.equal(cardEnNext.tier, 'good');
  assert.ok(cardEnNext.peakLine.includes('Best in 24h'));

  // (b) Multi-City Trip Watchlist storage: pin, dedupe (<15 km), cap at 5, unpin, round-trip persistence
  const mem = new Map();
  const mockStore = {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k)
  };
  let wl = loadWatchlist(mockStore);
  assert.equal(wl.length, 0);
  const hubs = [
    { name: '挪威 · Tromsø', nameEn: 'Norway · Tromsø', lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' },
    { name: '瑞典 · Abisko', nameEn: 'Sweden · Abisko', lat: 68.3495, lon: 18.8312, tz: 'Europe/Stockholm' },
    { name: '挪威 · Lofoten', nameEn: 'Norway · Lofoten', lat: 68.2342, lon: 14.5683, tz: 'Europe/Oslo' },
    { name: '冰島 · Reykjavik', nameEn: 'Iceland · Reykjavik', lat: 64.1466, lon: -21.9426, tz: 'Atlantic/Reykjavik' },
    { name: '冰島 · Vík', nameEn: 'Iceland · Vík', lat: 63.4186, lon: -19.0060, tz: 'Atlantic/Reykjavik' }
  ];
  for (const h of hubs) {
    const r = toggleWatchlistCity(wl, h, mockStore);
    assert.equal(r.pinned, true);
    wl = r.list;
  }
  assert.equal(wl.length, WATCHLIST_MAX);
  assert.equal(isCityInWatchlist(wl, hubs[0]), true);
  // 6th distinct city blocked with full: true
  const fullRes = toggleWatchlistCity(wl, { name: '芬蘭 · Levi', nameEn: 'Finland · Levi', lat: 67.8040, lon: 24.8080, tz: 'Europe/Helsinki' }, mockStore);
  assert.equal(fullRes.full, true);
  assert.equal(fullRes.list.length, 5);
  // Unpin existing city (even with slight GPS offset <15 km)
  const unpinRes = toggleWatchlistCity(wl, { lat: 69.66, lon: 18.96 }, mockStore);
  assert.equal(unpinRes.pinned, false);
  assert.equal(loadWatchlist(mockStore).length, 4);

  // (c) All 15 live SEO spot pages generated with strict CSP, live hydrator, JSON-LD & sitemap registration
  const all15 = [
    'tromso', 'lofoten', 'alta', 'abisko', 'rovaniemi', 'reykjavik', 'akureyri',
    'fairbanks', 'yellowknife', 'queenstown', 'vik', 'levi', 'saariselka', 'anchorage', 'banff'
  ];
  for (const slug of all15) {
    const pHtml = fs.readFileSync(path.join(__dirname, '..', 'spots', slug, 'index.html'), 'utf8');
    assert.ok(sitemap.includes(`/spots/${slug}/`), `sitemap.xml missing /spots/${slug}/`);
    assert.ok(pHtml.includes('id="spotLiveBox"') && pHtml.includes('../../src/spot-live.js'), `spot ${slug} must include live hydrator`);
    assert.ok(pHtml.includes("script-src 'self'") && !pHtml.includes("script-src 'self' 'unsafe-inline'"), `spot ${slug} CSP must forbid unsafe-inline scripts`);
    assert.ok(!pHtml.includes('NaN') && !pHtml.includes('undefined'), `spot ${slug} has NaN/undefined`);
    const ld = pHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(ld && JSON.parse(ld[1])['@graph'].length >= 2, `spot ${slug} JSON-LD invalid`);
  }

  // (d) sw.js v56+ precaches ./src/share-card.js
  const swVer = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer >= 56 && swSrc.includes('./src/share-card.js'), 'sw.js v56 must precache ./src/share-card.js');
});

test('62. v57 Zero-Script Cookieless GoatCounter Analytics (Prod-Only Guard, Privacy Slug & Strict CSP)', async () => {
  const { GOATCOUNTER_ENDPOINT, shouldSendAnalytics, normalizeCitySlug, buildAnalyticsUrl } = await import('../src/analytics.js');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

  // (a) Production-only guard: fires ONLY on https://peteryux.github.io with !webdriver and not prerendering
  assert.equal(shouldSendAnalytics({
    location: { protocol: 'https:', hostname: 'peteryux.github.io' },
    navigator: { webdriver: false },
    document: { visibilityState: 'visible' }
  }), true);
  assert.equal(shouldSendAnalytics({
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    navigator: { webdriver: false },
    document: { visibilityState: 'visible' }
  }), false);
  assert.equal(shouldSendAnalytics({
    location: { protocol: 'https:', hostname: 'peteryux.github.io' },
    navigator: { webdriver: true },
    document: { visibilityState: 'visible' }
  }), false);
  assert.equal(shouldSendAnalytics({
    location: { protocol: 'https:', hostname: 'peteryux.github.io' },
    navigator: { webdriver: false },
    document: { visibilityState: 'prerender' }
  }), false);

  // (b) City slug normalizer strips accents/Nordic letters and never leaks raw GPS coordinates
  assert.equal(normalizeCitySlug({ nameEn: 'Norway · Tromsø' }), 'tromso');
  assert.equal(normalizeCitySlug({ nameEn: 'Iceland · Vík' }), 'vik');
  assert.equal(normalizeCitySlug({ nameEn: 'GPS (69.65, 18.96)' }), 'custom');
  assert.equal(normalizeCitySlug({ name: '69.65°N, 18.96°E' }), 'custom');

  // (c) Official GoatCounter /count beacon URL format
  const pvUrl = buildAnalyticsUrl({
    path: '/nordic-aurora-radar/spots/tromso/',
    title: 'Tromsø Aurora Forecast',
    referrer: 'https://www.google.com/',
    event: false,
    screenWidth: 390,
    rnd: 'abc12'
  });
  assert.ok(pvUrl.startsWith(`${GOATCOUNTER_ENDPOINT}?`), 'Must target nordicaurora.goatcounter.com/count');
  assert.ok(pvUrl.includes('p=%2Fspots%2Ftromso%2F') && pvUrl.includes('s=390') && pvUrl.includes('r=https%3A%2F%2Fwww.google.com%2F') && !pvUrl.includes('e=true'));
  const evUrl = buildAnalyticsUrl({ path: '/event/share-card', title: 'Share PNG Card', event: true, screenWidth: 390, rnd: 'xyz99' });
  assert.ok(evUrl.includes('p=%2Fevent%2Fshare-card') && evUrl.includes('e=true'));

  // (d) Strict zero-3rd-party-JS CSP + img-src allowlist on index.html & all 15 spot pages + sw.js precache
  assert.ok(htmlSrc.includes('https://nordicaurora.goatcounter.com'), 'index.html CSP img-src must allow nordicaurora.goatcounter.com');
  assert.ok(!htmlSrc.includes('gc.zgo.at'), 'Must NOT load external 3rd-party gc.zgo.at script');
  const vikHtml = fs.readFileSync(path.join(__dirname, '..', 'spots', 'vik', 'index.html'), 'utf8');
  assert.ok(vikHtml.includes('https://nordicaurora.goatcounter.com') && !vikHtml.includes('gc.zgo.at'));
  assert.ok(swSrc.includes('./src/analytics.js'), 'sw.js must precache ./src/analytics.js');
});

test('63. v58 576-Scenario Copy-Truth Matrix Audit & Sub-Auroral Clarity (Ask/Oslo, Edinburgh, Banff, Queenstown)', () => {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const cities = [
    ['Tromsø', 69.65, 18.96],
    ['Svalbard', 78.22, 15.63],
    ['Reykjavik', 64.15, -21.94],
    ['Ask/Oslo', 60.06, 11.04],
    ['Edinburgh', 55.95, -3.19],
    ['Banff', 51.18, -115.57],
    ['Queenstown', -45.03, 168.66],
    ['Taipei', 25.03, 121.56]
  ];
  for (const [name, lat, lon] of cities) {
    for (const kp of [0.7, 2.5, 4.0, 6.5]) {
      for (const cloud of [10, 50, 90]) {
        for (const sunAlt of [5, -6, -20]) {
          for (const lang of ['zh', 'en']) {
            const exp = api.explainAuroraScore({ lat, lon, cloudNow: cloud, sunAlt, kp, bz: -1, speed: 400, mlt: 22, effMoonPct: 20, lang });
            const hl = exp.bottleneck.headline;
            const dt = exp.bottleneck.detail;
            assert.ok(!(exp.breakdown.effKp >= exp.breakdown.neededKp && /仍有落差|below the Kp/.test(hl)),
              `Self-contradicting Kp copy for ${name} kp=${kp} ${lang}: ${hl}`);
            assert.ok(!/NaN|undefined|null/.test(hl + dt), `Invalid token in ${name}: ${hl}`);
            if (lang === 'zh') {
              assert.ok(!/數據|信息|屏幕|貼士|分佈|持平|天頂|後晚/.test(hl + dt), `ZH lint leak in ${name}: ${hl}`);
            }
            if (name === 'Queenstown' && lang === 'zh') {
              assert.ok(!/北方低空/.test(hl), `Queenstown must say 南方低空, got: ${hl}`);
            }
          }
        }
      }
    }
  }

  // scoreHourlyForecast12 exposes auroraScore, neededKp & magLat so 24h scrub-bar explains Ask/Oslo 24-pt clear nights
  const hrs = Array.from({ length: 6 }, (_, i) => ({
    dtMs: Date.UTC(2026, 10, 26, 17 + i, 0, 0),
    time: `${String(18 + i).padStart(2, '0')}:00`,
    block: 17, clear: 83, temp: -10, windChill: -13, windMs: 3, precip: 0
  }));
  const scored = api.scoreHourlyForecast12(hrs, {
    lat: 60.06, lon: 11.04, kp: 4.0, bz: 0, speed: 400, ovation: null,
    kpForecast: [{ ts: Date.UTC(2026, 10, 26, 18, 0, 0), kp: 4.0 }]
  });
  assert.ok(Number.isFinite(scored.hours[1].auroraScore) && scored.hours[1].auroraScore < 45);
  assert.ok(Number.isFinite(scored.hours[1].neededKp) && scored.hours[1].neededKp >= 3.0);
  assert.ok(Number.isFinite(scored.hours[1].magLat) && scored.hours[1].magLat <= 59);

  // Single-source-of-truth copy-formatters + Hero neededKp guard
  const fmtSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'copy-formatters.js'), 'utf8');
  assert.ok(fmtSrc.includes('晴朗但極光偏弱') && fmtSrc.includes('此地低空微弱，需'), 'copy-formatters must explain clear-sky weak-aurora hours');
  assert.ok(fmtSrc.includes('低月') && fmtSrc.includes('Low moon'), 'copy-formatters must clarify low-horizon bright moon');
  assert.ok(fmtSrc.includes('const showNeedKp =') && appSrc.includes('buildHeroViewModel') && appSrc.includes('formatHourScrubDetail'), 'Hero aurora pill must display neededKp via pure buildHeroViewModel and copy-formatters');
});

test('64. v59 Daylight Clear-Sky Honesty, Defensive Hidden Banners & Atomic SW Shell', () => {
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

  // (a) Already 98% clear in Ask daytime must NEVER say 有望見晴 / 有望放晴 / clearer skies
  const askDayClear = api.synthesizeTonightAction({
    lat: 60.06, lon: 11.04,
    sc: { total: 0, skyScore: 98, auroraScore: 10, darkScore: 0, isTooBright: true, outOfZone: null, grade: '☀️ 天色過亮' },
    bestDark: { time: '19:00', clear: 83, score: 24 },
    darkWin: { state: 'twilight-wait', nextDarkHM: '15:58', darkInMin: 152 },
    kp: 0.7, lang: 'zh'
  });
  assert.ok(askDayClear.lead.includes('今晚維持晴朗，極光偏弱'), `Expected honest clear+weak copy, got: ${askDayClear.lead}`);
  assert.ok(!askDayClear.lead.includes('有望見晴') && !askDayClear.lead.includes('有望放晴') && !askDayClear.lead.includes('分鐘 後'),
    `Bad daylight clear copy/spacing: ${askDayClear.lead}`);

  // (b) Already 95% clear in Tromsø daytime with good night ahead says 維持晴朗 (not 有望放晴)
  const troDayClear = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96,
    sc: { total: 0, skyScore: 95, auroraScore: 55, darkScore: 0, isTooBright: true, outOfZone: null, grade: '☀️ 天色過亮' },
    bestDark: { time: '19:00', clear: 88, score: 72 },
    darkWin: { state: 'twilight-wait', nextDarkHM: '14:30', darkInMin: 90 },
    kp: 3.5, lang: 'zh'
  });
  assert.ok(troDayClear.lead.includes('今晚預估維持晴朗'), `Expected 維持晴朗, got: ${troDayClear.lead}`);

  // (c) Currently overcast (skyScore 15%) clearing to 80% tonight SHOULD say 有望放晴 / clearer skies
  const overcastClearingZh = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96,
    sc: { total: 0, skyScore: 15, auroraScore: 45, darkScore: 0, isTooBright: true, outOfZone: null, grade: '☀️ 天色過亮' },
    bestDark: { time: '21:00', clear: 80, score: 65 },
    darkWin: { state: 'twilight-wait', nextDarkHM: '15:00', darkInMin: 120 },
    kp: 3.0, lang: 'zh'
  });
  assert.ok(overcastClearingZh.lead.includes('今晚有望放晴'), `Expected 有望放晴 when currently cloudy, got: ${overcastClearingZh.lead}`);

  // (d) All 4 hidden banners in index.html carry inline style="display:none;" defense-in-depth
  for (const id of ['offlineBanner', 'stormBanner', 'lineTip', 'gpsSuggestBanner']) {
    const m = htmlSrc.match(new RegExp(`id="${id}"[^>]*>`));
    assert.ok(m && m[0].includes('display:none'), `Banner #${id} must carry inline style="display:none;"`);
  }

  // (e) Atomic SW serves root ./index.html from versioned CACHE_NAME + app.js listens to controllerchange
  assert.ok(/aurora-radar-shell-v\d+/.test(swSrc) && swSrc.includes("caches.open(CACHE_NAME).then(cache =>\n        cache.match('./index.html')"),
    'sw.js must serve atomic versioned ./index.html from CACHE_NAME to prevent HTML/CSS version skew');
  assert.ok(appSrc.includes("addEventListener('controllerchange'"), 'app.js must reload once on atomic SW controllerchange');
});

test('65. v60 Trust Sheet Storm Detail Card (#tsStormNote) & Pure Hero ViewModel Convergence', async () => {
  const { formatStormAlertDetail, buildHeroViewModel } = await import('../src/copy-formatters.js');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

  assert.ok(htmlSrc.includes('id="tsStormNote"') && htmlSrc.includes('class="ts-storm-note"'), 'index.html must mount #tsStormNote inside #trustSheet');
  assert.ok(appSrc.includes('formatStormAlertDetail') && appSrc.includes("const sn = $('tsStormNote')"), 'app.js must render #tsStormNote via formatStormAlertDetail');
  assert.ok(/aurora-radar-shell-v\d+/.test(swSrc), 'sw.js CACHE_NAME must be versioned');

  const askSc = api.computeAuroraScore({ lat: 60.06, lon: 11.04, cloudNow: 2, sunAlt: 3, kp: 0.7, ovation: 5, hpiGw: 10 });
  const g1Zh = formatStormAlertDetail({
    scales: { active: true, currentScale: 0, maxForecastScale: 1, peakDate: '2026-11-26' },
    sc: askSc, lat: 60.06, en: false, fmtDateFn: () => '11月26日'
  });
  assert.ok(g1Zh && g1Zh.title.includes('11月26日') && g1Zh.title.includes('G1'), `Expected dated G1 watch title, got: ${g1Zh?.title}`);
  assert.ok(g1Zh.body.includes('Kp 5') && g1Zh.body.includes('北方'), `Expected Kp 5 + north impact note, got: ${g1Zh.body}`);
  assert.equal(g1Zh.linkUrl, 'https://www.spaceweather.gov/products/alerts-watches-and-warnings');

  const qSc = api.computeAuroraScore({ lat: -45.0312, lon: 168.6626, cloudNow: 10, sunAlt: -20, kp: 2.0, ovation: 10, hpiGw: 20 });
  const g3SouthEn = formatStormAlertDetail({
    scales: null, noaaAlert: { active: true, kind: 'geomag', gScale: 3, isWarning: false },
    sc: qSc, lat: -45.0312, en: true
  });
  assert.ok(g3SouthEn && g3SouthEn.title.includes('G3') && g3SouthEn.body.includes('southern') && !g3SouthEn.body.includes('northern'),
    `Southern Hemisphere G3 detail must point south: ${g3SouthEn?.body}`);

  assert.equal(formatStormAlertDetail({ scales: { active: false }, noaaAlert: { active: false } }), null);

  const vm = buildHeroViewModel({
    pos: { lat: 60.06, lon: 11.04 }, sc: askSc, kp: 0.7,
    act: { actionType: 'daylight', title: 't', lead: '今晚維持晴朗，極光偏弱' }, en: false
  });
  assert.ok(vm.aurSubHtml.includes('Kp 0.7') && vm.aurSubHtml.includes('需 '), `Ask Hero aurSubHtml must show Kp 0.7 + needed threshold: ${vm.aurSubHtml}`);
  assert.equal(vm.heroCue, '今晚維持晴朗，極光偏弱');
});

test('66. v61 System-Level Cross-Card Consistency (Quiet-Aurora Drive Gate, 24h<->3-Night Identity, Twilight Honesty & Safe Compass)', async () => {
  const { formatDarkCountdownSub, formatHourScrubDetail, resolveStormEvent } = await import('../src/copy-formatters.js');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

  assert.ok(/aurora-radar-shell-v\d+/.test(swSrc), 'sw.js CACHE_NAME must be versioned');
  assert.ok(!htmlSrc.includes('<div class="od-day">今晚</div>'), 'Loading skeleton must not flash hardcoded Chinese weekday in EN');
  assert.ok(appSrc.includes('resolveStormEvent') && appSrc.includes('allCloudyNearby'), 'app.js must use shared resolveStormEvent and demote all-cloudy corridors');

  // Quiet aurora in Tromsø (auroraScore 15 < skyScore 28) -> grade is Low Activity, NOT Cloudy, and NEVER recommends DRIVE 70 km!
  const troQuiet = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 72, sunAlt: -5.6, kp: 0.3, bz: 0.5, speed: 320, ovation: 6, hpiGw: 15 });
  assert.equal(api.tGrade(troQuiet.grade, 'zh'), '極光偏弱');
  assert.equal(api.tGrade(troQuiet.grade, 'en'), 'Low activity');
  const dirs = [
    { key: 'here', label: '原地', avg3h: 72, nowC: 72, isOcean: false },
    { key: 'S', label: '往南 Balsfjord', avg3h: 14, nowC: 15, roadKm: 70, temp: -6, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const actQuiet = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96, sc: troQuiet, dirResults: dirs, kp: 0.3,
    bestDark: { time: '00:00', clear: 59, score: 46 }, lang: 'zh'
  });
  assert.notEqual(actQuiet.actionType, 'drive', 'Must NEVER recommend driving 70 km when aurora is quiet (15/100)');
  assert.equal(actQuiet.auroraWorthDriving, false);

  // Active aurora in Tromsø with exact diff math (86% - 28% = 58%, never 57%)
  const troActive = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 72, sunAlt: -18, kp: 4.0, bz: -6, speed: 500, ovation: 55, hpiGw: 65 });
  const actDrive = api.synthesizeTonightAction({ lat: 69.65, lon: 18.96, sc: troActive, dirResults: dirs, kp: 4.0, lang: 'zh' });
  assert.equal(actDrive.actionType, 'drive');
  assert.ok(actDrive.lead.includes('比原地高 58%'), `Drive lead diff must match 86% - 28% = 58%, got: ${actDrive.lead}`);

  // Descending twilight 49% dark -> 暮光轉暗中 / Darkening (never 09:15 天亮)
  const darkSubZh = formatDarkCountdownSub({ darkWin: { state: 'dark', darkEndHM: '09:15' }, moon: { up: false }, en: false, sunAltNow: -5.6, sunAltNext30: -8.0, darkScore: 49 });
  assert.ok(darkSubZh.includes('暮光轉暗中') && !darkSubZh.includes('天亮'), `Unexpected evening twilight sub: ${darkSubZh}`);

  // 1-decimal Trend Kp parity (3.67 -> 約 Kp 3.7, matching Tonight 3-Night Kp 3.7)
  const det = formatHourScrubDetail({ h: { clear: 78, score: 23, kpFc: 3.67, isDay: false, darkScore: 94 }, idx: 6, tStr: '19:00', tierWord: '普通', en: false });
  assert.ok(det.kpBadge.includes('約 Kp 3.7'), `Expected 1-decimal Kp 3.7 parity, got: ${det.kpBadge}`);

  assert.equal(resolveStormEvent({ scales: { active: false }, noaaAlert: { active: false } }), null);
});

test('67. v62 Urban Skyglow Hybrid (Additive Luminance, Azimuthal Dome, Zero Fake Bortle, Honest Astro Dark & Oslo Corridors)', async () => {
  const { formatLightPollutionNote, buildHeroViewModel } = await import('../src/copy-formatters.js');
  const { TERMS } = await import('../src/glossary.js');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

  assert.ok(/aurora-radar-shell-v\d+/.test(swSrc), 'sw.js CACHE_NAME must be versioned');
  assert.ok(htmlSrc.includes('id="tsLightNote"'), 'index.html must mount #tsLightNote inside #trustSheet');
  assert.equal(TERMS.darkFull.zh, '天文暗空');
  assert.equal(TERMS.darkFull.en, 'Astro dark');

  // (a) Azimuthal dome asymmetry: Kolbotn (11km south of Oslo looking NORTH through Oslo) vs Maridalen (11km north of Oslo)
  const osloGeom = api.computeViewingGeometry({ lat: 59.91, lon: 10.75, kp: 5.0, mlt: 23, lang: 'zh' });
  const kolbotn = api.estimateUrbanSkyglow({ lat: 59.81, lon: 10.80, geom: osloGeom, auroraScore: 55, effMoonPct: 0, lang: 'zh' });
  const maridalen = api.estimateUrbanSkyglow({ lat: 60.01, lon: 10.77, geom: osloGeom, auroraScore: 55, effMoonPct: 0, lang: 'zh' });
  assert.equal(kolbotn.domeImpact, 'blocking-horizon', `South of Oslo must detect blocking-horizon dome, got ${kolbotn.domeImpact}`);
  assert.equal(maridalen.domeImpact, 'behind', `North of Oslo must detect city dome behind observer, got ${maridalen.domeImpact}`);
  assert.ok(kolbotn.effectiveL > maridalen.effectiveL * 2, `Looking through Oslo dome (${kolbotn.effectiveL}) must vastly exceed looking away (${maridalen.effectiveL})`);

  // (b) Additive luminance: full moon reduces marginal city extraMagLoss (zero multiplicative double-counting)
  const osloMoonless = api.estimateUrbanSkyglow({ lat: 59.9127, lon: 10.7461, geom: osloGeom, auroraScore: 55, effMoonPct: 0, lang: 'en' });
  const osloFullMoon = api.estimateUrbanSkyglow({ lat: 59.9127, lon: 10.7461, geom: osloGeom, auroraScore: 55, effMoonPct: 100, lang: 'en' });
  assert.equal(osloMoonless.level, 'strong');
  assert.ok(osloFullMoon.extraMagLoss < osloMoonless.extraMagLoss, `Additive luminance must yield smaller extraMagLoss under full moon (${osloFullMoon.extraMagLoss} < ${osloMoonless.extraMagLoss})`);

  // (c) Unmapped coordinates: strictly unknown (never claims dark sky / Bortle 2!)
  const unmapped = api.estimateUrbanSkyglow({ lat: 61.50, lon: 8.50, geom: osloGeom, auroraScore: 40, effMoonPct: 0, lang: 'zh' });
  assert.equal(unmapped.level, 'unknown');
  assert.equal(unmapped.knownDark, false);
  const unmappedNote = formatLightPollutionNote({ urbanGlare: unmapped, pos: { mode: 'manual' }, sc: {}, en: false });
  assert.ok(unmappedNote.text.includes('未扣除') && !/Bortle/i.test(unmappedNote.text));

  // (d) Hero viewing geometry fix: sub-auroral Oslo mid-elevation evening must say 北方低空, NEVER 朝頭頂
  const osloSc = api.computeAuroraScore({ lat: 59.9127, lon: 10.7461, cloudNow: 5, sunAlt: -20, kp: 4.0, bz: -4, speed: 440, ovation: 42, hpiGw: 48, mlt: 19 });
  const osloVmZh = buildHeroViewModel({ pos: { lat: 59.9127, lon: 10.7461 }, sc: osloSc, kp: 4.0, mltNow: 19, act: { actionType: 'go', title: 'go' }, en: false });
  assert.ok(!osloVmZh.heroCue.includes('頭頂') && osloVmZh.heroCue.includes('北方低空'), `Sub-auroral Oslo mid-elevation must point to northern low horizon, not overhead: "${osloVmZh.heroCue}"`);

  // (e) Oslo curated northern dark-sky corridors present
  const osloCorridor = api.EXTENDED_CORRIDORS.find(c => Math.abs(c.match[0] - 59.91) < 0.1 && Math.abs(c.match[1] - 10.75) < 0.1);
  assert.ok(osloCorridor && osloCorridor.pts.some(p => p.label.includes('Maridalen')), 'Oslo must have curated northern dark-sky corridors');
});

test('68. v63 Compass × Azimuthal Light-Dome Integration (<=12% Tie-Breaker, Second-City Ambush Guard, Clear-Night Metro Escape & SSoT)', () => {
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  assert.ok(/aurora-radar-shell-v\d+/.test(swSrc), 'sw.js CACHE_NAME must be versioned');
  assert.ok(appSrc.includes('st.compassOpts = compassOpts') && appSrc.includes('compassOpts') && appSrc.includes('glareEscapeKey'),
    'app.js must share one compassOpts across synthesizeTonightAction, vActionBtn, renderWaveCard, and renderCompassPanel');

  // (a) Second-city ambush: Edinburgh -> West 60 km hits Glasgow light dome!
  const ediGeom = api.computeViewingGeometry({ lat: 55.9533, lon: -3.1883, kp: 5.0, mlt: 23, lang: 'zh' });
  const ediGlare = api.estimateUrbanSkyglow({ lat: 55.9533, lon: -3.1883, geom: ediGeom, auroraScore: 55, effMoonPct: 0, lang: 'zh' });
  const glasgowHit = api.evaluateCorridorSkyglow({
    dir: { key: 'W', label: '往西 60km', lat: 55.87, lon: -4.15, avg3h: 20, isGeneric: true },
    originGlare: ediGlare, geom: ediGeom, auroraScore: 55, effMoonPct: 0, lang: 'zh'
  });
  assert.equal(glasgowHit.status, 'other-city', `Edinburgh->West hitting Glasgow must trigger other-city warning, got ${JSON.stringify(glasgowHit)}`);
  assert.equal(glasgowHit.isWarning, true);
  assert.ok(glasgowHit.tagText.includes('格拉斯哥'), `Expected Glasgow warning tag, got "${glasgowHit.tagText}"`);

  // (b) Oslo cloudy <= 12% cloud-margin tie-breaker vs > 12% clouds-always-win
  const osloGeom = api.computeViewingGeometry({ lat: 59.9127, lon: 10.7461, kp: 4.5, mlt: 21, lang: 'zh' });
  const osloGlare = api.estimateUrbanSkyglow({ lat: 59.9127, lon: 10.7461, geom: osloGeom, auroraScore: 55, effMoonPct: 0, lang: 'zh' });
  const optsCloudy = { originGlare: osloGlare, geom: osloGeom, auroraWorthViewing: true, isTooBright: false, outOfZone: false, auroraScore: 55, effMoonPct: 0 };

  const tieDirs = [
    { key: 'here', label: '原地', avg3h: 82, nowC: 85, isOcean: false },
    { key: 'S', label: '往南 Kolbotn', lat: 59.81, lon: 10.80, roadKm: 16, avg3h: 20, nowC: 20, temp: -2, maxWind3h: 3, maxPrecip3h: 0, isOcean: false },
    { key: 'N', label: '往北 Maridalen', lat: 60.01, lon: 10.77, roadKm: 12, avg3h: 28, nowC: 28, temp: -2, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const tieSum = api.summarizeCompass(tieDirs, 'zh', optsCloudy);
  assert.equal(tieSum.bestKey, 'N', `Within 8% cloud margin (<=12%), Maridalen (behind dome) must beat Kolbotn (blocking dome), got ${tieSum.bestKey}`);
  assert.equal(tieSum.glareByKey.N.status, 'behind');
  assert.equal(tieSum.glareByKey.S.status, 'blocking');

  // Verify synthesizeTonightAction receives identical bestKey via compassOpts (Single Source of Truth)
  const osloCloudySc = api.computeAuroraScore({ lat: 59.9127, lon: 10.7461, cloudNow: 82, sunAlt: -20, kp: 4.5, bz: -5, speed: 480, ovation: 48, hpiGw: 55, mlt: 21 });
  const actTie = api.synthesizeTonightAction({
    lat: 59.9127, lon: 10.7461, sc: osloCloudySc, dirResults: tieDirs, kp: 4.5, mlt: 21, compassOpts: optsCloudy, lang: 'zh'
  });
  assert.equal(actTie.actionType, 'drive');
  assert.ok(actTie.lead.includes('Maridalen'), `synthesizeTonightAction must share the exact same tie-broken winner (Maridalen), got "${actTie.lead}"`);

  // Beyond 12% cloud margin (17% difference): clouds ALWAYS win, with honest glare warning
  const wideDirs = [
    { key: 'here', label: '原地', avg3h: 82, nowC: 85, isOcean: false },
    { key: 'S', label: '往南 Kolbotn', lat: 59.81, lon: 10.80, roadKm: 16, avg3h: 15, nowC: 15, temp: -2, maxWind3h: 3, maxPrecip3h: 0, isOcean: false },
    { key: 'N', label: '往北 Maridalen', lat: 60.01, lon: 10.77, roadKm: 12, avg3h: 32, nowC: 32, temp: -2, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const wideSum = api.summarizeCompass(wideDirs, 'zh', optsCloudy);
  assert.equal(wideSum.bestKey, 'S', `Beyond 12% cloud margin, clearer sky must still win (clouds > glare), got ${wideSum.bestKey}`);
  assert.ok(wideSum.text.includes('光害'), `Winner facing city glare must include honest glare note, got "${wideSum.text}"`);

  // (c) Clear-night Oslo: NEVER mutates bestKey away from 'here'; activates glareEscapeKey only when auroraWorthViewing=true
  const clearDirs = [
    { key: 'here', label: '原地', avg3h: 5, nowC: 5, isOcean: false },
    { key: 'N', label: '往北 Maridalen', lat: 60.01, lon: 10.77, roadKm: 12, avg3h: 5, nowC: 5, temp: -2, maxWind3h: 2, maxPrecip3h: 0, isOcean: false },
    { key: 'NE', label: '往東北 Nittedal', lat: 60.06, lon: 10.87, roadKm: 22, avg3h: 5, nowC: 5, temp: -2, maxWind3h: 2, maxPrecip3h: 0, isOcean: false }
  ];
  const clearActive = api.summarizeCompass(clearDirs, 'zh', optsCloudy);
  assert.equal(clearActive.bestKey, 'here', 'Clear night must NEVER mutate bestKey away from here');
  assert.equal(clearActive.glareEscapeActive, true);
  assert.equal(clearActive.glareEscapeKey, 'N', `Clear active Oslo night should suggest Maridalen (12km) as calm glareEscapeKey, got ${clearActive.glareEscapeKey}`);
  assert.ok(clearActive.text.includes('Maridalen') && clearActive.text.includes('市區光害'));

  const clearQuiet = api.summarizeCompass(clearDirs, 'zh', { ...optsCloudy, auroraWorthViewing: false });
  assert.equal(clearQuiet.bestKey, 'here');
  assert.equal(clearQuiet.glareEscapeActive, false);
  assert.equal(clearQuiet.glareEscapeKey, null, 'Quiet aurora night must stay calm with no glareEscapeKey');
});

test('69. v64 All-4-Auditors Sign-Off (Nightside Storm Parity, Clear-Now/Storm-Later, Svalbard Guard, Suburb GPS, Beginner Clarity & Physics Edge Cases)', async () => {
  const { formatStormAlertDetail, buildHeroViewModel, formatLightPollutionNote, formatOutlookRowStats } = await import('../src/copy-formatters.js');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const swVer69 = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer69 >= 64, `sw.js CACHE_NAME must be >= v64, got v${swVer69}`);
  assert.ok(cssSrc.includes('.dir-note { display: block;') && cssSrc.includes('.dir-tip { display: block;'), '.dir-note and .dir-tip must be block-level to prevent glued tags');

  // (a) Oslo G1 Watch: noon vs evening produces identical stable nightside Kp baseline (never flips to 5.3 / too weak!)
  const osloNoonSc = api.computeAuroraScore({ lat: 59.9127, lon: 10.7461, cloudNow: 10, sunAlt: 8, kp: 1.5, mlt: 13 });
  const osloNightSc = api.computeAuroraScore({ lat: 59.9127, lon: 10.7461, cloudNow: 10, sunAlt: -20, kp: 1.5, mlt: 22 });
  const g1Scales = { active: true, currentScale: 0, maxForecastScale: 1, peakDate: '2026-11-26' };
  const stormNoon = formatStormAlertDetail({ scales: g1Scales, sc: osloNoonSc, lat: 59.9127, lon: 10.7461, en: false });
  const stormNight = formatStormAlertDetail({ scales: g1Scales, sc: osloNightSc, lat: 59.9127, lon: 10.7461, en: false });
  assert.equal(stormNoon.body, stormNight.body, 'Daytime and nighttime G1 Watch explanation must agree 100%');
  assert.ok(!stormNoon.body.includes('通常仍不足') && stormNoon.body.includes('北方低空'), `Oslo G1 watch must describe northern low-horizon chance, got "${stormNoon.body}"`);

  // (b) Clear & Quiet NOW + Storm Later Tonight: NEVER emits sleep / "Low chance tonight"
  const clearQuietNow = api.computeAuroraScore({ lat: 69.65, lon: 18.96, cloudNow: 8, sunAlt: -20, kp: 0.3, bz: 1, speed: 320, ovation: 5, hpiGw: 10 });
  const actWait = api.synthesizeTonightAction({
    lat: 69.65, lon: 18.96, sc: clearQuietNow,
    bestDark: { time: '01:00', clear: 85, score: 65 },
    nights3: [{ dayLabel: '今晚', bestNightScore: 65, tone: 'good' }, { dayLabel: '明晚', bestNightScore: 32, tone: 'warn' }],
    kp: 0.3, lang: 'zh'
  });
  assert.equal(actWait.actionType, 'wait', `Clear quiet now with 65-pt peak later tonight must be wait, got ${actWait.actionType}`);
  assert.ok(actWait.title.includes('01:00'), `Title must point to tonight's peak time 01:00, got "${actWait.title}"`);
  const vmSleepGuard = buildHeroViewModel({
    pos: { lat: 69.65, lon: 18.96 }, sc: clearQuietNow, kp: 0.3,
    act: { actionType: 'sleep' },
    localizedNights3: [{ dayLabel: '今晚', bestNightScore: 65, tone: 'good' }, { dayLabel: '明晚', bestNightScore: 32, tone: 'warn' }],
    en: false
  });
  assert.ok(!vmSleepGuard.heroCue.includes('明晚'), `Hero must NEVER recommend weaker 明晚 when Tonight is 65, got "${vmSleepGuard.heroCue}"`);

  // (c) Svalbard roadless Arctic polar-bear guard: NEVER says 開車 or drive
  assert.equal(api.isRoadlessArctic(78.2232, 15.6267), true);
  const svActive = api.computeAuroraScore({ lat: 78.2232, lon: 15.6267, cloudNow: 85, sunAlt: -20, kp: 3.5, bz: -5, speed: 480, ovation: 50, hpiGw: 55 });
  const svDirs = [
    { key: 'here', label: '原地', avg3h: 85, nowC: 85, isOcean: false },
    { key: 'N', label: '往北 60 km', lat: 78.76, lon: 15.63, avg3h: 10, nowC: 10, temp: -12, maxWind3h: 4, maxPrecip3h: 0, isOcean: false, isGeneric: true }
  ];
  const svActZh = api.synthesizeTonightAction({ lat: 78.2232, lon: 15.6267, sc: svActive, dirResults: svDirs, kp: 3.5, lang: 'zh' });
  const svActEn = api.synthesizeTonightAction({ lat: 78.2232, lon: 15.6267, sc: svActive, dirResults: svDirs, kp: 3.5, lang: 'en' });
  assert.ok(!svActZh.title.includes('開車') && svActZh.lead.includes('北極熊'), `Svalbard must warn about roadless polar-bear zone, got "${svActZh.title} / ${svActZh.lead}"`);
  assert.ok(!/\bdrive\b/i.test(svActEn.title) && svActEn.lead.includes('Svalbard'), `Svalbard EN must not tell users to drive, got "${svActEn.title}"`);

  // (d) Suburb GPS self-skip & honest bearing relabeling + Hobart duplicate cardinal fix
  const atMaridalen = api.computeCompassPoints(60.005, 10.768);
  assert.ok(!atMaridalen.slice(1).some(p => p.label.includes('Maridalen')), 'Standing at Maridalen must skip 0 km Maridalen');
  const atAsk = api.computeCompassPoints(60.064, 11.036);
  const marFromAsk = atAsk.find(p => p.label.includes('Maridalen'));
  assert.ok(marFromAsk && !marFromAsk.label.startsWith('往北'), `From Ask, Maridalen is WSW (not North), got "${marFromAsk?.label}"`);
  assert.equal(api.tDirLabel('往南 South Arm', 'en'), 'S · South Arm', 'Hobart South Arm must not duplicate South');

  // (e) Knife-edge peakL cliff eliminated + full-moon additive dilution + coastal ocean guard
  const hobart500m = api.estimateUrbanSkyglow({ lat: -42.8866, lon: 147.3272, auroraScore: 50, effMoonPct: 0, lang: 'zh' });
  assert.equal(hobart500m.level, 'strong', 'Hobart 500m from center must stay strong (no peakL=10 cliff)');
  const reyk500m = api.estimateUrbanSkyglow({ lat: 64.1510, lon: -21.9426, auroraScore: 50, effMoonPct: 0, lang: 'zh' });
  assert.equal(reyk500m.level, 'strong', 'Reykjavik 500m from center must stay strong');
  const bergenFullMoon = api.estimateUrbanSkyglow({ lat: 60.3913, lon: 5.3221, auroraScore: 45, effMoonPct: 100, lang: 'zh' });
  assert.equal(bergenFullMoon.level, 'moderate', 'Bright full moon must dilute moderate-peak city glare via effectiveMagLoss');

  const melbGlare = api.estimateUrbanSkyglow({ lat: -37.8136, lon: 144.9631, auroraScore: 50, effMoonPct: 0, lang: 'zh' });
  const melbClear = api.summarizeCompass([
    { key: 'here', label: '原地', avg3h: 5, nowC: 5, isOcean: false },
    { key: 'S', label: '往南 60 km', lat: -38.35, lon: 144.96, avg3h: 5, nowC: 5, isOcean: true, isGeneric: true },
    { key: 'N', label: '往北 60 km', lat: -37.27, lon: 144.96, avg3h: 5, nowC: 5, isOcean: false, isGeneric: true }
  ], 'zh', { originGlare: melbGlare, auroraWorthViewing: true, isTooBright: false, outOfZone: false, auroraScore: 50, effMoonPct: 0 });
  assert.ok(!melbClear.text.includes('移往南側'), `Melbourne with Open Sea south must NOT tell users to move south into ocean: "${melbClear.text}"`);

  // (f) Beginner clarity: 18-39 Fair tier shows direction + Night Mode tip, zero 光穹, zero 北方側, McMurdo XOR, 極光強時晴空
  const fairSc = api.computeAuroraScore({ lat: 59.9127, lon: 10.7461, cloudNow: 10, sunAlt: -20, kp: 3.0, bz: -2, speed: 400, ovation: 20, hpiGw: 25, mlt: 23 });
  assert.ok(fairSc.total >= 18 && fairSc.total < 40, `Expected Fair tier 18-39, got ${fairSc.total}`);
  const fairVmZh = buildHeroViewModel({ pos: { lat: 59.9127, lon: 10.7461 }, sc: fairSc, kp: 3.0, mltNow: 23, act: { actionType: 'wait', title: '天空偏晴' }, en: false });
  assert.ok(fairVmZh.heroSub.includes('北方') && fairVmZh.heroSub.includes('手機夜拍'), `18-39 Fair tier must display direction + Night Mode tip, got "${fairVmZh.heroSub}"`);

  const mcmurdoVmEn = buildHeroViewModel({
    pos: { lat: -77.85, lon: 166.67 },
    sc: { total: 72, auroraScore: 80, skyScore: 95, darkScore: 100, magLat: 79, effKp: 2.0 },
    kp: 2.0, mltNow: 0, act: { actionType: 'go', title: 'go' }, en: true
  });
  assert.ok(mcmurdoVmEn.heroCue.includes('north') && !mcmurdoVmEn.heroCue.includes('south'), `McMurdo polar-cap overhead-eq must look north, got "${mcmurdoVmEn.heroCue}"`);

  const mmRow = formatOutlookRowStats({ n: { peakCloudMismatch: true, kpPeakClear: 12, bestClear: 90, maxKp: 5.0, kpAvailable: true }, idx: 1, en: false });
  assert.equal(mmRow.clearTxt, '極光強時晴空 12%');
  const osloNote = formatLightPollutionNote({ urbanGlare: api.estimateUrbanSkyglow({ lat: 59.9127, lon: 10.7461, auroraScore: 45, effMoonPct: 0, lang: 'zh' }), pos: { mode: 'manual' }, sc: {}, en: false });
  assert.ok(!/光穹|北方側|南方側/.test(osloNote.text), `Beginner copy must not contain 光穹 or 北方側: "${osloNote.text}"`);
});

test('70. v65 System-Level Tab 3 IA (觀測地圖), Copernicus GLO-30 Ridge Lower Bounds & Daily Instrument Verification Scorecard', async () => {
  const { TERMS } = await import('../src/glossary.js');
  const { HORIZON_LOWER_BOUNDS } = await import('../src/horizon-data.js');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const verifRaw = fs.readFileSync(path.join(__dirname, '..', 'verification', 'latest.json'), 'utf8');
  const verif = JSON.parse(verifRaw);

  // (a) sw.js v65+ + horizon-data.js in SHELL_ASSETS + Network-First for /verification/
  const swVer70 = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer70 >= 65, `sw.js CACHE_NAME must be >= v65, got v${swVer70}`);
  assert.ok(swSrc.includes('./src/horizon-data.js'), 'sw.js SHELL_ASSETS must include ./src/horizon-data.js');
  assert.ok(swSrc.includes("url.pathname.includes('/verification/')"), 'sw.js must serve /verification/ Network-First');

  // (b) Tab 3 system-level IA permanently unified as 觀測地圖 / Sky & maps with Folded Map SVG & scientifically honest forecast titles
  assert.equal(TERMS.nav.liveMap.zh, '觀測地圖');
  assert.equal(TERMS.nav.liveMap.en, 'Sky & maps');
  assert.equal(TERMS.nav.cloudMap.zh, '觀測地圖');
  assert.equal(TERMS.nav.cloudMap.en, 'Sky & maps');
  assert.ok(htmlSrc.includes('polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"'), 'Tab 3 bottom nav must use Folded Map SVG');
  assert.ok(htmlSrc.includes('id="tsVerifCard"'), 'Trust Sheet must mount #tsVerifCard');
  assert.ok(htmlSrc.includes('動態雲量預報（Windy）') && htmlSrc.includes('北半球極光範圍預報（NOAA）'), 'Tab 3 card titles must honestly label Windy cloud & NOAA aurora forecasts');
  assert.ok(appSrc.includes('loadVerificationScorecard') && appSrc.includes('7 * 86400000'), 'app.js must lazily load verification scorecard with 7-day staleness guard');

  // (c) Copernicus GLO-30 fixed-corridor horizon table: 112 curated spots, strict <=1.5 km non-interpolated lookup, advisory-only
  const keys = Object.keys(HORIZON_LOWER_BOUNDS);
  assert.ok(keys.length >= 100, `Expected >=100 curated Copernicus GLO-30 spots, got ${keys.length}`);
  const banff = api.lookupCorridorHorizon({ lat: 51.2485, lon: -115.4979, azimuthDeg: 0 });
  assert.equal(banff.matched, true, 'Banff Lake Minnewanka must match curated GLO-30 entry');
  assert.ok(banff.minDeg >= 6 && banff.blocksLow === true, `Banff Minnewanka northward ridge must report >=6° lower bound, got ${JSON.stringify(banff)}`);
  const yk = api.lookupCorridorHorizon({ lat: 62.4540, lon: -114.3718, azimuthDeg: 0 });
  assert.equal(yk.matched, true, 'Yellowknife must match curated GLO-30 entry');
  assert.equal(yk.minDeg, 0, `Flat Yellowknife shield must report 0° horizon, got ${yk.minDeg}`);
  assert.equal(yk.blocksLow, false);
  const unmapped = api.lookupCorridorHorizon({ lat: 61.5000, lon: 8.5000, azimuthDeg: 0 });
  assert.equal(unmapped.matched, false, 'Unmapped mountain coordinate >1.5 km from curated points must NEVER interpolate');
  assert.equal(unmapped.blocksLow, false);

  // (d) Daily independent verification scorecard schema & small-sample honesty guard
  assert.ok(Number.isFinite(Date.parse(verif.generatedAt)), `verification/latest.json generatedAt must be valid ISO date, got ${verif.generatedAt}`);
  assert.ok(!verifRaw.includes('NaN') && !verifRaw.includes('機場'), 'verification/latest.json must never contain NaN or cryptic 機場');
  assert.ok(verif.cloudAudit && verif.cloudAudit.airportsCheckedNow >= 5, `Expected >=5 live METAR stations audited, got ${verif.cloudAudit?.airportsCheckedNow}`);
  assert.ok(verif.geomagAudit && verif.geomagAudit.gfzHp30Bins30d >= 1000, `Expected 30-day GFZ Hp30 bins >=1000, got ${verif.geomagAudit?.gfzHp30Bins30d}`);
  if (verif.geomagAudit.smallSampleGuard) {
    assert.equal(verif.geomagAudit.l1RocAuc, null, 'Small-sample guard (<5 active events) must suppress l1RocAuc to null');
  }
});

test('71. v66 Mainstream Complete & 6-Stage Real Human Driving/Chasing Journey Simulation (No Whiplash, Offline Fjord Survival, Spot SEO Live, Share Card, Trip Compare, USGS Mag)', async () => {
  // (a) Real ES module import of spot-live.js (catches broken exports immediately!) + zero regression on live bugs
  const spotLiveMod = await import('../src/spot-live.js');
  assert.equal(typeof spotLiveMod.hydrateSpotLive, 'function', 'src/spot-live.js must cleanly import & export hydrateSpotLive');
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(!/\beffectiveCloud\s*\(/.test(appSrc), 'app.js must call computeEffectiveCloud, never undefined effectiveCloud');
  assert.ok(!appSrc.includes("$('localClk')"), 'app.js shareForecastCard must read $("clk"), never nonexistent $("localClk")');
  assert.ok(!/\bzp\.hour\b/.test(appSrc), 'app.js compareTripCities must read zp.hourStr, never undefined zp.hour');
  const swVer71 = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer71 >= 66, `sw.js must be >= aurora-radar-shell-v66, got v${swVer71}`);
  assert.ok(htmlSrc.includes('https://geomag.usgs.gov'), 'index.html CSP connect-src must whitelist https://geomag.usgs.gov');
  assert.ok(htmlSrc.includes('id="windyLayerChips"') && htmlSrc.includes('data-overlay="lclouds"') && htmlSrc.includes('data-overlay="satellite"'), 'Tab 3 must expose 3-pill Windy layer switcher');
  assert.ok(htmlSrc.includes('id="searchResults"'), 'Location picker must mount #searchResults candidate container');

  // (b) Share PNG Card auto-computes isBest highlight & preserves local clock
  const { buildShareCardPayload } = await import('../src/share-card.js');
  const cardPayload = buildShareCardPayload({
    pos: { name: '挪威 · Tromsø', nameEn: 'Norway · Tromsø' },
    posName: '挪威 · Tromsø',
    sc: { total: 74, grade: 'prime', isTooBright: false },
    localTimeStr: '23:15',
    nights3: [
      { dayLabel: '今晚', bestNightScore: 52, bestClearPct: 60, tone: 'good' },
      { dayLabel: '明晚', bestNightScore: 78, bestClearPct: 88, tone: 'good' },
      { dayLabel: '後天', bestNightScore: 30, bestClearPct: 40, tone: 'warn' }
    ],
    lang: 'zh'
  });
  assert.equal(cardPayload.localTimeStr, '23:15');
  assert.equal(cardPayload.outlook[0].isBest, false);
  assert.equal(cardPayload.outlook[1].isBest, true, 'Share PNG card must auto-highlight highest-scoring night >=18 as isBest');
  assert.equal(cardPayload.outlook[2].isBest, false);

  // (c) Real Human Chase Journey Stage 1 & 2: Mid-Drive Anti-Whiplash (NWP noise shorter-road + prevBestKey hysteresis)
  const hotelDirsStage1 = [
    { key: 'here', label: '原地', avg3h: 82, nowC: 85, isOcean: false },
    { key: 'W', label: '往西 Sommarøy', lat: 69.63, lon: 18.01, roadKm: 58, avg3h: 24, nowC: 25, temp: -4, maxWind3h: 4, maxPrecip3h: 0, isOcean: false },
    { key: 'SE', label: '往東南 Skibotn', lat: 69.39, lon: 20.27, roadKm: 118, avg3h: 21, nowC: 20, temp: -12, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const stage1NoPrev = api.summarizeCompass(hotelDirsStage1, 'zh');
  assert.equal(stage1NoPrev.bestKey, 'W', `Within 3% NWP noise (21% vs 24%), shorter drive Sommarøy (58km) must beat Skibotn (118km), got ${stage1NoPrev.bestKey}`);

  // Stage 2: Driver is ALREADY committed to Skibotn (prevBestKey: 'SE'), NWP jitters 5% (Skibotn 26% vs Sommarøy 21%)
  const midDriveJitter = [
    { key: 'here', label: '原地', avg3h: 80, nowC: 80, isOcean: false },
    { key: 'W', label: '往西 Sommarøy', lat: 69.63, lon: 18.01, roadKm: 58, avg3h: 21, nowC: 22, temp: -4, maxWind3h: 4, maxPrecip3h: 0, isOcean: false },
    { key: 'SE', label: '往東南 Skibotn', lat: 69.39, lon: 20.27, roadKm: 118, avg3h: 26, nowC: 24, temp: -12, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const stage2Hold = api.summarizeCompass(midDriveJitter, 'zh', { prevBestKey: 'SE' });
  assert.equal(stage2Hold.bestKey, 'SE', `Mid-drive hysteresis must hold committed Skibotn (26% <= 35%, 5% margin <= 10%) instead of causing a winter U-turn, got ${stage2Hold.bestKey}`);

  // Stage 3: Genuine Reversal! Skibotn collapses to 82% cloud while Sommarøy opens to 15% cloud -> MUST switch cleanly
  const stage3Collapse = [
    { key: 'here', label: '原地', avg3h: 78, nowC: 80, isOcean: false },
    { key: 'W', label: '往西 Sommarøy', lat: 69.63, lon: 18.01, roadKm: 58, avg3h: 15, nowC: 18, temp: -4, maxWind3h: 4, maxPrecip3h: 0, isOcean: false },
    { key: 'SE', label: '往東南 Skibotn', lat: 69.39, lon: 20.27, roadKm: 118, avg3h: 82, nowC: 40, temp: -12, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const stage3Switch = api.summarizeCompass(stage3Collapse, 'zh', { prevBestKey: 'SE' });
  assert.equal(stage3Switch.bestKey, 'W', `When committed Skibotn genuinely clouds over (82%), compass must switch to clear Sommarøy, got ${stage3Switch.bestKey}`);

  // Stage 3b: Origin/Current position unexpectedly clears (20% cloud) -> stop driving immediately!
  const stage3bOriginClears = [
    { key: 'here', label: '原地', avg3h: 20, nowC: 18, isOcean: false },
    { key: 'SE', label: '往東南 Skibotn', lat: 69.39, lon: 20.27, roadKm: 118, avg3h: 15, nowC: 15, temp: -12, maxWind3h: 3, maxPrecip3h: 0, isOcean: false }
  ];
  const stage3bStay = api.summarizeCompass(stage3bOriginClears, 'zh', { prevBestKey: 'SE' });
  assert.equal(stage3bStay.bestKey, 'here', 'When current sky clears to 80%, must immediately advise staying local instead of driving');

  // (d) Stage 4: Fjord Dead-Zone Offline Survival (42 km from hotel, 2 hours later)
  const storage = await import('../src/storage.js');
  const mem = new Map();
  const mockStore = {
    getItem: k => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: k => mem.delete(k)
  };
  const hotelMs = Date.UTC(2026, 10, 26, 19, 0, 0); // 20:00 CET
  const hereHrsHotel = [
    { time: '20:00', dtMs: hotelMs + 1800000, block: 85, clear: 15, temp: -3, windMs: 3, precip: 0, isDay: false },
    { time: '21:00', dtMs: hotelMs + 5400000, block: 55, clear: 45, temp: -4, windMs: 3, precip: 0, isDay: false },
    { time: '22:00', dtMs: hotelMs + 9000000, block: 10, clear: 90, temp: -5, windMs: 2, precip: 0, isDay: false },
    { time: '23:00', dtMs: hotelMs + 12600000, block: 12, clear: 88, temp: -6, windMs: 2, precip: 0, isDay: false }
  ];
  storage.writeSwrCacheEntry({ lat: 69.6492, lon: 18.9553 }, {
    ts: hotelMs, lang: 'zh', posName: '挪威 · Tromsø',
    lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo',
    kp: 4.0, bz: -5.0, speed: 480, sunAltNow: -20, mlt: 21.5,
    score: { total: 14, skyScore: 15, auroraScore: 65, darkScore: 100, grade: 'low', isTooBright: false },
    hereHrs: hereHrsHotel, dirResults: [], nights3: [], kpForecast: []
  }, mockStore);
  const fjordPos = { lat: 69.35, lon: 19.65, tz: 'Europe/Oslo' }; // ~43 km SE of Tromsø
  const fjordMs = hotelMs + 2 * 3600000; // 22:00 CET (2 hours later)
  assert.equal(storage.findMatchingOfflineCache(fjordPos, fjordMs, mockStore), null, 'Default 20km SWR pre-paint must stay strict');
  const fbHit = storage.findMatchingOfflineCache(fjordPos, fjordMs, mockStore, { maxFallbackKm: 150 });
  assert.ok(fbHit && fbHit._fallbackDistKm >= 35 && fbHit._fallbackDistKm <= 55, `150km offline fjord fallback must recover Tromsø cache (~43km), got ${JSON.stringify(fbHit?._fallbackDistKm)}`);
  const hyd = storage.hydrateOfflineState(fbHit, fjordPos, fjordMs);
  assert.equal(hyd.renderState.hereHrs[0].time, '22:00', `Offline hydration at 22:00 must advance hour pointer from 20:00 to 22:00, got ${hyd.renderState.hereHrs[0].time}`);
  assert.ok(hyd.renderState.sc.skyScore >= 85 && hyd.renderState.sc.total > 40, `Offline hydration at 22:00 must advance hero score to clear 22:00 forecast, got ${JSON.stringify(hyd.renderState.sc)}`);

  // (e) Stage 5: Radiation/Ice-Fog Detection + Silent USGS North America Ground Magnetometer (0.8m lag)
  const metFogPayload = {
    properties: {
      timeseries: [{
        time: new Date(hotelMs).toISOString().replace('.000Z', 'Z'),
        data: {
          instant: { details: { air_temperature: -14.0, dew_point_temperature: -14.7, wind_speed: 1.4, cloud_area_fraction: 5, cloud_area_fraction_low: 5, cloud_area_fraction_medium: 0, cloud_area_fraction_high: 0, fog_area_fraction: 0 } },
          next_1_hours: { details: { precipitation_amount: 0 } }
        }
      }]
    }
  };
  const fogHrs = api.parseMetNorwayHourly12(metFogPayload, 69.39, 20.27, 'Europe/Oslo', new Date(hotelMs - 60000), 1);
  assert.equal(fogHrs[0].iceFogRisk, true, 'Calm -14°C air with 0.7°C dew-point spread must flag iceFogRisk');

  const cmoSt = api.findNearestUsgsMagStation(64.8378, -147.7164);
  assert.ok(cmoSt && cmoSt.code === 'CMO' && cmoSt.distKm < 20, `Fairbanks must match USGS CMO <20 km, got ${JSON.stringify(cmoSt)}`);
  assert.equal(api.findNearestUsgsMagStation(-45.0312, 168.6626), null, 'Queenstown NZ must NOT match USGS North America stations');
  const usgsTimes = Array.from({ length: 60 }, (_, i) => new Date(hotelMs - (59 - i) * 60000).toISOString());
  const usgsVals = Array.from({ length: 60 }, (_, i) => (i >= 58 ? null : (i < 42 ? 12750 : 12750 - (i - 41) * 14)));
  const usgsRes = api.parseUsgsMagnetometerJson({ times: usgsTimes, values: [{ id: 'H', values: usgsVals }] }, cmoSt, hotelMs);
  assert.ok(usgsRes && usgsRes.source === 'USGS' && usgsRes.code === 'CMO' && usgsRes.active === true && usgsRes.bayDropNt >= 180 && usgsRes.groundSubstormJumpNt >= 25,
    `USGS CMO -220 nT substorm bay (with trailing nulls) must trigger active ground substorm, got ${JSON.stringify(usgsRes)}`);

  // Trust Sheet stat grid honesty: USGS shown in Fairbanks, absent in Queenstown
  const { renderTrustStatGrid } = await import('../src/i18n.js');
  const fakeGrid = { innerHTML: '' };
  renderTrustStatGrid((id) => (id === 'tsStatGrid' ? fakeGrid : null), { lat: 64.8378, lon: -147.7164 }, false);
  assert.ok(fakeGrid.innerHTML.includes('USGS') && fakeGrid.innerHTML.includes('CMO'), 'Fairbanks Trust Sheet must display USGS CMO');
  renderTrustStatGrid((id) => (id === 'tsStatGrid' ? fakeGrid : null), { lat: -45.0312, lon: 168.6626 }, false);
  assert.ok(!fakeGrid.innerHTML.includes('USGS') && !fakeGrid.innerHTML.includes('FMI'), 'Queenstown Trust Sheet must stay free of northern ground mag claims');
});

test('72. v67 Public Live Verification Page, In-App Field Feedback Loop & Copernicus DEM Enriched SEO Pages', async () => {
  const verifMod = await import('../src/verification-page.js');
  assert.equal(typeof verifMod.hydrateVerificationPage, 'function', 'src/verification-page.js must cleanly import & export hydrateVerificationPage');

  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const verifHtml = fs.readFileSync(path.join(__dirname, '..', 'verification', 'index.html'), 'utf8');
  const sitemapXml = fs.readFileSync(path.join(__dirname, '..', 'sitemap.xml'), 'utf8');
  const banffHtml = fs.readFileSync(path.join(__dirname, '..', 'spots', 'banff', 'index.html'), 'utf8');

  const swVer72 = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer72 >= 67, `sw.js CACHE_NAME must be >= aurora-radar-shell-v67, got v${swVer72}`);
  assert.ok(swSrc.includes('./src/verification-page.js'), 'sw.js SHELL_ASSETS must include ./src/verification-page.js');
  assert.ok(htmlSrc.includes('id="tsFeedbackLink"') && htmlSrc.includes('href="verification/"'), 'Trust Sheet must link to live verification/ page and #tsFeedbackLink');
  assert.ok(verifHtml.includes('../src/verification-page.js') && verifHtml.includes('id="vLayeredMae"'), 'verification/index.html must mount live scorecard DOM & hydrator');
  assert.ok(sitemapXml.includes('/verification/'), 'sitemap.xml must include /verification/');
  assert.ok(banffHtml.includes('Copernicus DEM') && banffHtml.includes('遠山至少遮蔽'), 'SEO spot pages must surface real Copernicus GLO-30 mountain-ridge horizon data');
  assert.ok(banffHtml.includes('需要 Kp 幾才看得到'), 'SEO spot pages must include Traditional Chinese FAQ JSON-LD');
  for (const tpl of ['field-sky-report.yml', 'bug-report.yml', 'feature-request.yml']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', '.github', 'ISSUE_TEMPLATE', tpl)), `Missing issue template ${tpl}`);
  }
});

test('73. Multi-App Same-Origin PWA Isolation (Prefix-Scoped SW Cache Pruning & Manifest ID)', async () => {
  const vm = await import('node:vm');
  const swSrc = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));

  assert.equal(manifest.id, './', 'manifest.json must declare explicit relative id for multi-PWA origin isolation');
  assert.ok(!/\bcaches\.match\(/.test(swSrc), 'sw.js must not call unscoped global caches.match(); scope reads to CACHE_NAME');

  const swVer73 = Number((swSrc.match(/aurora-radar-shell-v(\d+)/) || [])[1] || 0);
  assert.ok(swVer73 >= 68, `sw.js must be >= v68 with prefix-scoped pruning, got v${swVer73}`);

  const listeners = {};
  const deleted = [];
  let claimed = false;
  const mockKeys = [
    'aurora-radar-shell-v66',
    'aurora-radar-shell-v67',
    `aurora-radar-shell-v${swVer73}`,
    'other-studio-app-v1',
    'workbox-precache-v2'
  ];
  const sandbox = {
    URL,
    Request,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    caches: {
      keys: async () => [...mockKeys],
      delete: async (k) => { deleted.push(k); return true; },
      open: async () => ({ match: async () => null, put: async () => {} })
    },
    self: {
      location: { origin: 'https://studio.example' },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      skipWaiting: async () => {},
      clients: { claim: async () => { claimed = true; } }
    }
  };
  vm.runInNewContext(swSrc, sandbox);
  assert.equal(typeof listeners.activate, 'function', 'sw.js must register activate listener');

  let pending = null;
  listeners.activate({ waitUntil: (p) => { pending = p; } });
  await pending;

  assert.deepEqual(deleted.sort(), ['aurora-radar-shell-v66', 'aurora-radar-shell-v67'],
    `activate must delete ONLY stale aurora-radar-shell-* caches, got ${JSON.stringify(deleted)}`);
  assert.equal(claimed, true, 'activate must call self.clients.claim()');
});










