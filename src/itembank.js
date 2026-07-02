// itembank.js — the persistent, conservation-tracked ACCOUNT inventory ledger.
//
// This is the item-world analogue of poker's src/poker/chipbank.js: a pure, node-unit-tested ledger
// (no THREE, no DOM) that owns every possession the player holds across runs as an integer multiset and
// guarantees nothing is silently minted or vanished. It is the single source of truth for ownership; the
// pre-run loadout becomes a *recipe* on top of it, and the poker item-wager (a later phase) escrows out of
// it. It serialises into `meta.items` and is built SYNC-READY (pure serialisable state + a monotonic `seq`
// stamp) so a future account server can lift it verbatim and resolve conflicts by `seq`.
//
// An "owned bag" is a sparse multiset of item keys: { itemKey: count >= 1 }. Keys are the same string keys
// used everywhere else — WEAPONS keys (ak74, garand, …) and ITEM_DEFS keys (medkit, grenade, …). Weapons
// are now COUNTABLE (own 2 copies → wager one, keep one). The knife is FREE + permanent and therefore never
// stored as a count and never tradeable — it is granted implicitly at deploy, exactly as today.

export const ITEMBANK_V = 1;                                  // meta.items schema version (migration guard)
export const NON_TRADEABLE = new Set(['knife']);              // free + permanent → never owned-as-count, never wagerable

// ---- pure owned-bag helpers ------------------------------------------------

export function emptyBag() { return {}; }

export function bagClone(b) {
  const r = {};
  for (const k in b) if (b[k] > 0) r[k] = b[k] | 0;
  return r;
}

// total units across all keys (a "how many things do I hold" scalar)
export function bagUnits(b) {
  let n = 0;
  for (const k in b) n += b[k] | 0;
  return n;
}

export function bagAdd(a, b) {
  const r = bagClone(a);
  for (const k in b) if (b[k]) r[k] = (r[k] || 0) + (b[k] | 0);
  return r;
}

// compact, order-independent signature (handy for render/sync caching, mirrors chipbank.sigOf)
export function bagSig(b) {
  return Object.keys(b).filter((k) => b[k] > 0).sort().map((k) => k + ':' + b[k]).join(',');
}

// ---------------------------------------------------------------------------

export class ItemBank {
  constructor(owned = {}, seq = 0) {
    this.owned = {};            // { itemKey: integer count >= 1 } — the conserved multiset
    this.seq = seq | 0;         // monotonic mutation counter (bumped on every change) — sync stamp
    for (const k in owned) {    // sanitise on construct: drop non-positive / non-tradeable
      const n = owned[k] | 0;
      if (n > 0 && this.tradeable(k)) this.owned[k] = n;
    }
  }

  count(key) { return this.owned[key] | 0; }
  has(key, n = 1) { return this.count(key) >= (n | 0); }
  tradeable(key) { return !!key && !NON_TRADEABLE.has(key); }

  // single-key atomic mutations — both bump seq for sync-readiness.
  acquire(key, n = 1, reason = '') {
    n = n | 0; if (n <= 0) return false;
    if (!this.tradeable(key)) return false;                   // never store knife / non-tradeables
    this.owned[key] = (this.owned[key] | 0) + n;
    this.seq++;
    return true;
  }

  // throws on a shortfall (you cannot consume what you don't own) — the item analogue of "never invent chips".
  consume(key, n = 1, reason = '') {
    n = n | 0; if (n <= 0) return false;
    const have = this.owned[key] | 0;
    if (have < n) throw new Error(`ItemBank: cannot consume ${n}× ${key} (have ${have})`);
    const left = have - n;
    if (left > 0) this.owned[key] = left; else delete this.owned[key];
    this.seq++;
    return true;
  }

  // ALL-OR-NOTHING multi-key mutation (sign = +1 acquire / -1 consume). Validates the WHOLE basket against
  // `owned` first and throws before touching anything, so a partially-affordable basket never half-applies.
  // This is the primitive the poker wager locks/refunds baskets with.
  applyBasket(bag, sign) {
    bag = bag || {};
    const keys = Object.keys(bag).filter((k) => (bag[k] | 0) > 0);
    for (const k of keys) {                                   // validate pass — no mutation yet
      if (!this.tradeable(k)) throw new Error(`ItemBank: ${k} is not tradeable`);
      if (sign < 0 && (this.owned[k] | 0) < (bag[k] | 0)) {
        throw new Error(`ItemBank: basket short on ${k} (need ${bag[k] | 0}, have ${this.owned[k] | 0})`);
      }
    }
    for (const k of keys) {                                   // mutate pass — only after full validation
      const n = bag[k] | 0;
      if (sign < 0) { const left = (this.owned[k] | 0) - n; if (left > 0) this.owned[k] = left; else delete this.owned[k]; }
      else { this.owned[k] = (this.owned[k] | 0) + n; }
    }
    this.seq++;
    return true;
  }

  // conservation / shape backstop — every count a positive integer, no knife/non-tradeable ever stored.
  verify() {
    for (const k in this.owned) {
      const n = this.owned[k];
      if (!Number.isInteger(n) || n < 1) throw new Error(`ItemBank: bad count for ${k}: ${n}`);
      if (NON_TRADEABLE.has(k)) throw new Error(`ItemBank: non-tradeable ${k} must not be owned as a count`);
    }
    return true;
  }

  toJSON() { return { v: ITEMBANK_V, seq: this.seq, owned: bagClone(this.owned) }; }
}

// ---- meta migration / construction ----------------------------------------

// Build the conserved `owned` multiset from the LEGACY ownership model (meta.unlocked + meta.loadout),
// idempotently. If meta is already at the current schema version it is returned untouched. Mutates m.items
// in place and returns it. Called from game.js _loadMeta() AFTER the loadout migration (so loadout keys are
// already folded into m.unlocked at that point).
export function migrateItemBank(m) {
  if (m && m.items && (m.items.v | 0) >= ITEMBANK_V) return m.items;   // already migrated → no-op
  const owned = {};
  const unlocked = Array.isArray(m && m.unlocked) ? m.unlocked : [];
  for (const k of unlocked) {                                 // each permanent unlock = one durable copy
    if (k && typeof k === 'string' && k !== 'knife' && !NON_TRADEABLE.has(k)) owned[k] = 1;
  }
  // Paid duplicates exist today ONLY as extra loadout occurrences beyond the first copy — fold them in.
  const loadout = Array.isArray(m && m.loadout) ? m.loadout : [];
  const occ = {};
  for (const k of loadout) if (k && typeof k === 'string') occ[k] = (occ[k] || 0) + 1;
  for (const k in occ) {
    if (k === 'knife' || NON_TRADEABLE.has(k)) continue;
    const dups = Math.max(0, occ[k] - 1);
    if (dups) owned[k] = (owned[k] || 0) + dups;
  }
  // Consumables/throwables had NO account ownership before this ledger → start at 0 (conservative + conserved;
  // any welcome stock is a separate tuning decision, not baked into the migration).
  m.items = { v: ITEMBANK_V, seq: 0, owned };
  return m.items;
}

// Construct the live ItemBank from meta (migrating first if needed). The instance is the runtime source of
// truth; game._saveMeta() serialises it back into meta.items.
export function itemBankFromMeta(m) {
  const it = migrateItemBank(m);
  return new ItemBank(it.owned, it.seq);
}
