// zona-terrain.js — pure «ЗОНА 704» height profile. Imports ONLY zona-plan.js (no THREE → node-testable,
// sim-worker-safe). makeTerrain({profile:'zona', seed}) delegates here (terrain.js); the sim-worker
// rebuilds the exact same field from its serialized opts, so host/client/worker stay bit-identical.
//
// Layer order (later wins): base fbm → stamps (ridge/plateau/bowl) → river channel → road corridors
// (Task 4) → parcel pads (Task 5). Every primitive clamps its own influence radius; the composed
// function is total (no NaN) and pure for a fixed seed.
import { EXTENT, TERRAIN_FEATURES, WATER } from './zona-plan.js';

// ── self-contained value-noise fbm (mirror of terrain.js's; kept local so this module imports only plan data)
function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
function fbm(x, z, seed, { octaves, freq, lacunarity, gain }) {
  let amp = 1, f = freq, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * (valueNoise(x * f, z * f, seed + o * 101) * 2 - 1);
    norm += amp; amp *= gain; f *= lacunarity;
  }
  return sum / norm;
}
export const ZONA_TUNING = { fbmAmplitude: 4.0, fbm: { octaves: 5, freq: 1 / 220, lacunarity: 2.05, gain: 0.5 } };

const smoothstep = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

// ── geometry helpers (exported for tests + reused by corridors/ribbons) ─────────────────────────────
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / L2)) : 0;
  const cx = ax + t * dx, cz = az + t * dz;
  return { d: Math.hypot(px - cx, pz - cz), t };
}

// nearest point on a polyline: lateral distance d + arc-length position s (+ segment index)
export function polylineProject(pts, x, z) {
  let best = { d: Infinity, s: 0, segIdx: 0 }, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const segLen = Math.hypot(bx - ax, bz - az);
    const { d, t } = distToSeg(x, z, ax, az, bx, bz);
    if (d < best.d) best = { d, s: acc + t * segLen, segIdx: i };
    acc += segLen;
  }
  return best;
}

// cumulative arc lengths of a polyline ([0, len01, len01+len12, …])
function cumArc(pts) {
  const A = [0];
  for (let i = 1; i < pts.length; i++) A.push(A[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return A;
}

// per-vertex crest height lerped along a ridge polyline at arc position s
function crestAt(f, s) {
  const A = f.cum;
  let i = 1; while (i < A.length - 1 && A[i] < s) i++;
  const t = (s - A[i - 1]) / Math.max(1e-6, A[i] - A[i - 1]);
  const h0 = f.pts[i - 1][2], h1 = f.pts[i][2];
  return h0 + (h1 - h0) * Math.max(0, Math.min(1, t));
}

// distance OUTSIDE a feature's core shape (0 inside): disc → dist−r; rect → box distance
function distToShape(f, x, z) {
  if (f.r != null) return Math.max(0, Math.hypot(x - f.x, z - f.z) - f.r);
  const dx = Math.max(0, Math.abs(x - f.x) - f.w / 2), dz = Math.max(0, Math.abs(z - f.z) - f.d / 2);
  return Math.hypot(dx, dz);
}

// ── bucket grid — 50 m cells over [−EXTENT,EXTENT]²; each cell lists features whose influence AABB
// touches it, split by phase (additive deltas / absolute stamps). Corridors+pads register here too.
const CELL = 50;
const NCELL = Math.ceil((EXTENT * 2) / CELL);
function makeGrid() {
  return { add: new Map(), abs: new Map() }; // cellKey → array of prepared features
}
function cellKey(cx, cz) { return cz * NCELL + cx; }
function gridInsert(map, minX, minZ, maxX, maxZ, item) {
  const c0x = Math.max(0, Math.floor((minX + EXTENT) / CELL)), c1x = Math.min(NCELL - 1, Math.floor((maxX + EXTENT) / CELL));
  const c0z = Math.max(0, Math.floor((minZ + EXTENT) / CELL)), c1z = Math.min(NCELL - 1, Math.floor((maxZ + EXTENT) / CELL));
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const k = cellKey(cx, cz);
    let arr = map.get(k);
    if (!arr) map.set(k, arr = []);
    arr.push(item);
  }
}
function polyAABB(pts, pad) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of pts) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1]; }
  return [minX - pad, minZ - pad, maxX + pad, maxZ + pad];
}

// prepare TERRAIN_FEATURES + the river channel into grid-indexed evaluators
function prepareStamps() {
  const grid = makeGrid();
  for (const f of TERRAIN_FEATURES) {
    if (f.kind === 'ridge') {
      const prep = { type: 'ridge', pts: f.pts, cum: cumArc(f.pts), halfW: f.halfW };
      const [a, b, c, d] = polyAABB(f.pts, f.halfW);
      gridInsert(grid.add, a, b, c, d, prep);
    } else if (f.kind === 'plateau' || f.kind === 'bowl') {
      const reach = (f.r != null ? f.r : Math.max(f.w, f.d) / 2) + f.skirt;
      const prep = { type: f.abs ? 'abs' : 'delta', f };
      gridInsert(f.abs ? grid.abs : grid.add, f.x - reach, f.z - reach, f.x + reach, f.z + reach, prep);
    } else if (f.kind === 'channel') {
      const w = WATER[f.ref];
      const reach = w.width / 2 + 6;
      const prep = { type: 'channel', pts: w.pts, depth: w.depth, reach };
      const [a, b, c, d] = polyAABB(w.pts, reach);
      gridInsert(grid.add, a, b, c, d, prep);
    }
  }
  return grid;
}

// evaluate the stamp layers at (x,z) given the base height — shared by the public field and by the
// corridor-profile precompute (which must read stamps WITHOUT corridors).
function stampedHeight(grid, x, z, base) {
  let h = base;
  const cx = Math.max(0, Math.min(NCELL - 1, Math.floor((x + EXTENT) / CELL)));
  const cz = Math.max(0, Math.min(NCELL - 1, Math.floor((z + EXTENT) / CELL)));
  const k = cellKey(cx, cz);
  const adds = grid.add.get(k);
  if (adds) for (const p of adds) {
    if (p.type === 'ridge') {
      const { d, s } = polylineProject(p.pts, x, z);
      if (d < p.halfW) h += crestAt(p, s) * Math.pow(1 - smoothstep(d / p.halfW), 1.6);
    } else if (p.type === 'delta') {
      const d = distToShape(p.f, x, z);
      if (d < p.f.skirt) h += p.f.h * (1 - smoothstep(d / p.f.skirt));
    } else if (p.type === 'channel') {
      const { d } = polylineProject(p.pts, x, z);
      if (d < p.reach) h -= p.depth * (1 - smoothstep(d / p.reach));
    }
  }
  const absL = grid.abs.get(k);
  if (absL) for (const p of absL) {
    const d = distToShape(p.f, x, z);
    if (d < p.f.skirt) { const w = 1 - smoothstep(d / p.f.skirt); h = h * (1 - w) + p.f.h * w; }
  }
  return h;
}

// ── public factory — cached per seed (main thread + worker each build once) ─────────────────────────
const _cache = new Map();
export function makeZonaHeightFn(seed) {
  if (_cache.has(seed)) return _cache.get(seed);
  const grid = prepareStamps();
  const tune = ZONA_TUNING;
  const fn = (x, z) => {
    const base = tune.fbmAmplitude * fbm(x, z, seed, tune.fbm);
    return stampedHeight(grid, x, z, base);
  };
  _cache.set(seed, fn);
  return fn;
}
