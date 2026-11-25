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
  buildBzChartSVG,
  buildSkyWaveSVG,
  buildSkyFactorIcon,
  buildAuroraFactorIcon,
  buildMoonPhaseIcon,
  buildOutlookSkyIcon,
  buildSolarWindMeterHtml
} from '../src/charts.js';
import { computeBallisticCoupling } from '../src/aurora-engine.js';

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
  const spread = i >= 4 ? (i >= 10 ? 34 : 24) : 10;
  const scoreLow = (i < 4 || isDay) ? score : Math.max(0, score - (i >= 12 ? 15 : 11));
  const scoreHigh = (i < 4 || isDay) ? score : Math.min(99, score + (i >= 12 ? 15 : 10));
  return {
    dtMs: Date.UTC(2026, 10, 25, 18 + i, 0, 0),
    time: `${String(hr).padStart(2, '0')}:00`,
    clear, block: 100 - clear, score, scoreLow, scoreHigh,
    cloudSpread: spread,
    clearLow: Math.max(0, clear - Math.round(spread / 2)),
    clearHigh: Math.min(100, clear + Math.round(spread / 2)),
    darkScore: isDay ? 0 : 100, temp: -5, isDay
  };
});

const bzSeriesSample = Array.from({ length: 120 }, (_, i) => ({
  time_tag: new Date(Date.UTC(2026, 10, 25, 13, 20 + i, 0)).toISOString().replace('T', ' ').slice(0, 19),
  bz: i < 75 ? 0.4 : (i < 95 ? -2.4 : -3.8),
  bt: 6.2
}));
const bzBalSample = computeBallisticCoupling(bzSeriesSample, 480);

function buildPageHtml({
  rootPx = 17, width = 390, height = 844, scrollY = 0,
  safeTop = 0, safeBottom = 0, mode = 'prime', redMode = false, lang = 'zh', swExpanded = false
}) {
  const en = lang === 'en';
  const isCloudy = mode === 'cloudy';
  const skySvg = isCloudy
    ? buildSkySceneSVG({ cloudPct: 86, auroraScore: 20, moonUp: true, moonPct: 78, isTooBright: false })
    : buildSkySceneSVG({ cloudPct: 8, auroraScore: 86, moonUp: false, moonPct: 14, isTooBright: false });
  const waveSvg = buildSkyWaveSVG(hrs24, hrs24[2], 2, lang);
  const bzSvg = swExpanded ? buildBzChartSVG(bzSeriesSample, 'Europe/Oslo', 480, bzBalSample, lang, 100) : '';

  const fSkyIco = buildSkyFactorIcon(isCloudy ? 24 : 92, false);
  const fAurIco = buildAuroraFactorIcon(isCloudy ? 12 : 86);
  const fDarkIco = isCloudy
    ? buildMoonPhaseIcon({ pct: 78, up: true, waxing: true, isTooBright: false })
    : buildMoonPhaseIcon({ pct: 14, up: false, waxing: true, isTooBright: false });
  const swMeterHtml = swExpanded
    ? buildSolarWindMeterHtml({ bz: -3.8, speed: 480, energy: bzBalSample.energy120[119], en })
    : (isCloudy
        ? buildSolarWindMeterHtml({ bz: 2.8, speed: 365, en })
        : buildSolarWindMeterHtml({ bz: -6.8, speed: 540, en }));

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

  const chevSvg = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>`;
  const stepPrevSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>`;
  const stepNextSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5L10.5 8 6 12.5"/></svg>`;
  const stormSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z"/></svg>`;
  const metarSvg = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>`;
  const cloudyCtaHtml = isCloudy
    ? `<button id="vActionBtn" class="hero-cta" type="button"><span class="cta-txt"><span>${en ? 'Drive E Skibotn · 84% clear' : '往東 Skibotn · 晴空 84%'}</span><span class="cta-sub">${en ? '~1h 50m · 118 km · Clear sky radar' : '約 1h 50m · 118 km · 查看周邊晴空'}</span></span>${chevSvg}</button>`
    : '';

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
          <span class="hdr-loc-name">${en ? 'Norway · Tromsø' : '挪威 · Tromsø'}</span>
          <svg class="chev-ico" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 6.2L8 10l3.8-3.8"/></svg>
        </span>
        <span class="hdr-loc-meta"><span>21:05</span> <span>·</span> <span>${en ? 'Just now' : '剛剛更新'}</span></span>
      </button>
      <div class="hdr-tools">
        <button class="icon-btn ${redMode ? 'red-on' : ''}" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg></button>
        <button class="icon-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8.5a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15 18 8.5"/><path d="M13.7 20.5a2 2 0 0 1-3.4 0"/></svg></button>
        <button class="icon-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="5.5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="18.5" cy="12" r="1.2" fill="currentColor"/></svg></button>
      </div>
    </header>

    <main class="view on">
      <section class="sky-hero">
        <div class="sky-stage">
          <button class="hero-score-btn ring-btn" type="button">
            <div id="ringSubLbl" class="ring-sub">${en ? 'VIEWING SCORE' : '觀測指數'}</div>
            <div class="ring-num">${isCloudy ? '1' : '84'}</div>
            <div class="ring-grade" style="color:${isCloudy ? 'var(--muted)' : 'var(--green)'};">${isCloudy ? (en ? 'Cloudy' : '雲層過厚') : (en ? 'Excellent' : '極佳')}</div>
          </button>
          <div class="sky-text">
            <h1 class="sky-title">${isCloudy ? (en ? 'Rest for now — conditions improve after 21:00' : '先休息，預計 21:00 後有望轉佳') : (en ? 'Go out now — look overhead and north' : '現在適合出門，朝頭頂與北方觀察')}</h1>
            ${cloudyCtaHtml}
          </div>
        </div>

        <div class="sky-body">
          <div class="factors">
            <div class="f-box">
              <div class="f-lbl-row"><span class="f-ico">${fSkyIco}</span><span class="f-lbl">${en ? 'Clear sky' : '晴空率'}</span></div>
              <div class="f-val" style="color:${isCloudy ? 'var(--muted)' : 'var(--text)'};">${isCloudy ? '24' : '92'}<span class="f-unit">%</span></div>
              <div class="f-sub"><span class="nowrap">-5°C</span><span class="sub-dot">·</span><span class="nowrap">${en ? 'Feels -9°C' : '體感 -9°C'}</span></div>
            </div>
            <div class="f-box">
              <div class="f-lbl-row"><span class="f-ico">${fAurIco}</span><span class="f-lbl">${en ? 'Aurora' : '極光活動'}</span></div>
              <div class="f-val" style="color:${isCloudy ? 'var(--muted)' : 'var(--text)'};">${isCloudy ? (en ? 'Quiet' : '偏弱') : (en ? 'Very high' : '極強')}</div>
              <div class="f-sub"><span class="nowrap">${isCloudy ? 'Kp 0.3' : 'Kp 5.0'}</span></div>
            </div>
            <div class="f-box">
              <div class="f-lbl-row"><span class="f-ico">${fDarkIco}</span><span class="f-lbl">${en ? 'Darkness' : '夜空暗度'}</span></div>
              <div class="f-val" style="color:${isCloudy ? 'var(--amber)' : 'var(--text)'};">${isCloudy ? '74' : '100'}<span class="f-unit">%</span></div>
              <div class="f-sub">${isCloudy ? (en ? '<span class="nowrap">Full moon</span><span class="sub-dot">·</span><span class="nowrap">Light 09:10</span>' : '<span class="nowrap">滿月</span><span class="sub-dot">·</span><span class="nowrap">09:10 天亮</span>') : (en ? 'Full dark' : '全暗')}</div>
            </div>
          </div>

          <div class="cond-foot">
            <div class="hero-tags">
              <button type="button" class="meta-item meta-btn t-amber">${stormSvg}<span>${en ? 'G1 storm watch · Nov 26' : '11月26日 可能發生 G1 地磁暴'}</span></button>
            </div>
            <button class="fc-conf-btn" type="button"><span>${isCloudy ? (en ? 'Confidence: medium · local obs adjusted' : '可信度：中 · 已參照當地實測') : (en ? 'Why?' : '說明')}</span>${chevSvg}</button>
          </div>
        </div>
      </section>

      <section class="card" id="waveCard">
        <h2 class="wave-h2">
          <span class="h2-grp"><svg class="h2-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/></svg><span>${en ? 'Hourly trend' : '逐時趨勢'}</span></span>
          <span class="wave-range">${en ? '24h' : '24 小時'}</span>
        </h2>
        <div class="wave-peak">${isCloudy
          ? (en ? 'Trend <strong>01:00–04:00</strong> · peaks ~<strong>02:00</strong>' : '今晚 <strong>01:00–04:00</strong> 預估適合')
          : (en ? 'Best <strong>19:00–04:00</strong> · peaks <strong>21:00</strong>' : '今晚 <strong>19:00–04:00</strong> 極佳 · <strong>21:00</strong> 最強')}</div>
        <div class="chart-box"><svg class="chart-svg" viewBox="0 0 420 156">${waveSvg}</svg></div>
        <div class="scrub-bar">
          <div class="hr-detail">
            <div class="sb-top">${isCloudy
              ? `<strong>01:00</strong> <strong style="color:var(--good);">${en ? '~38–62 Good' : '約 38–62 適合觀測'}</strong> <span class="sb-tag">${en ? 'Trend' : '趨勢參考'}</span>`
              : `<strong>21:00</strong> <strong style="color:var(--green);">${en ? '84 Excellent' : '84 極佳'}</strong>`}</div>
            <div class="sb-bot">${isCloudy
              ? (en ? '<span class="nowrap">62–86% clear</span> · <span class="nowrap">Full dark</span> · <span class="nowrap">-5°C</span> · <span class="nowrap">~Kp 3</span>' : '<span class="nowrap">晴空 62%–86%</span> · <span class="nowrap">全暗</span> · <span class="nowrap">-5°C</span> · <span class="nowrap">約 Kp 3</span>')
              : (en ? '<span class="nowrap">94% clear</span> · <span class="nowrap">Full dark</span> · <span class="nowrap">-5°C</span> · <span class="nowrap">Kp 5.0</span>' : '<span class="nowrap">晴空 94%</span> · <span class="nowrap">全暗</span> · <span class="nowrap">-5°C</span> · <span class="nowrap">Kp 5.0</span>')}</div>
          </div>
          <div class="steppers">
            <button class="step-btn" type="button" aria-label="prev">${stepPrevSvg}</button>
            <button class="step-btn" type="button" aria-label="next">${stepNextSvg}</button>
          </div>
        </div>
      </section>

      <section class="card" id="outlookCard">
        <h2 class="h2-with-info">
          <span class="h2-grp"><svg class="h2-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M5 1.8v2.4M11 1.8v2.4M2 6.8h12"/></svg><span>${en ? 'Next 3 nights' : '未來三晚'}</span></span>
          <button class="info-btn" type="button"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v3.6"/><circle cx="8" cy="5.1" r="0.7" fill="currentColor" stroke="none"/></svg></button>
        </h2>
        <div class="outlook-grid">${outlookHtml}</div>
        <p class="od-note">${en ? 'Trend only — recheck before heading out.' : '明後天僅供趨勢參考，出發前請再確認。'}</p>
      </section>

      <section class="card card-sw ${swExpanded ? 'sw-expanded' : ''}" id="solarWindCard">
        <h2>
          <span class="h2-grp"><svg class="h2-ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z"/></svg><span>${en ? 'Aurora early warning' : '極光即時預警'}</span></span>
          <span class="sw-badge ${swExpanded ? 'sw-warn' : (isCloudy ? '' : 'sw-good')}">${swExpanded ? (en ? '~48m · Building' : '約 48 分後 · 能量累積') : (isCloudy ? (en ? '~52m · Quiet' : '約 52 分後 · 維持平靜') : (en ? '~40m · May brighten' : '約 40 分後 · 可能變亮'))}</span>
        </h2>
        <div class="sw-summary ${swExpanded ? 'sw-sum-warn' : (isCloudy ? '' : 'sw-sum-good')}">${swExpanded
          ? (en ? 'Solar wind energy is building — aurora may strengthen within ~48 min.' : '極光能量正在累積，未來 48 分鐘內有機會轉強。')
          : (isCloudy
              ? (en ? 'No burst signal from upstream satellites for the next ~52 min.' : '未來約 52 分鐘暫無極光爆發訊號，目前維持平靜。')
              : (en ? 'Incoming solar wind is strong — aurora may brighten in ~40 min.' : '上游衛星測得強極光能量，約 40 分鐘內可能變亮，建議留意天空。'))}</div>
        <div class="sw-meter">${swMeterHtml}</div>
        <button class="sw-toggle-btn" type="button"><span>${swExpanded
          ? (en ? 'Hide 2h energy chart' : '收起 2 小時能量曲線')
          : (en ? 'View 2h energy chart' : '查看 2 小時能量曲線')}</span><svg class="sw-chev" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.2 6.2L8 10l3.8-3.8"/></svg></button>
        ${swExpanded ? `<div class="sw-curve-panel">
          <div class="bz-html-head"><span>${en ? 'Upstream satellite energy' : '衛星即時太陽風能量'}</span><strong>${en ? 'Building · Bz -3.8 nT · 480 km/s' : '能量累積 · Bz -3.8 nT · 480 km/s'}</strong></div>
          <div class="chart-box" style="margin-top:4px;"><svg id="bzChart" class="chart-svg" viewBox="0 0 420 156">${bzSvg}</svg></div>
          <div class="scrub-bar">
            <div id="bzDetail" class="hr-detail">
              <div class="sb-top"><strong>16:48</strong><strong style="color:var(--amber);">${en ? 'Building' : '能量累積'} · 46<span class="sb-unit">/100</span></strong></div>
              <div class="sb-bot">${en ? 'In ~28m · Bz -3.8 nT · 480 km/s' : '約 28 分後抵達 · Bz -3.8 nT · 480 km/s'}</div>
            </div>
            <div class="steppers">
              <button class="step-btn" type="button" aria-label="prev">${stepPrevSvg}</button>
              <button class="step-btn" type="button" aria-label="next">${stepNextSvg}</button>
            </div>
          </div>
          <div class="hr-legend"><span>${en ? 'Right of dashed line = arriving by 17:07' : '虛線右側＝已測得太陽風，預估於 17:07 前陸續到達'}</span></div>
        </div>` : ''}
      </section>
    </main>
  </div>

  <nav class="bottom-nav">
    <div class="bottom-inner">
      <button class="nav-btn on" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3z"/></svg><span>${en ? 'Overview' : '總覽'}</span></button>
      <button class="nav-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg><span>${en ? 'Clear skies' : '找晴空'}</span></button>
      <button class="nav-btn" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg><span>${en ? 'Live map' : '實拍雲圖'}</span></button>
    </div>
  </nav>

  <script>
    (function() {
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const vw = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth);
      const vh = window.innerHeight;
      const effEm = vw / rootPx;
      document.body.classList.toggle('a11y-large', effEm <= 19.6);
      document.body.classList.toggle('a11y-xlarge', effEm <= 15.2);
      if (${scrollY} > 0) {
        window.scrollTo({ top: ${scrollY}, behavior: 'instant' });
        document.body.classList.toggle('is-scrolled', window.scrollY > 4);
      }

      const issues = [];
      const stgCheck = document.querySelector('.sky-stage');
      if (stgCheck && parseFloat(getComputedStyle(stgCheck).opacity) < 0.99) {
        issues.push('HERO_GHOST_FADE: .sky-stage opacity=' + getComputedStyle(stgCheck).opacity);
      }
      if (document.documentElement.scrollWidth > vw + 1) {
        issues.push('HORIZONTAL_OVERFLOW: sw=' + document.documentElement.scrollWidth + ' > vw=' + vw);
      }

      // 1. Element right/left clip & text truncation checks
      const checkSel = '.hdr-loc-name, .hdr-loc-meta, .hdr-tools, .ring-sub, .ring-num, .ring-grade, .sky-title, .hero-cta, .f-box, .f-lbl, .f-val, .f-sub, .cond-foot, .meta-item, .wave-peak, .scrub-bar, .hr-detail, .steppers, .outlook-row, .od-day, .od-score, .od-badge, .od-stat, .sw-summary, .sw-meter, .sw-meter-axis, .bz-html-head, .bottom-nav, .nav-btn';
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

      // 2. Sibling overlap detection (including header 44px glove hit-zone gap verification)
      const pairGroups = ['.hdr', '.hdr-tools', '.factors', '.cond-foot', '.scrub-bar', '.steppers', '.od-row-top', '.od-row-sub', '.sw-meter-axis', '.bottom-inner'];
      for (const gSel of pairGroups) {
        for (const grp of document.querySelectorAll(gSel)) {
          const kids = Array.from(grp.children).filter(c => {
            const r = c.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(c).position !== 'absolute';
          });
          for (let i = 0; i < kids.length; i++) {
            const a = kids[i].getBoundingClientRect();
            // Catch flex-shrunk container spillover (e.g., nowrap child spilling outside min-width:0 .hero-tags onto sibling!)
            if (kids[i].scrollWidth > kids[i].clientWidth + 2) {
              const innerSpill = Array.from(kids[i].querySelectorAll('*')).some(ch => ch.getBoundingClientRect().right > a.right + 2);
              if (innerSpill) {
                issues.push('FLEX_SPILLOVER in ' + gSel + ': ' + kids[i].className + ' sw=' + kids[i].scrollWidth + ' > cw=' + kids[i].clientWidth);
              }
            }
            for (let j = i + 1; j < kids.length; j++) {
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
      // Header icon hit-zone check: 38px + inset:-3px requires >=6px visual gap
      const hdrBtns = Array.from(document.querySelectorAll('.hdr-tools .icon-btn'));
      for (let i = 0; i + 1 < hdrBtns.length; i++) {
        const gap = hdrBtns[i + 1].getBoundingClientRect().left - hdrBtns[i].getBoundingClientRect().right;
        if (gap < 6) issues.push('HDR_HIT_ZONE_OVERLAP: gap=' + gap.toFixed(1) + 'px < 6px');
      }

      // 3. EN zero-CJK-leak audit (including SVG text nodes!)
      if (${JSON.stringify(en)}) {
        const allText = document.body.innerText + ' ' + Array.from(document.querySelectorAll('svg text')).map(t => t.textContent).join(' ');
        if (/[\\u4e00-\\u9fff]/.test(allText)) {
          issues.push('EN_CJK_LEAK: Chinese characters found in EN DOM/SVG');
        }
      }

      // 4. Vocabulary consistency check: ZERO "月光", "月亮已落下", or cryptic "機場" in Overview UI
      if (/月光|月亮已落下|機場/.test(document.body.innerText)) {
        issues.push('VOCAB_DRIFT: Found 月光/月亮已落下/機場 in Overview UI instead of unified consumer copy');
      }

      // 5. Real iPhone safe-area bleed + 1P 120fps scroll-architecture checks
      const skyPos = getComputedStyle(document.querySelector('.sky-backdrop')).position;
      if (skyPos !== 'absolute') {
        issues.push('SKY_BACKDROP_NOT_SCROLLING: position=' + skyPos + ' (fixed sky causes header seam artifact on scroll)');
      }
      for (const sEl of document.querySelectorAll('.sky-body, .card, .icon-btn')) {
        const bf = getComputedStyle(sEl).backdropFilter || getComputedStyle(sEl).webkitBackdropFilter || 'none';
        if (bf !== 'none') issues.push('SCROLL_BACKDROP_FILTER_JANK: ' + sEl.className + ' backdropFilter=' + bf);
      }
      if (${safeTop} > 0 && ${scrollY} > 10) {
        const hdrRect = document.querySelector('.hdr').getBoundingClientRect();
        const hdrBefore = getComputedStyle(document.querySelector('.hdr'), '::before');
        if (hdrRect.top > 1 || hdrRect.bottom < ${safeTop} + 40) {
          issues.push('TOP_SAFE_AREA_GAP: hdr top=' + hdrRect.top + ' bottom=' + hdrRect.bottom);
        }
        if (parseFloat(hdrBefore.opacity) < 0.95 || hdrBefore.backgroundColor === 'rgba(0, 0, 0, 0)' || hdrBefore.backgroundColor === 'transparent') {
          issues.push('TOP_HEADER_TRANSPARENT_ON_SCROLL: opacity=' + hdrBefore.opacity + ' bg=' + hdrBefore.backgroundColor);
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
        if (${JSON.stringify(isCloudy)}) {
          const cta = document.getElementById('vActionBtn');
          if (!cta || cta.getBoundingClientRect().height < 46) {
            issues.push('CLOUDY_CTA_TOO_SMALL');
          }
          if (waveRect.top > navRect.top - 48) {
            issues.push('ABOVE_THE_FOLD_CLOUDY_WAVE_HIDDEN: waveTop=' + waveRect.top.toFixed(1));
          }
        } else if (chartRect.bottom > navRect.top + 8) {
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
  { id: 'ios15_21_midscroll', label: 'iPhone 15 21px Mid-Scroll (User Case!)', rootPx: 21, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 85 },
  { id: 'ios15_19_cloudy', label: 'iPhone 15 19px Cloudy (48px CTA)', rootPx: 19, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 0, mode: 'cloudy' },
  { id: 'ios15_19_scroll', label: 'iPhone 15 19px Scrolled Bleed Check', rootPx: 19, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 260, mode: 'cloudy' },
  { id: 'ios15_17_en', label: 'iPhone 15 17px EN Top (390×844)', rootPx: 17, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 0, lang: 'en' },
  { id: 'ios15_17_red', label: 'iPhone 15 17px Red Scrolled', rootPx: 17, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 260, redMode: true },
  { id: 'ios15_19_bz_scrub', label: 'iPhone 15 19px 2h Curve Scrub', rootPx: 19, width: 390, height: 844, safeTop: 59, safeBottom: 34, scrollY: 820, swExpanded: true },
  // Full-page multi-font-size stress matrix (14px -> 28px at exact 360px / 390px!)
  { id: 'f14_360', label: '14px Compact (360px)', rootPx: 14, width: 360, height: 1160 },
  { id: 'f16_360', label: '16px Android (360px)', rootPx: 16, width: 360, height: 1230 },
  { id: 'f17_390', label: '17px iPhone Default (390px)', rootPx: 17, width: 390, height: 1265 },
  { id: 'f19_390', label: '19px iOS Large (390px)', rootPx: 19, width: 390, height: 1380 },
  { id: 'f21_390', label: '21px iOS XL Reflow (390px)', rootPx: 21, width: 390, height: 1580 },
  { id: 'f24_390', label: '24px iOS AX1 Reflow (390px)', rootPx: 24, width: 390, height: 1790 },
  { id: 'f28_390', label: '28px iOS AX3 Stress (390px)', rootPx: 28, width: 390, height: 2200 },
  { id: 'f17_390_cloudy', label: '17px Cloudy + 48px CTA', rootPx: 17, width: 390, height: 1340, mode: 'cloudy' },
  { id: 'f17_390_red', label: '17px Red-Mode AA Full', rootPx: 17, width: 390, height: 1265, redMode: true },
  { id: 'f17_390_en', label: '17px EN Full', rootPx: 17, width: 390, height: 1280, lang: 'en' }
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
const iosIds = ['ios15_17_top', 'ios15_17_scroll', 'ios15_21_midscroll', 'ios15_19_cloudy', 'ios15_19_scroll', 'ios15_19_bz_scrub', 'ios15_17_en', 'ios15_17_red'];
const iosHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
  body { margin: 0; padding: 28px; background: #040812; color: #f4f7fc; font-family: -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
  h1 { margin: 0 0 6px; font-size: 26px; font-weight: 700; }
  p { margin: 0 0 22px; color: #9ab0cc; font-size: 14px; }
  .grid { display: flex; gap: 22px; align-items: flex-start; }
  .col { flex-shrink: 0; }
  .lbl { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: #58dba4; }
  iframe { border: 2px solid rgba(255,255,255,0.22); border-radius: 42px; display: block; background: #08101c; }
</style></head><body>
  <h1>v38 1P 120fps Scroll Architecture — Real iPhone 15 (390×844) QA</h1>
  <p>Scrolling .sky-backdrop (zero fixed-sky header seam!) · Opacity-only .hdr::before glass · Zero card backdrop-filter · Zero-reflow GPU PTR · 17px/19px/21px · EN &amp; Red</p>
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
  '--window-size=3380,980', '--force-device-scale-factor=1',
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
  .lbl { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #58dba4; }
  iframe { border: 1.5px solid rgba(255,255,255,0.18); border-radius: 26px; display: block; background: #08101c; }
</style></head><body>
  <h1>v36 Direction B (Nordic Atmospheric 1P) — Multi-Font Stress Matrix (14px → 28px)</h1>
  <p>14px–19px compact 3-col · Clean AX-L reflow at ≥21px (zero orphan wrap) · 44px glove steppers · Honest 25/37/38 solar-wind scale</p>
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
  '--window-size=2880,2360', '--force-device-scale-factor=1',
  `--screenshot=${path.join(OUT, 'v34_font_matrix.png')}`,
  `file://${path.join(OUT, 'v34_font_matrix.html')}`
], { stdio: 'pipe' });

// Render Sheet 3: Full-Page 4-State Visual Showcase (Prime · Cloudy+CTA · WCAG AA Red-Mode · EN)
const stateIds = ['f17_390', 'f17_390_cloudy', 'f17_390_red', 'f17_390_en'];
const stateHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><style>
  body { margin: 0; padding: 28px; background: #040812; color: #f4f7fc; font-family: -apple-system, "PingFang TC", "Noto Sans TC", sans-serif; }
  h1 { margin: 0 0 20px; font-size: 26px; font-weight: 700; }
  .grid { display: flex; gap: 22px; align-items: flex-start; }
  .col { flex-shrink: 0; }
  .lbl { font-size: 16px; font-weight: 600; margin-bottom: 10px; color: #7cc0f0; }
  iframe { border: 1.5px solid rgba(255,255,255,0.18); border-radius: 26px; display: block; background: #08101c; }
</style></head><body>
  <h1>v36 Direction B Visual States QA (Prime · Cloudy+48px CTA · WCAG AA Red · EN)</h1>
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
  '--window-size=1700,1460', '--force-device-scale-factor=1',
  `--screenshot=${path.join(OUT, 'v34_visual_states.png')}`,
  `file://${path.join(OUT, 'v34_visual_states.html')}`
], { stdio: 'pipe' });

console.log(`\nTotal UI QA issues across ${cases.length} cases: ${totalIssues}`);
console.log(`Screenshots saved in: ${OUT}`);
if (totalIssues > 0) process.exit(1);
