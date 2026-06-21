# Shilka — Realistic Powerplant: APU Turbine + Diesel, Stall/Restart, Gearbox

**Date:** 2026-06-21 · **Branch:** `feat/shilka-named-rig` (worktree `.claude/worktrees/shilka/`)
**Owner decision:** implement the **FULL realistic** model (2-engine start + stall→restart state
machine + realistic ГМ-575 gearbox). This spec is the post-compact handoff — it carries the two
research reports + the implementation plan so work can continue after context compaction.

Companion specs: `2026-06-21-shilka-drivetrain-behavior-research.md` (tracks/suspension/body-dyn —
SHIPPED), this one = the engine/transmission realism (NEXT).

---

## 0. Where we are (already shipped on this branch, committed)

The drivetrain program Phases 1-7 + chase cam + ride shake are DONE & committed:
- Named-rig GLB load, no-pivot steering, per-side track scroll/differential, asymmetric bouncy
  suspension, deformable track belt-bones, hull pitch/roll spring + lurch, recoil + camera trauma.
- **Ride shake** (crew feels terrain): camera-LOCAL, driven by **suspension** (mean `|wheelVel|`),
  gated on `engineOn`, per-seat + zoom scaled. `SHILKA_RIDE` consts in `shilka.js`; `_cameraShake`.
- **Engine starts OFF** (`createDriveState` engineOn:false; `_enterDriverSeat` engineOn:false);
  idle+ride shake gated on `engineOn`; HUD shows `ПУСК ↵` until started; starter = hold **Enter**.

**This spec replaces** the current single-engine on/off with the two-engine + stall/restart + gearbox model.

---

## 1. The powerpack — TWO engines (research-confirmed)

The ZSU-23-4 is genuinely a two-engine vehicle:

| Unit | What | Drives | Start |
|---|---|---|---|
| **V-6R diesel** | 6-cyl 20 L, **280 hp @ 2000 rpm** (V-2 family) | **the TRACKS only** (via ГМ-575: dry multi-plate clutch → 5-fwd+R gearbox → 2 planetary steering gears → finals) | electric starter (ST-700 ~15 hp, from batteries); **compressed-air backup** (dead battery/deep cold) |
| **DG4M-1 gas-turbine APU** | single-shaft GTD, **~70 hp @ 6000 rpm** (a.k.a. DGChM-1; player's "GTA-6") | an **electrical generator** (27/54 V DC + 220 V/400 Hz AC) | spun up electrically from batteries, lights in seconds, independent of diesel |

**The APU generator powers EVERYTHING electrical:** RPK-2 «Тобол» radar, fire-control computer,
**turret traverse + gun elevation**, sights/FCS, radio. → the Shilka can **search, track and FIRE
while parked with the diesel OFF**. The diesel contributes nothing to radar/turret except via the
shared battery/charging bus.

**One-line interplay logic:**
```
canUseRadarAndTurret = apuRunning            // independent of the diesel
canStartDiesel       = electricsOn           // APU running OR batteries OK
canMoveTracks        = dieselRunning && gearEngaged
```
Audio/feel: APU = continuous high turbine **whine** (always on while electrics live; parked-and-
scanning = this alone). Diesel = deep 6-cyl **rumble**, layered on only while driving.

---

## 2. Start sequence (2-stage "bring it to life")

Realistic crew order:
1. **APU START** (new toggle) → turbine spools up ~2-3 s → `apuRunning = true` → radar + turret +
   sights live. Combat-capable while parked, diesel cold.
2. **ENGINE START** (existing Enter/starter) → only succeeds if `electricsOn` → diesel cranks
   ~1.1 s warm (~2-3 s cold) → `dieselRunning`. Now the clutch/gearbox can move the tracks.
3. APU keeps running to hold radar/turret power + recharge batteries.

---

## 3. Stall → restart state machine

```
States: OFF · CRANKING · RUNNING · STALLED   (the DIESEL; APU is a separate simple on/off)

OFF ──(hold starter ≥ crankTime, clutch IN)──▶ CRANKING ──(crankTime elapsed)──▶ RUNNING
RUNNING:
  • LUGGING (hard): clutch OUT + under load + rpm(=speed/gearRatio) < STALL_RPM ──▶ STALLED
  • IDLING-OUT (soft): in gear + clutch OUT + speed≈0 + no throttle ──▶ STALLED
  • hard turn at low rev in a tall gear → adds load → can trip LUGGING
STALLED → RUNNING via three tiers (by how badly you stalled):
  ① AUTO-RELIGHT  if clutch IN + near-idle/neutral (the soft case) → ~0.4 s, free
  ② BUMP-START    if rolling > ~5 km/h: select gear + release clutch → INSTANT, no starter (fails when cold)
  ③ STARTER       else: clutch MUST be IN, hold Enter ~1.1 s warm / ~2-3 s cold → CRANKING → RUNNING
```
**Restart gate:** electric starter only cranks if **clutch IN** (ideally neutral). Cranking
clutch-out/in-gear refuses (or leniently: slow + lurch risk). Throttle does nothing while cranking.
Timings: warm crank ~1.1 s (keep), cold ~2-3 s + a few s rough idle; auto-relight ~0.3-0.5 s;
bump-start instant. Optional: limited rapid retries → brief lockout (real starter duty cycle).

---

## 4. Gearbox realism (ГМ-575)

- **Launch only from 1st or 2nd.** 2nd = normal flat launch; 1st = low-range crawler/hill-breaker
  (more pull, low speed cap). Pulling away from 3rd+ → instant **lug-stall**. (Current model already
  launches on 2nd; 1st pulls from stop too — keep, but block 3rd+ launches.)
- **1st & reverse UNSYNCHRONISED** → must be near-stopped to engage. Selecting them above a small
  speed (`synchroSpeed`, already 0.6 m/s in tuning) → **grind SFX + refuse to engage** (currently it
  just sets `grind` but still may engage — tighten to refuse). **Reverse only from 1st/neutral.**
- **Sequential upshift, free downshift** — block 1→3 skips on the way up; allow any downshift.
- **Per-gear speed caps** — engine bogs if speed exceeds the gear's pull band (already via
  `gearTopSpeed`/`gearMinSpeed`); Steel-Beasts ref ladder 7/12/22/30 km/h for gears 1-4, ~50 km/h 5th.
- **Shift-under-load grind** — non-synchro change without rev-match → grind + brief power
  interruption; persistent abuse can stall.
- **Steering tie-in** — a steering lever declutches/brakes one track; a hard turn at low rev in a
  tall gear adds drag → can be the thing that finally lug-stalls it (couple turn input into the load).

---

## 5. Implementation plan

### 5a. Pure model — `src/shilka-drive.js` (deterministic, co-op-safe)
- **State:** add `apuOn` (bool), `engineState` ('off'|'cranking'|'running'|'stalled'), `crankT`
  (timer). Keep `engineOn` as a derived `engineState==='running'` for back-compat with all the
  `engineOn` reads (shilka.js idle/ride gate, HUD, etc.) — or migrate them.
- **createDriveState:** `apuOn:false`, `engineState:'off'`, `engineOn:false`.
- **stepDrive inputs** (`defaultsIn`): add `apuToggle` (edge), keep `starter`. 
- **APU:** `apuToggle` flips `apuOn` (with a ~2-3 s spool flag if we want the whine ramp).
- **Engine state machine** (replace the current §1 starter + §3 stall blocks):
  - OFF: `starter && clutchIn` → cranking (accumulate crankT). 
  - CRANKING: crankT ≥ crankTime(warm/cold) → running.
  - RUNNING: lugging/idling-out checks (as today) → stalled.
  - STALLED: auto-relight (clutch-in+near-idle) | bump-start (rolling>thresh + gear + clutch release)
    | else needs starter (clutch-in).
  - `canStartDiesel` requires `apuOn` (or a battery abstraction).
- **Gearbox** (extend §2 shift logic): block launch from gear≥'3' (speed≈0 + engage → would lug);
  refuse 1st/R engagement above `synchroSpeed` (don't just grind); enforce sequential upshift
  (gear index may only +1 going up; any decrease allowed); reverse only from 1st/N.
- **Steering→load:** in §6a, when `|steer|` high at low rpm in a tall gear, pull engineRpm toward
  stall (feed the lug check).

### 5b. Adapter / HUD / audio — `src/shilka.js`
- **APU toggle key** in `_driveControlUpdate` (e.g. **G** = APU, like the chase-cam **C**); feed
  `apuToggle` into the `inp` for stepDrive. (Or a dedicated control; G is free.)
- **Radar + turret gating:** today `update()` spins `rig.radar` unconditionally and `_applyTurretAim`
  runs whenever a gunner is seated. Gate the *gunner's control / turret slew / radar* on
  `drive.apuOn` (electrics) instead of always-on. The fire-control (`_tryFire`/`_fireOptical`)
  should require `apuOn`. Parked + APU on + diesel off → radar scans, turret lays, guns fire.
- **HUD:** show APU state (`АГРЕГАТ`/`ПУСК`), engine state (`ПУСК ↵` off, `ПУСК…` cranking, rpm
  running, `ЗАГЛОХ` stalled). The drive HUD already has `shilka-dh-rpm`. Add an APU line.
- **Audio (audio.js):** APU turbine whine loop while `apuOn`; diesel rumble loop while
  `engineState==='running'` (layered, scale with rpm). Both procedural (guard `if (!ctx)`).
- **Bump-start / grind SFX:** starter whirr, catch, grind clash.

### 5c. Co-op
- `apuOn` + `engineState` are deterministic → fine in the pure model; the driver broadcasts via
  `shilkamove`/`_statePayload` if remote vehicles need to show running state (add to payload like
  `gear`). Radar/turret gating reads local `drive.apuOn` which rides the synced state.

### 5d. Verify (headless recipe — same as the drivetrain phases)
- Google-Chrome+swiftshader, `?map=demo`, `GAME.startGame('purge')`, `/tmp/shilka_*.cjs`,
  no-store server `/tmp/nostore_server.py` on :8799.
- Assert: APU off → radar/turret dead + no shake; APU on → radar/turret work, diesel still off,
  parked; diesel start needs APU; lug-stall → starter relights; idling-out → auto-relight; rolling
  stall → bump-start; launch from 3rd refuses/stalls; 1st/R refuse above synchroSpeed.

---

## 6. Key code references (current, pre-change)
- `src/shilka-drive.js`: `SHILKA_DRIVE_TUNING` (gear tables, `synchroSpeed:0.6`, `starterSeconds:1.1`,
  `stallMinSpeedFrac`, `stallThrottle`); `createDriveState` (engineOn/engineRpm/stalled); `stepDrive`
  §1 starter, §2 gear change (grind logic), §3 stall check, §6a steering; `moveShiftLever`/`gateGear`.
- `src/shilka.js`: `_driveControlUpdate` (inp build: throttle W / brake S / steer A,D / clutch Space /
  gearReq digits/lever / starter Enter; chase-cam C); `_enterDriverSeat` (engineOn reset);
  `_updateDriveHud` (`shilka-dh-rpm` → 'ПУСК ↵'); `update()` radar spin (`rig.radar.rotation.y`);
  `_applyTurretAim`; `_tryFire`/`_fireOptical`; `_stepBody` (idle/ride gated on `this.drive.engineOn`).
- Radar/turret are currently NOT gated on any power source → that's the main behavioural change.

---

## Sources (both research reports, 2026-06-21)
- Powerpack: Wikipedia ZSU-23-4 (V-6R 280hp/20L, GM-575 5-spd; DG4M-1 70hp@6000 turbine APU,
  27/54V DC+220V AC, powers radar/FCS/turret/electrics with main engine off) · tank-afv.com ·
  globalmilitary.net · HandWiki · Kharkiv V-2 (ST-700 electric + compressed-air start) · Tank Archives.
- Stall/gearbox: Smart Drive Test (lugging) · Push-start/Car Talk/FatMech (diesel bump-start) ·
  Mister Transmission (synced vs unsynced) · Tank Manual Transmission mod (launch 1st/2nd, reverse
  from 1st, sequential up, per-gear caps) · BeamNG (manual restart, clutch enforced) · Steel Beasts ·
  War Thunder (arcade, no stall) · differential/clutch-brake steering.
