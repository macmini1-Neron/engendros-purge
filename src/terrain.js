// terrain.js — DETERMINISTIC SEEDED HEIGHTFIELD (pure logic). Phase 3 of the
// playable-demo engine overhaul.
//
// PURE & node-testable: NO `import 'three'`, NO DOM, NO per-call RNG. Every export
// here runs under `node --test`. The browser-only ground-MESH builder lives in a
// SEPARATE file, src/terrain-mesh.js (it needs THREE) — keeping this module THREE-free
// is what lets the node tests import the height field directly. Mirrors the
// destruct.js / destruct-debris.js split from Phase 1.
//
// ── THE CONTRACT (Phases 4/5/9/10 depend on these signatures) ──────────────────
//   const t = makeTerrain({ profile, seed });
//   t.terrainHeightAt(x, z)            → y         (deterministic, C0-continuous, PURE)
//   t.terrainNormalAt(x, z)            → {x,y,z}   (finite-difference, normalized)
//   t.terrainSlopeAt(x, z)             → radians   (angle of the normal from +Y)
//   t.isPlaceable(x, z, radius, kind)  → bool      (gentle ground & not reserved)
//   t.profile / t.seed                 → read-only
//
// CRITICAL — co-op determinism: terrainHeightAt MUST be a pure function of (x,z)
// (seed fixed at construction, NO Math.random, NO mutable state). Co-op clients
// reconstruct enemy / remote-player Y from (x,z) locally (esnap carries only x,z —
// mp.js), so host and client MUST agree bit-for-similar. We use seeded value-noise
// with smoothstep interpolation between integer lattice points — a continuous,
// reproducible field — NOT raw Math.random per sample.
//
//   profile 'flat'  → height 0 everywhere, slope 0, normal (0,1,0), isPlaceable true.
//                     (Existing maps stay byte-identical when they opt in — and they
//                     don't even construct a Terrain unless world.hasTerrain.)
//   profile 'demo'  → gentle rolling fBm hills (~±4 m) + one larger broad hill
//                     (~11 m), tuned so most slopes are walkable with a few steep faces.

// ───────────────────────────────────────────────────────────────────────────
// Deterministic integer-lattice hash → [0,1).  No state, pure function of inputs.
// (Mixes ix, iz and the construction seed; same family as util.js mulberry32 but
// stateless so two same-seed terrains produce identical fields.)
// ───────────────────────────────────────────────────────────────────────────
function hash2(ix, iz, seed) {
  let h = (seed | 0) >>> 0;
  h = Math.imul(h ^ (ix | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h ^ (iz | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Smoothstep-interpolated 2D value noise. Returns [0,1). C1-continuous (so C0 holds),
// no lattice-line creases.
function valueNoise(x, z, seed) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  // smoothstep weights (3t²−2t³) — zero slope at lattice points ⇒ no kinks.
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const v00 = hash2(x0,     z0,     seed);
  const v10 = hash2(x0 + 1, z0,     seed);
  const v01 = hash2(x0,     z0 + 1, seed);
  const v11 = hash2(x0 + 1, z0 + 1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sz;
}

// Fractal Brownian motion — sum of octaves. Output centred on ~0, range roughly ±1.
function fbm(x, z, seed, { octaves = 4, freq = 1 / 55, lacunarity = 2, gain = 0.5 } = {}) {
  let sum = 0, amp = 1, f = freq, norm = 0;
  for (let o = 0; o < octaves; o++) {
    // distinct seed offset per octave so octaves are uncorrelated.
    sum += amp * (valueNoise(x * f, z * f, (seed + o * 1013904223) | 0) * 2 - 1);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm; // ≈ [-1, 1]
}

// ───────────────────────────────────────────────────────────────────────────
// demo profile tuning — exposed as knobs for the owner / later feel-tuning.
// ───────────────────────────────────────────────────────────────────────────
export const DEMO_TUNING = {
  fbmAmplitude: 4.2,           // metres — gentle rolling hills (~±4 m)
  fbm: { octaves: 4, freq: 1 / 55, lacunarity: 2, gain: 0.5 },
  // one larger broad hill — broad sigma keeps its flanks walkable (~11°) → the WALKABLE hill.
  bigHill: { x: 60, z: -40, height: 11, sigma: 35 },
  // one STEEP knoll — a narrow tall Gaussian (height/sigma chosen so its flanks exceed the
  // 35° slope-limit over a clear ~2–8 m band) → a genuine wall-steep face you bump into.
  // Max gradient ≈ height / (sigma·√e) = 10 / (4·1.648) ≈ 1.52 → ~56°. Placed within a short
  // walk of the (35,−8) spawn so the slope-limit can actually be FELT in normal play.
  steepKnoll: { x: 8, z: -34, height: 10, sigma: 4 },
};

function demoHeight(x, z, seed, tune) {
  let h = tune.fbmAmplitude * fbm(x, z, seed, tune.fbm);
  const bh = tune.bigHill;
  const dx = x - bh.x, dz = z - bh.z;
  h += bh.height * Math.exp(-(dx * dx + dz * dz) / (2 * bh.sigma * bh.sigma));
  const sk = tune.steepKnoll;
  if (sk) {
    const kx = x - sk.x, kz = z - sk.z;
    h += sk.height * Math.exp(-(kx * kx + kz * kz) / (2 * sk.sigma * sk.sigma));
  }
  return h;
}

// ───────────────────────────────────────────────────────────────────────────
// makeTerrain — the factory. Returns the contract object.
// ───────────────────────────────────────────────────────────────────────────
/**
 * @param {object}  [opts]
 * @param {'flat'|'demo'} [opts.profile='flat']
 * @param {number}  [opts.seed=1337]            Fixed at construction — never per-call.
 * @param {number}  [opts.slopeLimit]           radians; isPlaceable & walkability gate.
 *                                               Default 35° (Math.PI*35/180).
 * @param {object}  [opts.tuning]               Override DEMO_TUNING (demo profile only).
 * @param {Array}   [opts.reserved]             Reserved keep-out circles [{x,z,r}] for
 *                                               isPlaceable (flattened building footprints
 *                                               etc.). Optional; default none.
 */
export function makeTerrain(opts = {}) {
  const profile = opts.profile || 'flat';
  const seed = (opts.seed != null ? opts.seed : 1337) | 0;
  const slopeLimit = opts.slopeLimit != null ? opts.slopeLimit : (Math.PI * 35) / 180;
  const tune = { ...DEMO_TUNING, ...(opts.tuning || {}) };
  const reserved = opts.reserved || [];
  const isFlat = profile !== 'demo';

  // height — the single source of truth. PURE.
  function terrainHeightAt(x, z) {
    if (isFlat) return 0;
    return demoHeight(x, z, seed, tune);
  }

  // central-difference gradient → outward normal. epsilon small but > FP noise.
  const EPS = 0.5;
  function terrainNormalAt(x, z) {
    if (isFlat) return { x: 0, y: 1, z: 0 };
    const hl = terrainHeightAt(x - EPS, z);
    const hr = terrainHeightAt(x + EPS, z);
    const hd = terrainHeightAt(x, z - EPS);
    const hu = terrainHeightAt(x, z + EPS);
    // surface (x, H, z): tangents → normal = (-dH/dx, 1, -dH/dz)
    const nx = -(hr - hl) / (2 * EPS);
    const nz = -(hu - hd) / (2 * EPS);
    const ny = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    return { x: nx * inv, y: ny * inv, z: nz * inv };
  }

  function terrainSlopeAt(x, z) {
    if (isFlat) return 0;
    const n = terrainNormalAt(x, z);
    // angle of the normal from vertical (+Y). n already normalized.
    return Math.acos(Math.min(1, Math.max(-1, n.y)));
  }

  function isPlaceable(x, z, radius = 0, kind = null) {
    // reserved keep-out circles (flattened footprints, spawn bubble, …)
    for (let i = 0; i < reserved.length; i++) {
      const r = reserved[i];
      const dx = x - r.x, dz = z - r.z;
      if (dx * dx + dz * dz < (r.r + radius) * (r.r + radius)) return false;
    }
    if (isFlat) return true;
    // sample slope at centre + 4 rim points so a footprint isn't half on a cliff.
    if (terrainSlopeAt(x, z) > slopeLimit) return false;
    if (radius > 0) {
      const rr = radius;
      if (terrainSlopeAt(x + rr, z) > slopeLimit) return false;
      if (terrainSlopeAt(x - rr, z) > slopeLimit) return false;
      if (terrainSlopeAt(x, z + rr) > slopeLimit) return false;
      if (terrainSlopeAt(x, z - rr) > slopeLimit) return false;
    }
    return true;
  }

  return {
    profile,
    seed,
    slopeLimit,
    tuning: tune,
    reserved,
    terrainHeightAt,
    terrainNormalAt,
    terrainSlopeAt,
    isPlaceable,
  };
}
