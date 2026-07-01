---
name: buildgen
description: Use when designing, researching, or building ANY map building / structure / POI for the ENGENDROS PURGE open-world map — a Soviet factory hall (цех), ТЭЦ + chimneys + cooling tower, panelák / city block, school / admin block, airfield hangar, water tower, kolkhoz barn, ruins, bunker, watchtower, or any enterable or landmark structure. Drives the data-driven buildgen harness (sibling of modelgen) — mandatory player-intent questionnaire + reference-image vision-confirm gate, then sourced dossier → JSON spec → lint → viewer self-verify → IN-GAME verify → placement. Also owns making buildings DESTRUCTIBLE — wiring them to the live voxel-cell + gravity-collapse destruction engine (BuildingDestruct, as shipped on ?map=forest) — so trigger on "make it destructible / the building should break / collapse" too. SUPERSEDES voxel-building-modeling. Trigger even when the user just says "build the school / make a factory / add a tower" — not only when they say "skill" or "buildgen".
---

# buildgen — building harness (ENGENDROS PURGE)

Build believable, real-referenced **Soviet structures** as data-driven specs, then self-verify
them in a viewer AND in the running game. Harness (all LIVE on main): `tools/buildgen/` +
`src/buildings/` + `buildings/<id>/`, plus the destruction runtime
`src/destruct-lab/building-destruct.js` (see the Destruction section). **Design specs:**
`docs/superpowers/specs/2026-06-10-buildgen-harness-design.md` (harness) and
`docs/superpowers/specs/2026-06-20-destruct-demo-merge-design.md` (destruction model). Top
layer of the modeling family: guns → `voxel-weapon-modeling`, room props → `modelgen`,
buildings → **this**.

**Scope split:** the harness owns the **exterior shell + skeleton + entrances + colliders**.
Interiors are furnished by **composing modelgen props** (`propRef`) plus a few hand-coded
interactive hooks (door/gate on E, behind `hostSim`). Golden references: `src/gatehouse.js`
(interior composed object-by-object) and `src/airfield.js` (`glassPane` — real see-through
windows that already ship).

## The laws (validator/assert-enforced — author right the first time)

1. **Specs are METRES**; `footprint {w,h,d}` required; parts must stay inside it (modelgen's
   bounds rule). `maxDim` default 60 m — raise only for genuine landmarks.
2. **Wall thickness ≥ 0.2 m** (thinner only with `detail:true` on non-structural trim).
3. **Every storey declares a floor** covering ≥ 80 % of the footprint.
4. **The roof closes the top** — a roof operator must span the footprint. No open boxes.
5. **Openings are real GAPS** (`doorway`/`windowBays`/`gateOpening`) — never a thin box
   "door". ≥ 1 walkable entrance; interiors with `interiorWall` have **≥ 2 exits**; walkable
   rises ≤ 0.62 m step-up.
6. **No coplanar same-normal overlapping faces** (z-fight property test); details sit ~4 mm
   proud or embed ~4 mm.
7. **Tiled textures, UVs in metres** — UVs are generated from real face dimensions
   (`RepeatWrapping`, `texture.repeat = 1`); one stretched texture across a facade is rejected.
8. **Seeded determinism** — all procedural-texture randomness comes from the spec-level `seed`
   via `makeRNG` (`util.js`), NEVER the unseeded `rr`/`ri`/`pick` gameplay family. Same spec ⇒
   pixel-identical render ⇒ round-to-round render diffs stay meaningful.
9. **`src` = `dossier#<key>`** for every real-world dimension. Prose is not provenance; an
   unsourced fact goes to `needs[]` and is NOT built. *(Modelgen's mm-incident law: an ammo box
   authored in mm once built 280 m wide.)*
10. **`propRef` contract** — the referenced modelgen model exists in the registry, fits its
    anchor zone, keeps `scale = 1.0`, and never blocks a required doorway.
11. **Intent coherence** — `furnitureReady` ⇒ ceiling ≥ 2.6 m + anchor zones; `roofAccess` ⇒
    stairs/ladder; `glassWindows` ⇒ panes use the glass material. Intent answers are frozen
    into `spec.intent`; editing them post-hoc to silence the validator is a bypass.
12. **`placeBuilding` yaw ∈ {0, 90, 180, 270}** (runtime assert). `world.boxes` are
    axis-aligned AABBs — at right angles the interp swaps extents exactly; any other angle
    silently ships wrong colliders.
13. **Pathing gate (WARN)** — enterable buildings: entrances connect by a clear walkable span;
    props/interior walls must not make an "enterable" building impassable in practice.
14. **Perf guard-rails (WARN; numbers provisional)** — 1 merged mesh per material; ≤ 8
    materials (12 landmark); ≤ 32 collider AABBs (64 large enterable); textures ≤ 512²;
    triangles WARN > 8k / ERROR > 20k. *(The collider cap governs the STATIC placement path;
    a destructible building replaces plan colliders with per-cell AABBs — see Destruction.)*

Diagnostics: **ERROR** blocks approval; **WARN** passes only with a one-line justification in
`BUILD.md`; INFO is advisory. Gate everything with the pre-flight linter:

```bash
node tools/buildgen/lint.mjs buildings/<id>
node --test 'tests/buildgen/*.test.mjs'   # after ANY operator/validator change (glob, not bare dir)
```

## The kit (coordinates · operators · materials · scale anchors)

**Coordinates (hard):** X = east(+)/west(−) · Y = up · Z = north(+)/south(−) · 1 u ≈ 1 m.
Origin = **centre of footprint at ground level** (y = 0 is the floor). `at` is local building
space; `face: "N"|"S"|"E"|"W"` resolves in local space **before** world `yaw`. `rot` =
`[x,y,z]` degrees about `at`.

**Operator families** (`src/buildings/operators/`, vocabulary in `manifest.js`; all
`three`-free, emitting neutral geometry — only `interp.js` realizes THREE):
- *Shell/massing:* `shellBox` (closed shell: 4 thick walls + base floor), `floorSlab`,
  `column`, `interiorWall` — floor-anchored.
- *Roofs (custom geo):* `flatRoof`, `gableRoof`, `hipRoof`, `sawtoothRoof` (цех north-light),
  `parapet`. Visual roof may be angled; **its collider stays the box under it**.
- *Facade:* `windowBays` (ONE master module duplicated ×N — the T-62 "zub" lesson: N
  hand-placed copies drift, one master duplicated is symmetric to 0.000), `doorway`,
  `gateOpening`, `balcony`, `cornice`, `pilaster` — face-anchored (resolved from `face` +
  storey).
- *Landmarks:* `chimney`, `coolingTower`, `gasholder`, `waterTank`, `mast` — floor-anchored
  cylinders/hyperboloids.
- *Signage:* `sign` / `stencil` / `poster` (Cyrillic CanvasTexture, ~4 mm proud).
- *Reuse:* `propRef` (modelgen prop), `repeat` (module ×N along an axis).
- Adding an operator = matching extents fn + `SAMPLES` entry so the z-fight + containment
  property tests cover it (modelgen rule).

**Materials by name** (`src/buildings/palette.js`, extends the modelgen palette): tiled
CanvasTextures `brickRed/brickGrey`, `concretePanel` (seam grid), `corrugatedTin`, `plaster`,
plus glass. Raw hex in a spec is rejected. **The material also decides how the surface FIGHTS
BACK** — each `mat` maps to a destruction tier (bullet chip vs breach vs shoot-through; see
the Destruction section) — so choose it as level design, not just as paint. **Glass = the airfield recipe** (`glassPane`):
`transparent: true, opacity ~0.3, DoubleSide, depthWrite: false`, separate pane mesh inside the
window gap — `depthWrite:false` sidesteps sorting artefacts; keep panes few and coplanar-free.

**Scale anchors** (sanity rules of thumb — the dossier always overrides): storey 3.0–3.3 m
(цех 6–12 m) · door 2.1–2.4 h × ≥ 1.6 w (FPS-friendly) · window sill 0.8–1.0 · window 1.2–1.8 h ·
plinth/socle 0.4–0.8 · parapet 0.6–1.0 · corridor ≥ 1.4 · enterable ceiling ≥ 2.6 · brick course
0.075 · concrete panel ~3.0 × 2.8.

## Texture variation — the repeat must NEVER read (owner feedback, 2026-06-11)

A uniform tile turns a facade into cloned wallpaper — the `_smoke` fixture showed it: every
brick cluster repeating in a visible grid, the roof one monotone rib field. Ugly. When
authoring or upgrading a material generator (`textures.js`), build variety at three scales —
ALL of it seeded through `makeRNG` (law 8: never `Math.random`, re-renders stay pixel-identical):

1. **Inside the tile** — per-element variation, not a flat field: each brick rolls its tone
   (hi/mid/lo + the occasional bright or burnt brick + weathered lower edges); corrugated
   sheets get per-rib shade wobble, sparse rust runs and the odd replaced-panel patch; concrete
   panels differ in stain/streak layout. A tile where every element is `mid` is wallpaper.
2. **Across the repeat** — widen the visual period: bake a **2×2 or 3×3 block of DIFFERENT
   variants into ONE canvas** (e.g. four panel modules with four stain patterns in one 512²
   texture, tile = the whole block) so the repeat period is 2–3× the physical module. Cheap,
   seeded, no engine change. Roofs especially: long roof planes need seam lines / patch panels
   every few metres, or they read as one flat sticker from any distance.
3. **Per face** — if the same pattern still lines up identically on every wall (same brick at
   the same height on N and S), add a seeded **per-face UV offset** in `interp.js` (translate
   the metric UVs by a hash of face+seed). This is a small interp feature to add WHEN a build
   round shows the problem — don't pre-build it speculatively.

**Geometry-anchored weathering beats more noise:** splash-zone darkening at the plinth, streaks
under the sills, soot above openings (facade grammar) break uniformity far better than cranking
noise amplitude — they are *placed*, not random. Verify at **q34 + graze + far300**: if you can
point at the same brick cluster repeating on a grid, or the roof reads as one pattern, fix the
generator before approval — more proud geometry is not the cure for a flat texture.

**Readable signage (ЛПР-1 retro, applies everywhere):** any sign/plate the player can walk up
to and read — «ПРОХОДНАЯ», shop fronts, warning plates — is REAL legible Cyrillic via
CanvasTexture (the gatehouse console / «ЧАСОЗБОР» dial / modelgen `decal lines:[…]` bar), never
paint bars pretending to be text. The азбука must actually read up close.

## Facade grammar — what makes it read as a real building

The modelgen heuristic ("6–20 parts or it reads as a placeholder") scaled up: a believable
building is typically **12–40 parts, ≥ 3 materials** (wall + roof + trim + glass), composed
vertically as **socle → wall field with a window RHYTHM → cornice/parapet → roof**. A facade
missing its socle and cornice reads as a cardboard box no matter the texture.
- Window rhythm comes from the dossier (bay count + spacing) — build one master bay, duplicate.
- The entrance is emphasized (steps, canopy, sign) — players must read "this is the way in"
  from 50 m (that's level-design legibility, not decoration).
- Weathering, subtle and seeded: splash-zone darkening at the base, streaks under sills, soot
  above openings.
- Cyrillic signage is era-correct: СЛАВА ТРУДУ / ОПАСНО / ЦЕХ №3 / building-purpose boards.
- Interiors get a grounding shadow band at wall/floor junctions (the layered-shading `slot`
  tone) and a ceiling lamp if enterable — gatehouse precedent.

## Destruction — buildings break (the LIVE forest model)

Every new building must decide how it breaks. The live engine is **`BuildingDestruct`**
(`src/destruct-lab/building-destruct.js`) — the model shipped on `?map=forest` (PR #102/#103,
the buildgen `_smoke` cottage + crates + colonnade in `src/forestscene.js` are the working
reference). ⚠ The older breach-only engine from PR #104 (`src/buildings/destructible.js`) was
**CLOSED unmerged — a dead end; never reference or resurrect it.**

**How it works — "lazy split":** every solid `box` prim from `planBuild(spec).prims` is diced
into a lattice of ~0.45 m **cells**, each tagged with the prim's `mat`. Idle cost is zero: the
pristine `buildBuilding()` merged mesh renders until a material bucket takes its first damage;
then only that bucket is rebuilt from its surviving cells with the SAME triplanar metric UVs +
seeded CanvasTexture — the swap is seamless. Glass panes are hero parts (shatter burst + a
clinging jagged remnant); the `sign` op keeps its lettered mesh and **detaches and tumbles**
when the wall cells behind it die (< 40 % backing alive).

**Materials are the damage model** (`MAT_MAP` in building-destruct.js → `MATERIALS` tiers in
`src/destruct.js`):

| spec `mat` | destruct material | tier | how it behaves under fire |
|---|---|---|---|
| `glassPane` | glass | 0 | any hit shatters; round passes through |
| `wood`, `plaster` | wood | 1 | SMG/rifle chew through it; degradable soft cover |
| `corrugatedTin` | sheetmetal | 2 | rifle chews slowly, HMG fast; shoot-through |
| `brickRed`/`brickGrey` | brick | 3 | bullets only chip; **HE (bazooka) breaches** |
| `concrete`/`concretePanel` | concrete | 4 | shrugs the bazooka; tier-4 blasts + APFSDS tunnel |
| `reinforcedConcrete` | reinforcedConcrete | 6 | nothing in the current roster cracks it (bunker armour) |

Weapon side: `PEN_BY_CLASS` (`weapons.js`) — pistol 0 · smg/rifle/shotgun 1 · sniper/hmg 2 ·
launcher 4 · cannon 5. `pen < tier` ⇒ cosmetic chip; `pen ≥ tier` chews cell HP → carves it;
on tier ≤ 2 the round carries on through the hole. HE removes every cell with `tier ≤
blast.tier` inside r1 (default blast tier 3 = opens brick, not concrete); APFSDS drills a clean
tunnel until it meets a cell with `tier > pen`. Per-building physics override via the `matMap`
ctor option — a bunker passes `{ concrete: 'reinforcedConcrete' }` and keeps its visual
material while upgrading the armour.

**Gravity — nothing levitates:** after every event a support flood runs from grounded cells
(bottom at local y ≈ 0) through the cell adjacency graph; anything unreached detaches as ONE
textured tumbling chunk (slow heavy fall, rests ON the terrain). Shoot the walls out → the roof
caves in; knock the columns out → the slab drops (the colonnade). Digging under a wall
(`undermine`, via the shovel/craters deform field) kills the footing cells and the same cascade
runs. Concrete breaks sprout rebar rods at the break faces.

### Authoring rules for a destructible building

- **Box massing only is fully destructible.** `_voxelize` dices only `kind:'box'` solids —
  wedge/prism/cyl prims (gable/hip/sawtooth roofs, chimneys, cooling towers) get NO cells, so
  on the destructible path they have neither collision nor damage. Until `_voxelize` learns
  wedges/cyls: author destructible buildings as box massing (`shellBox` / `floorSlab` /
  `flatRoof` / `parapet` / `column` — the `_smoke` cottage pattern); a gabled or cylindrical
  landmark ships static, or the engine gets extended FIRST. **Never mix wedge + box prims in
  one material on a destructible building** — the first damage to that bucket rebuilds it from
  cells only and the wedge geometry silently VANISHES.
- **Think in cells:** CELL = 0.45 m → the `_smoke` cottage ≈ 1200 cells ≈ 1200 grid-indexed
  AABBs (fine). Cell count scales with wall area — a 60 m цех would mint tens of thousands.
  Keep destructible massing small/medium; oversized landmarks stay static for now.
- Walls ≤ ~0.45 m thick stay **one cell thick** → a breach goes clean through (desirable).
- Compose materials as encounter design: the wood door players shoot through, the brick walls
  a bazooka opens, the concrete core that survives the wave — that's level design now.
- Fire: `MATERIALS` carry `fuel`, but BuildingDestruct cells do **not burn yet** — don't
  promise molotov-breaching in an intent answer.

### The two placement paths — pick exactly ONE per building

- **Static** (indestructible): `placeBuilding(world, scene, id, x, z, yaw)` (`registry.js`) —
  plan colliders as static AABBs, yaw ∈ {0, 90, 180, 270}. For background/landmark buildings.
- **Destructible** (the forest pattern — `forestscene.js _placeCottage` is the reference):

  ```js
  const spec  = await (await fetch('buildings/<id>/spec.json', { cache: 'no-store' })).json();
  const built = buildBuilding(spec, { skipPropCheck: true });
  built.group.position.set(x, terrainMinUnderFootprint, z); scene.add(built.group);
  const bd = new BuildingDestruct({ group: built.group, prims: planBuild(spec).prims,
                                    scene, debris, seed: spec.seed, world, game });
  bd.netId = '<unique-stable-id>'; forestScene.buildings.push(bd);
  ```

  Collision comes from the per-cell AABBs BuildingDestruct registers (`box.downer` routes
  `weapons.js _destructHit` back; dead cells retire their boxes → you can WALK through a
  breach). **Never also `placeBuilding` the same building** — double colliders. ⚠ **Yaw must
  be 0 today**: the crush/undermine bridge assumes an unrotated group — extend that math before
  rotating a destructible building. Seat the group on the terrain MIN under the footprint.
  `eager: true` renders straight from cells — for prim-only structures without a buildgen spec
  (crates, the colonnade).
- On `?map=forest` register into `game.forestScene.buildings` — the scene is the
  `world.demoBuilding` **facade** that fans `applyBlast`/`applyPenetration`/`applyCrush`/
  `undermine` + `update(dt)` + co-op sync to every building. A destructible building on a
  future map needs the same facade contract wired once.

### Co-op

Host authority is built in (`applyHit/applyBlast/applyPenetration` gate on `_hostSim`); the
host streams `bdestroy {id, cells}` deltas and `netSnapshot()` covers late join. `bd.netId`
must be unique AND identical on every peer — placement must be deterministic (fixed coords or
the seeded layout rng, never `Math.random`). The 2-PC live test remains a manual gate.

## The pipeline — per building, in order

### Phase 0 — Scope exactly ONE building
Era + type precisely ("1950s brick zavod admin block", not "an office"). Never batch.

### Phase 1 — INTENT GATE (mandatory, AskUserQuestion)
Never start authoring before this. Standard set: enterable or façade-only? · furniture-ready
interior? · real transparent windows? · roof access / verticality? · gameplay role
(cover / landmark / loot-hub / hot-zone / through-route)? · entrances count + sides? ·
**destructible?** · interior lighting day/night? Freeze answers into `spec.intent` (law 11
enforces them). The destructible answer picks the placement path AND constrains the massing
(box prims only, size budget, material damage-model — see Destruction); on terrain maps
(`?map=forest`) destructible is the default expectation, so a "no" needs a reason. Question
thresholds live in the player-friendly-building research doc — keep both in sync.

### Phase 2 — REFERENCE GATE (vision-confirm, mandatory)
Owner drops reference images onto the viewer (upload endpoint saves to `buildings/<id>/ref/`)
or into chat. **`Read` every image and state out loud what you see** — structure, materials,
roof type, era, window rhythm, weathering — then discuss until you and the owner agree what
the target IS and what we want to achieve. No dossier, no spec before agreement.

### Phase 3 — Research dossier (dispatch a research subagent)
Sourced facts only → `buildings/<id>/ref/dossier.json`: overall dims, storey count + heights,
window bay count + module dims (mm, each with a `src`), roof type + pitch, materials per
surface, entrance positions, signage strings, era. Three reference images triangulate; one
photo lies. Gaps → `needs[]`, never guessed.

### Phase 4 — Author `spec.json`, then lint
Operators + named materials, mm → m, every dimension cites `dossier#`. Compose by the facade
grammar; map every dossier feature to a part or an explicit `needs[]` omission. Then
`node tools/buildgen/lint.mjs buildings/<id>` until clean — BEFORE the viewer.

### Phase 5 — Viewer self-verify loop (where model quality happens)
Serve a fresh port (`python3 -m http.server <port> --directory "/Users/macmini1/game 4.8"`),
open `tools/buildgen/viewer.html?model=<id>`, drive `window.VIEWER` via Playwright:
- `VIEWER.load('<id>')` → `{dims, boxes, needs}` — **compare dims to the dossier immediately.**
- Canonical sweep: front / q34 / side / back34 / top / graze + **300 m fog shot** + **first-person
  interior walk** + **ghost (1.75 m human)** + **collider overlay** (yellow AABBs vs visual).
- Capture via `VIEWER.snapshot()` (PNG dataURL → `buildings/<id>/renders/`), **`Read` every
  PNG**. Snapshots self-fail on blank/single-colour images, model out of frustum, empty
  collider overlay, or missing ref overlay — the modelgen white-screenshot incident, mechanised.
- List concrete defects per round → fix spec → reload → reshoot. Log rounds in `BUILD.md`.
- ⚠ Module-cache trap: `VIEWER.load()` re-fetches the spec JSON, but edits to
  `src/buildings/*.js` need a hard reload with a fresh `?cb=`.

### Phase 6 — IN-GAME verification (the viewer proves the model; only the game proves the building)
Place it on the feature branch via its chosen path (static `placeBuilding` / destructible
BuildingDestruct registration), serve fresh, then in the real game: fly the dev freecam
(`Ctrl+F` / `N` / `?fly=1`) — **day AND night exterior**, the 300 m fog approach, and a
**first-person interior walk with the real player controller** (collide with walls, climb
the steps, use every exit). Console errors = 0; `GAME.world.boxes` delta sane; confirm the
served `?v=` matches disk (stale-server trap).

**Destructible buildings additionally** (on `?map=forest` the forced `DEMO_LOADOUT` — stg44 /
bazooka / molotovs / apfsds — covers every damage class): rifle chips brick but chews wood ·
bazooka breaches a brick wall and the player **walks through the hole** (collision retired) ·
APFSDS tunnels a wall · shoot out enough wall that an orphaned roof section FALLS and rests on
the terrain · the sign detaches when its backing wall dies · panes shatter · check
`GAME.forestScene.buildings[i].stats()` (cells/carved/fallers) and 0 console errors throughout.

### Phase 7 — Approve + integrate
Show the final renders + in-game shots, then **end with an AskUserQuestion proposing CONCRETE
next steps** (named defects/`needs[]` items — never "anything else?"). On approval: the world
gains a single placement call — static `placeBuilding(...)` or the destructible
BuildingDestruct registration in the map scene (never inline geometry) — add an Admin viewer
entry, hand interactive hooks (doors/gates on E) their `hostSim` guard, cache-bust ritual if
it ships.

## Definition of done

Lint clean · tests green · canonical render set + ghost + collider + 300 m shot at the FINAL
spec · in-game day/night/interior shots · 0 console errors · ≥ 2 walkable exits · **no readable
texture repeat at q34/graze and the roof is not one flat pattern** (variation rules above) ·
if destructible: **breach + walk-through + orphan-collapse + sign/pane detach verified in-game**
(Phase 6 list) and the co-op 2-PC gate is flagged as pending · every PNG actually `Read` ·
`BUILD.md` updated · WARNs justified.

## Gotchas / red flags

- **No building authored directly in `world.js`** — spec → lint → viewer → in-game → registry,
  always. This is the #1 anti-backslide rule.
- **Batching** ("let's do the whole district") → stop; one building per cycle.
- **Never double-place**: a building goes through `placeBuilding` OR BuildingDestruct, not
  both — otherwise it has two collider sets and dead cells leave invisible walls.
- **PR #104 (`src/buildings/destructible.js`) is a CLOSED dead end** — the live model is
  `src/destruct-lab/building-destruct.js`. Don't copy patterns from the closed PR.
- **Wedge/cyl prims on a destructible building** = invisible-to-bullets AND vanish on the
  bucket's first rebuild (see Destruction) — box massing only until `_voxelize` is extended.
- **Destructible + rotation don't mix yet** — yaw 0 only (crush/undermine bridge assumes an
  unrotated group).
- **Skipping a gate** (intent or reference) → generic building, redo. They are not optional.
- **node --test on a bare dir FAILS on Node 25** → always the glob. No `package.json` anywhere;
  operator modules must NOT import `three`.
- **This Mac hoards stale `http.server` zombies** → fresh port + `--directory` + confirm the
  served bytes are yours before trusting any render or in-game shot.
- **Never `rm -f *.png` in the repo root** (tracked QA screenshots); renders live in
  `buildings/<id>/renders/`.
- **Anti-bypass** (same lie, extra steps): puffed footprint to swallow a misplaced part ·
  junk-but-resolving `dossier#` keys · `collide:false` to dodge collider laws · `detail:true`
  on a structural wall · post-hoc `intent` edits · inflated `maxDim`. The validator catches the
  mechanical cases; you own the honest ones.
- `needs[]` is a feature, not shame — an honest gap beats an invented cornice, and it aims the
  next research pass.
