/**
 * Nordic Aurora Radar — Pure UI Copy Formatters (Single Source of Truth)
 *
 * Keeps all 24h peak-window and scrub-bar copy generation strictly pure and
 * DOM-free so `tests/copy-contract.mjs` can exhaustively verify every single
 * number-to-copy invariant across thousands of weather/latitude/lunar states.
 */

import { escapeHtml, computeViewingGeometry } from './aurora-engine.js';
import { TERMS, term } from './glossary.js';

function fmtNextHr(h) {
  const m = /^(\d{2}):(\d{2})/.exec(String(h?.time || ''));
  if (!m) return '';
  return `${String((Number(m[1]) + 1) % 24).padStart(2, '0')}:${m[2]}`;
}

/** Format the 24h wave card peak headline (#homeBest) */
export function formatWavePeakSummary({
  vis = [], bestInVis = null, outZoneKind = null, isOutOfZone = false,
  bestTimeLbl = '', bestIsNextNight = false, compassGood = true, en = false
} = {}) {
  const hz = vis.length || 24;
  if (isOutOfZone) {
    return outZoneKind === 'need-storm'
      ? (en ? `Activity is too weak for this latitude — needs a stronger storm over the next ${hz}h.` : `目前活動偏弱，此緯度需要更強的地磁暴才會出現極光。`)
      : (en ? `Outside the auroral zone — tap the location above to explore aurora hotspots.` : `此地不在極光帶，點上方地名可切換全球極光熱點。`);
  }
  if (!bestInVis) {
    return en ? `Sky stays too bright for the next ${hz}h — check back after dark.` : `未來 ${hz} 小時天色偏亮，天黑後再查看。`;
  }
  const bIdx = vis.findIndex(h => (Number.isFinite(bestInVis.dtMs) && Number.isFinite(h?.dtMs)) ? h.dtMs === bestInVis.dtMs : h?.time === bestInVis.time);
  const findContiguous = (pred) => {
    if (bIdx < 0 || !pred(vis[bIdx])) return null;
    let s = bIdx, e = bIdx;
    while (s > 0 && pred(vis[s - 1])) s--;
    while (e < vis.length - 1 && pred(vis[e + 1])) e++;
    const startLbl = escapeHtml(vis[s].time || '');
    const endLbl = fmtNextHr(vis[e]);
    return { s, e, len: e - s + 1, range: (startLbl && endLbl) ? `${startLbl}–${endLbl}` : '' };
  };
  const dayPrefixZh = bestIsNextNight ? '明晚' : '今晚';
  if (bestInVis.score >= 40) {
    const win = findContiguous(h => h && !h.isDay && h.score >= 40);
    const startIdx = win ? win.s : bIdx;
    const tierTagZh = bestInVis.score >= 65 ? '極佳' : '適合';
    if (startIdx >= 4) {
      if (win && win.len >= 2 && win.range) {
        return en
          ? `Trend <strong>${win.range}</strong> · peaks ~<strong>${bestTimeLbl}</strong>`
          : `${dayPrefixZh} <strong>${win.range}</strong> 預估${tierTagZh}`;
      }
      return en
        ? `Possible window ~<strong>${bestTimeLbl}</strong>`
        : `${dayPrefixZh} <strong>${bestTimeLbl}</strong> 預估有空檔`;
    }
    if (bIdx >= 4) {
      if (win && win.len >= 2 && win.range) {
        return en
          ? `Best <strong>${win.range}</strong> · peaks ~<strong>${bestTimeLbl}</strong>`
          : `${dayPrefixZh} <strong>${win.range}</strong> ${tierTagZh} · <strong>${bestTimeLbl}</strong> 最強`;
      }
      return en
        ? `Possible window ~<strong>${bestTimeLbl}</strong>`
        : `${dayPrefixZh} <strong>${bestTimeLbl}</strong> 有望出現空檔`;
    }
    if (win && win.len >= 2 && win.range) {
      return en
        ? `Best <strong>${win.range}</strong> · peaks <strong>${bestTimeLbl}</strong>`
        : `${dayPrefixZh} <strong>${win.range}</strong> ${tierTagZh} · <strong>${bestTimeLbl}</strong> 最強`;
    }
    return en
      ? `Brief window ~<strong>${bestTimeLbl}</strong>`
      : `${dayPrefixZh} <strong>${bestTimeLbl}</strong> 短暫空檔`;
  }
  if (bestInVis.score >= 18) {
    const win = findContiguous(h => h && !h.isDay && h.score >= 18);
    const startIdx = win ? win.s : bIdx;
    if (bestInVis.clear >= 60) {
      if (win && win.len >= 2 && win.range) {
        return en
          ? `Clear <strong>${win.range}</strong> · faint aurora`
          : `${dayPrefixZh} <strong>${win.range}</strong> 晴朗但極光偏弱`;
      }
      return en
        ? `Clear ~<strong>${bestTimeLbl}</strong> · faint aurora`
        : `${dayPrefixZh} <strong>${bestTimeLbl}</strong> 晴朗但極光偏弱`;
    }
    if (startIdx >= 4) {
      if (win && win.len >= 2 && win.range) {
        return en
          ? `Fair trend <strong>${win.range}</strong>`
          : `${dayPrefixZh} <strong>${win.range}</strong> 預估普通`;
      }
      return en
        ? `Thinner clouds ~<strong>${bestTimeLbl}</strong>`
        : `${dayPrefixZh} <strong>${bestTimeLbl}</strong> 雲層稍薄`;
    }
    if (win && win.len >= 2 && win.range) {
      return en
        ? `Fair <strong>${win.range}</strong> · peaks <strong>${bestTimeLbl}</strong>`
        : `${dayPrefixZh} <strong>${win.range}</strong> 普通 · <strong>${bestTimeLbl}</strong> 最佳`;
    }
    return en
      ? `Brief break ~<strong>${bestTimeLbl}</strong>`
      : `<strong>${bestTimeLbl}</strong> 雲層稍薄`;
  }
  if (bestInVis.clear >= 55) {
    return en
      ? `Clearest ~<strong>${bestTimeLbl}</strong>, quiet aurora`
      : `<strong>${bestTimeLbl}</strong> 最晴，極光偏弱`;
  }
  if (compassGood === false) {
    return en
      ? `Mostly cloudy next ${hz}h — check back later`
      : `未來 ${hz} 小時偏多雲，建議先休息稍後再看`;
  }
  return en
    ? `Mostly cloudy next ${hz}h`
    : `未來 ${hz} 小時偏多雲，可看「找晴空」`;
}

/** Format a single 24h scrub-bar readout (#hourDetail) */
export function formatHourScrubDetail({
  h, idx = 0, tStr = '', lastScore = null,
  fmtTempFn = (t) => `${Math.round(t)}°C`,
  tierWord = '', scCol = 'var(--text)', en = false
} = {}) {
  const hasTemp = Number.isFinite(Number(h?.temp));
  const tInt = hasTemp ? (Math.round(Number(h.temp)) || 0) : null;
  const wcInt = Number.isFinite(Number(h?.windChill)) ? (Math.round(Number(h.windChill)) || 0) : tInt;
  const windMs = Number.isFinite(Number(h?.windMs)) ? Math.round(Number(h.windMs)) : 0;
  const isTrend = idx >= 4;
  const isGated = Boolean(h?.isDay || h?.outOfZone);
  const darkPct = Number.isFinite(h?.darkScore)
    ? Math.round(h.darkScore)
    : (h?.isDay ? 0 : (h?.moonUp ? Math.max(20, 100 - Math.round((h.moonPct || 0) * 0.4)) : 100));
  const brightMoonUp = Boolean(h?.moonUp && (h.moonPct || 0) >= 60 && (h.moonAlt || 0) >= 10);
  const lowHorizonMoon = Boolean(brightMoonUp && (h.moonAlt || 0) < 18 && darkPct >= 90);
  const darkTxt = h?.isDay
    ? ''
    : (darkPct >= 95 && !brightMoonUp
        ? term(TERMS.darkFull, en)
        : (brightMoonUp
            ? (lowHorizonMoon
                ? (en ? `Dark ${darkPct}% · Low moon ${Math.round(h.moonPct)}%` : `暗度 ${darkPct}% · 低月 ${Math.round(h.moonPct)}%`)
                : (en ? `Dark ${darkPct}% · Moon ${Math.round(h.moonPct)}%` : `暗度 ${darkPct}% · 月 ${Math.round(h.moonPct)}%`))
            : `${term(TERMS.darkShort, en)} ${darkPct}%`));

  const kpVal = Number.isFinite(h?.kpFc) ? h.kpFc : null;
  const baseKpBadge = kpVal === null
    ? `Kp ${escapeHtml(h?.kpFc)}`
    : (isTrend
        ? (en ? `~Kp ${kpVal.toFixed(1)}` : `約 Kp ${kpVal.toFixed(1)}`)
        : `Kp ${kpVal.toFixed(1)}`);
  const hNeededKp = Number.isFinite(h?.neededKp) ? h.neededKp : lastScore?.neededKp;
  const hMagLat = Number.isFinite(h?.magLat) ? h.magLat : lastScore?.magLat;

  let kpBadge = baseKpBadge;
  if (h?.outOfZone === 'low-lat') {
    kpBadge = en ? `Mag ${hMagLat ?? '--'}° (too low)` : `地磁 ${hMagLat ?? '--'}°（緯度過低）`;
  } else if (h?.outOfZone === 'need-storm') {
    kpBadge = en
      ? `${baseKpBadge} (need ${hNeededKp ?? '--'}+ here)`
      : `${baseKpBadge}（此地需 ≥ ${hNeededKp ?? '--'}）`;
  } else if (!h?.isDay && (h?.clear ?? 0) >= 50 && (h?.score ?? 0) < 40 && Number.isFinite(h?.auroraScore) && h.auroraScore < 50) {
    if (Number.isFinite(hNeededKp) && hNeededKp >= 2.0) {
      const strongKp = Math.min(9, Math.ceil(hNeededKp + 1.2));
      kpBadge = (kpVal !== null && kpVal >= hNeededKp - 0.3)
        ? (en ? `${baseKpBadge} (low horizon, need ${strongKp}+)` : `${baseKpBadge}（此地低空微弱，需 ${strongKp}+）`)
        : (en ? `${baseKpBadge} (faint here, need ${hNeededKp}+)` : `${baseKpBadge}（此地偏弱，需 ≥ ${hNeededKp}）`);
    } else {
      kpBadge = en ? `${baseKpBadge} (quiet aurora)` : `${baseKpBadge}（極光偏弱）`;
    }
  }

  const scoreReadout = (!isTrend || isGated)
    ? `${h?.score ?? 0} ${tierWord}`
    : (en ? `~${h?.score ?? 0} ${tierWord}` : `約 ${h?.score ?? 0} ${tierWord}`);
  const clearSpread = (Number.isFinite(h?.clearLow) && Number.isFinite(h?.clearHigh))
    ? (h.clearHigh - h.clearLow)
    : 0;
  const scoreSpread = (Number.isFinite(h?.scoreLow) && Number.isFinite(h?.scoreHigh))
    ? (h.scoreHigh - h.scoreLow)
    : 0;
  const highSkyUncert = isTrend && !isGated && (clearSpread >= 40 || scoreSpread >= 35);
  const trendTagHtml = (isTrend && !isGated)
    ? (highSkyUncert
        ? ` <span class="sb-tag sb-tag-warn">${term(TERMS.skyUncertain, en)}</span>`
        : ` <span class="sb-tag">${term(TERMS.trendRef, en)}</span>`)
    : '';
  const clearPart = (isTrend && !h?.isDay)
    ? (en ? `~${h?.clear ?? 0}% clear` : `晴空約 ${h?.clear ?? 0}%`)
    : (en ? `${h?.clear ?? 0}% clear` : `晴空 ${h?.clear ?? 0}%`);
  const tempPart = hasTemp
    ? ((tInt - wcInt >= 3) ? (en ? `Feels ${fmtTempFn(wcInt)}` : `體感 ${fmtTempFn(wcInt)}`) : fmtTempFn(tInt))
    : '';
  const windPart = windMs >= 10 ? (en ? `Wind ${windMs}m/s` : `風速 ${windMs}m/s`) : '';
  const metaParts = [clearPart, darkTxt, tempPart, windPart, kpBadge].filter(Boolean);
  const rightMeta = metaParts.map(p => `<span class="nowrap">${p}</span>`).join(' · ');
  const html = `<div class="sb-top"><strong>${tStr}</strong> <strong style="color:${scCol}">${scoreReadout}</strong>${trendTagHtml}</div><div class="sb-bot">${rightMeta}</div>`;
  return { html, scoreReadout, darkTxt, kpBadge, clearPart, plainText: `${tStr} ${scoreReadout} | ${metaParts.join(' · ')}` };
}

/**
 * Format 3-Night Outlook row metrics with strict Co-Temporal Parity (INV-13 / INV-15):
 * - Tonight (idx === 0) ALWAYS displays the peak hour's clear-sky % and Kp (matching the 24h chart above),
 *   and if another (cloudier) hour reaches a much higher Kp (diff >= 0.8), explicitly splits peak vs night max.
 */
export function formatOutlookRowStats({ n, idx = 0, en = false } = {}) {
  const isMismatch = Boolean(n?.peakCloudMismatch && Number.isFinite(n?.kpPeakClear));
  const hasPeakWindow = Boolean(n?.bestWindow && (n?.bestNightScore ?? 0) >= 18);
  const usePeakHour = Boolean((hasPeakWindow || idx === 0) && Number.isFinite(n?.peakClear));
  const displayClear = isMismatch
    ? n.kpPeakClear
    : (usePeakHour ? n.peakClear : n?.bestClear);
  const clearTxt = isMismatch
    ? (en ? `${n.kpPeakClear}% clear at peak` : `強光時晴空 ${n.kpPeakClear}%`)
    : (displayClear !== null && displayClear !== undefined
        ? (en ? `${displayClear}% clear` : `${term(TERMS.clearSky, false)} ${displayClear}%`)
        : term(TERMS.status.noDarkSky, en));

  const maxKp = Number(n?.maxKp || 0);
  const peakKp = Number.isFinite(n?.peakKp) ? Number(n.peakKp) : null;
  const kpSplit = Boolean((hasPeakWindow || idx === 0) && peakKp !== null && (maxKp - peakKp) >= 0.8);
  let kpTxt;
  if (n?.kpAvailable === false) {
    kpTxt = en ? 'Kp --' : 'Kp 更新中';
  } else if (idx > 0) {
    kpTxt = kpSplit
      ? (en ? `~Kp ${Math.round(peakKp)} (max ${Math.round(maxKp)})` : `約 Kp ${Math.round(peakKp)}（高至 ${Math.round(maxKp)}）`)
      : (en ? `~Kp ${Math.round(maxKp)}` : `約 Kp ${Math.round(maxKp)}`);
  } else {
    kpTxt = kpSplit
      ? (en ? `Kp ${peakKp.toFixed(1)} (max ${maxKp.toFixed(1)})` : `Kp ${peakKp.toFixed(1)}（高至 ${maxKp.toFixed(1)}）`)
      : `Kp ${maxKp.toFixed(1)}`;
  }
  const winTxt = n?.bestWindow ? `${term(TERMS.peak, en)} ${n.bestWindow}` : '';
  return { clearTxt, kpTxt, winTxt, iconClearPct: displayClear, kpSplit };
}

/**
 * Single Source of Truth for NOAA storm priority (shared by Hero storm banner/tag and Trust Sheet #tsStormNote).
 * Guarantees Hero banner/tag and Trust Sheet storm card always agree 100% on source, G-level, and active vs watch state.
 */
export function resolveStormEvent({ scales = null, noaaAlert = null } = {}) {
  const hasAlert = Boolean(noaaAlert && noaaAlert.active);
  const hasScale = Boolean(scales && scales.active);
  if (!hasAlert && !hasScale) return null;
  const useAlert = hasAlert && (noaaAlert.kind === 'cme-shock' || (noaaAlert.gScale || 0) >= (scales?.currentScale || 0));
  const isShock = Boolean(useAlert && noaaAlert.kind === 'cme-shock');
  const level = useAlert
    ? Math.max(1, Math.min(5, Number(noaaAlert.gScale) || 1))
    : Math.max(0, Math.min(5, Number((scales?.currentScale >= 1 ? scales.currentScale : scales?.maxForecastScale) || 0)));
  if (!isShock && level < 1) return null;
  const isWarn = useAlert ? Boolean(noaaAlert.isWarning) : !((scales?.currentScale || 0) >= 1);
  const isSevere = level >= 3 || isShock;
  const peakDate = useAlert ? null : (scales?.peakDate || null);
  return { useAlert, isShock, level, isWarn, isActiveNow: !isWarn, isSevere, peakDate };
}

/**
 * Format actionable NOAA G1–G5 / CME storm details for #tsStormNote inside #trustSheet.
 * Ensures tapping the Hero storm tag always opens concrete local-latitude storm details
 * plus a direct official NOAA Alerts link.
 */
export function formatStormAlertDetail({
  scales = null, noaaAlert = null, sc = null, lat = 69.97, en = false, fmtDateFn = null
} = {}) {
  const ev = resolveStormEvent({ scales, noaaAlert });
  if (!ev) return null;

  const gNamesZh = { 1: '輕度', 2: '中度', 3: '強烈', 4: '嚴重', 5: '極端' };
  const gNamesEn = { 1: 'Minor', 2: 'Moderate', 3: 'Strong', 4: 'Severe', 5: 'Extreme' };
  const { useAlert, isShock, level: lvl } = ev;

  const stormKp = Math.min(9, 4 + Math.max(1, lvl));
  const dirZh = lat >= 0 ? '北方' : '南方';
  const dirEn = lat >= 0 ? 'northern' : 'southern';
  const needKp = Number.isFinite(sc?.neededKp) ? sc.neededKp : null;
  let localNote;
  if (sc?.outOfZone === 'low-lat') {
    const ml = Number.isFinite(sc?.magLat) ? sc.magLat : '--';
    localNote = en
      ? `Magnetic latitude here (${ml}°) is too low — even a G${lvl} storm rarely reaches this far.`
      : `此地磁緯度偏低（地磁 ${ml}°），即使出現 G${lvl} 地磁暴也通常看不到極光。`;
  } else if (needKp !== null) {
    if (stormKp >= needKp + 1) {
      localNote = en
        ? `This latitude typically needs Kp ${needKp} — if Kp ${stormKp} hits under clear dark skies, aurora can reach overhead and the ${dirEn} sky.`
        : `此地通常需 Kp ${needKp}，若達標（Kp ${stormKp}）且天黑晴朗，極光有機會出現在頭頂至${dirZh}天空。`;
    } else if (stormKp >= needKp) {
      localNote = en
        ? `This latitude needs ~Kp ${needKp} — if Kp ${stormKp} hits under clear dark skies, look low toward the ${dirEn} horizon or try a camera.`
        : `此地需約 Kp ${needKp}，若達標（Kp ${stormKp}）且天黑晴朗，有機會於${dirZh}低空看見微弱極光或用相機拍到。`;
    } else {
      localNote = en
        ? `This latitude needs ~Kp ${needKp} — a G${lvl} storm (Kp ${stormKp}) is usually still too weak here.`
        : `此地需約 Kp ${needKp}，單靠 G${lvl}（Kp ${stormKp}）通常仍不足，需更強磁暴才有機會。`;
    }
  } else {
    localNote = en
      ? `Under clear dark skies, aurora can brighten significantly toward the ${dirEn} horizon.`
      : `若達標且天黑晴朗，極光可能明顯增強並向${dirZh}低空擴展。`;
  }

  let title;
  let body;
  let isActiveNow = false;
  if (useAlert) {
    const isWarn = Boolean(noaaAlert.isWarning);
    isActiveNow = !isWarn;
    if (isShock) {
      title = isWarn
        ? (en ? 'NOAA Solar Storm (CME) Warning' : 'NOAA 太陽風暴（CME）即將抵達')
        : (en ? 'NOAA Solar Storm Shock Arrived' : 'NOAA 太陽風暴衝擊已抵達');
      body = en
        ? `A coronal mass ejection shock can trigger sudden aurora bursts within 30–60 min. ${localNote}`
        : `太陽風暴（CME）衝擊波可能在 30–60 分鐘內引發極光突然增強。${localNote}`;
    } else {
      const gEn = gNamesEn[lvl] || 'Geomagnetic';
      const gZh = gNamesZh[lvl] || '';
      title = isWarn
        ? (en ? `NOAA G${lvl} (${gEn}) Storm Watch` : `NOAA G${lvl} ${gZh}地磁暴預警`)
        : (en ? `NOAA G${lvl} (${gEn}) Storm Active` : `NOAA G${lvl} ${gZh}地磁暴進行中`);
      body = en
        ? `Corresponds to Kp ${stormKp}. ${localNote} Actual visibility still depends on dark clear skies.`
        : `對應 Kp ${stormKp} 級活動。${localNote} 實際仍取決於當下天黑與晴空條件。`;
    }
  } else {
    const isNow = (scales?.currentScale || 0) >= 1;
    isActiveNow = isNow;
    const dStr = typeof fmtDateFn === 'function' ? (fmtDateFn(scales?.peakDate, en) || '') : '';
    const gEn = gNamesEn[lvl] || 'Geomagnetic';
    const gZh = gNamesZh[lvl] || '';
    title = isNow
      ? (en ? `NOAA G${lvl} (${gEn}) Storm Active` : `NOAA G${lvl} ${gZh}地磁暴進行中`)
      : (en ? `NOAA G${lvl} (${gEn}) Storm Watch${dStr ? ` · ${dStr}` : ''}` : `NOAA ${dStr ? `${dStr} ` : ''}G${lvl} ${gZh}地磁暴預警`);
    body = en
      ? `NOAA forecasts up to G${lvl} (Kp ${stormKp}). ${localNote} Watches cover the whole day — check the 24h chart for dark clear hours.`
      : `NOAA 預估最高可達 G${lvl}（對應 Kp ${stormKp}）。${localNote} 警報涵蓋整日可能時段，實際仍需搭配 24 小時預報確認天黑與晴空。`;
  }

  return {
    title,
    body,
    level: lvl,
    stormKp,
    isActiveNow,
    linkUrl: 'https://www.spaceweather.gov/products/alerts-watches-and-warnings',
    linkLabel: en ? 'Open official NOAA Storm Alerts ↗' : '前往 NOAA 官方風暴警報原文 ↗'
  };
}

/**
 * Pure Hero ViewModel builder (Single Source of Truth for aurSubHtml, heroCue, heroSub).
 * Keeps src/app.js thin while letting copy-contract.mjs exhaustively verify Hero copy invariants.
 */
export function buildHeroViewModel({
  pos = { lat: 69.65, lon: 18.96 }, sc = {}, kp = null, mltNow = null,
  act = {}, activeHrs = [], localizedNights3 = [], refNowMs = Date.now(), en = false
} = {}) {
  const kpShort = kp !== null && Number.isFinite(Number(kp)) ? Number(kp).toFixed(1) : '--';
  const showNeedKp = sc.outOfZone === 'need-storm' || (Number.isFinite(sc.neededKp) && sc.neededKp >= 2.5 && (sc.auroraScore ?? 0) < 55);
  const aurSubHtml = sc.outOfZone === 'low-lat'
    ? `<span class="nowrap">${en ? `Mag ${sc.magLat}°` : `地磁 ${sc.magLat}°`}</span>`
    : (showNeedKp
        ? `<span class="nowrap">Kp ${kpShort} · ${en ? `need ${sc.neededKp}` : `需 ${sc.neededKp}`}</span>`
        : `<span class="nowrap">Kp ${kpShort}${(sc.auroraScore ?? 0) >= 55 ? (en ? ' · Active' : ' · 活躍') : ''}</span>`);

  let heroCue = act.title || '';
  let heroSub = '';
  if (act.actionType === 'drive') {
    heroCue = act.title || '';
    heroSub = act.lead || '';
  } else if (act.actionType === 'daylight') {
    heroCue = act.lead || act.title || '';
  } else if (act.actionType === 'go') {
    const geom = computeViewingGeometry({
      lat: pos.lat, lon: pos.lon,
      kp: Math.max(kp ?? 0, sc.effKp ?? 0), mlt: mltNow, lang: en ? 'en' : 'zh'
    });
    const lookSouth = pos.lat < 0 || geom.mode === 'overhead-eq';
    const dirCueZh = (sc.total ?? 0) >= 65
      ? (lookSouth ? '現在適合出門，肉眼可見，朝頭頂與南方觀察' : '現在適合出門，肉眼可見，朝頭頂與北方觀察')
      : ((sc.total ?? 0) >= 40
          ? (lookSouth ? '適合出門，肉眼可見、手機更亮，留意南方' : '適合出門，肉眼可見、手機更亮，留意北方')
          : '極光爆發中，留意雲縫與手機夜拍');
    const dirCueEn = (sc.total ?? 0) >= 65
      ? (lookSouth ? 'Go out now — visible to eye, look overhead and south' : 'Go out now — visible to eye, look overhead and north')
      : ((sc.total ?? 0) >= 40
          ? 'Good to go — visible to eye, brighter on camera'
          : 'Aurora burst — watch cloud gaps & try camera');
    heroCue = en ? dirCueEn : dirCueZh;
  } else if (act.actionType === 'wait' && (sc.total ?? 0) < 18 && (sc.skyScore ?? 0) < 45) {
    const upcoming = (activeHrs || []).slice(1, 24).filter(h => !Number.isFinite(h?.dtMs) || h.dtMs > refNowMs + 15 * 60000);
    const firstGood = upcoming.find(h => h && !h.isDay && h.score >= 40)
      || upcoming.find(h => h && !h.isDay && h.clear >= 55);
    const startT = firstGood?.time || '';
    const quietNow = act.auroraWorthDriving === false || (sc.auroraScore ?? 0) < 30;
    heroCue = startT
      ? (quietNow
          ? (en ? `Quiet & cloudy now — better after ${startT}` : `目前極光偏弱且多雲，預計 ${startT} 後轉佳`)
          : (en ? `Rest for now — skies improve after ${startT}` : `先休息，預計 ${startT} 後有望轉佳`))
      : (act.title || '');
  } else if (act.actionType === 'sleep') {
    const futureBest = (localizedNights3 || []).slice(1)
      .filter(n => n && (n.tone === 'good' || n.tone === 'warn'))
      .sort((a, b) => (b.bestNightScore || 0) - (a.bestNightScore || 0))[0];
    heroCue = futureBest
      ? (en ? `Low chance tonight — ${futureBest.dayLabel} looks better` : `今晚機率偏低，${futureBest.dayLabel}機會較佳`)
      : (en ? 'Low chance right now — check back later' : '目前機率偏低，可先休息稍後再看');
  }

  return { aurSubHtml, heroCue, heroSub };
}

/**
 * Pure Darkness Pillar sub-label formatter (#fDarkSub).
 * Handles evening twilight darkening vs morning dawn so partial twilight (e.g., 49% dark while sun is descending)
 * NEVER jumps confusingly to tomorrow morning's sunrise time ("09:15 天亮").
 */
export function formatDarkCountdownSub({
  darkWin = null, moon = {}, en = false, sunAltNow = null, sunAltNext30 = null, darkScore = null
} = {}) {
  if (darkWin?.state === 'midnight-sun') return en ? 'Midnight sun' : '極晝偏亮';
  if (darkWin?.state === 'twilight-wait' && darkWin.nextDarkHM) {
    return en ? `Dark ${escapeHtml(darkWin.nextDarkHM)}` : `${escapeHtml(darkWin.nextDarkHM)} 天黑`;
  }
  const moonBright = Boolean(moon?.up && ((moon.effMoonPct ?? 0) >= 40 || ((moon.pct ?? 0) >= 75 && (moon.altDeg ?? 0) >= 15)));
  const moonLbl = (moon?.pct ?? 0) >= 85
    ? (en ? 'Full moon' : '滿月')
    : (en ? 'Moonlit' : '有亮月');
  if (darkWin?.state === 'polar-night') {
    const polarTwilight = Number.isFinite(sunAltNow) && sunAltNow > -10;
    if (polarTwilight) {
      return moonBright
        ? (en ? `Polar twilight · ${moonLbl}` : `極夜微光 · ${moonLbl}`)
        : (en ? 'Polar twilight' : '極夜微光');
    }
    return moonBright
      ? (en ? `Polar night · ${moonLbl}` : `極夜 · ${moonLbl}`)
      : (en ? 'Polar night' : '極夜全暗');
  }
  // Partial twilight (darkScore < 85% and sun still above -10°): show darkening vs dawn honestly!
  const isPartialTwilight = Number.isFinite(sunAltNow) && sunAltNow > -10 && Number.isFinite(darkScore) && darkScore < 85;
  const isDarkening = isPartialTwilight && Number.isFinite(sunAltNext30) && sunAltNext30 < sunAltNow;
  if (isDarkening) {
    return moonBright
      ? (en ? `<span class="nowrap">Darkening</span><span class="sub-dot" aria-hidden="true">·</span><span class="nowrap">${moonLbl}</span>` : `<span class="nowrap">暮光轉暗中</span><span class="sub-dot" aria-hidden="true">·</span><span class="nowrap">${moonLbl}</span>`)
      : (en ? '<span class="nowrap">Darkening</span>' : '<span class="nowrap">暮光轉暗中</span>');
  }
  if (darkWin?.state === 'dark' && darkWin.darkEndHM) {
    if (moonBright) {
      return en
        ? `<span class="nowrap">${moonLbl}</span><span class="sub-dot" aria-hidden="true">·</span><span class="nowrap">Light ${escapeHtml(darkWin.darkEndHM)}</span>`
        : `<span class="nowrap">${moonLbl}</span><span class="sub-dot" aria-hidden="true">·</span><span class="nowrap">${escapeHtml(darkWin.darkEndHM)} 天亮</span>`;
    }
    return en ? `<span class="nowrap">Light ${escapeHtml(darkWin.darkEndHM)}</span>` : `<span class="nowrap">${escapeHtml(darkWin.darkEndHM)} 天亮</span>`;
  }
  return moonBright ? moonLbl : term(TERMS.darkFull, en);
}


