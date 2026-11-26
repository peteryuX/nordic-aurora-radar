/**
 * Nordic Aurora Radar — Safe LocalStorage, Preferences & Offline SWR Cache
 *
 * Isolates all browser storage I/O behind defensive try/catch wrappers,
 * enforces coordinate-keyed SWR caching (never mixing cities), cleans up
 * legacy cache keys, and reconstructs full 3-tab offline render states.
 */

import {
  matchKnownCity, hasCjkChars, getMoonState, scoreHourlyForecast12, computeDistanceKm
} from './aurora-engine.js';

export const STORAGE_KEYS = {
  POS: 'aurora_pos_v2',
  RED: 'aurora_red_v1',
  LANG: 'aurora_lang_v4',
  SWR: 'aurora_swr_v6',
  LEGACY_CACHE: 'aurora_cache_v4',
  ENLIL: 'aurora_enlil_v1',
  WATCHLIST: 'aurora_trip_v1'
};

export const SWR_MAX_LOCATIONS = 5;
export const WATCHLIST_MAX = 5;
export const SWR_MAX_AGE_MS = 6 * 3600 * 1000;
export const ENLIL_TTL_MS = 6 * 3600 * 1000;

function getStorage(storeOpt) {
  if (storeOpt) return storeOpt;
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function safeGet(key, storeOpt) {
  try { return getStorage(storeOpt)?.getItem(key) ?? null; } catch { return null; }
}

export function safeSet(key, value, storeOpt) {
  try { getStorage(storeOpt)?.setItem(key, value); return true; } catch { return false; }
}

export function safeRemove(key, storeOpt) {
  try { getStorage(storeOpt)?.removeItem(key); return true; } catch { return false; }
}

export function safeReadJson(key, storeOpt) {
  const raw = safeGet(key, storeOpt);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch {
    safeRemove(key, storeOpt);
    return null;
  }
}

export function sanitizeSavedPos(sp) {
  if (!sp || typeof sp !== 'object') return null;
  if (typeof sp.lat !== 'number' || typeof sp.lon !== 'number') return null;
  if (!Number.isFinite(sp.lat) || !Number.isFinite(sp.lon) || sp.lat < -90 || sp.lat > 90 || sp.lon < -180 || sp.lon > 180) return null;
  let tz = (typeof sp.tz === 'string' && sp.tz.trim()) ? sp.tz.trim() : 'auto';
  if (tz !== 'auto') {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { tz = 'auto'; }
  }
  const matched = matchKnownCity(sp.lat, sp.lon);
  const cleanStr = s => (typeof s === 'string' ? s.replace(/[\r\n\t<>]/g, '').trim().slice(0, 60) : '');
  const fallback = `${Math.abs(sp.lat).toFixed(2)}°${sp.lat >= 0 ? 'N' : 'S'}, ${Math.abs(sp.lon).toFixed(2)}°${sp.lon >= 0 ? 'E' : 'W'}`;
  const name = matched ? matched.zh : (cleanStr(sp.name) || fallback);
  const nameEn = matched ? matched.en : (cleanStr(sp.nameEn) || (hasCjkChars(name) ? '' : name));
  const mode = (sp.mode === 'gps' || sp.mode === 'gps-err' || sp.mode === 'manual') ? sp.mode : 'manual';
  const accuracy = (typeof sp.accuracy === 'number' && Number.isFinite(sp.accuracy) && sp.accuracy >= 0) ? sp.accuracy : null;
  return { name, nameEn, lat: +sp.lat.toFixed(4), lon: +sp.lon.toFixed(4), tz, mode, accuracy };
}

export function loadSavedPos(storeOpt) {
  const parsed = safeReadJson(STORAGE_KEYS.POS, storeOpt);
  if (!parsed) return null;
  const clean = sanitizeSavedPos(parsed);
  if (!clean) safeRemove(STORAGE_KEYS.POS, storeOpt);
  return clean;
}

export function savePos(pos, storeOpt) {
  return safeSet(STORAGE_KEYS.POS, JSON.stringify(pos), storeOpt);
}

export function loadRedMode(storeOpt) {
  return safeGet(STORAGE_KEYS.RED, storeOpt) === '1';
}

export function saveRedMode(enabled, storeOpt) {
  return safeSet(STORAGE_KEYS.RED, enabled ? '1' : '0', storeOpt);
}

export function saveLangPref(lang, storeOpt) {
  return safeSet(STORAGE_KEYS.LANG, lang, storeOpt);
}

export function readCachedEnlil(nowMs = Date.now(), storeOpt) {
  const parsed = safeReadJson(STORAGE_KEYS.ENLIL, storeOpt);
  if (parsed && Number.isFinite(parsed.ts) && (nowMs - parsed.ts < ENLIL_TTL_MS) && parsed.data) {
    return parsed.data;
  }
  return null;
}

export function writeCachedEnlil(data, nowMs = Date.now(), storeOpt) {
  return safeSet(STORAGE_KEYS.ENLIL, JSON.stringify({ ts: nowMs, data }), storeOpt);
}

export function swrCoordKey(lat, lon) {
  return `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;
}

export function readSwrCacheMap(storeOpt) {
  const parsed = safeReadJson(STORAGE_KEYS.SWR, storeOpt);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    if (parsed !== null) safeRemove(STORAGE_KEYS.SWR, storeOpt);
    return {};
  }
  return parsed;
}

export function writeSwrCacheEntry(pos, entry, storeOpt) {
  const map = readSwrCacheMap(storeOpt);
  map[swrCoordKey(pos.lat, pos.lon)] = entry;
  const keys = Object.keys(map).sort((a, b) => (map[b]?.ts || 0) - (map[a]?.ts || 0));
  const trimmed = {};
  for (const key of keys.slice(0, SWR_MAX_LOCATIONS)) trimmed[key] = map[key];
  const ok = safeSet(STORAGE_KEYS.SWR, JSON.stringify(trimmed), storeOpt);
  // Remove legacy single-city key once v6 map persists cleanly (prevents double storage bloat)
  if (ok) safeRemove(STORAGE_KEYS.LEGACY_CACHE, storeOpt);
  return ok;
}

export function findMatchingOfflineCache(pos, nowMs = Date.now(), storeOpt) {
  const map = readSwrCacheMap(storeOpt);
  let best = null;
  let bestDistKm = Infinity;
  for (const entry of Object.values(map)) {
    if (!entry || typeof entry !== 'object' || !entry.score || typeof entry.score.total !== 'number') continue;
    if (!Number.isFinite(entry.ts) || nowMs - entry.ts >= SWR_MAX_AGE_MS) continue;
    if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lon)) continue;
    const distKm = computeDistanceKm(entry.lat, entry.lon, pos.lat, pos.lon);
    if (distKm <= 20 && distKm < bestDistKm) { bestDistKm = distKm; best = entry; }
  }
  if (best) return best;

  // Backward-compatible read of legacy aurora_cache_v4 ONLY when coordinates match
  const legacy = safeReadJson(STORAGE_KEYS.LEGACY_CACHE, storeOpt);
  if (legacy && legacy.score && typeof legacy.score.total === 'number'
    && Number.isFinite(legacy.ts) && nowMs - legacy.ts < SWR_MAX_AGE_MS
    && Number.isFinite(legacy.lat) && Number.isFinite(legacy.lon)
    && computeDistanceKm(legacy.lat, legacy.lon, pos.lat, pos.lon) <= 20) {
    return legacy;
  }
  return null;
}

/** Build a lightweight serializable SWR snapshot for full 3-tab offline recovery */
export function buildSwrPayload({ pos, lang, posName, snapshot, verdict, skySub, aurSub, darkSub, nowMs = Date.now() }) {
  const { bal, moon, sc, scNext, bestDark, hereHrs, dirResults, nights3, multiDayPts, kpForecast, kp, bz, speed, ovation, hpiGw, predKp1h, kyotoDst, mltNow, sunAltNow, weatherSourceLabel, usedMet, cloudConsensus } = snapshot;
  const compactMultiDay = Array.isArray(multiDayPts)
    ? multiDayPts.slice(0, 84).map(p => ({ dtMs: p.dtMs, clear: p.clear, block: p.block, isDay: p.isDay, ...(p.stepHrs > 1 ? { stepHrs: p.stepHrs } : {}) }))
    : null;
  return {
    ts: nowMs, lang, posName,
    lat: pos.lat, lon: pos.lon, tz: pos.tz,
    kp, bz, speed, ovation, hpiGw, predKp1h, kyotoDst, mlt: mltNow, sunAltNow,
    effMoonPct: moon.effMoonPct, moon, bestDark, score: sc, scNext,
    weatherSourceLabel, usedMet, cloudConsensus,
    hereHrs, dirResults, nights3, multiDayPts: compactMultiDay,
    kpForecast: Array.isArray(kpForecast) ? kpForecast.slice(0, 32) : [],
    bal: {
      etaMin: bal.etaMin, nowBz: bal.nowBz, nextBz: bal.nextBz,
      nowNewell: bal.nowNewell, nextNewell: bal.nextNewell,
      cleanLatestBz: bal.cleanLatestBz, avgNewell60: bal.avgNewell60,
      nextAvgNewell60: bal.nextAvgNewell60,
      preconditioned: bal.preconditioned, nowPdyn: bal.nowPdyn,
      nowShockJumpNpa: bal.nowShockJumpNpa, pdyn: bal.pdyn,
      shockActive: bal.shockActive, shockJumpNpa: bal.shockJumpNpa,
      energy120: [], arrivingIdx: -1
    },
    v: verdict, skySub, aurSub, darkSub
  };
}

/** Rehydrate a cached SWR payload into a full 3-tab render state when offline */
export function hydrateOfflineState(cached, pos, nowMs = Date.now()) {
  if (!cached || !Array.isArray(cached.hereHrs) || !cached.hereHrs.length) return null;
  const minsAgo = Math.max(1, Math.round((nowMs - cached.ts) / 60000));
  const cachedPos = { ...pos, tz: cached.tz || pos.tz };
  const cachedMoon = cached.moon || getMoonState(new Date(cached.ts), cachedPos.lat, cachedPos.lon);
  const cachedScored = scoreHourlyForecast12(cached.hereHrs, {
    lat: cachedPos.lat, lon: cachedPos.lon,
    kpForecast: Array.isArray(cached.kpForecast) ? cached.kpForecast : [],
    fallbackKp: cached.kp ?? 0, ovation: cached.ovation ?? null, hpiGw: cached.hpiGw ?? null,
    bz: cached.bal?.nowBz ?? cached.bz ?? null, nextBz: cached.bal?.nextBz ?? null, speed: cached.speed ?? null,
    newell: cached.bal?.nowNewell ?? null, nextNewell: cached.bal?.nextNewell ?? null,
    predKp1h: cached.predKp1h ?? null,
    preconditionedNewell60: cached.bal?.avgNewell60 ?? null,
    nextPreconditionedNewell60: cached.bal?.nextAvgNewell60 ?? cached.bal?.avgNewell60 ?? null,
    pdyn: cached.bal?.nowPdyn ?? null, nextPdyn: cached.bal?.pdyn ?? null,
    shockJumpNpa: cached.bal?.nowShockJumpNpa ?? 0, nextShockJumpNpa: cached.bal?.shockJumpNpa ?? 0,
    dst: cached.kyotoDst?.dst ?? null,
    nowOverride: Number.isFinite(cached.sunAltNow)
      ? { sunAlt: cached.sunAltNow, moon: cachedMoon, mlt: cached.mlt ?? null }
      : null
  });
  const selectedHourIdx = cached.bestDark
    ? Math.max(0, cachedScored.hours.findIndex(h => (Number.isFinite(cached.bestDark.dtMs) && Number.isFinite(h.dtMs)) ? h.dtMs === cached.bestDark.dtMs : h.time === cached.bestDark.time))
    : 0;
  return {
    scoredHours: cachedScored.hours,
    bestAurora: cachedScored.bestAurora,
    selectedHourIdx,
    renderState: {
      pos: cachedPos, magSeries: [], chartSeries: [], speed: cached.speed ?? null, bz: cached.bz ?? null,
      kp: cached.kp ?? null, ovation: cached.ovation ?? null, hpiGw: cached.hpiGw ?? null,
      goesSub: null, noaaScales: null, noaaAlert: null, kyotoDst: cached.kyotoDst ?? null,
      enlilForecast: null, predKp1h: cached.predKp1h ?? null, bal: cached.bal || { etaMin: 45, energy120: [], arrivingIdx: -1 },
      noaaOk: false, noaaLagMin: minsAgo, hereHrs: cached.hereHrs, dirResults: cached.dirResults || [],
      weatherSourceLabel: cached.weatherSourceLabel || 'Cached', usedMet: Boolean(cached.usedMet),
      cloudConsensus: cached.cloudConsensus || null, sunAltNow: cached.sunAltNow ?? -15, mltNow: cached.mlt ?? null,
      moon: cachedMoon,
      sc: cached.score, scNext: cached.scNext || cached.score,
      bestDark: cached.bestDark || cachedScored.bestAurora || null,
      nights3: cached.nights3 || [], multiDayPts: cached.multiDayPts || null,
      kpForecast: Array.isArray(cached.kpForecast) ? cached.kpForecast : [], fetchedAt: new Date(cached.ts)
    }
  };
}

/** Load sanitized Multi-City Trip Watchlist (max 5 pinned cities) */
export function loadWatchlist(storeOpt) {
  const parsed = safeReadJson(STORAGE_KEYS.WATCHLIST, storeOpt);
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const raw of parsed) {
    const clean = sanitizeSavedPos(raw);
    if (!clean) continue;
    if (out.some(c => computeDistanceKm(c.lat, c.lon, clean.lat, clean.lon) < 15)) continue;
    out.push({ name: clean.name, nameEn: clean.nameEn, lat: clean.lat, lon: clean.lon, tz: clean.tz });
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out;
}

export function saveWatchlist(list, storeOpt) {
  const safe = Array.isArray(list) ? list.slice(0, WATCHLIST_MAX) : [];
  return safeSet(STORAGE_KEYS.WATCHLIST, JSON.stringify(safe), storeOpt);
}

export function isCityInWatchlist(list, pos) {
  if (!Array.isArray(list) || !pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) return false;
  return list.some(c => computeDistanceKm(c.lat, c.lon, pos.lat, pos.lon) < 15);
}

export function toggleWatchlistCity(list, pos, storeOpt) {
  const cur = Array.isArray(list) ? [...list] : [];
  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) {
    return { list: cur, pinned: false, full: false };
  }
  const idx = cur.findIndex(c => computeDistanceKm(c.lat, c.lon, pos.lat, pos.lon) < 15);
  if (idx >= 0) {
    cur.splice(idx, 1);
    saveWatchlist(cur, storeOpt);
    return { list: cur, pinned: false, full: false };
  }
  if (cur.length >= WATCHLIST_MAX) {
    return { list: cur, pinned: false, full: true };
  }
  const clean = sanitizeSavedPos(pos);
  if (!clean) return { list: cur, pinned: false, full: false };
  cur.push({ name: clean.name, nameEn: clean.nameEn, lat: clean.lat, lon: clean.lon, tz: clean.tz });
  saveWatchlist(cur, storeOpt);
  return { list: cur, pinned: true, full: false };
}

