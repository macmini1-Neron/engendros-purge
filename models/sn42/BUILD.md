# SN-42 — build log

**Стальной нагрудник СН-42** (Soviet WWII steel breastplate, ШИСБр assault-sapper armour) —
mob/enemy-worn body armour. Voxel modelgen prop.

- **Dossier:** `ref/dossier.json` (10 sources, 13 cited facts; 8 `needs[]`). Upper plate 430×340 mm,
  lower flap 320×250 mm (Музей Победы); 2 mm steel 36СГН; 3.3–3.5 kg; dark blued/oxidized finish;
  domed shell + deep U neck cutout + broad shoulders + rolled edges; leather/canvas shoulder + waist straps.
- **Built:** 0.367 × 0.640 × 0.125 m (W×H×D), 26 parts, 3 materials (`gunGrey` plate, `steel` rivets,
  `leather` straps + `paintBlack` flap seams). Lint clean, fills 100/100/100.

## Shape approach
Silhouette law: the cuirass is a **sculpted forward-convex shell**, not a slab. Built as **7 tilted
`bevelBox` facets** across the chest forming a forward dome + horizontal torso wrap (each facet
`ry`-rotated to follow the arc), with a **3-level top profile** carving the U-neck cutout between broad
flat shoulders. The abdominal flap is a flatter 5-facet arc below, overlapping the chest bottom, with
2 transverse `paintBlack` seam lines (the segmented flap). Domed steel rivets: a waist row of 5 + 2+2
shoulder-strap anchors. Leather shoulder straps drape back over the shoulders; a leather waist belt.

## Rounds
1. **v1 — un-tilted columns.** Faceted arc read as a *stack of separate vertical bars* (their lit top
   faces showed as bright horizontal strips); shoulder straps stuck up like horns. Dome/wrap (top view)
   was correct, but the shell wasn't unified.
2. **v2 — tilted facets + 3-level U.** Added `ry` tilt so facet fronts join into a continuous arced
   surface; collapsed the many height steps into a clean U-neck (deep centre, broad shoulders); reworked
   shoulder straps to lean steeply back over the shoulder. Reads as a cuirass.
3. **v3 — polish.** Thinner facets (d 0.040→0.034), less splay (sag 0.030→0.026), broad flat shoulders
   with a single clean U notch. Final. Graze view: no z-fighting; back34: correct hollow inner shell.

## Renders (final spec)
`front` `q34` `side` `back34` `top` `graze` `ghost-q34` `bbox-q34` — all Read, defect-free.

## Open (`needs[]` worth chasing)
- Rolled-edge lip is implied by bevels only — a dedicated thin lip would sharpen the rolled-rim read.
- No factory stamp/size mark modelled (none legible in sources) — if a `ростовка` size stamp is found,
  add a `decal` plate.
- Plate dims single-sourced (Музей Победы); a second source would firm up proportions.
