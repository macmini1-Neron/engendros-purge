/* =====================================================================
   COIN ($)  –  samostatný rekvizit pro Lukovy bossové útoky
   ---------------------------------------------------------------------
   Velká mince se znakem $ vyraženým na obou lících. Tři varianty barvy:
     • 'silver'  – fáze 1 (otřes se → 12 mincí v kruhu)
     • 'copper'  – munice money gunu ve fázi 3 (nejlevnější → měděné);
                   v praxi se používá menší (menší s).
     • 'gold'    – volitelná (rezerva).

   Použití (Three.js r160, stejný MeshBuilder jako buildViewmodel):
     buildCoin(b, x, y, z, s, variant);
   kde b = MeshBuilder, (x,y,z) = střed mince, s = měřítko (1 = výchozí),
   variant = 'silver' | 'copper' | 'gold'.
   Líce míří po ose Z (čelo = −Z), v ležaté poloze se kutálí kolem osy.
   ===================================================================== */

function buildCoin(b, x, y, z, s = 1, variant = 'silver') {
  const PAL = {
    silver: { metal: 0xDCE2EA, edge: 0x9AA0A8, eng: 0x6B7178 },  // jasné stříbro
    gold:   { metal: 0xF3C72E, edge: 0xB8881A, eng: 0x7E5E10 },  // sytě zlatá
    copper: { metal: 0xCB5A1E, edge: 0x863F16, eng: 0x4E2A0C },  // pravá měď (oranžovo-červená)
  };
  const { metal, edge, eng } = PAL[variant] || PAL.silver;
  const R = 0.17 * s, T = 0.05 * s;

  // ── tělo mince – tvar hrany podle vzoru českých mincí ──
  if (variant === 'gold') {
    // 20 Kč: třináctiúhelník (osekané rovné hrany)
    // rz (NE ry) – po sklopení rx=PI/2 musí spin 13úhelníku jít kolem osy líce (Z),
    // jinak se líc NAKLONÍ a ražba $ sedí mimo střed.
    const g = new THREE.CylinderGeometry(R, R, T, 13);
    b.geo(g, x, y, z, metal, { rx: Math.PI / 2, rz: Math.PI / 13 }); g.dispose();
  } else if (variant === 'silver') {
    // 2 Kč: kulatá s 11 vroubky (zoubkovaná hrana)
    const N = 11, K = N * 8, pts = [];
    for (let i = 0; i < K; i++) {
      const a = (i / K) * Math.PI * 2;
      const notch = 1 - 0.075 * Math.pow(Math.max(0, Math.cos(N * a)), 8);
      pts.push(new THREE.Vector2(Math.cos(a) * R * notch, Math.sin(a) * R * notch));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: T, bevelEnabled: false });
    g.translate(0, 0, -T / 2);
    b.geo(g, x, y, z, metal); g.dispose();   // líce už míří po ±Z (shape je v XY)
  } else {
    // měděná (munice money gunu) – hladká kulatá
    const g = new THREE.CylinderGeometry(R, R, T, 40);
    b.geo(g, x, y, z, metal, { rx: Math.PI / 2 }); g.dispose();
  }

  // ── ražba $ na obou lících (svislá čára + dvě torus-„C" = S) ──
  const glyph = (zc) => {
    b.box(0.018 * s, 0.175 * s, 0.024 * s, x - 0.013 * s, y, zc, eng); // dvě svislé čárky
    b.box(0.018 * s, 0.175 * s, 0.024 * s, x + 0.013 * s, y, zc, eng);
    { const t = new THREE.TorusGeometry(0.040 * s, 0.013 * s, 6, 18, Math.PI * 1.5);
      b.geo(t, x, y + 0.042 * s, zc, eng); t.dispose(); }
    { const t = new THREE.TorusGeometry(0.040 * s, 0.013 * s, 6, 18, Math.PI * 1.5);
      b.geo(t, x, y - 0.042 * s, zc, eng, { rz: Math.PI }); t.dispose(); }
  };
  glyph(z - T * 0.5 - 0.012 * s); // čelní líc (−Z)
  glyph(z + T * 0.5 + 0.012 * s); // zadní líc (+Z)
}
