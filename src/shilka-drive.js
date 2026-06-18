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
