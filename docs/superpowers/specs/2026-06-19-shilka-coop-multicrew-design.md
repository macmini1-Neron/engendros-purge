# Shilka co-op multi-crew sync — design

**Date:** 2026-06-19 · **Branch:** `codex/shilka-flagship-mechanics` (PR #99) · **Status:** design, pending owner review

## Goal

Make the drivable ЗСУ-23-4 «Shilka» work in host-authoritative co-op as a **multi-crew vehicle**: one player drives while others ride/man the turret, and **everyone sees the same vehicle move, tilt, and turn**. This slice builds the **seating + movement foundation**; the autocannon (aim / fire / ballistics / damage) is a later slice, with its message shapes reserved here so it drops in cleanly.

This is net-authority work — the project's #1 footgun (`CLAUDE.md`: "Co-op authority is a footgun"). The design leans entirely on the **existing seated-weapon precedents** already shipped and proven: the rooftop `.50-cal` (`fiftyclaim`/`fiftystate`/`fiftyaim`/`fiftyfire`) and the `mortar` (`mortarclaim`/`mortarstate`/`mortaraim`/`mortarfirereq`).

## Authentic crew (4) → seats

The real Shilka crew is four. Seats are fixed; the driver sits isolated in the front hull and the other three sit side-by-side in the turret.

| Seat | Role | Russian | Location | Controls (this slice) |
|---|---|---|---|---|
| 0 | Driver | Механик-водитель | front hull (isolated) | full driving (gearbox, periscope) |
| 1 | Commander | Командир установки | turret | ride-along (camera only) |
| 2 | Gunner / search op | Наводчик (оператор поиска) | turret | **radar on/off** (placeholder) |
| 3 | Range operator | Оператор дальности | turret | ride-along (camera only) |

- The **driver cannot switch seats** (separate compartment) and may **dismount only when the vehicle is stopped** (`|speed| < ε`).
- Turret seats can be entered/left freely.
- Full fire-control for seat 2 (turret traverse, gun elevation, radar lock, lead, firing) is **deferred** to the autocannon slice. For now seat 2's only control is the existing radar **on/off** toggle, shared as a vehicle flag.

## Key architectural insight

Unlike enemies (host-spawned, streamed as ghosts via `espawn`/`esnap`), **the Shilka is placed identically on every client at world init** (`game.js:132-139`, by `opts.id` e.g. `shilka-demo`). So co-op sync is **not** "spawn a ghost" — it is only **"who occupies which seat, and where is the vehicle."** We drive the **existing local rig** on each client from received state; we never instantiate a remote copy.

## Authority model (the crux)

| Concern | Authority | Mirrors |
|---|---|---|
| **Seat occupancy** | **Host** — clients request, host assigns, broadcasts result | `.50-cal` / mortar claim |
| **Vehicle movement** | **Driver client** — simulates `stepDrive` locally, broadcasts the transform; others interpolate | player `xf` (each client owns its own avatar's motion) |
| **Turret/gun aim** | Gunner client broadcast *(deferred; radar on/off only now)* | `mortaraim` |
| **Fire & damage** | **Host** — gunner requests, host simulates ballistics + applies damage *(deferred)* | enemy `hit` / mortar fire |

**Why driver-authoritative movement (owner-approved):** mirrors the proven player-`xf` pattern (each client already owns its own movement), gives the driver **zero input lag** (we just polished that driving feel), and co-op here is PvE so trusting a client for its own vehicle position is a non-issue. The host still owns everything that affects fairness — occupancy and (later) damage. The world/terrain is deterministic and identical on every client, so the driver's local collision is consistent.

**Solo (no co-op, owner-approved): one role at a time.** A solo player mounts a specific seat; to change role they dismount (vehicle stopped) and mount another. Solo = drive **or** man the turret, never both at once. With `mp` dormant, all of the below collapses to local-only: the driver simulates and applies directly, no messages sent.

## Message protocol (new)

Envelope is the standard `{ t, d, _r? }`. `send` = client→host / host→all; `broadcast` = everyone (host relays with `_r`); `sendTo` = host unicast.

### `shilkaclaim` — client → host: seat request
```js
{ v: 'shilka-demo', seat: 0..3, want: 'mount' | 'dismount' }
```
Host validates: seat in range, target seat empty (for mount) / occupied-by-sender (for dismount), and for the **driver dismount** that the host's last-known `speed ≈ 0` (defensive; the client also self-enforces). On success the host updates occupancy and broadcasts `shilkastate`. On rejection the host replies `shilkastate` unchanged (the client reconciles — it never assumes success).

### `shilkastate` — host → all: authoritative vehicle state
```js
{ v: 'shilka-demo', seats: [id|null, id|null, id|null, id|null], radar: bool, engineOn: bool }
```
Sent on any occupancy/flag change and in the late-join snapshot. `seats[i]` = the player id in seat `i`, or `null`. This is the **single source of truth** for who is where; remote-occupant visuals (hide held weapon, seat the ghost) derive from it — no change to `xf` needed.

### `shilkamove` — driver client → all (broadcast): vehicle transform
```js
{ v: 'shilka-demo', x, z, heading, pitch, roll, gear, speed, wheelSpin, trackScroll }
```
Sent ~every 66 ms **only by the seat-0 occupant**. The host **validates the sender is the current driver** before relaying (drops spoofed moves). Recipients apply it to the existing local rig via the same path `_applyRig` uses (position/heading on `vehicleRoot`, tilt on `rig.body`, wheel spin / track scroll), with short interpolation to hide the 66 ms cadence. `y` is recomputed locally from the shared terrain at `(x,z)` (deterministic) to avoid sending it.

### Reserved (autocannon slice — shapes fixed now, not implemented)
- `shilkaaim` (gunner → all): `{ v, turretYaw, gunPitch, radar }`
- `shilkafire` (host → all): `{ v, seed, muzzle, dir, seconds }` — visual burst
- `shilkahit` (client → host): `{ v, eid, dmg }` — host applies damage

## Control flow

### Local (mp dormant)
`mount(seat)` → set occupant locally → if seat 0, `driveMode` on, run `_driveControlUpdate` each frame → `dismount()` (guarded by stopped, for driver). No messages. Identical to today, just seat-aware.

### Co-op — becoming the driver
1. Player presses mount at the driver station → `net.send('shilkaclaim', {v, seat:0, want:'mount'})`. Locally optimistic-pending (no control until granted).
2. Host `_hostShilkaClaim`: seat 0 empty? → assign sender, `broadcast('shilkastate', …)`.
3. All clients `_applyShilkaState`: set `seats`; if `seats[0] === myId` → this client enters drive mode (start simulating + broadcasting `shilkamove`); others mark seat 0 occupied (hide that player's weapon, seat their ghost).

### Co-op — driving each frame
- **Only the seat-0 occupant** runs `_driveControlUpdate` (local sim) and `broadcast('shilkamove', …)` at 66 ms.
- **Everyone else** (other occupants, outside players, the host if not driving) runs **`_applyRemoteMove`** instead: interpolate toward the last `shilkamove` and apply to the rig. They must **not** run `_driveControlUpdate` (would double-simulate / fight the sync).
- Gate in `controlUpdate` (game.js:1099 call site): `isDriverHere = !mp.active || seats[0] === myId`. Driver path vs remote-apply path branch on it.

### Co-op — turret seat (radar placeholder)
- Mount via `shilkaclaim` (host-assigned like the driver). The seat-2 occupant's radar on/off toggles set `radar` and the host re-broadcasts `shilkastate`. Other seats (1,3) are camera-only ride-alongs.

### Dismount
- Driver: client self-checks `|speed| < ε`; if moving, refuse + HUD hint "STŮJ PRO VÝSTUP". If stopped → `shilkaclaim {want:'dismount'}`; on `shilkastate` with `seats[0]===null` the vehicle coasts/holds (see below) and the player is freed.
- Turret seats: free anytime.

### Empty-seat behaviour
When the driver leaves, the vehicle is **stopped** (dismount is gated on stopped), so it simply holds position with the parking brake — `drive.speed = 0`, gear stays as left. No one simulates it until a driver re-mounts. Turret occupants remain seated and continue to see the (static) vehicle.

## Late-join

Extend `_sendWorldTo(pid)` (`mp.js:1142`): for each Shilka instance, `sendTo(pid, 'shilkastate', …)` (occupancy + flags) and, if a driver is seated, the latest `shilkamove` transform, so the joiner sees occupied/positioned vehicles immediately.

## hostSim / footgun checklist

- Movement is **driver-authoritative**, so it is **not** behind `hostSim` — but the **guard that only the driver simulates** is mandatory (everyone else applies `shilkamove`); otherwise every client double-runs `_driveControlUpdate` and the vehicle fights itself.
- Occupancy mutations happen **only on the host** (`_hostShilkaClaim`); clients only request and reconcile from `shilkastate`.
- Fire/damage (deferred) will be **host-authoritative** as usual (`hostSim` + hit-claim), never client-applied.
- `xf` is unchanged; seat visuals derive from `shilkastate` (authoritative), not from a per-frame `xf` flag.

## Scope

**This slice:** authentic 4-seat model · host-authoritative occupancy (`shilkaclaim`/`shilkastate`) · driver-authoritative movement (`shilkamove` broadcast + remote apply with interpolation) · remote-occupant visuals from `shilkastate` · radar on/off as a shared flag · driver dismount-only-when-stopped · late-join snapshot · solo = one-role-at-a-time (local, no messages).

**Deferred (autocannon slice):** turret traverse / gun elevation, radar lock + lead, firing, host-authoritative ballistics + projectile damage, gunner optic/sight. Message shapes `shilkaaim`/`shilkafire`/`shilkahit` reserved above.

## Testing

- **Pure / unit:** seat-assignment logic (claim → occupancy transition, reject double-claim, driver-dismount-while-moving rejected) as a small pure helper if extractable; the existing 43 drive tests stay green (movement model untouched).
- **Solo regression:** mounting/driving/dismount unchanged with `mp` dormant (headless, real-GPU: mount seat 0, drive a few frames, dismount stopped).
- **Co-op:** loopback `coop.test.mjs`-style check of the message round-trip (claim → state, move relay validates driver) if the harness supports it; **2-PC live WebRTC is the final manual gate** (cosmetic-but-stateful, like the poker ante-ack note) — one PC drives, the other rides + watches the Shilka move/tilt in real time.

## Open implementation details (decided sensibly, flagged for the plan)

- **Seat selection on approach:** proximity-based — the **driver hatch (front)** mounts seat 0; the **turret** mounts the first free turret seat (or a tiny picker if >1 free). Authentic and intuitive; no global menu.
- **Interpolation:** short positional/heading lerp (~2–3 frames) on `shilkamove`, matching `RemotePlayer`'s smoothing, so 66 ms cadence reads smooth.
- **Vehicle id:** `opts.id` (already unique per instance) is the `v` key in every message.
