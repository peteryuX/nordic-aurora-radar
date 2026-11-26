/**
 * Nordic Aurora Radar — Public Live Verification Page Hydrator (/verification/)
 */
import { trackPageview } from './analytics.js';

export async function hydrateVerificationPage() {
  if (typeof document === 'undefined') return;
  const set = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  try {
    const res = await fetch('./latest.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const v = await res.json();
    const genMs = Date.parse(v?.generatedAt || '');
    const ageDays = Number.isFinite(genMs) ? (Date.now() - genMs) / 86400000 : 99;
    const dateStr = Number.isFinite(genMs) ? new Date(genMs).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '--';
    const pill = document.getElementById('vStatusPill');
    if (pill) {
      if (ageDays <= 2) {
        pill.textContent = 'LIVE · Daily Automated Audit Active｜每日自動驗證運行中';
        pill.className = 'v-pill ok';
      } else if (ageDays <= 7) {
        pill.textContent = `Updated ${Math.round(ageDays)}d ago`;
        pill.className = 'v-pill warn';
      } else {
        pill.textContent = 'Stale (>7d) — check GitHub Actions';
        pill.className = 'v-pill warn';
      }
    }
    set('vUpdatedAt', `Updated: ${dateStr}`);

    const ca = v.cloudAudit || {};
    const ga = v.geomagAudit || {};
    set('vLayeredMae', Number.isFinite(ca.layeredMaePct) ? `${ca.layeredMaePct}%` : '--');
    const baseTxt = Number.isFinite(ca.rawTotalMaePct) ? `vs raw total cloud: ${ca.rawTotalMaePct}%` : 'Raw baseline accumulating';
    const fcTxt = Number.isFinite(ca.falseClearRatePct) ? ` · False-clear ${ca.falseClearRatePct}%` : '';
    set('vCloudBase', `${baseTxt}${fcTxt}`);
    set('vStations', `${ca.airportsCheckedNow ?? '--'} stations (${ca.samples ?? 0} graded)`);
    set('vProspCount', `Prospective +3/+6/+12h: ${ca.prospectiveSamples ?? 0} graded · ${ca.pendingProspective ?? 0} locked`);
    set('vHp30Bins', Number.isFinite(ga.gfzHp30Bins30d) ? `${ga.gfzHp30Bins30d.toLocaleString()}` : '--');
    set('vHp30Events', `Active (≥4): ${ga.activeEvents30d ?? 0} · Storm (≥5): ${ga.stormEvents30d ?? 0}`);
    if (!ga.smallSampleGuard && Number.isFinite(ga.l1RocAuc)) {
      set('vL1Auc', `${ga.l1RocAuc}`);
      set('vL1Note', `${ga.l1MatchedBins ?? 0} matched 30m bins (${ga.l1ActiveEvents ?? 0} active)`);
    } else {
      set('vL1Auc', 'Accumulating');
      set('vL1Note', `${ga.l1MatchedBins ?? 0} bins matched · unlocks at ≥5 active Hp30 events`);
    }
    set('vDisclaimer', [v.disclaimerEn, v.disclaimerZh].filter(Boolean).join(' / '));
  } catch {
    set('vStatusPill', 'Could not load latest.json — view raw file above');
  }
}

if (typeof document !== 'undefined') {
  trackPageview();
  hydrateVerificationPage();
}
