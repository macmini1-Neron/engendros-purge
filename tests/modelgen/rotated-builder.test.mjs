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
