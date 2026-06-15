# Poker hole-card dealing animation — design (2026-06-15)

## Goal
At the start of every hand, hole cards must not simply *appear* in front of each
player. The dealer pitches them, **one at a time**, from the **centre of the table**
to each active seat, in the **real two-pass order** (1st card to every player clockwise
from the small blind, then the 2nd card to every player). Cards arrive **face-down**.

This is the first of the Phase-4 poker visual-juice items; it builds on the existing
`_anims`/`_flipInCard` choreography already used for community cards.

## Trigger (co-op-safe, zero new netcode)
`payload.tour.handNumber` is host-authoritative and rides in every snapshot, so it is
identical on every client. The renderer animates a deal-in when, between snapshots:

- `tour.handNumber` **increased** past the last value the renderer saw, AND
- the community board is **empty** (a genuine pre-flop deal — not a mid-hand
  reconnect/late-join, where the board already has cards).

`_lastHandNo` is reset to `0` in `showTable()`, so the **first** hand of a fresh table
animates, while a late-joiner dropped into a hand in progress does not. Each client runs
the animation locally off the snapshot it already receives.

## Dealing order — pure, node-tested
New module `src/poker/dealorder.js` (pure, no THREE):

```
dealOrder(button, n, hasCards) -> [{ seat, pass }, ...]
```

- `button` = seat index of the dealer button, `n` = seat count, `hasCards` = boolean[]
  per seat (skip folded/empty/busted seats that were not dealt in).
- Two passes; within each pass, walk clockwise from the seat left of the button
  (`(button + 1 + k) % n`) over the seats that have cards.
- The returned array is in *pitch order*; its index is the stagger index used for the
  per-card delay + the synced deal click. Stable + deterministic → identical on every
  client. Unit-tested for: heads-up, full ring, folded-seat skipping, button wrap.

## Motion — mirror `_flipInCard`
In `_rebuildDyn`, each active seat's two hole cards are already built at their rest
positions (`onFelt(...)`). When a deal-in is active:

- compute `dealOrder(button, n, hasCards)`;
- for each `{seat, pass}` at pitch-index `i`, animate that seat's hole-card mesh `pass`
  **from the table centre** to its rest transform, via a `Tween` pushed onto `_anims`
  with `delay = i * STAGGER`. A gentle positional arc + a small `easeOutBack` settle on
  landing. Cards travel face-down (rotation preserved; your own card keeps the existing
  click-to-peek mechanic — no auto-flip).
- Tunables (snappy, ~1.0–1.1 s for a 6-handed deal): `FLIGHT ≈ 0.18 s`, `STAGGER ≈ 0.07 s`.

Single shared `_anims` closures, no per-frame allocation (same contract as `_flipInCard`).

## Audio — per-card pitch synced to the landing (research §A: audio-frame sync)
On a deal-in frame, suppress the generic events-based `pokerDeal` burst and instead fire
one `audio.pokerDeal()` per dealt card, scheduled at its landing time (`delay + FLIGHT`).
The clicks therefore track the visible pitch one-for-one.

## Scope / non-goals
- **In:** hole-card deal-in (face-down), the pure `dealorder` helper + tests, per-card
  deal audio.
- **Out (unchanged):** community-card flip-in (already animated); showdown reveal flips;
  chip-throw arcs; any auto-flip of your own cards. Action UI is **not** blocked during
  the ~1 s deal (pre-flop blind posting covers it).

## Files
- `src/poker/dealorder.js` — NEW pure helper (+ `tests/poker/dealorder.test.mjs`).
- `src/poker-scene.js` — deal-in detection (`_lastHandNo`), the deal-in animator, audio sync.
- `src/audio.js` — unchanged (reuses existing `pokerDeal`).

## Verification
- `node --test 'tests/poker/*.test.mjs'` green incl. the new dealorder tests.
- Browser smoke (own headless Chrome, fresh port): solo SNG, 0 console errors; instrument
  `_anims` to confirm a deal-in spawns one fly-in per active hole card in pitch order, and
  no deal-in fires on a mid-hand late-join snapshot (board non-empty).
- Final feel (speed/arc) confirmed by an owner playtest.

## Build location
Isolated worktree `/Users/macmini1/poker-deal`, branch `feat/poker-deal-animation` off
`origin/main` (#71). Independent of the open PR #72 (disjoint files). Cache-bust + PR at
the end.
