// Physical, conserved poker chips — a layer ON TOP of the integer engine (holdem.js/pot.js/
// tournament.js stay untouched). No THREE, no DOM; node-unit-tested like the rest of src/poker/*.
//
// A ChipSet is a sparse multiset of real chips: { denom: count } over the owner set
// 5 white · 10 blue · 20 red · 50 green · 100 black · 500 yellow. The ChipBank holds every player's
// stack, their in-front bet, the central pot, and a dealer FLOAT (the change rack). Chips MOVE
// (bet→pot→winner) and are broken value-neutrally against the float — they are never re-derived from
// a number, so "win two greens, hold two greens" is literal. The per-colour count over
// stacks+bets+pot+float is an invariant minted once at dealStart and never changed.
//
// All bets are snapped to the 5-chip atom (the human UI via betsizing.clampRaise AND the bots via
// bots.raiseTo), blinds are multiples of 5, and pot.js splits pots in whole 5-chips — so in normal
// play every stack stays a multiple of 5 and NO sub-5 remainder ever arises. The per-player `dust`
// integer 0..4 is kept only as a defensive backstop (value(stacks[id]) + dust[id] == engineStack[id]
// exactly, physical counts conserved); it stays 0 unless a synthetic non-multiple-of-5 amount is
// injected. reconcile(engineStacks) is the conservation backstop run at each hand settle.

export const DENOMS = [500, 100, 50, 20, 10, 5];       // descending (matches poker/chips.js)
const ASC = [5, 10, 20, 50, 100, 500];                 // ascending — smallest breakable first

// ---- pure ChipSet helpers -------------------------------------------------

export function emptySet() { return {}; }

export function cloneSet(s) {
  const r = {};
  for (const d of DENOMS) if (s[d]) r[d] = s[d];
  return r;
}

export function value(s) {
  let v = 0;
  for (const d of DENOMS) if (s[d]) v += d * s[d];
  return v;
}

export function addSet(a, b) {
  const r = cloneSet(a);
  for (const d of DENOMS) if (b[d]) r[d] = (r[d] || 0) + b[d];
  return r;
}

export function subSet(a, b) {
  const r = cloneSet(a);
  for (const d of DENOMS) if (b[d]) {
    r[d] = (r[d] || 0) - b[d];
    if (r[d] < 0) throw new Error(`subSet would go negative at denom ${d}`);
    if (r[d] === 0) delete r[d];
  }
  return r;
}

// compact, order-independent, composition-sensitive signature (for render caching)
export function sigOf(s) {
  return DENOMS.filter((d) => s[d] > 0).map((d) => d + ':' + s[d]).join(',');
}

const restrictBelow = (set, d) => {
  const r = {};
  for (const k of DENOMS) if (k < d && set[k]) r[k] = set[k];
  return r;
};

// Exact sub-multiset of `set` worth exactly `amount`, or null. Backtracking, largest-first — so it
// never gives a false null the way greedy would (e.g. {50:1,20:3} for 60 → {20:3}).
export function exactSubset(set, amount) {
  if (amount === 0) return {};
  if (amount < 0) return null;
  if (amount % 5 !== 0) return null;                   // every denom is a multiple of 5 → a non-multiple is never
                                                       // formable; bail before the backtracker searches it exhaustively
  const denoms = DENOMS.filter((d) => set[d] > 0);     // descending
  const res = {};
  const rec = (i, rem) => {
    if (rem === 0) return true;
    if (i >= denoms.length) return false;
    const d = denoms[i];
    const maxc = Math.min(set[d], Math.floor(rem / d));
    for (let c = maxc; c >= 0; c--) {
      if (c > 0) res[d] = c; else delete res[d];
      if (rec(i + 1, rem - d * c)) return true;
    }
    delete res[d];
    return false;
  };
  return rec(0, amount) ? { ...res } : null;
}

// largest exact value ≤ amount formable from `set` alone (fallback when an exact draw is impossible)
export function largestFormableLE(set, amount) {
  for (let v = amount - (amount % 5); v >= 0; v -= 5) {
    const ss = exactSubset(set, v);
    if (ss) return ss;
  }
  return {};
}

// Make `set` able to form exactly `amount`, swapping value-neutrally against `float`. Returns new
// { set, float, short } — short>0 only if the float can't supply the needed small chips (a
// dimensioning failure that reconcile() later cleans up). Both pools' values are preserved.
export function makeChange(set0, float0, amount) {
  let set = cloneSet(set0), float = cloneSet(float0);
  amount = Math.round(amount);
  // Chips are all multiples of 5, so a sub-5 remainder can never be formed — split it off as `short`
  // and work the 5-multiple `target`. (This also keeps exactSubset off an impossible amount, which it
  // would otherwise search exhaustively → a multi-second hang on big stacks / hostile odd bets.)
  const sub5 = amount > 0 ? amount % 5 : 0;
  const target = amount - sub5;
  if (target <= 0 || exactSubset(set, target)) return { set, float, short: sub5 };
  let guard = 4000;
  while (guard-- > 0 && !exactSubset(set, target)) {
    let broke = false;
    for (const d of ASC) {                              // break the smallest breakable chip first
      if (d <= 5 || !(set[d] > 0)) continue;
      const got = exactSubset(restrictBelow(float, d), d);   // float returns value d in smaller chips
      if (got) {
        set = subSet(set, { [d]: 1 });
        float = addSet(float, { [d]: 1 });
        float = subSet(float, got);
        set = addSet(set, got);
        broke = true;
        break;
      }
    }
    if (!broke) break;                                  // float can't break any of the player's chips
  }
  const short = (exactSubset(set, target) ? 0 : target - value(largestFormableLE(set, target))) + sub5;
  return { set, float, short };
}

// ---- per-skin provenance ledger (COSMETIC — layered over the value economy, never affects value) ----
// A SkinMap is { skinId: ChipSet }: the SAME chips a location already holds, partitioned by the skin
// they should RENDER as (so a pot of Marx+Lenin chips reads as a mix, and a winner keeps the won skins).
// The per-denom sum over skins is kept == the real ChipSet by a SOFT CLAMP after every move — never a
// thrown invariant. value()/verify() stay skin-blind. The dealer float owns the reserved skin 'house'
// ('house' is intentionally absent from CHIP_SKINS → it renders as the default dice look for free).
export const HOUSE_SKIN = 'house';

// deterministic skin order: ids sorted, 'house' last (spillover sink + drawn last)
function skinOrder(skinMap) {
  return Object.keys(skinMap).sort((a, b) => ((a === HOUSE_SKIN) - (b === HOUSE_SKIN)) || (a < b ? -1 : a > b ? 1 : 0));
}

// per-denom total count over all skins → a plain ChipSet (the clamp target + the renderer's layout aggregate)
export function skinValueByDenom(skinMap) {
  const r = {};
  for (const sk in skinMap) for (const d of DENOMS) if (skinMap[sk][d]) r[d] = (r[d] || 0) + skinMap[sk][d];
  return r;
}

// union-add src into dst (per skin, per denom) → a NEW SkinMap
export function mergeSkinned(dst, src) {
  const r = {};
  for (const sk in dst) if (sigOf(dst[sk])) r[sk] = cloneSet(dst[sk]);
  for (const sk in src) if (sigOf(src[sk])) r[sk] = addSet(r[sk] || {}, src[sk]);
  return r;
}

// Pull exactly `take` (a ChipSet) out of `src` (MUTATED in place), returning the SkinMap removed. Per
// denom: prefer `preferSkin`, then the rest in skinOrder; any shortfall (the value economy broke chips
// out from under the ledger) is attributed to `fallbackSkin` (default 'house'; postBet passes the
// owner's own skin so change-broken chips read as the owner). Never throws — the caller clamps after.
export function drawSkinned(src, take, preferSkin, fallbackSkin = HOUSE_SKIN) {
  const out = {};
  for (const d of DENOMS) {
    let need = take[d] || 0;
    if (!need) continue;
    const order = (preferSkin && src[preferSkin]) ? [preferSkin, ...skinOrder(src).filter((s) => s !== preferSkin)] : skinOrder(src);
    for (const sk of order) {
      if (need <= 0) break;
      const avail = (src[sk] && src[sk][d]) || 0;
      const n = Math.min(avail, need);
      if (n > 0) { (out[sk] || (out[sk] = {}))[d] = (out[sk][d] || 0) + n; src[sk][d] -= n; if (src[sk][d] <= 0) delete src[sk][d]; need -= n; }
    }
    if (need > 0) (out[fallbackSkin] || (out[fallbackSkin] = {}))[d] = (out[fallbackSkin][d] || 0) + need; // ledger fell short (value economy broke chips) → attribute to fallbackSkin; clamp fixes the sums
  }
  for (const sk in src) if (!sigOf(src[sk])) delete src[sk];
  return out;
}

// Soft clamp: re-balance `skinMap` so its per-denom sum == realSet. Deficit → fillSkin; surplus trimmed
// 'house'-first then the rest. MUTATES + returns skinMap. Never throws. This is what makes the ledger a
// best-effort cosmetic shadow that always reconciles to the value-authoritative chips.
export function clampSkinsTo(skinMap, realSet, fillSkin = HOUSE_SKIN) {
  for (const d of DENOMS) {
    const real = realSet[d] || 0;
    let have = 0; for (const sk in skinMap) have += (skinMap[sk][d] || 0);
    if (have === real) continue;
    if (have < real) { (skinMap[fillSkin] || (skinMap[fillSkin] = {}))[d] = (skinMap[fillSkin][d] || 0) + (real - have); }
    else {
      let over = have - real;
      for (const sk of [HOUSE_SKIN, ...skinOrder(skinMap).filter((s) => s !== HOUSE_SKIN)]) {
        if (over <= 0) break;
        const n = Math.min((skinMap[sk] && skinMap[sk][d]) || 0, over);
        if (n > 0) { skinMap[sk][d] -= n; if (skinMap[sk][d] <= 0) delete skinMap[sk][d]; over -= n; }
      }
    }
  }
  for (const sk in skinMap) if (!sigOf(skinMap[sk])) delete skinMap[sk];
  return skinMap;
}

// ---- the bank -------------------------------------------------------------

export class ChipBank {
  constructor() {
    this.stacks = {};   // { id: ChipSet }  — behind each player's line
    this.bets = {};     // { id: ChipSet }  — pushed out this street
    this.pot = {};      // ChipSet          — collected from prior streets
    this.float = {};    // ChipSet          — dealer rack / change reserve
    this.dust = {};     // { id: 0..4 }     — sub-5 bookkeeping, no physical chip
    this._minted = {};  // per-denom invariant
    this.skins = {};    // { id: skinId }   — each player's OWN (preferred) skin
    this.skinsAt = { stacks: {}, bets: {}, pot: {}, float: {} }; // cosmetic provenance ledger (see helpers above)
  }

  // ledger clamp helpers — re-balance a touched ledger location to the real ChipSet after a value move
  _skClamp(loc, id) { this.skinsAt[loc][id] = clampSkinsTo(this.skinsAt[loc][id] || {}, this[loc][id] || {}, this.skins[id] || HOUSE_SKIN); }
  _skClampPool(loc) { this.skinsAt[loc] = clampSkinsTo(this.skinsAt[loc] || {}, this[loc] || {}, HOUSE_SKIN); }

  dealStart(ids, perPlayerSet, floatSet, skinsById = {}) {
    this.stacks = {}; this.bets = {}; this.dust = {};
    for (const id of ids) { this.stacks[id] = cloneSet(perPlayerSet); this.bets[id] = emptySet(); this.dust[id] = 0; }
    this.pot = emptySet();
    this.float = cloneSet(floatSet);
    this._minted = this._totalCounts();
    // provenance ledger: each player's whole starting stack is THEIR own skin; the float is 'house'.
    // (Unspecified ids → 'house' = the dice look; the local player + co-op peers pass real skins.)
    this.skins = {}; this.skinsAt = { stacks: {}, bets: {}, pot: {}, float: {} };
    for (const id of ids) { this.skins[id] = (skinsById && skinsById[id]) || HOUSE_SKIN; this.skinsAt.stacks[id] = { [this.skins[id]]: cloneSet(perPlayerSet) }; this.skinsAt.bets[id] = {}; }
    this.skinsAt.float = { [HOUSE_SKIN]: cloneSet(floatSet) };
  }

  _totalCounts() {
    const t = {};
    const add = (s) => { for (const d of DENOMS) if (s[d]) t[d] = (t[d] || 0) + s[d]; };
    for (const id in this.stacks) add(this.stacks[id]);
    for (const id in this.bets) add(this.bets[id]);
    add(this.pot); add(this.float);
    return t;
  }

  // a player's total chip value (physical stack + the sub-5 dust ledger). Named stackValue to avoid
  // colliding with the module-level value(set) helper.
  stackValue(id) { return value(this.stacks[id] || {}) + (this.dust[id] || 0); }

  // Move exactly `amount` value from a player's stack into their bet zone, breaking against the
  // float as needed. A float-exhaustion shortfall is left for reconcile() (chips never invented).
  postBet(id, amount) {
    amount = Math.round(amount);
    if (amount <= 0) return;
    const { set, float, short } = makeChange(this.stacks[id] || {}, this.float, amount);
    this.float = float;
    const depletion = short - (amount % 5);   // sub-5 is benign; anything beyond it = a thin float
    if (depletion > 0) console.warn(`[poker] chip float too thin: postBet ${id} for ${amount} left ${depletion} unbacked (reconcile will settle)`);
    const pay = amount - short;
    const take = exactSubset(set, pay) || largestFormableLE(set, pay);
    this.stacks[id] = subSet(set, take);
    this.bets[id] = addSet(this.bets[id] || {}, take);
    // ledger: move `take` stack→bet preferring the player's OWN skin; clamp the three touched locations
    // (the makeChange break against the float is absorbed by the clamps → change chips read as own skin).
    const moved = drawSkinned(this.skinsAt.stacks[id] || (this.skinsAt.stacks[id] = {}), take, this.skins[id], this.skins[id]);
    this.skinsAt.bets[id] = mergeSkinned(this.skinsAt.bets[id] || {}, moved);
    this._skClamp('stacks', id); this._skClamp('bets', id); this._skClampPool('float');
  }

  collectBetsToPot() {
    for (const id in this.bets) {
      if (value(this.bets[id])) this.pot = addSet(this.pot, this.bets[id]);
      this.bets[id] = emptySet();
    }
    // ledger: union every bet into the pot (preserves each player's skins → the MIX), zero the bet ledgers
    for (const id in this.skinsAt.bets) { this.skinsAt.pot = mergeSkinned(this.skinsAt.pot, this.skinsAt.bets[id]); this.skinsAt.bets[id] = {}; }
    this._skClampPool('pot');
  }

  // Pay the pot out to winners. A single winner gets the ACTUAL pot chips (no re-derivation). A
  // chop hands each winner the largest 5-multiple ≤ their share and books the sub-5 remainder as
  // dust; the leftover chips fall back to the float. value(stack)+dust == engine share for each.
  awardToWinners(winnings, orderFromButton) {
    this.collectBetsToPot();
    const order = orderFromButton && orderFromButton.length ? orderFromButton : Object.keys(winnings);
    const winners = order.filter((id) => (winnings[id] || 0) > 0);
    for (const id of winners) {
      const share = winnings[id];
      const phys = share - (share % 5);
      const take = this._drawFromPot(phys);
      this.stacks[id] = addSet(this.stacks[id] || {}, take);
      this.dust[id] = (this.dust[id] || 0) + (share - value(take));
      this._normalizeDust(id);
      // ledger: the winner INHERITS the pot's skin mix for the chips they drew (no prefer → real mix)
      const skinTake = drawSkinned(this.skinsAt.pot, take, null);
      this.skinsAt.stacks[id] = mergeSkinned(this.skinsAt.stacks[id] || {}, skinTake);
    }
    this.float = addSet(this.float, this.pot);          // sub-5 leftover chips park in the rack
    this.pot = emptySet();
    // ledger: leftover pot → float; clamp every touched location to the post-award reality
    this.skinsAt.float = mergeSkinned(this.skinsAt.float, this.skinsAt.pot); this.skinsAt.pot = {};
    for (const id of winners) this._skClamp('stacks', id);
    this._skClampPool('float'); this._skClampPool('pot');
  }

  _drawFromPot(amount) {
    if (amount <= 0) return {};
    let take = exactSubset(this.pot, amount);
    if (!take) {
      const mc = makeChange(this.pot, this.float, amount);
      this.pot = mc.set; this.float = mc.float;
      take = exactSubset(this.pot, amount) || largestFormableLE(this.pot, amount);
    }
    this.pot = subSet(this.pot, take);
    return take;
  }

  // best-effort: redeem each accumulated 5 for a real 5-chip from the float when it has one. The hard
  // dust ∈ 0..4 guarantee comes from reconcile() (dust = stack % 5) at each settle, NOT from here.
  _normalizeDust(id) {
    while ((this.dust[id] || 0) >= 5) {
      const five = exactSubset(this.float, 5);
      if (!five) break;
      this.float = subSet(this.float, five);
      this.stacks[id] = addSet(this.stacks[id] || {}, five);
      this.dust[id] -= 5;
    }
  }

  // Force value(stacks[id]) + dust[id] === engine stack for every player, value-neutrally against
  // the float. Busted players (engine 0) are emptied. The conservation backstop.
  reconcile(stacksById) {
    const targets = Array.isArray(stacksById)
      ? Object.fromEntries(stacksById.map((p) => [p.id, p.stack | 0]))
      : stacksById;
    // phase 1: return every overshoot to the float (restocks it before we draw in phase 2)
    for (const id in this.stacks) {
      const t = targets[id] | 0;
      const phys = t - (t % 5);
      this.dust[id] = t % 5;
      const cur = value(this.stacks[id]);
      if (cur > phys) {
        const need = cur - phys;
        let give = exactSubset(this.stacks[id], need);
        if (!give) {                                          // can't shed `need` exactly → break a chip against the float first
          const mc = makeChange(this.stacks[id], this.float, need);
          this.stacks[id] = mc.set; this.float = mc.float;
          give = exactSubset(this.stacks[id], need) || largestFormableLE(this.stacks[id], need);
        }
        this.stacks[id] = subSet(this.stacks[id], give);
        this.float = addSet(this.float, give);
      }
    }
    // phase 2: top up every shortfall from the float
    for (const id in this.stacks) {
      const t = targets[id] | 0;
      const phys = t - (t % 5);
      const cur = value(this.stacks[id]);
      if (cur < phys) {
        const need = phys - cur;
        let take = exactSubset(this.float, need);
        if (!take) {
          const mc = makeChange(this.float, this.stacks[id], need);
          this.float = mc.set; this.stacks[id] = mc.float;     // (makeChange swaps the two pools)
          take = exactSubset(this.float, need) || largestFormableLE(this.float, need);
        }
        this.float = subSet(this.float, take);
        this.stacks[id] = addSet(this.stacks[id] || {}, take);
      }
    }
    // ledger: clamp every stack (corrective shuffle → own skin) + the float to the corrected reality
    for (const id in this.stacks) this._skClamp('stacks', id);
    this._skClampPool('float');
  }

  // Re-mint the cosmetic ledger to the CURRENT chip state for a fresh per-seat skin map — provenance only,
  // NO value re-deal (so it's safe mid-hand). Pot/bet provenance is reset to house (acceptable: used by the
  // dev skin hook + as a clean re-skin). Each stack becomes its owner's single skin; the float is house.
  reskin(skinsById) {
    this.skins = { ...this.skins, ...(skinsById || {}) };
    this.skinsAt = { stacks: {}, bets: {}, pot: {}, float: {} };
    for (const id in this.stacks) this.skinsAt.stacks[id] = sigOf(this.stacks[id]) ? { [this.skins[id] || HOUSE_SKIN]: cloneSet(this.stacks[id]) } : {};
    for (const id in this.bets) this.skinsAt.bets[id] = sigOf(this.bets[id]) ? { [this.skins[id] || HOUSE_SKIN]: cloneSet(this.bets[id]) } : {};
    if (sigOf(this.pot)) this.skinsAt.pot = { [HOUSE_SKIN]: cloneSet(this.pot) };
    if (sigOf(this.float)) this.skinsAt.float = { [HOUSE_SKIN]: cloneSet(this.float) };
  }

  // Re-key one player's per-seat ledgers from oldId → newId (co-op reconnect: a returning player gets a
  // new peer id). Pure rename — moves stack/bet/dust + provenance, no value created or destroyed. No-op if
  // oldId is absent or newId already exists (caller must apply at a safe boundary, e.g. between hands).
  rekey(oldId, newId) {
    if (oldId === newId || !(oldId in this.stacks) || (newId in this.stacks)) return false;
    for (const m of [this.stacks, this.bets, this.dust, this.skins]) { if (oldId in m) { m[newId] = m[oldId]; delete m[oldId]; } }
    for (const loc of ['stacks', 'bets']) { const m = this.skinsAt[loc]; if (m && oldId in m) { m[newId] = m[oldId]; delete m[oldId]; } }
    return true;
  }

  // test-only oracle: the cosmetic ledger sums (per location, per denom) to the real ChipSets, no negatives.
  // (NOT called in production; the separate verify() below is the value invariant and is skin-blind.)
  verifySkins() {
    const chk = (real, skinMap, label) => {
      for (const d of DENOMS) {
        let have = 0;
        for (const sk in skinMap) { const c = skinMap[sk][d] || 0; if (c < 0) throw new Error(`negative skin ${sk} denom ${d} at ${label}`); have += c; }
        if (have !== (real[d] || 0)) throw new Error(`skin ledger != real at ${label} denom ${d}: ${have} != ${real[d] || 0}`);
      }
    };
    for (const id in this.stacks) chk(this.stacks[id], this.skinsAt.stacks[id] || {}, 'stacks:' + id);
    for (const id in this.bets) chk(this.bets[id], this.skinsAt.bets[id] || {}, 'bets:' + id);
    chk(this.pot, this.skinsAt.pot, 'pot');
    chk(this.float, this.skinsAt.float, 'float');
    return true;
  }

  verify() {
    const t = this._totalCounts();
    for (const d of DENOMS) {
      if ((t[d] || 0) !== (this._minted[d] || 0)) throw new Error(`conservation broken at denom ${d}: ${t[d] || 0} != ${this._minted[d] || 0}`);
    }
    for (const id in this.stacks) {
      const du = this.dust[id] || 0;
      if (du < 0 || du > 4) throw new Error(`dust out of range for ${id}: ${du}`);
    }
    for (const d of DENOMS) if ((this.float[d] || 0) < 0) throw new Error(`negative float at denom ${d}`);
    return true;
  }
}
