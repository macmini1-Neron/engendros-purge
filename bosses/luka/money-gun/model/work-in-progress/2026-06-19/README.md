# Money gun complete WIP snapshot — 2026-06-19

This directory preserves the complete local working set for Luka's revolving
four-barrel money gun before further integration work.

## Contents

- `workspace-root/` — current Blender sources and backups, GLB/FBX exports,
  generator scripts, powder-feeder source and all loose development renders.
- `revolving-4barrel-history/` — the complete historical working directory,
  including intermediate Blender files, scripts, animation frames and GIFs.
- `game-integration/` — current workshop/preview pages, gun runtime sources,
  game-ready exports, required Three.js loader files, local server, mechanism
  references and spark/smoke reference frames.
- `MANIFEST.sha256` — SHA-256 checksum and byte size for every preserved file.

The snapshot intentionally keeps `.blend1` backups and intermediate renders.
They are part of the recovery set, not disposable build output.

## Run the preserved workshop

On Windows, run `game-integration/bosses/start-money-gun-dilna.bat`. It starts
the bundled local server and opens the animation/effects workshop on port 8132.

## Git LFS

Binary model and render assets are stored with Git LFS so a normal Git clone
stays small. After checkout, install Git LFS and materialize the assets with
`git lfs install` followed by `git lfs pull`.
