// ЗСУ-23-4 «Шилка» — ГАГ stabilization (gyro-azimuth-horizon) state machine.
//
// Pure logic, no THREE / no DOM — node-testable, reused by demoshilka + the game.
// Models the gyro spin-up: toggle ГАГ on → ЗАСТОПОРЕНО (spinning up, ~3 min) →
// ОТСТОПОРЕНО (ready, stabilization active). ОТСТОПОРЕНО = fire-on-move permitted.
// Needs power: gyro on DC (27.5 V) + its converters on 115 V (subsystem-states §5);
// losing either drops the gyro back to off (spin lost).
//
// Source: findings/10 §12:263 (ГАГ → ЗАСТОПОРЕНО out after 3 min → ОТСТОПОРЕНО →
// press КОНТРОЛЬ, НЕИСПРАВНО must NOT light); findings/01 p.347; subsystem-states §5.

export const SHILKA_STAB = Object.freeze({
  spinSeconds: 180, // ≤3 min ЗАСТОПОРЕНО → ОТСТОПОРЕНО (demo renderer may time-scale the dt)
});

// phase ∈ 'off' | 'spinup' | 'ready' | 'fault'
export function createStabState(overrides = {}) {
  return Object.assign({
    gagOn: false,        // ГАГ toggle (commander control)
    phase: 'off',
    spinT: 0,            // seconds the gyro has been spinning up
    controlFault: false, // КОНТРОЛЬ self-test failed → НЕИСПРАВНО lit
  }, overrides);
}

// Advance the gyro by dt seconds given the power buses {dc27, v115}.
export function stepStab(s, buses, dt) {
  const powered = !!(buses && buses.dc27 && buses.v115);
  if (!s.gagOn || !powered) {
    s.phase = 'off';
    s.spinT = 0;
    return s;
  }
  s.spinT = Math.min(SHILKA_STAB.spinSeconds, s.spinT + dt);
  if (s.spinT >= SHILKA_STAB.spinSeconds) {
    s.phase = s.controlFault ? 'fault' : 'ready';
  } else {
    s.phase = 'spinup';
  }
  return s;
}

// Stabilization is valid (ОТСТОПОРЕНО lit, no fault).
export function gagReady(s) {
  return s.phase === 'ready' && !s.controlFault;
}

// Fire-on-move requires a ready gyro (else fire from a halt only).
export function fireOnMoveOk(s) {
  return gagReady(s);
}
