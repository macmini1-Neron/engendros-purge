# dshk-ammo-box — build log

## v2 rebuild (2026-06-10) — APPROVED
Full re-author after the v1 mm-units incident (spec was in millimetres → built
280 m wide; preserved as `tests/modelgen/fixtures/dshk-mm-broken.spec.json`).

- iter 1: 9 parts (lidBox + 2×strapBand + handleU + 2×panel latches + 3 stencils),
  metres, all `dossier#` cited. lint ✓ 101/101/100% fill. dims 292×156×175 mm.
  Defects found in renders: end stencil read as a solid black HOLE; star read as
  a square patch; end stencil clipped the brass latch.
- iter 2: stencil op gained `lines:n` (text bars); star rotated 45° → diamond
  insignia; end stencils shrunk to 0.08×0.05 and shifted to z −0.015 (clear of
  the latch). Viewer snapshot() camera-lag bug fixed on the way.
- verify: canonical set saved (front/q34/side/back34/top/graze/ghost), grazing
  view clean (no z-fight), ghost confirms hand-carry scale. `node --test` 57 ✓.

needs[] (open): exact ГОСТ dims; hardware dims are geometric derivations.
