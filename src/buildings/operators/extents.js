// extents.js — per-operator local AABB (pure; the bounds validator depends on these).
// Signature differs from modelgen: (args, spec) — shell/roof/face extents derive from the
// spec's footprint/storeys, not from args alone. Extents are in LOCAL building space,
// BEFORE the part's at/rot (bounds.js applies those).
import { specTopY, DIRV, faceFrame } from './_math.js';

const fp = (spec) => spec?.footprint ?? { w: 1, h: 1, d: 1 };

// Face-anchored parts (openings/signs/pilasters): conservative extent = the whole wall plane
// they decorate (thin slab on that face). Keeps containment honest without re-deriving u/v.
function faceExtent(args, spec, proud = 0.05) {
  const { w, d } = fp(spec);
  const H = specTopY(spec);
  const f = faceFrame(args.face ?? 'N', fp(spec), 0.3);
  if (f.axis === 'x') {
    const z = f.fixed + f.out * (f.t / 2 + proud);
    return { min: [-w / 2, 0, Math.min(f.fixed, z)], max: [w / 2, H, Math.max(f.fixed, z)] };
  }
  const x = f.fixed + f.out * (f.t / 2 + proud);
  return { min: [Math.min(f.fixed, x), 0, -d / 2], max: [Math.max(f.fixed, x), H, d / 2] };
}

export const EXTENTS = {
  // --- shell / massing ---
  shellBox: (a, spec) => {
    const { w, d } = fp(spec);
    return { min: [-w / 2, 0, -d / 2], max: [w / 2, specTopY(spec), d / 2] };
  },
  floorSlab: (a, spec) => {
    const { w, d } = fp(spec);
    const y = spec?.storeys?.[a.storey]?.y ?? 0;
    return { min: [-w / 2, y - 0.15, -d / 2], max: [w / 2, y, d / 2] };
  },
  interiorWall: (a) => a.axis === 'x'
    ? { min: [-a.len / 2, 0, -a.t / 2], max: [a.len / 2, a.h, a.t / 2] }
    : { min: [-a.t / 2, 0, -a.len / 2], max: [a.t / 2, a.h, a.len / 2] },
  column: (a) => ({ min: [-a.w / 2, 0, -a.d / 2], max: [a.w / 2, a.h, a.d / 2] }),
  stairs: (a) => {
    const [dx, dz] = DIRV[a.dir] ?? DIRV.N;
    const len = a.steps * a.run;
    const x0 = dx > 0 ? 0 : dx < 0 ? -len : -a.width / 2;
    const x1 = dx > 0 ? len : dx < 0 ? 0 : a.width / 2;
    const z0 = dz > 0 ? 0 : dz < 0 ? -len : -a.width / 2;
    const z1 = dz > 0 ? len : dz < 0 ? 0 : a.width / 2;
    return { min: [x0, 0, z0], max: [x1, a.steps * a.rise, z1] };
  },
  // --- roofs (seat on topY; overhang widens the slab/prism) ---
  flatRoof: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec); const ov = a.overhang ?? 0;
    return { min: [-w / 2 - ov, y, -d / 2 - ov], max: [w / 2 + ov, y + a.t, d / 2 + ov] };
  },
  gableRoof: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec); const ov = a.overhang ?? 0;
    return { min: [-w / 2 - ov, y, -d / 2 - ov], max: [w / 2 + ov, y + a.rise, d / 2 + ov] };
  },
  hipRoof: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec); const ov = a.overhang ?? 0;
    return { min: [-w / 2 - ov, y, -d / 2 - ov], max: [w / 2 + ov, y + a.rise, d / 2 + ov] };
  },
  sawtoothRoof: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec);
    return { min: [-w / 2, y, -d / 2], max: [w / 2, y + a.rise, d / 2] };
  },
  parapet: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec);
    return { min: [-w / 2, y, -d / 2], max: [w / 2, y + a.h, d / 2] };
  },
  // --- openings / facade / signs (face-anchored) ---
  windowBays: (a, spec) => faceExtent(a, spec, 0.06),
  doorway: (a, spec) => faceExtent(a, spec, 0.06),
  gateOpening: (a, spec) => faceExtent(a, spec, 0.06),
  cornice: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec); const p = a.proud;
    return { min: [-w / 2 - p, y - a.h, -d / 2 - p], max: [w / 2 + p, y, d / 2 + p] };
  },
  pilaster: (a, spec) => faceExtent(a, spec, a.proud ?? 0.06),
  // --- landmarks (floor-anchored cylinders) ---
  chimney: (a) => {
    const r = Math.max(a.rBase, a.rTop);
    return { min: [-r, 0, -r], max: [r, a.h, r] };
  },
  waterTank: (a) => ({ min: [-a.r, 0, -a.r], max: [a.r, a.legH + a.h, a.r] }),
  mast: (a) => ({ min: [-a.r, 0, -a.r], max: [a.r, a.h, a.r] }),
  // --- signage ---
  sign: (a, spec) => faceExtent(a, spec, 0.05),
  stencil: (a, spec) => faceExtent(a, spec, 0.05),
  // --- reuse ---
  propRef: () => ({ min: [0, 0, 0], max: [0, 0, 0] }),   // prop bounds live in the prop's own spec (law 12)
  repeat: () => null,                                     // plan-time macro — expanded before bounds run
};
