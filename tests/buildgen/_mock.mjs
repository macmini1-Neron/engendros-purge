// _mock.mjs — shared test recorder mirroring the buildgen recorder interface (pure).
export function mock() {
  const calls = [];
  const errors = [];
  return {
    calls, errors,
    box(w, h, d, x, y, z, o = {}) { calls.push({ kind: 'box', w, h, d, x, y, z, ...o }); },
    wedge(w, h, d, x, y, z, o = {}) { calls.push({ kind: 'wedge', w, h, d, x, y, z, ...o }); },
    prism(w, h, d, x, y, z, o = {}) { calls.push({ kind: 'prism', w, h, d, x, y, z, ...o }); },
    cyl(rBot, rTop, h, x, y, z, o = {}) { calls.push({ kind: 'cyl', rBot, rTop, h, x, y, z, ...o }); },
    pane(w, h, x, y, z, o = {}) { calls.push({ kind: 'pane', w, h, x, y, z, ...o }); },
    propRef(model, x, y, z, yaw = 0) { calls.push({ kind: 'propRef', model, x, y, z, yaw }); },
    error(m) { errors.push(m); },
  };
}

// A standard little test building context (8×6, one 3 m storey, 0.3 m walls).
export function ctx(over = {}) {
  return {
    origin: { x: 0, y: 0, z: 0 },
    mat: null,
    footprint: { w: 8, h: 4.2, d: 6 },
    storeys: [{ y: 0, h: 3 }],
    materials: { wall: 'brickRed', roof: 'corrugatedTin', trim: 'concrete', glass: 'glassPane', floor: 'concrete' },
    topY: 3,
    wallT: 0.3,
    openings: () => [],
    collide: true,
    ...over,
  };
}
