# modelgen — tech-model harness (F0.5)

Data-driven generator for voxel props. One JSON spec → a pure validated core →
a THREE voxel interpreter → this viewer. Quality lives in the operator kit, not
the JSON; honesty lives in the validator.

- **Design:** `docs/superpowers/specs/2026-06-05-tech-model-harness-design.md`
- **F0 plan:** `docs/superpowers/plans/2026-06-05-modelgen-f0.md`
- **Workflow guide:** `.claude/skills/modelgen/SKILL.md` (the skill is the canonical how-to)

## The validator's laws (hard errors, not advice)

- Specs are **METRES** (dossier records mm; convert when authoring). Values > 50
  are rejected as mm; > 8 m needs explicit `spec.maxDim`.
- **`footprint {w,h,d}` required** and must match the built bounds (catches
  floaters, misplaced parts, unit mix-ups — see `src/props/bounds.js`).
- **`src: "dossier#<key>"`** must resolve into `ref/dossier.json` — prose is not
  provenance. Raw hex materials rejected; palette names only.
- **`rot` = [x,y,z] degrees**, applied rigidly about the part's `at`.

## Pre-flight lint (run before the viewer, and before calling anything done)

```bash
node tools/modelgen/lint.mjs models/<id>    # spec+dossier cross-check, bounds vs footprint
node tools/modelgen/lint.mjs --all
```

## Run the viewer

```bash
python3 -m http.server 8000 --directory "<repo-root>"   # fresh port if hoarded
# http://localhost:8000/tools/modelgen/viewer.html?model=<id>   ← autoloads spec+dossier
```

`file://` will not work (ES modules + `fetch`).

## How Claude drives it (Playwright MCP → `window.VIEWER`)

| API | purpose |
|---|---|
| `await load(id)` | fetch+validate spec & dossier, build, return `{dims, needs}` |
| `loadSpec(spec, dossier?)` | raw-object variant |
| `dims()` | built AABB in m + mm — compare to the dossier numbers |
| `view(name)` / `views()` | canonical sweep: front/q34/side/back34/top/graze |
| `ghost(on)` | 1.75 m human silhouette — scale sanity |
| `bbox(on)` | actual AABB (yellow) vs declared footprint (cyan) |
| `overlay(url, opacity)` · `addRef(url)` | compare against reference photos |
| `setCamera(az, el, dist)` · `wireframe(on)` · `snapshot()` · `clear()` | control/capture |

Capture tip: `browser_take_screenshot` can time out on rAF pages — use
`snapshot()` (PNG dataURL, camera applied instantly) via `browser_evaluate`'s
`filename` param, then base64-decode to `models/<id>/renders/<view>.png`, and
**Read each PNG back** to actually see it.

⚠️ `load()` re-fetches the spec JSON, but **edited JS modules need a hard page
reload** (`?cb=<new>`) — the ES-module cache will happily keep running old
operator code.

## Run the tests (pure core)

```bash
node --test 'tests/modelgen/*.test.mjs'     # Node >= 22; zero dependencies; NOTE the glob
```

Pure layers (palette, spec gate, bounds, operators, rotated-builder, plan,
registry-core) are unit-tested, including two property tests over every
operator: no same-normal coplanar overlapping faces (z-fight), and emitted
boxes ⊆ declared extents. The THREE layer (`voxel-interp.js`, `registry.js`,
`viewer.js`) is verified in-browser.

## Add a model

1. **Research** → `models/<id>/ref/dossier.json`: every dimension/feature with a
   source, a feature inventory (hinges/latches/straps/handles/markings…), a
   `derivation` block for computed dims, honest `needs[]`. Third-party photos
   stay local (`ref/.gitignore`); commit dossier.json + your own renders.
2. **Author** `models/<id>/spec.json` — operators from
   `src/props/operators/manifest.js` (mind each op's `anchor`: center vs floor),
   materials by name, `dossier#` citations, mm→m converted.
3. **Lint** until clean, then **viewer-verify**: canonical sweep + ghost +
   dims-vs-dossier, fix → reshoot (2–4 rounds), log rounds in
   `models/<id>/BUILD.md`.
4. **Register** with `registerModel(id, spec)` (game.js fetches the spec);
   place via `placeProp(scene, id, x, z, yaw)`. Spec groups are floor-anchored —
   recentre for bobbing pickups. **No scale fudges:** needing `scale ≠ 1` means
   the spec units are wrong.

## File map

| Path | Role |
|---|---|
| `src/props/palette.js` | semantic materials (voxel 5-tone + glb PBR) — pure |
| `src/props/operators/` | operator kit: manifest + extents + box-only impls — pure |
| `src/props/spec.js` | `validateSpec` — provenance + units + footprint gate — pure |
| `src/props/bounds.js` | per-op extents → built AABB vs footprint — pure |
| `src/props/rotated-builder.js` | rigid `rot` support for any operator — pure |
| `src/props/plan.js` | `planBuild` — spec → flat plan — pure |
| `src/props/registry-core.js` | model catalog (id → spec) — pure |
| `src/props/voxel-interp.js` | `buildSpec` — plan → `THREE.Group` — **THREE** |
| `src/props/registry.js` | `placeProp` — build + add to scene — **THREE** |
| `tools/modelgen/lint.mjs` | CLI pre-flight (node, no deps) |
| `tools/modelgen/viewer.*` | the Claude-controllable dev viewer — **THREE** |
| `models/<id>/` | `spec.json` · `ref/dossier.json` · `renders/` · `BUILD.md` |

## Scope

F0.5 = voxel + enforced gates + the self-verify loop. **Deferred:** persistent
drag-drop save (F1), verify subagents (F1), Blender GLB branch (F2).
