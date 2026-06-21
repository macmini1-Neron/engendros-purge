// destructible-geom.js — pure (no THREE) geometry/id helpers for the destructible building
// runtime, split out so the yaw-correctness math and id scheme are node-testable. destructible.js
// (THREE) imports these; the class itself is verified in-browser.

import { rotYSteps } from './operators/_math.js';

const PANE_T = 0.08;   // minted thickness for a glass pane's collider AABB (panes carry no plan collider)

// Local AABB → WORLD AABB under a 90°-step yaw + translation. MUST match registry.placeBuilding
// exactly: the destruct core tests these min/max against the world-space ray/point from
// world.rayHit, so any mismatch makes a shot kill the wrong part. (k = yaw/90 mod 4.)
export function worldAABB(k, x, y, z, localMin, localMax) {
  const r = rotYSteps(k, localMin, localMax);
  return {
    min: [r.min[0] + x, r.min[1] + y, r.min[2] + z],
    max: [r.max[0] + x, r.max[1] + y, r.max[2] + z],
  };
}

// A glass pane has no collider in plan.prims (collide:false), so mint a thin LOCAL AABB from its
// plane dims. ry 0/180 ⇒ the plane faces ±Z (thin in z); ry 90/270 ⇒ faces ±X (thin in x).
export function paneAABB(prim, t = PANE_T) {
  const faceX = prim.ry === 90 || prim.ry === 270;
  const hx = faceX ? t / 2 : prim.w / 2;
  const hz = faceX ? prim.w / 2 : t / 2;
  const hy = prim.h / 2;
  return {
    min: [prim.x - hx, prim.y - hy, prim.z - hz],
    max: [prim.x + hx, prim.y + hy, prim.z + hz],
  };
}

// Stable, placement-encoded building id — identical on host + client (world-gen placement is
// deterministic), so co-op `bdestroy` routes unambiguously without a synced ordinal.
export function makeBid(specId, x, z, k) {
  return `${specId}@${Math.round(x)},${Math.round(z)},${k}`;
}

// A destruct part id is `${specPartId}:…`; resolve its source spec part to read an optional
// per-part `hpScale` (a tougher bunker wall vs a flimsy shed, same material). Default 1.
export function hpScaleFor(spec, partId) {
  const prefix = String(partId).split(':')[0];
  const part = (spec.parts ?? []).find((p) => (p.id ?? p.op) === prefix);
  return part?.hpScale ?? 1;
}

// Route a co-op `bdestroy {bid,…}` to its building among world.destructibles (which includes the
// demo). A bid-less message (old host) falls back to the sole building, or the demo by name.
export function routeBdestroy(destructibles, msg) {
  if (!msg) return null;
  const list = destructibles || [];
  if (msg.bid == null) return list.length === 1 ? list[0] : (list.find((b) => b.bid === 'demo') || null);
  return list.find((b) => b.bid === msg.bid) || null;
}
