// gen.mjs — parametric generator for the 82-ПМ-37 mortar spec.
// Barrel parts are placed along the bore axis (52° rest elevation) via pt(f); every
// barrel part is authored axis:'z' + rot ROT so its local +Z aligns to the bore.
// Run: node models/mortar-82pm37/gen.mjs   → writes spec.json
import { writeFileSync } from 'node:fs';

const D2R = Math.PI / 180;
const ELEV = 52;                          // rest display elevation (deg) — derived_dimensions.elevation_at_rest_deg
const ROT = [-ELEV, 0, 0];                // tilts an axis:'z' primitive UP to the bore direction
const P = [0, 0.11, -0.285];              // ball-socket pivot (azimuth + elevation), z-shifted so the bbox centres on z=0
const d = [0, Math.sin(ELEV * D2R), Math.cos(ELEV * D2R)];  // bore unit direction
const L = 1.34;                           // ball-seat → muzzle visible length (derived: tube 1220 + казённик)
const r3 = (n) => Math.round(n * 1000) / 1000;
const pt = (f) => [r3(P[0] + f * L * d[0]), r3(P[1] + f * L * d[1]), r3(P[2] + f * L * d[2])];

// A vertical (axis:'y') cylinder tilted so its +Y points apex→foot.
// Closed form (ry=0): rz=atan2(-dx,√(1-dx²)), rx=atan2(dz,dy), dir = norm(A-F).
const deg = (r) => r3(r / D2R);
function legGeom(A, F) {
  const v = [A[0] - F[0], A[1] - F[1], A[2] - F[2]];
  const len = Math.hypot(...v);
  const dir = v.map((c) => c / len);
  const rz = Math.atan2(-dir[0], Math.sqrt(Math.max(0, 1 - dir[0] * dir[0])));
  const rx = Math.atan2(dir[2], dir[1]);
  const mid = [r3((A[0] + F[0]) / 2), r3((A[1] + F[1]) / 2), r3((A[2] + F[2]) / 2)];
  return { mid, len: r3(len), rot: [deg(rx), 0, deg(rz)] };
}

// Helix polyline (local, swept along +Z) for a real coil spring via the `tube` op.
function helix(R, turns, h, N = 56) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const z = -h / 2 + h * (i / N), th = 2 * Math.PI * turns * (i / N);
    pts.push([r3(R * Math.cos(th)), r3(R * Math.sin(th)), r3(z)]);
  }
  return pts;
}

const SD = 'dossier#derived_dimensions';
const SF = 'dossier#feature_inventory';
const SS = 'dossier#specifications';

// Stencil marks wrapped around the tube via texturedCylinder (x=around circumference 0..1,
// y=along length 0..1). Text is REPRESENTATIVE Soviet ordnance stencilling, not a dimension:
// the designation (82-ПМ-37) + caliber (82мм) are sourced facts; «ОТК» = the factory
// acceptance (Отдел Технического Контроля) stamp; the star is a generic proof mark. Exact
// layout/serials are unsourced → logged in needs[], never an invented serial number.
const TUBE_MARKS = [
  { text: '82-ПМ-37', x: 0.5,  y: 0.205, size: 42, color: '#f1ebd9' },
  { text: '★',        x: 0.5,  y: 0.275, size: 40, color: '#f1ebd9' },
  { text: '82 мм',    x: 0.5,  y: 0.68,  size: 34, color: '#f1ebd9' },
  { text: 'ОТК',      x: 0.0,  y: 0.50,  size: 26, color: '#e2dcc8' },  // acceptance stamp on the off side
];

const parts = [];
const part = (id, op, args, at, mat, src, rig, rot) =>
  parts.push({ id, op, args, at, mat, src, ...(rig ? { rig } : {}), ...(rot ? { rot } : {}) });

// ───────── BASEPLATE (rig azimuth — yaws to bearing, does not pitch) ─────────
part('baseplate_body', 'cylinder', { r: 0.26, h: 0.05, axis: 'y', tone: 'mid' }, [0, 0.03, -0.285], 'paintOD', `${SD}.baseplate_diameter_mm`, 'azimuth');
part('baseplate_rim', 'torus', { r: 0.255, tube: 0.022, axis: 'y', tone: 'lo' }, [0, 0.05, -0.285], 'steel', `${SD}.baseplate_diameter_mm`, 'azimuth');
// short DARK-GREEN hub gussets near the socket (NOT bright full-radius spokes) → reads as a dished plate, not a wheel
part('baseplate_ribs', 'finSet', { count: 6, root: 0.018, tip: 0.009, span: 0.095, thick: 0.011, r0: 0.055, steps: 3, tone: 'lo' }, [0, 0.055, -0.285], 'paintOD', SF, 'azimuth', [-90, 0, 0]);
part('socket_cup', 'cylinder', { r: 0.06, h: 0.08, axis: 'y', tone: 'hi' }, [0, 0.09, -0.285], 'steel', SF, 'azimuth');
// 4 rim grab-handles (derived_dimensions.baseplate_handles_count = 4)
part('handle_e', 'torus', { r: 0.028, tube: 0.007, axis: 'x', arc: Math.PI, tone: 'mid' }, [0.25, 0.065, -0.285], 'steel', `${SD}.baseplate_handles_count`, 'azimuth');
part('handle_w', 'torus', { r: 0.028, tube: 0.007, axis: 'x', arc: Math.PI, tone: 'mid' }, [-0.25, 0.065, -0.285], 'steel', `${SD}.baseplate_handles_count`, 'azimuth');
part('handle_f', 'torus', { r: 0.028, tube: 0.007, axis: 'z', arc: Math.PI, tone: 'mid' }, [0, 0.065, -0.045], 'steel', `${SD}.baseplate_handles_count`, 'azimuth');
part('handle_b', 'torus', { r: 0.028, tube: 0.007, axis: 'z', arc: Math.PI, tone: 'mid' }, [0, 0.065, -0.525], 'steel', `${SD}.baseplate_handles_count`, 'azimuth');

// ───────── BIPOD legs + feet + chain + apex yoke (rig azimuth, static pitch) ─────────
const APEX = [0, 0.55, 0.06];
// feet brought CLOSER (was ±0.36 / z0.50) → tighter, steeper, more planted stance. Spread/forward photo-derived (manual gives no leg dims → needs[]).
const FL = [-0.25, 0.018, 0.40], FR = [0.25, 0.018, 0.40];
const legL = legGeom(APEX, FL), legR = legGeom(APEX, FR);
part('bipod_apex', 'bevelBox', { w: 0.09, h: 0.09, d: 0.11, tone: 'mid' }, APEX, 'steel', `${SD}.bipod_apex_height_mm`, 'azimuth');
part('bipod_leg_l', 'cylinder', { r: 0.016, h: legL.len, axis: 'y', tone: 'mid' }, legL.mid, 'steel', `${SD}.bipod_leg_length_mm`, 'azimuth', legL.rot);
part('bipod_leg_r', 'cylinder', { r: 0.016, h: legR.len, axis: 'y', tone: 'mid' }, legR.mid, 'steel', `${SD}.bipod_leg_length_mm`, 'azimuth', legR.rot);
part('foot_l', 'bevelBox', { w: 0.07, h: 0.03, d: 0.12, tone: 'lo' }, FL, 'steel', SF, 'azimuth');
part('foot_r', 'bevelBox', { w: 0.07, h: 0.03, d: 0.12, tone: 'lo' }, FR, 'steel', SF, 'azimuth');
part('leg_chain', 'cylinder', { r: 0.006, h: 0.50, axis: 'x', tone: 'lo' }, [0, 0.11, 0.30], 'steel', SF, 'azimuth');   // slack chain limiting leg spread (low, between legs)
// elevation gearbox housing sits at the planted leg-apex; the lead-screw rises from it to the swivel (the telescoping connection)
part('elev_gearbox', 'bevelBox', { w: 0.08, h: 0.14, d: 0.09, tone: 'lo' }, [0, 0.33, 0.08], 'gunGrey', SF, 'azimuth');

// ───────── ELEVATION SCREW (rig elevScrew — spins; the visible lead-screw column bridging gearbox→swivel) ─────────
part('elev_screw', 'cylinder', { r: 0.017, h: 0.46, axis: 'y', tone: 'bright' }, [0, 0.53, 0.07], 'steel', `${SD}.elevation_screw_length_mm`, 'elevScrew', [14, 0, 0]);
part('elev_crank_arm', 'bevelBox', { w: 0.10, h: 0.022, d: 0.022, tone: 'mid' }, [-0.085, 0.33, 0.075], 'steel', SF, 'elevScrew');
part('elev_crank_knob', 'cylinder', { r: 0.016, h: 0.05, axis: 'z', tone: 'mid' }, [-0.135, 0.33, 0.075], 'bakelite', SF, 'elevScrew');

// ───────── BARREL assembly (rig elevation — pitches about the ball-socket) ─────────
// stencilled, panel-ringed tube (CanvasTexture — vertex colours can't carry markings)
part('tube_body', 'texturedCylinder', { r: 0.05, h: 1.28, axis: 'z', tone: 'mid', marks: TUBE_MARKS }, pt(0.5), 'paintOD', `${SD}.tube_visible_length_mm`, 'elevation', ROT);
part('tube_bore', 'cylinder', { r: 0.039, h: 0.34, axis: 'z', tone: 'lo' }, pt(0.86), 'paintBlack', SF, 'elevation', ROT);  // dark hollow muzzle bore
part('muzzle_ring1', 'torus', { r: 0.053, tube: 0.012, axis: 'z', tone: 'bright' }, pt(0.95), 'steel', SF, 'elevation', ROT);
part('muzzle_ring2', 'torus', { r: 0.053, tube: 0.012, axis: 'z', tone: 'bright' }, pt(0.88), 'steel', SF, 'elevation', ROT);
part('breech_cap', 'cylinder', { r: 0.058, h: 0.14, axis: 'z', tone: 'lo' }, pt(0.06), 'paintOD', SF, 'elevation', ROT);
part('breech_band', 'torus', { r: 0.06, tube: 0.013, axis: 'z', tone: 'hi' }, pt(0.135), 'steel', SF, 'elevation', ROT);  // breech reinforce band (3D relief)
part('tube_clamp', 'torus', { r: 0.062, tube: 0.018, axis: 'z', tone: 'hi' }, pt(0.42), 'steel', SF, 'elevation', ROT);
part('trunnion', 'bevelBox', { w: 0.12, h: 0.09, d: 0.10, tone: 'mid' }, [0, 0.49, 0.04], 'steel', SF, 'elevation');
part('data_plate', 'bevelBox', { w: 0.006, h: 0.034, d: 0.05, tone: 'bright' }, [0.063, 0.50, 0.06], 'steel', SF, 'elevation');  // riveted maker/data plate on the trunnion cheek
part('shock_l', 'cylinder', { r: 0.018, h: 0.22, axis: 'z', tone: 'hi' }, [-0.05, 0.458, -0.013], 'steel', `${SD}.shock_absorber_cylinder_length_mm`, 'elevation', ROT);
part('shock_r', 'cylinder', { r: 0.018, h: 0.22, axis: 'z', tone: 'hi' }, [0.05, 0.458, -0.013], 'steel', `${SD}.shock_absorber_cylinder_length_mm`, 'elevation', ROT);
// (exposed coil springs + white aiming line removed per owner)
// bipod cross-leveling knob
part('crosslevel_box', 'bevelBox', { w: 0.05, h: 0.045, d: 0.06, tone: 'mid' }, [0.06, 0.50, 0.085], 'steel', SF, 'azimuth');
part('crosslevel_knob', 'cylinder', { r: 0.012, h: 0.04, axis: 'x', tone: 'mid' }, [0.10, 0.50, 0.085], 'bakelite', SF, 'azimuth');
// sight bracket sits UP-LEFT on the trunnion (clear of the traverse handwheel below it)
part('sight_bracket', 'bevelBox', { w: 0.05, h: 0.05, d: 0.10, tone: 'lo' }, [-0.11, 0.55, 0.0], 'steel', SF, 'elevation');
part('sight_body', 'bevelBox', { w: 0.05, h: 0.13, d: 0.06, tone: 'mid' }, [-0.16, 0.62, -0.02], 'bakelite', SF, 'elevation');
part('sight_eyepiece', 'cylinder', { r: 0.015, h: 0.05, axis: 'z', tone: 'bright' }, [-0.16, 0.665, 0.01], 'steel', SF, 'elevation');

// ───────── TRAVERSE SCREW + handwheel (rig traverseScrew — spins) — LEFT side (Soviet layout), below+fwd of the sight ─────────
// handwheel + hub sit ON the screw axis (y=0.475, z=0.085), at the screw's outboard end — was offset in y/z (floated off the shaft)
part('trav_screw', 'cylinder', { r: 0.009, h: 0.15, axis: 'x', tone: 'bright' }, [-0.06, 0.475, 0.085], 'steel', SF, 'traverseScrew');
part('trav_handwheel', 'torus', { r: 0.042, tube: 0.010, axis: 'x', tone: 'mid' }, [-0.145, 0.475, 0.085], 'bakelite', `${SD}.traverse_handwheel_diameter_mm`, 'traverseScrew');
part('trav_hub', 'cylinder', { r: 0.012, h: 0.03, axis: 'x', tone: 'mid' }, [-0.145, 0.475, 0.085], 'steel', SF, 'traverseScrew');

const rig = [
  { name: 'azimuth', pivot: P, axis: 'y', pose: 0, type: 'spin', range: [0, 6.2832] },
  { name: 'elevation', pivot: P, axis: 'x', pose: 0, parent: 'azimuth', type: 'hinge', range: [-0.58, 0.13] },
  { name: 'elevScrew', pivot: [0, 0.44, 0.07], axis: 'y', pose: 0, parent: 'azimuth', type: 'spin', range: [0, 6.2832] },
  { name: 'traverseScrew', pivot: [-0.10, 0.475, 0.085], axis: 'x', pose: 0, parent: 'elevation', type: 'spin', range: [0, 6.2832] },
  { name: 'muzzle', pivot: pt(1.0), axis: 'x', pose: 0, parent: 'elevation', type: 'marker' },
];

const spec = {
  id: 'mortar-82pm37',
  name: '82-ПМ-37 (БМ-37) 82 mm Battalion Mortar',
  category: 'ordnance',
  target: 'voxel',
  anchor: 'floor',
  footprint: { w: 0.62, h: 1.2, d: 1.15 },
  rig,
  parts,
  needs: [
    'Authoring dims are PHOTO-DERIVED vs the sourced 1220 mm tube (dossier.derived_dimensions) — refine vs ref1/ref2 in the viewer.',
    'bipod LEG GEOMETRY (spread/forward/length) is photo-derived — NSD-40 + ru.wiki give NO leg dimensions (the "900/344 mm" auto-summary figure was unverifiable → discarded). Feet brought closer for a tighter planted stance.',
    'ELEVATION COUPLING is a RUNTIME animation, not a static rig prop: in reality the вертлюг (bipod apex) RISES on the lead-screw as the tube pitches +45→+85° about the baseplate ball-joint, so the planted legs stay connected. A bare hinge rig separates the (planted) legs from the (rising) mount at high elevation — the firing mechanic must drive the apex-rise/screw-telescope coupled to elevation. Rest pose (≈52°) is correct.',
    'baseplate is modelled as a flat dished puck + raised rim + radial ribs (the membrane dish depth is approximated, not a true concave shell).',
    'control-cluster sides: sight + fine-traverse handwheel modelled LEFT (owner choice). Sourced obr.1937 pattern puts the COARSE leveling screw on the RIGHT leg (НСД-40) — fine-traverse handwheel side itself is not textually sourced.',
    'tube stencil LAYOUT is representative — designation (82-ПМ-37) + caliber (82мм) are sourced; exact stamp positions/serials/lot marks are unsourced, no invented serial.',
  ],
};

writeFileSync(new URL('./spec.json', import.meta.url), JSON.stringify(spec, null, 2));
console.log(`spec.json written — ${parts.length} parts, ${rig.length} rigs. muzzle=${JSON.stringify(pt(1.0))} breech=${JSON.stringify(pt(0))}`);
