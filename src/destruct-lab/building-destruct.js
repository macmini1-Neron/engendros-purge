// building-destruct.js — voxel-chunk destruction for a buildgen building (demo runtime).
//
// Goal (owner): the cottage keeps its exact buildgen look (brick/tin/concrete TRIPLANAR
// textures) but breaks like the trees do — material-driven, multi-fidelity, with REAL local
// holes (not "5 walls that fall"), and it must not stutter.
//
// How it works — "lazy split" (spec §4):
//   · Every SOLID box prim (walls, floor slab, roof) is diced into a grid of ~CELL cells, each
//     tagged with its source material. Idle cost = ZERO: nothing is voxelised on screen until a
//     bucket is first damaged; until then the pristine merged mesh from buildBuilding() renders.
//   · On the first hit to a material bucket we hide its original merged mesh and swap in a mesh
//     rebuilt from that bucket's SURVIVING cells (same triplanar UV + texture → seamless). Every
//     later hit rebuilds only the touched bucket(s). Cost is paid per event, never per frame.
//   · Glass panes are HERO parts (shatter → shards + a clinging jagged remnant).
//
// Material × caliber rules are reused verbatim from matrix.js (MATERIALS tiers + LAB_WEAPONS):
//   pen < tier ⇒ F0 cosmetic chip · pen ≥ tier ⇒ F1 cell carve · HE ⇒ sphere of cells removed
//   (tier ≤ blast.tier) · APFSDS ⇒ a clean tunnel of cells through every wall it passes.
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from '../util.js';
import { resolveMaterial } from '../buildings/palette.js';
import { makeTextureCanvas } from '../buildings/textures.js';
// Reuse the GAME's destruction core (PR #102 merged the lab's matrix/fallphys into it): MATERIALS +
// CALIBERS (= the lab's LAB_WEAPONS shape: pen/dmg/blast/through/spall) + makeTumble/stepBody.
import { MATERIALS, CALIBERS as LAB_WEAPONS, makeTumble, stepBody } from '../destruct.js';

const CELL = 0.45;          // voxel cell size (m) — smaller = finer holes, more rebuild cost
const TUNNEL_R = 0.42;      // APFSDS through-hole radius (m)
const GROUND_EPS = 0.14;    // a cell whose bottom is this close to y=0 is "grounded" (support seed)
const ADJ_EPS = 0.06;       // cells touching within this gap are neighbours (connectivity graph)
const SUPPORT_MIN = 0.4;    // a sign/pane keeps standing while ≥ this fraction of its backing cells live
const MAX_FALLERS = 6;      // hard cap on live falling chunks (perf)
const FALL_G = 4.2;         // gravity for collapsing building chunks — < 9.81 = slower, weightier fall
const CHIP_COUNT = 3;       // a bullet chip is a light puff, not a full breach burst
const MAX_REBAR = 40;       // cap on exposed-rebar rods (hero detail at concrete break faces)
// Vehicle crush is gated PER-VEHICLE by opts.crushTier (the hardest material tier it can shove
// through): anything harder STOPS it. Tank ≈ 4 (brick + concrete; walled by steel/reinforced);
// car ≈ 1 (glass/wood only; walled by brick). One number scales the whole vehicle roster.
const _axis = new THREE.Vector3();

// Accept either a LAB_WEAPONS key (string — the standalone demo) or a ready weapon object
// ({pen,dmg,blast,...} — the game bridge, since weapons.js builds a weaponDef).
function _weapon(k, dflt) { return (k && typeof k === 'object') ? k : (LAB_WEAPONS[k] || dflt); }

// buildgen material key → destruction material (matrix.js MATERIALS). Per-object overridable via
// the `matMap` ctor option — e.g. a bunker passes { concrete: 'reinforcedConcrete' }.
export const MAT_MAP = {
  brickRed: 'brick', brickGrey: 'brick', concrete: 'concrete', concretePanel: 'concrete',
  corrugatedTin: 'sheetmetal', glassPane: 'glass', signage: 'sheetmetal', wood: 'wood', plaster: 'wood',
  reinforcedConcrete: 'reinforcedConcrete', ferroConcrete: 'reinforcedConcrete',
};
// buildgen material key → destruction material (matrix.js MATERIALS)
// Triplanar metric UVs — copied from interp.js so a rebuilt bucket keeps IDENTICAL tiling.
function metricUVs(geometry, tile) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, p.getX(i) / tile.w, p.getZ(i) / tile.h);
    else if (nx >= nz) uv.setXY(i, p.getZ(i) / tile.w, p.getY(i) / tile.h);
    else uv.setXY(i, p.getX(i) / tile.w, p.getY(i) / tile.h);
  }
  uv.needsUpdate = true;
}

export class BuildingDestruct {
  // { group: buildBuilding() root (or a bare group for eager objects), prims: planBuild(spec).prims,
  //   scene, debris: DebrisPool, seed, matMap?: buildgen→destruct override, eager?: render from cells now }
  // GAME PORT: `world` (game.world) wires AABB collision so weapons.js hits the building; `game` gives
  // co-op mp + the hostSim gate. Both optional — without them this is the standalone-demo runtime.
  constructor({ group, prims, scene, debris, seed = 7, matMap = MAT_MAP, eager = false, world = null, game = null }) {
    this.group = group; this.scene = scene; this.debris = debris; this.seed = seed >>> 0;
    this.matMap = matMap; this.world = world; this.game = game;
    this._sid = 1; this._rng = (this.seed || 1) >>> 0;
    this.cells = [];                 // flat list of every cell (events iterate this; n≈800, cheap)
    this.buckets = new Map();        // matName → { cells, original, mesh, voxelised }
    this.panes = [];                 // hero glass plane meshes
    this.dust = [];                  // live dust puffs (animated in update)
    this.fallers = [];               // live falling chunks (orphaned roof/walls/sign/panes)
    this.rebar = new THREE.Group(); this.group.add(this.rebar); this._rebarN = 0;  // exposed rebar at concrete breaks
    this._captureOriginals();
    this._voxelize(prims);
    this.group.updateWorldMatrix(true, true);
    this._buildAdjacency();          // connectivity graph → "is this cell still tied to the ground?"
    this._captureSupports();         // sign + panes remember the cells that back them
    if (eager) for (const name of this.buckets.keys()) this._commit([name]);  // no pristine mesh — render voxels now
    if (this.world) this._registerBoxes();   // GAME: one AABB per cell + pane so world.rayHit can hit us
  }

  _seed() { this._rng = (this._rng * 1664525 + 1013904223) >>> 0; return this._rng; }
  _rnd() { return this._seed() / 4294967296; }
  _bucket(name) { if (!this.buckets.has(name)) this.buckets.set(name, { cells: [], original: null, mesh: null, voxelised: false }); return this.buckets.get(name); }

  // tag the merged meshes + panes from buildBuilding so a raycast can resolve them back to us
  _captureOriginals() {
    for (const ch of this.group.children) {
      if (!ch.isMesh) continue;
      if (ch.name && ch.name.startsWith('mat:')) {
        const name = ch.name.slice(4);
        this._bucket(name).original = ch;
        ch.userData = Object.assign(ch.userData || {}, { house: true, _bd: this, kind: 'cell', bucket: name });
      } else if (ch.geometry && ch.geometry.type === 'PlaneGeometry') {
        ch.userData = Object.assign(ch.userData || {}, { house: true, _bd: this, kind: 'pane', dead: false });
        this.panes.push(ch);
      } else {
        ch.userData = Object.assign(ch.userData || {}, { house: true, _bd: this, kind: 'other' });   // sign / props
      }
    }
  }

  // dice every solid box prim into a grid of cells snapped to a global lattice (edges clipped to
  // the prim so the silhouette is unchanged; thin walls stay 1 cell thick → holes go straight through)
  _voxelize(prims) {
    const span = (lo, hi, fn) => { for (let i = Math.floor(lo / CELL); i * CELL < hi - 1e-6; i++) { const a = Math.max(lo, i * CELL), b = Math.min(hi, (i + 1) * CELL); if (b - a > 1e-3) fn(a, b); } };
    for (const c of prims) {
      if (c.kind !== 'box' || c.text != null) continue;     // panes handled separately; sign keeps its lettered mesh
      const name = c.mat ?? 'concrete';
      const dmat = this.matMap[name] ?? 'concrete';
      const mdef = MATERIALS[dmat] ?? MATERIALS.concrete;
      const bk = this._bucket(name);
      span(c.x - c.w / 2, c.x + c.w / 2, (ax, bx) => span(c.y - c.h / 2, c.y + c.h / 2, (ay, by) => span(c.z - c.d / 2, c.z + c.d / 2, (az, bz) => {
        const cell = {
          id: this._sid++, bucket: name, mat: dmat, hp: mdef.hp, alive: true,
          cx: (ax + bx) / 2, cy: (ay + by) / 2, cz: (az + bz) / 2, sx: bx - ax, sy: by - ay, sz: bz - az,
        };
        this.cells.push(cell); bk.cells.push(cell);
      })));
    }
  }

  // build a textured mesh from a set of cells (offset by `off`), same triplanar path as interp.js
  _cellsMesh(name, cells, off) {
    if (!cells.length) return null;
    const ox = off?.x ?? 0, oy = off?.y ?? 0, oz = off?.z ?? 0;
    const entry = resolveMaterial(name);
    const tone = new THREE.Color(entry.tones?.mid ?? entry.color ?? 0x888888).getHex();
    const mb = new MeshBuilder();
    // INFLATE each render box by a hair so adjacent diced cells OVERLAP — otherwise a ray aimed exactly
    // at a cell-boundary plane grazes the coplanar triangle edges and slips through (the mesh reads as
    // un-shootable on axis-aligned shots). Cell DATA is unchanged; only the visual/raycast mesh grows ~6 mm.
    const INF = 0.006;
    for (const c of cells) mb.box(c.sx + INF, c.sy + INF, c.sz + INF, c.cx - ox, c.cy - oy, c.cz - oz, tone);
    const geo = mb.build();
    let mesh;
    if (entry.kind === 'tiled') {
      metricUVs(geo, entry.tile);
      const tex = new THREE.CanvasTexture(makeTextureCanvas(name, entry, this.seed));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.NearestFilter; tex.repeat.set(1, 1);
      mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    } else {
      mesh = new THREE.Mesh(geo, voxelMaterial());
    }
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  // rebuild one bucket's standing mesh from its surviving, still-attached cells
  _buildBucketMesh(name) {
    const bk = this._bucket(name);
    if (bk.mesh) { this.group.remove(bk.mesh); bk.mesh.geometry.dispose(); bk.mesh = null; }
    const mesh = this._cellsMesh(name, bk.cells.filter((c) => c.alive), null);
    if (!mesh) return;
    mesh.name = `voxel:${name}`; mesh.userData = { house: true, _bd: this, kind: 'cell', bucket: name };
    this.group.add(mesh); bk.mesh = mesh;
  }

  // 6/26-neighbour connectivity graph (built once) — drives the "is it still supported?" flood
  _buildAdjacency() {
    const hash = new Map(), key = (a, b, c) => `${a},${b},${c}`;
    const qi = (v) => Math.round(v / CELL);
    for (const c of this.cells) { const k = key(qi(c.cx), qi(c.cy), qi(c.cz)); (hash.get(k) || hash.set(k, []).get(k)).push(c); }
    for (const c of this.cells) {
      c.nbrs = [];
      const ix = qi(c.cx), iy = qi(c.cy), iz = qi(c.cz);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
        const cell = hash.get(key(ix + a, iy + b, iz + d)); if (!cell) continue;
        for (const o of cell) {
          if (o === c) continue;
          if (Math.abs(c.cx - o.cx) <= (c.sx + o.sx) / 2 + ADJ_EPS && Math.abs(c.cy - o.cy) <= (c.sy + o.sy) / 2 + ADJ_EPS && Math.abs(c.cz - o.cz) <= (c.sz + o.sz) / 2 + ADJ_EPS) c.nbrs.push(o);
        }
      }
    }
  }

  // sign + panes remember the structural cells immediately behind them (local space)
  _captureSupports() {
    this.attached = [];
    const add = (mesh, kind) => {
      const p = mesh.position, R = 0.85;
      const sup = this.cells.filter((c) => Math.abs(c.cx - p.x) < R && Math.abs(c.cy - p.y) < R && Math.abs(c.cz - p.z) < R);
      this.attached.push({ mesh, kind, support: sup, total: sup.length, detached: false });
    };
    for (const p of this.panes) add(p, 'pane');
    for (const ch of this.group.children) if (ch.isMesh && ch.userData.kind === 'other') add(ch, 'sign');
  }

  // apply removals: first damage to a bucket hides its pristine mesh; then rebuild from survivors
  _commit(names) {
    for (const name of names) {
      const bk = this._bucket(name);
      if (!bk.voxelised) { bk.voxelised = true; if (bk.original) bk.original.visible = false; }
      this._buildBucketMesh(name);
    }
  }

  // the whole post-hit settle: anything no longer tied to the ground (roof with its wall gone,
  // a floating brick island) detaches and FALLS; then standing meshes rebuild; then the sign and
  // any window whose backing wall is gone drops too — nothing levitates.
  _settle(dirty) {
    this._orphanPass(dirty);
    this._commit([...dirty]);
    this._supportCheck();
  }

  // flood from grounded cells through the connectivity graph; unreached alive cells = orphans → fall
  _orphanPass(dirty) {
    const seen = new Set(), stack = [];
    for (const c of this.cells) if (c.alive && c.cy - c.sy / 2 <= GROUND_EPS) { seen.add(c.id); stack.push(c); }
    while (stack.length) { const c = stack.pop(); for (const nb of c.nbrs) if (nb.alive && !seen.has(nb.id)) { seen.add(nb.id); stack.push(nb); } }
    const orphans = this.cells.filter((c) => c.alive && !seen.has(c.id));
    if (!orphans.length) return;
    for (const c of orphans) { c.alive = false; dirty.add(c.bucket); }
    this._makeFaller(orphans);
  }

  // merge a set of cells into ONE tumbling chunk (≤1 new body per event), textured per material
  _makeFaller(cells) {
    let ox = 0, oy = 0, oz = 0, minY = 1e9, maxY = -1e9, mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
    for (const c of cells) {
      ox += c.cx; oy += c.cy; oz += c.cz;
      minY = Math.min(minY, c.cy - c.sy / 2); maxY = Math.max(maxY, c.cy + c.sy / 2);
      mnx = Math.min(mnx, c.cx - c.sx / 2); mxx = Math.max(mxx, c.cx + c.sx / 2);
      mnz = Math.min(mnz, c.cz - c.sz / 2); mxz = Math.max(mxz, c.cz + c.sz / 2);
    }
    const n = cells.length; ox /= n; oy /= n; oz /= n;
    const byMat = new Map();
    for (const c of cells) { if (!byMat.has(c.bucket)) byMat.set(c.bucket, []); byMat.get(c.bucket).push(c); }
    const grp = new THREE.Group();
    for (const [name, cs] of byMat) { const m = this._cellsMesh(name, cs, { x: ox, y: oy, z: oz }); if (m) grp.add(m); }
    const wc = this.group.localToWorld(new THREE.Vector3(ox, oy, oz));
    grp.position.copy(wc); this.scene.add(grp);
    // take any rebar rods embedded in this collapsing chunk so the steel FALLS WITH the slab/roof
    // instead of levitating where it used to be. grp.attach() keeps each rod's world pose.
    const M = 0.4;
    for (let i = this.rebar.children.length - 1; i >= 0; i--) {
      const p = this.rebar.children[i].position;
      if (p.x >= mnx - M && p.x <= mxx + M && p.y >= minY - M && p.y <= maxY + M && p.z >= mnz - M && p.z <= mxz + M) grp.attach(this.rebar.children[i]);
    }
    const body = makeTumble({ pos: [wc.x, wc.y, wc.z], vel: [(this._rnd() - 0.5) * 0.8, 0.2, (this._rnd() - 0.5) * 0.8], seed: this._seed(), radius: Math.max(0.2, (maxY - minY) / 2), g: FALL_G, spin: 0.55 });
    this.fallers.push({ grp, body });
    while (this.fallers.length > MAX_FALLERS) { const f = this.fallers.shift(); this.scene.remove(f.grp); f.grp.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } }); }
  }

  // sign / window loses its backing → detach the actual mesh and let it tumble to the ground
  _supportCheck() {
    for (const el of this.attached) {
      if (el.detached) continue;
      const live = el.support.reduce((a, c) => a + (c.alive ? 1 : 0), 0);
      if (el.total === 0 || live / el.total < SUPPORT_MIN) this._detach(el);
    }
  }

  _detach(el) {
    el.detached = true;
    const mesh = el.mesh, wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    mesh.getWorldPosition(wp); mesh.getWorldQuaternion(wq);
    const fg = new THREE.Group(); fg.position.copy(wp); fg.quaternion.copy(wq); this.scene.add(fg); fg.attach(mesh);
    if (el.kind === 'pane') { mesh.userData.dead = true; this.debris.burst('shards', [wp.x, wp.y, wp.z], this._seed()); }
    const body = makeTumble({ pos: [wp.x, wp.y, wp.z], vel: [(this._rnd() - 0.5) * 0.7, 0.1, (this._rnd() - 0.5) * 0.7], seed: this._seed(), radius: 0.3, g: FALL_G, spin: 0.8 });
    this.fallers.push({ grp: fg, body });
    while (this.fallers.length > MAX_FALLERS) { const f = this.fallers.shift(); this.scene.remove(f.grp); f.grp.traverse((o) => { if (o.isMesh && o.userData.kind !== 'pane' && o.userData.kind !== 'other') o.geometry.dispose(); }); }
  }

  _local(v) { this.group.updateWorldMatrix(true, false); return this.group.worldToLocal(v.clone()); }

  _cellAt(lp) {
    let best = null, bd = 0.30;     // ≤ ~0.55 m fallback if the ray grazes between cells
    for (const c of this.cells) {
      if (!c.alive) continue;
      const dx = Math.abs(lp.x - c.cx), dy = Math.abs(lp.y - c.cy), dz = Math.abs(lp.z - c.cz);
      if (dx <= c.sx / 2 + 1e-3 && dy <= c.sy / 2 + 1e-3 && dz <= c.sz / 2 + 1e-3) return c;
      const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ---- damage entry points (all take WORLD coords) ----

  // small-arms: F0 chip if pen<tier, else chew the cell's hp and carve it at hp≤0. Returns
  // { hit, penetrated, tier } — `penetrated` true for SOFT material it can damage (tier ≤ 2: glass/
  // wood/sheetmetal) so the caller's round carries on through (degradable cover, shoot-through walls).
  bullet(worldPoint, dir, weaponKey, hitObject) {
    if (hitObject && hitObject.userData.kind === 'pane') { this._shatterPane(hitObject); return { hit: true, penetrated: true, tier: 0 }; }
    const w = _weapon(weaponKey, LAB_WEAPONS.rifle);
    const c = this._cellAt(this._local(worldPoint));
    if (!c) return { hit: false, penetrated: false };
    const m = MATERIALS[c.mat], at = [worldPoint.x, worldPoint.y, worldPoint.z];
    const back = dir ? [-dir.x, -dir.y, -dir.z] : undefined;   // chips spall BACK toward the shooter
    const penetrated = w.pen >= m.tier && m.tier <= 2;         // soft & damageable ⇒ round passes through
    // F0 cosmetic chip — pen too low (e.g. HMG on brick/concrete): a LIGHT puff, not a breach burst
    if (w.pen < m.tier) { this.debris.burst(m.tier >= 5 ? 'sparks' : m.debris, at, this._seed(), CHIP_COUNT, back); return { hit: true, penetrated: false, tier: m.tier }; }
    c.hp -= w.dmg;
    if (c.hp > 0) { this.debris.burst(m.debris, at, this._seed(), CHIP_COUNT, back); return { hit: true, penetrated, tier: m.tier }; }   // chewing — light chips
    c.alive = false; this.debris.burst(m.debris, at, this._seed(), 6, back); this._settle(new Set([c.bucket]));
    return { hit: true, penetrated, tier: m.tier };
  }

  // HE: remove every cell with tier ≤ blast.tier inside r1 (sphere) → ragged breach; shatter all
  // glass inside r2; rubble ring + dust. (concrete tier 4 > 3 survives the default rocket — spec.)
  blast(worldPoint, weaponKey) {
    const w = _weapon(weaponKey, LAB_WEAPONS.heRocket);
    const blast = w.blast || { r1: 2.5, r2: 6, tier: 3 };
    const lp = this._local(worldPoint), dirty = new Set(), removed = [];
    let resisted = false;
    for (const c of this.cells) {
      if (!c.alive) continue;
      const dx = c.cx - lp.x, dy = c.cy - lp.y, dz = c.cz - lp.z;
      if (dx * dx + dy * dy + dz * dz > blast.r1 * blast.r1) continue;
      if (MATERIALS[c.mat].tier <= blast.tier) { c.alive = false; dirty.add(c.bucket); removed.push(c); }
      else resisted = true;                                  // too hard to breach — reinforced concrete shrugs it off
    }
    const pw = new THREE.Vector3();
    for (const p of this.panes) if (!p.userData.dead) { p.getWorldPosition(pw); if (pw.distanceTo(worldPoint) <= blast.r2) this._shatterPane(p); }
    if (!dirty.size) {
      if (resisted) { this.debris.burst('sparks', [worldPoint.x, worldPoint.y, worldPoint.z], this._seed()); this._dust(worldPoint, blast.r1 * 0.55); }   // the bunker held
      return false;
    }
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283, ox = Math.cos(a), oz = Math.sin(a); this.debris.burst('rubble', [worldPoint.x + ox * blast.r1 * 0.5, worldPoint.y + 0.2, worldPoint.z + oz * blast.r1 * 0.5], this._seed(), undefined, [ox, 0, oz]); }   // each chunk flies radially OUT from the blast
    this._dust(worldPoint, blast.r1);
    this._rebarFor(removed);
    this._settle(dirty);
    return true;
  }

  // APFSDS: no explosion — carve a clean tunnel of cells along the ray (entry → through → exit),
  // glass on the path shatters for free. The long-rod "drill", not a breach.
  penetrate(originW, dirW, weaponKey) {
    const w = _weapon(weaponKey, LAB_WEAPONS.apfsds);
    const lo = this._local(originW), ld = this._local(originW.clone().add(dirW)).sub(lo).normalize();
    const cand = [];
    for (const c of this.cells) {
      if (!c.alive) continue;
      const ox = c.cx - lo.x, oy = c.cy - lo.y, oz = c.cz - lo.z;
      const t = ox * ld.x + oy * ld.y + oz * ld.z; if (t < 0 || t > 60) continue;
      const dx = ox - ld.x * t, dy = oy - ld.y * t, dz = oz - ld.z * t;
      if (dx * dx + dy * dy + dz * dz <= TUNNEL_R * TUNNEL_R) cand.push({ c, t });
    }
    cand.sort((a, b) => a.t - b.t);
    // the rod drills cell-by-cell until it meets one too hard to penetrate (tier > pen) → it STOPS
    // there (reinforced concrete is not a through-hole; the rod splashes off in sparks).
    let stopT = Infinity, blocked = null;
    for (const k of cand) if (MATERIALS[k.c.mat].tier > w.pen) { stopT = k.t; blocked = k.c; break; }
    const dirty = new Set(), hitCells = [];
    for (const k of cand) { if (k.t >= stopT) break; k.c.alive = false; dirty.add(k.c.bucket); hitCells.push(k); }
    const pw = new THREE.Vector3(), aw = originW.clone();
    for (const p of this.panes) if (!p.userData.dead) { p.getWorldPosition(pw); const v = pw.clone().sub(aw); const t = v.dot(dirW); if (t > 0 && t < stopT * 1.1 && v.sub(dirW.clone().multiplyScalar(t)).length() < 0.6) this._shatterPane(p); }
    const wpAt = (cell) => this.group.localToWorld(new THREE.Vector3(cell.cx, cell.cy, cell.cz));
    const fwd = [dirW.x, dirW.y, dirW.z], back = [-dirW.x, -dirW.y, -dirW.z];
    if (blocked) {                                          // rod stopped on the bunker wall — sparks splash BACK
      const bp = wpAt(blocked);
      this.debris.burst('sparks', [bp.x, bp.y, bp.z], this._seed(), undefined, back);
      this.debris.burst(MATERIALS[blocked.mat].debris, [bp.x, bp.y, bp.z], this._seed(), CHIP_COUNT, back);
    }
    if (!hitCells.length) return !!blocked;
    const entry = wpAt(hitCells[0].c), exit = wpAt(hitCells[hitCells.length - 1].c);
    this.debris.burst('sparks', [entry.x, entry.y, entry.z], this._seed(), undefined, back);   // entry spall back toward the gun
    this.debris.burst('rubble', [exit.x, exit.y, exit.z], this._seed(), undefined, fwd);        // exit spall blown forward out the back wall
    this._rebarFor(hitCells.map((k) => k.c));
    this._settle(dirty);
    return true;
  }

  // vehicle crush (spec Pillar 4): a hull AABB shoves into the structure. Cells HARDER than the
  // vehicle's crushTier are immovable → BLOCKED (a tank can't push through concrete / a железобетон
  // bunker / steel). Softer cells (brick & below for a tank) get shoved through, leaving a hole;
  // `drag` ∈ (0,1] is how much the vehicle slows this frame (more / harder cells ⇒ slower).
  applyCrush(aabb, opts = {}) {
    const crushTier = opts.crushTier ?? 3;
    // NOTE: assumes the building group is NOT rotated (true for the demo). For a rotated building the
    // two transformed corners would not bound an axis-aligned local box — revisit for the game port.
    const lo = this._local(new THREE.Vector3(aabb.min.x, aabb.min.y, aabb.min.z));
    const hi = this._local(new THREE.Vector3(aabb.max.x, aabb.max.y, aabb.max.z));
    const x0 = Math.min(lo.x, hi.x), x1 = Math.max(lo.x, hi.x), y0 = Math.min(lo.y, hi.y), y1 = Math.max(lo.y, hi.y), z0 = Math.min(lo.z, hi.z), z1 = Math.max(lo.z, hi.z);
    const hit = [];
    for (const c of this.cells) {
      if (!c.alive) continue;
      if (c.cx + c.sx / 2 < x0 || c.cx - c.sx / 2 > x1) continue;
      if (c.cy + c.sy / 2 < y0 || c.cy - c.sy / 2 > y1) continue;
      if (c.cz + c.sz / 2 < z0 || c.cz - c.sz / 2 > z1) continue;
      hit.push(c);
    }
    // smash any glass pane / knock the sign the hull reaches FIRST — a tank doesn't leave a window
    // (or its frame) hanging in the air, and the glass goes whether or not it gets through behind it.
    let smashed = 0;
    const wp = new THREE.Vector3(), inBox = (p) => p.x >= aabb.min.x && p.x <= aabb.max.x && p.y >= aabb.min.y && p.y <= aabb.max.y && p.z >= aabb.min.z && p.z <= aabb.max.z;
    for (const p of this.panes) if (!p.userData.dead) { p.getWorldPosition(wp); if (inBox(wp)) { this._shatterPane(p); smashed++; } }
    for (const el of (this.attached || [])) if (!el.detached && el.kind === 'sign') { el.mesh.getWorldPosition(wp); if (inBox(wp)) { this._detach(el); smashed++; } }
    // BLOCK only on real mass of hard material: steel / железобетон stops a tank as a sliver, but plain
    // concrete stops it only as a WALL (a stray sill/lintel is smashed through, not a wall to a tank).
    const hard = hit.filter((c) => MATERIALS[c.mat].tier > crushTier);
    if (hard.length) return { blocked: true, drag: 0, crushed: smashed, hard: hard.length };   // harder than this vehicle can crush → stop dead
    if (!hit.length) return { blocked: false, drag: smashed ? 0.92 : 1, crushed: smashed, hard: 0 };
    const dirty = new Set(); let resist = 0;
    for (const c of hit) { c.alive = false; dirty.add(c.bucket); resist += (MATERIALS[c.mat].tier + 1) * (MATERIALS[c.mat].tier >= crushTier ? 3 : 1); }   // the hardest stuff it CAN crush resists ~3×
    // rubble flies OUT in the push direction (opts.dir) — like masonry blown forward off the hull
    const cx = (aabb.min.x + aabb.max.x) / 2, cy = (aabb.min.y + aabb.max.y) / 2, cz = (aabb.min.z + aabb.max.z) / 2;
    this.debris.burst('rubble', [cx, cy, cz], this._seed(), 7, opts.dir);
    this._rebarFor(hit);
    this._settle(dirty);
    return { blocked: false, drag: Math.max(0.35, 1 - resist * 0.02), crushed: hit.length + smashed, hard: hard.length };
  }

  // ── GAME BRIDGE: AABB collision + the weapons.js apply* contract + host-auth co-op ───────────────
  // world.rayHit only sees AABB boxes, so register one per cell (+ pane). box.downer===this routes a hit
  // back here via weapons.js _destructHit; box.building lets it call applyHit/applyBlast/applyPenetration.
  _registerBoxes() {
    this.group.updateWorldMatrix(true, true);
    this._boxByCell = new Map(); this._paneBox = new Map();
    const lo = new THREE.Vector3(), hi = new THREE.Vector3();
    for (const c of this.cells) {
      this.group.localToWorld(lo.set(c.cx - c.sx / 2, c.cy - c.sy / 2, c.cz - c.sz / 2));
      this.group.localToWorld(hi.set(c.cx + c.sx / 2, c.cy + c.sy / 2, c.cz + c.sz / 2));
      const box = { min: new THREE.Vector3(Math.min(lo.x, hi.x), Math.min(lo.y, hi.y), Math.min(lo.z, hi.z)),
                    max: new THREE.Vector3(Math.max(lo.x, hi.x), Math.max(lo.y, hi.y), Math.max(lo.z, hi.z)),
                    downer: this, building: true, dmat: c.mat, cell: c };
      this.world.boxes.push(box); this.world.grid.addBox(box); this._boxByCell.set(c, box);
    }
    const bb = new THREE.Box3();
    for (const p of this.panes) {
      p.updateWorldMatrix(true, false); bb.setFromObject(p); bb.expandByScalar(0.05);   // thin plane → give it bite
      const box = { min: bb.min.clone(), max: bb.max.clone(), downer: this, building: true, dmat: 'glass', pane: p };
      this.world.boxes.push(box); this.world.grid.addBox(box); this._paneBox.set(p, box);
    }
  }

  // after each event: retire the collision box of every cell/pane that just died → holes in collision.
  // Returns the ids of cells whose box was removed this call (the co-op delta).
  _syncBoxes() {
    if (!this.world) return [];
    const dead = [];
    if (this._boxByCell) for (const [c, box] of this._boxByCell) if (!c.alive) {
      this.world.grid.removeBox(box); const i = this.world.boxes.indexOf(box); if (i >= 0) this.world.boxes.splice(i, 1);
      this._boxByCell.delete(c); dead.push(c.id);
    }
    if (this._paneBox) for (const [p, box] of this._paneBox) if (p.userData.dead) {
      this.world.grid.removeBox(box); const i = this.world.boxes.indexOf(box); if (i >= 0) this.world.boxes.splice(i, 1);
      this._paneBox.delete(p);
    }
    return dead;
  }

  _hostSim() { const mp = this.game && this.game.mp; return !mp || !mp.active || mp.isHost; }

  // weapons.js _destructHit calls these (box.building → downer.applyHit/Blast/Penetration). Host-auth.
  applyHit(point, normal, dir, weaponDef, box) {
    if (!this._hostSim()) return { hit: false };
    const p = point.isVector3 ? point : new THREE.Vector3(point[0], point[1], point[2]);
    const r = (box && box.pane) ? this.bullet(p, dir, weaponDef, box.pane) : this.bullet(p, dir, weaponDef);
    this._broadcast(this._syncBoxes());
    return r;
  }
  applyBlast(pos, radius, ammoDef) {
    if (!this._hostSim()) return false;
    const p = pos.isVector3 ? pos : new THREE.Vector3(pos[0], pos[1], pos[2]);
    const w = { blast: (ammoDef && ammoDef.blast) || { r1: radius * 0.45, r2: radius, tier: (ammoDef && ammoDef.blastTier) ?? 3 } };
    const r = this.blast(p, w);
    this._broadcast(this._syncBoxes());
    return r;
  }
  applyPenetration(origin, dir, weaponDef) {
    if (!this._hostSim()) return false;
    const o = origin.isVector3 ? origin : new THREE.Vector3(origin[0], origin[1], origin[2]);
    const d = dir.isVector3 ? dir : new THREE.Vector3(dir[0], dir[1], dir[2]);
    const r = this.penetrate(o, d, weaponDef);
    this._broadcast(this._syncBoxes());
    return r;
  }

  // co-op (BASIC — 2-PC is a manual gate): host streams the dead-cell delta; clients mirror cells dead,
  // rebuild the touched buckets and re-run the support check so panes + the SIGN detach the same way.
  _broadcast(deadIds) {
    const mp = this.game && this.game.mp;
    if (!mp || !mp.active || !mp.isHost || !mp.net || !deadIds || !deadIds.length) return;
    try { mp.net.send('bdestroy', { id: this.netId || 'forestbld', cells: deadIds }); } catch (e) {}
  }
  applyNetDestroy(deadIds) {
    if (!deadIds || !deadIds.length) return;
    if (!this._cellById) { this._cellById = new Map(); for (const c of this.cells) this._cellById.set(c.id, c); }
    const dirty = new Set();
    for (const id of deadIds) { const c = this._cellById.get(id); if (c && c.alive) { c.alive = false; dirty.add(c.bucket); } }
    if (!dirty.size) return;
    this._commit([...dirty]); this._supportCheck(); this._syncBoxes();
  }
  netSnapshot() { return { id: this.netId || 'forestbld', cells: this.cells.filter((c) => !c.alive).map((c) => c.id) }; }

  // hero glass: shard burst + a clinging jagged remnant (cosmetic)
  _shatterPane(p) {
    if (p.userData.dead) return;
    p.userData.dead = true;
    const pw = new THREE.Vector3(); p.getWorldPosition(pw);
    this.debris.burst('shards', [pw.x, pw.y, pw.z], this._seed());
    p.scale.y = 0.16; p.scale.x = 0.92;                       // sliver remnant left in the frame
    if (p.material) { p.material.opacity = Math.max(0.1, (p.material.opacity ?? 0.4) * 0.5); p.material.needsUpdate = true; }
  }

  // hero detail: when CONCRETE breaks, leave a few thin steel rods jutting from the break face
  _rebarFor(cells) {
    const reb = cells.filter((c) => c.mat === 'concrete' || c.mat === 'reinforcedConcrete');
    if (!reb.length || this._rebarN >= MAX_REBAR) return;
    if (!this._rebarMat) this._rebarMat = new THREE.MeshLambertMaterial({ color: 0x6b6f73 });
    const step = Math.max(1, Math.floor(reb.length / 5));
    for (let i = 0; i < reb.length && this._rebarN < MAX_REBAR; i += step) {
      const c = reb[i], h = c.sy * (1.5 + this._rnd() * 0.7);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, h, 4), this._rebarMat);
      rod.position.set(c.cx + (this._rnd() - 0.5) * c.sx * 0.6, c.cy, c.cz + (this._rnd() - 0.5) * c.sz * 0.6);
      rod.rotation.set((this._rnd() - 0.5) * 0.5, 0, (this._rnd() - 0.5) * 0.5);
      rod.castShadow = true; this.rebar.add(rod); this._rebarN++;
    }
  }

  // a couple of small low-opacity puffs that bloom + fade fast — dressing, never a screen-filling ball
  _dust(p, r) {
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xb7ab93, transparent: true, opacity: 0.22, depthWrite: false }));
      mesh.position.set(p.x + (this._seed() / 4294967296 - 0.5) * r, p.y + (this._seed() / 4294967296 - 0.5) * r * 0.6, p.z + (this._seed() / 4294967296 - 0.5) * r);
      const r0 = r * 0.28; mesh.scale.setScalar(r0); this.scene.add(mesh);
      this.dust.push({ mesh, life: 0.55, max: 0.55, r0 });
    }
  }

  update(dt) {
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]; d.life -= dt;
      if (d.life <= 0) { this.scene.remove(d.mesh); d.mesh.geometry.dispose(); d.mesh.material.dispose(); this.dust.splice(i, 1); continue; }
      const k = 1 - d.life / d.max; d.mesh.scale.setScalar(d.r0 * (1 + k * 2.0)); d.mesh.material.opacity = 0.22 * (1 - k);
    }
    // falling chunks (orphaned roof/walls/sign/panes) tumble to the ground and rest there as rubble
    for (const f of this.fallers) {
      if (!f.body.settled) {
        stepBody(f.body, dt);
        f.grp.position.set(f.body.pos[0], f.body.pos[1], f.body.pos[2]);
        _axis.set(f.body.rotAxis[0], f.body.rotAxis[1], f.body.rotAxis[2]).normalize();
        f.grp.quaternion.setFromAxisAngle(_axis, f.body.rotAngle);
      }
      if (f.body.settled && !f.landed) { f.landed = true; this._dust(new THREE.Vector3(f.body.pos[0], Math.max(0.25, f.body.pos[1]), f.body.pos[2]), 1.3); }
    }
  }

  // current raycast occluders (pristine mesh until a bucket is voxelised, then its rebuilt mesh)
  meshes() {
    const out = [];
    for (const [, bk] of this.buckets) { if (bk.voxelised) { if (bk.mesh) out.push(bk.mesh); } else if (bk.original) out.push(bk.original); }
    for (const p of this.panes) if (!p.userData.dead) out.push(p);
    for (const ch of this.group.children) if (ch.isMesh && ch.userData.kind === 'other') out.push(ch);
    return out;
  }

  stats() {
    const alive = this.cells.filter((c) => c.alive).length;
    return { cells: this.cells.length, alive, carved: this.cells.length - alive, panes: this.panes.length, paneBroken: this.panes.filter((p) => p.userData.dead).length, fallers: this.fallers.length, detached: (this.attached || []).filter((a) => a.detached).length, voxelised: [...this.buckets].filter(([, b]) => b.voxelised).map(([n]) => n) };
  }
}
