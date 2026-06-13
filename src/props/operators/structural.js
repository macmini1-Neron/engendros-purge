// structural.js — box-only structural operators (no THREE; unit-testable).
// Layered shading via STACKED full-footprint layers (lit top / mid body / shadow
// foot). Stacking (rather than overlapping a smaller cap on top of a full body)
// means there are no coplanar EXPOSED faces, so flat tops do not z-fight. The
// three layers share the full w×d footprint, so a side reads as bright/mid/lo
// horizontal bands and the top is a single clean lit face.
//
// Every operator has a matching extents fn (local AABB, before `at`/`rot`) in
// structuralExtents below — keep them in lockstep with the emitted boxes; the
// bounds validator depends on it.

export const PANEL_TH = 0.025;   // default panel thickness (m) — pass args.th for thin/thick panels
export const PLATE_TH = 0.04;    // default plate thickness (m)
export const STENCIL_TH = 0.004; // stencil appliqué stands this proud of the face it marks

export function bevelBox(b, a, t, o) {
  const { w, h, d } = a;
  const lip = Math.min(0.02, h * 0.3);
  b.box(w, lip, d, o.x, o.y + h / 2 - lip / 2, o.z, t.bright);     // lit top layer
  b.box(w, h - 2 * lip, d, o.x, o.y, o.z, t.mid);                  // body
  b.box(w, lip, d, o.x, o.y - h / 2 + lip / 2, o.z, t.lo);        // shadow foot
}

export function panel(b, a, t, o) {
  const { w, h } = a, th = a.th ?? PANEL_TH;
  const lip = Math.min(0.03, h * 0.25);
  b.box(w, lip, th, o.x, o.y + h / 2 - lip / 2, o.z, t.bright);    // lit top edge
  b.box(w, h - lip, th, o.x, o.y - lip / 2, o.z, t.mid);          // body below it
}

export function plate(b, a, t, o) {
  const { w, d } = a, th = a.th ?? PLATE_TH;
  b.box(w, th, d, o.x, o.y, o.z, t.lo);                           // single thin recessed slab (kick/footer)
}

// stencil — a flat single-tone appliqué (marking, star, label, painted patch).
// Sits PROUD of the face it marks: place `at` ON the face plane and `rot` the
// part so local +Z points out of the surface. One tone only — markings must not
// pick up the lit/shadow banding of the surface they sit on.
// args.lines (optional, default 1): split the patch into n thin bars — a solid
// black w×h slab reads as a HOLE in the surface; 3 bars read as stencilled text.
export function stencil(b, a, t, o) {
  const { w, h } = a, n = a.lines ?? 1;
  if (n <= 1) { b.box(w, h, STENCIL_TH, o.x, o.y, o.z + STENCIL_TH / 2, t.mid); return; }
  const bh = (h * 0.6) / n;                          // bars; the other 40% is the gaps
  const gap = (h - n * bh) / (n - 1);
  for (let i = 0; i < n; i++) {
    const bw = w * (i === n - 1 ? 0.7 : 1);          // last line shorter, left-aligned — reads as text
    b.box(bw, bh, STENCIL_TH, o.x - (w - bw) / 2, o.y + h / 2 - bh / 2 - i * (bh + gap), o.z + STENCIL_TH / 2, t.mid);
  }
}

// planks — a slab assembled from `count` boards with recessed shadow gaps
// between them (a crate wall, a plank lid, board flooring). FLOOR-anchored.
// axis 'y' (default): boards stack vertically — horizontal seams wrap all four
// sides (crate body). axis 'z': boards lie side-by-side along depth — seams run
// along the length (a lid seen from above). Gaps are slot-tone strips inset
// PLANK_GAP_IN on both faces, so no face is coplanar with the boards (z-safe).
export const PLANK_GAP = 0.004;     // shadow seam between boards
export const PLANK_GAP_IN = 0.003;  // how far the seam strip sits back from the board face

export function planks(b, a, t, o) {
  const { w, h, d } = a, n = a.count, axis = a.axis ?? 'y';
  const span = axis === 'y' ? h : d;                 // the axis the boards divide
  const bw = (span - (n - 1) * PLANK_GAP) / n;       // board width along that axis
  for (let i = 0; i < n; i++) {
    const c0 = i * (bw + PLANK_GAP) + bw / 2;        // board centre along the axis (from 0)
    const tone = n >= 3 && i === 0 ? t.lo : i === n - 1 ? t.hi : t.mid;
    if (axis === 'y') b.box(w, bw, d, o.x, o.y + c0, o.z, tone);
    else b.box(w, h, bw, o.x, o.y + h / 2, o.z - d / 2 + c0, tone);
    if (i < n - 1) {                                  // recessed seam strip after this board
      const g0 = c0 + bw / 2 + PLANK_GAP / 2;
      if (axis === 'y') b.box(w - 2 * PLANK_GAP_IN, PLANK_GAP, d - 2 * PLANK_GAP_IN, o.x, o.y + g0, o.z, t.slot);
      else b.box(w - 2 * PLANK_GAP_IN, h - 2 * PLANK_GAP_IN, PLANK_GAP, o.x, o.y + h / 2, o.z - d / 2 + g0, t.slot);
    }
  }
}

// finSet — `count` cruciform fins around the +Z axis (a missile's long axis), each fin a
// stack of `steps` thin plates whose chord tapers root→tip (a stepped delta, voxel-style).
// Box-only (rotated boxes), so it stays pure + unit-testable. Args: count, root (root chord),
// span (radial reach); opts: tip (tip chord), thick, r0 (body radius the fins start at),
// sweep (shift the chord centre along +Z per step), phase (angular offset), steps.
export function finSet(b, a, t, o) {
  const count = a.count ?? 4, steps = a.steps ?? 3;
  const root = a.root, tip = a.tip ?? root * 0.25, span = a.span;
  const thick = a.thick ?? 0.04, r0 = a.r0 ?? 0, sweep = a.sweep ?? 0, phase = a.phase ?? 0;
  for (let k = 0; k < count; k++) {
    const ang = phase + (k / count) * Math.PI * 2;
    const c = Math.cos(ang), s = Math.sin(ang);
    for (let i = 0; i < steps; i++) {
      const f = steps === 1 ? 0 : i / (steps - 1);
      const len = root + (tip - root) * f;                 // chord tapers root→tip
      const rad = r0 + span * (i + 0.5) / steps;            // radial centre of this plate
      // after rz=ang: local-X (radial extent) points radially, local-Y (thick) is tangential
      b.box(span / steps + 0.012, thick, len, o.x + c * rad, o.y + s * rad, o.z + sweep * f,
            i >= steps - 1 ? t.bright : t.mid, { rz: ang });
    }
  }
}

// latticeBeam — an open truss/girder along +Z (a launch rail, gantry, tower leg): 4 longitudinal
// corner chords + a vertical post & a top/bottom cross member at every bay station + zig-zag side
// diagonals. Box-only (thin members), so it stays pure + unit-testable. Args: len (along Z), w, h
// (cross-section); opts: bays (truss divisions), chord (member thickness).
// Posts BUTT between the chords (h−2ch) and diagonals sit 2 mm inboard — members never share a
// same-normal coplanar face with the chords (that shimmered on the original version).
export function latticeBeam(b, a, t, o) {
  const len = a.len, w = a.w, h = a.h;
  const bays = a.bays ?? Math.max(3, Math.round(len / Math.max(0.3, h * 1.1)));
  const ch = a.chord ?? 0.05, hw = w / 2, hh = h / 2, bl = len / bays;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {                  // 4 corner chords
    b.box(ch, ch, len, o.x + sx * (hw - ch / 2), o.y + sy * (hh - ch / 2), o.z, sy > 0 ? t.bright : t.mid);
  }
  for (let i = 0; i <= bays; i++) {                                       // posts + cross members per station
    const z = o.z - len / 2 + i * bl + (i === 0 ? ch / 2 : i === bays ? -ch / 2 : 0);  // end stations flush with the chord ends
    for (const sx of [-1, 1]) b.box(ch, h - 2 * ch, ch, o.x + sx * (hw - ch / 2), o.y, z, t.lo);
    for (const sy of [-1, 1]) b.box(w - 2 * ch, ch, ch, o.x, o.y + sy * (hh - ch / 2), z, t.mid);
  }
  const ang = Math.atan2(h, bl), diag = Math.hypot(bl, h);               // side diagonals (zig-zag)
  for (let i = 0; i < bays; i++) {
    const z = o.z - len / 2 + (i + 0.5) * bl, dir = i % 2 ? 1 : -1;
    for (const sx of [-1, 1]) b.box(ch, ch, diag, o.x + sx * (hw - ch / 2 - 0.002), o.y, z, t.mid, { rx: dir * ang });
  }
}

// cabinet — a paneled equipment box (an ЭСП-90 housing, container, generator set): a layered body
// with a chamfered narrower top, vertical panel grooves down the long sides, and a lit top cap.
// Box-only, pure/testable. Args: w, h, d; opts: panels (groove count), inset (top chamfer width).
// Foot and cap are STACKED layers (not boxes buried inside the body) — coplanar-face safe.
export function cabinet(b, a, t, o) {
  const { w, h, d } = a, inset = a.inset ?? 0.12;
  const lowH = h * 0.72, topH = h - lowH;
  b.box(w, 0.03, d, o.x, o.y - h / 2 + 0.015, o.z, t.lo);                                 // shadow foot
  b.box(w, lowH - 0.03, d, o.x, o.y - h / 2 + 0.03 + (lowH - 0.03) / 2, o.z, t.mid);     // lower body (stacked on the foot)
  b.box(w - 2 * inset, topH - 0.03, d - inset, o.x, o.y - h / 2 + lowH + (topH - 0.03) / 2, o.z, t.hi); // chamfered top block
  b.box(w - 2 * inset, 0.03, d - inset, o.x, o.y + h / 2 - 0.015, o.z, t.bright);         // lit top cap (stacked)
  const panels = a.panels ?? Math.max(2, Math.round(d / 0.6)), pd = d / panels;
  for (let i = 1; i < panels; i++) {
    const z = o.z - d / 2 + i * pd;
    for (const sx of [-1, 1]) b.box(0.03, lowH * 0.8, 0.04, o.x + sx * (w / 2 - 0.01), o.y - h / 2 + lowH / 2, z, t.slot);
  }
}

// star — a flat N-pointed emblem (the Soviet red star): `points` tapered spokes radiating in a plane,
// each a thin rotated box, plus a small centre hub. Box-only (no THREE; unit-testable). Args: r (outer
// radius). Opts: points (default 5), th (depth out of the face), axis ('z' faces ±Z / 'x' faces ±X),
// tone (default bright). k=0 points straight up (+Y).
export function star(b, a, t, o) {
  const r = a.r, pts = a.points ?? 5, th = a.th ?? 0.05, tone = a.tone ? t[a.tone] : t.bright;
  const axis = a.axis ?? 'z', W = r * 0.32;
  for (let k = 0; k < pts; k++) {
    const ang = k * (2 * Math.PI / pts), c = Math.cos(ang), s = Math.sin(ang);
    if (axis === 'x') b.box(th, r, W, o.x, o.y + c * r / 2, o.z + s * r / 2, tone, { rx: ang });
    else              b.box(W, r, th, o.x - s * r / 2, o.y + c * r / 2, o.z, tone, { rz: ang });
  }
  if (axis === 'x') b.box(th, W, W, o.x, o.y, o.z, tone);
  else              b.box(W, W, th, o.x, o.y, o.z, tone);
}

// meshReflector — a curved open-mesh radar reflector (the P-37 «Bar Lock» dish): a shallow
// parabolic-cylinder surface of fine horizontal slats over sparse vertical ribs, inside a thicker
// edge frame. Concave toward +Z (boresight), so the feed horns sit in front of it at +Z. Box-only:
// each slat is a chain of short yaw-rotated segments that step along the arc, so it stays pure +
// unit-testable. Args: w (chord width across the rim), h (height); opts: curve (sagitta — how far
// the centre is set back from the rim, default w*0.06), rows (horizontal slats), cols (vertical
// ribs), seg (arc segments per slat), chord (member thickness), border (edge frame on by default).
export function meshReflector(b, a, t, o) {
  const w = a.w, h = a.h, curve = a.curve ?? w * 0.06;
  const cols = a.cols ?? Math.max(3, Math.round(w / 1.2));
  const rows = a.rows ?? Math.max(6, Math.round(h / 0.3));
  const seg  = a.seg  ?? Math.max(cols, 14);
  const ch   = a.chord ?? 0.05;
  const clipT = a.clipTop ?? a.clip ?? 0;   // corner clip at the TOP edge (the P-37 pentagon: top corners cut)
  const clipB = a.clipBot ?? 0;             // corner clip at the BOTTOM edge (P-37 bottom is square → 0)
  const clipH = a.clipH ?? 0.22;            // fraction of half-height each corner taper runs over
  const hw = w / 2, hh = h / 2, fz = a.flipZ ? -1 : 1;        // flipZ: concave opens toward −Z (the rear-of-cabin reflector)
  const zoff = (x) => fz * -curve * (1 - (x / hw) ** 2);      // rim at z=0; centre set back to the convex side
  const hwAt = (yy) => {                                       // half-width of the (clipped) outline at signed height yy
    const cl = yy >= 0 ? clipT : clipB, at = Math.abs(yy) / hh;
    return cl <= 0 || at <= 1 - clipH ? hw : hw * (1 - cl * (at - (1 - clipH)) / clipH);
  };
  const edge = (x, cl) => {                                    // half-height a rib at x reaches on the clip-`cl` side
    const ax = Math.abs(x);
    return cl <= 0 || ax <= hw * (1 - cl) ? hh : hh * ((1 - clipH) + clipH * (1 - ax / hw) / cl);
  };
  // one slat/rail: short yaw-rotated boxes stepping along the arc between ±hwY at height y
  const arcSeg = (y, th, dpt, tone, hwY) => {
    for (let s = 0; s < seg; s++) {
      const x0 = -hwY + (s / seg) * 2 * hwY, x1 = -hwY + ((s + 1) / seg) * 2 * hwY;
      const z0 = zoff(x0), z1 = zoff(x1), dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz);
      b.box(L + 0.004, th, dpt, o.x + (x0 + x1) / 2, o.y + y, o.z + (z0 + z1) / 2, tone, { ry: Math.atan2(-dz, dx) });
    }
  };
  for (let i = 0; i < cols; i++) {                            // vertical ribs (clipped to the outline, asymmetric top/bottom)
    const x = cols === 1 ? 0 : -hw + (i / (cols - 1)) * w, yt = edge(x, clipT), yb = edge(x, clipB);
    b.box(ch * 1.4, yt + yb, ch * 1.4, o.x + x, o.y + (yt - yb) / 2, o.z + zoff(x), t.lo);
  }
  for (let j = 0; j < rows; j++) {                            // horizontal slats (the dominant barred face)
    const y = rows === 1 ? 0 : -hh + (j / (rows - 1)) * h;
    arcSeg(y, ch * 1.2, ch, j === rows - 1 ? t.bright : j === 0 ? t.lo : t.mid, hwAt(y));
  }
  if (a.border !== false) {                                   // lit edge frame following the (clipped) outline
    const fr = ch * 2.0;
    arcSeg(hh, fr, fr, t.bright, hwAt(hh));                   // top rail (narrower — clipped)
    arcSeg(-hh, fr, fr, t.mid, hwAt(-hh));                    // bottom rail
    if (clipT > 0 || clipB > 0) {
      const N = rows;                                         // trace the clipped outline up both sides
      for (const sx of [-1, 1]) for (let k = 0; k <= N; k++) {
        const y = -hh + (k / N) * h, x = sx * hwAt(y);
        b.box(fr, h / N + 0.012, fr, o.x + x, o.y + y, o.z + zoff(x), t.hi);
      }
    } else {
      for (const sx of [-1, 1]) b.box(fr, h, fr, o.x + sx * hw, o.y, o.z + zoff(sx * hw), t.hi);  // straight side posts
    }
  }
}

export const structuralExtents = {
  bevelBox: (a) => ({ min: [-a.w / 2, -a.h / 2, -a.d / 2], max: [a.w / 2, a.h / 2, a.d / 2] }),
  panel: (a) => { const th = a.th ?? PANEL_TH; return { min: [-a.w / 2, -a.h / 2, -th / 2], max: [a.w / 2, a.h / 2, th / 2] }; },
  plate: (a) => { const th = a.th ?? PLATE_TH; return { min: [-a.w / 2, -th / 2, -a.d / 2], max: [a.w / 2, th / 2, a.d / 2] }; },
  stencil: (a) => ({ min: [-a.w / 2, -a.h / 2, 0], max: [a.w / 2, a.h / 2, STENCIL_TH] }),
  planks: (a) => ({ min: [-a.w / 2, 0, -a.d / 2], max: [a.w / 2, a.h, a.d / 2] }),
  finSet: (a) => {
    const r = (a.r0 ?? 0) + a.span + 0.03 + (a.thick ?? 0.04) / 2;       // radial reach (conservative)
    const zMin = -a.root / 2, zMax = Math.max(a.root / 2, (a.sweep ?? 0) + (a.tip ?? a.root * 0.25) / 2);
    return { min: [-r, -r, zMin], max: [r, r, zMax] };
  },
  latticeBeam: (a) => ({ min: [-a.w / 2, -a.h / 2, -a.len / 2], max: [a.w / 2, a.h / 2, a.len / 2] }),
  cabinet: (a) => ({ min: [-(a.w / 2 + 0.005), -a.h / 2, -a.d / 2], max: [a.w / 2 + 0.005, a.h / 2, a.d / 2] }),
  // P-37 radar
  star: (a) => {
    const r = a.r, th = a.th ?? 0.05;
    return a.axis === 'x'
      ? { min: [-th / 2, -r, -r], max: [th / 2, r, r] }
      : { min: [-r, -r, -th / 2], max: [r, r, th / 2] };
  },
  meshReflector: (a) => {
    const hw = a.w / 2, hh = a.h / 2, ch = a.chord ?? 0.05;
    const rows = a.rows ?? Math.max(6, Math.round(a.h / 0.3));
    const curve = a.curve ?? a.w * 0.06, fz = a.flipZ ? -1 : 1, z1 = fz * -curve;   // centre set-back
    const m = ch * 1.5;                          // member half-thickness margin (ribs ch*0.7, rails ch)
    const yo = (a.h / rows) / 2 + 0.006 + m;     // clip-outline rail boxes overhang ±hh by ~half a row
    return { min: [-hw - m, -hh - yo, Math.min(0, z1) - m], max: [hw + m, hh + yo, Math.max(0, z1) + m] };
  },
};
