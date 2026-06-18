import * as THREE from 'three';

// DEV-ONLY perf stress harness. Imported by game.js but NEVER auto-runs — the player must
// call GAME.stress(name) from the console (or load with ?stress to expose it in the F3 help).
// Each scenario sets up an extreme world state, then the normal _frame loop + game.hitch
// (HitchLogger) measure frame-time spikes for `seconds`. Positions are DETERMINISTIC so the
// before/after multi-agent sweep produces comparable numbers (no Math.random / unseeded RNG).
//
// Scenario set is intentionally focused on the audited stutter sources:
//   tolo5            — 5 Tolo bosses at once (first-fire beam/bolt shader-compile + mesh alloc)
//   airdrop          — IL-76 radio supply drop (per-drop clone(true) stall)
//   airfield_airdrop — teleport + airdrop (airfield geometry only present on ?map=steppe; on
//                      other maps this is just an open-ground airdrop, still valid for alloc hitches)
//   waveburst        — spawn a dense ring of grunts in one frame (spawn-position alloc)
//   worstcase        — the owner's report: 5×Tolo + airdrop + a grunt ring together
// NOTE (no silent cut): separate mortar/molotov scenarios are omitted — the molotov FX-light
// churn was already pooled in #95, and the crewed mortar needs seat plumbing to fire headlessly.
// worstcase already exercises shadows (many casters) + the airdrop + boss FX, which is the case
// the owner actually hit.

export function installStress(game) {
  const ring = (n, r, fn) => { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; fn(Math.cos(a) * r, Math.sin(a) * r, i); } };
  const at = (dx, dz) => { const x = game.player.pos.x + dx, z = game.player.pos.z + dz; return new THREE.Vector3(x, game.world.groundY(x, z), z); };
  const spawnBosses = (n) => ring(n, 18, (dx, dz) => game.enemies.spawn('boss', at(dx, dz)));
  const spawnGrunts = (n) => ring(n, 16, (dx, dz) => game.enemies.spawn('grunt', at(dx, dz)));
  const teleport = (x, z) => { game.player.pos.set(x, game.world.groundY(x, z) + 1.7, z); };

  const SC = {
    tolo5() { spawnBosses(5); },
    airdrop() { game.loot.callSupplyDrop(); },
    airfield_airdrop() { teleport(120, -140); game.loot.callSupplyDrop(); },
    waveburst() { spawnGrunts(40); },
    worstcase() { spawnBosses(5); spawnGrunts(20); game.loot.callSupplyDrop(); },
  };

  game.stress = (name, { seconds = 12 } = {}) => {
    if (!SC[name]) { console.warn('[stress] unknown scenario:', name, '— try', Object.keys(SC)); return; }
    if (game.state !== 'playing') { console.warn('[stress] start a run first: GAME.startGame("purge")'); return; }
    game.hitch.reset();
    game._stressName = name;
    game._stressSeconds = seconds;
    game._stressElapsed = 0;
    SC[name]();
    console.log(`[stress] running "${name}" for ${seconds}s…`);
  };
  game.stressScenarios = () => Object.keys(SC);
}
