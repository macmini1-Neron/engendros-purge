# ЗОНА 704 skeleton — plan-as-data world compiler (roads + cadastre + terrain conditioning)

**Date:** 2026-07-02 · **Status:** design approved in brainstorm (owner), spec pending owner review
**Source of truth:** `docs/superpowers/specs/2026-07-02-world-map-master-plan.html` **v1.2** (branch `feat/world-map-master-design`, worktree `/Users/macmini1/eng-world-map`). Every coordinate, polyline, parcel and height in this design transcribes 1:1 from that plan. If the plan and this spec disagree, the plan wins.

## 1. Goal

Build the **walkable skeleton** of the 2500×2500 m master map «ЗОНА 704» as a new map `?map=zona`, so the owner can approve the topology in-engine instead of on an HTML picture. The skeleton is the *world compiler*: a data registry transcribed from the master plan drives terrain shaping, the road/rail network, and the POI cadastre. Every later layer (buildings, water mechanics, radio, spawns) reads the same data.

**In scope (skeleton):**
- Terrain per plan: base steppe noise + macro stamps (massif «РАНА», shelf, saddle, swamp bowl, quarry, T01–T12 micro-features).
- Full network: R1 «Трасса», R2 «Бетонка», forest loop, quarry link, railway, serpentine, spur paths, perimeter service road — terrain-conditioned corridors + draped surface ribbons.
- Cadastre: every parcel (P1–P9, S01–S20, E01–E08) gets a flattened pad + a signpost with ID/name/tier. No buildings.
- Placeholder layers (all owner-approved): static water planes (river Тихая, swamp −12, reservoir), physical gate blockades G1–G5 (rough colliding blocks + sign), ЛЭП pole lines along R1/R2, railway strip, bridge deck at S04.

**Out of scope:** buildings/interiors, water mechanics (swim/wade/poison), bosses & gate opening logic, radio layer, spawn/threat tiers, vehicles, Act 2 content, perimeter fencing beyond what terrain provides. Existing maps (arena/steppe/demo/forest) stay byte-identical.

## 2. Architecture — three new modules + one hook

| Module | Imports | Role |
|---|---|---|
| `src/zona-plan.js` | *(nothing)* | Pure data + lint. Exports `PARCELS`, `ROADS`, `TERRAIN_FEATURES`, `GATES`, `WATER`, `lintPlan()`. Node-testable, worker-safe. |
| `src/zona-terrain.js` | `zona-plan.js` | Pure height profile: layer composition, stamp primitives, corridor conditioning, pad flattening, bucket-grid spatial index. No THREE. |
| `src/zona.js` | THREE, `zona-plan.js`, terrain contract | Scene builder: draped road/rail ribbons, water planes, gate placeholders, ЛЭП poles, parcel signs, bridge decks. Booted from `world.js` on `?map=zona`. |

**Terrain hook:** `makeTerrain` gains a `profile: 'zona'` case via a **static import of `zona-terrain.js`** (pure → no cycle, no THREE). We deliberately do *not* add an `opts.heightFn` callback: the sim-worker rebuilds terrain bit-identically from **serialized** opts (`{profile, seed, slopeLimit, tuning, reserved}` over postMessage), and a closure would not survive serialization. A named profile keeps that contract intact — worker and main thread stay bit-identical for free.

## 3. Heightfield layering (pure `(x,z) → h`, later layer wins)

```
h = baseFbm(x,z,seed)            // seeded steppe roll, amplitude ≈ ±4 m (seed stays random-but-fixed for now — owner)
h = applyStamps(h, x,z)          // macro + micro features from TERRAIN_FEATURES
h = applyCorridors(h, x,z)       // pull toward each road's longitudinal profile
h = applyPads(h, x,z)            // parcel pads flatten last (pads win over roads win over stamps)
(+ dig DeformField on top, unchanged)
```

**Stamp primitives** (generalizing today's Gaussian `hills`):
- `ridge` — polyline + per-vertex height + falloff half-width; used for massif «РАНА» (NW→SE, dead forest → rock, +150 crest) and negative for balky (T01–T03) / úvoz (T07).
- `plateau` — rounded-rect or disc at target height with smoothstep skirt; airfield shelf +60, bunker saddle +200, mine bench +140, industrial terrace +30.
- `bowl` — negative disc; swamp −12, quarry S07 −25, craters T05, starica T09 (arc).
- `field` — small parameterized clusters: kurgans T06 (small hills), terraces T08 (stepped ramp), polom T10 (roughness patch only, near-zero height).

**Corridor conditioning:** per road, computed once at init (deterministic, from plan data only):
1. Sample the *stamped* terrain along the polyline every ~10 m of arc length.
2. Smooth (moving average) and clamp longitudinal slope per surface class: asphalt ≤ 8 %, panels ≤ 9 %, dirt ≤ 12 %, gravel serpentine ≤ 14 %, footpath ≤ 25 %, rail ≤ 3 %.
3. At runtime, inside `halfWidth` the terrain height is pulled fully to the profile (cut **and** fill); across the shoulder (≈1.5× width) it smoothsteps back to the stamped terrain.

**Pad flattening:** inside the parcel rect/disc the height is the plan height (default: stamped terrain at the parcel anchor); a skirt of 8–20 m smoothsteps to surroundings.

**Performance:** a coarse **bucket grid** (~50 m cells) indexes nearby road segments / stamps / pads, so each height sample tests only a handful of candidates. The composed function stays total (no NaN; every primitive clamps its own influence radius) and pure — player collision, horde nav, digging and the sim-worker all keep working unchanged.

## 4. Draped meshes & props (all sampled from the FINAL heightfield)

- **Road ribbons:** sample every ~3 m along the polyline, build a ribbon ~5 cm above ground; per-surface palette (asphalt / concrete panels / dirt+ruts / gravel / footpath) following the steppe `roadStrip` idiom (layered tones, wheel ruts, gravel speckle). No collider (walk/drive over).
- **Railway:** sleepers + two rails along the rail polyline (E05 tunnel mouth → S15 → P5 yard). No collider.
- **ЛЭП:** reuse the steppe pole builder; poles every ~45 m offset from the R1/R2 edge; thin colliders as in steppe.
- **Parcel signs:** concrete post + panel with `CanvasTexture` label — parcel ID, name, tier (e.g. «П3 · ЛЕТИЩЕ ЗАСЛОН · T3»). Collider on the post.
- **Gates G1–G5:** rough blocking volumes **with colliders** + sign: G1 steel gate slab, G2 rockfall wedge, G3 nest mound, G4 flooded causeway + sluice hut, G5 derailed wagon. No opening logic.
- **Water:** translucent static planes, no mechanics, walk-through: river Тихая ribbon, swamp plane at −12 zone, reservoir plane behind the dam; bridge deck at S04 (simple slab, collider). The river course + levels transcribe from the plan's «Biomy+voda» SVG layer; where the layer under-specifies (exact level, width), `zona-plan.js` authors the value and becomes authoritative — flagged back into the master plan on its next version bump.

## 5. Collision / nav / perf

Roads and pads carry no colliders; gates, poles, signs, bridge decks seat AABBs via `seatBox`. Chunked terrain mesh + LOD are reused with `extent = 1250` — chunk count and draw calls verified against the forest map's hitch budget on the M1 Mac (stat overlay + `GAME.stress` where applicable). Boundary treatment comes from terrain stamps where the plan says mountains/cliff; other edges are left honest-but-bare in the skeleton (fencing is a later layer).

## 6. Verification

1. **Node lint (`lintPlan()`, no THREE):** parcels inside bounds and non-overlapping (declared exceptions allowed), road endpoints match their declared connections, gates sit on their roads, water levels below adjacent pad heights, corridor slope clamps achievable, no degenerate segments.
2. **In-engine asserts (headless recipe):** `groundY` at pinned anchors — P3 shelf +60 ±3, P8 saddle +200 ±5, swamp −12 ±1, S07 −25 ±3, P6 +140 ±5; longitudinal slope along R1/R2 within clamp +ε; pad flatness (max deviation < 0.15 m); both T5 ridge footpaths walkable (slope < player walk limit along the path).
3. **Freecam contact sheet** (~12 vantage shots: КПП start, rozcestí fork, S04 bridge, Тесná brána, all five gate chokes, ridge crossing, P5 convergence, serpentine, P8+LZ) → owner review.

## 7. Error handling

`lintPlan()` throws in dev boot (fail loud before the map builds); degenerate plan entries are skipped with a console.error. The height function is total — every primitive guards zero-length segments and clamps influence. Canvas sign labels fall back to a plain tinted panel if text rendering fails.

## 8. Milestones (input for the implementation plan)

- **M1** — `zona-plan.js` transcription + `lintPlan()` + node tests.
- **M2** — `zona-terrain.js` stamps + `profile:'zona'` wiring; `?map=zona` boots on bare shaped terrain.
- **M3** — corridor conditioning + road/rail ribbons.
- **M4** — pads + signs + gates + ЛЭП + water planes + S04 bridge.
- **M5** — verification pass (asserts + contact sheet) + tuning to plan tolerances.

Likely 2 PRs: (M1–M2) terrain core, (M3–M5) network + cadastre + placeholders — final split decided in the implementation plan.

## 9. Decisions log

- **Approach:** plan-as-data compiler (owner, 2026-07-02) over baked heightmap and hand-tuned stamp list — the HTML plan becomes compiler input; single source of truth.
- **Base noise stays seeded-random** for now (owner: "random zatím") — plan drives only macro shapes.
- **All four placeholder layers in** (water, gates, ЛЭП+signs, railway) — owner: "Vše".
- **Venue:** new `?map=zona`; existing maps untouched (owner picked over forest-retrofit and offline harness).
- **Named profile over heightFn callback** — sim-worker serialization contract (found during design; supersedes the `opts.heightFn` idea from the brainstorm).
