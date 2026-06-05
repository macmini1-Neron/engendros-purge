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
