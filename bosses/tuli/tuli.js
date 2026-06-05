/* =====================================================================
   TULI  –  enemy plyšák (Engendros, ENEATYP 2 „el amistoso")
   Vlož níže uvedený `case 'tuli':` do switch(def.shape) ve funkci
   buildViewmodel(def).  (Three.js r160, vertex-colored merged mesh)

   Konvence: PŘEDEK/obličej = −Z, nahoru = +Y, doprava = +X.
   Celková výška ~1.15. Vše skládáno z b.box() / b.geo() jako jeden mesh.

   Vizuál podle oficiálního artu (bosses/tuli/images): celý sytě ČERVENÝ plyšák,
   dva krátké zahnuté ČERVENÉ růžky z boků hlavy (custom mesh, ven→nahoru) + dva
   malé černé vlásky na temeni, levé oko = velký tmavý knoflík
   s červeným X-stehem, pravé oko = malé černé očko se závorkou (, sešitý
   úsměv s křížky, tlustý černý OBVODOVÝ pás (zapečený do těla), tenký černý
   ocásek ze zadu uprostřed.

   ─────────────────────────────────────────────────────────────────────
   !! POTŘEBA JEDNÉ MALÉ ÚPRAVY MeshBuilderu !!
   Case naklání knoflík a zapouští stehy do zaoblené hlavy → orientuje
   geometrii podle NORMÁLY. Přidej proto do MeshBuilderu podporu opce
   `align`: tam, kde na geometrii aplikuješ rx/ry/rz, PŘED translací doplň:

       if (opts.align) {
         const q = new THREE.Quaternion().setFromUnitVectors(
           new THREE.Vector3(0, 1, 0), opts.align.clone().normalize());
         geo.applyQuaternion(q);
       }

   (Pořadí transformací: rx → ry → rz → ALIGN → translace.
    align = THREE.Vector3; geometrie se natočí tak, aby +Y mířilo podél ní.)
   Pokud `align` přidat nechceš, řekni a přepíšu naklonění na čisté rx/ry/rz.
   ───────────────────────────────────────────────────────────────────── */

case 'tuli': {
  // paleta
  const cHead   = 0xE01818; // sytě červený plyš – hlava
  const cBody   = 0xE01818; // tělo (stejná sytá červená)
  const cLimb   = 0xE01818; // ruce/nohy (stejná sytá červená)
  const cBlack  = 0x121212; // ocásek, stehy, úsměv
  const cBtn    = 0x0C0C0C; // tmavý knoflík oka
  const cRim    = 0x2C2C2C; // okraj knoflíku
  const cBelt   = 0x121212; // černý pás (obvodový pruh těla)
  const cEye    = 0x080808; // malé pravé očko

  // — pomocné výpočty na přední ploše hlavy —
  const HEAD_R = 0.32, HEAD_Y = 0.34;
  const headFront = (x, y) => {
    let u = HEAD_R*HEAD_R - x*x - (y-HEAD_Y)*(y-HEAD_Y);
    if (u < 0.0009) u = 0.0009;
    return -Math.sqrt(u);                       // víc záporné = víc dopředu
  };
  const headSurf = (x, y) => new THREE.Vector3(x, y, headFront(x, y));
  const headNorm = (x, y) => {
    const p = headSurf(x, y);
    return new THREE.Vector3(p.x, p.y - HEAD_Y, p.z).normalize();
  };
  // jeden steh zapuštěný do hlavy (zarovnaný podle normály)
  const stitch1 = (x, y, len, ang, color) => {
    const p = headSurf(x, y), n = headNorm(x, y);
    b.box(len, 0.012, 0.012,
      p.x - n.x*0.003, p.y - n.y*0.003, p.z - n.z*0.003,
      color, { ry: ang, align: n });
  };
  // křížkový steh ╳ (rot = natočení celého křížku)
  const xStitch = (x, y, len, color, rot=0) => {
    stitch1(x, y, len,  0.78 + rot, color);
    stitch1(x, y, len, -0.78 + rot, color);
  };
  // souvislý oblouk (jeden kus) ležící na ploše hlavy – trubka podél oblouku
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

  // ── RŮŽKY – dva krátké zahnuté ČERVENÉ růžky z BOKŮ hlavy (CUSTOM MESH dle plyšáka) ──
  //    Ručně stavěná zužující se trubice podél krátké křivky (ne kužel-primitiv).
  {
    const makeHorn = (sign) => {
      const path = new THREE.CatmullRomCurve3([
        new THREE.Vector3(sign*0.22,  0.46,  0.02),  // kořen zapuštěný v boku hlavy
        new THREE.Vector3(sign*0.34,  0.47,  0.01),  // protažený VEN (vodorovný dosah o 20 % kratší)
        new THREE.Vector3(sign*0.404, 0.512, 0.00),  // koleno – stáčí se nahoru
        new THREE.Vector3(sign*0.42,  0.584, -0.02)  // špička NAHORU (svislý zdvih o 40 % kratší)
      ]);
      const RINGS = 10, RADIAL = 8, CAP = 4, baseR = 0.055, tipR = 0.034;
      const frames = path.computeFrenetFrames(RINGS, false);
      const pos = [], idx = [];
      const pushRing = (c, N, B, r) => {
        for (let j = 0; j < RADIAL; j++) {
          const a = (j / RADIAL) * Math.PI * 2, dx = Math.cos(a)*r, dy = Math.sin(a)*r;
          pos.push(c.x + N.x*dx + B.x*dy, c.y + N.y*dx + B.y*dy, c.z + N.z*dx + B.z*dy);
        }
      };
      // tělo – zužující se prstence podél křivky
      for (let i = 0; i <= RINGS; i++) {
        const t = i / RINGS;
        const r = tipR + (baseR - tipR) * Math.pow(1 - t, 1.3);
        pushRing(path.getPoint(t), frames.normals[i], frames.binormals[i], r);
      }
      // zaoblená KOPULE na špičce – přímo součást pláště (žádná koule navíc → nic se nepřekrývá)
      const endP = path.getPoint(1);
      const T = frames.tangents[RINGS], EN = frames.normals[RINGS], EB = frames.binormals[RINGS];
      for (let k = 1; k <= CAP; k++) {
        const phi = (k / CAP) * (Math.PI / 2), s = tipR * Math.sin(phi);
        pushRing(new THREE.Vector3(endP.x + T.x*s, endP.y + T.y*s, endP.z + T.z*s),
                 EN, EB, tipR * Math.cos(phi));
      }
      // plášť (tělo + kopule) – jednotné winding ven; stejné pro OBA růžky
      for (let i = 0; i < RINGS + CAP; i++)
        for (let j = 0; j < RADIAL; j++) {
          const a = i*RADIAL + j,            c = (i+1)*RADIAL + j;
          const e = i*RADIAL + (j+1)%RADIAL, d = (i+1)*RADIAL + (j+1)%RADIAL;
          idx.push(a, d, c,  a, e, d);
        }
      // výplň základny – vějíř uzavře kořen (skrytý v hlavě) → plný, uzavřený mesh
      const baseC = path.getPoint(0);
      const ci = pos.length / 3;
      pos.push(baseC.x, baseC.y, baseC.z);
      for (let j = 0; j < RADIAL; j++) idx.push(ci, (j + 1) % RADIAL, j);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const hL = makeHorn(-1); b.geo(hL, 0, 0, 0, cHead); hL.dispose();
    const hR = makeHorn( 1); b.geo(hR, 0, 0, 0, cHead); hR.dispose();
  }

  // ── VLÁSKY – dva černé chloupky na temeni (tloušťka jako ocásek 0.017, s čepičkou) ──
  {
    const hair = (pts) => {
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.017, 6, false);
      b.geo(g, 0, 0, 0, cBlack); g.dispose();
      const tip = pts[pts.length - 1];        // čepička zakryje otevřenou díru na špičce
      const cap = new THREE.SphereGeometry(0.017, 8, 8);
      b.geo(cap, tip.x, tip.y, tip.z, cBlack); cap.dispose();
    };
    hair([                                   // levý chloupek – nahoru-vlevo
      new THREE.Vector3( 0.000, 0.620,  0.020),
      new THREE.Vector3(-0.012, 0.668,  0.014),
      new THREE.Vector3(-0.030, 0.710,  0.002),
      new THREE.Vector3(-0.024, 0.740, -0.010)
    ]);
    hair([                                   // pravý chloupek – nahoru-vpravo
      new THREE.Vector3( 0.010, 0.620,  0.020),
      new THREE.Vector3( 0.022, 0.674,  0.014),
      new THREE.Vector3( 0.040, 0.716,  0.002),
      new THREE.Vector3( 0.034, 0.746, -0.010)
    ]);
  }

  // ── HLAVA (velká koule ~60 % výšky) ──
  { const g = new THREE.SphereGeometry(HEAD_R, 18, 14);
    b.geo(g, 0, HEAD_Y, 0, cHead); g.dispose(); }

  // ── TĚLO (krátký kulatý trup, mírně užší než hlava) ──
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

  // ── PÁS – tlustý černý pruh ZAPEČENÝ do těla (obvodový pás, à la Tolův terčík) ──
  {
    const br = BODY_R + 0.003;                                  // těsně nad povrchem těla
    const belt = new THREE.SphereGeometry(br, 28, 24, 0, Math.PI*2, 1.46, 0.52); // latitude pás kolem osy Y
    b.geo(belt, 0, BODY_Y, 0, cBelt); belt.dispose();
  }

  // ── OCÁSEK – tenký černý ocásek ze ZADU uprostřed; špička končí U ZEMĚ (neprorůstá) ──
  {
    const tailPts = [
      new THREE.Vector3( 0.00, -0.16, 0.18),   // kořen na zádech uprostřed
      new THREE.Vector3( 0.02, -0.30, 0.27),
      new THREE.Vector3( 0.08, -0.40, 0.29),
      new THREE.Vector3( 0.16, -0.44, 0.23),   // dno na úrovni chodidel (země)
      new THREE.Vector3( 0.21, -0.41, 0.17)    // špička se stáčí zpět nahoru
    ];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tailPts), 28, 0.017, 6, false);
    b.geo(g, 0, 0, 0, cBlack); g.dispose();
    const tip = tailPts[tailPts.length - 1];   // čepička na špičce (zakryje díru)
    const cap = new THREE.SphereGeometry(0.017, 8, 8);
    b.geo(cap, tip.x, tip.y, tip.z, cBlack); cap.dispose();
  }

  // ── OČI (velký knoflík s X-stehem vlevo / malé černé očko vpravo) ──
  const EY = 0.40;
  // knoflík (+X) – velké tmavé oko s X-stehem (sytě červená nit, à la Tolo)
  { const ex = 0.135, n = headNorm(ex, EY), p = headSurf(ex, EY);
    const at = (o) => [p.x + n.x*o, p.y + n.y*o, p.z + n.z*o];
    let q;
    const rim = new THREE.TorusGeometry(0.06, 0.015, 8, 18);
    q = at(0.002); b.geo(rim, q[0], q[1], q[2], cRim, { rx: Math.PI/2, align: n }); rim.dispose();
    const face = new THREE.CylinderGeometry(0.052, 0.052, 0.022, 18);
    q = at(0.010); b.geo(face, q[0], q[1], q[2], cBtn, { align: n }); face.dispose();
    // ╳ X-steh nití přes knoflík – sytě červený (barva těla)
    q = at(0.024);
    b.box(0.066, 0.011, 0.011, q[0], q[1], q[2], cHead, { ry:  0.78, align: n });
    b.box(0.066, 0.011, 0.011, q[0], q[1], q[2], cHead, { ry: -0.78, align: n });
  }
  // malé očko (−X) – černá lesklá kulička + souvislá závorka ( jako Tolo
  { const ex = -0.135, n = headNorm(ex, EY), p = headSurf(ex, EY);
    const g = new THREE.SphereGeometry(0.036, 14, 12);
    b.geo(g, p.x + n.x*0.012, p.y + n.y*0.012, p.z + n.z*0.012, cEye); g.dispose();
    arcTube(ex, EY, 0.056, Math.PI*0.55, Math.PI*1.45, 0.010, cBlack);
  }

  // ── PUSA – zapuštěná linka úsměvu + 3 křížky + kulaté závorky na koncích ──
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
  for (const t of [0.2, 0.5, 0.8]) {                 // prostřední rovně, krajní pootočené
    const [mx, my] = smileXY(t);
    xStitch(mx, my, 0.068, cBlack, t === 0.5 ? 0 : 0.42);
  }
  { const [lx, ly]  = smileXY(0.0);
    arcTube(lx + 0.032, ly - 0.011, 0.044,  Math.PI*0.58, Math.PI*1.42, 0.012, cBlack); }
  { const [rx2, ry2] = smileXY(1.0);
    arcTube(rx2 - 0.032, ry2 - 0.011, 0.044, -Math.PI*0.42, Math.PI*0.42, 0.012, cBlack); }

  break;
}
