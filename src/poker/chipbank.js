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
// The engine can legitimately split odd chips at 1-unit granularity (pot.js awardPots: 100 three
// ways → 34/33/33). Those aren't drawable from 5-denomination chips, so each player also carries a
// tiny `dust` integer 0..4: value(stacks[id]) + dust[id] == engineStack[id] exactly, while physical
// counts stay conserved. reconcile(engineStacks) is the backstop run at each hand settle.

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
function largestFormableLE(set, amount) {
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

// ---- the bank -------------------------------------------------------------

export class ChipBank {
  constructor() {
    this.stacks = {};   // { id: ChipSet }  — behind each player's line
    this.bets = {};     // { id: ChipSet }  — pushed out this street
    this.pot = {};      // ChipSet          — collected from prior streets
    this.float = {};    // ChipSet          — dealer rack / change reserve
    this.dust = {};     // { id: 0..4 }     — sub-5 bookkeeping, no physical chip
    this._minted = {};  // per-denom invariant
  }

  dealStart(ids, perPlayerSet, floatSet) {
    this.stacks = {}; this.bets = {}; this.dust = {};
    for (const id of ids) { this.stacks[id] = cloneSet(perPlayerSet); this.bets[id] = emptySet(); this.dust[id] = 0; }
    this.pot = emptySet();
    this.float = cloneSet(floatSet);
    this._minted = this._totalCounts();
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
  }

  collectBetsToPot() {
    for (const id in this.bets) {
      if (value(this.bets[id])) this.pot = addSet(this.pot, this.bets[id]);
      this.bets[id] = emptySet();
    }
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
    }
    this.float = addSet(this.float, this.pot);          // sub-5 leftover chips park in the rack
    this.pot = emptySet();
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
