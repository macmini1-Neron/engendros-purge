// plan.js — spec → flat build plan (pure; no THREE). Assumes the spec already
// passed validateSpec(). Resolves each part's material to voxel tones and
// normalizes placement, so the THREE executor stays a thin loop.
import { resolveMaterial } from './palette.js';

export function planBuild(spec, target = 'voxel') {
  const ops = (spec.parts || []).map((p) => ({
    op: p.op,
    args: p.args,
    mat: p.mat,
    tones: resolveMaterial(p.mat, target),
    origin: { x: p.at?.[0] ?? 0, y: p.at?.[1] ?? 0, z: p.at?.[2] ?? 0 },
    rot: { x: p.rot?.[0] ?? 0, y: p.rot?.[1] ?? 0, z: p.rot?.[2] ?? 0 },
    rig: p.rig ?? null,
  }));
  return { id: spec.id, ops, rig: spec.rig ?? [], footprint: spec.footprint ?? null };
}
