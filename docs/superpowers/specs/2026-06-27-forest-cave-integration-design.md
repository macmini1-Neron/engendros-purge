# Forest map: logical terrain + solid collision + true caves + Shilka + nature mechanics

**Date:** 2026-06-27 · **Branch:** `feat/forest-cave-terrain` (worktree `/Users/macmini1/eng-forest-cave`, off `feat/forest-tree-physics-2`)
**Author:** Claude (autonomous, owner away on trip) · **Git:** owner's job — NOTHING committed/pushed here.
**Owner ask (verbatim intent):** put the cave-terrain into the **game's LES (forest) map**; rework the **ground/substrate API to be ULTRA realistic — no sinking, not even a mm of tank track under terrain — really solid ground (not just in code, actually)**; surgically update the forest map with the immersive elements + **caves "na zkoušku"** (as a trial); bring in the **newest Shilka from another branch**; use **only the newest assets** (round trees, nice buildings); add **5–6 new nature-immersion features** with real value (per white-paper + vision); **completely redo the terrain & make it LOGICAL** so passable/impassable zones are legible — "main point". Look at how pro studios (Zelda BotW etc.) do it. Bonus (only if budget remains): demo color polish.

---

## Architecture decision — HYBRID, additive, low-risk

The forest terrain stays a **pure heightfield** `terrainHeightAt(x,z)` (terrain.js) so **all existing systems keep working byte-identically** (chunk mesh + LOD + sim-worker, player/enemy collision, `dig.js` deform, flowfield nav, prop/loot/projectile seating, co-op determinism). We do three things on top:

1. **Redesign the heightfield** into **declarative analytic landforms** (gentle walkable base + a steep rocky massif + ridge/overlook + ravine choke + dell) → *logical* terrain with legible passable/impassable zones. Keep it pure `fn(x,z)`.
2. **Upgrade the surface material** to **procedural metric-triplanar splat** (grass/dirt/rock canvas textures, world-space, no image files), **slope-coupled** to the SAME steepness the collider uses → "a surface that looks like a wall IS a wall" (the legibility invariant). Cliff banding + lip darkening + steep-face rock.
3. **Add true 3D caves** as a **contained density-field volume** (`src/cave/`, Surface Nets) under a hillside **walk-in mouth** — additive, player-only, behind the unified `groundY(x,z,fromY)` seam. This is the "caves na zkoušku" — real overhangs, low blast radius.

This reconciles the owner's repeated explicit ask for **true caves/overhangs** (a user override of the older committed "heightfield 2.5D, no carved caves" spec) with the rest of the **locked vision** (triplanar material, gentle base + analytic landforms + rock-massif drama, legibility, co-op-pure, 144 fps, never `scene.add` a runtime light).

## The collision/ground API rework (the #1 ask: NO sinking)

Unify on **`groundY(x, z, fromY=+∞)` = "topmost solid surface ≤ fromY"** (design-doc seam, backward-compatible):
- default `fromY=+∞` → returns the heightfield surface → **all ~30 existing callers unchanged** (loot/prop/spawn/projectile settle, enemy grounding).
- a caller that can be *inside a cave* (player vertical, Shilka wheels optionally) passes its current Y → descends onto the cave floor / under an overhang.
- Cave volume contributes extra surfaces only inside its AABB; elsewhere it's a no-op.

**Hardening (no sink, not a mm):**
- Player vertical: exact floor snap every frame (already at world.js:400/423) + a **swept floor clamp** so fast descent can't tunnel through a thin crust; cave wall/ceiling push-out along ∇f inside the cave AABB.
- **Shilka flush** = the **torsion-bar model that already exists on `feat/shilka-real-sim-rnd`** (`_sampleWheelGround()` samples `terrainHeightAt` at 12 wheel pivots → `stepDrive` derives mean height + pitch/roll + per-wheel springs). Port it onto the forest map; tune `rideHeight`/`wheelRadius` so tracks sit **flush** (visual decoupled from collision → rolls on the smooth field, never catches a facet).

## Legibility ruleset (Zelda BotW / Valheim / Horizon, via research)

One source of truth: `slope = acos(clamp(normal.y,0,1))`. Same number drives **material** and **movement**:

| Band | Slope | Player | Enemy | Material |
|---|---|---|---|---|
| WALK | 0–25° | full speed | full | grass, bright |
| SLOW | 25–38° | 1.0→0.5 | slowed | dirt/scree, desaturating |
| SLIP | 38–50° | sprint-only, slides | **BLOCK (~40°)** | scree + foot-ledges |
| WALL | >50° | block | block | bare grey rock, no handholds |

**Invariant:** never grass on an unwalkable slope, never wall-rock on a walkable one. **Enemy limit (~40°) < player limit (~50°)** → a player-dug ~45° ditch wall is an impassable horde wall the player can still scramble — turns legibility into a weapon (earthworks mechanic). Cliff strata banding = "climbable in stages"; smooth face = "sheer". Lip AO darkening = anti-walk-off. Cave mouth = silhouette break + interior fog gradient + rim-light at the lip.

## Newest assets (nothing old)

Forest map already scatters **round `makeTree`** trees (forestdemo.js) + groundcover (forestscene.js) + the `_smoke` «ПРОВЕРКА» triplanar-brick cottage + crates + colonnade + boulders/deadwood. Keep these; add **rock-as-massif** modeled outcrops scaled onto the steep massif (vision's fix for "failed noise mountains") + cave-mouth framing props. Verify all builders are the newest (makeTree, buildings/_smoke, modelgen rocks).

## 5–6 nature-immersion mechanics (ranked, max synergy with existing systems)

1. **Wind field** — global gusting `wind{dir,speed}` (HUD windsock) → steers foliage sway + smoke/ember drift + fire-spread bias + thrown-arc drift. The enabler. [M]
2. **Caves as light-economy chokepoint holdout** — darkness + interior fog + flares/torch (FX light pool) + reverb audio funnel the horde into the mouth. [M]
3. **Tremor / dust telegraph cues** — heavy-enemy approach & cave-ins shake camera + drop dust → fair-brutal readability where vision fails. [S]
4. **Fire as zone control** — wind-steered fire-spread becomes a tool: wall-of-fire chokepoint denial + smoke LoS screen; enemies take fire damage / deter. [S]
5. **Diggable earthworks → slope-gated horde walls** — dig ditches/ramparts; enemy slope-limit < player's makes a ~45° wall block the horde (collapsible by heavies). [S–M]
6. **Foliage stealth + noise** — existing LoS-hide + a noise axis (sprint/shoot/fell draws horde; crouch-in-bush resets aggro). [S–M]

## Milestones (each verified in Chrome :PORT, 0 console errors, additive)

- **M0** cave modules into `src/cave/` (noise, surfacenets done; density+volume adapted to forest) + node sanity.
- **M1** redesign `forestHeight` → analytic landforms; triplanar splat material with slope legibility. *(logical terrain — main point)*
- **M2** harden collision + `groundY(x,z,fromY)` seam (no sink).
- **M3** wire cave volume into forest map (mesh + cave-aware collision + mouth + lighting). *(caves na zkoušku)*
- **M4** newest assets: rock-massif outcrops, cave-mouth framing, verify trees/buildings newest.
- **M5** port Shilka (`feat/shilka-real-sim-rnd`) onto forest map + tune flush (no track sink).
- **M6** nature mechanics 1–6.
- **M7** Chrome verify pass + hero shots + handoff + memory.
- **BONUS** cave-demo color polish (less uniform/bright, thought-through palette).

## Hard constraints (carry through every milestone)
Co-op determinism: terrain stays pure `fn(x,z)` + host-ordered edits. 144 fps Chrome (verify in **Chrome only**, never Safari). No-kitsch: match buildgen brick quality. **Never `scene.add` a light at runtime** → Engine FX light pool. Cache-bust ritual on any deploy (owner's). **Git is the owner's — nothing committed/pushed/merged here.**
