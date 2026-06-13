import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENOMS, breakdown, totalChips } from '../../src/poker/chips.js';

test('breakdown(0) is empty and totalChips(0) is 0', () => {
  assert.deepEqual(breakdown(0), []);
  assert.equal(totalChips(0), 0);
});

test('breakdown(1) is a single unit chip', () => {
  assert.deepEqual(breakdown(1), [{ denom: 1, count: 1 }]);
  assert.equal(totalChips(1), 1);
});

test('breakdown is exact — sum of denom*count equals the amount', () => {
  for (const amt of [1, 5, 20, 37, 150, 1500, 2025, 6789, 99999]) {
    const sum = breakdown(amt).reduce((a, b) => a + b.denom * b.count, 0);
    assert.equal(sum, amt, `breakdown(${amt}) must sum back to ${amt}`);
  }
});

test('totalChips equals the sum of the breakdown counts', () => {
  for (const amt of [0, 1, 37, 1500, 2025, 99999]) {
    const fromBreakdown = breakdown(amt).reduce((a, b) => a + b.count, 0);
    assert.equal(totalChips(amt), fromBreakdown);
  }
});

test('breakdown is greedy — denominations descending, no zero-count rows, none repeated', () => {
  const rows = breakdown(2025); // 2x1000 + 1x25
  assert.deepEqual(rows, [{ denom: 1000, count: 2 }, { denom: 25, count: 1 }]);
  // general invariants over a sweep
  for (const amt of [5, 37, 150, 1500, 6789]) {
    const r = breakdown(amt);
    const denoms = r.map((x) => x.denom);
    assert.deepEqual(denoms, [...denoms].sort((a, b) => b - a), 'descending');
    assert.equal(new Set(denoms).size, denoms.length, 'no repeats');
    assert.ok(r.every((x) => x.count > 0), 'no zero rows');
  }
});

test('DENOMS includes a unit chip so any non-negative integer is representable', () => {
  assert.ok(DENOMS.includes(1));
  assert.deepEqual([...DENOMS].sort((a, b) => b - a), DENOMS, 'DENOMS is sorted descending');
});

test('breakdown of a negative amount is empty (defensive)', () => {
  assert.deepEqual(breakdown(-50), []);
  assert.equal(totalChips(-50), 0);
});
