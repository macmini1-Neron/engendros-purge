# Poker Card-Math Core — Implementation Plan (Plan 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, node-tested card-math foundation of the Texas Hold'em engine — card/deck primitives, a correct 7-card hand evaluator, side-pot/split math, and Monte-Carlo odds — with zero browser dependency.

**Architecture:** Four pure ES modules under `src/poker/` (no THREE, no DOM). Each is unit-tested with the zero-dependency Node test runner (`node --test`). This is Plan 1 of 3; Plan 2 (`holdem`/`tournament`/`bots`) and Plan 3 (UI/netcode/integration) build on it. Design spec: `docs/superpowers/specs/2026-06-13-poker-texas-holdem-design.md`.

**Tech Stack:** Vanilla ES modules, Node ≥22 built-in test runner (verified on v25.8.0), `import assert from 'node:assert/strict'`, `import { test } from 'node:test'`. No external dependencies, ever.

**Run tests:** `node --test tests/poker/<name>.test.mjs` (exit 0 = pass). Run all: `node --test 'tests/poker/*.test.mjs'` (this Node treats a bare directory arg as a module, so use the glob).

**Card conventions (used by every module):**
- A card is `{ r, s }`: rank `r` ∈ 2..14 (J=11, Q=12, K=13, **A=14**), suit `s` ∈ `'c'|'d'|'h'|'s'`.
- String form (tests/logs): rank char `2..9`, `T`, `J`, `Q`, `K`, `A` + suit char, e.g. `"As"`, `"Th"`, `"2c"`.
- A hand rank from the evaluator is `{ cat, ranks, name }`: `cat` 0..8 (0=High Card … 8=Straight Flush), `ranks` = descending tiebreak vector. `compare(a,b)` is a total order: positive ⇒ a beats b.

---

## File structure (this plan)

| File | Responsibility |
|---|---|
| `src/poker/cards.js` | Deck build, card↔string, Fisher–Yates `shuffle(deck, rng)`, seeded `mulberry32(seed)` RNG. No game logic. |
| `src/poker/handeval.js` | `score5`, generic `evaluate(cards)` (best-5 of any 5–7), `evaluate7` alias, `compare`. The correctness heart. |
| `src/poker/pot.js` | `buildPots(contribs)` (layered side pots) + `awardPots(pots, rankOf, orderFromButton)` (ties + odd chips). Imports `compare` from `handeval`. |
| `src/poker/odds.js` | `equity(...)` Monte-Carlo win/tie %, `outs(hole, board)` textbook draw-outs. Imports `cards` + `handeval`. |
| `tests/poker/*.test.mjs` | One test file per module. |

Dependency order (and build order): `cards` → `handeval` → `pot` → `odds`.

---

## Task 1: `cards.js` — deck, card strings, shuffle, RNG

**Files:**
- Create: `src/poker/cards.js`
- Test: `tests/poker/cards.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/poker/cards.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDeck, cardStr, parseCard, shuffle, mulberry32, RANKS, SUITS } from '../../src/poker/cards.js';

test('makeDeck has 52 unique cards', () => {
  const d = makeDeck();
  assert.equal(d.length, 52);
  const set = new Set(d.map(cardStr));
  assert.equal(set.size, 52);
});

test('RANKS and SUITS sizes', () => {
  assert.equal(RANKS.length, 13);
  assert.equal(SUITS.length, 4);
});

test('cardStr / parseCard round-trip', () => {
  for (const s of ['As', '2c', 'Th', 'Jd', 'Qs', 'Kc', '9h']) {
    assert.equal(cardStr(parseCard(s)), s);
  }
  assert.deepEqual(parseCard('As'), { r: 14, s: 's' });
  assert.deepEqual(parseCard('Th'), { r: 10, s: 'h' });
});

test('mulberry32 is deterministic for a seed', () => {
  const a = mulberry32(123), b = mulberry32(123);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
  for (const x of seqA) { assert.ok(x >= 0 && x < 1); }
});

test('shuffle preserves the multiset and is seed-deterministic', () => {
  const deck = makeDeck();
  const s1 = shuffle(deck, mulberry32(7));
  const s2 = shuffle(deck, mulberry32(7));
  assert.deepEqual(s1.map(cardStr), s2.map(cardStr));            // same seed ⇒ same order
  assert.deepEqual(new Set(s1.map(cardStr)), new Set(deck.map(cardStr))); // same cards
  assert.notDeepEqual(deck.map(cardStr), s1.map(cardStr));       // actually shuffled
  const s3 = shuffle(deck, mulberry32(8));
  assert.notDeepEqual(s1.map(cardStr), s3.map(cardStr));         // different seed ⇒ different order
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/cards.test.mjs`
Expected: FAIL — `Cannot find module '.../src/poker/cards.js'`.

- [ ] **Step 3: Write the implementation**

Create `src/poker/cards.js`:

```js
// Pure card/deck primitives for Texas Hold'em. No THREE, no DOM.
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // J=11 Q=12 K=13 A=14
export const SUITS = ['c', 'd', 'h', 's'];

const RANK_CH = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const CH_RANK = { T: 10, J: 11, Q: 12, K: 13, A: 14 };

export function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s });
  return d;
}

export function cardStr(c) {
  return (RANK_CH[c.r] || String(c.r)) + c.s;
}

export function parseCard(str) {
  const rc = str.slice(0, -1);
  const s = str.slice(-1);
  const r = CH_RANK[rc] ?? Number(rc);
  return { r, s };
}

// Fisher–Yates using an injected rng() -> [0,1). Returns a new array; input untouched.
export function shuffle(deck, rng) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
}

// Seeded RNG (mulberry32). Returns a function () -> [0,1). Same seed ⇒ same sequence.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/cards.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/poker/cards.js tests/poker/cards.test.mjs
git commit -m "feat(poker): card/deck primitives + seeded shuffle"
```

---

## Task 2: `handeval.js` — 5-card scorer, best-of-7, compare

**Files:**
- Create: `src/poker/handeval.js`
- Test: `tests/poker/handeval.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tests/poker/handeval.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard } from '../../src/poker/cards.js';
import { evaluate, evaluate7, compare, CATS } from '../../src/poker/handeval.js';

const H = (s) => s.split(' ').map(parseCard);
const ev = (s) => evaluate(H(s));

test('recognises every category', () => {
  assert.equal(ev('As Ks Qs Js Ts').cat, 8); // royal (straight flush)
  assert.equal(ev('9s 8s 7s 6s 5s').cat, 8); // straight flush
  assert.equal(ev('Ah Ad As Ac Kd').cat, 7); // quads
  assert.equal(ev('Ah Ad As Kc Kd').cat, 6); // full house
  assert.equal(ev('Ah 9h 7h 5h 2h').cat, 5); // flush
  assert.equal(ev('Ah Kd Qs Jc Th').cat, 4); // straight (broadway)
  assert.equal(ev('Ah Ad As Qc Jd').cat, 3); // trips
  assert.equal(ev('Ah Ad Ks Kc Qd').cat, 2); // two pair
  assert.equal(ev('Ah Ad Ks Qc Jd').cat, 1); // pair
  assert.equal(ev('Ah Kd Qs Jc 9h').cat, 0); // high card
});

test('the wheel A-2-3-4-5 is a 5-high straight, not ace-high', () => {
  const wheel = ev('Ah 2d 3s 4c 5h');
  assert.equal(wheel.cat, 4);
  assert.deepEqual(wheel.ranks, [5]);          // five-high
  const sixHigh = ev('2h 3d 4s 5c 6h');
  assert.ok(compare(sixHigh, wheel) > 0);      // 6-high straight beats the wheel
});

test('steel wheel straight flush is 5-high', () => {
  const sf = ev('Ah 2h 3h 4h 5h');
  assert.equal(sf.cat, 8);
  assert.deepEqual(sf.ranks, [5]);
});

test('flush compares card-by-card', () => {
  const a = ev('Ah Qh 9h 5h 2h');
  const b = ev('Ah Jh 9h 5h 2h');
  assert.ok(compare(a, b) > 0); // Q kicker beats J kicker
});

test('full house orders trips then pair', () => {
  const aaakk = ev('Ah Ad As Kc Kd');
  const kkkaa = ev('Kh Kd Ks Ac Ad');
  assert.ok(compare(aaakk, kkkaa) > 0); // trip aces beat trip kings
});

test('two pair tiebreak by high pair, low pair, kicker', () => {
  const a = ev('Ah Ad 5s 5c Kd'); // aces & fives, K kicker
  const b = ev('Ah Ad 5s 5c Qd'); // aces & fives, Q kicker
  assert.ok(compare(a, b) > 0);
});

test('quads kicker matters', () => {
  const a = ev('7h 7d 7s 7c Ad');
  const b = ev('7h 7d 7s 7c Kd');
  assert.ok(compare(a, b) > 0);
});

test('flush beats a straight', () => {
  assert.ok(compare(ev('2h 4h 6h 8h Th'), ev('9c 8d 7h 6s 5c')) > 0);
});

test('evaluate7 picks the best 5 of 7', () => {
  // hole pair + board makes a full house using best 5
  const r = evaluate7(H('Ah Ad Ks Kc Kd 2s 3h'));
  assert.equal(r.cat, 6); // kings full of aces
  assert.deepEqual(r.ranks, [13, 14]);
});

test('evaluate7 plays the board on a tie', () => {
  const board = 'As Ks Qs Js Ts'; // royal flush on the board
  const p1 = evaluate7(H(board + ' 2c 3d'));
  const p2 = evaluate7(H(board + ' 7h 8h'));
  assert.equal(compare(p1, p2), 0); // both play the board → exact tie
});

test('CATS labels line up with cat index', () => {
  assert.equal(CATS[8], 'Straight Flush');
  assert.equal(CATS[0], 'High Card');
  assert.equal(ev('As Ks Qs Js Ts').name, 'Straight Flush');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/handeval.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/poker/handeval.js`:

```js
// Pure poker hand evaluator. No THREE, no DOM.
export const CATS = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

// Total order over hand ranks: >0 means a beats b.
export function compare(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.ranks.length, b.ranks.length);
  for (let i = 0; i < n; i++) {
    const d = (a.ranks[i] || 0) - (b.ranks[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Score exactly five cards -> { cat, ranks }.
function score5(cards) {
  const rs = cards.map((c) => c.r).sort((x, y) => y - x);
  const suits = cards.map((c) => c.s);
  const isFlush = suits.every((s) => s === suits[0]);

  const cnt = new Map();
  for (const r of rs) cnt.set(r, (cnt.get(r) || 0) + 1);
  // groups sorted by count desc, then rank desc
  const groups = [...cnt.entries()].sort((g, h) => h[1] - g[1] || h[0] - g[0]);

  // straight detection (needs 5 distinct ranks); Ace can be low for the wheel
  const uniq = [...new Set(rs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) straightHigh = 5;
  }

  if (isFlush && straightHigh) return { cat: 8, ranks: [straightHigh] };
  if (groups[0][1] === 4) return { cat: 7, ranks: [groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { cat: 6, ranks: [groups[0][0], groups[1][0]] };
  if (isFlush) return { cat: 5, ranks: rs };
  if (straightHigh) return { cat: 4, ranks: [straightHigh] };
  if (groups[0][1] === 3) return { cat: 3, ranks: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { cat: 2, ranks: [groups[0][0], groups[1][0], groups[2][0]] };
  if (groups[0][1] === 2) return { cat: 1, ranks: [groups[0][0], groups[1][0], groups[2][0], groups[3][0]] };
  return { cat: 0, ranks: rs };
}

// all k-combinations of an array (as arrays of elements)
function combos(arr, k) {
  const res = [];
  const idx = [];
  (function rec(start) {
    if (idx.length === k) { res.push(idx.map((i) => arr[i])); return; }
    for (let i = start; i < arr.length; i++) { idx.push(i); rec(i + 1); idx.pop(); }
  })(0);
  return res;
}

// Best 5-card hand from any 5..7 cards.
export function evaluate(cards) {
  let best = null;
  if (cards.length === 5) best = score5(cards);
  else for (const five of combos(cards, 5)) {
    const s = score5(five);
    if (!best || compare(s, best) > 0) best = s;
  }
  best.name = CATS[best.cat];
  return best;
}

export const evaluate7 = evaluate;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/handeval.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Add a property test for the total-order invariant**

Append to `tests/poker/handeval.test.mjs`:

```js
import { makeDeck, shuffle, mulberry32 } from '../../src/poker/cards.js';

test('compare is a consistent total order over random 7-card hands', () => {
  const rng = mulberry32(99);
  for (let i = 0; i < 2000; i++) {
    const d = shuffle(makeDeck(), rng);
    const a = evaluate(d.slice(0, 7));
    const b = evaluate(d.slice(7, 14));
    const ab = compare(a, b), ba = compare(b, a);
    assert.equal(Math.sign(ab), -Math.sign(ba));   // antisymmetry
    assert.equal(compare(a, a), 0);                 // reflexive tie
    assert.ok(a.cat >= 0 && a.cat <= 8);
  }
});
```

- [ ] **Step 6: Run and commit**

Run: `node --test tests/poker/handeval.test.mjs`
Expected: PASS (12 tests).

```bash
git add src/poker/handeval.js tests/poker/handeval.test.mjs
git commit -m "feat(poker): 7-card hand evaluator + total-order compare"
```

---

## Task 3: `pot.js` — side pots, ties, odd chips

**Files:**
- Create: `src/poker/pot.js`
- Test: `tests/poker/pot.test.mjs`

`buildPots(contribs)` takes `contribs: [{ seat, committed, folded }]` and returns layered pots
`[{ amount, eligible:[seat,...] }]`. `awardPots(pots, rankOf, orderFromButton)` takes a map
`rankOf[seat] = handRank` (only for non-folded contenders) and `orderFromButton` (seat ids in
clockwise order starting at the first seat left of the button, for odd-chip distribution) and
returns `winnings[seat] = chips`.

- [ ] **Step 1: Write the failing test**

Create `tests/poker/pot.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPots, awardPots } from '../../src/poker/pot.js';

// helper hand ranks (cat only is enough to order these tests)
const R = (cat, ...ranks) => ({ cat, ranks });

test('single pot, no all-ins', () => {
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 100, folded: false },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 200);
  assert.deepEqual(pots[0].eligible.sort(), ['A', 'B']);
});

test('layered side pot: short all-in + two coverers', () => {
  // A all-in 100, B and C each 250
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 250, folded: false },
    { seat: 'C', committed: 250, folded: false },
  ]);
  // main 300 (A,B,C), side 300 (B,C)
  assert.equal(pots.length, 2);
  assert.equal(pots[0].amount, 300);
  assert.deepEqual(pots[0].eligible.sort(), ['A', 'B', 'C']);
  assert.equal(pots[1].amount, 300);
  assert.deepEqual(pots[1].eligible.sort(), ['B', 'C']);
});

test('folded player leaves dead money but is not eligible', () => {
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: true },
    { seat: 'B', committed: 100, folded: false },
    { seat: 'C', committed: 100, folded: false },
  ]);
  assert.equal(pots.length, 1);
  assert.equal(pots[0].amount, 300);            // A's 100 is dead money in the pot
  assert.deepEqual(pots[0].eligible.sort(), ['B', 'C']); // A can't win
});

test('award: short all-in wins only the main pot, coverer wins the side', () => {
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 250, folded: false },
    { seat: 'C', committed: 250, folded: false },
  ]);
  const rankOf = { A: R(7), B: R(2), C: R(1) };  // A best overall, B beats C
  const win = awardPots(pots, rankOf, ['A', 'B', 'C']);
  assert.equal(win.A, 300);  // main pot only (A wasn't eligible for the side)
  assert.equal(win.B, 300);  // side pot
  assert.ok(!win.C);
});

test('odd chip in a split pot goes to the first seat left of the button', () => {
  // three-way even split: 300 / 3 = 100 each, no remainder
  const pots = buildPots([
    { seat: 'A', committed: 100, folded: false },
    { seat: 'B', committed: 100, folded: false },
    { seat: 'C', committed: 100, folded: false },
  ]);
  assert.deepEqual(awardPots(pots, { A: R(4), B: R(4), C: R(4) }, ['A', 'B', 'C']), { A: 100, B: 100, C: 100 });

  // odd pot of 101 split between two tied winners -> 50 each + 1 leftover chip
  const odd = [{ amount: 101, eligible: ['A', 'B'] }];
  assert.deepEqual(awardPots(odd, { A: R(4), B: R(4) }, ['A', 'B']), { A: 51, B: 50 }); // odd chip to A
  assert.deepEqual(awardPots(odd, { A: R(4), B: R(4) }, ['B', 'A']), { A: 50, B: 51 }); // odd chip to B (first left of button)
});

test('an uncalled extra chip is returned to its owner, not shared', () => {
  // A committed 1 more than anyone called -> that chip is A's own 1-chip side pot
  const pots = buildPots([
    { seat: 'A', committed: 101, folded: false },
    { seat: 'B', committed: 100, folded: false },
    { seat: 'C', committed: 100, folded: false },
  ]);
  const win = awardPots(pots, { A: R(4), B: R(4), C: R(4) }, ['A', 'B', 'C']);
  assert.equal(win.A, 101); // 100 (third of the 300 main) + 1 (own uncalled chip back)
  assert.equal(win.B, 100);
  assert.equal(win.C, 100);
});

test('uncontested pot: lone non-folder wins it all', () => {
  const pots = buildPots([
    { seat: 'A', committed: 50, folded: true },
    { seat: 'B', committed: 50, folded: false },
  ]);
  const win = awardPots(pots, { B: R(0) }, ['A', 'B']);
  assert.equal(win.B, 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/pot.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/poker/pot.js`:

```js
// Side-pot construction + payout (ties, odd chips). No THREE, no DOM.
import { compare } from './handeval.js';

// contribs: [{ seat, committed, folded }] -> [{ amount, eligible:[seat,...] }]
export function buildPots(contribs) {
  const pots = [];
  let players = contribs.filter((p) => p.committed > 0).map((p) => ({ ...p }));
  while (players.length) {
    const min = Math.min(...players.map((p) => p.committed));
    let amount = 0;
    const eligible = [];
    for (const p of players) {
      amount += min;
      p.committed -= min;
      if (!p.folded) eligible.push(p.seat);
    }
    pots.push({ amount, eligible });
    players = players.filter((p) => p.committed > 0);
  }
  return pots;
}

// pots from buildPots; rankOf[seat] = hand rank (non-folded contenders only);
// orderFromButton = seat ids clockwise starting left of the button (odd-chip order).
export function awardPots(pots, rankOf, orderFromButton) {
  const win = {};
  for (const pot of pots) {
    let best = null;
    let winners = [];
    for (const s of pot.eligible) {
      const r = rankOf[s];
      if (!r) continue;
      if (!best || compare(r, best) > 0) { best = r; winners = [s]; }
      else if (compare(r, best) === 0) winners.push(s);
    }
    if (!winners.length) continue;
    const share = Math.floor(pot.amount / winners.length);
    for (const s of winners) win[s] = (win[s] || 0) + share;
    let odd = pot.amount - share * winners.length;
    const ordered = orderFromButton.filter((s) => winners.includes(s));
    for (let i = 0; odd > 0; i++, odd--) {
      const s = ordered[i % ordered.length];
      win[s] = (win[s] || 0) + 1;
    }
  }
  return win;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/pot.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/poker/pot.js tests/poker/pot.test.mjs
git commit -m "feat(poker): side-pot construction + tie/odd-chip payout"
```

---

## Task 4: `odds.js` — Monte-Carlo equity + draw outs

**Files:**
- Create: `src/poker/odds.js`
- Test: `tests/poker/odds.test.mjs`

`equity(hole, board, nOpp, iters, rng)` returns `{ win, tie }` as fractions of `iters`.
`outs(hole, board)` returns the count of unseen cards that complete a **straight-or-better
draw** (textbook draw outs); returns 0 if you already hold a straight or better.

- [ ] **Step 1: Write the failing test**

Create `tests/poker/odds.test.mjs`. Note `equity` samples **random** opponents (use it for
"vs N random hands"); `equityVs` pins an **exact** opponent (use it for known matchups like
AA vs KK):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCard, mulberry32 } from '../../src/poker/cards.js';
import { equity, equityVs, outs } from '../../src/poker/odds.js';

const H = (s) => s.split(' ').map(parseCard);

test('AA beats KK heads-up preflop (~82%)', () => {
  const e = equityVs(H('Ah Ad'), H('Kh Kd'), [], 20000, mulberry32(1));
  assert.ok(e.win > 0.78 && e.win < 0.86, `win=${e.win}`);
});

test('AA vs one random hand is a strong favourite (~85%)', () => {
  const e = equity(H('Ah Ad'), [], 1, 20000, mulberry32(2));
  assert.ok(e.win > 0.80, `win=${e.win}`);
});

test('a flush draw on the flop has 9 outs', () => {
  assert.equal(outs(H('As Ks'), H('2s 7s 9h')), 9); // four spades, no made hand yet
});

test('an open-ended straight draw has 8 outs', () => {
  assert.equal(outs(H('8h 9d'), H('7c Ts 2h')), 8); // 7-8-9-T: any 6 or J (8 cards)
});

test('a gutshot has 4 outs', () => {
  assert.equal(outs(H('6h 7d'), H('9c Ts 2h')), 4); // 6-7_9-T: only an 8 completes
});

test('a made straight reports 0 draw-outs', () => {
  assert.equal(outs(H('8h 9d'), H('7c Ts Jh')), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/poker/odds.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/poker/odds.js`:

```js
// Monte-Carlo equity + textbook draw-outs. No THREE, no DOM.
import { makeDeck, cardStr, shuffle } from './cards.js';
import { evaluate, compare } from './handeval.js';

function stubExcluding(used) {
  const set = new Set(used.map(cardStr));
  return makeDeck().filter((c) => !set.has(cardStr(c)));
}

// Equity of `hole` vs `nOpp` random opponents, given `board` so far.
export function equity(hole, board, nOpp, iters, rng) {
  let win = 0, tie = 0;
  for (let it = 0; it < iters; it++) {
    const d = shuffle(stubExcluding([...hole, ...board]), rng);
    let k = 0;
    const opps = [];
    for (let o = 0; o < nOpp; o++) opps.push([d[k++], d[k++]]);
    const full = board.slice();
    while (full.length < 5) full.push(d[k++]);
    const me = evaluate([...hole, ...full]);
    let better = 0, equal = 0;
    for (const op of opps) {
      const c = compare(evaluate([...op, ...full]), me);
      if (c > 0) better++; else if (c === 0) equal++;
    }
    if (better === 0) { if (equal === 0) win++; else tie++; }
  }
  return { win: win / iters, tie: tie / iters };
}

// Equity of `hole` vs one EXACT opponent hand `opp`, given `board` so far.
export function equityVs(hole, opp, board, iters, rng) {
  let win = 0, tie = 0;
  for (let it = 0; it < iters; it++) {
    const d = shuffle(stubExcluding([...hole, ...opp, ...board]), rng);
    let k = 0;
    const full = board.slice();
    while (full.length < 5) full.push(d[k++]);
    const c = compare(evaluate([...hole, ...full]), evaluate([...opp, ...full]));
    if (c > 0) win++; else if (c === 0) tie++;
  }
  return { win: win / iters, tie: tie / iters };
}

// Count unseen cards that complete a straight-or-better draw (cat >= 4).
export function outs(hole, board) {
  const base = evaluate([...hole, ...board]);
  if (base.cat >= 4) return 0;
  let n = 0;
  for (const c of stubExcluding([...hole, ...board])) {
    if (evaluate([...hole, ...board, c]).cat >= 4) n++;
  }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/poker/odds.test.mjs`
Expected: PASS (6 tests). The Monte-Carlo tests are seeded, so they are deterministic.

- [ ] **Step 5: Commit**

```bash
git add src/poker/odds.js tests/poker/odds.test.mjs
git commit -m "feat(poker): Monte-Carlo equity + draw-outs"
```

---

## Task 5: Full-suite green + plan close-out

- [ ] **Step 1: Run the whole poker suite**

Run: `node --test 'tests/poker/*.test.mjs'`
Expected: PASS — all four files green, 0 failures (30 tests).

- [ ] **Step 2: Confirm purity (no THREE leaked in)**

Run: `grep -rn "from 'three'" src/poker/ ; echo "exit:$?"`
Expected: no matches (grep exit 1) — the core stays Node-runnable.

- [ ] **Step 3: Commit any final tidy-ups (if needed)**

```bash
git add -A && git commit -m "test(poker): card-math core suite green" --allow-empty
```

---

## Self-review (done while writing)

- **Spec coverage:** §5 cards ⇒ Task 1; §6 evaluator (all 9 cats, wheel, best-5-of-7, total
  order) ⇒ Task 2; §7 side pots + ties + odd chip ⇒ Task 3; §11 odds/outs ⇒ Task 4. All
  card-math requirements of the spec are covered by this plan. (`holdem`/`tournament`/`bots`
  and UI/netcode are intentionally Plans 2 & 3.)
- **Placeholder scan:** none — every code step ships real code; every run step has an expected
  result.
- **Type consistency:** card `{r,s}`; rank `{cat,ranks,name}`; `compare` used identically in
  `handeval`, `pot`, `odds`; `buildPots`→`awardPots` share the `{amount,eligible}` shape and
  `seat`-keyed maps. `equity`/`equityVs`/`outs` signatures match their tests.

---

## Next plans (not part of this document)

- **Plan 2 — Game-flow core:** `src/poker/holdem.js` (betting state machine: blinds, button,
  heads-up rule, legal actions, No-Limit min-raise + no-reopen-on-incomplete-all-in, BB
  option, street progression, showdown via `pot`/`handeval`, public/private views),
  `src/poker/tournament.js` (SNG: stacks, blind schedule by hands, elimination, button
  movement, winner-takes-all), `src/poker/bots.js` (practice AI). All node-tested.
- **Plan 3 — Integration:** `src/poker-table.js` (host-authoritative orchestrator + 30 s
  timer + bot driving + view-model emission), `src/poker-ui.js` (`PokerDomRenderer` + lobby +
  action panel + showdown screens, plain-table aesthetic), edits to `game.js` (`'poker'` state,
  entry, bank), `mp.js`/`net.js` (`pk*` messages, disconnect→elimination), `index.html`
  (overlay + POLYMER CSS). Verified solo + 2-tab co-op.
