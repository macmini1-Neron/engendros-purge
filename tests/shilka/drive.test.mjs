import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING, SHILKA_DRIVE_TUNING as T,
  SHILKA_GATE_SLOTS, gateGear, moveShiftLever } from '../../src/shilka-drive.js';

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
  assert.equal(after.grind, true, 'grind flag set when shifting under load');
});

test('unsynchronised 1st/ЗХ clash when engaged while rolling, even declutched', () => {
  // 1st & reverse have no synchro: engaging them above synchroSpeed clashes and does NOT change gear…
  const rolling = createDriveState({ gear: '3', speed: T.synchroSpeed + 2 });
  const clash1 = stepDrive(rolling, 1 / 60, I({ clutch: 0, gearReq: '1' }));
  assert.equal(clash1.gear, '3', '1st rejected (clash) while rolling, even with the clutch in');
  assert.equal(clash1.grind, true, 'grind flag set on the 1st-gear clash');
  const clashR = stepDrive(rolling, 1 / 60, I({ clutch: 0, gearReq: 'R' }));
  assert.equal(clashR.gear, '3', 'reverse rejected (clash) while rolling');
  // …but a synchronised gear (II–V) engages cleanly while rolling, declutched
  const synced = stepDrive(rolling, 1 / 60, I({ clutch: 0, gearReq: '4' }));
  assert.equal(synced.gear, '4', '4th (synchronised) engages cleanly while rolling');
  assert.equal(synced.grind, false, 'no grind on a synchronised shift');
  // …and 1st engages cleanly once nearly stopped
  const stopped = createDriveState({ gear: 'N', speed: 0.1 });
  const eng1 = stepDrive(stopped, 1 / 60, I({ clutch: 0, gearReq: '1' }));
  assert.equal(eng1.gear, '1', '1st engages near a stop');
});

test('gate slots map to the ГМ-575 double-H (each gear is the slot it claims)', () => {
  for (const [gear, slot] of Object.entries(SHILKA_GATE_SLOTS)) {
    assert.equal(gateGear(slot.gx, slot.gy), gear, `slot ${gear} resolves back to ${gear}`);
  }
  // neutral channel is N regardless of which rail you sit over
  assert.equal(gateGear(-1, 0), 'N');
  assert.equal(gateGear(1, 0.3), 'N', 'still in the channel below the engage threshold');
});

test('H-gate: rails can only be crossed through the neutral channel', () => {
  // seated in 4th (left rail, down): a sideways shove must NOT slide straight into 2nd/1st
  const seated = { gx: -1, gy: -1 };
  const shoved = moveShiftLever(seated, 1.0, 0); // big rightward push while seated
  assert.equal(shoved.gx, -1, 'stays locked to the left rail while seated');
  assert.equal(shoved.gear, '4', 'still in 4th — no illegal cross under load');
  // pull back to the neutral channel first, THEN cross to the mid rail, THEN push up into 3rd
  const toNeutral = moveShiftLever(seated, 0, 1);          // up into the channel
  assert.equal(toNeutral.gear, 'N');
  const crossed = moveShiftLever(toNeutral, 1.0, 0);       // slide fully onto the mid rail
  assert.equal(crossed.gear, 'N', 'still neutral while crossing');
  const intoThird = moveShiftLever(crossed, 0, 1);         // push up on the mid rail
  assert.equal(intoThird.gear, '3', 'reaches 3rd only after passing through neutral');
});

test('moveShiftLever clamps to the gate and ignores non-finite deltas', () => {
  const far = moveShiftLever({ gx: 0, gy: 0 }, 5, 5);
  assert.ok(far.gx <= 1 && far.gy <= 1, 'clamped inside the gate');
  const safe = moveShiftLever({ gx: 0, gy: 0 }, NaN, undefined);
  assert.deepEqual({ gx: safe.gx, gy: safe.gy }, { gx: 0, gy: 0 }, 'bad deltas are no-ops');
});

test('cannot launch a tall gear (3rd–5th) from a standstill — the engine lugs and stalls', () => {
  // floor it from a dead stop in 5th: far too tall, the V-6 bogs and dies even at full throttle
  let s = createDriveState({ gear: '5', speed: 0, engineOn: true });
  s = stepDrive(s, 1 / 60, I({ throttle: 1 }));
  assert.equal(s.engineOn, false, '5th-gear standstill launch lugs the engine dead');
  assert.equal(s.stalled, true);
  // 2nd is the manual's launch gear — pulls away cleanly from a stop, no stall
  let t = createDriveState({ gear: '2', speed: 0, engineOn: true });
  t = run(t, 30, 1 / 60, I({ throttle: 1 }));
  assert.equal(t.engineOn, true, '2nd launches without lugging');
  assert.ok(t.speed > 0, 'and actually moves off');
  // 1st (heavy-terrain crawler) also launches from a dead stop
  let u = createDriveState({ gear: '1', speed: 0, engineOn: true });
  u = run(u, 30, 1 / 60, I({ throttle: 1 }));
  assert.equal(u.engineOn, true, '1st (crawler) launches too');
  assert.ok(u.speed > 0);
});

test('starter restarts a stalled engine after the starter delay', () => {
  let s = createDriveState({ gear: 'N', engineOn: false, stalled: true, engineRpm: 0 });
  s = run(s, Math.ceil((T.starterSeconds + 0.05) * 60), 1 / 60, I({ gear: 'N', clutch: 0, starter: true }));
  assert.equal(s.engineOn, true);
  assert.equal(s.stalled, false);
  assert.ok(s.engineRpm >= T.idleRpm - 1);
});

test('deterministic: identical inputs produce identical state (with real movement)', () => {
  // gearReq:'1' actually engages the gear (a stray `gear` field is ignored), so this exercises the
  // integrator (speed/x/z/heading), suspension (pitch/roll/wheelOffsets) and rpm — not a neutral no-op.
  const init = createDriveState({ gear: '1' });
  const inp = I({ throttle: 0.4, steer: 0.3 });
  const ground = { L: [0.1, 0.05, 0, -0.05, -0.1, -0.15], R: [0.1, 0.05, 0, -0.05, -0.1, -0.15] };
  const a = run(init, 200, 1 / 60, inp, ground);
  const b = run(init, 200, 1 / 60, inp, ground);
  assert.deepEqual(a, b);
  assert.ok(a.x !== 0 || a.z !== 0, 'sanity: the vehicle actually moved');
});

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

test('full brake brings a moving vehicle to rest and never overshoots into reverse', () => {
  let s = createDriveState({ gear: '3', speed: 7.0 }); // ~25 km/h forward
  s = run(s, Math.ceil(7.0 / T.brakeDecel * 60) + 10, 1 / 60, I({ brake: 1 }));
  assert.equal(s.speed, 0, 'braking from forward stops at 0, does not reverse');
});

test('an unknown gear request is ignored and does not corrupt the gear', () => {
  let s = createDriveState({ gear: '2', speed: 4 });
  const after = stepDrive(s, 1 / 60, I({ clutch: 0, gearReq: '6' }));
  assert.equal(after.gear, '2', 'unknown gear leaves the current gear unchanged');
  assert.equal(after.grind, false, 'an unknown gear is dropped, not treated as a grind');
});

test('dt=0 is a no-op step (no movement, no NaN)', () => {
  const s0 = createDriveState({ gear: '1', speed: 5 });
  const s1 = stepDrive(s0, 0, I({ throttle: 1 }), flat());
  assert.equal(s1.x, s0.x);
  assert.equal(s1.z, s0.z);
  assert.equal(s1.speed, s0.speed);
  assert.ok(Number.isFinite(s1.pitch) && Number.isFinite(s1.heading), 'no NaN leaks at dt=0');
});
