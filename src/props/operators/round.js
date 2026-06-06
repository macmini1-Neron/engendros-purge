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

// wheel — a detailed road wheel: a dark rubber tyre over a lighter proud hub drum + centre cap +
// a ring of lug bolts. `twin:true` → a dual wheel (two tyres side by side, a heavy-trailer bogie),
// each tyre showing its hub on the OUTBOARD face. Round (THREE-bound, browser-verified). Args:
// r (tyre outer radius), w (single-tyre width). Opts: axis ('x' default — axle along X, wheel faces
// ±X), lugs (bolt count, 8), twin, hub (default on), face (+1/−1 outboard for a single wheel), seg.
export function wheel(b, a, t, o) {
  const r = a.r, w = a.w, axis = a.axis ?? 'x', seg = a.seg ?? 22;
  const lugs = a.lugs ?? 8, twin = !!a.twin, hub = a.hub !== false, face = a.face ?? 1;
  const or = ORIENT[axis];
  const B = {                                              // axle dir AX + the two in-face axes U,V
    x: { AX: [1, 0, 0], U: [0, 1, 0], V: [0, 0, 1] },
    y: { AX: [0, 1, 0], U: [1, 0, 0], V: [0, 0, 1] },
    z: { AX: [0, 0, 1], U: [1, 0, 0], V: [0, 1, 0] },
  }[axis];
  const P = (du, dv, dax) => [
    o.x + B.U[0] * du + B.V[0] * dv + B.AX[0] * dax,
    o.y + B.U[1] * du + B.V[1] * dv + B.AX[1] * dax,
    o.z + B.U[2] * du + B.V[2] * dv + B.AX[2] * dax,
  ];
  const cyl = (rad, len, dax, tone) => {
    const g = new THREE.CylinderGeometry(rad, rad, len, seg);
    b.geo(g, ...P(0, 0, dax), tone, { ...or, tint: 0.02 });
    g.dispose();
  };
  const dome = (rad, dax, out, tone) => {                  // a rounded hub-cap hemisphere, bulging outboard
    const g = new THREE.SphereGeometry(rad, seg, Math.max(6, seg >> 1), 0, Math.PI * 2, 0, Math.PI / 2);
    const rot = axis === 'x' ? { rz: out > 0 ? -Math.PI / 2 : Math.PI / 2 }
              : axis === 'z' ? { rx: out > 0 ? Math.PI / 2 : -Math.PI / 2 }
              : (out > 0 ? {} : { rx: Math.PI });           // +Y-pole hemisphere → aim pole along the axle
    b.geo(g, ...P(0, 0, dax), tone, { ...rot, tint: 0.02 });
    g.dispose();
  };
  const discs = twin ? [-w * 0.52, w * 0.52] : [0];        // tyre-centre offsets along the axle
  for (const c of discs) {
    const out = c > 0 ? 1 : c < 0 ? -1 : face;             // outboard face direction for this tyre
    cyl(r, w, c, t.lo);                                     // rubber tyre (dark; capped flat face)
    if (hub) {
      const hubR = r * 0.5;
      cyl(hubR, w * 0.5, c + out * w * 0.24, t.mid);        // hub drum base (mid)
      for (let i = 0; i < lugs; i++) {                      // lug bolts ringed around the hub
        const ang = (i / lugs) * Math.PI * 2, rl = hubR * 0.8;
        b.box(0.05, 0.05, 0.05, ...P(Math.cos(ang) * rl, Math.sin(ang) * rl, c + out * w * 0.48), t.hi);
      }
      dome(hubR * 0.82, c + out * w * 0.4, out, t.bright);  // proud rounded hub-cap dome
    }
  }
}

// pipe — a bent tube / conduit run (a waveguide, cable duct, brake line, handrail): a chain of
// cylinder segments threaded through `pts` with a ball joint at each interior bend, so it follows any
// 3-D path smoothly (uses geo()'s `align` to aim each segment). Round (THREE-bound, browser-verified).
// Args: pts (array of [x,y,z] offsets from `at`), r (tube radius). Opts: seg, tone, joints (default on).
export function pipe(b, a, t, o) {
  const r = a.r, seg = a.seg ?? 10, tone = a.tone ? t[a.tone] : t.hi, joints = a.joints !== false;
  const V = (a.pts || []).map((p) => new THREE.Vector3(o.x + p[0], o.y + p[1], o.z + p[2]));
  for (let i = 0; i < V.length - 1; i++) {
    const dir = V[i + 1].clone().sub(V[i]), len = dir.length();
    if (len < 1e-4) continue;
    const mid = V[i].clone().add(V[i + 1]).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    b.geo(g, mid.x, mid.y, mid.z, tone, { align: dir, tint: 0.02 });
    g.dispose();
  }
  if (joints) for (let i = 1; i < V.length - 1; i++) {        // ball joints at the bends
    const g = new THREE.SphereGeometry(r * 1.2, seg, Math.max(5, seg >> 1));
    b.geo(g, V[i].x, V[i].y, V[i].z, tone, { tint: 0.02 });
    g.dispose();
  }
}

// tubeMast — a tapered tubular lattice tower / derrick of round tubes that converges toward an apex:
// 4 corner legs from a base rectangle up to a smaller top rectangle (topW/topD→~0 gives a point apex),
// with a horizontal ring + X cross-braces on each face at every level. Round (THREE-bound). Args:
// baseW, baseD, h. Opts: topW, topD (top footprint, default 0.2 = near-point apex), r (leg tube radius),
// levels (brace stations), apexZ (lean the top along Z), tone.
export function tubeMast(b, a, t, o) {
  const bw = a.baseW, bd = a.baseD, h = a.h;
  const tw = a.topW ?? 0.2, td = a.topD ?? 0.2, r = a.r ?? 0.06, levels = a.levels ?? 3;
  const tone = a.tone ? t[a.tone] : t.hi, apexZ = a.apexZ ?? 0;
  const corner = (i, f) => {                                  // corner i (0..3) at height fraction f
    const sx = (i & 1) ? 1 : -1, sz = (i & 2) ? 1 : -1;
    const w = bw + (tw - bw) * f, d = bd + (td - bd) * f;
    return new THREE.Vector3(o.x + sx * w / 2, o.y + f * h, o.z + apexZ * f + sz * d / 2);
  };
  const seg = (p, q, rad, tn) => {                            // one tube p→q
    const dir = q.clone().sub(p), len = dir.length(); if (len < 1e-4) return;
    const mid = p.clone().add(q).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(rad, rad, len, 8);
    b.geo(g, mid.x, mid.y, mid.z, tn, { align: dir, tint: 0.02 }); g.dispose();
  };
  const ring = (f) => [corner(0, f), corner(1, f), corner(3, f), corner(2, f)];  // CCW order
  for (let i = 0; i < 4; i++) seg(corner(i, 0), corner(i, 1), r, tone);          // 4 corner legs
  for (let L = 1; L <= levels; L++) {
    const c = ring(L / levels), p = ring((L - 1) / levels);
    for (let k = 0; k < 4; k++) seg(c[k], c[(k + 1) % 4], r * 0.8, t.mid);        // horizontal ring
    for (let k = 0; k < 4; k++) { seg(p[k], c[(k + 1) % 4], r * 0.6, t.lo); seg(p[(k + 1) % 4], c[k], r * 0.6, t.lo); }  // X braces
  }
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
