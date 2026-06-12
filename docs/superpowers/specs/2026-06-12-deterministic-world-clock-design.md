# Deterministic, synchronised day/night world clock — design

**Date:** 2026-06-12
**Branch:** `feat/world-clock` (off `main`)
**Status:** implemented + verified (solo in-browser + node tests; co-op logic verified by simulation, 2-PC playtest pending)

## Context / motivation

ENGENDROS is pivoting (white paper) from an arena wave-shooter to a **persistent Soviet survival-horror** world. That world needs a **real, always-running** day/night clock that:

1. **Gameplay can hang off** — timed events (a gate that locks at 20:00, night-only boss windows, scheduled spawns). The player decided gameplay *depends on the precise time*, not just a coarse day/night flag.
2. **Reads identically for every co-op player**, with a way to *prove* they agree (a hard sync check).
3. Shows the player a **real wall clock** (`HH:MM`) — ticks are an internal implementation detail, never surfaced.

### Prior state (what we replaced)

- Time advanced **only in `longnight` mode and only on the host** (`game.js` loop). In purge/demo it was frozen at noon.
- No real clock — `dayNight.info()` returned only `{night, n, blood}`; the HUD "clock" showed *run-duration* `mm:ss`, not time of day.
- Co-op sync was a **2 s snap** of a float `t`; clients did not advance locally, so a precise clock would visibly jump.
- `/time` was keyword-only and coarse (`day` == `noon`).

## Locked parameters

| Parameter | Value |
|---|---|
| Canonical time | one **monotonic integer** `total` (in-game minutes since world start) |
| Granularity | 1 tick = 1 in-game minute, 1440/day |
| Full cycle | **20 real minutes** → `stepSec = 1200/1440 = 0.833 s/min` |
| Day window | **06:00–18:00** (50:50 → 10 min day / 10 min night) |
| World start | **08:00** (`WORLD_START_MIN = 480`) |
| Host→client push | **~1 s** + on day/night transition + on join |
| `/time set` | **host-authoritative** (a client routes its request via `timereq`) |

## Architecture

### The "tick vs seconds" decision

Time that gameplay depends on is a *simulated* quantity → it lives on a **deterministic integer counter**. The sky is a *watched* quantity → it is **derived** from that counter as a continuous float. This is the same split reached earlier in design discussion: ticks for what you simulate, float-derived visuals for what you look at.

### Host-authoritative — no lockstep needed

The host is the single time authority (exactly like enemies/damage). **Timed events fire on the host only**, then broadcast like any spawn — so clients can never diverge on them. Clients only need a smooth, closely-synced *display*; they predict locally and reconcile to the host's integer push. Because the truth is an integer, "are we all in sync?" is an exact comparison.

### New module: `src/worldclock.js` (PURE — node-tested)

Wraps the proven fixed-step accumulator `makeClock` from `src/simclock.js` (already used in the loop as `_fxClock`). No THREE, no DOM. Exports:

- `makeWorldClock({ stepSec, startMinute, maxDt })` → `{ total (getter), alpha, minuteOfDay(), day(), advance(dt, onMinute), setTotal(n) }`. `advance` fires `onMinute(newTotal)` once per whole in-game minute; `alpha` is the sub-minute fraction for smooth sky interpolation (cosmetic, **never synced**). A stalled frame cannot fast-forward time (dt clamped by `maxDt`).
- Pure helpers: `parseHHMM`, `formatHHMM`, `keywordMinute` (dawn/noon/dusk/midnight → distinct minutes, fixing the legacy `day==noon`), `skyPhase(minuteFloat) → {day, L, ang}` (the sine-intensity + π-arc math, keyed to the 06–18 window, continuous at both boundaries), `isNight(minuteOfDay)`.

### Integration

- **`src/tuning.js`** — `WORLD_DAY_SEC = 1200`, `WORLD_START_MIN = 480` (feel knobs). `NIGHT_CYCLE`/`DAY_FRAC` are now dead (kept beside `SKYC`).
- **`src/world.js` (`DayNight`)** — `_apply` (the whole sky renderer) is **unchanged**; only the phase source changed. `renderFrom(wc)` drives it from `skyPhase(minuteOfDay + alpha)`. `onWorldMinute(total)` detects the day↔night edge (host-only) and rolls night/blood-moon. `setMinuteOfDay(min)` jumps the clock (used by `/time`); `setTime(keyword)` delegates to it. `applyNetState(d)` reconciles the local clock to the host's `total`, measuring the prediction error into `mp._lastClockDrift` before snapping. `reset()` is always active (no more mode gating).
- **`src/game.js`** — owns `this._worldClock` (created beside `_fxClock`). Loop: `advance(dt, _stepMinute)` on host/solo, `advance(dt)` (silent prediction) on clients, every frame, **all modes**; then `dayNight.renderFrom` + `hud.setClock`. `_stepMinute` fires `onWorldMinute` host/solo only. `reset()` seeds the clock to `WORLD_START_MIN`. Night/dawn banners now fire in every mode.
- **`src/mp.js`** — `worldTimeState()` carries integer `total`; the `night` handler reconciles via `applyNetState`; push cadence 2 s → 1 s; `timereq` handler (client → host set-time, mirrors `radioreq`); `requestSetTime(min)`; `_lastClockDrift` for the check.
- **`src/console.js`** — `/time` → status (`HH:MM · day N · Δ host`); `/time set HH:MM|<phase>`; `/time check` (✓ IN SYNC / ✗ OUT OF SYNC on the integer drift). Host/solo applies directly; a client routes via `requestSetTime`.
- **`src/ui.js`** — `setClock(info, wc)` renders `HH:MM` + day/night glyph (was run-duration).

## Data flow (co-op)

```
HOST: _worldClock.advance(dt, _stepMinute)  → owns `total`, fires timed events
      every ~1s + on transition + on join → broadcast { total, n, blood }  ('night')
CLIENT: _worldClock.advance(dt)  → smooth local HH:MM prediction
        on 'night' push → measure drift (= localTotal − hostTotal) → snap to host total
        /time set → 'timereq' {min} → HOST setMinuteOfDay(min) → broadcast
```

## Testing / verification

- **Unit (`tests/worldclock/worldclock.test.mjs`, 21 tests):** HH:MM parse/format round-trip + invalid input, minute/day wrap, `skyPhase` anchors + boundary continuity + L∈[0,1], keyword distinctness, advance determinism, the stall-clamp guard. Full repo suite: 251/251.
- **Solo (browser):** boot clean (0 errors); clock seeds 08:00; deterministic rate (12 in-game min per 10 real s); sky tracks (noon sun 2.1 / midnight 0.12); HUD shows `HH:MM · DAY/NIGHT`; `/time set 20:18|6:30|dusk|noon|midnight` all snap correctly; invalid input rejected; day window `[06:00,18:00)` exact.
- **Co-op (simulated):** payload carries integer `total`; client reconcile snaps + measures drift; `/time check` reports IN/OUT OF SYNC on the drift; `requestSetTime`/`timereq` wired. **2-PC WebRTC playtest pending** (co-op is verified manually in this project).

## Open defaults (easily changed)

World starts 08:00; night banners fire in all modes; `NIGHT_CYCLE`/`DAY_FRAC` kept as dead constants.
