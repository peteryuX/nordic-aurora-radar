/**
 * Build-Time Copernicus GLO-30 Mountain-Ridge Horizon Lower-Bound Generator
 *
 * Fetches official open Copernicus GLO-30 COG elevation tiles from AWS Open Data
 * (copernicus-dem-30m.s3.amazonaws.com) and computes conservative 16-azimuth
 * distant mountain-ridge lower-bound elevation angles (0.8 km – 40 km, Earth
 * curvature + standard atmospheric refraction R_eff = 7320 km, 5-point ±400 m
 * local sampling taking the conservative minimum) for all curated hubs & corridors.
 *
 * Output: src/horizon-data.js (< 5 KB zero-dependency frozen lookup table)
 * Run:    node scripts/build-horizon-table.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { CHASE_CORRIDORS, computeDistanceKm, computeAuroraBearing } from '../src/aurora-engine.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'src', 'horizon-data.js');

const R_EARTH_M = 6371000;
const R_EFF_M = 7320000; // Earth radius adjusted for standard atmospheric refraction (k = 0.13)
const DEG = Math.PI / 180;

// In-memory LRU tile cache: key "N69_E018" -> { W, H, sx, sy, ox, oy, data: Float32Array } | null (open ocean)
const tileCache = new Map();

function tileKey(latFloor, lonFloor) {
  const ns = latFloor >= 0 ? 'N' : 'S';
  const ew = lonFloor >= 0 ? 'E' : 'W';
  const la = String(Math.abs(latFloor)).padStart(2, '0');
  const lo = String(Math.abs(lonFloor)).padStart(3, '0');
  return `${ns}${la}_00_${ew}${lo}_00`;
}

function decodePredictor3Tile(raw, tw, th) {
  const out = new Float32Array(tw * th);
  const rowBytes = tw * 4;
  const dec = Buffer.allocUnsafe(rowBytes);
  const tmp = Buffer.allocUnsafe(4);
  for (let r = 0; r < th; r++) {
    const rOff = r * rowBytes;
    if (rOff + rowBytes > raw.length) break;
    dec[0] = raw[rOff];
    for (let i = 1; i < rowBytes; i++) {
      dec[i] = (raw[rOff + i] + dec[i - 1]) & 0xff;
    }
    const outRow = r * tw;
    for (let c = 0; c < tw; c++) {
      tmp[0] = dec[c];
      tmp[1] = dec[tw + c];
      tmp[2] = dec[2 * tw + c];
      tmp[3] = dec[3 * tw + c];
      const v = tmp.readFloatBE(0);
      out[outRow + c] = Number.isFinite(v) ? v : 0;
    }
  }
  return out;
}

async function loadDemTile(latFloor, lonFloor) {
  const key = tileKey(latFloor, lonFloor);
  if (tileCache.has(key)) return tileCache.get(key);

  const name = `Copernicus_DSM_COG_10_${key}_DEM`;
  const url = `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;
  try {
    const r0 = await fetch(url, { headers: { Range: 'bytes=0-65535' } });
    if (r0.status === 404 || r0.status === 403) {
      tileCache.set(key, null);
      return null;
    }
    if (!r0.ok) throw new Error(`HTTP ${r0.status}`);
    const hdr = Buffer.from(await r0.arrayBuffer());
    const le = hdr.toString('ascii', 0, 2) === 'II';
    const u16 = (o) => le ? hdr.readUInt16LE(o) : hdr.readUInt16BE(o);
    const u32 = (o) => le ? hdr.readUInt32LE(o) : hdr.readUInt32BE(o);
    const f64 = (o) => le ? hdr.readDoubleLE(o) : hdr.readDoubleBE(o);

    // Parse IFDs: IFD 0 holds geotransform; IFD 2 (~120 m single tile) gives fast, accurate distant ridge geometry
    const ifds = [];
    let off = u32(4);
    while (off && off < hdr.length - 4 && ifds.length < 5) {
      const n = u16(off);
      const tags = {};
      for (let i = 0; i < n; i++) {
        const to = off + 2 + i * 12;
        if (to + 12 > hdr.length) break;
        tags[u16(to)] = { typ: u16(to + 2), cnt: u32(to + 4), val: u32(to + 8) };
      }
      ifds.push(tags);
      const nextPos = off + 2 + n * 12;
      off = nextPos + 4 <= hdr.length ? u32(nextPos) : 0;
    }
    const base = ifds[0];
    if (!base || !base[33550] || !base[33922]) {
      tileCache.set(key, null);
      return null;
    }
    const baseW = base[256].val;
    const baseH = base[257].val;
    const baseSx = f64(base[33550].val);
    const baseSy = f64(base[33550].val + 8);
    const ox = f64(base[33922].val + 24);
    const oy = f64(base[33922].val + 32);

    // Prefer IFD 2 (~120 m, 1 tile ~700 KB) or fallback to IFD 1 / IFD 0
    const chosen = ifds.find((t, idx) => idx >= 1 && t[324]?.cnt === 1 && t[256]?.val >= 300) || ifds[Math.min(2, ifds.length - 1)];
    const W = chosen[256].val;
    const H = chosen[257].val;
    const TW = chosen[322].val;
    const TH = chosen[323].val;
    const pred = chosen[317]?.val || 1;
    const nTiles = chosen[324].cnt;
    const sx = baseSx * (baseW / W);
    const sy = baseSy * (baseH / H);

    const tileOffs = nTiles === 1
      ? [chosen[324].val]
      : Array.from({ length: nTiles }, (_, i) => u32(chosen[324].val + i * 4));
    const tileLens = nTiles === 1
      ? [chosen[325].val]
      : Array.from({ length: nTiles }, (_, i) => u32(chosen[325].val + i * 4));

    // Fetch single overview tile (or stitch if multi-tile)
    const grid = new Float32Array(W * H);
    const ntx = Math.ceil(W / TW);
    for (let tid = 0; tid < nTiles; tid++) {
      const start = tileOffs[tid];
      const len = tileLens[tid];
      const tr = await fetch(url, { headers: { Range: `bytes=${start}-${start + len - 1}` } });
      if (!tr.ok) throw new Error(`Tile HTTP ${tr.status}`);
      const raw = inflateSync(Buffer.from(await tr.arrayBuffer()));
      const tileData = pred === 3 ? decodePredictor3Tile(raw, TW, TH) : new Float32Array(raw.buffer, raw.byteOffset, TW * TH);
      const tx = tid % ntx;
      const ty = Math.floor(tid / ntx);
      const x0 = tx * TW;
      const y0 = ty * TH;
      const copyW = Math.min(TW, W - x0);
      const copyH = Math.min(TH, H - y0);
      for (let r = 0; r < copyH; r++) {
        grid.set(tileData.subarray(r * TW, r * TW + copyW), (y0 + r) * W + x0);
      }
    }

    const entry = { W, H, sx, sy, ox, oy, data: grid };
    // Keep cache bounded (~60 tiles max ~100 MB)
    if (tileCache.size > 60) {
      const oldest = tileCache.keys().next().value;
      tileCache.delete(oldest);
    }
    tileCache.set(key, entry);
    return entry;
  } catch (e) {
    console.warn(`  [warn] DEM tile ${key} failed: ${e.message}`);
    tileCache.set(key, null);
    return null;
  }
}

async function sampleElevM(lat, lon) {
  const lf = Math.floor(lat);
  const lo = Math.floor(lon);
  const t = await loadDemTile(lf, lo);
  if (!t) return 0;
  const px = Math.max(0, Math.min(t.W - 1, Math.floor((lon - t.ox) / t.sx)));
  const py = Math.max(0, Math.min(t.H - 1, Math.floor((t.oy - lat) / t.sy)));
  return t.data[py * t.W + px];
}

function destPoint(lat, lon, brgDeg, distM) {
  const d = distM / R_EARTH_M;
  const th = brgDeg * DEG;
  const p1 = lat * DEG;
  const l1 = lon * DEG;
  const sinP2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sinP2)));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * sinP2);
  return [p2 / DEG, ((l2 / DEG + 540) % 360) - 180];
}

// Radial sample distances from 0.8 km to 40 km (strictly excludes <800 m local trees/buildings/DSM noise)
const SAMPLE_DISTS_M = [
  ...Array.from({ length: 17 }, (_, i) => 800 + i * 250),   // 0.8 .. 4.8 km (250 m step)
  ...Array.from({ length: 21 }, (_, i) => 5000 + i * 500),  // 5.0 .. 15.0 km (500 m step)
  ...Array.from({ length: 25 }, (_, i) => 16000 + i * 1000) // 16.0 .. 40.0 km (1 km step)
];

async function computePointHorizon16(lat, lon) {
  // Preload surrounding 1°×1° tiles within 40 km
  const dLat = 42 / 111.32;
  const dLon = 42 / (111.32 * Math.max(0.15, Math.cos(lat * DEG)));
  const tilesNeeded = [];
  for (let la = Math.floor(lat - dLat); la <= Math.floor(lat + dLat); la++) {
    for (let lo = Math.floor(lon - dLon); lo <= Math.floor(lon + dLon); lo++) {
      tilesNeeded.push([la, ((lo + 180) % 360 + 360) % 360 - 180]);
    }
  }
  await Promise.all(tilesNeeded.map(([la, lo]) => loadDemTile(la, lo)));

  // 5-point ±400 m local sampling around corridor anchor -> conservative lower bound across valid samples
  const offsets = [
    [lat, lon],
    destPoint(lat, lon, 0, 400),
    destPoint(lat, lon, 90, 400),
    destPoint(lat, lon, 180, 400),
    destPoint(lat, lon, 270, 400)
  ];

  const perOffsetSectors = [];
  for (const [oLat, oLon] of offsets) {
    const hObs = await sampleElevM(oLat, oLon);
    // Reject obvious cliff outliers relative to center? Keep all finite points >= -10 m
    if (!Number.isFinite(hObs) || hObs < -10) continue;
    const sec16 = new Array(16).fill(0);
    for (let s = 0; s < 16; s++) {
      const centerAz = s * 22.5;
      // Scan 3 sub-rays (-6°, 0°, +6°) inside the 22.5° sector and take the conservative MINIMUM across the sub-rays
      // (so even if one flank has a narrow spire, we only report a solid continuous ridge lower bound!)
      let sectorMinMax = Infinity;
      for (const deltaAz of [-6, 0, 6]) {
        const az = (centerAz + deltaAz + 360) % 360;
        let maxAng = 0;
        for (const distM of SAMPLE_DISTS_M) {
          const [tLat, tLon] = destPoint(oLat, oLon, az, distM);
          const hTgt = await sampleElevM(tLat, tLon);
          const drop = (distM * distM) / (2 * R_EFF_M);
          const ang = Math.atan2(hTgt - hObs - drop, distM) / DEG;
          if (ang > maxAng) maxAng = ang;
        }
        if (maxAng < sectorMinMax) sectorMinMax = maxAng;
      }
      sec16[s] = Math.max(0, Math.min(45, Math.floor(sectorMinMax)));
    }
    perOffsetSectors.push(sec16);
  }

  // Conservative lower bound across the 5 local sample points
  const out = new Array(16).fill(0);
  if (!perOffsetSectors.length) return out;
  for (let s = 0; s < 16; s++) {
    out[s] = Math.min(...perOffsetSectors.map(arr => arr[s]));
  }
  return out;
}

// Collect unique hubs + curated non-ocean corridors
const targets = [];
function addTarget(name, lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  if (targets.some(t => computeDistanceKm(t.lat, t.lon, lat, lon) < 1.2)) return;
  targets.push({ name, lat: +lat.toFixed(4), lon: +lon.toFixed(4) });
}

for (const c of CHASE_CORRIDORS) {
  addTarget(`Hub(${c.match[0]},${c.match[1]})`, c.match[0], c.match[1]);
  for (const p of c.pts) {
    if (!p.isOcean) addTarget(p.label, p.lat, p.lon);
  }
}

// Sort geographically by longitude/latitude so adjacent points reuse cached DEM tiles!
targets.sort((a, b) => Math.floor(a.lat) - Math.floor(b.lat) || Math.floor(a.lon) - Math.floor(b.lon));

console.log(`Computing Copernicus GLO-30 conservative distant-ridge lower bounds for ${targets.length} curated points...`);
const rows = [];
for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  const h16 = await computePointHorizon16(t.lat, t.lon);
  const maxAny = Math.max(...h16);
  // Keep every record so lookup knows which curated points were audited (even flat 0° sites!)
  rows.push({ name: t.name, lat: t.lat, lon: t.lon, h16, maxAny });
  if ((i + 1) % 20 === 0 || i === targets.length - 1) {
    console.log(`  [${i + 1}/${targets.length}] ${t.name} -> max ridge ${maxAny}°`);
  }
}

// Emit compact frozen ES module (~3-4 KB)
const compactLines = rows.map((r, i) =>
  `  [${r.lat}, ${r.lon}, [${r.h16.join(',')}]]${i < rows.length - 1 ? ',' : ''} // ${r.name}`
);
const code = `/**
 * Precomputed Copernicus GLO-30 Conservative Distant Mountain-Ridge Horizon Lower Bounds
 *
 * Generated by scripts/build-horizon-table.mjs from open Copernicus GLO-30 DEM (30m/120m COG).
 * Method:
 *   - Distance range: 0.8 km – 40 km (strictly excludes <800 m near-field trees/buildings/DSM noise)
 *   - Curvature & refraction: R_eff = 7320 km (standard k = 0.13)
 *   - Conservative lower bound: 5-point ±400 m local open-ground sampling × 3 sub-rays per 22.5° sector
 *   - Format: [lat, lon, [16 integer degrees for N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW]]
 *
 * Strictly advisory: NEVER alters 0–99 aurora scores; NEVER interpolated beyond 1.5 km of a table anchor.
 */

export const HORIZON_LOWER_BOUNDS = Object.freeze([
${compactLines.join('\n')}
]);
`;

fs.writeFileSync(OUT_FILE, code, 'utf8');
console.log(`\nWrote ${OUT_FILE} (${Buffer.byteLength(code, 'utf8')} bytes, ${rows.length} points).`);

// Print physical sanity check for key mountainous vs flat aurora spots
console.log('\n=== PHYSICAL SANITY CHECK (Aurora-Direction Conservative Ridge Lower Bound) ===');
const checks = [
  ['Queenstown', -45.03, 168.66],
  ['Banff', 51.18, -115.57],
  ['Tromsø', 69.65, 18.96],
  ['Narvik', 68.44, 17.43],
  ['Abisko', 68.35, 18.83],
  ['Lofoten', 68.23, 14.57],
  ['Oslo', 59.91, 10.75],
  ['Rovaniemi', 66.50, 25.73],
  ['Yellowknife', 62.45, -114.37]
];
for (const [label, la, lo] of checks) {
  const hit = rows.find(r => computeDistanceKm(r.lat, r.lon, la, lo) < 2);
  if (!hit) continue;
  const az = computeAuroraBearing(la, lo);
  const idx = Math.round((((az % 360) + 360) % 360) / 22.5) % 16;
  console.log(`  ${label.padEnd(13)} | aurora az=${String(az).padStart(3)}° (sec ${String(idx).padStart(2)}) | ridge ≥ ${String(hit.h16[idx]).padStart(2)}° | all-16 max=${String(hit.maxAny).padStart(2)}°`);
}
