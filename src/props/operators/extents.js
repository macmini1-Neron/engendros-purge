// extents.js — per-operator local AABBs (pure data plumbing; no THREE).
// Each fn mirrors what its operator emits, including proud details (drawer
// handles, lid hardware). The bounds validator unions these — if an operator
// changes shape, its extents fn must change with it (tests enforce that every
// MANIFEST op has one).
import { structuralExtents } from './structural.js';
import { furnitureExtents } from './furniture.js';
import { containerExtents } from './container.js';

// The round operators (round.js) are THREE-bound, so their extents live HERE
// as pure math instead of being co-located (importing round.js would drag
// `three` into node-tested code). Default axis is z; r2 tapers, marks ignore.
const axisExtents = (lateral, axial, axis = 'z') => {
  const m = { x: [axial, lateral, lateral], y: [lateral, axial, lateral], z: [lateral, lateral, axial] }[axis];
  return { min: m.map((v) => -v), max: m };
};
const roundExtents = {
  cylinder: (a) => axisExtents(Math.max(a.r, a.r2 ?? 0), a.h / 2, a.axis ?? 'z'),
  disc: (a) => axisExtents(a.r, (a.h ?? 0.003) / 2, a.axis ?? 'y'),
  cone: (a) => axisExtents(a.r, a.h / 2, a.axis ?? 'z'),
  texturedCylinder: (a) => axisExtents(Math.max(a.r, a.r2 ?? 0), a.h / 2, a.axis ?? 'z'),
  deltaFins: (a) => {
    const r = (a.r0 ?? 0) + a.span + (a.thick ?? 0.04) / 2;
    const zMin = Math.min(-a.root / 2, a.root / 2 - (a.sweep ?? a.root * 0.45) - (a.tip ?? a.root * 0.3));
    return { min: [-r, -r, zMin], max: [r, r, a.root / 2] };
  },
  // ring of radius r + tube, lying in the plane whose normal is `axis` (thin along the normal)
  torus: (a) => axisExtents(a.r + a.tube, a.tube, a.axis ?? 'y'),
  // swept bar: the AABB of the control points, expanded by the tube radius
  tube: (a) => {
    const r = a.tube, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of a.pts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i] - r); mx[i] = Math.max(mx[i], p[i] + r); }
    return { min: mn, max: mx };
  },
  // flat circular label, ~3 mm thick along its normal axis
  texturedDisc: (a) => axisExtents(a.r, 0.003, a.axis ?? 'y'),
  // flat rectangular decal w×h, ~3 mm proud along its normal axis
  decal: (a) => {
    const hw = a.w / 2, hh = a.h / 2, th = 0.003, ax = a.axis ?? 'z';
    if (ax === 'y') return { min: [-hw, -th, -hh], max: [hw, th, hh] };
    if (ax === 'x') return { min: [-th, -hw, -hh], max: [th, hw, hh] };
    return { min: [-hw, -hh, -th], max: [hw, hh, th] };
  },
  // rounded stadium loaf shell — honest w×h×d box (the profile is pre-shrunk by the bevel)
  loaf: (a) => ({ min: [-a.w / 2, -a.h / 2, -a.d / 2], max: [a.w / 2, a.h / 2, a.d / 2] }),
};

export const EXTENTS = {
  ...structuralExtents,
  ...furnitureExtents,
  ...containerExtents,
  ...roundExtents,
};
