# ЗСУ-23-4 «Shilka» — slice 1: rig auto-cut + driving (design)

**Date:** 2026-06-18
**Branch:** `codex/shilka-flagship-mechanics`
**Status:** design approved by owner; spec for first buildable slice. No code yet.
**Supersedes scope of:** `2026-06-17-shilka-fire-control-mechanics-design.md` is the v1 *fire-control* prototype (parked, not deleted). This spec is the **first slice of the flagship rebuild**.
**Sources:**
- Flagship data maps (this repo): `2026-06-18-shilka-mechanics-catalog.md`, `2026-06-18-shilka-parameters.md`, `2026-06-18-shilka-state-interlocks.md`.
- SAM Simulator manual `ZSU-23-4V1_Shilka_SAM_Simulator_Manual_EN.pdf` + Russian radar manual (on disk).
- Driver/transmission web probe (cited inline in §3a).
- Prior art in repo: `tankglb.js` (bbox auto-rig of unnamed GLB meshes), `bosstank.js` (`animateTank`, road wheels, recoil), the removed `CapturedTank` in git history (driving + seats), `_shilka_rig_view.html` (the bbox classifier prototype).

---

## 0. Where this fits (flagship decomposition)

The flagship Shilka is large — `state-interlocks` §E lists **10 layers**: power → hydraulics → radar → SRP → cannon → targets → **model/rig (7)** → **driving (8)** → co-op (9) → audio (10). That is too big for one spec, so it is built one slice at a time, each going through its own spec → plan → build → verify cycle.

**Owner decisions that frame the whole feature (locked, do not re-litigate):**
- **Location/availability:** the Shilka lives permanently at the steppe airfield and is usable during a normal run (not a separate sandbox).
- **Targets (later layers):** **both** ground engendros (ground mode) **and** air targets (flying boss + scripted flyovers).
- **Radar is a real, deterministic OOP mechanic** over the *live* world entities — never a faked/hard-coded contact map. Only **scenarios** are scripted (e.g. a flyover), and even those just inject real entities the radar then honestly detects.
- **Crew:** 4 seats, each with its own screen; playable from 2 roles — **driver + commander**; the commander **re-seats** between fire-control screens (SAM-Simulator style).
- **Perspective:** 1st-person, **War Thunder "SIM-mode" feel** (no 3rd-person chase). Driver = driver's hatch/periscope; commander = cupola head-out (commander/scope work is a later layer).
- **Ethos:** flagship — do not cut corners; every system is a real working mechanic; fair-brutal difficulty (no "ez" mode).

**This slice (1) pulls layers 7 + 8 (rig + driving) forward**, ahead of the bottom-up order, because the owner wants the vehicle to physically move and read correctly first. The v1 fire-control chain (a prototype telescoping layers 1–5) stays in the codebase but **dormant** this slice; it gets re-wired when the commander/scope layer is built.

---

## 1. Scope

**In:**
- Auto-rig the committed GLB (`assets/vehicles/lowpoly_zsu-23-4.glb`) into movable groups (hull, tracks, road wheels, sprocket/idler, turret, guns, radar dish, antennas).
- Driver mounts via **E**, drives the Shilka **freely across the whole map** in a 1st-person periscope view.
- Real driving: **manual transmission (5 forward + reverse) with a clutch and stall**, clutch-and-brake **two-lever steering**, per-wheel terrain-following suspension, hull pitch/roll from terrain, spinning wheels, scrolling track, antenna sway.
- Deterministic, node-tested driving core.

**Out (deferred layers; architecture must not preclude them):**
- Collision / material-based wall breaching / crushing engendros (only seams + hooks here — see §5).
- Commander seat, re-seating, scope screens, radar, SRP, cannon firing, targets, co-op, audio.

---

## 2. Architecture (modules)

Mirrors the existing pure-core + THREE-adapter split (`shilka-mechanics.js` pure, `shilka.js` adapter).

| Module | Kind | Role |
|---|---|---|
| `src/shilka-drive.js` | **pure** (no THREE/DOM) | `createDriveState()`, `stepDrive(state, dt, input, wheelGroundY)` → new state (pos/heading/speed/gear/clutch/rpm/engine/pitch/roll/wheel offsets/spin/track scroll). Deterministic; the single source of driving truth. |
| `src/shilka-rig.js` | THREE + **pure classifier** | `classifyShilkaPart(localBox, modelBounds) → group` (pure, testable); `buildShilkaRig(fittedRoot)` re-parents meshes under pivots and returns the rig handle. |
| `src/shilka.js` | THREE adapter (exists) | driver mount, controls, camera, per-frame: sample terrain → `stepDrive` → apply transforms to the rig. |
| `tests/shilka/drive.test.mjs` | node test | driving core + classifier. |
| `tools/shilka-rig-view.html` | dev tool | visual check of the bbox cut (renamed from `_shilka_rig_view.html`; added to `.vercelignore`). |

**Why these boundaries:** the risky bbox classification is isolated in one place (and already prototyped in the rig viewer); the driving math is pure and testable; the THREE/DOM/game coupling stays in the existing adapter. Each unit answers "what does it do / how is it used / what does it depend on" on its own.

---

## 3. Driving core — `shilka-drive.js` (pure, deterministic)

**State (`createDriveState`):** `{ x, z, y, heading, speed, yawRate, gear, clutch, engineRpm, engineOn, stalled, pitch, roll, wheelOffsetL[6], wheelOffsetR[6], wheelSpin, trackScroll }`.

**Step:** `stepDrive(state, dt, input, wheelGroundY) → newState`, where
`input = { throttle 0..1, brake 0..1, steer −1..1, clutch 0..1, gearReq, starter:bool }`
and `wheelGroundY = { L:[6], R:[6] }` are terrain heights sampled **by the adapter** at each wheel's world XZ (core stays pure — it raycasts nothing).

### 3a. Driver research (grounds the transmission/steering model)

Real ЗСУ-23-4 driver, ГМ-575 chassis (PT-76-derived):
- Driver seated front-left; buttoned-up with periscopes.
- **Three pedals — clutch, brake, accelerator**; floor-mounted shifter, **double-H pattern**, rod running back under the turret to the rear transmission.
- **Manual gearbox: 5 forward gears** + reverse; multi-plate main clutch; **two planetary two-step steering gears** with friction brakes + two final drives.
- **Steering = clutch-and-brake (NOT differential):** **two steering levers**, one per track; pulling a lever slows/declutches that track to turn. Two-step planetary = two turn radii (gentle vs sharp/pivot).

Sources: [Wikipedia: GM chassis](https://en.wikipedia.org/wiki/GM_chassis), [Wikipedia: ZSU-23-4 Shilka](https://en.wikipedia.org/wiki/ZSU-23-4_Shilka), [Wikipedia: Tank steering systems](https://en.wikipedia.org/wiki/Tank_steering_systems), [DCS Shilka driver-station writeup](https://forum.dcs.world/applications/core/interface/file/attachment.php?id=105590), [tank-afv.com: ZSU-23-4](https://tank-afv.com/coldwar/ussr/ZSU-23-4-Shilka.php).

### 3b. Transmission + clutch + engine (the "really operate it" core)

- **Gearbox:** `gear ∈ {R, N, 1, 2, 3, 4, 5}`. Each gear has a ratio → a speed ceiling and a pulling factor (1st = high pull, low ceiling; 5th ≈ 50 km/h scaled; R = limited reverse speed).
- **Engine:** `engineRpm` idles at `idleRpm` when clutch disengaged or in N; when engaged in gear, rpm couples to `speed / gearRatio`. `engineOn` / `stalled` flags. Tractive force = `torque(rpm, throttle) × clutchEngagement × gearRatio`.
- **Shifting (double-H feel):** a gear change only takes cleanly with the **clutch depressed**; shifting under load **grinds and does not engage**.
- **Stall (realistic — owner's choice):** clutch engaged + in gear + `engineRpm` dragged below `stallRpm` (e.g. dumping the clutch from a standstill with no throttle, or crawling a high gear uphill) → **engine stalls** (`engineOn=false`, `rpm=0`, power lost). Recovery: clutch down → **starter** → gear → throttle + ease the clutch. `stallRpm` and starter delay are tunable knobs set to the **realistic** end (stalls readily; restart is felt).
- **Move-off:** clutch down → select 1 → throttle + smoothly release clutch.

### 3c. Steering, suspension, visuals

- **Clutch-and-brake lever steering:** `steer −1..1` slows the inner track → turns; **light = wide radius, full = tight/pivot**; radius widens with speed; at ~standstill, full lever = pivot in place.
- **Suspension/tilt:** `bodyY = mean(wheelGroundY) + wheelRadius + rideHeight`; `pitch = atan2(frontMean − rearMean, wheelbase)`; `roll = atan2(leftMean − rightMean, trackWidth)`; **per-wheel offset** = terrain height under the wheel relative to the body plane, clamped to suspension travel. All damped to avoid jitter.
- **Wheels/track:** `wheelSpin += speed/wheelRadius · dt`; `trackScroll += speed · dt`.
- **Antenna sway:** driven by lateral acceleration + speed (computed in the adapter as a visual; not gameplay).

### 3d. Determinism & tuning

- No `Date`/`Math.random()` in the core. Same inputs → same state.
- All magic numbers live in a frozen `SHILKA_DRIVE_TUNING` (gear ratios/ceilings, accel, `idleRpm`, `stallRpm`, starter delay, suspension travel, damping, scaled top speeds 50/30 km/h, lever turn rates). Reality anchors noted; gameplay values flagged `[design]`.

---

## 4. Wiring, controls, camera — `shilka.js` + `game.js`

- **Mount = driver:** **E** puts the station into **drive mode** (not fire-control). The v1 radar/scope panel + `controlUpdate` firing path remain in the module but are **not entered** this slice; they are re-wired in the commander/scope layer.
- **Controls (driver; remappable, mode-gated so they do not clash with later commander controls):**

  | Input | Function |
  |---|---|
  | `W` / `S` | accelerator / brake |
  | `A` / `D` | left / right **steering lever** (clutch-and-brake, two-step) |
  | `Space` (hold) | **clutch** |
  | `1`–`5` | select forward gear (clean only with clutch) |
  | `R` | reverse · `` ` ``/`0` neutral |
  | `Enter` | starter (restart after a stall) |
  | mouse | periscope look (head-out cone) |
  | `E` | dismount |

- **Camera (WT-SIM):** 1st-person at the driver's station (front-left of hull, low), parented to the rig **body** node so it **tilts with the terrain**; narrower FOV; mouse looks within a cone. Follows the vehicle across the map.
- **Per-frame** (where `game.js` currently calls `controlUpdate`): read input → compute each wheel's world XZ from `pos+heading`+rig geometry → raycast `world.terrain.terrainHeightAt` → `stepDrive` → apply to the rig (`vehicleRoot` pos+yaw, `body` pitch/roll, wheel offsets+spin, track scroll, antenna sway) → place camera at the driver station → set `Player.pos` to the hull (the world knows where the player is; the player is protected inside).
- **Fixed-step:** the driving integration runs through the existing `_fixedStep` accumulator (M4) for stutter-stable physics with camera interpolation; with the flag OFF it runs on variable `dt` (the core takes `dt` either way).
- **Units:** both airfield stations are the same `ShilkaStation` class → **both drivable** at no extra cost; drive one away and the other stays parked.

---

## 5. Collision hooks (deferred, but designed-for)

- `stepDrive` returns a **proposed** new position; between "propose → apply" there is **one choke-point** `resolveMove(from, to)` (a no-op this slice). Later this is where AABB collision against `world.boxes` and **material-based wall breaching** (the demo's "new collisions" work) plug in — **without touching the driving math**.
- **Crushing engendros:** the vehicle footprint AABB is already computed each frame (free); unused this slice. Later, a host-authoritative footprint-vs-enemy check goes in at the same place.
- **Known limitation this slice:** with collision off, the Shilka can drive through buildings. Acceptable for "mobility first"; explicitly flagged.

---

## 6. Testing & verification

- **Node tests** (`tests/shilka/drive.test.mjs`):
  - straight-line distance vs gear/throttle over time; momentum ramp (not instant).
  - upshift raises the speed ceiling; speed cannot exceed the current gear's ceiling.
  - reverse moves the vehicle backward.
  - clutch: dumping the clutch from a standstill with no throttle → **stall**; shifting without the clutch → **grind/no-shift**; starter recovers from stall.
  - lever steer: pivot at standstill; wider radius at speed.
  - suspension: flat terrain → ~0 pitch/roll; ramp → pitch; side slope → roll; wheel offsets stay within travel.
  - classifier purity: synthetic boxes → correct group (wheel / turret / dish / antenna / hull).
  - determinism: identical inputs → identical state.
- **In-browser verify:** serve via a **no-store** server (bare-path `src/*` ES-module imports otherwise go stale on a plain reload) → steppe map → walk to a Shilka → mount → drive, shift, stall/restart, watch the rig (wheels bob, hull tilts, track scrolls) → console shows **0 errors**. Use `tools/shilka-rig-view.html` to confirm the bbox cut visually. If the shared Playwright MCP browser is busy, drive an isolated headless Chrome (per the headless-verify recipe).

---

## 7. Non-goals (restated)

No commander/cupola, no re-seating, no scope/radar/SRP, no cannon firing, no targets, no co-op, no audio, no collision/crushing — all are later slices. This slice ends when a driver can mount a Shilka and **drive it convincingly around the map** with a live rig, verified by node tests and an in-browser pass.

## 8. Open / tunable (decide during tuning, not blocking)

- Exact gear ratios / scaled top speeds and accel curves (start from realistic, tune by feel).
- `stallRpm` / starter delay within the "realistic" band.
- Suspension travel + damping constants.
- Periscope look-cone limits and FOV.
