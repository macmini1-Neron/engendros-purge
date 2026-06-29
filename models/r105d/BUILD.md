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

## Rounds
1. v1 open-panel concept → owner: make it **closed + detailed**, straps on the **larger** side.
2. Closed case; corners/antenna **wrong** (antenna was the cable; corners too thin) → fixed: telescopic steel whip, chunky rounded guards, X-cross.
3. Tried a `texturedPanel` high-res op → owner: **too high-res / drop textures**; op reverted → rebuilt with pure modeled geometry + decal serial.
4. X-cross modeled on **both** faces; power switch (VYP/ZAP) added; top detailed; brass→steel; cable removed; X shortened to clear the switch.

## needs[]
See `ref/dossier.json` — corner-guard/antenna diameters are photo-proportional; back-face X is mirrored per owner direction (not photo-confirmed); harness webbing colour/lugs read from photos.

## Integration (next)
Replace the courier's inline `_pack` mesh in `src/enemies.js` (`makeCourier`) with this registered model, mounted on the enemy's **back** (current `_pack` is at z=+0.34 = front; move to z<0), panel/antenna facing outward, harness toward the body. Async `fetch` spec → `registerModel('r105d', spec)` → build mesh → attach with a small fallback box; scale to fit the plush.
