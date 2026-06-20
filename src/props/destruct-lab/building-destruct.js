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
import { MeshBuilder, voxelMaterial } from '../../util.js';
import { resolveMaterial } from '../../buildings/palette.js';
import { makeTextureCanvas } from '../../buildings/textures.js';
import { MATERIALS, LAB_WEAPONS } from './matrix.js';

const CELL = 0.45;          // voxel cell size (m) — smaller = finer holes, more rebuild cost
const TUNNEL_R = 0.42;      // APFSDS through-hole radius (m)
// buildgen material key → destruction material (matrix.js MATERIALS)
const MAT_MAP = { brickRed: 'brick', concrete: 'concrete', corrugatedTin: 'sheetmetal', glassPane: 'glass', signage: 'sheetmetal' };

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
  // { group: buildBuilding() root, prims: planBuild(spec).prims, scene, debris: DebrisPool, seed }
  constructor({ group, prims, scene, debris, seed = 7 }) {
    this.group = group; this.scene = scene; this.debris = debris; this.seed = seed >>> 0;
    this._sid = 1; this._rng = (this.seed || 1) >>> 0;
    this.cells = [];                 // flat list of every cell (events iterate this; n≈800, cheap)
    this.buckets = new Map();        // matName → { cells, original, mesh, voxelised }
    this.panes = [];                 // hero glass plane meshes
    this.dust = [];                  // live dust puffs (animated in update)
    this._captureOriginals();
    this._voxelize(prims);
  }

  _seed() { this._rng = (this._rng * 1664525 + 1013904223) >>> 0; return this._rng; }
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
      const dmat = MAT_MAP[name] ?? 'concrete';
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

  // rebuild one bucket's mesh from its surviving cells (same texture path as interp.js)
  _buildBucketMesh(name) {
    const bk = this._bucket(name);
    if (bk.mesh) { this.group.remove(bk.mesh); bk.mesh.geometry.dispose(); bk.mesh = null; }
    const alive = bk.cells.filter((c) => c.alive);
    if (!alive.length) return;
    const entry = resolveMaterial(name);
    const tone = new THREE.Color(entry.tones?.mid ?? entry.color ?? 0x888888).getHex();
    const mb = new MeshBuilder();
    for (const c of alive) mb.box(c.sx, c.sy, c.sz, c.cx, c.cy, c.cz, tone);
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
    mesh.castShadow = mesh.receiveShadow = true; mesh.name = `voxel:${name}`;
    mesh.userData = { house: true, _bd: this, kind: 'cell', bucket: name };
    this.group.add(mesh); bk.mesh = mesh;
  }

  // apply removals: first damage to a bucket hides its pristine mesh; then rebuild from survivors
  _commit(names) {
    for (const name of names) {
      const bk = this._bucket(name);
      if (!bk.voxelised) { bk.voxelised = true; if (bk.original) bk.original.visible = false; }
      this._buildBucketMesh(name);
    }
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

  // small-arms: F0 chip if pen<tier, else chew the cell's hp and carve it at hp≤0
  bullet(worldPoint, dir, weaponKey, hitObject) {
    if (hitObject && hitObject.userData.kind === 'pane') { this._shatterPane(hitObject); return true; }
    const w = LAB_WEAPONS[weaponKey] || LAB_WEAPONS.rifle;
    const c = this._cellAt(this._local(worldPoint));
    if (!c) return false;
    const m = MATERIALS[c.mat], at = [worldPoint.x, worldPoint.y, worldPoint.z];
    if (w.pen < m.tier) { this.debris.burst(m.debris, at, this._seed()); return true; }   // F0 cosmetic chip
    c.hp -= w.dmg; this.debris.burst(m.debris, at, this._seed());
    if (c.hp <= 0) { c.alive = false; this._commit([c.bucket]); }
    return true;
  }

  // HE: remove every cell with tier ≤ blast.tier inside r1 (sphere) → ragged breach; shatter all
  // glass inside r2; rubble ring + dust. (concrete tier 4 > 3 survives the default rocket — spec.)
  blast(worldPoint, weaponKey) {
    const w = LAB_WEAPONS[weaponKey] || LAB_WEAPONS.heRocket;
    const blast = w.blast || { r1: 2.5, r2: 6, tier: 3 };
    const lp = this._local(worldPoint), dirty = new Set();
    for (const c of this.cells) {
      if (!c.alive) continue;
      const dx = c.cx - lp.x, dy = c.cy - lp.y, dz = c.cz - lp.z;
      if (dx * dx + dy * dy + dz * dz <= blast.r1 * blast.r1 && MATERIALS[c.mat].tier <= blast.tier) { c.alive = false; dirty.add(c.bucket); }
    }
    const pw = new THREE.Vector3();
    for (const p of this.panes) if (!p.userData.dead) { p.getWorldPosition(pw); if (pw.distanceTo(worldPoint) <= blast.r2) this._shatterPane(p); }
    if (!dirty.size) return false;
    this._commit([...dirty]);
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; this.debris.burst('rubble', [worldPoint.x + Math.cos(a) * blast.r1 * 0.5, worldPoint.y + 0.2, worldPoint.z + Math.sin(a) * blast.r1 * 0.5], this._seed()); }
    this._dust(worldPoint, blast.r1);
    return true;
  }

  // APFSDS: no explosion — carve a clean tunnel of cells along the ray (entry → through → exit),
  // glass on the path shatters for free. The long-rod "drill", not a breach.
  penetrate(originW, dirW, weaponKey) {
    const lo = this._local(originW), ld = this._local(originW.clone().add(dirW)).sub(lo).normalize();
    const dirty = new Set(); let removed = 0;
    for (const c of this.cells) {
      if (!c.alive) continue;
      const ox = c.cx - lo.x, oy = c.cy - lo.y, oz = c.cz - lo.z;
      const t = ox * ld.x + oy * ld.y + oz * ld.z; if (t < 0 || t > 60) continue;
      const dx = ox - ld.x * t, dy = oy - ld.y * t, dz = oz - ld.z * t;
      if (dx * dx + dy * dy + dz * dz <= TUNNEL_R * TUNNEL_R) { c.alive = false; dirty.add(c.bucket); removed++; }
    }
    const pw = new THREE.Vector3(), aw = originW.clone();
    for (const p of this.panes) if (!p.userData.dead) { p.getWorldPosition(pw); const v = pw.clone().sub(aw); const t = v.dot(dirW); if (t > 0 && v.sub(dirW.clone().multiplyScalar(t)).length() < 0.6) this._shatterPane(p); }
    if (!dirty.size) return false;
    this._commit([...dirty]);
    this.debris.burst('sparks', [originW.x + dirW.x, originW.y + dirW.y, originW.z + dirW.z], this._seed());
    this.debris.burst('rubble', [originW.x + dirW.x * 3, originW.y + dirW.y * 3, originW.z + dirW.z * 3], this._seed());
    return removed > 0;
  }

  // hero glass: shard burst + a clinging jagged remnant (cosmetic)
  _shatterPane(p) {
    if (p.userData.dead) return;
    p.userData.dead = true;
    const pw = new THREE.Vector3(); p.getWorldPosition(pw);
    this.debris.burst('shards', [pw.x, pw.y, pw.z], this._seed());
    p.scale.y = 0.16; p.scale.x = 0.92;                       // sliver remnant left in the frame
    if (p.material) { p.material.opacity = Math.max(0.1, (p.material.opacity ?? 0.4) * 0.5); p.material.needsUpdate = true; }
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
    return { cells: this.cells.length, alive, carved: this.cells.length - alive, panes: this.panes.length, paneBroken: this.panes.filter((p) => p.userData.dead).length, voxelised: [...this.buckets].filter(([, b]) => b.voxelised).map(([n]) => n) };
  }
}
