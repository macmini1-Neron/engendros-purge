# Tech Model Harness — data-driven spec generator for voxel + GLB props

**Date:** 2026-06-05
**Status:** Design — approved in brainstorming, pending implementation plan
**Authors:** brothers + Claude Code

## 1. Purpose

Today every piece of in-world furniture and equipment is **hand-coded inline** in the
building modules — `bunker.js` has `plotTable` / `messTable` / `tinShelf` / `workbench` /
`samovar` / `locker` / `examCouch` / `ta57`; `airfield.js` and `gatehouse.js` each redefine
their own desks, consoles, chairs and shelves. There is a `voxel-weapon-modeling` skill
(guns) and a `voxel-building-modeling` skill (buildings/POIs), but **the middle layer —
small technical props and furniture — has no system.** Each piece is one-off, inconsistent,
and re-invented per building.

This harness fills that gap: a **general-purpose, data-driven generator** for *any* technical
model we want — furniture, Soviet industrial machinery, electronics/instruments, civilian
fittings — at **ultra quality** (real references, no invented detail, iterated until correct).

It is **not** a fixed catalog. It is a reusable capability: a spec format + a shared operator
library + a verification harness + a generation pipeline that Claude Code drives in-session.

## 2. Hard requirements (non-negotiable)

These came directly from the owner and shape the whole design:

1. **Never hallucinate.** Nothing is invented. Every dimension and feature is grounded in a
   real reference. A fact with no source is a hard error, never a guess.
2. **Reference-research subagents run through Claude Code** (this session), via the `Agent`
   tool — the orchestrator is the human + Claude here, not a separate autonomous runtime.
3. **Drag-and-drop reference images** into the harness UI.
4. **A 3D viewer that Claude can also control** — so Claude verifies its own output by
   orbiting / overlaying / screenshotting, not just the human.
5. **Ultra quality comes from iteration.** The 1st and 2nd model will never be fully good;
   Claude self-reviews against the references and fixes, repeatedly, until it matches.
6. **The model reports what it still needs** — gaps where more reference must be found (a
   `needs[]` channel) instead of filling them in by guessing.
7. **A texture/integrity verification subagent** — catches bugs: z-fighting / texture
   collisions, overlapping or intersecting geometry, holes, clipping, illogical animations,
   physics violations.
8. **It must make sense by game-design logic and rules** — scale, affordances, era/faction
   correctness, silhouette readability — checked against an explicit, extensible ruleset.

## 3. Operating model

The "harness" is **a set of artifacts + conventions operated by Claude Code in this session.**
There is no standalone autonomous agent runtime.

- **Research / verify subagents** = Claude's `Agent` tool calls (they go "through" the human).
- **The viewer** = a local dev page Claude drives via the **Playwright MCP**
  (`browser_evaluate` to call the viewer API, `browser_take_screenshot` to see the result).
- **Specs** are authored and iterated by Claude.
- **The human** does: drag-drop references, watch the viewer, approve.

The loop per model: *"build model X" → Claude runs the pipeline in-session → shows result →
iterates → human approves → registered in the catalog.*

## 4. Architecture overview

**One semantic spec, two interpreters.** A model is a declarative JSON tree of "parts"; each
part is an **operator** call with parameters + a material (by name) + a transform + an optional
`rig` name. The spec itself is format-agnostic — it describes the model *semantically*.

```
   [DRAG-DROP ref images] ──┐         ┌── [research subagents via Agent: web → real refs]
                            ▼         ▼
                    ┌────────────────────────────────┐
                    │  REFERENCE DOSSIER              │  ← single source of truth
                    │  models/<id>/ref/ + dossier.json│     no fact lives outside it
                    │  (every dim/feature cites a src)│
                    └───────────────┬─────────────────┘
                                    ▼
                          model spec (JSON)  ──► needs[]: "missing rear view…"
                                    ▼
                 ┌──────────────────┴───────────────────┐
        voxel interpreter (JS, MeshBuilder)     GLB interpreter (Python, Blender)
                 │                                       │
         in-game geometry (default, light)        .glb file (hero pieces, real bevels)
                 └──────────────────┬───────────────────┘
                                    ▼
            ┌─────────────────  HARNESS UI  ──────────────────┐
            │  controllable 3D viewer (human + Claude/Playwright)│
            │  render ↔ references: side-by-side / overlay       │
            └───────────────────────┬─────────────────────────┘
                                    ▼
       VERIFY SUITE (subagents):  texture/geometry · logic/physics · game-design
                                    ▼
                  self-review loop → fix → repeat → human approval → registry
```

**The key to ultra quality:** quality is carried not by the spec but by the **operator
vocabulary.** Each operator (`bevelBox`, `pipe`, `frame`, `panel`, `boltGrid`, `recessGrid`,
`lattice`, `gauge`, `crtScreen`, `drawerStack`, `legs`, `pipeRun`, …) has **two hand-tuned
implementations** — a voxel one (emits layered-shaded boxes) and a GLB one (emits beveled
Blender geometry). The spec only composes operators with parameters; all the "organic" detail
is baked into the operators, tuned **once**, then reused forever. Declarative ≠ flat.

This is what removes the risk that originally made a data-driven approach look weak for
high-detail work: the detail lives in a curated, dual-target kit, not in the JSON.

## 5. The model spec format

A model is a JSON document: a tree of parts, each part an operator + args + a material (by
name) + an `src` citation into the dossier (without it, a dimension may not exist).

```jsonc
{
  "id": "lathe_1k62",
  "name": "Soustruh 1К62",
  "category": "industrial",              // furniture | industrial | electronics | civilian | …
  "target": "voxel",                     // voxel | glb | auto
  "footprint": { "w": 2.8, "h": 1.3, "d": 1.1 },   // collision / placement box (metres)
  "anchor": "floor",                     // floor | wall | ceiling | table
  "dossier": "models/lathe_1k62/ref/dossier.json",
  "parts": [
    { "op": "bevelBox", "id": "bed", "args": { "w": 2.8, "h": 0.25, "d": 0.6 },
      "at": [0, 0.95, 0], "mat": "castIron", "src": "dossier#bed_length" },
    { "op": "headstock", "args": { "...": "..." }, "at": [-1.1, 1.2, 0],
      "mat": "enamelGreen", "rig": "spindle", "src": "dossier#headstock" },
    { "op": "boltGrid", "args": { "cols": 4, "rows": 2, "pitch": 0.12 },
      "at": [-1.1, 0.95, 0.31], "mat": "steel", "src": "dossier#headstock_face" }
  ],
  "rig": [
    { "name": "spindle", "pivot": [-1.1, 1.2, 0], "axis": "z", "type": "spin" }
  ],
  "needs": [ "missing rear gearbox detail — research" ]
}
```

Three pillars of the format:

- **Operators** — the shared vocabulary; each has both a voxel and a GLB implementation.
  Detail lives here; the spec only composes. The vocabulary grows as models demand it.
- **Materials by name** — from a shared `palette.json`; voxel maps to a 5-tone layered palette,
  GLB to a PBR material. A **lint rejects raw hex** in specs (keeps everything on-style).
- **`src` provenance** — every dimensional fact cites a dossier key. Missing `src` is a
  **hard error**, not a silent invention → it goes to `needs[]`.

`target` selects the backend: `voxel` (default, light, in-game build), `glb` (a hero piece
built in Blender), or `auto` (the harness recommends one based on the model's importance and
detail needs, and the human confirms).

### 5.1 Coordinate & unit conventions

Match the existing game/tank conventions so rigs and placement are consistent:
- World/voxel space: **+Z = forward, +Y = up, +X = right**, ~1 unit ≈ 1 m.
- Blender (GLB) build space: **Z-up, +Y = front**, 1 unit = 1 m, glTF orientation fixed at
  export (as `tanklib.py` already does).
- Furniture sits on its `anchor`; `footprint` is the AABB used for collision/placement.

## 6. Operator vocabulary (the "kit")

Each operator is a small, hand-tuned builder with two backends. A non-exhaustive starter set:

| Group | Operators |
|---|---|
| Structural | `bevelBox`, `cylinder`, `pipe`, `frame`, `panel` (optional recess), `plate` |
| Detail / array | `boltRow`, `boltGrid`, `recessGrid`, `ribs`, `louvers`, `treadPlate`, `lattice` |
| Furniture | `legs`, `drawerStack`, `shelfStack`, `tabletop`, `cushion` |
| Tech / electronics | `gauge`, `crtScreen`, `buttonGrid`, `knobRow`, `dialFace`, `cableDrape` |
| Routing | `pipeRun` (polyline of pipe), `wireRun`, `ductRun` |

Operators may compose other operators (a `headstock` is a higher-level operator built from
`bevelBox` + `cylinder` + `boltGrid`). Higher-level, object-specific operators are added in
Phase 3 as the catalog grows. The **voxel** backend emits layered-shaded boxes (Hi/Mid/Lo/
Slot/Bright per surface, per the voxel-weapon-modeling aesthetic); the **GLB** backend emits
beveled geometry via the generalized `modellib.py` (real rounded edges, not blocky).

## 7. Material palette

`palette.json` is a table of semantic materials. Each entry defines both backends:

```jsonc
{
  "steel":      { "voxel": ["#9aa0a6","#7d838a","#5f656b","#4a4f55","#c2c8ce"],
                  "glb": { "rgb": [0.20,0.21,0.23], "rough": 0.55, "metal": 0.2 } },
  "enamelGreen":{ "voxel": ["…5 tones…"], "glb": { "rgb": [0.20,0.30,0.18], "rough": 0.6 } },
  "castIron":   { "…": "…" },
  "woodMid":    { "…": "…" },
  "bakelite":   { "…": "…" },
  "brass":      { "…": "…" }
}
```

Specs reference materials by name only. This enforces visual consistency across both formats
and with the rest of the game (a GLB hero piece won't read off-style).

## 8. Rig contract

Parts with a `rig` name become **named pivot groups**, honoring the existing `userData`
contract used by doors / turrets / the tank:
- Voxel: a `THREE.Group` whose name is the rig name, with children meshes under it.
- GLB: a named Blender object exported with that name.

A rig entry declares `{ name, pivot:[x,y,z], axis:"x|y|z", type:"hinge|spin|slide", range:[…] }`.
The game's animation/interaction code looks up rigs by name exactly as it does today.

## 9. Anti-hallucination & provenance

Hard rule: **a spec may only use a fact that exists in the dossier.**

- **Reference dossier** (`models/<id>/ref/` + `dossier.json`) is the single source of truth.
  Research subagents (via `Agent`) gather real reference imagery + specs/dimensions; the human
  can drag-drop more. `dossier.json` is structured so **every dimension/feature carries a
  source** (URL / image id / blueprint key).
- **The spec author may not invent** a missing detail. Instead it writes a `needs[]` entry,
  which triggers another research pass or asks the human for a drag-drop reference.
- **Verification always compares the render to the specific reference images**, never to a
  generic mental image of the object — so hallucination is impossible even during review.

## 10. Harness UI + controllable viewer

A local dev page (in the spirit of the existing `tank-viewer.html`, but purpose-built). Three
panels:

- **Reference drop-zone** — drag-drop images → saved into `models/<id>/ref/` and registered in
  the dossier.
- **3D viewer** — loads a voxel spec live or a built `.glb`.
- **Compare bar** — render beside / overlaid on a chosen reference (opacity slider).

**Claude controls the viewer** through a JS API exposed on `window.VIEWER`:
`setCamera(az, el, dist)`, `loadSpec(json)`, `loadGLB(path)`, `overlay(refId, opacity)`,
`wireframe(on)`, `playAnim(name)`, `snapshot()`. Claude drives it via the **Playwright MCP**
(`browser_evaluate` → call the API; `browser_take_screenshot` → observe), so it can orbit the
model, overlay it on a reference, and screenshot from any angle — the mechanism behind
requirements 4 and 5. The human uses the same viewer with the mouse.

## 11. Generation pipeline

Per model, Claude runs in-session:

1. **Research** — `Agent` subagents gather real references → build `dossier.json` (with
   sources). Human may drag-drop additional references.
2. **Author** — Claude writes `spec.json` from the dossier, citing `src` per fact; unknown
   details → `needs[]`.
3. **Render** — voxel (instant, in-browser via the viewer) or GLB (Blender headless).
4. **Self-verify** — Claude drives the viewer (Playwright) to capture multi-angle shots +
   overlays vs the references; runs the **verify suite** subagents.
5. **Fix loop** — apply defects, re-render, repeat. Expect several iterations (models 1–2 are
   never right).
6. **Approve** — human eyeballs the final, approves.
7. **Register** — added to the catalog (`registry.js`); maps place it via `placeProp`.

## 12. Verify suite

After each build, in parallel, each subagent returns a defect list and loops until clean:

- **Texture / geometry integrity:** z-fighting / coincident coplanar faces, overlapping or
  intersecting parts, holes, clipping/penetration, non-manifold/unclosed meshes, UV/texture
  collisions.
- **Logic / physics:** animations make sense (hinges at an edge not the centre, wheels on the
  ground, a gun recoils along its barrel axis), nothing floats, no physics violations, correct
  scale vs a ~1.8 m player.
- **Game-design coherence:** checks against a `rules/game-design.md` ruleset — scale vs player,
  collision footprint sanity, interaction affordances, era/faction correctness (no
  anachronisms), silhouette readability. The ruleset is defined with the owner and is
  extensible.

## 13. File layout

```
tools/modelgen/
  viewer.html              # drag-drop + 3D viewer + compare; Claude drives via Playwright
  operators/               # operator vocabulary (voxel + glb impls) = the "kit"
  palette.json             # semantic materials (voxel 5-tone + glb PBR)
  rules/game-design.md     # the game-design ruleset (extensible)
  blender/
    modellib.py            # generalized tanklib.py (primitives w/ bevels, studio, render)
    interp.py              # spec → Blender → .glb
    montage.py             # (reuse) labelled compare sheets for the verify loop
src/props/
  voxel-interp.js          # spec → MeshBuilder; shared by HARNESS and the GAME at runtime
  registry.js              # id → spec/glb + placeProp(id, x, z, yaw, opts)
models/<id>/
  spec.json
  ref/  dossier.json       # references + sourced facts
  renders/                 # verify captures + overlays
  out.glb                  # if target is glb
```

`voxel-interp.js` lives under `src/` because it is used **both** by the harness (preview) and
by the running game (placed voxel props build from spec at load).

## 14. Phasing

Ultra quality with no time pressure — phases exist only to reach a *working loop* fast and to
de-risk, not to cut corners.

- **F0 — Foundation.** Spec schema + `palette.json` + the **voxel interpreter** + ~10 starter
  operators + the **viewer with Claude's Playwright control** + `registry.js`/`placeProp`.
  Prove it by taking **one real model** end-to-end through research → build → self-verify
  (candidate: a Soviet desk, or the 1К62 lathe).
- **F1 — Verify suite.** The three subagents + the dossier/provenance discipline +
  `needs[]` feedback wired into the loop.
- **F2 — GLB branch.** Generalize `tanklib.py` → `modellib.py` + `interp.py`; same spec →
  `.glb`; the in-game GLB loader/registry. Prove on one hero piece.
- **F3 — Scale.** Grow the operator vocabulary + the catalog as new models demand.

## 15. Error handling (nothing silent)

- Unknown operator / bad/missing arg / **dimension without `src`** → the interpreter **throws**
  with a precise message → Claude fixes. The provenance rule makes a missing source a hard
  failure, never a silent guess.
- Missing GLB at runtime → fall back to a voxel spec if one exists, else a clearly-marked
  placeholder box + a console warning. Never a silent gap.
- Empty research → surface `needs[]` to the human (drag-drop). The pipeline **waits; it does
  not invent.**
- Style drift → materials-by-name + a spec lint that refuses raw hex.

## 16. Risks & open questions

- **Operator vocabulary breadth.** The whole "ultra quality from a declarative spec" bet rests
  on the operator kit being rich enough. Mitigation: F0 starts narrow, vocabulary grows
  per-model in F3; higher-level operators compose lower-level ones.
- **Two backends, one spec.** Maintaining voxel + GLB implementations for every operator is
  real work. Mitigation: phase GLB to F2; the voxel backend (the default, most-used path) is
  proven first.
- **Viewer ↔ Playwright control loop latency.** Self-verify depends on a reliable
  `browser_evaluate` + screenshot cycle. To validate early in F0.
- **Game-design ruleset content.** `rules/game-design.md` must be authored with the owner; the
  initial set is small (scale, footprint, affordance, era, silhouette) and grows.
- **Catalog placement ergonomics.** How buildings adopt `placeProp` vs the current inline
  builders — incremental migration, not a big-bang rewrite of `bunker.js`/`airfield.js`.
```
