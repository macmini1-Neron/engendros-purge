// PokerSceneRenderer — the 3D presentation layer for the poker table (Phase 0: placeholder geometry,
// real readable cards + exact chip stacks). It EXTENDS PokerDomRenderer so the lobby screens and the
// (already-polished) action bar / slider / timer / banner are reused UNTOUCHED as a 2D HUD on top; only
// the felt (table, seats, cards, chips, pot) is drawn in 3D. Mini-scene pattern mirrors fonoteka.js:
// own WebGLRenderer on a dedicated canvas, own scene + 3/4 camera + a single lamp spotlight, dark
// surround. render(dt) is driven from Game._frame (state==='poker'); netcode + engine are untouched.
import * as THREE from 'three';
import { PokerDomRenderer } from './poker-ui.js';
import { makeCardMesh, setCardFace } from './poker-cards.js';
import { makeChipStack, makeChipTray, setChipTray } from './poker-chips.js';
import { sigOf, exactSubset, subSet, addSet, largestFormableLE } from './poker/chipbank.js';
import { buildSpec } from './props/voxel-interp.js';
import { buildFieldRadio } from './props.js';
import { RADIO_STATIONS, GHOST_STATION, stationByIndex, stationLabel } from './radio.js';
import { Tween, easeOutCubic } from './poker/anim.js';
import { derivePokerEvents } from './poker/pokerevents.js';
import { dealOrder } from './poker/dealorder.js';
import { PokerHover } from './poker-hover.js';

const DEAL_FLIGHT = 0.20;   // s — a single hole card's pitch from the centre deck to its seat
const DEAL_STAGGER = 0.07;  // s — gap between consecutive pitches (one card at a time, real dealer cadence)

const SCENE_CSS = `
#poker .pk-canvas { position:absolute; inset:0; width:100%; height:100%; z-index:0; display:none; }
#poker.pk3d .pk-canvas { display:block; }
#poker.pk3d .pk-wrap { background:transparent; }
#poker.pk3d #pk-oppts, #poker.pk3d #pk-board, #poker.pk3d .pk-pot, #poker.pk3d #pk-you { display:none !important; }
#poker.pk3d .pk-felt { background:transparent; pointer-events:none; }
#poker.pk3d .pk-felt .pk-actions, #poker.pk3d .pk-felt .pk-timer, #poker.pk3d .pk-felt .pk-banner { pointer-events:auto; }
#poker.pk3d .pk-banner { text-shadow:0 2px 8px #000, 0 0 18px rgba(0,0,0,.8); }
#poker .pk-radio { position:absolute; left:18px; bottom:16px; z-index:3; display:none; align-items:center; gap:7px;
  padding:7px 11px; border-radius:8px; background:rgba(11,18,17,.82); border:1px solid var(--brass-deep,#58421a);
  font-family:var(--font-mono,monospace); color:var(--ink,#e8e4d8); font-size:13px; }
#poker.pk3d .pk-radio { display:flex; }
#poker .pk-radio button { cursor:pointer; border:1px solid var(--brass-lo,#9a7636); border-radius:5px; padding:3px 9px;
  background:linear-gradient(180deg,#14211d,#0d1613); color:var(--ink,#e8e4d8); font-family:var(--font-mono,monospace); font-size:13px; }
#poker .pk-radio button:hover { border-color:var(--brass,#d8b066); }
#poker .pk-radio #pk-radio-st { min-width:150px; text-align:center; color:var(--brass-hi,#f3d999); }
#poker .pk-radio.on #pk-radio-pow { color:var(--go,#5cae8c); border-color:var(--go,#5cae8c); }
`;

const SUITS_LABEL = ['c', 'd', 'h', 's'];

// ---- camera poses (FIRST DRAFT — owner tunes these) ----------------------------------------------
// Each pose is { pos:[x,y,z], look:[x,y,z], fov }. 'seated' is the default 3/4 view; the others are
// the click-to-view targets. Dial new numbers in poker-freecam-dev.html (?cam=x,y,z,lx,ly,lz,fov)
// and paste them here — the click handler tweens between whichever poses you define.
const CAM_POSES = {
  seated: { pos: [0.0, 0.37, 0.99], look: [0, -0.05, -0.22], fov: 56 }, // matches _initThree default
  board:  { pos: [0.0, 0.34, 0.34], look: [0, 0.02, -0.05], fov: 34 },  // TV close-up of the community cards (table centre)
  hole:   { pos: [0.0, 0.30, 0.66], look: [0, 0.14, 0.52], fov: 40 },   // close-up of your own two cards
  poster: { pos: [0.53, 0.50, -0.01], look: [1.05, 0.50, -1.0], fov: 42 }, // walk up to the hand-rankings poster (back-right wall) — whole sheet centred
};
const _mix = (a, b, t) => a + (b - a) * t;
const _clonePose = (q) => ({ pos: q.pos.slice(), look: q.look.slice(), fov: q.fov });

export class PokerSceneRenderer extends PokerDomRenderer {
  constructor(root, cb) {
    super(root, cb);
    this._scene = null; this._sceneKey = null; this._n = 0; this._size = [0, 0];
  }

  mount() {
    super.mount();
    if (!document.getElementById('pk3d-style')) {
      const st = document.createElement('style'); st.id = 'pk3d-style'; st.textContent = SCENE_CSS;
      document.head.appendChild(st);
    }
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pk-canvas';
    this.root.insertBefore(this.canvas, this.root.firstChild); // behind .pk-wrap (z-index:2)
    this._initThree();
    this._buildRadioControl();
    this.root.addEventListener('pointerdown', (e) => this._onPokerClick(e)); // click the cards → TV close-up, click again / felt → back
    this._hover = new PokerHover(this); // hover outline + mini info-card (chips / cards / blinds)
  }

  // ---- click-to-view camera (first draft; poses in CAM_POSES) ----
  _setCamPose(name) {
    if (!CAM_POSES[name] || (this._camPose === name && !this._camTw)) return;
    this._camFrom = _clonePose(this._camLive); // tween FROM the live interpolated pose → smooth even mid-fly
    this._camPose = name;
    this._camTw = new Tween(0.55);
  }
  _stepCamera(dt) {
    if (!this._camTw && this._camPose === 'seated') return; // at rest in the default seat → leave the camera untouched
    if (this._camTw) {
      const p = easeOutCubic(this._camTw.step(dt));
      const f = this._camFrom, t = CAM_POSES[this._camPose];
      this._camLive = {
        pos: [_mix(f.pos[0], t.pos[0], p), _mix(f.pos[1], t.pos[1], p), _mix(f.pos[2], t.pos[2], p)],
        look: [_mix(f.look[0], t.look[0], p), _mix(f.look[1], t.look[1], p), _mix(f.look[2], t.look[2], p)],
        fov: _mix(f.fov, t.fov, p),
      };
      if (this._camTw.done) { this._camTw = null; this._camLive = _clonePose(t); }
    } else {
      this._camLive = _clonePose(CAM_POSES[this._camPose]); // holding a non-seated pose
    }
    const c = this._camLive;
    this.cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    this.cam.lookAt(c.look[0], c.look[1], c.look[2]);
    if (Math.abs(this.cam.fov - c.fov) > 1e-3) { this.cam.fov = c.fov; this.cam.updateProjectionMatrix(); }
  }
  _onPokerClick(e) {
    if (!this._scene || !this.root.classList.contains('pk3d') || this._camLock) return; // _camLock = dev cam tuner owns the camera
    if (e.target && e.target.closest && e.target.closest('.pk-actions, .pk-timer, .pk-banner, .pk-radio, button, input')) return; // let the HUD handle its own clicks
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(ndc, this.cam);
    if (this._posterMesh && this._raycaster.intersectObject(this._posterMesh, true).length) { // click the rankings poster → walk up to it
      this._setCamPose(this._camPose === 'poster' ? 'seated' : 'poster'); return;
    }
    const hitHole = this._myHoleCards && this._myHoleCards.length && this._raycaster.intersectObjects(this._myHoleCards, true).length;
    const hitBoard = this._boardCards.length && this._raycaster.intersectObjects(this._boardCards, true).length;
    if (hitHole) this._peekHole();                                    // click YOUR cards → flip to peek (local only)
    else if (hitBoard) this._setCamPose(this._camPose === 'board' ? 'seated' : 'board'); // click the board → TV close-up
    else if (this._camPose !== 'seated') this._setCamPose('seated'); // click the felt → back to the seated view
  }
  // peek: flip your face-down hole cards up (or back down) with the SAME side-turn as the board. Local only —
  // it just animates rotation.z on the local meshes; the host never learns you looked, others never see them.
  _peekHole() {
    this._holePeeked = !this._holePeeked;
    const target = this._holePeeked ? 0 : Math.PI;
    for (const card of (this._myHoleCards || [])) this._turnCard(card, target);
  }
  _turnCard(card, targetRotZ) {
    const fromZ = card.rotation.z, baseY = card.position.y, tw = new Tween(0.4);
    this._anims.push((dt) => {
      if (!card.parent) return true;
      const p = easeOutCubic(tw.step(dt));
      card.rotation.z = fromZ + (targetRotZ - fromZ) * p;
      card.position.y = baseY + 0.02 * Math.sin(p * Math.PI);        // a small lift mid-turn (clears the felt)
      return tw.done;
    });
  }

  // ---- table animations (each anim is a closure(dt)->done; orphaned when its card is rebuilt away) ----
  _stepAnims(dt) {
    for (let i = this._anims.length - 1; i >= 0; i--) {
      let done = true;
      try { done = this._anims[i](dt); } catch (e) { done = true; }
      if (done) this._anims.splice(i, 1);
    }
  }
  // Deal a card in like a real dealer: PHASE 1 it drops onto the felt FACE-DOWN, then PHASE 2 it turns
  // over "from the side" — rotating about its long (Z) axis so a side edge lifts and the face reveals.
  // `rest` = {x,y,z,rotX}. `delay` staggers a flop (deal cards left→right). research B3.
  _flipInCard(card, rest, delay = 0) {
    const tw = new Tween(0.6, delay), dropY = 0.045;
    card.position.set(rest.x, rest.y + dropY, rest.z);
    card.rotation.set(rest.rotX || 0, 0, Math.PI);         // start: laid FACE-DOWN (turned over on the long axis)
    this._anims.push((dt) => {
      if (!card.parent) return true;                       // card rebuilt away → drop the anim
      const p = tw.step(dt);
      const dealP = easeOutCubic(Math.min(1, p / 0.4));        // phase 1 (0→0.4): drop onto the felt, face-down
      const turnP = easeOutCubic(Math.max(0, (p - 0.4) / 0.6)); // phase 2 (0.4→1): turn over from the side
      card.position.y = rest.y + dropY * (1 - dealP) + 0.018 * Math.sin(turnP * Math.PI); // settle down, lift a touch mid-turn so the edge clears the felt
      card.rotation.z = Math.PI * (1 - turnP);             // π (face-down) → 0 (face-up): the SIDE-edge turn the dealer does
      return tw.done;
    });
  }
  // Pitch a hole card in from the centre deck (face-down) to its resting spot, like a real dealer. It stays
  // HIDDEN until its `delay` slot, so cards appear ONE AT A TIME in dealing order, never all at once. Only the
  // position is animated — the card keeps whatever rest rotation the rebuild gave it (your own / opponents'
  // backs stay face-down; click-to-peek is unchanged). A frame-synced `pokerDeal` click fires as it lands.
  _dealInCard(card, rest, delay = 0) {
    const FELT_Y = 0.013;
    const sx = 0, sy = FELT_Y + 0.05, sz = -0.02;          // the deck at the table centre (where the board sits)
    const tw = new Tween(DEAL_FLIGHT, delay);
    const a = (typeof window !== 'undefined' && window.GAME) ? window.GAME.audio : null;
    let clicked = false;
    card.visible = false;
    this._anims.push((dt) => {
      if (!card.parent) return true;                       // card rebuilt away → drop the anim
      tw.step(dt);
      if (tw.t < tw.delay) { card.visible = false; return false; } // still waiting its turn → unseen in the deck
      card.visible = true;
      const e = easeOutCubic(tw.p);
      card.position.x = sx + (rest.x - sx) * e;
      card.position.z = sz + (rest.z - sz) * e;
      card.position.y = sy + (rest.y - sy) * e + 0.045 * Math.sin(e * Math.PI); // a low pitch arc across the felt
      if (!clicked && tw.p >= 0.6) { clicked = true; if (a && a.pokerDeal) a.pokerDeal(); } // click as it lands
      if (tw.done) { card.position.set(rest.x, rest.y, rest.z); return true; }
      return false;
    });
  }
  // celebratory camera "punch" on a NET win — a decaying deterministic oscillation (NOT random), applied
  // additively at draw time. Bigger pot → bigger punch. research C1 (the win is the payoff moment).
  _winShake(level = 1) {
    const amp = 0.007 + Math.min(level, 5) * 0.0028;
    const tw = new Tween(0.45);
    this._anims.push((dt) => {
      const p = tw.step(dt), decay = 1 - easeOutCubic(p), t = tw.t;
      this._camShake = { x: decay * amp * Math.sin(t * 46), y: decay * amp * 0.8 * Math.sin(t * 61 + 1.2) };
      if (tw.done) this._camShake = null;
      return tw.done;
    });
  }
  // Real-time bet preview: while it's YOUR turn to raise, the chips you're about to commit grow/shrink
  // in your bet zone as you drag the slider (this._raiseTo updates live in poker-ui.setRaise). These are
  // your REAL chips, pulled 1:1 from your stack columns (exactSubset/largestFormableLE) which shrink to
  // match — conserved, NOT a cosmetic value→breakdown. Rebuilt only on amount change.
  // ONE live heap for the local player's street commitment, in the bet zone in front of the stack. It
  // always shows what you've ALREADY pushed this street (the SB/BB blind, a call, a prior raise), and
  // while it's your turn it GROWS in real time to the raise-slider target — the extra chips visibly
  // leave your stack columns 1:1 (same real denominations you hold). Pull back the slider → it shrinks.
  _updateBetPreview(p) {
    if (!this._betPreview) return;
    if (!this._myBetPos || !this._myStackTray || !this._myStackSet) {  // no chip-backed local seat yet → nothing to heap
      if (this._betPreviewAmt !== -1) { this._betPreview.visible = false; this._betPreviewAmt = -1; }
      return;
    }
    const L = p.legal;
    const me = p.view && p.view.seats.find((s) => s.id === p.youId);
    const committed = me ? (me.roundBet | 0) : 0;                       // already in front of you this street (blind/call/raise)
    const minR = (L && L.minRaiseTo) | 0;                               // the slider's resting default — NOT a real intent
    // preview ONLY once you actively size a raise ABOVE the minimum (drag the slider up). At rest the heap shows just
    // what you've truly committed (your blind / a call) — no phantom min-bet appears the instant it becomes your turn.
    const previewing = !!(p && p.yourTurn && L && L.canRaise && !p.over && (this._raiseTo | 0) > minR);
    const amount = previewing ? (this._raiseTo | 0) : committed;        // heap value: live raise target, else your standing commit
    if (amount !== this._betPreviewAmt) {
      this._betPreviewAmt = amount;
      const betSet = this._myBetSet || {};                             // the REAL chips the engine already moved to your bet
      const addAmt = Math.max(0, amount - committed);                  // extra to pull from the stack for a raise preview
      const take = addAmt > 0 ? ((exactSubset(this._myStackSet, addAmt) || largestFormableLE(this._myStackSet, addAmt)) || {}) : {};
      const heap = addSet(betSet, take);                              // committed chips + previewed extra → the mound
      setChipTray(this._betPreview, heap, { pile: true, seed: 7 });   // tossed into a compact, scattered pile
      setChipTray(this._myStackTray, subSet(this._myStackSet, take)); // and the previewed extra LEAVES the stack columns (1:1)
      this._betPreview.visible = Object.keys(heap).length > 0;
    }
    this._betPreview.position.copy(this._myBetPos);
    this._betPreview.rotation.y = this._myBetTilt || 0;
    this._betPreview.scale.setScalar(1.5); // a touch bigger than the trays so the bet reads clearly at the seated angle
  }

  // Reuse the game's diegetic radio (real stations from radio.js) as a working set on the back shelf —
  // a small DOM tuner (on/off + ◀/▶). Self-contained playback (no BuildManager / no MP / no distance).
  _buildRadioControl() {
    this.radio = { station: 0, on: false, audio: null };
    const rc = document.createElement('div');
    rc.className = 'pk-radio';
    rc.innerHTML = `<button id="pk-radio-pow">📻 OFF</button><button id="pk-radio-prev">◀</button><span id="pk-radio-st">—</span><button id="pk-radio-next">▶</button>`;
    this.root.appendChild(rc);
    this._radioEls = { wrap: rc, pow: rc.querySelector('#pk-radio-pow'), st: rc.querySelector('#pk-radio-st') };
    this._radioEls.pow.addEventListener('click', () => this._radioToggle());
    rc.querySelector('#pk-radio-prev').addEventListener('click', () => this._radioCycle(-1));
    rc.querySelector('#pk-radio-next').addEventListener('click', () => this._radioCycle(1));
    this._radioRefresh();
  }
  _radioRefresh() {
    if (!this._radioEls) return;
    const ghost = this.radio.station === GHOST_STATION;
    this._radioEls.st.textContent = this.radio.on ? (ghost ? '☭ ' : '📻 ') + stationLabel(this.radio.station) : 'OFF';
    this._radioEls.pow.textContent = this.radio.on ? '📻 ON' : '📻 OFF';
    this._radioEls.wrap.classList.toggle('on', this.radio.on);
  }
  _radioStart() {
    if (typeof Audio === 'undefined') return;
    if (!this.radio.audio) { const el = new Audio(); el.preload = 'none'; el.volume = 0.5; this.radio.audio = el; }
    const st = stationByIndex(this.radio.station);
    if (st && this.radio.audio.src !== st.url) this.radio.audio.src = st.url;
    const p = this.radio.audio.play(); if (p && p.catch) p.catch(() => {}); // invoked from a click gesture
  }
  _radioToggle() { this.radio.on = !this.radio.on; if (this.radio.on) this._radioStart(); else if (this.radio.audio) { try { this.radio.audio.pause(); } catch (e) {} } this._radioRefresh(); }
  _radioCycle(dir) {
    const n = RADIO_STATIONS.length;
    if (this.radio.station === GHOST_STATION) this.radio.station = dir > 0 ? 0 : n - 1;       // leave the ghost → rejoin rotation
    else if (Math.random() < 0.10) this.radio.station = GHOST_STATION;                        // 🥚 the dial occasionally catches the Soviet ghost frequency
    else this.radio.station = ((this.radio.station + dir) % n + n) % n;
    this.radio.on = true; this._radioStart(); this._radioRefresh();
  }
  stopRadio() { if (this.radio) { this.radio.on = false; if (this.radio.audio) { try { this.radio.audio.pause(); } catch (e) {} } this._radioRefresh(); } }

  _initThree() {
    const r = this.renderer3d = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setClearColor(0x05060a, 1);
    const scene = this._scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x05060a, 2.2, 5.0);
    const seat = CAM_POSES.seated;
    this.cam = new THREE.PerspectiveCamera(seat.fov, 1.6, 0.03, 60);
    this.cam.position.set(seat.pos[0], seat.pos[1], seat.pos[2]); this.cam.lookAt(seat.look[0], seat.look[1], seat.look[2]); // SEATED 3/4 view (tune via poker-freecam-dev.html)
    this._camPose = 'seated'; this._camTw = null; this._camFrom = null; this._camLive = _clonePose(seat); // click-to-view tween state
    this._raycaster = new THREE.Raycaster(); this._boardCards = []; this._holeCards = []; this._myHoleCards = []; this._hoverTargets = [];
    this._holePeeked = false; this._myHoleSig = null; // your hole cards start face-down each hand; click to peek
    this._prevView = null; this._prevChips = null; // for the event-driven SFX (deal/clink/slide/win)
    this._anims = []; // active per-frame animation closures (card flips, chip throws, …) — stepped in renderTable
    this._camShake = null; // {x,y} positional shake offset applied at draw time (win "punch")
    scene.add(new THREE.AmbientLight(0x2a3550, 0.32));
    const lamp = new THREE.SpotLight(0xfff0d2, 22, 6, 0.78, 0.45, 1.6);
    lamp.position.set(0, 1.5, -0.05); lamp.target.position.set(0, 0, -0.05);
    scene.add(lamp, lamp.target);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.18); fill.position.set(0, 0.6, 2.0); scene.add(fill);
    this._buildStatic();
    this.dyn = new THREE.Group(); scene.add(this.dyn); // dealt cards / chips / markers, rebuilt on key change
    this._betPreview = makeChipTray({}); this._betPreview.visible = false; scene.add(this._betPreview); // live raise-amount preview chips
    this._betPreviewAmt = -1; this._myBetPos = null; this._myBetTilt = 0; this._myStackTray = null; this._myStackSet = null; this._myBetSet = null;
    this._potFx = new THREE.Group(); scene.add(this._potFx); // transient flying chips (bet→pot rake) — PERSISTS across dyn rebuilds
    this._betAnchors = {};                                   // per-seat bet-zone world position, refreshed each rebuild (slide origin)
    this._setSize();
  }

  // hanging lamp + the table. The table is the real modelgen `poker-table`, loaded async with a
  // placeholder disc covering the gap; a modelgen lamp can swap the cone/bulb later.
  _buildStatic() {
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.18, 24, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x1a1410, side: THREE.DoubleSide }));
    shade.position.set(0, 1.5, -0.05); this._scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe8b0, toneMapped: false }));
    bulb.position.set(0, 1.43, -0.05); this._scene.add(bulb);
    this.tableSlot = new THREE.Group(); this._scene.add(this.tableSlot);
    const ph = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.69, 0.06, 48),
      new THREE.MeshLambertMaterial({ color: 0x3a2a1c }));
    ph.position.y = -0.03; this.tableSlot.add(ph);                  // placeholder until the model loads
    this._loadTable();
    this._buildShelf();
    this._buildPoster();
  }

  // Soviet "ПОКЕРНЫЕ КОМБИНАЦИИ" hand-rankings cheat-sheet, framed on the back-RIGHT wall (mirrors the
  // radio shelf on the left). The image plane is self-lit (MeshBasic) so the rankings always read; the
  // wood frame + a small wall panel are lit by a warm accent light so the corner doesn't go pure black.
  // Click it → the camera walks up to the 'poster' pose to read it (click again / the felt → back).
  _buildPoster() {
    const PW = 0.46, PH = 0.69;                                  // poster image (2:3, matches 1024×1536 art)
    const grp = new THREE.Group();
    grp.position.set(1.05, 0.50, -1.0); grp.rotation.y = -0.48;  // back-right wall, hung low so it reads from the seated view
    const frame = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.06, PH + 0.06, 0.03),
      new THREE.MeshLambertMaterial({ color: 0x2a1f14 }));       // dark wood frame
    grp.add(frame);
    const liner = new THREE.Mesh(new THREE.PlaneGeometry(PW + 0.02, PH + 0.02),
      new THREE.MeshLambertMaterial({ color: 0x9a7636 }));       // thin brass liner around the print
    liner.position.set(0, 0, 0.0151); grp.add(liner);
    const img = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH),
      new THREE.MeshBasicMaterial({ color: 0x6a5030, toneMapped: false })); // self-lit; dark placeholder until the texture loads
    img.position.set(0, 0, 0.017); grp.add(img);
    new THREE.TextureLoader().load('./assets/poker/rankings-poster.png', (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      img.material.map = tex; img.material.color.set(0xffffff); img.material.needsUpdate = true;
    }, undefined, () => { /* keep the placeholder if the art fails to load */ });
    const warm = new THREE.PointLight(0xffe6b8, 4, 2.4, 2.0);    // lights the frame/wall out of the table spotlight
    warm.position.set(0, 0.2, 0.55); grp.add(warm);
    this._scene.add(grp);
    this._posterMesh = img;                                      // raycast target for the click-to-view camera
  }

  // Back-shelf with the REUSED field radio (props.js buildFieldRadio) — a dim background detail the
  // player can tune via the DOM control. A faint warm lamp lets it read out of the table spotlight.
  _buildShelf() {
    const wood = new THREE.MeshLambertMaterial({ color: 0x3a2a1c });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.30), wood);
    shelf.position.set(-0.95, 0.5, -1.15); this._scene.add(shelf);
    for (const sx of [-0.32, 0.32]) {                               // two simple under-shelf brackets
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), wood);
      br.position.set(-0.95 + sx, 0.42, -1.15); this._scene.add(br);
    }
    const radio = buildFieldRadio();
    radio.scale.setScalar(0.20);                                    // field radio is ~2 m wide → ~0.4 m on the shelf
    const bb = new THREE.Box3().setFromObject(radio);
    radio.position.set(-0.95, 0.52 - bb.min.y, -1.13); radio.rotation.y = 0.7; // sit on the shelf top, angled to the table
    this._scene.add(radio); this._radioMesh = radio;
    const warm = new THREE.PointLight(0xffd2a0, 5, 1.8, 2.2); warm.position.set(-0.65, 0.95, -0.9); this._scene.add(warm);
  }

  // Build the modelgen poker-table (Ø1.38, floor-anchored, top at 0.730) and drop it in with its TOP
  // at the felt plane (scene y=0), replacing the placeholder. Self-contained so the dev harness shows it too.
  async _loadTable() {
    try {
      const spec = await (await fetch('./models/poker-table/spec.json?cb=' + Date.now())).json();
      const m = buildSpec(spec);
      m.position.y = -0.730;
      for (let i = this.tableSlot.children.length - 1; i >= 0; i--) { const c = this.tableSlot.children[i]; this.tableSlot.remove(c); this._disposeTree(c); }
      this.tableSlot.add(m);
    } catch (e) { console.warn('[poker] poker-table model load failed — keeping placeholder:', e); }
  }

  showTable() { super.showTable(); this.root.classList.add('pk3d'); this._prevView = null; this._prevChips = null; this._sceneKey = null; this._anims = []; this._betPreviewAmt = -1; if (this._betPreview) this._betPreview.visible = false; this._holePeeked = false; this._myHoleSig = null; this._betAnchors = {}; this._lastHandNo = 0; // fresh table → the first hand animates a deal-in
    if (this._potFx) { for (let i = this._potFx.children.length - 1; i >= 0; i--) { const c = this._potFx.children[i]; this._potFx.remove(c); this._disposeTree(c); } } } // fresh table → no stale SFX deltas / dangling anims / bet preview / peek / flying chips
  showLobby(o) { if (this._hover) this._hover.hide(); this.root.classList.remove('pk3d'); super.showLobby(o); }
  showCoopLobby(o) { if (this._hover) this._hover.hide(); this.root.classList.remove('pk3d'); super.showCoopLobby(o); }

  renderTable(p, dt) {
    super.renderTable(p);     // header + banner + action bar + timer (felt DOM hidden by CSS)
    this._updateScene(p);
    this._stepCamera(dt || 0.016); // advance any click-to-view camera tween (PokerTable.render passes dt)
    this._stepAnims(dt || 0.016);  // advance card-flip animations
    this._updateBetPreview(p);     // live raise-amount chips in your bet zone (every frame — tracks the slider)
    if (this._hover) this._hover.update(); // hover outline + mini info-card (only re-raycasts when the cursor moved)
    this._draw();             // PokerTable.render() calls renderTable every frame — draw the felt here
  }

  // ---------- 3D felt ----------
  _updateScene(p) {
    const v = p.view; if (!v || !this._scene) return;
    const n = v.seats.length;
    const me = Math.max(0, v.seats.findIndex((s) => s.id === p.youId));
    const winners = p.result && p.result.winnings ? p.result.winnings : null;
    const ch = p.chips;
    const key = JSON.stringify({
      n, me, bt: v.button, ta: v.toAct, pot: v.pot,
      bd: v.board.map((c) => c.r + c.s),
      se: v.seats.map((s) => [s.id, s.stack, s.roundBet, s.folded ? 1 : 0, s.allIn ? 1 : 0,
        s.hole ? s.hole.map((c) => c.r + c.s).join('') : (s.hasCards ? 'X' : ''), (winners && winners[s.id]) || 0]),
      // conserved-chip composition: two stacks can share a value yet hold different chips, so the
      // tray must rebuild on composition change, not just value change.
      cs: ch ? sigOf(ch.pot) + '|' + v.seats.map((s) => sigOf(ch.stacks[s.id] || {}) + '/' + sigOf(ch.bets[s.id] || {})).join(',') : '',
    });
    if (key === this._sceneKey) return;
    this._sceneKey = key;
    // diff the previous snapshot → events drive both the flip-in animations and the SFX
    const events = derivePokerEvents(this._prevView, v, this._prevChips, p.chips, p.result);
    const newBoard = new Set(events.filter((e) => e.t === 'boardCard').map((e) => e.index)); // community cards to flip in
    // NEW HAND → pitch the hole cards in (handNumber is host-authoritative, same on every client; an empty
    // board means a genuine pre-flop deal, not a mid-hand reconnect/late-join, so the deal only animates then).
    const handNo = (p.tour && p.tour.handNumber) | 0;
    const dealIn = handNo > (this._lastHandNo | 0) && v.board.length === 0;
    this._lastHandNo = handNo;
    this._rebuildDyn(p, v, n, me, winners, newBoard, dealIn);
    this._slideBetsToPot(this._prevChips, p.chips); // street ended → rake each player's bet into the pot (uses prev bets + fresh anchors)
    this._onPokerEvents(events, p, dealIn);
    this._prevView = v; this._prevChips = this._snapChips(p.chips);
  }

  // When a betting round closes, every player's street bet is collected into the pot. Visually rake it in:
  // a transient chip pile flies from each seat's bet zone to the central pot, staggered, with a low sweep arc.
  // Cosmetic only — the real chips already moved in the chipbank; this just animates the snapshot transition.
  _slideBetsToPot(prevChips, chips) {
    if (!prevChips || !this._potFx) return;
    const ids = Object.keys(prevChips.bets || {});
    const prevHad = ids.some((id) => sigOf(prevChips.bets[id] || {}));
    const newHas = ids.some((id) => sigOf((chips && chips.bets && chips.bets[id]) || {}));
    if (!prevHad || newHas) return;                         // fire ONLY when ALL street bets clear at once → collected to the pot
    const FELT_Y = 0.013, pot = new THREE.Vector3(0, FELT_Y, 0.16);
    let k = 0;
    for (const id of ids) {
      const betSet = prevChips.bets[id];
      const from = this._betAnchors[id];
      if (!sigOf(betSet || {}) || !from) continue;
      const tray = makeChipTray(betSet, { pile: true, seed: 5 + k }); // loose pile = chips being swept in (varied per seat)
      tray.position.copy(from); tray.scale.setScalar(1.3);
      this._potFx.add(tray);
      const start = from.clone(), tw = new Tween(0.42, (k++) * 0.05);
      this._anims.push((dt) => {
        const e = easeOutCubic(tw.step(dt));
        tray.position.lerpVectors(start, pot, e);
        tray.position.y = FELT_Y + 0.03 * Math.sin(e * Math.PI); // a low sweep arc across the felt
        tray.scale.setScalar(1.3 - 0.45 * e);                    // shrink as it merges into the pot pile
        if (tw.done) { this._potFx.remove(tray); this._disposeTree(tray); return true; }
        return false;
      });
    }
  }
  _snapChips(c) { // deep-ish copy of the bet/pot denom maps — the host's p.chips are LIVE refs that mutate
    if (!c) return null;
    const cp = (m) => { const r = {}; for (const k in (m || {})) r[k] = m[k]; return r; };
    const bets = {}; for (const id in (c.bets || {})) bets[id] = cp(c.bets[id]);
    return { bets, pot: cp(c.pot) };
  }
  _onPokerEvents(events, p, dealIn) {
    const a = (typeof window !== 'undefined' && window.GAME) ? window.GAME.audio : null;
    if (!a || !events || !events.length) return;
    let deals = 0, chipUnits = 0, win = 0;
    for (const e of events) {
      if (e.t === 'boardCard' || e.t === 'holeReveal') deals++;
      else if (e.t === 'chipMove') chipUnits += Object.values(e.moves).reduce((x, y) => x + y, 0);
      else if (e.t === 'potAward' && e.id === p.youId && e.net) win = Math.max(win, Math.min(5, 1 + Math.floor(Math.log10(Math.max(1, e.amount))))); // YOUR net win only
    }
    // On a pre-flop deal-in, the per-card pitch clicks are fired by _dealInCard (frame-synced to each landing),
    // so skip the generic burst here to avoid doubling up.
    if (deals && a.pokerDeal && !dealIn) for (let i = 0; i < Math.min(deals, 3); i++) setTimeout(() => a.pokerDeal(), i * 90); // a flop riffles as ~3 cards
    if (chipUnits && a.pokerChip) {
      if (a.pokerPotSlide) a.pokerPotSlide();
      const n = Math.min(chipUnits, 6);
      for (let i = 0; i < n; i++) setTimeout(() => a.pokerChip(0.92 + i * 0.05), i * 55); // staggered, pitch steps by index (deterministic, not random)
    }
    if (win) { if (a.pokerWin) a.pokerWin(win); this._winShake(win); } // YOUR net win → rising fanfare + camera punch
  }

  _rebuildDyn(p, v, n, me, winners, newBoard, dealIn) {
    const d = this.dyn;
    // chips/markers sit ON TOP of the green baize, not on the slab beneath it. The baize is 13 mm
    // proud (spec: baize at y0.7365 h0.013, model dropped −0.730 → its TOP is world y=0.013); resting
    // chips at y=0 buried them in the cloth. FELT_Y is the green "floor" everything stands on.
    const FELT_Y = 0.013;
    for (let i = d.children.length - 1; i >= 0; i--) { const c = d.children[i]; d.remove(c); this._disposeTree(c); }
    this._boardCards = []; this._holeCards = []; this._myHoleCards = []; this._betAnchors = {}; this._hoverTargets = []; // refreshed each rebuild — click/peek/hover targets + bet→pot slide origins

    // NEW-HAND deal-in: map each (seat j, card h=pass) → its pitch index in the real two-pass dealing order
    // (clockwise from left-of-button, button last; active seats only). The index sets the per-card stagger.
    let dealIdx = null;
    if (dealIn) {
      const hasCards = v.seats.map((s) => !!(s.hole || s.hasCards) && !s.folded);
      dealIdx = {};
      dealOrder(v.button, n, hasCards).forEach((c, i) => { dealIdx[c.seat + ':' + c.pass] = i; });
    }

    // seat anchors — your seat at front (+Z), others fan around the far arc
    const RX = 0.92, RZ = 0.86; // seats just outside the Ø1.38 (r0.69) table edge
    const blind = n === 2 ? { sb: v.button, bb: (v.button + 1) % n } : { sb: (v.button + 1) % n, bb: (v.button + 2) % n };
    for (let j = 0; j < n; j++) {
      const s = v.seats[j];
      const slot = (j - me + n) % n;
      const ang = Math.PI / 2 + slot * (Math.PI * 2 / n); // slot 0 → +Z (front)
      const sx = Math.cos(ang) * RX, sz = Math.sin(ang) * RZ;
      const seat = new THREE.Group(); seat.position.set(sx, 0.006, sz); d.add(seat);
      const inward = new THREE.Vector3(-sx, 0, -sz).normalize(); // toward table centre
      // place felt items at a FIXED radius from centre along this seat's spoke (table radius ≈0.69) so
      // chips/cards stay ON the felt for ANY seat count — seats sit outside the table, their gear inside.
      const seatLen = Math.hypot(sx, sz) || 1;
      const onFelt = (r) => new THREE.Vector3((sx / seatLen) * r, 0, (sz / seatLen) * r);
      const tang = new THREE.Vector3(-sz / seatLen, 0, sx / seatLen); // unit sideways along the rim

      // nameplate (faces the camera) — NOT for your own seat: it sits right at the camera (front seat)
      // and would poke into your face, and your money is already in the HUD header (YOU $X).
      if (s.id !== p.youId) {
        const np = this._label(`${(p.names && p.names[s.id]) || s.id}  $${s.stack}${winners && winners[s.id] ? '  +' + winners[s.id] : ''}`,
          s.folded ? 0x6a6a6a : (j === v.toAct ? 0x45e0cf : 0xf3d999));
        np.position.set(sx * 1.0, 0.16, sz * 1.0); np.lookAt(this.cam.position); d.add(np);
      }

      // hole cards — folded players muck (no cards shown, real poker; hides bluffs)
      const mine = s.id === p.youId;
      if ((s.hole || s.hasCards) && !s.folded) {
        for (let h = 0; h < 2; h++) {
          const card = makeCardMesh();
          if (mine) {
            // your hole cards lie FLAT on the felt directly in FRONT of you (a hair right of centre, clear of the HUD) — FACE-DOWN by default;
            // click them to peek (a local side-turn flip, the same animation as the board; only YOU see it).
            if (h === 0) { const sig = s.hole ? s.hole.map((c) => c.r + c.s).join('') : (s.hasCards ? 'X' : ''); if (sig !== this._myHoleSig) { this._myHoleSig = sig; this._holePeeked = false; } } // new hand → cards go back face-down
            // directly in front of YOU, near your rail — your OWN zone, clear of BOTH neighbours (they sit 60–90°
            // around the rim, so anything pushed sideways lands in their pot). The two cards overlap a touch, like
            // real hole cards. Biased a hair right of centre; the heap sits ahead (toward the pot), the stack to the left.
            const pos = onFelt(0.50).addScaledVector(tang, -(0.14 + h * 0.05)); // lifted clear of the HUD (radius) + pushed RIGHT so the cards sit beside, not under, the central chips
            card.position.set(pos.x, 0.013 + h * 0.0032, pos.z); // 2nd card rests physically ON the first (offset > card thickness) — overlapping, not interpenetrating/z-fighting
            card.scale.setScalar(1.05);
            if (s.hole) setCardFace(card, s.hole[h]);
            card.rotation.z = this._holePeeked ? 0 : Math.PI; // peeked → face-up, else FACE-DOWN (back up), turned on the long axis
            this._holeCards.push(card); this._myHoleCards.push(card); // click to peek
          } else {
            // opponents'/bots' cards: lie FLAT on the felt near their edge, FACE-DOWN (back up); only the showdown reveals faces
            const pos = onFelt(0.62).addScaledVector(tang, (h - 0.5) * 0.034);
            card.position.set(pos.x, 0.012 + h * 0.0026, pos.z); // stack physically ON, not z-fighting INTO each other
            card.scale.setScalar(0.8);
            if (s.hole) setCardFace(card, s.hole[h]);   // showdown reveal → face up (default orientation)
            else card.rotateX(Math.PI);                  // hidden → flip to back-up (face-down on the table)
          }
          d.add(card);
          // pitch this card in from the centre deck (face-down, keeps its rest rotation) at its dealing-order slot
          if (dealIdx) { const k = dealIdx[j + ':' + h]; if (k != null) this._dealInCard(card, { x: card.position.x, y: card.position.y, z: card.position.z }, k * DEAL_STAGGER); }
        }
      }

      // their stack tray (to one side) + current-street bet (toward centre) — drawn from the REAL
      // conserved chip multiset when present, else a value-derived fallback. Tray sits a touch wider
      // out so its denomination columns clear the felt edge.
      const chips = p.chips;
      const stackSet = chips ? chips.stacks[s.id] : null;
      // Radii kept well inside the green baize (≈r0.69 incl. the wood rim) so trays + their grid
      // overflow never spill onto the raised wood edge — everything sits flat on the green at y=0.
      const tilt = Math.atan2(-sx, -sz);                  // so a tray's columns run along the rim (90° to the spoke)
      // per-PLAYER chip skin: the LOCAL seat uses the global skin (YOUR own pick, set by _applyChipSkin); every
      // OTHER seat wears its owner's skin from the snapshot (bots / not-yet-propagated → default 'dice'). So your
      // skin no longer bleeds onto the whole table. (Co-op propagation of others' real skins + a multi-skin pot
      // are Stage 2/3 — see the handoff plan.)
      const skinOpt = mine ? undefined : { skin: (p.skins && p.skins[s.id]) || 'dice' };
      this._betAnchors[s.id] = onFelt(0.36).setY(FELT_Y);  // where this seat's street bet sits → the bet→pot slide flies FROM here
      if (s.id === p.youId) { this._myBetPos = onFelt(0.35).setY(FELT_Y + 0.001); this._myBetTilt = tilt; } // bet/heap anchor: in front of your stack, clear of the pot pile (pileLayout caps its radius, so even an all-in heap stays compact, not sprawling)
      const stack = stackSet ? makeChipTray(stackSet, skinOpt) : makeChipStack(s.stack);
      stack.position.copy(onFelt(0.50)).addScaledVector(tang, 0.14); stack.position.y = FELT_Y; stack.rotation.y = tilt; stack.scale.setScalar(1.4); d.add(stack);
      stack.userData.pk = { kind: 'chips', scope: 'stack', ownerId: s.id, ownerName: (s.id === p.youId ? 'YOU' : ((p.names && p.names[s.id]) || s.id)) }; this._hoverTargets.push(stack);
      if (s.id === p.youId) { this._myStackTray = stack; this._myStackSet = stackSet ? { ...stackSet } : null; this._myBetSet = (chips && chips.bets[s.id]) ? { ...chips.bets[s.id] } : {}; } // bet heap pulls chips FROM this real stack
      const betSet = chips ? chips.bets[s.id] : null;
      // YOUR own street bet (blind/call/raise) is drawn as the live grows-with-the-slider heap (_betPreview),
      // not a static column tray — so skip it here for the local seat whenever we have real chips to heap.
      const skipLocalBet = (s.id === p.youId) && !!chips;
      if (!skipLocalBet) {
        const betGroup = betSet ? (sigOf(betSet) ? makeChipTray(betSet, skinOpt) : null) : (s.roundBet > 0 ? makeChipStack(s.roundBet) : null);
        if (betGroup) { betGroup.position.copy(onFelt(0.36)); betGroup.position.y = FELT_Y; betGroup.rotation.y = tilt; betGroup.scale.setScalar(1.3); d.add(betGroup);
          betGroup.userData.pk = { kind: 'chips', scope: 'bet', ownerId: s.id, ownerName: (s.id === p.youId ? 'YOU' : ((p.names && p.names[s.id]) || s.id)) }; this._hoverTargets.push(betGroup); }
      }
      // SB / BB blind markers — chip-sized labelled pucks, on the felt to the OTHER side of the seat.
      // (The dealer "D" button was removed — visually useless for a casual player; button position is
      // still tracked in the engine for blind/action order, just not drawn.)
      const role = j === blind.sb ? 'SB' : (j === blind.bb ? 'BB' : null);
      if (role) { const m = this._marker(role); m.position.copy(onFelt(0.40)).addScaledVector(tang, -0.16); m.position.y = FELT_Y; d.add(m); // a touch higher (smaller radius) + tracks the cards' rightward shift — above them, never on them
        m.userData.pk = { kind: 'blind', role, amount: (role === 'SB' ? (p.tour && p.tour.sb) : (p.tour && p.tour.bb)) }; this._hoverTargets.push(m); }
    }

    // board (centre, face-up, flat) — scaled up so it reads on the big Ø1.38 table
    // NOTE: at the low seated camera the flat board reads edge-on; standing/curving it is part of the
    // upcoming full 3D-card redo (all 52 as models), so it's left flat here on purpose for now.
    let flipN = 0;
    for (let i = 0; i < v.board.length; i++) {
      const card = makeCardMesh(); setCardFace(card, v.board[i]);
      const rest = { x: (i - 2) * 0.105, y: 0.014, z: -0.05, rotX: 0 };
      card.position.set(rest.x, rest.y, rest.z); card.scale.setScalar(1.45); d.add(card);
      this._boardCards.push(card); card.userData.pk = { kind: 'card' }; this._hoverTargets.push(card); // community cards → click for the TV close-up + hover glow
      if (newBoard && newBoard.has(i)) this._flipInCard(card, rest, (flipN++) * 0.13); // NEW card → flip it in (flop staggers left→right)
    }
    // pot pile (between the board and you) — real pot chips when present
    const potSet = p.chips ? p.chips.pot : null;
    const potGroup = potSet ? (sigOf(potSet) ? makeChipTray(potSet) : null) : (v.pot > 0 ? makeChipStack(v.pot) : null);
    if (potGroup) { potGroup.position.set(0, FELT_Y, 0.16); potGroup.scale.setScalar(1.7); d.add(potGroup);
      potGroup.userData.pk = { kind: 'chips', scope: 'pot', ownerName: 'POT' }; this._hoverTargets.push(potGroup); }
    this._betPreviewAmt = -2; // the stack tray is freshly full → force _updateBetPreview to re-carve the heap out of it
  }

  // SB / BB marker: a chunky labelled puck (mirrors the modelgen dealer-button, recoloured per role). The
  // dealer "D" was removed — only 'SB'/'BB' are ever passed (cfg has no 'D'; passing 'D' would throw).
  _marker(role) {
    const cfg = { SB: { body: 0x2a52b0, t: '#ffffff' }, BB: { body: 0xd8b84a, t: '#141414' } }[role];
    const g = new THREE.Group();
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 24), new THREE.MeshLambertMaterial({ color: cfg.body })); // chip-sized
    puck.position.y = 0.006; g.add(puck);
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d'); ctx.fillStyle = cfg.t;
    ctx.font = 'bold ' + (role === 'D' ? 86 : 62) + 'px Oswald, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(role, 64, 70);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    lbl.rotation.x = -Math.PI / 2; lbl.position.y = 0.0125; g.add(lbl);
    lbl.userData.tex = tex;
    return g;
  }

  _label(text, color) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(8,12,16,.72)'; ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 30px Oswald, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 34);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.065), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
    m.userData.tex = tex; return m;
  }

  _disposeTree(o) {
    o.traverse?.((c) => {
      c.geometry?.dispose?.();
      const m = c.material; if (Array.isArray(m)) m.forEach((x) => x?.dispose?.()); else m?.dispose?.();
      c.userData?.tex?.dispose?.();
    });
  }

  _setSize() {
    const w = this.canvas.clientWidth || 960, h = this.canvas.clientHeight || 600;
    if (w === this._size[0] && h === this._size[1]) return;
    this._size = [w, h];
    this.renderer3d.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }

  _draw() {
    if (!this._scene || !this.root.classList.contains('pk3d')) return;
    this._setSize();
    const s = this._camShake;
    if (s) { this.cam.position.x += s.x; this.cam.position.y += s.y; }    // win-punch offset, additive for this frame only
    this.renderer3d.render(this._scene, this.cam);
    if (s) { this.cam.position.x -= s.x; this.cam.position.y -= s.y; }
  }
  render(dt) { this._stepCamera(dt || 0.016); this._stepAnims(dt || 0.016); this._draw(); } // tolerate a direct render hook too
}
