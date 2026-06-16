import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COSMETIC_CHANCE, cosmeticPool, rollCrateCosmetic } from '../../src/poker/cosmetics.js';

test('cosmeticPool merges chip skins + card backs, each kind-tagged', () => {
  const pool = cosmeticPool();
  const chips = pool.filter((e) => e.kind === 'chipskin');
  const backs = pool.filter((e) => e.kind === 'cardback');
  assert.deepEqual(chips.map((e) => e.skin).sort(), ['lenin', 'marx']);
  assert.deepEqual(backs.map((e) => e.back).sort(), ['emblem', 'redstar']);
  for (const e of pool) assert.ok(e.w > 0 && e.value > 0 && typeof e.name === 'string' && ['epic', 'legendary'].includes(e.tier));
  assert.ok(COSMETIC_CHANCE > 0 && COSMETIC_CHANCE < 1, 'chance is a probability');
});

test('rollCrateCosmetic: gated by the chance, then weighted pick across the merged pool', () => {
  assert.equal(rollCrateCosmetic(() => 0.99), null, 'rand >= chance → no cosmetic');
  let seq, i; const rng = () => seq[i++];
  // low pick → first pool entry (a chip skin); high pick → last entry (a card back) — proves both kinds drop
  seq = [0.0, 0.0]; i = 0; assert.equal(rollCrateCosmetic(rng).kind, 'chipskin', 'low pick → chip side of the pool');
  seq = [0.0, 0.999]; i = 0; assert.equal(rollCrateCosmetic(rng).kind, 'cardback', 'high pick → card-back side of the pool');
  seq = [0.05, 0.0]; i = 0; const e = rollCrateCosmetic(rng); assert.ok(e && typeof e.value === 'number', 'entry carries its cash value');
});
