# Shilka named-node rig + model cleanup — design

**Date:** 2026-06-20
**Branch:** `feat/shilka-named-rig` (off `codex/shilka-flagship-mechanics`, PR #99)
**Status:** approved design → implementation plan next

## Goal

Replace the Shilka's fragile **bbox auto-rig** with a **named-node hierarchy baked into
the GLB**, fixing the parts that articulate wrongly, enabling two new openable hatches,
and doing a light model cleanup. The in-game rig handle keeps its current shape so the
PR #99 driving / fire-control / co-op code keeps working unchanged.

### Why (motivations confirmed with owner)
1. **Brittleness.** `shilka-rig.js` classifies all 93 meshes at runtime purely by
   bounding-box size/position. Any GLB re-export shifts centres/sizes and silently
   re-buckets parts; the file itself warns "re-derive plate names by ray-sweep if the GLB
   is re-exported."
2. **Wrong articulation.** The `turret` bucket over-grabs — meshes that should stay on the
   hull rotate with the turret ("otáčí se věci co nemají").
3. **New moving parts.** We want openable **commander** and **driver** hatches, which the
   bbox rig cannot express.

## Current state (ground truth)

- Asset: `assets/vehicles/lowpoly_zsu-23-4.glb` (~4.7 MB), a Sketchfab rip.
  188 nodes, **93 meshes, all generically named** (`cylinder_2`, `Object_4` …),
  flat hierarchy `Sketchfab_model → root → GLTF_SceneRootNode` (92 children),
  **no skin, no animation**. 12 materials (11 textured + 1 `"none"`).
- Loaded in `shilka.js`: `loadShilkaAsset()` → `buildShilkaRig(gltf.scene, THREE)`
  (asset url `./assets/vehicles/lowpoly_zsu-23-4.glb?v=20260617-2`).
- `buildShilkaRig` (`shilka-rig.js`, 107 lines) returns the **rig handle**:
  `{ root, body, turret, wheelsL[6], wheelsR[6], sprockets[], tracks[], guns[], dish[], radar, antennas[] }`.
- Handle consumers in `shilka.js`:
  - `_applyTurretAim`: `rig.turret.rotation.y = yaw`; `for g of rig.guns: g.rotation.x = pitch`.
  - radar spin: `rig.radar.rotation.y += dt * spin`.
  - `_applyRemoteDrive`/`stepDrive`: `rig.body.rotation.set(pitch,0,-roll)`;
    per-wheel `w.position.y = restY + offset`, `w.rotation.x = spin` (warns if not 6/side);
    `rig.sprockets[*].rotation.x`, `rig.antennas[*].rotation.z` sway.
  - `_matchHousingToHull(rig.root)` + a hardcoded mantlet-cluster fix keyed on
    `Object_84/86/154/155/157` (z-fight nudge / hide white plate).

## Approach (chosen: ①)

**① Bake a clean named-node hierarchy into a new GLB; rewrite `buildShilkaRig` to read names.**

In Blender: import the GLB, parent the 93 meshes under named empties, fix the model,
re-export. Rewrite `buildShilkaRig` to find the named empties and return the same handle
shape. **Delete** the bbox classifier (`classifyShilkaPart`) and the hardcoded
mantlet/`NAMES` fix — both become obsolete.

Rejected alternatives:
- **② Keep bbox rig, only fix model + re-tune bounds.** Doesn't fix the core (still a
  heuristic that re-breaks; turret over-grab needs fragile bound-tuning; hatches impossible).
- **③ Named empties for articulated parts only + a `Object_N → group` JSON map for the
  rest.** Two sources of truth, weaker than ①.

## Target GLB hierarchy (empties = pivots)

```
shilka_root
└─ hull                      static: chassis, fenders, sponsons, stowage, tools …
   ├─ turret                 yaw 360° — ONLY what rotates with the turret
   │  ├─ gun_elev            pitch, single pivot on the trunnion axis → 4× 23 mm barrel + mantlet
   │  ├─ radar               spin → RPK-2 antenna drum
   │  ├─ hatch_commander     hinge → commander hatch (turret roof)
   │  └─ antenna_0 / _1      sway
   ├─ hatch_driver           hinge → driver hatch (front hull, NOT on the turret)
   ├─ wheel_L0..L5 / R0..R5  12 pivots, EXPLICIT front→rear order (no runtime sort / 6-cap)
   └─ sprocket_L / sprocket_R + track_L / track_R
```

Rig built as **named empties + parenting, NOT a skinned armature** — the parts are rigid
and the game animates `node.rotation`; bones would add nothing.

`shilka_root` / `hull` are GLB-side anchors only. At load, `buildShilkaRig` still creates
its runtime `root → body` wrappers (body = the tilt/heading group) and re-homes `hull`'s
static meshes, `turret`, the wheel/sprocket pivots and `antenna_*` under `body` — the same
runtime tree as today, just sourced from named nodes instead of bbox buckets.

### Rig handle contract (output of the rewritten `buildShilkaRig`)

Unchanged fields (so all PR #99 consumers keep working):
`{ root, body, turret, guns, radar, wheelsL, wheelsR, sprockets, tracks, antennas, dish }`
- `guns = [gun_elev]` — one pivot holds all 4 barrels + mantlet, so the existing
  `for g of guns: g.rotation.x = pitch` loop rotates the cluster once (fixes barrels
  flipping individually).
- `wheelsL`/`wheelsR` resolved by name order `wheel_L0..L5` — drops the `cz` sort and the
  6-cap guard; each keeps `userData.restY` (the empty's local Y) for suspension.

New fields (additive — old code ignores them):
- `hatches = { commander, driver }` — hinge pivots; opened/closed by mount/dismount.

### Orientation / placement convention

Keep the model's native front = **−Z** and let `buildShilkaRig` apply the existing
`root.rotation.y = Math.PI` flip, so `shilka.js` placement / `stepDrive` math is unchanged.
Do **not** bake the heading flip into the Blender export.

## Model polish (light — "trochu")

- Delete the duplicate coincident mantlet plates (`Object_84/86/154/155`) → eliminates the
  z-fight at the source (cleaner than the runtime radial-nudge hack).
- Delete the untextured white plate (`Object_157`, material `"none"`, no UVs) — its textured
  twin already covers it.
- Leave materials as-is — `prepVehicleMeshTree` already converts to `MeshLambertMaterial`
  + `DoubleSide` at load (verified equivalent look, ~13 % cheaper fragment on real GPU).

## Workflow (hybrid)

1. Import the GLB into Blender (overwrites the empty default scene — owner-confirmed).
2. bpy script assigns the ~93 meshes to groups using the existing bbox logic as a
   first pass, then creates the named empties and parents the meshes.
3. Render + walk the viewport together: owner flags mis-assigned meshes ("this one
   isn't turret"); fix interactively. Priorities: **turret over-grab**, **hatch meshes**,
   **gun_elev trunnion axis**.
4. Apply model polish; export the new GLB (to `assets/vehicles/`, bump `?v=`).
5. Rewrite `buildShilkaRig` to be name-based; delete `classifyShilkaPart` +
   `_matchHousingToHull`/mantlet `NAMES` fix. Add hatch open/close hooks.
   Elevation/traverse limits = clamp constants in the aim code (≈ −4°…+85° elevation).
6. Verify in Chrome on the real GPU.

## Verification (real GPU, Chrome — not swiftshader)

- Driving: heading + tilt, wheels report **6/6** per side (no console warn), suspension
  + spin, sprocket spin, antenna sway.
- Turret yaw rotates **only** turret parts; hull parts stay put (the over-grab is gone).
- Gun elevation: all 4 barrels pitch together about the trunnion; clamp respects limits.
- Radar drum spins in place.
- Hatches open/close on mount/dismount.
- Co-op handle shape unchanged → `shilkastate`/`shilkamove`/`shilkaaim`/`shilkafire`
  paths untouched (no netcode change in this work).

## Risks

- **Re-export drift** (textures/transforms). Mitigation: keep −Z convention; verify
  textures survive the round-trip; diff the rendered result against the current build.
- **Breaking PR #99.** Mitigation: preserve the exact handle field shape; keep changes
  additive; in-game verify the full driving/FC/co-op path before pushing.
- **Wheel/part identification errors.** Mitigation: hybrid review step (4) with owner.

## Out of scope (this branch)

- Barrel recoil-on-fire, running track UV scroll (deferred — not selected).
- Any co-op/netcode change, fire-control balance, terrain traversability.
- A from-scratch voxel/Blender Shilka model (we are re-rigging the existing rip).
