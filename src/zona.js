// zona.js — «ЗОНА 704» scene builder (THREE-bound). Consumes the zona-plan.js registry + the final
// terrain heightfield and builds the network/cadastre meshes: draped road+rail ribbons, water planes,
// gate blockades, ЛЭП pole lines, parcel signposts. world.js calls buildZona(world) from _buildZona().
// Skeleton scope: NO buildings, NO water mechanics, NO gate-opening logic (later specs).
import { lintPlan } from './zona-plan.js';

export function buildZona(world) {
  // fail-loud plan validation at boot (spec §7): errors mean the registry drifted from the master plan.
  const { errors, warnings } = lintPlan();
  for (const e of errors) console.error('[zona-plan]', e);
  for (const w of warnings) console.warn('[zona-plan]', w);
}
