# Prop Re-Instancing — Design

- **Date:** 2026-06-18
- **Status:** design / spec (pre-plan) — approved in brainstorm (target = mechanic 3.3 part A re-instancing; pilot ЛЭП poles + perimeter fences; branch off the engine stack tip)
- **Owner intent:** keep the game **smooth (no stutter)** as the map fills up, by not paying full cost for hundreds of identical repeated props. This is the **re-instancing half** of Engine-Hardening mechanic **3.3** ([[engendros-engine-hardening]] §3.3). The LOD-swap half is deferred to a later PR.
- **Branch:** `feat/engine-reinstancing`, based on `feat/engine-fixed-step` (#89 — the engine stack tip, so it inherits terrain + F3 stats #83 + draw-distance cull #84 + nav + fixed-step). Isolated; touches no existing branch.
- **Relation:** consumes the F3 stat overlay (#83) to measure, and the `world.addCullable` draw-distance cull (#84) to stay compatible. Follows the existing `forest.js` instancing pattern.
- **Measurement note (2026-06-18):** a headless measure of the current steppe map read **276 draw-calls / ~210k triangles from spawn** — a *light* static load. So this work is **future-proofing** for when forests/terrain/a denser map arrive, **not** a fix for present stutter. The acute present stutters (molotov shader-recompile hitch; Tolo per-frame GC) were diagnosed separately and are handled on their own `fix/perf-stutter` branch.

## 0. Current state (2026-06-18 code audit, on the stack tip)

Verified against the live code on `feat/engine-reinstancing`:

- **District props are merged, not instanced.** Builders (`industrial.js`, `airfield.js`, `strongpoint.js`, `openworld.js`, `props.js`) accumulate geometry on a shared `MeshBuilder b` via `b.box(...)` and `.build()` into **one merged `BufferGeometry` per cluster**. `grep` finds **zero `InstancedMesh`** in any district builder.
- **Consequence — the real cost is vertices/memory, not draw-calls.** A loop that bakes 32 identical telegraph poles or hundreds of identical fence panels stores **every copy's vertices** in the merged geometry. Draw-calls are already low (one per merged cluster); the cost we attack is **GPU memory + vertex throughput**, plus map-spanning merges that can't be partially culled.
- **`addCullable(mesh)` (#84)** registers a *compact* cluster mesh by its bounding-sphere centre for a draw-distance test; the contract explicitly **excludes spanning geometry** (roads, perimeters) because a centre test would mis-hide parts still near the player (`world.js:430`).
- **Placement API (`terrain-place.js`, #78):** `seatProp(world, x, z, buildFn, opts)` plants **one mesh per call** (scene-add + auto-`addCullable` + optional `seatBox` collider); `seatBox` seats an AABB on the terrain surface into `world.boxes`. Props placed via a `seatProp` loop **are** separate meshes (separate draw-calls) — those benefit on draw-calls too.
- **Reference pattern — `forest.js`:** one `THREE.InstancedMesh` per `(species × variant)` bucket; `frustumCulled = false` (instances span the map, a per-tree bound mis-culls); `castShadow/receiveShadow = false`; `setMatrixAt(i, m)` + `instanceMatrix.needsUpdate`; destruction collapses an instance to a `ZERO_MAT` zero-scale matrix; instance ids come off the **shared seeded counter** so co-op peers match.

## 1. Scope

**In:**
- A small reusable instancing helper, `src/instancing.js`, exposing `placeInstanced(...)`.
- Convert the **highest-count identical repeated props** in the pilot districts from merged-into-`b` to one `InstancedMesh` each:
  - **ЛЭП / telegraph pole lines** — `openworld.js` (~32 poles, map-spanning). The pole+crossarm+insulator body is identical and instanceable; the catenary `wireSpan` between poles is **not** (each span differs) and stays as-is.
  - **Perimeter fences** — `airfield.js` PO-2 concrete panels + posts, and `industrial.js` concrete-post fence (hundreds of identical segments).
- Measure before/after with the F3 overlay (#83) on `?map=steppe`.

**Out (non-goals / YAGNI):**
- **LOD-swap** (distance → simpler mesh) — the other half of 3.3, its own later PR.
- **Auto-dedup** of existing merged geometry (analyze + split). Too complex/fragile; opt-in per prop instead.
- **Lamp posts, anti-tank hedgehogs, mine stakes, sleepers/rails** — natural follow-ups once the helper + pilot prove out; not in this PR.
- **Re-instancing of one-off or non-identical props** (signs via `signPlane`, unique machinery). Instancing only pays for *many identical* copies.
- **Any network / authority change.** Instancing is render-only.

## 2. Design principles

- **Visual + behavioural parity.** The scene must look identical and play identically; only the *how-it's-stored* changes.
- **Deterministic + co-op-safe.** Placements come from the builders' fixed loops / seeded RNG → identical on every peer. No new network envelope data (mirrors §4 of the hardening program).
- **Measure, don't vibe.** Read F3 `tris`/draws (and GPU memory) before and after; the PR reports real numbers.
- **One mechanic, one PR.** Helper + pilot props only; expand later.
- **Follow `forest.js`.** Reuse the proven instancing conventions rather than inventing new ones.

## 3. Components

### 3.1 `src/instancing.js` — `placeInstanced(world, protoFn, placements, opts)`

```
placeInstanced(world, protoFn, placements, opts = {}) → THREE.InstancedMesh

  protoFn()      → { geometry, material }   // the prototype, built ONCE
  placements[]   → { x, z, yaw?, scale? }   // y is resolved from world.groundY(x,z)
  opts:
    spanning      (bool)  // true = cluster spans the map (ЛЭП, perimeter): frustumCulled=false, NOT addCullable
    castShadow    (bool)  // default false (forest convention); set true per prop if needed
    receiveShadow (bool)  // default false
    cull          (bool)  // default true; ignored when spanning (spanning never registers)
    collider      ({w,d,h} | fn) // optional per-instance AABB seated via seatBox
    yBase / yOffset (num) // optional vertical offset if a prop's origin isn't its base
```

Behaviour:
1. Call `protoFn()` once → `{geometry, material}`. (A builder may produce an `Object3D`; the helper extracts a single merged geometry+material, or the builder hands geometry+material directly.)
2. `const im = new THREE.InstancedMesh(geometry, material, placements.length)`.
3. For each placement compose a matrix from `(x, groundY(x,z)+yOffset, z)` + `rotateY(yaw)` + `scale`; `im.setMatrixAt(i, m)`. Then `im.instanceMatrix.needsUpdate = true`.
4. `im.frustumCulled = opts.spanning ? false : true`; `im.castShadow = !!opts.castShadow`; `im.receiveShadow = !!opts.receiveShadow`.
5. `world.scene.add(im)`. If `!opts.spanning && opts.cull !== false` → `world.addCullable(im)` (compact cluster only — honours the #84 contract).
6. If `opts.collider` → for each placement `seatBox(world, x, z, w, d, h, ...)` so collision is unchanged.
7. Return `im` (so a builder can keep a handle, e.g. for future destruction via the `ZERO_MAT` collapse).

The helper owns no per-frame work: it builds once at map-build time, exactly like the merged path it replaces. Culling of compact instanced clusters rides the existing #84 per-frame loop.

### 3.2 Pilot builder edits

- **`openworld.js`** — replace the `telegraphPole(b, ...)`-in-loop bake with: build one pole prototype, collect the loop's `{x, z, yaw}` into `placements`, call `placeInstanced(..., { spanning:true, collider:{...thin pole...} })`. Keep `wireSpan` drawing the wires on the shared builder as today.
- **`airfield.js` / `industrial.js`** — the perimeter fence post/panel loops: extract the panel and post prototypes, collect placements per side (panels carry a 45° `yaw` already), emit instanced meshes (`spanning:true`). Gates remain gaps (placements simply skip the gate span, as the loops already do). Colliders continue via the existing `_solid`/`seatBox` calls.

Each edit is mechanical: same positions, same colliders, same look — only the render path changes.

## 4. Co-op, determinism, authority (constraints held)

- **Local-cosmetic only** — instanced meshes are a pure client-side render choice, never synced (like graphics quality / the cull / the stats overlay).
- **Deterministic** — placements derive from the builders' fixed loops and the seeded map RNG; identical geometry on every peer. No reliance on the gameplay (unseeded) RNG.
- **No envelope change** — nothing new on the wire. Colliders (the only gameplay-relevant output) are unchanged AABBs in `world.boxes`.

## 5. Risks & mitigations

- **R1 — Instanced shadows look different.** Default `castShadow=false` (forest convention) may drop a shadow a merged prop used to cast. Mitigation: set `castShadow:true` per prop where it visibly matters; compare against the merged build before/after.
- **R2 — Cull correctness.** A spanning instanced mesh must be `frustumCulled=false` and must NOT be `addCullable` (else centre-test mis-hides). Mitigation: `spanning` flag enforces both; pilot props are all spanning.
- **R3 — Collider drift.** Visual instancing must not silently drop the AABBs. Mitigation: route colliders through the same `seatBox`/`_solid` calls; verify in-game that fences/poles still block.
- **R4 — Per-builder churn / regressions.** Mitigation: pilot only 2 prop families; keep positions byte-for-byte identical; visual diff before/after.
- **R5 — "Did it help?" unmeasured.** Mitigation: F3 `tris` + GPU memory read before/after on `?map=steppe`; report numbers in the PR.

## 6. Phasing

1. Build `src/instancing.js` (`placeInstanced`) + a standalone sanity check (matrices, count, collider seating).
2. Convert **ЛЭП poles** (`openworld.js`). Measure F3 before/after.
3. Convert **perimeter fences** (`airfield.js` + `industrial.js`). Measure.
4. Cache-bust ritual (`?v=` + `GAME_BUILD`) + PR with before/after numbers.
5. *(Follow-up PRs, not here: lamp posts / hedgehogs / mines / rails; then the LOD-swap half of 3.3.)*

## 7. Success criteria

1. F3 **triangles and GPU memory drop** on `?map=steppe` after the pilot conversions (real numbers, before/after).
2. Scene is **visually identical** — poles and fences in the same places, same look, shadows acceptable.
3. **Colliders unchanged** — the player still can't walk through poles/fences; bullets still hit them.
4. **Co-op shows no new desync**; nothing added to the network envelope.
5. No build step introduced; cache-bust ritual respected; shipped as its own reviewed PR.

## 8. Files touched (orientation, not a plan)

- **New:** `src/instancing.js` (`placeInstanced` + matrix/collider helpers).
- **Edited (pilot):** `src/openworld.js` (ЛЭП poles), `src/airfield.js` + `src/industrial.js` (perimeter fences).
- **Cache-bust:** `index.html` (`?v=`), `src/game.js` (`GAME_BUILD`).
- **Unchanged contracts relied on:** `src/terrain-place.js` (`seatBox`), `src/world.js` (`addCullable`, `groundY`, `boxes`), F3 readout (#83).

## 9. Open questions (resolved for this PR)

- **Q1 — helper location:** new `src/instancing.js` (vs extending `terrain-place.js`). **Resolved:** own module — instancing is its own concern and will grow (LOD later).
- **Q2 — prototype source:** `protoFn` returns `{geometry, material}` vs an `Object3D`. **Resolved:** accept either; extract a single merged geometry+material when handed an `Object3D`.
- **Q3 — pilot breadth:** **Resolved:** ЛЭП poles + perimeter fences only; everything else is a follow-up.
- **Q4 — shadows default:** **Resolved:** off by default (forest convention), opt-in per prop.
