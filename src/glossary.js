/**
 * Single Source of Truth for all core bilingual UI terms (zh-TW / EN).
 * Edit a term here once to keep engine, charts, i18n, app, and tests 100% consistent.
 * Zero external dependencies — pure ES module safe for browser, Node tests, and Service Worker cache.
 */

export const TERMS = Object.freeze({
  // Core Metrics
  score:         Object.freeze({ zh: '觀測指數', en: 'Score' }),
  scoreShort:    Object.freeze({ zh: '指數',     en: 'Score' }),
  clearSky:      Object.freeze({ zh: '晴空率',   en: 'Clear sky' }),
  clearShort:    Object.freeze({ zh: '晴空',     en: 'Clear' }),
  aurora:        Object.freeze({ zh: '極光活動', en: 'Aurora' }),
  darkness:      Object.freeze({ zh: '夜空暗度', en: 'Darkness' }),
  darkShort:     Object.freeze({ zh: '暗度',     en: 'Dark' }),
  darkFull:      Object.freeze({ zh: '天文暗空', en: 'Astro dark' }),

  // Unified 4 Score Tiers (65 / 40 / 18)
  tier: Object.freeze({
    excellent: Object.freeze({ zh: '極佳',     en: 'Excellent' }),
    good:      Object.freeze({ zh: '適合觀測', en: 'Good' }),
    goodShort: Object.freeze({ zh: '適合',     en: 'Good' }),
    fair:      Object.freeze({ zh: '普通',     en: 'Fair' }),
    low:       Object.freeze({ zh: '偏低',     en: 'Low' })
  }),

  // Sky / Environment / Gate Status
  status: Object.freeze({
    tooBright:     Object.freeze({ zh: '天色過亮', en: 'Too bright' }),
    twilight:      Object.freeze({ zh: '暮光',     en: 'Twilight' }),
    twilightFull:  Object.freeze({ zh: '暮光漸暗', en: 'Twilight' }),
    outOfZone:     Object.freeze({ zh: '不在極光帶', en: 'Out of zone' }),
    outOfZoneLong: Object.freeze({ zh: '不在極光帶', en: 'Outside auroral zone' }),
    needsStorm:    Object.freeze({ zh: '需更強活動', en: 'Needs storm' }),
    cloudGaps:     Object.freeze({ zh: '雲縫極光', en: 'Cloud gaps' }),
    lowActivity:   Object.freeze({ zh: '極光偏弱', en: 'Low activity' }),
    cloudy:        Object.freeze({ zh: '雲層過厚', en: 'Cloudy' }),
    updating:      Object.freeze({ zh: '更新中',   en: 'Updating' }),
    noDarkSky:     Object.freeze({ zh: '無暗空',   en: 'No dark sky' }),
    closedWinter:  Object.freeze({ zh: '冬季封閉', en: 'Closed in winter' }),
    sea:           Object.freeze({ zh: '海面',     en: 'Sea' })
  }),

  // Sky Conditions (single-word)
  sky: Object.freeze({
    clear:        Object.freeze({ zh: '晴朗', en: 'Clear' }),
    partlyCloudy: Object.freeze({ zh: '多雲', en: 'Partly cloudy' }),
    cloudy:       Object.freeze({ zh: '陰天', en: 'Cloudy' })
  }),

  // Moon & Darkness Timing (kept for diagnostic details; Overview uses unified darkness/darkShort/darkFull)
  moon: Object.freeze({
    label: Object.freeze({ zh: '夜空暗度', en: 'Darkness' }),
    down:  Object.freeze({ zh: '全暗',     en: 'Full dark' })
  }),

  // Solar Wind Early-Warning States (30-60 min L1 upstream radar)
  solarWind: Object.freeze({
    title:      Object.freeze({ zh: '極光即時預警',       en: 'Aurora early warning' }),
    axisTitle:  Object.freeze({ zh: '太陽風能量',         en: 'Solar wind energy' }),
    strong:     Object.freeze({ zh: '可能爆發',           en: 'Burst likely' }),
    active:     Object.freeze({ zh: '可能變亮',           en: 'May brighten' }),
    building:   Object.freeze({ zh: '能量累積',           en: 'Building' }),
    low:        Object.freeze({ zh: '維持平靜',           en: 'Quiet' })
  }),

  // Feature & Navigation Titles
  nav: Object.freeze({
    overview:       Object.freeze({ zh: '總覽',     en: 'Overview' }),
    findClear:      Object.freeze({ zh: '找晴空',   en: 'Find clear skies' }),
    findClearShort: Object.freeze({ zh: '找晴空',   en: 'Clear skies' }),
    nearbyClear:    Object.freeze({ zh: '周邊晴空', en: 'Clear skies nearby' }),
    liveMap:        Object.freeze({ zh: '觀測地圖', en: 'Sky & maps' }),
    cloudMap:       Object.freeze({ zh: '觀測地圖', en: 'Sky & maps' }),
    hourlyTrend:    Object.freeze({ zh: '逐時趨勢', en: 'Hourly trend' }),
    next3Nights:    Object.freeze({ zh: '未來三晚', en: 'Next 3 nights' }),
    range24h:       Object.freeze({ zh: '24 小時', en: '24h' })
  }),

  // Location Source & Freshness
  location: Object.freeze({
    myLocation: Object.freeze({ zh: '目前位置',     en: 'My location' }),
    useMyLoc:   Object.freeze({ zh: '使用目前位置', en: 'Use my location' }),
    local:      Object.freeze({ zh: '當地',         en: 'Local' }),
    failed:     Object.freeze({ zh: '⚠ 定位失敗',  en: '⚠ Location failed' }),
    justNow:    Object.freeze({ zh: '剛剛更新',     en: 'Just now' })
  }),

  // Outlook & Chart Accents
  best:         Object.freeze({ zh: '最佳', en: 'Best' }),
  tomorrow:     Object.freeze({ zh: '明天', en: 'Tomorrow' }),
  peak:         Object.freeze({ zh: '約',   en: 'Peak' }),
  confidence:   Object.freeze({ zh: '可信度', en: 'Confidence' }),
  nowcastShort: Object.freeze({ zh: '即時', en: 'Live' }),
  trendShort:   Object.freeze({ zh: '趨勢', en: 'Trend' }),
  trendRef:     Object.freeze({ zh: '趨勢參考', en: 'Trend' }),
  skyUncertain: Object.freeze({ zh: '雲況變數大', en: 'Uncertain sky' })
});

/**
 * Resolve a `{ zh, en }` glossary entry by boolean or language tag.
 * @param {{ zh: string, en: string }} entry
 * @param {boolean|string} langOrEn - `true`/`'en'` for English, otherwise zh-TW
 */
export function term(entry, langOrEn) {
  const en = typeof langOrEn === 'boolean' ? langOrEn : langOrEn === 'en';
  return en ? entry.en : entry.zh;
}
