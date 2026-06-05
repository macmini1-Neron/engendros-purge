// registry-core.js — the model catalog (pure; no THREE). id → spec.
const REG = new Map();

export function registerModel(id, spec) { REG.set(id, spec); }
export function getSpec(id) { return REG.has(id) ? REG.get(id) : null; }
export function hasModel(id) { return REG.has(id); }
export function listModels() { return [...REG.keys()]; }
export function _reset() { REG.clear(); } // test helper
