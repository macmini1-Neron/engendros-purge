// shilka-crew.js -- pure seat/crew data + occupancy logic for the ЗСУ-23-4 «Shilka».
// ZERO THREE/DOM imports. The adapter (shilka.js) and the netcode (mp.js) both use this as the single
// source of seat truth, so the rules live in one tested place. Mirrors the project's pure-core style
// (shilka-drive.js): deterministic, side-effect-free, returns new arrays rather than mutating.

// Authentic ЗСУ-23-4 crew of four. Seat 0 (driver) sits isolated in the front hull — he cannot move
// to another seat and may only climb out at a stop. Seats 1-3 are the turret crew, side by side.
export const SHILKA_SEATS = Object.freeze([
  Object.freeze({ id: 0, role: 'driver',    ru: 'Механик-водитель',   driver: true,  turret: false }),
  Object.freeze({ id: 1, role: 'commander', ru: 'Командир установки', driver: false, turret: true  }),
  Object.freeze({ id: 2, role: 'gunner',    ru: 'Наводчик',           driver: false, turret: true  }),
  Object.freeze({ id: 3, role: 'range',     ru: 'Оператор дальности', driver: false, turret: true  }),
]);

export const SHILKA_SEAT_COUNT = SHILKA_SEATS.length;
export const SHILKA_DRIVER_SEAT = 0;
export const SHILKA_DISMOUNT_SPEED_EPS = 0.25; // m/s — below this the driver may climb out

export function isDriverSeat(seat) { return seat === SHILKA_DRIVER_SEAT; }

// Which seat (if any) this peer occupies; -1 if none.
export function seatOf(seats, peerId) {
  for (let i = 0; i < seats.length; i++) if (seats[i] === peerId) return i;
  return -1;
}

// Resolve a seat mount/dismount request against the current occupancy. Pure: returns a NEW `seats`
// array (occupant peerId per index, null = empty) and whether the request was accepted.
//   seats      : array length SHILKA_SEAT_COUNT of peerId|null
//   seat       : 0..3 requested seat
//   peerId     : who is asking
//   want       : 'mount' | 'dismount'
//   opts.speed : current vehicle speed (m/s) — the driver may only dismount near a stop
//   opts.force : bypass the driver's stop gate (death/reset must always eject the crew)
// Rules: mount only an empty seat, and only if you hold NO other seat (the driver is isolated and any
// role change is an explicit dismount-then-remount, per the manual); dismount only your own seat; the
// driver's dismount is refused while the vehicle is moving (unless forced).
export function resolveSeatClaim(seats, seat, peerId, want, opts = {}) {
  const next = seats.slice();
  if (!Number.isInteger(seat) || seat < 0 || seat >= SHILKA_SEAT_COUNT) return { seats: next, ok: false };
  if (peerId == null) return { seats: next, ok: false };

  if (want === 'mount') {
    const cur = seatOf(next, peerId);
    if (cur === seat) return { seats: next, ok: true };       // already seated there (idempotent)
    if (cur !== -1) return { seats: next, ok: false };        // holds another seat → must dismount first
    if (next[seat] != null) return { seats: next, ok: false }; // occupied by someone else
    next[seat] = peerId;
    return { seats: next, ok: true };
  }

  if (want === 'dismount') {
    if (next[seat] !== peerId) return { seats: next, ok: false }; // not your seat
    if (isDriverSeat(seat) && !opts.force && Math.abs(opts.speed || 0) > SHILKA_DISMOUNT_SPEED_EPS) {
      return { seats: next, ok: false }; // driver can't bail while rolling (unless forced — death/reset)
    }
    next[seat] = null;
    return { seats: next, ok: true };
  }

  return { seats: next, ok: false };
}
