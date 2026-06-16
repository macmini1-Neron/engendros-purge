// Pure unified cosmetic crate pool — chip skins (chipskins.js) + card backs (cardbacks.js) share ONE
// independent drop chance, so adding card backs didn't inflate the cosmetic drop rate. The weapon tier
// roll in crate.js is untouched (a cosmetic drop is a bonus that never consumes weapon pity). NO THREE
// → node-unit-testable. Each merged entry is tagged with its `kind` so crate.js can dispatch the unlock.
import { COSMETIC_DROP } from './chipskins.js';
import { CARD_BACK_DROP } from './cardbacks.js';

export const COSMETIC_CHANCE = 0.12; // P(a crate open yields a cosmetic instead of the normal reward)

// the merged, kind-tagged pool (chip skins + card backs).
export function cosmeticPool() {
  return [
    ...COSMETIC_DROP.map((e) => ({ ...e, kind: 'chipskin' })),
    ...CARD_BACK_DROP.map((e) => ({ ...e, kind: 'cardback' })),
  ];
}

// PURE roll (rand() ∈ [0,1), injectable for tests): returns a kind-tagged pool entry or null. Owned
// handling (owned → cash, fresh → unlock) is the caller's job, so duplicates are possible (dupe→cash).
export function rollCrateCosmetic(rand) {
  if (rand() >= COSMETIC_CHANCE) return null;
  const pool = cosmeticPool();
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = rand() * total;
  for (const e of pool) { if ((r -= e.w) < 0) return e; }
  return pool[pool.length - 1];
}
