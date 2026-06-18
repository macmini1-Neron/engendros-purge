# Sub-project B — "Ultra" Graphics Settings Menu — DIRECTION (rough)

**Date:** 2026-06-18
**Status:** DIRECTIONAL draft — NOT a committed implementation spec. Open questions below must be
nailed down (a proper brainstorm pass) before writing the plan + code. Builds on Sub-project A
([[engendros-perf-stutter-fixes]] pass #2, merged v302) and on the already-shipped #96 graphics base.

## Goal

Turn the current 3-preset graphics block (#96) into a **deep, readable graphics menu** a player can
actually tune — granular per-knob control, an honest live perf readout, and a few new image-quality
options. Owner's words: "ultra komplexní a hlavně kvalitní nastavení grafiky … prověř každý kout."
From the scoping questions, B = **(1) granular per-knob páčky · (2) live perf overlay/benchmark ·
(3) image-quality extras**. (The owner did NOT pick "more preset tiers + auto-detect" — so presets
stay a convenience layer, not the headline.)

## What already exists (#96, live) — the base we extend

`src/graphics.js` — `GFX_PRESETS` (Low/Medium/High) over 4 knobs + `adaptiveStep` (FPS-targeted
render-scale controller). `src/ui.js Settings` persists to `localStorage['engendros_settings']`.
Engine setters: `setRenderScale` · `setShadowQuality` · `setAdaptive` · `setFov`. Settings UI in
`index.html` (toggle/slider rows). Today's graphics keys: `gfxPreset, adaptiveRes, shadowQ, drawDist,
renderScale, aa, showFps, fov`.

**B does NOT rebuild this — it widens it.** Same Settings/persistence pattern, same engine-setter
pattern, same DOM-row UI system.

## The four pillars (rough)

### Pillar 1 — Granular per-knob controls
Each knob gets its own row; **presets become a convenience that just writes the knobs** (selecting a
preset fills the sliders; touching any slider flips the label to "Custom"). Candidate knob set
(current + new), each tagged live-apply vs needs-reload and rough GPU cost:

| Knob | Today? | Live? | Notes |
|---|---|---|---|
| Render scale (0.5–1.0) | ✓ | live | biggest GPU lever; slider when adaptive off |
| Adaptive resolution (on/off + target FPS) | ✓ | live | expose the target (60/120/144) |
| Shadow quality (off/1024/2048/**4096**) | ✓ | live | add a 4096 tier + maybe shadow distance |
| Anti-aliasing (off/MSAA) | ✓ | **reload** | constructor-bound; consider FXAA-style post (live) |
| Draw distance (m) | ✓ | live | ties into fog far + cull |
| Field of view | ✓ | live | already a slider |
| FPS cap / vsync (30/60/120/144/uncapped) | ✗ | live | rAF-throttle; honest frame pacing |
| Particle / FX density (low/med/high) | ✗ | live | scale the effects.js pool budget |
| Brightness / gamma | ✗ | live | tone-map exposure |
| Bloom / post effects (on/off) | ✗ | live | only if we add a post pass |

### Pillar 2 — Live perf overlay + benchmark
Extend the F3/FPS readout into a real overlay: **fps · frame-ms · draws · tris · (mem)** — most of
this is already read in `_frame` (`_draws`/`_tris`/`_frameMs`). Then a **benchmark button** that runs
the Sub-project A stress harness (`GAME.stress`/`hitch.js` — already built, that was the point) on a
fixed scenario and shows a before/after-style hitch report card per setting, so the player can SEE
the FPS impact of each knob. The harness is the engine; B gives it a UI.

### Pillar 3 — Image-quality extras
The "kvalita obrazu navíc" bucket: sharper/softer shadow tiers (PCF kernel), vsync/frame-cap,
better draw-distance without popping (LOD/fade — note the terrain LOD stack #81 is still unmerged),
maybe contact-ish shadow tuning. **Pick a small, high-value subset** — not all of it.

## Architecture direction
- Keep the **pure-config split** (`graphics.js`): all knobs derive from a plain config object (no
  Three.js state reads) → node-testable + headless A/B-able, same as #96/adaptiveStep.
- New engine setters mirror the existing ones (`setFov`/`setRenderScale`/…): one per live knob.
- DOM rows in `index.html` + `Settings` cached refs/setters (the existing imperative pattern).
- The benchmark reuses `src/stress.js` + `src/hitch.js` from pass #2.

## Phasing (so it's not one monster PR)
- **B1** — granular knobs + preset-writes-knobs + the new live knobs that are cheap/safe (FPS cap,
  particle density, gamma, shadow 4096). Pure-config + setters + UI rows.
- **B2** — the perf overlay (draws/tris/mem) + the in-menu benchmark UI over the stress harness.
- **B3** — image-quality extras (the chosen subset; some may wait on the terrain-LOD stack).

## Open questions to resolve before the plan (the "non-concrete" parts)
1. **Preset tiers:** keep Low/Med/High, or add Potato/Ultra? (owner skipped auto-detect — confirm.)
2. **Which NEW knobs make the cut** for B1 vs which are YAGNI? (FPS cap + particle density + gamma
   feel core; bloom/post needs a new render pass — worth it?)
3. **AA:** live up with the MSAA-needs-reload constraint, or add a live post-AA instead?
4. **Benchmark UX:** in-menu "Run benchmark" card vs just an expanded F3 overlay — how visible?
5. **Co-op:** graphics settings are local/cosmetic (no authority) — confirm nothing syncs.
6. Does B wait on the terrain-LOD stack (#74→#81) for the draw-distance/LOD image-quality bits?

## Non-goals
- Not rebuilding #96's preset/persistence/adaptive machinery — extending it.
- No gameplay change. Graphics settings are local-only (no co-op sync, no balance impact).
- Not every knob imaginable — pick the high-value set; YAGNI the rest.
