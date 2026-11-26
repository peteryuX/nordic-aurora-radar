/**
 * Nordic Aurora Radar — Lightweight Live Forecast Hydrator for /spots/<slug>/ SEO Pages
 *
 * Non-blocking progressive enhancement: static SEO content renders immediately for crawlers,
 * while human visitors get live Kp + layered cloud cover + 0-99 aurora score in < 1 second.
 */

import {
  computeAuroraScore,
  computeSolarElevation,
  effectiveCloud,
  parseKpJson,
  tGrade
} from './aurora-engine.js';
import { trackPageview } from './analytics.js';

trackPageview();

async function fetchJsonTimeout(url, timeoutMs = 6000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function hydrateSpotLive() {
  const box = document.getElementById('spotLiveBox');
  if (!box) return;
  const lat = Number(box.dataset.lat);
  const lon = Number(box.dataset.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m&forecast_days=1&timeformat=unixtime&timezone=auto`;
  const kpUrl = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

  const [om, kpRaw] = await Promise.all([
    fetchJsonTimeout(omUrl, 6000),
    fetchJsonTimeout(kpUrl, 6000)
  ]);

  const kp = kpRaw ? parseKpJson(kpRaw) : null;
  let cloudNow = null;
  let tempNow = null;
  if (om?.hourly?.time?.length) {
    const nowSec = Math.floor(Date.now() / 1000);
    let idx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < om.hourly.time.length; i++) {
      const d = Math.abs(om.hourly.time[i] - nowSec);
      if (d < bestDiff) { bestDiff = d; idx = i; }
    }
    const low = om.hourly.cloud_cover_low?.[idx];
    const mid = om.hourly.cloud_cover_mid?.[idx];
    const high = om.hourly.cloud_cover_high?.[idx];
    const tot = om.hourly.cloud_cover?.[idx];
    cloudNow = (Number.isFinite(low) && Number.isFinite(mid) && Number.isFinite(high))
      ? effectiveCloud(low, mid, high)
      : (Number.isFinite(tot) ? Math.round(tot) : null);
    if (Number.isFinite(om.hourly.temperature_2m?.[idx])) {
      tempNow = Math.round(om.hourly.temperature_2m[idx]);
    }
  }

  if (cloudNow === null && kp === null) {
    box.style.display = 'none';
    return;
  }

  const sunAlt = computeSolarElevation(new Date(), lat, lon);
  const sc = computeAuroraScore({
    lat, lon,
    cloudNow: cloudNow ?? 50,
    sunAlt,
    kp: kp ?? 2
  });
  const clearPct = cloudNow !== null ? Math.max(0, Math.min(100, Math.round(100 - cloudNow))) : null;
  const gradeEn = String(tGrade(sc.grade, 'en')).replace(/^[^\p{L}\p{N}]+\s*/u, '');
  const gradeZh = String(tGrade(sc.grade, 'zh')).replace(/^[^\p{L}\p{N}]+\s*/u, '');

  const scoreEl = document.getElementById('spotLiveScore');
  const metaEl = document.getElementById('spotLiveMeta');
  if (scoreEl) {
    scoreEl.textContent = sc.isTooBright
      ? 'Daylight · 白天'
      : `${sc.total}/99 · ${gradeEn} / ${gradeZh}`;
    scoreEl.style.color = sc.isTooBright ? 'var(--muted)' : (sc.total >= 65 ? 'var(--green)' : (sc.total >= 40 ? 'var(--green-text)' : (sc.total >= 18 ? 'var(--amber)' : 'var(--text-soft)')));
  }
  if (metaEl) {
    const parts = [];
    if (clearPct !== null) parts.push(`Clear ${clearPct}% (晴空)`);
    if (kp !== null) parts.push(`Kp ${kp.toFixed(1)}`);
    if (tempNow !== null) parts.push(`${tempNow}°C`);
    metaEl.textContent = parts.join(' · ');
  }
  box.classList.add('ready');
}

hydrateSpotLive();
