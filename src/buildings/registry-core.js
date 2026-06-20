// registry-core.js — the building catalog (pure; no THREE). id → spec.
const REG = new Map();

export function registerBuilding(id, spec) { REG.set(id, spec); }
export function getBuildingSpec(id) { return REG.has(id) ? REG.get(id) : null; }
export function hasBuilding(id) { return REG.has(id); }
export function listBuildings() { return [...REG.keys()]; }
export function _reset() { REG.clear(); } // test helper
