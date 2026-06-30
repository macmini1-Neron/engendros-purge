# r105d — build log

**Subject:** Czechoslovak **R-105d** man-pack VHF radio (ČSLA / Tesla Pardubice, R-105/R-105D family) — the radio a "courier" engendro carries on its back. Czech (Latin) panel, NOT Cyrillic.

**Approach:** pure modeled voxel geometry, **no custom textures** (owner preference — clean voxel flat-shading). Markings via the existing `decal` op.

## Key decisions (owner-driven)
- **Closed case** (the openable-lid / control-panel version is a later follow-up).
- Body **0.17 × 0.325 × 0.31 m** (radiomuseum/valka); narrow front, deep, large side faces.
- **Lid X-cross** (two diagonal raised ribs + centre boss) **modeled in 3D, not painted** — on **both** narrow faces (front full; back shortened to clear the power switch).
- **Rounded corner guards** (thick `cylinder` rails, `tone:hi`), not thin rods.
- **Antenna**: brass→**steel** (owner: "no yellow"), straight **telescopic whip** — base flange + base + nut + 4 tapering segments with collar joints + cone tip. (The big black arc in refs is the headset cable, not the antenna — and the **cable was removed** at owner request.)
- **Power switch** on the front lid (matches zap.png: same face as the lid clasps): large black rotary knob + **VYP**/**ZAP** decals to its right. The X-cross is shortened so it ends above it.
- **Stencil serial `320065`** via `decal` (plate:false) on the +X side.
- **Harness** on the large −X side face: back pad + 2 webbing straps (2 leather keepers each) + waist strap + buckle.
- Shading: proud round details (rails, boss, antenna collars) use lighter `tone` for depth.

## Status
- `node tools/modelgen/lint.mjs models/r105d` → ✓ built 0.227×0.811×0.379 m, **58 parts**, fills 99/97/100%.
- Verified visually in the modelgen viewer with the owner (no headless Playwright on this Windows box → owner screenshots drove the loop). Owner sign-off: "ok".
- **2026-06-30 (Mac/Chrome):** cherry-picked onto a clean branch off main (`feat/courier-radio-r105d`); re-linted (all ops on main: bevelBox/cylinder/cone/plate/decal/handleU) + ran the full Playwright render sweep (`renders/{front,q34,side,back34,top,graze,ghost}.png`). Read every view — silhouette reads as the real R-105d at a glance; X-cross + power knob + 320065 serial + telescopic whip + harness all present; no z-fighting at graze; ghost scale correct. **Defect-free.**

## Rounds
1. v1 open-panel concept → owner: make it **closed + detailed**, straps on the **larger** side.
2. Closed case; corners/antenna **wrong** (antenna was the cable; corners too thin) → fixed: telescopic steel whip, chunky rounded guards, X-cross.
3. Tried a `texturedPanel` high-res op → owner: **too high-res / drop textures**; op reverted → rebuilt with pure modeled geometry + decal serial.
4. X-cross modeled on **both** faces; power switch (VYP/ZAP) added; top detailed; brass→steel; cable removed; X shortened to clear the switch.

## needs[]
See `ref/dossier.json` — corner-guard/antenna diameters are photo-proportional; back-face X is mirrored per owner direction (not photo-confirmed); harness webbing colour/lugs read from photos.

## Integration (DONE — 2026-06-30)
Wired onto the rare **backpack courier** engendro on branch `feat/courier-radio-r105d`:
- `src/game.js` `_registerModels()` → `await load('r105d')` (registered at boot alongside the other modelgen props).
- `src/enemies.js` `makeCourier()` → builds `buildSpec(getSpec('r105d'))` into the enemy mesh's local space via a new `_buildCourierPack(real)` helper; the original procedural canvas pack stays as a fallback during the async-register window, and a pooled enemy that cached the fallback upgrades to the real model on reuse.
- Mounted on the **back** with the telescopic antenna up (the "spot the courier" tell). Tunables `R105D_SCALE=2.0 / R105D_Y=0.65 / R105D_Z=-0.34 / R105D_YAW=π/2` (mesh-local; def.scale rides them). **The radio is SET INTO the round back** (z=-0.34, not floated behind) so it sits flush instead of cantilevering out — the owner flagged the first pass (z=-0.55) as sticking out wrong. Final owner tweak: turned a quarter (yaw π/2, wide flat side across the back, X-cross to the side) and dropped lower (Y 0.85→0.65). No emissive body-glow (removed — read as a night green-light bug). Verified from back-3/4 + side + front.
- **Courier is NORMAL-size only:** `makeCourier` early-returns unless `e.type === 'grunt'` (scale 1.0), and `waves.js` only rolls the ~1% courier chance on grunt spawns — so the radio never lands on the small (swarmer/runner/minitolo) or big (brute/titan) variants, nor the explode types (charger/exploder); the pack always sits at the size it's tuned for.
- `src/admin.js` Asset Viewer entry added for inspection.
- **In-game verified (Mac/Chrome):** spawned a courier (`enemies.spawn('grunt') → makeCourier`), confirmed the radio reads on the back from behind/side/front with the antenna above the head; 0 console errors; source-built (not live-tuned) placement confirmed after a clean module reload. See `renders/ingame-courier-back.png`.
