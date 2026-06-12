---
name: voxel-weapon-modeling
description: Use when building or upgrading a first-person voxel weapon viewmodel (or any voxel prop/enemy) in the ENGENDROS PURGE game (src/game.js buildViewmodel). Codifies the layered-shading "prettiness" technique, the MeshBuilder API + coordinate conventions, a part checklist, the reference workflow, and the live render-verify loop — so weapons come out crisp and consistent, with or without a reference image.
---

# Voxel Weapon Modeling (ENGENDROS PURGE)

Make clean, "pixel-pretty" voxel weapons for the browser FPS at `/Users/macmini1/game 4.8`.
The look to hit: blocky like Minecraft/Zumbi-Blocks, but with crisp readable shading — NOT a flat dark blob.

## The #1 lesson (why earlier models looked bad)

**Never use near-black as a main colour.** A single dark box reads as a featureless silhouette.
Prettiness comes from a *technique*, not from a reference: **layered shading**. Keep the main body a
medium tone and let lighter top faces + darker undersides + near-black recesses create depth.

A reference image is for **shape** (proportions + signature features), not for quality. Known WW2 guns
can be modelled from memory; a reference just sharpens details and stops wrong guesses.

## The quality bar — NOT boxes-only, NOT fake text (ЛПР-1 retro, owner mandate)

The project's PROVEN standard includes complex curved meshes and readable textures — the
binoculars + ЛПР-1 viewmodel cases (lathe/extrude), the gatehouse console CRT, the gramophone
record labels and the «ЧАСОЗБОР» dial all already ship it. "Voxel" names the art direction,
**not a primitives-only constraint.** Concretely:

- **Classify the reference's shape class BEFORE building.** Boxy → MeshBuilder boxes. Curved /
  cast / turned (binocular bodies, drums, eyecups, capsule housings) → real THREE profiles via
  `b.geo()`: `LatheGeometry` for revolved parts, `ExtrudeGeometry` (rounded Shape + bevel) for
  cast shells. The binoculars and lpr1 cases in `weapons.js` are the copy-from templates.
  *"Close enough with boxes" is the banned rationalization that shipped the ЛПР-1 brick —
  every dimension correct to the millimetre and the owner still rejected it.*
- **Readable markings.** Any text the player can read up close (label plates, dials, engraved
  ВКЛ/ВЫКЛ housing labels) = real legible Cyrillic via CanvasTexture —
  `makeTextPlateTexture(lines, {plate})` from `src/props/operators/round.js`, attached as
  textured planes through the `_post` hook (see the lpr1 case). 1-px cream bars are ONLY for
  sub-10 mm / distant markings. The азбука must actually read.
- **Silhouette gate**: before detailing, put your render NEXT TO the reference photo and ask
  "would the owner recognize it at a glance?" — and offer the owner one early shape screenshot.
  Feedback after the full build is maximum-sunk-cost feedback.

## Layered-shading palette (the core recipe)

For every material, define **5 shades** and place them by surface role:

| Role   | Use on                                   | steel (gun-blue)        | walnut          |
|--------|------------------------------------------|-------------------------|-----------------|
| Hi     | top faces that catch light, top strips   | `0x888f99`              | `0x9d6d38`      |
| Mid    | main body / sides                        | `0x636a74`              | `0x82562a`      |
| Lo     | undersides, thin bottom shadow strip     | `0x474d56`              | `0x643f1e`      |
| Slot   | recesses: cooling slots, ports, bores    | `0x2b2f35`              | `0x3a2614`      |
| Bright | tiny accents: sight post, bolt knob, edge| `0xa0a7af`              | `0xb07e44`      |

- Honey wood (Kar98/Garand stock): Hi `0xc79a5a` / Mid `0xa9793a` / Lo `0x855a28`.
- Build a base box in **Mid**, then lay a thin **Hi** strip on top and a thin **Lo** strip on the bottom.
- Cut-ins are small **Slot**-coloured boxes sitting slightly **proud** (~0.003–0.008) of the surface so they
  win the depth test and read as dark recesses (true holes would need geometry gaps — proud-dark is enough here).
- Add `tint: 0.02–0.05` for subtle per-box variation; on wood this fakes grain. (tint is a uniform random
  lighten/darken per box.)

## Project API & conventions

- One merged mesh per weapon, one `voxelMaterial()` (vertex-coloured `MeshLambertMaterial`). Add geometry with:
  - `b.box(w, h, d, x, y, z, color, { rx, ry, rz, tint, sx, sy, sz })`
  - `b.geo(threeGeometry, x, y, z, color, opts)` — for cylinders (drums, pans, barrels, compensators).
    `THREE.CylinderGeometry` axis is **+Y** by default: `rx: Math.PI/2` → axis +Z (faces gunner), `rz: Math.PI/2` → axis +X (faces sideways). **dispose the geometry after `b.geo`.**
- Coordinate convention (camera-space viewmodel): **muzzle = −Z**, up = +Y, right = +X, stock/grip toward **+Z**.
  Receiver near z≈0, shroud/barrel z≈−0.3…−1.2, stock z≈+0.2…+0.85. Total length ~1.8–2.2.
- The case lives in `buildViewmodel(def)`'s `switch (def.shape)` in `src/game.js`. `def.color`/`def.accent` exist
  but for a detailed model define your own palette consts inside the case (clearer + layered).
- Magazines: STATIC mags are baked into the case. A SPINNING mag is a SEPARATE mesh — give the weapon a
  `spinMag:{shape,x,y,z,r,axis,step}` config; `buildMag()` builds it, `WeaponSystem` animates it (e.g. DP-28 pan
  steps one round per shot). Don't bake a mag that should spin, and vice-versa.

## Part checklist (most guns)

Stock/butt-plate · wrist into receiver · receiver (body + lit top tube + ejection-port slot + bolt handle/knob)
· rear sight · barrel or perforated shroud (+ slot loop) · muzzle / compensator · hooded front sight (wings + top + bright post)
· magazine (+ housing neck) · pistol grip · trigger guard + trigger. Use `for` loops for repeated features (cooling slots, barrel fins).

## Signature features cheat-sheet (verified from references)

- **StG-44**: stamped receiver, **curved 30-rnd banana mag**, ribbed/vented handguard, reddish-warm wood grip + buttstock, hooded front sight, muzzle nut.
- **DP-28**: flat **PAN magazine on TOP** (concentric rings), long barrel + **conical flash hider**, **bipod**, dark wood stock.
- **Thompson M1928**: **two wood grips** (pistol + vertical foregrip), **Cutts compensator** (ribbed) at muzzle, **finned barrel**, top charging handle + Lyman rear sight, blued steel; box OR drum mag.
- **Kar98k**: long **honey-wood stock** nearly full length, **turned-down bolt handle** (right side), dark metal barrel-bands/trigger-guard/tip, tangent rear sight, hooded front.
- **M1 Garand**: wood stock + handguard, **op-rod under the barrel**, **en-bloc clip** in the receiver, dark metal, hooded front sight.
- **Mosin-Nagant**: very long, **straight bolt handle**, long wood stock, hex/round receiver, dark metal, blade front sight.
- **PPSh-41** (done): perforated barrel jacket (slots), **71-rnd drum** (round face toward gunner, static), slanted compensator, wood stock.

## Reference workflow (when shape accuracy matters)

1. `WebFetch` the Wikipedia article → ask for "the full direct image URL (https://upload.wikimedia.org/...) of the infobox photo, output only the URL".
2. `curl -sL -A "<full browser UA>" "<url>" -o /tmp/gunrefs/<name>.jpg` — **use the page's native thumb size** (e.g. `330px-`); arbitrary sizes (800px) return HTTP 400 "use thumbnail sizes listed…". Bing/Google image pages return blank to the automated browser — don't rely on them.
3. `Read` the downloaded file to study proportions, colours, signature parts.

## Verify loop (REQUIRED — never claim done without it)

1. Edit the case, then **bump `index.html` `?v=N`** (cache-bust) — server is no-store on :8099.
2. `browser_navigate` to `http://localhost:8099/index.html?cb=<unique>` (unique `?cb` defeats the ES-module cache).
3. Render from **3 angles** and screenshot+Read each:
   - **3/4 / side**: drive the shop preview — `G.startGame(); G.shop.open(3); G.state='shop'; const pv=G.preview; pv.show(key); pv.holder.rotation.set(0,a,0); pv.cam.position.set(...); pv.cam.lookAt(0,0,0); pv.renderer.render(pv.scene, pv.cam);` then screenshot `#previewCanvas`.
   - **first-person**: `G.state='playing'; hide overlays; cam at (20,3.2,20) rot(0.02,0,0); G.weapons.grant(key,'common'); G.weapons.select(key); G.weapons.update(0.0001); G.engine.render();` then full screenshot.
4. Check: light crisp metal (not black), visible slots/details, correct mag orientation & position, no z-fighting, reads at viewmodel scale, **console errors = 0**.
5. Restore to menu (`G.toMenu()`), delete temp screenshots, bump the memory log.

## Gotchas

- Children of the camera only render if the camera is in the scene (`scene.add(camera)` is already done).
- Setting `style.display=''` on `#previewWrap` reverts to CSS `display:none` — use `'block'`.
- Don't z-fight: detail boxes slightly proud, no coplanar same-plane faces of different colour.
- A drum/pan facing the gunner (rx:Math.PI/2) reads round in first person but thin from the side — fine, the player only sees first person.
