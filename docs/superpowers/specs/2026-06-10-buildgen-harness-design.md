# `/buildgen` — building harness design (ENGENDROS PURGE)

**Date:** 2026-06-10
**Status:** design / spec (pre-plan)
**Supersedes the prose-only `voxel-building-modeling` skill for NEW buildings.**

## Why

Today `modelgen` is a real *harness* — JSON spec + operators + a **validator** that
mechanically catches lies (wrong units, footprint mismatch, z-fighting). That is why props
come out consistent. `voxel-building-modeling` is **prose only**: research → "now hand-build
it in `world.js`". Nothing mechanically checks the result, so buildings come out with the exact
defects the owner is tired of: **single-pixel walls, missing floors, overlapping/stretched
textures, wrong angles, open-top boxes.**

This design gives **buildings the modelgen treatment**: a sibling harness `/buildgen` with
building-specific operators, a validator that enforces structural correctness, a self-verify
viewer, and — new for buildings — a **player-experience intent gate** and a **reference-image
vision-confirm gate** before any authoring.

## Locked decisions (from brainstorming)

1. **Full harness**, sibling of modelgen — not just a prose rewrite.
2. **Scope = exterior shell + skeleton + entrances + colliders.** Interiors are furnished by
   composing `modelgen` props (`propRef`) plus a few hand-coded interactive hooks. The validator
   judges the exterior and the colliders.
3. **Name `/buildgen`**, own home, shares modelgen's palette + viewer-interp *patterns* but has
   its own operators/validator.
4. **New buildings only.** Existing hand-coded buildings (gatehouse, strongpoint, bunker,
   airfield) stay as-is — **no migration** (live, no tests, high blast radius). The **gatehouse
   is the golden reference** for "compose the interior from props."
5. **Pillar A — mandatory intent questionnaire** every time, backed by a researched
   best-practice doc on player-friendly building design.
6. **Pillar B — reference drag-and-drop into the 3D viewer + AI vision-confirm gate** before
   authoring, via a **small local upload endpoint** that saves dropped images to
   `buildings/<id>/ref/`.
7. **First proof building deferred** — it is chosen at first run *through* the intent
   questionnaire, not pre-picked here.

## File layout (sibling of modelgen)

```
tools/buildgen/
  server.mjs        small static server + /upload endpoint (dev-only, for ref drag-drop)
  lint.mjs          pre-flight: spec + dossier cross-check + bounds vs footprint + building laws
  viewer.html       building viewer (ghost human, collider overlay, ref overlay, drag-drop)
  viewer.js         window.VIEWER driver
src/buildings/
  spec.js           the validator (building laws) — pure, no `three`
  interp.js         spec -> merged THREE meshes + AABB collider list (the ONLY THREE consumer)
  palette.js        materials (extends modelgen palette with tiled CanvasTexture materials)
  registry.js       registerBuilding(id, spec) / placeBuilding(world, scene, id, x, z, yaw)
  operators/        shell.js roof.js facade.js landmark.js sign.js refs.js manifest.js extents.js _math.js
buildings/<id>/
  spec.json         the building spec
  ref/dossier.json  sourced research (+ dropped reference images, gitignored)
  renders/          self-verify render set (committed)
  BUILD.md          per-round build log
buildings/_smoke/   tiny test fixture (NOT shipped) — shell+floor+roof+doorway+window+tiled
                    material+collider; exercises validator+viewer before the first real building
tests/buildgen/     node --test suites (operator extents + z-fight + validator-law fixtures)
docs/superpowers/specs/2026-06-10-player-friendly-building-design.md   research doc (Pillar A source)
.claude/skills/buildgen/SKILL.md
```

**Operator purity (inherited from modelgen):** `src/buildings/operators/*` must NOT
`import three`; they are node-testable and emit a **neutral geometry description** — boxes plus
parametric *prisms / wedges / cylinders / triangle lists*. Only `interp.js` realizes THREE.
This keeps the validator and the property tests pure while still letting operators describe
angled roofs and cylinders (which modelgen's box-only ops cannot).

## Spec format (a building is not a prop)

```jsonc
{
  "id": "kombinat-admin",
  "footprint": { "w": 18, "h": 9, "d": 12 },     // metres — collider box + scale sanity
  "maxDim": 100,                                  // landmarks (chimney, tower) raise the cap
  "intent": {                                     // Pillar A answers, frozen into the spec
    "enterable": true, "furnitureReady": true, "glassWindows": true,
    "roofAccess": false, "role": "loot-hub", "entrances": ["N","S"], "destructible": false
  },
  "storeys": [ { "y": 0, "h": 3.2 }, { "y": 3.2, "h": 3.0 } ],
  "materials": { "wall": "brickRed", "roof": "tinSheet", "trim": "concrete", "glass": "glassPane" },
  "parts": [
    { "op": "shellBox",   "at": [0,0,0], "args": { "wall": 0.3 }, "collide": true, "src": "dossier#footprint" },
    { "op": "floorSlab",  "storey": 0, "src": "dossier#floor" },
    { "op": "floorSlab",  "storey": 1, "src": "dossier#floor" },
    { "op": "windowBays", "face": "S", "count": 5, "module": { "w": 1.2, "h": 1.6, "sill": 0.9 },
      "glass": true, "src": "dossier#window-rhythm" },
    { "op": "hipRoof",    "pitch": 30, "overhang": 0.4, "collide": false, "src": "dossier#roof" },
    { "op": "doorway",    "face": "N", "width": 1.6, "height": 2.4 },
    { "op": "sign",       "face": "N", "text": "ЗАВОДОУПРАВЛЕНИЕ", "src": "dossier#signage" },
    { "op": "propRef",    "model": "desk-2tumba", "at": [-3,0,2], "yaw": 90 }
  ]
}
```

**Coordinate system (hard definition — restated from CLAUDE.md so doors/windows can't land on
the wrong wall):**
- **X = east(+)/west(−)**, **Y = vertical height(+up)**, **Z = north(+)/south(−)**; **1 unit ≈ 1 m.**
- **Origin = centre of the footprint at ground level** (`y = 0` is the floor).
- A part's `at: [x,y,z]` is in **local building space**; `face: "N"|"S"|"E"|"W"` is resolved in
  local space **before** the world `yaw` of `placeBuilding` is applied.
- `rot` is `[x,y,z]` degrees about the part's `at` (modelgen convention).

What is new versus the modelgen spec:
- **`intent`** — the frozen answers from the Pillar A questionnaire (drives validator strictness
  + integration hooks: `glassWindows` -> the `glass` material/transparency path; `furnitureReady`
  -> min ceiling height + anchor checks; `roofAccess` -> a stair/ladder requirement).
- **`storeys`** — explicit floor levels; each requires a covering floor slab.
- **`face` openings as real GAPS** (`doorway`, `windowBays`, `gateOpening`) — never thin boxes.
- **`collide` flag per part** with a per-operator default (shell/floor/column collide;
  roof/trim/sign/balcony-rail are visual-only).
- **`propRef`** — reuse a registered `modelgen` prop for the interior (the gatehouse lesson).

## Operators (families)

- **Shell / massing:** `shellBox` (closed shell: 4 thick walls + base floor, `wall` thickness
  param), `floorSlab`, `column`, `interiorWall`.
- **Roofs (custom geometry):** `flatRoof`, `gableRoof`, `hipRoof`, `sawtoothRoof` (цех
  north-light), `parapet`. The visual roof is angled; its collider stays the box under it.
- **Facade / openings:** `windowBays` (a master module duplicated × N at a pitch — *build one
  master window, duplicate it*, the T-62 "zub" lesson), `doorway`, `gateOpening`, `balcony`,
  `cornice`/`trim`, `pilaster`.
- **Landmarks (cylinders):** `chimney`, `coolingTower` (hyperboloid), `gasholder`, `waterTank`,
  `mast`.
- **Signage:** `sign` (Cyrillic CanvasTexture, proud-offset), `stencil`, `poster`.
- **Reuse:** `propRef` (insert a registered modelgen prop), `repeat` (generic module × N along
  an axis).

Adding an operator follows modelgen's rule: keep it `three`-free, give it a matching extents
function (the bounds validator depends on it), and a z-fight + extents-containment property test
fed by a `SAMPLES` entry.

## Materials = tiled CanvasTexture (solves "not voxel-limited" + non-overlapping textures)

`palette.js` extends the modelgen palette with **procedural `CanvasTexture` materials**:
`brickRed` / `brickGrey` (brick courses), `concretePanel` (panel grid with seams),
`corrugatedTin` (vertical ribbing), `plaster`, `glassPane` (semi-transparent + mullion frame),
`glassGrid`. They tile with `NearestFilter`, so a texture is
**never stretched or overlapping** — always tiled per real module. The 5-tone vertex-colour
shading from modelgen still rides on edges/shadow bands.

**Tiling = UVs in metres.** Because one shared material spans faces of different sizes, tiling
is implemented by generating UVs from the face's real dimensions (metres / tile size) with
`RepeatWrapping` and `texture.repeat = 1` — never by stretching one texture across a facade and
never via per-face `texture.repeat` (which can't differ per face on a shared material).

**Determinism (consistent results law):** every procedural texture derives ALL randomness
(brick tone jitter, weathering streaks, seam noise) from a spec-level `seed` through the seeded
`makeRNG` family in `util.js` — never the unseeded gameplay helpers (`rr`/`ri`/`pick`). The same
spec must render pixel-identical across runs, so render diffs between build rounds stay
meaningful.

**Glass:** reuse the airfield's proven recipe (`src/airfield.js` `glassPane`):
`MeshLambertMaterial({ transparent: true, opacity ~0.3, side: DoubleSide, depthWrite: false,
slight emissive })` as a separate pane mesh inside the window gap. `depthWrite: false` sidesteps
transparency-sorting artefacts; keep panes coplanar-free and few per facade.

## Validator — the laws (modelgen-style)

**Diagnostic levels** (modelgen today is all-hard-errors and works — we add only a light
ERROR/WARN split because some building rules are genuinely advisory):
- **ERROR** — cannot be approved (laws 1–9, 12).
- **WARN** — allowed only with a one-line justification in `BUILD.md` (e.g. high collider count,
  budget overruns, law 10/11/13 soft cases).
- **INFO** — advisory only.

1. **Metres.** `footprint` required; `maxDim` default 60 m (> 200 reads as "millimetres").
2. **Wall thickness ≥ 0.2 m** — thinner only with `detail: true`. (kills "1px walls")
3. **Every storey has a floor** covering ≥ 80% of the footprint. (kills missing floors)
4. **Closed roof** — the top must be covered by a roof operator spanning the footprint.
   (kills open-top boxes)
5. **Square / plumb corners** — shell parts are axis-aligned, corners meet with no gaps, every
   part is contained by the footprint (±10% + 6 cm, modelgen's bounds rule).
6. **Openings:** ≥ 1 walkable `doorway` (a real gap); an interior with `interiorWall` has
   **≥ 2 exits**; any walkable rise is step-up ≤ 0.62 m.
7. **Z-fighting:** no coplanar same-normal overlapping faces; details stand ~4 mm proud or embed
   ~4 mm. (property test, as modelgen)
8. **Textures:** a tiled material must carry a `tile` size with a derived `repeat` — a single
   stretched texture across a whole facade is rejected.
9. **`src` = `dossier#<key>`** for every real-world dimension (provenance, not prose).
10. **Colliders** sit inside the footprint; a large jump in `world.boxes` count warns.
11. **Intent coherence:** `intent.furnitureReady` -> ceiling ≥ 2.6 m + ≥ 1 `propRef` anchor zone;
    `intent.roofAccess` -> a stair/ladder to the roof; `intent.glassWindows` -> window bays use
    the `glass` material. (these thresholds come from the Pillar A research doc)
12. **`propRef` contract (ERROR):** the referenced model must exist in the modelgen registry; its
    footprint must fit inside a declared anchor zone; `scale` must stay `1.0` unless explicitly
    allowed (a scale fudge = a units bug, modelgen's own law); the prop must not overlap a
    required `doorway` gap.
13. **Pathing gate (WARN, minimal — NOT a navmesh):** for `intent.enterable` buildings, every
    required entrance must have a clear walkable span to at least one other entrance with no
    `propRef`/`interiorWall` blocking it. Full room-graph reachability is deferred — this only
    catches a "walkable on paper, impassable in practice" building.

### Performance budget (principle adopted; numbers are PROVISIONAL — calibrate against a real frame capture, do not treat as gospel)

The spatial grid (`src/grid.js`, O(1) broad-phase) already softens the collider-count worry, so
these are guard-rails (WARN), not hard limits — except triangles, which is a real GPU concern:
- Merged visual meshes: **1 per material** (hard target).
- Materials: **≤ 8** default, **≤ 12** for a landmark (WARN over).
- Collider AABBs: **≤ 32** default, **≤ 64** for a large enterable building (WARN over).
- Procedural texture canvas: **≤ 512×512** per material unless justified.
- Triangles: **WARN > 8k, ERROR > 20k** per building *(re-tune once we have a real per-building
  frame-time number — these are placeholders, not measured)*.

Run before the viewer and before "done":
```bash
node tools/buildgen/lint.mjs buildings/<id>
node --test 'tests/buildgen/*.test.mjs'   # after any operator/validator change (glob, not bare dir)
```

## Compile & integrate

`interp.js` -> `placeBuilding(world, scene, id, x, z, yaw)` returns **(a)** merged meshes
per-material (few draw calls) added to the scene at `(x,z,yaw)` and **(b)** a list of AABBs
pushed to `world.boxes`.

**`yaw` must be a multiple of 90° (runtime assert).** `world.boxes` colliders are axis-aligned
AABBs (`{min,max}` vectors — verified in `world.js`); at 90°/180°/270° the interp swaps box
extents exactly, but any other angle would silently ship wrong (inflated or misaligned)
colliders. Visual-only parts may rotate freely; collidable ones may not. Because colliders are deterministic from the spec, **co-op needs no
collider sync**; only interactive elements (a gate/door on `E`) stay hand-coded hooks behind
`hostSim = !mp.active || mp.isHost`. The interior is furnished by `propRef` (modelgen props) plus
a few hand hooks. An Admin Asset Viewer entry makes the building inspectable in-game.

**Hard rule (the single most important guard against backsliding):** a new building's
**geometry/spec is never authored directly in `world.js`** — `world.js` only *calls*
`placeBuilding(...)`. Every new building goes through `/buildgen`:
**spec.json -> lint -> viewer -> snapshots -> registry -> `placeBuilding`.** Hand-built box
geometry in a world builder is exactly the failure mode this harness exists to replace. (Existing
hand-coded buildings are grandfathered — see non-goals.)

## Pillar A — the intent questionnaire (always, before authoring)

`/buildgen` **never starts building** until an `AskUserQuestion` set captures what the building is
*for the player*. The questions and their thresholds are derived from a research doc
(`docs/superpowers/specs/2026-06-10-player-friendly-building-design.md`) covering level-design
best practice: readable silhouette / landmarking, entrance legibility, no dead-end rooms,
cover-and-sightline rhythm, verticality, interior navigation + lighting, "readable from outside."

Standard set (tunable):
- **Enterable, or façade-only?**
- **Furniture-ready interior?** -> clean floors, ceiling ≥ 2.6 m, door/window spacing, `propRef`
  anchor zones.
- **Real transparent glass windows?** -> `glassPane` material + transparency handling.
- **Roof access / verticality?** (stairs / ladder, sniper perch)
- **Gameplay role:** cover / landmark / loot-hub / hot-zone / through-route shortcut.
- **Number + side of entrances**, **destructible?**, **day/night interior lighting?**
- **Player-scale gates** (from the research doc): doors ≥ 1.6 m, ceiling ≥ 2.6 m, corridors ≥ 1.4 m.

Answers are frozen into `spec.intent` and the validator enforces the implied rules (law 11).

## Pillar B — reference drag-and-drop + vision-confirm gate (before authoring)

Per building, before the dossier:
1. **Drag a reference image onto the 3D viewer.** A small dev-only upload endpoint
   (`tools/buildgen/server.mjs`, replacing `python http.server` for buildgen) saves it to
   `buildings/<id>/ref/`, and the viewer loads it as an **overlay plane** (alignment, like
   modelgen's `VIEWER.overlay`).
2. **The AI agent `Read`s the saved image and states what it sees** — structure, materials, roof
   type, era, window rhythm, weathering.
3. **Discussion gate:** agent + owner agree on *what is in the images and what we want to
   achieve* before the dossier/spec exist. This is a hard gate, not optional.

The upload endpoint is **dev-tooling only** — production stays the static Vercel site; nothing
in the shipped game depends on it. Even on localhost it must be hardened against the one real
footgun (a bad filename overwriting a repo file):
- Accept **image MIME types only**; cap file size (e.g. ≤ 8 MB).
- **Normalise the filename** and **confine writes to `buildings/<id>/ref/`** — reject any path
  traversal (`..`, leading `/`, absolute paths) so nothing outside `ref/` is ever written.
- Write the bytes as-is; the server never interprets/executes uploaded content (it isn't run).

## Viewer + verify loop (`tools/buildgen/viewer.html`)

Modelgen viewer pattern, building-flavoured. `VIEWER.load(id)` -> `{dims, boxes, needs}`:
- **Ghost human (1.75 m)** for scale; **collider overlay** (yellow AABBs vs the visual mesh).
- **First-person interior walk-through** + **exterior orbit**; the canonical view sweep.
- **"From 300 m" landmark shot** (fog / draw distance) for tall structures.
- **Reference overlay** from the dropped image; **drag-drop** intake (Pillar B).
- Drive via Playwright; `VIEWER.snapshot()` -> PNG dataURL saved to `buildings/<id>/renders/`;
  **`Read` every PNG** (a blank/unrelated render means the loop did not happen).
- **Automated snapshot self-checks** (directly addresses the documented "verified a white
  screenshot + an unrelated Su-24 photo" incident) — `VIEWER.snapshot()` returns metadata and a
  capture **fails loudly** if: the image is blank / single-colour; the model AABB is outside the
  camera frustum; the collider overlay is empty while any `collide:true` part exists; or the
  reference overlay is missing during the Pillar-B reference-confirm stage.

**Definition of done:** lint clean · tests green · render set + ghost + collider shot + 300 m
shot at the final spec · **in-game day/night/interior shots** (pipeline step 6) · 0 console
errors · interior has ≥ 2 walkable exits · BUILD.md updated.

## Per-building pipeline (the SKILL.md flow)

0. **Scope exactly ONE building** (era + type precisely).
1. **Intent questionnaire (Pillar A)** — freeze `spec.intent`.
2. **Reference intake + vision-confirm (Pillar B)** — drop refs, agent confirms, agree on goal.
3. **Research dossier** (subagent, sourced facts -> `ref/dossier.json`; gaps -> `needs[]`).
4. **Author `spec.json`** (operators + materials, mm -> m, every dim cites `dossier#`); `lint`.
5. **Build + self-verify loop** in the viewer until defect-free; log rounds in `BUILD.md`.
6. **In-game verification** — register + `placeBuilding` on the feature branch, serve a fresh
   port, fly the dev freecam (`Ctrl+F` / `N` / `?fly=1`): day AND night exterior shots, the
   300 m fog approach, and a first-person interior walk with the real player controller;
   console errors = 0; `GAME.world.boxes` delta sane. **The viewer proves the model; only the
   game proves the building.**
7. **Approve** (`AskUserQuestion` with concrete named next steps); `world.js` keeps a single
   `placeBuilding` call; add an Admin viewer entry.

## Build order (for the implementation plan)

1. Research doc: player-friendly building design (feeds Pillar A + law 11).
2. Harness skeleton: `palette.js` (tiled materials), `spec.js` (laws + diagnostic levels),
   `interp.js`, `registry.js`, `operators/` (shell + floor first), `manifest.js`, `extents.js`.
3. `tools/buildgen/` server (hardened upload) + lint + viewer (snapshot self-checks) + viewer.js;
   `tests/buildgen/` + the `buildings/_smoke/` fixture (validate the harness on the fixture
   BEFORE any real building).
4. Roof + facade + landmark + sign + ref operators, each with extents + property tests.
5. `SKILL.md` for `/buildgen` (laws, kit, anchors, Pillars A/B, pipeline, DoD).
6. Prove on the first real building (chosen via the Pillar A questionnaire at first run).
7. Point the old `voxel-building-modeling` skill at `/buildgen` for new buildings (keep it as the
   research-first philosophy note + golden-reference pointer to the gatehouse).

## Out of scope / non-goals

- Migrating existing hand-coded buildings.
- Full interior authoring in the spec (interiors = composed props + hand hooks).
- Sloped/ramped **colliders** (AABB only; visual roofs may be angled, colliders stay boxes).
- Any production dependency on the dev upload server.
- **`schemaVersion` field — deliberately omitted.** Modelgen ships none and is fine; all specs
  live in-repo and are re-linted when operators change, so there is no out-of-our-control consumer
  to version against. Revisit only if specs are ever distributed outside the repo.
- **LOD / distance material degradation — deferred.** The engine has no LOD system (meshes are
  merged static geometry); building one is its own project. Landmark legibility is covered by the
  DoD "from 300 m" silhouette check, not by runtime LOD. Full room-graph pathing reachability is
  likewise deferred (see validator law 13 for the minimal gate we keep).

## Addendum (implementation, 2026-06-10)

Decisions crystallised while planning the build — these refine, not change, the design above.

**(a) `stairs` operator added to the shell/massing family (v1).** The operator list above missed
it, but law 6 (step-up ≤ 0.62 m), `intent.roofAccess` ("stairs/ladder to the roof") and
multi-`storeys` buildings all require one. Modeled on `world._stairs`: N stacked boxes, each
full height from the base (`(i+1)·rise`), so the player's step-up collision climbs them with no
special-casing. Args: `{steps, rise, run, width, dir}`.

**(b) Neutral primitive records are the operator emission contract.** Operators stay pure (no
`three`) but are NOT box-only — they emit plain records through a recorder interface that tests
can mock:

```js
{ kind:'box',   w,h,d, x,y,z, mat, collide, detail, rot:[deg], uv:'m' }
{ kind:'wedge', w,h,d, x,y,z, mat, axis:'x'|'z', hi:'N'|'S'|'E'|'W' }  // ramp slab, 8 tris
{ kind:'prism', w,h,d, x,y,z, mat, axis:'x'|'z' }                      // gable cross-section, 8 tris
{ kind:'cyl',   rBot,rTop,h, x,y,z, mat, collide, seg }                // vertical, 4·seg tris
{ kind:'pane',  w,h, x,y,z, mat, ry, lean }                            // glass/sign plane, never collides
{ kind:'propRef', model, x,y,z, yaw }                                  // resolved by validator/interp
```

Roofs and cylinders are pure records (unlike modelgen's browser-only `round.js`) because law 4
(roof closes the top) must be checkable in node. Only `interp.js` realizes records as THREE
geometry. Colliders derive from `collide:true` records (AABB of the record; non-90° `rot` on a
collide record is an ERROR).

**(c) `wallcut.js` is the compile step that realizes "openings are real GAPS".** `shellBox`
does not emit four monolithic walls; the compiler gathers every `doorway`/`windowBays`/
`gateOpening` per face and cuts each wall into segments (jambs / sill band / lintel band) via
horizontal-band decomposition with vertical merge — a door yields 3 segments (the `world._wall`
semantics), a window 4, k uniform windows k+3 (which is what keeps the collider budget of law
14 honest). Property invariants (Σ segment areas = wall − openings; pairwise non-overlap;
segment∩opening = ∅) are enforced by tests.

**(d) Corner policy (law 5 made deterministic):** N/S walls run the full footprint width `w`;
E/W walls run `d − 2·wallT` between them — no overlap, no gap, no coplanar corner faces.

**(e) Deferred to v2 (not needed by the smoke fixture or the first building):** `balcony`,
`poster`, `coolingTower` (hyperboloid), `gasholder`. Adding one later = impl + extents fn +
SAMPLES entry, per the skill's operator rule.
