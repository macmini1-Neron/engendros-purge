# _smoke — harness fixture build log

Purpose: exercises every harness path (shell + wallcut door gap + glazed window bays + tiled
materials + flat roof + Cyrillic sign + colliders). NOT shipped; `_` prefix skips dossier laws.

## Round 1 — 2026-06-11 (harness bring-up)

- `node tools/buildgen/lint.mjs buildings/_smoke` → ✓ 0 errors, 0 warns
  (built 8.00×3.20×6.13 m, fills 100%/100%/102% — the 2% on d is the sign standing proud).
- Viewer `VIEWER.load('_smoke')` → dims 8×3.2×6.048 m ≡ footprint · 12 colliders · ~268 tris ·
  5 materials. Console errors: only the favicon 404 + the (legitimately absent) fixture dossier.
- Canonical sweep saved to `renders/` and **every PNG Read**:
  - front/q34/graze: brick courses tile CONTINUOUSLY across jambs/lintel (metric triplanar UVs
    proven); no shimmer at the graze angle; ПРОВЕРКА legible; corrugated roof ribs read.
  - back34: both window bays are REAL openings with frames + translucent panes.
  - door/interior: the doorway is a walkable gap; interior walls textured; threshold plate sits
    clear of every wall plane.
  - ghost: door ≈ 1.26× the 1.75 m silhouette — scale correct. The two dark slits beside the
    door are the SOUTH windows seen THROUGH the open doorway (sight-line through the gap reaches
    x ≈ ±1.45 on the far wall) — verified by hiding the panes; not a depth bug.
  - colliders: yellow AABBs hug walls/base/roof; none on panes/sign; cyan footprint box matches.
  - far300: captured with `{minColours: 2}` — an 8 m cottage is correctly NOT readable at 300 m
    through fog. ⚠ justification: this fixture is `role: cover`, not a landmark; real landmark
    specs must pass far300 WITHOUT the override.
- Snapshot self-checks PROVEN to fail (a check that can't fire is decoration): camera-at-sky →
  blank + out-of-frustum; `expectColliders` with the overlay off → fails; `expectRef` with no
  overlay → fails. Two real viewer bugs found and fixed by the checks themselves:
  fog tuned 80–600 m (60–380 swallowed everything), and the frustum check now accepts a camera
  INSIDE the building AABB (interior walks are looking at the building too).
- Upload battery vs `tools/buildgen/server.mjs`: traversal id → 400, traversal name → 400
  (rejected, not sanitized), `.sh` → 400, fake-magic PNG → 400, 9 MB → 413, unknown building →
  400, valid PNG → 200 into `ref/`.
