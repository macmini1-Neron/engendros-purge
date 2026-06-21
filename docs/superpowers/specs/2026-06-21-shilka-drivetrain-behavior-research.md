# Shilka Drivetrain Behaviour — Research → Implementation Spec

**Date:** 2026-06-21 · **Feature:** drivable ZSU-23-4 «Shilka» (`feat/shilka-named-rig`)
**Purpose:** how the tracks, suspension and hull should *behave in-game*, with concrete
formulas + constants for the game code (`shilka-rig.js` + the vehicle controller).
Synthesised from 4 parallel research passes (real ZSU-23-4 specs · track kinematics ·
torsion-bar suspension · body dynamics).

---

## 0. Guiding principle — the Blender rig only *deforms*; the GAME decides *how & when*

The Blender work (named bones + skin weights) is a **static rig**. Nothing about speed,
terrain, lurch or shake is baked into the GLB. At runtime the game code reads the
vehicle's motion and **poses the rig + nudges the hull** every frame. So everything below
is *game-code behaviour*, layered on top of the exported rig.

**All of it is cosmetic and client-local.** Track scroll, wheel spin, suspension, pitch/roll,
camera shake — none of it touches `pstate` or host authority. It is computed locally on each
client from that client's own kinematics, exactly like the КАТРАН win-particles. (Authority
still owns *position/heading/damage*; this only owns the *look* of the chassis.)

The three runtime systems, in dependency order:

1. **Track motion** — belt scroll + wheel/sprocket spin from per-side speed. (Cheapest, do first.)
2. **Suspension** — per-wheel terrain raycast → road-wheel arm rotation + belt-bone lift + hull pose.
3. **Body dynamics** — pitch/roll spring-dampers + lurch impulses + recoil/idle shake + camera trauma.

---

## 1. Real ZSU-23-4 numbers (the grounding)

| Parameter | Real value | Game units | Use for |
|---|---|---|---|
| Combat weight | 19 t | 19 000 kg | suspension load, inertia feel |
| Engine / power | V-6R diesel, 280 hp | 14.7 hp/t | **snappy** accel, not lumbering |
| Max road speed | 50 km/h | **13.9 m/s** | top speed clamp |
| Max off-road | 30 km/h | **8.3 m/s** | off-road clamp |
| Ground clearance | 375 mm | 0.375 m | hull ride height |
| Track length / width / links | 11.9 m / 382 mm / 93 | pitch ≈ **0.137 m** | UV scroll calibration |
| Road wheels / side | **6** | — | 12 raycasts |
| Sprocket / idler | **rear / front** | — | spin direction |
| Return rollers | **NONE** | — | top run rests on wheel tops |
| Suspension | individual **torsion bar** | — | arc-swing arms |
| Dampers | **front + rear corners only**, staggered L/R; **middle 3 undamped** | — | the bouncy "feel" |
| Steering | **clutch-and-brake** (NO neutral/pivot turn) | — | turns bleed speed |
| Chassis | GM-575, **PT-76-derived** (light, soft-sprung) | — | loose, bouncy ride |
| Armament | 4×23 mm, **~3 400–4 000 rpm combined** (~60/s) | — | continuous fire tremor |

**Feel summary:** fast & light for a tracked AFV, **bouncy/loose ride** (undamped middle
wheels → it pitches and wallows), **cannot spin in place** (turns scrub speed), and when the
quad cannon fires it's a **continuous high-frequency tremor**, not punchy single shots.

**Measure these off the actual rig (don't guess):**
- Road-wheel radius `R` ≈ 0.30 m · arm length `L` (wheelarm pivot → wheel centre) ≈ 0.30 m
- Track gauge `B` = distance between the two belt centrelines ≈ **2.0 m** in the current model
  (real Shilka ≈ 2.5 m; the voxel model is a touch narrower — use the measured value)
- Station Y (front→rear): idler 1.75 · wheels 1.27 / 0.62 / 0.06 / −0.5 / −1.06 / −1.63 · sprocket −2.13
- Sprocket pitch radius `r_pitch = T·p/(2π)` (T teeth, p=0.137 m) — measure tooth count

---

## 2. Track motion — belt scroll + wheel/sprocket spin

**Core invariant:** the track *surface* moves at the **vehicle ground speed**. Scroll the
belt texture and spin every wheel from that, **per side** (left/right differ in turns).

### 2a. Per-side speed (differential-drive kinematics)
```
half = B * 0.5
vL = vFwd - omega * half      // left  belt surface speed (signed m/s)
vR = vFwd + omega * half      // right belt surface speed
```
`vFwd` = forward speed, `omega` = yaw rate (rad/s). Derive both from the frame's transform
delta (no authoritative velocity needed):
```js
const vFwd  = pos.clone().sub(prevPos).dot(forwardDir) / dt;
const omega = wrapAngle(heading - prevHeading) / dt;
```
All three steering regimes fall out automatically: straight (`vL==vR`), turn (outer faster),
pivot (`vL=-vR`).

> **⚠ Shilka caveat:** the real vehicle has **clutch-and-brake steering → NO neutral turn**
> (tracks can't counter-rotate; a turn always bleeds forward speed). Two options, **owner's call**:
> - **Realistic:** clamp the inner track to ≥0 (it can stall but not reverse) and scrub `vFwd`
>   down during hard turns. No spin-in-place.
> - **Arcade:** allow a slow pivot anyway (players expect it). The kinematics give it for free;
>   just cap pivot yaw-rate low so it feels heavy.
>   *Recommendation: arcade pivot at low rate — readability beats pedantry for a wave shooter,
>   but make turns cost speed so it still feels tracked.*

### 2b. UV scroll (one float per side per frame)
```js
// setup: belt map MUST be RepeatWrapping, and CLONE the texture per side
leftMap.wrapS = THREE.RepeatWrapping;          // (offset is per-texture → can't share)
const k_scroll = 1 / metersPerUVRepeat;        // metersPerUVRepeat = loopLength / map.repeat
// per frame (signL/signR fix mirrored-UV direction — one side is negated):
leftMap.offset.x  = (leftMap.offset.x  + signL * vLvis * dt * k_scroll) % 1;
rightMap.offset.x = (rightMap.offset.x + signR * vRvis * dt * k_scroll) % 1;
```
Calibrate `metersPerUVRepeat` so the tread blocks "grip" (don't skate) at a known speed.
`% 1` every frame (float precision). **Reverse just works** (speeds go negative).

### 2c. Wheel / sprocket / idler spin — `omega = v / r`
```js
const spinL = (vLvis / R) * dt;                 // road wheels
roadWheelsL.forEach(w => w.rotation.x += spinL);
sprocketL.rotation.x += (vLvis / r_pitch) * dt; // sprocket on PITCH radius, not tip
idlerL.rotation.x    += (vLvis / R)       * dt;
```
Sprocket spins slightly faster (smaller pitch radius) — reads as mechanical detail.

### 2d. (Optional polish) track tension / catch-up
Low-pass each side's speed so the belt "takes a beat" on hard throttle changes — uses the
existing `damp()` in `util.js`:
```js
vLvis = damp(vLvis, vL, 12, dt);   vRvis = damp(vRvis, vR, 12, dt);
```
Skipping this is fine (most games drive scroll off instantaneous speed).

---

## 3. Suspension — per-wheel raycast → arm arc + belt lift + hull pose

The proven track rig already deforms from belt-bone lift. The suspension layer computes
**how high each road wheel sits** (terrain) and feeds that into (a) the wheel-arm rotation,
(b) the belt bones, (c) the hull pose.

### 3a. The arm swings on an ARC (don't translate the wheel)
A torsion bar = a transverse rod + a perpendicular **swing arm** carrying the wheel at radius
`L`. The wheel centre sweeps a circle about the arm pivot → it moves **up-and-forward**, never
straight up. So **rotate the `wheelarm` bone**, never slide the wheel:
```
phi = asin( clamp((pivotWorldY - wheelTargetY) / L, -1, 1) )
wheelarm.rotation.x = phi - phiRest          // phiRest = static arm angle (~30-40° below horiz)
```
Spring rate is ~**linear** (torsion bars don't stiffen) → a big hit just rotates the arm until it
**slams a bump stop**. Model as a **hard clamp** at max travel, not a soft progressive squash.

### 3b. Per-wheel raycast spring-damper (the standard model)
12 downward rays (one per wheel), each a spring-damper between hull and ground:
```
for each wheel i:
    originW   = hull.localToWorld(wheelAttach_i)
    contactY  = raycast_down(originW)               // world.boxes AABB / terrain height
    contactY  = clampToNeighbourLine(contactY, i)   // track bridges gaps (§3d)
    targetY_i = contactY + R
    // critically/under-damped ease toward target (per-wheel state y_i, vy_i):
    y_i = springStep(y_i, targetY_i, vy_i, omega_i, zeta_i, dt)
```
**Asymmetric damping is the whole character** (§1): front + rear stations `zeta ≈ 0.8–1.0`
(settle fast); **middle 3 stations `zeta ≈ 0.2–0.35`** (overshoot → the bouncy Soviet ride).
Equal damping everywhere = looks like a car, feels dead.

Travel budget: **~0.30 m total** (≈ +0.20 bump / −0.10 rebound about static). Wheel `omega ≈
9–12 rad/s`. (SI equivalents if you ever feed real Newtons: ~15.5 kN static load/wheel,
`k ≈ 155 kN/m`, end-station `c ≈ 10–15 kN·s/m`, middle `c ≈ 1–3 kN·s/m`.)

### 3c. Drive the belt bones from wheel height
```
trackBottomBone[i].y = y_i - R          // ground-contact line under each wheel
trackTopBone[i].y    = y_i + R - sag    // NO return rollers → top run rests on wheel TOPS, sags between (§1)
```
Interpolate belt bones between wheels, and from wheel#1→idler and wheel#6→sprocket.
(The baked top-run sag already lives in the mesh; this adds the *dynamic* lift.)

### 3d. Terrain following + "the track bridges gaps"
Hull pose = best-fit of the 12 contact heights, smoothed:
```
hullY = damp(hullY, mean(y_i) + rideHeight,                   hullLambda, dt)
pitch = damp(pitch, atan2(frontMean - rearMean, wheelbase),   hullLambda, dt)
roll  = damp(roll,  atan2(leftMean  - rightMean, B),          hullLambda, dt)   // hullLambda ≈ 4–6
```
A tracked vehicle **averages** terrain — the rigid track spans gaps, so don't let one wheel
drop into a narrow ditch: clamp each wheel's contact to the line between its neighbours'
contacts. This bridging is what makes a tank feel *planted* vs. a jiggly car.

> Note: §3d gives a **kinematic** pitch/roll from terrain. §4 gives a **dynamic** pitch/roll
> from accel/brake/fire. They **sum** on the same hull node (terrain sets the resting plane;
> the springs add lean & lurch on top).

---

## 4. Body dynamics — pitch/roll springs, lurch, recoil, shake

The hull is faked as **one sprung mass** = two angular spring-dampers (pitch about X, roll
about Z) + layered noise, driven by impulses. This is a **feel** problem, not a sim.

### 4a. The two spring-dampers (semi-implicit Euler — stable at dt ≤ 50 ms)
```
theta'' = -w² (theta - target) - 2·zeta·w·theta'
```
| | w (rad/s) | f (Hz) | zeta | gain |
|---|---|---|---|---|
| **Pitch** (X) | 7.0 | 1.1 | **0.28** | 0.018 rad per m/s² of aLong |
| **Roll** (Z) | 8.2 | 1.3 | 0.40 | 0.012 rad per m/s² of aLat |

Low `zeta` on pitch → **1–2 visible overshoot bounces** (the lurch). Body ride frequency is
**low (~1–1.5 Hz)** = slow, heavy (NOT the 5–10 Hz wheel-hop figure). Settling ~2 s → the hull
keeps subtly moving after a stop = the life you want.

### 4b. Targets (quasi-static lean) + discrete lurch impulses
```js
let pitchTarget = -PITCH.gain * aLong;          // aLong = (speed-prevSpeed)/dt; nose dives on brake
if (firing) pitchTarget += FIRE_PITCH_BIAS;     // ~0.7° nose-up rock-back while firing
let rollTarget  = -ROLL.gain * (speed * yawRate);  // lean outward in turns
// event impulses (inject into velocity, ~0.10·v0 → peak angle):
//   hard stop:  pitchVel += 0.45   (~2.6° dive+rebound)
//   launch:     pitchVel -= 0.30
//   wall hit:   pitchVel += 0.7 ; trauma += 0.5
//   turn onset: rollVel  += 0.2 * sign(yawRate)
//   burst start:pitchVel += 0.07 ; trauma += 0.15
```

### 4c. Recoil / fire — don't simulate 60 rounds/s
Two layered things instead: (1) the **rock-back bias** above, carried by the pitch spring;
(2) **20–30 Hz buzz** on hull+turret with an attack/decay envelope:
```
A_fire ≈ 0.004 rad (~0.23°), f_fire ≈ 25 Hz, attack ~80 ms / decay ~150 ms
```
Keep turret jitter slightly decoupled (different noise phase) so the gun buzzes a touch more
than the hull — sells the mass difference.

### 4d. Idle / track rumble (always-on life) — additive, NOT through the spring
```
idle:   A ≈ 0.0020 rad (~0.1°), f ≈ 9 Hz            // fine diesel shudder when stationary
moving: A,f scale with speed (≈ triple by top speed) + occasional small random θ' bumps
```
Use **continuous (Perlin/value) noise**, never per-frame `Math.random()` (random reads as
static). `util.js` has no noise helper today — add a cheap sin-sum:
`0.5·sin(2.1x)+0.3·sin(4.7x+1.3)+0.2·sin(9.1x+2.9)`.

### 4e. Camera shake = the trauma model (separate from hull motion)
Camera is parented under the hull → it **inherits** pitch/roll for free (first-person weight
transfer). On top, add **trauma-driven rotational** shake for events:
```
trauma ∈ [0,1]; events add (+0.15 burst … +0.5 impact); decays linearly (~1.2/s)
shake  = trauma²                                   // non-linear: small barely shows, big slams
camera.rotation.{x,y,z} += MAXANGLE * shake * (noise(seed,t*16)-0.5)*2   // MAXANGLE ≈ 0.26 rad
while firing: hold trauma at a ~0.30 plateau (sustained buzz, not a punch per round)
```
**Rotational shake only** (Eiserloh: translational camera shake is "super lame"). It naturally
returns to centre → sustained fire just buzzes in place (perfect for a vehicle).

---

## 5. Architecture — how it slots into the code

Insert a cosmetic **`hullSpring`** group between the vehicle root (world pos + driving yaw)
and the visible hull. Terrain pose + dynamic springs both write to it; turret & camera are children.
```
vehicleRoot            ← world position + driving heading (authoritative transform)
└── hullSpring         ← cosmetic pitch(X)+roll(Z) = terrain pose (§3d) + dynamic springs (§4) + noise
    ├── hullMesh
    ├── turretGroup    ← + fire jitter (decoupled noise)
    │   └── gunElev / radar / hatches …
    ├── trackrig_L / trackrig_R  ← belt bones posed from wheel heights (§3c); UV scroll (§2b)
    ├── wheelarm_{L,R}0-5        ← rotated on arc (§3a); wheels spun (§2c)
    └── cameraRig      ← inherits pitch/roll; adds trauma shake (§4e)
```
Vehicle state to keep: `pitch,pitchVel, roll,rollVel, trauma, prevSpeed, _fireAmp`, and
per-wheel `y_i, vy_i`.

**Where:** this is the **`buildShilkaRig` rewrite (TODO #10)** + the captured-tank/vehicle
controller. The rig handles names → handles `{turret, guns, radar, wheelsL, wheelsR, sprockets,
tracks, antennas, dish}`; the controller runs §2–§4 each frame in its `update(dt)`.

---

## 6. Implementation order (each step is independently testable)

1. **Track scroll + wheel spin** (§2) — per-side speed → UV offset + `omega=v/r`. Pivot/reverse
   fall out. *Cheapest, most visible win.*
2. **Per-wheel raycast suspension** (§3) — 12 rays → arm-arc rotation + belt-bone lift + hull
   pose. Tune asymmetric damping (middle wheels bounce).
3. **Pitch/roll spring + lurch impulses** (§4a-b) — get accel/brake lean right *with noise OFF*
   first (~70% of feel), then add stop/launch impulses, then roll.
4. **Recoil + idle/track noise** (§4c-d) — fire buzz + always-on shudder.
5. **Camera trauma shake** (§4e) — last; rotational only.
6. **Verify in-game** (Chrome, real GPU): drive/turn/reverse, terrain bumps, hard stop lurch,
   fire tremor, co-op (each client shakes its own camera).

**Tuning order within feel:** pitch spring `w/zeta/gain` first; floaty → raise `zeta`,
dead/stiff → lower `zeta` toward 0.22.

---

## Sources (per research pass)
- **Specs:** Wikipedia ZSU-23-4 · MilitaryFactory · tank-afv.com · Weaponsystems.net · War Thunder AZP-23 wiki
- **Track:** War Thunder CDK (procedural track bones, `texcoord_anim`, one-tooth=one-link) · WT "Hot Tracks" devblog · Wikipedia Differential wheeled robot · Columbia ICC kinematics · Habrador Unity/Blender track
- **Suspension:** Wikipedia Torsion-bar suspension · "A Tale of Tank Suspensions" · Unity WheelCollider (k=35000,c=4500) · NVIDIA PhysX Vehicles · DTIC AD0743464 tracked-vehicle dynamics
- **Body dynamics:** Eiserloh "Juicing Your Cameras" GDC 2016 (trauma model, trauma², Perlin, rotational shake) · Vehicle Physics Pro (spring-damper, zeta 0.2–0.6) · BeamNG soft-body · WT suspension params
