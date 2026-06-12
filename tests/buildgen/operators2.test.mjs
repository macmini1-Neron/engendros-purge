// operators2.test.mjs — roof/facade/landmark/sign/ref operators + the SAMPLES
// extents-containment property (every emitted prim stays inside its operator's declared AABB).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock, ctx } from './_mock.mjs';
import { OPS, EXTENTS, openingsOf } from '../../src/buildings/operators/index.js';
import { faceFrame } from '../../src/buildings/operators/_math.js';

// One realistic arg set per operator (the modelgen SAMPLES pattern). The shared test spec is
// 8×6 m, one 3 m storey, 0.3 m walls (tests/_mock ctx()).
const SAMPLES = {
  shellBox: { wall: 0.3 },
  floorSlab: { storey: 1 },
  interiorWall: { len: 4, h: 3, t: 0.2, axis: 'x' },
  column: { w: 0.4, d: 0.4, h: 3 },
  stairs: { steps: 5, rise: 0.3, run: 0.3, width: 1.2, dir: 'N' },
  flatRoof: { t: 0.2 },
  gableRoof: { rise: 1.2 },
  hipRoof: { rise: 1.2 },
  sawtoothRoof: { teeth: 4, rise: 1.0, glazed: true },
  parapet: { h: 0.8, t: 0.2 },
  windowBays: { face: 'S', count: 2, module: { w: 1.2, h: 1.4, sill: 0.9 }, glass: true },
  doorway: { face: 'N', width: 1.6, height: 2.2 },
  gateOpening: { face: 'E', width: 3.0, height: 2.8 },
  cornice: { h: 0.3, proud: 0.1 },
  pilaster: { face: 'N', w: 0.4, proud: 0.06, count: 3 },
  chimney: { rBase: 0.8, rTop: 0.5, h: 12 },
  waterTank: { r: 1.5, h: 2, legH: 4 },
  mast: { r: 0.1, h: 8 },
  sign: { face: 'N', w: 2, h: 0.5, text: 'ПРОВЕРКА' },
  stencil: { face: 'N', w: 1, h: 0.3, text: 'ЦЕХ №3' },
  propRef: { model: 'desk' },
};

const SAMPLE_CTX = {
  floorSlab: { storeys: [{ y: 0, h: 3 }, { y: 3, h: 3 }], topY: 6 },
};

const SAMPLE_SPEC = (op) => ({
  footprint: { w: 8, h: 4.2, d: 6 },
  storeys: SAMPLE_CTX[op]?.storeys ?? [{ y: 0, h: 3 }],
});

function primAABB(c) {
  switch (c.kind) {
    case 'box': case 'wedge': case 'prism':
      return { min: [c.x - c.w / 2, c.y - c.h / 2, c.z - c.d / 2], max: [c.x + c.w / 2, c.y + c.h / 2, c.z + c.d / 2] };
    case 'cyl': {
      const r = Math.max(c.rBot, c.rTop);
      return { min: [c.x - r, c.y - c.h / 2, c.z - r], max: [c.x + r, c.y + c.h / 2, c.z + r] };
    }
    case 'pane': {
      const hx = c.ry ? 0.01 : c.w / 2, hz = c.ry ? c.w / 2 : 0.01;
      return { min: [c.x - hx, c.y - c.h / 2, c.z - hz], max: [c.x + hx, c.y + c.h / 2, c.z + hz] };
    }
    default: return null;   // propRef — bounds live in the prop's own spec (law 12)
  }
}

test('PROPERTY: every emitted prim stays inside its operator extents (SAMPLES sweep)', () => {
  for (const [op, args] of Object.entries(SAMPLES)) {
    const b = mock();
    OPS[op](b, args, ctx(SAMPLE_CTX[op] ?? {}));
    assert.equal(b.errors.length, 0, `${op}: emitter errors ${b.errors}`);
    const ext = EXTENTS[op](args, SAMPLE_SPEC(op));
    for (const c of b.calls) {
      const a = primAABB(c);
      if (!a) continue;
      for (let i = 0; i < 3; i++) {
        assert.ok(a.min[i] >= ext.min[i] - 1e-6 && a.max[i] <= ext.max[i] + 1e-6,
          `${op}: a ${c.kind} prim escapes the declared extents on axis ${i} (${a.min[i]}..${a.max[i]} vs ${ext.min[i]}..${ext.max[i]})`);
      }
    }
  }
});

test('gableRoof → one prism, apex at topY + rise', () => {
  const b = mock();
  OPS.gableRoof(b, SAMPLES.gableRoof, ctx());
  assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].kind, 'prism');
  assert.ok(Math.abs((b.calls[0].y + b.calls[0].h / 2) - 4.2) < 1e-9);
  assert.equal(b.calls[0].axis, 'x', 'ridge along the longer footprint axis');
});

test('hipRoof → centre prism + 2 end wedges, hi edges face inward', () => {
  const b = mock();
  OPS.hipRoof(b, SAMPLES.hipRoof, ctx());
  const prisms = b.calls.filter((c) => c.kind === 'prism');
  const wedges = b.calls.filter((c) => c.kind === 'wedge');
  assert.equal(prisms.length, 1);
  assert.equal(wedges.length, 2);
  const [wWest, wEast] = wedges[0].x < wedges[1].x ? wedges : [wedges[1], wedges[0]];
  assert.equal(wWest.hi, 'E', 'west wedge rises toward the interior');
  assert.equal(wEast.hi, 'W', 'east wedge rises toward the interior');
});

test('sawtoothRoof → teeth wedges all hi:N (north light) + a glass pane per tooth when glazed', () => {
  const b = mock();
  OPS.sawtoothRoof(b, SAMPLES.sawtoothRoof, ctx());
  const wedges = b.calls.filter((c) => c.kind === 'wedge');
  const panes = b.calls.filter((c) => c.kind === 'pane');
  assert.equal(wedges.length, 4);
  assert.ok(wedges.every((w) => w.hi === 'N'));
  assert.equal(panes.length, 4);
});

test('parapet → 4-box ring, no volume overlap, collidable', () => {
  const b = mock();
  OPS.parapet(b, SAMPLES.parapet, ctx());
  assert.equal(b.calls.length, 4);
  assert.ok(b.calls.every((c) => c.collide === true));
});

test('ZUB PROPERTY: windowBays modules are identical and mirror-symmetric on the face', () => {
  const f = faceFrame('S', { w: 8, d: 6 }, 0.3);
  const opens = openingsOf({ op: 'windowBays', args: { face: 'S', count: 3, module: { w: 1.2, h: 1.4, sill: 0.9 } } }, f, { storeys: [{ y: 0, h: 3 }] });
  assert.equal(opens.length, 3);
  for (const o of opens) {
    assert.ok(Math.abs((o.u1 - o.u0) - 1.2) < 1e-9 && Math.abs((o.v1 - o.v0) - 1.4) < 1e-9, 'every module identical');
  }
  for (let i = 0; i < opens.length; i++) {
    const a = (opens[i].u0 + opens[i].u1) / 2;
    const z = (opens[opens.length - 1 - i].u0 + opens[opens.length - 1 - i].u1) / 2;
    assert.ok(Math.abs(a + z - f.L) < 1e-9, `window ${i} not mirrored around the face centre`);
  }
});

test('windowBays on an upper storey lifts the cut by the storey base elevation', () => {
  const f = faceFrame('S', { w: 8, d: 6 }, 0.3);
  const spec = { storeys: [{ y: 0, h: 3 }, { y: 3, h: 3 }] };
  const opens = openingsOf({ op: 'windowBays', args: { face: 'S', count: 1, storey: 1, module: { w: 1.2, h: 1.4, sill: 0.9 } } }, f, spec);
  assert.ok(Math.abs(opens[0].v0 - 3.9) < 1e-9, 'sill at storey y + sill');
});

test('doorway opening rect starts at the floor (v0 = 0) and is centred + offset', () => {
  const f = faceFrame('N', { w: 8, d: 6 }, 0.3);
  const opens = openingsOf({ op: 'doorway', args: { width: 1.6, height: 2.2, offset: 1.0 } }, f, {});
  assert.equal(opens.length, 1);
  assert.equal(opens[0].v0, 0);
  assert.ok(Math.abs((opens[0].u0 + opens[0].u1) / 2 - 5.0) < 1e-9, 'centred at L/2 + offset');
});

test('windowBays emits 4 frame strips per window + a pane when glass', () => {
  const b = mock();
  OPS.windowBays(b, SAMPLES.windowBays, ctx());
  const boxes = b.calls.filter((c) => c.kind === 'box');
  const panes = b.calls.filter((c) => c.kind === 'pane');
  assert.equal(boxes.length, 8, '4 strips × 2 windows');
  assert.equal(panes.length, 2);
  assert.ok(boxes.every((c) => c.detail === true && c.collide === false), 'frames are visual detail');
});

test('landmarks: chimney 2 cyls, waterTank 4 legs + 2 cyls, mast 1 cyl', () => {
  const b = mock();
  OPS.chimney(b, SAMPLES.chimney, ctx());
  assert.equal(b.calls.filter((c) => c.kind === 'cyl').length, 2);
  const b2 = mock();
  OPS.waterTank(b2, SAMPLES.waterTank, ctx());
  assert.equal(b2.calls.filter((c) => c.kind === 'box').length, 4);
  assert.equal(b2.calls.filter((c) => c.kind === 'cyl').length, 2);
  const b3 = mock();
  OPS.mast(b3, SAMPLES.mast, ctx());
  assert.equal(b3.calls.length, 1);
});

test('sign carries its Cyrillic text on the prim; stencil is a thin detail appliqué', () => {
  const b = mock();
  OPS.sign(b, SAMPLES.sign, ctx());
  OPS.stencil(b, SAMPLES.stencil, ctx());
  assert.equal(b.calls.length, 2);
  assert.equal(b.calls[0].text, 'ПРОВЕРКА');
  assert.ok(b.calls[1].detail === true && b.calls[1].d <= 0.01);
});

test('propRef emits a reference record; repeat refuses direct emission', () => {
  const b = mock();
  OPS.propRef(b, { model: 'desk', yaw: 90 }, ctx({ origin: { x: 2, y: 0, z: -1 } }));
  assert.deepEqual(b.calls[0], { kind: 'propRef', model: 'desk', x: 2, y: 0, z: -1, yaw: 90 });
  OPS.repeat(b, { count: 3, part: {} }, ctx());
  assert.ok(b.errors.some((e) => e.includes('expanded by the plan compiler')));
});

export { SAMPLES, SAMPLE_CTX, SAMPLE_SPEC, primAABB };
