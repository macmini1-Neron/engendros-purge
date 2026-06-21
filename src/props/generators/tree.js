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
    trunkDiaM: [0.34, 0.50],
    crown: 'ovoid',
    crownWidthM: [6, 9],
    crownFrac: 0.62,     // foliage occupies top 62% of height (less bare lollipop bole)
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
    foliage: 'foliageWillow', // pale silver-grey shimmering canopy ('alba')
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

  // taper: thick at the base, thinning toward the crown — built as ROUND cylinder
  // segments (octagonal) so the trunk reads as a tree, not a square post (matches
  // the cylinder stumps). Each segment is aligned along its centreline direction.
  const RS = 8;                              // radial segments — round but chunky
  const radAt = (f) => baseDia * 0.5 * (1 - 0.6 * f);
  for (let i = 0; i < segs; i++) {
    const f = i / segs, f1 = (i + 1) / segs;
    const p0 = pts[i], p1 = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length() || segH;
    const ramp = upper && f > 0.45 ? upper : bark; // pine: copper upper bark
    const cyl = new THREE.CylinderGeometry(radAt(f1), radAt(f), len * 1.03, RS);
    mb.geo(cyl, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, ramp.mid, { align: dir, tint: 0.05 });
  }

  // flared round root collar at the very base
  mb.geo(new THREE.CylinderGeometry(baseDia * 0.62, baseDia * 0.9, 0.5, RS), pts[0].x, 0.25, pts[0].z, bark.lo, { tint: 0.05 });

  // birch: the signature black lenticel dashes scattered up the white bark + sooty base
  if (cfg.bark === 'barkBirch') {
    mb.geo(new THREE.CylinderGeometry(baseDia * 0.54, baseDia * 0.6, 0.55, RS), pts[0].x, 0.28, pts[0].z, '#2a2622', { tint: 0.03 });
    const marks = ri(r, 9, 16);
    for (let m = 0; m < marks; m++) {
      const mf = rr(r, 0.12, 0.82);
      const pc = pts[Math.min(segs, Math.round(mf * segs))];
      const rad = radAt(mf);
      const a = rr(r, 0, Math.PI * 2);
      // short horizontal dash hugging the surface (lenticel)
      mb.box(rad * 1.5, 0.05, 0.035, pc.x + Math.cos(a) * rad * 0.85, pc.y + rr(r, -0.25, 0.25), pc.z + Math.sin(a) * rad * 0.85, '#241f1b', { ry: a + Math.PI / 2, tint: 0.015 });
    }
  }

  return pts;
}

// ---------------------------------------------------------------------------
// Branches: tapered limbs rising from the upper trunk at seeded headings and
// tilts. Each is drawn as a short stack of boxes stepping outward + up, so it
// curves rather than being a stiff stick. Returns the limb tip points so the
// crown foliage can be hung off the real branch ends.
// ---------------------------------------------------------------------------
function buildBranches(mb, r, cfg, trunkPts, height, baseDia, fb = null) {
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
    const len = reach * rr(r, 0.6, 1.1) * (cfg.crown === 'columnar' ? 0.45 : 1);
    const limbSegs = Math.max(2, Math.round(len / 0.55));
    const topY = trunkPts[trunkPts.length - 1].y;
    const dia0 = baseDia * 0.55;            // stouter than before — no 1px twigs
    const RS = 6;
    let prev = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
    let droop = 0;
    for (let s = 1; s <= limbSegs; s++) {
      const sf = s / limbSegs;
      const step = len / limbSegs;
      if (cfg.crown === 'weeping' || cfg.crown === 'ovoid') droop += sf * step * (cfg.crown === 'weeping' ? 0.5 : 0.18);
      let ny = prev.y + Math.sin(tilt) * step - droop * 0.2;
      ny = Math.min(ny, topY * 0.99);       // never poke above the trunk top → foliage closes over it
      const cur = new THREE.Vector3(prev.x + Math.cos(heading) * Math.cos(tilt) * step, ny, prev.z + Math.sin(heading) * Math.cos(tilt) * step);
      const dir = new THREE.Vector3().subVectors(cur, prev);
      const segLen = dir.length();
      if (segLen > 1e-3) {
        // CONNECTED round limb segment (cylinder spanning prev→cur), tapering to the tip
        const rB = dia0 * 0.5 * (1 - 0.62 * (sf - 1 / limbSegs)) + 0.03;
        const rT = dia0 * 0.5 * (1 - 0.62 * sf) + 0.025;
        const cyl = new THREE.CylinderGeometry(rT, rB, segLen * 1.08, RS);
        mb.geo(cyl, (prev.x + cur.x) / 2, (prev.y + cur.y) / 2, (prev.z + cur.z) / 2, sf < 0.5 ? bark.mid : bark.lo, { align: dir, tint: 0.04 });
        if (fb) {                              // fold the limb into the crown envelope: the bare branch ring
          const pad = Math.max(rB, 0.05);      // at the crown bottom must be shootable, not a dead gap below the leaves
          if (cur.x - pad < fb.minx) fb.minx = cur.x - pad; if (cur.x + pad > fb.maxx) fb.maxx = cur.x + pad;
          if (cur.y - pad < fb.miny) fb.miny = cur.y - pad; if (cur.y + pad > fb.maxy) fb.maxy = cur.y + pad;
          if (cur.z - pad < fb.minz) fb.minz = cur.z - pad; if (cur.z + pad > fb.maxz) fb.maxz = cur.z + pad;
        }
      }
      prev = cur;
    }
    tips.push(prev.clone());
  }
  return tips;
}

// ---------------------------------------------------------------------------
// Foliage: CLUSTERED voxel boxes (never one big blob). We place a number of
// roundish clusters distributed through a crown VOLUME whose shape depends on
// `cfg.crown`, then each cluster is itself broken into a few jittered sub-boxes
// using the 5-tone ramp so it reads as lumpy leaf mass, not a cube.
// ---------------------------------------------------------------------------
// Returns the ACTUAL placed-foliage AABB (local, unscaled, tree base at origin) so the caller can size
// a canopy hitbox that hugs the real leaf mass instead of guessing — the source of the "shot the canopy,
// nothing happened" frustration was a guessed box. `fb` accumulates every emitted sub-box's extent.
function buildFoliage(mb, r, cfg, trunkPts, branchTips, height, lod = 0, fb = null) {
  const leaf = toneSet(cfg.foliage);
  fb = fb || { minx: Infinity, miny: Infinity, minz: Infinity, maxx: -Infinity, maxy: -Infinity, maxz: -Infinity };
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

  // HOLLOW crown: clusters sit on the SHELL only (the interior is never seen), and
  // the count scales with surface, not volume, and is capped — so a broad oak no
  // longer explodes to ~25k tris. lod thins it further for distant forest trees.
  const lodMul = lod >= 2 ? 0.34 : lod === 1 ? 0.6 : 1;
  const nClusters = Math.max(8, Math.round(
    Math.min(46, (wMax + crownH * 2) * (cfg.crown === 'columnar' ? 1.9 : 1.45)) * lodMul
  ));

  const placeCluster = (px, py, pz, size) => {
    // break each cluster into 2–3 overlapping jittered sub-boxes (was 3–5 + flecks)
    const subs = lod >= 1 ? 2 : ri(r, 2, 3);
    for (let k = 0; k < subs; k++) {
      const js = size * rr(r, 0.6, 1.05);
      const jx = px + rr(r, -size, size) * 0.5;
      const jy = py + rr(r, -size, size) * 0.4;
      const jz = pz + rr(r, -size, size) * 0.5;
      // tone by height within the sub-box: lit on top, shadow underneath
      const tone = k === 0 ? leaf.mid : (jy > py ? leaf.hi : leaf.lo);
      mb.box(js, js * 0.85, js, jx, jy, jz, tone, { tint: 0.06 });
      const hx = js * 0.5, hy = js * 0.425, hz = js * 0.5;   // record the real leaf-mass envelope
      if (jx - hx < fb.minx) fb.minx = jx - hx; if (jx + hx > fb.maxx) fb.maxx = jx + hx;
      if (jy - hy < fb.miny) fb.miny = jy - hy; if (jy + hy > fb.maxy) fb.maxy = jy + hy;
      if (jz - hz < fb.minz) fb.minz = jz - hz; if (jz + hz > fb.maxz) fb.maxz = jz + hz;
    }
  };

  // 1) hang a cluster off each real branch tip that sits inside the crown
  for (const tip of branchTips) {
    if (tip.y < crownBottom - 1) continue;
    placeCluster(tip.x, tip.y, tip.z, wMax * 0.2 + 0.6);
  }

  // 2) fill the crown volume with the remaining clusters
  for (let i = 0; i < nClusters; i++) {
    const t = r();                          // vertical fraction
    const y = crownBottom + t * crownH;
    const rad = radiusAt(t);
    const ang = rr(r, 0, Math.PI * 2);
    // HOLLOW core: a THICK opaque shell (no see-through holes), only the dead centre empty
    const rr2 = (0.5 + 0.5 * r()) * rad;
    // trunk drifts with lean; follow the centreline at this height
    const fi = Math.max(0, Math.min(trunkPts.length - 1, Math.round(t * (1 - cfg.crownFrac) * (trunkPts.length - 1) + (1 - cfg.crownFrac) * (trunkPts.length - 1))));
    const center = trunkPts[Math.min(trunkPts.length - 1, fi)] || top;
    const px = center.x + Math.cos(ang) * rr2;
    const pz = center.z + Math.sin(ang) * rr2;
    let py = y;
    if (cfg.crown === 'weeping') py -= (rr2 / Math.max(0.1, rad)) * crownH * 0.35; // skirt droops at the edges
    placeCluster(px, py, pz, wMax * 0.2 + 0.78);
  }

  // 3) close the canopy apex so no bare branch tip pokes out the top
  if (cfg.crown !== 'conical') {
    placeCluster(top.x, top.y - wMax * 0.10, top.z, wMax * 0.28 + 0.55);
  }
  return fb;
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
  // jagged splintered break: a few pale ROUND upward spikes rooted at the trunk top
  const spikes = ri(r, 3, 6);
  for (let s = 0; s < spikes; s++) {
    const a = (s / spikes) * Math.PI * 2 + rr(r, -0.3, 0.3);
    const rad = baseDia * 0.22 * rr(r, 0.2, 1);
    const h = rr(r, 0.3, 1.1);
    const sx = top.x + Math.cos(a) * rad, sz = top.z + Math.sin(a) * rad;
    const lean = rr(r, 0.08, 0.22);
    const dir = new THREE.Vector3(Math.cos(a) * lean, 1, Math.sin(a) * lean);
    mb.geo(new THREE.CylinderGeometry(baseDia * 0.05, baseDia * 0.16, h, 5), sx, top.y + h * 0.45, sz,
      cfg.damage === 'charred' ? '#1a1614' : bark.hi, { align: dir, tint: 0.05 });
  }
}

// ---------------------------------------------------------------------------
// makeTree(opts) — main entry. Returns { geometry, material } ready for a Mesh.
// opts:
//   species   : key into SPECIES (default 'birch')
//   seed      : integer seed for all variety (default derived from species)
//   damage    : override the species damage level ('none'|'snapped'|'bare'|'charred')
//   height    : override height in metres (else seeded from the species range)
//   scale     : uniform post-scale multiplier (default GAME_SCALE — botanical
//               heights in SPECIES are realistic; this brings them to a
//               gameplay-readable size, ~6–13 m, without distorting proportions)
// ---------------------------------------------------------------------------
// SplitBuilder — a MeshBuilder-shaped facade that ROUTES each emitted primitive to
// a `lo` (standing stump) or `hi` (falling top) builder by its Y centre relative to
// a break height. The `hi` builder is offset DOWN by breakY so the top geometry's
// LOCAL origin sits AT the hinge pivot (ready for fallphys makeHinge). This lets us
// reuse buildTrunk/buildBranches/buildFoliage UNCHANGED and still get a clean
// stump+top split from one seeded build (taper, branches and foliage stay aligned).
class SplitBuilder {
  constructor(breakY) { this.breakY = breakY; this.lo = new MeshBuilder(); this.hi = new MeshBuilder(); }
  box(w, h, d, x, y, z, color, opts = {}) {
    if (y <= this.breakY) this.lo.box(w, h, d, x, y, z, color, opts);
    else this.hi.box(w, h, d, x, y - this.breakY, z, color, opts);
    return this;
  }
  geo(geometry, x, y, z, color, opts = {}) {
    if (y <= this.breakY) this.lo.geo(geometry, x, y, z, color, opts);
    else this.hi.geo(geometry, x, y - this.breakY, z, color, opts);
    return this;
  }
}

const GAME_SCALE = 0.42;
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
  // CHARRED is permanent + species-independent: a fire-killed tree blackens for good. Override the
  // palette to charBlack so a charred birch rebuilds BLACK (not its original white bark) at every
  // stage — standing snag, falling top, stump, resting log. (Without this, damage:'charred' only
  // strips leaves and keeps the species bark → a charred birch reverted to white on the mesh swap.)
  if (cfg.damage === 'charred') { cfg.bark = 'charBlack'; cfg.barkUpper = null; cfg.foliage = 'charBlack'; cfg.fissures = false; }

  const height = (opts.height != null ? opts.height : rr(r, cfg.heightM[0], cfg.heightM[1]));
  const baseDia = rr(r, cfg.trunkDiaM[0], cfg.trunkDiaM[1]);

  // snapped snags lose their crown + much of their height
  const snapped = cfg.damage === 'snapped';
  const effHeight = snapped ? height * rr(r, 0.35, 0.6) : height;

  // BREAK SPLIT (opts.breakAt = 0..1 fraction of height): route geometry into a
  // standing stump (≤ breakY) + a falling top (> breakY, origin re-zeroed to the
  // break) so the caller can hinge the top. null ⇒ original single-mesh behaviour.
  // The break is CLAMPED below the crown so the whole canopy stays on the falling
  // top — splitting through the crown leaves half-clusters dangling on a short top
  // that wobbles instead of toppling like a treetop.
  const crownBottomFrac = 1 - (cfg.crownFrac != null ? cfg.crownFrac : 0.5);
  const breakMax = Math.max(0.12, crownBottomFrac - 0.04);
  const breakAt = opts.breakAt != null ? Math.max(0.08, Math.min(breakMax, opts.breakAt)) : null;
  const breakY = breakAt != null ? breakAt * effHeight : 0;
  // WOOD (trunk + branches) goes to `mb`; FOLIAGE (leaves) to `leafMB` on the non-split path, so the caller
  // can render the leaves on the fade material while the wood stays opaque. The split (felling) path keeps
  // everything in the SplitBuilder for now (M4 will split its falling top too).
  const mb = breakAt != null ? new SplitBuilder(breakY) : new MeshBuilder();
  const leafMB = breakAt != null ? mb : new MeshBuilder();

  const trunkPts = buildTrunk(mb, r, cfg, effHeight, baseDia);

  const showFoliage = cfg.damage === 'none';
  // crown/branch envelope accumulator → the canopy hitbox. Fed by BOTH the branches (so the bare ring at
  // the crown bottom is shootable) and the leaf clusters, so the box hugs the real visible mass.
  const fbounds = { minx: Infinity, miny: Infinity, minz: Infinity, maxx: -Infinity, maxy: -Infinity, maxz: -Infinity };
  if (!showFoliage) {
    // dead/bare/charred/snapped: keep bare branches, no leaves
    buildBranches(mb, r, { ...cfg, branches: [Math.max(2, cfg.branches[0] - 1), cfg.branches[1]] }, trunkPts, effHeight, baseDia, fbounds);
    if (snapped) applyDamage(mb, r, cfg, trunkPts, baseDia);
  } else {
    const tips = buildBranches(mb, r, cfg, trunkPts, effHeight, baseDia, fbounds);
    buildFoliage(leafMB, r, cfg, trunkPts, tips, effHeight, opts.lod | 0, fbounds);
  }

  const scl = opts.scale != null ? opts.scale : GAME_SCALE;
  const material = voxelMaterial();
  if (breakAt != null) {
    const stumpGeometry = mb.lo.build();
    const topGeometry = mb.hi.build();
    if (scl !== 1) { stumpGeometry.scale(scl, scl, scl); topGeometry.scale(scl, scl, scl); }
    // breakY (scaled) = world height of the hinge pivot above the tree's base
    return { stumpGeometry, topGeometry, breakY: breakY * scl, material, height: effHeight * scl, trunkRadius: baseDia * 0.5 * scl, species: speciesKey };
  }
  // Split build: WOOD (mb) + LEAF (leafMB) as separate geometries (so the caller can render leaves on the
  // near-camera fade material while wood stays opaque), PLUS a legacy merged `geometry` for the ~6 callers
  // (forest.js, dropLeaves, char/snapped rebuilds) that still want one mesh. Backward-compatible.
  const woodGeometry = mb.build();
  const leafGeometry = leafMB.pos.length ? leafMB.build() : null;   // null when there are no leaves (bare/charred)
  const geometry = new MeshBuilder().merge(mb).merge(leafMB).build();
  if (scl !== 1) { woodGeometry.scale(scl, scl, scl); if (leafGeometry) leafGeometry.scale(scl, scl, scl); geometry.scale(scl, scl, scl); }
  // HITBOX METADATA (scaled, local to the tree base, BEFORE the caller's yaw): the leaning trunk
  // centreline (`spine`) lets the caller hug the bole with a few AABBs instead of one base-centred
  // column that misses the lean, and `crownAABB` is the MEASURED leaf-mass envelope so a shot into
  // the canopy reliably registers. Both are null-safe (bare/charred trees carry no crownAABB).
  const spine = trunkPts.map((p) => [p.x * scl, p.y * scl, p.z * scl]);
  const crownAABB = (fbounds && isFinite(fbounds.minx))
    ? { min: [fbounds.minx * scl, fbounds.miny * scl, fbounds.minz * scl], max: [fbounds.maxx * scl, fbounds.maxy * scl, fbounds.maxz * scl] }
    : null;
  return { geometry, woodGeometry, leafGeometry, material, height: effHeight * scl, trunkRadius: baseDia * 0.5 * scl, species: speciesKey, spine, crownAABB };
}

// ---------------------------------------------------------------------------
// makeTreeVariant(species, seed) — convenience wrapper for callers that just
// want "give me birch number 7". Equivalent to makeTree({ species, seed }).
// ---------------------------------------------------------------------------
export function makeTreeVariant(species, seed) {
  return makeTree({ species, seed });
}

export default makeTree;
