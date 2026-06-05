/* =====================================================================
   TOLO – model jako FUNKCE (buildTolo), jediný zdroj pravdy pro náhledy.
   Vychází z tolo.js (`case 'tolo'`). Konvence: PŘEDEK = −Z, +X = doprava.
   Bílý plyšák s ČERVENÝM TERČÍKEM na bříšku (zbraň i slabé místo).
   Staví do MeshBuilderu `b` (vertex-color), vyžaduje opci `align`.

   buildTolo(b)            – celý Tolo
   Užitečné kotvy: terčík na bříšku ≈ (0, -0.12, -0.225) front (−Z).
   ===================================================================== */

function buildTolo(b, opts = {}) {
  // paleta
  const cHead   = 0xF3F3F3; // bílý plyš – hlava
  const cBody   = 0xEAEAEA; // tělo (jemně tmavší)
  const cLimb   = 0xEFEFEF; // ruce/nohy
  const cBlack  = 0x121212; // smyčka, korálek, stehy
  const cBtn    = 0x0C0C0C; // knoflík
  const cRim    = 0x2C2C2C; // okraj knoflíku
  const cRed    = opts.target != null ? opts.target : 0xD11515; // terčík

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

  // ── SMYČKA na temeni – otevřená SPIRÁLA/háček ──
  {
    const cx = 0, cy = 0.752;
    const pts = [ new THREE.Vector3(0, 0.610, 0), new THREE.Vector3(0, 0.648, 0) ];
    const M = 26, turns = 1.18, a0 = -Math.PI/2;
    for (let k = 0; k <= M; k++) {
      const f = k / M;
      const a = a0 + turns * Math.PI * 2 * f;
      const r = 0.072 - 0.038 * f;
      pts.push(new THREE.Vector3(cx + r*Math.cos(a), cy + r*Math.sin(a), 0));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 70, 0.015, 8, false);
    b.geo(g, 0, 0, 0, cBlack); g.dispose();
  }

  // ── HLAVA ──
  { const g = new THREE.SphereGeometry(HEAD_R, 18, 14);
    b.geo(g, 0, HEAD_Y, 0, cHead); g.dispose(); }

  // ── TĚLO ──
  const BODY_R = 0.23, BODY_Y = -0.12;
  { const g = new THREE.SphereGeometry(BODY_R, 20, 16);
    b.geo(g, 0, BODY_Y, 0, cBody); g.dispose(); }

  // ── TERČÍK – zapečený do bříška (sférické pásy na povrchu) ──
  {
    const tr = BODY_R + 0.002;
    const ring = new THREE.SphereGeometry(tr, 28, 48, 0, Math.PI*2, 0.362, 0.210);
    b.geo(ring, 0, BODY_Y, 0, cRed, { rx: -Math.PI/2 }); ring.dispose();
    const dot = new THREE.SphereGeometry(tr, 28, 24, 0, Math.PI*2, 0, 0.1885);
    b.geo(dot, 0, BODY_Y, 0, cRed, { rx: -Math.PI/2 }); dot.dispose();
  }

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

  // ── OČI (knoflík VLEVO, korálek VPRAVO) ──
  const EY = 0.40;
  { const ex = 0.135, n = headNorm(ex, EY), p = headSurf(ex, EY);
    const at = (o) => [p.x + n.x*o, p.y + n.y*o, p.z + n.z*o];
    let q;
    const rim = new THREE.TorusGeometry(0.056, 0.014, 8, 18);
    q = at(0.002); b.geo(rim, q[0], q[1], q[2], cRim, { rx: Math.PI/2, align: n }); rim.dispose();
    const face = new THREE.CylinderGeometry(0.048, 0.048, 0.022, 18);
    q = at(0.010); b.geo(face, q[0], q[1], q[2], cBtn, { align: n }); face.dispose();
    q = at(0.024);
    b.box(0.058, 0.010, 0.010, q[0], q[1], q[2], cHead, { ry:  0.78, align: n });
    b.box(0.058, 0.010, 0.010, q[0], q[1], q[2], cHead, { ry: -0.78, align: n });
  }
  { const ex = -0.135, n = headNorm(ex, EY), p = headSurf(ex, EY);
    const g = new THREE.SphereGeometry(0.038, 12, 10);
    b.geo(g, p.x + n.x*0.010, p.y + n.y*0.010, p.z + n.z*0.010, 0x070707); g.dispose();
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
