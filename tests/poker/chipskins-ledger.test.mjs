import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChipBank, value, sigOf,
  HOUSE_SKIN, skinValueByDenom, mergeSkinned, drawSkinned, clampSkinsTo,
} from '../../src/poker/chipbank.js';

// ---- pure ledger helpers --------------------------------------------------

test('skinValueByDenom sums per-denom over all skins', () => {
  const m = { marx: { 100: 2, 50: 1 }, lenin: { 100: 1 } };
  assert.deepEqual(skinValueByDenom(m), { 100: 3, 50: 1 });
  assert.deepEqual(skinValueByDenom({}), {});
});

test('mergeSkinned unions skins + denoms, pure, drops empties', () => {
  const a = { marx: { 100: 1 } }, b = { marx: { 50: 2 }, lenin: { 100: 1 } };
  assert.deepEqual(mergeSkinned(a, b), { marx: { 100: 1, 50: 2 }, lenin: { 100: 1 } });
  assert.deepEqual(a, { marx: { 100: 1 } }, 'mergeSkinned did not mutate a');
});

test('drawSkinned pulls preferSkin first, then others; mutates src', () => {
  const src = { marx: { 100: 2 }, lenin: { 100: 2 } };
  const out = drawSkinned(src, { 100: 3 }, 'marx');
  assert.deepEqual(out, { marx: { 100: 2 }, lenin: { 100: 1 } }, 'own skin drained before foreign');
  assert.deepEqual(src, { lenin: { 100: 1 } }, 'src mutated, emptied skins pruned');
});

test('drawSkinned shortfall is attributed to fallbackSkin (not always house)', () => {
  const src = { marx: { 100: 1 } };                    // no 50-chips present
  const out = drawSkinned(src, { 50: 1 }, 'marx', 'marx'); // value economy broke a chip under us
  assert.deepEqual(out, { marx: { 50: 1 } }, 'shortfall minted in fallback (own) skin');
  const out2 = drawSkinned({ marx: { 100: 1 } }, { 50: 1 }, 'marx'); // default fallback = house
  assert.deepEqual(out2, { [HOUSE_SKIN]: { 50: 1 } });
});

test('clampSkinsTo fills deficit into fillSkin, trims surplus house-first', () => {
  assert.deepEqual(clampSkinsTo({ marx: { 100: 1 } }, { 100: 1, 50: 2 }, 'marx'), { marx: { 100: 1, 50: 2 } });
  // surplus: real wants one 100, ledger has house+marx → house trimmed first
  assert.deepEqual(clampSkinsTo({ [HOUSE_SKIN]: { 100: 1 }, marx: { 100: 1 } }, { 100: 1 }, 'marx'), { marx: { 100: 1 } });
});

// ---- ChipBank ledger flow -------------------------------------------------

const PER = { 100: 2, 50: 2 };          // 300 per player, all whole-chip
const FLOAT = { 100: 2, 50: 2 };

function bank() {
  const b = new ChipBank();
  b.dealStart(['A', 'B'], PER, FLOAT, { A: 'marx', B: 'lenin' });
  return b;
}

test('dealStart mints each stack in its own skin + float as house; verifySkins holds', () => {
  const b = bank();
  assert.deepEqual(b.skinsAt.stacks.A, { marx: { 100: 2, 50: 2 } });
  assert.deepEqual(b.skinsAt.stacks.B, { lenin: { 100: 2, 50: 2 } });
  assert.deepEqual(b.skinsAt.float, { [HOUSE_SKIN]: { 100: 2, 50: 2 } });
  assert.ok(b.verifySkins());
});

test('whole-chip bet keeps the owner skin; verifySkins holds', () => {
  const b = bank();
  b.postBet('A', 100);
  assert.deepEqual(b.skinsAt.bets.A, { marx: { 100: 1 } });
  assert.deepEqual(b.skinsAt.stacks.A, { marx: { 100: 1, 50: 2 } });
  assert.ok(b.verifySkins());
});

test('FLAGSHIP: collected pot is a genuine MIX of both players’ skins', () => {
  const b = bank();
  b.postBet('A', 100); b.postBet('B', 100);
  b.collectBetsToPot();
  assert.equal(value(b.pot), 200);
  assert.ok(b.skinsAt.pot.marx && b.skinsAt.pot.lenin, 'pot holds both marx and lenin chips');
  assert.deepEqual(skinValueByDenom(b.skinsAt.pot), b.pot, 'pot ledger sums to the real pot');
  assert.ok(b.verifySkins());
});

test('FLAGSHIP: the winner inherits the pot mix — a LENIN chip ends up in marx-player A’s stack', () => {
  const b = bank();
  b.postBet('A', 100); b.postBet('B', 100);
  b.awardToWinners({ A: 200 }, ['A', 'B']);            // collectBetsToPot runs inside
  assert.equal(value(b.stacks.A), 400);
  assert.ok(b.skinsAt.stacks.A.lenin, 'A’s stack now visibly contains a chip won from B (lenin skin)');
  assert.deepEqual(skinValueByDenom(b.skinsAt.stacks.A), b.stacks.A, 'A’s stack ledger sums to reality');
  assert.equal(value(b.pot), 0);
  assert.ok(b.verifySkins());
});

test('change-making bet keeps the owner skin (no stray house chips in the player’s zone)', () => {
  const b = new ChipBank();
  b.dealStart(['A'], { 100: 1 }, { 50: 2 }, { A: 'marx' });   // A must break the 100 against the float to bet 50
  b.postBet('A', 50);
  assert.equal(value(b.bets.A), 50);
  assert.ok(!b.skinsAt.bets.A[HOUSE_SKIN], 'bet chip is the owner skin, not house');
  assert.ok(!(b.skinsAt.stacks.A[HOUSE_SKIN]), 'the kept change chip is the owner skin, not house');
  assert.ok(b.verifySkins());
});

test('multi-hand: won skins COMPOUND and verifySkins holds throughout', () => {
  const b = bank();
  // hand 1: A wins B's 100
  b.postBet('A', 100); b.postBet('B', 100); b.awardToWinners({ A: 200 }, ['A', 'B']);
  b.reconcile([{ id: 'A', stack: 400 }, { id: 'B', stack: 200 }]);
  assert.ok(b.verifySkins());
  // hand 2: B wins A's 100 back — A still carries a lenin chip from before; sums stay exact
  b.postBet('A', 100); b.postBet('B', 100); b.awardToWinners({ B: 200 }, ['B', 'A']);
  b.reconcile([{ id: 'A', stack: 300 }, { id: 'B', stack: 300 }]);
  assert.ok(b.verifySkins());
  assert.deepEqual(skinValueByDenom(b.skinsAt.stacks.B), b.stacks.B);
});

test('value invariant verify() is untouched + still passes through ledger ops', () => {
  const b = bank();
  b.postBet('A', 100); b.postBet('B', 100); b.awardToWinners({ A: 200 }, ['A', 'B']);
  b.reconcile([{ id: 'A', stack: 400 }, { id: 'B', stack: 200 }]);
  assert.ok(b.verify(), 'value conservation intact');
  assert.ok(b.verifySkins(), 'skin ledger reconciles');
});
