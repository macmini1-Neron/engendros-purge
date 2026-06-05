/* =====================================================================
   LUKA – model jako FUNKCE (buildLuka), jediný zdroj pravdy.
   Vychází z luka.js (`case 'luka'`), tady jako volatelná funkce pro
   náhledy i pro hru. Konvence: PŘEDEK/obličej = −Z, +X = divácká levá.
   Celková výška ~1.15. Staví do MeshBuilderu `b` (vertex-color merged mesh).

   Vyžaduje MeshBuilder s opcí `align` (jako ve hře / v náhledech).

   buildLuka(b, opts)
     opts.dollar : barva znaku $ na bříšku (default černá; fáze: zelená/stříbro/zlato)

   Užitečné LOKÁLNÍ kotvy (pro připnutí rekvizit zvenčí):
     ruce:   x = ±0.255, y ≈ -0.02, z ≈ 0   (Lukova LEVÁ = −X, PRAVÁ = +X)
     temeno: y ≈ 0.63 (HEAD_Y 0.34 + HEAD_R 0.32)
   ===================================================================== */

function buildLuka(b, opts = {}) {
  // paleta
  const cHead   = 0x3DA63A; // sytě zelený plyš – hlava
  const cBody   = 0x3DA63A; // tělo
  const cLimb   = 0x3DA63A; // ruce/nohy
  const cBlack  = 0x121212; // vlásky, stehy, úsměv
  const cBtn    = 0x0C0C0C; // tmavý knoflík oka
  const cRim    = 0x2C2C2C; // okraj knoflíku
  const cEye    = 0x080808; // malé pravé očko
  const cDollar = opts.dollar || cBlack; // znak $ na bříšku (mění se po fázích)

  // — pomocné výpočty na přední ploše hlavy —
  const HEAD_R = 0.32, HEAD_Y = 0.34;
  const headFront = (x, y) => {
    let u = HEAD_R*HEAD_R - x*x - (y-HEAD_Y)*(y-HEAD_Y);
    if (u < 0.0009) u = 0.0009;
    return -Math.sqrt(u);
  };
  const headSurf = (x, y) => new THREE.Vector3(x, y, headFront(x, y));
  const headNorm = (x, y) => {
    const p = headSurf(x, y);
    return new THREE.Vector3(p.x, p.y - HEAD_Y, p.z).normalize();
  };
  const stitch1 = (x, y, len, ang, color) => {
    const p = headSurf(x, y), n = headNorm(x, y);
    b.box(len, 0.012, 0.012,
      p.x - n.x*0.003, p.y - n.y*0.003, p.z - n.z*0.003,
      color, { ry: ang, align: n });
  };
  const xStitch = (x, y, len, color, rot=0) => {
    stitch1(x, y, len,  0.78 + rot, color);
    stitch1(x, y, len, -0.78 + rot, color);
  };
  const arcTube = (cx, cy, r, a0, a1, tube, color) => {
    const pts = [], steps = 14;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      const p = headSurf(cx + r*Math.cos(a), cy + r*Math.sin(a));
      const n = headNorm(cx + r*Math.cos(a), cy + r*Math.sin(a));
      pts.push(new THREE.Vector3(p.x - n.x*0.008, p.y - n.y*0.008, p.z - n.z*0.008));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, tube, 6, false);
    b.geo(g, 0, 0, 0, color); g.dispose();
  };

  // ── VLÁSKY – dva černé chloupky na temeni ──
  {
    const hair = (pts) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.017, 6, false);
      b.geo(g, 0, 0, 0, cBlack); g.dispose();
      const tip = pts[pts.length - 1];
      const cap = new THREE.SphereGeometry(0.017, 8, 8);
      b.geo(cap, tip.x, tip.y, tip.z, cBlack); cap.dispose();
    };
    hair([
      new THREE.Vector3( 0.000, 0.620,  0.020),
      new THREE.Vector3(-0.012, 0.668,  0.014),
      new THREE.Vector3(-0.030, 0.710,  0.002),
      new THREE.Vector3(-0.024, 0.740, -0.010)
    ]);
    hair([
      new THREE.Vector3( 0.010, 0.620,  0.020),
      new THREE.Vector3( 0.022, 0.674,  0.014),
      new THREE.Vector3( 0.040, 0.716,  0.002),
      new THREE.Vector3( 0.034, 0.746, -0.010)
    ]);
  }

  // ── HLAVA ──
  { const g = new THREE.SphereGeometry(HEAD_R, 18, 14);
    b.geo(g, 0, HEAD_Y, 0, cHead); g.dispose(); }

  // ── TĚLO ──
  const BODY_R = 0.23, BODY_Y = -0.12;
  { const g = new THREE.SphereGeometry(BODY_R, 20, 16);
    b.geo(g, 0, BODY_Y, 0, cBody); g.dispose(); }

  // ── RUČIČKY ──
  { const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10);
    b.geo(g, -0.255, -0.02, 0.0, cLimb, { rz:  0.78 }); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.072, 0.075, 4, 10);
    b.geo(g,  0.255, -0.02, 0.0, cLimb, { rz: -0.78 }); g.dispose(); }

  // ── NOŽIČKY ──
  { const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10);
    b.geo(g, -0.115, -0.34, 0.015, cLimb); g.dispose(); }
  { const g = new THREE.CapsuleGeometry(0.082, 0.05, 4, 10);
    b.geo(g,  0.115, -0.34, 0.015, cLimb); g.dispose(); }

  // ── PLÁŠŤ ──
  {
    const cCape = 0x349A30;
    const NU = 26, NV = 12, aHalf = 1.40;
    const shY = 0.06, hemY = -0.29, flareY = -0.20, off = 0.022;
    const bxz = (y) => Math.sqrt(Math.max(0.0004, BODY_R*BODY_R - (y-BODY_Y)*(y-BODY_Y)));
    const pos = [], idx = [], W = NU + 1;
    for (let iv = 0; iv <= NV; iv++) {
      const v = iv / NV;
      const y = shY + (hemY - shY) * v;
      const r = (y > flareY) ? bxz(y) + off
                             : bxz(flareY) + off + 0.55*(flareY - y);
      for (let iu = 0; iu <= NU; iu++) {
        const u = iu / NU;
        const a = -aHalf + 2*aHalf*u;
        const rr = r + (iv === NV ? 0.012*Math.sin(u*Math.PI*6) : 0);
        pos.push(rr*Math.sin(a), y, rr*Math.cos(a));
      }
    }
    for (let iv = 0; iv < NV; iv++)
      for (let iu = 0; iu < NU; iu++) {
        const A = iv*W+iu, C = (iv+1)*W+iu, E = iv*W+iu+1, D = (iv+1)*W+iu+1;
        idx.push(A, C, E,  E, C, D);
      }
    const base = pos.length / 3;
    for (let i = 0; i < base; i++) pos.push(pos[i*3], pos[i*3+1], pos[i*3+2]);
    const half = idx.length;
    for (let k = 0; k < half; k += 3) idx.push(idx[k]+base, idx[k+2]+base, idx[k+1]+base);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    b.geo(g, 0, 0, 0, cCape); g.dispose();
  }

  // ── KROUŽEK KOLEM KRKU ──
  {
    const cBow = 0x2E8A2A;
    const collar = new THREE.TorusGeometry(0.17, 0.02, 8, 24);
    b.geo(collar, 0, 0.05, 0, cBow, { rx: Math.PI/2 }); collar.dispose();
  }

  // ── MAŠLE vepředu u krku ──
  {
    const cBow = 0x2E8A2A;
    const bz = -0.205, by = 0.06;
    { const g = new THREE.SphereGeometry(0.026, 10, 8); g.scale(1, 1.1, 0.8);
      b.geo(g, 0, by, bz, cBow); g.dispose(); }
    { const g = new THREE.SphereGeometry(0.04, 12, 10); g.scale(1.3, 0.85, 0.5);
      b.geo(g, -0.052, by + 0.008, bz, cBow, { rz: 0.5 }); g.dispose(); }
    { const g = new THREE.SphereGeometry(0.04, 12, 10); g.scale(1.3, 0.85, 0.5);
      b.geo(g,  0.052, by + 0.008, bz, cBow, { rz: -0.5 }); g.dispose(); }
    const tail = (sx) => {
      const pts = [
        new THREE.Vector3(sx*0.012, by - 0.01, bz),
        new THREE.Vector3(sx*0.03,  by - 0.06, bz - 0.01),
        new THREE.Vector3(sx*0.02,  by - 0.12, bz - 0.005)
      ];
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.012, 5, false);
      b.geo(g, 0, 0, 0, cBow); g.dispose();
    };
    tail(-1); tail(1);
  }

  // ── ZNAK $ na bříšku (samostatná fce, ať jde přebarvit za běhu po fázích) ──
  if (!opts.noDollar) buildLukaDollar(b, cDollar);

  // ── OČI ──
  const EY = 0.40;
  { const ex = 0.135, n = headNorm(ex, EY), p = headSurf(ex, EY);
    const at = (o) => [p.x + n.x*o, p.y + n.y*o, p.z + n.z*o];
    let q;
    const rim = new THREE.TorusGeometry(0.06, 0.015, 8, 18);
    q = at(0.002); b.geo(rim, q[0], q[1], q[2], cRim, { rx: Math.PI/2, align: n }); rim.dispose();
    const face = new THREE.CylinderGeometry(0.052, 0.052, 0.022, 18);
    q = at(0.010); b.geo(face, q[0], q[1], q[2], cBtn, { align: n }); face.dispose();
    q = at(0.024);
    b.box(0.066, 0.011, 0.011, q[0], q[1], q[2], cHead, { ry:  0.78, align: n });
    b.box(0.066, 0.011, 0.011, q[0], q[1], q[2], cHead, { ry: -0.78, align: n });
  }
  { const ex = -0.135, n = headNorm(ex, EY), p = headSurf(ex, EY);
    const g = new THREE.SphereGeometry(0.036, 14, 12);
    b.geo(g, p.x + n.x*0.012, p.y + n.y*0.012, p.z + n.z*0.012, cEye); g.dispose();
    arcTube(ex, EY, 0.056, Math.PI*0.55, Math.PI*1.45, 0.010, cBlack);
  }

  // ── PUSA ──
  const smileXY = (t) => [ -0.16 + 0.32 * t, 0.205 + 0.058 * Math.pow(2*t - 1, 2) ];
  {
    const pts = [], N = 26;
    for (let i = 0; i <= N; i++) {
      const [mx, my] = smileXY(i / N);
      const p = headSurf(mx, my), n = headNorm(mx, my);
      pts.push(new THREE.Vector3(p.x - n.x*0.008, p.y - n.y*0.008, p.z - n.z*0.008));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 50, 0.012, 7, false);
    b.geo(g, 0, 0, 0, cBlack); g.dispose();
  }
  for (const t of [0.2, 0.5, 0.8]) {
    const [mx, my] = smileXY(t);
    xStitch(mx, my, 0.068, cBlack, t === 0.5 ? 0 : 0.42);
  }
  { const [lx, ly]  = smileXY(0.0);
    arcTube(lx + 0.032, ly - 0.011, 0.044,  Math.PI*0.58, Math.PI*1.42, 0.012, cBlack); }
  { const [rx2, ry2] = smileXY(1.0);
    arcTube(rx2 - 0.032, ry2 - 0.011, 0.044, -Math.PI*0.42, Math.PI*0.42, 0.012, cBlack); }
}

/* Znak $ na Lukově bříšku jako SAMOSTATNÁ geometrie (konformní trubky na povrchu
   těla). Volá ji buildLuka (pokud není opts.noDollar). Když se postaví zvlášť do
   vlastního Meshe s BÍLOU vertex-barvou (color 0xffffff = default), jde za běhu
   přebarvit přes material.color (fázová eskalace: černá→měď→stříbro→zlato). */
function buildLukaDollar(b, color = 0xffffff) {
  const BR = 0.23, BYc = -0.12, cy = -0.12;   // BODY_R, BODY_Y
  const bSurf = (x, y) => { let u = BR*BR - x*x - (y-BYc)*(y-BYc); if (u < 4e-4) u = 4e-4;
    return new THREE.Vector3(x, y, -Math.sqrt(u)); };
  const bNorm = (x, y) => { const p = bSurf(x, y);
    return new THREE.Vector3(p.x, p.y - BYc, p.z).normalize(); };
  const glyphTube = (gpts, tube) => {
    const v = gpts.map(([gx, gy]) => { const p = bSurf(gx, cy+gy), n = bNorm(gx, cy+gy);
      return new THREE.Vector3(p.x - n.x*0.004, p.y - n.y*0.004, p.z - n.z*0.004); });
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), v.length*3, tube, 6, false);
    b.geo(g, 0, 0, 0, color); g.dispose();
  };
  const bar = (bx) => { const pts = []; for (let i = 0; i <= 8; i++) pts.push([bx, -0.105 + 0.21*(i/8)]); glyphTube(pts, 0.011); };
  bar(-0.020); bar(0.020);
  glyphTube([
    [-0.046, 0.082], [-0.006, 0.099], [ 0.042, 0.074], [ 0.033, 0.032],
    [-0.012, 0.004], [-0.044, -0.032], [-0.033, -0.076], [ 0.006, -0.099], [ 0.048, -0.074]
  ], 0.012);
}
