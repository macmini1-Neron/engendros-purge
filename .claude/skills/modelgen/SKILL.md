---
name: modelgen
description: Use when building or upgrading ANY small/medium technical model or prop for ENGENDROS PURGE that is NOT a weapon and NOT a whole building — furniture (desks, chairs, beds, shelves, lockers, tables), military containers (ammo boxes, crates, footlockers, fuel cans), Soviet industrial machinery (lathes, generators, switchboards, transformers, pipes, valves, compressors, cranes), electronics/instruments (control consoles, CRTs, radars, gauges, field phones, radios, button panels), or civilian fittings (samovars, stoves, kitchen kit, lamps, clocks). Drives the data-driven `modelgen` harness — research real sourced references, write a provenance-clean JSON spec, then build + self-verify in the browser viewer until it reads right. Trigger this even when the user just says "make a desk / build a lathe / put some furniture in the bunker / model a control panel" — not only when they say "skill" or "modelgen". Furniture/props/machines that fill rooms are THIS skill; first-person guns are voxel-weapon-modeling; whole buildings/POIs/districts are voxel-building-modeling.
---

# modelgen — tech-model harness (ENGENDROS PURGE) · **SKILL v3**

> **v3** (2026-06-12): + law 6 SILHOUETTE (shape class before authoring, overlay vs reference,
> early owner shape checkpoint) + law 7 READABLE MARKINGS (real Cyrillic CanvasTexture plates,
> `decal lines:[…]`, `loaf` op). v2 (2026-06-10): machine-enforced metres/footprint/dossier.

Build believable, real-referenced **technical models** as data-driven specs, then self-verify
them in a viewer you drive yourself. Harness: `tools/modelgen/` + `src/props/` in
`/Users/macmini1/game 4.8`. Design: `docs/superpowers/specs/2026-06-05-tech-model-harness-design.md`.
Middle layer of the modeling family: guns → `voxel-weapon-modeling`, buildings → `voxel-building-modeling`.

The quality bet: **detail lives in hand-tuned operators, provenance lives in the dossier,
and the validator mechanically enforces what prose used to beg for.** Your judgment goes
where machines can't: picking the right features, proportions, and reading the renders.

## The laws (validator-enforced — you will get a hard error, so author right the first time)

1. **Specs are METRES.** The dossier records mm; *you* convert when authoring (1400 mm → `1.40`).
   Any dimension > 50 is rejected as "looks like MILLIMETRES"; > 8 m needs an explicit `spec.maxDim`.
   *Real incident this guards: an ammo box authored in mm built **280 m** wide, the verify screenshot
   was pure white (camera inside it), and it shipped behind a `scale.setScalar(0.4)` fudge.*
2. **`footprint {w,h,d}` is required** and must match what the parts actually build (±10%+6 cm
   contain / ≥55% fill per axis, roughly centred on x=z=0, floor-anchored specs touch y=0).
   This is what catches floaters, misplaced markings, and unit mix-ups *mechanically*.
3. **`src` must be `dossier#<key>`** that resolves into `ref/dossier.json` — prose like
   `"TA072 scale model kit"` is rejected: *prose is not provenance*. Derived dims cite the
   dossier's `derivation` block (sourced math is allowed; invention is not). No source → the
   fact goes to `needs[]` and the part is NOT built.
4. **`rot` is `[x,y,z]` DEGREES** (prefer multiples of 90; 45° for insignia diamonds). It rotates
   the part rigidly about its `at` — this is how stencils/panels get onto side faces.
5. **A scale fudge in game code = a units bug in the spec.** If `placeProp`/pickup code needs
   `scale ≠ 1`, stop and fix the spec. (Documented inline in `loot.js` — keep it true.)
6. **The SILHOUETTE law (judgment-enforced — the validator cannot see shape).** *Real incident:
   the ЛПР-1 shipped with every dimension correct to the millimetre and the owner still rejected
   it — the rounded cast capsule had been built as a brick. Numbers passed, the SHAPE failed.*
   - In Phase 2, classify the reference's shape class FIRST: boxy / cylindrical / **sculpted-cast
     (rounded shells, capsules, organic castings)**. If sculpted-cast and no operator can express
     it → write the operator (e.g. `loaf`) or build custom THREE geometry BEFORE authoring parts.
     "Close enough for voxel style" is a **banned rationalization** — it is how the brick shipped.
   - In Phase 3, run `VIEWER.overlay('/models/<id>/ref/<photo>', 0.5)` against ≥1 reference photo
     and Read the result — the overlay exists precisely for this and skipping it is how layout
     gets verified while silhouette goes unexamined. Ask of every render: "would the owner
     recognize the real thing at a glance?" — not just "are my parts where my spec put them?"
   - **Early shape checkpoint:** after round 1, show the owner ONE q34 render next to the
     reference photo and get a tvar sign-off BEFORE detailing — feedback after the full build
     is maximum-sunk-cost feedback.
   - The owner's reference fidelity sets the bar: photoscan/PBR references = hero-item sculpt
     expected, not a parts-count checklist. Passing "6–20 parts, 3+ materials" is a floor, not
     quality.
7. **The READABLE MARKINGS law (same retro).** Any text the player can read up close — label
   plates, dials, signage on held/interactable props — is REAL legible Cyrillic rendered as a
   CanvasTexture: `decal` with `lines: ["ЛПР-1", "ДАЛЬНОМЕР", …]` (`plate: true` = bordered
   dark plate; `plate: false` = transparent engraved housing label), `texturedDisc` for dials.
   The codebase has proven this bar repeatedly (gatehouse console, gramophone labels,
   «ЧАСОЗБОР» dial, «Электроника» VFD). `stencil`'s paint bars are ONLY for sub-10 mm or
   distant markings — shipping bars where a plate should read is the texture version of the
   brick. Rounded cast bodies have the `loaf` operator (stadium profile + beveled rim).

Gate everything with the pre-flight linter — run it before the viewer and before calling done:
```bash
node tools/modelgen/lint.mjs models/<id>     # spec + dossier cross-check + bounds vs footprint
node --test 'tests/modelgen/*.test.mjs'      # after ANY operator/validator change (glob, not bare dir)
```

## The kit (operators · materials · anchors)

- **Operators** (`src/props/operators/`, vocabulary in `manifest.js`): `bevelBox`, `panel{+th}`,
  `plate{+th}`, `stencil{+lines}`, `drawerStack`, `legs`, `lidBox` (lidded crate: body+overhang
  lid+hinges+hasp), `strapBand` (wrap-around strap), `handleU` (carry handle, stowed flat).
  **Anchors differ:** `bevelBox/panel/plate/stencil/strapBand` are CENTER-anchored at `at`;
  `drawerStack/legs/lidBox/handleU` are FLOOR-anchored (`at` = bottom). Check `MANIFEST[op].anchor`
  before placing — mixing these up is the #1 placement bug.
- **Add an operator** when a shape class is missing — keep it **box-only** (no `THREE.*`, stays
  node-testable), layered (stacked full-footprint bands, not overlaid caps), with a matching
  extents fn (the bounds validator depends on it) and a test. The z-fight + extents-containment
  property tests in `tests/modelgen/ops-v2.test.mjs` cover every op via its `SAMPLES` entry.
- **Materials by name** (`src/props/palette.js`): wood/steel/linoleum/bakelite/brass/galvanized/
  leather/paintOD/paintRed/paintBlack… Raw hex in a spec is rejected; add new materials to the
  palette (5 voxel tones + a glb PBR stub).

## The pipeline — per model, in order

### Phase 0 — Scope exactly ONE model
Era + type precisely ("Soviet 1960s двухтумбовый office desk", not "a desk"). Voxel is the
default and only built target (GLB is F2, not built).

### Phase 1 — Research the REAL thing (dispatch a research subagent via the Agent tool)
Sourced facts only → `models/<id>/ref/dossier.json`: dimensions (mm, each with a `src` — ГОСТ,
museum/catalog/marketplace listing), materials/finish, and a **feature inventory** — every
visible feature enumerated with a source (hinges: how many/where; latch type; strap routing;
handle; feet; markings layout). Unsourced facts go to `needs[]`, never guessed. A `derivation`
block holds computed dims (formula + which sourced facts feed it). Download 1–2 reference
images locally for overlay (`ref/` is gitignored for third-party photos; commit only
dossier.json + your own renders).

### Phase 2 — Author the spec (`models/<id>/spec.json`)
Translate dossier → operators + materials, **converting mm → m**. Every dimensional part cites
`dossier#<key>`. Map **every feature from the inventory** to a part — or an explicit `needs[]`
omission. A believable prop is usually **6–20 parts with 2–3+ materials** (paint + metal
hardware + wood/leather); a 3-part model reads as a placeholder. Placement idioms:
- Markings: `stencil` with `at` ON the face plane, `rot` to face outward (+Z is its normal);
  it stands 4 mm proud. Use `lines: 3` for text blocks (a solid black patch reads as a HOLE);
  rotate 45° (`rot:[0,0,45]`) for a star/insignia diamond.
- Hardware (latches, hinges): embed ~4 mm into the parent face, stand 6–8 mm proud — never
  coplanar with another face, never floating off it.
- Compute face positions from the body dims you already cited (body d=0.14 → face at z=±0.07).
Then `node tools/modelgen/lint.mjs models/<id>` until clean — BEFORE the viewer.

### Phase 3 — Build + self-verify loop (REQUIRED — this is where quality happens)
```bash
python3 -m http.server <fresh-port> --directory "/Users/macmini1/game 4.8"
# open http://localhost:<port>/tools/modelgen/viewer.html?model=<id>   ← autoloads spec + dossier
```
Drive `window.VIEWER` via the Playwright MCP (`browser_evaluate`):
- `await VIEWER.load('<id>')` → returns `{dims, needs}` — **compare dims (mm) to the dossier
  numbers immediately**; the eyes can't judge scale, numbers can.
- `VIEWER.view(name)` for the canonical sweep: **front / q34 / side / back34 / top / graze**
  (graze exposes z-fighting head-on views hide; back34 shows hinge-side detail).
- `VIEWER.ghost(true)` → 1.75 m human beside the model — THE scale sanity check.
  `VIEWER.bbox(true)` → actual AABB (yellow) vs declared footprint (cyan).
- `VIEWER.overlay('/models/<id>/ref/<img>', 0.5)` to compare against a reference photo.
- **Capture**: `browser_take_screenshot` can time out on rAF pages — the reliable path is
  `VIEWER.snapshot()` (returns a PNG dataURL; camera is applied instantly) saved via the
  evaluate `filename` param, then base64-decode to `models/<id>/renders/<view>.png` in Bash —
  and **`Read` each PNG to actually SEE it**. A render that doesn't show your model (blank,
  wrong subject) means the loop did NOT happen — the original incident "verified" a white
  screenshot and an unrelated Su-24 photo.
- List concrete defects per round (proportion vs dossier, placement, z-shimmer at graze, flat
  shading, missing features) → fix the spec (or an operator if the shape class is wrong) →
  `VIEWER.load` again → reshoot. Typically 2–4 rounds. Log each round in `models/<id>/BUILD.md`.

⚠️ **Module-cache trap:** `VIEWER.load()` re-fetches the spec JSON fresh, but if you edited
**operator/validator JS**, the page still runs the old ES modules — hard-reload the page
(`browser_navigate` with a new `?cb=`) after any `src/props/*.js` change.

**Definition of done:** lint clean · tests green · the canonical render set + ghost shot saved
in `renders/` at the final spec · every view Read and defect-free · BUILD.md updated.

### Phase 4 — Approve + register + integrate
Show the user the final multi-angle renders, then **end the presentation with an
AskUserQuestion popup proposing CONCRETE next steps** (named parts/defects drawn from
`needs[]` and what you saw in the renders — "add the lid gasket / fix strap routing /
approve as-is", never a vague "anything else?"). On a yes, wire into the game:
`game.js` fetches the spec (`fetch('./models/<id>/spec.json?cb=' + Date.now())` →
`registerModel(id, spec)`), consumers keep a small fallback mesh for the async window, and an
Admin Asset Viewer entry (`admin.js` props list) makes it inspectable in-game — screenshot it
there as the final check. Spec groups are floor-anchored: recentre (`m.position.y = -h/2` in a
wrapper Group) for bobbing pickups. World placement: `placeProp(scene, id, x, z, yaw)`.

## Z-fighting checklist (the owner explicitly wants this nailed)
Shimmer = two **same-normal coplanar overlapping faces**. Opposite-normal contact (stacked
layers, lid resting on body) is safe. Rules: lit/shadow bands are STACKED full-footprint
layers, never a smaller cap overlaid on a body top; proud details straddle or embed into the
parent face by ~4 mm, never share its plane. The property test enforces this for every
operator's sample args — keep new ops covered.

## Gotchas / red flags
- **`node --test tests/modelgen/` (bare dir) FAILS on Node 25** → always the glob
  `'tests/modelgen/*.test.mjs'`. No `package.json` anywhere (project invariant); pure modules
  must NOT import `three` (only `voxel-interp.js`/`registry.js`/`viewer.js` may).
- **This machine hoards stale `http.server` processes** — use a fresh port + explicit
  `--directory`, and confirm the served files are yours before trusting renders.
- **Never `rm -f *.png` in the repo root** (tracked QA screenshots); renders belong in
  `models/<id>/renders/`.
- Don't bypass the gates: junk `dossier#` keys that happen to resolve, inflated `maxDim`,
  or a footprint puffed up to swallow a misplaced part are all the same lie with extra steps —
  the validator catches the mechanical cases, you own the honest ones.
- needs[] is a feature, not shame — an honest gap beats an invented detail, and it tells the
  next research pass exactly what to find.
