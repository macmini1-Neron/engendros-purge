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
import { DestructRuntime, makePart, MATERIALS, orphanedCells, makeTumble, stepBody } from './destruct.js';
import { DebrisPool } from './destruct-debris.js';
import { placeProp, hasModel } from './props/registry.js';
import { getSpec } from './props/registry-core.js';
import { buildSpec } from './props/voxel-interp.js';
import { makeDigitalClockFace } from './clockface.js';
import { formatHHMM, handAngles } from './worldclock.js';

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
const CELL = 0.5;                // voxel cell size — destructible brick segments dice into CELL cells
                                 // (fine holes + orphan-collapse), reusing the part/box/rebuild pipeline
const FALL_G = 4.2;              // collapse fallers fall slower/heavier than physical 9.81 (owner: weightier feel)
const FALLER_CAP = 64;           // max simultaneous tumbling collapse chunks (ONE InstancedMesh draw call)

export class DemoBuilding {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = this.world.scene;

    this.parts = [];                 // destructible part-metadata (brick cells / wood door / glass panes)
    this.cells = [];                 // brick-wall CELLS subset of parts (carry .grounded/.adj for collapse)
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

    // collapse fallers: slow tumbling cell-chunks (#6) — ONE InstancedMesh draw call, capped + recycled.
    this._fallers = []; this._fallerColor = new THREE.Color(); this._fallerDummy = new THREE.Object3D();
    this._fallerAxis = new THREE.Vector3();
    this._fallerMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), voxelMaterial(), FALLER_CAP);
    this._fallerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._fallerMesh.frustumCulled = false; this._fallerMesh.castShadow = false;
    for (let i = 0; i < FALLER_CAP; i++) { this._fallerMesh.setColorAt(i, this._fallerColor.set(0x6e4334)); this._stashFaller(i); }
    this._fallerFree = Array.from({ length: FALLER_CAP }, (_, i) => i);
    this.scene.add(this._fallerMesh);

    try { this._place(); this._build(); this._wireCells(); this._navTestbed(); this.rebuild(); this.placed = true; }
    catch (e) { console.warn('[demobuilding] build failed — continuing without building', e); }

    // NB: build the runtime AFTER _build() — DestructRuntime snapshots its parts list with
    // Array.from(), so the parts must already be registered (else it captures an empty array).
    this.runtime = new DestructRuntime({ parts: this.parts, debris: this.debris });
    this.scene.add(this.group);

    // wall clock «ЧАСОЗБОР» (modelgen spec) — registry loads async, so this usually
    // no-ops here and the lazy retry in update() hangs it a few frames later.
    this._clock = null; this._clockHour = null; this._clockMinute = null; this._clockPart = null;
    this._tryHangClock();
  }

  // ── wall clock «ЧАСОЗБОР» — live analog display of game._worldClock ────────────
  // Hangs on the innermost face of the wall OPPOSITE the door, centred on the brick
  // (non-window) column nearest the wall middle. Hands are the spec's handHour /
  // handMinute rig nodes, driven every frame from the shared world clock via
  // handAngles() (docs/superpowers/specs/2026-06-12-worldclock-displays-contract.md).
  _tryHangClock() {
    if (this._clock || !this.placed) return;
    const spec = getSpec('wallclock-chasozbor');
    if (!spec) return;                                  // modelgen registry not loaded yet — retry next frame
    const cx = this.cx, cz = this.cz, bY = this.baseY;
    const xL = cx - FW / 2, xR = cx + FW / 2, zS = cz - FD / 2, zN = cz + FD / 2;
    // wall opposite the door: axis, fixed line, along-span, wallIndex (mirrors _build's _wall calls)
    const OPP = {
      S: { axis: 'x', fixed: zN, c0: xL + P / 2, c1: xR - P / 2, wi: 1, yaw: Math.PI,      inward: [0, -1] },
      N: { axis: 'x', fixed: zS, c0: xL + P / 2, c1: xR - P / 2, wi: 0, yaw: 0,            inward: [0, 1] },
      W: { axis: 'z', fixed: xR, c0: zS + P / 2, c1: zN - P / 2, wi: 3, yaw: -Math.PI / 2, inward: [-1, 0] },
      E: { axis: 'z', fixed: xL, c0: zS + P / 2, c1: zN - P / 2, wi: 2, yaw: Math.PI / 2,  inward: [1, 0] },
    }[this._doorWall];
    // same column math as _wall(): pick the BRICK column ((i+wi)%2===0) nearest the middle
    const span = OPP.c1 - OPP.c0, ncols = Math.max(2, Math.round(span / SEG_TARGET)), cw = span / ncols;
    let best = OPP.c0 + span / 2, bestD = Infinity;
    for (let i = 0; i < ncols; i++) {
      if ((i + OPP.wi) % 2 === 1) continue;             // window column — skip
      const ac = OPP.c0 + (i + 0.5) * cw, d = Math.abs(ac - (OPP.c0 + span / 2));
      if (d < bestD) { bestD = d; best = ac; }
    }
    // model: floor-anchored, dial centre +0.141, back plane −0.055 → stand 0.056 off the wall face
    const off = T / 2 + 0.056;
    const px = OPP.axis === 'x' ? best : OPP.fixed + OPP.inward[0] * off;
    const pz = OPP.axis === 'x' ? OPP.fixed + OPP.inward[1] * off : best;
    const obj = buildSpec(spec);
    obj.position.set(px, bY + 2.0 - 0.141, pz);         // dial centre 2.0 m above the base — over window head height
    obj.rotation.y = OPP.yaw;
    this.group.add(obj);
    this._clock = obj;
    this._clockHour = obj.getObjectByName('handHour');
    this._clockMinute = obj.getObjectByName('handMinute');
    // the brick segment behind the clock — if it's breached, the clock dies with the wall
    this._clockPart = this.parts.find((p) =>
      p.dmat === 'brick' &&
      px >= p.min[0] - 0.3 && px <= p.max[0] + 0.3 &&
      pz >= p.min[2] - 0.3 && pz <= p.max[2] + 0.3) || null;
  }

  _updateClock() {
    if (!this._clock) { this._tryHangClock(); return; }
    if (this._clockPart && this._clockPart.dead) {       // host wall breached → the clock went with it
      this._clock.visible = false;
      return;
    }
    const wc = this.game._worldClock;
    if (!wc || !this._clockHour || !this._clockMinute) return;
    const a = handAngles(wc.minuteOfDay() + wc.alpha);   // negative z = clockwise on the +Z-facing dial
    this._clockHour.rotation.z = -a.hourRad;
    this._clockMinute.rotation.z = -a.minuteRad;
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

  // ── nav/AI testbed (2026-06-19 vertical slice, docs/.../2026-06-19-demo-nav-testbed-design.md) ──
  // TWO registered staircases (on the wall opposite the door + a perpendicular wall) from the ground to
  // the roof, so the layered horde nav can route mobs UP to a player on the roof (the deferred bug-E case)
  // AND gets a route CHOICE. Steps go through _static (→ merged mesh + grid-indexed collision via _pushBox
  // — world._solid does NOT addBox post-grid-build, so world._stairs can't be reused here); the foot→top
  // nav LINK is registered by hand exactly as world._stairs does. Geometry + links only — no algo change.
  // (An exterior wall LADDER was tried for the 2nd route but an outside ladder fights the wall collider /
  // the roof overhang and the climb wouldn't engage; the ladder mechanic is already covered by the
  // bunker/airfield interiors, so a second staircase is the robust route-choice here.)
  _navTestbed() {
    const cx = this.cx, cz = this.cz, bY = this.baseY;
    const xL = cx - FW / 2, xR = cx + FW / 2, zS = cz - FD / 2, zN = cz + FD / 2;
    const roofY = bY + H + 0.35;                          // walkable roof-slab top
    const WALL = {
      S: { nx: 0, nz: -1, mx: cx, mz: zS }, N: { nx: 0, nz: 1, mx: cx, mz: zN },
      W: { nx: -1, nz: 0, mx: xL, mz: cz }, E: { nx: 1, nz: 0, mx: xR, mz: cz },
    };
    const OPP = { S: 'N', N: 'S', W: 'E', E: 'W' };       // primary stair: wall opposite the door
    const PERP = { S: 'E', N: 'E', W: 'N', E: 'N' };      // secondary stair: a perpendicular wall
    this.world._navLinks = this.world._navLinks || [];
    this._roofStair(WALL[OPP[this._doorWall]], roofY, bY);
    this._roofStair(WALL[PERP[this._doorWall]], roofY, bY);
  }

  // One external staircase climbing IN from the ground toward `wall`'s roof edge (solid steppable blocks),
  // plus the registered foot→top vertical nav link the layered horde nav routes mobs up. The flight is
  // ANCHORED to the terrain at its foot, not to the building base: the demo terrain dips away from the
  // building, so a baseY-anchored flight FLOATS over a downhill foot and a mob can't board the first step.
  _roofStair(wall, roofY, bY) {
    const stepD = 0.72, sW = 3.0;
    const n0 = Math.ceil((roofY - bY) / 0.5);                                             // rough step count to size the run
    const topX = wall.mx + wall.nx * 0.45, topZ = wall.mz + wall.nz * 0.45;               // top tread at the wall/roof lip
    const footX = topX + wall.nx * (n0 - 1) * stepD, footZ = topZ + wall.nz * (n0 - 1) * stepD;
    const footY = this.world.terrain ? this.world.terrain.terrainHeightAt(footX, footZ) : bY;
    const base = Math.min(bY, footY) - 0.05;                                              // start at the lower of base / foot terrain
    const steps = Math.max(6, Math.ceil((roofY - base) / 0.55)), stepH = (roofY - base) / steps; // ≤ STEP_UP (0.62) per tread
    for (let i = 0; i < steps; i++) {
      const hY = (i + 1) * stepH, stx = footX - wall.nx * i * stepD, stz = footZ - wall.nz * i * stepD;
      this._static(wall.nx ? stepD : sW, hY, wall.nz ? stepD : sW, stx, base + hY / 2, stz, CC.mid, 'stair');
    }
    this.world._navLinks.push({ x0: footX + wall.nx * 0.8, z0: footZ + wall.nz * 0.8, y0: base, x1: topX, z1: topZ, y1: roofY });
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
        // grab the FIRST window sill as the resting spot for the «Электроника» desk clock
        if (!this._clockXf) this._clockXf = this._sillSpot(axis, fixed, ac);
      } else {
        // BREACH SEGMENT: full-height destructible brick, DICED into voxel cells (fine holes + collapse)
        this._destructGrid(axis, fixed, ac, w, bY + WB, bY + WT, 'brick');
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

  // Dice a destructible brick wall segment into a GRID of voxel CELLS (fine holes + orphan-collapse).
  // Each cell is a full destruct part + linked collision box + merged-opaque descriptor — so the
  // existing parts/box/lazy-rebuild pipeline gives finer destruction for FREE (more, smaller parts).
  // Brick columns always alternate with windows (see _wall), so every segment is an ISOLATED column:
  // adjacency + collapse stay WITHIN the segment (cell.seg), no cross-segment support graph needed.
  _destructGrid(axis, fixed, ac, al, y0, y1, mat) {
    const seg = (this._nextSeg = (this._nextSeg | 0) + 1);
    const ncx = Math.max(1, Math.round(al / CELL));
    const ncy = Math.max(2, Math.round((y1 - y0) / CELL));
    const cw = al / ncx, ch = (y1 - y0) / ncy;
    for (let gi = 0; gi < ncx; gi++) {
      const cac = ac - al / 2 + (gi + 0.5) * cw;          // cell along-axis centre
      for (let gj = 0; gj < ncy; gj++) {
        const cy0 = y0 + gj * ch, cy = cy0 + ch / 2, dm = this._dims(axis, fixed, cac, cw - 0.01);
        const id = this._id();
        const min = [dm.cx - dm.w / 2, cy0, dm.cz - dm.d / 2];
        const max = [dm.cx + dm.w / 2, cy0 + ch, dm.cz + dm.d / 2];
        const part = makePart(id, mat, min, max, 0.25);   // a CELL soaks ~1/4 of a full brick segment
        part.downer = this;
        part.seg = seg; part.gi = gi; part.gj = gj;
        part.grounded = (gj === 0);                       // bottom row rests on the plinth (support root)
        part.adj = [];                                    // filled by _wireCells()
        this.parts.push(part); this.cells.push(part);
        const col = gj === ncy - 1 ? BR.hi : (gj === 0 ? BR.lo : BR.mid);  // layered shade by row band
        const o = { kind: mat, cell: true, w: dm.w, h: ch, d: dm.d, cx: dm.cx, cy, cz: dm.cz, color: col, part };
        this._opaque.push(o); part.o = o;                 // link cell→geometry so a faller can read its size/colour
        this._pushBox(dm.cx, cy, dm.cz, dm.w, ch, dm.d, this, id, mat);
      }
    }
  }

  // Wire 4-neighbour adjacency within each brick segment so orphanedCells() can flood support up
  // from the grounded (bottom) row. Called once after _build(), before the first rebuild.
  _wireCells() {
    const byKey = new Map();
    for (const c of this.cells) byKey.set(`${c.seg}:${c.gi}:${c.gj}`, c);
    for (const c of this.cells) {
      for (const [dgi, dgj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = byKey.get(`${c.seg}:${c.gi + dgi}:${c.gj + dgj}`);
        if (n) c.adj.push(n.dpart);
      }
    }
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

  // ── collapse fallers (#6): slow tumbling cell-chunks, one InstancedMesh ─────────
  _stashFaller(i) {
    this._fallerDummy.position.set(0, -999, 0); this._fallerDummy.quaternion.set(0, 0, 0, 1);
    this._fallerDummy.scale.setScalar(0.0001); this._fallerDummy.updateMatrix();
    this._fallerMesh.setMatrixAt(i, this._fallerDummy.matrix);
  }

  // Launch a slow tumbling chunk from a collapsed cell (VISUAL only; co-op safe — see _collapse).
  // dir (optional [x,y,z]) leans the topple that way (e.g. a blast/penetration push direction).
  _spawnFaller(part, dir) {
    const o = part.o; if (!o || !this._fallerFree.length) return;   // cap reached ⇒ drop silently (perf guard)
    const i = this._fallerFree.pop();
    const seed = (part.dpart * 2654435761) >>> 0;
    const dl = dir ? Math.hypot(dir[0], dir[2]) || 1 : 1, dx = dir ? dir[0] / dl : 0, dz = dir ? dir[2] / dl : 0;
    const jx = (((seed >> 3) & 7) - 3.5) * 0.12, jz = (((seed >> 6) & 7) - 3.5) * 0.12;   // seeded lateral jitter
    const body = makeTumble({ pos: [o.cx, o.cy, o.cz], vel: [dx * 0.8 + jx, 0.4, dz * 0.8 + jz],
      seed, radius: Math.max(o.w, o.h, o.d) * 0.5, g: FALL_G, spin: 0.6, floorY: this.baseY });
    this._fallerMesh.setColorAt(i, this._fallerColor.set(o.color));
    if (this._fallerMesh.instanceColor) this._fallerMesh.instanceColor.needsUpdate = true;
    this._fallers.push({ body, i, size: [o.w, o.h, o.d], linger: 0 });
  }

  _updateFallers(dt) {
    if (!this._fallers.length) return;
    const D = this._fallerDummy;
    for (let k = this._fallers.length - 1; k >= 0; k--) {
      const f = this._fallers[k];
      stepBody(f.body, dt);
      if (f.body.settled && (f.linger += dt) > 5) {       // hold as rubble a few s, then recycle the slot
        this._stashFaller(f.i); this._fallerFree.push(f.i); this._fallers.splice(k, 1); continue;
      }
      const p = f.body.pos;
      D.position.set(p[0], p[1], p[2]);
      D.quaternion.setFromAxisAngle(this._fallerAxis.set(f.body.rotAxis[0], f.body.rotAxis[1], f.body.rotAxis[2]), f.body.rotAngle);
      D.scale.set(f.size[0], f.size[1], f.size[2]); D.updateMatrix();
      this._fallerMesh.setMatrixAt(f.i, D.matrix);
    }
    this._fallerMesh.instanceMatrix.needsUpdate = true;
  }

  // Cascade: every cell that lost its support path to the ground caves in as a slow faller (#6).
  // Marks the orphans dead (the caller's _refresh retires their boxes + rebuilds the merged mesh)
  // and returns the collapsed ids. One orphanedCells() flood is the FULL single-event cascade.
  _collapse(dir) {
    if (!this.cells.length) return [];
    const orphanIds = orphanedCells(this.cells);
    if (!orphanIds.length) return [];
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity, mxy = -Infinity;
    for (const id of orphanIds) {
      const part = this._partById(id);
      if (!part || part.dead) continue;
      part.dead = true;
      this._spawnFaller(part, dir);
      if (part.min[0] < mnx) mnx = part.min[0]; if (part.min[2] < mnz) mnz = part.min[2];
      if (part.max[0] > mxx) mxx = part.max[0]; if (part.max[2] > mxz) mxz = part.max[2];
      if (part.max[1] > mxy) mxy = part.max[1];
    }
    // #5 environmental kill: bury anything standing under the cave-in footprint (host-auth in crushZone).
    // Inflate the thin wall footprint by SPREAD so rubble also catches a mob hugging the breached wall.
    if (mxy > -Infinity && this.game.enemies && this.game.enemies.crushZone) {
      const SPREAD = 0.7;
      this.game.enemies.crushZone([mnx - SPREAD, this.baseY, mnz - SPREAD], [mxx + SPREAD, mxy, mxz + SPREAD], 'collapse');
    }
    return orphanIds;
  }

  // ── lazy-split rebuild: ONE merged opaque mesh minus the dead parts (+ rubble) ──
  rebuild() {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.merged) { this.group.remove(this.merged); this.merged.geometry.dispose(); }
    const mb = new MeshBuilder();
    for (const o of this._opaque) {
      if (o.part && o.part.dead) continue;               // skip destroyed cell / door
      mb.box(o.w, o.h, o.d, o.cx, o.cy, o.cz, o.color);
      if (!o.cell && (o.kind === 'brick' || o.kind === 'wood')) {  // segment-scale layered accents (door)
        mb.box(o.w, 0.08, o.d + 0.02, o.cx, o.cy + o.h / 2 - 0.04, o.cz, o.kind === 'wood' ? WD.hi : BR.hi);
        mb.box(o.w, 0.10, o.d + 0.01, o.cx, o.cy - o.h / 2 + 0.05, o.cz, o.kind === 'wood' ? WD.lo : BR.lo);
      }
    }
    // rubble stubs at the base of any removed SEGMENT-scale brick (cells leave clean voxel holes +
    // collapse fallers instead, so this only fires for non-cell brick if any is ever added back)
    for (const o of this._opaque) {
      if (o.cell || o.kind !== 'brick' || !o.part || !o.part.dead) continue;
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
  applyHit(point, normal, dir, weaponDef) {
    const r = this.runtime.applyHit(_a(point), _a(normal), _a(dir), weaponDef);
    const dead = this._refresh();                         // retire the directly-killed part(s)
    this._collapse(_a(dir)); const fell = this._refresh(); // cascade: unsupported cells cave in as fallers
    this._broadcast([...dead, ...fell], null);
    return r;
  }
  applyBlast(pos, radius, ammoDef) {
    const r = this.runtime.applyBlast(_a(pos), radius, ammoDef);
    const dead = this._refresh();
    this._collapse(null); const fell = this._refresh();
    this._broadcast([...dead, ...fell], null);
    return r;
  }
  applyPenetration(origin, dir, weaponDef) {
    const r = this.runtime.applyPenetration(_a(origin), _a(dir), weaponDef);
    const dead = this._refresh();
    this._collapse(_a(dir)); const fell = this._refresh(); // a rod that cuts a column's base caves it in
    dead.push(...fell);
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
    if (deadIds && deadIds.length) {
      // Mirror the host's dead parts. The host's combined delta already includes the cells it
      // collapsed, so the client does NOT re-run _collapse (no new netcode); it just spawns a
      // visual faller for each newly-dead brick CELL so the cave-in reads the same on every peer.
      for (const id of deadIds) {
        const part = this._partById(id);
        if (part && !part.dead) { part.dead = true; if (part.o && part.o.cell) this._spawnFaller(part, null); }
      }
      this._refresh();
    }
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

  // ── «Электроника 6.15М» desk clock on a window sill ─────────────────────────────
  // Resting transform (world) for a clock on the ledge of the window at (axis,fixed,ac),
  // sat toward the interior edge and turned to face into the room.
  _sillSpot(axis, fixed, ac) {
    const sillTop = this.baseY + SILL;          // ledge surface y (top of the sub-window brick)
    const inset = T / 2 - 0.075;                // nudge to the interior edge so it sits inside
    if (axis === 'x') {                         // wall runs along X at z=fixed; interior toward cz
      const iz = Math.sign(this.cz - fixed) || 1;
      return { x: ac, y: sillTop, z: fixed + iz * inset, yaw: iz > 0 ? 0 : Math.PI };
    }                                           // wall runs along Z at x=fixed; interior toward cx
    const ix = Math.sign(this.cx - fixed) || 1;
    return { x: fixed + ix * inset, y: sillTop, z: ac, yaw: ix > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }

  // Place the «Электроника» desk clock + mount the live VFD on its panel. Lazy — called from
  // update() once the (async-registered) modelgen spec is available. (Field is _deskClock so it
  // never collides with the analog wall clock's this._clock.)
  _placeDeskClock() {
    const xf = this._clockXf;
    const obj = placeProp(this.scene, 'electronika-clock', xf.x, xf.z, xf.yaw, { y: xf.y });
    if (!obj) { this._clockXf = null; return; }   // registration must have failed — stop retrying
    const face = makeDigitalClockFace({ widthM: 0.150, heightM: 0.044 });
    face.mesh.position.set(0, 0.047, 0.0595);     // local: centred on, just proud of, the panel front
    obj.add(face.mesh);
    this._deskClock = { obj, face };
  }

  // per-frame tick (Phase 9 — game.js calls this): debris physics + BOTH live clocks —
  // the analog wall «ЧАСОЗБОР» (_updateClock, Fable) and the digital «Электроника» desk VFD.
  update(dt) {
    if (this.debris) this.debris.update(dt);
    this._updateFallers(dt);
    this._updateClock();
    if (!this._deskClock && this._clockXf && hasModel('electronika-clock')) this._placeDeskClock();
    if (this._deskClock) {
      this._blinkT = (this._blinkT || 0) + dt;
      const blink = (this._blinkT % 1) < 0.5;     // colon blinks ~1 Hz (sub-minute, local)
      const wc = this.game._worldClock;
      this._deskClock.face.setTime(wc ? formatHHMM(wc.minuteOfDay()) : '--:--', { blink });
    }
  }

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
