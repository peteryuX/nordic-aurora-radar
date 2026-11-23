import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(HTML_PATH, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, 'index.html must contain an inline <script> block');

const EXPORTED_SYMBOLS = [
  'NORDIC_CORRIDORS',
  'detectDefaultLang', 'setLang', 'isEn', 'tSky', 'tDirLabel', 'tGrade',
  'isInNordicMetBox', 'computeCompassPoints', 'getZoneParts', 'formatReverseGeo',
  'computeSolarElevation', 'getMoonState', 'computeEffectiveCloud',
  'computeGeomagneticLat', 'requiredKpForMagLat', 'computeL1EtaMin',
  'computeMLT', 'computeNewellCoupling', 'computeDynamicPressure',
  'detectPressureShock', 'computeWindChill', 'computeDataLagMin',
  'newellToEnergy', 'computeBallisticCoupling', 'computeAuroraScore',
  'parseMagSeries', 'parseWindSeries', 'parseLatestActiveWind',
  'parseKpForecast', 'lookupForecastKp', 'parseLatestKp',
  'lookupOvationProb', 'parseHemiPower', 'parseGoesSubstorm',
  'parseMetNorwayHourly12', 'parseOpenMeteoHourly12',
  'scoreHourlyForecast12', 'findBestDarkWindow', 'evaluateVerdict',
  'summarizeCompass', 'buildSkySceneSVG', 'utcTagToLocalHM',
  'bzToEnergy', 'summarizeEnergyTrend', 'buildBzChartSVG',
  'buildSkyWaveSVG', 'buildCompassRadarSVG'
];

const api = new Function(`${scriptMatch[1]}\nreturn { ${EXPORTED_SYMBOLS.join(', ')} };`)();

test('1. Solar elevation astronomy matches equinox, midnight sun, and polar night', () => {
  // Alta midnight sun on June solstice (~+4.8°)
  const midnightSun = api.computeSolarElevation(new Date('2026-06-21T00:00:00Z'), 69.97, 23.27);
  assert.ok(midnightSun > 3 && midnightSun < 7, `Expected Alta midnight sun 3..7°, got ${midnightSun}`);

  // Alta polar night solar noon on December solstice (~-3.6°)
  const polarNight = api.computeSolarElevation(new Date('2026-12-21T11:00:00Z'), 69.97, 23.27);
  assert.ok(polarNight < -2 && polarNight > -6, `Expected Alta polar night noon -6..-2°, got ${polarNight}`);

  // Equator equinox solar noon (~88..90° accounting for equation of time)
  const eqNoon = api.computeSolarElevation(new Date('2026-03-20T12:07:00Z'), 0, 0);
  assert.ok(eqNoon > 89, `Expected equator equinox noon >89°, got ${eqNoon}`);
});

test('2. Lunar phase and elevation model matches known 2026 Full & New Moons', () => {
  const fullMoon = api.getMoonState(new Date('2026-11-24T14:53:00Z'), 69.97, 23.27);
  assert.ok(fullMoon.pct >= 98, `Expected Full Moon >=98%, got ${fullMoon.pct}`);

  const newMoon = api.getMoonState(new Date('2026-11-09T07:02:00Z'), 69.97, 23.27);
  assert.ok(newMoon.pct <= 2, `Expected New Moon <=2%, got ${newMoon.pct}`);

  // Moon below horizon must yield 0 effective moonlight
  if (!newMoon.up) assert.equal(newMoon.effMoonPct, 0);
  assert.ok(fullMoon.effMoonPct <= fullMoon.pct);
});

test('3. Random-overlap layered cloud occlusion handles cirrus, fog, and Open-Meteo cap', () => {
  assert.equal(api.computeEffectiveCloud(0, 0, 0, 0), 0);
  assert.equal(api.computeEffectiveCloud(100, 0, 0, 0), 100);
  assert.equal(api.computeEffectiveCloud(0, 0, 100, 0), 30); // High cirrus = 30% occlusion
  assert.equal(api.computeEffectiveCloud(0, 0, 0, 100), 100); // Fog blocks aurora
  assert.equal(api.computeEffectiveCloud(50, 50, 0, 0), 75);  // 1 - 0.5 * 0.5 = 75%
  // Open-Meteo cross-model cap prevents low>total over-reporting
  assert.equal(api.computeEffectiveCloud(90, 90, 0, 0, 20), 28);
});

test('4. IGRF-14 geomagnetic latitude, MLT, and Kp threshold gates', () => {
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

  const mlt = api.computeMLT(new Date('2026-11-23T22:00:00Z'), 69.97, 23.27);
  assert.ok(mlt >= 0 && mlt < 24, `MLT out of range: ${mlt}`);
});

test('5. Solar wind coupling, dynamic pressure, shock detector, wind chill, and L1 ETA', () => {
  // Pure northward Bz yields 0 Newell coupling; southward Bz increases monotonically with speed & |Bz|
  assert.equal(api.computeNewellCoupling(500, 0, 5), 0);
  const nwWeak = api.computeNewellCoupling(400, 0, -2);
  const nwStrong = api.computeNewellCoupling(650, 0, -8);
  assert.ok(nwStrong > nwWeak * 4);

  // Dynamic pressure P_dyn = 1.6726e-6 * n * v^2
  const pdyn = api.computeDynamicPressure(500, 10);
  assert.ok(Math.abs(pdyn - 4.18) < 0.05, `Expected ~4.18 nPa, got ${pdyn}`);

  // Pressure shock detection
  const calmWind = [{ speed: 350, density: 4 }, { speed: 360, density: 4.5 }];
  assert.equal(api.detectPressureShock(calmWind).active, false);
  const shockWind = [{ speed: 350, density: 4 }, { speed: 600, density: 12 }];
  assert.equal(api.detectPressureShock(shockWind).active, true);

  // Wind chill only applies below 10°C and >= 4.8 km/h
  assert.equal(api.computeWindChill(15, 10), 15);
  assert.ok(api.computeWindChill(-10, 10) < -18);

  // L1 ETA decreases as solar wind speed increases and stays clamped to [18, 95]
  assert.ok(api.computeL1EtaMin(700) < api.computeL1EtaMin(350));
  assert.equal(api.computeL1EtaMin(50), 45);
});

test('6. NOAA 1-minute Kp parser skips provisional trailing 0Z placeholders without breaking true 0.00', () => {
  // Regression test for real NOAA SWPC behavior observed 2026-11-23:
  // latest 1-3 rows arrive as provisional 0Z while settled rows right before them are 0.33
  const liveLike = [
    { time_tag: '2026-11-23T21:44:00', estimated_kp: 0.33, kp: '0P' },
    { time_tag: '2026-11-23T21:45:00', estimated_kp: 0.33, kp: '0P' },
    { time_tag: '2026-11-23T21:46:00', estimated_kp: 0, kp: '0Z' },
    { time_tag: '2026-11-23T21:47:00', estimated_kp: 0, kp: '0Z' },
    { time_tag: '2026-11-23T21:48:00', estimated_kp: 0, kp: '0Z' }
  ];
  assert.equal(api.parseLatestKp(liveLike).kp, 0.33);

  // Storm with trailing 0Z placeholders must NOT drop to 0
  const stormLike = [
    { time_tag: '2026-11-23T21:00:00', estimated_kp: 5.33, kp: '5P' },
    { time_tag: '2026-11-23T21:01:00', estimated_kp: 0, kp: '0Z' },
    { time_tag: '2026-11-23T21:02:00', estimated_kp: 0, kp: '0Z' }
  ];
  assert.equal(api.parseLatestKp(stormLike).kp, 5.33);

  // Genuine 6+ consecutive minutes of 0.00 must return 0
  const trueZero = [1, 2, 3, 4, 5, 6].map(i => ({ time_tag: `2026-11-23T21:0${i}:00`, estimated_kp: 0, kp: '0Z' }));
  assert.equal(api.parseLatestKp(trueZero).kp, 0);

  // 3-hour official Kp feed (uses `Kp` field, not `estimated_kp`)
  const kp3h = [
    { time_tag: '2026-11-23T15:00:00', Kp: 1.67 },
    { time_tag: '2026-11-23T18:00:00', Kp: 0.67 }
  ];
  assert.equal(api.parseLatestKp(kp3h).kp, 0.67);
});

test('7. NOAA mag, wind, Kp forecast, OVATION, HPI, and GOES parsers filter bad/fill values', () => {
  // Reverse chronological + inactive IMAP + sensor fill value -999.9
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

  // Wind fill-value rejection (-999.9, 0, >3000)
  const windRows = [
    { time_tag: '2026-11-23T21:51:00', active: true, proton_speed: 450, proton_density: 6.2 },
    { time_tag: '2026-11-23T21:50:00', active: true, proton_speed: -999.9, proton_density: -999.9 },
    { time_tag: '2026-11-23T21:49:00', active: true, proton_speed: 0, proton_density: 5 },
    { time_tag: '2026-11-23T21:48:00', active: false, proton_speed: 800, proton_density: 20 }
  ];
  const parsedWind = api.parseWindSeries(windRows, 10);
  assert.equal(parsedWind.length, 1);
  assert.equal(parsedWind[0].speed, 450);

  // Kp forecast supports both object rows and legacy array rows
  const fcObj = api.parseKpForecast([{ time_tag: '2026-11-23T21:00:00', kp: 2.33, observed: 'predicted' }]);
  assert.equal(fcObj.length, 1);
  assert.equal(fcObj[0].kp, 2.33);
  const fcArr = api.parseKpForecast([['time_tag', 'kp', 'observed'], ['2026-11-23 21:00:00', '3.00', 'predicted']]);
  assert.equal(fcArr.length, 1);
  assert.equal(fcArr[0].kp, 3);

  // OVATION negative longitude & antimeridian wrapping
  const ov = { coordinates: [[338, 64, 18], [0, 70, 22], [147, -43, 5]] };
  assert.equal(api.lookupOvationProb(ov, 64.14, -21.94), 18); // Reykjavik -> 338
  assert.equal(api.lookupOvationProb(ov, 70.0, -0.1), 22);    // Prime meridian wrap
  assert.equal(api.lookupOvationProb(ov, -42.88, 147.33), 5); // Southern Hemisphere

  // HPI North vs South
  const hpiTxt = '# comment\n2026-11-23_21:50  2026-11-23_23:07  28  19\n';
  assert.equal(api.parseHemiPower(hpiTxt, 69.97).gw, 28);
  assert.equal(api.parseHemiPower(hpiTxt, -45.0).gw, 19);

  // GOES substorm ignores arcjet_flag=true and triggers at >= 15 nT jump
  const goesRows = [
    { time_tag: '2026-11-23T21:30:00Z', Hp: 80, arcjet_flag: false },
    { time_tag: '2026-11-23T21:35:00Z', Hp: 82, arcjet_flag: false },
    { time_tag: '2026-11-23T21:40:00Z', Hp: 85, arcjet_flag: false },
    { time_tag: '2026-11-23T21:45:00Z', Hp: 90, arcjet_flag: false },
    { time_tag: '2026-11-23T21:48:00Z', Hp: 999, arcjet_flag: true },
    { time_tag: '2026-11-23T21:50:00Z', Hp: 100, arcjet_flag: false }
  ];
  const sub = api.parseGoesSubstorm(goesRows);
  assert.equal(sub.jumpNt, 20);
  assert.equal(sub.active, true);
});

test('8. MET Norway exact-hour boundary and Open-Meteo half-hour timezone UTC alignment', () => {
  // Exact :00:00.000 boundary must NOT pick the previous hour
  const metMock = {
    properties: {
      timeseries: [
        { time: '2026-11-23T20:00:00Z', data: { instant: { details: { air_temperature: -5, cloud_area_fraction_low: 80 } } } },
        { time: '2026-11-23T21:00:00Z', data: { instant: { details: { air_temperature: -3, cloud_area_fraction_low: 10 } } } },
        { time: '2026-11-23T22:00:00Z', data: { instant: { details: { air_temperature: -2, cloud_area_fraction_low: 20 } } } }
      ]
    }
  };
  const metHrs = api.parseMetNorwayHourly12(metMock, 69.97, 23.27, 'Europe/Oslo', new Date('2026-11-23T21:00:00.000Z'));
  assert.equal(metHrs[0].time, '22:00'); // 21:00Z = 22:00 CET, NOT 21:00 CET
  assert.equal(metHrs[0].temp, -3);

  // Open-Meteo half-hour timezone (Adelaide UTC+10:30 = +37800s in Nov DST)
  const omMock = {
    time: ['2026-11-24T00:00', '2026-11-24T01:00'],
    cloud_cover_low: [10, 20],
    cloud_cover_mid: [0, 0],
    cloud_cover_high: [0, 0],
    cloud_cover: [10, 20],
    precipitation: [0, 0],
    temperature_2m: [18, 17],
    wind_speed_10m: [10, 10]
  };
  // 2026-11-24 00:00 Adelaide (+10:30) = 2026-11-23 13:30 UTC; midpoint = 14:00 UTC
  const omHrs = api.parseOpenMeteoHourly12(omMock, -34.93, 138.6, 'Australia/Adelaide', new Date('2026-11-23T13:45:00Z'), 37800);
  assert.equal(omHrs[0].time, '00:00');
  assert.equal(omHrs[0].dtMs, Date.parse('2026-11-23T14:00:00Z'));
  assert.equal(omHrs[0].isDay, false); // Midnight in Adelaide must be dark!
});

test('9. Aurora scoring invariants, monotonicity, and zero contradiction with hourly forecast & verdict', () => {
  // Gate 1: Taipei (low latitude) -> always 0
  const taipei = api.computeAuroraScore({ lat: 25.03, lon: 121.56, cloudNow: 0, sunAlt: -30, bz: -10, speed: 600, kp: 6, ovation: 0 });
  assert.equal(taipei.total, 0);
  assert.equal(taipei.outOfZone, 'low-lat');

  // Gate 2: Daylight -> always 0
  const daylight = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 0, sunAlt: 5, bz: -10, speed: 600, kp: 6, ovation: 80 });
  assert.equal(daylight.total, 0);
  assert.equal(daylight.isTooBright, true);

  // Monotonicity: clearer sky & stronger aurora must increase score
  const cloudy = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 85, sunAlt: -25, bz: -6, speed: 550, kp: 4, ovation: 55, hpiGw: 50 });
  const clear = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -25, bz: -6, speed: 550, kp: 4, ovation: 55, hpiGw: 50 });
  const quiet = api.computeAuroraScore({ lat: 69.97, lon: 23.27, cloudNow: 10, sunAlt: -25, bz: 2, speed: 320, kp: 0.33, ovation: 10, hpiGw: 12 });
  assert.ok(clear.total > cloudy.total, `Clear (${clear.total}) should exceed cloudy (${cloudy.total})`);
  assert.ok(clear.total > quiet.total, `Active (${clear.total}) should exceed quiet (${quiet.total})`);
  assert.ok(clear.total >= 65 && clear.total <= 99);

  // Consistency: scoreHourlyForecast12 hour-0 MUST match hero score closely under strong solar wind
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

  // Southern Hemisphere mid-latitude (Hobart) must say Oval South / 極光帶偏南, not North!
  const hobart = api.computeAuroraScore({ lat: -42.88, lon: 147.33, cloudNow: 10, sunAlt: -25, bz: 0, speed: 350, kp: 1, ovation: 0 });
  assert.equal(hobart.outOfZone, 'need-storm');
  assert.equal(hobart.grade, '🌍 極光帶偏南');
  assert.equal(api.tGrade(hobart.grade, 'en'), '🌍 Oval South');
  const vHobartEn = api.evaluateVerdict({ lat: -42.88, bestDark: hrs[0], kp: 1, scoreObj: hobart, lang: 'en' });
  const vHobartZh = api.evaluateVerdict({ lat: -42.88, bestDark: hrs[0], kp: 1, scoreObj: hobart, lang: 'zh' });
  assert.match(vHobartEn.title, /south/i);
  assert.match(vHobartZh.title, /更南邊/);

  // Consistency: every grade has a non-empty English translation & verdict in both languages
  for (const sc of [taipei, daylight, cloudy, clear, quiet, hobart]) {
    assert.ok(api.tGrade(sc.grade, 'en') !== sc.grade, `Missing English tGrade for ${sc.grade}`);
    const vZh = api.evaluateVerdict({ lat: 69.97, bestDark: hrs[0], kp: 2, scoreObj: sc, lang: 'zh' });
    const vEn = api.evaluateVerdict({ lat: 69.97, bestDark: hrs[0], kp: 2, scoreObj: sc, lang: 'en' });
    assert.ok(vZh.title && vZh.lead && vEn.title && vEn.lead);
  }
});

test('10. Solar wind trend banner aligns with Newell chart energy zone', () => {
  // Fast solar wind (700 km/s) with moderate Bz (-3.5 nT) -> high Newell coupling (>=62)
  const series = Array.from({ length: 40 }, (_, i) => ({
    time_tag: `2026-11-23T21:${String(i).padStart(2, '0')}:00`,
    bz: -3.5,
    by: 1.0,
    bt: 3.6
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

test('11. All NORDIC_CORRIDORS are land-safe, unique, fit SVG wedges, and match compass sectors', () => {
  for (const c of api.NORDIC_CORRIDORS) {
    assert.equal(c.pts.length, 4);
    const keys = new Set(c.pts.map(p => p.key));
    assert.deepEqual([...keys].sort(), ['E', 'N', 'S', 'W']);
    for (const p of c.pts) {
      assert.ok(Number.isFinite(p.lat) && Number.isFinite(p.lon));
      assert.ok(p.lon <= 30.85, `Point ${p.label} lon=${p.lon} crosses Russian border`);
      assert.equal(p.isOcean, false);
      const shortName = p.label.replace(/^[⬆️⬇️➡️⬅️]+\s*往[東西南北]+\s*/, '');
      assert.ok(shortName.length <= 13, `Radar wedge label too long (${shortName.length}): ${shortName}`);
      if (p.key === 'E') assert.ok(!p.label.includes('往西'), `East wedge should not say 往西: ${p.label}`);
      if (p.key === 'W') assert.ok(!p.label.includes('往東'), `West wedge should not say 往東: ${p.label}`);
    }
  }
});

test('12. All SVG builders produce clean markup with strictly uniform X-axis intervals', () => {
  const sky = api.buildSkySceneSVG({ cloudPct: 40, auroraScore: 55, moonUp: true, moonPct: 70, isTooBright: false });
  assert.ok(sky.includes('<rect') && !sky.includes('NaN') && !sky.includes('undefined'));

  // Chart 1: 120-min series -> shifted by etaMin=60m -> uniform :00 / :30 ticks
  const series = Array.from({ length: 120 }, (_, i) => {
    const t = new Date(Date.parse('2026-11-23T20:00:00Z') + i * 60000);
    return { time_tag: t.toISOString().slice(0, 19), bz: i > 80 ? -5 : -1, by: 1 };
  });
  const bal = api.computeBallisticCoupling(series, 400); // etaMin = 60m -> arrival 22:00..23:59 CET
  const bzSvg = api.buildBzChartSVG(series, 'Europe/Oslo', 400, bal, 'zh');
  assert.ok(bzSvg.includes('<polyline') && !bzSvg.includes('NaN') && !bzSvg.includes('undefined'));
  const bzTicks = [...bzSvg.matchAll(/<text[^>]*y="163"[^>]*>(\d{2}:\d{2})<\/text>/g)].map(m => m[1]);
  assert.deepEqual(bzTicks, ['22:30', '23:00', '23:30'], `Expected uniform 30-min ticks, got ${JSON.stringify(bzTicks)}`);
  assert.equal(api.utcTagToLocalHM('2026-11-23T20:59:00', 'Europe/Oslo', 60), '22:59');

  // Chart 2: 12-hour forecast -> strictly uniform 2-hour HH:00 ticks even when bestIdx & selectedIdx are odd!
  const hrs = Array.from({ length: 12 }, (_, i) => ({
    time: `${String((22 + i) % 24).padStart(2, '0')}:00`,
    clear: i === 3 ? 90 : 50,
    block: i === 3 ? 10 : 50,
    score: i === 3 ? 72 : 30,
    temp: -2,
    isDay: false
  }));
  const waveSvg = api.buildSkyWaveSVG(hrs, hrs[3], 5, 'zh'); // bestIdx=3 (odd), selectedIdx=5 (odd)
  assert.ok(waveSvg.includes('<polyline') && !waveSvg.includes('NaN') && !waveSvg.includes('undefined'));
  const waveTicks = [...waveSvg.matchAll(/<text[^>]*y="170"[^>]*>(\d{2}:\d{2})<\/text>/g)].map(m => m[1]);
  assert.deepEqual(waveTicks, ['22:00', '00:00', '02:00', '04:00', '06:00', '08:00'], `Expected strict 2-hour ticks, got ${JSON.stringify(waveTicks)}`);

  const dirs = [
    { key: 'here', label: '📍 目前位置', lat: 69.97, lon: 23.27, avg3h: 80, isOcean: false },
    { key: 'N', label: '⬆️ 往東北 Skaidi', lat: 70.43, lon: 24.50, avg3h: 25, isOcean: false },
    { key: 'E', label: '➡️ 往東 Lakselv', lat: 70.05, lon: 24.97, avg3h: 50, isOcean: false },
    { key: 'S', label: '⬇️ 往南 Kautokeino', lat: 69.01, lon: 23.04, avg3h: 70, isOcean: false },
    { key: 'W', label: '⬅️ 往西 Burfjord', lat: 69.94, lon: 22.05, avg3h: 90, isOcean: false }
  ];
  const radarSvg = api.buildCompassRadarSVG(dirs, { lat: 69.97, lon: 23.27 }, 'zh');
  assert.ok(radarSvg.includes('Skaidi') && !radarSvg.includes('NaN') && !radarSvg.includes('undefined'));
});

test('13. Wording consistency audit: zero awkward legacy labels remain in index.html', () => {
  const forbidden = ['此刻抵地', '已抵地球', '天空清朗', '看見指數', '天黑暗空', '貼LINE', '極光視覺', '視覺總覽', '熱呼呼的晚餐'];
  for (const term of forbidden) {
    assert.ok(!html.includes(term), `Legacy awkward term "${term}" still appears in index.html`);
  }
});

test('14. Live API end-to-end smoke test (enabled with LIVE_TEST=1)', { skip: process.env.LIVE_TEST !== '1' }, async () => {
  const hdrs = { 'User-Agent': 'nordic-aurora-radar-test/1.0' };
  const [mag, wind, kp1m, ov, hpi, goes, kpfc, met, om] = await Promise.all([
    fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt', { headers: hdrs }).then(r => r.text()),
    fetch('https://services.swpc.noaa.gov/json/goes/primary/magnetometers-6-hour.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { headers: hdrs }).then(r => r.json()),
    fetch('https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=69.9689&lon=23.2716', { headers: hdrs }).then(r => r.json()),
    fetch('https://api.open-meteo.com/v1/forecast?latitude=64.1466&longitude=-21.9426&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation&timezone=auto&forecast_days=2', { headers: hdrs }).then(r => r.json())
  ]);

  const magS = api.parseMagSeries(mag, 180);
  const windS = api.parseWindSeries(wind, 180);
  const kpObj = api.parseLatestKp(kp1m);
  const ovAlta = api.lookupOvationProb(ov, 69.9689, 23.2716);
  const hpiObj = api.parseHemiPower(hpi, 69.9689);
  const goesSub = api.parseGoesSubstorm(goes);
  const kpFcList = api.parseKpForecast(kpfc);
  const met12 = api.parseMetNorwayHourly12(met, 69.9689, 23.2716, 'Europe/Oslo', new Date());
  const om12 = api.parseOpenMeteoHourly12(om.hourly, 64.1466, -21.9426, om.timezone, new Date(), om.utc_offset_seconds);

  assert.ok(magS.length > 0, 'NOAA RTSW mag parsed');
  assert.ok(windS.length > 0, 'NOAA RTSW wind parsed');
  assert.ok(kpObj && Number.isFinite(kpObj.kp), 'NOAA 1m Kp parsed');
  assert.ok(Number.isFinite(ovAlta), 'NOAA OVATION Alta parsed');
  assert.ok(hpiObj && Number.isFinite(hpiObj.gw), 'NOAA HPI parsed');
  assert.ok(goesSub && Number.isFinite(goesSub.latestHp), 'NOAA GOES magnetometer parsed');
  assert.ok(kpFcList.length > 10, 'NOAA 72h Kp forecast parsed');
  assert.equal(met12.length, 12, 'MET Norway 12h parsed');
  assert.equal(om12.length, 12, 'Open-Meteo 12h parsed');

  const bal = api.computeBallisticCoupling(magS, windS);
  const sc = api.computeAuroraScore({
    lat: 69.9689, lon: 23.2716, cloudNow: met12[0].block,
    sunAlt: api.computeSolarElevation(new Date(), 69.9689, 23.2716),
    bz: bal.nowBz, speed: windS[windS.length - 1].speed, kp: kpObj.kp,
    ovation: ovAlta, hpiGw: hpiObj.gw, newell: bal.nowNewell
  });
  assert.ok(sc.total >= 0 && sc.total <= 99, `Live Alta score out of range: ${sc.total}`);
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
    // 1. Broad daylight must ALWAYS return 0; auroral/sub-auroral cities must say Too Bright (not Oval North/South)
    const day = api.computeAuroraScore({ lat, lon, cloudNow: 0, sunAlt: 15, bz: -1, speed: 350, kp: 1, ovation: 0 });
    assert.equal(day.total, 0, `${name} daylight must be 0`);
    if (tier === 'oval' || tier === 'sub' || tier === 'polar') {
      assert.equal(day.grade, '☀️ 天色過亮', `${name} in daylight should show Too Bright, got ${day.grade}`);
    }
    if (tier === 'low') {
      assert.equal(day.outOfZone, 'low-lat', `${name} must be low-lat`);
    }

    // 2. G1 storm (Kp 5, clear dark night) must NEVER miss oval or sub-auroral cities (incl. Hobart/NZ/Oslo/Banff!)
    const g1 = api.computeAuroraScore({
      lat, lon, cloudNow: 10, sunAlt: -25, bz: -7, speed: 550, kp: 5,
      ovation: tier === 'oval' ? 75 : (tier === 'sub' ? 35 : 0),
      hpiGw: 65, newell: 8500, mlt: 0.5, effMoonPct: 0
    });
    if (tier === 'oval') assert.ok(g1.total >= 65, `${name} G1 should be >=65, got ${g1.total}`);
    if (tier === 'sub') assert.ok(g1.total >= 40, `${name} G1 should be >=40 (no missed G1!), got ${g1.total}`);
    if (tier === 'low') assert.equal(g1.total, 0, `${name} G1 must stay 0`);

    // 3. G4 severe storm (Kp 8, clear dark night) must alert mid-lat & storm cities (London, Berlin, Sapporo, Melbourne, Ushuaia)
    const g4 = api.computeAuroraScore({
      lat, lon, cloudNow: 10, sunAlt: -25, bz: -18, speed: 750, kp: 8,
      ovation: tier === 'low' ? 0 : 35,
      hpiGw: 140, newell: 22000, mlt: 0.5, effMoonPct: 0
    });
    if (tier !== 'low') assert.ok(g4.total >= 40, `${name} G4 should be >=40, got ${g4.total}`);
    else assert.equal(g4.total, 0, `${name} G4 must stay 0`);
  }
});
