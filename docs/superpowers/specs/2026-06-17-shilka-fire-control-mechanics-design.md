# Shilka fire-control mechanic -- design

**Date:** 2026-06-17
**Branch:** `codex/shilka-mechanics-tests`
**Status:** prototype contract + node tests; not wired into the renderer yet
**Sources:** local SAM Simulator handoff at `/Users/macmini1/Documents/t62 harness/shilka-trainer/docs/session-handoff.md`; current airfield Shilka model in `src/airfield.js`.

## Goal

Bring the feel of the ZSU-23-4V1 training session into this game without cloning the full SAM Simulator cockpit. The player should perform the memorable chain:

1. Power and drive setup.
2. Radar warmup.
3. Search on an X-style scope.
4. Angle lock.
5. Range solution.
6. Short burst firing.

The mechanic should feel like operating a compact radar/fire-control system, not just pressing a generic turret button.

## What we learned from the simulator

- The critical missing step was `ГИДРОПРИВОД ВКЛ` -- hydraulic drive. Without it the radar/antenna does not move.
- `54V` mattered for the radar behavior; treating low-voltage power as "enough" is wrong for gameplay.
- `X` owns search and angle lock.
- `C` owns range traces/range solution, and it should not behave like a second antenna steering view.
- Fire only after a stable solution. Use short bursts because Shilka burns ammunition very quickly.
- Do not invent random panel labels as required controls. Only surface switches that matter to the gameplay chain.

## Player-facing loop

The first game pass should use a simplified HUD/tool surface:

| State | Player action | Feedback |
|---|---|---|
| `power_off` | enter Shilka / start station | dead scope, no traverse |
| `gyro_locked` | unlock gyro | drive checklist advances |
| `drive_off` | enable hydraulic drive | antenna can move |
| `radar_warming` | wait after radar power | warmup meter |
| `searching` | choose sector or circular search | sweep line on scope |
| `contact` | center a contact | target return brightens |
| `angle_lock` | right mouse / lock command | azimuth/elevation lock cue |
| `range_solving` | hold lock steady | range bar solves |
| `solution_ready` | fire short burst | ready lamp / reticle stabilization |
| `firing` | release before heat climbs | ammo and heat pressure |

## Proposed controls

| Input | Meaning |
|---|---|
| `R` | radar search on/off |
| `Q/E` | range scale / scope scale |
| mouse | aim/search antenna while in station |
| right mouse | attempt angle lock when contact is centered |
| left mouse or `Space` | short fire burst |
| `F` | radar/optical mode later |
| `X` | drop lock |

These can be remapped into the existing input system later. The pure prototype only defines the state contract.

## Pure prototype

The first code lives in `src/shilka-mechanics.js`. It deliberately imports nothing. The renderer, audio, UI, multiplayer, target list, and model rigging will call into it later.

The tested contract covers:

- Startup gating: `54V`, gyro unlocked, hydraulic drive, radar filament, anode, high voltage, and radar-on-air are required before warmup/search.
- Warmup gating: search cannot begin until warmup is complete.
- Contact gating: angle lock requires a visible contact and centered aim error.
- Range solution: builds only after angle lock, then flips to `solution_ready`.
- Lock discipline: bad aim breaks lock and clears range solution.
- Fire discipline: no solution means no fire; valid bursts consume ammo and add heat.
- Resource pressure: bursts are clipped by ammo, heat, and max burst length.
- Failure behavior: turning off required drive/power drops search, contact, lock, and range solution.

## Tuning v1

| Knob | Current value | Reason |
|---|---:|---|
| Radar warmup | 8 s | short enough for play, long enough to teach startup |
| Range solve | 2.5 s | asks for steady lock without becoming tedious |
| Lock break aim error | 5 deg | forgiving first pass |
| Ammo | 2000 rounds | enough for several contacts, still finite |
| Fire rate | 58 rounds/s | rough gameplay-scale total Shilka rate |
| Max burst | 1.4 s | prevents holding fire forever |
| Fire heat cutoff | 92 / 100 | gives overheat pressure before hard stop |

These are gameplay values, not final technical data.

## Integration plan

1. Keep the current airfield Shilka as the physical anchor.
2. Add a station/interact point near one Shilka.
3. Add a small DOM HUD panel for Shilka phases, ammo, heat, lock quality, range solution, and scope mode.
4. Feed nearby airborne targets or drone test entities into `setShilkaContact()` / `tryShilkaAngleLock()`.
5. On `solution_ready`, route burst fire through a visual tracer/impact layer.
6. Later, split station roles visually into `X` and `C` views if the first pass feels good.

## Non-goals

- No full SAM Simulator cockpit.
- No claim that every Russian label is interactive.
- No multiplayer synchronization yet.
- No detailed ballistic lethality model yet.
- No target AI change in this branch.

## Verification

Run:

```sh
node --test tests/shilka/mechanics.test.mjs
```

The test suite is intentionally pure and fast. Browser verification comes after renderer/HUD wiring.

