/**
 * Nordic Aurora Radar — Pure UI Copy Formatters (Single Source of Truth)
 *
 * Keeps all 24h peak-window and scrub-bar copy generation strictly pure and
 * DOM-free so `tests/copy-contract.mjs` can exhaustively verify every single
 * number-to-copy invariant across thousands of weather/latitude/lunar states.
 */

import { escapeHtml } from './aurora-engine.js';
import { TERMS, term } from './glossary.js';

function fmtNextHr(h) {
  const m = /^(\d{2}):(\d{2})/.exec(String(h?.time || ''));
  if (!m) return '';
  return `${String((Number(m[1]) + 1) % 24).padStart(2, '0')}:${m[2]}`;
}

/** Format the 24h wave card peak headline (#homeBest) */
export function formatWavePeakSummary({
  vis = [], bestInVis = null, outZoneKind = null, isOutOfZone = false,
  bestTimeLbl = '', bestIsNextNight = false, en = false
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
        ? (en ? `~Kp ${Math.round(kpVal)}` : `約 Kp ${Math.round(kpVal)}`)
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
 * Format 3-Night Outlook row metrics with strict Co-Temporal Parity (INV-13):
 * - When a peak window exists (score >= 18), display the clear-sky % and Kp OF THAT PEAK HOUR
 *   so Tonight's card matches the 24h chart above, and if another (cloudier) hour reaches a much
 *   higher Kp (diff >= 0.8), explicitly label it as night max instead of pretending it happens at peak!
 */
export function formatOutlookRowStats({ n, idx = 0, en = false } = {}) {
  const isMismatch = Boolean(n?.peakCloudMismatch && Number.isFinite(n?.kpPeakClear));
  const hasPeakWindow = Boolean(n?.bestWindow && (n?.bestNightScore ?? 0) >= 18);
  const displayClear = isMismatch
    ? n.kpPeakClear
    : (hasPeakWindow && Number.isFinite(n?.peakClear) ? n.peakClear : n?.bestClear);
  const clearTxt = isMismatch
    ? (en ? `${n.kpPeakClear}% clear at peak` : `強光時晴空 ${n.kpPeakClear}%`)
    : (displayClear !== null && displayClear !== undefined
        ? (en ? `${displayClear}% clear` : `${term(TERMS.clearSky, false)} ${displayClear}%`)
        : term(TERMS.status.noDarkSky, en));

  const maxKp = Number(n?.maxKp || 0);
  const peakKp = Number.isFinite(n?.peakKp) ? Number(n.peakKp) : null;
  const kpSplit = Boolean(hasPeakWindow && peakKp !== null && (maxKp - peakKp) >= 0.8);
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
