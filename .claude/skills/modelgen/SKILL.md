---
name: modelgen
description: Use when building or upgrading ANY small/medium technical model or prop for ENGENDROS PURGE that is NOT a weapon and NOT a whole building — furniture (desks, chairs, beds, shelves, lockers, tables), Soviet industrial machinery (lathes, generators, switchboards, transformers, pipes, valves, compressors, cranes), electronics/instruments (control consoles, CRTs, radars, gauges, field phones, radios, button panels), or civilian fittings (samovars, stoves, kitchen kit, lamps, clocks). Drives the data-driven `modelgen` harness — research real sourced references, write a provenance-clean JSON spec, then build + self-verify in the browser viewer until it reads right. Trigger this even when the user just says "make a desk / build a lathe / put some furniture in the bunker / model a control panel" — not only when they say "skill" or "modelgen". Furniture/props/machines that fill rooms are THIS skill; first-person guns are voxel-weapon-modeling; whole buildings/POIs/districts are voxel-building-modeling.
---

# modelgen — tech-model harness (ENGENDROS PURGE)

Build believable, real-referenced **technical models** (furniture, machinery, electronics, fittings)
as **data-driven specs**, then self-verify them in a browser viewer you drive yourself. The harness
lives at `tools/modelgen/` + `src/props/` in the repo root. Full design:
`docs/superpowers/specs/2026-06-05-tech-model-harness-design.md`; F0 plan + file map:
`docs/superpowers/plans/2026-06-05-modelgen-f0.md`.

This is the **middle layer** of the modeling family: guns → `voxel-weapon-modeling`, whole
buildings/POIs → `voxel-building-modeling`, everything that fills a room → **here**.

## The #1 principle: provenance beats vibes — never invent a dimension

A prop modelled from memory comes out generic and wrong-proportioned, then gets thrown away. The whole
point of this harness is that **every dimension is sourced**, and the validator enforces it: a spec
part with a real-world size and no `src` citation is a HARD ERROR, not a guess. So the rule is simple
and absolute — **if you don't have a source for a number, you don't have the number.** Research it, or
put it in `needs[]` and ask. The 1st and 2nd build are never right either; you reach quality by
**self-verifying against the references and iterating**, not by getting it right in one shot.

(Layered-shading "prettiness" recipe — the 5-tone Hi/Mid/Lo/Slot/Bright logic — is shared with
`.claude/skills/voxel-weapon-modeling/SKILL.md`. The same palette discipline applies to steel, wood,
enamel, bakelite.)

## How the harness fits together

One semantic JSON spec → a pure validated core → a THREE interpreter → a viewer you drive:

- **Spec** `models/<id>/spec.json` — a tree of `parts`, each = an **operator** + args + a **material by
  name** + an `src` provenance citation + optional `rig`.
- **Operators** (`src/props/operators/`) carry the detail (layered, z-fight-free). F0 kit: `bevelBox{w,h,d}`,
  `panel{w,h}`, `plate{w,d}`, `drawerStack{w,h,d,count}`, `legs{w,d,h}`. Add a new shape here when a model
  needs one — keep it **box-only** (no `THREE.*` geometry) so it stays unit-testable.
- **Materials by name** (`src/props/palette.js`): `woodMid`, `woodDark`, `steel`, `linoleum`, `bakelite`,
  `brass`. Add new ones here. **Raw hex in a spec is rejected** — keeps everything on-style.
- **Viewer** `tools/modelgen/viewer.html` — exposes `window.VIEWER`, which YOU drive via the Playwright MCP.

Coordinates: **+X right, +Y up, +Z forward**, ~1 unit = 1 m; `at` is the part centre, anchored on the
floor (y=0) unless stated.

## The pipeline — per model, in order

Run as an **orchestration**: think hard yourself, dispatch a fresh subagent per heavy phase, review each
result before the next. One model at a time.

### Phase 0 — Scope exactly ONE model
Name it precisely (era + type, e.g. "Soviet 1960s–80s двухтумбовый office desk", not "a desk"). Decide
voxel (default, F0) — GLB/Blender is F2 and not built yet, so stay voxel.

### Phase 1 — Research the REAL thing (dispatch a research subagent, via the Agent tool)
The subagent gathers **sourced** facts only: dimensions (mm) each with a source (a GOST/ГОСТ standard,
museum/catalog/marketplace listing with measurements), layout, materials/finish, and a few reference
image URLs. **It must be honest:** any number it can't source goes in `needs[]`, never a guess. Save
`models/<id>/ref/dossier.json` with every fact carrying a `src`, plus a `derivation` block when you
compute a dimension from sourced ones (that's allowed — sourced math, not invention). Download a couple
of reference images locally for overlay; keep third-party photos out of git (see gotchas).

### Phase 2 — Author the spec (`models/<id>/spec.json`)
Translate the dossier into operators + materials. **Every dimensional part cites a dossier key in `src`**
(derived dims cite the `derivation` key). Put honest gaps in the spec's `needs[]` too. Validate before
rendering — `validateSpec` (in `src/props/spec.js`) hard-rejects a missing `src`, raw hex, an unknown
operator, or an unknown material.

### Phase 3 — Build + self-verify loop (you drive the viewer; REQUIRED)
This is where quality happens. Serve the repo and open the viewer:
```bash
python3 -m http.server 8000        # from the repo root; if the port is busy pick another + --directory <root>
# http://localhost:8000/tools/modelgen/viewer.html
```
Drive it with the Playwright MCP against `window.VIEWER`:
- `browser_evaluate` → `await window.VIEWER.loadSpec(await (await fetch('/models/<id>/spec.json?cb='+Math.random())).json())`
- `browser_evaluate` → `window.VIEWER.setCamera(az, el, dist)` — sweep several angles: front `(0,12)`,
  3/4 `(35,18)`, side `(90,12)`, top `(0,80)`, and a **low grazing** angle `(28,11)` (grazing angles
  expose z-fighting that head-on views hide).
- `browser_evaluate` → `window.VIEWER.overlay('/models/<id>/ref/<img>', 0.5)` to compare against a reference.
- `browser_take_screenshot` with `filename: 'models/<id>/renders/<view>.png'`, then **`Read` that PNG to
  actually SEE it** — the tool only saves a file; you must read it back.
- Compare each view to the dossier facts + references. List concrete defects (proportions off, z-fighting,
  a part floating, illogical layout, reads flat/no shading). Fix the **spec** (or an **operator** if a shape
  is structurally wrong), reload, re-shoot. **Repeat until it reads unmistakably as the real object from
  every angle** — typically 2–4 iterations.

### Phase 4 — Approve + register
Show the user the final multi-angle renders and get a yes (or specific tweaks → loop again). Then
`registerModel(id, spec)` and place it in a map with `placeProp(scene, id, x, z, yaw)`.

## Z-fighting checklist (the owner explicitly wants this nailed)
Flicker/shimmer on a flat face = two **coplanar exposed faces** at the same depth. The classic bug: a
"lit cap" box whose top face sits at the same height as the body's top face. **Fix = stacked
full-footprint layers** — emit the lit/mid/shadow bands as separate boxes that tile vertically
edge-to-edge over the full w×d, so there's a single top face and the sides read as bands. Never overlay a
smaller cap whose top is coplanar with a larger body's top. (This is already how the F0 operators are
built — match that pattern in any new operator.)

## Verify loop is REQUIRED
Never call a model done without the Phase 3 loop. Also run the core tests after any operator/spec change:
```bash
node --test 'tests/modelgen/*.test.mjs'     # must stay green
```

## Gotchas / red flags
- **`node --test tests/modelgen/` (bare dir) FAILS on Node 25** → always the glob `'tests/modelgen/*.test.mjs'`.
- **No `package.json`** anywhere (project invariant). **Pure modules must NOT import `three`** — it breaks
  `node --test` (the bare specifier won't resolve in Node). `three` lives only in `voxel-interp.js`,
  `registry.js`, `viewer.js`. Keep new operators box-only.
- **`browser_take_screenshot` saves to the CWD**, not `.playwright-mcp/`. Pass a `models/<id>/renders/...`
  path to file it; then `Read` it to see it. ⚠️ **Never `rm -f *.png` in the repo root** — it deletes
  tracked QA screenshots; `git checkout -- <file>` to restore.
- **Third-party reference photos**: keep local. `models/<id>/ref/.gitignore` ignores image files; commit
  only `dossier.json` (which holds the source URLs) + your own `renders/`.
- This machine hoards stale `http.server` processes — confirm the served `?v=`/files are yours; use a fresh
  port + explicit `--directory`.
- Don't bypass the provenance gate with junk `src` values to "make it pass" — a placeholder is only for a
  throwaway smoke fixture, never a real model claiming real dimensions.
