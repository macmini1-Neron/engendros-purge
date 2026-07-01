// world.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, TAU, chc, clamp, lerp, makeRNG, randRange, rayAABB, rng, shade, voxelMaterial } from './util.js';
import { refineBoxHit } from './raycollide.js';
import { SpatialGrid } from './grid.js';
import { CONSTELLATIONS, DAY_FRAC, FOLIAGE_SLOW, NIGHT_CYCLE, SKYC, STEP_UP, STRUCT_FX_COLOR } from './tuning.js';
import { inThicket } from './foliage.js';
import { skyPhase, isNight, keywordMinute, MINUTES_PER_DAY } from './worldclock.js';
import { STRUCT_CAP, STRUCT_DEFS } from './economy.js';
import { buildBarbedWire, buildBarricade, buildFieldRadio, buildSandbags, animateFieldRadio } from './props.js';
import { buildSpec } from './props/voxel-interp.js';
import { getSpec } from './props/registry-core.js';

// Deployable R-105Д VOICE radio mesh — reuses the courier's R-105D voxel spec (built once, cloned).
// Falls back to the field-radio prop if the spec registry isn't ready.
let _r105Proto = null;
function buildR105Mesh() {
  try {
    if (!_r105Proto) { const spec = getSpec('r105d'); if (spec) _r105Proto = buildSpec(spec); }
    if (_r105Proto) { const m = _r105Proto.clone(); m.scale.setScalar(1.0); return m; } // TODO: tune scale after visual review
  } catch (e) { if (typeof console !== 'undefined') console.warn('[world] R-105 model build failed — field-radio fallback', e); }
  return buildFieldRadio();
}
import { buildIndustrial } from './industrial.js';
import { buildStrongpoint } from './strongpoint.js';
import { buildAirfield } from './airfield.js';
import { buildKolkhoz } from './kolkhoz.js';
import { buildSecretBunker } from './bunker.js';
import { buildOpenWorld } from './openworld.js';
import { RADIO_STATIONS, GHOST_STATION, radioAttenuation, stationByIndex, stationLabel } from './radio.js';
import { makeTerrain } from './terrain.js';
import { TerrainChunks } from './terrain-chunks.js';
import { seatProp } from './terrain-place.js';

// ─── T2 WALKABLE-TERRAIN feel knobs (Phase 4) — owner-tunable ──────────────────
// These ONLY apply when `world.hasTerrain` is true (non-flat profiles). On flat
// maps (`'flat'` profile) `terrainHeightAt`→0 and `terrainSlopeAt`→0, and the
// ground-follow re-seat is gated off via `hasTerrain`, so the unified path stays
// byte-identical to the old y=0 floor.
//
//   TERRAIN_GROUND_FOLLOW_STEP — max metres the smooth ground may pull the player DOWN
//     in one frame while grounded (downhill walking). Bigger = snappier descents but the
//     player can clip down small man-made ledges; smaller = the player briefly goes
//     airborne off rises (mini "hops"). 0.6 m feels stable on the demo's gentle hills.
//   TERRAIN_UPHILL_EPS — tiny ground-rise (m) over one horizontal step that counts as
//     "uphill" for the slope-limit test. Kept small (just above FP noise) because the
//     per-frame step is short (~0.09 m) so its rise is small; the slope ANGLE is the real
//     gate. On genuinely flat ground slope≈0 < limit, so this never false-blocks there.
//   Slope limit itself = `terrain.slopeLimit` (default 35°, set in terrain.js). Uphill
//     terrain steeper than this acts as a wall — the player can't climb cliffs but can
//     still walk along/down them. Visual ground-snap smoothing is handled in player.js
//     by the existing `_camY` damp (lambda 18), so no extra snap-lambda is needed here.
const TERRAIN_GROUND_FOLLOW_STEP = 0.6;
const TERRAIN_UPHILL_EPS = 1e-4;


// ---------------------------------------------------------------------------
// World — voxel de_dust2-flavored arena. Sandstone structures, crates,
// chokepoints. Collision = AABBs. Also holds supply-drop landing spots & spawns.
// ---------------------------------------------------------------------------
export class World {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.HALF = 70;
    this.boxes = [];
    this._navLinks = [];             // vertical stair links {x0,z0,y0,x1,z1,y1} for the layered horde nav (navgraph.js); _stairs registers them
    this.cullProps = [];             // static decorative meshes eligible for draw-distance culling (Game._cullByDistance)
    this.grid = new SpatialGrid();   // spatial index over `boxes` (built after the map, addBox on runtime adds)
    this._exN = { nx: 0, ny: 0, nz: 0 };                                   // capsule-normal scratch (zero-alloc hot path)
    this._refine = (b, ox, oy, oz, dx, dy, dz, t) => refineBoxHit(b, ox, oy, oz, dx, dy, dz, t, null); // narrowphase during the walk (no normal needed yet)
    this.spawns = [];
    this.lootSpots = [];
    this.mapId = (game.mapId === 'steppe') ? 'steppe' : (game.mapId === 'demo') ? 'demo' : (game.mapId === 'forest') ? 'forest' : 'arena';
    // Every map has a terrain. Flat maps use the 'flat' profile (height 0 everywhere) so the unified
    // collision path degenerates to the old y=0 floor. `hasTerrain` now means "non-flat elevation".
    // 'forest' is its own hilly profile (distinct seed) — the forest kit + destructible building auto-run
    // on any non-flat map (they gate on hasTerrain), so ?map=forest gets trees + destruction for free.
    this.terrain = makeTerrain({
      profile: this.mapId === 'demo' ? 'demo' : this.mapId === 'forest' ? 'forest' : 'flat',
      seed: this.mapId === 'forest' ? 2025 : 1337,
    });
    this.hasTerrain = this.terrain.profile !== 'flat';
    this.chunks = null;
    if (this.mapId === 'steppe') {
      this._buildSteppe();
    } else if (this.mapId === 'demo') {
      this._buildDemo();
    } else if (this.mapId === 'forest') {
      this._buildForest();
    } else {
      this.scene.fog.near = 95; this.scene.fog.far = 640; // wider haze for the larger compound
      this._build();
    }
    this.grid.build(this.boxes);     // index every collider the map pushed
  }

  _solid(builder, w, h, d, x, y, z, color, opts = {}) {
    builder.box(w, h, d, x, y, z, color, opts);
    this.boxes.push({ min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2) });
  }

  // Staircase of solid blocks rising stepH each from baseY, marching along (dx,dz). Walkable via step-up.
  _stairs(builder, sx, sz, dx, dz, steps, color, baseY = 0, stepH = 0.5, stepD = 0.85, width = 3.4) {
    for (let i = 0; i < steps; i++) {
      const cx = sx + dx * i * stepD, cz = sz + dz * i * stepD, hY = (i + 1) * stepH;
      this._solid(builder, dx !== 0 ? stepD : width, hY, dz !== 0 ? stepD : width, cx, baseY + hY / 2, cz, color, { tint: 0.05 });
    }
    // Register a vertical nav link (foot ground → last-step top) so the layered horde nav routes mobs
    // UP the stairs regardless of grid-cell granularity. (Ladders are registered separately by skobTrap.)
    if (this._navLinks) this._navLinks.push({
      x0: sx - dx * 0.8, z0: sz - dz * 0.8, y0: baseY,
      x1: sx + dx * (steps - 1) * stepD, z1: sz + dz * (steps - 1) * stepD, y1: baseY + steps * stepH,
    });
  }

  // Wall along axis 'x' or 'z' centered at (cx,cz), with an optional doorway/window gap { width, height, offset }.
  _wall(b, cx, cz, length, height, baseY, axis, color, door) {
    const t = 0.6;
    if (!door) {
      if (axis === 'x') this._solid(b, length, height, t, cx, baseY + height / 2, cz, color, { tint: 0.04 });
      else this._solid(b, t, height, length, cx, baseY + height / 2, cz, color, { tint: 0.04 });
      return;
    }
    const dw = door.width, dh = Math.min(height, door.height || 2.6), off = door.offset || 0, half = length / 2;
    const leftLen = half + off - dw / 2, rightLen = half - off - dw / 2, lintel = height - dh;
    if (axis === 'x') {
      if (leftLen > 0.05) this._solid(b, leftLen, height, t, cx - half + leftLen / 2, baseY + height / 2, cz, color, { tint: 0.04 });
      if (rightLen > 0.05) this._solid(b, rightLen, height, t, cx + half - rightLen / 2, baseY + height / 2, cz, color, { tint: 0.04 });
      if (lintel > 0.05) this._solid(b, dw, lintel, t, cx + off, baseY + dh + lintel / 2, cz, color, { tint: 0.04 });
    } else {
      if (leftLen > 0.05) this._solid(b, t, height, leftLen, cx, baseY + height / 2, cz - half + leftLen / 2, color, { tint: 0.04 });
      if (rightLen > 0.05) this._solid(b, t, height, rightLen, cx, baseY + height / 2, cz + half - rightLen / 2, color, { tint: 0.04 });
      if (lintel > 0.05) this._solid(b, t, lintel, dw, cx, baseY + dh + lintel / 2, cz + off, color, { tint: 0.04 });
    }
  }

  // Floor slab (walkable top at y) with an optional rectangular hole {x,z,w,d} (stairwell).
  _floor(b, cx, cz, w, d, y, color, hole) {
    const t = 0.4;
    if (!hole) { this._solid(b, w, t, d, cx, y - t / 2, cz, color, { tint: 0.03 }); return; }
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const hx0 = hole.x - hole.w / 2, hx1 = hole.x + hole.w / 2, hz0 = hole.z - hole.d / 2, hz1 = hole.z + hole.d / 2;
    const nS = hz0 - z0; if (nS > 0.05) this._solid(b, w, t, nS, cx, y - t / 2, z0 + nS / 2, color, { tint: 0.03 });
    const sS = z1 - hz1; if (sS > 0.05) this._solid(b, w, t, sS, cx, y - t / 2, z1 - sS / 2, color, { tint: 0.03 });
    const midZ = (hz0 + hz1) / 2, midD = Math.max(0, hz1 - hz0);
    const wW = hx0 - x0; if (wW > 0.05) this._solid(b, wW, t, midD, x0 + wW / 2, y - t / 2, midZ, color, { tint: 0.03 });
    const eW = x1 - hx1; if (eW > 0.05) this._solid(b, eW, t, midD, x1 - eW / 2, y - t / 2, midZ, color, { tint: 0.03 });
  }

  // Multi-story building: perimeter walls (door on ground / balcony opening above on doorSide),
  // per-floor slabs with a stairwell hole, and an interior staircase running up to the roof.
  _building(b, cx, cz, w, d, floors, color, doorSide = 'S', roofColor) {
    const FH = 3.4, run = 0.85, swW = 3.0, steps = 7, RUN = steps * run;
    const ifloor = 0xb39c74;
    for (let L = 0; L < floors; L++) {
      const baseY = L * FH;
      const spec = (side) => (side === doorSide ? (L === 0 ? { width: 2.8, height: 2.7 } : { width: Math.min(w, d) * 0.5, height: 2.2 }) : null);
      this._wall(b, cx, cz - d / 2, w, FH, baseY, 'x', color, spec('N'));
      this._wall(b, cx, cz + d / 2, w, FH, baseY, 'x', color, spec('S'));
      this._wall(b, cx - w / 2, cz, d, FH, baseY, 'z', color, spec('W'));
      this._wall(b, cx + w / 2, cz, d, FH, baseY, 'z', color, spec('E'));
      // switchback stairwell: alternate the corner each floor so flights never stack over each other (no head-bonk).
      const even = (L % 2 === 0);
      const sCx = even ? (cx + w / 2 - swW / 2 - 1.0) : (cx - w / 2 + swW / 2 + 1.0);
      const dz = even ? 1 : -1;
      const sStartZ = even ? (cz - d / 2 + 1.0) : (cz + d / 2 - 1.0);
      const hole = { x: sCx, z: sStartZ + dz * (RUN - run) / 2, w: swW + 0.8, d: RUN };
      this._floor(b, cx, cz, w, d, (L + 1) * FH, (L + 1 === floors) ? (roofColor || color) : ifloor, hole);
      this._stairs(b, sCx, sStartZ, 0, dz, steps, 0xb98a4e, baseY, 0.5, run, swW);
    }
  }

  _build() {
    const H = this.HALF;
    const rng = makeRNG(0xD057);
    const sand = 0xd8c79b, sand2 = 0xcdb887, sand3 = 0xc9b07e, crate = 0xb98a4e, roofC = 0xc2a878;

    // ground
    const g = new THREE.PlaneGeometry(H * 2 + 90, H * 2 + 90); g.rotateX(-Math.PI / 2);
    const gm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xcdb487 }));
    gm.receiveShadow = true; this.scene.add(gm);

    // ground detail tiles
    const tb = new MeshBuilder();
    for (let i = 0; i < 170; i++) {
      const x = randRange(-H, H, rng), z = randRange(-H, H, rng), s = randRange(2, 6, rng);
      tb.box(s, 0.05, s, x, 0.03, z, shade(0xc2a878, randRange(-0.08, 0.05, rng)), { ry: randRange(0, TAU, rng) });
    }
    const tiles = new THREE.Mesh(tb.build(), voxelMaterial()); tiles.receiveShadow = true; this.scene.add(tiles);

    const wb = new MeshBuilder();   // sandstone structures
    const cb = new MeshBuilder();   // crates

    // perimeter walls
    const WH = 9;
    this._solid(wb, H * 2 + 4, WH, 2, 0, WH / 2, -H - 1, sand, { tint: 0.04 });
    this._solid(wb, H * 2 + 4, WH, 2, 0, WH / 2, H + 1, sand, { tint: 0.04 });
    this._solid(wb, 2, WH, H * 2 + 4, -H - 1, WH / 2, 0, sand, { tint: 0.04 });
    this._solid(wb, 2, WH, H * 2 + 4, H + 1, WH / 2, 0, sand, { tint: 0.04 });

    // === multi-story buildings (walkable interiors + stairs to the roof) ===
    this._building(wb, -34, -36, 16, 14, 2, sand2, 'S', roofC);  // HQ         (NW, 2 floors)
    this._building(wb,  36, -38, 12, 12, 3, sand,  'W', roofC);  // Watchtower (NE, 3 floors)
    this._building(wb,  42,  30, 18, 16, 2, sand2, 'W', roofC);  // Warehouse  (SE, 2 floors)
    this._building(wb, -40,  32, 14, 12, 2, sand,  'N', roofC);  // Barracks   (SW, 2 floors)
    this._building(wb,   0,  46, 18,  8, 1, sand3, 'N', roofC);  // Bunker     (S, roof)

    // === central plaza monument (cover) ===
    this._solid(wb, 7, 1.2, 7, 0, 0.6, 0, sand3, { tint: 0.04 });
    this._solid(wb, 2.4, 3.0, 2.4, 0, 1.5, 0, sand2, { tint: 0.04 });

    // === connecting low walls -> alleys & chokepoints ===
    this._wall(wb, -16, -12, 22, 3.2, 0, 'x', sand,  { width: 3.2 });
    this._wall(wb,  16,  14, 22, 3.2, 0, 'x', sand,  { width: 3.2 });
    this._wall(wb, -12,  -2, 18, 3.2, 0, 'z', sand2, { width: 3.2 });
    this._wall(wb,  14,   0, 18, 3.2, 0, 'z', sand2, { width: 3.2 });

    // === crate cover clusters ===
    const crateSpots = [
      [-14, -18, 3], [16, -14, 3], [-18, 16, 3], [18, 20, 3], [0, -24, 2], [0, 26, 2],
      [-26, 4, 2], [28, 2, 2], [-54, -8, 2], [54, -4, 2], [-10, 40, 2], [12, -46, 2],
      [-50, -52, 3], [50, 50, 3], [-54, 52, 2], [54, -54, 2], [-2, 58, 2], [58, 6, 2],
    ];
    for (const [cx, cz, n] of crateSpots) {
      for (let i = 0; i < n; i++) {
        const s = randRange(1.7, 2.5, rng);
        const x = cx + randRange(-3, 3, rng), z = cz + randRange(-3, 3, rng);
        this._solid(cb, s, s, s, x, s / 2, z, crate, { tint: 0.08, ry: randRange(-0.3, 0.3, rng) });
        if (chc(0.3)) this._solid(cb, s * 0.8, s * 0.8, s * 0.8, x, s + s * 0.4, z, shade(crate, 0.05), { tint: 0.08, ry: randRange(-0.4, 0.4, rng) });
      }
    }

    this.scene.add(this._mesh(wb)); this.scene.add(this._mesh(cb));

    // outer spawn ring
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      this.spawns.push(new THREE.Vector3(Math.cos(a) * (H - 5), 0, Math.sin(a) * (H - 5)));
    }
    // supply-drop landing spots (open ground near landmarks)
    this.lootSpots = [
      new THREE.Vector3(0, 0, 16), new THREE.Vector3(-34, 0, -22), new THREE.Vector3(26, 0, -38),
      new THREE.Vector3(30, 0, 30), new THREE.Vector3(-40, 0, 24), new THREE.Vector3(0, 0, -34),
    ];
  }

  // Open-world steppe: flat 1000×1000 ground with an impassable voxel mountain border;
  // 5 districts spread across it + roadside POIs + a SpatialGrid over all colliders.
  _buildSteppe() {
    this.HALF = 500;
    const H = this.HALF;
    const rng = makeRNG(0x57E9);
    this.scene.fog.near = 120; this.scene.fog.far = 900; // open horizon

    // ground
    const g = new THREE.PlaneGeometry(H * 2 + 120, H * 2 + 120); g.rotateX(-Math.PI / 2);
    const gm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8a9152 })); // dry steppe
    gm.receiveShadow = true; this.scene.add(gm);

    // sparse ground detail
    const tb = new MeshBuilder();
    for (let i = 0; i < 880; i++) {
      const x = randRange(-H, H, rng), z = randRange(-H, H, rng), s = randRange(4, 12, rng);
      tb.box(s, 0.05, s, x, 0.03, z, shade(0x7c8a4e, randRange(-0.1, 0.06, rng)), { ry: randRange(0, TAU, rng) });
    }
    const tiles = new THREE.Mesh(tb.build(), voxelMaterial()); tiles.receiveShadow = true; this.scene.add(tiles);

    // mountain border (impassable: MH=26 >> step-up 0.62) + boulders, one merged mesh
    const mb = new MeshBuilder();
    const rock = 0x6a6258, rock2 = 0x534c43, MH = 26, t = 8, span = H * 2 + t * 2;
    this._solid(mb, span, MH, t, 0, MH / 2, -H - t / 2, rock, { tint: 0.06 });
    this._solid(mb, span, MH, t, 0, MH / 2,  H + t / 2, rock, { tint: 0.06 });
    this._solid(mb, t, MH, span, -H - t / 2, MH / 2, 0, rock, { tint: 0.06 });
    this._solid(mb, t, MH, span,  H + t / 2, MH / 2, 0, rock, { tint: 0.06 });
    for (let i = 0; i < 128; i++) { // jagged peaks (visual only — sit atop the impassable base)
      const edge = i % 4, f = randRange(-H, H, rng), peakH = randRange(8, 24, rng), pw = randRange(10, 28, rng);
      const x = edge < 2 ? f : (edge === 2 ? -H - t / 2 : H + t / 2);
      const z = edge < 2 ? (edge === 0 ? -H - t / 2 : H + t / 2) : f;
      mb.box(pw, peakH, pw, x, MH + peakH / 2 - 5, z, shade(rock2, randRange(-0.05, 0.05, rng)), { ry: randRange(0, TAU, rng), tint: 0.08 });
    }
    for (let i = 0; i < 96; i++) { // boulders on open ground (cover + collision sanity)
      const x = randRange(-H + 30, H - 30, rng), z = randRange(-H + 30, H - 30, rng);
      if (Math.hypot(x, z) < 25) continue; // keep the centre start clear
      if ((x > -84 && x < 84 && z > -104 && z < 12) || Math.hypot(x - 96, z - 18) < 22) continue; // keep the kombinát yard + slag heap clear
      if (Math.hypot(x + 330, z + 300) < 56) continue; // keep the field strongpoint (far SW) clear
      if (x > -232 && x < 112 && z > 248 && z < 500) continue; // keep the airfield (far N, pulled 40 m S) + its N SAM site clear
      if (x > 254 && x < 346 && z > -334 && z < -246) continue; // keep the kolkhoz (far SE) yard clear
      if (x > 340 && x < 380 && z > 127 && z < 173) continue; // keep the secret bunker (far E) berm clear
      // keep the dirt-road corridors clear (spine + south road + 3 spurs — see openworld.js)
      if ((Math.abs(x - 150) < 6 && z > -445 && z < 218) || (Math.abs(z + 300) < 6 && x > -290 && x < 261) ||
          (Math.abs(z - 210) < 6 && x > 8 && x < 162) || (Math.abs(z - 150) < 6 && x > 140 && x < 344) ||
          (Math.abs(z + 40) < 6 && x > 82 && x < 158)) continue;
      // keep the roadside POIs clear (АЗС, bus stop, КПП, convoy wreck, well — see openworld.js)
      if (Math.hypot(x - 170, z - 96) < 14 || Math.hypot(x - 159, z + 188) < 6 || Math.hypot(x - 150, z + 388) < 9 ||
          Math.hypot(x + 95, z + 296) < 17 || Math.hypot(x - 206, z + 212) < 9) continue;
      const s = randRange(2.5, 5.5, rng);
      this._solid(mb, s, s, s, x, s / 2, z, shade(0x6f6a5e, randRange(-0.08, 0.06, rng)), { ry: randRange(0, TAU, rng), tint: 0.07 });
    }
    const rocks = new THREE.Mesh(mb.build(), voxelMaterial()); rocks.castShadow = true; rocks.receiveShadow = true; this.scene.add(rocks);

    // scaled spawn ring + open loot spots
    for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU; this.spawns.push(new THREE.Vector3(Math.cos(a) * (H - 12), 0, Math.sin(a) * (H - 12))); }
    this.lootSpots = [ new THREE.Vector3(0, 0, 40), new THREE.Vector3(90, 0, -40), new THREE.Vector3(-90, 0, -40), new THREE.Vector3(40, 0, 70), new THREE.Vector3(-50, 0, 30) ]; // open ground, clear of the kombinát yard
    // 1000×1000: districts SPREAD to the quadrants, kombinát central (hub by spawn)
    buildIndustrial(this, 0, 0); // kombinát — centre (industrial.js)
    buildStrongpoint(this, -330, -300); // WW2 field strongpoint home base — far SW (strongpoint.js)
    buildAirfield(this, 0, 210); // Soviet military airfield — far N (airfield.js); pulled 40 m S so the SAM-site missiles clear the N mountain wall
    buildKolkhoz(this, 300, -300); // kolkhoz «Красный степной» + Su-24 wreck — far SE (kolkhoz.js)
    buildSecretBunker(this, 360, 150); // «Объект 1180» secret bunker — far E/NE (bunker.js)
    this.lootSpots.push(new THREE.Vector3(318, 0, -310), new THREE.Vector3(300, 0, -284)); // farm yard + by the wreck (moved with the kolkhoz)
    buildOpenWorld(this); // dirt roads + ЛЭП poles + roadside POIs linking the districts (openworld.js)
  }

  _mesh(builder) {
    if (builder.vertexCount === 0) return new THREE.Group();
    const m = new THREE.Mesh(builder.build(), voxelMaterial());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  // ─── ?map=demo TEMP STUB (Phase 4) ──────────────────────────────────────────
  // Minimal hook-up so the player can actually stand on / walk the demo hills.
  // Phase 9 will flesh this into the full demo (forest + destructible building +
  // enemy spawns). Here we ONLY build terrain + its ground mesh + spawn points so
  // T2 walkable slopes can be verified. NOT a finished map.
  // ?map=forest — a clean wooded battleground on its OWN hilly terrain. Terrain mesh + a spawn ring +
  // loot + a little hard cover; NO dev nav-test fixtures (those belong to the demo testbed). The forest
  // kit (forest.js) and the destructible building (demobuilding.js) auto-attach on hasTerrain, and waves
  // run on every map — so this is a full playable map. The green fog + day/night palette live in DayNight
  // (it rewrites fog every frame); the ambient pollen/fireflies are game.forestAtmos.
  _buildForest() {
    this.HALF = 158;
    this.chunks = new TerrainChunks(this.terrain, {
      extent: this.HALF, chunkSize: 64, resolutions: [32, 16, 8],
      scene: this.scene, simWorker: this.game.simWorker,
    });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, x = Math.cos(a) * 26, z = Math.sin(a) * 26;
      this.spawns.push(new THREE.Vector3(x, this.terrain.terrainHeightAt(x, z), z));
    }
    this.lootSpots.push(
      new THREE.Vector3(0, this.terrain.terrainHeightAt(0, 0), 0),
      new THREE.Vector3(-54, this.terrain.terrainHeightAt(-54, 46), 46),   // atop the overlook
    );
    // a little seated hard cover for firefights (self-grounding on the hills) — no nav-test clutter
    seatProp(this, 12, -14, buildSandbags, { w: 2.2, d: 0.8, h: 1.0, yaw: 0.6 });
    seatProp(this, -14, 11, () => buildBarricade(), { w: 2.4, d: 1.2, h: 1.4, yaw: -0.4 });
    seatProp(this, 22, 16, buildSandbags, { w: 2.2, d: 0.8, h: 1.0, yaw: 1.3 });
  }

  _buildDemo() {
    this.scene.fog.near = 70; this.scene.fog.far = 460;
    this.HALF = 158;                                   // keep the player inside the 158 m chunk terrain
    this.chunks = new TerrainChunks(this.terrain, {
      extent: this.HALF, chunkSize: 64,
      resolutions: [32, 16, 8],   // near LOD 32 = unchanged demo detail; 16/8 kick in by distance
      scene: this.scene,
      simWorker: this.game.simWorker, // off-thread chunk build (falls back to sync if absent)
    });
    // spawn ring + a couple of loot spots, all sampled onto the terrain surface.
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU, x = Math.cos(a) * 28, z = Math.sin(a) * 28;
      this.spawns.push(new THREE.Vector3(x, this.terrain.terrainHeightAt(x, z), z));
    }
    this.lootSpots.push(
      new THREE.Vector3(0, this.terrain.terrainHeightAt(0, 0), 0),
      new THREE.Vector3(60, this.terrain.terrainHeightAt(60, -40), -40), // atop the big hill
    );

    // Phase 2 — a few test structures seated on the terrain (proves colliders + props sit on hills).
    seatProp(this, 0, -18, buildSandbags, { w: 2.2, d: 0.8, h: 1.0 });
    seatProp(this, 18, 10, () => buildBarricade(), { w: 2.4, d: 1.2, h: 1.4, yaw: 0.4 });
    seatProp(this, -16, 12, buildSandbags, { w: 2.2, d: 0.8, h: 1.0, yaw: 1.2 });
    seatProp(this, 46, -31, () => buildBarricade(), { w: 2.4, d: 1.2, h: 1.4, yaw: -0.5 }); // on the big-hill flank (a slope)
    seatProp(this, -10, -24, () => buildFieldRadio(), { w: 1.2, d: 0.7, h: 1.0 });

    // HORDE-NAV TEST FIXTURE — a 10 m concrete enclosure with ONE doorway, on flat-ish
    // ground ~25 m from spawn. The horde must route AROUND three solid walls and FUNNEL
    // through the doorway to reach a player standing inside (proves flow-field nav). Each
    // wall is its own self-grounding seatProp (mesh + matching AABB collider). The doorway
    // is on the +X (east) wall, facing the arena centre. NB: a literal ~2 m gap rasterizes
    // CLOSED under the horde grid (cell 1.5, inflate 0.7) — widened to ~3.4 m so a free
    // doorway cell survives; physical clearance is still ~2 m.
    {
      const ECX = -24, ECZ = 6, S = 5, WT = 0.6, WH = 3.0, DOOR = 3.4;
      const seg = (2 * S + WT - DOOR) / 2;                          // each E-wall segment length
      const wall = (w, d, h) => () => { const b = new MeshBuilder(); b.box(w, h, d, 0, h / 2, 0, 0x6f6f69, { tint: 0.04 }); return new THREE.Mesh(b.build(), voxelMaterial()); };
      seatProp(this, ECX,     ECZ - S, wall(2 * S + WT, WT, WH), { w: 2 * S + WT, d: WT, h: WH }); // N wall (solid)
      seatProp(this, ECX,     ECZ + S, wall(2 * S + WT, WT, WH), { w: 2 * S + WT, d: WT, h: WH }); // S wall (solid)
      seatProp(this, ECX - S, ECZ,     wall(WT, 2 * S + WT, WH), { w: WT, d: 2 * S + WT, h: WH }); // W wall (solid, far side)
      const off = DOOR / 2 + seg / 2;                               // E-wall segment centre offset from ECZ
      seatProp(this, ECX + S, ECZ - off, wall(WT, seg, WH), { w: WT, d: seg, h: WH });            // E wall — north of doorway
      seatProp(this, ECX + S, ECZ + off, wall(WT, seg, WH), { w: WT, d: seg, h: WH });            // E wall — south of doorway
    }
  }

  collide(pos, vel, r, h, dt) {
    // Single collision path. Flat maps carry a 'flat' terrain (height 0); _collideTerrain's only
    // terrain-specific extra — the ground-follow re-seat — is gated on hasTerrain (Edit 4), so on
    // flat maps this is byte-identical to the old y=0 floor.
    return this._collideTerrain(pos, vel, r, h, dt);
  }

  // Terrain-aware collide (only when hasTerrain). Walkable ground height under the
  // player = terrainHeightAt(px,pz) instead of the hard 0. Man-made AABB boxes keep
  // the existing step-up; the smooth ground is resolved separately. Steep uphill
  // terrain (slope > terrain.slopeLimit) blocks horizontal movement INTO the face.
  _collideTerrain(pos, vel, r, h, dt) {
    let onGround = false;
    const terr = this.terrain;
    const slopeLimit = (terr.slopeLimit != null) ? terr.slopeLimit : (Math.PI * 35) / 180;

    // VERTICAL — gravity, terrain floor under the player, then man-made box tops/bottoms.
    pos.y += vel.y * dt;
    let gy = terr.terrainHeightAt(pos.x, pos.z);
    if (pos.y <= gy) { pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true; }
    for (const b of this.grid.queryAABB(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {
      if (b.foliage) continue;                                   // foliage (soft cover) never blocks movement — only slows (foliageSlowAt)
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      const feet = pos.y, head = pos.y + h;
      if (head <= b.min.y || feet >= b.max.y) continue;
      const penTop = b.max.y - feet, penBot = head - b.min.y;
      if (penTop < penBot && vel.y <= 0.01) { pos.y = b.max.y; vel.y = 0; onGround = true; }
      else if (vel.y > 0) { pos.y = b.min.y - h; vel.y = 0; }
    }

    // HORIZONTAL — per axis: existing box collision/step-up, then a slope-limit gate
    // that reverts a step taken INTO an uphill face steeper than the limit (cliffs act
    // as walls; gentle slopes walk; walking along/down a steep face stays allowed).
    this._moveAxisTerrain(pos, vel, r, h, 'x', vel.x * dt, slopeLimit);
    this._moveAxisTerrain(pos, vel, r, h, 'z', vel.z * dt, slopeLimit);
    const lim = this.HALF - r;
    pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);

    // GROUND-FOLLOW — after moving, re-seat the feet on the (now possibly different)
    // terrain height so ascents/descents are smooth and never fall-through.
    gy = terr.terrainHeightAt(pos.x, pos.z);
    // Gated on hasTerrain: on FLAT maps this down-snap would clip the player off man-made ledges
    // ≤ TERRAIN_GROUND_FOLLOW_STEP (0.6 m), so flat maps keep the old "stay on the box top" behavior.
    if (this.hasTerrain) {
      if (pos.y < gy) {                                     // walked into rising ground → push up
        pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true;
      } else if (onGround && pos.y - gy <= TERRAIN_GROUND_FOLLOW_STEP) { // descend smoothly within a step
        pos.y = gy; if (vel.y < 0) vel.y = 0; onGround = true;
      }
    }
    return onGround;
  }

  // Box collision + step-up for one axis (delegates to _moveAxis), then enforce the
  // terrain slope-limit: if the move climbed into terrain steeper than the limit,
  // revert just this axis so the player slides off the cliff instead of scaling it.
  _moveAxisTerrain(pos, vel, r, h, ax, delta, slopeLimit) {
    const before = pos[ax];
    const gBefore = this.terrain.terrainHeightAt(pos.x, pos.z);
    this._moveAxis(pos, vel, r, h, ax, delta);
    const gAfter = this.terrain.terrainHeightAt(pos.x, pos.z);
    if (gAfter > gBefore + TERRAIN_UPHILL_EPS && this.terrain.terrainSlopeAt(pos.x, pos.z) > slopeLimit) {
      pos[ax] = before; vel[ax] = 0;
    }
  }

  // Is the player's body column free of boxes if its feet were at feetY here?
  _headClear(pos, r, h, feetY, ignore) {
    for (const b of this.grid.queryAABB(pos.x - r, pos.z - r, pos.x + r, pos.z + r)) {
      if (b === ignore || b.foliage) continue;                   // foliage never blocks headroom
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      if (feetY + h <= b.min.y || feetY >= b.max.y) continue;
      return false;
    }
    return true;
  }

  _moveAxis(pos, vel, r, h, ax, delta) {
    pos[ax] += delta;
    // Candidates over the SWEPT range (old→new pos): snapshot a fixed array, since the loop mutates pos
    // (blocking/step-up) and a live query would shift under us. Padded by r; matches the old whole-list scan.
    const oldA = pos[ax] - delta, lo = Math.min(pos[ax], oldA) - r, hi = Math.max(pos[ax], oldA) + r;
    const cands = ax === 'x' ? this.grid.queryAABB(lo, pos.z - r, hi, pos.z + r) : this.grid.queryAABB(pos.x - r, lo, pos.x + r, hi);
    for (const b of cands) {
      if (b.foliage) continue;                                   // foliage (soft cover) never blocks movement — only slows
      const feet = pos.y, head = pos.y + h;
      if (head <= b.min.y + 0.02 || feet >= b.max.y - 0.02) continue;
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      // step-up: climb low ledges/stairs instead of blocking
      const step = b.max.y - pos.y;
      if (step > 0.02 && step <= STEP_UP && this._headClear(pos, r, h, b.max.y + 0.002, b)) { pos.y = b.max.y + 0.002; continue; }
      if (ax === 'x') { if (vel.x > 0) pos.x = b.min.x - r; else if (vel.x < 0) pos.x = b.max.x + r; else pos.x = pos.x < (b.min.x + b.max.x) / 2 ? b.min.x - r : b.max.x + r; vel.x = 0; }
      else { if (vel.z > 0) pos.z = b.min.z - r; else if (vel.z < 0) pos.z = b.max.z + r; else pos.z = pos.z < (b.min.z + b.max.z) / 2 ? b.min.z - r : b.max.z + r; vel.z = 0; }
    }
  }

  // Ground height under (x,z): the terrain surface on the heightfield demo slice, else the
  // hard-zero floor on flat maps. The single gate that keeps every projectile/flare/felled-tree
  // ground test terrain-aware on ?map=demo while leaving arena/steppe byte-identical (groundY≡0).
  groundY(x, z) { return this.terrain.terrainHeightAt(x, z); }

  // Soft-cover slow: the horizontal-speed multiplier for a body pushing through ground-level foliage
  // (bush / sapling / fallen crown — `thicket` boxes). 1 otherwise. A tall tree's overhead canopy is
  // `foliage` but NOT `thicket`, so you're never slowed walking under a standing tree. Called by
  // player.js + enemies.js every frame.
  foliageSlowAt(x, z, feetY, headY) {
    return inThicket(this.grid.queryAABB(x - 0.05, z - 0.05, x + 0.05, z + 0.05), x, z, feetY, headY) ? FOLIAGE_SLOW : 1;
  }

  // The ladder zone (скоб-трап) containing a body at (x,z) whose feet are fy / head fy+h, else null.
  // Mirrors player._onLadder but returns the zone (enemies clamp their climb to zone.top). Zones are
  // registered by skobTrap() (bunker); maps without ladders leave _ladders undefined → null.
  ladderZoneAt(x, z, fy, h) {
    const zones = this._ladders;
    if (!zones || !zones.length) return null;
    const hy = fy + h;
    for (const a of zones) {
      if (x < a.minX || x > a.maxX || z < a.minZ || z > a.maxZ) continue;
      if (hy < a.bottom || fy > a.top) continue;
      return a;
    }
    return null;
  }

  // Register a static decorative mesh for draw-distance culling (Game._cullByDistance). Precomputes the
  // mesh's world-space XZ centre ONCE: merged district meshes bake geometry in WORLD coords with
  // position (0,0,0), so mesh.position is the origin, not the centre — we use the bounding-sphere centre.
  // Groups without a single geometry fall back to mesh.position. Call AFTER the mesh is positioned/added.
  // Only register COMPACT meshes (a single POI/district cluster); never spanning geometry (roads, ground,
  // perimeter) — a centre-distance test would wrongly hide parts still near the player.
  addCullable(mesh) {
    if (!mesh) return mesh;
    mesh.updateMatrixWorld(true);
    let cx = mesh.position.x, cz = mesh.position.z;
    if (mesh.geometry) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const c = mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld);
      cx = c.x; cz = c.z;
    }
    mesh.userData._cullX = cx; mesh.userData._cullZ = cz;
    this.cullProps.push(mesh);
    return mesh;
  }

  rayHit(origin, dir, maxDist, ignore = null) {
    const ignored = Array.isArray(ignore) ? ignore : null;
    const filter = typeof ignore === 'function' ? ignore                       // predicate form: keep a box when it returns true (e.g. b => !b.foliage)
      : (ignore != null) ? (b => !(b === ignore || (ignored && ignored.includes(b)))) : null;
    const gh = this.grid.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist, filter, this._refine);
    let best = gh ? gh.t : maxDist, hitBox = gh ? gh.box : null;
    if (this.hasTerrain) {
      const tg = this._rayTerrain(origin, dir, best); // march vs the heightfield (feet placement / decals / aim-down)
      if (tg != null && tg > 0 && tg < best) { best = tg; hitBox = 'ground'; }
    } else if (dir.y < -1e-6) { const tg = -origin.y / dir.y; if (tg > 0 && tg < best) { best = tg; hitBox = 'ground'; } }
    if (best >= maxDist) return null;
    const point = new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best);
    const normal = new THREE.Vector3(0, 1, 0);
    if (hitBox === 'ground' && this.hasTerrain) {       // real terrain surface normal at the hit
      const n = this.terrain.terrainNormalAt(point.x, point.z); normal.set(n.x, n.y, n.z);
    }
    if (hitBox && hitBox !== 'ground') {
      if (hitBox.cap && refineBoxHit(hitBox, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best, this._exN) != null) {
        normal.set(this._exN.nx, this._exN.ny, this._exN.nz);              // exact capsule surface normal
      } else {
        const ex = Math.min(Math.abs(point.x - hitBox.min.x), Math.abs(point.x - hitBox.max.x));
        const ey = Math.min(Math.abs(point.y - hitBox.min.y), Math.abs(point.y - hitBox.max.y));
        const ez = Math.min(Math.abs(point.z - hitBox.min.z), Math.abs(point.z - hitBox.max.z));
        if (ex <= ey && ex <= ez) normal.set(point.x < (hitBox.min.x + hitBox.max.x) / 2 ? -1 : 1, 0, 0);
        else if (ey <= ez) normal.set(0, point.y < (hitBox.min.y + hitBox.max.y) / 2 ? -1 : 1, 0);
        else normal.set(0, 0, point.z < (hitBox.min.z + hitBox.max.z) / 2 ? -1 : 1);
      }
    }
    return { dist: best, point, normal, box: (hitBox && hitBox !== 'ground') ? hitBox : null };
  }

  // Ray vs heightfield (terrain maps only). Marches in fixed steps until the ray dips
  // below the terrain, then bisects for a tight hit `t`. Approximate but stable — used
  // for foot placement / decals / aim-down, not authoritative damage. Returns t or null.
  _rayTerrain(o, d, maxT) {
    const terr = this.terrain;
    if ((o.y - terr.terrainHeightAt(o.x, o.z)) < 0) return 0; // origin already underground
    const lim = Math.min(maxT, 300), step = 0.5;
    if (!(lim > 0)) return null; // guard: a NaN/≤0 maxT would never satisfy `t >= lim` → the unconditional loop below would hang
    let tPrev = 0;
    // March in `step`-sized samples but ALWAYS sample the endpoint `lim` (clamp each step to it). The old
    // `for (t = step; t <= lim; …)` skipped everything when lim < step — so a short ray (e.g. a thrown
    // molotov's `stepLen + radius` ≈ 0.47 m at 60 fps, < step) never tested the surface and tunnelled
    // straight through hills. Clamping the march to `lim` closes both that gap and the final partial step.
    for (let t = Math.min(step, lim); ; t = Math.min(t + step, lim)) {
      const above = (o.y + d.y * t) - terr.terrainHeightAt(o.x + d.x * t, o.z + d.z * t);
      if (above <= 0) {
        let lo = tPrev, hi = t;
        for (let i = 0; i < 8; i++) {
          const m = (lo + hi) / 2;
          const am = (o.y + d.y * m) - terr.terrainHeightAt(o.x + d.x * m, o.z + d.z * m);
          if (am <= 0) hi = m; else lo = m;
        }
        return hi;
      }
      if (t >= lim) break;
      tPrev = t;
    }
    return null;
  }

  addWreckObstacle(pos, yaw) {
    const hw = 2.0, hl = 3.6, h = 1.6;
    const _wreckBox = { min: new THREE.Vector3(pos.x - hw, 0, pos.z - hl), max: new THREE.Vector3(pos.x + hw, h, pos.z + hl), wreck: true }; this.boxes.push(_wreckBox); this.grid.addBox(_wreckBox);
  }
  clearWrecks() { this.boxes = this.boxes.filter(b => !b.wreck); this.grid.build(this.boxes); }
}

// ---------------------------------------------------------------------------
// BuildManager — fortification placement: ghost preview, validity, collision,
// destruction, the barbed-wire hazard zone, and host-authoritative MP sync.
// ---------------------------------------------------------------------------
export class BuildManager {
  constructor(game) {
    this.game = game;
    this.scene = game.engine.scene;
    this.structures = [];
    this._idc = 1;
    this.ghostYaw = 0;
    this._valid = false;
    this._ghostPos = null;
    this.radioTarget = null;
    this._ghostKind = 'sandbag';
    this._tmpO = new THREE.Vector3();
    this._tmpF = new THREE.Vector3();
    const sg = buildSandbags(), wg = buildBarbedWire(), dg = buildBarricade();
    this._geos = { sandbag: sg.geometry, wire: wg.geometry, wood: dg.geometry };
    sg.material.dispose(); wg.material.dispose(); dg.material.dispose();
    this._geos.radio = new THREE.BoxGeometry(STRUCT_DEFS.radio.w, STRUCT_DEFS.radio.h, STRUCT_DEFS.radio.d).translate(0, STRUCT_DEFS.radio.h / 2, 0);
    this._geos.r105 = new THREE.BoxGeometry(STRUCT_DEFS.r105.w, STRUCT_DEFS.r105.h, STRUCT_DEFS.r105.d).translate(0, STRUCT_DEFS.r105.h / 2, 0); // placement ghost for the voice radio
    this.ghostMat = new THREE.MeshLambertMaterial({ color: 0x35d05a, emissive: 0x0a3a14, transparent: true, opacity: 0.5, depthWrite: false });
    this.ghost = new THREE.Mesh(this._geos.sandbag, this.ghostMat);
    this.ghost.visible = false; this.ghost.renderOrder = 5; this.ghost.frustumCulled = false;
    this.scene.add(this.ghost);
  }

  _curKind() { return this.game.inventory.heldMaterial(); } // material held in the backpack → its build kind (else null)
  rotateGhost(dir) { const k = this._curKind(); if (k) this.ghostYaw += dir * (STRUCT_DEFS[k].rotStep || Math.PI / 12); }

  // AABB half-extents of the footprint after yaw rotation
  _footprint(kind, yaw) {
    const sd = STRUCT_DEFS[kind], c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    return { hx: (sd.w / 2) * c + (sd.d / 2) * s, hz: (sd.w / 2) * s + (sd.d / 2) * c, h: sd.h };
  }

  validateAt(pos, yaw, kind) { // host-authoritative: geometry/cap/overlap only (holding the material is a LOCAL check in place()/the ghost)
    if (this.structures.length >= STRUCT_CAP) return false;
    if (STRUCT_DEFS[kind] && STRUCT_DEFS[kind].max && this.structures.filter((s) => s.kind === kind).length >= STRUCT_DEFS[kind].max) return false; // per-kind cap, host-authoritative (e.g. radio max 4)
    if (!pos) return false;
    const sd = STRUCT_DEFS[kind], fp = this._footprint(kind, yaw), top = pos.y + sd.h;
    for (const bx of this.game.world.boxes) {                            // map + placed hard structures
      if (bx.foliage) continue;                                          // foliage is shoot-through → never blocks a build
      if (pos.x + fp.hx <= bx.min.x || pos.x - fp.hx >= bx.max.x) continue;
      if (pos.z + fp.hz <= bx.min.z || pos.z - fp.hz >= bx.max.z) continue;
      if (bx.max.y <= pos.y + 0.05 || bx.min.y >= top - 0.05) continue;  // no vertical overlap (e.g. placing ON a surface)
      return false;
    }
    for (const s of this.structures) {                                  // other structures (incl. wire, not in world.boxes)
      const d2 = this._footprint(s.kind, s.yaw);
      if (Math.abs(pos.x - s.pos.x) < fp.hx + d2.hx && Math.abs(pos.z - s.pos.z) < fp.hz + d2.hz) return false;
    }
    for (const e of this.game.enemies.active) {                         // don't trap/telefrag a zombie
      if (e.alive && Math.abs(pos.x - e.pos.x) < fp.hx + e.radius && Math.abs(pos.z - e.pos.z) < fp.hz + e.radius) return false;
    }
    const pp = this.game.player.pos, pr = this.game.player.radius;
    if (Math.abs(pos.x - pp.x) < fp.hx + pr && Math.abs(pos.z - pp.z) < fp.hz + pr) return false;
    return true;
  }

  update(dt) {
    this._updateRadios(dt);
    const onFoot = this.game.state === 'playing' && !this.game.player.mountedGun && !(this.game.mp && this.game.mp.frozen);
    const kind = onFoot ? this._curKind() : null;
    if (!kind) { this.ghost.visible = false; return; }
    if (kind !== this._ghostKind) { this.ghost.geometry = this._geos[kind]; this._ghostKind = kind; }
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const origin = this._tmpO.setFromMatrixPosition(cam.matrixWorld);
    const fwd = this._tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    const hit = this.game.world.rayHit(origin, fwd, 5.5);
    const pos = (hit && hit.point && hit.dist <= 5.0 && hit.normal.y > 0.6) ? hit.point : null;
    this._ghostPos = pos;
    this._valid = pos ? this.validateAt(pos, this.ghostYaw, kind) : false;
    if (!pos) { this.ghost.visible = false; return; }
    this.ghost.visible = true;
    this.ghost.position.set(pos.x, pos.y, pos.z);
    this.ghost.rotation.y = this.ghostYaw;
    this.ghostMat.color.setHex(this._valid ? 0x35d05a : 0xd03a2a);
    this.ghostMat.emissive.setHex(this._valid ? 0x0a3a14 : 0x3a0a08);
  }

  place() {
    const kind = this._curKind(); if (!kind) return;
    const _cap = STRUCT_DEFS[kind].max;
    if (_cap && this.structures.filter((s) => s.kind === kind).length >= _cap) { this.game.hud.toast(`Max ${_cap} ${STRUCT_DEFS[kind].label}`, 0xd23a2a); return; }
    if (!this._valid || !this._ghostPos) { this.game.audio.noMoney && this.game.audio.noMoney(); return; }
    const pos = this._ghostPos.clone(), yaw = this.ghostYaw, mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) {
      mp.net.send('structreq', { kind, x: pos.x, z: pos.z, yaw });    // client → host (host validates + echoes)
      this.game.inventory.consumeHeldMaterial();                       // optimistic consume; restored on 'structrej'
    } else {
      const id = this._idc++;
      this.placeStructure(kind, pos, yaw, id);
      if (mp && mp.active && mp.isHost) mp.net.broadcast('struct', { id, kind, x: pos.x, z: pos.z, yaw });
      this.game.inventory.consumeHeldMaterial();
    }
    this.game.audio.buy && this.game.audio.buy();
  }

  placeStructure(kind, pos, yaw, id) {
    const sd = STRUCT_DEFS[kind];
    const mesh = kind === 'r105' ? buildR105Mesh() : (sd.prop ? buildFieldRadio() : new THREE.Mesh(this._geos[kind], voxelMaterial()));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(pos.x, pos.y || 0, pos.z); mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const s = { id, kind, pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z), yaw, mesh, hp: sd.hp, maxHp: sd.hp, box: null, hazard: null,
                on: false, station: 0, audio: null }; // on/station/audio used only by radio props
    const fp = this._footprint(kind, yaw);
    const aabb = (extraTag) => Object.assign({ min: new THREE.Vector3(pos.x - fp.hx, 0, pos.z - fp.hz), max: new THREE.Vector3(pos.x + fp.hx, (pos.y || 0) + sd.h, pos.z + fp.hz) }, extraTag);
    if (sd.hard) { s.box = aabb({ struct: true, _ref: s }); this.game.world.boxes.push(s.box); this.game.world.grid.addBox(s.box); }
    else if (!sd.prop) { s.hazard = aabb({ ref: s }); } // props are NOT hazards; enemies ignore them
    this.structures.push(s);
    return s;
  }

  _radioStart(s) { // create/resume the <audio> for a radio at its current station
    if (typeof Audio === 'undefined') return;
    if (!s.audio) {
      const el = new Audio(); el.preload = 'none';
      el.addEventListener('error', () => { if (this.game.hud) this.game.hud.toast('📻 Station offline', 0xd23a2a); });
      s.audio = el;
    }
    const st = stationByIndex(s.station); // handles the hidden ghost frequency too
    if (st && s.audio.src !== st.url) s.audio.src = st.url;
    const p = s.audio.play(); if (p && p.catch) p.catch(() => {}); // play() is invoked from a user gesture (E/place)
  }
  _radioStop(s) { if (s.audio) { try { s.audio.pause(); } catch (e) {} } }
  _updateRadios(dt) {
    const a = this.game.audio, pp = this.game.player.pos;
    let nearest = 0; // max attenuation across ON radios → drives the music duck
    for (const s of this.structures) {
      if (s.kind !== 'radio') continue;
      if (s.mesh && s.mesh.userData) animateFieldRadio(s.mesh, s, dt);
      if (!s.on || !s.audio) continue;
      const dist = Math.hypot(pp.x - s.pos.x, pp.z - s.pos.z);
      const att = radioAttenuation(dist);
      s.audio.volume = Math.max(0, Math.min(1, att * (a && a.musicVolume != null ? a.musicVolume : 0.5) * (a && a.muted ? 0 : 1)));
      if (att > nearest) nearest = att;
    }
    if (a && a.setMusicDuck) a.setMusicDuck(1 - nearest * 0.85); // duck the procedural score near a playing radio
  }

  // Raycast the crosshair against radios within reach → this.radioTarget (or null).
  // While an ON radio is targeted, consume ←/→ for tuning so they don't strafe.
  updateRadioTarget() {
    this.radioTarget = null;
    if (this.game.state !== 'playing' || (this.game.mp && this.game.mp.frozen)) return;
    if (this.game.player.mountedGun) return;
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const o = this._tmpO.setFromMatrixPosition(cam.matrixWorld);
    const f = this._tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let best = null, bestD = 4.0;
    for (const s of this.structures) {
      if (s.kind !== 'radio') continue;
      const dx = s.pos.x - o.x, dz = s.pos.z - o.z, along = dx * f.x + dz * f.z;
      if (along <= 0 || along > bestD) continue;                 // behind, or farther than current best
      const px = o.x + f.x * along, pz = o.z + f.z * along;       // closest point on the aim ray (XZ)
      if (Math.hypot(s.pos.x - px, s.pos.z - pz) < 1.1) { best = s; bestD = along; }
    }
    this.radioTarget = best;
    if (best && best.on) {
      const inp = this.game.input;
      if (inp.wasPressed('ArrowRight')) this.cycleRadioStation(best, 1);
      else if (inp.wasPressed('ArrowLeft')) this.cycleRadioStation(best, -1);
      inp.down.delete('ArrowLeft'); inp.down.delete('ArrowRight'); // suppress strafe this frame while tuning
    }
  }
  // Look-target for a deployed R-105Д voice radio → E opens the control panel (radiopanel.js).
  updateR105Target() {
    this.r105Target = null;
    if (this.game.state !== 'playing' || (this.game.mp && this.game.mp.frozen) || this.game._radioPanelOpen) return;
    if (this.game.player.mountedGun) return;
    const cam = this.game.engine.camera; cam.updateMatrixWorld();
    const o = this._tmpO.setFromMatrixPosition(cam.matrixWorld);
    const f = this._tmpF.set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let best = null, bestD = 4.0;
    for (const s of this.structures) {
      if (s.kind !== 'r105') continue;
      const dx = s.pos.x - o.x, dz = s.pos.z - o.z, along = dx * f.x + dz * f.z;
      if (along <= 0 || along > bestD) continue;
      const px = o.x + f.x * along, pz = o.z + f.z * along;
      if (Math.hypot(s.pos.x - px, s.pos.z - pz) < 1.2) { best = s; bestD = along; }
    }
    this.r105Target = best;
  }
  // Pick a deployed R-105Д back into the backpack. (Solo/host for now; co-op client-pickup sync = TODO.)
  pickupR105(s) {
    if (!s) return false;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { this.game.hud && this.game.hud.toast && this.game.hud.toast('Only the host can pick up the radio', 0xd23a2a); return false; }
    const i = this.structures.indexOf(s); if (i < 0) return false;
    this.structures.splice(i, 1);
    if (s.mesh) { this.scene.remove(s.mesh); try { s.mesh.traverse && s.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); } catch (e) {} }
    if (this.r105Target === s) this.r105Target = null;
    this.game.inventory.addItem('r105');
    if (mp && mp.active && mp.isHost) mp.net.broadcast('struct_rm', { id: s.id }); // TODO: client handler to remove remotely
    return true;
  }
  toggleRadio(s) {
    if (!s) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('radioreq', { id: s.id, on: !s.on, station: s.station }); return; }
    this.applyRadioSet({ id: s.id, on: !s.on, station: s.station });               // host / solo
    if (mp && mp.active && mp.isHost) mp.net.broadcast('radioset', { id: s.id, on: s.on, station: s.station });
  }
  cycleRadioStation(s, dir) {
    if (!s) return;
    const n = RADIO_STATIONS.length, mp = this.game.mp;
    let st;
    if (s.station === GHOST_STATION) st = dir > 0 ? 0 : n - 1;   // leaving the ghost → rejoin the normal rotation
    else if (chc(0.10)) st = GHOST_STATION;                       // 🥚 easter egg: the dial occasionally catches the Soviet ghost frequency
    else st = ((s.station + dir) % n + n) % n;
    if (mp && mp.active && !mp.isHost) { mp.net.send('radioreq', { id: s.id, on: true, station: st }); return; }
    this.applyRadioSet({ id: s.id, on: true, station: st });
    if (mp && mp.active && mp.isHost) mp.net.broadcast('radioset', { id: s.id, on: true, station: st });
    const ghost = st === GHOST_STATION;
    if (this.game.hud) this.game.hud.toast((ghost ? '☭ ' : '📻 ') + stationLabel(st), ghost ? 0xd23a2a : 0x6fd0e8);
    if (ghost && this.game.audio && this.game.audio.noise) this.game.audio.noise(0.35, 0.5, 'highpass', 2600, 0.5); // squelch/static as the ghost frequency catches
  }
  // apply authoritative state to a radio (local audio follows). Used by host/solo + remote clients.
  applyRadioSet(d) {
    const s = this.structures.find((x) => x.id === d.id && x.kind === 'radio'); if (!s) return;
    s.on = !!d.on; s.station = d.station | 0;
    if (s.on) this._radioStart(s); else this._radioStop(s); // _radioStart sets src on station change + plays — one call, no double play()
    if (this.game.audio && this.game.audio.uiClick) this.game.audio.uiClick();
  }

  hazardAt(x, z) {
    for (const s of this.structures) {
      const h = s.hazard; if (h && x >= h.min.x && x <= h.max.x && z >= h.min.z && z <= h.max.z) return s;
    }
    return null;
  }

  attackStructure(s, dmg, enemy) {
    if (!s || s.hp <= 0) return;
    if (enemy && enemy.def && (enemy.def.boss || (enemy.def.scale || 1) >= 1.6)) dmg = s.maxHp; // heavies crush
    s.hp -= dmg;
    if (s.mesh && s.mesh.material && s.mesh.material.emissive) { const f = Math.max(0, s.hp / s.maxHp); s.mesh.material.emissive.setRGB((1 - f) * 0.22, 0, 0); } // radio props are Groups (no single .material) — skip the hit-flash tint
    if (s.hp <= 0) this.destroyStructure(s, 'smash');
  }

  // player-caused damage (shooting / melee); host-authoritative in MP (clients ask the host)
  playerDamage(s, dmg) {
    if (!s) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) mp.net.send('structhit', { id: s.id, dmg });
    else this.attackStructure(s, dmg, null);
  }

  _disposeMesh(s) { // free a removed structure's GPU resources
    if (!s.mesh) return;
    this.scene.remove(s.mesh);
    if (STRUCT_DEFS[s.kind] && STRUCT_DEFS[s.kind].prop) { // prop models (radio) own unique geometry/materials/CanvasTexture → deep-dispose
      s.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    } else if (s.mesh.material) { s.mesh.material.dispose(); } // sandbag/wire/wood share this._geos[kind] geometry → dispose only the per-instance material
  }
  destroyStructure(s, cause) {
    const i = this.structures.indexOf(s); if (i < 0) return;
    this.structures.splice(i, 1);
    this._radioStop(s); if (s.audio) { try { s.audio.src = ''; } catch (e) {} s.audio = null; } // radio prop: kill its stream on destroy
    if (s.box) { const j = this.game.world.boxes.indexOf(s.box); if (j >= 0) this.game.world.boxes.splice(j, 1); this.game.world.grid.removeBox(s.box); }
    this._disposeMesh(s);
    const fx = this.game.effects;
    if (fx) { fx.stuffing && fx.stuffing(s.pos, STRUCT_FX_COLOR[s.kind] || 0xcdb887, 12, 4); fx.impact && fx.impact(s.pos, new THREE.Vector3(0, 1, 0), 'dust'); }
    if (this.game.audio && this.game.audio.noise) this.game.audio.noise(0.2, 0.5, 'lowpass', 280, 1);
    const mp = this.game.mp;
    if (mp && mp.active && mp.isHost) mp.net.broadcast('structdie', { id: s.id });
  }

  // ---- multiplayer (host-authoritative) ----
  hostPlaceFromClient(d, from) {
    const pos = new THREE.Vector3(d.x, 0, d.z);
    if (!this.validateAt(pos, d.yaw, d.kind)) { this.game.mp.net.sendTo(from, 'structrej', { kind: d.kind }); return; } // reject → tell client to restore its material
    const id = this._idc++;
    this.placeStructure(d.kind, pos, d.yaw, id);
    this.game.mp.net.broadcast('struct', { id, kind: d.kind, x: d.x, z: d.z, yaw: d.yaw });
  }
  applyRemoteStruct(d) {
    if (this.structures.some((s) => s.id === d.id)) return;
    this.placeStructure(d.kind, new THREE.Vector3(d.x, 0, d.z), d.yaw, d.id);
    if (d.id >= this._idc) this._idc = d.id + 1;
  }
  applyRemoteDestroy(id) { const s = this.structures.find((x) => x.id === id); if (s) this.destroyStructure(s, 'remote'); }

  reset() {
    for (const s of this.structures) {
      if (s.box) { const j = this.game.world.boxes.indexOf(s.box); if (j >= 0) this.game.world.boxes.splice(j, 1); this.game.world.grid.removeBox(s.box); }
      this._disposeMesh(s);
      if (s.audio) { try { s.audio.pause(); s.audio.src = ''; } catch (e) {} } // radio props: stop streams on run reset
    }
    this.structures.length = 0;
    if (this.game.audio && this.game.audio.setMusicDuck) this.game.audio.setMusicDuck(1); // clear any radio music-duck
    this._idc = 1; this.ghostYaw = 0; this._valid = false; this._ghostPos = null;
    this.ghost.visible = false;
  }
}

// Forest map sky/fog palette (ported from the forest-destruct demo). DayNight._apply re-tints over the
// global desert SKYC when mapId === 'forest' (runs last → wins). Day = green-tan mist, night = dark green.
const FOREST_SKY = {
  dFog: new THREE.Color(0x9cb37a), nFog: new THREE.Color(0x141d16),
  dHemiG: new THREE.Color(0x3a4a24), nHemiG: new THREE.Color(0x0e1610),
  sun: new THREE.Color(0xffe6b0),
};

export class DayNight {
  constructor(game) {
    this.game = game; const e = game.engine;
    this.cam = e.camera; this.scene = e.scene;
    this.t = 0; this.active = false; this.nightCount = 0; this.bloodMoon = false; this._wasNight = false;
    this._tmp = new THREE.Vector3();

    this.cel = new THREE.Group(); this.cel.visible = false; this.scene.add(this.cel);
    // sun & moon discs (unlit, fog-free so they read against the dome)
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c0, fog: false }));
    this.sunMesh.frustumCulled = false; this.cel.add(this.sunMesh);
    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(13, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe3ee, fog: false }));
    this.moonMesh.frustumCulled = false; this.cel.add(this.moonMesh);
    // starfield
    const sp = []; for (let i = 0; i < 520; i++) { const u = Math.random() * TAU, v = Math.random() * 0.9 + 0.05; const r = 500; sp.push(Math.cos(u) * Math.sin(v * Math.PI) * r, Math.abs(Math.cos(v * Math.PI)) * r, Math.sin(u) * Math.sin(v * Math.PI) * r); }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false; this.cel.add(this.stars);
    // constellations (brighter points + faint links)
    const cp = [], cl = [];
    for (const k of CONSTELLATIONS) {
      const c = this._dir(k.az, k.el);
      let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), c); if (right.lengthSq() < 1e-4) right.set(1, 0, 0); right.normalize();
      const top = new THREE.Vector3().crossVectors(c, right).normalize();
      const pts = k.stars.map(([x, y]) => c.clone().addScaledVector(right, x * k.scale / 500).addScaledVector(top, y * k.scale / 500).normalize().multiplyScalar(498));
      for (const p of pts) cp.push(p.x, p.y, p.z);
      for (const [a, b] of k.links) cl.push(pts[a].x, pts[a].y, pts[a].z, pts[b].x, pts[b].y, pts[b].z);
    }
    const cpg = new THREE.BufferGeometry(); cpg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3));
    this.cstars = new THREE.Points(cpg, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 3.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.cstars.frustumCulled = false; this.cel.add(this.cstars);
    const clg = new THREE.BufferGeometry(); clg.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
    this.clines = new THREE.LineSegments(clg, new THREE.LineBasicMaterial({ color: 0x4a6a9a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.clines.frustumCulled = false; this.cel.add(this.clines);

    // flashlight — a spotlight bolted to the camera (off until bought)
    this.flash = new THREE.SpotLight(0xfff0d0, 0, 60, 0.62, 0.4, 0.0);
    this.flash.position.set(0.2, -0.15, 0.2);
    this.flash.target.position.set(0, -0.05, -10);
    this.cam.add(this.flash); this.cam.add(this.flash.target);
    this.flashOn = false;
  }
  _dir(az, el) { return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)); }
  _lc(out, a, b, t) { return out.copy(a).lerp(b, t); }

  // The world clock (game._worldClock) is the single source of time — it must be seeded BEFORE this runs.
  reset() {
    this.active = true; this.nightCount = 0; this.bloodMoon = false;
    this.cel.visible = true;
    this.flashOn = true; this.flash.intensity = 0; // beam preference on; only emits while the flashlight item is held
    this._wasNight = isNight(this.game._worldClock.minuteOfDay());
    this.renderFrom(this.game._worldClock); // sky reflects the current time of day immediately
  }
  setFlashlight(on) { this.flashOn = on; this.flash.intensity = on ? 7 : 0; }
  toggleFlashlight() { if (this.game.weapons.owns('flashlight')) { this.flashOn = !this.flashOn; this.game.audio.uiClick(); this.game.hud.setNightGear(this.game); this.game.hud.setWeapon(this.game.weapons); } else this.game.hud.bigMessage('NO FLASHLIGHT', 'buy one in the SHOP and put it in your inventory'); }

  info() { const m = this.game._worldClock.minuteOfDay(); const night = isNight(m); return { night, n: this.nightCount, blood: this.bloodMoon && night }; }
  // Jump the clock to an absolute minute-of-day (keeps the current day), re-render the sky, and (host) broadcast.
  // Used by /time set HH:MM and /time set <keyword>.
  setMinuteOfDay(min) {
    const wc = this.game._worldClock;
    const m = ((min % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    wc.setTotal(wc.day() * MINUTES_PER_DAY + m);
    this._wasNight = isNight(m);
    this.renderFrom(wc);
    if (this.game.mp.active && this.game.mp.isHost) this.game.mp.sendWorldTime();
  }
  // Legacy keyword path (kept for /time set <keyword>): map a phase name to a minute, then jump.
  setTime(which) { const min = keywordMinute(which); if (min == null) return false; this.setMinuteOfDay(min); return true; }

  // Fired once per whole in-game minute (host/solo only — see game._stepMinute). Detects the day↔night
  // edge off the authoritative clock, rolls the night counter / blood-moon, and pushes the transition to clients.
  onWorldMinute(_total) {
    const night = isNight(this.game._worldClock.minuteOfDay());
    if (night && !this._wasNight) {
      this.nightCount++; this.bloodMoon = this.nightCount > 1 && chc(0.25); this.game.onNightStart(this.nightCount, this.bloodMoon);
      if (this.game.mp.active && this.game.mp.isHost) this.game.mp.sendWorldTime(); // host: announce night/blood-moon at this timing
    } else if (!night && this._wasNight) {
      this.game.onDayStart();
      if (this.game.mp.active && this.game.mp.isHost) this.game.mp.sendWorldTime(); // host: announce dawn transition
    }
    this._wasNight = night;
  }

  // Host-authoritative push (clients only): reconcile the local clock to the host's, adopt night/blood-moon, render.
  applyNetState(d) {
    if (!d) return;
    this.game.mode = d.mode === 'longnight' ? 'longnight' : 'purge';
    if (this.game.hud) this.game.hud.setNightMode(true);
    this.active = true; this.cel.visible = true;
    const prevNight = this.nightCount, prevBlood = this.bloodMoon;
    if (Number.isFinite(d.total)) { this.game.mp._lastClockDrift = this.game._worldClock.total - d.total; this.game._worldClock.setTotal(d.total); } // measure prediction error, then snap to host truth
    this.nightCount = Number.isFinite(d.n) ? d.n : this.nightCount;
    this.bloodMoon = !!d.blood;
    this._wasNight = isNight(this.game._worldClock.minuteOfDay());
    this.renderFrom(this.game._worldClock);
    if (this._wasNight && (this.nightCount > prevNight || (this.bloodMoon && !prevBlood))) this.game.onNightStart(this.nightCount, this.bloodMoon); // mirror the host's NIGHT/BLOOD MOON banner
  }

  // Drive the sky from the world clock's minute-of-day (+ sub-minute alpha for smoothness). _apply is unchanged.
  renderFrom(wc) {
    const { day, L, ang } = skyPhase(wc.minuteOfDay() + wc.alpha);
    this._apply(L, ang, day);
  }

  _apply(L, ang, day) {
    const e = this.game.engine, u = e.sky.material.uniforms, blood = this.bloodMoon && !day;
    this._lc(u.top.value, SKYC.nTop, SKYC.dTop, L);
    this._lc(u.mid.value, SKYC.nMid, SKYC.dMid, L);
    this._lc(u.bot.value, SKYC.nBot, SKYC.dBot, L);
    if (day && L < 0.4) { const tw = (0.4 - L) / 0.4; u.bot.value.lerp(SKYC.dusk, tw * 0.85); u.mid.value.lerp(SKYC.dusk, tw * 0.3); }
    if (blood) { u.top.value.lerp(SKYC.blood, 0.5); u.mid.value.lerp(SKYC.blood, 0.35); u.bot.value.lerp(SKYC.blood, 0.25); }
    e.scene.background.copy(u.mid.value);
    this._lc(e.scene.fog.color, SKYC.nFog, SKYC.dFog, L); if (blood) e.scene.fog.color.lerp(SKYC.blood, 0.4);
    e.scene.fog.near = 10 + L * 85; e.scene.fog.far = 72 + L * 568;
    e.hemi.intensity = 0.05 + L * 0.9; this._lc(e.hemi.color, SKYC.nHemi, SKYC.dHemiSky, L); this._lc(e.hemi.groundColor, SKYC.nHemiG, SKYC.dHemiG, L);
    e.ambient.intensity = 0.03 + L * 0.15 + (blood ? 0.05 : 0); this._lc(e.ambient.color, blood ? SKYC.bloodAmb : SKYC.nAmb, SKYC.white, L);
    const dir = this._tmp.set(Math.cos(ang), Math.max(0.06, Math.sin(ang)), 0.35).normalize();
    e.sun.position.copy(this.cam.position).addScaledVector(dir, 200); e.sun.target.position.copy(this.cam.position); e.sun.target.updateMatrixWorld();
    if (day) { e.sun.intensity = L * 2.1; e.sun.color.copy(SKYC.sunCol); }
    else { e.sun.intensity = blood ? 0.18 : 0.12; e.sun.color.copy(blood ? SKYC.bloodMoonLight : SKYC.moonLight); }
    const cm = e.clouds.children[0] && e.clouds.children[0].material; if (cm) cm.opacity = 0.55 * L;
    this.cel.position.copy(this.cam.position);
    this.sunMesh.visible = day && L > 0.01; this.moonMesh.visible = !day;
    (day ? this.sunMesh : this.moonMesh).position.copy(dir).multiplyScalar(480);
    if (!day) this.moonMesh.material.color.copy(blood ? SKYC.blood : SKYC.moonCol);
    const sa = clamp((0.32 - L) / 0.32, 0, 1);
    this.stars.material.opacity = sa * 0.9; this.cstars.material.opacity = sa; this.clines.material.opacity = sa * 0.5;
    // ── ?map=forest: re-tint the world GREEN over the desert SKYC blend (runs LAST, so it wins) ──
    if (this.game.world && this.game.world.mapId === 'forest') {
      const t = clamp(L, 0, 1);
      e.scene.fog.color.copy(FOREST_SKY.nFog).lerp(FOREST_SKY.dFog, t);    // green-tan mist by day → dark green at night
      e.scene.fog.near = 12 + t * 50; e.scene.fog.far = 50 + t * 300;      // tighter, mistier than the open maps
      // tint the whole sky DOME green so the haze reads green EVERYWHERE (matches the demo's green bg),
      // strongest at the horizon where it dissolves into the fog. Only by day (t), so night stays starry.
      u.top.value.lerp(FOREST_SKY.dFog, 0.45 * t);
      u.mid.value.lerp(FOREST_SKY.dFog, 0.72 * t);
      u.bot.value.lerp(FOREST_SKY.dFog, 0.9 * t);
      e.scene.background.copy(u.mid.value);
      e.hemi.groundColor.copy(FOREST_SKY.nHemiG).lerp(FOREST_SKY.dHemiG, t); // green up-bounce off the forest floor
      if (day) e.sun.color.copy(FOREST_SKY.sun);                           // warm sun filtered through the canopy
    }
  }
}
