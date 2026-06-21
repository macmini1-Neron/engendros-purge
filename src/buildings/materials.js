// materials.js — the DESTRUCTION BRIDGE between buildgen visuals and physics (pure, node-testable).
//
// buildgen's palette.js is visual-only data (texture + 5 tones). destruct.js MATERIALS is the
// single source of PHYSICS (tier/hp/debris/sound/fuel), shared with forest + weapons. This module
// is the one place that links the two: a palette material name → its physical material spec, via
// the `phys` key each palette entry carries. Kept separate from palette.js so palette.js stays
// import-free pure data; this module is the only buildgen-pure file that imports destruct.js.
//
// A `null` (or absent) `phys` means a part in this material is NEVER destructible (signage). The
// validator (spec.js law 15) rejects a *cladding* part whose material has no phys bridge.

import { MATERIALS } from '../destruct.js';
import { BUILDING_PALETTE } from './palette.js';

// palette material name → destruct.js MATERIALS key, or null if non-destructible.
// Throws on an unknown palette name (a typo can't silently become indestructible).
export function physKeyOf(name) {
  const entry = BUILDING_PALETTE[name];
  if (!entry) {
    throw new Error(`buildgen materials: unknown palette material '${name}' (have: ${Object.keys(BUILDING_PALETTE).join(', ')})`);
  }
  const key = entry.phys ?? null;
  if (key != null && !MATERIALS[key]) {
    throw new Error(`buildgen materials: palette '${name}' bridges to phys '${key}' which is not in destruct.js MATERIALS`);
  }
  return key;
}

// palette material name → { tier, hp, debris, sound, fuel } from destruct.js MATERIALS, or null.
export function physSpecOf(name) {
  const key = physKeyOf(name);
  return key == null ? null : MATERIALS[key];
}

// True if a part in this palette material can be destroyed (has a phys bridge).
export function isDestructible(name) {
  return physKeyOf(name) != null;
}
