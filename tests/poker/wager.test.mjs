// Unit tests for the pure item-wager rules (src/poker/wager.js): can a player back the basket they
// declared (own every item + afford the money), and the basket normalize/empty/units helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canStake, basketEmpty, basketUnits, normalizeBasket } from '../../src/poker/wager.js';
import { ItemBank } from '../../src/itembank.js';

const bankOf = (owned) => new ItemBank(owned);

test('canStake: true when you own every item and can afford the money', () => {
  const it = bankOf({ bazooka: 1, medkit: 3 });
  assert.equal(canStake(it, 1000, { items: { bazooka: 1, medkit: 2 }, money: 800 }), true);
});

test('canStake: false when short on an item', () => {
  const it = bankOf({ medkit: 1 });
  assert.equal(canStake(it, 5000, { items: { medkit: 2 }, money: 0 }), false);
});

test('canStake: false when you cannot afford the money', () => {
  const it = bankOf({ medkit: 5 });
  assert.equal(canStake(it, 100, { items: { medkit: 1 }, money: 500 }), false);
});

test('canStake: false on a non-tradeable item (the knife)', () => {
  const it = bankOf({ medkit: 1 });
  assert.equal(canStake(it, 0, { items: { knife: 1 }, money: 0 }), false);
});

test('canStake: a money-only basket needs only the bank', () => {
  const it = bankOf({});
  assert.equal(canStake(it, 500, { items: {}, money: 500 }), true);
  assert.equal(canStake(it, 499, { items: {}, money: 500 }), false);
});

test('normalizeBasket drops zero/negative counts and clamps money', () => {
  assert.deepEqual(normalizeBasket({ items: { a: 2, b: 0, c: -1 }, money: -50 }), { items: { a: 2 }, money: 0 });
  assert.deepEqual(normalizeBasket(undefined), { items: {}, money: 0 });
});

test('basketEmpty / basketUnits', () => {
  assert.equal(basketEmpty({ items: {}, money: 0 }), true);
  assert.equal(basketEmpty({ items: { a: 0 }, money: 0 }), true, 'zero-count item is empty');
  assert.equal(basketEmpty({ items: {}, money: 100 }), false, 'money-only is not empty');
  assert.equal(basketEmpty({ items: { a: 1 }, money: 0 }), false);
  assert.equal(basketUnits({ items: { a: 2, b: 3 }, money: 999 }), 5, 'units count items only, not money');
});
