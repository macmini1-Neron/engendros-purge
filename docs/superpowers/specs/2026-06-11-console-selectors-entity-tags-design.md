# Console selectors + entity tags (v1) — design

**Date:** 2026-06-11
**Branch:** `feat/playable-demo`
**Status:** approved (brainstorm) — pending implementation plan
**Builds on:** the dev console shipped on this branch (`src/console.js`, `src/console-core.js`, F3 overlay).

## Goal

Make the dev console's Minecraft-style **target selectors actually work**, give every enemy a
**visible identity** (an F3-gated tag + HP shown above it), and add a **player nickname**.

Scope is **Phase 1: solo + enemies**. Applying commands to *other* players in co-op
(host-authoritative) is explicitly **deferred to Phase 2**.

## Background — current state

- `console-core.js` already has `parseSelector` / `resolveSelector` + the `'sel'` arg type,
  unit-tested, **but no command uses them and no provider is wired** → selectors are dead
  scaffolding. `parseSelector` only matches `@p|@a|@e|@s` (no `@r`/`@n`, no `[filters]`).
- Commands (`/give`, `/effect`, `/kill`, `/tp`) only ever touch the **local player**;
  `/kill` clears **all** enemies (no target).
- Co-op has player names (`mp.roster`: peerId → `{name, skin, …}`); **solo has none**.

## Non-goals (v1)

- No `[distance]` / `limit` / `sort` / `@r` / `@n` / full MC filters.
- No co-op cross-player application of give/heal/etc. (→ Phase 2).
- Tags are **auto** (type + id), not assignable — no `/tag` command.

## Design

### 1. Entity identity (tag)

- On spawn each enemy gets `e.tagId` from a per-run counter (`game._nextTagId++`), reset on run
  reset. Pooled enemies get a **fresh** id on every (re)spawn so it is unique among *live*
  instances.
- Derived `e.tag = \`${e.def.key}#${e.tagId}\`` — e.g. `swarmer#7`.
- Player: a `nick` from a **new Settings field** (solo; default `"Player"`). Co-op uses the
  roster name; the Settings nick **pre-fills** the lobby name.

### 2. F3 entity labels

- When **F3 is ON**, draw above each living enemy — capped to the **~24 nearest within ~50 m** —
  its `tag` **and a small HP readout** (current/max or a tiny bar). F3 OFF → nothing.
- Rendering: a **single `<canvas>` overlay** (`#entlabels`), redrawn each frame from projected
  enemy positions. One canvas stays cheap even on large waves (vs. dozens of DOM nodes).
- Computed only on the F3 path (`game.f3 && state === 'playing'`).

### 3. Selector provider

Built in `console.js`, passed to command handlers via `ctx` (or held on `DevConsole`):

- `self` → `g.player`
- `players()` → `[g.player]` solo; `[g.player, …remotePlayers]` in co-op
- `entities()` → **living** enemies (`g.enemies`, alive only)
- `byName(tok)` → a **player** by nick, **or** an **enemy** by `tag` (`swarmer#7`)

### 4. Parser (`console-core.js`, + tests)

Extend selector parsing/resolution to handle:

- `@s @p @a @e` (existing)
- `@e[type=<key>]` — filter enemies by type
- a bare token matching an enemy `tag` (`swarmer#7`) or a player nick → name target

No distance/limit/sort. New unit tests in `tests/console/core.test.mjs` (node:test) covering
type-filter parse, tag match, name fallback, and resolution against a stub provider.

### 5. Commands gain an optional leading target

MC-style target as the first argument, **optional** for back-compat:

- `/give <target?> <what> <amount>` — target = player; default `@s`. (`/give money 500` still works.)
- `/effect <target?> <heal|hurt> <amount>` — `heal` → player, `hurt` → player **or enemy**; default `@s`.
- `/kill <target?>` — `@e` all enemies · `@s` suicide · `swarmer#7` one · `@e[type=X]` a kind.
  No target ⇒ `@e` (today's behaviour, preserved).
- `/tp <target?> <pos>` — default `@s`.
- **Target rule:** if the first token is `@…` or a known nick/tag → it's the target; otherwise the
  target defaults to `@s` and that token is the first ordinary argument (keeps old syntax working).
- **v1 application:** player targets resolve to **you** solo (give/heal apply locally); enemy
  targets (`/kill`, `/effect … hurt`) apply to enemies. Applying to *other* players = Phase 2.

### 6. `@s` semantics

`@s` = the command **executor**. In our console (typed by the local player, no `/execute`) `@s`
is **always you** — the natural "apply to me" default. Distinguishable from `@p` only once an
entity can execute commands (not in v1).

## Testing

- Pure `node:test` cases for the extended parser/resolver in `tests/console/core.test.mjs`
  (type filter, tag match, name fallback, resolve against a stub provider).
- In-browser verify (Playwright): F3 labels render `tag` + HP over mobs; then
  `/kill @e`, `/kill @e[type=…]`, `/kill swarmer#N`, `/give @s money 500`, `/effect @e hurt 50`.

## Phase 2 (later, separate spec)

Host-authoritative application of give/heal/kill to **remote** players via `pstate`/relay, so
`@a`/`@p` meaningfully hit teammates in co-op.
