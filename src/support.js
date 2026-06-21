// support.js — gravity-collapse pass: after a host dig, drop anything the excavation just undermined
// so nothing floats Minecraft-style. THREE-free glue over the pure predicate `isUndermined` (dig.js);
// the actual fall physics is REUSED from the existing host-auth destruction paths.
//
// One world.grid.queryAABB over the dug rect returns every collapsible candidate (each collider is
// flagged by its owner: box.tree / box.prop / box.struct / box.building). A resolver maps each to a
// uniform Supportable { footprint, baseY, collapse(prim) }; if isUndermined, we collapse it through
// the object's OWN host-auth path (which already syncs to co-op clients):
//   tree  → forest.fellTree   (FallingBody hinge that settles on the dug terrain → falls INTO the hole)
//   prop  → forest.destroyProp
//   struct→ build.destroyStructure   (sandbags / wire)
//   building wall → demoBuilding.collapseFootprint   (M3)
// Clients NEVER run this scan — they receive the OUTCOMES over forestfx / propdie / structdie / bcollapse.

import { isUndermined } from './dig.js';

export class SupportScan {
  constructor(game) {
    this.game = game;
    this._seq = 0; // bumped per scan; mixed into building-collapse seeds for deterministic faller replay
  }

  // Host-only. rect = the dug XZ AABB {minx,minz,maxx,maxz}; prim = the carved primitive (centre).
  run(rect, prim) {
    const world = this.game.world;
    if (!world || !world.grid || !world.terrain) return;
    this._seq++;
    const terr = world.terrain;
    const hAt = (x, z) => terr.terrainHeightAt(x, z);
    // queryAABB returns a fresh array of box refs; collapsing mutates world.boxes/grid, not this list,
    // so iterating it while collapsing is safe.
    const boxes = world.grid.queryAABB(rect.minx, rect.minz, rect.maxx, rect.maxz);
    for (let i = 0; i < boxes.length; i++) {
      const s = this._resolve(boxes[i]);
      if (!s) continue;
      if (!isUndermined(hAt, s.footprint, s.baseY)) continue;
      s.collapse(prim);
    }
    // building walls: footprint-based (the merged-mesh building has no per-box faller) — M3 fills this in;
    // until then the guard makes it a no-op.
    const b = world.demoBuilding;
    if (b && typeof b.collapseFootprint === 'function') b.collapseFootprint(rect, this._seedAt(prim));
  }

  _fp(box) { return { minx: box.min.x, minz: box.min.z, maxx: box.max.x, maxz: box.max.z }; }

  // Deterministic seed for a collapse at this spot (host + client must derive the same faller motion).
  _seedAt(prim) { return ((Math.round(prim.x * 7.31) ^ Math.round(prim.z * 13.17) ^ (this._seq * 2654435761)) >>> 0); }

  // Fall direction: from the object toward the crater centre, so it topples INTO the hole. Returns null
  // (→ a random seeded lean) when the dig is right under it.
  _dirInto(prim, pos) {
    const dx = prim.x - pos.x, dz = prim.z - pos.z, n = Math.hypot(dx, dz);
    return n > 0.3 ? [dx / n, dz / n] : null;
  }

  _resolve(box) {
    const forest = this.game.forest, build = this.game.build;
    if (box.tree && box.downer && box.downer.standing && forest) {
      const tree = box.downer;
      return {
        footprint: this._fp(box), baseY: tree.part.min[1],
        collapse: (prim) => forest.fellTree(tree, this._dirInto(prim, tree.pos), (tree.id * 2654435761) >>> 0),
      };
    }
    if (box.prop && box.downer && !box.downer.dead && forest) {
      const rec = box.downer;
      return {
        footprint: this._fp(box), baseY: rec.part.min[1],
        collapse: () => forest.destroyProp(rec, [rec.pos.x, rec.pos.y, rec.pos.z]),
      };
    }
    if (box.struct && box._ref && build) {
      const s = box._ref;
      return { footprint: this._fp(box), baseY: s.pos.y, collapse: () => build.destroyStructure(s, 'undermine') };
    }
    return null; // building boxes → collapseFootprint (M3); unknown boxes ignored
  }
}
