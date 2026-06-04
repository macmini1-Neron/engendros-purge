# Steppe map → 1000×1000 enlargement — design

**Goal.** Double the open-world steppe map (`?map=steppe`) from 500×500 (`HALF=250`) to **1000×1000 (`HALF=500`, 4× area)** so the districts (kombinát, airfield, strongpoint, kolkhoz, secret bunker) stop sitting "moc vedle sebe" (cramped next to each other) and read as distinct places separated by open steppe. Fill the new space with content, keep the wave-shooter combat working everywhere, and keep performance solid with a proper spatial structure.

This is the steppe map only — the `arena` (de_dust2) map keeps `HALF=70`. `world.HALF` is already per-map, set in the map branch of `_buildSteppe()`.

## Decisions (from brainstorming)

1. **Districts: spread + new POIs.** Keep the 5 districts ~their current size, push them apart across the bigger map, and fill the gaps with new small POIs.
2. **Enemy spawn: around the player.** Replace the map-edge-ring spawn with a fixed radius around the player so waves work wherever the player holds a position.
3. **Fog: keep it (320 m).** Distant districts stay hidden in haze and emerge as you approach — discovery/atmosphere, and it keeps far detail cheap.
4. **Roads: a few main routes.** 1–2 main dirt/gravel roads (not a full network), rest wild steppe; new POIs sit along/near them.
5. **Performance: a real spatial grid.** Replace the O(n) loop over `world.boxes` with a uniform spatial grid (O(1) amortized) — the professional, future-proof solution, chosen for quality.

## Design

### ① Scale & frame (`world.js`, `engine.js`)
- `_buildSteppe()`: `this.HALF = 250 → 500`. The ground plane, the impassable mountain border (`span = H*2 + t*2`), and the loot/edge ring all derive from `H`, so they rescale automatically.
- **Mountain border peaks** (`for i<64`) and the **visual boulder scatter** (`for i<220`) cover a perimeter/area that is now 2×/4× larger → scale their counts to keep density: peaks `64 → ~128`, visual boulders `220 → ~880`, collidable open-ground boulders `24 → ~96`.
- `engine.js`: camera `far 1000 → 1200` (map diagonal is ~1414, but fog at 320 hides the far corners regardless). **Fog unchanged** (`THREE.Fog(0xdfd6bd, 70, 320)`).

### ② District repositioning (`world.js _buildSteppe`)
Each district is one self-contained `buildX(world, ox, oz)` call (internals are relative to `ox,oz`), so spreading them = changing the 5 origins **plus** their boulder-exclusion rectangles and any pushed `lootSpots`. Player spawns at world (0,0).

Proposed spread (quadrants, kombinát central) — **finalised in the HTML-map step, this is the starting point**:

| District | Now | Proposed (1000 map) |
|---|---|---|
| Kombinát (hub, near spawn) | (0, 0) | **(0, 0)** — unchanged |
| Airfield (big complex) | (0, 0) [N region] | **(0, +250)** far N |
| Strongpoint | (−150, −90) | **(−330, −300)** far SW |
| Kolkhoz «Красный степной» | (0, −165) | **(+300, −300)** far SE |
| Secret bunker «Объект 1180» | (170, 15) | **(+360, +150)** far E/NE |

Every move must also shift that district's boulder-exclusion `if (x>… && z>…) continue;` and its `lootSpots.push(...)` by the same delta. Spawn-ring `spawns` array stays (loot fallback).

### ③ Spatial grid (`src/grid.js` — NEW; refactor `player.js`, `enemies.js`, `weapons.js`)
A uniform grid is the core perf piece. `world.boxes` (AABB colliders — all collision, step-up, and hitscan use it; there is no navmesh) grows with the map + content, and today every query is O(n).

- **`class SpatialGrid`**: cell size **16 m**. `build(boxes)` buckets each box into every cell its XZ-AABB overlaps (`Map<"cx,cz", box[]>`). `addBox(box)` for runtime additions; `queryAABB(min, max)` returns the de-duped boxes in the overlapped cells; `raycast(origin, dir, maxDist, filter)` does a 2-D DDA cell walk testing `rayAABB` per box with early-out.
- **Build timing:** after `world.boxes` is fully populated at the end of world setup. **Incremental adds are required** — tank wrecks (`world.js:334`) and player fortifications (`BuildManager`, `world.js:447`) push colliders mid-game; route those through `grid.addBox`.
- **Refactor callers** (preserve exact behaviour): `Player` movement collision + step-up → `grid.queryAABB(sweptAABB)`; `EnemyManager` enemy-vs-world collision → `grid.queryAABB` per enemy; `WeaponSystem` hitscan (currently `rayAABB` over all boxes) → `grid.raycast`. Keep `world.boxes` as the source of truth; the grid is an index over it.
- **Co-op:** world geometry is seeded/deterministic, so host and client build identical grids; no sync needed. Damage/spawn stay host-authoritative.

### ④ Enemy spawn around the player (`waves.js`)
Replace the current `pick(world.spawns)`-farthest-from-player (edge ring → 500–950 m away on the big map) with: spawn at `player.pos + (cosθ, sinθ)·R`, `R = randRange(75, 120)`, random θ **biased outside the view cone** (behind/flanks so enemies don't pop in view); re-roll up to ~6× if the point lands inside a collider (`grid.queryPoint`) or off-map (clamp to `HALF`). Co-op: host spawns relative to the nearest/most-central live player. Mini-boss/boss spawns use the same helper.

### ⑤ Content for the gaps (`src/roads.js` / `src/pois.js` — NEW, or extend `props.js`)
- **Boulders:** scaled counts from ①.
- **Roads:** 1 main N–S dirt/gravel road through the centre (spawn → kombinát → airfield) + optionally one E–W spur. Flat textured ground strips (like the airfield taxiway slabs, dirt palette), no colliders; lined with telegraph poles (thin colliders) for navigation.
- **New small POIs** (a few boxes each, NOT full districts) along the roads / in gaps: a fuel station (АЗС), a bus stop (автобусная остановка), a checkpoint booth (КПП-style), a wrecked vehicle convoy, a lone well + windpump, a roadside shrine/obelisk. Each is a tiny builder; placed with their own small boulder-exclusions.

### ⑥ HTML map (`interactive-real-v6.html`)
Data-driven SVG mirroring world coords — update the scale to 1000×1000, the 5 district positions, the roads, and the new POIs so it matches the real map.

## Build order (phased — the scope is large)
- **Phase A — Core enlargement.** `HALF=500`, camera far, reposition the 5 districts (+exclusions +lootSpots), scale boulders/border, spawn-around-player. *Verify:* districts spread, no overlaps, waves spawn near the player, FPS baseline.
- **Phase B — Spatial grid.** New `grid.js`; refactor player/enemy/weapon queries + incremental `addBox`. *Verify:* collision/step-up/hitscan unchanged (no clipping, shots register), FPS up vs Phase A.
- **Phase C — Roads + POIs.** Main road(s) + the small POI builders. *Verify:* roads read, POIs placed cleanly, no exclusion gaps.
- **Phase D — HTML map + polish.** Update the HTML map; final FPS + feel pass (fog, travel, discovery).

## Files
- **New:** `src/grid.js` (SpatialGrid); `src/roads.js` + `src/pois.js` (or one `src/openworld.js`).
- **Modified:** `src/world.js` (HALF, districts, exclusions, boulders, border, grid build/addBox), `src/engine.js` (camera far), `src/waves.js` (spawn), `src/player.js` + `src/enemies.js` + `src/weapons.js` (grid queries), `interactive-real-v6.html`, `index.html`+`src/game.js` (cache-bust).

## Risks
- **Grid refactor is delicate** — it must reproduce the exact O(n) collision/raycast results. Mitigate: refactor one caller at a time, verify in-game after each (clip test, step-up, shoot test); keep `world.boxes` authoritative so a regression is easy to compare against.
- **Runtime collider adds** (wrecks, fortifications) must hit `grid.addBox` or they'll be non-collidable.
- **Repositioning** must update every reference per district (origin + exclusion + lootSpots); a missed one = boulders inside a district or loot in the wrong place.
- **Boulder/perf:** with the grid, 4× boulders-as-colliders is fine; still measure FPS (Phase A vs B) to confirm the grid pays off.
- **Co-op:** verify enemy spawn-around-player picks a sensible anchor with 2+ players; world grid is deterministic so no desync expected.

## Out of scope
Aircraft re-detailing (deferred earlier), vehicles for travel, a full road network, AI navmesh/pathfinding changes beyond what the grid enables.
