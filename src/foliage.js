// foliage.js — pure, THREE-free helpers for the "soft-cover vegetation" system (tree canopies, bushes,
// fallen crowns, saplings). Kept dependency-free so the subtle bits (the Y-gate that makes a high canopy
// harmless; the near-camera fade ramp) are node-testable. Consumed by world.js (slow), forestdemo.js
// (fade gating). See docs/superpowers/specs/2026-06-21-enterable-foliage-design.md.

// Is the body column [feetY, headY] at (x,z) inside ANY `thicket`-flagged box (ground-level foliage you
// push THROUGH — bush / sapling / fallen crown)? This drives the SLOW only; it is a STRICT SUBSET of
// `foliage` (which also covers tall overhead crowns used for shoot/conceal but NOT slow — a wide crown
// AABB dips low at its drooping edges and would over-slow bodies 10 m away under clear head height).
// Two gates keep it honest: `thicket` excludes overhead crowns, and the Y test excludes anything your
// body column doesn't actually overlap. `boxes` is the broad-phase set (e.g. grid.queryAABB).
export function inThicket(boxes, x, z, feetY, headY) {
  for (const b of boxes) {
    if (!b.thicket) continue;
    if (x < b.min.x || x > b.max.x || z < b.min.z || z > b.max.z) continue;
    if (headY <= b.min.y || feetY >= b.max.y) continue;   // body must overlap the leaf volume in Y
    return true;
  }
  return false;
}

// Near-camera leaf fade: alpha for a fragment `d` metres from the camera. 0 at/below `near` (dissolved at
// the lens), 1 at/above `far` (solid) — a smoothstep between. Mirrors the GLSL `smoothstep(near,far,d)`
// injected into the foliage material, so the ramp is unit-testable on the CPU side.
export function foliageFade(d, near, far) {
  if (d <= near) return 0;
  if (d >= far) return 1;
  const t = (d - near) / (far - near);
  return t * t * (3 - 2 * t);
}
