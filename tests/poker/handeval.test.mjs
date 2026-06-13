import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, makeDeck, shuffle, mulberry32 } from '../../src/poker/cards.js';
import { evaluate, evaluate7, compare, CATS } from '../../src/poker/handeval.js';

const H = (s) => s.split(' ').map(parseCard);
const ev = (s) => evaluate(H(s));

test('recognises every category', () => {
  assert.equal(ev('As Ks Qs Js Ts').cat, 8); // royal (straight flush)
  assert.equal(ev('9s 8s 7s 6s 5s').cat, 8); // straight flush
  assert.equal(ev('Ah Ad As Ac Kd').cat, 7); // quads
  assert.equal(ev('Ah Ad As Kc Kd').cat, 6); // full house
  assert.equal(ev('Ah 9h 7h 5h 2h').cat, 5); // flush
  assert.equal(ev('Ah Kd Qs Jc Th').cat, 4); // straight (broadway)
  assert.equal(ev('Ah Ad As Qc Jd').cat, 3); // trips
  assert.equal(ev('Ah Ad Ks Kc Qd').cat, 2); // two pair
  assert.equal(ev('Ah Ad Ks Qc Jd').cat, 1); // pair
  assert.equal(ev('Ah Kd Qs Jc 9h').cat, 0); // high card
});

test('the wheel A-2-3-4-5 is a 5-high straight, not ace-high', () => {
  const wheel = ev('Ah 2d 3s 4c 5h');
  assert.equal(wheel.cat, 4);
  assert.deepEqual(wheel.ranks, [5]);          // five-high
  const sixHigh = ev('2h 3d 4s 5c 6h');
  assert.ok(compare(sixHigh, wheel) > 0);      // 6-high straight beats the wheel
});

test('steel wheel straight flush is 5-high', () => {
  const sf = ev('Ah 2h 3h 4h 5h');
  assert.equal(sf.cat, 8);
  assert.deepEqual(sf.ranks, [5]);
});

test('flush compares card-by-card', () => {
  const a = ev('Ah Qh 9h 5h 2h');
  const b = ev('Ah Jh 9h 5h 2h');
  assert.ok(compare(a, b) > 0); // Q kicker beats J kicker
});

test('full house orders trips then pair', () => {
  const aaakk = ev('Ah Ad As Kc Kd');
  const kkkaa = ev('Kh Kd Ks Ac Ad');
  assert.ok(compare(aaakk, kkkaa) > 0); // trip aces beat trip kings
});

test('two pair tiebreak by high pair, low pair, kicker', () => {
  const a = ev('Ah Ad 5s 5c Kd'); // aces & fives, K kicker
  const b = ev('Ah Ad 5s 5c Qd'); // aces & fives, Q kicker
  assert.ok(compare(a, b) > 0);
});

test('quads kicker matters', () => {
  const a = ev('7h 7d 7s 7c Ad');
  const b = ev('7h 7d 7s 7c Kd');
  assert.ok(compare(a, b) > 0);
});

test('flush beats a straight', () => {
  assert.ok(compare(ev('2h 4h 6h 8h Th'), ev('9c 8d 7h 6s 5c')) > 0);
});

test('evaluate7 picks the best 5 of 7', () => {
  // hole pair + board makes a full house using best 5
  const r = evaluate7(H('Ah Ad Ks Kc Kd 2s 3h'));
  assert.equal(r.cat, 6); // kings full of aces
  assert.deepEqual(r.ranks, [13, 14]);
});

test('evaluate7 plays the board on a tie', () => {
  const board = 'As Ks Qs Js Ts'; // royal flush on the board
  const p1 = evaluate7(H(board + ' 2c 3d'));
  const p2 = evaluate7(H(board + ' 7h 8h'));
  assert.equal(compare(p1, p2), 0); // both play the board → exact tie
});

test('CATS labels line up with cat index', () => {
  assert.equal(CATS[8], 'Straight Flush');
  assert.equal(CATS[0], 'High Card');
  assert.equal(ev('As Ks Qs Js Ts').name, 'Straight Flush');
});

test('compare is a consistent total order over random 7-card hands', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 2000; i++) {
    const d = shuffle(makeDeck(), rng);
    const a = evaluate(d.slice(0, 7));
    const b = evaluate(d.slice(7, 14));
    const ab = compare(a, b), ba = compare(b, a);
    assert.equal(Math.sign(ab), -Math.sign(ba));   // antisymmetry
    assert.equal(compare(a, a), 0);                 // reflexive tie
    assert.ok(a.cat >= 0 && a.cat <= 8);
  }
});
