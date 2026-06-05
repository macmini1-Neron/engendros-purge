// manifest.js — operator vocabulary as pure data (no impl, no THREE).
//   args: required arg keys.
//   dims: the subset of args that are REAL-WORLD dimensions → any part using this
//         operator must carry an `src` provenance citation (no invented sizes).
export const MANIFEST = {
  bevelBox:    { args: ['w', 'h', 'd'],          dims: ['w', 'h', 'd'] },
  panel:       { args: ['w', 'h'],               dims: ['w', 'h'] },
  plate:       { args: ['w', 'd'],               dims: ['w', 'd'] },
  drawerStack: { args: ['w', 'h', 'd', 'count'], dims: ['w', 'h', 'd'] },
  legs:        { args: ['w', 'd', 'h'],          dims: ['w', 'd', 'h'] },
  cylinder:    { args: ['r', 'h'],                dims: ['r', 'h'] },
  cone:        { args: ['r', 'h'],                dims: ['r', 'h'] },
  finSet:      { args: ['count', 'root', 'span'], dims: ['root', 'span'] },
  deltaFins:   { args: ['count', 'root', 'span'], dims: ['root', 'span'] },
};

export const operatorNames = () => Object.keys(MANIFEST);
