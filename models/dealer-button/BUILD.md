# dealer-button — BUILD log

Poker DEALER button (+ SB/BB markers) for the 3D poker scene. Owner: markers OK without a reference photo
(standard objects).

## Round 1 (2026-06-13)
- Research (sourced): Ø76.2 mm (3 in casino standard), ~20 mm thick chunky acrylic puck, WHITE with "DEALER"
  on the face (Wikipedia "Button (poker)"); rotates clockwise each hand. SB/BB markers exist in home sets —
  convention white DEALER / blue SMALL BLIND / yellow BIG BLIND.
- Spec: 3 parts — `body` (Ø76 white cylinder axis y), `face_ring` (faint grey recessed face disc),
  `label` (decal lines:["DEALER"], plate:true → dark plate + light text; rot[-90,0,0] faces up, text horizontal).
- **Lint clean:** 0.076×0.024×0.076 m, 3 parts. q34 reads as a chunky white DEALER puck (the diagonal text in the
  top render was just the straight-down camera's arbitrary roll — q34 confirms horizontal text).

## Integration
- In-scene markers are procedural pucks (mirror this canonical model): D = white "D", SB = blue, BB = yellow,
  replacing the old plain colour cylinders. The modelgen DEALER puck stays the canonical/admin model.
