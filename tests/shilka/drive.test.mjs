import test from 'node:test';
import assert from 'node:assert/strict';
import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING, SHILKA_DRIVE_TUNING as T } from '../../src/shilka-drive.js';

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
