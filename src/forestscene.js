// forestscene.js — assembles ?map=forest from the standalone demo's REAL destructible assets:
//   · the buildgen `_smoke` brick cottage WITH the detaching "ПРОВЕРКА" sign (BuildingDestruct),
//   · shoot-through wood/tin crates (eager BuildingDestruct),
//   · a slab-on-columns colonnade (knock the columns out → the slab caves in, #6),
//   · the demo-faithful split-fell trees (ForestDemo).
// Bridged to the game: each destructible registers AABB collision (weapons.js hits it via box.downer);
// this scene also stands in as game.world.demoBuilding — a FACADE that fans HE blasts + APFSDS to every
// building (bullets route per-building via box.downer). game.forest = this.trees (the ForestDemo).
import * as THREE from 'three';
import { buildBuilding } from './buildings/interp.js';
import { planBuild } from './buildings/plan.js';
import { BuildingDestruct } from './destruct-lab/building-destruct.js';
import { DebrisPool } from './destruct-debris.js';
import { ForestDemo } from './forestdemo.js';
import { makeGrassTuft, makeFlowerPatch, makeReedClump, makeShrub } from './props/generators/groundcover.js';
import { voxelMaterial, MeshBuilder } from './util.js';

export class ForestScene {
  constructor(game) {
    this.game = game; this.world = game.world; this.scene = this.world.scene;
    this.debris = new DebrisPool(this.scene);          // one shared pool for every forest destructible
    this.buildings = [];
    this.trees = new ForestDemo(game, this.debris);    // becomes game.forest
    this._placeCottage();                              // async (fetch spec) — reserves its footprint first
    this._buildCrates();
    this._buildColonnade();
    this.trees.scatter(150, 45, 124);                  // denser wood; scatter AFTER reserving the building footprints
    this.trees.scatterBushes(55);                      // head-height understorey bushes (push-through soft cover) — after the trees seed the clusters
    this._groundcover = [];
    this._scatterGroundcover();                        // a living forest FLOOR: grass tufts, flower patches, reeds, low scrub (visual, walk-over)
    this._scatterDecor();                              // rocks (solid) + fallen logs + stumps (destructible/flammable props)
  }

  // Lush ground vegetation as InstancedMeshes (one draw call per variant). Purely visual / walk-over — no
  // collision or destruct (you wade over grass). Shares one vertex-colored material across every variant.
  _scatterGroundcover() {
    const terr = this.world.terrain, HALF = this.world.HALF || 200;
    const R = Math.min(HALF - 8, 138);                 // keep groundcover to the playable wood, not the far map edge
    const gcMat = voxelMaterial();
    const reserved = (x, z) => { for (const r of this.trees._reserved) { const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < r.r * r.r) return true; } return false; };
    const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const place = (makeFn, nVariants, count, sLo, sHi, castShadow) => {
      const geos = []; for (let v = 0; v < nVariants; v++) geos.push(makeFn((v * 9173 + 41) >>> 0).geometry);
      const buckets = geos.map(() => []);
      for (let i = 0; i < count; i++) {
        let x = 0, z = 0, ok = false;
        for (let tries = 0; tries < 8; tries++) {
          if (Math.random() < 0.62 && this.trees.trees.length) {   // cluster most groundcover AROUND the trees → a lush understory, not a thin even sprinkle
            const t = this.trees.trees[(Math.random() * this.trees.trees.length) | 0], a = Math.random() * Math.PI * 2, rr2 = Math.random() * 6.5;
            x = t.x + Math.cos(a) * rr2; z = t.z + Math.sin(a) * rr2;
          } else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R; x = Math.cos(a) * d; z = Math.sin(a) * d; }
          if (Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4) continue;
          if (terr && !terr.isPlaceable(x, z, 0.4, 'tree')) continue;
          if (reserved(x, z)) continue;
          ok = true; break;
        }
        if (!ok) continue;
        const y = terr ? terr.terrainHeightAt(x, z) : 0;
        const vi = (Math.random() * nVariants) | 0, s = sLo + Math.random() * (sHi - sLo);
        q.setFromAxisAngle(up, Math.random() * Math.PI * 2); pos.set(x, y, z); scl.set(s, s, s);
        buckets[vi].push(tmp.clone().compose(pos, q, scl));
      }
      for (let v = 0; v < nVariants; v++) {
        const list = buckets[v]; if (!list.length) continue;
        const im = new THREE.InstancedMesh(geos[v], gcMat, list.length);
        for (let i = 0; i < list.length; i++) im.setMatrixAt(i, list[i]);
        im.instanceMatrix.needsUpdate = true; im.castShadow = !!castShadow; im.receiveShadow = false;
        this.scene.add(im); this._groundcover.push(im);
      }
    };
    place(makeGrassTuft, 6, 950, 0.7, 1.4, false);     // dense feather-grass sward — the floor
    place(makeFlowerPatch, 4, 160, 0.8, 1.3, false);   // pops of colour
    place(makeReedClump, 3, 70, 0.7, 1.25, false);     // taller clumps in dips
    place(makeShrub, 3, 95, 0.85, 1.3, true);          // low woody scrub (casts a little shadow)
  }

  // a rounded multi-tone voxel boulder (sits on y=0, grows +Y) — stone-grey shaded lighter toward the top
  _makeBoulder(seed, scale) {
    let s = (seed >>> 0) || 1; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const b = new MeshBuilder(), TONES = [0x6f7178, 0x898b93, 0xa3a5ad, 0xbcbec6], R = 0.9 * scale, n = 10 + (rnd() * 6 | 0);   // light granite-grey, shaded lighter toward the top
    for (let i = 0; i < n; i++) {
      const u = rnd() * Math.PI * 2, v = Math.acos(2 * rnd() - 1), rad = R * (0.35 + 0.5 * rnd());
      const px = Math.sin(v) * Math.cos(u) * rad, py = Math.abs(Math.cos(v)) * rad * 0.8, pz = Math.sin(v) * Math.sin(u) * rad, sz = R * (0.45 + 0.4 * rnd());
      b.box(sz, sz * 0.8, sz, px, py, pz, TONES[Math.min(3, Math.floor((py / (R * 0.9)) * 4))]);
    }
    return b.build();
  }

  // Destructible scenery: stone boulders (solid, only HE/APFSDS break) + lying deadwood logs (solid,
  // shootable-apart, flammable). Routed through ForestDemo so weapons/blast/fire reach them.
  _scatterDecor() {
    const terr = this.world.terrain, HALF = this.world.HALF || 200, R = Math.min(HALF - 10, 130);
    const rnd = this.trees._frng;   // shared SEEDED layout rng → rocks/logs land at the same spots on every co-op peer (id→prop matches for propdie sync)
    const stoneMat = voxelMaterial(), logMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    const reserved = (x, z) => { for (const r of this.trees._reserved) { const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < (r.r + 1) * (r.r + 1)) return true; } return false; };
    const placed = [];
    const pick = (minD) => {
      for (let t = 0; t < 12; t++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R, x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (Math.abs(x) > HALF - 5 || Math.abs(z) > HALF - 5) continue;
        if (terr && !terr.isPlaceable(x, z, 1.0, 'tree')) continue;
        if (reserved(x, z)) continue;
        let near = false; for (const e of placed) { const dx = x - e.x, dz = z - e.z; if (dx * dx + dz * dz < minD * minD) { near = true; break; } }
        if (near) continue;
        return { x, z };
      }
      return null;
    };
    for (let i = 0; i < 24; i++) {                      // boulders — singles + occasional buddy
      const p = pick(4); if (!p) continue; placed.push(p);
      this.trees._addRock(this._makeBoulder((i * 733 + 17) >>> 0, 0.7 + rnd() * 1.3), stoneMat, p.x, p.z, rnd() * Math.PI * 2);
      if (rnd() < 0.45) { const bx = p.x + (rnd() - 0.5) * 3, bz = p.z + (rnd() - 0.5) * 3; if (!reserved(bx, bz) && (!terr || terr.isPlaceable(bx, bz, 0.6, 'tree'))) { placed.push({ x: bx, z: bz }); this.trees._addRock(this._makeBoulder((i * 941 + 53) >>> 0, 0.45 + rnd() * 0.5), stoneMat, bx, bz, rnd() * Math.PI * 2); } }
    }
    for (let i = 0; i < 12; i++) {                      // lying deadwood logs
      const p = pick(5); if (!p) continue; placed.push(p);
      const r = 0.22 + rnd() * 0.18, length = 3 + rnd() * 3;
      const geo = new THREE.CylinderGeometry(r, r * 1.05, length, 7, 1); geo.rotateX(Math.PI / 2);
      this.trees._addDecorLog(new THREE.Mesh(geo, logMat), p.x, p.z, rnd() * Math.PI * 2, length, r);
    }
  }

  _terrainMin(cx, cz, hw, hd) {
    const t = this.world.terrain; if (!t) return 0;
    let mn = Infinity;
    for (const dx of [-hw, 0, hw]) for (const dz of [-hd, 0, hd]) mn = Math.min(mn, t.terrainHeightAt(cx + dx, cz + dz));
    return mn;
  }

  async _placeCottage() {
    const cx = 6, cz = -18;                            // off-centre, just past the spawn ring
    const baseY = this._terrainMin(cx, cz, 4.2, 3.2);
    this.trees.reserve(cx, cz, 8.5);                   // keep the woods off the footprint
    try {
      const spec = await (await fetch('buildings/_smoke/spec.json', { cache: 'no-store' })).json();
      const built = buildBuilding(spec, { skipPropCheck: true });
      const g = built.group; g.position.set(cx, baseY, cz);
      g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
      this.scene.add(g);
      const bd = new BuildingDestruct({ group: g, prims: planBuild(spec).prims, scene: this.scene, debris: this.debris, seed: spec.seed ?? 7, world: this.world, game: this.game });
      bd.netId = 'cottage'; this.buildings.push(bd);
    } catch (e) { console.warn('[forestscene] cottage build failed — continuing without it', e); }
  }

  // eager BuildingDestruct: no pristine buildgen mesh — render straight from the diced cells of `prims`
  // (prims are in the group's LOCAL space; the group is seated on the terrain).
  _eager(prims, x, z, netId) {
    const baseY = this._terrainMin(x, z, 1.4, 1.4);
    const g = new THREE.Group(); g.position.set(x, baseY, z); this.scene.add(g);
    const bd = new BuildingDestruct({ group: g, prims, scene: this.scene, debris: this.debris, seed: (netId.length * 131 + 7) >>> 0, world: this.world, game: this.game, eager: true });
    bd.netId = netId; this.buildings.push(bd);
    return bd;
  }

  // shoot-through cover: a rifle round punches through a WOOD crate; tin too. Reserve so no tree spawns on them.
  _buildCrates() {
    const crate = (mat, s) => [{ kind: 'box', mat, x: 0, y: s / 2, z: 0, w: s, h: s, d: s }];
    const spots = [['wood', 1.2, -10, -8, 'crateW0'], ['wood', 1.2, 14, -4, 'crateW1'], ['corrugatedTin', 1.3, -3, 7, 'crateM0']];
    for (const [mat, s, x, z, id] of spots) { this.trees.reserve(x, z, 2.0); this._eager(crate(mat, s), x, z, id); }
  }

  // a concrete slab on EIGHT columns — the columns are the only path from the slab to the ground, so
  // knocking enough of them out orphans the slab and it caves in (the demo's structural-targeting #6).
  _buildColonnade() {
    const cx = -22, cz = 16, W = 6, D = 2.4, COLH = 2.6, T = 0.4;
    this.trees.reserve(cx, cz, Math.max(W, D) / 2 + 2.5);
    const prims = [];
    for (const px of [-W / 2 + 0.4, -W / 6, W / 6, W / 2 - 0.4]) for (const pz of [-D / 2 + 0.4, D / 2 - 0.4])
      prims.push({ kind: 'box', mat: 'concrete', x: px, y: COLH / 2, z: pz, w: 0.4, h: COLH, d: 0.4 });
    prims.push({ kind: 'box', mat: 'concrete', x: 0, y: COLH + T / 2, z: 0, w: W, h: T, d: D });
    this._eager(prims, cx, cz, 'colonnade');
  }

  // ── facade as game.world.demoBuilding: fan HE blast + APFSDS to every building; bullets go per-building ──
  applyBlast(pos, radius, ammoDef) { for (const b of this.buildings) b.applyBlast(pos, radius, ammoDef); }
  applyPenetration(origin, dir, w) { for (const b of this.buildings) b.applyPenetration(origin, dir, w); }
  applyCrush(aabb, opts) { let blocked = false; for (const b of this.buildings) { const r = b.applyCrush(aabb, opts); if (r && r.blocked) blocked = true; } return { blocked }; }
  undermine(rect) { for (const b of this.buildings) if (typeof b.undermine === 'function') b.undermine(rect); } // dig under a building → it caves (SupportScan)
  update(dt) { for (const b of this.buildings) b.update(dt); this.debris.update(dt); }

  // ── co-op (basic — 2-PC is a manual gate): route the host's bdestroy delta by building netId ──
  netSnapshot() { return this.buildings.map((b) => b.netSnapshot()); }
  applyNetDestroy(d) { if (!d) return; const b = this.buildings.find((x) => x.netId === d.id); if (b) b.applyNetDestroy(d.cells); }
  stats() { return { buildings: this.buildings.length, trees: this.trees.stats() }; }
}
