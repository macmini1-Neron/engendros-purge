// refs.js — reuse operators (pure).

// Insert a registered modelgen prop (the gatehouse lesson: interiors are COMPOSED from props,
// not modelled inline). Validation (existence, anchor-zone fit, scale=1, doorway clearance)
// is law 12 — the validator's job, not the emitter's.
export function propRef(b, a, ctx) {
  const o = ctx.origin;
  b.propRef(a.model, o.x, o.y, o.z, a.yaw ?? 0);
}

// `repeat` is a plan-time macro — the compiler expands it into N copies of args.part stepped
// by args.step BEFORE anything runs. Reaching this impl means the expansion didn't happen.
export function repeat(b) {
  b.error?.('repeat: must be expanded by the plan compiler — never emitted directly');
}
