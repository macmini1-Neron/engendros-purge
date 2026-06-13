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

## Plan 3b — Co-op netcode (TODO)

Layer host-authoritative multiplayer on the same `PokerTable`, per the spec §12 and the mp.js
patterns:
- **Messages** (`src/mp.js`, register in the `n.on(...)` block; `src/net.js` `send`/`broadcast`/
  `sendTo` already exist): client→host `pkjoin`/`pkleave`/`pkready`/`pkact`; host→all `pksnap`
  (public view), host→one `pkhole` (private cards), host→all `pkresult`/`pkend`.
- **Authority:** only the host advances the state machine (`hostSim = !mp.active || mp.isHost`).
  Host validates every `pkact` against `legalActions`; clients render `pksnap` + their own
  `pkhole` (the renderer already consumes a view-model and never needs other players' cards).
- **Seating:** humans fill seats; **no bots in money games** (bots are practice-only). The lobby
  picks a buy-in (tiers 500/2 000/10 000 + custom) deducted from `meta.bank` on join; winner-
  takes-all credit on `pkend`.
- **Disconnect → immediate elimination:** register `this.net.onDisconnect = (peerId) =>
  this.game.poker.onPeerDisconnect(peerId)` → auto-fold + bust that seat.
- **Aborted-tournament refunds** per spec §16.
- **Verify:** 2-tab WebRTC (host + client) heads-up SNG; confirm hole-card privacy (client never
  sees the host's cards in `pksnap`), action validation, timer, disconnect→elimination, winner
  bank credit.

---

## Future (Plan 3c+, out of scope)
- `PokerSceneRenderer` (THREE 3D table/chips/cards via the `modelgen` harness) — drop-in for
  `PokerDomRenderer`, same view-model + actions.
- The secret-den world prop + interaction (sit at a back-room table to open poker).
- Odds/outs widget toggle, hand-history/provably-fair log, poker stats screen.
