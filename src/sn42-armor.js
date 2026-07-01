// sn42-armor.js — pure decision logic for the СН-42 steel cuirass (Стальной нагрудник) worn by the
// "armored" engendro. NO THREE / NO DOM on purpose: the caller passes plain scalars, so the rule that
// decides "does this hit ring off the plate?" stays unit-testable in isolation (mirrors dismember-core.js).
//
// The mechanic: the cuirass covers the FRONT of the chest only, and has its OWN precise capsule hitbox
// (built in enemies.js makeArmored, raycast in rayHit) — so `plateHit` is true ONLY when a shot actually
// strikes the steel. A pistol/SMG/buckshot round that hits the plate rings off (no body damage) and chips
// it; after PLATE_HITS such hits the plate shatters off. A round that MISSES the plate (head, flank, back,
// legs) takes normal damage with no sparks. A round whose CALIBER defeats the cuirass (rifle+, .50-cal,
// RPG/APFSDS — source 'ap' / blast) punches clean through (full damage) and wrecks the plate in one go.
// Caliber realism (SN-42 = 2 mm 36СГН steel): it stopped 9mm/.45 pistol & SMG fire + shrapnel, but NOT
// full-power rifle rounds — so weapons.js tags rifle/sniper/launcher/cannon/magnum hits as source 'ap'.

export const SN42 = {
  PLATE_HITS: 6,    // pistol/SMG/buckshot hits the cuirass soaks before it shatters off the mob
};

// Sources whose caliber defeats the plate outright — full damage AND the plate is wrecked.
// 'ap' = rifle/sniper/launcher/cannon/magnum + the rooftop .50-cal (tagged in weapons.js); blast/crush bypass.
const AP_SOURCES = { ap: true, explosion: true, rocket: true, crush: true };

export function isArmorPiercing(source) { return !!AP_SOURCES[source]; }

// Decide what the cuirass does for ONE hit. Pure — returns the body damage to apply + flags, mutates nothing.
//   plateHit   : the ray actually struck the cuirass capsule (1:1 geometry test done by the caller)
//   plateHits  : hits the plate has left before it shatters
//   amount     : incoming body damage
//   ap         : isArmorPiercing(source) — caliber punches through the steel
//   chip       : how much plate integrity this blocked hit removes (default 1). The caller passes 0 for the
//                extra pellets of ONE shotgun blast (all land the same frame) so a single point-blank blast
//                counts as a single dent — else its 9–12 pellets would shatter the "rings-off" plate at once.
// → { blocked, penetrate, plateBreak, damage, plateHitsLeft }
export function resolveArmorHit({ plateHit, plateHits, amount, ap, chip = 1 }) {
  if (!plateHit) {                          // shot missed the plate → cuirass irrelevant, full damage, no sparks
    return { blocked: false, penetrate: false, plateBreak: false, damage: amount, plateHitsLeft: plateHits };
  }
  if (ap) {                                 // rifle+/.50/RPG/blast → punches clean through: full damage, plate destroyed
    return { blocked: false, penetrate: true, plateBreak: true, damage: amount, plateHitsLeft: 0 };
  }
  const left = plateHits - chip;            // pistol/SMG/buckshot → rings off the steel: no body damage, plate chipped
  return { blocked: true, penetrate: false, plateBreak: left <= 0, damage: 0, plateHitsLeft: left };
}
