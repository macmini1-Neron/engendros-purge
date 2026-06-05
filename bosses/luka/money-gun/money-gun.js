/* =====================================================================
   MONEY GUN  –  Lukova fáze 3 + DROP pro hráče
   ---------------------------------------------------------------------
   "PENÍZE JSOU MOC, MY JENOM STŘÍLÍME."  Munice = MĚDĚNÉ mince ($).
   Zdobená flintlock BAMBITKA: rukojeť/pažba/koule ze DŘEVA (tmavý ořech,
   vrstvené stínování), hlaveň ze SLONOVINY se ZLATÝMI hranami + kříž-bandy.
   HLAVEŇ = štíhlý trojúhelníkový HRANOL (vrcholem nahoru). Přední čelo =
   ILUMINÁT: vševidoucí oko, jehož ZORNICE = otvor hlavně, + zlaté paprsky.
   Na bocích: BÝK (+X) a MEDVĚD (−X) na zlatém medailonu. Navrch měděné mince
   jako munice. KOHOUT (labutí krk + křemen) + frizzen + pánvička. $ medailon
   na slonovinové kartuši na dřevěném gripu. Každý $ = DVĚ svislé čárky.
   Předek (ústí) = −Z.  (Vychází z proto2.html – textury nahrazeny geometrií.)

   Použití (Three.js r160, MeshBuilder jako buildViewmodel):
     buildMoneyGun(b, x, y, z, s);
   ===================================================================== */

function buildMoneyGun(b, x, y, z, s = 1) {
  // ── PALETA: 5 odstínů na materiál (vrstvené stínování) ──
  const gHi=0xEAD27A, gMid=0xC9A22B, gLo=0x8A6A16;                 // zlato
  const iHi=0xF4ECD6, iMid=0xE3D7B6, iLo=0xC2B48E;                 // slonovina
  const wHi=0x8A5A28, wMid=0x633E18, wLo=0x3E2710, wSlot=0x281708; // tmavý ořech
  const cHi=0xE08A3C, cMid=0xC06A22, cLo=0x7A3F14;                 // měď (mince)
  const dk =0x131110;                                             // recesy / oko

  // ── helpery: lokální model-space → škála s + posun (x,y,z) ──
  const bx = (w,h,d, lx,ly,lz, col, o) => b.box(w*s,h*s,d*s, x+lx*s,y+ly*s,z+lz*s, col, o);
  const bg = (g, lx,ly,lz, col, o) => { g.scale(s,s,s); b.geo(g, x+lx*s,y+ly*s,z+lz*s, col, o); g.dispose(); };

  // ═══ rozměry trojúhelníkové hlavně ═══
  const TA=0.13, TBx=0.10, TBy=0.07, len=0.84, yB=0.11, zF=-0.62, zBk=zF+len, zM=zF+len*0.5;
  const tri = (k=1) => { const sh=new THREE.Shape();
    sh.moveTo(0,TA*k); sh.lineTo(-TBx*k,-TBy*k); sh.lineTo(TBx*k,-TBy*k); sh.closePath(); return sh; };
  const band = (ko,ki) => { const sh=tri(ko); const h=new THREE.Path();
    h.moveTo(0,TA*ki); h.lineTo(-TBx*ki,-TBy*ki); h.lineTo(TBx*ki,-TBy*ki); h.closePath(); sh.holes.push(h); return sh; };

  // ═══════════ HLAVEŇ (slonovina) ═══════════
  bg(new THREE.ExtrudeGeometry(tri(1),{depth:len,bevelEnabled:true,bevelThickness:0.012,bevelSize:0.012,bevelSegments:2}), 0,yB,zF, iMid);
  bx(0.205,0.014,len, 0,yB-TBy-0.006,zM, iLo);                                    // stínový pruh pod základnou
  for (const [ex,ey,col] of [[0,TA,gHi],[-TBx,-TBy,gLo],[TBx,-TBy,gMid]])         // zlaté podélné hrany
    bg(new THREE.CylinderGeometry(0.012,0.012,len,12), ex,yB+ey,zM, col, {rx:Math.PI/2});
  for (const [zc,ko,ki,col] of [[zF+0.005,1.17,0.9,gMid],[zF+0.22,1.05,0.94,gHi],[zM+0.06,1.05,0.94,gMid],[zBk-0.16,1.08,0.92,gHi]]) // kříž-bandy
    bg(new THREE.ExtrudeGeometry(band(ko,ki),{depth:0.028,bevelEnabled:false}), 0,yB,zc, col);
  for (let i=0;i<8;i++) for (const ex of [-TBx,TBx])                               // filigrán po spodních hranách
    bg(new THREE.SphereGeometry(0.008,8,8), ex,yB-TBy-0.003,zF+0.08+i*0.095, gHi);
  for (let i=0;i<7;i++)                                                            // filigrán po apexu
    bg(new THREE.SphereGeometry(0.0075,8,8), 0,yB+TA+0.004,zF+0.13+i*0.10, gHi);

  // ── PŘEDNÍ ČELO = ILUMINÁT (oko, zornice = otvor hlavně, paprsky) ──
  const ez = zF-0.03;
  bg(new THREE.CylinderGeometry(0.05,0.056,0.34,30), 0,yB,zF+0.16, dk, {rx:Math.PI/2});         // vývrt = tmavá zornice
  { const t=new THREE.TorusGeometry(0.05,0.024,12,32); t.scale(1.35,0.85,0.55); bg(t,0,yB,ez,iHi); }      // slonovinové bělmo
  { const t=new THREE.TorusGeometry(0.072,0.013,12,34); t.scale(1.35,0.85,0.55); bg(t,0,yB,ez-0.004,gHi);} // zlaté víčko
  bg(new THREE.TorusGeometry(0.036,0.009,10,28), 0,yB,ez+0.002, gMid);                          // zlatá duhovka
  for (let i=0;i<14;i++){ const a=i/14*Math.PI*2, rx2=0.092, ry2=0.064;                          // zlaté paprsky
    bg(new THREE.ConeGeometry(0.012,0.07,6), Math.cos(a)*rx2,yB+Math.sin(a)*ry2,ez+0.004, (i%2?gHi:gMid), {rz:-a-Math.PI/2}); }

  // ── BOČNÍ MEDAILONY: BÝK (+X) / MEDVĚD (−X) na zlatém terči ──
  for (const sx of [1,-1]) {
    const xc = sx*0.092, yc = yB, zc = zM;
    bg(new THREE.CylinderGeometry(0.058,0.058,0.012,28), xc,yc,zc, gMid, {rz:Math.PI/2});         // medailon
    bg(new THREE.TorusGeometry(0.058,0.008,10,30), xc+sx*0.004,yc,zc, gHi, {ry:Math.PI/2});       // lem
    const xe = xc + sx*0.012;                                                                     // rovina emblému (proud)
    if (sx === 1) {                                                                               // BÝK
      bg(new THREE.CylinderGeometry(0.026,0.022,0.010,18), xe,yc-0.006,zc, dk, {ry:Math.PI/2});   // hlava
      bx(0.010,0.020,0.032, xe,yc-0.026,zc, dk);                                                  // čenich
      for (const hz of [-1,1]) bg(new THREE.TorusGeometry(0.024,0.005,8,16,Math.PI*0.6),          // rohy
        xe,yc+0.014,zc+hz*0.022, dk, {ry:Math.PI/2, rz: hz<0 ? -0.6 : Math.PI+0.6});
      for (const ze of [-0.011,0.011]) bg(new THREE.SphereGeometry(0.005,8,8), xe+0.006,yc-0.002,zc+ze, gHi); // oči
    } else {                                                                                      // MEDVĚD
      bg(new THREE.CylinderGeometry(0.028,0.028,0.010,24), xe,yc-0.002,zc, dk, {ry:Math.PI/2});   // hlava
      for (const ze of [-0.024,0.024]) bg(new THREE.CylinderGeometry(0.012,0.012,0.010,16), xe,yc+0.024,zc+ze, dk, {ry:Math.PI/2}); // uši
      bg(new THREE.SphereGeometry(0.011,12,10), xe+0.006,yc-0.013,zc, gHi);                        // čenich
      for (const ze of [-0.010,0.010]) bg(new THREE.SphereGeometry(0.004,8,8), xe+0.005,yc+0.004,zc+ze, gHi); // oči
    }
  }

  // ── MINCE JAKO MUNICE (měď) v zlatém žlábku po hřbetu hlavně ──
  bx(0.062,0.026,0.56, 0,yB+TA+0.008,zF+0.30, gLo);
  for (let i=0;i<6;i++){ const zc=zF+0.14+i*0.078;
    bg(new THREE.CylinderGeometry(0.05,0.05,0.02,20), 0,yB+TA+0.042,zc, cMid, {rx:Math.PI/2});
    bg(new THREE.CylinderGeometry(0.051,0.051,0.006,20), 0,yB+TA+0.062,zc, cHi, {rx:Math.PI/2}); }

  // ═══ KOHOUT (flintlock) na zadním-horním rohu hlavně, nakloněný dozadu ═══
  const hz = zBk-0.04, hy = yB+TA-0.02;
  bx(0.085,0.07,0.13, 0,hy,hz, gMid);                                             // zámková deska
  bg(new THREE.CylinderGeometry(0.02,0.02,0.10,12), 0,hy+0.02,hz, gHi, {rz:Math.PI/2}); // čep
  bx(0.05,0.14,0.05, 0,hy+0.085,hz+0.055, gMid, {rx:0.55});                       // labutí krk – spodní
  bx(0.05,0.12,0.045, 0,hy+0.20,hz+0.135, gHi, {rx:0.95});                        // labutí krk – horní
  bx(0.018,0.10,0.018, 0.03,hy+0.13,hz+0.085, gLo, {rx:0.7});
  bx(0.018,0.10,0.018, -0.03,hy+0.13,hz+0.085, gLo, {rx:0.7});                    // boční žebra krku
  bx(0.062,0.05,0.055, 0,hy+0.26,hz+0.175, gLo, {rx:0.95});                       // horní čelist
  bx(0.045,0.04,0.04, 0,hy+0.30,hz+0.20, dk, {rx:0.95});                          // křemen (flint)
  bg(new THREE.CylinderGeometry(0.012,0.012,0.05,8), 0,hy+0.245,hz+0.165, gHi, {rx:0.95,rz:Math.PI/2}); // šroub
  bx(0.05,0.11,0.028, 0,hy+0.075,hz-0.075, gHi, {rx:-0.45});                      // frizzen (ocílka)
  bx(0.06,0.025,0.05, 0,hy+0.01,hz-0.06, gMid);                                   // pánvička

  // ═══ RUKOJEŤ + PAŽBA ZE DŘEVA (vrstvené wHi/wMid/wLo + zlaté prstence) ═══
  bx(0.18,0.22,0.22, 0,0.0,zBk-0.02, wMid);                                       // zápěstí
  bx(0.185,0.032,0.225, 0,0.10,zBk-0.02, wHi);  bx(0.185,0.03,0.225, 0,-0.10,zBk-0.02, wLo); // hi temeno / lo spodek
  bg(new THREE.TorusGeometry(0.085,0.015,10,26), 0,-0.05,zBk+0.04, gMid, {rx:-0.5,ry:Math.PI/2}); // prstenec přechodu
  bx(0.155,0.42,0.17, 0,-0.20,zBk+0.10, wMid, {rx:-0.5});                         // grip (šikmo)
  bx(0.024,0.40,0.16, 0.078,-0.20,zBk+0.10, wHi, {rx:-0.5});
  bx(0.024,0.40,0.16, -0.078,-0.20,zBk+0.10, wLo, {rx:-0.5});                     // boční hi/lo plošky
  bx(0.10,0.36,0.012, 0,-0.19,zBk+0.018, wSlot, {rx:-0.5});                       // tmavá rýha (recess)
  for (const sx of [1,-1]) bx(0.022,0.21,0.135, sx*0.080,-0.18,zBk+0.108, iHi, {rx:-0.5}); // slonovinová kartuše

  // ── zlatý $ medailon (DVĚ čárky) na obou bocích pažby ──
  for (const sx of [1,-1]) {
    const xc = sx*0.094, yc = -0.18, zc = zBk+0.115, ro = {rx:-0.5, ry:Math.PI/2};
    bg(new THREE.TorusGeometry(0.052,0.010,10,26), xc,yc,zc, gMid, ro);                          // rám medailonu
    bx(0.012,0.060,0.012, xc, yc+0.006*0, zc-0.012, gHi, {rx:-0.5});                              // svislá čárka 1
    bx(0.012,0.060,0.012, xc, yc, zc+0.012, gHi, {rx:-0.5});                                      // svislá čárka 2
    { const t=new THREE.TorusGeometry(0.018,0.006,8,18,Math.PI*1.5); bg(t, xc,yc+0.020,zc, gHi, {rx:-0.5, ry:Math.PI/2}); }        // horní oblouk S
    { const t=new THREE.TorusGeometry(0.018,0.006,8,18,Math.PI*1.5); bg(t, xc,yc-0.020,zc, gHi, {rx:-0.5, ry:Math.PI/2, rz:Math.PI}); } // dolní oblouk S
  }

  // ── KOULE (pommel) na konci pažby + zlaté prstence ──
  bg(new THREE.SphereGeometry(0.105,24,18), 0,-0.40,zBk+0.205, wMid);
  bg(new THREE.TorusGeometry(0.105,0.016,10,26), 0,-0.40,zBk+0.205, gHi, {ry:Math.PI/2});
  bg(new THREE.TorusGeometry(0.088,0.013,10,24), 0,-0.40,zBk+0.205, gMid, {rx:Math.PI/2});

  // ── lučík + spoušť ──
  bg(new THREE.TorusGeometry(0.06,0.014,10,24), 0,-0.075,zBk+0.0, gMid, {ry:Math.PI/2});
  bx(0.016,0.06,0.016, 0,-0.06,zBk+0.0, dk, {rx:0.3});
}
