// main.js — DESTRUCTLAB harness: renderer + camera + shooting + DEMO API.
// Browser-only glue around the pure modules (matrix/fallphys) — spec §8.
import * as THREE from 'three';
import { LAB_WEAPONS, resolveHit, resolveBlast, resolvePenetration, coneContains, MATERIALS } from './matrix.js';
import { buildLab } from './scene.js';
import { rayAABB } from './geom.js';
import { DebrisPool } from './debris.js';
import { makeHinge, stepBody, hingePoint } from './fallphys.js';

const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fb4c4);
scene.fog = new THREE.Fog(0x9fb4c4, 40, 120);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 300);

scene.add(new THREE.HemisphereLight(0xcfd8e8, 0x4a4538, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
sun.position.set(20, 30, 10);
scene.add(sun);

// ground
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshLambertMaterial({ color: 0x6b714f }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
scene.add(new THREE.GridHelper(80, 40, 0x555a44, 0x555a44));

// --- orbit camera (mirrors tools/modelgen/viewer.js pointer pattern) ---
const cam = { yaw: 0.6, pitch: 0.35, dist: 22, target: new THREE.Vector3(0, 1.5, 0) };
function applyCam() {
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(
    cam.target.x + Math.sin(cam.yaw) * cp * cam.dist,
    cam.target.y + sp * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  camera.lookAt(cam.target);
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (e.button === 2) drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.005;
  cam.pitch = Math.max(0.05, Math.min(1.4, cam.pitch + (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
  applyCam();
});
canvas.addEventListener('wheel', (e) => {
  cam.dist = Math.max(4, Math.min(60, cam.dist + e.deltaY * 0.02));
  applyCam(); e.preventDefault();
}, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- weapon panel ---
const hud = document.getElementById('hud');
let weapon = LAB_WEAPONS.rifle;
const buttons = {};
Object.values(LAB_WEAPONS).forEach((w, i) => {
  const b = document.createElement('button');
  b.textContent = `[${i + 1}] ${w.key}  pen ${w.pen} · dmg ${w.dmg}`;
  b.onclick = () => selectWeapon(w.key);
  hud.appendChild(b);
  buttons[w.key] = b;
});
function selectWeapon(key) {
  weapon = LAB_WEAPONS[key];
  Object.values(buttons).forEach(b => b.classList.remove('sel'));
  buttons[key].classList.add('sel');
}
selectWeapon('rifle');
addEventListener('keydown', (e) => {
  const keys = Object.keys(LAB_WEAPONS);
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= keys.length) selectWeapon(keys[n - 1]);
});

const logEl = document.getElementById('log');
const logLines = [];
export function log(msg) {
  logLines.push(msg);
  if (logLines.length > 8) logLines.shift();
  logEl.textContent = logLines.join('\n');
  console.log('[lab]', msg);
}

// --- fire on left click: ray from camera through screen centre (crosshair) ---
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  fire(weapon, camera.position.toArray(), dir.toArray());
});

// fire() lands in Task 7 (scene wiring) — stub for now:
let fire = (w, origin, dir) => log(`fire ${w.key} (no world yet)`);
export function setFire(fn) { fire = fn; }

const lab = buildLab(scene);

const debris = new DebrisPool(scene);
let shotSeed = 1;

// decals: small dark quads at cosmetic/penetration impact points, capped at 64.
// Optional `normal` orients the quad flush to any surface (trees!); without it,
// the legacy z-nudge keeps wall decals at z≈0 working.
const decals = [];
function addDecal(at, color = 0x2c2620, size = 0.12, normal = null) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(at[0], at[1], at[2]);
  if (normal) {
    m.position.set(at[0] + normal[0] * 0.01, at[1] + normal[1] * 0.01, at[2] + normal[2] * 0.01);
    m.lookAt(at[0] + normal[0], at[1] + normal[1], at[2] + normal[2]);
  } else {
    m.position.z += -Math.sign(at[2] || 1) * 0.001 + 0.02;   // legacy: lab walls near z=0
  }
  scene.add(m); decals.push(m);
  if (decals.length > 64) { const old = decals.shift(); scene.remove(old); old.geometry.dispose(); old.material.dispose(); }
}

// --- tree felling (hinge mini-physics) ---
const fallingBodies = [];   // { tree, body }
const MAX_FALLING = 8;      // spec §7 hard cap
const fallQueue = [];

function fellTree(tree, dirXZ, seed) {
  if (tree.fallen) return;
  tree.fallen = true;
  const job = () => {
    const d = tree.def;
    // TODO(phase2): obstacles snapshot at fell time — a wall destroyed mid-fall stays a phantom
    // stop for this trunk. For src/ graduation, filter !p.dead live inside hingeContact instead.
    const obstacles = [...lab.parts.values()]
      .filter(p => !p.dead && p.kind === 'wall')
      .map(p => ({ min: p.min, max: p.max }));
    const body = makeHinge({
      pivot: [d.x, tree.breakY, d.z], dirXZ, seed,
      length: d.trunkH - tree.breakY, radius: d.trunkR, obstacles,
    });
    tree.body = body;
    fallingBodies.push({ tree, body });
  };
  if (fallingBodies.length >= MAX_FALLING) fallQueue.push(job); else job();
}

function handleTreeKills(ids, from) {
  for (const id of ids) {
    const tree = lab.trees.find(t => t.part.id === id);
    if (!tree) continue;
    const dx = tree.def.x - from[0], dz = tree.def.z - from[2];
    const n = Math.hypot(dx, dz) || 1;
    // TODO(phase2-mp): seed must be network-authoritative (host shot counter / part-id hash);
    // shotSeed is a local counter also bumped by debris bursts — fine for the single-client lab only.
    fellTree(tree, [dx / n, dz / n], (shotSeed++ * 2654435761) >>> 0);   // falls AWAY from shooter
  }
}

function alive() { return [...lab.parts.values()].filter(p => !p.dead); }

function nearestHit(origin, dir) {
  let best = null;
  for (const p of alive()) {
    const t = rayAABB(origin, dir, p.min, p.max);
    if (t !== null && (!best || t < best.t)) best = { part: p, t };
  }
  return best;
}

function impactPoint(origin, dir, t) {
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
}

// FX hooks — filled by the debris task; no-ops keep this task self-contained.
let onKilledParts = () => {}, onCosmetic = () => {}, onPenetration = () => {};
export function setFxHooks(h) {
  if (h.onKilledParts) onKilledParts = h.onKilledParts;
  if (h.onCosmetic) onCosmetic = h.onCosmetic;
  if (h.onPenetration) onPenetration = h.onPenetration;
}
setFxHooks({
  onKilledParts(ids, at) {
    for (const id of ids) {
      const p = lab.parts.get(id);
      debris.burst(MATERIALS[p.mat].debris, at ?? p.min, shotSeed++);
    }
  },
  onCosmetic(part, at, dir) {
    addDecal(at, 0x2c2620, 0.12, dir ? dir.map(v => -v) : null);
    debris.burst('sparks', at, shotSeed++);
  },
  onPenetration(res, dir) {                 // dir captured at the call site (resolvePenetration is pure)
    const inN = dir ? dir.map(v => -v) : null;
    for (const h of res.hits) { addDecal(h.entry, 0x141210, 0.18, inN); addDecal(h.exit, 0x141210, 0.26, dir ?? null); }
    if (res.hits[0]) debris.burst('sparks', res.hits[0].entry, shotSeed++);
  },
});

function realFire(w, origin, dir) {
  if (w.blast) {                                            // HE rocket: detonate at first surface
    const hit = nearestHit(origin, dir);
    const at = hit ? impactPoint(origin, dir, hit.t) : impactPoint(origin, dir, 30);
    const res = resolveBlast([...lab.parts.values()], at, w.blast);
    const all = [...res.killed, ...res.glass];
    if (all.length) { perfStats.lastRebuildMs = lab.rebuild(); }
    log(`HE @ [${at.map(v => v.toFixed(1))}] killed: ${all.join(', ') || '—'}`);
    onKilledParts(all, at);
    handleTreeKills(all, at);
    return;
  }
  if (w.through) {                                           // APFSDS
    const res = resolvePenetration([...lab.parts.values()], origin, dir, w);
    for (const t of lab.targets) {
      if (!t.hit && res.cones.some(c => coneContains(c, t.centre))) {
        t.hit = true; t.mesh.material.color.set(0xc04030);   // spalled ply turns red
      }
    }
    const glassKilled = res.hits.filter(h => h.killed).map(h => h.id);
    if (glassKilled.length) perfStats.lastRebuildMs = lab.rebuild();
    onPenetration(res, dir);
    log(`APFSDS pierced ${res.hits.filter(h => h.pierced).length} part(s), ` +
        `${res.cones.length} spall cone(s)`);
    return;
  }
  const hit = nearestHit(origin, dir);                       // plain hitscan
  if (!hit) { log(`${w.key}: miss`); return; }
  const r = resolveHit(hit.part, w);
  const at = impactPoint(origin, dir, hit.t);
  if (r.effect === 'cosmetic') { onCosmetic(hit.part, at, dir); log(`${w.key} → ${hit.part.id}: plink (cosmetic)`); }
  else if (r.killed) {
    if (hit.part.kind !== 'tree') perfStats.lastRebuildMs = lab.rebuild();  // trees never live in the merged mesh
    onKilledParts([hit.part.id], at);
    handleTreeKills([hit.part.id], origin);
    log(`${w.key} → ${hit.part.id}: DESTROYED`);
  } else log(`${w.key} → ${hit.part.id}: ${hit.part.hp}/${MATERIALS[hit.part.mat].hp} hp`);
}
setFire(realFire);

// --- frame loop + perf ring ---
const perfEl = document.getElementById('perf');
const frameTimes = [];
let last = performance.now(), perfTimer = 0;
export const perfStats = { lastRebuildMs: 0, falling: 0, debris: 0 };
const updaters = [];
export function onFrame(fn) { updaters.push(fn); }
onFrame((dt) => { perfStats.debris = debris.update(dt); });

// trees: step every falling hinge body; on settle, freeze + drop static colliders (spec §7)
onFrame((dt) => {
  for (let i = fallingBodies.length - 1; i >= 0; i--) {
    const { tree, body } = fallingBodies[i];
    stepBody(body, dt);
    // pose: rotate the upper mesh around the hinge pivot toward dirXZ
    const axis = new THREE.Vector3(body.dirXZ[1], 0, -body.dirXZ[0]); // perpendicular, horizontal
    tree.upper.setRotationFromAxisAngle(axis, body.angle);
    if (body.settled) {
      fallingBodies.splice(i, 1);
      // settled trunk → ≤ 4 static colliders along the rod (spec §7), visualized as wireframes
      for (const f of [0.2, 0.5, 0.8, 1.0]) {
        const p = hingePoint(body, f);
        const r = Math.max(body.radius, 0.18);
        const min = [p[0] - r * 2, Math.max(p[1] - r * 2, 0), p[2] - r * 2];
        const max = [p[0] + r * 2, p[1] + r * 2, p[2] + r * 2];
        tree.colliders.push({ min, max });
        const helper = new THREE.Box3Helper(
          new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), 0xff8844);
        scene.add(helper);
      }
      log(`${tree.def.id} settled @ ${(body.angle * 180 / Math.PI).toFixed(0)}°`);
      if (fallQueue.length) fallQueue.shift()();
    }
  }
  perfStats.falling = fallingBodies.length;
});

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  frameTimes.push(dt);
  if (frameTimes.length > 120) frameTimes.shift();
  for (const fn of updaters) fn(dt);
  renderer.render(scene, camera);
  perfTimer += dt;
  if (perfTimer > 0.5) { perfTimer = 0; perfEl.textContent = perfText(); }
}

function perfText() {
  const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1);
  const worst = Math.max(...frameTimes);
  return `fps avg ${(1 / avg).toFixed(0)}  min ${(1 / worst).toFixed(0)}\n` +
         `draw calls ${renderer.info.render.calls}\n` +
         `falling ${perfStats.falling}  debris ${perfStats.debris}\n` +
         `last rebuild ${perfStats.lastRebuildMs.toFixed(2)} ms`;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize(); applyCam(); requestAnimationFrame(frame);

// --- DEMO API (programmatic verification, like forest-demo) ---
window.DEMO = {
  perf() {
    const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1);
    return { fpsAvg: +(1 / avg).toFixed(1), fpsMin: +(1 / Math.max(...frameTimes)).toFixed(1),
             calls: renderer.info.render.calls, falling: perfStats.falling,
             debris: perfStats.debris, lastRebuildMs: +perfStats.lastRebuildMs.toFixed(2) };
  },
  // shoot/blast/stress are attached in Tasks 7–10
};

window.DEMO.shoot = (weaponKey, partId) => {
  const p = lab.parts.get(partId);
  if (!p) return `no part ${partId}`;
  const c = [(p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2];
  const o = camera.position.toArray();
  const d = [c[0] - o[0], c[1] - o[1], c[2] - o[2]];
  const n = Math.hypot(...d);
  const dir = d.map(v => v / n);
  const first = nearestHit(o, dir);
  realFire(LAB_WEAPONS[weaponKey], o, dir);
  return { part: partId, hp: p.hp, dead: p.dead, hitId: first ? first.part.id : null };
};
window.DEMO.parts = () => [...lab.parts.values()].map(p => ({ id: p.id, mat: p.mat, hp: p.hp, dead: p.dead }));
window.DEMO.rebuildMs = () => lab.lastRebuildMs;
window.DEMO.fell = (treeId, dir = [0, -1]) => {
  const tree = lab.trees.find(t => t.def.id === treeId);
  if (!tree) return 'no such tree';
  fellTree(tree, dir, 1337);
  return 'falling';
};
// deterministic camera placement — DEMO.shoot rays originate at the camera, so spall-cone
// verification needs a straight-on shot the orbit default can't give.
window.DEMO.setCam = (x, y, z) => { camera.position.set(x, y, z); camera.lookAt(0, 1, 0); return camera.position.toArray(); };
window.DEMO.stress = () => {
  for (const t of lab.trees) fellTree(t, [0.7, 0.7], 99);
  DEMO.shoot('heRocket', 'wall_lo_2');
  DEMO.shoot('heRocket', 'fence_2');
  setTimeout(() => console.log('STRESS RESULT', JSON.stringify(DEMO.perf())), 5000);
  return 'stress running — perf logged in 5 s';
};

const sb = document.createElement('button');
sb.textContent = '☢ STRESS (3 trees + 2 HE)';
sb.onclick = () => DEMO.stress();
hud.appendChild(sb);

export { scene, camera, renderer };
