/**
 * Nordic Aurora Radar — Browser UI Controller
 *
 * Thin UI orchestrator connecting the pure scientific engine (aurora-engine.js),
 * SVG builders (charts.js), live data transport (data-client.js), safe offline
 * storage (storage.js), and declarative bilingual strings (i18n.js) to the DOM.
 */

import * as Engine from './aurora-engine.js';
import { TERMS, term } from './glossary.js';
import * as Charts from './charts.js';
import {
  loadSavedPos, savePos, loadRedMode, saveRedMode, saveLangPref,
  readCachedEnlil, writeCachedEnlil, writeSwrCacheEntry,
  findMatchingOfflineCache, buildSwrPayload, hydrateOfflineState
} from './storage.js';
import { SKY_CAMS, renderSkyCamCaption, applyStaticI18n as applyStaticI18nDom } from './i18n.js';
import {
  fetchEnlilBackground, fetchNoaaBundle, fetchWeatherBundle,
  computeLiveSnapshot, reverseGeocodeBilingual, reverseGeocodeSingle, geocodeCityQuery
} from './data-client.js';

const {
  detectDefaultLang, getLang, setLang, isEn, escapeHtml, tSky, tDirLabel, tGrade,
  isInNordicMetBox, getZoneParts, matchKnownCity, hasCjkChars, resolveCityDisplayName,
  parseUrlLocation, buildShareUrl, computeSolarElevation, computeDistanceKm,
  computeDarkWindow, getMoonState, computeViewingGeometry,
  computeMLT, explainAuroraScore, summarize3NightOutlook, evaluateVerdict,
  isCorridorHazard, synthesizeTonightAction, summarizeEnergyTrend, summarizeCompass,
  shouldTriggerAuroraAlert, utcTagToLocalHM
} = Engine;

const {
  buildSkySceneSVG, buildBzChartSVG, buildSkyWaveSVG, buildCompassRadarSVG,
  buildSkyFactorIcon, buildAuroraFactorIcon, buildMoonPhaseIcon,
  buildOutlookSkyIcon, buildSolarWindMeterHtml
} = Charts;

// Expose pure modules on window for automated VLM / browser console inspection
window.__AURORA_SCI_TEST__ = { ...Engine, ...Charts };

const AUTO_REFRESH_MS = 5 * 60 * 1000;

// ====== Consolidated Application State ======
const state = {
  pos: {
    name: '挪威 · Alta', nameEn: 'Norway · Alta',
    lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo',
    mode: 'manual', accuracy: null
  },
  lastScore: null,
  lastSyncMs: 0,
  syncedAtMs: 0,
  syncPartial: false,
  lastAttemptMs: 0,
  isRefreshing: false,
  scoredHours: [],
  bestAurora: null,
  selectedHourIdx: 0,
  renderState: null,
  explainState: null,
  alertEnabled: false,
  wakeLockFailed: false,
  activeAlert: null,
  redModeEnabled: false,
  lastAlertMs: 0,
  wakeLockObj: null,
  audioCtx: null,
  refreshSeq: 0,
  locationSeq: 0,
  activeRefreshCtrl: null,
  camKey: 'uit',
  camUserPicked: false,
  camFullBright: false,
  activeView: 'home',
  tabScrollY: { home: 0, dir: 0, sat: 0 },
  trustTriggerEl: null,
  pickerTriggerEl: null,
  sheetHistoryPushed: false,
  toastTimer: null,
  swExpanded: false,
  swTelemetryTag: '',
  bzChartState: null,
  selectedBzIdx: -1,
  tempUnit: 'C',
  displayedScore: null,
  scoreAnimFrame: 0,
  bannerState: { offline: false, stormSevere: false, stormMinorTag: '', lineTip: false }
};

const $ = (id) => document.getElementById(id);
const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const setHtml = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

/** Strict Banner Budget = 1 above Hero: P0 Alert > P1 Offline > P2 Severe Storm > P3 Monitor > P4 Tip */
function syncBannerBudget() {
  const monEl = $('monitorBar');
  const offEl = $('offlineBanner');
  const stormEl = $('stormBanner');
  const lineEl = $('lineTip');
  let winner = null;
  if (state.activeAlert) winner = 'alert';
  else if (state.bannerState.offline) winner = 'offline';
  else if (state.bannerState.stormSevere) winner = 'storm';
  else if (state.alertEnabled) winner = 'monitor';
  else if (state.bannerState.lineTip) winner = 'line';

  if (monEl) monEl.classList.toggle('on', winner === 'alert' || winner === 'monitor');
  if (offEl) offEl.style.display = winner === 'offline' ? 'flex' : 'none';
  if (stormEl) stormEl.style.display = winner === 'storm' ? 'flex' : 'none';
  if (lineEl) lineEl.style.display = winner === 'line' ? 'flex' : 'none';
}

/** Pause background aurora GPU animation when hidden, bright, low-score, red-mode, off-tab, Wake-Lock monitor, or scrolled past Hero */
function syncAnimBatteryGuard() {
  const sc = state.lastScore;
  const pastHero = (typeof window !== 'undefined' ? (window.scrollY || 0) : 0) > 220;
  const shouldPause = Boolean(
    document.hidden ||
    !sc ||
    sc.isTooBright ||
    sc.total < 18 ||
    state.redModeEnabled ||
    state.activeView !== 'home' ||
    state.alertEnabled ||
    pastHero
  );
  document.body.classList.toggle('anim-paused', shouldPause);
}

function syncSwToggleUI() {
  const card = $('solarWindCard');
  const btn = $('swToggleBtn');
  const panel = $('swCurvePanel');
  const en = isEn();
  if (!card || !btn || !panel) return;
  card.classList.toggle('sw-expanded', state.swExpanded);
  btn.setAttribute('aria-expanded', String(state.swExpanded));
  panel.setAttribute('aria-hidden', String(!state.swExpanded));
  const collapsedTxt = en ? 'View 2h energy chart' : '查看 2 小時能量曲線';
  const expandedTxt = en ? 'Hide 2h energy chart · Scrub or tap' : '收起 2 小時能量曲線 · 滑動或點選';
  setText('swToggleTxt', state.swExpanded ? expandedTxt : collapsedTxt);
}

function animateScoreNumber(targetVal, numEl) {
  if (!numEl) return;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const fromVal = Number.isFinite(state.displayedScore) ? state.displayedScore : targetVal;
  if (state.scoreAnimFrame) { cancelAnimationFrame(state.scoreAnimFrame); state.scoreAnimFrame = 0; }
  if (reduceMotion || fromVal === targetVal) {
    state.displayedScore = targetVal;
    numEl.textContent = targetVal;
    return;
  }
  const startT = performance.now();
  const dur = 320;
  const step = (nowT) => {
    const p = Math.min(1, (nowT - startT) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    const cur = Math.round(fromVal + (targetVal - fromVal) * eased);
    numEl.textContent = cur;
    if (p < 1) {
      state.scoreAnimFrame = requestAnimationFrame(step);
    } else {
      state.displayedScore = targetVal;
      state.scoreAnimFrame = 0;
    }
  };
  state.scoreAnimFrame = requestAnimationFrame(step);
}

function haptic(pattern = 8) {
  try {
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate?.(pattern);
  } catch {}
}

function getPosDisplayName(pos = state.pos) {
  return resolveCityDisplayName(pos, getLang());
}

const TOAST_DURATIONS = { info: 2800, success: 3000, warn: 4800, error: 5000, alert: 6500 };

function hideToast() {
  clearTimeout(state.toastTimer);
  $('toast')?.classList.remove('show');
}

function toast(msg, type = 'info') {
  const el = $('toast');
  if (!el) return;
  const t = TOAST_DURATIONS[type] ? type : 'info';
  el.textContent = msg;
  el.className = `toast show t-${t}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), TOAST_DURATIONS[t]);
}

/** Keep address bar synchronized with selected city & language so copying URL always works */
function syncBrowserUrl() {
  try {
    if (typeof history !== 'undefined' && location.protocol.startsWith('http')) {
      const nextUrl = buildShareUrl(location.href, state.pos, getLang());
      if (nextUrl !== location.href) history.replaceState(null, '', nextUrl);
    }
  } catch {}
}

/** Repair single-language cached/GPS city names when language changes */
async function refreshLocalizedPlaceName() {
  const { lat, lon, name, nameEn, mode } = state.pos;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const matched = matchKnownCity(lat, lon);
  if (matched) {
    state.pos.name = matched.zh;
    state.pos.nameEn = matched.en;
    return;
  }
  const en = isEn();
  const needsEn = en && (!nameEn || hasCjkChars(nameEn));
  const needsZh = !en && mode === 'gps' && (!name || !hasCjkChars(name));
  if (!needsEn && !needsZh) return;
  const myLocSeq = state.locationSeq;
  const resolved = await reverseGeocodeSingle(lat, lon, en ? 'en' : 'zh');
  if (!resolved || myLocSeq !== state.locationSeq || state.pos.lat !== lat || state.pos.lon !== lon) return;
  if (en) state.pos.nameEn = resolved;
  else state.pos.name = resolved;
  renderLocationHeader();
  syncBrowserUrl();
}

// ====== Red-Light Night-Vision Mode & Language ======
function applyRedModeUI() {
  document.body.classList.toggle('red-mode', state.redModeEnabled);
  const btn = $('redBtn');
  btn?.classList.toggle('red-on', state.redModeEnabled);
  btn?.setAttribute('aria-pressed', String(state.redModeEnabled));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.redModeEnabled ? '#050000' : '#08101c');
  syncAnimBatteryGuard();
}

function toggleRedMode() {
  state.redModeEnabled = !state.redModeEnabled;
  saveRedMode(state.redModeEnabled);
  applyRedModeUI();
  haptic(10);
  toast(state.redModeEnabled
    ? (isEn() ? 'Red-light night vision ON' : '已開啟紅光夜視模式（保護暗適應）')
    : (isEn() ? 'Red-light night vision OFF' : '已關閉紅光夜視模式'), 'info');
}

function applyStaticI18n() {
  state.tempUnit = detectTempUnit();
  syncTempUnitBtn();
  applyStaticI18nDom({
    $, en: isEn(), currentPos: state.pos, currentCamKey: state.camKey,
    hasLiveState: Boolean(state.renderState),
    onUpdateCamDayNotice: updateSkyCamDayNotice
  });
}

function toggleLang() {
  setLang(isEn() ? 'zh' : 'en');
  saveLangPref(getLang());
  applyStaticI18n();
  syncSwToggleUI();
  renderLocationHeader();
  renderMonitorBar();
  updateClockAndPhoto();
  if (state.renderState) renderFromState(state.renderState);
  syncBrowserUrl();
  refreshLocalizedPlaceName();
  haptic(6);
  toast(isEn() ? 'Switched to English' : '已切換為繁體中文', 'info');
}

// ====== Alerts, Persistent Monitor Bar & Audio ======
function playAuroraChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!state.audioCtx || state.audioCtx.state === 'closed') state.audioCtx = new AC();
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume().catch(() => {});
    const ctx = state.audioCtx;
    const nowT = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, nowT + i * 0.16);
      gain.gain.setValueAtTime(0.001, nowT + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.16, nowT + i * 0.16 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, nowT + i * 0.16 + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(nowT + i * 0.16);
      osc.stop(nowT + i * 0.16 + 0.5);
    });
  } catch {}
}

function renderMonitorBar() {
  const bar = $('monitorBar');
  const btn = $('alertBtn');
  if (btn) {
    btn.classList.toggle('alert-on', state.alertEnabled);
    btn.setAttribute('aria-pressed', String(state.alertEnabled));
  }
  if (!bar) return;
  const en = isEn();
  if (state.activeAlert) {
    bar.className = 'monitor-bar triggered';
    bar.innerHTML = `<span class="monitor-main"><span class="monitor-pulse"></span><span>${escapeHtml(state.activeAlert.time)} · ${escapeHtml(state.activeAlert.msg)}</span></span><button class="monitor-act" type="button" data-mon-act="ack">${en ? 'Got it' : '知道了'}</button>`;
    syncBannerBudget();
    return;
  }
  if (state.alertEnabled) {
    bar.className = 'monitor-bar';
    const wlTag = state.wakeLockFailed
      ? (en ? ' (keep screen awake)' : '（請保持螢幕常亮）')
      : '';
    const txt = en
      ? `Monitor active · alerts at score ≥40 or surge${wlTag}`
      : `常亮監測中 · 指數 ≥40 或爆發將響鈴${wlTag}`;
    bar.innerHTML = `<span class="monitor-main"><span class="monitor-pulse"></span><span>${escapeHtml(txt)}</span></span><button class="monitor-act" type="button" data-mon-act="off">${en ? 'Off' : '關閉'}</button>`;
    syncBannerBudget();
    return;
  }
  bar.className = 'monitor-bar';
  bar.innerHTML = '';
  syncBannerBudget();
}

async function acquireWakeLock() {
  if (!state.alertEnabled) return;
  if (!navigator.wakeLock) {
    state.wakeLockFailed = true;
    renderMonitorBar();
    return;
  }
  if (state.wakeLockObj && !state.wakeLockObj.released) return;
  try {
    const wl = await navigator.wakeLock.request('screen');
    state.wakeLockObj = wl;
    state.wakeLockFailed = false;
    wl.addEventListener?.('release', () => {
      if (state.wakeLockObj === wl) state.wakeLockObj = null;
    });
  } catch {
    state.wakeLockObj = null;
    state.wakeLockFailed = true;
  }
  renderMonitorBar();
}

async function toggleAlertMode() {
  state.alertEnabled = !state.alertEnabled;
  const en = isEn();
  if (state.alertEnabled) {
    state.wakeLockFailed = false;
    playAuroraChime();
    haptic([100, 60, 100]);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    await acquireWakeLock();
    toast(en
      ? 'Monitor ON — keep screen unlocked & plugged in'
      : '已開啟常亮監測，請保持螢幕未鎖定並接上電源', 'warn');
  } else {
    state.wakeLockFailed = false;
    state.activeAlert = null;
    try { if (state.wakeLockObj && !state.wakeLockObj.released) { await state.wakeLockObj.release(); } } catch {}
    state.wakeLockObj = null;
    renderMonitorBar();
    haptic(8);
    toast(en ? 'Screen-on monitor turned off' : '已關閉常亮監測', 'info');
  }
  syncAnimBatteryGuard();
}

function maybeTriggerAlert(sc, goesSub, scNext, bal, pos = state.pos) {
  if (!state.alertEnabled) return;
  const check = shouldTriggerAuroraAlert({ sc, goesSub, scNext, bal });
  if (!check.fire || Date.now() - state.lastAlertMs < 15 * 60 * 1000) return;
  state.lastAlertMs = Date.now();
  playAuroraChime();
  haptic([250, 120, 250, 120, 350]);
  const en = isEn();
  const cityLabel = getPosDisplayName(pos);
  const msgMap = {
    score: en ? `${cityLabel}: score ${sc.total} — good time to head outside.` : `${cityLabel} 觀測指數 ${sc.total}，適合出門觀測。`,
    'storm-gap': en ? `Strong aurora (activity ${sc.auroraScore}) — watch for cloud gaps.` : `極光活動強（${sc.auroraScore}），留意雲縫。`,
    substorm: en ? 'Aurora burst starting and the sky is opening up.' : '極光正在爆發，天空也有晴空空檔。',
    incoming: en ? `Score may rise to ${scNext?.total} in about ${bal?.etaMin || 45} min.` : `約 ${bal?.etaMin || 45} 分鐘後指數可能升到 ${scNext?.total}。`
  };
  const msg = msgMap[check.reason] || msgMap.score;
  const timeStr = $('clk')?.textContent || new Date().toTimeString().slice(0, 5);
  state.activeAlert = { time: timeStr, msg };
  renderMonitorBar();
  toast(msg, 'alert');
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(en ? 'Aurora Radar Alert' : '極光即時雷達提醒', { body: msg });
    }
  } catch {}
}

// ====== Location, Native Sheets, Tabs & All-Sky Cams ======
function loadSavedPrefs() {
  state.locationSeq++;
  setLang(detectDefaultLang());
  state.redModeEnabled = loadRedMode();
  applyRedModeUI();
  const urlPos = parseUrlLocation(location.search);
  if (urlPos) {
    state.pos = { ...state.pos, ...urlPos };
  } else {
    const saved = loadSavedPos();
    if (saved) state.pos = saved;
  }
  refreshLocalizedPlaceName();
  let dismissedTip = false;
  try { dismissedTip = sessionStorage.getItem('aurora_line_tip_dismissed') === '1'; } catch {}
  state.bannerState.lineTip = Boolean(!dismissedTip && /Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent || ''));
  syncBannerBudget();
}

function syncPresetChipHighlight() {
  document.querySelectorAll('#presetChips .chip').forEach(c => {
    const plat = parseFloat(c.dataset.lat);
    const plon = parseFloat(c.dataset.lon);
    const match = Number.isFinite(plat) && Number.isFinite(plon)
      && Math.abs(plat - state.pos.lat) < 0.03 && Math.abs(plon - state.pos.lon) < 0.03;
    c.classList.toggle('on', match);
  });
}

function pushSheetHistory() {
  try {
    if (!state.sheetHistoryPushed && typeof history !== 'undefined' && location.protocol.startsWith('http')) {
      history.pushState({ auroraSheet: true }, '', location.href);
      state.sheetHistoryPushed = true;
    }
  } catch {}
}

function popSheetHistoryIfIdle() {
  const anyOpen = $('picker')?.classList.contains('open') || $('trustSheet')?.classList.contains('open');
  if (!anyOpen && state.sheetHistoryPushed) {
    state.sheetHistoryPushed = false;
    try {
      if (typeof history !== 'undefined' && history.state?.auroraSheet) history.back();
    } catch {}
  }
}

function syncBodySheetClass() {
  const anyOpen = $('picker')?.classList.contains('open') || $('trustSheet')?.classList.contains('open');
  document.body.classList.toggle('sheet-open', Boolean(anyOpen));
}

function togglePicker(forceClose, triggerEl) {
  const p = $('picker');
  const btn = $('pickBtn');
  if (!p || !btn) return;
  const wasOpen = p.classList.contains('open');
  const open = forceClose ? false : !wasOpen;
  if (open) {
    closeTrustSheet('switch');
    state.pickerTriggerEl = triggerEl || document.activeElement;
    p.classList.add('open');
    p.setAttribute('aria-hidden', 'false');
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    pushSheetHistory();
    haptic(6);
  } else if (wasOpen) {
    p.classList.remove('open');
    p.setAttribute('aria-hidden', 'true');
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    if (forceClose !== 'pop' && forceClose !== 'switch') {
      popSheetHistoryIfIdle();
      state.pickerTriggerEl?.focus?.();
    }
  }
  syncBodySheetClass();
}

function findNearestCamInRegion(lat, lon, region) {
  let bestKey = null;
  let minKm = Infinity;
  for (const [k, cam] of Object.entries(SKY_CAMS)) {
    if (cam.region !== region || cam.isMag || !Number.isFinite(cam.lat)) continue;
    const d = computeDistanceKm(lat, lon, cam.lat, cam.lon);
    if (Number.isFinite(d) && d < minKm) { minKm = d; bestKey = k; }
  }
  return { key: bestKey, distKm: minKm };
}

function syncSkyCamGlareUI(isDaylight) {
  const wrap = $('skyCamWrap');
  const btn = $('camBrightBtn');
  const en = isEn();
  if (!wrap || !btn) return;
  if (!isDaylight) {
    wrap.classList.remove('daylight');
    btn.style.display = 'none';
    return;
  }
  wrap.classList.toggle('daylight', !state.camFullBright);
  btn.style.display = 'inline-flex';
  btn.textContent = state.camFullBright
    ? (en ? 'Dim glare' : '恢復降亮')
    : (en ? 'Daylight dimmed · tap for full' : '日間過曝 · 點此看原亮度');
}

function updateSkyCamDayNotice(key) {
  const notice = $('camDayNotice');
  const cam = SKY_CAMS[key];
  if (!notice) return;
  if (!cam || cam.isMag || !Number.isFinite(cam.lat)) {
    notice.style.display = 'none';
    syncSkyCamGlareUI(false);
    return;
  }
  const now = new Date();
  const sunAlt = computeSolarElevation(now, cam.lat, cam.lon);
  if (sunAlt <= -6) {
    notice.style.display = 'none';
    syncSkyCamGlareUI(false);
    return;
  }
  const en = isEn();
  const sunStr = `${sunAlt > 0 ? '+' : ''}${sunAlt.toFixed(0)}°`;
  const dw = computeDarkWindow(now, cam.lat, cam.lon, cam.tz || 'UTC');
  const nextStr = dw.state === 'twilight-wait' && dw.nextDarkHM
    ? (en ? ` Dark again around ${dw.nextDarkHM} local.` : ` 預計當地 ${dw.nextDarkHM} 後轉暗恢復正常夜拍。`)
    : (dw.state === 'midnight-sun'
        ? (en ? ' Midnight sun — daylight around the clock.' : ' 目前為極晝期間，24 小時皆偏亮。')
        : '');
  notice.style.display = 'block';
  notice.textContent = en
    ? `Daylight/twilight at this observatory (sun ${sunStr}) — high-sensitivity aurora cameras naturally appear white/overexposed until dark.${nextStr}`
    : `此天文台目前為白天／暮光（太陽 ${sunStr}），高感光極光相機畫面偏白過曝屬正常現象。${nextStr}`;
  syncSkyCamGlareUI(true);
}

function selectSkyCam(key, btn, isUser = false) {
  if (!SKY_CAMS[key]) return;
  if (isUser) {
    state.camUserPicked = true;
    haptic(6);
  }
  state.camKey = key;
  state.camFullBright = false;
  document.querySelectorAll('#camChips .chip').forEach(c => {
    c.classList.toggle('on', btn ? c === btn : c.dataset.cam === key);
  });
  const img = $('skyCamImg');
  if (img) img.src = `${SKY_CAMS[key].url}?t=${Date.now()}`;
  renderSkyCamCaption($, key, isEn());
  updateSkyCamDayNotice(key);
}

function syncSatTab() {
  const wf = $('windyFrame');
  if (!wf) return;
  const target = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&overlay=clouds&lat=${state.pos.lat.toFixed(3)}&lon=${state.pos.lon.toFixed(3)}&zoom=7`;
  if (wf.src !== target) wf.src = target;
  const hemi = state.pos.lat >= 0 ? 'north' : 'south';
  const en = isEn();
  setText('ovHeading', state.pos.lat >= 0
    ? (en ? 'NOAA Northern Hemisphere Aurora Oval' : 'NOAA 北半球即時極光橢圓圖')
    : (en ? 'NOAA Southern Hemisphere Aurora Oval' : 'NOAA 南半球即時極光橢圓圖'));
  setHtml('ovCap', `<a class="src-link" target="_blank" rel="noopener noreferrer" href="https://www.spaceweather.gov/products/aurora-30-minute-forecast">${en ? 'Source: NOAA SWPC OVATION Live Model (Green = aurora, Yellow/Red = strong) ↗' : '資料來源：NOAA SWPC OVATION 即時模型（綠色＝有極光、黃紅＝強爆發）↗'}</a>`);
  const ovImg = $('ovationImg');
  if (ovImg) ovImg.src = `https://services.swpc.noaa.gov/images/animations/ovation/${hemi}/latest.jpg?t=${Date.now()}`;

  const camCard = $('skyCamCard');
  const nearNordic = findNearestCamInRegion(state.pos.lat, state.pos.lon, 'nordic');
  const nearNa = findNearestCamInRegion(state.pos.lat, state.pos.lon, 'na');
  let activeRegion = null;
  let nearestKey = null;
  if (state.pos.lat >= 0 && nearNordic.distKm <= 1000) {
    activeRegion = 'nordic';
    nearestKey = nearNordic.key;
  } else if (state.pos.lat >= 0 && nearNa.distKm <= 1800) {
    activeRegion = 'na';
    nearestKey = nearNa.key;
  }

  if (camCard) camCard.style.display = activeRegion ? 'block' : 'none';
  if (activeRegion) {
    setText('h2Cam', activeRegion === 'na'
      ? (en ? 'North America All-Sky Cameras' : '北美天文台即時全天空實拍')
      : (en ? 'Nordic All-Sky Cameras' : '北歐天文台即時全天空實拍'));
    document.querySelectorAll('#camChips .chip').forEach(c => {
      c.style.display = c.dataset.region === activeRegion ? '' : 'none';
    });
    if (!state.camUserPicked || SKY_CAMS[state.camKey]?.region !== activeRegion) {
      state.camKey = nearestKey;
      state.camUserPicked = false;
    }
    selectSkyCam(state.camKey);
  }
}

function switchView(name, btn) {
  if (!name || !$('v-' + name)) return;
  if (state.activeView === name) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  state.tabScrollY[state.activeView] = window.scrollY || 0;
  state.activeView = name;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  $('v-' + name)?.classList.add('on');
  const navBtn = btn || document.querySelector(`.bottom-nav .nav-btn[data-view="${name}"]`);
  navBtn?.classList.add('on');
  if (name === 'sat') syncSatTab();
  haptic(6);
  const targetY = state.tabScrollY[name] || 0;
  window.scrollTo({ top: targetY, behavior: 'auto' });
  if (name === 'home') {
    const stg = document.querySelector('.sky-stage');
    if (stg) stg.style.opacity = targetY <= 10 ? '' : (targetY >= 95 ? '0' : String(Math.round((1 - (targetY - 10) / 85) * 100) / 100));
  }
  syncAnimBatteryGuard();
}

function renderLocationHeader() {
  const en = isEn();
  setText('locName', getPosDisplayName());
  // Location source uses the universal "my location" arrow (Apple Weather / Google Maps convention) instead of a
  // colour-only dot: arrow + "My location" = GPS, no arrow = picked city, explicit text when GPS failed.
  const isGps = state.pos.mode === 'gps';
  const isGpsErr = state.pos.mode === 'gps-err';
  const arrow = $('gpsDot');
  if (arrow) arrow.hidden = !isGps;
  $('gpsBtn')?.classList.toggle('gps-live', isGps);
  const tzResolved = Boolean(state.pos.tz && state.pos.tz !== 'auto' && state.pos.tz !== 'UTC');
  const clkLbl = $('clkLbl');
  if (clkLbl) {
    clkLbl.textContent = isGps
      ? ''
      : (isGpsErr ? (en ? '⚠ Location failed' : '⚠ 定位失敗') : (tzResolved ? (en ? 'Local' : '當地') : 'UTC'));
    clkLbl.style.display = clkLbl.textContent ? '' : 'none';
    clkLbl.classList.toggle('loc-err', isGpsErr);
  }
  const pick = $('pickBtn');
  if (pick) {
    const src = isGps ? (en ? 'My location' : '目前位置') : (isGpsErr ? (en ? 'Location failed, showing' : '定位失敗，目前顯示') : (en ? 'Selected place' : '手動選擇地點'));
    pick.setAttribute('aria-label', `${src}: ${getPosDisplayName()}. ${en ? 'Tap to change' : '點擊切換地點'}`);
  }

  syncPresetChipHighlight();
  const windyUrl = `https://www.windy.com/${state.pos.lat.toFixed(3)}/${state.pos.lon.toFixed(3)}?clouds,${state.pos.lat.toFixed(3)},${state.pos.lon.toFixed(3)},8`;
  const yrUrl = `https://www.yr.no/en/forecast/daily-table/${state.pos.lat.toFixed(3)},${state.pos.lon.toFixed(3)}`;
  const we = $('windyExtLink');
  if (we) we.href = windyUrl;
  const pm = $('pMet');
  if (pm) pm.href = isInNordicMetBox(state.pos.lat, state.pos.lon) ? yrUrl : 'https://open-meteo.com/en/docs';
  if ($('v-sat')?.classList.contains('on')) syncSatTab();
  savePos(state.pos);
}

// Relative freshness ("Updated 6 min ago") instead of repeating the clock time next to the clock
function renderSyncAge() {
  const el = $('syncTime');
  if (!el || !state.syncedAtMs) return;
  const en = isEn();
  const mins = Math.max(0, Math.floor((Date.now() - state.syncedAtMs) / 60000));
  const fresh = mins < 1
    ? (en ? 'Updated just now' : '剛剛更新')
    : (mins < 60
        ? (en ? `Updated ${mins} min ago` : `${mins} 分鐘前更新`)
        : (en ? `Updated ${Math.floor(mins / 60)} h ago` : `${Math.floor(mins / 60)} 小時前更新`));
  el.textContent = state.syncPartial ? (en ? `${fresh} (partial)` : `${fresh}（部分資料）`) : fresh;
}

function updateClockAndPhoto() {
  const now = new Date();
  try {
    const z = getZoneParts(now, state.pos.tz);
    setText('clk', `${z.hourStr}:${z.minStr}`);
  } catch {}
  renderSyncAge();
  return getMoonState(now, state.pos.lat, state.pos.lon);
}

// ====== Gauges, Charts & State Rendering ======
// Unified color semantics: Green (Excellent ≥65), Emerald (Good 40–64), Amber (Fair 18–39), Muted (Low/Cloudy), Red (Danger/Hazard ONLY), Blue (Daylight/Env ONLY)
const barColor = (pct) => (pct >= 65 ? 'var(--green)' : pct >= 35 ? 'var(--amber)' : 'var(--muted)');
const tierColor = (score) => (score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--good)' : score >= 18 ? 'var(--amber)' : 'var(--muted)');
function scoreTierWord(score, isDay, en) {
  if (isDay) return term(TERMS.status.tooBright, en);
  if (score >= 65) return term(TERMS.tier.excellent, en);
  if (score >= 40) return term(TERMS.tier.good, en);
  if (score >= 18) return term(TERMS.tier.fair, en);
  return term(TERMS.tier.low, en);
}
function scoreCssColor(hex) {
  if (hex === '#34f0b0' || hex === '#2ed39e') return 'var(--green)';
  if (hex === '#25b88a') return 'var(--good)';
  if (hex === '#ffcf5c' || hex === '#f4c350') return 'var(--amber)';
  if (hex === '#66bdff' || hex === '#64b2ff') return 'var(--blue)';
  if (hex === '#8b94a5') return 'var(--muted)';
  return 'var(--red)';
}
// Temperature unit: auto °F for Fahrenheit regions (US, Liberia, Bahamas, Belize, Cayman, Palau, Micronesia, Marshall Is.), else °C; user override persisted
const TEMP_UNIT_KEY = 'aurora_temp_unit';
const F_REGION_RE = /-(US|LR|BS|BZ|KY|PW|FM|MH)\b/i;
function detectTempUnit() {
  try {
    const saved = localStorage.getItem(TEMP_UNIT_KEY);
    if (saved === 'C' || saved === 'F') return saved;
  } catch {}
  if (!isEn()) return 'C';
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  return F_REGION_RE.test(nav) ? 'F' : 'C';
}
const fmtTemp = (t) => {
  if (t === null || t === undefined || !Number.isFinite(Number(t))) return '--';
  if (state.tempUnit === 'F') return `${Math.round(Number(t) * 9 / 5 + 32) || 0}°F`;
  const n = Math.round(Number(t)) || 0;
  return `${n > 0 ? '+' : ''}${n}°C`;
};
function syncTempUnitBtn() {
  const btn = $('unitBtn');
  if (!btn) return;
  const isF = state.tempUnit === 'F';
  btn.innerHTML = `<span class="${isF ? '' : 'u-on'}">°C</span><span class="u-sep">/</span><span class="${isF ? 'u-on' : ''}">°F</span>`;
  const en = isEn();
  const lbl = en ? `Temperature unit: ${isF ? 'Fahrenheit' : 'Celsius'}` : `溫度單位：${isF ? '華氏 °F' : '攝氏 °C'}`;
  btn.setAttribute('aria-label', lbl);
  btn.title = lbl;
}
function toggleTempUnit() {
  state.tempUnit = state.tempUnit === 'F' ? 'C' : 'F';
  try { localStorage.setItem(TEMP_UNIT_KEY, state.tempUnit); } catch {}
  syncTempUnitBtn();
  haptic(6);
  if (state.renderState) renderFromState(state.renderState);
}

function auroraStrengthWord(auroraScore, en) {
  const a = Number(auroraScore) || 0;
  if (a >= 75) return en ? 'Very strong' : '極強';
  if (a >= 50) return en ? 'Strong' : '強';
  if (a >= 25) return en ? 'Moderate' : '中等';
  return en ? 'Quiet' : '偏弱';
}

function renderGauge(sc, details) {
  state.lastScore = sc;
  syncAnimBatteryGuard();
  const en = isEn();
  const ringCol = sc.isTooBright ? 'var(--blue)' : (sc.outOfZone ? 'var(--muted)' : tierColor(sc.total));
  const numEl = $('ringNum');
  if (numEl) {
    animateScoreNumber(sc.total, numEl);
    numEl.style.color = sc.total < 18 ? 'var(--muted)' : 'var(--text)';
  }
  const grEl = $('ringGrade');
  if (grEl) { grEl.textContent = tGrade(sc.grade).replace(/^[^\p{L}\p{N}]+\s*/u, ''); grEl.style.color = ringCol; }

  const valCol = (pct, forceC) => forceC || (pct >= 65 ? 'var(--text)' : (pct >= 35 ? 'var(--amber)' : 'var(--muted)'));
  const setFactor = (vid, sid, pct, valHtml, subHtml, forceC) => {
    const ve = $(vid);
    if (ve) { ve.innerHTML = valHtml; ve.style.color = valCol(pct, forceC); }
    setHtml(sid, subHtml);
  };
  setFactor('fSkyVal', 'fSkySub', sc.skyScore, `${sc.skyScore}<span class="f-unit">%</span>`, details.skySubHtml ?? escapeHtml(details.skySub || ''));
  setFactor('fAurVal', 'fAurSub', sc.auroraScore, escapeHtml(auroraStrengthWord(sc.auroraScore, en)), details.aurSubHtml ?? escapeHtml(details.aurSub || ''));
  const darkValHtml = details.isTooBright
    ? escapeHtml(term(TERMS.status.tooBright, en))
    : `${sc.darkScore}<span class="f-unit">%</span>`;
  setFactor('fDarkVal', 'fDarkSub', sc.darkScore, darkValHtml, details.darkSubHtml ?? escapeHtml(details.darkSub || ''), details.isTooBright ? 'var(--blue)' : null);

  setHtml('fSkyIco', buildSkyFactorIcon(sc.skyScore, details.isTooBright));
  setHtml('fAurIco', buildAuroraFactorIcon(sc.auroraScore));
  setHtml('fDarkIco', buildMoonPhaseIcon({
    pct: details.moon?.pct ?? 0,
    up: Boolean(details.moon?.up),
    waxing: details.moon?.waxing !== false,
    isTooBright: Boolean(details.isTooBright)
  }));
}

function getVisibleHours() {
  if (!state.scoredHours.length) return [];
  // Fixed 24h horizon: always covers the whole upcoming night regardless of when the app is opened
  return state.scoredHours.slice(0, 24);
}

function pickBestInSlice(slice) {
  let best = null;
  for (const h of slice) {
    if (!h || h.isDay) continue;
    if (!best || h.score > best.score || (h.score === best.score && h.block < best.block)) best = h;
  }
  return best;
}

function isNextNightHour(h) {
  if (!h || !state.scoredHours.length) return false;
  const firstHrNum = parseInt(String(state.scoredHours[0]?.time || '12'), 10);
  const activeNightKey = (Number.isFinite(firstHrNum) && firstHrNum >= 6 && state.scoredHours[0]?.localDate)
    ? state.scoredHours[0].localDate
    : (state.scoredHours.find(x => x && !x.isDay)?.nightKey || state.scoredHours[0]?.nightKey || null);
  return Boolean(h.nightKey && activeNightKey && h.nightKey > activeNightKey);
}

function isNextCalendarDayHour(h) {
  const firstDate = state.scoredHours[0]?.localDate;
  return Boolean(firstDate && h?.localDate && h.localDate !== firstDate);
}

function formatHourLabel(h, en) {
  const t = escapeHtml(h?.time || '');
  if (!h) return t;
  if (!h.isDay && isNextNightHour(h)) return en ? `Tomorrow night ${t}` : `明晚 ${t}`;
  if (h.isDay && isNextCalendarDayHour(h)) return en ? `Tomorrow ${t}` : `明天 ${t}`;
  return t;
}

function renderWaveCard(focusBest = false) {
  const en = isEn();
  const vis = getVisibleHours();
  if (!vis.length) return;
  const outZoneKind = state.lastScore?.outOfZone || null;
  const isOutOfZone = Boolean(outZoneKind) && vis.every(h => !h || h.isDay || h.outOfZone || h.score === 0);
  const bestInVis = isOutOfZone ? null : pickBestInSlice(vis);
  const hz = vis.length;
  const bestTimeLbl = bestInVis ? formatHourLabel(bestInVis, en) : '';
  const bestIsNextNight = bestInVis ? isNextNightHour(bestInVis) : false;
  const fmtNextHr = (h) => {
    const m = /^(\d{2}):(\d{2})/.exec(String(h?.time || ''));
    if (!m) return '';
    return `${String((Number(m[1]) + 1) % 24).padStart(2, '0')}:${m[2]}`;
  };
  let bestText = '';
  if (isOutOfZone) {
    bestText = outZoneKind === 'need-storm'
      ? (en ? `Activity is too weak for this latitude — needs a stronger storm over the next ${hz}h.` : `目前活動偏弱，此緯度需要更強的地磁暴才會出現極光。`)
      : (en ? `Outside the auroral zone — tap the location above to explore aurora hotspots.` : `此地不在極光帶，點上方地名可切換北歐或北美極光熱點。`);
  } else if (!bestInVis) {
    bestText = en ? `Sky stays too bright for the next ${hz}h — check back after dark.` : `未來 ${hz} 小時天色偏亮，天黑後再查看。`;
  } else {
    const bIdx = vis.findIndex(h => (Number.isFinite(bestInVis.dtMs) && Number.isFinite(h.dtMs)) ? h.dtMs === bestInVis.dtMs : h.time === bestInVis.time);
    const findContiguous = (pred) => {
      if (bIdx < 0 || !pred(vis[bIdx])) return null;
      let s = bIdx, e = bIdx;
      while (s > 0 && pred(vis[s - 1])) s--;
      while (e < vis.length - 1 && pred(vis[e + 1])) e++;
      const startLbl = escapeHtml(vis[s].time || '');
      const endLbl = fmtNextHr(vis[e]);
      return { s, e, len: e - s + 1, range: (startLbl && endLbl) ? `${startLbl}–${endLbl}` : '' };
    };
    const dayPrefixZh = bestIsNextNight ? '明晚' : '今晚';
    const dayPrefixEn = bestIsNextNight ? 'tomorrow night' : 'tonight';
    if (bestInVis.score >= 40) {
      const win = findContiguous(h => h && !h.isDay && h.score >= 40);
      const tierTagZh = bestInVis.score >= 65 ? '極佳' : '適合觀測';
      if (win && win.len >= 2 && win.range) {
        bestText = en
          ? `Best <strong>${win.range}</strong> · peaks <strong>${bestTimeLbl}</strong>`
          : `${dayPrefixZh} <strong>${win.range}</strong> ${tierTagZh} · <strong>${bestTimeLbl}</strong> 最強`;
      } else {
        bestText = en
          ? `Brief window around <strong>${bestTimeLbl}</strong>`
          : `${dayPrefixZh} <strong>${bestTimeLbl}</strong> 前後短暫空檔`;
      }
    } else if (bestInVis.score >= 18) {
      const win = findContiguous(h => h && !h.isDay && h.score >= 18);
      if (win && win.len >= 2 && win.range) {
        bestText = en
          ? `Fair <strong>${win.range}</strong> · peaks <strong>${bestTimeLbl}</strong>`
          : `${dayPrefixZh} <strong>${win.range}</strong> 可留意微弱極光 · <strong>${bestTimeLbl}</strong> 最有機會`;
      } else {
        bestText = en
          ? `Brief break around <strong>${bestTimeLbl}</strong> — faint chance`
          : `<strong>${bestTimeLbl}</strong> 前後雲層稍薄，可留意微弱極光`;
      }
    } else if (bestInVis.clear >= 55) {
      bestText = en
        ? `Clearest around <strong>${bestTimeLbl}</strong>, but activity is quiet`
        : `<strong>${bestTimeLbl}</strong> 前後最晴，但極光活動偏弱`;
    } else {
      bestText = en
        ? `Mostly cloudy next ${hz}h — try Clear skies nearby`
        : `未來 ${hz} 小時偏多雲，建議查看「找晴空」`;
    }
  }
  const hb = $('homeBest');
  if (hb) {
    hb.className = 'wave-peak';
    hb.innerHTML = bestText;
  }
  let targetIdx = state.selectedHourIdx;
  if (focusBest || targetIdx < 0 || targetIdx >= vis.length) {
    const bIdx = bestInVis
      ? vis.findIndex(h => (Number.isFinite(bestInVis.dtMs) && Number.isFinite(h.dtMs)) ? h.dtMs === bestInVis.dtMs : h.time === bestInVis.time)
      : 0;
    targetIdx = bIdx >= 0 ? bIdx : 0;
  }
  selectForecastHour(targetIdx);
}

function selectForecastHour(idx) {
  const vis = getVisibleHours();
  if (!vis.length || idx < 0 || idx >= vis.length) return;
  state.selectedHourIdx = idx;
  const en = isEn();
  const h = vis[idx];
  const isOutOfZone = Boolean(state.lastScore?.outOfZone) && vis.every(x => !x || x.isDay || x.outOfZone || x.score === 0);
  const bestInVis = isOutOfZone ? null : pickBestInSlice(vis);
  setHtml('skyWaveChart', buildSkyWaveSVG(vis, bestInVis, idx, getLang()));
  const hasTemp = Number.isFinite(Number(h.temp));
  const tInt = hasTemp ? (Math.round(Number(h.temp)) || 0) : null;
  const darkPct = Number.isFinite(h.darkScore) ? Math.round(h.darkScore) : (h.isDay ? 0 : (h.moonUp ? Math.max(20, 100 - Math.round((h.moonPct || 0) * 0.4)) : 100));
  const darkTxt = h.isDay
    ? term(TERMS.status.tooBright, en)
    : (darkPct >= 95 ? term(TERMS.darkFull, en) : `${term(TERMS.darkShort, en)} ${darkPct}%`);
  const kpVal = Number.isFinite(h.kpFc) ? h.kpFc : null;
  const kpBadge = kpVal === null
    ? `Kp ${escapeHtml(h.kpFc)}`
    : (idx >= 3
        ? (en ? `~Kp ${Math.round(kpVal)}` : `約 Kp ${Math.round(kpVal)}`)
        : `Kp ${kpVal.toFixed(1)}`);
  const tStr = formatHourLabel(h, en);
  const scCol = h.isDay ? 'var(--blue)' : tierColor(h.score);
  const scTier = scoreTierWord(h.score, h.isDay, en);
  const clearPart = en ? `${h.clear}% clear` : `晴空 ${h.clear}%`;
  const tempPart = hasTemp ? fmtTemp(tInt) : '';
  const rightMeta = [clearPart, darkTxt, tempPart, kpBadge].filter(Boolean).join(' · ');
  setHtml('hourDetail',
    `<div class="sb-top"><strong>${tStr}</strong> <strong style="color:${scCol}">${h.score} ${scTier}</strong></div><div class="sb-bot">${rightMeta}</div>`);
  const prevBtn = $('hrPrevBtn'), nextBtn = $('hrNextBtn');
  if (prevBtn) prevBtn.disabled = idx <= 0;
  if (nextBtn) nextBtn.disabled = idx >= vis.length - 1;
}

function fmtMonthDay(iso, en) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (!en) return `${mo}月${d}日`;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  const loc = /^en/i.test(nav) ? nav : 'en-GB';
  try {
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, mo - 1, d)));
  } catch { return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]}`; }
}

function renderStormBanner(scales, noaaAlert) {
  const el = $('stormBanner');
  state.bannerState.stormSevere = false;
  state.bannerState.stormMinorTag = '';
  if (!el) return;
  const en = isEn();
  const hasAlert = noaaAlert && noaaAlert.active;
  const hasScale = scales && scales.active;
  if (!hasAlert && !hasScale) {
    syncBannerBudget();
    return;
  }

  const gNamesZh = { 1: '輕度', 2: '中度', 3: '強烈', 4: '嚴重', 5: '極端' };
  const gNamesEn = { 1: 'Minor', 2: 'Moderate', 3: 'Strong', 4: 'Severe', 5: 'Extreme' };
  if (hasAlert && (noaaAlert.kind === 'cme-shock' || noaaAlert.gScale >= (scales?.currentScale || 0))) {
    const lvl = Math.max(1, noaaAlert.gScale || 1);
    const isShock = noaaAlert.kind === 'cme-shock';
    const isWarn = Boolean(noaaAlert.isWarning);
    const isSevere = lvl >= 3 || isShock;
    if (!isSevere) {
      state.bannerState.stormMinorTag = isWarn
        ? (en ? `G${lvl} storm likely` : `可能發生 G${lvl} 地磁暴`)
        : (en ? `G${lvl} storm now` : `G${lvl} 地磁暴進行中`);
      syncBannerBudget();
      return;
    }
    el.className = 'storm-banner severe';
    const pill = isShock
      ? (isWarn ? (en ? 'Solar storm' : '太陽風暴') : (en ? 'Shock arrived' : '衝擊抵達'))
      : (isWarn ? (en ? `G${lvl} likely` : `預計 G${lvl}`) : `NOAA G${lvl}`);
    const txt = isShock
      ? (isWarn
          ? (en ? 'Solar storm on the way — aurora may brighten suddenly' : '太陽風暴即將抵達，極光可能突然增強')
          : (en ? 'Solar storm arrived — aurora may brighten suddenly' : '太陽風暴剛抵達地球，極光可能突然增強'))
      : (isWarn
          ? (en ? `${gNamesEn[lvl] || ''} geomagnetic storm (G${lvl}) likely` : `可能發生${gNamesZh[lvl] || ''}地磁暴（G${lvl}）`)
          : (en ? `${gNamesEn[lvl] || ''} geomagnetic storm (G${lvl}) now` : `${gNamesZh[lvl] || ''}地磁暴（G${lvl}）進行中`));
    el.innerHTML = `<span class="storm-pill">${escapeHtml(pill)}</span><span class="storm-txt">${escapeHtml(txt)}</span><span class="storm-arr">↗</span>`;
    state.bannerState.stormSevere = true;
    syncBannerBudget();
    return;
  }
  const isNow = scales.currentScale >= 1;
  const lvl = isNow ? scales.currentScale : scales.maxForecastScale;
  if (lvl < 3) {
    const dStr = fmtMonthDay(scales.peakDate, en);
    state.bannerState.stormMinorTag = isNow
      ? (en ? `G${lvl} storm now` : `G${lvl} 地磁暴進行中`)
      : (en ? `G${lvl} storm likely${dStr ? ` · ${dStr}` : ''}` : `${dStr ? `${dStr} ` : ''}可能發生 G${lvl} 地磁暴`);
    syncBannerBudget();
    return;
  }
  el.className = 'storm-banner severe';
  const desc = en ? (gNamesEn[lvl] || 'Geomagnetic') : (gNamesZh[lvl] || '');
  const dStr = fmtMonthDay(scales.peakDate, en);
  const txt = isNow
    ? (en ? `${desc} geomagnetic storm now — aurora reaching further` : `${desc}地磁暴進行中 · 極光範圍擴大`)
    : (en ? `${desc} geomagnetic storm likely${dStr ? ` · ${dStr}` : ''}` : `${dStr ? `${dStr} ` : ''}可能發生${desc}地磁暴`);
  el.innerHTML = `<span class="storm-pill">NOAA G${lvl}</span><span class="storm-txt">${escapeHtml(txt)}</span><span class="storm-arr">↗</span>`;
  state.bannerState.stormSevere = true;
  syncBannerBudget();
}

function fmtNightDate(n, en) {
  if (!en || !n?.key) return n?.dateLabel || '';
  // EN dates follow the reader's locale (en-GB "26 Nov" / en-US "Nov 26"); never the US-only "11/26" numeric form
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  const loc = /^en/i.test(nav) ? nav : 'en-GB';
  try {
    const [y, m, d] = n.key.split('-').map(Number);
    return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch {
    return n.dateLabel || '';
  }
}

function render3NightOutlook(nights) {
  const grid = $('outlookGrid');
  if (!grid || !Array.isArray(nights)) return;
  const en = isEn();
  // ★ Best is an explicit label (never a mystery fill): only the top-scoring night that reaches the unified Good tier (>=40)
  let bestIdx = -1;
  nights.forEach((n, i) => {
    if (!n || !n.scoreAvailable || (n.bestNightScore ?? 0) < 40) return;
    const cur = bestIdx >= 0 ? nights[bestIdx] : null;
    if (!cur || n.bestNightScore > cur.bestNightScore
      || (n.bestNightScore === cur.bestNightScore && (n.clearDarkHrs || 0) > (cur.clearDarkHrs || 0))) bestIdx = i;
  });
  grid.innerHTML = nights.map((n, i) => {
    const bCol = n.badgeColor?.startsWith('#') ? scoreCssColor(n.badgeColor) : (n.badgeColor || 'var(--muted)');
    const hasScore = Boolean(n.scoreAvailable);
    const scoreVal = Math.round(n.bestNightScore || 0);
    const dayTxt = n.dayLabel || n.label || '';
    const dateTxt = fmtNightDate(n, en);
    const clearTxt = n.bestClear !== null
      ? (en ? `${n.bestClear}% clear` : `${term(TERMS.clearSky, false)} ${n.bestClear}%`)
      : term(TERMS.status.noDarkSky, en);
    const kpTxt = n.kpAvailable === false
      ? (en ? 'Kp --' : 'Kp 更新中')
      : (i > 0
          ? (en ? `~Kp ${Math.round(Number(n.maxKp || 0))}` : `約 Kp ${Math.round(Number(n.maxKp || 0))}`)
          : `Kp ${Number(n.maxKp || 0).toFixed(1)}`);
    const gTag = n.kpAvailable !== false && n.gScale >= 1 ? ` <span class="od-g">G${n.gScale}</span>` : '';
    const isBest = i === bestIdx;
    const winTxt = n.bestWindow ? `${term(TERMS.peak, en)} ${n.bestWindow}` : '';
    const skyIco = buildOutlookSkyIcon({ score: scoreVal, clearPct: n.bestClear, scoreAvailable: hasScore });
    const barPct = hasScore ? Math.max(8, Math.min(100, scoreVal)) : 0;
    const barBg = hasScore && scoreVal >= 65
      ? 'linear-gradient(90deg, var(--good), var(--green))'
      : (hasScore ? bCol : 'var(--muted)');
    const rightParts = [
      winTxt ? `<span class="nowrap">${escapeHtml(winTxt)}</span>` : '',
      `<span class="nowrap">${escapeHtml(clearTxt)}</span>`,
      `<span class="nowrap">${escapeHtml(kpTxt)}${gTag}</span>`
    ].filter(Boolean).join(' · ');
    const aria = hasScore
      ? (en ? `${dayTxt} ${dateTxt}: forecast score ${scoreVal}, ${n.badge}${winTxt ? `, ${winTxt}` : ''}` : `${dayTxt} ${dateTxt}：預估觀測指數 ${scoreVal}，${n.badge}${winTxt ? `，${winTxt}` : ''}`)
      : `${dayTxt} ${dateTxt}: ${n.badge}`;
    return `<div class="outlook-row${isBest ? ' od-best' : ''}" role="group" aria-label="${escapeHtml(aria)}${isBest ? (en ? ' (best night)' : '（最佳）') : ''}">
      <div class="od-row-top">
        <div class="od-head">
          <div class="od-day">${escapeHtml(dayTxt)}</div>
          <div class="od-date">${escapeHtml(dateTxt)}</div>
        </div>
        <div class="od-ico" aria-hidden="true">${skyIco}</div>
        <div class="od-bar" aria-hidden="true"><div class="od-bar-fill" style="width:${barPct}%;background:${barBg};"></div></div>
        <div class="od-score${hasScore ? '' : ' od-na'}" style="${hasScore ? `color:${bCol};` : ''}">${hasScore ? scoreVal : '--'}</div>
      </div>
      <div class="od-row-sub">
        <span class="od-sub-l">${isBest ? `<span class="od-best-tag od-flag-pill">★ ${term(TERMS.best, en)}</span> · ` : ''}<span class="od-badge" style="color:${hasScore ? bCol : 'var(--muted)'};">${escapeHtml(n.badge)}</span></span>
        <span class="od-stat">${rightParts}</span>
      </div>
    </div>`;
  }).join('');
}

function selectBzPoint(idx) {
  const st = state.bzChartState;
  if (!st || !Array.isArray(st.series) || st.series.length < 2) return;
  const clampedIdx = Math.max(0, Math.min(st.series.length - 1, idx));
  state.selectedBzIdx = clampedIdx;
  const { series, tz, speed, bal } = st;
  const en = isEn();
  setHtml('bzChart', buildBzChartSVG(series, tz, speed, bal, getLang(), clampedIdx));

  const pt = series[clampedIdx];
  const etaMin = Number.isFinite(bal?.etaMin) ? Math.round(bal.etaMin) : Engine.computeL1EtaMin(speed);
  const tStr = utcTagToLocalHM(pt?.time_tag, tz, etaMin);
  const rawE = (bal && Array.isArray(bal.energy120) && bal.energy120.length === series.length)
    ? bal.energy120[clampedIdx]
    : Engine.bzToEnergy(pt?.bz, speed);
  const eVal = Math.max(0, Math.min(100, Math.round(Number.isFinite(rawE) ? rawE : 4)));
  const eCol = eVal >= 62 ? 'var(--green)' : eVal >= 25 ? 'var(--amber)' : 'var(--muted)';
  const eWord = eVal >= 62 ? term(TERMS.solarWind.active, en) : eVal >= 25 ? term(TERMS.solarWind.building, en) : term(TERMS.solarWind.low, en);

  const ptMs = Engine.parseUtcMs(pt?.time_tag);
  const ptArrMs = Number.isFinite(ptMs) ? ptMs + etaMin * 60000 : NaN;
  let refArrMs = Date.now();
  if (bal && Number.isInteger(bal.arrivingIdx) && bal.arrivingIdx >= 0 && bal.arrivingIdx < series.length) {
    const aMs = Engine.parseUtcMs(series[bal.arrivingIdx]?.time_tag);
    if (Number.isFinite(aMs)) refArrMs = aMs + etaMin * 60000;
  }
  const diffMin = Number.isFinite(ptArrMs) && Number.isFinite(refArrMs) ? Math.round((ptArrMs - refArrMs) / 60000) : null;
  let phaseTxt = '';
  if (diffMin !== null) {
    if (diffMin > 2) phaseTxt = en ? `In ~${diffMin}m` : `約 ${diffMin} 分後抵達`;
    else if (diffMin >= -2) phaseTxt = en ? 'Arriving now' : '正抵達地球';
    else phaseTxt = en ? 'Arrived' : '已抵達';
  }
  const bzVal = Number(pt?.bz);
  const bzTxt = Number.isFinite(bzVal) ? `Bz ${bzVal > 0 ? `+${bzVal.toFixed(1)}` : bzVal.toFixed(1)} nT` : '';
  const spdInt = Number.isFinite(Number(speed)) ? Math.round(Number(speed)) : null;
  const spdTxt = spdInt !== null ? `${spdInt} km/s` : '';
  const metaTxt = [phaseTxt, bzTxt, spdTxt].filter(Boolean).join(' · ');

  setHtml('bzDetail',
    `<div class="sb-top"><strong>${escapeHtml(tStr)}</strong> <strong style="color:${eCol}">${escapeHtml(eWord)} · ${eVal}</strong></div><div class="sb-bot">${escapeHtml(metaTxt)}</div>`);
  const prevBtn = $('bzPrevBtn'), nextBtn = $('bzNextBtn');
  if (prevBtn) prevBtn.disabled = clampedIdx <= 0;
  if (nextBtn) nextBtn.disabled = clampedIdx >= series.length - 1;
}

function renderNoaaSection({ magSeries, chartSeries, speed, goesSub, noaaScales, noaaAlert, bal, noaaOk, noaaLagMin, pos }) {
  const en = isEn();
  const tz = pos?.tz || state.pos.tz;
  renderStormBanner(noaaScales, noaaAlert);

  const enSum = summarizeEnergyTrend(chartSeries, speed, bal);
  const liveBz = Number.isFinite(bal?.cleanLatestBz)
    ? bal.cleanLatestBz
    : (chartSeries?.length && Number.isFinite(chartSeries[chartSeries.length - 1]?.bz) ? chartSeries[chartSeries.length - 1].bz : null);
  const etaMin = Number.isFinite(bal?.etaMin) ? Math.round(bal.etaMin) : 45;
  const spdInt = Number.isFinite(Number(speed)) ? Math.round(Number(speed)) : null;

  // Single source of truth for incoming aurora coupling energy (0..100) across badge, summary, meter & 2h curve
  const latestEnergy = (bal && Array.isArray(bal.energy120) && bal.energy120.length)
    ? bal.energy120[bal.energy120.length - 1]
    : (liveBz !== null ? Engine.bzToEnergy(liveBz, speed) : null);

  const isBurst = Boolean(goesSub?.active || bal?.shockActive);
  const isBrighten = Boolean(enSum.good || (latestEnergy !== null && latestEnergy >= 62));
  const isBuilding = Boolean(!isBrighten && ((latestEnergy !== null && latestEnergy >= 25) || (enSum.raw && enSum.raw.includes('增強'))));

  const bzBadge = $('bzBadge');
  if (bzBadge) {
    const leadTag = en ? `~${etaMin}m` : `約 ${etaMin} 分後`;
    if (isBurst) {
      bzBadge.innerHTML = `${leadTag} · <strong style="color:var(--green);">${escapeHtml(term(TERMS.solarWind.strong, en))}</strong>`;
      bzBadge.className = 'sw-badge sw-good';
    } else if (isBrighten) {
      bzBadge.innerHTML = `${leadTag} · <strong style="color:var(--green);">${escapeHtml(term(TERMS.solarWind.active, en))}</strong>`;
      bzBadge.className = 'sw-badge sw-good';
    } else if (isBuilding) {
      bzBadge.innerHTML = `${leadTag} · <strong style="color:var(--amber);">${escapeHtml(term(TERMS.solarWind.building, en))}</strong>`;
      bzBadge.className = 'sw-badge sw-warn';
    } else if (enSum.raw || liveBz !== null) {
      bzBadge.innerHTML = `${leadTag} · <strong>${escapeHtml(term(TERMS.solarWind.low, en))}</strong>`;
      bzBadge.className = 'sw-badge';
    } else {
      bzBadge.textContent = '';
      bzBadge.className = 'sw-badge';
    }
  }
  const eb = $('energyBanner');
  if (eb) {
    eb.className = 'sw-summary' + (isBurst || isBrighten ? ' sw-sum-good' : (isBuilding ? ' sw-sum-warn' : ''));
    if (goesSub?.active) {
      eb.textContent = en
        ? 'Sudden magnetic energy release detected — aurora may brighten quickly.'
        : '衛星偵測到磁尾能量釋放，極光可能短時間內突然變亮。';
    } else if (bal?.shockActive) {
      eb.textContent = en
        ? `Strong solar wind shock arriving — aurora may burst in ~${etaMin} min.`
        : `偵測到強太陽風波動，約 ${etaMin} 分鐘後極光可能明顯增強。`;
    } else if (isBrighten) {
      eb.textContent = en
        ? `Incoming solar wind is strong — aurora may brighten in ~${etaMin} min.`
        : `上游衛星測得強極光能量，約 ${etaMin} 分鐘內可能變亮，建議留意天空。`;
    } else if (isBuilding) {
      eb.textContent = en
        ? `Solar wind energy is building — aurora may strengthen within ~${etaMin} min.`
        : `極光能量正在累積，未來 ${etaMin} 分鐘內有機會轉強。`;
    } else if (liveBz !== null) {
      eb.textContent = en
        ? `No burst signal from upstream satellites for the next ~${etaMin} min.`
        : `未來約 ${etaMin} 分鐘暫無極光爆發訊號，目前維持平靜。`;
    } else {
      eb.textContent = enSum.text;
    }
  }
  const swMeter = $('swMeter');
  if (swMeter) {
    const meterHtml = buildSolarWindMeterHtml({ bz: liveBz, speed, energy: latestEnergy, en });
    swMeter.innerHTML = meterHtml;
    swMeter.style.display = meterHtml ? '' : 'none';
  }
  const bzStr = liveBz !== null ? `Bz ${liveBz > 0 ? `+${liveBz.toFixed(1)}` : liveBz.toFixed(1)}` : '';
  const spdStr = spdInt !== null ? `${spdInt} km/s` : '';
  state.swTelemetryTag = [bzStr, spdStr].filter(Boolean).join(' · ');
  syncSwToggleUI();

  const lastM = magSeries.length ? magSeries[magSeries.length - 1] : null;
  const lastArrMs = lastM ? Engine.parseUtcMs(lastM.time_tag) + etaMin * 60000 : NaN;
  const isFutureEta = Number.isFinite(lastArrMs) && lastArrMs >= Date.now() - 2 * 60000;
  const etaClock = isFutureEta ? utcTagToLocalHM(lastM.time_tag, tz, etaMin) : '';
  const hasDashedLine = Boolean(bal && Number.isInteger(bal.arrivingIdx) && bal.arrivingIdx > 4 && bal.arrivingIdx < (chartSeries?.length || 0) - 4);
  const nowClock = hasDashedLine ? utcTagToLocalHM(chartSeries[bal.arrivingIdx]?.time_tag, tz, etaMin) : '';
  setHtml('bzHtmlHead', hasDashedLine && nowClock
    ? (en
        ? `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, true))}</span><span>Now <strong>${escapeHtml(nowClock)}</strong> · Incoming right</span>`
        : `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, false))}</span><span>現在 <strong>${escapeHtml(nowClock)}</strong> · 虛線右側陸續抵達</span>`)
    : (en
        ? `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, true))}</span><span>Estimated Earth arrival</span>`
        : `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, false))}</span><span>已換算為到達地球當地時間</span>`));
  setText('etaHint', en
    ? (hasDashedLine && etaClock
        ? `Right of dashed line = arriving by ${etaClock}`
        : (etaClock ? `Earth-arrival local time (incoming wind arriving by ${etaClock})` : 'Time axis shows estimated Earth arrival'))
    : (hasDashedLine && etaClock
        ? `虛線右側＝已測得太陽風，預估於 ${etaClock} 前陸續到達`
        : (etaClock ? `時間軸為到達地球當地時間（已測得太陽風約 ${etaClock} 前抵達）` : '時間軸已換算為到達地球的當地時間')));

  if (Array.isArray(chartSeries) && chartSeries.length >= 2) {
    state.bzChartState = { series: chartSeries, tz, speed, bal };
    const defaultIdx = (state.selectedBzIdx >= 0 && state.selectedBzIdx < chartSeries.length)
      ? state.selectedBzIdx
      : chartSeries.length - 1;
    selectBzPoint(defaultIdx);
  } else {
    state.bzChartState = null;
    state.selectedBzIdx = -1;
    setHtml('bzChart', buildBzChartSVG(chartSeries, tz, speed, bal, getLang()));
    setHtml('bzDetail', en
      ? '<span>No live satellite samples available</span>'
      : '<span>暫無即時衛星數值</span>');
  }

  const pNoaa = $('pNoaa');
  if (pNoaa) {
    if (noaaOk) {
      const stale = noaaLagMin !== null && noaaLagMin > 45;
      pNoaa.textContent = stale
        ? (en ? `NOAA Aurora Map (${noaaLagMin}m lag) ↗` : `NOAA 極光總覽（延遲 ${noaaLagMin}m）↗`)
        : (en ? 'NOAA Aurora Map ↗' : 'NOAA 極光總覽 ↗');
    } else {
      pNoaa.textContent = en ? 'NOAA Aurora Map (offline) ↗' : 'NOAA 極光總覽（離線）↗';
    }
  }
  return etaClock;
}

function fmtWinterDrive(km, en) {
  if (!Number.isFinite(km) || km <= 0) return '';
  const mins = Math.max(15, Math.round(((km / 65) * 60) / 5) * 5);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const dur = h > 0 ? `${h}h${m ? ` ${String(m).padStart(2, '0')}m` : ''}` : `${m}m`;
  return en ? `~${dur} drive` : `約 ${dur}`;
}

function formatDarkCountdownSub(darkWin, moon, en) {
  if (darkWin?.state === 'midnight-sun') return en ? 'Midnight sun' : '極晝偏亮';
  if (darkWin?.state === 'twilight-wait' && darkWin.nextDarkHM) {
    return en ? `Dark ${escapeHtml(darkWin.nextDarkHM)}` : `${escapeHtml(darkWin.nextDarkHM)} 天黑`;
  }
  const moonBright = Boolean(moon.up && moon.effMoonPct >= 40);
  const moonLbl = (moon.pct ?? 0) >= 85
    ? (en ? 'Full moon' : '滿月')
    : (en ? 'Moonlit' : '有亮月');
  if (darkWin?.state === 'polar-night') {
    return moonBright
      ? (en ? `Polar night · ${moonLbl}` : `極夜 · ${moonLbl}`)
      : (en ? 'Polar night' : '極夜全暗');
  }
  if (darkWin?.state === 'dark' && darkWin.darkEndHM) {
    if (moonBright) {
      return en
        ? `<span class="nowrap">${moonLbl}</span><span class="sub-dot" aria-hidden="true">·</span><span class="nowrap">Light ${escapeHtml(darkWin.darkEndHM)}</span>`
        : `<span class="nowrap">${moonLbl}</span><span class="sub-dot" aria-hidden="true">·</span><span class="nowrap">${escapeHtml(darkWin.darkEndHM)} 天亮</span>`;
    }
    return en ? `<span class="nowrap">Light ${escapeHtml(darkWin.darkEndHM)}</span>` : `<span class="nowrap">${escapeHtml(darkWin.darkEndHM)} 天亮</span>`;
  }
  return moonBright ? moonLbl : term(TERMS.darkFull, en);
}

function renderRoadLinks(pos, en) {
  const wrap = $('roadLinks');
  if (!wrap || !pos) return;
  let links = [];
  if (pos.lat >= 55 && pos.lat <= 72 && pos.lon >= -26 && pos.lon <= 35) {
    if (pos.lon <= -10) {
      links.push({ id: 'roadIs', url: 'https://umferdin.is/en', zh: '冰島 Umferðin ↗', en: 'Iceland Umferðin ↗' });
    } else {
      if (pos.lon < 26 || pos.lat >= 69.0) links.push({ id: 'roadNo', url: 'https://www.vegvesen.no/trafikk', zh: '挪威 Vegvesen ↗', en: 'Norway Vegvesen ↗' });
      if (pos.lon >= 11 && pos.lon <= 25) links.push({ id: 'roadSe', url: 'https://www.trafikverket.se/trafikinformation/vag/', zh: '瑞典 Trafikverket ↗', en: 'Sweden Trafikverket ↗' });
      if (pos.lon >= 20) links.push({ id: 'roadFi', url: 'https://liikennetilanne.fintraffic.fi/', zh: '芬蘭 Fintraffic ↗', en: 'Finland Roads ↗' });
    }
  } else if (pos.lat >= 45 && pos.lon <= -50) {
    if (pos.lon <= -135) links.push({ id: 'roadAk', url: 'https://511.alaska.gov/', zh: '阿拉斯加 511 ↗', en: 'Alaska 511 ↗' });
    if (pos.lon >= -142 && pos.lon <= -123) links.push({ id: 'roadYk', url: 'https://511yukon.ca/', zh: '育空 511 ↗', en: 'Yukon 511 ↗' });
    if (pos.lon >= -125) links.push({ id: 'roadNwt', url: 'https://www.inf.gov.nt.ca/en/services/highways/highway-conditions', zh: '黃刀公路路況 ↗', en: 'NWT Highways ↗' });
  } else if (pos.lat <= -30 && pos.lon >= 130) {
    if (pos.lon >= 160) links.push({ id: 'roadNz', url: 'https://www.journeys.nzta.govt.nz/', zh: '紐西蘭 NZTA 路況 ↗', en: 'NZTA Journeys ↗' });
    else links.push({ id: 'roadTas', url: 'https://www.police.tas.gov.au/community-alerts/', zh: '塔斯馬尼亞路況 ↗', en: 'Tasmania Alerts ↗' });
  }
  if (!links.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'flex';
  const lbl = en ? 'Road conditions:' : '即時路況與封路：';
  wrap.innerHTML = `<span id="roadLbl" class="road-lbl">${lbl}</span>` +
    links.map(l => `<a id="${l.id}" class="tpill tpill-link" target="_blank" rel="noopener noreferrer" href="${l.url}">${en ? l.en : l.zh}</a>`).join('');
}

function renderCompassPanel(dirResults, pos, en) {
  renderRoadLinks(pos, en);
  const sum = summarizeCompass(dirResults);
  const cs = $('compassSummary');
  if (cs) {
    cs.className = 'callout ' + (sum?.good ? 'good' : 'warn');
    cs.textContent = sum ? sum.text : (en ? 'No data' : '無資料');
  }
  setHtml('radarSvg', buildCompassRadarSVG(dirResults, pos, getLang()));

  const cBox = $('compassBox');
  if (!cBox || !Array.isArray(dirResults)) return;
  cBox.innerHTML = dirResults.slice(1).map(d => {
    const isBest = sum && sum.bestKey === d.key;
    const unavail = Boolean(d.unavailable) || !Number.isFinite(d.avg3h);
    const hazard = isCorridorHazard(d);
    const clear3h = unavail ? null : Math.max(0, Math.min(100, Math.round(100 - d.avg3h)));
    const clearNow = unavail ? null : Math.max(0, Math.min(100, Math.round(100 - d.nowC)));
    const col = unavail ? '' : (d.isOcean ? 'c-blue' : (hazard ? 'c-red' : (clear3h >= 65 ? 'c-green' : clear3h >= 35 ? 'c-amber' : 'c-muted')));
    const kmVal = Number.isFinite(d.roadKm) ? d.roadKm : (Number.isFinite(d.distKm) ? d.distKm : Math.round(computeDistanceKm(pos.lat, pos.lon, d.lat, d.lon)));
    const driveEst = (!d.isOcean && !d.isGeneric && Number.isFinite(kmVal) && kmVal > 0) ? fmtWinterDrive(kmVal, en) : '';
    const distTag = d.isGeneric
      ? (en ? ' · straight-line (verify road)' : ' · 直線參考（請確認路況）')
      : (Number.isFinite(kmVal) && kmVal > 0
          ? (en ? ` · ~${kmVal} km${driveEst ? ` (${driveEst})` : ''}` : ` · ~${kmVal} km${driveEst ? `（${driveEst}）` : ''}`)
          : '');
    const windMs = Number(d.maxWind3h) || 0;
    const precipMm = Number(d.maxPrecip3h) || 0;
    const hazards = [];
    if (!d.isOcean && !unavail && windMs >= 12) {
      hazards.push(en ? `⚠ Gale ${Math.round(windMs)}m/s` : `⚠ 強風 ${Math.round(windMs)}m/s`);
    } else if (!d.isOcean && !unavail && windMs >= 9 && (d.temp ?? 5) <= 1.5) {
      hazards.push(en ? `⚠ Drifting snow ${Math.round(windMs)}m/s` : `⚠ 吹雪強風 ${Math.round(windMs)}m/s`);
    }
    if (!d.isOcean && !unavail && precipMm >= 0.2 && d.temp <= 1.5) {
      hazards.push(en ? 'Snow/Ice risk' : '降雪／結冰風險');
    }
    if (!d.isOcean && !unavail && Number.isFinite(d.temp) && d.temp <= -25) {
      hazards.push(en ? '⚠ Extreme cold' : '⚠ 極寒凍傷風險');
    }
    const rainTag = (!d.isOcean && !unavail && precipMm >= 0.2 && d.temp > 1.5)
      ? (en ? ' · Rain' : ' · 降雨')
      : '';
    const hazardHtml = hazards.length ? `<div class="dir-hazards">${escapeHtml(hazards.join(' · '))}</div>` : '';
    const noteText = en ? (d.roadNoteEn || '') : (d.roadNote || '');
    const isPositiveNote = /雨影|晴空|暗空|主幹道|rain shadow|dark sky|main highway|paved/i.test(noteText);
    const noteHtml = noteText ? `<div class="${isPositiveNote ? 'dir-tip' : 'dir-note'}">${escapeHtml(noteText)}</div>` : '';
    const nav = (d.isOcean || unavail)
      ? (d.isOcean
          ? `<span class="dir-ref c-blue">${en ? 'Open Sea' : '海域參考'}</span>`
          : `<span class="dir-ref c-muted">${en ? 'Unavailable' : '暫無資料'}</span>`)
      : `<a class="btn ${hazard ? 'btn-hazard' : 'btn-blue'}" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&origin=${pos.lat},${pos.lon}&destination=${d.lat},${d.lon}&travelmode=driving">${en ? (hazard ? 'Drive anyway' : 'Drive') : (hazard ? '仍要導航' : '導航')}</a>`;
    const statLine = unavail
      ? (en ? 'Forecast temporarily unavailable' : '此方向氣象暫時無法取得')
      : `${en ? 'Next 3h' : '3 小時晴空率'} <strong class="${col}">${clear3h}%</strong> · ${en ? 'now' : '目前'} ${clearNow}% · ${fmtTemp(d.temp)}${rainTag}`;
    return `<div class="dir ${isBest ? 'best' : ''} ${hazard ? 'hazard' : ''} ${d.isOcean ? 'sea' : ''}" data-dir-card="${escapeHtml(d.key)}">
      <div class="dir-main"><div class="dir-title">${escapeHtml(tDirLabel(d.label))}${isBest ? ` <span class="dir-best-tag">${en ? 'Best' : '最佳'}</span>` : ''}<span class="dir-dist">${distTag}</span></div>
      <div class="dir-stat">${statLine}</div>${hazardHtml}${noteHtml}</div>
      ${nav}
    </div>`;
  }).join('');
}

const SVG_ICO_BOLT = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.2 1.8L3.8 9h4.1l-1.1 5.2L12.2 7H8.1l1.1-5.2z"/></svg>`;
const SVG_ICO_WARN = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2.2L14.2 13H1.8L8 2.2z"/><path d="M8 6.4v3.2"/><circle cx="8" cy="11.4" r="0.65" fill="currentColor" stroke="none"/></svg>`;
const SVG_ICO_CHEV_R = `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>`;
const SVG_ICO_ARR_R = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8h9M9 4.5L12.5 8 9 11.5"/></svg>`;

function renderFromState(st) {
  if (!st) return;
  const en = isEn();
  const {
    pos: stPos, magSeries, chartSeries, speed, bz, kp, ovation, hpiGw, goesSub, noaaScales, noaaAlert, kyotoDst, enlilForecast, predKp1h, bal,
    noaaOk, noaaLagMin, hereHrs, dirResults, weatherSourceLabel, usedMet, cloudConsensus, metarObs, metarFusion,
    sunAltNow, mltNow, moon, sc, scNext, bestDark, nights3, multiDayPts, kpForecast, fetchedAt
  } = st;
  const pos = stPos || state.pos;
  const refNow = fetchedAt instanceof Date ? fetchedAt : (fetchedAt ? new Date(fetchedAt) : new Date());
  const safeBal = bal || { etaMin: 45, nowBz: bz, nextBz: bz, cleanLatestBz: bz, nowPdyn: null, nowShockJumpNpa: 0, pdyn: null, shockActive: false, energy120: [], arrivingIdx: -1 };

  const etaClock = renderNoaaSection({
    magSeries: magSeries || [], chartSeries: chartSeries || [], speed, goesSub, noaaScales, noaaAlert,
    bal: safeBal, noaaOk, noaaLagMin, pos
  });
  if (!hereHrs || !hereHrs.length) return;
  const c0 = hereHrs[0].block;

  // Dynamic ambient sky mood (subtle 1P atmosphere)
  const severeStorm = Boolean((noaaAlert?.active && (noaaAlert.kind === 'cme-shock' || (noaaAlert.gScale || 0) >= 3)) || (noaaScales?.currentScale || 0) >= 3);
  document.body.dataset.mood = severeStorm ? 'storm' : (sc.total >= 65 ? 'prime' : (sc.total >= 35 ? 'active' : 'quiet'));

  const metarCalibrated = Boolean(
    metarObs && metarFusion?.applied && (metarObs.distKm ?? 99) <= 25 && (metarObs.ageMin ?? 99) <= 60
  );
  const expNow = explainAuroraScore({
    lat: pos.lat, lon: pos.lon,
    cloudNow: c0, sunAlt: sunAltNow,
    bz: safeBal.nowBz ?? bz, speed, kp, ovation, hpiGw,
    substormJumpNt: goesSub ? goesSub.jumpNt : 0,
    pdyn: safeBal.nowPdyn, shockJumpNpa: safeBal.nowShockJumpNpa,
    newell: safeBal.nowNewell, preconditionedNewell60: safeBal.avgNewell60,
    dst: kyotoDst?.dst ?? null,
    mlt: mltNow, effMoonPct: moon.effMoonPct,
    moonPct: moon.pct, moonAltDeg: moon.altDeg,
    scNext, noaaOk, noaaLagMin, usedMet, cloudConsensus, hereHrs, noaaAlert, predKp1h, metarCalibrated
  });

  const confBtn = $('fcConfBtn');
  if (confBtn) {
    const degraded = expNow.confidence.level === 'low' || !noaaOk || (noaaLagMin !== null && noaaLagMin > 45) || cloudConsensus?.level === 'low';
    confBtn.classList.toggle('warn', degraded && expNow.confidence.primaryReason !== 'obs-calibrated');
    const lbl = degraded ? escapeHtml(expNow.confidence.badgeText) : (en ? 'Why?' : '說明');
    confBtn.innerHTML = `<span>${lbl}</span>${SVG_ICO_CHEV_R}`;
  }

  // Live raw telemetry & dedicated local weather-station calibration note inside Trust Sheet
  const displayBz = Number.isFinite(safeBal.cleanLatestBz) ? safeBal.cleanLatestBz : bz;
  const rawParts = [
    `Bz ${displayBz !== null && Number.isFinite(displayBz) ? (displayBz >= 0 ? '+' : '') + displayBz.toFixed(1) + ' nT' : '--'}`,
    `${speed && Number.isFinite(speed) ? Math.round(speed) + ' km/s' : '-- km/s'}`,
    `Kp ${kp !== null && Number.isFinite(kp) ? kp.toFixed(2) : '--'}`
  ];
  if (hpiGw !== null && Number.isFinite(hpiGw)) rawParts.push(`HPI ${Math.round(hpiGw)} GW`);
  if (safeBal.pdyn !== null && Number.isFinite(safeBal.pdyn)) rawParts.push(`${safeBal.pdyn} nPa`);
  if (kyotoDst && Number.isFinite(kyotoDst.dst)) rawParts.push(`Dst ${kyotoDst.dst} nT`);
  if (metarObs && metarFusion?.applied) {
    const ceilStr = metarObs.ceilingM ? ` ${metarObs.ceilingM}m` : '';
    rawParts.push(`METAR ${metarObs.icao} ${metarObs.skyCode}${ceilStr} (${metarObs.ageMin}m)`);
  }
  const showMetarNote = Boolean(metarObs && metarFusion?.applied && (metarFusion.discrepancyFlag || cloudConsensus?.level === 'low'));
  const stLabel = metarObs?.name ? `${metarObs.name} · ${metarObs.icao}` : (metarObs?.icao || '');
  const metarNote = showMetarNote
    ? (en
        ? `Local weather station (${stLabel}, ${metarObs.distKm} km) observed ${metarObs.clearPct}% clear ${metarObs.ageMin} min ago${metarObs.ceilingM ? ` · cloud base ${metarObs.ceilingM} m` : ''} — short-term clouds adjusted.`
        : `當地氣象站（${stLabel}，距 ${metarObs.distKm} km）${metarObs.ageMin} 分鐘前實測晴空率 ${metarObs.clearPct}%${metarObs.ceilingM ? ` · 雲底 ${metarObs.ceilingM} m` : ''}，已用於修正短時雲量預報。`)
    : '';
  renderTrustSheetLive(expNow, sc, rawParts.join(' · '), metarNote);

  setHtml('skySvg', buildSkySceneSVG({
    cloudPct: c0, auroraScore: sc.auroraScore, moonUp: moon.up, moonPct: moon.pct, isTooBright: sc.isTooBright
  }));

  const t0Int = Math.round(hereHrs[0].temp) || 0;
  const wc0Int = Math.round(hereHrs[0].windChill ?? hereHrs[0].temp) || 0;
  const wind0 = Number(hereHrs[0].windMs) || 0;
  const precip0 = Number(hereHrs[0].precip) || 0;
  const isExtremeCold = (t0Int <= -25 || wc0Int <= -32);
  const isBlowingSnow = (wind0 >= 9 && t0Int <= 1 && precip0 >= 0.2);

  // Flex-wrapped atomic sub-metrics (zero awkward floating dot wrap at 19px-21px)
  const skyParts = [`<span class="nowrap">${fmtTemp(t0Int)}</span>`];
  if (t0Int - wc0Int >= 3) {
    skyParts.push(`<span class="nowrap">${en ? `Feels ${fmtTemp(wc0Int)}` : `體感 ${fmtTemp(wc0Int)}`}</span>`);
  } else if (!isBlowingSnow && precip0 >= 0.2) {
    skyParts.push(`<span class="nowrap">${t0Int <= 1 ? (en ? 'Snow' : '降雪') : (en ? 'Rain' : '降雨')}</span>`);
  }

  // Frameless monochrome 1.5px SVG footnote items (traveler-relevant alerts only; local station calibration lives cleanly in Trust Sheet & confidence link)
  const heroTags = [];
  if (isExtremeCold) {
    heroTags.push(`<span class="meta-item t-red">${SVG_ICO_WARN}<span>${en ? `Extreme cold (${fmtTemp(wc0Int)})` : `極寒 ${fmtTemp(wc0Int)}`}</span></span>`);
  }
  if (isBlowingSnow) {
    heroTags.push(`<span class="meta-item t-amber">${SVG_ICO_WARN}<span>${en ? 'Blowing snow' : '吹雪強風'}</span></span>`);
  }
  if (state.bannerState.stormMinorTag) {
    heroTags.push(`<button type="button" class="meta-item meta-btn t-amber" data-open-trust="1" aria-haspopup="dialog" aria-controls="trustSheet">${SVG_ICO_BOLT}<span>${escapeHtml(state.bannerState.stormMinorTag)}</span></button>`);
  }
  if (!heroTags.length && scNext && !sc.outOfZone) {
    const diff = scNext.total - sc.total;
    const trendTxt = diff >= 6 ? (en ? 'Rising next hour' : '未來 1 小時趨勢上升') : (diff <= -6 ? (en ? 'Fading next hour' : '未來 1 小時趨勢轉弱') : (en ? 'Steady next hour' : '未來 1 小時變化不大'));
    heroTags.push(`<span class="meta-item t-muted"><span>${trendTxt}</span></span>`);
  }
  setHtml('heroTags', heroTags.join('<span class="meta-sep" aria-hidden="true"></span>'));

  const kpShort = kp !== null ? kp.toFixed(1) : '--';
  const aurSubHtml = sc.outOfZone === 'low-lat'
    ? `<span class="nowrap">${en ? `Mag ${sc.magLat}°` : `地磁 ${sc.magLat}°`}</span>`
    : (sc.outOfZone === 'need-storm'
        ? `<span class="nowrap">Kp ${kpShort} · ${en ? `need ${sc.neededKp}` : `需 ${sc.neededKp}`}</span>`
        : `<span class="nowrap">Kp ${kpShort}${sc.auroraScore >= 55 ? (en ? ' · Active' : ' · 活躍') : ''}</span>`);
  const darkWin = computeDarkWindow(refNow, pos.lat, pos.lon, pos.tz);
  document.body.classList.remove('is-loading');
  renderGauge(sc, {
    isTooBright: sc.isTooBright,
    moon,
    skySubHtml: skyParts.join('<span class="sub-dot" aria-hidden="true">·</span>'),
    aurSubHtml,
    darkSubHtml: formatDarkCountdownSub(darkWin, moon, en)
  });

  const localizedNights3 = multiDayPts
    ? summarize3NightOutlook({
        cloudPoints: multiDayPts, kpForecast: kpForecast || [], currentKp: kp,
        lat: pos.lat, lon: pos.lon, timeZone: pos.tz, nowDate: refNow,
        enlilForecast: enlilForecast || null,
        chartHours: Array.isArray(st.scoredHours) && st.scoredHours.length ? st.scoredHours : state.scoredHours
      })
    : nights3;

  const activeHrs = Array.isArray(st.scoredHours) && st.scoredHours.length ? st.scoredHours : state.scoredHours;
  if (Array.isArray(st.scoredHours) && st.scoredHours.length) state.scoredHours = st.scoredHours;

  const act = synthesizeTonightAction({
    lat: pos.lat, lon: pos.lon, sc, scNext, bal: safeBal, goesSub,
    bestDark, dirResults, nights3: localizedNights3, darkWin,
    kp, mlt: mltNow ?? null, effMoonPct: moon.effMoonPct
  });
  const refNowMs = refNow.getTime();
  // Derive a single crisp, non-redundant Hero action cue (filter out already-passed hours!)
  let heroCue = act.title;
  let heroSub = '';
  if (act.actionType === 'drive') {
    heroCue = act.title;
    heroSub = act.lead;
  } else if (act.actionType === 'daylight') {
    heroCue = act.lead || act.title;
  } else if (act.actionType === 'go') {
    const dirCueZh = sc.total >= 65 ? '現在適合出門，朝頭頂與北方觀察' : '可出門觀測，留意北方高空與雲縫';
    const dirCueEn = sc.total >= 65 ? 'Go out now — look overhead and north' : 'Good to head out — watch the northern sky';
    heroCue = en ? dirCueEn : dirCueZh;
  } else if (act.actionType === 'wait' && sc.total < 18 && sc.skyScore < 45) {
    const upcoming = (activeHrs || []).slice(1, 24).filter(h => !Number.isFinite(h?.dtMs) || h.dtMs > refNowMs + 15 * 60000);
    const firstGood = upcoming.find(h => h && !h.isDay && h.score >= 40)
      || upcoming.find(h => h && !h.isDay && h.clear >= 55);
    const startT = firstGood?.time || '';
    heroCue = startT
      ? (en ? `Rest for now — skies improve after ${startT}` : `先休息，預計 ${startT} 後有望轉佳`)
      : act.title;
  } else if (act.actionType === 'sleep') {
    const futureBest = (localizedNights3 || []).slice(1)
      .filter(n => n && (n.tone === 'good' || n.tone === 'warn'))
      .sort((a, b) => (b.bestNightScore || 0) - (a.bestNightScore || 0))[0];
    heroCue = futureBest
      ? (en ? `Low chance tonight — ${futureBest.dayLabel} looks better` : `今晚機率偏低，${futureBest.dayLabel}機會較佳`)
      : (en ? 'Low chance right now — check back later' : '目前機率偏低，可先休息稍後再看');
  }
  setText('vTitle', heroCue);
  const leadEl = $('vLead');
  if (leadEl) {
    leadEl.textContent = heroSub;
    leadEl.style.display = heroSub ? '' : 'none';
  }
  const actBtn = $('vActionBtn');
  if (actBtn) {
    const compassSum = summarizeCompass(dirResults);
    const bestDir = (compassSum?.good && Array.isArray(dirResults))
      ? dirResults.find(d => d && d.key === compassSum.bestKey)
      : null;
    const isCloudyNight = !sc.isTooBright && !sc.outOfZone && sc.skyScore < 45;
    if (bestDir && isCloudyNight) {
      const clear3h = Math.max(0, Math.min(100, Math.round(100 - bestDir.avg3h)));
      const kmVal = Number.isFinite(bestDir.roadKm) ? bestDir.roadKm : (Number.isFinite(bestDir.distKm) ? bestDir.distKm : Math.round(computeDistanceKm(pos.lat, pos.lon, bestDir.lat, bestDir.lon)));
      const drv = fmtWinterDrive(kmVal, en);
      const mainT = en
        ? `Clear skies ${escapeHtml(tDirLabel(bestDir.label))} (${clear3h}% clear)`
        : `${escapeHtml(tDirLabel(bestDir.label))} 找晴空（晴空 ${clear3h}%）`;
      const subT = en
        ? `~${kmVal} km · ${drv || 'check winter roads'}`
        : `公路 ~${kmVal} km${drv ? ` · 冬季車程${drv}` : ''}`;
      actBtn.innerHTML = `<span class="cta-txt"><strong>${mainT}</strong><span class="cta-sub">${escapeHtml(subT)}</span></span>${SVG_ICO_ARR_R}`;
      actBtn.dataset.targetView = 'dir';
      actBtn.style.display = 'flex';
    } else if (act.ctaView && act.ctaLabel) {
      actBtn.innerHTML = `<span class="cta-txt"><strong>${escapeHtml(act.ctaLabel)}</strong></span>${SVG_ICO_ARR_R}`;
      actBtn.dataset.targetView = act.ctaView;
      actBtn.style.display = 'flex';
    } else if (isCloudyNight) {
      const fallbackLbl = en ? 'Check 360° clear skies & live cams' : '查看 360° 周邊晴空與實拍';
      actBtn.innerHTML = `<span class="cta-txt"><strong>${fallbackLbl}</strong></span>${SVG_ICO_ARR_R}`;
      actBtn.dataset.targetView = 'dir';
      actBtn.style.display = 'flex';
    } else {
      actBtn.style.display = 'none';
    }
  }

  renderWaveCard(false);
  render3NightOutlook(localizedNights3);
  renderCompassPanel(dirResults, pos, en);

  const pMet = $('pMet');
  if (pMet) {
    const isYr = weatherSourceLabel === 'Yr.no 官方' || weatherSourceLabel === 'Yr.no官方';
    const srcLbl = isYr
      ? (en ? 'Yr.no Weather' : 'Yr.no 天氣')
      : (en ? 'Open-Meteo' : 'Open-Meteo 天氣');
    pMet.textContent = `${srcLbl} ↗`;
    pMet.href = usedMet
      ? `https://www.yr.no/en/forecast/daily-table/${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}`
      : 'https://open-meteo.com/en/docs';
  }
  state.syncedAtMs = refNow.getTime();
  state.syncPartial = !(noaaOk && hereHrs.length);
  renderSyncAge();
}

// ====== Live Data Orchestration & Offline Recovery ======
async function refreshAll(manual, { forceNoaa = false } = {}) {
  const nowMs = Date.now();
  if (!manual && state.isRefreshing) return;
  if (!manual && nowMs - state.lastAttemptMs < 15000) return;

  try { state.activeRefreshCtrl?.abort(); } catch {}
  const ctrl = new AbortController();
  state.activeRefreshCtrl = ctrl;
  const mySeq = ++state.refreshSeq;
  const isCurrent = () => mySeq === state.refreshSeq;

  state.isRefreshing = true;
  state.lastAttemptMs = nowMs;
  document.body.classList.add('is-syncing');
  const pos = { ...state.pos };
  const en = isEn();
  const refBtn = $('refBtn');
  if (refBtn) { refBtn.disabled = true; refBtn.classList.add('spinning'); }

  const now = new Date();
  let moon = updateClockAndPhoto();

  // Instant Stale-While-Revalidate (SWR) paint: only hydrate offline cache on initial load or city switch,
  // never overwrite live on-screen data during a 5-min background auto-refresh for the same location.
  const prevPos = state.renderState?.pos;
  const sameCityRendered = Boolean(
    prevPos &&
    Math.abs(prevPos.lat - pos.lat) < 0.02 &&
    Math.abs(prevPos.lon - pos.lon) < 0.02
  );
  if (!forceNoaa && !sameCityRendered) {
    const swrHit = findMatchingOfflineCache(pos, nowMs);
    if (swrHit && (nowMs - swrHit.ts) < 20 * 60 * 1000) {
      const hydrated = hydrateOfflineState(swrHit, pos, nowMs);
      if (hydrated) {
        state.scoredHours = hydrated.scoredHours;
        state.bestAurora = hydrated.bestAurora;
        state.selectedHourIdx = hydrated.selectedHourIdx;
        state.renderState = hydrated.renderState;
        state.bannerState.offline = false;
        renderFromState(state.renderState);
        setText('syncTime', en ? 'Updating…' : '更新中…');
      }
    }
  }

  const cachedEnlil = readCachedEnlil(now.getTime());
  if (!cachedEnlil) {
    fetchEnlilBackground().then(parsed => {
      if (!parsed) return;
      writeCachedEnlil(parsed);
      if (state.renderState?.multiDayPts) {
        state.renderState.enlilForecast = parsed;
        state.renderState.nights3 = summarize3NightOutlook({
          cloudPoints: state.renderState.multiDayPts, kpForecast: state.renderState.kpForecast || [],
          currentKp: state.renderState.kp, lat: state.renderState.pos.lat, lon: state.renderState.pos.lon,
          timeZone: state.renderState.pos.tz, nowDate: state.renderState.fetchedAt || new Date(),
          enlilForecast: parsed, chartHours: state.renderState.scoredHours
        });
        render3NightOutlook(state.renderState.nights3);
      }
    });
  }

  let noaaOk = false, metOk = false;
  try {
    const [noaa, wx] = await Promise.all([
      fetchNoaaBundle({ pos, now, signal: ctrl.signal, cachedEnlil, force: Boolean(forceNoaa), isCurrent, onProgress: renderNoaaSection }),
      fetchWeatherBundle({ pos, now, signal: ctrl.signal, isCurrent })
    ]);
    if (!isCurrent()) return;

    noaaOk = noaa.noaaOk;
    metOk = wx.metOk;
    if (wx.resolvedTz && wx.resolvedTz !== 'auto') {
      pos.tz = wx.resolvedTz;
      if (state.pos.lat === pos.lat && state.pos.lon === pos.lon) state.pos.tz = wx.resolvedTz;
    }

    if (metOk && wx.hereHrs.length) {
      state.bannerState.offline = false;
      syncBannerBudget();
      renderLocationHeader();
      moon = updateClockAndPhoto();

      const snap = computeLiveSnapshot({ pos, now, noaa, wx, moon });
      state.scoredHours = snap.scoredHours;
      state.bestAurora = snap.bestAurora;
      state.selectedHourIdx = snap.selectedHourIdx;
      state.renderState = snap.renderState;

      renderFromState(state.renderState);
      updateClockAndPhoto();
      maybeTriggerAlert(snap.renderState.sc, snap.renderState.goesSub, snap.renderState.scNext, snap.renderState.bal, pos);

      const verdict = evaluateVerdict({
        lat: pos.lat, lon: pos.lon, bestDark: snap.renderState.bestDark, kp: snap.renderState.kp,
        mlt: snap.renderState.mltNow, effMoonPct: moon.effMoonPct, scoreObj: snap.renderState.sc
      });
      writeSwrCacheEntry(pos, buildSwrPayload({
        pos, lang: getLang(), posName: getPosDisplayName(pos),
        snapshot: snap.renderState, verdict,
        skySub: $('fSkySub')?.textContent || '',
        aurSub: $('fAurSub')?.textContent || '',
        darkSub: $('fDarkSub')?.textContent || ''
      }));
    } else {
      handleOfflineFallback(pos);
    }
  } catch {
    if (isCurrent()) {
      document.body.classList.remove('is-loading');
      setText('pMet', isEn() ? 'Weather Offline' : '氣象離線');
      if (!noaaOk) setText('pNoaa', isEn() ? 'NOAA Offline ↗' : 'NOAA 離線 ↗');
    }
  } finally {
    if (isCurrent()) {
      state.isRefreshing = false;
      document.body.classList.remove('is-syncing');
      if (noaaOk || metOk) state.lastSyncMs = Date.now();
      if (manual) {
        toast(
          noaaOk && metOk
            ? (isEn() ? 'Forecast updated' : '已更新最新官方預報')
            : (isEn() ? 'Partial connection error' : '部分資料連線失敗'),
          noaaOk && metOk ? 'success' : 'warn'
        );
      }
      if (refBtn) { refBtn.disabled = false; refBtn.classList.remove('spinning'); }
    }
  }
}

function handleOfflineFallback(pos) {
  const en = isEn();
  document.body.classList.remove('is-loading');
  setText('pMet', en ? 'Weather Offline' : '氣象離線');
  const cached = findMatchingOfflineCache(pos);
  state.bannerState.offline = true;
  if (!cached) {
    setText('offlineTxt', en
      ? `Offline: no cached forecast for ${getPosDisplayName(pos)} yet.`
      : `網路訊號中斷：尚無「${getPosDisplayName(pos)}」的快取資料。`);
    syncBannerBudget();
    return;
  }

  const minsAgo = Math.max(1, Math.round((Date.now() - cached.ts) / 60000));
  const cachedPosLabel = getPosDisplayName(pos) || cached.posName || '';
  setText('offlineTxt', en
    ? `Offline: ${minsAgo}m old cache (${cachedPosLabel}).`
    : `離線模式：顯示 ${minsAgo} 分前（${cachedPosLabel}）快取資料。`);
  syncBannerBudget();

  const hydrated = hydrateOfflineState(cached, pos);
  if (hydrated) {
    state.scoredHours = hydrated.scoredHours;
    state.bestAurora = hydrated.bestAurora;
    state.selectedHourIdx = hydrated.selectedHourIdx;
    state.renderState = hydrated.renderState;
    renderFromState(state.renderState);
    return;
  }

  // Minimal legacy cache fallback (score + verdict only)
  const sameLang = cached.lang === getLang();
  const vCached = (sameLang && cached.v)
    ? cached.v
    : evaluateVerdict({
        lat: cached.lat, lon: cached.lon,
        bestDark: cached.bestDark || null, kp: cached.kp ?? null,
        mlt: cached.mlt ?? null, effMoonPct: cached.effMoonPct ?? 0, scoreObj: cached.score
      });
  renderGauge(cached.score, {
    isTooBright: cached.score.isTooBright,
    skySub: sameLang ? cached.skySub : (en ? 'Cached sky' : '快取晴空'),
    aurSub: sameLang ? cached.aurSub : (en ? 'Cached aurora' : '快取極光'),
    darkSub: sameLang ? cached.darkSub : (en ? 'Cached sky' : '快取暗度')
  });
  setText('vTitle', vCached.title);
  setText('vLead', vCached.lead);
}

// ====== User Actions ======
function pickPreset(nameZh, nameEn, lat, lon, btn) {
  state.locationSeq++;
  state.camUserPicked = false;
  document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
  btn?.classList.add('on');
  const tz = btn?.dataset?.tz || matchKnownCity(lat, lon)?.tz || 'auto';
  state.pos = { name: nameZh, nameEn, lat, lon, tz, mode: 'manual', accuracy: null };
  renderLocationHeader();
  syncBrowserUrl();
  haptic(8);
  togglePicker(true);
  refreshAll(true);
}

function useGPS() {
  const en = isEn();
  if (!navigator.geolocation) {
    state.pos.mode = 'gps-err'; renderLocationHeader();
    toast(en ? 'GPS not supported' : '此瀏覽器不支援 GPS', 'error');
    return;
  }
  const b = $('gpsBtn');
  if (b) { b.disabled = true; b.classList.add('spinning'); }
  const stopSpin = () => { if (b) { b.disabled = false; b.classList.remove('spinning'); } };
  const myLocSeq = ++state.locationSeq;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (myLocSeq !== state.locationSeq) { stopSpin(); return; }
      state.camUserPicked = false;
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
      const matched = matchKnownCity(lat, lon);
      const fallback = `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
      state.pos = {
        name: matched ? matched.zh : fallback,
        nameEn: matched ? matched.en : fallback,
        lat: +lat.toFixed(4), lon: +lon.toFixed(4),
        tz: matched ? matched.tz : 'auto',
        mode: 'gps', accuracy
      };
      renderLocationHeader(); syncBrowserUrl(); togglePicker(true);
      stopSpin();
      haptic(10);
      toast((isEn() ? 'Located: ' : '已定位：') + getPosDisplayName(), 'success');
      refreshAll(true);

      if (!matched) {
        reverseGeocodeBilingual(lat, lon).then(({ zhName, enName }) => {
          if (myLocSeq !== state.locationSeq) return;
          if (zhName || enName) {
            state.pos.name = zhName || enName || fallback;
            state.pos.nameEn = enName || (hasCjkChars(zhName) ? fallback : zhName) || fallback;
            renderLocationHeader(); syncBrowserUrl();
          }
        });
      }
    },
    () => {
      stopSpin();
      if (myLocSeq !== state.locationSeq) return;
      state.pos.mode = 'gps-err'; renderLocationHeader();
      toast(isEn() ? 'GPS permission denied — pick a city manually' : 'GPS 權限被拒，請點地名手動切換', 'error');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

async function searchCity(e) {
  e.preventDefault();
  const input = $('cityInput');
  const rawQ = input?.value.trim() || '';
  if (!rawQ) return;
  const en = isEn();
  const myLocSeq = ++state.locationSeq;
  try {
    const found = await geocodeCityQuery(rawQ);
    if (myLocSeq !== state.locationSeq) return;
    if (found) {
      state.camUserPicked = false;
      document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
      state.pos = found;
      renderLocationHeader(); syncBrowserUrl();
      if (input) input.value = '';
      haptic(8);
      togglePicker(true);
      refreshAll(true);
      return;
    }
    toast(en ? 'City not found — try another spelling' : '找不到地名，可試英文拼法（如 Reykjavik）', 'warn');
  } catch { toast(en ? 'Search failed — check connection' : '搜尋連線失敗，請檢查網路', 'error'); }
}

async function shareStatus() {
  const en = isEn();
  const shareUrl = buildShareUrl(location.href, state.pos, getLang());
  const sc = state.lastScore;
  const scStr = sc ? (en ? `${sc.total} (${tGrade(sc.grade, 'en').replace(/^[^\p{L}\p{N}]+\s*/u, '')})` : `${sc.total}（${tGrade(sc.grade, 'zh').replace(/^[^\p{L}\p{N}]+\s*/u, '')}）`) : (en ? 'Updating' : '更新中');
  const title = en ? `[${getPosDisplayName()}] Aurora score: ${scStr}` : `【${getPosDisplayName()}】極光觀測指數：${scStr}`;
  const skyVal = $('fSkyVal')?.textContent || '';
  const skySub = $('fSkySub')?.textContent || '';
  const skyLine = skyVal && skyVal !== '--'
    ? (en ? `${skyVal} clear${skySub ? ` · ${skySub}` : ''}` : `晴空率 ${skyVal}${skySub ? ` · ${skySub}` : ''}`)
    : skySub;
  const body = en
    ? `${title}\n${$('vTitle')?.textContent || ''}\n• Sky: ${skyLine}\n• Aurora: ${$('fAurSub')?.textContent || ''}\nLive clouds and NOAA aurora data:`
    : `${title}\n${$('vTitle')?.textContent || ''}\n• 天空：${skyLine}\n• 極光：${$('fAurSub')?.textContent || ''}\n點開看即時雲層與 NOAA 極光資料：`;
  const txt = `${body}\n${shareUrl}`;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title, text: body, url: shareUrl }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt)
      .then(() => toast(en ? 'Summary copied to clipboard' : '已複製分享摘要與連結', 'success'))
      .catch(() => toast(en ? 'Please copy the URL directly' : '請直接複製網址分享', 'info'));
  } else {
    toast(en ? 'Please copy the URL directly' : '請直接複製網址分享', 'info');
  }
}

// ====== Trust, Telemetry & Sources Bottom-Sheet ======
function renderTrustSheetLive(expOpt = null, scOpt = null, rawTelemetry = null, metarNote = null) {
  const exp = expOpt || state.explainState;
  const sc = scOpt || state.renderState?.sc;
  if (!exp || !sc) return;
  state.explainState = exp;
  if (rawTelemetry !== null) state.lastRawTelemetry = rawTelemetry;
  if (metarNote !== null) state.lastMetarNote = metarNote;
  const effTelemetry = rawTelemetry !== null ? rawTelemetry : (state.lastRawTelemetry || '');
  const effMetarNote = metarNote !== null ? metarNote : (state.lastMetarNote || '');
  const en = isEn();
  const colOut = scoreCssColor(sc.color);

  setHtml('tsLiveTitle', en
    ? `Why is the score <strong id="tsLiveTotal" style="color:${colOut}">${sc.total}</strong> now?`
    : `為何現在指數是 <strong id="tsLiveTotal" style="color:${colOut}">${sc.total}</strong>？（越高越好）`);
  const setCell = (id, val, col) => { const el = $(id); if (el) { el.textContent = val; el.style.color = col; } };
  const skyEffPct = Number.isFinite(exp.breakdown?.skyFactor)
    ? Math.round(exp.breakdown.skyFactor * 100)
    : sc.skyScore;
  const darkEffPct = sc.isTooBright
    ? 0
    : (Number.isFinite(exp.breakdown?.darkFactor) ? Math.round(exp.breakdown.darkFactor * 100) : sc.darkScore);
  setText('tsLblSky', skyEffPct !== sc.skyScore
    ? (en ? 'Sky factor' : '晴空係數')
    : term(TERMS.clearSky, en));
  setCell('tsValSky', `${skyEffPct}%`, barColor(sc.skyScore));
  setCell('tsValAur', sc.auroraScore, barColor(sc.auroraScore));
  setCell('tsValDark', `${darkEffPct}%`, sc.isTooBright ? 'var(--blue)' : barColor(sc.darkScore));
  setCell('tsValOut', sc.total, colOut);

  const badge = $('tsLiveBadge');
  if (badge) {
    const bCls = exp.score.statusTier === 'optimal'
      ? 'ok'
      : (exp.bottleneck.key === 'gate-low-lat' || exp.bottleneck.key === 'clouds' ? 'block' : (exp.bottleneck.key === 'gate-daylight' || exp.bottleneck.key === 'quiet-aurora' ? 'info' : 'warn'));
    badge.textContent = exp.bottleneck.label;
    badge.className = `ts-badge ${bCls}`;
  }
  setText('tsDiagTxt', exp.bottleneck.headline);
  const mn = $('tsMetarNote');
  if (mn) {
    if (effMetarNote) {
      mn.style.display = 'block';
      mn.textContent = `◎ ${effMetarNote}`;
    } else {
      mn.style.display = 'none';
      mn.textContent = '';
    }
  }
  setText('tsConfRow', `${exp.confidence.badgeText}${effTelemetry ? ` · ${effTelemetry}` : ''}`);
  const stLive = state.renderState;
  const cd = $('tsConfDetail');
  if (cd) {
    let detailTxt = '';
    if (exp.confidence.level !== 'high') {
      const pr = exp.confidence.primaryReason;
      const cc = stLive?.cloudConsensus;
      const isMet = Boolean(stLive?.usedMet);
      if ((pr === 'model-diverge' || pr === 'obs-calibrated' || pr === 'cloud-spread') && cc && Number.isFinite(cc.metAvg3h) && Number.isFinite(cc.omAvg3h)) {
        const c1 = Math.max(0, Math.min(100, Math.round(100 - cc.metAvg3h)));
        const c2 = Math.max(0, Math.min(100, Math.round(100 - cc.omAvg3h)));
        detailTxt = pr === 'obs-calibrated'
          ? (en
              ? `Models differed (${isMet ? 'MET Norway' : 'Primary'} ${c1}% vs ${isMet ? 'ECMWF' : 'Secondary'} ${c2}% clear) — short-term clouds adjusted using local live observations.`
              : `兩組預報晴空率有分歧（${isMet ? '挪威官方' : '主模型'} ${c1}%、${isMet ? 'ECMWF 全球模型' : '對照模型'} ${c2}%），已優先參照當地即時實測修正。`)
          : (en
              ? `Clear-sky models disagree (${isMet ? 'MET Norway' : 'Primary'} ${c1}% vs ${isMet ? 'ECMWF' : 'Secondary'} ${c2}%) — check live cams.`
              : `兩組晴空預報分歧（${isMet ? '挪威官方' : '主模型'} ${c1}%、${isMet ? 'ECMWF 全球模型' : '對照模型'} ${c2}%），建議看即時實拍確認。`);
      } else if (pr === 'fast-clouds') {
        detailTxt = en
          ? 'Fast-moving clouds over the next 3h — clear windows may shift.'
          : '未來 3 小時雲層移動很快，晴空空檔可能提前或延後。';
      } else if (pr === 'sat-lag') {
        const lag = Number.isFinite(stLive?.noaaLagMin) ? Math.round(stLive.noaaLagMin) : '--';
        detailTxt = en
          ? `NOAA satellite is ${lag} min behind — sudden surges may not show yet.`
          : `NOAA 衛星延遲 ${lag} 分鐘，突發極光增強可能尚未顯示。`;
      } else if (pr === 'noaa-offline') {
        detailTxt = en
          ? 'NOAA space-weather feed is offline — aurora score is approximate.'
          : 'NOAA 太空天氣暫時斷線，極光指數僅供參考。';
      } else if (pr === 'single-model') {
        detailTxt = en
          ? 'Single weather model only — double-check the sky or live cams.'
          : '目前僅有單一氣象模型，出發前建議抬頭或看實拍確認。';
      }
    }
    if (detailTxt) {
      cd.style.display = 'block';
      cd.textContent = detailTxt;
    } else {
      cd.style.display = 'none';
      cd.textContent = '';
    }
  }
  const tzLive = stLive?.pos?.tz || state.pos.tz;
  const noaaStampRaw = stLive?.noaaAlert?.issueTime || stLive?.noaaScales?.updatedUtc || null;
  const noaaStampHM = noaaStampRaw ? utcTagToLocalHM(noaaStampRaw, tzLive) : '';
  setText('tsNoaaSyncNote', noaaStampHM
    ? (en
        ? `Live 3h NOAA feed (updated ${noaaStampHM} local) — verify G1–G5 watches in "NOAA Storm Alerts" and tonight's oval in "NOAA Aurora Map".`
        : `直連 NOAA 每 3 小時滾動更新（最新 ${noaaStampHM} 當地時間）— 核對警報請看「NOAA 風暴警報」，今晚極光範圍請看「NOAA 極光總覽」。`)
    : (en
        ? 'Live 3h NOAA feed — verify G1–G5 watches in "NOAA Storm Alerts" and tonight\'s oval in "NOAA Aurora Map".'
        : '直連 NOAA 每 3 小時滾動更新 — 核對警報請看「NOAA 風暴警報」，今晚極光範圍請看「NOAA 極光總覽」。'));
}

function openTrustSheet(triggerEl) {
  togglePicker('switch');
  state.trustTriggerEl = triggerEl || document.activeElement;
  if (state.explainState && state.renderState?.sc) {
    renderTrustSheetLive();
  } else if (state.renderState) {
    renderFromState(state.renderState);
  }
  const sheet = $('trustSheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  pushSheetHistory();
  syncBodySheetClass();
  haptic(6);
  $('trustCloseBtn')?.focus();
}

function closeTrustSheet(mode) {
  const sheet = $('trustSheet');
  if (!sheet?.classList.contains('open')) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  syncBodySheetClass();
  if (mode !== 'pop' && mode !== 'switch') {
    popSheetHistoryIfIdle();
    state.trustTriggerEl?.focus?.();
  }
}

// Expose test helpers for automated visual verification scripts
window.__AURORA_APP__ = {
  getState: () => state.renderState,
  renderFromState,
  selectForecastHour,
  toggleRedMode,
  toggleAlertMode,
  togglePicker,
  switchView,
  openTrustSheet,
  closeTrustSheet,
  toast,
  syncBannerBudget,
  toggleTempUnit,
  toggleSolarWind: (force) => {
    state.swExpanded = typeof force === 'boolean' ? force : !state.swExpanded;
    syncSwToggleUI();
  },
  setOfflineDemo: (on, text) => {
    state.bannerState.offline = Boolean(on);
    if (text) setText('offlineTxt', text);
    syncBannerBudget();
  },
  triggerDemoAlert: (msg) => {
    state.alertEnabled = true;
    state.activeAlert = { time: $('clk')?.textContent || '22:30', msg };
    renderMonitorBar();
    toast(msg, 'alert');
  }
};

// ====== Reusable Native Sheet Swipe-Down (Velocity-Aware) & Chart Scrubbing Helpers ======
function bindSheetSwipe(sheetId, onClose) {
  const hdr = document.querySelector(`#${sheetId} .sheet-hdr`);
  const panel = document.querySelector(`#${sheetId} .sheet-panel`);
  if (!hdr || !panel) return;
  let startY = 0, startT = 0, dy = 0, active = false;
  let rafId = 0;
  const reset = (shouldClose) => {
    if (!active) return;
    active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    panel.style.transition = '';
    panel.style.transform = '';
    const moved = dy;
    const elapsed = Math.max(16, performance.now() - startT);
    const velocity = moved / elapsed; // px per ms
    dy = 0;
    if (shouldClose && (moved > 65 || (moved > 24 && velocity > 0.45))) onClose();
  };
  hdr.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { reset(false); return; }
    startY = e.touches[0].clientY;
    startT = performance.now();
    dy = 0;
    active = true;
    panel.style.transition = 'none';
  }, { passive: true });
  hdr.addEventListener('touchmove', (e) => {
    if (!active || e.touches.length !== 1) { reset(false); return; }
    dy = Math.max(0, e.touches[0].clientY - startY);
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (active) panel.style.transform = `translate3d(0, ${dy}px, 0)`;
      });
    }
  }, { passive: true });
  hdr.addEventListener('touchend', () => reset(true));
  hdr.addEventListener('touchcancel', () => reset(false));
}

function bindWaveScrubbing() {
  const svg = $('skyWaveChart');
  if (!svg) return;
  let tracking = false, scrubbing = false, startX = 0, startY = 0, activePointerId = null;
  let cachedRect = null, pendingX = 0, rafId = 0;
  const pickFromClientX = (clientX) => {
    const vis = getVisibleHours();
    if (vis.length < 2) return;
    const rect = cachedRect || svg.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((clientX - rect.left) / rect.width) * 420;
    const padL = 56, plotW = 420 - 56 - 10;
    const ratio = Math.max(0, Math.min(1, (svgX - padL) / plotW));
    const idx = Math.round(ratio * (vis.length - 1));
    if (idx !== state.selectedHourIdx) {
      selectForecastHour(idx);
      haptic(5);
    }
  };
  const schedulePick = (clientX) => {
    pendingX = clientX;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (scrubbing) pickFromClientX(pendingX);
      });
    }
  };
  const reset = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (scrubbing && activePointerId !== null) {
      try { svg.releasePointerCapture(activePointerId); } catch {}
    }
    tracking = false;
    scrubbing = false;
    activePointerId = null;
    cachedRect = null;
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    if (e.isPrimary === false) return;
    tracking = true;
    scrubbing = false;
    startX = e.clientX;
    startY = e.clientY;
    activePointerId = e.pointerId;
    cachedRect = svg.getBoundingClientRect();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!scrubbing) {
      // Yield immediately to vertical page scrolling on mobile touchscreens
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        reset();
        return;
      }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        scrubbing = true;
        try { svg.setPointerCapture(e.pointerId); } catch {}
        schedulePick(e.clientX);
      }
      return;
    }
    schedulePick(e.clientX);
  });
  svg.addEventListener('pointerup', (e) => {
    if (!tracking || e.pointerId !== activePointerId) return;
    const isCleanTap = !scrubbing && Math.hypot(e.clientX - startX, e.clientY - startY) <= 10;
    const tapRect = cachedRect;
    reset();
    if (isCleanTap) { cachedRect = tapRect; pickFromClientX(e.clientX); cachedRect = null; }
  });
  svg.addEventListener('pointercancel', reset);
}

function bindBzScrubbing() {
  const svg = $('bzChart');
  if (!svg) return;
  let tracking = false, scrubbing = false, startX = 0, startY = 0, activePointerId = null;
  let cachedRect = null, pendingX = 0, rafId = 0;
  const pickFromClientX = (clientX) => {
    const st = state.bzChartState;
    if (!st || !Array.isArray(st.series) || st.series.length < 2) return;
    const rect = cachedRect || svg.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((clientX - rect.left) / rect.width) * 420;
    const padL = 56, plotW = 420 - 56 - 14;
    const ratio = Math.max(0, Math.min(1, (svgX - padL) / plotW));
    const { series } = st;
    const t0 = Engine.parseUtcMs(series[0]?.time_tag);
    const t1 = Engine.parseUtcMs(series[series.length - 1]?.time_tag);
    let bestIdx = Math.round(ratio * (series.length - 1));
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0 && (t1 - t0) <= 24 * 3600000) {
      const targetMs = t0 + ratio * (t1 - t0);
      let bestDiff = Infinity;
      for (let i = 0; i < series.length; i++) {
        const ms = Engine.parseUtcMs(series[i]?.time_tag);
        if (!Number.isFinite(ms)) continue;
        const d = Math.abs(ms - targetMs);
        if (d < bestDiff) { bestDiff = d; bestIdx = i; }
      }
    }
    if (bestIdx !== state.selectedBzIdx) {
      selectBzPoint(bestIdx);
      haptic(4);
    }
  };
  const schedulePick = (clientX) => {
    pendingX = clientX;
    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (scrubbing) pickFromClientX(pendingX);
      });
    }
  };
  const reset = () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (scrubbing && activePointerId !== null) {
      try { svg.releasePointerCapture(activePointerId); } catch {}
    }
    tracking = false;
    scrubbing = false;
    activePointerId = null;
    cachedRect = null;
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    if (e.isPrimary === false) return;
    tracking = true;
    scrubbing = false;
    startX = e.clientX;
    startY = e.clientY;
    activePointerId = e.pointerId;
    cachedRect = svg.getBoundingClientRect();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!tracking || e.pointerId !== activePointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!scrubbing) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        reset();
        return;
      }
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        scrubbing = true;
        try { svg.setPointerCapture(e.pointerId); } catch {}
        schedulePick(e.clientX);
      }
      return;
    }
    schedulePick(e.clientX);
  });
  svg.addEventListener('pointerup', (e) => {
    if (!tracking || e.pointerId !== activePointerId) return;
    const isCleanTap = !scrubbing && Math.hypot(e.clientX - startX, e.clientY - startY) <= 10;
    const tapRect = cachedRect;
    reset();
    if (isCleanTap) { cachedRect = tapRect; pickFromClientX(e.clientX); cachedRect = null; }
  });
  svg.addEventListener('pointercancel', reset);
}

/** Zero-reflow 1P floating GPU pull-to-refresh (pure translate3d + opacity, ZERO height layout shift) */
function bindPullToRefresh() {
  const ptr = $('ptrIndicator');
  const txt = $('ptrText');
  if (!ptr) return;
  let startX = 0, startY = 0, pullY = 0, tracking = false, wasReady = false, rafId = 0;
  const applyVisual = () => {
    rafId = 0;
    if (!tracking || pullY <= 0) return;
    const p = Math.min(1, pullY / 46);
    const yOff = Math.round(-18 + pullY * 0.42);
    const sc = (0.92 + 0.08 * p).toFixed(3);
    ptr.classList.add('pulling');
    ptr.style.transform = `translate3d(-50%, ${yOff}px, 0) scale(${sc})`;
    ptr.style.opacity = String(p.toFixed(2));
    const ready = pullY >= 46;
    if (ready !== wasReady) {
      wasReady = ready;
      ptr.classList.toggle('ready', ready);
      if (txt) txt.textContent = ready
        ? (isEn() ? 'Release to refresh' : '放開立即更新')
        : (isEn() ? 'Pull to refresh' : '下拉更新');
    }
  };
  const finish = (allowRefresh) => {
    if (!tracking) return;
    tracking = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    const shouldRefresh = allowRefresh && pullY >= 46;
    wasReady = false;
    pullY = 0;
    ptr.classList.remove('pulling', 'ready');
    ptr.style.transform = '';
    ptr.style.opacity = '';
    if (shouldRefresh) {
      haptic(10);
      refreshAll(true, { forceNoaa: true });
    }
  };
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { finish(false); return; }
    if (window.scrollY > 2 || document.body.classList.contains('sheet-open') || state.isRefreshing) return;
    if (e.target.closest?.('.chart-box, .sheet-panel, iframe')) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    pullY = 0;
    wasReady = false;
    tracking = true;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    if (e.touches.length !== 1) { finish(false); return; }
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = e.touches[0].clientY - startY;
    if (dx > dy && dy < 20) { finish(false); return; }
    if (dy <= 10 || window.scrollY > 2) {
      if (pullY > 0) {
        pullY = 0;
        ptr.style.transform = '';
        ptr.style.opacity = '';
      }
      return;
    }
    pullY = Math.min(72, Math.round((dy - 10) * 0.45));
    if (!rafId) rafId = requestAnimationFrame(applyVisual);
  }, { passive: true });
  document.addEventListener('touchend', () => finish(true));
  document.addEventListener('touchcancel', () => finish(false));
}

// ====== Event Binding & Bootstrap ======
function bindEvents() {
  $('redBtn')?.addEventListener('click', toggleRedMode);
  $('outlookInfoBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('langBtn')?.addEventListener('click', toggleLang);
  $('unitBtn')?.addEventListener('click', toggleTempUnit);
  $('alertBtn')?.addEventListener('click', toggleAlertMode);
  $('refBtn')?.addEventListener('click', () => { haptic(8); refreshAll(true, { forceNoaa: true }); });
  $('pickBtn')?.addEventListener('click', (e) => togglePicker(false, e.currentTarget));
  $('pickerCloseBtn')?.addEventListener('click', () => togglePicker(true));
  $('picker')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) togglePicker(true); });
  $('gpsBtn')?.addEventListener('click', useGPS);
  $('shareBtn')?.addEventListener('click', shareStatus);
  $('cityForm')?.addEventListener('submit', searchCity);
  $('ringBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('trustBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('fcConfBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('heroTags')?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('[data-open-trust]');
    if (btn) openTrustSheet(btn);
  });
  $('vActionBtn')?.addEventListener('click', (e) => switchView(e.currentTarget?.dataset?.targetView || 'dir'));
  $('trustCloseBtn')?.addEventListener('click', () => closeTrustSheet());
  $('trustSheet')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTrustSheet(); });


  $('swToggleBtn')?.addEventListener('click', () => {
    state.swExpanded = !state.swExpanded;
    syncSwToggleUI();
    haptic(6);
  });

  $('hrPrevBtn')?.addEventListener('click', () => {
    if (state.selectedHourIdx > 0) { selectForecastHour(state.selectedHourIdx - 1); haptic(5); }
  });
  $('hrNextBtn')?.addEventListener('click', () => {
    const vis = getVisibleHours();
    if (state.selectedHourIdx < vis.length - 1) { selectForecastHour(state.selectedHourIdx + 1); haptic(5); }
  });
  $('bzPrevBtn')?.addEventListener('click', () => {
    if (state.selectedBzIdx > 0) { selectBzPoint(Math.max(0, state.selectedBzIdx - 5)); haptic(5); }
  });
  $('bzNextBtn')?.addEventListener('click', () => {
    const len = state.bzChartState?.series?.length || 0;
    if (len > 1 && state.selectedBzIdx < len - 1) { selectBzPoint(Math.min(len - 1, state.selectedBzIdx + 5)); haptic(5); }
  });
  $('radarSvg')?.addEventListener('click', (e) => {
    const sec = e.target.closest?.('.radar-sector[data-dir-key]');
    if (!sec) return;
    const key = sec.getAttribute('data-dir-key');
    const card = key ? document.querySelector(`#compassBox .dir[data-dir-card="${CSS.escape(key)}"]`) : null;
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('dir-pulse');
    void card.offsetWidth;
    card.classList.add('dir-pulse');
    haptic(6);
  });

  $('monitorBar')?.addEventListener('click', (e) => {
    const act = e.target.closest?.('[data-mon-act]')?.dataset?.monAct;
    if (act === 'off') toggleAlertMode();
    else if (act === 'ack') {
      state.activeAlert = null;
      renderMonitorBar();
      haptic(6);
    }
  });

  $('lineTipClose')?.addEventListener('click', () => {
    state.bannerState.lineTip = false;
    syncBannerBudget();
    try { sessionStorage.setItem('aurora_line_tip_dismissed', '1'); } catch {}
  });
  $('offlineRetryBtn')?.addEventListener('click', () => { haptic(8); refreshAll(true, { forceNoaa: true }); });

  $('camBrightBtn')?.addEventListener('click', () => {
    state.camFullBright = !state.camFullBright;
    syncSkyCamGlareUI(true);
    haptic(6);
  });

  // Scroll-reactive frosted glass sticky header + Apple Weather 1P Hero dissolve + off-screen Hero battery guard
  let wasScrolled = null;
  let wasPastHero = false;
  let lastHeroFade = -1;
  const skyStageEl = document.querySelector('.sky-stage');
  const syncScrollHdr = () => {
    const y = window.scrollY || 0;
    const scrolled = y > 4;
    if (scrolled !== wasScrolled) {
      wasScrolled = scrolled;
      document.body.classList.toggle('is-scrolled', scrolled);
    }
    if (skyStageEl && state.activeView === 'home') {
      const fade = y <= 10 ? 1 : (y >= 95 ? 0 : Math.round((1 - (y - 10) / 85) * 100) / 100);
      if (fade !== lastHeroFade) {
        lastHeroFade = fade;
        skyStageEl.style.opacity = fade === 1 ? '' : String(fade);
      }
    }
    const pastHero = y > 220;
    if (pastHero !== wasPastHero) {
      wasPastHero = pastHero;
      syncAnimBatteryGuard();
    }
  };
  window.addEventListener('scroll', syncScrollHdr, { passive: true });
  syncScrollHdr();

  const syncFontScaleClass = () => {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const effEm = Math.min(window.innerWidth, document.documentElement.clientWidth || window.innerWidth) / rootPx;
    document.body.classList.toggle('a11y-large', effEm <= 19.6);
    document.body.classList.toggle('a11y-xlarge', effEm <= 15.2);
  };
  window.addEventListener('resize', syncFontScaleClass, { passive: true });
  syncFontScaleClass();

  // Tap or swipe-up to dismiss floating notification pill
  const toastEl = $('toast');
  if (toastEl) {
    let tStartY = 0;
    toastEl.addEventListener('click', hideToast);
    toastEl.addEventListener('touchstart', (e) => { tStartY = e.touches[0].clientY; }, { passive: true });
    toastEl.addEventListener('touchend', (e) => {
      const endY = e.changedTouches?.[0]?.clientY ?? tStartY;
      if (tStartY - endY > 20) hideToast();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTrustSheet();
      togglePicker(true);
    }
  });
  window.addEventListener('popstate', () => {
    state.sheetHistoryPushed = false;
    if ($('trustSheet')?.classList.contains('open')) closeTrustSheet('pop');
    if ($('picker')?.classList.contains('open')) togglePicker('pop');
    syncBrowserUrl();
  });

  bindSheetSwipe('trustSheet', () => closeTrustSheet());
  bindSheetSwipe('picker', () => togglePicker(true));
  bindWaveScrubbing();
  bindBzScrubbing();
  bindPullToRefresh();

  document.querySelectorAll('#presetChips .chip').forEach(btn => {
    btn.addEventListener('click', () => pickPreset(btn.dataset.zh, btn.dataset.en, parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon), btn));
  });
  document.querySelectorAll('#camChips .chip').forEach(btn => {
    btn.addEventListener('click', () => selectSkyCam(btn.dataset.cam, btn, true));
  });
  document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view, btn));
  });

  $('skyCamImg')?.addEventListener('error', () => {
    setText('skyCamCap', isEn() ? 'All-sky camera feed temporarily offline — try another observatory above.' : '天文台實拍影像暫時無法連線，可切換上方其他極圈天文台。');
  });
  $('ovationImg')?.addEventListener('error', () => {
    setText('ovCap', isEn() ? 'NOAA OVATION map temporarily unavailable — tap Refresh to retry.' : 'NOAA 極光橢圓圖暫時無法載入，請稍後點 ↻ 重整。');
  });
}

function registerServiceWorker() {
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
    }
  } catch {}
}

state.tempUnit = detectTempUnit();
loadSavedPrefs();
applyStaticI18n();
syncSwToggleUI();
bindEvents();
renderLocationHeader();
renderMonitorBar();
updateClockAndPhoto();
try {
  const initView = new URLSearchParams(location.search).get('view');
  if (initView === 'dir' || initView === 'sat') switchView(initView);
} catch {}
registerServiceWorker();
refreshAll(false);

setInterval(updateClockAndPhoto, 30000);
setInterval(() => { if (!document.hidden || state.alertEnabled) refreshAll(false); }, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  syncAnimBatteryGuard();
  if (!document.hidden) {
    updateClockAndPhoto();
    if (state.alertEnabled) acquireWakeLock();
    if (Date.now() - state.lastSyncMs > 3 * 60 * 1000) refreshAll(false);
  }
});
window.addEventListener('online', () => { if (!document.hidden) refreshAll(false); });
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    updateClockAndPhoto();
    if (Date.now() - state.lastSyncMs > 3 * 60 * 1000) refreshAll(false);
  }
});
