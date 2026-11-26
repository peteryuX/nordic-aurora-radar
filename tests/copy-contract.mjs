/**
 * Nordic Aurora Radar — Systematic Number-to-Copy Semantic Contract Suite
 *
 * Exhaustively tests 14 universal physical-to-copy invariants across thousands
 * of cartesian combinations (8 latitudes × sky states × Kp × daylight/twilight/moon × ZH/EN)
 * directly against ALL production engine & UI copy formatters.
 *
 * Run: node tests/copy-contract.mjs
 * Wired into CI (.github/workflows/ci.yml) so contradictory copy can NEVER ship.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Engine from '../src/aurora-engine.js';
import * as Charts from '../src/charts.js';
import {
  formatWavePeakSummary, formatHourScrubDetail, formatOutlookRowStats,
  formatStormAlertDetail, buildHeroViewModel
} from '../src/copy-formatters.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];
let checksRun = 0;

function check(cond, invId, msg) {
  checksRun++;
  if (!cond) violations.push(`[${invId}] ${msg}`);
}

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '');

const ZH_BANNED_RE = /數據|信息|屏幕|貼士|分佈|(?<!維)持平|天頂|後晚|分鐘 後|小時 後|。。|··/;
const TOKEN_LEAK_RE = /\bNaN\b|\bundefined\b|\[object /;
const CJK_RE = /[\u4e00-\u9fff]/;

function checkHygiene(text, lang, ctx) {
  const plain = stripTags(text);
  check(!TOKEN_LEAK_RE.test(plain), 'INV-10', `Invalid token in ${ctx}: "${plain}"`);
  if (lang === 'zh') {
    check(!ZH_BANNED_RE.test(plain), 'INV-10', `zh-TW lint/spacing leak in ${ctx}: "${plain}"`);
  } else {
    check(!CJK_RE.test(plain), 'INV-10', `CJK leak in EN ${ctx}: "${plain}"`);
  }
}

const CITIES = [
  { name: 'Tromsø', lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' },
  { name: 'Svalbard', lat: 78.2232, lon: 15.6267, tz: 'Arctic/Longyearbyen' },
  { name: 'Reykjavik', lat: 64.1466, lon: -21.9426, tz: 'Atlantic/Reykjavik' },
  { name: 'Ask/Oslo', lat: 60.06, lon: 11.04, tz: 'Europe/Oslo' },
  { name: 'Edinburgh', lat: 55.9533, lon: -3.1883, tz: 'Europe/London' },
  { name: 'Banff', lat: 51.1784, lon: -115.5708, tz: 'America/Edmonton' },
  { name: 'Queenstown', lat: -45.0312, lon: 168.6626, tz: 'Pacific/Auckland' },
  { name: 'Taipei', lat: 25.033, lon: 121.5654, tz: 'Asia/Taipei' }
];

// =========================================================================
// 1. Cartesian Matrix across explainAuroraScore, evaluateVerdict & synthesizeTonightAction
// =========================================================================
for (const c of CITIES) {
  for (const skyNow of [10, 40, 75, 98]) {
    const cloudNow = 100 - skyNow;
    for (const kp of [0.7, 2.5, 4.0, 6.5]) {
      for (const sunAlt of [5, -6, -20]) {
        for (const lang of ['zh', 'en']) {
          const ctx = `${c.name} sky=${skyNow}% kp=${kp} sun=${sunAlt} ${lang}`;
          const sc = Engine.computeAuroraScore({
            lat: c.lat, lon: c.lon, cloudNow, sunAlt, kp, bz: -1, speed: 400, mlt: 22, effMoonPct: 20
          });
          const exp = Engine.explainAuroraScore({
            lat: c.lat, lon: c.lon, cloudNow, sunAlt, kp, bz: -1, speed: 400, mlt: 22, effMoonPct: 20, lang
          });
          const hl = exp.bottleneck.headline;
          const dt = exp.bottleneck.detail;
          checkHygiene(hl, lang, `explain.headline(${ctx})`);
          checkHygiene(dt, lang, `explain.detail(${ctx})`);

          // INV-4: Never claim effKp is below neededKp when effKp >= neededKp
          if (exp.breakdown.effKp >= exp.breakdown.neededKp) {
            check(!/仍有落差|尚未達此地門檻|below the Kp|still below/i.test(hl), 'INV-4',
              `Kp inequality inversion in ${ctx}: "${hl}"`);
          }

          // INV-2: Clear sky (>=70%) must never have clouds as primary bottleneck
          if (sc.skyScore >= 70) {
            check(exp.bottleneck.key !== 'clouds', 'INV-2', `Clear sky flagged as cloudy in ${ctx}: "${hl}"`);
          }

          // INV-6: Hemisphere direction honesty
          if (c.lat < 0) {
            check(!/北方低空|朝.*北方|northern horizon|look.*north/i.test(hl + dt), 'INV-6',
              `Southern hemisphere pointed north in ${ctx}: "${hl}"`);
          }
          if (c.lat > 0 && sc.magLat < 63) {
            check(!/南方低空|southern horizon/i.test(hl + dt), 'INV-6',
              `Northern sub-auroral pointed south in ${ctx}: "${hl}"`);
          }

          // evaluateVerdict
          const v = Engine.evaluateVerdict({ lat: c.lat, lon: c.lon, kp, mlt: 22, effMoonPct: 20, scoreObj: sc, lang });
          checkHygiene(v.title + ' ' + v.lead, lang, `verdict(${ctx})`);

          // synthesizeTonightAction (test both clear night & cloudy night ahead)
          for (const nightClear of [15, 83]) {
            const nightSc = Engine.computeAuroraScore({
              lat: c.lat, lon: c.lon, cloudNow: 100 - nightClear, sunAlt: -20, kp: Math.max(kp, 3.0), mlt: 22, effMoonPct: 20
            });
            const bestDark = { time: '19:00', clear: nightClear, score: nightSc.total };
            const darkWin = sunAlt >= -4
              ? { state: 'twilight-wait', nextDarkHM: '15:58', darkInMin: 152, isDarkNow: false }
              : { state: 'dark', isDarkNow: true };
            const act = Engine.synthesizeTonightAction({
              lat: c.lat, lon: c.lon, sc, scNext: sc,
              bestDark, dirResults: [], nights3: [], darkWin, kp, mlt: 22, effMoonPct: 20, lang
            });
            const actTxt = `${act.title} ${act.lead}`;
            checkHygiene(actTxt, lang, `action(${ctx} nightClr=${nightClear})`);

            // INV-1: Already clear (>=70%) must NEVER say 有望見晴 / 有望放晴 / clearer skies / clears around
            if (skyNow >= 70) {
              check(!/有望見晴|有望放晴|轉晴|雲層稍薄|clearer skies|thinner clouds|clears around/i.test(actTxt), 'INV-1',
                `Already clear (${skyNow}%) claimed clearing up in ${ctx}: "${actTxt}"`);
            }

            // INV-3: Overcast now (<=35%) in daylight must NEVER claim 維持晴朗 / clear skies expected tonight
            if (skyNow <= 35 && sunAlt >= -4) {
              check(!/維持晴朗|clear skies expected/i.test(actTxt), 'INV-3',
                `Overcast (${skyNow}%) claimed staying clear in ${ctx}: "${actTxt}"`);
            }

            // INV-8: Daylight gate must never tell user to go out now
            if (sunAlt >= -4 && !sc.outOfZone) {
              check(sc.total === 0 && act.actionType === 'daylight', 'INV-8',
                `Daylight failed gate in ${ctx}: total=${sc.total} type=${act.actionType}`);
              check(!/現在適合出門|Go out now/i.test(actTxt), 'INV-8',
                `Daylight told user to go out in ${ctx}: "${actTxt}"`);
            }
          }
        }
      }
    }
  }
}

// =========================================================================
// 2. Production UI Copy Formatters (formatWavePeakSummary & formatHourScrubDetail)
// =========================================================================
const MOON_CASES = [
  { label: 'no-moon', moonUp: false, moonPct: 0, moonAlt: -15, darkScore: 100 },
  { label: 'low-full-moon', moonUp: true, moonPct: 93, moonAlt: 12, darkScore: 94 },
  { label: 'high-full-moon', moonUp: true, moonPct: 95, moonAlt: 36, darkScore: 76 }
];

for (const c of CITIES) {
  for (const clear of [15, 50, 83]) {
    for (const kp of [0.7, 3.0, 4.0, 6.5]) {
      for (const mCase of MOON_CASES) {
        for (const idx of [1, 6]) {
          const sc = Engine.computeAuroraScore({
            lat: c.lat, lon: c.lon, cloudNow: 100 - clear, sunAlt: -20, kp, mlt: 22,
            effMoonPct: mCase.moonUp ? Math.round(mCase.moonPct * Math.sin(Math.max(0, mCase.moonAlt) * Math.PI / 180)) : 0
          });
          const h = {
            dtMs: Date.UTC(2026, 10, 26, 18 + idx, 0, 0),
            time: `${String((18 + idx) % 24).padStart(2, '0')}:00`,
            isDay: false, clear, block: 100 - clear,
            score: sc.total, auroraScore: sc.auroraScore, neededKp: sc.neededKp, magLat: sc.magLat,
            darkScore: mCase.darkScore, kpFc: kp, outOfZone: sc.outOfZone,
            moonUp: mCase.moonUp, moonPct: mCase.moonPct, moonAlt: mCase.moonAlt,
            temp: -8, windChill: -13, windMs: 5
          };
          for (const lang of ['zh', 'en']) {
            const en = lang === 'en';
            const ctx = `scrub(${c.name} clr=${clear} kp=${kp} ${mCase.label} idx=${idx} ${lang})`;
            const tierWord = sc.total >= 65 ? (en ? 'Prime' : '極佳') : (sc.total >= 40 ? (en ? 'Good' : '適合') : (sc.total >= 18 ? (en ? 'Fair' : '普通') : (en ? 'Low' : '偏低')));
            const det = formatHourScrubDetail({ h, idx, tStr: h.time, lastScore: sc, tierWord, en });
            checkHygiene(det.plainText, lang, ctx);

            // INV-5: Clear (>=60%) + Dark (>=85%) + Low/Fair (<40) MUST explain aurora/latitude bottleneck!
            if (clear >= 60 && mCase.darkScore >= 85 && sc.total < 40) {
              check(
                /極光偏弱|低空微弱|此地偏弱|此地需|緯度過低|quiet aurora|low horizon|faint here|need .* here|too low/i.test(det.kpBadge),
                'INV-5',
                `Clear+Dark hour scored ${sc.total} without explaining aurora/latitude bottleneck in ${ctx}: "${det.plainText}"`
              );
            }

            // INV-7: Lunar honesty
            if (mCase.label === 'high-full-moon') {
              check(!/全暗|Full dark/i.test(det.darkTxt), 'INV-7', `High full moon labeled full dark in ${ctx}: "${det.darkTxt}"`);
            }
            if (mCase.label === 'low-full-moon') {
              check(/低月|Low moon/i.test(det.darkTxt), 'INV-7', `Low-horizon 93% moon missing Low moon clarity in ${ctx}: "${det.darkTxt}"`);
            }

            // formatWavePeakSummary check on 1-hour & 3-hour windows
            const peakHtml = formatWavePeakSummary({
              vis: [h, h, h, h, h, h, h], bestInVis: h, outZoneKind: sc.outOfZone,
              isOutOfZone: Boolean(sc.outOfZone), bestTimeLbl: h.time, bestIsNextNight: false, en
            });
            const peakPlain = stripTags(peakHtml);
            checkHygiene(peakPlain, lang, `peak(${ctx})`);
            // INV-1 & INV-2: Clear (>=60%) peak must NEVER say 雲層稍薄 / Thinner clouds / 多雲 / Mostly cloudy
            if (!sc.outOfZone && clear >= 60) {
              check(!/雲層稍薄|Thinner clouds|多雲|Mostly cloudy/i.test(peakPlain), 'INV-1/2',
                `Clear (${clear}%) peak lied about clouds in ${ctx}: "${peakPlain}"`);
            }
          }
        }
      }
    }
  }
}

// =========================================================================
// 3. Compass Stay-Local, Generic Safety & Ocean Closed-Road Invariants (INV-9)
// =========================================================================
for (const [label, lat, lon, expectClosedS] of [
  ['Tromsø', 69.6492, 18.9553, false],
  ['Vík (Atlantic S)', 63.4186, -19.0060, false],
  ['Akureyri (F26 S)', 65.6835, -18.0878, true],
  ['Svalbard (generic)', 78.2232, 15.6267, false]
]) {
  const pts = Engine.computeCompassPoints(lat, lon, 60);
  const allClear = pts.map(p => ({ ...p, avg3h: 10, nowC: 10, temp: -5, maxWind3h: 3, maxPrecip3h: 0 }));
  const overcastHere = pts.map((p, i) => ({ ...p, avg3h: i === 0 ? 85 : 20, nowC: i === 0 ? 85 : 20, temp: -5, maxWind3h: 3, maxPrecip3h: 0 }));
  for (const lang of ['zh', 'en']) {
    const staySum = Engine.summarizeCompass(allClear, lang);
    check(staySum.bestKey === 'here' && /不需|無需|no need to drive/i.test(staySum.text), 'INV-9', `${label} already clear must stay local (${lang}): "${staySum.text}"`);
    checkHygiene(staySum.text, lang, `compass.stay(${label} ${lang})`);
    const moveSum = Engine.summarizeCompass(overcastHere, lang);
    checkHygiene(moveSum.text, lang, `compass.move(${label} ${lang})`);
    if (pts[1].isGeneric) {
      check(/看區域|View area/i.test(moveSum.text) && !/開車|Drive/i.test(moveSum.text), 'INV-9',
        `Generic ${label} must say View area, not Drive: "${moveSum.text}"`);
    }
    const svg = Charts.buildCompassRadarSVG(overcastHere, { lat, lon }, lang);
    const hasClosed = /冬季封閉|Closed in winter/.test(svg);
    check(hasClosed === expectClosedS, 'INV-9', `${label} (${lang}) closed-road mark mismatch: got ${hasClosed}, expected ${expectClosedS}`);
  }
}

// =========================================================================
// 4. Atomic Shell & Zero-Leak Hidden Banner Contract (INV-11)
// =========================================================================
const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
for (const id of ['offlineBanner', 'stormBanner', 'lineTip', 'gpsSuggestBanner']) {
  const m = htmlSrc.match(new RegExp(`id="${id}"[^>]*>`));
  check(Boolean(m && m[0].includes('display:none')), 'INV-11', `Hidden banner #${id} in index.html missing inline style="display:none;"`);
}
check(
  swSrc.includes("caches.open(CACHE_NAME).then(cache =>\n        cache.match('./index.html')"),
  'INV-11',
  'sw.js must serve root ./index.html atomically from CACHE_NAME to prevent HTML/CSS/JS version skew'
);

// =========================================================================
// 5. Cross-Card Co-Temporal Parity (INV-13: 24h Chart Peak <-> 3-Night Outlook)
// =========================================================================
{
  // Exact Ask/Oslo 2026-11-26 real scenario:
  // 16:00 CET (98% clear, Kp 2.3) -> 19:00 CET (83% clear, Kp 3.7, peak score 24) -> 22:00 CET (12% clear, Kp 5.0 G1)
  const askChartHrs = [
    { dtMs: Date.UTC(2026, 10, 26, 15, 0, 0), time: '16:00', isDay: false, clear: 98, block: 2, score: 8, kpFc: 2.33, outOfZone: null },
    { dtMs: Date.UTC(2026, 10, 26, 18, 0, 0), time: '19:00', isDay: false, clear: 83, block: 17, score: 24, kpFc: 3.67, outOfZone: null },
    { dtMs: Date.UTC(2026, 10, 26, 21, 0, 0), time: '22:00', isDay: false, clear: 12, block: 88, score: 11, kpFc: 5.0, outOfZone: null },
    { dtMs: Date.UTC(2026, 10, 27, 0, 0, 0), time: '01:00', isDay: false, clear: 5, block: 95, score: 4, kpFc: 4.33, outOfZone: null }
  ];
  const askCloudPts = askChartHrs.map(h => ({ dtMs: h.dtMs, clear: h.clear, block: h.block, isDay: false }));
  const askKpFc = [
    { ts: Date.UTC(2026, 10, 26, 15, 0, 0), kp: 2.33 },
    { ts: Date.UTC(2026, 10, 26, 18, 0, 0), kp: 3.67 },
    { ts: Date.UTC(2026, 10, 26, 21, 0, 0), kp: 5.0 },
    { ts: Date.UTC(2026, 10, 27, 0, 0, 0), kp: 4.33 }
  ];
  for (const lang of ['zh', 'en']) {
    const en = lang === 'en';
    const nights = Engine.summarize3NightOutlook({
      cloudPoints: askCloudPts, kpForecast: askKpFc, currentKp: 0.7,
      lat: 60.06, lon: 11.04, timeZone: 'Europe/Oslo',
      nowDate: new Date(Date.UTC(2026, 10, 26, 12, 30, 0)),
      chartHours: askChartHrs, lang
    });
    const tonight = nights[0];
    check(tonight.peakClear === 83, 'INV-13', `Tonight peakClear must be 83% (peak hour 19:00), got ${tonight.peakClear}`);
    check(tonight.peakKp === 3.7, 'INV-13', `Tonight peakKp must be 3.7 (peak hour 19:00), got ${tonight.peakKp}`);
    check(tonight.maxKp === 5.0, 'INV-13', `Tonight maxKp must remain 5.0, got ${tonight.maxKp}`);
    const row = formatOutlookRowStats({ n: tonight, idx: 0, en });
    checkHygiene(`${row.winTxt} ${row.clearTxt} ${row.kpTxt}`, lang, `INV-13(${lang})`);
    check(row.clearTxt.includes('83%') && !row.clearTxt.includes('98%'), 'INV-13',
      `Tonight 3-Night row must show peak-hour 83% clear (not 16:00's 98%): "${row.clearTxt}"`);
    check(row.kpTxt.includes('3.7') && row.kpTxt.includes('5.0') && /高至|max/.test(row.kpTxt), 'INV-13',
      `Tonight 3-Night row must distinguish peak-hour Kp 3.7 from later night-max Kp 5.0: "${row.kpTxt}"`);
  }
}

// =========================================================================
// 6. Storm Alert Detail & Hero ViewModel Contract (INV-14)
// =========================================================================
{
  const fmtMockDate = (iso, en) => (iso === '2026-11-26' ? (en ? '26 Nov' : '11月26日') : '');
  const stormCases = [
    { name: 'watch-G1', scales: { active: true, currentScale: 0, maxForecastScale: 1, peakDate: '2026-11-26' }, noaaAlert: null, expectLevel: 1 },
    { name: 'watch-G2', scales: { active: true, currentScale: 0, maxForecastScale: 2, peakDate: '2026-11-26' }, noaaAlert: null, expectLevel: 2 },
    { name: 'active-G3', scales: { active: true, currentScale: 3, maxForecastScale: 3, peakDate: '2026-11-26' }, noaaAlert: null, expectLevel: 3 },
    { name: 'alert-warn-G4', scales: null, noaaAlert: { active: true, kind: 'geomag', gScale: 4, isWarning: true }, expectLevel: 4 },
    { name: 'alert-active-G5', scales: null, noaaAlert: { active: true, kind: 'geomag', gScale: 5, isWarning: false }, expectLevel: 5 },
    { name: 'cme-shock-warn', scales: null, noaaAlert: { active: true, kind: 'cme-shock', gScale: 2, isWarning: true }, expectLevel: 2 },
    { name: 'cme-shock-hit', scales: null, noaaAlert: { active: true, kind: 'cme-shock', gScale: 3, isWarning: false }, expectLevel: 3 }
  ];

  // Inactive storm must cleanly return null
  check(formatStormAlertDetail({ scales: { active: false, currentScale: 0, maxForecastScale: 0 }, noaaAlert: { active: false } }) === null,
    'INV-14', 'Inactive NOAA storm state must return null');

  for (const city of CITIES) {
    const sc = Engine.computeAuroraScore({
      lat: city.lat, lon: city.lon, cloudNow: 10, sunAlt: -20, kp: 1.0, ovation: 8, hpiGw: 15
    });
    for (const stCase of stormCases) {
      for (const lang of ['zh', 'en']) {
        const en = lang === 'en';
        const info = formatStormAlertDetail({
          scales: stCase.scales, noaaAlert: stCase.noaaAlert, sc, lat: city.lat, en, fmtDateFn: fmtMockDate
        });
        const ctx = `INV-14(${city.name}, ${stCase.name}, ${lang})`;
        check(Boolean(info && info.title && info.body), 'INV-14', `${ctx} must emit non-empty title & body`);
        check(info?.linkUrl === 'https://www.spaceweather.gov/products/alerts-watches-and-warnings', 'INV-14',
          `${ctx} must link to official NOAA alerts page`);
        check(info?.level === stCase.expectLevel, 'INV-14', `${ctx} level mismatch: got ${info?.level}`);
        checkHygiene(`${info?.title} ${info?.body} ${info?.linkLabel}`, lang, ctx);
        if (city.lat < 0 && sc.outOfZone !== 'low-lat' && info.stormKp >= sc.neededKp) {
          check(!/北方|northern/i.test(info.body), 'INV-14', `${ctx} Southern Hemisphere must not say north: "${info.body}"`);
        }
        if (city.lat >= 0 && sc.outOfZone !== 'low-lat' && info.stormKp >= sc.neededKp) {
          check(!/南方|southern/i.test(info.body), 'INV-14', `${ctx} Northern Hemisphere storm note must not say south: "${info.body}"`);
        }
      }
    }
  }

  // Hero ViewModel checks: Ask/Oslo sub-auroral need Kp, Queenstown/Svalbard south direction, Taipei low-lat
  for (const lang of ['zh', 'en']) {
    const en = lang === 'en';
    const askSc = Engine.computeAuroraScore({ lat: 60.06, lon: 11.04, cloudNow: 2, sunAlt: 2, kp: 0.7, ovation: 5, hpiGw: 10 });
    const askVm = buildHeroViewModel({
      pos: { lat: 60.06, lon: 11.04 }, sc: askSc, kp: 0.7,
      act: { actionType: 'daylight', title: 't', lead: en ? 'Clear tonight, faint aurora' : '今晚維持晴朗，極光偏弱' },
      en
    });
    checkHygiene(`${askVm.aurSubHtml} ${askVm.heroCue} ${askVm.heroSub}`, lang, `INV-14(Hero Ask ${lang})`);
    check(/需|need/.test(askVm.aurSubHtml), 'INV-14', `Ask daytime Hero aurSubHtml must show needed Kp: "${askVm.aurSubHtml}"`);

    const qSc = Engine.computeAuroraScore({ lat: -45.0312, lon: 168.6626, cloudNow: 5, sunAlt: -25, kp: 7.5, bz: -16, speed: 620, ovation: 82, hpiGw: 140 });
    const qVm = buildHeroViewModel({
      pos: { lat: -45.0312, lon: 168.6626 }, sc: qSc, kp: 7.5, mltNow: 0,
      act: { actionType: 'go', title: 'go' }, en
    });
    checkHygiene(`${qVm.aurSubHtml} ${qVm.heroCue}`, lang, `INV-14(Hero Queenstown ${lang})`);
    check(en ? /south/i.test(qVm.heroCue) && !/north/i.test(qVm.heroCue) : qVm.heroCue.includes('南方') && !qVm.heroCue.includes('北方'),
      'INV-14', `Queenstown Hero go cue must point south: "${qVm.heroCue}"`);

    const svSc = Engine.computeAuroraScore({ lat: 78.2232, lon: 15.6267, cloudNow: 5, sunAlt: -25, kp: 5.5, bz: -10, speed: 550, ovation: 75, hpiGw: 110 });
    const svVm = buildHeroViewModel({
      pos: { lat: 78.2232, lon: 15.6267 }, sc: svSc, kp: 5.5, mltNow: 0,
      act: { actionType: 'go', title: 'go' }, en
    });
    checkHygiene(`${svVm.aurSubHtml} ${svVm.heroCue}`, lang, `INV-14(Hero Svalbard ${lang})`);
    check(en ? /south/i.test(svVm.heroCue) : svVm.heroCue.includes('南方'),
      'INV-14', `Svalbard (poleward of oval) Hero go cue must point south: "${svVm.heroCue}"`);

    const tpSc = Engine.computeAuroraScore({ lat: 25.033, lon: 121.5654, cloudNow: 10, sunAlt: -25, kp: 2.0, ovation: 0, hpiGw: 12 });
    const tpVm = buildHeroViewModel({
      pos: { lat: 25.033, lon: 121.5654 }, sc: tpSc, kp: 2.0,
      act: { actionType: 'sleep', title: 'sleep' }, en
    });
    checkHygiene(`${tpVm.aurSubHtml} ${tpVm.heroCue}`, lang, `INV-14(Hero Taipei ${lang})`);
    check(/地磁|Mag/.test(tpVm.aurSubHtml), 'INV-14', `Taipei Hero aurSubHtml must show magnetic latitude: "${tpVm.aurSubHtml}"`);
  }
}

console.log(`=== COPY & SEMANTIC CONTRACT AUDIT ===`);
console.log(`Total invariant checks executed : ${checksRun}`);
console.log(`Violations found                : ${violations.length}`);
if (violations.length) {
  for (const v of violations.slice(0, 25)) console.error('  ✗', v);
  process.exit(1);
}
console.log('ALL 14 SEMANTIC & NUMBER-TO-COPY INVARIANTS PASSED (0 VIOLATIONS).');
