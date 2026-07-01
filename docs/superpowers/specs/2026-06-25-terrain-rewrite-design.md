# Terrain Rewrite — Visual, Biomes, Topology & Vehicle Grounding

**Date:** 2026-06-25
**Status:** Design (brainstorm validated via live dev previews) — awaiting owner spec-review → implementation plans
**Branch context:** brainstormed on `feat/forest-tree-physics-2`; git landing handled separately by owner. Validation artifacts = repo-root dev previews (`terrain-real-preview.html`, `terrain-biome-preview.html`, `terrain-assets-preview.html`, `terrain-style-preview.html`).

## 1. Why

The current ground reads as "meh": `terrain.js` is a deterministic fBm+Gaussian heightfield (`terrain-mesh*.js`, chunked-LOD) rendered with a **smooth** `MeshLambert` + slope-based vertex colours. It is a different visual language from the rest of the game (voxel, layered-shading) and has no surface detail. Separately, the Shilka/captured-tank **sinks/floats on slopes** because vehicles seat from a single point + fixed Y offsets.

Goal: a terrain that (a) matches the game's stylized aesthetic, (b) has real ground "texture" the way **real games** achieve it, (c) supports multiple **biomes** + **water**, (d) uses **designed** (not purely random) topology, and (e) lets tracked vehicles sit correctly — all **procedurally** (no image asset files), **co-op deterministic**, and **performant in-browser** (144fps target).

## 2. Research finding that drives the whole design

(Full report + sources captured in the session; key conclusion:)

Real stylized games (Valheim, Firewatch, BotW, Townscaper) **do not** sell ground with painted/photographic albedo textures. Perceived ground detail is overwhelmingly a **lighting / normal-map phenomenon**, not an albedo-colour one. They rely on: flat/faceted shading, vertex-colour or slope/height biome ramps, **baked AO**, strong directional+ambient light with a **gradient sky** + **coloured fog** for depth, low-frequency macro colour variation, and **dense instanced scatter**.

Corollary for us: because we drive colour/relief from **continuous world-space noise** (no tiled bitmap), the entire "hide texture tiling" sub-field (splatmaps, Quilez/Heitz de-tiling, texture-bombing) **does not apply** — there is no tile and no seam. We explicitly **reject**: tiled `CanvasTexture` albedo, splatmaps, photo-PBR normal/roughness maps. (An earlier canvas-noise experiment failed precisely because it perturbed *colour* and left the surface lit perfectly flat.)

## 3. Locked decisions

| Decision | Choice |
|---|---|
| **Form** | Faceted low-poly heightfield — non-indexed geometry + per-facet normals (flat-shaded), with subtle quantized terracing. |
| **Texturing** | Stylized **in-shader** pipeline (below). 0 image files. |
| **Biomes** | 6: **Les, Tajga, Step, Bažina, Zóna (toxická), Vulkán.** |
| **Biome distribution** | **Blended regions** within a map (moisture/temperature/altitude fields → per-point biome weights), not one-biome-per-map. |
| **Topology** | **Designed landforms** (ridges, valleys, roads, defensive positions, craters), layered over a procedural base; authored as data, evaluated as a pure function of (x,z). |
| **Water** | Per-region water table: translucent wobbling plane(s); lava/toxic variants emissive. |
| **Vehicle grounding** | Multi-point **torsion-bar** model (separate fix; not a terrain problem). |
| **Building integration** | Flattened footprint **pads** layered on the existing `terrain.reserved` keep-out system. |

## 4. Architecture

### 4.1 Heightfield (`terrain.js`) — designed topology, still pure
Keep the hard contract: `terrainHeightAt(x,z)` MUST stay a **pure deterministic function of (x,z)** (seed fixed at construction, no per-call RNG) — this is what makes co-op work (clients reconstruct entity Y from (x,z); `esnap` carries only x,z) and keeps node tests valid.

Designed topology = a **layered field**: `height(x,z) = base_fBm(x,z) + Σ authored_features(x,z) + deform(x,z)`, where authored features are data (not random):
- **Owner's stated shape language** (validated live in `terrain-buildgen-preview.html`): the **lowlands are gentle and gradual — large, near-flat terrace treads** (the faceted/contour visual kept, but low slope so each quantized tier covers a big area), and **mountains rise STEEPLY, abruptly, straight out of the flat ground** (near-vertical foot — a `peak·(1−d/R)^~0.55` radial profile gives the steep-at-the-base, flatter-at-the-top massif). The contrast (calm walkable plain ⇄ sharp landmark massif) is the intent, not uniform rolling noise.
- **Landform primitives** evaluated analytically: gentle low-amplitude long-wavelength base; **steep massifs/peaks** (steep radial profile rising from the plain); Gaussian hills/dells (exist today), **ridge splines** (distance-to-polyline → raised band), **valley/river channels** (negative distance-to-spline), **plateaus/mesas**, **craters**.
- **Flatten pads**: a footprint region (circle/rect) whose height smoothly blends to a constant `padY` over a blend ring — for buildings and spawn areas. Layers on `terrain.reserved`.
- All primitives are pure `(x,z)→Δh`, summed → co-op safe, node-testable. An optional authoring/heightmap layer can be baked to the same evaluator.

`dig.js` deform stays as the final additive layer (already pure/synced).

### 4.2 Faceted mesh
`terrain-mesh-arrays.js` builds **non-indexed** geometry with `computeVertexNormals()` → one flat normal per triangle (faceted). Bake per-facet **AO** (valley/concavity darkening from neighbour heights) into the vertex-colour attribute. Optional height quantization for terracing (tunable). Keep chunked-LOD + skirts.

### 4.3 Terrain material — in-shader pipeline (`onBeforeCompile` on `MeshLambert`)
Single material, patched by string-replacing built-in chunks. Per fragment (all from continuous world-space noise → no tiling, co-op-deterministic via a fixed integer hash):
1. **Biome colour blend** — `smoothstep` ramps over **slope** (`1 − faceNormal.y`) and **height**, blended further by the biome weights (§4.4): grass→dirt→rock, height bands (snow/sand), wet tint near water.
2. **Macro variation** — 2-octave value noise at ~30 m world scale: nudges colour brightness/hue AND jitters the biome thresholds so boundaries meander (breaks flat fills, seamless).
3. **Normal perturbation (the key step)** — Mikkelsen surface-gradient bump from a **biplanar** value-noise height field (2 fetches, no cliff stretching). Perturb the world face normal → convert to view space → assign to the lighting normal. This gives **lit micro-relief** that reacts to sun/flashlight (the thing the failed canvas attempt lacked).
4. **Baked AO** (from §4.2) multiplied in.

`flatShading` is moot — the slope and shading normal are derived from `dFdx/dFdy(worldPos)` so the look is faceted regardless. (★impl gotcha: name local derivative vars uniquely — `fdx/fdy` collide with the built-in flat-shading chunk.)

### 4.4 Blended biome system
Two low-frequency **climate fields** (pure fn of x,z): `moisture(x,z)`, `temperature(x,z)` (value noise, optionally biased by authored regions + altitude). Map (moisture, temperature, altitude) → **weights** for the 6 biomes (e.g. cold+wet→Tajga, hot+dry→Step, low+wet→Bažina, irradiated authored zones→Zóna, volcanic authored zones→Vulkán). Blend each biome's **palette, relief params, water, fog tint, scatter density** by those weights so regions transition smoothly. Boundaries are deterministic → identical host/client + matches scatter placement.

Per-biome data block: `{ palette(grass/dirt/rock + height-band), reliefFreq/Amp, macroFreq/Amt, water{level,colour,opacity,emissive}, fog{near,far,colour}, light{sun,hemi,ambient}, scatter[] }`.

### 4.5 Water
Per-region **water table** height (from biome + authored basins): a translucent plane (or chunked planes) at the local water level with gentle vertex wobble; colour/opacity per biome; **emissive** for lava (Vulkán) and toxic (Zóna). Entities/vehicles read water level for wade/submerge later (out of scope here).

### 4.6 Scatter (instanced, deterministic)
`InstancedMesh` per chunk per kind (grass blades, pebbles, rocks, and the existing `makeTree` forest trees + foliage). Placement by the **same deterministic noise** as biomes (density follows biome weights, co-op identical), frustum-culled per chunk, density/detail **fade by distance** into fog so the cull edge is invisible. Real game assets confirmed to drop straight in (validated live on the terrain in `terrain-buildgen-preview.html`): `makeTree` (`src/props/generators/tree.js`, self-contained) seats on the heightfield, and **buildings come from the buildgen pipeline** — `buildBuilding(spec)` (`src/buildings/interp.js`) returns a ready `{group}` with **metric-triplanar tiled brick** textures (reference fixture: the unshipped detailed `buildings/_smoke` «ПРОВЕРКА» cottage — owner-confirmed as the target look). The in-game `gatehouse.js` «ПРОХОДНАЯ» also seats fine; buildgen is the richer/detailed path.

### 4.7 Vehicle torsion-bar grounding (separable fix)
Replace single-point seating: sample terrain under each road-wheel station (per side), derive hull **height + pitch + roll** from the contact envelope (tracks bridge dips), clamp articulation to a torsion-travel limit, and droop/compress each wheel independently. **Decouple visual from collision**: vehicles roll on the *smooth* heightfield so they never catch on a visual facet/terrace step. Validated in all previews (naive-vs-suspension toggle).

### 4.8 Atmosphere
Per-biome (blended) sun colour/intensity + coloured hemisphere/ambient + gradient sky + distance fog with colour matched to the far terrain (Firewatch model) — does the depth/mood work that flat colours alone can't, and hides the scatter cull distance.

## 5. Co-op determinism contract
Everything new keys off `height(x,z)`, `moisture(x,z)`, `temperature(x,z)` and a fixed integer hash — all **pure functions of position**. Host and client compute identical colour, biome weights, water, and scatter with **no extra sync traffic**. Keep `terrainHeightAt` pure (no `Math.random`, seed fixed at construction).

## 6. Performance budget (144fps, browser, low-res render target)
- Faceted geometry + baked AO/biome vertex data: zero per-frame cost (rebuild only on dig, already localized).
- Shader macro + normal-bump: a few **value-noise** evals/fragment (cheap arithmetic, not bandwidth); biplanar (2 fetches), 2–3 octaves.
- Scatter is the real budget → chunked InstancedMesh + frustum cull + hard distance cutoff + fog hide; per-chunk LOD.
- Reuse existing chunked-LOD + culling. Net cost vs today ≈ neutral for terrain; scatter is the new line item.

## 7. Migration / compatibility
- Flat maps (arena/steppe) keep the y=0 fast path (gate the new pipeline on `hasTerrain`/profile).
- `dig.js` deform stays the final additive layer; remeshed chunks re-run the shader (no change).
- Existing assets (`makeTree`, `gatehouse`, foliage, props via `seatProp/seatBox`) already seat on `terrainHeightAt` — unchanged. Add flatten-pads under buildings.
- Sim Web Worker builds the same arrays (THREE-free `terrain-mesh-arrays.js` + climate fields must stay THREE-free).

## 8. Decomposition into implementation milestones (each → its own plan)
This is large; ship incrementally, each milestone independently visible/verifiable in the previews:
- **M0 — Shader pipeline (single biome).** Faceted + per-facet normal + biome colour blend + macro noise + Mikkelsen normal-bump + baked AO, on the real chunked terrain. *Highest visual ROI.*
- **M1 — Blended biome system.** Climate fields → weights → blend the 6 biomes' palette/relief/fog/light.
- **M2 — Water system** (per-region table + wobble + emissive variants).
- **M3 — Deterministic instanced scatter** (grass/pebbles/rocks + tree/foliage density by biome, distance fade).
- **M4 — Designed topology** (landform primitives: ridges/valleys/plateaus/craters + authoring data; flatten pads). *Biggest; may sub-split.*
- **M5 — Vehicle torsion-bar grounding** (multi-point seat + articulation; visual-vs-collision decouple).
- **M6 — Atmosphere pass** (per-biome fog/sky/light) + perf pass (LOD, scatter budget, worker parity).

Suggested order by value/risk: **M0 → M5 → M1 → M3 → M2 → M6 → M4** (M5 early because it's a standalone player-facing bug fix; M4 last because it's the largest and benefits from the rest being settled).

## 9. Open / deferred
- Authoring workflow for designed landforms (in-engine editor vs baked heightmap data vs code-defined splines) — decide at M4.
- Biome→climate mapping table (exact moisture/temp thresholds) — tune in preview at M1.
- Map sizes / which arenas get the rewrite first.
- Wade/submerge gameplay from water (out of scope).

## 10. Validation approach
Preview-driven (the established loop): each milestone validated in an isolated dev-viewer served over HTTP, verified in **Chrome** (0 console errors + screenshots), with the Shilka tank present for scale + grounding. Then in-game on `?map=forest`/`steppe`.
