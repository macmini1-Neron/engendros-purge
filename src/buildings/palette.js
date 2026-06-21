// palette.js — buildgen materials as PURE DATA (no THREE, no DOM; node-testable).
// The browser texture generators live in textures.js, keyed by each entry's `tex` field;
// they receive (rng, entry, size) with rng = makeRNG(spec.seed) — law 8: seeded determinism.
//
// kinds:
//   tiled — procedural CanvasTexture; `tile` {w,h} metres is the UV divisor (tiling lives in
//           metric UVs, texture.repeat stays 1); `canvas` caps the texture size (law 14 ≤512).
//   flat  — vertex-tone material, no texture (the modelgen 5-tone look).
//   glass — the airfield glassPane recipe parameters as data.
//   sign  — painted board (interp draws the part's Cyrillic `text` onto it).
// Every kind carries the 5 voxel tones {hi, mid, lo, slot, bright} — never a near-black blob.
//
// `phys` — the DESTRUCTION bridge: a key into destruct.js MATERIALS (tier/hp/debris/sound/fuel).
//   It links a visual material to its physical hardness so buildgen buildings are destructible
//   (resolved via materials.js, NOT here — palette.js stays import-free data). `null` = a part
//   in this material is never destructible (signage). The single source of physics stays
//   destruct.js MATERIALS, shared with forest + weapons.

export const BUILDING_PALETTE = {
  brickRed: {
    kind: 'tiled', tex: 'brick', tile: { w: 0.45, h: 0.30 }, canvas: 256, phys: 'brick',   // 6×4 courses @ 75 mm
    tones: { hi: '#a85a40', mid: '#8a4632', lo: '#6e3626', slot: '#542818', bright: '#c06e50' },
  },
  brickGrey: {
    kind: 'tiled', tex: 'brick', tile: { w: 0.45, h: 0.30 }, canvas: 256, phys: 'brick',
    tones: { hi: '#9a948c', mid: '#7e7870', lo: '#5f5a52', slot: '#46423c', bright: '#b2aca2' },
  },
  concretePanel: {
    kind: 'tiled', tex: 'panelGrid', tile: { w: 3.0, h: 2.8 }, canvas: 512, phys: 'concrete', // one precast panel module
    tones: { hi: '#aaa9a0', mid: '#908f86', lo: '#6f6e66', slot: '#55544e', bright: '#c2c1b8' },
  },
  corrugatedTin: {
    kind: 'tiled', tex: 'corrugated', tile: { w: 1.0, h: 1.0 }, canvas: 256, phys: 'sheetmetal',
    tones: { hi: '#9fb0b6', mid: '#7e8f96', lo: '#5c6b72', slot: '#434f55', bright: '#bccdd3' },
  },
  plaster: {
    kind: 'tiled', tex: 'plaster', tile: { w: 2.0, h: 2.0 }, canvas: 256, phys: 'plaster',
    tones: { hi: '#cfc6a8', mid: '#b5ac8e', lo: '#8f876e', slot: '#6b6452', bright: '#e2dabd' },
  },
  concrete: {
    kind: 'flat', phys: 'concrete',
    tones: { hi: '#9a958b', mid: '#7c776d', lo: '#5c584f', slot: '#44413a', bright: '#b0aba0' },
  },
  wood: {
    kind: 'flat', phys: 'wood',
    tones: { hi: '#8a6a3a', mid: '#6a4a24', lo: '#49321a', slot: '#33200f', bright: '#a8854c' },
  },
  glassPane: {
    kind: 'glass', opacity: 0.3, color: '#9fc6cf', emissive: '#1c2a2e', phys: 'glass',     // src/airfield.js glassPane recipe
    tones: { hi: '#bcd8de', mid: '#9fc6cf', lo: '#7da6af', slot: '#5d868f', bright: '#d8eef3' },
  },
  signage: {
    kind: 'sign', bg: '#1d2528', fg: '#e8e6dd', phys: null,                 // cosmetic board — never destructible
    tones: { hi: '#2c3a40', mid: '#1d2528', lo: '#131a1d', slot: '#0b0f11', bright: '#3d4f57' },
  },
};

const HEX = /^#?[0-9a-fA-F]{3,8}$/;

export function resolveMaterial(name) {
  if (typeof name !== 'string' || HEX.test(name)) {
    throw new Error(`buildgen palette: '${name}' — raw hex is rejected; add a named material to BUILDING_PALETTE`);
  }
  const m = BUILDING_PALETTE[name];
  if (!m) throw new Error(`buildgen palette: unknown material '${name}' (have: ${Object.keys(BUILDING_PALETTE).join(', ')})`);
  return m;
}

export const materialNames = () => Object.keys(BUILDING_PALETTE);
