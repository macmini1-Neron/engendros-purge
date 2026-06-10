// zfight.test.mjs — law 7 PROPERTY: a compiled building never contains two same-normal
// coplanar overlapping faces (the shimmer bug, machine-checked). Opposite-normal contact
// (stacked slabs, frames lining a reveal) is safe and NOT flagged.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planBuild } from '../../src/buildings/plan.js';

const SMOKE = JSON.parse(readFileSync(new URL('../../buildings/_smoke/spec.json', import.meta.url), 'utf8'));
const EPS = 1e-6;

const aabb = (c) => ({ min: [c.x - c.w / 2, c.y - c.h / 2, c.z - c.d / 2], max: [c.x + c.w / 2, c.y + c.h / 2, c.z + c.d / 2] });

// Same-normal coplanar overlap: min↔min or max↔max equal on one axis + STRICT overlap on both others.
export function zFightPairs(boxes) {
  const bad = [];
  const bs = boxes.map(aabb);
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const A = bs[i], B = bs[j];
    for (let ax = 0; ax < 3; ax++) {
      const o1 = (ax + 1) % 3, o2 = (ax + 2) % 3;
      const overlap = A.min[o1] < B.max[o1] - EPS && B.min[o1] < A.max[o1] - EPS
        && A.min[o2] < B.max[o2] - EPS && B.min[o2] < A.max[o2] - EPS;
      if (!overlap) continue;
      if (Math.abs(A.min[ax] - B.min[ax]) < EPS || Math.abs(A.max[ax] - B.max[ax]) < EPS) {
        bad.push({ i: boxes[i].part, j: boxes[j].part, axis: 'xyz'[ax] });
      }
    }
  }
  return bad;
}

// Building-shaped compile targets, each exercising different operator interactions.
const TARGETS = {
  smoke: SMOKE,
  gabledHouse: {
    id: '_t1', footprint: { w: 10, h: 4.8, d: 7 }, storeys: [{ y: 0, h: 3.2 }],
    materials: { wall: 'plaster', roof: 'corrugatedTin', trim: 'concrete', glass: 'glassPane', floor: 'concrete' },
    parts: [
      { id: 'shell', op: 'shellBox', args: { wall: 0.3 } },
      { id: 'door', op: 'doorway', args: { face: 'S', width: 1.8, height: 2.3 } },
      { id: 'winN', op: 'windowBays', args: { face: 'N', count: 3, module: { w: 1.2, h: 1.5, sill: 0.9 }, glass: true } },
      { id: 'winE', op: 'windowBays', args: { face: 'E', count: 2, module: { w: 1.0, h: 1.4, sill: 0.9 }, glass: true } },
      { id: 'roof', op: 'gableRoof', args: { rise: 1.6, overhang: 0.3 } },
      { id: 'cornice', op: 'cornice', args: { h: 0.25, proud: 0.08 } },
      { id: 'pilasters', op: 'pilaster', args: { face: 'S', w: 0.4, proud: 0.06, count: 4 } },
      { id: 'stencil', op: 'stencil', args: { face: 'S', w: 1.4, h: 0.4, text: 'ЦЕХ №3' } },
    ],
  },
  twoStoreyRoofAccess: {
    id: '_t2', footprint: { w: 9, h: 7.6, d: 7 }, storeys: [{ y: 0, h: 3.2 }, { y: 3.2, h: 3.2 }],
    materials: { wall: 'concretePanel', roof: 'concrete', trim: 'concrete', glass: 'glassPane', floor: 'concrete' },
    parts: [
      { id: 'shell', op: 'shellBox', args: { wall: 0.3 } },
      { id: 'door', op: 'doorway', args: { face: 'N', width: 1.6, height: 2.2 } },
      { id: 'win0', op: 'windowBays', args: { face: 'S', count: 3, module: { w: 1.2, h: 1.5, sill: 0.9 }, glass: true } },
      { id: 'win1', op: 'windowBays', args: { face: 'S', count: 3, storey: 1, module: { w: 1.2, h: 1.5, sill: 0.9 }, glass: true } },
      { id: 'slab1', op: 'floorSlab', args: { storey: 1, hole: { x: 2.6, z: 1.6, w: 1.5, d: 2.8 } } },
      { id: 'stairs', op: 'stairs', args: { steps: 10, rise: 0.32, run: 0.26, width: 1.2, dir: 'N' }, at: [2.6, 0.1, 0.3] },
      { id: 'roof', op: 'flatRoof', args: { t: 0.2 } },
      { id: 'parapet', op: 'parapet', args: { h: 0.9, t: 0.2, lift: 0.2 } },
    ],
  },
};

for (const [name, spec] of Object.entries(TARGETS)) {
  test(`PROPERTY: no same-normal coplanar overlapping faces — ${name}`, () => {
    const out = planBuild(spec);
    assert.deepEqual(out.errors, []);
    const boxes = out.prims.filter((c) => c.kind === 'box');
    assert.deepEqual(zFightPairs(boxes), []);
  });
}

test('PROPERTY: no two glass panes are coplanar-overlapping (transparency-sorting hazard)', () => {
  for (const spec of Object.values(TARGETS)) {
    const panes = planBuild(spec).prims.filter((c) => c.kind === 'pane');
    for (let i = 0; i < panes.length; i++) for (let j = i + 1; j < panes.length; j++) {
      const a = panes[i], b = panes[j];
      if (a.ry !== b.ry) continue;
      const samePlane = a.ry ? Math.abs(a.x - b.x) < EPS : Math.abs(a.z - b.z) < EPS;
      if (!samePlane) continue;
      const du = a.ry ? Math.abs(a.z - b.z) : Math.abs(a.x - b.x);
      const dv = Math.abs(a.y - b.y);
      const separated = du >= (a.w + b.w) / 2 - EPS || dv >= (a.h + b.h) / 2 - EPS;
      assert.ok(separated, 'two panes share a plane and overlap in BOTH u and v');
    }
  }
});

test('the predicate itself can fail: two stacked same-footprint slabs ARE flagged', () => {
  const boxes = [
    { kind: 'box', w: 2, h: 0.1, d: 2, x: 0, y: 0.05, z: 0, part: 'a' },
    { kind: 'box', w: 2, h: 0.4, d: 2, x: 0, y: 0.2, z: 0, part: 'b' },   // same bottom plane y=0, overlapping XZ
  ];
  assert.ok(zFightPairs(boxes).length > 0, 'a detector that cannot fire is decoration');
});
