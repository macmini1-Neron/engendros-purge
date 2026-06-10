import test from 'node:test';
import assert from 'node:assert/strict';
import { rotatedBuilder } from '../../src/props/rotated-builder.js';

function mock() {
  const calls = [];
  return { calls, box: (w, h, d, x, y, z, color, opts) => calls.push({ w, h, d, x, y, z, color, opts }) };
}

test('+90° about Y orbits a box from -Z to -X of the part origin and tags the rotation', () => {
  const m = mock();
  const rb = rotatedBuilder(m, { x: 1, y: 0, z: 0 }, [0, 90, 0]);
  rb.box(0.2, 0.1, 0.05, 1, 0, -0.5, '#abc');          // emitted half a metre in front of the origin
  const c = m.calls[0];
  assert.ok(Math.abs(c.x - 0.5) < 1e-9 && Math.abs(c.z - 0) < 1e-9, `centre orbits to -X (got ${c.x},${c.z})`);
  assert.ok(Math.abs(c.opts.ry - Math.PI / 2) < 1e-9, 'box carries the rotation in radians');
});

test('zero rotation is a pass-through', () => {
  const m = mock();
  rotatedBuilder(m, { x: 0, y: 0, z: 0 }, [0, 0, 0]).box(1, 1, 1, 0.2, 0.3, 0.4, '#abc');
  const c = m.calls[0];
  assert.deepEqual([c.x, c.y, c.z], [0.2, 0.3, 0.4]);
});

test('180° about Y mirrors x and z about the origin', () => {
  const m = mock();
  rotatedBuilder(m, { x: 0, y: 0, z: 0 }, [0, 180, 0]).box(1, 1, 1, 0.1, 0, 0.3, '#abc');
  const c = m.calls[0];
  assert.ok(Math.abs(c.x + 0.1) < 1e-9 && Math.abs(c.z + 0.3) < 1e-9);
});

test('geo() is forwarded with the part rotation (round ops survive part rot)', () => {
  const calls = [];
  const m = { box: () => {}, geo: (g, x, y, z, color, opts) => calls.push({ g, x, y, z, opts }) };
  rotatedBuilder(m, { x: 0, y: 0, z: 0 }, [0, 90, 0]).geo('GEO', 0, 0, -0.5, '#abc', { tint: 0.02 });
  assert.equal(calls.length, 1);
  assert.ok(Math.abs(calls[0].x + 0.5) < 1e-9, 'geo position orbits the origin');
  assert.equal(calls[0].opts.tint, 0.02, 'non-rotation opts pass through');
});

test('operator-given orientation COMPOSES with the part rotation (matrix, not angle addition)', () => {
  // a +Y cylinder oriented to +Z by the op (rx 90°), then the part rotated ry 90° → axis must end up +X
  const calls = [];
  const m = { box: () => {}, geo: (g, x, y, z, color, opts) => calls.push(opts) };
  rotatedBuilder(m, { x: 0, y: 0, z: 0 }, [0, 90, 0]).geo('GEO', 0, 0, 0, '#abc', { rx: Math.PI / 2 });
  const { rx, ry, rz } = calls[0];
  // apply the composed euler (XYZ) to the local +Y axis and check it lands on +X
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  const R = [cy * cz, -cy * sz, sy, cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy, sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy];
  const v = [R[1], R[4], R[7]];                     // R · (0,1,0)
  assert.ok(Math.abs(v[0] - 1) < 1e-9 && Math.abs(v[1]) < 1e-9 && Math.abs(v[2]) < 1e-9,
    `+Y axis should map to +X (got ${v.map((n) => n.toFixed(3))})`);
});
