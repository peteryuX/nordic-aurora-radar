/**
 * Nordic Aurora Radar — Observatory Registry & Declarative Static i18n
 *
 * Centralizes all static bilingual UI copy and Nordic all-sky observatory
 * metadata so DOM strings never drift between Traditional Chinese and English.
 */

import { TERMS, term } from './glossary.js';

const pair = (e) => [e.zh, e.en];

export const SKY_CAMS = {
  uit: {
    region: 'nordic',
    lat: 69.35, lon: 20.36, tz: 'Europe/Oslo',
    url: 'https://fox.phys.uit.no/ASC/Latest_ASC01.png',
    page: 'https://fox.phys.uit.no/ASC/',
    capZh: '資料來源：挪威北極大學 UiT 全天空極光相機（Skibotn 天文台，約每分鐘實拍）',
    capEn: 'Source: UiT Tromsø Geophysical Observatory All-Sky Camera (Skibotn, ~1 min live)'
  },
  irf: {
    region: 'nordic',
    lat: 67.84, lon: 20.41, tz: 'Europe/Stockholm',
    url: 'https://www.irf.se/alis/allsky/krn/latest_medium.jpeg',
    page: 'https://www.irf.se/alis/allsky/krn/',
    capZh: '資料來源：瑞典空間物理研究所 IRF Kiruna 全天空相機（約每分鐘實拍）',
    capEn: 'Source: Swedish Institute of Space Physics (IRF Kiruna) Live All-Sky Camera'
  },
  sgo: {
    region: 'nordic',
    lat: 67.37, lon: 26.63, tz: 'Europe/Helsinki',
    url: 'https://www.sgo.fi/Data/RealTime/Kuvat/UCL.jpg',
    page: 'https://www.sgo.fi/Data/RealTime/allsky.php',
    capZh: '資料來源：芬蘭索丹屈萊天文台 SGO 全天空相機（約每分鐘實拍）',
    capEn: 'Source: Sodankylä Geophysical Observatory (SGO Finland) Live All-Sky Camera'
  },
  kho: {
    region: 'nordic',
    lat: 78.15, lon: 16.04, tz: 'Arctic/Longyearbyen',
    url: 'https://kho.unis.no/Quicklooks/kho_sony.jpg',
    page: 'https://kho.unis.no/',
    capZh: '資料來源：挪威斯瓦巴群島 KHO 極地天文台 Sony 全彩極光相機（78°N 即時實拍）',
    capEn: 'Source: Kjell Henriksen Observatory (KHO Svalbard 78°N) Live All-Sky Camera'
  },
  fmi: {
    region: 'nordic',
    isMag: true,
    url: 'https://cdn.fmi.fi/weather-observations/products/magnetic-disturbance-observations/map-latest-en.png',
    page: 'https://en.ilmatieteenlaitos.fi/auroras-and-space-weather',
    capZh: '資料來源：芬蘭氣象局 FMI 北歐地面磁力儀即時擾動圖（橘、紅點＝當地正發生副磁暴）',
    capEn: 'Source: Finnish Meteorological Institute (FMI) Live Nordic Ground Magnetometer Map'
  },
  uaf: {
    region: 'na',
    lat: 65.12, lon: -147.43, tz: 'America/Anchorage',
    url: 'https://optics.gi.alaska.edu/realtime/latest/pkr_latest_rgb.jpg',
    page: 'https://optics.gi.alaska.edu/realtime/latest/',
    capZh: '資料來源：阿拉斯加大學地球物理研究所 UAF Poker Flat 全天空極光相機（Fairbanks 近郊）',
    capEn: 'Source: UAF Geophysical Institute Poker Flat All-Sky Camera (near Fairbanks, AK)'
  },
  amax: {
    region: 'na',
    lat: 62.45, lon: -114.37, tz: 'America/Yellowknife',
    url: 'https://auroramax.phys.ucalgary.ca/recent/recent_480p.jpg',
    page: 'https://auroramax.com/',
    capZh: '資料來源：加拿大太空總署 CSA / 卡加利大學 AuroraMAX 全天空極光相機（Yellowknife）',
    capEn: 'Source: Canadian Space Agency / UCalgary AuroraMAX All-Sky Camera (Yellowknife, NT)'
  }
};

/** Declarative [zh, en] text map for every static element ID in index.html */
export const STATIC_TEXT_MAP = {
  langBtn: ['English', '繁體中文'],
  waveRange: pair(TERMS.nav.range24h),
  ptrText: ['下拉更新', 'Pull to refresh'],
  lineTipTxt: [
    '若在 App 內建瀏覽器無法使用 GPS，請改用 Safari / Chrome 開啟，或點上方地名切換。',
    'If GPS is blocked in an in-app browser, open in Safari/Chrome or tap the city name above.'
  ],
  offlineRetryBtn: ['重試', 'Retry'],
  pickerSheetTitle: ['切換觀測地點', 'Choose location'],
  gpsBtnTxt: pair(TERMS.location.useMyLoc),
  refBtnTxt: ['立即同步', 'Sync now'],
  shareBtnTxt: ['分享預報', 'Share'],
  pickerGrpNordic: ['北歐極光帶', 'Nordic aurora belt'],
  pickerGrpNa: ['北美與冰島', 'North America & Iceland'],
  pickerGrpSouth: ['南半球極光', 'Southern Hemisphere'],
  searchBtn: ['搜尋', 'Search'],
  ringSubLbl: pair(TERMS.score),
  fSkyLbl: pair(TERMS.clearSky),
  fAurLbl: pair(TERMS.aurora),
  fDarkLbl: pair(TERMS.darkness),
  h2Wave: pair(TERMS.nav.hourlyTrend),
  hrLegRight: ['滑動查看各時段', 'Drag to explore'],
  h2Energy: pair(TERMS.solarWind.title),
  swToggleTxt: ['顯示太陽風曲線', 'Show solar wind chart'],
  h2Outlook: pair(TERMS.nav.next3Nights),
  outlookNote: ['明後天雲量與 Kp 變動較大，出發前 3 小時請再確認。', 'Clouds & Kp shift — recheck 3h before going out.'],
  seoFootLbl: ['熱門極光地點攻略', 'Aurora destination guides'],
  h2Radar: pair(TERMS.nav.nearbyClear),
  roadLbl: ['冬季即時路況／封路查詢：', 'Winter road & closure status:'],
  roadNo: ['挪威 Vegvesen ↗', 'Norway · Vegvesen ↗'],
  roadSe: ['瑞典 Trafikverket ↗', 'Sweden Trafikverket ↗'],
  roadIs: ['冰島 Umferðin ↗', 'Iceland Umferðin ↗'],
  roadFi: ['芬蘭路況 ↗', 'Finland roads ↗'],
  h2Cam: ['天文台即時全天空實拍', 'Observatory all-sky cameras'],
  subCam: [
    '約每分鐘實拍，請留意畫面內建 UTC 時間戳記確認是否即時：',
    'Live observatory frames — check the embedded UTC timestamp to confirm freshness:'
  ],
  camBtnUit: ['Tromsø 近郊', 'Near Tromsø'],
  camBtnIrf: ['Kiruna', 'Kiruna'],
  camBtnSgo: ['Sodankylä', 'Sodankylä'],
  camBtnKho: ['Svalbard', 'Svalbard'],
  camBtnFmi: ['北歐地磁圖', 'Nordic magnetic map'],
  camBtnUaf: ['Fairbanks', 'Fairbanks'],
  camBtnAmax: ['Yellowknife', 'Yellowknife'],
  camBrightBtn: ['日間已調暗 · 點此看原亮度', 'Dimmed in daylight · tap for full'],
  h2Windy: ['即時動態雲圖', 'Live cloud map'],
  subWindy: ['已自動對準目前位置，按左下角 ▶ 可播放接下來幾小時雲層移動趨勢：', 'Centered on your location — press ▶ bottom-left to animate cloud movement:'],
  subOv: ['查看綠色／黃色極光帶目前是否覆蓋所在區域（每 5 分鐘自動更新）：', 'Check if the auroral oval covers your region (updates every 5 min):'],
  navHome: pair(TERMS.nav.overview),
  navDir: pair(TERMS.nav.findClearShort),
  navSat: pair(TERMS.nav.liveMap),
  trustSheetTitle: ['指數說明與設定', 'Score & settings'],
  tsLblSky: ['晴空率', 'Clear sky'],
  tsLblAur: ['極光活動', 'Aurora'],
  tsLblDark: ['夜空暗度', 'Darkness'],
  tsLblOut: ['觀測指數', 'Score'],
  tsTierTitle: ['觀測指數分級（0–99，越高越好）', 'Score tiers (0–99, higher is better)'],
  tsT1: ['極佳', 'Excellent'],
  tsT2: ['適合觀測', 'Good'],
  tsT3: ['普通', 'Fair'],
  tsT4: ['偏低（雲層過厚、天色過亮或極光偏弱）', 'Low (cloudy, too bright or weak activity)'],
  tsSciTitle: ['官方資料來源與驗證', 'Official data & verification'],
  pNoaa: ['NOAA 極光總覽 ↗', 'NOAA Aurora Map ↗'],
  linkNoaaAlerts: ['NOAA 風暴警報 ↗', 'NOAA Storm Alerts ↗'],
  linkSolarWind: ['NOAA 太陽風 ↗', 'NOAA Solar Wind ↗'],
  linkGfz: ['GFZ 30分地磁 ↗', 'GFZ 30m Geomag ↗'],
  tsNoaaSyncNote: [
    '直連 NOAA 每 3 小時滾動更新 — 核對警報請看「NOAA 風暴警報」，今晚極光範圍請看「NOAA 極光總覽」。',
    'Live 3h NOAA feed — verify G1–G5 watches in "NOAA Storm Alerts" and tonight\'s oval in "NOAA Aurora Map".'
  ],
  tsSealLink: ['GitHub 開源（MIT · 不追蹤）↗', 'Open source (MIT · no tracking) ↗'],
  tsValReportLink: ['完整驗證報告 ↗', 'Validation report ↗'],
  tsPwaTip: [
    '離線使用：Safari 點「分享 → 加入主畫面」或 Chrome 點「安裝」，極區無訊號時仍可開啟快取。',
    'Offline tip: Add to Home Screen (Safari Share / Chrome Install) for cached access with no signal.'
  ],
  tsLegalFoot: [
    '氣象：MET Norway / Open-Meteo；太空天氣：NOAA SWPC。僅供觀星參考，冬季行車請以當地路況管制為準。',
    'Weather: MET Norway / Open-Meteo; Space weather: NOAA SWPC. Reference only — obey local winter road closures.'
  ]
};

/** Initial loading placeholders (only applied before first live render) */
export const LOADING_PLACEHOLDER_MAP = {
  vTitle: ['正在同步最新天空狀況…', 'Syncing live sky & space weather…'],
  vLead: ['結合官方分層晴空預報、NOAA 即時衛星與天文暗空倒數。', 'Combining official layered clouds, NOAA solar wind & twilight countdown.'],
  ringGrade: ['計算中', 'Loading'],
  fSkySub: ['讀取中…', 'Loading…'],
  fAurSub: ['讀取中…', 'Loading…'],
  fDarkSub: ['讀取中…', 'Loading…'],
  fcNextTxt: ['未來 1 小時：計算中…', 'Next hour: calculating…'],
  fcConfBtn: ['說明 ›', 'Why? ›'],
  pMet: ['Yr.no 天氣 ↗', 'Yr.no Weather ↗'],
  syncTime: ['同步中', 'Syncing…'],
  energyBanner: ['正在讀取即時太陽風…', 'Loading live solar wind…'],
  etaHint: ['時間軸已換算為到達地球的當地時間', 'Time axis shows estimated Earth arrival'],
  homeBest: ['載入中…', 'Loading…'],
  compassSummary: ['正在掃描周邊晴空…', 'Scanning nearby clear skies…'],
  tsLiveBadge: ['計算中', 'Loading'],
  tsDiagTxt: ['正在分析主要影響因素…', 'Analyzing key factor…'],
  tsConfRow: ['正在確認氣象與衛星資料…', 'Checking forecast & satellite data…']
};

const ARIA_LABELS = {
  redBtn: ['紅光夜視模式', 'Red-light night vision', true],
  alertBtn: ['螢幕常亮監測提醒', 'Screen-on aurora monitor', true],
  trustBtn: ['更多設定與指數說明', 'More settings & score guide', true],
  refBtn: ['立即更新', 'Sync now', true],
  gpsBtn: ['使用目前位置', 'Use my location', true],
  shareBtn: ['分享預報連結', 'Share forecast link', true],
  ringBtn: ['查看指數說明與資料來源', 'View score details and sources', false],
  trustCloseBtn: ['關閉', 'Close', false],
  pickerCloseBtn: ['關閉', 'Close', false],
  lineTipClose: ['關閉提示', 'Dismiss tip', false],
  outlookInfoBtn: ['指數說明', 'About this score', false]
};

export function renderSkyCamCaption($, key, en) {
  const cap = $('skyCamCap');
  const cam = SKY_CAMS[key];
  if (!cap || !cam) return;
  const txt = en ? cam.capEn : cam.capZh;
  cap.innerHTML = `<a class="src-link" target="_blank" rel="noopener noreferrer" href="${cam.page}">${txt} ↗</a>`;
}

export function applyStaticI18n({ $, en, currentPos, currentCamKey, hasLiveState, onUpdateCamDayNotice }) {
  document.documentElement.lang = en ? 'en' : 'zh-Hant';
  document.title = en ? 'Nordic Aurora Radar · Live Global Forecast' : '極光即時雷達｜北歐與全球即時預報';

  const applyMap = (map) => {
    for (const [id, [zh, enT]] of Object.entries(map)) {
      const el = $(id);
      if (el) el.textContent = en ? enT : zh;
    }
  };
  applyMap(STATIC_TEXT_MAP);

  for (const [id, [zh, enT, setTitle]] of Object.entries(ARIA_LABELS)) {
    const el = $(id);
    if (!el) continue;
    const lbl = en ? enT : zh;
    if (setTitle) el.title = lbl;
    el.setAttribute('aria-label', lbl);
  }

  const ci = $('cityInput');
  if (ci) ci.placeholder = en ? 'Search city (e.g. Akureyri, Fairbanks)' : '輸入地名（例：冰島、特羅姆瑟、黃刀）';

  const hrl = $('hrLegLeft');
  if (hrl) {
    hrl.innerHTML = en
      ? `<span class="leg-dot" style="background:var(--green);"></span>Bars = ${term(TERMS.scoreShort, true).toLowerCase()} (0–99)<span class="leg-strip"></span>Strip = ${term(TERMS.clearSky, true).toLowerCase()}`
      : `<span class="leg-dot" style="background:var(--green);"></span>柱＝${term(TERMS.scoreShort, false)}（0–99）<span class="leg-strip"></span>灰條＝${term(TERMS.clearSky, false)}`;
  }

  const rl = $('radarLeg');
  if (rl) {
    rl.innerHTML = en
      ? `<span>Next 3h clear:</span><span><span class="leg-dot" style="background:var(--green);"></span>✓ ≥65%</span><span><span class="leg-dot" style="background:var(--amber);"></span>~ 35–64%</span><span><span class="leg-dot" style="background:var(--muted);"></span>✕ &lt;35%</span><span><span class="leg-dot" style="background:var(--red);"></span>⚠ Hazard</span>`
      : `<span>未來 3 小時晴空率：</span><span><span class="leg-dot" style="background:var(--green);"></span>✓ ≥65%</span><span><span class="leg-dot" style="background:var(--amber);"></span>~ 35–64%</span><span><span class="leg-dot" style="background:var(--muted);"></span>✕ 雲厚</span><span><span class="leg-dot" style="background:var(--red);"></span>⚠ 強風雪</span>`;
  }

  const ovCapEl = $('ovCap');
  if (ovCapEl) {
    const ovTxt = en
      ? 'Source: NOAA SWPC OVATION Live Model (Green = aurora, Yellow/Red = intense)'
      : '資料來源：NOAA SWPC OVATION 即時模型（綠色＝有極光，黃紅＝強烈爆發）';
    ovCapEl.innerHTML = `<a class="src-link" target="_blank" rel="noopener noreferrer" href="https://www.spaceweather.gov/products/aurora-30-minute-forecast">${ovTxt} ↗</a>`;
  }

  const tsG = $('tsStatGrid');
  if (tsG) {
    tsG.innerHTML = en
      ? `<div class="ts-stat"><strong>Sun 0.006° · Mag 0.24°</strong><span>JPL DE441 (Moon ≤0.74°) · IGRF-14</span></div>` +
        `<div class="ts-stat"><strong>14 NOAA Space Feeds</strong><span>1m L1 Wind · Kp · GOES · OVATION · Dst</span></div>` +
        `<div class="ts-stat"><strong>METAR Cloud Nowcast</strong><span>Live airport ceilometers ≤55 km (+0–3h)</span></div>` +
        `<div class="ts-stat"><strong>Layered Cloud Check</strong><span>Yr.no 2.5km Nordics · Dual-NWP Global</span></div>`
      : `<div class="ts-stat"><strong>太陽 0.006° · 地磁 0.24°</strong><span>JPL 日月曆（月 ≤0.74°） · IGRF-14</span></div>` +
        `<div class="ts-stat"><strong>14 項 NOAA 太空天氣</strong><span>1m 太陽風 · Kp · GOES · OVATION · Dst</span></div>` +
        `<div class="ts-stat"><strong>機場實測短時校正</strong><span>55 km 內即時 METAR 融合（+0–3h）</span></div>` +
        `<div class="ts-stat"><strong>分層雲量與共識比對</strong><span>北歐 Yr.no 2.5km · 全球雙模型</span></div>`;
  }

  if (!hasLiveState) {
    applyMap(LOADING_PLACEHOLDER_MAP);
    const hd = $('hourDetail');
    if (hd) {
      hd.innerHTML = en
        ? '<span>Slide or tap any hour on the chart for clear sky %, feels-like &amp; moon</span>'
        : '<span>在圖表上滑動或點擊任一時段查看晴空率、體感溫度與月光</span>';
    }
    const tlt = $('tsLiveTitle');
    if (tlt) {
      tlt.innerHTML = en
        ? 'Why is it <strong id="tsLiveTotal">--</strong> now?'
        : '為何現在指數是 <strong id="tsLiveTotal">--</strong>？（越高越好）';
    }
  }

  renderSkyCamCaption($, currentCamKey, en);
  if (typeof onUpdateCamDayNotice === 'function') onUpdateCamDayNotice(currentCamKey);

  const ovH = $('ovHeading');
  if (ovH) {
    ovH.textContent = currentPos.lat >= 0
      ? (en ? 'NOAA Northern Hemisphere Aurora Oval' : 'NOAA 北半球即時極光橢圓圖')
      : (en ? 'NOAA Southern Hemisphere Aurora Oval' : 'NOAA 南半球即時極光橢圓圖');
  }
}
