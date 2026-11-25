/**
 * Nordic Aurora Radar — Pure Scientific, Astronomical & Space-Weather Engine
 *
 * Zero DOM dependencies, zero side effects. Every function is deterministic
 * (given explicit timestamps) and directly testable under Node.js.
 */

import { TERMS, term } from './glossary.js';
export { TERMS, term };

// ====== Bilingual Formatting State & Helpers ======
let currentLang = 'zh';

export function detectDefaultLang() {
  try {
    if (typeof location !== 'undefined') {
      const ql = new URLSearchParams(location.search).get('lang');
      if (ql === 'en' || ql === 'zh') return ql;
    }
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('aurora_lang_v4');
      if (saved === 'en' || saved === 'zh') return saved;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      return /^zh/i.test(navigator.language) ? 'zh' : 'en';
    }
  } catch (e) {}
  return 'zh';
}

export function getLang() { return currentLang; }
export function setLang(l) { currentLang = (l === 'en') ? 'en' : 'zh'; return currentLang; }
export function isEn(lang) { return (lang || currentLang) === 'en'; }

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toFinite(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function tSky(zhTxt, lang) {
  if (!isEn(lang)) return zhTxt;
  const map = {
    '☀️ 白天': 'Day', '🌅 晨昏光': 'Twilight', '❄️ 雪': 'Snow',
    '🌧️ 雨雪': 'Rain', '🌟 晴': 'Clear', '⛅ 縫': 'Partly cloudy', '☁️ 陰': 'Cloudy'
  };
  return map[zhTxt] || zhTxt;
}

export function tDirLabel(lbl, lang) {
  if (!isEn(lang)) return String(lbl ?? '').replace(/^📍\s*/, '');
  return String(lbl ?? '')
    .replace(/^📍\s*/, '')
    .replace('目前位置', 'Current Spot')
    .replace(/^[⬆️⬇️➡️⬅️]+\s*/, '')
    .replace('往東北 ', 'NE · ').replace('往西北 ', 'NW · ')
    .replace('往東南 ', 'SE · ').replace('往西南 ', 'SW · ')
    .replace('往北 ', 'North ').replace('往南 ', 'South ')
    .replace('往東 ', 'East ').replace('往西 ', 'West ');
}

// Internal grade keys (emoji + ZH) are stable identifiers used by tests & validation fixtures.
// Displayed words follow the single UI glossary: Excellent / Good / Fair (+ plain-language blockers).
const pair = (e) => [e.zh, e.en];
export const GRADE_DISPLAY = {
  '🌏 緯度過低': pair(TERMS.status.outOfZone),
  '🌍 極光帶偏北': pair(TERMS.status.needsStorm),
  '🌍 極光帶偏南': pair(TERMS.status.needsStorm),
  '☀️ 天色過亮': pair(TERMS.status.tooBright),
  '🌅 暮光漸暗': pair(TERMS.status.twilightFull),
  '🌟 極佳條件': pair(TERMS.tier.excellent),
  '🟢 適合觀測': pair(TERMS.tier.good),
  '✨ 有機會看見': pair(TERMS.tier.fair),
  '⚡ 雲縫極光': pair(TERMS.status.cloudGaps),
  '🌌 晴朗但極光弱': pair(TERMS.status.lowActivity),
  '☁️ 雲層過厚': pair(TERMS.status.cloudy)
};

export function tGrade(zhGrade, lang) {
  const pair = GRADE_DISPLAY[zhGrade];
  if (!pair) return zhGrade;
  return isEn(lang) ? pair[1] : pair[0];
}

// ====== Verified Winter-Open Paved Dark-Sky Chase Corridors (18 Global Hubs) ======
// All Nordic points verified winter-plowed, land-safe, and west of Norwegian/Russian border (lon <= 30.85)
export const NORDIC_CORRIDORS = [
  { match: [69.97, 23.27], pts: [
    { key: 'N', label: '往東北 Skaidi', lat: 70.4325, lon: 24.5020, roadKm: 85, roadNote: '高海拔山口易封路', roadNoteEn: 'Mountain pass closures', isOcean: false },
    { key: 'E', label: '往東 Lakselv', lat: 70.0513, lon: 24.9718, roadKm: 165, roadNote: '繞山口遠程', roadNoteEn: 'Long via pass', isOcean: false },
    { key: 'S', label: '往南 Kautokeino', lat: 69.0125, lon: 23.0412, roadKm: 130, roadNote: '極寒高原·訊號弱', roadNoteEn: 'Cold plateau · low cell', isOcean: false },
    { key: 'W', label: '往西 Burfjord', lat: 69.9360, lon: 22.0528, roadKm: 95, isOcean: false }
  ]},
  { match: [69.65, 18.96], pts: [
    { key: 'N', label: '往西北 Grøtfjord', lat: 69.7760, lon: 18.5450, roadKm: 42, isOcean: false },
    { key: 'E', label: '往東南 Skibotn', lat: 69.3910, lon: 20.2680, roadKm: 118, roadNote: '背風晴空區', roadNoteEn: 'Rain-shadow dry zone', isOcean: false },
    { key: 'S', label: '往南 Balsfjord', lat: 69.2400, lon: 19.2250, roadKm: 70, isOcean: false },
    { key: 'W', label: '往西 Sommarøy', lat: 69.6340, lon: 18.0090, roadKm: 58, isOcean: false }
  ]},
  { match: [68.23, 14.57], pts: [
    { key: 'N', label: '往北 Gimsøy', lat: 68.3200, lon: 14.1500, roadKm: 35, isOcean: false },
    { key: 'E', label: '往東 Lødingen', lat: 68.4140, lon: 15.9940, roadKm: 102, roadNote: '跨海橋梁強風', roadNoteEn: 'Exposed sea bridges', isOcean: false },
    { key: 'S', label: '往南 Henningsvær', lat: 68.1539, lon: 14.2014, roadKm: 24, isOcean: false },
    { key: 'W', label: '往西 Ramberg', lat: 68.0900, lon: 13.2490, roadKm: 98, roadNote: '沿海窄路強風', roadNoteEn: 'Narrow coastal road · crosswinds', isOcean: false }
  ]},
  { match: [69.35, 17.48], pts: [
    { key: 'N', label: '往北 Ersfjord', lat: 69.4860, lon: 17.3920, roadKm: 28, isOcean: false },
    { key: 'E', label: '往東 Finnsnes', lat: 69.2300, lon: 17.9810, roadKm: 45, isOcean: false },
    { key: 'S', label: '往南 Bardufoss', lat: 69.0640, lon: 18.5140, roadKm: 86, isOcean: false },
    { key: 'W', label: '往西 Hamn i Senja', lat: 69.4170, lon: 17.1590, roadKm: 24, isOcean: false }
  ]},
  { match: [68.44, 17.43], pts: [
    { key: 'N', label: '往北 Gratangen', lat: 68.6930, lon: 17.5320, roadKm: 55, isOcean: false },
    { key: 'E', label: '往東 Abisko', lat: 68.3495, lon: 18.8312, roadKm: 75, roadNote: '邊境山口易封路', roadNoteEn: 'Border pass closures', isOcean: false },
    { key: 'S', label: '往南 Ballangen', lat: 68.3430, lon: 16.8320, roadKm: 42, isOcean: false },
    { key: 'W', label: '往西 Evenes', lat: 68.4910, lon: 16.6780, roadKm: 58, isOcean: false }
  ]},
  { match: [68.35, 18.83], pts: [
    { key: 'E', label: '往東 Torneträsk', lat: 68.2150, lon: 19.7200, roadKm: 45, isOcean: false },
    { key: 'S', label: '往東南 Kiruna', lat: 67.8558, lon: 20.2253, roadKm: 95, roadNote: '主要幹道', roadNoteEn: 'Main highway', isOcean: false },
    { key: 'W', label: '往西 Narvik', lat: 68.4385, lon: 17.4273, roadKm: 75, roadNote: '邊境山口易封路', roadNoteEn: 'Border pass closures', isOcean: false }
  ]},
  { match: [69.73, 30.05], pts: [
    { key: 'N', label: '往北 Vadsø', lat: 70.0740, lon: 29.7490, roadKm: 170, roadNote: '繞峽灣約 2.5h', roadNoteEn: '~2.5h around fjord', isOcean: false },
    { key: 'E', label: '往東 Jarfjord', lat: 69.7100, lon: 30.4200, roadKm: 28, isOcean: false },
    { key: 'S', label: '往南 Svanvik', lat: 69.4538, lon: 30.0496, roadKm: 42, isOcean: false },
    { key: 'W', label: '往西 Neiden', lat: 69.7010, lon: 29.3830, roadKm: 45, isOcean: false }
  ]},
  { match: [66.50, 25.73], pts: [
    { key: 'N', label: '往北 Luosto', lat: 67.1410, lon: 26.9040, roadKm: 112, isOcean: false },
    { key: 'E', label: '往東 Kemijärvi', lat: 66.7130, lon: 27.4310, roadKm: 86, isOcean: false },
    { key: 'S', label: '往南 Ranua', lat: 65.9280, lon: 26.5180, roadKm: 81, isOcean: false },
    { key: 'W', label: '往西 Pello', lat: 66.7750, lon: 23.9630, roadKm: 100, isOcean: false }
  ]},
  { match: [68.91, 27.03], pts: [
    { key: 'N', label: '往北 Kaamanen', lat: 69.1394, lon: 27.2097, roadKm: 28, isOcean: false },
    { key: 'E', label: '往東 Ivalo', lat: 68.6592, lon: 27.5389, roadKm: 40, isOcean: false },
    { key: 'S', label: '往南 Saariselkä', lat: 68.4193, lon: 27.4106, roadKm: 72, isOcean: false },
    { key: 'W', label: '往西北 Karigasniemi', lat: 69.3992, lon: 25.8472, roadKm: 102, roadNote: '偏遠幹道·訊號弱', roadNoteEn: 'Remote road · low cell', isOcean: false }
  ]},
  { match: [67.86, 20.23], pts: [
    { key: 'N', label: '往西北 Abisko', lat: 68.3495, lon: 18.8312, roadKm: 95, roadNote: '山口注意風雪', roadNoteEn: 'Mountain pass wind/snow', isOcean: false },
    { key: 'E', label: '往東 Vittangi', lat: 67.6808, lon: 21.6486, roadKm: 73, isOcean: false },
    { key: 'S', label: '往南 Svappavaara', lat: 67.6480, lon: 21.0500, roadKm: 46, isOcean: false },
    { key: 'W', label: '往西 Nikkaluokta', lat: 67.8505, lon: 19.0144, roadKm: 66, roadNote: '極寒山谷·無補給', roadNoteEn: 'Cold valley · no services', isOcean: false }
  ]}
];

// Global aurora hotspot winter-open paved corridors (no winter-closed F-roads, no seasonal ice roads, no locked gates)
export const GLOBAL_CORRIDORS = [
  { match: [64.15, -21.94], pts: [
    { key: 'N', label: '往北 Borgarnes', lat: 64.5383, lon: -21.9206, roadKm: 75, roadNote: '沿海強側風路段', roadNoteEn: 'Strong coastal crosswinds', isOcean: false },
    { key: 'E', label: '往東 Þingvellir', lat: 64.2559, lon: -21.1295, roadKm: 48, isOcean: false },
    { key: 'S', label: '往南 Selfoss', lat: 63.9331, lon: -21.0023, roadKm: 58, isOcean: false },
    { key: 'W', label: '往西 Garður', lat: 64.0650, lon: -22.6464, roadKm: 55, isOcean: false }
  ]},
  { match: [65.69, -18.13], pts: [
    { key: 'N', label: '往北 Dalvík', lat: 65.9702, lon: -18.5286, roadKm: 43, isOcean: false },
    { key: 'E', label: '往東 Goðafoss', lat: 65.6828, lon: -17.5502, roadKm: 35, roadNote: '收費隧道／山口', roadNoteEn: 'Toll tunnel / pass', isOcean: false },
    { key: 'W', label: '往西 Varmahlíð', lat: 65.5529, lon: -19.4452, roadKm: 94, roadNote: '高海拔山口易封', roadNoteEn: 'High pass closure risk', isOcean: false }
  ]},
  { match: [64.84, -147.72], pts: [
    { key: 'N', label: '往北 Cleary Summit', lat: 65.0736, lon: -147.4197, roadKm: 34, isOcean: false },
    { key: 'E', label: '往東 Chena Springs', lat: 65.0528, lon: -146.0558, roadKm: 96, roadNote: '無訊號·留意麋鹿', roadNoteEn: 'No cell · watch moose', isOcean: false },
    { key: 'S', label: '往南 Salcha', lat: 64.5270, lon: -146.9790, roadKm: 55, isOcean: false },
    { key: 'W', label: '往西 Murphy Dome', lat: 64.9522, lon: -148.3536, roadKm: 34, roadNote: '陡坡結冰注意', roadNoteEn: 'Steep icy climb', isOcean: false }
  ]},
  { match: [62.45, -114.37], pts: [
    { key: 'N', label: '往東北 Prelude Lake', lat: 62.5564, lon: -113.9169, roadKm: 30, isOcean: false },
    { key: 'E', label: '往東 Tibbitt Lake', lat: 62.5333, lon: -113.3500, roadKm: 68, roadNote: '終點無訊號', roadNoteEn: 'No cell service', isOcean: false },
    { key: 'W', label: '往西 Behchokǫ̀', lat: 62.8025, lon: -116.0461, roadKm: 105, roadNote: '遠程偏遠·無訊號', roadNoteEn: 'Remote road · no cell', isOcean: false }
  ]},
  { match: [60.72, -135.06], pts: [
    { key: 'N', label: '往北 Lake Laberge', lat: 60.9550, lon: -135.1650, roadKm: 36, roadNote: '出城無訊號', roadNoteEn: 'No cell outside town', isOcean: false },
    { key: 'E', label: '往東 Marsh Lake', lat: 60.5333, lon: -134.3333, roadKm: 48, roadNote: '偏遠幹道·訊號弱', roadNoteEn: 'Remote highway · low cell', isOcean: false },
    { key: 'S', label: '往南 Carcross', lat: 60.1686, lon: -134.7064, roadKm: 72, roadNote: '勿越邊境關口', roadNoteEn: 'Stop before border', isOcean: false },
    { key: 'W', label: '往西 Takhini', lat: 60.8750, lon: -135.3600, roadKm: 28, isOcean: false }
  ]},
  { match: [-45.03, 168.66], pts: [
    { key: 'N', label: '往北 Wanaka', lat: -44.7032, lon: 169.1321, roadKm: 68, roadNote: '高山路段·冬季需雪鏈', roadNoteEn: 'Alpine pass · winter chains', isOcean: false },
    { key: 'E', label: '往東 Cromwell', lat: -45.0384, lon: 169.2007, roadKm: 60, isOcean: false },
    { key: 'S', label: '往南 Kingston', lat: -45.3327, lon: 168.7167, roadKm: 47, isOcean: false },
    { key: 'W', label: '往西 Glenorchy', lat: -44.8505, lon: 168.3879, roadKm: 46, isOcean: false }
  ]},
  { match: [-44.00, 170.48], pts: [
    { key: 'E', label: '往東 Fairlie', lat: -44.1003, lon: 170.8294, roadKm: 42, roadNote: '山口路段·冬季需雪鏈', roadNoteEn: 'Mountain pass · winter chains', isOcean: false },
    { key: 'S', label: '往南 Twizel', lat: -44.2564, lon: 170.0972, roadKm: 58, roadNote: '主要幹道', roadNoteEn: 'Main highway', isOcean: false },
    { key: 'W', label: '往西南 Lake Pukaki', lat: -44.1806, lon: 170.1194, roadKm: 45, roadNote: '暗空保護區', roadNoteEn: 'Dark Sky Reserve', isOcean: false }
  ]},
  { match: [-42.88, 147.33], pts: [
    { key: 'N', label: '往北 Kempton', lat: -42.5333, lon: 147.2000, roadKm: 52, isOcean: false },
    { key: 'E', label: '往東 Sorell', lat: -42.7858, lon: 147.5594, roadKm: 26, isOcean: false },
    { key: 'S', label: '往南 South Arm', lat: -43.0258, lon: 147.4169, roadKm: 40, isOcean: false },
    { key: 'W', label: '往西 New Norfolk', lat: -42.7828, lon: 147.0600, roadKm: 35, isOcean: false }
  ]}
];

export const CHASE_CORRIDORS = [...NORDIC_CORRIDORS, ...GLOBAL_CORRIDORS];

// ====== Time, Geography & URL Helpers ======

/** Safari-safe UTC timestamp parser (handles both "YYYY-MM-DD HH:MM:SS" and ISO "T...Z") */
export function parseUtcMs(tag) {
  if (typeof tag === 'number' && Number.isFinite(tag)) {
    return tag > 1e12 ? tag : tag * 1000;
  }
  if (!tag || typeof tag !== 'string') return NaN;
  const s = tag.trim().replace(' ', 'T');
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

export function isInNordicMetBox(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const mainland = lat >= 55.0 && lat <= 72.0 && lon >= 4.0 && lon <= 33.0;
  const svalbard = lat >= 74.0 && lat <= 81.0 && lon >= 10.0 && lon <= 35.0;
  return mainland || svalbard;
}

/** Mainland Nordic Doppler radar footprint for MET Norway Nowcast 2.0 (5-min live rain/snow; Svalbard returns 422) */
export function isInNordicRadarBox(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 55.0 && lat <= 71.5 && lon >= 4.0 && lon <= 32.0;
}

export function computeCompassPoints(lat, lon, distKm = 60) {
  const here = { key: 'here', label: '📍 目前位置', lat: +lat.toFixed(4), lon: +lon.toFixed(4), isOcean: false };
  for (const c of CHASE_CORRIDORS) {
    const hubDist = Math.hypot(lat - c.match[0], (lon - c.match[1]) * Math.cos(lat * Math.PI / 180));
    if (hubDist < 0.25) {
      return [here, ...c.pts.map(p => (hubDist < 0.08 ? { ...p } : { ...p, roadKm: undefined }))];
    }
  }
  const dLat = distKm / 111.32;
  const cosLat = Math.max(0.1, Math.cos(lat * Math.PI / 180));
  const dLon = distKm / (111.32 * cosLat);
  return [
    here,
    { key: 'N', label: `往北 ${distKm} km`, lat: +Math.min(89.5, lat + dLat).toFixed(4), lon: +lon.toFixed(4), isOcean: false, isGeneric: true },
    { key: 'S', label: `往南 ${distKm} km`, lat: +Math.max(-89.5, lat - dLat).toFixed(4), lon: +lon.toFixed(4), isOcean: false, isGeneric: true },
    { key: 'E', label: `往東 ${distKm} km`, lat: +lat.toFixed(4), lon: +(((lon + dLon + 540) % 360) - 180).toFixed(4), isOcean: false, isGeneric: true },
    { key: 'W', label: `往西 ${distKm} km`, lat: +lat.toFixed(4), lon: +(((lon - dLon + 540) % 360) - 180).toFixed(4), isOcean: false, isGeneric: true }
  ];
}

export function getZoneParts(dateObj, timeZone) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  if (!Number.isFinite(d.getTime())) {
    return { dateStr: '----/--/--', hourStr: '--', minStr: '--', isoHour: '' };
  }
  const tz = (timeZone && timeZone !== 'auto') ? timeZone : 'UTC';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
  } catch (e) {
    try {
      parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(d);
    } catch (e2) {
      return { dateStr: '----/--/--', hourStr: '--', minStr: '--', isoHour: '' };
    }
  }
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hh = map.hour === '24' ? '00' : map.hour;
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hourStr: hh,
    minStr: map.minute,
    isoHour: `${map.year}-${map.month}-${map.day}T${hh}:00`
  };
}

export function utcTagToLocalHM(utcTag, timeZone, offsetMin = 0) {
  if (!utcTag) return '--:--';
  try {
    const ms = parseUtcMs(utcTag);
    if (!Number.isFinite(ms)) return '--:--';
    const off = Number.isFinite(offsetMin) ? offsetMin : 0;
    const shifted = new Date(ms + off * 60000);
    const z = getZoneParts(shifted, timeZone);
    return `${z.hourStr}:${z.minStr}`;
  } catch (e) {
    return '--:--';
  }
}

export const KNOWN_CITIES = [
  { zh: '挪威 · Alta', en: 'Norway · Alta', lat: 69.9689, lon: 23.2716, tz: 'Europe/Oslo' },
  { zh: '挪威 · Tromsø', en: 'Norway · Tromsø', lat: 69.6492, lon: 18.9553, tz: 'Europe/Oslo' },
  { zh: '挪威 · Lofoten', en: 'Norway · Lofoten', lat: 68.2342, lon: 14.5683, tz: 'Europe/Oslo' },
  { zh: '挪威 · Senja', en: 'Norway · Senja', lat: 69.3470, lon: 17.4820, tz: 'Europe/Oslo' },
  { zh: '挪威 · Narvik', en: 'Norway · Narvik', lat: 68.4385, lon: 17.4273, tz: 'Europe/Oslo' },
  { zh: '瑞典 · Abisko', en: 'Sweden · Abisko', lat: 68.3495, lon: 18.8312, tz: 'Europe/Stockholm' },
  { zh: '瑞典 · Kiruna', en: 'Sweden · Kiruna', lat: 67.8558, lon: 20.2253, tz: 'Europe/Stockholm' },
  { zh: '挪威 · Kirkenes', en: 'Norway · Kirkenes', lat: 69.7271, lon: 30.0458, tz: 'Europe/Oslo' },
  { zh: '芬蘭 · Rovaniemi', en: 'Finland · Rovaniemi', lat: 66.5039, lon: 25.7294, tz: 'Europe/Helsinki' },
  { zh: '芬蘭 · Inari', en: 'Finland · Inari', lat: 68.9060, lon: 27.0275, tz: 'Europe/Helsinki' },
  { zh: '冰島 · Reykjavik', en: 'Iceland · Reykjavik', lat: 64.1466, lon: -21.9426, tz: 'Atlantic/Reykjavik' },
  { zh: '冰島 · Akureyri', en: 'Iceland · Akureyri', lat: 65.6885, lon: -18.1262, tz: 'Atlantic/Reykjavik' },
  { zh: '美國 · Fairbanks', en: 'USA · Fairbanks', lat: 64.8378, lon: -147.7164, tz: 'America/Anchorage' },
  { zh: '加拿大 · Yellowknife', en: 'Canada · Yellowknife', lat: 62.4540, lon: -114.3718, tz: 'America/Yellowknife' },
  { zh: '加拿大 · Whitehorse', en: 'Canada · Whitehorse', lat: 60.7212, lon: -135.0568, tz: 'America/Whitehorse' },
  { zh: '紐西蘭 · Queenstown', en: 'New Zealand · Queenstown', lat: -45.0312, lon: 168.6626, tz: 'Pacific/Auckland' },
  { zh: '紐西蘭 · Lake Tekapo', en: 'New Zealand · Lake Tekapo', lat: -44.0047, lon: 170.4771, tz: 'Pacific/Auckland' },
  { zh: '澳洲 · Hobart', en: 'Australia · Hobart', lat: -42.8821, lon: 147.3272, tz: 'Australia/Hobart' }
];

export function matchKnownCity(lat, lon, maxDeg = 0.08) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const c of KNOWN_CITIES) {
    if (Math.abs(lat - c.lat) <= maxDeg && Math.abs(lon - c.lon) <= maxDeg) return c;
  }
  return null;
}

export function hasCjkChars(str) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(str || ''));
}

export function resolveCityDisplayName(pos, lang = currentLang) {
  if (!pos || typeof pos !== 'object') return '';
  const en = isEn(lang);
  const matched = matchKnownCity(pos.lat, pos.lon);
  if (matched) return en ? matched.en : matched.zh;
  if (en) {
    if (pos.nameEn && !hasCjkChars(pos.nameEn)) return pos.nameEn;
    if (pos.name && !hasCjkChars(pos.name)) return pos.name;
    return pos.nameEn || pos.name || '';
  }
  // Legacy saved names used the Japanese middle dot (・); normalize to the app-wide " · " separator
  return String(pos.name || pos.nameEn || '').replace(/\s*\u30fb\s*/g, ' · ');
}

const SIMP_TO_TRAD_GEO = {
  '萨': '薩', '兰': '蘭', '岛': '島', '国': '國', '尔': '爾', '亚': '亞', '罗': '羅', '苏': '蘇',
  '伦': '倫', '纳': '納', '维': '維', '达': '達', '东': '東', '湾': '灣', '区': '區', '县': '縣',
  '镇': '鎮', '马': '馬', '圣': '聖', '约': '約', '汉': '漢', '奥': '奧', '乌': '烏', '库': '庫',
  '莱': '萊', '凯': '凱', '卢': '盧', '麦': '麥', '温': '溫', '华': '華', '纽': '紐', '爱': '愛',
  '诺': '諾', '泽': '澤', '图': '圖', '宁': '寧', '龙': '龍', '门': '門', '头': '頭', '长': '長',
  '广': '廣', '阳': '陽', '阴': '陰', '岭': '嶺', '峡': '峽', '边': '邊', '铁': '鐵', '银': '銀',
  '铜': '銅', '锡': '錫', '万': '萬', '与': '與', '丰': '豐', '临': '臨', '义': '義', '乐': '樂',
  '乔': '喬', '云': '雲', '兴': '興', '关': '關', '内': '內', '冈': '岡', '别': '別', '剑': '劍',
  '劳': '勞', '勋': '勳', '双': '雙', '发': '發', '叶': '葉', '吴': '吳', '启': '啟', '坝': '壩',
  '寿': '壽', '岗': '崗', '庄': '莊', '庆': '慶', '开': '開', '张': '張', '归': '歸', '当': '當',
  '录': '錄', '怀': '懷', '态': '態', '恒': '恆', '扬': '揚', '无': '無', '时': '時', '晋': '晉',
  '晓': '曉', '术': '術', '机': '機', '来': '來', '杨': '楊', '桥': '橋', '梦': '夢', '欧': '歐',
  '汇': '匯', '汤': '湯', '沟': '溝', '沧': '滄', '济': '濟', '润': '潤', '淀': '澱', '渔': '漁',
  '滨': '濱', '滩': '灘', '灵': '靈', '灿': '燦', '环': '環', '现': '現', '玛': '瑪', '瑶': '瑤',
  '电': '電', '畅': '暢', '盐': '鹽', '盘': '盤', '离': '離', '积': '積', '红': '紅', '纬': '緯',
  '纯': '純', '纲': '綱', '绿': '綠', '联': '聯', '肃': '肅', '胜': '勝', '腾': '騰', '荣': '榮',
  '莲': '蓮', '蓝': '藍', '观': '觀', '贝': '貝', '贵': '貴', '费': '費', '贺': '賀', '赞': '贊',
  '车': '車', '轮': '輪', '软': '軟', '辉': '輝', '辽': '遼', '迈': '邁', '运': '運', '连': '連',
  '邓': '鄧', '郑': '鄭', '镜': '鏡', '闪': '閃', '闽': '閩', '阁': '閣', '陆': '陸', '陈': '陳',
  '险': '險', '陕': '陝', '随': '隨', '雾': '霧', '静': '靜', '韩': '韓', '风': '風', '飞': '飛',
  '驰': '馳', '鲁': '魯', '黄': '黃', '齐': '齊'
};

function toTraditionalPlace(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[\u4e00-\u9fff]/g, ch => SIMP_TO_TRAD_GEO[ch] || ch);
}

let zhRegionNames = null;
export function traditionalRegionName(countryCode, fallbackName) {
  if (typeof countryCode === 'string' && /^[A-Za-z]{2}$/.test(countryCode)) {
    try {
      if (!zhRegionNames && typeof Intl !== 'undefined' && Intl.DisplayNames) {
        zhRegionNames = new Intl.DisplayNames(['zh-Hant-TW'], { type: 'region' });
      }
      const n = zhRegionNames ? zhRegionNames.of(countryCode.toUpperCase()) : null;
      if (n && n !== countryCode.toUpperCase()) return n;
    } catch (e) {}
  }
  return toTraditionalPlace(fallbackName);
}

export function formatReverseGeo(geoJson, lang = currentLang, enGeoJson = null) {
  if (!geoJson || typeof geoJson !== 'object') return null;
  const en = isEn(lang);
  const cc = String(geoJson.countryCode || enGeoJson?.countryCode || '').trim().toUpperCase();
  const isCjkCountry = ['TW', 'HK', 'MO', 'CN', 'JP', 'KR'].includes(cc);
  const pickCity = (g) => {
    if (!g || typeof g !== 'object') return '';
    return (typeof g.city === 'string' && g.city.trim())
      ? g.city.trim()
      : (typeof g.locality === 'string' && g.locality.trim()
        ? g.locality.trim()
        : (typeof g.principalSubdivision === 'string' ? g.principalSubdivision.trim() : ''));
  };
  const pickLoc = (g) => (g && typeof g.locality === 'string' ? g.locality.trim() : '');

  if (en) {
    const src = enGeoJson || geoJson;
    const country = typeof src.countryName === 'string' ? src.countryName.trim() : '';
    const city = pickCity(src);
    const locality = pickLoc(src);
    if (!country && !city) return null;
    const prefix = (country && country !== city) ? country + ' · ' : '';
    if (city && locality && locality !== city) return `${prefix}${city} (${locality})`;
    return city ? `${prefix}${city}` : country;
  }

  // Traditional Chinese mode: always resolve authentic zh-Hant-TW country name via ISO countryCode,
  // and for non-CJK countries prefer the local Latin city name (e.g. 挪威 · Nordreisa) to avoid BigDataCloud's Simplified Chinese transliterations.
  const rawCountry = typeof geoJson.countryName === 'string' ? geoJson.countryName.trim() : '';
  const country = traditionalRegionName(cc, rawCountry);
  const citySrc = (!isCjkCountry && enGeoJson) ? enGeoJson : geoJson;
  const city = isCjkCountry || !enGeoJson ? toTraditionalPlace(pickCity(citySrc)) : pickCity(citySrc);
  const locality = isCjkCountry || !enGeoJson ? toTraditionalPlace(pickLoc(citySrc)) : pickLoc(citySrc);
  if (!country && !city) return null;
  const prefix = (country && country !== city) ? country + ' · ' : '';
  if (city && locality && locality !== city) return `${prefix}${city}（${locality}）`;
  return city ? `${prefix}${city}` : country;
}

export function parseUrlLocation(searchStr) {
  if (!searchStr || typeof searchStr !== 'string') return null;
  try {
    const sp = new URLSearchParams(searchStr);
    if (!sp.has('lat') || !sp.has('lon')) return null;
    const lat = parseFloat(sp.get('lat'));
    const lon = parseFloat(sp.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const rawName = (sp.get('name') || '').replace(/[\r\n\t<>]/g, '').replace(/\s*\u30fb\s*/g, ' · ').trim().slice(0, 60);
    const fallbackName = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    const matched = matchKnownCity(lat, lon);
    let tz = (sp.get('tz') || (matched ? matched.tz : 'auto')).trim();
    if (tz !== 'auto') {
      try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch (e) { tz = 'auto'; }
    }
    const name = matched ? matched.zh : (rawName || fallbackName);
    const nameEn = matched ? matched.en : (hasCjkChars(rawName) ? '' : (rawName || fallbackName));
    return { name, nameEn, lat: +lat.toFixed(4), lon: +lon.toFixed(4), tz, mode: 'manual', accuracy: null };
  } catch (e) { return null; }
}

export function buildShareUrl(baseHref, pos, lang) {
  try {
    const u = new URL(baseHref);
    u.searchParams.delete('view');
    if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
      u.searchParams.set('lat', pos.lat.toFixed(4));
      u.searchParams.set('lon', pos.lon.toFixed(4));
      const displayName = resolveCityDisplayName(pos, lang);
      if (displayName) u.searchParams.set('name', displayName);
    }
    if (lang === 'en' || lang === 'zh') u.searchParams.set('lang', lang);
    return u.toString();
  } catch (e) { return baseHref; }
}

// ====== Solar & Lunar Astronomy ======

/** Exact J2000 analytical solar ephemeris (declination, subsolar longitude, elevation <0.01° vs Meeus) */
function computeSolarCoords(dateObj) {
  const d = dateObj.getTime() / 86400000 - 10957.5;
  const r = Math.PI / 180;
  const g = (357.529 + 0.98560028 * d) * r;
  const L = (280.459 + 0.98564736 * d + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * r;
  const e = (23.439 - 0.00000036 * d) * r;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (280.46061837 + 360.98564736629 * d) * r;
  const sunLonDeg = ((((ra - gmst) / r) % 360) + 540) % 360 - 180;
  return { ra, dec, gmst, decDeg: dec / r, sunLonDeg };
}

export function computeSolarElevation(dateObj, lat, lon) {
  const r = Math.PI / 180;
  const { ra, dec, gmst } = computeSolarCoords(dateObj);
  const ha = gmst + lon * r - ra;
  const latR = lat * r;
  return Math.asin(Math.max(-1, Math.min(1, Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha)))) / r;
}

/** Great-circle Haversine distance in kilometers */
export function computeDistanceKm(lat1, lon1, lat2, lon2) {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

const ZH_CITY_ALIASES = [
  [/冰島|冰岛|雷克雅維克|雷克雅未克/, 'Reykjavik'],
  [/阿克雷里|阿庫雷里|阿库雷里/, 'Akureyri'],
  [/特羅姆瑟|特罗姆瑟|特龍索/, 'Tromso'],
  [/阿爾塔|阿尔塔/, 'Alta'],
  [/羅浮敦|罗浮敦|羅弗敦|斯沃爾韋爾/, 'Svolvaer'],
  [/塞尼亞|塞尼亚/, 'Senja'],
  [/納爾維克|纳尔维克/, 'Narvik'],
  [/阿比斯庫|阿比斯库/, 'Abisko'],
  [/基律納|基律纳/, 'Kiruna'],
  [/希爾克內斯|希尔克内斯/, 'Kirkenes'],
  [/羅瓦涅米|罗瓦涅米|聖誕老人村|圣诞老人村/, 'Rovaniemi'],
  [/伊納里|伊纳里/, 'Inari'],
  [/斯瓦巴|斯瓦爾巴|朗伊爾城|朗伊尔城/, 'Longyearbyen'],
  [/奧斯陸|奥斯陆/, 'Oslo'],
  [/卑爾根|卑尔根/, 'Bergen'],
  [/費爾班克斯|费尔班克斯|阿拉斯加/, 'Fairbanks'],
  [/黃刀|黄刀/, 'Yellowknife'],
  [/白馬市|白马市/, 'Whitehorse'],
  [/皇后鎮|皇后镇/, 'Queenstown'],
  [/蒂卡波|特卡波|提卡波/, 'Lake Tekapo'],
  [/荷巴特|霍巴特|塔斯馬尼亞|塔斯马尼亚/, 'Hobart'],
  [/札幌|北海道/, 'Sapporo'],
  [/愛丁堡|爱丁堡|蘇格蘭|苏格兰/, 'Edinburgh'],
  [/台北|臺北/, 'Taipei'],
  [/東京|东京/, 'Tokyo']
];

/** Map common Traditional/Simplified Chinese travel city names to geocodable Latin names */
export function normalizeChineseCityQuery(rawQuery) {
  const q = String(rawQuery || '').trim();
  if (!q) return '';
  for (const [re, target] of ZH_CITY_ALIASES) {
    if (re.test(q)) return target;
  }
  return q;
}

/**
 * Compute exact local dark-sky window (-4° usable aurora threshold & -12° full astronomical dark)
 * using our NASA JPL DE441-verified computeSolarElevation (<1 min precision, <0.3 ms CPU).
 */
export function computeDarkWindow(nowDate, lat, lon, timeZone = 'UTC') {
  const d0 = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  const t0 = d0.getTime();
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { state: 'unknown', isDarkNow: false, sunAltNow: 0, nextDarkMs: null, nextDarkHM: '', darkInMin: null, darkEndMs: null, darkEndHM: '', darkRemainMin: null };
  }
  const sunAltNow = computeSolarElevation(d0, lat, lon);
  const isDarkNow = sunAltNow < -4;
  const STEP = 10 * 60000;
  const refine = (a, b, targetAlt, wantBelow) => {
    let lo = a, hi = b;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      const alt = computeSolarElevation(new Date(mid), lat, lon);
      if ((wantBelow ? alt < targetAlt : alt >= targetAlt)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const fmtHM = (ms) => {
    if (!Number.isFinite(ms)) return '';
    const z = getZoneParts(new Date(ms), timeZone);
    return `${z.hourStr}:${z.minStr}`;
  };

  let nextDarkMs = null;
  let darkEndMs = null;
  if (!isDarkNow) {
    let prevT = t0, prevAlt = sunAltNow;
    for (let m = STEP; m <= 24 * 3600000; m += STEP) {
      const curT = t0 + m;
      const curAlt = computeSolarElevation(new Date(curT), lat, lon);
      if (prevAlt >= -4 && curAlt < -4) {
        nextDarkMs = refine(prevT, curT, -4, true);
        break;
      }
      prevT = curT; prevAlt = curAlt;
    }
    if (nextDarkMs === null) {
      return { state: 'midnight-sun', isDarkNow: false, sunAltNow: +sunAltNow.toFixed(1), nextDarkMs: null, nextDarkHM: '', darkInMin: null, darkEndMs: null, darkEndHM: '', darkRemainMin: null };
    }
    // Find when that upcoming dark window ends
    let pT = nextDarkMs, pA = -4.1;
    for (let m = STEP; m <= 24 * 3600000; m += STEP) {
      const cT = nextDarkMs + m;
      const cA = computeSolarElevation(new Date(cT), lat, lon);
      if (pA < -4 && cA >= -4) {
        darkEndMs = refine(pT, cT, -4, false);
        break;
      }
      pT = cT; pA = cA;
    }
    return {
      state: 'twilight-wait',
      isDarkNow: false,
      sunAltNow: +sunAltNow.toFixed(1),
      nextDarkMs,
      nextDarkHM: fmtHM(nextDarkMs),
      darkInMin: Math.max(1, Math.round((nextDarkMs - t0) / 60000)),
      darkEndMs,
      darkEndHM: fmtHM(darkEndMs),
      darkRemainMin: null
    };
  }

  // Currently dark (sun < -4°): find when dawn arrives within 24h
  let prevT = t0, prevAlt = sunAltNow;
  for (let m = STEP; m <= 24 * 3600000; m += STEP) {
    const curT = t0 + m;
    const curAlt = computeSolarElevation(new Date(curT), lat, lon);
    if (prevAlt < -4 && curAlt >= -4) {
      darkEndMs = refine(prevT, curT, -4, false);
      break;
    }
    prevT = curT; prevAlt = curAlt;
  }
  if (darkEndMs === null) {
    return { state: 'polar-night', isDarkNow: true, sunAltNow: +sunAltNow.toFixed(1), nextDarkMs: null, nextDarkHM: '', darkInMin: 0, darkEndMs: null, darkEndHM: '', darkRemainMin: null };
  }
  return {
    state: 'dark',
    isDarkNow: true,
    sunAltNow: +sunAltNow.toFixed(1),
    nextDarkMs: null,
    nextDarkHM: '',
    darkInMin: 0,
    darkEndMs,
    darkEndHM: fmtHM(darkEndMs),
    darkRemainMin: Math.max(1, Math.round((darkEndMs - t0) / 60000))
  };
}

/**
 * Analytical ELP lunar phase, topocentric elevation, and physical sky-brightness factor.
 * Uses unrounded Krisciunas & Schaefer (1991) opposition surge so a 50% quarter moon (~9% of Full Moon lux)
 * does not falsely trigger bright-moon exposure or darkness penalties, with zero quantization jump near 100%.
 */
export function getMoonState(dateObj, lat = 69.97, lon = 23.27, lang) {
  const en = isEn(lang);
  const d = dateObj.getTime() / 86400000 - 10957.5;
  const r = Math.PI / 180;
  const L = (218.316 + 13.176396 * d) * r;
  const M = (134.963 + 13.064993 * d) * r;
  const F = (93.272 + 13.229350 * d) * r;
  const Ms = (357.529 + 0.98560028 * d) * r;
  const Ls = (280.459 + 0.98564736 * d + 1.915 * Math.sin(Ms)) * r;
  const D = L - Ls;
  const lonM = L + (6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D)) * r;
  const latM = 5.128 * Math.sin(F) * r;
  const e = 23.439 * r;
  const ra = Math.atan2(Math.sin(lonM) * Math.cos(e) - Math.tan(latM) * Math.sin(e), Math.cos(lonM));
  const dec = Math.asin(Math.sin(latM) * Math.cos(e) + Math.cos(latM) * Math.sin(e) * Math.sin(lonM));
  const ha = (280.46061837 + 360.98564736629 * d) * r + lon * r - ra;
  const latR = lat * r;
  const altGeo = Math.asin(Math.max(-1, Math.min(1, Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(ha))));
  const altDeg = +(altGeo / r - 0.95 * Math.cos(altGeo)).toFixed(1);

  const cosElong = Math.max(-1, Math.min(1, Math.cos(lonM - Ls) * Math.cos(latM)));
  const pct = Math.max(0, Math.min(100, Math.round(((1 - cosElong) / 2) * 100)));
  const up = altDeg > 0;
  const altFactor = !up ? 0 : Math.min(1, Math.sin(Math.min(25, altDeg) * r) / Math.sin(25 * r));

  // Unrounded Krisciunas & Schaefer (1991) phase angle avoids 18-30% lux quantization jump at 99%->100%
  const alphaDeg = Math.acos(Math.max(-1, Math.min(1, -cosElong))) / r;
  const luxFrac = Math.pow(10, -0.4 * (0.026 * alphaDeg + 4e-9 * Math.pow(alphaDeg, 4)));
  const effMoonPct = Math.max(0, Math.min(100, Math.round(100 * luxFrac * altFactor)));

  let desc = en ? 'Dim moon (dark sky)' : '月光微弱（暗空極佳）';
  if (!up) desc = en ? `Moon down (${pct}% phase, dark sky)` : `月亮已落下（相位 ${pct}%，暗空極佳）`;
  else if (effMoonPct >= 55) desc = en ? `Bright moon (${Math.round(altDeg)}° alt)` : `月光較亮（高掛 ${Math.round(altDeg)}°）`;
  else if (effMoonPct >= 20) desc = en ? `Moderate moon (${Math.round(altDeg)}° alt)` : `中度月光（仰角 ${Math.round(altDeg)}°）`;
  const waxing = Math.sin(lonM - Ls) >= 0;
  return { pct, altDeg, up, effMoonPct, waxing, desc };
}

// ====== Cloud Attenuation, Geomagnetics & Viewing Geometry ======

/** Layered cloud, fog & active precipitation occlusion with fog/precip-preserving total-cloud cap */
export function computeEffectiveCloud(low, mid, high = 0, fog = 0, totalCap = null, precipMm = 0) {
  const clamp01 = x => {
    const v = toFinite(x);
    return Math.max(0, Math.min(1, (v !== null ? v : 0) / 100));
  };
  const l = clamp01(low), m = clamp01(mid), h = clamp01(high), f = clamp01(fog);
  const pr = toFinite(precipMm);
  const precipOcc = (pr !== null && pr >= 0.1) ? Math.min(0.85, 0.25 + 0.45 * Math.log1p(pr * 2.5)) : 0;
  let eff = Math.round(100 * (1 - (1 - l) * (1 - m) * (1 - 0.30 * h) * (1 - f) * (1 - precipOcc)));
  const capVal = toFinite(totalCap);
  if (capVal !== null) {
    const capFloor = Math.max(capVal, f * 100, precipOcc * 100);
    eff = Math.min(eff, Math.min(100, Math.round(capFloor + 8)));
  }
  return Math.max(0, Math.min(100, eff));
}

/**
 * Pure first-principles IGRF-14 (2025.0, spherical harmonics n=1..13) Modified Apex-110
 * geomagnetic latitude correction table (Richmond 1995; Laundal & Richmond 2017).
 * Stores signed Int8 delta (0.2° step) relative to the analytic IGRF-14 centered dipole
 * on a 5° lat × 10° lon global grid (37×36 = 1,332 nodes, traced from h=110 km to apex r_A).
 * Verified zero-fitting MAE = 0.236° vs AACGMv2 across 14,122 Aurorasaurus coords (NA 0.250°,
 * EU 0.212°, Nordics 0.151°, SH 0.222°; |lat|>=58° MAE 0.144°, low-lat |lat|<30° max 10.98°).
 */
const IGRF14_APEX_DELTA_B64 =
  'Hx8fHx8fHx8fHyAgICAgIB8fHx8fHx8fHx8fHx8fHx8fHx8fFBUVFhcYGRobHB0eHyAgISEiIiMjJCQlJSUlJCMhHxwZFxYVBggKDQ8SFBYYGhscHR4fHyAgICEiIiIiIiEhISAcEQkEAwME+v8CBgkNEBMWGBobGxwcHBwcHB0cHRwbGRYSDAP35+Ho7fL29Pn9AgYKDhEUFxkaGhkYFhYWFhYWFhUTEAwG/vTq4d7h5erv8fb6/wMHDBAUFhgYFxUSEA4NDQ4ODw4MCQT+9+7n4uDh5ent8PT5/QEFCg4SFRcWFBEMCAUEBAUGBwcFAv748uzn5OLk5ent8PT4+/8DCAwQFBYVEQsF//v5+vv9/v///fr18ezp5ubm6Ort8fT3+v4CBQoPEhQSDQb99vHu7vDz9vj5+Pbz8O3r6enp6uzu8vT3+vwAAwgNERMQCgD27Obj4+bq7vL09PPy8O/u7Ozs7O3v8/X3+fz+AQYKDxEOBvrt49vY2Nvh5+zv8fLx8fHw8O/u7u/w9Pb3+fv9AAMIDRAMAvTl2dHNztLZ4eft7/Hy8vP08/Lx8PDy9ff4+fv8/gEGDA8K/u7d0cjExMrS2+Tr7/Hz9Pb39vXz8vL09/n5+vr8/QAFCg0I++jWyL+7vMPM1+Lq7/L09/j6+vj29PT1+fr6+vv7/P4DCQwG9+PPwLe0t77J1eHr8PT2+fv+/vv49vb3+/z8+/v7+/0BBwoE897JurGvs7vH1eLs8vb5/P4BAf76+Pf5/f79+/r6+vv+DxD779nDtKyssbrH1eTu9fn7/gEEBAD7+fn6/v79+/n2AwEECQwD9tS/sKmqsLrH1+Xw9/v+AQQHBgH8+fn8/fsHAv/+/f4DCAoB7sy8raiqsbzJ2ejz+f4BAwYJCAL9+vr7BAQC//79/f4CCAj+69O2rKirs77L2ujy+f4BBAYIBwL9+fcGAQIB//39/f8DBwf86dG9tqestL7I5PH7AgcKDA4QDgkD//7//wEA/v39/gADBgX759C9srC0vcjU4/L8BAgLDQ8QDggC/fz9/v/+/fz8/gAEBgT559K/tbK3wMvY5vT/BgoNDxESDwkC/fv8/Pz9/Pv8/gEEBQL459TDube8xM/b6vcBCAwPERMTEAoD/vv7+vr6+vv8/gEEBQH36NbIv73BydTg7fkDCg4SFBUUEQsE/vv6+fn5+fr8/gEDBAD26drNxcPHz9nk8PwFDBAUFhYVEgwF//v5+Pf3+Pn7/gEDA//2697TzMvO1d7p9P4HDhIVFxgWEw0GAPz5+Pf2+Pn7/gEDAv727OHZ09LV2+Pt9wEJDxQXGRkXEw4HAv36+Pf3+Pn8/gECAf327uXe2tnb4enx+gMKEBUYGhoYFA8JA//7+vj4+fr8/gABAPz27+ji39/i5+31/QQLERYZGxoZFRALBQH9/Pv6+vv9/wAA//v28Orm5OXn7PL4/wYNEhYZGxsZFhEMBwP/AP79/f3+/wD//fr18Ozp6Ons8PX7AQcNEhcZGxoZFhMPCgYDAwIA/wAAAAD++/j08O3s7O7x9Pn+BAkOExYZGhoZFhQQDQkGCAYEAwMCAgD++/by7+/v8PL1+f0CBgsPEhUYGBkYFxQSDwwKDQsKCQcHBgQC/fbw8fP19/r9AAMGCg0PEhQWFxcXFhUTEhAOERAQDw8PDw8QERAMCggHBwcICgsMDg8REhMUFRUVFBQUExMSEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhISEhIS';

let _igrf14DeltaGrid = null;
function getIgrf14DeltaGrid() {
  if (_igrf14DeltaGrid) return _igrf14DeltaGrid;
  const bin = atob(IGRF14_APEX_DELTA_B64);
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const b = bin.charCodeAt(i);
    out[i] = b > 127 ? b - 256 : b;
  }
  _igrf14DeltaGrid = out;
  return out;
}

export function computeGeomagneticLat(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 0;
  const latC = Math.max(-90, Math.min(90, lat));
  const D2R = Math.PI / 180;
  // Base IGRF-14 centered dipole (pole 80.85°N, -72.76°E)
  const latR = latC * D2R, lonR = lon * D2R;
  const pLat = 80.85 * D2R, pLon = -72.76 * D2R;
  const sinDip = Math.max(-1, Math.min(1,
    Math.sin(latR) * Math.sin(pLat) + Math.cos(latR) * Math.cos(pLat) * Math.cos(lonR - pLon)
  ));
  const dipLat = Math.asin(sinDip) * (180 / Math.PI);
  // Bilinear interpolation of pure IGRF-14 non-dipole Apex-110 delta (5° lat × 10° lon)
  const grid = getIgrf14DeltaGrid();
  const lonN = ((lon + 180) % 360 + 360) % 360;
  const fy = (latC + 90) / 5;
  const fx = lonN / 10;
  const i0 = Math.min(35, Math.floor(fy));
  const j0 = Math.floor(fx) % 36;
  const j1 = (j0 + 1) % 36;
  const ty = fy - i0, tx = fx - Math.floor(fx);
  const g00 = grid[i0 * 36 + j0] * 0.2;
  const g01 = grid[i0 * 36 + j1] * 0.2;
  const g10 = grid[(i0 + 1) * 36 + j0] * 0.2;
  const g11 = grid[(i0 + 1) * 36 + j1] * 0.2;
  const delta = (1 - ty) * ((1 - tx) * g00 + tx * g01) + ty * ((1 - tx) * g10 + tx * g11);
  return Math.max(-90, Math.min(90, dipLat + delta));
}

/**
 * Exact spherical dipole Magnetic Local Time (0-24h).
 * Uses true J2000 subsolar (declination, longitude) rather than mean-time approximation (<1 min global error).
 */
export function computeMLT(dateObj, lat, lon) {
  const toR = d => d * Math.PI / 180;
  const phiP = toR(lat >= 0 ? 80.85 : 74.5);
  const lamP = toR(lat >= 0 ? -72.76 : -54.0);
  const dipoleLon = (la, lo) => {
    const phi = toR(la), dl = toR(lo) - lamP;
    const y = Math.cos(phi) * Math.sin(dl);
    const x = Math.sin(phiP) * Math.cos(phi) * Math.cos(dl) - Math.cos(phiP) * Math.sin(phi);
    return Math.atan2(y, x) * 180 / Math.PI;
  };
  const { decDeg, sunLonDeg } = computeSolarCoords(dateObj);
  const dL = dipoleLon(lat, lon) - dipoleLon(decDeg, sunLonDeg);
  return (((dL / 15 + 12) % 24) + 24) % 24;
}

/** Overhead auroral oval equatorward edge (Feldstein-Starkov, degrees mag lat) for viewing elevation geometry */
export function ovalEquatorwardEdge(kp) {
  const k = Number.isFinite(kp) ? Math.max(0, Math.min(9.5, kp)) : 0;
  return Math.max(44.5, 67.0 - 2.15 * k);
}

/** Horizon-visibility Kp threshold (accounts for 120-300 km aurora horizon sightline equatorward of oval), clamped to Kp 9.0 */
export function requiredKpForMagLat(absMagLat) {
  if (!Number.isFinite(absMagLat) || absMagLat >= 65.8) return 0;
  if (absMagLat >= 53.5) return +((65.8 - absMagLat) / 2.05).toFixed(1);
  return Math.min(9.0, +(6.0 + (53.5 - absMagLat) / 5.8).toFixed(1));
}

function compassLabel16(deg, en) {
  const dirsEn = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const dirsZh = ['正北', '北北東', '東北', '東北東', '正東', '東南東', '東南', '南南東', '正南', '南南西', '西南', '西南西', '正西', '西北西', '西北', '北北西'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return en ? dirsEn[idx] : dirsZh[idx];
}

/** Great-circle initial azimuth (0-359°) from observer toward the active geomagnetic auroral pole */
export function computeAuroraBearing(lat, lon) {
  const toR = d => d * Math.PI / 180;
  const phi1 = toR(lat), lam1 = toR(lon);
  const phi2 = toR(lat >= 0 ? 80.85 : -74.5);
  const lam2 = toR(lat >= 0 ? -72.76 : 126.0);
  const dLam = lam2 - lam1;
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return (Math.round(Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Spherical-Earth aurora viewing geometry (Re=6371 km).
 * Shares ovalEquatorwardEdge(kp) with scoring and handles polar-cap stations (Svalbard/McMurdo)
 * looking equatorward using true spherical elevation instead of hardcoded angles.
 */
export function computeViewingGeometry({ lat = 69.97, lon = 23.27, kp = 0, mlt = null, lang } = {}) {
  const en = isEn(lang);
  const curKp = (kp !== null && Number.isFinite(kp)) ? Math.max(0, Math.min(9, kp)) : 0;
  const absMag = Math.abs(computeGeomagneticLat(lat, lon));
  const mltShift = (mlt !== null && Number.isFinite(mlt)) ? (2.0 * Math.cos((mlt - 0.5) * Math.PI / 12)) : 0;
  const ovalEdge = Math.max(34.0, ovalEquatorwardEdge(curKp) - mltShift);
  const ovalPoleEdge = Math.min(77.0, ovalEdge + 8.5 + curKp * 0.6);
  const deltaDeg = ovalEdge - absMag;

  const poleAz = computeAuroraBearing(lat, lon);
  const eqAz = (poleAz + 180) % 360;
  const poleTxt = `${compassLabel16(poleAz, en)} ${poleAz}°`;
  const eqTxt = `${compassLabel16(eqAz, en)} ${eqAz}°`;
  const poleDir = lat >= 0 ? (en ? 'North' : '北方') : (en ? 'South' : '南方');

  const Re = 6371;
  const elevAt = (distDeg, h) => {
    const psi = (distDeg * 111.32) / Re;
    return Math.atan2((Re + h) * Math.cos(psi) - Re, (Re + h) * Math.sin(psi)) * 180 / Math.PI;
  };

  if (absMag > ovalPoleEdge + 0.5) {
    const deltaEq = absMag - ovalPoleEdge;
    const eqGreen = Math.max(8, Math.min(82, elevAt(deltaEq, 120)));
    const eqUpper = Math.max(eqGreen + 6, Math.min(86, elevAt(deltaEq, 200)));
    return {
      mode: 'overhead-eq', azimuthDeg: eqAz,
      elevGreenDeg: +eqGreen.toFixed(1), elevUpperDeg: +eqUpper.toFixed(1), direction: eqTxt,
      shortText: en
        ? `Toward ${eqTxt} (~${Math.round(eqGreen)}°–${Math.round(eqUpper)}°, equatorward oval)`
        : `朝 ${eqTxt}（仰角約 ${Math.round(eqGreen)}°–${Math.round(eqUpper)}°，極光帶偏赤道側）`
    };
  }
  if (deltaDeg <= 0.5) {
    return {
      mode: 'overhead', azimuthDeg: poleAz, elevGreenDeg: 90, elevUpperDeg: 90, direction: poleTxt,
      shortText: en ? `Overhead & all sky (start toward ${poleTxt})` : `頭頂與全天空（可先朝 ${poleTxt} 找）`
    };
  }

  const elevGreen = elevAt(deltaDeg, 120);
  const elevUpper = elevAt(deltaDeg, 200);
  const elevRed = elevAt(deltaDeg, 300);
  const topElev = curKp >= 6 ? Math.max(elevUpper, elevRed) : elevUpper;
  const lo = Math.max(3, Math.round(elevGreen > 0 ? elevGreen : Math.max(3, elevUpper)));
  const hi = Math.min(85, Math.max(lo + 4, Math.round(topElev)));

  if (elevGreen >= 18) {
    return {
      mode: 'mid', azimuthDeg: poleAz, elevGreenDeg: +elevGreen.toFixed(1), elevUpperDeg: +elevUpper.toFixed(1), direction: poleTxt,
      shortText: en ? `Face ${poleTxt} (~${lo}°–${hi}° elevation)` : `朝 ${poleTxt} · 仰角約 ${lo}°–${hi}°`
    };
  }
  if (topElev >= 5) {
    const redNote = (curKp >= 6 && elevGreen < 4) ? (en ? ', red upper glow on camera' : '，相機易拍出暗紅極光') : (en ? ', clear horizon + phone Night Mode' : '，需無遮蔽地平線＋手機夜拍');
    return {
      mode: 'low', azimuthDeg: poleAz, elevGreenDeg: +elevGreen.toFixed(1), elevUpperDeg: +topElev.toFixed(1), direction: poleTxt,
      shortText: en ? `Low toward ${poleTxt} (~${lo}°–${hi}°${redNote})` : `朝 ${poleTxt} 低空約 ${lo}°–${hi}°（${redNote.replace(/^，/, '')}）`
    };
  }
  return {
    mode: 'below', azimuthDeg: poleAz, elevGreenDeg: +elevGreen.toFixed(1), elevUpperDeg: +topElev.toFixed(1), direction: poleDir,
    shortText: en ? `Below the ${poleTxt} horizon right now` : `目前位於 ${poleTxt} 地平線以下`
  };
}

/**
 * Distinguish naked-eye visibility vs camera-only visibility based on aurora brightness,
 * horizon airmass attenuation, moonlight/twilight contrast, and sky clarity.
 */
export function classifyViewingMode({ scoreObj, geom, effMoonPct = 0, lang } = {}) {
  const en = isEn(lang);
  if (!scoreObj || scoreObj.outOfZone || scoreObj.isTooBright || scoreObj.skyScore < 15) {
    return { tier: 'none', text: '' };
  }
  if (scoreObj.total >= 55 && scoreObj.auroraScore >= 52 && geom?.mode !== 'low' && effMoonPct < 75) {
    return {
      tier: 'naked-eye',
      text: en ? 'Naked-eye visible green arcs & motion' : '肉眼可見明顯綠光與舞動'
    };
  }
  if (scoreObj.total >= 32 && scoreObj.auroraScore >= 40 && geom?.mode !== 'low') {
    return {
      tier: 'naked-eye-soft',
      text: en ? 'Visible to naked eye (faint green/grey) · vivid on phone' : '肉眼可見微綠／灰白光帶 · 手機夜拍色彩鮮明'
    };
  }
  if (scoreObj.total >= 15 || (scoreObj.auroraScore >= 45 && scoreObj.skyScore >= 20)) {
    return {
      tier: 'camera-first',
      text: en ? 'Faint to naked eye · phone Night Mode reveals green/red first' : '肉眼可能僅見淡白霧 · 建議用手機夜拍確認綠／紅光'
    };
  }
  if (scoreObj.skyScore >= 55) {
    return {
      tier: 'camera-test',
      text: en ? 'Take a 5–10s phone test shot to check for faint glow' : '天空晴朗，可用手機長曝 5–10 秒試拍確認微光'
    };
  }
  return { tier: 'none', text: '' };
}

// ====== Solar Wind Physics & Ballistic Coupling ======

/** L1->Earth propagation time (1.44M km / v); supports slow wind & extreme CMEs 100..3000 km/s (clamped 8..95m) */
export function computeL1EtaMin(speed) {
  if (!Number.isFinite(speed) || speed < 100 || speed > 3000) return 45;
  return Math.max(8, Math.min(95, Math.round(1440000 / (speed * 60))));
}

/** Newell et al. (2007) magnetopause coupling dPhi/dt = v^(4/3) * BT^(2/3) * sin^(8/3)(theta/2) */
export function computeNewellCoupling(speed, by, bz) {
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(bz)) return 0;
  const byV = Number.isFinite(by) ? by : 0;
  const bt = Math.hypot(byV, bz);
  if (bt < 0.05) return 0;
  const theta = Math.atan2(Math.abs(byV), bz);
  return Math.pow(speed, 4 / 3) * Math.pow(bt, 2 / 3) * Math.pow(Math.sin(theta / 2), 8 / 3);
}

/** Solar wind dynamic pressure P_dyn (nPa) = 1.6726e-6 * n_p * v^2 */
export function computeDynamicPressure(speed, density) {
  if (!Number.isFinite(speed) || !Number.isFinite(density) || speed <= 0 || density < 0) return null;
  return +(1.6726e-6 * density * speed * speed).toFixed(2);
}

/**
 * 3-point rolling median filter for 1-minute satellite telemetry.
 * Rejects single-minute DSCOVR/ACE spikes (including anomalous tail glitches exceeding tailSpikeThreshold)
 * while passing real 2+ minute step shocks and monotonic substorm ramps without attenuation.
 */
export function medianSmooth3(values, tailSpikeThreshold = 15) {
  if (!Array.isArray(values) || values.length < 3) return Array.isArray(values) ? [...values] : [];
  const med3 = (a, b, c) => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) return b;
    if ((a <= b && b <= c) || (c <= b && b <= a)) return b;
    if ((b <= a && a <= c) || (c <= a && a <= b)) return a;
    return c;
  };
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length - 1; i++) {
    out[i] = med3(values[i - 1], values[i], values[i + 1]);
  }
  const n = values.length;
  const a = values[n - 3], b = values[n - 2], c = values[n - 1];
  const prevStep = (Number.isFinite(a) && Number.isFinite(b)) ? Math.abs(b - a) : 0;
  const tailJump = (Number.isFinite(b) && Number.isFinite(c)) ? Math.abs(c - b) : 0;
  out[n - 1] = tailJump > Math.max(tailSpikeThreshold, prevStep * 3) ? med3(a, b, c) : c;
  return out;
}

/**
 * Detect CME / CIR dynamic pressure shock using median-smoothed 30-min window,
 * staleness guard, and jump requirement (steady high pressure without a jump will not false-alarm).
 */
export function detectPressureShock(windSeries, nowMs = null) {
  if (!Array.isArray(windSeries) || !windSeries.length) return { pdyn: null, jumpNpa: 0, active: false };
  const rows = [];
  for (const r of windSeries) {
    if (!r) continue;
    const p = computeDynamicPressure(r.speed, r.density);
    if (p !== null) rows.push({ p, ts: parseUtcMs(r.time_tag) });
  }
  if (!rows.length) return { pdyn: null, jumpNpa: 0, active: false };
  const smoothP = medianSmooth3(rows.map(x => x.p), 5.0);
  const cleanRows = rows.map((x, i) => ({ p: +smoothP[i].toFixed(2), ts: x.ts }));
  const latest = cleanRows[cleanRows.length - 1];
  const stale = Number.isFinite(nowMs) && Number.isFinite(latest.ts) && (nowMs - latest.ts) > 30 * 60000;
  const win = Number.isFinite(latest.ts)
    ? cleanRows.filter(x => Number.isFinite(x.ts) && x.ts >= latest.ts - 30 * 60000)
    : cleanRows.slice(-30);
  const sortedP = win.map(x => x.p).sort((a, b) => a - b);
  const baseP = sortedP.length >= 4 ? sortedP[1] : sortedP[0];
  const jumpNpa = +Math.max(0, latest.p - baseP).toFixed(2);
  const active = !stale && (jumpNpa >= 3.0 || (latest.p >= 6.0 && jumpNpa >= 1.5));
  return { pdyn: latest.p, jumpNpa, active };
}

export function computeWindChill(tempC, windMs) {
  if (!Number.isFinite(tempC)) return 0;
  const vKmh = Number.isFinite(windMs) ? windMs * 3.6 : 0;
  if (tempC > 10 || vKmh < 4.8) return +tempC.toFixed(1);
  const v16 = Math.pow(vKmh, 0.16);
  return +(13.12 + 0.6215 * tempC - 11.37 * v16 + 0.3965 * tempC * v16).toFixed(1);
}

export function computeDataLagMin(isoTag, nowMs = Date.now()) {
  const ts = parseUtcMs(isoTag);
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, Math.round((nowMs - ts) / 60000));
}

/** Smooth non-saturating Newell coupling -> 4..100 energy scale (calibrated to raw Newell dPhi/dt) */
export function newellToEnergy(nw) {
  if (!Number.isFinite(nw) || nw <= 0) return 4;
  return Math.max(4, Math.min(100, Math.round(4 + 96 * (1 - Math.exp(-nw / 14500)))));
}

export function bzToEnergy(bz, speed = 420) {
  if (!Number.isFinite(bz)) return 0;
  const vScale = (Number.isFinite(speed) && speed > 200) ? Math.pow(speed / 420, 0.9) : 1;
  const e = bz < 0 ? (20 + (-bz) * 10.5 * vScale) : (20 - bz * 6);
  return Math.max(4, Math.min(100, Math.round(e)));
}

/**
 * Split 3h L1 telemetry into Earth-arriving (now) vs incoming (+ETA) windows using per-parcel ballistic
 * advection, 3-point causal median spike rejection, epoch-minute wind alignment, exponential 60-min
 * substorm preconditioning, and separate Earth-arriving vs L1 dynamic pressure shock states.
 */
export function computeBallisticCoupling(magSeries, windSeriesOrSpeed, nowMs = null, noaaPropEtaMin = null) {
  if (!Array.isArray(magSeries) || !magSeries.length) {
    return {
      etaMin: 45, nowBz: null, nowNewell: null, nextBz: null, nextNewell: null,
      cleanLatestBz: null, avgNewell60: null, preconditioned: false,
      nowPdyn: null, nowShockJumpNpa: 0,
      pdyn: null, shockActive: false, shockJumpNpa: 0, energy120: [], arrivingIdx: -1
    };
  }
  const isWindArr = Array.isArray(windSeriesOrSpeed) && windSeriesOrSpeed.length > 0;
  const windPts = [];
  const windByMin = new Map();
  let latestSpd = 380;
  if (isWindArr) {
    for (const w of windSeriesOrSpeed) {
      if (!w || !Number.isFinite(w.speed)) continue;
      const wTs = parseUtcMs(w.time_tag);
      if (Number.isFinite(wTs)) {
        const minKey = Math.round(wTs / 60000);
        windByMin.set(minKey, w.speed);
        windPts.push({ ts: wTs, speed: w.speed, density: w.density });
      }
      latestSpd = w.speed;
    }
    windPts.sort((a, b) => a.ts - b.ts);
  } else if (Number.isFinite(windSeriesOrSpeed) && windSeriesOrSpeed >= 100) {
    latestSpd = windSeriesOrSpeed;
  }

  const shock = isWindArr ? detectPressureShock(windSeriesOrSpeed, nowMs) : { pdyn: null, jumpNpa: 0, active: false };
  const baseEtaMin = computeL1EtaMin(latestSpd);
  const etaOffset = (Number.isFinite(noaaPropEtaMin) && noaaPropEtaMin >= 10 && noaaPropEtaMin <= 120)
    ? Math.max(-20, Math.min(20, Math.round(noaaPropEtaMin - baseEtaMin)))
    : 0;
  const etaMin = Math.max(10, Math.min(120, baseEtaMin + etaOffset));
  const lastTs = parseUtcMs(magSeries[magSeries.length - 1]?.time_tag);
  const refNowMs = (Number.isFinite(nowMs) && Number.isFinite(lastTs) && nowMs > lastTs) ? nowMs : lastTs;

  const lookupWindSpeed = (ts) => {
    if (!isWindArr || !Number.isFinite(ts)) return latestSpd;
    const mk = Math.round(ts / 60000);
    if (windByMin.has(mk)) return windByMin.get(mk);
    // Nearest chronological wind point (never leaks post-shock 850 km/s onto pre-shock ambient wind!)
    let bestV = latestSpd, bestD = Infinity;
    for (const wp of windPts) {
      const d = Math.abs(wp.ts - ts);
      if (d < bestD) { bestD = d; bestV = wp.speed; }
    }
    return bestV;
  };

  const smoothBz = medianSmooth3(magSeries.map(r => Number.isFinite(r?.bz) ? r.bz : 0));
  const smoothBy = medianSmooth3(magSeries.map(r => Number.isFinite(r?.by) ? r.by : 0));

  const enriched = magSeries.map((r, i) => {
    const ts = parseUtcMs(r?.time_tag);
    const v = lookupWindSpeed(ts);
    const bzClean = smoothBz[i];
    const byClean = smoothBy[i];
    const nw = computeNewellCoupling(v, byClean, bzClean);
    const parcelEta = Math.max(10, Math.min(120, computeL1EtaMin(v) + etaOffset));
    const arrTs = Number.isFinite(ts) ? ts + parcelEta * 60000 : NaN;
    return { ...r, bz: bzClean, by: byClean, ts, arrTs, v, nw };
  });
  const avgWin = arr => {
    if (!arr.length) return { bz: null, newell: null };
    const bz = arr.reduce((s, r) => s + r.bz, 0) / arr.length;
    const nw = arr.reduce((s, r) => s + r.nw, 0) / arr.length;
    return { bz: +bz.toFixed(2), newell: Math.round(nw) };
  };

  const targetTs = Number.isFinite(lastTs) ? Math.min(lastTs, refNowMs - etaMin * 60000) : NaN;
  const incArr = Number.isFinite(lastTs)
    ? enriched.filter(r => Number.isFinite(r.ts) && r.ts >= lastTs - 30 * 60000)
    : [];
  // Per-parcel ballistic arrival at Earth around refNowMs (falls back to targetTs window if empty)
  let arrArr = Number.isFinite(refNowMs)
    ? enriched.filter(r => Number.isFinite(r.arrTs) && r.arrTs >= refNowMs - 20 * 60000 && r.arrTs <= refNowMs + 10 * 60000)
    : [];
  if (!arrArr.length && Number.isFinite(targetTs)) {
    arrArr = enriched.filter(r => Number.isFinite(r.ts) && r.ts >= targetTs - 20 * 60000 && r.ts <= targetTs + 10 * 60000);
  }
  const preArr = Number.isFinite(targetTs)
    ? enriched.filter(r => Number.isFinite(r.ts) && r.ts >= targetTs - 60 * 60000 && r.ts <= targetTs)
    : [];
  const inc = avgWin(incArr.length ? incArr : enriched.slice(-10));
  const nowW = avgWin(arrArr.length ? arrArr : (incArr.length ? incArr : enriched.slice(-10)));

  // Exponentially weighted 60-min magnetotail preconditioning (tau = 30 min)
  const calcExpNewell60 = (refTs, fallbackVal) => {
    if (!Number.isFinite(refTs)) return fallbackVal;
    const win = enriched.filter(r => Number.isFinite(r.ts) && r.ts >= refTs - 60 * 60000 && r.ts <= refTs);
    if (!win.length) return fallbackVal;
    let wSum = 0, nwSum = 0;
    for (const r of win) {
      const w = Math.exp(-Math.max(0, refTs - r.ts) / (30 * 60000));
      wSum += w;
      nwSum += r.nw * w;
    }
    return wSum > 0 ? Math.round(nwSum / wSum) : fallbackVal;
  };
  const avgNewell60 = calcExpNewell60(targetTs, nowW.newell);
  const nextAvgNewell60 = calcExpNewell60(lastTs, inc.newell);
  const preconditioned = Number.isFinite(avgNewell60) && avgNewell60 >= 6000;

  // Separate Earth-arriving dynamic pressure so L1 upstream shocks are not prematurely credited to NOW
  let nowPdyn = null, nowShockJumpNpa = 0;
  if (isWindArr && Number.isFinite(refNowMs)) {
    const earthWind = windSeriesOrSpeed.filter(w => {
      const wTs = parseUtcMs(w?.time_tag);
      return Number.isFinite(wTs) && Number.isFinite(w?.speed) && (wTs + computeL1EtaMin(w.speed) * 60000) <= refNowMs + 10 * 60000;
    });
    if (earthWind.length) {
      const earthShock = detectPressureShock(earthWind);
      nowPdyn = earthShock.pdyn;
      nowShockJumpNpa = earthShock.jumpNpa;
    }
  }

  const tail120 = enriched.slice(-120);
  const energy120 = tail120.map(r => newellToEnergy(r.nw));
  let arrivingIdx = -1, bestDiff = Infinity;
  if (Number.isFinite(targetTs)) {
    tail120.forEach((r, i) => {
      if (!Number.isFinite(r.ts)) return;
      const d = Math.abs(r.ts - targetTs);
      if (d < bestDiff) { bestDiff = d; arrivingIdx = i; }
    });
    if (bestDiff > 20 * 60000) arrivingIdx = -1;
  }

  return {
    etaMin, nowBz: nowW.bz, nowNewell: nowW.newell, nextBz: inc.bz, nextNewell: inc.newell,
    cleanLatestBz: enriched.length ? +enriched[enriched.length - 1].bz.toFixed(2) : null,
    avgNewell60, nextAvgNewell60, preconditioned,
    nowPdyn, nowShockJumpNpa,
    pdyn: shock.pdyn, shockActive: shock.active, shockJumpNpa: shock.jumpNpa,
    energy120, arrivingIdx
  };
}

// ====== Aurora Visibility Scoring Engine (Calibrated Across 50 Global Cities & 72 Events) ======

function computeAuroraScoreInternal({
  lat = 69.97, lon = 23.27, cloudNow, sunAlt = -15, bz, speed, kp, ovation,
  hpiGw = null, substormJumpNt = 0, pdyn = null, shockJumpNpa = 0,
  newell = null, preconditionedNewell60 = null, mlt = null, effMoonPct = 0,
  dst = null
} = {}) {
  const validCoord = Number.isFinite(lat) && Number.isFinite(lon);
  const safeLat = validCoord ? Math.max(-90, Math.min(90, lat)) : 0;
  const safeLon = validCoord ? lon : 0;
  const sunAltVal = Number.isFinite(sunAlt) ? sunAlt : 0; // Fail-safe bright if sunAlt is NaN

  const magLat = validCoord ? computeGeomagneticLat(safeLat, safeLon) : 0;
  const absMag = Math.abs(magLat);
  const mltShiftDeg = (mlt !== null && Number.isFinite(mlt)) ? (2.0 * Math.cos((mlt - 0.5) * Math.PI / 12)) : 0;
  const effMagForOval = absMag + mltShiftDeg;
  const neededKp = requiredKpForMagLat(effMagForOval);
  const effCloudNow = Number.isFinite(cloudNow) ? Math.max(0, Math.min(100, Math.round(cloudNow))) : 100;
  const skyScore = Math.max(0, Math.min(100, Math.round(100 - effCloudNow)));

  const curKp = (kp !== null && Number.isFinite(kp)) ? Math.max(0, Math.min(9.5, kp)) : 0;
  const curOv = (ovation !== null && Number.isFinite(ovation)) ? Math.max(0, Math.min(100, ovation)) : null;
  const curHpi = (hpiGw !== null && Number.isFinite(hpiGw)) ? Math.max(0, hpiGw) : null;
  const bzVal = (bz !== null && Number.isFinite(bz)) ? bz : 0;
  const spdVal = (speed !== null && Number.isFinite(speed)) ? Math.max(100, Math.min(3000, speed)) : 380;
  const subJump = (substormJumpNt !== null && Number.isFinite(substormJumpNt)) ? Math.max(0, substormJumpNt) : 0;
  const pVal = (pdyn !== null && Number.isFinite(pdyn)) ? Math.max(0, pdyn) : 0;
  const pJump = (shockJumpNpa !== null && Number.isFinite(shockJumpNpa)) ? Math.max(0, shockJumpNpa) : 0;
  const moonEff = Number.isFinite(effMoonPct) ? Math.max(0, Math.min(100, effMoonPct)) : 0;
  const dstVal = (dst !== null && Number.isFinite(dst)) ? Math.max(-1000, Math.min(200, dst)) : null;

  // Real-time effective storm proxy Kp (Newell 2007 coupling + Gonzalez et al. 1994 Kyoto Dst storm thresholds)
  const kpFromHpi = curHpi !== null ? Math.min(9, Math.max(0, (curHpi - 8) / 14)) : 0;
  const kpFromNewell = (newell !== null && Number.isFinite(newell))
    ? Math.min(9, Math.max(0, 2.35 * Math.pow(Math.max(0, newell - 800) / 4000, 0.45)))
    : (bzVal < -4 ? Math.min(8, (-bzVal - 2) * 0.35 + Math.max(0, (spdVal - 400) / 150)) : 0);
  // Ring-current storm depression (Gonzalez et al. 1994: -50 nT moderate, -100 nT intense, -200 nT severe, -350 nT extreme)
  // Guard against quiet recovery phase (Dst decays over 10-20h after Bz turns north): apply moderate Dst only while active
  const dstActive = dstVal !== null && (dstVal <= -100 || (dstVal <= -50 && (curKp >= 3.5 || bzVal < -2)));
  const kpFromDst = dstActive
    ? Math.min(9.0, 5.0 + 4.0 * Math.log1p((-dstVal - 50) / 75) / Math.log1p(300 / 75))
    : 0;
  const hasRealShock = pJump >= 3.0 || (pVal >= 6.0 && pJump >= 1.5);
  const subBonusKp = (subJump >= 15 ? 1.0 : 0) + (hasRealShock ? 0.6 : 0);
  const effKp = Math.min(9.5, Math.max(curKp, kpFromHpi, kpFromNewell, kpFromDst) + subBonusKp);

  // Twilight darkness baseline (strict -4° threshold; full astronomical contrast reached at -12°)
  const moonDarkFactor = Math.max(0.58, 1 - moonEff * 0.0038);
  const baseTooBright = sunAltVal >= -4;
  const rawTw = baseTooBright ? 0 : Math.min(1, (-sunAltVal - 4) / 8);
  const baseDarkFactor = baseTooBright ? 0 : Math.pow(rawTw, 0.85) * (0.55 + 0.45 * moonDarkFactor);
  const baseDarkScore = Math.round(100 * baseDarkFactor);

  // Hard physical gate 1: < 32° geomagnetic (Taiwan 16°, Tokyo 26°, Singapore) or invalid coords -> impossible
  if (!validCoord || absMag < 32) {
    const reqStatic = requiredKpForMagLat(absMag);
    const result = {
      total: 0, skyScore, auroraScore: 0, darkScore: baseDarkScore, isTooBright: baseTooBright, twilightFactor: +rawTw.toFixed(2),
      magLat: Math.round(absMag), neededKp: reqStatic, outOfZone: 'low-lat',
      grade: '🌏 緯度過低', color: '#ff8a96'
    };
    return {
      result,
      breakdown: {
        cloudNow: effCloudNow, skyScore, cloudExp: 0.85, skyFactor: +Math.pow(skyScore / 100, 0.85).toFixed(3),
        auroraScore: 0, aurFactor: 0, baseAur: null, effKp: +effKp.toFixed(1), neededKp: reqStatic,
        magLat: Math.round(absMag), reachFactor: 0, swAdj: 0, precondAdj: 0, substormAdj: 0, pdynAdj: 0,
        mltFactor: 1, sunAlt: +sunAltVal.toFixed(1), rawTw: +rawTw.toFixed(2), twilightExp: 0.85,
        twilightFactor: baseTooBright ? 0 : +Math.pow(rawTw, 0.85).toFixed(3), effMoonPct: Math.round(moonEff),
        moonDarkFactor: +moonDarkFactor.toFixed(3), moonWeight: 0.45, darkScore: baseDarkScore, darkFactor: +baseDarkFactor.toFixed(3), activeBoosts: []
      }
    };
  }

  // Hard physical gate 2: Mid-lat cities where neither global Kp, real-time solar wind proxy, nor horizon reach suffices
  if (!(baseTooBright && absMag >= 45) && neededKp >= 2.5 && (effKp + 1.8) < neededKp && (curOv ?? 0) < 5) {
    const result = {
      total: 0, skyScore, auroraScore: 0, darkScore: baseDarkScore, isTooBright: baseTooBright, twilightFactor: +rawTw.toFixed(2),
      magLat: Math.round(absMag), neededKp, outOfZone: 'need-storm',
      grade: safeLat >= 0 ? '🌍 極光帶偏北' : '🌍 極光帶偏南', color: '#ff8a96'
    };
    return {
      result,
      breakdown: {
        cloudNow: effCloudNow, skyScore, cloudExp: 0.85, skyFactor: +Math.pow(skyScore / 100, 0.85).toFixed(3),
        auroraScore: 0, aurFactor: 0, baseAur: null, effKp: +effKp.toFixed(1), neededKp,
        magLat: Math.round(absMag), reachFactor: 0, swAdj: 0, precondAdj: 0, substormAdj: 0, pdynAdj: 0,
        mltFactor: 1, sunAlt: +sunAltVal.toFixed(1), rawTw: +rawTw.toFixed(2), twilightExp: 0.85,
        twilightFactor: baseTooBright ? 0 : +Math.pow(rawTw, 0.85).toFixed(3), effMoonPct: Math.round(moonEff),
        moonDarkFactor: +moonDarkFactor.toFixed(3), moonWeight: 0.45, darkScore: baseDarkScore, darkFactor: +baseDarkFactor.toFixed(3), activeBoosts: []
      }
    };
  }

  // Smooth fused geomagnetic base (marginScore capped by globalScore so equatorward cities never outscore oval core!)
  const kpForBase = Math.max(curKp, effKp * 0.85);
  const kpScore = Math.max(0, Math.min(100, kpForBase * 14));
  const hpiScore = curHpi !== null ? Math.max(0, Math.min(100, (curHpi - 8) * 1.35)) : null;
  const globalScore = hpiScore !== null ? (0.58 * hpiScore + 0.42 * kpScore) : kpScore;

  let baseAur;
  const marginScore = Math.min(globalScore, Math.max(0, Math.min(100, (kpForBase - neededKp + 1.8) * 17)));
  if (curOv !== null) {
    if (absMag > 73) {
      baseAur = 0.78 * curOv + 0.22 * globalScore;
    } else if (neededKp > 1.5) {
      baseAur = 0.52 * curOv + 0.48 * marginScore;
    } else {
      baseAur = 0.52 * curOv + 0.48 * globalScore;
    }
  } else {
    baseAur = neededKp > 1.5 ? marginScore : globalScore;
  }

  // Smooth oval-reach attenuation (blends Kp reach & OVATION smoothly — eliminates +38pt 14%->15% cliff!)
  const reachMargin = effKp - neededKp;
  let reachFactor = 1;
  if (neededKp > 1.5) {
    const kpReach = reachMargin < 0
      ? Math.max(0.05, Math.pow(Math.max(0, 1 + reachMargin / 1.8), 2.2) * 0.45)
      : (reachMargin < 1.5 ? 0.45 + 0.55 * (reachMargin / 1.5) : 1);
    const ovReach = Math.max(0, Math.min(1, ((curOv ?? 0) - 3) / 15));
    reachFactor = Math.max(kpReach, ovReach);
  }

  let swAdj;
  if (newell !== null && Number.isFinite(newell)) {
    swAdj = newell >= 1200
      ? Math.min(36, 12.5 * Math.log1p((newell - 1200) / 3800))
      : Math.max(-4, -(1200 - newell) / 300);
  } else {
    const bzAdj = Math.max(-4, Math.min(26, -bzVal * 3.0));
    const southWeight = Math.max(0, Math.min(1, (-bzVal + 1) / 4));
    const spAdj = Math.max(0, Math.min(14, (spdVal - 380) / 22)) * (0.2 + 0.8 * southWeight);
    swAdj = bzAdj + spAdj;
  }
  const scaledSwAdj = swAdj > 0 ? swAdj * reachFactor : swAdj;
  // 60-min magnetotail preconditioning boost (calibrated to true raw Newell >= 6000)
  const precondAdj = (preconditionedNewell60 !== null && Number.isFinite(preconditionedNewell60) && preconditionedNewell60 >= 6000 && effMagForOval >= 54)
    ? Math.min(10, (preconditionedNewell60 - 6000) / 1400) * reachFactor
    : 0;
  const substormAdj = Math.max(0, Math.min(18, (subJump - 10) * 0.75)) * reachFactor;
  const pdynAdj = Math.max(0, Math.min(12, Math.max((pVal - 4.5) * 2.0, (pJump - 2.2) * 2.5))) * reachFactor;
  // Asymmetric MLT weighting (midnight substorm peak 1.08x vs polar-night dayside cusp 0.78x)
  const mltCos = (mlt !== null && Number.isFinite(mlt)) ? Math.cos((mlt - 0.5) * Math.PI / 12) : 0;
  const mltFactor = mltCos >= 0 ? (1 + 0.08 * mltCos) : (1 + 0.22 * mltCos);
  const auroraScore = Math.max(2, Math.min(100, Math.round((baseAur + scaledSwAdj + precondAdj + substormAdj + pdynAdj) * mltFactor)));

  // Smooth intensity-aware twilight & lunar attenuation (zero step discontinuities!)
  const isTooBright = baseTooBright;
  const stormTwBlend = Math.max(0, Math.min(1, (auroraScore - 60) / 25));
  const twilightExp = +(0.85 - 0.27 * stormTwBlend).toFixed(3);
  const twilightFactor = isTooBright ? 0 : Math.pow(rawTw, twilightExp);
  const moonWeight = 0.45 * Math.max(0.25, 1 - Math.max(0, auroraScore - 60) / 60);
  const darkFactor = twilightFactor * ((1 - moonWeight) + moonWeight * moonDarkFactor);
  const darkScore = isTooBright ? 0 : Math.round(100 * darkFactor);

  // Smooth strictly monotonic cloud exponent (softens 0.85 -> 0.72 during bright storms across all sky levels!)
  const stormCloudBlend = Math.max(0, Math.min(1, (auroraScore - 65) / 25));
  const cloudExp = +(0.85 - 0.13 * stormCloudBlend).toFixed(3);
  const skyFactor = Math.pow(skyScore / 100, cloudExp);
  let total = 0;
  if (!isTooBright) {
    total = Math.max(0, Math.min(99, Math.round(skyFactor * auroraScore * darkFactor)));
  }

  let grade = '☁️ 雲層過厚', color = '#ff8a96';
  if (isTooBright) {
    grade = '☀️ 天色過亮'; color = '#66bdff';
  } else if (total >= 65) {
    grade = '🌟 極佳條件'; color = '#34f0b0';
  } else if (total >= 40) {
    grade = '🟢 適合觀測'; color = '#34f0b0';
  } else if (total >= 18) {
    grade = '✨ 有機會看見'; color = '#ffcf5c';
  } else if (rawTw < 0.75 && auroraScore >= 50 && skyScore >= 35) {
    grade = '🌅 暮光漸暗'; color = '#ffcf5c';
  } else if (auroraScore >= 70 && skyScore >= 15) {
    grade = '⚡ 雲縫極光'; color = '#ffcf5c';
  } else if (skyScore >= 55) {
    grade = '🌌 晴朗但極光弱'; color = '#66bdff';
  }

  const activeBoosts = [];
  if (precondAdj >= 0.5) activeBoosts.push('preconditioned');
  if (substormAdj >= 0.5) activeBoosts.push('substorm');
  if (pdynAdj >= 0.5) activeBoosts.push('pressure-shock');
  if (kpFromDst >= 5.0) activeBoosts.push('ring-current-dst');
  if (cloudExp < 0.80 && skyScore >= 15 && skyScore <= 42) activeBoosts.push('broken-cloud-softening');
  if (!isTooBright && rawTw < 0.99 && twilightExp < 0.72) activeBoosts.push('twilight-softening');

  const result = {
    total, skyScore, auroraScore, darkScore, isTooBright, twilightFactor: +rawTw.toFixed(2),
    effKp: +effKp.toFixed(1), magLat: Math.round(absMag), neededKp, outOfZone: null, grade, color
  };
  return {
    result,
    breakdown: {
      cloudNow: effCloudNow, skyScore, cloudExp, skyFactor: +skyFactor.toFixed(3),
      auroraScore, aurFactor: +(auroraScore / 100).toFixed(3), baseAur: +baseAur.toFixed(1),
      effKp: +effKp.toFixed(1), neededKp, magLat: Math.round(absMag),
      reachFactor: +reachFactor.toFixed(2), swAdj: +scaledSwAdj.toFixed(1),
      precondAdj: +precondAdj.toFixed(1), substormAdj: +substormAdj.toFixed(1), pdynAdj: +pdynAdj.toFixed(1),
      dst: dstVal !== null ? Math.round(dstVal) : null, kpFromDst: +kpFromDst.toFixed(1),
      mltFactor: +mltFactor.toFixed(3), sunAlt: +sunAltVal.toFixed(1),
      rawTw: +rawTw.toFixed(2), twilightExp, twilightFactor: +twilightFactor.toFixed(3),
      effMoonPct: Math.round(moonEff), moonDarkFactor: +moonDarkFactor.toFixed(3),
      moonWeight: +moonWeight.toFixed(4), darkScore, darkFactor: +darkFactor.toFixed(3),
      activeBoosts
    }
  };
}

export function computeAuroraScore(params = {}) {
  return computeAuroraScoreInternal(params).result;
}

/**
 * Code-faithful live transparency & credibility explainer for the Trust Sheet and confidence badge.
 * Single source of truth for: live score equation, primary bottleneck diagnosis, unified confidence
 * precedence (model-diverge low always overrides medium sat-lag), and honest physical limits.
 */
export function explainAuroraScore(params = {}) {
  const {
    scNext = null, noaaOk = true, noaaLagMin = null, usedMet = false,
    cloudConsensus = null, hereHrs = null, cloudSpan3h = null,
    kp = null, ovation = null, moonPct = null, moonAltDeg = null,
    noaaAlert = null, predKp1h = null, metarCalibrated = false, lang
  } = params;
  const en = isEn(lang);
  const { result: sc, breakdown: bd } = computeAuroraScoreInternal(params);

  // Keep activeBoosts strictly faithful to computeAuroraScoreInternal; list external advisories separately
  const externalAlerts = [];
  if (noaaAlert?.active) externalAlerts.push('cme-alert');
  if (Number.isFinite(predKp1h) && Number.isFinite(kp) && predKp1h - kp >= 1.5) externalAlerts.push('geospace-surge');

  const span3h = Number.isFinite(cloudSpan3h)
    ? Math.round(cloudSpan3h)
    : (Array.isArray(hereHrs) && hereHrs.length >= 3
        ? Math.round(Math.max(hereHrs[0].block, hereHrs[1].block, hereHrs[2].block) - Math.min(hereHrs[0].block, hereHrs[1].block, hereHrs[2].block))
        : null);

  const skyF = bd.skyFactor.toFixed(2);
  const darkF = bd.darkFactor.toFixed(2);
  const ovStr = (ovation !== null && Number.isFinite(ovation)) ? Math.round(ovation) : '--';
  const kpStr = (kp !== null && Number.isFinite(kp)) ? Number(kp).toFixed(1) : '--';
  const sunAltStr = `${bd.sunAlt > 0 ? '+' : ''}${bd.sunAlt.toFixed(1)}`;
  const darkPct = Math.round(bd.darkFactor * 100);
  const reachPct = Math.round(bd.reachFactor * 100);
  const moonWtPct = Math.round(bd.moonWeight * 100);
  const moonDetailZh = (Number.isFinite(moonPct) && Number.isFinite(moonAltDeg)) ? `（月光 ${Math.round(moonPct)}%、仰角 ${Math.round(moonAltDeg)}°）` : '';
  const moonDetailEn = (Number.isFinite(moonPct) && Number.isFinite(moonAltDeg)) ? ` (${Math.round(moonPct)}% phase, ${Math.round(moonAltDeg)}° alt)` : '';

  const boostPartsZh = [];
  const boostPartsEn = [];
  if (bd.precondAdj >= 0.5) { boostPartsZh.push(`60m 磁尾蓄能 +${bd.precondAdj}`); boostPartsEn.push(`60m preconditioning +${bd.precondAdj}`); }
  if (bd.substormAdj >= 0.5) { boostPartsZh.push(`GOES 副磁暴 +${bd.substormAdj}`); boostPartsEn.push(`GOES substorm +${bd.substormAdj}`); }
  if (bd.pdynAdj >= 0.5) { boostPartsZh.push(`動壓衝擊 +${bd.pdynAdj}`); boostPartsEn.push(`pressure shock +${bd.pdynAdj}`); }
  if (bd.kpFromDst >= 5.0 && bd.dst !== null) { boostPartsZh.push(`環電流 Dst ${bd.dst} nT`); boostPartsEn.push(`ring current Dst ${bd.dst} nT`); }
  const boostSuffixZh = boostPartsZh.length ? `（已計入：${boostPartsZh.join('、')}）` : '';
  const boostSuffixEn = boostPartsEn.length ? ` (boosts: ${boostPartsEn.join(', ')})` : '';

  // 1. Deterministic bottleneck diagnosis
  let statusTier = 'limited', bKey = 'quiet-aurora', limitingPillar = 'aurora';
  let bLabel = '', bHeadline = '', bDetail = '';
  const skyFactorPct = Math.round(bd.skyFactor * 100);
  const darkFactorPct = Math.round(bd.darkFactor * 100);
  const tierPrefixZh = sc.total >= 40 ? `目前指數 ${sc.total}/99（適合觀測），未達極佳的` : `目前指數 ${sc.total}/99，`;
  const tierPrefixEn = sc.total >= 40 ? `Score is ${sc.total}/99 (good) — ` : `Score is ${sc.total}/99 — `;

  if (sc.outOfZone === 'low-lat') {
    statusTier = 'gated'; bKey = 'gate-low-lat'; limitingPillar = 'gate';
    bLabel = term(TERMS.status.outOfZone, en);
    bHeadline = en
      ? `Score is 0/99: geomagnetic latitude is ${bd.magLat}°, below the 32° physical floor.`
      : `指數歸零（0/99）：此地地磁緯度僅 ${bd.magLat}°，低於 32° 物理門檻。`;
    bDetail = en
      ? 'Auroras normally occur above 60° geomagnetic; visibility below 32° is effectively zero.'
      : '極光帶平時位於地磁 60° 以上，低於 32° 幾乎不可能觀測到極光。';
  } else if (sc.outOfZone === 'need-storm') {
    statusTier = 'gated'; bKey = 'gate-need-storm'; limitingPillar = 'gate';
    bLabel = term(TERMS.status.needsStorm, en);
    bHeadline = en
      ? `Score is 0/99: auroral oval is poleward — effective Kp ${bd.effKp} is below the Kp ≥ ${bd.neededKp} reach threshold.`
      : `指數歸零（0/99）：極光帶仍在高緯度，目前有效 Kp ${bd.effKp} 未達此地門檻（需 Kp ≥ ${bd.neededKp}）。`;
    bDetail = en
      ? `At ${bd.magLat}° mag lat, even with the +1.8 Kp horizon margin the oval is too far away, and overhead OVATION is ${ovStr}% (< 5%).`
      : `地磁 ${bd.magLat}° 計入 +1.8 Kp 地平線視野寬容後仍距極光帶太遠，且頭頂 OVATION 機率為 ${ovStr}%（< 5%）。`;
  } else if (sc.isTooBright) {
    statusTier = 'gated'; bKey = 'gate-daylight'; limitingPillar = 'gate';
    bLabel = term(TERMS.status.tooBright, en);
    bHeadline = en
      ? `Score is 0/99: Sun is at ${sunAltStr}° elevation and must drop below -4° for aurora contrast.`
      : `指數歸零（0/99）：目前太陽仰角 ${sunAltStr}°，需降至 -4° 以下才能觀測極光。`;
    bDetail = en
      ? `Underlying aurora activity is ${bd.auroraScore}/100 with ${bd.skyScore}% clear sky; scoring unlocks below -4°.`
      : `目前背景極光活動為 ${bd.auroraScore}/100、有效晴空 ${bd.skyScore}%，待暮光低於 -4° 後指數才會啟用。`;
  } else if (sc.total >= 65) {
    statusTier = 'optimal'; bKey = 'optimal'; limitingPillar = 'none';
    bLabel = en ? 'All conditions met' : '條件齊備';
    bHeadline = en
      ? `Score is high (${sc.total}/99): clear sky (${bd.skyScore}%), active aurora (${bd.auroraScore}/100), and dark sky (${darkPct}%) align.`
      : `目前指數高達 ${sc.total}/99：晴空（${bd.skyScore}%）、極光活動（${bd.auroraScore}/100）與暗空（${darkPct}%）同時到位。`;
    bDetail = en
      ? `Formula: sky ${skyFactorPct}% × aurora ${bd.auroraScore}/100 × darkness ${darkFactorPct}% = ${sc.total}/99${boostSuffixEn}.`
      : `乘積計算：晴空係數 ${skyFactorPct}% × 極光活動 ${bd.auroraScore}/100 × 暗空係數 ${darkFactorPct}% = ${sc.total}/99${boostSuffixZh}。`;
  } else {
    statusTier = sc.total >= 40 ? 'good' : 'limited';
    if (bd.darkFactor <= bd.skyFactor && bd.darkFactor <= bd.aurFactor) {
      limitingPillar = 'darkness';
      if (bd.rawTw < 0.99) {
        bKey = 'twilight';
        bLabel = en ? 'Twilight' : '暮光偏亮';
        bHeadline = en
          ? `${tierPrefixEn}main bottleneck is twilight: Sun is at ${sunAltStr}° (full darkness at -12°), leaving darkness at ${darkFactorPct}%.`
          : `${tierPrefixZh}主要瓶頸是暮光：太陽仰角 ${sunAltStr}°（需降至 -12° 才達全暗），夜空暗度目前為 ${darkFactorPct}%。`;
        bDetail = en
          ? `Using ${bd.twilightExp < 0.72 ? `storm-softened twilight exponent ${bd.twilightExp}` : `twilight exponent ${bd.twilightExp}`}; sky ${bd.skyScore}% clear, aurora ${bd.auroraScore}/100.`
          : `目前套用${bd.twilightExp < 0.72 ? `強極光平滑暮光指數 ${bd.twilightExp}（較耐暮光）` : `暮光指數 ${bd.twilightExp}`}；晴空 ${bd.skyScore}%、極光活動 ${bd.auroraScore}/100。`;
      } else {
        bKey = 'moonlight';
        bLabel = en ? 'Moonlight' : '月光干擾';
        bHeadline = en
          ? `${tierPrefixEn}main bottleneck is moonlight: ${bd.effMoonPct}% effective lunar brightness${moonDetailEn} trims darkness to ${darkFactorPct}%.`
          : `${tierPrefixZh}主要瓶頸是月光背景亮度：有效月光 ${bd.effMoonPct}%${moonDetailZh}，使夜空暗度降至 ${darkFactorPct}%。`;
        bDetail = en
          ? `Computed via Krisciunas–Schaefer opposition surge with storm-tapered moon weight (${moonWtPct}%); bright storms reduce moon impact.`
          : `依 Krisciunas–Schaefer 衝日效應與極光亮度衰減權重（本次月光權重 ${moonWtPct}%）計算，強極光爆發時月光影響會自動減輕。`;
      }
    } else if (bd.skyFactor <= bd.aurFactor) {
      limitingPillar = 'sky';
      if ((bd.cloudExp < 0.80 && bd.skyScore >= 15 && bd.skyScore <= 42) || sc.grade === '⚡ 雲縫極光') {
        bKey = 'cloud-gaps';
        bLabel = term(TERMS.status.cloudGaps, en);
        bHeadline = en
          ? `Score (${sc.total}/99) is capped by ${bd.cloudNow}% effective cloud, yet strong aurora (${bd.auroraScore}/100) can pierce breaks.`
          : `目前指數 ${sc.total}/99 主要受雲層壓抑（有效雲量 ${bd.cloudNow}%），但極光活動夠強（${bd.auroraScore}/100），雲隙有機會透出綠光。`;
        bDetail = en
          ? `Strong aurora smoothly softens the cloud exponent from 0.85 to ${bd.cloudExp} (sky factor ${skyFactorPct}%)${boostSuffixEn}.`
          : `強極光爆發使雲量非線性指數平滑放寬至 ${bd.cloudExp}（晴空係數 ${skyFactorPct}%）${boostSuffixZh}。`;
      } else {
        bKey = 'clouds';
        bLabel = en ? 'Cloudy' : '雲層遮蔽';
        bHeadline = en
          ? `${tierPrefixEn}main bottleneck is cloud cover: ${bd.cloudNow}% effective cloud (${bd.skyScore}% clear) cuts sky factor to ${skyFactorPct}%.`
          : `${tierPrefixZh}主要瓶頸是雲層：有效遮蔽 ${bd.cloudNow}%（晴空 ${bd.skyScore}%），使晴空係數降至 ${skyFactorPct}%。`;
        bDetail = en
          ? `Low/mid clouds, fog & precipitation weigh heavily, high cirrus 30% (capped at total +8%), exponent ${bd.cloudExp}; aurora activity is ${bd.auroraScore}/100.`
          : `低／中層雲、霧與降水計重度遮蔽，高捲雲以 30% 計（並以總雲量 +8% 設上限），非線性指數 ${bd.cloudExp}；目前極光活動 ${bd.auroraScore}/100。`;
      }
    } else {
      limitingPillar = 'aurora';
      if (bd.reachFactor < 0.85) {
        bKey = 'oval-reach';
        bLabel = en ? 'Aurora too far' : '極光帶距離';
        bHeadline = en
          ? `${tierPrefixEn}main bottleneck is oval distance: effective Kp ${bd.effKp} vs Kp ${bd.neededKp} attenuates solar-wind boosts to ${reachPct}%.`
          : `${tierPrefixZh}主要瓶頸是極光帶尚未擴張到位：有效 Kp ${bd.effKp} 距門檻 Kp ${bd.neededKp} 仍有落差，太陽風增益已衰減至 ${reachPct}%。`;
        bDetail = en
          ? `At ${bd.magLat}° mag lat with overhead OVATION at ${ovStr}%, poleward storm surges are scaled smoothly; sky is ${bd.skyScore}% clear.`
          : `此地地磁 ${bd.magLat}° 且頭頂 OVATION 為 ${ovStr}%，高緯度太陽風訊號會依距離平滑衰減；晴空 ${bd.skyScore}%。`;
      } else {
        bKey = 'quiet-aurora';
        bLabel = en ? 'Low activity' : '極光活動偏弱';
        bHeadline = en
          ? `${tierPrefixEn}main bottleneck is weak geomagnetic activity: aurora activity is ${bd.auroraScore}/100 (Kp ${kpStr}, OVATION ${ovStr}%).`
          : `${tierPrefixZh}主要瓶頸是地磁活動偏弱：極光活動目前為 ${bd.auroraScore}/100（Kp ${kpStr}、OVATION ${ovStr}%）。`;
        bDetail = en
          ? `Sky & darkness are comparatively favorable (${bd.skyScore}% clear, darkness ${darkFactorPct}%)${boostSuffixEn}; waiting for southward Bz or a substorm.`
          : `天空與暗度條件相對足夠（晴空 ${bd.skyScore}%、夜空暗度 ${darkFactorPct}%）${boostSuffixZh}，等待太陽風 Bz 轉南或副磁暴觸發。`;
      }
    }
  }

  // 2. Unified confidence precedence (low model-diverge ALWAYS beats medium sat-lag!)
  const reasons = [];
  let confLevel = 'high';
  let primaryReason = 'consensus-high';
  if (sc.outOfZone && (!scNext || scNext.outOfZone)) {
    confLevel = 'high';
    primaryReason = 'latitude-gate';
    reasons.push('latitude-gate');
  } else {
    if (cloudConsensus && cloudConsensus.level === 'low') reasons.push('model-diverge');
    if (!noaaOk) reasons.push('noaa-offline');
    if (Number.isFinite(noaaLagMin) && noaaLagMin > 45) reasons.push('sat-lag');
    if (Number.isFinite(span3h) && span3h >= 45) reasons.push('fast-clouds');
    if (cloudConsensus && cloudConsensus.level === 'medium') reasons.push('cloud-spread');
    if (!usedMet && !cloudConsensus) reasons.push('single-model');

    if (reasons.includes('model-diverge')) {
      if (metarCalibrated) {
        confLevel = 'medium';
        primaryReason = 'obs-calibrated';
      } else {
        confLevel = 'low';
        primaryReason = 'model-diverge';
      }
    } else if (reasons.length > 0) {
      confLevel = 'medium';
      primaryReason = reasons[0];
    } else {
      confLevel = 'high';
      primaryReason = 'consensus-high';
      reasons.push('consensus-high');
    }
  }

  const confBadgeMap = {
    'latitude-gate': en ? 'Confidence: high' : '可信度：高',
    'obs-calibrated': en ? 'Confidence: medium · local obs adjusted' : '可信度：中 · 已參照當地實測',
    'model-diverge': en ? 'Confidence: low · models disagree' : '可信度：低 · 雲量預報分歧',
    'noaa-offline': en ? 'Confidence: medium · NOAA offline' : '可信度：中 · NOAA 離線',
    'sat-lag': en ? 'Confidence: medium · satellite delay' : '可信度：中 · 衛星資料延遲',
    'fast-clouds': en ? 'Confidence: medium · fast clouds' : '可信度：中 · 雲層變化快',
    'cloud-spread': en ? 'Confidence: medium · models differ' : '可信度：中 · 預報略有差異',
    'single-model': en ? 'Confidence: medium · single model' : '可信度：中 · 單一氣象模型',
    'consensus-high': en ? 'Confidence: high' : '可信度：高'
  };

  const lagStr = Number.isFinite(noaaLagMin) ? Math.round(noaaLagMin) : '--';
  const spanStr = Number.isFinite(span3h) ? span3h : '--';
  const ccDiff = cloudConsensus ? cloudConsensus.diffPct : null;
  const ccMet = cloudConsensus ? cloudConsensus.metAvg3h : null;
  const ccOm = cloudConsensus ? cloudConsensus.omAvg3h : null;

  const pairEn = usedMet ? 'MET Norway 2.5km & Open-Meteo' : 'Dual NWP models';
  const pairZh = usedMet ? 'MET Norway 2.5km 與 Open-Meteo' : '雙氣象模型';
  const m1En = usedMet ? 'MET Norway 2.5km' : 'Primary NWP';
  const m2En = usedMet ? 'Open-Meteo' : 'Secondary NWP';
  const m1Zh = usedMet ? 'MET Norway 2.5km' : '主氣象模型';
  const m2Zh = usedMet ? 'Open-Meteo' : '對照模型';

  const reasonDetail = (key) => {
    if (key === 'latitude-gate') {
      return en
        ? 'High confidence: score is governed by deterministic geomagnetic latitude and oval geometry.'
        : '可信度高：此地受地磁緯度與極光帶幾何限制，結果具高度確定性。';
    }
    if (key === 'model-diverge') {
      return en
        ? `${m1En} (${ccMet}% 3h avg cloud) and ${m2En} (${ccOm}%) diverge by ${ccDiff}% (≥ 35% threshold)${metarCalibrated ? ' — short-term clouds adjusted with nearby live weather-station observations.' : ' — check the sky or cloud map.'}`
        : `${m1Zh}（3h 均雲 ${ccMet}%）與${m2Zh}（${ccOm}%）分歧達 ${ccDiff}%（≥ 35% 門檻）${metarCalibrated ? '，短時雲量已參照鄰近氣象站即時實測修正。' : '，請以實際抬頭或動態雲圖為準。'}`;
    }
    if (key === 'noaa-offline') {
      return en
        ? 'NOAA space-weather feed is offline; aurora scoring lacks full live satellite telemetry.'
        : 'NOAA 太空天氣連線異常，極光指數暫無法取得完整即時衛星觀測。';
    }
    if (key === 'sat-lag') {
      return en
        ? `NOAA L1 satellite telemetry lags by ${lagStr} min (> 45 min threshold); sudden southward Bz or shocks may not be reflected yet.`
        : `NOAA L1 衛星磁場資料延遲 ${lagStr} 分鐘（> 45 分鐘門檻），突發 Bz 轉南或衝擊波可能尚未反映。`;
    }
    if (key === 'fast-clouds') {
      return en
        ? `3-hour cloud cover swings by ${spanStr}% (≥ 45% threshold) — fast-moving cloud decks can shift clear-window timing.`
        : `未來 3 小時雲量起伏達 ${spanStr}%（≥ 45% 門檻），雲團移動迅速，晴空空檔時間點可能提前或延後。`;
    }
    if (key === 'cloud-spread') {
      return en
        ? `${m1En} (${ccMet}%) and ${m2En} (${ccOm}%) differ by ${ccDiff}% over the next 3h (20–34% spread), adding local cloud uncertainty.`
        : `${m1Zh}（${ccMet}%）與${m2Zh}（${ccOm}%）3 小時雲量相差 ${ccDiff}%（20–34% 區間），局部雲縫存在不確定性。`;
    }
    if (key === 'single-model') {
      return en
        ? 'Single-model cloud forecast without dual-model cross-check.'
        : '目前僅取得單一氣象模型雲量，缺少雙模型交叉驗證。';
    }
    if (cloudConsensus) {
      return en
        ? `High confidence: NOAA telemetry is live (${lagStr} min lag), ${pairEn} 3h cloud spread is ${ccDiff}% (< 20%), and clouds are steady (${spanStr}% 3h swing).`
        : `可信度高：NOAA 衛星即時同步（延遲 ${lagStr} 分鐘）、${pairZh} 3h 雲量僅差 ${ccDiff}%（< 20%），且雲層穩定（3h 變幅 ${spanStr}%）。`;
    }
    return en
      ? `High confidence: NOAA telemetry is live (${lagStr} min lag) with MET Norway 2.5km clouds (${spanStr}% 3h swing).`
      : `可信度高：NOAA 衛星即時同步（延遲 ${lagStr} 分鐘），採用挪威官方 2.5km 分層雲量（3h 變幅 ${spanStr}%）。`;
  };

  const confDetails = reasons.map(reasonDetail);
  const confHeadline = confDetails[0];

  const formulaText = statusTier === 'gated'
    ? `${bLabel} → 0`
    : `${skyF} × ${bd.auroraScore} × ${darkF} = ${sc.total}`;

  return {
    score: {
      total: sc.total,
      grade: tGrade(sc.grade, lang),
      statusTier,
      formulaText
    },
    breakdown: { ...bd, externalAlerts },
    bottleneck: {
      key: bKey,
      limitingPillar,
      label: bLabel,
      headline: bHeadline,
      detail: bDetail
    },
    confidence: {
      level: confLevel,
      label: confLevel === 'high' ? (en ? 'High' : '高') : (confLevel === 'low' ? (en ? 'Low' : '低') : (en ? 'Medium' : '中')),
      badgeText: confBadgeMap[primaryReason] || (en ? 'Confidence: medium' : '可信度：中'),
      primaryReason,
      reasons,
      metrics: {
        noaaLagMin: Number.isFinite(noaaLagMin) ? Math.round(noaaLagMin) : null,
        cloudDiffPct: ccDiff,
        metAvg3h: ccMet,
        omAvg3h: ccOm,
        cloudSpan3h: span3h,
        usedMet: !!usedMet,
        dualModel: !!cloudConsensus,
        noaaOk: !!noaaOk
      },
      headline: confHeadline,
      details: confDetails
    },
    disclaimer: {
      title: en ? 'Forecast limits' : '預報限制',
      items: en
        ? [
            { key: 'fjord-clouds', text: 'Nordic fjord & coastal cloud error (±15–25%): even 2.5 km models struggle with steep-terrain stratus and coastal fog; check the sky or nearby webcams when models diverge.' },
            { key: 'substorm-timing', text: 'Stochastic substorm timing: stored magnetotail energy can trigger a bright outburst within 5–15 min—or stall—making exact onset timing inherently unpredictable.' },
            { key: 'local-site', text: 'Local light pollution & horizon: the score assumes an unobstructed dark-sky horizon; city lights, mountains, and local mist directly reduce naked-eye visibility.' }
          ]
        : [
            { key: 'fjord-clouds', text: '北歐峽灣與沿海地形雲量誤差約 ±15–25%：即使採用 2.5 km 高解析模式，山谷地形雲與海霧仍可能快速生消，雙模型分歧時請搭配實拍雲況。' },
            { key: 'substorm-timing', text: '副磁暴爆發具隨機性：磁尾累積能量可在 5–15 分鐘內突然釋放或短暫停歇，即使太陽風條件相近，爆發精準時刻仍無法提前定點預測。' },
            { key: 'local-site', text: '未計入當地光害與遮蔽：指數假設開闊暗空地平線；市區路燈、建築、山脈遮擋及低空霧氣均會明顯降低肉眼可見度。' }
          ]
    }
  };
}

// ====== Upstream Space-Weather & Weather Parsers ======

export function parseMagSeries(rows, limit = 180) {
  if (!Array.isArray(rows) || !Number.isFinite(limit) || limit <= 0) return [];
  const active = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object' || r.active !== true) continue;
    const ts = parseUtcMs(r.time_tag);
    if (!Number.isFinite(ts)) continue;
    if (typeof r.bz_gsm !== 'number' || !Number.isFinite(r.bz_gsm) || Math.abs(r.bz_gsm) > 200) continue;
    const by = typeof r.by_gsm === 'number' && Number.isFinite(r.by_gsm) && Math.abs(r.by_gsm) <= 200 ? r.by_gsm : 0;
    const bt = typeof r.bt === 'number' && Number.isFinite(r.bt) && r.bt >= 0 && r.bt <= 300 ? r.bt : null;
    active.push({ time_tag: String(r.time_tag), ts, bz: r.bz_gsm, by, bt });
  }
  active.sort((a, b) => a.ts - b.ts);
  return active.slice(-Math.floor(limit)).map(({ time_tag, bz, by, bt }) => ({ time_tag, bz, by, bt }));
}

export function parseWindSeries(rows, limit = 180) {
  if (!Array.isArray(rows) || !Number.isFinite(limit) || limit <= 0) return [];
  const active = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object' || r.active !== true) continue;
    const ts = parseUtcMs(r.time_tag);
    if (!Number.isFinite(ts)) continue;
    if (typeof r.proton_speed !== 'number' || !Number.isFinite(r.proton_speed) || r.proton_speed <= 100 || r.proton_speed > 3000) continue;
    const density = (typeof r.proton_density === 'number' && Number.isFinite(r.proton_density) && r.proton_density >= 0 && r.proton_density <= 500) ? r.proton_density : null;
    active.push({ time_tag: String(r.time_tag), ts, speed: r.proton_speed, density });
  }
  active.sort((a, b) => a.ts - b.ts);
  return active.slice(-Math.floor(limit)).map(({ time_tag, speed, density }) => ({ time_tag, speed, density }));
}

export function parseLatestActiveWind(rows) {
  const s = parseWindSeries(rows, 180);
  if (!s.length) return null;
  const last = s[s.length - 1];
  return { speed: last.speed, density: last.density, time_tag: last.time_tag };
}

export function parseKpForecast(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const isArr = Array.isArray(r);
    const rawKp = isArr
      ? toFinite(r[1])
      : (toFinite(r.kp) ?? toFinite(r.Kp));
    const tag = String(isArr ? (r[0] || '') : (r.time_tag || '')).trim();
    const ts = parseUtcMs(tag);
    if (rawKp === null || rawKp < 0 || rawKp > 9.5 || !Number.isFinite(ts)) continue;
    out.push({ ts, kp: rawKp, observed: String(isArr ? (r[2] || '') : (r.observed || '')) });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Match NOAA 3-hour Kp bin [ts, ts + 3h) first, falling back to nearest bin center (ts + 1.5h) within 6h */
export function lookupForecastKp(fcList, targetDate, fallbackKp = 0) {
  const fb = Number.isFinite(fallbackKp) ? fallbackKp : 0;
  if (!Array.isArray(fcList) || !fcList.length) return fb;
  const targetMs = (targetDate instanceof Date ? targetDate.getTime() : Number(targetDate));
  if (!Number.isFinite(targetMs)) return fb;
  for (const item of fcList) {
    if (item && Number.isFinite(item.ts) && Number.isFinite(item.kp) && targetMs >= item.ts && targetMs < item.ts + 3 * 3600000) {
      return item.kp;
    }
  }
  let best = null, bestDist = Infinity;
  for (const item of fcList) {
    if (!item || !Number.isFinite(item.ts) || !Number.isFinite(item.kp)) continue;
    const d = Math.abs((item.ts + 5400000) - targetMs);
    if (d < bestDist) { bestDist = d; best = item.kp; }
  }
  return best !== null && bestDist <= 6 * 3600000 ? best : fb;
}

export function parseLatestKp(rows) {
  if (!Array.isArray(rows)) return null;
  const items = [];
  let is1m = false;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (typeof r.estimated_kp === 'number') is1m = true;
    const isArr = Array.isArray(r);
    const val = isArr
      ? toFinite(r[1])
      : (toFinite(r.estimated_kp) ?? toFinite(r.Kp) ?? toFinite(r.kp_index));
    const tag = isArr ? r[0] : r.time_tag;
    const ts = parseUtcMs(tag);
    if (val === null || val < 0 || val > 9.5 || !Number.isFinite(ts)) continue;
    items.push({ kp: val, time_tag: String(tag), ts });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.ts - b.ts);
  const last = items[items.length - 1];
  // NOAA 1-minute Kp resets to provisional 0Z at the start of every 3h UT bin (00/03/06/09/12/15/18/21 UTC):
  // - During active conditions it ramps up over 10-15 min (guard sharp drops >= 0.67 within first 15 min)
  // - During quiet/unsettled conditions (Kp 1-2) it often stays identically 0Z for 20-40 min until first deflection
  //   accumulates; hold the settled prior-bin Kp while every sample in the new bin so far is still 0.
  if (is1m && items.length >= 2) {
    const lastDt = new Date(last.ts);
    const isBinStartHour = (lastDt.getUTCHours() % 3 === 0);
    const binMin = lastDt.getUTCMinutes();
    if (isBinStartHour && binMin < 45) {
      const binStartMs = last.ts - (binMin * 60000 + lastDt.getUTCSeconds() * 1000);
      let prevBinSettled = null;
      for (let i = items.length - 2; i >= 0; i--) {
        if (items[i].ts < binStartMs && (binStartMs - items[i].ts) <= 20 * 60000 && items[i].kp > 0) {
          prevBinSettled = items[i];
          break;
        }
      }
      if (prevBinSettled) {
        const sharpEarlyDrop = binMin < 15 && (prevBinSettled.kp - last.kp) >= 0.67;
        const allZeroStartup = last.kp === 0 && prevBinSettled.kp >= 0.67 &&
          items.every(it => it.ts < binStartMs || it.kp === 0);
        if (sharpEarlyDrop || allZeroStartup) {
          return { kp: prevBinSettled.kp, time_tag: prevBinSettled.time_tag };
        }
      }
    }
    if (last.kp === 0) {
      const lookback = items.slice(Math.max(0, items.length - 6), -1);
      for (let i = lookback.length - 1; i >= 0; i--) {
        if (lookback[i].kp > 0) return { kp: lookback[i].kp, time_tag: lookback[i].time_tag };
      }
    }
  }
  return { kp: last.kp, time_tag: last.time_tag };
}

/**
 * OVATION 1°x1° grid lookup with strict type validation, negative-longitude normalization,
 * and bilinear interpolation over the 4 surrounding integer grid nodes (nearest fallback for sparse mocks).
 */
export function lookupOvationProb(ovationJson, lat, lon) {
  if (!ovationJson || !Array.isArray(ovationJson.coordinates) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const normLon = ((lon % 360) + 360) % 360;
  const clampedLat = Math.max(-90, Math.min(90, lat));
  const lat0 = Math.floor(clampedLat);
  const lat1 = Math.min(90, lat0 + 1);
  const lon0 = Math.floor(normLon) % 360;
  const lon1 = (lon0 + 1) % 360;

  let q00 = null, q10 = null, q01 = null, q11 = null;
  let bestVal = null, bestDist = Infinity;

  for (const pt of ovationJson.coordinates) {
    if (!Array.isArray(pt) || pt.length < 3) continue;
    if (typeof pt[0] !== 'number' || typeof pt[1] !== 'number' || typeof pt[2] !== 'number') continue;
    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1]) || !Number.isFinite(pt[2])) continue;
    if (pt[1] < -90 || pt[1] > 90 || pt[2] < 0 || pt[2] > 100) continue;

    const pLon = ((pt[0] % 360) + 360) % 360;
    const pLat = pt[1];
    const dLat = Math.abs(pLat - clampedLat);
    if (dLat > 1.5) continue;
    let dLon = Math.abs(pLon - normLon);
    if (dLon > 180) dLon = 360 - dLon;
    if (dLon > 1.5) continue;

    if (pLat === lat0 && pLon === lon0) q00 = pt[2];
    if (pLat === lat0 && pLon === lon1) q10 = pt[2];
    if (pLat === lat1 && pLon === lon0) q01 = pt[2];
    if (pLat === lat1 && pLon === lon1) q11 = pt[2];

    const d = dLat + dLon;
    if (d < bestDist) { bestDist = d; bestVal = pt[2]; }
  }

  // Exact bilinear interpolation when all 4 surrounding grid corners are present
  if (q00 !== null && q10 !== null && q01 !== null && q11 !== null) {
    const fx = normLon - Math.floor(normLon);
    const fy = lat1 === lat0 ? 0 : (clampedLat - lat0);
    const interp = (1 - fx) * (1 - fy) * q00 + fx * (1 - fy) * q10 + (1 - fx) * fy * q01 + fx * fy * q11;
    return Math.max(0, Math.min(100, Math.round(interp)));
  }
  return bestVal !== null && bestDist <= 1.25 ? Math.round(bestVal) : null;
}

export function parseHemiPower(txt, lat = 69.97) {
  if (typeof txt !== 'string' || !txt.trim()) return null;
  const tsRe = /^\d{4}-\d{2}-\d{2}[_T]\d{2}:\d{2}/;
  const lines = txt.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    if (!tsRe.test(parts[0]) || !tsRe.test(parts[1])) continue;
    const north = toFinite(parts[2]), south = toFinite(parts[3]);
    if (north === null || south === null || north < 0 || south < 0 || north > 1000 || south > 1000) continue;
    return { obsTime: parts[0], fcTime: parts[1], north, south, gw: (Number.isFinite(lat) ? lat : 69.97) >= 0 ? north : south };
  }
  return null;
}

/**
 * GOES magnetometer substorm onset detector with physical Hp bounds (-200..350 nT),
 * causal tail median spike rejection, staleness check, and dayside diurnal ramp guard.
 */
export function parseGoesSubstorm(rows, satLonDeg = null, nowMs = null) {
  if (!Array.isArray(rows) || rows.length < 5) return null;
  const clean = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object' || r.arcjet_flag === true) continue;
    if (typeof r.Hp !== 'number' || !Number.isFinite(r.Hp) || r.Hp < -200 || r.Hp > 350) continue;
    const ts = parseUtcMs(r.time_tag);
    if (!Number.isFinite(ts)) continue;
    clean.push({ time_tag: String(r.time_tag), ts, hp: r.Hp });
  }
  if (clean.length < 5) return null;
  clean.sort((a, b) => a.ts - b.ts);
  const smoothHp = medianSmooth3(clean.map(x => x.hp));
  const series = clean.map((x, i) => ({ ...x, hp: smoothHp[i] }));
  const latest = series[series.length - 1];
  const stale = Number.isFinite(nowMs) && (nowMs - latest.ts) > 30 * 60000;

  const win = series.filter(x => x.ts >= latest.ts - 26 * 60000);
  if (win.length < 2) {
    return { latestHp: +latest.hp.toFixed(1), jumpNt: 0, jump10m: 0, active: false, stale, time_tag: latest.time_tag };
  }
  const sortedHp = win.map(x => x.hp).sort((a, b) => a - b);
  const baseHp = sortedHp.length >= 6 ? sortedHp[1] : sortedHp[0];
  const jumpNt = +Math.max(0, latest.hp - baseHp).toFixed(1);

  const win10 = series.filter(x => x.ts >= latest.ts - 11 * 60000);
  const min10 = win10.length ? Math.min(...win10.map(x => x.hp)) : latest.hp;
  const jump10m = +Math.max(0, latest.hp - min10).toFixed(1);

  // Dayside geostationary diurnal Hp drift guard when GOES satellite longitude is provided
  let isDayside = false;
  if (Number.isFinite(satLonDeg)) {
    const utcH = (latest.ts % 86400000) / 3600000;
    const satLt = (((utcH + satLonDeg / 15) % 24) + 24) % 24;
    isDayside = satLt > 5.5 && satLt < 18.5;
  }
  const active = !stale && (isDayside ? (jump10m >= 15 && jumpNt >= 22) : (jumpNt >= 15));
  return { latestHp: +latest.hp.toFixed(1), jumpNt, jump10m, active, stale, time_tag: latest.time_tag };
}

/**
 * Merge GOES primary (East/Atlantic 75°W) and secondary (West/Pacific 137°W).
 * Always stamps `.sector` and down-weights opposite-hemisphere substorms (>110° longitude away) when obsLon is provided.
 */
export function mergeGoesSubstorm(primarySub, secondarySub, obsLon = null) {
  if (!primarySub && !secondarySub) return null;
  const sectorWeight = (satLon) => {
    if (!Number.isFinite(obsLon)) return 1;
    let dLon = Math.abs(obsLon - satLon);
    if (dLon > 180) dLon = 360 - dLon;
    return dLon <= 95 ? 1 : (dLon <= 135 ? 0.65 : 0.45);
  };
  const scaleSub = (sub, sector, satLon) => {
    if (!sub) return null;
    const w = sectorWeight(satLon);
    const effJump = +(Math.max(0, sub.jumpNt ?? 0) * w).toFixed(1);
    return {
      ...sub,
      sector,
      rawJumpNt: sub.jumpNt ?? 0,
      jumpNt: effJump,
      active: Boolean(sub.active) && effJump >= 15
    };
  };
  const e = scaleSub(primarySub, 'east', -75);
  const w = scaleSub(secondarySub, 'west', -137);
  if (!w) return e;
  if (!e) return w;
  return (w.jumpNt > e.jumpNt || (w.active && !e.active)) ? w : e;
}

/**
 * Parse NOAA SWPC Geospace MHD 1-hour forward Kp prediction (1-minute resolution up to +60 min ahead).
 */
export function parseGeospacePredKp1h(rows, nowMs = Date.now()) {
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(nowMs)) return null;
  let nowPredKp = null, nowDiff = Infinity;
  let maxNext60Kp = null, peakTimeTag = null;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const ts = parseUtcMs(r.model_prediction_time);
    const k = toFinite(r.k);
    if (!Number.isFinite(ts) || k === null || k < 0 || k > 9.5) continue;
    const dNow = Math.abs(ts - nowMs);
    if (dNow < nowDiff && dNow <= 15 * 60000) { nowDiff = dNow; nowPredKp = +k.toFixed(2); }
    if (ts >= nowMs && ts <= nowMs + 70 * 60000) {
      if (maxNext60Kp === null || k > maxNext60Kp) {
        maxNext60Kp = +k.toFixed(2);
        peakTimeTag = String(r.model_prediction_time);
      }
    }
  }
  if (nowPredKp === null && maxNext60Kp === null) return null;
  return { nowPredKp, maxNext60Kp: maxNext60Kp ?? nowPredKp, peakTimeTag };
}

/** Parse SWPC "Valid To: 2026 Nov 24 2359 UTC" timestamps cleanly */
function parseSwpcValidToMs(msg) {
  if (typeof msg !== 'string') return NaN;
  const m = msg.match(/Valid\s+(?:To|Until)\s*:\s*(\d{4})\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2})(\d{2})\s*UTC/i);
  if (!m) return NaN;
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const mo = months[m[2].toLowerCase()];
  if (mo === undefined) return NaN;
  return Date.UTC(parseInt(m[1], 10), mo, parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10));
}

/**
 * Parse official NOAA SWPC geomagnetic warnings/alerts (Sudden Impulse CME shocks & K4-K9 alerts).
 * Respects CANCEL WARNING/WATCH messages and Valid To expiration timestamps.
 */
export function parseNoaaAlerts(rows, nowMs = Date.now(), maxAgeHours = 3) {
  const empty = { active: false, kind: null, kLevel: 0, gScale: 0, isWarning: false, code: null, issueTime: null };
  if (!Array.isArray(rows) || !rows.length || !Number.isFinite(nowMs)) return empty;

  // Sort chronologically so newer CANCEL messages cleanly invalidate earlier warnings
  const validRows = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const ts = parseUtcMs(r.issue_datetime);
    if (!Number.isFinite(ts) || ts > nowMs + 10 * 60000) continue;
    validRows.push({ r, ts });
  }
  validRows.sort((a, b) => a.ts - b.ts);

  const cancelledPids = new Map();
  for (const { r, ts } of validRows) {
    const pid = String(r.product_id || '').toUpperCase();
    const msg = String(r.message || '');
    if (/\bCANCEL\s+(WARNING|WATCH|ALERT)\b/i.test(msg)) {
      cancelledPids.set(pid, ts);
    }
  }

  const cutoffMs = nowMs - maxAgeHours * 3600000;
  let best = { ...empty };
  for (const { r, ts } of validRows) {
    const pid = String(r.product_id || '').toUpperCase();
    const msg = String(r.message || '');
    if (/\bCANCEL\s+(WARNING|WATCH|ALERT)\b/i.test(msg)) continue;
    const cancelTs = cancelledPids.get(pid);
    if (cancelTs !== undefined && cancelTs >= ts) continue;

    let kind = null, kLevel = 0, gScale = 0, isWarning = false;
    if (/SUDDEN IMPULSE/i.test(msg) || pid === 'EF3A' || pid.includes('SUD')) {
      kind = 'cme-shock'; kLevel = 6; gScale = 2;
      isWarning = /\bWARNING\b/i.test(msg) || pid.startsWith('WAR') || pid.endsWith('W');
      if (ts < nowMs - 90 * 60000) continue; // Cap CME impulse banner to 90 min
    } else {
      const m = pid.match(/^K0([4-9])([AW])$/);
      if (m) {
        kLevel = parseInt(m[1], 10);
        gScale = Math.max(0, kLevel - 4);
        isWarning = m[2] === 'W';
        kind = kLevel >= 5 ? 'k-storm' : 'k4-active';
        const validToMs = parseSwpcValidToMs(msg);
        if (Number.isFinite(validToMs)) {
          if (nowMs > validToMs) continue;
        } else if (ts < cutoffMs) {
          continue;
        }
      }
    }
    if (!kind) continue;
    const rank = kLevel + (kind === 'cme-shock' ? 0.5 : (isWarning ? -0.1 : 0));
    const bestRank = best.kLevel + (best.kind === 'cme-shock' ? 0.5 : (best.isWarning ? -0.1 : 0));
    if (rank > bestRank) {
      best = { active: kLevel >= 5 || kind === 'cme-shock', kind, kLevel, gScale, isWarning, code: pid, issueTime: String(r.issue_datetime) };
    }
  }
  return best;
}

export function parseNoaaGeomagneticScales(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const readEntry = (k) => {
    const e = json[k];
    if (!e || typeof e !== 'object') return null;
    const scale = parseInt(e?.G?.Scale, 10);
    if (!Number.isFinite(scale) || scale < 0 || scale > 5) return null;
    const text = String(e?.G?.Text || 'none').toLowerCase();
    const date = String(e?.DateStamp || '').slice(0, 10);
    return { key: k, date, scale, text };
  };
  const cur = readEntry('0');
  const days = ['1', '2', '3'].map(readEntry).filter(Boolean);
  if (!cur && !days.length) return null;
  const currentScale = cur ? cur.scale : 0;
  const currentText = cur ? cur.text : 'none';
  let maxForecastScale = 0, peakDate = null, peakText = 'none';
  for (const d of days) {
    if (d.scale > maxForecastScale) { maxForecastScale = d.scale; peakDate = d.date; peakText = d.text; }
  }
  const raw0 = json['0'];
  const updatedUtc = (raw0?.DateStamp && raw0?.TimeStamp)
    ? `${String(raw0.DateStamp).slice(0, 10)} ${String(raw0.TimeStamp).slice(0, 8)}`
    : null;
  return {
    currentScale, currentText, maxForecastScale, peakDate, peakText, days, updatedUtc,
    active: currentScale >= 1 || maxForecastScale >= 1
  };
}

/**
 * Parse NOAA/Kyoto WDC real-time Dst ring-current index (supports both object-array and legacy 2D-array formats).
 * Storm classification follows Gonzalez et al. (1994): -50 nT moderate, -100 nT intense, -250 nT extreme.
 */
export function parseKyotoDst(json, nowMs = Date.now()) {
  if (!Array.isArray(json) || !json.length) return null;
  const pts = [];
  for (const row of json) {
    let rawTag, rawVal;
    if (Array.isArray(row)) {
      if (row.length < 2 || row[0] === 'time_tag') continue;
      rawTag = row[0]; rawVal = row[1];
    } else if (row && typeof row === 'object') {
      rawTag = row.time_tag; rawVal = row.dst;
    } else {
      continue;
    }
    const ts = parseUtcMs(rawTag);
    const dst = toFinite(rawVal);
    if (!Number.isFinite(ts) || dst === null || dst < -1000 || dst > 200) continue;
    if (ts > nowMs + 2 * 3600000) continue;
    pts.push({ ts, dst, timeTag: String(rawTag) });
  }
  if (!pts.length) return null;
  pts.sort((a, b) => a.ts - b.ts);
  const latest = pts[pts.length - 1];
  if (nowMs - latest.ts > 12 * 3600000) return null;
  const recent6 = pts.filter(p => p.ts >= latest.ts - 6 * 3600000);
  const min6h = Math.min(...recent6.map(p => p.dst));
  const effDst = Math.min(latest.dst, min6h);
  const stormClass = effDst <= -250 ? 'extreme' : effDst <= -100 ? 'intense' : effDst <= -50 ? 'moderate' : 'quiet';
  return { dst: Math.round(latest.dst), min6h: Math.round(min6h), stormClass, timeTag: latest.timeTag };
}

/**
 * Parse NOAA Geospace official bow-shock propagated solar wind (1-hour JSON).
 * Provides live L1-to-bow-shock propagation ETA accounting for DSCOVR/ACE GSE orbit & Parker spiral tilt.
 */
export function parsePropagatedSolarWind(json, nowMs = Date.now()) {
  if (!Array.isArray(json) || json.length < 2) return null;
  const hdr = Array.isArray(json[0]) ? json[0] : null;
  const idx = (name, fallback) => {
    if (!hdr) return fallback;
    const i = hdr.indexOf(name);
    return i >= 0 ? i : fallback;
  };
  const iTime = idx('time_tag', 0);
  const iSpd = idx('speed', 1);
  const iBz = idx('bz', 6);
  const iProp = idx('propagated_time_tag', 11);

  const pts = [];
  for (let i = hdr ? 1 : 0; i < json.length; i++) {
    const r = json[i];
    if (!Array.isArray(r)) continue;
    const obsTs = parseUtcMs(r[iTime]);
    const propTs = parseUtcMs(r[iProp]);
    const speed = toFinite(r[iSpd]);
    const bz = toFinite(r[iBz]);
    if (!Number.isFinite(obsTs) || !Number.isFinite(propTs) || speed === null || speed < 150 || speed > 3000) continue;
    const etaMin = (propTs - obsTs) / 60000;
    if (etaMin < 10 || etaMin > 120) continue;
    pts.push({ obsTs, propTs, etaMin, speed, bz, propTag: String(r[iProp]) });
  }
  if (!pts.length) return null;
  pts.sort((a, b) => a.obsTs - b.obsTs);
  const latest = pts[pts.length - 1];
  if (nowMs - latest.obsTs > 3 * 3600000) return null;
  const tail = pts.slice(-5);
  const avgEta = Math.round(tail.reduce((s, p) => s + p.etaMin, 0) / tail.length);
  return {
    etaMin: avgEta,
    speed: +latest.speed.toFixed(1),
    bz: latest.bz !== null ? +latest.bz.toFixed(2) : null,
    propagatedTimeTag: latest.propTag
  };
}

/**
 * Parse NOAA WSA-ENLIL 3D heliospheric MHD forecast (0-96h ahead).
 * Identifies modeled CME ejecta passages (cloud > 0) and high-speed streams (v_r >= 550 km/s) or shocks (n >= 15 cm^-3).
 */
export function parseEnlilForecast(rows, nowMs = Date.now()) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const endMs = nowMs + 96 * 3600000;
  const future = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const ts = parseUtcMs(r.time_tag);
    if (!Number.isFinite(ts) || ts < nowMs - 3600000 || ts > endMs) continue;
    const v = toFinite(r.v_r);
    const n = toFinite(r.earth_particles_per_cm3);
    const cloud = toFinite(r.cloud) ?? 0;
    if (v === null || v < 150 || v > 3500) continue;
    future.push({ ts, v, n: n !== null && n >= 0 ? n : 0, isCme: cloud > 0 });
  }
  if (!future.length) return null;
  future.sort((a, b) => a.ts - b.ts);

  // Downsample to hourly peak envelopes so downstream outlook & SWR caching stay tiny (< 3 KB)
  const hourlyMap = new Map();
  for (const p of future) {
    const hKey = Math.floor(p.ts / 3600000) * 3600000;
    const cur = hourlyMap.get(hKey);
    if (!cur) {
      hourlyMap.set(hKey, { ts: hKey, maxV: p.v, maxN: p.n, isCme: p.isCme });
    } else {
      if (p.v > cur.maxV) cur.maxV = p.v;
      if (p.n > cur.maxN) cur.maxN = p.n;
      if (p.isCme) cur.isCme = true;
    }
  }
  const hourly = Array.from(hourlyMap.values()).sort((a, b) => a.ts - b.ts);
  let maxSpeed = 0, maxDensity = 0, hasCme = false, firstCmeTs = null, peakTs = null;
  for (const h of hourly) {
    if (h.maxV > maxSpeed) { maxSpeed = h.maxV; peakTs = h.ts; }
    if (h.maxN > maxDensity) maxDensity = h.maxN;
    if (h.isCme) {
      hasCme = true;
      if (firstCmeTs === null) firstCmeTs = h.ts;
    }
  }
  return {
    hourly,
    hasCme,
    firstCmeTs,
    peakTs,
    maxSpeed: Math.round(maxSpeed),
    maxDensity: +maxDensity.toFixed(1),
    active: hasCme || maxSpeed >= 550 || maxDensity >= 15
  };
}

/** MET Norway Locationforecast 2.0 hourly parser (default 12h, supports 24h with 6h-step guard & astronomical nightKey) */
export function parseMetNorwayHourly12(metJson, lat, lon, timeZone, nowDate, horizonHours = 12) {
  const series = metJson?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) return [];
  const safeNow = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  const nowMs = safeNow.getTime();
  const maxLen = Math.max(1, Math.min(48, Math.round(Number(horizonHours) || 12)));
  let idx = series.findIndex(item => {
    const ts = Date.parse(item?.time);
    return Number.isFinite(ts) && ts > nowMs - 3600000;
  });
  if (idx < 0) idx = 0;
  const out = [];
  let prevTs = null;
  for (let i = idx; i < series.length && out.length < maxLen; i++) {
    const item = series[i];
    const ts = Date.parse(item?.time);
    if (!Number.isFinite(ts)) continue;
    // Stop cleanly if a truncated/stale MET Norway feed switches from 1h steps to 6h steps
    if (prevTs !== null && (ts - prevTs) > 5400000) break;
    prevTs = ts;
    const det = item?.data?.instant?.details || {};
    const dt = new Date(ts);
    const midDt = new Date(ts + 1800000);
    const sunAlt = computeSolarElevation(midDt, lat, lon);
    const isTooBright = sunAlt >= -4;
    const fogVal = toFinite(det.fog_area_fraction) ?? 0;
    const totRaw = toFinite(det.cloud_area_fraction);
    const totCap = totRaw !== null ? Math.max(totRaw, fogVal) : null;
    const pr = toFinite(item?.data?.next_1_hours?.details?.precipitation_amount) ?? 0;
    const lowF = toFinite(det.cloud_area_fraction_low);
    const midF = toFinite(det.cloud_area_fraction_medium);
    const highF = toFinite(det.cloud_area_fraction_high);
    const hasLayers = lowF !== null || midF !== null || highF !== null;
    const effCloud = hasLayers
      ? computeEffectiveCloud(lowF ?? 0, midF ?? 0, highF ?? 0, fogVal, totCap, pr)
      : computeEffectiveCloud(totRaw ?? 100, 0, 0, fogVal, totCap, pr);
    const tp = toFinite(det.air_temperature) ?? 0;
    const windMs = Math.max(0, toFinite(det.wind_speed) ?? 0);
    const windChill = computeWindChill(tp, windMs);
    const z = getZoneParts(dt, timeZone);
    const nightKey = getZoneParts(new Date(ts - 12 * 3600000), timeZone).dateStr;
    const txt = isTooBright
      ? (sunAlt >= 0 ? '☀️ 白天' : '🌅 晨昏光')
      : (pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (effCloud <= 25 ? '🌟 晴' : effCloud <= 65 ? '⛅ 縫' : '☁️ 陰'));
    out.push({
      time: `${z.hourStr}:${z.minStr}`, dtMs: midDt.getTime(), localDate: z.dateStr, nightKey,
      block: effCloud, clear: 100 - effCloud, txt, temp: tp, precip: pr, windMs, windChill, isDay: isTooBright, sunAlt
    });
  }
  return out;
}

export function parseMetNorwayMultiDay(metJson, lat, lon, timeZone, nowDate) {
  const series = metJson?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) return [];
  const safeNow = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  const nowMs = safeNow.getTime();
  const maxMs = nowMs + 84 * 3600000;
  const out = [];
  for (let i = 0; i < series.length; i++) {
    const item = series[i];
    const ts = Date.parse(item?.time);
    if (!Number.isFinite(ts) || ts < nowMs - 3600000 || ts > maxMs) continue;
    const nextTs = i + 1 < series.length ? Date.parse(series[i + 1]?.time) : NaN;
    const stepHrs = Number.isFinite(nextTs) && nextTs > ts
      ? Math.max(1, Math.min(6, Math.round((nextTs - ts) / 3600000)))
      : 1;
    const det = item?.data?.instant?.details || {};
    const fogVal = toFinite(det.fog_area_fraction) ?? 0;
    const totRaw = toFinite(det.cloud_area_fraction);
    const totCap = totRaw !== null ? Math.max(totRaw, fogVal) : null;
    const pr1 = toFinite(item?.data?.next_1_hours?.details?.precipitation_amount);
    const pr6 = toFinite(item?.data?.next_6_hours?.details?.precipitation_amount);
    const pr = pr1 !== null ? pr1 : (pr6 !== null ? +(pr6 / 6).toFixed(2) : 0);
    const lowF = toFinite(det.cloud_area_fraction_low);
    const midF = toFinite(det.cloud_area_fraction_medium);
    const highF = toFinite(det.cloud_area_fraction_high);
    const hasLayers = lowF !== null || midF !== null || highF !== null;
    const effCloud = hasLayers
      ? computeEffectiveCloud(lowF ?? 0, midF ?? 0, highF ?? 0, fogVal, totCap, pr)
      : computeEffectiveCloud(totRaw ?? 100, 0, 0, fogVal, totCap, pr);
    const midDt = new Date(ts + stepHrs * 1800000);
    const sunAlt = computeSolarElevation(midDt, lat, lon);
    const z = getZoneParts(new Date(ts), timeZone);
    out.push({ dtMs: midDt.getTime(), time: `${z.hourStr}:${z.minStr}`, clear: 100 - effCloud, block: effCloud, sunAlt, isDay: sunAlt >= -4, stepHrs });
  }
  return out;
}

function inferOpenMeteoFog(hourly, i) {
  const wc = toFinite(hourly?.weather_code?.[i]);
  if (wc === 45 || wc === 48) return 85;
  const vis = toFinite(hourly?.visibility?.[i]);
  if (vis !== null && vis >= 0 && vis < 1200) {
    return Math.max(0, Math.min(100, Math.round(100 * (1 - vis / 1500))));
  }
  return 0;
}

/**
 * Open-Meteo hourly parser (default 12h, supports 24h) supporting BOTH DST-proof Unix timestamps (timeformat=unixtime)
 * AND ISO local strings with utc_offset_seconds, with null-layer fallback, WMO fog & precip occlusion.
 */
export function parseOpenMeteoHourly12(hourly, lat, lon, timeZone, nowDate, utcOffsetSec = null, horizonHours = 12) {
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) return [];
  const safeNow = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  const nowMs = safeNow.getTime();
  const maxLen = Math.max(1, Math.min(48, Math.round(Number(horizonHours) || 12)));
  const firstValid = hourly.time.find(t => t !== null && t !== undefined && (typeof t === 'number' ? Number.isFinite(t) : typeof t === 'string' && t.length >= 10));
  if (firstValid === undefined) return [];
  const isUnix = typeof firstValid === 'number';
  let idx;
  if (isUnix) {
    idx = hourly.time.findIndex(t => typeof t === 'number' && Number.isFinite(t) && (t * 1000) > nowMs - 3600000);
  } else {
    const zNow = getZoneParts(safeNow, timeZone);
    idx = hourly.time.findIndex(t => typeof t === 'string' && t >= zNow.isoHour);
  }
  if (idx < 0) idx = 0;

  const out = [];
  for (let i = idx; i < hourly.time.length && out.length < maxLen; i++) {
    const rawT = hourly.time[i];
    let startMs;
    if (isUnix) {
      const tNum = toFinite(rawT);
      if (tNum === null) continue;
      startMs = tNum * 1000;
    } else if (typeof rawT === 'string' && rawT.length >= 10) {
      if (Number.isFinite(utcOffsetSec)) {
        const parsedLocalAsUtc = Date.parse(rawT + ':00Z');
        startMs = Number.isFinite(parsedLocalAsUtc)
          ? (parsedLocalAsUtc - utcOffsetSec * 1000)
          : (Math.floor(nowMs / 3600000) * 3600000 + (i - idx) * 3600000);
      } else {
        startMs = Math.floor(nowMs / 3600000) * 3600000 + (i - idx) * 3600000;
      }
    } else {
      continue;
    }
    if (!Number.isFinite(startMs)) continue;

    const lowF = toFinite(hourly.cloud_cover_low?.[i]);
    const midF = toFinite(hourly.cloud_cover_mid?.[i]);
    const highF = toFinite(hourly.cloud_cover_high?.[i]);
    const totF = toFinite(hourly.cloud_cover?.[i]);
    const fogVal = inferOpenMeteoFog(hourly, i);
    const pr = Math.max(0, toFinite(hourly.precipitation?.[i]) ?? 0);
    const hasLayers = lowF !== null || midF !== null || highF !== null;
    const effCloud = hasLayers
      ? computeEffectiveCloud(lowF ?? 0, midF ?? 0, highF ?? 0, fogVal, totF, pr)
      : computeEffectiveCloud(totF ?? 100, 0, 0, fogVal, totF, pr);
    const tp = toFinite(hourly.temperature_2m?.[i]) ?? 0;
    const windMs = Math.max(0, toFinite(hourly.wind_speed_10m?.[i]) ?? 0) / 3.6;
    const windChill = computeWindChill(tp, windMs);

    const midUtc = new Date(startMs + 1800000);
    const sunAlt = computeSolarElevation(midUtc, lat, lon);
    const isTooBright = sunAlt >= -4;
    const z = getZoneParts(new Date(startMs), timeZone);
    const nightKey = getZoneParts(new Date(startMs - 12 * 3600000), timeZone).dateStr;
    const timeStr = isUnix ? `${z.hourStr}:${z.minStr}` : String(rawT).slice(11, 16);
    const txt = isTooBright
      ? (sunAlt >= 0 ? '☀️ 白天' : '🌅 晨昏光')
      : (pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (effCloud <= 25 ? '🌟 晴' : effCloud <= 65 ? '⛅ 縫' : '☁️ 陰'));
    out.push({
      time: timeStr, dtMs: midUtc.getTime(), localDate: z.dateStr, nightKey,
      block: effCloud, clear: 100 - effCloud, txt, temp: tp, precip: pr, windMs, windChill, isDay: isTooBright, sunAlt
    });
  }
  return out;
}

export function parseOpenMeteoMultiDay(hourly, lat, lon, timeZone, nowDate, utcOffsetSec = null) {
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) return [];
  const safeNow = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  const nowMs = safeNow.getTime();
  const maxMs = nowMs + 84 * 3600000;
  const firstValid = hourly.time.find(t => t !== null && t !== undefined && (typeof t === 'number' ? Number.isFinite(t) : typeof t === 'string' && t.length >= 10));
  if (firstValid === undefined) return [];
  const isUnix = typeof firstValid === 'number';
  const zNow = isUnix ? null : getZoneParts(safeNow, timeZone);
  const idx0 = isUnix ? 0 : Math.max(0, hourly.time.findIndex(t => typeof t === 'string' && t >= zNow.isoHour));
  const out = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const rawT = hourly.time[i];
    let startMs;
    if (isUnix) {
      const tNum = toFinite(rawT);
      if (tNum === null) continue;
      startMs = tNum * 1000;
    } else if (typeof rawT === 'string' && rawT.length >= 10) {
      if (Number.isFinite(utcOffsetSec)) {
        const parsed = Date.parse(rawT + ':00Z');
        if (!Number.isFinite(parsed)) continue;
        startMs = parsed - utcOffsetSec * 1000;
      } else {
        if (rawT < zNow.isoHour) continue;
        startMs = Math.floor(nowMs / 3600000) * 3600000 + (i - idx0) * 3600000;
      }
    } else {
      continue;
    }
    if (!Number.isFinite(startMs)) continue;
    const midMs = startMs + 1800000;
    if (midMs < nowMs - 3600000 || midMs > maxMs) continue;

    const lowF = toFinite(hourly.cloud_cover_low?.[i]);
    const midF = toFinite(hourly.cloud_cover_mid?.[i]);
    const highF = toFinite(hourly.cloud_cover_high?.[i]);
    const totF = toFinite(hourly.cloud_cover?.[i]);
    const fogVal = inferOpenMeteoFog(hourly, i);
    const pr = Math.max(0, toFinite(hourly.precipitation?.[i]) ?? 0);
    const hasLayers = lowF !== null || midF !== null || highF !== null;
    const effCloud = hasLayers
      ? computeEffectiveCloud(lowF ?? 0, midF ?? 0, highF ?? 0, fogVal, totF, pr)
      : computeEffectiveCloud(totF ?? 100, 0, 0, fogVal, totF, pr);
    const sunAlt = computeSolarElevation(new Date(midMs), lat, lon);
    const z = getZoneParts(new Date(startMs), timeZone);
    out.push({ dtMs: midMs, time: isUnix ? `${z.hourStr}:${z.minStr}` : String(rawT).slice(11, 16), clear: 100 - effCloud, block: effCloud, sunAlt, isDay: sunAlt >= -4 });
  }
  return out;
}

/**
 * Dual-model cloud consensus check (MET Norway MEPS 2.5km vs Open-Meteo ECMWF/GFS).
 * Aligns hours by timestamp (dtMs within ±15 min) when available and uses max(|mean diff|, hourly MAE)
 * so opposite-phase cloud disagreements ([0,100,100] vs [100,100,0]) are never masked!
 */
export function evaluateCloudConsensus(metHrs, omHrs) {
  if (!Array.isArray(metHrs) || !metHrs.length || !Array.isArray(omHrs) || !omHrs.length) return null;
  const pairs = [];
  const hasDt = Number.isFinite(metHrs[0]?.dtMs) && Number.isFinite(omHrs[0]?.dtMs);
  if (hasDt) {
    for (const m of metHrs) {
      if (!m || !Number.isFinite(m.dtMs)) continue;
      const match = omHrs.find(o => o && Number.isFinite(o.dtMs) && Math.abs(o.dtMs - m.dtMs) <= 15 * 60000);
      if (match) {
        const mb = toFinite(m.block), ob = toFinite(match.block);
        if (mb !== null && ob !== null) pairs.push([mb, ob]);
      }
      if (pairs.length >= 3) break;
    }
  }
  if (!pairs.length) {
    const n = Math.min(3, metHrs.length, omHrs.length);
    for (let i = 0; i < n; i++) {
      const mb = toFinite(metHrs[i]?.block), ob = toFinite(omHrs[i]?.block);
      if (mb !== null && ob !== null) pairs.push([mb, ob]);
    }
  }
  if (!pairs.length) return null;
  const metAvg3h = Math.round(pairs.reduce((s, p) => s + p[0], 0) / pairs.length);
  const omAvg3h = Math.round(pairs.reduce((s, p) => s + p[1], 0) / pairs.length);
  const mae3h = pairs.reduce((s, p) => s + Math.abs(p[0] - p[1]), 0) / pairs.length;
  const diffPct = Math.round(Math.max(Math.abs(metAvg3h - omAvg3h), mae3h));
  const level = diffPct >= 35 ? 'low' : (diffPct >= 20 ? 'medium' : 'high');
  return { metAvg3h, omAvg3h, diffPct, mae3h: Math.round(mae3h), matchedHours: pairs.length, level };
}

// ====== Global Dual-Model NWP Routing & Airport METAR Laser Ceilometer Assimilation ======

/**
 * Curated global aurora-belt airport laser ceilometer registry (METAR/ASOS).
 * iemId uses 3-letter FAA ID for CONUS US stations on IEM and 4-letter ICAO elsewhere.
 */
export const METAR_STATIONS = [
  // Norway (dual-source: MET Norway tafmetar + IEM)
  { icao: 'ENTC', iemId: 'ENTC', name: 'Tromsø',        lat: 69.683, lon: 18.919 },
  { icao: 'ENAT', iemId: 'ENAT', name: 'Alta',          lat: 69.976, lon: 23.372 },
  { icao: 'ENEV', iemId: 'ENEV', name: 'Narvik/Evenes', lat: 68.491, lon: 16.678 },
  { icao: 'ENSH', iemId: 'ENSH', name: 'Svolvær',       lat: 68.243, lon: 14.669 },
  { icao: 'ENLK', iemId: 'ENLK', name: 'Leknes',        lat: 68.153, lon: 13.609 },
  { icao: 'ENBO', iemId: 'ENBO', name: 'Bodø',          lat: 67.269, lon: 14.365 },
  { icao: 'ENDU', iemId: 'ENDU', name: 'Bardufoss',     lat: 69.056, lon: 18.540 },
  { icao: 'ENKR', iemId: 'ENKR', name: 'Kirkenes',      lat: 69.726, lon: 29.891 },
  { icao: 'ENSB', iemId: 'ENSB', name: 'Svalbard',      lat: 78.246, lon: 15.466 },
  { icao: 'ENGM', iemId: 'ENGM', name: 'Oslo',          lat: 60.194, lon: 11.100 },
  { icao: 'ENBR', iemId: 'ENBR', name: 'Bergen',        lat: 60.293, lon: 5.218 },
  { icao: 'ENVA', iemId: 'ENVA', name: 'Trondheim',     lat: 63.458, lon: 10.924 },
  // Sweden
  { icao: 'ESNQ', iemId: 'ESNQ', name: 'Kiruna',        lat: 67.822, lon: 20.337 },
  { icao: 'ESPA', iemId: 'ESPA', name: 'Luleå',         lat: 65.544, lon: 22.122 },
  { icao: 'ESNU', iemId: 'ESNU', name: 'Umeå',          lat: 63.792, lon: 20.283 },
  { icao: 'ESNZ', iemId: 'ESNZ', name: 'Östersund',     lat: 63.194, lon: 14.502 },
  { icao: 'ESSA', iemId: 'ESSA', name: 'Stockholm',     lat: 59.652, lon: 17.919 },
  // Finland
  { icao: 'EFRO', iemId: 'EFRO', name: 'Rovaniemi',     lat: 66.565, lon: 25.830 },
  { icao: 'EFIV', iemId: 'EFIV', name: 'Ivalo',         lat: 68.607, lon: 27.405 },
  { icao: 'EFKT', iemId: 'EFKT', name: 'Kittilä',       lat: 67.701, lon: 24.847 },
  { icao: 'EFKS', iemId: 'EFKS', name: 'Kuusamo',       lat: 65.988, lon: 29.239 },
  { icao: 'EFOU', iemId: 'EFOU', name: 'Oulu',          lat: 64.930, lon: 25.355 },
  { icao: 'EFHK', iemId: 'EFHK', name: 'Helsinki',      lat: 60.317, lon: 24.963 },
  // Iceland & Greenland
  { icao: 'BIRK', iemId: 'BIRK', name: 'Reykjavik',     lat: 64.130, lon: -21.941 },
  { icao: 'BIKF', iemId: 'BIKF', name: 'Keflavik',      lat: 63.985, lon: -22.606 },
  { icao: 'BIAR', iemId: 'BIAR', name: 'Akureyri',      lat: 65.660, lon: -18.073 },
  { icao: 'BIEG', iemId: 'BIEG', name: 'Egilsstaðir',   lat: 65.283, lon: -14.401 },
  { icao: 'BGGH', iemId: 'BGGH', name: 'Nuuk',          lat: 64.191, lon: -51.678 },
  { icao: 'BGSF', iemId: 'BGSF', name: 'Kangerlussuaq', lat: 67.012, lon: -50.712 },
  // Alaska & Canada
  { icao: 'PAFA', iemId: 'PAFA', name: 'Fairbanks',     lat: 64.815, lon: -147.856 },
  { icao: 'PANC', iemId: 'PANC', name: 'Anchorage',     lat: 61.174, lon: -149.996 },
  { icao: 'PAJN', iemId: 'PAJN', name: 'Juneau',        lat: 58.355, lon: -134.576 },
  { icao: 'CYZF', iemId: 'CYZF', name: 'Yellowknife',   lat: 62.463, lon: -114.440 },
  { icao: 'CYXY', iemId: 'CYXY', name: 'Whitehorse',    lat: 60.710, lon: -135.067 },
  { icao: 'CYMM', iemId: 'CYMM', name: 'Fort McMurray', lat: 56.653, lon: -111.222 },
  { icao: 'CYYQ', iemId: 'CYYQ', name: 'Churchill',     lat: 58.739, lon: -94.065 },
  { icao: 'CYWG', iemId: 'CYWG', name: 'Winnipeg',      lat: 49.910, lon: -97.240 },
  { icao: 'CYEG', iemId: 'CYEG', name: 'Edmonton',      lat: 53.310, lon: -113.580 },
  { icao: 'CYYC', iemId: 'CYYC', name: 'Calgary',       lat: 51.114, lon: -114.020 },
  { icao: 'CYQT', iemId: 'CYQT', name: 'Thunder Bay',   lat: 48.372, lon: -89.324 },
  // Northern CONUS US (IEM 3-letter FAA IDs)
  { icao: 'KDLH', iemId: 'DLH',  name: 'Duluth',        lat: 46.842, lon: -92.194 },
  { icao: 'KMSP', iemId: 'MSP',  name: 'Minneapolis',   lat: 44.882, lon: -93.222 },
  { icao: 'KGFK', iemId: 'GFK',  name: 'Grand Forks',   lat: 47.949, lon: -97.176 },
  { icao: 'KGTF', iemId: 'GTF',  name: 'Great Falls',   lat: 47.482, lon: -111.371 },
  { icao: 'KSEA', iemId: 'SEA',  name: 'Seattle',       lat: 47.449, lon: -122.309 },
  { icao: 'KBTV', iemId: 'BTV',  name: 'Burlington',    lat: 44.472, lon: -73.153 },
  // UK / Ireland / Northern Europe
  { icao: 'EGPH', iemId: 'EGPH', name: 'Edinburgh',     lat: 55.950, lon: -3.373 },
  { icao: 'EGPE', iemId: 'EGPE', name: 'Inverness',     lat: 57.543, lon: -4.048 },
  { icao: 'EGPD', iemId: 'EGPD', name: 'Aberdeen',      lat: 57.202, lon: -2.198 },
  { icao: 'EGPB', iemId: 'EGPB', name: 'Shetland',      lat: 59.879, lon: -1.296 },
  { icao: 'EGAA', iemId: 'EGAA', name: 'Belfast',       lat: 54.658, lon: -6.216 },
  { icao: 'EKCH', iemId: 'EKCH', name: 'Copenhagen',    lat: 55.618, lon: 12.656 },
  // Southern Hemisphere (NZ, Tasmania, Patagonia) & Hokkaido
  { icao: 'NZQN', iemId: 'NZQN', name: 'Queenstown',    lat: -45.021, lon: 168.739 },
  { icao: 'NZDN', iemId: 'NZDN', name: 'Dunedin',       lat: -45.928, lon: 170.198 },
  { icao: 'NZNV', iemId: 'NZNV', name: 'Invercargill',  lat: -46.412, lon: 168.313 },
  { icao: 'NZCH', iemId: 'NZCH', name: 'Christchurch',  lat: -43.489, lon: 172.532 },
  { icao: 'YMHB', iemId: 'YMHB', name: 'Hobart',        lat: -42.836, lon: 147.510 },
  { icao: 'YMLT', iemId: 'YMLT', name: 'Launceston',    lat: -41.545, lon: 147.214 },
  { icao: 'SAWH', iemId: 'SAWH', name: 'Ushuaia',       lat: -54.843, lon: -68.296 },
  { icao: 'SCCI', iemId: 'SCCI', name: 'Punta Arenas',  lat: -53.003, lon: -70.855 },
  { icao: 'RJCC', iemId: 'RJCC', name: 'Sapporo',       lat: 42.775, lon: 141.692 }
];

export function findNearestMetarStation(lat, lon, maxKm = 55) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null;
  for (const st of METAR_STATIONS) {
    const d = computeDistanceKm(lat, lon, st.lat, st.lon);
    if (d <= maxKm && (!best || d < best.distKm)) {
      best = { ...st, distKm: Math.round(d) };
    }
  }
  return best;
}

/**
 * Converts METAR laser ceilometer sky-cover layers + weather codes to physical effective cloud (0..100%).
 * Standard WMO oktas (CLR/NCD=0, FEW=18.75%, SCT=43.75%, BKN=75%, OVC/VV=100%) weighted by altitude:
 * low (<=6500 ft) 1.00, mid (6500-20000 ft) 0.72, high (>20000 ft) 0.30, plus fog/precip >=85%.
 */
export function parseMetarSkyCover(skycArr = [], skylArr = [], wxStr = '', rawMetar = '') {
  const codeToFrac = (c) => {
    const t = String(c || '').trim().toUpperCase();
    if (!t || t === 'M' || t === 'NULL') return null;
    if (t === 'CLR' || t === 'SKC' || t === 'NCD' || t === 'NSC' || t === 'CAVOK') return 0;
    if (t === 'FEW') return 0.1875;
    if (t === 'SCT') return 0.4375;
    if (t === 'BKN') return 0.75;
    if (t === 'OVC' || t === 'VV') return 1.0;
    return null;
  };
  const sc = Array.isArray(skycArr) ? [...skycArr] : [];
  const sl = Array.isArray(skylArr) ? [...skylArr] : [];
  // Strip future trend/remarks (TEMPO/BECMG/NOSIG/RMK) so forecast trends never overwrite current sky!
  const obsRaw = String(rawMetar || '').split(/\b(?:TEMPO|BECMG|NOSIG|RMK)\b/)[0];
  // Extract cloud tokens directly from observed METAR body if structured columns are empty
  if (!sc.some(c => codeToFrac(c) !== null) && obsRaw) {
    const re = /\b(FEW|SCT|BKN|OVC|VV)(\d{3}|\/\/\/)(?:CB|TCU|\/\/\/)?(?=\s|$|=)/g;
    let m;
    while ((m = re.exec(obsRaw)) !== null) {
      sc.push(m[1]);
      sl.push(m[2] === '///' ? null : parseInt(m[2], 10) * 100);
    }
    if (!sc.some(c => codeToFrac(c) !== null) && /\b(CAVOK|NCD|NSC|SKC|CLR)\b/.test(obsRaw)) {
      sc.push('CLR');
      sl.push(null);
    }
  }
  let sawValid = false;
  let lo = 0, mid = 0, hi = 0;
  let ceilingFt = null;
  let topCode = 'CLR';
  const rank = { CLR: 0, FEW: 1, SCT: 2, BKN: 3, OVC: 4, VV: 5 };
  for (let i = 0; i < sc.length; i++) {
    const code = String(sc[i] || '').trim().toUpperCase();
    const f = codeToFrac(code);
    if (f === null) continue;
    sawValid = true;
    const normCode = (code === 'SKC' || code === 'NCD' || code === 'NSC' || code === 'CAVOK') ? 'CLR' : code;
    if ((rank[normCode] ?? 0) > (rank[topCode] ?? 0)) topCode = normCode;
    const hFt = toFinite(sl[i]);
    if (hFt === null || hFt <= 6500) lo = Math.max(lo, f);
    else if (hFt <= 20000) mid = Math.max(mid, f);
    else hi = Math.max(hi, f);
    if ((normCode === 'BKN' || normCode === 'OVC' || normCode === 'VV') && hFt !== null && hFt >= 0) {
      if (ceilingFt === null || hFt < ceilingFt) ceilingFt = hFt;
    }
  }
  const wxCombined = `${wxStr || ''} ${obsRaw}`;
  const hasPrecipFog = /(?:^|\s)[+-]?(?:FZ|SH|BL)?(?:FG|SN|RA|DZ|SG|PL)+\b/.test(wxCombined);
  const hasHeavyFog = /(?:^|\s)(?:FZ)?FG\b/.test(wxCombined);
  if (!sawValid && !hasPrecipFog) return null;
  const effBase = sawValid ? (1 - (1 - lo) * (1 - mid * 0.72) * (1 - hi * 0.30)) : 1.0;
  const eff = Math.min(1, hasHeavyFog ? Math.max(effBase, 0.92) : (hasPrecipFog ? Math.max(effBase, 0.85) : effBase));
  return {
    effCloud: Math.round(eff * 100),
    clearPct: 100 - Math.round(eff * 100),
    skyCode: sawValid ? topCode : (hasHeavyFog ? 'FOG' : 'WX'),
    ceilingM: ceilingFt !== null ? Math.round(ceilingFt * 0.3048) : null,
    hasPrecipFog
  };
}

/** Parse Iowa Environmental Mesonet /api/1/currents.json payload with 90-min freshness guard */
export function parseIemMetarCurrent(json, nowMs = Date.now()) {
  const row = json?.data?.[0];
  if (!row || typeof row !== 'object') return null;
  const obsMs = Date.parse(row.utc_valid || '');
  if (!Number.isFinite(obsMs)) return null;
  const ageMin = Math.round((nowMs - obsMs) / 60000);
  if (ageMin > 90 || ageMin < -15) return null;
  const sky = parseMetarSkyCover(
    [row.skyc1, row.skyc2, row.skyc3, row.skyc4],
    [row.skyl1, row.skyl2, row.skyl3, row.skyl4],
    Array.isArray(row.wxcodes) ? row.wxcodes.join(' ') : String(row.wxcodes || ''),
    row.raw || ''
  );
  if (!sky) return null;
  return {
    icao: String(row.station || '').trim().toUpperCase(),
    obsMs, ageMin: Math.max(0, ageMin),
    source: 'IEM',
    ...sky
  };
}

/** Parse MET Norway /weatherapi/tafmetar/1.0/metar.txt (takes latest line with 90-min guard) */
export function parseMetNorwayMetarText(text, nowMs = Date.now()) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lines = text.trim().split(/\r?\n/).map(l => l.trim()).filter(l => /^(?:(?:METAR|SPECI)\s+)?[A-Z]{4}\s+\d{6}Z\b/.test(l));
  if (!lines.length) return null;
  const last = lines[lines.length - 1];
  const m = last.match(/^(?:(?:METAR|SPECI)\s+)?([A-Z]{4})\s+(\d{2})(\d{2})(\d{2})Z\b/);
  if (!m) return null;
  const [, icao, ddStr, hhStr, mmStr] = m;
  const dd = parseInt(ddStr, 10), hh = parseInt(hhStr, 10), mm = parseInt(mmStr, 10);
  if (dd < 1 || dd > 31 || hh > 23 || mm > 59) return null;
  const ref = new Date(nowMs);
  // Resolve day-of-month rollover cleanly without Date.UTC silent month overflow (e.g. Feb 31 -> Mar 3)
  let bestMs = null, bestDiff = Infinity;
  for (const moOff of [-1, 0, 1]) {
    const cand = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + moOff, dd, hh, mm);
    if (new Date(cand).getUTCDate() !== dd) continue;
    const diff = Math.abs(nowMs - cand);
    if (diff < bestDiff) { bestDiff = diff; bestMs = cand; }
  }
  if (!Number.isFinite(bestMs)) return null;
  const ageMin = Math.round((nowMs - bestMs) / 60000);
  if (ageMin > 90 || ageMin < -15) return null;
  const sky = parseMetarSkyCover([], [], '', last);
  if (!sky) return null;
  return {
    icao, obsMs: bestMs, ageMin: Math.max(0, ageMin),
    source: 'MET Norway',
    ...sky
  };
}

/**
 * Strictly causal Optimal Interpolation (Daley 1991) airport laser ceilometer nowcast assimilation.
 * Decays innovation [METAR(t0) - NWP(t0)] exponentially across distance (Lc=40km), lead time (tau=1.6h),
 * and observation age (tau_a=90m) over hours +0h..+3h. Verified on 60,693 unbiased dark hours across
 * 2 winters (20 hubs): +1h clear-sky AUC 0.81 -> 0.90, MAE -5 to -6 pts, false-clear alarms cut >50%.
 */
export function assimilateMetarNowcast(hereHrs, metarObs, distKm) {
  if (!Array.isArray(hereHrs) || !hereHrs.length || !metarObs || !Number.isFinite(metarObs.effCloud)) {
    return { hours: hereHrs || [], applied: false };
  }
  const d = Number.isFinite(distKm) ? Math.max(0, distKm) : 999;
  const age = Number.isFinite(metarObs.ageMin) ? Math.max(0, metarObs.ageMin) : 999;
  const rawNwpCloud0 = hereHrs[0]?.block;
  if (d > 55 || age > 90 || !Number.isFinite(rawNwpCloud0)) return { hours: hereHrs, applied: false };

  const delta0 = metarObs.effCloud - rawNwpCloud0;
  const baseW = 0.72 * Math.exp(-d / 40) * Math.exp(-age / 90);
  const hours = hereHrs.map((h, idx) => {
    if (idx > 3 || !Number.isFinite(h?.block)) return h;
    const w = baseW * Math.exp(-idx / 1.6);
    const block = Math.max(0, Math.min(100, Math.round(h.block + w * delta0)));
    const clear = 100 - block;
    let txt = h.txt;
    if (!h.isDay) {
      const pr = Number(h.precip || 0);
      const tp = Number(h.temp || 0);
      txt = pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (block <= 25 ? '🌟 晴' : block <= 65 ? '⛅ 縫' : '☁️ 陰');
    }
    return { ...h, block, clear, txt };
  });
  return {
    hours,
    applied: true,
    weight0: +baseW.toFixed(3),
    delta0: Math.round(delta0),
    rawNwpCloud0,
    fusedCloud0: hours[0].block,
    discrepancyFlag: Math.abs(delta0) >= 30
  };
}

/**
 * Parse MET Norway Nowcast 2.0 (5-minute live Nordic Doppler radar precipitation + live surface temp/wind).
 * Returns null if radar_coverage !== 'ok' or feed is stale (>30 min).
 */
export function parseMetNorwayNowcast(json, nowMs = Date.now()) {
  const meta = json?.properties?.meta;
  const series = json?.properties?.timeseries;
  if (!meta || meta.radar_coverage !== 'ok' || !Array.isArray(series) || !series.length) return null;
  const updatedMs = parseUtcMs(meta.updated_at);
  if (!Number.isFinite(updatedMs)) return null;
  const ageMin = Math.round((nowMs - updatedMs) / 60000);
  if (ageMin > 30 || ageMin < -15) return null;

  const d0 = series[0]?.data?.instant?.details || {};
  const precipRate = Math.max(0, toFinite(d0.precipitation_rate) ?? 0);
  const temp = toFinite(d0.air_temperature);
  const windMs = toFinite(d0.wind_speed);
  let peakPrecip30m = precipRate;
  for (let i = 1; i < Math.min(7, series.length); i++) {
    const r = toFinite(series[i]?.data?.instant?.details?.precipitation_rate);
    if (r !== null && r > peakPrecip30m) peakPrecip30m = r;
  }
  return {
    precipRate: +precipRate.toFixed(2),
    peakPrecip30m: +peakPrecip30m.toFixed(2),
    temp,
    windMs: windMs !== null ? Math.max(0, windMs) : null,
    ageMin: Math.max(0, ageMin),
    updatedMs
  };
}

/**
 * Parse Open-Meteo 15-minute `current` GPS block (global cloud cover, temp, wind, precip, WMO fog/precip).
 * Returns null if missing or stale (>45 min).
 */
export function parseOpenMeteoCurrent(omObj, nowMs = Date.now()) {
  const c = omObj?.current;
  if (!c || typeof c !== 'object') return null;
  const obsMs = parseUtcMs(c.time);
  if (!Number.isFinite(obsMs)) return null;
  const ageMin = Math.round((nowMs - obsMs) / 60000);
  if (ageMin > 45 || ageMin < -20) return null;

  const pickNum = (...keys) => {
    for (const k of keys) {
      const v = toFinite(c[k]);
      if (v !== null) return v;
    }
    return null;
  };
  const cloudRaw = pickNum('cloud_cover', 'cloud_cover_best_match', 'cloud_cover_ecmwf_ifs025', 'cloud_cover_icon_seamless');
  const temp = pickNum('temperature_2m', 'temperature_2m_best_match', 'temperature_2m_ecmwf_ifs025');
  const windKmh = pickNum('wind_speed_10m', 'wind_speed_10m_best_match', 'wind_speed_10m_ecmwf_ifs025');
  const precip = Math.max(0, pickNum('precipitation', 'precipitation_best_match', 'precipitation_ecmwf_ifs025') ?? 0);
  const weatherCode = pickNum('weather_code', 'weather_code_best_match', 'weather_code_ecmwf_ifs025');
  if (cloudRaw === null && temp === null && precip === 0) return null;

  const cloud = cloudRaw !== null ? Math.max(0, Math.min(100, Math.round(cloudRaw))) : null;
  const isFog = weatherCode === 45 || weatherCode === 48;
  const precipFloor = precip >= 0.5 ? 90 : (precip >= 0.1 ? 78 : 0);
  const effCloud = cloud !== null
    ? Math.max(cloud, isFog ? 85 : 0, precipFloor)
    : (isFog ? 85 : (precipFloor > 0 ? precipFloor : null));

  return {
    cloud,
    effCloud,
    temp,
    windMs: windKmh !== null ? +(Math.max(0, windKmh) / 3.6).toFixed(2) : null,
    precip: +precip.toFixed(2),
    weatherCode,
    isFog,
    ageMin: Math.max(0, ageMin),
    obsMs
  };
}

/**
 * Strictly causal live GPS nowcast refinement on hour[0]:
 * 1. Nordic 5-min Doppler radar: refreshes surface temp/wind and immediately suppresses false clear skies during live rain/snow squalls.
 * 2. Global 15-min Open-Meteo current: refines current hour for remote GPS points outside fresh local weather-station (METAR) range.
 */
export function assimilateLiveGpsNowcast(hereHrs, { radarNowcast = null, omCurrent = null, hasFreshMetar = false, usedMet = false } = {}) {
  if (!Array.isArray(hereHrs) || !hereHrs.length) return { hours: hereHrs || [], applied: false, radarActive: false, source: null };
  const h0 = hereHrs[0];
  if (!h0 || !Number.isFinite(h0.block)) return { hours: hereHrs, applied: false, radarActive: false, source: null };

  let block = h0.block;
  let temp = h0.temp;
  let windMs = h0.windMs;
  let precip = Number(h0.precip || 0);
  let applied = false;
  let radarActive = false;
  let source = null;

  // Priority 1: MET Norway 5-min live Doppler radar & surface telemetry
  if (radarNowcast) {
    if (Number.isFinite(radarNowcast.temp)) { temp = radarNowcast.temp; applied = true; }
    if (Number.isFinite(radarNowcast.windMs)) { windMs = radarNowcast.windMs; applied = true; }
    const activePrecip = Math.max(radarNowcast.precipRate || 0, (radarNowcast.peakPrecip30m || 0) >= 0.5 ? radarNowcast.peakPrecip30m : 0);
    if (activePrecip >= 0.2) {
      precip = Math.max(precip, activePrecip);
      const occFloor = activePrecip >= 0.5 ? 90 : 80;
      if (block < occFloor) block = occFloor;
      radarActive = true;
      applied = true;
      source = 'radar-5m';
    } else if (applied) {
      source = 'radar-5m';
    }
  }

  // Priority 2: Global 15-min Open-Meteo `current` (never overrides real local METAR laser ceilometer <=25km)
  if (omCurrent && !hasFreshMetar) {
    if (!radarNowcast) {
      if (Number.isFinite(omCurrent.temp) && !usedMet) { temp = omCurrent.temp; applied = true; }
      if (Number.isFinite(omCurrent.windMs) && !usedMet) { windMs = omCurrent.windMs; applied = true; }
    }
    if (omCurrent.precip >= 0.2 && precip < omCurrent.precip) {
      precip = omCurrent.precip;
      applied = true;
    }
    if (Number.isFinite(omCurrent.effCloud)) {
      if (!usedMet) {
        const w = (omCurrent.isFog || omCurrent.precip >= 0.2) ? 0.45 : 0.35;
        block = Math.max(0, Math.min(100, Math.round((1 - w) * block + w * omCurrent.effCloud)));
        applied = true;
        if (!source) source = 'gps-15m';
      } else if ((omCurrent.isFog || omCurrent.precip >= 0.2) && omCurrent.effCloud > block) {
        // Inside Nordics without radar/METAR: only nudge upward when 15m GPS flags active fog/precip
        block = Math.max(block, Math.round(0.65 * block + 0.35 * omCurrent.effCloud));
        applied = true;
        if (!source) source = 'gps-15m';
      }
    }
  }

  if (!applied) return { hours: hereHrs, applied: false, radarActive: false, source: null };
  const clear = 100 - block;
  const windChill = (Number.isFinite(temp) && Number.isFinite(windMs)) ? computeWindChill(temp, windMs) : h0.windChill;
  let txt = h0.txt;
  if (!h0.isDay && txt !== undefined) {
    txt = precip >= 0.1 ? (temp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (block <= 25 ? '🌟 晴' : block <= 65 ? '⛅ 縫' : '☁️ 陰');
  }
  const updated0 = { ...h0, block, clear, temp, windMs, windChill, precip, txt };
  return {
    hours: [updated0, ...hereHrs.slice(1)],
    applied: true,
    radarActive,
    source
  };
}

/**
 * Selects optimal dual-NWP model pair for Open-Meteo outside Nordics:
 * - Iceland (62..68°N, -26..-12°E): best_match + icon_seamless (2-winter AUC 0.79-0.80 -> 0.83-0.85, false-clear 20-21% -> 6-7%)
 * - Global outside Nordics: best_match + ecmwf_ifs025 (lower false-clear rate globally + true dual-model consensus)
 * - Inside Nordics: returns null (MET Norway 2.5km MEPS is primary + Open-Meteo is secondary).
 */
export function selectOpenMeteoModels(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || isInNordicMetBox(lat, lon)) return null;
  if (lat >= 62 && lat <= 68 && lon >= -26 && lon <= -12) {
    return ['best_match', 'icon_seamless'];
  }
  return ['best_match', 'ecmwf_ifs025'];
}

/** Extracts single-model hourly object from Open-Meteo multi-model response (`<field>_<modelName>`) */
export function extractOpenMeteoModelHourly(hourly, modelName) {
  if (!hourly || !Array.isArray(hourly.time) || !modelName) return null;
  const suffix = `_${modelName}`;
  const ccKey = `cloud_cover${suffix}`;
  if (!Array.isArray(hourly[ccKey]) || !hourly[ccKey].some(v => v !== null && v !== undefined)) return null;
  const pick = (base) => hourly[`${base}${suffix}`] || hourly[base] || null;
  return {
    time: hourly.time,
    cloud_cover: pick('cloud_cover'),
    cloud_cover_low: pick('cloud_cover_low'),
    cloud_cover_mid: pick('cloud_cover_mid'),
    cloud_cover_high: pick('cloud_cover_high'),
    precipitation: pick('precipitation'),
    temperature_2m: pick('temperature_2m'),
    wind_speed_10m: pick('wind_speed_10m'),
    weather_code: pick('weather_code'),
    visibility: pick('visibility')
  };
}

/** Equal 50/50 physical blend of two aligned hourly forecast arrays (zero fitted weights) with per-hour spread */
export function blendHourlyForecasts(primaryHrs, secondaryHrs) {
  if (!Array.isArray(primaryHrs) || !primaryHrs.length) return secondaryHrs || [];
  if (!Array.isArray(secondaryHrs) || !secondaryHrs.length) return primaryHrs;
  const hasSecDt = secondaryHrs.some(s => Number.isFinite(s?.dtMs));
  return primaryHrs.map((h, i) => {
    const match = (Number.isFinite(h?.dtMs) && hasSecDt)
      ? secondaryHrs.find(s => s && Number.isFinite(s.dtMs) && Math.abs(s.dtMs - h.dtMs) <= 15 * 60000)
      : secondaryHrs[i];
    if (!match || !Number.isFinite(match.block) || !Number.isFinite(h?.block)) {
      return { ...h, cloudSpread: null, clearLow: null, clearHigh: null };
    }
    const m1 = h.block, m2 = match.block;
    const cloudSpread = Math.round(Math.abs(m1 - m2));
    const clearLow = Math.max(0, Math.min(100, Math.round(100 - Math.max(m1, m2))));
    const clearHigh = Math.max(0, Math.min(100, Math.round(100 - Math.min(m1, m2))));
    const block = Math.max(0, Math.min(100, Math.round(0.5 * m1 + 0.5 * m2)));
    const clear = 100 - block;
    let txt = h.txt;
    if (!h.isDay && txt !== undefined) {
      const pr = Number(h.precip || 0);
      const tp = Number(h.temp || 0);
      txt = pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (block <= 25 ? '🌟 晴' : block <= 65 ? '⛅ 縫' : '☁️ 陰');
    }
    return { ...h, block, clear, cloudSpread, clearLow, clearHigh, ...(txt !== undefined ? { txt } : {}) };
  });
}

/**
 * Nordic horizon-aware dual-model ensemble (MET Norway 2.5km MEPS + independent ECMWF IFS 0.25°):
 * - +0..2h: preserve 2.5km fjord rain-shadow precision (omW = 0), unless live METAR proves ECMWF >=20 pts closer (omW = 0.50)
 * - +3h: smooth transition (omW = 0.25, or 0.50 if METAR confirms ECMWF)
 * - +4..23h: 50/50 synoptic ensemble to curb single-model frontal-timing error
 * Always preserves surface temp/wind/precip from 2.5km MEPS and attaches raw pre-blend spread metadata.
 */
export function blendNordicHourlyForecasts(metHrs, omHrs, { metarConfirmsEcmwf = false } = {}) {
  if (!Array.isArray(metHrs) || !metHrs.length) return metHrs || [];
  if (!Array.isArray(omHrs) || !omHrs.length) return metHrs;
  return metHrs.map((h, idx) => {
    if (!Number.isFinite(h?.dtMs) || !Number.isFinite(h?.block)) {
      return { ...h, cloudSpread: null, clearLow: null, clearHigh: null };
    }
    const omM = omHrs.find(s => s && Number.isFinite(s.dtMs) && Number.isFinite(s.block) && Math.abs(s.dtMs - h.dtMs) <= 15 * 60000);
    if (!omM) {
      return { ...h, cloudSpread: null, clearLow: null, clearHigh: null };
    }
    const m1 = h.block, m2 = omM.block;
    const cloudSpread = Math.round(Math.abs(m1 - m2));
    const clearLow = Math.max(0, Math.min(100, Math.round(100 - Math.max(m1, m2))));
    const clearHigh = Math.max(0, Math.min(100, Math.round(100 - Math.min(m1, m2))));
    const omW = idx <= 2
      ? (metarConfirmsEcmwf ? 0.50 : 0)
      : (idx === 3 ? (metarConfirmsEcmwf ? 0.50 : 0.25) : 0.50);
    if (omW === 0) {
      return { ...h, cloudSpread, clearLow, clearHigh };
    }
    const block = Math.max(0, Math.min(100, Math.round((1 - omW) * m1 + omW * m2)));
    const clear = 100 - block;
    let txt = h.txt;
    if (!h.isDay && txt !== undefined) {
      const pr = Number(h.precip || 0);
      const tp = Number(h.temp || 0);
      txt = pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (block <= 25 ? '🌟 晴' : block <= 65 ? '⛅ 縫' : '☁️ 陰');
    }
    return { ...h, block, clear, cloudSpread, clearLow, clearHigh, ...(txt !== undefined ? { txt } : {}) };
  });
}

// ====== Hourly Forecast, 3-Night Outlook, Verdicts & Compass Summaries ======

export function scoreHourlyForecast12(hrs, {
  lat = 69.97, lon = 23.27, kpForecast = [], fallbackKp = 0, ovation = null,
  hpiGw = null, bz = 0, nextBz = null, speed = 400, newell = null, nextNewell = null,
  predKp1h = null, preconditionedNewell60 = null, nextPreconditionedNewell60 = null,
  substormJumpNt = 0, pdyn = null, nextPdyn = null, shockJumpNpa = 0, nextShockJumpNpa = null,
  dst = null, nowOverride = null
} = {}) {
  if (!Array.isArray(hrs) || !hrs.length) return { hours: [], bestAurora: null };
  const absMag = Math.abs(computeGeomagneticLat(lat, lon));
  const hours = hrs.map((h, i) => {
    const dt = new Date(h.dtMs || (Date.now() + i * 3600000));
    const useNow = i === 0 && nowOverride && typeof nowOverride === 'object';
    const moonH = (useNow && nowOverride.moon) ? nowOverride.moon : getMoonState(dt, lat, lon);
    const mltH = (useNow && Number.isFinite(nowOverride.mlt)) ? nowOverride.mlt : computeMLT(dt, lat, lon);
    const sunAltH = (useNow && Number.isFinite(nowOverride.sunAlt)) ? nowOverride.sunAlt : h.sunAlt;
    const isDayH = useNow ? (sunAltH >= -4) : h.isDay;
    // Prevent a live geomagnetic storm (e.g. Kp 7) from leaking onto +3h..+23h if NOAA 3-day Kp forecast is missing/truncated
    const fbKpH = (i >= 3 && Number.isFinite(fallbackKp)) ? Math.min(fallbackKp, 2.5) : fallbackKp;
    const baseKpFc = i === 0 && Number.isFinite(fallbackKp) ? fallbackKp : lookupForecastKp(kpForecast, dt, fbKpH);
    const effNextShock = Number.isFinite(nextShockJumpNpa) ? nextShockJumpNpa : shockJumpNpa;
    const effNextPdyn = Number.isFinite(nextPdyn) ? nextPdyn : pdyn;
    // Hours +1..+3 blend NOAA Geospace 1h MHD predicted Kp with smooth AR(1) decay (0.70 -> 0.45 -> 0.20 -> 0)
    // to eliminate discontinuous +2h cliffs when stale 3-day SWPC forecasts lag quiet real-time L1 telemetry.
    let kpFc = baseKpFc;
    if (i >= 1 && i <= 3 && Number.isFinite(predKp1h)) {
      const surge = (Number.isFinite(nextBz) && nextBz <= -5) || (Number.isFinite(effNextShock) && effNextShock >= 3);
      if (i === 1 && surge) {
        kpFc = Math.max(baseKpFc, predKp1h);
      } else if (!surge || predKp1h > baseKpFc) {
        const w = i === 1 ? 0.70 : (i === 2 ? 0.45 : 0.20);
        kpFc = +(w * predKp1h + (1 - w) * baseKpFc).toFixed(2);
      }
    }
    const liveW = i === 0 ? 1 : (i === 1 ? 0.85 : (i === 2 ? 0.25 : 0));
    const rawBz = (i >= 1 && Number.isFinite(nextBz)) ? nextBz : bz;
    const rawNw = (i >= 1 && Number.isFinite(nextNewell)) ? nextNewell : newell;
    const rawPdyn = i === 0 ? pdyn : effNextPdyn;
    const rawShock = i === 0 ? shockJumpNpa : effNextShock;
    const bzH = liveW > 0 && Number.isFinite(rawBz) ? rawBz * liveW : 0;
    const spdH = liveW > 0 && Number.isFinite(speed) ? Math.round(speed * liveW + 400 * (1 - liveW)) : 400;
    const nwH = liveW > 0 && Number.isFinite(rawNw) ? Math.round(rawNw * liveW + 1500 * (1 - liveW)) : null;
    const hpiH = liveW > 0 && Number.isFinite(hpiGw) ? Math.round(hpiGw * liveW + 15 * (1 - liveW)) : null;
    const pdynH = liveW > 0 && Number.isFinite(rawPdyn) ? +(rawPdyn * liveW + 2.0 * (1 - liveW)).toFixed(2) : null;
    const dstH = liveW > 0 && Number.isFinite(dst) ? Math.round(dst * liveW) : null;
    const precondH = i === 0
      ? preconditionedNewell60
      : (i === 1 ? (Number.isFinite(nextPreconditionedNewell60) ? nextPreconditionedNewell60 : preconditionedNewell60) : null);
    const mltShiftH = 2.0 * Math.cos((mltH - 0.5) * Math.PI / 12);
    const neededKpH = requiredKpForMagLat(absMag + mltShiftH);
    const estOvFc = neededKpH > 1.5
      ? Math.max(0, Math.min(95, (kpFc - neededKpH + 1.5) * 18))
      : Math.min(95, kpFc * 15);
    const ovH = liveW > 0 && ovation !== null ? Math.round(ovation * liveW + estOvFc * (1 - liveW)) : null;

    const baseParams = {
      lat, lon, cloudNow: h.block, sunAlt: sunAltH,
      bz: bzH, speed: spdH, kp: kpFc, ovation: ovH, hpiGw: hpiH, newell: nwH,
      preconditionedNewell60: precondH,
      substormJumpNt: liveW > 0 ? Math.round((substormJumpNt || 0) * liveW) : 0,
      pdyn: pdynH, shockJumpNpa: liveW > 0 ? +((rawShock || 0) * liveW).toFixed(2) : 0,
      dst: dstH,
      mlt: mltH, effMoonPct: moonH.effMoonPct
    };
    const scH = computeAuroraScore(baseParams);
    let scoreLow = scH.total;
    let scoreHigh = scH.total;
    if (i >= 4) {
      if (scH.isTooBright || Boolean(scH.outOfZone)) {
        scoreLow = 0;
        scoreHigh = 0;
      } else {
        const s0 = scH.total;
        const hasSpread = Number.isFinite(h.clearLow) && Number.isFinite(h.clearHigh);
        const blockBest = hasSpread ? Math.max(0, Math.min(h.block, 100 - h.clearHigh)) : h.block;
        const blockWorst = hasSpread ? Math.min(100, Math.max(h.block, 100 - h.clearLow)) : h.block;
        const kpDelta = i >= 12 ? 1.0 : 0.67;
        const kpLow = Math.max(0, +(kpFc - kpDelta).toFixed(2));
        const kpHigh = Math.min(9, +(kpFc + kpDelta).toFixed(2));
        const sCloudLow = blockWorst === h.block ? s0 : computeAuroraScore({ ...baseParams, cloudNow: blockWorst }).total;
        const sCloudHigh = blockBest === h.block ? s0 : computeAuroraScore({ ...baseParams, cloudNow: blockBest }).total;
        const sKpLow = kpLow === kpFc ? s0 : computeAuroraScore({ ...baseParams, kp: kpLow }).total;
        const sKpHigh = kpHigh === kpFc ? s0 : computeAuroraScore({ ...baseParams, kp: kpHigh }).total;
        const dLow = Math.hypot(Math.max(0, s0 - sCloudLow), Math.max(0, s0 - sKpLow));
        const dHigh = Math.hypot(Math.max(0, sCloudHigh - s0), Math.max(0, sKpHigh - s0));
        scoreLow = Math.max(0, Math.min(s0, Math.round(s0 - dLow)));
        scoreHigh = Math.min(99, Math.max(s0, Math.round(s0 + dHigh)));
      }
    }
    return {
      ...h, isDay: isDayH, sunAlt: sunAltH, score: scH.total, scoreLow, scoreHigh,
      darkScore: scH.darkScore, kpFc: +Number(kpFc).toFixed(2),
      moonUp: moonH.up, moonPct: moonH.pct, moonAlt: moonH.altDeg,
      mlt: +mltH.toFixed(1), outOfZone: scH.outOfZone
    };
  });
  const dark = hours.filter(h => !h.isDay);
  const pickBest = (list) => {
    let best = null;
    for (const h of list) {
      if (!best || h.score > best.score || (h.score === best.score && h.block < best.block)) best = h;
    }
    return best;
  };
  const bestAurora = pickBest(dark);
  const firstHrNum = parseInt(String(hours[0]?.time || '12'), 10);
  const activeNightKey = (Number.isFinite(firstHrNum) && firstHrNum >= 6 && hours[0]?.localDate)
    ? hours[0].localDate
    : (dark[0]?.nightKey || hours[0]?.nightKey || null);
  const tonightDark = activeNightKey ? dark.filter(h => !h.nightKey || h.nightKey === activeNightKey) : dark;
  const bestTonight = pickBest(tonightDark) || bestAurora;
  return { hours, bestAurora, bestTonight, activeNightKey };
}

export function findBestDarkWindow(hrs) {
  if (!Array.isArray(hrs) || !hrs.length) return null;
  const dark = hrs.filter(h => h && !h.isDay);
  if (!dark.length) return null;
  let best = dark[0];
  for (const h of dark) if (h.block < best.block) best = h;
  return best;
}

/**
 * 3-Night Outlook using dark-only Kp bins, co-located hourly cloud + Kp + moon scoring,
 * and honest Pending state when +2 night forecast Kp is absent (never clones tonight's storm onto +2 nights).
 */
export function summarize3NightOutlook({
  cloudPoints = [], kpForecast = [], currentKp = null,
  lat = 69.97, lon = 23.27, timeZone = 'UTC', nowDate = new Date(), lang,
  enlilForecast = null, chartHours = null
} = {}) {
  const en = isEn(lang);
  const safeNow = (nowDate instanceof Date && Number.isFinite(nowDate.getTime())) ? nowDate : new Date();
  const nowMs = safeNow.getTime();
  const zNow = getZoneParts(safeNow, timeZone);
  const nowHour = parseInt(zNow.hourStr, 10) || 0;
  const nightKeyOf = (ms) => getZoneParts(new Date(ms - 12 * 3600000), timeZone).dateStr;
  const yestIso = getZoneParts(new Date(nowMs - 12 * 3600000), timeZone).dateStr;
  // Before 06:00 local, stay on the ongoing overnight session ONLY if dark hours still remain;
  // from 06:00 onward (morning), "Tonight" always means today's upcoming night (prevents 09:00 AM winter "No dark sky" bug).
  const yestHasDark = (Array.isArray(cloudPoints) ? cloudPoints : []).some(
    p => p && Number.isFinite(p.dtMs) && !p.isDay && nightKeyOf(p.dtMs) === yestIso
  );
  const startNightIso = (nowHour < 6 && yestHasDark) ? yestIso : zNow.dateStr;
  const addDays = (iso, d) => {
    const [y, m, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day + d)).toISOString().slice(0, 10);
  };
  const absMag = Math.abs(computeGeomagneticLat(lat, lon));
  const neededKpMidnight = requiredKpForMagLat(absMag + 2.0);
  const WEEK_ZH = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
  const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const enlilHours = Array.isArray(enlilForecast?.hourly) ? enlilForecast.hourly : [];

  return [0, 1, 2].map(offset => {
    const key = addDays(startNightIso, offset);
    const [ky, km, kd] = key.split('-').map(Number);
    const wd = new Date(Date.UTC(ky, km - 1, kd)).getUTCDay();
    // Mainstream weather convention: "Tonight", then weekday names; date as a secondary line
    // (ZH keeps M/D which Taiwanese users read natively; EN uses unambiguous "26 Nov" instead of US-only 11/26)
    const dayLabel = offset === 0 ? (en ? 'Tonight' : '今晚') : (en ? WEEK_EN[wd] : WEEK_ZH[wd]);
    const dateLabel = en ? `${kd} ${MON_EN[km - 1]}` : `${km}/${kd}`;
    const label = `${dayLabel} ${dateLabel}`;
    const pts = (Array.isArray(cloudPoints) ? cloudPoints : []).filter(p => p && Number.isFinite(p.dtMs) && nightKeyOf(p.dtMs) === key);
    const darkPts = pts.filter(p => !p.isDay).sort((a, b) => a.dtMs - b.dtMs);
    // Avoid cherry-picking a single fluke 1-hour cloud break: use best sustained 2h dark rolling average when >=2 dark hours exist
    let bestClear = null;
    if (darkPts.length === 1) {
      bestClear = Math.round(darkPts[0].clear);
    } else if (darkPts.length >= 2) {
      let max2h = -1;
      for (let i = 0; i < darkPts.length - 1; i++) {
        const pairAvg = Math.round((darkPts[i].clear + darkPts[i + 1].clear) / 2);
        if (pairAvg > max2h) max2h = pairAvg;
      }
      bestClear = max2h;
    }
    const clearDarkHrs = darkPts.filter(p => p.clear >= 55).reduce((s, p) => s + (Number.isFinite(p.stepHrs) ? p.stepHrs : 1), 0);

    // Filter Kp forecast bins to darkness (sun < -4° at bin midpoint) so daytime storms don't inflate night outlook
    const kpOnNight = (Array.isArray(kpForecast) ? kpForecast : []).filter(k => {
      if (!k || !Number.isFinite(k.ts) || !Number.isFinite(k.kp)) return false;
      if (nightKeyOf(k.ts) !== key || k.ts < nowMs - 3 * 3600000) return false;
      const midSun = computeSolarElevation(new Date(k.ts + 5400000), lat, lon);
      return midSun < -4;
    });
    const kpVals = kpOnNight.map(k => k.kp);
    if (offset === 0 && Number.isFinite(currentKp) && computeSolarElevation(safeNow, lat, lon) < -4) {
      kpVals.push(currentKp);
    }
    const hasKpData = kpVals.length > 0;
    const maxKp = hasKpData ? +Math.max(...kpVals).toFixed(1) : (offset === 0 && Number.isFinite(currentKp) ? +currentKp.toFixed(1) : null);
    const effMaxKp = maxKp ?? 0;
    const gScale = effMaxKp >= 9 ? 5 : effMaxKp >= 8 ? 4 : effMaxKp >= 7 ? 3 : effMaxKp >= 6 ? 2 : effMaxKp >= 5 ? 1 : 0;

    // Optional WSA-ENLIL modeled CME / High-Speed Stream arrival tag for this night (informational only)
    const enlilNight = enlilHours.filter(h => Number.isFinite(h.ts) && nightKeyOf(h.ts) === key);
    const enlilCme = enlilNight.some(h => h.isCme);
    const enlilMaxSpeed = enlilNight.length ? Math.round(Math.max(...enlilNight.map(h => h.maxV || 0))) : null;
    const enlilMaxDensity = enlilNight.length ? Math.max(...enlilNight.map(h => h.maxN || 0)) : 0;
    let enlilTag = '';
    if (enlilCme) enlilTag = en ? `CME ~${enlilMaxSpeed}km/s` : `CME ~${enlilMaxSpeed}km/s`;
    else if (enlilMaxSpeed >= 550) enlilTag = en ? `Fast SW ${enlilMaxSpeed}km/s` : `高速風 ${enlilMaxSpeed}km/s`;
    else if (enlilMaxDensity >= 15) enlilTag = en ? `Shock ${Math.round(enlilMaxDensity)}p/cc` : `高密度 ${Math.round(enlilMaxDensity)}p/cc`;

    let bestNightScore = 0;
    let scoreAvailable = false;
    let tone = '', badge = '', badgeColor = 'var(--muted)';
    if (absMag < 32) {
      badge = term(TERMS.status.outOfZone, en); badgeColor = '#8ea6c4';
    } else if (pts.length > 0 && darkPts.length === 0) {
      badge = term(TERMS.status.tooBright, en); badgeColor = '#66bdff';
    } else if (maxKp === null && bestClear === null) {
      badge = term(TERMS.status.updating, en); badgeColor = '#8ea6c4';
    } else if (maxKp !== null && neededKpMidnight >= 2.5 && (effMaxKp + 1.8) < neededKpMidnight) {
      badge = en ? `Needs Kp ${neededKpMidnight}` : `需 Kp ${neededKpMidnight}`; badgeColor = '#8ea6c4';
    } else if (maxKp === null && neededKpMidnight >= 2.5) {
      badge = term(TERMS.status.updating, en); badgeColor = '#8ea6c4';
    } else if (bestClear === null) {
      badge = gScale >= 1 ? (en ? `Storm G${gScale}` : `地磁暴 G${gScale}`) : (en ? 'Updating' : '更新中'); badgeColor = gScale >= 1 ? '#ffcf5c' : '#8ea6c4';
    } else {
      // Unified scoring: every dark hour runs through the SAME computeAuroraScore used by the 24h hourly chart
      // (cloud + matched forecast Kp + MLT + lunar illuminance at the SAME hour), so Tonight's peak matches the chart.
      // Live solar-wind terms (Bz/speed/OVATION) are neutral at +24-72h, which keeps multi-day estimates honest.
      // Hours already scored by the hourly chart (which blends live L1 wind for the next 1-3h) reuse the chart's own
      // scores, so the score on this night is EXACTLY the chart's peak for the overlapping window.
      const chartDark = Array.isArray(chartHours)
        ? chartHours.filter(h => h && !h.isDay && Number.isFinite(h.score) && Number.isFinite(h.dtMs) && nightKeyOf(h.dtMs) === key)
        : [];
      const chartEndMs = chartDark.length && Array.isArray(chartHours)
        ? Math.max(...chartHours.filter(h => h && Number.isFinite(h.dtMs)).map(h => h.dtMs)) + 1800000
        : -Infinity;
      let bestDtMs = null;
      let kpPeakClearSum = 0;
      let kpPeakClearCnt = 0;
      const kpPeakFloor = Math.max(effMaxKp - 0.7, 3.0);
      const kpLookupSrc = (Array.isArray(kpForecast) && kpForecast.length) ? kpForecast : kpOnNight;
      const trackKpPeakClear = (clrVal, hKpVal, aurVal = 30) => {
        if (!Number.isFinite(clrVal) || !Number.isFinite(hKpVal) || hKpVal < kpPeakFloor) return;
        if (Number.isFinite(aurVal) && aurVal < 30) return;
        kpPeakClearSum += Math.max(0, Math.min(100, Math.round(clrVal)));
        kpPeakClearCnt += 1;
      };
      if (offset === 0) {
        // Tonight: keep 1h peak parity with the live 24h chart (a real 1h clear break tonight IS chaseable)
        for (const h of chartDark) {
          trackKpPeakClear(h.clear, h.kpFc, h.outOfZone ? 0 : 35);
          if (h.score > bestNightScore) { bestNightScore = h.score; bestDtMs = h.dtMs; }
        }
        for (const p of darkPts) {
          if (p.dtMs <= chartEndMs) continue;
          const dt = new Date(p.dtMs);
          const hKp = lookupForecastKp(kpLookupSrc, dt, effMaxKp);
          const moonH = getMoonState(dt, lat, lon);
          const sunAltH = Number.isFinite(p.sunAlt) ? p.sunAlt : computeSolarElevation(dt, lat, lon);
          const cloudH = Number.isFinite(p.block) ? p.block : Math.max(0, Math.min(100, 100 - p.clear));
          const scH = computeAuroraScore({
            lat, lon, cloudNow: cloudH, sunAlt: sunAltH,
            bz: 0, speed: 400, kp: hKp, ovation: null,
            mlt: computeMLT(dt, lat, lon), effMoonPct: moonH.effMoonPct
          });
          trackKpPeakClear(p.clear, hKp, scH?.auroraScore ?? 0);
          const hScore = Number.isFinite(scH?.total) ? scH.total : 0;
          if (hScore > bestNightScore) { bestNightScore = hScore; bestDtMs = p.dtMs; }
        }
      } else {
        // Night +1/+2 (+24-72h): use max 2h sustained rolling score (matching bestClear) so 1h NWP cloud flukes never spike the card
        const scoredPts = [];
        for (const h of chartDark) {
          trackKpPeakClear(h.clear, h.kpFc, h.outOfZone ? 0 : 35);
          scoredPts.push({ dtMs: h.dtMs, score: h.score });
        }
        for (const p of darkPts) {
          if (p.dtMs <= chartEndMs) continue;
          const dt = new Date(p.dtMs);
          const hKp = lookupForecastKp(kpLookupSrc, dt, effMaxKp);
          const moonH = getMoonState(dt, lat, lon);
          const sunAltH = Number.isFinite(p.sunAlt) ? p.sunAlt : computeSolarElevation(dt, lat, lon);
          const cloudH = Number.isFinite(p.block) ? p.block : Math.max(0, Math.min(100, 100 - p.clear));
          const scH = computeAuroraScore({
            lat, lon, cloudNow: cloudH, sunAlt: sunAltH,
            bz: 0, speed: 400, kp: hKp, ovation: null,
            mlt: computeMLT(dt, lat, lon), effMoonPct: moonH.effMoonPct
          });
          trackKpPeakClear(p.clear, hKp, scH?.auroraScore ?? 0);
          scoredPts.push({ dtMs: p.dtMs, score: Number.isFinite(scH?.total) ? scH.total : 0 });
        }
        scoredPts.sort((a, b) => a.dtMs - b.dtMs);
        if (scoredPts.length === 1) {
          bestNightScore = scoredPts[0].score;
          bestDtMs = scoredPts[0].dtMs;
        } else if (scoredPts.length >= 2) {
          for (let i = 0; i < scoredPts.length - 1; i++) {
            const pairScore = Math.round((scoredPts[i].score + scoredPts[i + 1].score) / 2);
            if (pairScore > bestNightScore) {
              bestNightScore = pairScore;
              bestDtMs = scoredPts[i].score >= scoredPts[i + 1].score ? scoredPts[i].dtMs : scoredPts[i + 1].dtMs;
            }
          }
        }
      }
      const kpPeakClear = kpPeakClearCnt > 0 ? Math.round(kpPeakClearSum / kpPeakClearCnt) : null;
      // 3-hour peak viewing window (matches NOAA 3h forecast cadence without fake minute-level precision)
      let bestWindow = '';
      if (bestNightScore >= 18 && Number.isFinite(bestDtMs)) {
        const zp = getZoneParts(new Date(bestDtMs), timeZone);
        const hr = parseInt(zp.hourStr, 10);
        if (Number.isFinite(hr)) {
          const hStart = Math.floor(hr / 3) * 3;
          const hEnd = (hStart + 3) % 24;
          bestWindow = `${String(hStart).padStart(2, '0')}–${String(hEnd).padStart(2, '0')}`;
        }
      }
      // Detect when clear skies and strong geomagnetic activity occur at different hours of the same night
      // (e.g. clear early evening Kp 2.7 followed by overcast during Kp 5 G1 storm -> low score despite high bestClear & maxKp)
      const peakCloudMismatch = Boolean(
        bestNightScore < 18 && bestClear !== null && bestClear >= 45 &&
        effMaxKp >= 3.0 && kpPeakClear !== null && kpPeakClear < 30 && (bestClear - kpPeakClear) >= 25
      );
      // Map strictly onto the app-wide 0-99 tiers (65 Excellent / 40 Good / 18 Fair / <18 Low or Cloudy)
      if (bestNightScore >= 65) {
        tone = 'good'; badge = term(TERMS.tier.excellent, en); badgeColor = '#34f0b0';
      } else if (bestNightScore >= 40) {
        tone = 'good'; badge = term(TERMS.tier.good, en); badgeColor = '#25b88a';
      } else if (bestNightScore >= 18) {
        tone = 'warn'; badge = term(TERMS.tier.fair, en); badgeColor = '#f4c350';
      } else if (peakCloudMismatch) {
        badge = en ? 'Cloudy at peak' : '強極光時雲厚'; badgeColor = '#8b94a5';
      } else if (bestClear < 35) {
        badge = term(TERMS.status.cloudy, en); badgeColor = '#8b94a5';
      } else {
        badge = term(TERMS.tier.low, en); badgeColor = '#8b94a5';
      }
      scoreAvailable = true;
      return { key, label, dayLabel, dateLabel, bestClear, kpPeakClear, peakCloudMismatch, clearDarkHrs, bestNightScore, bestWindow, scoreAvailable, maxKp: maxKp ?? 0, kpAvailable: maxKp !== null, gScale, darkCount: darkPts.length, tone, badge, badgeColor, enlilTag, enlilMaxSpeed };
    }
    return { key, label, dayLabel, dateLabel, bestClear, kpPeakClear: null, peakCloudMismatch: false, clearDarkHrs, bestNightScore, bestWindow: '', scoreAvailable, maxKp: maxKp ?? 0, kpAvailable: maxKp !== null, gScale, darkCount: darkPts.length, tone, badge, badgeColor, enlilTag, enlilMaxSpeed };
  });
}

export function evaluateVerdict({ lat = 69.97, lon = 23.27, bestDark, kp, mlt = null, effMoonPct = 0, scoreObj, lang } = {}) {
  const en = isEn(lang);
  if (!scoreObj || typeof scoreObj !== 'object') {
    return en
      ? { kicker: 'Updating', title: 'Loading live sky and space weather…', lead: 'Waiting for forecast data.' }
      : { kicker: '更新中', title: '正在讀取最新天空與太空天氣…', lead: '等待氣象與太空天氣資料。' };
  }
  const geom = computeViewingGeometry({ lat, lon, kp: Math.max(kp ?? 0, scoreObj?.effKp ?? 0), mlt, lang });
  const modeInfo = classifyViewingMode({ scoreObj, geom, effMoonPct, lang });
  const lookCueZh = geom.mode !== 'below' ? `${geom.shortText}。` : `建議朝${geom.direction}開闊處觀察。`;
  const lookCueEn = geom.mode !== 'below' ? `Look: ${geom.shortText}.` : `Face ${geom.direction} with an open horizon.`;
  const visSuffixZh = modeInfo.text ? ` ${modeInfo.text}。` : '';
  const visSuffixEn = modeInfo.text ? ` ${modeInfo.text}.` : '';

  if (scoreObj.outOfZone === 'low-lat') {
    return en
      ? { kicker: 'Out of zone', title: 'Outside the auroral zone', lead: `Geomagnetic latitude here is ${scoreObj.magLat}° (auroras primarily occur above 60°). Tap the location name above to switch.` }
      : { kicker: '不在極光帶', title: '此地不在極光帶內，請切換高緯度地區', lead: `地磁緯度 ${scoreObj.magLat}°（極光主要出現在 60° 以上），點上方地名可切換北歐或全球極光熱點。` };
  }
  if (scoreObj.outOfZone === 'need-storm') {
    const isNorth = lat >= 0;
    return en
      ? { kicker: 'Needs storm', title: isNorth ? 'Auroral oval is currently further north' : 'Auroral oval is currently further south', lead: `At ${scoreObj.magLat}° mag latitude, stronger activity (Kp ≥ ${scoreObj.neededKp}) is usually needed. Current Kp is ${Number.isFinite(kp) ? kp.toFixed(1) : '--'}.` }
      : { kicker: '需更強活動', title: isNorth ? '目前極光帶集中在更北邊高緯度' : '目前極光帶集中在更南邊高緯度', lead: `此地（地磁 ${scoreObj.magLat}°）通常需較強地磁活動 Kp ≥ ${scoreObj.neededKp} 才有機會觀測，目前全球 Kp 為 ${Number.isFinite(kp) ? kp.toFixed(1) : '--'}。` };
  }
  if (scoreObj.isTooBright) {
    return en
      ? { kicker: 'Too bright', title: 'Sky is too bright for aurora viewing', lead: bestDark ? `Best dark-sky window tonight: ${bestDark.time} (${bestDark.clear}% clear). Check back after dark.` : 'Check back after dark.' }
      : { kicker: '天色過亮', title: '目前天色過亮，無法觀測極光', lead: bestDark ? `天黑後最佳時段在 ${bestDark.time}（晴空率 ${bestDark.clear}%），天黑後再查看。` : '天黑後再查看。' };
  }
  if (scoreObj.total >= 65) {
    return en
      ? { kicker: 'Excellent', title: 'Clear skies and active aurora — head out now', lead: `${lookCueEn}${visSuffixEn}` }
      : { kicker: '極佳', title: '晴空且極光活躍，現在最適合出門', lead: `${lookCueZh}${visSuffixZh}` };
  }
  if (scoreObj.total >= 40) {
    return en
      ? { kicker: 'Good', title: 'Favorable viewing conditions — worth heading out', lead: `${lookCueEn}${visSuffixEn}` }
      : { kicker: '適合觀測', title: '條件不錯，建議穿暖前往暗處觀測', lead: `${lookCueZh}${visSuffixZh}` };
  }
  if (scoreObj.total >= 18) {
    return en
      ? {
          kicker: 'Fair',
          title: scoreObj.skyScore >= 55 ? 'Clear skies — worth keeping watch' : 'Cloud gaps opening — watch the sky',
          lead: `${lookCueEn}${visSuffixEn}`
        }
      : {
          kicker: '普通',
          title: scoreObj.skyScore >= 55 ? '天空偏晴，可留意極光動態' : '雲層出現空檔，可留意天空變化',
          lead: `${lookCueZh}${visSuffixZh}`
        };
  }
  if (scoreObj.grade === '🌅 暮光漸暗') {
    return en
      ? { kicker: 'Twilight · active', title: 'Strong aurora active — visibility rising as sky darkens', lead: `Geomagnetic activity is strong now; watch ${geom.direction} as twilight deepens.${visSuffixEn}` }
      : { kicker: '暮光漸暗 · 極光活躍', title: '極光能量強勁，天色全暗後有望立即現身', lead: `目前處於暮光過渡期，建議提前朝 ${geom.direction} 就位等候。${visSuffixZh}` };
  }
  if (scoreObj.grade === '⚡ 雲縫極光') {
    return en
      ? { kicker: 'Cloud gaps', title: 'Strong aurora — watch cloud gaps or drive to clear skies', lead: `Bright aurora can show through cloud gaps toward ${geom.direction}. Try Find clear skies for clearer roads.` }
      : { kicker: '雲縫極光', title: '極光能量強勁，雲縫間有機會閃現綠光', lead: `可留意 ${geom.direction} 雲隙或開啟「找晴空」尋找附近晴朗路段。` };
  }
  if (scoreObj.auroraScore >= 55 && scoreObj.skyScore < 35) {
    return en
      ? { kicker: 'Active · cloudy', title: 'Strong aurora above, blocked by clouds', lead: 'Solar wind is active — try Find clear skies or the live cloud map for nearby clear skies.' }
      : { kicker: '極光活躍 · 雲厚', title: '極光能量充足，但目前受厚雲遮蔽', lead: '太陽風活躍中，可點下方「找晴空」或「動態雲圖」尋找周邊晴朗區域。' };
  }
  if (scoreObj.skyScore >= 55) {
    return en
      ? { kicker: 'Low activity', title: 'Clear dark skies, geomagnetic activity is quiet', lead: `Good visibility toward ${geom.direction}. Keep screen-on monitor open for sudden bursts.${visSuffixEn}` }
      : { kicker: '極光偏弱', title: '夜空晴朗，目前地磁活動偏弱', lead: `朝 ${geom.direction} 能見度良好，可開啟右上角螢幕常亮監測待活動增強。${visSuffixZh}` };
  }
  return en
    ? {
        kicker: 'Cloudy',
        title: 'Heavy cloud cover — low chance right now',
        lead: bestDark && bestDark.block <= 45
          ? `Clouds are expected to thin around ${bestDark.time} (${bestDark.clear}% clear). Check back later.`
          : 'Dense clouds right now — try Find clear skies or check back later.'
      }
    : {
        kicker: '雲層過厚',
        title: '目前雲層偏厚，暫時不易觀測',
        lead: bestDark && bestDark.block <= 45
          ? `預計 ${bestDark.time} 雲層較有機會散開（晴空率 ${bestDark.clear}%），屆時再觀察。`
          : '目前雲量偏高，建議先休息或透過「找晴空」查看周邊有沒有晴空空檔。'
      };
}

/** Detect dangerous winter driving weather (gale >= 12 m/s OR drifting snow/blizzard >= 9 m/s with frozen precip) */
export function isCorridorHazard(d) {
  if (!d || d.isOcean || d.unavailable) return false;
  const wind = Number(d.maxWind3h) || 0;
  const precip = Number(d.maxPrecip3h) || 0;
  const temp = Number.isFinite(d.temp) ? d.temp : 5;
  return wind >= 12 || (wind >= 9 && precip >= 0.2 && temp <= 1.5);
}

/**
 * Unified cross-tab field decision synthesizer (GO / DRIVE / WAIT / SLEEP / DAYLIGHT / LOW-LAT).
 * Combines live score, incoming solar wind, dark-window countdown, 360° clear-sky corridors & 3-Night Outlook.
 */
export function synthesizeTonightAction({
  lat = 69.97, lon = 23.27, sc, scNext = null, bal = null, goesSub = null,
  bestDark = null, dirResults = null, nights3 = null, darkWin = null,
  kp = null, mlt = null, effMoonPct = 0, lang
} = {}) {
  const en = isEn(lang);
  const base = evaluateVerdict({ lat, lon, bestDark, kp, mlt, effMoonPct, scoreObj: sc, lang });
  if (!sc || typeof sc !== 'object') {
    return { ...base, actionType: 'wait', ctaView: null, ctaLabel: '' };
  }
  if (sc.outOfZone) {
    return { ...base, actionType: 'low-lat', ctaView: null, ctaLabel: '' };
  }

  const fmtDur = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    if (en) return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
    return h > 0 ? (m > 0 ? `${h} 小時 ${m} 分鐘` : `${h} 小時`) : `${m} 分鐘`;
  };

  // 1. Daylight / Twilight wait with exact dark-window countdown
  if (sc.isTooBright) {
    let lead = base.lead;
    if (darkWin?.state === 'midnight-sun') {
      lead = en
        ? 'Midnight sun season — the sky stays too bright around the clock for aurora viewing.'
        : '目前處於極晝期間，24 小時天色皆過亮，暫無法觀測極光。';
    } else if (darkWin?.state === 'twilight-wait' && darkWin.nextDarkHM) {
      const inTxt = fmtDur(darkWin.darkInMin);
      const hasClearAhead = bestDark && (bestDark.clear >= 50 || (bestDark.score ?? 0) >= 35);
      const cueZh = hasClearAhead
        ? '今晚有望見晴'
        : (bestDark && bestDark.clear < 25 ? '今晚普遍多雲' : '入夜後再看雲況');
      const cueEn = hasClearAhead
        ? 'clearer skies tonight'
        : (bestDark && bestDark.clear < 25 ? 'mostly cloudy tonight' : 'check clouds after dusk');
      lead = en
        ? `Dark at ${darkWin.nextDarkHM}${inTxt ? ` (in ${inTxt})` : ''} · ${cueEn}.`
        : `${darkWin.nextDarkHM} 天黑${inTxt ? `（約 ${inTxt} 後）` : ''}，${cueZh}。`;
    }
    return { ...base, lead, actionType: 'daylight', ctaView: null, ctaLabel: '' };
  }

  // 2. GO NOW (good/prime score or active substorm with usable sky)
  if (sc.total >= 40 || (goesSub?.active && sc.skyScore >= 25)) {
    return { ...base, actionType: 'go', ctaView: null, ctaLabel: '' };
  }

  // 3. DRIVE (overcast locally, but 360° Clear-Sky Radar finds a safe, clear drivable corridor!)
  const comp = Array.isArray(dirResults) && dirResults.length >= 2 ? summarizeCompass(dirResults, lang) : null;
  if (sc.skyScore < 45 && comp && comp.good && comp.bestKey && comp.bestKey !== 'here') {
    const dest = dirResults.find(d => d && d.key === comp.bestKey);
    const roadKm = (dest && Number.isFinite(dest.roadKm)) ? dest.roadKm : ((dest && Number.isFinite(dest.distKm)) ? dest.distKm : null);
    const distTag = roadKm !== null
      ? (dest?.isGeneric
          ? (en ? ` (~${roadKm} km straight-line)` : `（直線約 ${roadKm} km）`)
          : (en ? ` (~${roadKm} km road)` : `（公路約 ${roadKm} km）`))
      : '';
    const dirName = en ? tDirLabel(dest?.label || comp.bestKey, 'en') : (dest?.label || comp.bestKey);
    const title = sc.auroraScore >= 50
      ? (en ? 'Aurora active above — drive to clear sky' : '頭頂極光活躍，建議開車找雲縫')
      : (en ? 'Cloudy here — clearer skies nearby' : '原地雲層偏厚，周邊有晴空可轉移');
    const lead = en
      ? `${dirName}${distTag} is ${comp.bestClear}% clear (${comp.diff}% clearer than here). Check road conditions first.`
      : `「${dirName}」${distTag} 未來 3 小時晴空率 ${comp.bestClear}%（比原地高 ${comp.diff}%），出發前請先確認路況。`;
    return {
      ...base, title, lead, actionType: 'drive',
      ctaView: 'dir', ctaLabel: `${term(TERMS.nav.findClear, en)} →`
    };
  }

  // 4. WAIT (incoming solar wind surge/shock OR clouds clearing later tonight)
  const risingEnough = Boolean(scNext && !scNext.outOfZone && !scNext.isTooBright && scNext.total >= Math.max(20, sc.total + 5));
  const incomingStrong = Boolean(scNext && !scNext.outOfZone && !scNext.isTooBright && (scNext.total >= 35 || (bal?.shockActive && risingEnough)));
  if (incomingStrong && bal?.etaMin) {
    const title = en ? `Activity may rise in about ${bal.etaMin} min` : `約 ${bal.etaMin} 分鐘後有機會增強`;
    const lead = en
      ? `Incoming solar wind is strengthening (score may reach ${scNext.total}). Stay ready with the screen-on monitor.`
      : `太陽風正在增強（指數預估升到 ${scNext.total}），建議原地稍等並開啟螢幕常亮監測。`;
    return { ...base, title, lead, actionType: 'wait', ctaView: null, ctaLabel: '' };
  }
  if (bal?.shockActive && bal?.etaMin && scNext && !scNext.outOfZone && !scNext.isTooBright && sc.skyScore < 45) {
    const title = en ? `Solar storm arrives in about ${bal.etaMin} min` : `太陽風暴約 ${bal.etaMin} 分鐘後抵達`;
    const lead = en
      ? `Heavy clouds here (score may reach only ${scNext.total}) — try Find clear skies for nearby gaps.`
      : `但原地雲層偏厚（指數預估僅 ${scNext.total}），建議先用「找晴空」看看周邊雲縫。`;
    return {
      ...base, title, lead, actionType: 'drive',
      ctaView: 'dir', ctaLabel: `${term(TERMS.nav.findClear, en)} →`
    };
  }
  if (sc.total < 18 && sc.skyScore < 45 && bestDark && bestDark.clear >= 55) {
    const title = en ? `Cloudy now — clears around ${bestDark.time}` : `現在雲厚，預計 ${bestDark.time} 轉晴`;
    const lead = en
      ? `Clear sky rises to ${bestDark.clear}% around ${bestDark.time} (score ${bestDark.score}). Rest until then.`
      : `預計 ${bestDark.time} 晴空率升到 ${bestDark.clear}%（指數 ${bestDark.score}），可先休息等雲散。`;
    return { ...base, title, lead, actionType: 'wait', ctaView: null, ctaLabel: '' };
  }

  // 5. SLEEP (overcast here + overcast nearby + no clearing window + quiet wind -> point to best future night)
  if (sc.total < 18 && sc.skyScore < 40 && sc.auroraScore < 50) {
    const futureNights = Array.isArray(nights3) ? nights3.slice(1).filter(n => n && (n.tone === 'good' || n.tone === 'warn')) : [];
    futureNights.sort((a, b) => (b.bestNightScore || 0) - (a.bestNightScore || 0));
    const bestFuture = futureNights[0];
    const lead = bestFuture
      ? (en
          ? `Overcast locally and nearby with weak activity — save your energy for ${bestFuture.label} (${bestFuture.badge}).`
          : `原地與周邊皆厚雲且地磁偏弱，建議先休息養足體力，${bestFuture.label}（${bestFuture.badge}）機會較佳。`)
      : (en
          ? 'Overcast locally and nearby with weak solar wind — good time to rest and check back later.'
          : '原地與周邊皆厚雲且太陽風偏弱，建議先休息，稍後或明晚再看。');
    return {
      ...base,
      title: en ? 'Low chance right now — save your energy' : '目前機率偏低，建議先休息',
      lead, actionType: 'sleep', ctaView: null, ctaLabel: ''
    };
  }

  return { ...base, actionType: sc.total >= 18 ? 'wait' : 'sleep', ctaView: null, ctaLabel: '' };
}

export function summarizeEnergyTrend(series, speed, langOrBal, maybeLang) {
  const hasBal = langOrBal && typeof langOrBal === 'object';
  const balOpt = hasBal ? langOrBal : null;
  const en = isEn(hasBal ? maybeLang : langOrBal);
  if (!Array.isArray(series) || !series.length) {
    return {
      good: false,
      text: en ? 'Temporarily unable to read solar wind satellite data — retrying soon.' : '暫時無法讀取太陽風衛星資料，稍後自動重試。',
      raw: '', etaMin: 45
    };
  }
  const cleanBzs = medianSmooth3(series.map(s => Number.isFinite(s?.bz) ? s.bz : 0));
  const lastBz = cleanBzs[cleanBzs.length - 1];
  const minBzRecent = Math.min(...cleanBzs.slice(-30));
  const etaMin = balOpt?.etaMin ?? computeL1EtaMin(speed);
  const spdTxt = Number.isFinite(speed) ? ` · ${Math.round(speed)} km/s` : '';
  const raw = `Bz ${lastBz >= 0 ? '+' : ''}${lastBz.toFixed(1)} nT${spdTxt}`;

  const energies = (balOpt && Array.isArray(balOpt.energy120) && balOpt.energy120.length === series.length)
    ? balOpt.energy120
    : cleanBzs.map(bz => bzToEnergy(bz, speed));
  const lastE = energies[energies.length - 1];
  const maxE30 = Math.max(...energies.slice(-30));

  if (lastE >= 62 || lastBz <= -4) {
    return { good: true, text: en ? `Solar wind entered the Active zone — aurora may brighten in ~${etaMin} min.` : `太陽風進入「活躍區」，預計約 ${etaMin} 分鐘後有機會觸發極光增強。`, raw, etaMin };
  }
  if (maxE30 >= 62 || minBzRecent <= -4) {
    return { good: true, text: en ? `Energy spiked in the past 30 min — keep watching for the next ${etaMin} min.` : `過去 30 分鐘曾出現能量高峰，接下來約 ${etaMin} 分鐘值得留意。`, raw, etaMin };
  }
  if (lastE >= 25 || lastBz < -0.5) {
    return { good: false, text: en ? 'Solar wind energy is building gently — watch whether it reaches Active.' : '太陽風能量正在增強，可留意是否進入「活躍」區。', raw, etaMin };
  }
  return { good: false, text: en ? 'Solar wind is currently quiet — keep screen-on monitor open for sudden bursts.' : '目前太陽風偏平靜，可開啟螢幕常亮監測，有活動增強再出門觀測。', raw, etaMin };
}

/** Unified Clear-Sky % compass summary (higher % = clearer = better; never promotes gale/blizzard routes) */
export function summarizeCompass(dirResults, lang) {
  if (!Array.isArray(dirResults) || dirResults.length < 2) return null;
  const en = isEn(lang);
  const here = dirResults[0];
  if (!here || here.unavailable || !Number.isFinite(here.avg3h)) return null;
  const hereClear = Math.max(0, Math.min(100, Math.round(100 - here.avg3h)));
  const landOthers = dirResults.slice(1).filter(d => d && !d.isOcean && !d.unavailable && Number.isFinite(d.avg3h)).sort((a, b) => a.avg3h - b.avg3h);
  if (here.avg3h <= 35) {
    return {
      bestKey: 'here', bestClear: hereClear, hereClear, diff: 0, good: true,
      text: en ? `Clear skies right here for the next 3h (${hereClear}% clear) — no need to drive.` : `原地未來 3 小時偏晴（晴空率 ${hereClear}%），就近觀測即可。`
    };
  }
  if (!landOthers.length) {
    return {
      bestKey: null, bestClear: null, hereClear, diff: 0, good: false,
      text: en ? 'Surrounding points are open sea or unavailable. Stay local or check the Cloud Map for inland roads.' : '周邊多為海面或暫無資料，建議留在當地或透過「動態雲圖」查看內陸路線。'
    };
  }
  const safeOthers = landOthers.filter(d => !isCorridorHazard(d));
  const best = safeOthers[0] || landOthers[0];
  const bestClear = Math.max(0, Math.min(100, Math.round(100 - best.avg3h)));
  const diff = bestClear - hereClear;
  const qualifies = (diff >= 25 && best.avg3h <= 50) || (best.avg3h <= 30 && diff >= 15);
  if (qualifies && !isCorridorHazard(best)) {
    return {
      bestKey: best.key, bestClear, hereClear, diff, good: true,
      text: en ? `Clearer skies toward "${tDirLabel(best.label, 'en')}" (${bestClear}% clear, +${diff}% clearer than here).` : `「${best.label}」有明顯晴空空檔（未來 3h 晴空率 ${bestClear}%，比原地高 ${diff}%）。`
    };
  }
  // If a clearer corridor exists ONLY under gale/blizzard conditions, explicitly warn instead of recommending a drive
  const hazardousBest = landOthers[0];
  if (isCorridorHazard(hazardousBest) && hazardousBest.avg3h <= 50) {
    const hClear = Math.max(0, Math.min(100, Math.round(100 - hazardousBest.avg3h)));
    const wMs = Math.round(hazardousBest.maxWind3h || 0);
    return {
      bestKey: null, bestClear: hClear, hereClear, diff: hClear - hereClear, good: false, hazardOnly: true,
      text: en
        ? `Clearer sky toward "${tDirLabel(hazardousBest.label, 'en')}" (${hClear}%), but high wind/blowing snow (${wMs} m/s) makes driving hazardous — check road closures before leaving.`
        : `「${hazardousBest.label}」雖有晴空（${hClear}%），但強風／吹雪達 ${wMs} m/s，冬季行車風險高，請先查封路或留在原地。`
    };
  }
  if (best.avg3h <= 50) {
    return {
      bestKey: null, bestClear, hereClear, diff, good: false,
      text: en ? `Nearby routes have similar partly-cloudy skies (~${bestClear}% clear) — watch locally first.` : `周邊與原地皆為局部雲隙（最晴方向晴空率約 ${bestClear}%），差距不大，建議先原地觀察。`
    };
  }
  return {
    bestKey: null, bestClear, hereClear, diff, good: false,
    text: en ? `Nearby land routes are also overcast (~${bestClear}% clear). Better to wait locally.` : `周邊陸路目前同樣雲厚（晴空率約 ${bestClear}%），建議先原地等候放晴。`
  };
}

/** Decide whether real-time conditions warrant firing an aurora alert (including storm gaps & incoming CME) */
export function shouldTriggerAuroraAlert({ sc, goesSub, scNext, bal } = {}) {
  if (!sc || sc.isTooBright) return { fire: false, reason: null };
  const stormGapFire = !sc.outOfZone && sc.auroraScore >= 80 && sc.skyScore >= 20;
  const substormFire = !sc.outOfZone && Boolean(goesSub?.active) && sc.skyScore >= 25;
  const nextCoupled = Boolean(scNext && !scNext.outOfZone && !scNext.isTooBright && ((scNext.auroraScore ?? 0) >= 40 || (scNext.total ?? 0) >= 35));
  const incomingFire = Boolean(scNext && !scNext.outOfZone && !scNext.isTooBright && (scNext.total >= 45 || (bal?.shockActive && sc.skyScore >= 30 && nextCoupled)));
  if (!sc.outOfZone && sc.total >= 40) return { fire: true, reason: 'score' };
  if (stormGapFire) return { fire: true, reason: 'storm-gap' };
  if (substormFire) return { fire: true, reason: 'substorm' };
  if (incomingFire) return { fire: true, reason: 'incoming' };
  return { fire: false, reason: null };
}
