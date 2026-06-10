// groundcover.js — SEEDED procedural voxel generators for low ground vegetation:
// grass tufts, reed clumps, steppe scrub, flowering patches and leafy bushes.
//
// ⚠️ GENERATOR CODE — PENDING VISUAL REVIEW (browser). This module has not yet been
// eyeballed in the in-game/modelgen viewer; heights/tones below are grounded in
// field research (see docs/2026-06-10-nature-research-biomes.md) but the exact
// clump silhouettes still need a render pass before being wired into the game.
//
// ISOLATED / engine-independent: depends only on THREE, MeshBuilder/voxelMaterial
// (src/util.js) and the named palette (src/props/palette.js). It does NOT import or
// touch game.js or any gameplay module, and nothing here is wired into the game yet.
//
// Aesthetic contract (see .claude/skills/voxel-weapon-modeling/SKILL.md): every
// surface draws from a 5-tone palette (hi/mid/lo/slot/bright) — darker tones low /
// in shadow, lighter tones up top / on tips — never a flat single-box blob.
//
// Coordinate convention: each maker builds rooted at the origin, growing +Y from a
// ground plane at y=0. Heights/footprints are in METRES.

import * as THREE from 'three';
import { MeshBuilder, voxelMaterial, randRange, randInt, makeRNG } from '../../util.js';
import { resolveMaterial } from '../palette.js';

// ── tone helpers ────────────────────────────────────────────────────────────
// resolveMaterial(name,'voxel') → { hi, mid, lo, slot, bright }.
const tones = (name) => resolveMaterial(name, 'voxel');

// Pick a tone by vertical fraction f∈[0,1]: shadow low, lit up high, sparkle on top.
function toneAt(t, f, r) {
  if (f < 0.18) return t.slot;
  if (f < 0.42) return t.lo;
  if (f < 0.72) return t.mid;
  if (f < 0.9) return t.hi;
  return r() < 0.55 ? t.bright : t.hi;
}

// Add a single leaning "blade" / culm: a tall thin box rooted at `base`, its local
// +Y oriented along the lean vector so the bottom stays planted at the base point.
function blade(b, base, len, w, d, leanAngle, yaw, color, opts = {}) {
  const s = Math.sin(leanAngle);
  const lx = Math.sin(yaw) * s;
  const lz = Math.cos(yaw) * s;
  const ly = Math.cos(leanAngle);
  const cx = base.x + (len / 2) * lx;
  const cy = base.y + (len / 2) * ly;
  const cz = base.z + (len / 2) * lz;
  const geo = new THREE.BoxGeometry(w, len, d);
  b.geo(geo, cx, cy, cz, color, { align: new THREE.Vector3(lx, ly, lz), ...opts });
  geo.dispose();
  return { x: cx + (len / 2) * lx, y: cy + (len / 2) * ly, z: cz + (len / 2) * lz, lx, ly, lz };
}

// Add a roughly-spherical leafy clump of small boxes, shaded by height.
function clump(b, cx, cy, cz, radius, count, t, r) {
  for (let i = 0; i < count; i++) {
    const u = r() * Math.PI * 2;
    const v = Math.acos(2 * r() - 1);
    const rad = radius * (0.4 + 0.6 * r());
    const px = cx + Math.sin(v) * Math.cos(u) * rad;
    const py = cy + Math.cos(v) * rad * 0.85;
    const pz = cz + Math.sin(v) * Math.sin(u) * rad;
    const s = radius * (0.45 + 0.4 * r());
    const f = (py - (cy - radius)) / (radius * 2);
    b.box(s, s * 0.85, s, px, py, pz, toneAt(t, f, r));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// makeGrassTuft — feather/fescue tussock (Stipa pennata 0.60–0.90 m, fescue sward).
// A fan of leaning blades over a small root mound, a few silvery awn tips on top.
// ─────────────────────────────────────────────────────────────────────────────
export function makeGrassTuft(seed = 1) {
  const r = makeRNG(seed >>> 0 || 1);
  const b = new MeshBuilder();
  const green = tones('grassGreen');
  const dry = tones('grassDry');
  const base = { x: 0, y: 0, z: 0 };

  // Root mound — flattened dark clod so blades don't float.
  b.box(0.14, 0.06, 0.14, 0, 0.03, 0, green.slot);
  b.box(0.1, 0.05, 0.1, 0, 0.07, 0, dry.lo);

  const n = randInt(8, 15, r);
  const tall = randRange(0.6, 0.9, r);          // characteristic blade length
  const cured = r() < 0.45;                     // straw-gold cured vs green sward
  for (let i = 0; i < n; i++) {
    const len = tall * randRange(0.6, 1.05, r);
    const lean = randRange(0.04, 0.5, r);
    const yaw = (i / n) * Math.PI * 2 + randRange(-0.4, 0.4, r);
    const w = randRange(0.018, 0.034, r);
    const pal = (cured || r() < 0.4) ? dry : green;
    blade(b, base, len, w, w * 0.6, lean, yaw, pal.mid);
    // lit upper segment for the layered look
    blade(b, { x: 0, y: len * 0.45, z: 0 }, len * 0.5, w * 0.8, w * 0.5, lean, yaw, pal.hi);
  }
  // Silvery feathery awns — a couple of bright near-vertical tips.
  const awns = randInt(2, 4, r);
  for (let i = 0; i < awns; i++) {
    const yaw = r() * Math.PI * 2;
    blade(b, base, tall * randRange(0.95, 1.15, r), 0.012, 0.012, randRange(0.02, 0.18, r), yaw, dry.bright);
  }
  return { geometry: b.build(), material: voxelMaterial(), type: 'grassTuft' };
}

// ─────────────────────────────────────────────────────────────────────────────
// makeReedClump — common reed Phragmites australis (1–3.5 m dense stands in/near
// shallow water). Tall near-vertical culms with a drooping feathery buff plume.
// ─────────────────────────────────────────────────────────────────────────────
export function makeReedClump(seed = 1) {
  const r = makeRNG(seed >>> 0 || 1);
  const b = new MeshBuilder();
  const reed = tones('reedGreen');
  const plume = tones('grassDry');
  const base = { x: 0, y: 0, z: 0 };

  const n = randInt(5, 10, r);
  for (let i = 0; i < n; i++) {
    const h = randRange(1.2, 2.8, r);
    const lean = randRange(0.02, 0.16, r);
    const yaw = r() * Math.PI * 2;
    const off = { x: randRange(-0.12, 0.12, r), y: 0, z: randRange(-0.12, 0.12, r) };
    const root = { x: base.x + off.x, y: 0, z: base.z + off.z };
    const w = randRange(0.04, 0.06, r);
    // culm in two shaded segments
    blade(b, root, h * 0.55, w, w, lean, yaw, reed.lo);
    const top = blade(b, { x: root.x, y: h * 0.5, z: root.z }, h * 0.5, w * 0.85, w * 0.85, lean, yaw, reed.hi);
    // a couple of leaf blades peeling off the culm
    if (r() < 0.7) blade(b, { x: root.x, y: h * 0.35, z: root.z }, h * 0.3, 0.03, 0.012, lean + 0.5, yaw + 1.4, reed.mid);
    // feathery plume — short drooping tufts around the tip
    const tufts = randInt(3, 6, r);
    for (let j = 0; j < tufts; j++) {
      const py = r() * Math.PI * 2;
      blade(b, { x: top.x, y: top.y, z: top.z }, randRange(0.14, 0.3, r), 0.02, 0.02,
        randRange(0.5, 1.1, r), py, r() < 0.5 ? plume.hi : plume.bright);
    }
  }
  return { geometry: b.build(), material: voxelMaterial(), type: 'reedClump' };
}

// ─────────────────────────────────────────────────────────────────────────────
// makeShrub — low woody steppe scrub (~0.4–0.9 m): a few bare woody stems splaying
// from the base, topped with dry/dull foliage clumps. Open, irregular.
// ─────────────────────────────────────────────────────────────────────────────
export function makeShrub(seed = 1) {
  const r = makeRNG(seed >>> 0 || 1);
  const b = new MeshBuilder();
  const wood = tones('barkDark');
  const leaf = tones('foliageWillow'); // dusty grey-green steppe scrub — NOT orange foliageDry (read as a flower)
  const base = { x: 0, y: 0, z: 0 };

  b.box(0.16, 0.08, 0.16, 0, 0.04, 0, wood.slot); // root knob
  const tall = randRange(0.4, 0.9, r);
  const stems = randInt(3, 5, r);
  for (let i = 0; i < stems; i++) {
    const len = tall * randRange(0.55, 0.95, r);
    const lean = randRange(0.2, 0.6, r);
    const yaw = (i / stems) * Math.PI * 2 + randRange(-0.5, 0.5, r);
    const w = randRange(0.04, 0.07, r);
    const tip = blade(b, base, len, w, w, lean, yaw, r() < 0.5 ? wood.mid : wood.lo);
    // a small forked twig + a foliage clump at each stem tip
    if (r() < 0.6) blade(b, { x: tip.x, y: tip.y, z: tip.z }, len * 0.35, w * 0.7, w * 0.7, lean + 0.4, yaw + 0.8, wood.hi);
    clump(b, tip.x, tip.y + 0.04, tip.z, randRange(0.1, 0.18, r), randInt(4, 8, r), leaf, r);
  }
  return { geometry: b.build(), material: voxelMaterial(), type: 'shrub' };
}

// ─────────────────────────────────────────────────────────────────────────────
// makeFlowerPatch — low alpine/meadow flower cushion (~0.15–0.4 m): a green moss-
// grass mat studded with bright-pink rhododendron-style flower heads.
// ─────────────────────────────────────────────────────────────────────────────
export function makeFlowerPatch(seed = 1) {
  const r = makeRNG(seed >>> 0 || 1);
  const b = new MeshBuilder();
  const moss = tones('graniteMoss');
  const green = tones('grassGreen');
  const petal = tones('flowerPink');
  const base = { x: 0, y: 0, z: 0 };

  // Green cushion mat — overlapping flattened clods.
  const mats = randInt(5, 9, r);
  for (let i = 0; i < mats; i++) {
    const px = randRange(-0.22, 0.22, r);
    const pz = randRange(-0.22, 0.22, r);
    const s = randRange(0.12, 0.2, r);
    const pal = r() < 0.5 ? moss : green;
    b.box(s, randRange(0.06, 0.12, r), s, px, randRange(0.03, 0.07, r), pz, r() < 0.6 ? pal.mid : pal.lo);
  }
  // A few upright grass blades poking through the mat.
  for (let i = 0; i < randInt(4, 8, r); i++) {
    blade(b, { x: randRange(-0.2, 0.2, r), y: 0.05, z: randRange(-0.2, 0.2, r) },
      randRange(0.1, 0.2, r), 0.016, 0.012, randRange(0.05, 0.35, r), r() * Math.PI * 2, green.hi);
  }
  // Pink flower heads on short stems.
  const flowers = randInt(5, 10, r);
  for (let i = 0; i < flowers; i++) {
    const fx = randRange(-0.22, 0.22, r);
    const fz = randRange(-0.22, 0.22, r);
    const stem = randRange(0.08, 0.22, r);
    blade(b, { x: fx, y: 0.06, z: fz }, stem, 0.015, 0.015, randRange(0.02, 0.2, r), r() * Math.PI * 2, green.lo);
    const hy = 0.06 + stem;
    // cluster of petal boxes — bright crown over a darker calyx
    b.box(0.07, 0.05, 0.07, fx, hy, fz, petal.mid);
    b.box(0.085, 0.035, 0.085, fx, hy + 0.03, fz, petal.hi);
    b.box(0.04, 0.03, 0.04, fx, hy + 0.05, fz, petal.bright);
  }
  return { geometry: b.build(), material: voxelMaterial(), type: 'flowerPatch' };
}

// ─────────────────────────────────────────────────────────────────────────────
// makeBush — rounded leafy bush (~0.8–1.6 m) with a short woody trunk stub and a
// dense oak-green canopy, darker low/inside and lit on top.
// ─────────────────────────────────────────────────────────────────────────────
export function makeBush(seed = 1) {
  const r = makeRNG(seed >>> 0 || 1);
  const b = new MeshBuilder();
  const wood = tones('barkDark');
  const leaf = tones('foliageOak');

  const tall = randRange(0.8, 1.6, r);
  const trunk = tall * randRange(0.06, 0.12, r); // SHORT stub — a bush, not a sapling: foliage must reach near the ground
  // short stubby trunk + 2-3 main boughs splaying low
  b.box(0.12, trunk, 0.12, 0, trunk / 2, 0, wood.lo);
  const boughs = randInt(2, 4, r);
  for (let i = 0; i < boughs; i++) {
    blade(b, { x: 0, y: trunk * 0.6, z: 0 }, tall * randRange(0.4, 0.6, r), 0.05, 0.05,
      randRange(0.5, 0.9, r), (i / boughs) * Math.PI * 2, wood.mid);
  }
  // Canopy — main blob low on the stub, a near-ground skirt, plus satellite lobes.
  const rad = tall * randRange(0.36, 0.46, r);
  const cy = trunk + (tall - trunk) * 0.42;
  clump(b, 0, cy, 0, rad, randInt(18, 28, r), leaf, r);
  // skirt lobe near the base so the bush is full to the ground (no bare-trunk sapling look)
  clump(b, randRange(-0.1, 0.1, r), trunk + rad * 0.45, randRange(-0.1, 0.1, r), rad * 0.85, randInt(10, 16, r), leaf, r);
  const lobes = randInt(2, 4, r);
  for (let i = 0; i < lobes; i++) {
    const u = r() * Math.PI * 2;
    clump(b, Math.cos(u) * rad * 0.7, cy + randRange(-0.3, 0.18, r), Math.sin(u) * rad * 0.7,
      rad * randRange(0.45, 0.65, r), randInt(8, 14, r), leaf, r);
  }
  return { geometry: b.build(), material: voxelMaterial(), type: 'bush' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Config table — nominal sourced dimensions (metres) + the biome/material a piece
// belongs to + its maker. Heights/footprints are characteristic ranges; the maker
// jitters within them per seed. See docs/2026-06-10-nature-research-biomes.md.
// ─────────────────────────────────────────────────────────────────────────────
export const GROUNDCOVER = {
  grassTuft: {
    label: 'Feather-grass tussock (Stipa/Festuca)',
    biome: 'true steppe',
    material: 'grassGreen',
    height: [0.6, 0.9],      // Stipa pennata 0.60–0.90 m [Wikipedia]
    footprint: [0.3, 0.5],
    make: makeGrassTuft,
  },
  reedClump: {
    label: 'Common reed clump (Phragmites australis)',
    biome: 'reed marsh / riparian fringe',
    material: 'reedGreen',
    height: [1.2, 2.8],      // 1–3.5 m dense stands [USFS FEIS]
    footprint: [0.4, 0.7],
    make: makeReedClump,
  },
  shrub: {
    label: 'Low steppe scrub',
    biome: 'steppe / forest-steppe',
    material: 'foliageDry',
    height: [0.4, 0.9],      // design value (sub-metre woody scrub)
    footprint: [0.5, 0.9],
    make: makeShrub,
  },
  flowerPatch: {
    label: 'Pink rhododendron-style flower cushion',
    biome: 'Carpathian polonyna',
    material: 'flowerPink',
    height: [0.15, 0.4],     // low alpine cushion [EUNIS 22414]
    footprint: [0.45, 0.7],
    make: makeFlowerPatch,
  },
  bush: {
    label: 'Rounded leafy bush',
    biome: 'forest-steppe / riparian',
    material: 'foliageOak',
    height: [0.8, 1.6],      // design value (understorey bush)
    footprint: [0.7, 1.2],
    make: makeBush,
  },
};

export default GROUNDCOVER;
