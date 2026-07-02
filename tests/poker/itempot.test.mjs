// Unit tests for the poker item-wager escrow (src/poker/itempot.js): asymmetric baskets lock in, the
// union is minted once at seal, the winner takes the whole union, award is idempotent (re-broadcast safe),
// and the conservation backstop catches drift — mirrors the chipbank conservation discipline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ItemPot } from '../../src/poker/itempot.js';

test('seal mints the union of asymmetric baskets; award hands it to the winner', () => {
  const pot = new ItemPot();
  pot.lock('a', { items: { bazooka: 1 }, money: 1000 });        // A: a bazooka + $1000
  pot.lock('b', { items: { medkit: 3, grenade: 2 }, money: 0 }); // B: 3 medkits + 2 nades
  const minted = pot.seal();
  assert.deepEqual(minted.items, { bazooka: 1, medkit: 3, grenade: 2 }, 'union of both baskets');
  assert.equal(minted.money, 1000);
  assert.ok(pot.verify());
  const won = pot.awardTo('a');
  assert.deepEqual(won.items, { bazooka: 1, medkit: 3, grenade: 2 }, 'winner takes the whole union');
  assert.equal(won.money, 1000);
});

test('award is idempotent — a re-broadcast over-snapshot never double-awards', () => {
  const pot = new ItemPot();
  pot.lock('a', { items: { ak: 1 }, money: 500 });
  pot.lock('b', { items: {}, money: 500 });
  pot.seal();
  const first = pot.awardTo('a');
  assert.deepEqual(first.items, { ak: 1 });
  assert.equal(first.money, 1000);
  const second = pot.awardTo('a');                              // re-broadcast
  assert.deepEqual(second.items, {}, 'second award is empty');
  assert.equal(second.money, 0);
});

test('unlock drops a seat that declined BEFORE seal (not in the minted union)', () => {
  const pot = new ItemPot();
  pot.lock('a', { items: { medkit: 1 }, money: 0 });
  pot.lock('b', { items: { grenade: 5 }, money: 0 });
  pot.unlock('b');                                              // b backed out during the gather
  const minted = pot.seal();
  assert.deepEqual(minted.items, { medkit: 1 }, 'only the seated basket is minted');
  assert.ok(pot.verify());
});

test('verify throws if the baskets drift from the mint after seal', () => {
  const pot = new ItemPot();
  pot.lock('a', { items: { medkit: 2 }, money: 0 });
  pot.seal();
  assert.ok(pot.verify());
  pot.baskets.a.items.medkit = 99;                              // tamper after seal
  assert.throws(() => pot.verify(), /drifted from mint/);
});

test('money baskets sum into the prize pool; N-seat union (3 seats)', () => {
  const pot = new ItemPot();
  pot.lock('a', { items: { medkit: 1 }, money: 300 });
  pot.lock('b', { items: { medkit: 1 }, money: 300 });
  pot.lock('c', { items: { bazooka: 1 }, money: 300 });
  pot.seal();
  assert.equal(pot.totalMoney(), 900, 'prizePool = Σ money');
  assert.deepEqual(pot.awardTo('c').items, { medkit: 2, bazooka: 1 }, 'winner takes all three baskets');
});

test('lock clones the basket so a later edit cannot mutate the escrow', () => {
  const pot = new ItemPot();
  const basket = { items: { medkit: 1 }, money: 100 };
  pot.lock('a', basket);
  basket.items.medkit = 50; basket.money = 9999;                // mutate the caller's object
  const minted = pot.seal();
  assert.deepEqual(minted.items, { medkit: 1 }, 'escrow kept its own copy');
  assert.equal(minted.money, 100);
});

test('a sealed-but-not-awarded pot still reports its money via totalMoney', () => {
  const pot = new ItemPot();
  pot.lock('a', { items: {}, money: 500 });
  assert.equal(pot.totalMoney(), 500, 'works pre-seal (sums live baskets)');
  pot.seal();
  assert.equal(pot.totalMoney(), 500, 'and post-seal (reads the mint)');
});
