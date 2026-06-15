# Poker bet-sizing: remaining-chip count + chip hitbox fixes

**Date:** 2026-06-15
**Status:** implemented (branch `fix/poker-bet-preview-hitbox`)

Player report (with screenshot): while sizing a bet/raise with the slider, the
"remaining chips" count misbehaves — *mostly on larger bets* — and "the whole
hit box" over the chips stops working. Two independent root causes (both
size-dependent), found by two parallel diagnostic agents.

## Bug 1 — the "leaves $" readout never matched the header

The number itself (`maxRaiseTo - raiseTo`) is *arithmetically* the true
post-raise behind-stack — but it is anchored to `maxRaiseTo` (= already-committed
`roundBet` **+** behind-stack), while the HUD header "YOU $" shows only the
behind-stack. The two baselines differ by `roundBet`. It reads as "wrong" worst
on big bets because (a) the raise *target* climbs above the header stack (slider
max = `maxRaiseTo`), so the top of the slider shows "RAISE → 1400 / leaves $0"
while the header says $1390; (b) in re-raised pots `roundBet` is large, so the
phantom gap grows; (c) near all-in the small "leaves" makes the constant gap
glaring. The header also never moved while the 3D stack visibly drained.

**Fix:**
- New pure helper `raiseBreakdown(raiseTo, committed, behind)` → `{cost, leaves}`
  in `src/poker/betsizing.js` (node-tested). `cost = raiseTo - committed` (chips
  that leave now), `leaves = behind - cost` — same value as before, but anchored
  to the header so `header − cost = leaves` reconciles.
- Readout is now `bet $<cost> · leaves $<leaves>`, prefixed `ALL-IN · ` at the max.
- The HUD header **live-drains** to the would-be remaining stack while you size a
  raise (matching the 3D stack columns draining), and returns to the full stack
  at rest. (`poker-ui.js`, `_raiseTo > minRaiseTo` ⇒ previewing.)

## Bug 2 — the live bet heap had no hitbox; trays lost theirs when they grew

- The live raise-preview heap (`_betPreview`) was never a raycast target (no
  `userData.pk`, never in `_hoverTargets`). On a small raise you were really
  hovering the still-intact stack (which *is* a target); on a big raise the chips
  moved into the un-hoverable heap → "the hitbox doesn't work."
- `InstancedMesh` caches its `boundingSphere` once and uses it as a hard raycast
  early-out; the chip code mutated instances but never invalidated it, so any tray
  that **grew** after its sphere was first cached (your stack regrowing as you pull
  the slider back down) lost its hitbox beyond the stale radius.
- The hover **outline** mesh (`_outChips`) was frustum-cullable; its origin-centred
  sphere doesn't cover a tall/wide stack, so the highlight could vanish on big stacks.
- The tooltip went stale during a pure slider drag (the tray mutates in place, the
  cursor doesn't move, so `update()` never re-resolved).

**Fix:**
- `_betPreview` gets `userData.pk = {kind:'chips', scope:'bet', ownerName:'YOU'}`
  and is pushed to `_hoverTargets` each rebuild (invisible ⇒ skipped by the raycaster).
- `setChipTray` sets `im.boundingSphere = null` after mutating instances → three.js
  recomputes it from the current instances on the next raycast. (`poker-chips.js`)
- `_outChips.frustumCulled = false`. (`poker-hover.js`)
- `update()` re-resolves when the held chips tray's `sig` changed (live heap swelling
  / stack draining) even with a stationary cursor; tracked via `_heldSig`.

## Polish — column jitter

As a denomination fully drained during sizing, `layoutChips` re-centred the row on
the *current* column count, so surviving columns jumped sideways every slider tick.
`layoutChips` gains an optional `layoutRef`: column SET + positions come from a
reference ChipSet (your full stack), while `chipSet` only caps how many chips each
column renders — so a draining denom **shortens in place** instead of re-centring
the survivors. Backward-compatible (omitted ⇒ `ref === chipSet` ⇒ identical output).
`_updateBetPreview` passes `layoutRef: this._myStackSet`.

## Deliberately NOT changed
- **Heap ↔ stack overlap** (an agent hypothesis): measured in-browser. The heap is
  largest exactly when the stack is smallest (chips are conserved between them), so
  they don't both have large radii at once. At all-in the stack is empty. For
  realistic ~30-chip stacks `heapR ≈ 0.09`, `centerDist ≈ 0.20` → no overlap. Left as is.
- **`CAP = 256` per denomination**: the conserved economy tops out far below 256 of
  any one colour, so it never bites in practice. Left as is.

## Tests
- `tests/poker/betsizing.test.mjs`: `raiseBreakdown` (the screenshot case, the
  re-raised-pot case, all-in/clamp).
- `tests/poker/chiplayout.test.mjs`: `layoutRef` pins positions (no jitter) +
  backward-compatibility.
- 162/162 node tests pass. Browser-verified (v282): readout + live header drain,
  bet-heap raycast hit resolves to YOU·BET, boundingSphere recomputed, 0 console errors.
