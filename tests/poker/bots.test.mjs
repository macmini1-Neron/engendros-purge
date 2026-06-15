import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../../src/poker/cards.js';
import { legalActions, applyAction, privateView, isComplete } from '../../src/poker/holdem.js';
import { Tournament } from '../../src/poker/tournament.js';
import { botAction } from '../../src/poker/bots.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'B' + i }));

function assertLegal(legal, a) {
  switch (a.type) {
    case 'fold': assert.equal(legal.canCall, true, 'bot folded with no bet to face'); break;
    case 'check': assert.equal(legal.canCheck, true); break;
    case 'call': assert.equal(legal.canCall, true); break;
    case 'raise':
      assert.equal(legal.canRaise, true);
      assert.ok(a.to >= legal.minRaiseTo && a.to <= legal.maxRaiseTo, `raise ${a.to} out of [${legal.minRaiseTo},${legal.maxRaiseTo}]`);
      assert.equal(a.to % 5, 0, `raise ${a.to} is not a multiple of 5 (chip atom) — bots must size like the human UI`);
      break;
    default: assert.fail('unknown action ' + a.type);
  }
}

// play a whole tournament with bots; every action is validated for legality, and applyAction
// itself throws on anything illegal, so completing the tournament proves the policy is sound.
function playWithBots(t, botRng) {
  let guard = 0;
  while (!t.over && guard++ < 8000) {
    const hand = t.startNextHand();
    while (!isComplete(hand)) {
      const legal = legalActions(hand);
      const view = privateView(hand, legal.seat);
      const a = botAction(view, legal, botRng);
      assertLegal(legal, a);
      applyAction(hand, a);
    }
    t.settleHand();
  }
  return t;
}

test('bots drive a 3-handed Sit & Go to completion with only legal actions', () => {
  const t = new Tournament({ players: players(3), buyIn: 100, rng: mulberry32(11) });
  playWithBots(t, mulberry32(22));
  assert.ok(t.over, 'tournament finished');
  assert.equal(t.players.filter((p) => p.stack > 0).length, 1);
  assert.equal(t.players.reduce((a, p) => a + p.stack, 0), 3 * 1500); // chips conserved
});

test('bots drive a full 6-max Sit & Go to completion', () => {
  const t = new Tournament({ players: players(6), buyIn: 500, rng: mulberry32(5) });
  playWithBots(t, mulberry32(6));
  assert.ok(t.over);
  assert.deepEqual(t.players.map((p) => p.place).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.equal(t.result.payouts[t.result.winner], 3000); // 500 × 6, winner-takes-all
});

test('bot raises are snapped to the 5-chip atom (no sub-5 amounts → no dust)', () => {
  // preflop pocket aces facing a bet → the bot raises; the raise-TO must be a multiple of 5
  // so the pot stays a multiple of 5 and the chipbank never needs sub-5 dust.
  const view = { board: [], pot: 137, seats: [{ id: 'me', hole: [{ r: 14, s: 's' }, { r: 14, s: 'h' }], folded: false, hasCards: true }] };
  const legal = { seat: 'me', canCheck: false, canCall: true, callAmount: 40, canRaise: true, minRaiseTo: 80, maxRaiseTo: 1000 };
  const a = botAction(view, legal, () => 0.1); // r<0.6 with AA → value raise
  assert.equal(a.type, 'raise');
  assert.equal(a.to % 5, 0, `bot raised to ${a.to}, not a multiple of 5`);
});

test('a strong made hand never folds for free', () => {
  // craft a flop where the bot flopped the nuts and faces no bet → must not fold
  const rng = mulberry32(1);
  // minimal hand-shaped view
  const view = {
    board: [{ r: 14, s: 's' }, { r: 13, s: 's' }, { r: 12, s: 's' }],
    pot: 100,
    seats: [
      { id: 'me', hole: [{ r: 11, s: 's' }, { r: 10, s: 's' }], folded: false, hasCards: true },
      { id: 'opp', hole: null, folded: false, hasCards: true },
    ],
  };
  const legal = { seat: 'me', canFold: true, canCheck: true, canCall: false, callAmount: 0, canRaise: true, minRaiseTo: 20, maxRaiseTo: 1000 };
  for (let i = 0; i < 20; i++) {
    const a = botAction(view, legal, rng);
    assert.notEqual(a.type, 'fold'); // royal flush: check or raise, never fold
  }
});
