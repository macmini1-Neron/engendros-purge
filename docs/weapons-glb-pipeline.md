# Weapon GLB pipeline + downloaded-model inventory

How real downloaded weapon models get into ENGENDROS PURGE, the full inventory of what we have
downloaded and ready, and the answer to "should we download several formats and mix them?".

Source pack: `~/Desktop/3d_Ripper_Pro_v108/Downloads/samanthacford/` — a low-poly Soviet weapon set
(CC-BY-4.0, author `samanthacford`). This is the only weapon-model stash; the in-game GLBs live in
`assets/weapons/`.

---

## 1. The pipeline (proven: Mosin, PKM, and now Makarov / AK-74 / sawn-off)

The engine only speaks **glTF / GLB** (vendored `GLTFLoader`, no OBJ/FBX loader). So every source —
whatever format it ships in — is normalised to **one self-contained `.glb`** (geometry + textures
embedded), dropped into `assets/weapons/`, and wired through the **GLB-weapon factory** in
`src/weapons.js` (`GLB_WEAPONS`). Adding a weapon is then ~1 config line + 1 stat line, not ~120
copied lines.

### Convert → GLB (no install; runs via `npx`, ~20 ms each)

| Source format | Command | Notes |
|---|---|---|
| **OBJ + MTL + textures** | `npx -y obj2gltf@3 -i model.obj -o out.glb` | embeds textures referenced by the MTL |
| **glTF (external texture)** | `npx -y gltf-pipeline -i model.gltf -o out.glb` | embeds buffers + textures → binary GLB |

Gotchas handled along the way:
- Textures in the pack are named `*.tga.png` but are **genuinely PNG** — rename to `.png` and patch
  the MTL/gltf `map_Kd`/image-uri so the converter's type sniff is happy.
- Some OBJ material names contain a space (`0000 AK_Platform_Body_mat`); harmless here because the OBJ
  uses a single `usemtl`, but if a multi-material OBJ ever misbinds, strip the space in both the OBJ's
  `usemtl` and the MTL's `newmtl`.
- A reusable inspector (node-transform-aware world AABB + node/mesh names) lives at
  `/tmp/glbconv/inspect.cjs` — use it to read the model's length axis before tuning placement.

### Wire into the game (`GLB_WEAPONS` factory)

Each entry: `url`, `length` (hand viewmodel length on Z), `center` (hand anchor), `rot` (import-pose
Euler), `world` (ground/preview length), `emissive` (flat-floor strength), `fb` (crude fallback shape).
The factory builds the hand model (WEAPON_LAYER + hip offset), the origin-centred world model (shop /
drops / ghosts / lootbox), the async fallback→GLB swap, and the `buildViewmodel()` crude silhouette.

Two recipe facts learned and encoded:
- **Material:** a glTF metallic map renders near-black with no env map → `metalness = 0`, plus a
  **flat emissive floor** (uniform self-glow, *not* gated by the often-near-black base map) lifts dark
  gunmetal/black albedo to a readable tone. (Map-gated self-light stays only on the Mosin, whose wood
  albedo is already light.)
- **Orientation:** OBJ→glb guns import **muzzle −Z** (`rot = [0,0,0]`); the FBX-sourced **Makarov**
  gltf imports **muzzle +Z** → flip 180° (`rot = [0, π, 0]`). Verify per model with a screenshot.

---

## 2. Inventory — what we have downloaded and how ready it is

✅ in game · 🟡 ready to add (clean convert path) · 🔶 needs care · ⬜ not a weapon / empty

| # | Folder | Real weapon | Format | Status | Class fit |
|---|---|---|---|---|---|
| 03 | LR.300.Inspired | LR-300 (AR carbine) | gltf+9tex | 🟡 | rifle (Western — off-theme) |
| 04 | PKM | PKM GPMG | gltf+3tex | 🟡 (in PKM branch) | rifle/hmg |
| 05 | RPG.7 | RPG-7 launcher | gltf+1tex | 🟡 | launcher |
| 06 | SVD | SVD Dragunov | gltf+4tex | 🟡 | sniper |
| 07 | Makarov.PM | Makarov PM | gltf+1tex | ✅ | pistol |
| 08 | PKM | PKM (OBJ variant) | obj+3tex | 🟡 (dup of 04) | rifle/hmg |
| 09 | AKS.74 | AKS-74 | obj+4tex | ✅ (shipped as `ak74`) | rifle |
| 10 | AK.74.GP.25 | AK-74 + GP-25 UGL | obj+4tex | 🟡 | rifle (+ grenade look) |
| 11 | RPK.74 | RPK-74 LMG | obj+3tex | 🟡 | rifle/lmg |
| 12 | Toz.34 | TOZ-34 o/u shotgun | obj+1tex | 🟡 | shotgun |
| 13 | SampW.Model.29 | S&W Model 29 .44 | obj+2tex | 🟡 | pistol (revolver) |
| 14 | SKS.Mod | SKS (modernised) | obj+4tex | 🟡 | rifle (semi) |
| 15 | SKS | SKS (classic) | obj+2tex | 🟡 | rifle (semi) |
| 16 | ADAR.15 | ADAR-15 (AR-15) | obj+4tex | 🟡 | rifle (Western — off-theme) |
| 17 | Sawed.Off.Shotgun | Sawn-off DB 12ga | obj+1tex | ✅ (upgrades `sawed_off`) | shotgun |
| 18 | Military.Tools | tools (not a gun) | obj | ⬜ | prop |
| 19 | Heavy.Tools | tools | obj | ⬜ | prop |
| 20 | Tools | tools | obj | ⬜ | prop |
| 21 | Utility.Knives.and.Icepick | knives + icepick | obj+2tex | 🟡 | melee |
| 01,02 | LR.300.Inspired (x2) | — | *empty* | ⬜ | failed/partial download |

**Recommended next adds (most theme-fit, cleanest convert):** SVD (06, sniper), RPK-74 (11, LMG),
SKS (15, semi-auto carbine), RPG-7 (05, launcher), TOZ-34 (12, hunting shotgun), S&W Model 29 (13).
The two AR-pattern guns (03 LR-300, 16 ADAR-15) convert fine but read as Western, off the Soviet theme.

---

## 3. "Download several formats and mix them?" — the answer

**Mostly a dead end, with one useful kernel and a better idea.**

1. **Mixing geometry across formats is meaningless.** Each gun is a single asset; there is nothing to
   merge between "the OBJ of gun X" and "the gltf of gun Y". You don't build one weapon from parts of
   two files.

2. **The only format work that matters is normalisation, not mixing.** The engine reads GLB; convert
   each source to a self-contained GLB (two `npx` converters cover the whole pack). That's it.

3. **The one useful kernel — alternate format as a recovery path.** Where a gun ships in *both* gltf
   and obj (e.g. PKM = 04 gltf / 08 obj), keep the second as a **fallback**: if one converts with bad
   UVs / flipped normals / a missing material, convert the other. This is "fix one *using* the other,"
   not "merge them." In practice it was rarely needed — both paths converted cleanly.

4. **The cross-pollination that actually helps is the integration recipe, not the mesh.** The material
   lift (metalness 0 + flat emissive floor), the orientation convention (OBJ = −Z, FBX-gltf = +Z→flip),
   and the placement tuning are reusable knowledge applied "fix the next based on the first." That is
   exactly what the `GLB_WEAPONS` factory encodes — one recipe, N weapons. **This** is where doing one
   carefully then templating the rest pays off.

5. **Watch-out specific to the 3D-ripped OBJs.** They use a **single material / atlas** per gun (one
   `usemtl`), so a folder with 4 textures only actually *uses* one in the OBJ — the extra textures
   belong to the gltf/FBX variant. Converting the OBJ gives a faithful single-atlas gun that may miss
   wood/accessory detail. For full multi-material, convert the **gltf** variant where it exists, or
   finish in Blender.

6. **The real bottleneck (and why the Blender pass is the right call).** Conversion is instant; the
   slow part is per-model **orientation + placement** (needs eyes / screenshots) and **dark source
   textures**. A Blender pass fixes exactly what conversion can't: re-bake/brighten textures, split the
   flattened single material, and align the muzzle/grip cleanly. So: factory + quick convert to get it
   *functional in-engine*, then Blender to make it *pretty* — which is the current plan.
