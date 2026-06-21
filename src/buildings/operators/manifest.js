// manifest.js — buildgen operator vocabulary as pure data (no impl, no THREE).
//   args:    required arg keys (beyond what the compiler supplies via ctx).
//   dims:    the subset of args that are REAL-WORLD dimensions → any part using this
//            operator must carry an `src` dossier citation (no invented sizes).
//            `windowBays` is the documented exception: its dims live in args.module {w,h,sill}.
//   anchor:  where the part's `at` sits — 'floor' = bottom-centre, 'center' = volumetric centre,
//            'face' = resolved on a wall face (args.face + u/v offsets), 'top' = sits on the
//            building top (topY from storeys), 'free' = no origin rules.
//   family:  shell | roof | opening | facade | landmark | sign | ref — drives validator law 4
//            (roof must close the top) and the collide defaults.
//   collide: default for whether emitted prims become AABB colliders (part.collide overrides).
//   role:    destruction role default — 'structural' (load-bearing skeleton; never removed, holds
//            the roof) | 'cladding' (removable: walls/panes/doors) | 'none' (outside destruction).
//            Per-emit role wins (e.g. shellBox pins its base slab + corner stubs structural while
//            its wall field stays cladding); a part-level spec `role` overrides this default for
//            the rest. Cladding parts whose material has a phys bridge become destruct parts.
export const MANIFEST = {
  // shell / massing (collidable structure)
  shellBox:     { args: ['wall'],                              dims: ['wall'],             anchor: 'floor', family: 'shell',    collide: true,  role: 'cladding'   },
  floorSlab:    { args: ['storey'],                            dims: [],                   anchor: 'floor', family: 'shell',    collide: true,  role: 'structural' },
  interiorWall: { args: ['len', 'h', 't', 'axis'],             dims: ['len', 'h', 't'],    anchor: 'floor', family: 'shell',    collide: true,  role: 'structural' },
  column:       { args: ['w', 'd', 'h'],                       dims: ['w', 'd', 'h'],      anchor: 'floor', family: 'shell',    collide: true,  role: 'structural' },
  stairs:       { args: ['steps', 'rise', 'run', 'width', 'dir'], dims: ['rise', 'run', 'width'], anchor: 'floor', family: 'shell', collide: true, role: 'structural' },
  // roofs (visual; only flatRoof/parapet collide — angled roofs have no walkable collider)
  flatRoof:     { args: ['t'],                                 dims: ['t'],                anchor: 'top',   family: 'roof',     collide: true,  role: 'structural' },
  gableRoof:    { args: ['rise'],                              dims: ['rise'],             anchor: 'top',   family: 'roof',     collide: false, role: 'cladding'   },
  hipRoof:      { args: ['rise'],                              dims: ['rise'],             anchor: 'top',   family: 'roof',     collide: false, role: 'cladding'   },
  sawtoothRoof: { args: ['teeth', 'rise'],                     dims: ['rise'],             anchor: 'top',   family: 'roof',     collide: false, role: 'cladding'   },
  parapet:      { args: ['h', 't'],                            dims: ['h', 't'],           anchor: 'top',   family: 'roof',     collide: true,  role: 'structural' },
  // openings (REAL GAPS — they cut the shell walls; they emit only frames/panes/thresholds)
  windowBays:   { args: ['face', 'count', 'module'],           dims: [],                   anchor: 'face',  family: 'opening',  collide: false, role: 'cladding'   },
  doorway:      { args: ['face', 'width', 'height'],           dims: ['width', 'height'],  anchor: 'face',  family: 'opening',  collide: false, role: 'cladding'   },
  gateOpening:  { args: ['face', 'width', 'height'],           dims: ['width', 'height'],  anchor: 'face',  family: 'opening',  collide: false, role: 'cladding'   },
  // facade detail (visual, proud of the wall plane)
  cornice:      { args: ['h', 'proud'],                        dims: ['h', 'proud'],       anchor: 'top',   family: 'facade',   collide: false, role: 'cladding'   },
  pilaster:     { args: ['face', 'w', 'proud', 'count'],       dims: ['w', 'proud'],       anchor: 'face',  family: 'facade',   collide: false, role: 'cladding'   },
  // landmarks (tall silhouettes; collidable mass)
  chimney:      { args: ['rBase', 'rTop', 'h'],                dims: ['rBase', 'rTop', 'h'], anchor: 'floor', family: 'landmark', collide: true, role: 'structural' },
  waterTank:    { args: ['r', 'h', 'legH'],                    dims: ['r', 'h', 'legH'],   anchor: 'floor', family: 'landmark', collide: true,  role: 'structural' },
  mast:         { args: ['r', 'h'],                            dims: ['r', 'h'],           anchor: 'floor', family: 'landmark', collide: true,  role: 'structural' },
  // signage (Cyrillic CanvasTexture, ~4 mm proud of the wall)
  sign:         { args: ['face', 'w', 'h', 'text'],            dims: ['w', 'h'],           anchor: 'face',  family: 'sign',     collide: false, role: 'cladding'   },
  stencil:      { args: ['face', 'w', 'h', 'text'],            dims: ['w', 'h'],           anchor: 'face',  family: 'sign',     collide: false, role: 'cladding'   },
  // reuse
  propRef:      { args: ['model'],                             dims: [],                   anchor: 'floor', family: 'ref',      collide: false, role: 'none'       },
  repeat:       { args: ['count', 'part'],                     dims: [],                   anchor: 'free',  family: 'ref',      collide: false, role: 'none'       },
};

export const operatorNames = () => Object.keys(MANIFEST);
