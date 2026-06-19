import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHILKA_SEATS, SHILKA_SEAT_COUNT, SHILKA_DRIVER_SEAT, SHILKA_DISMOUNT_SPEED_EPS,
  isDriverSeat, seatOf, resolveSeatClaim,
} from '../../src/shilka-crew.js';

const empty = () => new Array(SHILKA_SEAT_COUNT).fill(null);

test('the authentic 4-man crew: one isolated driver + three turret seats', () => {
  assert.equal(SHILKA_SEAT_COUNT, 4);
  assert.equal(SHILKA_SEATS[0].role, 'driver');
  assert.ok(SHILKA_SEATS[0].driver && !SHILKA_SEATS[0].turret, 'driver is isolated, not turret');
  assert.deepEqual(SHILKA_SEATS.slice(1).map((s) => s.role), ['commander', 'gunner', 'range']);
  assert.ok(SHILKA_SEATS.slice(1).every((s) => s.turret && !s.driver), 'seats 1-3 are turret crew');
  assert.ok(isDriverSeat(SHILKA_DRIVER_SEAT) && !isDriverSeat(2));
});

test('mounting an empty seat seats the peer', () => {
  const r = resolveSeatClaim(empty(), 2, 'alice', 'mount');
  assert.ok(r.ok);
  assert.equal(r.seats[2], 'alice');
  assert.equal(seatOf(r.seats, 'alice'), 2);
});

test('mounting the empty driver seat (0) succeeds, and a stopped driver leaves with no speed given', () => {
  const m = resolveSeatClaim(empty(), 0, 'alice', 'mount');
  assert.ok(m.ok && m.seats[0] === 'alice', 'driver seat boards');
  // opts omitted → speed defaults to 0 → the driver may dismount
  const d = resolveSeatClaim(m.seats, 0, 'alice', 'dismount');
  assert.ok(d.ok && d.seats[0] === null, 'no opts.speed defaults to a stop → dismount allowed');
});

test('a seat occupied by someone else is refused', () => {
  const seats = empty(); seats[2] = 'bob';
  const r = resolveSeatClaim(seats, 2, 'alice', 'mount');
  assert.equal(r.ok, false);
  assert.equal(r.seats[2], 'bob', 'occupant unchanged');
});

test('a peer already in a seat cannot grab a second (must dismount first)', () => {
  const seats = empty(); seats[0] = 'alice';                 // alice is the driver
  const r = resolveSeatClaim(seats, 2, 'alice', 'mount');     // tries to also take the gunner seat
  assert.equal(r.ok, false, 'one seat at a time — driver is isolated, no in-place swap');
  assert.equal(r.seats[0], 'alice');
  assert.equal(r.seats[2], null);
});

test('re-mounting your own seat is an idempotent accept', () => {
  const seats = empty(); seats[1] = 'alice';
  const r = resolveSeatClaim(seats, 1, 'alice', 'mount');
  assert.ok(r.ok);
  assert.equal(r.seats[1], 'alice');
});

test('dismounting your own seat frees it; another seat is refused', () => {
  const seats = empty(); seats[2] = 'alice';
  assert.ok(resolveSeatClaim(seats, 2, 'alice', 'dismount').ok);
  assert.equal(resolveSeatClaim(seats, 2, 'alice', 'dismount').seats[2], null);
  const other = resolveSeatClaim(seats, 1, 'alice', 'dismount'); // alice isn't in seat 1
  assert.equal(other.ok, false);
});

test('the driver cannot dismount while the vehicle is moving, but can at a stop', () => {
  const seats = empty(); seats[0] = 'alice';
  const moving = resolveSeatClaim(seats, 0, 'alice', 'dismount', { speed: SHILKA_DISMOUNT_SPEED_EPS + 1 });
  assert.equal(moving.ok, false, 'no bailing out at speed');
  assert.equal(moving.seats[0], 'alice');
  const stopped = resolveSeatClaim(seats, 0, 'alice', 'dismount', { speed: 0 });
  assert.ok(stopped.ok);
  assert.equal(stopped.seats[0], null);
});

test('a forced dismount ejects the driver even at speed (death/reset)', () => {
  const seats = empty(); seats[0] = 'alice';
  const r = resolveSeatClaim(seats, 0, 'alice', 'dismount', { speed: 10, force: true });
  assert.ok(r.ok, 'force bypasses the stop gate');
  assert.equal(r.seats[0], null);
});

test('a turret occupant may leave even while the vehicle is moving (only the driver is gated)', () => {
  const seats = empty(); seats[2] = 'alice';
  const r = resolveSeatClaim(seats, 2, 'alice', 'dismount', { speed: 5 });
  assert.ok(r.ok, 'turret crew can climb out any time');
  assert.equal(r.seats[2], null);
});

test('out-of-range seats and missing peer/verb are rejected without mutation', () => {
  assert.equal(resolveSeatClaim(empty(), 4, 'alice', 'mount').ok, false);
  assert.equal(resolveSeatClaim(empty(), -1, 'alice', 'mount').ok, false);
  assert.equal(resolveSeatClaim(empty(), 0, null, 'mount').ok, false);
  assert.equal(resolveSeatClaim(empty(), 0, 'alice', 'bogus').ok, false);
});

test('resolveSeatClaim never mutates the input array', () => {
  const seats = empty();
  const r = resolveSeatClaim(seats, 2, 'alice', 'mount');
  assert.equal(seats[2], null, 'caller array untouched');
  assert.notEqual(r.seats, seats, 'returns a fresh array');
});
