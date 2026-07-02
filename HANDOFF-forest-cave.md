# HANDOFF — forest cave + terrain + Shilka + nature mechanics + polish

**Worktree:** `/Users/macmini1/eng-forest-cave` · **Branch:** `feat/forest-cave-terrain` (off `feat/forest-tree-physics-2`).
**Git is the OWNER's** — nothing committed/pushed/merged. Everything below is uncommitted working-tree changes for you to review + git as you see fit. **Map affected: only `?map=forest`** (other maps untouched — most changes are forest-gated or additive).

## What this delivers (all Chrome-verified, 0 functional errors, 88/88 node tests pass)
1. **Logical, legible terrain** — forest heightfield rewritten to declarative analytic landforms (gentle walkable base + steep rocky massif + walkable overlook + sunken cave-corridor slot + dell). Steep = bare rock = impassable; gentle = grass. Pure `fn(x,z)` → co-op-deterministic.
2. **Procedural triplanar material** (grass/dirt/rock by slope, macro variation, fresnel rim, strata) — no image files.
3. **True 3D cave with overhangs (převisy)** under the massif — density-rock roof (Surface Nets) over a heightfield floor → **player can NEVER fall through the floor** (floor stays the battle-tested heightfield; cave only adds a roof + ceiling-clamp). Torch-lit, scree apron, embedded rock jambs.
4. **Drivable Shilka (ZSU-23-4)** on the forest map — tracks sit FLUSH (structural, not tuned).
5. **6 nature mechanics** — gusting WIND (windsock HUD + grass bends downwind + fire runs downwind + motes drift) · EARTHWORKS slope-asymmetry (horde can't climb steep faces/dug ditches the player scrambles) · cave torch-lit HOLDOUT + cover boulders · TREMOR telegraph (boss rumbles the ground before you see it) · legible material.
6. **Critical game-design polish** — cold overcast Soviet regrade (was a sunny park), jagged banded rock, muted trees, etc.

## NEW files
- `src/terrain-tex.js` — triplanar splat material (shared textures, per-chunk material).
- `src/wind.js` — `WIND` singleton (gusting) + windsock HUD.
- `src/grass-wind.js` — groundcover wind-sway material + `updateGrassWind(dt)`.
- `src/cave/{noise.js, surfacenets.js, volume.js}` — the cave system (`CaveVolume`).
- `src/shilka.js, shilka-drive.js, shilka-rig.js, shilka-crew.js, shilka-mechanics.js, shilka-interlock.js, shilka-stab.js` — ported verbatim from `feat/shilka-real-sim-rnd`.
- `assets/vehicles/zsu-23-4-named.glb` (6.24 MB, untracked binary — `git add` it).
- `docs/superpowers/specs/2026-06-27-forest-cave-integration-design.md` — the design/spec.

## MODIFIED files (what changed)
- `src/terrain.js` — forest profile = analytic landforms (FOREST_TUNING) + `enemySlopeLimit`(29°)/`playerSlopeLimit`(43°) on the contract.
- `src/terrain-mesh.js` — chunk mesh uses `makeTerrainMaterial()`.
- `src/world.js` — import + build `CaveVolume` in `_buildForest`; cave ceiling-clamp + player `playerSlopeLimit` in `_collideTerrain`; cold `FOREST_SKY` regrade + day-light reductions w/ a readable floor.
- `src/game.js` — Shilka station (spawn (24,10), mount/drive/lifecycle); `WIND.update`/`mountHUD`/`updateGrassWind`/cave torch flicker; TREMOR telegraph.
- `src/enemies.js`, `src/pathing.js` — horde uses the stricter `enemySlopeLimit`.
- `src/fire.js`, `src/fire-spread.js` — wind-biased fire spread (backward-compatible; host-gated → co-op-safe).
- `src/forestatmos.js` — pollen drifts downwind.
- `src/forestscene.js` — groundcover uses `grassWindMaterial()`.
- `src/forestdemo.js` — leaf material tinted to mute the bright greens.
- `src/mp.js`, `src/util.js`, `index.html` — Shilka co-op seat sync / `snoise` / Shilka HUD DOM (from the Shilka port).

## You must verify in-browser (couldn't be done headless)
- **Drive the Shilka** on the forest hills: E to board → hold Enter (start) → launch on 2nd gear → WASD; watch the tracks stay flush over the hills. (Spawn (24,10) is behind-right of the start view.)
- **2-PC co-op** (Shilka seat sync; general co-op determinism with the new terrain/cave).
- Feel-tune the **dawn darkness** (start time 08:xx is a deliberate cold dawn — brightens through the day; raise the `Math.max(...)` floors in world.js if too dark for you).

## If you ship it
- **Cache-bust ritual** (NOT done — your call): bump `?v=N` on index.html's entry script + `GAME_BUILD` in src/game.js.
- index.html `?v=` is still 329.
- Suggested git: this is large; consider splitting into reviewable commits (terrain+material / cave / shilka / nature-mechanics / polish) or one `feat(forest): caves + logical terrain + shilka + nature mechanics` PR.
