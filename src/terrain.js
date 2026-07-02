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
//                     A Terrain is ALWAYS constructed (every map). On flat maps the
//                     unified collision path stays byte-identical to the old y=0 floor
//                     because the ground-follow re-seat is gated off via hasTerrain.
//   profile 'demo'  → gentle rolling fBm hills (~±4 m) + one larger broad hill
//                     (~11 m), tuned so most slopes are walkable with a few steep faces.
//   profile 'zona'  → the 2500×2500 «ЗОНА 704» master map — plan-driven stamps + road
//                     corridors + parcel pads, composed in src/zona-terrain.js (pure,
//                     THREE-free, so this import keeps terrain.js node/worker-safe).
//                     A NAMED profile (not an opts callback) on purpose: the sim-worker
//                     rebuilds terrain from serialized {profile, seed, …} opts, and a
//                     closure would not survive postMessage.
import { makeZonaHeightFn } from './zona-terrain.js';

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
// 'forest' profile — DECLARATIVE ANALYTIC LANDFORMS (the "logical terrain" rewrite for ?map=forest).
// A gentle WALKABLE rolling base + a steep rocky MASSIF (an impassable cliff that HOSTS the cave) +
// a walkable OVERLOOK ridge + a sunken CAVE CORRIDOR (slot canyon) into the massif + a wooded DELL/hummock.
// Pure fn(x,z) → co-op-deterministic (host & client agree bit-for-bit; the cave volume reads the SAME
// massif+corridor spec). Legibility invariant: steep faces (>~40°) auto-render bare ROCK (triplanar
// splat) AND auto-block movement (slope-limit) — a face that LOOKS like a wall IS a wall (BotW/Horizon).
// The playable arena is ±world.HALF (70), so every landform sits inside ~±70; the massif rides the N edge.
// ───────────────────────────────────────────────────────────────────────────
const _smooth01 = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };

// perpendicular distance `d` + clamped normalized position `t` of (x,z) along segment A→B. Pure.
function _segPD(x, z, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az, ab2 = abx * abx + abz * abz || 1e-6;
  let t = ((x - ax) * abx + (z - az) * abz) / ab2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + abx * t, cz = az + abz * t, dx = x - cx, dz = z - cz;
  return { t, d: Math.hypot(dx, dz) };
}
const _gauss = (x, z, c) => { const dx = x - c.x, dz = z - c.z; return c.h * Math.exp(-(dx * dx + dz * dz) / (2 * c.sigma * c.sigma)); };

export const FOREST_TUNING = {
  base: { amp: 3.0, fbm: { octaves: 5, freq: 1 / 62, lacunarity: 2.05, gain: 0.5 } }, // gentle walkable rolling forest
  calm: { r0: 6, r1: 27, floor: 0.4 },                 // calm the relief near origin so spawn + cottage/crates/colonnade sit flat
  overlook: { x: -52, z: 50, h: 12, sigma: 30 },       // broad walkable sniper rise (grass — legibly "you CAN go up")
  hummock:  { x: 50, z: 20, h: 8, sigma: 20 },         // gentle wooded hummock (E)
  dell:     { x: 38, z: 44, h: -5, sigma: 18 },        // gentle wooded hollow (SE) — negative ⇒ depression
  // DATA ONLY — the rocky MASSIF is NOT in this heightfield. These params are read by the density body
  // (src/cave/volume.js CaveVolume), which owns the mountain's render AND collision as one field. Compact
  // craggy peak: plateau core (r≤r0), steep cliff falloff (r0→r1), height h, silhouette warp `jag`.
  massif:   { x: -10, z: -55, h: 34, r0: 5, r1: 15, jag: 4.0 },
  // the cave TUNNEL line the density body carves out of the rock → the mouth. (bx/bz = mouth-ward end used as the
  // tunnel's back reference in CaveVolume; ax/az the outer end.) Data only; not applied to the heightfield.
  corridor: { ax: -10, az: -34, bx: -10, bz: -50, halfW: 4.2, floorMouth: 2.5, floorInner: 0.6, rim: 7.5 },
};

// forestHeight — the GENTLE forest heightfield only (rolling base + soft landforms). The rocky MASSIF and its
// cave are NOT in the heightfield: they are one self-contained density body (src/cave/volume.js) that owns the
// mountain's render AND collision. So terrainHeightAt is just the walkable ground the rock stands on (and the
// cave-floor level). The FOREST_TUNING.massif/corridor data below is read by that density module, not here.
function forestHeight(x, z, seed, tune) {
  // gentle rolling base — walkable everywhere
  let h = tune.base.amp * fbm(x, z, seed, tune.base.fbm);
  // calm the central basin (spawn + buildings): scale base relief up from `floor` as you leave the origin
  const d0 = Math.hypot(x, z), cm = _smooth01((d0 - tune.calm.r0) / (tune.calm.r1 - tune.calm.r0));
  h *= tune.calm.floor + (1 - tune.calm.floor) * cm;
  // gentle WALKABLE landforms (added after calm so they keep full height)
  h += _gauss(x, z, tune.overlook);
  h += _gauss(x, z, tune.hummock);
  h += _gauss(x, z, tune.dell);
  return h;
}

// True when a horizontal move that raised the ground from gBefore→gAfter climbed INTO terrain steeper
// than slopeLimit (radians). The horde slope-limit uses this; the player path (world._moveAxisTerrain)
// inlines the same check. Pure (no THREE).
export function slopeBlocks(gBefore, gAfter, slopeAtTarget, slopeLimit, eps = 1e-4) {
  return gAfter > gBefore + eps && slopeAtTarget > slopeLimit;
}

// ───────────────────────────────────────────────────────────────────────────
// makeTerrain — the factory. Returns the contract object.
// ───────────────────────────────────────────────────────────────────────────
/**
 * @param {object}  [opts]
 * @param {'flat'|'demo'|'forest'} [opts.profile='flat']
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
  // EARTHWORKS asymmetry (Valheim moat meta): the horde gives up on a gentler slope than the player can
  // scramble, so a steep natural face — or a player-DUG ditch wall — is an impassable horde-wall you can
  // still climb out of. Pure fn of slope → co-op-deterministic. Both default off the base slopeLimit.
  const enemySlopeLimit = opts.enemySlopeLimit != null ? opts.enemySlopeLimit : (Math.PI * 29) / 180;
  const playerSlopeLimit = opts.playerSlopeLimit != null ? opts.playerSlopeLimit : (Math.PI * 43) / 180;
  const tune = { ...(profile === 'forest' ? FOREST_TUNING : DEMO_TUNING), ...(opts.tuning || {}) };
  const reserved = opts.reserved || [];
  const isFlat = profile === 'flat';                   // every non-'flat' profile ('demo' / 'forest') is hilly

  // Optional excavation layer (src/dig.js DeformField). When present, terrainHeightAt adds its
  // signed offset (≤0 craters/pits, ≥0 ejecta lips) on top of the base field. It stays a pure
  // function of (x,z) because the field is mutated only by the host-ordered, co-op-synced deform
  // stream — see dig.js's CO-OP DETERMINISM note. Empty field ⇒ deformAt fast-returns 0.
  let deform = opts.deformField || null;

  // height — the single source of truth. PURE (given a fixed seed + deform-field state).
  const zonaFn = profile === 'zona' ? makeZonaHeightFn(seed) : null;
  function terrainHeightAt(x, z) {
    const base = isFlat ? 0
      : zonaFn ? zonaFn(x, z)
      : (profile === 'forest' ? forestHeight(x, z, seed, tune) : demoHeight(x, z, seed, tune));
    return deform ? base + deform.deformAt(x, z) : base;   // + excavation offset (craters/pits), 0 when empty
  }

  // central-difference gradient → outward normal. epsilon small but > FP noise.
  const EPS = 0.5;
  function terrainNormalAt(x, z) {
    if (isFlat) return { x: 0, y: 1, z: 0 };
    const hl = terrainHeightAt(x - EPS, z), hr = terrainHeightAt(x + EPS, z);
    const hd = terrainHeightAt(x, z - EPS), hu = terrainHeightAt(x, z + EPS);
    const nx = -(hr - hl) / (2 * EPS), nz = -(hu - hd) / (2 * EPS), ny = 1;
    const inv = 1 / Math.hypot(nx, ny, nz);
    return { x: nx * inv, y: ny * inv, z: nz * inv };
  }
  function terrainSlopeAt(x, z) {
    if (isFlat) return 0;
    const n = terrainNormalAt(x, z);
    return Math.acos(Math.min(1, Math.max(-1, n.y)));       // angle of the normal from vertical (+Y)
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
    enemySlopeLimit,
    playerSlopeLimit,
    tuning: tune,
    reserved,
    terrainHeightAt,
    terrainNormalAt,
    terrainSlopeAt,
    isPlaceable,
    get deformField() { return deform; },
    // Wire (or replace) the excavation field after construction — used by the main thread AND by
    // the sim-worker, which builds its own terrain then attaches a field fed by the deform stream.
    setDeformField(df) { deform = df || null; },
  };
}
