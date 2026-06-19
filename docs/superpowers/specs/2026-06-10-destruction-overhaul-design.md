# Environmental Destruction Overhaul — Design

- **Date:** 2026-06-10
- **Status:** design / spec (pre-plan) — approved in brainstorm session
- **Updated:** 2026-06-12 — added §2.6 (mixed-fidelity destruction: fidelity tiers, material-driven behavior, the cosmetic-vs-authoritative split); owner-approved in a follow-up debate.
- **Branch:** `docs/destruction-overhaul-design`
- **Owner intent:** "Tanks in WT/WoT can't crush fences/trees or drive where a real tank would. We have great graphics — now we need mechanics to match: trees with real fall physics that snap mid-trunk, building damage from tank fire (windows shattering, per-caliber effects), T-62 APFSDS = no big explosion (just penetration), HE for the big holes."

## 0. Summary of locked decisions (from the brainstorm)

| Decision | Choice |
|---|---|
| Physics depth | **Bespoke mini-physics** (`FallingBody` integrator) — no external physics engine, no Rapier/cannon |
| Building destruction depth | **Windows + wall breaches, no collapses** (per-part data model future-proofs a later collapse phase 2) |
| Destruction fidelity | **Tiered & mixed BY MATERIAL** — F0 cosmetic / F1 chunk-breach (default) / F2 bespoke-hero on a short whitelist; the ultra-detail is *client-cosmetic* riding over a *simple authoritative core* (§2.6) |
| Caliber model | **Hardness tiers (0–5) × penetration class** + special per-ammo behaviors (APFSDS through-hole + spall, HE segment removal) |
| First step | **Experiment scene first** (`tools/destructlab/`) — validate perf + feel before any in-game integration |

This is a **program of 5 pillars**, not one project. Each pillar gets its own plan → implementation → PR cycle:

| # | Pillar | Depends on |
|---|---|---|
| 0 | **Destruction core** — material registry, caliber×material matrix, unified damage pipeline, debris system, MP sync | nothing (foundation) |
| 1 | **Vegetation** — trunk break points, crush classes, tree-fall mini-physics, fallen-trunk colliders | core + `feat/nature-props` tree generator |
| 2 | **Buildings** — buildgen harness built WITH destructibility first-class (per-pane glass, breach segments) | core + buildgen harness |
| 3 | **Ammo & calibers** — AP/HE behaviors, penetration, spall/shrapnel | core |
| 4 | **Tank mobility** — crushing obstacles by weight/momentum | drivable T-62 (separate ongoing project) |

## 1. Why now / what the engine already gives us

Findings from the codebase survey (2026-06-10):

- **Runtime collision mutation already works.** `world.boxes` + `SpatialGrid` support `addBox`/`removeBox` and are used live today (fortifications `world.js:461`, wreck obstacles `world.js:346`, gatehouse gate, bunker doors). Caveat: boxes have no reverse-reference to geometry — destroying anything must splice `world.boxes` AND call `grid.removeBox()` or the grid keeps phantom entries.
- **A miniature of the whole system already ships.** Player fortifications have `hp`/`maxHp`, `attackStructure()`/`destroyStructure()` (`world.js:555–589`), and host-authoritative MP messages `structhit`/`structdie` with late-joiner replay (`mp.js:1008`). The destruction core generalizes this pattern from "sandbag" to "anything on the map".
- **The tree generator already has damage in its DNA.** `src/props/generators/tree.js` (branch `feat/nature-props`) defines damage states `none | snapped | bare | charred` for birch/poplar/pine/oak/willow. It needs break-point metadata + crush class, not a redesign.
- **Buildgen harness has no code yet** (spec/skill only — `docs/superpowers/specs/2026-06-10-buildgen-harness-design.md`). Destructibility becomes a first-class part of its spec format from day one instead of a retrofit.
- **Hard gaps:** map buildings are monolithic merged meshes (can't remove a wall); explosions damage only enemies, never structures or world (`weapons.js:1258`, no world path); tank shells fly with no gravity (`vehicles.js:231` on the old branch); the game loop is variable-dt with a 50 ms clamp — a real physics engine would need a fixed-tick rewrite, which is why we chose mini-physics.

## 2. Architecture — Destruction Core (`src/destruct.js`)

One module owns all world damage. Everything else is a client.

### 2.1 Entry points (the unified damage pipeline)

```js
// hitscan — called from WeaponSystem when a world surface is hit
destruct.applyHit(point, normal, dir, weaponDef)
// area — called from every detonation (grenade, bazooka, later 115 mm HE)
destruct.applyBlast(pos, radius, ammoDef)
// vehicle contact — called from tank movement (pillar 4)
destruct.applyCrush(aabb, vehicleDef, dt)
```

`applyBlast` is new capability: today explosions do **not** damage fortifications or world. The pipeline queries the `SpatialGrid` for destructible boxes in range and applies material rules. Fortification damage (`attackStructure`) migrates to route through the same pipeline so there is exactly one damage path.

### 2.2 Material registry & damage matrix

```js
MATERIALS = {
  glass:    { tier: 0, hp: 1,   debris: 'shards',  sound: 'glass' },
  wood:     { tier: 1, hp: 60,  debris: 'splints', sound: 'wood'  },
  sheetmetal:{tier: 2, hp: 120, debris: 'panels',  sound: 'metal' },
  brick:    { tier: 3, hp: 400, debris: 'rubble',  sound: 'masonry' },
  concrete: { tier: 4, hp: 900, debris: 'rubble',  sound: 'masonry' },
  steel:    { tier: 5, hp: 2000,debris: 'sparks',  sound: 'metal' },
  trunk:    { tier: 2, hp: 250, debris: 'splints', sound: 'wood' }, // per-species override
}
```

Each weapon/ammo gets `pen` (penetration tier) + `structDmg`. Rule: `pen < tier` → cosmetic only (decal, chip particle, no HP loss). `pen >= tier` → subtract `structDmg` from part HP; at 0 the part's destruction recipe runs. Shotgun: king vs glass, nothing vs brick. This keeps balance a **readable table**, not a simulation.

### 2.3 Destructible part metadata on collision boxes

Generalizes the existing `struct: true, _ref` pattern:

```js
{ min, max,                 // as today
  dmat: 'brick',            // material key (presence ⇒ destructible)
  dhp: 400,                 // current hp
  dpart: 'wall_S_seg3',     // stable part id (MP sync + late join)
  downer: <building/tree>,  // back-ref to the owning destructible object
}
```

The back-reference solves the "no reverse-reference" gotcha: a part knows its owner, the owner knows its mesh + spec parts, so splice/rebuild is bookkept in one place.

### 2.4 Mini-physics — `FallingBody`

A small bespoke integrator, internally substepped (fixed 120 Hz accumulator **inside the integrator only** — the game loop stays variable-dt). Two modes:

- **`hinge`** — tree trunks: rotation around the break point with angular acceleration from gravity torque; each substep sweeps the trunk's AABBs against `world.boxes` so a falling tree **rests against a building** instead of clipping through; on ground/obstacle contact → short settle → the trunk freezes and registers 3–4 static AABBs along its length (it becomes cover/obstacle). The stump stays as a low collider.
- **`tumble`** — wall chunks/bricks: ballistic arc + tumbling rotation, single ground-plane + coarse box collision, settle or despawn.

Determinism: seeded per event (`makeRNG(seed)` from `util.js`); host picks the seed, clients replay the identical fall.

Budget: **max 8 concurrent FallingBodies**; excess events queue a few hundred ms (staggered falls also look more natural).

### 2.5 Debris manager

A second instanced pool alongside the existing 800-particle effects pool: **~256 instanced debris chunks** (one draw call), recycled oldest-first. Debris recipes per material (`shards`, `splints`, `rubble`, `panels`). Persistent rubble piles (e.g. under a wall breach) are *prop swaps* (one small static mesh + 1 collider), not live debris.

### 2.6 Fidelity tiers — mixed-fidelity destruction (added 2026-06-12)

Two **orthogonal** axes, routinely conflated. Keep them separate:

- **Hardness / damage tier** (§2.2 `MATERIALS.tier`, 0–5) — *how much it takes to break, and with what ammo.* Already defined.
- **Fidelity tier** (`F0`/`F1`/`F2`, defined here) — *how detailed the break looks once it happens.* (The `F` prefix is deliberate, so "tier 0–5" hardness never gets confused with "F0–F2" fidelity.)

A glass pane is **low hardness** (any bullet) yet **high fidelity** (bespoke shards); a far concrete wall is **high hardness** yet **low fidelity** (one chunk). Don't tie one axis to the other.

Fidelity is a **budget** — both runtime (draw calls, FallingBodies, particles) and authoring (someone hand-builds the bespoke states). Spend it where the player's eyes and hands go: eye-level, doorways, the window they vault, the cover they hug. Everything else inherits a cheap generic tier.

| Fidelity | What | Cost | Where |
|---|---|---|---|
| **F0 — cosmetic** | decal + chip particle, zero geometry change | ~free (existing decal system) | most surfaces; anything `pen < tier`; far/background |
| **F1 — chunk breach** | box-segment removed → inner-core face + generic material debris + dust | one rebuild event (the §4 lazy-split) | **the default workhorse — ~90% of walls/structures** |
| **F2 — bespoke hero** | hand-authored break states + remnants (hanging shard, hinged/bent frame, splintered door, exposed rebar) | bespoke mesh + a few extra bodies | a **short whitelist** of object types only |

**Authenticity comes from material behavior, not polygon count.** Mixing destruction types means mixing **by material** — each acts per its real nature. This is what sells it, and it keys straight off `dmat` (§2.3), so the common path is data-driven with **no per-object special-casing**:

| Material | Behavior |
|---|---|
| `glass` | **shatters** — shards fall/hang; a jagged remnant is left in the frame |
| `wood` | **splinters** — long slivers along the grain; hangs/cracks rather than vanishing |
| `brick` / `concrete` | **crumbles** — chunks + dust; exposed rebar at the break face |
| `sheetmetal` | **dents / bends / peels** — deforms, does **not** shatter |
| plaster / drywall | **punches through** — clean soft hole, shootable-straight-through |

**The cheap-netcode split (the important one).** Every break separates into two halves:

- **Gameplay truth** — *"this opening is now passable / shootable-through", "this segment is gone".* One bit/id. **Host-authoritative, synced** (the `destro` message, §6). Always the *simple* version.
- **Cosmetic flourish** — the hanging-shard angle, dust, bent-frame wobble, individual debris tumble. **Client-local, NOT synced** — each client renders its own; nobody cares if my shard hangs at a different angle than yours.

So ultra-detail costs **nothing** in netcode — it rides as local paint over a simple authoritative core. This refines §6: the seed-replay there is only needed for breaks that are *also gameplay-relevant* (a felled trunk that becomes cover must rest identically for everyone). Pure decoration can free-run client-side and is never sent.

**Quality floor, not ceiling.** The risk of mixing is a visible **seam** — a gorgeous hero window beside an inert painted box, or a chunk that breaks to reveal hollow nothing. Rule: **uniform quality floor, varied detail ceiling.** F1 must look decent on its own (always fill the inner-core face — §4 — so no break ever exposes emptiness); F2 only *raises* the ceiling on whitelisted objects. Never let a tier drop **below** F1's floor next to an F2 showpiece.

**F2 whitelist (Pillar 2 starting set, keep it short — each entry is bespoke authoring):** windows (pane → cracked → hanging-shards → empty frame; optional hinged/bent frame rig), doors (splinter, hang on one hinge), glass cabinets/cases, the radio/CRT (implode), key cover props. Everything else is F0/F1.

## 3. Pillar 1 — Vegetation (crush classes)

The War Thunder frustration, fixed by classification:

| Class | Examples | On foot | Tank | Gunfire |
|---|---|---|---|---|
| 0 | grass, bushes | pass through | drives through (visual bend) | nothing |
| 1 | fences, saplings | blocks | **drives through — snaps** | any rifle/shotgun breaks |
| 2 | grown birch/pine | blocks | **slows ~1 s of push → snaps at break point, falls** | 12.7 mm or explosives |
| 3 | mature oak | blocks | **blocks even the tank** | HE/bazooka only |

- Tree generator emits per-tree: `crushClass`, `breakPoint` (height + local AABB), trunk material override per species.
- A felled class-2/3 trunk becomes a static obstacle/cover; the `snapped` visual state already exists in the generator.
- Class-0/1 are cheap: no FallingBody, just a break event (mesh swap + particles + collider removal).

## 4. Pillar 2 — Buildings (buildgen integration)

The buildgen spec format (not yet implemented — perfect timing) gains:

- **`mat`** on every part (maps into `MATERIALS`).
- **Windows as individual panes** — each pane is a part with its own thin AABB (`dmat:'glass'`), breakable by any bullet: shatter particles, sound, hole; pane collider removed.
- **Hero windows/doors (fidelity F2, §2.6)** — a short whitelist gets bespoke break states *beyond* the generic shatter: a jagged remnant shard left hanging in the frame, an optional hinged/bent frame rig, doors that splinter and hang on one hinge. These remnants are **cosmetic** (client-local); only "the opening is now passable/shootable-through" is host-synced.
- **Breach segments** — exterior walls generated as discrete segments (~1.5–2 m); HE/bazooka above threshold removes a segment → man-sized (or shell-sized) hole with a broken-edge frame + rubble pile prop. Walkable/shootable through.
- **Cosmetic bullet damage** — craters/chips as decals (existing decal system), no geometry change.
- **Validator budgets:** cap breakable parts per building (target ≤ 32 panes + ≤ 24 breach segments), so draw-call and sync costs stay bounded.

**Rendering — "lazy split":** an intact building renders exactly as today (one merged mesh per material bucket → zero idle cost). Buildgen keeps the per-part source data in memory; on the first destruction event the owner rebuilds its merged geometry without the dead part(s) and adds the broken-edge/rubble props. Cost is paid per destruction event, never per frame. (Same chunk-rebuild pattern as Minecraft.)

**No collapses in this phase.** Floors never fall; load-bearing simulation is explicitly out of scope. The per-part data model (parts + owners + stable ids) is the prerequisite that makes a future "phase 2: structural integrity" possible without rebuilding pillar 2.

## 5. Pillar 3 — Ammo & calibers

- **Bullets:** decal + chip on `pen < tier`; HP damage otherwise. Pen classes (v0): pistol 0, shotgun pellet 1 (so buckshot breaks wooden fences, consistent with crush class 1), rifle 1, 7.62×54R 1, 12.7 mm 2, bazooka (HEAT) 4, 115 mm APFSDS 5, 115 mm HE blast 3 (+ wide glass-shatter radius).
- **HE (bazooka now; 115 mm ОФ later):** `applyBlast` — removes wall segments with `tier ≤ blastTier` in radius R1, shatters all glass in radius R2 > R1, shrapnel damages enemies/players (host-auth).
- **APFSDS (T-62):** **no explosion** — small entry + exit hole (can pass through an entire building: ray continues with energy loss per wall), plus a **spall cone** behind each penetrated wall (damage to anything in the cone). Authentic "long rod" feel; the visual is two decals + dust + the spall particles.
- **Tank shells get gravity** (today they fly flat forever) — simple `vel.y -= g*dt`, consistent with grenades.

## 6. Co-op & persistence

- **Host-authoritative**, following the proven `structhit`/`structdie` pattern: clients send hit claims; host validates, applies the matrix, and broadcasts `destro { dpart, kind, seed }`. Clients replay the deterministic fall/break from the seed.
- **Cosmetic vs. authoritative (§2.6):** only *gameplay-relevant* outcomes are synced/seed-replayed — a segment removed, an opening now passable, a felled trunk's resting pose (must match for everyone so cover is consistent). Pure decoration — hanging shards, dust, debris tumble, bent-frame wobble — free-runs client-side and is **never sent**. The seed exists for the former, not the latter.
- **Late join:** host sends the list of destroyed part ids + resting poses of settled trunks (a few floats each). Bounded by the validator caps.
- **Persistence:** destruction resets per run (same as fortifications today). No cross-run world scarring.
- All new authoritative logic sits behind `hostSim = !mp.active || mp.isHost` (the standing co-op footgun rule).

## 7. Performance budgets (acceptance gates, measured in the lab)

- 60 FPS on the dev Mac mini with: 3 simultaneous falling trees + full 256-chunk debris pool + 1 building rebuild event.
- ≤ 8 concurrent FallingBodies (hard cap, queue overflow).
- Debris pool 256 instanced chunks, 1 draw call.
- Building rebuild ≤ ~4 ms per event (measured; if over, split rebuild across 2 frames).
- Settled trunks add ≤ 4 AABBs each; grid re-index via existing `addBox` (no full rebuild).

## 8. First deliverable — `tools/destructlab/` experiment scene

A standalone page (sibling of `tools/modelgen/forest-demo.html`), **not** part of the shipped game:

- Test wall (brick) with 4 glass panes + 2 breach segments; 1 tree of each crush class (from the nature generators); weapon panel: pistol / rifle / 12.7 / bazooka-HE / APFSDS-sim.
- FPS + draw-call + rebuild-time instrumentation (`DEMO.perf` pattern from forest-demo).
- **Success criteria:** the §7 budgets hold; tree fall "reads true" (owner judgment — rests against obstacles, no clipping); HE breach is walkable and visually legible; APFSDS through-hole + spall feels distinct from HE.
- Only after the lab is approved does core integration into `src/` begin.

## 9. Build order

1. **destructlab** (experiment: mini-physics + matrix v0 + debris pool, throwaway-quality allowed)
2. **Destruction core** into `src/destruct.js` (hardened: pipeline, registry, MP messages; fortifications migrated onto it)
3. **Vegetation** (with `feat/nature-props` integration — trees enter the world destructible from day one)
4. **Buildings** (buildgen harness implemented with `mat`/panes/breach segments in the spec + validator)
5. **Ammo behaviors** in full (APFSDS spall, HE blast, shell gravity)
6. **Tank mobility** (`applyCrush`) — when the drivable T-62 lands

## 10. Out of scope (explicit)

- Building collapses / structural integrity (future phase 2; data model is ready for it).
- A general-purpose physics engine (Rapier/cannon-es) — rejected: variable-dt loop, MP determinism, WASM-without-build-step friction.
- Cross-run persistent destruction.
- Realistic mm-RHA penetration / impact-angle simulation (WT-style) — rejected for v1; tiers + behaviors carry the feel.
- Terrain deformation (craters in the ground) — belongs to the future elevation/terrain engine, not this program.
