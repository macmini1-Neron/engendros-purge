# Poker polish pass — design

**Date:** 2026-06-16
**Branch:** `poker/polish-pass` (off `origin/main`, post-v283)
**Status:** approved (design), implementation pending

## Context

The Texas Hold'em "Gambling Den" (PRs #62–#79, live at v283) is feature-complete and
already heavily juiced. This is a focused **feel/readability polish pass** — four
independent improvements, each shippable as its own commit. No new systems, no netcode
authority changes. All four are gated behind the existing host-authoritative model where
relevant (none introduce new authoritative state).

Poker lives across `src/poker-table.js` (host state machine + co-op), `src/poker-scene.js`
(3D table render/animation), `src/poker-ui.js` (DOM action UI + injected CSS),
`src/poker-chips.js` / `src/poker-chip-mesh.js` (chip meshes), `src/poker-hover.js` (hover
outlines + tooltips), `src/poker-cards.js`, and the pure engine under `src/poker/`.

## The four items

### 1. Showdown — reveal opponents' cards readably + choreographed

**Problem.** Mechanically the showdown reveal already works: `doShowdown()` builds a
`reveals[]` array of `{id, hole, rank}` for every non-folded player, the host broadcasts it
to all clients in the per-player payload (`result` is sent unfiltered), and the 3D scene
flips those cards to face-up (`setCardFace`). **But it reads badly**: opponent hole cards
lie flat on the felt near the table edge at a small scale, and they snap face-up *instantly,
all at once*, with no flip animation (only a staggered ~90 ms sound). From the player camera
you can barely tell who showed what.

**Approach.**
- **Choreograph the reveal.** Drive a staggered per-player (and per-card) flip-in animation
  for the showdown reveal, reusing the existing card flip-in path + the frame-synced
  `pokerFlip` rising-note SFX (added in #79). Reveal in `revealOrder` (the order the engine
  already implies / last-aggressor-first if available), not all at once.
- **Make opponent revealed cards readable.** At showdown, lift / tilt / scale the revealed
  opponent hole cards toward the camera so the player can actually read them, instead of
  leaving them tiny and flat at the felt edge. Return them to the resting flat state when the
  next hand begins.
- Optional stretch: echo the revealed cards as small pips in the floating player name tag.

**Files.** `poker-scene.js` (reveal animation + lift), possibly `poker-ui.js` (seat tag pips),
`audio.js` only if a new cue is needed (prefer reusing `pokerFlip`).

**Acceptance.** At showdown each remaining player's two cards flip up one after another with
the rising-note cue, and the player can clearly read every revealed hand from the normal
camera. Folded players never reveal. Works in solo; in co-op the reveal renders identically
on every client (data already broadcast — no netcode change).

### 2. UI redesign — refined Soviet-POLYMER

**Problem.** The DOM action UI (`poker-ui.js`, ~137 lines of CSS injected at runtime) already
uses the global POLYMER palette (brass/teal/coral) and fonts (Russo One / Oswald / Rajdhani),
but the hierarchy, contrast, button styling and spacing are merely functional, not polished.
User wants "better font, colors, final nice-touch feel" — **same identity, elevated.**

**Approach.** Pure CSS / minor markup refinement in `poker-ui.js`. No behavior changes.
- Typography hierarchy: Russo One for headers/labels, Oswald/Rajdhani for numeric values,
  applied consistently; tune sizes/weights/letter-spacing.
- Stronger contrast and clearer affordance on the action buttons: FOLD neutral, CALL/CHECK
  green (`--go`), RAISE coral (`--red-2`), ALL-IN visually distinct. Hover/active/armed states.
- Cleaner action-bar grid (presets row, slider/stepper/number, raise/all-in) with better
  spacing and alignment.
- Polish the top HUD chips (LVL / BLINDS / HAND / POOL / YOU) and the showdown banner.

**Files.** `poker-ui.js` (CSS block + the element templates it builds).

**Acceptance.** Side-by-side the new UI reads as the same Soviet-POLYMER family but visibly
cleaner: stronger hierarchy, better contrast, more refined buttons and banner. No regressions
in the action flow (fold/check/call/raise/all-in, slider, presets, shot clock). Verified live
via screenshots.

### 3. SB/BB outline — tighten to hug the puck

**Problem.** The yellow SB/BB hover outline (`poker-hover.js`, color `0xffe066`, an
inverted-hull cylinder over the blind puck) is scaled **1.22× radial and 2.4× tall**. That
leaves an obvious gap around the puck and a tall yellow "tube" sticking up — "it's too big,
too much free space around the model."

**Approach.** Shrink the outline scale (`_Sblind`) so it hugs the puck: cut the radial growth
to a thin rim (≈1.05–1.10×) and the height to roughly puck height (≈1.2–1.4× instead of 2.4×),
so it reads as a tight outline, not a tube with a halo gap. Tune the exact factors live with
screenshots. Optionally align the color toward POLYMER (warm brass-gold) rather than flat
neon yellow. Keep the hover-only behavior (no persistent marker — not requested).

**Files.** `poker-hover.js` (`_Sblind` scale matrix, outline material color).

**Acceptance.** On hover the SB/BB outline tightly traces the puck with no obvious free space
and no tall tube; the tooltip still appears. Chip / card hover outlines unaffected.

### 4. Bet heap — one consolidated heap + floating total

**Problem.** The central pot already renders as a single hovering group with a `$total`
label. The live **bet preview** (the chips for the raise/bet you're sizing) does not get the
same treatment — user wants the pending bet shown as **one heap with its total**, like the
big pool, "not one by one."

**Approach.** Render the live bet preview as a single consolidated heap with a floating
`$total` label, mirroring the pot's group+label code path (reuse it where possible). Keep the
existing hover info-card (`bet $cost · leaves $leaves` from #77) working. Ensure chip
conservation/economy is untouched — this is purely the *visual grouping* of the preview, not
a change to how chips are committed.

**Files.** `poker-scene.js` (bet preview build), `poker-chips.js` (heap layout / label),
`poker-hover.js` (`_betPreview` hover target stays valid after the change).

**Acceptance.** While sizing a bet/raise, the pending chips appear as one grouped heap with a
clear `$total` matching the raise amount, styled like the central pot; hover still shows the
cost/leaves breakdown. No change to committed-chip economy.

## Out of scope

- No netcode authority changes, no new `pstate`/message types.
- No change to engine rules, bet sizing math, or chip economy.
- No UI theme change away from Soviet-POLYMER (item 2 is a refinement, not a re-theme).
- Persistent SB/BB markers (item 3 stays hover-only as today).

## Verification

Manual / in-browser per repo convention (no test suite). Drive a solo Sit & Go vs bots from
the console (`GAME.openPoker(); GAME.poker.startTournament({bots:5})`; act via
`GAME.poker.humanAct(...)`; bots tick while `GAME.state === 'poker'`), reach showdown, and
screenshot each item. Cache-bust ritual (`?v=` + `GAME_BUILD`) before the PR ships.
