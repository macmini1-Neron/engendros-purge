# modelgen — tech-model harness (F0)

Data-driven generator for voxel props. One JSON spec → a pure validated core →
a THREE voxel interpreter → this viewer. Quality lives in the operator kit, not
the JSON.

- **Design:** `docs/superpowers/specs/2026-06-05-tech-model-harness-design.md`
- **F0 plan:** `docs/superpowers/plans/2026-06-05-modelgen-f0.md`

## Run the viewer

```bash
python3 -m http.server 8000        # from the repo root
# open http://localhost:8000/tools/modelgen/viewer.html
```

`file://` will not work (ES modules + `fetch`). If a port is busy (this machine
hoards stale `http.server` processes), pick a fresh one and pass
`--directory <repo-root>`.

## How Claude drives it

Via the Playwright MCP against `window.VIEWER`:

| API | purpose |
|---|---|
| `loadSpec(spec)` | build + show a voxel spec |
| `setCamera(az, el, dist)` | orbit programmatically (Claude's control surface) |
| `overlay(url, opacity)` | superimpose a reference image to compare |
| `addRef(url)` | add a reference thumbnail (Claude side, no real drag) |
| `wireframe(on)` · `snapshot()` · `clear()` | inspect / capture / reset |

Claude orbits, overlays a reference, and `browser_take_screenshot`s to self-verify.
Screenshots land in the current working directory (pass a `models/<id>/renders/...`
path to file them straight into the model folder).

## Run the tests (pure core)

```bash
node --test 'tests/modelgen/*.test.mjs'     # Node >= 22; zero dependencies
```

Note the **glob** — `node --test tests/modelgen/` (a bare directory) fails on
Node 25. The pure layers (palette, provenance, operators, plan, registry-core)
are unit-tested; the THREE layer (`voxel-interp.js`, `registry.js`, `viewer.js`)
is verified in the browser.

## Add a model

1. **Research** real references → `models/<id>/ref/` + `dossier.json`, where every
   dimension/feature carries a **source**. Facts you cannot source go in `needs[]` —
   never guess. (Downloaded third-party photos stay local; `ref/.gitignore` keeps
   them out of git — commit only `dossier.json` + your own renders.)
2. **Author** `models/<id>/spec.json` — operators from
   `src/props/operators/manifest.js`, materials **by name** from
   `src/props/palette.js`, and a `src` on every dimensional part. Derived dims must
   cite a dossier key that documents the derivation.
3. `validateSpec` (in `src/props/spec.js`) hard-rejects any invented dimension
   (missing `src`), raw hex, unknown operator, or unknown material.
4. Load in the viewer, self-verify vs the references, **iterate** (the 1st/2nd
   build is never right — fix the spec, or an operator in `src/props/operators/`,
   and re-check).
5. Register with `registerModel(id, spec)`; place in a map with
   `placeProp(scene, id, x, z, yaw)`.

## File map

| Path | Role |
|---|---|
| `src/props/palette.js` | semantic materials (voxel 5-tone + glb PBR) — pure |
| `src/props/operators/` | operator kit (`manifest.js` + box-only impls) — pure |
| `src/props/spec.js` | `validateSpec` — provenance gate + hex lint — pure |
| `src/props/plan.js` | `planBuild` — spec → flat plan — pure |
| `src/props/registry-core.js` | model catalog (id → spec) — pure |
| `src/props/voxel-interp.js` | `buildSpec` — plan → `THREE.Group` — **THREE** |
| `src/props/registry.js` | `placeProp` — build + add to scene — **THREE** |
| `tools/modelgen/viewer.*` | the Claude-controllable dev viewer — **THREE** |
| `models/<id>/` | `spec.json` · `ref/dossier.json` · `renders/` |

## Scope

F0 = voxel + the self-verify loop. **Deferred:** persistent drag-drop save (F1),
the texture/integrity + game-design verify subagents (F1), and the Blender GLB
branch for hero pieces (F2).
