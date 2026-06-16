// PokerHover — mouse-hover affordances for the 3D poker felt. Self-contained so it adds ~zero merge
// surface to the concurrently-edited poker-scene.js / poker-chips.js (it only READS their exports and
// the renderer's existing raycaster / scene / camera). Three things on hover:
//   • chip stacks (yours, opponents', bets, the pot) → a sharp yellow OUTLINE on the chip COLOUR under
//     the cursor + a mini info-card: "N × <denom> chip = $sub (colour) · skin <NAME>".
//   • the centre community cards → a yellow outline frame (the click-to-zoom in _onPokerClick is untouched).
//   • the SB / BB pucks → a tooltip explaining the small / big blind.
// All driven off one pointermove + a once-per-frame raycast (only when the cursor actually moved), reusing
// renderer._raycaster. Outline meshes live on the scene root (survive _rebuildDyn's dispose) and own their
// OWN geometry (never the chips' shared geometry) so a rebuild mid-hover can never dispose them.
import * as THREE from 'three';
import { DENOMS } from './poker/chipbank.js';
import { CHIP_GEO_T } from './poker-chip-mesh.js';
import { CHIP_SKINS, getChipSkin, denomColor } from './poker/chipskins.js';

// denom → human colour name (the DICE body colours are commented in chipskins.js; no string export exists).
const COLOR_NAME = { 5: 'white', 10: 'blue', 20: 'red', 50: 'green', 100: 'black', 500: 'yellow' };
// escape player-supplied strings (co-op names reach the tooltip head) before they hit innerHTML
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CHIP_R = 0.020; // chip radius (matches poker-chips.js CHIP_SIZE.r) — for the outline hull geometry
const CARD_W = 0.063, CARD_H = 0.088, CARD_T = 0.0026; // metres (matches poker-cards.js)
const OUTLINE = 0xffe066;

const HOVER_CSS = `
#poker .pk-tip { position:fixed; z-index:6; pointer-events:none; display:none; max-width:240px;
  padding:8px 11px; border-radius:8px; background:rgba(11,18,17,.93); border:1px solid var(--brass-deep,#58421a);
  box-shadow:0 4px 18px rgba(0,0,0,.6); font-family:var(--font-mono,monospace); color:var(--ink,#e8e4d8);
  font-size:12px; line-height:1.5; }
#poker .pk-tip-head { font-family:var(--font-display,'Oswald'),system-ui; letter-spacing:.5px; color:var(--brass-hi,#f3d999); }
#poker .pk-tip-row { display:flex; align-items:center; gap:6px; white-space:nowrap; margin-top:3px; }
#poker .pk-tip-dot { width:11px; height:11px; border-radius:50%; border:1px solid rgba(0,0,0,.5); flex:none; }
#poker .pk-tip-cn { color:var(--steel,#84aab2); }
#poker .pk-tip-skin { margin-top:4px; color:var(--steel,#84aab2); font-size:11px; }
#poker .pk-tip-body { white-space:normal; margin-top:3px; }
`;

export class PokerHover {
  constructor(renderer) {
    this.r = renderer;
    if (!document.getElementById('pk-hover-style')) {
      const st = document.createElement('style'); st.id = 'pk-hover-style'; st.textContent = HOVER_CSS;
      document.head.appendChild(st);
    }
    const tip = this.tip = document.createElement('div');
    tip.className = 'pk-tip';
    this.r.root.appendChild(tip);

    const mat = new THREE.MeshBasicMaterial({
      color: OUTLINE, side: THREE.BackSide, transparent: true, opacity: 1, depthWrite: false, toneMapped: false,
    });
    this._mat = mat;
    // chip outline: an inverted-hull InstancedMesh over the hovered colour's chips. Own geometry (never
    // the chips' shared cylinder) so the chip group's dispose-on-rebuild can't take it down.
    const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_GEO_T, 16);
    const oc = this._outChips = new THREE.InstancedMesh(chipGeo, mat, 256);
    oc.matrixAutoUpdate = false; oc.visible = false; oc.renderOrder = 998; oc.count = 0;
    oc.frustumCulled = false; // its origin-centred bounding sphere doesn't cover instances spread across a tall/wide stack → would cull the whole highlight (tooltip shows, no outline) for big stacks
    this.r._scene.add(oc);
    // card outline: an inverted-hull BOX around a board card — a SNUG yellow rim with a little height so
    // it reads at the low grazing camera angle (a flat plane under the flat card all but vanishes there).
    // Geometry is the card's BASE size (CARD_W×CARD_T×CARD_H); _showCard multiplies by card.matrixWorld
    // (which already bakes the card's 1.45 render scale), so _Scard is the rim factor RELATIVE to the
    // on-felt card — NOT the base geometry.
    const ocard = this._outCard = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, CARD_T, CARD_H), mat);
    ocard.visible = false; ocard.renderOrder = 998; ocard.matrixAutoUpdate = false;
    this.r._scene.add(ocard);
    // ~10% wider than the rendered card (≈4.6 mm rim) + a touch proud. Board cards sit only ~14 mm apart,
    // so a wider/taller rim (the old 1.14×3.0) bled across the gap and read as "the whole row lit up".
    this._Scard = new THREE.Matrix4().makeScale(1.10, 2.0, 1.10);
    // SB / BB puck outline — an inverted-hull cylinder over the hovered blind puck (puck = r0.034 × h0.012).
    const oblind = this._outBlind = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.012, 24), mat);
    oblind.visible = false; oblind.renderOrder = 998; oblind.matrixAutoUpdate = false;
    this.r._scene.add(oblind);
    // Hug the puck (r0.034 × h0.012): a THIN rim recentred on the puck MID (y=0.006 within the group),
    // not the old 1.22×/2.4× outline that read as a loose radial halo + sat miscentred (low, into the felt).
    this._Sblind = new THREE.Matrix4().makeTranslation(0, 0.006, 0).multiply(new THREE.Matrix4().makeScale(1.07, 1.5, 1.07));

    this._ptr = { x: 0, y: 0 };
    this._dirty = false; this._inside = false; this._curKey = null; this._held = null; this._heldSig = null;
    this._S = new THREE.Matrix4().makeScale(1.12, 1.35, 1.12); // per-chip grow (radial 12% reads as a clean rim)
    this._m = new THREE.Matrix4();

    this._onMove = (e) => this._move(e);
    this._onLeave = () => { this._inside = false; this._dirty = true; };
    this.r.root.addEventListener('pointermove', this._onMove);
    this.r.root.addEventListener('pointerleave', this._onLeave);
  }

  _move(e) {
    if (!this.r.root.classList.contains('pk3d')) return;
    if (e.target && e.target.closest && e.target.closest('.pk-actions, .pk-timer, .pk-banner, .pk-radio, button, input, select')) {
      this._inside = false; this._dirty = true; return; // hovering the HUD → no felt tooltip
    }
    this._ptr.x = e.clientX; this._ptr.y = e.clientY; this._inside = true; this._dirty = true;
    if (this.tip.style.display === 'block') this._place(); // keep the card tracking the cursor between raycasts
  }

  hide() { this._hideAll(); }

  update() {
    if (!this.r.root.classList.contains('pk3d')) { this._hideAll(); return; }
    if (!this._dirty) {
      if (this._held && this._held.parent === null) this._dirty = true; // target rebuilt away → re-resolve
      else if (this._held && this._held.userData && this._held.userData.pk && this._held.userData.pk.kind === 'chips' && this._held.userData.sig !== this._heldSig) this._dirty = true; // tray mutated IN PLACE (the live bet heap swelling / your stack draining as you size a raise) → refresh the tooltip + outline even though the cursor hasn't moved
      else return;
    }
    this._dirty = false;
    if (!this._inside) { this._hideAll(); return; }
    const rect = this.r.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) { this._hideAll(); return; }
    const ndc = new THREE.Vector2(
      ((this._ptr.x - rect.left) / rect.width) * 2 - 1,
      -((this._ptr.y - rect.top) / rect.height) * 2 + 1,
    );
    this.r._raycaster.setFromCamera(ndc, this.r.cam);
    const targets = this.r._hoverTargets || [];
    const hits = targets.length ? this.r._raycaster.intersectObjects(targets, true) : [];
    if (!hits.length) { this._hideAll(); return; }
    this._resolve(hits[0]);
  }

  // walk up from the hit leaf to the tagged node; remember the InstancedMesh passed through (the denom mesh)
  _resolve(hit) {
    let node = hit.object, instMesh = null, group = null;
    while (node) {
      if (node.userData && node.userData.pk) { group = node; break; }
      if (node.isInstancedMesh) instMesh = node;
      node = node.parent;
    }
    if (!group) { this._hideAll(); return; }
    this._held = group;
    this._heldSig = group.userData.sig; // remember the tray signature so an in-place mutation (live heap / draining stack) re-triggers a resolve next frame
    const pk = group.userData.pk;
    if (pk.kind === 'chips') return this._showChips(group, pk, instMesh);
    if (pk.kind === 'card') return this._showCard(group, pk);
    if (pk.kind === 'blind') return this._showBlind(group, pk);
    this._hideAll();
  }

  // map the hovered InstancedMesh back to its denomination, outline just those chips, build the mini-card
  _showChips(group, pk, instMesh) {
    const inst = group.userData.inst || {};
    if (pk.scope === 'pot') {
      // the shared pot is ONE unit: whatever chip you hover, light up ALL of it and show the TOTAL value
      let total = 0; for (const d of DENOMS) total += d * ((inst[d] && inst[d].count) || 0);
      const key = 'pot|' + (group.userData.sig || '') + '|' + total;
      if (key !== this._curKey) {
        this._curKey = key;
        this.tip.innerHTML = `<div class="pk-tip-head">POT</div>` +
          `<div class="pk-tip-row">total <b>$${total}</b></div>` +
          `<div class="pk-tip-skin">the shared pot — what everyone's playing for</div>`;
        this.tip.style.display = 'block';
      }
      this._outlineWholeTray(group);
      this._outCard.visible = false; this._outBlind.visible = false;
      this._place();
      return;
    }
    let denom = 0;
    for (const d of DENOMS) { if (inst[d] === instMesh) { denom = d; break; } }
    if (!denom) { // raycast grazed the group but not a specific colour mesh → fall back to the tallest present
      for (const d of DENOMS) { if (inst[d] && inst[d].count > 0) { denom = d; instMesh = inst[d]; break; } }
    }
    if (!denom) { this._hideAll(); return; }
    const traySkin = group.userData.skin || getChipSkin();  // this tray's OWN skin (per-player), not the global one
    const key = 'chips|' + (group.userData.sig || '') + '|' + denom + '|' + traySkin;
    if (key !== this._curKey) {
      this._curKey = key;
      const n = instMesh ? instMesh.count : 0;
      const sub = denom * n;
      const skin = (CHIP_SKINS[traySkin] || {}).label || '—';
      const head = pk.scope === 'pot' ? 'POT'
        : esc(pk.ownerName || 'PLAYER') + (pk.scope === 'bet' ? ' · BET' : ' · STACK');
      this.tip.innerHTML =
        `<div class="pk-tip-head">${head}</div>` +
        `<div class="pk-tip-row"><span class="pk-tip-dot" style="background:${denomColor(denom).body}"></span>` +
        `${n} × ${denom} chip = <b>$${sub}</b> <span class="pk-tip-cn">(${COLOR_NAME[denom] || ''})</span></div>` +
        `<div class="pk-tip-skin">skin ${skin}</div>`;
      this.tip.style.display = 'block';
    }
    this._outlineChips(instMesh);
    this._outCard.visible = false; this._outBlind.visible = false;
    this._place();
  }

  _showCard(card) {
    this.tip.style.display = 'none'; this._curKey = null; // board cards just glow, no tooltip
    this._outChips.visible = false; this._outBlind.visible = false;
    card.updateWorldMatrix(true, false);
    const o = this._outCard;
    o.matrix.copy(card.matrixWorld).multiply(this._Scard); // inverted hull: card's world xf, grown about its centre
    o.matrixWorldNeedsUpdate = true;
    o.visible = true;
  }

  _showBlind(group, pk) {
    this._outChips.visible = false; this._outCard.visible = false;
    group.updateWorldMatrix(true, false);                         // glow the puck, grown about its centre
    const o = this._outBlind;
    o.matrix.copy(group.matrixWorld).multiply(this._Sblind); o.matrixWorldNeedsUpdate = true; o.visible = true;
    const key = 'blind|' + pk.role + '|' + pk.amount;
    if (key !== this._curKey) {
      this._curKey = key;
      const amt = pk.amount != null ? ' · $' + pk.amount : '';
      this.tip.innerHTML = pk.role === 'SB'
        ? `<div class="pk-tip-head">SMALL BLIND${amt}</div>` +
          `<div class="pk-tip-body">A forced bet posted before the cards are dealt, by the player just left of the dealer — normally half the big blind. It seeds the pot so every hand has something to play for.</div>`
        : `<div class="pk-tip-head">BIG BLIND${amt}</div>` +
          `<div class="pk-tip-body">The table's minimum opening bet, posted one seat further along before the deal. It sets the price to stay in the hand; raises are measured against it.</div>`;
      this.tip.style.display = 'block';
    }
    this._place();
  }

  // inverted-hull outline of one colour's chips: copy that mesh's world transform + per-instance matrices,
  // grown about each chip's own centre (chip geometry is origin-centred, so M·scale grows in place).
  _outlineChips(im) {
    if (!im || !im.count) { this._outChips.visible = false; return; }
    im.updateWorldMatrix(true, false);
    const o = this._outChips;
    o.matrix.copy(im.matrixWorld); o.matrixWorldNeedsUpdate = true;
    const n = Math.min(im.count, 256);
    for (let i = 0; i < n; i++) { im.getMatrixAt(i, this._m); this._m.multiply(this._S); o.setMatrixAt(i, this._m); }
    o.count = n; o.instanceMatrix.needsUpdate = true; o.visible = true;
  }

  // outline EVERY chip in a tray at once (used for the pot — one shared group). Packs each chip's full WORLD
  // matrix (grown about its centre) into _outChips with an identity own-transform, so chips from different
  // denomination meshes all light up together.
  _outlineWholeTray(group) {
    const inst = group.userData.inst || {};
    const o = this._outChips;
    o.matrix.identity(); o.matrixWorldNeedsUpdate = true;          // instances are packed in WORLD space
    let k = 0;
    for (const d of DENOMS) {
      const im = inst[d]; if (!im || !im.count) continue;
      im.updateWorldMatrix(true, false);
      for (let i = 0; i < im.count && k < 256; i++) {
        im.getMatrixAt(i, this._m);
        this._m.premultiply(im.matrixWorld);                        // chip → world
        this._m.multiply(this._S);                                  // grow about its own centre
        o.setMatrixAt(k++, this._m);
      }
    }
    if (!k) { o.visible = false; return; }
    o.count = k; o.instanceMatrix.needsUpdate = true; o.visible = true;
  }

  _place() {
    const tw = this.tip.offsetWidth || 180, th = this.tip.offsetHeight || 48;
    let x = this._ptr.x + 14, y = this._ptr.y + 14;
    const W = window.innerWidth, H = window.innerHeight;
    if (x + tw > W - 6) x = this._ptr.x - tw - 14;
    if (y + th > H - 6) y = this._ptr.y - th - 14;
    this.tip.style.left = Math.max(6, x) + 'px';
    this.tip.style.top = Math.max(6, y) + 'px';
  }

  _hideAll() {
    this._outChips.visible = false; this._outCard.visible = false; this._outBlind.visible = false;
    this.tip.style.display = 'none'; this._curKey = null; this._held = null; this._heldSig = null;
  }
}
