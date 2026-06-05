/* =====================================================================
   MONEY BAG ($)  –  samostatný rekvizit pro Lukovy bossové útoky
   ---------------------------------------------------------------------
   Vyjmuto z Lukova modelu – pytlík NENÍ součást postavy (Luka má plášť),
   ale hodí se jako projektil/hozená věc při útocích bosse.

   Použití (Three.js r160, stejný MeshBuilder jako buildViewmodel):
     buildMoneyBag(b, x, y, z, s);
   kde b = MeshBuilder, (x,y,z) = střed měšce, s = měřítko (1 = výchozí).
   Vykreslí: protáhlá koule (měšec) + torus-uzel (stažený krk) + kornout
   nabírané látky nad uzlem + znak $ (svislá čára + dvě torus-„C") na −Z.
   ===================================================================== */

function buildMoneyBag(b, x, y, z, s = 1, opts = {}) {
  // POZOR: pro Lukův útok ve fázi 2 je pytel HNĚDÝ s černým $ (drží ho v levé ruce).
  // Barvy lze přebít přes opts (col/tie) — kdyby se hodil jinde i v jiné barvě.
  const cBag   = opts.col != null ? opts.col : 0x6B4A2B; // pytlík (hnědá)
  const cTie   = opts.tie != null ? opts.tie : 0x4A3219; // stažený krk / provázek (tmavší hnědá)
  const cBlack = 0x121212; // znak $
  const R = 0.115 * s;

  // měšec (mírně protáhlá koule)
  { const g = new THREE.SphereGeometry(R, 18, 16); g.scale(1.0, 1.08, 0.95);
    b.geo(g, x, y, z, cBag); g.dispose(); }
  // stažený krk (provázek)
  { const tie = new THREE.TorusGeometry(0.05*s, 0.018*s, 8, 16);
    b.geo(tie, x, y + R*1.08 - 0.01*s, z, cTie, { rx: Math.PI/2 }); tie.dispose(); }
  // nabíraná látka nad uzlem (rozšířená nahoru)
  { const g = new THREE.CylinderGeometry(0.055*s, 0.026*s, 0.075*s, 12, 1);
    b.geo(g, x, y + R*1.08 + 0.03*s, z, cBag); g.dispose(); }

  // ── UZEL + UTAHOVACÍ ŠŇŮRKY (přímo na pytlíku: z uzlu splývají dva konce po předku) ──
  const neckY = y + R*1.08 - 0.01*s;
  const cString = opts.string != null ? opts.string : 0x8A5A2C; // konopná šňůrka
  const cKnot   = opts.bow != null ? opts.bow : cTie;           // uzlík
  const knot = new THREE.Vector3(x, neckY + 0.006*s, z - R*0.66);  // uzel TĚSNĚ na předku stažení (sedí na tie, ne zobák)
  // dvojlaločný uzlík (pinch staženého krku) – dvě malé laloky, spojené s tie/pytlem
  for (const sx of [-1, 1]) { const g = new THREE.SphereGeometry(0.026*s, 10, 8); g.scale(0.95, 1.25, 0.9);
    b.geo(g, knot.x + sx*0.016*s, knot.y, knot.z, cKnot, { rz: sx*0.25 }); g.dispose(); }
  for (const sx of [-1, 1]) {                                   // dva konce z uzlu – splývají po předku pytle
    const pts = [
      knot.clone(),
      new THREE.Vector3(x + sx*0.028*s, neckY + 0.005*s, z - R*0.62),
      new THREE.Vector3(x + sx*0.050*s, neckY - 0.075*s, z - R*0.97),
      new THREE.Vector3(x + sx*0.042*s, neckY - 0.150*s, z - R*0.93),
    ];
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.0085*s, 6, false);
    b.geo(g, 0, 0, 0, cString); g.dispose();
    const tip = pts[pts.length - 1];
    const bead = new THREE.SphereGeometry(0.018*s, 10, 8);      // korálek/aglet na konci
    b.geo(bead, tip.x, tip.y, tip.z, cKnot); bead.dispose();
  }

  // znak $ KONFORMNĚ zapuštěný do předního povrchu pytle (−Z) — kopíruje jeho
  // zaoblení (jako $ na Lukově bříšku), takže je jeho součástí, ne nalepená placka.
  const cy = y;
  const bSurf = (gx, gy) => { let u = R*R - gx*gx - gy*gy; if (u < 1e-4) u = 1e-4;
    return new THREE.Vector3(x + gx, cy + gy, z - 0.95*Math.sqrt(u)); };       // 0.95 = z-zploštění koule
  const bNorm = (gx, gy) => { const p = bSurf(gx, gy);
    return new THREE.Vector3(p.x - x, (p.y - cy)/1.08, (p.z - z)/0.95).normalize(); };
  const gtube = (g2, tube) => {
    const v = g2.map(([gx, gy]) => { const p = bSurf(gx, gy), n = bNorm(gx, gy);
      return new THREE.Vector3(p.x - n.x*0.003, p.y - n.y*0.003, p.z - n.z*0.003); }); // 0.003 = vsazení dovnitř
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), v.length*3, tube, 6, false);
    b.geo(g, 0, 0, 0, cBlack); g.dispose();
  };
  // dvě svislé čárky
  for (const bx of [-0.012, 0.012]) { const pts = []; for (let i = 0; i <= 8; i++) pts.push([bx*s, (-0.060 + 0.120*(i/8))*s]); gtube(pts, 0.0065*s); }
  // S
  gtube([[-0.030,0.050],[-0.004,0.060],[0.026,0.046],[0.020,0.020],[-0.008,0.003],
         [-0.028,-0.020],[-0.020,-0.047],[0.004,-0.060],[0.030,-0.046]].map(([a,c]) => [a*s, c*s]), 0.0085*s);
}
