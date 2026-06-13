# Poker Game-Flow Core — Implementation Plan (Plan 2 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or
> superpowers:executing-plans. This plan was executed inline and is **DONE + green** (50/50
> poker tests). It is recorded here as the design/contract + test coverage.

**Goal:** The betting state machine, Sit & Go tournament layer, and practice AI that turn the
card-math core (Plan 1) into a playable, rules-correct No-Limit Hold'em engine — still pure and
node-tested, no THREE/DOM.

**Architecture:** Three pure modules under `src/poker/` building on Plan 1
(`cards`/`handeval`/`pot`/`odds`). `holdem.js` runs one hand as a deterministic state machine
driven by `applyAction`; `tournament.js` sequences hands into a Sit & Go; `bots.js` is a pure
policy for practice. Design spec: `docs/superpowers/specs/2026-06-13-poker-texas-holdem-design.md`.

**Run tests:** `node --test 'tests/poker/*.test.mjs'` (50 tests, exit 0).

---

## Module: `src/poker/holdem.js` — one-hand state machine

**Public API**
- `startHand({ players:[{id,stack}], button, sb, bb, rng, deck? }) → state` — sets seats, posts
  blinds, deals hole cards. `deck` (array of `{r,s}`, dealt from the front) overrides the shuffle
  for deterministic tests.
- `legalActions(state) → { seat, toAct, canFold, canCheck, canCall, callAmount, canRaise,
  minRaiseTo, maxRaiseTo }` (or `null` when no one is to act).
- `applyAction(state, { type:'fold'|'check'|'call'|'raise'|'allin', to? }) → state` — validates
  against `legalActions` (throws on illegal), mutates, advances turn/street, runs showdown when
  the hand ends.
- `publicView(state)` / `privateView(state, seatId)` — snapshots; **public hides every hole card**
  (except revealed showdown hands); private adds that seat's own two cards. The anti-cheat boundary.
- `isComplete(state) → bool`.

**State shape** — `seats[]` each `{ id, stack, hole[], committed, roundBet, folded, allIn, acted,
noRaise }`; plus `button, sb, bb, deck, burn, board, street('preflop'|'flop'|'turn'|'river'|
'complete'), toAct, currentBet, minRaise, result, log`.

**Rules enforced (the "1:1 casino" requirements)**
- **Button & blinds:** multi-way SB=button+1, BB=button+2, UTG (left of BB) acts first preflop,
  first seat left of button acts first postflop. **Heads-up:** button posts SB and acts first
  preflop, last postflop.
- **No-Limit min-raise:** a raise must reach `currentBet + minRaise` (the size of the last full
  bet/raise); `minRaise` resets to the big blind each street.
- **Incomplete all-in does not reopen:** an all-in for less than a full raise lets already-acted
  players call/fold but **not re-raise** (`noRaise` flag); players yet to act are unaffected.
- **Big-blind option:** in a limped pot the BB may check or raise.
- **Burns:** one card burned before flop/turn/river.
- **Round termination:** ends when every able player has acted since the last full raise and
  matched the bet; with ≤1 player able to act the remaining streets are dealt out to showdown.
- **Showdown:** best-5-of-7 per non-folded seat → `pot.buildPots`/`awardPots` (side pots, ties,
  odd chips, uncalled-chip return); a fold-to-one wins uncontested with cards mucked.

**Tests (`tests/poker/holdem.test.mjs`, 11):** heads-up & 3-handed blind posting + first-to-act;
preflop legal actions; sub-minimum raise rejected; fold-to-one uncontested; big-blind option;
**incomplete all-in no-reopen**; checked-down chop on a board-playing royal; both-all-in deal-out
with pot conserved; short all-in builds a side pot; hole-card privacy.

---

## Module: `src/poker/tournament.js` — Sit & Go layer

**Public API** — `class Tournament({ players:[{id}], buyIn, rng, startStack?, schedule?,
handsPerLevel? })`:
- `startNextHand() → holdemState` — advances the button to the next surviving seat (after hand 1),
  picks blinds for the level, deals a hand among the alive players. Caller drives the betting.
- `settleHand() → { eliminated, over }` — folds final stacks back, eliminates busts (assigns
  finishing `place`; simultaneous busts ranked by chips committed), detects the winner.
- `tournamentView()` — `{ level, sb, bb, handNumber, button, prizePool, over, winner, players:
  [{id,stack,place}] }`.
- Constants: `DEFAULT_START_STACK=1500`, `HANDS_PER_LEVEL=8`, `DEFAULT_SCHEDULE` (10/20 …
  1000/2000).

**Rules:** equal starting stacks; blinds escalate **by hands dealt** (`floor(handNumber/
handsPerLevel)`, clamped); button moves to the next seat with chips (moving-button
simplification, documented); **winner-takes-all** payout `prizePool = buyIn × entrants` (bank
credit handled by the integration layer); "alive" = `stack > 0`. Chips are conserved across the
whole tournament.

**Tests (`tests/poker/tournament.test.mjs`, 6):** setup/pool/blinds; blind escalation by hands;
button advance; full 2-player run to a single winner + winner-takes-all payout + chip
conservation; full 3-player run assigns places 1..3; bust leaves stack 0 and removes from the
alive ring.

---

## Module: `src/poker/bots.js` — practice AI

**Public API** — `botAction(privateView, legalActions, rng) → action`. Always returns a **legal**
action. Heuristic: preflop strength (pairs / high-card + suited + connected) or postflop
`odds.equity` Monte-Carlo (60 iters), weighed against pot odds and position, with bounded
bluffing. Bots act through `holdem.applyAction` like humans — no special path, so they cannot
break the rules.

**Tests (`tests/poker/bots.test.mjs`, 3):** bots drive a full 3-handed and a full 6-max Sit & Go
to completion with **every action validated legal** + chips conserved; a flopped royal never
folds for free.

---

## Outcome

`node --test 'tests/poker/*.test.mjs'` → **50 tests, 0 failures.** `grep "from 'three'"
src/poker/` → none. The engine plays correct No-Limit Hold'em Sit & Go end-to-end, solo-drivable
by bots, ready for Plan 3 (host-authoritative netcode + 2D renderer + game integration).

## Next plan
- **Plan 3 — Integration:** `src/poker-table.js` (host orchestrator: owns `Tournament` +
  current `holdem`, ticks the 30 s action timer, drives bots, emits per-seat view-models + `pk*`
  messages, handles disconnect→elimination), `src/poker-ui.js` (`PokerDomRenderer` + lobby +
  action panel + showdown screens, plain-table aesthetic), edits to `game.js`/`mp.js`/`net.js`/
  `index.html`, economy (buy-in from `meta.bank`). Verified solo + 2-tab co-op.
