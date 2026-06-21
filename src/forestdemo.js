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
const TREE_HP = { 1: 20, 2: 55, 3: 100 };   // destructive vibe: rifle fells a grown tree in a burst, HMG/HE/APFSDS instantly
const CLS_MAT = { 1: 'wood', 2: 'trunk', 3: 'trunk' };
const TREE_MIX = [['scotsPine', 60], ['birch', 18], ['oak', 8], ['poplar', 6], ['willow', 8]];

export class ForestDemo {
  // debris = the ForestScene's shared DebrisPool (the scene steps it, so we never call debris.update)
  constructor(game, debris) {
    this.game = game; this.world = game.world; this.scene = this.world.scene; this.debris = debris;
    this.trees = []; this.stumps = []; this.stumpBoxes = []; this.logs = []; this.FALLING = []; this.windy = [];
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
  scatter(n = 150, nSap = 45, rad = 120) {
    const terr = this.world.terrain;
    const NS = 11, stands = [];          // denser wood: more stands + more trees + tighter spacing (see drop())
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
    drop(n, 0.9, 1.25, 2.7, 1.0, false);     // grown trees — ~2.7 m apart inside a stand ⇒ denser + fire chains
    drop(nSap, 0.42, 0.6, 2.0, 0.6, true);   // birch saplings filling the understory
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
    const trunkR = res.trunkRadius || (0.30 * scale);          // REAL base trunk radius (world units), per species
    const H = res.height, topY = y + H;
    const half = trunkR + 0.12;
    // FIRE/record AABB: a simple trunk-centred column. fire.js reads part.min/max to seat the flame, which
    // must rise from the TRUNK base, not the wide lean-offset canopy — so the part stays a tight bole column
    // independent of the precise hit boxes below.
    const part = makePart(id, mat, [x - half, y, z - half], [x + half, topY, z + half], TREE_HP[cls] / MATERIALS[mat].hp);
    const rec = { id, species, seed, scale, x, z, yaw, baseY: y, height: H, trunkR, mesh: m, cls, part, standing: true, boxes: [] };
    part.downer = rec;
    // ── PRECISE HITBOXES (the headline fix) ──────────────────────────────────────────────────────────
    // Built from the tree's REAL geometry (tree.js returns the leaning trunk centreline + the MEASURED
    // leaf-mass envelope), then rotated by this tree's yaw into world AABBs:
    //   · TRUNK — a few SOLID bands that hug the leaning bole (you can't walk through or shoot past it).
    //     One base-centred column missed the lean entirely → shots at the upper bole hit nothing.
    //   · CANOPY — ONE box matching the actual foliage, flagged `foliage` (soft cover): the raycast hits
    //     it but movement passes THROUGH it (slowed — World.foliageSlowAt). The crown is 10–20 m wide; a
    //     SOLID box that size walls the whole footprint — that floating box was also a phantom wall.
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const addBox = (mn, mx, foliage, thicket) => {
      const b = { min: new THREE.Vector3(...mn), max: new THREE.Vector3(...mx), downer: rec, tree: true, dmat: mat, dpart: id };
      if (foliage) b.foliage = true;   // soft cover: raycast hits it (shoot/conceal), movement passes THROUGH it
      if (thicket) b.thicket = true;   // …and SLOWS a body inside it. Only ground-level foliage you push through
      rec.boxes.push(b); this.world.boxes.push(b); this.world.grid.addBox(b);  // (saplings/bushes/fallen crowns) — NOT a tall tree's overhead crown (you walk under that; its wide AABB would over-slow neighbours).
    };
    const spine = res.spine;
    if (spine && spine.length) {
      const NB = 3;                                            // 3 bands track the lean tightly base→crown
      for (let s = 0; s < NB; s++) {
        const y0 = (s / NB) * H, y1 = ((s + 1) / NB) * H;
        let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity, any = false;
        for (const p of spine) {
          if (p[1] < y0 - 1e-3 || p[1] > y1 + 1e-3) continue;
          const rx = p[0] * cos + p[2] * sin, rz = -p[0] * sin + p[2] * cos;   // rotate centreline by yaw → world (THREE rotation.y)
          if (rx < mnx) mnx = rx; if (rx > mxx) mxx = rx; if (rz < mnz) mnz = rz; if (rz > mxz) mxz = rz; any = true;
        }
        if (!any) continue;
        const rad = trunkR * (1 - 0.6 * (y0 / H)) + 0.12;      // taper-aware hug, thickest at the band base
        addBox([x + mnx - rad, y + y0, z + mnz - rad], [x + mxx + rad, y + y1, z + mxz + rad], false);
      }
      // flared root collar (tree.js draws it ~1.8× trunk radius at the very base) — a short solid box so
      // the base flare is shootable and you can't clip into it. Only the bottom ~0.7 m, so it doesn't fatten
      // the bole above it.
      const collarR = trunkR * 1.8 + 0.1, collarH = Math.min(0.7, H * 0.14);
      addBox([x - collarR, y, z - collarR], [x + collarR, y + collarH, z + collarR], false);
    } else {                                                   // defensive fallback: old single column
      addBox([x - half, y, z - half], [x + half, topY, z + half], false);
    }
    const cab = res.crownAABB;
    if (cab) {
      const cxL = (cab.min[0] + cab.max[0]) * 0.5, czL = (cab.min[2] + cab.max[2]) * 0.5;   // crown centre (lean-offset, local)
      const cxr = cxL * cos + czL * sin, czr = -cxL * sin + czL * cos;                      // rotate by yaw → world (THREE rotation.y)
      const hw = Math.max(cab.max[0] - cab.min[0], cab.max[2] - cab.min[2]) * 0.5 + 0.1;    // square hull (rotation-safe) + small aim margin
      // foliage=true (shoot/conceal/walk-through) always; thicket(slow)=only saplings — the understory you
      // push through. A grown crown is overhead (you walk under it) and its wide AABB would over-slow neighbours.
      addBox([x + cxr - hw, y + cab.min[1] - 0.2, z + czr - hw], [x + cxr + hw, y + cab.max[1] + 0.2, z + czr + hw], true, !!sapling);   // ±0.2 Y catches the apex tuft / lowest fringe
    }
    this.trees.push(rec);
    if (!sapling) this.windy.push({ m, yaw, amp: 0.018 + rr(0, 0.022), ph: rr(0, 6.28), speed: 0.8 + rr(0, 1.2) });
  }

  _dropBox(rec) {
    for (const b of (rec.boxes || [])) {         // drop every trunk band + the canopy box
      this.world.grid.removeBox(b); const i = this.world.boxes.indexOf(b); if (i >= 0) this.world.boxes.splice(i, 1);
    }
    rec.boxes = [];
  }

  // weapons.js _destructHit calls this when a tree's trunk part is killed. dirXZ = the SHOT direction
  // ([dir.x, dir.z]) so the canopy hinges DOWN away from the shooter. Rebuilds the tree split:
  // a standing stump (kept) + the canopy on a pivot that falls under makeHinge gravity.
  fellTree(rec, dirXZ = null, seed = null) {
    if (rec && rec.fallen) { this._breakLog(rec, seed); return; }   // a hit on an ALREADY-fallen log breaks it apart
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
    // the STUMP keeps a solid collision box (you can't walk or shoot through the stub left behind)
    const sh = (rec.trunkR || 0.3) + 0.12, stumpTop = y0 + Math.max(0.5, split.breakY);
    const sb = { min: new THREE.Vector3(rec.x - sh, y0, rec.z - sh), max: new THREE.Vector3(rec.x + sh, stumpTop, rec.z + sh) };
    this.world.boxes.push(sb); this.world.grid.addBox(sb); this.stumpBoxes.push(sb);
    const top = new THREE.Mesh(split.topGeometry, split.material); top.rotation.y = rec.yaw;
    const pivot = new THREE.Group(); pivot.position.set(rec.x, y0 + split.breakY, rec.z); pivot.add(top);
    this.scene.add(pivot);
    const length = Math.max(0.5, rec.height - split.breakY);
    const groundAt = this.world.terrain ? (gx, gz) => this.world.terrain.terrainHeightAt(gx, gz) : null;
    const body = makeHinge({ pivot: [rec.x, y0 + split.breakY, rec.z], dirXZ: [dx, dz], length, radius: Math.max(0.22, rec.trunkR || 0.22), seed: sd, obstacles: [], groundAt });
    // logged=false → update() registers the resting-log collision box ONCE the hinge settles (see _registerFallenLog)
    this.FALLING.push({ kind: 'hinge', body, pivot, rec, charred: !!rec.charred, logged: false });
    if (this.debris) this.debris.burst('splints', [rec.x, y0 + split.breakY, rec.z], sd, undefined, [dx, 0, dz]);
  }

  // Once a falling top SETTLES, give the lying log a collision box (solid + shootable) and make it a
  // flammable "prop" so it can still be hit, can still BURN on the ground, and can be broken apart.
  _registerFallenLog(f) {
    const b = f.body, rec = f.rec;
    const s = Math.sin(b.angle), c = Math.cos(b.angle), L = b.length;
    const ax = b.pivot[0], ay = b.pivot[1], az = b.pivot[2];
    const bx = ax + s * L * b.dirXZ[0], by = ay + c * L, bz = az + s * L * b.dirXZ[1];   // far tip of the fallen log
    const r = Math.max(0.2, (rec && rec.trunkR) || 0.25) + 0.12;
    const gy = this.world.terrain ? Math.min(this.world.terrain.terrainHeightAt(ax, az), this.world.terrain.terrainHeightAt(bx, bz)) : 0;
    const minA = [Math.min(ax, bx) - r, Math.min(ay, by, gy), Math.min(az, bz) - r];
    const maxA = [Math.max(ax, bx) + r, Math.max(ay, by, gy) + 2 * r, Math.max(az, bz) + r];
    const matName = (rec && rec.cls === 1) ? 'wood' : 'trunk';
    const id = 100000 + (rec ? rec.id : ++this._idc);
    const part = makePart(id, matName, minA, maxA, (TREE_HP[(rec && rec.cls) || 2] / MATERIALS[matName].hp) * 0.6); // a downed log snaps a touch easier
    const log = { fallen: true, prop: true, id, part, mesh: f.pivot, trunkR: r, cls: (rec && rec.cls) || 2,
                  height: maxA[1] - minA[1],   // fire reads owner.height → keeps a downed log's flame low (not a 12 m tree column)
                  fallingRef: f, burntOut: !!f.charred, consumed: false, box: null };  // charred logs already burnt → not flammable
    part.downer = log;
    const box = { min: new THREE.Vector3(...minA), max: new THREE.Vector3(...maxA), downer: log, tree: true, dmat: matName, dpart: id };
    log.box = box; this.world.boxes.push(box); this.world.grid.addBox(box);
    this.logs.push(log);
  }

  // Remove a fallen log (shot apart or burned out): drop its collision box, splinter, retire its mesh.
  _consumeLog(log, seed, shot) {
    if (!log || log.consumed) return;
    log.consumed = true;
    if (log.part) log.part.dead = true;
    if (log.box) { this.world.grid.removeBox(log.box); const i = this.world.boxes.indexOf(log.box); if (i >= 0) this.world.boxes.splice(i, 1); log.box = null; }
    const cx = log.part ? (log.part.min[0] + log.part.max[0]) / 2 : 0,
          cy = log.part ? (log.part.min[1] + log.part.max[1]) / 2 : 0,
          cz = log.part ? (log.part.min[2] + log.part.max[2]) / 2 : 0;
    if (this.debris) this.debris.burst('splints', [cx, cy, cz], (seed >>> 0) || 1, undefined, [0, shot ? 0.6 : 0.3, 0]);
    if (log.mesh && log.mesh.parent) this.scene.remove(log.mesh);
    if (log.fallingRef) { const fi = this.FALLING.indexOf(log.fallingRef); if (fi >= 0) this.FALLING.splice(fi, 1); }
  }
  _breakLog(log, seed) { this._consumeLog(log, (seed ?? (log.id * 2654435761)) >>> 0, true); }   // shot apart
  consumeProp(log) { this._consumeLog(log, (log.id * 2654435761) >>> 0, false); }                // FireManager burnout consumes it

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
    for (const t of this.trees) if (t.standing && t.part && !t.part.dead && !t.burntOut) out.push(t.part);
    for (const lg of this.logs) if (!lg.consumed && !lg.burntOut && lg.part && !lg.part.dead) out.push(lg.part);   // downed logs still burn on the ground
    return out;
  }
  // FIRE phase 1 — the foliage BLACKENS in place (chars, still leafy): tint the whole merged mesh dark
  // so leaves + bark scorch together. dropLeaves() later strips the leaves for the bare snag.
  charTree(tree) {
    if (!tree || !tree.standing || tree.charred) return;
    tree.charred = true;
    if (tree.part) tree.part.dhp = Math.max(1, tree.part.dhp * 0.5);   // charred wood snaps under the next hit
    if (tree.mesh && tree.mesh.material && tree.mesh.material.color) tree.mesh.material.color.setHex(0x161310); // scorched black
  }

  // FIRE phase 2 — the blackened leaves DROP: rebuild the standing tree as its bare CHARRED self at the
  // SAME height/species/seed (rec.height, NOT the short burntCharred snag) so the dead snag matches its
  // neighbours. The fire keeps spanning the bare trunk; it later either fells charred or stays a burnt snag.
  dropLeaves(tree) {
    if (!tree || tree.bare || !tree.standing || !tree.mesh) return;
    tree.bare = true;
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
      if (tree.mesh.material && tree.mesh.material.color) tree.mesh.material.color.setHex(0x161310); // fallback: keep the scorch tint
    }
  }

  // A fire that burned out WITHOUT toppling the tree (the ~70% that don't fall): it stays standing as a
  // bare burnt snag, off the flammable list (won't re-ignite) but still shootable — a later hit fells it.
  burnoutSnag(tree) {
    if (!tree) return;
    tree.burntOut = true;
    if (!tree.bare) this.dropLeaves(tree);
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
      if (f.body.settled) { if (!f.logged) { f.logged = true; this._registerFallenLog(f); } continue; }   // give the rested log a hitbox once
      stepBody(f.body, dt);
      _axis.set(f.body.dirXZ[1], 0, -f.body.dirXZ[0]).normalize();   // hinge axis ⟂ fall direction
      f.pivot.quaternion.setFromAxisAngle(_axis, f.body.angle);
      if (f.body.settled && !f.logged) { f.logged = true; this._registerFallenLog(f); }   // settled THIS frame → register the log now
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
