// shilka-mechanics.js -- pure gameplay model for a sim-lite ZSU-23-4 fire-control loop.
//
// ZERO THREE/DOM/game imports. The game renderer owns meshes, cameras, audio, and UI; this
// module owns deterministic state transitions, radar math, fire-control math, and projectile
// hit simulation contracts.

import { dirToMils, wrap6000 } from './bearing.js';

export const SHILKA_PHASES = Object.freeze({
  POWER_OFF: 'power_off',
  GYRO_LOCKED: 'gyro_locked',
  DRIVE_OFF: 'drive_off',
  RADAR_WARMING: 'radar_warming',
  SEARCHING: 'searching',
  CONTACT: 'contact',
  ANGLE_LOCK: 'angle_lock',
  RANGE_SOLVING: 'range_solving',
  SOLUTION_READY: 'solution_ready',
  FIRING: 'firing',
  OVERHEATED: 'overheated',
  EMPTY: 'empty',
});

export const SHILKA_SEARCH_MODES = Object.freeze({
  SECTOR: 'sector',
  CIRCULAR: 'circular',
});

export const SHILKA_ROLES = Object.freeze({
  ANGLE: 'angle',
  RANGE: 'range',
});

export const SHILKA_RANGE_SCALES_M = Object.freeze([10000, 15000, 20000]);

export const SHILKA_TUNING = Object.freeze({
  warmupSeconds: 8,
  rangeSolveSeconds: 2.5,
  leadSolveSeconds: 1.2,
  lockBreakErrorDeg: 5,
  lockQualityReady: 0.72,
  rangeSolutionReady: 0.92,
  leadSolutionReady: 0.82,
  lockQualityGainPerSecond: 0.55,
  lockQualityLossPerSecond: 0.9,
  minTrackRangeM: 120,
  minTrackAltitudeM: 12,
  maxTrackAltitudeM: 4500,
  minTrackSignal: 0.18,
  rangeGateCaptureM: 360,
  rangeGateSnapM: 60,
  projectileSpeedMps: 970,
  projectileMaxTimeS: 5.5,
  projectileStepS: 1 / 120,
  droneHitRadiusM: 5.5,
  ammoMax: 2000,
  roundsPerSecond: 58,
  heatPerRound: 0.036,
  coolingPerSecond: 9,
  overheatAt: 100,
  firingHeatLimit: 92,
  burstSecondsMax: 1.4,
  dispersionMilsAtZeroQuality: 18,
  dispersionMilsAtFullQuality: 3,
});

const SWITCHES = new Set([
  'power54v',
  'gyroUnlocked',
  'hydroDrive',
  'radarFilament',
  'radarAnode',
  'radarHighVoltage',
  'radarOnAir',
]);

const TAU = Math.PI * 2;
const R2D = 180 / Math.PI;
const D2R = Math.PI / 180;
const MILS_TO_RAD = TAU / 6000;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const len3 = (v) => Math.hypot(v.x || 0, v.y || 0, v.z || 0);
const sub3 = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add3 = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul3 = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
const dot3 = (a, b) => (a.x * b.x + a.y * b.y + a.z * b.z);
const norm3 = (v) => {
  const l = len3(v) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createShilkaState(overrides = {}) {
  return {
    role: SHILKA_ROLES.ANGLE,
    power54v: false,
    gyroUnlocked: false,
    hydroDrive: false,
    radarFilament: false,
    radarAnode: false,
    radarHighVoltage: false,
    radarOnAir: false,
    radarWarmup: 0,
    searchMode: null,
    rangeScaleM: 20000,
    selectedTargetId: null,
    targetKinematics: null,
    radarSignal: 0,
    contact: false,
    angleLocked: false,
    rangeGateM: 1000,
    rangeGateLocked: false,
    rangeSolution: 0,
    leadSolution: 0,
    lockQuality: 0,
    ammo: SHILKA_TUNING.ammoMax,
    heat: 0,
    firing: false,
    lastBurstRounds: 0,
    ...overrides,
  };
}

function clearTrack(next) {
  next.selectedTargetId = null;
  next.targetKinematics = null;
  next.radarSignal = 0;
  next.contact = false;
  next.angleLocked = false;
  next.rangeGateLocked = false;
  next.rangeSolution = 0;
  next.leadSolution = 0;
  next.lockQuality = 0;
  return next;
}

export function setShilkaSwitch(state, name, on = true) {
  if (!SWITCHES.has(name)) throw new Error(`Unknown Shilka switch: ${name}`);
  const next = { ...state, [name]: Boolean(on), firing: false, lastBurstRounds: 0 };
  if (!isRadarPowered(next)) {
    next.radarWarmup = 0;
    next.searchMode = null;
    clearTrack(next);
  }
  return next;
}

export function isRadarPowered(state) {
  return !!(
    state.power54v &&
    state.gyroUnlocked &&
    state.hydroDrive &&
    state.radarFilament &&
    state.radarAnode &&
    state.radarHighVoltage &&
    state.radarOnAir
  );
}

export function radarReady(state) {
  return isRadarPowered(state) && state.radarWarmup >= SHILKA_TUNING.warmupSeconds;
}

export function setShilkaRole(state, role) {
  if (!Object.values(SHILKA_ROLES).includes(role)) throw new Error(`Unknown Shilka role: ${role}`);
  return { ...state, role, firing: false, lastBurstRounds: 0 };
}

export function setShilkaRangeScale(state, rangeScaleM) {
  if (!SHILKA_RANGE_SCALES_M.includes(rangeScaleM)) throw new Error(`Unsupported Shilka range scale: ${rangeScaleM}`);
  const next = {
    ...state,
    rangeScaleM,
    rangeGateM: clamp(state.rangeGateM, SHILKA_TUNING.minTrackRangeM, rangeScaleM),
    firing: false,
    lastBurstRounds: 0,
  };
  if (next.targetKinematics && next.targetKinematics.rangeM > rangeScaleM) clearTrack(next);
  return next;
}

export function startShilkaSearch(state, mode = SHILKA_SEARCH_MODES.SECTOR) {
  if (!Object.values(SHILKA_SEARCH_MODES).includes(mode)) throw new Error(`Unknown Shilka search mode: ${mode}`);
  if (!radarReady(state)) return { ...state, searchMode: null };
  return clearTrack({
    ...state,
    searchMode: mode,
    firing: false,
    lastBurstRounds: 0,
  });
}

export function setShilkaContact(state, visible) {
  const contact = Boolean(visible) && !!state.searchMode && radarReady(state);
  if (!contact) return clearTrack({ ...state, firing: false, lastBurstRounds: 0 });
  return { ...state, contact, firing: false, lastBurstRounds: 0 };
}

export function setShilkaRangeGate(state, rangeM) {
  const rangeGateM = clamp(Number.isFinite(rangeM) ? rangeM : state.rangeGateM, SHILKA_TUNING.minTrackRangeM, state.rangeScaleM);
  return {
    ...state,
    rangeGateM,
    rangeGateLocked: false,
    rangeSolution: 0,
    leadSolution: 0,
    firing: false,
    lastBurstRounds: 0,
  };
}

export function computeShilkaKinematics(origin, target) {
  const pos = target.pos || target;
  const vel = target.vel || { x: 0, y: 0, z: 0 };
  const rel = sub3(pos, origin);
  const groundRangeM = Math.hypot(rel.x, rel.z);
  const rangeM = Math.hypot(groundRangeM, rel.y);
  const los = norm3(rel);
  const radialMps = dot3(vel, los);
  const speedMps = len3(vel);
  const crossingMps = Math.sqrt(Math.max(0, speedMps * speedMps - radialMps * radialMps));
  const timeOfFlightS = rangeM / SHILKA_TUNING.projectileSpeedMps;
  const future = add3(pos, mul3(vel, timeOfFlightS));
  const futureRel = sub3(future, origin);
  const futureGround = Math.hypot(futureRel.x, futureRel.z);
  const azimuthMils = dirToMils(rel.x, rel.z);
  const futureAzimuthMils = dirToMils(futureRel.x, futureRel.z);
  const elevationDeg = Math.atan2(rel.y, groundRangeM || 1e-9) * R2D;
  const futureElevationDeg = Math.atan2(futureRel.y, futureGround || 1e-9) * R2D;
  let leadAzMils = futureAzimuthMils - azimuthMils;
  while (leadAzMils > 3000) leadAzMils -= 6000;
  while (leadAzMils < -3000) leadAzMils += 6000;
  return {
    targetId: target.id ?? null,
    azimuthMils,
    elevationDeg,
    rangeM,
    groundRangeM,
    altitudeM: pos.y - origin.y,
    closureMps: -radialMps,
    crossingMps,
    timeOfFlightS,
    leadAzMils,
    leadElDeg: futureElevationDeg - elevationDeg,
    dir: los,
    futureDir: norm3(futureRel),
  };
}

export function shilkaRadarSignal(state, kin, target = {}) {
  if (!radarReady(state) || !state.searchMode || !kin) return 0;
  const rcs = clamp(target.rcs ?? 1, 0, 4);
  const jamming = clamp(target.jamming ?? 0, 0, 1);
  if (
    kin.rangeM < SHILKA_TUNING.minTrackRangeM ||
    kin.rangeM > state.rangeScaleM ||
    kin.altitudeM < SHILKA_TUNING.minTrackAltitudeM ||
    kin.altitudeM > SHILKA_TUNING.maxTrackAltitudeM
  ) return 0;
  const rangeFalloff = 1 - kin.rangeM / Math.max(state.rangeScaleM, 1);
  const lowAltitudeMask = kin.altitudeM < 60 ? kin.altitudeM / 60 : 1;
  const closureHelp = clamp((Math.abs(kin.closureMps) + kin.crossingMps * 0.35) / 180, 0, 0.25);
  return clamp((0.14 + rangeFalloff * 0.72 + closureHelp) * rcs * lowAltitudeMask * (1 - jamming * 0.75), 0, 1);
}

export function updateShilkaTrack(state, origin, targets = []) {
  if (!radarReady(state) || !state.searchMode) return clearTrack({ ...state, firing: false, lastBurstRounds: 0 });
  let best = null;
  for (const target of targets) {
    if (!target || target.alive === false) continue;
    const kin = computeShilkaKinematics(origin, target);
    const signal = shilkaRadarSignal(state, kin, target);
    if (signal >= SHILKA_TUNING.minTrackSignal && (!best || signal > best.signal)) best = { target, kin, signal };
  }
  if (!best) return clearTrack({ ...state, firing: false, lastBurstRounds: 0 });
  return {
    ...state,
    selectedTargetId: best.target.id ?? null,
    targetKinematics: best.kin,
    radarSignal: best.signal,
    contact: true,
    firing: false,
    lastBurstRounds: 0,
  };
}

export function tryShilkaAngleLock(state, aimErrorDeg = 0) {
  const error = Math.abs(aimErrorDeg);
  if (!state.contact || !radarReady(state) || error > SHILKA_TUNING.lockBreakErrorDeg) {
    return {
      ...state,
      angleLocked: false,
      rangeGateLocked: false,
      rangeSolution: 0,
      leadSolution: 0,
      lockQuality: 0,
      firing: false,
      lastBurstRounds: 0,
    };
  }
  return {
    ...state,
    angleLocked: true,
    lockQuality: clamp(1 - error / SHILKA_TUNING.lockBreakErrorDeg, 0, 1),
    firing: false,
    lastBurstRounds: 0,
  };
}

export function stepShilka(state, dtSeconds, aimErrorDeg = 0) {
  const dt = Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0);
  const next = { ...state, firing: false, lastBurstRounds: 0 };

  if (isRadarPowered(next)) next.radarWarmup = clamp(next.radarWarmup + dt, 0, SHILKA_TUNING.warmupSeconds);
  else next.radarWarmup = 0;

  next.heat = clamp(next.heat - SHILKA_TUNING.coolingPerSecond * dt, 0, SHILKA_TUNING.overheatAt);

  if (!radarReady(next) || !next.contact) {
    next.angleLocked = false;
    next.rangeGateLocked = false;
    next.rangeSolution = 0;
    next.leadSolution = 0;
    next.lockQuality = 0;
    return next;
  }

  if (next.angleLocked) {
    const error = Math.abs(aimErrorDeg);
    if (error > SHILKA_TUNING.lockBreakErrorDeg) {
      next.angleLocked = false;
      next.rangeGateLocked = false;
      next.rangeSolution = 0;
      next.leadSolution = 0;
      next.lockQuality = 0;
      return next;
    }
    const aimFactor = 1 - error / SHILKA_TUNING.lockBreakErrorDeg;
    next.lockQuality = clamp(next.lockQuality + SHILKA_TUNING.lockQualityGainPerSecond * dt * aimFactor, 0, 1);
    const gateError = next.targetKinematics ? Math.abs(next.rangeGateM - next.targetKinematics.rangeM) : 0;
    const gateFactor = next.targetKinematics ? clamp(1 - gateError / SHILKA_TUNING.rangeGateCaptureM, 0, 1) : 1;
    next.rangeGateLocked = gateFactor > 0.86;
    if (next.targetKinematics && gateError <= SHILKA_TUNING.rangeGateSnapM) {
      next.rangeGateM += (next.targetKinematics.rangeM - next.rangeGateM) * clamp(dt * 2.5, 0, 1);
    }
    next.rangeSolution = clamp(next.rangeSolution + (dt / SHILKA_TUNING.rangeSolveSeconds) * gateFactor, 0, 1);
    next.leadSolution = clamp(next.leadSolution + (dt / SHILKA_TUNING.leadSolveSeconds) * next.lockQuality * gateFactor, 0, 1);
  } else {
    next.lockQuality = clamp(next.lockQuality - SHILKA_TUNING.lockQualityLossPerSecond * dt, 0, 1);
    next.rangeGateLocked = false;
    next.rangeSolution = 0;
    next.leadSolution = 0;
  }

  return next;
}

export function shilkaSolutionReady(state) {
  return !!(
    radarReady(state) &&
    state.angleLocked &&
    state.rangeSolution >= SHILKA_TUNING.rangeSolutionReady &&
    state.leadSolution >= SHILKA_TUNING.leadSolutionReady &&
    state.lockQuality >= SHILKA_TUNING.lockQualityReady
  );
}

export function shilkaSolutionQuality(state) {
  if (!radarReady(state) || !state.angleLocked) return 0;
  return clamp((state.lockQuality + state.rangeSolution + state.leadSolution + (state.rangeGateLocked ? 1 : 0)) / 4, 0, 1);
}

export function shilkaFireControl(state) {
  const kin = state.targetKinematics;
  if (!kin) return null;
  return {
    targetId: kin.targetId,
    azimuthMils: kin.azimuthMils,
    elevationDeg: kin.elevationDeg,
    rangeM: kin.rangeM,
    closureMps: kin.closureMps,
    leadAzMils: kin.leadAzMils,
    leadElDeg: kin.leadElDeg,
    solutionQuality: shilkaSolutionQuality(state),
  };
}

export function shilkaBurstRoundCount(state, seconds = 0.25) {
  if (!shilkaSolutionReady(state) || state.ammo <= 0 || state.heat >= SHILKA_TUNING.firingHeatLimit) return 0;
  const burst = clamp(Number.isFinite(seconds) ? seconds : 0, 0, SHILKA_TUNING.burstSecondsMax);
  const requested = Math.max(1, Math.round(burst * SHILKA_TUNING.roundsPerSecond));
  const heatRoom = Math.max(0, SHILKA_TUNING.overheatAt - state.heat);
  const heatLimited = Math.max(0, Math.floor(heatRoom / SHILKA_TUNING.heatPerRound));
  return Math.max(0, Math.min(state.ammo, requested, heatLimited));
}

export function fireShilkaBurst(state, seconds = 0.25) {
  const rounds = shilkaBurstRoundCount(state, seconds);
  return {
    ...state,
    ammo: state.ammo - rounds,
    heat: clamp(state.heat + rounds * SHILKA_TUNING.heatPerRound, 0, SHILKA_TUNING.overheatAt),
    firing: rounds > 0,
    lastBurstRounds: rounds,
  };
}

export function makeShilkaBurstGrant(state, shilkaId, muzzle, seed, seconds = 0.25) {
  const fc = shilkaFireControl(state);
  const roundCount = shilkaBurstRoundCount(state, seconds);
  if (!fc || roundCount <= 0) return null;
  const quality = shilkaSolutionQuality(state);
  const dispersionMils = SHILKA_TUNING.dispersionMilsAtFullQuality +
    (SHILKA_TUNING.dispersionMilsAtZeroQuality - SHILKA_TUNING.dispersionMilsAtFullQuality) * (1 - quality);
  return {
    shilkaId,
    targetId: fc.targetId,
    seed: seed >>> 0,
    roundCount,
    muzzle: { x: muzzle.x, y: muzzle.y, z: muzzle.z },
    baseDir: state.targetKinematics.futureDir,
    dispersionMils,
    startTime: 0,
  };
}

export function grantRoundDir(grant, index) {
  const rng = mulberry32(((grant.seed >>> 0) + Math.imul(index + 1, 0x9e3779b9)) >>> 0);
  const radius = (grant.dispersionMils || 0) * MILS_TO_RAD * Math.sqrt(rng());
  const ang = rng() * TAU;
  const base = norm3(grant.baseDir);
  const upRef = Math.abs(base.y) > 0.95 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const right = norm3({ x: upRef.y * base.z - upRef.z * base.y, y: upRef.z * base.x - upRef.x * base.z, z: upRef.x * base.y - upRef.y * base.x });
  const up = norm3({ x: base.y * right.z - base.z * right.y, y: base.z * right.x - base.x * right.z, z: base.x * right.y - base.y * right.x });
  return norm3(add3(add3(base, mul3(right, Math.cos(ang) * radius)), mul3(up, Math.sin(ang) * radius)));
}

export function segmentSphereHit(a, b, center, radius) {
  const ab = sub3(b, a);
  const ac = sub3(center, a);
  const denom = dot3(ab, ab) || 1e-9;
  const t = clamp(dot3(ac, ab) / denom, 0, 1);
  const p = add3(a, mul3(ab, t));
  const d = len3(sub3(center, p));
  return d <= radius ? { hit: true, t, point: p, distanceToCenter: d } : { hit: false, t, point: p, distanceToCenter: d };
}

export function simulateShilkaProjectile({ origin, dir, speed = SHILKA_TUNING.projectileSpeedMps, maxTime = SHILKA_TUNING.projectileMaxTimeS, step = SHILKA_TUNING.projectileStepS, targetStart, targetVel = { x: 0, y: 0, z: 0 }, targetRadius = SHILKA_TUNING.droneHitRadiusM }) {
  let p0 = { x: origin.x, y: origin.y, z: origin.z };
  const d = norm3(dir);
  for (let t = step; t <= maxTime + 1e-9; t += step) {
    const p1 = add3(origin, mul3(d, speed * t));
    const c0 = add3(targetStart, mul3(targetVel, t - step));
    const c1 = add3(targetStart, mul3(targetVel, t));
    const cMid = mul3(add3(c0, c1), 0.5);
    const hit = segmentSphereHit(p0, p1, cMid, targetRadius + len3(sub3(c1, c0)) * 0.5);
    if (hit.hit) return { hit: true, time: t, point: hit.point };
    p0 = p1;
  }
  return { hit: false, time: maxTime, point: p0 };
}

export function shilkaPhase(state) {
  if (!state.power54v) return SHILKA_PHASES.POWER_OFF;
  if (!state.gyroUnlocked) return SHILKA_PHASES.GYRO_LOCKED;
  if (!state.hydroDrive) return SHILKA_PHASES.DRIVE_OFF;
  if (!radarReady(state)) return SHILKA_PHASES.RADAR_WARMING;
  if (state.ammo <= 0) return SHILKA_PHASES.EMPTY;
  if (state.heat >= SHILKA_TUNING.firingHeatLimit) return SHILKA_PHASES.OVERHEATED;
  if (state.firing) return SHILKA_PHASES.FIRING;
  if (shilkaSolutionReady(state)) return SHILKA_PHASES.SOLUTION_READY;
  if (state.angleLocked && state.rangeSolution > 0) return SHILKA_PHASES.RANGE_SOLVING;
  if (state.angleLocked) return SHILKA_PHASES.ANGLE_LOCK;
  if (state.contact) return SHILKA_PHASES.CONTACT;
  if (state.searchMode) return SHILKA_PHASES.SEARCHING;
  return SHILKA_PHASES.SEARCHING;
}

export function makeShilkaDrone(id, routeSeed = 1, origin = { x: 0, y: 0, z: 0 }) {
  const rng = mulberry32(routeSeed >>> 0);
  const radius = 850 + rng() * 260;
  const altitude = 180 + rng() * 220;
  const phase = rng() * TAU;
  const angularSpeed = 0.035 + rng() * 0.018;
  return {
    id,
    routeSeed: routeSeed >>> 0,
    rcs: 0.9 + rng() * 0.4,
    health: 80,
    alive: true,
    pos: {
      x: origin.x + Math.sin(phase) * radius,
      y: origin.y + altitude,
      z: origin.z + Math.cos(phase) * radius,
    },
    vel: {
      x: Math.cos(phase) * radius * angularSpeed,
      y: 0,
      z: -Math.sin(phase) * radius * angularSpeed,
    },
    radius,
    altitude,
    phase,
    angularSpeed,
  };
}

export function stepShilkaDrone(drone, dt, origin = { x: 0, y: 0, z: 0 }) {
  const phase = drone.phase + drone.angularSpeed * dt;
  const pos = {
    x: origin.x + Math.sin(phase) * drone.radius,
    y: origin.y + drone.altitude,
    z: origin.z + Math.cos(phase) * drone.radius,
  };
  const vel = {
    x: Math.cos(phase) * drone.radius * drone.angularSpeed,
    y: 0,
    z: -Math.sin(phase) * drone.radius * drone.angularSpeed,
  };
  return { ...drone, phase, pos, vel };
}

