// world.js — extracted from game.js during the module split (mechanical move, no logic changes).
import * as THREE from 'three';
import { MeshBuilder, TAU, chc, clamp, lerp, makeRNG, randRange, rayAABB, rng, shade, voxelMaterial } from './util.js?u=3';
import { CONSTELLATIONS, DAY_FRAC, NIGHT_CYCLE, SKYC, STRUCT_FX_COLOR } from './tuning.js';
import { STRUCT_CAP, STRUCT_DEFS } from './economy.js';
import { buildBarbedWire, buildBarricade, buildFieldRadio, buildSandbags, animateFieldRadio } from './props.js';
import { RADIO_STATIONS, radioAttenuation, stationLabel } from './radio.js';


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
    this.spawns = [];
    this.lootSpots = [];
    this.scene.fog.near = 95; this.scene.fog.far = 640; // wider haze for the larger compound
    this._build();
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

    // === intel poster on the Barracks east wall (T-90M weak-points), facing the plaza ===
    const posterTex = new THREE.TextureLoader().load('assets/poster-t90m-weakpoints.png');
    posterTex.colorSpace = THREE.SRGBColorSpace; posterTex.anisotropy = 4;
    const posterH = 1.44, posterW = posterH * (687 / 1024);   // image is 687×1024 (portrait); 40% of original (−60%)
    // Lambert (not Basic) so the poster is lit by the scene — bright in sun, dim/shaded
    // at dusk & night — and can receive shadows. alphaTest keeps it in the OPAQUE pass so
    // the depthTest:false viewmodel weapon (renderOrder 1000) still draws on top, and clips
    // the PNG's transparent edges. A faint emissive keeps it just-readable in deep dark.
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(posterW, posterH),
      new THREE.MeshLambertMaterial({ map: posterTex, alphaTest: 0.5, emissive: 0x0a0a0c, emissiveIntensity: 1 }));
    poster.position.set(-32.65, 2.4, 32);   // just off the barracks east face (x=-33, ±0.3 thick)
    poster.rotation.y = Math.PI / 2;          // normal → +x (toward map centre)
    poster.receiveShadow = true;
    this.scene.add(poster);

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

  _mesh(builder) {
    if (builder.vertexCount === 0) return new THREE.Group();
    const m = new THREE.Mesh(builder.build(), voxelMaterial());
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }

  collide(pos, vel, r, h, dt) {
    let onGround = false;
    // vertical
    pos.y += vel.y * dt;
    if (pos.y <= 0) { pos.y = 0; if (vel.y < 0) vel.y = 0; onGround = true; }
    for (const b of this.boxes) {
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      const feet = pos.y, head = pos.y + h;
      if (head <= b.min.y || feet >= b.max.y) continue;
      const penTop = b.max.y - feet, penBot = head - b.min.y;
      if (penTop < penBot && vel.y <= 0.01) { pos.y = b.max.y; vel.y = 0; onGround = true; }
      else if (vel.y > 0) { pos.y = b.min.y - h; vel.y = 0; }
    }
    // horizontal (with step-up: stairs / ledges up to ~0.6m are climbable)
    this._moveAxis(pos, vel, r, h, 'x', vel.x * dt);
    this._moveAxis(pos, vel, r, h, 'z', vel.z * dt);
    const lim = this.HALF - r;
    pos.x = clamp(pos.x, -lim, lim); pos.z = clamp(pos.z, -lim, lim);
    return onGround;
  }

  // Is the player's body column free of boxes if its feet were at feetY here?
  _headClear(pos, r, h, feetY, ignore) {
    for (const b of this.boxes) {
      if (b === ignore) continue;
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      if (feetY + h <= b.min.y || feetY >= b.max.y) continue;
      return false;
    }
    return true;
  }

  _moveAxis(pos, vel, r, h, ax, delta) {
    pos[ax] += delta;
    for (const b of this.boxes) {
      const feet = pos.y, head = pos.y + h;
      if (head <= b.min.y + 0.02 || feet >= b.max.y - 0.02) continue;
      if (pos.x + r <= b.min.x || pos.x - r >= b.max.x) continue;
      if (pos.z + r <= b.min.z || pos.z - r >= b.max.z) continue;
      // step-up: climb low ledges/stairs instead of blocking
      const step = b.max.y - pos.y;
      if (step > 0.02 && step <= 0.62 && this._headClear(pos, r, h, b.max.y + 0.002, b)) { pos.y = b.max.y + 0.002; continue; }
      if (ax === 'x') { if (vel.x > 0) pos.x = b.min.x - r; else if (vel.x < 0) pos.x = b.max.x + r; else pos.x = pos.x < (b.min.x + b.max.x) / 2 ? b.min.x - r : b.max.x + r; vel.x = 0; }
      else { if (vel.z > 0) pos.z = b.min.z - r; else if (vel.z < 0) pos.z = b.max.z + r; else pos.z = pos.z < (b.min.z + b.max.z) / 2 ? b.min.z - r : b.max.z + r; vel.z = 0; }
    }
  }

  rayHit(origin, dir, maxDist, ignore = null) {
    let best = maxDist, hitBox = null;
    const ignored = Array.isArray(ignore) ? ignore : null;
    for (const b of this.boxes) {
      if (b === ignore || (ignored && ignored.includes(b))) continue;
      const t = rayAABB(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, b.min, b.max);
      if (t !== null && t < best) { best = t; hitBox = b; }
    }
    if (dir.y < -1e-6) { const tg = -origin.y / dir.y; if (tg > 0 && tg < best) { best = tg; hitBox = 'ground'; } }
    if (best >= maxDist) return null;
    const point = new THREE.Vector3(origin.x + dir.x * best, origin.y + dir.y * best, origin.z + dir.z * best);
    const normal = new THREE.Vector3(0, 1, 0);
    if (hitBox && hitBox !== 'ground') {
      const ex = Math.min(Math.abs(point.x - hitBox.min.x), Math.abs(point.x - hitBox.max.x));
      const ey = Math.min(Math.abs(point.y - hitBox.min.y), Math.abs(point.y - hitBox.max.y));
      const ez = Math.min(Math.abs(point.z - hitBox.min.z), Math.abs(point.z - hitBox.max.z));
      if (ex <= ey && ex <= ez) normal.set(point.x < (hitBox.min.x + hitBox.max.x) / 2 ? -1 : 1, 0, 0);
      else if (ey <= ez) normal.set(0, point.y < (hitBox.min.y + hitBox.max.y) / 2 ? -1 : 1, 0);
      else normal.set(0, 0, point.z < (hitBox.min.z + hitBox.max.z) / 2 ? -1 : 1);
    }
    return { dist: best, point, normal, box: (hitBox && hitBox !== 'ground') ? hitBox : null };
  }

  addWreckObstacle(pos, yaw) {
    const hw = 2.0, hl = 3.6, h = 1.6;
    this.boxes.push({ min: new THREE.Vector3(pos.x - hw, 0, pos.z - hl), max: new THREE.Vector3(pos.x + hw, h, pos.z + hl), wreck: true });
  }
  clearWrecks() { this.boxes = this.boxes.filter(b => !b.wreck); }
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
    if (!pos) return false;
    const sd = STRUCT_DEFS[kind], fp = this._footprint(kind, yaw), top = pos.y + sd.h;
    for (const bx of this.game.world.boxes) {                            // map + placed hard structures
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
    const onFoot = this.game.state === 'playing' && !this.game.player.inTank && !this.game.player.mountedGun && !(this.game.mp && this.game.mp.frozen);
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
    const mesh = sd.prop ? buildFieldRadio() : new THREE.Mesh(this._geos[kind], voxelMaterial());
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(pos.x, pos.y || 0, pos.z); mesh.rotation.y = yaw;
    this.scene.add(mesh);
    const s = { id, kind, pos: new THREE.Vector3(pos.x, pos.y || 0, pos.z), yaw, mesh, hp: sd.hp, maxHp: sd.hp, box: null, hazard: null,
                on: false, station: 0, audio: null }; // on/station/audio used only by radio props
    const fp = this._footprint(kind, yaw);
    const aabb = (extraTag) => Object.assign({ min: new THREE.Vector3(pos.x - fp.hx, 0, pos.z - fp.hz), max: new THREE.Vector3(pos.x + fp.hx, (pos.y || 0) + sd.h, pos.z + fp.hz) }, extraTag);
    if (sd.hard) { s.box = aabb({ struct: true, _ref: s }); this.game.world.boxes.push(s.box); }
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
    const n = RADIO_STATIONS.length, st = RADIO_STATIONS[((s.station % n) + n) % n];
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
    if (this.game.player.inTank || this.game.player.mountedGun) return;
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
  toggleRadio(s) {
    if (!s) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('radioreq', { id: s.id, on: !s.on, station: s.station }); return; }
    this.applyRadioSet({ id: s.id, on: !s.on, station: s.station });               // host / solo
    if (mp && mp.active && mp.isHost) mp.net.broadcast('radioset', { id: s.id, on: s.on, station: s.station });
  }
  cycleRadioStation(s, dir) {
    if (!s) return;
    const n = RADIO_STATIONS.length, st = ((s.station + dir) % n + n) % n, mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('radioreq', { id: s.id, on: true, station: st }); return; }
    this.applyRadioSet({ id: s.id, on: true, station: st });
    if (mp && mp.active && mp.isHost) mp.net.broadcast('radioset', { id: s.id, on: true, station: st });
    if (this.game.hud) this.game.hud.toast('📻 ' + stationLabel(st), 0x6fd0e8);
  }
  // apply authoritative state to a radio (local audio follows). Used by host/solo + remote clients.
  applyRadioSet(d) {
    const s = this.structures.find((x) => x.id === d.id && x.kind === 'radio'); if (!s) return;
    const changedStation = s.station !== d.station;
    s.on = !!d.on; s.station = d.station | 0;
    if (s.on) this._radioStart(s); else this._radioStop(s);
    if (s.on && changedStation) this._radioStart(s); // retune (updates src + plays)
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
    if (enemy && enemy.def && (enemy.def.boss || enemy.def.tank || (enemy.def.scale || 1) >= 1.6)) dmg = s.maxHp; // heavies crush
    s.hp -= dmg;
    if (s.mesh && s.mesh.material.emissive) { const f = Math.max(0, s.hp / s.maxHp); s.mesh.material.emissive.setRGB((1 - f) * 0.22, 0, 0); }
    if (s.hp <= 0) this.destroyStructure(s, 'smash');
  }

  // player-caused damage (shooting / melee); host-authoritative in MP (clients ask the host)
  playerDamage(s, dmg) {
    if (!s) return;
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) mp.net.send('structhit', { id: s.id, dmg });
    else this.attackStructure(s, dmg, null);
  }

  destroyStructure(s, cause) {
    const i = this.structures.indexOf(s); if (i < 0) return;
    this.structures.splice(i, 1);
    this._radioStop(s); if (s.audio) { try { s.audio.src = ''; } catch (e) {} s.audio = null; } // radio prop: kill its stream on destroy
    if (s.box) { const j = this.game.world.boxes.indexOf(s.box); if (j >= 0) this.game.world.boxes.splice(j, 1); }
    if (s.mesh) { this.scene.remove(s.mesh); if (s.mesh.material) s.mesh.material.dispose(); }
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
      if (s.box) { const j = this.game.world.boxes.indexOf(s.box); if (j >= 0) this.game.world.boxes.splice(j, 1); }
      if (s.mesh) { this.scene.remove(s.mesh); if (s.mesh.material) s.mesh.material.dispose(); }
      if (s.audio) { try { s.audio.pause(); s.audio.src = ''; } catch (e) {} } // radio props: stop streams on run reset
    }
    this.structures.length = 0;
    if (this.game.audio && this.game.audio.setMusicDuck) this.game.audio.setMusicDuck(1); // clear any radio music-duck
    this._idc = 1; this.ghostYaw = 0; this._valid = false; this._ghostPos = null;
    this.ghost.visible = false;
  }
}

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

  reset(active) {
    this.active = active; this.t = 0; this.nightCount = 0; this.bloodMoon = false; this._wasNight = false;
    this.cel.visible = active;
    this.flashOn = true; this.flash.intensity = 0; // beam preference on; only emits while the flashlight item is held
    // hold bright noon for PURGE; start LONG NIGHT at dawn
    this._apply(active ? 0.0 : 1.0, Math.PI / 2, true);
  }
  setFlashlight(on) { this.flashOn = on; this.flash.intensity = on ? 7 : 0; }
  toggleFlashlight() { if (this.game.weapons.owns('flashlight')) { this.flashOn = !this.flashOn; this.game.audio.uiClick(); this.game.hud.setNightGear(this.game); this.game.hud.setWeapon(this.game.weapons); } else this.game.hud.bigMessage('NO FLASHLIGHT', 'buy one in the SHOP and put it in your inventory'); }

  info() { const c = (this.t % NIGHT_CYCLE) / NIGHT_CYCLE; const night = c >= DAY_FRAC; return { night, n: this.nightCount, blood: this.bloodMoon && night }; }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const c = (this.t % NIGHT_CYCLE) / NIGHT_CYCLE;
    const day = c < DAY_FRAC;
    const isNight = !day;
    if (isNight && !this._wasNight) {
      this.nightCount++; this.bloodMoon = this.nightCount > 1 && chc(0.25); this.game.onNightStart(this.nightCount, this.bloodMoon);
      if (this.game.mp.active && this.game.mp.isHost) this.game.mp.net.send('night', { t: this.t, n: this.nightCount, blood: this.bloodMoon }); // host: announce night/blood-moon at this timing
    }
    else if (!isNight && this._wasNight) { this.game.onDayStart(); if (this.game.mp.active && this.game.mp.isHost) this.game.mp.net.send('night', { t: this.t, n: this.nightCount, blood: this.bloodMoon }); } // host: announce dawn transition
    this._wasNight = isNight;
    this._render();
  }

  // Host-authoritative state push (clients only): adopt the host's clock + night/blood-moon, then render that sky without advancing time.
  applyNetState(d) {
    if (!d) return;
    const prevNight = this.nightCount, prevBlood = this.bloodMoon;
    this.t = d.t; this.nightCount = d.n; this.bloodMoon = d.blood;
    this._wasNight = (this.t % NIGHT_CYCLE) / NIGHT_CYCLE >= DAY_FRAC;
    this._render();
    if (this.nightCount > prevNight || this.bloodMoon !== prevBlood) this.game.onNightStart(this.nightCount, this.bloodMoon); // mirror the host's NIGHT/BLOOD MOON banner
  }

  // Apply the sky for the CURRENT this.t / this.bloodMoon (no time advance) — shared by update() and applyNetState().
  _render() {
    const c = (this.t % NIGHT_CYCLE) / NIGHT_CYCLE;
    const day = c < DAY_FRAC;
    const dayT = c / DAY_FRAC;
    const L = day ? clamp(Math.sin(dayT * Math.PI), 0, 1) : 0;
    const ang = (day ? dayT : (c - DAY_FRAC) / (1 - DAY_FRAC)) * Math.PI;
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
  }
}
