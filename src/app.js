/**
 * Nordic Aurora Radar — Browser UI Controller & Live Data Orchestrator
 *
 * Connects the pure scientific engine (src/aurora-engine.js) and SVG builders
 * (src/charts.js) to the DOM, live upstream APIs, Red-Light night-vision mode,
 * alert notifications, URL bar sync, and offline PWA cache.
 */

import * as Engine from './aurora-engine.js';
import * as Charts from './charts.js';

const {
  detectDefaultLang, getLang, setLang, isEn, tSky, tDirLabel, tGrade,
  isInNordicMetBox, computeCompassPoints, getZoneParts, formatReverseGeo,
  parseUrlLocation, buildShareUrl, computeSolarElevation, getMoonState,
  computeViewingGeometry, classifyViewingMode, computeMLT,
  computeDataLagMin, computeBallisticCoupling, computeAuroraScore,
  parseMagSeries, parseWindSeries, parseKpForecast, lookupForecastKp,
  parseLatestKp, lookupOvationProb, parseHemiPower, parseGoesSubstorm, mergeGoesSubstorm,
  parseGeospacePredKp1h, parseNoaaAlerts, parseNoaaGeomagneticScales,
  parseMetNorwayHourly12, parseMetNorwayMultiDay,
  parseOpenMeteoHourly12, parseOpenMeteoMultiDay, evaluateCloudConsensus, scoreHourlyForecast12,
  findBestDarkWindow, summarize3NightOutlook, evaluateVerdict,
  summarizeEnergyTrend, summarizeCompass, shouldTriggerAuroraAlert,
  utcTagToLocalHM
} = Engine;

const {
  buildSkySceneSVG, buildBzChartSVG, buildSkyWaveSVG, buildCompassRadarSVG
} = Charts;

// Expose pure modules on window for automated VLM / browser console inspection
window.__AURORA_SCI_TEST__ = { ...Engine, ...Charts };

// ====== Application State ======
let currentPos = {
  name: '挪威・Alta', nameEn: 'Norway · Alta',
  lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo',
  mode: 'manual', accuracy: null
};
let lastScore = null;
let lastSyncMs = 0;
let lastScoredHours = [];
let lastBestAurora = null;
let lastSelectedHourIdx = 0;
let lastRenderState = null;
let alertEnabled = false;
let redModeEnabled = false;
let lastAlertMs = 0;
let wakeLockObj = null;
let refreshSeq = 0;
let currentCamKey = 'uit';
let toastTimer = null;

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const metCache = new Map();

const SKY_CAMS = {
  uit: {
    url: 'https://fox.phys.uit.no/ASC/Latest_ASC01.png',
    page: 'https://fox.phys.uit.no/ASC/',
    capZh: '資料來源：挪威北極大學 UiT 全天空極光相機（Skibotn 天文台，約每分鐘實拍）',
    capEn: 'Source: UiT Tromsø Geophysical Observatory All-Sky Camera (Skibotn, ~1 min live)'
  },
  irf: {
    url: 'https://www.irf.se/alis/allsky/krn/latest_medium.jpeg',
    page: 'https://www.irf.se/alis/allsky/krn/',
    capZh: '資料來源：瑞典空間物理研究所 IRF Kiruna 全天空相機（約每分鐘實拍）',
    capEn: 'Source: Swedish Institute of Space Physics (IRF Kiruna) Live All-Sky Camera'
  },
  sgo: {
    url: 'https://www.sgo.fi/Data/RealTime/Kuvat/UCL.jpg',
    page: 'https://www.sgo.fi/Data/RealTime/allsky.php',
    capZh: '資料來源：芬蘭索丹屈萊天文台 SGO 全天空相機（約每分鐘實拍）',
    capEn: 'Source: Sodankylä Geophysical Observatory (SGO Finland) Live All-Sky Camera'
  },
  kho: {
    url: 'https://kho.unis.no/Quicklooks/kho_sony.jpg',
    page: 'https://kho.unis.no/',
    capZh: '資料來源：挪威斯瓦巴群島 KHO 極地天文台 Sony 全彩極光相機（78°N 即時實拍）',
    capEn: 'Source: Kjell Henriksen Observatory (KHO Svalbard 78°N) Live All-Sky Camera'
  },
  fmi: {
    url: 'https://cdn.fmi.fi/weather-observations/products/magnetic-disturbance-observations/map-latest-en.png',
    page: 'https://en.ilmatieteenlaitos.fi/auroras-and-space-weather',
    capZh: '資料來源：芬蘭氣象局 FMI 北歐地面磁力儀即時擾動圖（橘／紅點＝當地正發生副磁暴）',
    capEn: 'Source: Finnish Meteorological Institute (FMI) Live Nordic Ground Magnetometer Map'
  }
};

const $ = (id) => document.getElementById(id);

function getPosDisplayName() {
  return isEn() ? (currentPos.nameEn || currentPos.name) : currentPos.name;
}

function toast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/** Keep address bar synchronized with selected city & language so copying URL always works */
function syncBrowserUrl() {
  try {
    if (typeof history !== 'undefined' && location.protocol.startsWith('http')) {
      const nextUrl = buildShareUrl(location.href, currentPos, getLang());
      if (nextUrl !== location.href) history.replaceState(null, '', nextUrl);
    }
  } catch (e) {}
}

// ====== Red-Light Night-Vision Mode ======
function applyRedModeUI() {
  document.body.classList.toggle('red-mode', redModeEnabled);
  const btn = $('redBtn');
  if (btn) btn.classList.toggle('red-on', redModeEnabled);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', redModeEnabled ? '#040000' : '#040912');
}

function toggleRedMode() {
  redModeEnabled = !redModeEnabled;
  try { localStorage.setItem('aurora_red_v1', redModeEnabled ? '1' : '0'); } catch (e) {}
  applyRedModeUI();
  toast(redModeEnabled
    ? (isEn() ? 'Red-light night vision ON' : '已開啟紅光夜視模式（保護暗適應）')
    : (isEn() ? 'Red-light night vision OFF' : '已關閉紅光夜視模式'));
}

// ====== Bilingual Static UI Strings & Glossary ======
function renderSkyCamCaption(key) {
  const cap = $('skyCamCap');
  const cam = SKY_CAMS[key];
  if (!cap || !cam) return;
  const txt = isEn() ? cam.capEn : cam.capZh;
  cap.innerHTML = `<a class="src-link" target="_blank" rel="noopener noreferrer" href="${cam.page}">${txt} ↗</a>`;
}

function applyStaticI18n() {
  const en = isEn();
  document.documentElement.lang = en ? 'en' : 'zh-Hant';
  document.title = en ? 'Nordic Aurora Radar · Live Global Forecast' : '極光即時雷達｜北歐＆全球即時預報';
  const setT = (id, zh, enT) => { const el = $(id); if (el) el.textContent = en ? enT : zh; };

  setT('brandTxt', '極光即時雷達', 'Aurora Radar');
  setT('langBtn', 'EN', '中');
  const redBtn = $('redBtn');
  if (redBtn) {
    const lbl = en ? 'Red-light night vision' : '紅光夜視模式';
    redBtn.title = lbl; redBtn.setAttribute('aria-label', lbl);
  }
  const alertBtn = $('alertBtn');
  if (alertBtn) {
    const lbl = en ? 'Aurora alerts' : '達標自動提醒';
    alertBtn.title = lbl; alertBtn.setAttribute('aria-label', lbl);
  }
  const refBtn = $('refBtn');
  if (refBtn) {
    const lbl = en ? 'Sync now' : '立即更新';
    refBtn.title = lbl; refBtn.setAttribute('aria-label', lbl);
  }
  setT('lineTip', '若在 App 內建瀏覽器無法使用 GPS，請改用 Safari / Chrome 開啟，或直接點上方地名切換。', 'If GPS is blocked in an in-app browser, open in Safari/Chrome or tap the city name above.');
  setT('gpsBtn', 'GPS', 'GPS');
  setT('shareBtn', '分享', 'Share');
  const ci = $('cityInput');
  if (ci) ci.placeholder = en ? 'Search city (e.g. Reykjavik, Fairbanks, Hobart)' : '輸入英文地名（例：Reykjavik, Fairbanks, Hobart）';
  setT('searchBtn', '搜尋', 'Go');
  setT('ringSubLbl', '觀測指數', 'Score');
  setT('fSkyLbl', '晴空率', 'Clear Sky');
  setT('fAurLbl', '極光活動', 'Aurora');
  setT('fDarkLbl', '夜空暗度', 'Darkness');
  setT('h2Energy', '太陽風能量走勢（含提前預告）', 'Solar Wind Arrival');
  setT('h2Wave', '未來 12 小時晴空與極光預報', '12-Hour Forecast');
  const hrl = $('hrLegLeft');
  if (hrl) {
    hrl.innerHTML = en
      ? `<span class="leg-dot" style="background:var(--green);"></span>Clear Sky % ｜ <span class="leg-dot" style="background:#a855f7;"></span>Viewing Score`
      : `<span class="leg-dot" style="background:var(--green);"></span>綠線＝晴空率 % ｜ <span class="leg-dot" style="background:#a855f7;"></span>紫柱＝觀測指數`;
  }
  setT('hrLegRight', '每 2 小時刻度・點圖表查看單小時', '2h ticks · Tap hour to inspect');
  setT('h2Outlook', '未來 3 晚極光與晴空展望', '3-Night Outlook');
  setT('outlookSub', 'NOAA 72h Kp 預報 · 官方夜間分層雲量（僅計太陽低於 -4°）', 'NOAA 72h Kp forecast · Official dark-sky clouds (sun < -4°)');
  setT('h2Radar', '周邊 360° 晴空雷達', '360° Clear-Sky Radar');
  const rl = $('radarLeg');
  if (rl) {
    rl.innerHTML = en
      ? `<span><span class="leg-dot" style="background:var(--green);"></span>Clear ≤35%</span><span><span class="leg-dot" style="background:var(--amber);"></span>Partly 36–65%</span><span><span class="leg-dot" style="background:var(--red);"></span>Overcast >65%</span>`
      : `<span><span class="leg-dot" style="background:var(--green);"></span>晴朗 ≤35%</span><span><span class="leg-dot" style="background:var(--amber);"></span>局部多雲 36–65%</span><span><span class="leg-dot" style="background:var(--red);"></span>陰天厚雲 >65%</span>`;
  }
  setT('h2Windy', '即時動態雲圖', 'Live Cloud Map');
  setT('subWindy', '已自動對準目前位置，按左下角 ▶ 可播放接下來幾小時雲層移動趨勢：', 'Centered on your location — press ▶ bottom-left to animate cloud movement:');
  setT('h2Cam', '北歐天文台即時全天空相機', 'Arctic All-Sky Cameras');
  setT('subCam', '約每分鐘由極圈天文台實拍上傳，可直接肉眼確認現場雲量與極光：', 'Live photos uploaded ~every minute from Arctic observatories:');
  setT('camBtnUit', '挪威 UiT', 'Norway UiT');
  setT('camBtnIrf', '瑞典 Kiruna', 'Sweden Kiruna');
  setT('camBtnSgo', '芬蘭 Sodankylä', 'Finland SGO');
  setT('camBtnKho', '斯瓦巴 KHO', 'Svalbard KHO');
  setT('camBtnFmi', 'FMI 北歐地磁', 'FMI Nordic Mag');
  setT('subOv', '查看綠色／黃色極光帶目前是否覆蓋所在區域（每 5 分鐘自動更新）：', 'Check if the auroral oval covers your region (updates every 5 min):');

  const ovCapEl = $('ovCap');
  if (ovCapEl) {
    const ovTxt = en
      ? 'Source: NOAA SWPC OVATION Live Model (Green = aurora, Yellow/Red = intense)'
      : '資料來源：NOAA SWPC OVATION 即時模型（綠色＝有極光、黃紅＝強爆發）';
    ovCapEl.innerHTML = `<a class="src-link" target="_blank" rel="noopener noreferrer" href="https://www.spaceweather.gov/products/aurora-30-minute-forecast">${ovTxt} ↗</a>`;
  }
  setT('h2Tools', '官方資料來源', 'Official Data Sources');
  setT('linkWindy', 'Windy 全螢幕 ↗', 'Windy Fullscreen ↗');
  setT('linkYr', '挪威 Yr.no ↗', 'Norway Yr.no ↗');
  setT('linkTgo', '挪威即時地磁站 ↗', 'UiT Magnetometer ↗');
  setT('linkNoaa', 'NOAA Kp 指數 ↗', 'NOAA Kp Index ↗');
  setT('linkSolarWind', 'NOAA 太陽風 ↗', 'NOAA Solar Wind ↗');
  setT('linkGfz', 'GFZ Hp30 指數 ↗', 'GFZ Hp30 Index ↗');
  setT('h2Glossary', '指標說明與資料性質（實測 vs 模型）', 'Metrics & Data Guide (Live vs Model)');
  setT('h2Legal', '資料授權與安全免責聲明', 'Data Attribution & Safety Disclaimer');
  setT('navHome', '即時總覽', 'Overview');
  setT('navDir', '晴空雷達', 'Radar');
  setT('navSat', '動態雲圖', 'Live Map');
  setT('navTips', '拍照/工具', 'Photo');

  const gb = $('glossaryBody');
  if (gb) {
    gb.innerHTML = en
      ? `<div class="gl-group"><span class="gl-badge gl-obs">LIVE OBS</span> Real-Time Satellite & Ground Telemetry</div>` +
        `• <strong>Solar Wind Satellite (Bz / Speed / Pressure)</strong>: Direct measurements from NOAA's upstream satellite (~1.5M km sunward at L1), reaching Earth in ~8–95 min as an advance preview. Sustained negative <strong>Bz</strong> (southward) drives aurora.<br/>` +
        `• <strong>Global Kp (1-min est.)</strong>: Real-time planetary geomagnetic disturbance index (0–9). Oval cities can see aurora even at Kp 0–2.<br/>` +
        `• <strong>Dual GOES + FMI Ground Mag & Cams</strong>: East/West GOES substorm sensors, FMI Nordic ground magnetometer map, and live Arctic sky cams.<br/>` +
        `<div class="gl-group"><span class="gl-badge gl-mod">MODEL</span> Forecasts, Geometry & Eye vs Camera</div>` +
        `• <strong>NOAA Geospace 1h Kp & OVATION %</strong>: Physics-based MHD 1-hour Kp prediction plus overhead aurora probability.<br/>` +
        `• <strong>Azimuth & Elevation</strong>: Computed toward the true geomagnetic pole (e.g. NNW in Nordics, NNE in Alaska, SSW in NZ) using spherical Earth geometry (120–300 km altitude).<br/>` +
        `• <strong>Naked Eye vs Camera</strong>: Weak/low-horizon aurora looks faint grey to human rod cells, whereas 3–10s smartphone Night Mode reveals bright green/red first.<br/>` +
        `• <strong>Viewing Score (0–99)</strong>: Composite reference combining layered Clear Sky %, Aurora Activity, and astronomical Darkness.`
      : `<div class="gl-group"><span class="gl-badge gl-obs">即時實測</span> 衛星與地面天文台實測資料</div>` +
        `• <strong>太陽風衛星實測（Bz／風速／動壓）</strong>：由位於日地間（L1 拉格朗日點，距地球約 150 萬公里）的 NOAA 衛星實測，約 8–95 分鐘後抵達地球，可作為提前預告。<strong>Bz 持續為負（南向）</strong>最容易觸發極光。<br/>` +
        `• <strong>全球 Kp（1 分鐘即時估計）</strong>：全球地磁擾動指標（0–9）。位於極光帶內的城市即使 Kp 0–2 仍有機會看見極光。<br/>` +
        `• <strong>雙區 GOES 磁力儀與北歐地磁／實拍</strong>：同時監測東西半球同步軌道副磁暴，並提供 FMI 北歐地面磁力儀擾動圖與極圈天文台實拍。<br/>` +
        `<div class="gl-group"><span class="gl-badge gl-mod">模型與實測對照</span> 方位角、仰角與肉眼／相機差異</div>` +
        `• <strong>NOAA Geospace 1 小時預報與 OVATION %</strong>：結合物理磁層模式未來 1 小時 Kp 預報與天頂極光機率。<br/>` +
        `• <strong>方位角與仰角</strong>：依真實地磁極方向計算（例如北歐偏北北西、阿拉斯加偏北北東、紐西蘭偏南南西），並考量極光 120–300 km 高度。<br/>` +
        `• <strong>肉眼 vs 相機</strong>：微弱或低空極光對人眼桿狀細胞常呈淡灰霧，而手機夜間模式長曝 3–10 秒能優先拍出鮮明綠／紅光。<br/>` +
        `• <strong>觀測指數（0–99 分）</strong>：綜合分層晴空率、極光活動與夜空暗度（暮光與月光反照效應）計算的即時參考分數。`;
  }
  const lb = $('legalBody');
  if (lb) {
    lb.innerHTML = en
      ? `• Weather: <a href="https://api.met.no/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">MET Norway (Yr.no)</a> (CC BY 4.0 / NLOD 2.0), <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">Open-Meteo</a> (CC BY 4.0, non-commercial)<br/>` +
        `• Space Weather: <a href="https://www.spaceweather.gov/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">NOAA SWPC</a> (Public Domain); Reference: <a href="https://kp.gfz.de/en/hp30-hp60" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">GFZ Potsdam Hp30</a><br/>` +
        `• Cams & Ground Mag: <a href="https://flux.phys.uit.no/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">UiT TGO</a>, <a href="https://www.irf.se/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">IRF Kiruna</a>, <a href="https://www.sgo.fi/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">SGO</a>, <a href="https://kho.unis.no/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">KHO Svalbard</a>, <a href="https://en.ilmatieteenlaitos.fi/auroras-and-space-weather" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">FMI</a>; Cloud map: <a href="https://www.windy.com/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">Windy.com</a><br/>` +
        `• <strong>Privacy & Security</strong>: 100% open-source static web app, zero cookies/tracking, strict CSP allowlist. Coordinates stay in your browser only.`
      : `• 氣象預報：<a href="https://api.met.no/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">MET Norway (Yr.no)</a>（CC BY 4.0 / NLOD 2.0）、<a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">Open-Meteo</a>（CC BY 4.0，限非商業用途）<br/>` +
        `• 太空天氣：<a href="https://www.spaceweather.gov/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">NOAA SWPC</a>（美國政府公領域）；參考：<a href="https://kp.gfz.de/en/hp30-hp60" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">GFZ Potsdam Hp30</a><br/>` +
        `• 實拍與地磁：<a href="https://flux.phys.uit.no/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">UiT TGO</a>、<a href="https://www.irf.se/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">IRF Kiruna</a>、<a href="https://www.sgo.fi/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">SGO</a>、<a href="https://kho.unis.no/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">斯瓦巴 KHO</a>、<a href="https://en.ilmatieteenlaitos.fi/auroras-and-space-weather" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">芬蘭 FMI</a>；雲圖：<a href="https://www.windy.com/" target="_blank" rel="noopener noreferrer" style="color:var(--blue);">Windy.com</a><br/>` +
        `• <strong>隱私與安全</strong>：100% 開源純靜態網頁（MIT License）、零 Cookie 與追蹤碼、嚴格 CSP 白名單，定位僅留於本機瀏覽器。僅供個人觀星參考，北極冬季行車請遵守當地交通管制。`;
  }
  renderSkyCamCaption(currentCamKey);
  const ovH = $('ovHeading');
  if (ovH) {
    ovH.textContent = currentPos.lat >= 0
      ? (en ? 'NOAA Northern Hemisphere Aurora Oval' : 'NOAA 北半球即時極光橢圓圖')
      : (en ? 'NOAA Southern Hemisphere Aurora Oval' : 'NOAA 南半球即時極光橢圓圖');
  }
}

function toggleLang() {
  setLang(isEn() ? 'zh' : 'en');
  try { localStorage.setItem('aurora_lang_v4', getLang()); } catch (e) {}
  applyStaticI18n();
  renderLocationHeader();
  updateClockAndPhoto();
  if (lastRenderState) renderFromState(lastRenderState);
  syncBrowserUrl();
  toast(isEn() ? 'Switched to English' : '已切換為繁體中文');
}

// ====== Alerts & Audio ======
function playAuroraChime() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.16);
      gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + i * 0.16 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.16 + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.16);
      osc.stop(ctx.currentTime + i * 0.16 + 0.5);
    });
  } catch (e) {}
}

async function toggleAlertMode() {
  alertEnabled = !alertEnabled;
  const btn = $('alertBtn');
  const en = isEn();
  if (alertEnabled) {
    btn.classList.add('alert-on');
    playAuroraChime();
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    try { if (navigator.wakeLock) wakeLockObj = await navigator.wakeLock.request('screen'); } catch (e) {}
    toast(en ? 'Alerts ON — keep screen unlocked/plugged in for web polling' : '已開啟提醒（網頁版請保持螢幕未鎖定或插電常亮）');
  } else {
    btn.classList.remove('alert-on');
    try { if (wakeLockObj) { await wakeLockObj.release(); wakeLockObj = null; } } catch (e) {}
    toast(en ? 'Alerts turned off' : '已關閉自動提醒');
  }
}

function maybeTriggerAlert(sc, goesSub, scNext, bal) {
  if (!alertEnabled) return;
  const check = shouldTriggerAuroraAlert({ sc, goesSub, scNext, bal });
  if (!check.fire) return;
  if (Date.now() - lastAlertMs < 15 * 60 * 1000) return;
  lastAlertMs = Date.now();
  playAuroraChime();
  if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 350]);
  const en = isEn();
  const msgMap = {
    score: en ? `${getPosDisplayName()} Viewing Score reached ${sc.total}! Head outside.` : `${getPosDisplayName()} 觀測指數達 ${sc.total} 分，適合出門觀測！`,
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
  } catch (e) {}
}

// ====== Location, Picker, Tabs & Photo Tips ======
function loadSavedPrefs() {
  setLang(detectDefaultLang());
  try { redModeEnabled = localStorage.getItem('aurora_red_v1') === '1'; } catch (e) {}
  applyRedModeUI();
  const urlPos = parseUrlLocation(location.search);
  if (urlPos) {
    currentPos = { ...currentPos, ...urlPos };
  } else {
    try {
      const sp = JSON.parse(localStorage.getItem('aurora_pos_v2') || 'null');
      if (sp && Number.isFinite(sp.lat) && Number.isFinite(sp.lon)) currentPos = { ...currentPos, ...sp };
    } catch (e) {}
  }
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
      && Math.abs(plat - currentPos.lat) < 0.03 && Math.abs(plon - currentPos.lon) < 0.03;
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

function selectSkyCam(key, btn) {
  if (!SKY_CAMS[key]) return;
  currentCamKey = key;
  if (btn) {
    document.querySelectorAll('#camChips .chip').forEach(c => c.classList.remove('on'));
    btn.classList.add('on');
  }
  const img = $('skyCamImg');
  if (img) img.src = `${SKY_CAMS[key].url}?t=${Date.now()}`;
  renderSkyCamCaption(key);
}

function syncSatTab() {
  const wf = $('windyFrame');
  if (!wf) return;
  const target = `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=%C2%B0C&overlay=clouds&lat=${currentPos.lat.toFixed(3)}&lon=${currentPos.lon.toFixed(3)}&zoom=7`;
  if (wf.src !== target) wf.src = target;
  const hemi = currentPos.lat >= 0 ? 'north' : 'south';
  const en = isEn();
  $('ovHeading').textContent = currentPos.lat >= 0
    ? (en ? 'NOAA Northern Hemisphere Aurora Oval' : 'NOAA 北半球即時極光橢圓圖')
    : (en ? 'NOAA Southern Hemisphere Aurora Oval' : 'NOAA 南半球即時極光橢圓圖');
  $('ovationImg').src = `https://services.swpc.noaa.gov/images/animations/ovation/${hemi}/latest.jpg?t=${Date.now()}`;
  const camCard = $('skyCamCard');
  if (camCard) camCard.style.display = currentPos.lat >= 0 ? 'block' : 'none';
  if (currentPos.lat >= 0) selectSkyCam(currentCamKey);
}

function switchView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('on'));
  const target = $('v-' + name);
  if (target) target.classList.add('on');
  if (btn) btn.classList.add('on');
  if (name === 'sat') syncSatTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLocationHeader() {
  const en = isEn();
  $('locName').textContent = getPosDisplayName();
  const latS = `${Math.abs(currentPos.lat).toFixed(2)}°${currentPos.lat >= 0 ? 'N' : 'S'}`;
  const lonS = `${Math.abs(currentPos.lon).toFixed(2)}°${currentPos.lon >= 0 ? 'E' : 'W'}`;
  const clkNow = $('clk')?.textContent || '--:--';
  const dotCls = currentPos.mode === 'gps' ? 'live' : (currentPos.mode === 'gps-err' ? 'err' : 'manual');
  const modeTxt = currentPos.mode === 'gps'
    ? (en ? `GPS${currentPos.accuracy ? ` ±${Math.round(currentPos.accuracy)}m` : ''}` : `GPS 鎖定${currentPos.accuracy ? ` ±${Math.round(currentPos.accuracy)}m` : ''}`)
    : (currentPos.mode === 'gps-err' ? (en ? 'GPS Denied' : 'GPS 未授權') : (en ? 'Manual' : '手動地點'));
  $('locMeta').innerHTML = `<span id="gpsDot" class="gps-dot ${dotCls}"></span><span>${modeTxt}</span> · ${latS}, ${lonS} · ${en ? 'Local' : '當地'} <span id="clk">${clkNow}</span>`;

  syncPresetChipHighlight();
  const windyUrl = `https://www.windy.com/${currentPos.lat.toFixed(3)}/${currentPos.lon.toFixed(3)}?clouds,${currentPos.lat.toFixed(3)},${currentPos.lon.toFixed(3)},8`;
  const yrUrl = `https://www.yr.no/en/forecast/daily-table/${currentPos.lat.toFixed(3)},${currentPos.lon.toFixed(3)}`;
  $('linkWindy').href = windyUrl;
  const we = $('windyExtLink');
  if (we) we.href = windyUrl;
  $('linkYr').href = yrUrl;
  const pm = $('pMet');
  if (pm) pm.href = isInNordicMetBox(currentPos.lat, currentPos.lon) ? yrUrl : 'https://open-meteo.com/en/docs';
  if ($('v-sat')?.classList.contains('on')) syncSatTab();
  try { localStorage.setItem('aurora_pos_v2', JSON.stringify(currentPos)); } catch (e) {}
}

function updateClockAndPhoto() {
  const now = new Date();
  const en = isEn();
  try {
    const z = getZoneParts(now, currentPos.tz);
    const clk = $('clk');
    if (clk) clk.textContent = `${z.hourStr}:${z.minStr}`;
  } catch (e) {}

  const moon = getMoonState(now, currentPos.lat, currentPos.lon);
  const liveKp = Math.max(lastRenderState?.kp ?? 2, lastRenderState?.sc?.effKp ?? 0);
  const geom = computeViewingGeometry({
    lat: currentPos.lat, lon: currentPos.lon, kp: liveKp,
    mlt: computeMLT(now, currentPos.lat, currentPos.lon)
  });
  const modeInfo = classifyViewingMode({ scoreObj: lastRenderState?.sc, geom, effMoonPct: moon.effMoonPct });
  const aimTxt = geom.mode === 'below'
    ? (en ? `${geom.direction} low horizon (during storms)` : `${geom.direction} 低空地平線（磁暴期間）`)
    : geom.shortText;
  const eyeNote = modeInfo.text
    ? (en ? `Current expectation: <strong>${modeInfo.text}</strong>.` : `目前觀測體感：<strong>${modeInfo.text}</strong>。`)
    : (en ? 'If a faint white haze appears, take a test shot — phones reveal green/red aurora first.' : '肉眼若只看到淡白霧先拍一張，手機會率先顯現綠／紅光。');

  const steps = moon.effMoonPct >= 55
    ? (en ? [
        'Flash OFF, Night Mode ON — keep exposure at <strong>2–3 seconds</strong> (longer washes out).',
        `Keep the moon behind you — framing: <strong>${aimTxt}</strong>.`,
        `Tap sky & lower exposure slightly. ${eyeNote}`
      ] : [
        '關閃光燈、開夜間模式，<strong>秒數壓在 2–3 秒</strong>（設太久會過曝白掉）。',
        `背對月亮、避開路燈，取景方位：<strong>${aimTxt}</strong>。`,
        `點天空稍微拉暗曝光；${eyeNote}`
      ])
    : (en ? [
        'Flash OFF, Night Mode ON — use <strong>5–10 seconds</strong> (hold steady or use a tripod/rail).',
        `Step away from streetlights — framing: <strong>${aimTxt}</strong>.`,
        `${eyeNote}`
      ] : [
        '關閃光燈、開夜間模式，<strong>秒數設 5–10 秒</strong>（手拿穩、靠欄杆或上腳架）。',
        `避開路燈，取景方位：<strong>${aimTxt}</strong>。`,
        `${eyeNote}`
      ]);

  const reason = moon.effMoonPct >= 55
    ? (en ? `Bright Moon · Alt ${Math.round(moon.altDeg)}°` : `月光較亮 · 仰角 ${Math.round(moon.altDeg)}°`)
    : (!moon.up ? (en ? 'Moon Down' : '月亮已落下') : (en ? `Dark Sky · Moon Lux ${moon.effMoonPct}%` : `暗空夜 · 月光影響 ${moon.effMoonPct}%`));
  $('photoHeading').textContent = en ? `Phone Photo Guide (${reason})` : `手機拍極光指引（${reason}）`;
  $('photoBody').innerHTML = `<ol class="photo-steps">${steps.map((s, i) => `<li><span class="step-num">0${i + 1}</span><span>${s}</span></li>`).join('')}</ol>`;
  return moon;
}

// ====== Gauges, Charts & State Rendering ======
function barColor(score) { return score >= 65 ? 'var(--green)' : score >= 35 ? 'var(--amber)' : 'var(--red)'; }
function scoreCssColor(hex) {
  if (hex === '#34f0b0') return 'var(--green)';
  if (hex === '#ffcf5c') return 'var(--amber)';
  if (hex === '#66bdff') return 'var(--blue)';
  return 'var(--red)';
}

function renderGauge(sc, details) {
  lastScore = sc;
  const en = isEn();
  const circ = 2 * Math.PI * 52;
  const visPct = sc.total === 0 ? 5 : sc.total;
  const ringCol = scoreCssColor(sc.color);
  const prog = $('ringProg');
  prog.style.strokeDasharray = circ.toFixed(1);
  prog.style.strokeDashoffset = (circ * (1 - visPct / 100)).toFixed(1);
  prog.style.stroke = ringCol;
  prog.style.filter = `drop-shadow(0 0 8px ${sc.color}88)`;

  $('ringNum').textContent = sc.total;
  $('ringNum').style.color = ringCol;
  $('ringGrade').textContent = tGrade(sc.grade).replace(/^[^\p{L}\p{N}]+\s*/u, '');
  $('ringGrade').style.color = ringCol;

  const setF = (vid, bid, sid, pct, lbl, sub, forceC) => {
    const c = forceC || barColor(pct);
    const ve = $(vid);
    ve.textContent = lbl; ve.style.color = c;
    const be = $(bid);
    be.style.width = `${Math.max(6, pct)}%`; be.style.background = c;
    $(sid).textContent = sub;
  };
  setF('fSkyVal', 'fSkyBar', 'fSkySub', sc.skyScore, `${sc.skyScore}%`, details.skySub);
  setF('fAurVal', 'fAurBar', 'fAurSub', sc.auroraScore, en ? `${sc.auroraScore}` : `${sc.auroraScore}分`, details.aurSub);
  setF('fDarkVal', 'fDarkBar', 'fDarkSub', sc.darkScore, details.isTooBright ? (en ? 'Bright' : '尚亮') : `${sc.darkScore}%`, details.darkSub, details.isTooBright ? 'var(--blue)' : null);
}

function selectForecastHour(idx) {
  if (!lastScoredHours.length || idx < 0 || idx >= lastScoredHours.length) return;
  lastSelectedHourIdx = idx;
  const en = isEn();
  const h = lastScoredHours[idx];
  $('skyWaveChart').innerHTML = buildSkyWaveSVG(lastScoredHours, lastBestAurora, idx);
  const tInt = Math.round(h.temp) || 0;
  const wcInt = Math.round(h.windChill ?? h.temp) || 0;
  const wcTxt = (tInt - wcInt >= 3) ? (en ? ` (Feels ${wcInt > 0 ? '+' : ''}${wcInt}°C)` : `（體感 ${wcInt > 0 ? '+' : ''}${wcInt}°C）`) : '';
  const moonTxt = h.isDay
    ? (en ? 'Too bright' : '天色過亮')
    : (h.moonUp ? (en ? `Moon ${h.moonPct}%` : `月相 ${h.moonPct}%`) : (en ? 'Moon down' : '月亮落下'));
  const det = $('hourDetail');
  if (det) {
    const kpStr = Number.isFinite(h.kpFc) ? h.kpFc.toFixed(2) : h.kpFc;
    det.innerHTML = en
      ? `<span><strong>${h.time}</strong> · Score <strong>${h.score}</strong> · Clear ${h.clear}% (${tSky(h.txt, 'en')})</span><span>${tInt > 0 ? '+' : ''}${tInt}°C${wcTxt} · ${moonTxt} · Kp ${kpStr}</span>`
      : `<span><strong>${h.time}</strong>｜指數 <strong>${h.score}分</strong>｜晴空 ${h.clear}%（${h.txt.replace(/^[^\p{L}\p{N}]+\s*/u, '')}）</span><span>${tInt > 0 ? '+' : ''}${tInt}°C${wcTxt} · ${moonTxt} · Kp ${kpStr}</span>`;
  }
}

function renderStormBanner(scales, noaaAlert) {
  const el = $('stormBanner');
  if (!el) return;
  const en = isEn();
  const hasAlert = noaaAlert && noaaAlert.active;
  const hasScale = scales && scales.active;
  if (!hasAlert && !hasScale) {
    el.style.display = 'none';
    return;
  }
  const gNamesZh = { 1: '輕度', 2: '中度', 3: '強烈', 4: '嚴重', 5: '極端' };
  const gNamesEn = { 1: 'Minor', 2: 'Moderate', 3: 'Strong', 4: 'Severe', 5: 'Extreme' };
  if (hasAlert && (noaaAlert.kind === 'cme-shock' || noaaAlert.gScale >= (scales?.currentScale || 0))) {
    const lvl = Math.max(1, noaaAlert.gScale || 1);
    el.className = 'storm-banner' + (lvl >= 3 || noaaAlert.kind === 'cme-shock' ? ' severe' : '');
    el.style.display = 'flex';
    const isShock = noaaAlert.kind === 'cme-shock';
    const pill = isShock ? 'CME SHOCK' : `NOAA G${lvl}`;
    const txt = isShock
      ? (en ? 'SWPC Geomagnetic Sudden Impulse — CME shock arrived' : 'NOAA 官方警報：CME 衝擊波抵達地球（短時間內易爆發）')
      : (en ? `SWPC K=${noaaAlert.kLevel} Storm Alert Active` : `NOAA 官方即時警報：達 K=${noaaAlert.kLevel}（G${lvl}）地磁風暴`);
    el.innerHTML = `<span><span class="storm-pill">${pill}</span>${txt}</span><span style="opacity:0.75;">↗</span>`;
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
  el.innerHTML = `<span><span class="storm-pill">NOAA G${lvl}</span>${txt}</span><span style="opacity:0.75;">↗</span>`;
}

function render3NightOutlook(nights) {
  const grid = $('outlookGrid');
  if (!grid || !Array.isArray(nights)) return;
  const en = isEn();
  const bestIdx = nights.findIndex(n => n.tone === 'good');
  grid.innerHTML = nights.map((n, i) => {
    const clearTxt = n.bestClear !== null ? (en ? `Clear ${n.bestClear}%` : `最佳晴空 ${n.bestClear}%`) : (en ? 'No dark hrs' : '無暗空');
    const kpTxt = `Kp ${n.maxKp.toFixed(1)}${n.gScale >= 1 ? ` · G${n.gScale}` : ''}`;
    const bCol = n.badgeColor?.startsWith('#') ? scoreCssColor(n.badgeColor) : (n.badgeColor || 'var(--muted)');
    return `<div class="outlook-day ${i === bestIdx ? 'od-best' : ''}">
      <div class="od-date">${n.label}</div>
      <div class="od-badge" style="color:${bCol};"><span class="leg-dot" style="background:${bCol};margin-right:2px;"></span>${n.badge}</div>
      <div class="od-stat">${clearTxt}<br/>${kpTxt}</div>
    </div>`;
  }).join('');
}

function renderFromState(st) {
  if (!st) return;
  const en = isEn();
  const {
    magSeries, chartSeries, speed, bz, kp, ovation, hpiGw, goesSub, noaaScales, noaaAlert, bal,
    noaaOk, noaaLagMin, hereHrs, dirResults, weatherSourceLabel, usedMet, cloudConsensus,
    sunAltNow, mltNow, moon, sc, scNext, bestDark, nights3
  } = st;

  renderStormBanner(noaaScales, noaaAlert);

  // Energy card
  const enSum = summarizeEnergyTrend(chartSeries, speed, bal);
  const eb = $('energyBanner');
  eb.className = 'callout ' + (enSum.good || goesSub?.active || bal.shockActive ? 'good' : 'warn');
  eb.textContent = goesSub?.active
    ? (en ? `Magnetotail substorm onset (GOES +${goesSub.jumpNt} nT) — aurora may brighten suddenly.` : `偵測到磁尾副磁暴釋放（GOES +${goesSub.jumpNt} nT），極光可能短時間內明顯增強。`)
    : (bal.shockActive
        ? (en ? `Solar wind pressure shock (${bal.pdyn} nPa) — potential burst in ~${bal.etaMin} min.` : `偵測到太陽風動壓衝擊（${bal.pdyn} nPa），約 ${bal.etaMin} 分鐘後可能觸發極光增強。`)
        : enSum.text);

  const lastM = magSeries.length ? magSeries[magSeries.length - 1] : null;
  const etaClock = lastM ? utcTagToLocalHM(lastM.time_tag, currentPos.tz, bal.etaMin) : '';
  $('etaHint').textContent = en
    ? (etaClock ? `Right of dashed line = arriving by ${etaClock}` : 'Time axis shows estimated Earth arrival')
    : (etaClock ? `虛線右側＝已測得太陽風，預估於 ${etaClock} 前陸續到達` : '時間軸已換算為到達地球的當地時間');
  const pTxt = bal.pdyn !== null ? ` · ${bal.pdyn}nPa` : '';
  $('bzRawVal').textContent = `Bz ${bz !== null ? (bz >= 0 ? '+' : '') + bz.toFixed(1) : '--'} · ${speed ? Math.round(speed) : '--'}km/s${hpiGw !== null ? ' · ' + Math.round(hpiGw) + 'GW' : ''}${pTxt} ↗`;
  $('bzChart').innerHTML = buildBzChartSVG(chartSeries, currentPos.tz, speed, bal);

  const pNoaa = $('pNoaa'), pMet = $('pMet');
  if (noaaOk) {
    const stale = noaaLagMin !== null && noaaLagMin > 45;
    pNoaa.textContent = stale
      ? (en ? `NOAA Delayed (${noaaLagMin}m) ↗` : `NOAA 延遲 ${noaaLagMin} 分鐘 ↗`)
      : `NOAA (${lastM ? utcTagToLocalHM(lastM.time_tag, currentPos.tz) : (en ? 'Live' : '已同步')}) ↗`;
  } else {
    pNoaa.textContent = en ? 'NOAA Offline ↗' : 'NOAA 離線 ↗';
  }

  if (!hereHrs.length) return;
  const c0 = hereHrs[0].block;

  // +ETA Forward Forecast Strip (never hide incoming storm even if current hour is outOfZone!)
  const fcEl = $('fcNextTxt');
  const confEl = $('fcConfTxt');
  if (fcEl && confEl) {
    if (sc.outOfZone && (!scNext || scNext.outOfZone)) {
      fcEl.innerHTML = en ? `Next 1h est.: Score <strong>0</strong> (Latitude limit)` : `未來 1 小時預估：指數 <strong>0</strong>（緯度限制）`;
      confEl.textContent = en ? 'Conf: High' : '信心：高';
    } else {
      const diff = scNext.total - sc.total;
      const arrow = diff >= 6 ? (en ? '↗ Rising' : '↗ 增強') : (diff <= -6 ? (en ? '↘ Fading' : '↘ 轉弱') : (en ? '→ Steady' : '→ 持平'));
      fcEl.innerHTML = en
        ? `${etaClock ? `Est. ${etaClock}` : `In ~${bal.etaMin} min`}: Score <strong>${scNext.total}</strong> (${arrow})`
        : `${etaClock ? `${etaClock} 預估` : `約 ${bal.etaMin} 分鐘後預估`}：指數 <strong>${scNext.total}</strong>（${arrow}）`;
      const cSpan = hereHrs.length >= 3 ? (Math.max(hereHrs[0].block, hereHrs[1].block, hereHrs[2].block) - Math.min(hereHrs[0].block, hereHrs[1].block, hereHrs[2].block)) : 0;
      if (noaaLagMin > 45) {
        confEl.textContent = en ? 'Conf: Med (Sat lag)' : '信心：中（延遲）';
      } else if (cloudConsensus && cloudConsensus.level === 'low') {
        confEl.textContent = en ? 'Conf: Low (Models diverge)' : '信心：低（雲量分歧·看實拍）';
      } else if (cSpan >= 45) {
        confEl.textContent = en ? 'Conf: Med (Fast clouds)' : '信心：中（雲快）';
      } else if (cloudConsensus && cloudConsensus.level === 'medium') {
        confEl.textContent = en ? 'Conf: Med (Cloud spread)' : '信心：中（雲量微差）';
      } else {
        confEl.textContent = noaaOk && usedMet ? (en ? 'Conf: High' : '信心：高') : (en ? 'Conf: Med' : '信心：中');
      }
    }
  }

  $('skySvg').innerHTML = buildSkySceneSVG({
    cloudPct: c0, auroraScore: sc.auroraScore, moonUp: moon.up, moonPct: moon.pct, isTooBright: sc.isTooBright
  });

  const fmtT = t => { const n = Math.round(t) || 0; return `${n > 0 ? '+' : ''}${n}°C`; };
  const t0Int = Math.round(hereHrs[0].temp) || 0;
  const wc0Int = Math.round(hereHrs[0].windChill ?? hereHrs[0].temp) || 0;
  const wcTag = (t0Int - wc0Int >= 3) ? (en ? ` · Feels ${fmtT(wc0Int)}` : ` · 體感${fmtT(wc0Int)}`) : '';
  const hpiTag = hpiGw !== null ? ` · ${Math.round(hpiGw)}GW` : '';
  const aurSubText = sc.outOfZone === 'low-lat'
    ? (en ? `Mag ${sc.magLat}°` : `地磁 ${sc.magLat}°`)
    : (sc.outOfZone === 'need-storm'
        ? (en ? `Kp ${kp !== null ? kp.toFixed(1) : '--'} / ≥${sc.neededKp}` : `Kp ${kp !== null ? kp.toFixed(1) : '--'} / 需≥${sc.neededKp}`)
        : (en ? `Ov ${ovation ?? '--'}% · Kp ${kp !== null ? kp.toFixed(2) : '--'}${hpiTag}` : `機率 ${ovation ?? '--'}% · Kp ${kp !== null ? kp.toFixed(2) : '--'}${hpiTag}`));
  const darkSubText = sc.isTooBright
    ? (en ? `Sun ${sunAltNow.toFixed(0)}° (<-4°)` : `太陽 ${sunAltNow.toFixed(0)}°（需<-4°）`)
    : (moon.up ? (en ? `Moon ${moon.pct}% (${Math.round(moon.altDeg)}°)` : `月相 ${moon.pct}%（${Math.round(moon.altDeg)}°）`) : (en ? 'Moon down' : '月亮落下'));

  renderGauge(sc, {
    isTooBright: sc.isTooBright,
    skySub: en ? `Cloud ${c0}% · ${fmtT(t0Int)}${wcTag}` : `雲量 ${c0}% · ${fmtT(t0Int)}${wcTag}`,
    aurSub: aurSubText,
    darkSub: darkSubText
  });

  const v = evaluateVerdict({
    lat: currentPos.lat, lon: currentPos.lon, bestDark, kp,
    mlt: mltNow ?? null, effMoonPct: moon.effMoonPct, scoreObj: sc
  });
  $('vKicker').textContent = v.kicker;
  $('vTitle').textContent = v.title;
  $('vLead').textContent = v.lead;

  const bestText = bestDark
    ? (bestDark.score >= 35
        ? (en ? `Best window tonight: <strong>${bestDark.time}</strong> (Score <strong>${bestDark.score}</strong> · Clear ${bestDark.clear}% · Kp ${bestDark.kpFc.toFixed(2)})` : `今晚最佳時段：<strong>${bestDark.time}</strong>（指數 <strong>${bestDark.score} 分</strong>｜晴空 ${bestDark.clear}% · Kp ${bestDark.kpFc.toFixed(2)}）`)
        : (bestDark.block <= 40
            ? (en ? `Clearest dark window: <strong>${bestDark.time}</strong> (${bestDark.clear}% clear, Score ${bestDark.score})` : `天黑後最晴時段：<strong>${bestDark.time}</strong>（晴空 <strong>${bestDark.clear}%</strong>，指數 ${bestDark.score} 分）`)
            : (en ? `Clouds may thin around <strong>${bestDark.time}</strong> (${bestDark.clear}% clear, Score ${bestDark.score}).` : `預計 <strong>${bestDark.time}</strong> 雲層較有機會變薄（晴空 <strong>${bestDark.clear}%</strong>，指數 ${bestDark.score} 分）。`)))
    : (en ? 'Sky stays bright over the next 12h — check back after dusk.' : '未來 12 小時天色偏亮，請於日落後再查看。');
  const hb = $('homeBest');
  hb.className = 'callout ' + (bestDark && (bestDark.score >= 35 || bestDark.block <= 40) ? 'good' : 'warn');
  hb.innerHTML = bestText;

  selectForecastHour(lastSelectedHourIdx >= 0 && lastSelectedHourIdx < lastScoredHours.length ? lastSelectedHourIdx : 0);
  render3NightOutlook(nights3);

  const sum = summarizeCompass(dirResults);
  const cs = $('compassSummary');
  cs.className = 'callout ' + (sum?.good ? 'good' : 'warn');
  cs.textContent = sum ? sum.text : (en ? 'No data' : '無資料');
  $('radarSvg').innerHTML = buildCompassRadarSVG(dirResults, currentPos);

  $('compassBox').innerHTML = dirResults.map(d => {
    const isBest = sum && sum.bestKey === d.key;
    const col = d.isOcean ? 'c-blue' : (d.avg3h <= 35 ? 'c-green' : d.avg3h <= 65 ? 'c-amber' : 'c-red');
    const roadTag = (!d.isOcean && (d.maxPrecip3h || 0) >= 0.2)
      ? (d.temp <= 1.5
          ? (en ? ' · ❄️ Snow/Ice risk' : ' · ❄️ 降雪／路面恐結冰')
          : (en ? ' · 🌧️ Rain' : ' · 🌧️ 降雨'))
      : '';
    const nav = (d.key === 'here' || d.isOcean)
      ? (d.isOcean ? `<span style="font-size:0.75rem;color:var(--blue);font-weight:700;">${en ? 'Open Sea' : '海域僅供參考'}</span>` : '')
      : `<a class="btn btn-blue" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&origin=${currentPos.lat},${currentPos.lon}&destination=${d.lat},${d.lon}&travelmode=driving">${en ? 'Drive' : '導航'}</a>`;
    return `<div class="dir ${isBest ? 'best' : ''} ${d.isOcean ? 'sea' : ''}">
      <div><div style="font-weight:800;font-size:0.9rem;">${tDirLabel(d.label)}${isBest ? ' ★' : ''}</div>
      <div style="font-size:0.74rem;color:var(--muted);">${en ? '3h avg cloud' : '3h 平均雲量'} <strong class="${col}">${d.avg3h}%</strong>｜${en ? 'Now' : '目前'} ${d.nowC}%｜${fmtT(d.temp)}${roadTag}</div></div>
      ${nav}
    </div>`;
  }).join('');

  const srcLbl = (weatherSourceLabel === 'Yr.no官方' && en) ? 'Yr.no Official' : weatherSourceLabel;
  pMet.textContent = `${srcLbl} (${hereHrs[0].time}) ↗`;
  pMet.href = usedMet
    ? `https://www.yr.no/en/forecast/daily-table/${currentPos.lat.toFixed(3)},${currentPos.lon.toFixed(3)}`
    : 'https://open-meteo.com/en/docs';
  const tNow = $('clk')?.textContent || '--:--';
  $('syncTime').textContent = (noaaOk && hereHrs.length)
    ? (en ? `Synced ${tNow} · 5m auto` : `已同步 ${tNow} · 每 5 分鐘更新`)
    : (en ? 'Partial sync · 5m auto' : '部分同步 · 每 5 分鐘更新');
}

// ====== Live Data Fetching (Fault-Isolated & Concurrency-Guarded) ======
async function fetchMetNorwayPoint(lat, lon) {
  const k = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cached = metCache.get(k);
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) return cached.data;
  const r = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
  if (!r.ok) return null;
  const data = await r.json();
  metCache.set(k, { ts: Date.now(), data });
  return data;
}

async function refreshAll(manual) {
  const mySeq = ++refreshSeq;
  const en = isEn();
  const b = $('refBtn');
  b.disabled = true; b.classList.add('spinning');
  const pNoaa = $('pNoaa'), pMet = $('pMet');
  pNoaa.textContent = 'NOAA...'; pMet.textContent = en ? 'Weather...' : '氣象...';

  let bz = null, speed = null, kp = null, ovation = null, hpiGw = null, goesSub = null, noaaScales = null, geo1h = null, noaaAlert = null;
  let noaaOk = false, metOk = false;
  let magSeries = [], windSeries = [], kpForecast = [], noaaLagMin = null;
  const now = new Date();
  let moon = updateClockAndPhoto();

  // 1. Live NOAA SWPC (11 fault-isolated endpoints in parallel)
  try {
    const safeJson = r => (r && r.ok ? r.json().catch(() => null) : Promise.resolve(null));
    const safeText = r => (r && r.ok ? r.text().catch(() => null) : Promise.resolve(null));
    const [mR, wR, k1R, oR, hpiR, g1R, g2R, kfcR, scR, geoR, alR] = await Promise.all([
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_mag_1m.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt').catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/goes/primary/magnetometers-6-hour.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/goes/secondary/magnetometers-6-hour.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/products/noaa-scales.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/json/geospace/geospace_pred_est_kp_1_hour.json').catch(() => null),
      fetch('https://services.swpc.noaa.gov/products/alerts.json').catch(() => null)
    ]);
    const [mJ, wJ, k1J, ovJson, hpiTxt, g1J, g2J, kfcJ, scJ, geoJ, alJ] = await Promise.all([
      safeJson(mR), safeJson(wR), safeJson(k1R), safeJson(oR), safeText(hpiR),
      safeJson(g1R), safeJson(g2R), safeJson(kfcR), safeJson(scR), safeJson(geoR), safeJson(alR)
    ]);
    if (mySeq !== refreshSeq) return;

    if (mJ) magSeries = parseMagSeries(mJ, 180);
    if (wJ) windSeries = parseWindSeries(wJ, 180);
    if (kfcJ) kpForecast = parseKpForecast(kfcJ);
    if (scJ) noaaScales = parseNoaaGeomagneticScales(scJ);
    if (geoJ) geo1h = parseGeospacePredKp1h(geoJ, now.getTime());
    if (alJ) noaaAlert = parseNoaaAlerts(alJ, now.getTime());
    const lastMag = magSeries.length ? magSeries[magSeries.length - 1] : null;
    const wind = windSeries.length ? windSeries[windSeries.length - 1] : null;
    let kpObj = k1J ? parseLatestKp(k1J) : null;
    if (!kpObj) {
      const k3R = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').catch(() => null);
      const k3J = await safeJson(k3R);
      if (mySeq !== refreshSeq) return;
      if (k3J) kpObj = parseLatestKp(k3J);
    }
    const hpiObj = hpiTxt ? parseHemiPower(hpiTxt, currentPos.lat) : null;
    goesSub = mergeGoesSubstorm(g1J ? parseGoesSubstorm(g1J) : null, g2J ? parseGoesSubstorm(g2J) : null);

    if (lastMag) { bz = lastMag.bz; noaaLagMin = computeDataLagMin(lastMag.time_tag, now.getTime()); }
    if (wind) speed = wind.speed;
    if (kpObj) kp = kpObj.kp;
    if (ovJson) ovation = lookupOvationProb(ovJson, currentPos.lat, currentPos.lon);
    if (hpiObj) hpiGw = hpiObj.gw;
    if (lastMag || wind || kpObj || ovation !== null) noaaOk = true;
  } catch (e) {}

  // 2. Layered Cloud Forecasts (MET Norway 2.5km inside Nordics, Open-Meteo DST-proof unixtime globally)
  let hereHrs = [], multiDayPts = [], dirResults = [], weatherSourceLabel = '氣象', usedMet = false, cloudConsensus = null;
  try {
    const pts = computeCompassPoints(currentPos.lat, currentPos.lon, 60);
    const needElev = pts.slice(1).some(p => p.label.includes('60 km'));

    if (needElev) {
      try {
        const elRes = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}`);
        if (elRes.ok) {
          const elJson = await elRes.json();
          if (Array.isArray(elJson.elevation)) {
            pts.forEach((pt, i) => { if (i > 0 && Number(elJson.elevation[i]) <= 0) pt.isOcean = true; });
          }
        }
      } catch (e) {}
    }
    if (mySeq !== refreshSeq) return;

    if (isInNordicMetBox(currentPos.lat, currentPos.lon)) {
      try {
        const [metList, omRes] = await Promise.all([
          Promise.all(pts.map(p => fetchMetNorwayPoint(p.lat, p.lon))),
          // Reuse the Nordic timezone lookup to pull Open-Meteo layered clouds at zero extra HTTP cost
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${currentPos.lat.toFixed(4)}&longitude=${currentPos.lon.toFixed(4)}&hourly=temperature_2m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high&timezone=auto&timeformat=unixtime&forecast_days=1`).catch(() => null)
        ]);
        if (mySeq !== refreshSeq) return;
        let omJson = null;
        if (omRes && omRes.ok) {
          omJson = await omRes.json();
          if (mySeq !== refreshSeq) return;
          if (omJson?.timezone) currentPos.tz = omJson.timezone;
        }
        if (metList[0]) {
          usedMet = true; metOk = true; weatherSourceLabel = 'Yr.no官方';
          multiDayPts = parseMetNorwayMultiDay(metList[0], currentPos.lat, currentPos.lon, currentPos.tz, now);
          pts.forEach((pt, i) => {
            const hrs = metList[i] ? parseMetNorwayHourly12(metList[i], pt.lat, pt.lon, currentPos.tz, now) : [];
            if (i === 0) hereHrs = hrs;
            const first3 = hrs.slice(0, 3);
            const avg3h = first3.length ? Math.round(first3.reduce((s, h) => s + h.block, 0) / first3.length) : 100;
            const maxPrecip3h = first3.length ? Math.max(...first3.map(h => Number(h.precip || 0))) : 0;
            dirResults.push({ ...pt, nowC: hrs[0]?.block ?? 100, avg3h, min12: hrs.length ? Math.min(...hrs.map(h => h.block)) : 100, temp: hrs[0]?.temp ?? 0, maxPrecip3h });
          });
          if (omJson?.hourly && hereHrs.length) {
            const omHereHrs = parseOpenMeteoHourly12(omJson.hourly, currentPos.lat, currentPos.lon, currentPos.tz, now, omJson.utc_offset_seconds);
            cloudConsensus = evaluateCloudConsensus(hereHrs, omHereHrs);
          }
        }
      } catch (e) {}
    }

    if (!usedMet) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${pts.map(p => p.lat).join(',')}&longitude=${pts.map(p => p.lon).join(',')}&hourly=temperature_2m,wind_speed_10m,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation&timezone=auto&timeformat=unixtime&forecast_days=4`;
      const r = await fetch(url);
      if (mySeq !== refreshSeq) return;
      if (r.ok) {
        metOk = true; weatherSourceLabel = 'Open-Meteo';
        const data = await r.json();
        if (mySeq !== refreshSeq) return;
        const list = Array.isArray(data) ? data : [data];
        if (list[0]?.timezone) currentPos.tz = list[0].timezone;
        multiDayPts = parseOpenMeteoMultiDay(list[0]?.hourly, currentPos.lat, currentPos.lon, currentPos.tz, now, list[0]?.utc_offset_seconds);
        pts.forEach((pt, i) => {
          const ptTz = list[i]?.timezone || currentPos.tz;
          const hrs = parseOpenMeteoHourly12(list[i]?.hourly, pt.lat, pt.lon, ptTz, now, list[i]?.utc_offset_seconds);
          if (i === 0) hereHrs = hrs;
          const first3 = hrs.slice(0, 3);
          const avg3h = first3.length ? Math.round(first3.reduce((s, h) => s + h.block, 0) / first3.length) : 100;
          const maxPrecip3h = first3.length ? Math.max(...first3.map(h => Number(h.precip || 0))) : 0;
          dirResults.push({ ...pt, nowC: hrs[0]?.block ?? 100, avg3h, min12: hrs.length ? Math.min(...hrs.map(h => h.block)) : 100, temp: hrs[0]?.temp ?? 0, maxPrecip3h });
        });
      }
    }
    if (mySeq !== refreshSeq) return;

    if (metOk && hereHrs.length) {
      $('offlineBanner').style.display = 'none';
      renderLocationHeader();
      moon = updateClockAndPhoto();
      const bal = computeBallisticCoupling(magSeries, windSeries.length ? windSeries : speed, now.getTime());
      const c0 = hereHrs[0].block;
      const sunAltNow = computeSolarElevation(now, currentPos.lat, currentPos.lon);
      const mltNow = computeMLT(now, currentPos.lat, currentPos.lon);
      const predKp1h = geo1h?.maxNext60Kp ?? null;

      const scored12 = scoreHourlyForecast12(hereHrs, {
        lat: currentPos.lat, lon: currentPos.lon,
        kpForecast, fallbackKp: kp ?? 0, ovation, hpiGw,
        bz: bal.nowBz ?? bz, nextBz: bal.nextBz, speed,
        newell: bal.nowNewell, nextNewell: bal.nextNewell,
        predKp1h, preconditionedNewell60: bal.avgNewell60,
        substormJumpNt: goesSub ? goesSub.jumpNt : 0,
        pdyn: bal.pdyn, shockJumpNpa: bal.shockJumpNpa
      });
      lastScoredHours = scored12.hours;
      lastBestAurora = scored12.bestAurora;
      const bestDark = scored12.bestAurora || findBestDarkWindow(hereHrs);
      lastSelectedHourIdx = bestDark ? Math.max(0, lastScoredHours.findIndex(h => h.time === bestDark.time)) : 0;

      const sc = computeAuroraScore({
        lat: currentPos.lat, lon: currentPos.lon,
        cloudNow: c0, sunAlt: sunAltNow,
        bz: bal.nowBz ?? bz, speed, kp, ovation,
        hpiGw, substormJumpNt: goesSub ? goesSub.jumpNt : 0,
        pdyn: bal.pdyn, shockJumpNpa: bal.shockJumpNpa,
        newell: bal.nowNewell, preconditionedNewell60: bal.avgNewell60,
        mlt: mltNow, effMoonPct: moon.effMoonPct
      });

      const nextDt = new Date(now.getTime() + bal.etaMin * 60000);
      const nextHourIdx = Math.min(hereHrs.length - 1, Math.max(0, Math.round(bal.etaMin / 60)));
      const cNext = hereHrs[nextHourIdx] ? hereHrs[nextHourIdx].block : c0;
      const moonNext = getMoonState(nextDt, currentPos.lat, currentPos.lon);
      const baseKpNext = lookupForecastKp(kpForecast, nextDt, kp ?? 0);
      const kpNext = Number.isFinite(predKp1h) ? Math.max(baseKpNext, predKp1h) : baseKpNext;
      const scNext = computeAuroraScore({
        lat: currentPos.lat, lon: currentPos.lon,
        cloudNow: cNext, sunAlt: computeSolarElevation(nextDt, currentPos.lat, currentPos.lon),
        bz: bal.nextBz ?? bz, speed, kp: kpNext, ovation,
        hpiGw, substormJumpNt: goesSub ? Math.round(goesSub.jumpNt * 0.5) : 0,
        pdyn: bal.pdyn, shockJumpNpa: bal.shockJumpNpa,
        newell: bal.nextNewell, preconditionedNewell60: bal.avgNewell60,
        mlt: computeMLT(nextDt, currentPos.lat, currentPos.lon),
        effMoonPct: moonNext.effMoonPct
      });

      const nights3 = summarize3NightOutlook({
        cloudPoints: multiDayPts, kpForecast, currentKp: kp,
        lat: currentPos.lat, lon: currentPos.lon, timeZone: currentPos.tz, nowDate: now
      });

      lastRenderState = {
        magSeries, chartSeries: magSeries.slice(-120), speed, bz, kp, ovation, hpiGw, goesSub, noaaScales, noaaAlert, bal,
        noaaOk, noaaLagMin, hereHrs, dirResults, weatherSourceLabel, usedMet, cloudConsensus,
        sunAltNow, mltNow, moon, sc, scNext, bestDark, nights3
      };
      renderFromState(lastRenderState);
      updateClockAndPhoto();
      maybeTriggerAlert(sc, goesSub, scNext, bal);

      try {
        localStorage.setItem('aurora_cache_v4', JSON.stringify({
          ts: Date.now(), posName: getPosDisplayName(), score: sc,
          v: evaluateVerdict({ lat: currentPos.lat, lon: currentPos.lon, bestDark, kp, mlt: mltNow, effMoonPct: moon.effMoonPct, scoreObj: sc }),
          skySub: $('fSkySub').textContent,
          aurSub: $('fAurSub').textContent,
          darkSub: $('fDarkSub').textContent
        }));
      } catch (e) {}
    } else {
      pMet.textContent = isEn() ? 'Weather Offline' : '氣象離線';
      try {
        const cached = JSON.parse(localStorage.getItem('aurora_cache_v4') || 'null');
        if (cached && cached.score && (Date.now() - cached.ts) < 6 * 3600000) {
          const minsAgo = Math.max(1, Math.round((Date.now() - cached.ts) / 60000));
          const ob = $('offlineBanner');
          ob.style.display = 'block';
          ob.textContent = isEn()
            ? `Offline: showing cached forecast from ${minsAgo} min ago (${cached.posName}).`
            : `網路訊號中斷：目前顯示 ${minsAgo} 分鐘前（${cached.posName}）的快取預報，有訊號時點右上角更新。`;
          renderGauge(cached.score, { isTooBright: cached.score.isTooBright, skySub: cached.skySub, aurSub: cached.aurSub, darkSub: cached.darkSub });
          $('vKicker').textContent = cached.v.kicker;
          $('vTitle').textContent = cached.v.title;
          $('vLead').textContent = cached.v.lead;
        }
      } catch (e) {}
    }
  } catch (e) { pMet.textContent = isEn() ? 'Weather Offline' : '氣象離線'; }

  if (noaaOk || metOk) lastSyncMs = Date.now();
  if (manual) toast(noaaOk && metOk ? (isEn() ? 'Forecast updated' : '已更新最新官方預報') : (isEn() ? 'Partial connection error' : '部分資料連線失敗'));
  b.disabled = false; b.classList.remove('spinning');
}

// ====== User Actions ======
function pickPreset(nameZh, nameEn, lat, lon, btn) {
  document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const tz = nameZh.includes('芬蘭') ? 'Europe/Helsinki' : nameZh.includes('瑞典') ? 'Europe/Stockholm' : 'Europe/Oslo';
  currentPos = { name: nameZh, nameEn, lat, lon, tz, mode: 'manual', accuracy: null };
  renderLocationHeader();
  syncBrowserUrl();
  togglePicker(true);
  refreshAll(true);
}

function useGPS() {
  const en = isEn();
  if (!navigator.geolocation) {
    currentPos.mode = 'gps-err'; renderLocationHeader();
    toast(en ? 'GPS not supported' : '此瀏覽器不支援 GPS');
    return;
  }
  const b = $('gpsBtn');
  b.disabled = true; b.textContent = en ? 'Locating...' : '定位中...';
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
      currentPos = { name: en ? 'Locating...' : '辨識城市中...', nameEn: 'Locating...', lat, lon, tz: currentPos.tz, mode: 'gps', accuracy };
      renderLocationHeader();
      try {
        const locLang = isEn() ? 'en' : 'zh-Hant';
        const rgRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=${locLang}`);
        const resolved = rgRes.ok ? (formatReverseGeo(await rgRes.json()) || `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`) : `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
        currentPos.name = resolved; currentPos.nameEn = resolved;
      } catch (e) { currentPos.name = `GPS (${lat.toFixed(2)}, ${lon.toFixed(2)})`; currentPos.nameEn = currentPos.name; }
      renderLocationHeader(); syncBrowserUrl(); togglePicker(true);
      b.disabled = false; b.textContent = 'GPS';
      toast((isEn() ? 'Located: ' : '已定位：') + getPosDisplayName());
      refreshAll(false);
    },
    () => {
      b.disabled = false; b.textContent = 'GPS';
      currentPos.mode = 'gps-err'; renderLocationHeader();
      toast(isEn() ? 'GPS permission denied' : 'GPS 權限被拒，請手動選擇地點');
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
  );
}

async function searchCity(e) {
  e.preventDefault();
  const q = $('cityInput').value.trim();
  if (!q) return;
  const en = isEn();
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en`);
    if (r.ok) {
      const d = await r.json();
      if (d.results?.length) {
        const g = d.results[0];
        document.querySelectorAll('#presetChips .chip').forEach(c => c.classList.remove('on'));
        const label = (g.country && g.country !== g.name) ? `${g.country}・${g.name}` : g.name;
        const labelEn = (g.country && g.country !== g.name) ? `${g.country} · ${g.name}` : g.name;
        currentPos = { name: label, nameEn: labelEn, lat: g.latitude, lon: g.longitude, tz: g.timezone || 'UTC', mode: 'manual', accuracy: null };
        renderLocationHeader(); syncBrowserUrl();
        $('cityInput').value = ''; togglePicker(true); refreshAll(true);
        return;
      }
    }
    toast(en ? 'City not found — try English spelling' : '找不到地名，請輸入英文拼法');
  } catch (err) { toast(en ? 'Search failed' : '搜尋連線失敗'); }
}

async function shareStatus() {
  const en = isEn();
  const shareUrl = buildShareUrl(location.href, currentPos, getLang());
  const scStr = lastScore ? (en ? `${lastScore.total}/100 (${tGrade(lastScore.grade)})` : `${lastScore.total} 分（${lastScore.grade}）`) : (en ? 'Updating' : '更新中');
  const title = en ? `[${getPosDisplayName()}] Aurora Viewing Score: ${scStr}` : `【${getPosDisplayName()}】極光觀測指數：${scStr}`;
  const body = en
    ? `${title}\n${$('vTitle').textContent}\n• Sky: ${$('fSkySub').textContent}\n• Aurora: ${$('fAurSub').textContent}\nLive Cloud & NOAA Aurora Radar:`
    : `${title}\n${$('vTitle').textContent}\n• 天空：${$('fSkySub').textContent}\n• 極光：${$('fAurSub').textContent}\n點開看即時雲層＋NOAA 極光雷達：`;
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

// Expose test helpers for automated visual verification scripts
window.__AURORA_APP__ = {
  getState: () => lastRenderState,
  renderFromState,
  selectForecastHour,
  toggleRedMode,
  switchView
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

  document.querySelectorAll('#presetChips .chip').forEach(btn => {
    btn.addEventListener('click', () => pickPreset(btn.dataset.zh, btn.dataset.en, parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon), btn));
  });
  document.querySelectorAll('#camChips .chip').forEach(btn => {
    btn.addEventListener('click', () => selectSkyCam(btn.dataset.cam, btn));
  });
  document.querySelectorAll('.bottom-nav .nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view, btn));
  });
  $('skyWaveChart')?.addEventListener('click', (e) => {
    const hit = e.target.closest?.('[data-hour-idx]');
    if (hit) selectForecastHour(parseInt(hit.dataset.hourIdx, 10));
  });
}

function registerServiceWorker() {
  try {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  } catch (e) {}
}

loadSavedPrefs();
applyStaticI18n();
bindEvents();
renderLocationHeader();
updateClockAndPhoto();
registerServiceWorker();
refreshAll(false);

setInterval(updateClockAndPhoto, 30000);
// Keep polling in background ONLY when user explicitly armed Alerts
setInterval(() => { if (!document.hidden || alertEnabled) refreshAll(false); }, AUTO_REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - lastSyncMs > 3 * 60 * 1000) refreshAll(false);
});
