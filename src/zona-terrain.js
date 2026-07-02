// zona-terrain.js — pure «ЗОНА 704» height profile. Imports ONLY zona-plan.js (no THREE → node-testable,
// sim-worker-safe). makeTerrain({profile:'zona', seed}) delegates here (terrain.js); the sim-worker
// rebuilds the exact same field from its serialized opts, so host/client/worker stay bit-identical.
//
// Layer order (later wins): base fbm → stamps (ridge/plateau/bowl) → river channel → road corridors
// (Task 4) → parcel pads (Task 5). Every primitive clamps its own influence radius; the composed
// function is total (no NaN) and pure for a fixed seed.
import { EXTENT, TERRAIN_FEATURES, WATER, ROADS, PARCELS, BIOMES } from './zona-plan.js';

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

// ── road corridors — each road gets a slope-clamped longitudinal profile computed ONCE from the
// STAMPED field (base+stamps, never from itself); at runtime the terrain inside the corridor is
// pulled to the profile (cut AND fill), blending back across an ADAPTIVE shoulder (deep cuts widen
// into ravines instead of vertical slots). Bridge windows keep the river channel open underneath.
const CORR_STEP = 10; // profile resample step (m)

// point on a polyline at arc position s (walks segments; s clamped to [0, total])
function pointAtArc(pts, cum, s) {
  const total = cum[cum.length - 1];
  s = Math.max(0, Math.min(total, s));
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const t = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
}

function prepareCorridors(stamped) {
  const grid = new Map(); // cellKey → road preps (per-SEGMENT insertion, deduped at eval by query id)
  const profiles = new Map();
  const corrSoFar = { grid, profiles };
  // ITERATIVE: road N's profile samples the field ALREADY conditioned by roads 0..N−1 (the registry
  // orders trunks before their spurs), so a spur branching off a trunk's cutting starts AT the cut
  // height instead of hanging a wall over the junction.
  const fieldSoFar = (x, z) => corridorHeight(corrSoFar, x, z, stamped(x, z));
  for (const road of ROADS) {
    const cum = cumArc(road.pts);
    const total = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(total / CORR_STEP) + 1);
    const arc = [], pos = [], h = [];
    for (let j = 0; j < n; j++) {
      const s = Math.min(j * CORR_STEP, total);
      const p = pointAtArc(road.pts, cum, s);
      arc.push(s); pos.push(p); h.push(fieldSoFar(p[0], p[1]));
    }
    // slope clamp: the LOWER Lipschitz envelope (O(n), exact, deterministic) — the LARGEST
    // L-Lipschitz function ≤ the sampled ground. Pure CUT: ridges/bumps get benched down, dips are
    // kept (roads grade through hollows), and endpoints anchor at their true ground. (Do NOT average
    // with the upper envelope and do NOT pre-smooth: both back-propagate a big climb's height into
    // the low endpoint — a massif scramble then hovers ~17 m over the trunk road it branches from,
    // and its corridor builds a levee across the steppe.)
    {
      const L = road.maxSlope;
      for (let i = 1; i < n; i++) { const ds = arc[i] - arc[i - 1]; h[i] = Math.min(h[i], h[i - 1] + L * ds); }
      for (let i = n - 2; i >= 0; i--) { const ds = arc[i + 1] - arc[i]; h[i] = Math.min(h[i], h[i + 1] + L * ds); }
    }
    // bridge gap windows in arc space (corridor weight → 0 inside, so the channel survives under the deck)
    const gaps = (road.bridges || []).map(b => {
      const s = polylineProject(road.pts, b.at[0], b.at[1]).s;
      return { s0: s - b.halfLen, s1: s + b.halfLen, feather: 8 };
    });
    const prep = {
      id: road.id, pts: road.pts, halfW: road.width / 2 + 1, baseShoulder: road.width * 1.5,
      arc, h, pos, gaps, step: CORR_STEP, total, vertArc: cum, surface: road.surface, width: road.width,
      _q: -1,
    };
    profiles.set(road.id, prep);
    // per-segment grid insertion (a whole-polyline AABB would blanket half the map for R1)
    const pad = prep.halfW + prep.baseShoulder + 40; // + adaptive-shoulder headroom
    for (let i = 0; i < road.pts.length - 1; i++) {
      const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
      gridInsert(grid, Math.min(ax, bx) - pad, Math.min(az, bz) - pad, Math.max(ax, bx) + pad, Math.max(az, bz) + pad, prep);
    }
  }
  return { grid, profiles };
}

function profileAt(prep, s) {
  const i = Math.max(1, Math.min(prep.h.length - 1, Math.ceil(s / prep.step)));
  const s0 = prep.arc[i - 1], s1 = prep.arc[i];
  const t = Math.max(0, Math.min(1, (s - s0) / Math.max(1e-6, s1 - s0)));
  return prep.h[i - 1] + (prep.h[i] - prep.h[i - 1]) * t;
}

let _query = 0;
// weighted blend of EVERY corridor in range — nearest-wins is discontinuous exactly at junctions
// (two roads, two different clamped profiles, tied lateral distance ⇒ a step wall ACROSS the spur).
// A convex blend of slope-clamped profiles stays continuous everywhere and both ribbons drape the
// blended surface, so junctions meet seamlessly.
function corridorHeight(corr, x, z, h) {
  const cx = Math.max(0, Math.min(NCELL - 1, Math.floor((x + EXTENT) / CELL)));
  const cz = Math.max(0, Math.min(NCELL - 1, Math.floor((z + EXTENT) / CELL)));
  const list = corr.grid.get(cellKey(cx, cz));
  if (!list) return h;
  const q = ++_query;
  let wSum = 0, hSum = 0, wMax = 0;
  for (const prep of list) {
    if (prep._q === q) continue; prep._q = q; // dedupe (a prep spans several segments → cells)
    const pr = polylineProject(prep.pts, x, z);
    const hp = profileAt(prep, pr.s);
    const shoulder = prep.baseShoulder + Math.min(40, Math.abs(hp - h) * 1.3); // adaptive: deep cuts widen
    if (pr.d >= prep.halfW + shoulder) continue;
    let w = pr.d <= prep.halfW ? 1 : 1 - smoothstep((pr.d - prep.halfW) / shoulder);
    for (const g of prep.gaps) { // bridge window: fade the pull to 0 inside the gap
      if (pr.s > g.s0 - g.feather && pr.s < g.s1 + g.feather) {
        const edge = Math.min((pr.s - (g.s0 - g.feather)) / g.feather, ((g.s1 + g.feather) - pr.s) / g.feather);
        w *= 1 - Math.max(0, Math.min(1, edge));
      }
    }
    if (w <= 0) continue;
    wSum += w; hSum += hp * w; if (w > wMax) wMax = w;
  }
  if (wSum <= 0) return h;
  return (hSum / wSum) * wMax + h * (1 - wMax);
}

// ── parcel pads — the cadastre layer, applied LAST (pads win over roads win over stamps). Inside the
// parcel footprint the ground is a dead-flat pad at the plan height (or, unpinned, at the corridor-field
// height sampled at the anchor); a smoothstep skirt blends back out. buildgen later seats buildings here.
function preparePads(corridorField) {
  const grid = new Map();   // cellKey → pad preps
  const heights = new Map(); // parcelId → resolved pad height
  const list = PARCELS.filter(p => !p.noPad);
  // resolve pinned pads first; an unpinned pad NESTED inside another parcel inherits that pad's height
  // (the plan nests e.g. the S12 elevator "v parcele P4"), else it samples the corridor field.
  for (const p of list) if (p.h != null) heights.set(p.id, p.h);
  for (const p of list) {
    if (p.h != null) continue;
    const host = list.find(q => q !== p && heights.has(q.id) && distToShape(q, p.x, p.z) === 0);
    heights.set(p.id, host ? heights.get(host.id) : corridorField(p.x, p.z));
  }
  for (const p of list) {
    const half = p.kind === 'disc' ? p.r : Math.max(p.w, p.d) / 2;
    const skirt = Math.max(8, Math.min(20, (half * 2) / 6));
    const reach = half + skirt;
    gridInsert(grid, p.x - reach, p.z - reach, p.x + reach, p.z + reach, { f: p, padH: heights.get(p.id), skirt, half });
  }
  return { grid, heights };
}

function padHeight(pads, x, z, h) {
  const cx = Math.max(0, Math.min(NCELL - 1, Math.floor((x + EXTENT) / CELL)));
  const cz = Math.max(0, Math.min(NCELL - 1, Math.floor((z + EXTENT) / CELL)));
  const list = pads.grid.get(cellKey(cx, cz));
  if (!list) return h;
  let best = null, bestD = Infinity; // nearest-core pad wins where skirts overlap; nested cores tie → smaller parcel
  for (const prep of list) {
    const d = distToShape(prep.f, x, z);
    if (d < bestD || (d === bestD && best && prep.half < best.half)) { bestD = d; best = prep; }
  }
  if (!best) return h;
  // adaptive skirt (same trick as corridor shoulders): a pad pinned far above/below its surroundings
  // widens its blend so the rim is a walkable slope, not a cliff (e.g. the P9 portal bench, +26 m
  // over the massif flank — a fixed 10 m skirt there is an 80° wall ACROSS the T5A scramble).
  const skirt = best.skirt + Math.min(70, Math.abs(best.padH - h) * 2.0);
  if (bestD >= skirt) return h;
  const w = 1 - smoothstep(bestD / skirt); // d=0 (inside the footprint) ⇒ w=1 ⇒ dead flat
  return best.padH * w + h * (1 - w);
}

// ── public factory — cached per seed (main thread + worker each build once) ─────────────────────────
const _cache = new Map();
function build(seed) {
  if (_cache.has(seed)) return _cache.get(seed);
  const grid = prepareStamps();
  const tune = ZONA_TUNING;
  const stamped = (x, z) => stampedHeight(grid, x, z, tune.fbmAmplitude * fbm(x, z, seed, tune.fbm));
  const corr = prepareCorridors(stamped);
  const corridorField = (x, z) => corridorHeight(corr, x, z, stamped(x, z));
  const pads = preparePads(corridorField);
  const fn = (x, z) => padHeight(pads, x, z, corridorField(x, z));
  const built = { fn, profiles: corr.profiles, padHeights: pads.heights };
  _cache.set(seed, built);
  return built;
}
export function makeZonaHeightFn(seed) { return build(seed).fn; }

// ── biome weights — pure (x,z) → {forest, swamp, dry, dead} in [0,1]. Drives BOTH the ground
// substrate (zona.js bakes a biome-map texture the triplanar material samples) AND vegetation
// scatter, so what you see underfoot is what grows there. Authored BIOMES shapes blend by smooth
// falloff; deadwood is PROCEDURAL: the massif «РАНА» flanks by ridge proximity (dead forest →
// bare crest per the plan), and swamp gains weight below the waterline regardless of shape.
let _bgrid = null;
function biomeGrid() {
  if (_bgrid) return _bgrid;
  _bgrid = new Map();
  for (const b of BIOMES) {
    const reach = (b.shape === 'disc' ? b.r : Math.max(b.w, b.d) / 2) + 40;
    gridInsert(_bgrid, b.x - reach, b.z - reach, b.x + reach, b.z + reach, b);
  }
  return _bgrid;
}
const RANA = TERRAIN_FEATURES.find(f => f.id === 'RANA');
export function biomeWeightsAt(x, z, h) {
  // h optional (pass the ground height when you have it — saves a field eval for the wet boost)
  const grid = biomeGrid();
  const cx = Math.max(0, Math.min(NCELL - 1, Math.floor((x + EXTENT) / CELL)));
  const cz = Math.max(0, Math.min(NCELL - 1, Math.floor((z + EXTENT) / CELL)));
  const list = grid.get(cellKey(cx, cz));
  let forest = 0, swamp = 0, dry = 0;
  if (list) for (const b of list) {
    const half = b.shape === 'disc' ? b.r : Math.max(b.w, b.d) / 2;
    const d = b.shape === 'disc'
      ? Math.max(0, Math.hypot(x - b.x, z - b.z) - b.r)
      : Math.hypot(Math.max(0, Math.abs(x - b.x) - b.w / 2), Math.max(0, Math.abs(z - b.z) - b.d / 2));
    const w = 1 - smoothstep(d / Math.max(24, half * 0.35)); // soft fringe ~1/3 of the patch size
    if (b.kind === 'forest') forest = Math.max(forest, w * (0.55 + 0.15 * (b.density || 2)));
    else if (b.kind === 'swamp') swamp = Math.max(swamp, w);
    else if (b.kind === 'dry') dry = Math.max(dry, w);
  }
  // procedural deadwood: massif flanks (near the RANA crest line, above the meadow foot)
  const pr = polylineProject(RANA.pts, x, z);
  const dead = (1 - smoothstep(pr.d / (RANA.halfW * 1.05))) * 0.9;
  // wetness boost: anything below the swamp waterline reads as peat/marsh
  if (h != null) swamp = Math.max(swamp, (1 - smoothstep((h - (-9)) / 4)) * 0.9);
  forest *= (1 - dead); // the dieback gradient eats the green forest as you climb the massif
  return { forest, swamp, dry, dead };
}
// per-road slope-clamped longitudinal profiles — zona.js drapes ribbons along these; tests assert slopes
export function roadProfiles(seed) { return build(seed).profiles; }
// parcelId → resolved pad height — zona.js seats signs/gates on these; buildgen seats buildings later
export function padHeights(seed) { return build(seed).padHeights; }
