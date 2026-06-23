import test from 'node:test';
import assert from 'node:assert/strict';
import { splitGeomAtY } from '../../src/destruct.js';

// triangles stacked along Y (one per unit), with colours + normals
function strip(n) {
  const pos = [], col = [], nor = [];
  for (let i = 0; i < n; i++) {
    pos.push(0, i, 0, 0.3, i + 0.1, 0, 0, i + 0.1, 0.3);
    col.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  return { pos, col, nor };
}

test('splitGeomAtY: cut partitions triangles by centroid + conserves vertices', () => {
  const { pos, col, nor } = strip(8);
  const { lo, hi } = splitGeomAtY(pos, col, nor, null, 1, 4);
  assert.equal(lo.positions.length + hi.positions.length, pos.length, 'no triangle lost or duplicated');
  assert.equal(lo.colors.length, lo.positions.length);
  assert.equal(hi.normals.length, hi.positions.length);
  // lo all below ~cut, hi all above
  for (let i = 1; i < lo.positions.length; i += 3) assert.ok(lo.positions[i] <= 4.2);
});

test('splitGeomAtY: hi is re-zeroed along comp (origin at the cut)', () => {
  const { pos } = strip(8);
  const cut = 4;
  const { hi } = splitGeomAtY(pos, null, null, null, 1, cut);
  // the lowest Y in hi should be ≈ (firstAboveCutTriangle.y - cut), i.e. small & ≥ 0-ish, never the original ~5
  let minY = Infinity; for (let i = 1; i < hi.positions.length; i += 3) minY = Math.min(minY, hi.positions[i]);
  assert.ok(minY < 2, `hi re-zeroed near 0, got ${minY}`);
  assert.ok(minY >= -0.2, 'hi not pushed negative');
});

test('splitGeomAtY: cut below all → everything in hi; cut above all → everything in lo', () => {
  const { pos } = strip(6);
  assert.equal(splitGeomAtY(pos, null, null, null, 1, -1).lo.positions.length, 0);
  assert.equal(splitGeomAtY(pos, null, null, null, 1, 100).hi.positions.length, 0);
});

test('splitGeomAtY: null colors/normals tolerated', () => {
  const { pos } = strip(4);
  const { lo, hi } = splitGeomAtY(pos, null, null, null, 1, 2);
  assert.equal(lo.colors, null); assert.equal(hi.normals, null);
});
