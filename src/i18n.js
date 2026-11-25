/**
 * Nordic Aurora Radar — Observatory Registry & Declarative Static i18n
 *
 * Centralizes all static bilingual UI copy and Nordic all-sky observatory
 * metadata so DOM strings never drift between Traditional Chinese and English.
 */

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
    capZh: '資料來源：芬蘭氣象局 FMI 北歐地面磁力儀即時擾動圖（橘／紅點＝當地正發生副磁暴）',
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
  brandTxt: ['極光即時雷達', 'Aurora Radar'],
  langBtn: ['EN', '中'],
  ptrText: ['下拉更新', 'Pull to refresh'],
  lineTipTxt: [
    '若在 App 內建瀏覽器無法使用 GPS，請改用 Safari / Chrome 開啟，或點上方地名切換。',
    'If GPS is blocked in an in-app browser, open in Safari/Chrome or tap the city name above.'
  ],
  offlineRetryBtn: ['重試', 'Retry'],
  clkLbl: ['當地', 'Local'],
  pickerSheetTitle: ['切換觀測地點', 'Choose Location'],
  pickerGrpNordic: ['北歐極光帶', 'Nordic Belt'],
  pickerGrpNa: ['北美＆冰島', 'N. America & Iceland'],
  pickerGrpSouth: ['南半球極光', 'Southern Hemisphere'],
  searchBtn: ['搜尋', 'Go'],
  ringSubLbl: ['觀測指數', 'Score'],
  fSkyLbl: ['晴空率', 'Clear Sky'],
  fAurLbl: ['極光活動', 'Aurora'],
  fDarkLbl: ['夜空暗度', 'Darkness'],
  h2Wave: ['未來 12 小時逐時趨勢', '12-Hour Trend'],
  hrLegRight: ['滑動或點擊查單小時', 'Slide or tap hour'],
  h2Energy: ['太陽風能量', 'Solar Wind Arrival'],
  h2Outlook: ['未來 3 晚極光與晴空展望', '3-Night Outlook'],
  h2Radar: ['周邊 360° 找晴空', '360° Clear-Sky Radar'],
  roadLbl: ['冬季即時路況／封路查詢：', 'Winter road & closure status:'],
  roadNo: ['挪威 Vegvesen ↗', 'Norway Vegvesen ↗'],
  roadSe: ['瑞典 Trafikverket ↗', 'Sweden Trafikverket ↗'],
  roadIs: ['冰島 Umferðin ↗', 'Iceland Umferðin ↗'],
  roadFi: ['芬蘭路況 ↗', 'Finland Roads ↗'],
  h2Cam: ['天文台即時全天空實拍', 'Observatory All-Sky Cameras'],
  subCam: [
    '約每分鐘實拍，請留意畫面內建 UTC 時間戳記確認是否即時：',
    'Live observatory frames — check the embedded UTC timestamp to confirm freshness:'
  ],
  camBtnUit: ['Tromsø 近郊', 'Near Tromsø'],
  camBtnIrf: ['Kiruna', 'Kiruna'],
  camBtnSgo: ['Sodankylä', 'Sodankylä'],
  camBtnKho: ['Svalbard', 'Svalbard'],
  camBtnFmi: ['北歐地磁圖', 'Nordic Mag Map'],
  camBtnUaf: ['Fairbanks', 'Fairbanks'],
  camBtnAmax: ['Yellowknife', 'Yellowknife'],
  camBrightBtn: ['日間過曝・點此看原亮度', 'Daylight dimmed · tap for full'],
  h2Windy: ['即時動態雲圖', 'Live Cloud Map'],
  subWindy: ['已自動對準目前位置，按左下角 ▶ 可播放接下來幾小時雲層移動趨勢：', 'Centered on your location — press ▶ bottom-left to animate cloud movement:'],
  subOv: ['查看綠色／黃色極光帶目前是否覆蓋所在區域（每 5 分鐘自動更新）：', 'Check if the auroral oval covers your region (updates every 5 min):'],
  navHome: ['即時總覽', 'Overview'],
  navDir: ['找晴空', 'Clear Sky'],
  navSat: ['實拍雲圖', 'Live Map'],
  trustSheetTitle: ['指數說明與資料來源', 'Score & Data Sources'],
  tsLblSky: ['晴空度', 'Clear Sky'],
  tsLblAur: ['極光活動', 'Aurora'],
  tsLblDark: ['夜空暗度', 'Darkness'],
  tsLblOut: ['總分', 'Score'],
  tsTierTitle: ['觀測指數分級（0–99，越高越好）', 'Score Tiers (0–99, Higher = Better)'],
  tsT1: ['極佳條件', 'Optimal'],
  tsT2: ['適合觀測', 'Good'],
  tsT3: ['有機會看見', 'Possible'],
  tsT4: ['雲厚／過亮／弱', 'Blocked / Weak'],
  tsSciTitle: ['官方資料來源與驗證', 'Official Data & Verification'],
  linkSolarWind: ['NOAA 太陽風 ↗', 'NOAA Solar Wind ↗'],
  linkGfz: ['GFZ Hp30 ↗', 'GFZ Hp30 ↗'],
  tsSealLink: ['GitHub 開源（MIT・零追蹤）↗', 'Open Source (MIT · Zero Trackers) ↗'],
  tsValReportLink: ['完整驗證報告 ↗', 'Validation Report ↗'],
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
  vTitle: ['連線同步最新天空實況...', 'Syncing live sky & space weather...'],
  vLead: ['結合官方分層晴空預報、NOAA 即時衛星與天文暗空倒數。', 'Combining official layered clouds, NOAA solar wind & twilight countdown.'],
  ringGrade: ['計算中', 'Loading'],
  fSkySub: ['讀取中...', 'Loading...'],
  fAurSub: ['讀取中...', 'Loading...'],
  fDarkSub: ['讀取中...', 'Loading...'],
  fcNextTxt: ['未來 1 小時預估：計算中...', 'Next 1h est.: Calculating...'],
  fcConfBtn: ['說明 ›', 'Why? ›'],
  pMet: ['Yr.no 官方 ↗', 'Yr.no Official ↗'],
  syncTime: ['同步中', 'Syncing...'],
  energyBanner: ['讀取衛星即時太陽風中...', 'Loading live NOAA solar wind...'],
  etaHint: ['時間軸已換算為到達地球的當地時間', 'Time axis shows estimated Earth arrival'],
  homeBest: ['載入中...', 'Loading...'],
  compassSummary: ['掃描周邊晴空分佈中...', 'Scanning surrounding clear skies...'],
  tsLiveBadge: ['計算中', 'Loading'],
  tsDiagTxt: ['正在分析主要影響因子...', 'Analyzing key factor...'],
  tsConfRow: ['確認氣象與衛星同步狀態中...', 'Checking forecast & satellite sync...']
};

const ARIA_LABELS = {
  redBtn: ['紅光夜視模式', 'Red-light night vision', true],
  alertBtn: ['螢幕常亮監測提醒', 'Screen-on aurora monitor', true],
  trustBtn: ['指數說明與資料來源', 'Score & data sources', true],
  refBtn: ['立即更新', 'Sync now', true],
  gpsBtn: ['GPS 定位', 'Use GPS location', true],
  shareBtn: ['分享預報連結', 'Share forecast link', true],
  ringBtn: ['查看指數說明與資料來源', 'View score details and sources', false],
  trustCloseBtn: ['關閉', 'Close', false],
  pickerCloseBtn: ['關閉', 'Close', false],
  lineTipClose: ['關閉提示', 'Dismiss tip', false]
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
  document.title = en ? 'Nordic Aurora Radar · Live Global Forecast' : '極光即時雷達｜北歐＆全球即時預報';

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
      ? `<span class="leg-dot" style="background:var(--green);"></span>Clear Sky % ｜ <span class="leg-dot" style="background:var(--purple);"></span>Top Score`
      : `<span class="leg-dot" style="background:var(--green);"></span>綠線＝晴空｜<span class="leg-dot" style="background:var(--purple);"></span>紫柱＝上方指數`;
  }

  const rl = $('radarLeg');
  if (rl) {
    rl.innerHTML = en
      ? `<span>3h avg clear:</span><span><span class="leg-dot" style="background:var(--green);"></span>✓ ≥65%</span><span><span class="leg-dot" style="background:var(--amber);"></span>~ 35–64%</span><span><span class="leg-dot" style="background:var(--red);"></span>✕ &lt;35% / ⚠ Wind</span>`
      : `<span>未來 3h 均晴空：</span><span><span class="leg-dot" style="background:var(--green);"></span>✓ ≥65%</span><span><span class="leg-dot" style="background:var(--amber);"></span>~ 35–64%</span><span><span class="leg-dot" style="background:var(--red);"></span>✕ 厚雲 / ⚠ 強風雪</span>`;
  }

  const ovCapEl = $('ovCap');
  if (ovCapEl) {
    const ovTxt = en
      ? 'Source: NOAA SWPC OVATION Live Model (Green = aurora, Yellow/Red = intense)'
      : '資料來源：NOAA SWPC OVATION 即時模型（綠色＝有極光、黃紅＝強爆發）';
    ovCapEl.innerHTML = `<a class="src-link" target="_blank" rel="noopener noreferrer" href="https://www.spaceweather.gov/products/aurora-30-minute-forecast">${ovTxt} ↗</a>`;
  }

  const tsG = $('tsStatGrid');
  if (tsG) {
    tsG.innerHTML = en
      ? `<div class="ts-stat"><strong>Sun 0.006° · Mag 0.24°</strong><span>JPL DE441 (Moon ≤0.74°) · IGRF-14</span></div>` +
        `<div class="ts-stat"><strong>14 NOAA Space Feeds</strong><span>1m L1 Wind · Kp · GOES · OVATION · Dst</span></div>` +
        `<div class="ts-stat"><strong>METAR Cloud Nowcast</strong><span>Live airport ceilometers ≤55 km (+0–3h)</span></div>` +
        `<div class="ts-stat"><strong>Layered Cloud Check</strong><span>Yr.no 2.5km Nordics · Dual-NWP Global</span></div>`
      : `<div class="ts-stat"><strong>太陽 0.006°・地磁 0.24°</strong><span>JPL 日月曆（月 ≤0.74°）・IGRF-14</span></div>` +
        `<div class="ts-stat"><strong>14 項 NOAA 太空天氣</strong><span>1m 太陽風・Kp・GOES・OVATION・Dst</span></div>` +
        `<div class="ts-stat"><strong>機場雷射短時校正</strong><span>55 km 內即時 METAR 融合（+0–3h）</span></div>` +
        `<div class="ts-stat"><strong>分層雲量與共識比對</strong><span>北歐 Yr.no 2.5km・全球雙模型</span></div>`;
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
        : '為何現在是 <strong id="tsLiveTotal">--</strong> 分？（越高越好）';
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
