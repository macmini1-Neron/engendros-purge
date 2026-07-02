import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZonaHeightFn, roadProfiles } from '../../src/zona-terrain.js';
import { ROADS } from '../../src/zona-plan.js';

test('longitudinal slope along every road ≤ maxSlope + eps', () => {
  const profs = roadProfiles(704);
  for (const road of ROADS) {
    const p = profs.get(road.id);
    assert.ok(p, `${road.id} profile missing`);
    for (let i = 1; i < p.arc.length; i++) {
      const slope = Math.abs(p.h[i] - p.h[i - 1]) / (p.arc[i] - p.arc[i - 1]);
      assert.ok(slope <= road.maxSlope + 0.005, `${road.id}@${p.arc[i] | 0}m slope=${slope.toFixed(3)}`);
    }
  }
});

test('terrain equals the profile on the centreline', () => {
  const h = makeZonaHeightFn(704);
  const profs = roadProfiles(704);
  const r1 = profs.get('R1');
  // the rozcestí vertex of R1 — a point exactly on the centreline
  const [x, z] = [-340, -540];
  const idx = r1.pts.findIndex(([px, pz]) => px === x && pz === z);
  assert.ok(idx >= 0);
  const sAtVertex = r1.vertArc[idx];
  // profile height lerped at that arc position
  let k = 1; while (k < r1.arc.length - 1 && r1.arc[k] < sAtVertex) k++;
  const t = (sAtVertex - r1.arc[k - 1]) / (r1.arc[k] - r1.arc[k - 1]);
  const hp = r1.h[k - 1] + (r1.h[k] - r1.h[k - 1]) * t;
  assert.ok(Math.abs(h(x, z) - hp) < 0.3, `center ${h(x, z)} vs profile ${hp}`);
});

test('corridor blends out past the shoulder (plain stretch, far from stamps)', () => {
  const h = makeZonaHeightFn(704);
  // R1 segment (-760,-760)→(-600,-660) midpoint ≈ (-680,-710); 60 m perpendicular off it is open steppe
  const on = h(-680, -710);
  const off = h(-680 + 60 * 0.53, -710 - 60 * 0.85); // ⊥ of segment dir (160,100)/189 ≈ (0.85,0.53) → ⊥ (0.53,-0.85)
  assert.ok(Number.isFinite(on) && Number.isFinite(off));
  // no cliff between road and steppe — the blend keeps the delta bounded by the local relief scale
  assert.ok(Math.abs(on - off) < 12, `road ${on} vs steppe ${off}`);
});

test('T5 ridge scrambles stay walkable: path slope ≤ 30% along the line', () => {
  const profs = roadProfiles(704);
  for (const id of ['T5A', 'T5B']) {
    const p = profs.get(id);
    for (let i = 1; i < p.arc.length; i++) {
      const slope = Math.abs(p.h[i] - p.h[i - 1]) / (p.arc[i] - p.arc[i - 1]);
      assert.ok(slope <= 0.30 + 0.005, `${id}@${p.arc[i] | 0}m slope=${slope.toFixed(3)}`);
    }
  }
});

test('corridors stay deterministic', () => {
  const a = makeZonaHeightFn(704), b = makeZonaHeightFn(704);
  for (const [x, z] of [[-340, -540], [-470, -620], [940, 370], [820, -560]]) assert.equal(a(x, z), b(x, z));
});
