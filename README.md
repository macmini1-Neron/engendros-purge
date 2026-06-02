# ENGENDROS PURGE

ENGENDROS PURGE is a browser-based voxel wave shooter built with vanilla
JavaScript and Three.js. It is a fully static web game: no bundler, no framework,
no package install, and no build step. The current focus is fast co-op
iteration, Hamachi/LAN stability, synchronized multiplayer state, and readable
debugging when browser networking gets weird.

Current documented build: `v190`

Build stamp shown in the lobby: `2026-06-02 10:01 WEST`

Primary branch for the latest co-op work: `codex/sync-mp-day-night`

## Quick Start

Run a local static server from the project root:

```bash
python3 -m http.server 8099
```

Open:

```text
http://localhost:8099/?cb=v190
```

For Hamachi co-op, the other player opens the host Mac's Hamachi IP:

```text
http://25.44.189.90:8099/?cb=v190
```

If that IP changes, replace it with the host Mac's current Hamachi address.

Do not open `index.html` through `file://`. The game uses native ES modules,
asset loading, audio files, and browser APIs that expect HTTP.

## What This Game Is

ENGENDROS PURGE is a first-person survival shooter in a compact dust2-inspired
arena. Players fight plush/voxel enemies through escalating waves, unlock and
equip weapons, use gadgets, build fortifications, call supply drops, fight
bosses, and can commandeer special vehicles or fixed weapons.

Core loop:

1. Pick a mode and loadout.
2. Survive continuous waves.
3. Kill enemies for score and flat personal cash.
4. Use supply drops, loot, fortifications, gadgets, vehicles, and the rooftop
   .50cal to keep the squad alive.
5. If the squad wipes in multiplayer, everyone returns to the same lobby and
   can ready/start again without re-hosting.

## Current Gameplay Highlights

- Static browser game powered by Three.js and native ES modules.
- Hand-modeled voxel weapon viewmodels and voxel characters.
- GLB T-90M-style tank asset in `assets/modely/`.
- Purge mode: arcade wave survival with bright noon sky.
- Long Night mode: host-authoritative day/night survival with blood moon state.
- PeerJS WebRTC co-op with optional local LAN WebSocket relay.
- Hamachi-friendly LAN mode.
- Multiplayer lobby with room codes, ready state, mode sync, diagnostics, and
  relay/LAN toggles.
- Host-authoritative multiplayer combat, waves, enemies, world time, pickups,
  boss state, player health, knockdown, revive, and wipe handling.
- Multiplayer pause is menu-only: opening the MP menu does not stop simulation.
- Downed players are immobilized and prone, with head-only look.
- Revive is a CPR minigame: start with `E`, then complete `30` LMB clicks.
- Downed bleed-out timer is `30` seconds.
- Dead players spectate live squadmates and can cycle targets with `Q`/`E`.
- Squad wipe returns everyone to the lobby while keeping the room alive.
- Personal kill cash is flat `$3` per kill.
- Rooftop .50cal has `250` rounds, synchronized ammo/belt visuals, synced fire
  animation, synced brass/audio, overheating, and empty ammo-box visuals.

## Repository Layout

```text
.
|-- index.html                  # Static entry point, import map, UI markup/CSS
|-- vercel.json                 # No-store headers for HTML/src during deploys
|-- README.md                   # This document
|-- scripts/
|   `-- lan-server.js           # Zero-dependency WebSocket LAN relay
|-- src/
|   |-- game.js                 # Main loop, modes, UI wiring, run lifecycle
|   |-- mp.js                   # Co-op lobby, sync, player state, revive, LAN
|   |-- net.js                  # PeerJS/WebRTC and LAN transport wrappers
|   |-- player.js               # Player movement, camera, survival state
|   |-- weapons.js              # Weapon system and viewmodel construction
|   |-- enemies.js              # Enemy simulation, bosses, ghost enemies
|   |-- waves.js                # Wave spawning and wave tags
|   |-- loot.js                 # Pickups, supply drops, shared MP loot
|   |-- inventory.js            # Loadout, backpack, gadgets, armory
|   |-- world.js                # Arena, collision, fortification structures
|   |-- vehicles.js             # Captured tank controls
|   |-- economy.js              # Cash constants and structure definitions
|   |-- audio.js                # Procedural and recorded audio system
|   |-- effects.js              # Particles, tracers, explosions, shell ejection
|   |-- ui.js                   # HUD, overlays, bars, lobby UI helpers
|   |-- engine.js               # Renderer/camera/scene wrapper
|   |-- input.js                # Keyboard, mouse, pointer lock
|   `-- *model.js               # Voxel/GLB model builders
|-- vendor/
|   |-- three.module.min.js
|   |-- GLTFLoader.js
|   `-- BufferGeometryUtils.js
|-- assets/
|   |-- jet.mp3
|   |-- crew-lines.mp3
|   `-- modely/
`-- sounds/
    `-- weapons/m2hb_v2/        # .50cal audio set
```

There is intentionally no `package.json`. The browser imports Three.js from
`vendor/` through the import map in `index.html`, and PeerJS is loaded from the
CDN script tag in `index.html`.

## Browser Requirements

Recommended browsers:

- Chrome / Chromium
- Edge
- Safari can run the static game, but WebRTC behavior may differ by network.

The game needs:

- HTTP serving, not `file://`
- WebGL
- Pointer Lock
- Web Audio
- ES modules
- WebRTC DataChannels for WebRTC co-op
- WebSocket support for LAN mode

## Local Development

Start a static server:

```bash
python3 -m http.server 8099
```

Open:

```text
http://localhost:8099/?cb=v190
```

The `?cb=` query is only a cache-bust helper. The actual module version shown in
the lobby comes from the script URL:

```html
<script type="module" src="./src/game.js?v=190"></script>
```

When changing game code, bump this `v=` value in `index.html` and update
`GAME_BUILD` in `src/game.js`. The lobby bottom-right build label should then
show the same version the browser actually loaded.

Syntax checks:

```bash
node --check src/game.js
node --check src/mp.js
node --check src/player.js
node --check src/world.js
node --check src/economy.js
git diff --check
```

For targeted edits, at minimum check the touched JavaScript files.

## Vercel Deployment

The project deploys as a static site.

Recommended Vercel settings:

```text
Framework preset: Other
Build command:    leave empty
Output directory: ./
```

`vercel.json` sets `Cache-Control: no-store, max-age=0` for `/`, `index.html`,
and `/src/:path*` so preview/prod deployments do not keep stale source files
while the team is rapidly testing builds.

After deploy, verify the build label in the co-op lobby. For this README it
should say:

```text
ENGENDROS PURGE v190 (2026-06-02 10:01 WEST)
```

## Multiplayer Overview

There are two transport modes:

1. `NET: WEBRTC`
   - Uses PeerJS for signaling and WebRTC DataChannels for game messages.
   - Uses public OpenRelay STUN/TURN fallback servers from `src/net.js`.
   - Good for normal internet play when NAT/firewalls allow it.

2. `NET: LAN`
   - Uses the local WebSocket relay in `scripts/lan-server.js`.
   - Designed for Hamachi or same-LAN play.
   - Avoids WebRTC NAT problems by having both browsers talk to the host Mac's
     WebSocket relay.

The game protocol is the same at the MP layer: host is authoritative, clients
send inputs/claims/requests, and host broadcasts canonical state.

### Multiplayer Authority Model

Host owns:

- game mode
- wave start/advance
- enemy spawning, movement, damage, death, boss state
- player health/down/waiting/dead state
- revive authorization
- shared loot and pickup grants
- supply drops
- fortification placement validation
- day/night and blood moon state
- survive clock and enemies-left count
- .50cal seat ownership and synchronized ammo state
- squad wipe detection and return-to-lobby flow

Clients own locally:

- camera and input feel
- weapon viewmodel presentation
- local HUD
- local personal bank/meta persistence
- cosmetic ghost visuals for remote shots/projectiles/enemies

## Hamachi / LAN Co-op

Use this when normal WebRTC or iPhone hotspot routing fails.

On the host Mac:

```bash
node scripts/lan-server.js --host 0.0.0.0 --port 8787
python3 -m http.server 8099
```

Open on the host:

```text
http://localhost:8099/?cb=v190
```

Open on the other machine through the host Mac's Hamachi IP:

```text
http://25.44.189.90:8099/?cb=v190
```

Then:

1. Both players open the same Hamachi HTTP URL.
2. In the co-op lobby, switch from `NET: WEBRTC` to `NET: LAN`.
3. Host clicks host/create room.
4. Host copies the room code.
5. Client pastes the room code and joins.
6. Client clicks ready.
7. Host starts the run.

The LAN relay itself listens on port `8787`; the static game page in the current
workflow listens on port `8099`.

If Hamachi asks macOS for a driver/system-extension permission, it must be
approved manually in System Settings. Code cannot bypass that macOS security
prompt.

## WebRTC Co-op

Use `NET: WEBRTC` for normal browser-to-browser play.

Flow:

1. Both players open the same Vercel or local game URL.
2. Leave `NET: WEBRTC`.
3. Host creates a room.
4. Host copies the room code.
5. Client joins manually with that code.
6. Use `RELAY: AUTO` first.
7. If connection fails or diagnostics show ICE failure, retry with
   `RELAY: FORCE`.

The public room browser is intentionally disabled for this stabilization build.
Manual room codes are the expected flow.

### ICE / TURN Configuration

Default ICE servers live in `src/net.js` and currently use OpenRelay public
STUN/TURN entries.

Priority order for ICE configuration:

1. `window.ENGENDROS_ICE_SERVERS`
2. `localStorage.engendros_ice_servers`
3. built-in OpenRelay fallback

Force relay can be enabled by:

```js
localStorage.setItem('engendros_force_relay', '1')
```

Custom ICE example for local testing:

```js
localStorage.setItem('engendros_ice_servers', JSON.stringify([
  { urls: 'stun:example.com:3478' },
  {
    urls: [
      'turn:example.com:3478?transport=udp',
      'turn:example.com:3478?transport=tcp'
    ],
    username: 'user',
    credential: 'pass'
  }
]))
```

Clear overrides:

```js
localStorage.removeItem('engendros_ice_servers')
localStorage.removeItem('engendros_force_relay')
```

No custom VPS/TURN server is required for the current Hamachi/LAN workflow.

## Lobby Diagnostics

The co-op lobby shows connection diagnostics so networking failures are easier
to separate from game-code bugs.

Important fields:

- `NET`: WebRTC or LAN mode.
- `RELAY`: automatic WebRTC ICE or forced relay.
- `ICE`: observed ICE candidate types such as host/srflx/relay.
- `State`: ICE/data-channel state.
- `Message`: latest useful handshake or failure detail.
- `Advice`: short next step when NAT/firewall/TURN/relay issues appear.

Common interpretations:

- Broker OK but data wait: signaling worked, WebRTC route is still forming.
- ICE failed: browsers could not find a usable direct/relay route.
- Relay available: TURN candidate exists, but not necessarily selected.
- Relay route active: traffic is actually going through TURN.
- LAN relay OK: WebSocket relay is reachable; remaining issue is room/handshake.

## Game Modes

### Purge

Arcade wave mode. This is the default multiplayer mode. In MP, host explicitly
sends bright noon world-time state so clients cannot get stuck in darkness from
a previous mode.

### Long Night

Endless survival with day/night cycle, survive clock, darker nights, and blood
moon state. In multiplayer the host is the only machine that advances time and
broadcasts the sky/clock state. Clients apply host state and periodically correct
drift.

## Co-op Life Cycle

### Ready / Start

- Host is always ready.
- Clients must click ready.
- Host cannot start until all connected clients are ready.
- Host's selected mode is authoritative and mirrored to clients.

### No Real Pause In Multiplayer

In solo, pause still pauses the game. In multiplayer, opening the menu/pointer
unlock is only an overlay. Simulation continues:

- enemies keep moving
- bleed timers keep ticking
- waves keep advancing
- other players keep playing

Quit-to-menu from MP leaves the run/room intentionally.

### Downed State

When a player loses HP in co-op:

- First and second downs are survivable.
- Third down becomes permanent death.
- Downed timer is `30` seconds.
- Downed player cannot move, shoot, loot, mount, drive, switch weapons, or
  interact.
- Downed camera is low/prone.
- Remote players see the downed body lying on the ground.
- The downed body does not rotate with camera aim; only the head can look.

### Revive / CPR

Current v190 revive rules:

- Reviver must be on foot.
- Reviver must be near the downed player.
- Reviver must be looking at the downed body.
- Press `E` to start CPR.
- After CPR starts, click LMB `30` times.
- The speed is player-dependent; there is no fixed 10-second duration.
- Reviver sees the CPR progress bar.
- Downed player also sees the incoming revive progress.
- Host validates revive progress before accepting the final revive.
- Revived player returns with half HP and normal controls.

If the reviver walks away, target state changes, or CPR becomes invalid, progress
is cancelled.

### Waiting / Permanent Death / Spectate

If bleed-out finishes, the player enters waiting state. If a player reaches the
permanent death state:

- their backpack spills once
- controls are disabled
- camera spectates live squadmates
- `Q` / `E` cycles spectate targets

Spectate starts only after permanent death, not while merely downed.

### Squad Wipe

When every player is dead or waiting, the run ends. The room stays open:

- everyone returns to the same lobby
- roster remains
- clients are set unready
- host remains host
- host can start again after clients ready up

If everyone is down but still bleeding out, the run does not instantly end. This
keeps the 30-second revive window meaningful.

## Economy

Current core cash constants in `src/economy.js`:

```js
KEY_CASH = 60
KILL_CASH = 3
SUPPLY_CASH = 600
```

Important distinction:

- Personal kill cash is flat `$3`.
- Score still uses enemy reward values and boss bonuses.
- Shared loot and supply drop systems can still grant items/resources.
- Supply drops and materials are separate from personal kill cash.

## Weapons, Gadgets, And Interactions

The current weapon list is defined in `src/weapons.js`. It includes melee,
pistols, SMGs, rifles, shotguns, snipers, launchers, and the fixed rooftop
M2-style .50cal.

Gadgets/loadout items live in `src/inventory.js` and include:

- Frag Grenades
- Molotov
- Flashlight
- Binoculars

Fortification pieces live in `src/economy.js`:

- Sandbags
- Barricade
- Barbed Wire

Structure cap:

```js
STRUCT_CAP = 44
```

## Rooftop .50cal

The fixed rooftop .50cal is implemented by `MountedGun` in `src/weapons.js`.

Current behavior:

- mounted with `E` when near it
- dismounted with `E`
- only one MP occupant at a time
- host-authoritative seat claim
- `250` total rounds
- overheating can eject the gunner
- synchronized barrel aim for remote players
- synchronized muzzle flash/tracers
- synchronized brass/audio
- synchronized ammo state
- ammo belt visuals decrement for everyone
- empty ammo box removes/hides remaining ammo model

## Tank / Vehicle

The captured tank/vehicle path is implemented in `src/vehicles.js` and related
model files. Interactions:

- `E`: enter/exit
- `Q`: switch driver/gunner seat
- `T`: thermal toggle as gunner
- `C`: gunner peek stance

Enemies/boss systems also use tank-specific assets and behaviors in
`src/enemies.js`, `src/bosstank.js`, `src/tankglb.js`, and model helpers.

## Controls

General:

```text
WASD        move
Mouse       aim
LMB         fire/use held item/build/CPR click
R           reload
V           quick melee
E           interact / revive start / mount / loot / enter-exit
Q           tank seat switch, or spectate previous/next in death state
F           fullscreen
B           fire mode
G           drop current inventory slot
I           inventory
M           mute/unmute
1-9         select inventory slot
MouseWheel  cycle weapon/item
Shift+Wheel rotate held build piece
Esc         solo pause; MP overlay only
```

Contextual:

```text
Downed              head look only, no movement/body rotation
Dead spectate       Q/E cycle live players
CPR revive          E to start, then 30 LMB clicks
.50cal              E dismount, LMB fire
Tank gunner         T thermal, C peek
Flashlight held     E toggles beam if nothing else is nearby
Molotov/Grenade     hold/release LMB according to held item behavior
Binoculars          RMB glassing
```

## Testing Checklist

Basic static checks:

```bash
node --check src/game.js
node --check src/mp.js
node --check src/player.js
node --check src/world.js
node --check src/economy.js
git diff --check
```

Local page:

```bash
python3 -m http.server 8099
curl -fsS 'http://localhost:8099/?cb=v190' | rg 'game\.js\?v=190'
```

Hamachi page:

```bash
curl -fsS 'http://25.44.189.90:8099/?cb=v190' | rg 'game\.js\?v=190'
```

Manual MP test plan:

1. Host and client load same URL.
2. Host creates room.
3. Client joins room code.
4. Client ready, host start.
5. In Purge mode, both players see bright noon.
6. In Long Night mode, both players see same sky/clock/blood moon.
7. Press Esc on either machine; MP keeps running.
8. Down a player; they cannot move, shoot, loot, mount, or rotate body.
9. Other player sees prone body.
10. Reviver looks at downed body and presses `E`.
11. Reviver clicks LMB 30 times.
12. Both reviver and downed player see progress.
13. Revived player regains normal camera/control.
14. Permanent dead player spectates live teammate and cycles with Q/E.
15. Squad wipe returns everyone to lobby without closing the room.
16. Clients ready again; host starts another run.
17. Kill a normal enemy, elite, and boss/tank path; personal cash remains `$3`
    per kill while score/shared loot still behave separately.
18. Mount .50cal, fire until empty; ammo/belt/box visuals sync for all players.

## Common Troubleshooting

### Page Does Not Load

- Make sure it is served over HTTP.
- Use `python3 -m http.server 8099`.
- Open `http://localhost:8099/?cb=v190`.
- Check browser console for module load or asset path errors.

### Browser Shows Old Version

- Confirm `index.html` points at `./src/game.js?v=190`.
- Hard refresh.
- Add or change the `?cb=` query.
- On Vercel, verify `vercel.json` no-store headers are deployed.
- Confirm the lobby build label.

### WebRTC Connects To Broker But Fails ICE

- Try `RELAY: FORCE`.
- Re-host with a fresh room code.
- Try a different network.
- If both devices are on Hamachi, use `NET: LAN` instead.
- If forced relay fails too, the relay may be blocked/unavailable from that
  network.

### Hamachi / LAN Mode Fails

On the host Mac:

```bash
node scripts/lan-server.js --host 0.0.0.0 --port 8787
python3 -m http.server 8099
```

Then check:

- both machines are in the same Hamachi network
- both open the host Mac's Hamachi HTTP URL
- lobby is switched to `NET: LAN`
- static page port is `8099`
- LAN relay port is `8787`
- macOS firewall/Hamachi driver permission is approved

### Room Code Copy Does Not Work

The game uses `navigator.clipboard` when allowed and falls back to a hidden
textarea plus `document.execCommand('copy')`. If a browser blocks both, select
and copy the visible room code manually.

### Multiplayer Pause Seems To Stop The Game

Solo pause stops the game. Multiplayer pause should only open an overlay. If
MP simulation stops after Esc, test both host and client and check whether
`mp.active` is unexpectedly false.

### Downed/Revive Bugs To Watch For

- Downed player should not move at all.
- Downed body should not rotate with mouse aim.
- Downed player should still be able to look with head/camera.
- Revive should not start automatically.
- Revive should start only with `E` while looking at a downed body.
- Revive should require exactly 30 LMB clicks.
- Both players should see the progress bar.
- If everyone is down, the game should wait for bleed-out, not return to lobby
  instantly.

## Current Known Constraints

- No managed backend/game server.
- WebRTC still depends on browser/network/NAT behavior unless LAN mode is used.
- Public OpenRelay TURN is a fallback, not a guaranteed production relay.
- Hamachi driver approval on macOS is manual.
- Static server process must remain running for local/Hamachi play.
- There is no npm project metadata yet; everything is plain static files.

## Adding New Features Safely

Recommended workflow:

1. Read the local system before editing.
2. Keep changes scoped to the relevant module.
3. Use host-authoritative logic for multiplayer state.
4. Do not add client-only gameplay state that can diverge in MP.
5. Keep lobby diagnostics honest when changing networking.
6. Bump `index.html` script `v=` and `GAME_BUILD` for playable releases.
7. Run syntax checks.
8. Smoke test local page and, for MP changes, at least one host/join session.

For multiplayer features, decide explicitly:

- Is the host authoritative?
- What message type carries the state?
- What happens for late joiners?
- What is cleared on run end?
- What is cleared on leave/host close?
- Does it work in both WebRTC and LAN mode?

## Important Files For Common Tasks

Networking:

- `src/net.js`
- `src/mp.js`
- `scripts/lan-server.js`

Run lifecycle:

- `src/game.js`
- `src/waves.js`
- `src/mp.js`

Player state:

- `src/player.js`
- `src/mp.js`
- `src/ui.js`

Weapons and .50cal:

- `src/weapons.js`
- `src/tuning.js`
- `src/effects.js`
- `src/audio.js`

Economy/building/loot:

- `src/economy.js`
- `src/loot.js`
- `src/world.js`
- `src/inventory.js`

Tank/boss visuals:

- `src/vehicles.js`
- `src/enemies.js`
- `src/bosstank.js`
- `src/tankglb.js`
- `assets/modely/`

## Release Notes: v190

This README is current through v190. Major recent co-op changes:

- world time/sky sync is host-authoritative
- Purge mode resets clients to bright noon
- Long Night syncs clock/night/blood moon from host
- MP pause no longer stops multiplayer simulation
- downed players are immobilized and visually prone
- downed body yaw is frozen; head look remains
- permanent death spectates live players
- squad wipe returns to lobby without closing the room
- revive starts with `E` and requires 30 CPR clicks
- down timer is 30 seconds
- revive progress is shown to both reviver and downed player
- kill cash is flat `$3`
- .50cal has 250 rounds and synced ammo/belt visuals

## Credits / Maintenance

ENGENDROS PURGE is developed in this repository as a browser-first static game.
Current maintenance workflow uses local Codex-assisted edits, direct browser
smoke tests, and Git pushes to trigger Vercel preview/prod deployments.
