#!/usr/bin/env node
/**
 * Nordic Aurora Radar — Automated Real-iPhone Viewport, Scroll-Bleed,
 * Multi-Font-Size (14px-28px), Bilingual & Red-Mode Visual/DOM QA Gate.
 *
 * Run: node tests/ui-qa.mjs [--out /path/to/dir]
 * Exit code 0 = zero layout/bleed/locale/truncation regressions across all test cases.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildSkySceneSVG,
  buildSkyWaveSVG,
  buildSkyFactorIcon,
  buildAuroraFactorIcon,
  buildMoonPhaseIcon,
  buildOutlookSkyIcon,
  buildSolarWindMeterHtml
} from '../src/charts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx > 0 && process.argv[outIdx + 1]
  ? path.resolve(process.argv[outIdx + 1])
  : fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-ui-qa-'));
fs.mkdirSync(OUT, { recursive: true });

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const chrome = ['google-chrome', 'chromium', 'chromium-browser'].find(b => {
  try { execFileSync('which', [b], { stdio: 'pipe' }); return true; } catch { return false; }
});
if (!chrome) {
  console.error('ERROR: No Chrome/Chromium binary available for UI QA.');
  process.exit(1);
}

const hrs24 = Array.from({ length: 24 }, (_, i) => {
  const hr = (19 + i) % 24;
  const clear = [90, 92, 94, 92, 88, 84, 78, 74, 80, 86, 88, 82, 72, 60, 45, 34, 28, 32, 40, 52, 65, 76, 84, 88][i];
  const isDay = hr >= 10 && hr <= 13;
  const score = isDay ? 0 : [68, 76, 84, 80, 72, 62, 54, 48, 44, 40, 36, 32, 26, 20, 14, 0, 0, 0, 0, 22, 34, 46, 58, 66][i];
  return {
    dtMs: Date.UTC(2026, 10, 25, 18 + i, 0, 0),
    time: `${String(hr).padStart(2, '0')}:00`,
    clear, block: 100 - clear, score, darkScore: isDay ? 0 : 100, temp: -5, isDay
  };
});

function buildPageHtml({
  rootPx = 17, width = 390, height = 844, scrollY = 0,
  safeTop = 0, safeBottom = 0, mode = 'prime', redMode = false, lang = 'zh'
}) {
  const en = lang === 'en';
  const isCloudy = mode === 'cloudy';
  const skySvg = isCloudy
    ? buildSkySceneSVG({ cloudPct: 86, auroraScore: 20, moonUp: true, moonPct: 78, isTooBright: false })
    : buildSkySceneSVG({ cloudPct: 8, auroraScore: 86, moonUp: false, moonPct: 14, isTooBright: false });
  const waveSvg = buildSkyWaveSVG(hrs24, hrs24[2], 2, lang);

  const fSkyIco = buildSkyFactorIcon(isCloudy ? 24 : 92, false);
  const fAurIco = buildAuroraFactorIcon(isCloudy ? 12 : 86);
  const fDarkIco = isCloudy
    ? buildMoonPhaseIcon({ pct: 78, up: true, waxing: true, isTooBright: false })
    : buildMoonPhaseIcon({ pct: 14, up: false, waxing: true, isTooBright: false });
  const swMeterHtml = isCloudy
    ? buildSolarWindMeterHtml({ bz: 2.8, speed: 365, en })
    : buildSolarWindMeterHtml({ bz: -6.8, speed: 540, en });

  const nights = [
    {
      best: true, day: en ? 'Tonight' : '今晚', date: '11/25', score: 84, col: 'var(--green)',
      badge: en ? 'Excellent' : '極佳', win: en ? 'Peak 21–00' : '約 21–00',
      clear: en ? '94% clear' : '晴空率 94%', kp: 'Kp 5.0', g: 'G1', clearNum: 94
    },
    {
      best: false, day: en ? 'Thu' : '週四', date: '11/26', score: 56, col: 'var(--good)',
      badge: en ? 'Good' : '適合觀測', win: en ? 'Peak 00–03' : '約 00–03',
      clear: en ? '78% clear' : '晴空率 78%', kp: en ? '~Kp 5' : '約 Kp 5', g: 'G1', clearNum: 78
    },
    {
      best: false, day: en ? 'Fri' : '週五', date: '11/27', score: 14, col: 'var(--muted)',
      badge: en ? 'Cloudy' : '雲層過厚', win: '',
      clear: en ? '22% clear' : '晴空率 22%', kp: en ? '~Kp 4' : '約 Kp 4', g: '', clearNum: 22
    }
  ];

  const outlookHtml = nights.map(n => {
    const barBg = n.score >= 65 ? 'linear-gradient(90deg, var(--good), var(--green))' : n.col;
    const rightParts = [
      n.win ? `<span class="nowrap">${n.win}</span>` : '',
      `<span class="nowrap">${n.clear}</span>`,
      `<span class="nowrap">${n.kp}${n.g ? ` <span class="od-g">${n.g}</span>` : ''}</span>`
    ].filter(Boolean).join(' · ');
    return `<div class="outlook-row${n.best ? ' od-best' : ''}">
      <div class="od-row-top">
        <div class="od-head"><div class="od-day">${n.day}</div><div class="od-date">${n.date}</div></div>
        <div class="od-ico">${buildOutlookSkyIcon({ score: n.score, clearPct: n.clearNum, scoreAvailable: true })}</div>
        <div class="od-bar"><div class="od-bar-fill" style="width:${n.score}%;background:${barBg};"></div></div>
        <div class="od-score" style="color:${n.col};">${n.score}</div>
      </div>
      <div class="od-row-sub">
        <span class="od-sub-l">${n.best ? `<span class="od-best-tag">★ ${en ? 'Best' : '最佳'}</span> · ` : ''}<span class="od-badge" style="color:${n.col};">${n.badge}</span></span>
        <span class="od-stat">${rightParts}</span>
      </div>
    </div>`;
  }).join('');

  // Emulate real iOS env(safe-area-inset-top/bottom) cleanly by substituting CSS env() fallbacks
  const emulatedCss = css
    .replace(/env\(safe-area-inset-top,\s*0px\)/g, `${safeTop}px`)
    .replace(/env\(safe-area-inset-bottom,\s*0px\)/g, `${safeBottom}px`);

  const statusBarOverlay = safeTop > 0 ? `
    <div style="position:fixed;top:0;left:0;right:0;height:${safeTop}px;z-index:80;pointer-events:none;display:flex;align-items:flex-end;justify-content:space-between;padding:0 22px 10px;font-size:15px;font-weight:600;color:#fff;font-family:-apple-system,sans-serif;">
      <span>21:05 ▸</span><span style="font-size:12px;opacity:.9;">5G  69%</span>
    </div>` : '';
  const homeBarOverlay = safeBottom > 0 ? `
    <div style="position:fixed;bottom:8px;left:50%;transform:translateX(-50%);width:134px;height:5px;border-radius:99px;background:rgba(255,255,255,0.45);z-index:80;pointer-events:none;"></div>` : '';

  return `<!DOCTYPE html><html lang="${en ? 'en' : 'zh-Hant'}" style="font-size:${rootPx}px !important;"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${width},initial-scale=1"/>
<style>
${emulatedCss}
html { font-size: ${rootPx}px !important; }
.view.on, .hdr { animation: none !important; transition: none !important; }
::-webkit-scrollbar { display: none; }
</style></head>
<body class="${redMode ? 'red-mode' : ''}${scrollY > 4 ? ' is-scrolled' : ''}" data-mood="${isCloudy ? 'quiet' : 'prime'}">
  ${statusBarOverlay}${homeBarOverlay}
  <div class="sky-backdrop"><svg class="sky-svg" viewBox="0 0 640 225" preserveAspectRatio="xMidYMin slice">${skySvg}</svg></div>
  <div class="wrap">
    <header class="hdr">
      <button class="hdr-loc-btn" type="button">
        <span class="hdr-loc-row">
          <svg class="loc-arrow" viewBox="0 0 24 24"><path d="M21 3 3 10.53v.98l6.84 2.65L12.48 21h.98z" fill="currentColor"/></svg>
          <span class="hdr-loc-name">${en ? 'Norway · Tromsø' : '挪威 · Tromsø'}</span><span class="chev">▾</span>
        </span>
        <span class="hdr-loc-meta"><span>21:05</span> <span>·</span> <span>${en ? 'Just now' : '剛剛更新'}</span></span>
      </button>
      <div class="hdr-tools">
        <button class="icon-btn ${redMode ? 'red-on' : ''}" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
        <button class="icon-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></button>
        <button class="icon-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/></svg></button>
      </div>
    </header>

    <main class="view on">
      <section class="sky-hero">
        <div class="sky-stage">
          <button class="hero-score-btn ring-btn" type="button">
            <div class="ring-sub sr-only">${en ? 'Score' : '觀測指數'}</div>
            <div class="ring-num">${isCloudy ? '1' : '84'}</div>
            <div class="ring-grade" style="color:${isCloudy ? 'var(--muted)' : 'var(--green)'};">${isCloudy ? (en ? 'Cloudy' : '雲層過厚') : (en ? 'Excellent' : '極佳')}</div>
          </button>
          <div class="sky-text">
            <h1 class="sky-title">${isCloudy ? (en ? 'Rest for now — conditions improve after 21:00' : '先休息，預計 21:00 後有望轉佳') : (en ? 'Go out now — look overhead and north' : '現在適合出門，朝頭頂與北方觀察')}</h1>
          </div>
        </div>

        <div class="sky-body">
          <div class="factors">
            <div class="f-box">
              <div class="f-head">
                <div class="f-lbl-row"><span class="f-ico">${fSkyIco}</span><span class="f-lbl">${en ? 'Clear sky' : '晴空率'}</span></div>
                <span class="f-val" style="color:${isCloudy ? 'var(--muted)' : 'var(--green)'};">${isCloudy ? '24%' : '92%'}</span>
              </div>
              <div class="f-track"><div class="f-fill" style="width:${isCloudy ? '24%' : '92%'};background:${isCloudy ? 'var(--muted)' : 'var(--green)'};"></div></div>
              <div class="f-sub"><span class="nowrap">-5°C</span> · <span class="nowrap">${en ? 'Feels -9°C' : '體感 -9°C'}</span></div>
            </div>
            <div class="f-box">
              <div class="f-head">
                <div class="f-lbl-row"><span class="f-ico">${fAurIco}</span><span class="f-lbl">${en ? 'Aurora' : '極光活動'}</span></div>
                <span class="f-val" style="color:${isCloudy ? 'var(--muted)' : 'var(--green)'};">${isCloudy ? '3' : '86'}</span>
              </div>
              <div class="f-track"><div class="f-fill" style="width:${isCloudy ? '8%' : '86%'};background:${isCloudy ? 'var(--muted)' : 'var(--green)'};"></div></div>
              <div class="f-sub"><span class="nowrap">${isCloudy ? 'Kp 0.3' : 'Kp 5.0'}</span></div>
            </div>
            <div class="f-box">
              <div class="f-head">
                <div class="f-lbl-row"><span class="f-ico">${fDarkIco}</span><span class="f-lbl">${en ? 'Darkness' : '夜空暗度'}</span></div>
                <span class="f-val" style="color:${isCloudy ? 'var(--amber)' : 'var(--green)'};">${isCloudy ? '74%' : '100%'}</span>
              </div>
              <div class="f-track"><div class="f-fill" style="width:${isCloudy ? '74%' : '100%'};background:${isCloudy ? 'var(--amber)' : 'var(--green)'};"></div></div>
              <div class="f-sub">${isCloudy ? (en ? 'Light 09:10' : '09:10 天亮') : (en ? 'Full dark' : '全暗')}</div>
            </div>
          </div>

          <div class="hero-tags">
            <button type="button" class="hero-tag t-amber hero-tag-btn">⚡ ${en ? 'G1 storm active ›' : 'G1 地磁暴進行中 ›'}</button>
            <span class="hero-tag t-blue">◎ ${en ? 'ENTC obs' : 'ENTC 實測'}</span>
          </div>

          <div class="fc-strip">
            <span>${isCloudy ? (en ? 'By 16:24: Score <strong>2</strong>, steady' : '16:24 前：指數 <strong>2</strong>，變化不大') : (en ? 'By 21:47: Score <strong style="color:var(--green);">88</strong>, steady' : '21:47 前：指數 <strong style="color:var(--green);">88</strong>，變化不大')}</span>
            <button class="fc-conf-btn" type="button">${en ? 'Details ›' : '說明 ›'}</button>
          </div>
        </div>
      </section>

      <section class="card" id="waveCard">
        <h2 class="wave-h2">
          <span class="h2-grp"><svg class="h2-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/></svg><span>${en ? 'Hourly trend' : '逐時趨勢'}</span></span>
          <span class="wave-range">${en ? '24h · Scrub' : '24 小時 · 滑動查看'}</span>
        </h2>
        <div class="wave-peak">${en ? 'Best <strong>19:00–04:00</strong> · peaks <strong>21:00</strong>' : '今晚 <strong>19:00–04:00</strong> 極佳 · <strong>21:00</strong> 最強'}</div>
        <div class="chart-box"><svg class="chart-svg" viewBox="0 0 420 154">${waveSvg}</svg></div>
        <div class="hr-detail">
          <span class="hr-det-main"><strong>21:00</strong> <strong style="color:var(--green);">84</strong> <span style="color:var(--green);">${en ? 'Excellent' : '極佳'}</span></span>
          <span class="hr-det-meta">${en ? '94% clear · Full dark · -5°C · Kp 5.0' : '晴 94% · 全暗 · -5°C · Kp 5.0'}</span>
        </div>
      </section>

      <section class="card" id="outlookCard">
        <h2 class="h2-with-info">
          <span class="h2-grp"><svg class="h2-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1.8v2.4M11 1.8v2.4M2 6.8h12"/></svg><span>${en ? 'Next 3 nights' : '未來三晚'}</span></span>
          <button class="info-btn" type="button">ⓘ</button>
        </h2>
        <div class="outlook-grid">${outlookHtml}</div>
        <p class="od-note">${en ? 'Clouds & Kp shift — recheck 3h before going out.' : '明後天雲量與 Kp 變動較大，出發前 3 小時請再確認。'}</p>
      </section>

      <section class="card card-sw" id="solarWindCard">
        <h2>
          <span class="h2-grp"><svg class="h2-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z"/></svg><span>${en ? 'Aurora early warning' : '極光即時預警'}</span></span>
          <span class="sw-badge ${isCloudy ? '' : 'sw-good'}">${isCloudy ? (en ? '~52m · Quiet' : '提前 52 分鐘 · 維持平靜') : (en ? '~40m · May brighten' : '提前 40 分鐘 · 可能變亮')}</span>
        </h2>
        <div class="sw-summary ${isCloudy ? '' : 'sw-sum-good'}">${isCloudy
          ? (en ? 'No burst signal from upstream satellites for the next ~52 min.' : '未來約 52 分鐘暫無極光爆發訊號，目前維持平靜。')
          : (en ? 'Incoming solar wind is strong — aurora may brighten in ~40 min.' : '上游衛星測得強極光能量，約 40 分鐘內可能變亮，建議留意天空。')}</div>
        <div class="sw-meter">${swMeterHtml}</div>
        <button class="sw-toggle-btn" type="button"><span>${isCloudy ? (en ? '2h satellite chart (Bz +2.8 · 365 km/s)' : '2 小時衛星曲線（Bz +2.8 · 365 km/s）') : (en ? '2h satellite chart (Bz -6.8 · 540 km/s)' : '2 小時衛星曲線（Bz -6.8 · 540 km/s）')}</span><span class="sw-chev">▾</span></button>
      </section>
    </main>
  </div>

  <nav class="bottom-nav">
    <div class="bottom-inner">
      <button class="nav-btn on" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3m0 12v3M4.93 4.93l2.12 2.12m9.9 9.9 2.12 2.12M3 12h3m14 0h3M4.93 19.07l2.12-2.12m9.9-9.9 2.12-2.12"/><circle cx="12" cy="12" r="4"/></svg><span>${en ? 'Overview' : '總覽'}</span></button>
      <button class="nav-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg><span>${en ? 'Clear skies' : '找晴空'}</span></button>
      <button class="nav-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg><span>${en ? 'Live map' : '實拍雲圖'}</span></button>
    </div>
  </nav>

  <script>
    (function() {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
      const vh = window.innerHeight;
      const effEm = vw / rootPx;
      document.body.classList.toggle('a11y-large', effEm <= 17.8);
      document.body.classList.toggle('a11y-xlarge', effEm <= 15.2);
      if (${scrollY} > 0) {
        window.scrollTo({ top: ${scrollY}, behavior: 'instant' });
        document.body.classList.toggle('is-scrolled', window.scrollY > 4);
      }

      const issues = [];
      if (document.documentElement.scrollWidth > vw + 1) {
        issues.push('HORIZONTAL_OVERFLOW: sw=' + document.documentElement.scrollWidth + ' > vw=' + vw);
      }

      // 1. Element right/left clip & text truncation checks
      const checkSel = '.hdr-loc-name, .hdr-loc-meta, .hdr-tools, .ring-num, .ring-grade, .sky-title, .f-box, .f-lbl, .f-val, .f-sub, .hero-tag, .fc-strip, .wave-peak, .outlook-row, .od-day, .od-score, .od-badge, .od-stat, .sw-summary, .sw-meter, .sw-meter-axis, .bottom-nav, .nav-btn';
      for (const el of document.querySelectorAll(checkSel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1.5) issues.push('RIGHT_CLIP: ' + el.className + ' right=' + r.right.toFixed(1) + ' > ' + vw);
        if (r.left < -1.5) issues.push('LEFT_CLIP: ' + el.className + ' left=' + r.left.toFixed(1));
        const cs = getComputedStyle(el);
        if ((cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2) {
          issues.push('TEXT_TRUNCATED: ' + el.className + ' ("' + el.textContent.trim().slice(0, 32) + '") sw=' + el.scrollWidth + ' cw=' + el.clientWidth);
        }
      }

      // 2. Sibling overlap detection
      const pairGroups = ['.hdr', '.factors', '.f-head', '.od-row-top', '.od-row-sub', '.sw-meter-axis', '.bottom-inner'];
      for (const gSel of pairGroups) {
        for (const grp of document.querySelectorAll(gSel)) {
          const kids = Array.from(grp.children).filter(c => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(c).position !== 'absolute';
          });
          for (let i = 0; i < kids.length; i++) {
            for (let j = i + 1; j < kids.length; j++) {
              const a = kids[i].getBoundingClientRect();
              const b = kids[j].getBoundingClientRect();
              const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (ox > 1.5 && oy > 1.5) {
                issues.push('OVERLAP in ' + gSel + ': ' + kids[i].className + ' vs ' + kids[j].className + ' (' + ox.toFixed(1) + 'x' + oy.toFixed(1) + ')');
              }
            }
          }
        }
      }

      // 3. EN zero-CJK-leak audit (including SVG text nodes!)
      if (${JSON.stringify(en)}) {
        const allText = document.body.innerText + ' ' + Array.from(document.querySelectorAll('svg text')).map(t => t.textContent).join(' ');
        if (/[\\u4e00-\\u9fff]/.test(allText)) {
          issues.push('EN_CJK_LEAK: Chinese characters found in EN DOM/SVG');
        }
      }

      // 4. Vocabulary consistency check: ZERO "月光" or "月亮已落下" in Overview UI
      if (/月光|月亮已落下/.test(document.body.innerText)) {
        issues.push('VOCAB_DRIFT: Found 月光/月亮已落下 in Overview UI instead of unified 夜空暗度/暗度/全暗');
      }

      // 5. Real iPhone safe-area bleed check (top sticky header + bottom scrim)
      if (${safeTop} > 0 && ${scrollY} > 10) {
        const hdrRect = document.querySelector('.hdr').getBoundingClientRect();
        const hdrBg = getComputedStyle(document.querySelector('.hdr')).backgroundColor;
        if (hdrRect.top > 1 || hdrRect.bottom < ${safeTop} + 40) {
          issues.push('TOP_SAFE_AREA_GAP: hdr top=' + hdrRect.top + ' bottom=' + hdrRect.bottom);
        }
        if (hdrBg === 'rgba(0, 0, 0, 0)' || hdrBg === 'transparent') {
          issues.push('TOP_HEADER_TRANSPARENT_ON_SCROLL');
        }
      }
      if (${safeBottom} > 0) {
        const scrim = getComputedStyle(document.body, '::after');
        const scrimH = parseFloat(scrim.height) || 0;
        const navRect = document.querySelector('.bottom-nav').getBoundingClientRect();
        const bottomGap = vh - navRect.bottom;
        if (scrim.position !== 'fixed' || scrimH < bottomGap + 40 || scrim.backgroundImage === 'none') {
          issues.push('BOTTOM_NAV_BLEED_UNPROTECTED: scrimH=' + scrimH + ' bottomGap=' + bottomGap.toFixed(1));
        }
      }

      // 6. Above-the-fold economy check on 390x844 iPhone 15 at scrollY=0 (17px & 19px)
      const waveRect = document.getElementById('waveCard').getBoundingClientRect();
      const chartRect = document.querySelector('#waveCard .chart-svg').getBoundingClientRect();
      const navRect = document.querySelector('.bottom-nav').getBoundingClientRect();
      if (${height} === 844 && ${scrollY} === 0 && ${rootPx} <= 19) {
        if (chartRect.bottom > navRect.top + 8) {
          issues.push('ABOVE_THE_FOLD_CUT: chart bottom=' + chartRect.bottom.toFixed(1) + ' > bottomNav top=' + navRect.top.toFixed(1));
        }
      }

      const payload = {
        rootPx, vw, vh, effEm: +effEm.toFixed(2),
        mode: document.body.classList.contains('a11y-large') ? (document.body.classList.contains('a11y-xlarge') ? 'AX-XL' : 'AX-L') : '3col',
        docHeight: document.body.scrollHeight,
        waveTop: Math.round(waveRect.top),
        chartBottom: Math.round(chartRect.bottom),
        navTop: Math.round(navRect.top),
        issues
      };
      try {
        window.parent.__QA_RESULTS__ = window.parent.__QA_RESULTS__ || {};
        window.parent.__QA_RESULTS__[window.name] = payload;
      } catch {}
    })();
  </script>
</body></html>`;
}

const cases = [
  // Real iPhone 15 390x844 viewport tests (with real safe-area-inset-top:59px & safe-area-inset-bottom:34px!)
  { id: 'ios15_17_top', label: 'iPhone 15 17px Top (390×844)', rootPx: 17, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 0 },
  { id: 'ios15_17_scroll', label: 'iPhone 15 17px Scrolled (390×844)', rootPx: 17, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 270 },
  { id: 'ios15_19_cloudy', label: 'iPhone 15 19px Cloudy (User Case!)', rootPx: 19, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 0, mode: 'cloudy' },
  { id: 'ios15_19_scroll', label: 'iPhone 15 19px Scrolled Bleed Check', rootPx: 19, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 260, mode: 'cloudy' },
  { id: 'ios15_17_en', label: 'iPhone 15 17px EN Top (390×844)', rootPx: 17, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 0, lang: 'en' },
  { id: 'ios15_17_red', label: 'iPhone 15 17px Red Scrolled', rootPx: 17, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 260, redMode: true },
  // Full-page multi-font-size stress matrix (14px -> 28px at exact 360px / 390px!)
  { id: 'f14_360', label: '14px Compact (360px)', rootPx: 14, width: 360, height: 1120 },
  { id: 'f16_360', label: '16px Android (360px)', rootPx: 16, width: 360, height: 1160 },
  { id: 'f17_390', label: '17px iPhone Default (390px)', rootPx: 17, width: 390, height: 1180 },
  { id: 'f19_390', label: '19px iOS Large (390px)', rootPx: 19, width: 390, height: 1250 },
  { id: 'f21_390', label: '21px iOS XL (390px)', rootPx: 21, width: 390, height: 1340 },
  { id: 'f24_390', label: '24px iOS AX1 Reflow (390px)', rootPx: 24, width: 390, height: 1780 },
  { id: 'f28_390', label: '28px iOS AX3 Stress (390px)', rootPx: 28, width: 390, height: 2120 },
  { id: 'f17_390_cloudy', label: '17px Cloudy + 78% Moon', rootPx: 17, width: 390, height: 1180, mode: 'cloudy' },
  { id: 'f17_390_red', label: '17px Red-Mode Full', rootPx: 17, width: 390, height: 1180, redMode: true },
  { id: 'f17_390_en', label: '17px EN Full', rootPx: 17, width: 390, height: 1180, lang: 'en' }
];

for (const c of cases) {
  fs.writeFileSync(path.join(OUT, `qa_${c.id}.html`), buildPageHtml(c));
}

const harnessHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head><body style="margin:0;">
  ${cases.map(c => `<iframe name="${c.id}" src="file://${path.join(OUT, `qa_${c.id}.html`)}" width="${c.width}" height="${c.height}" style="border:0;display:block;"></iframe>`).join('\n')}
  <pre id="allAudit"></pre>
  <script>
    window.addEventListener('load', () => {
      document.getElementById('allAudit').textContent = JSON.stringify(window.__QA_RESULTS__ || {});
    });
  </script>
</body></html>`;
const harnessPath = path.join(OUT, 'harness.html');
fs.writeFileSync(harnessPath, harnessHtml);

const dom = execFileSync(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
  '--window-size=1200,1200',
  '--dump-dom',
  `file://${harnessPath}`
], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

const m = dom.match(/<pre id="allAudit"[^>]*>([\s\S]*?)<\/pre>/);
const allRes = m ? JSON.parse(m[1]) : {};
let totalIssues = 0;

console.log('=== NORDIC AURORA RADAR — AUTOMATED REAL-IPHONE & MULTI-FONT UI QA ===');
for (const c of cases) {
  const r = allRes[c.id] || { issues: ['NO_AUDIT_OUTPUT'] };
  totalIssues += r.issues.length;
  const tag = r.issues.length ? `FAIL (${r.issues.length})` : 'PASS';
  const foldInfo = c.height === 844 && !c.scrollY ? ` | chartBot=${r.chartBottom}px vs navTop=${r.navTop}px` : '';
  console.log(`[${tag}] ${c.label.padEnd(36)} | ${r.vw}×${r.vh} root=${r.rootPx}px ${r.mode.padEnd(5)} H=${r.docHeight}px${foldInfo}`);
  for (const iss of r.issues) console.log(`    ⚠ ${iss}`);
}

// Render Sheet 1: Real iPhone 15 390x844 Viewport & Scroll-Bleed Verification
const iosIds = ['ios15_17_top', 'ios15_17_scroll', 'ios15_19_cloudy', 'ios15_19_scroll', 'ios15_17_en', 'ios15_17_red'];
const iosHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
  body { margin: 0; padding: 28px; background: #040812; color: #f4f7fc; font-family: -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
  h1 { margin: 0 0 6px; font-size: 26px; font-weight: 700; }
  p { margin: 0 0 22px; color: #9ab0cc; font-size: 14px; }
  .grid { display: flex; gap: 22px; align-items: flex-start; }
  .col { flex-shrink: 0; }
  .lbl { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #48d8a2; }
  iframe { border: 2px solid rgba(255,255,255,0.22); border-radius: 42px; display: block; background: #070d18; }
</style></head><body>
  <h1>v34 Real iPhone 15 (390×844) Safe-Area, Scroll-Bleed &amp; Above-the-Fold QA</h1>
  <p>Simulated iOS status bar (59px) + home indicator (34px) · Top &amp; Mid-Scroll · 17px &amp; 19px · EN &amp; Red-Mode</p>
  <div class="grid">
    ${iosIds.map(id => {
      const c = cases.find(x => x.id === id);
      return `<div class="col"><div class="lbl">${c.label}</div><iframe src="file://${path.join(OUT, `qa_${id}.html`)}" width="${c.width}" height="${c.height}"></iframe></div>`;
    }).join('')}
  </div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'v34_ios15_qa.html'), iosHtml);
execFileSync(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
  '--window-size=2540,980', '--force-device-scale-factor=1',
  `--screenshot=${path.join(OUT, 'v34_ios15_qa.png')}`,
  `file://${path.join(OUT, 'v34_ios15_qa.html')}`
], { stdio: 'pipe' });

// Render Sheet 2: Full-Page Multi-Font-Size Stress Matrix (14px -> 28px)
const fontIds = ['f14_360', 'f16_360', 'f17_390', 'f19_390', 'f21_390', 'f24_390', 'f28_390'];
const fontHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
  body { margin: 0; padding: 28px; background: #040812; color: #f4f7fc; font-family: -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
  h1 { margin: 0 0 6px; font-size: 28px; font-weight: 700; }
  p { margin: 0 0 22px; color: #9ab0cc; font-size: 15px; }
  .grid { display: flex; gap: 22px; align-items: flex-start; }
  .col { flex-shrink: 0; }
  .lbl { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #48d8a2; }
  iframe { border: 1.5px solid rgba(255,255,255,0.18); border-radius: 26px; display: block; background: #070d18; }
</style></head><body>
  <h1>v34 Compact Apple 1P — Full-Page Multi-Font Stress Matrix (14px → 28px)</h1>
  <p>14px–21px stays compact 3-col (~1,080px total height, -37% vs v33) · Automatic AX reflow at ≥24px · Horizontal 3-Night rows &amp; flat Early-Warning card</p>
  <div class="grid">
    ${fontIds.map(id => {
      const c = cases.find(x => x.id === id);
      return `<div class="col"><div class="lbl">${c.label}</div><iframe src="file://${path.join(OUT, `qa_${id}.html`)}" width="${c.width}" height="${c.height}" scrolling="no"></iframe></div>`;
    }).join('')}
  </div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'v34_font_matrix.html'), fontHtml);
execFileSync(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
  '--window-size=2880,2260', '--force-device-scale-factor=1',
  `--screenshot=${path.join(OUT, 'v34_font_matrix.png')}`,
  `file://${path.join(OUT, 'v34_font_matrix.html')}`
], { stdio: 'pipe' });

// Render Sheet 3: Full-Page 4-State Visual Showcase (Prime · Cloudy+Moon · Red-Mode · EN)
const stateIds = ['f17_390', 'f17_390_cloudy', 'f17_390_red', 'f17_390_en'];
const stateHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
  body { margin: 0; padding: 28px; background: #040812; color: #f4f7fc; font-family: -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
  h1 { margin: 0 0 20px; font-size: 26px; font-weight: 700; }
  .grid { display: flex; gap: 22px; align-items: flex-start; }
  .col { flex-shrink: 0; }
  .lbl { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #70b9ff; }
  iframe { border: 1.5px solid rgba(255,255,255,0.18); border-radius: 26px; display: block; background: #070d18; }
</style></head><body>
  <h1>v34 Visual States QA (Prime · Cloudy+78% Moon · Zero-Leak Red · EN)</h1>
  <div class="grid">
    ${stateIds.map(id => {
      const c = cases.find(x => x.id === id);
      return `<div class="col"><div class="lbl">${c.label}</div><iframe src="file://${path.join(OUT, `qa_${id}.html`)}" width="${c.width}" height="${c.height}" scrolling="no"></iframe></div>`;
    }).join('')}
  </div>
</body></html>`;
fs.writeFileSync(path.join(OUT, 'v34_visual_states.html'), stateHtml);
execFileSync(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
  '--window-size=1700,1300', '--force-device-scale-factor=1',
  `--screenshot=${path.join(OUT, 'v34_visual_states.png')}`,
  `file://${path.join(OUT, 'v34_visual_states.html')}`
], { stdio: 'pipe' });

console.log(`\nTotal UI QA issues across ${cases.length} cases: ${totalIssues}`);
console.log(`Screenshots saved in: ${OUT}`);
if (totalIssues > 0) process.exit(1);
