import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as engine from '../src/aurora-engine.js';
import * as charts from '../src/charts.js';

const api = { ...engine, ...charts };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

  assert.ok(alta > 65 && alta < 70, `Alta magLat=${alta}`);
  assert.ok(oslo > 57 && oslo < 62, `Oslo magLat=${oslo}`);
  assert.ok(taipei > 13 && taipei < 20, `Taipei magLat=${taipei}`);
  assert.ok(hobart < -54 && hobart > -59, `Hobart eccentric AACGM magLat=${hobart}`);

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

test('11. All NORDIC_CORRIDORS are land-safe, unique, fit SVG wedges, and stay west of Russian border', () => {
  for (const c of api.NORDIC_CORRIDORS) {
    assert.equal(c.pts.length, 4);
    assert.deepEqual([...new Set(c.pts.map(p => p.key))].sort(), ['E', 'N', 'S', 'W']);
    for (const p of c.pts) {
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon));
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
  const [mag, wind, kp1m, ov, hpi, goes, kpfc, scales, met, om] = await Promise.all([
    fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt', { headers: hdrs }).then(r => r.text()),
    fetch('https://services.swpc.noaa.gov/json/goes/primary/magnetometers-6-hour.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/products/noaa-scales.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=69.9689&lon=23.2716', { headers: hdrs }).then(r => r.json()),
    fetch('https://api.open-meteo.com/v1/forecast?latitude=64.1466&longitude=-21.9426&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation&timezone=auto&timeformat=unixtime&forecast_days=4', { headers: hdrs }).then(r => r.json())
  ]);

  const magS = api.parseMagSeries(mag, 180);
  const windS = api.parseWindSeries(wind, 180);
  const kpObj = api.parseLatestKp(kp1m);
  const ovAlta = api.lookupOvationProb(ov, 69.9689, 23.2716);
  const hpiObj = api.parseHemiPower(hpi, 69.9689);
  const goesSub = api.parseGoesSubstorm(goes);
  const kpFcList = api.parseKpForecast(kpfc);
  const scParsed = api.parseNoaaGeomagneticScales(scales);
  const met12 = api.parseMetNorwayHourly12(met, 69.9689, 23.2716, 'Europe/Oslo', new Date());
  const om12 = api.parseOpenMeteoHourly12(om.hourly, 64.1466, -21.9426, om.timezone, new Date());

  assert.ok(magS.length > 0 && windS.length > 0 && kpObj && Number.isFinite(ovAlta));
  assert.ok(hpiObj && goesSub && kpFcList.length > 10 && scParsed && scParsed.days.length === 3);
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
      hpiGw: 65, newell: 8500, mlt: 0.5, effMoonPct: 0
    });
    if (tier === 'oval') assert.ok(g1.total >= 65, `${name} G1 should be >=65, got ${g1.total}`);
    if (tier === 'sub') assert.ok(g1.total >= 40, `${name} G1 should be >=40, got ${g1.total}`);
    if (tier === 'low') assert.equal(g1.total, 0);

    const g4 = api.computeAuroraScore({
      lat, lon, cloudNow: 10, sunAlt: -25, bz: -18, speed: 750, kp: 8,
      ovation: tier === 'low' ? 0 : 35,
      hpiGw: 140, newell: 22000, mlt: 0.5, effMoonPct: 0
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
  assert.equal(parsed.name, 'Norway · Tromsø');

  assert.equal(api.parseUrlLocation('?lat=999&lon=10'), null);
  assert.equal(api.parseUrlLocation('?lat=abc&lon=10'), null);
  const xss = api.parseUrlLocation('?lat=64.1466&lon=-21.9426&name=%3Cscript%3EReykjavik%3C/script%3E');
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

test('24. All GLOBAL_CORRIDORS (Reykjavik, Fairbanks, Yellowknife, Queenstown, Hobart) are valid and matched', () => {
  assert.equal(api.GLOBAL_CORRIDORS.length, 5);
  for (const c of api.GLOBAL_CORRIDORS) {
    assert.equal(c.pts.length, 4);
    assert.deepEqual([...new Set(c.pts.map(p => p.key))].sort(), ['E', 'N', 'S', 'W']);
    for (const p of c.pts) {
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
