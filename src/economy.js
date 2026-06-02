// economy.js — extracted from game.js during the module split (mechanical move, no logic changes).


// ---------------------------------------------------------------------------
// Economy payouts — rarity removed (flat stats). Former key drops convert to a small cash bonus; supply drops grant cash.
// ---------------------------------------------------------------------------
export const KEY_CASH = 60, KILL_CASH = 3, SUPPLY_CASH = 600;

// Fortification pieces the player places (held like weapons; material comes from supply drops).
// sandbag/wood are HARD walls (an AABB in World.boxes); wire is a non-blocking HAZARD zone (slow+DoT, breaks under trample).
export const STRUCT_CAP = 44; // perf cap — World.boxes + per-enemy collision loops are O(n) each frame
export const STRUCT_DEFS = {
  sandbag: { hp: 900, w: 2.2, h: 1.0, d: 0.7, hard: true,  rotStep: Math.PI / 12, label: 'Sandbags' },     // tanky low cover; shoot over the top
  wood:    { hp: 420, w: 2.4, h: 1.5, d: 0.4, hard: true,  rotStep: Math.PI / 12, label: 'Barricade' },    // full wall, blocks LoS, breaks faster
  wire:    { hp: 260, w: 2.4, h: 0.8, d: 1.2, hard: false, rotStep: Math.PI / 12, label: 'Barbed Wire',    // hazard zone: slow + damage, trampled down under pressure
             slow: 0.35, dot: 14, trample: 35 },
  radio:   { hp: 200, w: 1.25, h: 0.9, d: 0.7, hard: false, prop: true, audio: true,
             rotStep: Math.PI / 12, label: 'Radio', max: 4 }, // diegetic music prop; enemies ignore it (hard:false)
};
