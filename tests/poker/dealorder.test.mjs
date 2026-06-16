// Pure dealing-order math for the hole-card deal-in animation. Two passes, clockwise
// from the seat left of the button, button gets the last card each pass; folded/empty
// seats (no cards) are skipped. Deterministic → identical on every co-op client.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealOrder } from '../../src/poker/dealorder.js';

test('full ring: 1st card to everyone clockwise from left-of-button, then 2nd to everyone', () => {
  const o = dealOrder(0, 3, [true, true, true]);
  assert.deepEqual(o, [
    { seat: 1, pass: 0 }, { seat: 2, pass: 0 }, { seat: 0, pass: 0 }, // pass 1: SB→…→BTN
    { seat: 1, pass: 1 }, { seat: 2, pass: 1 }, { seat: 0, pass: 1 }, // pass 2: same order
  ]);
});

test('button gets the LAST card of each pass; dealing starts to its left', () => {
  const o = dealOrder(2, 4, [true, true, true, true]); // button = seat 2 → order 3,0,1,2
  assert.deepEqual(o.filter((x) => x.pass === 0).map((x) => x.seat), [3, 0, 1, 2]);
  assert.deepEqual(o.filter((x) => x.pass === 1).map((x) => x.seat), [3, 0, 1, 2]);
  assert.equal(o.at(-1).seat, 2);           // very last card pitched lands on the button
});

test('heads-up: two seats, two passes, four cards', () => {
  const o = dealOrder(0, 2, [true, true]);
  assert.deepEqual(o, [
    { seat: 1, pass: 0 }, { seat: 0, pass: 0 },
    { seat: 1, pass: 1 }, { seat: 0, pass: 1 },
  ]);
});

test('folded / empty seats (no cards) are skipped in both passes', () => {
  // n=6, button=2, seat 1 sat out (no cards). Walk order 3,4,5,0,1,2 → drop seat 1.
  const o = dealOrder(2, 6, [true, false, true, true, true, true]);
  const seatsP0 = o.filter((x) => x.pass === 0).map((x) => x.seat);
  assert.deepEqual(seatsP0, [3, 4, 5, 0, 2]);
  assert.ok(!o.some((x) => x.seat === 1), 'the sat-out seat is never dealt to');
  assert.equal(o.length, 10);               // 5 active seats × 2 cards
});

test('pitch index is the array index (stagger order) and is stable', () => {
  const o = dealOrder(0, 2, [true, true]);
  o.forEach((c, i) => { c._i = i; });
  assert.deepEqual(o.map((c) => c._i), [0, 1, 2, 3]); // monotonic pitch order
});

test('a button index outside [0,n) is normalised — incl. negatives (exercises the +n correction)', () => {
  const all = [true, true, true];
  assert.deepEqual(dealOrder(3, 3, all), dealOrder(0, 3, all));   // exact multiple: 3 % 3 = 0
  assert.deepEqual(dealOrder(4, 3, all), dealOrder(1, 3, all));   // non-multiple wrap → 1
  assert.deepEqual(dealOrder(-1, 3, all), dealOrder(2, 3, all));  // NEGATIVE → 2 (only passes with the `+ n` term)
  assert.equal(dealOrder(-1, 3, all)[0].seat, 0);                 // button normalises to 2 → first card to seat 0 (its left)
});

test('omitting hasCards deals to EVERY seat (the fresh-hand path before anyone folds)', () => {
  const o = dealOrder(0, 3);
  assert.equal(o.length, 6);                                      // 3 seats × 2 cards
  assert.deepEqual([...new Set(o.map((c) => c.seat))].sort(), [0, 1, 2]);
  assert.deepEqual(dealOrder(0, 3, null), o);                     // null behaves like omitted
});

test('no live seats → no cards dealt (empty order)', () => {
  assert.deepEqual(dealOrder(0, 3, [false, false, false]), []);   // everyone sat out / folded
  assert.deepEqual(dealOrder(0, 0, []), []);                      // n guard
});
