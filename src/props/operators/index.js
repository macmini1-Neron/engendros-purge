// index.js — operator name → impl. buildSpec dispatches through this map.
// (index.js is imported only by voxel-interp.js, the THREE side — so re-exporting the
// THREE-bound round operators here does NOT pull `three` into any node-tested module.)
export { bevelBox, panel, plate, finSet, latticeBeam } from './structural.js';
export { drawerStack, legs } from './furniture.js';
export { cylinder, cone, deltaFins, texturedCylinder } from './round.js';
