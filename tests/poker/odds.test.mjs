import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, mulberry32 } from '../../src/poker/cards.js';
import { equity, equityVs, outs } from '../../src/poker/odds.js';

const H = (s) => s.split(' ').map(parseCard);

test('AA beats KK heads-up preflop (~82%)', () => {
  const e = equityVs(H('Ah Ad'), H('Kh Kd'), [], 20000, mulberry32(1));
  assert.ok(e.win > 0.78 && e.win < 0.86, `win=${e.win}`);
});

test('AA vs one random hand is a strong favourite (~85%)', () => {
  const e = equity(H('Ah Ad'), [], 1, 20000, mulberry32(2));
  assert.ok(e.win > 0.80, `win=${e.win}`);
});

test('a flush draw on the flop has 9 outs', () => {
  assert.equal(outs(H('As Ks'), H('2s 7s 9h')), 9); // four spades, no made hand yet
});

test('an open-ended straight draw has 8 outs', () => {
  assert.equal(outs(H('8h 9d'), H('7c Ts 2h')), 8); // 7-8-9-T: any 6 or J (8 cards)
});

test('a gutshot has 4 outs', () => {
  assert.equal(outs(H('6h 7d'), H('9c Ts 2h')), 4); // 6-7_9-T: only an 8 completes
});

test('a made straight reports 0 draw-outs', () => {
  assert.equal(outs(H('8h 9d'), H('7c Ts Jh')), 0);
});
