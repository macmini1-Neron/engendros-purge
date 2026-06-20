// forestdemo.js — DEMO-FAITHFUL trees for ?map=forest (replaces the game's instanced forest here).
// Individual round-trunk makeTree meshes that FELL into a standing STUMP + a hinge-falling CANOPY
// (the standalone forest-destruct demo's destruction), not the game's instanced hide-instance + snag.
//
// Drop-in for `game.forest`: weapons.js already dispatches a tree hit as
//   box.tree → resolveHit(box.downer.part, w) → killed ? game.forest.fellTree(tree, [dir.x,dir.z], seed)
// so each tree registers an AABB collision box with box.downer = the tree record + box.tree = true, and
// we expose fellTree / blast / penetrate / clearArea / update / debris / netSnapshot — nothing else needed.
import * as THREE from 'three';
import { makeTree } from './props/generators/tree.js';
import { makePart, MATERIALS, makeHinge, stepBody } from './destruct.js';
import { rr } from './util.js';

const _axis = new THREE.Vector3();
const ri = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
// crush class → ballistics: saplings are WOOD (tier 1, a rifle fells them); grown trees + oak are
// TRUNK (tier 2, need an HMG+). HP from the demo so felling stays responsive (a few hits, not a magazine).
const SPECIES_CLS = { scotsPine: 2, birch: 2, oak: 3, poplar: 2, willow: 2 };
const TREE_HP = { 1: 30, 2: 110, 3: 200 };
const CLS_MAT = { 1: 'wood', 2: 'trunk', 3: 'trunk' };
const TREE_MIX = [['scotsPine', 60], ['birch', 18], ['oak', 8], ['poplar', 6], ['willow', 8]];

export class ForestDemo {
  // debris = the ForestScene's shared DebrisPool (the scene steps it, so we never call debris.update)
  constructor(game, debris) {
    this.game = game; this.world = game.world; this.scene = this.world.scene; this.debris = debris;
    this.trees = []; this.stumps = []; this.FALLING = []; this.windy = [];
    this._t = 0; this._idc = 0; this._reserved = [];
  }

  reserve(x, z, r) { this._reserved.push({ x, z, r }); }     // keep-out (cottage / crate footprints)

  _pickSpecies() {
    let tot = 0; for (const [, w] of TREE_MIX) tot += w;
    let n = Math.random() * tot;
    for (const [s, w] of TREE_MIX) { if ((n -= w) <= 0) return s; }
    return 'scotsPine';
  }

  _blocked(x, z, minD) {
    for (const r of this._reserved) { const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < (r.r) * (r.r)) return true; }
    for (const t of this.trees) { const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz < minD * minD) return true; }
    return false;
  }

  // scatter `n` grown trees + `nSap` saplings into dense STANDS (clusters) within `rad`, avoiding
  // reserves, neighbours and steep ground. Stands matter: trees a few m apart let the FIRE ember
  // chain jump tree→tree (spread radius 6 m), and the woods read as a forest, not a sprinkle. Call
  // AFTER reserve()-ing the building footprints.
  scatter(n = 116, nSap = 34, rad = 80) {
    const terr = this.world.terrain;
    const NS = 9, stands = [];
    for (let s = 0; s < NS; s++) {
      const a = (s / NS) * Math.PI * 2 + rr(-0.35, 0.35), d = 22 + Math.random() * (rad - 22);
      stands.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, r: 10 + Math.random() * 8 });
    }
    const drop = (count, scaleLo, scaleHi, minD, footR, sapling) => {
      for (let i = 0; i < count; i++) {
        for (let tries = 0; tries < 12; tries++) {
          const st = stands[(Math.random() * stands.length) | 0];
          const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * st.r;
          const x = st.x + Math.cos(a) * d, z = st.z + Math.sin(a) * d;
          if (Math.abs(x) > this.world.HALF - 6 || Math.abs(z) > this.world.HALF - 6) continue;
          if (terr && !terr.isPlaceable(x, z, footR, 'tree')) continue;
          if (this._blocked(x, z, minD)) continue;
          this._addTree(sapling ? 'birch' : this._pickSpecies(), x, z, rr(scaleLo, scaleHi), i * 17 + (sapling ? 700 : 3), sapling); break;
        }
      }
    };
    drop(n, 0.9, 1.25, 3.2, 1.0, false);     // grown trees — ~3.2 m apart inside a stand ⇒ fire chains
    drop(nSap, 0.42, 0.6, 2.2, 0.6, true);   // birch saplings filling the understory
  }

  _addTree(species, x, z, scale, seed, sapling) {
    const res = makeTree({ species, seed, lod: 0, scale });
    const m = new THREE.Mesh(res.geometry, res.material);
    const yaw = rr(0, Math.PI * 2);
    const y = this.world.terrain ? this.world.terrain.terrainHeightAt(x, z) : 0;
    m.position.set(x, y, z); m.rotation.y = yaw; m.castShadow = true;
    this.scene.add(m);
    const cls = sapling ? 1 : (SPECIES_CLS[species] || 2);
    const mat = CLS_MAT[cls];
    const id = ++this._idc;
    const half = 0.30 * scale + 0.10;                          // trunk-hugging collision column (shoot the trunk to fell)
    const topY = y + Math.min(res.height, 5.0);
    const min = [x - half, y, z - half], max = [x + half, topY, z + half];
    const part = makePart(id, mat, min, max, TREE_HP[cls] / MATERIALS[mat].hp);   // dhp = the demo's TREE_HP
    const rec = { id, species, seed, scale, x, z, yaw, baseY: y, height: res.height, mesh: m, cls, part, standing: true, box: null };
    part.downer = rec;
    const box = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), downer: rec, tree: true, dmat: mat, dpart: id };
    rec.box = box; this.world.boxes.push(box); this.world.grid.addBox(box);
    this.trees.push(rec);
    if (!sapling) this.windy.push({ m, yaw, amp: 0.018 + rr(0, 0.022), ph: rr(0, 6.28), speed: 0.8 + rr(0, 1.2) });
  }

  _dropBox(rec) {
    if (!rec.box) return;
    this.world.grid.removeBox(rec.box); const i = this.world.boxes.indexOf(rec.box); if (i >= 0) this.world.boxes.splice(i, 1); rec.box = null;
  }

  // weapons.js _destructHit calls this when a tree's trunk part is killed. dirXZ = the SHOT direction
  // ([dir.x, dir.z]) so the canopy hinges DOWN away from the shooter. Rebuilds the tree split:
  // a standing stump (kept) + the canopy on a pivot that falls under makeHinge gravity.
  fellTree(rec, dirXZ = null, seed = null) {
    if (!rec || !rec.standing) return;
    rec.standing = false;
    if (rec.part) rec.part.dead = true;                     // off the flammable list — a felled tree can't re-ignite
    if (rec.mesh) { this.scene.remove(rec.mesh); rec.mesh = null; }
    this._dropBox(rec);
    let dx = dirXZ ? dirXZ[0] : (Math.random() - 0.5), dz = dirXZ ? dirXZ[1] : (Math.random() - 0.5);
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const sd = ((seed ?? (rec.id * 2654435761)) >>> 0) || 1;
    const breakAt = rec.cls === 1 ? 0.1 : 0.12 + Math.random() * 0.18;     // snap low; saplings near the base
    // A fire-killed tree fells as its BARE BLACKENED charred self (no leaves); a bullet/blast-felled tree
    // keeps its foliage. Either way pass height: rec.height so the split matches the standing tree exactly.
    const split = makeTree({ species: rec.species, seed: rec.seed, scale: rec.scale, height: rec.height, breakAt, damage: rec.charred ? 'charred' : undefined });
    const y0 = rec.baseY;
    const stump = new THREE.Mesh(split.stumpGeometry, split.material);
    stump.position.set(rec.x, y0, rec.z); stump.rotation.y = rec.yaw; stump.castShadow = true;
    this.scene.add(stump); this.stumps.push(stump);
    const top = new THREE.Mesh(split.topGeometry, split.material); top.rotation.y = rec.yaw;
    const pivot = new THREE.Group(); pivot.position.set(rec.x, y0 + split.breakY, rec.z); pivot.add(top);
    this.scene.add(pivot);
    const length = Math.max(0.5, rec.height - split.breakY);
    const groundAt = this.world.terrain ? (gx, gz) => this.world.terrain.terrainHeightAt(gx, gz) : null;
    const body = makeHinge({ pivot: [rec.x, y0 + split.breakY, rec.z], dirXZ: [dx, dz], length, radius: 0.22, seed: sd, obstacles: [], groundAt });
    this.FALLING.push({ kind: 'hinge', body, pivot });
    if (this.debris) this.debris.burst('splints', [rec.x, y0 + split.breakY, rec.z], sd, undefined, [dx, 0, dz]);
  }

  // HE blast: fell every standing tree within `radius` whose tier ≤ blastTier (+1 so a tier-3 rocket
  // still topples grown trunks). dir of fall = radially outward from the blast.
  blast(pos, radius, blastTier = 3) {
    for (const rec of this.trees) {
      if (!rec.standing) continue;
      const dx = rec.x - pos.x, dz = rec.z - pos.z;
      if (dx * dx + dz * dz <= radius * radius && MATERIALS[rec.part.dmat].tier <= blastTier + 1) {
        rec.part.dead = true; this.fellTree(rec, [dx, dz], (rec.id * 1597) >>> 0);
      }
    }
  }

  // APFSDS / penetrator: fell standing trees the rod passes through (tier ≤ pen).
  penetrate(origin, dir, range, w) {
    const pen = (w && w.pen != null) ? w.pen : 5;
    for (const rec of this.trees) {
      if (!rec.standing) continue;
      const ox = rec.x - origin.x, oz = rec.z - origin.z, t = ox * dir.x + oz * dir.z;
      if (t < 0 || t > range) continue;
      const px = ox - dir.x * t, pz = oz - dir.z * t;
      if (px * px + pz * pz <= 0.8 * 0.8 && MATERIALS[rec.part.dmat].tier <= pen) {
        rec.part.dead = true; this.fellTree(rec, [dir.x, dir.z], (rec.id * 7919) >>> 0);
      }
    }
  }

  hitProp() {}                                                // no separate props here (crates are buildings)

  // ── FIRE (game FireManager) — the molotov/rocket fire path. FireManager enumerates burnables via
  // flammableParts(), then chars (charTree → snaps easier) + fells (fellTree on burnout) by the part's
  // owner (= the tree record we set as part.downer). trunk(fuel 10)/wood(fuel 6) burn; the ember chain
  // spreads tree↔tree on its own. ──────────────────────────────────────────────────────────────────
  flammableParts() {
    const out = [];
    for (const t of this.trees) if (t.standing && t.part && !t.part.dead) out.push(t.part);
    return out;
  }
  charTree(tree) {
    if (!tree || !tree.standing || tree.charred) return;
    tree.charred = true;
    if (tree.part) tree.part.dhp = Math.max(1, tree.part.dhp * 0.5);   // charred wood snaps under the next hit
    if (!tree.mesh) return;
    // Rebuild the STANDING tree as its bare, blackened CHARRED self — same species/seed/scale and the
    // SAME height (rec.height, NOT the short burntCharred snag) so the dead snag matches its neighbours.
    // The leaves burn off in place (the fire keeps spanning the now-bare trunk) and it later fells charred.
    try {
      const res = makeTree({ species: tree.species, seed: tree.seed, scale: tree.scale, height: tree.height, lod: 0, damage: 'charred' });
      const old = tree.mesh;
      const m = new THREE.Mesh(res.geometry, res.material);
      m.position.copy(old.position); m.rotation.y = tree.yaw; m.castShadow = true;
      this.scene.add(m); tree.mesh = m;
      for (const w of this.windy) if (w.m === old) { w.m = m; break; }   // keep the (barely-swaying) snag wired to wind
      this.scene.remove(old);
      if (old.geometry) old.geometry.dispose();
      if (old.material && old.material.dispose) old.material.dispose();
    } catch (e) {
      if (tree.mesh.material && tree.mesh.material.color) tree.mesh.material.color.setHex(0x4a4038); // fallback: just scorch-tint
    }
  }
  charTreeById(id) { const t = this._treeById(id); if (t) this.charTree(t); }

  clearArea(cx, cz, r) {
    for (const rec of this.trees) {
      if (!rec.standing) continue;
      const dx = rec.x - cx, dz = rec.z - cz;
      if (dx * dx + dz * dz < r * r) { if (rec.mesh) { this.scene.remove(rec.mesh); rec.mesh = null; } this._dropBox(rec); rec.standing = false; rec.cleared = true; }
    }
  }

  update(dt) {
    this._t += dt; const t = this._t;
    for (const f of this.FALLING) {
      if (f.body.settled) continue;
      stepBody(f.body, dt);
      _axis.set(f.body.dirXZ[1], 0, -f.body.dirXZ[0]).normalize();   // hinge axis ⟂ fall direction
      f.pivot.quaternion.setFromAxisAngle(_axis, f.body.angle);
    }
    const gust = 0.5 + 0.4 * Math.sin(t * 0.5) + 0.2 * Math.sin(t * 1.7 + 1.3);
    for (const w of this.windy) {
      if (!w.m.parent) continue;
      const sz = Math.sin(t * w.speed + w.ph) * w.amp * gust;
      w.m.rotation.set(Math.cos(t * w.speed * 0.7 + w.ph) * w.amp * 0.5 * gust, w.yaw, sz);
    }
  }

  // ── co-op (basic — manual gate): fell ids streamed by the host ──
  netSnapshot() { return this.trees.filter((t) => !t.standing && !t.cleared).map((t) => ({ id: t.id, dx: 0, dz: 1 })); }
  _treeById(id) { return this.trees.find((t) => t.id === id); }
  fellTreeById(id, dx, dz, seed) { const t = this._treeById(id); if (t && t.standing) { t.part.dead = true; this.fellTree(t, [dx, dz], seed); } }
  stats() { return { trees: this.trees.length, standing: this.trees.filter((t) => t.standing).length, falling: this.FALLING.length }; }
}
