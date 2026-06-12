// demobuilding.js — DESTRUCTIBLE BUILDING (Phase 7 of the playable-demo overhaul).
//
// A believable single-room Soviet guard-post / outbuilding (echoes the ПРОХОДНАЯ
// look from gatehouse.js, but deliberately NOT ultra-detailed) that is made
// DESTROYABLE-READY through the destruction core (src/destruct.js):
//   • brick WALLS split into ~1.6 m BREACH SEGMENTS (tier 'brick') — HE removes a
//     segment → a WALKABLE hole + rubble stub; APFSDS leaves a through-hole (segment
//     stays standing);
//   • a wood DOOR (tier 'wood', fuel>0 — the only flammable part, Phase 8 reads it);
//   • several GLASS WINDOW PANES (tier 'glass') as individual breakable parts —
//     a single bullet shatters one pane without touching its neighbours.
//
// ── RENDERING: lazy-split merged mesh (spec §4) ─────────────────────────────────
// Intact opaque structure = ONE merged voxel MeshBuilder geometry (1 draw call). On
// any opaque part death we rebuild the merged mesh MINUS the dead parts and add a
// rubble stub where a wall segment was removed (ported from feat/destructlab:scene.js).
// Glass panes are their OWN small transparent meshes, so shattering one only disposes
// that pane (no merged rebuild needed) — cheap + granular.
//
// ── DESTRUCTION CONTRACT (the two-rep pattern Phase 6/forest established) ────────
// Every destructible element registers TWO linked reps back-ref'd to this building:
//   (1) a destruct part (makePart, PLAIN [x,y,z] arrays) pushed to this.parts +
//       owned by a DestructRuntime — resolveHit/Blast/Penetration mutate it;
//   (2) a linked THREE.Vector3 AABB pushed to world.boxes + world.grid.addBox, with
//       box.downer=this, box.dpart=id, box.dmat=mat — so a live world.rayHit() returns
//       the box → box.downer (this building) → resolve. (Mirrors world.js's {box,_ref}
//       fortification pattern; two reps because collide reads Vector3 .x/.y/.z while
//       destruct reads array[i].)
// Static structure (corner piers, plinth, lintel band, roof, floor, window sills) gets
// a plain collision box only — no destruct part — so the roof always has support and
// breaches read as holes, not collapses (design decision #2: NO collapses).
//
// ── PHASE 9 HOOK ────────────────────────────────────────────────────────────────
// installDemoBuilding(game) sets game.world.demoBuilding (and returns it). Phase 9
// wires the live weapon path: a bullet hit → world.rayHit() → box.downer===building →
// building.applyHit(point,normal,dir,weaponDef); a rocket → building.applyBlast(pos,r,
// ammoDef); an APFSDS rod → building.applyPenetration(origin,dir,weaponDef). Each
// returns the resolve* result AND refreshes visuals+colliders. Host-authoritative
// (gate the call behind hostSim); the building is fully deterministic per part id.

import * as THREE from 'three';
import { MeshBuilder, TAU, voxelMaterial } from './util.js';
import { DestructRuntime, makePart, MATERIALS } from './destruct.js';
import { DebrisPool } from './destruct-debris.js';

// ── palette (layered shading: hi / mid / lo — never a flat blob) ────────────────
const BR = { hi: 0x9a5a3e, mid: 0x854832, lo: 0x643626 };   // booth brick
const CC = { hi: 0x9a958b, mid: 0x7c776d, lo: 0x5c584f };   // concrete plinth/lintel/roof
const WD = { hi: 0x8a6a3a, mid: 0x6a4a24, lo: 0x49321a };   // timber door
const FLR = 0x6a5238;                                       // interior floor slab
const RUBBLE_A = 0x6e4334, RUBBLE_B = 0x5d3a2c;
const GLASS_COL = 0xaed4dc;

// coerce a THREE.Vector3 / {x,y,z} / [x,y,z] into the plain [x,y,z] the destruct core reads.
function _a(v) { return Array.isArray(v) ? v : (v ? [v.x, v.y, v.z] : [0, 0, 0]); }

// ── geometry constants (metres) ─────────────────────────────────────────────────
const FW = 9.0, FD = 6.0;        // footprint width (X) × depth (Z), wall centre-lines at ±FW/2, ±FD/2
const T = 0.42;                  // wall thickness
const P = 0.66;                  // corner pier size
const WB = 0.15;                 // wall base / plinth top
const WT = 2.45;                 // wall top (underside of the lintel band)
const H  = 3.2;                  // roof underside
const SILL = 1.05, HEAD = 2.10;  // window opening (glass occupies SILL→HEAD)
const DOORH = 2.15;              // door head
const SEG_TARGET = 1.7;          // target breach-segment width

export class DemoBuilding {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = this.world.scene;

    this.parts = [];                 // destructible part-metadata (brick segs / wood door / glass panes)
    this._opaque = [];               // ALL opaque geometry descriptors (static + destructible) for the lazy-split merge
    this._boxById = new Map();       // dpart → linked world collision box (for removal on death)
    this._staticBoxes = [];          // plain collision boxes that never die
    this._removed = new Set();       // dpart ids already visually retired (idempotent _refresh)
    this.group = new THREE.Group();
    this.merged = null;
    this.lastRebuildMs = 0;
    this.placed = false;
    this.baseY = 0; this.cx = 0; this.cz = 0;

    this.debris = new DebrisPool(this.scene);

    try { this._place(); this._build(); this.rebuild(); this.placed = true; }
    catch (e) { console.warn('[demobuilding] build failed — continuing without building', e); }

    // NB: build the runtime AFTER _build() — DestructRuntime snapshots its parts list with
    // Array.from(), so the parts must already be registered (else it captures an empty array).
    this.runtime = new DestructRuntime({ parts: this.parts, debris: this.debris });
    this.scene.add(this.group);
  }

  // ── pick a flat, placeable, forest-cleared footprint on the demo terrain ────────
  _place() {
    const terr = this.world.terrain, HALF = this.world.HALF;
    const fpR = Math.hypot(FW / 2, FD / 2) + 1.0;     // footprint keep-out radius (~6.4 m)
    const samples = (x, z) => {
      let mn = Infinity, mx = -Infinity;
      for (const [dx, dz] of [[0, 0], [FW / 2, FD / 2], [-FW / 2, FD / 2], [FW / 2, -FD / 2], [-FW / 2, -FD / 2], [FW / 2, 0], [-FW / 2, 0], [0, FD / 2], [0, -FD / 2]]) {
        const h = terr.terrainHeightAt(x + dx, z + dz); if (h < mn) mn = h; if (h > mx) mx = h;
      }
      return { mn, mx, flat: mx - mn };
    };
    let best = null;
    for (let rad = 26; rad <= 48; rad += 3) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        if (Math.abs(x) > HALF - 12 || Math.abs(z) > HALF - 12) continue;
        if (!terr.isPlaceable(x, z, fpR, 'building')) continue;
        const s = samples(x, z);
        const score = s.flat + rad * 0.02;            // flattest, then closest
        if (!best || score < best.score) best = { x, z, score, baseY: s.mn };
      }
    }
    if (!best) best = { x: -34, z: 18, baseY: terr.terrainHeightAt(-34, 18) };  // deterministic fallback
    this.cx = best.x; this.cz = best.z; this.baseY = best.baseY;
    // clear the trees standing on the footprint (Phase 6 forest hook)
    if (this.game.forest && this.game.forest.clearArea) this.game.forest.clearArea(this.cx, this.cz, fpR);
    // face the door toward the map origin so the player walks up to it
    this._doorWall = (Math.abs(this.cz) >= Math.abs(this.cx))
      ? (this.cz > 0 ? 'S' : 'N')                      // origin is to −Z / +Z
      : (this.cx > 0 ? 'W' : 'E');
  }

  // ── lay out the four walls (segments / windows / door), piers, plinth, roof ─────
  _build() {
    const cx = this.cx, cz = this.cz, bY = this.baseY;
    const xL = cx - FW / 2, xR = cx + FW / 2, zS = cz - FD / 2, zN = cz + FD / 2;

    // corner piers (static, full height) — always support the roof; no collapse
    for (const [px, pz] of [[xL, zS], [xR, zS], [xL, zN], [xR, zN]])
      this._static(P, H, P, px, bY + H / 2, pz, CC.mid, 'pier');

    // four walls: axis 'x' walls at z=zS/zN span X between piers; axis 'z' at x=xL/xR span Z.
    this._wall('x', zS, xL + P / 2, xR - P / 2, this._doorWall === 'S', 0);  // south
    this._wall('x', zN, xL + P / 2, xR - P / 2, this._doorWall === 'N', 1);  // north
    this._wall('z', xL, zS + P / 2, zN - P / 2, this._doorWall === 'W', 2);  // west
    this._wall('z', xR, zS + P / 2, zN - P / 2, this._doorWall === 'E', 3);  // east

    // interior floor slab (walkable) + roof slab (static)
    this._static(FW - 0.3, 0.3, FD - 0.3, cx, bY + WB - 0.15, cz, FLR, 'floor');
    this._static(FW + 0.5, 0.35, FD + 0.5, cx, bY + H + 0.18, cz, CC.hi, 'roof');
    // plinth skirt that buries the downhill side so nothing floats
    this._static(FW + 0.4, 0.9, FD + 0.4, cx, bY - 0.3, cz, CC.lo, 'skirt');
  }

  // Build one wall line. axis 'x' → runs along X at z=fixed (thickness in Z); axis 'z'
  // → runs along Z at x=fixed (thickness in X). Columns alternate breach / window, with
  // one door column when hasDoor. Plinth + lintel bands span the whole wall (static).
  _wall(axis, fixed, c0, c1, hasDoor, wallIndex) {
    const bY = this.baseY, span = c1 - c0;
    const ncols = Math.max(2, Math.round(span / SEG_TARGET));
    const cw = span / ncols;
    const doorCol = hasDoor ? Math.floor(ncols / 2) : -1;

    // plinth band (base) + lintel band (top) along the full wall span — static
    this._lineBox(axis, fixed, c0, c1, bY + WB / 2, WB, CC.mid, 'plinth');
    this._lineBox(axis, fixed, c0, c1, bY + (WT + H) / 2, H - WT, CC.hi, 'lintel');

    for (let i = 0; i < ncols; i++) {
      const ac = c0 + (i + 0.5) * cw;                       // along-axis column centre
      const w = cw - 0.02;
      if (i === doorCol) {
        // wood DOOR (destructible) + static header above it
        this._lineBox(axis, fixed, ac - w / 2, ac + w / 2, bY + DOORH + (WT - DOORH) / 2, WT - DOORH, BR.mid, 'header');
        this._destruct(axis, fixed, ac, w * 0.92, bY, bY + DOORH, 'wood', WD.mid);
      } else if ((i + wallIndex) % 2 === 1) {
        // WINDOW: static sill + static header + a destructible GLASS pane in the opening
        this._lineBox(axis, fixed, ac - w / 2, ac + w / 2, bY + WB + (SILL - WB) / 2, SILL - WB, BR.mid, 'sill');
        this._lineBox(axis, fixed, ac - w / 2, ac + w / 2, bY + HEAD + (WT - HEAD) / 2, WT - HEAD, BR.mid, 'whead');
        this._pane(axis, fixed, ac, w * 0.86, bY + SILL, bY + HEAD);
      } else {
        // BREACH SEGMENT: full-height destructible brick (HE removes → walkable hole)
        this._destruct(axis, fixed, ac, w, bY + WB, bY + WT, 'brick', BR.mid);
      }
    }
  }

  // ── element constructors ────────────────────────────────────────────────────────
  // Resolve along-axis (ac, along-length al) + fixed coord into world box dims.
  _dims(axis, fixed, ac, al) {
    return axis === 'x'
      ? { w: al, d: T, cx: ac, cz: fixed }
      : { w: T, d: al, cx: fixed, cz: ac };
  }

  // A static (never-dies) merged-opaque box + a plain collision box.
  _static(w, h, d, cx, cy, cz, color, kind) {
    this._opaque.push({ kind, w, h, d, cx, cy, cz, color, part: null });
    this._pushBox(cx, cy, cz, w, h, d, null, null, null);
  }
  _lineBox(axis, fixed, c0, c1, cy, h, color, kind) {
    const al = c1 - c0, ac = (c0 + c1) / 2, dm = this._dims(axis, fixed, ac, al);
    this._opaque.push({ kind, w: dm.w, h, d: dm.d, cx: dm.cx, cy, cz: dm.cz, color, part: null });
    this._pushBox(dm.cx, cy, dm.cz, dm.w, h, dm.d, null, null, null);
  }

  // A destructible opaque part (brick segment / wood door): destruct part + linked box.
  _destruct(axis, fixed, ac, al, y0, y1, mat, color) {
    const h = y1 - y0, cy = (y0 + y1) / 2, dm = this._dims(axis, fixed, ac, al);
    const id = this._id();
    const min = [dm.cx - dm.w / 2, y0, dm.cz - dm.d / 2];
    const max = [dm.cx + dm.w / 2, y1, dm.cz + dm.d / 2];
    const part = makePart(id, mat, min, max, 1);
    part.downer = this;
    this.parts.push(part);
    this._opaque.push({ kind: mat, w: dm.w, h, d: dm.d, cx: dm.cx, cy, cz: dm.cz, color, part });
    this._pushBox(dm.cx, cy, dm.cz, dm.w, h, dm.d, this, id, mat);
  }

  // A destructible GLASS pane: its OWN transparent mesh + destruct part + linked box.
  _pane(axis, fixed, ac, al, y0, y1) {
    const h = y1 - y0, cy = (y0 + y1) / 2;
    const dm = axis === 'x' ? { w: al, d: 0.08, cx: ac, cz: fixed } : { w: 0.08, d: al, cx: fixed, cz: ac };
    const id = this._id();
    const min = [dm.cx - dm.w / 2, y0, dm.cz - dm.d / 2];
    const max = [dm.cx + dm.w / 2, y1, dm.cz + dm.d / 2];
    const part = makePart(id, 'glass', min, max, 1);
    part.downer = this; part.glass = true;
    this.parts.push(part);
    const mat = new THREE.MeshLambertMaterial({ color: GLASS_COL, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(dm.w, h, dm.d), mat);
    mesh.position.set(dm.cx, cy, dm.cz); mesh.renderOrder = 2;
    this.group.add(mesh); part.paneMesh = mesh;
    this._pushBox(dm.cx, cy, dm.cz, dm.w, h, dm.d, this, id, 'glass');
  }

  _pushBox(cx, cy, cz, w, h, d, downer, dpart, dmat) {
    const box = {
      min: new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
      max: new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
    };
    if (downer) { box.downer = downer; box.dpart = dpart; box.dmat = dmat; box.building = true; this._boxById.set(dpart, box); }
    else this._staticBoxes.push(box);
    this.world.boxes.push(box);
    this.world.grid.addBox(box);     // grid is already built (building constructs after World)
    return box;
  }

  // ── lazy-split rebuild: ONE merged opaque mesh minus the dead parts (+ rubble) ──
  rebuild() {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.merged) { this.group.remove(this.merged); this.merged.geometry.dispose(); }
    const mb = new MeshBuilder();
    for (const o of this._opaque) {
      if (o.part && o.part.dead) continue;               // skip destroyed brick/wood
      mb.box(o.w, o.h, o.d, o.cx, o.cy, o.cz, o.color);
      if (o.kind === 'brick' || o.kind === 'wood') {     // layered-shading accents
        mb.box(o.w, 0.08, o.d + 0.02, o.cx, o.cy + o.h / 2 - 0.04, o.cz, o.kind === 'wood' ? WD.hi : BR.hi);
        mb.box(o.w, 0.10, o.d + 0.01, o.cx, o.cy - o.h / 2 + 0.05, o.cz, o.kind === 'wood' ? WD.lo : BR.lo);
      }
    }
    // rubble stubs at the base of every removed brick wall segment (breach reads as a hole)
    for (const o of this._opaque) {
      if (o.kind !== 'brick' || !o.part || !o.part.dead) continue;
      mb.box(Math.min(1.2, o.w), 0.28, Math.max(0.5, o.d), o.cx, this.baseY + 0.14, o.cz, RUBBLE_A);
      mb.box(0.6, 0.2, 0.5, o.cx + 0.3, this.baseY + 0.32, o.cz + 0.1, RUBBLE_B);
    }
    this.merged = new THREE.Mesh(mb.build(), voxelMaterial());
    this.merged.castShadow = false; this.merged.receiveShadow = false;
    this.group.add(this.merged);
    this.lastRebuildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return this.lastRebuildMs;
  }

  // Retire dead parts: drop their collision box, dispose dead panes; rebuild the merged
  // opaque mesh only if an opaque (brick/wood) part actually died. Returns the list of part
  // ids newly retired by THIS call (so the host can broadcast exactly the co-op delta).
  _refresh() {
    let opaqueDied = false;
    const newlyDead = [];
    for (const part of this.parts) {
      if (!part.dead || this._removed.has(part.dpart)) continue;
      this._removed.add(part.dpart);
      newlyDead.push(part.dpart);
      const box = this._boxById.get(part.dpart);
      if (box) { this.world.grid.removeBox(box); const i = this.world.boxes.indexOf(box); if (i >= 0) this.world.boxes.splice(i, 1); this._boxById.delete(part.dpart); }
      if (part.glass && part.paneMesh) { this.group.remove(part.paneMesh); part.paneMesh.geometry.dispose(); part.paneMesh.material.dispose(); part.paneMesh = null; }
      else opaqueDied = true;
    }
    if (opaqueDied) this.rebuild();
    else this.lastRebuildMs = 0;   // glass-only event: nothing to merge
    return newlyDead;
  }

  // ── public destruct entry points (Phase 9 / verification call these) ────────────
  // The resolve* core reads PLAIN [x,y,z] arrays; accept either an array or a
  // THREE.Vector3/{x,y,z} (the live rayHit returns Vector3s) and coerce.
  applyHit(point, normal, dir, weaponDef) { const r = this.runtime.applyHit(_a(point), _a(normal), _a(dir), weaponDef); this._broadcast(this._refresh(), null); return r; }
  applyBlast(pos, radius, ammoDef) { const r = this.runtime.applyBlast(_a(pos), radius, ammoDef); this._broadcast(this._refresh(), null); return r; }
  applyPenetration(origin, dir, weaponDef) {
    const r = this.runtime.applyPenetration(_a(origin), _a(dir), weaponDef);
    const dead = this._refresh();
    // A through-hole leaves the brick part ALIVE (no merge change), so punch a visible dark
    // entry/exit hole at each structural penetration so the rod reads as having gone through.
    const holes = [];
    for (const h of (r.hits || [])) if (h.kind === 'hole') { if (h.entry) { this._addHole(h.entry); holes.push(h.entry); } if (h.exit) { this._addHole(h.exit); holes.push(h.exit); } }
    this._broadcast(dead, holes);
    return r;
  }

  // ── CO-OP host→client replay (Phase 10) ─────────────────────────────────────────
  // Host broadcasts exactly the destruction DELTA (newly-dead part ids + new APFSDS holes)
  // as one 'bdestroy' event. There is a single demoBuilding per world, so its part ids are
  // unambiguous — no owner flag needed (the 'bdestroy' type itself routes to the building).
  _broadcast(deadIds, holes) {
    const mp = this.game.mp;
    if (!mp || !mp.active || !mp.isHost || !mp.net) return;
    if ((!deadIds || !deadIds.length) && (!holes || !holes.length)) return;
    try { mp.net.send('bdestroy', { parts: deadIds || [], holes: holes || [] }); } catch (e) {}
  }

  // Client mirror: mark the host's dead parts dead, retire them (NO re-broadcast — _refresh
  // alone doesn't emit), and punch the same through-holes. Idempotent (_removed dedupes).
  applyNetDestroy(deadIds, holes) {
    if (deadIds && deadIds.length) { for (const id of deadIds) { const part = this._partById(id); if (part) part.dead = true; } this._refresh(); }
    if (holes && holes.length) for (const h of holes) this._addHole(h);
  }

  // Host helper for fire burn-through (the wood door): kill one part, retire it, broadcast.
  netKillPart(id) { const part = this._partById(id); if (!part || part.dead) return; part.dead = true; this._broadcast(this._refresh(), null); }

  // Late-join snapshot: every dead part id + every existing hole position, so a fresh joiner
  // sees the breaches/shattered panes/holes the host already has.
  netSnapshot() { return { parts: [...this._removed], holes: (this._holes || []).map(m => [m.position.x, m.position.y, m.position.z]) }; }

  _partById(id) { for (const p of this.parts) if (p.dpart === id) return p; return null; }

  // small dark recessed cube marking an APFSDS through-hole (purely visual; the wall still collides)
  _addHole(p) {
    if (!p) return;
    if (!this._holeGeo) this._holeGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    if (!this._holeMat) this._holeMat = new THREE.MeshBasicMaterial({ color: 0x07060a });
    const m = new THREE.Mesh(this._holeGeo, this._holeMat);
    m.position.set(p[0], p[1], p[2]); m.renderOrder = 3;
    this.group.add(m);
    (this._holes || (this._holes = [])).push(m);
  }

  // per-frame tick (Phase 9 — game.js calls this): advance the debris burst physics.
  update(dt) { if (this.debris) this.debris.update(dt); }

  // Parts the fire system may ignite (fuel > 0, still alive) — the wood door, here.
  flammableParts() { return this.parts.filter(p => !p.dead && MATERIALS[p.dmat] && MATERIALS[p.dmat].fuel > 0); }

  _id() { return (this._nextId = (this._nextId | 0) + 1); }
}

// Factory: build the destructible demo building (no-op on flat maps). Sets and returns
// game.world.demoBuilding so Phase 9 can route live fire through box.downer.
export function installDemoBuilding(game) {
  const world = game.world;
  if (!world || !world.hasTerrain || !world.terrain) return null;
  const b = new DemoBuilding(game);
  world.demoBuilding = b;
  return b;
}
