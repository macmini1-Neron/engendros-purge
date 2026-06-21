// destructible.js — DestructibleBuilding: the runtime that makes a buildgen building destructible.
//
// Generalizes the hand-coded demobuilding.js (kept as the reference). It wraps buildBuilding()'s
// output and wires the destruction core (src/destruct.js) the SAME two-rep way demobuilding +
// forest do:
//   • CLADDING parts (breach wall pieces with a phys bridge + glass panes) each get (1) a destruct
//     part (makePart, plain [x,y,z] WORLD AABB) and (2) a linked world.boxes collider with
//     box.downer=this / box.dpart / box.dmat / box.building=bid, so a live world.rayHit() →
//     box.downer.applyHit() resolves the right part.
//   • STRUCTURAL parts get a plain static collider only (no destruct part) — they hold the roof
//     and are never removed (the "removal without collapse" model).
// On a part's death: drop its collider, then either dispose its standalone pane mesh (glass) or
// re-merge ONLY its material bucket minus the dead pieces (+ rubble stubs) — the textured lazy
// rebuild, reusing the cached CanvasTexture. APFSDS through-holes mirror demobuilding.
//
// HOST-AUTHORITATIVE: applyHit/Blast/Penetration run only under hostSim (the caller gates), then
// broadcast the exact dead-part delta as `bdestroy {bid, parts, holes}`; clients replay via
// applyNetDestroy. bid (placement-encoded) lets many destructibles coexist in one world.

import * as THREE from 'three';
import { DestructRuntime, makePart, MATERIALS } from '../destruct.js';
import { DebrisPool } from '../destruct-debris.js';
import { buildBuilding, fillBuckets, realizeBucket, OPAQUE_KINDS } from './interp.js';
import { physKeyOf } from './materials.js';
import { assertYaw } from './operators/_math.js';
import { worldAABB, paneAABB, makeBid, hpScaleFor } from './destructible-geom.js';
import { MeshBuilder, voxelMaterial } from '../util.js';

const D2R = Math.PI / 180;
const RUBBLE_A = 0x6e4334, RUBBLE_B = 0x5d3a2c;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class DestructibleBuilding {
  // world: needs .boxes + optional .grid; scene: THREE.Scene; spec: a registered building spec.
  constructor(world, scene, spec, x, z, yaw = 0, opts = {}) {
    this.world = world; this.scene = scene; this.spec = spec;
    this.x = x; this.z = z; this.y = opts.y ?? 0;
    this.k = assertYaw(yaw);                                   // throws on non-90° — by design (law 12)
    this.bid = opts.bid ?? makeBid(spec.id, x, z, this.k);

    this.parts = [];
    this._boxById = new Map();          // dpart → linked world collider box
    this._paneMeshById = new Map();     // dpart → standalone pane mesh
    this._meshByMat = new Map();        // material name → merged opaque mesh (for targeted rebuild)
    this._removed = new Set();          // dpart ids already retired (idempotent)
    this._holes = [];
    this.lastRebuildMs = 0;

    const built = buildBuilding(spec, opts);
    this.group = built.group;
    this.group.position.set(x, this.y, z);
    this.group.rotation.y = yaw * D2R;
    scene.add(this.group);
    this.colliders = built.colliders;
    this.prims = built.prims;
    this.texCache = built.texCache;
    this.stats = built.stats;

    this._opaquePrims = this.prims.filter((p) => OPAQUE_KINDS.has(p.kind));
    this._primById = new Map();                                // part id → opaque prim (O(1) rebuild lookup)
    for (const p of this._opaquePrims) this._primById.set(p.part, p);
    this._rubbleMesh = null;                                   // one voxel-coloured mesh for all masonry rubble
    this.group.traverse((o) => {
      if (o.userData?.kind === 'pane') this._paneMeshById.set(o.userData.dpart, o);
      else if (typeof o.name === 'string' && o.name.startsWith('mat:')) this._meshByMat.set(o.name.slice(4), o);
    });

    this.debris = new DebrisPool(scene);
    this._registerParts();
    this.runtime = new DestructRuntime({ parts: this.parts, debris: this.debris });
    this.bounds = this._bounds();
  }

  // ── two-rep registration (yaw-correct: identical transform to registry.placeBuilding) ──────────
  _registerParts() {
    // collidable cladding → destruct part + linked collidable world box
    for (const c of this.colliders) {
      if (c.role !== 'cladding') { this._pushStaticBox(this._worldAABB(c.min, c.max)); continue; }
      const physKey = physKeyOf(c.mat);
      if (!physKey) { this._pushStaticBox(this._worldAABB(c.min, c.max)); continue; }  // law 15 flags; treat as static
      const w = this._worldAABB(c.min, c.max);
      const part = makePart(c.part, physKey, w.min, w.max, hpScaleFor(this.spec, c.part));
      part.downer = this;
      this.parts.push(part);
      this._pushBox(w, c.part, physKey);
    }
    // glass panes (no plan collider) → destruct part + minted thin collidable world box
    for (const p of this.prims) {
      if (p.kind !== 'pane' || physKeyOf(p.mat ?? 'glassPane') !== 'glass') continue;
      const local = paneAABB(p);
      const w = this._worldAABB(local.min, local.max);
      const part = makePart(p.part, 'glass', w.min, w.max, 1);
      part.downer = this; part.glass = true;
      this.parts.push(part);
      this._pushBox(w, p.part, 'glass');
    }
  }

  _worldAABB(localMin, localMax) { return worldAABB(this.k, this.x, this.y, this.z, localMin, localMax); }

  _pushBox(w, dpart, dmat) {
    const box = {
      min: new THREE.Vector3(w.min[0], w.min[1], w.min[2]),
      max: new THREE.Vector3(w.max[0], w.max[1], w.max[2]),
      downer: this, dpart, dmat, building: this.bid,
    };
    this.world.boxes.push(box);
    this.world.grid?.addBox(box);
    this._boxById.set(dpart, box);
  }

  _pushStaticBox(w) {
    const box = { min: new THREE.Vector3(w.min[0], w.min[1], w.min[2]), max: new THREE.Vector3(w.max[0], w.max[1], w.max[2]), building: this.bid };
    this.world.boxes.push(box);
    this.world.grid?.addBox(box);
  }

  _bounds() {
    const fp = this.spec.footprint;
    return { cx: this.x, cy: this.y + fp.h / 2, cz: this.z, radius: Math.hypot(fp.w, fp.h, fp.d) / 2 + 0.5 };
  }

  // ── live combat entry points (host-authoritative; caller gates on hostSim) ──────────────────────
  applyHit(point, normal, dir, weaponDef) {
    const r = this.runtime.applyHit(_a(point), _a(normal), _a(dir), weaponDef);
    this._broadcast(this._refresh(), null);
    return r;
  }
  applyBlast(pos, radius, ammoDef) {
    const r = this.runtime.applyBlast(_a(pos), radius, ammoDef);
    this._broadcast(this._refresh(), null);
    return r;
  }
  applyPenetration(origin, dir, weaponDef) {
    const r = this.runtime.applyPenetration(_a(origin), _a(dir), weaponDef);
    const dead = this._refresh();
    const holes = [];
    for (const h of (r.hits || [])) if (h.kind === 'hole') {
      if (h.entry) { this._addHole(h.entry); holes.push(h.entry); }
      if (h.exit) { this._addHole(h.exit); holes.push(h.exit); }
    }
    this._broadcast(dead, holes);
    return r;
  }

  // ── retire dead parts: drop colliders, dispose dead panes, rebuild dirty buckets (+ rubble) ─────
  _refresh() {
    const newlyDead = [];
    const dirtyMats = new Set();
    let masonryDied = false;
    for (const part of this.parts) {
      if (!part.dead || this._removed.has(part.dpart)) continue;
      this._removed.add(part.dpart);
      newlyDead.push(part.dpart);
      const box = this._boxById.get(part.dpart);
      if (box) {
        this.world.grid?.removeBox(box);
        const i = this.world.boxes.indexOf(box); if (i >= 0) this.world.boxes.splice(i, 1);
        this._boxById.delete(part.dpart);
      }
      if (part.glass) {
        const m = this._paneMeshById.get(part.dpart);
        if (m) { this.group.remove(m); m.geometry.dispose(); m.material.dispose(); this._paneMeshById.delete(part.dpart); }
      } else {
        const prim = this._primById.get(part.dpart);                  // O(1) lookup
        if (prim) { dirtyMats.add(prim.mat ?? 'concrete'); if (_isRubble(prim.mat)) masonryDied = true; }
      }
    }
    if (dirtyMats.size) this._rebuildBuckets(dirtyMats);
    else this.lastRebuildMs = 0;
    if (masonryDied) this._rebuildRubble();
    return newlyDead;
  }

  // Re-merge ONLY the touched material buckets minus their dead pieces, reusing the cached texture,
  // and drop a rubble stub where each masonry piece was removed (breach reads as a hole + rubble).
  _rebuildBuckets(dirtyMats) {
    const t0 = now();
    for (const mat of dirtyMats) {
      const old = this._meshByMat.get(mat);
      if (old) { this.group.remove(old); old.geometry.dispose(); }
      const survivors = this._opaquePrims.filter((p) => (p.mat ?? 'concrete') === mat && !this._removed.has(p.part));
      const mb = fillBuckets(survivors).get(mat) ?? new MeshBuilder();
      const mesh = realizeBucket(mat, mb, this.spec, this.texCache);
      this.group.add(mesh);
      this._meshByMat.set(mat, mesh);
    }
    this.lastRebuildMs = now() - t0;
  }

  // ONE flat voxel-coloured mesh for ALL masonry rubble (debris==='rubble') — a separate mesh, not
  // the textured bucket, so the dark RUBBLE tones actually show (a tiled bucket's map ignores
  // vertex colour). Rebuilt from scratch each time a masonry piece dies (rare; cheap).
  _rebuildRubble() {
    if (this._rubbleMesh) { this.group.remove(this._rubbleMesh); this._rubbleMesh.geometry.dispose(); this._rubbleMesh = null; }
    const mb = new MeshBuilder();
    let any = false;
    for (const p of this._opaquePrims) {
      if (!this._removed.has(p.part) || !_isRubble(p.mat)) continue;
      any = true;
      mb.box(Math.min(1.2, p.w), 0.28, Math.max(0.5, p.d), p.x, 0.14, p.z, RUBBLE_A);
      mb.box(0.6, 0.2, 0.5, p.x + 0.3, 0.32, p.z + 0.1, RUBBLE_B);
    }
    if (!any) return;
    this._rubbleMesh = new THREE.Mesh(mb.build(), voxelMaterial());
    this._rubbleMesh.castShadow = this._rubbleMesh.receiveShadow = false;
    this.group.add(this._rubbleMesh);
  }

  // Dark recessed cube marking an APFSDS through-hole (visual; the wall still collides). World-space.
  _addHole(p) {
    if (!p) return;
    if (!this._holeGeo) this._holeGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    if (!this._holeMat) this._holeMat = new THREE.MeshBasicMaterial({ color: 0x07060a });
    const m = new THREE.Mesh(this._holeGeo, this._holeMat);
    m.position.set(p[0] - this.x, p[1] - this.y, p[2] - this.z);   // group is translated; hole pos is world → local
    this.group.add(m);
    this._holes.push(m);
  }

  // ── co-op host→client replay ────────────────────────────────────────────────────────────────────
  _broadcast(deadIds, holes) {
    const mp = this.world?.game?.mp ?? this._mp;
    if (!mp || !mp.active || !mp.isHost || !mp.net) return;
    if ((!deadIds || !deadIds.length) && (!holes || !holes.length)) return;
    try { mp.net.send('bdestroy', { bid: this.bid, parts: deadIds || [], holes: holes || [] }); } catch (e) {}
  }
  // injected by the host wiring so _broadcast can reach the net without a world.game back-ref.
  setMP(mp) { this._mp = mp; }

  applyNetDestroy(deadIds, holes) {
    if (deadIds && deadIds.length) { for (const id of deadIds) { const part = this._partById(id); if (part) part.dead = true; } this._refresh(); }
    if (holes && holes.length) for (const h of holes) this._addHole(h);
  }
  netSnapshot() { return { bid: this.bid, parts: [...this._removed], holes: this._holes.map((m) => [m.position.x + this.x, m.position.y + this.y, m.position.z + this.z]) }; }
  netKillPart(id) { const part = this._partById(id); if (!part || part.dead) return; part.dead = true; this._broadcast(this._refresh(), null); }
  _partById(id) { for (const p of this.parts) if (p.dpart === id) return p; return null; }

  // ── misc ────────────────────────────────────────────────────────────────────────────────────────
  update(dt) { if (this.debris) this.debris.update(dt); }
  flammableParts() { return this.parts.filter((p) => !p.dead && MATERIALS[p.dmat] && MATERIALS[p.dmat].fuel > 0); }
}

// coerce a THREE.Vector3 / {x,y,z} / [x,y,z] into the plain [x,y,z] the destruct core reads.
function _a(v) { return Array.isArray(v) ? v : (v ? [v.x, v.y, v.z] : [0, 0, 0]); }

// Does this palette material drop rubble debris (brick/concrete/plaster/stone)? Guarded so an
// unexpected material in the rebuild hot-path can never throw (validated specs never reach it).
function _isRubble(mat) {
  try { const k = physKeyOf(mat); return !!k && MATERIALS[k]?.debris === 'rubble'; }
  catch (e) { return false; }
}
