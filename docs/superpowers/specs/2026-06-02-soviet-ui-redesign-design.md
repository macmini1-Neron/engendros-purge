# Soviet/Eastern-Bloc UI/UX Redesign — Design Spec

**Date:** 2026-06-02
**Branch / worktree:** `feat/ui-soviet-redesign` @ `/Users/macmini1/engendros-ui-soviet`
**Goal:** Replace the whole game's desert/sandstone UI with a coherent, thought-through (anti-AI-slop) **Eastern-Bloc / Central-European Cold-War** design language. Hybrid register: industrial/stencil base for readability + constructivist red/black poster accents + light diegetic CRT touches. Applies to every screen.

> Direction locked with the user (2026-06-02): **Setting = Central Europe / Eastern Bloc** (Czechoslovak-DDR concrete, overcast, desaturated — NOT desert, NOT radioactive teal). **Style = Hybrid.** **Treatments = all four:** custom icons (no emoji), bilingual EN+Cyrillic, diegetic framing, subtle CRT/scanline+grain.

## Core concept — "The Panel System / ПАНЕЛЬ"

Paneláky (socialist prefab housing) are literally pre-cast concrete **panels** with a visible grid of seams and stamped serial numbers. The UI becomes a system of concrete panels: each overlay is a riveted concrete slab, stamped with a serial number + bilingual stencil label, lit by **one** red neon accent (constructivist red, used sparingly for maximum power). **Combat HUD stays minimal and legible** (industrial stencil); **menus get the full diegetic treatment** (stamped dossier / command panel). This single metaphor ties Eastern-Bloc texture + constructivist accents + the voxel game together.

Design research grounding: constructivism = red/black/white, red sparing = powerful, bold sans-serif caps, diagonals, active negative space; Eastern Bloc = dominant concrete grey broken by neon signage + folk accents; game-UI = readability first, "invisible" HUD, diegetic only where it serves immersion without hurting function (Metro Exodus).

## Design system

### Palette "BETON" (replaces the warm sandstone `:root`)
| token | value | role |
|---|---|---|
| `--concrete-0` | `#0e0f10` | base bg (wet asphalt) |
| `--concrete-1` | `#16191c` | panel surface |
| `--concrete-2` | `#22272c` | raised panel / tile |
| `--concrete-3` | `#2e353c` | edges / seams |
| `--paper` | `#d8dbde` | cold print-white ink |
| `--ink-dim` | `#868d94` | labels / secondary |
| `--red` | `#c8202a` | constructivist red — the ONE loud voice (primary action, titles accent) |
| `--red-deep` | `#7a1318` | red shadow / pressed |
| `--hazard` | `#d8b13a` | caution; pairs with black diagonal stripes |
| `--go` / olive | `#8a9a3f` | "issued / owned / ready" |
| `--steel` | `#6f8aa8` | armor / info (cold blue) |
| `--neon` | `#57e0c8` | neon-sign accent (radio/special), faint buzz/flicker |
| `--line` | `rgba(216,219,222,.10)` | hairlines |
| `--line-rivet` | `rgba(0,0,0,.55)` | rivet shadow |

Keep the existing semantic aliases that JS reads as `var(--gold)` etc. by **re-pointing** them (e.g. `--gold` → amber/hazard) so HUD code (`wepname.style.color='var(--gold)'`) still resolves without JS edits where possible.

### Typography
- **Display/titles:** Oswald 700, caps, wide tracking, behind a **diagonal red bar**; big size contrast.
- **Headers/labels:** Oswald 600, stencil feel (tracking + subtle notch).
- **Body/numbers:** Rajdhani. **Constraint:** Rajdhani has **no Cyrillic** → all Cyrillic stamps must use Oswald (has Cyrillic) or the stencil font below.
- **Stamps/serials:** add ONE stencil web font (`Stardos Stencil` or `Saira Stencil One`) for serial numbers + classification stamps. Verify it carries Cyrillic; if not, Cyrillic stamps fall back to Oswald.
- **CRT readouts:** monospace (Courier New, already used in the tank sight).

### Shape language & primitives (CSS classes)
- Drop glassmorphism (blur + 12-16px radius). Use **solid concrete panels**: sharp/2px corners, **chamfered corners** via `clip-path` on buttons (stamped-plate look), emboss (light top edge + dark bottom), faint concrete noise + scratches.
- **Panel seams** (panelák grid lines) + **rivets** in corners.
- **Stamps:** panel header = serial № + bilingual title (`СЕКТОР-7 · SECTOR-7 / №04`) + a faded rotated classification stamp (`СЕКРЕТНО / RESTRICTED`).
- **Hazard tape:** diagonal yellow/black stripe as divider / warning band.
- **Buttons:** primary = red plate, chamfered corner, white stencil caps, hard border, pressed-metal shadow; secondary = concrete plate, olive on hover; danger = red + hazard.

### Iconography — remove ALL emoji
New module **`src/icons.js`** exporting `icon(name, opts)` → inline **SVG string** (monochrome, `currentColor`, `stroke`/`fill` themeable). Stencil/line style, crisp at HUD sizes, matches "military stencil". Replaces every emoji in `index.html`, `ui.js`, and `inventory.js`.

Required icon set (~28): **weapons** knife, pistol, rifle, smg, shotgun, sniper, launcher; **tools** flashlight, binoculars; **gadgets** grenade, molotov, flare, radio; **consumables** medkit, food, armor, ammo, splint, beacon; **survival** leg-broken, fire; **nav/meta** purge(crossed-bayonets/star), night(moon), shop(crate), coop(two-figures), settings(gear), admin(wrench), back(arrow), cash(₽/coin), keys, skull(killfeed), supply-drop. Each maps the current emoji 1:1 so JS call sites swap cleanly.

### CRT + diegetic treatments (subtle — readability first)
- Keep the existing film-grain overlay.
- Add very faint **scanlines** on panels (`repeating-linear-gradient`, low opacity) + slight overlay vignette/curvature.
- Faint flicker only on the `--neon` accent.
- In combat HUD: keep treatments minimal so legibility wins.

## Per-screen application

| Screen | Treatment |
|---|---|
| **Main menu** (`#menu`) | Constructivist title + diagonal red + Cyrillic stamp `ИСТРЕБЛЕНИЕ`. Mode picker = two large "order folders" (PURGE / THE LONG NIGHT). Nav = vertical command-panel of labeled switches. Version = serial build stamp. Controls = "manual" legend. |
| **Shop/Armory** (`#shop`) | Keep 3-column. Rail = metal tabs; catalog tiles = concrete cards w/ stencil name + custom weapon icon + stamped price tag (olive `ВЫДАНО/ISSUED` when owned); detail = "requisition form" (3D preview in a sight/viewport frame + stat spec-list + red UNLOCK); loadout = numbered ammo-crate cells; confirm = stamp-approval dialog. |
| **Co-op lobby** (`#lobby`) | `РАДИОПОСТ / RADIO POST`: room code as frequency/callsign readout; connection-check as a signal meter; NET/RELAY as toggle switches; skins as unit colors. Keep existing grid structure. |
| **HUD** (combat, clean) | HP/armor/hunger = **segmented instrument gauges** w/ stencil labels (segments read as Soviet gauges + better legibility than smooth gradients); ammo = big stencil counter + weapon icon; topbar = riveted strip; boss bar re-themed purple→red/hazard; killfeed/toasts/interact reskinned. Minimal diegetics. |
| **Pause** (`#pause`) | `ПАУЗА / HALT` stamp. |
| **Gameover** (`#gameover`) | Casualty-report look, `КОНЕЦ` stamp; keep "UNSTUFFED" headline re-themed. |
| **Settings** (`#settings`) | Command panel; range sliders styled as instrument faders. |
| **Admin viewer** (`#admin`) | Light reskin (dev-only). |
| **Tank sight / scope / periscope / binoview** | Color-harmonize only (Cyrillic already present). |

## Implementation approach
1. Rewrite the `:root` token block + component classes in `index.html`'s inline `<style>`. **Keep all DOM, IDs, and class names** so existing JS keeps working. CSS stays **inline** (one cache-bust knob per CLAUDE.md; no external stylesheet to avoid new Vercel cache headers).
2. New `src/icons.js`; edit `ui.js` + `inventory.js` to emit `icon()` instead of emoji (`_icon`, `refreshHotbar`, `setWeapon`, `setHeldItem`, `setRadios`, `setSurvival`, `setClock`, `setNightGear`, `kill`, etc.).
3. Targeted HTML additions in `index.html` (header stamps, hazard bands, swap static emoji in menu/lobby buttons).
4. **Verify loop:** serve the worktree on an isolated port (e.g. `python3 -m http.server 8002`) → Playwright screenshot each screen (menu, shop, lobby, HUD via `GAME.startGame`, pause, gameover, settings) → iterate until crisp.
5. Finish: **cache-bust ritual** — bump `?v=N` on `index.html` entry + `GAME_BUILD` in `src/game.js`.

### Build phases
1. Tokens + primitives (panel/button/stamp/hazard/rivet/scanline classes + `src/icons.js`).
2. Menu + pause + gameover.
3. Shop/Armory.
4. Co-op lobby.
5. HUD (combat).
6. Settings + admin + tank/scope color-harmonize + polish + screenshot pass + cache-bust.

## Non-goals / constraints
- No gameplay/logic changes — purely presentational (CSS/HTML + icon swap; JS edits limited to emitting icons + any class hooks).
- No new framework/build step; vanilla CSS + inline SVG only.
- Keep every existing element ID and class JS depends on; add new classes, don't rename old ones.
- Map art itself is out of scope (changes later); palette is chosen to harmonize with the future Central-European map.
- `peerjs` script, import map, and module structure unchanged.

## Success criteria
- Every screen reads as one coherent Eastern-Bloc/constructivist system; zero emoji remain in the UI.
- Combat HUD stays as legible or more legible than today.
- No console errors; `GAME` boots; co-op lobby + shop fully functional.
- Looks deliberate and crafted (anti-slop), not a generic dark theme.
