# Poker Integration — Implementation Plan (Plan 3 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans /
> subagent-driven-development. **Plan 3a (solo-playable) is DONE + browser-verified.** Plan 3b
> (co-op netcode) is the remaining step.

**Goal:** Wire the pure poker engine (Plans 1+2) into ENGENDROS PURGE as a playable 2D table —
a `'poker'` game state with a plain-table DOM UI, opened from the menu, runnable solo vs bots
now and PvP-over-co-op next.

**Architecture:** A host-authoritative orchestrator (`PokerTable`) owns a `Tournament` + the
current `holdem` hand, ticks the 30 s action timer, drives bots, and feeds per-seat view-models
to a **swappable renderer** (`PokerDomRenderer`, v1 = 2D DOM, future = THREE). Solo runs the
host path locally; co-op layers `pk*` messages on the same orchestrator. Spec:
`docs/superpowers/specs/2026-06-13-poker-texas-holdem-design.md`.

---

## Plan 3a — Solo-playable (DONE, browser-verified)

**Files**
- Create `src/poker-ui.js` — `PokerDomRenderer`: injects its own CSS, builds the lobby + table
  (opponents row, board, pot, your hole, action panel with FOLD / CHECK·CALL / RAISE slider /
  ALL-IN, timer bar, dealer/SB/BB chips, showdown reveal + winner banner). Plain worn-table
  aesthetic (no casino felt). Peer-supplied names are HTML-escaped (`esc()`) for the co-op step.
- Create `src/poker-table.js` — `PokerTable(game)`: `open()` (lobby), `startTournament({bots,
  mode})`, `humanAct(action)`, `update(dt)` (ticks the shot clock; auto check/fold on timeout;
  drives bots after a ~0.9 s pause; advances hands; `settleHand` → next or `over`), `render()`,
  `leave()`, `_payout()` (practice = no bank; money mode credits `meta.bank`).
- Edit `src/game.js`: import + `this.poker = new PokerTable(this)`; `openPoker(from)` /
  `closePoker()` (mirrors `openFonoteka`/`closeFonoteka`); `_frame` hook `if (state==='poker')
  { poker.update(dt); poker.render(dt); }`; pointer-lock early-return adds `'poker'`; wire
  `click('pokerBtn', …)`.
- Edit `src/ui.js`: register `poker: getElementById('poker')` overlay.
- Edit `index.html`: a **POKER** button on the deployment screen + an empty
  `<div id="poker" class="overlay">` (renderer fills it, like `#music`).

**Decisions baked in:** solo = practice vs AI (no bank impact, per the design — money games are
PvP). Lobby lets you pick 1–5 bots. Shot clock 30 s, bot think 0.9 s, showdown dwell 3.2 s. Seed
from `Date.now()` (browser side — fine; not a sandboxed module).

**Verification (done):** `node --check` on all touched files (clean); isolated headless Chrome
smoke via `poker-harness.html` (a dev-only, gitignored harness that boots ONLY poker — no THREE)
→ **0 JS errors**, all 6 seats render, blinds/button/pot correct, your-turn action panel shows
the right call amount; screenshot confirms the plain-table look. Full engine suite still
50/50.

---

## Plan 3b — Co-op netcode (DONE; loopback-verified, live 2-tab pending)

Host-authoritative multiplayer layered on the same `PokerTable` (roles `solo`/`host`/`client`):
- **Messages** (`src/mp.js` `n.on(...)` block; `src/net.js` `send`/`sendTo` reused): host→all
  `pkstart` (pull clients in + buy-in/names); host→**each** client `pksnap` (a **personalised**
  render payload = `privateView` for that seat — others' holes are `null`, so the wire never
  carries another player's cards); client→host `pkact` (validated against `legalActions`, only
  the actor on their turn); client→host `pkleave`; host→all `pkabort` (host ended → refund).
- **Authority:** only the host runs the engine; clients are thin terminals that render the last
  `pksnap` and forward actions. `forceFold(state, seatId)` (new in `holdem.js`) folds a
  disconnected seat out of turn and resolves the hand.
- **Economy:** money mode. Each player deducts its **own** `meta.bank` buy-in locally (host on
  `startCoop`, client on `pkstart`); winner-takes-all is credited locally on the `over` snapshot
  (`moneyPayout`). Host-abort / lone-survivor walkover refund/pay per spec §16.
- **Disconnect → immediate elimination:** `mp.onDisconnect` → `poker.onPeerDisconnect` (force-fold
  + flag dropped → zeroed out of the next hand; lone survivor triggers a walkover payout).
- **Entry:** a **ПОКЕР** button in the co-op lobby (host-only) → coop lobby (buy-in tiers) → DEAL.
- **Verified:** `tests/poker/coop.test.mjs` loopback (no WebRTC/DOM) — buy-in deduction,
  **snapshot privacy**, wrong-player/out-of-turn rejection, disconnect→walkover→payout, client
  forwards-not-mutates. Full suite **56/56**. Solo browser-smoke still clean after the refactor.
  **Pending:** live 2-tab WebRTC playtest by the brothers (repo norm for co-op).

---

## Future (Plan 3c+, out of scope)
- `PokerSceneRenderer` (THREE 3D table/chips/cards via the `modelgen` harness) — drop-in for
  `PokerDomRenderer`, same view-model + actions.
- The secret-den world prop + interaction (sit at a back-room table to open poker).
- Odds/outs widget toggle, hand-history/provably-fair log, poker stats screen.
