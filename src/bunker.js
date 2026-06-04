// bunker.js — «ОБЪЕКТ 1180» secret Soviet command bunker POI for the steppe map.
// Rebuilt as a MULTI-LEVEL buried command post per the voxel-building-modeling pipeline:
//   docs/2026-06-03-soviet-bunker-reference.md (palette/typology) +
//   docs/2026-06-04-soviet-bunker-multilevel-dossier.md (3-level stack, per-room kit, embrasures) +
//   docs/2026-06-04-bunker-multilevel-build-spec.md (the build contract).
//
// ENGINE: hard floor at y=0 (can't go below grade) → "deep" is faked by burying a 3-level interior
// in a tall earth KURGAN. The DEEPEST level sits at grade (y=0) with the whole mound above it =
// most protected = the COMMAND core (matches real "command deepest" logic, inverted in Y). Player
// descends crown blockhouse → L2 → L1 → L0; a base postern at grade connects straight into L0.
// Vertical cores: a switchback STAIRWELL (W hall) + a caged escape LADDER shaft (СКОБ-ТРАП, E room)
// link all levels. A surface НП/FIRING TOWER (armored embrasures, NO glass) rises from the crown,
// reached by a ladder. Openable гермодвери (E key) are host-authoritative (mirror world.toggleGate).
//
// Entry: buildSecretBunker(world, BX, BZ) — BX/BZ = bunker centre in WORLD coords.
import * as THREE from 'three';
import { MeshBuilder, TAU, makeRNG, randRange, shade, voxelMaterial } from './util.js';
import { signPlane, cyl, collider } from './industrial.js';

// ---- layered-shading palettes (Hi/Mid/Lo/Slot) — HEX from the dossier §4 ----
const CONC  = { hi: 0xb0aa9c, mid: 0x9a9486, lo: 0x7d776a, slot: 0x5c574c }; // fresh concrete (surface cap)
const CONCW = { hi: 0x968f80, mid: 0x837d70, lo: 0x645f54, slot: 0x47433a }; // weathered/interior concrete
const CONCD = { hi: 0x827c70, mid: 0x6f6a60, lo: 0x534f47, slot: 0x383530 }; // dark underground concrete
const STEELB= { hi: 0x6f808a, mid: 0x5a6b73, lo: 0x3f4c52, slot: 0x2a3338 }; // steel blast-door grey-blue
const DOORBR= { hi: 0x8f6c47, mid: 0x7a5a3a, lo: 0x5a4329, slot: 0x352718 }; // brown blast door
const OLIVE = { hi: 0x5e6c46, mid: 0x4d5a3a, lo: 0x36402a, slot: 0x232b1a }; // army equipment olive
const EQGRY = { hi: 0x848e8a, mid: 0x707b78, lo: 0x515a57, slot: 0x363c3a }; // console/cabinet grey
const BEIGE = { hi: 0xd6cba6, mid: 0xc4b896, lo: 0x9b9170, slot: 0x6f6750 }; // warm beige technical-room wall (verified RVSN)
const PIPEG = { hi: 0xb6bbbd, mid: 0x9fa4a6, lo: 0x767b7d, slot: 0x565a5c }; // galvanized pipe
const REDPIPE={ hi: 0xc24234, mid: 0xa83228, lo: 0x781f16, slot: 0x551109 }; // red fire-line pipe
const DADO  = { hi: 0xa3bba3, mid: 0x8fa890, lo: 0x6f846f, slot: 0x53634f }; // teal dado (lower wall)
const CREAM = { hi: 0xe6e1d2, mid: 0xd8d2c0, lo: 0xb3ad9c, slot: 0x8c8675 }; // cream upper wall
const LINO  = { hi: 0x8e4a3d, mid: 0x7a3b30, lo: 0x582820, slot: 0x3c1c16 }; // oxblood lino floor
const RUSTP = { hi: 0x95603a, mid: 0x7c4a2c, lo: 0x5a3420, slot: 0x3a2114 }; // rust
const WOOD  = { hi: 0x8a6238, mid: 0x6a4a2a, lo: 0x4a3420, slot: 0x2f2014 }; // timber
const WHITEN= { hi: 0xeef0ee, mid: 0xdadedb, lo: 0xb4b8b6, slot: 0x8c918e }; // white enamel (medical)
const EARTH = 0x6e5c3c, GRASS = 0x5e6a32, GRASS2 = 0x55602c;
const HAZ_Y = 0xd9b43a, HAZ_K = 0x26241f, CD_RED = 0xb23a2e, STAR = 0xc01a1a;
const REDGLOW = 0xff2a1f, AMBER = 0xffb24a, O2BLUE = 0x2f5f9a;

// ---- vertical scheme (m) ----
const T   = 0.6;                  // shell wall thickness
const PT  = 0.4;                  // interior partition thickness
const SHX = 13, SHZ = 10.5;       // interior half-extents (interior 26×21)
const L0Y = 0.0, L1Y = 3.6, L2Y = 7.2, CROWNY = 10.8; // walkable floor tops
const SLAB = 0.5;                 // inter-level slab thickness
const CHc = 3.2;                  // partition wall height (overlaps the ceiling slab bottom at +3.1 → no top gap)
const TOWY = 13.5, TOWTOP = 16.1; // НП firing-platform floor / tower top
const ST_N = 8, ST_RISE = 0.45, ST_GO = 0.55, ST_W = 2.4; // stair: 8×0.45 = 3.6/level
const WLANE = -10.6, ELANE = -8.0;   // stairwell west/east lane local-X (both inside the W hall)
const SHAFTX = 10.6, SHAFTZ = -8.4;  // escape ladder shaft local centre (E room, SE)
const LEVELS = [L0Y, L1Y, L2Y];

// layered slab: Mid body + thin lit Hi top strip + dark Lo bottom strip (visual only).
function lit(b, w, h, d, x, y, z, pal, opts = {}) {
  b.box(w, h, d, x, y, z, pal.mid, opts);
  const ts = Math.min(0.16, h * 0.16), bs = Math.min(0.14, h * 0.14);
  b.box(w * 1.002, ts, d * 1.002, x, y + h / 2 - ts / 2, z, pal.hi, opts);
  b.box(w * 1.002, bs, d * 1.002, x, y - h / 2 + bs / 2, z, pal.lo, opts);
}
// yellow/black hazard chevron strip on a floor/face, centred (x,y,z), length L, height H, along axis.
function chevron(b, x, y, z, L, H, axis) {
  const n = Math.max(3, Math.round(L / 0.34)), step = L / n;
  for (let i = 0; i < n; i++) {
    const o = -L / 2 + step * (i + 0.5), col = i % 2 ? HAZ_K : HAZ_Y;
    if (axis === 'z') b.box(step * 0.96, H, 0.05, x + o, y, z, col, { rz: 0.5 });
    else b.box(0.05, H, step * 0.96, x, y, z + o, col, { rx: 0.5 });
  }
}
// overhead galvanized pipe run along an axis between two coords at height y (+ hanger straps).
function pipeRun(b, ax, a0, a1, fixed, y, r = 0.14, col = PIPEG) {
  const len = Math.abs(a1 - a0), mid = (a0 + a1) / 2;
  if (ax === 'z') { cyl(b, r, len, fixed, y, mid, col.mid, { rx: Math.PI / 2, seg: 8, tint: 0.03 }); cyl(b, r * 1.12, len, fixed, y + r * 0.7, mid, col.hi, { rx: Math.PI / 2, seg: 8, sy: 0.4 }); }
  else { cyl(b, r, len, mid, y, fixed, col.mid, { rz: Math.PI / 2, seg: 8, tint: 0.03 }); cyl(b, r * 1.12, len, mid, y + r * 0.7, fixed, col.hi, { rz: Math.PI / 2, seg: 8, sy: 0.4 }); }
  for (let t = 0.2; t < 1; t += 0.4) { const p = a0 + (a1 - a0) * t; if (ax === 'z') b.box(0.04, 0.28, 0.04, fixed, y + 0.16, p, EQGRY.slot); else b.box(0.04, 0.28, 0.04, p, y + 0.16, fixed, EQGRY.slot); }
}
// cable tray (dark ladder w/ a Hi strip) stuffed with black looms, along an axis.
function cableTray(b, ax, a0, a1, fixed, y) {
  const len = Math.abs(a1 - a0), mid = (a0 + a1) / 2;
  if (ax === 'z') { b.box(0.28, 0.05, len, fixed, y, mid, 0x3d3a36); b.box(0.28, 0.02, len, fixed, y + 0.035, mid, 0x4d4a44); b.box(0.22, 0.11, len * 0.99, fixed, y + 0.085, mid, 0x18181a); }
  else { b.box(len, 0.05, 0.28, mid, y, fixed, 0x3d3a36); b.box(len, 0.02, 0.28, mid, y + 0.035, fixed, 0x4d4a44); b.box(len * 0.99, 0.11, 0.22, mid, y + 0.085, fixed, 0x18181a); }
}
// emergency lamp: small emissive lens (always visible) + a low red/amber point light.
function lamp(world, b, x, y, z, color = REDGLOW, range = 8, intensity = 0.9) {
  b.box(0.26, 0.16, 0.12, x, y, z, EQGRY.slot);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), new THREE.MeshBasicMaterial({ color }));
  lens.position.set(x, y - 0.1, z); world.scene.add(lens); // below the housing so the lens reads
  const pl = new THREE.PointLight(color, intensity, range, 2.0); pl.position.set(x, y - 0.1, z); world.scene.add(pl);
  (world._bunkerLights || (world._bunkerLights = [])).push(pl, lens);
}

// ====================================================================
// OPENABLE ГЕРМОДВЕРЬ — a swinging blast-door LEAF mesh + a tracked collider.
// ====================================================================
function blastLeaf(W, H) {        // leaf in LOCAL coords: hinge at x=0, leaf spans x∈[0,W], faces ±z
  const lb = new MeshBuilder(), D = DOORBR, th = 0.22, cy = H / 2;
  lb.box(W, H, th, W / 2, cy, 0, D.mid, { tint: 0.02 });
  lb.box(W * 1.002, 0.12, th + 0.02, W / 2, H - 0.06, 0, D.hi);
  lb.box(W * 1.002, 0.12, th + 0.02, W / 2, 0.06, 0, D.lo);
  for (const f of [1, -1]) {
    lb.box(W - 0.04, H - 0.04, 0.05, W / 2, cy, f * (th / 2 + 0.026), D.lo);
    lb.box(0.1, H - 0.3, 0.06, W / 2, cy, f * (th / 2 + 0.055), D.slot);
    lb.box(W - 0.22, 0.09, 0.06, W / 2, cy - H / 4, f * (th / 2 + 0.055), D.slot);
    lb.box(W - 0.22, 0.09, 0.06, W / 2, cy + H / 4, f * (th / 2 + 0.055), D.slot);
    for (const ly of [cy - 0.55, cy, cy + 0.55]) lb.box(W - 0.06, 0.07, 0.07, W / 2, ly, f * (th / 2 + 0.1), RUSTP.lo);
    const wz = f * (th / 2 + 0.12);
    cyl(lb, 0.2, 0.05, W / 2, cy, wz, CD_RED, { rx: Math.PI / 2, seg: 14 });
    cyl(lb, 0.08, 0.09, W / 2, cy, wz, shade(CD_RED, -0.22), { rx: Math.PI / 2, seg: 10 });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; lb.box(0.03, 0.34, 0.03, W / 2, cy, wz, CD_RED, { rz: a }); }
  }
  for (const hy of [0.4, cy, H - 0.3]) cyl(lb, 0.11, 0.32, 0, hy, 0, RUSTP.mid, { seg: 8 });
  return lb;
}
// Register an openable hermetic door. axis 'z' closes a Z-facing wall (leaf spans local X); axis 'x'
// closes an X-facing wall (leaf spans local Z). hinge -1/+1 picks the doorway edge; openDir +1/-1 swing.
function registerDoor(world, cx, cz, baseY, axis, W, H, hinge, openDir, label) {
  const leaf = new THREE.Mesh(blastLeaf(W, H).build(), voxelMaterial()); leaf.castShadow = true;
  const grp = new THREE.Group(); grp.add(leaf); world.scene.add(grp);
  let hx, hz, closedYaw;
  if (axis === 'z') { hx = cx + hinge * (W / 2); hz = cz; closedYaw = hinge > 0 ? Math.PI : 0; }
  else { hx = cx; hz = cz + hinge * (W / 2); closedYaw = hinge > 0 ? -Math.PI / 2 : Math.PI / 2; }
  const openYaw = closedYaw + openDir * 1.95; // ~112° — leaf tucks aside, doorway clear
  grp.position.set(hx, baseY, hz); grp.rotation.y = closedYaw;
  const depth = 0.34, mk = (a, b2, c, d, e, f) => ({ min: new THREE.Vector3(a, b2, c), max: new THREE.Vector3(d, e, f) });
  const colClosed = axis === 'z'
    ? mk(cx - W / 2, baseY, cz - depth / 2, cx + W / 2, baseY + H, cz + depth / 2)
    : mk(cx - depth / 2, baseY, cz - W / 2, cx + depth / 2, baseY + H, cz + W / 2);
  const colOpen = mk(hx - 0.3, baseY, hz - 0.3, hx + 0.3, baseY + H, hz + 0.3); // just the hinge post — doorway clear
  const col = { min: colClosed.min.clone(), max: colClosed.max.clone() }; world.boxes.push(col);
  const id = world._doors.length;
  world._doors.push({ id, grp, col, colClosed, colOpen, open: false, t: 0, _blocked: true, closedYaw, openYaw, ix: cx, iy: baseY + 1.4, iz: cz, reach: 3.0, label: label || 'ГЕРМОДВЕРЬ' });
}
function installDoorSystem(world) {
  if (world._doorSystem) return; world._doorSystem = true; world._doors = world._doors || [];
  world.updateDoorTarget = function (game) {
    this.doorTarget = null;
    if (!this._doors.length || game.state !== 'playing' || (game.mp && game.mp.frozen)) return;
    if (game.player.inTank || game.player.mountedGun) return;
    const cam = game.engine.camera; cam.updateMatrixWorld();
    const o = (this._dO || (this._dO = new THREE.Vector3())).setFromMatrixPosition(cam.matrixWorld);
    const f = (this._dF || (this._dF = new THREE.Vector3())).set(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
    let best = null, bestAlong = 1e9;
    for (const dr of this._doors) {
      const dx = dr.ix - o.x, dy = dr.iy - o.y, dz = dr.iz - o.z, along = dx * f.x + dy * f.y + dz * f.z;
      if (along <= 0.2 || along > dr.reach) continue;
      const px = o.x + f.x * along, py = o.y + f.y * along, pz = o.z + f.z * along;
      if (Math.hypot(dr.ix - px, dr.iy - py, dr.iz - pz) < 1.0 && along < bestAlong) { best = dr; bestAlong = along; }
    }
    this.doorTarget = best;
  };
  world.applyDoorSet = function (id, open) { const dr = this._doors[id]; if (dr) dr.open = !!open; };
  world.toggleDoor = function (game, dr) {
    if (!dr) return; const mp = game.mp;
    if (mp && mp.active && !mp.isHost) { if (mp.net) mp.net.send('doorreq', { id: dr.id, open: !dr.open }); return; }
    dr.open = !dr.open;
    if (game.audio && game.audio.uiClick) game.audio.uiClick();
    if (game.hud && game.hud.toast) game.hud.toast(dr.open ? 'ГЕРМОДВЕРЬ · ОТКРЫВАЮ' : 'ГЕРМОДВЕРЬ · ЗАКРЫВАЮ', dr.open ? 0x6fd08a : 0xd2a23a);
    if (mp && mp.active && mp.isHost && mp.net) mp.net.broadcast('doorset', { id: dr.id, open: dr.open });
  };
  world.updateDoors = function (dt) {
    for (const dr of this._doors) {
      const tgt = dr.open ? 1 : 0;
      if (dr.t !== tgt) { dr.t += (tgt - dr.t) * Math.min(1, dt * 5.5); if (Math.abs(tgt - dr.t) < 0.003) dr.t = tgt; }
      const e = dr.t < 0.5 ? 2 * dr.t * dr.t : 1 - Math.pow(-2 * dr.t + 2, 2) / 2;
      dr.grp.rotation.y = dr.closedYaw + (dr.openYaw - dr.closedYaw) * e;
      const blocked = dr.t < 0.45;
      if (blocked !== dr._blocked) { dr._blocked = blocked; const s = blocked ? dr.colClosed : dr.colOpen; dr.col.min.copy(s.min); dr.col.max.copy(s.max); }
    }
  };
}

// ====================================================================
// LADDER (СКОБ-ТРАП) — caged steel rung ladder visual + a registered climb zone.
// ====================================================================
function skobTrap(b, world, x, z, y0, y1, faceDir, hoops = true) {
  const railGap = 0.52, off = 0.13, faceZ = (faceDir === '+z' || faceDir === '-z');
  const fn = (faceDir === '-x' || faceDir === '-z') ? -1 : 1, h = y1 - y0, midY = (y0 + y1) / 2;
  for (const s of [-1, 1]) {
    const rx = faceZ ? x + s * railGap / 2 : x + fn * off, rz = faceZ ? z + fn * off : z + s * railGap / 2;
    b.box(0.05, h, 0.05, rx, midY, rz, RUSTP.mid, { tint: 0.03 });
  }
  for (let y = y0 + 0.2; y < y1; y += 0.28) {
    if (faceZ) b.box(railGap, 0.04, 0.04, x, y, z + fn * off, RUSTP.lo);
    else b.box(0.04, 0.04, railGap, x + fn * off, y, z, RUSTP.lo);
  }
  if (hoops) for (let y = y0 + 1.0; y < y1 - 0.4; y += 0.9) for (let k = 0; k < 5; k++) {
    const a = -1.2 + k * 0.6;
    if (faceZ) b.box(0.05, 0.05, 0.05, x + Math.sin(a) * 0.42, y, z + fn * (off + 0.42 - Math.cos(a) * 0.42), EQGRY.lo);
    else b.box(0.05, 0.05, 0.05, x + fn * (off + 0.42 - Math.cos(a) * 0.42), y, z + Math.sin(a) * 0.42, EQGRY.lo);
  }
  const m = 0.8;
  world._ladders.push({ minX: x - m, maxX: x + m, minZ: z - m, maxZ: z + m, bottom: y0 - 0.3, top: y1 + 0.4 });
}

// ====================================================================
// SURFACE TELLS
// ====================================================================
function mushroom(b, x, y0, z, h = 1.4) {
  cyl(b, 0.3, h, x, y0 + h / 2, z, CONCW.mid, { seg: 10, tint: 0.03 });
  cyl(b, 0.32, 0.2, x, y0 + h, z, CONCW.lo, { seg: 10 });
  const cowl = new THREE.ConeGeometry(0.62, 0.42, 12); b.geo(cowl, x, y0 + h + 0.32, z, STEELB.mid, { tint: 0.03 }); cowl.dispose();
  cyl(b, 0.64, 0.06, x, y0 + h + 0.13, z, STEELB.lo, { seg: 12 });
}
function antenna(b, x, z, y0, H = 11) {
  for (const o of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(0.05, H, 0.05, x + o[0], y0 + H / 2, z + o[1], RUSTP.mid, { tint: 0.04 });
  for (let y = 0.8; y < H; y += 1.1) { b.box(0.42, 0.04, 0.04, x, y0 + y, z - 0.18, RUSTP.lo); b.box(0.42, 0.04, 0.04, x, y0 + y, z + 0.18, RUSTP.lo); b.box(0.04, 0.04, 0.42, x - 0.18, y0 + y, z, RUSTP.lo); b.box(0.04, 0.04, 0.42, x + 0.18, y0 + y, z, RUSTP.lo); }
  b.box(0.06, 1.4, 0.06, x, y0 + H + 0.7, z, EQGRY.hi);
}
function cupola(b, x, y0, z) {
  cyl(b, 0.85, 0.5, x, y0 + 0.25, z, CONCW.mid, { seg: 16, tint: 0.03 });
  const dome = new THREE.SphereGeometry(0.82, 16, 8, 0, TAU, 0, Math.PI / 2); b.geo(dome, x, y0 + 0.5, z, STEELB.mid, { tint: 0.03 }); dome.dispose();
  cyl(b, 0.84, 0.07, x, y0 + 0.52, z, STEELB.lo, { seg: 16 });
  for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.5; b.box(0.3, 0.08, 0.04, x + Math.cos(a) * 0.83, y0 + 0.6, z + Math.sin(a) * 0.83, 0x111316, { ry: -a }); }
  b.box(0.12, 0.5, 0.12, x, y0 + 1.05, z, EQGRY.mid);
}
function ogolovok(b, x, y0, z) {
  lit(b, 1.6, 1.2, 1.6, x, y0 + 0.6, z, CONC, { tint: 0.03 });
  b.box(0.7, 0.5, 0.08, x, y0 + 0.6, z - 0.82, 0x2a2c2e);
  for (let i = 0; i < 4; i++) b.box(0.62, 0.04, 0.02, x, y0 + 0.4 + i * 0.13, z - 0.86, CONC.lo);
  cyl(b, 0.55, 0.18, x, y0 + 1.3, z, STEELB.mid, { seg: 14, tint: 0.03 });
  cyl(b, 0.57, 0.06, x, y0 + 1.39, z, STEELB.hi, { seg: 14 });
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; b.box(0.07, 0.05, 0.07, x + Math.cos(a) * 0.4, y0 + 1.41, z + Math.sin(a) * 0.4, RUSTP.lo); }
  b.box(0.32, 0.06, 0.1, x, y0 + 1.44, z, CD_RED);
}

// ====================================================================
// EMBRASURE (БОЙНИЦА) — real slit hole in a tower face; wide-inside/narrow-outside steel splay.
// Builds the wall-with-slit on one face of a square tower. side '+z'|'-z'|'+x'|'-x'.
// ====================================================================
function embrasure(b, cx, cz, half, fy, top, side) {
  const SL_W = 0.45, SL_H = 0.22, sill = fy + 1.3, lint = sill + SL_H, tw = 0.55;
  const faceZ = (side === '+z' || side === '-z'), sgn = (side === '+z' || side === '+x') ? 1 : -1;
  const wallC = faceZ ? cz + sgn * half : cx + sgn * half, span = half * 2;
  const put = (lenAlong, h, yc, off) => { if (faceZ) lit(b, lenAlong, h, tw, cx + off, yc, wallC, CONC, { tint: 0.03 }); else lit(b, tw, h, lenAlong, wallC, yc, cz + off, CONC, { tint: 0.03 }); };
  put(span, sill - fy, fy + (sill - fy) / 2, 0);
  put(span, top - lint, lint + (top - lint) / 2, 0);
  const sideLen = (span - SL_W) / 2, sideC = SL_W / 2 + sideLen / 2;
  put(sideLen, SL_H, sill + SL_H / 2, -sideC); put(sideLen, SL_H, sill + SL_H / 2, sideC);
  // steel splay lining (interior, wide mouth → narrow slit) + bolt-head dot rows
  const inMouthW = 1.0, inMouthH = 0.55, depth = tw, inC = wallC - sgn * (depth / 2 + 0.05);
  const plate = (w, h, off, yc) => { if (faceZ) b.box(w, h, depth * 0.85, cx + off, yc, wallC - sgn * 0.04, STEELB.mid, { tint: 0.03 }); else b.box(depth * 0.85, h, w, wallC - sgn * 0.04, yc, cz + off, STEELB.mid, { tint: 0.03 }); };
  plate(inMouthW, 0.06, 0, sill - 0.05); plate(inMouthW, 0.06, 0, lint + 0.05);
  for (const s of [-1, 1]) plate(0.08, inMouthH, s * (inMouthW / 2 - 0.04), sill + SL_H / 2);
  for (let i = -2; i <= 2; i++) { const o = i * 0.22; if (faceZ) b.box(0.04, 0.04, 0.04, cx + o, sill - 0.05, inC, RUSTP.lo); else b.box(0.04, 0.04, 0.04, inC, sill - 0.05, cz + o, RUSTP.lo); }
  // hinged заслонка shutter shown open, just above the lintel
  if (faceZ) b.box(0.5, 0.04, 0.3, cx, lint + 0.2, wallC - sgn * 0.22, STEELB.lo, { rx: sgn * 0.9 });
  else b.box(0.3, 0.04, 0.5, wallC - sgn * 0.22, lint + 0.2, cz, STEELB.lo, { rz: sgn * 0.9 });
}

// ====================================================================
//  FURNITURE BUILDERS — every one takes a floor-Y `y0` (so it sits on the right level).
// ====================================================================
function genset(b, x, y0, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [bx, bz] = at(0, 0); lit(b, 2.4, 1.5, 1.4, bx, y0 + 0.9, bz, OLIVE, { ry: yaw, tint: 0.03 });
  const [hx, hz] = at(-0.7, 0); cyl(b, 0.5, 1.3, hx, y0 + 1.1, hz, OLIVE.lo, { rz: Math.PI / 2, ry: yaw, seg: 10 });
  const [rx, rz] = at(-1.35, 0); b.box(0.3, 1.2, 1.2, rx, y0 + 0.95, rz, EQGRY.slot, { ry: yaw }); for (let i = 0; i < 6; i++) { const [fx, fz] = at(-1.5, -0.5 + i * 0.2); b.box(0.16, 1.0, 0.04, fx, y0 + 0.95, fz, 0x2a2c2a, { ry: yaw }); } // radiator fins (spread across the face)
  const [ex, ez] = at(0.9, -0.5); cyl(b, 0.13, 2.0, ex, y0 + 2.0, ez, RUSTP.mid, { seg: 8 }); cyl(b, 0.22, 0.8, ex, y0 + 1.5, ez, RUSTP.lo, { seg: 8, tint: 0.04 }); // exhaust+silencer
  const [gx, gz] = at(1.0, 0.4); lit(b, 0.9, 1.1, 1.0, gx, y0 + 0.7, gz, EQGRY, { ry: yaw });
  b.box(2.7, 0.12, 1.7, bx, y0 + 0.06, bz, EQGRY.slot);
}
function filterBank(b, x, y0, z) { // ФПУ-200 bank: 3 wide × 2 high squat green filter-absorbers (Ø0.45×0.41) on a frame
  for (let i = 0; i < 3; i++) { const cx = x + i * 0.62;
    for (let k = 0; k < 2; k++) cyl(b, 0.23, 0.41, cx, y0 + 0.55 + k * 0.46, z, OLIVE.mid, { seg: 12, tint: 0.03 });
    cyl(b, 0.06, 0.22, cx, y0 + 1.4, z, PIPEG.mid, { seg: 8 }); b.box(0.56, 0.3, 0.56, cx, y0 + 0.18, z, EQGRY.lo); } // duct elbow + base
  b.box(2.05, 0.08, 0.66, x + 0.62, y0 + 1.32, z, EQGRY.slot); // top brace
}
function ervFan(b, x, y0, z) { // ЭРВ-600 scroll fan + motor + belt guard
  cyl(b, 0.42, 0.6, x, y0 + 0.85, z, OLIVE.mid, { rx: Math.PI / 2, seg: 16, tint: 0.03 });
  cyl(b, 0.45, 0.2, x, y0 + 0.85, z + 0.32, OLIVE.lo, { rx: Math.PI / 2, seg: 16 });
  cyl(b, 0.16, 0.4, x + 0.55, y0 + 0.85, z, EQGRY.mid, { rz: Math.PI / 2, seg: 10 });
  b.box(0.3, 0.5, 0.14, x + 0.28, y0 + 0.85, z, EQGRY.slot); b.box(1.0, 0.5, 0.8, x, y0 + 0.2, z, EQGRY.lo);
  cyl(b, 0.18, 0.9, x - 0.2, y0 + 1.55, z, PIPEG.mid, { seg: 8 });
}
function ductRun(b, x, y0, z, h) { // flanged galvanized duct wall→ceiling
  cyl(b, 0.22, h, x, y0 + h / 2, z, PIPEG.mid, { seg: 10, tint: 0.03 });
  for (let y = 0.5; y < h; y += 1.2) cyl(b, 0.27, 0.08, x, y0 + y, z, PIPEG.lo, { seg: 10 });
  cyl(b, 0.16, 0.1, x, y0 + h * 0.4, z + 0.25, CD_RED, { rx: Math.PI / 2, seg: 10 }); // damper handwheel
}
function manometerBoard(b, x, y0, z, axis) {
  const ry = axis === 'x' ? Math.PI / 2 : 0;
  b.box(axis === 'z' ? 1.4 : 0.08, 1.0, axis === 'z' ? 0.08 : 1.4, x, y0 + 1.6, z, EQGRY.lo, { tint: 0.02 });
  for (let i = 0; i < 5; i++) { const o = -0.5 + i * 0.25; cyl(b, 0.1, 0.05, x + (axis === 'z' ? o : 0.05), y0 + 1.75, z + (axis === 'z' ? 0.05 : o), 0xe8e4d6, { rx: axis === 'z' ? Math.PI / 2 : 0, rz: axis === 'x' ? Math.PI / 2 : 0, seg: 12 }); }
  b.box(axis === 'z' ? 0.04 : 0.06, 0.5, axis === 'z' ? 0.06 : 0.04, x + (axis === 'z' ? -0.55 : 0.05), y0 + 1.2, z + (axis === 'z' ? 0.05 : -0.55), 0x9ec4d4);
}
function switchgear(b, x, y0, z, axis) { // РУ multi-cabinet + breakers
  const ry = axis === 'x' ? Math.PI / 2 : 0;
  for (let c = 0; c < 3; c++) { const o = -0.85 + c * 0.85;
    lit(b, axis === 'z' ? 0.8 : 0.5, 2.0, axis === 'z' ? 0.5 : 0.8, x + (axis === 'z' ? o : 0), y0 + 1.05, z + (axis === 'z' ? 0 : o), EQGRY, { tint: 0.02, ry });
    for (let i = 0; i < 6; i++) b.box(0.05, 0.07, 0.05, x + (axis === 'z' ? o - 0.2 + (i % 3) * 0.2 : 0.26), y0 + 1.5 - Math.floor(i / 3) * 0.4, z + (axis === 'z' ? 0.26 : o - 0.2 + (i % 3) * 0.2), i % 2 ? AMBER : CD_RED); }
}
function ta57(b, x, y0, z, red) {
  lit(b, 0.24, 0.16, 0.18, x, y0 + 0.08, z, red ? { hi: 0xc94d3e, mid: CD_RED, lo: 0x822317, slot: 0x551109 } : OLIVE, {});
  b.box(0.22, 0.05, 0.07, x, y0 + 0.19, z, 0x14140f); cyl(b, 0.05, 0.04, x + 0.14, y0 + 0.08, z, 0x14140f, { rz: Math.PI / 2, seg: 8 });
}
function safeBox(b, x, y0, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  lit(b, 0.6, 0.9, 0.5, x, y0 + 0.45, z, EQGRY, { ry: yaw, tint: 0.02 });
  cyl(b, 0.1, 0.06, x + 0.26 * c, y0 + 0.5, z + 0.26 * s, 0x2a2c2a, { rx: Math.PI / 2, ry: yaw, seg: 12 });
}
function plotTable(b, x, y0, z) {
  lit(b, 2.2, 0.85, 1.2, x, y0 + 0.45, z, EQGRY, { tint: 0.02 }); b.box(2.0, 0.06, 1.0, x, y0 + 0.9, z, 0x243018);
  b.box(2.04, 0.04, 1.04, x, y0 + 0.94, z, 0x35502a); // map-glass rim
}
function mnemo(b, x, y0, z, axis) { // illuminated status/mnemonic board
  const ry = axis === 'x' ? Math.PI / 2 : 0;
  b.box(axis === 'z' ? 2.5 : 0.1, 1.5, axis === 'z' ? 0.1 : 2.5, x, y0 + 1.7, z, 0x1a2a1c, { tint: 0.02 });
  for (let i = 0; i < 24; i++) { const gx = -1.0 + (i % 6) * 0.4, gy = -0.5 + Math.floor(i / 6) * 0.35; const col = [CD_RED, AMBER, 0x46ff6e][i % 3];
    b.box(axis === 'z' ? 0.05 : 0.02, 0.05, axis === 'z' ? 0.02 : 0.05, x + (axis === 'z' ? gx : 0.06), y0 + 1.7 + gy, z + (axis === 'z' ? 0.06 : gx), col); }
}
function r140rack(b, x, y0, z, yaw) { // tall khaki valve-radio cabinet w/ meters
  const c = Math.cos(yaw), s = Math.sin(yaw);
  lit(b, 0.6, 1.7, 0.55, x, y0 + 0.9, z, OLIVE, { ry: yaw, tint: 0.02 });
  for (let i = 0; i < 6; i++) { const fy = y0 + 0.6 + (i % 3) * 0.4, fx = -0.15 + Math.floor(i / 3) * 0.3;
    cyl(b, 0.06, 0.04, x + fx * c + 0.28 * s, fy, z + fx * s - 0.28 * c, 0xe8e4d6, { rx: Math.PI / 2, ry: yaw, seg: 10 }); }
  for (let i = 0; i < 4; i++) b.box(0.05, 0.05, 0.04, x + (-0.12 + i * 0.08) * c + 0.28 * s, y0 + 1.4, z + (-0.12 + i * 0.08) * s - 0.28 * c, i % 2 ? AMBER : CD_RED, { ry: yaw }); // dials
}
function teletype(b, x, y0, z, yaw) {
  lit(b, 0.5, 0.5, 0.4, x, y0 + 0.9, z, EQGRY, { ry: yaw, tint: 0.02 }); b.box(0.45, 0.06, 0.3, x, y0 + 1.18, z, 0x1c2226, { ry: yaw, rx: -0.3 });
  b.box(0.5, 0.65, 0.4, x, y0 + 0.32, z, EQGRY.lo, { ry: yaw }); // stand
}
function switchboard(b, x, y0, z, yaw) { // П-193 коммутатор
  lit(b, 0.5, 0.45, 0.36, x, y0 + 0.95, z, OLIVE, { ry: yaw, tint: 0.02, rx: -0.3 });
  for (let i = 0; i < 12; i++) b.box(0.03, 0.03, 0.02, x - 0.18 + (i % 4) * 0.12, y0 + 1.05 + Math.floor(i / 4) * 0.08, z + 0.18, 0x14140f, { ry: yaw }); // jacks
}
function bunk(b, x, y0, z, yaw, tiers = 3) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  for (let t = 0; t < tiers; t++) { const yy = y0 + 0.5 + t * 0.8; const [bx, bz] = at(0, 0); b.box(2.0, 0.1, 0.85, bx, yy, bz, EQGRY.mid, { ry: yaw }); b.box(1.9, 0.13, 0.78, bx, yy + 0.1, bz, 0x6a6258, { ry: yaw }); }
  for (const o of [[-0.95, -0.38], [0.95, -0.38], [-0.95, 0.38], [0.95, 0.38]]) { const [px, pz] = at(o[0], o[1]); const ph = 0.4 + tiers * 0.8; b.box(0.07, ph, 0.07, px, y0 + ph / 2, pz, EQGRY.slot); }
}
function locker(b, x, y0, z, yaw) { lit(b, 0.8, 1.8, 0.5, x, y0 + 0.9, z, EQGRY, { ry: yaw, tint: 0.02 }); b.box(0.04, 1.6, 0.42, x + Math.sin(yaw) * 0.26, y0 + 0.9, z - Math.cos(yaw) * 0.26, EQGRY.slot, { ry: yaw }); }
function messTable(b, x, y0, z) { b.box(1.6, 0.1, 0.8, x, y0 + 0.75, z, WOOD.mid); for (const o of [[-0.7, 0], [0.7, 0]]) b.box(0.4, 0.5, 0.4, x + o[0], y0 + 0.25, z + o[1], WOOD.lo); b.box(0.1, 0.75, 0.1, x, y0 + 0.37, z, WOOD.slot); }
function samovar(b, x, y0, z) { cyl(b, 0.18, 0.4, x, y0 + 0.2, z, 0xb98a3a, { seg: 14, tint: 0.04 }); cyl(b, 0.1, 0.14, x, y0 + 0.46, z, 0xcfa24a, { seg: 12 }); b.box(0.05, 0.06, 0.05, x + 0.2, y0 + 0.2, z, 0x8a6a2a); }
function rifleRack(b, x, y0, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [bx, bz] = at(0, 0); b.box(1.6, 1.9, 0.3, bx, y0 + 0.95, bz, OLIVE.lo, { ry: yaw });
  for (let i = 0; i < 5; i++) { const [rx, rz] = at(-0.6 + i * 0.3, 0.18); b.box(0.06, 1.4, 0.06, rx, y0 + 0.95, rz, 0x2a2620, { ry: yaw }); b.box(0.1, i % 2 ? 0.6 : 0.5, 0.12, rx, y0 + 1.4, rz, RUSTP.lo, { ry: yaw }); }
}
function ammoCrate(b, x, y0, z, yaw) {
  lit(b, 0.7, 0.36, 0.42, x, y0 + 0.18, z, WOOD, { ry: yaw }); b.box(0.72, 0.05, 0.44, x, y0 + 0.37, z, WOOD.lo, { ry: yaw });
  b.box(0.4, 0.12, 0.02, x + 0.22 * Math.sin(yaw), y0 + 0.2, z - 0.22 * Math.cos(yaw), 0xe8e0c8, { ry: yaw });
}
function workbench(b, x, y0, z, yaw) { lit(b, 2.0, 0.85, 0.7, x, y0 + 0.42, z, EQGRY, { ry: yaw, tint: 0.02 }); b.box(2.0, 0.07, 0.7, x, y0 + 0.88, z, WOOD.mid, { ry: yaw }); b.box(0.15, 0.2, 0.15, x + 0.7, y0 + 0.98, z, RUSTP.mid, { ry: yaw }); }
function waterCistern(b, x, y0, z) {
  cyl(b, 0.7, 1.8, x, y0 + 1.1, z, EQGRY.mid, { seg: 16, tint: 0.03 });
  cyl(b, 0.72, 0.12, x, y0 + 2.0, z, EQGRY.hi, { seg: 16 }); cyl(b, 0.72, 0.12, x, y0 + 0.25, z, EQGRY.lo, { seg: 16 });
  b.box(0.06, 1.4, 0.04, x + 0.7, y0 + 1.1, z, 0x9ec4d4); b.box(0.1, 0.1, 0.18, x + 0.7, y0 + 0.4, z, RUSTP.mid); b.box(1.0, 0.2, 1.0, x, y0 + 0.1, z, CONCD.lo);
}
function jerryCans(b, x, y0, z) { for (let i = 0; i < 3; i++) lit(b, 0.18, 0.45, 0.35, x + i * 0.22, y0 + 0.22, z, OLIVE, {}); }
function tinShelf(b, x, y0, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); for (const sy of [0.5, 1.0, 1.5]) { b.box(1.2, 0.05, 0.35, x, y0 + sy, z, EQGRY.lo, { ry: yaw }); for (let i = 0; i < 5; i++) b.box(0.14, 0.16, 0.14, x + (-0.45 + i * 0.22) * c, y0 + sy + 0.12, z + (-0.45 + i * 0.22) * s, [0x8a6a2a, 0x6a7a4a, 0x7a4a3a][i % 3]); } }
function examCouch(b, x, y0, z, yaw) {
  b.box(1.9, 0.12, 0.6, x, y0 + 0.6, z, 0x5a3a2a, { ry: yaw }); b.box(1.9, 0.5, 0.55, x, y0 + 0.3, z, WHITEN.lo, { ry: yaw });
  b.box(0.5, 0.16, 0.6, x - 0.7 * Math.cos(yaw), y0 + 0.74, z - 0.7 * Math.sin(yaw), 0x6a4636, { ry: yaw });
}
function instrumentCab(b, x, y0, z, yaw) { lit(b, 0.8, 1.7, 0.4, x, y0 + 0.9, z, WHITEN, { ry: yaw, tint: 0.02 }); b.box(0.62, 0.9, 0.05, x + Math.sin(yaw) * 0.21, y0 + 1.25, z - Math.cos(yaw) * 0.21, 0x9fb8c4, { ry: yaw }); }
function o2bottle(b, x, y0, z) { cyl(b, 0.1, 1.3, x, y0 + 0.65, z, O2BLUE, { seg: 12, tint: 0.04 }); cyl(b, 0.05, 0.12, x, y0 + 1.35, z, EQGRY.mid, { seg: 8 }); }
function toiletStall(b, x, y0, z) { for (const o of [-0.6, 0.6]) b.box(0.05, 1.5, 1.1, x + o, y0 + 0.75, z, CREAM.lo); b.box(1.15, 1.5, 0.05, x, y0 + 0.75, z - 0.55, CREAM.lo); b.box(0.4, 0.4, 0.4, x, y0 + 0.2, z - 0.2, WHITEN.mid); }
function washTrough(b, x, y0, z, yaw) { b.box(1.6, 0.25, 0.4, x, y0 + 0.85, z, WHITEN.mid, { ry: yaw }); for (let i = 0; i < 3; i++) b.box(0.06, 0.12, 0.06, x - 0.5 + i * 0.5, y0 + 1.0, z - 0.12 * Math.cos(yaw), EQGRY.hi, { ry: yaw }); }
function firePoint(b, x, y0, z, yaw) { // пожарный щит + extinguisher + sand box
  const c = Math.cos(yaw), s = Math.sin(yaw);
  b.box(1.1, 0.9, 0.08, x, y0 + 1.4, z, CD_RED, { ry: yaw }); b.box(0.7, 0.06, 0.04, x, y0 + 1.5, z + 0.06 * s, 0x14110e, { ry: yaw, rz: 0.5 }); // axe handle
  cyl(b, 0.12, 0.5, x + 0.6 * c, y0 + 0.25, z + 0.6 * s, 0xb81818, { seg: 12 }); // extinguisher
  b.box(0.6, 0.4, 0.4, x - 0.7 * c, y0 + 0.2, z - 0.7 * s, HAZ_Y, { ry: yaw }); // sand box
}
function periscope(b, x, y0, z) { cyl(b, 0.1, 1.4, x, y0 + 0.7, z, EQGRY.mid, { seg: 10, tint: 0.03 }); b.box(0.2, 0.16, 0.3, x, y0 + 1.4, z, EQGRY.lo); b.box(0.06, 0.3, 0.06, x + 0.16, y0 + 1.0, z, 0x14140f); }
// ГП-5 gas mask hung on a wall peg (facepiece + 2 eyepieces + corrugated hose + filter can) — facing +Z
function gp5Mask(b, x, y, z) {
  b.box(0.05, 0.04, 0.05, x, y + 0.26, z - 0.02, EQGRY.slot);                 // peg
  b.box(0.2, 0.24, 0.13, x, y, z, 0x6b6f63, { tint: 0.03 });                  // grey-green facepiece
  for (const e of [-0.05, 0.05]) cyl(b, 0.035, 0.03, x + e, y + 0.03, z + 0.07, 0x1c1e1a, { rx: Math.PI / 2, seg: 10 }); // round eyepieces
  cyl(b, 0.022, 0.16, x + 0.02, y - 0.18, z + 0.02, 0x3a3a30, { seg: 6, tint: 0.04 }); // corrugated hose
  cyl(b, 0.05, 0.1, x + 0.04, y - 0.3, z + 0.02, OLIVE.lo, { seg: 10 });      // filter can
}
function suitHook(b, x, y, z, tan) { // ОЗК (tan) / Л-1 (olive) protective suit hung + boots below
  b.box(0.05, 0.04, 0.05, x, y + 0.62, z - 0.02, EQGRY.slot);
  b.box(0.4, 1.2, 0.14, x, y, z, tan ? 0x8a6a3a : 0x3f4a2a, { tint: 0.04 });
  for (const o of [-0.1, 0.1]) b.box(0.14, 0.22, 0.18, x + o, y - 0.72, z + 0.02, tan ? 0x5a4426 : 0x2a3020); // boots
}
function dosimeter(b, x, y, z) { // ДП-5 dosimeter board on the wall (khaki box + dial + wand on a coil)
  b.box(0.5, 0.4, 0.1, x, y, z, EQGRY.mid, { tint: 0.02 });
  cyl(b, 0.1, 0.04, x - 0.08, y + 0.05, z + 0.06, 0xe8e4d6, { rx: Math.PI / 2, seg: 12 }); // dial
  b.box(0.06, 0.28, 0.06, x + 0.16, y - 0.05, z + 0.06, OLIVE.lo); // wand
}
function bootRack(b, x, y0, z, yaw) { for (const sy of [0.4, 1.0, 1.5]) b.box(1.2, 0.05, 0.4, x, y0 + sy, z, EQGRY.lo, { ry: yaw }); b.box(0.06, 1.5, 0.4, x + Math.sin(yaw) * 0.58, y0 + 0.75, z - Math.cos(yaw) * 0.58, EQGRY.slot, { ry: yaw }); }
function duValve(b, x, y, z) { cyl(b, 0.1, 0.5, x, y, z, PIPEG.mid, { rx: Math.PI / 2, seg: 10 }); cyl(b, 0.16, 0.05, x, y, z + 0.28, CD_RED, { rx: Math.PI / 2, seg: 12 }); } // red butterfly valve on a pipe stub
function prefilterDrum(b, x, y0, z) { cyl(b, 0.45, 1.6, x, y0 + 1.1, z, OLIVE.mid, { seg: 14, tint: 0.03 }); cyl(b, 0.47, 0.12, x, y0 + 1.9, z, OLIVE.hi, { seg: 14 }); cyl(b, 0.1, 0.3, x, y0 + 2.05, z, PIPEG.mid, { seg: 8 }); b.box(1.0, 0.3, 1.0, x, y0 + 0.16, z, EQGRY.lo); } // ПФП-1000
function clocks(b, x, y, z) { for (let k = 0; k < 3; k++) { const cx = x - 1.0 + k * 1.0; cyl(b, 0.2, 0.06, cx, y, z, 0xe8e4d6, { rx: Math.PI / 2, seg: 14 }); cyl(b, 0.21, 0.04, cx, y, z - 0.01, EQGRY.slot, { rx: Math.PI / 2, seg: 14 }); b.box(0.02, 0.13, 0.02, cx, y, z + 0.07, 0x1a1a1a); } } // 3 wall clocks
function zasCab(b, x, y0, z, yaw) { lit(b, 0.6, 1.8, 0.5, x, y0 + 0.9, z, EQGRY, { ry: yaw, tint: 0.02 }); b.box(0.3, 0.14, 0.04, x + Math.sin(yaw) * 0.26, y0 + 1.4, z - Math.cos(yaw) * 0.26, CD_RED, { ry: yaw }); for (let i = 0; i < 3; i++) b.box(0.05, 0.05, 0.04, x + (-0.1 + i * 0.1) * Math.cos(yaw), y0 + 1.0, z + (-0.1 + i * 0.1) * Math.sin(yaw), AMBER, { ry: yaw }); } // ЗАС cipher cabinet w/ red plate
function oilDrum(b, x, y0, z) { cyl(b, 0.29, 0.88, x, y0 + 0.44, z, RUSTP.mid, { seg: 14, tint: 0.04 }); cyl(b, 0.3, 0.08, x, y0 + 0.84, z, RUSTP.lo, { seg: 14 }); cyl(b, 0.3, 0.08, x, y0 + 0.06, z, RUSTP.lo, { seg: 14 }); b.box(0.5, 0.04, 0.04, x, y0 + 0.45, z, 0x14110e); } // 200 L drum
function batteryBank(b, x, y0, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); for (let t = 0; t < 2; t++) for (let i = 0; i < 4; i++) { const lx = -0.5 + i * 0.33; b.box(0.25, 0.2, 0.18, x + lx * c, y0 + 0.35 + t * 0.45, z + lx * s, 0x18181a, { ry: yaw }); b.box(0.04, 0.05, 0.04, x + lx * c, y0 + 0.47 + t * 0.45, z + lx * s, CD_RED, { ry: yaw }); } b.box(1.5, 0.06, 0.5, x, y0 + 0.24, z, EQGRY.slot, { ry: yaw }); } // starter-battery rack
function stretcher(b, x, y0, z, yaw) { const c = Math.cos(yaw), s = Math.sin(yaw); for (const o of [-0.22, 0.22]) b.box(2.0, 0.05, 0.05, x, y0 + 0.7 + o * 0, z + o, 0x6a4a2a, { ry: yaw }); b.box(1.9, 0.04, 0.45, x, y0 + 0.72, z, 0x5a6a4a, { ry: yaw }); for (const o of [[-0.85, 0], [0.85, 0]]) b.box(0.06, 0.7, 0.06, x + o[0] * c, y0 + 0.35, z + o[0] * s, 0x4a3420, { ry: yaw }); } // canvas stretcher on trestles
function aidKit(b, x, y, z) { b.box(0.4, 0.4, 0.06, x, y, z, 0xe8e0d0); b.box(0.16, 0.05, 0.07, x, y, z + 0.02, CD_RED); b.box(0.05, 0.16, 0.07, x, y, z + 0.02, CD_RED); } // red-cross board
function sink(b, x, y, z, yaw) { b.box(0.5, 0.16, 0.4, x, y, z, WHITEN.mid, { ry: yaw }); b.box(0.4, 0.1, 0.3, x, y + 0.04, z, WHITEN.lo, { ry: yaw }); b.box(0.05, 0.18, 0.05, x, y + 0.18, z - 0.12 * Math.cos(yaw), EQGRY.hi, { ry: yaw }); } // wall basin + tap
function morseKey(b, x, y, z) { b.box(0.12, 0.03, 0.08, x, y, z, 0x1a1a1a); cyl(b, 0.025, 0.05, x, y + 0.04, z, 0xcfa24a, { seg: 8 }); } // brass Morse key
function patchPanel(b, x, y, z, yaw) { b.box(0.8, 1.0, 0.08, x, y, z, EQGRY.lo, { ry: yaw }); for (let i = 0; i < 20; i++) b.box(0.03, 0.03, 0.03, x + (-0.3 + (i % 5) * 0.15) * Math.cos(yaw), y + 0.3 - Math.floor(i / 5) * 0.18, z + (-0.3 + (i % 5) * 0.15) * Math.sin(yaw) + 0.05, 0x14140f, { ry: yaw }); } // jack field
function lenUgolok(world, b, x, y, z, ry) { signPlane(world, '', x, y, z, 0.9, 0.7, ry, { panel: '#8a1414', border: '#c9a23a' }); } // ленинский уголок red board

// command map board / banner / portrait (kept), takes wall world y.
function commandWall(world, b, x, y, z) {
  signPlane(world, '', x, y, z + 0.05, 3.4, 2.0, 0, { panel: '#243018', border: '#7c6a2e', color: '#7da06a', size: 10 });
  for (let i = 0; i < 4; i++) b.box(2.8, 0.03, 0.04, x, y + 0.6 - i * 0.35, z + 0.06, 0xd0b85a);
}
function console_(b, x, y0, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [bx, bz] = at(0, 0); lit(b, 1.4, 1.5, 0.7, bx, y0 + 0.75, bz, EQGRY, { ry: yaw, tint: 0.02 });
  const [px, pz] = at(0, 0.36); b.box(1.2, 0.5, 0.06, px, y0 + 1.15, pz, 0x1c2226, { ry: yaw });
  for (let i = 0; i < 8; i++) { const [lx, lz] = at(-0.5 + (i % 4) * 0.33, 0.4); b.box(0.06, 0.06, 0.04, lx, y0 + 1.3 - Math.floor(i / 4) * 0.18, lz, i % 3 ? AMBER : CD_RED, { ry: yaw }); }
  const [sx, sz] = at(0, 0.34); b.box(1.1, 0.18, 0.18, sx, y0 + 0.95, sz, EQGRY.lo, { ry: yaw, rx: -0.5 });
}

// ====================================================================
// KURGAN / КУРГАН — impassable tiered earth mound over the buried shell (smoother than a ziggurat).
// ====================================================================
function kurgan(world, BX, BZ) {
  const bb = world._bb;
  const pal = (g) => (g ? { hi: GRASS, mid: GRASS2, lo: EARTH, slot: 0x463a26 } : { hi: GRASS2, mid: EARTH, lo: 0x5a4a30, slot: 0x463a26 });
  // Overlapping rings (each taller than its y-slice → no visible tread) read as a continuous grassy
  // mound, not a ziggurat. Grass-dominant (earth only at the foot). Collider per ring (impassable).
  const RINGS = 14, topY = CROWNY;
  for (let i = 0; i < RINGS; i++) {
    const t = i / RINGS, cy = (i + 0.5) / RINGS * topY, h = (topY / RINGS) * 1.9;
    const ex = (1 - t) * 9, hx = SHX + ex, hz = SHZ + ex, bw = 1.2 + ex * 0.22;
    const p = i > 2 ? { hi: GRASS, mid: GRASS2, lo: 0x4a5526, slot: 0x3a4420 } : { hi: GRASS2, mid: EARTH, lo: 0x5a4a30, slot: 0x463a26 };
    const cy1 = Math.min(cy + h / 2, topY); // collider top clamped to the crown
    const tn = 0.04 + (i % 3) * 0.03; // subtle per-ring tint variation (no hard Hi/Lo banding = reads as a mound)
    const earthX = (zc, gx, gw) => {
      for (const [a0, a1] of [[-hx, gx - gw], [gx + gw, hx]]) { const w = a1 - a0; if (w < 0.4) continue; const xc = BX + (a0 + a1) / 2; bb.box(w, h, bw, xc, cy, zc, p.mid, { tint: tn }); collider(world, xc, zc, w / 2, 0, cy1, bw / 2); }
    };
    earthX(BZ - hz, -8, 2.0); // S slope — 4 m gap at x=-8 for the crown approach
    earthX(BZ + hz, 0, 1.3);  // N slope — 2.6 m gap at x=0 for the base postern tunnel
    for (const sgnX of [-1, 1]) { const xc = BX + sgnX * hx; bb.box(bw, h, hz * 2, xc, cy, BZ, p.mid, { tint: tn }); collider(world, xc, BZ, bw / 2, 0, cy1, hz); } // E/W solid
  }
  // (no earth dome cap — the crown is a hardened R/C concrete cap, per Object 1180; structures sit on it)
  for (const [ax, sgn, len] of [['z', -1, SHX + 9], ['z', 1, SHX + 9], ['x', -1, SHZ + 9], ['x', 1, SHZ + 9]]) {
    if (ax === 'z') bb.box(len * 2, 0.6, 0.5, BX, 0.3, BZ + sgn * (SHZ + 9), CONC.lo, { tint: 0.03 });
    else bb.box(0.5, 0.6, len * 2, BX + sgn * (SHX + 9), 0.3, BZ, CONC.lo, { tint: 0.03 });
  }
  for (const [dx, dz, ry] of [[-SHX - 4, -2, 0.2], [SHX + 3, 5, -0.3], [-4, SHZ + 4, 0.1], [5, -SHZ - 4, -0.2]]) lit(bb, 1.8, 1.1, 1.0, BX + dx, 0.6, BZ + dz, CONC, { tint: 0.04, ry });
}

// ====================================================================
//  ENTRY
// ====================================================================
export function buildSecretBunker(world, BX, BZ) {
  const rng = makeRNG(0x0B17);
  const CUT = (() => { try { return new URLSearchParams(location.search).get('cut') === '1'; } catch (e) { return false; } })();
  installDoorSystem(world);
  world._doors = world._doors || []; world._ladders = world._ladders || [];
  const b = new MeshBuilder();           // interior + structure (one merged mesh)
  world._bb = new MeshBuilder();          // kurgan earth (separate mesh)

  // local→world closures
  const S = (w, h, d, lx, ly, lz, color, opts) => world._solid(b, w, h, d, BX + lx, ly, BZ + lz, color, opts); // collidable
  const M = (w, h, d, lx, ly, lz, color, opts) => b.box(w, h, d, BX + lx, ly, BZ + lz, color, opts);            // visual only
  const WALL = (lx, lz, len, h, baseY, axis, color, door) => world._wall(b, BX + lx, BZ + lz, len, h, baseY, axis, color, door);
  const STAIR = (lx, lz, dx, dz, n, color, baseY, h, go, w) => world._stairs(b, BX + lx, BZ + lz, dx, dz, n, color, baseY, h, go, w);
  const D = { width: 1.3, height: 2.1 };

  // ---- floor tiler: big slabs around rectangular holes (few colliders) ----
  const tileFloor = (yTop, col, holes) => {
    const t = SLAB, yc = yTop - t / 2;
    const zs = [-SHZ, SHZ]; for (const h of holes) zs.push(h.z0, h.z1);
    const uz = [...new Set(zs)].sort((a, c) => a - c);
    for (let i = 0; i < uz.length - 1; i++) {
      const z0 = uz[i], z1 = uz[i + 1], zc = (z0 + z1) / 2, zd = z1 - z0; if (zd < 0.05) continue;
      const xs = [-SHX, SHX]; for (const h of holes) if (h.z0 < z1 - 0.01 && h.z1 > z0 + 0.01) xs.push(h.x0, h.x1);
      const ux = [...new Set(xs)].sort((a, c) => a - c);
      for (let j = 0; j < ux.length - 1; j++) {
        const x0 = ux[j], x1 = ux[j + 1], xc = (x0 + x1) / 2, xd = x1 - x0; if (xd < 0.05) continue;
        let inHole = false; for (const h of holes) if (xc > h.x0 && xc < h.x1 && zc > h.z0 && zc < h.z1) { inHole = true; break; }
        if (inHole) continue;
        S(xd + 0.02, t, zd + 0.02, xc, yc, zc, col, { tint: 0.03 });
      }
    }
  };

  // ---- SHELL: 4 perimeter walls full height (flush with the crown cap — no parapet) ----
  const WALLTOP = CROWNY;
  WALL(0, -SHZ, SHX * 2 + T, WALLTOP, 0, 'x', CONCW.mid);                              // S wall (solid; approach is over the berm to the crown)
  WALL(0, SHZ, SHX * 2 + T, WALLTOP, 0, 'x', CONCW.mid, { width: 1.6, height: 2.3 }); // N wall — base-postern gap
  WALL(-SHX, 0, SHZ * 2 + T, WALLTOP, 0, 'z', CONCW.mid);                             // W wall
  WALL(SHX, 0, SHZ * 2 + T, WALLTOP, 0, 'z', CONCW.mid);                              // E wall

  // ---- holes for the floors (stair lanes alternate W/E; shaft constant) ----
  const lh = { x0: SHAFTX - 1.0, x1: SHAFTX + 1.0, z0: SHAFTZ - 1.0, z1: SHAFTZ + 1.0 }; // ladder shaft
  const wlh = { x0: WLANE - ST_W / 2 - 0.2, x1: WLANE + ST_W / 2 + 0.2, z0: -3.6, z1: 1.8 }; // W stair lane
  const elh = { x0: ELANE - ST_W / 2 - 0.2, x1: ELANE + ST_W / 2 + 0.2, z0: -3.6, z1: 1.8 }; // E stair lane
  const tlh = { x0: 5.0, x1: 6.6, z0: -0.9, z1: 0.9 }; // НП-tower ladder hole through the crown cap
  // L0 floor: lino slab over the whole interior
  S(SHX * 2, 0.12, SHZ * 2, 0, 0.0, 0.06, LINO.mid, { tint: 0.04 });
  tileFloor(L1Y, CONCD.mid, [wlh, lh]);
  tileFloor(L2Y, CONCD.mid, [elh, lh]);
  if (!CUT) tileFloor(CROWNY, CONCD.lo, [wlh, lh, tlh]);

  // ---- stairwell flights (alternating lanes) + lane divider wall ----
  STAIR(WLANE, -3.3, 0, 1, ST_N, CONCD.hi, L0Y, ST_RISE, ST_GO, ST_W);
  STAIR(ELANE, -3.3, 0, 1, ST_N, CONCD.hi, L1Y, ST_RISE, ST_GO, ST_W);
  if (!CUT) STAIR(WLANE, -3.3, 0, 1, ST_N, CONCD.hi, L2Y, ST_RISE, ST_GO, ST_W);
  S(0.3, WALLTOP, 6.2, (WLANE + ELANE) / 2, WALLTOP / 2, -0.7, CONCW.lo, { tint: 0.04 }); // lane divider

  // ---- escape ladder shaft (СКОБ-ТРАП) in the E room, L0 → crown оголовок ----
  skobTrap(b, world, BX + SHAFTX - 0.55, BZ + SHAFTZ, L0Y, CROWNY + 1.4, '+x');
  S(0.3, WALLTOP, 2.4, SHAFTX + 1.0, WALLTOP / 2, SHAFTZ, CONCD.mid, { tint: 0.04 }); // shaft E
  S(2.4, WALLTOP, 0.3, SHAFTX, WALLTOP / 2, SHAFTZ - 1.0, CONCD.mid, { tint: 0.04 });  // shaft S
  S(2.4, WALLTOP, 0.3, SHAFTX, WALLTOP / 2, SHAFTZ + 1.0, CONCD.mid, { tint: 0.04 });  // shaft N

  // ====== per-level interior: central room (±5) + pinwheel perimeter rooms; W strip = stair hall ======
  // walls identical every level (they stack like a real building); furniture/signs differ.
  const buildLevel = (baseY) => {
    const col = CONCW.mid;
    // central room (x±5, z±5), doors on all four sides → opens to the ring (no dead-end corridor)
    WALL(0, -5, 10 + PT, CHc, baseY, 'x', col, D); WALL(0, 5, 10 + PT, CHc, baseY, 'x', col, D);
    WALL(-5, 0, 10 + PT, CHc, baseY, 'z', col, D); WALL(5, 0, 10 + PT, CHc, baseY, 'z', col, D);
    // pinwheel perimeter inner walls (extend +PT past the corner to seal):
    // N room inner (z=7) — TWO ring doors (no dead-end): split [-13,-3] + [-3,7]
    WALL(-8, 7, 10 + PT, CHc, baseY, 'x', col, { width: 1.3, height: 2.1 }); WALL(2, 7, 10 + PT, CHc, baseY, 'x', col, { width: 1.3, height: 2.1 });
    // S room inner (z=-7) — TWO ring doors: split [-7,3] + [3,13]
    WALL(-2, -7, 10 + PT, CHc, baseY, 'x', col, { width: 1.3, height: 2.1 }); WALL(8, -7, 10 + PT, CHc, baseY, 'x', col, { width: 1.3, height: 2.1 });
    WALL(7, -1.75, 17.5 + PT, CHc, baseY, 'z', col, { width: 1.3, height: 2.1, offset: 1.75 }); // E room inner (x=7) — door + escape ladder = 2 exits
    WALL(-7, 1.75, 17.5 + PT, CHc, baseY, 'z', col, { width: 1.3, height: 2.1, offset: -1.75 }); // W hall inner (x=-7) — door + stairwell
    // ceiling dressing height marker handled by slabs above; add a teal dado + cream upper on central room walls
    const dadoH = 1.2;
    for (const [zc] of [[-5 + 0.33], [5 - 0.33]]) { b.box(10, dadoH, 0.05, BX, baseY + dadoH / 2 + 0.1, BZ + zc, DADO.mid, { tint: 0.03 }); b.box(10, 0.08, 0.06, BX, baseY + dadoH + 0.1, BZ + zc, DADO.hi); }
    for (const [xc] of [[-5 + 0.33], [5 - 0.33]]) { b.box(0.05, dadoH, 10, BX + xc, baseY + dadoH / 2 + 0.1, BZ, DADO.mid, { tint: 0.03 }); }
  };
  for (const y of LEVELS) buildLevel(y);

  // ====== base postern tunnel through the N berm (grade) + гермодверь ======
  S(0.5, 2.6, 9.0, -1.5, 1.3, SHZ + 5.0, CONC.mid, { tint: 0.03 }); S(0.5, 2.6, 9.0, 1.5, 1.3, SHZ + 5.0, CONC.mid, { tint: 0.03 });
  S(3.5, 0.5, 9.0, 0, 2.55, SHZ + 5.0, CONC.lo, { tint: 0.03 });
  registerDoor(world, BX, BZ + SHZ, L0Y, 'z', 1.5, 2.3, -1, 1, 'ЗАПАСНЫЙ ВХОД'); // N wall runs along X → 'z'

  // ====== CROWN blockhouse + airlock + crown→L2 stair, НП tower, surface tells, kurgan ======
  if (!CUT) {
    // crown blockhouse over the W hall; entrance on its S face. Walls + roof.
    const bhx0 = -13, bhx1 = -3, bhz0 = -6, bhz1 = 4, bhh = 3.4, bcx = (bhx0 + bhx1) / 2, bcz = (bhz0 + bhz1) / 2;
    WALL(bcx, bhz0, bhx1 - bhx0 + T, bhh, CROWNY, 'x', CONC.mid, { width: 1.6, height: 2.3 }); // S entrance
    WALL(bcx, bhz1, bhx1 - bhx0 + T, bhh, CROWNY, 'x', CONC.mid);
    WALL(bhx0, bcz, bhz1 - bhz0 + T, bhh, CROWNY, 'z', CONC.mid); WALL(bhx1, bcz, bhz1 - bhz0 + T, bhh, CROWNY, 'z', CONC.mid);
    S(bhx1 - bhx0 + T, 0.5, bhz1 - bhz0 + T, bcx, CROWNY + bhh + 0.25, bcz, CONC.lo, { tint: 0.03 }); // roof
    // airlock inner wall (тамбур-шлюз) at z=-4, S of the stairwell descent hole, with a гермодверь
    WALL(bcx, -4, bhx1 - bhx0 + T, bhh, CROWNY, 'x', CONC.mid, { width: 1.3, height: 2.3 });
    registerDoor(world, BX + bcx, BZ + bhz0, CROWNY, 'z', 1.6, 2.3, -1, -1, 'ВХОД');   // outer гермодверь (X-running wall → 'z')
    registerDoor(world, BX + bcx, BZ - 4, CROWNY, 'z', 1.3, 2.3, 1, 1, 'ШЛЮЗ');        // inner airlock door
    // stepped approach up the S kurgan slope (x=-8 gap) to the crown roof edge (climbs to y=CROWNY)
    STAIR(bcx, -(SHZ + 9.7), 0, 1, 18, CONC.mid, 0, 0.6, 0.5, 3.4); // ends z≈-(SHZ+0.7) at y=CROWNY, flush with the roof

    // ---- НП FIRING TOWER on the crown (E end) — hollow shaft, ladder from L2 to the platform ----
    const tcx = 7.5, tcz = 0, thx = 2.4;
    // base shaft walls (crown→platform), hollow, enclosing the ladder; ladder rises from L2 through the crown hole
    const tmid = (CROWNY + TOWY) / 2, tbh = TOWY - CROWNY;
    S(thx * 2 + 0.5, tbh, 0.5, tcx, tmid, tcz + thx, CONC.mid, { tint: 0.03 }); S(thx * 2 + 0.5, tbh, 0.5, tcx, tmid, tcz - thx, CONC.mid, { tint: 0.03 });
    S(0.5, tbh, thx * 2, tcx + thx, tmid, tcz, CONC.mid, { tint: 0.03 }); S(0.5, tbh, thx * 2, tcx - thx, tmid, tcz, CONC.mid, { tint: 0.03 });
    skobTrap(b, world, BX + tcx - thx + 0.7, BZ + tcz, L2Y, TOWY + 0.6, '-z'); // continuous ladder L2 → platform
    // firing platform floor (ladder hole on the W side)
    tileFloorTower(S, tcx, tcz, thx, TOWY, { x0: tcx - thx + 0.2, x1: tcx - thx + 1.6, z0: tcz - 0.9, z1: tcz + 0.9 });
    // firing room walls: embrasures on N/S/E, solid W (ladder side)
    embrasure(b, BX + tcx, BZ + tcz, thx, TOWY, TOWTOP, '+z');
    embrasure(b, BX + tcx, BZ + tcz, thx, TOWY, TOWTOP, '-z');
    embrasure(b, BX + tcx, BZ + tcz, thx, TOWY, TOWTOP, '+x');
    S(thx * 2 + 0.5, TOWTOP - TOWY, 0.5, tcx, (TOWY + TOWTOP) / 2, tcz - thx, CONC.mid, { tint: 0.03 }); // W wall solid
    S(thx * 2 + 0.6, 0.5, thx * 2 + 0.6, tcx, TOWTOP + 0.25, tcz, CONC.lo, { tint: 0.03 }); // roof
    cupola(world._bb, BX + tcx, TOWTOP + 0.55, BZ + tcz);
    // firing step + ammo ready-boxes + periscope
    M(thx * 2 - 0.6, 0.4, 0.55, tcx, TOWY + 0.2, tcz + thx - 0.55, CONCD.mid); // N firing step
    M(0.55, 0.4, thx * 2 - 0.6, tcx + thx - 0.55, TOWY + 0.2, tcz, CONCD.mid); // E firing step
    ammoCrate(b, BX + tcx + 0.6, TOWY, BZ + tcz + thx - 0.7, 0); periscope(b, BX + tcx - 1.2, TOWY, BZ + tcz + 1.2);

    // crown surface tells
    mushroom(world._bb, BX - 4.5, CROWNY + 0.1, BZ - 3.0); mushroom(world._bb, BX - 4.5, CROWNY + 0.1, BZ - 0.6);
    ogolovok(world._bb, BX + SHAFTX, CROWNY + 0.1, BZ + SHAFTZ);
    antenna(world._bb, BX + 3, BZ + 6, CROWNY, 11);
    kurgan(world, BX, BZ);
  }

  // ====== FURNITURE (per level, per room) ======
  // ---------- L0 DEEPEST: command core ----------
  console_(b, BX - 3.0, L0Y, BZ + 3.6, Math.PI); console_(b, BX, L0Y, BZ + 3.6, Math.PI); console_(b, BX + 3.0, L0Y, BZ + 3.6, Math.PI);
  plotTable(b, BX, L0Y, BZ - 0.2); ta57(b, BX - 0.7, L0Y + 0.9, BZ - 0.2, false); ta57(b, BX + 0.7, L0Y + 0.9, BZ - 0.2, true);
  commandWall(world, b, BX, L0Y + 2.0, BZ + 4.7);                          // map board on central N wall
  clocks(b, BX, L0Y + 2.86, BZ + 4.62);                                    // 3 Moscow-time clocks above the map
  mnemo(b, BX - 4.66, L0Y, BZ, 'z');                                       // мнемощит on central W wall
  // command-room COVER (mid-floor island console + document safe) so the 4-door crossfire is breakable
  console_(b, BX - 2.6, L0Y, BZ - 2.6, -0.4); safeBox(b, BX + 3.0, L0Y, BZ - 2.6, Math.PI / 2);
  switchgear(b, BX + 8.5, L0Y, BZ - 9.0, 'x');                            // S room switchroom (outer wall)
  workbench(b, BX - 3.0, L0Y, BZ + 9.0, 0); workbench(b, BX + 3.0, L0Y, BZ + 9.0, 0); // N room planning desks
  // E room (ЗАС cipher near the ladder): cipher cabinet + teletype + locker
  zasCab(b, BX + 12.4, L0Y, BZ + 3.0, -Math.PI / 2); teletype(b, BX + 10.6, L0Y, BZ + 3.0, -Math.PI / 2); locker(b, BX + 12.5, L0Y, BZ + 5.2, -Math.PI / 2);
  // ---------- L1 MIDDLE: living / sustain / signals ----------
  // N room = кубрик: triple bunks + lockers + mess + samovar
  bunk(b, BX - 4.5, L1Y, BZ + 9.0, 0); bunk(b, BX - 1.5, L1Y, BZ + 9.0, 0); bunk(b, BX + 1.5, L1Y, BZ + 9.0, 0);
  messTable(b, BX + 4.0, L1Y, BZ + 8.6); samovar(b, BX + 5.4, L1Y + 0.75, BZ + 8.6); locker(b, BX - 6.0, L1Y, BZ + 9.4, 0);
  // E room (N part) = узел связи: Р-140 racks + switchboard + teletype
  r140rack(b, BX + 11.6, L1Y, BZ + 5.5, -Math.PI / 2); r140rack(b, BX + 11.6, L1Y, BZ + 4.2, -Math.PI / 2);
  switchboard(b, BX + 10.5, L1Y, BZ + 6.2, Math.PI); teletype(b, BX + 9.0, L1Y, BZ + 5.8, 0);
  morseKey(b, BX + 9.0, L1Y + 0.95, BZ + 5.55); patchPanel(b, BX + 12.5, L1Y + 1.4, BZ + 3.2, -Math.PI / 2);
  // S room = санчасть: couch + instrument cabinet + O2 + meds + stretcher + aid board + sink
  examCouch(b, BX - 3.0, L1Y, BZ - 9.0, 0); instrumentCab(b, BX - 6.0, L1Y, BZ - 9.4, 0); o2bottle(b, BX - 0.5, L1Y, BZ - 9.6); tinShelf(b, BX + 2.0, L1Y, BZ - 9.6, 0);
  stretcher(b, BX + 4.0, L1Y, BZ - 9.3, Math.PI / 2); aidKit(b, BX - 8.0, L1Y + 1.6, BZ - 10.06); sink(b, BX + 5.6, L1Y + 0.85, BZ - 10.0, Math.PI);
  // central (mess/common) + W hall storage
  messTable(b, BX, L1Y, BZ); tinShelf(b, BX - 4.4, L1Y, BZ + 2.0, Math.PI / 2);
  // armory items (S-E): rifle racks + crates + bench  (E room S part, near ladder)
  rifleRack(b, BX + 11.5, L1Y, BZ - 5.5, -Math.PI / 2); workbench(b, BX + 9.5, L1Y, BZ - 6.0, 0); ammoCrate(b, BX + 8.5, L1Y, BZ - 4.4, 0); ammoCrate(b, BX + 9.3, L1Y, BZ - 4.4, 0);
  // ---------- L2 UPPER: entry / NBC ----------
  genset(b, BX + 9.0, L2Y, BZ + 7.0, Math.PI);                            // E room = ДЭС diesel (outer wall)
  switchgear(b, BX + 11.6, L2Y, BZ + 3.5, 'z'); jerryCans(b, BX + 9.5, L2Y, BZ + 4.2);
  oilDrum(b, BX + 12.4, L2Y, BZ + 9.2); oilDrum(b, BX + 11.7, L2Y, BZ + 9.3); batteryBank(b, BX + 7.6, L2Y, BZ + 9.4, 0); // diesel oil drums + starter batteries
  filterBank(b, BX - 11.6, L2Y, BZ + 8.7); prefilterDrum(b, BX - 12.2, L2Y, BZ + 5.6); ervFan(b, BX - 8.2, L2Y, BZ + 8.7); ductRun(b, BX - 12.4, L2Y, BZ + 7.0, CHc); manometerBoard(b, BX - 6.4, L2Y, BZ + 7.5, 'z'); // NW room = ФВУ
  // central тамбур-шлюз (decon airlock): ГП-5 masks + ОЗК/Л-1 suits + ДП-5 dosimeter + boot rack + foot-bath + ДУ valve
  for (let i = 0; i < 5; i++) gp5Mask(b, BX - 2.2 + i * 0.55, L2Y + 1.55, BZ - 4.62);
  suitHook(b, BX + 1.6, L2Y + 1.55, BZ - 4.6, true); suitHook(b, BX + 2.4, L2Y + 1.55, BZ - 4.6, false);
  dosimeter(b, BX - 3.4, L2Y + 1.4, BZ - 4.62); bootRack(b, BX + 4.4, L2Y, BZ - 2.0, -Math.PI / 2); duValve(b, BX + 4.5, L2Y + 1.0, BZ + 1.5);
  b.box(0.9, 0.12, 0.6, BX + 2.0, L2Y + 0.08, BZ, 0x2a3036); // decon foot-bath (flush in the floor)
  o2bottle(b, BX + 8.5, L2Y, BZ - 9.0); o2bottle(b, BX + 9.0, L2Y, BZ - 9.0); // S room = баллонная cylinders
  tinShelf(b, BX - 8.0, L2Y, BZ - 9.4, 0); // S/SW store
  // store + water on L1 W hall north end
  waterCistern(b, BX - 11.5, L1Y, BZ + 6.0); jerryCans(b, BX - 12.2, L1Y, BZ + 4.0);
  // latrine bits on L1 W hall south end
  toiletStall(b, BX - 11.6, L1Y, BZ - 6.0); washTrough(b, BX - 12.2, L1Y, BZ - 8.0, Math.PI / 2);
  // ---- extra clutter (ultra-detail) so no room reads empty ----
  for (const sx of [-0.9, 0.9]) for (const sz of [-0.9, 0.9]) b.box(0.34, 0.45, 0.34, BX + sx, L0Y + 0.22, BZ - 0.2 + sz, EQGRY.lo); // 4 stools around the command plot table
  locker(b, BX - 12.4, L0Y, BZ + 8.0, Math.PI / 2); tinShelf(b, BX + 3.0, L0Y, BZ + 9.4, 0);    // L0 N planning annex
  locker(b, BX - 12.4, L0Y, BZ - 8.0, Math.PI / 2); ammoCrate(b, BX - 8.5, L0Y, BZ - 9.0, 0);    // L0 S switchroom storage
  for (const o of [-3.5, 4.5]) locker(b, BX + o, L1Y, BZ + 6.7, 0);                               // кубрик тумбочки
  lenUgolok(world, b, BX + 5.0, L1Y + 1.7, BZ + 10.12, Math.PI);                                  // ленинский уголок (red board, кубрик)
  ammoCrate(b, BX + 12.1, L1Y, BZ - 6.6, -Math.PI / 2); ammoCrate(b, BX + 12.1, L1Y, BZ - 7.5, -Math.PI / 2); // more armory crates
  // light weathering: soot over the diesel ceiling + rust streaks by the postern reveal
  b.box(2.4, 0.05, 2.2, BX + 9, L2Y + CHc - 0.06, BZ + 7, 0x2a2620);
  for (const sx of [-0.72, 0.72]) b.box(0.04, 0.5, 0.02, BX + sx, 1.5, BZ + SHZ - 0.32, 0x8a5a3c);

  // ---- corridor dressing: pipes + cable trays + fire points per level (ring) ----
  for (const y of LEVELS) {
    pipeRun(b, 'x', BX - SHX + 1, BX + SHX - 1, BZ - 6.0, y + CHc - 0.35);
    pipeRun(b, 'x', BX - SHX + 1, BX + SHX - 1, BZ + 6.0, y + CHc - 0.35, 0.1, REDPIPE);
    cableTray(b, 'z', BZ - 6.0, BZ + 6.0, BX - 6.0, y + CHc - 0.5);
    firePoint(b, BX + 5.6, y, BZ - 5.6, Math.PI / 2);
    // lighting: bright amber on the central room (objective), amber working lights per perimeter room, red ring accents
    lamp(world, b, BX, y + CHc - 0.2, BZ, AMBER, y === L0Y ? 13 : 12, y === L0Y ? 1.3 : 1.1);   // central
    lamp(world, b, BX, y + CHc - 0.2, BZ + 8.5, AMBER, 9, 0.85);   // N room
    lamp(world, b, BX, y + CHc - 0.2, BZ - 8.5, AMBER, 9, 0.85);   // S room
    lamp(world, b, BX + 9.5, y + CHc - 0.2, BZ, AMBER, 9, 0.85);   // E room
    lamp(world, b, BX - 9.5, y + CHc - 0.2, BZ + 3, REDGLOW, 9, 0.8);   // W stair hall (red, mood)
    lamp(world, b, BX - 9.5, y + CHc - 0.2, BZ - 5, REDGLOW, 8, 0.7);   // W hall S
  }
  if (!CUT) lamp(world, b, BX + 7.5, TOWY + 2.0, BZ, AMBER, 8, 0.7); // tower

  // ---- signage (Cyrillic stencils + ГО) ----
  if (!CUT) {
    signPlane(world, 'УБЕЖИЩЕ', BX - 8, CROWNY + 2.5, BZ + 4.1, 3.0, 0.6, 0, { color: '#d8cfb8', size: 56, cw: 620, ch: 120 });
    signPlane(world, 'ОБЪЕКТ 1180', BX - 8, CROWNY + 1.7, BZ + 4.06, 2.2, 0.42, 0, { color: '#9a948a', size: 34 });
    signPlane(world, 'ГО', BX - 11.5, CROWNY + 1.7, BZ + 4.06, 0.7, 0.7, 0, { panel: '#e07b1e', color: '#1f5fa8', size: 70 });
    signPlane(world, 'ЗАПАСНЫЙ ВЫХОД', BX, 2.4, BZ + SHZ + 8.9, 3.2, 0.5, 0, { color: '#c0b48a', size: 36 });
    signPlane(world, 'НАБЛЮДАТЕЛЬНЫЙ ПУНКТ', BX + 7.5, TOWY + 1.9, BZ - 2.42, 2.6, 0.4, 0, { color: '#9a948a', size: 26 });
  }
  // room labels — above each central-room door / perimeter door, facing the ring
  const lvlSign = (y, txt, lx, lz, ry, size) => signPlane(world, txt, BX + lx, y + 2.4, BZ + lz, txt.length * 0.22 + 0.4, 0.42, ry, { color: '#c0b48a', size: size || 34 });
  lvlSign(L0Y, 'ШТАБ', 0, 5.32, 0, 40); lvlSign(L0Y, 'СВЯЗЬ · ЗАС', 7.32, 0, Math.PI / 2, 28); lvlSign(L0Y, 'ЭЛЕКТРОЩИТОВАЯ', 0, -7.32, Math.PI, 24);
  lvlSign(L1Y, 'КУБРИК', 0, 7.32, 0, 36); lvlSign(L1Y, 'УЗЕЛ СВЯЗИ', 7.32, 4, Math.PI / 2, 28); lvlSign(L1Y, 'ОРУЖЕЙНАЯ', 7.32, -5, Math.PI / 2, 28); lvlSign(L1Y, 'САНЧАСТЬ', 0, -7.32, Math.PI, 32);
  lvlSign(L2Y, 'ТАМБУР-ШЛЮЗ', 0, 5.32, 0, 30); lvlSign(L2Y, 'ФВУ', 0, 7.32, 0, 40); lvlSign(L2Y, 'ДИЗЕЛЬНАЯ', 7.32, 4, Math.PI / 2, 26); lvlSign(L2Y, 'БАЛЛОННАЯ', 0, -7.32, Math.PI, 28);
  // hazard + instruction stencils + level markers
  signPlane(world, 'НЕ КУРИТЬ', BX + 7.18, L2Y + 2.2, BZ + 7, 1.4, 0.34, Math.PI / 2, { color: '#c33', size: 24 }); // diesel
  signPlane(world, 'ВЫСОКОЕ НАПРЯЖЕНИЕ', BX + 8.5, L0Y + 2.3, BZ - 8.7, 1.6, 0.32, 0, { panel: '#d9b43a', color: '#1a1a1a', size: 16 }); // switchroom
  signPlane(world, 'РАДИАЦИОННАЯ ОПАСНОСТЬ', BX - 1.5, L2Y + 2.1, BZ - 4.62, 1.8, 0.32, 0, { panel: '#e0b020', color: '#1a1a1a', size: 15 }); // airlock
  for (const [yy, n] of [[L2Y, 'УРОВЕНЬ −1'], [L1Y, 'УРОВЕНЬ −2'], [L0Y, 'УРОВЕНЬ −3']]) signPlane(world, n, BX - 6.78, yy + 2.5, BZ + 1.75, 1.4, 0.34, Math.PI / 2, { color: '#c0b48a', size: 22 }); // stair-hall door
  signPlane(world, 'ГЕРМОДВЕРЬ ЗАКРОЙ ЗА СОБОЙ', BX + 1.4, L0Y + 1.5, BZ + SHZ - 0.36, 1.9, 0.28, Math.PI, { color: '#c06050', size: 15 }); // by the postern
  // hazard chevrons on the postern threshold
  chevron(b, BX, 0.55, BZ + SHZ - 0.4, 1.5, 0.9, 'z');

  // ---- commit meshes ----
  const struct = new THREE.Mesh(b.build(), voxelMaterial()); struct.castShadow = true; struct.receiveShadow = true; world.scene.add(struct);
  const bermMesh = new THREE.Mesh(world._bb.build(), voxelMaterial()); bermMesh.castShadow = true; bermMesh.receiveShadow = true; world.scene.add(bermMesh);
  world._bb = null;

  // loot spots — gradient: command core (deepest, top loot) + perimeter rooms per level
  world.lootSpots.push(
    new THREE.Vector3(BX, L0Y, BZ), new THREE.Vector3(BX + 9, L0Y, BZ + 4),           // L0 command core + ЗАС
    new THREE.Vector3(BX + 9, L1Y, BZ - 5), new THREE.Vector3(BX - 8, L1Y, BZ + 8),   // L1 armory + кубрик
    new THREE.Vector3(BX + 9, L2Y, BZ + 7), new THREE.Vector3(BX - 10, L2Y, BZ + 8)   // L2 diesel + ФВУ
  );
}

// tower platform floor (small slab with one ladder hole), via the world-solid closure S.
function tileFloorTower(S, tcx, tcz, thx, yTop, hole) {
  const t = 0.4, yc = yTop - t / 2;
  // four strips around the hole
  // north strip
  S(thx * 2, t, (tcz + thx) - hole.z1, tcx, yc, (hole.z1 + tcz + thx) / 2, CONCD.lo, { tint: 0.03 });
  S(thx * 2, t, hole.z0 - (tcz - thx), tcx, yc, (tcz - thx + hole.z0) / 2, CONCD.lo, { tint: 0.03 });
  S(hole.x0 - (tcx - thx), t, hole.z1 - hole.z0, (tcx - thx + hole.x0) / 2, yc, (hole.z0 + hole.z1) / 2, CONCD.lo, { tint: 0.03 });
  S((tcx + thx) - hole.x1, t, hole.z1 - hole.z0, (hole.x1 + tcx + thx) / 2, yc, (hole.z0 + hole.z1) / 2, CONCD.lo, { tint: 0.03 });
}
