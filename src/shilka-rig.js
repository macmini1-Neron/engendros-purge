// shilka-rig.js -- ЗСУ-23-4 GLB auto-rig: a PURE bbox part-classifier + a THREE re-parenter.
// The classifier is the source of truth shared with tools/shilka-rig-view.html (dev viewer).
// classifyShilkaPart works in the GLTFLoader-native (Y-up) space, the same space the viewer renders.

export const SHILKA_RIG_GROUPS = Object.freeze(['hull', 'track', 'wheel', 'sprocket', 'turret', 'gun', 'radar', 'antenna']);

// centre (cx,cy,cz) + size (sx,sy,sz) of a mesh's world AABB, model loaded raw (front = -Z).
export function classifyShilkaPart(cx, cy, cz, sx, sy, sz) {
  // low running gear
  if (sx < 0.30 && cy < 0.65 && sy >= 0.45 && sz >= 0.45 && sz < 0.75) return 'wheel';
  if (sx < 0.30 && cy < 0.65 && sy >= 0.30 && sy < 0.48) return 'sprocket';
  if (sz > 3.5 && cy < 0.60 && sx < 0.6) return 'track';
  // whip antennas: tall + super-thin verticals -> own physics rig (NOT radar)
  if (sx < 0.14 && sz < 0.14 && sy > 0.60) return 'antenna';
  // 23 mm barrels: long in Z, thin both ways, at turret height
  if (sz > 1.0 && cy >= 1.05 && cy <= 1.6 && sx < 0.5 && sy < 0.5) return 'gun';
  // radar gun-dish drum: rear-top cluster only
  if (cy > 1.70 && cz > 0.45) return 'radar';
  // turret vs hull-deck: central compact = turret; side sponsons/fenders/engine deck = hull
  if (cy >= 1.0) {
    if (Math.abs(cx - (-0.22)) > 0.65) return 'hull';
    return 'turret';
  }
  return 'hull';
}
