// matrix.js — material × weapon damage rules v0 (spec §2.2, §5).
// PURE: no THREE, no DOM. Graduates into src/destruct.js in phase 2.
import { rayAABBSpan, distToAABB } from './geom.js';

// ── MATERIAL REGISTRY ──────────────────────────────────────────────────────────────────
// HOW TO ADD A MATERIAL: drop one row here. `tier` = hardness 0–N (a hit/blast only bites when
// the weapon's pen / blast.tier ≥ this); `hp` = how much damage a cell soaks before it carves;
// `debris` = which DebrisPool recipe sprays. Then map a buildgen material key → this key in
// building-destruct.js MAT_MAP (or pass a per-object `matMap`). Nothing else to touch — every
// rule below keys off `tier`, so the matrix scales by data alone.
export const MATERIALS = {
  glass:             { tier: 0, hp: 1,    debris: 'shards'  },
  wood:              { tier: 1, hp: 60,   debris: 'splints' },
  sheetmetal:        { tier: 2, hp: 120,  debris: 'panels'  },
  trunk:             { tier: 2, hp: 250,  debris: 'splints' },
  brick:             { tier: 3, hp: 400,  debris: 'rubble'  },
  concrete:          { tier: 4, hp: 900,  debris: 'rubble'  },
  steel:             { tier: 5, hp: 2000, debris: 'sparks'  },
  reinforcedConcrete:{ tier: 6, hp: 6000, debris: 'rubble'  }, // железобетон — bunker: above the whole
                                                               // roster (HE blast.tier ≤4, APFSDS pen 5)
                                                               // ⇒ nothing here scratches it. Crack it by
                                                               // ADDING a pen≥6 / blast.tier≥6 caliber.
};

// ── CALIBER REGISTRY ───────────────────────────────────────────────────────────────────
// HOW TO ADD A CALIBER: drop one row here (and add its key to the demo's WEAPON_ORDER to make it
// selectable). `pen` = penetration tier (bites material tier ≤ pen). `dmg` = hp removed per hit.
// `blast {r1,r2,tier}` ⇒ HE: removes cells of tier ≤ blast.tier within r1, shatters glass within
// r2 — BIGGER r1/r2/tier = destroys more. `through/spall` ⇒ APFSDS drill. Pen classes per spec §5.
export const LAB_WEAPONS = {
  pistol:   { key: 'pistol',   pen: 0, dmg: 8 },
  rifle:    { key: 'rifle',    pen: 1, dmg: 15 },
  hmg127:   { key: 'hmg127',   pen: 2, dmg: 40 },
  heRocket: { key: 'heRocket', pen: 4, dmg: 500,  blast: { r1: 2.5, r2: 6,  tier: 3 } },
  apfsds:   { key: 'apfsds',   pen: 5, dmg: 900,  through: { maxWalls: 4, falloff: 0.6 },
              spall: { range: 6, halfAngle: 0.5 } },
  he152:    { key: 'he152',    pen: 5, dmg: 2000, blast: { r1: 4.5, r2: 11, tier: 4 } }, // 152 mm ОФ — a
              // heavier shell: ~3× the breach radius and cracks CONCRETE (tier 4) too, but still NOT
              // reinforced concrete (tier 6). The scalability demo — bigger caliber wrecks more.
};

// A destructible part. min/max = AABB corners as [x,y,z] arrays.
export function makePart(id, mat, min, max, hpScale = 1) {
  if (!MATERIALS[mat]) throw new Error(`unknown material: ${mat}`);
  return { id, mat, hp: MATERIALS[mat].hp * hpScale, min, max, dead: false };
}

// Hitscan rule: pen < tier ⇒ cosmetic (decal/chip, no hp). Otherwise damage; killed at hp ≤ 0.
// Mutates part.hp and part.dead when pen >= tier.
export function resolveHit(part, weapon) {
  if (part.dead) return { effect: 'cosmetic' };   // already gone — no further damage
  const m = MATERIALS[part.mat];
  if (weapon.pen < m.tier) return { effect: 'cosmetic' };
  part.hp -= weapon.dmg;
  if (part.hp <= 0) part.dead = true;
  return { effect: 'damage', dmg: weapon.dmg, killed: part.dead };
}

// HE blast (spec §5): kills parts with tier ≤ blast.tier within r1 of the closest AABB point;
// additionally shatters ALL glass within r2 (> r1). Mutates parts. Returns id lists.
export function resolveBlast(parts, pos, blast) {
  const killed = [], glass = [];
  for (const part of parts) {
    if (part.dead) continue;
    const d = distToAABB(pos, part.min, part.max);
    const m = MATERIALS[part.mat];
    if (d <= blast.r1 && m.tier <= blast.tier) {
      part.hp = 0; part.dead = true; killed.push(part.id);
    } else if (d <= blast.r2 && part.mat === 'glass') {
      part.hp = 0; part.dead = true; glass.push(part.id);
    }
  }
  return { killed, glass };
}

// APFSDS long-rod (spec §5): no explosion. Ray continues through up to through.maxWalls
// solid parts with dmg *= falloff per wall; entry+exit points recorded (small hole decals);
// a spall cone opens behind every penetrated wall. Glass shatters for free (no wall slot).
// Walls are NOT removed — APFSDS makes holes, not breaches (HE does breaches).
export function resolvePenetration(parts, origin, dir, weapon) {
  const candidates = [];
  for (const part of parts) {
    if (part.dead) continue;
    const span = rayAABBSpan(origin, dir, part.min, part.max);
    if (span) candidates.push({ part, tIn: span.tIn, tOut: span.tOut });
  }
  candidates.sort((a, b) => a.tIn - b.tIn);

  const hits = [], cones = [];
  let dmg = weapon.dmg, walls = 0;
  for (const { part, tIn, tOut } of candidates) {
    if (walls >= weapon.through.maxWalls) break;
    const entry = [origin[0] + dir[0] * tIn, origin[1] + dir[1] * tIn, origin[2] + dir[2] * tIn];
    const exit  = [origin[0] + dir[0] * tOut, origin[1] + dir[1] * tOut, origin[2] + dir[2] * tOut];
    if (part.mat === 'glass') {                      // free pass
      part.hp = 0; part.dead = true;
      hits.push({ id: part.id, tIn, entry, exit, dmg: 0, pierced: true, killed: true });
      continue;
    }
    part.hp = Math.max(0, part.hp - dmg);            // clamp: alive-with-holes is hp 0, never negative
    const pierced = dmg >= MATERIALS[part.mat].hp * 0.5;   // …but rod pierces if it carries enough energy
    hits.push({ id: part.id, tIn, entry, exit, dmg, pierced, killed: false });
    if (!pierced) break;                             // rod absorbed — stops here
    cones.push({ apex: exit, dir: [...dir], range: weapon.spall.range, halfAngle: weapon.spall.halfAngle });
    dmg *= weapon.through.falloff;
    walls++;
  }
  return { hits, cones };
}

// Is point p inside the spall cone?
export function coneContains(cone, p) {
  const v = [p[0] - cone.apex[0], p[1] - cone.apex[1], p[2] - cone.apex[2]];
  const along = v[0] * cone.dir[0] + v[1] * cone.dir[1] + v[2] * cone.dir[2];
  if (along <= 0 || along > cone.range) return false;
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  return Math.acos(Math.min(1, along / len)) <= cone.halfAngle;
}
