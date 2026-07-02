// Unit tests for the persistent account item ledger (src/itembank.js) — the conservation-tracked ownership
// store that the Armory and the poker item-wager build on. Mirrors the discipline of the poker chipbank
// tests: prove counts never silently mint/vanish, the basket primitive is all-or-nothing, the knife is
// never stored, and the legacy meta → ledger migration is lossless + idempotent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ItemBank, migrateItemBank, itemBankFromMeta,
  bagUnits, bagAdd, bagSig, ITEMBANK_V, NON_TRADEABLE,
} from '../src/itembank.js';

// ---- primitives -----------------------------------------------------------

test('acquire / count / has add up and bump seq', () => {
  const b = new ItemBank();
  assert.equal(b.count('ak74'), 0);
  assert.equal(b.seq, 0);
  assert.ok(b.acquire('ak74', 2, 'buy'));
  assert.equal(b.count('ak74'), 2);
  assert.ok(b.has('ak74', 2));
  assert.ok(!b.has('ak74', 3));
  assert.equal(b.seq, 1, 'one mutation → seq 1');
  b.acquire('medkit', 3);
  assert.equal(b.seq, 2);
  assert.ok(b.verify());
});

test('consume removes counts, deletes the key at zero, and bumps seq', () => {
  const b = new ItemBank({ grenade: 3 });
  assert.ok(b.consume('grenade', 1));
  assert.equal(b.count('grenade'), 2);
  b.consume('grenade', 2);
  assert.equal(b.count('grenade'), 0);
  assert.equal('grenade' in b.owned, false, 'key removed at zero, not left as 0');
  assert.ok(b.verify());
});

test('consume throws on a shortfall (cannot spend what you do not own)', () => {
  const b = new ItemBank({ medkit: 1 });
  assert.throws(() => b.consume('medkit', 2), /cannot consume/);
  assert.equal(b.count('medkit'), 1, 'state untouched after the throw');
  assert.throws(() => b.consume('nope', 1), /cannot consume/);
});

test('acquire/consume non-positive counts are no-ops', () => {
  const b = new ItemBank({ medkit: 1 });
  assert.equal(b.acquire('medkit', 0), false);
  assert.equal(b.acquire('medkit', -3), false);
  assert.equal(b.consume('medkit', 0), false);
  assert.equal(b.count('medkit'), 1);
  assert.equal(b.seq, 0, 'no-ops do not bump seq');
});

// ---- non-tradeable (knife) ------------------------------------------------

test('the knife is never stored and never tradeable', () => {
  assert.ok(NON_TRADEABLE.has('knife'));
  const b = new ItemBank({ knife: 5, ak74: 1 }); // constructor must drop the knife
  assert.equal(b.count('knife'), 0);
  assert.equal(b.count('ak74'), 1);
  assert.equal(b.acquire('knife', 1), false, 'cannot acquire the knife as a count');
  assert.equal(b.tradeable('knife'), false);
  assert.ok(b.verify());
});

// ---- applyBasket: all-or-nothing ------------------------------------------

test('applyBasket(-1) consumes a whole basket atomically', () => {
  const b = new ItemBank({ ak74: 1, medkit: 2, grenade: 4 });
  assert.ok(b.applyBasket({ ak74: 1, medkit: 1 }, -1));
  assert.equal(b.count('ak74'), 0);
  assert.equal(b.count('medkit'), 1);
  assert.equal(b.count('grenade'), 4);
  assert.ok(b.verify());
});

test('applyBasket(-1) is all-or-nothing: a single short key aborts the WHOLE basket', () => {
  const b = new ItemBank({ ak74: 1, medkit: 1 });
  assert.throws(() => b.applyBasket({ ak74: 1, medkit: 5 }, -1), /short on medkit/);
  // nothing was consumed — ak74 must still be there
  assert.equal(b.count('ak74'), 1, 'ak74 untouched despite the medkit shortfall');
  assert.equal(b.count('medkit'), 1);
});

test('applyBasket(+1) credits a whole basket', () => {
  const b = new ItemBank({ medkit: 1 });
  b.applyBasket({ medkit: 2, ak74: 1 }, +1);
  assert.equal(b.count('medkit'), 3);
  assert.equal(b.count('ak74'), 1);
});

test('applyBasket rejects a non-tradeable key before mutating', () => {
  const b = new ItemBank({ ak74: 1 });
  assert.throws(() => b.applyBasket({ knife: 1, ak74: 1 }, -1), /not tradeable/);
  assert.equal(b.count('ak74'), 1, 'state untouched after the throw');
});

test('consume then re-acquire a basket round-trips with no net change (escrow refund shape)', () => {
  const b = new ItemBank({ ak74: 2, medkit: 3 });
  const before = b.toJSON().owned;
  const basket = { ak74: 1, medkit: 2 };
  b.applyBasket(basket, -1);            // lock into escrow
  b.applyBasket(basket, +1);            // refund (abort)
  assert.deepEqual(b.toJSON().owned, before, 'lock + refund is a no-op on the ledger');
});

// ---- verify backstop ------------------------------------------------------

test('verify throws on a corrupt ledger', () => {
  const b = new ItemBank({ ak74: 1 });
  b.owned.medkit = 0;        // illegal zero
  assert.throws(() => b.verify(), /bad count/);
  b.owned.medkit = 2; b.owned.knife = 1;   // illegal non-tradeable stored
  assert.throws(() => b.verify(), /non-tradeable/);
});

// ---- serialisation --------------------------------------------------------

test('toJSON is a clean serialisable snapshot at the current version', () => {
  const b = new ItemBank({ ak74: 2 }, 7);
  b.acquire('medkit', 1);
  const j = b.toJSON();
  assert.equal(j.v, ITEMBANK_V);
  assert.equal(j.seq, 8);
  assert.deepEqual(j.owned, { ak74: 2, medkit: 1 });
  // round-trips through a fresh bank
  const b2 = new ItemBank(j.owned, j.seq);
  assert.deepEqual(b2.toJSON().owned, j.owned);
});

// ---- migration from legacy meta -------------------------------------------

test('migration: cold start (knife only) → empty ledger', () => {
  const m = { unlocked: ['knife'], loadout: ['knife', null, null] };
  const items = migrateItemBank(m);
  assert.equal(items.v, ITEMBANK_V);
  assert.deepEqual(items.owned, {}, 'knife is never stored — a fresh player owns nothing tradeable');
});

test('migration: each unlock becomes one durable copy (knife excluded)', () => {
  const m = { unlocked: ['knife', 'ak74', 'garand'], loadout: [] };
  const items = migrateItemBank(m);
  assert.deepEqual(items.owned, { ak74: 1, garand: 1 });
});

test('migration: paid loadout duplicates add extra copies beyond the first', () => {
  // ak74 unlocked + equipped THREE times → 1 (unlock) + 2 (dups) = 3
  const m = { unlocked: ['knife', 'ak74'], loadout: ['ak74', 'ak74', 'ak74', 'knife'] };
  const items = migrateItemBank(m);
  assert.equal(items.owned.ak74, 3, 'one base copy + two paid duplicates');
});

test('migration: an old keyed-object loadout still migrates from unlocked', () => {
  // pre-array loadout form; _loadMeta would have folded keys into unlocked already, so we feed that state
  const m = { unlocked: ['knife', 'pm', 'binoculars'], loadout: ['pm', 'binoculars'] };
  const items = migrateItemBank(m);
  assert.deepEqual(items.owned, { pm: 1, binoculars: 1 });
});

test('migration is idempotent — re-running does not double-count', () => {
  const m = { unlocked: ['knife', 'ak74'], loadout: ['ak74', 'ak74'] };
  const first = migrateItemBank(m);
  const firstOwned = { ...first.owned };
  const second = migrateItemBank(m);   // m.items already at version → no-op
  assert.deepEqual(second.owned, firstOwned, 're-migration is a no-op');
  assert.equal(second, m.items);
});

test('itemBankFromMeta returns a live, verified bank seeded by migration', () => {
  const m = { unlocked: ['knife', 'ak74'], loadout: ['ak74', 'ak74', 'medkitNOPE'] };
  const bank = itemBankFromMeta(m);
  assert.ok(bank instanceof ItemBank);
  assert.equal(bank.count('ak74'), 2);
  assert.ok(bank.verify());
  // a second construction off the now-migrated meta matches
  const bank2 = itemBankFromMeta(m);
  assert.deepEqual(bank2.toJSON().owned, bank.toJSON().owned);
});

// ---- bag helpers ----------------------------------------------------------

test('bag helpers: units / add / signature', () => {
  assert.equal(bagUnits({ a: 2, b: 3 }), 5);
  assert.deepEqual(bagAdd({ a: 1 }, { a: 2, b: 1 }), { a: 3, b: 1 });
  assert.equal(bagSig({ b: 1, a: 2 }), 'a:2,b:1', 'order-independent, sorted signature');
});
