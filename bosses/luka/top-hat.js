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
  const cBand  = 0x34383F; // hatband (tmavě šedý pásek)
  const cAu    = 0xE8C23B; // zlato přezky
  const cAuLo  = 0xB78A1E; // tmavší zlato (stínování přezky)
  const cStrap = 0x14130F; // kožený páseček pod přezkou

  const Rcb = 0.150 * s, Rct = 0.162 * s, H = 0.36 * s;  // koruna: vyšší, mírný flér nahoru
  const brimT = 0.024 * s;                               // tloušťka krempy
  const crownBot = y + brimT;                            // koruna začíná těsně nad krempou
  const crownTopY = crownBot + H;

  // ── KREMPA (široká, plochá + zaoblená hrana) ──
  { const g = new THREE.CylinderGeometry(0.300 * s, 0.300 * s, brimT, 48);
    b.geo(g, x, y + brimT / 2, z, cHat); g.dispose(); }
  { const g = new THREE.TorusGeometry(0.298 * s, 0.026 * s, 12, 52);     // zaoblený okraj
    b.geo(g, x, y + brimT / 2, z, cHat, { rx: Math.PI / 2 }); g.dispose(); }

  // ── KORUNA (vysoký válec s mírným flérem) ──
  { const g = new THREE.CylinderGeometry(Rct, Rcb, H, 40, 1, true);      // jen plášť (open) – víko zvlášť
    b.geo(g, x, crownBot + H / 2, z, cHat); g.dispose(); }
  { const g = new THREE.CylinderGeometry(Rct, Rct, 0.012 * s, 40);       // temeno (mírně světlejší)
    b.geo(g, x, crownTopY, z, cTop); g.dispose(); }

  // ── HATBAND (pásek nad krempou, kolem paty koruny) ──
  { const g = new THREE.CylinderGeometry(Rcb * 1.028, Rcb * 1.028, 0.060 * s, 40);
    b.geo(g, x, crownBot + 0.040 * s, z, cBand); g.dispose(); }

  // ── ZLATÁ PŘEZKA + kožený PÁSEČEK vepředu na pásku (−Z) ──
  const yM = crownBot + 0.040 * s;
  const zStrap = z - Rcb * 1.028 - 0.006 * s;     // páseček těsně proud bandu
  const zBkl   = z - Rcb * 1.028 - 0.018 * s;     // přezka ještě o chlup vepředu
  // kožený páseček (tmavý) přes přední část bandu, přesah na obě strany přezky
  b.box(0.150 * s, 0.066 * s, 0.018 * s, x, yM, zStrap, cStrap);
  // přezka = obdélníkový zlatý rámeček (4 lišty) + středový trn
  const hw = 0.042 * s, hh = 0.034 * s, tb = 0.013 * s, db = 0.016 * s;
  b.box(2 * hw + tb, tb, db, x, yM + hh, zBkl, cAu);              // horní lišta
  b.box(2 * hw + tb, tb, db, x, yM - hh, zBkl, cAuLo);            // dolní lišta (stín)
  b.box(tb, 2 * hh + tb, db, x - hw, yM, zBkl, cAu);             // levá lišta
  b.box(tb, 2 * hh + tb, db, x + hw, yM, zBkl, cAuLo);           // pravá lišta (stín)
  b.box(0.010 * s, 2 * hh - 0.004 * s, db, x, yM, zBkl, cAu);     // středový trn (pin)
}
