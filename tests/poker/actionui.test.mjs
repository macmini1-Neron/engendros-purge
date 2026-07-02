// The pure legality→action-bar mapping (poker-ui asks this for label / fold-confirm / raise-available).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startHand, legalActions } from '../../src/poker/holdem.js';
import { mulberry32 } from '../../src/poker/cards.js';
import { actionButtons } from '../../src/poker/actionui.js';

const P = (id, stack) => ({ id, stack });

test('null legal → null (nobody to act)', () => { assert.equal(actionButtons(null), null); });

test('facing a bet: CALL <amount>, FOLD NOT guarded, raise available', () => {
  const ab = actionButtons({ canCheck: false, canCall: true, callAmount: 20, canRaise: true, minRaiseTo: 40, maxRaiseTo: 1000 });
  assert.equal(ab.callcheck.type, 'call');
  assert.equal(ab.callcheck.label, 'CALL 20');
  assert.equal(ab.callcheck.amount, 20);
  assert.equal(ab.fold.confirm, false);                 // facing a bet → fold is a normal one-click
  assert.deepEqual(ab.raise, { available: true, min: 40, max: 1000, allInOnly: false });
});

test('check is free: CHECK label, FOLD guarded (arm-to-confirm)', () => {
  const ab = actionButtons({ canCheck: true, canCall: false, callAmount: 0, canRaise: true, minRaiseTo: 20, maxRaiseTo: 500 });
  assert.equal(ab.callcheck.type, 'check');
  assert.equal(ab.callcheck.label, 'CHECK');
  assert.equal(ab.callcheck.amount, 0);
  assert.equal(ab.fold.confirm, true);                  // free check → guard the fold so a misclick can't throw it
});

test('capped / no-raise: the raise controls are hidden', () => {
  const ab = actionButtons({ canCheck: false, canCall: true, callAmount: 50, canRaise: false, minRaiseTo: 100, maxRaiseTo: 900 });
  assert.equal(ab.raise.available, false);
});

test('raise-is-all-in-only when min == max', () => {
  const ab = actionButtons({ canCheck: false, canCall: true, callAmount: 50, canRaise: true, minRaiseTo: 80, maxRaiseTo: 80 });
  assert.equal(ab.raise.available, true);
  assert.equal(ab.raise.allInOnly, true);
});

test('contract against the real engine: preflop UTG mapping matches legalActions', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: mulberry32(42) });
  const L = legalActions(s);
  const ab = actionButtons(L);
  assert.equal(L.canCheck, false, 'UTG faces the BB');
  assert.equal(ab.callcheck.type, 'call');
  assert.equal(ab.callcheck.amount, L.callAmount);
  assert.equal(ab.callcheck.label, 'CALL ' + L.callAmount);
  assert.equal(ab.fold.confirm, false);
  assert.equal(ab.raise.available, L.canRaise);
  if (L.canRaise) { assert.equal(ab.raise.min, L.minRaiseTo); assert.equal(ab.raise.max, L.maxRaiseTo); }
});
