# ENGENDROS — stav všech prací (snapshot 2026-06-28)

Snapshot pořízený před vypnutím Macu na transport. `origin/main` = `ef7b6c3f` (**v333**, LIVE na `engendros-purge.vercel.app`).

## ✅ LIVE na produkci (v333)
| Co | PR |
|---|---|
| **Forest stack** (combat/foliage, sectional destrukce, tree-physics fáze 1–3) | #110→#115→#116→#117 |
| **Přesné capsule hitboxy** (1182 caps na trees/logs, raycollide.js) | #124 |
| **Pro-feel juice** (hit-stop/trauma/kill-punch/damage-#/menu-audio) | #127 |
| **Engine anti-stutter #3** (pooling/scratch/GC-spike kills) | #128 |
| Day-cycle freeze + konzole gamerules + `/test` | #125/#126 (v332) |
| Poker item-wager (6-handed) | #118–#123 (v330) |
| Poker review+fix stack | #111–#114 (v325) |
| Forest base + destrukce engine | #102/#103/#106/#107 (v319) |

➡️ Jediná zbylá brána pro nově nasazené: **2-PC co-op živý test** (nejde headless).

**Jak forest stack landoval (dnes v noci):** celý 7-větvový strom rebasnut na pokročilý v332-main; konflikty triviální (cache-bust + 1 čistý weapons.js `_fire` hunk = main `infiniteAmmo` + juice `FIRE_TRAUMA`, nechány obě). Důkaz: strom `origin/main` `2c2c72ef` == smoke-testovaná integrační větev `_integ`. Ověřeno: 832/832 testů, čistý boot+play na default i `?map=forest`.

## 🟢 HOTOVO, čeká na rozhodnutí/push/merge (lokální větve)
| Práce | větev | pozn. |
|---|---|---|
| **Engendro dismemberment** 🧸🪓 | `feat/engendro-dismemberment` (`7b97d19c`) | per-part plush + capsule hitboxy + crawl/bleed/gibs, 759 testů. ⚠️ off STARÉHO #124 → potřebuje rebase na main jako forest |
| **Cooling-tower asset** 🏭 | `feat/cooling-tower-asset` (`acf098ef`) | `buildCoolingTower()` hotový; vybrat kam zasadit |
| **Engine roadmap** | `feat/bloom-postfx`, `feat/sim-worker`, `feat/engine-reinstancing` | hotové lokální větve, čekají na rozhodnutí o velikosti mapy |
| **Forest-cave + nature mechanics** 🌲🕳️ | `feat/forest-cave-terrain` | jeskyně/převisy + wind/fire/tremor na ?map=forest. WIP snapshot commitnut `d6fff7c2` |
| **Tree-lifecycle** | `feat/tree-lifecycle` | taxonomie kusů M0+M1 hotové; off starého #124 |

## 📋 Otevřené PR — čekají na review
| PR | větev → base | pozn. |
|---|---|---|
| #99 | `codex/shilka-flagship-mechanics` → main | Shilka auto-rig |
| #100 | `feat/glb-weapons-batch` → main | 9 GLB zbraní; ★některé textury baked-black → nemergovat tak |
| #101 | `feat/forest-destruct-physics` → docs/postergen-harness-design | R&D demo; base = docs větev → review-only |
| #108 | `feat/shilka-named-rig` → main | Shilka named-rig (Blender) |

## 🟡 Velké rozdělané / design / R&D
- **Terrain rewrite** — 72 návrhů showcase, config-driven engine; čeká na výběr páteřních map → plány.
- **Cave terrain 3D engine** — density field + Surface Nets, prototyp Chrome-verified; vybrat rozsah.
- **Shilka „sim z manuálů"** — `feat/shilka-real-sim-rnd` (driver hotov, věž next) + Blender rig (`feat/shilka-named-rig`). WIP snapshot `82a94c6d`.
- **Professionalization top-20 + Zelda verdikt** — audit hotov; Tier A shipnut přes #127.
- **PKM machinegun** — `feat/pkm-machinegun`, WIP snapshot `170454f7`.

## 🧹 Úklid (až bude čas)
- 3 mergnuté worktree (`eng-juice`/`eng-perf-fx`/`precise-hitboxes`) jsou v mainu → worktree i remote větve lze smazat (`/clean_gone`).
- Lokální `main` ref zastaralý (`49cceae5`, worktree `engendros-fonoteka`) → `git pull` (origin/main `ef7b6c3f` je správně).
- Superseded experimenty: `feat/tree-splinter-breaks`, `feat/tree-system-redesign` (voxel, #117 vyhrál); `stack-rebase/*` (starý terrain-stack pre-poker).
- `/private/tmp/engendros-v286-lan` — prunable temp.

---
*Plný detail každého tématu je v paměti `~/.claude/projects/-Users-macmini1-game-4-8/memory/` (MEMORY.md index).*
