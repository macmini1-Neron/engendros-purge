// kolkhoz.js — Soviet collective-farm POI «КРАСНЫЙ СТЕПНОЙ» + a crashed Su-24 set-piece.
// Built object-by-object via the voxel-building-modeling skill (layered shading: Hi/Mid/Lo/Slot,
// never near-black main; thin lit top strip + dark underside). A Low-tier loot POI out in the
// open steppe NW of the kombinát. Story: an Su-24 came in low, gouged the field, sheared a
// shelterbelt row and ploughed through the cattle-barn — its smoke column is a map-wide
// breadcrumb. Unexploded FAB-500 bombs thrown clear on impact = shoot-to-detonate hazard/cover.
// Entry: buildKolkhoz(world, KX, KZ) — KX/KZ = farmyard centre in WORLD coords.
//
// Real refs (proportions/colours from memory, sharpened where it mattered):
//  коровник (long whitewashed-base plank cattle barn), МТС (machine-tractor station: open shed),
//  ДТ-75 (red tracked crawler), «Нива» СК-5 (red self-propelled combine + grain tank + header),
//  силосные башни (concrete tower silos w/ domed caps), обелиск ВОВ (tapering pylon + red star),
//  FAB-500 (olive GP bomb: ogive nose, conical boxtail w/ 4 fins, suspension lugs).
import * as THREE from 'three';
import { MeshBuilder, TAU, makeRNG, randRange, shade, voxelMaterial } from './util.js';
import { buildSu24 } from './props.js';
import { signPlane, cyl, collider, buildFuelDrums } from './industrial.js';

// ---- layered-shading palettes (Hi/Mid/Lo/Slot) ----
const PLANK   = { hi: 0x8f7d60, mid: 0x6f5f47, lo: 0x4e4233, slot: 0x2f291f }; // weathered barn timber
const WHITE   = { hi: 0xe9e4d6, mid: 0xd2ccb9, lo: 0xaca791, slot: 0x827c6a }; // lime-washed wall
const BLUE    = { hi: 0x73a3c4, mid: 0x527f9e, lo: 0x395d77, slot: 0x274453 }; // Soviet sky-blue trim
const RUST    = { hi: 0x8a5a34, mid: 0x6e4526, lo: 0x4e301a, slot: 0x2e1c0f }; // rusted steel
const CORRUG  = { hi: 0x8b9199, mid: 0x6c727a, lo: 0x4c5158, slot: 0x2e3136 }; // corrugated roof
const CONC    = { hi: 0xbab4a6, mid: 0x9a9486, lo: 0x76705f, slot: 0x4e493c }; // concrete
const STRAW   = { hi: 0xe2c66a, mid: 0xc6a544, lo: 0xa1822e, slot: 0x6c5620 }; // hay / thatch
const OLIVE   = { hi: 0x747f42, mid: 0x586030, lo: 0x3d451f, slot: 0x262c12 }; // FAB drab green
const FARMRED = { hi: 0xb4452f, mid: 0x923323, lo: 0x6a2417, slot: 0x42150d }; // tractor / combine red
const STEEL   = { hi: 0x9aa0a8, mid: 0x767c84, lo: 0x565b62, slot: 0x34383d }; // bare steel / glass-ish
const GLASS   = 0x35414a, EARTH = 0x6a5a3e, SCORCH = 0x241c16, SCORCH2 = 0x161009;

// thin "lit top + dark bottom" striping on a wall slab — gives a flat box layered depth.
function stripe(b, w, h, d, x, y, z, pal, opts = {}) {
  const top = Math.min(0.18, h * 0.18), bot = Math.min(0.16, h * 0.16);
  b.box(w, top, d * 1.002, x, y + h / 2 - top / 2, z, pal.hi, opts);
  b.box(w, bot, d * 1.002, x, y - h / 2 + bot / 2, z, pal.lo, opts);
}

// =====================================================================
// КОРОВНИК — long cattle barn. Whitewashed plinth, plank upper walls, a
// gabled corrugated roof. Its NE corner is SMASHED OPEN where the jet hit:
// the roof boards are torn and splintered there (sells the crash). E-W long axis.
// =====================================================================
function cattleBarn(world, b, cx, cz) {
  const L = 26, W = 9, H = 4.6, T = 0.5, sz = cz - W / 2, nz = cz + W / 2, wx = cx - L / 2, ex = cx + L / 2;
  // plinth (whitewashed lower band, all round)
  for (const [dx, dz, len, ax] of [[0, -W / 2, L, 'x'], [0, W / 2, L, 'x'], [-L / 2, 0, W, 'z'], [L / 2, 0, W, 'z']]) {
    if (ax === 'x') world._solid(b, len, 1.0, T, cx + dx, 0.5, cz + dz, WHITE.mid, { tint: 0.03 });
    else world._solid(b, T, 1.0, len, cx + dx, 0.5, cz + dz, WHITE.mid, { tint: 0.03 });
  }
  // long south wall with cattle doors; long north wall is partly DESTROYED on the east half
  world._wall(b, cx, sz, L, H, 1.0, 'x', PLANK.mid, { width: 3.0, height: 2.6 });
  stripe(b, L, H, T, cx, 1.0 + H / 2, sz, PLANK);
  // north wall: intact west span only (east half is where the jet tore through)
  const intact = L * 0.42;
  world._solid(b, intact, H, T, wx + intact / 2, 1.0 + H / 2, nz, PLANK.mid, { tint: 0.04 });
  stripe(b, intact, H, T, wx + intact / 2, 1.0 + H / 2, nz, PLANK);
  // gable ends — west whole, east shattered (jagged top)
  world._solid(b, T, H, W, wx, 1.0 + H / 2, cz, WHITE.mid, { tint: 0.03 });
  world._solid(b, T, H * 0.55, W, ex, 1.0 + H * 0.55 / 2, cz, WHITE.mid, { tint: 0.05 });
  // gabled corrugated roof (two pitched slabs); the east third is missing/torn
  for (const s of [-1, 1]) {
    const rw = L * 0.66, rx = wx + rw / 2; // only the WEST 2/3 of the roof survives
    b.box(rw, 0.18, W * 0.62, rx, H + 1.0 + 0.95, cz + s * W * 0.24, CORRUG.mid, { rx: s * 0.42, tint: 0.04 });
    b.box(rw, 0.06, W * 0.62, rx, H + 1.0 + 1.06, cz + s * W * 0.24, CORRUG.hi, { rx: s * 0.42 });
  }
  b.box(L * 0.66, 0.22, 0.32, wx + L * 0.33, H + 1.0 + 1.32, cz, RUST.lo); // ridge cap
  // splintered torn timbers at the impact corner (NE) — dark jagged stubs
  const r = makeRNG(0x5024);
  for (let i = 0; i < 10; i++) {
    const px = ex - randRange(0, L * 0.5, r), pz = nz - randRange(-0.4, 1.2, r), ph = randRange(0.6, 2.2, r);
    b.box(0.18, ph, 0.18, px, 1.0 + ph / 2 + randRange(0, 1.2, r), pz, shade(PLANK.slot, randRange(-0.04, 0.06, r)), { rz: randRange(-0.5, 0.5, r), rx: randRange(-0.4, 0.4, r) });
  }
  signPlane(world, 'КОРОВНИК', wx + intact / 2, 4.6, sz - 0.3, 5.0, 1.0, Math.PI, { color: '#1b1b1b' });
}

// =====================================================================
// МТС — машинно-тракторная станция: open-fronted repair shed (steel posts +
// gabled corrugated roof, back + side walls). Houses the ДТ-75 + a «Нива»
// combine, an inspection pit, and diesel drums. Open front faces +Z (north).
// =====================================================================
function mts(world, b, cx, cz) {
  const L = 16, W = 11, H = 5.0, sz = cz - W / 2, nz = cz + W / 2, wx = cx - L / 2, ex = cx + L / 2;
  // 4 steel posts (front pair + back pair via walls)
  for (const px of [wx + 0.4, ex - 0.4]) { world._solid(b, 0.5, H, 0.5, px, H / 2, nz - 0.4, STEEL.mid, { tint: 0.03 }); world._solid(b, 0.5, H, 0.5, px, H / 2, sz + 0.4, STEEL.mid, { tint: 0.03 }); }
  // back (south) + side walls = corrugated
  world._solid(b, L, H, 0.4, cx, H / 2, sz, CORRUG.mid, { tint: 0.04 }); stripe(b, L, H, 0.4, cx, H / 2, sz, CORRUG);
  world._solid(b, 0.4, H, W, wx, H / 2, cz, CORRUG.mid, { tint: 0.04 });
  world._solid(b, 0.4, H, W, ex, H / 2, cz, CORRUG.mid, { tint: 0.04 });
  // gabled roof
  for (const s of [-1, 1]) {
    b.box(L + 0.6, 0.2, W * 0.6, cx, H + 0.9, cz + s * W * 0.23, CORRUG.lo, { rx: s * 0.4, tint: 0.04 });
    b.box(L + 0.6, 0.06, W * 0.6, cx, H + 1.02, cz + s * W * 0.23, CORRUG.hi, { rx: s * 0.4 });
  }
  b.box(L + 0.6, 0.2, 0.3, cx, H + 1.25, cz, RUST.lo); // ridge
  // inspection pit (dark recessed slot in the floor)
  b.box(1.4, 0.1, 5.0, cx + 2.5, 0.06, cz, SCORCH);
  for (const e of [-2.6, 2.6]) b.box(1.5, 0.12, 0.2, cx + 2.5, 0.07, cz + e, STEEL.lo); // pit lip
  // contents
  tractorDT75(b, cx - 4.0, cz - 1.0, 0.4);
  buildFuelDrums(world, b, cx + 5.6, cz + 3.0, 5, makeRNG(0x4d75)); // diesel
  signPlane(world, 'МТС', cx, H + 0.45, sz - 0.22, 3.4, 1.0, Math.PI, { panel: '#9a2b22', color: '#f2e9d6', border: '#d8cfb8', size: 80 });
}

// ДТ-75 — red tracked crawler tractor. ~3.6 m hull, rear cab, side tracks, stack.
function tractorDT75(b, cx, cz, yaw) {
  const g = { ry: yaw }; const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
  // tracks (dark, slightly proud, run fore-aft = local z)
  for (const side of [-1, 1]) { const [tx, tz] = at(side * 0.92, 0); b.box(0.5, 0.7, 3.4, tx, 0.35, tz, STEEL.slot, { ry: yaw, tint: 0.03 }); b.box(0.5, 0.18, 3.4, tx, 0.62, tz, STEEL.lo, { ry: yaw }); }
  const [hx, hz] = at(0, 0.1);
  b.box(1.5, 0.9, 2.9, hx, 1.05, hz, FARMRED.mid, { ry: yaw, tint: 0.03 });          // hull
  b.box(1.5, 0.16, 2.9, hx, 1.46, hz, FARMRED.hi, { ry: yaw });                       // lit deck
  b.box(1.5, 0.16, 2.9, hx, 0.66, hz, FARMRED.lo, { ry: yaw });                       // shadow
  const [bx, bz] = at(0, -0.95); b.box(1.2, 0.7, 1.0, bx, 1.1, bz, FARMRED.lo, { ry: yaw }); // sloped nose/rad
  const [cabx, cabz] = at(0, 1.0);
  b.box(1.36, 1.2, 1.2, cabx, 2.1, cabz, STEEL.mid, { ry: yaw, tint: 0.03 });          // cab frame
  b.box(1.18, 0.9, 1.02, cabx, 2.15, cabz, GLASS, { ry: yaw });                        // glass
  b.box(1.42, 0.12, 1.28, cabx, 2.74, cabz, STEEL.lo, { ry: yaw });                    // cab roof
  const [ex2, ez2] = at(0.5, -1.2); b.box(0.18, 0.9, 0.18, ex2, 2.0, ez2, STEEL.slot, { ry: yaw }); // exhaust stack
}

// «Нива» СК-5 — big red self-propelled combine. Body + cab + grain tank + the
// wide cutting header (жатка) on the front with a reel. A landmark farm machine.
function combineNiva(b, cx, cz, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const at = (lx, lz) => [cx + lx * c - lz * s, cz + lx * s + lz * c];
  // big front + small rear wheels
  for (const side of [-1, 1]) { const [wx2, wz2] = at(side * 1.35, -1.2); b.box(0.55, 1.9, 1.9, wx2, 0.95, wz2, STEEL.slot, { ry: yaw, tint: 0.03 }); const [rx, rz] = at(side * 1.05, 2.4); b.box(0.4, 1.0, 1.0, rx, 0.5, rz, STEEL.slot, { ry: yaw }); }
  const [bx, bz] = at(0, 0.6);
  b.box(2.5, 1.6, 4.6, bx, 1.9, bz, FARMRED.mid, { ry: yaw, tint: 0.03 });             // main body
  b.box(2.5, 0.2, 4.6, bx, 2.6, bz, FARMRED.hi, { ry: yaw });
  b.box(2.5, 0.2, 4.6, bx, 1.18, bz, FARMRED.lo, { ry: yaw });
  // grain tank (open hopper on top)
  const [gx, gz] = at(0, 1.3); b.box(2.3, 0.9, 2.3, gx, 3.05, gz, STEEL.mid, { ry: yaw, tint: 0.03 }); b.box(2.0, 0.2, 2.0, gx, 3.55, gz, STRAW.mid, { ry: yaw }); // grain heap
  // unloading auger (side spout)
  const [aux, auz] = at(1.9, 1.0); b.box(2.0, 0.3, 0.3, aux, 3.1, auz, STEEL.lo, { ry: yaw + 0.3 });
  // operator cab (front-right)
  const [cabx, cabz] = at(0.7, -1.7); b.box(1.4, 1.4, 1.4, cabx, 2.6, cabz, STEEL.mid, { ry: yaw, tint: 0.03 }); b.box(1.24, 1.1, 1.24, cabx, 2.6, cabz, GLASS, { ry: yaw }); b.box(1.5, 0.14, 1.5, cabx, 3.34, cabz, STEEL.lo, { ry: yaw });
  // header / жатка — wide cutting platform forward, with a reel
  const [hx, hz] = at(0, -3.6); b.box(5.2, 0.8, 1.4, hx, 0.75, hz, STEEL.mid, { ry: yaw, tint: 0.03 }); b.box(5.2, 0.2, 1.4, hx, 1.15, hz, STEEL.hi, { ry: yaw });
  const [rlx, rlz] = at(0, -4.3); b.box(4.8, 0.5, 0.5, rlx, 1.5, rlz, RUST.mid, { ry: yaw }); // reel bar
  for (let i = -2; i <= 2; i++) { const [tx, tz] = at(i * 1.0, -4.3); b.box(0.1, 0.1, 0.7, tx, 1.5, tz, RUST.lo, { ry: yaw }); } // reel slats
}

// =====================================================================
// СИЛОСНАЯ БАШНЯ — concrete tower silo with a domed cap + ladder + bands.
// =====================================================================
function siloTower(world, b, x, z, R, H) {
  cyl(b, R, H, x, H / 2, z, CONC.mid, { seg: 16, tint: 0.03 });
  cyl(b, R * 1.02, 0.5, x, 0.25, z, CONC.lo, { seg: 16 });          // base shadow
  cyl(b, R * 1.02, 0.4, x, H - 0.2, z, CONC.hi, { seg: 16 });        // lit lip
  for (let yy = H * 0.28; yy < H; yy += H * 0.26) cyl(b, R + 0.02, 0.12, x, yy, z, CONC.slot, { seg: 16 }); // form-tie bands
  // blue domed cap
  const cap = new THREE.SphereGeometry(R * 1.04, 14, 7, 0, TAU, 0, Math.PI / 2); b.geo(cap, x, H, z, BLUE.mid, { tint: 0.03 }); cap.dispose();
  cyl(b, 0.18, 0.8, x, H + R * 0.8, z, BLUE.lo); // little vent finial
  // ladder up the +Z face
  b.box(0.05, H, 0.05, x - 0.16, H / 2, z + R + 0.04, RUST.slot); b.box(0.05, H, 0.05, x + 0.16, H / 2, z + R + 0.04, RUST.slot);
  for (let yy = 0.4; yy < H; yy += 0.5) b.box(0.34, 0.04, 0.04, x, yy, z + R + 0.04, RUST.slot);
  collider(world, x, z, R, 0, H + R * 0.6);
}

// =====================================================================
// КОНТОРА — small kolkhoz office: whitewashed walls, red roof, a доска
// почёта (honour board) + name sign on the front. Faces +Z (north).
// =====================================================================
function office(world, b, cx, cz) {
  const W = 9, D = 7, H = 3.6, sz = cz - D / 2, nz = cz + D / 2;
  world._wall(b, cx, nz, W, H, 0, 'x', WHITE.mid, { width: 1.6, height: 2.4 }); stripe(b, W, H, 0.5, cx, H / 2, nz, WHITE);
  world._solid(b, W, H, 0.5, cx, H / 2, sz, WHITE.mid, { tint: 0.03 });
  world._solid(b, 0.5, H, D, cx - W / 2, H / 2, cz, WHITE.mid, { tint: 0.03 });
  world._solid(b, 0.5, H, D, cx + W / 2, H / 2, cz, WHITE.mid, { tint: 0.03 });
  // windows (blue framed) flanking the door on the front
  for (const wx2 of [-2.6, 2.6]) { b.box(1.3, 1.3, 0.12, cx + wx2, 2.0, nz + 0.26, GLASS); b.box(1.46, 0.14, 0.16, cx + wx2, 2.66, nz + 0.27, BLUE.mid); b.box(1.46, 0.14, 0.16, cx + wx2, 1.34, nz + 0.27, BLUE.lo); }
  // low-pitch red roof + eave
  for (const s of [-1, 1]) { b.box(W + 0.6, 0.16, D * 0.6, cx, H + 0.6, cz + s * D * 0.22, FARMRED.mid, { rx: s * 0.36, tint: 0.03 }); b.box(W + 0.6, 0.06, D * 0.6, cx, H + 0.7, cz + s * D * 0.22, FARMRED.hi, { rx: s * 0.36 }); }
  b.box(W + 0.6, 0.16, 0.3, cx, H + 0.82, cz, FARMRED.lo);
  // доска почёта — honour board on the front wall (red panel, gold heading)
  signPlane(world, 'ДОСКА ПОЧЁТА', cx - 0.0, 2.2, nz + 0.3, 3.0, 1.6, 0, { panel: '#8c2018', border: '#c9a23a', color: '#e8dcb0', size: 52, cw: 600, ch: 360 });
}

// haystack — domed straw stack (widening then capping cylinders). No collider (soft).
function haystack(b, x, z, R) {
  cyl(b, R, 0.9, x, 0.45, z, STRAW.lo, { seg: 12, tint: 0.05 });
  cyl(b, R * 1.06, 1.0, x, 1.3, z, STRAW.mid, { seg: 12, tint: 0.05 });
  cyl(b, R * 0.82, 0.9, x, 2.1, z, STRAW.mid, { seg: 12, tint: 0.05 });
  const cap = new THREE.SphereGeometry(R * 0.78, 12, 6, 0, TAU, 0, Math.PI / 2); b.geo(cap, x, 2.5, z, STRAW.hi, { tint: 0.04 }); cap.dispose();
}

// well — log ring, two posts, a little gable roof and a bucket on a rope.
function well(world, b, cx, cz) {
  cyl(b, 0.9, 1.0, cx, 0.5, cz, PLANK.mid, { seg: 10, tint: 0.04 });
  cyl(b, 0.92, 0.14, cx, 1.0, cz, PLANK.hi, { seg: 10 });
  cyl(b, 0.62, 0.3, cx, 0.85, cz, SCORCH, { seg: 10 }); // dark water mouth
  for (const sx of [-0.8, 0.8]) b.box(0.16, 2.0, 0.16, cx + sx, 1.9, cz, PLANK.lo);
  b.box(0.2, 0.2, 1.4, cx, 2.7, cz, PLANK.slot); // windlass bar
  for (const s of [-1, 1]) b.box(2.0, 0.1, 1.0, cx, 3.2, cz + s * 0.4, PLANK.mid, { rx: s * 0.5 }); // gable roof
  b.box(0.05, 1.3, 0.05, cx, 2.0, cz, STEEL.slot); b.box(0.32, 0.34, 0.32, cx, 1.4, cz, RUST.mid); // rope + bucket
  collider(world, cx, cz, 0.95, 0, 1.0);
}

// обелиск ВОВ — tapering concrete pylon on a stepped base, a 3-D red star on top,
// «1941–1945» plaque. Every Soviet village had one; ties to the strongpoint war theme.
function obelisk(world, b, cx, cz) {
  b.box(2.4, 0.3, 2.4, cx, 0.15, cz, CONC.lo); b.box(1.8, 0.3, 1.8, cx, 0.45, cz, CONC.mid); // steps
  for (let i = 0; i < 5; i++) { const w = 1.0 - i * 0.13, y = 0.6 + i * 0.9; b.box(w, 0.92, w, cx, y + 0.46, cz, CONC.mid, { tint: 0.02 }); b.box(w + 0.01, 0.1, w + 0.01, cx, y + 0.92, cz, CONC.hi); }
  // 3-D red star (extruded 5-point) on top, facing +Z
  const R = 0.55, ri = R * 0.42, sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? ri : R; const px = Math.cos(a) * r, py = Math.sin(a) * r; i ? sh.lineTo(px, py) : sh.moveTo(px, py); }
  sh.closePath();
  const sg = new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }); b.geo(sg, cx, 5.7, cz, 0xc1272d); sg.dispose();
  signPlane(world, '1941—1945', cx, 1.5, cz + 0.46, 1.5, 0.6, 0, { color: '#d8cfb8', size: 44 });
  collider(world, cx, cz, 0.9, 0, 5.4);
}

// a poplar (shelterbelt tree): thin trunk collider + a pass-through canopy.
function tree(world, b, x, z, scl = 1) {
  const h = 4.2 * scl;
  b.box(0.34 * scl, h, 0.34 * scl, x, h / 2, z, shade(0x5a4327, 0.03), { tint: 0.05 });
  for (let i = 0; i < 4; i++) { const yy = h * 0.55 + i * 0.7 * scl, r = (1.7 - i * 0.32) * scl; cyl(b, r, 0.8 * scl, x, yy, z, shade(0x4e6a32, randRange(-0.06, 0.06, world._kRng)), { seg: 8, tint: 0.06 }); }
  collider(world, x, z, 0.3 * scl, 0, h * 0.6);
}

// a wheat/ochre field patch: a low slab + a scatter of taller tufts (soft cover, no collider).
function field(world, b, cx, cz, W, D, gapDir) {
  const r = world._kRng;
  b.box(W, 0.14, D, cx, 0.07, cz, shade(0xb89a4a, 0.02), { tint: 0.05 });
  for (let i = 0; i < 90; i++) {
    const px = cx + randRange(-W / 2 + 0.5, W / 2 - 0.5, r), pz = cz + randRange(-D / 2 + 0.5, D / 2 - 0.5, r);
    b.box(0.12, randRange(0.5, 0.95, r), 0.12, px, 0.4, pz, shade(0xcaa83e, randRange(-0.08, 0.08, r)), { tint: 0.06 });
  }
}

// =====================================================================
// THE CRASH — pose the Su-24 nose-buried/tail-up, plough a scorched gouge,
// scatter debris + a sheared-off wing, and raise a smoke-column landmark.
// Hooks: smoulder (per-frame fire near the player) + the FAB-500 bombs.
// =====================================================================
function su24Wreck(world, b, cx, cz, heading) {
  // ---- the airframe, posed ----
  const plane = buildSu24();
  const g = new THREE.Group();
  plane.position.set(0, 0, 6.5);          // shift so the nose (model z≈-8) sits near group origin
  g.add(plane);
  g.rotation.order = 'YXZ';
  g.rotation.y = heading;                 // crash heading (yaw)
  g.rotation.x = -0.6;                    // nose-down ~34°
  g.rotation.z = 0.26;                    // banked, one side dug in
  g.position.set(cx, 0.6, cz);
  g.scale.setScalar(1.18);                // a touch bigger — it's a landmark
  world.scene.add(g);
  // fuselage colliders (approx, along the heading) so you can't walk through it
  const c = Math.cos(heading), s = Math.sin(heading);
  for (const lz of [-3, 1, 5]) collider(world, cx + (-s * 0) + (c * 0) + s * lz * 0, cz, 2.2, 0, 3.0, 2.2);
  collider(world, cx, cz, 3.0, 0, 4.5);

  // ---- crater + scorched gouge trailing back along the approach (opposite the heading) ----
  const r = makeRNG(0x5024 ^ 0x9e);
  const gx = -Math.sin(heading), gz = -Math.cos(heading); // approach = behind the nose
  for (let i = 0; i < 9; i++) {
    const t = i / 8, fx = cx + gx * t * 30, fz = cz + gz * t * 30, w = 4.4 - t * 1.8;
    b.box(w, 0.08, 4.0 - t * 1.6, fx, 0.05, fz, i < 2 ? SCORCH2 : SCORCH, { ry: heading, tint: 0.05 });
  }
  // raised crater rim
  for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, rr2 = randRange(3.0, 4.2, r); b.box(randRange(1.0, 2.0, r), randRange(0.3, 0.7, r), randRange(1.0, 2.0, r), cx + Math.cos(a) * rr2, 0.2, cz + Math.sin(a) * rr2, shade(EARTH, randRange(-0.1, 0.05, r)), { ry: a, tint: 0.06 }); }
  // scattered debris panels
  for (let i = 0; i < 10; i++) { const a = randRange(0, TAU, r), d = randRange(3, 12, r); b.box(randRange(0.5, 1.4, r), 0.12, randRange(0.5, 1.2, r), cx + Math.cos(a) * d, 0.1, cz + Math.sin(a) * d, shade(0x8b9199, randRange(-0.1, 0.05, r)), { ry: randRange(0, TAU, r), rx: randRange(-0.3, 0.3, r), tint: 0.05 }); }

  // ---- sheared-off swing-wing in the gouge ~22 m back ----
  const wb = new MeshBuilder();
  const wgHi = 0xb8c2cc, wgMid = 0x97a2ad, wgLo = 0x6e7882;
  wb.box(5.0, 0.3, 2.0, 0, 0.2, 0, wgMid, { tint: 0.03 }); wb.box(5.0, 0.08, 2.0, 0, 0.36, 0, wgHi);
  wb.box(2.6, 0.18, 1.0, 2.8, 0.22, 0.4, wgLo, { ry: -0.5 }); // swept outer panel
  for (let i = 0; i < 5; i++) wb.box(0.2, randRange(0.3, 0.8, r), 0.2, -2.4 + i * 0.12, 0.4, randRange(-0.8, 0.8, r), 0x3a4048, { rz: randRange(-0.4, 0.4, r) }); // torn root spars
  // red star on the wing
  const sR = 0.55, sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rad = i % 2 ? sR * 0.42 : sR; const px = Math.cos(a) * rad, py = Math.sin(a) * rad; i ? sh.lineTo(px, py) : sh.moveTo(px, py); } sh.closePath();
  const ssg = new THREE.ShapeGeometry(sh); wb.geo(ssg, -1.0, 0.37, 0, 0xc6332a, { rx: -Math.PI / 2 }); ssg.dispose();
  const wing = new THREE.Mesh(wb.build(), voxelMaterial()); wing.castShadow = true; wing.receiveShadow = true;
  const wx = cx + gx * 22, wz = cz + gz * 22;
  wing.position.set(wx, 0, wz); wing.rotation.set(0.08, heading + 0.7, 0.12);
  world.scene.add(wing);
  collider(world, wx, wz, 2.4, 0, 0.8);

  return { crater: new THREE.Vector3(cx, 0.4, cz) };
}

// tall translucent voxel smoke column rising from the crater — a map-wide landmark.
// One mesh, transparent, depthWrite:false. Gently swayed each frame by updateKolkhoz.
function smokeColumn(world, x, z) {
  const sb = new MeshBuilder();
  const r = makeRNG(0x53);
  const cols = [0x3a342e, 0x4a443c, 0x55504a, 0x615b52];
  for (let i = 0; i < 18; i++) {
    const t = i / 17, y = 2 + t * 34, w = 1.4 + t * 5.6;
    const ox = Math.sin(t * 3.1) * (1 + t * 4) + randRange(-0.6, 0.6, r);
    const oz = Math.cos(t * 2.3) * (0.6 + t * 3) + randRange(-0.6, 0.6, r);
    sb.box(w, 2.6, w, ox, y, oz, cols[i % cols.length], { ry: randRange(0, TAU, r), tint: 0.06 });
  }
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.46, depthWrite: false });
  const mesh = new THREE.Mesh(sb.build(), mat);
  mesh.position.set(x, 0, z); mesh.frustumCulled = false; mesh.renderOrder = 3;
  world.scene.add(mesh);
  return mesh;
}

// =====================================================================
// FAB-500 unexploded bomb — olive GP bomb: cylindrical body, ogive nose,
// conical boxtail + 4 fins, suspension lugs, a yellow band. Half-buried at an
// angle. Shoot it (or any nearby blast) → detonates. Its own mesh so it can
// vanish on detonation; collider tagged {explodable} for the hitscan.
// =====================================================================
function fabBomb(world, x, z, yaw, pitch) {
  const bb = new MeshBuilder();
  const L = 2.6, R = 0.32;
  // body
  cyl(bb, R, L * 0.62, 0, 0, 0, OLIVE.mid, { rx: Math.PI / 2, seg: 12, tint: 0.03 });
  cyl(bb, R * 1.01, 0.1, 0, 0, -L * 0.2, OLIVE.hi, { rx: Math.PI / 2, seg: 12 });    // lit band
  cyl(bb, R + 0.02, 0.16, 0, 0, L * 0.05, 0xc9a23a, { rx: Math.PI / 2, seg: 12 });   // yellow ID band (proud)
  // ogive nose (-Z) + fuze
  const nose = new THREE.ConeGeometry(R, 0.9, 12); bb.geo(nose, 0, 0, -L * 0.62, OLIVE.mid, { rx: -Math.PI / 2, tint: 0.03 }); nose.dispose();
  bb.box(0.12, 0.12, 0.18, 0, 0, -L * 0.62 - 0.45, STEEL.slot); // fuze pocket
  // tail cone (+Z) + boxtail fins
  const tail = new THREE.ConeGeometry(R, 0.7, 12); bb.geo(tail, 0, 0, L * 0.5, OLIVE.lo, { rx: Math.PI / 2 }); tail.dispose();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bb.box(0.06, 0.7, 0.9, 0, 0, L * 0.55, OLIVE.slot, { rz: a, ry: 0 }); }
  bb.box(0.8, 0.8, 0.06, 0, 0, L * 0.72, OLIVE.slot); // boxtail ring (back plate)
  // suspension lugs on top
  for (const lz of [-0.3, 0.5]) bb.box(0.12, 0.18, 0.12, 0, R + 0.06, lz, STEEL.mid);
  const mesh = new THREE.Mesh(bb.build(), voxelMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.position.set(x, R + 0.05, z);
  mesh.rotation.set(pitch, yaw, 0.12);   // tilted, half-buried look
  mesh.position.y = R - 0.1 + Math.sin(Math.abs(pitch)) * 0.3; // sink the nose a bit
  world.scene.add(mesh);
  const bomb = { x, y: mesh.position.y, z, blastR: 8.0, dmg: 95, hp: 32, alive: true, mesh };
  const box = { min: new THREE.Vector3(x - 1.0, 0, z - 1.0), max: new THREE.Vector3(x + 1.0, 1.0, z + 1.0), explodable: bomb };
  bomb.box = box; world.boxes.push(box);
  world.fabBombs.push(bomb);
}

// ===================================================================== //
//  ENTRY                                                                 //
// ===================================================================== //
export function buildKolkhoz(world, KX, KZ) {
  const b = new MeshBuilder(); // static farm structures + crash scorch → one merged mesh (one draw call)
  world._kRng = makeRNG(0xC0FFEE);
  const at = (lx, lz) => [KX + lx, KZ + lz]; // farm-local → world (no rotation; +X east, +Z north)
  const HEAD = 2.5; // crash heading (radians) — came in from the SW, ploughing NE→SW into the barn

  // --- farm structures (static, merged) ---
  cattleBarn(world, b, ...at(0, 14));
  mts(world, b, ...at(-22, -6));
  combineNiva(b, ...at(-10, -16), 0.5);     // parked combine near the MTS (its own detail, big)
  siloTower(world, b, ...at(2, -22), 3.0, 15);
  siloTower(world, b, ...at(9, -22), 3.0, 15);
  office(world, b, ...at(18, -9));
  obelisk(world, b, ...at(13, -17));
  well(world, b, ...at(-2, 2));
  for (const [hx, hz, hr] of [[-15, 9, 2.0], [-19, 13, 1.7], [12, -3, 1.9]]) haystack(b, ...at(hx, hz), hr);
  // fields + shelterbelts (lesopolosy) — open cover; the crash gouge cuts the NW field
  field(world, b, ...at(-30, 26), 26, 22);
  field(world, b, ...at(28, 22), 22, 20);
  for (let i = 0; i <= 9; i++) tree(world, b, ...at(-42, -14 + i * 6), 1.0);   // west shelterbelt row
  for (let i = 0; i <= 7; i++) tree(world, b, ...at(-28 + i * 7, 42), 0.9);    // north shelterbelt row
  // name board at the rural entrance (south approach), faded enamel, faces the incoming player (−Z)
  signPlane(world, 'КОЛХОЗ «КРАСНЫЙ СТЕПНОЙ»', KX, 3.4, KZ - 30, 11, 1.6, Math.PI, { panel: '#bdb9aa', border: '#8a8576', color: '#7a2a26', size: 64, cw: 1500, ch: 220 });
  // gate posts at the entrance
  for (const sx of [-5, 5]) { world._solid(b, 0.8, 3.0, 0.8, KX + sx, 1.5, KZ - 30, WHITE.mid, { tint: 0.04 }); b.box(0.95, 0.3, 0.95, KX + sx, 3.0, KZ - 30, FARMRED.mid); }

  // --- crash set-piece: bake the ground scorch/gouge/debris into the farm mesh; plane + wing are separate meshes ---
  world.fabBombs = [];
  const cwx = KX + 14, cwz = KZ + 20;                 // crash/crater point (NE, by the barn corner)
  const fx = su24Wreck(world, b, cwx, cwz, HEAD);

  // commit the static farm mesh (structures + crash scorch)
  const farm = new THREE.Mesh(b.build(), voxelMaterial());
  farm.castShadow = true; farm.receiveShadow = true; world.scene.add(farm);

  const smoke = smokeColumn(world, cwx, cwz);
  // FAB-500s thrown clear on impact, half-buried at angles around the crater
  for (const [dx, dz, yaw, pit] of [[-6, -4, 0.7, -0.5], [5, -7, 2.1, -0.7], [8, 3, 1.2, -0.4], [-3, 6, 2.8, -0.55]]) fabBomb(world, cwx + dx, cwz + dz, yaw, pit);

  // --- FAB + smoulder runtime (attached to world; ticked from game.js _updatePlaying) ---
  world._kolkhozFX = { smoke, crater: fx.crater, sx: smoke.position.x, t: 0, emit: 0 };

  world.detonateFAB = function (bomb) {
    if (!bomb || !bomb.alive) return;
    bomb.alive = false;
    const p = new THREE.Vector3(bomb.x, bomb.y + 0.4, bomb.z);
    const g = this.game;
    g.effects.explosion(p.clone(), bomb.blastR);                       // FX + audio.explosion()
    g.effects.firePool(new THREE.Vector3(bomb.x, 0.1, bomb.z), bomb.blastR * 0.5, 1.4);
    const hostSim = !g.mp || !g.mp.active || g.mp.isHost;
    if (hostSim) { g.enemies.damageInRadius(p, bomb.blastR, bomb.dmg, null); g._explodeHurt(p, bomb.blastR, bomb.dmg); }
    if (bomb.mesh) bomb.mesh.visible = false;
    this.boxes = this.boxes.filter((x) => x !== bomb.box);            // remove its collider
    if (this.grid) this.grid.removeBox(bomb.box);                     // …and drop it from the spatial index
    // small scorch where it sat
    const scorch = new THREE.Mesh(new THREE.BoxGeometry(bomb.blastR, 0.06, bomb.blastR), new THREE.MeshLambertMaterial({ color: SCORCH }));
    scorch.position.set(bomb.x, 0.04, bomb.z); this.scene.add(scorch);
    this.igniteFABsNear(p, bomb.blastR * 0.85);                       // chain-detonate neighbours
  };
  world.igniteFABsNear = function (pos, radius) {
    if (!this.fabBombs) return;
    for (const bomb of this.fabBombs) if (bomb.alive && Math.hypot(bomb.x - pos.x, bomb.z - pos.z) < radius) this.detonateFAB(bomb);
  };
  world.hitFAB = function (bomb, dmg, point) {
    if (!bomb || !bomb.alive) return;
    bomb.hp -= dmg;
    this.game.effects.impact(point || new THREE.Vector3(bomb.x, bomb.y, bomb.z), new THREE.Vector3(0, 1, 0), 'spark');
    if (bomb.hp <= 0) this.detonateFAB(bomb);
  };
  world.updateKolkhoz = function (dt, ppos) {
    const fx2 = this._kolkhozFX; if (!fx2) return;
    fx2.t += dt;
    fx2.smoke.rotation.z = Math.sin(fx2.t * 0.5) * 0.05;            // gentle sway
    fx2.smoke.position.x = fx2.sx + Math.sin(fx2.t * 0.32) * 0.7;
    if (ppos && Math.hypot(ppos.x - fx2.crater.x, ppos.z - fx2.crater.z) < 75) {
      fx2.emit += dt;
      if (fx2.emit > 0.07) { fx2.emit = 0; this.game.effects.firePool(fx2.crater, 2.6, 0.5); if (Math.random() < 0.5) this.game.effects.flareSmoke(new THREE.Vector3(fx2.crater.x, 1.5, fx2.crater.z), 0.7); }
    }
  };
}
