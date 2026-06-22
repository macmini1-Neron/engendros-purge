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
import { makeBush, makeShrub } from './props/generators/groundcover.js';
import { makePart, MATERIALS, makeHinge, stepBody, resolveHit } from './destruct.js';
import { rr, voxelMaterial, foliageFadeMaterial } from './util.js';
import { FOLIAGE_FADE_NEAR, FOLIAGE_FADE_FAR, FOLIAGE_FADE_GATE } from './tuning.js';

// Two SHARED leaf materials (one program each, compiled once): leaves render opaque by default; the
// 0–2 trees the camera is inside get their leaf mesh swapped to the fade material so the leaves at your
// face dissolve. Wood always uses a plain opaque material — only the LEAF mesh ever fades.
const FOLIAGE_OPAQUE = voxelMaterial();
const FOLIAGE_FADE = foliageFadeMaterial(FOLIAGE_FADE_NEAR, FOLIAGE_FADE_FAR);

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
    this.trees = []; this.stumps = []; this.stumpBoxes = []; this.logs = []; this.bushes = []; this.props = []; this.FALLING = []; this.windy = [];
    this._t = 0; this._idc = 0; this._reserved = [];
    this._fading = new Set();   // tree/bush recs whose leaf mesh is currently on the near-camera fade material
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
    const yaw = rr(0, Math.PI * 2);
    const y = this.world.terrain ? this.world.terrain.terrainHeightAt(x, z) : 0;
    // WOOD (opaque) + LEAF (fadeable) as two meshes under one group: wind/transform/fell all act on the
    // group, while only the leaf mesh ever swaps to the transparent near-camera fade material.
    const m = new THREE.Group();
    const woodMesh = new THREE.Mesh(res.woodGeometry || res.geometry, res.material); woodMesh.castShadow = true; m.add(woodMesh);
    let leafMesh = null;
    if (res.leafGeometry) { leafMesh = new THREE.Mesh(res.leafGeometry, FOLIAGE_OPAQUE); leafMesh.castShadow = true; m.add(leafMesh); }
    m.position.set(x, y, z); m.rotation.y = yaw;
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
    const rec = { id, species, seed, scale, x, z, yaw, baseY: y, height: H, trunkR, mesh: m, leafMesh, cls, part, standing: true, boxes: [] };
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
      // centreline (local x,z) at local height yt, LERPED along the spine polyline (sorted base→top) — so a
      // band is sized from its exact Y edges (gap-free + tight) instead of whichever discrete spine points
      // happen to fall inside it.
      const cl = (yt) => {
        if (yt <= spine[0][1]) return [spine[0][0], spine[0][2]];
        for (let i = 0; i < spine.length - 1; i++) {
          const a = spine[i], b = spine[i + 1];
          if (yt <= b[1] + 1e-6) { const tt = (yt - a[1]) / ((b[1] - a[1]) || 1); return [a[0] + (b[0] - a[0]) * tt, a[2] + (b[2] - a[2]) * tt]; }
        }
        const e = spine[spine.length - 1]; return [e[0], e[2]];
      };
      const NB = 6;                                            // more, SHORTER bands → each hugs the local lean tightly (a tall band's lean drift was an invisible block beside the trunk)
      for (let s = 0; s < NB; s++) {
        const y0 = (s / NB) * H, y1 = ((s + 1) / NB) * H;
        // sample the centreline at both edges + any spine points strictly inside → full extent, no gaps
        let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
        const add = (lx, lz) => { const rx = lx * cos + lz * sin, rz = -lx * sin + lz * cos; if (rx < mnx) mnx = rx; if (rx > mxx) mxx = rx; if (rz < mnz) mnz = rz; if (rz > mxz) mxz = rz; };
        const e0 = cl(y0), e1 = cl(y1); add(e0[0], e0[1]); add(e1[0], e1[1]);
        for (const p of spine) if (p[1] > y0 && p[1] < y1) add(p[0], p[2]);
        const rad = trunkR * (1 - 0.6 * (y0 / H)) + 0.1;       // taper-aware hug (thickest at the band base) + a small aim/clearance margin
        addBox([x + mnx - rad, y + y0, z + mnz - rad], [x + mxx + rad, y + y1, z + mxz + rad], false);
      }
      // root collar — a SHORT solid box matching the visible flare. trunkR*1.25 (square) puts its CORNERS at
      // ~1.77×trunkR ≈ the drawn flare radius (1.8×) and its flats just inside → it hugs the round flare
      // instead of the old 1.8× square whose corners stuck out to 2.5×trunkR (a fat invisible block at foot level).
      const collarR = trunkR * 1.25 + 0.05, collarH = Math.min(0.5, H * 0.12);
      addBox([x - collarR, y, z - collarR], [x + collarR, y + collarH, z + collarR], false);
    } else {                                                   // defensive fallback: old single column
      addBox([x - half, y, z - half], [x + half, topY, z + half], false);
    }
    const cab = res.crownAABB;
    if (cab) {
      const cxL = (cab.min[0] + cab.max[0]) * 0.5, czL = (cab.min[2] + cab.max[2]) * 0.5;   // crown centre (lean-offset, local)
      const cxr = cxL * cos + czL * sin, czr = -cxL * sin + czL * cos;                      // rotate by yaw → world (THREE rotation.y)
      const hw = Math.max(cab.max[0] - cab.min[0], cab.max[2] - cab.min[2]) * 0.5 + 0.1;    // square hull (rotation-safe) + small aim margin
      rec.crownHW = hw;                                         // remembered so a FALLEN crown (M4) can size its leaf-end foliage box
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
    if (this.game.fire) this.game.fire.retire(rec.part);    // drop any active fire so flames don't hover where the trunk was (+ free the cap slot)
    if (rec.part) rec.part.dead = true;                     // off the flammable list — a felled tree can't re-ignite
    if (rec.mesh) { this.scene.remove(rec.mesh); rec.mesh = null; }
    this._fading.delete(rec); rec.leafMesh = null;
    this._dropBox(rec);
    let dx = dirXZ ? dirXZ[0] : (Math.random() - 0.5), dz = dirXZ ? dirXZ[1] : (Math.random() - 0.5);
    let dl = Math.hypot(dx, dz); if (dl < 1e-4) { dx = 1; dz = 0; dl = 1; } dx /= dl; dz /= dl;   // zero dir (centred blast / straight-down shot) → default topple +X, avoids a NaN fall axis
    const sd = ((seed ?? (rec.id * 2654435761)) >>> 0) || 1;
    const breakAt = rec.cls === 1 ? 0.1 : 0.12 + ((sd >>> 8) % 1000) / 1000 * 0.18;   // SEEDED snap height (co-op-deterministic; was Math.random → host/client desync)
    // A fire-killed tree fells as its BARE BLACKENED charred self (no leaves); a bullet/blast-felled tree
    // keeps its foliage. NO height override: the same seed+scale reproduces the EXACT standing tree (just
    // split). Passing rec.height (already × scale) alongside scale double-scaled the felled tree (~scale×
    // too big) AND shifted the RNG so the split didn't even match the standing shape.
    const split = makeTree({ species: rec.species, seed: rec.seed, scale: rec.scale, breakAt, damage: rec.charred ? 'charred' : undefined });
    const y0 = rec.baseY;
    const stump = new THREE.Mesh(split.stumpWoodGeometry, split.material);
    stump.position.set(rec.x, y0, rec.z); stump.rotation.y = rec.yaw; stump.castShadow = true;
    this.scene.add(stump); this.stumps.push(stump);
    // the STUMP keeps a solid collision box (you can't walk or shoot through the stub left behind)
    const sh = (rec.trunkR || 0.3) + 0.12, stumpTop = y0 + Math.max(0.5, split.breakY);
    const sb = { min: new THREE.Vector3(rec.x - sh, y0, rec.z - sh), max: new THREE.Vector3(rec.x + sh, stumpTop, rec.z + sh) };
    this.world.boxes.push(sb); this.world.grid.addBox(sb); this.stumpBoxes.push(sb);
    // falling TOP = opaque bole + (when the fell keeps foliage) a SEPARATE leaf mesh on the foliage material,
    // so the crown lying on the ground reads as see-through wade-in cover that dissolves at the camera
    // (_updateLeafFade picks it up via log.leafMesh) — not an opaque green block.
    const top = new THREE.Group(); top.rotation.y = rec.yaw;
    const topWoodMesh = new THREE.Mesh(split.topWoodGeometry, split.material); topWoodMesh.castShadow = true; top.add(topWoodMesh);   // the felled trunk/log casts a shadow like the standing tree did
    let topLeafMesh = null;
    if (split.topLeafGeometry) { topLeafMesh = new THREE.Mesh(split.topLeafGeometry, FOLIAGE_OPAQUE); topLeafMesh.castShadow = true; top.add(topLeafMesh); }
    const pivot = new THREE.Group(); pivot.position.set(rec.x, y0 + split.breakY, rec.z); pivot.add(top);
    this.scene.add(pivot);
    const length = Math.max(0.5, rec.height - split.breakY);
    const groundAt = this.world.terrain ? (gx, gz) => this.world.terrain.terrainHeightAt(gx, gz) : null;
    const body = makeHinge({ pivot: [rec.x, y0 + split.breakY, rec.z], dirXZ: [dx, dz], length, radius: Math.max(0.22, rec.trunkR || 0.22), seed: sd, obstacles: [], groundAt });
    // logged=false → update() registers the resting-log collision box ONCE the hinge settles (see _registerFallenLog)
    this.FALLING.push({ kind: 'hinge', body, pivot, rec, charred: !!rec.charred, logged: false, topLeafMesh });
    if (this.debris) this.debris.burst('splints', [rec.x, y0 + split.breakY, rec.z], sd, undefined, [dx, 0, dz]);
    rec._fellDx = dx; rec._fellDz = dz; rec._fellSeed = sd;
    this._emitForest('fell', rec.id, { dx, dz, seed: sd });   // host-auth: clients replay the identical fall (same dir + seed → same FallingBody)
  }

  // Once a falling top SETTLES, give the lying log a collision box (solid + shootable) and make it a
  // flammable "prop" so it can still be hit, can still BURN on the ground, and can be broken apart.
  _registerFallenLog(f) {
    const b = f.body, rec = f.rec;
    const s = Math.sin(b.angle), c = Math.cos(b.angle), L = b.length;
    const ax = b.pivot[0], ay = b.pivot[1], az = b.pivot[2];
    const bx = ax + s * L * b.dirXZ[0], by = ay + c * L, bz = az + s * L * b.dirXZ[1];   // far tip of the fallen log = the CROWN/leaves
    const r = Math.max(0.2, (rec && rec.trunkR) || 0.25) + 0.12;
    const matName = (rec && rec.cls === 1) ? 'wood' : 'trunk';
    const id = 100000 + (rec ? rec.id : ++this._idc);
    // FULL-log AABB only sizes the part (fire flame seat + HP); collision is TWO boxes below.
    const gy = this.world.terrain ? Math.min(this.world.terrain.terrainHeightAt(ax, az), this.world.terrain.terrainHeightAt(bx, bz)) : 0;
    const minA = [Math.min(ax, bx) - r, Math.min(ay, by, gy), Math.min(az, bz) - r];
    const maxA = [Math.max(ax, bx) + r, Math.max(ay, by, gy) + 2 * r, Math.max(az, bz) + r];
    const part = makePart(id, matName, minA, maxA, (TREE_HP[(rec && rec.cls) || 2] / MATERIALS[matName].hp) * 0.6); // a downed log snaps a touch easier
    const log = { fallen: true, prop: true, id, part, mesh: f.pivot, leafMesh: f.topLeafMesh || null, trunkR: r, cls: (rec && rec.cls) || 2,
                  height: maxA[1] - minA[1],   // fire reads owner.height → keeps a downed log's flame low (not a 12 m tree column)
                  fallingRef: f, burntOut: !!f.charred, consumed: false, boxes: [] };  // charred logs already burnt → not flammable
    part.downer = log;
    // helper: an axis-segment box [t0,t1] of the log, padded by `pad` in XZ and `padY` up; flags optional
    const seg = (t0, t1, pad, padY, foliage, thicket) => {
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = ay + (by - ay) * t0, y1 = ay + (by - ay) * t1;
      const gg = this.world.terrain ? Math.min(this.world.terrain.terrainHeightAt(x0, z0), this.world.terrain.terrainHeightAt(x1, z1)) : 0;
      const mn = [Math.min(x0, x1) - pad, Math.min(y0, y1, gg), Math.min(z0, z1) - pad];
      const mx = [Math.max(x0, x1) + pad, Math.max(y0, y1, gg) + padY, Math.max(z0, z1) + pad];
      const box = { min: new THREE.Vector3(...mn), max: new THREE.Vector3(...mx), downer: log, tree: true, dmat: matName, dpart: id };
      if (foliage) box.foliage = true; if (thicket) box.thicket = true;
      log.boxes.push(box); this.world.boxes.push(box); this.world.grid.addBox(box);
    };
    // WOOD CORE — the snapped trunk, solid: you snag on the downed bole. (No leaves → no fade; M4 stretch.)
    seg(0, 0.62, r, 2 * r, false, false);
    // LEAF END — the crown lying on the ground: a wide foliage+thicket volume you WADE INTO (slowed,
    // concealed). ONLY when the fallen crown actually carries leaves (f.topLeafMesh) — a charred/bare log
    // has none, so skip it, else a 20×9×11 m invisible soft-cover box floats where the burnt crown is
    // (bullets pass, movement slows, nothing rendered). The solid wood core already covers the bole.
    if (f.topLeafMesh) {
      const cw = Math.min(Math.max((rec && rec.crownHW) || 1.2, 0.8), 5.0);
      seg(0.5, 1.0, cw, Math.max(2 * r, cw * 1.4), true, true);
    }
    this.logs.push(log);
  }

  // Remove a fallen log (shot apart or burned out): drop its collision boxes, splinter, retire its mesh.
  _consumeLog(log, seed, shot) {
    if (!log || log.consumed) return;
    log.consumed = true;
    this._emitForest('propdie', log.id);                      // host-auth: clients remove the same log
    this._fading.delete(log);                                  // drop it from the near-camera leaf-fade rotation
    if (this.game.fire) this.game.fire.retire(log.part);      // a shot-apart / blasted burning log: retire its fire too
    if (log.part) log.part.dead = true;
    for (const b of (log.boxes || [])) { this.world.grid.removeBox(b); const i = this.world.boxes.indexOf(b); if (i >= 0) this.world.boxes.splice(i, 1); }
    log.boxes = [];
    const cx = log.part ? (log.part.min[0] + log.part.max[0]) / 2 : 0,
          cy = log.part ? (log.part.min[1] + log.part.max[1]) / 2 : 0,
          cz = log.part ? (log.part.min[2] + log.part.max[2]) / 2 : 0;
    if (this.debris) this.debris.burst('splints', [cx, cy, cz], (seed >>> 0) || 1, undefined, [0, shot ? 0.6 : 0.3, 0]);
    if (log.mesh && log.mesh.parent) this.scene.remove(log.mesh);
    if (log.fallingRef) { const fi = this.FALLING.indexOf(log.fallingRef); if (fi >= 0) this.FALLING.splice(fi, 1); }
  }
  _breakLog(log, seed) { this._consumeLog(log, (seed ?? (log.id * 2654435761)) >>> 0, true); }   // shot apart
  consumeProp(rec) {                                                                              // FireManager burnout consumes a prop
    if (rec && rec.isBush) this._consumeBush(rec, (rec.id * 2654435761) >>> 0, false);
    else if (rec && rec.isProp) this._destroyProp(rec, false);
    else this._consumeLog(rec, (rec.id * 2654435761) >>> 0, false);
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
    for (const b of this.bushes) {                            // an explosion flattens nearby brush
      if (b.dead) continue;
      const dx = b.x - pos.x, dz = b.z - pos.z;
      if (dx * dx + dz * dz <= radius * radius) this._consumeBush(b, (b.id * 1597) >>> 0, true);
    }
    for (const p of this.props) {                             // shatter nearby destructible props (rock tier 4 shrugs off a tier-3 rocket)
      if (p.dead) continue;
      const dx = p.x - pos.x, dz = p.z - pos.z;
      if (dx * dx + dz * dz <= radius * radius && MATERIALS[p.dmat].tier <= blastTier) this._destroyProp(p, true);
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
    for (const p of this.props) {                             // the rod also smashes props it passes (rock needs APFSDS-tier pen)
      if (p.dead) continue;
      const ox = p.x - origin.x, oz = p.z - origin.z, t = ox * dir.x + oz * dir.z;
      if (t < 0 || t > range) continue;
      const px = ox - dir.x * t, pz = oz - dir.z * t;
      if (px * px + pz * pz <= 0.8 * 0.8 && MATERIALS[p.dmat].tier <= pen) this._destroyProp(p, true);
    }
  }

  // weapons.js _destructHit routes a `box.prop` hit here — for us that's a BUSH. Damage it (grass tier 0,
  // any round out-pens) and clear it on kill; a non-fatal hit just puffs leaf debris.
  hitProp(rec, w, point) {
    if (!rec || rec.dead || !rec.part || rec.part.dead) return;
    const res = resolveHit(rec.part, w);
    if (res.killed) { if (rec.isBush) this._consumeBush(rec, (rec.id * 2654435761) >>> 0, true); else this._destroyProp(rec, true); }   // bush vs rock/decor prop
    else if (res.effect === 'damage' && this.debris && point) this.debris.burst(rec.dmat === 'stone' ? 'sparks' : 'splints', [point[0], point[1], point[2]], (rec.id ^ 0x55) >>> 0);
  }

  // ── DECOR PROPS (rocks + static fallen logs): destructible scenery placed by ForestScene._scatterDecor.
  // A rock is a SOLID stone prop (tier 4 — bullets chip/spark, only HE-tier blast / APFSDS breaks it);
  // routed via this.props (hitProp/blast/penetrate/consumeProp). Logs reuse the fallen-log path (this.logs).
  _addRock(geometry, material, x, z, yaw) {
    const y = this.world.terrain ? this.world.terrain.terrainHeightAt(x, z) : 0;
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = yaw;
    mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    geometry.computeBoundingBox(); const bb = geometry.boundingBox;
    const hw = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 + 0.05, top = y + bb.max.y;
    const id = 300000 + (++this._idc), min = [x - hw, y, z - hw], max = [x + hw, top, z + hw];
    const part = makePart(id, 'stone', min, max, 1); part.downer = null;
    const rec = { id, x, z, baseY: y, dmat: 'stone', mesh, part, dead: false, box: null, isProp: true, prop: true };
    part.downer = rec;
    const box = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), downer: rec, prop: true, dmat: 'stone', dpart: id };
    rec.box = box; this.world.boxes.push(box); this.world.grid.addBox(box);
    this.props.push(rec);
    return rec;
  }
  _destroyProp(rec, shot) {
    if (!rec || rec.dead) return;
    rec.dead = true; if (rec.part) rec.part.dead = true;
    this._emitForest('propdie', rec.id);                      // host-auth: clients remove the same rock/prop
    if (this.game.fire) this.game.fire.retire(rec.part);
    if (rec.box) { this.world.grid.removeBox(rec.box); const i = this.world.boxes.indexOf(rec.box); if (i >= 0) this.world.boxes.splice(i, 1); rec.box = null; }
    if (this.debris) this.debris.burst(rec.dmat === 'stone' ? 'rubble' : 'splints', [rec.x, rec.baseY + 0.4, rec.z], (rec.id * 2654435761) >>> 0, undefined, [0, shot ? 0.5 : 0.3, 0]);
    if (rec.mesh && rec.mesh.parent) this.scene.remove(rec.mesh); rec.mesh = null;
  }

  // A static fallen-log scenery piece: reuses the live-log path (this.logs) so it's SOLID (stops rounds),
  // shootable-apart (_destructHit → _breakLog) and FLAMMABLE — identical to a tree you felled.
  _addDecorLog(mesh, x, z, yaw, length, r, charred = false) {
    const y = this.world.terrain ? this.world.terrain.terrainHeightAt(x, z) : 0;
    mesh.position.set(x, y + r, z); mesh.rotation.y = yaw; mesh.castShadow = mesh.receiveShadow = true; this.scene.add(mesh);
    const c = Math.cos(yaw), s = Math.sin(yaw), hl = length / 2;
    const ax = x - s * hl, az = z - c * hl, bx = x + s * hl, bz = z + c * hl;   // the two ends along the log axis
    const id = 100000 + (++this._idc);
    const matName = 'trunk';
    const minA = [Math.min(ax, bx) - r, y, Math.min(az, bz) - r], maxA = [Math.max(ax, bx) + r, y + 2 * r, Math.max(az, bz) + r];
    const part = makePart(id, matName, minA, maxA, (TREE_HP[2] / MATERIALS[matName].hp) * 0.6);
    const log = { fallen: true, prop: true, id, part, mesh, leafMesh: null, trunkR: r, cls: 2, height: 2 * r, burntOut: !!charred, consumed: false, boxes: [] };
    part.downer = log;
    const box = { min: new THREE.Vector3(...minA), max: new THREE.Vector3(...maxA), downer: log, tree: true, dmat: matName, dpart: id };
    log.boxes.push(box); this.world.boxes.push(box); this.world.grid.addBox(box);
    this.logs.push(log);
    return log;
  }

  // ── BUSHES (M3): head-height understorey you push THROUGH (slow) + that fades at the camera + hides
  // you, and that a shot/blast/fire clears. A bush is a single leaf mesh + ONE foliage+thicket+prop box
  // (no wood bands — it's all leaf) + a light 'grass' destruct part (fuel>0 → burns). ─────────────────
  _addBush(x, z, scale, seed) {
    const shrub = Math.random() < 0.32;                        // a few low steppe-scrub shrubs among the bushes
    const res = shrub ? makeShrub(seed) : makeBush(seed);
    const geo = res.geometry; if (scale !== 1) geo.scale(scale, scale, scale);
    geo.computeBoundingBox(); const bb = geo.boundingBox;       // local AABB (post-scale), base ~at origin
    const yaw = rr(0, Math.PI * 2);
    const y = this.world.terrain ? this.world.terrain.terrainHeightAt(x, z) : 0;
    const mesh = new THREE.Mesh(geo, FOLIAGE_OPAQUE);          // leaf material → fades near the camera (the showcase)
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.castShadow = true;
    this.scene.add(mesh);
    const id = 200000 + (++this._idc);
    const hw = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5 + 0.1;   // square hull (round bush, rotation-safe)
    const top = y + bb.max.y;
    const min = [x - hw, y, z - hw], max = [x + hw, top, z + hw];
    const part = makePart(id, 'grass', min, max, 10);          // grass tier 0, fuel 2 → burns; ~10 HP, a shot or two clears it
    const rec = { id, kind: shrub ? 'shrub' : 'bush', x, z, baseY: y, height: bb.max.y, mesh, leafMesh: mesh, part, dead: false, box: null, isBush: true, prop: true };
    part.downer = rec;
    const box = { min: new THREE.Vector3(...min), max: new THREE.Vector3(...max), downer: rec, foliage: true, thicket: true, prop: true, dmat: 'grass', dpart: id };
    rec.box = box; this.world.boxes.push(box); this.world.grid.addBox(box);
    this.bushes.push(rec);
  }

  _blockedBush(x, z) {
    for (const r of this._reserved) { const dx = x - r.x, dz = z - r.z; if (dx * dx + dz * dz < r.r * r.r) return true; }      // off building footprints
    for (const t of this.trees) { const dx = x - t.x, dz = z - t.z; if (dx * dx + dz * dz < 1.2 * 1.2) return true; }          // not clipping a trunk
    for (const b of this.bushes) { const dx = x - b.x, dz = z - b.z; if (dx * dx + dz * dz < 1.3 * 1.3) return true; }         // spread the bushes out
    return false;
  }

  // Scatter `n` bushes into the UNDERSTOREY — clustered around existing trees (1.5–6 m out) so they read
  // as undergrowth, not a lawn. Call AFTER scatter() (needs the trees as cluster seeds).
  scatterBushes(n = 50) {
    const terr = this.world.terrain;
    if (!this.trees.length) return;
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 14; tries++) {
        const host = this.trees[(Math.random() * this.trees.length) | 0];
        const a = Math.random() * Math.PI * 2, d = 1.5 + Math.random() * 5;
        const x = host.x + Math.cos(a) * d, z = host.z + Math.sin(a) * d;
        if (Math.abs(x) > this.world.HALF - 4 || Math.abs(z) > this.world.HALF - 4) continue;
        if (terr && !terr.isPlaceable(x, z, 0.6, 'tree')) continue;
        if (this._blockedBush(x, z)) continue;
        this._addBush(x, z, rr(0.85, 1.3), i * 23 + 5000); break;
      }
    }
  }

  _consumeBush(rec, seed, shot) {
    if (!rec || rec.dead) return;
    rec.dead = true;
    this._emitForest('propdie', rec.id);                      // host-auth: clients remove the same bush
    if (this.game.fire) this.game.fire.retire(rec.part);      // a burning bush flattened by a blast/shot: retire its fire
    if (rec.part) rec.part.dead = true;
    this._fading.delete(rec);
    if (rec.box) { this.world.grid.removeBox(rec.box); const i = this.world.boxes.indexOf(rec.box); if (i >= 0) this.world.boxes.splice(i, 1); rec.box = null; }
    if (this.debris) this.debris.burst('splints', [rec.x, rec.baseY + rec.height * 0.5, rec.z], (seed >>> 0) || 1, undefined, [0, shot ? 0.5 : 0.3, 0]);
    if (rec.mesh && rec.mesh.parent) this.scene.remove(rec.mesh);
    rec.mesh = null; rec.leafMesh = null;
  }

  // ── FIRE (game FireManager) — the molotov/rocket fire path. FireManager enumerates burnables via
  // flammableParts(), then chars (charTree → snaps easier) + fells (fellTree on burnout) by the part's
  // owner (= the tree record we set as part.downer). trunk(fuel 10)/wood(fuel 6) burn; the ember chain
  // spreads tree↔tree on its own. ──────────────────────────────────────────────────────────────────
  flammableParts() {
    const out = [];
    for (const t of this.trees) if (t.standing && t.part && !t.part.dead && !t.burntOut) out.push(t.part);
    for (const lg of this.logs) if (!lg.consumed && !lg.burntOut && lg.part && !lg.part.dead) out.push(lg.part);   // downed logs still burn on the ground
    for (const bsh of this.bushes) if (!bsh.dead && bsh.part && !bsh.part.dead) out.push(bsh.part);               // bushes burn (fuel 2) → consumeProp clears them
    return out;
  }
  // FIRE phase 1 — the foliage BLACKENS in place (chars, still leafy): tint the whole merged mesh dark
  // so leaves + bark scorch together. dropLeaves() later strips the leaves for the bare snag.
  charTree(tree) {
    if (!tree || !tree.standing || tree.charred) return;
    tree.charred = true;
    if (tree.part) tree.part.dhp = Math.max(1, tree.part.dhp * 0.5);   // charred wood snaps under the next hit
    // Scorch the trunk/wood IN PLACE. mesh is a Group(wood[,leaf]); tint each mesh EXCEPT the leaf mesh,
    // whose foliage material is shared across all trees (tinting it would blacken the whole forest). The
    // leaves blacken+drop later in dropLeaves. (Old code tinted tree.mesh.material — a Group has none → no-op.)
    if (tree.mesh) tree.mesh.traverse((o) => { if (o.isMesh && o !== tree.leafMesh && o.material && o.material.color) o.material.color.setHex(0x161310); });
    this._emitForest('char', tree.id);   // host-auth: mirror the charred snag on every peer
  }

  // FIRE phase 2 — the blackened leaves DROP: rebuild the standing tree as its bare CHARRED self. Same
  // species+seed+scale (NO height override) reproduces the EXACT standing tree, now bare + blackened, so the
  // dead snag matches its neighbours. (Passing tree.height double-scaled the snag — it stood scale× too tall.)
  // The fire keeps spanning the bare trunk; it later either fells charred or stays a burnt snag.
  dropLeaves(tree) {
    if (!tree || tree.bare || !tree.standing || !tree.mesh) return;
    tree.bare = true;
    // leaves gone → drop the canopy's soft-cover hitbox so it isn't a phantom shoot-through box in mid-air
    // (the trunk bands stay — the bare snag is still solid + shootable). fellTree drops ALL boxes via _dropBox.
    if (tree.boxes) for (let i = tree.boxes.length - 1; i >= 0; i--) { const b = tree.boxes[i]; if (b.foliage) { this.world.grid.removeBox(b); const j = this.world.boxes.indexOf(b); if (j >= 0) this.world.boxes.splice(j, 1); tree.boxes.splice(i, 1); } }
    try {
      const res = makeTree({ species: tree.species, seed: tree.seed, scale: tree.scale, lod: 0, damage: 'charred' });
      const old = tree.mesh;                                  // a Group(wood, leaf) — the charred snag is a single merged mesh (no leaves to fade)
      const m = new THREE.Mesh(res.geometry, res.material);
      m.position.copy(old.position); m.rotation.y = tree.yaw; m.castShadow = true;
      this.scene.add(m); tree.mesh = m; this._fading.delete(tree); tree.leafMesh = null;
      for (const w of this.windy) if (w.m === old) { w.m = m; break; }   // keep the (barely-swaying) snag wired to wind
      this.scene.remove(old);
      old.traverse && old.traverse((o) => { if (o.isMesh && o.geometry && o.geometry !== res.leafGeometry) o.geometry.dispose(); }); // free the old wood+leaf geometries (leaf material is shared — don't dispose)
    } catch (e) {
      tree.mesh.traverse && tree.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.color) o.material.color.setHex(0x161310); }); // fallback: scorch-tint in place
    }
    this._emitForest('drop', tree.id);   // host-auth: mirror the bare (leaves-dropped) snag on every peer
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
      if (dx * dx + dz * dz < r * r) { if (rec.mesh) { this.scene.remove(rec.mesh); rec.mesh = null; } this._fading.delete(rec); rec.leafMesh = null; this._dropBox(rec); rec.standing = false; rec.cleared = true; }
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
    this._updateLeafFade();
  }

  // Near-camera leaf fade: swap the leaf mesh of the 0–2 trees the camera is inside/near to the shared
  // transparent fade material; revert the rest to opaque. Keeps the transparent-queue cost bounded (the
  // fade math is per-fragment off the built-in cameraPosition uniform — no per-tree uniform push needed).
  _updateLeafFade() {
    const cam = this.game.engine && this.game.engine.camera; if (!cam) return;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z, G = FOLIAGE_FADE_GATE, G2 = G * G;
    const want = new Set();
    for (const b of this.world.grid.queryAABB(cx - G, cz - G, cx + G, cz + G)) {
      if (!b.foliage || !b.downer || !b.downer.leafMesh) continue;
      const ddx = Math.max(b.min.x - cx, 0, cx - b.max.x), ddy = Math.max(b.min.y - cy, 0, cy - b.max.y), ddz = Math.max(b.min.z - cz, 0, cz - b.max.z);
      if (ddx * ddx + ddy * ddy + ddz * ddz <= G2) want.add(b.downer);
    }
    for (const rec of want) if (!this._fading.has(rec) && rec.leafMesh) { rec.leafMesh.material = FOLIAGE_FADE; this._fading.add(rec); }
    for (const rec of this._fading) if (!want.has(rec)) { if (rec.leafMesh) rec.leafMesh.material = FOLIAGE_OPAQUE; this._fading.delete(rec); }
  }

  // ── co-op (basic — manual gate): fell ids streamed by the host ──
  // ── CO-OP: the host broadcasts every authoritative forest mutation (char / leaves-drop / fell / prop
  // death); clients mirror it. Each mutation guards on its own state and _emitForest fires ONLY on the
  // host, so a client mirror can't echo. ⚠️ Correct replay needs the forest LAYOUT identical on every
  // peer (id→tree must match) — ForestDemo.scatter is currently UNSEEDED, so until it's made
  // deterministic this is wired-but-positionally-approximate (known co-op-forest gap, 2-PC manual gate).
  _emitForest(k, id, extra = null) {
    const mp = this.game.mp;
    if (!mp || !mp.active || !mp.isHost || !mp.net) return;
    try { mp.net.send('forestfx', Object.assign({ k, id }, extra || {})); } catch (e) {}
  }
  _treeById(id) { return this.trees.find((t) => t.id === id); }
  fellTreeById(id, dx, dz, seed) { const t = this._treeById(id); if (t && t.standing) { t.part.dead = true; this.fellTree(t, [dx, dz], seed); } }
  dropLeavesById(id) { const t = this._treeById(id); if (t) this.dropLeaves(t); }
  destroyPropById(id) {                                       // a fallen log / bush / rock removed on the host
    let r = this.logs.find((l) => l.id === id); if (r) { this._consumeLog(r, (id * 2654435761) >>> 0, false); return; }
    r = this.bushes.find((b) => b.id === id); if (r) { this._consumeBush(r, (id * 2654435761) >>> 0, false); return; }
    r = this.props.find((p) => p.id === id); if (r) this._destroyProp(r, false);
  }
  consumeGrassById() {}                                       // groundcover here is non-destructible visual InstancedMeshes — nothing to consume (kept so the host 'grass' handler can't crash)
  // Late-join: replay every authoritative mutation a fresh joiner missed, as .k-tagged 'forestfx' records.
  netSnapshot() {
    const out = [];
    for (const t of this.trees) {
      if (!t.standing && !t.cleared) out.push({ k: 'fell', id: t.id, dx: t._fellDx || 0, dz: t._fellDz || 1, seed: t._fellSeed || ((t.id * 2654435761) >>> 0) });
      else if (t.bare) out.push({ k: 'drop', id: t.id });
      else if (t.charred) out.push({ k: 'char', id: t.id });
    }
    for (const lg of this.logs) if (lg.consumed) out.push({ k: 'propdie', id: lg.id });
    for (const b of this.bushes) if (b.dead) out.push({ k: 'propdie', id: b.id });
    for (const p of this.props) if (p.dead) out.push({ k: 'propdie', id: p.id });
    return out;
  }
  stats() { return { trees: this.trees.length, standing: this.trees.filter((t) => t.standing).length, falling: this.FALLING.length }; }
}
