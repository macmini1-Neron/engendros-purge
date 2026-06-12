# wallclock-chasozbor — build log

Soviet «Стрела»-family round secondary (slave) wall clock, in-game brand **«ЧАСОЗБОР»**.
Live prop: hands are rig nodes driven per frame from `game._worldClock` via
`handAngles()` (see `docs/superpowers/specs/2026-06-12-worldclock-displays-contract.md`).
Lore bonus: the real ВЧС-1 had no local timekeeping — hands stepped on 24 V pulses from a
central clock station, exactly like our hands follow the central world clock.

## Provenance

`ref/dossier.json` — researched 2026-06-12 (subagent, 12 sources). Hard dims: case Ø282 mm
(eBay 184697768254), depth 70 mm (Pamono Ø280 sibling), ВЧС dial standard 285 mm
(npk-modul). Hand lengths derived (115 / 78 mm) with flagged assumptions. Weak-provenance
facts (hammered enamel, domed glass) and photo-only details are flagged in needs[] (10).

## Rounds

**R1** — 13 parts: case cylinder + back plate + mech cap + wire terminal (sourced two-wire
pulse line), 3 stepped rim tori (lip bright→hi→mid telescoping back), texturedDisc
`kind:'clockDial'` (new canvas generator in `src/props/operators/round.js`, 1024 px),
2 black hands as `handHour`/`handMinute` rigs (pivot at dial centre, axis z, pose 0 = 12:00),
chrome hub cap. Lint clean: built 0.282×0.282×0.105 m, fills 100/100/95 %. Viewer dims match
dossier (282×282×105 mm). front/q34/graze/back34 all clean — no z-shimmer at graze (tori at
distinct radii/z, dial 3 mm proud of case face, hands 4/9 mm proud of dial).
Defects: wordmark slightly small; hands at 12:00 hide the hour hand in presentation shots.

**R2** — dial wordmark 0.042→0.052·S, sub-line 0.026→0.030·S; rig poses set to the catalog
**10:09** (handHour −5.3171 rad, handMinute −0.9425 rad — display-only; the game overwrites
rotation every frame). This doubled as the rig proof: both hands rotate correctly clockwise
about the dial centre. Ghost shot: reads as a true ~28 cm wall clock beside the 1.75 m human.

## Definition of done

- lint clean ✓ · `tests/modelgen` 67/67 ✓ · full repo suite 256/256 ✓
- renders/: front, q34, graze, back34, ghost — all Read, defect-free at final spec ✓
- needs[] honest (10 entries — photo-only details, weak-provenance finish, omitted glass/hanger) ✓

## Runtime contract (Phase 3)

```js
import { handAngles } from './worldclock.js';
const a = handAngles(wc.minuteOfDay() + wc.alpha);
hourNode.rotation.z = -a.hourRad;     // nodes found via group.getObjectByName('handHour'/'handMinute')
minuteNode.rotation.z = -a.minuteRad; // negative z = clockwise on the +Z-facing dial
```

## In-game verification (Phase 3, ?map=demo)

- Programmatic 1:1: `/time`-equivalent `setTotal` at 12:00 / 18:00 / 06:00 / 10:09 / 00:00 —
  hand rotations match `-handAngles()` within ≤ 0.001 rad (residual = live `alpha` drift
  between set and read, i.e. the smooth interpolation itself). God mode needed: the sim
  (and thus the clock) correctly FREEZES on player death — first run died mid-assert.
- Live ticking: unattended hands tracked 08:00 → 08:35.7 exactly (≈30 real s at 0.833 s/min).
- Visual: `renders/ingame-1009.png` (wall context) + `renders/ingame-close.png` (dial fully
  readable in-game, hands at 10:09). WebGL canvas needs an explicit `GAME.engine.render()`
  in the same JS task before `toDataURL` (no preserveDrawingBuffer).
