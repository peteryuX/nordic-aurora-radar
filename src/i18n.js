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
  lineTip: [
    '若在 App 內建瀏覽器無法使用 GPS，請改用 Safari / Chrome 開啟，或直接點上方地名切換。',
    'If GPS is blocked in an in-app browser, open in Safari/Chrome or tap the city name above.'
  ],
  clkLbl: ['當地', 'Local'],
  pickerGrpNordic: ['北歐極光帶', 'Nordic Belt'],
  pickerGrpNa: ['北美＆冰島', 'N. America & Iceland'],
  pickerGrpSouth: ['南半球極光', 'Southern Hemisphere'],
  searchBtn: ['搜尋', 'Go'],
  ringSubLbl: ['觀測指數', 'Score'],
  fSkyLbl: ['晴空率', 'Clear Sky'],
  fAurLbl: ['極光活動', 'Aurora'],
  fDarkLbl: ['夜空暗度', 'Darkness'],
  h2Wave: ['未來 12 小時逐時趨勢', '12-Hour Trend'],
  hrLegRight: ['點圖表查單小時', 'Tap hour'],
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
  h2Windy: ['即時動態雲圖', 'Live Cloud Map'],
  subWindy: ['已自動對準目前位置，按左下角 ▶ 可播放接下來幾小時雲層移動趨勢：', 'Centered on your location — press ▶ bottom-left to animate cloud movement:'],
  subOv: ['查看綠色／黃色極光帶目前是否覆蓋所在區域（每 5 分鐘自動更新）：', 'Check if the auroral oval covers your region (updates every 5 min):'],
  navHome: ['即時總覽', 'Overview'],
  navDir: ['找晴空', 'Clear Sky'],
  navSat: ['實拍雲圖', 'Live Map'],
  trustSheetTitle: ['指數算法、即時遙測與拍攝貼士', 'Formula, Telemetry & Photo Tips'],
  tsLblSky: ['晴空度', 'Clear Sky'],
  tsLblAur: ['極光活動', 'Aurora'],
  tsLblDark: ['夜空暗度', 'Darkness'],
  tsLblOut: ['總分', 'Score'],
  tsPhotoTitle: ['極光實拍防踩雷 3 重點', '3 Essential Aurora Photo Tips'],
  tsTierTitle: ['分數越高越適合看（0–99 分級與三因子公式）', 'Higher = Better (0–99 Tiers & 3-Pillar Formula)'],
  tsT1: ['極佳條件', 'Optimal'],
  tsT2: ['適合觀測', 'Good'],
  tsT3: ['有機會看見', 'Possible'],
  tsT4: ['雲厚／過亮／弱', 'Blocked / Weak'],
  tsSciTitle: ['科學驗證與官方資料來源', 'Scientific Verification & Official Sources'],
  linkSolarWind: ['NOAA 太陽風 ↗', 'NOAA Solar Wind ↗'],
  linkGfz: ['GFZ Hp30 ↗', 'GFZ Hp30 ↗'],
  tsPrivTitle: ['隱私與安全信任章', 'Privacy & Security Seal'],
  tsSeal1: ['嚴格 CSP 白名單・零第三方 JS', 'Strict CSP · Zero 3rd-Party JS'],
  tsSeal2: ['零 Cookie・零追蹤碼', 'Zero Cookies · Zero Trackers'],
  tsSeal3: ['GPS 僅留存本機瀏覽器', 'GPS Stays Local in Browser'],
  tsSealLink: ['GitHub MIT 開源原始碼 ↗', 'MIT Open Source on GitHub ↗'],
  tsPwaTip: [
    '離線小提示：Safari 點「分享 → 加入主畫面」或 Chrome 點「安裝應用程式」，即可在極區無訊號時秒開快取。',
    'Offline tip: Add to Home Screen (Safari Share / Chrome Install) for instant cached access in no-signal zones.'
  ],
  tsLegalFoot: [
    '氣象：MET Norway (CC BY 4.0) / Open-Meteo；太空天氣：NOAA SWPC (Public Domain)。僅供觀星參考，冬季行車請以當地交通管制為準。',
    'Weather: MET Norway (CC BY 4.0) / Open-Meteo; Space weather: NOAA SWPC (Public Domain). For stargazing reference only — obey local winter road closures.'
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
  tsDiagTxt: ['正在解析即時瓶頸與加權係數...', 'Analyzing live bottleneck & weighting factors...'],
  tsConfRow: ['讀取雙模型雲量差與 NOAA 衛星延遲中...', 'Checking dual-model cloud spread & NOAA latency...'],
  tsLimitTitle: ['物理與預報極限（誠實說明）', 'Physical & Forecast Limits']
};

const ARIA_LABELS = {
  redBtn: ['紅光夜視模式', 'Red-light night vision', true],
  alertBtn: ['螢幕常亮監測提醒', 'Screen-on aurora monitor', true],
  trustBtn: ['算法、數據與拍攝貼士', 'Formula, telemetry & photo tips', true],
  refBtn: ['立即更新', 'Sync now', true],
  gpsBtn: ['GPS 定位', 'Use GPS location', true],
  shareBtn: ['分享預報連結', 'Share forecast link', true],
  ringBtn: ['查看指數算法與可信度', 'View score formula and credibility', false],
  trustCloseBtn: ['關閉', 'Close', false]
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
  if (ci) ci.placeholder = en ? 'Search city (e.g. Akureyri, Fairbanks, Lake Tekapo)' : '輸入中／英文地名（例：冰島、特羅姆瑟、蒂卡波）';

  const hrl = $('hrLegLeft');
  if (hrl) {
    hrl.innerHTML = en
      ? `<span class="leg-dot" style="background:var(--green);"></span>Clear Sky % ｜ <span class="leg-dot" style="background:#a855f7;"></span>Top Score`
      : `<span class="leg-dot" style="background:var(--green);"></span>綠線＝晴空｜<span class="leg-dot" style="background:#a855f7;"></span>紫柱＝上方指數`;
  }

  const rl = $('radarLeg');
  if (rl) {
    rl.innerHTML = en
      ? `<span><span class="leg-dot" style="background:var(--green);"></span>✓ Clear ≥65%</span><span><span class="leg-dot" style="background:var(--amber);"></span>~ Partly 35–64%</span><span><span class="leg-dot" style="background:var(--red);"></span>✕ Cloudy &lt;35% / ⚠ Wind</span>`
      : `<span><span class="leg-dot" style="background:var(--green);"></span>✓ 晴朗 ≥65%</span><span><span class="leg-dot" style="background:var(--amber);"></span>~ 局部 35–64%</span><span><span class="leg-dot" style="background:var(--red);"></span>✕ 厚雲 / ⚠ 強風雪</span>`;
  }

  const ovCapEl = $('ovCap');
  if (ovCapEl) {
    const ovTxt = en
      ? 'Source: NOAA SWPC OVATION Live Model (Green = aurora, Yellow/Red = intense)'
      : '資料來源：NOAA SWPC OVATION 即時模型（綠色＝有極光、黃紅＝強爆發）';
    ovCapEl.innerHTML = `<a class="src-link" target="_blank" rel="noopener noreferrer" href="https://www.spaceweather.gov/products/aurora-30-minute-forecast">${ovTxt} ↗</a>`;
  }

  const tsP = $('tsPillars');
  if (tsP) {
    tsP.innerHTML = en
      ? `<li><strong>Clear Sky</strong>: Low/mid clouds, fog & precipitation weigh heavily, high cirrus 30% (capped at total +8%), smooth nonlinear exponent 0.85→0.72 during bright storms.</li>` +
        `<li><strong>Aurora</strong>: Fuses 14 live NOAA feeds (causal 3-pt L1 wind + bow-shock propagation, Geospace 1h Kp, bilinear OVATION, HPI GW, dual GOES, Kyoto Dst, WSA-ENLIL CME & SWPC alerts).</li>` +
        `<li><strong>Darkness</strong>: Sun must drop below -4° (-12° full dark), with Krisciunas–Schaefer lunar opposition surge tapering automatically during bright storms.</li>`
      : `<li><strong>晴空度</strong>：低雲／中雲／霧與降水計重度遮蔽、高捲雲以 30% 計（上限為總雲量 +8%），採平滑非線性指數 0.85→0.72（強極光雲縫自動放寬）。</li>` +
        `<li><strong>極光活動</strong>：整合 NOAA 14 源（L1 因果 3 點濾波與官方彈道傳播、Geospace 1h Kp、OVATION 雙線性、HPI、雙 GOES、京都 Dst 環電流、WSA-ENLIL 與 SWPC 警報）。</li>` +
        `<li><strong>夜空暗度</strong>：太陽需低於 -4°（-12° 全暗），並依 Krisciunas–Schaefer 月光衝日效應與極光亮度動態調整扣分。</li>`;
  }

  const tsG = $('tsStatGrid');
  if (tsG) {
    tsG.innerHTML = en
      ? `<div class="ts-stat"><strong>NASA JPL 0.006°</strong><span>22 DE441 sun/moon checks</span></div>` +
        `<div class="ts-stat"><strong>17,255h NASA OMNI</strong><span>Geomagnetic AUC 0.92–0.94 (excl. clouds)</span></div>` +
        `<div class="ts-stat"><strong>14 NOAA Live Feeds</strong><span>L1 · MHD · Dst · ENLIL</span></div>` +
        `<div class="ts-stat"><strong>2.5km Yr.no</strong><span>Dual-model cloud check</span></div>`
      : `<div class="ts-stat"><strong>NASA JPL 0.006°</strong><span>22 點 DE441 日月校準</span></div>` +
        `<div class="ts-stat"><strong>17,255h NASA 盲測</strong><span>地磁預測 AUC 0.92–0.94（不含雲層）</span></div>` +
        `<div class="ts-stat"><strong>14 NOAA 即時源</strong><span>L1・MHD・Dst・ENLIL</span></div>` +
        `<div class="ts-stat"><strong>2.5km Yr.no</strong><span>MET Norway 雙模型比對</span></div>`;
  }

  if (!hasLiveState) {
    applyMap(LOADING_PLACEHOLDER_MAP);
    const hd = $('hourDetail');
    if (hd) {
      hd.innerHTML = en
        ? '<span>Tap any hour on the chart for clear sky %, feels-like temp & moon</span>'
        : '<span>點擊圖上任一時段查看晴空率、體感溫度與月光</span>';
    }
    const tlt = $('tsLiveTitle');
    if (tlt) {
      tlt.innerHTML = en
        ? 'Why is it <strong id="tsLiveTotal">--</strong>/100 now? (Higher = Better)'
        : '為何現在是 <strong id="tsLiveTotal">--</strong> 分？（分數越高越好）';
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
