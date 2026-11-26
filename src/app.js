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
  findMatchingOfflineCache, buildSwrPayload, hydrateOfflineState,
  loadWatchlist, saveWatchlist, isCityInWatchlist, toggleWatchlistCity
} from './storage.js';
import { buildShareCardPayload, exportShareCardPng } from './share-card.js';
import { trackPageview, trackEvent, normalizeCitySlug } from './analytics.js';
import {
  formatWavePeakSummary, formatHourScrubDetail, formatOutlookRowStats,
  resolveStormEvent, formatStormAlertDetail, buildHeroViewModel,
  formatDarkCountdownSub, formatLightPollutionNote
} from './copy-formatters.js';
import { SKY_CAMS, renderSkyCamCaption, renderTrustStatGrid, applyStaticI18n as applyStaticI18nDom } from './i18n.js';
import {
  fetchEnlilBackground, fetchNoaaBundle, fetchWeatherBundle,
  computeLiveSnapshot, reverseGeocodeBilingual, reverseGeocodeSingle, geocodeCityCandidates
} from './data-client.js';

const {
  detectDefaultLang, getLang, setLang, isEn, escapeHtml, tSky, tDirLabel, tGrade,
  isInNordicMetBox, getZoneParts, matchKnownCity, hasCjkChars, resolveCityDisplayName,
  parseUrlLocation, buildShareUrl, computeSolarElevation, computeDistanceKm, computeEffectiveCloud,
  computeDarkWindow, getMoonState, computeViewingGeometry,
  computeMLT, explainAuroraScore, summarize3NightOutlook, evaluateVerdict,
  isCorridorHazard, isAuroraWorthViewing, synthesizeTonightAction, summarizeEnergyTrend, summarizeCompass,
  shouldTriggerAuroraAlert, evaluateSilentGpsDecision, utcTagToLocalHM, estimateUrbanSkyglow,
  lookupCorridorHorizon
} = Engine;

const {
  buildSkySceneSVG, buildBzChartSVG, buildSkyWaveSVG, buildCompassRadarSVG,
  buildSkyFactorIcon, buildAuroraFactorIcon, buildMoonPhaseIcon,
  buildOutlookSkyIcon, buildSolarWindMeterHtml, buildFmiMagChartSVG
} = Charts;

// Expose pure modules on window for automated VLM / browser console inspection
window.__AURORA_SCI_TEST__ = { ...Engine, ...Charts };

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const SILENT_GPS_INTERVAL_MS = 10 * 60 * 1000;

// ====== Consolidated Application State ======
const state = {
  pos: {
    name: '挪威 · Tromsø', nameEn: 'Norway · Tromsø',
    lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo',
    mode: 'manual', accuracy: null
  },
  urlHasExplicitPos: false,
  lastGpsCheckMs: 0,
  gpsSuggestion: null,
  watchlist: [],
  tripCompareMap: {},
  isComparingTrip: false,
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
  localizedNights3: null,
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
  windyOverlay: 'clouds',
  lastBestDirKey: null,
  lastBestDirPosKey: '',
  searchCandidates: [],
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
  bannerState: { offline: false, stormSevere: false, stormMinorTag: '', lineTip: false, gpsSuggest: false }
};

const $ = (id) => document.getElementById(id);
const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const setHtml = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

/** Strict Banner Budget = 1 above Hero: P0 Alert > P1 Offline > P2 Severe Storm > P3 Monitor > P4 Tip/Suggest */
function syncBannerBudget() {
  const monEl = $('monitorBar');
  const offEl = $('offlineBanner');
  const stormEl = $('stormBanner');
  const lineEl = $('lineTip');
  const gpsEl = $('gpsSuggestBanner');
  let winner = null;
  if (state.activeAlert) winner = 'alert';
  else if (state.bannerState.offline) winner = 'offline';
  else if (state.bannerState.stormSevere) winner = 'storm';
  else if (state.alertEnabled) winner = 'monitor';
  else if (state.bannerState.lineTip) winner = 'line';
  else if (state.bannerState.gpsSuggest) winner = 'gps';

  if (monEl) monEl.classList.toggle('on', winner === 'alert' || winner === 'monitor');
  if (offEl) offEl.style.display = winner === 'offline' ? 'flex' : 'none';
  if (stormEl) stormEl.style.display = winner === 'storm' ? 'flex' : 'none';
  if (lineEl) lineEl.style.display = winner === 'line' ? 'flex' : 'none';
  if (gpsEl) gpsEl.style.display = winner === 'gps' ? 'flex' : 'none';
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
  const expandedTxt = en ? 'Hide 2h energy chart' : '收起 2 小時能量曲線';
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
      if (nextUrl !== location.href) history.replaceState(history.state, '', nextUrl);
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
    ? (isEn() ? 'Red night vision ON (tap the eye icon again to restore)' : '已開啟紅光夜視（保護暗視力，再點右上角眼睛即可恢復）')
    : (isEn() ? 'Red night vision OFF' : '已關閉紅光夜視'), 'info');
}

function applyStaticI18n() {
  state.tempUnit = detectTempUnit();
  syncTempUnitBtn();
  applyStaticI18nDom({
    $, en: isEn(), currentPos: state.pos, currentCamKey: state.camKey,
    hasLiveState: Boolean(state.renderState),
    onUpdateCamDayNotice: updateSkyCamDayNotice
  });
  syncNavSatLabel();
}

function toggleLang() {
  setLang(isEn() ? 'zh' : 'en');
  saveLangPref(getLang());
  applyStaticI18n();
  syncSwToggleUI();
  renderLocationHeader();
  renderMonitorBar();
  renderGpsSuggestBanner();
  renderTripWatchlist();
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
      if (state.wakeLockObj === wl) {
        state.wakeLockObj = null;
        if (state.alertEnabled && !document.hidden) {
          state.wakeLockFailed = true;
          renderMonitorBar();
        }
      }
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
      ? 'Screen-on monitor ON (browser limit: keep screen open for chime alerts)'
      : '螢幕常亮監測已開啟（網頁限制：需保持畫面開啟，達標時響鈴提醒）', 'warn');
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

function maybeTriggerAlert(sc, goesSub, scNext, bal, pos = state.pos, fmiMag = null) {
  if (!state.alertEnabled) return;
  const check = shouldTriggerAuroraAlert({ sc, goesSub, fmiMag, scNext, bal });
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
  state.watchlist = loadWatchlist();
  applyRedModeUI();
  const urlPos = parseUrlLocation(location.search);
  state.urlHasExplicitPos = Boolean(urlPos);
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
  const en = isEn();
  if (cam && Number.isFinite(cam.lat)) {
    const nowCam = new Date();
    const zCam = getZoneParts(nowCam, cam.tz || 'UTC');
    const localHM = `${zCam.hourStr}:${zCam.minStr}`;
    const camDistKm = (!cam.isMag && Number.isFinite(state.pos?.lat) && Number.isFinite(state.pos?.lon))
      ? Math.round(computeDistanceKm(state.pos.lat, state.pos.lon, cam.lat, cam.lon))
      : 0;
    const distNote = camDistKm > 50
      ? (en ? ` · ~${camDistKm} km away` : ` · 距目前位置約 ${camDistKm} km`)
      : '';
    if (cam.isMag) {
      setText('subCam', en
        ? `Nordic magnetometer network · Local ${localHM} (auto-updated)`
        : `北歐即時地磁監測圖 · 當地時間 ${localHM}（自動更新）`);
    } else if (cam.isRoadCam) {
      const sunCam = computeSolarElevation(nowCam, cam.lat, cam.lon);
      const skyState = sunCam <= -6
        ? (en ? 'Night' : '夜間')
        : (sunCam <= 0 ? (en ? 'Twilight' : '暮光') : (en ? 'Daylight' : '白天'));
      setText('subCam', en
        ? `Local ${localHM} · ${skyState} road & horizon camera${distNote} (~10m)`
        : `當地時間 ${localHM} · ${skyState}公路與天際線實拍${distNote}（約每 10 分鐘更新）`);
    } else {
      const sunCam = computeSolarElevation(nowCam, cam.lat, cam.lon);
      const skyState = sunCam <= -6
        ? (en ? 'Dark sky' : '目前黑夜')
        : (sunCam <= 0 ? (en ? 'Twilight' : '目前暮光') : (en ? 'Daylight' : '目前白天'));
      setText('subCam', en
        ? `Local ${localHM} · ${skyState}${distNote} (check stars or cloud gaps directly)`
        : `當地時間 ${localHM} · ${skyState}${distNote}（畫面直接看星星或雲縫）`);
    }
  }
  if (!notice) return;
  if (!cam || cam.isMag || cam.isRoadCam || !Number.isFinite(cam.lat)) {
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
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (img) {
    if (!offline) {
      const bucket = Math.floor(Date.now() / 120000);
      const nextSrc = `${SKY_CAMS[key].url}?t=${bucket}`;
      img.style.display = '';
      if (img.src !== nextSrc) img.src = nextSrc;
    } else if (!img.complete || img.naturalWidth === 0) {
      img.style.display = 'none';
    }
  }
  renderSkyCamCaption($, key, isEn());
  updateSkyCamDayNotice(key);
}

function getActiveSkyCamRegion(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 0) return null;
  const nearNordic = findNearestCamInRegion(lat, lon, 'nordic');
  if (nearNordic.distKm <= 650) return { region: 'nordic', key: nearNordic.key };
  const nearIceland = findNearestCamInRegion(lat, lon, 'iceland');
  if (nearIceland.distKm <= 500) return { region: 'iceland', key: nearIceland.key };
  const nearNa = findNearestCamInRegion(lat, lon, 'na');
  if (nearNa.distKm <= 1800) return { region: 'na', key: nearNa.key };
  return null;
}

function syncNavSatLabel() {
  setText('navSat', term(TERMS.nav.liveMap, isEn()));
  const camCard = $('skyCamCard');
  if (camCard) camCard.style.display = getActiveSkyCamRegion(state.pos.lat, state.pos.lon) ? 'block' : 'none';
}

function selectWindyOverlay(overlay, btn) {
  const valid = ['clouds', 'lclouds', 'satellite'];
  if (!valid.includes(overlay)) return;
  state.windyOverlay = overlay;
  document.querySelectorAll('#windyLayerChips .chip').forEach(c => {
    c.classList.toggle('on', btn ? c === btn : c.dataset.overlay === overlay);
  });
  const we = $('windyExtLink');
  if (we) {
    we.href = `https://www.windy.com/${state.pos.lat.toFixed(3)}/${state.pos.lon.toFixed(3)}?${overlay},${state.pos.lat.toFixed(3)},${state.pos.lon.toFixed(3)},8`;
  }
  if ($('v-sat')?.classList.contains('on')) syncSatTab();
  haptic(5);
}

function syncSatTab() {
  syncNavSatLabel();
  const wf = $('windyFrame');
  if (!wf) return;
  const en = isEn();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const wfWrap = wf.parentElement;
  let offBox = $('windyOfflineBox');
  if (offline) {
    wf.style.display = 'none';
    if (!offBox && wfWrap) {
      offBox = document.createElement('div');
      offBox.id = 'windyOfflineBox';
      offBox.className = 'windy-offline';
      wfWrap.appendChild(offBox);
    }
    if (offBox) {
      offBox.style.display = 'flex';
      offBox.textContent = en
        ? 'Offline — Windy cloud forecast map requires signal. Your cached 24h forecast remains available on Overview.'
        : '目前無網路訊號 — 動態雲量預報需連線載入，可先回到「總覽」查看快取預報。';
    }
  } else {
    if (offBox) offBox.style.display = 'none';
    wf.style.display = '';
    const ov = state.windyOverlay || 'clouds';
    const target = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&overlay=${ov}&lat=${state.pos.lat.toFixed(3)}&lon=${state.pos.lon.toFixed(3)}&zoom=7`;
    if (wf.src !== target) wf.src = target;
  }
  document.querySelectorAll('#windyLayerChips .chip').forEach(c => {
    c.classList.toggle('on', c.dataset.overlay === (state.windyOverlay || 'clouds'));
  });
  const hemi = state.pos.lat >= 0 ? 'north' : 'south';
  setText('ovHeading', state.pos.lat >= 0
    ? (en ? 'Northern aurora forecast (NOAA)' : '北半球極光範圍預報（NOAA）')
    : (en ? 'Southern aurora forecast (NOAA)' : '南半球極光範圍預報（NOAA）'));
  setHtml('ovCap', `<a class="src-link" target="_blank" rel="noopener noreferrer" href="https://www.spaceweather.gov/products/aurora-30-minute-forecast">${en ? 'Source: NOAA SWPC OVATION 30-min forecast model (Green = aurora, Yellow/Red = strong) ↗' : '資料來源：NOAA SWPC OVATION 30 分鐘預報模型（綠色＝有極光、黃紅＝強爆發）↗'}</a>`);
  const ovImg = $('ovationImg');
  if (ovImg && !offline) {
    const bucket = Math.floor(Date.now() / 180000);
    const nextOv = `https://services.swpc.noaa.gov/images/animations/ovation/${hemi}/latest.jpg?t=${bucket}`;
    ovImg.style.display = '';
    if (ovImg.src !== nextOv) ovImg.src = nextOv;
  } else if (ovImg && offline && (!ovImg.complete || ovImg.naturalWidth === 0)) {
    ovImg.style.display = 'none';
  }

  const camCard = $('skyCamCard');
  const activeCam = getActiveSkyCamRegion(state.pos.lat, state.pos.lon);
  const activeRegion = activeCam?.region || null;
  const nearestKey = activeCam?.key || null;

  if (camCard) camCard.style.display = activeRegion ? 'block' : 'none';
  if (activeRegion) {
    setText('h2Cam', activeRegion === 'na'
      ? (en ? 'North America live sky cams' : '北美即時天空實拍')
      : (activeRegion === 'iceland'
          ? (en ? 'Iceland live sky cams' : '冰島即時天空實拍')
          : (en ? 'Nordic live sky cams' : '北歐即時天空實拍')));
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
  if (name === 'dir' || name === 'sat') trackEvent(`tab/${name}`, `Tab: ${name}`, { once: true });
  haptic(6);
  const targetY = state.tabScrollY[name] || 0;
  window.scrollTo({ top: targetY, behavior: 'auto' });
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
    pick.setAttribute('aria-label', `${src}: ${getPosDisplayName()}. ${en ? 'Tap to change' : '點選切換地點'}`);
  }

  syncPresetChipHighlight();
  renderTripWatchlist();
  syncNavSatLabel();
  renderTrustStatGrid($, state.pos, en);
  const windyUrl = `https://www.windy.com/${state.pos.lat.toFixed(3)}/${state.pos.lon.toFixed(3)}?clouds,${state.pos.lat.toFixed(3)},${state.pos.lon.toFixed(3)},8`;
  const yrUrl = `https://www.yr.no/en/forecast/daily-table/${state.pos.lat.toFixed(3)},${state.pos.lon.toFixed(3)}`;
  const we = $('windyExtLink');
  if (we) we.href = windyUrl;
  const pm = $('pMet');
  if (pm) pm.href = isInNordicMetBox(state.pos.lat, state.pos.lon) ? yrUrl : windyUrl;
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
  return `${n}°C`;
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
  const bestTimeLbl = bestInVis ? formatHourLabel(bestInVis, en) : '';
  const bestIsNextNight = bestInVis ? isNextNightHour(bestInVis) : false;
  const dirs = state.renderState?.dirResults;
  const worthChase = state.renderState?.compassOpts ? Boolean(state.renderState.compassOpts.auroraWorthViewing) : true;
  const compassGood = worthChase && (!Array.isArray(dirs) || dirs.length < 2 || Boolean(summarizeCompass(dirs, getLang(), state.renderState?.compassOpts)?.good));
  const bestText = formatWavePeakSummary({
    vis, bestInVis, outZoneKind, isOutOfZone, bestTimeLbl, bestIsNextNight, compassGood, en
  });
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
  const det = formatHourScrubDetail({
    h, idx,
    tStr: formatHourLabel(h, en),
    lastScore: state.lastScore,
    fmtTempFn: fmtTemp,
    tierWord: scoreTierWord(h.score, h.isDay, en),
    scCol: h.isDay ? 'var(--blue)' : tierColor(h.score),
    en
  });
  setHtml('hourDetail', det.html);
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
  const ev = resolveStormEvent({ scales, noaaAlert });
  if (!ev) {
    syncBannerBudget();
    return;
  }

  const gNamesZh = { 1: '輕度', 2: '中度', 3: '強烈', 4: '嚴重', 5: '極端' };
  const gNamesEn = { 1: 'Minor', 2: 'Moderate', 3: 'Strong', 4: 'Severe', 5: 'Extreme' };
  const { useAlert, isShock, level: lvl, isWarn, isActiveNow: isNow, isSevere, peakDate } = ev;
  const dStr = fmtMonthDay(peakDate, en);

  if (!isSevere) {
    if (useAlert) {
      state.bannerState.stormMinorTag = isWarn
        ? (en ? `G${lvl} storm likely` : `可能發生 G${lvl} 地磁暴`)
        : (en ? `G${lvl} storm now` : `G${lvl} 地磁暴進行中`);
    } else {
      state.bannerState.stormMinorTag = isNow
        ? (en ? `G${lvl} storm now` : `G${lvl} 地磁暴進行中`)
        : (en ? `G${lvl} storm likely${dStr ? ` · ${dStr}` : ''}` : `${dStr ? `${dStr} ` : ''}可能發生 G${lvl} 地磁暴`);
    }
    syncBannerBudget();
    return;
  }

  el.className = 'storm-banner severe';
  const desc = en ? (gNamesEn[lvl] || 'Geomagnetic') : (gNamesZh[lvl] || '');
  const pill = isShock
    ? (isWarn ? (en ? 'Solar storm' : '太陽風暴') : (en ? 'Shock arrived' : '衝擊抵達'))
    : (useAlert && isWarn ? (en ? `G${lvl} likely` : `預計 G${lvl}`) : `NOAA G${lvl}`);
  let txt;
  if (isShock) {
    txt = isWarn
      ? (en ? 'Solar storm on the way — aurora may brighten suddenly' : '太陽風暴即將抵達，極光可能突然增強')
      : (en ? 'Solar storm arrived — aurora may brighten suddenly' : '太陽風暴剛抵達地球，極光可能突然增強');
  } else if (useAlert) {
    txt = isWarn
      ? (en ? `${desc} geomagnetic storm (G${lvl}) likely` : `可能發生${desc}地磁暴（G${lvl}）`)
      : (en ? `${desc} geomagnetic storm (G${lvl}) now` : `${desc}地磁暴（G${lvl}）進行中`);
  } else {
    txt = isNow
      ? (en ? `${desc} geomagnetic storm now — aurora reaching further` : `${desc}地磁暴進行中 · 極光範圍擴大`)
      : (en ? `${desc} geomagnetic storm likely${dStr ? ` · ${dStr}` : ''}` : `${dStr ? `${dStr} ` : ''}可能發生${desc}地磁暴`);
  }
  el.innerHTML = `<span class="storm-pill">${escapeHtml(pill)}</span><span class="storm-txt">${escapeHtml(txt)}</span><span class="storm-arr">↗</span>`;
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
    const { clearTxt, kpTxt, winTxt, iconClearPct } = formatOutlookRowStats({ n, idx: i, en });
    const gTag = n.kpAvailable !== false && n.gScale >= 1 ? ` <span class="od-g">G${n.gScale}</span>` : '';
    const isBest = i === bestIdx;
    const skyIco = buildOutlookSkyIcon({ score: scoreVal, clearPct: iconClearPct, scoreAvailable: hasScore });
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
    `<div class="sb-top"><strong>${escapeHtml(tStr)}</strong> <strong style="color:${eCol}">${escapeHtml(eWord)} · ${eVal}<span class="sb-unit">/100</span></strong></div><div class="sb-bot">${escapeHtml(metaTxt)}</div>`);
  const prevBtn = $('bzPrevBtn'), nextBtn = $('bzNextBtn');
  if (prevBtn) prevBtn.disabled = clampedIdx <= 0;
  if (nextBtn) nextBtn.disabled = clampedIdx >= series.length - 1;
}

function renderNoaaSection({ magSeries, chartSeries, speed, goesSub, fmiMag, substormPhase, noaaScales, noaaAlert, bal, noaaOk, noaaLagMin, pos }) {
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

  const groundBurst = Boolean(fmiMag?.active);
  const groundRecovery = Boolean(!groundBurst && substormPhase?.phase === 'recovery' && substormPhase?.groundTriggered);
  const isBurst = Boolean(groundBurst || goesSub?.active || bal?.shockActive);
  const isBrighten = Boolean(enSum.good || (latestEnergy !== null && latestEnergy >= 62));
  const isBuilding = Boolean(!isBrighten && latestEnergy !== null && latestEnergy >= 25);

  const bzBadge = $('bzBadge');
  if (bzBadge) {
    const leadTag = en ? `~${etaMin}m` : `約 ${etaMin} 分後`;
    if (groundBurst) {
      bzBadge.innerHTML = `${en ? 'Now' : '即時'} · <strong style="color:var(--green);">${en ? 'Substorm active' : '頭頂爆發中'}</strong>`;
      bzBadge.className = 'sw-badge sw-good';
    } else if (isBurst) {
      bzBadge.innerHTML = `${leadTag} · <strong style="color:var(--green);">${escapeHtml(term(TERMS.solarWind.strong, en))}</strong>`;
      bzBadge.className = 'sw-badge sw-good';
    } else if (isBrighten) {
      bzBadge.innerHTML = `${leadTag} · <strong style="color:var(--green);">${escapeHtml(term(TERMS.solarWind.active, en))}</strong>`;
      bzBadge.className = 'sw-badge sw-good';
    } else if (isBuilding) {
      bzBadge.innerHTML = `${leadTag} · <strong style="color:var(--amber);">${escapeHtml(term(TERMS.solarWind.building, en))}</strong>`;
      bzBadge.className = 'sw-badge sw-warn';
    } else if (groundRecovery) {
      bzBadge.innerHTML = `${en ? 'Now' : '即時'} · <strong style="color:var(--amber);">${en ? 'Recovery glow' : '餘韻持續'}</strong>`;
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
    eb.className = 'sw-summary' + (isBurst || isBrighten ? ' sw-sum-good' : ((isBuilding || groundRecovery) ? ' sw-sum-warn' : ''));
    if (groundBurst) {
      eb.textContent = en
        ? `Local magnetometer (${fmiMag.stationName}) recorded a ${fmiMag.bayDropNt} nT overhead drop — substorm active now.`
        : `當地地磁站（${fmiMag.stationName}）測得頭頂磁場驟降 ${fmiMag.bayDropNt} nT，極光正處於爆發期。`;
    } else if (goesSub?.active) {
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
    } else if (groundRecovery) {
      eb.textContent = en
        ? `Recent magnetic activity (${fmiMag.stationName}, ${fmiMag.amp60Nt} nT/h) — faint recovery glow may persist.`
        : `當地地磁剛有擾動（${fmiMag.stationName}），高空仍可能有餘韻極光。`;
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
  const hasNowMarker = Boolean(bal && Number.isInteger(bal.arrivingIdx) && bal.arrivingIdx > 4 && bal.arrivingIdx < (chartSeries?.length || 0) - 4);
  const nowClock = hasNowMarker ? utcTagToLocalHM(chartSeries[bal.arrivingIdx]?.time_tag, tz, etaMin) : '';
  setHtml('bzHtmlHead', hasNowMarker && nowClock
    ? (en
        ? `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, true))}</span><span>Now <strong>${escapeHtml(nowClock)}</strong> · Incoming right</span>`
        : `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, false))}</span><span>現在 <strong>${escapeHtml(nowClock)}</strong> · 右側陸續抵達</span>`)
    : (en
        ? `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, true))}</span><span>Estimated Earth arrival</span>`
        : `<span>${escapeHtml(term(TERMS.solarWind.axisTitle, false))}</span><span>已換算為到達地球當地時間</span>`));
  setText('etaHint', en
    ? (hasNowMarker && etaClock
        ? `Right of Now marker = measured wind arriving by ${etaClock}`
        : (etaClock ? `Earth-arrival local time (incoming wind arriving by ${etaClock})` : 'Time axis shows estimated Earth arrival'))
    : (hasNowMarker && etaClock
        ? `「現在」標記右側＝已測得太陽風，預估於 ${etaClock} 前陸續到達`
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
        ? (en ? `NOAA Aurora Map (${noaaLagMin}m lag) ↗` : `NOAA 極光總覽（延遲 ${noaaLagMin} 分鐘）↗`)
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

function renderRoadLinks(pos, en) {
  const wrap = $('roadLinks');
  if (!wrap || !pos) return;
  let links = [];
  if (pos.lat >= 55 && pos.lat <= 72 && pos.lon >= -26 && pos.lon <= 35) {
    if (pos.lon <= -10) {
      links.push({ id: 'roadIs', url: 'https://umferdin.is/en', zh: '冰島 Umferðin ↗', en: 'Iceland Umferðin ↗' });
      links.push({ id: 'roadIsSafe', url: 'https://safetravel.is/', zh: '冰島 SafeTravel ↗', en: 'SafeTravel.is ↗' });
    } else if (pos.lon >= 4) {
      if (pos.lon < 26 || pos.lat >= 69.0) links.push({ id: 'roadNo', url: 'https://www.vegvesen.no/trafikk', zh: '挪威 Vegvesen ↗', en: 'Norway Vegvesen ↗' });
      if (pos.lon >= 11 && pos.lon <= 25) links.push({ id: 'roadSe', url: 'https://www.trafikverket.se/trafikinformation/vag/', zh: '瑞典 Trafikverket ↗', en: 'Sweden Trafikverket ↗' });
      if (pos.lon >= 20) links.push({ id: 'roadFi', url: 'https://liikennetilanne.fintraffic.fi/', zh: '芬蘭 Fintraffic ↗', en: 'Finland Roads ↗' });
    }
  } else if (pos.lat >= 54 && pos.lon <= -100) {
    if (pos.lon <= -130) links.push({ id: 'roadAk', url: 'https://511.alaska.gov/', zh: '阿拉斯加 511 ↗', en: 'Alaska 511 ↗' });
    if (pos.lat >= 59 && pos.lon >= -142 && pos.lon <= -123) links.push({ id: 'roadYk', url: 'https://511yukon.ca/', zh: '育空 511 ↗', en: 'Yukon 511 ↗' });
    if (pos.lat >= 59 && pos.lon >= -126 && pos.lon <= -102) links.push({ id: 'roadNwt', url: 'https://www.inf.gov.nt.ca/en/services/highways/highway-conditions', zh: '黃刀公路路況 ↗', en: 'NWT Highways ↗' });
  } else if (pos.lat >= 49 && pos.lat < 54 && pos.lon >= -120 && pos.lon <= -110) {
    links.push({ id: 'roadAb', url: 'https://511.alberta.ca/', zh: '亞伯達 511 路況 ↗', en: '511 Alberta ↗' });
  } else if (pos.lat <= -34 && pos.lon >= 143) {
    if (pos.lon >= 165) links.push({ id: 'roadNz', url: 'https://www.journeys.nzta.govt.nz/', zh: '紐西蘭 NZTA 路況 ↗', en: 'NZTA Journeys ↗' });
    else if (pos.lat <= -40 && pos.lon <= 149) links.push({ id: 'roadTas', url: 'https://www.police.tas.gov.au/community-alerts/', zh: '塔斯馬尼亞路況 ↗', en: 'Tasmania Alerts ↗' });
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

function renderCompassPanel(dirResults, pos, en, compassOpts = null) {
  renderRoadLinks(pos, en);
  const sum = summarizeCompass(dirResults, getLang(), compassOpts);
  const cs = $('compassSummary');
  if (cs) {
    cs.className = 'callout ' + (sum?.good ? 'good' : 'warn');
    cs.textContent = sum ? sum.text : (en ? 'No data' : '無資料');
  }
  setHtml('radarSvg', buildCompassRadarSVG(dirResults, pos, getLang()));

  const cBox = $('compassBox');
  if (!cBox || !Array.isArray(dirResults)) return;
  const hereIsClear = sum?.bestKey === 'here';
  const hereClear = Number.isFinite(sum?.hereClear) ? sum.hereClear : 0;
  const landDirs = dirResults.slice(1).filter(d => d && !d.isOcean && !d.unavailable && Number.isFinite(d.avg3h));
  const allCloudyNearby = !hereIsClear && !sum?.good && landDirs.length > 0 && landDirs.every(d => Math.round(100 - d.avg3h) < 30);
  const escCity = compassOpts?.originGlare?.cityName || '';
  const escDirShort = compassOpts?.originGlare?.escapeDirShort || (en ? 'north' : '北');
  const refHeader = hereIsClear
    ? (sum?.glareEscapeKey && escCity
        ? `<div class="dir-ref-hd">${escapeHtml(en ? `Nearby reference · clear here; check ${escDirShort}-side spots to avoid ${escCity} glow` : `周邊參考 · 原地已晴空，想避開${escCity}市區光害可看${escDirShort}側地點`)}</div>`
        : `<div class="dir-ref-hd">${en ? 'Nearby skies for reference · no need to drive' : '周邊晴空參考 · 目前無需遠行'}</div>`)
    : (allCloudyNearby
        ? `<div class="dir-ref-hd">${en ? 'Nearby skies are also cloudy · no need to drive' : '周邊同樣多雲 · 目前不建議遠行'}</div>`
        : '');
  cBox.innerHTML = refHeader + dirResults.slice(1).map(d => {
    const isBest = Boolean(sum && sum.bestKey === d.key);
    const isGlareEscape = Boolean(hereIsClear && sum && sum.glareEscapeKey === d.key);
    const isGeneric = Boolean(d.isGeneric);
    const unavail = Boolean(d.unavailable) || !Number.isFinite(d.avg3h);
    const hazard = isCorridorHazard(d);
    const clear3h = unavail ? null : Math.max(0, Math.min(100, Math.round(100 - d.avg3h)));
    const clearNow = unavail ? null : Math.max(0, Math.min(100, Math.round(100 - d.nowC)));
    const col = unavail ? '' : (d.isOcean ? 'c-blue' : (hazard ? 'c-red' : (clear3h >= 65 ? 'c-green' : clear3h >= 35 ? 'c-amber' : 'c-muted')));
    const kmVal = Number.isFinite(d.roadKm) ? d.roadKm : (Number.isFinite(d.distKm) ? d.distKm : Math.round(computeDistanceKm(pos.lat, pos.lon, d.lat, d.lon)));
    const driveEst = (!d.isOcean && !isGeneric && Number.isFinite(kmVal) && kmVal > 0) ? fmtWinterDrive(kmVal, en) : '';
    const distTag = isGeneric
      ? (en ? ' · area reference' : ' · 區域參考')
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
    if (!d.isOcean && !unavail && d.iceFogRisk) {
      hazards.push(en ? 'Local fog / ice mist' : '局部凍霧／低霧');
    }
    const rainTag = (!d.isOcean && !unavail && precipMm >= 0.2 && d.temp > 1.5)
      ? (en ? ' · Rain' : ' · 降雨')
      : '';
    const hazardHtml = hazards.length ? `<div class="dir-hazards">${escapeHtml(hazards.join(' · '))}</div>` : '';
    const baseNote = en ? (d.roadNoteEn || '') : (d.roadNote || '');
    const noteText = baseNote || (isGeneric && isBest && !hereIsClear
      ? (en ? 'Weather sample point — tap View area to pick a main-road town or pullout' : '直線氣象採樣點，點「看區域」挑選主幹道城鎮或停靠處')
      : '');
    const glare = sum?.glareByKey?.[d.key] || null;
    const glareHtml = (glare && glare.tagText && !noteText.includes(glare.tagText))
      ? `<div class="${glare.isWarning ? 'dir-note' : 'dir-tip'}">${escapeHtml(glare.tagText)}</div>`
      : '';
    const hor = (!d.isOcean && !isGeneric && Number.isFinite(d.lat) && Number.isFinite(d.lon))
      ? lookupCorridorHorizon({ lat: d.lat, lon: d.lon, azimuthDeg: compassOpts?.geom?.azimuthDeg ?? null })
      : null;
    const horHtml = (hor && hor.matched && hor.blocksLow)
      ? `<div class="dir-note">${escapeHtml(en ? `⛰ Distant ridges block ≥${hor.minDeg}° toward aurora (excl. local trees/buildings)` : `⛰ 極光方位遠山至少遮蔽約 ${hor.minDeg}°（不含近處樹林與建物）`)}</div>`
      : '';
    const isPositiveNote = /雨影|晴空|暗空|主幹道|視野開闊|開闊區|rain shadow|dark sky|main highway|paved|open northern|open southern|open sky/i.test(noteText);
    const noteHtml = noteText ? `<div class="${isPositiveNote ? 'dir-tip' : 'dir-note'}">${escapeHtml(noteText)}</div>` : '';
    const areaHref = `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`;
    const driveHref = `https://www.google.com/maps/dir/?api=1&origin=${pos.lat},${pos.lon}&destination=${d.lat},${d.lon}&travelmode=driving`;
    const worthDriving = !hereIsClear && !allCloudyNearby && (isBest || (clear3h !== null && clear3h >= 65 && (clear3h - hereClear) >= 15));
    const demoteToMap = hereIsClear || allCloudyNearby || (clear3h !== null && clear3h < 25);
    let nav;
    if (d.isOcean || unavail) {
      nav = d.isOcean
        ? `<span class="dir-ref c-blue">${en ? 'Open Sea' : '海域參考'}</span>`
        : `<span class="dir-ref c-muted">${en ? 'Unavailable' : '暫無資料'}</span>`;
    } else if (isGeneric) {
      const cls = hazard ? 'btn-hazard' : (isBest && !hereIsClear ? 'btn-blue' : 'btn-area');
      const lbl = en ? (hazard ? 'View area ⚠' : 'View area') : (hazard ? '看區域 ⚠' : '看區域');
      nav = `<a class="btn ${cls}" target="_blank" rel="noopener noreferrer" href="${areaHref}">${lbl}</a>`;
    } else if (demoteToMap) {
      nav = `<a class="btn btn-area" target="_blank" rel="noopener noreferrer" href="${areaHref}">${en ? 'Map' : '看地圖'}</a>`;
    } else {
      const cls = hazard ? 'btn-hazard' : (worthDriving ? 'btn-blue' : 'btn-area');
      const lbl = en ? (hazard ? 'Drive anyway' : 'Drive') : (hazard ? '仍要導航' : '導航');
      nav = `<a class="btn ${cls}" target="_blank" rel="noopener noreferrer" href="${driveHref}">${lbl}</a>`;
    }
    const isEtaShifted = !d.isOcean && Number.isFinite(d.etaHours) && d.etaHours >= 1;
    const trendArrow = isEtaShifted && d.arrivalTrend === 'clearing'
      ? ' ↗'
      : (isEtaShifted && d.arrivalTrend === 'closing' ? ' ↘' : '');
    const winLbl = isEtaShifted
      ? (en ? 'On arrival' : '抵達後 3h')
      : (en ? 'Next 3h' : '3 小時晴空率');
    const statLine = unavail
      ? (en ? 'Forecast temporarily unavailable' : '此方向氣象暫時無法取得')
      : `${winLbl} <strong class="${col}">${clear3h}%${trendArrow}</strong> · ${en ? 'now' : '目前'} ${clearNow}% · ${fmtTemp(d.temp)}${rainTag}`;
    const badgeHtml = isBest
      ? ` <span class="dir-best-tag">${en ? 'Best' : '最佳'}</span>`
      : (isGlareEscape ? ` <span class="dir-best-tag">${en ? 'Avoids glare' : '避光害參考'}</span>` : '');
    return `<div class="dir ${isBest ? 'best' : ''} ${hazard ? 'hazard' : ''} ${d.isOcean ? 'sea' : ''} ${demoteToMap ? 'ref-only' : ''}" data-dir-card="${escapeHtml(d.key)}">
      <div class="dir-main"><div class="dir-title">${escapeHtml(tDirLabel(d.label))}${badgeHtml}<span class="dir-dist">${distTag}</span></div>
      <div class="dir-stat">${statLine}</div>${hazardHtml}${glareHtml}${horHtml}${noteHtml}</div>
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
    pos: stPos, magSeries, chartSeries, speed, bz, kp, ovation, hpiGw, goesSub, fmiMag, substormPhase,
    noaaScales, noaaAlert, kyotoDst, enlilForecast, predKp1h, bal,
    noaaOk, noaaLagMin, hereHrs, dirResults, weatherSourceLabel, usedMet, cloudConsensus, metarObs, metarFusion, nowcastObs,
    bmaWeight2, sunAltNow, mltNow, moon, sc, scNext, bestDark, nights3, multiDayPts, kpForecast, fetchedAt
  } = st;
  const pos = stPos || state.pos;
  const refNow = fetchedAt instanceof Date ? fetchedAt : (fetchedAt ? new Date(fetchedAt) : new Date());
  const safeBal = bal || { etaMin: 45, nowBz: bz, nextBz: bz, cleanLatestBz: bz, nowPdyn: null, nowShockJumpNpa: 0, pdyn: null, shockActive: false, energy120: [], arrivingIdx: -1 };

  const etaClock = renderNoaaSection({
    magSeries: magSeries || [], chartSeries: chartSeries || [], speed, goesSub, fmiMag, substormPhase,
    noaaScales, noaaAlert, bal: safeBal, noaaOk, noaaLagMin, pos
  });
  if (!hereHrs || !hereHrs.length) return;
  const c0 = hereHrs[0].block;

  // Dynamic ambient sky mood (subtle 1P atmosphere)
  const severeStorm = Boolean((noaaAlert?.active && (noaaAlert.kind === 'cme-shock' || (noaaAlert.gScale || 0) >= 3)) || (noaaScales?.currentScale || 0) >= 3);
  document.body.dataset.mood = severeStorm ? 'storm' : (sc.total >= 65 ? 'prime' : (sc.total >= 35 ? 'active' : 'quiet'));

  const metarCalibrated = Boolean(
    metarObs && metarFusion?.applied && (metarObs.distKm ?? 99) <= 25 && (metarObs.ageMin ?? 99) <= 60
  );
  const effSubstormJump = Math.max(goesSub ? goesSub.jumpNt : 0, fmiMag?.groundSubstormJumpNt || 0);
  const substormSource = (fmiMag?.groundSubstormJumpNt || 0) > (goesSub ? goesSub.jumpNt : 0) ? 'FMI' : 'GOES';
  const expNow = explainAuroraScore({
    lat: pos.lat, lon: pos.lon,
    cloudNow: c0, sunAlt: sunAltNow,
    bz: safeBal.nowBz ?? bz, speed, kp, ovation, hpiGw,
    substormJumpNt: effSubstormJump, substormSource,
    pdyn: safeBal.nowPdyn, shockJumpNpa: safeBal.nowShockJumpNpa,
    newell: safeBal.nowNewell, preconditionedNewell60: safeBal.avgNewell60,
    dst: st.effectiveDst?.dstNow ?? kyotoDst?.dst ?? null,
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
  const effDstNow = st.effectiveDst?.dstNow ?? kyotoDst?.dst ?? null;
  if (effDstNow !== null && Number.isFinite(effDstNow)) {
    rawParts.push(`${st.effectiveDst?.usedMhd ? 'MHD Dst' : 'Dst'} ${effDstNow} nT`);
  }
  if (fmiMag && Number.isFinite(fmiMag.bayDropNt)) {
    const magMetric = fmiMag.bayDropNt >= 15 ? `-${fmiMag.bayDropNt}nT` : `${fmiMag.amp60Nt}nT/h`;
    rawParts.push(`${fmiMag.source || 'FMI'} ${fmiMag.code} ${magMetric} (${fmiMag.ageMin}m)`);
  }
  if (metarObs && metarFusion?.applied) {
    if (metarObs.source === 'SMHI') {
      rawParts.push(`SMHI ${metarObs.stationId || metarObs.icao} ${metarObs.clearPct}% clr (${metarObs.ageMin}m)`);
    } else if (metarObs.source === 'FMI') {
      rawParts.push(`FMI ${metarObs.clearPct}% clr (${metarObs.ageMin}m)`);
    } else {
      const ceilStr = metarObs.ceilingM ? ` ${metarObs.ceilingM}m` : '';
      rawParts.push(`METAR ${metarObs.icao} ${metarObs.skyCode}${ceilStr} (${metarObs.ageMin}m)`);
    }
  }
  if (nowcastObs?.source === 'radar-5m') {
    rawParts.push(nowcastObs.radarActive ? `Radar 5m (${nowcastObs.precipRate}mm/h)` : 'Radar 5m');
  } else if (nowcastObs?.source === 'gps-15m') {
    rawParts.push('GPS 15m');
  }
  if (Number.isFinite(bmaWeight2)) {
    rawParts.push(`BMA ${Math.round(bmaWeight2 * 100)}%`);
  }
  if (st.ensMeta?.members >= 15) {
    rawParts.push(`ENS ${st.ensMeta.members}m`);
  }
  const showMetarNote = Boolean(metarObs && metarFusion?.applied && (metarFusion.discrepancyFlag || cloudConsensus?.level === 'low'));
  let metarNote = '';
  if (showMetarNote) {
    const cleanStName = metarObs.name ? String(metarObs.name).replace(/\s+(Aut|A|Flygplats)$/i, '').trim() : '';
    const stLabel = cleanStName || metarObs.icao || '';
    const stDistInt = Math.max(1, Math.round(Number(metarObs.distKm) || 1));
    const stAgeMin = Math.max(0, Math.round(Number(metarObs.ageMin) || 0));
    const stAgeZh = stAgeMin <= 1 ? '剛剛' : `${stAgeMin} 分鐘前`;
    const stAgeEn = stAgeMin <= 1 ? 'just now' : `${stAgeMin} min ago`;
    metarNote = en
      ? `Local weather station (${stLabel}, ${stDistInt} km) observed ${metarObs.clearPct}% clear ${stAgeEn}${metarObs.ceilingM ? ` · cloud base ${metarObs.ceilingM} m` : ''} — short-term clouds adjusted.`
      : `當地氣象站（${stLabel}，距 ${stDistInt} km）${stAgeZh}實測晴空率 ${metarObs.clearPct}%${metarObs.ceilingM ? ` · 雲底 ${metarObs.ceilingM} m` : ''}，已用於修正短時雲量預報。`;
  }
  renderTrustSheetLive(expNow, sc, rawParts.join(' · '), metarNote, st);

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

  const geomNow = computeViewingGeometry({
    lat: pos.lat, lon: pos.lon,
    kp: Math.max(kp ?? 0, sc.effKp ?? 0), mlt: mltNow, lang: getLang()
  });
  const urbanGlare = estimateUrbanSkyglow({
    lat: pos.lat, lon: pos.lon, geom: geomNow,
    auroraScore: sc.auroraScore, effMoonPct: moon.effMoonPct, lang: getLang()
  });
  const posBucketKey = `${Math.round(pos.lat * 2) / 2},${Math.round(pos.lon * 2) / 2}`;
  const prevBestKey = (posBucketKey === state.lastBestDirPosKey) ? state.lastBestDirKey : null;
  const compassOpts = {
    originGlare: urbanGlare,
    geom: geomNow,
    auroraWorthViewing: isAuroraWorthViewing({ sc, scNext, bal: safeBal, goesSub, fmiMag }),
    glareEscapeWorth: !sc.isTooBright && !sc.outOfZone && ((sc.total ?? 0) >= 18 || (sc.auroraScore ?? 0) >= 20),
    isTooBright: Boolean(sc.isTooBright),
    outOfZone: Boolean(sc.outOfZone),
    auroraScore: sc.auroraScore,
    effMoonPct: moon.effMoonPct,
    prevBestKey
  };
  st.compassOpts = compassOpts;

  // Frameless monochrome 1.5px SVG footnote items (traveler-relevant alerts only; local station calibration lives cleanly in Trust Sheet & confidence link)
  const heroTags = [];
  if (isExtremeCold) {
    heroTags.push(`<span class="meta-item t-red">${SVG_ICO_WARN}<span>${en ? `Extreme cold (${fmtTemp(wc0Int)})` : `極寒 ${fmtTemp(wc0Int)}`}</span></span>`);
  }
  if (isBlowingSnow) {
    heroTags.push(`<span class="meta-item t-amber">${SVG_ICO_WARN}<span>${en ? 'Blowing snow' : '吹雪強風'}</span></span>`);
  }
  if (state.bannerState.stormMinorTag && sc.outOfZone !== 'low-lat') {
    heroTags.push(`<button type="button" class="meta-item meta-btn t-amber" data-open-trust="storm" aria-haspopup="dialog" aria-controls="trustSheet">${SVG_ICO_BOLT}<span>${escapeHtml(state.bannerState.stormMinorTag)}</span>${SVG_ICO_CHEV_R}</button>`);
  }
  if (urbanGlare.level === 'strong' && !sc.isTooBright && !sc.outOfZone && !urbanGlare.stormPierces) {
    heroTags.push(`<button type="button" class="meta-item meta-btn t-muted" data-open-trust="light" aria-haspopup="dialog" aria-controls="trustSheet">${SVG_ICO_WARN}<span>${escapeHtml(urbanGlare.tagText)}</span>${SVG_ICO_CHEV_R}</button>`);
  }
  if (!heroTags.length && scNext && !sc.outOfZone) {
    const diff = scNext.total - sc.total;
    const trendTxt = diff >= 6 ? (en ? 'Rising next hour' : '未來 1 小時趨勢上升') : (diff <= -6 ? (en ? 'Fading next hour' : '未來 1 小時趨勢轉弱') : (en ? 'Steady next hour' : '未來 1 小時變化不大'));
    heroTags.push(`<span class="meta-item t-muted"><span>${trendTxt}</span></span>`);
  }
  setHtml('heroTags', heroTags.join('<span class="meta-sep" aria-hidden="true"></span>'));

  const darkWin = computeDarkWindow(refNow, pos.lat, pos.lon, pos.tz);
  const sunAltNext30 = computeSolarElevation(new Date(refNow.getTime() + 30 * 60000), pos.lat, pos.lon);
  const localizedNights3 = multiDayPts
    ? summarize3NightOutlook({
        cloudPoints: multiDayPts, kpForecast: kpForecast || [], currentKp: kp,
        lat: pos.lat, lon: pos.lon, timeZone: pos.tz, nowDate: refNow,
        enlilForecast: enlilForecast || null,
        chartHours: Array.isArray(st.scoredHours) && st.scoredHours.length ? st.scoredHours : state.scoredHours
      })
    : nights3;
  state.localizedNights3 = localizedNights3;

  const activeHrs = Array.isArray(st.scoredHours) && st.scoredHours.length ? st.scoredHours : state.scoredHours;
  if (Array.isArray(st.scoredHours) && st.scoredHours.length) state.scoredHours = st.scoredHours;

  const act = synthesizeTonightAction({
    lat: pos.lat, lon: pos.lon, sc, scNext, bal: safeBal, goesSub, fmiMag,
    bestDark, dirResults, nights3: localizedNights3, darkWin,
    kp, mlt: mltNow ?? null, effMoonPct: moon.effMoonPct, compassOpts
  });
  const { aurSubHtml, heroCue, heroSub } = buildHeroViewModel({
    pos, sc, kp, mltNow, act, activeHrs, localizedNights3, refNowMs: refNow.getTime(), urbanGlare, en
  });

  document.body.classList.remove('is-loading');
  renderGauge(sc, {
    isTooBright: sc.isTooBright,
    moon,
    skySubHtml: skyParts.join('<span class="sub-dot" aria-hidden="true">·</span>'),
    aurSubHtml,
    darkSubHtml: formatDarkCountdownSub({ darkWin, moon, en, sunAltNow, sunAltNext30, darkScore: sc.darkScore })
  });

  setText('vTitle', heroCue);
  const leadEl = $('vLead');
  if (leadEl) {
    leadEl.textContent = heroSub;
    leadEl.style.display = heroSub ? '' : 'none';
  }
  const actBtn = $('vActionBtn');
  if (actBtn) {
    const compassSum = summarizeCompass(dirResults, getLang(), compassOpts);
    state.lastBestDirPosKey = posBucketKey;
    state.lastBestDirKey = (compassSum?.good && compassSum.bestKey && compassSum.bestKey !== 'here') ? compassSum.bestKey : null;
    const bestDir = (compassSum?.good && compassSum.bestKey && compassSum.bestKey !== 'here' && Array.isArray(dirResults))
      ? dirResults.find(d => d && d.key === compassSum.bestKey)
      : null;
    const isCloudyNight = !sc.isTooBright && !sc.outOfZone && sc.skyScore < 45;
    const worthDriveNow = Boolean(act.auroraWorthDriving || act.actionType === 'drive');
    if (bestDir && isCloudyNight && worthDriveNow) {
      const clear3h = Math.max(0, Math.min(100, Math.round(100 - bestDir.avg3h)));
      const kmVal = Number.isFinite(bestDir.roadKm) ? bestDir.roadKm : (Number.isFinite(bestDir.distKm) ? bestDir.distKm : Math.round(computeDistanceKm(pos.lat, pos.lon, bestDir.lat, bestDir.lon)));
      const drv = bestDir.isGeneric ? '' : fmtWinterDrive(kmVal, en);
      const mainT = en
        ? `Clear skies ${escapeHtml(tDirLabel(bestDir.label))} (${clear3h}% clear)`
        : `${escapeHtml(tDirLabel(bestDir.label))} 找晴空（晴空 ${clear3h}%）`;
      const subT = bestDir.isGeneric
        ? (en ? `~${kmVal} km straight-line · verify road` : `直線 ~${kmVal} km · 出發前請確認路況`)
        : (en
            ? `~${kmVal} km · ${drv || 'check winter roads'}`
            : `公路 ~${kmVal} km${drv ? ` · 冬季車程${drv}` : ''}`);
      actBtn.innerHTML = `<span class="cta-txt"><strong>${mainT}</strong><span class="cta-sub">${escapeHtml(subT)}</span></span>${SVG_ICO_ARR_R}`;
      actBtn.dataset.targetView = 'dir';
      actBtn.style.display = 'flex';
    } else if (act.ctaView && act.ctaLabel) {
      actBtn.innerHTML = `<span class="cta-txt"><strong>${escapeHtml(act.ctaLabel)}</strong></span>${SVG_ICO_ARR_R}`;
      actBtn.dataset.targetView = act.ctaView;
      actBtn.style.display = 'flex';
    } else if (isCloudyNight && worthDriveNow && compassSum?.good) {
      const fallbackLbl = en ? 'Check 360° clear skies' : '查看 360° 周邊晴空';
      actBtn.innerHTML = `<span class="cta-txt"><strong>${fallbackLbl}</strong></span>${SVG_ICO_ARR_R}`;
      actBtn.dataset.targetView = 'dir';
      actBtn.style.display = 'flex';
    } else {
      actBtn.style.display = 'none';
    }
  }

  renderWaveCard(false);
  render3NightOutlook(localizedNights3);
  renderCompassPanel(dirResults, pos, en, compassOpts);
  renderTrustStatGrid($, pos, en);

  const pMet = $('pMet');
  if (pMet) {
    const isYr = weatherSourceLabel === 'Yr.no 官方' || weatherSourceLabel === 'Yr.no官方';
    const srcLbl = isYr
      ? (en ? 'Yr.no Weather' : 'Yr.no 天氣')
      : (en ? 'Windy Clouds' : 'Windy 雲圖');
    pMet.textContent = `${srcLbl} ↗`;
    pMet.href = usedMet
      ? `https://www.yr.no/en/forecast/daily-table/${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}`
      : `https://www.windy.com/${pos.lat.toFixed(3)}/${pos.lon.toFixed(3)}?clouds,${pos.lat.toFixed(3)},${pos.lon.toFixed(3)},8`;
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
      maybeTriggerAlert(snap.renderState.sc, snap.renderState.goesSub, snap.renderState.scNext, snap.renderState.bal, pos, snap.renderState.fmiMag);

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
  const cached = findMatchingOfflineCache(pos, Date.now(), null, { maxFallbackKm: 150 });
  state.bannerState.offline = true;
  if (!cached) {
    setText('offlineTxt', en
      ? `Offline: no cached forecast for ${getPosDisplayName(pos)} yet.`
      : `網路訊號中斷：尚無「${getPosDisplayName(pos)}」的快取資料。`);
    syncBannerBudget();
    return;
  }

  const minsAgo = Math.max(1, Math.round((Date.now() - cached.ts) / 60000));
  const fbDist = Number.isFinite(cached._fallbackDistKm) && cached._fallbackDistKm > 20 ? cached._fallbackDistKm : 0;
  const cachedPosLabel = fbDist
    ? (cached.posName || getPosDisplayName(pos) || '')
    : (getPosDisplayName(pos) || cached.posName || '');
  setText('offlineTxt', fbDist
    ? (en
        ? `Offline: ${minsAgo}m old cache from ${cachedPosLabel} (~${fbDist} km away).`
        : `離線模式：顯示約 ${fbDist} km 外（${cachedPosLabel}）${minsAgo} 分鐘前快取。`)
    : (en
        ? `Offline: ${minsAgo}m old cache (${cachedPosLabel}).`
        : `離線模式：顯示 ${minsAgo} 分鐘前（${cachedPosLabel}）快取資料。`));
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
function clearGpsSuggestion() {
  state.gpsSuggestion = null;
  if (state.bannerState.gpsSuggest) {
    state.bannerState.gpsSuggest = false;
    syncBannerBudget();
  }
}

function renderGpsSuggestBanner() {
  const sug = state.gpsSuggestion;
  if (!sug || !state.bannerState.gpsSuggest) return;
  const en = isEn();
  const label = resolveCityDisplayName(sug, getLang());
  setText('gpsSuggestTxt', en
    ? `Near ${label} — switch to live GPS?`
    : `偵測到目前在「${label}」附近，要切換到此處嗎？`);
  setText('gpsSuggestBtn', en ? 'Switch here' : '切換到此處');
}

function applyGpsPosition(lat, lon, accuracy, { closeSheet = true, autoFollow = false } = {}) {
  const myLocSeq = ++state.locationSeq;
  state.camUserPicked = false;
  state.urlHasExplicitPos = false;
  clearGpsSuggestion();
  document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
  const matched = matchKnownCity(lat, lon);
  const fallback = `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
  state.pos = {
    name: matched ? matched.zh : fallback,
    nameEn: matched ? matched.en : fallback,
    lat: +lat.toFixed(4), lon: +lon.toFixed(4),
    tz: matched ? matched.tz : 'auto',
    mode: 'gps', accuracy: Number.isFinite(accuracy) ? accuracy : null
  };
  renderLocationHeader();
  syncBrowserUrl();
  if (closeSheet) togglePicker(true);
  if (!autoFollow) haptic(10);
  const en = isEn();
  toast(autoFollow
    ? (en ? `Location updated: ${getPosDisplayName()}` : `已自動更新目前位置：${getPosDisplayName()}`)
    : (en ? `Located: ${getPosDisplayName()}` : `已定位：${getPosDisplayName()}`), 'success');
  refreshAll(true);

  if (!matched) {
    reverseGeocodeBilingual(lat, lon).then(({ zhName, enName }) => {
      if (myLocSeq !== state.locationSeq) return;
      if (zhName || enName) {
        state.pos.name = zhName || enName || fallback;
        state.pos.nameEn = enName || (hasCjkChars(zhName) ? fallback : zhName) || fallback;
        renderLocationHeader();
        syncBrowserUrl();
        savePos(state.pos);
      }
    });
  }
}

async function checkSilentGpsUpdate(force = false) {
  if (state.urlHasExplicitPos) return;
  if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return;
  const nowMs = Date.now();
  if (!force && state.lastGpsCheckMs && (nowMs - state.lastGpsCheckMs < SILENT_GPS_INTERVAL_MS)) return;
  state.lastGpsCheckMs = nowMs;
  let permState = 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    permState = status?.state || 'prompt';
  } catch { return; }
  if (permState !== 'granted') return;

  const snapLocSeq = state.locationSeq;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (snapLocSeq !== state.locationSeq) return;
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      const decision = evaluateSilentGpsDecision({
        currentPos: state.pos, gpsLat: lat, gpsLon: lon,
        hasUrlOverride: state.urlHasExplicitPos, permissionState: permState
      });
      if (decision.action === 'auto-switch') {
        applyGpsPosition(lat, lon, accuracy, { closeSheet: false, autoFollow: true });
      } else if (decision.action === 'refresh-coords') {
        state.pos.accuracy = Number.isFinite(accuracy) ? accuracy : state.pos.accuracy;
        savePos(state.pos);
      } else if (decision.action === 'suggest-nearby') {
        let dismissed = false;
        try { dismissed = sessionStorage.getItem('aurora_gps_suggest_dismissed') === '1'; } catch {}
        if (dismissed) return;
        const matched = matchKnownCity(lat, lon);
        const fallback = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
        state.gpsSuggestion = {
          lat: +lat.toFixed(4), lon: +lon.toFixed(4),
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          name: matched ? matched.zh : fallback,
          nameEn: matched ? matched.en : fallback,
          tz: matched ? matched.tz : 'auto'
        };
        state.bannerState.gpsSuggest = true;
        renderGpsSuggestBanner();
        syncBannerBudget();
        if (!matched) {
          reverseGeocodeBilingual(lat, lon).then(({ zhName, enName }) => {
            if (!state.gpsSuggestion || snapLocSeq !== state.locationSeq) return;
            if (zhName || enName) {
              state.gpsSuggestion.name = zhName || enName || fallback;
              state.gpsSuggestion.nameEn = enName || (hasCjkChars(zhName) ? fallback : zhName) || fallback;
              renderGpsSuggestBanner();
            }
          });
        }
      }
    },
    () => {},
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 180000 }
  );
}

function pickPreset(nameZh, nameEn, lat, lon, btn) {
  state.locationSeq++;
  state.camUserPicked = false;
  state.urlHasExplicitPos = false;
  clearGpsSuggestion();
  document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
  btn?.classList.add('on');
  const tz = btn?.dataset?.tz || matchKnownCity(lat, lon)?.tz || 'auto';
  state.pos = { name: nameZh, nameEn, lat, lon, tz, mode: 'manual', accuracy: null };
  renderLocationHeader();
  syncBrowserUrl();
  haptic(8);
  togglePicker(true);
  const slug = normalizeCitySlug(state.pos);
  trackEvent(`city/${slug}`, `City: ${slug}`);
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
      stopSpin();
      if (myLocSeq !== state.locationSeq) return;
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      applyGpsPosition(lat, lon, accuracy, { closeSheet: true, autoFollow: false });
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

function clearSearchResults() {
  state.searchCandidates = [];
  const box = $('searchResults');
  if (box) { box.innerHTML = ''; box.style.display = 'none'; }
}

function applyPickedCity(found) {
  if (!found) return;
  clearSearchResults();
  state.camUserPicked = false;
  state.urlHasExplicitPos = false;
  clearGpsSuggestion();
  document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
  state.pos = {
    name: found.name, nameEn: found.nameEn,
    lat: found.lat, lon: found.lon, tz: found.tz,
    mode: 'manual', accuracy: null
  };
  renderLocationHeader(); syncBrowserUrl();
  const input = $('cityInput');
  if (input) input.value = '';
  haptic(8);
  togglePicker(true);
  refreshAll(true);
}

function renderSearchResults(candidates) {
  const box = $('searchResults');
  if (!box) return;
  const en = isEn();
  state.searchCandidates = candidates;
  if (!candidates.length) {
    box.innerHTML = '';
    box.style.display = 'none';
    return;
  }
  box.innerHTML = candidates.map((c, idx) => {
    const title = en ? (c.nameEn || c.name) : c.name;
    const subParts = [];
    if (c.admin1 && !title.includes(c.admin1)) subParts.push(c.admin1);
    subParts.push(`${Math.abs(c.lat).toFixed(1)}°${c.lat >= 0 ? 'N' : 'S'}`);
    return `<button type="button" class="search-res-item" role="option" data-search-idx="${idx}"><span>${escapeHtml(title)}</span><span class="search-res-sub">${escapeHtml(subParts.join(' · '))}</span></button>`;
  }).join('');
  box.style.display = 'flex';
}

async function searchCity(e) {
  e.preventDefault();
  const input = $('cityInput');
  const btn = $('searchBtn');
  const rawQ = input?.value.trim() || '';
  if (!rawQ) return;
  const en = isEn();
  const myLocSeq = ++state.locationSeq;
  trackEvent('city-search', 'City Search');
  if (btn) { btn.disabled = true; btn.textContent = en ? 'Searching…' : '搜尋中…'; }
  try {
    const candidates = await geocodeCityCandidates(rawQ, 5);
    if (myLocSeq !== state.locationSeq) return;
    if (candidates.length === 1) {
      applyPickedCity(candidates[0]);
      return;
    }
    if (candidates.length > 1) {
      renderSearchResults(candidates);
      return;
    }
    clearSearchResults();
    toast(en ? 'City not found — try another spelling' : '找不到地名，可試英文拼法（如 Reykjavik）', 'warn');
  } catch {
    clearSearchResults();
    toast(en ? 'Search failed — check connection' : '搜尋連線失敗，請檢查網路', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = en ? 'Search' : '搜尋'; }
  }
}

async function shareStatus() {
  const en = isEn();
  trackEvent('share-link', 'Share Link');
  const shareUrl = buildShareUrl(location.href, state.pos, getLang());
  const sc = state.lastScore;
  const scStr = sc ? (en ? `${sc.total} (${tGrade(sc.grade, 'en').replace(/^[^\p{L}\p{N}]+\s*/u, '')})` : `${sc.total}（${tGrade(sc.grade, 'zh').replace(/^[^\p{L}\p{N}]+\s*/u, '')}）`) : (en ? 'Updating' : '更新中');
  const visHint = !sc || sc.isTooBright
    ? ''
    : (sc.total >= 65
        ? (en ? ' · Bright to naked eye' : ' · 肉眼清楚可見')
        : (sc.total >= 40
            ? (en ? ' · Visible to eye, brighter on camera' : ' · 肉眼可見、手機更亮')
            : (sc.total >= 18 ? (en ? ' · Faint, try phone night mode' : ' · 建議手機夜拍') : '')));
  const title = en ? `[${getPosDisplayName()}] Aurora ${scStr}${visHint}` : `【${getPosDisplayName()}】極光指數 ${scStr}${visHint}`;
  const skyVal = $('fSkyVal')?.textContent || '';
  const skySub = $('fSkySub')?.textContent || '';
  const skyLine = skyVal && skyVal !== '--'
    ? (en ? `${skyVal} clear${skySub ? ` · ${skySub}` : ''}` : `晴空率 ${skyVal}${skySub ? ` · ${skySub}` : ''}`)
    : skySub;
  const best = state.bestAurora;
  let bestIsNextNight = false;
  if (best && Number.isFinite(best.dtMs)) {
    const tz = state.pos.tz || 'UTC';
    const refMs = Date.now();
    bestIsNextNight = getZoneParts(new Date(best.dtMs - 12 * 3600000), tz).dateStr
      !== getZoneParts(new Date(refMs - 12 * 3600000), tz).dateStr;
  }
  const bestLine = (best && best.time && Number.isFinite(best.score) && best.score >= 18)
    ? (en
        ? `\n• ${bestIsNextNight ? 'Best in 24h' : 'Best tonight'}: ${best.time} (score ${best.score})`
        : `\n• ${bestIsNextNight ? '24 小時最佳' : '今晚最佳'}：${best.time}（指數 ${best.score}）`)
    : '';
  const body = en
    ? `${title}\n${$('vTitle')?.textContent || ''}\n• Sky: ${skyLine}\n• Aurora: ${$('fAurSub')?.textContent || ''}${bestLine}\nLive clouds & NOAA aurora radar:`
    : `${title}\n${$('vTitle')?.textContent || ''}\n• 天空：${skyLine}\n• 極光：${$('fAurSub')?.textContent || ''}${bestLine}\n點開看即時雲層與 NOAA 極光雷達：`;
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

async function shareForecastCard() {
  const en = isEn();
  trackEvent('share-card', 'Share PNG Card');
  const btns = [$('homeShareCardBtn'), $('shareCardBtn')].filter(Boolean);
  btns.forEach(b => { b.disabled = true; });
  try {
    const shareUrl = buildShareUrl(location.href, state.pos, getLang());
    const sc = state.lastScore || state.renderState?.sc || null;
    const best = state.bestAurora;
    let bestIsNextNight = false;
    if (best && Number.isFinite(best.dtMs)) {
      const tz = state.pos.tz || 'UTC';
      const refMs = Date.now();
      bestIsNextNight = getZoneParts(new Date(best.dtMs - 12 * 3600000), tz).dateStr
        !== getZoneParts(new Date(refMs - 12 * 3600000), tz).dateStr;
    }
    const localTimeStr = $('clk')?.textContent?.trim() || '';
    const payload = buildShareCardPayload({
      pos: state.pos,
      posName: getPosDisplayName(),
      sc,
      skyVal: $('fSkyVal')?.textContent || '--',
      skySub: $('fSkySub')?.textContent || '',
      aurVal: $('fAurVal')?.textContent || '--',
      aurSub: $('fAurSub')?.textContent || '',
      darkVal: $('fDarkVal')?.textContent || '--',
      darkSub: $('fDarkSub')?.textContent || '',
      heroCue: $('vTitle')?.textContent || '',
      bestAurora: best,
      bestIsNextNight,
      nights3: state.localizedNights3 || state.renderState?.nights3 || [],
      localTimeStr,
      lang: getLang()
    });
    haptic(8);
    const res = await exportShareCardPng(payload, shareUrl);
    if (res.ok && res.method === 'download') {
      toast(en ? 'Forecast card PNG downloaded' : '已下載極光預報圖卡（PNG）', 'success');
    } else if (res.ok && res.method === 'native-share') {
      toast(en ? 'Forecast card ready to share' : '已開啟圖卡分享選單', 'success');
    } else if (!res.ok) {
      toast(en ? 'Could not create card — try Share link instead' : '無法產生圖卡，請改用分享連結', 'warn');
    }
  } catch {
    toast(en ? 'Could not create card — try Share link instead' : '無法產生圖卡，請改用分享連結', 'warn');
  } finally {
    btns.forEach(b => { b.disabled = false; });
  }
}

function tripKey(city) {
  return `${Number(city.lat).toFixed(2)},${Number(city.lon).toFixed(2)}`;
}

function renderTripWatchlist() {
  const listEl = $('tripList');
  const pinBtn = $('tripPinBtn');
  const cmpBtn = $('tripCompareBtn');
  if (!listEl) return;
  const en = isEn();
  const pinnedNow = isCityInWatchlist(state.watchlist, state.pos);
  if (pinBtn) {
    pinBtn.classList.toggle('on', pinnedNow);
    pinBtn.textContent = pinnedNow
      ? (en ? '★ Pinned' : '★ 已釘選')
      : (en ? '☆ Pin current' : '☆ 釘選目前地點');
  }
  if (cmpBtn) {
    cmpBtn.style.display = state.watchlist.length >= 2 ? '' : 'none';
    cmpBtn.disabled = state.isComparingTrip;
    cmpBtn.textContent = state.isComparingTrip
      ? (en ? 'Comparing…' : '比較中…')
      : (en ? 'Compare tonight' : '比較今晚晴空');
  }
  if (!state.watchlist.length) {
    listEl.innerHTML = `<div class="trip-empty">${en ? 'Pin 2–5 cities from your trip to compare tonight’s clearest sky in one tap.' : '釘選 2–5 個行程城市，隨時一鍵比較今晚哪裡晴空率最高。'}</div>`;
    return;
  }

  const nowMs = Date.now();
  let bestKey = null;
  let bestClear = -1;
  let comparedCount = 0;
  for (const c of state.watchlist) {
    const info = state.tripCompareMap[tripKey(c)];
    if (info && Number.isFinite(info.clearPct) && (nowMs - info.ts < 30 * 60000)) {
      comparedCount++;
      if (info.clearPct > bestClear) { bestClear = info.clearPct; bestKey = tripKey(c); }
    }
  }

  listEl.innerHTML = state.watchlist.map((c, idx) => {
    const k = tripKey(c);
    const isActive = computeDistanceKm(c.lat, c.lon, state.pos.lat, state.pos.lon) < 15;
    const isBest = comparedCount >= 2 && k === bestKey && bestClear >= 40;
    const cmp = state.tripCompareMap[k];
    let statTxt = '';
    if (cmp && Number.isFinite(cmp.clearPct) && (nowMs - cmp.ts < 30 * 60000)) {
      const tempPart = Number.isFinite(cmp.temp) ? ` · ${fmtTemp(cmp.temp)}` : '';
      const timePart = cmp.bestTime ? ` ${cmp.bestTime}` : '';
      statTxt = isBest
        ? (en ? `★ Clearest ${cmp.clearPct}%${timePart}` : `★ 最晴 ${cmp.clearPct}%${timePart}`)
        : (en ? `${cmp.clearPct}% clear${tempPart}` : `晴空 ${cmp.clearPct}%${tempPart}`);
    } else {
      const swr = findMatchingOfflineCache(c);
      if (swr && Number.isFinite(swr.score?.skyScore)) {
        statTxt = en ? `Cached ${swr.score.skyScore}%` : `快取晴空 ${swr.score.skyScore}%`;
      } else {
        statTxt = en ? 'Tap to view' : '點此查看';
      }
    }
    const label = resolveCityDisplayName(c, getLang());
    return `<div class="trip-row">
      <button type="button" class="trip-item${isActive ? ' active' : ''}${isBest ? ' best' : ''}" data-trip-idx="${idx}">
        <span class="trip-name">${escapeHtml(label)}</span>
        <span class="trip-stat">${escapeHtml(statTxt)}</span>
      </button>
      <button type="button" class="trip-del" data-trip-del="${idx}" aria-label="${en ? 'Remove' : '移除'} ${escapeHtml(label)}">✕</button>
    </div>`;
  }).join('');
}

function togglePinCurrentCity() {
  const en = isEn();
  const res = toggleWatchlistCity(state.watchlist, state.pos);
  state.watchlist = res.list;
  haptic(8);
  if (res.full) {
    toast(en ? 'Trip watchlist is full (max 5 cities)' : '行程清單已達上限（最多 5 個城市）', 'warn');
  } else if (res.pinned) {
    trackEvent('trip-pin', 'Trip Pin City');
    toast(en ? `Pinned to My Trip: ${getPosDisplayName()}` : `已加入我的行程：${getPosDisplayName()}`, 'success');
  } else {
    toast(en ? `Removed from My Trip: ${getPosDisplayName()}` : `已移出我的行程：${getPosDisplayName()}`, 'info');
  }
  renderTripWatchlist();
}

async function compareTripCities() {
  const en = isEn();
  if (state.isComparingTrip || state.watchlist.length < 2) return;
  trackEvent('trip-compare', 'Trip Compare Tonight');
  state.isComparingTrip = true;
  renderTripWatchlist();
  const nowSec = Math.floor(Date.now() / 1000);
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), 7500) : null;
  try {
    // Single batched Open-Meteo multi-coordinate call (1 HTTP request instead of up to 5)
    const lats = state.watchlist.map(c => c.lat.toFixed(4)).join(',');
    const lons = state.watchlist.map(c => c.lon.toFixed(4)).join(',');
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m&forecast_days=2&timeformat=unixtime&timezone=auto`;
    const res = await fetch(url, { signal: ctrl?.signal });
    if (res.ok) {
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : [raw];
      state.watchlist.forEach((c, idx) => {
        const data = list[idx];
        const h = data?.hourly;
        if (!h?.time?.length) return;
        let bestClear = -1;
        let bestTime = '';
        let bestTemp = null;
        let fallbackClear = null;
        let fallbackTemp = null;
        const tz = data.timezone || c.tz || 'UTC';
        for (let i = 0; i < h.time.length; i++) {
          const ts = h.time[i];
          if (ts < nowSec - 1800 || ts > nowSec + 18 * 3600) continue;
          const low = h.cloud_cover_low?.[i];
          const mid = h.cloud_cover_mid?.[i];
          const high = h.cloud_cover_high?.[i];
          const tot = h.cloud_cover?.[i];
          const block = (Number.isFinite(low) && Number.isFinite(mid) && Number.isFinite(high))
            ? computeEffectiveCloud(low, mid, high, 0, Number.isFinite(tot) ? tot : null)
            : (Number.isFinite(tot) ? Math.round(tot) : 50);
          const clear = Math.max(0, Math.min(100, 100 - block));
          const temp = Number.isFinite(h.temperature_2m?.[i]) ? Math.round(h.temperature_2m[i]) : null;
          if (fallbackClear === null) { fallbackClear = clear; fallbackTemp = temp; }
          const sunAlt = computeSolarElevation(new Date(ts * 1000), c.lat, c.lon);
          if (sunAlt <= -6 && clear > bestClear) {
            bestClear = clear;
            bestTemp = temp;
            const zp = getZoneParts(new Date(ts * 1000), tz);
            bestTime = `${zp.hourStr}:00`;
          }
        }
        const finalClear = bestClear >= 0 ? bestClear : (fallbackClear ?? 0);
        const finalTemp = bestClear >= 0 ? bestTemp : fallbackTemp;
        state.tripCompareMap[tripKey(c)] = { clearPct: finalClear, bestTime, temp: finalTemp, ts: Date.now() };
      });
    }
    let winner = null;
    let maxClr = -1;
    for (const c of state.watchlist) {
      const info = state.tripCompareMap[tripKey(c)];
      if (info && info.clearPct > maxClr) { maxClr = info.clearPct; winner = c; }
    }
    if (winner && maxClr >= 0) {
      const wName = resolveCityDisplayName(winner, getLang());
      toast(en ? `Clearest tonight: ${wName} (${maxClr}%)` : `今晚最晴：${wName}（晴空 ${maxClr}%）`, 'success');
    } else {
      toast(en ? 'Could not fetch comparison — check network' : '暫時無法比較，請檢查網路連線', 'warn');
    }
  } catch {
    toast(en ? 'Could not fetch comparison — check network' : '暫時無法比較，請檢查網路連線', 'warn');
  } finally {
    if (timer) clearTimeout(timer);
    state.isComparingTrip = false;
    renderTripWatchlist();
  }
}

// ====== Trust, Telemetry & Sources Bottom-Sheet ======
function renderTrustSheetLive(expOpt = null, scOpt = null, rawTelemetry = null, metarNote = null, stOpt = null) {
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
    ? `Why is the score <strong id="tsLiveTotal" style="color:${colOut}">${sc.total}/99</strong> now?`
    : `為何現在指數是 <strong id="tsLiveTotal" style="color:${colOut}">${sc.total}/99</strong>？`);
  const setCell = (id, html, col) => { const el = $(id); if (el) { el.innerHTML = html; el.style.color = col; } };
  const skyEffPct = Number.isFinite(exp.breakdown?.skyFactor)
    ? Math.round(exp.breakdown.skyFactor * 100)
    : sc.skyScore;
  const darkEffPct = sc.isTooBright
    ? 0
    : (Number.isFinite(exp.breakdown?.darkFactor) ? Math.round(exp.breakdown.darkFactor * 100) : sc.darkScore);
  setText('tsLblSky', skyEffPct !== sc.skyScore
    ? (en ? 'Sky factor' : '晴空係數')
    : term(TERMS.clearSky, en));
  setCell('tsValSky', `${skyEffPct}<span class="ts-unit">%</span>`, barColor(sc.skyScore));
  setCell('tsValAur', `${sc.auroraScore}<span class="ts-unit">/100</span>`, barColor(sc.auroraScore));
  setCell('tsValDark', `${darkEffPct}<span class="ts-unit">%</span>`, sc.isTooBright ? 'var(--blue)' : barColor(sc.darkScore));
  setCell('tsValOut', `${sc.total}<span class="ts-unit">/99</span>`, colOut);

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
  const stLive = stOpt || state.renderState;
  const ln = $('tsLightNote');
  if (ln) {
    const posLive = stLive?.pos || state.pos;
    const geomLive = computeViewingGeometry({
      lat: posLive.lat, lon: posLive.lon,
      kp: Math.max(stLive?.kp ?? 0, sc.effKp ?? 0), mlt: stLive?.mltNow ?? null, lang: getLang()
    });
    const glareLive = estimateUrbanSkyglow({
      lat: posLive.lat, lon: posLive.lon, geom: geomLive,
      auroraScore: sc.auroraScore, effMoonPct: stLive?.moon?.effMoonPct ?? 0, lang: getLang()
    });
    const lightNote = formatLightPollutionNote({ urbanGlare: glareLive, pos: posLive, sc, en });
    ln.style.display = 'block';
    ln.className = `ts-light-note${lightNote.isUrban ? ' is-urban' : ''}`;
    ln.textContent = lightNote.text;
  }
  setText('tsConfBadge', exp.confidence.badgeText);
  setText('tsConfRow', `${exp.confidence.badgeText}${effTelemetry ? ` · ${effTelemetry}` : ''}`);
  const sn = $('tsStormNote');
  if (sn) {
    const stormInfo = formatStormAlertDetail({
      scales: stLive?.noaaScales,
      noaaAlert: stLive?.noaaAlert,
      sc,
      lat: stLive?.pos?.lat ?? state.pos.lat,
      lon: stLive?.pos?.lon ?? state.pos.lon,
      en,
      fmtDateFn: fmtMonthDay
    });
    if (stormInfo) {
      sn.style.display = 'block';
      sn.innerHTML =
        `<div class="ts-storm-note-hd">⚡ ${escapeHtml(stormInfo.title)}</div>` +
        `<div>${escapeHtml(stormInfo.body)}</div>` +
        `<a class="ts-storm-note-link" href="${escapeHtml(stormInfo.linkUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(stormInfo.linkLabel)}</a>`;
    } else {
      sn.style.display = 'none';
      sn.innerHTML = '';
    }
  }
  const cd = $('tsConfDetail');
  if (cd) {
    let detailTxt = '';
    if (exp.confidence.level !== 'high') {
      const pr = exp.confidence.primaryReason;
      const cc = stLive?.cloudConsensus;
      const isMet = Boolean(stLive?.usedMet);
      const hasCam = Boolean(getActiveSkyCamRegion(state.pos.lat, state.pos.lon));
      if ((pr === 'model-diverge' || pr === 'obs-calibrated' || pr === 'cloud-spread') && cc && Number.isFinite(cc.metAvg3h) && Number.isFinite(cc.omAvg3h)) {
        const c1 = Math.max(0, Math.min(100, Math.round(100 - cc.metAvg3h)));
        const c2 = Math.max(0, Math.min(100, Math.round(100 - cc.omAvg3h)));
        detailTxt = pr === 'obs-calibrated'
          ? (en
              ? `Models differed (${isMet ? 'MET Norway' : 'Primary'} ${c1}% vs ${isMet ? 'ECMWF' : 'Secondary'} ${c2}% clear) — short-term clouds adjusted using local live observations.`
              : `兩組預報晴空率有分歧（${isMet ? '挪威官方' : '主模型'} ${c1}%、${isMet ? 'ECMWF 全球模型' : '對照模型'} ${c2}%），已優先參照當地即時實測修正。`)
          : (en
              ? `Clear-sky models disagree (${isMet ? 'MET Norway' : 'Primary'} ${c1}% vs ${isMet ? 'ECMWF' : 'Secondary'} ${c2}%) — check ${hasCam ? 'Sky & maps live cams' : 'Sky & maps cloud forecast'} or the sky.`
              : `兩組晴空預報分歧（${isMet ? '挪威官方' : '主模型'} ${c1}%、${isMet ? 'ECMWF 全球模型' : '對照模型'} ${c2}%），建議查看「觀測地圖」${hasCam ? '即時天空實拍' : '動態雲量預報'}或抬頭確認。`);
      } else if (pr === 'cloud-spread') {
        detailTxt = en
          ? `Cloud cover is uncertain over the next few hours — check ${hasCam ? 'Sky & maps live cams' : 'Sky & maps'} or the sky.`
          : `未來幾小時雲量變動區間較大，建議搭配「觀測地圖」${hasCam ? '即時天空實拍' : '動態雲量預報'}或抬頭確認。`;
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
          ? (hasCam ? 'Single weather model only — double-check the sky or Sky & maps live cams.' : 'Single weather model only — double-check Sky & maps or the sky.')
          : (hasCam ? '目前僅有單一氣象模型，出發前建議抬頭或看「觀測地圖」即時實拍確認。' : '目前僅有單一氣象模型，出發前建議抬頭或看「觀測地圖」確認。');
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
  const proWrap = $('tsProDetails');
  const proBody = $('tsProBody');
  if (proWrap && proBody) {
    const h0 = stLive?.hereHrs?.[0];
    const hasLayers = h0 && [h0.cloudLow, h0.cloudMid, h0.cloudHigh].some(v => Number.isFinite(v));
    const fmiMag = stLive?.fmiMag;
    const magSvg = fmiMag?.series?.length >= 4 ? buildFmiMagChartSVG(fmiMag, tzLive, getLang()) : '';
    if (hasLayers || magSvg) {
      const blocks = [];
      if (hasLayers) {
        const lo = Number.isFinite(h0.cloudLow) ? Math.round(h0.cloudLow) : null;
        const mi = Number.isFinite(h0.cloudMid) ? Math.round(h0.cloudMid) : null;
        const hi = Number.isFinite(h0.cloudHigh) ? Math.round(h0.cloudHigh) : null;
        const fog = Number.isFinite(h0.cloudFog) ? Math.round(h0.cloudFog) : 0;
        const layerCol = (pct, isHigh) => {
          if (pct === null) return 'var(--muted)';
          if (isHigh) return pct >= 70 ? 'var(--amber)' : 'var(--text)';
          return pct >= 55 ? 'var(--red)' : (pct >= 25 ? 'var(--amber)' : 'var(--green)');
        };
        const fogTag = fog >= 20 ? (en ? ` · Fog ${fog}%` : ` · 地面霧 ${fog}%`) : '';
        const noteTxt = (lo !== null && lo < 25 && hi !== null && hi >= 45)
          ? (en ? `Mostly thin high cirrus — bright aurora can still shine through.${fogTag}` : `以薄高雲為主，極光強時仍可穿透拍攝。${fogTag}`)
          : (en ? `Low clouds block aurora most; thin high clouds remain semi-transparent.${fogTag}` : `低層厚雲最遮擋極光；薄高雲仍可穿透拍攝。${fogTag}`);
        blocks.push(
          `<div class="ts-pro-layers">` +
            `<div class="ts-pro-cell"><span>${en ? 'Low (thick)' : '低層厚雲'}</span><strong style="color:${layerCol(lo, false)}">${lo !== null ? `${lo}%` : '--'}</strong></div>` +
            `<div class="ts-pro-cell"><span>${en ? 'Mid layer' : '中層雲'}</span><strong style="color:${layerCol(mi, false)}">${mi !== null ? `${mi}%` : '--'}</strong></div>` +
            `<div class="ts-pro-cell"><span>${en ? 'High (thin)' : '薄高雲'}</span><strong style="color:${layerCol(hi, true)}">${hi !== null ? `${hi}%` : '--'}</strong></div>` +
          `</div>` +
          `<div class="ts-pro-note">${escapeHtml(noteTxt)}</div>`
        );
      }
      if (magSvg) {
        const stName = escapeHtml(fmiMag.stationName || fmiMag.code || 'FMI');
        const distTxt = Number.isFinite(fmiMag.distKm) ? `${Math.round(fmiMag.distKm)} km` : '';
        const compLbl = fmiMag.source === 'USGS' ? 'ΔH' : 'ΔBx';
        const dropVal = Number.isFinite(fmiMag.bayDropNt) && fmiMag.bayDropNt >= 15
          ? `${compLbl} -${Math.round(fmiMag.bayDropNt)} nT`
          : `±${Math.round(fmiMag.amp60Nt || 0)} nT/h`;
        const srcTag = fmiMag.source || 'FMI';
        blocks.push(
          `<div class="ts-pro-mag-hd"><span>${en ? `${srcTag} Magnetometer · ${stName}${distTxt ? ` (${distTxt})` : ''}` : `當地地磁實測（${srcTag}）· ${stName}${distTxt ? `（${distTxt}）` : ''}`}</span><strong>${escapeHtml(dropVal)}</strong></div>` +
          `<svg class="ts-pro-mag-svg" viewBox="0 0 380 96" role="img" aria-label="${en ? `3-hour ${srcTag} ground magnetometer chart` : `近 3 小時 ${srcTag} 地面磁力儀波形圖`}">${magSvg}</svg>` +
          `<div class="ts-pro-note">${en ? 'Sharp negative dip below the amber guide signals an overhead auroral substorm.' : '曲線向下跌破琥珀線代表頭頂極光電射流增強（亞暴爆發）。'}</div>`
        );
      }
      proBody.innerHTML = blocks.join('');
      proWrap.style.display = '';
    } else {
      proBody.innerHTML = '';
      proWrap.style.display = 'none';
    }
  }
  const noaaStampRaw = stLive?.noaaAlert?.issueTime || stLive?.noaaScales?.updatedUtc || null;
  const noaaStampHM = noaaStampRaw ? utcTagToLocalHM(noaaStampRaw, tzLive) : '';
  setText('tsNoaaSyncNote', noaaStampHM
    ? (en
        ? `Live 3h NOAA feed (updated ${noaaStampHM} local) — verify G1–G5 watches in "NOAA Storm Alerts" and tonight's oval in "NOAA Aurora Map".`
        : `直連 NOAA 每 3 小時滾動更新（最新 ${noaaStampHM} 當地時間）— 核對警報請看「NOAA 風暴警報」，今晚極光範圍請看「NOAA 極光總覽」。`)
    : (en
        ? 'Live 3h NOAA feed — verify G1–G5 watches in "NOAA Storm Alerts" and tonight\'s oval in "NOAA Aurora Map".'
        : '直連 NOAA 每 3 小時滾動更新 — 核對警報請看「NOAA 風暴警報」，今晚極光範圍請看「NOAA 極光總覽」。'));
  renderVerificationCard();
}

let verifCache = null;
let verifFetched = false;

function renderVerificationCard() {
  const el = $('tsVerifCard');
  if (!el) return;
  const v = verifCache;
  if (!v || !v.generatedAt) { el.style.display = 'none'; return; }
  const genMs = Date.parse(v.generatedAt);
  // Strict 7-day staleness guard: never pretend stale verification data is live
  if (!Number.isFinite(genMs) || (Date.now() - genMs) > 7 * 86400000) {
    el.style.display = 'none';
    return;
  }
  const en = isEn();
  const dateStr = new Date(genMs).toISOString().slice(0, 10);
  const ca = v.cloudAudit || {};
  const ga = v.geomagAudit || {};
  const lines = [];
  if (Number.isFinite(ca.layeredMaePct) && (ca.samples || 0) >= 3) {
    const modeLbl = ca.mode === 'prospective-lead'
      ? (en ? `Prospective +3/+6/+12h (${ca.samples} samples)` : `前瞻 +3/+6/+12h（${ca.samples} 筆）`)
      : (en ? `9-station raw NWP (${ca.samples} samples)` : `9 座氣象觀測站原始預報（${ca.samples} 筆）`);
    const basePart = Number.isFinite(ca.rawTotalMaePct)
      ? (en ? ` vs raw total ${ca.rawTotalMaePct}%` : `，對照總雲量 ${ca.rawTotalMaePct}%`)
      : '';
    const fcPart = Number.isFinite(ca.falseClearRatePct)
      ? (en ? ` · False-clear ${ca.falseClearRatePct}%` : ` · 假晴空率 ${ca.falseClearRatePct}%`)
      : '';
    lines.push(en
      ? `Cloud MAE: ${ca.layeredMaePct}%${basePart} (${modeLbl}${fcPart})`
      : `雲量平均誤差：${ca.layeredMaePct}%${basePart}（${modeLbl}${fcPart}）`);
  }
  if ((ga.gfzHp30Bins30d || 0) >= 200) {
    const aucTxt = (!ga.smallSampleGuard && Number.isFinite(ga.l1RocAuc))
      ? (en ? ` · L1 ROC-AUC ${ga.l1RocAuc}` : ` · 純 L1 ROC-AUC ${ga.l1RocAuc}`)
      : (en ? ' · L1 active sample accumulating' : ' · L1 活躍樣本累積中');
    lines.push(en
      ? `30d GFZ Hp30: ${ga.gfzHp30Bins30d} bins (${ga.activeEvents30d || 0} active, ${ga.stormEvents30d || 0} storm${aucTxt})`
      : `近 30 天 GFZ Hp30：${ga.gfzHp30Bins30d} 筆（活躍 ${ga.activeEvents30d || 0}、風暴 ${ga.stormEvents30d || 0}${aucTxt}）`);
  }
  if (!lines.length) { el.style.display = 'none'; return; }
  const disc = en ? (v.disclaimerEn || '') : (v.disclaimerZh || '');
  el.innerHTML =
    `<div class="ts-verif-hd"><span>${en ? 'Rolling 30d Instrument Verification' : '近 30 天獨立儀器自動驗證'}</span><span class="ts-verif-date">${escapeHtml(dateStr)}</span></div>` +
    lines.map(l => `<div>${escapeHtml(l)}</div>`).join('') +
    (disc ? `<div class="ts-verif-disc">${escapeHtml(disc)}</div>` : '');
  el.style.display = 'block';
}

function loadVerificationScorecard() {
  if (verifFetched) { renderVerificationCard(); return; }
  verifFetched = true;
  if (typeof fetch !== 'function') return;
  fetch('./verification/latest.json', { cache: 'no-cache' })
    .then(r => (r && r.ok ? r.json() : null))
    .then(j => {
      if (j && j.generatedAt) {
        verifCache = j;
        renderVerificationCard();
      }
    })
    .catch(() => {});
}

function openTrustSheet(triggerEl) {
  togglePicker('switch');
  state.trustTriggerEl = triggerEl || document.activeElement;
  if (state.explainState && state.renderState?.sc) {
    renderTrustSheetLive();
  } else if (state.renderState) {
    renderFromState(state.renderState);
  }
  loadVerificationScorecard();
  const sheet = $('trustSheet');
  if (!sheet) return;
  const body = sheet.querySelector('.sheet-body');
  if (body) body.scrollTop = 0;
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
  $('homeShareLinkBtn')?.addEventListener('click', shareStatus);
  $('shareCardBtn')?.addEventListener('click', shareForecastCard);
  $('homeShareCardBtn')?.addEventListener('click', shareForecastCard);
  $('tripPinBtn')?.addEventListener('click', togglePinCurrentCity);
  $('tripCompareBtn')?.addEventListener('click', compareTripCities);
  $('tripList')?.addEventListener('click', (e) => {
    const del = e.target.closest?.('[data-trip-del]');
    if (del) {
      const idx = parseInt(del.dataset.tripDel, 10);
      if (Number.isInteger(idx) && state.watchlist[idx]) {
        state.watchlist.splice(idx, 1);
        saveWatchlist(state.watchlist);
        haptic(6);
        renderTripWatchlist();
      }
      return;
    }
    const item = e.target.closest?.('[data-trip-idx]');
    if (item) {
      const idx = parseInt(item.dataset.tripIdx, 10);
      const city = Number.isInteger(idx) ? state.watchlist[idx] : null;
      if (city) pickPreset(city.name, city.nameEn || city.name, city.lat, city.lon, null);
    }
  });
  $('cityForm')?.addEventListener('submit', searchCity);
  $('cityInput')?.addEventListener('input', (e) => { if (!e.target?.value?.trim()) clearSearchResults(); });
  $('searchResults')?.addEventListener('click', (e) => {
    const item = e.target.closest?.('[data-search-idx]');
    if (!item) return;
    const idx = parseInt(item.dataset.searchIdx, 10);
    if (Number.isInteger(idx) && state.searchCandidates[idx]) {
      applyPickedCity(state.searchCandidates[idx]);
    }
  });
  $('windyLayerChips')?.addEventListener('click', (e) => {
    const btn = e.target.closest?.('button[data-overlay]');
    if (btn) selectWindyOverlay(btn.dataset.overlay, btn);
  });
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
  $('gpsSuggestBtn')?.addEventListener('click', () => {
    const sug = state.gpsSuggestion;
    if (!sug) return;
    applyGpsPosition(sug.lat, sug.lon, sug.accuracy, { closeSheet: false, autoFollow: false });
  });
  $('gpsSuggestClose')?.addEventListener('click', () => {
    clearGpsSuggestion();
    try { sessionStorage.setItem('aurora_gps_suggest_dismissed', '1'); } catch {}
  });
  $('offlineRetryBtn')?.addEventListener('click', () => { haptic(8); refreshAll(true, { forceNoaa: true }); });

  $('camBrightBtn')?.addEventListener('click', () => {
    state.camFullBright = !state.camFullBright;
    syncSkyCamGlareUI(true);
    haptic(6);
  });

  // Scroll-reactive frosted glass sticky header + off-screen Hero battery guard
  let wasScrolled = null;
  let wasPastHero = false;
  const syncScrollHdr = () => {
    const y = window.scrollY || 0;
    const scrolled = y > 4;
    if (scrolled !== wasScrolled) {
      wasScrolled = scrolled;
      document.body.classList.toggle('is-scrolled', scrolled);
    }
    const pastHero = y > 260;
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

  const skyCamImg = $('skyCamImg');
  skyCamImg?.addEventListener('load', () => { skyCamImg.style.display = ''; });
  skyCamImg?.addEventListener('error', () => {
    skyCamImg.style.display = 'none';
    const brightBtn = $('camBrightBtn');
    if (brightBtn) brightBtn.style.display = 'none';
    const cam = SKY_CAMS[state.camKey];
    const en = isEn();
    const linkHtml = cam?.page
      ? ` <a class="src-link" href="${escapeHtml(cam.page)}" target="_blank" rel="noopener noreferrer">${en ? 'Official site ↗' : '開啟官方頁面 ↗'}</a>`
      : '';
    setHtml('skyCamCap', (en
      ? 'Live camera feed temporarily offline — try another observatory above.'
      : '實拍影像暫時無法連線，可切換上方其他鏡頭。') + linkHtml);
  });
  const ovImg = $('ovationImg');
  ovImg?.addEventListener('load', () => { ovImg.style.display = ''; });
  ovImg?.addEventListener('error', () => {
    ovImg.style.display = 'none';
    const en = isEn();
    setHtml('ovCap', (en
      ? 'NOAA OVATION forecast map temporarily unavailable — pull down to refresh.'
      : 'NOAA 極光範圍預報圖暫時無法載入，請稍後下拉更新重試。')
      + ` <a class="src-link" href="https://www.swpc.noaa.gov/products/aurora-30-minute-forecast" target="_blank" rel="noopener noreferrer">${en ? 'NOAA OVATION ↗' : '查看 NOAA 原圖 ↗'}</a>`);
  });
}

function registerServiceWorker() {
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      const hadController = Boolean(navigator.serviceWorker.controller);
      let swReloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || swReloading) return;
        swReloading = true;
        location.reload();
      });
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
trackPageview();
refreshAll(false);
checkSilentGpsUpdate(false);

setInterval(updateClockAndPhoto, 30000);
setInterval(() => { if (!document.hidden || state.alertEnabled) refreshAll(false); }, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  syncAnimBatteryGuard();
  if (!document.hidden) {
    updateClockAndPhoto();
    if (state.alertEnabled) acquireWakeLock();
    if (Date.now() - state.lastSyncMs > 3 * 60 * 1000) refreshAll(false);
    checkSilentGpsUpdate(false);
  }
});
window.addEventListener('online', () => { if (!document.hidden) refreshAll(false); });
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    updateClockAndPhoto();
    if (Date.now() - state.lastSyncMs > 3 * 60 * 1000) refreshAll(false);
    checkSilentGpsUpdate(false);
  }
});
