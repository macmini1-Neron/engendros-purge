// tree.js — SEEDED procedural voxel TREE generator for ENGENDROS PURGE.
//
// ⚠️ GENERATOR CODE — PENDING VISUAL REVIEW (browser). This module has been
// syntax-checked (`node --check`) but NOT yet eyeballed in the modelgen / game
// viewer. Crown density, branch angles and proportions are tuned by reason from
// the research brief, not yet by looking at a render. Treat dimensions as a
// starting point until reviewed live.
//
// ISOLATED, engine-independent module: builds region-native trees of the
// Ukrainian/Russian landscape (silver birch, black/Lombardy poplar, Scots pine,
// pedunculate oak, white willow) plus war-killed states (snapped, bare, charred)
// as a single merged voxel geometry. Does NOT import or touch game.js or any
// gameplay module — only `three`, the MeshBuilder/voxelMaterial from util.js,
// and the semantic PALETTE from props/palette.js.
//
// All dimensions are in METRES, grounded in docs/2026-06-10-nature-research-trees.md:
//   silver birch     15–20 m (to ~30), trunk <0.40 m DBH, crown 6–9 m, slender ovoid
//   black poplar     20–30 m, trunk to ~1.5 m, broad leaning crown
//   Lombardy poplar  up to ~30 m, crown only 3–4.5 m — narrow columnar exclamation mark
//   Scots pine       ~25 m in stands (to >45), trunk ~1.0 m, long bare bole + flat/conical crown
//   pedunculate oak  20–40 m (~30), trunk 2–4 m, broad domed gnarled crown 15–25 m spread
//   white willow     10–30 m (~25), trunk to ~1.0 m, irregular leaning crown 12–21 m, drooping
//
// Variety comes entirely from a seeded mulberry32 RNG (seed in opts): trunk lean,
// per-segment twist/curve, branch count/angle, and CLUSTERED foliage placement.
//
// Usage:
//   import { makeTree, SPECIES, makeTreeVariant } from './props/generators/tree.js';
//   const { geometry, material } = makeTree({ species: 'birch', seed: 42 });
//   scene.add(new THREE.Mesh(geometry, material));

import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../../util.js';
import { resolveMaterial } from '../palette.js';

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) — local copy so the module is self-contained and the
// caller's seed fully determines the silhouette.
// ---------------------------------------------------------------------------
function makeRNG(seed = 1) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rr = (r, lo, hi) => lo + (hi - lo) * r();
const ri = (r, lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ---------------------------------------------------------------------------
// SPECIES config table. Each entry chooses palette materials BY NAME (voxel
// backend resolved at build time), a height/diameter range (metres), a crown
// "shape" recipe, and a baseline `damage` level. `makeTreeVariant` / `makeTree`
// can override any of these per-instance via opts.
//
// crown shapes:
//   columnar  — tall narrow column (Lombardy poplar)
//   ovoid     — slender open egg (birch)
//   broad     — wide spreading dome (black poplar)
//   round     — big gnarled dome high on a bare bole (oak)
//   conical   — cone tapering to a point, low bole (young pine)
//   umbrella  — flat-topped tuft on a long bare bole (mature Scots pine)
//   weeping   — broad drooping skirt (willow)
//
// damage:  'none' | 'snapped' (top sheared off, jagged) | 'bare' (no foliage,
//          dead twigs) | 'charred' (bare + blackened, fire-killed)
// ---------------------------------------------------------------------------
export const SPECIES = {
  birch: {
    label: 'Silver birch (Betula pendula)',
    bark: 'barkBirch',
    foliage: 'foliageBirch',
    heightM: [15, 22],
    trunkDiaM: [0.25, 0.40],
    crown: 'ovoid',
    crownWidthM: [6, 9],
    crownFrac: 0.55,     // foliage occupies top 55% of height
    branches: [4, 7],
    branchTilt: [50, 70], // degrees up from horizontal — birch twigs rise then weep
    twist: 0.08,
    lean: 0.05,
    fissures: true,      // dark diamond/lenticel marks on white bark
    damage: 'none',
  },
  poplar: {
    label: "Lombardy poplar (Populus nigra 'Italica')",
    bark: 'barkDark',
    foliage: 'foliageOak',
    heightM: [20, 30],
    trunkDiaM: [0.5, 0.9],
    crown: 'columnar',
    crownWidthM: [3, 4.5],
    crownFrac: 0.92,     // fastigiate — foliage almost to the ground
    branches: [10, 16],
    branchTilt: [70, 85], // steeply upswept, hugging the trunk
    twist: 0.04,
    lean: 0.02,
    fissures: false,
    damage: 'none',
  },
  scotsPine: {
    label: 'Scots pine (Pinus sylvestris)',
    bark: 'barkPine',
    barkUpper: 'foliageDry', // signature two-tone: copper-orange upper bark
    foliage: 'foliagePine',
    heightM: [22, 32],
    trunkDiaM: [0.6, 1.0],
    crown: 'umbrella',
    crownWidthM: [7, 11],
    crownFrac: 0.32,     // long bare self-pruned bole, tuft on top
    branches: [5, 8],
    branchTilt: [10, 30], // near-horizontal plates
    twist: 0.05,
    lean: 0.04,
    fissures: false,
    damage: 'none',
  },
  oak: {
    label: 'Pedunculate oak (Quercus robur)',
    bark: 'barkDark',
    foliage: 'foliageOak',
    heightM: [22, 32],
    trunkDiaM: [1.2, 2.4],
    crown: 'round',
    crownWidthM: [15, 22],
    crownFrac: 0.50,
    branches: [6, 10],
    branchTilt: [20, 55], // thick crooked gnarled boughs
    twist: 0.12,
    lean: 0.06,
    fissures: true,
    damage: 'none',
  },
  willow: {
    label: 'White willow (Salix alba)',
    bark: 'barkDark',
    foliage: 'foliageDry', // pale silver-grey shimmering canopy ('alba')
    heightM: [12, 22],
    trunkDiaM: [0.5, 1.0],
    crown: 'weeping',
    crownWidthM: [12, 18],
    crownFrac: 0.62,
    branches: [7, 12],
    branchTilt: [25, 50],
    twist: 0.14,
    lean: 0.12,           // often-leaning waterside tree
    fissures: true,
    damage: 'none',
  },
  deadBroken: {
    label: 'War-killed snag (snapped / bare)',
    bark: 'barkDark',
    foliage: 'foliageDry',
    heightM: [6, 14],
    trunkDiaM: [0.3, 0.8],
    crown: 'broad',
    crownWidthM: [4, 8],
    crownFrac: 0.4,
    branches: [3, 6],
    branchTilt: [15, 60],
    twist: 0.1,
    lean: 0.1,
    fissures: true,
    damage: 'snapped',
  },
  burntCharred: {
    label: 'Burnt snag (fire-killed, charred)',
    bark: 'charBlack',
    foliage: 'charBlack',
    heightM: [8, 18],
    trunkDiaM: [0.3, 0.9],
    crown: 'broad',
    crownWidthM: [4, 9],
    crownFrac: 0.45,
    branches: [4, 8],
    branchTilt: [15, 70],
    twist: 0.12,
    lean: 0.08,
    fissures: false,
    damage: 'charred',
  },
};

const DEG = Math.PI / 180;

// Resolve a palette material's 5-tone voxel ramp once and hand back a helper
// that picks a tone with seeded jitter so flat surfaces don't read as one blob.
function toneSet(name) {
  const t = resolveMaterial(name, 'voxel'); // { hi, mid, lo, slot, bright }
  return t;
}

// ---------------------------------------------------------------------------
// Trunk: a stack of short boxes climbing from the base. Each segment is offset
// in xz by an accumulating lean + a per-segment seeded twist, so no two trunks
// are straight or identical. Returns the centreline points (for branch / crown
// anchoring) plus the top point.
// ---------------------------------------------------------------------------
function buildTrunk(mb, r, cfg, height, baseDia) {
  const bark = toneSet(cfg.bark);
  const upper = cfg.barkUpper ? toneSet(cfg.barkUpper) : null;
  const segH = 0.9;                          // ~0.9 m tall voxel segments
  const segs = Math.max(4, Math.round(height / segH));
  // lean direction (random heading) + magnitude
  const leanDir = rr(r, 0, Math.PI * 2);
  const leanAmt = cfg.lean * height;         // total horizontal drift over full height
  const twistPhase = rr(r, 0, Math.PI * 2);

  const pts = [];
  let x = 0, z = 0;
  for (let i = 0; i <= segs; i++) {
    const f = i / segs;                      // 0 at base → 1 at top
    // lean: ease-in so the base stays planted and the crown drifts
    const lf = f * f;
    const lx = Math.cos(leanDir) * leanAmt * lf;
    const lz = Math.sin(leanDir) * leanAmt * lf;
    // twist: small sinusoidal wander layered on top of the lean
    const tw = cfg.twist * baseDia * 3;
    const tx = Math.cos(twistPhase + f * 6.0) * tw * Math.sin(f * Math.PI);
    const tz = Math.sin(twistPhase + f * 6.0) * tw * Math.sin(f * Math.PI);
    x = lx + tx;
    z = lz + tz;
    pts.push(new THREE.Vector3(x, f * height, z));
  }

  // taper: thick at the base, thinning toward the crown
  for (let i = 0; i < segs; i++) {
    const f = i / segs;
    const p0 = pts[i], p1 = pts[i + 1];
    const dia = baseDia * (1 - 0.6 * f);
    const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2, cz = (p0.z + p1.z) / 2;
    // two-tone bark for pine: lower grey-brown plates → upper copper
    const ramp = upper && f > 0.45 ? upper : bark;
    // body of the segment (mid tone) + a lit strip + shadow base = layered look
    mb.box(dia, segH * 1.02, dia, cx, cy, cz, ramp.mid, { tint: 0.04 });
    // proud lit face on +X / +Z corners
    mb.box(dia * 0.4, segH * 0.5, dia * 0.4, cx + dia * 0.28, cy + segH * 0.2, cz + dia * 0.28, ramp.hi, { tint: 0.03 });
    // dark recess for fissures / lenticels
    if (cfg.fissures && (i % 2 === 0)) {
      mb.box(dia * 0.22, segH * 0.7, dia * 0.5, cx - dia * 0.3, cy, cz, ramp.slot, { tint: 0.02 });
    }
  }

  // rough flared root collar at the very base
  const root = bark;
  mb.box(baseDia * 1.45, 0.5, baseDia * 1.45, pts[0].x, 0.25, pts[0].z, root.lo, { tint: 0.05 });
  // birch black base
  if (cfg.bark === 'barkBirch') {
    mb.box(baseDia * 1.2, 0.7, baseDia * 1.2, pts[0].x, 0.35, pts[0].z, '#2a2622', { tint: 0.03 });
  }

  return pts;
}

// ---------------------------------------------------------------------------
// Branches: tapered limbs rising from the upper trunk at seeded headings and
// tilts. Each is drawn as a short stack of boxes stepping outward + up, so it
// curves rather than being a stiff stick. Returns the limb tip points so the
// crown foliage can be hung off the real branch ends.
// ---------------------------------------------------------------------------
function buildBranches(mb, r, cfg, trunkPts, height, baseDia) {
  const bark = toneSet(cfg.bark);
  const tips = [];
  const n = ri(r, cfg.branches[0], cfg.branches[1]);
  const reach = (cfg.crownWidthM[0] + cfg.crownWidthM[1]) / 4; // half-spread-ish
  const startF = 1 - cfg.crownFrac;          // branches begin where the crown begins
  for (let b = 0; b < n; b++) {
    const f = startF + (b / Math.max(1, n - 1)) * (0.92 - startF) + rr(r, -0.03, 0.03);
    const fi = Math.max(0, Math.min(trunkPts.length - 1, Math.round(f * (trunkPts.length - 1))));
    const anchor = trunkPts[fi];
    const heading = (b / n) * Math.PI * 2 + rr(r, -0.5, 0.5);
    const tilt = rr(r, cfg.branchTilt[0], cfg.branchTilt[1]) * DEG;
    const len = reach * rr(r, 0.6, 1.1) * (cfg.crown === 'columnar' ? 0.4 : 1);
    const limbSegs = Math.max(2, Math.round(len / 0.8));
    let px = anchor.x, py = anchor.y, pz = anchor.z;
    const dia0 = baseDia * 0.4;
    let droop = 0;
    for (let s = 0; s < limbSegs; s++) {
      const sf = s / limbSegs;
      const step = len / limbSegs;
      // weeping species: tips bend downward as they extend
      if (cfg.crown === 'weeping' || cfg.crown === 'ovoid') droop += sf * step * (cfg.crown === 'weeping' ? 0.5 : 0.18);
      px += Math.cos(heading) * Math.cos(tilt) * step;
      pz += Math.sin(heading) * Math.cos(tilt) * step;
      py += Math.sin(tilt) * step - droop * 0.2;
      const dia = dia0 * (1 - 0.7 * sf) + 0.04;
      mb.box(dia, dia, dia, px, py, pz, sf < 0.5 ? bark.mid : bark.lo, { tint: 0.04 });
    }
    tips.push(new THREE.Vector3(px, py, pz));
  }
  return tips;
}

// ---------------------------------------------------------------------------
// Foliage: CLUSTERED voxel boxes (never one big blob). We place a number of
// roundish clusters distributed through a crown VOLUME whose shape depends on
// `cfg.crown`, then each cluster is itself broken into a few jittered sub-boxes
// using the 5-tone ramp so it reads as lumpy leaf mass, not a cube.
// ---------------------------------------------------------------------------
function buildFoliage(mb, r, cfg, trunkPts, branchTips, height) {
  const leaf = toneSet(cfg.foliage);
  const top = trunkPts[trunkPts.length - 1];
  const crownBottom = height * (1 - cfg.crownFrac);
  const crownH = top.y - crownBottom;
  const wMax = (cfg.crownWidthM[0] + cfg.crownWidthM[1]) / 2;
  const cx = top.x, cz = top.z;

  // radius profile as a function of vertical fraction within the crown (0 bottom → 1 top)
  const radiusAt = (t) => {
    switch (cfg.crown) {
      case 'columnar': return wMax * 0.5 * (0.5 + 0.5 * Math.sin((t * 0.85 + 0.1) * Math.PI));
      case 'ovoid':    return wMax * 0.5 * Math.sin((0.15 + t * 0.8) * Math.PI);
      case 'conical':  return wMax * 0.5 * (1 - t * 0.92);
      case 'umbrella': return wMax * 0.5 * (t < 0.45 ? 0.4 + 1.3 * t : 1 - (t - 0.45) * 0.7);
      case 'round':    return wMax * 0.5 * Math.sin((0.2 + t * 0.7) * Math.PI);
      case 'weeping':  return wMax * 0.5 * (0.55 + 0.45 * Math.sin((0.1 + t * 0.85) * Math.PI));
      default:         return wMax * 0.5 * Math.sin((0.2 + t * 0.7) * Math.PI); // broad
    }
  };

  // cluster count scales with crown volume
  const nClusters = Math.round(
    Math.max(8, (wMax * crownH) * (cfg.crown === 'columnar' ? 2.2 : 1.4))
  );

  const placeCluster = (px, py, pz, size) => {
    // break each cluster into 3–5 overlapping jittered sub-boxes
    const subs = ri(r, 3, 5);
    for (let k = 0; k < subs; k++) {
      const js = size * rr(r, 0.55, 1.0);
      const jx = px + rr(r, -size, size) * 0.5;
      const jy = py + rr(r, -size, size) * 0.4;
      const jz = pz + rr(r, -size, size) * 0.5;
      // tone by height within the sub-box: lit on top, shadow underneath
      const tone = k === 0 ? leaf.mid : (jy > py ? leaf.hi : leaf.lo);
      mb.box(js, js * 0.85, js, jx, jy, jz, tone, { tint: 0.06 });
      // occasional bright fleck for sparkle
      if (r() < 0.25) mb.box(js * 0.3, js * 0.3, js * 0.3, jx + js * 0.2, jy + js * 0.3, jz, leaf.bright, { tint: 0.04 });
    }
  };

  // 1) hang a cluster off each real branch tip that sits inside the crown
  for (const tip of branchTips) {
    if (tip.y < crownBottom - 1) continue;
    placeCluster(tip.x, tip.y, tip.z, wMax * 0.16 + 0.4);
  }

  // 2) fill the crown volume with the remaining clusters
  for (let i = 0; i < nClusters; i++) {
    const t = r();                          // vertical fraction
    const y = crownBottom + t * crownH;
    const rad = radiusAt(t);
    const ang = rr(r, 0, Math.PI * 2);
    // bias toward the shell so the interior isn't packed solid
    const rr2 = Math.sqrt(rr(r, 0.25, 1)) * rad;
    // trunk drifts with lean; follow the centreline at this height
    const fi = Math.max(0, Math.min(trunkPts.length - 1, Math.round(t * (1 - cfg.crownFrac) * (trunkPts.length - 1) + (1 - cfg.crownFrac) * (trunkPts.length - 1))));
    const center = trunkPts[Math.min(trunkPts.length - 1, fi)] || top;
    const px = center.x + Math.cos(ang) * rr2;
    const pz = center.z + Math.sin(ang) * rr2;
    let py = y;
    if (cfg.crown === 'weeping') py -= (rr2 / Math.max(0.1, rad)) * crownH * 0.35; // skirt droops at the edges
    placeCluster(px, py, pz, wMax * 0.14 + 0.45);
  }
}

// ---------------------------------------------------------------------------
// Damage post-processing applied to the cfg before building. We don't carve
// existing geometry; instead 'snapped' shortens the trunk + adds a jagged break
// cap, and 'bare'/'charred' simply suppress foliage (and recolour for charred,
// already handled via the species bark/foliage being charBlack).
// ---------------------------------------------------------------------------
function applyDamage(mb, r, cfg, trunkPts, baseDia) {
  const bark = toneSet(cfg.bark);
  const top = trunkPts[trunkPts.length - 1];
  // jagged splintered break cap: a few pale upward spikes
  const spikes = ri(r, 3, 6);
  for (let s = 0; s < spikes; s++) {
    const a = (s / spikes) * Math.PI * 2 + rr(r, -0.3, 0.3);
    const rad = baseDia * 0.25 * rr(r, 0.3, 1);
    const h = rr(r, 0.3, 1.1);
    mb.box(baseDia * 0.22, h, baseDia * 0.22,
      top.x + Math.cos(a) * rad, top.y + h * 0.5, top.z + Math.sin(a) * rad,
      cfg.damage === 'charred' ? '#1a1614' : bark.hi, { tint: 0.05, rz: rr(r, -0.2, 0.2), rx: rr(r, -0.2, 0.2) });
  }
}

// ---------------------------------------------------------------------------
// makeTree(opts) — main entry. Returns { geometry, material } ready for a Mesh.
// opts:
//   species   : key into SPECIES (default 'birch')
//   seed      : integer seed for all variety (default derived from species)
//   damage    : override the species damage level ('none'|'snapped'|'bare'|'charred')
//   height    : override height in metres (else seeded from the species range)
//   scale     : uniform post-scale multiplier (default 1)
// ---------------------------------------------------------------------------
export function makeTree(opts = {}) {
  const speciesKey = opts.species || 'birch';
  const base = SPECIES[speciesKey];
  if (!base) throw new Error(`unknown tree species '${speciesKey}' — see SPECIES in tree.js`);

  // default seed: stable per-species hash so calls without a seed are repeatable
  let defSeed = 0x9e3779b9;
  for (let i = 0; i < speciesKey.length; i++) defSeed = (defSeed ^ speciesKey.charCodeAt(i)) * 0x01000193 >>> 0;
  const seed = opts.seed != null ? opts.seed : defSeed;
  const r = makeRNG((seed >>> 0) || 1);

  // clone the species cfg so per-instance overrides don't mutate the table
  const cfg = { ...base };
  if (opts.damage) cfg.damage = opts.damage;

  const height = (opts.height != null ? opts.height : rr(r, cfg.heightM[0], cfg.heightM[1]));
  const baseDia = rr(r, cfg.trunkDiaM[0], cfg.trunkDiaM[1]);

  const mb = new MeshBuilder();

  // snapped snags lose their crown + much of their height
  const snapped = cfg.damage === 'snapped';
  const effHeight = snapped ? height * rr(r, 0.35, 0.6) : height;

  const trunkPts = buildTrunk(mb, r, cfg, effHeight, baseDia);

  const showFoliage = cfg.damage === 'none';
  if (!showFoliage) {
    // dead/bare/charred/snapped: keep bare branches, no leaves
    buildBranches(mb, r, { ...cfg, branches: [Math.max(2, cfg.branches[0] - 1), cfg.branches[1]] }, trunkPts, effHeight, baseDia);
    if (snapped) applyDamage(mb, r, cfg, trunkPts, baseDia);
  } else {
    const tips = buildBranches(mb, r, cfg, trunkPts, effHeight, baseDia);
    buildFoliage(mb, r, cfg, trunkPts, tips, effHeight);
  }

  const geometry = mb.build();
  if (opts.scale && opts.scale !== 1) geometry.scale(opts.scale, opts.scale, opts.scale);
  const material = voxelMaterial();
  return { geometry, material, height: effHeight, species: speciesKey };
}

// ---------------------------------------------------------------------------
// makeTreeVariant(species, seed) — convenience wrapper for callers that just
// want "give me birch number 7". Equivalent to makeTree({ species, seed }).
// ---------------------------------------------------------------------------
export function makeTreeVariant(species, seed) {
  return makeTree({ species, seed });
}

export default makeTree;
