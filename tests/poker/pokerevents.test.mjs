import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivePokerEvents } from '../../src/poker/pokerevents.js';

const view = (o) => ({ board: [], seats: [], pot: 0, ...o });

test('a new community card emits boardCard with its index', () => {
  const ev = derivePokerEvents(view({ board: [{ r: 5, s: 'h' }] }),
                               view({ board: [{ r: 5, s: 'h' }, { r: 9, s: 'd' }] }));
  assert.deepEqual(ev.filter((e) => e.t === 'boardCard'), [{ t: 'boardCard', index: 1 }]);
});

test('a bet emits chipMove from seat→bet with per-denom counts', () => {
  const prev = { stacks: { A: { 100: 2 } }, bets: { A: {} }, pot: {} };
  const next = { stacks: { A: { 100: 1 } }, bets: { A: { 100: 1 } }, pot: {} };
  const ev = derivePokerEvents(view(), view(), prev, next);
  assert.deepEqual(ev.find((e) => e.t === 'chipMove'),
    { t: 'chipMove', from: 'A', to: 'pot', moves: { 100: 1 } });
});

test('a seat that newly folds emits a fold event (once, not while already folded)', () => {
  const a = { id: 'A' }, b = { id: 'B' };
  const ev = derivePokerEvents(
    view({ seats: [{ ...a, folded: false }, { ...b, folded: false }] }),
    view({ seats: [{ ...a, folded: true }, { ...b, folded: false }] }));
  assert.deepEqual(ev.filter((e) => e.t === 'fold'), [{ t: 'fold', id: 'A' }]);
  // already-folded → no repeat event
  const ev2 = derivePokerEvents(
    view({ seats: [{ ...a, folded: true }] }),
    view({ seats: [{ ...a, folded: true }] }));
  assert.equal(ev2.filter((e) => e.t === 'fold').length, 0);
});

test('a seat folded but ABSENT from the previous snapshot does NOT emit a fold (late-join / full resync)', () => {
  // prev has only B; next reveals an already-folded A that is new to this client — no spurious muck
  const ev = derivePokerEvents(
    view({ seats: [{ id: 'B', folded: false }] }),
    view({ seats: [{ id: 'A', folded: true }, { id: 'B', folded: false }] }));
  assert.equal(ev.filter((e) => e.t === 'fold').length, 0);
});

test('a NET win emits potAward with net=true; a refund/split below stake does not', () => {
  const winBig = derivePokerEvents(
    view({ seats: [{ id: 'A', stack: 100 }] }),
    view({ seats: [{ id: 'A', stack: 300 }] }),
    null, null, { winnings: { A: 200 }, contributed: { A: 50 } });
  assert.equal(winBig.find((e) => e.t === 'potAward').net, true);

  const refund = derivePokerEvents(
    view({ seats: [{ id: 'A', stack: 100 }] }),
    view({ seats: [{ id: 'A', stack: 130 }] }),
    null, null, { winnings: { A: 30 }, contributed: { A: 50 } });
  assert.equal(refund.find((e) => e.t === 'potAward').net, false); // got back LESS than staked
});
