# Graphics Perf — Anti-Stutter Pass #2 (Sub-project A) — Design

**Date:** 2026-06-18
**Branch:** `perf/anti-stutter-pass-2` (off `main` @ `ca012f24`, which has #95 perf pass #1 + #96 graphics-quality + #86 nav)
**Status:** Design — awaiting user review before plan/implementation

## Why this exists

The owner reported real in-game stutter ("seka") in extreme but reachable situations — the headline case: **5× Tolo bosses active + on the airfield + an IL-76 airdrop landing at the same time**, plus airdrop particles and shadow/light churn. A first anti-stutter pass already shipped (#95: never `scene.add` a light at runtime → FX light-pool; Tolo no-cast-shadow blob; shared bolt material; shadows every-other-frame). This is **pass #2**: hunt the *remaining* per-frame allocations, runtime mesh/material creation, and first-fire shader-compile hitches that pass #1 didn't cover, reproduce them under stress, fix them at the root, and prove the fix by measurement.

This is **Sub-project A** of a two-part effort the owner approved:
- **A (this spec, PR #1):** anti-stutter pass #2 — performance only, no gameplay change.
- **B (later, its own spec, PR #2):** "ultra" graphics-settings menu — granular per-knob controls + live perf overlay/benchmark + image-quality options, built on #96.

The stress harness built here is deliberately reusable as the benchmark engine for B.

## Goals

1. **Reproduce** the owner's stutter empirically via a scriptable stress harness, including unrealistic worst-cases (5× Tolo, airfield + airdrop, wave burst, mortar/molotov light spam).
2. **Measure** frame hitches objectively (worst-frame ms, p99 frametime, count of frames > 50 ms and > 100 ms, and what happened on the hitch frame).
3. **Fix at the root** the top offenders the audit found and the harness confirms: runtime allocation, runtime mesh/material creation, first-fire shader compiles.
4. **Prove** the fix with a deep, **multi-agent** before/after stress sweep (many isolated headless-Chrome runs in parallel), then a manual visual confirm.

## Non-goals (YAGNI — explicitly out of scope for A)

- No settings-menu UI, no new presets, no on-screen draws/tris overlay — those are Sub-project B. (The harness's hitch report is console/`window` only for now.)
- **No gameplay/balance change.** Pooling, scratch vectors, pre-warming, and clone-caching must be behavior-identical — same visuals, same hit results, same timings.
- **No co-op authority change.** Nothing here touches `hostSim`/`pstate`/netcode; pooling is local-render only.
- No unrelated refactors.

## Confirmed offenders (verified on `main` @ ca012f24)

Severity from the audit, line-confirmed against the live tree:

| # | Sev | Site | Trigger | Root cause | Fix direction |
|---|-----|------|---------|-----------|---------------|
| 1 | CRIT | `aircraft.js:21` (`cloneForRuntime`), called `:77` | every IL-76 airdrop | `root.clone(true)` + per-mesh geo/material clone of a multi-mesh GLB → geometry upload + shader compile mid-run | build the runtime instance **once**, cache + reuse (airdrops are never concurrent); reset transform on reuse |
| 2 | CRIT | `player.js:135-138, 190-198` | every frame | 3+ `new THREE.Vector3()` per `update(dt)` → GC churn | module-level scratch vectors reused each frame |
| 3 | CRIT | `mortar.js:282, 322, 325` | each shell fired | new `CylinderGeometry`/`BufferGeometry`/`RingGeometry` + materials per shot | pool shell + trace + ring meshes (reuse N), cache shared geo/material |
| 4 | HIGH | `enemies.js:452-454` (`_beam`), ghost beam/glow/sweep, `_ensureBossBlob` | first Tolo laser/sweep | lazy `new Mesh(new Geometry,…)` + `scene.add` **mid-fight** → first-fire shader compile + upload | pre-build + `scene.add` (hidden) at boss spawn; pre-warm shader via `renderer.compile` |
| 5 | HIGH | `enemies.js` bolt mesh per shot (host + ghost) | each blaster bolt (5/attack) | new `Mesh` per bolt (geo/material already shared) | pool bolt meshes |
| 6 | HIGH | `enemies.js` / `weapons.js` hot-loop `.clone()` / `new Vector3` (sweep dmg, raycast hit, projectiles) | sweep over many enemies, projectile updates | per-target Vector3 allocation in loops | scratch vectors / plain `{x,y,z}` returns |
| 7 | HIGH | `waves.js:128, 134` (`_spawnPos`) | each enemy spawn | `new THREE.Vector3` per spawn | reuse a scratch spawn vector |
| 8 | MED | `enemies.js:284-290` courier pack | 1% of spawns | first courier builds a `MeshBuilder` mesh mid-run | pre-build template at boot, clone |
| 9 | MED | `loot.js` supply crate/chute/flame build | each drop | meshes built per drop | cache geometry/material; pool flame mesh |
| 10 | MED | `enemies.js` raycast hit point | each ray hit | `new Vector3` per hit | scratch vector |
| 11 | LOW | Tolo blob `CanvasTexture`, projectile `.dispose()` bursts | first Tolo / grenade spam | one-time canvas build; synchronous dispose burst | pre-warm on boot/idle; batch/defer dispose |

The unifying pattern (same as pass #1): **never allocate GPU resources or compile shaders on a gameplay frame.** Move it to boot/spawn (pre-warm), reuse it (pool/scratch), or build it once (cache).

## Architecture

### 1. Stress harness — `src/stress.js` (new, dev-only)

A small module exposing `window.GAME.stress(name, opts)` and gated to non-production (e.g. only wired when `?stress` is present or via console). It drives the existing systems — it does **not** add gameplay.

- **Scenarios** (each a function that sets up the world state then lets the normal loop run):
  - `tolo5` — force-spawn 5 Tolo bosses at once.
  - `airdrop` — trigger an IL-76 supply airdrop (aircraft + chute + flare + particles).
  - `airfield_airdrop` — teleport player to the airfield district + airdrop.
  - `waveburst` — spawn the max enemy cap in the shortest window.
  - `mortar` / `molotov` — rapid fire to churn FX lights + shadows + particles.
  - `worstcase` — **the owner's report:** 5× Tolo + airfield + airdrop + flare/molotov lights together.
- **Frame-hitch logger** (`HitchLogger`): wraps the frame loop timing (reads the existing smoothed `_frameMs` plus raw `dt`), accumulates per run: `worstMs`, `p99Ms`, `hitches50` (count > 50 ms), `hitches100` (count > 100 ms), and a ring buffer tagging each hitch frame with the active cause (spawn / boss-fire / drop-build / dispose). Result published to `GAME._hitchReport` and `console.table`.
- **Determinism for A/B:** scenarios use fixed spawn positions/counts (gameplay RNG is unseeded, so the harness pins inputs it controls) so before/after numbers are comparable.

### 2. The fixes — pooling / scratch / pre-warm / cache

Grouped, each behavior-identical:

- **Pre-warm pass** (boot + boss spawn): a `prewarm()` that builds the boss attack meshes (Tolo `_beam`, glow, sweep, bolt), the courier pack template, and explosion/FX variants, adds them hidden, and calls `engine.renderer.compile(scene, camera)` once so their shader programs exist before first use. Hooked at game start (after world build) and idempotently at boss spawn.
- **Pools:** bolt-mesh pool, mortar shell/trace/ring pool, drop flame-mesh pool — small fixed pools with round-robin acquire/release, mirroring the existing FX-light-pool idiom in `engine.js`.
- **Scratch vectors:** module-level `_v0/_v1/…` (or `this._scratch*`) in `player.js`, `enemies.js`, `weapons.js`, `waves.js` hot paths, replacing `new Vector3`/`.clone()` inside `update`/spawn/hit loops. Care: never return a shared scratch to a caller that retains it — audit each replacement for aliasing.
- **Clone-once cache:** `aircraft.js` builds the runtime IL-76 instance once and reuses it (hide/show + transform reset between drops); supply crate/chute geometry+material cached at module scope.

### 3. Verification — deep multi-agent stress sweep (the "spousta agentů")

A `Workflow` run (owner explicitly opted in: "hluboké testy přes spoustu agentů"):

- **Phase Bench-Before:** N agents in parallel, each owns an **isolated** headless Chrome (own port + profile + swiftshader, per the headless-verify recipe — shared procs steal ports), each runs one stress scenario on the **pre-fix** build, returns its `HitchLogger` report (structured schema).
- **Phase Fix:** fixes implemented (this is done in-session, not by the bench agents).
- **Phase Bench-After:** same N scenarios re-run on the **post-fix** build; each agent returns its report.
- **Phase Verify:** adversarial reviewers diff before/after per scenario and flag any scenario that did **not** improve, any visual/behavior regression, and any new allocation introduced by the fix (e.g. a scratch-vector aliasing bug).
- Manual gate: owner plays the `worstcase` scenario in-browser (no-store server) to confirm by feel.

### Success criteria

- On `worstcase`, **no frame > 100 ms** during boss salvos + airdrop landing, and a large drop in `hitches50` vs the before-baseline (target: ≥ 60% fewer > 50 ms hitches).
- Every other scenario's `worstMs` and `hitches50` are ≤ baseline (no regression).
- 0 console errors; visuals/behavior unchanged (adversarial verify confirms no gameplay diff).
- Pre-warm adds no perceptible boot-time stall (measure boot ms before/after; budget a few hundred ms once, not per-frame).

## Risks & mitigations

- **Scratch-vector aliasing** → silent gameplay bug (shared vector mutated by two callers). *Mitigation:* per-site audit; keep scratch local to the tightest scope; adversarial verify diffs hit results.
- **Pre-warm cost / VRAM** → boot stall or holding meshes that are never used in a given run. *Mitigation:* pre-warm only the high-frequency offenders (boss, courier, bolts), measure boot delta, keep pools small.
- **Pooled mesh state leakage** (a reused bolt keeps stale transform/opacity) → visual glitch. *Mitigation:* full reset on acquire; verify in the visual gate.
- **Headless stress fidelity** — swiftshader is CPU-rendered, so absolute ms differ from real GPU; **shader-compile and JS-allocation hitches still reproduce** (they're CPU-side), which is exactly what we're hunting. *Mitigation:* treat headless numbers as relative before/after, confirm the headline case manually on real hardware.
- **`stress.js` shipping to prod** → dev tooling in players' hands. *Mitigation:* gate behind `?stress`/console, exclude from the hot path, and (optionally) `.vercelignore` is not needed since it is import-gated; ensure no auto-run.

## Out-of-scope follow-ups (noted, not built here)

- Sub-project B: the graphics-settings menu + on-screen perf overlay + benchmark UI (reuses this harness).
- Spreading wave-spawn work across frames (a mitigation, only if root-cause fixes prove insufficient under `waveburst`).
