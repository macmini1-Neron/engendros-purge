// 2D DOM renderer for the poker table — the swappable presentation layer (v1). Reads a plain
// view-model from PokerTable and emits semantic actions; a future PokerSceneRenderer (THREE 3D
// table/chips/cards) can replace this with the same inputs. Aesthetic: a plain, worn table —
// NOT casino felt. No THREE here; pure DOM. POLYMER tokens reused for the chrome.

const SUIT = { c: '♣', d: '♦', h: '♥', s: '♠' };
const RCH = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function cardHTML(card, faceDown) {
  if (faceDown) return '<div class="pk-card back"></div>';
  if (!card) return '<div class="pk-card empty"></div>';
  const red = card.s === 'h' || card.s === 'd';
  const r = RCH[card.r] || card.r;
  return `<div class="pk-card${red ? ' red' : ''}"><span class="pk-r">${r}</span><span class="pk-s">${SUIT[card.s]}</span></div>`;
}

const CSS = `
#poker.overlay { align-items: stretch; justify-content: stretch; }
.pk-wrap { position:relative; z-index:2; width:100%; height:100%; display:flex; flex-direction:column;
  color:var(--ink,#e8e4d8); font-family:var(--font-body,'Rajdhani',system-ui);
  background:
    radial-gradient(130% 90% at 50% -10%, rgba(255,210,150,.10), rgba(0,0,0,.55)),
    repeating-linear-gradient(96deg, #6b3f2a 0 7px, #663a26 7px 14px),
    linear-gradient(180deg,#7c4a2f 0%, #5d3722 60%, #4a2c1b 100%); }
.pk-top { display:flex; align-items:center; gap:18px; padding:14px 24px;
  background:linear-gradient(180deg, rgba(11,18,17,.86), rgba(11,18,17,.6));
  border-bottom:2px solid var(--brass-lo,#9a7636); }
.pk-top .pk-title { font-family:var(--font-title,'Russo One'); font-size:22px; letter-spacing:1px;
  color:var(--brass-hi,#f3d999); text-shadow:0 2px 0 #000; }
.pk-top .pk-meta { margin-left:auto; display:flex; gap:22px; font-family:var(--font-mono,monospace);
  font-size:14px; color:var(--steel,#84aab2); }
.pk-top .pk-meta b { color:var(--brass-hi,#f3d999); }
.pk-leave { margin-left:14px; }

.pk-felt { flex:1; position:relative; display:flex; flex-direction:column; align-items:center;
  justify-content:space-between; padding:18px 24px 24px; min-height:0; }
.pk-oppts { display:flex; gap:14px; justify-content:center; flex-wrap:wrap; width:100%; }
.pk-seat { width:148px; padding:10px 12px; border-radius:10px; text-align:center;
  background:rgba(11,21,19,.66); border:1px solid var(--brass-deep,#58421a);
  box-shadow:inset 0 1px 0 rgba(243,217,153,.08); position:relative; transition:all .18s; }
.pk-seat.active { border-color:var(--neon,#45e0cf); box-shadow:0 0 0 1px var(--neon,#45e0cf),0 0 18px rgba(69,224,207,.35); }
.pk-seat.folded { opacity:.42; filter:grayscale(.6); }
.pk-seat .pk-name { font-family:var(--font-display,'Oswald'); font-size:15px; letter-spacing:.5px; color:var(--ink,#e8e4d8);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pk-seat .pk-stack { font-family:var(--font-mono,monospace); font-size:15px; color:var(--brass-hi,#f3d999); }
.pk-seat .pk-bet { font-family:var(--font-mono,monospace); font-size:12px; color:var(--go,#5cae8c); min-height:15px; }
.pk-seat .pk-hole { display:flex; gap:4px; justify-content:center; margin:6px 0 2px; }
.pk-seat .pk-tag { position:absolute; top:-9px; right:-9px; width:24px; height:24px; border-radius:50%;
  font-family:var(--font-title,'Russo One'); font-size:11px; line-height:24px; color:#1a120a; }
.pk-tag.D { background:var(--brass-hi,#f3d999); box-shadow:0 0 8px rgba(243,217,153,.6); }
.pk-tag.SB { background:var(--steel,#84aab2); }
.pk-tag.BB { background:var(--go,#5cae8c); }
.pk-seat .pk-place { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  font-family:var(--font-title,'Russo One'); font-size:13px; color:var(--red-2,#f5604c); background:rgba(0,0,0,.5); border-radius:10px; }

.pk-center { display:flex; flex-direction:column; align-items:center; gap:10px; }
.pk-board { display:flex; gap:8px; }
.pk-pot { font-family:var(--font-mono,monospace); font-size:18px; color:var(--brass-hi,#f3d999);
  background:rgba(0,0,0,.4); padding:4px 16px; border-radius:20px; border:1px solid var(--brass-deep,#58421a); }
.pk-banner { font-family:var(--font-title,'Russo One'); font-size:26px; color:var(--neon,#45e0cf);
  text-shadow:0 2px 0 #000; min-height:30px; text-align:center; }

.pk-you { display:flex; align-items:center; gap:18px; width:100%; justify-content:center; }
.pk-you .pk-myhole { display:flex; gap:8px; }
.pk-you .pk-mystack { font-family:var(--font-mono,monospace); font-size:18px; color:var(--brass-hi,#f3d999); }
.pk-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center; }
.pk-btn { cursor:pointer; border:1px solid var(--brass-lo,#9a7636); border-radius:6px; padding:11px 20px;
  background:linear-gradient(180deg,#14211d,#0d1613); color:var(--ink,#e8e4d8); font-family:var(--font-display,'Oswald');
  font-size:16px; letter-spacing:.5px; transition:all .15s; }
.pk-btn:hover:not(:disabled) { transform:translateY(-2px); border-color:var(--brass,#d8b066); }
.pk-btn:disabled { opacity:.32; cursor:default; }
.pk-btn.go { background:linear-gradient(180deg,var(--red-2,#f5604c),var(--red-deep,#7a1d12)); color:#fff; border-color:var(--brass,#d8b066); }
.pk-btn.raise { background:linear-gradient(180deg,#1c3a30,#0d2018); }
.pk-raisebox { display:flex; align-items:center; gap:8px; }
.pk-raisebox input[type=range] { width:160px; accent-color:var(--go,#5cae8c); }
.pk-raiseval { font-family:var(--font-mono,monospace); font-size:15px; color:var(--brass-hi,#f3d999); min-width:54px; }
.pk-wait { font-family:var(--font-display,'Oswald'); font-size:16px; color:var(--steel,#84aab2); min-height:44px; line-height:44px; }
.pk-timer { width:100%; max-width:520px; height:6px; border-radius:3px; background:rgba(0,0,0,.4); overflow:hidden; }
.pk-timer > i { display:block; height:100%; background:linear-gradient(90deg,var(--go,#5cae8c),var(--red-2,#f5604c)); transition:width .12s linear; }

/* card face */
.pk-card { width:44px; height:62px; border-radius:6px; background:#f4efe2; color:#1a1a1a;
  display:flex; flex-direction:column; align-items:center; justify-content:center; position:relative;
  box-shadow:0 2px 5px rgba(0,0,0,.5); border:1px solid #c8bfa6; font-family:var(--font-display,'Oswald'); }
.pk-card.red { color:#c01a1a; }
.pk-card .pk-r { font-size:20px; font-weight:700; line-height:1; }
.pk-card .pk-s { font-size:18px; line-height:1; }
.pk-card.back { background:repeating-linear-gradient(45deg,#5a2620 0 6px,#6e2f27 6px 12px); border-color:#3a1713; }
.pk-card.empty { background:rgba(0,0,0,.18); border:1px dashed rgba(243,217,153,.25); box-shadow:none; }
.pk-card.small { width:30px; height:42px; }
.pk-card.small .pk-r { font-size:14px; } .pk-card.small .pk-s { font-size:13px; }
.pk-card.win { box-shadow:0 0 0 2px var(--go,#5cae8c),0 0 14px rgba(92,174,140,.6); }

/* lobby */
.pk-lobby { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:22px; padding:30px; }
.pk-lobby h2 { font-family:var(--font-title,'Russo One'); font-size:34px; color:var(--brass-hi,#f3d999); text-shadow:0 3px 0 #000; }
.pk-lobby .pk-sub { color:var(--steel,#84aab2); font-size:16px; max-width:520px; text-align:center; }
.pk-lobby .pk-optrow { display:flex; align-items:center; gap:12px; }
.pk-lobby .pk-optrow label { font-family:var(--font-display,'Oswald'); color:var(--ink,#e8e4d8); font-size:18px; }
.pk-optbtn { cursor:pointer; width:42px; height:42px; border-radius:8px; border:1px solid var(--brass-deep);
  background:rgba(11,21,19,.7); color:var(--ink); font-size:18px; font-family:var(--font-mono,monospace); }
.pk-optbtn.sel { border-color:var(--neon); color:var(--neon); box-shadow:0 0 0 1px var(--neon); }
`;

// escape any peer-supplied text before it enters innerHTML (names will come from untrusted
// peers in co-op; card values/glyphs are engine-internal and safe).
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

export class PokerDomRenderer {
  constructor(root, cb) {
    this.root = root; this.cb = cb || {};
    this._built = false; this._raiseTo = 0;
  }

  mount() {
    if (this._built) return;
    if (!document.getElementById('pk-style')) {
      const st = document.createElement('style'); st.id = 'pk-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.root.innerHTML = `
      <div class="pk-wrap">
        <div class="pk-top">
          <span class="pk-title">GAMBLING DEN</span>
          <div class="pk-meta">
            <span>LVL <b id="pk-lvl">1</b></span>
            <span>BLINDS <b id="pk-blinds">10/20</b></span>
            <span>HAND <b id="pk-hand">0</b></span>
            <span>POOL <b id="pk-pool">0</b></span>
          </div>
          <button class="pk-btn pk-leave" id="pk-leave">LEAVE</button>
        </div>
        <div class="pk-lobby" id="pk-lobby"></div>
        <div class="pk-felt" id="pk-felt" style="display:none">
          <div class="pk-oppts" id="pk-oppts"></div>
          <div class="pk-center">
            <div class="pk-banner" id="pk-banner"></div>
            <div class="pk-board" id="pk-board"></div>
            <div class="pk-pot">POT <span id="pk-potval">0</span></div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;width:100%">
            <div class="pk-you" id="pk-you"></div>
            <div class="pk-actions" id="pk-actions"></div>
            <div class="pk-timer"><i id="pk-timerbar" style="width:0%"></i></div>
          </div>
        </div>
      </div>`;
    this.el = {
      lobby: this.root.querySelector('#pk-lobby'),
      felt: this.root.querySelector('#pk-felt'),
      oppts: this.root.querySelector('#pk-oppts'),
      board: this.root.querySelector('#pk-board'),
      potval: this.root.querySelector('#pk-potval'),
      banner: this.root.querySelector('#pk-banner'),
      you: this.root.querySelector('#pk-you'),
      actions: this.root.querySelector('#pk-actions'),
      timer: this.root.querySelector('#pk-timerbar'),
      lvl: this.root.querySelector('#pk-lvl'),
      blinds: this.root.querySelector('#pk-blinds'),
      hand: this.root.querySelector('#pk-hand'),
      pool: this.root.querySelector('#pk-pool'),
    };
    this.root.querySelector('#pk-leave').addEventListener('click', () => this.cb.onLeave && this.cb.onLeave());
    this._built = true;
  }

  showLobby(opts) {
    this.el.lobby.style.display = 'flex';
    this.el.felt.style.display = 'none';
    let bots = 5;
    this.el.lobby.innerHTML = `
      <h2>UNDERGROUND POKER</h2>
      <div class="pk-sub">Practice vs AI — Texas Hold'em, Sit &amp; Go, winner-takes-all.
        Playing for real bank money comes with co-op (this is play-chip practice).</div>
      <div class="pk-optrow"><label>Opponents (bots):</label>
        <span id="pk-botpick"></span></div>
      <div class="pk-actions">
        <button class="pk-btn go" id="pk-start">SIT DOWN</button>
        <button class="pk-btn" id="pk-lobbyleave">BACK</button>
      </div>`;
    const pick = this.el.lobby.querySelector('#pk-botpick');
    const draw = () => {
      pick.innerHTML = '';
      for (let i = 1; i <= 5; i++) {
        const b = document.createElement('button');
        b.className = 'pk-optbtn' + (i === bots ? ' sel' : '');
        b.textContent = i;
        b.addEventListener('click', () => { bots = i; draw(); });
        pick.appendChild(b);
      }
    };
    draw();
    this.el.lobby.querySelector('#pk-start').addEventListener('click', () => this.cb.onStart && this.cb.onStart({ bots, mode: 'practice', buyIn: 0 }));
    this.el.lobby.querySelector('#pk-lobbyleave').addEventListener('click', () => this.cb.onLeave && this.cb.onLeave());
  }

  // Host-only co-op lobby: pick a buy-in (deducted from each player's bank), then DEAL.
  showCoopLobby(opts) {
    this.el.lobby.style.display = 'flex';
    this.el.felt.style.display = 'none';
    const tiers = (opts && opts.tiers) || [500, 2000, 10000];
    const bank = (opts && opts.bank) | 0;
    let buyIn = tiers.find((t) => t <= bank) || tiers[0];
    const players = (opts && opts.players) || [];
    this.el.lobby.innerHTML = `
      <h2>UNDERGROUND POKER · CO-OP</h2>
      <div class="pk-sub">Playing for real bank money — winner-takes-all. Every player pays the buy-in from their bank.
        Your bank: <b style="color:var(--brass-hi)">$${bank}</b></div>
      <div class="pk-optrow"><label>Buy-in:</label> <span id="pk-tierpick"></span></div>
      <div class="pk-optrow"><label>Players:</label> <span style="color:var(--steel)">${players.map(esc).join(' · ') || '—'}</span></div>
      <div class="pk-actions">
        <button class="pk-btn go" id="pk-deal">DEAL</button>
        <button class="pk-btn" id="pk-coopleave">BACK</button>
      </div>`;
    const pick = this.el.lobby.querySelector('#pk-tierpick');
    const draw = () => {
      pick.innerHTML = '';
      for (const t of tiers) {
        const b = document.createElement('button');
        b.className = 'pk-optbtn' + (t === buyIn ? ' sel' : '');
        b.style.width = 'auto'; b.style.padding = '0 12px'; b.textContent = '$' + t;
        if (t > bank) { b.disabled = true; b.style.opacity = '.35'; }
        else b.addEventListener('click', () => { buyIn = t; draw(); });
        pick.appendChild(b);
      }
    };
    draw();
    this.el.lobby.querySelector('#pk-deal').addEventListener('click', () => this.cb.onStart && this.cb.onStart({ coop: true, buyIn }));
    this.el.lobby.querySelector('#pk-coopleave').addEventListener('click', () => this.cb.onLeave && this.cb.onLeave());
  }

  showTable() {
    this.el.lobby.style.display = 'none';
    this.el.felt.style.display = 'flex';
  }

  // payload: { view, tour, legal, yourTurn, timerFrac, phase, result, over, youId, names }
  renderTable(p) {
    const v = p.view, tour = p.tour;
    if (!v) return;
    const n = v.seats.length;
    const blindIdx = (() => {
      if (n === 2) return { sb: v.button, bb: (v.button + 1) % n };
      return { sb: (v.button + 1) % n, bb: (v.button + 2) % n };
    })();
    const placeOf = {};
    for (const pl of tour.players) placeOf[pl.id] = pl.place;
    const winners = p.result && p.result.winnings ? p.result.winnings : null;

    // header (cheap — every frame)
    this.el.lvl.textContent = tour.level + 1;
    this.el.blinds.textContent = tour.sb + '/' + tour.bb;
    this.el.hand.textContent = tour.handNumber;
    this.el.pool.textContent = tour.prizePool;

    // table display — rebuild ONLY when something visible changes. renderTable runs every frame;
    // rebuilding innerHTML each frame would destroy a button between mousedown/up (no click fires)
    // and reset the raise slider mid-drag.
    const tableKey = JSON.stringify({
      bd: v.board.map((c) => c.r + c.s), pot: v.pot, ta: v.toAct, bt: v.button,
      se: v.seats.map((s) => [s.id, s.stack, s.roundBet, s.folded ? 1 : 0, s.allIn ? 1 : 0,
        s.hole ? s.hole.map((c) => c.r + c.s).join('') : '', placeOf[s.id] || 0, (winners && winners[s.id]) || 0]),
      ov: p.over ? 1 : 0, rs: p.result ? 1 : 0,
    });
    if (tableKey !== this._tableKey) {
      this._tableKey = tableKey;
      const opps = v.seats.filter((s) => s.id !== p.youId);
      this.el.oppts.innerHTML = opps.map((s) => this._seatHTML(s, v, blindIdx, p, placeOf, winners)).join('');
      let bh = '';
      for (let i = 0; i < 5; i++) bh += cardHTML(v.board[i], false);
      this.el.board.innerHTML = bh;
      this.el.potval.textContent = v.pot;
      this.el.banner.textContent = this._bannerText(p, winners);
      this._renderYou(v.seats.find((s) => s.id === p.youId), p, winners);
    }

    // action panel — its own change-guard (interactive: must persist across frames)
    this._renderActions(p);

    // timer (cheap — every frame)
    this.el.timer.style.width = Math.round((p.timerFrac || 0) * 100) + '%';
  }

  _bannerText(p, winners) {
    if (p.over) return (winners && Object.keys(winners)[0] === p.youId) ? '🏆 YOU WON THE TOURNAMENT' : 'TOURNAMENT OVER';
    if (p.result) { const ids = winners ? Object.keys(winners) : []; return ids.length ? ('Pot to: ' + ids.map((id) => this._rawName(id, p)).join(' + ')) : ''; }
    return '';
  }

  _rawName(id, p) { return (p.names && p.names[id]) || (id === p.youId ? 'YOU' : id.toUpperCase()); }
  _nameOf(id, p) { return esc(this._rawName(id, p)); }

  _seatHTML(s, v, blindIdx, p, placeOf, winners) {
    const idx = s.idx;
    let tag = '';
    if (idx === v.button) tag = '<span class="pk-tag D">D</span>';
    else if (idx === blindIdx.sb) tag = '<span class="pk-tag SB">SB</span>';
    else if (idx === blindIdx.bb) tag = '<span class="pk-tag BB">BB</span>';
    const active = (idx === v.toAct) ? ' active' : '';
    const folded = s.folded ? ' folded' : '';
    let hole;
    if (s.hole) hole = s.hole.map((c) => cardHTML(c, false).replace('pk-card', 'pk-card small')).join('');
    else if (s.hasCards && !s.folded) hole = cardHTML(null, true).replace('pk-card', 'pk-card small') + cardHTML(null, true).replace('pk-card', 'pk-card small');
    else hole = '';
    const place = (placeOf[s.id] && placeOf[s.id] > 1) ? `<div class="pk-place">${placeOf[s.id]}. ✗</div>` : '';
    const won = winners && winners[s.id] ? ` +${winners[s.id]}` : '';
    const bet = s.allIn ? 'ALL-IN' : (s.roundBet ? '· ' + s.roundBet : '');
    return `<div class="pk-seat${active}${folded}">${tag}
      <div class="pk-name">${this._nameOf(s.id, p)}</div>
      <div class="pk-hole">${hole}</div>
      <div class="pk-stack">${s.stack}<span style="color:var(--go)">${won}</span></div>
      <div class="pk-bet">${bet}</div>${place}</div>`;
  }

  _renderYou(me, p, winners) {
    if (!me) { this.el.you.innerHTML = ''; return; }
    let hole = '';
    if (me.hole) {
      hole = me.hole.map((c) => cardHTML(c, false)).join('');
    } else hole = cardHTML(null, true) + cardHTML(null, true);
    const won = winners && winners[me.id] ? ` <span style="color:var(--go)">+${winners[me.id]}</span>` : '';
    const bet = me.allIn ? 'ALL-IN' : (me.roundBet ? 'bet ' + me.roundBet : '');
    this.el.you.innerHTML = `
      <div class="pk-myhole">${hole}</div>
      <div>
        <div class="pk-mystack">YOU · ${me.stack}${won}</div>
        <div class="pk-bet" style="color:var(--go)">${bet}</div>
      </div>`;
  }

  _renderActions(p) {
    const a = this.el.actions;
    // change-guard: only rebuild when the action context changes. Otherwise the buttons keep their
    // live DOM nodes (so a click registers) and the raise slider stays draggable across frames.
    const L = p.legal;
    const key = p.over ? 'over'
      : (p.yourTurn && L) ? `act:${L.canCheck ? 1 : 0}:${L.canCall ? 1 : 0}:${L.callAmount}:${L.canRaise ? 1 : 0}:${L.minRaiseTo}:${L.maxRaiseTo}`
      : `wait:${p.phase}:${p.view ? p.view.toAct : ''}`;
    if (key === this._actionsKey) return;
    this._actionsKey = key;

    if (p.over) {
      a.innerHTML = `<button class="pk-btn go" id="pk-again">BACK TO LOBBY</button>`;
      a.querySelector('#pk-again').addEventListener('click', () => this.cb.onLeave && this.cb.onLeave());
      return;
    }
    if (!p.yourTurn || !L) {
      const who = (p.view && p.view.toAct != null && p.view.seats[p.view.toAct]) ? this._nameOf(p.view.seats[p.view.toAct].id, p) : '';
      a.innerHTML = `<div class="pk-wait">${p.phase === 'handresult' ? 'Next hand…' : (who ? who + ' to act…' : '…')}</div>`;
      return;
    }
    const callLabel = L.canCheck ? 'CHECK' : ('CALL ' + L.callAmount);
    this._raiseTo = Math.min(L.maxRaiseTo, L.minRaiseTo); // a fresh turn starts the slider at the minimum raise
    a.innerHTML = `
      <button class="pk-btn" id="pk-fold">FOLD</button>
      <button class="pk-btn go" id="pk-callcheck">${callLabel}</button>
      ${L.canRaise ? `<div class="pk-raisebox">
        <input type="range" id="pk-raiserng" min="${L.minRaiseTo}" max="${L.maxRaiseTo}" value="${this._raiseTo}" ${L.maxRaiseTo === L.minRaiseTo ? 'disabled' : ''}>
        <span class="pk-raiseval" id="pk-raiseval">${this._raiseTo}</span>
        <button class="pk-btn raise" id="pk-raise">RAISE → ${this._raiseTo}</button>
        <button class="pk-btn raise" id="pk-allin">ALL-IN</button>
      </div>` : ''}`;
    a.querySelector('#pk-fold').addEventListener('click', () => this.cb.onAct({ type: 'fold' }));
    a.querySelector('#pk-callcheck').addEventListener('click', () => this.cb.onAct(L.canCheck ? { type: 'check' } : { type: 'call' }));
    if (L.canRaise) {
      const rng = a.querySelector('#pk-raiserng'), val = a.querySelector('#pk-raiseval'), btn = a.querySelector('#pk-raise');
      rng.addEventListener('input', () => { this._raiseTo = +rng.value; val.textContent = rng.value; btn.textContent = 'RAISE → ' + rng.value; });
      btn.addEventListener('click', () => this.cb.onAct({ type: 'raise', to: this._raiseTo }));
      a.querySelector('#pk-allin').addEventListener('click', () => this.cb.onAct({ type: 'allin' }));
    }
  }
}
