// wager.js — pure rules for composing/accepting an item-wager basket, the item analogue of coop.js's
// canAnte. A Basket is { items: { itemKey: count }, money: int }. No THREE/DOM; node-tested.
import { bagUnits } from '../itembank.js';

export function normalizeBasket(basket) {
  const items = {};
  const src = (basket && basket.items) || {};
  for (const k in src) { const n = src[k] | 0; if (n > 0) items[k] = n; }
  return { items, money: Math.max(0, (basket && basket.money) | 0) };
}

// "is anything actually staked" — used to gate ACCEPT (an empty basket is a no-stake spectate).
export function basketEmpty(basket) {
  const b = normalizeBasket(basket);
  return bagUnits(b.items) === 0 && b.money === 0;
}

// total item units in the basket (money excluded) — for compact display/sanity caps.
export function basketUnits(basket) { return bagUnits(normalizeBasket(basket).items); }

// Can this player back the basket they declared? You must OWN every item (tradeable + enough copies) and
// be able to afford the money. Mirrors coop.js canAnte but for the asymmetric items+money basket.
export function canStake(itembank, bank, basket) {
  const b = normalizeBasket(basket);
  if ((bank | 0) < b.money) return false;
  for (const k in b.items) {
    if (!itembank || !itembank.tradeable(k)) return false;       // never stake the knife / a non-tradeable
    if (!itembank.has(k, b.items[k])) return false;              // must own enough copies
  }
  return true;
}
