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
// Returns the chosen candidate object, or null if none qualifies.
export function nearestIgnitable(from, candidates, radius, isBlocked) {
  const r2 = radius * radius;
  // Gather in-radius, not-taken candidates with their squared horizontal distance.
  const inRange = [];
  for (const c of candidates) {
    if (c.taken) continue;
    const dx = c.cx - from[0], dz = c.cz - from[2];
    const d2 = dx * dx + dz * dz;
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
