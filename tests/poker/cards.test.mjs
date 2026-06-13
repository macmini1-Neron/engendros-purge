import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, cardStr, parseCard, shuffle, mulberry32, RANKS, SUITS } from '../../src/poker/cards.js';

test('makeDeck has 52 unique cards', () => {
  const d = makeDeck();
  assert.equal(d.length, 52);
  const set = new Set(d.map(cardStr));
  assert.equal(set.size, 52);
});

test('RANKS and SUITS sizes', () => {
  assert.equal(RANKS.length, 13);
  assert.equal(SUITS.length, 4);
});

test('cardStr / parseCard round-trip', () => {
  for (const s of ['As', '2c', 'Th', 'Jd', 'Qs', 'Kc', '9h']) {
    assert.equal(cardStr(parseCard(s)), s);
  }
  assert.deepEqual(parseCard('As'), { r: 14, s: 's' });
  assert.deepEqual(parseCard('Th'), { r: 10, s: 'h' });
});

test('mulberry32 is deterministic for a seed', () => {
  const a = mulberry32(123), b = mulberry32(123);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const x of seqA) { assert.ok(x >= 0 && x < 1); }
});

test('shuffle preserves the multiset and is seed-deterministic', () => {
  const deck = makeDeck();
  const s1 = shuffle(deck, mulberry32(7));
  const s2 = shuffle(deck, mulberry32(7));
  assert.deepEqual(s1.map(cardStr), s2.map(cardStr));            // same seed ⇒ same order
  assert.deepEqual(new Set(s1.map(cardStr)), new Set(deck.map(cardStr))); // same cards
  assert.notDeepEqual(deck.map(cardStr), s1.map(cardStr));       // actually shuffled
  const s3 = shuffle(deck, mulberry32(8));
  assert.notDeepEqual(s1.map(cardStr), s3.map(cardStr));         // different seed ⇒ different order
});
