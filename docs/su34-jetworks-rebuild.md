# Su-34 From-Zero Jetworks Rebuild

Source: Jetworks `Su-34_Construction-guide_2020-11-29.pdf`, 42 pages.

This rebuild is asset-only for the admin viewer. It follows the public RC construction guide as an exterior modeling scaffold, then later cross-checks the aircraft silhouette against public three-view/photo references. It must not add gameplay spawning, weapon systems, damage logic, hidden avionics, or classified/internal systems.

## Progress

- Pages 5-14: forward fuselage construction stage implemented in `src/su34model.js` as `su34_fromZero_p05_p14_forwardFuselage`.
- Pages 15-16: wing/canards construction stage implemented in `src/su34model.js` as `su34_fromZero_p15_p16_wingCanardAssembly`.
- Pages 17-24: rear turtledeck, tailcone, spine/belly, and nacelle core construction stage implemented in `src/su34model.js` as `su34_fromZero_p17_p24_rearTurtledeckNacelles`.
- Pages 25-33: ducting, exhaust bulkheads, nacelle belly, intake protectors, rear belly, servo blocks, and stabiliser spar construction stage implemented in `src/su34model.js` as `su34_fromZero_p25_p33_ductsBellyServoBlocks`.
- Pages 34-40: cable tunnels, turtledeck layers, upper nacelles, upper fuselage, exhausts, and stabilisers implemented in `src/su34model.js` as `su34_fromZero_p34_p40_upperTailExhaust`.
- Pages 41-42: completed model finish and photo shaping/paint pass implemented in `src/su34model.js` as `su34_fromZero_p41_p42_finishPhotoShaping`.

## Page Checklist

| Pages | Guide Parts | Model Status |
|---|---|---|
| 5 | Forward Fuselage Belly (Inner), Bulkhead 1 | Implemented |
| 6 | Forward Fuselage sides #1, Lower Fuselage Corner Reinforcers | Implemented |
| 7 | RX Tray, Bulkhead 3, Bulkhead 2 | Implemented |
| 8 | Other fuselage side, Forward Fuselage sides #2, forward tab, recessed rear area | Implemented |
| 9 | Bridge panel inner/middle/outer, Magnet Panel | Implemented |
| 10 | Forward Fuselage sides #3 and #4 | Implemented |
| 11 | Nosecone, Nosecone Aligner | Implemented |
| 12 | Canopy laminated/3D/vac form shape | Implemented |
| 13 | Canopy magnets and tongue | Implemented |
| 14 | Sanding transition guide, canopy base, turtledeck/belly placeholders | Implemented |
| 15 | Wing, 6mm carbon tube spar, centreline alignment | Implemented |
| 16 | Fixed/moving canards, wing strake, rear turtledeck seven-piece stack | Implemented |
| 17-20 | Rear turtledeck, tailcone, belly/former transition | Implemented |
| 21-24 | Nacelle inners/outers, jigs, splitters, belly support strips | Implemented |
| 25-28 | Inlet ducting, thrust/exhaust bulkheads, nacelle rear corner reinforcers, belly panels | Implemented |
| 29-33 | Intake protectors, tail extension reinforcers, rear fuselage belly, servo blocks, upper curved formers | Implemented |
| 34-39 | Cable tunnels, turtledeck layers, upper nacelles, upper fuselage, exhausts | Implemented |
| 40 | Vertical stabilisers, horizontal stabilisers | Implemented |
| 41 | Completed model, paint-ready finish | Implemented |
| 42 | Photo shaping/detail reference | Implemented |
| Photo pass | Landing gear, exterior lights, antennas, weathering, three-view silhouette correction | Next |
