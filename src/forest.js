// forest.js — FOREST manager (Phase 6 of the playable-demo engine overhaul).
//
// Scatters region-native voxel trees + groundcover across the ?map=demo heightfield,
// gated by the terrain contract (terrainHeightAt / isPlaceable), and — critically —
// makes EVERY tree DESTRUCTIBLE + FLAMMABLE so the destruction core (Phase 7 building,
// Phase 8 fire, Phase 9 gunfire) can fell / burn / hole it. Mirrors EnemyManager's
// `this.world = game.world` wiring; only does anything when `world.hasTerrain`.
//
// ── RENDERING (bounded draw calls) ──────────────────────────────────────────────
// Each makeTree() returns a uniquely-seeded MERGED voxel geometry. To render hundreds
// of trees in a bounded number of draw calls we pre-build a small POOL of geometry
// VARIANTS per species and draw each variant with ONE THREE.InstancedMesh. Draw calls
// are then bounded by (species × variants), INDEPENDENT of the tree count — instancing
// is the perf win (vertex reuse + few submits). Per-instance yaw + scale jitter keeps
// the wood from looking cloned. Felling/burning a single tree is O(1): we zero that
// instance's matrix (hides it) and add a small one-off Mesh for the fallen/charred snag.
//
// ── DESTRUCTION CONTRACT (Phases 7/8/9 read this) ───────────────────────────────
// Each tree registers TWO linked AABBs over the standing trunk bole:
//   • tree.part — a destruct.makePart(id,'trunk',minArr,maxArr,hpScale) part-metadata
//     object (PLAIN [x,y,z] arrays, dmat/dhp/dpart/downer/dead) pushed to `forest.parts`.
//     A DestructRuntime built over forest.parts resolves hits/blasts/penetration on it.
//   • tree.box — a THREE.Vector3 collision box pushed to world.boxes + grid.addBox so
//     the player bumps the trunk and gunfire rayHit() returns it. It carries `downer`
//     (back-ref to the tree record), `dpart` and `dmat:'trunk'`, so a ray that hits the
//     box resolves straight to the tree → resolveHit(tree.part,w) → forest.fellTree(...).
// (Two reps because world.collide reads Vector3 .x/.y/.z while destruct reads arrays[i].
//  Both back-ref the tree, mirroring world.js's struct `{box, _ref}` fortification pattern.)
//
// Groundcover registers a lightweight 'grass' part (fuel>0) in forest.parts WITHOUT a
// collision box — so Phase 8 fire can enumerate the flammable front via flammableParts().
//
// Everything is SEEDED off the terrain seed → identical forest on every co-op peer.

import * as THREE from 'three';
import { makeRNG, voxelMaterial, clamp, TAU } from './util.js';
import { makeTree, SPECIES } from './props/generators/tree.js';
import { makeGrassTuft, makeShrub, makeFlowerPatch, makeBush } from './props/generators/groundcover.js';
import { makePart, MATERIALS, makeHinge, stepBody } from './destruct.js';

// Live (foliated) species placed in the wood. The damage-state snags ('deadBroken',
// 'burntCharred') are reached only via the damage override on fell/char, not scattered.
const LIVE_SPECIES = ['birch', 'poplar', 'scotsPine', 'oak', 'willow'];
// Species spawn weights — birch/pine dominate a forest-steppe stand; oak/willow rarer.
const SPECIES_WEIGHT = { birch: 0.34, scotsPine: 0.28, poplar: 0.16, oak: 0.12, willow: 0.10 };
const VARIANTS_PER_SPECIES = 4;     // geometry variants per species → bounds tree draw calls
const GAME_SCALE = 0.42;            // must match tree.js GAME_SCALE (heights/dia already baked)

// crush class (destruction spec §3): sapling = 1, birch/pine/poplar/willow = 2, oak = 3.
const SPECIES_CRUSH = { birch: 2, scotsPine: 2, poplar: 2, willow: 2, oak: 3 };
const CRUSH_HPSCALE = { 1: 0.35, 2: 1.0, 3: 2.2 };  // trunk hp multiplier by crush class

const SPAWN_CLEAR = 32;             // keep the player spawn ring (r≈28) + a margin tree-free
const TREE_MIN_DIST = 3.2;          // min spacing between trunks (m)

// Groundcover kinds — all flammable ('grass' material), instanced like trees.
const COVER_KINDS = [
  { key: 'grass',  make: makeGrassTuft,   variants: 4, scale: [0.8, 1.5], shadow: false, fp: 0.4, h: 0.85 },
  { key: 'shrub',  make: makeShrub,       variants: 3, scale: [0.9, 1.6], shadow: false, fp: 0.7, h: 0.8  },
  { key: 'flower', make: makeFlowerPatch, variants: 2, scale: [0.9, 1.2], shadow: false, fp: 0.55, h: 0.4 },
  { key: 'bush',   make: makeBush,        variants: 2, scale: [0.9, 1.3], shadow: false, fp: 0.95, h: 1.4 },
];

const ZERO_MAT = new THREE.Matrix4().makeScale(0, 0, 0);  // collapse an instance → hidden

export class Forest {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.engine.scene;

    this.trees = [];          // tree records (see fellTree / docstring for shape)
    this.cover = [];          // groundcover records
    this.parts = [];          // unified destructible+flammable part registry (Phase 7/8/9)
    this._instMeshes = [];     // InstancedMeshes (trees + cover) for cleanup
    this._falling = [];        // trees with an active FallingBody (ticked in update)
    this._nextId = 1;
    this.treeMat = voxelMaterial();   // one shared vertex-color material for all instances

    // Only the demo (heightfield) map grows a forest. Flat maps (arena/steppe) untouched.
    if (!this.world.hasTerrain || !this.world.terrain) return;
    try { this._build(); }
    catch (e) { console.warn('[forest] build failed — continuing without forest', e); }
  }

  // ── one-time scatter ──────────────────────────────────────────────────────────
  _build() {
    const terr = this.world.terrain;
    const HALF = this.world.HALF;
    const rng = makeRNG((terr.seed ^ 0x0f0e5701) >>> 0);   // seeded off terrain → co-op identical

    // 1. Pre-build geometry variant pools (one InstancedMesh per non-empty bucket).
    const treeVariants = {};   // species -> [{ geometry, height }]
    for (const sp of LIVE_SPECIES) {
      treeVariants[sp] = [];
      const sbase = (terr.seed * 131 + this._hashStr(sp)) >>> 0;
      for (let v = 0; v < VARIANTS_PER_SPECIES; v++) {
        const t = makeTree({ species: sp, seed: (sbase + v * 2654435761) >>> 0 });
        treeVariants[sp].push({ geometry: t.geometry, height: t.height });
      }
    }
    const coverVariants = {};  // key -> [geometry]
    for (const ck of COVER_KINDS) {
      coverVariants[ck.key] = [];
      for (let v = 0; v < ck.variants; v++) coverVariants[ck.key].push(ck.make(((terr.seed + 7) * 97 + this._hashStr(ck.key) + v * 40503) >>> 0));
    }

    // 2. Lay down clustered wood centres (believable stands, not a uniform grid).
    //    One stand sits on the big hill (60,-40); the rest scatter around the map.
    const clusters = [{ x: 60, z: -40, r: 34, dens: 1.15 }];
    const NUM_CLUSTERS = 6;
    for (let c = 0; c < NUM_CLUSTERS; c++) {
      const a = rng() * TAU, rad = 46 + rng() * (HALF - 70);
      clusters.push({ x: Math.cos(a) * rad, z: Math.sin(a) * rad, r: 18 + rng() * 22, dens: 0.7 + rng() * 0.5 });
    }

    // 3. Candidate generation with min-distance rejection (grid hash).
    const occ = new Map();   // cell -> [{x,z}]
    const cell = TREE_MIN_DIST;
    const tooClose = (x, z, minD) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell), m2 = minD * minD;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const arr = occ.get((cx + dx) + ',' + (cz + dz)); if (!arr) continue;
        for (const p of arr) { const ex = p.x - x, ez = p.z - z; if (ex * ex + ez * ez < m2) return true; }
      }
      return false;
    };
    const mark = (x, z) => { const k = Math.floor(x / cell) + ',' + Math.floor(z / cell); let a = occ.get(k); if (!a) occ.set(k, a = []); a.push({ x, z }); };

    const placeTrees = [];   // {x,y,z,species,variant,scale,yaw,sapling}
    const tryTree = (x, z) => {
      if (x * x + z * z < SPAWN_CLEAR * SPAWN_CLEAR) return;     // keep spawn clear
      if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) return;
      if (tooClose(x, z, TREE_MIN_DIST)) return;
      if (!terr.isPlaceable(x, z, 1.2, 'tree')) return;          // slope/keep-out gate
      const sapling = rng() < 0.13;
      const species = sapling ? (rng() < 0.5 ? 'birch' : 'scotsPine') : this._pickSpecies(rng);
      const variant = Math.floor(rng() * VARIANTS_PER_SPECIES);
      const scale = sapling ? (0.42 + rng() * 0.2) : (0.85 + rng() * 0.34);
      placeTrees.push({ x, y: terr.terrainHeightAt(x, z), z, species, variant, scale, yaw: rng() * TAU, sapling });
      mark(x, z);
    };
    // dense inside stands…
    for (const cl of clusters) {
      const target = Math.round(cl.r * cl.r * 0.05 * cl.dens);
      for (let i = 0; i < target * 3; i++) {
        const g = this._gauss(rng) * cl.r * 0.6, a = rng() * TAU;
        tryTree(cl.x + Math.cos(a) * Math.abs(g), cl.z + Math.sin(a) * Math.abs(g));
      }
    }
    // …and a light sprinkle of lone trees everywhere.
    for (let i = 0; i < 140; i++) tryTree((rng() * 2 - 1) * (HALF - 8), (rng() * 2 - 1) * (HALF - 8));

    // 4. Build the tree InstancedMeshes + destructible records, grouped by (species,variant).
    const groups = new Map();
    for (const p of placeTrees) { const k = p.species + ':' + p.variant; let a = groups.get(k); if (!a) groups.set(k, a = []); a.push(p); }
    const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const [key, list] of groups) {
      const [sp, vs] = key.split(':'); const v = +vs;
      const variant = treeVariants[sp][v];
      const im = new THREE.InstancedMesh(variant.geometry, this.treeMat, list.length);
      im.frustumCulled = false;          // instances span the map; the per-tree bound would mis-cull
      im.castShadow = false; im.receiveShadow = false;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        q.setFromAxisAngle(up, p.yaw);
        tmp.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        im.setMatrixAt(i, tmp);
        this._registerTree(p, variant, im, i);
      }
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im); this._instMeshes.push(im);
    }

    // 5. Groundcover — denser inside stands; small flammable 'grass' part, no collider.
    occ.clear();
    const placeCover = [];   // {x,y,z,kind,variant,scale}
    const tryCover = (x, z, kind) => {
      if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) return;
      if (tooClose(x, z, 0.9)) return;
      if (!terr.isPlaceable(x, z, 0, 'cover')) return;
      const ck = COVER_KINDS.find(c => c.key === kind);
      placeCover.push({ x, y: terr.terrainHeightAt(x, z), z, kind, variant: Math.floor(rng() * ck.variants), scale: ck.scale[0] + rng() * (ck.scale[1] - ck.scale[0]) });
      mark(x, z);
    };
    const coverTargets = { grass: 300, shrub: 64, flower: 30, bush: 18 };
    for (const ck of COVER_KINDS) {
      const n = coverTargets[ck.key];
      for (let i = 0; i < n; i++) {
        // 70% biased toward a random stand, 30% open ground.
        if (rng() < 0.7) { const cl = clusters[Math.floor(rng() * clusters.length)]; const a = rng() * TAU, d = Math.abs(this._gauss(rng)) * cl.r; tryCover(cl.x + Math.cos(a) * d, cl.z + Math.sin(a) * d, ck.key); }
        else tryCover((rng() * 2 - 1) * (HALF - 6), (rng() * 2 - 1) * (HALF - 6), ck.key);
      }
    }
    const cgroups = new Map();
    for (const p of placeCover) { const k = p.kind + ':' + p.variant; let a = cgroups.get(k); if (!a) cgroups.set(k, a = []); a.push(p); }
    for (const [key, list] of cgroups) {
      const [kind, vs] = key.split(':'); const v = +vs;
      const def = coverVariants[kind][v];
      const im = new THREE.InstancedMesh(def.geometry, def.material, list.length);
      im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
      const ck = COVER_KINDS.find(c => c.key === kind);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        q.setFromAxisAngle(up, (this._hash(p.x, p.z) % 628) / 100);
        tmp.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
        im.setMatrixAt(i, tmp);
        // flammable grass part (no collision box) — Phase 8 fire reads forest.flammableParts().
        const id = this._nextId++;
        const min = [p.x - ck.fp, p.y, p.z - ck.fp], max = [p.x + ck.fp, p.y + ck.h * p.scale, p.z + ck.fp];
        const part = makePart(id, 'grass', min, max, 1);
        const rec = { id, kind, pos: { x: p.x, y: p.y, z: p.z }, part, inst: { mesh: im, index: i }, dead: false };
        part.downer = rec; this.parts.push(part); this.cover.push(rec);
      }
      im.instanceMatrix.needsUpdate = true;
      this.scene.add(im); this._instMeshes.push(im);
    }
  }

  // ── register one standing tree: trunk metrics + destruct part + collision box ────
  _registerTree(p, variant, instMesh, instIndex) {
    const sp = SPECIES[p.species];
    const worldHeight = variant.height * p.scale;       // variant.height already includes GAME_SCALE
    const dia = (sp.trunkDiaM[0] + sp.trunkDiaM[1]) / 2;
    const trunkRadius = clamp(dia / 2 * GAME_SCALE * p.scale, 0.16, 0.8);
    const breakPoint = Math.max(1.1, worldHeight * 0.38);
    const crushClass = p.sapling ? 1 : (SPECIES_CRUSH[p.species] || 2);
    const id = this._nextId++;

    const min = [p.x - trunkRadius, p.y, p.z - trunkRadius];
    const max = [p.x + trunkRadius, p.y + worldHeight, p.z + trunkRadius];
    const part = makePart(id, 'trunk', min, max, CRUSH_HPSCALE[crushClass]);

    const box = {
      min: new THREE.Vector3(min[0], min[1], min[2]),
      max: new THREE.Vector3(max[0], max[1], max[2]),
      dpart: id, dmat: 'trunk', tree: true,   // downer set below
    };

    const tree = {
      id, species: p.species, seed: (instIndex * 2654435761 ^ id) >>> 0, variant: p.variant,
      scale: p.scale, yaw: p.yaw, pos: { x: p.x, y: p.y, z: p.z },
      height: worldHeight, trunkRadius, breakPoint, crushClass, trunkMat: 'trunk',
      part, box, inst: { mesh: instMesh, index: instIndex },
      standing: true, felled: false, charred: false, _falling: null, _fallGroup: null, _stump: null, _charMesh: null,
    };
    part.downer = tree; box.downer = tree;

    this.parts.push(part);
    this.trees.push(tree);
    this.world.boxes.push(box);
    this.world.grid.addBox(box);   // grid was already built (forest constructs after World) → addBox
    return tree;
  }

  // ── PUBLIC HOOK: fell a tree (Phase 9 wires gunfire/HE → this) ───────────────────
  // dirXZ = [x,z] horizontal fall direction (normalized-ish; defaults to a seeded dir).
  // seed  = deterministic seed for the FallingBody (co-op replay). Returns the body.
  fellTree(tree, dirXZ = null, seed = null) {
    if (!tree || !tree.standing) return null;
    tree.standing = false; tree.felled = true;
    tree.part.dead = true;                       // standing trunk gone (a stump remains, below)
    if (seed == null) seed = (tree.id * 2654435761) >>> 0;

    let dx, dz;
    if (dirXZ && (dirXZ[0] || dirXZ[1])) { dx = dirXZ[0]; dz = dirXZ[1]; }
    else { const a = (seed % 628) / 100; dx = Math.cos(a); dz = Math.sin(a); }
    const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;

    this._hideInstance(tree);
    this._stumpify(tree);

    // FallingBody hinge about the break point (deterministic, fixed-substep — reused by co-op).
    const pivot = [tree.pos.x, tree.pos.y + tree.breakPoint, tree.pos.z];
    const length = Math.max(0.6, tree.height - tree.breakPoint);
    const obstacles = this._nearbyObstacles(tree.pos.x, tree.pos.z, length, tree.box);
    const body = makeHinge({ pivot, dirXZ: [dx, dz], length, radius: tree.trunkRadius * 1.3, seed, obstacles });

    // Visual: spawn the toppling upper tree as a one-off mesh pivoting at the break point.
    const geo = this._variantGeo(tree);
    const mesh = new THREE.Mesh(geo, tree.charred ? this._charMatOr() : this.treeMat);
    mesh.position.set(0, -tree.breakPoint, 0);
    mesh.rotation.y = tree.yaw;
    mesh.scale.setScalar(tree.scale);
    const grp = new THREE.Group();
    grp.position.set(pivot[0], pivot[1], pivot[2]);
    grp.userData.fallAxis = new THREE.Vector3(dz, 0, -dx).normalize();  // tip toward (dx,dz)
    grp.add(mesh);
    this.scene.add(grp);

    tree._falling = body; tree._fallGroup = grp;
    this._falling.push(tree);
    return body;
  }

  // ── PUBLIC HOOK: char a standing tree (Phase 8 fire wires burn → this) ───────────
  // Swaps the green instance to a charred snag and lowers trunk hp so it snaps easier.
  charTree(tree) {
    if (!tree || tree.charred) return tree;
    tree.charred = true;
    if (tree.standing) {
      this._hideInstance(tree);
      try {
        const { geometry } = makeTree({ species: tree.species, seed: tree.seed, damage: 'charred', scale: tree.scale });
        const mesh = new THREE.Mesh(geometry, this.treeMat);
        mesh.position.set(tree.pos.x, tree.pos.y, tree.pos.z);
        mesh.rotation.y = tree.yaw;
        this.scene.add(mesh); tree._charMesh = mesh;
      } catch (e) { /* keep instance hidden; non-fatal */ }
    }
    if (!tree.part.dead) tree.part.dhp = Math.max(1, tree.part.dhp * 0.4);  // charred wood snaps easy
    return tree;
  }

  // Parts the fire system may ignite (fuel > 0, still alive). Phase 8 enumerates this.
  flammableParts() { return this.parts.filter(p => !p.dead && MATERIALS[p.dmat] && MATERIALS[p.dmat].fuel > 0); }

  // Remove standing trees inside a footprint (Phase 7 building placement uses this).
  clearArea(x, z, r) {
    const r2 = r * r, removed = [];
    for (const t of this.trees) {
      if (!t.standing) continue;
      const dx = t.pos.x - x, dz = t.pos.z - z;
      if (dx * dx + dz * dz <= r2) {
        t.standing = false; t.part.dead = true;
        this._hideInstance(t);
        this._removeBox(t.box); t.box = null;
        removed.push(t);
      }
    }
    return removed;
  }

  // ── per-frame: advance active FallingBodies ──────────────────────────────────────
  update(dt) {
    if (!this._falling.length) return;
    for (let i = this._falling.length - 1; i >= 0; i--) {
      const tree = this._falling[i], b = tree._falling;
      stepBody(b, dt);
      if (tree._fallGroup) tree._fallGroup.setRotationFromAxisAngle(tree._fallGroup.userData.fallAxis, b.angle);
      if (b.settled) this._falling.splice(i, 1);   // leave the trunk lying where it rests
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────
  _hideInstance(tree) {
    if (!tree.inst) return;
    tree.inst.mesh.setMatrixAt(tree.inst.index, ZERO_MAT);
    tree.inst.mesh.instanceMatrix.needsUpdate = true;
  }

  // Shrink the standing-trunk collider/part to a short stump that remains after felling.
  _stumpify(tree) {
    const stumpH = Math.min(tree.breakPoint, 1.1);
    if (tree.box) {
      this._removeBox(tree.box);                       // re-index AFTER resizing (grid uses extents)
      tree.box.max.y = tree.pos.y + stumpH;
      tree.box.downer = tree; tree.box.dmat = 'trunk';
      this.world.boxes.push(tree.box); this.world.grid.addBox(tree.box);
    }
    // keep a live, smaller stump part so fire/APFSDS can still touch it
    tree.part.dead = false;
    tree.part.max[1] = tree.pos.y + stumpH;
    tree.part.dhp = Math.max(1, MATERIALS.trunk.hp * 0.2);
    // small visual stump (jagged snag)
    try {
      const { geometry } = makeTree({ species: tree.species, seed: tree.seed, damage: tree.charred ? 'charred' : 'snapped', scale: tree.scale * 0.55 });
      const m = new THREE.Mesh(geometry, this.treeMat);
      m.position.set(tree.pos.x, tree.pos.y, tree.pos.z); m.rotation.y = tree.yaw + 0.4;
      this.scene.add(m); tree._stump = m;
    } catch (e) { /* non-fatal */ }
  }

  _removeBox(box) {
    if (!box) return;
    this.world.grid.removeBox(box);
    const i = this.world.boxes.indexOf(box);
    if (i >= 0) this.world.boxes.splice(i, 1);
  }

  // Nearby static AABBs (as plain arrays) for the FallingBody to rest against.
  _nearbyObstacles(x, z, reach, ignore) {
    const out = [];
    const cands = this.world.grid.queryAABB(x - reach, z - reach, x + reach, z + reach);
    for (const b of cands) {
      if (b === ignore || out.length >= 6) continue;
      out.push({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
    }
    return out;
  }

  _variantGeo(tree) {
    // a fresh full-tree geometry of this tree's species/seed for the falling visual
    try { return makeTree({ species: tree.species, seed: tree.seed, scale: 1, damage: tree.charred ? 'charred' : 'none' }).geometry; }
    catch (e) { return new THREE.BoxGeometry(0.3, 1, 0.3); }
  }
  _charMatOr() { return this.treeMat; }

  _pickSpecies(rng) {
    let r = rng();
    for (const sp of LIVE_SPECIES) { r -= SPECIES_WEIGHT[sp]; if (r <= 0) return sp; }
    return 'birch';
  }
  _gauss(rng) { return (rng() + rng() + rng() - 1.5) / 1.5; }   // ~N(0,1)-ish in [-1,1]
  _hash(x, z) { let h = ((x * 374761393) ^ (z * 668265263)) >>> 0; h = (h ^ (h >>> 13)) >>> 0; return h; }
  _hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; }
}
