import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../../src/poker/cards.js';
import { legalActions, applyAction, isComplete } from '../../src/poker/holdem.js';
import { Tournament, DEFAULT_START_STACK, HANDS_PER_LEVEL } from '../../src/poker/tournament.js';

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: 'P' + i }));

// drive the current hand to showdown with a simple check/call-down policy
function checkCallDown(hand) {
  while (!isComplete(hand)) {
    const la = legalActions(hand);
    applyAction(hand, la.canCheck ? { type: 'check' } : { type: 'call' });
  }
}

test('setup: equal stacks, prize pool, level-0 blinds', () => {
  const t = new Tournament({ players: players(6), buyIn: 500, rng: mulberry32(1) });
  assert.equal(t.players.length, 6);
  assert.ok(t.players.every((p) => p.stack === DEFAULT_START_STACK));
  assert.equal(t.prizePool, 3000);            // 500 × 6
  const { sb, bb } = t.blindsForHand();
  assert.equal(sb, 10); assert.equal(bb, 20); // level 0
});

test('blinds escalate by hands dealt', () => {
  const t = new Tournament({ players: players(6), buyIn: 500, rng: mulberry32(1) });
  t.handNumber = 0;
  assert.deepEqual([t.blindsForHand().sb, t.blindsForHand().bb], [10, 20]);
  t.handNumber = HANDS_PER_LEVEL;             // first hand of level 1
  assert.deepEqual([t.blindsForHand().sb, t.blindsForHand().bb], [15, 30]);
  t.handNumber = HANDS_PER_LEVEL * 2;
  assert.deepEqual([t.blindsForHand().sb, t.blindsForHand().bb], [25, 50]);
});

test('button advances to the next seat each hand and skips after a hand', () => {
  const t = new Tournament({ players: players(6), buyIn: 100, rng: mulberry32(1) });
  t.startNextHand();
  assert.equal(t.button, 0);  // first hand uses the initial button
  checkCallDown(t.hand); t.settleHand();
  t.startNextHand();
  assert.equal(t.button, 1);  // advanced
});

test('a two-player Sit & Go runs to a single winner, winner-takes-all', () => {
  const t = new Tournament({ players: players(2), buyIn: 1000, rng: mulberry32(7) });
  let guard = 0;
  while (!t.over && guard++ < 2000) {
    t.startNextHand();
    checkCallDown(t.hand);
    t.settleHand();
  }
  assert.ok(t.over, 'tournament should finish');
  assert.equal(t.alivePlayers().length, 1);
  const winner = t.players.find((p) => p.place === 1);
  assert.ok(winner);
  assert.equal(t.result.winner, winner.id);
  assert.deepEqual(t.result.payouts, { [winner.id]: 2000 }); // whole prize pool
  // chips are conserved across the whole tournament
  const totalChips = t.players.reduce((a, p) => a + p.stack, 0);
  assert.equal(totalChips, 2 * DEFAULT_START_STACK);
});

test('a three-player Sit & Go assigns every finishing place 1..3', () => {
  const t = new Tournament({ players: players(3), buyIn: 500, rng: mulberry32(3) });
  let guard = 0;
  while (!t.over && guard++ < 4000) {
    t.startNextHand();
    checkCallDown(t.hand);
    t.settleHand();
  }
  assert.ok(t.over);
  const places = t.players.map((p) => p.place).sort();
  assert.deepEqual(places, [1, 2, 3]);                       // everyone has a distinct place
  assert.equal(t.players.find((p) => p.place === 1).id, t.result.winner);
  assert.equal(t.result.payouts[t.result.winner], 1500);    // winner-takes-all 500×3
});

test('busted players keep their stack at zero and are removed from the alive ring', () => {
  const t = new Tournament({ players: players(2), buyIn: 100, rng: mulberry32(7) });
  let guard = 0;
  while (!t.over && guard++ < 2000) {
    t.startNextHand();
    checkCallDown(t.hand);
    t.settleHand();
  }
  const loser = t.players.find((p) => p.place === 2);
  assert.equal(loser.stack, 0);
  assert.equal(t.alivePlayers().length, 1);
});

// settleHand's place assignment, exercised directly with a hand-crafted complete hand
const completeHand = (seats) => ({ street: 'complete', seats });

test('an exact-commit double bust SHARES the finishing place (a true chop)', () => {
  const t = new Tournament({ players: players(4), buyIn: 100, rng: mulberry32(1) });
  t.hand = completeHand([
    { id: 'P0', committed: 200, stack: 3000 },
    { id: 'P1', committed: 200, stack: 3000 },
    { id: 'P2', committed: 500, stack: 0 },
    { id: 'P3', committed: 500, stack: 0 },   // identical commit to P2 → tie
  ]);
  const { eliminated } = t.settleHand();
  assert.deepEqual(eliminated.slice().sort(), ['P2', 'P3']);
  assert.equal(t.players.find((p) => p.id === 'P2').place, 3, '2 alive after → tied bustouts share place 3');
  assert.equal(t.players.find((p) => p.id === 'P3').place, 3, 'both tied players get the SAME place');
  assert.equal(t.over, false);
});

test('an unequal double bust orders by chips committed (more-committed finishes higher)', () => {
  const t = new Tournament({ players: players(4), buyIn: 100, rng: mulberry32(1) });
  t.hand = completeHand([
    { id: 'P0', committed: 200, stack: 3000 },
    { id: 'P1', committed: 200, stack: 3000 },
    { id: 'P2', committed: 700, stack: 0 },   // more committed → higher place
    { id: 'P3', committed: 300, stack: 0 },
  ]);
  t.settleHand();
  assert.equal(t.players.find((p) => p.id === 'P2').place, 3);
  assert.equal(t.players.find((p) => p.id === 'P3').place, 4);
});
