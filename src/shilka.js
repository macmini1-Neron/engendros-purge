// shilka.js -- runtime adapter for the ZSU-23-4 Shilka station.
//
// The actual fire-control rules live in shilka-mechanics.js. This module owns Three.js
// meshes, camera framing, DOM overlay updates, and game integration.

import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import {
  SHILKA_PHASES,
  SHILKA_ROLES,
  SHILKA_SEARCH_MODES,
  SHILKA_TUNING,
  computeShilkaKinematics,
  createShilkaState,
  fireShilkaBurst,
  grantRoundDir,
  makeShilkaBurstGrant,
  makeShilkaDrone,
  radarReady,
  setShilkaRangeGate,
  setShilkaRole,
  setShilkaSwitch,
  shilkaFireControl,
  shilkaPhase,
  shilkaSolutionQuality,
  shilkaSolutionReady,
  simulateShilkaProjectile,
  startShilkaSearch,
  stepShilka,
  stepShilkaDrone,
  tryShilkaAngleLock,
  updateShilkaTrack,
  aimToTurret,
  makeOpticalBurstGrant,
  sweepShilkaBurst,
} from './shilka-mechanics.js';
import { buildShilkaRig } from './shilka-rig.js';
import { createDriveState, stepDrive, SHILKA_DRIVE_TUNING, SHILKA_GATE_SLOTS, moveShiftLever } from './shilka-drive.js';
import { SHILKA_SEATS, SHILKA_SEAT_COUNT, SHILKA_DRIVER_SEAT, SHILKA_DISMOUNT_SPEED_EPS, isDriverSeat } from './shilka-crew.js';
import { formatUglomer } from './bearing.js';
import { WEAPON_LAYER } from './engine.js';
import { clamp, damp, TAU, snoise } from './util.js';

// radar "Gun Dish" (RPK-2 «Тобол») continuous scan rate, rad/s — the signature ЗСУ-23-4 animation.
// Per-instance dev override: s._radarSpin = 0 stops it, larger spins faster.
const SHILKA_RADAR_SPIN = 2.0;
// Shift-lever sensitivity: mouse delta (px) → gate units. The gate spans 2 units (-1..1) per axis, so
// at ~0.014 a ~70 px flick crosses one rail and a ~36 px pull seats/unseats a gear — deliberate, "felt".
const SHILKA_GATE_MOUSE = 0.014;
// Damage per 23 mm round that connects (optical direct fire). A burst lands several rounds → balance is
// held by ammo (2000) + heat/overheat + the burst cap, not by a tiny per-round number. Tuned in balance.
const SHILKA_ROUND_DMG = 6;
// Burst cadence: while the trigger is held, fire one burst of this length every this-many seconds, so
// ammo/heat integrate to roundsPerSecond regardless of frame rate (input.buttons[0] is a HELD state).
const SHILKA_BURST_SECONDS = 0.16;
// Interact-prompt label per seat role, so the player sees WHICH seat they'd board before pressing E.
const SHILKA_SEAT_PROMPT = {
  driver: 'ŘIDIČ (řízení)',
  commander: 'VELITEL',
  gunner: 'STŘELEC (kanón)',
  range: 'OPERÁTOR DÁLKY',
};
// Driver day periscope БМО-190Б: a FIXED wide-angle unity optic (no traverse). Real field of observation
// ≥69° horizontal × ≥20° vertical (9° up + 9° down). We set the camera's VERTICAL fov to 20°; at the slit's
// ~4.36 aspect that yields ~75° horizontal — both meet the "≥" spec. Optical axis sits 4° below level so the
// 20° field spans roughly +6°..−14° (horizon + ground close ahead). Light transmission ≥0.43 → image dimmed.
const SHILKA_PERI_VFOV = 20;       // degrees, БМО-190Б vertical field of observation
const SHILKA_PERI_TILT = -0.07;    // rad (~-4°), optical axis below level
const SHILKA_PERI_DIM = new THREE.Color(0.86, 0.90, 0.88); // coated-optic dimming/tint (≥0.43 transmission)
// Turret-crew eye points in hull-local metres (x right, y up, z forward): commander/gunner/range sit
// side by side atop the turret. Placeholder ride-along viewpoints for this slice — refined with the 3D
// cockpit later. Keyed by seat index (1=commander, 2=gunner, 3=range).
const SHILKA_TURRET_EYES = {
  1: { x: -0.55, y: 2.25, z: -0.15 },
  2: { x: 0.0, y: 2.25, z: -0.15 },
  3: { x: 0.55, y: 2.25, z: -0.15 },
};

// Shadow-cast cutoff (world metres): a model mesh whose largest dimension is under this spans fewer
// than ~4 sun-shadow texels (2048² over 240 m ≈ 0.12 m/texel), so its shadow is invisible — skipping
// it as a caster halves the shadow-pass draw count with no visible change. Silhouette parts (hull,
// turret, barrels, wheels, antennas) clear the bar and still cast.
const SHILKA_SHADOW_MIN_M = 0.5;

const SWITCH_LABELS = [
  ['power54v', '54V'],
  ['gyroUnlocked', 'ГАГ'],
  ['hydroDrive', 'ГИДРО'],
  ['radarFilament', 'НАКАЛ'],
  ['radarAnode', 'АНОД'],
  ['radarHighVoltage', 'ВН'],
  ['radarOnAir', 'РАДАР'],
];

const SHILKA_ASSET_URL = './assets/vehicles/zsu-23-4-named.glb?v=20260621-1';
const SHILKA_ASSET_TARGET_LENGTH_M = 6.7;
// Body-dynamics tuning (cosmetic, CLIENT-LOCAL): the hull is faked as a sprung mass = two angular
// spring-dampers (pitch about X, roll about Z) + layered noise, driven by impulses. Heavy + under-damped
// for the lurch. See docs/superpowers/specs/2026-06-21-shilka-drivetrain-behavior-research.md §4.
const SHILKA_BODY = Object.freeze({
  pitchW: 7.0, pitchZeta: 0.28, pitchGain: 0.018, // pitch spring; gain = rad per m/s² of long. accel
  rollW: 8.2, rollZeta: 0.40, rollGain: 0.012,    // roll spring; gain = rad per m/s² of lateral accel
  firePitchBias: 0.012,                           // ~0.7° nose-up rock-back held while firing
  fireAmp: 0.004, fireFreq: 25,                   // ~25 Hz fire buzz (never simulate 60 rounds/s)
  idleAmp: 0.0020, idleFreq: 9,                   // always-on diesel shudder
  traumaDecay: 1.2, traumaMaxAngle: 0.16,         // camera trauma shake (consumed in Phase 6)
});
// Driving "ride shake" (research 2026-06-21): a CAMERA-LOCAL jitter that grows with speed so the crew
// feels the terrain — heaviest at the driver (low, forward, over the tracks). Speed-driven noise in two
// bands (lope ~4.5 Hz + track buzz ~13 Hz), mostly pitch + a vertical bob; roll kept tiny (nausea). It's
// summed AFTER the hull-spring transform (camera-local), so it doesn't double-count the body's slow
// pitch/roll. Per-seat + zoom scaling at apply. Real ZSU-23-4 "shoots best stopped" → steadies near idle
// when halted. (A settings "Ride Shake 0–100%" slider would just multiply these amplitudes.)
const SHILKA_RIDE = Object.freeze({
  vFull: 11,                                          // m/s ≈ full cross-country (top of the speed scale)
  pitchAmp: 0.021, yawAmp: 0.0105, rollAmp: 0.0061,  // rad ≈ 1.2°/0.6°/0.35° peak (driver, full speed)
  bobAmp: 0.06, latAmp: 0.025,                        // metres of head bob / sway (driver, full speed)
  fLope: 4.5, fBuzz: 13,                              // Hz: loping-over-ground band + track/engine buzz
  idleFloor: 0.10,                                    // residual fraction when crawling (with idle shudder)
});
const TMP_ORIGIN = new THREE.Vector3();
const TMP_END = new THREE.Vector3();
const TMP_FWD = new THREE.Vector3();
let _gltfLoader = null;

function loadGltf(url) {
  _gltfLoader = _gltfLoader || new GLTFLoader();
  return new Promise((resolve, reject) => _gltfLoader.load(url, resolve, undefined, reject));
}

function prepVehicleMeshTree(root) {
  root.updateMatrixWorld(true); // world matrices fresh so per-mesh AABB sizes are in real metres
  const box = new THREE.Box3(), size = new THREE.Vector3();
  // The GLB ships MeshStandardMaterial that is fully DIFFUSE (metalness 0, roughness ~1) with only a
  // base-colour map — no normal/rough/metal maps. The PBR BRDF is costlier PER FRAGMENT than the game's
  // own MeshLambertMaterial for ZERO visual gain here (at metalness0/roughness1 PBR collapses to
  // diffuse — look is identical, verified). Convert to Lambert to match the rest of the game and shave
  // fragment cost; share one converted material per source so 93 meshes reuse the ~12 sources.
  // DoubleSide (NOT FrontSide): the close-up "stutter" turned out to be a swiftshader (CPU-rasterizer)
  // artifact — on a real GPU there is no spike — so the FrontSide back-face-cull saved nothing real and
  // instead opened see-through holes where this ripped GLB has inward-facing / single-sided shells.
  // Render both sides so the model is solid from every angle. (Mantlet z-fight is fixed geometrically in
  // _fixMantletPlates, independent of side, so DoubleSide does not reintroduce it.)
  const lambertCache = new Map();
  const toLambert = (mat) => {
    if (!mat) return mat;
    let lm = lambertCache.get(mat);
    if (!lm) {
      lm = new THREE.MeshLambertMaterial({ map: mat.map || null, color: mat.color ? mat.color.clone() : new THREE.Color(0xffffff), side: THREE.DoubleSide });
      lambertCache.set(mat, lm);
    }
    return lm;
  };
  root.traverse((o) => {
    o.frustumCulled = false;
    if (!o.isMesh) return;
    // The vehicle is lit directly by the sun; it must NOT receive the coarse ~0.12 m self-shadow map.
    // At low sun the flat deck grazed the shadow comparison and dithered into shadow-acne ("biting").
    // It still CASTS onto the ground (terrain receiveShadow stays on), so the vehicle keeps its shadow.
    o.receiveShadow = false;
    // Only silhouette-defining parts cast (see SHILKA_SHADOW_MIN_M): drops sub-texel detail meshes
    // from the shadow pass with no visible change.
    box.setFromObject(o); box.getSize(size);
    o.castShadow = Math.max(size.x, size.y, size.z) >= SHILKA_SHADOW_MIN_M;
    o.material = Array.isArray(o.material) ? o.material.map(toLambert) : toLambert(o.material);
  });
}


export class ShilkaStation {
  constructor(game, pos, yaw = 0, opts = {}) {
    this.game = game;
    this.id = opts.id || 'shilka-1';
    this.base = pos.clone();
    this.baseYaw = yaw;
    this.state = createShilkaState({ rangeGateM: 1200 });
    this.seats = new Array(SHILKA_SEAT_COUNT).fill(null); // occupant peerId per seat (authoritative in co-op)
    this.localSeat = -1;                                  // seat the LOCAL player holds (-1 = not aboard)
    this.drive = createDriveState({ x: this.base.x, z: this.base.z, heading: this.baseYaw });
    this.rig = null; // set when the GLB finishes loading (see _loadVehicleAsset)
    this.aimAzMils = 0;
    this.aimElDeg = 8;
    this.drones = [
      makeShilkaDrone('meteor-1', 0x53484c31, this.base),
      makeShilkaDrone('meteor-2', 0x53484c32, this.base),
      makeShilkaDrone('meteor-3', 0x53484c33, this.base),
    ];
    this.projectiles = [];
    this._targetT = 0;
    this._uiWired = false;
    this._lastPanelText = '';
    this.cursorMode = true;
    // body dynamics (cosmetic, client-local): hull pitch/roll springs + lurch + noise + camera trauma.
    // Summed onto the synced terrain pitch/roll at apply time; NEVER enters the drive model or broadcast.
    this._dyn = { pitch: 0, pitchVel: 0, roll: 0, rollVel: 0, trauma: 0, prevSpeed: 0, fireWas: false, fireHold: 0, fireAmp: 0, t: 0,
      ridePitch: 0, rideYaw: 0, rideRoll: 0, rideBob: 0, rideLat: 0 }; // speed-driven ride shake (camera-local)
    this._buildRuntimeMeshes();
  }

  _groundY(x, z) {
    const t = this.game.world && this.game.world.terrain;
    return t && t.terrainHeightAt ? t.terrainHeightAt(x, z) : 0;
  }

  _origin() {
    return { x: this.base.x, y: this.base.y + 2.2, z: this.base.z };
  }

  // Live game enemies as radar targets. shilkaRadarSignal gates on altitude, so feeding all enemies is
  // safe — only AIRBORNE ones produce a trackable signal (ground hordes stay for the optical mode). The
  // `_enemy` backref lets a radar burst claim host-authoritative damage against the real Enemy.
  _radarTargets() {
    const list = (this.game.enemies && this.game.enemies.active) || [];
    const out = [];
    for (const e of list) {
      if (!e.alive) continue;
      out.push({ id: e.id, alive: true, pos: e.pos, vel: e.vel, rcs: (e.def && e.def.rcs) || 1, jamming: 0, _enemy: e });
    }
    return out;
  }

  _buildRuntimeMeshes() {
    const scene = this.game.engine.scene;
    const y = this._groundY(this.base.x, this.base.z);
    this.base.y = y;

    this.vehicleRoot = new THREE.Group();
    this.vehicleRoot.name = `${this.id} vehicle root`;
    this.vehicleRoot.position.set(this.base.x, y, this.base.z);
    this.vehicleRoot.rotation.y = this.baseYaw;
    scene.add(this.vehicleRoot);
    this.vehicleModel = null;
    this._loadVehicleAsset();

    // No ground ring — the "Press E to drive" prompt is the interaction cue. (`this.marker` stays null;
    // every user is guarded by `if (this.marker)`.)
    this.marker = null;

    const droneGeo = new THREE.BoxGeometry(2.7, 0.5, 1.2);
    const wingGeo = new THREE.BoxGeometry(6.2, 0.16, 0.72);
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8b066 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x394044 });
    for (const d of this.drones) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(droneGeo, mat);
      const wing = new THREE.Mesh(wingGeo, dark);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.18), dark);
      tail.position.set(0, 0.45, 0.7);
      g.add(body, wing, tail);
      g.visible = d.alive;
      scene.add(g);
      d.mesh = g;
    }
    this._buildDriverPeriscopes();
    this._buildDriverHood();
  }

  // First-pass driver periscopes: 3 vision blocks (metal frame + tinted glass) on the driver's
  // raised hatch, in vehicleRoot-local space (x=right, y=up, z=forward — the same frame as the
  // driver EYE). The camera sits just behind the centre block so the buttoned-up view is framed.
  _buildDriverPeriscopes() {
    const grp = new THREE.Group();
    grp.name = `${this.id} driver periscopes`;
    const metal = new THREE.MeshStandardMaterial({ color: 0x232a20, metalness: 0.45, roughness: 0.65 }); // dark frame = black border
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb9c4, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x74875f, metalness: 0, roughness: 0.8 }); // placeholder until GLB loads — _matchHousingToHull() then swaps in the hull's own baked material for an exact colour match
    const W = 0.30, H = 0.18, D = 0.13, T = 0.035;
    // ONE integrated optic: dark frame (black border) + glass, with a beveled green housing box behind it
    const b = new THREE.Group();
    const bar = (sx, sy, sz, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), metal); m.position.set(px, py, pz); b.add(m); };
    bar(W, T, D, 0, H / 2, 0); bar(W, T, D, 0, -H / 2, 0); bar(T, H, D, -W / 2, 0, 0); bar(T, H, D, W / 2, 0, 0);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W - T, H - T), glassMat);
    glass.position.z = D / 2;
    b.add(glass);
    // beveled (top/bottom-tapered) green housing directly behind the optic — the periscope body
    const L = 0.30, bevel = 0.05;
    const prof = new THREE.Shape();
    prof.moveTo(0, -H / 2); prof.lineTo(0, H / 2); prof.lineTo(L, H / 2 - bevel); prof.lineTo(L, -H / 2 + bevel); prof.closePath();
    const housing = new THREE.Mesh(new THREE.ExtrudeGeometry(prof, { depth: W, bevelEnabled: false }), greenMat);
    housing.rotation.y = Math.PI / 2; housing.position.set(-W / 2, 0, -D / 2);
    b.add(housing);
    b.scale.setScalar(0.75); // optic 25% smaller (owner)
    grp.add(b);
    this._optic = b;          // whole integrated optic (frame+glass+housing)
    this._housing = housing;  // tweak the beveled box live: s._housing.scale/position/rotation, .material.color.set(0x..) // tweak live: s._visor.position.set(x,y,z) · .rotation.x · .scale.setScalar(n) · .material.color.set(0x..)
    grp.position.set(0.565, 0.74, 2.15); // driver's periscope optic on the MODEL — pulled back from the glacis lip (was z2.4) so the whole footprint rests on the flat deck instead of overhanging the sloped front. Separate from the camera EYE.
    this.vehicleRoot.add(grp);
    this.periscopes = grp;
  }

  // Real 3D driver periscope hood: a near-black enclosure around the driver's eye with a horizontal
  // slit facing forward. Rendered on WEAPON_LAYER so it draws OVER the world (pass 2, depth pre-cleared
  // → never clips the near plane, always on top); the slit is a hole the world shows through.
  // _frameDriverCamera repositions it each frame at the camera eye with the HULL's orientation MINUS
  // mouselook, so it stays bolted to the model: the camera turns INSIDE the static hood → the slit
  // slides aside and the black walls swing in, like a real periscope.
  // NOTE: the slit faces hood-local +Z — Object3D.lookAt() on a plain Group points +Z at the target
  // (only Cameras/Lights point −Z), so the forward (view) direction here is +Z.
  _buildDriverHood() {
    const grp = new THREE.Group();
    grp.name = `${this.id} driver hood`;
    const mat = new THREE.MeshStandardMaterial({ color: 0x080a08, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    // hood-local: eye at origin, view (slit) = +Z. Enclosure half-extents + centred forward slit window.
    const halfW = 0.42, halfH = 0.30, front = 0.26, back = 0.20, t = 0.02; // walls ≥0.20 m off the eye (near=0.05 safe)
    const slitW = 0.24, slitH = 0.055; // half-extents of the forward slit opening
    const cz = (front - back) / 2;     // enclosure centre in Z (walls span −back..+front)
    const panel = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); };
    panel(t, halfH * 2, front + back, -halfW, 0, cz);  // left wall
    panel(t, halfH * 2, front + back,  halfW, 0, cz);  // right wall
    panel(halfW * 2, t, front + back, 0,  halfH, cz);  // top wall
    panel(halfW * 2, t, front + back, 0, -halfH, cz);  // bottom wall
    panel(halfW * 2, halfH * 2, t, 0, 0, -back);       // back wall (behind the eye)
    // front wall (at +Z) = frame around the centred slit (top/bottom/left/right of the opening)
    panel(halfW * 2, halfH - slitH, t, 0,  (slitH + halfH) / 2, front); // front-top
    panel(halfW * 2, halfH - slitH, t, 0, -(slitH + halfH) / 2, front); // front-bottom
    panel(halfW - slitW, slitH * 2, t, -(slitW + halfW) / 2, 0, front); // front-left
    panel(halfW - slitW, slitH * 2, t,  (slitW + halfW) / 2, 0, front); // front-right
    grp.traverse((o) => { if (o.isMesh) { o.layers.set(WEAPON_LAYER); o.frustumCulled = false; o.renderOrder = 1000; } });
    grp.visible = false;
    this.game.engine.scene.add(grp);
    this._hood = grp; // dev: tune live — s._hood.scale.setScalar(n) / s._hood.children[i].scale; rebuild for slit size
  }

  // RTT optical periscope: built lazily on first mount. A periscope camera at the head (rides rig.body
  // via this.periscopes, so it inherits hull tilt/heading/position) renders the world+tank into an
  // off-screen target each driving frame; the result is shown on a screen quad in the hood slit. Because
  // the head sits in open air above the glacis looking outward, the tank's exterior renders solidly —
  // no near-plane hull clipping, no DoubleSide see-through. Fixed-forward (owner): no mouselook traverse.
  _ensurePeriscopeRTT() {
    if (this._periRT || !this.periscopes || !this._hood) return;
    const W = 2560, H = 588; // ≈4.36:1 (matches the slit); hi-res so the upscaled slit image stays sharp
    const rt = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false,
    });
    rt.texture.colorSpace = THREE.SRGBColorSpace; // RT holds the fully-developed (ACES+sRGB) image
    rt.texture.generateMipmaps = false;
    this._periRT = rt;
    // periscope camera: head above the glacis (optic looks −Z; parent +Z = hull-forward). FIXED forward at
    // the БМО-190Б field (vfov 20° → ~75° h at this aspect); no mouselook traverse — a real driver's day
    // periscope is a fixed wide-angle prism, which also keeps the optic from ever pointing into the guns.
    const cam = new THREE.PerspectiveCamera(SHILKA_PERI_VFOV, W / H, 0.05, 1200); // dev: s._periCam.fov + updateProjectionMatrix
    cam.layers.set(0);                 // world + tank ONLY — never WEAPON_LAYER (no hood/quad → no feedback)
    cam.position.set(0, 0.12, 0.22);   // periscopes-local: up+forward of the housing, clear of the glass
    cam.rotation.set(SHILKA_PERI_TILT, Math.PI, 0);
    // dev: tune framing live — s._periCam.position.set(x,y,z) / s._periCam.rotation.x / .fov (+updateProjectionMatrix)
    this.periscopes.add(cam);
    this._periCam = cam;
    // screen quad: shows the RT in the hood slit, unlit, no second tone-map (repo convention).
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.11), // == slit (slitW 0.24 × slitH 0.055 half-extents)
      // color multiplies the RT → a gentle dim/cool tint for the optic's ≥0.43 light transmission + coating
      new THREE.MeshBasicMaterial({ map: rt.texture, color: SHILKA_PERI_DIM.clone(), toneMapped: false, fog: false }),
    );
    screen.position.set(0, 0, 0.261);  // hood-local: on the +Z front face (front 0.26), slit-centred
    screen.rotation.y = Math.PI;       // face the eye (−Z)
    screen.layers.set(WEAPON_LAYER);
    screen.frustumCulled = false;
    screen.renderOrder = 1001;         // draws just after the 1000 hood frame
    this._hood.add(screen);            // rides the hood; shown/hidden with hood.visible
    this._periScreen = screen;
    // glass overlay: a transparent optic-glass texture (vignette + reflection streak + scratches + dust)
    // sat just in front of the screen → the image reads as seen THROUGH periscope glass.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.11),
      new THREE.MeshBasicMaterial({ map: this._buildGlassTexture(), transparent: true, depthWrite: false, toneMapped: false, fog: false }),
    );
    glass.position.set(0, 0, 0.259);   // in front of the screen (eye side), behind the frame plane (0.26)
    glass.rotation.y = Math.PI;
    glass.layers.set(WEAPON_LAYER);
    glass.frustumCulled = false;
    glass.renderOrder = 1002;          // over the screen (1001)
    this._hood.add(glass);
    this._periGlass = glass;
  }

  // Procedural periscope-glass overlay (CanvasTexture, mostly transparent): soft vignette toward the
  // slit edges, a faint diagonal reflection streak, a few scratches and dust specks. Kept subtle so the
  // optical image stays readable. Deterministic (no Math.random) so it's stable across reloads.
  _buildGlassTexture() {
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 236;
    const x = cv.getContext('2d');
    const vg = x.createRadialGradient(512, 118, 230, 512, 118, 640); // edge vignette (optic tube)
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.78, 'rgba(0,0,0,0.10)'); vg.addColorStop(1, 'rgba(4,9,7,0.46)');
    x.fillStyle = vg; x.fillRect(0, 0, 1024, 236);
    x.fillStyle = 'rgba(120,150,148,0.045)'; x.fillRect(0, 0, 1024, 236); // faint cool tint
    const rf = x.createLinearGradient(0, 0, 1024, 236);                   // diagonal reflection streak
    rf.addColorStop(0, 'rgba(255,255,255,0)'); rf.addColorStop(0.40, 'rgba(255,255,255,0.05)');
    rf.addColorStop(0.50, 'rgba(255,255,255,0.10)'); rf.addColorStop(0.60, 'rgba(255,255,255,0.04)');
    rf.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rf; x.fillRect(0, 0, 1024, 236);
    x.strokeStyle = 'rgba(225,232,230,0.10)'; x.lineWidth = 1;           // scratches
    for (const [a, b, c, d] of [[60, 40, 300, 70], [430, 200, 720, 150], [150, 205, 270, 175], [800, 28, 940, 120], [505, 55, 560, 225]]) {
      x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke();
    }
    x.fillStyle = 'rgba(205,212,208,0.13)';                              // dust specks (deterministic)
    for (let i = 0; i < 44; i++) { const px = (i * 97 + 13) % 1024, py = (i * 53 + 31) % 236, r = ((i * 7) % 3) * 0.6 + 0.4; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Render the world+tank from the periscope head into _periRT. Called each driving frame from
  // _driveControlUpdate (before engine.render), so the slit quad shows this frame's clean optical image.
  _renderPeriscope() {
    if (!this._periCam || !this._periRT) return;
    const r = this.game.engine.renderer, sc = this.game.engine.scene;
    this._periCam.layers.set(0);
    const prev = r.getRenderTarget();
    r.setRenderTarget(this._periRT);
    r.clear();                     // engine autoClear is off → clear the RT's colour+depth ourselves
    r.render(sc, this._periCam);   // scene.updateMatrixWorld() inside picks up this frame's hull pose + head
    r.setRenderTarget(prev);
  }

  async _loadVehicleAsset() {
    try {
      const gltf = await loadGltf(SHILKA_ASSET_URL);
      if (!this.vehicleRoot) return;
      const rig = buildShilkaRig(gltf.scene, THREE);
      // scale the assembled rig to the target length
      rig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root);
      const size = new THREE.Vector3(); box.getSize(size);
      const scale = SHILKA_ASSET_TARGET_LENGTH_M / Math.max(0.001, size.x, size.z);
      rig.root.scale.setScalar(scale);
      // ground it: recenter X/Z and drop the model so its lowest point sits (wheelRadius+rideHeight)
      // below the rig.root origin. stepDrive then parks vehicleRoot.y at meanGround+wheelRadius+
      // rideHeight, so the wheels/tracks rest on the terrain. Measured BEFORE the vehicleRoot.add
      // so the bbox is in rig.root's own (parent-local) frame — the frame rig.root.position lives in.
      rig.root.updateMatrixWorld(true);
      const fb = new THREE.Box3().setFromObject(rig.root);
      const fc = fb.getCenter(new THREE.Vector3());
      const groundDrop = SHILKA_DRIVE_TUNING.wheelRadius + SHILKA_DRIVE_TUNING.rideHeight;
      rig.root.position.set(-fc.x, -fb.min.y - groundDrop, -fc.z);
      prepVehicleMeshTree(rig.root);
      this.vehicleRoot.add(rig.root);
      this.vehicleModel = rig.root;
      this.rig = rig;
      this._rigScale = scale;
      this._fixMantletPlates(); // re-skin the white plate + de-z-fight the stacked mantlet armour
      // ground the PARKED vehicle too: _applyRig only lifts it to drive.y while mounted, so without
      // this the un-mounted Shilka sits groundDrop (~0.87 m) below the terrain.
      this.vehicleRoot.position.y = this.base.y + groundDrop;
      this.drive.y = this.vehicleRoot.position.y;
      // periscope housing wears the hull's own GLB material now that it's loaded → exact colour match.
      this._matchHousingToHull(rig.root);
      // Weld the periscope optic (an ADDED part, built under vehicleRoot which only gets heading) onto
      // the rig's tilting body, so it inherits the hull's terrain pitch/roll AND heading AND position
      // rigidly — no more "levitating" when the hull tilts on slopes. .attach() keeps its tuned world
      // pose. This replaces the old per-frame rotation hack (which only ran while driving, when the optic
      // is hidden, so the visible parked/3rd-person optic never tilted).
      if (this.periscopes && rig.body) rig.body.attach(this.periscopes);
    } catch (e) {
      this._assetFailed = true;
      console.warn('[shilka] Failed to load/rig GLB vehicle; station marker remains.', e);
    }
  }

  // Make the driver-periscope housing literally wear the GLB deck panel it rests on: raycast straight
  // down from the optic onto the hull, take the HIT mesh's material, and collapse the housing's
  // procedural UVs onto the exact texel under the periscope. The panel it sits on is by definition the
  // right colour, so the housing matches the surrounding deck under the same lighting — no hex to dial.
  // The GLB's mantlet stacks several armour plates at the SAME depth (Object_84/86/154/155/157), which
  // z-fought into a dithered checkerboard up close (FrontSide can't fix coincident same-facing plates).
  // One plate (Object_157) is the rip's untextured "none" duplicate: no real UVs, so it renders flat
  // near-white AND can't be re-skinned (a borrowed texture samples through its broken UVs as coloured
  // streak garbage). A textured twin (Object_154) occupies the same area, so we HIDE the untextured
  // duplicate(s) — no white, no streaks, no gap — then spread the remaining textured plates a few mm
  // apart along each one's outward radial so no two share a depth. Names are from the fixed asset; re-
  // derive with a ray-sweep (see /tmp probes) if the GLB is re-exported. Verified: hiding kills the
  // streaks (reproduced) and the remaining sweep shows 0 truly-coincident ray hits (gap < 0.3 mm).
  _fixMantletPlates() {
    const rig = this.rig;
    if (!rig || !rig.turret) return;
    const NAMES = ['Object_84', 'Object_86', 'Object_154', 'Object_155', 'Object_157'];
    rig.root.updateMatrixWorld(true);
    const cluster = [];
    rig.root.traverse((m) => { if (m.isMesh && NAMES.includes(m.name)) cluster.push(m); });
    if (!cluster.length) return;
    const mat0 = (m) => (Array.isArray(m.material) ? m.material[0] : m.material);
    // (1) hide untextured duplicate plate(s) — the textured twin covers the same area
    const visible = cluster.filter((m) => {
      if (mat0(m) && mat0(m).map) return true;
      m.visible = false;
      return false;
    });
    // (2) de-z-fight the remaining textured plates: spread them apart in depth along their outward radial
    const center = new THREE.Box3().setFromObject(rig.turret).getCenter(new THREE.Vector3());
    const bb = new THREE.Box3(), mc = new THREE.Vector3(), wp = new THREE.Vector3(), dir = new THREE.Vector3();
    visible.forEach((m) => {
      bb.setFromObject(m).getCenter(mc);
      dir.copy(mc).sub(center).normalize();
      const i = NAMES.indexOf(m.name); // deterministic per-name offset (verified to fully de-z-fight)
      const off = (i - (NAMES.length - 1) / 2) * 0.0028; // centred spread, ≥2.8 mm between any two
      m.getWorldPosition(wp).addScaledVector(dir, off);
      m.parent.worldToLocal(wp);
      m.position.copy(wp);
    });
    rig.root.updateMatrixWorld(true);
  }

  _matchHousingToHull(root) {
    if (!this._housing || !this._optic) return;
    try {
      this.vehicleRoot.updateMatrixWorld(true);
      const rigMeshes = [];
      root.traverse((o) => { if (o.isMesh && o.material && o.geometry && o.geometry.attributes.uv) rigMeshes.push(o); });
      if (!rigMeshes.length) return;
      const origin = this._optic.getWorldPosition(new THREE.Vector3()); origin.y += 1.2;
      const rc = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 6);
      const hit = rc.intersectObjects(rigMeshes, false)[0];
      if (!hit || !hit.uv) return; // no deck under the optic, or panel has no UVs — keep the flat green
      const su = hit.uv.x, sv = hit.uv.y;
      const huv = this._housing.geometry.attributes.uv;
      if (huv) { for (let i = 0; i < huv.count; i++) huv.setXY(i, su, sv); huv.needsUpdate = true; }
      this._housing.material = hit.object.material;
    } catch (e) {
      console.warn('[shilka] hull-material match failed; keeping flat green housing.', e);
    }
  }

  near(p) {
    return Math.hypot(p.x - this.base.x, p.z - this.base.z) < 3.4 && Math.abs(p.y - this.base.y) < 3.2;
  }

  updateNearby(p) {
    return this.near(p);
  }

  // Interact-prompt text showing which seat the player at `p` would board (so they pick the right hatch).
  interactLabel(p) {
    const seat = this._pickSeat(p);
    if (seat < 0) return 'ЗСУ-23-4 «Shilka» — посада plná (4/4)';
    const lab = SHILKA_SEAT_PROMPT[SHILKA_SEATS[seat].role] || SHILKA_SEATS[seat].ru;
    return `Press <b>E</b> — Shilka: <b>${lab}</b>`;
  }

  _localPeerId() { return (this.game.mp && this.game.mp.myId) || 'local'; }

  // Pick the nearest FREE seat by where the player stands: at the front hatch → driver first; at the
  // turret → turret seats first (gunner first, so a solo player reaches the radar). Falls through to the
  // next free seat so pressing E always boards when there's room (occupancy is host-authoritative). -1 = full.
  _pickSeat(playerPos) {
    const d = this.drive;
    const fwd = (playerPos.x - d.x) * Math.sin(d.heading) + (playerPos.z - d.z) * Math.cos(d.heading);
    const order = fwd > 0.5 ? [0, 2, 1, 3] : [2, 1, 3, 0];
    for (const s of order) if (this.seats[s] == null) return s;
    return -1;
  }

  mountNearest(playerPos) {
    const seat = this._pickSeat(playerPos);
    if (seat < 0) { if (this.game.hud) this.game.hud.bigMessage('SHILKA — ПОЛНЫЙ ЭКИПАЖ'); return; } // every seat taken
    this.mount(seat);
  }

  // Board a seat. Co-op: ask the host (it assigns occupancy authoritatively and replies with
  // shilkastate, which actually seats us via _netMount). Solo: seat immediately.
  mount(seat = SHILKA_DRIVER_SEAT) {
    if (!this.rig) {
      // GLB not ready (or failed): don't enter a phantom drive with an invisible, un-re-enterable vehicle.
      if (this.game.hud) this.game.hud.bigMessage(this._assetFailed ? 'SHILKA — model unavailable' : 'SHILKA — loading…');
      return;
    }
    const mp = this.game.mp;
    if (mp && mp.active) {
      if (mp.isHost) mp._hostShilkaClaim('mount', mp.myId, this.id, seat, null); // host is the authority — apply + broadcast
      else mp.net.send('shilkaclaim', { v: this.id, seat, want: 'mount' });       // client: ask host; seat only when shilkastate grants it
      return;
    }
    this.seats[seat] = this._localPeerId();
    this._enterSeat(seat);
  }

  _netMount(seat) { this._enterSeat(seat); } // co-op: the host seated me (occupancy already set from shilkastate)

  // Local seat entry — the camera/visual/control setup, shared by the solo path and the co-op state apply.
  _enterSeat(seat) {
    const pl = this.game.player;
    pl.shilka = this;
    this.localSeat = seat;
    // seat the hull origin at its suspension rest height (matches stepDrive's target) so seat cameras read
    // a consistent y from frame one rather than the rig-root spawn height until the suspension converges.
    this.drive.y = this._groundY(this.drive.x, this.drive.z) + SHILKA_DRIVE_TUNING.wheelRadius + SHILKA_DRIVE_TUNING.rideHeight;
    this.game.weapons.group.visible = false;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '0';
    if (!this.game.input.locked) this.game.input.requestLock();
    if (isDriverSeat(seat)) this._enterDriverSeat();
    else this._enterTurretSeat(seat);
  }

  _enterDriverSeat() {
    // resync to where the vehicle physically sits; speed/gear/engine start fresh (heading kept as-is)
    this.drive.x = this.base.x; this.drive.z = this.base.z;
    this.drive.gear = 'N'; this.drive.speed = 0; this.drive.engineOn = true; this.drive.stalled = false;
    this._lever = { ...SHILKA_GATE_SLOTS[this.drive.gear] }; // shift lever rests in the engaged gear's slot
    // driver looks THROUGH a real 3D periscope hood (hull-fixed enclosure + slit, on WEAPON_LAYER): show
    // it and hide the exterior optic so it doesn't double up / clip. The hood is the viewport now — the
    // camera turns inside it (see _frameDriverCamera), the old 2D DOM mask is retired.
    if (this.periscopes) this.periscopes.visible = false;
    this._ensurePeriscopeRTT(); // build the RTT periscope (camera + render target + screen quad) once
    if (this._hood) this._hood.visible = true;
    this._showDriveHud(true);
    this._frameDriverCamera(0.001);
  }

  _enterTurretSeat(seat) {
    this._tYaw = 0; this._tPitch = 0;
    if (this.game.hud) this.game.hud.bigMessage(`SHILKA — ${SHILKA_SEATS[seat].ru}`);
    if (seat === 2) {
      // gunner: default to the radar console (bring up the panel in cursor mode); V switches to the
      // optical direct-fire sight for ground targets.
      this._gunMode = 'radar';
      this._showPanel(true);
      this._setCursorMode(true);
      this._frameCamera(0.001);
    } else {
      this._frameTurretCamera(0.001, seat);
    }
  }

  // Leave your seat. Co-op: ask the host (it frees the seat and replies with shilkastate, which tears
  // down via _netDismount). Solo: leave immediately. The isolated driver can't bail while rolling
  // (death/reset pass force=true).
  dismount(force = false) {
    if (this.game.player.shilka !== this) return;
    const seat = this.localSeat;
    if (!force && isDriverSeat(seat) && Math.abs(this.drive.speed) > SHILKA_DISMOUNT_SPEED_EPS) {
      if (this.game.hud) this.game.hud.bigMessage('ZASTAV PRO VÝSTUP');
      return;
    }
    const mp = this.game.mp;
    if (mp && mp.active) {
      if (mp.isHost) { mp._hostShilkaClaim('dismount', mp.myId, this.id, seat, { force }); return; } // host: apply + broadcast
      // client: a forced dismount (death/reset) tears the local seat down NOW so a dead driver stops
      // reading input + broadcasting moves; the host frees the seat when the claim arrives.
      if (force) this._leaveSeat(seat);
      mp.net.send('shilkaclaim', { v: this.id, seat, want: 'dismount', force });
      return;
    }
    if (seat >= 0) this.seats[seat] = null;
    this._leaveSeat(seat);
  }

  _netDismount() { this._leaveSeat(this.localSeat); } // co-op: the host freed my seat

  // Local seat teardown — shared by the solo path and the co-op state apply.
  _leaveSeat(seat) {
    if (isDriverSeat(seat)) {
      this._showDriveHud(false);
      if (this._hood) this._hood.visible = false;
      if (this.periscopes) this.periscopes.visible = true; // restore the model optic for 3rd-person / other players
    }
    this.localSeat = -1;
    this.game.player.shilka = null;
    this.game.weapons.group.visible = true;
    if (this.game.hud.el.cross) this.game.hud.el.cross.style.opacity = '';
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    this._showPanel(false);
    this.cursorMode = false;
    if (this.game.state === 'playing' && !this.game.input.locked) this.game.input.requestLock();
    this.game.hud.setWeapon(this.game.weapons);
  }

  // Authoritative state shape the host broadcasts (and clients reconcile against) — occupancy + the
  // shared radar flag. Built here so the payload shape lives in one place (mp.js calls sh._statePayload()).
  _statePayload() {
    const d = this.drive;
    // carry a coarse position snapshot (xf) so a late joiner positions a driven-then-parked vehicle
    // correctly instead of at its spawn; a live-driven vehicle is positioned by the smooth shilkamove.
    return {
      v: this.id, seats: this.seats.slice(), radar: !!this.state.radarOnAir,
      xf: { x: +d.x.toFixed(2), z: +d.z.toFixed(2), heading: +d.heading.toFixed(3), pitch: +d.pitch.toFixed(3), roll: +d.roll.toFixed(3), gear: d.gear, ws: +d.wheelSpin.toFixed(2), ts: +d.trackScroll.toFixed(2) },
    };
  }
  setRadar(on) { this.state = setShilkaSwitch(this.state, 'radarOnAir', !!on); }

  // Apply a coarse transform snapshot from shilkastate — positions a PARKED vehicle (no seated driver) on
  // a late joiner / resolves drift. The live driven path uses _applyRemoteDrive (shilkamove) instead.
  _applyNetTransform(t) {
    const d = this.drive;
    d.x = t.x; d.z = t.z; d.heading = t.heading; d.pitch = t.pitch; d.roll = t.roll;
    d.gear = t.gear; d.wheelSpin = t.ws; d.trackScroll = t.ts;
    d.wheelSpinL = d.wheelSpinR = t.ws; d.trackScrollL = d.trackScrollR = t.ts; // parked: seed both sides
    d.y = this._groundY(d.x, d.z) + SHILKA_DRIVE_TUNING.wheelRadius + SHILKA_DRIVE_TUNING.rideHeight;
    if (this.rig) this._applyRig(0); else this._pendingRig = true; // rig may still be loading on a fresh joiner
  }

  onPointerUnlock() {
    if (this.game.player.shilka === this) this._setCursorMode(true);
  }

  forceReset() {
    if (this.game.player.shilka === this) this.dismount(true);
    this.seats.fill(null); this.localSeat = -1; // wipe per-run occupancy so a stale id can't lock a seat after a reset
    this.state = createShilkaState({ rangeGateM: 1200 });
    this.aimAzMils = 0;
    this.aimElDeg = 8;
    for (let i = 0; i < this.drones.length; i++) {
      const fresh = makeShilkaDrone(`meteor-${i + 1}`, 0x53484c31 + i, this.base);
      Object.assign(this.drones[i], fresh, { mesh: this.drones[i].mesh });
    }
  }

  update(dt) {
    this._updateDrones(dt);
    this._updateProjectiles(dt);
    // cosmetic body dynamics: ONE spring step per frame for every Shilka (drives hull pitch/roll + the
    // trauma/buzz that the driver, gunner, and external viewers all read). Local only — never synced.
    // Runs before controlUpdate's _applyRig (game.js loop order), so the rig sums this frame's spring.
    if (this.rig) {
      const dh = this.drive.heading - (this._dyn.h0 ?? this.drive.heading);
      this._dyn.h0 = this.drive.heading;
      const omega = (((dh + Math.PI) % TAU + TAU) % TAU - Math.PI) / Math.max(dt, 1e-3);
      this._stepBody(dt, this.drive.speed, omega, this._dyn.fireHold > 0);
    }
    if (this._pendingRig && this.rig) { this._applyRig(0); this._pendingRig = false; } // apply a snapshot that arrived before the GLB finished loading
    // radar "Gun Dish" scans continuously — visible on the parked model from any angle (this.update
    // ticks even when unseated). Dev: s._radarSpin = 0 stops it, larger = faster (rad/s).
    if (this.rig && this.rig.radar) this.rig.radar.rotation.y += dt * (this._radarSpin ?? SHILKA_RADAR_SPIN);
    // co-op: a REMOTE driver holds seat 0 → drive the rig from their broadcast (we don't simulate it).
    // Gated on seats[0] !== myId so the local driver, who runs _driveControlUpdate, never double-applies.
    const mp = this.game.mp;
    if (mp && mp.active && this.seats[0] && this.seats[0] !== mp.myId) this._applyRemoteDrive(dt);
    if (this.seats[2] != null) this._applyTurretAim(); // a gunner is laying the turret (local aim or remote shilkaaim)
    if (this.marker) {
      this.marker.material.opacity = this.game.player.shilka === this ? 0.48 : 0.24 + Math.sin(performance.now() * 0.003) * 0.08;
    }
  }

  controlUpdate(dt) {
    if (this.localSeat === SHILKA_DRIVER_SEAT) { this._driveControlUpdate(dt); return; }
    if (this.localSeat === 2) { this._gunnerControlUpdate(dt); return; } // gunner: radar / optical fire-control
    if (this.localSeat >= 1) { this._turretControlUpdate(dt); return; }   // commander / range-op ride-along
    // localSeat === -1: the local player isn't aboard this vehicle (e.g. a remote crew drives it) — no control
  }

  // Ride-along seat camera for the commander (1) and range operator (3). The gunner (2) gets the full
  // fire-control station (_stationControlUpdate). Their full roles are a later slice.
  _turretControlUpdate(dt) {
    this._frameTurretCamera(dt, this.localSeat);
  }

  _frameTurretCamera(dt, seat) {
    const cam = this.game.engine.camera;
    const d = this.drive;
    const e = SHILKA_TURRET_EYES[seat] || SHILKA_TURRET_EYES[2];
    const cos = Math.cos(d.heading), sin = Math.sin(d.heading);
    cam.position.set(d.x + (e.x * cos + e.z * sin), d.y + e.y, d.z + (-e.x * sin + e.z * cos));
    // free look around the station (clamped); the base heading rides the hull
    this._tYaw = (this._tYaw || 0) + this.game.input.mouseDX * 0.0022;
    this._tPitch = clamp((this._tPitch || 0) - this.game.input.mouseDY * 0.0022, -0.5, 0.55);
    const yaw = d.heading + this._tYaw, pitch = this._tPitch;
    const fwd = TMP_FWD.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    cam.rotation.order = 'YXZ';
    cam.lookAt(TMP_END.copy(cam.position).add(fwd));
    cam.rotation.z = 0;
    this._cameraShake(cam, 0.65); // turret crew: ride + recoil, calmer than the driver
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    const pl = this.game.player;
    pl.pos.set(d.x, d.y, d.z); pl.vel.set(0, 0, 0);
  }

  // Gunner (seat 2) radar on/off. Co-op client → ask the host; host/solo → set + (host) broadcast state.
  _setRadar(on) {
    const mp = this.game.mp;
    if (mp && mp.active && !mp.isHost) { mp.net.send('shilkaclaim', { v: this.id, seat: this.localSeat, want: 'radar', radar: !!on }); return; }
    this.setRadar(on);
    if (mp && mp.active && mp.isHost) mp.net.send('shilkastate', this._statePayload());
  }

  // --- v1 fire-control station (dormant this slice; the autocannon slice wires it to the gunner seat) ---
  // Gunner dispatch: V toggles between the radar console (РЛС) and the optical direct-fire sight (ОПТИКА).
  _gunnerControlUpdate(dt) {
    if (this.game.input.wasPressed('KeyV')) {
      this._gunMode = (this._gunMode === 'optical') ? 'radar' : 'optical';
      if (this._gunMode === 'radar') { this._showPanel(true); this._setCursorMode(true); }
      else { this._showPanel(false); this._setCursorMode(false); } // optical: hide the console, lock the pointer to lay the guns
      if (this.game.hud) this.game.hud.bigMessage(this._gunMode === 'optical' ? 'ОПТИКА — прямая наводка' : 'РЛС — радар');
    }
    if (this._gunMode === 'optical') this._opticalControlUpdate(dt);
    else this._stationControlUpdate(dt);
    this._broadcastAim(dt); // co-op: push the lay so the turret slews for everyone
  }

  // The gunner broadcasts the turret lay ~12 Hz; recipients apply it (update() → _applyTurretAim).
  _broadcastAim(dt) {
    const mp = this.game.mp; if (!mp || !mp.active) return;
    this._aimT = (this._aimT || 0) - dt;
    if (this._aimT > 0) return;
    this._aimT = 0.08;
    mp.net.broadcast('shilkaaim', { pid: mp.myId, v: this.id, az: Math.round(this.aimAzMils), el: +this.aimElDeg.toFixed(1) });
  }

  // Broadcast a burst's muzzle/dir/seed so teammates render matching tracers + flash (NO damage — that is
  // host-authoritative via claimHit). _renderRemoteFire reproduces the seeded pattern with a nominal
  // dispersion (the exact dispersion isn't transmitted — cosmetic only).
  _broadcastFire(muzzle, dir, seed, rounds) {
    const mp = this.game.mp; if (!mp || !mp.active || !rounds) return;
    mp.net.broadcast('shilkafire', { pid: mp.myId, v: this.id,
      o: [+muzzle.x.toFixed(1), +muzzle.y.toFixed(1), +muzzle.z.toFixed(1)],
      d: [+dir.x.toFixed(3), +dir.y.toFixed(3), +dir.z.toFixed(3)], s: seed >>> 0, r: rounds });
  }

  _renderRemoteFire(d) {
    const fx = this.game.effects; if (!fx || !d || !d.o || !d.d) return;
    const o = new THREE.Vector3(d.o[0], d.o[1], d.o[2]);
    const dir = new THREE.Vector3(d.d[0], d.d[1], d.d[2]);
    const grant = { muzzle: { x: o.x, y: o.y, z: o.z }, baseDir: { x: dir.x, y: dir.y, z: dir.z }, roundCount: d.r || 1, dispersionMils: 8, seed: (d.s >>> 0) || 1 };
    fx.muzzleFlash(o, dir, 2.4);
    const shown = Math.min(6, d.r || 1);
    for (let i = 0; i < shown; i++) {
      const rd = grantRoundDir(grant, i * 3);
      const end = o.clone().addScaledVector(new THREE.Vector3(rd.x, rd.y, rd.z), 700);
      fx.tracer(o, end, i % 3 === 0 ? 0xff3428 : 0xffd16a);
    }
  }

  // World aim direction of the guns: hull heading + turret traverse, plus barrel elevation.
  _aimDir() {
    const { yaw, pitch } = aimToTurret(this.aimAzMils, this.aimElDeg);
    const world = this.drive.heading + yaw, ce = Math.cos(pitch);
    return { x: Math.sin(world) * ce, y: Math.sin(pitch), z: Math.cos(world) * ce };
  }

  // ОПТИКА: manual turret/elevation by mouse, magnified sight, LMB direct-fires the 4×23 mm at ground.
  _opticalControlUpdate(dt) {
    const input = this.game.input;
    this.aimAzMils = (this.aimAzMils + input.mouseDX * 0.9 + 6000) % 6000;
    this.aimElDeg = clamp(this.aimElDeg - input.mouseDY * 0.04, -4, 62);
    this.state = stepShilka(this.state, dt, 0); // cools heat (no radar lock in optical)
    this._fireCD = Math.max(0, (this._fireCD || 0) - dt);
    if (input.buttons[0] && this._fireCD <= 0) { this._fireOptical(SHILKA_BURST_SECONDS); this._fireCD = SHILKA_BURST_SECONDS; }
    this._frameOpticalCamera(dt);
  }

  _fireOptical(seconds) {
    if (this.state.ammo <= 0 || this.state.heat >= SHILKA_TUNING.firingHeatLimit) return;
    const muzzle = this._origin();
    const aimDir = this._aimDir();
    const seed = ((performance.now() * 1000) ^ (this.state.ammo * 2654435761)) >>> 0;
    const grant = makeOpticalBurstGrant(this.state, this.id, muzzle, aimDir, seed, seconds);
    if (!grant) return;
    this.state = fireShilkaBurst(this.state, seconds, false); // deduct ammo/heat (no solution gate)
    this._dyn.fireHold = 0.16; // recoil: feeds _stepBody (rock-back + 25 Hz buzz + trauma plateau)
    const enemies = (this.game.enemies && this.game.enemies.active) || [];
    const hits = sweepShilkaBurst(grant, enemies, { radiusPad: 0.4 });
    const hostSim = !this.game.mp || !this.game.mp.active || this.game.mp.isHost;
    for (const id in hits) {
      const e = enemies.find((x) => String(x.id) === String(id) && x.alive);
      if (!e) continue;
      const dmg = hits[id] * SHILKA_ROUND_DMG;
      if (hostSim) this.game.enemies.damage(e, dmg, 'shilka');
      else if (this.game.mp.claimHit) this.game.mp.claimHit(e, dmg, 'shilka');
    }
    this._spawnOpticalVisuals(grant, muzzle, aimDir);
    this._broadcastFire(muzzle, aimDir, grant.seed, grant.roundCount);
  }

  _spawnOpticalVisuals(grant, muzzle, aimDir) {
    const fx = this.game.effects; if (!fx) return;
    const o = new THREE.Vector3(muzzle.x, muzzle.y, muzzle.z);
    fx.muzzleFlash(o, new THREE.Vector3(aimDir.x, aimDir.y, aimDir.z), 2.4);
    const shown = Math.min(6, grant.roundCount);
    for (let i = 0; i < shown; i++) {
      const rd = grantRoundDir(grant, i * 3);
      const end = o.clone().addScaledVector(new THREE.Vector3(rd.x, rd.y, rd.z), 700);
      fx.tracer(o, end, i % 3 === 0 ? 0xff3428 : 0xffd16a);
    }
  }

  _frameOpticalCamera(dt) {
    const cam = this.game.engine.camera;
    const d = this.drive;
    const aim = this._aimDir();
    cam.position.set(d.x, d.y + 2.3, d.z); // sight head above the turret
    cam.rotation.order = 'YXZ';
    cam.lookAt(d.x + aim.x, d.y + 2.3 + aim.y, d.z + aim.z);
    this._cameraShake(cam, 0.5, 18 / 80); // gunner optic: ride+recoil, angular shake scaled down for the 18° zoom
    this.game.engine.setFov(18); // ~4× magnified optical sight
    const pl = this.game.player; pl.pos.set(d.x, d.y, d.z); pl.vel.set(0, 0, 0);
  }

  _stationControlUpdate(dt) {
    const input = this.game.input;
    this._wirePanelOnce();
    this._targetT += dt;

    if (this.state.role === SHILKA_ROLES.ANGLE) {
      this.aimAzMils = (this.aimAzMils + input.mouseDX * 0.9 + 6000) % 6000;
      this.aimElDeg = clamp(this.aimElDeg - input.mouseDY * 0.04, -4, 62);
    } else {
      let gate = this.state.rangeGateM;
      if (input.isDown('KeyW')) gate += 260 * dt;
      if (input.isDown('KeyS')) gate -= 260 * dt;
      if (input.isDown('ShiftLeft') || input.isDown('ShiftRight')) {
        if (input.isDown('KeyW')) gate += 740 * dt;
        if (input.isDown('KeyS')) gate -= 740 * dt;
      }
      if (gate !== this.state.rangeGateM) this.state = setShilkaRangeGate(this.state, gate);
    }

    if (input.wasPressed('Tab')) this.state = setShilkaRole(this.state, this.state.role === SHILKA_ROLES.ANGLE ? SHILKA_ROLES.RANGE : SHILKA_ROLES.ANGLE);
    if (input.wasPressed('KeyR')) this._toggleSearch();
    if (input.wasPressed('KeyX')) this._dropLock();
    if (input.wasPressed('Digit1')) this._toggleSwitch('power54v');
    if (input.wasPressed('Digit2')) this._toggleSwitch('gyroUnlocked');
    if (input.wasPressed('Digit3')) this._toggleSwitch('hydroDrive');
    if (input.wasPressed('Digit4')) this._toggleSwitch('radarFilament');
    if (input.wasPressed('Digit5')) this._toggleSwitch('radarAnode');
    if (input.wasPressed('Digit6')) this._toggleSwitch('radarHighVoltage');
    if (input.wasPressed('Digit7')) this._toggleSwitch('radarOnAir');

    const origin = this._origin();
    // track the test drones AND real game enemies; shilkaRadarSignal rejects low/ground targets, so only
    // AIRBORNE enemies (e.g. flying bosses) get a radar lock — ground hordes are the optical mode's job.
    this.state = updateShilkaTrack(this.state, origin, [...this.drones.filter((d) => d.alive), ...this._radarTargets()]);
    const aimError = this._aimErrorDeg();
    if (input.buttonsPressed[2]) this.state = tryShilkaAngleLock(this.state, aimError);
    this.state = stepShilka(this.state, dt, aimError);
    this._fireCD = Math.max(0, (this._fireCD || 0) - dt);
    if (input.buttons[0] && this._fireCD <= 0) { this._tryFire(SHILKA_BURST_SECONDS); this._fireCD = SHILKA_BURST_SECONDS; }

    this._frameCamera(dt);
    this._updatePanel();
  }

  _updateDrones(dt) {
    for (let i = 0; i < this.drones.length; i++) {
      let d = this.drones[i];
      if (d.alive) {
        d = stepShilkaDrone(d, dt, this.base);
        this.drones[i] = d;
      }
      if (d.mesh) {
        d.mesh.visible = !!d.alive;
        d.mesh.position.set(d.pos.x, d.pos.y, d.pos.z);
        const yaw = Math.atan2(d.vel.x, d.vel.z);
        d.mesh.rotation.set(0, yaw, 0);
      }
    }
  }

  _updateProjectiles(dt) {
    const scene = this.game.engine.scene;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.mesh) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
        this.projectiles.splice(i, 1);
        continue;
      }
      const step = p.speed * dt;
      const from = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.dir, step);
      p.mesh.lookAt(TMP_END.copy(p.mesh.position).add(p.dir));
      if (this.game.effects && Math.random() < 0.4) this.game.effects.tracer(from, p.mesh.position, 0xffd16a);
    }
  }

  _tryFire(seconds) {
    if (!shilkaSolutionReady(this.state) || this.state.heat >= SHILKA_TUNING.firingHeatLimit) return;
    const tid = this.state.selectedTargetId;
    const drone = this.drones.find((d) => d.id === tid && d.alive);
    // the locked target is either a test drone (local health) or a real airborne enemy (host-auth damage)
    const enemy = drone ? null : ((this.game.enemies && this.game.enemies.active) || []).find((e) => e.id === tid && e.alive);
    const target = drone || enemy;
    if (!target) return;
    const seed = ((performance.now() * 1000) ^ (this.state.ammo * 2654435761)) >>> 0;
    const muzzle = this._origin();
    const grant = makeShilkaBurstGrant(this.state, this.id, muzzle, seed, seconds);
    if (!grant) return;
    this.state = fireShilkaBurst(this.state, seconds);
    this._dyn.fireHold = 0.16; // recoil: feeds _stepBody (rock-back + 25 Hz buzz + trauma plateau)
    const hits = this._resolveBurst(grant, target);
    if (hits > 0) {
      if (drone) {
        drone.health -= hits * 28;
        if (drone.health <= 0) {
          drone.alive = false;
          if (this.game.effects) this.game.effects.explosion(new THREE.Vector3(drone.pos.x, drone.pos.y, drone.pos.z), 4.5);
          if (this.game.hud) this.game.hud.toast('METEOR-1 TARGET DESTROYED', 0xd8b066);
        } else if (this.game.hud) this.game.hud.hitmarker(false);
      } else {
        const dmg = hits * SHILKA_ROUND_DMG;
        const hostSim = !this.game.mp || !this.game.mp.active || this.game.mp.isHost;
        if (hostSim) this.game.enemies.damage(enemy, dmg, 'shilka');
        else if (this.game.mp.claimHit) this.game.mp.claimHit(enemy, dmg, 'shilka');
        if (this.game.hud) this.game.hud.hitmarker(false);
      }
    }
    this._spawnBurstVisuals(grant, target, hits);
    this._broadcastFire(muzzle, grant.baseDir, grant.seed, grant.roundCount);
  }

  _resolveBurst(grant, target) {
    let hits = 0;
    const origin = grant.muzzle;
    const maxRounds = Math.min(grant.roundCount, 84);
    for (let i = 0; i < maxRounds; i++) {
      const dir = grantRoundDir(grant, i);
      const shot = simulateShilkaProjectile({
        origin,
        dir,
        targetStart: target.pos,
        targetVel: target.vel,
        targetRadius: SHILKA_TUNING.droneHitRadiusM,
      });
      if (shot.hit) hits++;
    }
    return hits;
  }

  _spawnBurstVisuals(grant, target, hits) {
    const scene = this.game.engine.scene;
    const origin = new THREE.Vector3(grant.muzzle.x, grant.muzzle.y, grant.muzzle.z);
    const shown = Math.min(12, grant.roundCount);
    for (let i = 0; i < shown; i++) {
      const dirObj = grantRoundDir(grant, i * 3);
      const dir = new THREE.Vector3(dirObj.x, dirObj.y, dirObj.z);
      const end = origin.clone().addScaledVector(dir, 1200);
      if (this.game.effects) this.game.effects.tracer(origin, end, i % 3 === 0 ? 0xff3428 : 0xffd16a);
      if (i < 4) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.6), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xff3428 : 0xffd16a, fog: false }));
        mesh.position.copy(origin).addScaledVector(dir, 4 + i * 0.3);
        mesh.lookAt(TMP_END.copy(mesh.position).add(dir));
        scene.add(mesh);
        this.projectiles.push({ mesh, dir, speed: SHILKA_TUNING.projectileSpeedMps, life: 0.8 });
      }
    }
    if (this.game.effects) this.game.effects.muzzleFlash(origin, new THREE.Vector3(grant.baseDir.x, grant.baseDir.y, grant.baseDir.z), 2.6);
    if (hits > 0 && this.game.effects) this.game.effects.stuffing(new THREE.Vector3(target.pos.x, target.pos.y, target.pos.z), 0xd8b066, Math.min(18, hits), 5);
  }

  _aimErrorDeg() {
    const kin = this.state.targetKinematics;
    if (!kin) return 999;
    let az = this.aimAzMils - kin.azimuthMils;
    while (az > 3000) az -= 6000;
    while (az < -3000) az += 6000;
    const azDeg = az / 6000 * 360;
    const elDeg = this.aimElDeg - kin.elevationDeg;
    return Math.hypot(azDeg, elDeg);
  }

  _toggleSearch() {
    if (!radarReady(this.state)) return;
    if (!this.state.searchMode) this.state = startShilkaSearch(this.state, SHILKA_SEARCH_MODES.SECTOR);
    else this.state = startShilkaSearch(this.state, this.state.searchMode === SHILKA_SEARCH_MODES.SECTOR ? SHILKA_SEARCH_MODES.CIRCULAR : SHILKA_SEARCH_MODES.SECTOR);
  }

  _dropLock() {
    this.state = {
      ...this.state,
      angleLocked: false,
      rangeGateLocked: false,
      rangeSolution: 0,
      leadSolution: 0,
      lockQuality: 0,
      firing: false,
      lastBurstRounds: 0,
    };
  }

  _toggleSwitch(name) {
    this.state = setShilkaSwitch(this.state, name, !this.state[name]);
  }

  quickStart() {
    let s = this.state;
    for (const [key] of SWITCH_LABELS) s = setShilkaSwitch(s, key, true);
    this.state = stepShilka(s, SHILKA_TUNING.warmupSeconds);
    this.state = startShilkaSearch(this.state, SHILKA_SEARCH_MODES.SECTOR);
  }

  _frameCamera(dt) {
    const cam = this.game.engine.camera;
    const yaw = (this.aimAzMils / 6000) * TAU;
    const pitch = this.aimElDeg * D2R;
    const fwd = new THREE.Vector3(Math.sin(yaw), Math.sin(pitch), Math.cos(yaw)).normalize();
    const back = new THREE.Vector3(Math.sin(this.baseYaw), 0, Math.cos(this.baseYaw));
    cam.position.set(this.base.x - back.x * 1.2, this.base.y + 2.05, this.base.z - back.z * 1.2);
    cam.rotation.order = 'YXZ';
    cam.lookAt(TMP_END.copy(cam.position).add(fwd));
    this._cameraShake(cam, 0.5); // radar overhead view
    this.game.engine.setFov(72);
    const pl = this.game.player;
    pl.pos.set(this.base.x - back.x * 1.15, this.base.y, this.base.z - back.z * 1.15);
    pl.vel.set(0, 0, 0);
    pl.yaw = damp(pl.yaw, yaw + Math.PI, 12, dt);
    pl.pitch = damp(pl.pitch, -0.08, 12, dt);
  }

  _driveControlUpdate(dt) {
    const input = this.game.input;
    if (input.wasPressed('KeyC')) this._chaseCam = !this._chaseCam; // C: toggle 3rd-person chase view
    if (!this._lever) this._lever = { ...SHILKA_GATE_SLOTS[this.drive.gear] || SHILKA_GATE_SLOTS.N };
    // SHIFTING: hold Space (clutch in) and the mouse drags the lever through the ГМ-575 double-H gate;
    // the lever's slot is fed as gearReq (stepDrive's synchro logic decides if it actually engages).
    // While shifting, the periscope traverse is suspended (see _frameDriverCamera) so the mouse is the lever.
    this._shifting = input.isDown('Space');
    let gearReq = null;
    if (this._shifting) {
      const moved = moveShiftLever(this._lever, input.mouseDX * SHILKA_GATE_MOUSE, -input.mouseDY * SHILKA_GATE_MOUSE);
      this._lever.gx = moved.gx; this._lever.gy = moved.gy;
      gearReq = moved.gear;
    }
    // digit shortcuts: snap the lever straight to a slot (and request it) — power-user / accessibility path.
    const snap = (g) => { this._lever = { ...SHILKA_GATE_SLOTS[g] }; gearReq = g; };
    if (input.wasPressed('Digit1')) snap('1');
    else if (input.wasPressed('Digit2')) snap('2');
    else if (input.wasPressed('Digit3')) snap('3');
    else if (input.wasPressed('Digit4')) snap('4');
    else if (input.wasPressed('Digit5')) snap('5');
    else if (input.wasPressed('KeyR')) snap('R');
    else if (input.wasPressed('Backquote') || input.wasPressed('Digit0')) snap('N');
    const inp = {
      throttle: input.isDown('KeyW') ? 1 : 0,
      brake: input.isDown('KeyS') ? 1 : 0,
      steer: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      clutch: (input.isDown('Space')) ? 0 : 1, // Space pressed = clutch in (disengaged)
      gearReq,
      starter: input.isDown('Enter'),
    };
    const ground = this._sampleWheelGround();
    this.drive = stepDrive(this.drive, dt, inp, ground);
    this._applyRig(dt);
    this._frameDriverCamera(dt);
    this._renderPeriscope(); // RTT the optical periscope into _periRT, BEFORE engine.render()
    this._updateDriveHud();
    this._broadcastMove(dt); // co-op: the driver is authoritative over motion → push the transform to everyone
  }

  // The seated driver broadcasts the vehicle transform ~15 Hz; every other client applies it in update()
  // (see _applyRemoteDrive). Only the driver runs this — _driveControlUpdate only runs for seat 0.
  _broadcastMove(dt) {
    const mp = this.game.mp;
    if (!mp || !mp.active) return;
    this._moveT = (this._moveT || 0) - dt;
    if (this._moveT > 0) return;
    this._moveT = 0.066;
    const d = this.drive;
    mp.net.broadcast('shilkamove', {
      pid: mp.myId, v: this.id,
      x: +d.x.toFixed(2), z: +d.z.toFixed(2), heading: +d.heading.toFixed(3),
      pitch: +d.pitch.toFixed(3), roll: +d.roll.toFixed(3),
      gear: d.gear, speed: +d.speed.toFixed(2),
      ws: +d.wheelSpin.toFixed(2), ts: +d.trackScroll.toFixed(2),
      wsL: +d.wheelSpinL.toFixed(2), wsR: +d.wheelSpinR.toFixed(2),
      tsL: +d.trackScrollL.toFixed(2), tsR: +d.trackScrollR.toFixed(2),
    });
  }

  // Apply the driver's last broadcast on a NON-driving client: smooth toward it and drive the rig. y is
  // recomputed from the shared (deterministic) terrain so it isn't sent. Never runs for the local driver
  // (update() gates on seats[0] !== myId) — that would double-simulate and fight the local sim.
  _applyRemoteDrive(dt) {
    const m = this._netMove; if (!m) return;
    const d = this.drive;
    const k = Math.min(1, dt * 12); // short lerp to hide the 66 ms cadence (matches RemotePlayer smoothing)
    d.x += (m.x - d.x) * k;
    d.z += (m.z - d.z) * k;
    d.heading = this._lerpAngle(d.heading, m.heading, k);
    d.pitch += (m.pitch - d.pitch) * k;
    d.roll += (m.roll - d.roll) * k;
    d.gear = m.gear; d.speed = m.speed;
    d.wheelSpin = m.ws; d.trackScroll = m.ts;
    d.wheelSpinL = m.wsL ?? m.ws; d.wheelSpinR = m.wsR ?? m.ws;   // per-side (fallback to single)
    d.trackScrollL = m.tsL ?? m.ts; d.trackScrollR = m.tsR ?? m.ts;
    d.y = this._groundY(d.x, d.z) + SHILKA_DRIVE_TUNING.wheelRadius + SHILKA_DRIVE_TUNING.rideHeight;
    this._applyRig(dt);
  }

  _recvMove(d) { this._netMove = d; } // latest authoritative transform from the seated driver (mp validates the sender)

  _lerpAngle(a, b, k) { const T = Math.PI * 2; const diff = ((b - a + Math.PI) % T + T) % T - Math.PI; return a + diff * k; }

  // terrain height under each road wheel, read from the ACTUAL rig pivots' world XZ.
  // Sampling the real pivots (not reconstructed geometry) keeps L[i]/R[i] in lockstep with
  // rig.wheelsL[i]/rig.wheelsR[i] through the rig's π re-orient — so stepDrive's front
  // (index 0) is the true front wheel and _applyRig feeds suspension back to the same wheel.
  _sampleWheelGround() {
    if (!this.rig) return null;
    if (this.rig.wheelsL.length < 6 || this.rig.wheelsR.length < 6) {
      if (!this._wheelCountWarned) { this._wheelCountWarned = true; console.warn(`[shilka] ${this.id}: rig has ${this.rig.wheelsL.length}L/${this.rig.wheelsR.length}R wheels (expected 6/side) — suspension disabled, drive still works.`); }
      return null; // stepDrive accepts null wheelGroundY → no tilt, but no crash
    }
    const L = [], R = [];
    for (let i = 0; i < 6; i++) {
      this.rig.wheelsL[i].getWorldPosition(TMP_ORIGIN); L.push(this._groundY(TMP_ORIGIN.x, TMP_ORIGIN.z));
      this.rig.wheelsR[i].getWorldPosition(TMP_ORIGIN); R.push(this._groundY(TMP_ORIGIN.x, TMP_ORIGIN.z));
    }
    return { L, R };
  }

  // Scroll the belt tread textures at ground speed, per side. The tread map is shared across both belts
  // (one cached Lambert material), and texture.offset is a property of the TEXTURE, so we clone the
  // material + map per side on first use. Scroll by the per-frame delta of the per-side trackScroll so
  // it tracks both local integration and 15 Hz remote snaps; %1 keeps float precision. signL/signR fix
  // the mirrored-UV direction (one belt's UVs run opposite); k = UV repeats per metre of belt travel.
  // Dev knobs while mounted: s._trackUVk (scale), s._trackSignL / s._trackSignR (±1).
  _scrollTracks(d) {
    if (this._trackMaps === undefined) {
      this._trackMaps = null; this._trackScrollPrev = { L: 0, R: 0 };
      const maps = { L: [], R: [] };
      for (const m of (this.rig.tracks || [])) {
        const side = (m.userData && m.userData.side) === 'R' ? 'R' : 'L';
        const m0 = Array.isArray(m.material) ? m.material[0] : m.material;
        if (!m0 || !m0.map) continue;
        const cm = m0.clone(); cm.map = m0.map.clone(); cm.map.needsUpdate = true;
        cm.map.wrapS = cm.map.wrapT = THREE.RepeatWrapping;
        if (Array.isArray(m.material)) m.material[0] = cm; else m.material = cm;
        maps[side].push(cm.map);
      }
      if (maps.L.length || maps.R.length) this._trackMaps = maps;
      else console.warn(`[shilka] ${this.id}: belt meshes have no .map → UV tread scroll disabled (wheels/sprockets still spin).`);
    }
    if (!this._trackMaps) return;
    const k = this._trackUVk ?? 0.6;
    const dL = (d.trackScrollL - this._trackScrollPrev.L) * k * (this._trackSignL ?? 1);
    const dR = (d.trackScrollR - this._trackScrollPrev.R) * k * (this._trackSignR ?? 1);
    this._trackScrollPrev.L = d.trackScrollL; this._trackScrollPrev.R = d.trackScrollR;
    for (const mp of this._trackMaps.L) mp.offset.x = (mp.offset.x + dL) % 1;
    for (const mp of this._trackMaps.R) mp.offset.x = (mp.offset.x + dR) % 1;
  }

  // Deformable track: pose each belt's 6 road-wheel bones (belt_{L,R}_0-5) to follow that wheel's
  // suspension lift, so the bottom run + the top run (which rests on the wheel tops — no return rollers)
  // ripple over terrain with the wheels. The bones lift in their LOCAL +Y, which maps to world +Y
  // (verified: 1 local unit = rigScale world units), so the lift is wheelOffset/scale, same as the wheel.
  // idler/sprocket bones stay at rest (tensioners, not sprung).
  _deformBelts(d, s) {
    if (this._beltBones === undefined) {
      this._beltBones = null;
      const out = { L: null, R: null };
      for (const m of (this.rig.tracks || [])) {
        if (!m.isSkinnedMesh || !m.skeleton) continue;
        const side = m.userData && m.userData.side === 'R' ? 'R' : 'L';
        const bones = [];
        for (let i = 0; i < 6; i++) {
          const b = m.skeleton.bones.find((x) => x.name === `belt_${side}_${i}`);
          if (b) { b.userData.restY = b.position.y; bones.push(b); }
        }
        if (bones.length === 6) out[side] = bones;
      }
      if (out.L || out.R) this._beltBones = out;
    }
    if (!this._beltBones) return;
    const B = this._beltBones;
    if (B.L) for (let i = 0; i < 6; i++) B.L[i].position.y = B.L[i].userData.restY + d.wheelOffsetL[i] / s;
    if (B.R) for (let i = 0; i < 6; i++) B.R[i].position.y = B.R[i].userData.restY + d.wheelOffsetR[i] / s;
  }

  // Advance the cosmetic hull spring (pitch + roll) + lurch impulses + noise. CLIENT-LOCAL: called with
  // the local kinematics (or remote ones derived from the broadcast); never synced, never in the drive
  // model. Skipped on dt=0 apply paths (parked snapshot / pending rig) — aLong would divide by zero.
  _stepBody(dt, speed, omega, firing) {
    if (dt <= 0) return;
    const D = this._dyn, B = SHILKA_BODY;
    const aLong = clamp((speed - D.prevSpeed) / dt, -14, 14); // clamp spikes (hard gear snap / net teleport)
    // discrete lurch impulses (edge-detected). Convention: +pitch = nose UP (rig.body comment), so a
    // hard stop pitches the nose DOWN (−), a launch snaps it UP (+).
    if (D.prevSpeed > 2 && Math.abs(speed) < 0.4) D.pitchVel -= 0.45;        // hard stop → nose dives
    else if (D.prevSpeed < 0.3 && speed > 1) D.pitchVel += 0.30;            // launch → nose snaps up
    if (firing && !D.fireWas) { D.pitchVel += 0.07; D.trauma = Math.min(1, D.trauma + 0.15); } // burst onset
    // spring targets (quasi-static lean), reached THROUGH the spring so they overshoot/settle.
    // accel (+aLong) lifts the nose; braking (−aLong) dives it.
    let pitchTarget = clamp(B.pitchGain * aLong, -0.08, 0.08); // cap the lean at ~4.5°
    if (firing) pitchTarget += B.firePitchBias;
    const rollTarget = clamp(-B.rollGain * (speed * omega), -0.06, 0.06);
    // semi-implicit Euler (stable at dt ≤ 50 ms, which the loop guarantees)
    D.pitchVel += (-B.pitchW * B.pitchW * (D.pitch - pitchTarget) - 2 * B.pitchZeta * B.pitchW * D.pitchVel) * dt;
    D.pitch += D.pitchVel * dt;
    D.rollVel += (-B.rollW * B.rollW * (D.roll - rollTarget) - 2 * B.rollZeta * B.rollW * D.rollVel) * dt;
    D.roll += D.rollVel * dt;
    // fire-buzz envelope + idle shudder (additive layers, NOT through the spring)
    D.fireAmp += ((firing ? 1 : 0) - D.fireAmp) * Math.min(1, dt * (firing ? 12 : 7));
    D.t += dt;
    const idleA = B.idleAmp * (1 + 2 * Math.min(1, Math.abs(speed) / 13.9));
    this._dynPitchN = idleA * snoise(D.t * B.idleFreq) + D.fireAmp * B.fireAmp * snoise(D.t * B.fireFreq);
    this._dynRollN = idleA * 0.6 * snoise(D.t * B.idleFreq + 4.0);
    // trauma decay (camera shake consumes it in Phase 6); plateau while firing
    D.trauma = firing ? Math.max(D.trauma, 0.30) : Math.max(0, D.trauma - B.traumaDecay * dt);
    // ride shake: speed-driven camera-local jitter (the crew feels the terrain). Two noise bands, mostly
    // pitch + a vertical bob, roll tiny; grows with speed (ease-in), near-idle when stopped.
    const sp01 = clamp(Math.abs(speed) / SHILKA_RIDE.vFull, 0, 1);
    const rideI = SHILKA_RIDE.idleFloor + sp01 * sp01 * (1 - SHILKA_RIDE.idleFloor);
    const tl = D.t * SHILKA_RIDE.fLope, tb = D.t * SHILKA_RIDE.fBuzz;
    D.ridePitch = rideI * SHILKA_RIDE.pitchAmp * snoise(tl);
    D.rideYaw = rideI * SHILKA_RIDE.yawAmp * snoise(tl + 5.0);
    D.rideRoll = rideI * SHILKA_RIDE.rollAmp * snoise(tl + 9.0);
    D.rideBob = rideI * SHILKA_RIDE.bobAmp * (snoise(tl + 2.0) + 0.4 * snoise(tb + 1.0));
    D.rideLat = rideI * SHILKA_RIDE.latAmp * (0.5 * snoise(tl + 3.0) + snoise(tb + 6.0));
    D.prevSpeed = speed; D.fireWas = firing; D.fireHold = Math.max(0, D.fireHold - dt);
  }

  // Camera-local shake applied AFTER a seat's lookAt: the speed-driven RIDE jitter (crew feels the
  // terrain) + the firing TRAUMA kick (Eiserloh: rotational only, trauma², self-centring). seatMul scales
  // by seat harshness (driver 1.0, turret/gunner less); zoomScale shrinks the ANGULAR ride in a magnified
  // sight (same angle reads bigger when zoomed) with a floor so moving-fire still visibly wobbles. Roll
  // kept tiny (nausea); a small vertical bob reads as "bumpy" without provoking sickness like roll does.
  _cameraShake(cam, seatMul = 1, zoomScale = 1) {
    const D = this._dyn;
    const am = seatMul * zoomScale;
    cam.rotation.x += D.ridePitch * am;
    cam.rotation.y += D.rideYaw * am;
    cam.rotation.z += D.rideRoll * am;
    cam.position.y += D.rideBob * seatMul;
    if (D.trauma > 0.002) {
      const sh = D.trauma * D.trauma, A = SHILKA_BODY.traumaMaxAngle, t = D.t * 16;
      cam.rotation.x += A * sh * snoise(t);
      cam.rotation.y += A * sh * snoise(t + 7.3);
      cam.rotation.z += A * sh * snoise(t + 14.1) * 0.5;
    }
  }

  _applyRig(dt) {
    const rig = this.rig; if (!rig) return;
    const d = this.drive;
    this.vehicleRoot.position.set(d.x, d.y, d.z);
    this.vehicleRoot.rotation.y = d.heading;
    // hull tilt: +pitch raises the model front (-Z) → nose up climbing forward; roll negated
    // because the rig's π re-orient flips the body-local Z axis the roll is applied about
    // (so the higher-terrain side of the hull rises). Verified headless on sloped steppe.
    // terrain pose (synced) + cosmetic body dynamics (local spring) + high-freq noise, summed on one node
    rig.body.rotation.set(d.pitch + this._dyn.pitch + (this._dynPitchN || 0), 0,
      -d.roll + this._dyn.roll + (this._dynRollN || 0));
    // keep the re-enter anchor + teal ring on the vehicle so it stays mountable after driving off
    const gy = this._groundY(d.x, d.z);
    this.base.set(d.x, gy, d.z);
    if (this.marker) this.marker.position.set(d.x, gy + 0.05, d.z);
    const s = this._rigScale || 1;
    // road wheels: per-side spin (differential) + suspension offset (Phase 1 vertical slide; Phase 4 = arc)
    for (let i = 0; i < rig.wheelsL.length; i++) { const w = rig.wheelsL[i]; w.position.y = (w.userData.restY || 0) + d.wheelOffsetL[i] / s; w.rotation.x = d.wheelSpinL; }
    for (let i = 0; i < rig.wheelsR.length; i++) { const w = rig.wheelsR[i]; w.position.y = (w.userData.restY || 0) + d.wheelOffsetR[i] / s; w.rotation.x = d.wheelSpinR; }
    for (const sp of rig.sprockets) sp.rotation.x = (sp.userData && sp.userData.side === 'R') ? d.wheelSpinR : d.wheelSpinL;
    for (const id of (rig.idlers || [])) id.rotation.x = (id.userData && id.userData.side === 'R') ? d.wheelSpinR : d.wheelSpinL;
    this._scrollTracks(d);    // belt tread UV scroll, per side
    this._deformBelts(d, s);  // belt bones follow each road wheel's suspension lift (deformable track)
    const sway = clamp(-d.yawRate * 0.25, -0.25, 0.25);
    for (const a of rig.antennas) a.rotation.z = damp(a.rotation.z || 0, sway, 8, dt);
  }

  // Lay the turret + barrels from the gunner's aim (this.aimAzMils/ElDeg). Runs independently of driving
  // so the turret tracks even on a parked vehicle. The local gunner sets the aim via its control update;
  // remote clients get it from shilkaaim. Hull-relative yaw (rest = guns forward), barrels elevate.
  _applyTurretAim() {
    const rig = this.rig; if (!rig) return;
    const { yaw, pitch } = aimToTurret(this.aimAzMils, this.aimElDeg);
    if (rig.turret) rig.turret.rotation.y = yaw;
    for (const g of (rig.guns || [])) g.rotation.x = pitch;
  }

  // 3rd-person chase camera (toggle C while driving) — sits behind + above the hull and looks at it, so
  // you can WATCH the running gear: tracks scrolling, wheels bouncing over terrain, the hull lurching on
  // accel/brake, and recoil shake when the gunner fires. The driver's real view stays the periscope.
  _frameChaseCam(dt) {
    const cam = this.game.engine.camera, d = this.drive;
    const cos = Math.cos(d.heading), sin = Math.sin(d.heading);
    const back = this._chaseBack ?? 9, up = this._chaseUp ?? 4.5; // dev: s._chaseBack / s._chaseUp
    cam.position.set(d.x - sin * back, d.y + up, d.z - cos * back);
    cam.rotation.order = 'YXZ';
    cam.lookAt(d.x, d.y + 0.6, d.z);
    this._cameraShake(cam, 1.0); // chase: full ride shake so you can see the hull jiggle
    this.game.engine.setFov((this.game.settings && this.game.settings.data.fov) || 80);
    const pl = this.game.player; pl.pos.set(d.x, d.y, d.z); pl.vel.set(0, 0, 0);
  }

  _frameDriverCamera(dt) {
    const cam = this.game.engine.camera;
    const d = this.drive;
    if (this._chaseCam) { this._frameChaseCam(dt); return; } // C-toggled 3rd-person view of the running gear
    // Buttoned-up driver: the main camera only ever sees the black hood + the periscope SCREEN (the RTT
    // quad) in the slit, so its exact spot just needs to seat the hood sensibly at the driver station.
    const EYE = this._eye || (this._eye = { x: 0.565, y: 0.75, z: 2.4 }); // dev-tweakable: s._eye.{x,y,z}
    const cos = Math.cos(d.heading), sin = Math.sin(d.heading);
    cam.position.set(d.x + (EYE.x * cos + EYE.z * sin), d.y + EYE.y, d.z + (-EYE.x * sin + EYE.z * cos));
    cam.rotation.order = 'YXZ';
    // Main camera is PINNED to hull-forward (heading + terrain pitch), banked by -roll — NO mouselook,
    // so the hood never sweeps through the hull. The fixed-forward periscope screen lives in the slit.
    const fwd = TMP_FWD.set(
      Math.sin(d.heading) * Math.cos(d.pitch),
      Math.sin(d.pitch),
      Math.cos(d.heading) * Math.cos(d.pitch),
    );
    cam.lookAt(TMP_END.copy(cam.position).add(fwd));
    cam.rotation.z = -d.roll;
    // hood: identical pose → slit stays dead-centre; its child screen quad (the RTT image) sits in it.
    if (this._hood && this._hood.visible) {
      this._hood.position.copy(cam.position);
      this._hood.rotation.order = 'YXZ';
      this._hood.lookAt(TMP_END.copy(cam.position).add(fwd));
      this._hood.rotation.z = -d.roll;
    }
    // periscope optic: FIXED forward at the БМО-190Б field (no traverse — a real driver's day periscope is
    // a fixed wide-angle prism). Its world pose comes entirely from the parent (rig.body → heading + tilt);
    // we just hold the fixed local axis. The mouse is free for the shift lever (see _driveControlUpdate).
    if (this._periCam) { this._periCam.rotation.set(SHILKA_PERI_TILT, Math.PI, 0, 'YXZ'); this._cameraShake(this._periCam, 1.0); } // driver: harshest ride + recoil in the slit
    // setFov narrower than on-foot so the hood/slit fills more of the screen.
    this.game.engine.setFov(58);
    const pl = this.game.player;
    pl.pos.set(d.x, d.y, d.z); pl.vel.set(0, 0, 0);
  }

  // DEV: while mounted, nudge s._eye.{x,y,z} and s.periscopes.position.set(x,y,z) in the console
  // (camera + blocks update live each frame), then call this to print values to bake into the code.
  dumpDriverPlacement() {
    const p = this.periscopes ? this.periscopes.position.toArray().map((n) => +n.toFixed(2)) : null;
    console.log('[shilka] EYE', JSON.stringify(this._eye), '· PERISCOPES', JSON.stringify(p));
    return { eye: this._eye, periscopes: p };
  }

  _showDriveHud(on) { const el = document.getElementById('shilka-drive-hud'); if (el) el.classList.toggle('show', !!on); } // periscope viewport is now the 3D hood (_buildDriverHood), not the old 2D #shilka-periscope-mask overlay
  _updateDriveHud() {
    const el = document.getElementById('shilka-drive-hud'); if (!el) return;
    const d = this.drive;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('shilka-dh-gear', d.gear === 'R' ? 'ЗХ' : d.gear); // reverse = ЗХ (задний ход), authentic Cyrillic
    set('shilka-dh-speed', `${Math.round(Math.abs(d.speed) * 3.6)} km/h`);
    set('shilka-dh-rpm', d.engineOn ? `${Math.round(d.engineRpm)} rpm` : 'STALL');
    el.classList.toggle('stall', !d.engineOn);
    // H-gate lever dot: map (gx,gy) ∈ [-1,1]² to the SVG (rails at x 18/50/82, slots at y 12/60, channel 36)
    const lev = document.getElementById('shilka-gate-lever');
    if (lev && this._lever) {
      lev.setAttribute('cx', (50 + (this._lever.gx || 0) * 32).toFixed(1));
      lev.setAttribute('cy', (36 - (this._lever.gy || 0) * 24).toFixed(1));
    }
    el.classList.toggle('grind', !!d.grind);      // lever in a slot the dogs won't take → flash the gate
    el.classList.toggle('shifting', !!this._shifting);
    // highlight the engaged gear's label
    if (this._gateLabel !== d.gear) {
      const prev = document.getElementById(`shilka-gl-${this._gateLabel}`); if (prev) prev.classList.remove('on');
      const cur = document.getElementById(`shilka-gl-${d.gear}`); if (cur) cur.classList.add('on');
      this._gateLabel = d.gear;
    }
  }

  _showPanel(on) {
    const el = document.getElementById('shilka-panel');
    if (el) el.classList.toggle('show', !!on);
    if (!on) this._lastPanelText = '';
  }

  _setCursorMode(on) {
    this.cursorMode = !!on;
    const panel = document.getElementById('shilka-panel');
    if (panel) panel.classList.toggle('aiming', !this.cursorMode);
    if (on) {
      if (this.game.input.locked) this.game.input.exitLock();
    } else if (!this.game.input.locked) {
      this.game.input.requestLock();
    }
    this._updatePanel(true);
  }

  _wirePanelOnce() {
    if (this._uiWired) return;
    this._uiWired = true;
    const panel = document.getElementById('shilka-panel');
    if (panel) {
      for (const evName of ['pointerdown', 'mousedown', 'mouseup', 'click', 'contextmenu']) {
        panel.addEventListener(evName, (ev) => {
          ev.stopPropagation();
          if (evName === 'contextmenu') ev.preventDefault();
        });
      }
      panel.querySelectorAll('.shilka-scope, .shilka-rangebar').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          this._setCursorMode(false);
        });
      });
    }
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); fn(); this._setCursorMode(true); this._updatePanel(true); }); };
    bind('shilka-start', () => this.quickStart());
    bind('shilka-role', () => { this.state = setShilkaRole(this.state, this.state.role === SHILKA_ROLES.ANGLE ? SHILKA_ROLES.RANGE : SHILKA_ROLES.ANGLE); });
    bind('shilka-search', () => this._toggleSearch());
    bind('shilka-lock', () => { this.state = tryShilkaAngleLock(this.state, this._aimErrorDeg()); });
    bind('shilka-drop', () => this._dropLock());
    bind('shilka-fire', () => this._tryFire(0.22));
    for (const [key] of SWITCH_LABELS) bind(`shilka-sw-${key}`, () => this._toggleSwitch(key));
  }

  _updatePanel(force = false) {
    const panel = document.getElementById('shilka-panel');
    if (!panel || this.game.player.shilka !== this) return;
    const fc = shilkaFireControl(this.state);
    const phase = shilkaPhase(this.state);
    const txt = [
      phase, this.state.role, this.state.ammo, Math.round(this.state.heat),
      this.state.selectedTargetId, fc && Math.round(fc.rangeM), Math.round(this.state.rangeGateM),
      Math.round(this.aimAzMils), Math.round(this.aimElDeg * 10),
      Math.round(this.state.lockQuality * 100), Math.round(this.state.rangeSolution * 100), Math.round(this.state.leadSolution * 100),
      this.cursorMode ? 'cursor' : 'aim',
    ].join('|');
    if (!force && txt === this._lastPanelText) return;
    this._lastPanelText = txt;

    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    panel.classList.toggle('ready', shilkaSolutionReady(this.state));
    panel.classList.toggle('range-role', this.state.role === SHILKA_ROLES.RANGE);
    set('shilka-phase', phase.toUpperCase().replace(/_/g, ' '));
    set('shilka-role-read', this.state.role === SHILKA_ROLES.ANGLE ? 'X УГЛЫ' : 'C ДАЛЬНОСТЬ');
    set('shilka-mode-read', this.state.searchMode ? this.state.searchMode.toUpperCase() : 'OFF');
    set('shilka-az', formatUglomer(this.aimAzMils));
    set('shilka-el', `${this.aimElDeg.toFixed(1)}°`);
    set('shilka-range', fc ? `${Math.round(fc.rangeM)}m` : '----');
    set('shilka-gate', `${Math.round(this.state.rangeGateM)}m`);
    set('shilka-lead', fc ? `${fc.leadAzMils.toFixed(0)} mil / ${fc.leadElDeg.toFixed(1)}°` : '--');
    set('shilka-ammo', `${this.state.ammo}/${SHILKA_TUNING.ammoMax}`);
    set('shilka-heat', `${Math.round(this.state.heat)}%`);
    set('shilka-target', this.state.selectedTargetId || 'NO TARGET');
    set('shilka-signal', `${Math.round(this.state.radarSignal * 100)}%`);
    set('shilka-quality', `${Math.round(shilkaSolutionQuality(this.state) * 100)}%`);
    set('shilka-help', this.cursorMode ? 'CLICK BUTTONS · CLICK X/C SCREEN FOR MOUSE AIM · E EXIT' : 'MOUSE AIM · LMB FIRE · RMB LOCK · ESC CURSOR · E EXIT');

    for (const [key] of SWITCH_LABELS) {
      const el = document.getElementById(`shilka-sw-${key}`);
      if (el) el.classList.toggle('on', !!this.state[key]);
    }
    const xDot = document.getElementById('shilka-x-dot');
    const cDot = document.getElementById('shilka-c-dot');
    if (xDot) {
      const az = fc ? fc.azimuthMils : this.aimAzMils;
      const r = fc ? clamp(fc.rangeM / this.state.rangeScaleM, 0, 1) : 0.15;
      const a = (az / 6000) * TAU;
      xDot.style.left = `${50 + Math.sin(a) * r * 42}%`;
      xDot.style.top = `${50 - Math.cos(a) * r * 42}%`;
      xDot.classList.toggle('lock', !!this.state.angleLocked);
    }
    if (cDot) {
      const range = fc ? fc.rangeM : this.state.rangeGateM;
      cDot.style.left = `${clamp(range / this.state.rangeScaleM, 0, 1) * 100}%`;
      cDot.classList.toggle('lock', !!this.state.rangeGateLocked);
    }
  }
}

const D2R = Math.PI / 180;
