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
    // měděná (munice money gunu) – ZAOBLENÁ hrana jako 5 Kč (bevel) + DROBNÉ VÝSTUPKY (drblatý okraj)
    const bev = T * 0.30;                 // zaoblení hrany (bevel) ~ jako 5 Kč
    const Rb  = R * 0.97;                 // základ obrysu (mid-plane je nejširší)
    const N = 48, K = N * 6, pts = [];    // hodně malých nopků
    for (let i = 0; i < K; i++) {
      const a = (i / K) * Math.PI * 2;
      const bump = 1 + 0.030 * Math.pow(Math.max(0, Math.cos(N * a)), 2); // malé výstupky ven (mezi nimi hladko)
      pts.push(new THREE.Vector2(Math.cos(a) * Rb * bump, Math.sin(a) * Rb * bump));
    }
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
      depth: T - 2 * bev, bevelEnabled: true,
      bevelThickness: bev, bevelSize: bev, bevelSegments: 4,
    });
    g.computeBoundingBox();
    g.translate(0, 0, -(g.boundingBox.min.z + g.boundingBox.max.z) / 2); // vycentrovat v Z
    b.geo(g, x, y, z, metal); g.dispose();  // líce míří po ±Z (shape je v XY)
  }

  // ── ražba $ na obou lících (svislá čára + dvě torus-„C" = S) ──
  const glyph = (zc) => {
    b.box(0.018 * s, 0.175 * s, 0.024 * s, x - 0.013 * s, y, zc, eng); // dvě svislé čárky
    b.box(0.018 * s, 0.175 * s, 0.024 * s, x + 0.013 * s, y, zc, eng);
    { const t = new THREE.TorusGeometry(0.040 * s, 0.013 * s, 6, 18, Math.PI * 1.5);
      b.geo(t, x, y + 0.042 * s, zc, eng); t.dispose(); }
    { const t = new THREE.TorusGeometry(0.040 * s, 0.013 * s, 6, 18, Math.PI * 1.5);
      b.geo(t, x, y - 0.042 * s, zc, eng, { rz: Math.PI }); t.dispose(); }
    // zaslepit OTEVŘENÉ konce torus-oblouků (jinak díry na koncích $) – kulové uzávěry
    const cap = (cx2, cy2) => { const sp = new THREE.SphereGeometry(0.013 * s, 8, 6); b.geo(sp, cx2, cy2, zc, eng); sp.dispose(); };
    cap(x + 0.040 * s, y + 0.042 * s); cap(x, y + 0.002 * s);
    cap(x - 0.040 * s, y - 0.042 * s); cap(x, y - 0.002 * s);
  };
  glyph(z - T * 0.5 - 0.0085 * s); // čelní líc (−Z) — $ vtlačený ~15 % dovnitř (míň proud)
  glyph(z + T * 0.5 + 0.0085 * s); // zadní líc (+Z) — $ vtlačený ~15 % dovnitř
}
