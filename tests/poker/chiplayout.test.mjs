import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutChips, CHIP_T, COL_CAP } from '../../src/poker/chiplayout.js';

test('exact real count: one placement per physical chip', () => {
  const set = { 100: 3, 25: 0, 5: 7 };
  assert.equal(layoutChips(set).length, 10); // 3 + 7, never approximated
});

test('column cap wraps a tall denom into extra columns, never drops chips', () => {
  const set = { 5: COL_CAP * 2 + 3 };
  const p = layoutChips(set);
  assert.equal(p.length, COL_CAP * 2 + 3);
  const cols = new Set(p.map((c) => c.x.toFixed(4)));
  assert.equal(cols.size, 3); // three columns: cap, cap, 3
});

test('chips in a column stack by thickness', () => {
  const p = layoutChips({ 5: 3 });
  assert.equal(p[0].y, 0);
  assert.ok(Math.abs(p[1].y - CHIP_T) < 1e-9 + 0.001); // one chip-thickness up (+gap)
});

test('jitter is seeded + deterministic (same seed → same offsets)', () => {
  const a = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 42 });
  const b = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 42 });
  assert.deepEqual(a, b);
  const c = layoutChips({ 100: 5 }, { jitter: 0.002, seed: 7 });
  assert.notDeepEqual(a, c);
});
