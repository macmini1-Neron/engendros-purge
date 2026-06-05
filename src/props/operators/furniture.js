// furniture.js — box-only furniture operators (no THREE; unit-testable).

export function drawerStack(b, a, t, o) {
  const { w, h, d, count } = a;
  b.box(w, h, d, o.x, o.y + h / 2, o.z, t.mid);                           // carcass
  const dh = h / count;
  for (let i = 0; i < count; i++) {
    const cy = o.y + dh * (i + 0.5);
    b.box(w * 0.9, dh * 0.82, 0.02, o.x, cy, o.z + d / 2, t.slot);        // recessed drawer front
    b.box(w * 0.32, 0.03, 0.045, o.x, cy, o.z + d / 2 + 0.025, t.bright); // handle
  }
}

export function legs(b, a, t, o) {
  const { w, d, h } = a, lw = a.lw ?? 0.07;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = o.x + sx * (w / 2 - lw / 2 - 0.01);
    const z = o.z + sz * (d / 2 - lw / 2 - 0.01);
    b.box(lw, h, lw, x, o.y + h / 2, z, t.mid);
    b.box(lw, 0.05, lw, x, o.y + h - 0.025, z, t.bright);                 // lit cap
  }
}
