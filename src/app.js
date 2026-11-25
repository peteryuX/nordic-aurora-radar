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
  buildSkySceneSVG, buildBzChartSVG, buildSkyWaveSVG, buildCompassRadarSVG
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

/** Pause background aurora GPU animation when hidden, bright, or low-score to save cold-weather battery */
function syncAnimBatteryGuard() {
  const sc = state.lastScore;
  const shouldPause = Boolean(document.hidden || !sc || sc.isTooBright || sc.total < 18);
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
  setText('swToggleTxt', state.swExpanded
    ? (en ? 'Hide solar wind timeline' : '收起太陽風到達地球曲線')
    : (en ? 'Show solar wind timeline' : '展開太陽風到達地球曲線'));
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
  if (meta) meta.setAttribute('content', state.redModeEnabled ? '#040000' : '#040912');
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
      ? (en ? 'My location' : '目前位置')
      : (isGpsErr ? (en ? '⚠ Location failed' : '⚠ 定位失敗') : (tzResolved ? (en ? 'Local' : '當地') : 'UTC'));
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

function renderGauge(sc, details) {
  state.lastScore = sc;
  syncAnimBatteryGuard();
  const en = isEn();
  const circ = 2 * Math.PI * 52;
  const visPct = sc.total <= 0 ? 0 : sc.total;
  const ringCol = sc.isTooBright ? 'var(--blue)' : (sc.outOfZone ? 'var(--muted)' : tierColor(sc.total));
  const prog = $('ringProg');
  if (prog) {
    prog.style.strokeDasharray = circ.toFixed(1);
    prog.style.strokeDashoffset = (circ * (1 - visPct / 100)).toFixed(1);
    prog.style.stroke = ringCol;
    prog.style.filter = visPct > 0 ? `drop-shadow(0 0 8px color-mix(in srgb, ${ringCol} 50%, transparent))` : 'none';
  }
  const numEl = $('ringNum');
  if (numEl) { animateScoreNumber(sc.total, numEl); numEl.style.color = 'var(--text)'; }
  const grEl = $('ringGrade');
  if (grEl) { grEl.textContent = tGrade(sc.grade).replace(/^[^\p{L}\p{N}]+\s*/u, ''); grEl.style.color = ringCol; }

  const setFactor = (vid, bid, sid, pct, lbl, subHtml, forceC) => {
    const c = forceC || barColor(pct);
    const ve = $(vid); if (ve) { ve.textContent = lbl; ve.style.color = c; }
    const be = $(bid); if (be) { be.style.width = `${Math.max(6, pct)}%`; be.style.background = c; }
    setHtml(sid, subHtml);
  };
  setFactor('fSkyVal', 'fSkyBar', 'fSkySub', sc.skyScore, `${sc.skyScore}%`, details.skySubHtml ?? escapeHtml(details.skySub || ''));
  setFactor('fAurVal', 'fAurBar', 'fAurSub', sc.auroraScore, `${sc.auroraScore}`, details.aurSubHtml ?? escapeHtml(details.aurSub || ''));
  setFactor('fDarkVal', 'fDarkBar', 'fDarkSub', sc.darkScore, details.isTooBright ? term(TERMS.status.tooBright, en) : `${sc.darkScore}%`, details.darkSubHtml ?? escapeHtml(details.darkSub || ''), details.isTooBright ? 'var(--blue)' : null);
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
  const bestText = isOutOfZone
    ? (outZoneKind === 'need-storm'
        ? (en
            ? `Needs a stronger storm · score <strong>0</strong> next ${hz}h`
            : `活動偏弱，需更強地磁暴 · 未來 ${hz}h 指數 <strong>0</strong>`)
        : (en
            ? `Outside auroral zone · tap location above to switch`
            : `不在極光帶 · 點上方地名切換極光熱點`))
    : (bestInVis
        ? (bestInVis.score >= 35
            ? (en
                ? `${bestIsNextNight ? 'Peak' : 'Peak tonight'} <strong>${bestTimeLbl}</strong> · Score <strong>${bestInVis.score}</strong> · ${bestInVis.clear}% clear`
                : `${bestIsNextNight ? '最看好' : '今晚最看好'} <strong>${bestTimeLbl}</strong> · 指數 <strong>${bestInVis.score}</strong> · 晴空 ${bestInVis.clear}%`)
            : (bestInVis.block <= 40
                ? (en ? `Clearest at <strong>${bestTimeLbl}</strong> · <strong>${bestInVis.clear}%</strong> clear · Score ${bestInVis.score}` : `最晴時段 <strong>${bestTimeLbl}</strong> · 晴空 <strong>${bestInVis.clear}%</strong> · 指數 ${bestInVis.score}`)
                : (bestInVis.clear >= 25 || bestInVis.score >= 18
                    ? (en ? `Clouds thin at <strong>${bestTimeLbl}</strong> · <strong>${bestInVis.clear}%</strong> clear` : `<strong>${bestTimeLbl}</strong> 雲層稍散 · 晴空 <strong>${bestInVis.clear}%</strong>`)
                    : (en ? `Cloudy next ${hz}h (max <strong>${bestInVis.clear}%</strong>) · try Find clear skies` : `未來 ${hz}h 偏多雲（最高 <strong>${bestInVis.clear}%</strong>）· 可看找晴空`))))
        : (en ? `Too bright for the next ${hz}h · check back after dark` : `未來 ${hz}h 天色偏亮 · 天黑後再查看`));
  const hb = $('homeBest');
  if (hb) {
    const isGood = !isOutOfZone && bestInVis && (bestInVis.score >= 35 || bestInVis.block <= 40);
    const dotCol = isOutOfZone ? 'var(--muted)' : (isGood ? (bestInVis.score >= 65 ? 'var(--green)' : 'var(--good)') : 'var(--amber)');
    hb.className = 'wave-peak';
    hb.innerHTML = `<span class="wp-dot" style="background:${dotCol};" aria-hidden="true"></span><span class="wp-txt">${bestText}</span>`;
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
  setHtml('skyWaveChart', buildSkyWaveSVG(vis, bestInVis, idx));
  const hasTemp = Number.isFinite(Number(h.temp));
  const tInt = hasTemp ? (Math.round(Number(h.temp)) || 0) : null;
  const wcInt = hasTemp ? (Math.round(Number(h.windChill ?? h.temp)) || 0) : null;
  const wcTxt = (hasTemp && tInt - wcInt >= 3) ? (en ? ` (Feels ${fmtTemp(wcInt)})` : `（體感 ${fmtTemp(wcInt)}）`) : '';
  const moonTxt = h.isDay
    ? (en ? 'Too bright' : '天色過亮')
    : (h.moonUp ? (en ? `Moon ${h.moonPct}%` : `月光 ${h.moonPct}%`) : (en ? 'Moon down' : '月亮已落下'));
  const kpVal = Number.isFinite(h.kpFc) ? h.kpFc : null;
  const kpBadge = kpVal === null
    ? `Kp ${escapeHtml(h.kpFc)}`
    : (idx >= 3
        ? (en ? `~Kp ${Math.round(kpVal)}` : `預估 Kp ${Math.round(kpVal)}`)
        : `Kp ${kpVal.toFixed(1)}`);
  const tStr = formatHourLabel(h, en);
  const rawSkyZh = String(h.txt || '').replace(/^[^\p{L}\p{N}]+\s*/u, '');
  const skyZh = rawSkyZh === '縫' ? '多雲' : (rawSkyZh === '晴' ? '晴朗' : (rawSkyZh === '陰' ? '陰天' : rawSkyZh));
  const skyLabel = escapeHtml(en ? tSky(h.txt, 'en') : skyZh);
  const scCol = h.isDay ? 'var(--blue)' : tierColor(h.score);
  const scTier = scoreTierWord(h.score, h.isDay, en);
  const skyParenEn = h.isDay ? '' : ` (${skyLabel})`;
  const skyParenZh = h.isDay ? '' : `（${skyLabel}）`;
  const midMeta = h.isDay ? '' : ` · ${moonTxt}`;
  setHtml('hourDetail', en
    ? `<span><strong>${tStr}</strong> · Score <strong style="color:${scCol}">${h.score}</strong> (${scTier}) · ${h.clear}% clear${skyParenEn}</span><span>${fmtTemp(tInt)}${wcTxt}${midMeta} · ${kpBadge}</span>`
    : `<span><strong>${tStr}</strong> · 指數 <strong style="color:${scCol}">${h.score}</strong>（${scTier}）· 晴空率 ${h.clear}%${skyParenZh}</span><span>${fmtTemp(tInt)}${wcTxt}${midMeta} · ${kpBadge}</span>`);
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
    const winHtml = winTxt ? `<div class="od-win nowrap">${escapeHtml(winTxt)}</div>` : '';
    const aria = hasScore
      ? (en ? `${dayTxt} ${dateTxt}: forecast score ${scoreVal}, ${n.badge}${winTxt ? `, ${winTxt}` : ''}` : `${dayTxt} ${dateTxt}：預估觀測指數 ${scoreVal}，${n.badge}${winTxt ? `，${winTxt}` : ''}`)
      : `${dayTxt} ${dateTxt}: ${n.badge}`;
    return `<div class="outlook-day${isBest ? ' od-best' : ''}" role="group" aria-label="${escapeHtml(aria)}${isBest ? (en ? ' (best night)' : '（最佳）') : ''}">
      ${isBest ? `<span class="od-flag-pill">★ ${term(TERMS.best, en)}</span>` : ''}
      <div class="od-day">${escapeHtml(dayTxt)}</div>
      <div class="od-date">${escapeHtml(dateTxt)}</div>
      <div class="od-score${hasScore ? '' : ' od-na'}" style="${hasScore ? `color:${bCol};` : ''}">${hasScore ? scoreVal : '--'}</div>
      <div class="od-badge" style="color:${hasScore ? bCol : 'var(--muted)'};">${escapeHtml(n.badge)}</div>
      ${winHtml}
      <div class="od-stat"><span class="nowrap">${escapeHtml(clearTxt)}</span><br/><span class="nowrap">${escapeHtml(kpTxt)}${gTag}</span></div>
    </div>`;
  }).join('');
}

function renderNoaaSection({ magSeries, chartSeries, speed, goesSub, noaaScales, noaaAlert, bal, noaaOk, noaaLagMin, pos }) {
  const en = isEn();
  const tz = pos?.tz || state.pos.tz;
  renderStormBanner(noaaScales, noaaAlert);

  const enSum = summarizeEnergyTrend(chartSeries, speed, bal);
  const bzBadge = $('bzBadge');
  if (bzBadge) {
    const liveBz = Number.isFinite(bal?.cleanLatestBz)
      ? bal.cleanLatestBz
      : (chartSeries?.length && Number.isFinite(chartSeries[chartSeries.length - 1]?.bz) ? chartSeries[chartSeries.length - 1].bz : null);
    if (goesSub?.active || bal?.shockActive) {
      bzBadge.textContent = term(TERMS.solarWind.strong, en);
      bzBadge.className = 'sw-badge sw-good';
    } else if (enSum.good) {
      bzBadge.textContent = term(TERMS.solarWind.active, en);
      bzBadge.className = 'sw-badge sw-good';
    } else if ((liveBz !== null && liveBz <= -2.5) || (enSum.raw && enSum.raw.includes('增強'))) {
      bzBadge.textContent = term(TERMS.solarWind.building, en);
      bzBadge.className = 'sw-badge sw-warn';
    } else if (enSum.raw) {
      bzBadge.textContent = term(TERMS.solarWind.low, en);
      bzBadge.className = 'sw-badge';
    } else {
      bzBadge.textContent = '';
      bzBadge.className = 'sw-badge';
    }
  }
  const eb = $('energyBanner');
  if (eb) {
    eb.className = 'callout ' + (enSum.good || goesSub?.active || bal.shockActive ? 'good' : 'warn');
    eb.textContent = goesSub?.active
      ? (en ? 'Sudden magnetotail energy release detected — aurora may brighten quickly.' : '偵測到磁尾能量釋放，極光可能短時間內明顯增強。')
      : (bal.shockActive
          ? (en ? `Strong solar wind incoming — aurora may brighten in about ${bal.etaMin} min.` : `偵測到強太陽風波動，約 ${bal.etaMin} 分鐘後可能觸發極光增強。`)
          : enSum.text);
  }

  const lastM = magSeries.length ? magSeries[magSeries.length - 1] : null;
  const etaMin = Number.isFinite(bal?.etaMin) ? bal.etaMin : 45;
  const lastArrMs = lastM ? Engine.parseUtcMs(lastM.time_tag) + etaMin * 60000 : NaN;
  const isFutureEta = Number.isFinite(lastArrMs) && lastArrMs >= Date.now() - 2 * 60000;
  const etaClock = isFutureEta ? utcTagToLocalHM(lastM.time_tag, tz, etaMin) : '';
  const hasDashedLine = Boolean(bal && Number.isInteger(bal.arrivingIdx) && bal.arrivingIdx > 4 && bal.arrivingIdx < (chartSeries?.length || 0) - 4);
  setText('etaHint', en
    ? (hasDashedLine && etaClock
        ? `Right of dashed line = arriving by ${etaClock}`
        : (etaClock ? `Earth-arrival local time (incoming wind arriving by ${etaClock})` : 'Time axis shows estimated Earth arrival'))
    : (hasDashedLine && etaClock
        ? `虛線右側＝已測得太陽風，預估於 ${etaClock} 前陸續到達`
        : (etaClock ? `時間軸為到達地球當地時間（已測得太陽風約 ${etaClock} 前抵達）` : '時間軸已換算為到達地球的當地時間')));
  setHtml('bzChart', buildBzChartSVG(chartSeries, tz, speed, bal));

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

function formatDarkCountdownSub(darkWin, moon, en) {
  if (darkWin?.state === 'midnight-sun') return en ? 'Midnight sun' : '極晝偏亮';
  if (darkWin?.state === 'twilight-wait' && darkWin.nextDarkHM) {
    return en ? `Dark at ${escapeHtml(darkWin.nextDarkHM)}` : `${escapeHtml(darkWin.nextDarkHM)} 天黑`;
  }
  if (darkWin?.state === 'polar-night') {
    return moon.up
      ? (en ? `Polar night · Moon ${moon.pct}%` : `極夜 · 月光 ${moon.pct}%`)
      : (en ? 'Polar night' : '極夜全暗');
  }
  if (darkWin?.state === 'dark' && darkWin.darkEndHM) {
    if (moon.up && moon.effMoonPct >= 40) {
      return en
        ? `Moon ${moon.pct}% · light ${escapeHtml(darkWin.darkEndHM)}`
        : `月光 ${moon.pct}% · ${escapeHtml(darkWin.darkEndHM)} 天亮`;
    }
    return en ? `Light at ${escapeHtml(darkWin.darkEndHM)}` : `${escapeHtml(darkWin.darkEndHM)} 天亮`;
  }
  return moon.up ? (en ? `Moon ${moon.pct}%` : `月光 ${moon.pct}%`) : (en ? 'Moon down' : '月亮已落下');
}

function renderRoadLinks(pos, en) {
  const wrap = $('roadLinks');
  if (!wrap || !pos) return;
  let links = null;
  if (pos.lat >= 55 && pos.lon >= -26 && pos.lon <= 35) {
    links = [
      { id: 'roadNo', url: 'https://www.vegvesen.no/trafikk', zh: '挪威 Vegvesen ↗', en: 'Norway Vegvesen ↗' },
      { id: 'roadSe', url: 'https://www.trafikverket.se/trafikinformation/vag/', zh: '瑞典 Trafikverket ↗', en: 'Sweden Trafikverket ↗' },
      { id: 'roadIs', url: 'https://umferdin.is/en', zh: '冰島 Umferðin ↗', en: 'Iceland Umferðin ↗' },
      { id: 'roadFi', url: 'https://liikennetilanne.fintraffic.fi/', zh: '芬蘭路況 ↗', en: 'Finland Roads ↗' }
    ];
  } else if (pos.lat >= 45 && pos.lon <= -50) {
    links = [
      { id: 'roadAk', url: 'https://511.alaska.gov/', zh: '阿拉斯加 511 ↗', en: 'Alaska 511 ↗' },
      { id: 'roadNwt', url: 'https://www.inf.gov.nt.ca/en/services/highways/highway-conditions', zh: '黃刀公路路況 ↗', en: 'NWT Highways ↗' },
      { id: 'roadYk', url: 'https://511yukon.ca/', zh: '育空 511 ↗', en: 'Yukon 511 ↗' }
    ];
  } else if (pos.lat <= -30 && pos.lon >= 130) {
    links = [
      { id: 'roadNz', url: 'https://www.journeys.nzta.govt.nz/', zh: '紐西蘭 NZTA 路況 ↗', en: 'NZTA Journeys ↗' },
      { id: 'roadTas', url: 'https://www.police.tas.gov.au/community-alerts/', zh: '塔斯馬尼亞路況 ↗', en: 'Tasmania Alerts ↗' }
    ];
  }
  if (!links) {
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
  setHtml('radarSvg', buildCompassRadarSVG(dirResults, pos));

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
    const distTag = d.isGeneric
      ? (en ? ' · straight-line (verify road)' : ' · 直線參考（請確認路況）')
      : (Number.isFinite(kmVal) && kmVal > 0 ? (en ? ` · ~${kmVal} km road` : ` · 公路 ~${kmVal} km`) : '');
    const windMs = Number(d.maxWind3h) || 0;
    const precipMm = Number(d.maxPrecip3h) || 0;
    const hazards = [];
    if (!d.isOcean && !unavail && windMs >= 12) {
      hazards.push(en ? `⚠ Gale ${Math.round(windMs)}m/s` : `⚠ 強風 ${Math.round(windMs)}m/s`);
    } else if (!d.isOcean && !unavail && windMs >= 9 && (d.temp ?? 5) <= 1.5) {
      hazards.push(en ? `⚠ Drifting snow ${Math.round(windMs)}m/s` : `⚠ 吹雪風 ${Math.round(windMs)}m/s`);
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
          ? `<span style="font-size:0.75rem;color:var(--blue);font-weight:700;">${en ? 'Open Sea' : '海域參考'}</span>`
          : `<span style="font-size:0.75rem;color:var(--muted);font-weight:700;">${en ? 'Unavailable' : '暫無資料'}</span>`)
      : `<a class="btn ${hazard ? 'btn-hazard' : 'btn-blue'}" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&origin=${pos.lat},${pos.lon}&destination=${d.lat},${d.lon}&travelmode=driving">${en ? (hazard ? 'Caution' : 'Drive') : (hazard ? '注意路況' : '導航')}</a>`;
    const statLine = unavail
      ? (en ? 'Forecast temporarily unavailable' : '此方向氣象暫時無法取得')
      : `${en ? 'Next 3h' : '3 小時晴空率'} <strong class="${col}">${clear3h}%</strong> · ${en ? 'now' : '目前'} ${clearNow}% · ${fmtTemp(d.temp)}${rainTag}`;
    return `<div class="dir ${isBest ? 'best' : ''} ${hazard ? 'hazard' : ''} ${d.isOcean ? 'sea' : ''}">
      <div><div style="font-weight:800;font-size:0.9rem;">${escapeHtml(tDirLabel(d.label))}${isBest ? ' ★' : ''}<span style="font-weight:600;font-size:0.74rem;color:var(--muted);">${distTag}</span></div>
      <div style="font-size:0.74rem;color:var(--muted);">${statLine}</div>${hazardHtml}${noteHtml}</div>
      ${nav}
    </div>`;
  }).join('');
}

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
    scNext, noaaOk, noaaLagMin, usedMet, cloudConsensus, hereHrs, noaaAlert, predKp1h
  });

  // +ETA Forward Forecast Strip with Semantic Score Coloring
  if (sc.outOfZone && (!scNext || scNext.outOfZone)) {
    setHtml('fcNextTxt', en
      ? `Next hour: score <strong style="color:var(--muted)">0</strong> (out of zone)`
      : `未來 1 小時：指數 <strong style="color:var(--muted)">0</strong>（不在極光帶）`);
  } else if (scNext) {
    const diff = scNext.total - sc.total;
    const arrow = diff >= 6 ? (en ? 'rising' : '可能增強') : (diff <= -6 ? (en ? 'fading' : '可能轉弱') : (en ? 'little change' : '變化不大'));
    const etaSafe = escapeHtml(etaClock);
    const nextCol = scNext.isTooBright ? 'var(--blue)' : (scNext.outOfZone ? 'var(--muted)' : tierColor(scNext.total));
    setHtml('fcNextTxt', en
      ? `${etaSafe ? `By ${etaSafe}` : `In about ${safeBal.etaMin} min`}: score <strong style="color:${nextCol}">${scNext.total}</strong> · ${arrow}`
      : `${etaSafe ? `${etaSafe} 前` : `約 ${safeBal.etaMin} 分鐘後`}：指數 <strong style="color:${nextCol}">${scNext.total}</strong>，${arrow}`);
  }
  const confBtn = $('fcConfBtn');
  if (confBtn) {
    const degraded = expNow.confidence.level === 'low' || !noaaOk || (noaaLagMin !== null && noaaLagMin > 45) || cloudConsensus?.level === 'low';
    confBtn.classList.toggle('warn', degraded);
    confBtn.textContent = degraded ? `⚠ ${expNow.confidence.badgeText} ›` : (en ? 'Why? ›' : '說明 ›');
  }

  // Live raw telemetry & dedicated METAR calibration note inside Trust Sheet
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
  const metarNote = (metarObs && metarFusion?.discrepancyFlag)
    ? (en
        ? `${metarObs.icao} airport observed ${metarObs.clearPct}% clear ${metarObs.ageMin} min ago${metarObs.ceilingM ? ` · cloud base ${metarObs.ceilingM} m` : ''} — short-term forecast corrected.`
        : `鄰近 ${metarObs.icao} 機場 ${metarObs.ageMin} 分鐘前實測晴空率 ${metarObs.clearPct}%${metarObs.ceilingM ? ` · 雲底 ${metarObs.ceilingM} m` : ''}，已用來校正短時預報。`)
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

  // Single-line atomic bento sub-metrics (zero awkward wrap on 360px/390px)
  const skyParts = [`<span class="nowrap">${fmtTemp(t0Int)}</span>`];
  if (t0Int - wc0Int >= 3) {
    skyParts.push(`<span class="nowrap">${en ? `Feels ${fmtTemp(wc0Int)}` : `體感 ${fmtTemp(wc0Int)}`}</span>`);
  } else if (!isBlowingSnow && precip0 >= 0.2) {
    skyParts.push(`<span class="nowrap">${t0Int <= 1 ? (en ? 'Snow' : '降雪') : (en ? 'Rain' : '降雨')}</span>`);
  }

  // Dedicated full-width safety, G1-G2 activity & laser calibration micro-pills below Bento
  const heroTags = [];
  if (isExtremeCold) {
    heroTags.push(`<span class="hero-tag t-red">${en ? `⚠ Extreme cold (${fmtTemp(wc0Int)})` : `⚠ 極寒注意（體感 ${fmtTemp(wc0Int)}）`}</span>`);
  }
  if (isBlowingSnow) {
    heroTags.push(`<span class="hero-tag t-amber">${en ? '⚠ Blowing snow' : '⚠ 吹雪強風'}</span>`);
  }
  if (state.bannerState.stormMinorTag) {
    heroTags.push(`<button type="button" class="hero-tag t-amber hero-tag-btn" data-open-trust="1" aria-haspopup="dialog" aria-controls="trustSheet">⚡ ${escapeHtml(state.bannerState.stormMinorTag)} ›</button>`);
  }
  if (metarObs && metarFusion?.discrepancyFlag) {
    heroTags.push(`<span class="hero-tag t-blue">${en ? `◎ Checked with ${escapeHtml(metarObs.icao)} airport obs` : `◎ 已用 ${escapeHtml(metarObs.icao)} 機場實測校正`}</span>`);
  }
  setHtml('heroTags', heroTags.join(''));

  const kpShort = kp !== null ? kp.toFixed(1) : '--';
  const aurSubHtml = sc.outOfZone === 'low-lat'
    ? `<span class="nowrap">${en ? `Mag ${sc.magLat}°` : `地磁 ${sc.magLat}°`}</span>`
    : (sc.outOfZone === 'need-storm'
        ? `<span class="nowrap">Kp ${kpShort} · ${en ? `need ${sc.neededKp}` : `需 ${sc.neededKp}`}</span>`
        : (ovation !== null
            ? `<span class="nowrap">${en ? `Kp ${kpShort} · ${ovation}% prob` : `頭頂 ${ovation}% · Kp ${kpShort}`}</span>`
            : `<span class="nowrap">Kp ${kp !== null ? kp.toFixed(1) : '--'}</span>`));
  const darkWin = computeDarkWindow(refNow, pos.lat, pos.lon, pos.tz);
  document.body.classList.remove('is-loading');
  renderGauge(sc, {
    isTooBright: sc.isTooBright,
    skySubHtml: skyParts.join(' · '),
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

  const act = synthesizeTonightAction({
    lat: pos.lat, lon: pos.lon, sc, scNext, bal: safeBal, goesSub,
    bestDark, dirResults, nights3: localizedNights3, darkWin,
    kp, mlt: mltNow ?? null, effMoonPct: moon.effMoonPct
  });
  setText('vTitle', act.title);
  setText('vLead', act.lead);
  const actBtn = $('vActionBtn');
  if (actBtn) {
    actBtn.style.display = (act.ctaView && act.ctaLabel) ? 'inline-flex' : 'none';
    if (act.ctaView && act.ctaLabel) {
      actBtn.textContent = act.ctaLabel;
      actBtn.dataset.targetView = act.ctaView;
    }
  }

  if (Array.isArray(st.scoredHours) && st.scoredHours.length) state.scoredHours = st.scoredHours;
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

  // Instant Stale-While-Revalidate (SWR) paint: if we have a recent (<20 min) cached snapshot for this city,
  // render it immediately (<10ms) while syncing fresh data quietly in the background (1P Apple Weather feel).
  if (!forceNoaa) {
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
      if ((pr === 'model-diverge' || pr === 'cloud-spread') && cc && Number.isFinite(cc.metAvg3h) && Number.isFinite(cc.omAvg3h)) {
        const c1 = Math.max(0, Math.min(100, Math.round(100 - cc.metAvg3h)));
        const c2 = Math.max(0, Math.min(100, Math.round(100 - cc.omAvg3h)));
        detailTxt = en
          ? `Clear-sky models disagree (${isMet ? 'MET Norway' : 'Primary'} ${c1}% vs ${isMet ? 'ECMWF' : 'Secondary'} ${c2}%) — check live cams.`
          : `兩組晴空預報分歧（${isMet ? '挪威官方' : '主模型'} ${c1}%、${isMet ? 'ECMWF 全球模型' : '對照模型'} ${c2}%），建議看即時實拍確認。`;
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
  const reset = (shouldClose) => {
    if (!active) return;
    active = false;
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
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  hdr.addEventListener('touchend', () => reset(true));
  hdr.addEventListener('touchcancel', () => reset(false));
}

function bindWaveScrubbing() {
  const svg = $('skyWaveChart');
  if (!svg) return;
  let tracking = false, scrubbing = false, startX = 0, startY = 0, activePointerId = null;
  const pickFromClientX = (clientX) => {
    const vis = getVisibleHours();
    if (vis.length < 2) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const svgX = ((clientX - rect.left) / rect.width) * 420;
    const padL = 56, plotW = 420 - 56 - 14;
    const ratio = Math.max(0, Math.min(1, (svgX - padL) / plotW));
    const idx = Math.round(ratio * (vis.length - 1));
    if (idx !== state.selectedHourIdx) {
      selectForecastHour(idx);
      haptic(5);
    }
  };
  const reset = () => {
    if (scrubbing && activePointerId !== null) {
      try { svg.releasePointerCapture(activePointerId); } catch {}
    }
    tracking = false;
    scrubbing = false;
    activePointerId = null;
  };
  svg.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    if (e.isPrimary === false) return;
    tracking = true;
    scrubbing = false;
    startX = e.clientX;
    startY = e.clientY;
    activePointerId = e.pointerId;
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
        pickFromClientX(e.clientX);
      }
      return;
    }
    pickFromClientX(e.clientX);
  });
  svg.addEventListener('pointerup', (e) => {
    if (!tracking || e.pointerId !== activePointerId) return;
    const isCleanTap = !scrubbing && Math.hypot(e.clientX - startX, e.clientY - startY) <= 10;
    reset();
    if (isCleanTap) pickFromClientX(e.clientX);
  });
  svg.addEventListener('pointercancel', reset);
}

function bindPullToRefresh() {
  const ptr = $('ptrIndicator');
  const txt = $('ptrText');
  if (!ptr) return;
  let startX = 0, startY = 0, pullY = 0, tracking = false;
  const finish = (allowRefresh) => {
    if (!tracking) return;
    tracking = false;
    const shouldRefresh = allowRefresh && pullY >= 46;
    ptr.classList.remove('pulling', 'ready');
    ptr.style.height = '0px';
    ptr.style.opacity = '0';
    pullY = 0;
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
    tracking = true;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!tracking) return;
    if (e.touches.length !== 1) { finish(false); return; }
    const dx = Math.abs(e.touches[0].clientX - startX);
    const dy = e.touches[0].clientY - startY;
    if (dx > dy && dy < 20) { finish(false); return; }
    if (dy <= 6 || window.scrollY > 2) {
      if (pullY > 0) { ptr.style.height = '0px'; ptr.style.opacity = '0'; pullY = 0; }
      return;
    }
    pullY = Math.min(72, Math.round(dy * 0.45));
    ptr.classList.add('pulling');
    ptr.style.height = `${pullY}px`;
    ptr.style.opacity = String(Math.min(1, pullY / 42));
    const ready = pullY >= 46;
    ptr.classList.toggle('ready', ready);
    if (txt) txt.textContent = ready
      ? (isEn() ? 'Release to refresh' : '放開立即更新')
      : (isEn() ? 'Pull to refresh' : '下拉更新');
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

  // Scroll-reactive frosted glass sticky header
  const syncScrollHdr = () => document.body.classList.toggle('is-scrolled', window.scrollY > 10);
  window.addEventListener('scroll', syncScrollHdr, { passive: true });
  syncScrollHdr();

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
