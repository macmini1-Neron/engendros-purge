# ENGENDROS PURGE

A browser-based **voxel wave shooter** built with vanilla JavaScript and [Three.js](https://threejs.org/) — no build step, no framework. Survive waves of Engendros-plush zombies across a dust2-inspired arena with a big roster of hand-modeled voxel weapons, a key → lootbox loot loop, perks, a shop, and bosses — including a **drivable T-90M tank**. Peer-to-peer co-op is built in.

## Play locally

It's a fully static site, so any static file server works. From the project root:

```bash
# Python
python3 -m http.server 8000

# …or Node
npx serve .
```

Then open <http://localhost:8000>.

> ⚠️ Serve it over HTTP, not by opening `index.html` as a `file://` URL — the game uses native ES modules and `fetch()` for assets, which browsers block on the file protocol.

## Hamachi / LAN co-op

For zero-cost co-op over Hamachi, run the game and the LAN relay on the host Mac:

```bash
node scripts/lan-server.js --host 0.0.0.0 --port 8787
python3 -m http.server 8099
```

Both players should open the host Mac's Hamachi URL, for example
`http://25.x.x.x:8099`. In the multiplayer lobby, switch `NET: WEBRTC` to
`NET: LAN`, host a room, and join with the room code.

## Deploy to Vercel

No configuration required — Vercel serves it as a static site:

1. Import this repo at [vercel.com/new](https://vercel.com/new).
2. **Framework preset:** Other · **Build command:** *(leave empty)* · **Output directory:** `./`
3. Deploy → you get a public `*.vercel.app` URL that's playable in any browser.

Every push to `main` then auto-redeploys.

## Tech

- **Rendering** — Three.js (vendored in `vendor/three.module.min.js`) loaded via native ES modules + an import map.
- **Multiplayer** — [PeerJS](https://peerjs.com/), peer-to-peer (no game server needed).
- **Models** — hand-built voxel meshes plus a GLTF tank model (`assets/modely/`).
- **Code** — `src/game.js` is the core game loop; `src/*model.js` build the voxel / GLB props; `src/{engine,input,audio,effects,net,util}.js` are the supporting systems.

## Controls

Standard FPS controls — move with **WASD**, aim and fire with the **mouse**. The in-game UI covers the rest (reload, weapon switch, interact, abilities).

---

🤖 Project scaffolded & maintained with [Claude Code](https://claude.com/claude-code).
