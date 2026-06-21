// role.test.mjs — destruction role assignment: manifest defaults, per-emit pins, spec override,
// precedence (emit-pin ?? part-level ?? operator default), and determinism.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planBuild } from '../../src/buildings/plan.js';
import { MANIFEST } from '../../src/buildings/operators/manifest.js';

const base = (parts) => ({ id: '_t', footprint: { w: 8, h: 3.2, d: 6 }, storeys: [{ y: 0, h: 3 }],
  materials: { wall: 'brickRed', roof: 'corrugatedTin', trim: 'concrete', glass: 'glassPane', floor: 'concrete' }, parts });

test('every operator declares a role default', () => {
  for (const [op, m] of Object.entries(MANIFEST)) {
    assert.ok(['structural', 'cladding', 'none'].includes(m.role), `${op} role=${m.role}`);
  }
});

test('shellBox is mixed-role: wall field cladding, base slab + corner stubs structural', () => {
  const out = planBuild(base([{ id: 'shell', op: 'shellBox', args: { wall: 0.3 } }, { id: 'roof', op: 'flatRoof', args: { t: 0.2 } }]));
  assert.deepEqual(out.errors, []);
  const base0 = out.prims.find((p) => p.part === 'shell:base');
  assert.equal(base0.role, 'structural');
  const roof = out.prims.find((p) => p.part === 'roof');
  assert.equal(roof.role, 'structural', 'flatRoof default structural');
  const walls = out.prims.filter((p) => p.part.startsWith('shell:') && p.part !== 'shell:base');
  assert.ok(walls.some((p) => p.role === 'cladding'), 'interior wall field is cladding');
  assert.ok(walls.some((p) => p.role === 'structural'), 'corner stubs are structural');
});

test('part-level role overrides the operator default for the wall field, but corner pins survive', () => {
  // author marks the whole shell structural (a load-bearing-wall building)
  const out = planBuild(base([{ id: 'shell', op: 'shellBox', args: { wall: 0.3 }, role: 'structural' }, { id: 'roof', op: 'flatRoof', args: { t: 0.2 } }]));
  const walls = out.prims.filter((p) => p.part.startsWith('shell:') && p.part !== 'shell:base');
  assert.ok(walls.every((p) => p.role === 'structural'), 'whole wall field becomes structural');
});

test('corners:cladding opts out of structural corner stubs', () => {
  const out = planBuild(base([{ id: 'shell', op: 'shellBox', args: { wall: 0.3, corners: 'cladding' } }, { id: 'roof', op: 'flatRoof', args: { t: 0.2 } }]));
  const walls = out.prims.filter((p) => p.part.startsWith('shell:') && p.part !== 'shell:base');
  assert.ok(walls.every((p) => p.role === 'cladding'), 'no structural corner pins');
});

test('column / interiorWall / parapet default structural; gable roof + sign default cladding', () => {
  const out = planBuild(base([
    { id: 'shell', op: 'shellBox', args: { wall: 0.3 } },
    { id: 'col', op: 'column', args: { w: 0.4, d: 0.4, h: 3 }, at: [0, 0, 0], mat: 'concrete' },
    { id: 'gable', op: 'gableRoof', args: { rise: 1.2 } },
    { id: 'plate', op: 'sign', args: { face: 'N', w: 1.5, h: 0.4, text: 'X' } },
  ]));
  assert.equal(out.prims.find((p) => p.part === 'col').role, 'structural');
  assert.equal(out.prims.find((p) => p.part === 'gable').role, 'cladding');
  assert.equal(out.prims.find((p) => p.part === 'plate').role, 'cladding');
});

test('role assignment is deterministic (same spec ⇒ identical roles + ids)', () => {
  const spec = base([{ id: 'shell', op: 'shellBox', args: { wall: 0.3 } }, { id: 'roof', op: 'flatRoof', args: { t: 0.2 } }]);
  const a = planBuild(spec).prims.map((p) => [p.part, p.role]);
  const b = planBuild(spec).prims.map((p) => [p.part, p.role]);
  assert.deepEqual(a, b);
});
