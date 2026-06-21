// util.js — math helpers, RNG, and a voxel mesh builder used by map / enemies / weapons.
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothDamp = (cur, target, vel, smooth, dt) => {
  // critically-damped spring toward target; returns [value, vel]
  const omega = 2 / Math.max(0.0001, smooth);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel + omega * change) * dt;
  const newVel = (vel - omega * temp) * exp;
  const newVal = target + (change + temp) * exp;
  return [newVal, newVel];
};
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const TAU = Math.PI * 2;
export const deg = (d) => (d * Math.PI) / 180;

// Deterministic-ish RNG (mulberry32). Seeded so the world is stable per run.
export function makeRNG(seed = 1337) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rng = makeRNG(0xC0FFEE);
export const randRange = (lo, hi, r = rng) => lo + (hi - lo) * r();
export const randInt = (lo, hi, r = rng) => Math.floor(lo + (hi - lo + 1) * r());
export const choice = (arr, r = rng) => arr[Math.floor(r() * arr.length)];
export const chance = (p, r = rng) => r() < p;

// ---------------------------------------------------------------------------
// MeshBuilder — accumulate boxes (with rotation + per-vertex color) and merge
// into a single BufferGeometry. One mesh, one draw call. Used everywhere to
// keep the "voxel / low-poly pixel" look cheap.
// ---------------------------------------------------------------------------
const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _euler = new THREE.Euler();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
  }

  // Add an axis-aligned (optionally rotated) box centered at (x,y,z).
  // color: hex number. opts: { rx, ry, rz } rotation in radians, { tint } jitter.
  box(w, h, d, x, y, z, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this.geo(geo, x, y, z, color, opts);
    geo.dispose();
    return this;
  }

  // Add an arbitrary geometry (e.g. cylinder) transformed into place.
  geo(geometry, x, y, z, color, opts = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    _euler.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
    _m4.makeRotationFromEuler(_euler);
    if (opts.sx || opts.sy || opts.sz) {
      _m4.scale(_v.set(opts.sx || 1, opts.sy || 1, opts.sz || 1));
    }
    if (opts.align) { // orient local +Y along the given normal vector (applied AFTER rx/ry/rz, before translation)
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), opts.align.clone().normalize());
      _m4.premultiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
    }
    _m4.setPosition(x, y, z);
    _m3.getNormalMatrix(_m4);

    const p = g.attributes.position;
    const n = g.attributes.normal;
    const u = g.attributes.uv;

    _c.set(color);
    const tint = opts.tint || 0;
    let r = _c.r, gg = _c.g, b = _c.b;
    if (tint) {
      const j = (Math.random() - 0.5) * tint;
      r = clamp(r + j, 0, 1); gg = clamp(gg + j, 0, 1); b = clamp(b + j, 0, 1);
    }

    for (let i = 0; i < p.count; i++) {
      _v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(_m4);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(_m3).normalize();
      this.nor.push(_v.x, _v.y, _v.z);
      if (u) this.uv.push(u.getX(i), u.getY(i)); else this.uv.push(0, 0);
      this.col.push(r, gg, b);
    }
    if (g !== geometry) g.dispose();
    return this;
  }

  // Merge another builder's data in (already in local space). Uses concat, NOT push(...spread): a big
  // tree's pos array is ~tens of thousands of floats and `push(...arr)` spreads each element as a call
  // argument → RangeError past the engine's arg-count cap (~65k). concat takes the array whole, no cap.
  merge(other) {
    this.pos = this.pos.concat(other.pos);
    this.nor = this.nor.concat(other.nor);
    this.uv = this.uv.concat(other.uv);
    this.col = this.col.concat(other.col);
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  get vertexCount() { return this.pos.length / 3; }
}

// Standard material used for all voxel meshes (vertex-colored, flat-ish shaded).
export function voxelMaterial(opts = {}) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: false,
    ...opts,
  });
}

// Foliage material that DISSOLVES near the camera: a fragment within `near` m of the lens fades to
// transparent, fully opaque by `far` m — so leaves at your face open up while the rest of the crown (and
// all wood, which uses a plain opaque material) stay solid voxels. Injected via onBeforeCompile using the
// built-in `cameraPosition` uniform (auto-updated by the renderer). Used on the 0–2 leaf meshes the camera
// is inside (forestdemo fade gating swaps to/from this shared instance) — never all trees, so the
// transparent-queue cost stays bounded. See docs/superpowers/specs/2026-06-21-enterable-foliage-design.md.
export function foliageFadeMaterial(near = 0.4, far = 2.2) {
  const m = voxelMaterial({ transparent: true, depthWrite: false });
  const N = near.toFixed(3), F = far.toFixed(3);
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFolWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vFolWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFolWPos;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a *= smoothstep(' + N + ', ' + F + ', distance(vFolWPos, cameraPosition));');
  };
  return m;
}

// Quick color helpers
export const hex = (h) => new THREE.Color(h);
export function shade(color, amt) {
  const c = new THREE.Color(color);
  c.r = clamp(c.r + amt, 0, 1);
  c.g = clamp(c.g + amt, 0, 1);
  c.b = clamp(c.b + amt, 0, 1);
  return c.getHex();
}

// Object pool helper
export class Pool {
  constructor(factory, reset) {
    this.factory = factory;
    this.reset = reset;
    this.free = [];
    this.active = [];
  }
  get() {
    const o = this.free.pop() || this.factory();
    this.active.push(o);
    return o;
  }
  release(o) {
    const i = this.active.indexOf(o);
    if (i >= 0) this.active.splice(i, 1);
    if (this.reset) this.reset(o);
    this.free.push(o);
  }
}

// --- gameplay RNG (unseeded) + ray/AABB — moved from game.js during the module split ---

// --- gameplay RNG (non-deterministic; map gen uses a seeded rng) ---
export const rr = (lo, hi) => lo + (hi - lo) * Math.random();
export const ri = (lo, hi) => Math.floor(lo + (hi - lo + 1) * Math.random());
export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const chc = (p) => Math.random() < p;
export function weightedPick(entries) {
  let total = 0; for (const e of entries) total += e.w;
  let r = Math.random() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return e.v; }
  return entries[entries.length - 1].v;
}

// ---------------------------------------------------------------------------
// Ray vs AABB (slab). Returns forward entry distance >=0, or null.
// ---------------------------------------------------------------------------
export function rayAABB(ox, oy, oz, dx, dy, dz, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  if (Math.abs(dx) < 1e-9) { if (ox < min.x || ox > max.x) return null; }
  else { let a = (min.x - ox) / dx, b = (max.x - ox) / dx; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  if (Math.abs(dy) < 1e-9) { if (oy < min.y || oy > max.y) return null; }
  else { let a = (min.y - oy) / dy, b = (max.y - oy) / dy; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  if (Math.abs(dz) < 1e-9) { if (oz < min.z || oz > max.z) return null; }
  else { let a = (min.z - oz) / dz, b = (max.z - oz) / dz; if (a > b) { const s = a; a = b; b = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); if (tmin > tmax) return null; }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : 0;
}
