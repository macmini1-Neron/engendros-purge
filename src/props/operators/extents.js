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
  cone: (a) => axisExtents(a.r, a.h / 2, a.axis ?? 'z'),
  texturedCylinder: (a) => axisExtents(Math.max(a.r, a.r2 ?? 0), a.h / 2, a.axis ?? 'z'),
  deltaFins: (a) => {
    const r = (a.r0 ?? 0) + a.span + (a.thick ?? 0.04) / 2;
    const zMin = Math.min(-a.root / 2, a.root / 2 - (a.sweep ?? a.root * 0.45) - (a.tip ?? a.root * 0.3));
    return { min: [-r, -r, zMin], max: [r, r, a.root / 2] };
  },
};

export const EXTENTS = {
  ...structuralExtents,
  ...furnitureExtents,
  ...containerExtents,
  ...roundExtents,
};
