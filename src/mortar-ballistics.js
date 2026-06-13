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
// Range tied to the MAP scale + the spotter loop, NOT the solo enemy ring. The emplacement sits in the
// SW strongpoint (~-335,-308) of the 1000×1000 steppe; enemies render to the ~900 m fog and a forward
// spotter's enemy bubble (75–120 m around HIM) sits a few hundred metres out. 60–375 m covers the
// strongpoint approaches + that spotter bubble — still well past eyeball/auto-engage range, so the
// ЛПР-1 (reads 1–20 km) stays meaningful: a 280 m target you can't eyeball to the right elevation.
export const RANGE_MIN = 60;      // m — at MAX elevation (steepest lob; a realistic near dead-zone)
export const RANGE_MAX = 375;     // m — at MIN elevation (flattest); regional support, not whole-map
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
  return lerp(RANGE_MAX, RANGE_MIN, t);   // 45° → 375 m, 85° → 60 m
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
export function timeOfFlight(range) { return 2.8 + range / 150; }     // ~3.2 s @60 … ~5.3 s @375 (dramatic but not tedious)
export function apexHeight(range) { return clamp(range * 0.35, 20, 180); } // taller cap → long lobs arc high

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
  const sigma = clamp(range * 0.02, 1.5, 12);    // ~1.5–12 m CEP — long shots spread more, so spotter corrections matter
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
