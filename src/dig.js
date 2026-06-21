// dig.js — DEFORMATION FIELD for terrain excavation (explosion craters + shovel pits). PURE LOGIC.
//
// Mirrors terrain.js / destruct.js: NO `import 'three'`, NO DOM, NO per-call RNG — every export
// here runs under `node --test`. The browser-side coordinator (chunk remesh, support scan, co-op
// wiring) lives in src/dig-manager.js; this file is only the math + storage so it can be unit-tested
// AND imported by the THREE-free sim-worker.
//
// ── HOW IT PLUGS IN ────────────────────────────────────────────────────────────────────────────
// terrain.js's terrainHeightAt(x,z) adds `deformField.deformAt(x,z)` to the base height (a no-op +0
// when the field is empty). A crater is a NEGATIVE Gaussian — the exact mirror of the positive
// Gaussian hills demoHeight() already sums — so lowering the ground reuses the same continuous, C1
// field, and every collision / AI / molotov-settle that reads terrainHeightAt follows the hole for
// free (there is no height cache anywhere in the engine).
//
// ── CO-OP DETERMINISM ──────────────────────────────────────────────────────────────────────────
// terrain.js promises terrainHeightAt is a pure function of (x,z) so co-op clients reconstruct
// enemy / remote / ghost-projectile Y locally. A DeformField is MUTABLE, which would break that —
// UNLESS every mutation is replayed identically on every peer. It is: the host owns digging, ships
// each primitive over an ordered channel, and late-joiners get the whole list (serialize/
// deserialize/applySerialized). Given an identical primitive list applied in the same order,
// deformAt is again a pure function of (x,z). The contract is unchanged; its precondition just
// widens from "seed fixed at construction" to "seed + host-ordered deform list".

// Bedrock floor: terrain may never drop more than this at any (x,z). Kept SHALLOW on purpose — combined
// with the wide minimum crater/pit radius below, every dug slope stays well under the 35° walk-limit, so
// you can ALWAYS climb out (no inescapable holes). This is the master "escapability" knob.
export const MAX_DIG = 1.0;
export const DEFORM_CAP = 256;   // max live primitives; over this, add() evicts the oldest (deterministically).
export const MIN_DIG_R = 1.6;    // floor on every primitive's radius → wide, gentle bowls (walkable even at MAX_DIG).
const WALK_K = 0.7;              // per-primitive depth ≤ WALK_K·r → max wall slope ≈ atan(0.7/√e) ≈ 23° « the 35° walk-limit.

const CELL = 12;                 // spatial-hash cell size (m). Each primitive is bucketed into every cell its
                                 // support disc's AABB overlaps, so deformAt reads EXACTLY one bucket (O(1)).
const GAUSS_SUPPORT = 3.8;       // support radius = 3.8*r: covers the bowl (~0 past 3σ) AND the ejecta
                                 // ring (centred at 2.2r). Past it a primitive contributes EXACTLY 0.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Crater geometry from a blast radius. PURE — node-testable, identical on host+client so a relayed
// 'boom' carves the same hole. Deliberately a MILD cosmetic scuff ("you shot the ground"): the real
// building damage is the blast hitting cells (demobuilding/BuildingDestruct.applyBlast), NOT the crater —
// so even a bazooka only dents the dirt ~0.3 m, wide and shallow (always walkable, never undermines on
// its own). Returns null for a non-positive radius (caller skips the carve).
export function craterShape(radius) {
  if (!(radius > 0)) return null;
  const depth = clamp(radius * 0.06, 0.12, 0.4);   // shallow dent, capped at 0.4 m
  const r = Math.max(radius * 0.5, MIN_DIG_R);      // wide bowl → gentle, walkable slope
  return { r, depth, lip: depth * 0.15 };           // tiny ejecta rim
}

// Effective support radius. Beyond 3.8*r a primitive contributes EXACTLY zero — this hard truncation
// is the field's defined behaviour (a few-mm seam at the very edge), and it's what makes the spatial
// hash bit-exact vs. a brute-force sum (see deform.test).
function primSupport(p) { return GAUSS_SUPPORT * p.r; }

// Signed height a single primitive contributes at (x,z): a negative Gaussian bowl (σ = r) plus an
// optional positive ejecta ring piled JUST OUTSIDE the bowl (peak at 2.2r, where the bowl has faded).
// Returns 0 beyond the support radius (p._s2 = support²).
function contrib(p, x, z) {
  const dx = x - p.x, dz = z - p.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > p._s2) return 0;
  let h = -p.depth * Math.exp(-d2 / (2 * p.r * p.r));
  if (p.lip > 0) {
    const w = p.r * 0.5;                      // ejecta-ring half-width
    const e = (Math.sqrt(d2) - p.r * 2.2) / w;
    h += p.lip * Math.exp(-0.5 * e * e);
  }
  return h;
}

export class DeformField {
  constructor(opts = {}) {
    this.cell = opts.cell || CELL;
    this.cap = opts.cap || DEFORM_CAP;
    this.maxDig = opts.maxDig != null ? opts.maxDig : MAX_DIG;
    this._list = [];            // primitives in insertion order (oldest = lowest id = _list[0]).
    this._buckets = new Map();  // "cx,cz" -> primitive[]
    this._id = 0;
  }

  get count() { return this._list.length; }

  _key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }

  // Iterate the cell keys whose AABB the primitive's support disc overlaps.
  _cellsFor(p, fn) {
    const sup = primSupport(p), c = this.cell;
    const x0 = Math.floor((p.x - sup) / c), x1 = Math.floor((p.x + sup) / c);
    const z0 = Math.floor((p.z - sup) / c), z1 = Math.floor((p.z + sup) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) fn(cx + ',' + cz);
  }

  _bucketIn(p) {
    this._cellsFor(p, (key) => {
      let b = this._buckets.get(key);
      if (!b) this._buckets.set(key, (b = []));
      b.push(p);
    });
  }

  _bucketOut(p) {
    this._cellsFor(p, (key) => {
      const b = this._buckets.get(key);
      if (!b) return;
      const i = b.indexOf(p);
      if (i >= 0) b.splice(i, 1);
      if (b.length === 0) this._buckets.delete(key);
    });
  }

  // Signed height offset at (x,z): ≤0 dug, ≥0 ejecta lip, clamped to ≥ -maxDig (bedrock).
  // FAST PATH: an empty field returns 0 before any hashing, so undug maps pay one length check.
  deformAt(x, z) {
    if (this._list.length === 0) return 0;
    const b = this._buckets.get(this._key(x, z));
    if (!b) return 0;
    let sum = 0;
    for (let i = 0; i < b.length; i++) sum += contrib(b[i], x, z);
    return sum < -this.maxDig ? -this.maxDig : sum;
  }

  // Add a primitive {x,z,r,depth,lip}. Returns { stored, removed }: stored = the primitive now in
  // the field, removed = an evicted primitive (over cap) or null — both reported so the caller can
  // re-mesh the right chunks. Deterministic: over cap it always evicts the oldest, so two peers
  // replaying the same ordered stream reach byte-identical fields. (Merge-nearest is a future
  // refinement; evict-oldest is simpler and the cap is rarely reached in real play.)
  add(p) {
    // Escapability invariant: widen every primitive to MIN_DIG_R AND cap its depth to WALK_K·r, so its
    // walls never exceed ~23° — no caller can sneak in a narrow/steep/inescapable pit. (Stacked shovel
    // scoops still deepen, because same-r Gaussians sum to a deeper same-r Gaussian, capped at MAX_DIG.)
    const r = Math.max(p.r || 0, MIN_DIG_R);
    const prim = { x: p.x, z: p.z, r, depth: Math.min(p.depth || 0, WALK_K * r), lip: p.lip || 0, id: this._id++ };
    const sup = primSupport(prim);
    prim._s2 = sup * sup;                 // cached support² for the truncation gate in contrib()
    let removed = null;
    if (this._list.length >= this.cap) {
      removed = this._list.shift();
      this._bucketOut(removed);
    }
    this._list.push(prim);
    this._bucketIn(prim);
    return { stored: prim, removed };
  }

  // ── serialization (co-op late-join + worker init) ──────────────────────────────────────────────
  serialize() { return this._list.map((p) => ({ x: p.x, z: p.z, r: p.r, depth: p.depth, lip: p.lip })); }

  // Bulk-load a serialized list in order (no per-item cap churn beyond add()'s own). Used by a
  // late-joiner / the worker to reconstruct the field state.
  applySerialized(arr) { for (let i = 0; i < arr.length; i++) this.add(arr[i]); }

  static deserialize(arr, opts) { const f = new DeformField(opts); if (arr) f.applySerialized(arr); return f; }

  clear() { this._list.length = 0; this._buckets.clear(); this._id = 0; }
}

// Pure support predicate. Given the (already-deformed) terrainHeightAt, an object's footprint AABB
// {minx,minz,maxx,maxz} and the Y its base sits at, return true when the ground has been dug out
// from under enough of it to drop it. Samples 5 points (4 corners + centre); "undermined" when at
// least `frac` of them now sit more than `gap` metres below the base.
export function isUndermined(terrainHeightAt, fp, baseY, gap = 0.5, frac = 0.6) {
  const xs = [fp.minx, fp.maxx, fp.minx, fp.maxx, (fp.minx + fp.maxx) * 0.5];
  const zs = [fp.minz, fp.minz, fp.maxz, fp.maxz, (fp.minz + fp.maxz) * 0.5];
  let under = 0;
  for (let i = 0; i < 5; i++) if (terrainHeightAt(xs[i], zs[i]) < baseY - gap) under++;
  return under / 5 >= frac;
}
