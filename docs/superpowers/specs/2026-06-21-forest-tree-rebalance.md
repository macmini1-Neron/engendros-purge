# Forest tree rebalance — ?map=forest (ForestDemo)

**Status:** owner-approved feel-pass, implementing on `feat/digging-on-forest` (PR #106).
**Goal vibe:** **denser · destructive** — the forest is an environment you actively reshape (shoot trees down, burn stands). Sibling of the dig/collapse rebalance (`2026-06-21` balance pass).

The forest map trees (`src/forestdemo.js` = `ForestDemo`, models from `src/props/generators/tree.js`) were inventoried by 3 explore agents. This spec captures the 5 owner-requested changes with current → target values.

## 1. Hitbox correctness ★ (owner: "hitboxes must be where you shoot")

**Bug (v1):** `_addTree` capped the box height at `min(height, 5.0)` and hugged the trunk (`half = trunkR + 0.12`). Trees are **20–40 m** (forest scale, not GAME_SCALE) with wide leaning crowns → shooting above 5 m or anywhere in the canopy registered nothing.

**First pass** added a guessed canopy box (`clamp(0.18·height, 1.0, 2.5)` half, centred on the BASE). Still frustrating: the cap was 2.5 m but oak/willow crowns are 10–23 m wide, and the box sat over the trunk base while the crown actually sits on the **leaning trunk TOP** (offset several m). So most of the visible canopy still had no hitbox.

**Ultra-precise rebuild — boxes derived from the tree's REAL geometry, not guessed:**
- `tree.js` `makeTree()` now returns **`spine`** (the scaled, leaning trunk centreline) and **`crownAABB`** (the MEASURED leaf-mass envelope — `buildFoliage` + `buildBranches` accumulate every emitted sub-box / limb extent into a bounds object, so the box hugs exactly what's drawn, including the bare branch ring at the crown bottom).
- `_addTree` builds, all `box.tree` → `box.downer = rec` (a hit on any fells the tree), **rotated by the tree's yaw into world AABBs** (`x' = c·x + s·z`, `z' = −s·x + c·z` — THREE `rotation.y`; getting this sign WRONG offset the boxes to the opposite side of the lean and was the main residual miss):
  - **3 trunk bands** that hug the leaning bole (taper-aware radius), **solid** (block movement + can't be shot through).
  - **1 short collar box** at the base (tree.js draws a ~1.8× flared root collar), solid.
  - **1 canopy box** = the rotated `crownAABB` square hull (rotation-safe) + small margin, flagged **`shootOnly`**.
- **`shootOnly` flag** (new): a box the raycast hits but **all movement ignores** — guarded in player collide/headroom/move (`world.js`), the horde collision + crate-avoidance + head-clear (`enemies.js`), and fortification placement (`validateAt`). This also fixed a latent bug: the horde collision loop only checks `b.max.y`, so the old floating canopy box was a **phantom wall** across the whole crown footprint that enemies couldn't path under. A 10–20 m solid box there would be a huge wall — `shootOnly` is what makes a canopy-sized box safe.
- `rec.boxes = [...]` (array); `_dropBox` drops every band + collar + canopy on fell/clear.

**Verified (headless Chrome, `?map=forest`):** **99.3 %** of every standing tree's actual mesh vertices fall inside a hitbox (all species ≥99 %, was ~0 % above 5 m / in the wide canopy); raycast probes at canopy-centre + trunk-mid hit 16/16; felling drops all 5 boxes cleanly, 0 console errors.

## 2. Felling — easier (destructive vibe)

Trunk HP made it tanky (a rifle couldn't fell a grown tree; combined with the hitbox bug, felling felt impossible).

| Crush class | TREE_HP now | target |
|---|---|---|
| 1 sapling (wood) | 30 | **20** |
| 2 grown (trunk) | 110 | **55** |
| 3 oak (trunk) | 200 | **100** |

Result: a rifle fells a grown tree in a short burst; an HMG / explosive / APFSDS instantly. With the hitbox fix you can finally land the shots.

## 3. Fire — payoff

Only **30 %** of fire-killed trees topple (`FELL_PCT` in fire.js); the rest stay standing as burnt snags → a fire has no climax. Spread chain is also conservative.

- `FELL_PCT` **30 → 75** (most burnt trees fall to the ground — a fire LEVELS a stand).
- Tree spread chain **0.34 → 0.45** per tick (fire runs through a stand more readily).

## 4. Char persistence ★ (owner: "a charred birch can't go white again")

**Bug:** `makeTree({ species:'birch', damage:'charred' })` clones the BIRCH cfg (`bark:'barkBirch'` = white) and `damage:'charred'` only strips foliage — it does NOT blacken the bark. So when `dropLeaves`/`fellTree` rebuild a charred tree, a charred (black) birch becomes a **white bare birch** — the char reverts. (`charTree`'s `material.color` tint is per-tree and temporary; the mesh swap throws it away.)

**Fix:** in `makeTree`, when `cfg.damage === 'charred'`, override the palette to charred black for ALL species:
```js
if (cfg.damage === 'charred') { cfg.bark = 'charBlack'; cfg.barkUpper = null; cfg.foliage = 'charBlack'; cfg.fissures = false; }
```
Now any species, once charred, builds with the `charBlack` ramp — black trunk + bare black branches — through every state (standing snag, falling top, stump, resting log). A charred birch stays black forever. (Material stays fresh per-tree via `voxelMaterial()`, so no global tint side-effects.)

## 5. Density — denser (vibe)

`scatter()` plants 116 grown + 34 saplings in 9 stands. Bump for a denser wood (no instancing overhaul this pass — not an owner priority):
- Grown **116 → ~150**, saplings **34 → ~50**, tighter min-spacing. Watch draw calls (each tree is a merged single-draw mesh, ~150 → ~200 + stumps/logs); revisit instancing/LOD only if it bites.

## Out of scope (this pass)
Fallen-log passability (logs still block — 1.5–3 m, no step-over), stump cleanup, instancing/perf, and the `netSnapshot` fall-direction co-op stub (`dx/dz` hardcoded `(0,1)` — a known minor late-join bug). Logged for a later pass.

## Verification
- `?map=forest` in Chrome: shoot a tall tree in the **upper trunk** and in the **canopy** → both register + fell (was: no hit above 5 m). Rifle fells a grown tree in a burst.
- Ignite a stand → most trees topple (≈75 %), spread runs through it.
- Char a **birch**, let it drop leaves + fell → it is **black** at every stage, never white.
- `node --test` green (TREE_HP / fire constants are data; add a charred-bark unit check if cheap).
