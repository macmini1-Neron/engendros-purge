// round.js — round operators (cylinder / cone) for bodies, barrels, nozzles, nose
// cones, turntables. These build real THREE geometry (CylinderGeometry / ConeGeometry),
// so unlike the box-only operators they import `three` and are verified in the browser,
// not under `node --test`. The pure layers (manifest, validateSpec, planBuild) don't
// care — they dispatch by name; only the impl is THREE-bound. Keep that boundary: a
// model's pure-testable parts stay box-only; reach for these only for genuinely round forms.
import * as THREE from 'three';

// Orient a +Y-axis primitive (THREE's default) onto x / y / z.
const ORIENT = { x: { rz: Math.PI / 2 }, y: {}, z: { rx: Math.PI / 2 } };

// Cylinder of radius r (optionally tapering to r2 at the +axis end), length h, along `axis`.
export function cylinder(b, a, t, o) {
  const seg = a.seg ?? 16;
  const g = new THREE.CylinderGeometry(a.r2 ?? a.r, a.r, a.h, seg, 1, !!a.open);
  b.geo(g, o.x, o.y, o.z, a.tone ? t[a.tone] : t.mid, { ...ORIENT[a.axis ?? 'z'], tint: 0.02 });
  g.dispose();
}

// disc — a thin standalone cylinder (a record, a wheel face) returned as its OWN mesh, so an animator
// can lift/spin it independently of the merged body (the gramophone's record-swap lifts the whole disc).
export function disc(b, a, t, o) {
  const g = new THREE.CylinderGeometry(a.r, a.r, a.h ?? 0.003, a.seg ?? 48);
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: new THREE.Color(a.tone ? t[a.tone] : t.mid) }));
  const or = ORIENT[a.axis ?? 'y'];
  mesh.rotation.set(or.rx || 0, or.ry || 0, or.rz || 0);
  mesh.position.set(o.x, o.y, o.z);
  return mesh;
}

// Cone of base radius r, length h, tip pointing along +axis (nose cones, tapers).
export function cone(b, a, t, o) {
  const seg = a.seg ?? 16;
  const g = new THREE.ConeGeometry(a.r, a.h, seg);
  b.geo(g, o.x, o.y, o.z, a.tone ? t[a.tone] : t.bright, { ...ORIENT[a.axis ?? 'z'], tint: 0.02 });
  g.dispose();
}

// deltaFins — `count` cruciform CROPPED-DELTA fins around the +Z axis. Each fin is a clean
// swept trapezoid (root chord `root`, shorter tip chord `tip`, leading edge swept back toward
// the tail by `sweep`), built as a thin prism of real geometry — not stepped boxes — so the
// silhouette reads as a true delta. THREE-bound (browser-verified). r0 = body radius the fins
// start at; phase = angular offset (use ~0.785 for an X / 45° cruciform).
export function deltaFins(b, a, t, o) {
  const count = a.count ?? 4, phase = a.phase ?? 0;
  const root = a.root, span = a.span, tip = a.tip ?? root * 0.3;
  const r0 = a.r0 ?? 0, sweep = a.sweep ?? root * 0.45, thick = a.thick ?? 0.04;
  const color = a.tone ? t[a.tone] : t.mid;
  // corners in (radial u, axial v); +v is toward the +Z nose (leading edge)
  const corners = [
    [r0, root / 2],                       // root leading
    [r0 + span, root / 2 - sweep],         // tip leading
    [r0 + span, root / 2 - sweep - tip],   // tip trailing
    [r0, -root / 2],                       // root trailing
  ];
  for (let k = 0; k < count; k++) {
    const ang = phase + (k / count) * Math.PI * 2, ca = Math.cos(ang), sa = Math.sin(ang);
    const V = [];
    for (const w of [thick / 2, -thick / 2])
      for (const [u, v] of corners) V.push(ca * u - sa * w, sa * u + ca * w, v);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
    g.setIndex([0, 1, 2, 0, 2, 3,  4, 6, 5, 4, 7, 6,  0, 4, 5, 0, 5, 1,
                1, 5, 6, 1, 6, 2,  2, 6, 7, 2, 7, 3,  3, 7, 4, 3, 4, 0]);
    g.computeVertexNormals();
    b.geo(g, o.x, o.y, o.z, color, { tint: 0.015 });
    g.dispose();
  }
}

// Draw a missile-body livery onto a canvas → CanvasTexture. The cylinder UV wraps the canvas
// X around the circumference and Y along the length, so a mark at {x:0..1 around, y:0..1 along}
// lands at that spot on the body. `marks` are stencils/serials: {text,x,y,size,rot,color,weight}.
function _bodyTexture(baseHex, marks) {
  // Cylinder UV: X = around the circumference, Y = along the LENGTH. A missile body is far
  // longer than it is round, so the canvas must be tall (Y≫X) or text smears. 512×2048 ≈ the
  // unrolled aspect for a slender body.
  const W = 512, H = 2048;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  c.fillStyle = baseHex; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(18,18,22,0.22)'; c.lineWidth = 2;                       // panel rings (around body)
  for (const v of [0.1, 0.32, 0.6, 0.85]) { c.beginPath(); c.moveTo(0, v * H); c.lineTo(W, v * H); c.stroke(); }
  c.strokeStyle = 'rgba(18,18,22,0.10)';                                         // faint lengthwise seams
  for (const u of [0.0, 0.5]) { c.beginPath(); c.moveTo(u * W, 0); c.lineTo(u * W, H); c.stroke(); }
  for (const m of marks) {
    c.save();
    c.translate((m.x ?? 0.5) * W, (m.y ?? 0.5) * H);
    c.rotate(m.rot ?? 0);
    c.fillStyle = m.color || '#26262a';
    c.font = `${m.weight || 'bold'} ${m.size || 30}px "Arial Narrow","Helvetica Neue",sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(m.text, 0, 0);
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// texturedCylinder — like `cylinder`, but returns its OWN Mesh carrying a CanvasTexture (so it
// can show real stencils/serials — vertex colours can't). buildSpec adds the returned mesh into
// the part's (rig-aware) group. Args: r, h; opts: r2, axis, seg, tone (base colour), marks[].
export function texturedCylinder(b, a, t, o) {
  const seg = a.seg ?? 24;
  const g = new THREE.CylinderGeometry(a.r2 ?? a.r, a.r, a.h, seg, 1);
  const mat = new THREE.MeshLambertMaterial({ map: _bodyTexture(t[a.tone || 'mid'], a.marks || []) });
  const mesh = new THREE.Mesh(g, mat);
  const or = ORIENT[a.axis ?? 'z'];
  mesh.rotation.set(or.rx || 0, or.ry || 0, or.rz || 0);
  mesh.position.set(o.x, o.y, o.z);
  return mesh;
}

// ============================================================================
// Curve / flat-decal operators — added for the H.K.M. suitcase gramophone.
// THREE-bound like the round ops above (browser-verified, not node-tested); the
// pure layers (manifest, validateSpec, extents) dispatch them by name only.
// ============================================================================

// Orient a primitive that lies in the XY plane (its NORMAL is +Z by default) so the
// normal points along `axis` — used by torus (ring plane) and flat discs/decals.
// y → faces +Y (a record lying flat, a horizontal chrome rim); x → faces +X.
const NORMAL = { z: {}, y: { rx: -Math.PI / 2 }, x: { ry: Math.PI / 2 } };

// torus — a ring of ring-radius `r`, tube-radius `tube`, lying in the plane whose normal
// is `axis` (chrome platter rim, tonearm S-bends, reproducer bezel, hinge knuckles). `arc`
// (radians) draws a partial ring. Default axis y = a horizontal ring.
export function torus(b, a, t, o) {
  const seg = a.seg ?? 28, tubeSeg = a.tubeSeg ?? 12, arc = a.arc ?? Math.PI * 2;
  const g = new THREE.TorusGeometry(a.r, a.tube, tubeSeg, seg, arc);
  b.geo(g, o.x, o.y, o.z, a.tone ? t[a.tone] : t.mid, { ...NORMAL[a.axis ?? 'y'], tint: 0.02 });
  g.dispose();
}

// tube — a swept round bar (radius `tube`) following the polyline `pts` ([[x,y,z]…] in metres,
// RELATIVE to the part origin) as a smooth CatmullRom curve. This is the gramophone's hero part:
// the S-curved chromed tonearm — a true swept curve, not stepped boxes.
export function tube(b, a, t, o) {
  const pts = a.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(pts, !!a.closed, 'catmullrom', a.tension ?? 0.5);
  const seg = a.seg ?? Math.max(20, pts.length * 10), radial = a.radial ?? 10;
  const g = new THREE.TubeGeometry(curve, seg, a.tube, radial, !!a.closed);
  b.geo(g, o.x, o.y, o.z, a.tone ? t[a.tone] : t.mid, { tint: 0.02 });
  g.dispose();
}

// texturedDisc — a flat circular face carrying a CanvasTexture: the 78-rpm record's swappable
// centre label. Returns its OWN Mesh (buildSpec drops it into the part's rig group, so the live
// gramophone can find it by rig name and re-skin the label per song). Default axis y (faces up).
// kind:'clockDial' swaps the generator for the «ЧАСОЗБОР» wall-clock dial face.
export function texturedDisc(b, a, t, o) {
  const g = new THREE.CircleGeometry(a.r, a.seg ?? 48);
  const tex = a.kind === 'clockDial'
    ? makeClockDialTexture({ brand: a.title || 'ЧАСОЗБОР', sub: a.sub ?? 'СДЕЛАНО В СССР' })
    : makeRecordLabelTexture({ title: a.title || 'СССР', mode: a.mode || 'black' });
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
  const or = NORMAL[a.axis ?? 'y'];
  mesh.rotation.set(or.rx || 0, or.ry || 0, or.rz || 0);
  mesh.position.set(o.x, o.y, o.z);
  return mesh;
}

// decal — a flat rectangular plane carrying a named CanvasTexture: the lid maker's diamond logo
// and the small engraved control plates. `kind` picks the generator. Returns its own Mesh.
export function decal(b, a, t, o) {
  const g = new THREE.PlaneGeometry(a.w, a.h);
  const transparent = a.kind === 'lidLogo';
  const map = _decalTexture(a.kind, t[a.tone || 'mid']);
  const mat = new THREE.MeshLambertMaterial({ map, transparent, depthWrite: !transparent });
  if (a.kind === 'lidLogo') { mat.emissive = new THREE.Color(0xffffff); mat.emissiveMap = map; mat.emissiveIntensity = 0.35; }  // the printed mark self-lights so it reads on the shadowed lid lining
  const mesh = new THREE.Mesh(g, mat);
  const or = NORMAL[a.axis ?? 'z'];
  mesh.rotation.set(or.rx || 0, or.ry || 0, or.rz || 0);
  mesh.position.set(o.x, o.y, o.z);
  return mesh;
}

// ---- canvas generators (exported where the live gramophone re-uses them) ----

function _star(c, R, color) {                              // 5-point gold star, centred at the cursor
  c.fillStyle = color; c.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.42 : R;
    c[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * rr, Math.sin(ang) * rr);
  }
  c.closePath(); c.fill();
}
function _arcText(c, text, cx, cy, radius, mid, step, size, flip = false) {
  c.save(); c.font = `bold ${size}px "Arial Narrow","PT Sans Narrow",sans-serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const n = text.length, start = mid - (n - 1) * step / 2;
  for (let i = 0; i < n; i++) {
    const ang = start + i * step;
    c.save();
    c.translate(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius);
    c.rotate(ang + (flip ? -Math.PI / 2 : Math.PI / 2));
    c.fillText(text[i], 0, 0);
    c.restore();
  }
  c.restore();
}

// The real 78/33-rpm Soviet pressing labels, drawn from the owner's reference photos: Апрелевский
// завод in red and blue, the cream Мелодия, plus the gold-on-black classic. Each is {bg, ink, hub,
// factory, gost, emblem, foot}. The live gramophone picks a random one per track (record-swap).
const LABEL_STYLES = {
  aprelevka_red:  { bg: ['#cf2a22', '#9c1812'], ink: '#e7c45a', hub: '#2a0c0a', factory: 'АПРЕЛЕВСКИЙ ЗАВОД', gost: 'ГОСТ 5289-50', emblem: 'spire', foot: 'КОМИТЕТ РАДИОИНФОРМАЦИИ' },
  aprelevka_blue: { bg: ['#23538f', '#143461'], ink: '#e7c45a', hub: '#0b1c34', factory: 'АПРЕЛЕВСКИЙ ЗАВОД', gost: 'ГОСТ 5289-50', emblem: 'spire', foot: 'КОМИТЕТ ПО ДЕЛАМ ИСКУССТВ' },
  melodiya:       { bg: ['#efe7d4', '#d6c8ac'], ink: '#21527a', hub: '#1d130a', factory: 'МЕЛОДИЯ', gost: 'ГОСТ 5289-73', emblem: 'melodiya', foot: 'ВСЕСОЮЗНАЯ ФИРМА ГРАМПЛАСТИНОК' },
  black:          { bg: ['#1c1c1c', '#050505'], ink: '#d8b15a', hub: '#000000', factory: 'АПРЕЛЕВСКИЙ ЗАВОД', gost: 'ГОСТ 5289-50', emblem: 'star', foot: 'МИНИСТЕРСТВО КУЛЬТУРЫ СССР' },
};
export const LABEL_STYLE_KEYS = Object.keys(LABEL_STYLES);
export function randomLabelStyle() { return LABEL_STYLE_KEYS[Math.floor(Math.random() * LABEL_STYLE_KEYS.length)]; }

// The Апрелевка radio-tower-and-wheat emblem (red/blue labels) — a stepped spire flanked by rays/ears.
function _spireEmblem(c, ink) {
  c.save(); c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 6; c.lineCap = 'round';
  for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.16; c.beginPath(); c.moveTo(0, -6); c.lineTo(Math.sin(a) * 64, -6 - Math.cos(a) * 64); c.stroke(); } // fanned rays
  c.lineWidth = 4; for (const s of [-1, 1]) for (let j = 0; j < 4; j++) { const x = s * (20 + j * 11), y = -10 + j * 8; c.beginPath(); c.moveTo(s * 8, 6); c.quadraticCurveTo(x, y, x + s * 8, y - 12); c.stroke(); } // wheat ears
  c.fillRect(-7, -2, 14, 30); c.fillRect(-11, 26, 22, 8);                      // central tower + base
  c.beginPath(); c.moveTo(0, -20); c.lineTo(-7, -2); c.lineTo(7, -2); c.closePath(); c.fill(); // spire cap
  c.restore();
}

// makeRecordLabelTexture — one authentic centre label. `style` ∈ LABEL_STYLE_KEYS (random per song);
// legacy `mode` ('cream'→melodiya, else black) still accepted. Exported so the live gramophone reskins.
export function makeRecordLabelTexture({ title = 'СССР', style, mode } = {}) {
  const key = style && LABEL_STYLES[style] ? style : (mode === 'cream' ? 'melodiya' : 'black');
  const st = LABEL_STYLES[key];
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), R = S / 2;
  const bg = c.createRadialGradient(R, R, 8, R, R, R);
  bg.addColorStop(0, st.bg[0]); bg.addColorStop(1, st.bg[1]);
  c.fillStyle = bg; c.beginPath(); c.arc(R, R, R, 0, 7); c.fill();
  c.strokeStyle = st.ink; c.lineWidth = 5; c.beginPath(); c.arc(R, R, R - 20, 0, 7); c.stroke();
  c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 32, 0, 7); c.stroke();
  c.fillStyle = st.ink;
  _arcText(c, st.factory, R, R, R - 56, -Math.PI / 2, key === 'melodiya' ? 0.075 : 0.052, 28);   // top banner
  _arcText(c, st.foot, R, R, R - 40, Math.PI / 2, 0.044, 18, true);                                // bottom banner
  c.save(); c.translate(R, R * 0.585);                                          // emblem
  if (st.emblem === 'star') _star(c, 30, st.ink);
  else if (st.emblem === 'melodiya') { c.fillStyle = st.ink; c.font = 'bold 86px Georgia,serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('М', 0, 0); }
  else _spireEmblem(c, st.ink);
  c.restore();
  c.fillStyle = st.ink; c.textAlign = 'center'; c.textBaseline = 'middle';      // title block
  const words = title.toUpperCase().split(' '); const lines = [];
  let ln = ''; for (const w of words) { if ((ln + ' ' + w).trim().length > 16) { lines.push(ln.trim()); ln = w; } else ln += ' ' + w; } if (ln.trim()) lines.push(ln.trim());
  const fs = lines.length > 2 ? 30 : 38; c.font = `bold ${fs}px "PT Sans Narrow","Arial Narrow",sans-serif`;
  lines.slice(0, 3).forEach((l, i) => c.fillText(l, R, R * 1.06 + (i - (lines.length - 1) / 2) * (fs + 4)));
  c.font = '16px "PT Sans Narrow",sans-serif'; c.fillText(st.gost, R, R * 1.44);
  c.fillStyle = st.hub; c.beginPath(); c.arc(R, R, 11, 0, 7); c.fill();         // spindle hole
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// _decalTexture — the lid maker's diamond logo and the engraved control plates.
function _decalTexture(kind, baseHex) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 512;
  const c = cv.getContext('2d');
  if (kind === 'lidLogo') {
    // transparent ground; a cream diamond stamp, a red СССР flag, a clef curl + factory caption
    c.clearRect(0, 0, 512, 512);
    c.save(); c.translate(248, 190); c.rotate(Math.PI / 4);
    c.fillStyle = '#e0d4af'; c.fillRect(-140, -140, 280, 280);              // bright cream diamond
    c.strokeStyle = 'rgba(40,28,16,.55)'; c.lineWidth = 5; c.strokeRect(-140, -140, 280, 280);
    c.restore();
    c.strokeStyle = '#1a120a'; c.lineWidth = 13; c.lineCap = 'round';        // stylised treble-clef stem
    c.beginPath(); c.moveTo(232, 92); c.bezierCurveTo(312, 138, 246, 262, 230, 290); c.stroke();
    c.fillStyle = '#1a120a'; c.beginPath(); c.arc(228, 304, 20, 0, 7); c.fill();
    c.save(); c.translate(296, 130); c.rotate(-0.12);                        // red СССР flag
    c.fillStyle = '#c0241f'; c.fillRect(0, 0, 116, 72);
    c.fillStyle = '#e7c463'; c.font = 'bold 30px "PT Sans Narrow",sans-serif'; c.textAlign = 'center'; c.fillText('СССР', 62, 44);
    c.restore();
    c.fillStyle = '#d8b15a'; c.textAlign = 'center'; c.font = 'bold 38px "PT Sans Narrow",sans-serif';
    c.fillText('Н.К.М. ГЛАВШИРПОТРЕБ', 256, 372);
    c.font = 'bold 28px "PT Sans Narrow",sans-serif'; c.fillStyle = '#c49a48';
    ['ЛЕНИНГРАДСКИЙ', 'ГРАММОФОННЫЙ ЗАВОД'].forEach((s, i) => c.fillText(s, 256, 414 + i * 34));
  } else {
    // nickel control plate (speed regulator / auto-stop), engraved dark text
    const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#c9ced3'); g.addColorStop(.5, '#9aa0a6'); g.addColorStop(1, '#787e84');
    c.fillStyle = g; c.fillRect(0, 0, 512, 512);
    c.strokeStyle = '#5a5f64'; c.lineWidth = 8; c.strokeRect(8, 8, 496, 496);
    c.fillStyle = '#2a2d30'; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (kind === 'speedPlate') {
      c.font = 'bold 84px "PT Sans Narrow",sans-serif'; c.fillText('FH 78', 256, 150);
      c.font = '54px "PT Sans Narrow",sans-serif'; c.fillText('Bremze', 256, 250);
      c.strokeStyle = '#2a2d30'; c.lineWidth = 5;                            // speed scale ticks
      for (let i = 0; i <= 10; i++) { const x = 70 + i * 37; c.beginPath(); c.moveTo(x, 350); c.lineTo(x, i % 5 ? 390 : 410); c.stroke(); }
    } else {                                                                 // autoPlate
      c.font = 'bold 70px "PT Sans Narrow",sans-serif'; c.fillText('АВТОСТОП', 256, 170);
      c.font = '60px "PT Sans Narrow",sans-serif'; c.fillText('ВКЛ  ·  ВЫКЛ', 256, 300);
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// makeClockDialTexture — the «ЧАСОЗБОР» Soviet wall-clock dial («Стрела» family look):
// pale enamel face, black plain-grotesque Arabic numerals 1–12, dash minute track with
// long dashes + outer dots at the hours, factory wordmark under the 12, «СДЕЛАНО В СССР»
// above the 6. 1024px canvas so the numerals stay crisp when the player walks up close —
// the whole point of this prop is READING the time. Exported for the admin/asset viewer.
export function makeClockDialTexture({ brand = 'ЧАСОЗБОР', sub = 'СДЕЛАНО В СССР' } = {}) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d'), R = S / 2;

  // pale grey-green enamel, faintly darker toward the rim (aged lacquer)
  const bg = c.createRadialGradient(R, R, S * 0.05, R, R, R);
  bg.addColorStop(0, '#eceee6'); bg.addColorStop(0.82, '#e4e6dc'); bg.addColorStop(1, '#d6d8cc');
  c.fillStyle = bg; c.beginPath(); c.arc(R, R, R, 0, 7); c.fill();

  const INK = '#161616';
  // minute track: 60 marks — short dash per minute, long dash + outer dot at each hour
  for (let i = 0; i < 60; i++) {
    const hour = i % 5 === 0;
    const ang = (i / 60) * Math.PI * 2 - Math.PI / 2;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const ro = R * 0.86, ri = ro - (hour ? R * 0.085 : R * 0.05);
    c.strokeStyle = INK; c.lineWidth = hour ? S * 0.013 : S * 0.007; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(R + cos * ri, R + sin * ri); c.lineTo(R + cos * ro, R + sin * ro); c.stroke();
    if (hour) { c.fillStyle = INK; c.beginPath(); c.arc(R + cos * R * 0.93, R + sin * R * 0.93, S * 0.011, 0, 7); c.fill(); }
  }

  // numerals 1–12, plain sans (the Стрела dial uses an unadorned grotesque)
  c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `bold ${Math.round(S * 0.125)}px "Helvetica Neue",Arial,sans-serif`;
  for (let h = 1; h <= 12; h++) {
    const ang = (h / 12) * Math.PI * 2 - Math.PI / 2;
    c.fillText(String(h), R + Math.cos(ang) * R * 0.665, R + Math.sin(ang) * R * 0.672);
  }

  // factory wordmark under the 12 + small «СДЕЛАНО В СССР» above the 6
  c.font = `italic bold ${Math.round(S * 0.052)}px "PT Sans Narrow","Arial Narrow",sans-serif`;
  c.fillText(brand, R, R * 0.62);
  c.strokeStyle = INK; c.lineWidth = S * 0.005;                     // Стрела-style speed-lines flanking the wordmark
  const bw = c.measureText(brand).width;
  c.beginPath(); c.moveTo(R - bw / 2 - S * 0.06, R * 0.62); c.lineTo(R - bw / 2 - S * 0.015, R * 0.62);
  c.moveTo(R + bw / 2 + S * 0.015, R * 0.62); c.lineTo(R + bw / 2 + S * 0.06, R * 0.62); c.stroke();
  if (sub) { c.font = `${Math.round(S * 0.030)}px "PT Sans Narrow","Arial Narrow",sans-serif`; c.fillText(sub, R, R * 1.34); }

  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
