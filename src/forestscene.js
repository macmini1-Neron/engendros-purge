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

export class ForestScene {
  constructor(game) {
    this.game = game; this.world = game.world; this.scene = this.world.scene;
    this.debris = new DebrisPool(this.scene);          // one shared pool for every forest destructible
    this.buildings = [];
    this.trees = new ForestDemo(game, this.debris);    // becomes game.forest
    this._placeCottage();                              // async (fetch spec) — reserves its footprint first
    this._buildCrates();
    this._buildColonnade();
    this.trees.scatter(100, 30, 124);                  // scatter AFTER reserving the building footprints
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
