import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeTrunk, cellIndex, decodeCell, cellAABB } from '../../src/treecore.js';

test('makeTrunk: sizes + all cells alive', () => {
  const t = makeTrunk({ height: 12, radius: 0.6, bands: 6, sectors: 8, rings: 2, hp: 10 });
  assert.equal(t.alive.length, 6 * 8 * 2);
  assert.equal(t.alive.reduce((a, b) => a + b, 0), 6 * 8 * 2);   // all alive
  assert.ok(Math.abs(t.bandH - 2) < 1e-9);
});

test('cellIndex ↔ decodeCell roundtrip', () => {
  const t = makeTrunk({ height: 6, radius: 0.5, bands: 3, sectors: 6, rings: 2 });
  for (let b = 0; b < t.bands; b++) for (let s = 0; s < t.sectors; s++) for (let r = 0; r < t.rings; r++) {
    const i = cellIndex(t, b, s, r);
    assert.deepEqual(decodeCell(t, i), [b, s, r]);
  }
});

test('cellAABB: outer ring sits farther out than core, base band lowest', () => {
  const t = makeTrunk({ height: 6, radius: 0.6, bands: 3, sectors: 8, rings: 2 });
  const outer = cellAABB(t, 0, 0, 0).c;   // r=0 outer
  const core = cellAABB(t, 0, 0, 1).c;    // r=1 core
  assert.ok(Math.hypot(outer[0], outer[2]) > Math.hypot(core[0], core[2]));
  assert.ok(cellAABB(t, 0, 0, 0).c[1] < cellAABB(t, 2, 0, 0).c[1]);   // band 0 below band 2
});
