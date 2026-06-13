import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DENOMS, breakdown, totalChips } from '../../src/poker/chips.js';

test('breakdown(0) is empty and totalChips(0) is 0', () => {
  assert.deepEqual(breakdown(0), []);
  assert.equal(totalChips(0), 0);
});

test('breakdown(5) is a single smallest (5) chip', () => {
  assert.deepEqual(breakdown(5), [{ denom: 5, count: 1 }]);
  assert.equal(totalChips(5), 1);
});

test('breakdown is exact for multiples of 5 — sum of denom*count equals the amount', () => {
  for (const amt of [5, 10, 20, 50, 100, 150, 500, 635, 1500, 2025, 99995]) {
    const sum = breakdown(amt).reduce((a, b) => a + b.denom * b.count, 0);
    assert.equal(sum, amt, `breakdown(${amt}) must sum back to ${amt}`);
  }
});

test('a sub-5 remainder is floored off (smallest chip is 5)', () => {
  for (const amt of [1, 4, 37, 1388, 99999]) {
    const sum = breakdown(amt).reduce((a, b) => a + b.denom * b.count, 0);
    assert.equal(sum, amt - (amt % 5), `breakdown(${amt}) floors to the nearest 5`);
  }
  assert.deepEqual(breakdown(4), []);
});

test('totalChips equals the sum of the breakdown counts', () => {
  for (const amt of [0, 5, 635, 1500, 2025]) {
    const fromBreakdown = breakdown(amt).reduce((a, b) => a + b.count, 0);
    assert.equal(totalChips(amt), fromBreakdown);
  }
});

test('breakdown is greedy — denominations descending, no zero-count rows, none repeated', () => {
  assert.deepEqual(breakdown(635), [
    { denom: 500, count: 1 }, { denom: 100, count: 1 }, { denom: 20, count: 1 }, { denom: 10, count: 1 }, { denom: 5, count: 1 },
  ]);
  for (const amt of [10, 50, 150, 1500, 99995]) {
    const r = breakdown(amt);
    const denoms = r.map((x) => x.denom);
    assert.deepEqual(denoms, [...denoms].sort((a, b) => b - a), 'descending');
    assert.equal(new Set(denoms).size, denoms.length, 'no repeats');
    assert.ok(r.every((x) => x.count > 0), 'no zero rows');
  }
});

test('DENOMS — smallest chip is 5, sorted descending (the owner chip set 5/10/20/50/100/500)', () => {
  assert.equal(Math.min(...DENOMS), 5);
  assert.deepEqual([...DENOMS].sort((a, b) => b - a), DENOMS, 'DENOMS is sorted descending');
  assert.deepEqual(new Set(DENOMS), new Set([5, 10, 20, 50, 100, 500]));
});

test('breakdown of a negative amount is empty (defensive)', () => {
  assert.deepEqual(breakdown(-50), []);
  assert.equal(totalChips(-50), 0);
});
