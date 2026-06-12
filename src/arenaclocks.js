// arenaclocks.js — a little clock stand near the ARENA spawn showing BOTH live world-clock
// displays side by side, so the time feature is visible the moment you spawn:
//   • analog «ЧАСОЗБОР» wall clock (driven via handAngles)
//   • digital «Электроника 6.15М» desk clock (driven via formatHHMM)
// Both read the ONE source of truth game._worldClock (the displays contract,
// docs/superpowers/specs/2026-06-12-worldclock-displays-contract.md). Arena-only — the demo
// house keeps its own placements. The clocks register asynchronously, so they're mounted
// lazily from update() and driven every frame.
import * as THREE from 'three';
import { MeshBuilder, voxelMaterial } from './util.js';
import { placeProp, hasModel } from './props/registry.js';
import { getSpec } from './props/registry-core.js';
import { buildSpec } from './props/voxel-interp.js';
import { makeDigitalClockFace } from './clockface.js';
import { formatHHMM, handAngles } from './worldclock.js';

const WD = { hi: 0x9a7242, mid: 0x6a4a2a, lo: 0x49321a };  // pine-ish wood, layered shading

export class ArenaClocks {
  constructor(game) {
    this.game = game;
    this.scene = game.world.scene;
    // ~7 m in front of the arena spawn (0,0,30, looking +Z). Everything faces -Z (rotation.y=π),
    // back at the player — same convention as the demo-house wall clock. World space (no group):
    // the post sits at the BACK (larger z), clocks + shelf in FRONT (smaller z, toward the player).
    this.cx = 0; this.bz = 37.0;                 // post (backing) z
    this._deskClock = null; this._wallHour = null; this._wallMinute = null;
    this._placed = false; this._blinkT = 0;
    this._buildStand();
  }

  _buildStand() {
    const X = this.cx, BZ = this.bz;
    const mb = new MeshBuilder();
    // backing post (at the back, BZ)
    mb.box(0.74, 2.10, 0.10, X, 1.05, BZ, WD.mid);
    mb.box(0.74, 0.07, 0.12, X, 2.06, BZ, WD.hi);    // top cap (lit strip)
    mb.box(0.74, 0.10, 0.12, X, 0.05, BZ, WD.lo);    // base (shadow)
    // shelf protruding toward the player (smaller z), for the desk clock
    mb.box(0.70, 0.06, 0.34, X, 0.92, BZ - 0.20, WD.mid);
    mb.box(0.70, 0.06, 0.03, X, 0.92, BZ - 0.36, WD.hi);   // shelf front lip (lit)
    mb.box(0.05, 0.18, 0.18, X - 0.30, 0.83, BZ - 0.12, WD.lo); // bracket L
    mb.box(0.05, 0.18, 0.18, X + 0.30, 0.83, BZ - 0.12, WD.lo); // bracket R
    const stand = new THREE.Mesh(mb.build(), voxelMaterial());
    stand.castShadow = false; stand.receiveShadow = false;
    this.scene.add(stand);
  }

  // Mount whichever clocks have registered (modelgen specs load async). Idempotent per clock.
  // rotation.y = π → the +Z-built dials/faces point at -Z, i.e. back toward the player.
  _placeClocks() {
    const X = this.cx, BZ = this.bz;
    if (!this._wallHour && hasModel('wallclock-chasozbor')) {
      const wall = buildSpec(getSpec('wallclock-chasozbor'));
      wall.position.set(X, 1.60 - 0.141, BZ - 0.05);   // dial centre ≈1.60 m; back near the post
      wall.rotation.y = Math.PI;                        // dial faces the player (-Z)
      this.scene.add(wall);
      this._wallHour = wall.getObjectByName('handHour');
      this._wallMinute = wall.getObjectByName('handMinute');
    }
    if (!this._deskClock && hasModel('electronika-clock')) {
      const desk = placeProp(this.scene, 'electronika-clock', X, BZ - 0.20, Math.PI, { y: 0.95 }); // on the shelf, facing -Z
      const face = makeDigitalClockFace({ widthM: 0.150, heightM: 0.044 });
      face.mesh.position.set(0, 0.047, 0.0595);          // local +Z front → world -Z (player) after yaw=π
      desk.add(face.mesh);
      this._deskClock = { obj: desk, face };
    }
    this._placed = !!(this._wallHour && this._deskClock);
  }

  update(dt) {
    if (!this._placed) this._placeClocks();
    const wc = this.game._worldClock;
    if (!wc) return;
    if (this._wallHour && this._wallMinute) {
      const a = handAngles(wc.minuteOfDay() + wc.alpha);  // negative z = clockwise on the +Z dial
      this._wallHour.rotation.z = -a.hourRad;
      this._wallMinute.rotation.z = -a.minuteRad;
    }
    if (this._deskClock) {
      this._blinkT += dt;
      this._deskClock.face.setTime(formatHHMM(wc.minuteOfDay()), { blink: (this._blinkT % 1) < 0.5 });
    }
  }
}

// Arena-only. Returns null elsewhere (demo/steppe have their own placements).
export function installArenaClocks(game) {
  if (!game || !game.world || game.mapId !== 'arena') return null;
  try { return new ArenaClocks(game); } catch (e) { console.warn('[arenaclocks] build failed', e); return null; }
}
