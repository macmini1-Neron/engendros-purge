# Tree System — COMPLETE REWRITE, lifecycle interview agenda

**Status:** PLANNED — not started. Owner wants to begin **after midnight 2026-06-24→25** (a few hours after this was written; low on tokens today).
**Method (owner's words):** *"vezmeme krok po kroku, budeš se mě ptát na chování každé části v každé fázi životního cyklu toho stromu (kompletní rewrite)."* A **collaborative interview**: I ask ONE question at a time (brainstorming skill), owner describes the DESIRED behavior of each PART in each PHASE; I write the spec from the answers, then plan → subagent-driven implement → Playwright-verify each step with the `/testtree` colored harness.

> This is a **ground-up rewrite of the tree system**, not more patching of the current `forestdemo.js` fell logic. The 5 fixes already shipped on `feat/tree-system-redesign` (commit 22104e10: drape/no-float/no-spin/one-fall/grenade-no-ignite) are a stopgap; the rewrite supersedes them. Decide at kickoff whether to build on this branch or branch fresh off #117.

## How we'll run it (kickoff checklist)
1. Re-read this agenda + the bug-triage spec `2026-06-24-tree-system-bug-triage.md` (real root causes, what the current code does).
2. Confirm scope/base branch with owner.
3. Walk the lifecycle phases below **one part × one phase × one question at a time**. Owner answers, I record verbatim intent into a fresh design spec.
4. Verify each phase live with `/testtree` (per-part debug colors, R-reset) — NEVER tune blind.

## The interview map — every PART × every PHASE (fill in owner's answers)

### Phase 0 — Standing tree (alive)
- Appearance, species variety, scale ranges.
- Sway/wind: how much, when.
- **Destructibility while standing:** which calibers do what? Partial damage (chip/scar) vs break? HP per trunk thickness / species?
- **Where does it break?** exactly where shot, or snapped to bands? Crown vs bole behaviour.
- Hitbox/collision precision (ties into PR #124 capsule hitboxes).
- What blocks bullets / what passes (leaves = pass-through?).

### Phase 1 — Taking damage / the moment of felling
- What separates: only the part ABOVE the hit falls? Always a stump left?
- Direction of fall (toward shooter? away? hit vector? gravity/lean?).
- Weight by size — does a bigger tree fall slower/heavier?
- Fall physics: hinge vs free? speed.
- **Collision DURING the fall:** hits buildings (breaks roof not whole house, by weight/size, along motion vector; doesn't destroy concrete/harder-than-wood), other trees, the player (damage by size).
- Multi-hit / spray behaviour (current stopgap = one active fall per tree — confirm desired).

### Phase 2 — Fallen log on the ground
- Shape: stays whole, or chunks? How small can it be shot apart?
- **Gravity/rest:** drape on terrain (current stopgap) — confirm. Nothing floats; unsupported pieces fall.
- Cover/traversal: walk over the bole, under a raised crown, wade into the crown (enterable foliage)?
- Re-destruction: calibers to chop it; what each chunk does when destroyed (sink? debris?).

### Phase 3 — The stump
- Permanent? Shootable? HP?
- Removable how: shoot it down to nothing? dig under it = UPROOT the whole thing?
- Re-snappable (shoot the stump again → shorter)?

### Phase 4 — Fire / charred
- **Ignition sources:** molotov YES; grenade NO (already done); rocket/HE — owner's call. Standing vs fallen ignite differently?
- Burn behaviour: spread? duration? to neighbours?
- **Charred state:** what does a burnt tree/log look like and what can you DO with it — shoot it (does it shatter easier?), burn out fully (sink/ash), no regrow?
- Burning fallen log: char + sink, no poof (existing behaviour — confirm).

### Phase 5 — Uproot (dig)
- Dig under a tree → whole tree topples (root and all, no stump). Confirm + tie to terrain digging system.

### Phase 6 — Cross-cutting
- **Co-op determinism:** every behaviour must be host-auth or seeded-deterministic (no new netcode where avoidable). `hostSim` gate, `pstate` truth.
- Performance: per-chunk cost caps (current `MAX_SEG_LOGS`), LOD.
- Persistence within a run; late-join sync.

## Anchors (where the current code lives — for the rewrite to replace/reuse)
- `src/forestdemo.js` — `ForestDemo`: `fellTree`, `_registerFallenLog`, `regroundLog`, `_groundChunks` (new), `_resolveFlatFall`/`_flatTarget`/`_groundSettled`, `breakLogSeg`/`_killSeg`, `charLog`, the FALLING update loop.
- `src/destruct.js` (THREE-free, node-tested) — `splitGeomAtY`, `binFallenGeometry`, `binFallenAABBs`, `makeHinge`/`stepBody`, `orphanedCells`, `snapPlan`.
- `src/props/generators/tree.js` — `makeTree` (geometry + breakAt split).
- Hitboxes: PR #124 capsule narrowphase (`raycollide.js`, `grid.raycast` refine, `box.cap`).
- Verification harness: `/testtree [species] [scale]` + **R** reset + per-part flat debug colors (`_dbgMat`).
- Fire: `game.js:_demoBlast` igniteAt (gated on isRocket), `FireManager`.

## Decisions to make at kickoff (don't pre-answer)
- Build on `feat/tree-system-redesign` (keep the 5 stopgap fixes) or fresh branch off #117?
- Keep the rigid-rod-hinge fall model or move to a different model (the rigid rod is why wide crowns needed the per-chunk drape)?
- One unified chunk model from the start (so felling + sectional destruction + grounding + fire all share it) — this was the §3 tension in the triage spec.
