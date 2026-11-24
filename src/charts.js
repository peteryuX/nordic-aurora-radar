/**
 * Nordic Aurora Radar — Pure SVG Visualization Builders
 *
 * All functions return pure SVG inner markup strings with uniform X-axis ticks,
 * L1 telemetry gap handling, and zero side effects.
 */

import {
  isEn, getZoneParts, parseUtcMs, utcTagToLocalHM, computeL1EtaMin, bzToEnergy
} from './aurora-engine.js';

export function buildSkySceneSVG({ cloudPct, auroraScore, moonUp, moonPct, isTooBright }) {
  const bgTop = isTooBright ? '#245d92' : '#030a16';
  const bgBot = isTooBright ? '#7fb4dc' : '#0d223d';
  const starOp = isTooBright ? 0 : Math.max(0.05, (100 - cloudPct) / 100);
  const aurOp = (isTooBright || auroraScore <= 0) ? 0 : Math.max(0.06, (auroraScore / 100) * Math.max(0.18, (100 - cloudPct * 0.85) / 100));
  const cloudOp = Math.min(0.95, Math.max(0.08, (cloudPct / 100) * 0.94));
  const showMoon = moonUp && !isTooBright;
  const moonOp = showMoon ? Math.max(0.22, (100 - cloudPct * 0.7) / 100) : 0;
  const moonR = 11 + (moonPct / 100) * 9;

  const stars = [
    [40,28,1.5],[95,52,1.2],[148,24,1.8],[215,40,1.1],[275,20,1.6],
    [340,46,1.3],[410,25,1.7],[465,55,1.2],[530,30,1.5],[595,48,1.4],
    [70,82,1.1],[180,74,1.4],[305,78,1.2],[440,86,1.3],[560,72,1.5]
  ].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" opacity="${(starOp * 0.85).toFixed(2)}"/>`).join('');

  const clouds = cloudPct >= 15 ? `
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
  if (!series || series.length < 2) {
    return `<text x="210" y="90" text-anchor="middle" fill="#8ea6c4" font-size="13" font-weight="700">${en ? 'No live satellite energy data' : '暫無衛星即時太陽風曲線'}</text>`;
  }
  const W = 420, H = 170, padL = 56, padR = 14, padT = 24, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const yOf = e => padT + ((100 - e) / 100) * plotH;

  // Zone boundaries match summarizeEnergyTrend: <25 Quiet, 25-61 Rising, >=62 Active
  const yBurst = yOf(62), yWarm = yOf(25);
  const etaMin = balOpt?.etaMin ?? computeL1EtaMin(speed);
  const arrMsList = series.map(s => {
    const ms = parseUtcMs(s.time_tag);
    return Number.isFinite(ms) ? ms + etaMin * 60000 : NaN;
  });
  const validTime = Number.isFinite(arrMsList[0]) && Number.isFinite(arrMsList[arrMsList.length - 1]) && arrMsList[arrMsList.length - 1] > arrMsList[0];
  const minMs = validTime ? arrMsList[0] : 0;
  const maxMs = validTime ? arrMsList[arrMsList.length - 1] : (series.length - 1);
  const xOfMs = ms => padL + ((ms - minMs) / (maxMs - minMs)) * plotW;
  const xOf = i => validTime && Number.isFinite(arrMsList[i]) ? xOfMs(arrMsList[i]) : (padL + (i / (series.length - 1)) * plotW);

  const energies = (balOpt && Array.isArray(balOpt.energy120) && balOpt.energy120.length === series.length)
    ? balOpt.energy120
    : series.map(s => bzToEnergy(s.bz, speed));

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
  const col = lastE >= 62 ? '#34f0b0' : lastE >= 25 ? '#ffcf5c' : '#66bdff';
  const stateWord = lastE >= 62 ? (en ? 'Active' : '活躍') : lastE >= 25 ? (en ? 'Rising' : '增強') : (en ? 'Quiet' : '平靜');

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
    const stepMin = spanMin > 165 ? 60 : 30;
    const stepMs = stepMin * 60000;
    const firstTick = Math.ceil(minMs / stepMs) * stepMs;
    for (let t = firstTick; t <= maxMs; t += stepMs) {
      const tx = xOfMs(t);
      if (tx < padL + 10 || tx > W - padR - 10) continue;
      const z = getZoneParts(new Date(t), timeZone);
      xTicksSvg += `
        <line x1="${tx.toFixed(1)}" y1="${padT}" x2="${tx.toFixed(1)}" y2="${baseY}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 4"/>
        <text x="${tx.toFixed(1)}" y="${H - 7}" text-anchor="middle" fill="#9fb5d0" font-size="11" font-weight="700">${z.hourStr}:${z.minStr}</text>`;
    }
  }
  if (!xTicksSvg) {
    const tStart = utcTagToLocalHM(series[0].time_tag, timeZone, etaMin);
    const tEnd = utcTagToLocalHM(series[series.length - 1].time_tag, timeZone, etaMin);
    xTicksSvg = `
      <text x="${padL}" y="${H - 7}" fill="#9fb5d0" font-size="11" font-weight="700">${tStart}</text>
      <text x="${W - padR}" y="${H - 7}" text-anchor="end" fill="#66e8ff" font-size="11" font-weight="800">${tEnd}</text>`;
  }

  let arriveSvg = '';
  let futureBandSvg = '';
  if (balOpt && Number.isInteger(balOpt.arrivingIdx) && balOpt.arrivingIdx > 4 && balOpt.arrivingIdx < series.length - 4) {
    const ax = xOf(balOpt.arrivingIdx);
    const tNowEarth = utcTagToLocalHM(series[balOpt.arrivingIdx].time_tag, timeZone, etaMin);
    const lxClamped = Math.max(padL + 44, Math.min(W - 148, ax));
    futureBandSvg = `<rect x="${ax.toFixed(1)}" y="${padT}" width="${(W - padR - ax).toFixed(1)}" height="${plotH}" fill="rgba(34,211,238,0.06)"/>`;
    arriveSvg = `
      <line x1="${ax.toFixed(1)}" y1="${padT}" x2="${ax.toFixed(1)}" y2="${baseY}" stroke="#22d3ee" stroke-dasharray="3 3" stroke-width="1.5" opacity="0.88"/>
      <circle cx="${ax.toFixed(1)}" cy="${yOf(energies[balOpt.arrivingIdx]).toFixed(1)}" r="3.8" fill="#22d3ee" stroke="#040912" stroke-width="1.5"/>
      <text x="${lxClamped.toFixed(1)}" y="15" text-anchor="middle" fill="#66e8ff" font-size="10.5" font-weight="800">${en ? `Now ${tNowEarth}` : `現在 ${tNowEarth}`}</text>`;
  }

  return `
    <defs>
      <linearGradient id="enGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#34f0b0" stop-opacity="0.46"/>
        <stop offset="55%" stop-color="#ffcf5c" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#66bdff" stop-opacity="0.03"/>
      </linearGradient>
    </defs>
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${(yBurst - padT).toFixed(1)}" fill="rgba(52,240,176,0.09)"/>
    <rect x="${padL}" y="${yBurst.toFixed(1)}" width="${plotW}" height="${(yWarm - yBurst).toFixed(1)}" fill="rgba(255,207,92,0.05)"/>
    <rect x="${padL}" y="${yWarm.toFixed(1)}" width="${plotW}" height="${(padT + plotH - yWarm).toFixed(1)}" fill="rgba(102,189,255,0.04)"/>
    ${futureBandSvg}
    ${xTicksSvg}
    <line x1="${padL}" y1="${yBurst.toFixed(1)}" x2="${W - padR}" y2="${yBurst.toFixed(1)}" stroke="#34f0b0" stroke-dasharray="4 4" stroke-width="1.1" opacity="0.68"/>
    <line x1="${padL}" y1="${yWarm.toFixed(1)}" x2="${W - padR}" y2="${yWarm.toFixed(1)}" stroke="rgba(255,255,255,0.16)" stroke-dasharray="3 4" stroke-width="1"/>
    <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="rgba(255,255,255,0.18)"/>
    <text x="${padL - 8}" y="${(padT + (yBurst - padT) / 2 + 4).toFixed(1)}" text-anchor="end" fill="#34f0b0" font-size="11" font-weight="800">${en ? 'Active' : '活躍'}</text>
    <text x="${padL - 8}" y="${(yBurst + (yWarm - yBurst) / 2 + 4).toFixed(1)}" text-anchor="end" fill="#ffcf5c" font-size="11" font-weight="700">${en ? 'Rising' : '增強'}</text>
    <text x="${padL - 8}" y="${(yWarm + (padT + plotH - yWarm) / 2 + 4).toFixed(1)}" text-anchor="end" fill="#8ea6c4" font-size="11" font-weight="700">${en ? 'Quiet' : '平靜'}</text>
    ${areaSvg}
    ${gapSvg}
    ${lineSvg}
    ${arriveSvg}
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="4.8" fill="${col}" stroke="#040912" stroke-width="2"/>
    <rect x="${W - 100}" y="2" width="86" height="19" rx="9.5" fill="rgba(4,9,18,0.88)" stroke="${col}" stroke-width="1"/>
    <text x="${W - 57}" y="15" text-anchor="middle" fill="${col}" font-size="10.5" font-weight="800">${en ? `Next · ${stateWord}` : `預告 · ${stateWord}`}</text>
  `;
}

/** 12-Hour Combined Clear-Sky & Viewing-Score Chart (strictly uniform 2-hour HH:00 ticks) */
export function buildSkyWaveSVG(hrs, bestDark, selectedIdx = -1, lang) {
  const en = isEn(lang);
  if (!hrs || hrs.length < 2) {
    return `<text x="210" y="95" text-anchor="middle" fill="#8ea6c4" font-size="13">${en ? 'Loading 12h forecast...' : '讀取 12 小時晴空曲線中...'}</text>`;
  }
  const W = 420, H = 194, padL = 42, padR = 16, padT = 28, padB = 44;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const xOf = i => padL + (i / (hrs.length - 1)) * plotW;
  const yOf = pct => padT + ((100 - pct) / 100) * plotH;
  const stepW = plotW / (hrs.length - 1);

  const dayBands = hrs.map((h, i) => h.isDay
    ? `<rect x="${(xOf(i) - stepW / 2).toFixed(1)}" y="${padT}" width="${stepW.toFixed(1)}" height="${plotH}" fill="rgba(102,189,255,0.12)"/>`
    : '').join('');

  const vGrid = hrs.map((_, i) => i % 2 === 0
    ? `<line x1="${xOf(i).toFixed(1)}" y1="${padT}" x2="${xOf(i).toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="2 4"/>`
    : '').join('');

  const barW = Math.max(8, Math.min(18, stepW * 0.44));
  const scoreBars = hrs.map((h, i) => {
    if (!Number.isFinite(h.score) || h.score <= 0) return '';
    const x = xOf(i) - barW / 2;
    const y = yOf(h.score);
    const bh = Math.max(2, padT + plotH - y);
    const isSel = i === selectedIdx;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${isSel ? 'rgba(168,85,247,0.72)' : 'rgba(168,85,247,0.30)'}" stroke="${isSel ? '#d8b4fe' : 'rgba(192,132,252,0.45)'}" stroke-width="1"/>`;
  }).join('');

  const linePts = hrs.map((h, i) => `${xOf(i).toFixed(1)},${yOf(h.clear).toFixed(1)}`).join(' ');
  const areaPts = `${padL},${padT + plotH} ${linePts} ${W - padR},${padT + plotH}`;
  const bestIdx = bestDark ? hrs.findIndex(h => h.time === bestDark.time && !h.isDay) : -1;

  const dots = hrs.map((h, i) => {
    const x = xOf(i), y = yOf(h.clear);
    const isBest = i === bestIdx;
    const isSel = i === selectedIdx;
    const showTick = (i % 2 === 0);
    const c = h.isDay ? '#66bdff' : (h.clear >= 65 ? '#34f0b0' : h.clear >= 35 ? '#ffcf5c' : '#ff6b7b');
    const tInt = Math.round(h.temp) || 0;
    const hhmm = h.time.length >= 5 ? h.time.slice(0, 5) : `${h.time.slice(0, 2)}:00`;
    const lbl = showTick ? `<text x="${x.toFixed(1)}" y="${H - 24}" text-anchor="middle" fill="${isSel ? '#ffffff' : (isBest ? '#34f0b0' : '#b7cbe2')}" font-size="10.5" font-weight="${isBest || isSel ? '800' : '700'}">${hhmm}</text>` : '';
    const tempLbl = showTick ? `<text x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle" fill="#7c96b6" font-size="10">${tInt > 0 ? '+' : ''}${tInt}°</text>` : '';
    const badgeVal = Number.isFinite(h.score) && h.score > 0 ? (en ? `${h.score}` : `${h.score}分`) : `${h.clear}%`;
    const star = isBest ? `<text x="${Math.min(W - 36, Math.max(padL + 28, x)).toFixed(1)}" y="${Math.max(15, y - 11).toFixed(1)}" text-anchor="middle" fill="#34f0b0" font-size="11" font-weight="800">★ ${badgeVal}</text>` : '';
    const selLine = isSel ? `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${(padT + plotH).toFixed(1)}" stroke="rgba(255,255,255,0.34)" stroke-dasharray="2 3" stroke-width="1.2"/>` : '';
    const selRing = isSel ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.9"/>` : '';
    const hitRect = `<rect class="hr-hit" data-hour-idx="${i}" x="${(x - stepW / 2).toFixed(1)}" y="${padT}" width="${stepW.toFixed(1)}" height="${plotH + 34}" fill="transparent" style="cursor:pointer;"/>`;
    return `${selLine}${star}${selRing}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isBest || isSel ? 5 : 3.6}" fill="${c}" stroke="#040912" stroke-width="1.5"/>${lbl}${tempLbl}${hitRect}`;
  }).join('');

  return `
    <defs>
      <linearGradient id="waveG" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#34f0b0" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#34f0b0" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    ${dayBands}
    ${vGrid}
    <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="rgba(255,255,255,0.10)" stroke-dasharray="3 4"/>
    <line x1="${padL}" y1="${padT + plotH / 2}" x2="${W - padR}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.12)" stroke-dasharray="3 4"/>
    <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.18)"/>
    <text x="${padL - 7}" y="${padT + 4}" text-anchor="end" fill="#34f0b0" font-size="10.5" font-weight="700">100</text>
    <text x="${padL - 7}" y="${padT + plotH / 2 + 4}" text-anchor="end" fill="#ffcf5c" font-size="10.5" font-weight="700">50</text>
    <text x="${padL - 7}" y="${padT + plotH + 4}" text-anchor="end" fill="#ff6b7b" font-size="10.5" font-weight="700">0</text>
    ${scoreBars}
    <polygon points="${areaPts}" fill="url(#waveG)"/>
    <polyline fill="none" stroke="#34f0b0" stroke-width="2.4" stroke-linejoin="round" points="${linePts}"/>
    ${dots}
  `;
}

/** 360° Land-Safe Clear-Sky Radar SVG */
export function buildCompassRadarSVG(dirResults, originPos, lang) {
  if (!dirResults || dirResults.length < 5) return '';
  const en = isEn(lang);
  const byKey = {};
  for (const d of dirResults) byKey[d.key] = d;
  const colOf = (c, sea) => sea ? '#66bdff' : (c <= 35 ? '#34f0b0' : c <= 65 ? '#ffcf5c' : '#ff6b7b');
  const fillOf = (c, sea) => sea ? 'rgba(102,189,255,0.12)' : (c <= 35 ? 'rgba(52,240,176,0.22)' : c <= 65 ? 'rgba(255,207,92,0.20)' : 'rgba(255,107,123,0.19)');

  const sectorPath = (a1Deg, a2Deg, rIn, rOut) => {
    const toR = d => d * Math.PI / 180;
    const x1 = 160 + rOut * Math.cos(toR(a1Deg)), y1 = 160 + rOut * Math.sin(toR(a1Deg));
    const x2 = 160 + rOut * Math.cos(toR(a2Deg)), y2 = 160 + rOut * Math.sin(toR(a2Deg));
    const x3 = 160 + rIn * Math.cos(toR(a2Deg)), y3 = 160 + rIn * Math.sin(toR(a2Deg));
    const x4 = 160 + rIn * Math.cos(toR(a1Deg)), y4 = 160 + rIn * Math.sin(toR(a1Deg));
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${rOut},${rOut} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)} L${x3.toFixed(1)},${y3.toFixed(1)} A${rIn},${rIn} 0 0 0 ${x4.toFixed(1)},${y4.toFixed(1)} Z`;
  };

  const cfg = [
    { k: 'N', a1: -135, a2: -45, tx: 160, ty: 58 },
    { k: 'E', a1: -45,  a2: 45,  tx: 256, ty: 158 },
    { k: 'S', a1: 45,   a2: 135, tx: 160, ty: 258 },
    { k: 'W', a1: 135,  a2: 225, tx: 64,  ty: 158 }
  ];

  const wedges = cfg.map(s => {
    const d = byKey[s.k];
    const cleanLbl = d.label.replace(/^[⬆️⬇️➡️⬅️]+\s*/, '');
    const shortLbl = cleanLbl.includes('km')
      ? (en ? cleanLbl.replace('往北 ', 'N ').replace('往南 ', 'S ').replace('往東 ', 'E ').replace('往西 ', 'W ').replace(/\s+km$/, 'km') : cleanLbl.replace(/^往/, '').replace(/\s+km$/, 'km'))
      : cleanLbl.replace(/^往[東西南北]+\s*/, '');
    const col = colOf(d.avg3h, d.isOcean);
    const body = `
      <g class="radar-sector">
        <path d="${sectorPath(s.a1, s.a2, 52, 146)}" fill="${fillOf(d.avg3h, d.isOcean)}" stroke="${col}" stroke-width="1.8" ${d.isOcean ? 'stroke-dasharray="5 4"' : ''}/>
        <text x="${s.tx}" y="${s.ty - 5}" text-anchor="middle" fill="#f2f7ff" font-size="11.5" font-weight="800">${d.isOcean ? (en ? 'Sea' : '海面') : shortLbl}</text>
        <text x="${s.tx}" y="${s.ty + 15}" text-anchor="middle" fill="${col}" font-size="15.5" font-weight="900">${en ? '' : '雲 '}${d.avg3h}%</text>
      </g>`;
    if (d.isOcean) return body;
    const href = `https://www.google.com/maps/dir/?api=1&origin=${originPos.lat},${originPos.lon}&destination=${d.lat},${d.lon}&travelmode=driving`;
    return `<a href="${href}" target="_blank" rel="noopener">${body}</a>`;
  }).join('');

  const h = byKey.here;
  return `
    <circle cx="160" cy="160" r="148" fill="rgba(4,9,18,0.72)" stroke="rgba(255,255,255,0.12)" stroke-width="1.4"/>
    <circle cx="160" cy="160" r="98" fill="none" stroke="rgba(255,255,255,0.10)" stroke-dasharray="4 4"/>
    ${wedges}
    <circle cx="160" cy="160" r="48" fill="#060e1c" stroke="${colOf(h.avg3h, false)}" stroke-width="2.6"/>
    <text x="160" y="154" text-anchor="middle" fill="#9fb5d0" font-size="11.5" font-weight="700">${en ? 'Here' : '目前位置'}</text>
    <text x="160" y="176" text-anchor="middle" fill="${colOf(h.avg3h, false)}" font-size="17" font-weight="900">${en ? '' : '雲 '}${h.avg3h}%</text>
  `;
}
