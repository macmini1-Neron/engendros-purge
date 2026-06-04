# «ОБЪЕКТ 1180» — Multi-Level Bunker BUILD SPEC (Phase 3, the single source of truth)

Unifies `docs/2026-06-03-soviet-bunker-reference.md` (palette §4, typology) + `docs/2026-06-04-soviet-bunker-multilevel-dossier.md` (3-level stack, per-room furniture, embrasures, ladders) into an exact, engine-aware voxel build plan for `src/bunker.js` (`buildSecretBunker(world, BX, BZ)`, BX=170, BZ=15 on the steppe).

## 0. Engine reality (drives the whole shape)
- **Hard floor at y=0** (`world.collide`: `pos.y<=0 → 0`). Cannot go below grade. → "deep" = a 3-level interior buried in a **tall earth kurgan**; the bottom level (grade, y=0) has the **most earth above it = most protected = the COMMAND core** (this matches the real "command deepest" logic, just inverted in Y).
- Step-up ≤0.62 m walkable. Stairs use ~0.45 m rise (≈8 steps/level) — steep bunker stair, playable.
- Collision = AABB `world.boxes`. Doorways = real GAPS (`_wall` door param). Cylinders via `b.geo(CylinderGeometry)` (+Y axis, dispose after).
- Co-op: any door/loot/event behind `hostSim = !mp.active || mp.isHost`.

## 1. Vertical stack (floors = walkable top Y)
| Level | Floor Y | Clear H | Role |
|---|---|---|---|
| **L0 DEEPEST — command core** (objective, top loot) | **0.0** | 3.2 | оперативный зал/ШТАБ, map+мнемощит, consoles, plotting table, ЗАС, safe, switchgear, duty nook |
| **L1 MIDDLE — living/sustain/signals** | **3.6** | 2.8 | кубрик+mess, санчасть, узел связи, оружейная (caged), склад+water, санузел |
| **L2 UPPER — entry/NBC** | **7.2** | 2.8 | тамбур-шлюз airlock, ФВУ filtration, ДЭС diesel (outer wall, double-door), КПП guard, баллонная |
| **CROWN** (kurgan top) | ~10.6 | — | entrance blockhouse, НП/firing tower, грибок vents, antenna, escape оголовок, periscope cupola |
| **TOWER platform** | ~14.3 | 2.2 | НП firing post: 3 embrasures + periscope cupola, firing step, ammo boxes, ladder down |

Slab thickness 0.5 (L2 under-crown cap 0.6, granite-flecked).

## 2. Footprint & kurgan
- Interior half-extents **SHX=13, SHZ=10.5** (interior 26×21 m), shell wall **T=0.6**, shared by all levels.
- Kurgan: revetted (concrete-retained, ~steep) earth mound, base ≈ 48×42, crown ≈ 28×23, height ~10.6 m, grass over earth, concrete retaining lip at terrace breaks. Smoother read than the current ziggurat — fewer, broader terraces + a domed grass cap; spalled board-formed R/C edges poking through.
- Widen the world.js boulder clear-zone to x[144,196] z[-12,42].

## 3. Routes (≥2 between every level — no single choke)
- **A — Front door (descend):** stepped approach up the S kurgan face → **crown blockhouse** → тамбур-шлюз (double гермодверь) on **L2** → central **switchback stairwell** L2→L1→L0 (command).
- **B — Base postern (grade):** concrete portal at the **N base** of the kurgan at y=0 → short tunnel → **L0 ring** at its periphery (drops you on the deep level fast; emergency-exit idiom).
- **C — Escape ladder shaft (скоб-трап):** caged vertical steel ladder in a **corner shaft** linking L0↔L1↔L2↔a **surface оголовок hatch** (fast flank, climbable both ways).
- **D — Tower ladder:** скоб-трап from L2/crown up to the **НП tower** platform.
- Every level = a **ring corridor** around its core, rooms hang off the ring, each room ≥2 ways out (door + ring, or door + ladder/shaft). Central stairwell + corner ladder = the two inter-level connectors.

## 4. Per-room contents — build EVERYTHING in dossier §B
Use existing helpers (genset, filterCol, console_, bunk, rifleRack, lamp, chevron, pipeRun, blastDoor, reveal, mushroom, cupola, escapeHatch, antenna) — UPGRADE them — and ADD: gasMaskRail, suitHooks, dosimeterBoard, footBath, ervFan, handCrankBlower, manometerBoard, regenCans, ductRun(flanged), radiator, silencerCan, batteryBank, oilDrum, firePoint, switchgear(⚡), mnemo(status panel), zasCabinet, docSafe, planDesk, stool, ta57phone, teletype, p193switchboard, r140rack, morseKey, examCouch, instrumentCab, medShelves, o2bottle, basin, aidKit, waterCistern, jerryCans, tinShelf, toiletStall, washTrough, periscope, embrasure, skobTrap(ladder), cableTray, fireBoard, sign labels (dossier §E). Lighting: emergency red default + amber working lamp per room; raise ambient a touch so detail reads.

## 5. Tower embrasures (dossier §C.1)
Slit **0.20 H × 0.45 W**, sill **y≈1.3** above tower floor, **splay WIDE inside (~1.0×0.55) → NARROW outside**, embrasure block 0.7 deep, **steel-plate splay lining w/ bolt-head dot rows**, hinged **заслонка** (0.5×0.3×0.04, shown open), 3 embrasures (one per exposed face) + 1 **periscope cupola** (Ø1.7 hemisphere, 30 mm slit, NO glass). Firing step ledge at sill, ammo ready-box per slit. Embrasure gaps are REAL holes in the tower wall so the player can shoot out; tower wall is otherwise solid (bunker vibes — no windows).

## 6. Interaction (mirror world.toggleGate, host-authoritative)
- **Openable гермодвери (E):** the main blast doors (crown тамбур outer+inner, base postern) + the **caged оружейная door** are separate leaf meshes on a pivot; aim + **E** swings open/closed; **leaf collider tracks** (closed blocks, open clears). Co-op: client→`doorreq`→host applies + `doorset` broadcast. New `world._doors`, `world.updateDoorTarget`, `world.toggleDoor`, `world.updateDoors(dt)`; hook `game.js` E-handler + interact prompt.
- **Ladders (climb):** `world._ladders` AABB zones; in `player.update`, inside a zone → vertical climb (W/look or Space/Ctrl), gravity off, no fall damage. Used by escape shaft + tower ladder.

## 7. Bug-fix checklist (the user's explicit complaints — verify each is GONE)
1. **Texture flicker / z-fighting:** every detail/recess box sits **proud 0.004–0.01**; never two same-plane faces of different colour at identical depth; signs offset off the wall (opaque + alphaTest); floor overlays & slabs offset by a sliver.
2. **Walls not reaching floor:** every wall base extends **0.1–0.2 below the floor top**, floors overlap walls — no daylight gap at the skirting.
3. **Transparent slivers beside doors:** every doorway gap is fully framed by a **reveal** that exactly meets the `_wall` left/right segments; **seal every room corner** (overlap partition ends + add corner posts) so no see-through slits where a side-room wall meets the shell.
4. **Models on the wrong axis:** audit every `cyl`/`b.geo`/rotated box (map-board lines, clocks, cowls, periscope, fan) — correct orientation; nothing floating/sunk into a wall.
5. **Object/text collisions (overlap flicker):** no two props occupy the same voxel; signs clear of geometry.

## 8. Verify loop (Phase 6 — required)
Serve `:8091`, fresh `?cb=`; screenshot 3 exterior angles + a first-person walk of EACH level + the tower; `Read` each; confirm layered shading reads, signage legible, embrasures shootable, **0 console errors**, colliders walkable (≥2 exits/level, no clip, step-up climbs, no flicker while moving), `GAME.world.boxes.length` sane. Then review subagents (reality / game-design / visual) → iterate → cache-bust (`?v=`+`GAME_BUILD`).
