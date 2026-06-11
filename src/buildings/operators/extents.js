// extents.js — per-operator local AABB (pure; the bounds validator depends on these).
// Signature differs from modelgen: (args, spec) — shell/roof/face extents derive from the
// spec's footprint/storeys, not from args alone. Extents are in LOCAL building space,
// BEFORE the part's at/rot (bounds.js applies those).
import { specTopY, DIRV, faceFrame } from './_math.js';

const fp = (spec) => spec?.footprint ?? { w: 1, h: 1, d: 1 };

// Face-anchored parts: extent = their real u/v span on the wall, the whole wall thickness
// + proudness on the normal. Tight u/v keeps the underfill check honest (a face decoration
// must never be what "fills" a footprint).
function faceSpan(args, spec, uLo, uHi, vLo, vHi, proud = 0.06) {
  const f = faceFrame(args.face ?? 'N', fp(spec), 0.3);
  const half = f.t / 2 + proud;
  if (f.axis === 'x') {
    return { min: [f.start + uLo, vLo, f.fixed - half], max: [f.start + uHi, vHi, f.fixed + half] };
  }
  return { min: [f.fixed - half, vLo, f.start + uLo], max: [f.fixed + half, vHi, f.start + uHi] };
}
function faceExtent(args, spec, proud = 0.06) {       // whole-wall fallback (pilaster spreads)
  const f = faceFrame(args.face ?? 'N', fp(spec), 0.3);
  return faceSpan(args, spec, 0, f.L, 0, specTopY(spec), proud);
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
    ? { min: [-a.len / 2, 0, -a.t / 2], max: [a.len / 2, a.h + 0.003, a.t / 2] }
    : { min: [-a.t / 2, 0, -a.len / 2], max: [a.t / 2, a.h + 0.003, a.len / 2] },
  column: (a) => ({ min: [-a.w / 2, 0, -a.d / 2], max: [a.w / 2, a.h + 0.003, a.d / 2] }),
  stairs: (a) => {
    const [dx, dz] = DIRV[a.dir] ?? DIRV.N;
    const len = a.steps * a.run;
    const x0 = dx > 0 ? 0 : dx < 0 ? -len : -a.width / 2;
    const x1 = dx > 0 ? len : dx < 0 ? 0 : a.width / 2;
    const z0 = dz > 0 ? 0 : dz < 0 ? -len : -a.width / 2;
    const z1 = dz > 0 ? len : dz < 0 ? 0 : a.width / 2;
    return { min: [x0, 0, z0], max: [x1, a.steps * a.rise + 0.003, z1] };   // +2 mm seat lift
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
    const { w, d } = fp(spec); const y = specTopY(spec) + (a.lift ?? 0.2);
    return { min: [-w / 2, y, -d / 2], max: [w / 2, y + a.h, d / 2] };
  },
  // --- openings / facade / signs (face-anchored, tight u/v spans) ---
  windowBays: (a, spec) => {
    const f = faceFrame(a.face ?? 'N', fp(spec), 0.3);
    const m = a.module ?? { w: 1, h: 1, sill: 0.9 };
    const gap = (f.L - a.count * m.w) / (a.count + 1);
    const u0 = gap + (a.offset ?? 0), u1 = gap * a.count + m.w * (a.count - 1) + (a.offset ?? 0) + m.w;
    const y0 = (spec?.storeys?.[a.storey ?? 0]?.y ?? 0) + m.sill;
    return faceSpan(a, spec, u0, u1, y0, y0 + m.h);
  },
  doorway: (a, spec) => {
    const f = faceFrame(a.face ?? 'N', fp(spec), 0.3);
    const uc = f.L / 2 + (a.offset ?? 0);
    return faceSpan(a, spec, uc - a.width / 2 - 0.11, uc + a.width / 2 + 0.11, 0, a.height);
  },
  gateOpening: (a, spec) => {
    const f = faceFrame(a.face ?? 'N', fp(spec), 0.3);
    const uc = f.L / 2 + (a.offset ?? 0);
    return faceSpan(a, spec, uc - a.width / 2, uc + a.width / 2, 0, a.height);
  },
  cornice: (a, spec) => {
    const { w, d } = fp(spec); const y = specTopY(spec); const p = a.proud;
    return { min: [-w / 2 - p, y - a.h, -d / 2 - p], max: [w / 2 + p, y, d / 2 + p] };
  },
  pilaster: (a, spec) => faceExtent(a, spec, (a.proud ?? 0.06) + 0.01),
  // --- landmarks (floor-anchored cylinders) ---
  chimney: (a) => {
    const r = Math.max(a.rBase, a.rTop);
    return { min: [-r, 0, -r], max: [r, a.h, r] };
  },
  waterTank: (a) => {
    const r = a.r + 0.05;                                // tank drum + the cap lip
    return { min: [-r, 0, -r], max: [r, a.legH + a.h + 0.08, r] };
  },
  mast: (a) => ({ min: [-a.r, 0, -a.r], max: [a.r, a.h, a.r] }),
  // --- signage (tight spans around the board, same default v as the emitter) ---
  sign: (a, spec) => {
    const f = faceFrame(a.face ?? 'N', fp(spec), 0.3);
    const uc = f.L / 2 + (a.offset ?? 0);
    const vc = a.v ?? (specTopY(spec) * 0.78);
    return faceSpan(a, spec, uc - a.w / 2, uc + a.w / 2, vc - a.h / 2, vc + a.h / 2, 0.07);
  },
  stencil: (a, spec) => {
    const f = faceFrame(a.face ?? 'N', fp(spec), 0.3);
    const uc = f.L / 2 + (a.offset ?? 0);
    const vc = a.v ?? (specTopY(spec) * 0.78);
    return faceSpan(a, spec, uc - a.w / 2, uc + a.w / 2, vc - a.h / 2, vc + a.h / 2);
  },
  // --- reuse ---
  propRef: () => ({ min: [0, 0, 0], max: [0, 0, 0] }),   // prop bounds live in the prop's own spec (law 12)
  repeat: () => null,                                     // plan-time macro — expanded before bounds run
};
