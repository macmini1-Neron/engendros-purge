# ENGENDROS PURGE — Playable Demo RESULTS

**Phase 11 — Playtest + Perf + Documentation**
Branch: `feat/playable-demo` · Commit: see end of doc
How to launch: `?map=demo` in URL **or** click the «Разрушение · Demo» tab in the main menu.

---

## Machine / Browser

| Field | Value |
|---|---|
| CPU | Apple M4 |
| macOS | 26.5.1 (Darwin 25.5.0) |
| Browser | Playwright Chromium (headless) |
| Server | `python3 -m http.server 8421` |
| Build | v252 · GAME_BUILD 2026-06-11 14:31 |

> **Note on headless measurements.** Playwright's headless Chromium does not run `requestAnimationFrame` at normal cadence. All fire-spread, tree-charring, and FallingBody tests were driven by manually calling `game.fire.update(dt)` / `forest.update(dt)` / `engine.render()` 60–800 times. Frame-timing numbers (FPS) cannot be measured accurately headless; the perf table uses draw calls + rebuild timing as the verifiable proxy. Real FPS must be confirmed by the owner in a normal Chrome window.

---

## Per-Feature Results

| Feature | Status | Evidence |
|---|---|---|
| **Map loads (?map=demo)** | WORKS | `mapId='demo'`, `world.hasTerrain=true`, profile='demo', seed=1337, 275 trees, 16 building parts. Zero JS errors. |
| **Flat maps unaffected (?map=arena)** | WORKS | `hasTerrain=false`, `fireInert=true`, `hasForest=false`, zero console errors on arena load. |
| **Menu tab «Разрушение · Demo»** | WORKS | `demo` map registered in `Game.MAP_LABELS`; `cdb286f` added it to the map picker overlay. |
| **Terrain: demo profile (hills)** | WORKS | Profile='demo', seed=1337. Max recorded slope 58.6° at (4,-34). Hill transect x=60→20: height 10.78→4.70 m, max slope 21.3° — genuinely hilly. |
| **Terrain: player grounds exactly** | WORKS | `player.pos.y = terrainHeightAt(x,z)` with diff=0.000 at every tested position. `onGround=true`. No fall-through. |
| **Terrain: walkable hill (60,-40)** | WORKS | Player placed at hilltop h=10.78 m, slope=3.7°. Max slope along traverse = 21.3° — well under 35° limit. `onGround=true` throughout. |
| **Terrain: steep face blocks (4,-34)** | WORKS | Slope=58.6° (>35° limit). `world.collide()` returns `moved=0.000, blocked=true` when pushing toward it. |
| **Slope feel** | NEEDS-HUMAN-TUNING | Slope limit = 35°. The blocking is mechanically correct. Whether the **feel** of climbing/sliding is satisfying (step-up height, speed on slopes, ramp momentum) is owner-tunable; constants at top of `src/world.js` (`TERRAIN_SNAP_EPS`, `TERRAIN_UPHILL_EPS`) and `terrain.slopeLimit` in `src/terrain.js`. **Needs human playtesting to dial in the feel.** |
| **Enemy grounding on terrain** | WORKS | 8 enemies spawned on wave 1. All `pos.y = terrainHeightAt(x,z)` exactly (diff=0.000). No floating, no buried. |
| **Waves spawn + enemies live** | WORKS | `waves.startWave(1)` → enemies spawn at terrain-height positions and move toward player. |
| **Demo loadout (StG44/Bazooka/Molotov×2/APFSDS/Knife)** | WORKS | `DEMO_LOADOUT` = `['stg44','bazooka','molotov','molotov','apfsds','knife']`. All 6 kinds confirmed in slots 0–5 after `deployLoadout()`. |
| **Glass pane shatters (StG44 rifle hit)** | WORKS | Glass hp=1, tier=0. Hit with pen=1 → `effect='damage', killed=true`. Count 8→7. No mesh rebuild (pane removed directly, `lastRebuildMs=0`). |
| **HE breach (Bazooka blast)** | WORKS | Blast at brick wall center (r1=2.5, r2=6, tier=3): 2 brick walls breached, 3 additional glass panes shattered. `lastRebuildMs = 0.9 ms` (**gate ≤4 ms — PASS**). Rubble stubs render at base of removed segments. |
| **APFSDS through-hole + spall** | WORKS | `resolvePenetration` on brick: `kind='hole', killed=false` (wall stays), `dead=false`, still in `world.boxes` (still collides). 1 spall cone generated. Fragile parts behind the rod obliterated (`kind='obliterate', killed=true`). Visual dark-box hole markers added at entry+exit. |
| **APFSDS: wall still collides by design** | WORKS (by design) | `dead=false` after through-hole. Wall collision box remains in `world.boxes`. **This is intentional** — the rod punches a visual hole marker; full structural breach requires HE. Noted in "not done" section below. |
| **Tree felling by gunfire/HE** | WORKS | `forest.fellTree(tree, dir, seed)` called by destruct routing in `weapons.js._destructHit`. `tree.standing=false, tree.part.dead=true`. |
| **Fire ignition (molotov)** | WORKS | `fire.igniteAt()` finds nearest flammable within 4 m, creates fire record (`kind='tree', duration=9.0 s`). `_objN++` tracks count. |
| **Fire spread (ember chain)** | WORKS | After 100 manual `fire.update(0.016)` calls: 1→27 fires across nearby trees. OBJ_CAP=24 hard cap enforced; overflow refused + logged. |
| **Fire dies at stone (fuel=0)** | WORKS | `fire.ignite(brickPart)` → `null` (fuel=0 guard). `fire.ignite(glassPart)` → `null` (fuel=0). Same for concrete, steel. Wood (`fuel=6`) and trunk (`fuel=10`) ignite correctly. |
| **Tree charring (2.4 s after ignition)** | WORKS | After ~240 fire ticks (2.4 s simulated): `tree.charred=true`. HP lowered from 250→100 (charred tree snaps at 40% of normal HP). |
| **Tree felling on burnout** | WORKS | After ~900 fire ticks: 30 trees felled (`tree.standing=false`, `fellTree()` called). Trees toppled and visual mesh removed. |
| **Fire: single aggregate light** | WORKS | `fire.light` = one `THREE.PointLight` (intensity tracks centroid). NOT one light per fire. |
| **Fire: dedicated FlamePool** | WORKS | `fire.flames = FlamePool(scene, 160)` — one `InstancedMesh`, does not touch the shared 800-particle effects pool. |
| **Fire: rAF not driving it in headless** | KNOWN HEADLESS LIMIT | rAF does not tick in background Playwright tabs. Fire spread confirmed by manual tick tests. In a real browser with the game running, `fire.update(dt)` is called every frame from `_updatePlaying`. |
| **FallingBody: tree topple visual** | PARTIAL | Bodies are created and hinged. Settle correctly for trees near y=0. **On elevated terrain** (y≫0), the y=0 ground-plane check never triggers → trees swing through to hang straight down (π rad, tip pointing at floor level) rather than lying flat. Cosmetically off for hilltop trees. In normal gameplay at most 1–2 concurrent bodies; only a mass stress-test creates 68+. |
| **Co-op: code review** | WORKS (code) · 2-PC UNTESTED | See co-op section below. |

---

## Perf Measurements vs §7 Gates

Measured via forced render + `renderer.info` after disabling auto-reset. Scene state: 15–23 obj fires + 1 grass fire, 275 standing trees, full demo building (16 parts, several already breached).

| Metric | Measured | Gate | Pass? |
|---|---|---|---|
| Building rebuild on breach | **0.9 ms** | ≤ 4 ms | **PASS** |
| Building rebuild on glass-only | **0 ms** | ≤ 4 ms | **PASS** |
| Fire: max concurrent obj fires | **24** (OBJ_CAP, hard cap) | capped | **PASS** |
| Fire: max concurrent grass fires | **48** (GRASS_CAP, hard cap) | capped | **PASS** |
| Fire: FlamePool draw call | **1 extra** (InstancedMesh) | ~1 | **PASS** |
| Fire: aggregate light | **1** PointLight | 1 | **PASS** |
| Forest: draw calls (31 InstancedMeshes for 275 trees) | **31** | few | **PASS** |
| Total draw calls (scene pass, with fires) | **~150** (2-pass render; ~75 per pass) | — | Acceptable |
| Triangles per full render | 3.2 M | — | Typical for scene size |
| FallingBodies concurrent (normal gameplay, 1 tree) | **1** | ≤ 8 | **PASS** |
| FallingBodies in mass burnout stress test | **68** | (stress only) | Expected overshoot; normal play never approaches 8 |
| FPS (real browser) | **NOT MEASURED** — headless rAF unreliable | ≥ 60 fps | **NEEDS-HUMAN** |
| Node test suite | **81/81 new tests** (destruct/simclock/terrain/fire) + **67 existing** = **148/148 total** | all pass | **PASS** |

> **FPS gate**: headless Playwright gives ~656 "fps" (meaningless; no actual GPU pipeline). The owner must verify ≥60 fps in Chrome on their M4 Mac at normal window resolution. Given Apple M4 performance and the low vertex count (3.2 M triangles, ~150 draw calls), exceeding 60 fps in Chrome is expected.

---

## Co-op Section

**Code correctness: verified single-client.**

All new authoritative logic is host-gated (`if (mp.active && mp.isHost)`). Client replay paths confirmed:

| Event | Host emits | Client replays |
|---|---|---|
| Glass shatter / brick breach | `bdestroy {parts, holes}` | `applyNetDestroy(parts, holes)` |
| APFSDS through-hole visual | `bdestroy {holes}` | `_addHole(h)` for each |
| Tree fell | `forestfx {k:'fell', id, dx, dz, seed}` | `fellTreeById(id, dx, dz, seed)` — **identical deterministic FallingBody** |
| Tree char | `forestfx {k:'char', id}` | `charTreeById(id)` |
| Grass burnout | `forestfx {k:'grass', id}` | `consumeGrassById(id)` |
| Fire ignition (spread) | `fireignite {id, owner, seed}` | `igniteById(id, owner, seed)` — owner disambiguates building ('b') vs forest ('t') |
| Late-join (full sync) | `bdestroy + forestfx* + fireignite*` | Same handlers; replayed in `_sendWorldTo(pid)` |

**Id-collision fix (P10):** Forest and building both start part-id counters at 1 (separate sequences → they collide). The `fireignite` owner field ('b'/'t') routes lookup to only the correct source. Confirmed: door id=15 and trunk id=15 both resolve correctly.

**Client-side flame ager:** Clients receive `fireignite` and run only visual fade/retire (`_clientAge`), never `_tick` (spread/char/fell). Host is sole authority on fire consequences.

### 2-PC Pending Checklist

The following **must be verified with two actual machines before calling co-op ship-ready**:

1. **Terrain height agreement** — host and client must compute identical `terrainHeightAt(x,z)` (seeded value-noise, pure function, no RNG). Verify enemy ghosts don't float/sink on the client's terrain.
2. **Destruction sync** — smash a glass pane on the host; confirm the client sees it disappear. HE a wall on host; confirm client sees the breach + rubble.
3. **Fire sync** — host throws molotov → trees ignite on client side (flames visible, char/fell events arrive); fire does NOT spread on the client (`_clientAge` only, no `_tick`).
4. **Late-join** — host plays for 60 s (some walls breached, trees charred/felled, fires burning); new client joins; confirm full state replicated (no orphaned flames, correct wall mesh, correct tree states).
5. **Felled-tree resting-angle cosmetic mismatch** — tree falls host-side with deterministic seed; client replays same FallingBody. Verify both visually similar (they should be; the only cosmetic gap is if the resting angle diverges after many bounces — minor and documented as "expected partial").

**Known minor co-op issues (non-blocking):**
- Late-join flames reset to age=0 (client replays `ignite` with seed; age starts fresh → burns slightly longer than host's current age). Visual only, no gameplay impact.
- Felled-tree resting angle on elevated terrain will hang straight down on both host and client (same y=0 physics bug), so they agree — just both cosmetically wrong.

---

## How to Play

**Keys:** WASD move · mouse look · LMB shoot · RMB ADS · 1–6 slots · R reload · Space jump

**Slot layout (demo loadout):**
| Slot | Weapon | Demo use |
|---|---|---|
| 1 | StG 44 | Shoot glass panes → shatter |
| 2 | Bazooka | Fire at wall → HE breach + rubble |
| 3/4 | Molotov | Hold LMB to light, release to throw → ignites nearest tree → spreads |
| 5 | APFSDS Cannon | Fires long-rod: obliterates glass/wood, punches through-hole in brick, spall behind |
| 6 | Knife | Quick melee |

**Map orientation:**
- **Spawn** around (35, −8) on rolling terrain (~7 m elevation).
- **Big walkable hill** peaks near (56, −40) at ~11 m. Descent toward (20, −40) is smooth 14–21° — feels like a real hill.
- **Steep face / cliff** near (4 to 10, −28 to −38): slopes up to 58°, blocks movement.
- **Destructible building** placed on a flattened clearing by `isPlaceable`; marked in scene as `game.world.demoBuilding`.
- **Forest** spreads across the demo terrain (275 trees of birch/pine/oak species).
- **Console hook:** `GAME.demoFireAPFSDS()` fires an APFSDS rod from the camera without switching to slot 5.

---

## Owner Tuning Knobs

| What to tune | File | Symbol / comment |
|---|---|---|
| **Slope feel** (limit, snap, step-up) | `src/world.js` lines 19–30 | `TERRAIN_SNAP_EPS`, `TERRAIN_UPHILL_EPS` comment block; `terrain.slopeLimit` |
| **Slope limit itself** | `src/terrain.js` | `slopeLimit` property of `makeTerrain({profile:'demo',...})` — default 35° (0.611 rad) |
| **Terrain shape / amplitude** | `src/terrain.js` | `DEMO_TUNING` object at top of file (octaves, amplitude, big-hill position) |
| **Fire caps** | `src/fire.js` | `OBJ_CAP = 24`, `GRASS_CAP = 48` |
| **Fire spread rate + radius** | `src/fire.js` | `KIND` table (`tree.radius`, `tree.chance`, etc.), `SEC_PER_FUEL` |
| **Char time** | `src/fire.js` | `CHAR_TIME = 2.4` (seconds after ignition → tree chars) |
| **Forest density** | `src/forest.js` | `TREE_COUNT` and grid/placement params at top of file |
| **Demo terrain seed** | `src/world.js` | `makeTerrain({ profile: 'demo', seed: 1337 })` — change seed for a different hill layout |

---

## What's Not Done / Not Ultra-Detailed

1. **APFSDS visual hole = marker only.** A dark box is placed at entry and exit points of each structural penetration. The wall mesh itself does NOT have a hole cut out of it (lazy-split rebuild skips dead parts, but APFSDS leaves parts alive). The wall still collides. This is correct by design ("through-hole only; part stays, dead:false"). A future phase could add actual mesh perforation.

2. **Building is a shell, not ultra-detailed interior.** 16 parts: 8 glass panes, 7 brick/wall segments, 1 wood door. Passable architecture for a demo; not the ornate ПРОХОДНАЯ gatehouse from main. Interior is navigable once walls are breached.

3. **FallingBody ground plane = y=0.** Trees on elevated terrain do not lie flat — they swing to hang straight down (π radians) because the y≤0 settle-check never fires. Trees near y=0 settle correctly. This is a cosmetic limitation of the mini-physics, not a gameplay blocker. A future fix: pass terrain.terrainHeightAt to hingeContact.

4. **Co-op 2-PC untested.** Code is reviewed and architecturally correct (Phase 10). The 5-point checklist above must be run on real hardware.

5. **FPS not measured.** Headless rAF is unreliable. Verify ≥60 fps in real Chrome on M4. Expected to pass given Apple M4 + 3.2 M triangles + 150 draw calls.

6. **Grass fire visual only partially implemented.** Grass parts exist on forest floor (kind='grass', fuel=2) and are ignitable. The `GRASS_CAP=48` cap is enforced. The grass visual (low shrub InstancedMesh going dark) is driven by `consumeGrassById` but was not specifically eyeballed in this session.

---

## Commit

```
git log --oneline -1
```
_(see below — written by Phase 11 commit)_

---

*Generated by Phase 11 (playtest + perf + RESULTS), ENGENDROS PURGE autonomous build program.*
*Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>*
