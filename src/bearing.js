// bearing.js — the world AZIMUTH datum (single source of truth).
//
// One canonical heading convention for the whole game: azimuth 0 = grid-NORTH = +Z,
// increasing CLOCKWISE toward +X (east). Measured in Soviet угломер mils — 6000 per
// circle (деления угломера), printed "NN-NN" (big division - small division), e.g. 32-50.
// This matches the world-building modules (strongpoint.js / gatehouse.js: +X east, +Z north).
//
// Everything that shows or computes a bearing — the F3 overlay, the буссоль ПАБ-2А tool,
// the ННП-23 nightpost readout, and the future co-op mortar fire-mission — imports from HERE
// so there is exactly ONE datum. Pure scalar math, no THREE, no globals → identical on every
// client given the same inputs (player.yaw / world positions), so it is co-op-deterministic
// for free (no network sync needed for a self-facing read).
//
// Derivation of the sign (player forward vector, see player.js / console.js updateF3):
//   fwd = (-sin(yaw)·cosPitch, sin(pitch), -cos(yaw)·cosPitch)
//   east  = fwd.x = -sin(yaw);  north = fwd.z = -cos(yaw)
//   azimuth_rad = atan2(east, north) = atan2(fwd.x, fwd.z) ≡ wrap(yaw + π)
// Axis check: +Z(yaw=π)→00-00, +X(yaw=−π/2)→15-00, −Z(yaw=0)→30-00, −X(yaw=+π/2)→45-00.

// Pure leaf module — ZERO deps (like icons.js), so it is node-testable in isolation and can be
// imported anywhere without dragging in THREE. TAU is inlined deliberately for that reason.
const TAU = Math.PI * 2;
const MILS = 6000;

// wrap any mils value into [0, 6000).
export const wrap6000 = (m) => ((m % MILS) + MILS) % MILS;

// player/camera-style yaw (radians) → угломер mils.
export const yawToMils = (yaw) => wrap6000((yaw + Math.PI) / TAU * MILS);

// bearing of a world direction vector (dx = +X/east, dz = +Z/north) → угломер mils.
export const dirToMils = (dx, dz) => wrap6000(Math.atan2(dx, dz) / TAU * MILS);

// bearing FROM world point `from` TO world point `to` (anything with .x/.z) — gun→target,
// spotter→target. The future mortar fire-mission calls this; no new math needed there.
export const bearingMils = (from, to) => dirToMils(to.x - from.x, to.z - from.z);

// ground (XZ) range in metres between two world points — for fire-missions / call-outs.
export const rangeMeters = (from, to) => Math.hypot(to.x - from.x, to.z - from.z);

// угломер "NN-NN": big divisions (hundreds) - small divisions (units). 3250 → "32-50".
// Round THEN wrap: a heading a sliver short of north (e.g. 5999.7) must roll to "00-00",
// not round up to an off-scale "60-00" (угломер tops out at 59-99).
export function formatUglomer(mils) {
  const n = wrap6000(Math.round(mils));
  return `${String(Math.floor(n / 100)).padStart(2, '0')}-${String(n % 100).padStart(2, '0')}`;
}
