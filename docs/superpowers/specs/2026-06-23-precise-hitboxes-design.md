# Precise Hitboxes — Hybrid Narrowphase (shooting only)

- **Date:** 2026-06-23
- **Branch:** `feat/precise-hitboxes-bvh` (off `feat/forest-sectional-destruction`)
- **Status:** Design — approved in brainstorming, pending written-spec review
- **Author:** Tomáš + Claude

---

## 1. Problem & intent

Bullets, rockets and grenades currently resolve their final hit against **axis-aligned
bounding boxes (AABB)**. For blocky things (buildings) that is already 1:1, but for round
things — tree trunks, fallen logs, plush enemies — an AABB is a square box around a round
shape. A shot that grazes "the corner of a tree's box" hits nothing real; a felled log
reads as a square beam. The player wants **mesh-accurate (1:1) hits, including round ones.**

The goal is the **smart version** of "use the model as the collider": apply exact-shape
hit testing **to shooting only**, keep movement / AI / fire-LOS / terrain on the cheap
shared AABB colliders forever (by design — exact-mesh movement would cause stutter and is
worse design), and **do not touch the building-destruction system that already works.**

### Goals

- Round, mesh-accurate hits for **trees, fallen logs** (the headline pain).
- **Per-zone hit detection for enemies** (headshot / limb / torso multipliers).
- A general **triangle-BVH** available for genuinely arbitrary shapes (props), used
  conservatively.
- Zero new co-op netcode; deterministic so host & client agree.
- No regression to building destruction, movement, navigation, fire spread, terrain.

### Non-goals (explicitly out of scope)

- **Visual dismemberment / gore** — deferred to a follow-up PR. This pass builds the
  per-part skeleton (zone identity) but does **not** detach limbs.
- **Exact-mesh collision for movement / AI / fire-LOS / terrain** — intentionally stays
  on AABB / heightfield, forever.
- **Buildings getting mesh-BVH** — buildings are voxel cubes; their AABB cells already
  equal their render geometry. BVH would only desync them (see §7). They keep AABB.
- **Closing the co-op "client can't damage world" gap** — pre-existing, separate feature
  (see §6). Not opened here.

---

## 2. Key codebase findings (so this spec is self-contained)

The shooting hit path is a **narrow chokepoint**, which makes this change surgical:

- **Only shooting + projectile flight** use the raycast narrowphase:
  `world.rayHit()` → `grid.raycast()` → `rayAABB()`.
  - `WeaponSystem._marchPellet()` — `src/weapons.js:1592` (hitscan, pierce-march).
  - Rocket / molotov flight raycast-before-move — `src/weapons.js:2024`, `:2031`.
  - Boss bolt LOS, rangefinder beam, sentry, mortar — all via `world.rayHit`.
  - Enemy hits go through a **separate** path: `EnemyManager.rayHit()` — `src/enemies.js:1027`.
- **Everything else uses different code and is untouched:**
  - Player movement / step-up → `grid.queryAABB()` (`src/world.js:407,447`).
  - Enemy nav → pre-built occupancy grid sampled once (`src/pathing.js:38`), runtime
    steering via `grid.queryAABB()` (`src/enemies.js:518`).
  - Fire spread LOS `_wallBetween()` → `grid.queryAABB()` + a separate `rayAABB()`
    (`src/fire.js:441`).
  - Terrain dig / `_rayTerrain` → heightfield, no boxes (`src/dig.js`, `src/world.js:559`).
  - Explosion AoE → pure distance (`src/enemies.js:1092`).
- **Broadphase already exists and is good:** `SpatialGrid` — `src/grid.js`. 16 m cells,
  `queryAABB()`, DDA `raycast()` (Amanatides–Woo) returning `{box, t}`, with an optional
  `filter(box)` predicate. `world.boxes` is the single source of truth; the grid is a pure
  index kept in sync via `addBox`/`removeBox`.
- **Box schema** (`world.boxes` entries): `{ min, max }` (THREE.Vector3) + sparse flags
  `downer` (owner back-ref), `dpart` (destruction part id), `dmat` (material), `seg`
  (fallen-log segment), `foliage`/`thicket`/`tree`/`building`/`struct`/`wreck`/`prop`,
  `felTier`. Routing is via `box.downer`.
- **Geometry is non-indexed** (MeshBuilder `toNonIndexed()` in `src/util.js`) → dense
  contiguous Float32 positions/normals → trivial triangle iteration for a BVH.
- **Geometry sharing is real** for enemies (`EnemyManager.geos` cache) and standing forest
  trees (`forest.js` InstancedMesh variants). **Per-instance unique** for `forestdemo.js`
  trees, fallen logs, and props (`terrain-place.js seatProp` rebuilds each).
- **No BVH library** is vendored. `THREE.Raycaster` is used only for poker UI, never for
  gameplay.
- **Trees** (`src/forestdemo.js`): each tree record `rec` carries `spine` (leaning
  centreline from `makeTree`), `trunkR`, `fullH`, `yaw`, `baseY`. `_buildTrunkBands()`
  (`:158`) builds 6 AABB bands along the spine (taper `trunkR*(1-0.6*y/fullH)+0.1`) + a
  root collar; the canopy is **one** `foliage:true` AABB. Fallen logs are sectional, one
  box per segment carrying `box.seg`.
- **Enemy hit** (`src/enemies.js:1027`) tests one AABB (`e.pos ± e.radius`, `y..y+height`)
  and returns `{enemy, dist, point, head}` where `head` is a crude Y-threshold; consumed at
  `src/weapons.js:1608` as a hardcoded `×2.0` headshot, suppressed on the boss.
- **Co-op:** world destruction is host-authoritative and host-**initiated** — `bdestroy`
  (`mp.js:738`) and `forestfx` (`mp.js:739`) replay the host's deterministic result to
  clients. `_destructHit` returns early on clients (`weapons.js:1671`). There is **no
  client→host world-hit claim**.

---

## 3. Architecture: one polymorphic narrowphase hook

Broadphase is unchanged. We add an **optional `refine` callback** to the grid raycast.
Inside the DDA per-candidate loop, after the cheap `rayAABB` test passes, the grid asks the
caller to refine the hit:

```
shot → world.rayHit → grid.raycast (DDA, unchanged)
          └─ candidate box → rayAABB (coarse filter, unchanged)
               └─ refine(box, ray, aabbT) → box.downer.rayExact(ray)      ← NEW
                    ├─ capsule / tapered-cylinder (trunk, log)  → {t, normal}
                    ├─ RayBVH (arbitrary mesh prop)             → {t, normal}
                    ├─ null  → ray clipped the AABB but MISSED the real shape → skip box
                    └─ (no hook) → use aabbT  → today's behaviour, unchanged
```

### 3.1 `grid.raycast` signature change

`grid.raycast(ox,oy,oz, dx,dy,dz, maxDist, filter, refine)` — `refine` is **optional**.

- For each candidate that passes `filter`, compute `t = rayAABB(...)` as today.
- If `refine` is supplied: `t = refine(box, ox,oy,oz, dx,dy,dz, t)`; if it returns `null`,
  **skip this box entirely** (treat as a miss — the ray continues to other boxes/cells).
- Early-out (`best && bestT <= cellExit`) now operates on the **refined** `t` — correct,
  because the exact hit is always **≥** the AABB entry `t` (the exact shape is inside its
  AABB), so a refined hit can only move *later*, never break the "nearest within this cell"
  invariant. The grid stays generic — it knows nothing about `downer`.

### 3.2 `refine` lives in `world.rayHit`, not in the grid

`world.rayHit` (`src/world.js:529`) supplies the `refine` closure. It:

1. Dispatches: `const ex = box.downer && box.downer.rayExact ? box.downer.rayExact(box, ray) : null`.
2. Skips refinement for boxes that are **intentionally AABB** (`box.foliage`, buildings,
   `struct`, `wreck`, terrain) — those have no `rayExact` or are filtered out → fall back
   to `aabbT`.
3. Captures the exact **surface normal** when `rayExact` returns one, so impact decals /
   sparks sit on the round surface (today the normal is derived from AABB faces at
   `world.js:545`).

The hot path is **zero-alloc**: `rayExact` writes its result into a shared scratch
(`{t, nx, ny, nz}`) and returns `t` (a number) or `null`; `world.rayHit` allocates the one
`THREE.Vector3` point/normal per *resolved* hit, exactly as today.

### 3.3 New module: `src/raycollide.js` (THREE-free math)

Pure-JS ray primitives, no `import 'three'` (so they can run in `sim-worker.js` later):

- `rayCapsule(o, d, a, b, r) → t | null` (+ scratch normal)
- `rayConeSegment(o, d, a, b, ra, rb) → t | null` — tapered cylinder for a trunk band.
- `raySphere`, `rayOBB` (oriented box), `rayCylinder`.
- `RayBVH` — `build(positions Float32Array) → bvh` (median / SAH-lite split over triangle
  centroids, flat typed-array nodes, leaf ≤ 4 tris) and `cast(bvh, o, d, maxT) → {t, n} | null`
  (slab node test + Möller–Trumbore at leaves).

All return a `t` along the ray and a surface normal via shared scratch. Fully unit-testable
(pure math) — see §10.

---

## 4. Trees & fallen logs (M1 — the headline)

Map **each box type to a primitive**; the existing AABB boxes stay as the broadphase entry
and keep their destruction wiring (`downer`/`dpart`/`seg`/`felTier`). We only add the exact
narrowphase behind them.

- **Standing trunk** → **one tapered capsule chain along `rec.spine`** (taper already known:
  `trunkR*(1-0.6*y/fullH)+0.1`). The 6 trunk-band boxes all point to the same `rec`; the
  capsule chain is tested **once per ray** via a per-query memo (`rec._exactQid` + cached
  `t`), routing to the single trunk `part`. Destruction (`fellTree`) unchanged.
- **Fallen log** → **one capsule per segment**, attached to that segment's box (1:1 with
  `box.seg`), so damage lands in the chunk you actually hit and sectional destruction is
  preserved.
- **Canopy `foliage` box** → **stays AABB** (intentionally soft, wide, shoot-through).
- **Root collar / branch boxes** (if present) → cheap capsule or kept AABB per case.

### Interaction with `_marchPellet` pierce (preserved, only more precise)

- Foliage: `_softPenetrable` returns `true` (`weapons.js:1654`) → free damage-free pass,
  leaves puff, round continues. **Unchanged.**
- Trunk (`box.tree`, non-foliage): `_softPenetrable` returns `false` → round stops.
  **Logic unchanged**, only *where* / *whether* it stops.

### Intended gameplay consequence (deliberate, not a surprise)

A capsule trunk is **thinner than its AABB**. Shots that today clip the square corner will
now **miss** and pass through to whatever is behind. This is the desired 1:1 behaviour; it
means trees give slightly *less* cover than their square boxes implied — cover-feel shifts
toward realism.

---

## 5. Enemies — per-zone hits (M2)

Replace the single body-AABB result of `EnemyManager.rayHit` with a small **per-type
skeleton**, returning `{enemy, dist, point, zone, mult}`.

- **Hand-authored `HITZONES` table per enemy type** (same pattern as the `WEAPONS` /
  `ENEMY_TYPES` registries) — not auto-derived from the voxel builder (keeps narrowphase
  decoupled from model internals, and tunable):
  - `head` = sphere, `mult 2.5`
  - `torso` = capsule/box, `mult 1.0`
  - `arms` ×2, `legs` ×2 = capsules, `mult 0.7`
  - Primitives scaled by `e.scale`, positioned at `e.pos` + offsets, oriented to facing.
- **Static A-pose skeleton oriented to facing** (optionally a light bob) — no per-frame
  bone reads; cheap and deterministic.
- **Performance: AABB body-reject first.** Keep today's body AABB as the cheap first pass
  in the O(N)-over-enemies loop; only run the per-limb skeleton on the enemy whose AABB the
  ray actually passes. The horde loop stays at today's cost + a tiny refinement on the hit.
- **Lethality (decided):** zone multipliers, **headshot ×2.5, no instakill.** Weak enemies
  still die to one headshot via low HP. Boss exception preserved — Tolo keeps its belly
  bullseye logic in `damage()` (`enemies.js:1054`); non-humanoid enemies (exploders, mini
  Tolos) fall back to a single body capsule (no zone bonus).
- **Wiring:** `_marchPellet` (`weapons.js:1610`) uses the returned `mult` instead of the
  hardcoded `×2.0`.

Dismemberment (limb detachment, gore, legless crawl, AI impact, co-op sync) is a **separate
follow-up PR**; this pass only establishes part identity.

---

## 6. Co-op

- Capsules / skeletons are **deterministic** — built from the same seeded geometry on host
  and client. **No new network message.**
- Authority unchanged: world destruction host-authoritative (`_destructHit` gated
  `hostSim`); enemy damage routes via `claimHit` (`mp.js:982`); host broadcasts
  `bdestroy` / `forestfx`.
- Effect of the narrowphase by role:
  - **Host:** exact shape drives damage + destruction (full 1:1).
  - **Client:** exact shape drives only **local visual feedback** (tracer/impact
    placement, whether a round visually misses a thin trunk). Tree/building damage does not
    occur client-side today regardless — so determinism keeps host & client visuals
    consistent for free.
- The pre-existing "client cannot damage world geometry" gap is **knowingly left as-is**
  (deferred co-op feature, not part of this scope).

---

## 7. What we deliberately do NOT touch

- **Buildings** — voxel cells whose AABB equals the render geometry (`demobuilding.js`
  builds the merged mesh from the same cell descriptors). AABB is already 1:1 for a cube.
  A mesh-BVH would actively *desync* them: the merged geometry is disposed+rebuilt on every
  cell death (per-geometry BVH instantly stale), and APFSDS through-holes are visual-only
  (cell still collides → BVH would "see" a hole the destruction model doesn't). Buildings
  keep AABB; the `refine` hook returns the AABB `t` for them (no `rayExact`). **This is how
  we guarantee destruction keeps working: we don't change its path.**
- **Movement, enemy nav, fire-LOS, terrain/dig, explosion AoE** — different code paths
  (§2), unchanged.

---

## 8. Props (M3) — primitives first, BVH conservatively

Most props fit a primitive, not a BVH:

- sandbag / crate / barricade → **OBB**
- barrel / fuel can → **cylinder**
- barbed wire → thin, not aimed-at → keep AABB
- radio mast / Flopo / wreck / dropped weapon → irregular but decorative or not precisely
  aimed-at → AABB, or BVH only if it visibly matters.

Plan:

1. Map each prop type to its cheapest fitting primitive.
2. **Build the `RayBVH` module** (§3.3) and wire it **only** to props that are genuinely
   irregular *and* where precision matters (likely a small set, possibly none critical).
3. **Cache prop geometry per type** — `terrain-place.js seatProp` currently rebuilds
   geometry per instance; add a per-type factory cache so render **and** BVH/primitive data
   are shared (a clean win independent of BVH).
4. BVH build once per shared geometry, lazily on first use, cached on `geo._rayBVH`;
   THREE-free so it can move to `sim-worker.js` if it ever hitches.

**Rule:** if a shape fits a primitive (box/cylinder/sphere/capsule) → use the primitive
(cheaper, and *more* accurate for round). BVH is reserved for truly arbitrary shapes — it
is in-arsenal infrastructure, not the main workhorse.

---

## 9. Performance guardrails

- Broadphase unchanged → added cost is narrowphase on the 1–5 candidates a ray's DDA
  visits and that pass the AABB filter.
- Per-query memo for multi-box colliders (trees: capsule tested once per ray).
- Enemies: AABB body-reject first; skeleton only on the AABB-passing enemy.
- BVH: cached per shared geometry; primitives preferred.
- **Zero allocation** in the `refine` / `rayExact` hot path (shared scratch vectors, as
  `enemies._min/_max` and `weapons._tmp` already do).
- Always a safe AABB fallback (`refine` → `aabbT` when no exact shape).
- Measure with the existing `GAME.stress` harness; track **p99 / hitches > 100 ms**, in
  **Chrome** (not Safari). Worst-case watch: dense forest full-auto, shotgun pellets ×
  dense cover, horde + rapid fire.

---

## 10. Testing

- **Unit tests** (`tests/`) for `raycollide.js` — pure math is ideal to test:
  - ray hits / misses capsule, tapered cone, sphere, OBB, cylinder (axis-aligned and
    oblique; grazing near-miss must return `null`).
  - `RayBVH` build + cast vs a brute-force triangle reference on a known voxel mesh
    (same nearest `t`, same triangle).
- **Grid integration test** — `grid.raycast` with a `refine` that rejects a box: the ray
  must continue to a farther box (no false early-out).
- **In-browser verify** (Chrome, no-store server): F3+B overlay shows round shapes matching
  the meshes; shoot past a thin trunk and confirm the round passes through; confirm
  headshot ×2.5 vs body; confirm a felled-log segment takes damage only where hit; confirm
  a building still breaches/collapses exactly as before (regression).

---

## 11. Debug / verify (F3+B extension)

Extend `src/debughitbox.js` (today draws AABB line boxes) to also draw the **real shapes**
in a distinct colour — capsule circles/outlines for trunks & logs, the per-enemy skeleton —
so the 1:1 fit is verifiable by eye. Same X-ray, R=30 m, capped style as the existing
overlay. This is the same in-game verify tool used for sectional destruction.

---

## 12. Phasing

- **M0 — Foundation.** `refine` param in `grid.raycast`; `refine` dispatch in
  `world.rayHit`; new `src/raycollide.js` primitives + `RayBVH`; unit tests. *(independent
  of forest code.)*
- **M1 — Trees & logs.** Trunk capsule chain + per-segment log capsules; preserve
  foliage/pierce; capsule normals; F3+B overlay for trunks/logs. *(the headline.)*
- **M2 — Enemy zones.** Per-type `HITZONES` skeleton; `enemies.rayHit` returns zone+mult;
  AABB body-reject first; `_marchPellet` uses mult; F3+B skeleton overlay.
- **M3 — Props.** Prop→primitive mapping; wire `RayBVH` conservatively; per-type geometry
  cache in `seatProp`.
- **Follow-up PR (out of scope here):** visual dismemberment.

Each milestone is independently shippable and behind the same hook; each can fall back to
AABB.

---

## 13. File-by-file touch list

- `src/raycollide.js` — **new.** Ray primitives + `RayBVH` (THREE-free).
- `src/grid.js` — add optional `refine` param to `raycast` (generic; no `downer` knowledge).
- `src/world.js` — `rayHit` supplies the `refine` closure; capsule normal capture.
- `src/forestdemo.js` — attach `rec.rayExact` (trunk capsule chain; per-segment log
  capsules); per-query memo. Keep `_buildTrunkBands` AABBs as broadphase.
- `src/enemies.js` — `HITZONES` table; rewrite `rayHit` to return `{zone, mult}`; AABB
  body-reject first.
- `src/weapons.js` — `_marchPellet` consumes `eHit.mult` instead of hardcoded `×2.0`.
- `src/terrain-place.js` — per-type prop geometry cache; attach prop `rayExact`
  (primitive or BVH). *(M3)*
- `src/debughitbox.js` — draw real shapes (capsules, skeletons). 
- `tests/` — `raycollide` unit tests; grid `refine` integration test.
- *Untouched by design:* `demobuilding.js`, `destruct.js` core routing, `player.js`,
  `pathing.js`, `flowfield.js`, `navgraph.js`, `fire.js`, `dig.js`, `mp.js`.

---

## 14. Open questions / deferred

- **Dismemberment** — separate PR (limb detachment, gore, legless AI, co-op sync).
- **Client-can-damage-world co-op gap** — pre-existing, separate feature; not opened here.
- **Branches on standing trees** — confirm in M1 whether standing trees carry separate
  branch boxes or branches live inside the foliage AABB; map accordingly.
- **BVH worker offload** — only if main-thread build ever hitches (build is one-time per
  shared geometry).
- **Rebase** — when the `feat/forest-sectional-destruction` PR merges to `main`, rebase
  this branch onto `main`.
