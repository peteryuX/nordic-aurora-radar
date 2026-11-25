/**
 * Nordic Aurora Radar — Pure SVG Visualization Builders
 *
 * All functions return pure SVG inner markup strings with uniform X-axis ticks,
 * L1 telemetry gap handling, and zero side effects.
 */

import {
  isEn, getZoneParts, parseUtcMs, utcTagToLocalHM, computeL1EtaMin, bzToEnergy
} from './aurora-engine.js';

function clampNum(v, lo, hi, fb = 0) {
  const n = typeof v === 'number' ? v : (v === null || v === undefined || v === '' ? NaN : Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
}

function escSvg(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildSkySceneSVG({ cloudPct, auroraScore, moonUp, moonPct, isTooBright } = {}) {
  const cPct = clampNum(cloudPct, 0, 100, 0);
  const aSc = clampNum(auroraScore, 0, 100, 0);
  const mPct = clampNum(moonPct, 0, 100, 0);
  const bright = Boolean(isTooBright);

  const bgTop = bright ? '#245d92' : '#030a16';
  const bgBot = bright ? '#7fb4dc' : '#0d223d';
  const starOp = bright ? 0 : Math.max(0.05, (100 - cPct) / 100);
  const aurOp = (bright || aSc <= 0) ? 0 : Math.max(0.06, (aSc / 100) * Math.max(0.18, (100 - cPct * 0.85) / 100));
  const cloudOp = Math.min(0.95, Math.max(0.08, (cPct / 100) * 0.94));
  const showMoon = Boolean(moonUp) && !bright;
  const moonOp = showMoon ? Math.max(0.22, (100 - cPct * 0.7) / 100) : 0;
  const moonR = 11 + (mPct / 100) * 9;

  const stars = [
    [40,28,1.5],[95,52,1.2],[148,24,1.8],[215,40,1.1],[275,20,1.6],
    [340,46,1.3],[410,25,1.7],[465,55,1.2],[530,30,1.5],[595,48,1.4],
    [70,82,1.1],[180,74,1.4],[305,78,1.2],[440,86,1.3],[560,72,1.5]
  ].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="${(starOp * 0.85).toFixed(2)}"/>`).join('');

  const clouds = cPct >= 15 ? `
    <g opacity="${cloudOp.toFixed(2)}">
      <ellipse cx="110" cy="78" rx="130" ry="34" fill="#324864"/>
      <ellipse cx="290" cy="64" rx="165" ry="42" fill="#293d56"/>
      <ellipse cx="490" cy="80" rx="160" ry="38" fill="#324864"/>
      <ellipse cx="200" cy="108" rx="180" ry="32" fill="#1f3148"/>
      <ellipse cx="440" cy="112" rx="190" ry="34" fill="#23364f"/>
    </g>` : '';

  const moonSvg = showMoon ? `
    <g opacity="${moonOp.toFixed(2)}">
      <circle cx="455" cy="48" r="${(moonR * 1.9).toFixed(1)}" fill="#ffefc2" opacity="0.16"/>
      <circle cx="455" cy="48" r="${moonR.toFixed(1)}" fill="#fff4d1"/>
    </g>` : '';

  return `
    <defs>
      <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgTop}"/><stop offset="100%" stop-color="${bgBot}"/>
      </linearGradient>
      <linearGradient id="aurG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#34f0b0" stop-opacity="0.9"/>
        <stop offset="50%" stop-color="#22d3ee" stop-opacity="0.75"/>
        <stop offset="100%" stop-color="#a855f7" stop-opacity="0.65"/>
      </linearGradient>
      <filter id="aurBlur"><feGaussianBlur stdDeviation="11"/></filter>
    </defs>
    <rect width="640" height="225" fill="url(#skyG)"/>
    ${stars}
    <g class="aur-anim" opacity="${aurOp.toFixed(2)}" filter="url(#aurBlur)">
      <path d="M-20,130 C90,45 190,145 310,60 C430,-10 520,110 660,40 L660,95 C520,155 430,45 310,115 C190,185 90,95 -20,165 Z" fill="url(#aurG)"/>
    </g>
    ${moonSvg}
    ${clouds}
    <path d="M0,225 L0,186 L78,148 L155,176 L248,136 L345,178 L442,146 L545,172 L640,144 L640,225 Z" fill="#081220" opacity="0.92"/>
    <path d="M0,225 L0,202 L120,182 L265,204 L415,178 L560,198 L640,186 L640,225 Z" fill="#040912"/>
  `;
}

/**
 * Solar Wind Energy & Earth-Arrival Chart (uniform 30-min :00/:30 local arrival ticks,
 * L1 telemetry dropout splitting when consecutive gaps exceed 5 minutes).
 */
export function buildBzChartSVG(series, timeZone, speed, balOpt, lang) {
  const en = isEn(lang);
  if (!Array.isArray(series) || series.length < 2) {
    return `<text x="210" y="90" text-anchor="middle" fill="var(--muted)" font-size="13" font-weight="700">${en ? 'No live satellite energy data' : '暫無衛星即時太陽風曲線'}</text>`;
  }
  const W = 420, H = 170, padL = 56, padR = 14, padT = 28, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yOf = e => padT + ((100 - clampNum(e, 0, 100, 4)) / 100) * plotH;

  // Zone boundaries match summarizeEnergyTrend: <25 Quiet, 25-61 Rising, >=62 Active
  const yBurst = yOf(62), yWarm = yOf(25);
  const etaMin = clampNum(balOpt?.etaMin ?? computeL1EtaMin(speed), 8, 95, 45);
  const arrMsList = series.map(s => {
    const ms = parseUtcMs(s?.time_tag);
    return Number.isFinite(ms) ? ms + etaMin * 60000 : NaN;
  });
  const spanRawMs = arrMsList[arrMsList.length - 1] - arrMsList[0];
  const validTime = Number.isFinite(arrMsList[0])
    && Number.isFinite(arrMsList[arrMsList.length - 1])
    && spanRawMs > 0
    && spanRawMs <= 24 * 3600000;
  const minMs = validTime ? arrMsList[0] : 0;
  const maxMs = validTime ? arrMsList[arrMsList.length - 1] : (series.length - 1);
  const xOfMs = ms => clampNum(padL + ((ms - minMs) / (maxMs - minMs)) * plotW, padL, W - padR, padL);
  const xOf = i => (validTime && Number.isFinite(arrMsList[i]))
    ? xOfMs(arrMsList[i])
    : clampNum(padL + (i / (series.length - 1)) * plotW, padL, W - padR, padL);

  const rawEnergies = (balOpt && Array.isArray(balOpt.energy120) && balOpt.energy120.length === series.length)
    ? balOpt.energy120
    : series.map(s => bzToEnergy(s?.bz, speed));
  const energies = rawEnergies.map(e => clampNum(e, 0, 100, 4));

  // Split into contiguous segments whenever L1 data has a >5 min dropout
  const segments = [];
  let curSeg = [];
  for (let i = 0; i < energies.length; i++) {
    if (curSeg.length > 0 && validTime && Number.isFinite(arrMsList[i]) && Number.isFinite(arrMsList[i - 1]) && (arrMsList[i] - arrMsList[i - 1]) > 5 * 60000) {
      segments.push(curSeg);
      curSeg = [];
    }
    curSeg.push(i);
  }
  if (curSeg.length) segments.push(curSeg);

  const baseY = (padT + plotH).toFixed(1);
  const lastE = energies[energies.length - 1];
  const lx = xOf(energies.length - 1), ly = yOf(lastE);
  const col = lastE >= 62 ? 'var(--green)' : lastE >= 25 ? 'var(--amber)' : 'var(--muted)';
  const stateWord = lastE >= 62 ? (en ? 'Active' : '活躍') : lastE >= 25 ? (en ? 'Building' : '增強中') : (en ? 'Low' : '偏弱');

  const areaSvg = segments.filter(seg => seg.length >= 2).map(seg => {
    const sPts = seg.map(i => `${xOf(i).toFixed(1)},${yOf(energies[i]).toFixed(1)}`).join(' ');
    const x0 = xOf(seg[0]).toFixed(1), x1 = xOf(seg[seg.length - 1]).toFixed(1);
    return `<polygon points="${x0},${baseY} ${sPts} ${x1},${baseY}" fill="url(#enGrad)"/>`;
  }).join('');

  const lineSvg = segments.map(seg => {
    if (seg.length === 1) {
      const i = seg[0];
      return `<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(energies[i]).toFixed(1)}" r="2.2" fill="${col}"/>`;
    }
    const sPts = seg.map(i => `${xOf(i).toFixed(1)},${yOf(energies[i]).toFixed(1)}`).join(' ');
    return `<polyline fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" points="${sPts}"/>`;
  }).join('');

  let gapSvg = '';
  for (let s = 1; s < segments.length; s++) {
    const iA = segments[s - 1][segments[s - 1].length - 1];
    const iB = segments[s][0];
    gapSvg += `<line x1="${xOf(iA).toFixed(1)}" y1="${yOf(energies[iA]).toFixed(1)}" x2="${xOf(iB).toFixed(1)}" y2="${yOf(energies[iB]).toFixed(1)}" stroke="rgba(148,188,232,0.4)" stroke-width="1.4" stroke-dasharray="2 4"/>`;
  }

  let xTicksSvg = '';
  if (validTime) {
    const spanMin = (maxMs - minMs) / 60000;
    const stepMin = spanMin > 360 ? 180 : (spanMin > 165 ? 60 : 30);
    const stepMs = stepMin * 60000;
    const firstTick = Math.ceil(minMs / stepMs) * stepMs;
    let guardCount = 0;
    for (let t = firstTick; t <= maxMs && guardCount < 24; t += stepMs, guardCount++) {
      const tx = xOfMs(t);
      if (tx < padL + 12 || tx > W - padR - 12) continue;
      const z = getZoneParts(new Date(t), timeZone);
      xTicksSvg += `
        <line x1="${tx.toFixed(1)}" y1="${padT}" x2="${tx.toFixed(1)}" y2="${baseY}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 4"/>
        <text x="${tx.toFixed(1)}" y="${H - 7}" text-anchor="middle" fill="var(--muted)" font-size="12.5" font-weight="700">${escSvg(z.hourStr)}:${escSvg(z.minStr)}</text>`;
    }
  }
  if (!xTicksSvg) {
    const tStart = escSvg(utcTagToLocalHM(series[0]?.time_tag, timeZone, etaMin));
    const tEnd = escSvg(utcTagToLocalHM(series[series.length - 1]?.time_tag, timeZone, etaMin));
    xTicksSvg = `
      <text x="${padL}" y="${H - 7}" fill="var(--muted)" font-size="12.5" font-weight="700">${tStart}</text>
      <text x="${W - padR}" y="${H - 7}" text-anchor="end" fill="var(--text)" font-size="12.5" font-weight="800">${tEnd}</text>`;
  }

  let arriveSvg = '';
  let futureBandSvg = '';
  if (balOpt && Number.isInteger(balOpt.arrivingIdx) && balOpt.arrivingIdx > 4 && balOpt.arrivingIdx < series.length - 4) {
    const ax = xOf(balOpt.arrivingIdx);
    const tNowEarth = escSvg(utcTagToLocalHM(series[balOpt.arrivingIdx]?.time_tag, timeZone, etaMin));
    const lxClamped = Math.max(padL + 68, Math.min(W - 144, ax));
    const futureW = Math.max(0, W - padR - ax);
    futureBandSvg = `<rect x="${ax.toFixed(1)}" y="${padT}" width="${futureW.toFixed(1)}" height="${plotH}" fill="var(--text)" fill-opacity="0.04"/>`;
    arriveSvg = `
      <line x1="${ax.toFixed(1)}" y1="${padT}" x2="${ax.toFixed(1)}" y2="${baseY}" stroke="var(--text)" stroke-dasharray="3 3" stroke-width="1.3" opacity="0.72"/>
      <circle cx="${ax.toFixed(1)}" cy="${yOf(energies[balOpt.arrivingIdx]).toFixed(1)}" r="3.6" fill="var(--text)" stroke="var(--bg)" stroke-width="1.5"/>
      <text x="${lxClamped.toFixed(1)}" y="17" text-anchor="middle" fill="var(--text)" font-size="11.5" font-weight="800">${en ? `Now ${tNowEarth}` : `現在 ${tNowEarth}`}</text>`;
  }

  return `
    <defs>
      <linearGradient id="enGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--text)" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="var(--text)" stop-opacity="0.01"/>
      </linearGradient>
    </defs>
    <text x="${padL}" y="17" data-role="y-title" fill="var(--muted)" font-size="11" font-weight="700">${en ? 'Solar wind energy (rel.)' : '太陽風能量（相對）'}</text>
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${(yBurst - padT).toFixed(1)}" fill="var(--green)" fill-opacity="0.06"/>
    <rect x="${padL}" y="${yBurst.toFixed(1)}" width="${plotW}" height="${(yWarm - yBurst).toFixed(1)}" fill="var(--amber)" fill-opacity="0.04"/>
    ${futureBandSvg}
    ${xTicksSvg}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${baseY}" stroke="rgba(255,255,255,0.12)"/>
    <line x1="${padL}" y1="${yBurst.toFixed(1)}" x2="${W - padR}" y2="${yBurst.toFixed(1)}" stroke="var(--green)" stroke-dasharray="4 4" stroke-width="1.1" opacity="0.55"/>
    <line x1="${padL}" y1="${yWarm.toFixed(1)}" x2="${W - padR}" y2="${yWarm.toFixed(1)}" stroke="rgba(255,255,255,0.14)" stroke-dasharray="3 4" stroke-width="1"/>
    <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="rgba(255,255,255,0.16)"/>
    <text x="${padL - 8}" y="${(padT + (yBurst - padT) / 2 + 4).toFixed(1)}" text-anchor="end" fill="var(--green)" font-size="12.5" font-weight="800">${en ? 'Active' : '活躍'}</text>
    <text x="${padL - 8}" y="${(yBurst + (yWarm - yBurst) / 2 + 4).toFixed(1)}" text-anchor="end" fill="var(--amber)" font-size="12.5" font-weight="700">${en ? 'Building' : '增強中'}</text>
    <text x="${padL - 8}" y="${(yWarm + (padT + plotH - yWarm) / 2 + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="12.5" font-weight="700">${en ? 'Low' : '偏弱'}</text>
    ${areaSvg}
    ${gapSvg}
    ${lineSvg}
    ${arriveSvg}
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.8" fill="${col}" stroke="var(--bg)" stroke-width="2"/>
    <rect x="${W - 110}" y="2" width="96" height="21" rx="10.5" fill="rgba(8,9,12,0.88)" stroke="${col}" stroke-width="1"/>
    <text x="${W - 62}" y="16.5" text-anchor="middle" fill="${col}" font-size="12" font-weight="800">${en ? `Next · ${stateWord}` : `預告 · ${stateWord}`}</text>
  `;
}

/** 24h Single-Metric Viewing-Score Bar Chart + Separated Clear-Sky Context Strip (zero dual-axis ambiguity) */
export function buildSkyWaveSVG(hrs, bestDark, selectedIdx = -1, lang) {
  const en = isEn(lang);
  if (!Array.isArray(hrs) || hrs.length < 2) {
    return `<text x="210" y="95" text-anchor="middle" fill="var(--muted)" font-size="13">${en ? 'Loading hourly forecast…' : '讀取逐時預報中…'}</text>`;
  }
  const is24 = hrs.length > 14;
  const tickStep = is24 ? 4 : 2;
  const W = 420, H = 194, padL = 56, padR = 14, padT = 28;
  const plotH = 112; // Score bars: y=28..140; Clear-sky strip: y=148..160; X-axis labels: y=184
  const plotW = W - padL - padR;
  const stripY = 148, stripH = 12;
  const xOf = i => padL + (i / (hrs.length - 1)) * plotW;
  const yOf = sc => padT + ((100 - clampNum(sc, 0, 100, 0)) / 100) * plotH;
  const stepW = plotW / (hrs.length - 1);
  const tierFill = sc => (sc >= 65 ? 'var(--green)' : sc >= 40 ? 'var(--good)' : sc >= 18 ? 'var(--amber)' : 'var(--muted)');

  const nightHrs = hrs.filter(h => h && !h.isDay);
  const allOutOfZone = nightHrs.length > 0 && nightHrs.every(h => Boolean(h.outOfZone));

  // Daylight shading covers ONLY the score-bar plot area (never overlaps the clear-sky strip)
  const dayBands = hrs.map((h, i) => h?.isDay
    ? `<rect x="${Math.max(padL, xOf(i) - stepW / 2).toFixed(1)}" y="${padT}" width="${Math.max(0, Math.min(stepW, W - padR - Math.max(padL, xOf(i) - stepW / 2))).toFixed(1)}" height="${plotH}" fill="var(--day-band)"/>`
    : '').join('');

  let dayLabelSvg = '';
  let dayLabelX = -999;
  let bestRun = null, curRun = null;
  hrs.forEach((h, i) => {
    if (h?.isDay) {
      if (!curRun) curRun = [i, i];
      else curRun[1] = i;
      if (!bestRun || (curRun[1] - curRun[0]) > (bestRun[1] - bestRun[0])) bestRun = [...curRun];
    } else {
      curRun = null;
    }
  });
  if (bestRun) {
    const dx1 = Math.max(padL, xOf(bestRun[0]) - stepW / 2);
    const dx2 = Math.min(W - padR, xOf(bestRun[1]) + stepW / 2);
    if (dx2 - dx1 >= 46) {
      dayLabelX = (dx1 + dx2) / 2;
      dayLabelSvg = `<text x="${dayLabelX.toFixed(1)}" y="${padT + 15}" text-anchor="middle" fill="var(--blue)" fill-opacity="0.72" font-size="10.5" font-weight="700">${en ? 'Too bright' : '天色過亮'}</text>`;
    }
  }

  const vGrid = hrs.map((_, i) => i % tickStep === 0
    ? `<line x1="${xOf(i).toFixed(1)}" y1="${padT}" x2="${xOf(i).toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="2 4"/>`
    : '').join('');

  const bestIdx = (!allOutOfZone && bestDark && ((bestDark.clear ?? 0) >= 25 || (bestDark.score ?? 0) >= 18))
    ? hrs.findIndex(h => h && !h.isDay && ((Number.isFinite(bestDark.dtMs) && Number.isFinite(h.dtMs)) ? h.dtMs === bestDark.dtMs : h.time === bestDark.time))
    : -1;
  const bestX = bestIdx >= 0 ? xOf(bestIdx) : -1;
  const titleOnRight = bestIdx >= 0 && bestX < 210;
  const titleTxt = en ? 'Score (0–99)' : '觀測指數（0–99）';
  const titleSvg = titleOnRight
    ? `<text x="${W - padR}" y="16" data-role="y-title" text-anchor="end" fill="var(--muted)" font-size="11" font-weight="700">${titleTxt}</text>`
    : `<text x="${padL}" y="16" data-role="y-title" fill="var(--muted)" font-size="11" font-weight="700">${titleTxt}</text>`;

  // Midnight boundary hairline (00:xx when 0 < i < len - 1)
  let midnightSvg = '';
  const midIdx = hrs.findIndex((h, i) => i > 0 && i < hrs.length - 1 && typeof h?.time === 'string' && h.time.startsWith('00:'));
  if (midIdx > 0) {
    const mx = xOf(midIdx);
    const tooCloseToBest = bestX >= 0 && Math.abs(mx - bestX) < 48;
    const tooCloseToDay = Math.abs(mx - dayLabelX) < 38;
    const midLbl = (!tooCloseToBest && !tooCloseToDay)
      ? `<text x="${Math.min(W - padR - 14, mx + 4).toFixed(1)}" y="${padT + 12}" text-anchor="start" fill="rgba(255,255,255,0.45)" font-size="10" font-weight="700">${en ? 'Tomorrow' : '明天'}</text>`
      : '';
    midnightSvg = `<line x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="rgba(255,255,255,0.22)" stroke-dasharray="3 3" stroke-width="1"/>${midLbl}`;
  }

  // Tier guide lines at 65 (Excellent), 40 (Good), 18 (Fair)
  const y65 = yOf(65), y40 = yOf(40), y18 = yOf(18), baseY = padT + plotH;
  const barW = is24 ? 9.2 : Math.max(10, Math.min(20, stepW * 0.48));
  const barRx = 2.5;
  const tileW = Math.max(4, stepW - 2.2);

  const scoreBars = allOutOfZone
    ? `<text x="${(padL + plotW / 2).toFixed(1)}" y="${(padT + plotH / 2 + 4).toFixed(1)}" text-anchor="middle" fill="var(--muted)" font-size="12" font-weight="700">${en ? 'Outside auroral zone' : '不在極光帶'}</text>`
    : hrs.map((h, i) => {
        if (!h || h.isDay) return '';
        const scVal = clampNum(h?.score, 0, 100, 0);
        const x = xOf(i) - barW / 2;
        const isSel = i === selectedIdx;
        const isBest = i === bestIdx;
        if (scVal <= 0) {
          return `<rect class="sc-bar" data-bar-idx="${i}" x="${x.toFixed(1)}" y="${(baseY - 2.5).toFixed(1)}" width="${barW.toFixed(1)}" height="2.5" rx="1" fill="var(--muted)" fill-opacity="${isSel ? '0.95' : '0.45'}"/>`;
        }
        const y = yOf(scVal);
        const bh = Math.max(3, baseY - y);
        const fill = tierFill(scVal);
        const op = isSel ? '1' : (isBest ? '0.92' : '0.72');
        const strokeAttr = isSel ? 'stroke="var(--text)" stroke-width="1.2"' : 'stroke="none"';
        return `<rect class="sc-bar" data-bar-idx="${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${barRx}" fill="${fill}" fill-opacity="${op}" ${strokeAttr}/>`;
      }).join('');

  // Separated Clear-Sky Context Strip (pure luminance — zero competing hue, zero shared Y-axis)
  const clearStrip = hrs.map((h, i) => {
    const clearVal = clampNum(h?.clear, 0, 100, 0);
    const x = xOf(i) - tileW / 2;
    const tx = Math.max(padL, x);
    const tw = Math.max(2, Math.min(tileW, W - padR - tx));
    const op = (0.08 + 0.72 * (clearVal / 100)).toFixed(2);
    const isSel = i === selectedIdx;
    return `<rect x="${tx.toFixed(1)}" y="${stripY}" width="${tw.toFixed(1)}" height="${stripH}" rx="2" fill="var(--text)" fill-opacity="${op}"${isSel ? ' stroke="var(--text)" stroke-width="1"' : ''}/>`;
  }).join('');

  const overlays = hrs.map((h, i) => {
    const x = xOf(i);
    const isBest = i === bestIdx;
    const isSel = i === selectedIdx;
    const showTick = (i % tickStep === 0);
    const rawTime = typeof h?.time === 'string' ? h.time : '';
    const hhmm = escSvg(rawTime.length >= 5 ? rawTime.slice(0, 5) : (rawTime.length >= 2 ? `${rawTime.slice(0, 2)}:00` : '--:--'));
    const bestCol = isBest ? tierFill(clampNum(h?.score, 0, 100, 0)) : 'var(--green)';
    const lbl = showTick
      ? `<text x="${x.toFixed(1)}" y="${H - 10}" text-anchor="middle" fill="${isSel ? 'var(--text)' : (isBest ? bestCol : 'var(--muted)')}" font-size="12" font-weight="${isBest || isSel ? '800' : '700'}">${hhmm}</text>`
      : '';
    let bestSvg = '';
    if (isBest) {
      const starTxt = en ? `★ ${hhmm} Best` : `★ ${hhmm} 最佳`;
      const pillW = en ? 88 : 86;
      const pillX = Math.max(padL, Math.min(W - padR - pillW, x - pillW / 2));
      const pillCx = pillX + pillW / 2;
      const barTopY = h && !h.isDay && clampNum(h.score, 0, 100, 0) > 0 ? yOf(h.score) : baseY;
      bestSvg =
        `<line x1="${x.toFixed(1)}" y1="22" x2="${x.toFixed(1)}" y2="${barTopY.toFixed(1)}" stroke="${bestCol}" stroke-dasharray="2.5 3" stroke-width="1.3" opacity="0.72"/>` +
        `<rect x="${pillX.toFixed(1)}" y="2" width="${pillW}" height="19" rx="9.5" fill="var(--surface-2)" stroke="${bestCol}" stroke-opacity="0.55" stroke-width="1"/>` +
        `<text x="${pillCx.toFixed(1)}" y="15.2" text-anchor="middle" fill="${bestCol}" font-size="11.5" font-weight="800">${starTxt}</text>`;
    }
    const selLine = isSel && !isBest
      ? `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${baseY.toFixed(1)}" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>`
      : '';
    const hitRect = `<rect class="hr-hit" data-hour-idx="${i}" x="${(x - stepW / 2).toFixed(1)}" y="${padT}" width="${stepW.toFixed(1)}" height="${H - padT}" fill="transparent" style="cursor:pointer;"/>`;
    return `${selLine}${bestSvg}${lbl}${hitRect}`;
  }).join('');

  return `
    ${titleSvg}
    ${dayBands}
    ${dayLabelSvg}
    ${vGrid}
    ${midnightSvg}
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${baseY.toFixed(1)}" stroke="rgba(255,255,255,0.12)"/>
    <line x1="${padL}" y1="${y65.toFixed(1)}" x2="${W - padR}" y2="${y65.toFixed(1)}" stroke="var(--green)" stroke-opacity="0.24" stroke-dasharray="3 4"/>
    <line x1="${padL}" y1="${y40.toFixed(1)}" x2="${W - padR}" y2="${y40.toFixed(1)}" stroke="var(--good)" stroke-opacity="0.22" stroke-dasharray="3 4"/>
    <line x1="${padL}" y1="${y18.toFixed(1)}" x2="${W - padR}" y2="${y18.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 4"/>
    <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="rgba(255,255,255,0.16)"/>
    <text x="${padL - 7}" y="${(y65 + 3.5).toFixed(1)}" text-anchor="end" fill="var(--green)" font-size="10.5" font-weight="700">${en ? 'Excellent' : '極佳'}</text>
    <text x="${padL - 7}" y="${(y40 + 3.5).toFixed(1)}" text-anchor="end" fill="var(--good)" font-size="10.5" font-weight="700">${en ? 'Good' : '適合'}</text>
    <text x="${padL - 7}" y="${(y18 + 3.5).toFixed(1)}" text-anchor="end" fill="var(--amber)" font-size="10.5" font-weight="700">${en ? 'Fair' : '普通'}</text>
    <text x="${padL - 7}" y="${(stripY + 9.5).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="10.5" font-weight="700">${en ? 'Clear' : '晴空'}</text>
    ${scoreBars}
    ${clearStrip}
    ${overlays}
  `;
}

/** True 360° Continuous Polar Clear-Sky Radar SVG (real compass bearing + proportional distance, zero rigid 4-slice grid) */
export function buildCompassRadarSVG(dirResults, originPos, lang) {
  if (!Array.isArray(dirResults) || dirResults.length < 3) return '';
  const en = isEn(lang);
  const byKey = {};
  for (const d of dirResults) {
    if (d && typeof d.key === 'string') byKey[d.key] = d;
  }
  if (!byKey.here) return '';
  const targets = dirResults.filter(d => d && d.key !== 'here');
  const validCardinals = ['N', 'E', 'S', 'W'].filter(k => byKey[k]);
  if (targets.length < 2 || validCardinals.length < 2) return '';

  // Red is strictly reserved for driving hazards (gale/blizzard); cloudy (<35%) uses calm muted grey
  const colOf = (clearPct, sea, unavail, hazard) => unavail ? 'var(--muted)' : (sea ? 'var(--blue)' : (hazard ? 'var(--red)' : (clearPct >= 65 ? 'var(--green)' : clearPct >= 35 ? 'var(--amber)' : 'var(--muted)')));
  const fillOf = (clearPct, sea, unavail, hazard) => unavail ? 'rgba(139,148,165,0.10)' : (sea ? 'var(--blue-bg)' : (hazard ? 'var(--red-bg)' : (clearPct >= 65 ? 'var(--green-bg)' : clearPct >= 35 ? 'var(--amber-bg)' : 'rgba(139,148,165,0.12)')));
  const glyphOf = (clearPct, sea, unavail, hazard) => unavail ? '' : (sea ? '' : (hazard ? '⚠ ' : (clearPct >= 65 ? '✓ ' : clearPct >= 35 ? '~ ' : '✕ ')));

  const CX = 160, CY = 160, R_OUTER = 146, R_MIN = 64, R_MAX = 114;
  const toRad = d => d * Math.PI / 180;
  const oLat = Number(originPos?.lat), oLon = Number(originPos?.lon);
  const hasOrigin = Number.isFinite(oLat) && Number.isFinite(oLon);
  const fallbackBearing = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

  const computeBearingKm = (d) => {
    const dLat = Number(d.lat), dLon = Number(d.lon);
    if (hasOrigin && Number.isFinite(dLat) && Number.isFinite(dLon) && (Math.abs(dLat - oLat) > 1e-4 || Math.abs(dLon - oLon) > 1e-4)) {
      const f1 = toRad(oLat), f2 = toRad(dLat), dl = toRad(dLon - oLon);
      const y = Math.sin(dl) * Math.cos(f2);
      const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
      const deg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      const s1 = Math.sin((f2 - f1) / 2), s2 = Math.sin(dl / 2);
      const a = s1 * s1 + Math.cos(f1) * Math.cos(f2) * s2 * s2;
      const straightKm = 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
      const km = Number.isFinite(d.roadKm) ? d.roadKm : (Number.isFinite(d.distKm) ? d.distKm : Math.round(straightKm));
      return { deg, km: Math.max(10, km) };
    }
    const km = Number.isFinite(d.roadKm) ? d.roadKm : (Number.isFinite(d.distKm) ? d.distKm : 60);
    return { deg: fallbackBearing[d.key] ?? 0, km: Math.max(10, km) };
  };

  const plotted = targets.map(d => {
    const { deg, km } = computeBearingKm(d);
    const unavail = Boolean(d.unavailable) || !Number.isFinite(Number(d.avg3h));
    const clearPct = Math.round(100 - clampNum(d.avg3h, 0, 100, 100));
    const hazard = !d.isOcean && !unavail && ((d.maxWind3h || 0) >= 12 || ((d.maxWind3h || 0) >= 9 && (d.maxPrecip3h || 0) >= 0.2 && (d.temp ?? 5) <= 1.5));
    const cleanLbl = String(d.label || d.key).replace(/^[⬆️⬇️➡️⬅️]+\s*/, '');
    const shortLblRaw = cleanLbl.includes('km')
      ? (en
          ? cleanLbl.replace('往東北 ', 'NE ').replace('往西北 ', 'NW ').replace('往東南 ', 'SE ').replace('往西南 ', 'SW ')
              .replace('往北 ', 'N ').replace('往南 ', 'S ').replace('往東 ', 'E ').replace('往西 ', 'W ').replace(/\s+km$/, 'km')
          : cleanLbl.replace(/^往/, '').replace(/\s+km$/, 'km'))
      : cleanLbl.replace(/^往[東西南北]+\s*/, '');
    return { d, deg, km, unavail, clearPct, hazard, shortLbl: escSvg(d.isOcean ? (en ? 'Sea' : '海面') : shortLblRaw) };
  });

  const maxKmRaw = Math.max(60, ...plotted.map(p => p.km));
  const scaleMaxKm = Math.ceil(maxKmRaw / 20) * 20;
  const midRingKm = Math.round(scaleMaxKm / 2);

  // Place each beacon at its exact compass bearing & proportional distance
  const nodes = plotted.map(p => {
    const r = R_MIN + (Math.min(p.km, scaleMaxKm) / scaleMaxKm) * (R_MAX - R_MIN);
    const rad = toRad(p.deg - 90);
    const px = CX + r * Math.cos(rad);
    const py = CY + r * Math.sin(rad);
    // Offset label slightly outward along bearing (or gently inward near outer rim) so it never clips
    const outBias = r > 100 ? -16 : 16;
    const lx = Math.max(52, Math.min(268, px + Math.cos(rad) * outBias * 0.45));
    const ly = Math.max(36, Math.min(282, py + (py < CY ? -22 : 22)));
    return { ...p, r, rad, px, py, lx, ly };
  });

  // 2-pass label repulsion so closely spaced real-world corridors never overlap
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (Math.abs(a.lx - b.lx) < 76 && Math.abs(a.ly - b.ly) < 28) {
          const push = (28 - Math.abs(a.ly - b.ly)) / 2 + 2;
          if (a.ly <= b.ly) { a.ly -= push; b.ly += push; }
          else { a.ly += push; b.ly -= push; }
          a.ly = Math.max(38, Math.min(280, a.ly));
          b.ly = Math.max(38, Math.min(280, b.ly));
        }
      }
    }
  }

  // Subtle radial spokes (8 compass bearings)
  const radialGuides = [0, 45, 90, 135].map(a => {
    const r1 = toRad(a - 90), r2 = toRad(a + 90);
    return `<line x1="${(CX + R_OUTER * Math.cos(r1)).toFixed(1)}" y1="${(CY + R_OUTER * Math.sin(r1)).toFixed(1)}" x2="${(CX + R_OUTER * Math.cos(r2)).toFixed(1)}" y2="${(CY + R_OUTER * Math.sin(r2)).toFixed(1)}" stroke="rgba(255,255,255,0.055)" stroke-width="1"/>`;
  }).join('');

  // Missing cardinal winter-closed safety marker (e.g., Akureyri closed F26 south)
  const closedMarks = ['N', 'E', 'S', 'W'].filter(k => !byKey[k]).map(k => {
    const rad = toRad(fallbackBearing[k] - 90);
    const cx = CX + 98 * Math.cos(rad);
    const cy = CY + 98 * Math.sin(rad);
    return `<g class="radar-sector radar-closed">
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.2" fill="var(--muted)" fill-opacity="0.45"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 14).toFixed(1)}" text-anchor="middle" fill="var(--muted)" font-size="9.5" font-weight="700" opacity="0.78">${en ? 'Closed in winter' : '冬季封閉'}</text>
    </g>`;
  }).join('');

  const beaconsSvg = nodes.map(n => {
    const col = colOf(n.clearPct, n.d.isOcean, n.unavail, n.hazard);
    const fill = fillOf(n.clearPct, n.d.isOcean, n.unavail, n.hazard);
    const glyph = glyphOf(n.clearPct, n.d.isOcean, n.unavail, n.hazard);
    const valTxt = n.unavail ? '--' : `${glyph}${n.clearPct}%`;
    const kmSub = n.d.isOcean ? '' : ` · ${Math.round(n.km)}km`;
    const rayX1 = CX + 38 * Math.cos(n.rad);
    const rayY1 = CY + 38 * Math.sin(n.rad);
    const pillW = Math.max(66, Math.min(116, Math.max(n.shortLbl.length * 6.8 + (kmSub ? 28 : 10), valTxt.length * 7.8 + 16)));
    return `
      <g class="radar-sector" data-bearing="${Math.round(n.deg)}" data-km="${Math.round(n.km)}">
        <line x1="${rayX1.toFixed(1)}" y1="${rayY1.toFixed(1)}" x2="${n.px.toFixed(1)}" y2="${n.py.toFixed(1)}" stroke="${col}" stroke-opacity="0.34" stroke-width="1.2" stroke-dasharray="${n.d.isOcean || n.unavail || n.hazard ? '3 3' : '2 3'}"/>
        <circle cx="${n.px.toFixed(1)}" cy="${n.py.toFixed(1)}" r="10.5" fill="${fill}"/>
        <circle cx="${n.px.toFixed(1)}" cy="${n.py.toFixed(1)}" r="5" fill="${col}" stroke="var(--bg)" stroke-width="1.6"/>
        <rect x="${(n.lx - pillW / 2).toFixed(1)}" y="${(n.ly - 13).toFixed(1)}" width="${pillW.toFixed(1)}" height="28" rx="8" fill="var(--surface)" fill-opacity="0.90" stroke="${col}" stroke-opacity="0.42" stroke-width="1"/>
        <text x="${n.lx.toFixed(1)}" y="${(n.ly - 1.5).toFixed(1)}" text-anchor="middle" fill="var(--text)" font-size="10" font-weight="750">${n.shortLbl}<tspan fill="var(--muted)" font-size="8.8" font-weight="600">${kmSub}</tspan></text>
        <text x="${n.lx.toFixed(1)}" y="${(n.ly + 11.5).toFixed(1)}" text-anchor="middle" fill="${col}" font-size="11.5" font-weight="900">${valTxt}</text>
      </g>`;
  }).join('');

  const h = byKey.here;
  const hUnavail = Boolean(h.unavailable) || !Number.isFinite(Number(h.avg3h));
  const hClear = Math.round(100 - clampNum(h.avg3h, 0, 100, 100));
  const hCol = colOf(hClear, false, hUnavail, false);
  const hTxt = hUnavail ? '--' : `${en ? '' : '晴 '}${hClear}%`;
  const rMid = R_MIN + 0.5 * (R_MAX - R_MIN);

  return `
    <circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="var(--surface-recessed)" stroke="rgba(255,255,255,0.10)" stroke-width="1.1"/>
    <circle cx="${CX}" cy="${CY}" r="${R_MAX}" fill="none" stroke="rgba(255,255,255,0.065)" stroke-dasharray="2 4"/>
    <circle cx="${CX}" cy="${CY}" r="${rMid.toFixed(1)}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-dasharray="3 4"/>
    ${radialGuides}
    <text x="${CX}" y="22" text-anchor="middle" fill="var(--muted)" font-size="10.5" font-weight="800">${en ? 'N' : '北'}</text>
    <text x="298" y="${CY + 4}" text-anchor="middle" fill="var(--muted)" font-size="10.5" font-weight="800">${en ? 'E' : '東'}</text>
    <text x="${CX}" y="305" text-anchor="middle" fill="var(--muted)" font-size="10.5" font-weight="800">${en ? 'S' : '南'}</text>
    <text x="22" y="${CY + 4}" text-anchor="middle" fill="var(--muted)" font-size="10.5" font-weight="800">${en ? 'W' : '西'}</text>
    <text x="${(CX + rMid * 0.707 + 3).toFixed(1)}" y="${(CY - rMid * 0.707 + 3).toFixed(1)}" fill="var(--muted)" fill-opacity="0.58" font-size="8.5" font-weight="700">${midRingKm}km</text>
    <text x="${(CX + R_MAX * 0.707 + 2).toFixed(1)}" y="${(CY - R_MAX * 0.707 + 3).toFixed(1)}" fill="var(--muted)" fill-opacity="0.58" font-size="8.5" font-weight="700">${scaleMaxKm}km</text>
    ${closedMarks}
    ${beaconsSvg}
    <circle cx="${CX}" cy="${CY}" r="36" fill="var(--bg)" stroke="${hCol}" stroke-width="2.2"/>
    <text x="${CX}" y="${CY - 6}" text-anchor="middle" fill="var(--muted)" font-size="10" font-weight="700">${en ? 'Here (3h)' : '目前 3h'}</text>
    <text x="${CX}" y="${CY + 14}" text-anchor="middle" fill="${hCol}" font-size="15.5" font-weight="900">${hTxt}</text>
  `;
}
