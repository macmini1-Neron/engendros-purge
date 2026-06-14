import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DENOMS, value, cloneSet, emptySet, addSet, subSet, sigOf, exactSubset, makeChange, ChipBank,
} from '../../src/poker/chipbank.js';

// ---- pure helpers ---------------------------------------------------------

test('value sums denom*count; empty/missing keys are 0', () => {
  assert.equal(value({}), 0);
  assert.equal(value(emptySet()), 0);
  assert.equal(value({ 5: 2, 50: 1 }), 60);
  assert.equal(value({ 500: 1, 100: 6, 50: 4, 20: 5, 10: 5, 5: 10 }), 1500);
});

test('addSet/subSet are pure (no mutation) and conserve value', () => {
  const a = { 5: 1 }, b = { 5: 2, 10: 1 };
  assert.deepEqual(addSet(a, b), { 5: 3, 10: 1 });
  assert.deepEqual(a, { 5: 1 }, 'addSet did not mutate a');
  assert.deepEqual(b, { 5: 2, 10: 1 }, 'addSet did not mutate b');
  assert.equal(value(addSet(a, b)), value(a) + value(b));
  assert.deepEqual(subSet({ 5: 3, 10: 1 }, { 5: 1 }), { 5: 2, 10: 1 });
});

test('subSet throws rather than going negative', () => {
  assert.throws(() => subSet({ 5: 1 }, { 5: 2 }));
  assert.throws(() => subSet({ 50: 1 }, { 100: 1 }));
});

test('sigOf is deterministic and composition-sensitive (50:2 != 100:1 though same value)', () => {
  assert.equal(sigOf({ 50: 2 }), sigOf({ 50: 2 }));
  assert.notEqual(sigOf({ 50: 2 }), sigOf({ 100: 1 }));
  assert.equal(sigOf({ 5: 1, 50: 2 }), sigOf({ 50: 2, 5: 1 }), 'key order does not matter');
  assert.equal(sigOf({}), sigOf(emptySet()));
});

test('exactSubset picks an exact-value sub-multiset, largest-first', () => {
  assert.deepEqual(exactSubset({ 100: 1, 50: 2, 10: 1 }, 110), { 100: 1, 10: 1 });
  assert.deepEqual(exactSubset({ 50: 2 }, 100), { 50: 2 });
  assert.deepEqual(exactSubset({ 5: 3, 10: 1 }, 0), {});
});

test('exactSubset returns null when the amount is not formable from the set alone', () => {
  assert.equal(exactSubset({ 100: 1 }, 50), null);
  assert.equal(exactSubset({ 50: 1 }, 75), null);
});

test('exactSubset rejects a non-multiple-of-5 instantly (every denom is a multiple of 5)', () => {
  assert.equal(exactSubset({ 500: 1, 100: 6, 50: 4, 20: 5, 10: 5, 5: 10 }, 1498), null);
  assert.equal(exactSubset({ 5: 100 }, 3), null);
});

test('makeChange on a non-multiple-of-5 is fast and carries the sub-5 as short (no exhaustive search)', () => {
  // a big stack + an odd target used to blow up exactSubset into a multi-second hang; must be instant now
  const big = {}; for (const d of DENOMS) big[d] = 20;       // 13700 value, 120 chips
  const t0 = process.hrtime.bigint();
  const r = makeChange(big, { 5: 200, 10: 50 }, 9998);       // 9998 is NOT a multiple of 5
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 100, `makeChange must be fast on a non-multiple-of-5 (was ${ms.toFixed(0)} ms)`);
  assert.ok(r.short >= 9998 % 5, 'the sub-5 remainder is reported as short');
  for (const d of DENOMS) assert.equal((r.set[d] || 0) + (r.float[d] || 0), (big[d] || 0) + ({ 5: 200, 10: 50 }[d] || 0), `denom ${d} conserved`);
});

test('exactSubset backtracks — greedy-large would fail but a solution exists', () => {
  // greedy takes the 50 then is stuck at 10; the real answer is three 20s
  assert.equal(value(exactSubset({ 50: 1, 20: 3 }, 60)), 60);
  assert.deepEqual(exactSubset({ 50: 1, 20: 3 }, 60), { 20: 3 });
});

// ---- makeChange -----------------------------------------------------------

test('makeChange: exact already formable → no float touch', () => {
  const set = { 50: 2, 10: 1 }, float = { 5: 4 };
  const r = makeChange(set, float, 50);
  assert.equal(r.short, 0);
  assert.deepEqual(r.float, float, 'float untouched on the fast path');
  assert.ok(exactSubset(r.set, 50), 'set can now form 50');
});

test('makeChange: breaks a large chip against the float, value-neutral + conserved', () => {
  const set = { 100: 1 }, float = { 50: 4, 20: 5, 10: 5, 5: 10 };
  const r = makeChange(set, float, 50);
  assert.equal(r.short, 0);
  assert.ok(exactSubset(r.set, 50), 'set can now form exactly 50');
  assert.equal(value(r.set), value(set), 'player keeps the same total value');
  assert.equal(value(r.float), value(float), 'float value is unchanged (neutral swap)');
  for (const d of DENOMS) {
    assert.equal((r.set[d] || 0) + (r.float[d] || 0), (set[d] || 0) + (float[d] || 0), `denom ${d} conserved`);
  }
});

test('makeChange: float exhaustion is deterministic, reports short, conserves counts', () => {
  const set = { 100: 1 }, float = {};
  const r1 = makeChange(set, float, 50);
  const r2 = makeChange(set, float, 50);
  assert.deepEqual(r1, r2, 'deterministic');
  assert.ok(r1.short > 0, 'shortfall reported when the float cannot break the chip');
  for (const d of DENOMS) {
    assert.equal((r1.set[d] || 0) + (r1.float[d] || 0), (set[d] || 0) + (float[d] || 0), `denom ${d} conserved`);
    assert.ok((r1.set[d] || 0) >= 0 && (r1.float[d] || 0) >= 0, 'no negative counts');
  }
});

// ---- ChipBank: deal + conservation ---------------------------------------

const PER = { 500: 1, 100: 6, 50: 4, 20: 5, 10: 5, 5: 10 };       // = 1500
const FLOAT = { 100: 10, 50: 10, 20: 20, 10: 30, 5: 60 };

function totalCounts(bank) {
  const t = {};
  const add = (s) => { for (const d of DENOMS) t[d] = (t[d] || 0) + (s[d] || 0); };
  for (const id of Object.keys(bank.stacks)) add(bank.stacks[id]);
  for (const id of Object.keys(bank.bets)) add(bank.bets[id]);
  add(bank.pot); add(bank.float);
  return t;
}

function freshBank(ids = ['you', 'b1', 'b2']) {
  const bank = new ChipBank();
  bank.dealStart(ids, PER, FLOAT);
  return bank;
}

test('dealStart mints each player a stack and seeds the float; verify() holds', () => {
  const bank = freshBank();
  assert.equal(value(bank.stacks.you), 1500);
  assert.equal(value(bank.stacks.b1), 1500);
  assert.equal(value(bank.pot), 0);
  assert.equal(value(bank.float), value(FLOAT));
  assert.doesNotThrow(() => bank.verify());
});

test('postBet moves exact value stack→bet and conserves the minted total', () => {
  const bank = freshBank();
  const before = totalCounts(bank);
  bank.postBet('you', 20);
  assert.equal(value(bank.bets.you), 20);
  assert.equal(value(bank.stacks.you) + value(bank.bets.you) + bank.dust.you, 1500);
  assert.deepEqual(totalCounts(bank), before, 'per-colour totals unchanged by a bet');
  bank.verify();
});

test('postBet of 5 while holding only large chips pulls change from the rack', () => {
  const bank = new ChipBank();
  bank.dealStart(['you'], { 100: 1 }, FLOAT);   // player holds a single black
  bank.postBet('you', 5);
  assert.equal(value(bank.bets.you), 5);
  assert.equal(value(bank.stacks.you) + bank.dust.you, 95);
  bank.verify();
});

test('collectBetsToPot folds every bet into the pot', () => {
  const bank = freshBank();
  bank.postBet('you', 20); bank.postBet('b1', 20);
  bank.collectBetsToPot();
  assert.equal(value(bank.pot), 40);
  assert.equal(value(bank.bets.you), 0);
  assert.equal(value(bank.bets.b1), 0);
  bank.verify();
});

// ---- award ----------------------------------------------------------------

test('single winner receives the ACTUAL pot chips — two greens stay two greens', () => {
  const bank = new ChipBank();
  bank.dealStart(['you', 'b1'], { 50: 1 }, {});   // each holds one green; float empty
  bank.postBet('you', 50); bank.postBet('b1', 50);
  bank.collectBetsToPot();
  assert.deepEqual(bank.pot, { 50: 2 }, 'pot is literally two greens');
  bank.awardToWinners({ you: 100 }, ['you', 'b1']);
  assert.deepEqual(bank.stacks.you, { 50: 2 }, 'winner holds two greens, NOT one black');
  assert.equal(value(bank.pot), 0);
  bank.verify();
});

test('split pot: physical shares + dust reconstruct each engine share; counts conserved', () => {
  const bank = new ChipBank();
  bank.dealStart(['a', 'b', 'c'], { 50: 1 }, FLOAT);
  for (const id of ['a', 'b', 'c']) bank.postBet(id, 50);  // ignore; just to move chips
  bank.collectBetsToPot();
  const before = totalCounts(bank);
  // a 3-way chop of 100 the way awardPots would: 34/33/33
  bank.awardToWinners({ a: 34, b: 33, c: 33 }, ['a', 'b', 'c']);
  for (const [id, share] of [['a', 34], ['b', 33], ['c', 33]]) {
    assert.equal(value(bank.stacks[id]) + bank.dust[id], share, `${id} value+dust == engine share`);
  }
  assert.deepEqual(totalCounts(bank), before, 'per-colour totals conserved across the chop');
  assert.equal(value(bank.pot), 0, 'pot emptied');
  bank.verify();
});

test('awardToWinners splits asymmetric side-pot winnings — conserves chips + matches each share', () => {
  const bank = new ChipBank();
  bank.dealStart(['a', 'b'], {}, { 100: 5, 50: 5, 20: 5, 10: 5, 5: 10 });   // empty stacks, rich float
  bank.pot = { 100: 4, 50: 1, 10: 1 };                                      // a 460 pot...
  bank.float = subSet(bank.float, { 100: 4, 50: 1, 10: 1 });                // ...moved out of the float (conserved)
  const before = totalCounts(bank);
  bank.awardToWinners({ a: 340, b: 120 }, ['a', 'b']);                      // asymmetric main+side, sums to 460
  assert.equal(bank.stackValue('a'), 340, 'a gets exactly its side+main share');
  assert.equal(bank.stackValue('b'), 120, 'b gets exactly its share');
  assert.equal(value(bank.pot), 0, 'pot emptied');
  assert.deepEqual(totalCounts(bank), before, 'chips conserved across the asymmetric split');
  bank.verify();
});

test('a short postBet (starved float) underpays but never invents or loses a chip', () => {
  const bank = new ChipBank();
  bank.dealStart(['a'], { 500: 1 }, {});      // one yellow, EMPTY float → a 500 can never be broken
  const before = totalCounts(bank);
  bank.postBet('a', 5);                        // wants to bet 5, change impossible → short
  assert.ok(value(bank.bets['a'] || {}) < 5, 'bet zone underpaid because change was impossible');
  assert.deepEqual(totalCounts(bank), before, 'no chip invented or lost on the short path');
  bank.verify();
});

// ---- reconcile ------------------------------------------------------------

test('reconcile forces value+dust to equal the engine stack and conserves counts', () => {
  const bank = freshBank();
  const before = totalCounts(bank);
  bank.reconcile({ you: 1337, b1: 1500, b2: 1663 });   // sums to 4500 = 3*1500
  assert.equal(value(bank.stacks.you) + bank.dust.you, 1337);
  assert.equal(value(bank.stacks.b1) + bank.dust.b1, 1500);
  assert.equal(value(bank.stacks.b2) + bank.dust.b2, 1663);
  assert.ok(bank.dust.you >= 0 && bank.dust.you <= 4, 'dust stays in 0..4');
  assert.deepEqual(totalCounts(bank), before, 'reconcile is value-neutral on counts');
  bank.verify();
});

test('reconcile breaks a too-coarse overshoot chip against the float (no residual drift)', () => {
  const bank = new ChipBank();
  bank.dealStart(['a'], { 100: 1 }, { 50: 4, 20: 5, 10: 5, 5: 10 });   // player holds one black (100)
  const before = totalCounts(bank);
  bank.reconcile({ a: 50 });   // engine says a==50 → must shed 50, impossible from {100:1} alone
  assert.equal(bank.stackValue('a'), 50, 'reconcile hit the exact target by breaking the 100 against the float');
  assert.deepEqual(totalCounts(bank), before, 'counts conserved');
  bank.verify();
});

test('reconcile empties a busted player (engine stack 0)', () => {
  const bank = freshBank();
  bank.reconcile({ you: 0, b1: 2250, b2: 2250 });
  assert.equal(value(bank.stacks.you), 0);
  assert.equal(bank.dust.you, 0);
  bank.verify();
});

// ---- conservation fuzz ----------------------------------------------------

test('conservation invariant holds across a long random op sequence', () => {
  // deterministic LCG so the test is reproducible
  let seed = 123456789;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const ids = ['p0', 'p1', 'p2', 'p3'];
  const bank = new ChipBank();
  bank.dealStart(ids, PER, FLOAT);
  const minted = totalCounts(bank);
  for (let i = 0; i < 400; i++) {
    const id = ids[Math.floor(rnd() * ids.length)];
    const r = rnd();
    if (r < 0.55) {
      const amt = 5 * (1 + Math.floor(rnd() * 8));         // 5..40, multiple of 5
      if (value(bank.stacks[id]) + bank.dust[id] >= amt) bank.postBet(id, amt);
    } else if (r < 0.8) {
      bank.collectBetsToPot();
    } else if (r < 0.92) {
      const potV = value(bank.pot);
      if (potV > 0) { bank.awardToWinners({ [id]: potV }, ids); }
    } else {
      bank.collectBetsToPot();
      // settle: keep total value constant, redistribute as the engine would
      const tot = ids.reduce((a, x) => a + value(bank.stacks[x]) + bank.dust[x], 0) + value(bank.pot);
      const each = 5 * Math.floor(tot / ids.length / 5);
      const target = {}; let acc = 0;
      ids.forEach((x, k) => { target[x] = (k === ids.length - 1) ? tot - acc : each; acc += target[x]; });
      // park the pot's chips in the float before reconcile rebalances (chips aren't discarded)
      bank.float = addSet(bank.float, bank.pot);
      bank.pot = emptySet();
      bank.reconcile(target);
    }
    assert.deepEqual(totalCounts(bank), minted, `per-colour total drifted at step ${i}`);
    for (const d of DENOMS) {
      for (const x of ids) assert.ok((bank.stacks[x][d] || 0) >= 0, 'no negative stack counts');
      assert.ok((bank.float[d] || 0) >= 0, 'no negative float counts');
    }
  }
});
