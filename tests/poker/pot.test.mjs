import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, awardPots } from '../../src/poker/pot.js';

// helper hand ranks (cat only is enough to order these tests)
const R = (cat, ...ranks) => ({ cat, ranks });

test('single pot, no all-ins', () => {
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 100, folded: false },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 200);
  assert.deepEqual(pots[0].eligible.sort(), ['A', 'B']);
});

test('layered side pot: short all-in + two coverers', () => {
  // A all-in 100, B and C each 250
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 250, folded: false },
    { seat: 'C', committed: 250, folded: false },
  ]);
  // main 300 (A,B,C), side 300 (B,C)
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), ['A', 'B', 'C']);
  assert.equal(pots[1].amount, 300);
  assert.deepEqual(pots[1].eligible.sort(), ['B', 'C']);
});

test('folded player leaves dead money but is not eligible', () => {
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: true },
    { seat: 'B', committed: 100, folded: false },
    { seat: 'C', committed: 100, folded: false },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 300);            // A's 100 is dead money in the pot
  assert.deepEqual(pots[0].eligible.sort(), ['B', 'C']); // A can't win
});

test('award: short all-in wins only the main pot, coverer wins the side', () => {
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 250, folded: false },
    { seat: 'C', committed: 250, folded: false },
  ]);
  const rankOf = { A: R(7), B: R(2), C: R(1) };  // A best overall, B beats C
  const win = awardPots(pots, rankOf, ['A', 'B', 'C']);
  assert.equal(win.A, 300);  // main pot only (A wasn't eligible for the side)
  assert.equal(win.B, 300);  // side pot
  assert.ok(!win.C);
});

test('odd chip in a split pot goes to the first seat left of the button', () => {
  // three-way even split: 300 / 3 = 100 each, no remainder
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 100, folded: false },
    { seat: 'C', committed: 100, folded: false },
  ]);
  assert.deepEqual(awardPots(pots, { A: R(4), B: R(4), C: R(4) }, ['A', 'B', 'C']), { A: 100, B: 100, C: 100 });

  // odd pot of 101 split between two tied winners -> 50 each + 1 leftover chip
  const odd = [{ amount: 101, eligible: ['A', 'B'] }];
  assert.deepEqual(awardPots(odd, { A: R(4), B: R(4) }, ['A', 'B']), { A: 51, B: 50 }); // odd chip to A
  assert.deepEqual(awardPots(odd, { A: R(4), B: R(4) }, ['B', 'A']), { A: 50, B: 51 }); // odd chip to B (first left of button)
});

test('an uncalled extra chip is returned to its owner, not shared', () => {
  // A committed 1 more than anyone called -> that chip is A's own 1-chip side pot
  const pots = buildPots([
    { seat: 'A', committed: 101, folded: false },
    { seat: 'B', committed: 100, folded: false },
    { seat: 'C', committed: 100, folded: false },
  ]);
  const win = awardPots(pots, { A: R(4), B: R(4), C: R(4) }, ['A', 'B', 'C']);
  assert.equal(win.A, 101); // 100 (third of the 300 main) + 1 (own uncalled chip back)
  assert.equal(win.B, 100);
  assert.equal(win.C, 100);
});

test('uncontested pot: lone non-folder wins it all', () => {
  const pots = buildPots([
    { seat: 'A', committed: 50, folded: true },
    { seat: 'B', committed: 50, folded: false },
  ]);
  const win = awardPots(pots, { B: R(0) }, ['A', 'B']);
  assert.equal(win.B, 100);
});
