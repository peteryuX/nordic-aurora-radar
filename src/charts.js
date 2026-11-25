/**
 * Nordic Aurora Radar — Pure SVG Visualization Builders
 *
 * All functions return pure SVG inner markup strings with uniform X-axis ticks,
 * L1 telemetry gap handling, and zero side effects.
 */

import {
  isEn, getZoneParts, parseUtcMs, utcTagToLocalHM, computeL1EtaMin, bzToEnergy
} from './aurora-engine.js';
import { TERMS, term } from './glossary.js';

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

  const bgTop = bright ? '#1a3149' : '#0b1b2e';
  const bgMid = bright ? '#233b54' : '#091423';
  const bgBot = bright ? '#08101c' : '#08101c';
  const starOp = bright ? 0 : Math.max(0.10, (100 - cPct) / 100);
  const aurOp = (bright || aSc <= 0) ? 0 : Math.max(0.10, (aSc / 100) * Math.max(0.24, (100 - cPct * 0.85) / 100));
  const cloudOp = Math.min(0.68, Math.max(0.05, (cPct / 100) * 0.66));
  const showMoon = Boolean(moonUp) && !bright;
  const moonOp = showMoon ? Math.max(0.24, (100 - cPct * 0.7) / 100) : 0;
  const moonR = 8 + (mPct / 100) * 6;

  const starCoords = [
    [36,30,1.0],[88,22,0.8],[146,38,1.1],[214,24,0.7],[284,32,1.0],
    [352,20,0.9],[424,34,1.1],[496,26,0.8],[562,40,1.0],[608,28,0.8],
    [66,74,0.7],[182,66,0.9],[316,68,0.8],[460,72,0.9],[580,76,0.8],
    [118,104,0.7],[394,98,0.8],[526,106,0.7]
  ];
  const allowTwinkle = !bright && cPct < 65;
  const twIdx1 = new Set([2, 6, 13]);
  const twIdx2 = new Set([4, 9]);
  const stars = starCoords.map(([x, y, r], idx) => {
    const cls = allowTwinkle ? (twIdx1.has(idx) ? ' class="star-tw"' : (twIdx2.has(idx) ? ' class="star-tw-2"' : '')) : '';
    return `<circle${cls} cx="${x}" cy="${y}" r="${r}" fill="#f5f8ff" opacity="${(starOp * 0.72).toFixed(2)}"/>`;
  }).join('');

  // Zero-filter soft feathered clouds (radial gradient falloff -> 0% per-frame SVG blur cost)
  const clouds = cPct >= 20 ? `
    <g class="cld-anim" opacity="${cloudOp.toFixed(2)}">
      <ellipse cx="135" cy="70" rx="205" ry="44" fill="url(#cldSoftG)"/>
      <ellipse cx="360" cy="60" rx="235" ry="50" fill="url(#cldSoftG)"/>
      <ellipse cx="555" cy="78" rx="195" ry="42" fill="url(#cldSoftG)"/>
    </g>` : '';

  const moonSvg = showMoon ? `
    <g opacity="${moonOp.toFixed(2)}">
      <circle cx="524" cy="42" r="${(moonR * 2.2).toFixed(1)}" fill="url(#moonGlowG)"/>
      <circle cx="524" cy="42" r="${moonR.toFixed(1)}" fill="#fff6db" opacity="0.86"/>
    </g>` : '';

  const aur2Op = aurOp > 0.14 ? (aurOp * 0.72).toFixed(2) : '0';
  const cldCoreCol = bright ? '#486684' : '#18283c';

  return `
    <defs>
      <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgTop}"/>
        <stop offset="56%" stop-color="${bgMid}"/>
        <stop offset="100%" stop-color="${bgBot}"/>
      </linearGradient>
      <linearGradient id="aurG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7c6fd4" stop-opacity="0"/>
        <stop offset="22%" stop-color="#7c6fd4" stop-opacity="0.22"/>
        <stop offset="52%" stop-color="#58dba4" stop-opacity="0.46"/>
        <stop offset="84%" stop-color="#58dba4" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#08101c" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="aurCoreG" cx="46%" cy="44%" r="54%">
        <stop offset="0%" stop-color="#58dba4" stop-opacity="0.34"/>
        <stop offset="48%" stop-color="#48c4d8" stop-opacity="0.16"/>
        <stop offset="76%" stop-color="#7c6fd4" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="#08101c" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="aurG2" cx="62%" cy="48%" r="52%">
        <stop offset="0%" stop-color="#58dba4" stop-opacity="0.32"/>
        <stop offset="45%" stop-color="#48c4d8" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#08101c" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="cldSoftG" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${cldCoreCol}" stop-opacity="0.86"/>
        <stop offset="54%" stop-color="${cldCoreCol}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${cldCoreCol}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="moonGlowG" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffefc2" stop-opacity="0.24"/>
        <stop offset="60%" stop-color="#ffefc2" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="#ffefc2" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="horizonFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${bgBot}" stop-opacity="0"/>
        <stop offset="72%" stop-color="${bgBot}" stop-opacity="0.92"/>
        <stop offset="100%" stop-color="${bgBot}" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="640" height="225" fill="url(#skyG)"/>
    ${stars}
    ${aurOp > 0 ? `<g class="aur-anim" opacity="${aurOp.toFixed(2)}">
      <ellipse cx="290" cy="86" rx="340" ry="96" fill="url(#aurCoreG)"/>
      <path d="M-32,18 C88,0 178,56 316,26 C442,0 534,42 672,18 L672,158 C532,178 432,134 310,162 C176,188 82,140 -32,160 Z" fill="url(#aurG)"/>
    </g>` : ''}
    ${aurOp > 0.14 ? `<g class="aur-anim-2" opacity="${aur2Op}">
      <ellipse cx="400" cy="102" rx="310" ry="88" fill="url(#aurG2)"/>
    </g>` : ''}
    ${moonSvg}
    ${clouds}
    <rect y="128" width="640" height="97" fill="url(#horizonFade)"/>
  `;
}

/**
 * Solar Wind Energy & Earth-Arrival Chart (uniform 30-min :00/:30 local arrival ticks,
 * L1 telemetry dropout splitting when consecutive gaps exceed 5 minutes).
 */
export function buildBzChartSVG(series, timeZone, speed, balOpt, lang, selectedIdx = -1) {
  const en = isEn(lang);
  if (!Array.isArray(series) || series.length < 2) {
    return `<text x="210" y="84" text-anchor="middle" fill="var(--muted)" font-size="13" font-weight="600">${en ? 'No live satellite energy data' : '暫無衛星即時太陽風曲線'}</text>`;
  }
  const W = 420, H = 156, padL = 56, padR = 14, padT = 22, padB = 26;
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
  const lastIdx = energies.length - 1;
  const lastE = energies[lastIdx];
  const lx = xOf(lastIdx), ly = yOf(lastE);
  const colOf = e => (e >= 62 ? 'var(--green)' : e >= 25 ? 'var(--amber)' : 'var(--muted)');
  const col = colOf(lastE);

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
    return `<polyline fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" points="${sPts}"/>`;
  }).join('');

  let gapSvg = '';
  for (let s = 1; s < segments.length; s++) {
    const iA = segments[s - 1][segments[s - 1].length - 1];
    const iB = segments[s][0];
    gapSvg += `<line x1="${xOf(iA).toFixed(1)}" y1="${yOf(energies[iA]).toFixed(1)}" x2="${xOf(iB).toFixed(1)}" y2="${yOf(energies[iB]).toFixed(1)}" stroke="var(--chart-axis)" stroke-width="1.3" stroke-dasharray="2 4"/>`;
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
      if (tx < padL + 14 || tx > W - padR - 14) continue;
      const z = getZoneParts(new Date(t), timeZone);
      xTicksSvg += `
        <line x1="${tx.toFixed(1)}" y1="${baseY}" x2="${tx.toFixed(1)}" y2="${(padT + plotH + 3.5).toFixed(1)}" stroke="var(--chart-axis)" stroke-width="1"/>
        <text x="${tx.toFixed(1)}" y="${H - 6}" text-anchor="middle" fill="var(--muted)" font-size="12" font-weight="500">${escSvg(z.hourStr)}:${escSvg(z.minStr)}</text>`;
    }
  }
  if (!xTicksSvg) {
    const tStart = escSvg(utcTagToLocalHM(series[0]?.time_tag, timeZone, etaMin));
    const tEnd = escSvg(utcTagToLocalHM(series[lastIdx]?.time_tag, timeZone, etaMin));
    xTicksSvg = `
      <text x="${padL}" y="${H - 6}" fill="var(--muted)" font-size="12" font-weight="500">${tStart}</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" fill="var(--text)" font-size="12" font-weight="500">${tEnd}</text>`;
  }

  let arriveSvg = '';
  let futureBandSvg = '';
  if (balOpt && Number.isInteger(balOpt.arrivingIdx) && balOpt.arrivingIdx > 4 && balOpt.arrivingIdx < series.length - 4) {
    const ax = xOf(balOpt.arrivingIdx);
    const tNowEarth = escSvg(utcTagToLocalHM(series[balOpt.arrivingIdx]?.time_tag, timeZone, etaMin));
    const lxClamped = Math.max(padL + 84, Math.min(W - padR - 40, ax));
    const futureW = Math.max(0, W - padR - ax);
    futureBandSvg = `<rect x="${ax.toFixed(1)}" y="${padT}" width="${futureW.toFixed(1)}" height="${plotH}" fill="var(--text)" fill-opacity="0.035"/>`;
    arriveSvg = `
      <line x1="${ax.toFixed(1)}" y1="${padT}" x2="${ax.toFixed(1)}" y2="${baseY}" stroke="var(--text)" stroke-width="1" opacity="0.34"/>
      <circle cx="${ax.toFixed(1)}" cy="${yOf(energies[balOpt.arrivingIdx]).toFixed(1)}" r="3.2" fill="var(--text)" stroke="var(--bg)" stroke-width="1.4"/>
      <text x="${lxClamped.toFixed(1)}" y="14" text-anchor="middle" fill="var(--text-soft)" font-size="11.5" font-weight="600">${en ? `Now ${tNowEarth}` : `現在 ${tNowEarth}`}</text>`;
  }

  const hasSel = Number.isInteger(selectedIdx) && selectedIdx >= 0 && selectedIdx < energies.length;
  let scrubSvg = '';
  if (hasSel) {
    const sx = xOf(selectedIdx), sy = yOf(energies[selectedIdx]);
    const sCol = colOf(energies[selectedIdx]);
    scrubSvg = `
      <line data-role="scrubber" x1="${sx.toFixed(1)}" y1="${padT}" x2="${sx.toFixed(1)}" y2="${baseY}" stroke="var(--text)" stroke-opacity="0.55" stroke-width="1.2"/>
      <circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="7.5" fill="${sCol}" fill-opacity="0.22"/>
      <circle data-role="scrubber-dot" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="4.5" fill="${sCol}" stroke="var(--bg)" stroke-width="1.8"/>`;
  }
  const endDotSvg = (!hasSel || selectedIdx !== lastIdx)
    ? `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="${hasSel ? '3.0' : '4.4'}" fill="${col}" stroke="var(--bg)" stroke-width="${hasSel ? '1.3' : '1.8'}"/>`
    : '';

  return `
    <defs>
      <linearGradient id="enGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${col}" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="${col}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <text x="${padL}" y="14" data-role="y-title" fill="var(--muted)" font-size="11.5" font-weight="600">${term(TERMS.solarWind.axisTitle, en)}</text>
    ${futureBandSvg}
    ${xTicksSvg}
    <line x1="${padL}" y1="${yBurst.toFixed(1)}" x2="${W - padR}" y2="${yBurst.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1"/>
    <line x1="${padL}" y1="${yWarm.toFixed(1)}" x2="${W - padR}" y2="${yWarm.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1"/>
    <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="var(--chart-axis)"/>
    <text x="${padL - 8}" y="${(yBurst + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11.5" font-weight="500">${term(TERMS.solarWind.active, en)}</text>
    <text x="${padL - 8}" y="${(yWarm + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11.5" font-weight="500">${term(TERMS.solarWind.building, en)}</text>
    ${areaSvg}
    ${gapSvg}
    ${lineSvg}
    ${arriveSvg}
    ${endDotSvg}
    ${scrubSvg}
  `;
}

/** 24h Single-Metric Viewing-Score Bar Chart + Separated Clear-Sky Context Strip (Direction B Nordic 1P) */
export function buildSkyWaveSVG(hrs, bestDark, selectedIdx = -1, lang) {
  const en = isEn(lang);
  if (!Array.isArray(hrs) || hrs.length < 2) {
    return `<text x="210" y="78" text-anchor="middle" fill="var(--muted)" font-size="12.5">${en ? 'Loading hourly forecast…' : '讀取逐時預報中…'}</text>`;
  }
  const is24 = hrs.length > 14;
  const tickStep = is24 ? 4 : 2;
  const W = 420, H = 156, padL = 56, padR = 10, padT = 22;
  const plotH = 88; // Score bars: y=22..110; Clear-sky strip: y=115..119.5; Zone rail: y=132.5; X-axis: y=149
  const plotW = W - padL - padR;
  const stripY = 115, stripH = 4.5;
  const xOf = i => padL + (i / (hrs.length - 1)) * plotW;
  const yOf = sc => padT + ((100 - clampNum(sc, 0, 100, 0)) / 100) * plotH;
  const stepW = plotW / (hrs.length - 1);
  const tierFill = sc => (sc >= 65 ? 'var(--green)' : sc >= 40 ? 'var(--good)' : sc >= 18 ? 'var(--amber)' : 'var(--bar-dim)');

  const nightHrs = hrs.filter(h => h && !h.isDay);
  const allOutOfZone = nightHrs.length > 0 && nightHrs.every(h => Boolean(h.outOfZone));

  // Live (+0..3h nowcast) vs Trend (+4..23h 51-member ensemble) visual horizon split:
  // soft surface tint marks the +0..3h Live window; a short clean tick separates 即時 | 趨勢 on the bottom rail (no tall dashed fence)
  const hasSplit = hrs.length >= 6;
  const splitX = hasSplit ? (xOf(3) + xOf(4)) / 2 : -1;
  const liveBgSvg = hasSplit
    ? `<rect x="${padL}" y="${padT}" width="${(splitX - padL).toFixed(1)}" height="${plotH}" fill="var(--surface-2)" fill-opacity="0.50"/>`
    : '';
  const splitSvg = hasSplit
    ? `<line data-role="horizon-split" x1="${splitX.toFixed(1)}" y1="123.5" x2="${splitX.toFixed(1)}" y2="133.5" stroke="var(--chart-mid)" stroke-width="1" opacity="0.55"/>` +
      `<text data-role="zone-live" x="${(splitX - 5).toFixed(1)}" y="132" text-anchor="end" fill="var(--text-soft)" font-size="10.5" font-weight="600">${term(TERMS.nowcastShort, en)}</text>` +
      `<text data-role="zone-trend" x="${(splitX + 5).toFixed(1)}" y="132" text-anchor="start" fill="var(--muted)" font-size="10.5" font-weight="500">${term(TERMS.trendShort, en)}</text>`
    : '';

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
    if (dx2 - dx1 >= 40) {
      dayLabelX = (dx1 + dx2) / 2;
      dayLabelSvg = `<text x="${dayLabelX.toFixed(1)}" y="${padT + 15}" text-anchor="middle" fill="var(--blue)" font-size="11" font-weight="600">${term(TERMS.status.tooBright, en)}</text>`;
    }
  }

  const bestIdx = (!allOutOfZone && bestDark && ((bestDark.clear ?? 0) >= 25 || (bestDark.score ?? 0) >= 18))
    ? hrs.findIndex(h => h && !h.isDay && ((Number.isFinite(bestDark.dtMs) && Number.isFinite(h.dtMs)) ? h.dtMs === bestDark.dtMs : h.time === bestDark.time))
    : -1;
  const bestX = bestIdx >= 0 ? xOf(bestIdx) : -1;
  const titleOnRight = bestIdx >= 0 && bestX < 210;
  const titleTxt = en ? `${term(TERMS.score, true)} (0–99)` : `${term(TERMS.score, false)}（0–99）`;
  const titleSvg = titleOnRight
    ? `<text x="${W - padR}" y="13.5" data-role="y-title" text-anchor="end" fill="var(--muted)" font-size="11" font-weight="500">${titleTxt}</text>`
    : `<text x="${padL}" y="13.5" data-role="y-title" fill="var(--muted)" font-size="11" font-weight="500">${titleTxt}</text>`;

  // Single calm solid vertical hairline for the midnight (00:00) day boundary
  let midnightSvg = '';
  const midIdx = hrs.findIndex((h, i) => i > 0 && i < hrs.length - 1 && typeof h?.time === 'string' && h.time.startsWith('00:'));
  if (midIdx > 0) {
    const mx = xOf(midIdx);
    const tooCloseToBest = bestX >= 0 && Math.abs(mx - bestX) < 52;
    const tooCloseToDay = Math.abs(mx - dayLabelX) < 42;
    const midLine = `<line data-role="midnight-line" x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="var(--chart-axis)" stroke-width="1" opacity="0.72"/>`;
    const midLbl = (!tooCloseToBest && !tooCloseToDay)
      ? `<text x="${Math.min(W - padR - 18, mx + 4).toFixed(1)}" y="${padT + 13}" text-anchor="start" fill="var(--muted)" font-size="10.5" font-weight="500">${term(TERMS.tomorrow, en)}</text>`
      : '';
    midnightSvg = `${midLine}${midLbl}`;
  }

  // Tier guide lines at 65 (Excellent), 40 (Good) — calm solid hairlines, zero dashed clutter
  const y65 = yOf(65), y40 = yOf(40), baseY = padT + plotH;
  const barW = is24 ? 7.6 : Math.max(9, Math.min(16, stepW * 0.44));
  const barRx = 2.2;
  const tileW = Math.max(4, stepW - 2.6);

  const scoreBars = allOutOfZone
    ? `<text x="${(padL + plotW / 2).toFixed(1)}" y="${(padT + plotH / 2 + 4).toFixed(1)}" text-anchor="middle" fill="var(--muted)" font-size="12" font-weight="600">${term(TERMS.status.outOfZoneLong, en)}</text>`
    : hrs.map((h, i) => {
        if (!h || h.isDay) return '';
        const scVal = clampNum(h?.score, 0, 100, 0);
        const x = xOf(i) - barW / 2;
        const isSel = i === selectedIdx;
        const isBest = i === bestIdx;
        const isTrend = hasSplit && i >= 4;
        if (scVal <= 0) {
          return `<rect class="sc-bar" data-bar-idx="${i}" x="${x.toFixed(1)}" y="${(baseY - 2.5).toFixed(1)}" width="${barW.toFixed(1)}" height="2.5" rx="1" fill="var(--bar-dim)" fill-opacity="${isSel ? '1' : (isTrend ? '0.45' : '0.6')}"/>`;
        }
        const y = yOf(scVal);
        const bh = Math.max(3.5, baseY - y);
        const fill = tierFill(scVal);
        const op = isTrend
          ? (isSel ? '0.92' : (isBest ? '0.74' : '0.52'))
          : (isSel ? '1' : (isBest ? '0.94' : '0.86'));
        // Soft same-width translucent range capsule behind the bar (zero spiky vertical pins)
        const showRange = isTrend && !h.outOfZone && scVal >= 12
          && Number.isFinite(h.scoreLow) && Number.isFinite(h.scoreHigh)
          && (h.scoreHigh - h.scoreLow) >= 18;
        let rangeSvg = '';
        if (showRange) {
          const yHi = Math.max(padT + 1.5, yOf(h.scoreHigh));
          const yLo = Math.min(baseY, yOf(h.scoreLow));
          const rh = Math.max(3.5, yLo - yHi);
          rangeSvg = `<rect data-role="score-range" x="${x.toFixed(1)}" y="${yHi.toFixed(1)}" width="${barW.toFixed(1)}" height="${rh.toFixed(1)}" rx="${barRx}" fill="${fill}" fill-opacity="${isSel ? '0.24' : '0.16'}"/>`;
        }
        const capDot = isSel
          ? `<circle cx="${xOf(i).toFixed(1)}" cy="${Math.max(padT + 2.5, y).toFixed(1)}" r="3.2" fill="var(--text)" stroke="var(--bg)" stroke-width="1.4"/>`
          : (isBest ? `<circle data-role="best-dot" cx="${xOf(i).toFixed(1)}" cy="${Math.max(padT + 2.5, y - 4.5).toFixed(1)}" r="2.2" fill="${fill}"/>` : '');
        return `${rangeSvg}<rect class="sc-bar" data-bar-idx="${i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${barRx}" fill="${fill}" fill-opacity="${op}"/>${capDot}`;
      }).join('');

  // Separated Clear-Sky Context Strip (soft glacier blue luminance — clear sky = bright blue, overcast = dark)
  const clearStrip = hrs.map((h, i) => {
    const clearVal = clampNum(h?.clear, 0, 100, 0);
    const x = xOf(i) - tileW / 2;
    const tx = Math.max(padL, x);
    const tw = Math.max(2, Math.min(tileW, W - padR - tx));
    const isTrend = hasSplit && i >= 4;
    const op = (0.08 + (isTrend ? 0.60 : 0.72) * (clearVal / 100)).toFixed(2);
    const isSel = i === selectedIdx;
    return `<rect x="${tx.toFixed(1)}" y="${stripY}" width="${tw.toFixed(1)}" height="${stripH}" rx="2" fill="var(--blue)" fill-opacity="${op}"${isSel ? ' stroke="var(--text)" stroke-width="0.9"' : ''}/>`;
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
      ? `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="${isSel ? 'var(--text)' : (isBest ? bestCol : 'var(--muted)')}" font-size="11.5" font-weight="${isBest || isSel ? '600' : '500'}">${hhmm}</text>`
      : '';
    let bestSvg = '';
    if (isBest) {
      const peakTxt = `${hhmm} ${term(TERMS.best, en)}`;
      const tx = Math.max(padL + 36, Math.min(W - padR - 36, x));
      bestSvg = `<text x="${tx.toFixed(1)}" y="13.5" text-anchor="middle" fill="${bestCol}" font-size="11.5" font-weight="600">${peakTxt}</text>`;
    }
    const selLine = isSel
      ? `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${baseY.toFixed(1)}" stroke="var(--text)" stroke-opacity="0.34" stroke-width="1.1"/>`
      : '';
    const hitRect = `<rect class="hr-hit" data-hour-idx="${i}" x="${(x - stepW / 2).toFixed(1)}" y="${padT}" width="${stepW.toFixed(1)}" height="${H - padT}" fill="transparent" style="cursor:pointer;"/>`;
    return `${selLine}${bestSvg}${lbl}${hitRect}`;
  }).join('');

  return `
    ${titleSvg}
    ${liveBgSvg}
    ${dayBands}
    ${dayLabelSvg}
    ${midnightSvg}
    <line x1="${padL}" y1="${y65.toFixed(1)}" x2="${W - padR}" y2="${y65.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1"/>
    <line x1="${padL}" y1="${y40.toFixed(1)}" x2="${W - padR}" y2="${y40.toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1"/>
    <line x1="${padL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="var(--chart-axis)"/>
    <text x="${padL - 8}" y="${(y65 + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11.5" font-weight="500">${term(TERMS.tier.excellent, en)}</text>
    <text x="${padL - 8}" y="${(y40 + 4).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11.5" font-weight="500">${term(TERMS.tier.goodShort, en)}</text>
    <text x="${padL - 8}" y="${(stripY + 5).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="11" font-weight="500">${term(TERMS.clearShort, en)}</text>
    ${scoreBars}
    ${clearStrip}
    ${splitSvg}
    ${overlays}
  `;
}

/** True 360° Continuous Polar Clear-Sky Radar SVG (clickable beacons, real compass bearing + proportional distance) */
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

  const CX = 160, CY = 160, R_OUTER = 146, R_MIN = 64, R_MAX = 112;
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
    return { d, deg, km, unavail, clearPct, hazard, shortLbl: escSvg(d.isOcean ? term(TERMS.status.sea, en) : shortLblRaw) };
  });

  const maxKmRaw = Math.max(60, ...plotted.map(p => p.km));
  const scaleMaxKm = Math.ceil(maxKmRaw / 20) * 20;
  const midRingKm = Math.round(scaleMaxKm / 2);

  // Place each beacon at its exact compass bearing & proportional distance, safely inset from N/E/S/W
  const nodes = plotted.map(p => {
    const r = R_MIN + (Math.min(p.km, scaleMaxKm) / scaleMaxKm) * (R_MAX - R_MIN);
    const rad = toRad(p.deg - 90);
    const px = CX + r * Math.cos(rad);
    const py = CY + r * Math.sin(rad);
    const outBias = r > 98 ? -14 : 16;
    const lx = Math.max(66, Math.min(254, px + Math.cos(rad) * outBias * 0.45));
    const ly = Math.max(44, Math.min(276, py + (py < CY ? -22 : 22)));
    return { ...p, r, rad, px, py, lx, ly };
  });

  // 3-pass label repulsion so closely spaced real-world corridors never overlap
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (Math.abs(a.lx - b.lx) < 82 && Math.abs(a.ly - b.ly) < 30) {
          const push = (30 - Math.abs(a.ly - b.ly)) / 2 + 2;
          if (a.ly <= b.ly) { a.ly -= push; b.ly += push; }
          else { a.ly += push; b.ly -= push; }
          a.ly = Math.max(44, Math.min(276, a.ly));
          b.ly = Math.max(44, Math.min(276, b.ly));
        }
      }
    }
  }

  // Subtle radial spokes (8 compass bearings)
  const radialGuides = [0, 45, 90, 135].map(a => {
    const r1 = toRad(a - 90), r2 = toRad(a + 90);
    return `<line x1="${(CX + R_OUTER * Math.cos(r1)).toFixed(1)}" y1="${(CY + R_OUTER * Math.sin(r1)).toFixed(1)}" x2="${(CX + R_OUTER * Math.cos(r2)).toFixed(1)}" y2="${(CY + R_OUTER * Math.sin(r2)).toFixed(1)}" stroke="var(--chart-grid)" stroke-width="1"/>`;
  }).join('');

  // Missing cardinal winter-closed safety marker (e.g., Akureyri closed F26 south)
  const closedMarks = ['N', 'E', 'S', 'W'].filter(k => !byKey[k]).map(k => {
    const rad = toRad(fallbackBearing[k] - 90);
    const cx = CX + 98 * Math.cos(rad);
    const cy = CY + 98 * Math.sin(rad);
    return `<g class="radar-sector radar-closed">
      <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.4" fill="var(--muted)" fill-opacity="0.5"/>
      <text x="${cx.toFixed(1)}" y="${(cy + 15).toFixed(1)}" text-anchor="middle" fill="var(--muted)" font-size="10.5" font-weight="600">${term(TERMS.status.closedWinter, en)}</text>
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
    const pillW = Math.max(72, Math.min(124, Math.max(n.shortLbl.length * 7.2 + (kmSub ? 32 : 12), valTxt.length * 8 + 18)));
    return `
      <g class="radar-sector" data-dir-key="${escSvg(n.d.key)}" data-bearing="${Math.round(n.deg)}" data-km="${Math.round(n.km)}" style="cursor:pointer;">
        <line x1="${rayX1.toFixed(1)}" y1="${rayY1.toFixed(1)}" x2="${n.px.toFixed(1)}" y2="${n.py.toFixed(1)}" stroke="${col}" stroke-opacity="0.38" stroke-width="1.2" stroke-dasharray="${n.d.isOcean || n.unavail || n.hazard ? '3 3' : '2 3'}"/>
        <circle cx="${n.px.toFixed(1)}" cy="${n.py.toFixed(1)}" r="11" fill="${fill}"/>
        <circle cx="${n.px.toFixed(1)}" cy="${n.py.toFixed(1)}" r="5" fill="${col}" stroke="var(--bg)" stroke-width="1.6"/>
        <rect x="${(n.lx - pillW / 2).toFixed(1)}" y="${(n.ly - 14).toFixed(1)}" width="${pillW.toFixed(1)}" height="30" rx="8" fill="var(--bg)" fill-opacity="0.90" stroke="${col}" stroke-opacity="0.45" stroke-width="0.9"/>
        <text x="${n.lx.toFixed(1)}" y="${(n.ly - 1.5).toFixed(1)}" text-anchor="middle" fill="var(--text)" font-size="10.5" font-weight="600">${n.shortLbl}<tspan fill="var(--muted)" font-size="9.8" font-weight="500">${kmSub}</tspan></text>
        <text x="${n.lx.toFixed(1)}" y="${(n.ly + 12).toFixed(1)}" text-anchor="middle" fill="${col}" font-size="11.5" font-weight="600">${valTxt}</text>
      </g>`;
  }).join('');

  const h = byKey.here;
  const hUnavail = Boolean(h.unavailable) || !Number.isFinite(Number(h.avg3h));
  const hClear = Math.round(100 - clampNum(h.avg3h, 0, 100, 100));
  const hCol = colOf(hClear, false, hUnavail, false);
  const hTxt = hUnavail ? '--' : `${en ? '' : '晴空 '}${hClear}%`;
  const rMid = R_MIN + 0.5 * (R_MAX - R_MIN);

  return `
    <circle cx="${CX}" cy="${CY}" r="${R_OUTER}" fill="var(--surface-recessed)" stroke="var(--chart-axis)" stroke-width="1.1"/>
    <circle cx="${CX}" cy="${CY}" r="${R_MAX}" fill="none" stroke="var(--chart-grid)" stroke-dasharray="2 4"/>
    <circle cx="${CX}" cy="${CY}" r="${rMid.toFixed(1)}" fill="none" stroke="var(--chart-grid)" stroke-dasharray="3 4"/>
    ${radialGuides}
    <text x="${CX}" y="22" text-anchor="middle" fill="var(--muted)" font-size="11.5" font-weight="600">${en ? 'N' : '北'}</text>
    <text x="298" y="${CY + 4}" text-anchor="middle" fill="var(--muted)" font-size="11.5" font-weight="600">${en ? 'E' : '東'}</text>
    <text x="${CX}" y="305" text-anchor="middle" fill="var(--muted)" font-size="11.5" font-weight="600">${en ? 'S' : '南'}</text>
    <text x="22" y="${CY + 4}" text-anchor="middle" fill="var(--muted)" font-size="11.5" font-weight="600">${en ? 'W' : '西'}</text>
    <text x="${(CX + rMid * 0.707 + 3).toFixed(1)}" y="${(CY - rMid * 0.707 + 3).toFixed(1)}" fill="var(--muted)" font-size="10" font-weight="500">${midRingKm}km</text>
    <text x="${(CX + R_MAX * 0.707 + 2).toFixed(1)}" y="${(CY - R_MAX * 0.707 + 3).toFixed(1)}" fill="var(--muted)" font-size="10" font-weight="500">${scaleMaxKm}km</text>
    ${closedMarks}
    ${beaconsSvg}
    <circle cx="${CX}" cy="${CY}" r="38" fill="var(--bg)" stroke="${hCol}" stroke-width="2"/>
    <text x="${CX}" y="${CY - 6}" text-anchor="middle" fill="var(--muted)" font-size="10.5" font-weight="500">${en ? 'Here (3h)' : '目前 3h'}</text>
    <text x="${CX}" y="${CY + 14}" text-anchor="middle" fill="${hCol}" font-size="14" font-weight="600">${hTxt}</text>
  `;
}

// ====== Unified 1.5px Nordic Duotone Micro-Icons & Early-Warning Signal Bar ======

/**
 * Crisp 16x16 clear-sky / cloud status icon for the 3-column metrics strip.
 */
export function buildSkyFactorIcon(clearPct = 0, isTooBright = false) {
  const c = clampNum(clearPct, 0, 100, 0);
  if (isTooBright) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="var(--blue)" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.1" fill="var(--blue)" fill-opacity="0.14"/><path d="M8 2v1.3M8 12.7V14M2 8h1.3M12.7 8H14M3.8 3.8l.9.9M11.3 11.3l.9.9M12.2 3.8l-.9.9M4.7 11.3l-.9.9"/></svg>`;
  }
  if (c >= 70) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="var(--green)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.2l1.2 3.6 3.6 1.2-3.6 1.2L8 11.8 6.8 8.2 3.2 7l3.6-1.2L8 2.2z" fill="var(--green)" fill-opacity="0.16"/><circle cx="12.8" cy="3.5" r="0.8" fill="var(--green)" stroke="none"/></svg>`;
  }
  if (c >= 35) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M11.4 2.4l.55 1.65 1.65.55-1.65.55-.55 1.65-.55-1.65-1.65-.55 1.65-.55.55-1.65z" fill="var(--amber)"/><path d="M4.8 13h6.4a2.3 2.3 0 0 0 .3-4.58A3.2 3.2 0 0 0 5.3 7.5a2.7 2.7 0 0 0-.5 5.5z" fill="var(--svg-cloud-fill)" stroke="var(--amber)" stroke-width="1.4"/></svg>`;
  }
  return `<svg viewBox="0 0 16 16" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.6h7a2.5 2.5 0 0 0 .35-4.97 3.55 3.55 0 0 0-6.8-1.05A2.85 2.85 0 0 0 4.5 12.6z" fill="var(--svg-cloud-fill)" stroke="var(--muted)" stroke-width="1.4"/></svg>`;
}

/**
 * Crisp 16x16 vertical aurora curtain pillar icon for the 3-column metrics strip.
 */
export function buildAuroraFactorIcon(auroraScore = 0) {
  const a = clampNum(auroraScore, 0, 100, 0);
  const col = a >= 65 ? 'var(--green)' : (a >= 35 ? 'var(--amber)' : 'var(--muted)');
  if (a >= 65) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="${col}" stroke-width="1.45" stroke-linecap="round"><path d="M3.5 12.5V6.5M6.5 12.5V3.8M9.5 12.5V5.2M12.5 12.5V7.5"/><path d="M3 13.5h10" opacity="0.35"/></svg>`;
  }
  if (a >= 35) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="${col}" stroke-width="1.45" stroke-linecap="round"><path d="M4.5 12.5V8M8 12.5V5.8M11.5 12.5V8.5"/><path d="M3 13.5h10" opacity="0.35"/></svg>`;
  }
  return `<svg viewBox="0 0 16 16" fill="none" stroke="${col}" stroke-width="1.4" stroke-linecap="round"><path d="M5 12.5V10M8 12.5V8.8M11 12.5V10.4"/><path d="M3 13.5h10" opacity="0.35"/></svg>`;
}

/**
 * Scientifically accurate 16x16 moon-phase / dark-sky / twilight icon.
 * Uses --moon-fill CSS variable so red-mode collapses seamlessly with zero white leak.
 */
export function buildMoonPhaseIcon({ pct = 0, up = false, waxing = true, isTooBright = false } = {}) {
  if (isTooBright) {
    return `<svg viewBox="0 0 16 16" fill="none" stroke="var(--blue)" stroke-width="1.45" stroke-linecap="round"><path d="M2.2 11.8h11.6"/><path d="M4.6 11.8a3.4 3.4 0 0 1 6.8 0"/><path d="M8 4.2v1.6M3.9 6.6l1.1 1.1M12.1 6.6L11 7.7"/></svg>`;
  }
  if (!up) {
    // Moon below horizon -> unobstructed dark night sky
    return `<svg viewBox="0 0 16 16" fill="none" stroke="var(--green)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12.2 9.6A4.8 4.8 0 0 1 6.4 3.8a4.8 4.8 0 1 0 5.8 5.8z" fill="var(--green)" fill-opacity="0.18"/></svg>`;
  }
  const f = clampNum(pct, 0, 100, 0) / 100;
  const r = 5.2;
  const cx = 8, cy = 8;
  const topY = (cy - r).toFixed(2);
  const botY = (cy + r).toFixed(2);
  if (f <= 0.04) {
    return `<svg viewBox="0 0 16 16" fill="none"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--svg-cloud-fill)" stroke="var(--muted)" stroke-width="1.35"/></svg>`;
  }
  if (f >= 0.96) {
    return `<svg viewBox="0 0 16 16" fill="none"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--moon-fill)" stroke="var(--moon-fill)" stroke-opacity="0.38" stroke-width="1"/></svg>`;
  }
  const rx = (Math.abs(1 - 2 * f) * r).toFixed(2);
  const outerSweep = waxing ? 1 : 0;
  const innerSweep = waxing ? (f < 0.5 ? 0 : 1) : (f < 0.5 ? 1 : 0);
  const litPath = `M ${cx} ${topY} A ${r} ${r} 0 0 ${outerSweep} ${cx} ${botY} A ${rx} ${r} 0 0 ${innerSweep} ${cx} ${topY} Z`;
  return `<svg viewBox="0 0 16 16" fill="none"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--svg-cloud-fill)" stroke="var(--muted)" stroke-opacity="0.55" stroke-width="1.2"/><path d="${litPath}" fill="var(--moon-fill)"/></svg>`;
}

/**
 * Crisp 20x20 vertical aurora pillars / clear-star / cloud icon for 3-Night Outlook rows.
 */
export function buildOutlookSkyIcon({ score = 0, clearPct = null, scoreAvailable = true } = {}) {
  if (!scoreAvailable) {
    return `<svg viewBox="0 0 20 20" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linecap="round"><path d="M3 14.5h14"/><path d="M6 14.5a4 4 0 0 1 8 0"/><path d="M10 5.5v1.8M5.2 8.2l1.2 1.2M14.8 8.2l-1.2 1.2"/></svg>`;
  }
  const s = clampNum(score, 0, 99, 0);
  const c = clearPct === null || clearPct === undefined ? 50 : clampNum(clearPct, 0, 100, 50);
  if (s >= 60) {
    return `<svg viewBox="0 0 20 20" fill="none" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round"><path d="M4.5 15.5V8.5M8 15.5V4.8M11.5 15.5V6.5M15 15.5V9.5"/><circle cx="15.5" cy="4.2" r="1.05" fill="var(--green)" stroke="none"/></svg>`;
  }
  if (s >= 40) {
    return `<svg viewBox="0 0 20 20" fill="none" stroke="var(--good)" stroke-width="1.5" stroke-linecap="round"><path d="M5.5 15.5V9.5M9.5 15.5V6.5M13.5 15.5V8.5"/><circle cx="15.2" cy="5.2" r="0.95" fill="var(--good)" stroke="none"/></svg>`;
  }
  if (c >= 45) {
    return `<svg viewBox="0 0 20 20" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M14.2 3.8l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4z" fill="var(--amber)"/><path d="M5.5 15h8.2a2.6 2.6 0 0 0 .3-5.18 3.6 3.6 0 0 0-7-1.05A3 3 0 0 0 5.5 15z" fill="var(--svg-cloud-fill)" stroke="var(--amber)" stroke-width="1.45"/></svg>`;
  }
  return `<svg viewBox="0 0 20 20" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M5.2 15h9.2a2.9 2.9 0 0 0 .4-5.77 4.1 4.1 0 0 0-7.9-1.2A3.3 3.3 0 0 0 5.2 15z" fill="var(--svg-cloud-fill)" stroke="var(--muted)" stroke-width="1.45"/></svg>`;
}

/**
 * Plain-language Aurora Early-Warning Signal Bar (#swMeter).
 * Translates upstream L1 solar wind (Bz + speed) into an intuitive 0-100% burst-signal meter
 * (Quiet -> Building -> Burst likely) with zero space-physics jargon on the main surface.
 */
export function buildSolarWindMeterHtml({ bz = null, speed = null, energy = null, en = false } = {}) {
  const hasE = energy !== null && Number.isFinite(Number(energy));
  const hasBz = bz !== null && Number.isFinite(Number(bz));
  if (!hasE && !hasBz) return '';
  const spdVal = Number.isFinite(Number(speed)) ? Number(speed) : 420;
  const rawE = hasE ? clampNum(energy, 0, 100, 4) : bzToEnergy(Number(bz), spdVal); // 0..100 normalized incoming aurora coupling
  const posPct = Math.max(5, Math.min(95, Math.round(rawE)));
  const isStrong = rawE >= 62;
  const isBuild = rawE >= 25;
  const dotCol = isStrong ? 'var(--green)' : (isBuild ? 'var(--amber)' : 'var(--muted)');
  const l1 = en ? 'Quiet' : '平靜';
  const l2 = en ? 'Building' : '增強';
  const l3 = en ? 'Burst likely' : '可能爆發';
  const aria = en ? `Aurora burst signal ${posPct}%` : `極光爆發訊號強度 ${posPct}%`;
  return `
    <div class="sw-meter-track" role="img" aria-label="${escSvg(aria)}">
      <div class="sw-meter-grad"></div>
      <div class="sw-meter-fill" style="width:${posPct}%;background:${dotCol};"></div>
      <div class="sw-meter-dot" style="left:${posPct}%;background:${dotCol};"></div>
    </div>
    <div class="sw-meter-axis">
      <span class="${!isBuild ? 'sw-axis-on' : ''}">${escSvg(l1)}</span>
      <span class="${isBuild && !isStrong ? 'sw-axis-on' : ''}">${escSvg(l2)}</span>
      <span class="${isStrong ? 'sw-axis-on' : ''}">${escSvg(l3)}</span>
    </div>`;
}


