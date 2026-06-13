# Texas Hold'em Poker — Design Spec

**Date:** 2026-06-13
**Status:** Design (awaiting review → writing-plans)
**Branch:** `docs/poker-holdem-design`
**Author:** Claude (Opus 4.8) with Tomáš

---

## 1. Summary

Add a **No-Limit Texas Hold'em** poker mini-game to ENGENDROS PURGE as a *secret illegal
gambling den* ("ИГОРНЫЙ ПРИТОН"). Players gamble **in-game bank money** (`meta.bank`) in
**Sit & Go tournaments**. The format is **PvP over the existing host-authoritative co-op**,
with an **AI-bot practice mode** for solo play and testing.

The hard requirement is **1:1 correctness with real casino poker rules** — proper blinds and
dealer-button rotation, all hand rankings, no-limit min-raise rules, all-in **side pots**,
**tie/split pots** with odd-chip distribution, heads-up blind rules, and a **genuinely random
deck** (real Fisher–Yates shuffle, cards removed as dealt) so outs/odds are real and a player
can reason about the remaining cards. No rigging.

This v1 ships as a **2D UI game on a plain, ordinary table** (no fancy casino felt — see
`docs/poker/reference-table.png`: a battered Soviet table). The code is structured so **3D
assets (table, chips, cards) can be dropped in later** without touching the poker logic.

### Goals
- Correct, auditable Texas Hold'em engine, unit-tested in Node (no THREE).
- Host-authoritative netcode reusing the existing co-op transport; cheat-resistant (a client
  never receives another player's hole cards before showdown).
- Sit & Go tournament loop integrated with `meta.bank`.
- Plain-table 2D UI in the established POLYMER style; renderer is swappable for future 3D.
- Solo practice vs. bots; PvP for real money between humans.

### Non-goals (v1)
- 3D table/chip/card models (future — built via the `modelgen` harness).
- The physical world prop / secret-den location ("propojíme pak" — wired later).
- Cash (ring) games, multi-table tournaments, antes, rake, host migration.
- A real-money or server-synced economy (each player's `meta` stays local, as today).

---

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Game | Texas Hold'em, **No-Limit** |
| Opponents | **PvP over co-op** + **practice vs AI bots** (solo) |
| Format | **Sit & Go tournament** |
| Table size | **6-max** (2–6 humans; heads-up when two) |
| Payout | **Winner-takes-all**, no rake (zero-sum PvP) |
| Buy-in | **Fixed tiers + custom amount**, paid from `meta.bank` |
| Blind escalation | **By hands dealt** (level up every N hands) |
| Action timer | **~30 s/turn → auto check/fold**, ticked by host |
| Leave / disconnect | **Immediate elimination** (fold + bust, chips removed) |
| Fairness | Real 52-card deck, Fisher–Yates shuffle, cards removed as dealt; showdown reveals; **optional odds/outs widget** |
| Aesthetic | **Plain ordinary table** (not casino felt); 3D assets added later |

---

## 3. Architecture overview

Three layers, with a hard boundary at THREE/DOM (mirrors `modelgen` and the repo's split):

```
 ┌─────────────────────────────────────────────────────────────┐
 │ PURE CORE  (src/poker/*.js — NO THREE, NO DOM, node --test)  │
 │  cards · handeval · pot · holdem · tournament · bots · odds   │
 │  → deterministic state machine + view-model producer          │
 └───────────────▲───────────────────────────────▲──────────────┘
                 │ actions in / state out          │ view-model
 ┌───────────────┴───────────┐        ┌───────────┴──────────────┐
 │ NETCODE/CONTROL (host-auth)│        │ RENDERER (swappable)      │
 │  PokerTable orchestrator   │        │  v1: PokerDomRenderer 2D  │
 │  in game.js + mp.js/net.js │        │  later: PokerSceneRenderer│
 │  validates, broadcasts      │        │         (THREE 3D)        │
 └────────────────────────────┘        └───────────────────────────┘
```

**Why a pure core:** matches `simclock.js` / `effects-status.js` / `modelgen` — fully
unit-testable with the zero-dependency Node test runner, which is the only realistic way to
hit 1:1 rule correctness. THREE cannot be imported by any tested module (it is a browser
import-map alias Node cannot resolve), so the core is pure ESM.

**Why a swappable renderer:** the core/netcode emit a plain **view-model** object; the
renderer only reads it and emits **semantic actions** (`fold`/`call`/`raise(to)`). v1 is a DOM
renderer drawing a plain table + CSS cards; a future `PokerSceneRenderer` draws a THREE scene
(voxel/GLB table, chip stacks, card meshes) consuming the *same* view-model and emitting the
*same* actions — no logic rewrite. This satisfies "be ready for 3D assets later."

---

## 4. Module breakdown

### Pure core — `src/poker/` (no THREE, no DOM, `node --test`)

| File | Responsibility | Key exports |
|---|---|---|
| `cards.js` | Card representation, deck build, **Fisher–Yates shuffle** seeded by a host RNG (reproducible → provably-fair capable). Deal/burn helpers that *remove* cards from the deck. | `makeDeck()`, `shuffle(deck, rng)`, `RANKS`, `SUITS`, `cardStr(c)`, `parseCard(s)` |
| `handeval.js` | **7→best-5 evaluator.** Maps any 5–7 cards to a comparable rank (category + ordered kickers). The heart of correctness. | `evaluate7(cards) → {cat, ranks[], name}`, `compare(a, b)`, `bestOfMany(holeArrays, board)` |
| `pot.js` | **Side-pot construction** from per-player committed amounts; **payout** including ties (chop) and **odd-chip** distribution (first seat left of button). | `buildPots(contribs, foldedSet)`, `awardPots(pots, showdownRanks, buttonOrder)` |
| `holdem.js` | **One-hand state machine.** Blinds, button, heads-up rule, deal/burn streets, legal-action computation, min-raise, BB option, betting-round termination, all-in handling, showdown. Pure `applyAction`. | `startHand(cfg) → state`, `legalActions(state) → {...}`, `applyAction(state, action) → state`, `publicView(state)`, `privateView(state, seat)` |
| `tournament.js` | **Sit & Go layer.** Seat registration, buy-in accounting, equal starting stacks, **blind schedule by hands**, elimination on bust, button movement skipping busted seats, winner-takes-all payout, start/finish lifecycle. | `createTournament(cfg)`, `seat()/unseat()`, `startTournament()`, `onHandComplete(...)`, `isOver()`, `payouts()` |
| `bots.js` | AI policy for practice mode — a **pure function** of the bot's private view → a legal action. Heuristic: hand strength + pot odds + position + bounded bluff randomness (deterministic via seed). | `botAction(privateView, legalActions, rng) → action` |
| `odds.js` | Outs/equity for the optional widget — **Monte-Carlo** over the same `cards`+`handeval` (deal random completions, tally wins) → win% and outs count. | `equity(hole, board, nOpp, iters, rng)`, `outs(hole, board)` |

### Thin layer (THREE / DOM / net — verified in-browser)

| File | Responsibility |
|---|---|
| `src/poker-table.js` | `PokerTable` orchestrator — owns a `tournament` + current `holdem` state on the **host**; advances the state machine, drives bots, ticks the action timer, applies/validates actions, produces per-seat view-models, emits netcode messages. The single authority. |
| `src/poker-ui.js` | `PokerDomRenderer` + the action panel + pre-game lobby + showdown/winner screens. Reads a view-model, draws the plain-table 2D UI, emits semantic actions. Implements the renderer interface. |
| `game.js` (edit) | New `state === 'poker'`; `this.poker = new PokerTable(this)`; entry (`GAME.poker.open()` + temp menu/lobby button); `_frame` render hook; bank integration on join/finish. |
| `mp.js` / `net.js` (edit) | Poker message envelope routing (`pk*` types), host-relay, disconnect→elimination hook. |
| `index.html` (edit) | Poker overlay markup + POLYMER CSS (plain-table look, CSS-drawn cards). |

---

## 5. Card & deck model

- A card is a compact value — `{r, s}` with `r` ∈ 2..14 (J=11, Q=12, K=13, A=14) and `s` ∈
  `{c,d,h,s}`; plus `cardStr`/`parseCard` for tests/logs (e.g. `"As"`, `"Td"`).
- `makeDeck()` → 52 unique cards. `shuffle(deck, rng)` = Fisher–Yates using the injected RNG.
- **RNG:** host uses a fresh seed per hand (from the unseeded gameplay helpers or
  `makeRNG`); the seed is retained so a **provably-fair log** can reveal it post-hand (future
  toggle). The deck is a stack; dealing/burning **pops** cards so remaining-card reasoning
  (outs) is real.
- **Burns:** 1 card burned before the flop, turn, and river (casino procedure). Burned cards
  are removed but never revealed; they do not change outs math (an unknown card is unknown
  whether in stub or burn pile) — included purely for realism and the provably-fair log.

---

## 6. Hand evaluator (correctness spec)

`evaluate7` must return a fully-ordered rank so `compare` is a total order. Categories,
high→low:

1. **Straight flush** (incl. **Royal** = T-J-Q-K-A suited; A-2-3-4-5 "steel wheel" lowest).
2. **Four of a kind** (+ kicker).
3. **Full house** (trips rank, then pair rank).
4. **Flush** (5 highest of the suit, compared card-by-card).
5. **Straight** (incl. the **wheel** A-2-3-4-5 where Ace plays low).
6. **Three of a kind** (+ 2 kickers).
7. **Two pair** (high pair, low pair, + kicker).
8. **One pair** (pair, + 3 kickers).
9. **High card** (5 highest).

Rank shape: `{cat: 0..8, ranks: [...]}` where `ranks` is the ordered tiebreak vector so two
hands compare by `cat` then lexicographically by `ranks`. `bestOfMany` evaluates each live
player's 7 cards and returns comparable ranks for `pot.awardPots`.

**Must-test edge cases:** wheel straight & wheel straight-flush; Ace-high straight (Broadway);
flush beats straight; full house trip/pair ordering; four-of-a-kind kicker from the board;
two-pair kicker; best-5-of-7 picks the right 5 (e.g. board pair + pocket pair); identical
hands → exact tie (chop); counterfeited kickers play the board.

---

## 7. Pots, side pots, splits

- During a hand each player accumulates `committed` chips. At showdown, `buildPots` turns the
  committed amounts into **layered pots**:
  - Sort distinct all-in commit levels ascending. Each "level" forms a pot = `Δlevel ×
    (number of players who committed at least this level)`. A pot is **contested only by
    players who reached that level and have not folded**.
  - Folded players' chips stay in the pots they contributed to (dead money) but they win
    nothing.
- `awardPots` resolves **each pot independently**: among eligible (non-folded) contenders, the
  best `handeval` rank wins; **ties chop** the pot equally.
- **Odd chips:** when a pot doesn't divide evenly among `k` winners, the remainder chips are
  handed out one at a time starting from the **first seat clockwise from the button** among the
  tied winners (standard casino rule). Applied per pot.
- Uncontested pot (everyone else folded) → sole remaining player wins without showdown; cards
  are not revealed (mucked).

**Must-test:** two players all-in for different amounts + a third covering both → main + one
side pot, awarded correctly; three-way layered all-ins; a folded player's dead money included
in the right pots; tie chop with odd chip to the correct seat; side pot won by a different
player than the main pot.

---

## 8. Hand state machine (`holdem.js`)

### 8.1 Order of play
```
SETUP → post blinds → deal hole → [PREFLOP betting]
→ burn+flop → [FLOP betting] → burn+turn → [TURN betting]
→ burn+river → [RIVER betting] → SHOWDOWN → award → END
```

### 8.2 Button & blinds
- **Multi-way (3+ active):** SB = first active seat left of button; BB = next active seat.
  Preflop first to act = first active seat left of BB (**UTG**). Postflop first to act = first
  active seat left of button.
- **Heads-up (exactly 2 active):** **button posts SB and acts first preflop**; the other posts
  BB and acts first postflop. (Real rule — engine must special-case this.)
- Blinds are posted up to a player's stack (short stack posts all-in for less). No antes in v1.

### 8.3 Betting actions & legality
`legalActions(state)` for the player to act returns:
`{ canFold, canCheck, canCall, callAmount, canRaise, minRaiseTo, maxRaiseTo }`.
- **check** only when `callAmount === 0`.
- **call** matches the current bet (capped at stack → all-in).
- **raise(to)** uses **raise-to total** semantics; `to` must be in `[minRaiseTo, maxRaiseTo]`
  (`maxRaiseTo` = player's stack + already committed this round; No-Limit).
- **all-in** = bet/raise/call for the entire stack.
- **fold** always legal when facing a bet.

### 8.4 No-Limit min-raise
- Minimum legal raise increment = the **size of the largest bet or raise so far this round**
  (preflop the BB counts as the opening bet). `minRaiseTo = currentBet + lastRaiseSize`.
- **Incomplete all-in does not reopen betting:** if a player goes all-in for **less than a
  full raise** over the current bet, players who have **already acted** and are not now facing
  a full raise may only **call or fold** (cannot re-raise). Players who have not yet acted are
  unaffected. The `lastRaiseSize` is not increased by an incomplete all-in.

### 8.5 Big-blind option
- Preflop, if action returns to the BB with no raise (everyone limped/called), the BB may
  **check** (close the round) or **raise**.

### 8.6 Round termination
A betting round ends when **every non-folded, non-all-in player has matched the current bet
and has acted since the last full raise**. Track an `actedSinceRaise` set and `toAct` pointer.
- All-in players are skipped.
- If at any point **≤1 player can still act** (others folded or all-in), the betting is over;
  deal out any remaining streets with no further betting and go to showdown.

### 8.7 Showdown
- All non-folded players' hands are evaluated; pots awarded via `pot.js`.
- **v1 reveals all contesting hands** (simpler and unambiguous). Folded hands are never shown.
- (Future nicety: last-aggressor-shows-first ordering + voluntary muck.)

### 8.8 View-model & privacy
- `publicView(state)` masks every player's hole cards (face-down) except revealed showdown
  hands. `privateView(state, seat)` is `publicView` + that seat's own hole cards.
- The host sends only the relevant private view to each client; the broadcast snapshot is the
  public view. This is the anti-cheat backbone.

---

## 9. Tournament layer (`tournament.js`)

- **Sit & Go:** fixed entrants (2–6), all pay the same buy-in, all start with an **equal chip
  stack**; play continues until one player holds all chips.
- **Starting stack:** `1500` chips (default).
- **Blind schedule** (SB/BB), advancing **every 8 hands**:
  `10/20 · 15/30 · 25/50 · 50/100 · 75/150 · 100/200 · 150/300 · 200/400 · 300/600 · 400/800
  · 600/1200 · 1000/2000 …` (then keep escalating). No antes.
- **Button:** moves to the next active seat each hand; busted seats are skipped. Heads-up rule
  kicks in automatically at 2 players.
- **Elimination:** a player at 0 chips after a hand is busted (finishing place recorded). A
  player who **leaves/disconnects is immediately eliminated** (their chips are removed from
  play; if mid-hand they auto-fold first).
- **Payout:** **winner-takes-all** — the last player standing receives the whole prize pool
  (`buyIn × entrants`), credited to `meta.bank`.

All defaults (stack, schedule, hands-per-level, timer) are constants at the top of the module
for easy tuning.

---

## 10. Bots (practice mode)

- Bots only ever fill seats in **solo practice** (never in a live PvP money game).
- `botAction` is a pure heuristic: estimate hand strength (preflop chart-ish via `handeval`
  on hole + later equity via `odds.js`), weigh against pot odds and position, fold/call/raise
  with a bounded bluff probability. Deterministic given a seed (so tests are stable).
- Driven by the host each turn exactly like a human action would be, through the same
  `applyAction` — bots have no special path, guaranteeing they obey the same rules.

---

## 11. Odds / outs widget (`odds.js`)

- Optional, toggleable in Settings. **Default: on in practice, off in money (PvP) games**
  (a training aid for solo; off by default at the real table). Always user-overridable.
- `equity(hole, board, nOpp, iters, rng)` runs a Monte-Carlo: deal random opponent holdings +
  remaining board from the live deck, evaluate with `handeval`, tally win/tie → win%.
- `outs(hole, board)` enumerates which single cards improve the hand to a likely winner →
  integer outs count for the "TV" display.
- Pure and testable: assert known equities within tolerance (e.g. AA vs KK preflop ≈ 81%,
  a flush draw ≈ 9 outs).

---

## 12. Netcode & authority

Reuse the existing envelope `{ t: type, d: data, _r?: true }` and the host-authoritative
pattern. **`hostSim = !mp.active || mp.isHost`** gates the entire poker state machine — only the
host advances it; clients render snapshots.

| Direction | Type | Payload |
|---|---|---|
| Client → Host | `pkjoin` | sit at table + pay buy-in |
| Client → Host | `pkleave` | stand up / leave |
| Client → Host | `pkready` | ready to start |
| Client → Host | `pkact` | `{action, amount}` — host **validates against `legalActions`**; out-of-turn / illegal actions are dropped |
| Host → all | `pksnap` | public view-model (seats, stacks, board, pots, whose turn, timer, blind level, button) — on every state change |
| Host → one | `pkhole` | that seat's two hole cards (private) |
| Host → all | `pkresult` | showdown reveals + payouts + hand-history log |
| Host → all | `pkend` | tournament over + winner + bank credit |

- **Action timer:** host ticks ~30 s for the acting player (like the revive bleed-out bar);
  on timeout it applies **auto check** if legal, else **auto fold**, and broadcasts.
- **Disconnect:** the host's existing peer-drop detection triggers **immediate elimination**
  (auto-fold current hand, remove from play).
- **Host leaves:** the room dies (existing co-op limitation, no host migration). Buy-in
  refund policy on this case — see §15.
- **Solo/practice:** no networking; the same host code runs locally with bots in the other
  seats. One code path for solo and co-op.

---

## 13. Economy / buy-in integration

- Buy-in is deducted from `meta.bank` on `pkjoin` and persisted (`_saveMeta`). Insufficient
  bank → cannot sit (UI greys out unaffordable tiers).
- **Tournament chips are separate** from money: everyone starts with `1500` chips regardless
  of buy-in size. The buy-in only sets the **prize pool**.
- **Prize pool** = `buyIn × entrants`. Winner-takes-all → winner's `meta.bank += pool` on
  `pkend`.
- **Buy-in tiers** (game money): **Low 500 / Mid 2 000 / High 10 000**, plus a **custom
  amount** (min 100, max = player's bank). All seats at one table pay the same buy-in (the
  table's stake), set by the table creator.
- **Practice mode:** no bank deduction, no payout — play chips only.
- Optional `meta.poker = { played, won, biggestPot }` stats (nice-to-have).

---

## 14. UI / rendering

### 14.1 Aesthetic
**Plain, ordinary table — not a casino.** Reference: `docs/poker/reference-table.png` (a
battered, paint-worn Soviet table). v1 draws a simple worn table surface (CSS texture/tint
approximation), bare-wood feel, cards and chip counts laid on top. POLYMER styling for the
chrome (header, panels, buttons). **No green felt, no chip rails, no neon.**

### 14.2 Layout (2D DOM, `'poker'` state)
```
┌──────────────────────────────────────────────────────────┐
│ ИГОРНЫЙ ПРИТОН   Level 3 · 25/50 · Ruka #14 · Pool 4 000   │
│           [s4] brácha 1340      [s5] —                      │
│  [s3] —          ┌────────────────────┐        [s6] —      │
│                  │  🂠 🂠 🂠 _ _        │                    │
│                  │     POT 320         │                    │
│  [s2] Botᵃ 980   └────────────────────┘   [s1 TY] 1180 ◀B  │
│                                              [🂡 🂮]          │
│ ┌ tvůj tah (28s) ──────────────────────────────────────┐  │
│ │ outy 9 · ~35%   [FOLD] [CALL 50] [RAISE ▸ slider/pot] │  │
│ └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```
- 6 seats around an oval, each: name, stack, button/SB/BB chip, current bet, fold/all-in
  state, **active-player highlight + timer ring**.
- Community board (5 slots) + **pot(s)** (main + side pots).
- Your hole cards.
- **Action panel** (only on your turn): Fold / Check-or-Call (with amount) / Raise (slider +
  presets: min, ½ pot, pot, all-in), validated against `legalActions`.
- Optional **odds widget** (outs + win%), toggleable.
- **Pre-game lobby:** pick buy-in tier/custom, see seated players, ready up; host starts at ≥2
  ready.
- **End screens:** showdown reveal (flip cards, highlight the winning 5), tournament-over
  winner banner + bank credit.
- Cards are **CSS/canvas-drawn** (rank + suit), crisp and themeable — no card images/models.

### 14.3 Swappable renderer (be-ready-for-3D)
A minimal renderer interface decouples logic from presentation:
```
interface PokerRenderer {
  mount(rootEl)             // build/attach
  render(viewModel)         // draw current public view + my hole cards
  promptAction(legal, cb)   // show controls; cb(action) on choose
  showResult(result)        // showdown / winner
  unmount()
}
```
- **v1:** `PokerDomRenderer` (this spec).
- **Future:** `PokerSceneRenderer` — a THREE scene with an ordinary table mesh, **voxel/GLB
  chip stacks and card meshes** (built via the **`modelgen`** harness), consuming the *same*
  `viewModel` and emitting the *same* actions. Selectable via a setting. **No poker-logic
  changes required.**

---

## 15. Entry point

- **v1 (now):** opened via `GAME.poker.open()` (console) and a **temporary button** in the
  main menu / co-op lobby. Closing returns to the prior state.
- **Future ("propojíme pak"):** a **secret world prop** (a back-room table at a hidden den
  location) that the player interacts with (E) to sit down — wired once the 3D den exists.

---

## 16. Edge-case policies

1. **Aborted tournament:** if it **never started** (too few ready / table dissolved
   pre-start) → **refund** every seated player's buy-in. If a **running** tournament dies
   because the **host left** → **refund the still-seated** players their buy-in (already-busted
   players have lost). No winner is paid in that case.
2. **Burn cards:** **on** (casino realism). They do not affect outs/odds math.
3. **Practice mode:** **no** effect on `meta.bank` (play chips only).
4. **Short all-in blind:** a player too short to cover a blind posts all-in for less; a side
   pot forms normally.
5. **Everyone folds to the BB preflop:** BB wins the blinds uncontested (no showdown).

---

## 17. Testing plan

**Node (`tests/poker/`, zero-dependency `node --test`):**
- `handeval.test.mjs` — all 9 categories; wheel & Broadway straights; straight flush incl.
  steel wheel; flush card-by-card; full-house ordering; quads kicker; two-pair kicker;
  best-5-of-7 selection; exact-tie detection; play-the-board; **property test** over random
  7-card hands (total-order invariants).
- `pot.test.mjs` — main+side-pot construction for layered all-ins; dead money from folders;
  tie chop with odd-chip to the correct seat; side pot won by a non-main-pot winner.
- `holdem.test.mjs` — blind posting (multi-way + heads-up); button rotation; `legalActions`
  correctness; min-raise + incomplete-all-in-doesn't-reopen; BB option; round termination;
  all-in skip; fold-to-one ends hand; a full scripted hand to showdown.
- `tournament.test.mjs` — blind escalation by hand count; bust elimination; button skipping
  busted seats; heads-up transition; winner-takes-all payout; immediate-elimination on leave.
- `bots.test.mjs` — `botAction` returns only legal actions across many random states.
- `odds.test.mjs` — known equities within tolerance (AA vs KK ≈ 81%; flush draw ≈ 9 outs).

**Browser (manual, per repo convention):**
- **Solo practice:** play a full tournament vs bots end-to-end; **0 console errors**; rules
  feel correct; bust/win flow + (no) bank impact verified.
- **2-tab co-op** (WebRTC, two browser tabs on one machine): host + client heads-up SNG;
  verify **hole-card privacy** (client never receives the host's cards in `pksnap`); action
  validation; the 30 s timer; disconnect → elimination; winner's `meta.bank` credit.

---

## 18. File manifest

**New — pure core (`src/poker/`):** `cards.js`, `handeval.js`, `pot.js`, `holdem.js`,
`tournament.js`, `bots.js`, `odds.js`.
**New — thin layer:** `src/poker-table.js` (host orchestrator), `src/poker-ui.js` (DOM
renderer + screens).
**New — tests (`tests/poker/`):** `handeval`, `pot`, `holdem`, `tournament`, `bots`, `odds`
`.test.mjs`.
**New — docs:** this spec; `docs/poker/reference-table.png`.
**Edited:** `game.js` (state, `this.poker`, entry, render hook, bank), `mp.js` / `net.js`
(`pk*` routing, disconnect hook), `index.html` (overlay markup + POLYMER CSS), `ui.js`/Settings
(odds-widget + future renderer toggle).

---

## 19. Future work (out of v1 scope)
- 3D `PokerSceneRenderer` + table/chip/card models (via `modelgen`).
- The secret-den world prop + interaction.
- Cash (ring) games, multi-table, antes, rake, host migration, reconnect-without-bust.
- Provably-fair seed reveal UI; full hand-history browser; poker stats screen.

---

## 20. Open questions
None outstanding — all design decisions resolved during brainstorming (see §2, §16). Concrete
numbers in §9/§13 are defaults chosen for v1 and are trivially tunable.
