/* =====================================================================
   TOP HAT (cylindr)  –  rekvizit pro Lukovu fázi 3
   ---------------------------------------------------------------------
   Černý cylindr jako panáček z Monopolů: VYSOKÁ koruna (mírný flér nahoru)
   + šedý hatband + široká zaoblená krempa + malý zlatý $ medailon na pásku.

   Použití (Three.js r160, stejný MeshBuilder jako buildViewmodel):
     buildTopHat(b, x, y, z, s);
   kde b = MeshBuilder, (x,y,z) = střed SPODNÍ hrany krempy, s = měřítko.
   Na Lukovu hlavu (HEAD_R 0.32, HEAD_Y 0.34) sedí cca y ≈ 0.58, s ≈ 0.95.
   PŘEDEK (medailon) = −Z.
   ===================================================================== */

function buildTopHat(b, x, y, z, s = 1) {
  const cHat   = 0x17191D; // černá plsť (o chlup světlejší než 0x000, ať drží tvar)
  const cTop   = 0x202329; // o stupínek světlejší temeno koruny (čte se hrana)
  const cBand  = 0x732031; // hatband (VÍNOVÝ – stejný jako pásek za přezkou, obvod kolem koruny)
  const cAu    = 0xE8C23B; // zlato přezky (jasné)
  const cAuLo  = 0xB78A1E; // tmavší zlato (stínování přezky)
  const cStrap = 0x732031; // VÍNOVÝ (bordó) kožený pásek za přezkou – zlatá přezka na něm vynikne
  const cHole  = 0x2A0B12; // tmavý otvor (jedna dírka ve vínovém pásku, pod trnem)

  const Rcb = 0.225 * s, Rct = 0.235 * s, H = 0.42 * s;  // koruna o chlup širší (obepne hlavu při nižším posazení 0.565)
  const brimT = 0.024 * s;                               // tloušťka krempy
  const crownBot = y + brimT;                            // koruna začíná těsně nad krempou
  const crownTopY = crownBot + H;

  // ── KREMPA (přirozeně PROHNUTÁ nahoru: boky ±X výš, předek/zad ±Z jen lehce) ──
  const ri = 0.225 * s, ro = 0.320 * s, curl = 0.048 * s;        // krempa navazuje na korunu; curl = zdvih okraje
  const liftBrim = (vx, vz) => { const r = Math.hypot(vx, vz), t = Math.min(1, Math.max(0, (r - ri) / (ro - ri))), a = Math.atan2(vz, vx);
    return curl * t * t * (0.6 + 0.4 * Math.cos(2 * a)); };       // t² = plynulé prohnutí od koruny k okraji
  { const g = new THREE.CylinderGeometry(ro, ro, brimT, 56);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + liftBrim(p.getX(i), p.getZ(i)));
    p.needsUpdate = true; g.computeVertexNormals(); b.geo(g, x, y + brimT / 2, z, cHat); g.dispose(); }
  { const g = new THREE.TorusGeometry(0.318 * s, 0.026 * s, 12, 56); g.rotateX(Math.PI / 2);  // zaoblený okraj kopíruje prohnutí
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + liftBrim(p.getX(i), p.getZ(i)));
    p.needsUpdate = true; g.computeVertexNormals(); b.geo(g, x, y + brimT / 2, z, cHat); g.dispose(); }

  // ── KORUNA (vysoký válec s mírným flérem) ──
  { const g = new THREE.CylinderGeometry(Rct, Rcb, H, 40, 1, true);      // jen plášť (open) – víko zvlášť
    b.geo(g, x, crownBot + H / 2, z, cHat); g.dispose(); }
  { const g = new THREE.CylinderGeometry(Rct, Rct, 0.012 * s, 40);       // temeno (mírně světlejší)
    b.geo(g, x, crownTopY, z, cTop); g.dispose(); }

  // ── HATBAND (vínový pásek POSAZENÝ VÝŠ nad krempou – ať není vidět zespodu) ──
  const yM = crownBot + 0.052 * s;                // střed pásku výš (spodek pásku ~0.024 nad krempou)
  const bandH = 0.056 * s;                        // pásek = přezka sedí na stejné výšce → spojité
  { const g = new THREE.CylinderGeometry(Rcb * 1.028, Rcb * 1.028, bandH, 40);
    b.geo(g, x, yM, z, cBand); g.dispose(); }

  // ── ZLATÁ PŘEZKA přímo na VÍNOVÉ objímce (žádný proud červený díl za přezkou) ──
  const zBand = z - Rcb * 1.028;                  // přední povrch vínové objímky
  const zBkl  = zBand - 0.005 * s;                // rámeček přezky VÍC DOZADU – přímo napojený na objímku (zadní hrana zapuštěná do bandu)
  // přezka = obdélníkový zlatý rámeček (4 lišty)
  const hw = 0.042 * s, hh = 0.034 * s, tb = 0.013 * s, db = 0.016 * s;
  b.box(2 * hw + tb, tb, db, x, yM + hh, zBkl, cAu);              // horní lišta
  b.box(2 * hw + tb, tb, db, x, yM - hh, zBkl, cAuLo);            // dolní lišta (stín)
  b.box(tb, 2 * hh + tb, db, x - hw, yM, zBkl, cAu);             // levá lišta (kotva trnu)
  b.box(tb, 2 * hh + tb, db, x + hw, yM, zBkl, cAuLo);           // pravá lišta (stín)
  // JEDNA dírka přímo ve vínové objímce (tmavý otvor), kam míří trn
  { const hole = new THREE.CylinderGeometry(0.0115 * s, 0.0115 * s, 0.012 * s, 14);
    b.geo(hole, x + hw * 0.30, yM, zBand - 0.001 * s, cHole, { rx: Math.PI / 2 }); hole.dispose(); }
  // TRN (prong) – vodorovný, kotvený na levé liště, špička přes dírku
  const prongL = hw * 1.18;                                       // délka trnu
  b.box(prongL, 0.011 * s, db * 0.7, x - hw + prongL / 2 - tb * 0.3, yM, zBkl - 0.002 * s, cAu);
  // čep trnu na levé liště (kloub)
  { const piv = new THREE.SphereGeometry(0.013 * s, 10, 8);
    b.geo(piv, x - hw, yM, zBkl - 0.002 * s, cAuLo); piv.dispose(); }
}
