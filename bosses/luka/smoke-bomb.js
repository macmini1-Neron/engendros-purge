/* =====================================================================
   SMOKE BOMB (dýmovnice) – rekvizit pro Lukův přechod f3 → f4
   ---------------------------------------------------------------------
   Klasická „kreslená" kulatá bomba: černá koule + kovový krček s obroučkou
   + zatočený knot (rope). Žhavý ohýnek na konci knotu se anituje zvenčí
   (sprite/ember putuje po křivce, jak knot „dohořívá") – proto je tu i
   `smokeBombFuse()`, který vrací tu samou polyline pro umístění ohýnku.

   Použití (Three.js r160, stejný MeshBuilder jako buildViewmodel):
     buildSmokeBomb(b, x, y, z, s);   // (x,y,z) = STŘED koule, s = měřítko
   PŘEDEK (kam míří zatočení knotu) = +X / nahoru.
   ===================================================================== */

// Polyline knotu v BODY-space (relativně ke středu koule). 0. bod = pata u
// krčku, poslední bod = hořící konec. Sdílí ji builder i animace (ohýnek).
function smokeBombFuse(s = 1) {
  const R = 0.13 * s, ny = R + 0.055 * s;   // pata knotu těsně nad krčkem
  return [
    new THREE.Vector3(0.000, ny,            0.000),
    new THREE.Vector3(0.022 * s, ny + 0.050 * s, -0.010 * s),
    new THREE.Vector3(0.060 * s, ny + 0.085 * s,  0.004 * s),
    new THREE.Vector3(0.098 * s, ny + 0.072 * s,  0.022 * s),
    new THREE.Vector3(0.118 * s, ny + 0.100 * s,  0.006 * s)   // hořící konec
  ];
}

function buildSmokeBomb(b, x, y, z, s = 1) {
  const R     = 0.13 * s;
  const cBody = 0x16181d;   // litinová čerň (o chlup nad 0x000, ať drží tvar)
  const cNeck = 0x32363e;   // tmavě kovový krček
  const cRim  = 0x4a4f59;   // světlejší obroučka (čte se hrana krčku)
  const cFuse = 0xad8a52;   // konopný knot (rope)

  // ── TĚLO (koule) ──
  { const g = new THREE.SphereGeometry(R, 20, 16); b.geo(g, x, y, z, cBody); g.dispose(); }

  // ── KRČEK (krátký válec na temeni) ──
  { const g = new THREE.CylinderGeometry(0.050 * s, 0.060 * s, 0.055 * s, 16);
    b.geo(g, x, y + R + 0.018 * s, z, cNeck); g.dispose(); }
  // ── OBROUČKA krčku ──
  { const g = new THREE.TorusGeometry(0.052 * s, 0.013 * s, 8, 18);
    b.geo(g, x, y + R + 0.044 * s, z, cRim, { rx: Math.PI / 2 }); g.dispose(); }

  // ── KNOT (trubka po polyline) ──
  { const pts = smokeBombFuse(s).map(p => p.clone().add(new THREE.Vector3(x, y, z)));
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 22, 0.012 * s, 6, false);
    b.geo(g, 0, 0, 0, cFuse); g.dispose(); }
}
