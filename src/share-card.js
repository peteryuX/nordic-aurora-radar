/**
 * Nordic Aurora Radar — Self-Contained Shareable PNG Forecast Card Renderer
 *
 * Pure Canvas 2D generator producing a Retina 1080×1350 (4:5 IG / Threads / LINE)
 * dark-OLED forecast card with zero external assets or font dependencies.
 */

import { tGrade } from './aurora-engine.js';

const CARD_W = 1080;
const CARD_H = 1350;

const TIER_PALETTE = {
  prime: { accent: '#34d399', glow: 'rgba(52, 211, 153, 0.28)', badgeBg: 'rgba(52, 211, 153, 0.16)', badgeBorder: 'rgba(52, 211, 153, 0.45)' },
  good:  { accent: '#6ee7b7', glow: 'rgba(110, 231, 183, 0.22)', badgeBg: 'rgba(110, 231, 183, 0.14)', badgeBorder: 'rgba(110, 231, 183, 0.38)' },
  mid:   { accent: '#fbbf24', glow: 'rgba(251, 191, 36, 0.20)', badgeBg: 'rgba(251, 191, 36, 0.14)', badgeBorder: 'rgba(251, 191, 36, 0.38)' },
  low:   { accent: '#94a3b8', glow: 'rgba(148, 163, 184, 0.14)', badgeBg: 'rgba(148, 163, 184, 0.14)', badgeBorder: 'rgba(148, 163, 184, 0.34)' }
};

function getTierKey(sc) {
  if (!sc || sc.isTooBright || sc.outOfZone) return 'low';
  if (sc.total >= 65) return 'prime';
  if (sc.total >= 40) return 'good';
  if (sc.total >= 18) return 'mid';
  return 'low';
}

function cleanGradeLabel(grade, lang) {
  return String(tGrade(grade, lang) || '').replace(/^[^\p{L}\p{N}]+\s*/u, '').trim() || (lang === 'en' ? 'Low' : '偏低');
}

/** Pure normalizer so tests can verify exact card data without a browser Canvas */
export function buildShareCardPayload({
  pos = {}, posName = '', sc = null, skyVal = '--', skySub = '',
  aurVal = '--', aurSub = '', darkVal = '--', darkSub = '',
  heroCue = '', bestAurora = null, bestIsNextNight = false,
  nights3 = [], localTimeStr = '', lang = 'zh'
} = {}) {
  const en = lang === 'en';
  const total = Number.isFinite(sc?.total) ? Math.round(sc.total) : 0;
  const tier = getTierKey(sc);
  const gradeText = sc ? cleanGradeLabel(sc.grade, en ? 'en' : 'zh') : (en ? 'Updating' : '更新中');
  const safeName = String(posName || pos.name || 'Tromsø').trim();
  const slugBase = String(pos.nameEn || pos.name || 'aurora')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'aurora';
  const dateTag = new Date().toISOString().slice(0, 10);

  const pillars = [
    { label: en ? 'Clear Sky' : '晴空率', val: String(skyVal || '--'), sub: String(skySub || '') },
    { label: en ? 'Aurora' : '極光強度', val: String(aurVal || '--'), sub: String(aurSub || '') },
    { label: en ? 'Darkness' : '夜空暗度', val: String(darkVal || '--'), sub: String(darkSub || '') }
  ];

  const peakLine = (bestAurora && bestAurora.time && Number.isFinite(bestAurora.score) && bestAurora.score >= 18)
    ? (en
        ? `${bestIsNextNight ? 'Best in 24h' : 'Best tonight'}: ${bestAurora.time} (Score ${bestAurora.score}/99)`
        : `${bestIsNextNight ? '24 小時最佳時段' : '今晚最佳時段'}：${bestAurora.time}（指數 ${bestAurora.score}/99）`)
    : '';

  const outlook = (Array.isArray(nights3) ? nights3 : []).slice(0, 3).map(n => ({
    day: String(n?.dayLabel || '--'),
    score: Number.isFinite(n?.bestNightScore) ? `${n.bestNightScore}` : '--',
    clear: Number.isFinite(n?.bestClearPct) ? `${n.bestClearPct}%` : '--',
    tone: n?.tone || 'muted',
    isBest: Boolean(n?.isBest)
  }));

  return {
    en,
    tier,
    total,
    gradeText,
    posName: safeName,
    localTimeStr: String(localTimeStr || ''),
    heroCue: String(heroCue || (en ? 'Live aurora & cloud radar' : '即時極光與分層雲量雷達')),
    pillars,
    peakLine,
    outlook,
    fileName: `aurora-${slugBase}-${dateTag}.png`,
    footerUrl: 'peteryux.github.io/nordic-aurora-radar',
    footerMeta: en ? 'NOAA SWPC · Yr.no · FMI · Free & No-Ads' : 'NOAA SWPC · Yr.no · FMI · 免費無廣告'
  };
}

function drawRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function wrapLines(ctx, text, maxWidth, maxLines = 2) {
  const s = String(text || '').trim();
  if (!s) return [];
  const hasSpaces = /\s/.test(s);
  const tokens = hasSpaces ? s.split(/\s+/) : [...s];
  const sep = hasSpaces ? ' ' : '';
  const lines = [];
  let cur = '';
  for (const tok of tokens) {
    const next = cur ? `${cur}${sep}${tok}` : tok;
    if (ctx.measureText(next).width <= maxWidth || !cur) {
      cur = next;
    } else {
      lines.push(cur);
      cur = tok;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Trim trailing overflow if text exceeded maxLines
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    while (last.length > 2 && ctx.measureText(last).width > maxWidth) {
      last = `${last.slice(0, -2)}…`;
    }
    lines[maxLines - 1] = last;
  }
  return lines;
}

/** Render a 1080×1350 dark-OLED forecast card onto a Canvas element */
export function renderShareCardCanvas(payload, canvasOpt = null) {
  const canvas = canvasOpt || document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const pal = TIER_PALETTE[payload.tier] || TIER_PALETTE.low;
  const fontStack = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Noto Sans TC", "PingFang TC", system-ui, sans-serif';

  // 1. Deep Arctic night OLED backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  bgGrad.addColorStop(0, '#070b14');
  bgGrad.addColorStop(0.55, '#09101d');
  bgGrad.addColorStop(1, '#06080f');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Atmospheric aurora glow behind centerpiece
  const glow = ctx.createRadialGradient(CARD_W * 0.5, 390, 40, CARD_W * 0.5, 390, 480);
  glow.addColorStop(0, pal.glow);
  glow.addColorStop(1, 'rgba(7, 11, 20, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, 920);

  // Subtle decorative stars (deterministic coordinates, zero flicker)
  ctx.fillStyle = 'rgba(226, 232, 240, 0.32)';
  const stars = [[120, 140, 2], [230, 95, 1.5], [880, 120, 2.2], [950, 220, 1.5], [160, 310, 1.6], [920, 360, 1.8], [760, 88, 1.4], [320, 180, 1.2]];
  for (const [sx, sy, sr] of stars) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Top Brand & Timestamp Bar
  ctx.fillStyle = '#94a3b8';
  ctx.font = `700 26px ${fontStack}`;
  ctx.textAlign = 'left';
  ctx.fillText('NORDIC AURORA RADAR', 72, 92);

  if (payload.localTimeStr) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 26px ${fontStack}`;
    ctx.fillText(payload.localTimeStr, CARD_W - 72, 92);
  }

  // Location Headline
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f8fafc';
  ctx.font = `800 54px ${fontStack}`;
  const locLines = wrapLines(ctx, payload.posName, CARD_W - 144, 1);
  ctx.fillText(locLines[0] || payload.posName, CARD_W / 2, 186);

  // 3. Center Score Ring & Grade Badge
  const cx = CARD_W / 2;
  const cy = 408;
  const r = 152;
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  const frac = Math.max(0.03, Math.min(1, payload.total / 99));
  ctx.lineCap = 'round';
  ctx.strokeStyle = pal.accent;
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = `700 24px ${fontStack}`;
  ctx.fillText(payload.en ? 'AURORA SCORE' : '觀測指數', cx, cy - 68);

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 124px ${fontStack}`;
  ctx.fillText(String(payload.total), cx, cy + 40);

  // Grade pill inside ring bottom
  ctx.font = `800 28px ${fontStack}`;
  const badgeW = Math.max(128, ctx.measureText(payload.gradeText).width + 44);
  drawRoundRect(ctx, cx - badgeW / 2, cy + 68, badgeW, 46, 23);
  ctx.fillStyle = pal.badgeBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = pal.badgeBorder;
  ctx.stroke();
  ctx.fillStyle = pal.accent;
  ctx.fillText(payload.gradeText, cx, cy + 101);

  // 4. Hero Action Cue
  ctx.fillStyle = '#f1f5f9';
  ctx.font = `800 36px ${fontStack}`;
  const cueLines = wrapLines(ctx, payload.heroCue, CARD_W - 144, 2);
  cueLines.forEach((line, i) => {
    ctx.fillText(line, cx, 636 + i * 48);
  });

  // 5. Three-Pillar Metric Cards
  const cardTop = 742;
  const cardGap = 24;
  const cardW = (CARD_W - 144 - cardGap * 2) / 3;
  const cardH = 188;
  payload.pillars.forEach((p, idx) => {
    const x = 72 + idx * (cardW + cardGap);
    drawRoundRect(ctx, x, cardTop, cardW, cardH, 26);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#94a3b8';
    ctx.font = `700 24px ${fontStack}`;
    ctx.fillText(p.label, x + cardW / 2, cardTop + 48);

    ctx.fillStyle = '#ffffff';
    ctx.font = `800 48px ${fontStack}`;
    ctx.fillText(p.val, x + cardW / 2, cardTop + 114);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 22px ${fontStack}`;
    const subLine = wrapLines(ctx, p.sub, cardW - 28, 1)[0] || '';
    ctx.fillText(subLine, x + cardW / 2, cardTop + 158);
  });

  // 6. Peak Window Strip + 3-Night Mini Outlook
  let nextY = 964;
  if (payload.peakLine) {
    drawRoundRect(ctx, 72, nextY, CARD_W - 144, 68, 20);
    ctx.fillStyle = pal.badgeBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pal.badgeBorder;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 27px ${fontStack}`;
    ctx.fillText(payload.peakLine, cx, nextY + 44);
    nextY += 92;
  }

  if (payload.outlook.length) {
    const outW = (CARD_W - 144 - 24 * (payload.outlook.length - 1)) / payload.outlook.length;
    const outH = 128;
    payload.outlook.forEach((o, i) => {
      const x = 72 + i * (outW + 24);
      drawRoundRect(ctx, x, nextY, outW, outH, 22);
      ctx.fillStyle = o.isBest ? 'rgba(52, 211, 153, 0.11)' : 'rgba(255, 255, 255, 0.035)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = o.isBest ? 'rgba(52, 211, 153, 0.40)' : 'rgba(255, 255, 255, 0.09)';
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = o.isBest ? '#6ee7b7' : '#94a3b8';
      ctx.font = `700 23px ${fontStack}`;
      ctx.fillText(o.isBest ? `★ ${o.day}` : o.day, x + outW / 2, nextY + 38);

      ctx.fillStyle = '#ffffff';
      ctx.font = `800 38px ${fontStack}`;
      ctx.fillText(o.score, x + outW / 2, nextY + 84);

      ctx.fillStyle = '#94a3b8';
      ctx.font = `600 20px ${fontStack}`;
      ctx.fillText(payload.en ? `Clear ${o.clear}` : `晴空 ${o.clear}`, x + outW / 2, nextY + 112);
    });
  }

  // 7. Footer Watermark & Sources
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(72, CARD_H - 122);
  ctx.lineTo(CARD_W - 72, CARD_H - 122);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#34d399';
  ctx.font = `800 26px ${fontStack}`;
  ctx.fillText(payload.footerUrl, 72, CARD_H - 72);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `600 22px ${fontStack}`;
  ctx.fillText(payload.footerMeta, CARD_W - 72, CARD_H - 72);

  return canvas;
}

/** Export PNG Blob and invoke native share sheet (or instant PNG download fallback) */
export async function exportShareCardPng(payload, shareUrl = '') {
  const canvas = renderShareCardCanvas(payload);
  if (!canvas) return { ok: false, method: 'unsupported' };
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return { ok: false, method: 'blob-error' };

  const file = typeof File !== 'undefined' ? new File([blob], payload.fileName, { type: 'image/png' }) : null;
  if (file && typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function') {
    try {
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${payload.posName} · ${payload.total}/99`,
          text: `${payload.posName} — ${payload.heroCue}${shareUrl ? `\n${shareUrl}` : ''}`
        });
        return { ok: true, method: 'native-share' };
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: true, method: 'aborted' };
    }
  }

  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = payload.fileName;
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
  return { ok: true, method: 'download' };
}
