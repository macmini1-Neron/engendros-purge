# World-clock displays contract — analog «ЧАСОЗБОР» + digital

**Date:** 2026-06-12
**Authority:** this doc + branch `feat/worldclock-analog` (Fable agent). **On any conflict between the two display agents, THIS version wins** (owner's instruction). The digital-clock agent (Opus) bases his branch on `feat/worldclock-analog` (or cherry-picks the contract commit) and follows this contract.
**Depends on:** PR #45 `feat/world-clock` (deterministic minute-counter world clock — `src/worldclock.js`, design spec `2026-06-12-deterministic-world-clock-design.md`).

## The one rule

**In-game time has exactly one source of truth: `game._worldClock`** (the `makeWorldClock` instance from `src/worldclock.js`, PR #45). A display NEVER keeps its own time, never advances anything, never syncs anything over the network — it is a pure per-frame *function of the clock*. Co-op sync, `/time set`, drift reconcile all already happen underneath (host-authoritative, integer minutes); both displays inherit them for free and can never disagree with the HUD clock or with each other.

## Read API (per frame, both displays)

```js
const wc = game._worldClock;
const mFloat = wc.minuteOfDay() + wc.alpha;   // float minute-of-day [0,1440) — smooth
```

| Display | Renders | From |
|---|---|---|
| **Analog** (Fable — this branch) | hour + minute hand rotation (NO second hand) | `handAngles(mFloat)` → `{ hourRad, minuteRad }`, clockwise-from-12 radians; for a dial facing +Z apply `hand.rotation.z = -rad` |
| **Digital** (Opus) | `HH:MM` text (NO seconds — they don't exist in the time model; 1 in-game minute ≈ 0.83 real s) | `formatHHMM(wc.minuteOfDay())`; re-render only when the integer minute changes; a blinking colon may key off `wc.alpha < 0.5` |

Both helpers are exported by `src/worldclock.js`. **Do not re-derive the math locally** — `handAngles()` was added by this contract precisely so every analog dial shares one mapping, and `formatHHMM` already zero-pads/wraps.

- Hands sweep smoothly (`alpha` interpolates between integer minutes); the hour hand advances continuously (12:30 → halfway between 12 and 1). Covered by `tests/worldclock/displays.test.mjs`.
- Update in the prop's per-frame hook in ALL game states where the world renders; reading the clock is side-effect-free, so no `hostSim` gate is needed (clients predict + reconcile underneath).

## Shared branding

Fictional Soviet clock factory for both assets: **«ЧАСОЗБОР»** wordmark + small **«СДЕЛАНО В СССР»** beneath. Analog: logo under the 12, «Стрела»-style. Digital: badge/decal on the housing («Электроника»-style VFD unit is the reference family).

## Asset conventions (modelgen)

- Analog: wall clock Ø ≈ 0.30 m, depth ≈ 0.07 m; grey ribbed metal rim, pale dial, black Arabic numerals 1–12, dash minute ticks; hands are **separately named nodes** (`handHour`, `handMinute`) pivoted exactly at dial center, z-layered above the dial, below the (implied) glass.
- Digital: the Opus agent picks his own dimensions per his reference; display digits must come from `formatHHMM` (no hand-rolled segment math for time).
- Both ship through the modelgen harness (spec JSON → lint → viewer verify) like every other prop.

## Placement (initial)

- Analog: one unit on an interior wall of the demo building (`src/demobuilding.js`, `?map=demo`).
- Digital: pick a DIFFERENT wall/spot (or another POI) so both can be seen side by side without overlapping; coordinate via this doc if unsure.

## Verification checklist (both agents)

1. `node --test tests/worldclock/` green.
2. In browser on `?map=demo`: `/time set 12:00` → analog hands 12:00 / digital `12:00`; same for `18:00`, `06:00`, `00:00`, `10:09`.
3. Let time run ≥ 1 real minute: display tracks the HUD `HH:MM` exactly (HUD is the same source, so any mismatch = you broke the rule above).
