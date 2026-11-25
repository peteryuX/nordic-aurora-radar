#!/usr/bin/env node
/**
 * Nordic Aurora Radar — Real-App End-to-End Headless Browser Regression Suite
 *
 * Unlike static mock HTML tests, this harness serves the ACTUAL production index.html,
 * styles.css, src/app.js, src/data-client.js, src/aurora-engine.js, and src/charts.js
 * in headless Chrome with deterministic real-world adversarial API fixtures, asserting
 * semantic truth + layout invariants directly on the real rendered DOM.
 *
 * Run: node tests/e2e-real-app.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(b => {
  try { execFileSync('which', [b], { stdio: 'pipe' }); return true; } catch { return false; }
});
if (!chrome) {
  console.error('ERROR: No Chrome/Chromium binary available for real-app E2E tests.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

/** Build deterministic fetch stub + Date freeze script for a given scenario */
function buildInterceptorScript(sc) {
  return `<script>
(() => {
  // Freeze wall-clock deterministically & disable recurring background intervals during deterministic E2E boot
  window.setInterval = () => 0;
  const FIXED_MS = ${sc.nowMs};
  const OrigDate = Date;
  class MockDate extends OrigDate {
    constructor(...args) {
      if (args.length === 0) super(FIXED_MS);
      else super(...args);
    }
    static now() { return FIXED_MS; }
  }
  MockDate.UTC = OrigDate.UTC;
  MockDate.parse = OrigDate.parse;
  window.Date = MockDate;

  // Deterministic root font & per-iframe isolated storage shim (avoid clobbering shared localStorage across parallel iframes)
  document.documentElement.style.fontSize = '${sc.rootPx || 17}px';
  const _memStore = new Map([['aurora_lang_v4', ${JSON.stringify(sc.lang || 'zh')}]]);
  try {
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (k) => (_memStore.has(k) ? _memStore.get(k) : null),
        setItem: (k, v) => _memStore.set(String(k), String(v)),
        removeItem: (k) => _memStore.delete(String(k)),
        clear: () => _memStore.clear()
      },
      configurable: true
    });
  } catch {}
  if (navigator.serviceWorker) {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true });
  }

  const SC = ${JSON.stringify(sc)};

  function makeMetSeries(baseMs, cloudFn, tempC = -1.2) {
    const out = [];
    for (let h = 0; h < 72; h++) {
      const ts = baseMs + h * 3600000;
      const cld = cloudFn(h, ts);
      out.push({
        time: new OrigDate(ts).toISOString().replace(/\\.000Z$/, 'Z'),
        data: {
          instant: {
            details: {
              air_temperature: tempC,
              wind_speed: 3.4,
              cloud_area_fraction: cld,
              cloud_area_fraction_low: cld,
              cloud_area_fraction_medium: 0,
              cloud_area_fraction_high: 0,
              fog_area_fraction: 0
            }
          },
          next_1_hours: { details: { precipitation_amount: 0 } }
        }
      });
    }
    return { properties: { meta: { updated_at: new OrigDate(FIXED_MS - 600000).toISOString() }, timeseries: out } };
  }

  function makeOmPoint(baseMs, cloudFn, tz, utcOff, tempC = -1.0, curCloud = null) {
    const time = [], cloud = [], low = [], mid = [], high = [], temp = [], wind = [], precip = [], wc = [], vis = [];
    for (let h = 0; h < 72; h++) {
      const ts = baseMs + h * 3600000;
      const cld = cloudFn(h, ts);
      time.push(Math.floor(ts / 1000));
      cloud.push(cld); low.push(cld); mid.push(0); high.push(0);
      temp.push(tempC); wind.push(10); precip.push(0); wc.push(cld > 80 ? 3 : 1); vis.push(15000);
    }
    const baseObj = {
      timezone: tz,
      utc_offset_seconds: utcOff,
      current: {
        time: Math.floor((FIXED_MS - 600000) / 1000),
        interval: 900,
        cloud_cover: curCloud !== null ? curCloud : cloud[0],
        temperature_2m: tempC,
        wind_speed_10m: 10,
        precipitation: 0,
        weather_code: (curCloud !== null ? curCloud : cloud[0]) > 80 ? 3 : 1
      },
      hourly: {
        time,
        temperature_2m: temp,
        wind_speed_10m: wind,
        cloud_cover: cloud,
        cloud_cover_low: low,
        cloud_cover_mid: mid,
        cloud_cover_high: high,
        precipitation: precip,
        weather_code: wc,
        visibility: vis,
        cloud_cover_best_match: cloud,
        cloud_cover_low_best_match: low,
        cloud_cover_mid_best_match: mid,
        cloud_cover_high_best_match: high,
        cloud_cover_ecmwf_ifs025: cloud,
        cloud_cover_low_ecmwf_ifs025: low,
        cloud_cover_mid_ecmwf_ifs025: mid,
        cloud_cover_high_ecmwf_ifs025: high
      }
    };
    return baseObj;
  }

  const baseHourMs = Math.floor(FIXED_MS / 3600000) * 3600000;
  const kp1mRows = SC.kp1mZeroRollover
    ? [
        { time_tag: '2026-11-25T17:58:00', estimated_kp: 1.0, kp_index: 1 },
        { time_tag: '2026-11-25T17:59:00', estimated_kp: 1.0, kp_index: 1 },
        ...Array.from({ length: 23 }, (_, m) => ({
          time_tag: '2026-11-25T18:' + String(m).padStart(2, '0') + ':00', estimated_kp: 0, kp_index: 0
        }))
      ]
    : [{ time_tag: new OrigDate(FIXED_MS - 120000).toISOString().slice(0, 19), estimated_kp: SC.kpNow ?? 1.0, kp_index: Math.round(SC.kpNow ?? 1.0) }];

  const kpFcRows = [
    ['time_tag', 'kp', 'observed', 'noaa_scale'],
    ...(SC.kpForecast || [
      ['2026-11-25 18:00:00', String(SC.kpNow ?? 1.0), 'estimated', null],
      ['2026-11-25 21:00:00', '4.00', 'predicted', null],
      ['2026-11-26 15:00:00', '2.67', 'predicted', null],
      ['2026-11-26 18:00:00', '2.67', 'predicted', null],
      ['2026-11-26 21:00:00', '5.00', 'predicted', 'G1'],
      ['2026-11-27 00:00:00', '5.00', 'predicted', 'G1'],
      ['2026-11-27 03:00:00', '5.00', 'predicted', 'G1'],
      ['2026-11-27 06:00:00', '3.67', 'predicted', null]
    ])
  ];

  const magRows = Array.from({ length: 90 }, (_, i) => ({
    time_tag: new OrigDate(FIXED_MS - (90 - i) * 60000).toISOString().slice(0, 19),
    active: true,
    bz_gsm: SC.bz ?? 0.5,
    bt: Math.abs(SC.bz ?? 0.5) + 3
  }));
  const windRows = Array.from({ length: 90 }, (_, i) => ({
    time_tag: new OrigDate(FIXED_MS - (90 - i) * 60000).toISOString().slice(0, 19),
    active: true,
    proton_speed: SC.speed ?? 380,
    proton_density: 5
  }));

  const ovCoords = [];
  for (let la = -89; la <= 89; la += 2) {
    ovCoords.push([((Math.round(SC.lon) % 360) + 360) % 360, la, SC.ov ?? 8]);
  }

  const mkResp = (body, ct = 'application/json') =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'Content-Type': ct } });

  const origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (url.startsWith(location.origin) || url.startsWith('/')) return origFetch(input, init);

    if (url.includes('rtsw_mag_1m.json')) return mkResp(magRows);
    if (url.includes('rtsw_wind_1m.json')) return mkResp(windRows);
    if (url.includes('planetary_k_index_1m.json')) return mkResp(kp1mRows);
    if (url.includes('ovation_aurora_latest.json')) return mkResp({ coordinates: ovCoords });
    if (url.includes('aurora-nowcast-hemi-power.txt')) return mkResp('2026-11-25_18:15  2026-11-25_18:15   ' + (SC.hpi ?? 14) + '   ' + (SC.hpi ?? 14), 'text/plain');
    if (url.includes('magnetometers-6-hour.json')) return mkResp([]);
    if (url.includes('noaa-planetary-k-index-forecast.json')) return mkResp(kpFcRows);
    if (url.includes('noaa-scales.json')) {
      return mkResp({
        '0': { DateStamp: '2026-11-25', G: { Scale: SC.gNow || '0' } },
        '1': { DateStamp: '2026-11-26', G: { Scale: SC.gTomorrow || '1' } },
        '2': { DateStamp: '2026-11-27', G: { Scale: '0' } }
      });
    }
    if (url.includes('geospace_pred_est_kp_1_hour.json')) {
      return mkResp([{ model_prediction_time: new OrigDate(FIXED_MS + 3600000).toISOString(), k: SC.kpNow ?? 1.0 }]);
    }
    if (url.includes('alerts.json')) return mkResp([]);
    if (url.includes('kyoto-dst.json')) return mkResp([['time_tag', 'dst'], ['2026-11-25 18:00:00', String(SC.dst ?? -5)]]);
    if (url.includes('propagated-solar-wind-1-hour.json')) return mkResp([]);
    if (url.includes('enlil_time_series.json')) return mkResp([]);

    if (url.includes('api.met.no/weatherapi/nowcast/2.0/complete')) {
      if (!SC.radarPrecip) return new Response('', { status: 422 });
      return mkResp({
        properties: {
          meta: { updated_at: new OrigDate(FIXED_MS - 180000).toISOString(), radar_coverage: 'ok' },
          timeseries: [
            { time: new OrigDate(FIXED_MS - 180000).toISOString(), data: { instant: { details: { air_temperature: -1.4, wind_speed: 4.5, precipitation_rate: SC.radarPrecip } } } },
            { time: new OrigDate(FIXED_MS + 120000).toISOString(), data: { instant: { details: { precipitation_rate: SC.radarPrecip } } } }
          ]
        }
      });
    }

    if (url.includes('api.met.no/weatherapi/locationforecast/2.0/complete')) {
      const mLat = parseFloat((url.match(/lat=([^&]+)/) || [])[1] || SC.lat);
      const isCenter = Math.abs(mLat - SC.lat) < 0.05;
      const fn = (h, ts) => {
        if (!isCenter && SC.corridorClear !== undefined) return 100 - SC.corridorClear;
        if (SC.osloMismatch) {
          // Tonight clear (0% cloud), Thu 11/26 early evening clear, Thu 11/26 19:00..06:00 CET overcast (100% cloud)
          const d = new OrigDate(ts);
          const iso = d.toISOString();
          if (iso >= '2026-11-26T18:00' && iso < '2026-11-27T06:00') return 100;
          return 0;
        }
        return SC.metCloud ?? 20;
      };
      return mkResp(makeMetSeries(baseHourMs, fn));
    }

    if (url.includes('api.met.no/weatherapi/tafmetar/1.0/metar.txt')) {
      if (!SC.metarRaw) return new Response('', { status: 404 });
      return mkResp(SC.metarRaw, 'text/plain');
    }
    if (url.includes('mesonet.agron.iastate.edu')) {
      return mkResp({ data: [] });
    }
    if (url.includes('api.open-meteo.com/v1/elevation')) {
      const lats = (url.match(/latitude=([^&]+)/) || ['', ''])[1].split(',');
      return mkResp({ elevation: lats.map(() => 120) });
    }
    if (url.includes('api.open-meteo.com/v1/forecast')) {
      const lats = (url.match(/latitude=([^&]+)/) || ['', ''])[1].split(',');
      const arr = lats.map((_, idx) => makeOmPoint(
        baseHourMs,
        (h, ts) => {
          if (idx > 0 && SC.corridorClear !== undefined) return 100 - SC.corridorClear;
          if (SC.osloMismatch) {
            const iso = new OrigDate(ts).toISOString();
            if (iso >= '2026-11-26T18:00' && iso < '2026-11-27T06:00') return 100;
            return 0;
          }
          return SC.omCloud ?? SC.metCloud ?? 20;
        },
        SC.tz,
        SC.utcOff ?? 3600,
        SC.tempC ?? -1,
        SC.omCloud ?? SC.metCloud ?? 20
      ));
      return mkResp(arr);
    }
    if (url.includes('geocoding-api.open-meteo.com/v1/search')) {
      return mkResp({
        results: [{
          name: SC.searchResultName || 'Oslo',
          country: SC.searchResultCountry || 'Norway',
          country_code: SC.searchResultCC || 'NO',
          latitude: SC.lat,
          longitude: SC.lon,
          timezone: SC.tz
        }]
      });
    }
    return new Response('', { status: 404 });
  };

  // Optional automated city search trigger once initial boot completes
  let searchTriggered = false;
  function checkAndEmit() {
    const busy = document.body.classList.contains('is-loading') || document.body.classList.contains('is-syncing');
    if (busy) { setTimeout(checkAndEmit, 40); return; }
    if (SC.runSearchQuery && !searchTriggered) {
      searchTriggered = true;
      const inp = document.getElementById('cityInput');
      const form = document.getElementById('cityForm');
      if (inp && form) {
        inp.value = SC.runSearchQuery;
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
      setTimeout(checkAndEmit, 60);
      return;
    }
    if (SC.runSearchQuery && !document.getElementById('locName')?.textContent?.includes(SC.searchResultName || SC.runSearchQuery)) {
      setTimeout(checkAndEmit, 40);
      return;
    }
    const issues = [];
    const vw = window.innerWidth;
    for (const gSel of ['.cond-foot', '.od-row-sub', '.scrub-bar', '.hdr']) {
      for (const grp of document.querySelectorAll(gSel)) {
        const kids = Array.from(grp.children).filter(c => {
          const r = c.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && getComputedStyle(c).position !== 'absolute';
        });
        for (let i = 0; i < kids.length; i++) {
          const a = kids[i].getBoundingClientRect();
          if (kids[i].scrollWidth > kids[i].clientWidth + 2) {
            const innerSpill = Array.from(kids[i].querySelectorAll('*')).some(ch => ch.getBoundingClientRect().right > a.right + 2);
            if (innerSpill) issues.push('FLEX_SPILLOVER in ' + gSel + ': ' + kids[i].className);
          }
          for (let j = i + 1; j < kids.length; j++) {
            const b = kids[j].getBoundingClientRect();
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 1.5 && oy > 1.5) issues.push('OVERLAP in ' + gSel + ': ' + kids[i].className + ' vs ' + kids[j].className);
          }
        }
      }
    }
    if (document.documentElement.scrollWidth > vw + 1) issues.push('H_OVERFLOW:' + document.documentElement.scrollWidth);
    const roadEl = document.getElementById('roadLinks');
    const roadVisible = roadEl && getComputedStyle(roadEl).display !== 'none';
    const waveSvgHtml = document.getElementById('skyWaveChart')?.innerHTML || '';
    const homeBestText = document.getElementById('homeBest')?.textContent?.trim() || '';
    let hourDetailTrend = '';
    const hit6 = document.querySelector('#skyWaveChart [data-hour-idx="6"]');
    if (hit6) {
      hit6.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      hourDetailTrend = document.getElementById('hourDetail')?.textContent?.replace(/\\s+/g, ' ').trim() || '';
      const sb = document.querySelector('.scrub-bar');
      if (sb) {
        const kids = Array.from(sb.children).filter(c => c.getBoundingClientRect().width > 0);
        for (let i = 0; i < kids.length; i++) {
          const a = kids[i].getBoundingClientRect();
          for (let j = i + 1; j < kids.length; j++) {
            const b = kids[j].getBoundingClientRect();
            if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5) {
              issues.push('OVERLAP in .scrub-bar(trend): ' + kids[i].className + ' vs ' + kids[j].className);
            }
          }
        }
      }
      if (document.documentElement.scrollWidth > vw + 1) issues.push('H_OVERFLOW_TREND:' + document.documentElement.scrollWidth);
    }
    const out = {
      locName: document.getElementById('locName')?.textContent?.trim() || '',
      vTitle: document.getElementById('vTitle')?.textContent?.trim() || '',
      fSkyVal: document.getElementById('fSkyVal')?.textContent?.trim() || '',
      fAurSub: document.getElementById('fAurSub')?.textContent?.trim() || '',
      fDarkSub: document.getElementById('fDarkSub')?.textContent?.trim() || '',
      fcConfBtn: document.getElementById('fcConfBtn')?.textContent?.trim() || '',
      pMet: document.getElementById('pMet')?.textContent?.trim() || '',
      tsConfRow: document.getElementById('tsConfRow')?.textContent?.trim() || '',
      vActionBtn: document.getElementById('vActionBtn')?.textContent?.trim() || '',
      navSat: document.getElementById('navSat')?.textContent?.trim() || '',
      outlookText: document.getElementById('outlookGrid')?.textContent?.replace(/\\s+/g, ' ').trim() || '',
      waveSvgHtml,
      homeBestText,
      hourDetailTrend,
      roadVisible,
      roadText: roadVisible ? (roadEl.textContent || '').trim() : '',
      bodyText: document.body.innerText || '',
      issues
    };
    try {
      window.parent.__E2E_RESULTS__ = window.parent.__E2E_RESULTS__ || {};
      window.parent.__E2E_RESULTS__[SC.id] = out;
    } catch {}
  }
  window.addEventListener('load', () => setTimeout(checkAndEmit, 60));
})();
</script>`;
}

const SCENARIOS = [
  {
    id: 'tromso-radar-rollover',
    label: 'Tromsø 19px: 5m radar snow squall + 22m 0Z Kp rollover + local obs + Live/Trend 24h range',
    query: '?lat=69.6492&lon=18.9553',
    lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo', utcOff: 3600, rootPx: 19, lang: 'zh',
    nowMs: Date.UTC(2026, 10, 25, 18, 22, 0),
    kp1mZeroRollover: true, metCloud: 22, omCloud: 72,
    metarRaw: 'ENTC 251820Z 20006KT 9999 BKN025 00/M02 Q1024',
    radarPrecip: 0.8,
    verify(r) {
      const errs = [];
      if (r.locName !== '挪威 · Tromsø') errs.push(`Expected 挪威 · Tromsø, got "${r.locName}"`);
      if (!r.fAurSub.includes('Kp 1.0')) errs.push(`Expected Kp 1.0 (not 0.0 during UT rollover), got "${r.fAurSub}"`);
      if (r.bodyText.includes('機場')) errs.push('Found forbidden cryptic word 機場 in real DOM');
      if (r.vActionBtn.includes('與實拍')) errs.push(`Hero dir CTA must NOT claim 與實拍, got "${r.vActionBtn}"`);
      if (r.navSat !== '實拍雲圖') errs.push(`Tromsø (inside Nordic cam range) navSat must be 實拍雲圖, got "${r.navSat}"`);
      if (!r.fcConfBtn.includes('已參照當地實測')) errs.push(`Expected 已參照當地實測 badge, got "${r.fcConfBtn}"`);
      if (!r.fDarkSub.includes('滿月')) errs.push(`Expected 滿月 in Darkness sub-label, got "${r.fDarkSub}"`);
      if (!r.tsConfRow.includes('Radar 5m')) errs.push(`Expected Radar 5m in Trust Sheet telemetry, got "${r.tsConfRow}"`);
      if (!r.waveSvgHtml.includes('data-role="horizon-split"') || !r.waveSvgHtml.includes('>即時<') || !r.waveSvgHtml.includes('>趨勢<')) {
        errs.push('Expected 24h skyWaveChart to render Live/Trend split (即時 / 趨勢)');
      }
      if (!r.hourDetailTrend.includes('趨勢參考') || !r.hourDetailTrend.includes('晴空 28%–78%')) {
        errs.push(`Expected +6h Trend scrub-bar to show 趨勢參考 and 晴空 28%–78% (met=22 vs ecmwf=72), got "${r.hourDetailTrend}"`);
      }
      const clr = parseInt(r.fSkyVal, 10);
      if (!(clr <= 10)) errs.push(`Active 0.8mm/h 5m radar snow squall must cap clear sky <=10%, got "${r.fSkyVal}"`);
      if (r.issues.length) errs.push(...r.issues);
      return errs;
    }
  },
  {
    id: 'oslo-search-mismatch',
    label: 'Oslo 19px: English search -> 挪威 · Oslo + Thu 11/26 強極光時雲厚 + honest 動態雲圖 nav',
    query: '?lat=69.6492&lon=18.9553',
    runSearchQuery: 'Oslo',
    searchResultName: 'Oslo', searchResultCountry: 'Norway', searchResultCC: 'NO',
    lat: 59.9127, lon: 10.7461, tz: 'Europe/Oslo', utcOff: 3600, rootPx: 19, lang: 'zh',
    nowMs: Date.UTC(2026, 10, 25, 18, 50, 0),
    osloMismatch: true, kpNow: 1.0,
    verify(r) {
      const errs = [];
      if (r.locName !== '挪威 · Oslo') errs.push(`English search "Oslo" must render 挪威 · Oslo, got "${r.locName}"`);
      if (r.navSat !== '動態雲圖') errs.push(`Oslo (outside Arctic observatory cam range) navSat must be 動態雲圖, got "${r.navSat}"`);
      if (!r.outlookText.includes('強極光時雲厚')) errs.push(`Expected 強極光時雲厚 on Oslo Thu 11/26, got "${r.outlookText}"`);
      if (!r.outlookText.includes('強光時晴空 0%')) errs.push(`Expected 強光時晴空 0% on Oslo Thu 11/26, got "${r.outlookText}"`);
      if (r.issues.length) errs.push(...r.issues);
      return errs;
    }
  },
  {
    id: 'queenstown-south-zh',
    label: 'Queenstown ZH: Southern Hemisphere prime storm points SOUTH + NZTA road only',
    query: '?lat=-45.0312&lon=168.6626',
    lat: -45.0312, lon: 168.6626, tz: 'Pacific/Auckland', utcOff: 46800, rootPx: 17, lang: 'zh',
    nowMs: Date.UTC(2026, 5, 15, 12, 0, 0), // Southern winter midnight (00:00 NZST)
    kpNow: 7.5, bz: -16, speed: 620, ov: 82, hpi: 140, metCloud: 5, omCloud: 5,
    verify(r) {
      const errs = [];
      if (!r.vTitle.includes('南方')) errs.push(`Southern Hemisphere prime cue must say 南方, got "${r.vTitle}"`);
      if (r.vTitle.includes('北方')) errs.push(`Southern Hemisphere must NEVER say 北方, got "${r.vTitle}"`);
      if (!r.roadVisible || !r.roadText.includes('紐西蘭 NZTA')) errs.push(`Expected NZTA road link, got visible=${r.roadVisible} "${r.roadText}"`);
      if (r.roadText.includes('挪威') || r.roadText.includes('塔斯馬尼亞')) errs.push(`Wrong road link leaked: "${r.roadText}"`);
      return errs;
    }
  },
  {
    id: 'queenstown-south-en',
    label: 'Queenstown EN: Southern Hemisphere prime storm points south + zero CJK leak',
    query: '?lat=-45.0312&lon=168.6626',
    lat: -45.0312, lon: 168.6626, tz: 'Pacific/Auckland', utcOff: 46800, rootPx: 17, lang: 'en',
    nowMs: Date.UTC(2026, 5, 15, 12, 0, 0),
    kpNow: 7.5, bz: -16, speed: 620, ov: 82, hpi: 140, metCloud: 5, omCloud: 5,
    verify(r) {
      const errs = [];
      if (!/south/i.test(r.vTitle)) errs.push(`EN Southern Hemisphere cue must say south, got "${r.vTitle}"`);
      if (/north/i.test(r.vTitle)) errs.push(`EN Southern Hemisphere must NEVER say north, got "${r.vTitle}"`);
      if (/[\u4e00-\u9fff]/.test(r.bodyText)) errs.push('EN real-app DOM leaked Chinese characters');
      return errs;
    }
  },
  {
    id: 'edinburgh-road-bounds',
    label: 'Edinburgh (Scotland): hides Nordic road links (no Norway Vegvesen leak)',
    query: '?lat=55.9533&lon=-3.1883&name=Edinburgh',
    lat: 55.9533, lon: -3.1883, tz: 'Europe/London', utcOff: 0, rootPx: 17, lang: 'zh',
    nowMs: Date.UTC(2026, 10, 25, 20, 0, 0),
    kpNow: 2.0, metCloud: 40, omCloud: 40,
    verify(r) {
      const errs = [];
      if (r.roadVisible) errs.push(`Edinburgh must NOT show Nordic road links, got "${r.roadText}"`);
      return errs;
    }
  },
  {
    id: 'montreal-road-bounds',
    label: 'Montreal (Eastern Canada): hides NWT Yellowknife road links',
    query: '?lat=45.5017&lon=-73.5673&name=Montreal',
    lat: 45.5017, lon: -73.5673, tz: 'America/Toronto', utcOff: -18000, rootPx: 17, lang: 'zh',
    nowMs: Date.UTC(2026, 10, 26, 2, 0, 0),
    kpNow: 2.0, metCloud: 40, omCloud: 40,
    verify(r) {
      const errs = [];
      if (r.roadVisible) errs.push(`Montreal must NOT show Yellowknife NWT road links, got "${r.roadText}"`);
      return errs;
    }
  },
  {
    id: 'svalbard-arome-cta',
    label: 'Svalbard 78.22°N: Yr.no AROME Arctic + no mainland roads + honest 直線 generic CTA',
    query: '?lat=78.2232&lon=15.6267&name=Svalbard',
    lat: 78.2232, lon: 15.6267, tz: 'Arctic/Longyearbyen', utcOff: 3600, rootPx: 17, lang: 'zh',
    nowMs: Date.UTC(2026, 10, 25, 20, 0, 0),
    kpNow: 3.0, ov: 35, metCloud: 90, omCloud: 88, corridorClear: 92,
    verify(r) {
      const errs = [];
      if (!r.pMet.includes('Yr.no')) errs.push(`Svalbard must use official MET Norway Yr.no AROME Arctic, got "${r.pMet}"`);
      if (r.roadVisible) errs.push(`Svalbard must NOT show mainland highway links, got "${r.roadText}"`);
      if (!r.vActionBtn.includes('直線 ~')) errs.push(`Generic Svalbard compass CTA must say 直線 ~, got "${r.vActionBtn}"`);
      if (r.vActionBtn.includes('公路')) errs.push(`Generic Svalbard compass CTA must NEVER claim 公路, got "${r.vActionBtn}"`);
      return errs;
    }
  },
  {
    id: 'kirkenes-vegvesen',
    label: 'Kirkenes (30.05°E): includes Norway Vegvesen road link',
    query: '?lat=69.7271&lon=30.0458',
    lat: 69.7271, lon: 30.0458, tz: 'Europe/Oslo', utcOff: 3600, rootPx: 17, lang: 'zh',
    nowMs: Date.UTC(2026, 10, 25, 20, 0, 0),
    kpNow: 2.0, metCloud: 30, omCloud: 30,
    verify(r) {
      const errs = [];
      if (!r.roadVisible || !r.roadText.includes('挪威 Vegvesen')) {
        errs.push(`Kirkenes must include 挪威 Vegvesen road link, got visible=${r.roadVisible} "${r.roadText}"`);
      }
      return errs;
    }
  }
];

const indexHtmlRaw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (u.pathname === '/harness') {
    const frames = SCENARIOS.map(sc => {
      const sep = sc.query.startsWith('?') ? '&' : '?';
      return `<iframe src="/e2e${sc.query}${sep}id=${encodeURIComponent(sc.id)}" width="390" height="844"></iframe>`;
    }).join('\n');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>E2E Harness</title></head><body>${frames}
<script>
window.__E2E_RESULTS__ = {};
window.__E2E_ERRORS__ = [];
let tries = 0;
function pollDone() {
  tries++;
  if (Object.keys(window.__E2E_RESULTS__).length >= ${SCENARIOS.length} || tries > 60) {
    const pre = document.createElement('pre');
    pre.id = '__E2E_ALL__';
    pre.textContent = JSON.stringify({ results: window.__E2E_RESULTS__, errors: window.__E2E_ERRORS__ });
    document.body.appendChild(pre);
    return;
  }
  setTimeout(pollDone, 50);
}
window.addEventListener('load', () => setTimeout(pollDone, 80));
</script></body></html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  if (u.pathname === '/e2e') {
    const id = u.searchParams.get('id');
    const sc = SCENARIOS.find(s => s.id === id);
    if (!sc) { res.writeHead(404); res.end('unknown scenario'); return; }
    // Restrict img/frame to local origin ONLY and disable infinite CSS animations so virtual-time settles immediately
    const localCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' data:; img-src 'self' data:; frame-src 'self'; connect-src 'self';"><style>*,*::before,*::after{animation:none!important;transition:none!important;}</style>`;
    const html = indexHtmlRaw
      .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/i, localCsp)
      .replace('<script type="module" src="src/app.js"></script>', `${buildInterceptorScript(sc)}\n  <script type="module" src="src/app.js"></script>`);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }
  const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\/+/, '');
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  const ext = path.extname(full);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();

console.log('=== NORDIC AURORA RADAR — REAL-APP E2E HEADLESS BROWSER SUITE ===');
let totalFails = 0;

try {
  const { stdout: dom } = await execFileAsync(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--window-size=1200,900', '--virtual-time-budget=3500', '--dump-dom',
    `http://127.0.0.1:${port}/harness`
  ], { encoding: 'utf8', timeout: 25000, maxBuffer: 20 * 1024 * 1024 });

  const m = dom.match(/<pre id="__E2E_ALL__">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error('E2E harness did not emit __E2E_ALL__');
  const decoded = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const parsed = JSON.parse(decoded);
  const results = parsed.results || parsed;
  if (parsed.errors?.length) console.log('Page errors:', parsed.errors);

  for (const sc of SCENARIOS) {
    const data = results[sc.id];
    if (!data) {
      totalFails++;
      console.log(`[FAIL] ${sc.label}\n    ⚠ Scenario did not emit result`);
      continue;
    }
    const errs = sc.verify(data);
    if (errs.length) {
      totalFails += errs.length;
      console.log(`[FAIL (${errs.length})] ${sc.label}`);
      for (const e of errs) console.log(`    ⚠ ${e}`);
    } else {
      console.log(`[PASS] ${sc.label}`);
    }
  }
} finally {
  server.close();
}

console.log(`\nTotal real-app E2E issues across ${SCENARIOS.length} scenarios: ${totalFails}`);
process.exit(totalFails > 0 ? 1 : 0);
