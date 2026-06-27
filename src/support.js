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
  }

  // Host-only. rect = the dug XZ AABB {minx,minz,maxx,maxz}; prim = the carved primitive (centre).
  run(rect, prim) {
    const world = this.game.world;
    if (!world || !world.grid || !world.terrain) return;
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
    // building walls: hand off to the building's own voxel-cell orphan-collapse — digging out a grounded
    // base cell's foundation un-supports it and the engine caves what's above (demo: DemoBuilding; forest:
    // the ForestScene facade fans to every BuildingDestruct). One call covers both maps.
    const b = world.demoBuilding;
    if (b && typeof b.undermine === 'function') b.undermine(rect);
  }

  _fp(box) { return { minx: box.min.x, minz: box.min.z, maxx: box.max.x, maxz: box.max.z }; }

  // Fall direction: from the object toward the crater centre, so it topples INTO the hole. Returns null
  // (→ a random seeded lean) when the dig is right under it.
  _dirInto(prim, pos) {
    const dx = prim.x - pos.x, dz = prim.z - pos.z, n = Math.hypot(dx, dz);
    return n > 0.3 ? [dx / n, dz / n] : null;
  }

  _resolve(box) {
    const forest = this.game.forest, build = this.game.build;
    if (box.tree && box.downer && box.downer.standing && forest && typeof forest.fellTree === 'function') {
      const tree = box.downer;
      // Forest (demo) trees carry .pos{x,y,z}; ForestDemo (forest map) trees carry .x/.z directly.
      const tx = tree.pos ? tree.pos.x : tree.x, tz = tree.pos ? tree.pos.z : tree.z;
      const baseY = (tree.part && tree.part.min) ? tree.part.min[1] : box.min.y;
      return {
        footprint: this._fp(box), baseY,
        collapse: (prim) => {
          if (tree.part) tree.part.dead = true;             // ForestDemo expects the caller to retire the part (Forest does it itself — idempotent)
          // breakAt 0 = UPROOT: the whole tree (root and all) topples into the hole, leaving no floating stump.
          forest.fellTree(tree, this._dirInto(prim, { x: tx, z: tz }), (tree.id * 2654435761) >>> 0, null, 0);
        },
      };
    }
    // a DOWNED log/chunk whose ground was dug out from under it → drop it onto the new (lower) terrain.
    if (box.tree && box.downer && box.downer.fallen && forest && typeof forest.regroundLog === 'function') {
      const log = box.downer;
      return { footprint: this._fp(box), baseY: box.min.y, collapse: () => forest.regroundLog(log, true) }; // emit → clients re-ground the same log (dig has no deterministic client replay)
    }
    if (box.prop && box.downer && !box.downer.dead && forest && typeof forest.destroyProp === 'function') {
      const rec = box.downer;
      const px = rec.pos ? rec.pos.x : rec.x, py = rec.pos ? rec.pos.y : (rec.y || 0), pz = rec.pos ? rec.pos.z : rec.z;
      const baseY = (rec.part && rec.part.min) ? rec.part.min[1] : box.min.y;
      return { footprint: this._fp(box), baseY, collapse: () => forest.destroyProp(rec, [px, py, pz]) };
    }
    if (box.struct && box._ref && build) {
      const s = box._ref;
      return { footprint: this._fp(box), baseY: s.pos.y, collapse: () => build.destroyStructure(s, 'undermine') };
    }
    return null; // building boxes → collapseFootprint (M3); unknown boxes ignored
  }
}
