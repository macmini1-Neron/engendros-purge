// strongpoint.js — the WW2 Soviet FIELD STRONGPOINT (опорный пункт) home base for the steppe map.
// Built object-by-object via the voxel-building-modeling skill (research-first; real dims in metres;
// layered shading; correct AABB colliders; no z-fight). Research dossiers + plan:
//   docs/superpowers/plans/2026-06-03-field-strongpoint-build.md
// Entry: buildStrongpoint(world, cx, cz) — cx/cz = strongpoint centre in world coords (+X east, +Z north).
//
// Voxel note: AABB can't dig below y=0, so every earthwork is built UP from grade — the "trench" is a
// walkable lane between an outer parapet + inner parados (you shoot over while standing), dugouts are
// earth-and-sod mounds with a real door GAP + walkable interior, the comm trench is the 2nd exit.
import * as THREE from 'three';
import { MeshBuilder, TAU, makeRNG, randRange, shade, voxelMaterial } from './util.js';

// ---- layered-shading palettes (Hi/Mid/Lo/Slot; never near-black as a main colour) ----
const EARTH = { hi: 0x6b5440, mid: 0x54422f, lo: 0x3e3122, slot: 0x2a2017 }; // chernozem spoil
const SOD   = { hi: 0x7c8a4e, mid: 0x63713c, lo: 0x49542b, slot: 0x333b1d }; // dry-steppe turf cap
const LOG   = { hi: 0x9a7a4e, mid: 0x7c6038, lo: 0x5a4427, slot: 0x3a2c19 }; // weathered timber
const LOGEND = 0xc4a574;                                                     // fresh-cut log end
const WHITE = { hi: 0xe9e3d4, mid: 0xd2ccbc, lo: 0xb3ad9c };                 // известь whitewash
const RUST  = { hi: 0x8a5a34, mid: 0x6e4526, lo: 0x4e301a };                 // rusted steel
const PLANK = 0x6a5230, PLANK_HI = 0x856a3e, IRON = 0x2a2a2e, KHAKI = 0x555c36;

// trench geometry (metres)
const LANE = 1.7, PT = 0.7, PARH = 1.3, PARDH = 0.9, TRAVH = 1.5, STEP = 0.45;

// ---- helpers (mirrors industrial.js) ----
function cyl(b, r, h, x, y, z, color, opts = {}) {
  const g = new THREE.CylinderGeometry(r, r, h, opts.seg || 12);
  b.geo(g, x, y, z, color, opts); g.dispose();
}
function collider(world, x, z, halfW, y0, y1, halfD) {
  world.boxes.push({ min: new THREE.Vector3(x - halfW, y0, z - (halfD ?? halfW)), max: new THREE.Vector3(x + halfW, y1, z + (halfD ?? halfW)) });
}
// a collidable earth wall with a sod cap (occludes the body top → no z-fight) + a dark base shadow.
function earthWall(world, b, w, h, d, x, z, opts = {}) {
  world._solid(b, w, h, d, x, h / 2, z, opts.col || EARTH.mid, { tint: opts.tint ?? 0.06 });
  b.box(w + 0.02, 0.14, d + 0.02, x, h, z, (opts.cap || SOD).mid, { tint: 0.06 });   // sod cap, proud
  b.box(w + 0.05, 0.24, d + 0.05, x, 0.12, z, EARTH.lo);                              // base shadow
}
// horizontal log courses on a face (visual) — the ДЗОТ/dugout timber look.
function logCourses(b, w, n, x, y0, z, dz, color) {
  for (let i = 0; i < n; i++) cyl(b, 0.13, w, x, y0 + 0.13 + i * 0.26, z, i % 2 ? color.mid : color.hi, { rz: Math.PI / 2, seg: 7, tint: 0.03 });
  b.box(0.16, n * 0.26, 0.16, x - w / 2, y0 + n * 0.13, z + dz * 0.0, LOGEND); // corner post end (fresh cut)
}

// ---- Cyrillic signage (CanvasTexture planes, opaque pass + alphaTest, proud of the surface) ----
function signTex(text, opts = {}) {
  const W = opts.cw || 512, H = opts.ch || 128, cv = document.createElement('canvas');
  cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
  if (opts.panel) { ctx.fillStyle = opts.panel; ctx.fillRect(0, 0, W, H); if (opts.border) { ctx.strokeStyle = opts.border; ctx.lineWidth = 8; ctx.strokeRect(4, 4, W - 8, H - 8); } }
  ctx.fillStyle = opts.color || '#e8e0cc';
  ctx.font = `bold ${opts.size || 76}px "Russo One", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signPlane(world, text, x, y, z, w, h, ry, opts = {}) {
  const tex = signTex(text, { cw: Math.max(256, Math.round(w * 52)), ch: Math.max(96, Math.round(h * 66)), ...opts });
  const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: !opts.panel, alphaTest: opts.panel ? 0 : 0.5, emissive: 0x0c0c0c, emissiveIntensity: 1, side: THREE.DoubleSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 4; m.frustumCulled = true;
  world.scene.add(m);
}

// =====================================================================
// TRENCH (траншея) — bay-and-traverse breastwork. Real: depth 1.1–1.5 m, parapet +0.3 m, firing step
// 0.4–0.5 m, traverses every 10–15 m (anti-enfilade). Voxel: walkable lane between parapet+parados,
// traverse NUBS alternate sides to weave the path + break line-of-sight along the trench.
// =====================================================================
function trenchRun(world, b, ax, fixed, a0, a1, outS) {
  const L = Math.abs(a1 - a0), mid = (a0 + a1) / 2, off = LANE / 2 + PT / 2;
  const place = (w, h, d, c1, c2) => ax === 'x' ? earthWall(world, b, w, h, d, mid, fixed + c1, c2) : earthWall(world, b, d, h, w, fixed + c1, mid, c2);
  // outer parapet (taller, firing step on its inner face) + inner parados
  place(L, PARH, PT, outS * off, {});
  place(L, PARDH, PT, -outS * off, {});
  // firing step (climbable ledge to shoot over the parapet) on the parapet's inner side
  const sFix = outS * (LANE / 2 - 0.18);
  if (ax === 'x') { world._solid(b, L, STEP, 0.5, mid, STEP / 2, fixed + sFix, EARTH.hi); b.box(L, 0.07, 0.5, mid, STEP, fixed + sFix, PLANK); }
  else { world._solid(b, 0.5, STEP, L, fixed + sFix, STEP / 2, mid, EARTH.hi); b.box(0.5, 0.07, L, fixed + sFix, STEP, mid, PLANK); }
  // traverse nubs (alternating) — weave + LOS break
  const n = Math.max(1, Math.floor(L / 5));
  for (let i = 1; i < n; i++) {
    const a = a0 + (L / n) * i * Math.sign(a1 - a0), side = (i % 2 ? 1 : -1) * outS;
    const nubFix = side * (LANE / 2 - 0.4);
    if (ax === 'x') earthWall(world, b, 0.7, TRAVH, 0.95, a, fixed + nubFix);
    else earthWall(world, b, 0.95, TRAVH, 0.7, fixed + nubFix, a);
  }
}
// a both-sided covered communication trench (corridor) from the gap toward the core.
function commRun(world, b, ax, fixed, a0, a1) {
  const L = Math.abs(a1 - a0), mid = (a0 + a1) / 2, off = LANE / 2 + PT / 2;
  if (ax === 'x') { earthWall(world, b, L, PARDH, PT, mid, fixed + off); earthWall(world, b, L, PARDH, PT, mid, fixed - off); }
  else { earthWall(world, b, PT, PARDH, L, fixed + off, mid); earthWall(world, b, PT, PARDH, L, fixed - off, mid); }
}
function buildTrench(world, b, cx, cz, H, gap) {
  // rectangular all-round ring; gaps on E (main, toward kombinát) + W (escape) sides
  trenchRun(world, b, 'x', cz + H, cx - H, cx + H, +1);                 // N edge
  trenchRun(world, b, 'x', cz - H, cx - H, cx + H, -1);                 // S edge
  trenchRun(world, b, 'z', cx + H, cz - H, cz - gap / 2, +1);           // E edge (lower half)
  trenchRun(world, b, 'z', cx + H, cz + gap / 2, cz + H, +1);           // E edge (upper half) → gap at cz
  trenchRun(world, b, 'z', cx - H, cz - H, cz - gap / 2, -1);           // W edge (lower half)
  trenchRun(world, b, 'z', cx - H, cz + gap / 2, cz + H, -1);           // W edge (upper half) → gap at cz
  commRun(world, b, 'x', cz, cx + H - 1, cx + 12);                      // E gap → core
  commRun(world, b, 'x', cz, cx - H + 1, cx - 12);                      // W gap → core
}

// =====================================================================
// БЛИНДАЖ — reinforced command dugout (КП). Real: interior ~6×3 m, 3 наката + 1.2–1.5 m earth → the
// biggest/tallest mound; blast dog-leg entrance, НП slit, radio+map, КП board + red star.
// =====================================================================
function buildBlindazh(world, b, cx, cz) {
  const W = 10, D = 7, wallH = 2.5, T = 0.8;                            // outer earth shell (interior ~8.4×5.4); tall = dominant command bunker
  const door = 1.4, dz = cz - D / 2;                                     // entrance on the −Z (S, rear) wall
  // four earth walls (collidable), door gap on the S wall
  earthWall(world, b, W, wallH, T, cx, cz + D / 2, { tint: 0.05 });      // N
  earthWall(world, b, T, wallH, D, cx - W / 2, cz, { tint: 0.05 });      // W
  earthWall(world, b, T, wallH, D, cx + W / 2, cz, { tint: 0.05 });      // E
  const seg = (W - door) / 2;
  earthWall(world, b, seg, wallH, T, cx - W / 2 + seg / 2, dz);          // S left
  earthWall(world, b, seg, wallH, T, cx + W / 2 - seg / 2, dz);          // S right
  world._solid(b, door + 0.5, 0.6, T, cx, 2.2, dz, EARTH.mid, { tint: 0.05 }); // door lintel (opening ~1.9 m)
  // visible log revetment on the front (S) wall base + накат log ends at the eaves
  for (const sx of [cx - W / 2 + 0.4, cx + W / 2 - 0.4]) logCourses(b, 0.26, 7, sx, 0, dz - T / 2 - 0.02, 1, LOG);
  // heavy log roof (3 наката) + earth + sod cap — apex ~2.9 m (dominant)
  for (let i = 0; i < 3; i++) b.box(W - 0.2 - i * 0.3, 0.24, D - 0.2 - i * 0.3, cx, wallH + 0.12 + i * 0.22, cz, i % 2 ? LOG.mid : LOG.hi, { tint: 0.03 });
  for (let i = 0; i < 12; i++) b.box(0.24, 0.24, D - 0.2, cx - W / 2 + 0.5 + i * 0.82, wallH + 0.12, cz, LOGEND); // накат butt ends (S eave)
  world._solid(b, W + 0.3, 0.5, D + 0.3, cx, wallH + 0.85, cz, EARTH.mid, { tint: 0.05 }); // earth cap (collidable roof)
  b.box(W + 0.5, 0.18, D + 0.5, cx, wallH + 1.12, cz, SOD.mid, { tint: 0.05 });           // sod cap
  b.box(W - 1.2, 0.16, D - 1.2, cx, wallH + 1.22, cz, SOD.hi, { tint: 0.06 });            // sod crown
  // НП observation cupola + slit on the roof
  world._solid(b, 1.7, 0.7, 1.5, cx + 2.4, wallH + 1.5, cz + 0.6, LOG.lo);
  b.box(1.5, 0.55, 1.3, cx + 2.4, wallH + 1.5, cz + 0.6, LOG.mid, { tint: 0.03 });
  b.box(1.2, 0.16, 0.1, cx + 2.4, wallH + 1.62, cz - 0.18, IRON);                          // dark observation slit (+Z... faces front)
  cyl(b, 0.5, 0.3, cx + 2.4, wallH + 1.95, cz + 0.6, LOG.hi, { seg: 6 });                  // cupola cap
  // chimney (stovepipe) through the roof, rear
  cyl(b, 0.12, 1.5, cx - 3, wallH + 1.8, cz + 1.5, IRON, { seg: 7 });
  // entrance porch (тамбур / blast dog-leg) in front of the door
  earthWall(world, b, 0.7, 1.7, 2.4, cx - door / 2 - 0.35, dz - 1.4);   // porch L wall
  earthWall(world, b, 0.7, 1.7, 2.4, cx + door / 2 + 0.35, dz - 1.4);   // porch R wall
  b.box(door + 1.2, 0.4, 2.6, cx, 1.8, dz - 1.4, LOG.lo);               // porch roof (above reach)
  for (let i = 0; i < 3; i++) b.box(door + 0.1, 0.15, 0.4, cx, 0.07, dz - 0.4 - i * 0.5, PLANK, { tint: i * 0.02 }); // duckboard approach
  // interior: map table + radio set + bench (walkable; door gap on S)
  world._solid(b, 2.0, 0.75, 0.9, cx + 0.5, 0.375, cz + 0.4, PLANK);    // map table
  b.box(1.9, 0.06, 0.8, cx + 0.5, 0.78, cz + 0.4, 0xb9b29a);            // map sheet (light)
  b.box(0.7, 0.5, 0.45, cx - 2.6, 0.45, cz + 1.6, IRON);               // radio set (black box)
  b.box(0.06, 1.1, 0.06, cx - 2.6, 1.2, cz + 1.6, 0x8a8680);           // radio whip antenna
  world._solid(b, 3.2, 0.4, 0.4, cx - 1, 0.2, cz - 2.0, PLANK);        // bench
  // КП board + red star on the entrance lintel; НП on the cupola
  b.box(0.62, 0.62, 0.06, cx + 1.7, 1.5, dz - T / 2 - 0.04, 0xcc2222);                  // red star backing plate (always reads)
  signPlane(world, '★', cx + 1.7, 1.5, dz - T / 2 - 0.07, 0.52, 0.52, Math.PI, { color: '#f4ecd8', size: 110 });
  signPlane(world, 'КП', cx, 2.2, dz - T / 2 - 0.05, 1.1, 0.5, Math.PI, { panel: '#3a352c', border: '#caa66a', color: '#e8e0cc', size: 80 });
  signPlane(world, 'НП', cx + 2.4, wallH + 1.62, cz - 0.26, 0.5, 0.34, 0, { color: '#e8e0cc', size: 60 });
  collider(world, cx + 2.4, cz + 0.6, 0.9, wallH, wallH + 2.0, 0.8);   // cupola block
}

// =====================================================================
// ЗЕМЛЯНКА — half-buried dugout. Real: ~5.5×3.7 m, gabled sod roof (1:2), WHITEWASHED gable ends + door,
// WHITE stovepipe through the gable, тамбур + steps, нары/буржуйка/45×45 window. opts: label, medic, ry(0|PI/2).
// =====================================================================
function buildZemlyanka(world, b, cx, cz, opts = {}) {
  const rot = opts.ry || 0, c = Math.cos(rot), s = Math.sin(rot);
  const W = 5.2, D = 3.6, wallH = 1.35, T = 0.6, ridgeY = 2.15, eaveY = wallH;
  // local→world (rotate about cx,cz): only 0 or PI/2 used → keep axis-aligned via swap
  const sw = Math.abs(s) > 0.5;                                          // ry≈90° → swap W/D axes
  const ax = sw ? D : W, az = sw ? W : D;                                // footprint along X / Z
  const half = (q) => q / 2;
  // earth side walls (collidable) — door GAP on the −(local X) short end (the тамбур end)
  const door = 1.0;
  // long walls (run along local-X = world axis 'ax')
  earthWall(world, b, sw ? T : ax, wallH, sw ? az : T, cx + (sw ? half(ax) : 0), cz + (sw ? 0 : -half(az)), { tint: 0.05 });
  earthWall(world, b, sw ? T : ax, wallH, sw ? az : T, cx - (sw ? half(ax) : 0), cz + (sw ? 0 : half(az)), { tint: 0.05 });
  // far short wall (whitewashed gable, with a 45×45 window)
  const fx = sw ? cx : cx + half(ax), fz = sw ? cz + half(az) : cz;      // far gable centre
  // (kept simple: build the two short gables explicitly for ry=0; ry=90 mirrors via sw)
  // --- For clarity this builder is authored for ry=0 (W along X); ry=PI/2 swaps via sw above only for the long walls.
  if (!sw) {
    earthWall(world, b, T, wallH, az, cx + half(ax), cz, { tint: 0.05 });         // far short wall (+X)
    // near short wall (−X) with door gap → тамбур
    const seg = (az - door) / 2;
    earthWall(world, b, T, wallH, seg, cx - half(ax), cz - half(az) + seg / 2);
    earthWall(world, b, T, wallH, seg, cx - half(ax), cz + half(az) - seg / 2);
    // whitewashed gable END walls (известь) — the iconic white zemlyanka gable (proud; sod roof clips the top corners → triangle)
    const wFar = cx + half(ax) + T / 2 + 0.04;
    b.box(0.12, ridgeY, az - 0.2, wFar, ridgeY / 2, cz, WHITE.mid, { tint: 0.05 });
    b.box(0.14, 0.5, 0.5, wFar + 0.05, 0.95, cz, 0x39424a);                        // 45×45 window (proud of the white)
    b.box(0.17, 0.64, 0.64, wFar + 0.02, 0.95, cz, PLANK);                         // window frame
    const wNear = cx - half(ax) - T / 2 - 0.04, fl0 = (az - door) / 2;
    for (const dzf of [-1, 1]) b.box(0.12, ridgeY, fl0 - 0.08, wNear, ridgeY / 2, cz + dzf * (door / 2 + fl0 / 2), WHITE.mid, { tint: 0.05 });
    b.box(0.12, ridgeY - 1.4, door, wNear, 1.4 + (ridgeY - 1.4) / 2, cz, WHITE.mid, { tint: 0.04 }); // whitewashed lintel above door
    // gabled sod roof (two pitched slabs)
    const ang = Math.atan2(ridgeY - eaveY, az / 2), sl = Math.hypot(az / 2, ridgeY - eaveY);
    b.box(ax + 0.4, 0.22, sl, cx, (ridgeY + eaveY) / 2, cz - az / 4, SOD.mid, { rx: -ang, tint: 0.04 });
    b.box(ax + 0.4, 0.22, sl, cx, (ridgeY + eaveY) / 2, cz + az / 4, SOD.mid, { rx: ang, tint: 0.04 });
    b.box(ax + 0.5, 0.14, 0.3, cx, ridgeY + 0.06, cz, SOD.hi);                     // ridge
    // тамбур porch + plank door + earth steps on the −X end
    earthWall(world, b, 1.0, 1.5, 0.6, cx - half(ax) - 0.5, cz - half(door) - 0.0);
    earthWall(world, b, 1.0, 1.5, 0.6, cx - half(ax) - 0.5, cz + half(door) + 0.0);
    b.box(1.6, 0.35, door + 0.6, cx - half(ax) - 0.6, 1.55, cz, LOG.lo);           // porch roof
    b.box(0.1, 1.4, door, cx - half(ax) - 1.1, 0.7, cz, opts.medic ? WHITE.hi : PLANK); // door (whitewashed/plank)
    for (let i = 0; i < 3; i++) b.box(0.5, 0.16, door, cx - half(ax) - 1.4 - i * 0.4, 0.08 + i * 0.16, cz, EARTH.hi); // steps
    // WHITE stovepipe out the far gable (research: through the end wall, painted white)
    cyl(b, 0.1, 1.4, cx + half(ax) + 0.25, ridgeY + 0.2, cz + az / 3, WHITE.hi, { seg: 6 });
    // interior нары bunk + буржуйка stove (walkable)
    world._solid(b, ax - 1.2, 0.5, 1.0, cx, 0.25, cz + az / 2 - 0.7, PLANK);
    b.box(0.5, 0.55, 0.5, cx + half(ax) - 0.7, 0.3, cz - az / 2 + 0.6, IRON);      // stove near entrance end
    cyl(b, 0.07, 1.0, cx + half(ax) - 0.7, 0.85, cz - az / 2 + 0.6, IRON, { seg: 6 });
  } else {
    // ry=90° variant: footprint swapped; simplified mound (long walls already placed), capped roof
    earthWall(world, b, ax, wallH, T, cx, cz + half(az), { tint: 0.05 });
    const seg = (ax - door) / 2;
    earthWall(world, b, seg, wallH, T, cx - half(ax) + seg / 2, cz - half(az));
    earthWall(world, b, seg, wallH, T, cx + half(ax) - seg / 2, cz - half(az));
    const ang = Math.atan2(ridgeY - eaveY, ax / 2), sl = Math.hypot(ax / 2, ridgeY - eaveY);
    b.box(sl, 0.22, az + 0.4, cx - ax / 4, (ridgeY + eaveY) / 2, cz, SOD.mid, { rz: ang, tint: 0.04 });
    b.box(sl, 0.22, az + 0.4, cx + ax / 4, (ridgeY + eaveY) / 2, cz, SOD.mid, { rz: -ang, tint: 0.04 });
    b.box(0.3, 0.14, az + 0.5, cx, ridgeY + 0.06, cz, SOD.hi);
    const wF9 = cz + half(az) + T / 2 + 0.04;
    b.box(ax - 0.2, ridgeY, 0.12, cx, ridgeY / 2, wF9, WHITE.mid, { tint: 0.05 });               // whitewashed far gable
    const wN9 = cz - half(az) - T / 2 - 0.04, fl9 = (ax - door) / 2;
    for (const dxf of [-1, 1]) b.box(fl9 - 0.08, ridgeY, 0.12, cx + dxf * (door / 2 + fl9 / 2), ridgeY / 2, wN9, WHITE.mid, { tint: 0.05 });
    b.box(door, ridgeY - 1.4, 0.12, cx, 1.4 + (ridgeY - 1.4) / 2, wN9, WHITE.mid, { tint: 0.04 });
    b.box(0.1, 1.4, door, cx, 0.7, cz - half(az) - 0.5, opts.medic ? WHITE.hi : PLANK);
    cyl(b, 0.1, 1.4, cx + ax / 3, ridgeY + 0.2, cz + half(az) + 0.25, WHITE.hi, { seg: 6 });
  }
  // door label
  if (opts.label) {
    const lx = sw ? cx : cx - half(ax) - 1.12, lz = sw ? cz - half(az) - 0.52 : cz, lry = sw ? 0 : -Math.PI / 2;
    signPlane(world, opts.label, lx, 1.7, lz, Math.min(2.2, opts.label.length * 0.32 + 0.3), 0.46, lry, { panel: '#2c2620', border: '#caa66a', color: opts.medic ? '#f0b4a4' : '#e8e0cc', size: 50 });
    if (opts.medic) signPlane(world, '✚', lx, 1.0, lz, 0.5, 0.5, lry, { color: '#cc2222', size: 96 });
  }
}

// =====================================================================
// ДЗОТ — wood-earth MG point. Real: ~2×2 m crib, 2–3 наката + 0.7 m earth → low mound ~4×4×1.2 m;
// splayed embrasure (outer 1.30×0.55, inner 0.40×0.18, sill ~0.4 m), soot, rear entry to the trench.
// facing = outward azimuth (rad). opts.fifty → marks the .50cal point.
// =====================================================================
function buildDZOT(world, b, cx, cz, facing, opts = {}) {
  const fx = Math.sin(facing), fz = Math.cos(facing);                   // unit vector toward the enemy sector
  const H = 1.2;
  // earth mound (collidable), elongated toward the embrasure
  world._solid(b, 4.0, H, 4.0, cx, H / 2, cz, EARTH.mid, { tint: 0.05, ry: facing });
  b.box(4.4, 0.16, 4.4, cx, H, cz, SOD.mid, { tint: 0.05, ry: facing });           // sod cap
  b.box(2.6, 0.5, 2.6, cx + fx * 0.4, H + 0.2, cz + fz * 0.4, EARTH.hi, { tint: 0.04, ry: facing }); // raised crown
  b.box(2.9, 0.14, 2.9, cx + fx * 0.4, H + 0.42, cz + fz * 0.4, SOD.hi, { tint: 0.06, ry: facing });
  // front log crib courses (visible timber under the berm) facing the enemy
  for (let i = 0; i < 4; i++) cyl(b, 0.13, 3.2, cx + fx * 1.95, 0.14 + i * 0.26, cz + fz * 1.95, i % 2 ? LOG.mid : LOG.hi, { rz: Math.PI / 2, ry: facing, seg: 7, tint: 0.03 });
  // embrasure: dark splayed slot + soot halo + the Maxim barrel
  b.box(1.3, 0.55, 0.3, cx + fx * 2.0, 0.78, cz + fz * 2.0, IRON, { ry: facing });          // outer opening (dark)
  b.box(1.7, 0.85, 0.12, cx + fx * 2.02, 0.78, cz + fz * 2.02, shade(EARTH.slot, -0.04), { ry: facing }); // soot halo
  cyl(b, 0.06, 1.1, cx + fx * 2.4, 0.78, cz + fz * 2.4, IRON, { rx: Math.PI / 2, ry: facing, seg: 6 });   // MG barrel
  if (opts.fifty) { cyl(b, 0.12, 0.9, cx + fx * 2.2, 0.78, cz + fz * 2.2, 0x33343a, { rx: Math.PI / 2, ry: facing, seg: 8 }); } // heavier .50 barrel
  // rear entrance gap toward the base centre (−facing): a low covered laz
  b.box(1.0, 1.1, 0.5, cx - fx * 1.9, 0.55, cz - fz * 1.9, EARTH.lo, { ry: facing });
  b.box(1.2, 0.3, 1.0, cx - fx * 1.6, 1.05, cz - fz * 1.6, LOG.lo, { ry: facing });          // entry roof
  // sector-of-fire stakes in front (research: marks fire arc, not Cyrillic)
  for (const a of [-0.5, 0.5]) b.box(0.08, 0.7, 0.08, cx + fx * 3.4 + Math.cos(facing) * a * 2, 0.35, cz + fz * 3.4 - Math.sin(facing) * a * 2, PLANK);
  collider(world, cx, cz, 2.0, 0, H + 0.7, 2.0);
}

// =====================================================================
// OBSTACLE BELT — ежи (Czech hedgehogs), проволочные заграждения (3-row wire), рогатки, МИНЫ signs.
// Real: hedgehog 3×L140 angle-iron ~1.1 m; wire 5–6 strands on 0.9 m pickets; МИНЫ red-on-white @ ~40 m.
// =====================================================================
function hedgehog(world, b, x, z, rng) {
  const L = 1.9, r = 0.09, col = shade(RUST.lo, randRange(-0.04, 0.05, rng)), ry = randRange(0, TAU, rng);
  b.box(L, r * 2, r * 2, x, 0.55, z, col, { ry });
  b.box(r * 2, L, r * 2, x, 0.55, z, col, { ry });
  b.box(r * 2, r * 2, L, x, 0.55, z, shade(col, 0.04), { ry });
  collider(world, x, z, 0.7, 0, 1.1);
}
function wireFence(world, b, ax, fixed, a0, a1) {
  const L = Math.abs(a1 - a0), mid = (a0 + a1) / 2, lo = Math.min(a0, a1);
  for (let p = 0; p <= L; p += 2.4) { const q = lo + p; // pickets
    if (ax === 'x') b.box(0.1, 0.95, 0.1, q, 0.475, fixed, PLANK); else b.box(0.1, 0.95, 0.1, fixed, 0.475, q, PLANK);
  }
  for (const yy of [0.3, 0.55, 0.8]) { // wire strands
    if (ax === 'x') b.box(L, 0.03, 0.03, mid, yy, fixed, 0x9a958b); else b.box(0.03, 0.03, L, fixed, yy, mid, 0x9a958b);
  }
}
function buildObstacleBelt(world, b, cx, cz, H, gap, rng) {
  // hedgehog ring (staggered) with gaps on E + W lanes; wire fences on the runs; МИНЫ stakes
  const edges = [
    ['x', cz + H, cx - H, cx + H], ['x', cz - H, cx - H, cx + H],
    ['z', cx + H, cz - H, cz - gap], ['z', cx + H, cz + gap, cz + H],
    ['z', cx - H, cz - H, cz - gap], ['z', cx - H, cz + gap, cz + H],
  ];
  for (const [ax, fixed, a0, a1] of edges) {
    wireFence(world, b, ax, fixed, a0, a1);
    const L = Math.abs(a1 - a0), lo = Math.min(a0, a1);
    for (let p = 1.5; p < L; p += 3.2) { const q = lo + p, j = (Math.round(p) % 2) * 1.3 - 0.6;
      if (ax === 'x') hedgehog(world, b, q, fixed + j, rng); else hedgehog(world, b, fixed + j, q, rng);
    }
  }
  // МИНЫ warning signs on the friendly edge (red on white, ~ every quarter side)
  for (const [sx, sz] of [[cx, cz + H + 1], [cx, cz - H - 1], [cx + H + 1, cz + H * 0.4], [cx - H - 1, cz - H * 0.4]]) {
    b.box(0.06, 0.7, 0.06, sx, 0.35, sz, PLANK);
    signPlane(world, 'МИНЫ', sx, 0.62, sz, 0.62, 0.32, 0, { panel: '#e6e0d2', border: '#cc2222', color: '#cc2222', size: 58 });
  }
}

// =====================================================================
// НП ВЫШКА — timber observation tower (landmark + overwatch). Real: 4 posts Ø0.2–0.25 m, platform ~1.7×1.7
// @ ~4 m, 1.1 m railing, X-bracing, ladder, lean-to roof. (Cosmetic landmark; not climbable.)
// =====================================================================
function buildObsTower(world, b, cx, cz) {
  const legSpan = 1.5, platY = 4.2, postR = 0.12;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = cx + sx * legSpan, lz = cz + sz * legSpan;
    cyl(b, postR, platY + 0.2, lx, (platY + 0.2) / 2, lz, LOG.mid, { seg: 7, tint: 0.03 });
    collider(world, lx, lz, 0.22, 0, platY);
  }
  for (const ry of [platY * 0.34, platY * 0.7]) { // bracing rings
    b.box(legSpan * 2 + 0.24, 0.12, 0.12, cx, ry, cz - legSpan, LOG.lo); b.box(legSpan * 2 + 0.24, 0.12, 0.12, cx, ry, cz + legSpan, LOG.lo);
    b.box(0.12, 0.12, legSpan * 2 + 0.24, cx - legSpan, ry, cz, LOG.lo); b.box(0.12, 0.12, legSpan * 2 + 0.24, cx + legSpan, ry, cz, LOG.lo);
  }
  // X cross-braces (one face)
  for (const sgn of [-1, 1]) b.box(0.1, Math.hypot(legSpan * 2, platY * 0.36), 0.1, cx + sgn * 0, platY * 0.52, cz - legSpan, LOG.mid, { rz: sgn * 0.7 });
  b.box(legSpan * 2 + 0.5, 0.18, legSpan * 2 + 0.5, cx, platY, cz, PLANK);            // platform
  for (const [sx, sz, w, d] of [[0, -1, legSpan * 2, 0.1], [0, 1, legSpan * 2, 0.1], [-1, 0, 0.1, legSpan * 2], [1, 0, 0.1, legSpan * 2]])
    b.box(w + 0.2, 1.1, d + 0.2, cx + sx * legSpan, platY + 0.55, cz + sz * legSpan, PLANK_HI); // railing
  b.box(legSpan * 2 + 0.9, 0.16, legSpan * 2 + 0.9, cx, platY + 1.7, cz, LOG.lo);     // lean-to roof
  cyl(b, 0.05, 0.2, cx, platY + 1.8, cz, LOG.lo, { seg: 5 });
  for (let i = 0; i < 8; i++) b.box(0.7, 0.05, 0.06, cx - legSpan - 0.4, 0.3 + i * 0.5, cz, PLANK); // ladder rungs
  b.box(0.06, platY, 0.06, cx - legSpan - 0.55, platY / 2, cz - 0.25, PLANK); b.box(0.06, platY, 0.06, cx - legSpan - 0.55, platY / 2, cz + 0.25, PLANK);
}

// =====================================================================
// КП-42 field kitchen (полевая кухня). Real: 3.03×1.82 m, 1.95 m (chimney down) / 2.37 m (up), 1 cauldron
// 250 L, 2 GAZ-AA wheels ~0.73 m, olive 4БО. Food/hunger station.
// =====================================================================
function buildFieldKitchen(world, b, cx, cz, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry), fwd = (dx, dz) => [cx + dx * c - dz * s, cz + dx * s + dz * c];
  const body = fwd(0, 0);
  world._solid(b, 2.4, 1.0, 1.3, body[0], 0.85, body[1], KHAKI, { tint: 0.04, ry });   // firebox/body
  b.box(2.5, 0.2, 1.4, body[0], 1.35, body[1], shade(KHAKI, 0.08), { ry });             // body top rim
  cyl(b, 0.62, 0.5, body[0], 1.55, body[1], shade(KHAKI, -0.05), { seg: 12, ry });       // cauldron
  cyl(b, 0.5, 0.18, body[0], 1.85, body[1], 0x3a3a32, { seg: 12, ry });                  // cauldron lid
  cyl(b, 0.1, 1.4, body[0] + 0.4 * s, 2.1, body[1] - 0.4 * c, IRON, { seg: 7 });          // tall chimney
  const box = fwd(-1.4, 0); world._solid(b, 0.7, 0.8, 1.2, box[0], 0.8, box[1], shade(KHAKI, 0.03), { ry }); // provisions box
  const hitch = fwd(-2.2, 0); b.box(1.6, 0.12, 0.12, (box[0] + hitch[0]) / 2, 0.6, (box[1] + hitch[1]) / 2, IRON, { ry }); // tow bar
  for (const dz of [-0.8, 0.8]) { const w = fwd(0.1, dz); cyl(b, 0.36, 0.18, w[0], 0.36, w[1], IRON, { rx: Math.PI / 2, ry, seg: 12 }); cyl(b, 0.12, 0.2, w[0], 0.36, w[1], 0x6c6760, { rx: Math.PI / 2, ry, seg: 8 }); }
  collider(world, body[0], body[1], 1.4, 0, 1.4, 0.9);
}

// =====================================================================
// КОЛОДЕЦ-ЖУРАВЛЬ — well sweep. Real: Y-fork pivot post ~3.9 m, long pole ~5 m, counterweight, low сруб rim.
// Water station + a distinctive small landmark silhouette.
// =====================================================================
function buildWell(world, b, cx, cz) {
  // сруб rim (log box around the mouth)
  for (const [dx, dz, w, d] of [[0, -0.5, 1.0, 0.16], [0, 0.5, 1.0, 0.16], [-0.5, 0, 0.16, 1.0], [0.5, 0, 0.16, 1.0]])
    world._solid(b, w, 0.5, d, cx + dx, 0.25, cz + dz, LOG.mid, { tint: 0.03 });
  b.box(0.9, 0.06, 0.9, cx, 0.04, cz, IRON);                                              // dark water
  // pivot post (Y-fork) offset from the well
  const px = cx - 2.3;
  cyl(b, 0.14, 3.9, px, 1.95, cz, LOG.mid, { seg: 8, tint: 0.03 });
  for (const sgn of [-1, 1]) b.box(0.1, 0.7, 0.1, px, 3.9, cz + sgn * 0.18, LOG.hi, { rx: sgn * 0.4 }); // fork
  collider(world, px, cz, 0.2, 0, 3.9);
  // long sweep pole, pivoted, angled down toward the well
  const ang = -0.32;
  b.box(5.2, 0.1, 0.1, px + 1.1, 3.8 + Math.sin(ang) * 0.0, cz, LOG.hi, { rz: ang, tint: 0.04 });
  b.box(0.5, 0.5, 0.5, px - 1.4, 3.4, cz, EARTH.lo);                                       // counterweight (stone)
  b.box(0.06, 1.2, 0.06, cx, 2.6, cz, 0x6c6760);                                           // hang chain
  b.box(0.3, 0.35, 0.3, cx, 1.9, cz, IRON);                                                // bucket
  b.box(0.06, 0.7, 0.06, cx + 1.4, 0.35, cz - 0.7, PLANK);                                 // ВОДА stake
  signPlane(world, 'ВОДА', cx + 1.4, 0.62, cz - 0.7, 0.6, 0.3, 0, { panel: '#2b5566', color: '#cfe6ec', size: 56 });
}

// =====================================================================
// КАПОНИР — dug-in vehicle revetment for the captured tank (U of earth berms open toward the base).
// =====================================================================
function buildRevetment(world, b, cx, cz) {
  earthWall(world, b, 8, 1.4, 0.9, cx, cz - 2.4, { tint: 0.05 });       // back berm
  earthWall(world, b, 0.9, 1.4, 5, cx - 4, cz, { tint: 0.05 });         // W berm
  earthWall(world, b, 0.9, 1.4, 5, cx + 4, cz, { tint: 0.05 });         // E berm (open toward +Z / base)
}

// =====================================================================
// Entry — assemble the strongpoint at (cx,cz). Ring half = 24 m; obstacle belt half = 33 m.
// =====================================================================
export function buildStrongpoint(world, cx, cz) {
  const rng = makeRNG(0x50F7);
  const b = new MeshBuilder();                       // one merged voxel mesh for the whole camp body
  const H = 24, GAP = 4, OB = 33, OBGAP = 5;

  // 1) earthworks: trench ring + comm trenches (E main + W escape gaps)
  buildTrench(world, b, cx, cz, H, GAP);

  // 2) core: command blindazh + dwelling/utility zemlyankas + medpunkt
  buildBlindazh(world, b, cx, cz);
  buildZemlyanka(world, b, cx - 13, cz + 8, { label: 'МАСТЕРСКАЯ' });            // dílna
  buildZemlyanka(world, b, cx - 14, cz - 7, { label: 'СКЛАД' });                 // sklad
  buildZemlyanka(world, b, cx + 1, cz - 15, { label: 'ЖИЛАЯ', ry: Math.PI / 2 });// spaní
  buildZemlyanka(world, b, cx + 13, cz - 9, { label: 'САНЧАСТЬ', medic: true }); // medpunkt

  // 3) DZOTs on the ring corners (NE .50cal covers the main approach)
  buildDZOT(world, b, cx + H - 4, cz + H - 4, Math.PI * 0.25, { fifty: true });  // NE
  buildDZOT(world, b, cx + H - 4, cz - H + 4, Math.PI * 0.75);                    // SE
  buildDZOT(world, b, cx - H + 4, cz - H + 4, Math.PI * 1.25);                    // SW
  buildDZOT(world, b, cx - H + 4, cz + H - 4, Math.PI * 1.75);                    // NW

  // 4) aux: observation tower, field kitchen, well, vehicle revetment
  buildObsTower(world, b, cx + 12, cz + 7);
  buildFieldKitchen(world, b, cx + 11, cz + 1, Math.PI / 2);
  buildWell(world, b, cx - 9, cz - 11);
  buildRevetment(world, b, cx - 26, cz - 26);

  // 5) obstacle belt (outside the trench; gaps aligned to the E + W lanes)
  buildObstacleBelt(world, b, cx, cz, OB, OBGAP, rng);

  const m = new THREE.Mesh(b.build(), voxelMaterial());
  m.castShadow = true; m.receiveShadow = true; world.scene.add(m);

  // 6) banner slogan on a plank by the main (E) gate
  signPlane(world, 'ЗА РОДИНУ!', cx + H + 0.5, 1.5, cz - 3, 3.2, 0.7, -Math.PI / 2, { panel: '#9a2b22', border: '#d8cfb8', color: '#f2e9d6', size: 72 });
}
