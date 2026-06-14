# poker-chip — BUILD log

Classic 11.5 g composite "dice" poker chip for the 3D poker scene. Owner: "boring classic" + PREPARE
THE CODE FOR SKINS (a CHIP_SKINS registry like the card backs; this dice design = skin v1).

## Round 1 (2026-06-13)
- Research (sourced): Ø40 mm × 3.3 mm (retail 11.5 g dice; casino standard 39 mm); **6 white edge spots** (sourced
  "six tabs with dice imagery"); smooth recessed colour centre with a thin dashed inlay ring; ABS/clay-composite +
  metal slug; colour→denom white1/red5/blue10/green25/black100 (no universal standard). Dice pips ~1–2 mm → omitted.
- New palette material `plasticWhite` (clean white) for the spots + ring.
- Spec: 8 parts — `body` (Ø40×3.3 cylinder axis y, built red), `inlay_ring` (white torus on the top face),
  `spot0..5` (6 white bevelBox edge tabs at 60°, rot Y = 90−θ so each faces radially, spanning the rim + slightly proud).
- **Lint clean:** 0.040×0.004×0.040 m, fill 100/103/100 %, 8 parts. modelgen tests 75/75.
- Renders (`renders/`): top (red body + 6 white tabs + white inlay ring — reads as a dice chip), q34, graze.

## Pending (integration, after sign-off)
- In-game: recolour the body PER DENOMINATION (white/red/blue/green/black/…); build the dice chip into the chip
  STACKS (poker-chips.js); add the **CHIP_SKINS registry** seam (v1 = this dice design) so future skins swap in.
- Dice pips omitted (could be a CanvasTexture decal later); centre recess + ridged edge not modelled.
