import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ChipBank, value,
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

// ---- degenerate paths (review-hardening: each runs the ledger code with a concrete provenance assert) ----

test('CHOP split-pot: both winners draw from the mixed pot + inherit a foreign skin', () => {
  const b = new ChipBank();
  b.dealStart(['A', 'B'], { 50: 2, 10: 5 }, { 50: 2, 10: 5 }, { A: 'marx', B: 'lenin' });
  b.postBet('A', 50); b.postBet('B', 50);
  b.awardToWinners({ A: 50, B: 50 }, ['A', 'B']);          // tie → 100 pot chopped 50/50 (the multi-winner award loop)
  assert.equal(value(b.pot), 0);
  assert.equal(value(b.stacks.A), 150); assert.equal(value(b.stacks.B), 150); // each: 150 start − 50 bet + 50 chop
  // no-prefer draw walks skinOrder (lenin<marx): A takes lenin, B takes the marx → each inherits the other's skin
  assert.ok(b.skinsAt.stacks.A.lenin, 'marx-player A won a lenin chip');
  assert.ok(b.skinsAt.stacks.B.marx, 'lenin-player B won a marx chip');
  assert.ok(b.verifySkins());
});

test('reconcile that actually SHUFFLES chips (overshoot + shortfall) → ledger clamps hold', () => {
  const b = new ChipBank();
  b.dealStart(['A', 'B'], { 100: 2, 50: 2 }, { 100: 5, 50: 5, 20: 5, 10: 5, 5: 5 }, { A: 'marx', B: 'lenin' });
  b.reconcile([{ id: 'A', stack: 250 }, { id: 'B', stack: 350 }]); // A 300→250 (return 50), B 300→350 (top up 50): real moves
  assert.equal(value(b.stacks.A), 250); assert.equal(value(b.stacks.B), 350);
  assert.ok(b.verify(), 'value conservation intact');
  assert.ok(b.verifySkins(), 'skin ledger reconciles after corrective shuffles');
});

test('busted player (reconcile to 0) empties cleanly; verifySkins holds', () => {
  const b = new ChipBank();
  b.dealStart(['A', 'B'], { 100: 2 }, { 100: 4 }, { A: 'marx', B: 'lenin' });
  b.reconcile([{ id: 'A', stack: 400 }, { id: 'B', stack: 0 }]); // B busts: 200→0 (returns both 100s)
  assert.equal(value(b.stacks.B), 0);
  assert.ok(b.verify()); assert.ok(b.verifySkins());
});

test('COMPOUNDING: betting past your own-skin holdings pushes a WON foreign chip into the pot', () => {
  const b = new ChipBank();
  b.dealStart(['A', 'B'], { 50: 1 }, {}, { A: 'marx', B: 'lenin' });
  b.postBet('A', 50); b.postBet('B', 50); b.collectBetsToPot();    // pot = marx 50 + lenin 50
  b.awardToWinners({ A: 100 }, ['A', 'B']);                        // A now holds a marx 50 + a won lenin 50
  b.postBet('A', 100);                                            // bet 100 → must use BOTH, incl the foreign lenin
  assert.ok(b.skinsAt.bets.A.marx, 'A’s own marx chip is in the bet');
  assert.ok(b.skinsAt.bets.A.lenin, 'the won lenin chip flows back out as lenin');
  assert.ok(b.verifySkins());
});

test('starved float short bet: chips are never invented; both invariants hold', () => {
  const b = new ChipBank();
  b.dealStart(['A'], { 100: 1 }, {}, { A: 'marx' });               // empty float can't break the 100 to bet 50
  b.postBet('A', 50);                                             // → short; nothing physical moves (no minting)
  assert.equal(value(b.stacks.A), 100); assert.equal(value(b.bets.A || {}), 0);
  assert.ok(b.verify()); assert.ok(b.verifySkins());
});

test('mergeSkinned drops an empty source skin set + does not mutate b', () => {
  const a = { marx: { 100: 1 } }, bb = { marx: {}, lenin: { 100: 1 } };
  assert.deepEqual(mergeSkinned(a, bb), { marx: { 100: 1 }, lenin: { 100: 1 } });
  assert.deepEqual(bb, { marx: {}, lenin: { 100: 1 } }, 'mergeSkinned did not mutate b');
});

test('clampSkinsTo surplus: house exhausted → spills into the remaining skins (sorted)', () => {
  // real wants one 100; ledger has house 1 + marx 2 = 3 → trim house first (1), then marx (1) to hit the target
  assert.deepEqual(clampSkinsTo({ [HOUSE_SKIN]: { 100: 1 }, marx: { 100: 2 } }, { 100: 1 }, 'lenin'), { marx: { 100: 1 } });
});

// ---- reskin preserves won-chip provenance (co-op _beginHand regression) ----
// In co-op the host calls chipbank.reskin(rosterSkins) at EVERY hand boundary to pick up a lobby skin
// change. It must NOT wipe the multi-skin provenance of chips you won from other players (the КАТРАН
// "see how many you won from whom" look). Solo never reskins, so this only ever bit co-op.

function winMixedPot() {
  const cb = new ChipBank();
  const ids = ['you', 'b0', 'b1'];
  cb.dealStart(ids, { 500: 1, 100: 6, 50: 4, 20: 5, 10: 5, 5: 10 }, { 100: 10, 50: 10, 20: 20, 10: 30, 5: 60 },
    { you: 'dice', b0: 'casino', b1: 'lenin' });
  for (const id of ids) cb.postBet(id, 100);   // each contributes its own-skin chips
  cb.collectBetsToPot();                        // pot = mix of dice/casino/lenin
  cb.awardToWinners({ you: value(cb.pot) }, ids); // YOU win the whole pot
  return cb;
}
const stackSkins = (cb, id) => Object.keys(cb.skinsAt.stacks[id] || {}).sort();

test('reskin with UNCHANGED skins preserves won-chip provenance (the co-op per-hand refresh)', () => {
  const cb = winMixedPot();
  const won = stackSkins(cb, 'you');
  assert.deepEqual(won, ['casino', 'dice', 'lenin'], 'winner stack holds its own + the two losers\' skins');
  cb.reskin({ you: 'dice', b0: 'casino', b1: 'lenin' });   // host re-applies the SAME roster skins next hand
  assert.deepEqual(stackSkins(cb, 'you'), won, 'provenance preserved — NOT collapsed to just the owner skin');
  assert.ok(cb.verify() && cb.verifySkins(), 'conservation + ledger still reconcile');
});

test('reskin on a REAL skin change moves only the owner\'s own chips, keeps won chips', () => {
  const cb = winMixedPot();                                 // you=dice + won casino + lenin
  const ownDiceValue = value(cb.skinsAt.stacks.you.dice);
  cb.reskin({ you: 'star' });                               // you change dice → star
  const after = stackSkins(cb, 'you');
  assert.deepEqual(after, ['casino', 'lenin', 'star'], 'own chips became star; won casino/lenin untouched');
  assert.equal(value(cb.skinsAt.stacks.you.star), ownDiceValue, 'the moved own-skin value is exactly what was dice');
  assert.ok(!cb.skinsAt.stacks.you.dice, 'no dice bucket left');
  assert.ok(cb.verify() && cb.verifySkins());
});

test('reskin is a value-neutral no-op on the chip stacks themselves', () => {
  const cb = winMixedPot();
  const before = value(cb.stacks.you);
  cb.reskin({ you: 'star', b0: 'marx' });
  assert.equal(value(cb.stacks.you), before, 'reskin never changes a stack\'s value');
  assert.ok(cb.verify());
});
