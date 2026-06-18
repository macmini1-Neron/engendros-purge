# Shilka slice 1 — rig auto-cut + driving — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A driver mounts the airfield ЗСУ-23-4 with **E** and drives it freely across the map in a 1st-person periscope view, with a real manual transmission (5 + reverse, clutch, realistic stall), clutch-and-brake two-lever steering, and a live rig (per-wheel suspension, hull tilt, spinning wheels, antenna sway).

**Architecture:** Pure deterministic driving core (`shilka-drive.js`, no THREE/DOM, node-tested) + a pure bbox part-classifier shared with the dev viewer (`shilka-rig.js`) that re-parents the single 93-mesh GLB into movable rig groups. The existing `shilka.js` adapter samples terrain under each wheel, calls `stepDrive`, and applies the result to the rig + driver camera. v1 fire-control stays in the module but dormant this slice.

**Tech Stack:** Vanilla JS ES modules (no build step), Three.js r160 via import map (`import * as THREE from 'three'`), `node --test` for the pure modules, in-browser verification over a no-store server.

## Global Constraints

- No build/bundler/framework — browser parses native ES modules; serve over HTTP.
- Pure modules import **nothing** from THREE/DOM/game: `shilka-drive.js` and the classifier in `shilka-rig.js`. Adapter (`shilka.js`) owns all THREE/DOM.
- **Determinism:** no `Date.now()` / `Math.random()` / `new Date()` in pure code.
- World axes: forward **+Z**, up **+Y**, right **+X**; ~1 unit ≈ 1 m.
- Authoritative logic must sit behind `hostSim = !mp.active || mp.isHost` (driving in this slice is local/owner-driven; leave the seam, don't add co-op).
- Tests run with `node --test tests/shilka/<file>.test.mjs`.
- Branch: `codex/shilka-flagship-mechanics`. Conventional commits, end every commit body with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Commit only the files each task lists.
- Cache-bust ritual (`?v=N` on `index.html` entry + `GAME_BUILD`) is a **deploy-time** step — only when shipping, not per task.

---

### Task 1: Driving core — longitudinal model (transmission, clutch, engine, stall)

**Files:**
- Create: `src/shilka-drive.js`
- Test: `tests/shilka/drive.test.mjs`

**Interfaces:**
- Produces:
  - `SHILKA_GEARS: readonly string[]` = `['R','N','1','2','3','4','5']`
  - `SHILKA_DRIVE_TUNING: Readonly<object>` (frozen constants)
  - `createDriveState(overrides?) -> state`
  - `stepDrive(state, dt, input, wheelGroundY) -> state` where `input = { throttle:0..1, brake:0..1, steer:-1..1, clutch:0..1 (1=engaged), gearReq:string|null, starter:bool }` and `wheelGroundY = { L:number[6], R:number[6] } | null`. Task 1 implements the longitudinal half (speed/gear/clutch/engine/rpm/stall) and integrates position along `heading`; lateral + suspension land in Task 2.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `tests/shilka/drive.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING as T } from '../../src/shilka-drive.js';

// helper: run N fixed steps with constant input
function run(state, n, dt, input, ground = null) {
  let s = state;
  for (let i = 0; i < n; i++) s = stepDrive(s, dt, input, ground);
  return s;
}
const I = (o = {}) => ({ throttle: 0, brake: 0, steer: 0, clutch: 1, gearReq: null, starter: false, ...o });

test('moves off in 1st with momentum, not an instant jump to top speed', () => {
  let s = createDriveState();
  s = stepDrive(s, 1 / 60, I({ gearReq: '1', clutch: 0 })); // shift to 1 with clutch in
  s = stepDrive(s, 1 / 60, I({ gear: '1', throttle: 1 }));  // (gear already '1'); engage + throttle
  const after1s = run(s, 60, 1 / 60, I({ throttle: 1 }));
  assert.ok(after1s.speed > 0, 'should be moving forward');
  assert.ok(after1s.speed <= T.gearTopSpeed['1'] + 1e-6, 'cannot exceed 1st-gear ceiling');
  const after10ms = run(s, 1, 0.01, I({ throttle: 1 }));
  assert.ok(after10ms.speed < T.gearTopSpeed['1'], 'first instants are below ceiling (momentum)');
});

test('upshift raises the speed ceiling', () => {
  let s = createDriveState({ gear: '1', speed: T.gearTopSpeed['1'] });
  s = stepDrive(s, 0.1, I({ clutch: 0, gearReq: '2' })); // declutch + shift
  assert.equal(s.gear, '2');
  const s2 = run(s, 120, 1 / 60, I({ throttle: 1 }));
  assert.ok(s2.speed > T.gearTopSpeed['1'] + 0.5, 'now accelerates past 1st ceiling toward 2nd');
});

test('reverse gear drives the vehicle backward (-Z at heading 0)', () => {
  let s = createDriveState({ gear: 'R' });
  s = run(s, 120, 1 / 60, I({ gear: 'R', throttle: 1 }));
  assert.ok(s.speed < 0, 'reverse speed is negative');
  assert.ok(s.z < 0, 'position moved backward along -Z');
});

test('dumping the clutch from a standstill with no throttle stalls the engine', () => {
  let s = createDriveState({ gear: '1' }); // in gear, clutch engaged (1), no throttle, speed 0
  s = stepDrive(s, 1 / 60, I({ gear: '1', clutch: 1, throttle: 0 }));
  assert.equal(s.engineOn, false);
  assert.equal(s.stalled, true);
  assert.equal(s.engineRpm, 0);
});

test('shifting under load (clutch engaged) grinds and does not change gear', () => {
  let s = createDriveState({ gear: '2', speed: 4, engineOn: true });
  const after = stepDrive(s, 1 / 60, I({ gear: undefined, clutch: 1, gearReq: '3', throttle: 0.5 }));
  assert.equal(after.gear, '2', 'gear unchanged without the clutch');
});

test('starter restarts a stalled engine after the starter delay', () => {
  let s = createDriveState({ gear: 'N', engineOn: false, stalled: true, engineRpm: 0 });
  s = run(s, Math.ceil((T.starterSeconds + 0.05) * 60), 1 / 60, I({ gear: 'N', clutch: 0, starter: true }));
  assert.equal(s.engineOn, true);
  assert.equal(s.stalled, false);
  assert.ok(s.engineRpm >= T.idleRpm - 1);
});

test('deterministic: identical inputs produce identical state', () => {
  const a = run(createDriveState(), 200, 1 / 60, I({ gear: '1', throttle: 1 }));
  const b = run(createDriveState(), 200, 1 / 60, I({ gear: '1', throttle: 1 }));
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shilka/drive.test.mjs`
Expected: FAIL — `Cannot find module '../../src/shilka-drive.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shilka-drive.js`:

```js
// shilka-drive.js -- pure deterministic driving model for the ЗСУ-23-4 (ГМ-575 chassis).
// ZERO THREE/DOM imports. The adapter samples terrain and applies transforms; this owns the math.
// Coordinate convention matches the game world: heading 0 points +Z (forward), +X right, +Y up.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const SHILKA_GEARS = Object.freeze(['R', 'N', '1', '2', '3', '4', '5']);

export const SHILKA_DRIVE_TUNING = Object.freeze({
  // top speeds scaled from real 50 km/h road (≈13.9 m/s); gameplay-tuned [design]
  gearTopSpeed: Object.freeze({ R: -3.2, N: 0, '1': 2.6, '2': 5.0, '3': 8.0, '4': 11.0, '5': 13.9 }),
  gearPull:     Object.freeze({ R: 3.0,  N: 0, '1': 4.5, '2': 3.2, '3': 2.2, '4': 1.5, '5': 1.0 }), // accel m/s^2
  brakeDecel: 9.0,
  coastDecel: 1.2,
  idleRpm: 800,
  maxRpm: 2600,
  stallRpm: 650,            // realistic: stalls readily
  starterSeconds: 1.1,      // realistic: restart is felt
  clutchEngageThresh: 0.35, // engagement (1=engaged) above which torque transfers
  stallMinSpeedFrac: 0.12,  // below this fraction of gear top + low throttle => stall
  stallThrottle: 0.15,
  // --- lateral + suspension (used in Task 2; defined here so the frozen object is complete) ---
  pivotYawRate: 1.1,        // rad/s, full lever at standstill
  driveYawRateAtTop: 0.5,   // rad/s, full lever at top speed
  wheelRadius: 0.32,
  rideHeight: 0.55,
  wheelbase: 4.4,
  trackWidth: 2.5,
  suspTravel: 0.18,
  tiltLambda: 6,
  wheelLambda: 9,
});

export function createDriveState(overrides = {}) {
  return {
    x: 0, z: 0, y: 0,
    heading: 0,
    speed: 0,
    yawRate: 0,
    gear: 'N',
    clutch: 1,
    engineRpm: 800,
    engineOn: true,
    stalled: false,
    starterT: 0,
    grind: false,
    pitch: 0, roll: 0,
    wheelOffsetL: [0, 0, 0, 0, 0, 0],
    wheelOffsetR: [0, 0, 0, 0, 0, 0],
    wheelSpin: 0,
    trackScroll: 0,
    ...overrides,
  };
}

const defaultsIn = (input) => ({
  throttle: 0, brake: 0, steer: 0, clutch: 1, gearReq: null, starter: false, ...input,
});

export function stepDrive(state, dtSeconds, input = {}, wheelGroundY = null) {
  const T = SHILKA_DRIVE_TUNING;
  const dt = Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0);
  const inp = defaultsIn(input);
  const next = { ...state, wheelOffsetL: state.wheelOffsetL.slice(), wheelOffsetR: state.wheelOffsetR.slice(), grind: false };

  next.clutch = clamp(inp.clutch, 0, 1);

  // 1) starter (may bring the engine back)
  if (!next.engineOn) {
    if (inp.starter) {
      next.starterT += dt;
      if (next.starterT >= T.starterSeconds) {
        next.engineOn = true; next.stalled = false; next.engineRpm = T.idleRpm; next.starterT = 0;
      }
    } else next.starterT = 0;
  }

  // 2) gear change — clean only with the clutch disengaged; otherwise it grinds
  if (inp.gearReq != null && inp.gearReq !== next.gear && SHILKA_GEARS.includes(inp.gearReq)) {
    if (next.clutch < T.clutchEngageThresh) next.gear = inp.gearReq;
    else next.grind = true;
  }

  // 3) stall check (before torque): engaged + in gear + too slow for the gear + low throttle
  const inGear = next.gear !== 'N';
  if (next.engineOn && !next.stalled && next.clutch >= T.clutchEngageThresh && inGear) {
    const top = Math.abs(T.gearTopSpeed[next.gear]) || 1;
    if (Math.abs(next.speed) < top * T.stallMinSpeedFrac && inp.throttle < T.stallThrottle) {
      next.engineOn = false; next.stalled = true; next.engineRpm = 0;
    }
  }

  const engaged = next.engineOn && !next.stalled && next.clutch >= T.clutchEngageThresh && inGear;

  // 4) longitudinal speed
  if (inp.brake > 0) {
    const dv = T.brakeDecel * clamp(inp.brake, 0, 1) * dt;
    next.speed = next.speed > 0 ? Math.max(0, next.speed - dv) : Math.min(0, next.speed + dv);
  } else if (engaged) {
    const target = T.gearTopSpeed[next.gear] * clamp(inp.throttle, 0, 1);
    const a = T.gearPull[next.gear] * dt;
    next.speed += clamp(target - next.speed, -a, a);
  } else {
    const dv = T.coastDecel * dt;
    next.speed = next.speed > 0 ? Math.max(0, next.speed - dv) : Math.min(0, next.speed + dv);
  }

  // 5) engine rpm
  if (!next.engineOn) next.engineRpm = 0;
  else if (engaged) {
    const top = Math.abs(T.gearTopSpeed[next.gear]) || 1;
    next.engineRpm = clamp(T.idleRpm + (Math.abs(next.speed) / top) * (T.maxRpm - T.idleRpm), T.idleRpm, T.maxRpm);
  } else {
    next.engineRpm = clamp(T.idleRpm + clamp(inp.throttle, 0, 1) * (T.maxRpm - T.idleRpm), T.idleRpm, T.maxRpm);
  }

  // 6) integrate heading-aligned position (lateral steering added in Task 2)
  next.x += Math.sin(next.heading) * next.speed * dt;
  next.z += Math.cos(next.heading) * next.speed * dt;

  // 7) visuals that depend only on speed
  next.wheelSpin = (next.wheelSpin + (next.speed / T.wheelRadius) * dt) % TAU;
  next.trackScroll += next.speed * dt;

  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shilka/drive.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shilka-drive.js tests/shilka/drive.test.mjs
git commit -m "feat(shilka): pure driving core — transmission, clutch, engine, stall

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Driving core — steering, suspension, hull tilt

**Files:**
- Modify: `src/shilka-drive.js` (extend `stepDrive`)
- Test: `tests/shilka/drive.test.mjs` (append)

**Interfaces:**
- Consumes: `stepDrive` from Task 1, `wheelGroundY = { L:number[6], R:number[6] }` (terrain height under each road wheel, front→rear; index 0 = front).
- Produces: `stepDrive` now also writes `yawRate`, `heading`, `pitch`, `roll`, `wheelOffsetL[6]`, `wheelOffsetR[6]`, `y`.

- [ ] **Step 1: Write the failing test**

Append to `tests/shilka/drive.test.mjs`:

```js
const flat = () => ({ L: [0, 0, 0, 0, 0, 0], R: [0, 0, 0, 0, 0, 0] });

test('steering pivots in place at a standstill (engaged) and turns the heading', () => {
  let s = createDriveState({ gear: '1' });
  // throttle just above stall threshold so the engine survives a standstill, full right lever
  s = run(s, 30, 1 / 60, I({ gear: '1', throttle: 0.2, steer: 1 }), flat());
  assert.ok(s.heading > 0, 'heading rotated to the right');
});

test('turn rate is wider (smaller yaw) at speed than at a standstill', () => {
  const slow = run(createDriveState({ gear: '1' }), 5, 1 / 60, I({ gear: '1', throttle: 0.2, steer: 1 }), flat());
  const fast = run(createDriveState({ gear: '5', speed: SHILKA_DRIVE_TUNING_TOP() }), 5, 1 / 60, I({ gear: '5', throttle: 1, steer: 1 }), flat());
  assert.ok(Math.abs(fast.yawRate) < Math.abs(slow.yawRate), 'yaw rate shrinks with speed');
});
function SHILKA_DRIVE_TUNING_TOP() { return T.gearTopSpeed['5']; }

test('flat terrain produces no tilt; a front-high ramp pitches the nose up', () => {
  let s = createDriveState();
  s = run(s, 60, 1 / 60, I(), flat());
  assert.ok(Math.abs(s.pitch) < 1e-3 && Math.abs(s.roll) < 1e-3, 'flat => level');
  const ramp = { L: [1, 0.8, 0.6, 0.4, 0.2, 0], R: [1, 0.8, 0.6, 0.4, 0.2, 0] }; // front (idx0) higher
  s = run(createDriveState(), 120, 1 / 60, I(), ramp);
  assert.ok(s.pitch > 0.05, 'nose pitches up when the front wheels sit higher');
});

test('a side slope rolls the hull and wheel offsets stay within travel', () => {
  const side = { L: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], R: [-0.5, -0.5, -0.5, -0.5, -0.5, -0.5] };
  const s = run(createDriveState(), 120, 1 / 60, I(), side);
  assert.ok(Math.abs(s.roll) > 0.05, 'left-high side slope rolls the hull');
  for (const o of [...s.wheelOffsetL, ...s.wheelOffsetR]) {
    assert.ok(Math.abs(o) <= SHILKA_DRIVE_TUNING.suspTravel + 1e-9, 'wheel offset clamped to suspension travel');
  }
});
```

Add `SHILKA_DRIVE_TUNING` to the existing import line at the top of the test file:
`import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING, SHILKA_DRIVE_TUNING as T } from '../../src/shilka-drive.js';`

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shilka/drive.test.mjs`
Expected: FAIL — `pitch`/`roll`/`yawRate` stay 0 (lateral block not implemented), tilt assertions fail.

- [ ] **Step 3: Write minimal implementation**

In `src/shilka-drive.js`, add the damp helper near the top (under `clamp`):

```js
// frame-rate-independent exponential smoothing toward a target
const damp = (cur, target, lambda, dt) => target + (cur - target) * Math.exp(-lambda * dt);
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
```

Then in `stepDrive`, replace the section `// 6) integrate heading-aligned position (lateral steering added in Task 2)` and its two `next.x/next.z` lines with:

```js
  // 6a) steering: clutch-and-brake levers — pivot at standstill, wider radius at speed
  const canSteer = engaged || Math.abs(next.speed) > 0.2;
  const topAbs = Math.abs(T.gearTopSpeed['5']) || 1;
  const speedFrac = clamp(Math.abs(next.speed) / topAbs, 0, 1);
  const maxYaw = T.pivotYawRate + (T.driveYawRateAtTop - T.pivotYawRate) * speedFrac;
  next.yawRate = canSteer ? clamp(inp.steer, -1, 1) * maxYaw : 0;
  next.heading = (next.heading + next.yawRate * dt) % TAU;

  // 6b) integrate heading-aligned position
  next.x += Math.sin(next.heading) * next.speed * dt;
  next.z += Math.cos(next.heading) * next.speed * dt;

  // 6c) suspension + hull tilt from per-wheel terrain heights (front→rear, index 0 = front)
  if (wheelGroundY && Array.isArray(wheelGroundY.L) && Array.isArray(wheelGroundY.R)
      && wheelGroundY.L.length === 6 && wheelGroundY.R.length === 6) {
    const L = wheelGroundY.L, R = wheelGroundY.R;
    const meanG = mean([...L, ...R]);
    const pitchT = Math.atan2(((L[0] + R[0]) / 2) - ((L[5] + R[5]) / 2), T.wheelbase);
    const rollT = Math.atan2(mean(L) - mean(R), T.trackWidth);
    next.pitch = damp(next.pitch, pitchT, T.tiltLambda, dt);
    next.roll = damp(next.roll, rollT, T.tiltLambda, dt);
    next.y = damp(next.y, meanG + T.wheelRadius + T.rideHeight, T.tiltLambda, dt);
    for (let i = 0; i < 6; i++) {
      next.wheelOffsetL[i] = damp(next.wheelOffsetL[i], clamp(L[i] - meanG, -T.suspTravel, T.suspTravel), T.wheelLambda, dt);
      next.wheelOffsetR[i] = damp(next.wheelOffsetR[i], clamp(R[i] - meanG, -T.suspTravel, T.suspTravel), T.wheelLambda, dt);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shilka/drive.test.mjs`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/shilka-drive.js tests/shilka/drive.test.mjs
git commit -m "feat(shilka): driving core — lever steering, suspension, hull tilt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Pure part-classifier + share it with the dev viewer

**Files:**
- Create: `src/shilka-rig.js`
- Test: `tests/shilka/rig.test.mjs`
- Rename + rewire: `_shilka_rig_view.html` → `tools/shilka-rig-view.html` (import the shared classifier)
- Modify: `.vercelignore` (keep the dev tool + GLB source out of the bundle if not already)

**Interfaces:**
- Produces: `classifyShilkaPart(cx, cy, cz, sx, sy, sz) -> 'hull'|'track'|'wheel'|'sprocket'|'turret'|'gun'|'radar'|'antenna'` — pure; operates in the GLTFLoader-native (Y-up) space the viewer already uses. `SHILKA_RIG_GROUPS: readonly string[]`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

Create `tests/shilka/rig.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyShilkaPart, SHILKA_RIG_GROUPS } from '../../src/shilka-rig.js';

// (cx,cy,cz, sx,sy,sz) — centre + size in the model's loaded Y-up space
test('a low compact disc near the ground is a road wheel', () => {
  assert.equal(classifyShilkaPart(1.2, 0.45, -1.0, 0.22, 0.6, 0.6), 'wheel');
});
test('a long thin Z-axis tube at turret height is a gun barrel', () => {
  assert.equal(classifyShilkaPart(0.2, 1.3, -2.0, 0.18, 0.18, 1.8), 'gun');
});
test('a tall super-thin vertical is an antenna whip', () => {
  assert.equal(classifyShilkaPart(0.8, 1.4, 0.2, 0.08, 1.2, 0.08), 'antenna');
});
test('the rear-top drum is the radar dish', () => {
  assert.equal(classifyShilkaPart(-0.2, 1.9, 0.9, 0.9, 0.5, 0.7), 'radar');
});
test('a central compact mass above deck height is turret', () => {
  assert.equal(classifyShilkaPart(-0.22, 1.2, -0.1, 0.8, 0.6, 0.8), 'turret');
});
test('a big low body box is hull', () => {
  assert.equal(classifyShilkaPart(0, 0.5, 0, 2.4, 0.9, 4.0), 'hull');
});
test('every returned group is a known rig group', () => {
  for (const g of [classifyShilkaPart(0, 0.5, 0, 2, 1, 4), classifyShilkaPart(1.2, 0.45, -1, 0.22, 0.6, 0.6)]) {
    assert.ok(SHILKA_RIG_GROUPS.includes(g));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/shilka/rig.test.mjs`
Expected: FAIL — `Cannot find module '../../src/shilka-rig.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/shilka-rig.js` (classifier lifted verbatim from the iterated `_shilka_rig_view.html` v2, made pure + exported):

```js
// shilka-rig.js -- ЗСУ-23-4 GLB auto-rig: a PURE bbox part-classifier + a THREE re-parenter.
// The classifier is the source of truth shared with tools/shilka-rig-view.html (dev viewer).
// classifyShilkaPart works in the GLTFLoader-native (Y-up) space, the same space the viewer renders.

export const SHILKA_RIG_GROUPS = Object.freeze(['hull', 'track', 'wheel', 'sprocket', 'turret', 'gun', 'radar', 'antenna']);

// centre (cx,cy,cz) + size (sx,sy,sz) of a mesh's world AABB, model loaded raw (front = -Z).
export function classifyShilkaPart(cx, cy, cz, sx, sy, sz) {
  // low running gear
  if (sx < 0.30 && cy < 0.65 && sy >= 0.45 && sz >= 0.45 && sz < 0.75) return 'wheel';
  if (sx < 0.30 && cy < 0.65 && sy >= 0.30 && sy < 0.48) return 'sprocket';
  if (sz > 3.5 && cy < 0.60 && sx < 0.6) return 'track';
  // whip antennas: tall + super-thin verticals -> own physics rig (NOT radar)
  if (sx < 0.14 && sz < 0.14 && sy > 0.60) return 'antenna';
  // 23 mm barrels: long in Z, thin both ways, at turret height
  if (sz > 1.0 && cy >= 1.05 && cy <= 1.6 && sx < 0.5 && sy < 0.5) return 'gun';
  // radar gun-dish drum: rear-top cluster only
  if (cy > 1.70 && cz > 0.45) return 'radar';
  // turret vs hull-deck: central compact = turret; side sponsons/fenders/engine deck = hull
  if (cy >= 1.0) {
    if (Math.abs(cx - (-0.22)) > 0.65) return 'hull';
    return 'turret';
  }
  return 'hull';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/shilka/rig.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Rewire the dev viewer to import the shared classifier**

Move the file and replace its inline `classify`:

```bash
mkdir -p tools
git mv _shilka_rig_view.html tools/shilka-rig-view.html 2>/dev/null || mv _shilka_rig_view.html tools/shilka-rig-view.html
```

In `tools/shilka-rig-view.html`:
- Fix the two relative paths now that it sits in `tools/`: `import { GLTFLoader } from '../vendor/GLTFLoader.js';`, the importmap `"three":"../vendor/three.module.min.js"`, and `loader.load('../assets/vehicles/lowpoly_zsu-23-4.glb', ...)`.
- Add to the module imports: `import { classifyShilkaPart } from '../src/shilka-rig.js';`
- Delete the inline `function classify(...)` block and change the call site `const g = classify(ctr.x,ctr.y,ctr.z, siz.x,siz.y,siz.z);` to `const g = classifyShilkaPart(ctr.x,ctr.y,ctr.z, siz.x,siz.y,siz.z);`

Confirm `.vercelignore` excludes the dev tool + heavy source model (append if missing):

```
tools/
*.orig.glb
```

- [ ] **Step 6: Browser-confirm the classifier still cuts cleanly**

Serve the repo over the no-store server (see Task 6 for the snippet) and open `http://localhost:<port>/tools/shilka-rig-view.html`. Confirm the four panels render the colour-coded groups and the legend counts are non-zero for `wheel` (expect ~12), `gun` (≈4), `radar`, `turret`, `hull`, `antenna`. Console: `window.__counts` populated, `window.__err === null`. If a group is mis-coloured, adjust the thresholds in `src/shilka-rig.js` (the viewer imports it, so the fix is shared) and re-run the node test.

- [ ] **Step 7: Commit**

```bash
git add src/shilka-rig.js tests/shilka/rig.test.mjs tools/shilka-rig-view.html .vercelignore
git commit -m "feat(shilka): pure GLB part-classifier shared with the rig dev viewer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `buildShilkaRig` — re-parent the GLB into movable groups

**Files:**
- Modify: `src/shilka-rig.js` (add the THREE re-parenter)
- Verify: in-browser (no node test — THREE/scene-graph work)

**Interfaces:**
- Consumes: `classifyShilkaPart` (Task 3); a loaded, **un-fitted** `THREE.Group` (the raw `gltf.scene`).
- Produces: `buildShilkaRig(modelScene, THREE) -> rig` where `rig = { root, body, turret, wheelsL[6], wheelsR[6], sprockets[], tracks[], guns[], dish[], antennas[] }`. `root` is a new group; `body` is the tilt node (children: everything); `wheelsL/R` are per-axle pivot groups ordered front→rear. The assembled `root` is rotated π about Y so the model's front (−Z) faces world **+Z**.

- [ ] **Step 1: Add the implementation**

Append to `src/shilka-rig.js`:

```js
// Re-parent a freshly-loaded gltf.scene into movable rig groups. THREE is injected so the
// classifier module stays import-free. Returns a rig handle the adapter animates each frame.
export function buildShilkaRig(modelScene, THREE) {
  modelScene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelScene);
  const center = new THREE.Vector3(); box.getCenter(center);

  const root = new THREE.Group(); root.name = 'shilka rig root';
  const body = new THREE.Group(); body.name = 'shilka body (tilt)';
  root.add(body);

  const buckets = { hull: [], track: [], wheel: [], sprocket: [], turret: [], gun: [], radar: [], antenna: [] };
  const tmp = new THREE.Box3(), ctr = new THREE.Vector3(), siz = new THREE.Vector3();
  const meshes = [];
  modelScene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    tmp.setFromObject(m); tmp.getCenter(ctr); tmp.getSize(siz);
    const g = classifyShilkaPart(ctr.x, ctr.y, ctr.z, siz.x, siz.y, siz.z);
    buckets[g].push({ mesh: m, cx: ctr.x, cz: ctr.z });
  }

  // helper: make a pivot group at a world point and re-home a mesh under it (keep world transform)
  const pivotAt = (px, py, pz, name) => { const grp = new THREE.Group(); grp.name = name; grp.position.set(px, py, pz); return grp; };
  const reparentKeepWorld = (mesh, parent) => { parent.attach(mesh); }; // THREE.attach preserves world transform

  // static body groups
  const turret = new THREE.Group(); turret.name = 'turret'; body.add(turret);
  for (const { mesh } of buckets.hull) reparentKeepWorld(mesh, body);
  for (const { mesh } of buckets.track) reparentKeepWorld(mesh, body);
  for (const { mesh } of [...buckets.turret, ...buckets.gun, ...buckets.radar]) reparentKeepWorld(mesh, turret);

  const guns = buckets.gun.map(b => b.mesh);
  const dish = buckets.radar.map(b => b.mesh);

  // road wheels: split L/R by sign of X, order front→rear (front = -Z => ascending z)
  const wheelsL = [], wheelsR = [];
  const wheelEntries = buckets.wheel.slice().sort((a, b) => a.cz - b.cz);
  for (const w of wheelEntries) {
    const side = (w.cx >= center.x) ? wheelsR : wheelsL;
    if (side.length >= 6) continue; // guard against stray extra meshes
    const pivot = pivotAt(w.cx, 0, w.cz, `wheel ${side === wheelsL ? 'L' : 'R'}${side.length}`);
    body.add(pivot); reparentKeepWorld(w.mesh, pivot);
    side.push(pivot);
  }

  const sprockets = buckets.sprocket.map(b => { const p = pivotAt(b.cx, 0, b.cz, 'sprocket'); body.add(p); reparentKeepWorld(b.mesh, p); return p; });
  const tracks = buckets.track.map(b => b.mesh);

  // antenna whips: each gets its own base pivot for sway
  const antennas = buckets.antenna.map((b) => {
    tmp.setFromObject(b.mesh); tmp.getCenter(ctr);
    const baseY = (new THREE.Box3().setFromObject(b.mesh)).min.y;
    const pivot = pivotAt(ctr.x, baseY, ctr.z, 'antenna');
    body.add(pivot); reparentKeepWorld(b.mesh, pivot);
    return pivot;
  });

  // orient: model front is -Z; rotate the assembly so front faces world +Z
  root.rotation.y = Math.PI;

  return { root, body, turret, wheelsL, wheelsR, sprockets, tracks, guns, dish, antennas };
}
```

- [ ] **Step 2: Smoke-test the build in the viewer**

Add a temporary check to the browser console while `tools/shilka-rig-view.html` is open — paste in DevTools after `window.__ready`:

```js
const { buildShilkaRig } = await import('../src/shilka-rig.js');
const THREE = await import('../vendor/three.module.min.js');
const rig = buildShilkaRig(window.__lastModel /* see step 3 */, THREE);
console.log('wheelsL', rig.wheelsL.length, 'wheelsR', rig.wheelsR.length, 'guns', rig.guns.length, 'dish', rig.dish.length, 'antennas', rig.antennas.length);
```

- [ ] **Step 3: Expose the loaded model for the smoke-test**

In `tools/shilka-rig-view.html`, inside the loader callback after `scene.add(model);`, add `window.__lastModel = model;` so the console smoke-test can grab it. Reload, run step 2, and confirm `wheelsL`/`wheelsR` are each up to 6 and `guns ≈ 4`. (This `window.__lastModel` line is dev-only and stays in the tool, not in `src/`.)

- [ ] **Step 4: Commit**

```bash
git add src/shilka-rig.js tools/shilka-rig-view.html
git commit -m "feat(shilka): buildShilkaRig — reparent GLB meshes into movable rig groups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Adapter — drive-mode mount, per-frame loop, driver camera, HUD

**Files:**
- Modify: `src/shilka.js` (drive mode + rig wiring + driver camera; v1 fire-control stays dormant)
- Modify: `src/game.js` (route control + driver HUD interact text — minimal)
- Modify: `index.html` (small `#shilka-drive-hud` readout: gear, speed, rpm, stall)
- Verify: in-browser (Task 6)

**Interfaces:**
- Consumes: `createDriveState`, `stepDrive`, `SHILKA_DRIVE_TUNING` (Tasks 1–2); `buildShilkaRig` (Task 4).
- Produces: `ShilkaStation.mount()` now enters **drive mode**; `ShilkaStation.controlUpdate(dt)` drives when `this.driveMode` is true; rig animated from drive state.

- [ ] **Step 1: Import the driving core + rig builder in `src/shilka.js`**

At the top of `src/shilka.js`, extend the existing import from `./shilka-mechanics.js` block by adding two new imports under it:

```js
import { buildShilkaRig } from './shilka-rig.js';
import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING } from './shilka-drive.js';
```

- [ ] **Step 2: Build the rig + drive state in the constructor**

In `ShilkaStation.constructor`, after `this.state = createShilkaState({ rangeGateM: 1200 });` add:

```js
    this.driveMode = false;
    this.drive = createDriveState({ x: this.base.x, z: this.base.z, heading: this.baseYaw });
    this.rig = null; // set when the GLB finishes loading (see _loadVehicleAsset)
```

- [ ] **Step 3: Wire the rig in `_loadVehicleAsset`**

Replace the body of `_loadVehicleAsset` with a version that builds the rig instead of the fixed `fitShilkaAsset` block. New method:

```js
  async _loadVehicleAsset() {
    try {
      const gltf = await loadGltf(SHILKA_ASSET_URL);
      if (!this.vehicleRoot) return;
      const rig = buildShilkaRig(gltf.scene, THREE);
      // scale the assembled rig to the target length and ground it
      rig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root);
      const size = new THREE.Vector3(); box.getSize(size);
      const scale = SHILKA_ASSET_TARGET_LENGTH_M / Math.max(0.001, size.x, size.z);
      rig.root.scale.setScalar(scale);
      prepVehicleMeshTree(rig.root);
      this.vehicleRoot.add(rig.root);
      this.vehicleModel = rig.root;
      this.rig = rig;
      this._rigScale = scale;
    } catch (e) {
      console.warn('[shilka] Failed to load/rig GLB vehicle; station marker remains.', e);
    }
  }
```

(`fitShilkaAsset` is now unused by the station; leave the function in place — the orientation handling moved into `buildShilkaRig`. Remove `fitShilkaAsset` only if no other caller exists.)

- [ ] **Step 4: Enter drive mode on mount**

Replace `ShilkaStation.mount()` with:

```js
  mount() {
    const pl = this.game.player;
    pl.shilka = this;
    this.driveMode = true;
    this.game.weapons.group.visible = false;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0';
    // sync drive state to where the vehicle physically sits
    this.drive.x = this.base.x; this.drive.z = this.base.z; this.drive.heading = this.baseYaw;
    this.drive.gear = 'N'; this.drive.speed = 0; this.drive.engineOn = true; this.drive.stalled = false;
    this._showDriveHud(true);
    if (!this.game.input.locked) this.game.input.requestLock();
    this._frameDriverCamera(0.001);
  }
```

And in `dismount()`, add `this.driveMode = false; this._showDriveHud(false);` before `pl.shilka = null;`.

- [ ] **Step 5: Drive-mode control update**

In `ShilkaStation.controlUpdate(dt)`, branch at the very top so drive mode runs driving and the dormant v1 fire-control is never entered this slice:

```js
  controlUpdate(dt) {
    if (this.driveMode) { this._driveControlUpdate(dt); return; }
    // --- v1 fire-control (dormant this slice; re-wired in the commander/scope layer) ---
    // ... existing body unchanged ...
  }
```

Add the new methods to the class:

```js
  _driveControlUpdate(dt) {
    const input = this.game.input;
    const T = SHILKA_DRIVE_TUNING;
    // gear selection (mode-gated; clash-free with commander digits in a later slice)
    let gearReq = null;
    if (input.wasPressed('Digit1')) gearReq = '1';
    else if (input.wasPressed('Digit2')) gearReq = '2';
    else if (input.wasPressed('Digit3')) gearReq = '3';
    else if (input.wasPressed('Digit4')) gearReq = '4';
    else if (input.wasPressed('Digit5')) gearReq = '5';
    else if (input.wasPressed('KeyR')) gearReq = 'R';
    else if (input.wasPressed('Backquote') || input.wasPressed('Digit0')) gearReq = 'N';
    const inp = {
      throttle: input.isDown('KeyW') ? 1 : 0,
      brake: input.isDown('KeyS') ? 1 : 0,
      steer: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      clutch: (input.isDown('Space')) ? 0 : 1, // Space pressed = clutch in (disengaged)
      gearReq,
      starter: input.isDown('Enter'),
    };
    const ground = this._sampleWheelGround();
    this.drive = stepDrive(this.drive, dt, inp, ground);
    this._applyRig();
    this._frameDriverCamera(dt);
    this._updateDriveHud();
  }

  // world XZ of each road wheel from the current drive pose, then terrain height there
  _sampleWheelGround() {
    if (!this.rig) return null;
    const T = SHILKA_DRIVE_TUNING;
    const cos = Math.cos(this.drive.heading), sin = Math.sin(this.drive.heading);
    const half = T.trackWidth / 2;
    const z0 = -T.wheelbase / 2, dz = T.wheelbase / 5;
    const L = [], R = [];
    for (let i = 0; i < 6; i++) {
      const lz = z0 + dz * i;
      // left wheel local (-X), right wheel local (+X); rotate into world by heading
      const lx = -half, rx = half;
      const lwx = this.drive.x + (lx * cos + lz * sin), lwz = this.drive.z + (-lx * sin + lz * cos);
      const rwx = this.drive.x + (rx * cos + lz * sin), rwz = this.drive.z + (-rx * sin + lz * cos);
      L.push(this._groundY(lwx, lwz));
      R.push(this._groundY(rwx, rwz));
    }
    return { L, R };
  }

  _applyRig() {
    const rig = this.rig; if (!rig) return;
    const d = this.drive;
    this.vehicleRoot.position.set(d.x, d.y, d.z);
    this.vehicleRoot.rotation.y = d.heading;
    rig.body.rotation.set(d.pitch, 0, d.roll);
    const s = this._rigScale || 1;
    for (let i = 0; i < rig.wheelsL.length; i++) { rig.wheelsL[i].position.y = d.wheelOffsetL[i] / s; rig.wheelsL[i].rotation.x = d.wheelSpin; }
    for (let i = 0; i < rig.wheelsR.length; i++) { rig.wheelsR[i].position.y = d.wheelOffsetR[i] / s; rig.wheelsR[i].rotation.x = d.wheelSpin; }
    for (const sp of rig.sprockets) sp.rotation.x = d.wheelSpin;
    const sway = clamp(-d.yawRate * 0.25 + (d.speed * 0.0), -0.25, 0.25);
    for (const a of rig.antennas) a.rotation.z = damp(a.rotation.z || 0, sway, 8, 1 / 60);
  }

  _frameDriverCamera(dt) {
    const cam = this.game.engine.camera;
    const d = this.drive;
    // driver eye: front-left of the hull, low; tunable in verification
    const EYE = { x: 0.7, y: 2.0, z: 1.7 };
    const cos = Math.cos(d.heading), sin = Math.sin(d.heading);
    const ex = d.x + (EYE.x * cos + EYE.z * sin);
    const ez = d.z + (-EYE.x * sin + EYE.z * cos);
    cam.position.set(ex, d.y + EYE.y, ez);
    cam.rotation.order = 'YXZ';
    // periscope look: mouse pans a limited cone around the hull's forward axis
    this._lookYaw = clamp((this._lookYaw || 0) + this.game.input.mouseDX * 0.0022, -0.9, 0.9);
    this._lookPitch = clamp((this._lookPitch || 0) - this.game.input.mouseDY * 0.0022, -0.5, 0.6);
    const fwd = new THREE.Vector3(
      Math.sin(d.heading + this._lookYaw) * Math.cos(this._lookPitch),
      Math.sin(this._lookPitch),
      Math.cos(d.heading + this._lookYaw) * Math.cos(this._lookPitch),
    );
    cam.lookAt(TMP_END.copy(cam.position).add(fwd));
    this.game.engine.setFov(70);
    const pl = this.game.player;
    pl.pos.set(d.x, d.y, d.z); pl.vel.set(0, 0, 0);
  }

  _showDriveHud(on) { const el = document.getElementById('shilka-drive-hud'); if (el) el.classList.toggle('show', !!on); }
  _updateDriveHud() {
    const el = document.getElementById('shilka-drive-hud'); if (!el) return;
    const d = this.drive;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('shilka-dh-gear', d.gear);
    set('shilka-dh-speed', `${Math.round(Math.abs(d.speed) * 3.6)} km/h`);
    set('shilka-dh-rpm', d.engineOn ? `${Math.round(d.engineRpm)} rpm` : 'STALL');
    el.classList.toggle('stall', !d.engineOn);
  }
```

(`clamp`/`damp`/`TAU` are already imported from `./util.js` at the top of `shilka.js`; `TMP_END` already exists. If `damp` is not in the existing import, add it.)

- [ ] **Step 6: Add the driver HUD markup + style to `index.html`**

Near the existing `#shilka-panel` markup, add:

```html
<div id="shilka-drive-hud">
  <div class="dh-row"><span class="dh-k">GEAR</span><span id="shilka-dh-gear">N</span></div>
  <div class="dh-row"><span class="dh-k">SPD</span><span id="shilka-dh-speed">0 km/h</span></div>
  <div class="dh-row"><span class="dh-k">ENG</span><span id="shilka-dh-rpm">800 rpm</span></div>
  <div class="dh-hint">W/S plyn·brzda · A/D páky · SPACE spojka · 1–5/R/0 stupeň · ENTER startér · E ven</div>
</div>
```

And in the `<style>` block:

```css
#shilka-drive-hud{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:none;
  background:rgba(8,12,16,.82);border:1px solid #2c3a44;border-radius:8px;padding:8px 14px;
  font:14px/1.3 'Russo One',monospace;color:#cfe;z-index:40;gap:16px;align-items:center}
#shilka-drive-hud.show{display:flex}
#shilka-drive-hud .dh-row{display:flex;gap:6px;align-items:baseline}
#shilka-drive-hud .dh-k{color:#7fa6b8;font-size:11px}
#shilka-drive-hud #shilka-dh-gear{color:#ffd16a;font-size:18px;min-width:1.2em;text-align:center}
#shilka-drive-hud.stall #shilka-dh-rpm{color:#ff5a4a}
#shilka-drive-hud .dh-hint{color:#8fb0bf;font-size:10px;border-left:1px solid #2c3a44;padding-left:12px}
```

- [ ] **Step 7: Confirm the interact prompt + mount still wire in `game.js`**

No new control routing is needed in `game.js`: the existing `else if (this.nearestShilka()) ... mount()` path (E) and the existing `if (this.player.shilka) this.player.shilka.controlUpdate(dt)` call already cover drive mode. Only update the interact copy so it reads as a vehicle. Change the `_nearShilka` interact line to:

```js
    } else if (_nearShilka) {
      this.hud.setInteract('Press <b>E</b> to drive the ЗСУ-23-4 «Shilka»');
```

- [ ] **Step 8: Commit**

```bash
git add src/shilka.js src/game.js index.html
git commit -m "feat(shilka): drivable station — drive-mode mount, rig animation, periscope camera, HUD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: In-browser end-to-end verification + tuning pass

**Files:**
- Modify (tuning only, as needed): `src/shilka-drive.js` (`SHILKA_DRIVE_TUNING`), `src/shilka.js` (`EYE` offset, FOV)

**Interfaces:** none new — this task confirms the assembled feature against the spec's §6 verification.

- [ ] **Step 1: Start a no-store server**

`src/*` bare-path ES imports go stale on a plain reload, so serve with no-store. Create `/tmp/nostore.py` and run it on a fresh port:

```python
import http.server, socketserver, sys
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
socketserver.TCPServer(('', int(sys.argv[1])), H).serve_forever()
```

Run from the repo root: `python3 /tmp/nostore.py 8011` → open `http://localhost:8011/?map=steppe`.

- [ ] **Step 2: Drive it**

In the browser: start a steppe run, walk to a Shilka (airfield), press **E**. Verify, with `0` console errors:
- HUD `#shilka-drive-hud` appears; mouse pans the periscope within a cone; FOV reads as a driver view.
- Clutch (hold **Space**) + **1** selects 1st; releasing clutch with **W** moves off with momentum; **2..5** upshift raises speed; **R** reverses; **`** / **0** neutral.
- Dumping the clutch at a standstill in gear with no throttle **stalls** (RPM → `STALL`); **Enter** restarts after ~1 s.
- **A/D** turn (pivot near standstill, wider at speed); the hull **tilts** over terrain and **road wheels bob**; wheels spin; antennas sway in turns.
- **E** dismounts cleanly (weapon + crosshair return, HUD hides, the other Shilka stays parked and is also drivable).

- [ ] **Step 3: Tune to feel**

Adjust only constants: `gearTopSpeed`/`gearPull`/accel for pace, `stallRpm`/`starterSeconds` within the realistic band, `suspTravel`/`tiltLambda` for the suspension look, the driver `EYE` offset + FOV for the periscope framing. Re-run `node --test tests/shilka/drive.test.mjs` after any core change (the deterministic tests must stay green).

- [ ] **Step 4: Confirm node tests still pass**

Run: `node --test tests/shilka/drive.test.mjs tests/shilka/rig.test.mjs tests/shilka/mechanics.test.mjs`
Expected: all PASS.

- [ ] **Step 5: Commit any tuning**

```bash
git add src/shilka-drive.js src/shilka.js
git commit -m "tune(shilka): driving feel + periscope framing from in-browser pass

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Auto-rig GLB by bbox into groups → Tasks 3 (classifier) + 4 (`buildShilkaRig`). ✅
- Driver mounts E, 1st-person periscope, free ride → Task 5 (`mount`, `_frameDriverCamera`, `_driveControlUpdate`). ✅
- Manual transmission 5+R, clutch, realistic stall → Task 1. ✅
- Clutch-and-brake two-lever steering → Task 2 (`steer`, pivot/wider-at-speed). ✅
- Per-wheel suspension + hull tilt, wheel spin, antenna sway → Tasks 2 (core) + 5 (`_applyRig`). ✅
- Deterministic, node-tested core → Tasks 1–3 tests + determinism test. ✅
- v1 fire-control dormant, not deleted → Task 5 Step 5 branch. ✅
- Collision deferred with a seam → driving moves `vehicleRoot` via `_applyRig`; collision later clamps the proposed pose at that single apply point (no math change). The footprint AABB is derivable from `wheelbase`/`trackWidth`. Noted; no task (out of scope). ✅
- Fixed-step note: the spec lists `_fixedStep` reuse; `stepDrive(dt)` works under variable or fixed dt unchanged, so no separate task — flagged here as deferred wiring. ✅
- In-browser verify over no-store server → Task 6. ✅
- Rename viewer to `tools/` + `.vercelignore` → Task 3. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; tuning step changes named constants only.

**3. Type consistency:** `stepDrive(state, dt, input, wheelGroundY)` and `input`/`wheelGroundY` shapes match across Tasks 1, 2, 5. `buildShilkaRig(modelScene, THREE) -> { root, body, turret, wheelsL[], wheelsR[], sprockets[], tracks[], guns[], dish[], antennas[] }` is consumed exactly that way in Task 5 `_applyRig`. `classifyShilkaPart(cx,cy,cz,sx,sy,sz)` signature identical in Tasks 3, 4 and the viewer. `SHILKA_DRIVE_TUNING` keys referenced in Tasks 2/5 (`trackWidth`, `wheelbase`, `suspTravel`, `gearTopSpeed`) are all defined in Task 1's frozen object.

**Known risk (flagged, not a blocker):** the classifier thresholds were tuned in the viewer's GLTFLoader-native space; if `buildShilkaRig` mis-groups meshes in-game, fix thresholds in `src/shilka-rig.js` (shared with the viewer) — Task 3 Step 6 and Task 4 Step 2 are the checkpoints. The committed v1 `fitShilkaAsset` applied a `-PI/2` X-rotation that conflicts with this Y-up space; this plan stops using it for the station (orientation handled by `buildShilkaRig`'s π-about-Y) — verify the vehicle sits upright in Task 6 Step 2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-shilka-rig-driving.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session with checkpoints for review.

Which approach?
