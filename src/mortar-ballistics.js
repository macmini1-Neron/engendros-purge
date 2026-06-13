// mortar-ballistics.js — pure indirect-fire ballistics for the 82-ПМ-37 co-op mortar.
//
// ZERO deps (no THREE, no DOM) → node-testable in isolation, and co-op-DETERMINISTIC:
// the host picks the `seed` ONCE at fire time and ships it in the fire grant, so every
// client derives the identical impact point (never predict damage client-side).
//
// All firing-table tuning lives HERE. The heading convention matches src/bearing.js
// (azimuth 0 = +Z grid-north, increasing CW → +X east), so firingDir(φ) feeds
// dirToMils(dx,dz) directly: dirToMils(sin φ, cos φ) === φ in mils.

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;

// ── tube envelope + firing table (sourced floor +45°; rest sits ≈ +52°) ───────
export const ELEV_MIN_DEG = 45;   // tube cannot depress below +45° (НСД-40 floor)
export const ELEV_MAX_DEG = 85;   // max elevation
// Range nerfed hard from the realistic 80–600 m: the game's enemies only spawn/render in a tight
// ring around the player, so long lobs fell into empty terrain. 24–150 m keeps impacts in the fight.
export const RANGE_MIN = 24;      // m — at MAX elevation (steepest lob)
export const RANGE_MAX = 150;     // m — at MIN elevation (flattest)
export const AMMO_MAX = 12;       // finite rounds per emplacement
export const RELOAD_S = 3.5;      // drop-load cadence between rounds (s)
export const HE_RADIUS = 8;       // HE burst radius (m)
export const HE_DMG = 180;        // HE peak damage at burst centre

// `elevation`-rig hinge endpoints (rad), from models/mortar-82pm37 spec rig.range.
// The authored rest tube (+52°) is rig.x 0; +45° → +0.13, +85° → −0.58.
// SIGN is the one thing only verifiable in-browser — flip these two if the tube
// tilts the wrong way when W/S is pressed (see plan step 4).
export const RIG_X_AT_ELEV_MIN = 0.13;   // +45°
export const RIG_X_AT_ELEV_MAX = -0.58;  // +85°

// ── elevation ⇄ range (high-angle register: higher angle = SHORTER range) ─────
// Linear v1; a sin(2θ) firing curve is the realistic refinement (deferred).
export function elevToRange(elevRad) {
  const t = clamp((elevRad / D2R - ELEV_MIN_DEG) / (ELEV_MAX_DEG - ELEV_MIN_DEG), 0, 1);
  return lerp(RANGE_MAX, RANGE_MIN, t);   // 45° → 150 m, 85° → 24 m
}
export function rangeToElev(range) {
  const t = clamp((RANGE_MAX - range) / (RANGE_MAX - RANGE_MIN), 0, 1);
  return (ELEV_MIN_DEG + t * (ELEV_MAX_DEG - ELEV_MIN_DEG)) * D2R;
}

// elevation angle (rad) → the `elevation` rig's rotation.x to apply.
export function elevToRigX(elevRad) {
  const t = clamp((elevRad / D2R - ELEV_MIN_DEG) / (ELEV_MAX_DEG - ELEV_MIN_DEG), 0, 1);
  return lerp(RIG_X_AT_ELEV_MIN, RIG_X_AT_ELEV_MAX, t);
}

// world firing direction for heading φ (rad) — matches the bearing.js datum.
export function firingDir(phiRad) {
  return { dx: Math.sin(phiRad), dz: Math.cos(phiRad) };
}

// gameplay arc shaping (NOT real physics — tuned for a readable lob, variable-dt safe).
export function timeOfFlight(range) { return 3.5 + range / 100; }     // ~4.3 s @80 … 9.5 s @600
export function apexHeight(range) { return clamp(range * 0.35, 20, 120); }

// deterministic radial dispersion (CEP) from a 32-bit seed — uniform over a disc of
// radius σ (so |offset| ≤ σ, cleanly bounded). σ grows with range. mulberry32 is inlined
// (pure; util.js's RNG drags in THREE). Returns {dx,dz,sigma}.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function dispersion(seed, range) {
  const rng = mulberry32(seed >>> 0);
  const sigma = clamp(range * 0.02, 1.5, 7);     // ~1.5–7 m CEP
  const r = sigma * Math.sqrt(rng());            // uniform over the disc → |r| ≤ σ
  const ang = rng() * TAU;
  return { dx: Math.cos(ang) * r, dz: Math.sin(ang) * r, sigma };
}

// impact GROUND point: mortar (mx,mz) → `range` along heading φ + dispersion.
// Returns {x,z}; the game layer fills y = world.terrainHeightAt(x,z).
// Deterministic in `seed` → identical on every client.
export function impactPoint(mx, mz, phiRad, range, seed) {
  const d = firingDir(phiRad);
  const disp = dispersion(seed, range);
  return { x: mx + d.dx * range + disp.dx, z: mz + d.dz * range + disp.dz };
}
