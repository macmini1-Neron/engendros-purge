# Underground Mine — seamless "GTA-SA interior" portal (design)

**Map:** `?map=forest`. **Status:** design (owner's uncommitted worktree `eng-forest-cave`, branch `feat/forest-cave-terrain`).
**Builds on:** the monolithic single-field rock + cave (`src/cave/volume.js`) already in this worktree.

## Context / goal

Add an **underground mine** reachable from the back of the forest cave, done as a **GTA San Andreas–style
interior**: the mine is a SEPARATE spatial pocket, and walking through the entrance **seamlessly teleports** the
player into it (no fade, no visible jar) so it just "continues" downward. This is a **mechanic test** — the mine
interior itself is a rough placeholder (walkable, not detailed). The point is the seamless portal + interior
system, and it must work in **host-authoritative co-op**.

Decisions locked with the owner:
- Transition = **completely seamless, no fade** (approach A: *occluded-seam / "airlock" swap*).
- Mine content = **placeholder** (just enough to walk).
- **Co-op supported** (not deferred).

## Why an interior pocket (not a real connected shaft)

The forest map is a heightfield: `terrain.terrainHeightAt(x,z)` returns a ground height for EVERY (x,z), so "under
the ground" is impossible without bypassing it. Rather than model a giant connected underground, the mine lives as
a **separate pocket at a fixed world offset** (ΔY = −1000, same XZ). While the player is inside, collision is
routed to the **interior's own floor/walls**, bypassing the terrain heightfield. This is the GTA-SA interior trick:
a distant self-contained space you teleport into.

## Architecture

### 1. `World.interiorActive` — collision routing
A flag on `World`. `World.collide(pos,vel,r,h,dt)` (src/world.js:389) branches at the top:
- `interiorActive === true` → `_collideInterior(...)`: identical to `_collideTerrain` **except** the ground sample
  uses `this.interior.floorAt(x,z)` instead of `terrain.terrainHeightAt`, and the ±HALF clamp is skipped (the
  interior uses its own bounds). Man-made `world.boxes` step-up is **reused unchanged** — the mine's wall colliders
  are ordinary boxes at y≈−1000 (they can't interfere with the surface, where the player is never at −1000).
- else → `_collideTerrain(...)` (today's path, incl. the cave density field), untouched.

`World.groundY(x,z,fromY)` gets the same one-line branch so any grounding query is correct underground.

### 2. `src/interior.js` — the `Interior` class (one clear unit)
Owns the mine pocket. What it does / how you use it / what it depends on:
- **build(scene)** — assembles a placeholder mine as its own `THREE.Group` at `origin=(0,-1000,0)`:
  a short **descending ramp tunnel** → a **corridor** → **one room**; timber supports (Minecraft-mineshaft read),
  2–3 torches (built at map-build time — never `scene.add` a light at runtime, per CLAUDE.md). Rough on purpose.
- **floorAt(x,z)** — the interior ground (ramp slope + flat levels). Pure fn → co-op deterministic.
- wall/prop **colliders** pushed into `world.boxes` (at pocket Y).
- **entrySeam / exitSeam** — two trigger volumes (axis-aligned slabs) with a facing; `crossed(prevPos,pos)` tests
  if the player stepped through the plane this frame.
- **enterSpec / exitSpec** — the paired teleport (offset + yaw delta) that maps the surface seam onto the interior
  seam so position/facing/velocity are preserved (movement continuous).
- Depends on: `THREE`, `world` (for `boxes` + scene), the shared `MeshBuilder`/`voxelMaterial` (src/util.js).

### 3. Seamless swap (the core)
The **surface entry** is a short **dark tunnel with a bend** at the back of the cave (built as part of the cave /
interior entrance). The seam plane sits at the bend where you can only see tunnel wall — so an instant swap shows
no change. On `entrySeam.crossed`:
1. teleport `player.pos` by the enter offset + rotate `yaw` by the seam's yaw delta (facing + relative offset
   preserved); keep `vel` (rotated) so walking continues,
2. `world.interiorActive = true`,
3. local render: **hide the surface group, show the interior group** (a per-client render toggle — see co-op).

`exitSeam` (inside the mine) does the exact inverse → you surface at the entrance. Because the seam view is
occluded, the one-frame swap + visibility toggle is invisible → "seamless, no fade."

### 4. Engine integration (`src/game.js`)
- `_frame`/`_updatePlaying`: when `world.interiorActive`, run **player + `interior.update` (torch flicker)** and
  **skip the surface sim** (enemies/waves/day-night/cave torches) — reusing the existing "sim gate" pattern
  (`hostSim` / `mpMenuOpen` already gate subsystems; add `interiorActive` to that gate). No new render pass.
- Seam check runs once/frame for the **local player** (client-local; cheap AABB-slab test).
- Optional: darker fog/ambient while inside (set on enter, restore on exit).

### 5. Co-op (host-authoritative)
Interior is a **shared pocket at real coords**, so most of this is free:
- **Enter = a real teleport** of `player.pos` into the pocket → broadcast as the normal `xf`. Interior peers
  (y≈−1000) see each other; surface peers (y≈0) are 1000 m up → not visible.
- **1-bit `space` flag** added to the `xf` transform (0 surface / 1 interior): each client **hides ghosts whose
  space ≠ the local player's** (belt-and-suspenders over the 1000 m gap), and the **host skips horde targeting**
  of players whose `space===interior` (the mob won't chase someone underground).
- **Swap is per-player, client-local** (you cross your seam → you swap) — no host round-trip, so it stays seamless.
- Authority unchanged: clients self-simulate their local player (now via `_collideInterior`); host owns the surface
  sim. The pocket floor is a pure fn → host & client agree. No new authoritative state beyond the `space` bit.
- **Visibility toggle is render-only + per-client** (each client shows the space its local player is in) — it never
  touches shared state, so clients in different spaces are fine.

## Placeholder mine (YAGNI)
Descending ramp (≈15° so you walk, not slide) from the seam → a short bend corridor → one ~8×8 m room with timber
supports + a couple of ore-vein color flecks. 2–3 torches. No enemies, no loot, no digging (all future). Just
enough to prove you walked in seamlessly and can move around "underground."

## Files
- **new** `src/interior.js` — the `Interior` class (build + floorAt + seams + swap specs).
- **edit** `src/world.js` — `interiorActive` flag; `collide`/`groundY` branch to interior; build the interior in
  `_buildForest`; the surface-entry dark tunnel geometry (or fold into the cave build).
- **edit** `src/game.js` — sim gate on `interiorActive`; per-frame local seam check + swap; enter/exit fog.
- **edit** `src/mp.js` + `src/net.js` — add the `space` bit to `xf`; hide cross-space ghosts; host skips targeting
  underground players.

## Co-op determinism / perf
- `interior.floorAt` + the seam tests are pure fns of position → co-op-safe, worker-safe.
- No extra render pass; the interior group is one small mesh set + a few lights (built once). Swap = a teleport +
  two `.visible` toggles. Cheap.

## Verification
1. **Solo:** walk to the cave back → dark tunnel → cross the seam → you're descending the mine, **no jar**; walk
   the mine; cross the exit seam → back on the surface at the entrance. Probe: inside, `world.groundY` returns the
   mine floor (≈−1000), `world.interiorActive===true`; outside, terrain again.
2. **Seamless check:** headless render two frames straddling the seam — the viewport should not visibly pop
   (same tunnel wall before/after).
3. **Co-op (owner, 2-PC):** P1 goes down, P2 stays up — each sees only their own space; P2's horde ignores P1
   while underground; both meet if both descend. (2-PC WebRTC gate = owner-run.)
