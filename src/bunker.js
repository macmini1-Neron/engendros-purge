// bunker.js — «ОБЪЕКТ 1180» secret Soviet command bunker POI for the steppe map.
// Built object-by-object via the voxel-building-modeling skill + a research dossier
// (docs/2026-06-03-soviet-bunker-reference.md). Archetypes: Object 1180 ЗКП (bones —
// buried R/C command post under an earth берм/курган), Tagansky/Bunker-42 (fit-out +
// blockhouse portal), Object 825 Balaklava (corridor texture/mood: arched ceiling,
// overhead pipes, гермодвери, emergency light). Layered shading (Hi/Mid/Lo/Slot).
//
// ENGINE ADAPTATION: the player collides with a hard floor at y=0 (can't go below grade),
// so "underground" is faked as a bunker dug into an earth BERM — interior floor at y=0,
// enclosed by a thick concrete + earth roof (reads as buried, lit by red emergency lamps),
// the берм top = high ground. 3 routes in: (1) main portal+airlock at grade (2-way),
// (2) escape-ladder shaft dropping from the берм top into the N corridor (one-way down),
// (3) vent drop from a surface грибок into the E corridor (one-way). A ring corridor loops
// the central COMMAND room (the 1v1 objective + top loot) so there are no dead-ends.
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
const PIPEG = { hi: 0xb6bbbd, mid: 0x9fa4a6, lo: 0x767b7d, slot: 0x565a5c }; // galvanized pipe
const DADO  = { hi: 0xa3bba3, mid: 0x8fa890, lo: 0x6f846f, slot: 0x53634f }; // teal dado (lower wall)
const CREAM = { hi: 0xe6e1d2, mid: 0xd8d2c0, lo: 0xb3ad9c, slot: 0x8c8675 }; // cream upper wall
const LINO  = { hi: 0x8e4a3d, mid: 0x7a3b30, lo: 0x582820, slot: 0x3c1c16 }; // oxblood lino floor
const RUSTP = { hi: 0x95603a, mid: 0x7c4a2c, lo: 0x5a3420, slot: 0x3a2114 }; // rust
const EARTH = 0x6e5c3c, GRASS = 0x5e6a32, GRASS2 = 0x55602c, GLASS = 0x35414a;
const HAZ_Y = 0xd9b43a, HAZ_K = 0x26241f, CD_RED = 0xb23a2e, STAR = 0xc01a1a;
const REDGLOW = 0xff2a1f, AMBER = 0xffb24a;

// ---- dimensions (m) ----
const CH = 3.2;   // interior clear height (ceiling underside)
const T  = 0.6;   // wall thickness
const SHX = 14, SHZ = 11; // outer-shell half-extents (interior is x±13.4, z±10.4)

// layered slab: Mid body + thin lit Hi top strip + dark Lo bottom strip (no collider — caller adds it).
function lit(b, w, h, d, x, y, z, pal, opts = {}) {
  b.box(w, h, d, x, y, z, pal.mid, opts);
  const ts = Math.min(0.16, h * 0.16), bs = Math.min(0.14, h * 0.14);
  b.box(w * 1.001, ts, d * 1.001, x, y + h / 2 - ts / 2, z, pal.hi, opts);
  b.box(w * 1.001, bs, d * 1.001, x, y - h / 2 + bs / 2, z, pal.lo, opts);
}

// yellow/black diagonal hazard chevron strip on a face (faceN: 'x'|'z'), centred (x,y,z), length L, height H.
function chevron(b, x, y, z, L, H, axis) {
  const n = Math.max(3, Math.round(L / 0.34)), step = L / n;
  for (let i = 0; i < n; i++) {
    const o = -L / 2 + step * (i + 0.5), col = i % 2 ? HAZ_K : HAZ_Y;
    if (axis === 'z') b.box(step * 0.96, H, 0.06, x + o, y, z, col, { rz: 0.5 });
    else b.box(0.06, H, step * 0.96, x, y, z + o, col, { rx: 0.5 });
  }
}

// overhead galvanized pipe run along an axis between two coords at height y (with a couple of hanger straps).
function pipeRun(b, ax, a0, a1, fixed, y, r = 0.16) {
  const len = Math.abs(a1 - a0), mid = (a0 + a1) / 2;
  if (ax === 'z') { cyl(b, r, len, fixed, y, mid, PIPEG.mid, { rx: Math.PI / 2, seg: 8, tint: 0.03 }); cyl(b, r * 1.15, len, fixed, y + r * 0.7, mid, PIPEG.hi, { rx: Math.PI / 2, seg: 8, sy: 0.4 }); }
  else { cyl(b, r, len, mid, y, fixed, PIPEG.mid, { rz: Math.PI / 2, seg: 8, tint: 0.03 }); }
  for (let t = 0.15; t < 1; t += 0.34) { const p = a0 + (a1 - a0) * t; if (ax === 'z') b.box(0.04, 0.34, 0.04, fixed, y + 0.2, p, EQGRY.slot); else b.box(0.04, 0.34, 0.04, p, y + 0.2, fixed, EQGRY.slot); }
}

// emergency lamp: a small emissive lens (always-visible) + a low red/amber point light.
function lamp(world, b, x, y, z, color = REDGLOW, range = 7, intensity = 0.9) {
  b.box(0.26, 0.16, 0.12, x, y, z, EQGRY.slot);                  // caged housing (into static mesh)
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.06), new THREE.MeshBasicMaterial({ color }));
  lens.position.set(x, y, z + 0.06); world.scene.add(lens);
  const pl = new THREE.PointLight(color, intensity, range, 2.0); pl.position.set(x, y - 0.1, z); world.scene.add(pl);
  (world._bunkerLights || (world._bunkerLights = [])).push(pl, lens);
}

// ====================================================================
// ГЕРМОДВЕРЬ — steel hermetic blast door (brown, ribbed 6-panel face, horizontal
// lever-bar dogs, central handwheel, offset hinges) set in a concrete reveal.
// Faces along `axis` ('z'|'x'); `open` swings the leaf ~100° on its hinge side.
// ====================================================================
function blastDoor(b, cx, cz, axis, open = true, W = 1.25, H = 2.1) {
  const D = DOORBR, th = 0.24;
  const yaw = (axis === 'z' ? 0 : Math.PI / 2) + (open ? 1.35 : 0);   // hinge-left swing ~77° (face still reads from the approach)
  const cy = H / 2 + 0.06, c = Math.cos(yaw), s = Math.sin(yaw);
  const hpx = cx + (axis === 'z' ? -W / 2 : 0), hpz = cz + (axis === 'z' ? 0 : -W / 2);   // hinge pivot
  // place a leaf-local point: lx = along the leaf width from the hinge, ly = world height, lz = depth off the face
  const put = (lx, ly, lz, w, h, d, col) => { const wx = hpx + lx * c - lz * s, wz = hpz + lx * s + lz * c; b.box(w, h, d, wx, ly, wz, col, { ry: yaw }); };
  put(W / 2, cy, 0, W, H, th, D.mid);                                   // leaf slab
  put(W / 2, H + 0.02, 0, W, 0.12, th + 0.02, D.hi);                    // top lit edge
  put(W / 2, 0.16, 0, W, 0.12, th + 0.02, D.lo);                        // bottom dark edge
  for (const f of [1, -1]) {                                            // ribs + wheel on BOTH faces → reads from any angle
    put(W / 2, cy, f * (th / 2 + 0.03), W, H, 0.05, D.lo);                      // proud frame border
    put(W / 2, cy, f * (th / 2 + 0.06), 0.1, H - 0.24, 0.06, D.slot);           // vertical centre rib
    put(W / 2, cy - H / 4, f * (th / 2 + 0.06), W - 0.22, 0.09, 0.06, D.slot);  // lower horizontal rib
    put(W / 2, cy + H / 4, f * (th / 2 + 0.06), W - 0.22, 0.09, 0.06, D.slot);  // upper horizontal rib
    for (const ly of [cy - 0.55, cy, cy + 0.55]) put(W / 2, ly, f * (th / 2 + 0.11), W - 0.06, 0.07, 0.07, RUSTP.lo); // lever-bar dogs
    const wx = hpx + (W / 2) * c - f * (th / 2 + 0.13) * s, wz = hpz + (W / 2) * s + f * (th / 2 + 0.13) * c;
    cyl(b, 0.21, 0.05, wx, cy, wz, CD_RED, { rx: Math.PI / 2, ry: yaw, seg: 14 });                          // red handwheel rim
    cyl(b, 0.085, 0.09, wx, cy, wz, shade(CD_RED, -0.22), { rx: Math.PI / 2, ry: yaw, seg: 10 });           // hub
  }
  for (const hy of [0.4, cy, H - 0.3]) cyl(b, 0.12, 0.34, hpx, hy, hpz, RUSTP.mid, { seg: 8 });   // 3 offset hinge barrels
}

// concrete door reveal (thick frame) around a gap of (W×H) at (cx,cz) on a wall of `axis`.
function reveal(b, cx, cz, axis, W = 1.25, H = 2.1) {
  const rd = 0.55;
  if (axis === 'z') {
    b.box(0.4, H + 0.5, rd, cx - W / 2 - 0.2, (H + 0.5) / 2, cz, CONCW.mid, { tint: 0.03 }); b.box(0.4, H + 0.5, rd, cx + W / 2 + 0.2, (H + 0.5) / 2, cz, CONCW.mid, { tint: 0.03 });
    b.box(W + 0.8, 0.45, rd, cx, H + 0.27, cz, CONCW.lo); b.box(W + 0.4, 0.13, rd * 0.7, cx, 0.065, cz, CONCD.slot); // lintel + raised threshold sill
  } else {
    b.box(rd, H + 0.5, 0.4, cx, (H + 0.5) / 2, cz - W / 2 - 0.2, CONCW.mid, { tint: 0.03 }); b.box(rd, H + 0.5, 0.4, cx, (H + 0.5) / 2, cz + W / 2 + 0.2, CONCW.mid, { tint: 0.03 });
    b.box(rd, 0.45, W + 0.8, cx, H + 0.27, cz, CONCW.lo); b.box(rd * 0.7, 0.13, W + 0.4, cx, 0.065, cz, CONCD.slot); // lintel + raised threshold sill
  }
}

// ====================================================================
// SURFACE TELLS
// ====================================================================
// грибок — armored mushroom air intake: a short stack capped with an umbrella cowl.
function mushroom(b, x, y0, z, h = 1.4) {
  cyl(b, 0.3, h, x, y0 + h / 2, z, CONCW.mid, { seg: 10, tint: 0.03 });
  cyl(b, 0.32, 0.2, x, y0 + h, z, CONCW.lo, { seg: 10 });
  const cowl = new THREE.ConeGeometry(0.62, 0.42, 12); b.geo(cowl, x, y0 + h + 0.32, z, STEELB.mid, { tint: 0.03 }); cowl.dispose();
  cyl(b, 0.64, 0.06, x, y0 + h + 0.13, z, STEELB.lo, { seg: 12 }); // cowl lip
}
// lattice antenna mast (visual only — thin, walk-past).
function antenna(b, x, z, H = 10) {
  for (const o of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(0.05, H, 0.05, x + o[0], H / 2, z + o[1], RUSTP.mid, { tint: 0.04 });
  for (let y = 0.8; y < H; y += 1.1) { b.box(0.42, 0.04, 0.04, x, y, z - 0.18, RUSTP.lo); b.box(0.42, 0.04, 0.04, x, y, z + 0.18, RUSTP.lo); b.box(0.04, 0.04, 0.42, x - 0.18, y, z, RUSTP.lo); }
  b.box(0.06, 1.4, 0.06, x, H + 0.7, z, EQGRY.hi); // whip
}
// periscope/observation cupola — low armored dome.
function cupola(b, x, y0, z) {
  cyl(b, 0.9, 0.5, x, y0 + 0.25, z, CONCW.mid, { seg: 14, tint: 0.03 });
  const dome = new THREE.SphereGeometry(0.85, 14, 7, 0, TAU, 0, Math.PI / 2); b.geo(dome, x, y0 + 0.5, z, STEELB.mid, { tint: 0.03 }); dome.dispose();
  for (let i = 0; i < 3; i++) { const a = -0.5 + i * 0.5; b.box(0.34, 0.1, 0.04, x + Math.cos(a) * 0.86, y0 + 0.55, z + Math.sin(a) * 0.86, 0x111316); } // vision slits
  b.box(0.1, 0.5, 0.1, x, y0 + 1.0, z, EQGRY.mid); // periscope stub
}
// round armored escape hatch (lid sitting proud of the berm).
function escapeHatch(b, x, y0, z) {
  cyl(b, 0.6, 0.25, x, y0 + 0.12, z, STEELB.mid, { seg: 14, tint: 0.03 });
  cyl(b, 0.62, 0.08, x, y0 + 0.25, z, STEELB.hi, { seg: 14 });
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; b.box(0.07, 0.05, 0.07, x + Math.cos(a) * 0.45, y0 + 0.27, z + Math.sin(a) * 0.45, RUSTP.lo); } // dog bolts
  b.box(0.34, 0.06, 0.1, x, y0 + 0.3, z, CD_RED); // latch handle
}

// ====================================================================
// EQUIPMENT
// ====================================================================
function genset(b, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [bx, bz] = at(0, 0); lit(b, 2.4, 1.6, 1.4, bx, 0.9, bz, OLIVE, { ry: yaw, tint: 0.03 });   // engine block
  const [hx, hz] = at(-0.7, 0); cyl(b, 0.5, 1.3, hx, 1.1, hz, OLIVE.lo, { rz: Math.PI / 2, ry: yaw, seg: 10 }); // cylinder bank
  const [ex, ez] = at(0.9, -0.5); cyl(b, 0.13, 2.2, ex, 2.0, ez, RUSTP.mid, { seg: 8 });            // exhaust up to ceiling
  const [gx, gz] = at(1.0, 0.4); lit(b, 0.9, 1.1, 1.0, gx, 0.7, gz, EQGRY, { ry: yaw });            // generator end
  b.box(2.6, 0.1, 1.6, bx, 0.05, bz, EQGRY.slot);                                                   // oily plinth
}
function filterCol(b, x, z, h = 1.3) {
  cyl(b, 0.26, h, x, h / 2 + 0.3, z, OLIVE.mid, { seg: 10, tint: 0.03 });
  cyl(b, 0.28, 0.1, x, 0.3, z, OLIVE.lo, { seg: 10 });
  cyl(b, 0.28, 0.1, x, h + 0.3, z, OLIVE.hi, { seg: 10 });
  b.box(0.5, 0.6, 0.5, x, 0.3, z, EQGRY.lo); // base box
}
function console_(b, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [bx, bz] = at(0, 0); lit(b, 1.4, 1.5, 0.7, bx, 0.75, bz, EQGRY, { ry: yaw, tint: 0.02 });
  const [px, pz] = at(0, 0.36); b.box(1.2, 0.5, 0.06, px, 1.15, pz, 0x1c2226, { ry: yaw });   // dark panel face
  for (let i = 0; i < 8; i++) { const [lx, lz] = at(-0.5 + (i % 4) * 0.33, 0.4); b.box(0.06, 0.06, 0.04, lx, 1.3 - Math.floor(i / 4) * 0.18, lz, i % 3 ? AMBER : CD_RED, { ry: yaw }); } // indicator lamps
  const [sx, sz] = at(0, 0.34); b.box(1.1, 0.18, 0.18, sx, 0.95, sz, EQGRY.lo, { ry: yaw, rx: -0.5 }); // sloped switch desk
}
function bunk(b, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  for (const yy of [0.5, 1.4]) { const [bx, bz] = at(0, 0); b.box(2.0, 0.12, 0.9, bx, yy, bz, EQGRY.mid, { ry: yaw }); b.box(1.9, 0.16, 0.8, bx, yy + 0.12, bz, 0x6a6258, { ry: yaw }); } // 2 bunks + mattress
  for (const o of [[-0.95, -0.4], [0.95, -0.4], [-0.95, 0.4], [0.95, 0.4]]) { const [px, pz] = at(o[0], o[1]); b.box(0.08, 1.8, 0.08, px, 0.9, pz, EQGRY.slot); } // posts
}
function rifleRack(b, x, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => [x + lx * c - lz * s, z + lx * s + lz * c];
  const [bx, bz] = at(0, 0); b.box(1.6, 1.9, 0.3, bx, 0.95, bz, OLIVE.lo, { ry: yaw }); // cabinet back
  for (let i = 0; i < 5; i++) { const [rx, rz] = at(-0.6 + i * 0.3, 0.18); b.box(0.06, 1.4, 0.06, rx, 0.95, rz, 0x2a2620, { ry: yaw }); b.box(0.1, 0.5, 0.12, rx, 1.4, rz, RUSTP.lo, { ry: yaw }); } // rifle silhouettes
  const [cx2, cz2] = at(0, 0.4); b.box(1.4, 0.5, 0.6, cx2, 0.3, cz2, OLIVE.mid, { ry: yaw }); // ammo crate
}
// map board / banner / portrait for the command room wall.
function commandWall(world, b, x, y, z, axis) {
  signPlane(world, '', x, y, z + (axis === 'z' ? 0.04 : 0), 3.4, 2.0, axis === 'z' ? 0 : Math.PI / 2, { panel: '#243018', border: '#7c6a2e', color: '#7da06a', size: 10 }); // map board (green plexi)
  // a few map "lines" via thin boxes
  for (let i = 0; i < 4; i++) b.box(axis === 'z' ? 2.8 : 0.04, 0.03, axis === 'z' ? 0.04 : 2.8, x, y + 0.6 - i * 0.35, z + (axis === 'z' ? 0.05 : 0), 0xd0b85a, { ry: axis === 'z' ? 0 : Math.PI / 2 });
}

// ====================================================================
// BERM / КУРГАН — impassable tiered earth mound over + around the bunker.
// Built as stacked rectangular RINGS that step inward as they rise (sloped read),
// capping the concrete roof. Leaves the south portal mouth + the top shaft openings open.
// ====================================================================
function berm(world, BX, BZ, halfX, halfZ) {
  const bb = world._bb;
  const earth = (g) => (g ? { hi: GRASS2, mid: EARTH, lo: 0x5a4a30, slot: 0x463a26 } : { hi: GRASS, mid: GRASS2, lo: EARTH, slot: EARTH });
  const CONCP = { hi: CONC.hi, mid: CONC.mid, lo: CONC.lo, slot: CONC.slot };
  // 4 broad REVETTED terraces (concrete retaining lip + grass) — a deliberate hardened-earthwork berm,
  // not an accidental staircase. Coarse AABB colliders per terrace (impassable).
  const N = 4, topY = 4.6;
  for (let i = 0; i < N; i++) {
    const y0 = (i / N) * topY, y1 = ((i + 1) / N) * topY, h = y1 - y0, cy = (y0 + y1) / 2, ly = y1 - 0.13;
    const ex = 4.0 * (1 - i / N), hx = halfX + ex, hz = halfZ + ex, bw = 1.7 + ex, pal = earth(i < 1);
    for (const sgnZ of [-1, 1]) {           // S split around the portal gap (x±2.4); N solid
      const zc = BZ + sgnZ * hz, lz = zc + sgnZ * (bw / 2 - 0.16);
      if (sgnZ === -1) { for (const sx of [-1, 1]) { const w = hx - 2.4, xc = BX + sx * (hx + 2.4) / 2; lit(bb, w, h, bw, xc, cy, zc, pal, { tint: 0.09 }); collider(world, xc, zc, w / 2, 0, y1, bw / 2); bb.box(w, 0.26, 0.34, xc, ly, lz, CONC.lo, { tint: 0.03 }); } }
      else { lit(bb, hx * 2, h, bw, BX, cy, zc, pal, { tint: 0.09 }); collider(world, BX, zc, hx, 0, y1, bw / 2); bb.box(hx * 2, 0.26, 0.34, BX, ly, lz, CONC.lo, { tint: 0.03 }); }
    }
    for (const sgnX of [-1, 1]) {            // E split around the secondary-entry gap (z±2.2); W solid
      const xc = BX + sgnX * hx, lx = xc + sgnX * (bw / 2 - 0.16);
      if (sgnX === 1) { for (const sz of [-1, 1]) { const d = hz - 2.2, zc = BZ + sz * (hz + 2.2) / 2; lit(bb, bw, h, d, xc, cy, zc, pal, { tint: 0.09 }); collider(world, xc, zc, bw / 2, 0, y1, d / 2); bb.box(0.34, 0.26, d, lx, ly, zc, CONC.lo, { tint: 0.03 }); } }
      else { lit(bb, bw, h, hz * 2, xc, cy, BZ, pal, { tint: 0.09 }); collider(world, xc, BZ, bw / 2, 0, y1, hz); bb.box(0.34, 0.26, hz * 2, lx, ly, BZ, CONC.lo, { tint: 0.03 }); }
    }
  }
  // domed cap — 5 concentric earth slabs (smooth mound)
  for (let i = 0; i < 5; i++) { const t = i / 5, y0 = 3.4 + t * 1.9, hx = (halfX - 1) * (1 - t * 0.8), hz = (halfZ - 1) * (1 - t * 0.8); lit(bb, hx * 2, 0.55, hz * 2, BX, y0, BZ, earth(false), { tint: 0.08 }); }
  // a few spalled board-formed concrete edges poking through the earth slope (dossier: "blown-out R/C edge")
  for (const [dx, dz, ry] of [[-halfX - 2.5, -3, 0.2], [halfX + 2, 5.5, -0.3], [-5, halfZ + 3, 0.1]]) lit(bb, 1.8, 1.1, 1.0, BX + dx, 0.6, BZ + dz, CONCP, { tint: 0.04, ry });
}

// ====================================================================
//  ENTRY
// ====================================================================
export function buildSecretBunker(world, BX, BZ) {
  const rng = makeRNG(0x0B17);
  const CUT = (() => { try { return new URLSearchParams(location.search).get('cut') === '1'; } catch (e) { return false; } })(); // ?cut=1 → skip roof + berm (dev top-down inspection)
  const b = new MeshBuilder();          // interior + structure (one merged mesh)
  world._bb = new MeshBuilder();         // berm earth (separate mesh — different palette feel)
  const at = (lx, lz) => [BX + lx, BZ + lz];
  const W = (cx, cz, len, h, baseY, axis, color, door) => world._wall(b, BX + cx, BZ + cz, len, h, baseY, axis, color, door);
  const S = (w, h, d, cx, cz, y, color, opts) => world._solid(b, w, h, d, BX + cx, y, BZ + cz, color, opts);

  // ---- floor slab (oxblood lino over concrete) at y≈0 across the interior ----
  S(SHX * 2, 0.1, SHZ * 2, 0, 0, 0.05, LINO.mid, { tint: 0.04 });

  // ---- outer shell walls (concrete), ceiling slab ----
  W(0, -SHZ, SHX * 2, CH, 0, 'x', CONCW.mid, { width: 2.6, height: 2.4 });   // S wall — portal/airlock gap (centre)
  W(0, SHZ, SHX * 2, CH, 0, 'x', CONCW.mid);                                 // N wall (solid)
  W(-SHX, 0, SHZ * 2, CH, 0, 'z', CONCW.mid);                                // W wall (solid)
  W(SHX, 0, SHZ * 2, CH, 0, 'z', CONCW.mid, { width: 2.0, height: 2.4 });    // E wall — secondary entry (ЗАПАСНЫЙ ВЫХОД)
  if (!CUT) world._floor(b, BX, BZ, SHX * 2, SHZ * 2, CH, CONCD.lo);          // ceiling slab (roof underside; skipped in ?cut=1)

  // ---- COMMAND room (centre-north): 9×7, walls with 3 doors (S, E, W) ----
  const cmx0 = -4.5, cmx1 = 4.5, cmz0 = -1.5, cmz1 = 5.5; // command extents (local)
  const cmcx = (cmx0 + cmx1) / 2, cmcz = (cmz0 + cmz1) / 2;
  W(cmcx, cmz0, cmx1 - cmx0, CH, 0, 'x', CONCW.mid, { width: 1.3, height: 2.1 });  // S door (main approach)
  W(cmcx, cmz1, cmx1 - cmx0, CH, 0, 'x', CONCW.mid);                                // N wall (map board)
  W(cmx0, cmcz, cmz1 - cmz0, CH, 0, 'z', CONCW.mid, { width: 1.3, height: 2.1 });  // W door
  W(cmx1, cmcz, cmz1 - cmz0, CH, 0, 'z', CONCW.mid, { width: 1.3, height: 2.1 });  // E door
  reveal(b, BX + cmcx, BZ + cmz0, 'z'); blastDoor(b, BX + cmcx, BZ + cmz0, 'z', true);  // hero blast door at command S

  // ---- side rooms (carved against the outer shell), each with a door to the ring ----
  // GENERATOR (SW)
  W(-9.0, -4.5, 7.0, CH, 0, 'x', CONCW.mid, { width: 1.3, height: 2.1 });   // N wall of genset room (door to ring)
  W(-5.5, -7.75, 5.5, CH, 0, 'z', CONCW.mid);                               // E wall of genset room
  // ФВУ filtration (SE)
  W(9.0, -4.5, 7.0, CH, 0, 'x', CONCW.mid, { width: 1.3, height: 2.1 });
  W(5.5, -7.75, 5.5, CH, 0, 'z', CONCW.mid);
  // ARMORY (NE)
  W(9.0, 4.5, 7.0, CH, 0, 'x', CONCW.mid, { width: 1.3, height: 2.1 });
  W(5.5, 7.75, 5.5, CH, 0, 'z', CONCW.mid);
  // BUNKS (NW)
  W(-9.0, 4.5, 7.0, CH, 0, 'x', CONCW.mid, { width: 1.3, height: 2.1 });
  W(-5.5, 7.75, 5.5, CH, 0, 'z', CONCW.mid);

  // ---- AIRLOCK / тамбур at the south portal: a 3×3 chamber straddling the S wall ----
  // outer гермодверь at the shell (z=-SHZ), inner door at z=-SHZ+3
  S(0.6, CH, 3.0, -2.0, -SHZ + 1.5, CH / 2, CONCW.mid); S(0.6, CH, 3.0, 2.0, -SHZ + 1.5, CH / 2, CONCW.mid); // airlock side walls
  W(0, -SHZ + 3.0, 4.0, CH, 0, 'x', CONCW.mid, { width: 1.3, height: 2.1 }); // inner airlock wall + door
  reveal(b, BX, BZ - SHZ, 'z'); blastDoor(b, BX, BZ - SHZ, 'z', false);       // outer гермодверь (closed-ish, the portal)
  // round floor sump hatch in the airlock (dossier ref)
  cyl(b, 0.5, 0.12, BX, 0.13, BZ - SHZ + 1.4, CONCD.slot, { seg: 14 }); cyl(b, 0.52, 0.05, BX, 0.2, BZ - SHZ + 1.4, STEELB.lo, { seg: 14 });

  // ---- PORTAL headhouse (outside the berm, S): board-formed R/C — layered piers w/ form-tie dots, chamfered lintel, star ----
  const px0 = BX, pz0 = BZ - SHZ - 1.4;
  for (const sx of [-1, 1]) {
    const cx = px0 + sx * 2.5, cz = pz0 + 0.2;
    lit(b, 1.3, 4.0, 3.2, cx, 2.0, cz, CONC, { tint: 0.04 });                              // pier (layered, visual)
    collider(world, cx, cz, 0.65, 0, 4.0, 1.6);                                            // pier collider
    for (let yy = 1.0; yy < 3.6; yy += 0.7) b.box(0.09, 0.09, 0.05, cx, yy, cz - 1.6, CONC.slot); // board-form tie dots
  }
  lit(b, 6.6, 1.1, 3.2, px0, 4.0, pz0 + 0.2, CONC, { tint: 0.03 });                        // chamfered lintel beam
  collider(world, px0, pz0 + 0.2, 3.3, 3.45, 4.55, 1.6);                                   // lintel collider (above head)
  b.box(7.0, 0.5, 1.2, px0, 4.7, pz0 - 1.0, CONC.lo);                                       // top fascia cap
  // faded red star on the lintel face
  { const R = 0.62, sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? R * 0.42 : R, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); } sh.closePath(); const sg = new THREE.ShapeGeometry(sh); b.geo(sg, px0, 4.0, pz0 - 1.62, shade(STAR, -0.12)); sg.dispose(); }

  // ---- (2) SECONDARY ENTRY on the EAST shell (ЗАПАСНЫЙ ВЫХОД): a 2nd grade-level portal through the
  //      E berm gap so no single door can be held (1v1). [v1: berm-top drop shafts are a refine-pass item.] ----
  reveal(b, BX + SHX, BZ, 'x', 2.0, 2.4); blastDoor(b, BX + SHX, BZ, 'x', true, 1.3, 2.1);
  const ex2 = SHX + 1.2;
  S(0.9, 3.4, 2.4, ex2, -2.0, 1.7, CONC.mid, { tint: 0.04 }); S(0.9, 3.4, 2.4, ex2, 2.0, 1.7, CONC.mid, { tint: 0.04 }); // E headhouse piers
  S(2.4, 0.9, 5.0, ex2, 0, 3.4, CONC.lo);                                                                              // E headhouse lintel

  // ---- corridor dressing: overhead pipes along the ring, hazard chevrons on a couple of doors ----
  pipeRun(b, 'x', BX - SHX + 1, BX + SHX - 1, BZ - SHZ + 1.2, CH - 0.45);   // S corridor pipe
  pipeRun(b, 'x', BX - SHX + 1, BX + SHX - 1, BZ + SHZ - 1.2, CH - 0.45);   // N corridor pipe
  pipeRun(b, 'z', BZ - SHZ + 1, BZ + SHZ - 1, BX - SHX + 1.2, CH - 0.6, 0.13); // W corridor pipe
  chevron(b, BX, 0.55, BZ - SHZ + 0.06, 1.2, 1.0, 'z');   // chevron under the airlock inner door (visual on floor face)

  // ---- equipment per room ----
  genset(b, BX - 9.5, BZ - 7.6, 0.2); genset(b, BX - 7.0, BZ - 9.0, 1.6);                  // GENERATOR (SW)
  for (let i = 0; i < 3; i++) filterCol(b, BX + 8.0 + i * 0.8, BZ - 8.6, 1.3);              // ФВУ (SE)
  S(1.6, 1.2, 0.5, 12.0, -8.0, 0.9, EQGRY.mid); // ФВУ fan box (collidable)
  console_(b, BX - 3.2, BZ + 4.6, Math.PI); console_(b, BX, BZ + 4.6, Math.PI); console_(b, BX + 3.2, BZ + 4.6, Math.PI); // COMMAND consoles along N wall
  commandWall(world, b, BX, 2.0, BZ + cmz1 - 0.32, 'x');                                    // map board on command N wall
  // teal dado (institutional lower-wall paint) on the command-room interior faces — adds depth + authenticity
  { const dh = 1.3, dy = dh / 2 + 0.12, wL = cmx1 - cmx0 - 0.5, dL = cmz1 - cmz0 - 0.5;
    b.box(wL, dh, 0.06, BX, dy, BZ + cmz1 - 0.33, DADO.mid, { tint: 0.03 }); b.box(wL, 0.1, 0.07, BX, dy + dh / 2, BZ + cmz1 - 0.33, DADO.hi);
    b.box(wL, dh, 0.06, BX, dy, BZ + cmz0 + 0.33, DADO.mid, { tint: 0.03 });
    b.box(0.06, dh, dL, BX + cmx0 + 0.33, dy, BZ + cmcz, DADO.mid, { tint: 0.03 });
    b.box(0.06, dh, dL, BX + cmx1 - 0.33, dy, BZ + cmcz, DADO.mid, { tint: 0.03 }); }
  b.box(2.2, 0.9, 1.2, BX, 0.75, BZ + 2.0, EQGRY.lo); b.box(2.0, 0.08, 1.0, BX, 1.2, BZ + 2.0, 0x243018); // central plotting table
  for (const o of [[-1.0, 'red'], [-0.6, 'green']]) b.box(0.12, 0.3, 0.12, BX + o[0], 1.45, BZ + 2.0, o[1] === 'red' ? CD_RED : OLIVE.mid); // field phones
  bunk(b, BX - 11.0, BZ + 7.0, 0); bunk(b, BX - 8.0, BZ + 7.0, 0);                          // BUNKS (NW)
  rifleRack(b, BX + 11.5, BZ + 6.2, -Math.PI / 2); rifleRack(b, BX + 11.5, BZ + 8.2, -Math.PI / 2); // ARMORY (NE)
  b.box(1.2, 0.7, 0.9, BX + 8.5, 0.35, BZ + 8.5, OLIVE.mid); b.box(1.2, 0.7, 0.9, BX + 8.5, 0.35, BZ + 7.2, OLIVE.lo); // ammo crates (loot)

  // ---- command-room dressing: 3 wall clocks (Moscow time), Lenin portrait, red banner w/ gold star ----
  for (let k = 0; k < 3; k++) { const cx = BX - 1.0 + k * 1.0; cyl(b, 0.22, 0.07, cx, 2.92, BZ + cmz1 - 0.36, 0xe8e4d6, { rx: Math.PI / 2, seg: 12 }); cyl(b, 0.23, 0.05, cx, 2.92, BZ + cmz1 - 0.34, EQGRY.slot, { rx: Math.PI / 2, seg: 12 }); b.box(0.02, 0.15, 0.03, cx, 2.92, BZ + cmz1 - 0.45, 0x1a1a1a); }
  b.box(0.12, 1.5, 1.2, BX + cmx1 - 0.36, 2.4, BZ + 2.4, 0x6e5a2e); b.box(0.05, 1.28, 1.0, BX + cmx1 - 0.44, 2.4, BZ + 2.4, 0x241f1a); b.box(0.03, 0.46, 0.34, BX + cmx1 - 0.49, 2.62, BZ + 2.4, 0xb6a890); // Lenin portrait (gilt frame/field/face), E wall
  signPlane(world, '', BX + cmx0 + 0.34, 2.0, BZ + 3.2, 1.1, 2.4, Math.PI / 2, { panel: '#8a1414', border: '#c9a23a' }); // red banner (W wall)
  { const R = 0.32, sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? R * 0.42 : R, x = Math.cos(a) * r, y = Math.sin(a) * r; i ? sh.lineTo(x, y) : sh.moveTo(x, y); } sh.closePath(); const sg = new THREE.ShapeGeometry(sh); b.geo(sg, BX + cmx0 + 0.30, 2.45, BZ + 3.2, 0xd8c24a, { ry: Math.PI / 2 }); sg.dispose(); }
  // ---- hazard chevrons on the side-room doorway thresholds + a narrow-gauge rail + flatbed trolley (S corridor) ----
  for (const [dx, dz] of [[-9.0, -4.5], [9.0, -4.5], [-9.0, 4.5], [9.0, 4.5]]) chevron(b, BX + dx, 0.55, BZ + dz, 1.3, 0.9, 'z');
  for (let z = -SHZ + 4; z < cmz0 - 0.5; z += 0.9) { b.box(0.06, 0.05, 0.7, BX - 0.5, 0.08, BZ + z, RUSTP.lo); b.box(0.06, 0.05, 0.7, BX + 0.5, 0.08, BZ + z, RUSTP.lo); b.box(1.2, 0.04, 0.12, BX, 0.09, BZ + z, RUSTP.slot); } // narrow-gauge rail
  b.box(1.5, 0.4, 1.8, BX, 0.45, BZ - SHZ + 5.0, EQGRY.mid); b.box(1.5, 0.1, 1.8, BX, 0.66, BZ - SHZ + 5.0, EQGRY.hi); for (const o of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) cyl(b, 0.18, 0.2, BX + o[0], 0.18, BZ - SHZ + 5.0 + o[1], EQGRY.slot, { rx: Math.PI / 2, seg: 8 }); // flatbed trolley

  // ---- emergency lighting (red + a few amber) ----
  lamp(world, b, BX, CH - 0.3, BZ - SHZ + 2.5, REDGLOW, 9, 1.0);          // S corridor
  lamp(world, b, BX, CH - 0.3, BZ + cmcz, AMBER, 11, 1.1);                // command (amber, brighter — the objective reads)
  lamp(world, b, BX - SHX + 1.2, CH - 0.3, BZ, REDGLOW, 8, 0.9);          // W corridor
  lamp(world, b, BX + SHX - 1.2, CH - 0.3, BZ, REDGLOW, 8, 0.9);          // E corridor
  lamp(world, b, BX, CH - 0.3, BZ + SHZ - 1.5, REDGLOW, 8, 0.9);         // N corridor
  lamp(world, b, BX - 9, CH - 0.3, BZ - 7, AMBER, 8, 0.8);               // generator room

  // ============ PER-ROOM dressing: varied floors, more equipment (researched bunker kit), work lamps, room signs ============
  const WOOD_ = 0x6a4a2a;
  const fb = (cx, cz, w, d, col, t = 0.04) => b.box(w, 0.06, d, BX + cx, 0.12, BZ + cz, col, { tint: t }); // floor overlay (visual)
  fb(-9.7, -7.7, 7.2, 5.2, 0x3a342c);                    // GENERATOR — oily dark concrete
  fb(9.7, -7.7, 7.2, 5.2, CONCD.mid);                    // ФВУ — concrete
  fb(9.7, 7.7, 7.2, 5.2, CONCD.hi);                      // ARMORY — pale concrete
  for (let i = 0; i < 5; i++) fb(-9.7, 5.4 + i * 1.05, 7.2, 1.0, shade(WOOD_, (i % 2) ? 0.05 : -0.05)); // BUNKS — wood planks
  fb(0, -SHZ + 1.5, 3.4, 2.9, CONCD.lo);                 // AIRLOCK — bare concrete
  // GENERATOR: switchgear cabinet (W wall) + control dials + fuel day-tank
  lit(b, 0.6, 2.0, 1.6, BX - 13.0, 1.05, BZ - 6.2, EQGRY, { tint: 0.02 }); collider(world, BX - 13.0, BZ - 6.2, 0.3, 0, 2.05, 0.8);
  for (let i = 0; i < 6; i++) b.box(0.05, 0.18, 0.18, BX - 12.65, 1.5 - Math.floor(i / 3) * 0.5, BZ - 6.8 + (i % 3) * 0.5, i % 2 ? AMBER : CD_RED);
  cyl(b, 0.5, 1.5, BX - 12.4, 0.95, BZ - 9.6, RUSTP.mid, { seg: 10, tint: 0.03 }); cyl(b, 0.52, 0.12, BX - 12.4, 1.7, BZ - 9.6, RUSTP.lo, { seg: 10 }); collider(world, BX - 12.4, BZ - 9.6, 0.55, 0, 1.7);
  lamp(world, b, BX - 9.7, CH - 0.3, BZ - 9.5, AMBER, 7, 0.7);
  // ФВУ: big prefilter drum (ПФП-1000) + manometer board + duct up to the surface mushroom
  cyl(b, 0.7, 1.7, BX + 12.4, 1.15, BZ - 9.6, OLIVE.mid, { seg: 12, tint: 0.03 }); cyl(b, 0.72, 0.14, BX + 12.4, 2.0, BZ - 9.6, OLIVE.hi, { seg: 12 }); collider(world, BX + 12.4, BZ - 9.6, 0.75, 0, 2.0);
  lit(b, 1.4, 1.0, 0.18, BX + 9.5, 1.6, BZ - 10.2, EQGRY, { tint: 0.02 }); for (let i = 0; i < 4; i++) cyl(b, 0.13, 0.05, BX + 9.0 + i * 0.36, 1.7, BZ - 10.1, 0xe8e4d6, { rx: Math.PI / 2, seg: 10 });
  cyl(b, 0.22, CH, BX + 11.6, CH / 2, BZ - 6.2, PIPEG.mid, { seg: 8, tint: 0.03 });
  lamp(world, b, BX + 9.7, CH - 0.3, BZ - 9.5, AMBER, 7, 0.7);
  // ARMORY: workbench + tall locker + grenade boxes
  lit(b, 2.0, 0.9, 0.7, BX + 7.2, 0.45, BZ + 10.0, EQGRY, { tint: 0.02 }); b.box(2.0, 0.08, 0.7, BX + 7.2, 0.92, BZ + 10.0, RUSTP.lo); collider(world, BX + 7.2, BZ + 10.0, 1.0, 0, 0.95, 0.35);
  lit(b, 0.8, 2.0, 0.6, BX + 13.0, 1.05, BZ + 6.2, OLIVE, { tint: 0.02 }); collider(world, BX + 13.0, BZ + 6.2, 0.4, 0, 2.05, 0.3);
  for (const o of [[-0.4, 0], [0.4, 0], [0, 0.5]]) b.box(0.5, 0.4, 0.5, BX + 7.2 + o[0], 0.25, BZ + 6.0 + o[1], OLIVE.lo);
  lamp(world, b, BX + 9.7, CH - 0.3, BZ + 9.5, AMBER, 7, 0.7);
  // BUNKS: mess table + 2 stools + wall lockers + small stove w/ flue
  b.box(1.4, 0.1, 0.8, BX - 9.7, 0.7, BZ + 6.0, WOOD_); for (const sx of [-0.9, 0.9]) b.box(0.4, 0.5, 0.4, BX - 9.7 + sx, 0.25, BZ + 6.0, WOOD_);
  lit(b, 1.6, 1.8, 0.5, BX - 13.0, 0.95, BZ + 9.0, EQGRY, { tint: 0.02 }); collider(world, BX - 13.0, BZ + 9.0, 0.8, 0, 1.85, 0.25);
  cyl(b, 0.35, 1.0, BX - 7.0, 0.5, BZ + 9.6, 0x2a2620, { seg: 10 }); cyl(b, 0.1, 1.6, BX - 7.0, 1.8, BZ + 9.6, 0x1a1816, { seg: 6 });
  lamp(world, b, BX - 9.7, CH - 0.3, BZ + 9.5, AMBER, 7, 0.7);
  // RADIO nook in the N corridor (desk + valve-radio stack + dials)
  lit(b, 1.8, 0.9, 0.7, BX, 0.45, BZ + SHZ - 0.6, EQGRY, { tint: 0.02 }); b.box(1.8, 0.08, 0.7, BX, 0.92, BZ + SHZ - 0.6, 0x243018); collider(world, BX, BZ + SHZ - 0.6, 0.9, 0, 0.95, 0.35);
  for (let i = 0; i < 3; i++) b.box(0.5, 0.5, 0.4, BX - 0.6 + i * 0.6, 1.2, BZ + SHZ - 0.55, OLIVE.mid);
  for (let i = 0; i < 6; i++) b.box(0.06, 0.06, 0.04, BX - 0.5 + (i % 3) * 0.2, 1.32 - Math.floor(i / 3) * 0.16, BZ + SHZ - 0.38, i % 2 ? AMBER : CD_RED);
  // COMMAND: green banker's lamp on the plotting table
  cyl(b, 0.16, 0.05, BX + 0.6, 1.28, BZ + 2.0, 0x1d6b2e, { rx: Math.PI / 2, seg: 10 }); b.box(0.04, 0.3, 0.04, BX + 0.6, 1.1, BZ + 2.0, 0x9a8a3a);
  // room signs (faded stencils, facing the ring corridor)
  signPlane(world, 'ДИЗЕЛЬНАЯ', BX - 9.0, 2.5, BZ - 4.5 + 0.36, 2.6, 0.5, 0, { color: '#9a948a', size: 40 });
  signPlane(world, 'ФВУ', BX + 9.0, 2.5, BZ - 4.5 + 0.36, 1.5, 0.5, 0, { color: '#9a948a', size: 44 });
  signPlane(world, 'ОРУЖЕЙНАЯ', BX + 9.0, 2.5, BZ + 4.5 - 0.36, 2.6, 0.5, Math.PI, { color: '#9a948a', size: 40 });
  signPlane(world, 'КУБРИК', BX - 9.0, 2.5, BZ + 4.5 - 0.36, 2.0, 0.5, Math.PI, { color: '#9a948a', size: 42 });

  // ---- berm + surface tells (skipped in ?cut=1 for dev interior top-down) ----
  if (!CUT) {
  berm(world, BX, BZ, SHX + 1.0, SHZ + 1.0);
  const CR = 5.3; // berm crown height
  // surface concrete cap / blockhouse on the crown (Object-1180 "structure over the buried bunker")
  const CONCP = { hi: CONC.hi, mid: CONC.mid, lo: CONC.lo, slot: CONC.slot };
  lit(world._bb, 6.5, 2.2, 5.5, BX + 1.0, CR + 1.1, BZ, CONCP, { tint: 0.03 });                                       // cap block
  lit(world._bb, 7.1, 0.3, 6.1, BX + 1.0, CR + 2.3, BZ, { hi: CONC.mid, mid: CONC.lo, lo: CONC.slot, slot: CONC.slot }); // roof slab
  for (const [dx, dz, w, d] of [[0, -3.05, 7.1, 0.3], [0, 3.05, 7.1, 0.3], [-3.55, 0, 0.3, 6.1], [3.55, 0, 0.3, 6.1]]) world._bb.box(w, 0.5, d, BX + 1.0 + dx, CR + 2.55, BZ + dz, CONC.lo); // parapet rim
  world._bb.box(1.0, 1.7, 0.22, BX + 1.0, CR + 0.85, BZ - 2.78, 0x2a2c2e); world._bb.box(1.3, 0.16, 0.3, BX + 1.0, CR + 1.78, BZ - 2.8, CONC.hi); // dark doorway + lintel (cap S face)
  cyl(world._bb, 0.32, 0.7, BX + 3.4, CR + 2.4, BZ - 1.6, CONC.mid, { seg: 8 }); // roof vent stub
  mushroom(world._bb, BX - 4.5, CR, BZ - 2.0); mushroom(world._bb, BX - 4.5, CR, BZ + 1.0); // грибок vent pair
  cupola(world._bb, BX - 2.0, CR, BZ + 4.5);
  escapeHatch(world._bb, BX - 6.0, CR, BZ + 5.5);        // round armored escape hatch on the crown
  antenna(world._bb, BX + 6.5, BZ - 4.0, 11);            // lattice comms mast (emerges from the crown)
  }

  // ---- signage (Cyrillic stencils + ГО) ----
  signPlane(world, 'УБЕЖИЩЕ', BX, 4.68, BZ - SHZ - 3.06, 4.4, 0.7, Math.PI, { color: '#d8cfb8', size: 60, cw: 760, ch: 130 }); // on the portal fascia (cw fits all 7 chars)
  signPlane(world, 'ОБЪЕКТ 1180', BX - 2.5, 2.8, BZ - SHZ - 2.86, 2.0, 0.42, Math.PI, { color: '#9a948a', size: 34 }); // stencilled on the W pier
  signPlane(world, 'ГО', BX + 2.5, 1.95, BZ - SHZ - 2.86, 0.9, 0.9, Math.PI, { panel: '#e07b1e', color: '#1f5fa8', size: 90 }); // civil-defence (E pier)
  signPlane(world, 'ШТАБ', BX, 2.55, BZ + cmz1 - 0.36, 1.6, 0.5, Math.PI, { color: '#c0b48a', size: 44 });        // command room label (faces the room)
  signPlane(world, 'ВХОД', BX + 0.9, 2.3, BZ - SHZ + 0.04, 1.0, 0.35, Math.PI, { color: '#c0b48a', size: 34 });
  signPlane(world, 'ЗАПАСНЫЙ ВЫХОД', BX + SHX + 1.35, 2.7, BZ, 3.6, 0.55, Math.PI / 2, { color: '#c0b48a', size: 38 }); // E secondary entry

  // ---- commit meshes ----
  const struct = new THREE.Mesh(b.build(), voxelMaterial()); struct.castShadow = true; struct.receiveShadow = true; world.scene.add(struct);
  const bermMesh = new THREE.Mesh(world._bb.build(), voxelMaterial()); bermMesh.castShadow = true; bermMesh.receiveShadow = true; world.scene.add(bermMesh);
  world._bb = null;

  // loot spots (host-gated systems read these; command room = top loot)
  world.lootSpots.push(new THREE.Vector3(BX, 0, BZ + 2.0), new THREE.Vector3(BX + 9, 0, BZ + 8));
}
