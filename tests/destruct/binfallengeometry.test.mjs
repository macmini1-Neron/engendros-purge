import test from 'node:test';
import assert from 'node:assert/strict';
import { binFallenGeometry } from '../../src/destruct.js';

// a strip of `n` triangles stacked along one axis (comp), one per unit, with colours + normals
function strip(n, comp = 1) {
  const pos = [], col = [], nor = [];
  for (let i = 0; i < n; i++) {
    const a = [0, 0, 0], b = [0.3, 0, 0], c = [0, 0, 0.3];
    a[comp] = i; b[comp] = i + 0.1; c[comp] = i + 0.1;
    pos.push(...a, ...b, ...c);
    col.push(1, 0, 0, 0, 1, 0, 0, 0, 1);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  }
  return { pos, col, nor };
}

test('binFallenGeometry: partitions along Y, conserves vertices, covers the span', () => {
  const { pos, col, nor } = strip(7, 1);
  const bins = binFallenGeometry(pos, col, nor, null, 1, 1, 8);
  assert.ok(bins.length >= 4 && bins.length <= 8, `got ${bins.length} bins`);
  // vertex conservation: sum of bin positions === input positions
  const sum = bins.reduce((s, b) => s + b.positions.length, 0);
  assert.equal(sum, pos.length, 'every triangle landed in exactly one bin');
  // each bin: positions a multiple of 9 (whole triangles), colours/normals match
  for (const b of bins) {
    assert.equal(b.positions.length % 9, 0);
    assert.equal(b.colors.length, b.positions.length);
    assert.equal(b.normals.length, b.positions.length);
  }
  // union spans the full 0..~6 run, bins ordered low→high
  const ys = bins.map(b => (b.min[1] + b.max[1]) / 2);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1], 'bins ordered low→high along Y');
  assert.ok(Math.min(...bins.map(b => b.min[1])) <= 0.01);
  assert.ok(Math.max(...bins.map(b => b.max[1])) >= 6.0);
});

test('binFallenGeometry: comp selects the axis (bin along X)', () => {
  const { pos } = strip(6, 0);                 // strip along X
  const bins = binFallenGeometry(pos, null, null, null, 0, 1, 8);
  assert.ok(bins.length >= 5, `got ${bins.length}`);
  for (const b of bins) assert.ok((b.max[0] - b.min[0]) < 1.5, 'each X-bin is thin in X');
});

test('binFallenGeometry: maxBins cap respected + deterministic', () => {
  const { pos, col, nor } = strip(20, 1);
  const a = binFallenGeometry(pos, col, nor, null, 1, 0.5, 5);
  const b = binFallenGeometry(pos, col, nor, null, 1, 0.5, 5);
  assert.ok(a.length <= 5, `cap, got ${a.length}`);
  assert.deepEqual(a, b);
});

test('binFallenGeometry: null colors/normals → bins carry null', () => {
  const { pos } = strip(4, 1);
  const bins = binFallenGeometry(pos, null, null, null, 1, 1, 8);
  for (const b of bins) { assert.equal(b.colors, null); assert.equal(b.normals, null); }
});

test('binFallenGeometry: degenerate input → empty', () => {
  assert.deepEqual(binFallenGeometry([], null, null, null, 1), []);
  assert.deepEqual(binFallenGeometry([1, 2, 3, 4, 5, 6], null, null, null, 1), []); // < 1 triangle (needs 9)
});
