// shilka-drive.js -- pure deterministic driving model for the ЗСУ-23-4 (ГМ-575 chassis).
// ZERO THREE/DOM imports. The adapter samples terrain and applies transforms; this owns the math.
// Coordinate convention matches the game world: heading 0 points +Z (forward), +X right, +Y up.

const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// frame-rate-independent exponential smoothing toward a target
const damp = (cur, target, lambda, dt) => target + (cur - target) * Math.exp(-lambda * dt);
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

export const SHILKA_GEARS = Object.freeze(['R', 'N', '1', '2', '3', '4', '5']);

export const SHILKA_DRIVE_TUNING = Object.freeze({
  // Per-gear ceilings map onto the real ГМ-575 terrain bands (manual TTH): 1st ≈10 km/h = off-road/heavy
  // crawler ("1-я только для тяжёлых участков"), 4th ≈40 km/h = field road, 5th ≈50 km/h = highway max.
  // 1st is the unsynchronised low-range gear — you START OFF on 2nd; 1st is for mud/steep grades only.
  gearTopSpeed: Object.freeze({ R: -3.2, N: 0, '1': 2.8, '2': 5.0, '3': 8.0, '4': 11.0, '5': 13.9 }),
  gearPull:     Object.freeze({ R: 3.0,  N: 0, '1': 4.5, '2': 3.2, '3': 2.2, '4': 1.5, '5': 1.0 }), // accel m/s^2
  // Lug floor (m/s): below this a gear is "too tall" — the big V-6 bogs and stalls even at full throttle.
  // You LAUNCH on 2nd (the manual's start gear); 1st is the heavy-terrain crawler (both pull from a dead
  // stop). 3rd–5th only engage once already rolling — flooring them from a standstill just kills the engine.
  gearMinSpeed: Object.freeze({ R: 0, N: 0, '1': 0, '2': 0, '3': 2.5, '4': 4.5, '5': 7.0 }),
  brakeDecel: 9.0,
  coastDecel: 1.2,
  // V-6R/V-6М-1 diesel: low-idling big-bore (19.1 L), 280 hp @ 2000 rpm. Idle floor ~500, redline ~2100.
  idleRpm: 600,
  maxRpm: 2100,
  stallRpm: 500,           // engine's min-idle floor (documented; the stall trigger is speed/throttle below)
  starterSeconds: 1.1,      // realistic: restart is felt
  clutchEngageThresh: 0.35, // engagement (1=engaged) above which torque transfers
  stallMinSpeedFrac: 0.12,  // below this fraction of gear top + low throttle => stall
  stallThrottle: 0.15,
  synchroSpeed: 0.6,        // m/s — above this, the UNsynchronised 1st & ЗХ(reverse) clash when engaged
  // --- steering (clutch-and-brake: brakes ONE track to turn → NO neutral/pivot turn; a turn needs
  //     forward motion and SCRUBS speed via inner-track drag → finite radius, never spins in place) ---
  maxYawRate: 0.95,         // rad/s, full lever in the mid-speed band (peak turn authority)
  driveYawRateAtTop: 0.45,  // rad/s, full lever at top speed (the turn widens as it goes faster)
  minTurnSpeed: 0.4,        // m/s — below this the tracks can't turn the hull (no spin-in-place)
  turnRampSpeed: 1.2,       // m/s of travel over which turn authority ramps 0→1 above minTurnSpeed
  turnScrub: 0.4,           // forward-speed bleed /s at full lock (inner-track braking)
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
    engineRpm: 600,
    engineOn: true,
    stalled: false,
    starterT: 0,
    grind: false,
    pitch: 0, roll: 0,
    wheelOffsetL: [0, 0, 0, 0, 0, 0],
    wheelOffsetR: [0, 0, 0, 0, 0, 0],
    wheelSpin: 0,
    trackScroll: 0,
    wheelSpinL: 0, wheelSpinR: 0,     // per-side spin (turns drive the two belts at different rates)
    trackScrollL: 0, trackScrollR: 0, // per-side belt scroll (metres travelled by each track surface)
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

  // 2) gear change — must declutch; II–V are synchronised (clean), but 1st and ЗХ(reverse) have NO
  //    synchroniser, so engaging them while the machine is still rolling clashes (real ГМ-575 gearbox).
  if (inp.gearReq != null && inp.gearReq !== next.gear && SHILKA_GEARS.includes(inp.gearReq)) {
    const declutched = next.clutch < T.clutchEngageThresh;
    const unsynced = inp.gearReq === '1' || inp.gearReq === 'R'; // 1st & reverse: no synchroniser
    if (!declutched) next.grind = true;                          // shifting under load grinds the dogs
    else if (unsynced && Math.abs(next.speed) > T.synchroSpeed) next.grind = true; // clash → slow first
    else next.gear = inp.gearReq;                                // synchronised (II–V) or near a stop
  }

  // 3) stall check (before torque): engaged + in gear, killed by either —
  //   (a) LUGGING: the gear is too tall for the current speed (below gearMinSpeed), so the V-6 bogs even
  //       at full throttle. This is why 3rd–5th can't pull away from a stop (launch on 2nd) and why you
  //       must downshift rather than let a tall gear drag the engine down as you slow.
  //   (b) IDLING-OUT: nearly stopped in a launch gear with no throttle (clutch dumped, no gas).
  const inGear = next.gear !== 'N';
  if (next.engineOn && !next.stalled && next.clutch >= T.clutchEngageThresh && inGear) {
    const top = Math.abs(T.gearTopSpeed[next.gear]) || 1;
    const lugging = Math.abs(next.speed) < (T.gearMinSpeed[next.gear] || 0);
    const idlingOut = Math.abs(next.speed) < top * T.stallMinSpeedFrac && inp.throttle < T.stallThrottle;
    if (lugging || idlingOut) {
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

  // 6a) steering: clutch-and-brake — the real ГМ-575 brakes ONE track to turn, it canNOT counter-rotate
  //     them, so there is NO neutral/pivot turn. Turn authority needs forward motion (ramps from 0 at
  //     minTurnSpeed) and a hard turn SCRUBS speed (the inner track drags → finite radius, never spins
  //     in place). Reverse mirrors the lever, like a car backing up.
  const topAbs = Math.abs(T.gearTopSpeed['5']) || 1;
  const moving = Math.abs(next.speed);
  const speedFrac = clamp(moving / topAbs, 0, 1);
  const turnGain = clamp((moving - T.minTurnSpeed) / T.turnRampSpeed, 0, 1); // 0 at/below minTurnSpeed
  const maxYaw = T.maxYawRate + (T.driveYawRateAtTop - T.maxYawRate) * speedFrac; // peak mid, narrows at top
  const steer = clamp(inp.steer, -1, 1);
  next.yawRate = steer * maxYaw * turnGain * (next.speed < 0 ? -1 : 1);
  next.heading = (next.heading + next.yawRate * dt) % TAU;
  if (turnGain > 0) next.speed *= (1 - T.turnScrub * Math.abs(steer) * turnGain * dt); // turn bleeds speed

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

  // 7) visual accumulators — PER SIDE so a turn spins the two belts at different rates. Differential
  //    drive: the track surface speed is vL = v - ω·B/2 (inner) and vR = v + ω·B/2 (outer); straight →
  //    equal, turn → outer faster. The single wheelSpin/trackScroll stay for the low-rate parked
  //    snapshot; the adapter drives the rig (UV scroll + wheel/sprocket spin) off the per-side ones.
  const halfB = T.trackWidth * 0.5;
  const vL = next.speed - next.yawRate * halfB;
  const vR = next.speed + next.yawRate * halfB;
  next.wheelSpinL = (next.wheelSpinL + (vL / T.wheelRadius) * dt) % TAU;
  next.wheelSpinR = (next.wheelSpinR + (vR / T.wheelRadius) * dt) % TAU;
  next.trackScrollL += vL * dt;
  next.trackScrollR += vR * dt;
  next.wheelSpin = (next.wheelSpin + (next.speed / T.wheelRadius) * dt) % TAU;
  next.trackScroll += next.speed * dt;

  return next;
}

// --- shift gate (ГМ-575 double-H selector) -------------------------------------------------------
// The real selector is a double-H: three vertical rails joined by one central neutral channel.
// The lever position is (gx, gy), each in [-1,1]:
//   gx: -1 left rail · 0 mid rail · +1 right rail   (gx rests on a rail centre when seated)
//   gy: +1 up slot · 0 neutral channel · -1 down slot
// Rail map (from the ГМ-575 manual): left up=5 / down=4 · mid up=3 / down=2 · right up=ЗХ(R) / down=1.
export const SHILKA_GATE_SLOTS = Object.freeze({
  '5': Object.freeze({ gx: -1, gy:  1 }), '4': Object.freeze({ gx: -1, gy: -1 }),
  '3': Object.freeze({ gx:  0, gy:  1 }), '2': Object.freeze({ gx:  0, gy: -1 }),
  'R': Object.freeze({ gx:  1, gy:  1 }), '1': Object.freeze({ gx:  1, gy: -1 }),
  'N': Object.freeze({ gx:  0, gy:  0 }),
});

const GATE_RAILS = Object.freeze([-1, 0, 1]); // left, mid, right rail centres
const GATE_ENGAGE_Y = 0.5;                    // |gy| past this = seated in a gear; inside = neutral channel
const nearestRail = (gx) => GATE_RAILS.reduce((a, b) => (Math.abs(b - gx) < Math.abs(a - gx) ? b : a), GATE_RAILS[0]);

// Which gear the lever at (gx, gy) selects. Neutral channel (|gy| < engage) is always N.
export function gateGear(gx, gy) {
  if (Math.abs(gy) < GATE_ENGAGE_Y) return 'N';
  const rail = nearestRail(gx);
  if (rail < -0.5) return gy > 0 ? '5' : '4';
  if (rail >  0.5) return gy > 0 ? 'R' : '1';
  return gy > 0 ? '3' : '2';
}

// Move the lever by (dx, dy) under the H-gate constraint: you may only cross rails (change gx) while
// the lever is in the neutral channel; once seated in a gear it locks onto that rail until pulled back
// through neutral. Returns the new clamped { gx, gy } and the resolved gear — pure, for unit tests.
export function moveShiftLever(lever, dx, dy) {
  const gy = clamp((lever.gy || 0) + (Number.isFinite(dy) ? dy : 0), -1, 1);
  let gx = lever.gx || 0;
  if (Math.abs(gy) < GATE_ENGAGE_Y) gx = clamp(gx + (Number.isFinite(dx) ? dx : 0), -1, 1); // free to cross
  else gx = nearestRail(gx);                                                                 // seated → lock to rail
  return { gx, gy, gear: gateGear(gx, gy) };
}
