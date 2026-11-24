/**
 * Nordic Aurora Radar — Pure Scientific, Astronomical & Space-Weather Engine
 *
 * Zero DOM dependencies, zero side effects. Every function is deterministic
 * (given explicit timestamps) and directly testable under Node.js.
 */

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

export function tSky(zhTxt, lang) {
  if (!isEn(lang)) return zhTxt;
  const map = {
    '☀️ 白天': 'Day', '🌅 晨昏光': 'Twilight', '❄️ 雪': 'Snow',
    '🌧️ 雨雪': 'Rain', '🌟 晴': 'Clear', '⛅ 縫': 'Partly', '☁️ 陰': 'Cloudy'
  };
  return map[zhTxt] || zhTxt;
}

export function tDirLabel(lbl, lang) {
  if (!isEn(lang)) return String(lbl).replace(/^📍\s*/, '');
  return String(lbl)
    .replace(/^📍\s*/, '')
    .replace('目前位置', 'Current Spot')
    .replace(/^[⬆️⬇️➡️⬅️]+\s*/, '')
    .replace('往東北 ', 'NE · ').replace('往西北 ', 'NW · ')
    .replace('往北 ', 'North ').replace('往南 ', 'South ')
    .replace('往東 ', 'East ').replace('往西 ', 'West ');
}

export function tGrade(zhGrade, lang) {
  if (!isEn(lang)) return zhGrade;
  const map = {
    '🌏 緯度過低': 'Low Lat',
    '🌍 極光帶偏北': 'Oval North',
    '🌍 極光帶偏南': 'Oval South',
    '☀️ 天色過亮': 'Too Bright',
    '🌅 暮光漸暗': 'Twilight',
    '🌟 極佳條件': 'Prime',
    '🟢 適合觀測': 'Good',
    '✨ 有機會看見': 'Fair',
    '⚡ 雲縫極光': 'Gap Watch',
    '🌌 晴朗但極光弱': 'Quiet',
    '☁️ 雲層過厚': 'Cloudy'
  };
  return map[zhGrade] || zhGrade;
}

// ====== Verified Real-Road Dark-Sky Chase Corridors ======
// All Nordic points verified land-safe and west of the Norwegian/Russian border (lon <= 30.85)
export const NORDIC_CORRIDORS = [
  { match: [69.97, 23.27], pts: [
    { key: 'N', label: '往東北 Skaidi', lat: 70.4325, lon: 24.5020, isOcean: false },
    { key: 'E', label: '往東 Lakselv', lat: 70.0513, lon: 24.9718, isOcean: false },
    { key: 'S', label: '往南 Kautokeino', lat: 69.0125, lon: 23.0412, isOcean: false },
    { key: 'W', label: '往西 Burfjord', lat: 69.9360, lon: 22.0528, isOcean: false }
  ]},
  { match: [69.65, 18.96], pts: [
    { key: 'N', label: '往北 Grøtfjord', lat: 69.7760, lon: 18.5450, isOcean: false },
    { key: 'E', label: '往東 Skibotn', lat: 69.3910, lon: 20.2680, isOcean: false },
    { key: 'S', label: '往南 Kilpisjärvi', lat: 69.0480, lon: 20.7950, isOcean: false },
    { key: 'W', label: '往西 Sommarøy', lat: 69.6340, lon: 18.0090, isOcean: false }
  ]},
  { match: [68.23, 14.57], pts: [
    { key: 'N', label: '往北 Gimsøy', lat: 68.3200, lon: 14.1500, isOcean: false },
    { key: 'E', label: '往東 Lødingen', lat: 68.4140, lon: 15.9940, isOcean: false },
    { key: 'S', label: '往南 Leknes', lat: 68.1475, lon: 13.6115, isOcean: false },
    { key: 'W', label: '往西 Ramberg', lat: 68.0900, lon: 13.2490, isOcean: false }
  ]},
  { match: [69.35, 17.48], pts: [
    { key: 'N', label: '往北 Ersfjord', lat: 69.4860, lon: 17.3920, isOcean: false },
    { key: 'E', label: '往東 Finnsnes', lat: 69.2300, lon: 17.9810, isOcean: false },
    { key: 'S', label: '往南 Bardufoss', lat: 69.0640, lon: 18.5140, isOcean: false },
    { key: 'W', label: '往西 Hamn i Senja', lat: 69.4170, lon: 17.1590, isOcean: false }
  ]},
  { match: [68.44, 17.43], pts: [
    { key: 'N', label: '往北 Gratangen', lat: 68.6930, lon: 17.5320, isOcean: false },
    { key: 'E', label: '往東 Abisko', lat: 68.3495, lon: 18.8312, isOcean: false },
    { key: 'S', label: '往南 Ballangen', lat: 68.3430, lon: 16.8320, isOcean: false },
    { key: 'W', label: '往西 Evenes', lat: 68.4910, lon: 16.6780, isOcean: false }
  ]},
  { match: [68.35, 18.83], pts: [
    { key: 'N', label: '往北 Bjerkvik', lat: 68.5490, lon: 17.5540, isOcean: false },
    { key: 'E', label: '往東 Kiruna', lat: 67.8558, lon: 20.2253, isOcean: false },
    { key: 'S', label: '往南 Torneträsk', lat: 68.2150, lon: 19.7200, isOcean: false },
    { key: 'W', label: '往西 Narvik', lat: 68.4385, lon: 17.4273, isOcean: false }
  ]},
  { match: [69.73, 30.05], pts: [
    { key: 'N', label: '往北 Vadsø', lat: 70.0740, lon: 29.7490, isOcean: false },
    { key: 'E', label: '往東 Jakobselv', lat: 69.7752, lon: 30.8303, isOcean: false },
    { key: 'S', label: '往南 Svanvik', lat: 69.4538, lon: 30.0496, isOcean: false },
    { key: 'W', label: '往西 Neiden', lat: 69.7010, lon: 29.3830, isOcean: false }
  ]},
  { match: [66.50, 25.73], pts: [
    { key: 'N', label: '往北 Luosto', lat: 67.1410, lon: 26.9040, isOcean: false },
    { key: 'E', label: '往東 Kemijärvi', lat: 66.7130, lon: 27.4310, isOcean: false },
    { key: 'S', label: '往南 Ranua', lat: 65.9280, lon: 26.5180, isOcean: false },
    { key: 'W', label: '往西 Pello', lat: 66.7750, lon: 23.9630, isOcean: false }
  ]}
];

// Global aurora hotspot paved-road corridors (all elevations >9m land, bearings & label widths verified)
export const GLOBAL_CORRIDORS = [
  { match: [64.15, -21.94], pts: [
    { key: 'N', label: '往北 Borgarnes', lat: 64.5383, lon: -21.9206, isOcean: false },
    { key: 'E', label: '往東 Þingvellir', lat: 64.2559, lon: -21.1295, isOcean: false },
    { key: 'S', label: '往南 Krýsuvík', lat: 63.8960, lon: -22.0550, isOcean: false },
    { key: 'W', label: '往西 Garður', lat: 64.0650, lon: -22.6464, isOcean: false }
  ]},
  { match: [64.84, -147.72], pts: [
    { key: 'N', label: '往北 Cleary Summit', lat: 65.0736, lon: -147.4197, isOcean: false },
    { key: 'E', label: '往東 Chena Springs', lat: 65.0528, lon: -146.0558, isOcean: false },
    { key: 'S', label: '往南 Salcha', lat: 64.5270, lon: -146.9790, isOcean: false },
    { key: 'W', label: '往西 Murphy Dome', lat: 64.9522, lon: -148.3536, isOcean: false }
  ]},
  { match: [62.45, -114.37], pts: [
    { key: 'N', label: '往北 Prosperous Lk', lat: 62.6167, lon: -114.2167, isOcean: false },
    { key: 'E', label: '往東 Prelude Lake', lat: 62.5564, lon: -113.9169, isOcean: false },
    { key: 'S', label: '往南 Dettah', lat: 62.4119, lon: -114.3081, isOcean: false },
    { key: 'W', label: '往西 Behchokǫ̀', lat: 62.8025, lon: -116.0461, isOcean: false }
  ]},
  { match: [-45.03, 168.66], pts: [
    { key: 'N', label: '往北 Wanaka', lat: -44.7032, lon: 169.1321, isOcean: false },
    { key: 'E', label: '往東 Cromwell', lat: -45.0384, lon: 169.2007, isOcean: false },
    { key: 'S', label: '往南 Kingston', lat: -45.3327, lon: 168.7167, isOcean: false },
    { key: 'W', label: '往西 Glenorchy', lat: -44.8505, lon: 168.3879, isOcean: false }
  ]},
  { match: [-42.88, 147.33], pts: [
    { key: 'N', label: '往北 Kempton', lat: -42.5333, lon: 147.2000, isOcean: false },
    { key: 'E', label: '往東 Sorell', lat: -42.7858, lon: 147.5594, isOcean: false },
    { key: 'S', label: '往南 South Arm', lat: -43.0258, lon: 147.4169, isOcean: false },
    { key: 'W', label: '往西 New Norfolk', lat: -42.7828, lon: 147.0600, isOcean: false }
  ]}
];

export const CHASE_CORRIDORS = [...NORDIC_CORRIDORS, ...GLOBAL_CORRIDORS];

// ====== Time, Geography & URL Helpers ======

/** Safari-safe UTC timestamp parser (handles both "YYYY-MM-DD HH:MM:SS" and ISO "T...Z") */
export function parseUtcMs(tag) {
  if (typeof tag === 'number' && Number.isFinite(tag)) {
    return tag > 1e12 ? tag : tag * 1000;
  }
  if (!tag) return NaN;
  const s = String(tag).trim().replace(' ', 'T');
  return Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

export function isInNordicMetBox(lat, lon) {
  return lat >= 55.0 && lat <= 72.0 && lon >= 4.0 && lon <= 33.0;
}

export function computeCompassPoints(lat, lon, distKm = 60) {
  const here = { key: 'here', label: '📍 目前位置', lat: +lat.toFixed(4), lon: +lon.toFixed(4), isOcean: false };
  for (const c of CHASE_CORRIDORS) {
    if (Math.hypot(lat - c.match[0], (lon - c.match[1]) * Math.cos(lat * Math.PI / 180)) < 0.25) {
      return [here, ...c.pts.map(p => ({ ...p }))];
    }
  }
  const dLat = distKm / 111.32;
  const cosLat = Math.max(0.1, Math.cos(lat * Math.PI / 180));
  const dLon = distKm / (111.32 * cosLat);
  return [
    here,
    { key: 'N', label: `往北 ${distKm} km`, lat: +Math.min(89.5, lat + dLat).toFixed(4), lon: +lon.toFixed(4), isOcean: false },
    { key: 'S', label: `往南 ${distKm} km`, lat: +Math.max(-89.5, lat - dLat).toFixed(4), lon: +lon.toFixed(4), isOcean: false },
    { key: 'E', label: `往東 ${distKm} km`, lat: +lat.toFixed(4), lon: +(((lon + dLon + 540) % 360) - 180).toFixed(4), isOcean: false },
    { key: 'W', label: `往西 ${distKm} km`, lat: +lat.toFixed(4), lon: +(((lon - dLon + 540) % 360) - 180).toFixed(4), isOcean: false }
  ];
}

export function getZoneParts(dateObj, timeZone) {
  const tz = (timeZone && timeZone !== 'auto') ? timeZone : 'UTC';
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(dateObj);
  } catch (e) {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(dateObj);
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
    if (!Number.isFinite(ms)) return String(utcTag).slice(11, 16);
    const shifted = new Date(ms + offsetMin * 60000);
    const z = getZoneParts(shifted, timeZone);
    return `${z.hourStr}:${z.minStr}`;
  } catch (e) {
    return String(utcTag).slice(11, 16);
  }
}

export function formatReverseGeo(geoJson) {
  if (!geoJson || typeof geoJson !== 'object') return null;
  const country = (geoJson.countryName || '').trim();
  const city = (geoJson.city || geoJson.locality || geoJson.principalSubdivision || '').trim();
  const locality = (geoJson.locality || '').trim();
  if (!country && !city) return null;
  const prefix = (country && country !== city) ? country + '・' : '';
  if (city && locality && locality !== city) return `${prefix}${city}（${locality}）`;
  if (city) return `${prefix}${city}`;
  return country;
}

export function parseUrlLocation(searchStr) {
  if (!searchStr || typeof searchStr !== 'string') return null;
  try {
    const sp = new URLSearchParams(searchStr);
    if (!sp.has('lat') || !sp.has('lon')) return null;
    const lat = parseFloat(sp.get('lat'));
    const lon = parseFloat(sp.get('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    const rawName = (sp.get('name') || '').replace(/[\r\n\t<>]/g, '').trim().slice(0, 60);
    const fallbackName = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
    const name = rawName || fallbackName;
    let tz = (sp.get('tz') || 'auto').trim();
    if (tz !== 'auto') {
      try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch (e) { tz = 'auto'; }
    }
    return { name, nameEn: name, lat: +lat.toFixed(4), lon: +lon.toFixed(4), tz, mode: 'manual', accuracy: null };
  } catch (e) { return null; }
}

export function buildShareUrl(baseHref, pos, lang) {
  try {
    const u = new URL(baseHref);
    if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
      u.searchParams.set('lat', pos.lat.toFixed(4));
      u.searchParams.set('lon', pos.lon.toFixed(4));
      const displayName = isEn(lang) ? (pos.nameEn || pos.name) : pos.name;
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

/**
 * Analytical ELP lunar phase, topocentric elevation, and physical sky-brightness factor.
 * Uses Krisciunas & Schaefer (1991) opposition surge so a 50% quarter moon (~9% of Full Moon lux)
 * does not falsely trigger bright-moon exposure or darkness penalties.
 */
export function getMoonState(dateObj, lat = 69.97, lon = 23.27) {
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

  // Krisciunas & Schaefer (1991) opposition surge phase-angle illuminance fraction (Full Moon = 1.0, Quarter = 0.09)
  const alphaDeg = Math.acos(Math.max(-1, Math.min(1, 2 * (pct / 100) - 1))) / r;
  const luxFrac = Math.pow(10, -0.4 * (0.026 * alphaDeg + 4e-9 * Math.pow(alphaDeg, 4)));
  const effMoonPct = Math.max(0, Math.min(100, Math.round(100 * luxFrac * altFactor)));

  let desc = '月光微弱（暗空極佳）';
  if (!up) desc = `月亮已落下（相位 ${pct}%，暗空極佳）`;
  else if (effMoonPct >= 55) desc = `月光較亮（高掛 ${Math.round(altDeg)}°）`;
  else if (effMoonPct >= 20) desc = `中度月光（仰角 ${Math.round(altDeg)}°）`;
  return { pct, altDeg, up, effMoonPct, desc };
}

// ====== Cloud Attenuation, Geomagnetics & Viewing Geometry ======

/** Layered cloud occlusion with total-cloud cap preventing random-overlap over-estimation */
export function computeEffectiveCloud(low, mid, high = 0, fog = 0, totalCap = null) {
  const clamp01 = x => Math.max(0, Math.min(1, (Number.isFinite(x) ? x : 0) / 100));
  const l = clamp01(low), m = clamp01(mid), h = clamp01(high), f = clamp01(fog);
  let eff = Math.round(100 * (1 - (1 - l) * (1 - m) * (1 - 0.30 * h) * (1 - f)));
  if (totalCap !== null && Number.isFinite(totalCap)) {
    eff = Math.min(eff, Math.min(100, Math.round(totalCap + 8)));
  }
  return Math.max(0, Math.min(100, eff));
}

/** IGRF-14 / AACGM-aligned geomagnetic latitude (North 80.9°N/-72.8°W; eccentric South -74.5°S/+126.0°E) */
export function computeGeomagneticLat(lat, lon) {
  const toR = d => d * Math.PI / 180;
  const phi = toR(lat), lam = toR(lon);
  if (lat >= 0) {
    const phiP = toR(80.9), lamP = toR(-72.8);
    const sinM = Math.sin(phi) * Math.sin(phiP) + Math.cos(phi) * Math.cos(phiP) * Math.cos(lam - lamP);
    return Math.asin(Math.max(-1, Math.min(1, sinM))) * 180 / Math.PI;
  }
  const phiP = toR(-74.5), lamP = toR(126.0);
  const sinM = Math.sin(phi) * Math.sin(phiP) + Math.cos(phi) * Math.cos(phiP) * Math.cos(lam - lamP);
  return -Math.asin(Math.max(-1, Math.min(1, sinM))) * 180 / Math.PI;
}

/**
 * Exact spherical dipole Magnetic Local Time (0-24h).
 * Uses the antipodal axis (+74.5°N, -54.0°W) for Southern Hemisphere consistency with computeGeomagneticLat,
 * and true J2000 subsolar (declination, longitude) rather than mean-time approximation (<1 min global error).
 */
export function computeMLT(dateObj, lat, lon) {
  const toR = d => d * Math.PI / 180;
  const phiP = toR(lat >= 0 ? 80.9 : 74.5);
  const lamP = toR(lat >= 0 ? -72.8 : -54.0);
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

/** NOAA empirical oval (2.04°/Kp up to Kp 6) + G3-G5 storm expansion (clamped to physical Kp 9.0) */
export function requiredKpForMagLat(absMagLat) {
  if (absMagLat >= 66.5) return 0;
  if (absMagLat >= 54.2) return +((66.5 - absMagLat) / 2.04).toFixed(1);
  return Math.min(9.0, +(6.0 + (54.2 - absMagLat) / 6.5).toFixed(1));
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
  const phi2 = toR(lat >= 0 ? 80.9 : -74.5);
  const lam2 = toR(lat >= 0 ? -72.8 : 126.0);
  const dLam = lam2 - lam1;
  const y = Math.sin(dLam) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLam);
  return (Math.round(Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

/**
 * Spherical-Earth aurora viewing geometry (Re=6371 km).
 * Computes true magnetic-pole compass azimuth + elevation angles for green peak (120 km),
 * upper curtains (200 km), and G3-G5 630 nm red aurora (300 km).
 */
export function computeViewingGeometry({ lat = 69.97, lon = 23.27, kp = 0, mlt = null, lang } = {}) {
  const en = isEn(lang);
  const curKp = (kp !== null && Number.isFinite(kp)) ? Math.max(0, Math.min(9, kp)) : 0;
  const absMag = Math.abs(computeGeomagneticLat(lat, lon));
  const mltShift = (mlt !== null && Number.isFinite(mlt)) ? (2.0 * Math.cos((mlt - 0.5) * Math.PI / 12)) : 0;
  // Align oval equatorward edge with requiredKpForMagLat (incl. G3-G5 expansion down to 38°)
  const ovalBase = curKp <= 6 ? (66.5 - 2.04 * curKp) : Math.max(38, 54.2 - (curKp - 6) * 4.5);
  const ovalEdge = Math.max(38, ovalBase - mltShift);
  const deltaDeg = ovalEdge - absMag;

  const poleAz = computeAuroraBearing(lat, lon);
  const eqAz = (poleAz + 180) % 360;
  const poleTxt = `${compassLabel16(poleAz, en)} ${poleAz}°`;
  const eqTxt = `${compassLabel16(eqAz, en)} ${eqAz}°`;
  const poleDir = lat >= 0 ? (en ? 'North' : '北方') : (en ? 'South' : '南方');

  if (absMag > 74 && curKp >= 4) {
    return {
      mode: 'overhead-eq', azimuthDeg: eqAz, elevGreenDeg: 65, elevUpperDeg: 80, direction: eqTxt,
      shortText: en ? `Overhead toward ${eqTxt} (expanded oval)` : `頭頂偏 ${eqTxt} 高空（極光帶擴張）`
    };
  }
  if (deltaDeg <= 0.5) {
    return {
      mode: 'overhead', azimuthDeg: poleAz, elevGreenDeg: 90, elevUpperDeg: 90, direction: poleTxt,
      shortText: en ? `Overhead & all sky (start toward ${poleTxt})` : `頭頂與全天空（可先朝 ${poleTxt} 找）`
    };
  }

  const Re = 6371;
  const psi = (deltaDeg * 111.32) / Re;
  const elevAt = h => Math.atan2((Re + h) * Math.cos(psi) - Re, (Re + h) * Math.sin(psi)) * 180 / Math.PI;
  const elevGreen = elevAt(120);
  const elevUpper = elevAt(200);
  const elevRed = elevAt(300);
  const topElev = curKp >= 6 ? Math.max(elevUpper, elevRed) : elevUpper;
  const lo = Math.max(3, Math.round(elevGreen > 0 ? elevGreen : Math.max(3, elevUpper)));
  const hi = Math.min(85, Math.max(lo + 4, Math.round(topElev)));

  if (elevGreen >= 18) {
    return {
      mode: 'mid', azimuthDeg: poleAz, elevGreenDeg: +elevGreen.toFixed(1), elevUpperDeg: +elevUpper.toFixed(1), direction: poleTxt,
      shortText: en ? `Face ${poleTxt} (~${lo}°–${hi}° elevation)` : `朝 ${poleTxt}・仰角約 ${lo}°–${hi}°`
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
      text: en ? 'Visible to naked eye (faint green/grey) · vivid on phone' : '肉眼可見微綠／灰白光帶・手機夜拍色彩鮮明'
    };
  }
  if (scoreObj.total >= 15 || (scoreObj.auroraScore >= 45 && scoreObj.skyScore >= 20)) {
    return {
      tier: 'camera-first',
      text: en ? 'Faint to naked eye · phone Night Mode reveals green/red first' : '肉眼可能僅見淡白霧・建議用手機夜拍確認綠／紅光'
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

/** L1->Earth propagation time (1.44M km / v); supports extreme CMEs up to 3000 km/s (clamped 8..95m) */
export function computeL1EtaMin(speed) {
  if (!Number.isFinite(speed) || speed < 200 || speed > 3000) return 45;
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

/** Detect CME / CIR dynamic pressure shock using timestamp-bounded 30-min window & spike-resistant baseline */
export function detectPressureShock(windSeries) {
  if (!Array.isArray(windSeries) || !windSeries.length) return { pdyn: null, jumpNpa: 0, active: false };
  const rows = [];
  for (const r of windSeries) {
    const p = computeDynamicPressure(r.speed, r.density);
    if (p !== null) rows.push({ p, ts: parseUtcMs(r.time_tag) });
  }
  if (!rows.length) return { pdyn: null, jumpNpa: 0, active: false };
  const latest = rows[rows.length - 1];
  const win = Number.isFinite(latest.ts)
    ? rows.filter(x => Number.isFinite(x.ts) && x.ts >= latest.ts - 30 * 60000)
    : rows.slice(-30);
  const sortedP = win.map(x => x.p).sort((a, b) => a - b);
  const baseP = sortedP.length >= 4 ? sortedP[1] : sortedP[0];
  const jumpNpa = +(latest.p - baseP).toFixed(2);
  return { pdyn: latest.p, jumpNpa, active: latest.p >= 5.5 || jumpNpa >= 3.0 };
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

export function newellToEnergy(nw) {
  if (!Number.isFinite(nw) || nw <= 0) return 4;
  return Math.max(4, Math.min(100, Math.round(4 + Math.pow(nw / 100, 0.88) * 1.85)));
}

export function bzToEnergy(bz, speed = 420) {
  if (!Number.isFinite(bz)) return 0;
  const vScale = (Number.isFinite(speed) && speed > 200) ? Math.pow(speed / 420, 0.9) : 1;
  const e = bz < 0 ? (20 + (-bz) * 10.5 * vScale) : (20 - bz * 6);
  return Math.max(4, Math.min(100, Math.round(e)));
}

/**
 * 3-point rolling median filter for 1-minute satellite magnetometer telemetry.
 * Rejects single-minute DSCOVR/ACE instrument spikes without delaying or blunting real step shocks.
 */
export function medianSmooth3(values) {
  if (!Array.isArray(values) || values.length < 3) return Array.isArray(values) ? [...values] : [];
  const out = new Array(values.length);
  out[0] = values[0];
  for (let i = 1; i < values.length - 1; i++) {
    const a = values[i - 1], b = values[i], c = values[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c)) {
      out[i] = b;
    } else if ((a <= b && b <= c) || (c <= b && b <= a)) {
      out[i] = b;
    } else if ((b <= a && a <= c) || (c <= a && a <= b)) {
      out[i] = a;
    } else {
      out[i] = c;
    }
  }
  out[values.length - 1] = values[values.length - 1];
  return out;
}

/**
 * Split 3h L1 telemetry into Earth-arriving (now) vs incoming (+ETA) windows,
 * apply 3-point median spike rejection, and compute 60-min substorm preconditioning energy.
 * Anchors to refNowMs (when provided) so DSCOVR/ACE telemetry lag never shifts "Now" into the past.
 */
export function computeBallisticCoupling(magSeries, windSeriesOrSpeed, nowMs = null) {
  if (!Array.isArray(magSeries) || !magSeries.length) {
    return {
      etaMin: 45, nowBz: null, nowNewell: null, nextBz: null, nextNewell: null,
      avgNewell60: null, preconditioned: false,
      pdyn: null, shockActive: false, shockJumpNpa: 0, energy120: [], arrivingIdx: -1
    };
  }
  const isWindArr = Array.isArray(windSeriesOrSpeed) && windSeriesOrSpeed.length > 0;
  const windMap = new Map();
  let latestSpd = 380;
  if (isWindArr) {
    for (const w of windSeriesOrSpeed) windMap.set(String(w.time_tag).slice(0, 16), w.speed);
    latestSpd = windSeriesOrSpeed[windSeriesOrSpeed.length - 1].speed;
  } else if (Number.isFinite(windSeriesOrSpeed) && windSeriesOrSpeed > 150) {
    latestSpd = windSeriesOrSpeed;
  }
  const shock = isWindArr ? detectPressureShock(windSeriesOrSpeed) : { pdyn: null, jumpNpa: 0, active: false };
  const etaMin = computeL1EtaMin(latestSpd);
  const lastTs = parseUtcMs(magSeries[magSeries.length - 1].time_tag);
  const refNowMs = (Number.isFinite(nowMs) && Number.isFinite(lastTs) && nowMs > lastTs) ? nowMs : lastTs;

  const smoothBz = medianSmooth3(magSeries.map(r => r.bz));
  const smoothBy = medianSmooth3(magSeries.map(r => r.by ?? 0));

  const enriched = magSeries.map((r, i) => {
    const v = windMap.get(String(r.time_tag).slice(0, 16)) ?? latestSpd;
    const bzClean = smoothBz[i];
    const byClean = smoothBy[i];
    const nw = computeNewellCoupling(v, byClean, bzClean);
    return { ...r, bz: bzClean, by: byClean, ts: parseUtcMs(r.time_tag), v, nw };
  });
  const avgWin = arr => {
    if (!arr.length) return { bz: null, newell: null };
    const bz = arr.reduce((s, r) => s + r.bz, 0) / arr.length;
    const nw = arr.reduce((s, r) => s + r.nw, 0) / arr.length;
    return { bz: +bz.toFixed(2), newell: Math.round(nw) };
  };

  const targetTs = Math.min(lastTs, refNowMs - etaMin * 60000);
  const incArr = enriched.filter(r => Number.isFinite(r.ts) && r.ts >= lastTs - 30 * 60000);
  const arrArr = enriched.filter(r => Number.isFinite(r.ts) && r.ts >= targetTs - 20 * 60000 && r.ts <= targetTs + 10 * 60000);
  const preArr = enriched.filter(r => Number.isFinite(r.ts) && r.ts >= targetTs - 60 * 60000 && r.ts <= targetTs);
  const inc = avgWin(incArr.length ? incArr : enriched.slice(-10));
  const nowW = avgWin(arrArr.length ? arrArr : (incArr.length ? incArr : enriched.slice(-10)));
  const avgNewell60 = preArr.length
    ? Math.round(preArr.reduce((s, r) => s + r.nw, 0) / preArr.length)
    : nowW.newell;
  const preconditioned = Number.isFinite(avgNewell60) && avgNewell60 >= 3200;

  const tail120 = enriched.slice(-120);
  const energy120 = tail120.map(r => newellToEnergy(r.nw));
  let arrivingIdx = -1, bestDiff = Infinity;
  tail120.forEach((r, i) => {
    if (!Number.isFinite(r.ts)) return;
    const d = Math.abs(r.ts - targetTs);
    if (d < bestDiff) { bestDiff = d; arrivingIdx = i; }
  });
  if (bestDiff > 20 * 60000) arrivingIdx = -1;

  return {
    etaMin, nowBz: nowW.bz, nowNewell: nowW.newell, nextBz: inc.bz, nextNewell: inc.newell,
    avgNewell60, preconditioned,
    pdyn: shock.pdyn, shockActive: shock.active, shockJumpNpa: shock.jumpNpa,
    energy120, arrivingIdx
  };
}

// ====== Aurora Visibility Scoring Engine (Calibrated Across 50 Global Cities) ======

export function computeAuroraScore({
  lat = 69.97, lon = 23.27, cloudNow, sunAlt = -15, bz, speed, kp, ovation,
  hpiGw = null, substormJumpNt = 0, pdyn = null, shockJumpNpa = 0,
  newell = null, preconditionedNewell60 = null, mlt = null, effMoonPct = 0
}) {
  const magLat = computeGeomagneticLat(lat, lon);
  const absMag = Math.abs(magLat);
  const mltShiftDeg = (mlt !== null && Number.isFinite(mlt)) ? (2.0 * Math.cos((mlt - 0.5) * Math.PI / 12)) : 0;
  const effMagForOval = absMag + mltShiftDeg;
  const neededKp = requiredKpForMagLat(effMagForOval);
  const skyScore = Math.max(0, Math.min(100, Math.round(100 - (cloudNow ?? 100))));

  const curKp = (kp !== null && Number.isFinite(kp)) ? kp : 0;
  const curOv = (ovation !== null && Number.isFinite(ovation)) ? ovation : null;
  const curHpi = (hpiGw !== null && Number.isFinite(hpiGw)) ? hpiGw : null;
  const bzVal = (bz !== null && Number.isFinite(bz)) ? bz : 0;
  const spdVal = (speed !== null && Number.isFinite(speed)) ? speed : 380;
  const subJump = (substormJumpNt !== null && Number.isFinite(substormJumpNt)) ? substormJumpNt : 0;
  const pVal = (pdyn !== null && Number.isFinite(pdyn)) ? pdyn : 0;
  const pJump = (shockJumpNpa !== null && Number.isFinite(shockJumpNpa)) ? shockJumpNpa : 0;

  // Real-time effective storm proxy Kp so sudden CMEs / substorms before 1m/3h Kp updates are NEVER missed
  const kpFromHpi = curHpi !== null ? Math.min(9, Math.max(0, (curHpi - 8) / 14)) : 0;
  const kpFromNewell = (newell !== null && Number.isFinite(newell))
    ? Math.min(9, Math.max(0, (newell - 1200) / 2400))
    : (bzVal < -4 ? Math.min(8, (-bzVal - 2) * 0.35 + Math.max(0, (spdVal - 400) / 150)) : 0);
  const subBonusKp = (subJump >= 15 ? 1.0 : 0) + ((pVal >= 6 || pJump >= 3) ? 0.6 : 0);
  const effKp = Math.min(9.5, Math.max(curKp, kpFromHpi, kpFromNewell) + subBonusKp);

  // Twilight darkness baseline (base threshold -4°; extreme G4-G5 storms can appear slightly earlier at -3.5°)
  const moonDarkFactor = Math.max(0.58, 1 - (effMoonPct ?? 0) * 0.0038);
  const baseTooBright = sunAlt >= -4;
  const rawTw = baseTooBright ? 0 : Math.min(1, (-sunAlt - 4) / 8);
  const darkScore = Math.round(100 * rawTw * moonDarkFactor);

  // Hard physical gate 1: < 32° geomagnetic (Taiwan 16°, Tokyo 28°, Singapore) -> impossible
  if (absMag < 32) {
    return {
      total: 0, skyScore, auroraScore: 0, darkScore, isTooBright: baseTooBright, twilightFactor: rawTw,
      magLat: Math.round(absMag), neededKp: requiredKpForMagLat(absMag), outOfZone: 'low-lat',
      grade: '🌏 緯度過低', color: '#ff8a96'
    };
  }

  // Hard physical gate 2: Mid-lat cities where neither global Kp, real-time solar wind proxy, nor horizon reach suffices
  // Tolerance +1.8 Kp (~3.7° poleward -> ~14° green / ~23° upper rays above horizon) prevents contradicting viewing geometry
  if (!(baseTooBright && absMag >= 45) && neededKp >= 2.5 && (effKp + 1.8) < neededKp && (curOv ?? 0) < 5) {
    return {
      total: 0, skyScore, auroraScore: 0, darkScore, isTooBright: baseTooBright, twilightFactor: rawTw,
      magLat: Math.round(absMag), neededKp, outOfZone: 'need-storm',
      grade: lat >= 0 ? '🌍 極光帶偏北' : '🌍 極光帶偏南', color: '#ff8a96'
    };
  }

  // Smooth fused geomagnetic base (no double-counting; sub-auroral blends overhead OVATION + horizon Kp margin)
  const kpForBase = Math.max(curKp, effKp * 0.85);
  const kpScore = Math.max(0, Math.min(100, kpForBase * 14));
  const hpiScore = curHpi !== null ? Math.max(0, Math.min(100, (curHpi - 8) * 1.35)) : null;
  const globalScore = hpiScore !== null ? (0.58 * hpiScore + 0.42 * kpScore) : kpScore;

  let baseAur;
  if (curOv !== null) {
    if (absMag > 73) {
      baseAur = 0.78 * curOv + 0.22 * globalScore;
    } else if (neededKp > 1.5) {
      const marginScore = Math.max(0, Math.min(100, (kpForBase - neededKp + 1.8) * 17));
      baseAur = 0.50 * curOv + 0.50 * marginScore;
    } else {
      baseAur = 0.52 * curOv + 0.48 * globalScore;
    }
  } else {
    baseAur = neededKp > 1.5
      ? Math.max(0, Math.min(100, (kpForBase - neededKp + 1.8) * 17))
      : globalScore;
  }

  // Attenuate solar-wind / substorm brightness boost when a mid-latitude city is still equatorward
  // of the auroral oval with near-zero overhead OVATION (prevents G1/G3 storms far poleward from
  // inflating scores over Berlin, Melbourne, or Sapporo before the oval actually reaches their sky)
  const reachMargin = effKp - neededKp;
  let reachFactor = 1;
  if (neededKp > 1.5 && (curOv ?? 0) < 15) {
    if (reachMargin < 0) {
      reachFactor = Math.max(0.05, Math.pow(Math.max(0, 1 + reachMargin / 1.8), 2.2) * 0.45);
    } else if (reachMargin < 1.5) {
      reachFactor = 0.45 + 0.55 * (reachMargin / 1.5);
    }
  }

  let swAdj;
  if (newell !== null && Number.isFinite(newell)) {
    swAdj = Math.max(-4, Math.min(36, (newell - 1500) / 215));
  } else {
    const bzAdj = Math.max(-4, Math.min(26, -bzVal * 3.0));
    const southWeight = Math.max(0, Math.min(1, (-bzVal + 1) / 4));
    const spAdj = Math.max(0, Math.min(14, (spdVal - 380) / 22)) * (0.2 + 0.8 * southWeight);
    swAdj = bzAdj + spAdj;
  }
  const scaledSwAdj = swAdj > 0 ? swAdj * reachFactor : swAdj;
  // 60-min magnetotail preconditioning boost (sustained southward IMF loads substorm energy even across brief Bz wobbles)
  const precondAdj = (preconditionedNewell60 !== null && Number.isFinite(preconditionedNewell60) && preconditionedNewell60 >= 3200 && effMagForOval >= 54)
    ? Math.min(10, (preconditionedNewell60 - 3200) / 700) * reachFactor
    : 0;
  const substormAdj = Math.max(0, Math.min(18, (subJump - 10) * 0.75)) * reachFactor;
  const pdynAdj = Math.max(0, Math.min(12, Math.max((pVal - 4.5) * 2.0, (pJump - 2.2) * 2.5))) * reachFactor;
  const mltFactor = (mlt !== null && Number.isFinite(mlt)) ? (1 + 0.07 * Math.cos((mlt - 0.5) * Math.PI / 12)) : 1;
  const auroraScore = Math.max(2, Math.min(100, Math.round((baseAur + scaledSwAdj + precondAdj + substormAdj + pdynAdj) * mltFactor)));

  // Intensity-aware twilight & lunar attenuation (IBC III/IV storms cut through twilight & moonlight!)
  const isTooBright = baseTooBright;
  const twilightFactor = isTooBright ? 0 : Math.pow(rawTw, auroraScore >= 75 ? 0.58 : 0.85);
  const moonWeight = 0.45 * Math.max(0.25, 1 - Math.max(0, auroraScore - 60) / 60);
  const darkFactor = twilightFactor * ((1 - moonWeight) + moonWeight * moonDarkFactor);

  // Soften cloud exponent slightly during strong storms with broken gaps (15-35% clear sky)
  const cloudExp = (auroraScore >= 80 && skyScore >= 15 && skyScore <= 38) ? 0.72 : 0.85;
  let total = 0;
  if (!isTooBright) {
    const skyFactor = Math.pow(skyScore / 100, cloudExp);
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

  return {
    total, skyScore, auroraScore, darkScore, isTooBright, twilightFactor: +rawTw.toFixed(2),
    effKp: +effKp.toFixed(1), magLat: Math.round(absMag), neededKp, outOfZone: null, grade, color
  };
}

// ====== Upstream Space-Weather & Weather Parsers ======

export function parseMagSeries(rows, limit = 180) {
  if (!Array.isArray(rows)) return [];
  const active = [];
  for (const r of rows) {
    if (!r || r.active !== true) continue;
    if (typeof r.bz_gsm !== 'number' || !Number.isFinite(r.bz_gsm) || Math.abs(r.bz_gsm) > 200) continue;
    const by = typeof r.by_gsm === 'number' && Number.isFinite(r.by_gsm) && Math.abs(r.by_gsm) <= 200 ? r.by_gsm : 0;
    const bt = typeof r.bt === 'number' && Number.isFinite(r.bt) && r.bt >= 0 && r.bt <= 300 ? r.bt : null;
    active.push({ time_tag: String(r.time_tag), bz: r.bz_gsm, by, bt });
  }
  active.sort((a, b) => a.time_tag.localeCompare(b.time_tag));
  return active.slice(-limit);
}

export function parseWindSeries(rows, limit = 180) {
  if (!Array.isArray(rows)) return [];
  const active = [];
  for (const r of rows) {
    if (!r || r.active !== true) continue;
    if (typeof r.proton_speed !== 'number' || !Number.isFinite(r.proton_speed) || r.proton_speed <= 100 || r.proton_speed > 3000) continue;
    const density = (typeof r.proton_density === 'number' && Number.isFinite(r.proton_density) && r.proton_density >= 0 && r.proton_density <= 500) ? r.proton_density : null;
    active.push({ time_tag: String(r.time_tag), speed: r.proton_speed, density });
  }
  active.sort((a, b) => a.time_tag.localeCompare(b.time_tag));
  return active.slice(-limit);
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
    const kp = isArr
      ? parseFloat(r[1])
      : (typeof r.kp === 'number' ? r.kp : (typeof r.Kp === 'number' ? r.Kp : parseFloat(r.kp)));
    const tag = String(isArr ? (r[0] || '') : (r.time_tag || '')).trim();
    const ts = parseUtcMs(tag);
    if (!Number.isFinite(kp) || !Number.isFinite(ts)) continue;
    out.push({ ts, kp, observed: isArr ? (r[2] || '') : (r.observed || '') });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

export function lookupForecastKp(fcList, targetDate, fallbackKp = 0) {
  if (!Array.isArray(fcList) || !fcList.length) return fallbackKp ?? 0;
  const targetMs = (targetDate instanceof Date ? targetDate.getTime() : Number(targetDate));
  let best = null, bestDist = Infinity;
  for (const item of fcList) {
    const d = Math.abs(item.ts - targetMs);
    if (d < bestDist) { bestDist = d; best = item.kp; }
  }
  return best !== null && bestDist <= 6 * 3600000 ? best : (fallbackKp ?? 0);
}

export function parseLatestKp(rows) {
  if (!Array.isArray(rows)) return null;
  const items = [];
  let is1m = false;
  for (const r of rows) {
    if (!r) continue;
    if (typeof r.estimated_kp === 'number') is1m = true;
    const val = (typeof r.estimated_kp === 'number') ? r.estimated_kp
      : (typeof r.Kp === 'number') ? r.Kp
      : (typeof r.kp_index === 'number') ? r.kp_index
      : (Array.isArray(r) ? parseFloat(r[1]) : NaN);
    const tag = r.time_tag || (Array.isArray(r) ? r[0] : '');
    if (!Number.isFinite(val) || !tag) continue;
    items.push({ kp: val, time_tag: String(tag) });
  }
  if (!items.length) return null;
  items.sort((a, b) => a.time_tag.localeCompare(b.time_tag));
  // NOAA 1-minute Kp appends 1-4 provisional 0Z rows before settling; only return 0.00 if 6+ consecutive minutes are 0
  if (is1m && items.length >= 2 && items[items.length - 1].kp === 0) {
    const lookback = items.slice(Math.max(0, items.length - 6), -1);
    for (let i = lookback.length - 1; i >= 0; i--) {
      if (lookback[i].kp > 0) return lookback[i];
    }
  }
  return items[items.length - 1];
}

export function lookupOvationProb(ovationJson, lat, lon) {
  if (!ovationJson || !Array.isArray(ovationJson.coordinates)) return null;
  const targetLon = ((Math.round(lon) % 360) + 360) % 360;
  const targetLat = Math.max(-90, Math.min(90, Math.round(lat)));
  let bestVal = null, bestDist = Infinity;
  for (const pt of ovationJson.coordinates) {
    if (!Array.isArray(pt) || pt.length < 3) continue;
    const dLat = Math.abs(pt[1] - targetLat);
    if (dLat > 1) continue;
    let dLon = Math.abs(pt[0] - targetLon);
    if (dLon > 180) dLon = 360 - dLon;
    if (dLon > 1) continue;
    const d = dLat + dLon;
    if (d < bestDist) { bestDist = d; bestVal = Number(pt[2]); if (d === 0) break; }
  }
  return Number.isFinite(bestVal) ? bestVal : null;
}

export function parseHemiPower(txt, lat = 69.97) {
  if (typeof txt !== 'string' || !txt.trim()) return null;
  const lines = txt.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;
    const north = parseFloat(parts[2]), south = parseFloat(parts[3]);
    if (!Number.isFinite(north) || !Number.isFinite(south)) continue;
    return { obsTime: parts[0], fcTime: parts[1], north, south, gw: lat >= 0 ? north : south };
  }
  return null;
}

/** GOES magnetometer substorm onset detector using timestamp-bounded 25-min window & glitch-resistant baseline */
export function parseGoesSubstorm(rows) {
  if (!Array.isArray(rows) || rows.length < 5) return null;
  const clean = [];
  for (const r of rows) {
    if (!r || r.arcjet_flag === true) continue;
    if (typeof r.Hp !== 'number' || !Number.isFinite(r.Hp)) continue;
    clean.push({ time_tag: String(r.time_tag || ''), ts: parseUtcMs(r.time_tag), hp: r.Hp });
  }
  if (clean.length < 5) return null;
  clean.sort((a, b) => a.time_tag.localeCompare(b.time_tag));
  const latest = clean[clean.length - 1];
  const win = Number.isFinite(latest.ts)
    ? clean.filter(x => Number.isFinite(x.ts) && x.ts >= latest.ts - 26 * 60000)
    : clean.slice(-26);
  const sortedHp = win.map(x => x.hp).sort((a, b) => a - b);
  const baseHp = sortedHp.length >= 6 ? sortedHp[1] : sortedHp[0];
  const jumpNt = +(latest.hp - baseHp).toFixed(1);
  return { latestHp: +latest.hp.toFixed(1), jumpNt, active: jumpNt >= 15, time_tag: latest.time_tag };
}

export function parseNoaaGeomagneticScales(json) {
  if (!json || typeof json !== 'object') return null;
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
  return {
    currentScale, currentText, maxForecastScale, peakDate, peakText, days,
    active: currentScale >= 1 || maxForecastScale >= 1
  };
}

/** MET Norway Locationforecast 2.0 12h parser (with total-cloud cap to prevent +20% random-overlap inflation) */
export function parseMetNorwayHourly12(metJson, lat, lon, timeZone, nowDate) {
  const series = metJson?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) return [];
  const nowMs = (nowDate || new Date()).getTime();
  let idx = series.findIndex(item => Date.parse(item.time) > nowMs - 3600000);
  if (idx < 0) idx = 0;
  const out = [];
  for (let i = idx; i < Math.min(idx + 12, series.length); i++) {
    const item = series[i];
    const det = item?.data?.instant?.details || {};
    const dt = new Date(item.time);
    const midDt = new Date(dt.getTime() + 1800000);
    const sunAlt = computeSolarElevation(midDt, lat, lon);
    const isTooBright = sunAlt >= -4;
    const fogVal = Number.isFinite(det.fog_area_fraction) ? det.fog_area_fraction : 0;
    const totCap = Number.isFinite(det.cloud_area_fraction) ? Math.max(det.cloud_area_fraction, fogVal) : null;
    const effCloud = computeEffectiveCloud(
      det.cloud_area_fraction_low ?? 0,
      det.cloud_area_fraction_medium ?? 0,
      det.cloud_area_fraction_high ?? 0,
      fogVal,
      totCap
    );
    const pr = Number(item?.data?.next_1_hours?.details?.precipitation_amount ?? 0);
    const tp = Number(det.air_temperature ?? 0);
    const windMs = Number(det.wind_speed ?? 0);
    const windChill = computeWindChill(tp, windMs);
    const z = getZoneParts(dt, timeZone);
    const txt = isTooBright
      ? (sunAlt >= 0 ? '☀️ 白天' : '🌅 晨昏光')
      : (pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (effCloud <= 25 ? '🌟 晴' : effCloud <= 65 ? '⛅ 縫' : '☁️ 陰'));
    out.push({ time: `${z.hourStr}:${z.minStr}`, dtMs: midDt.getTime(), block: effCloud, clear: 100 - effCloud, txt, temp: tp, windMs, windChill, isDay: isTooBright, sunAlt });
  }
  return out;
}

export function parseMetNorwayMultiDay(metJson, lat, lon, timeZone, nowDate) {
  const series = metJson?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) return [];
  const nowMs = (nowDate || new Date()).getTime();
  const maxMs = nowMs + 84 * 3600000;
  const out = [];
  for (const item of series) {
    const ts = Date.parse(item?.time);
    if (!Number.isFinite(ts) || ts < nowMs - 3600000 || ts > maxMs) continue;
    const det = item?.data?.instant?.details || {};
    const fogVal = Number.isFinite(det.fog_area_fraction) ? det.fog_area_fraction : 0;
    const totCap = Number.isFinite(det.cloud_area_fraction) ? Math.max(det.cloud_area_fraction, fogVal) : null;
    const hasLayers = Number.isFinite(det.cloud_area_fraction_low) || Number.isFinite(det.cloud_area_fraction_medium);
    const effCloud = hasLayers
      ? computeEffectiveCloud(det.cloud_area_fraction_low ?? 0, det.cloud_area_fraction_medium ?? 0, det.cloud_area_fraction_high ?? 0, fogVal, totCap)
      : Math.max(0, Math.min(100, Math.round(Number(det.cloud_area_fraction ?? 100))));
    const midDt = new Date(ts + 1800000);
    const sunAlt = computeSolarElevation(midDt, lat, lon);
    const z = getZoneParts(new Date(ts), timeZone);
    out.push({ dtMs: midDt.getTime(), time: `${z.hourStr}:${z.minStr}`, clear: 100 - effCloud, block: effCloud, sunAlt, isDay: sunAlt >= -4 });
  }
  return out;
}

/**
 * Open-Meteo 12h parser supporting BOTH DST-proof Unix timestamps (timeformat=unixtime)
 * AND ISO local strings with utc_offset_seconds (backwards-compatible).
 */
export function parseOpenMeteoHourly12(hourly, lat, lon, timeZone, nowDate, utcOffsetSec = null) {
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) return [];
  const nowMs = (nowDate || new Date()).getTime();
  const isUnix = typeof hourly.time[0] === 'number';
  let idx;
  if (isUnix) {
    idx = hourly.time.findIndex(t => (t * 1000) > nowMs - 3600000);
  } else {
    const zNow = getZoneParts(nowDate || new Date(), timeZone);
    idx = hourly.time.findIndex(t => t >= zNow.isoHour);
  }
  if (idx < 0) idx = 0;

  const out = [];
  for (let i = idx; i < Math.min(idx + 12, hourly.time.length); i++) {
    const low = Number(hourly.cloud_cover_low?.[i] ?? 0);
    const mid = Number(hourly.cloud_cover_mid?.[i] ?? 0);
    const high = Number(hourly.cloud_cover_high?.[i] ?? 0);
    const tot = hourly.cloud_cover ? Number(hourly.cloud_cover[i]) : null;
    const effCloud = computeEffectiveCloud(low, mid, high, 0, tot);
    const pr = Number(hourly.precipitation?.[i] ?? 0);
    const tp = Number(hourly.temperature_2m?.[i] ?? 0);
    const windMs = Number(hourly.wind_speed_10m?.[i] ?? 0) / 3.6;
    const windChill = computeWindChill(tp, windMs);

    let startMs;
    if (isUnix) {
      startMs = hourly.time[i] * 1000;
    } else if (Number.isFinite(utcOffsetSec)) {
      const parsedLocalAsUtc = Date.parse(hourly.time[i] + ':00Z');
      startMs = Number.isFinite(parsedLocalAsUtc)
        ? (parsedLocalAsUtc - utcOffsetSec * 1000)
        : (Math.floor(nowMs / 3600000) * 3600000 + (i - idx) * 3600000);
    } else {
      startMs = Math.floor(nowMs / 3600000) * 3600000 + (i - idx) * 3600000;
    }
    const midUtc = new Date(startMs + 1800000);
    const sunAlt = computeSolarElevation(midUtc, lat, lon);
    const isTooBright = sunAlt >= -4;
    const z = getZoneParts(new Date(startMs), timeZone);
    const timeStr = isUnix ? `${z.hourStr}:${z.minStr}` : String(hourly.time[i]).slice(11, 16);
    const txt = isTooBright
      ? (sunAlt >= 0 ? '☀️ 白天' : '🌅 晨昏光')
      : (pr >= 0.1 ? (tp <= 0 ? '❄️ 雪' : '🌧️ 雨雪') : (effCloud <= 25 ? '🌟 晴' : effCloud <= 65 ? '⛅ 縫' : '☁️ 陰'));
    out.push({ time: timeStr, dtMs: midUtc.getTime(), block: effCloud, clear: 100 - effCloud, txt, temp: tp, windMs, windChill, isDay: isTooBright, sunAlt });
  }
  return out;
}

export function parseOpenMeteoMultiDay(hourly, lat, lon, timeZone, nowDate, utcOffsetSec = null) {
  if (!hourly || !Array.isArray(hourly.time) || !hourly.time.length) return [];
  const nowMs = (nowDate || new Date()).getTime();
  const maxMs = nowMs + 84 * 3600000;
  const isUnix = typeof hourly.time[0] === 'number';
  const zNow = isUnix ? null : getZoneParts(nowDate || new Date(), timeZone);
  const idx0 = isUnix ? 0 : Math.max(0, hourly.time.findIndex(t => t >= zNow.isoHour));
  const out = [];
  for (let i = 0; i < hourly.time.length; i++) {
    let startMs;
    if (isUnix) {
      startMs = hourly.time[i] * 1000;
    } else if (Number.isFinite(utcOffsetSec)) {
      const parsed = Date.parse(hourly.time[i] + ':00Z');
      if (!Number.isFinite(parsed)) continue;
      startMs = parsed - utcOffsetSec * 1000;
    } else {
      if (hourly.time[i] < zNow.isoHour) continue;
      startMs = Math.floor(nowMs / 3600000) * 3600000 + (i - idx0) * 3600000;
    }
    const midMs = startMs + 1800000;
    if (midMs < nowMs - 3600000 || midMs > maxMs) continue;
    const low = Number(hourly.cloud_cover_low?.[i] ?? 0);
    const mid = Number(hourly.cloud_cover_mid?.[i] ?? 0);
    const high = Number(hourly.cloud_cover_high?.[i] ?? 0);
    const tot = hourly.cloud_cover ? Number(hourly.cloud_cover[i]) : null;
    const effCloud = computeEffectiveCloud(low, mid, high, 0, tot);
    const sunAlt = computeSolarElevation(new Date(midMs), lat, lon);
    const z = getZoneParts(new Date(startMs), timeZone);
    out.push({ dtMs: midMs, time: isUnix ? `${z.hourStr}:${z.minStr}` : String(hourly.time[i]).slice(11, 16), clear: 100 - effCloud, block: effCloud, sunAlt, isDay: sunAlt >= -4 });
  }
  return out;
}

/**
 * Dual-model cloud consensus check (MET Norway MEPS 2.5km vs Open-Meteo ECMWF/GFS).
 * Compares 3-hour average effective cloud obstruction so users are warned when models strongly diverge (>=35%).
 */
export function evaluateCloudConsensus(metHrs, omHrs) {
  if (!Array.isArray(metHrs) || !metHrs.length || !Array.isArray(omHrs) || !omHrs.length) return null;
  const n = Math.min(3, metHrs.length, omHrs.length);
  const metAvg3h = Math.round(metHrs.slice(0, n).reduce((s, h) => s + Number(h.block ?? 0), 0) / n);
  const omAvg3h = Math.round(omHrs.slice(0, n).reduce((s, h) => s + Number(h.block ?? 0), 0) / n);
  const diffPct = Math.abs(metAvg3h - omAvg3h);
  const level = diffPct >= 35 ? 'low' : (diffPct >= 20 ? 'medium' : 'high');
  return { metAvg3h, omAvg3h, diffPct, level };
}

// ====== Hourly Forecast, 3-Night Outlook, Verdicts & Compass Summaries ======

export function scoreHourlyForecast12(hrs, {
  lat = 69.97, lon = 23.27, kpForecast = [], fallbackKp = 0, ovation = null,
  hpiGw = null, bz = 0, speed = 400, newell = null, substormJumpNt = 0,
  pdyn = null, shockJumpNpa = 0
}) {
  if (!Array.isArray(hrs) || !hrs.length) return { hours: [], bestAurora: null };
  const absMag = Math.abs(computeGeomagneticLat(lat, lon));
  const hours = hrs.map((h, i) => {
    const dt = new Date(h.dtMs || (Date.now() + i * 3600000));
    const moonH = getMoonState(dt, lat, lon);
    const mltH = computeMLT(dt, lat, lon);
    const kpFc = i === 0 && Number.isFinite(fallbackKp) ? fallbackKp : lookupForecastKp(kpForecast, dt, fallbackKp);
    // Live telemetry decays smoothly into NOAA 72h Kp forecast beyond +2h
    const liveW = i === 0 ? 1 : (i === 1 ? 0.55 : (i === 2 ? 0.25 : 0));
    const bzH = liveW > 0 && Number.isFinite(bz) ? bz * liveW : 0;
    const spdH = liveW > 0 && Number.isFinite(speed) ? Math.round(speed * liveW + 400 * (1 - liveW)) : 400;
    const nwH = liveW > 0 && Number.isFinite(newell) ? Math.round(newell * liveW + 1500 * (1 - liveW)) : null;
    const hpiH = liveW > 0 && Number.isFinite(hpiGw) ? Math.round(hpiGw * liveW + 15 * (1 - liveW)) : null;
    const pdynH = liveW > 0 && Number.isFinite(pdyn) ? +(pdyn * liveW + 2.0 * (1 - liveW)).toFixed(2) : null;
    const mltShiftH = 2.0 * Math.cos((mltH - 0.5) * Math.PI / 12);
    const neededKpH = requiredKpForMagLat(absMag + mltShiftH);
    const estOvFc = neededKpH > 1.5
      ? Math.max(0, Math.min(95, (kpFc - neededKpH + 1.5) * 18))
      : Math.min(95, kpFc * 15);
    const ovH = liveW > 0 && ovation !== null ? Math.round(ovation * liveW + estOvFc * (1 - liveW)) : null;

    const scH = computeAuroraScore({
      lat, lon, cloudNow: h.block, sunAlt: h.sunAlt,
      bz: bzH, speed: spdH, kp: kpFc, ovation: ovH, hpiGw: hpiH, newell: nwH,
      substormJumpNt: liveW > 0 ? Math.round((substormJumpNt || 0) * liveW) : 0,
      pdyn: pdynH, shockJumpNpa: liveW > 0 ? +((shockJumpNpa || 0) * liveW).toFixed(2) : 0,
      mlt: mltH, effMoonPct: moonH.effMoonPct
    });
    return {
      ...h, score: scH.total, kpFc: +Number(kpFc).toFixed(2),
      moonUp: moonH.up, moonPct: moonH.pct, moonAlt: moonH.altDeg,
      mlt: +mltH.toFixed(1), outOfZone: scH.outOfZone
    };
  });
  const dark = hours.filter(h => !h.isDay);
  let bestAurora = null;
  for (const h of dark) {
    if (!bestAurora || h.score > bestAurora.score || (h.score === bestAurora.score && h.block < bestAurora.block)) {
      bestAurora = h;
    }
  }
  return { hours, bestAurora };
}

export function findBestDarkWindow(hrs) {
  if (!hrs || !hrs.length) return null;
  const dark = hrs.filter(h => !h.isDay);
  if (!dark.length) return null;
  let best = dark[0];
  for (const h of dark) if (h.block < best.block) best = h;
  return best;
}

export function summarize3NightOutlook({
  cloudPoints = [], kpForecast = [], currentKp = null,
  lat = 69.97, lon = 23.27, timeZone = 'UTC', nowDate = new Date(), lang
}) {
  const en = isEn(lang);
  const nowMs = nowDate.getTime();
  const zNow = getZoneParts(nowDate, timeZone);
  const nowHour = parseInt(zNow.hourStr, 10) || 0;
  const startNightIso = nowHour < 8
    ? getZoneParts(new Date(nowMs - 12 * 3600000), timeZone).dateStr
    : zNow.dateStr;
  const addDays = (iso, d) => {
    const [y, m, day] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, day + d)).toISOString().slice(0, 10);
  };
  const nightKeyOf = (ms) => getZoneParts(new Date(ms - 12 * 3600000), timeZone).dateStr;
  const absMag = Math.abs(computeGeomagneticLat(lat, lon));
  const neededKpMidnight = requiredKpForMagLat(absMag + 2.0);
  const labelsZh = ['今晚', '明晚', '後晚'];
  const labelsEn = ['Tonight', 'Tomorrow', '+2 Nights'];

  return [0, 1, 2].map(offset => {
    const key = addDays(startNightIso, offset);
    const shortDate = key.slice(5).replace('-', '/');
    const label = `${en ? labelsEn[offset] : labelsZh[offset]} ${shortDate}`;
    const pts = cloudPoints.filter(p => nightKeyOf(p.dtMs) === key);
    const darkPts = pts.filter(p => !p.isDay);
    const bestClear = darkPts.length ? Math.max(...darkPts.map(p => p.clear)) : null;

    const kpOnNight = kpForecast.filter(k => nightKeyOf(k.ts) === key && k.ts >= nowMs - 3 * 3600000);
    const kpVals = kpOnNight.map(k => k.kp);
    if (offset === 0 && Number.isFinite(currentKp)) kpVals.push(currentKp);
    const maxKp = kpVals.length ? +Math.max(...kpVals).toFixed(1) : (Number.isFinite(currentKp) ? +currentKp.toFixed(1) : 0);
    const gScale = maxKp >= 9 ? 5 : maxKp >= 8 ? 4 : maxKp >= 7 ? 3 : maxKp >= 6 ? 2 : maxKp >= 5 ? 1 : 0;

    let tone = '', badge = '', badgeColor = 'var(--muted)';
    if (absMag < 32) {
      badge = en ? 'Low Lat' : '緯度過低'; badgeColor = '#ff8a96';
    } else if (pts.length > 0 && darkPts.length === 0) {
      badge = en ? 'Too Bright' : '天色偏亮'; badgeColor = '#66bdff';
    } else if (neededKpMidnight >= 2.5 && (maxKp + 1.8) < neededKpMidnight) {
      badge = en ? `Kp≥${neededKpMidnight}` : `需 Kp≥${neededKpMidnight}`; badgeColor = '#8ea6c4';
    } else if (bestClear === null) {
      badge = gScale >= 1 ? `G${gScale}` : (en ? 'Pending' : '待更新'); badgeColor = gScale >= 1 ? '#ffcf5c' : '#8ea6c4';
    } else {
      const aurPot = neededKpMidnight > 1.5
        ? Math.max(0, Math.min(100, (maxKp - neededKpMidnight + 1.8) * 17))
        : Math.max(15, Math.min(100, maxKp * 16 + 10));
      const nightScore = Math.round(Math.pow(bestClear / 100, 0.85) * aurPot);
      if (nightScore >= 45 || (gScale >= 1 && bestClear >= 50)) {
        tone = 'good'; badge = en ? 'Promising' : '條件佳'; badgeColor = '#34f0b0';
      } else if (nightScore >= 20 || bestClear >= 60) {
        tone = 'warn'; badge = en ? 'Watch' : '可留意'; badgeColor = '#ffcf5c';
      } else if (bestClear < 35) {
        badge = en ? 'Cloudy' : '雲偏厚'; badgeColor = '#ff8a96';
      } else {
        badge = en ? 'Quiet' : '偏弱'; badgeColor = '#66bdff';
      }
    }
    return { key, label, bestClear, maxKp, gScale, darkCount: darkPts.length, tone, badge, badgeColor };
  });
}

export function evaluateVerdict({ lat = 69.97, lon = 23.27, bestDark, kp, mlt = null, effMoonPct = 0, scoreObj, lang }) {
  const en = isEn(lang);
  const geom = computeViewingGeometry({ lat, lon, kp: Math.max(kp ?? 0, scoreObj?.effKp ?? 0), mlt, lang });
  const modeInfo = classifyViewingMode({ scoreObj, geom, effMoonPct, lang });
  const lookCueZh = geom.mode !== 'below' ? `${geom.shortText}。` : `建議朝${geom.direction}開闊處觀察。`;
  const lookCueEn = geom.mode !== 'below' ? `Look: ${geom.shortText}.` : `Face ${geom.direction} with an open horizon.`;
  const visSuffixZh = modeInfo.text ? ` ${modeInfo.text}。` : '';
  const visSuffixEn = modeInfo.text ? ` ${modeInfo.text}.` : '';

  if (scoreObj?.outOfZone === 'low-lat') {
    return en
      ? { kicker: 'Low Latitude', title: 'Outside the auroral zone', lead: `Geomagnetic latitude here is ${scoreObj.magLat}° (auroras primarily occur above 60°). Tap the location name above to switch.` }
      : { kicker: '緯度過低', title: '此地不在極光帶內，請切換高緯度地區', lead: `地磁緯度 ${scoreObj.magLat}°（極光主要出現在 60° 以上），點上方地名可切換北歐或全球極光熱點。` };
  }
  if (scoreObj?.outOfZone === 'need-storm') {
    const isNorth = lat >= 0;
    return en
      ? { kicker: isNorth ? 'Oval Further North' : 'Oval Further South', title: isNorth ? 'Auroral oval is currently further north' : 'Auroral oval is currently further south', lead: `At ${scoreObj.magLat}° mag latitude, stronger activity (Kp ≥ ${scoreObj.neededKp}) is usually needed. Current Kp is ${kp !== null ? kp.toFixed(2) : '--'}.` }
      : { kicker: isNorth ? '極光帶偏北' : '極光帶偏南', title: isNorth ? '目前極光帶集中在更北邊高緯度' : '目前極光帶集中在更南邊高緯度', lead: `此地（地磁 ${scoreObj.magLat}°）通常需較強地磁活動 Kp ≥ ${scoreObj.neededKp} 才有機會觀測，目前全球 Kp 為 ${kp !== null ? kp.toFixed(2) : '--'}。` };
  }
  if (scoreObj?.isTooBright) {
    return en
      ? { kicker: 'Too Bright', title: 'Sky is too bright for aurora viewing', lead: bestDark ? `Best dark-sky window tonight: ${bestDark.time} (${bestDark.clear}% clear). Check back after dusk.` : 'Wait until twilight ends (sun below -4°) to check again.' }
      : { kicker: '天色過亮', title: '目前天色過亮，無法觀測極光', lead: bestDark ? `天黑後最佳時段在 ${bestDark.time}（晴空率 ${bestDark.clear}%），日落後再查看。` : '請等暮光結束（太陽仰角低於 -4°）後再觀察。' };
  }
  if (scoreObj.total >= 65) {
    return en
      ? { kicker: 'Prime Conditions', title: 'Clear skies and active aurora — head out now', lead: `${lookCueEn}${visSuffixEn}` }
      : { kicker: '極佳條件', title: '晴空且極光活躍，現在最適合出門！', lead: `${lookCueZh}${visSuffixZh}` };
  }
  if (scoreObj.total >= 40) {
    return en
      ? { kicker: 'Good Conditions', title: 'Favorable viewing conditions — worth heading out', lead: `${lookCueEn}${visSuffixEn}` }
      : { kicker: '適合觀測', title: '條件不錯，建議穿暖前往暗處觀測', lead: `${lookCueZh}${visSuffixZh}` };
  }
  if (scoreObj.total >= 18) {
    return en
      ? {
          kicker: 'Fair Chance',
          title: scoreObj.skyScore >= 55 ? 'Clear skies — worth keeping watch' : 'Cloud gaps opening — watch the sky',
          lead: `${lookCueEn}${visSuffixEn}`
        }
      : {
          kicker: '有機會看見',
          title: scoreObj.skyScore >= 55 ? '天空偏晴，可留意極光動態' : '雲層出現空檔，可留意天空變化',
          lead: `${lookCueZh}${visSuffixZh}`
        };
  }
  if (scoreObj.grade === '🌅 暮光漸暗') {
    return en
      ? { kicker: 'Twilight · Active', title: 'Strong aurora active — visibility rising as sky darkens', lead: `Geomagnetic activity is strong now; watch ${geom.direction} as twilight deepens.${visSuffixEn}` }
      : { kicker: '暮光漸暗・極光活躍', title: '極光能量強勁，天色全暗後有望立即現身', lead: `目前處於暮光過渡期，建議提前朝 ${geom.direction} 就位等候。${visSuffixZh}` };
  }
  if (scoreObj.grade === '⚡ 雲縫極光') {
    return en
      ? { kicker: 'Active · Cloud Gaps', title: 'Strong aurora — watch cloud openings or drive to clear sky', lead: `Bright aurora can pierce cloud breaks toward ${geom.direction}. Check Sky Radar for clearer roads.` }
      : { kicker: '極光活躍・留意雲縫', title: '極光能量強勁，雲縫間有機會閃現綠光', lead: `可留意 ${geom.direction} 雲隙或開啟「晴空雷達」尋找附近晴朗路段。` };
  }
  if (scoreObj.auroraScore >= 55 && scoreObj.skyScore < 35) {
    return en
      ? { kicker: 'Aurora Active', title: 'Strong aurora above, blocked by cloud cover', lead: 'Solar wind is active — open Sky Radar or Live Map to look for nearby clear skies.' }
      : { kicker: '極光活躍但雲厚', title: '極光能量充足，但目前受厚雲遮蔽', lead: '太陽風活躍中，可點下方「晴空雷達」或「動態雲圖」尋找周邊晴朗區域。' };
  }
  if (scoreObj.skyScore >= 55) {
    return en
      ? { kicker: 'Clear · Quiet', title: 'Clear dark skies, geomagnetic activity is quiet', lead: `Good visibility toward ${geom.direction}. Turn on Alerts to catch sudden bursts.${visSuffixEn}` }
      : { kicker: '晴朗但極光弱', title: '夜空晴朗，目前地磁活動偏弱', lead: `朝 ${geom.direction} 能見度良好，可開啟右上角提醒待活動增強。${visSuffixZh}` };
  }
  return en
    ? {
        kicker: 'Too Cloudy',
        title: 'Heavy cloud cover — low chance right now',
        lead: bestDark && bestDark.block <= 45
          ? `Clouds are expected to thin around ${bestDark.time} (${bestDark.clear}% clear). Check back later.`
          : 'Dense clouds across the sky right now — check Sky Radar or recheck later.'
      }
    : {
        kicker: '雲層過厚',
        title: '目前雲層偏厚，暫時不易觀測',
        lead: bestDark && bestDark.block <= 45
          ? `預計 ${bestDark.time} 雲層較有機會散開（晴空率 ${bestDark.clear}%），屆時再觀察。`
          : '目前雲量偏高，建議先休息或透過「晴空雷達」查看周邊有沒有晴空空檔。'
      };
}

export function summarizeEnergyTrend(series, speed, langOrBal, maybeLang) {
  const hasBal = langOrBal && typeof langOrBal === 'object';
  const balOpt = hasBal ? langOrBal : null;
  const en = isEn(hasBal ? maybeLang : langOrBal);
  if (!series || !series.length) {
    return {
      good: false,
      text: en ? 'Temporarily unable to read solar wind satellite data — retrying soon.' : '暫時無法讀取太陽風衛星資料，稍後自動重試。',
      raw: '', etaMin: 45
    };
  }
  const last = series[series.length - 1];
  const recent30 = series.slice(-30);
  const minBzRecent = Math.min(...recent30.map(s => s.bz));
  const etaMin = balOpt?.etaMin ?? computeL1EtaMin(speed);
  const spdTxt = Number.isFinite(speed) ? ` · ${Math.round(speed)} km/s` : '';
  const raw = `Bz ${last.bz >= 0 ? '+' : ''}${last.bz.toFixed(1)} nT${spdTxt}`;

  const energies = (balOpt && Array.isArray(balOpt.energy120) && balOpt.energy120.length === series.length)
    ? balOpt.energy120
    : series.map(s => bzToEnergy(s.bz, speed));
  const lastE = energies[energies.length - 1];
  const maxE30 = Math.max(...energies.slice(-30));

  if (lastE >= 62 || last.bz <= -4) {
    return { good: true, text: en ? `Solar wind entered the Active zone — aurora may brighten in ~${etaMin} min.` : `太陽風進入「活躍區」，預計約 ${etaMin} 分鐘後有機會觸發極光增強。`, raw, etaMin };
  }
  if (maxE30 >= 62 || minBzRecent <= -4) {
    return { good: true, text: en ? `Energy surged in the past 30 min — keep watch over the next ~${etaMin} min.` : `過去 30 分鐘曾出現能量高峰，接下來約 ${etaMin} 分鐘值得留意。`, raw, etaMin };
  }
  if (lastE >= 25 || last.bz < -0.5) {
    return { good: false, text: en ? 'Solar wind energy is rising gently — watch if it enters the Active zone.' : '太陽風能量正在增強，可留意是否進一步進入綠色活躍區。', raw, etaMin };
  }
  return { good: false, text: en ? 'Solar wind is currently quiet — turn on Alerts to catch sudden bursts.' : '目前太陽風偏平靜，可開啟通知提醒，有活動增強再出門觀測。', raw, etaMin };
}

export function summarizeCompass(dirResults, lang) {
  if (!dirResults || dirResults.length < 2) return null;
  const en = isEn(lang);
  const here = dirResults[0];
  const landOthers = dirResults.slice(1).filter(d => !d.isOcean).sort((a, b) => a.avg3h - b.avg3h);
  if (here.avg3h <= 35) {
    return { bestKey: 'here', good: true, text: en ? `Clear skies right here for the next 3h (avg cloud ${here.avg3h}%) — no need to drive.` : `原地未來 3 小時偏晴（平均雲量僅 ${here.avg3h}%），就近觀測即可。` };
  }
  if (!landOthers.length) {
    return { bestKey: null, good: false, text: en ? 'Surrounding points are open sea. Stay local or check Live Map for inland roads.' : '周邊多為海面，建議留在當地或透過「動態雲圖」查看內陸路線。' };
  }
  const best = landOthers[0];
  const diff = here.avg3h - best.avg3h;
  if ((diff >= 25 && best.avg3h <= 50) || (best.avg3h <= 30 && diff >= 15)) {
    return { bestKey: best.key, good: true, text: en ? `Clearer skies toward "${tDirLabel(best.label, 'en')}" (3h avg cloud ${best.avg3h}%, ${diff}% clearer than here).` : `「${best.label}」有明顯晴空空檔（3 小時平均雲量 ${best.avg3h}%，比原地少 ${diff}%）。` };
  }
  if (best.avg3h <= 50) {
    return { bestKey: null, good: false, text: en ? `Nearby routes have similar partly-cloudy skies (~${best.avg3h}% cloud) — watch locally first.` : `周邊與原地皆為局部多雲（最晴方向約 ${best.avg3h}%），差距不大，建議先原地觀察。` };
  }
  return { bestKey: null, good: false, text: en ? `Nearby land routes are also overcast (~${best.avg3h}% cloud). Better to wait locally.` : `周邊陸路目前同樣多雲（平均雲量約 ${best.avg3h}%），建議先原地等候放晴。` };
}

/** Decide whether real-time conditions warrant firing an aurora alert (including storm gaps & incoming CME) */
export function shouldTriggerAuroraAlert({ sc, goesSub, scNext, bal }) {
  if (!sc || sc.isTooBright) return { fire: false, reason: null };
  const stormGapFire = !sc.outOfZone && sc.auroraScore >= 80 && sc.skyScore >= 20;
  const substormFire = !sc.outOfZone && Boolean(goesSub?.active) && sc.skyScore >= 25;
  const incomingFire = Boolean(scNext && !scNext.outOfZone && !scNext.isTooBright && (scNext.total >= 45 || (bal?.shockActive && sc.skyScore >= 30)));
  if (!sc.outOfZone && sc.total >= 40) return { fire: true, reason: 'score' };
  if (stormGapFire) return { fire: true, reason: 'storm-gap' };
  if (substormFire) return { fire: true, reason: 'substorm' };
  if (incomingFire) return { fire: true, reason: 'incoming' };
  return { fire: false, reason: null };
}
