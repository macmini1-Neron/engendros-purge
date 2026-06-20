// index.js — operator dispatch table for the plan compiler. ALL pure (no THREE anywhere
// under src/buildings/operators/ — unlike modelgen, even roofs/cylinders are neutral records,
// because law 4 must validate in node).
import { shellBox, floorSlab, interiorWall, column, stairs } from './shell.js';
import { flatRoof, gableRoof, hipRoof, sawtoothRoof, parapet } from './roof.js';
import { windowBays, doorway, gateOpening, cornice, pilaster } from './facade.js';
import { chimney, waterTank, mast } from './landmark.js';
import { sign, stencil } from './sign.js';
import { propRef, repeat } from './refs.js';

export const OPS = {
  shellBox, floorSlab, interiorWall, column, stairs,
  flatRoof, gableRoof, hipRoof, sawtoothRoof, parapet,
  windowBays, doorway, gateOpening, cornice, pilaster,
  chimney, waterTank, mast,
  sign, stencil,
  propRef, repeat,
};

export { openingsOf } from './facade.js';
export { MANIFEST, operatorNames } from './manifest.js';
export { EXTENTS } from './extents.js';
