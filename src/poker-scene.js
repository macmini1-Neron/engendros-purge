// PokerSceneRenderer — the 3D presentation layer for the poker table (Phase 0: placeholder geometry,
// real readable cards + exact chip stacks). It EXTENDS PokerDomRenderer so the lobby screens and the
// (already-polished) action bar / slider / timer / banner are reused UNTOUCHED as a 2D HUD on top; only
// the felt (table, seats, cards, chips, pot) is drawn in 3D. Mini-scene pattern mirrors fonoteka.js:
// own WebGLRenderer on a dedicated canvas, own scene + 3/4 camera + a single lamp spotlight, dark
// surround. render(dt) is driven from Game._frame (state==='poker'); netcode + engine are untouched.
import * as THREE from 'three';
import { PokerDomRenderer } from './poker-ui.js';
import { makeCardMesh, setCardFace } from './poker-cards.js';
import { makeChipStack, makeChipTray } from './poker-chips.js';
import { sigOf } from './poker/chipbank.js';
import { buildSpec } from './props/voxel-interp.js';
import { buildFieldRadio } from './props.js';
import { RADIO_STATIONS, GHOST_STATION, stationByIndex, stationLabel } from './radio.js';

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
    this.cam = new THREE.PerspectiveCamera(60, 1.6, 0.03, 60);
    this.cam.position.set(0.08, 0.28, 0.91); this.cam.lookAt(-0.03, -0.02, -0.11); // SEATED at the table — low + close + wide for max immersion (angle dialled in via the free-cam dev tool); near edge runs off-frame
    scene.add(new THREE.AmbientLight(0x2a3550, 0.32));
    const lamp = new THREE.SpotLight(0xfff0d2, 22, 6, 0.78, 0.45, 1.6);
    lamp.position.set(0, 1.5, -0.05); lamp.target.position.set(0, 0, -0.05);
    scene.add(lamp, lamp.target);
    const fill = new THREE.DirectionalLight(0xbcd0ff, 0.18); fill.position.set(0, 0.6, 2.0); scene.add(fill);
    this._buildStatic();
    this.dyn = new THREE.Group(); scene.add(this.dyn); // dealt cards / chips / markers, rebuilt on key change
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

  showTable() { super.showTable(); this.root.classList.add('pk3d'); }
  showLobby(o) { this.root.classList.remove('pk3d'); super.showLobby(o); }
  showCoopLobby(o) { this.root.classList.remove('pk3d'); super.showCoopLobby(o); }

  renderTable(p) {
    super.renderTable(p);     // header + banner + action bar + timer (felt DOM hidden by CSS)
    this._updateScene(p);
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
    this._rebuildDyn(p, v, n, me, winners);
  }

  _rebuildDyn(p, v, n, me, winners) {
    const d = this.dyn;
    for (let i = d.children.length - 1; i >= 0; i--) { const c = d.children[i]; d.remove(c); this._disposeTree(c); }

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

      // nameplate (faces the camera)
      const np = this._label(`${(p.names && p.names[s.id]) || (s.id === p.youId ? 'YOU' : s.id)}  $${s.stack}${winners && winners[s.id] ? '  +' + winners[s.id] : ''}`,
        s.folded ? 0x6a6a6a : (j === v.toAct ? 0x45e0cf : 0xf3d999));
      np.position.set(sx * 1.0, 0.16, sz * 1.0); np.lookAt(this.cam.position); d.add(np);

      // hole cards — folded players muck (no cards shown, real poker; hides bluffs)
      const mine = s.id === p.youId;
      if ((s.hole || s.hasCards) && !s.folded) {
        for (let h = 0; h < 2; h++) {
          const card = makeCardMesh();
          if (mine) {
            // your hole cards: large & TILTED UP toward the seated camera (held-in-hand read) so they stay
            // legible at the low angle and clear the bottom action bar — pivot at the felt, top edge lifts toward you
            card.scale.setScalar(1.3);
            card.position.set((h - 0.5) * 0.082, 0.17, 0.50);
            if (s.hole) { setCardFace(card, s.hole[h]); card.rotation.x = 0.92; } else card.rotation.x = Math.PI;
          } else {
            // opponents'/bots' cards: lie FLAT on the felt near their edge, FACE-DOWN (back up); only the showdown reveals faces
            const pos = onFelt(0.62).addScaledVector(tang, (h - 0.5) * 0.034);
            card.position.set(pos.x, 0.012, pos.z);
            card.scale.setScalar(0.8);
            if (s.hole) setCardFace(card, s.hole[h]);   // showdown reveal → face up (default orientation)
            else card.rotateX(Math.PI);                  // hidden → flip to back-up (face-down on the table)
          }
          d.add(card);
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
      const stack = stackSet ? makeChipTray(stackSet) : makeChipStack(s.stack);
      stack.position.copy(onFelt(0.42)).addScaledVector(tang, 0.14); stack.rotation.y = tilt; stack.scale.setScalar(1.4); d.add(stack);
      const betSet = chips ? chips.bets[s.id] : null;
      const betGroup = betSet ? (sigOf(betSet) ? makeChipTray(betSet) : null) : (s.roundBet > 0 ? makeChipStack(s.roundBet) : null);
      if (betGroup) { betGroup.position.copy(onFelt(0.30)); betGroup.rotation.y = tilt; betGroup.scale.setScalar(1.3); d.add(betGroup); }
      // dealer / SB / BB markers — chip-sized labelled pucks, on the felt to the OTHER side of the seat
      const role = j === v.button ? 'D' : (j === blind.sb ? 'SB' : (j === blind.bb ? 'BB' : null));
      if (role) { const m = this._marker(role); m.position.copy(onFelt(0.42)).addScaledVector(tang, -0.14); d.add(m); }
    }

    // board (centre, face-up, flat) — scaled up so it reads on the big Ø1.38 table
    // NOTE: at the low seated camera the flat board reads edge-on; standing/curving it is part of the
    // upcoming full 3D-card redo (all 52 as models), so it's left flat here on purpose for now.
    for (let i = 0; i < v.board.length; i++) {
      const card = makeCardMesh(); setCardFace(card, v.board[i]);
      card.position.set((i - 2) * 0.105, 0.014, -0.05); card.scale.setScalar(1.45); d.add(card);
    }
    // pot pile (between the board and you) — real pot chips when present
    const potSet = p.chips ? p.chips.pot : null;
    const potGroup = potSet ? (sigOf(potSet) ? makeChipTray(potSet) : null) : (v.pot > 0 ? makeChipStack(v.pot) : null);
    if (potGroup) { potGroup.position.set(0, 0, 0.16); potGroup.scale.setScalar(1.7); d.add(potGroup); }
  }

  // D / SB / BB marker: a chunky labelled puck (mirrors the modelgen dealer-button, recoloured per role)
  _marker(role) {
    const cfg = { D: { body: 0xe8e8e8, t: '#141414' }, SB: { body: 0x2a52b0, t: '#ffffff' }, BB: { body: 0xd8b84a, t: '#141414' } }[role];
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
    this.renderer3d.render(this._scene, this.cam);
  }
  render(dt) { this._draw(); } // tolerate a direct render hook too
}
