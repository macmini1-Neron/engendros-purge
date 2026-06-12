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
import { makePart, MATERIALS, makeHinge, stepBody, rayAABB, resolveHit } from './destruct.js';
import { DebrisPool } from './destruct-debris.js';
import { hasModel, getSpec } from './props/registry.js';
import { buildSpec } from './props/voxel-interp.js';

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

// Deadwood + rock scatter — props built from the modelgen registry, now DESTRUCTIBLE
// (material-driven, see docs/.../2026-06-12-prop-destruction-design.md). dmat drives behavior:
// wood (tier1) burns + shoots apart; grass (tier0) is the flammable tangle; stone (tier4) shrugs
// off bullets, yields only to HE/AP. Deadwood is 'wood' NOT 'trunk' so fire treats it as kind
// 'wood' (a 'trunk' part would ignite as kind 'tree' → charTree/fellTree on a non-tree record).
const PROP_KINDS = [
  { id: 'rock_boulder_lg',    n: 6,  jit: [0.85, 1.25], sink: 0.10, dmat: 'stone', hpScale: 1.0 },
  { id: 'rock_outcrop',       n: 5,  jit: [0.85, 1.25], sink: 0.12, dmat: 'stone', hpScale: 1.0 },
  { id: 'rock_boulder_mossy', n: 8,  jit: [0.80, 1.35], sink: 0.06, dmat: 'stone', hpScale: 1.0 },
  { id: 'rock_cluster_sm',    n: 10, jit: [0.80, 1.40], sink: 0.04, dmat: 'stone', hpScale: 1.0 },
  { id: 'stump_shattered',    n: 6,  jit: [0.85, 1.20], sink: 0.05, dmat: 'wood',  hpScale: 2.0 },
  { id: 'stump_cut',          n: 7,  jit: [0.85, 1.25], sink: 0.05, dmat: 'wood',  hpScale: 2.0 },
  { id: 'log_fallen',         n: 6,  jit: [0.90, 1.20], sink: 0.04, dmat: 'wood',  hpScale: 1.5 },
  { id: 'log_split',          n: 5,  jit: [0.90, 1.20], sink: 0.03, dmat: 'wood',  hpScale: 1.0 },
  { id: 'log_pile',           n: 3,  jit: [0.90, 1.15], sink: 0.03, dmat: 'wood',  hpScale: 1.5 },
  { id: 'debris_treetangle',  n: 4,  jit: [0.90, 1.20], sink: 0.02, dmat: 'grass', hpScale: 1.0 },
];
const PROP_IDS = PROP_KINDS.map((k) => k.id);

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
    this._propPlan = [];       // deadwood/rock placements (positions only; built lazily once specs register)
    this._propObjs = [];       // placed prop Object3Ds (for cleanup parity with _instMeshes)
    this._props = [];          // destructible prop records { id, dmat, obj, box, part, pos, dead }
    this._propsBuilt = false;  // one-shot guard for the lazy prop build
    this.treeMat = voxelMaterial();   // one shared vertex-color material for all instances

    // Only the demo (heightfield) map grows a forest. Flat maps (arena/steppe) untouched.
    if (!this.world.hasTerrain || !this.world.terrain) return;
    this.debris = new DebrisPool(this.scene);   // splints/chips when a trunk is hit/felled (Phase 9 visuals)
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

    // 6. Plan deadwood + rock scatter (positions only — the modelgen specs register async,
    //    so the meshes are built lazily in _ensureProps() once every spec exists). The rng
    //    draws happen AFTER trees+cover, so the existing tree/cover layout is unchanged.
    this._planProps(rng, clusters, terr, HALF);
  }

  // ── plan static deadwood/rock props near the stands (deterministic; no meshes yet) ──
  _planProps(rng, clusters, terr, HALF) {
    const occ = new Map(), cell = 1.4, MIN = 1.3, m2 = MIN * MIN;
    const near = (x, z) => {
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const a = occ.get((cx + dx) + ',' + (cz + dz)); if (!a) continue;
        for (const p of a) { const ex = p.x - x, ez = p.z - z; if (ex * ex + ez * ez < m2) return true; }
      }
      return false;
    };
    const mark = (x, z) => { const k = Math.floor(x / cell) + ',' + Math.floor(z / cell); let a = occ.get(k); if (!a) occ.set(k, a = []); a.push({ x, z }); };
    for (const kind of PROP_KINDS) {
      let placed = 0;
      for (let tries = 0; placed < kind.n && tries < kind.n * 40; tries++) {
        let x, z;
        if (rng() < 0.75) {   // 75% inside a stand — deadwood & rocks accrue in the wood
          const cl = clusters[Math.floor(rng() * clusters.length)];
          const a = rng() * TAU, d = Math.abs(this._gauss(rng)) * cl.r * 0.9;
          x = cl.x + Math.cos(a) * d; z = cl.z + Math.sin(a) * d;
        } else { x = (rng() * 2 - 1) * (HALF - 8); z = (rng() * 2 - 1) * (HALF - 8); }
        if (x * x + z * z < SPAWN_CLEAR * SPAWN_CLEAR) continue;       // keep spawn ring clear
        if (Math.abs(x) > HALF - 6 || Math.abs(z) > HALF - 6) continue;
        if (near(x, z)) continue;                                     // min spacing between props
        if (!terr.isPlaceable(x, z, 0.6, 'tree')) continue;           // gentle ground & not reserved
        const scale = kind.jit[0] + rng() * (kind.jit[1] - kind.jit[0]);
        this._propPlan.push({ id: kind.id, x, y: terr.terrainHeightAt(x, z) - kind.sink, z, yaw: rng() * TAU, scale, dmat: kind.dmat, hpScale: kind.hpScale });
        mark(x, z); placed++;
      }
    }
  }

  // ── lazy one-shot: build + place the planned props once every spec has registered ──
  // Mirrors NightPost.ensureBuilt(): the modelgen specs fetch async at boot, so we defer
  // the build to the first frame they all exist. Each prop TYPE is built once (buildSpec)
  // and cloned per placement (clones share geometry buffers → bounded memory).
  _ensureProps() {
    if (this._propsBuilt || !this._propPlan.length) return;
    for (const id of PROP_IDS) if (!hasModel(id)) return;   // wait until every spec is registered
    this._propsBuilt = true;
    const templates = new Map();
    for (const p of this._propPlan) {
      let tmpl = templates.get(p.id);
      if (tmpl === undefined) { try { tmpl = buildSpec(getSpec(p.id)); } catch (e) { tmpl = null; console.warn(`[forest] prop build failed: ${p.id}`, e); } templates.set(p.id, tmpl); }
      if (!tmpl) continue;
      const o = tmpl.clone();   // shares geometry + material with the template
      o.position.set(p.x, p.y, p.z); o.rotation.y = p.yaw; o.scale.setScalar(p.scale);
      this.scene.add(o); this._propObjs.push(o);

      // destructible part + hit/collision box (every prop is shootable; the player's step-up
      // walks over the low ones). Ids come off the shared seeded counter → identical on co-op peers.
      const id = this._nextId++;
      const fp = tmpl.userData.footprint || [0.8, 0.8, 0.8];
      const hx = fp[0] * 0.5 * p.scale, hz = fp[2] * 0.5 * p.scale, top = p.y + fp[1] * p.scale;
      const min = [p.x - hx, p.y, p.z - hz], max = [p.x + hx, top, p.z + hz];
      const part = makePart(id, p.dmat, min, max, p.hpScale);
      const box = {
        min: new THREE.Vector3(min[0], min[1], min[2]),
        max: new THREE.Vector3(max[0], max[1], max[2]),
        dpart: id, dmat: p.dmat, prop: true,   // downer set below
      };
      const rec = { id, dmat: p.dmat, obj: o, box, part, pos: { x: p.x, y: p.y, z: p.z }, prop: true, dead: false };
      part.downer = rec; box.downer = rec;
      this.parts.push(part);        // ⇒ flammableParts() now includes wood/grass props
      this._props.push(rec);
      this.world.boxes.push(box); this.world.grid.addBox(box);
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

    // remember the exact fall dir + seed so a co-op late-joiner can reconstruct this topple.
    tree._fellDir = [dx, dz]; tree._fellSeed = seed;
    // Host-auth co-op sync (Phase 10): broadcast WHICH tree fell + its dir + seed so every peer
    // replays the identical deterministic FallingBody. Clients never call fellTree locally
    // (destruction is host-gated) — they only mirror via fellTreeById in the 'forestfx' handler.
    this._emitForest('fell', tree.id, { dx, dz, seed });

    this._hideInstance(tree);
    this._stumpify(tree);
    if (this.debris) this.debris.burst('splints', [tree.pos.x, tree.pos.y + tree.breakPoint, tree.pos.z], seed, tree.pos.y);

    // FallingBody hinge about the break point (deterministic, fixed-substep — reused by co-op).
    const pivot = [tree.pos.x, tree.pos.y + tree.breakPoint, tree.pos.z];
    const length = Math.max(0.6, tree.height - tree.breakPoint);
    const obstacles = this._nearbyObstacles(tree.pos.x, tree.pos.z, length, tree.box);
    // Slope-aware settle: rest the toppled trunk ON the terrain under each sample (pure → co-op-safe),
    // so a tree felled on a hilltop lies along the slope instead of swinging down to y=0.
    const terr = this.world.terrain;
    const groundAt = (this.world.hasTerrain && terr) ? ((x, z) => terr.terrainHeightAt(x, z)) : null;
    const body = makeHinge({ pivot, dirXZ: [dx, dz], length, radius: tree.trunkRadius * 1.3, seed, obstacles, groundAt });

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
    this._emitForest('char', tree.id);   // host-auth: mirror the charred snag on every peer
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

  // ── CO-OP host→client replay (Phase 10) ─────────────────────────────────────────
  // A tree record by id (trees register sequential ids off the shared _nextId counter,
  // seeded off the terrain seed → identical on every peer).
  _treeById(id) { for (const t of this.trees) if (t.id === id) return t; return null; }

  // Host emits exactly one 'forestfx' message per fell/char/grass-consume; clients mirror.
  // No-op unless we're the authoritative host in an active co-op session.
  _emitForest(k, id, extra = null) {
    const mp = this.game.mp;
    if (!mp || !mp.active || !mp.isHost || !mp.net) return;
    try { mp.net.send('forestfx', Object.assign({ k, id }, extra || {})); } catch (e) {}
  }

  // Client mirrors of the three authoritative forest mutations. Each is idempotent and
  // re-broadcast-safe (fellTree/charTree guard on standing/charred; the host guard in
  // _emitForest prevents a client echo).
  fellTreeById(id, dx, dz, seed) { const t = this._treeById(id); if (t) this.fellTree(t, (dx || dz) ? [dx, dz] : null, seed); }
  charTreeById(id)               { const t = this._treeById(id); if (t) this.charTree(t); }
  consumeGrassById(id)           { const rec = this.cover.find(c => c.id === id); if (rec) this._consumeGrass(rec); }

  // ── PROP destruction (mirrors the tree path; "consume in place", no FallingBody) ──────
  // A bullet resolved onto a prop part: pen<tier ⇒ cosmetic (caller already drew a chip);
  // else damage, and on death the prop is removed. `point`=[x,y,z] impact for the debris burst.
  hitProp(rec, weapon, point) {
    if (!rec || rec.dead || !rec.part || rec.part.dead) return null;
    const r = resolveHit(rec.part, weapon);
    if (r.killed) this.destroyProp(rec, point);
    else if (r.effect === 'damage' && this.debris) this.debris.burst(MATERIALS[rec.dmat].debris, point, (rec.id ^ 0x55) >>> 0);
    return r;
  }

  // Remove a prop: hide its mesh, drop its collider, burst material debris, broadcast to peers.
  // `at`=[x,y,z] for the debris burst (defaults to the prop centre, e.g. the client mirror path).
  destroyProp(rec, at = null) {
    if (!rec || rec.dead) return;
    rec.dead = true; if (rec.part) rec.part.dead = true;
    if (rec.obj) rec.obj.visible = false;
    if (rec.box) { this._removeBox(rec.box); rec.box = null; }
    const where = at || [rec.pos.x, rec.pos.y + 0.3, rec.pos.z];
    if (this.debris) this.debris.burst(MATERIALS[rec.dmat].debris, where, (rec.id * 2654435761) >>> 0);
    this._emitForest('propdie', rec.id);   // host-auth: one bit — "this prop is gone"
  }

  // Fire burned a wood/grass prop out → same removal (the char/ash flourish is cosmetic).
  consumeProp(rec) { this.destroyProp(rec); }

  // Client mirror of a host 'propdie' (idempotent; destroyProp guards on rec.dead; the host guard
  // in _emitForest stops a client echo).
  destroyPropById(id) { const rec = this._props.find(r => r.id === id); if (rec) this.destroyProp(rec); }

  // Burn a grass tuft out (visual + part death). Host path also broadcasts so clients match;
  // the fire system (host) calls this from _burnout, the net handler calls consumeGrassById.
  consumeGrass(rec) { this._consumeGrass(rec); this._emitForest('grass', rec.id); }
  _consumeGrass(rec) {
    if (!rec || rec.dead) return;
    rec.dead = true; if (rec.part) rec.part.dead = true;
    if (rec.inst && rec.inst.mesh) { rec.inst.mesh.setMatrixAt(rec.inst.index, ZERO_MAT); rec.inst.mesh.instanceMatrix.needsUpdate = true; }
  }

  // Late-join snapshot: every authoritative forest mutation a fresh joiner missed, as a list
  // of 'forestfx'-shaped records the host replays into the joiner. (clearArea'd trees are NOT
  // included — building placement is deterministic, so the joiner clears the same footprint.)
  netSnapshot() {
    const out = [];
    for (const t of this.trees) {
      if (t.felled) out.push({ k: 'fell', id: t.id, dx: (t._fellDir && t._fellDir[0]) || 0, dz: (t._fellDir && t._fellDir[1]) || 0, seed: t._fellSeed || ((t.id * 2654435761) >>> 0) });
      else if (t.charred) out.push({ k: 'char', id: t.id });   // charred-but-standing
    }
    for (const c of this.cover) if (c.dead) out.push({ k: 'grass', id: c.id });
    return out;
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

  // ── PUBLIC HOOK: APFSDS long-rod through the wood (Phase 9 cannon) ───────────────
  // Fell every standing tree whose trunk bole the ray pierces, in order along the rod
  // (trunks are fragile tier-2 → obliterated). origin/dir are THREE.Vector3.
  penetrate(origin, dir, range = 320, weapon = null) {
    const o = [origin.x, origin.y, origin.z], dd = [dir.x, dir.y, dir.z];
    const hits = [];
    for (const tree of this.trees) {
      if (!tree.standing || !tree.box) continue;
      const t = rayAABB(o, dd, [tree.box.min.x, tree.box.min.y, tree.box.min.z], [tree.box.max.x, tree.box.max.y, tree.box.max.z]);
      if (t !== null && t <= range) hits.push({ tree, t });
    }
    hits.sort((a, b) => a.t - b.t);
    for (const h of hits) {
      if (this.debris) this.debris.burst('splints', [h.tree.pos.x, h.tree.pos.y + h.tree.breakPoint, h.tree.pos.z], (h.tree.id * 2654435761) >>> 0, h.tree.pos.y);
      this.fellTree(h.tree, [dir.x, dir.z], (h.tree.id * 2654435761) >>> 0);
    }
    // APFSDS obliterates fragile props (tier ≤ 2: wood/grass) it pierces; stone (tier 4) is a
    // structural through-hole — left in place (cosmetic), consistent with resolvePenetration.
    for (const rec of this._props) {
      if (rec.dead || !rec.part) continue;
      if (MATERIALS[rec.dmat].tier > 2) continue;
      const t = rayAABB(o, dd, rec.part.min, rec.part.max);
      if (t !== null && t <= range) this.destroyProp(rec, [rec.pos.x, rec.pos.y + 0.3, rec.pos.z]);
    }
    return hits.length;
  }

  // ── PUBLIC HOOK: HE blast fells the stand (Phase 9 rocket/grenade) ────────────────
  // Topple every standing tree within `radius` of `pos`, away from the blast.
  blast(pos, radius, blastTier = 3) {
    const r2 = radius * radius, felled = [];
    for (const tree of this.trees) {
      if (!tree.standing) continue;
      const dx = tree.pos.x - pos.x, dz = tree.pos.z - pos.z;
      if (dx * dx + dz * dz <= r2) {
        const n = Math.hypot(dx, dz) || 1;
        this.fellTree(tree, [dx / n, dz / n], (tree.id * 2654435761) >>> 0);
        felled.push(tree);
      }
    }
    // props: remove any whose material tier ≤ the blast tier within radius (stone tier4 survives
    // the default bazooka tier3 — only a stronger blast or AP takes it).
    for (const rec of this._props) {
      if (rec.dead) continue;
      const dx = rec.pos.x - pos.x, dz = rec.pos.z - pos.z;
      if (dx * dx + dz * dz <= r2 && MATERIALS[rec.dmat].tier <= blastTier) this.destroyProp(rec, [rec.pos.x, rec.pos.y, rec.pos.z]);
    }
    return felled;
  }

  // ── per-frame: advance active FallingBodies + debris ─────────────────────────────
  update(dt) {
    if (!this._propsBuilt) this._ensureProps();   // place deadwood/rocks once their specs register
    if (this.debris) this.debris.update(dt);
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
