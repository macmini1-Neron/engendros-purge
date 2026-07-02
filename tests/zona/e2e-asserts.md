# ЗОНА 704 skeleton — in-engine assert list (repeatable)

Serve fresh (no-store, fresh port — stale-module gotcha), open `http://127.0.0.1:<port>/?map=zona&fly=1`,
start a run (`GAME.startGame('purge')` from the console works), then paste:

```js
// pinned plan heights — every entry must print true (exact to ±tolerances baked into node tests)
const T = GAME.world.terrain;
[[50,630,60],[930,1120,200],[470,-850,-12],[-170,-300,-25],[-1080,-1060,5],[780,-680,-4],[180,80,40]]
  .map(([x,z,w]) => `${w}→${T.terrainHeightAt(x,z).toFixed(1)}`);
// expected: 60→60.0 | 200→200.0 | -12→-12.0 | -25→-25.0 | 5→5.0 | -4→-4.0 | 40→40.0

// world sanity
GAME.world.mapId === 'zona' && GAME.world.chunks.chunks.length === 400 && GAME.world.hasTerrain;

// perf snapshot (stand at the rozcestí fork): collect 240 rAF deltas, check p99
// 2026-07-02 measured on the M1 Mac: p50 6.9 ms · p99 8.7 ms · 156 draw calls · 1.25 M tris
```

Node-side (headless, no browser): `node --test tests/zona/*.test.mjs` — 21 tests cover the same pins
plus road slopes (Lipschitz clamp per surface class), pad flatness, T5 walkability (≤38°, see the
comment in pads.test.mjs), junction continuity and host/client determinism.

Contact sheet: `zona-sk-01..12*.jpeg` + composite `zona-sk-sheet.jpeg` (repo root, gitignored QA shots)
— КПП, rozcestí, S04 bridge, Тесная брана, G1–G5, T5 ridge, P5 convergence, P8 saddle.
