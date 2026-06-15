import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, mulberry32 } from '../../src/poker/cards.js';
import { startHand, legalActions, applyAction, publicView, privateView, isComplete, forceFold } from '../../src/poker/holdem.js';

const P = (id, stack) => ({ id, stack });
const seed = () => mulberry32(42);

test('heads-up: button posts the small blind and acts first preflop', () => {
  const s = startHand({ players: [P('A', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  assert.equal(s.seats[0].committed, 10); // button = SB
  assert.equal(s.seats[1].committed, 20); // BB
  assert.equal(s.currentBet, 20);
  assert.equal(s.toAct, 0);               // button acts first preflop heads-up
});

test('3-handed: SB=button+1, BB=button+2, UTG acts first', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  assert.equal(s.seats[1].committed, 10); // SB
  assert.equal(s.seats[2].committed, 20); // BB
  assert.equal(s.currentBet, 20);
  assert.equal(s.toAct, 0);               // UTG = left of BB = button here
});

test('legalActions preflop UTG: call the BB or raise to >= 2 BB', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  const la = legalActions(s);
  assert.equal(la.canCheck, false);
  assert.equal(la.canCall, true);
  assert.equal(la.callAmount, 20);
  assert.equal(la.canRaise, true);
  assert.equal(la.minRaiseTo, 40);   // currentBet 20 + minRaise 20
  assert.equal(la.maxRaiseTo, 1000);
});

test('a raise below the minimum is rejected', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  assert.throws(() => applyAction(s, { type: 'raise', to: 30 }), /out of range/);
});

test('fold-to-one: last player standing wins the blinds uncontested', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  applyAction(s, { type: 'fold' });   // UTG folds
  applyAction(s, { type: 'fold' });   // SB folds → BB wins
  assert.ok(isComplete(s));
  assert.equal(s.result.uncontested, true);
  assert.deepEqual(s.result.winnings, { B: 30 });        // sb 10 + bb 20
  assert.equal(s.seats[2].stack, 1010);                  // BB net +10
  assert.equal(s.result.reveals.length, 0);              // mucked, no reveal
  assert.equal(s.result.contributed.B, 20);              // result carries each seat's per-hand stake (the NET-win gate)
  assert.ok(s.result.winnings.B > s.result.contributed.B, 'BB won MORE than it staked → a genuine NET win (fanfare ok)');
});

test('big-blind option: when everyone limps the BB may still raise', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  applyAction(s, { type: 'call' });   // UTG limps
  applyAction(s, { type: 'call' });   // SB completes
  assert.equal(s.toAct, 2);           // action is on the BB
  const la = legalActions(s);
  assert.equal(la.canCheck, true);    // BB can check to close...
  assert.equal(la.canRaise, true);    // ...or exercise the option to raise
});

test('incomplete all-in does not reopen betting for a player who already acted', () => {
  // U raises to 100 (full raise → minRaise 80). S shoves all-in to 150 (only +50, incomplete).
  // U already acted: U may CALL the extra but may NOT re-raise.
  const s = startHand({ players: [P('U', 1000), P('S', 150), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  applyAction(s, { type: 'raise', to: 100 });   // UTG = U
  assert.equal(s.minRaise, 80);
  applyAction(s, { type: 'allin' });            // S all-in to 150 (10 posted + 140)
  assert.equal(s.currentBet, 150);
  assert.equal(s.minRaise, 80);                 // unchanged by the incomplete shove
  applyAction(s, { type: 'fold' });             // B folds → action back to U
  assert.equal(legalActions(s).seat, 'U');
  const la = legalActions(s);
  assert.equal(la.canRaise, false);             // no reopen
  assert.equal(la.canCall, true);
  assert.equal(la.callAmount, 50);              // 150 - 100 already in
});

test('full hand checked down splits a board-playing royal flush (chop + odd-chip path)', () => {
  const deck = ['2c', '3d', '4h', '5c', '6d', 'As', 'Ks', 'Qs', '7d', 'Js', '8d', 'Ts'].map(parseCard);
  const s = startHand({ players: [P('A', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, deck });
  while (!isComplete(s)) {
    const la = legalActions(s);
    applyAction(s, la.canCheck ? { type: 'check' } : { type: 'call' });
  }
  assert.deepEqual(s.board.map((c) => c.r + c.s).join(' '), '14s 13s 12s 11s 10s'); // royal on board
  assert.equal(s.result.winnings.A, 20);   // pot 40 chopped
  assert.equal(s.result.winnings.B, 20);
  assert.equal(s.result.contributed.A, 20);                            // each staked the BB
  assert.equal(s.result.winnings.A, s.result.contributed.A, 'a chop returns exactly the stake → NOT a net win (no fanfare)');
  assert.equal(s.seats[0].stack, 1000);    // net zero on a chop
  assert.equal(s.seats[1].stack, 1000);
});

test('both all-in preflop deals out the full board and conserves the pot', () => {
  const s = startHand({ players: [P('A', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  applyAction(s, { type: 'allin' });   // A (SB) shoves
  applyAction(s, { type: 'allin' });   // B calls all-in
  assert.ok(isComplete(s));
  assert.equal(s.board.length, 5);
  const total = Object.values(s.result.winnings).reduce((a, b) => a + b, 0);
  assert.equal(total, 2000);           // whole pot awarded, nothing lost
});

test('a short all-in builds a side pot the short stack cannot win', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 60)], button: 0, sb: 10, bb: 20, rng: seed() });
  applyAction(s, { type: 'raise', to: 100 }); // U raises
  applyAction(s, { type: 'call' });           // S calls 100
  applyAction(s, { type: 'allin' });          // B all-in short (60 total) -> call all-in
  while (!isComplete(s)) {                     // U & S check the rest down
    const la = legalActions(s);
    applyAction(s, la.canCheck ? { type: 'check' } : { type: 'call' });
  }
  assert.equal(s.result.pots.length, 2);      // main (U,S,B) + side (U,S)
  const total = Object.values(s.result.winnings).reduce((a, b) => a + b, 0);
  assert.equal(total, 260);                   // 100 + 100 + 60 committed, all awarded
});

test('a raise with a non-integer amount is rejected (co-op packet safety)', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  assert.throws(() => applyAction(s, { type: 'raise' }), /integer/);          // missing `to` (undefined)
  assert.throws(() => applyAction(s, { type: 'raise', to: '80' }), /integer/); // string `to`
  applyAction(s, { type: 'raise', to: 60 });                                   // a valid integer raise still works
  assert.equal(s.currentBet, 60);
});

test('forceFold never folds an all-in seat (keeps showdown rights)', () => {
  const s = startHand({ players: [P('A', 100), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  applyAction(s, { type: 'allin' });            // A (button/SB) shoves all-in for 100
  assert.equal(s.seats[0].allIn, true);
  forceFold(s, 'A');                            // A "disconnects" while all-in
  assert.equal(s.seats[0].folded, false);       // must NOT be folded — A still contests the showdown
  assert.equal(s.seats[0].allIn, true);
});

test('forceFold removes an out-of-turn seat and ends the hand when one remains', () => {
  const s = startHand({ players: [P('U', 1000), P('S', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  // U is to act; force-fold the other two out of turn → U wins uncontested
  forceFold(s, 'S');
  assert.equal(s.seats[1].folded, true);
  assert.ok(!isComplete(s)); // U and B still live
  forceFold(s, 'B');
  assert.ok(isComplete(s));
  assert.equal(s.result.uncontested, true);
  assert.ok(s.result.winnings.U); // U scoops the blinds
});

test('hole cards are private until showdown', () => {
  const s = startHand({ players: [P('A', 1000), P('B', 1000)], button: 0, sb: 10, bb: 20, rng: seed() });
  const pub = publicView(s);
  assert.equal(pub.seats[0].hole, null);          // no hole cards leak in the public snapshot
  assert.equal(pub.seats[1].hole, null);
  assert.equal(pub.seats[0].hasCards, true);
  const mine = privateView(s, 'A');
  assert.equal(mine.seats[0].hole.length, 2);     // I see my own cards
  assert.equal(mine.seats[1].hole, null);         // but not my opponent's
});
