# Co-op poker: the card deck is the HOST's choice (table-wide)

**Date:** 2026-06-15
**Status:** implemented (branch `feat/poker-host-card-deck`)

## Problem

Card-back ("deck") skins were already a single global value (`_back` in
`src/poker/cardbacks.js`), but in co-op they were **never synced**: the host
rendered its own deck and **each client rendered its own saved
`meta.cardBack`** (applied in `enterCoopClient`). Players around the same table
therefore saw *different* card backs. Chip skins are deliberately per-player
(PR #72); the card deck, being a shared table object, should not be.

## Goal

In co-op the **whole table plays with the HOST's deck**, and only the host
picks it. Chip skins stay per-player. Solo play is unchanged.

## Design

Card back is **table-wide = the host's choice**, mirroring how the host already
owns every other authoritative bit of table state. It is *not* promoted to a
per-player map like chip skins.

### Sync (host-authoritative), `src/poker-table.js`
1. **`pkstart` invite** carries `cardBack: getCardBackSkin()` — the host's deck
   ships with the seat invite.
2. **`enterCoopClient(d)`** applies the host's `d.cardBack` instead of the
   client's own `_applyCardBack()`. The value is validated against the registry
   (`CARD_BACKS[id] ? id : 'default'`) so junk/missing falls back deterministically.
   The client's own saved `meta.cardBack` is **not** overwritten (their solo
   preference survives).
3. **`_payloadFor(id)`** (every personalised snapshot) re-states
   `cardBack: getCardBackSkin()`, and **`onSnap`** re-applies it when it changes —
   so a late joiner / re-sync always converges on the host's deck.
4. **`openCoop`** calls `_applyCardBack()` up front, so the host's *saved* deck is
   the live global that `pkstart`/snapshots broadcast even if the host never opens
   the picker. (`_dealChips` already re-applies it from `meta.cardBack`, so the
   host's pick — which the lobby picker writes to both the global and `meta` —
   persists through the deal.)

### UI, `src/poker-ui.js`
- The co-op lobby (`showCoopLobby`, host-only) relabels the picker
  **"Table deck:"** and adds a permanent sub-line *"Everyone at the table plays
  with your deck."* The dynamic `#pk-backhint` (lock messages) is unaffected.
- Clients have **no** poker lobby picker in co-op (they are pulled straight in by
  `pkstart`), so "only the host picks the deck" holds structurally.
- Solo `showLobby` is unchanged ("Card back:").

## Out of scope (deliberate)
- Mid-game deck changes — there is no in-game picker; the deck is fixed at deal,
  so the initial application (before any card mesh is built) is sufficient. The
  `onSnap` re-apply is a late-join/robustness safety net, not a live re-skin of
  already-built meshes (`cardBackRev()` stays unused).

## Tests
`tests/poker/coop.test.mjs` (node, renderer-less):
- the `pkstart` invite **and** every snapshot carry the host's deck;
- a client renders the host's deck (overriding its own saved one) without
  overwriting `meta.cardBack`; a junk host deck falls back to `default`.
