// =====================================================================
// LUKA — second plush boss (Engendros ENEATYP 3). Green money voodoo doll.
//
// ⚠️ KANONICKÝ ZDROJ PROPORCÍ = bosses/luka/faze-nahled.html. Geometrie i
// velikosti/kotvy rekvizit jsou portnuté 1:1 z náhledových builderů
// (luka-fn.js, coin.js, money-bag.js, top-hat.js, money-gun/money-gun.js,
// smoke-bomb.js). NEPŘESTAVOVAT odhadem — viz memory preview-is-canonical-for-game.
//
// Builders staví na s=1 (model-space, Luka tělo R 0.23, ~1.2 vysoká, face -Z),
// vrací merged geometrii centrovanou na origin. Měřítko/umístění na bosse řeší
// volající přes LUKA_PROP (s-faktory + kotvy z náhledu).
//
// buildLuka() BAKE-uje tělo do enemy-envelope (face +Z, feet y=0, ~2.25 tall)
// jako buildTolo. `$` na bříšku je samostatná recolorovatelná geometrie.
// =====================================================================
import * as THREE from 'three';
import { MeshBuilder } from './util.js';

// $ belly glyph color per phase — barvy HERNÍ (hezčí, přání uživatele), navázané na kov mincí.
// 1:1 s náhledem je MECHANIKA (evoluce prev→pop→current), NE konkrétní hex.
export const LUKA_DOLLAR = { 1: 0x121212, 2: 0xCB5A1E, 3: 0xDCE2EA, 4: 0xF3C72E };
// barva prachu per varianta mince (dopady) — navázané na herní kov mincí
export const LUKA_DUST = { copper: 0xCB5A1E, silver: 0xDCE2EA, gold: 0xF3C72E };
export const COIN_PAL = {
  silver: { metal: 0xDCE2EA, edge: 0x9AA0A8, eng: 0x6B7178 },
  gold:   { metal: 0xF3C72E, edge: 0xB8881A, eng: 0x7E5E10 },
  copper: { metal: 0xCB5A1E, edge: 0x863F16, eng: 0x4E2A0C },
};

// ── CANONICAL proporce z faze-nahled.html (model-space, s relativní k s=1 props) ──
// s = měřítko rekvizity · anchor = kotva [x,y,z] v Lukově model-space (+X vpravo, −Z předek)
export const LUKA_PROP = {
  coinS: 0.234,   // mince f1/f2/f3 scatter (silver/gold/copper) — náhled ř.97-99
  ammoS: 0.13,    // mince = munice money gunu (menší) — ř.100
  bagS:  { 3: 0.84, 4: 1.0 }, // pytel f3 / f4 (+20 %) — ř.352 / ř.412
  hatS:  0.95,    // cylindr — ř.409
  gunS:  0.36,    // money gun (GUN_SC) — ř.410
  bombS: 0.62,    // dýmovnice (BOMB_S) — ř.359
  anchor: {
    handL: [-0.30, -0.08, -0.07], // levá ruka — pytel (HAND_L ř.180)
    handR: [0.28, -0.05, -0.06],  // pravá ruka (HAND_R ř.181)
    gun:   [0.32, 0.00, -0.14],   // money gun pozice (ř.411)
    headT: [0.00, 0.565, 0.00],   // cylindr o ~5 % níž (z 0.59); koruna o chlup širší, ať hlava nekouká
    bomb:  [0.34, -0.02, -0.10],  // dýmovnice v pravé ruce (BOMB_HAND ř.360)
    clump: [0.31, -0.03, -0.05],  // f2 hrst drobáků (HANDR ř.321)
  },
};

// ---------------------------------------------------------------------------
// LUKA body (port luka-fn.js buildLuka, bez $)
// ---------------------------------------------------------------------------
function _lukaBody(b) {
  const cHead = 0x3DA63A, cBody = 0x3DA63A, cLimb = 0x3DA63A, cBlack = 0x121212, cBtn = 0x0C0C0C, cRim = 0x2C2C2C, cEye = 0x080808;
  const HEAD_R = 0.32, HEAD_Y = 0.34;
  const headFront = (x, y) => { let u = HEAD_R*HEAD_R - x*x - (y-HEAD_Y)*(y-HEAD_Y); if (u < 0.0009) u = 0.0009; return -Math.sqrt(u); };
  const headSurf = (x, y) => new THREE.Vector3(x, y, headFront(x, y));
  const headNorm = (x, y) => { const p = headSurf(x, y); return new THREE.Vector3(p.x, p.y - HEAD_Y, p.z).normalize(); };
  const stitch1 = (x, y, len, ang, color) => { const p = headSurf(x, y), n = headNorm(x, y); b.box(len, 0.012, 0.012, p.x - n.x*0.003, p.y - n.y*0.003, p.z - n.z*0.003, color, { ry: ang, align: n }); };
  const xStitch = (x, y, len, color, rot=0) => { stitch1(x, y, len,  0.78 + rot, color); stitch1(x, y, len, -0.78 + rot, color); };
  const arcTube = (cx, cy, r, a0, a1, tube, color) => {
    const pts = [], steps = 14;
    for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * (i / steps); const p = headSurf(cx + r*Math.cos(a), cy + r*Math.sin(a)); const n = headNorm(cx + r*Math.cos(a), cy + r*Math.sin(a)); pts.push(new THREE.Vector3(p.x - n.x*0.008, p.y - n.y*0.008, p.z - n.z*0.008)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, tube, 6, false); b.geo(g, 0, 0, 0, color); g.dispose();
  };
  { const hair = (pts) => { const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.017, 6, false); b.geo(g, 0, 0, 0, cBlack); g.dispose(); const tip = pts[pts.length - 1]; const cap = new THREE.SphereGeometry(0.017, 8, 8); b.geo(cap, tip.x, tip.y, tip.z, cBlack); cap.dispose(); };
    hair([ new THREE.Vector3(0.000, 0.620, 0.020), new THREE.Vector3(-0.012, 0.668, 0.014), new THREE.Vector3(-0.030, 0.710, 0.002), new THREE.Vector3(-0.024, 0.740, -0.010) ]);
    hair([ new THREE.Vector3(0.010, 0.620, 0.020), new THREE.Vector3(0.022, 0.674, 0.014), new THREE.Vector3(0.040, 0.716, 0.002), new THREE.Vector3(0.034, 0.746, -0.010) ]); }
  { const g = new THREE.SphereGeometry(HEAD_R, 18, 14); b.geo(g, 0, HEAD_Y, 0, cHead); g.dispose(); }
  const BODY_R = 0.23, BODY_Y = -0.12;
  { const g = new THREE.SphereGeometry(BODY_R, 20, 16); b.geo(g, 0, BODY_Y, 0, cBody); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10); b.geo(g, -0.255, -0.02, 0.0, cLimb, { rz:  0.78 }); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10); b.geo(g,  0.255, -0.02, 0.0, cLimb, { rz: -0.78 }); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10); b.geo(g, -0.115, -0.34, 0.015, cLimb); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10); b.geo(g,  0.115, -0.34, 0.015, cLimb); g.dispose(); }
  // PLÁŠŤ
  { const cCape = 0x349A30; const NU = 26, NV = 12, aHalf = 1.40; const shY = 0.06, hemY = -0.29, flareY = -0.20, off = 0.022;
    const bxz = (y) => Math.sqrt(Math.max(0.0004, BODY_R*BODY_R - (y-BODY_Y)*(y-BODY_Y)));
    const pos = [], idx = [], W = NU + 1;
    for (let iv = 0; iv <= NV; iv++) { const v = iv / NV; const y = shY + (hemY - shY) * v; const r = (y > flareY) ? bxz(y) + off : bxz(flareY) + off + 0.55*(flareY - y);
      for (let iu = 0; iu <= NU; iu++) { const u = iu / NU; const a = -aHalf + 2*aHalf*u; const rr = r + (iv === NV ? 0.012*Math.sin(u*Math.PI*6) : 0); pos.push(rr*Math.sin(a), y, rr*Math.cos(a)); } }
    for (let iv = 0; iv < NV; iv++) for (let iu = 0; iu < NU; iu++) { const A = iv*W+iu, C = (iv+1)*W+iu, E = iv*W+iu+1, D = (iv+1)*W+iu+1; idx.push(A, C, E, E, C, D); }
    const base = pos.length / 3; for (let i = 0; i < base; i++) pos.push(pos[i*3], pos[i*3+1], pos[i*3+2]);
    const half = idx.length; for (let k = 0; k < half; k += 3) idx.push(idx[k]+base, idx[k+2]+base, idx[k+1]+base);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); b.geo(g, 0, 0, 0, cCape); g.dispose(); }
  // KROUŽEK + MAŠLE
  { const cBow = 0x2E8A2A; const collar = new THREE.TorusGeometry(0.17, 0.02, 8, 24); b.geo(collar, 0, 0.05, 0, cBow, { rx: Math.PI/2 }); collar.dispose();
    const bz = -0.205, by = 0.06;
    { const g = new THREE.SphereGeometry(0.026, 10, 8); g.scale(1, 1.1, 0.8); b.geo(g, 0, by, bz, cBow); g.dispose(); }
    { const g = new THREE.SphereGeometry(0.04, 12, 10); g.scale(1.3, 0.85, 0.5); b.geo(g, -0.052, by + 0.008, bz, cBow, { rz: 0.5 }); g.dispose(); }
    { const g = new THREE.SphereGeometry(0.04, 12, 10); g.scale(1.3, 0.85, 0.5); b.geo(g,  0.052, by + 0.008, bz, cBow, { rz: -0.5 }); g.dispose(); }
    const tail = (sx) => { const pts = [ new THREE.Vector3(sx*0.012, by - 0.01, bz), new THREE.Vector3(sx*0.03, by - 0.06, bz - 0.01), new THREE.Vector3(sx*0.02, by - 0.12, bz - 0.005) ]; const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.012, 5, false); b.geo(g, 0, 0, 0, cBow); g.dispose(); };
    tail(-1); tail(1); }
  // OČI
  const EY = 0.40;
  { const ex = 0.135, n = headNorm(ex, EY), p = headSurf(ex, EY); const at = (o) => [p.x + n.x*o, p.y + n.y*o, p.z + n.z*o]; let q;
    const rim = new THREE.TorusGeometry(0.06, 0.015, 8, 18); q = at(0.002); b.geo(rim, q[0], q[1], q[2], cRim, { rx: Math.PI/2, align: n }); rim.dispose();
    const face = new THREE.CylinderGeometry(0.052, 0.052, 0.022, 18); q = at(0.010); b.geo(face, q[0], q[1], q[2], cBtn, { align: n }); face.dispose();
    q = at(0.024); b.box(0.066, 0.011, 0.011, q[0], q[1], q[2], cHead, { ry:  0.78, align: n }); b.box(0.066, 0.011, 0.011, q[0], q[1], q[2], cHead, { ry: -0.78, align: n }); }
  { const ex = -0.135, n = headNorm(ex, EY), p = headSurf(ex, EY); const g = new THREE.SphereGeometry(0.036, 14, 12); b.geo(g, p.x + n.x*0.012, p.y + n.y*0.012, p.z + n.z*0.012, cEye); g.dispose();
    arcTube(ex, EY, 0.056, Math.PI*0.55, Math.PI*1.45, 0.010, cBlack); }
  // PUSA
  const smileXY = (t) => [ -0.16 + 0.32 * t, 0.205 + 0.058 * Math.pow(2*t - 1, 2) ];
  { const pts = [], N = 26; for (let i = 0; i <= N; i++) { const [mx, my] = smileXY(i / N); const p = headSurf(mx, my), n = headNorm(mx, my); pts.push(new THREE.Vector3(p.x - n.x*0.008, p.y - n.y*0.008, p.z - n.z*0.008)); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, 0.012, 7, false); b.geo(g, 0, 0, 0, cBlack); g.dispose(); }
  for (const t of [0.2, 0.5, 0.8]) { const [mx, my] = smileXY(t); xStitch(mx, my, 0.068, cBlack, t === 0.5 ? 0 : 0.42); }
  { const [lx, ly] = smileXY(0.0); arcTube(lx + 0.032, ly - 0.011, 0.044,  Math.PI*0.58, Math.PI*1.42, 0.012, cBlack); }
  { const [rx2, ry2] = smileXY(1.0); arcTube(rx2 - 0.032, ry2 - 0.011, 0.044, -Math.PI*0.42, Math.PI*0.42, 0.012, cBlack); }
}

function _lukaDollar(b, color) {
  const BR = 0.23, BYc = -0.12, cy = -0.12;
  const bSurf = (x, y) => { let u = BR*BR - x*x - (y-BYc)*(y-BYc); if (u < 4e-4) u = 4e-4; return new THREE.Vector3(x, y, -Math.sqrt(u)); };
  const bNorm = (x, y) => { const p = bSurf(x, y); return new THREE.Vector3(p.x, p.y - BYc, p.z).normalize(); };
  const glyphTube = (gpts, tube) => { const v = gpts.map(([gx, gy]) => { const p = bSurf(gx, cy+gy), n = bNorm(gx, cy+gy); return new THREE.Vector3(p.x - n.x*0.004, p.y - n.y*0.004, p.z - n.z*0.004); });
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), v.length*3, tube, 6, false); b.geo(g, 0, 0, 0, color); g.dispose();
    for (const e of [v[0], v[v.length - 1]]) { const cap = new THREE.SphereGeometry(tube, 8, 6); b.geo(cap, e.x, e.y, e.z, color); cap.dispose(); } }; // zaoblené uzávěry konců (vyplní otevřené díry)
  const bar = (bx) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([bx, -0.105 + 0.21*(i/8)]); glyphTube(pts, 0.011); };
  bar(-0.020); bar(0.020);
  glyphTube([ [-0.046, 0.082], [-0.006, 0.099], [0.042, 0.074], [0.033, 0.032], [-0.012, 0.004], [-0.044, -0.032], [-0.033, -0.076], [0.006, -0.099], [0.048, -0.074] ], 0.012);
}

function _bake(geo, S, ty) { geo.rotateY(Math.PI); geo.scale(S, S, S); geo.translate(0, ty, 0); }

export function buildLuka() {
  const b = new MeshBuilder();
  _lukaBody(b);
  const geo = b.build();
  geo.rotateY(Math.PI); geo.computeBoundingBox();
  const S = 2.25 / (geo.boundingBox.max.y - geo.boundingBox.min.y);
  geo.scale(S, S, S); geo.computeBoundingBox();
  const ty = -geo.boundingBox.min.y;
  geo.translate(0, ty, 0); geo.computeBoundingBox();
  const db = new MeshBuilder(); _lukaDollar(db, 0xffffff);
  const dollar = db.build(); _bake(dollar, S, ty); dollar.computeBoundingBox();
  return { geo, dollar, bake: { S, ty } };
}

// Lukův model-space bod → baked enemy-mesh local space (bake otáčí o PI).
export function lukaAnchor(mx, my, mz, bake) { return new THREE.Vector3(-mx * bake.S, my * bake.S + bake.ty, -mz * bake.S); }
export function lukaAnchorA(a, bake) { return lukaAnchor(a[0], a[1], a[2], bake); }

// ---------------------------------------------------------------------------
// REKVIZITY — věrné porty z bosses/luka/*.js, postavené na s=1, centrované.
// Volající škáluje přes LUKA_PROP (s × bake.S pro child, × def.scale pro svět).
// ---------------------------------------------------------------------------

// COIN — port coin.js (tvar hrany dle variant + ražba $ na obou lících), s=1.
export function buildLukaCoin(variant = 'silver') {
  const b = new MeshBuilder();
  const { metal, eng } = COIN_PAL[variant] || COIN_PAL.silver;
  const R = 0.17, T = 0.05;
  if (variant === 'gold') { // 20 Kč třináctiúhelník
    const g = new THREE.CylinderGeometry(R, R, T, 13); b.geo(g, 0, 0, 0, metal, { rx: Math.PI / 2, rz: Math.PI / 13 }); g.dispose();
  } else if (variant === 'silver') { // 2 Kč kulatá s 11 vroubky
    const N = 11, K = N * 8, pts = [];
    for (let i = 0; i < K; i++) { const a = (i / K) * Math.PI * 2; const notch = 1 - 0.075 * Math.pow(Math.max(0, Math.cos(N * a)), 8); pts.push(new THREE.Vector2(Math.cos(a) * R * notch, Math.sin(a) * R * notch)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: T, bevelEnabled: false }); g.translate(0, 0, -T / 2); b.geo(g, 0, 0, 0, metal); g.dispose();
  } else { // měděná: ZAOBLENÁ hrana (5 Kč, bevel) + DROBNÉ VÝSTUPKY (drblatý okraj)
    const bev = T * 0.30, Rb = R * 0.97, N = 48, K = N * 6, pts = [];
    for (let i = 0; i < K; i++) { const a = (i / K) * Math.PI * 2; const bump = 1 + 0.030 * Math.pow(Math.max(0, Math.cos(N * a)), 2); pts.push(new THREE.Vector2(Math.cos(a) * Rb * bump, Math.sin(a) * Rb * bump)); }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: T - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4 });
    g.computeBoundingBox(); g.translate(0, 0, -(g.boundingBox.min.z + g.boundingBox.max.z) / 2); b.geo(g, 0, 0, 0, metal); g.dispose();
  }
  const glyph = (zc) => {
    b.box(0.018, 0.175, 0.024, -0.013, 0, zc, eng); b.box(0.018, 0.175, 0.024, 0.013, 0, zc, eng);
    { const t = new THREE.TorusGeometry(0.040, 0.013, 6, 18, Math.PI * 1.5); b.geo(t, 0, 0.042, zc, eng); t.dispose(); }
    { const t = new THREE.TorusGeometry(0.040, 0.013, 6, 18, Math.PI * 1.5); b.geo(t, 0, -0.042, zc, eng, { rz: Math.PI }); t.dispose(); }
    const cap = (cx2, cy2) => { const sp = new THREE.SphereGeometry(0.013, 8, 6); b.geo(sp, cx2, cy2, zc, eng); sp.dispose(); }; // zaslepí otevřené konce torus-oblouků $
    cap(0.040, 0.042); cap(0, 0.002); cap(-0.040, -0.042); cap(0, -0.002);
  };
  glyph(-T * 0.5 - 0.0085); glyph(T * 0.5 + 0.0085); // $ vtlačený ~15 % dovnitř (míň proud)
  const geo = b.build(); geo.computeBoundingBox(); return geo;
}

// MONEY BAG — port money-bag.js (měšec + uzel + nabíraná látka + utahovací šňůrky + $), s=1.
export function buildMoneyBag(dollar = 0x121212) { // dollar: $ na pytli — f3 STŘÍBRO, f4 ZLATO (default černý)
  const b = new MeshBuilder();
  const cBag = 0x6B4A2B, cTie = 0x4A3219, cBlack = dollar, R = 0.115;
  const cString = 0x8A5A2C, cKnot = cTie;
  { const g = new THREE.SphereGeometry(R, 18, 16); g.scale(1.0, 1.08, 0.95); b.geo(g, 0, 0, 0, cBag); g.dispose(); }
  { const tie = new THREE.TorusGeometry(0.05, 0.018, 8, 16); b.geo(tie, 0, R*1.08 - 0.01, 0, cTie, { rx: Math.PI/2 }); tie.dispose(); }
  { const g = new THREE.CylinderGeometry(0.055, 0.026, 0.075, 12, 1); b.geo(g, 0, R*1.08 + 0.03, 0, cBag); g.dispose(); }
  { const g = new THREE.CircleGeometry(0.038, 16); b.geo(g, 0, R*1.08 + 0.068, 0, 0x241608, { rx: -Math.PI/2 }); g.dispose(); } // tmavé kolečko = tmavý vnitřek staženého krčku
  const neckY = R*1.08 - 0.01, knot = new THREE.Vector3(0, neckY + 0.006, -R*0.66);
  for (const sx of [-1, 1]) { const g = new THREE.SphereGeometry(0.026, 10, 8); g.scale(0.95, 1.25, 0.9); b.geo(g, knot.x + sx*0.016, knot.y, knot.z, cKnot, { rz: sx*0.25 }); g.dispose(); }
  for (const sx of [-1, 1]) { // utahovací šňůrky z uzlu po předku + korálky
    const pts = [ knot.clone(), new THREE.Vector3(sx*0.028, neckY + 0.005, -R*0.62), new THREE.Vector3(sx*0.050, neckY - 0.075, -R*0.97), new THREE.Vector3(sx*0.042, neckY - 0.150, -R*0.93) ];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.0085, 6, false); b.geo(g, 0, 0, 0, cString); g.dispose();
    const tip = pts[pts.length - 1]; const bead = new THREE.SphereGeometry(0.018, 10, 8); b.geo(bead, tip.x, tip.y, tip.z, cKnot); bead.dispose();
  }
  // $ konformně do předního povrchu (−Z)
  const bSurf = (gx, gy) => { let u = R*R - gx*gx - gy*gy; if (u < 1e-4) u = 1e-4; return new THREE.Vector3(gx, gy, -0.95*Math.sqrt(u)); };
  const bNorm = (gx, gy) => { const p = bSurf(gx, gy); return new THREE.Vector3(p.x, p.y/1.08, p.z/0.95).normalize(); };
  const gtube = (g2, tube) => { const v = g2.map(([gx, gy]) => { const p = bSurf(gx, gy), n = bNorm(gx, gy); return new THREE.Vector3(p.x - n.x*0.003, p.y - n.y*0.003, p.z - n.z*0.003); });
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), v.length*3, tube, 6, false); b.geo(g, 0, 0, 0, cBlack); g.dispose();
    for (const e of [v[0], v[v.length - 1]]) { const cap = new THREE.SphereGeometry(tube, 8, 6); b.geo(cap, e.x, e.y, e.z, cBlack); cap.dispose(); } }; // zaoblené uzávěry konců $
  for (const bx of [-0.012, 0.012]) { const pts = []; for (let i = 0; i <= 8; i++) pts.push([bx, -0.060 + 0.120*(i/8)]); gtube(pts, 0.0065); }
  gtube([[-0.030,0.050],[-0.004,0.060],[0.026,0.046],[0.020,0.020],[-0.008,0.003],[-0.028,-0.020],[-0.020,-0.047],[0.004,-0.060],[0.030,-0.046]], 0.0085);
  const geo = b.build(); geo.computeBoundingBox(); return geo;
}

// TOP HAT — port top-hat.js (origin = spodek krempy, přezka na −Z), s=1.
export function buildTopHat() {
  const b = new MeshBuilder();
  const cHat = 0x17191D, cTop = 0x202329, cBand = 0x732031, cAu = 0xE8C23B, cAuLo = 0xB78A1E, cStrap = 0x732031, cHole = 0x2A0B12;
  const Rcb = 0.225, Rct = 0.235, H = 0.42, brimT = 0.024, crownBot = brimT, crownTopY = crownBot + H; // koruna o chlup širší (obepne hlavu při nižším posazení 0.565)
  // KREMPA přirozeně PROHNUTÁ nahoru (boky ±X výš, předek/zad ±Z lehce)
  const ri = 0.225, ro = 0.320, curl = 0.048;
  const liftBrim = (vx, vz) => { const r = Math.hypot(vx, vz), t = Math.min(1, Math.max(0, (r - ri) / (ro - ri))), a = Math.atan2(vz, vx); return curl * t * t * (0.6 + 0.4 * Math.cos(2 * a)); };
  { const g = new THREE.CylinderGeometry(ro, ro, brimT, 56); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + liftBrim(p.getX(i), p.getZ(i))); p.needsUpdate = true; g.computeVertexNormals(); b.geo(g, 0, brimT/2, 0, cHat); g.dispose(); }
  { const g = new THREE.TorusGeometry(0.318, 0.026, 12, 56); g.rotateX(Math.PI/2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + liftBrim(p.getX(i), p.getZ(i))); p.needsUpdate = true; g.computeVertexNormals(); b.geo(g, 0, brimT/2, 0, cHat); g.dispose(); }
  { const g = new THREE.CylinderGeometry(Rct, Rcb, H, 40, 1, true); b.geo(g, 0, crownBot + H/2, 0, cHat); g.dispose(); }
  { const g = new THREE.CylinderGeometry(Rct, Rct, 0.012, 40); b.geo(g, 0, crownTopY, 0, cTop); g.dispose(); }
  const yM = crownBot + 0.052, bandH = 0.056;   // pásek VÝŠ (ať není zespodu vidět) + přezka na stejné výšce → spojité
  { const g = new THREE.CylinderGeometry(Rcb*1.028, Rcb*1.028, bandH, 40); b.geo(g, 0, yM, 0, cBand); g.dispose(); }
  const zBand = -Rcb*1.028, zBkl = zBand - 0.005, hw = 0.042, hh = 0.034, tb = 0.013, db = 0.016; // přezka VÍC DOZADU – přímo napojená na objímku (žádný proud červený díl)
  b.box(2*hw + tb, tb, db, 0, yM + hh, zBkl, cAu); b.box(2*hw + tb, tb, db, 0, yM - hh, zBkl, cAuLo);
  b.box(tb, 2*hh + tb, db, -hw, yM, zBkl, cAu); b.box(tb, 2*hh + tb, db, hw, yM, zBkl, cAuLo);
  // JEDNA dírka přímo ve vínové objímce + vodorovný trn kotvený na levé liště
  { const hole = new THREE.CylinderGeometry(0.0115, 0.0115, 0.012, 14); b.geo(hole, hw*0.30, yM, zBand - 0.001, cHole, { rx: Math.PI/2 }); hole.dispose(); }
  const prongL = hw * 1.18;
  b.box(prongL, 0.011, db*0.7, -hw + prongL/2 - tb*0.3, yM, zBkl - 0.002, cAu);
  { const piv = new THREE.SphereGeometry(0.013, 10, 8); b.geo(piv, -hw, yM, zBkl - 0.002, cAuLo); piv.dispose(); }
  const geo = b.build(); geo.computeBoundingBox(); return geo;
}

// SMOKE BOMB — port smoke-bomb.js (origin = střed koule, knot k +X/nahoru), s=1.
export function buildSmokeBomb() {
  const b = new MeshBuilder();
  const R = 0.13, cBody = 0x16181d, cNeck = 0x32363e, cRim = 0x4a4f59, cFuse = 0xad8a52;
  { const g = new THREE.SphereGeometry(R, 20, 16); b.geo(g, 0, 0, 0, cBody); g.dispose(); }
  { const g = new THREE.CylinderGeometry(0.050, 0.060, 0.055, 16); b.geo(g, 0, R + 0.018, 0, cNeck); g.dispose(); }
  { const g = new THREE.TorusGeometry(0.052, 0.013, 8, 18); b.geo(g, 0, R + 0.044, 0, cRim, { rx: Math.PI/2 }); g.dispose(); }
  { const ny = R + 0.055; const pts = [ new THREE.Vector3(0, ny, 0), new THREE.Vector3(0.022, ny + 0.050, -0.010), new THREE.Vector3(0.060, ny + 0.085, 0.004), new THREE.Vector3(0.098, ny + 0.072, 0.022), new THREE.Vector3(0.118, ny + 0.100, 0.006) ];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.012, 6, false); b.geo(g, 0, 0, 0, cFuse); g.dispose(); }
  const geo = b.build(); geo.computeBoundingBox(); return geo;
}

// MONEY GUN — věrný port money-gun.js (zdobená flintlock bambitka), s=1, ústí −Z.
export function buildMoneyGun() {
  const b = new MeshBuilder();
  const gHi=0xEAD27A, gMid=0xC9A22B, gLo=0x8A6A16;
  const iHi=0xF4ECD6, iMid=0xE3D7B6, iLo=0xC2B48E;
  const wHi=0x8A5A28, wMid=0x633E18, wLo=0x3E2710, wSlot=0x281708;
  const cHi=0xE08A3C, cMid=0xC06A22, cLo=0x7A3F14;
  const dk=0x131110;
  const bx = (w,h,d, lx,ly,lz, col, o) => b.box(w, h, d, lx, ly, lz, col, o);
  const bg = (g, lx,ly,lz, col, o) => { b.geo(g, lx, ly, lz, col, o); g.dispose(); };
  const TA=0.13, TBx=0.10, TBy=0.07, len=0.84, yB=0.11, zF=-0.62, zBk=zF+len, zM=zF+len*0.5;
  const tri = (k=1) => { const sh=new THREE.Shape(); sh.moveTo(0,TA*k); sh.lineTo(-TBx*k,-TBy*k); sh.lineTo(TBx*k,-TBy*k); sh.closePath(); return sh; };
  const band = (ko,ki) => { const sh=tri(ko); const h=new THREE.Path(); h.moveTo(0,TA*ki); h.lineTo(-TBx*ki,-TBy*ki); h.lineTo(TBx*ki,-TBy*ki); h.closePath(); sh.holes.push(h); return sh; };
  // HLAVEŇ (slonovina)
  bg(new THREE.ExtrudeGeometry(tri(1),{depth:len,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:2}), 0,yB,zF, iMid);
  bx(0.205,0.014,len, 0,yB-TBy-0.006,zM, iLo);
  for (const [ex,ey,col] of [[0,TA,gHi],[-TBx,-TBy,gLo],[TBx,-TBy,gMid]])
    bg(new THREE.CylinderGeometry(0.012,0.012,len,12), ex,yB+ey,zM, col, {rx:Math.PI/2});
  for (const [zc,ko,ki,col] of [[zF+0.005,1.17,0.9,gMid],[zF+0.22,1.05,0.94,gHi],[zM+0.06,1.05,0.94,gMid],[zBk-0.16,1.08,0.92,gHi]])
    bg(new THREE.ExtrudeGeometry(band(ko,ki),{depth:0.028,bevelEnabled:false}), 0,yB,zc, col);
  for (let i=0;i<8;i++) for (const ex of [-TBx,TBx]) bg(new THREE.SphereGeometry(0.008,8,8), ex,yB-TBy-0.003,zF+0.08+i*0.095, gHi);
  for (let i=0;i<7;i++) bg(new THREE.SphereGeometry(0.0075,8,8), 0,yB+TA+0.004,zF+0.13+i*0.10, gHi);
  // PŘEDNÍ ČELO = ILUMINÁT
  const ez = zF-0.03;
  bg(new THREE.CylinderGeometry(0.05,0.056,0.34,30), 0,yB,zF+0.16, dk, {rx:Math.PI/2});
  { const t=new THREE.TorusGeometry(0.05,0.024,12,32); t.scale(1.35,0.85,0.55); bg(t,0,yB,ez,iHi); }
  { const t=new THREE.TorusGeometry(0.072,0.013,12,34); t.scale(1.35,0.85,0.55); bg(t,0,yB,ez-0.004,gHi); }
  bg(new THREE.TorusGeometry(0.036,0.009,10,28), 0,yB,ez+0.002, gMid);
  for (let i=0;i<14;i++){ const a=i/14*Math.PI*2, rx2=0.092, ry2=0.064; bg(new THREE.ConeGeometry(0.012,0.07,6), Math.cos(a)*rx2,yB+Math.sin(a)*ry2,ez+0.004, (i%2?gHi:gMid), {rz:-a-Math.PI/2}); }
  // BOČNÍ MEDAILONY: BÝK (+X) / MEDVĚD (−X)
  for (const sx of [1,-1]) {
    const xc = sx*0.092, yc = yB, zc = zM;
    bg(new THREE.CylinderGeometry(0.058,0.058,0.012,28), xc,yc,zc, gMid, {rz:Math.PI/2});
    bg(new THREE.TorusGeometry(0.058,0.008,10,30), xc+sx*0.004,yc,zc, gHi, {ry:Math.PI/2});
    const xe = xc + sx*0.012;
    if (sx === 1) { bg(new THREE.CylinderGeometry(0.026,0.022,0.010,18), xe,yc-0.006,zc, dk, {ry:Math.PI/2}); bx(0.010,0.020,0.032, xe,yc-0.026,zc, dk);
      for (const hz of [-1,1]) bg(new THREE.TorusGeometry(0.024,0.005,8,16,Math.PI*0.6), xe,yc+0.014,zc+hz*0.022, dk, {ry:Math.PI/2, rz: hz<0 ? -0.6 : Math.PI+0.6});
      for (const ze of [-0.011,0.011]) bg(new THREE.SphereGeometry(0.005,8,8), xe+0.006,yc-0.002,zc+ze, gHi);
    } else { bg(new THREE.CylinderGeometry(0.028,0.028,0.010,24), xe,yc-0.002,zc, dk, {ry:Math.PI/2});
      for (const ze of [-0.024,0.024]) bg(new THREE.CylinderGeometry(0.012,0.012,0.010,16), xe,yc+0.024,zc+ze, dk, {ry:Math.PI/2});
      bg(new THREE.SphereGeometry(0.011,12,10), xe+0.006,yc-0.013,zc, gHi);
      for (const ze of [-0.010,0.010]) bg(new THREE.SphereGeometry(0.004,8,8), xe+0.005,yc+0.004,zc+ze, gHi);
    }
  }
  // MINCE = munice (měď) v žlábku po hřbetu
  bx(0.062,0.026,0.56, 0,yB+TA+0.008,zF+0.30, gLo);
  for (let i=0;i<6;i++){ const zc=zF+0.14+i*0.078; bg(new THREE.CylinderGeometry(0.05,0.05,0.02,20), 0,yB+TA+0.042,zc, cMid, {rx:Math.PI/2}); bg(new THREE.CylinderGeometry(0.051,0.051,0.006,20), 0,yB+TA+0.062,zc, cHi, {rx:Math.PI/2}); }
  // KOHOUT (flintlock)
  const hz = zBk-0.04, hy = yB+TA-0.02;
  bx(0.085,0.07,0.13, 0,hy,hz, gMid);
  bg(new THREE.CylinderGeometry(0.02,0.02,0.10,12), 0,hy+0.02,hz, gHi, {rz:Math.PI/2});
  bx(0.05,0.14,0.05, 0,hy+0.085,hz+0.055, gMid, {rx:0.55});
  bx(0.05,0.12,0.045, 0,hy+0.20,hz+0.135, gHi, {rx:0.95});
  bx(0.018,0.10,0.018, 0.03,hy+0.13,hz+0.085, gLo, {rx:0.7});
  bx(0.018,0.10,0.018, -0.03,hy+0.13,hz+0.085, gLo, {rx:0.7});
  bx(0.062,0.05,0.055, 0,hy+0.26,hz+0.175, gLo, {rx:0.95});
  bx(0.045,0.04,0.04, 0,hy+0.30,hz+0.20, dk, {rx:0.95});
  bg(new THREE.CylinderGeometry(0.012,0.012,0.05,8), 0,hy+0.245,hz+0.165, gHi, {rx:0.95,rz:Math.PI/2});
  bx(0.05,0.11,0.028, 0,hy+0.075,hz-0.075, gHi, {rx:-0.45});
  bx(0.06,0.025,0.05, 0,hy+0.01,hz-0.06, gMid);
  // RUKOJEŤ + PAŽBA (dřevo)
  bx(0.18,0.22,0.22, 0,0.0,zBk-0.02, wMid);
  bx(0.185,0.032,0.225, 0,0.10,zBk-0.02, wHi); bx(0.185,0.03,0.225, 0,-0.10,zBk-0.02, wLo);
  bg(new THREE.TorusGeometry(0.085,0.015,10,26), 0,-0.05,zBk+0.04, gMid, {rx:-0.5,ry:Math.PI/2});
  bx(0.155,0.42,0.17, 0,-0.20,zBk+0.10, wMid, {rx:-0.5});
  bx(0.024,0.40,0.16, 0.078,-0.20,zBk+0.10, wHi, {rx:-0.5});
  bx(0.024,0.40,0.16, -0.078,-0.20,zBk+0.10, wLo, {rx:-0.5});
  bx(0.10,0.36,0.012, 0,-0.19,zBk+0.018, wSlot, {rx:-0.5});
  for (const sx of [1,-1]) bx(0.022,0.21,0.135, sx*0.080,-0.18,zBk+0.108, iHi, {rx:-0.5});
  // $ medailon na pažbě
  for (const sx of [1,-1]) {
    const xc = sx*0.094, yc = -0.18, zc = zBk+0.115, ro = {rx:-0.5, ry:Math.PI/2};
    bg(new THREE.TorusGeometry(0.052,0.010,10,26), xc,yc,zc, gMid, ro);
    bx(0.012,0.060,0.012, xc, yc, zc-0.012, gHi, {rx:-0.5});
    bx(0.012,0.060,0.012, xc, yc, zc+0.012, gHi, {rx:-0.5});
    { const t=new THREE.TorusGeometry(0.018,0.006,8,18,Math.PI*1.5); bg(t, xc,yc+0.020,zc, gHi, {rx:-0.5, ry:Math.PI/2}); }
    { const t=new THREE.TorusGeometry(0.018,0.006,8,18,Math.PI*1.5); bg(t, xc,yc-0.020,zc, gHi, {rx:-0.5, ry:Math.PI/2, rz:Math.PI}); }
  }
  // KOULE (pommel)
  bg(new THREE.SphereGeometry(0.105,24,18), 0,-0.40,zBk+0.205, wMid);
  bg(new THREE.TorusGeometry(0.105,0.016,10,26), 0,-0.40,zBk+0.205, gHi, {ry:Math.PI/2});
  bg(new THREE.TorusGeometry(0.088,0.013,10,24), 0,-0.40,zBk+0.205, gMid, {rx:Math.PI/2});
  // lučík + spoušť
  bg(new THREE.TorusGeometry(0.06,0.014,10,24), 0,-0.075,zBk+0.0, gMid, {ry:Math.PI/2});
  bx(0.016,0.06,0.016, 0,-0.06,zBk+0.0, dk, {rx:0.3});
  const geo = b.build(); geo.computeBoundingBox(); return geo;
}
