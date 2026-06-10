// manifest.test.mjs — the operator vocabulary is complete and well-formed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST, operatorNames } from '../../src/buildings/operators/manifest.js';
import { EXTENTS } from '../../src/buildings/operators/extents.js';

const ANCHORS = ['floor', 'center', 'face', 'top', 'free'];
const FAMILIES = ['shell', 'roof', 'opening', 'facade', 'landmark', 'sign', 'ref'];

test('every operator entry has args/dims/anchor/family/collide and dims ⊆ args', () => {
  for (const [op, m] of Object.entries(MANIFEST)) {
    assert.ok(Array.isArray(m.args), `${op}.args`);
    assert.ok(Array.isArray(m.dims), `${op}.dims`);
    assert.ok(ANCHORS.includes(m.anchor), `${op}.anchor '${m.anchor}'`);
    assert.ok(FAMILIES.includes(m.family), `${op}.family '${m.family}'`);
    assert.equal(typeof m.collide, 'boolean', `${op}.collide`);
    for (const d of m.dims) assert.ok(m.args.includes(d), `${op}: dim '${d}' not in args`);
  }
});

test('every operator has an extents function', () => {
  for (const op of operatorNames()) {
    assert.ok(op in EXTENTS, `EXTENTS missing '${op}' — the bounds validator depends on it`);
  }
});

test('the v1 operator set is exactly the documented one', () => {
  assert.deepEqual(operatorNames().sort(), [
    'chimney', 'column', 'cornice', 'doorway', 'flatRoof', 'floorSlab', 'gableRoof',
    'gateOpening', 'hipRoof', 'interiorWall', 'mast', 'parapet', 'pilaster', 'propRef',
    'repeat', 'sawtoothRoof', 'shellBox', 'sign', 'stairs', 'stencil', 'waterTank', 'windowBays',
  ]);
});
