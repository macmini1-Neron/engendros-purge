---
name: voxel-building-modeling
description: SUPERSEDED by the buildgen skill — for ANY new map building / structure / district / POI in ENGENDROS PURGE, invoke `buildgen` instead (the full data-driven harness with validator + viewer + in-game verification). This stub only redirects; do not follow an old prose pipeline for new work.
---

# voxel-building-modeling → SUPERSEDED by `buildgen`

This skill's prose-only pipeline (research → hand-build in `world.js`) produced the defects the
owner got tired of: 1-px walls, missing floors, stretched/overlapping textures, open-top boxes.
It is replaced by the **buildgen harness** — same research-first philosophy, now mechanically
enforced.

**→ Invoke the `buildgen` skill** (`.claude/skills/buildgen/SKILL.md`).
Harness design spec: `docs/superpowers/specs/2026-06-10-buildgen-harness-design.md`.

What survives from here (folded into buildgen):
- **Research beats vibes** — sourced dossier before a single box; one building at a time, never
  batched; Cyrillic/era/materials are researched, not invented.
- **Golden references:** `src/gatehouse.js` (interior composed object-by-object from props —
  the pattern buildgen's `propRef` codifies) and `src/airfield.js` (`glassPane`, real
  see-through windows).
- **Grandfathered buildings:** gatehouse, strongpoint, bunker, airfield stay hand-coded as-is —
  do NOT migrate them (live content, no tests). New buildings only go through buildgen.
