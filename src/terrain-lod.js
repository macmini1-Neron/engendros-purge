// src/terrain-lod.js — PURE LOD policy (no THREE → node-testable). Phase 3a.
//
// Distance-based level-of-detail for terrain chunks. index 0 = nearest = highest detail.
// LOD_RESOLUTIONS[i] is the per-chunk segment count at level i; LOD_BANDS[i] is the camera
// distance (metres, chunk-centre → camera) at which we step from level i to level i+1.
// Co-op note: LOD is a LOCAL render choice — never synced; it does NOT touch the heightfield,
// so two clients at different distances still agree on ground height (that comes from terrain.js).

export const LOD_RESOLUTIONS = [32, 16, 8]; // high → low; [0]=32 keeps current demo detail
export const LOD_BANDS = [110, 240];        // step 32→16 at 110 m, 16→8 at 240 m

// Returns the LOD index for `dist`. With `margin > 0`, applies hysteresis around `prev` (the
// chunk's current level) so a chunk hovering on a band edge does not flicker every frame: a
// change only commits once `dist` is past the relevant edge by `margin`. bands ascending;
// result in [0, bands.length].
export function pickLOD(dist, bands = LOD_BANDS, prev = 0, margin = 0) {
  let lvl = 0;
  while (lvl < bands.length && dist >= bands[lvl]) lvl++;
  if (margin > 0 && prev >= 0 && prev <= bands.length) {
    if (lvl > prev) {
      // going coarser: require dist >= (edge leaving prev) + margin, else hold prev
      if (!(prev < bands.length && dist >= bands[prev] + margin)) lvl = prev;
    } else if (lvl < prev) {
      // going finer: require dist < (edge entering prev) - margin, else hold prev
      const edge = bands[prev - 1];
      if (!(dist < edge - margin)) lvl = prev;
    }
  }
  return lvl;
}
