import test from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST, operatorNames } from '../../src/props/operators/manifest.js';

test('manifest lists the F0 operators', () => {
  for (const op of ['bevelBox', 'panel', 'plate', 'drawerStack', 'legs']) {
    assert.ok(operatorNames().includes(op), `missing operator ${op}`);
  }
});

test('every operator declares args[] and dims[], dims ⊆ args', () => {
  for (const [op, m] of Object.entries(MANIFEST)) {
    assert.ok(Array.isArray(m.args), `${op}.args`);
    assert.ok(Array.isArray(m.dims), `${op}.dims`);
    for (const d of m.dims) assert.ok(m.args.includes(d), `${op}: dim '${d}' not in args`);
  }
});
