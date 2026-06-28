// fire-spread.js — PURE spread-target selection (no THREE, no DOM → node-testable).
//
// The fire system's one piece of non-trivial decision logic: given a burning source at
// `from` and a list of candidate flammables, pick the NEAREST candidate that is (a) within
// `radius`, (b) not already taken, and (c) not occluded by a wall. The occlusion test is
// injected as `isBlocked(candidate)` so this module stays free of THREE / world geometry
// and can be unit-tested with a stub. Horizontal (x,z) distance only — fire creeps along
// the ground, it doesn't care about height deltas between a grass tuft and a tree crown.

// candidates: [{ cx, cz, taken, ... }]  (extra fields are preserved on the returned object)
// from:       [x, y, z]
// radius:     metres
// isBlocked:  (candidate) => boolean   — true if a wall occludes the line; optional.
// wind:       optional { x, z, speed } — unit XZ wind dir + speed (~0..1.3). When present, fire reaches
//             FARTHER downwind and crawls UPWIND (Far Cry 2): the squared distance is warped by the wind
//             alignment so the chosen target is wind-biased. Omitted → identical to the old pure behaviour.
// Returns the chosen candidate object, or null if none qualifies.
export function nearestIgnitable(from, candidates, radius, isBlocked, wind) {
  const r2 = radius * radius;
  const windy = wind && wind.speed > 0.01;
  // Gather in-radius, not-taken candidates with their (wind-warped) squared horizontal distance.
  const inRange = [];
  for (const c of candidates) {
    if (c.taken) continue;
    const dx = c.cx - from[0], dz = c.cz - from[2];
    let d2 = dx * dx + dz * dz;
    if (windy) {
      const dd = Math.sqrt(d2) || 1e-3, dot = (dx / dd) * wind.x + (dz / dd) * wind.z; // +1 downwind, −1 upwind
      d2 *= Math.max(0.18, 1 - 0.55 * wind.speed * dot);                                // downwind shrinks (reaches farther), upwind grows
    }
    if (d2 <= r2) inRange.push({ c, d2 });
  }
  // Nearest first; the LOS ray (the expensive part) is only cast as we walk outward, so a
  // wall-blocked near candidate doesn't hide a reachable farther one.
  inRange.sort((a, b) => a.d2 - b.d2);
  for (const { c } of inRange) {
    if (isBlocked && isBlocked(c)) continue;
    return c;
  }
  return null;
}
