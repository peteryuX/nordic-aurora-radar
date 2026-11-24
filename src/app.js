/**
 * Nordic Aurora Radar — Browser UI Controller
 *
 * Thin UI orchestrator connecting the pure scientific engine (aurora-engine.js),
 * SVG builders (charts.js), live data transport (data-client.js), safe offline
 * storage (storage.js), and declarative bilingual strings (i18n.js) to the DOM.
 */

import * as Engine from './aurora-engine.js';
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
  computeDarkWindow, getMoonState, computeViewingGeometry, classifyViewingMode,
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
    name: '挪威・Alta', nameEn: 'Norway · Alta',
    lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo',
    mode: 'manual', accuracy: null
  },
  lastScore: null,
  lastSyncMs: 0,
  lastAttemptMs: 0,
  isRefreshing: false,
  scoredHours: [],
  bestAurora: null,
  selectedHourIdx: 0,
  renderState: null,
  explainState: null,
  alertEnabled: false,
  redModeEnabled: false,
  lastAlertMs: 0,
  wakeLockObj: null,
  audioCtx: null,
  refreshSeq: 0,
  locationSeq: 0,
  activeRefreshCtrl: null,
  camKey: 'uit',
  camUserPicked: false,
  trustTriggerEl: null,
  toastTimer: null
};

const $ = (id) => document.getElementById(id);
const setText = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
const setHtml = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

function getPosDisplayName(pos = state.pos) {
  return resolveCityDisplayName(pos, getLang());
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
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
  $('redBtn')?.classList.toggle('red-on', state.redModeEnabled);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.redModeEnabled ? '#040000' : '#040912');
}

function toggleRedMode() {
  state.redModeEnabled = !state.redModeEnabled;
  saveRedMode(state.redModeEnabled);
  applyRedModeUI();
  toast(state.redModeEnabled
    ? (isEn() ? 'Red-light night vision ON' : '已開啟紅光夜視模式（保護暗適應）')
    : (isEn() ? 'Red-light night vision OFF' : '已關閉紅光夜視模式'));
}

function applyStaticI18n() {
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
  renderLocationHeader();
  updateClockAndPhoto();
  if (state.renderState) renderFromState(state.renderState);
  syncBrowserUrl();
  refreshLocalizedPlaceName();
  toast(isEn() ? 'Switched to English' : '已切換為繁體中文');
}

// ====== Alerts & Audio ======
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

async function toggleAlertMode() {
  state.alertEnabled = !state.alertEnabled;
  const btn = $('alertBtn');
  const en = isEn();
  if (state.alertEnabled) {
    btn?.classList.add('alert-on');
    playAuroraChime();
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    try { if (navigator.wakeLock) state.wakeLockObj = await navigator.wakeLock.request('screen'); } catch {}
    toast(en ? 'Screen-on monitor ON — keep screen unlocked & plugged in' : '已開啟螢幕常亮監測（請保持螢幕未鎖定並接上電源）');
  } else {
    btn?.classList.remove('alert-on');
    try { if (state.wakeLockObj) { await state.wakeLockObj.release(); state.wakeLockObj = null; } } catch {}
    toast(en ? 'Screen-on monitor turned off' : '已關閉螢幕常亮監測');
  }
}

function maybeTriggerAlert(sc, goesSub, scNext, bal, pos = state.pos) {
  if (!state.alertEnabled) return;
  const check = shouldTriggerAuroraAlert({ sc, goesSub, scNext, bal });
  if (!check.fire || Date.now() - state.lastAlertMs < 15 * 60 * 1000) return;
  state.lastAlertMs = Date.now();
  playAuroraChime();
  if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 350]);
  const en = isEn();
  const cityLabel = getPosDisplayName(pos);
  const msgMap = {
    score: en ? `${cityLabel} Viewing Score reached ${sc.total}! Head outside.` : `${cityLabel} 觀測指數達 ${sc.total} 分，適合出門觀測！`,
    'storm-gap': en ? `Strong aurora (${sc.auroraScore}/100) active — watch cloud gaps!` : `強極光活動中（${sc.auroraScore}分），雲縫間有機會看見！`,
    substorm: en ? `Substorm onset detected with sky openings!` : `偵測到副磁暴釋放且天空有晴空空檔！`,
    incoming: en ? `Incoming surge: est. ${scNext?.total}/100 in ~${bal?.etaMin || 45} min!` : `太陽風能量將抵達：預估 ${bal?.etaMin || 45} 分內達 ${scNext?.total} 分！`
  };
  const msg = msgMap[check.reason] || msgMap.score;
  toast(msg);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(en ? 'Aurora Radar Alert' : '極光即時雷達提醒', { body: msg });
    }
  } catch {}
}

// ====== Location, Picker, Tabs & All-Sky Cams ======
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
  if (/Line\/|FBAN|FBAV|Instagram|MicroMessenger/i.test(navigator.userAgent || '')) {
    const tip = $('lineTip');
    if (tip) tip.style.display = 'block';
  }
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

function togglePicker(forceClose) {
  const p = $('picker');
  const btn = $('pickBtn');
  if (!p || !btn) return;
  const open = forceClose ? false : !p.classList.contains('open');
  p.classList.toggle('open', open);
  btn.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
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

function updateSkyCamDayNotice(key) {
  const notice = $('camDayNotice');
  const cam = SKY_CAMS[key];
  if (!notice) return;
  if (!cam || cam.isMag || !Number.isFinite(cam.lat)) {
    notice.style.display = 'none';
    return;
  }
  const now = new Date();
  const sunAlt = computeSolarElevation(now, cam.lat, cam.lon);
  if (sunAlt <= -6) {
    notice.style.display = 'none';
    return;
  }
  const en = isEn();
  const dw = computeDarkWindow(now, cam.lat, cam.lon, cam.tz || 'UTC');
  const nextStr = dw.state === 'twilight-wait' && dw.nextDarkHM
    ? (en ? ` Dark again around ${dw.nextDarkHM} local.` : ` 預計當地 ${dw.nextDarkHM} 後轉暗恢復正常夜拍。`)
    : (dw.state === 'midnight-sun'
        ? (en ? ' Midnight sun period — 24h daylight.' : ' 目前為極晝期間，24 小時皆偏亮。')
        : '');
  notice.style.display = 'block';
  notice.textContent = en
    ? `Daylight/twilight at this observatory (sun ${sunAlt.toFixed(0)}°) — high-sensitivity aurora cameras naturally appear white/overexposed until dark.${nextStr}`
    : `此天文台目前為白天／暮光（太陽 ${sunAlt.toFixed(0)}°），高感光極光相機畫面偏白過曝屬正常現象。${nextStr}`;
}

function selectSkyCam(key, btn, isUser = false) {
  if (!SKY_CAMS[key]) return;
  if (isUser) state.camUserPicked = true;
  state.camKey = key;
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
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  $('v-' + name)?.classList.add('on');
  const navBtn = btn || document.querySelector(`.bottom-nav .nav-btn[data-view="${name}"]`);
  navBtn?.classList.add('on');
  if (name === 'sat') syncSatTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLocationHeader() {
  const en = isEn();
  setText('locName', getPosDisplayName());
  const dotCls = state.pos.mode === 'gps' ? 'live' : (state.pos.mode === 'gps-err' ? 'err' : 'manual');
  const dot = $('gpsDot');
  if (dot) dot.className = `gps-dot ${dotCls}`;
  $('gpsBtn')?.classList.toggle('gps-live', state.pos.mode === 'gps');
  setText('clkLbl', en ? 'Local' : '當地');

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

function updateClockAndPhoto() {
  const now = new Date();
  const en = isEn();
  try {
    const z = getZoneParts(now, state.pos.tz);
    setText('clk', `${z.hourStr}:${z.minStr}`);
  } catch {}

  const moon = getMoonState(now, state.pos.lat, state.pos.lon);
  const liveKp = Math.max(state.renderState?.kp ?? 2, state.renderState?.sc?.effKp ?? 0);
  const aurScore = state.renderState?.sc?.auroraScore ?? 0;
  const geom = computeViewingGeometry({
    lat: state.pos.lat, lon: state.pos.lon, kp: liveKp,
    mlt: computeMLT(now, state.pos.lat, state.pos.lon)
  });
  const modeInfo = classifyViewingMode({ scoreObj: state.renderState?.sc, geom, effMoonPct: moon.effMoonPct });
  const aimTxt = geom.mode === 'below'
    ? (en ? `${geom.direction} low horizon` : `${geom.direction} 低空地平線`)
    : geom.shortText;
  const tempNow = state.renderState?.hereHrs?.[0]?.temp;
  const isFreezing = Number.isFinite(tempNow) && tempNow <= 0;
  const fastBright = aurScore >= 60;

  const list = $('tsPhotoList');
  if (list) {
    const expLine = fastBright
      ? (en
          ? `<li><strong>Exposure (Active Aurora)</strong>: Flash OFF, use <strong>1–3s</strong> shutter (fast curtains blur into mush at 5–10s); raise ISO if needed.</li>`
          : `<li><strong>曝光（活躍極光）</strong>：關閃光燈，快門壓在 <strong>1–3 秒</strong>（舞動極光曝 5–10 秒會糊成一片綠霧），寧可拉高 ISO。</li>`)
      : (moon.effMoonPct >= 55
          ? (en
              ? `<li><strong>Exposure (Bright Moon)</strong>: Flash OFF, Night Mode <strong>2–3s</strong>; keep moon behind you or highlights wash out.</li>`
              : `<li><strong>曝光（月光偏亮）</strong>：關閃光燈、開夜間模式並將秒數壓在 <strong>2–3 秒</strong>，背對月亮避免天空過曝白掉。</li>`)
          : (en
              ? `<li><strong>Exposure (Faint Arc)</strong>: Flash OFF, Night Mode <strong>5–10s</strong> (brace on tripod/rail); switch to 1–3s once curtains dance.</li>`
              : `<li><strong>曝光（微弱極光）</strong>：關閃光燈、開夜間模式設 <strong>5–10 秒</strong>（上腳架或靠欄杆）；一旦開始舞動立即縮回 1–3 秒。</li>`));
    const aimLine = en
      ? `<li><strong>Framing</strong>: Point toward <strong>${escapeHtml(aimTxt)}</strong>.${modeInfo.text ? ` ${escapeHtml(modeInfo.text)}.` : ''}</li>`
      : `<li><strong>取景方向</strong>：朝 <strong>${escapeHtml(aimTxt)}</strong> 取景。${modeInfo.text ? `${escapeHtml(modeInfo.text)}。` : ''}</li>`;
    const etiquetteTxt = en
      ? `Turn on Red-Light mode (top-right) and dim screen so you preserve night vision and avoid ruining nearby shots.`
      : `開啟右上角紅光模式並調暗螢幕，保護暗適應且不干擾旁人長曝。`;
    const fieldLine = isFreezing
      ? (en
          ? `<li><strong>Sub-Zero (${Math.round(tempNow)}°C) &amp; Etiquette</strong>: Keep spare batteries warm; zip-bag gear before entering indoors to stop condensation. ${etiquetteTxt}</li>`
          : `<li><strong>低溫（${Math.round(tempNow)}°C）與暗空禮儀</strong>：備用電池放貼身內袋、進室內前裝夾鏈袋防結霜；${etiquetteTxt}</li>`)
      : (en
          ? `<li><strong>Dark-Sky Etiquette</strong>: ${etiquetteTxt}</li>`
          : `<li><strong>暗空禮儀</strong>：${etiquetteTxt}</li>`);
    list.innerHTML = expLine + aimLine + fieldLine;
  }
  return moon;
}

// ====== Gauges, Charts & State Rendering ======
const barColor = (score) => (score >= 65 ? 'var(--green)' : score >= 35 ? 'var(--amber)' : 'var(--red)');
function scoreCssColor(hex) {
  if (hex === '#34f0b0') return 'var(--green)';
  if (hex === '#ffcf5c') return 'var(--amber)';
  if (hex === '#66bdff') return 'var(--blue)';
  return 'var(--red)';
}
const fmtTempC = (t) => { const n = Math.round(t) || 0; return `${n > 0 ? '+' : ''}${n}°C`; };

function renderGauge(sc, details) {
  state.lastScore = sc;
  const en = isEn();
  const circ = 2 * Math.PI * 52;
  const visPct = sc.total === 0 ? 5 : sc.total;
  const ringCol = scoreCssColor(sc.color);
  const prog = $('ringProg');
  if (prog) {
    prog.style.strokeDasharray = circ.toFixed(1);
    prog.style.strokeDashoffset = (circ * (1 - visPct / 100)).toFixed(1);
    prog.style.stroke = ringCol;
    prog.style.filter = `drop-shadow(0 0 8px ${sc.color}88)`;
  }
  const numEl = $('ringNum');
  if (numEl) { numEl.textContent = sc.total; numEl.style.color = ringCol; }
  const grEl = $('ringGrade');
  if (grEl) { grEl.textContent = tGrade(sc.grade).replace(/^[^\p{L}\p{N}]+\s*/u, ''); grEl.style.color = ringCol; }

  const setFactor = (vid, bid, sid, pct, lbl, sub, forceC) => {
    const c = forceC || barColor(pct);
    const ve = $(vid); if (ve) { ve.textContent = lbl; ve.style.color = c; }
    const be = $(bid); if (be) { be.style.width = `${Math.max(6, pct)}%`; be.style.background = c; }
    setText(sid, sub);
  };
  setFactor('fSkyVal', 'fSkyBar', 'fSkySub', sc.skyScore, `${sc.skyScore}%`, details.skySub);
  setFactor('fAurVal', 'fAurBar', 'fAurSub', sc.auroraScore, en ? `${sc.auroraScore}` : `${sc.auroraScore}分`, details.aurSub);
  setFactor('fDarkVal', 'fDarkBar', 'fDarkSub', sc.darkScore, details.isTooBright ? (en ? 'Bright' : '尚亮') : `${sc.darkScore}%`, details.darkSub, details.isTooBright ? 'var(--blue)' : null);
}

function selectForecastHour(idx) {
  if (!state.scoredHours.length || idx < 0 || idx >= state.scoredHours.length) return;
  state.selectedHourIdx = idx;
  const en = isEn();
  const h = state.scoredHours[idx];
  setHtml('skyWaveChart', buildSkyWaveSVG(state.scoredHours, state.bestAurora, idx));
  const tInt = Math.round(h.temp) || 0;
  const wcInt = Math.round(h.windChill ?? h.temp) || 0;
  const wcTxt = (tInt - wcInt >= 3) ? (en ? ` (Feels ${fmtTempC(wcInt)})` : `（體感 ${fmtTempC(wcInt)}）`) : '';
  const moonTxt = h.isDay
    ? (en ? 'Too bright' : '天色過亮')
    : (h.moonUp ? (en ? `Moon ${h.moonPct}%` : `月相 ${h.moonPct}%`) : (en ? 'Moon down' : '月亮落下'));
  const kpStr = Number.isFinite(h.kpFc) ? h.kpFc.toFixed(2) : escapeHtml(h.kpFc);
  const tStr = escapeHtml(h.time);
  const skyLabel = escapeHtml(en ? tSky(h.txt, 'en') : String(h.txt || '').replace(/^[^\p{L}\p{N}]+\s*/u, ''));
  setHtml('hourDetail', en
    ? `<span><strong>${tStr}</strong> · Score <strong>${h.score}</strong> · Clear ${h.clear}% (${skyLabel})</span><span>${fmtTempC(tInt)}${wcTxt} · ${moonTxt} · Kp ${kpStr}</span>`
    : `<span><strong>${tStr}</strong>｜指數 <strong>${h.score}分</strong>｜晴空 ${h.clear}%（${skyLabel}）</span><span>${fmtTempC(tInt)}${wcTxt} · ${moonTxt} · Kp ${kpStr}</span>`);
}

function renderStormBanner(scales, noaaAlert) {
  const el = $('stormBanner');
  if (!el) return;
  const en = isEn();
  const hasAlert = noaaAlert && noaaAlert.active;
  const hasScale = scales && scales.active;
  if (!hasAlert && !hasScale) { el.style.display = 'none'; return; }

  const gNamesZh = { 1: '輕度', 2: '中度', 3: '強烈', 4: '嚴重', 5: '極端' };
  const gNamesEn = { 1: 'Minor', 2: 'Moderate', 3: 'Strong', 4: 'Severe', 5: 'Extreme' };
  if (hasAlert && (noaaAlert.kind === 'cme-shock' || noaaAlert.gScale >= (scales?.currentScale || 0))) {
    const lvl = Math.max(1, noaaAlert.gScale || 1);
    el.className = 'storm-banner' + (lvl >= 3 || noaaAlert.kind === 'cme-shock' ? ' severe' : '');
    el.style.display = 'flex';
    const isShock = noaaAlert.kind === 'cme-shock';
    const isWarn = Boolean(noaaAlert.isWarning);
    const pill = isShock ? 'CME SHOCK' : (isWarn ? `NOAA G${lvl} WARN` : `NOAA G${lvl}`);
    const txt = isShock
      ? (en ? 'SWPC Geomagnetic Sudden Impulse — CME shock arrived' : 'NOAA 官方警報：CME 衝擊波抵達地球（短時間內易爆發）')
      : (isWarn
          ? (en ? `SWPC K=${noaaAlert.kLevel} Storm Warning (Expected)` : `NOAA 官方預警：預計達 K=${noaaAlert.kLevel}（G${lvl}）地磁風暴`)
          : (en ? `SWPC K=${noaaAlert.kLevel} Storm Alert Active` : `NOAA 官方即時警報：達 K=${noaaAlert.kLevel}（G${lvl}）地磁風暴`));
    el.innerHTML = `<span><span class="storm-pill">${escapeHtml(pill)}</span>${escapeHtml(txt)}</span><span style="opacity:0.75;">↗</span>`;
    return;
  }
  const isNow = scales.currentScale >= 1;
  const lvl = isNow ? scales.currentScale : scales.maxForecastScale;
  el.className = 'storm-banner' + (lvl >= 3 ? ' severe' : '');
  el.style.display = 'flex';
  const desc = en ? (gNamesEn[lvl] || 'Geomagnetic') : (gNamesZh[lvl] || '');
  const dStr = scales.peakDate ? scales.peakDate.slice(5).replace('-', '/') : '';
  const txt = isNow
    ? (en ? `${desc} Geomagnetic Storm Active` : `${desc}地磁風暴進行中・極光帶擴張`)
    : (en ? `${desc} Storm Watch (${dStr})` : `預警 ${dStr} 達${desc}地磁風暴`);
  el.innerHTML = `<span><span class="storm-pill">NOAA G${lvl}</span>${escapeHtml(txt)}</span><span style="opacity:0.75;">↗</span>`;
}

function render3NightOutlook(nights) {
  const grid = $('outlookGrid');
  if (!grid || !Array.isArray(nights)) return;
  const en = isEn();
  let bestIdx = -1, bestScore = -1;
  nights.forEach((n, i) => {
    if (n && n.tone === 'good' && (n.bestNightScore ?? 0) > bestScore) {
      bestScore = n.bestNightScore ?? 0;
      bestIdx = i;
    }
  });
  grid.innerHTML = nights.map((n, i) => {
    const clearTxt = n.bestClear !== null ? (en ? `Clear ${n.bestClear}%` : `晴空 ${n.bestClear}%`) : (en ? 'No dark hrs' : '無暗空');
    const hrsLine = (n.bestClear !== null && n.clearDarkHrs > 0)
      ? `<br/><span style="white-space:nowrap;">${en ? `${n.clearDarkHrs} hrs clear` : `共 ${n.clearDarkHrs} 小時晴`}</span>`
      : '';
    const kpTxt = n.kpAvailable === false
      ? (en ? 'Kp --' : 'Kp 待更新')
      : `Kp ${Number(n.maxKp || 0).toFixed(1)}${n.gScale >= 1 ? ` · G${n.gScale}` : ''}`;
    const enlilLine = n.enlilTag ? `<br/><span style="color:var(--amber);font-weight:700;">${escapeHtml(n.enlilTag)}</span>` : '';
    const bCol = n.badgeColor?.startsWith('#') ? scoreCssColor(n.badgeColor) : (n.badgeColor || 'var(--muted)');
    return `<div class="outlook-day ${i === bestIdx ? 'od-best' : ''}">
      <div class="od-date">${escapeHtml(n.label)}</div>
      <div class="od-badge" style="color:${bCol};"><span class="leg-dot" style="background:${bCol};margin-right:2px;"></span>${escapeHtml(n.badge)}</div>
      <div class="od-stat"><span style="white-space:nowrap;">${escapeHtml(clearTxt)}</span>${hrsLine}<br/>${escapeHtml(kpTxt)}${enlilLine}</div>
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
    if (enSum.raw) {
      bzBadge.textContent = enSum.raw;
      bzBadge.className = 'sw-badge' + (liveBz !== null && liveBz <= -4 ? ' sw-good' : (liveBz !== null && liveBz < 0 ? ' sw-warn' : ''));
    } else {
      bzBadge.textContent = '';
      bzBadge.className = 'sw-badge';
    }
  }
  const eb = $('energyBanner');
  if (eb) {
    eb.className = 'callout ' + (enSum.good || goesSub?.active || bal.shockActive ? 'good' : 'warn');
    eb.textContent = goesSub?.active
      ? (en ? `Magnetotail substorm onset (GOES +${goesSub.jumpNt} nT) — aurora may brighten suddenly.` : `偵測到磁尾副磁暴釋放（GOES +${goesSub.jumpNt} nT），極光可能短時間內明顯增強。`)
      : (bal.shockActive
          ? (en ? `Solar wind pressure shock (${bal.pdyn} nPa) — potential burst in ~${bal.etaMin} min.` : `偵測到太陽風動壓衝擊（${bal.pdyn} nPa），約 ${bal.etaMin} 分鐘後可能觸發極光增強。`)
          : enSum.text);
  }

  const lastM = magSeries.length ? magSeries[magSeries.length - 1] : null;
  const etaClock = lastM ? utcTagToLocalHM(lastM.time_tag, tz, bal.etaMin) : '';
  setText('etaHint', en
    ? (etaClock ? `Right of dashed line = arriving by ${etaClock}` : 'Time axis shows estimated Earth arrival')
    : (etaClock ? `虛線右側＝已測得太陽風，預估於 ${etaClock} 前陸續到達` : '時間軸已換算為到達地球的當地時間'));
  setHtml('bzChart', buildBzChartSVG(chartSeries, tz, speed, bal));

  const pNoaa = $('pNoaa');
  if (pNoaa) {
    if (noaaOk) {
      const stale = noaaLagMin !== null && noaaLagMin > 45;
      pNoaa.textContent = stale
        ? (en ? `NOAA Delayed (${noaaLagMin}m) ↗` : `NOAA 延遲 ${noaaLagMin} 分鐘 ↗`)
        : `NOAA (${lastM ? utcTagToLocalHM(lastM.time_tag, tz) : (en ? 'Live' : '已同步')}) ↗`;
    } else {
      pNoaa.textContent = en ? 'NOAA Offline ↗' : 'NOAA 離線 ↗';
    }
  }
  return etaClock;
}

function formatDarkCountdownSub(darkWin, moon, en) {
  const fmtDur = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    if (en) return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
    return h > 0 ? (m > 0 ? `${h}h${m}m` : `${h}小時`) : `${m}分`;
  };
  if (darkWin?.state === 'midnight-sun') return en ? 'Midnight sun (24h)' : '極晝（24h 偏亮）';
  if (darkWin?.state === 'twilight-wait' && darkWin.nextDarkHM) {
    return en ? `Dark ${darkWin.nextDarkHM} (${fmtDur(darkWin.darkInMin)})` : `${darkWin.nextDarkHM} 轉暗（${fmtDur(darkWin.darkInMin)}）`;
  }
  if (darkWin?.state === 'polar-night') {
    return moon.up ? (en ? `Polar night · Moon ${moon.pct}%` : `極夜 · 月相 ${moon.pct}%`) : (en ? 'Polar night dark' : '極夜全暗');
  }
  if (darkWin?.state === 'dark' && darkWin.darkEndHM) {
    if (moon.up && moon.effMoonPct >= 40) {
      return en ? `Moon ${moon.pct}% · Dawn ${darkWin.darkEndHM}` : `月相 ${moon.pct}% · 亮 ${darkWin.darkEndHM}`;
    }
    return en ? `Till ${darkWin.darkEndHM} (${fmtDur(darkWin.darkRemainMin)})` : `暗至 ${darkWin.darkEndHM}（剩 ${fmtDur(darkWin.darkRemainMin)}）`;
  }
  return moon.up ? (en ? `Moon ${moon.pct}%` : `月相 ${moon.pct}%`) : (en ? 'Moon down' : '月亮落下');
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
  const lbl = en ? 'Road & closure status:' : '冬季即時路況／封路查詢：';
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
    const col = unavail ? '' : (d.isOcean ? 'c-blue' : (hazard ? 'c-red' : (clear3h >= 65 ? 'c-green' : clear3h >= 35 ? 'c-amber' : 'c-red')));
    const kmVal = Number.isFinite(d.roadKm) ? d.roadKm : (Number.isFinite(d.distKm) ? d.distKm : Math.round(computeDistanceKm(pos.lat, pos.lon, d.lat, d.lon)));
    const distTag = d.isGeneric
      ? (en ? ' · straight-line (verify road)' : ' · 直線參考（請確認路況）')
      : (Number.isFinite(kmVal) && kmVal > 0 ? (en ? ` · ~${kmVal} km road` : ` · 公路 ~${kmVal} km`) : '');
    const windMs = Number(d.maxWind3h) || 0;
    const precipMm = Number(d.maxPrecip3h) || 0;
    const windTag = (!d.isOcean && !unavail && windMs >= 12)
      ? (en ? ` · ⚠ Gale ${Math.round(windMs)}m/s` : ` · ⚠ 強風 ${Math.round(windMs)}m/s`)
      : ((!d.isOcean && !unavail && windMs >= 9 && (d.temp ?? 5) <= 1.5)
          ? (en ? ` · ⚠ Drifting snow ${Math.round(windMs)}m/s` : ` · ⚠ 吹雪風 ${Math.round(windMs)}m/s`)
          : '');
    const roadTag = (!d.isOcean && !unavail && precipMm >= 0.2)
      ? (d.temp <= 1.5
          ? (en ? ' · Snow/Ice risk' : ' · 降雪／結冰風險')
          : (en ? ' · Rain' : ' · 降雨'))
      : '';
    const coldTag = (!d.isOcean && !unavail && Number.isFinite(d.temp) && d.temp <= -25)
      ? (en ? ' · ⚠ Extreme cold' : ' · ⚠ 極寒凍傷風險')
      : '';
    const noteText = en ? (d.roadNoteEn || '') : (d.roadNote || '');
    const noteHtml = noteText ? `<div class="dir-note">${escapeHtml(noteText)}</div>` : '';
    const nav = (d.isOcean || unavail)
      ? (d.isOcean
          ? `<span style="font-size:0.75rem;color:var(--blue);font-weight:700;">${en ? 'Open Sea' : '海域參考'}</span>`
          : `<span style="font-size:0.75rem;color:var(--muted);font-weight:700;">${en ? 'Unavailable' : '暫無資料'}</span>`)
      : `<a class="btn btn-blue" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&origin=${pos.lat},${pos.lon}&destination=${d.lat},${d.lon}&travelmode=driving">${en ? 'Drive' : '導航'}</a>`;
    const statLine = unavail
      ? (en ? 'Forecast temporarily unavailable' : '此方向氣象暫時無法取得')
      : `${en ? '3h Clear' : '3h 晴空'} <strong class="${col}">${clear3h}%</strong>｜${en ? 'Now' : '目前'} ${clearNow}%｜${fmtTempC(d.temp)}${windTag}${roadTag}${coldTag}`;
    return `<div class="dir ${isBest ? 'best' : ''} ${hazard ? 'hazard' : ''} ${d.isOcean ? 'sea' : ''}">
      <div><div style="font-weight:800;font-size:0.9rem;">${escapeHtml(tDirLabel(d.label))}${isBest ? ' ★' : ''}<span style="font-weight:600;font-size:0.74rem;color:var(--muted);">${distTag}</span></div>
      <div style="font-size:0.74rem;color:var(--muted);">${statLine}</div>${noteHtml}</div>
      ${nav}
    </div>`;
  }).join('');
}

function renderFromState(st) {
  if (!st) return;
  const en = isEn();
  const {
    pos: stPos, magSeries, chartSeries, speed, bz, kp, ovation, hpiGw, goesSub, noaaScales, noaaAlert, kyotoDst, enlilForecast, predKp1h, bal,
    noaaOk, noaaLagMin, hereHrs, dirResults, weatherSourceLabel, usedMet, cloudConsensus,
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

  // +ETA Forward Forecast Strip & Always-Visible Readable Formula/Confidence Button
  if (sc.outOfZone && (!scNext || scNext.outOfZone)) {
    setHtml('fcNextTxt', en ? `Next 1h est.: Score <strong>0</strong> (Latitude limit)` : `未來 1 小時預估：指數 <strong>0</strong>（緯度限制）`);
  } else if (scNext) {
    const diff = scNext.total - sc.total;
    const arrow = diff >= 6 ? (en ? '↗ Rising' : '↗ 增強') : (diff <= -6 ? (en ? '↘ Fading' : '↘ 轉弱') : (en ? '→ Steady' : '→ 持平'));
    const etaSafe = escapeHtml(etaClock);
    setHtml('fcNextTxt', en
      ? `${etaSafe ? `Est. ${etaSafe}` : `In ~${safeBal.etaMin} min`}: Score <strong>${scNext.total}</strong> (${arrow})`
      : `${etaSafe ? `${etaSafe} 預估` : `約 ${safeBal.etaMin} 分鐘後預估`}：指數 <strong>${scNext.total}</strong>（${arrow}）`);
  }
  const confBtn = $('fcConfBtn');
  if (confBtn) {
    const degraded = expNow.confidence.level === 'low' || !noaaOk || (noaaLagMin !== null && noaaLagMin > 45) || cloudConsensus?.level === 'low';
    confBtn.classList.toggle('warn', degraded);
    confBtn.textContent = degraded ? `⚠ ${expNow.confidence.badgeText} ›` : (en ? 'Why? ›' : '說明 ›');
  }

  // Live raw telemetry inside Trust Sheet
  const displayBz = Number.isFinite(safeBal.cleanLatestBz) ? safeBal.cleanLatestBz : bz;
  const rawParts = [
    `Bz ${displayBz !== null && Number.isFinite(displayBz) ? (displayBz >= 0 ? '+' : '') + displayBz.toFixed(1) + ' nT' : '--'}`,
    `${speed && Number.isFinite(speed) ? Math.round(speed) + ' km/s' : '-- km/s'}`,
    `Kp ${kp !== null && Number.isFinite(kp) ? kp.toFixed(2) : '--'}`
  ];
  if (hpiGw !== null && Number.isFinite(hpiGw)) rawParts.push(`HPI ${Math.round(hpiGw)} GW`);
  if (safeBal.pdyn !== null && Number.isFinite(safeBal.pdyn)) rawParts.push(`${safeBal.pdyn} nPa`);
  if (kyotoDst && Number.isFinite(kyotoDst.dst)) rawParts.push(`Dst ${kyotoDst.dst} nT`);
  renderTrustSheetLive(expNow, sc, rawParts.join(' · '));

  setHtml('skySvg', buildSkySceneSVG({
    cloudPct: c0, auroraScore: sc.auroraScore, moonUp: moon.up, moonPct: moon.pct, isTooBright: sc.isTooBright
  }));

  const t0Int = Math.round(hereHrs[0].temp) || 0;
  const wc0Int = Math.round(hereHrs[0].windChill ?? hereHrs[0].temp) || 0;
  const wind0 = Number(hereHrs[0].windMs) || 0;
  const precip0 = Number(hereHrs[0].precip) || 0;
  const wcTag = (t0Int - wc0Int >= 3) ? (en ? ` · Feels ${fmtTempC(wc0Int)}` : ` · 體感${fmtTempC(wc0Int)}`) : '';
  const coldWarnTag = (t0Int <= -25 || wc0Int <= -32) ? (en ? ' · ⚠ Extreme cold' : ' · ⚠ 極寒注意') : '';
  const skyPrecipTag = (wind0 >= 9 && t0Int <= 1 && precip0 >= 0.2)
    ? (en ? ' · ⚠ Blowing snow' : ' · ⚠ 吹雪')
    : (precip0 >= 0.2
        ? (t0Int <= 1 ? (en ? ' · Snow' : ' · 降雪') : (en ? ' · Rain' : ' · 降雨'))
        : '');
  const aurSubText = sc.outOfZone === 'low-lat'
    ? (en ? `Mag ${sc.magLat}°` : `地磁 ${sc.magLat}°`)
    : (sc.outOfZone === 'need-storm'
        ? (en ? `Kp ${kp !== null ? kp.toFixed(1) : '--'} / ≥${sc.neededKp}` : `Kp ${kp !== null ? kp.toFixed(1) : '--'} / 需≥${sc.neededKp}`)
        : (ovation !== null
            ? (en ? `Overhead ${ovation}% · Kp ${kp !== null ? kp.toFixed(1) : '--'}` : `天頂機率 ${ovation}% · Kp ${kp !== null ? kp.toFixed(1) : '--'}`)
            : (en ? `Kp ${kp !== null ? kp.toFixed(2) : '--'}` : `全球 Kp ${kp !== null ? kp.toFixed(2) : '--'}`)));
  const darkWin = computeDarkWindow(refNow, pos.lat, pos.lon, pos.tz);
  renderGauge(sc, {
    isTooBright: sc.isTooBright,
    skySub: `${fmtTempC(t0Int)}${wcTag}${coldWarnTag}${skyPrecipTag}`,
    aurSub: aurSubText,
    darkSub: formatDarkCountdownSub(darkWin, moon, en)
  });

  const localizedNights3 = multiDayPts
    ? summarize3NightOutlook({
        cloudPoints: multiDayPts, kpForecast: kpForecast || [], currentKp: kp,
        lat: pos.lat, lon: pos.lon, timeZone: pos.tz, nowDate: refNow,
        enlilForecast: enlilForecast || null
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

  const bestTimeSafe = escapeHtml(bestDark?.time || '');
  const bestText = bestDark
    ? (bestDark.score >= 35
        ? (en ? `Best window tonight: <strong>${bestTimeSafe}</strong> (Score <strong>${bestDark.score}</strong> · Clear ${bestDark.clear}% · Kp ${bestDark.kpFc.toFixed(2)})` : `今晚最佳時段：<strong>${bestTimeSafe}</strong>（指數 <strong>${bestDark.score} 分</strong>｜晴空 ${bestDark.clear}% · Kp ${bestDark.kpFc.toFixed(2)}）`)
        : (bestDark.block <= 40
            ? (en ? `Clearest dark window: <strong>${bestTimeSafe}</strong> (${bestDark.clear}% clear, Score ${bestDark.score})` : `天黑後最晴時段：<strong>${bestTimeSafe}</strong>（晴空 <strong>${bestDark.clear}%</strong>，指數 ${bestDark.score} 分）`)
            : (bestDark.clear >= 25 || bestDark.score >= 18
                ? (en ? `Clouds may thin around <strong>${bestTimeSafe}</strong> (${bestDark.clear}% clear, Score ${bestDark.score}).` : `預計 <strong>${bestTimeSafe}</strong> 雲層較有機會變薄（晴空 <strong>${bestDark.clear}%</strong>，指數 ${bestDark.score} 分）。`)
                : (en ? `Overcast for the next 12h (max <strong>${bestDark.clear}%</strong> clear) — rest or check Clear Sky radar.` : `未來 12 小時皆偏厚雲（最高僅 <strong>${bestDark.clear}%</strong> 晴空），建議先休息或點「找晴空」。`))))
    : (en ? 'Sky stays bright over the next 12h — check back after dusk.' : '未來 12 小時天色偏亮，請於日落後再查看。');
  const hb = $('homeBest');
  if (hb) {
    hb.className = 'callout ' + (bestDark && (bestDark.score >= 35 || bestDark.block <= 40) ? 'good' : 'warn');
    hb.innerHTML = bestText;
  }

  selectForecastHour(state.selectedHourIdx >= 0 && state.selectedHourIdx < state.scoredHours.length ? state.selectedHourIdx : 0);
  render3NightOutlook(localizedNights3);
  renderCompassPanel(dirResults, pos, en);

  const pMet = $('pMet');
  if (pMet) {
    const srcLbl = (weatherSourceLabel === 'Yr.no官方' && en)
      ? 'Yr.no Official'
      : ((weatherSourceLabel === '氣象' && en) ? 'Weather' : weatherSourceLabel);
    pMet.textContent = `${srcLbl} (${hereHrs[0].time}) ↗`;
    pMet.href = usedMet
      ? `https://www.yr.no/en/forecast/daily-table/${pos.lat.toFixed(3)},${pos.lon.toFixed(3)}`
      : 'https://open-meteo.com/en/docs';
  }
  const tNow = $('clk')?.textContent || '--:--';
  setText('syncTime', (noaaOk && hereHrs.length)
    ? (en ? `Synced ${tNow}` : `已同步 ${tNow}`)
    : (en ? 'Partial sync' : '部分同步'));
}

// ====== Live Data Orchestration & Offline Recovery ======
async function refreshAll(manual) {
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
  const pos = { ...state.pos };
  const en = isEn();
  const refBtn = $('refBtn');
  if (refBtn) { refBtn.disabled = true; refBtn.classList.add('spinning'); }
  setText('pNoaa', 'NOAA...');
  setText('pMet', en ? 'Weather...' : '氣象...');

  const now = new Date();
  let moon = updateClockAndPhoto();

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
          enlilForecast: parsed
        });
        render3NightOutlook(state.renderState.nights3);
      }
    });
  }

  let noaaOk = false, metOk = false;
  try {
    const [noaa, wx] = await Promise.all([
      fetchNoaaBundle({ pos, now, signal: ctrl.signal, cachedEnlil, isCurrent, onProgress: renderNoaaSection }),
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
      const ob = $('offlineBanner'); if (ob) ob.style.display = 'none';
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
    if (isCurrent()) setText('pMet', isEn() ? 'Weather Offline' : '氣象離線');
  } finally {
    if (isCurrent()) {
      state.isRefreshing = false;
      if (noaaOk || metOk) state.lastSyncMs = Date.now();
      if (manual) toast(noaaOk && metOk ? (isEn() ? 'Forecast updated' : '已更新最新官方預報') : (isEn() ? 'Partial connection error' : '部分資料連線失敗'));
      if (refBtn) { refBtn.disabled = false; refBtn.classList.remove('spinning'); }
    }
  }
}

function handleOfflineFallback(pos) {
  const en = isEn();
  setText('pMet', en ? 'Weather Offline' : '氣象離線');
  const ob = $('offlineBanner');
  const cached = findMatchingOfflineCache(pos);
  if (!cached) {
    if (ob) {
      ob.style.display = 'block';
      ob.textContent = en
        ? `Offline: no cached forecast for ${getPosDisplayName(pos)} yet. Retry when signal returns.`
        : `網路訊號中斷：尚無「${getPosDisplayName(pos)}」的快取資料，有訊號時請點 ↻ 更新。`;
    }
    return;
  }

  const minsAgo = Math.max(1, Math.round((Date.now() - cached.ts) / 60000));
  const cachedPosLabel = getPosDisplayName(pos) || cached.posName || '';
  if (ob) {
    ob.style.display = 'block';
    ob.textContent = en
      ? `Offline: showing cached forecast from ${minsAgo} min ago (${cachedPosLabel}).`
      : `網路訊號中斷：目前顯示 ${minsAgo} 分鐘前（${cachedPosLabel}）的快取預報，有訊號時點 ↻ 更新。`;
  }

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
  togglePicker(true);
  refreshAll(true);
}

function useGPS() {
  const en = isEn();
  if (!navigator.geolocation) {
    state.pos.mode = 'gps-err'; renderLocationHeader();
    toast(en ? 'GPS not supported' : '此瀏覽器不支援 GPS');
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
      toast((isEn() ? 'Located: ' : '已定位：') + getPosDisplayName());
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
      toast(isEn() ? 'GPS permission denied' : 'GPS 權限被拒，請手動選擇地點');
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
      togglePicker(true);
      refreshAll(true);
      return;
    }
    toast(en ? 'City not found — try another spelling' : '找不到地名，可試英文拼法（如 Reykjavik）');
  } catch { toast(en ? 'Search failed' : '搜尋連線失敗'); }
}

async function shareStatus() {
  const en = isEn();
  const shareUrl = buildShareUrl(location.href, state.pos, getLang());
  const sc = state.lastScore;
  const scStr = sc ? (en ? `${sc.total}/100 (${tGrade(sc.grade)})` : `${sc.total} 分（${sc.grade}）`) : (en ? 'Updating' : '更新中');
  const title = en ? `[${getPosDisplayName()}] Aurora Viewing Score: ${scStr}` : `【${getPosDisplayName()}】極光觀測指數：${scStr}`;
  const body = en
    ? `${title}\n${$('vTitle')?.textContent || ''}\n• Sky: ${$('fSkySub')?.textContent || ''}\n• Aurora: ${$('fAurSub')?.textContent || ''}\nLive Cloud & NOAA Aurora Radar:`
    : `${title}\n${$('vTitle')?.textContent || ''}\n• 天空：${$('fSkySub')?.textContent || ''}\n• 極光：${$('fAurSub')?.textContent || ''}\n點開看即時雲層＋NOAA 極光雷達：`;
  const txt = `${body}\n${shareUrl}`;
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try { await navigator.share({ title, text: body, url: shareUrl }); return; }
    catch (err) { if (err && err.name === 'AbortError') return; }
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt)
      .then(() => toast(en ? 'Summary copied to clipboard' : '已複製分享摘要與連結'))
      .catch(() => toast(en ? 'Please copy the URL directly' : '請直接複製網址分享'));
  } else {
    toast(en ? 'Please copy the URL directly' : '請直接複製網址分享');
  }
}

// ====== Trust, Telemetry & Photo-Tips Bottom-Sheet ======
function renderTrustSheetLive(expOpt = null, scOpt = null, rawTelemetry = '') {
  const exp = expOpt || state.explainState;
  const sc = scOpt || state.renderState?.sc;
  if (!exp || !sc) return;
  state.explainState = exp;
  const en = isEn();
  const colOut = scoreCssColor(sc.color);

  setHtml('tsLiveTitle', en
    ? `Why is it <strong id="tsLiveTotal" style="color:${colOut}">${sc.total}</strong> right now? (Higher = better)`
    : `為何現在是 <strong id="tsLiveTotal" style="color:${colOut}">${sc.total}</strong> 分？（越高越好）`);
  const setCell = (id, val, col) => { const el = $(id); if (el) { el.textContent = val; el.style.color = col; } };
  setCell('tsValSky', `${sc.skyScore}%`, barColor(sc.skyScore));
  setCell('tsValAur', sc.auroraScore, barColor(sc.auroraScore));
  setCell('tsValDark', `${sc.darkScore}%`, sc.isTooBright ? 'var(--blue)' : barColor(sc.darkScore));
  setCell('tsValOut', sc.total, colOut);

  const badge = $('tsLiveBadge');
  if (badge) {
    const bCls = exp.score.statusTier === 'optimal'
      ? 'ok'
      : (exp.bottleneck.key === 'gate-low-lat' || exp.bottleneck.key === 'clouds' ? 'block' : (exp.bottleneck.key === 'gate-daylight' || exp.bottleneck.key === 'quiet-aurora' ? 'info' : 'warn'));
    badge.textContent = exp.bottleneck.label;
    badge.className = `ts-badge ${bCls}`;
  }
  setText('tsDiagTxt', `${exp.bottleneck.headline} ${exp.bottleneck.detail}`);
  setText('tsConfRow', `${exp.confidence.badgeText} · ${exp.confidence.details.join(' / ')}`);
  if (rawTelemetry) setText('tsRawRow', rawTelemetry);
  setText('tsLimitTitle', exp.disclaimer.title);
  setHtml('tsLimitList', exp.disclaimer.items.map(it => `<li>${escapeHtml(it.text)}</li>`).join(''));
}

function openTrustSheet(triggerEl) {
  state.trustTriggerEl = triggerEl || document.activeElement;
  if (state.renderState) renderFromState(state.renderState);
  updateClockAndPhoto();
  const sheet = $('trustSheet');
  if (!sheet) return;
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  $('trustCloseBtn')?.focus();
}

function closeTrustSheet() {
  const sheet = $('trustSheet');
  if (!sheet?.classList.contains('open')) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
  state.trustTriggerEl?.focus?.();
}

// Expose test helpers for automated visual verification scripts
window.__AURORA_APP__ = {
  getState: () => state.renderState,
  renderFromState,
  selectForecastHour,
  toggleRedMode,
  switchView,
  openTrustSheet,
  closeTrustSheet
};

// ====== Event Binding & Bootstrap ======
function bindEvents() {
  $('redBtn')?.addEventListener('click', toggleRedMode);
  $('langBtn')?.addEventListener('click', toggleLang);
  $('alertBtn')?.addEventListener('click', toggleAlertMode);
  $('refBtn')?.addEventListener('click', () => refreshAll(true));
  $('pickBtn')?.addEventListener('click', () => togglePicker());
  $('gpsBtn')?.addEventListener('click', useGPS);
  $('shareBtn')?.addEventListener('click', shareStatus);
  $('cityForm')?.addEventListener('submit', searchCity);
  $('ringBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('trustBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('fcConfBtn')?.addEventListener('click', (e) => openTrustSheet(e.currentTarget));
  $('vActionBtn')?.addEventListener('click', (e) => switchView(e.currentTarget?.dataset?.targetView || 'dir'));
  $('trustCloseBtn')?.addEventListener('click', closeTrustSheet);
  $('trustSheet')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeTrustSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrustSheet(); });

  const sheetHdr = document.querySelector('#trustSheet .sheet-hdr');
  const sheetPanel = document.querySelector('#trustSheet .sheet-panel');
  if (sheetHdr && sheetPanel) {
    let startY = 0, dy = 0;
    sheetHdr.addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; dy = 0; sheetPanel.style.transition = 'none'; }, { passive: true });
    sheetHdr.addEventListener('touchmove', (e) => { dy = Math.max(0, e.touches[0].clientY - startY); sheetPanel.style.transform = `translateY(${dy}px)`; }, { passive: true });
    sheetHdr.addEventListener('touchend', () => {
      sheetPanel.style.transition = '';
      sheetPanel.style.transform = '';
      if (dy > 70) closeTrustSheet();
    });
  }

  document.querySelectorAll('#presetChips .chip').forEach(btn => {
    btn.addEventListener('click', () => pickPreset(btn.dataset.zh, btn.dataset.en, parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon), btn));
  });
  document.querySelectorAll('#camChips .chip').forEach(btn => {
    btn.addEventListener('click', () => selectSkyCam(btn.dataset.cam, btn, true));
  });
  document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view, btn));
  });
  $('skyWaveChart')?.addEventListener('click', (e) => {
    const hit = e.target.closest?.('[data-hour-idx]');
    if (hit) selectForecastHour(parseInt(hit.dataset.hourIdx, 10));
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

loadSavedPrefs();
applyStaticI18n();
bindEvents();
renderLocationHeader();
updateClockAndPhoto();
registerServiceWorker();
refreshAll(false);

setInterval(updateClockAndPhoto, 30000);
setInterval(() => { if (!document.hidden || state.alertEnabled) refreshAll(false); }, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    updateClockAndPhoto();
    if (state.alertEnabled && navigator.wakeLock && !state.wakeLockObj) {
      navigator.wakeLock.request('screen').then(wl => { state.wakeLockObj = wl; }).catch(() => {});
    }
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
