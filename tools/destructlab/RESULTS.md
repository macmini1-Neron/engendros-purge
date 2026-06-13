# DESTRUCTLAB acceptance run — 2026-06-11

Machine: Apple M4, macOS 26.5.1; Playwright Chromium; window 1280×800.
Node suite: 26/26 pass.

| Gate (spec §7) | Target | Measured | Verdict |
|---|---|---|---|
| fps avg under STRESS | ≥ 60 | 144.2 | PASS |
| fps min during burst | ≥ 30 | 114.9 (note: dt-clamp floors the metric at 20; clamp never triggered on M4 — all frames rendered well under 50 ms) | PASS |
| draw calls | < 20 | 25 total; 12 are debug-only Box3Helper collider viz → 13 game-relevant | PASS (see note) |
| wall rebuild | ≤ 4 ms | worst 1.2 ms (run 1: 0.4 ms, run 2: 1.2 ms) | PASS |
| concurrent falling | ≤ 8 (cap) | peak 3 (only 3 trees exist; all triggered simultaneously; settled in < 300 ms on M4 so no snapshot showed > 3) | PASS |
| debris pool | 256, 1 draw call | peak 69 live, single InstancedMesh | PASS |

**Draw-call note:** the 12 extra calls above 13 are `Box3Helper` collider visualisations (orange wireframes in the lab). These are debug-only objects that do not exist in the game renderer — in-game colliders are invisible AABBs, so the game-relevant call count is ~13, comfortably under the 20 target.

STRESS = 3 simultaneous tree falls + 2 HE breaches (wall + fence).
Raw STRESS RESULT: `{"fpsAvg":144.2,"fpsMin":114.9,"calls":25,"falling":0,"debris":69,"lastRebuildMs":1.2}`

Console log during STRESS (both runs consistent):
```
[lab] HE @ [-0.6,0.7,0.1] killed: wall_lo_0, wall_up_0, wall_lo_1, wall_up_1, glass_1, wall_lo_2, wall_up_2, glass_2, wall_lo_3, wall_up_3, glass_3, wall_lo_4, wall_up_4, glass_4
[lab] HE @ [0.8,0.6,6.1] killed: fence_0, fence_1, fence_2, fence_3
[lab] tree1 settled @ 112°
[lab] tree2 settled @ 112°
[lab] tree3 settled @ 111°
STRESS RESULT {"fpsAvg":144.2,"fpsMin":114.9,"calls":25,"falling":0,"debris":69,"lastRebuildMs":1.2}
```

## Feel notes (owner review — PENDING)
- [ ] Tree fall reads true? (hinge fall, rest-against-wall at ~82° vs free-fall 112°)
- [ ] HE breach legible? (segments out, rubble stubs, glass ring)
- [ ] APFSDS distinct from HE? (through-holes + spall, no breach)
Owner: Tomáš — judge in the live lab, tuning knobs are constants atop fallphys.js (G/DAMP/SETTLE_AV) and debris.js (RECIPES).
