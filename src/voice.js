// voice.js — co-op PROXIMITY VOICE CHAT (Phase 1 of the voice+radio feature).
// Design: docs/superpowers/specs/2026-07-01-coop-voice-chat-radios-design.md (§5,§8-§12).
//
// A full mesh of raw RTCPeerConnections carries one audio track per pair. SDP/ICE signalling
// rides the EXISTING co-op transport (`mp.net.broadcast`), so this ONE code path gives voice on
// BOTH WebRTC (Net) and LAN (LanNet) — the host is not an audio hop. Each remote stream is
// rendered positionally (PannerNode) with wall-occlusion (BiquadFilter driven by a grid raycast)
// against the local camera as the Web Audio listener. Nothing here is host-authoritative:
// audibility is computed independently on every client from already-synced positions.
//
// CRUX (verified net.js:297-328): a CLIENT can only reach the HOST via send/sendTo. Client->client
// therefore rides `broadcast` (host relays via `_r`) with an explicit {to,from} envelope, and the
// relayed message's transport `fromId` is the HOST, so we always read the ORIGINAL sender from
// `d.from`, never the handler's fromId argument.

import * as THREE from 'three';
import { clamp, lerp, damp } from './util.js';
import { iceConfig } from './net.js';
import { RADIO, withinPassband, channelSnr, quality, resolveReception } from './radiosim.js';

const OCC_HZ = 10;                 // occlusion raycast + speaking-meter rate (Hz)
const VAD_HANG = 0.25;             // seconds the mic stays open after voice drops below threshold
const OCC_LP_OPEN = 22050;         // lowpass cutoff, clear line-of-sight
const OCC_LP_BLOCK = 500;          // lowpass cutoff, fully occluded (muffled through a wall)
const OCC_GAIN_BLOCK = 0.55;       // gain multiplier when fully occluded
const SPEAK_RMS = 0.02;            // RMS above which a remote's "speaking" dot lights
// field-radio STATIC/hiss model — real radio: ON + tuned to nothing = loud open static; it fades as a clean signal locks in.
const STATIC_OPEN = 0.9;           // static level (0..1) when the radio is ON but receiving nothing (between stations)
const STATIC_FLOOR = 0.05;         // faint carrier hiss that survives even on a locked, perfectly-clear signal
const STATIC_OUT = 0.42;           // output gain applied to the static level → makes it clearly audible (was an inaudible 0.12)
const STATIC_LAMBDA = 10;          // static crossfade smoothing (higher = snappier as you turn the dial)

export class VoiceChat {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    // local
    this.micStreamRaw = null; this.micSrc = null; this.micGainNode = null;
    this.micDest = null; this.micStream = null; this.micTrack = null;
    this.micAnalyser = null; this._micBuf = null;
    // output bus (separate from game SFX so voice can target its own output device)
    this.voiceMaster = null; this.voiceSink = null; this.voiceOutEl = null;
    this._monitorGain = null;      // optional self-monitor tap
    // mesh
    this.peers = new Map();        // sessionPeerId -> PeerVoice
    this._voiceOn = new Set();     // peers who announced voice ON (presence)
    this._ice = null;              // RTCConfiguration (shared with the data plane)
    // state
    this.enabled = false; this.micDenied = false; this.voiceMuted = false;
    this.ptt = false; this.pttKey = 'CapsLock';
    this.radioOn = false; this.radioFreq = 40.150; this.radioTx = false; this.radioPttKey = 'KeyX'; // field-radio channel (Phase 2)
    this.speakers = new Map();     // deployed-radio loudspeakers: structId -> { panner, bp, freq, on, taps:Map<peerId,gain> }
    this.stations = [];            // preset RADIO_STATIONS: a local asset "always broadcasting" on a fixed freq — tune in to hear it (single-machine testable)
    this.vadThresh = SPEAK_RMS; this.localSpeaking = false; this._vadHang = 0;
    this._inCoop = false; this._occT = 0; this._micTest = false;
    // settings mirror (filled by applySettings)
    this._s = { voiceVol: 1, micGain: 1, echoCancel: 1, noiseSup: 1, autoGain: 1,
                inDevId: '', outDevId: '', selfMonitor: 0 };
  }

  get _net() { return this.game.mp && this.game.mp.net; }
  get myId() { return (this.game.mp && this.game.mp.myId) || null; }

  // ---- opt-in lifecycle -------------------------------------------------------------------

  // Called from the "Enable voice" click (a user gesture, so ctx/getUserMedia are allowed).
  async enable() {
    if (this.enabled) return true;
    this.game.audio.init();                 // guarantees the shared AudioContext exists + resumed
    this.ctx = this.game.audio.ctx;
    if (!this.ctx) return false;
    this._ice = await iceConfig();
    try {
      this.micStreamRaw = await navigator.mediaDevices.getUserMedia({ audio: this._micConstraints() });
      this.micDenied = false;
    } catch (e) {
      this.micDenied = true;                // permission/hardware denied -> receive-only, game unaffected
      if (typeof console !== 'undefined') console.warn('[voice] mic unavailable — receive-only:', e && e.name);
    }
    this._buildOutputGraph();
    this._buildCrackle();
    this._initStations();
    if (!this.micDenied) this._buildMicGraph();
    this._rescanSpeakers();   // radios deployed before voice was enabled had a no-op setSpeaker (ctx was null) — register them now
    this.enabled = true;
    // if a run is already live, join the mesh now
    if (this.game.mp && this.game.mp.active) this._enterMesh();
    return true;
  }

  disable() {
    if (!this.enabled) return;
    this._announce(false);
    this._exitMesh();
    // stations: pause AND disconnect their source/gain (not just el.pause) so they don't dangle off the old voiceMaster
    for (const st of this.stations) { try { st.el.pause(); } catch (e) {} try { st.srcNode && st.srcNode.disconnect(); } catch (e) {} try { st.cgain && st.cgain.disconnect(); } catch (e) {} }
    this.stations = [];
    for (const id of [...this.speakers.keys()]) this.removeSpeaker(id); // tear down every deployed-radio loudspeaker (also clears its peer/station taps)
    try { this._crackleSrc && this._crackleSrc.stop(); } catch (e) {} try { this._crackleGain && this._crackleGain.disconnect(); } catch (e) {}
    this._crackleSrc = null; this._crackleGain = null;
    try { this._monitorGain && this._monitorGain.disconnect(); } catch (e) {} this._monitorGain = null;
    if (this.micStreamRaw) { for (const t of this.micStreamRaw.getTracks()) try { t.stop(); } catch (e) {} }
    try { this.micSrc && this.micSrc.disconnect(); } catch (e) {}
    this.micStreamRaw = this.micSrc = this.micGainNode = this.micDest = this.micStream = this.micTrack = null;
    this.micAnalyser = null;
    // output bus: disconnect + release so a re-enable rebuilds cleanly instead of orphaning the whole graph
    try { this.voiceMaster && this.voiceMaster.disconnect(); } catch (e) {}
    try { this.voiceSink && this.voiceSink.disconnect(); } catch (e) {}
    try { if (this.voiceOutEl) { this.voiceOutEl.pause(); this.voiceOutEl.srcObject = null; } } catch (e) {}
    this.voiceMaster = this.voiceSink = this.voiceOutEl = null;
    this.enabled = false; this.micDenied = false; this.localSpeaking = false;
  }

  _micConstraints() {
    const s = this._s;
    const a = { echoCancellation: !!s.echoCancel, noiseSuppression: !!s.noiseSup, autoGainControl: !!s.autoGain };
    if (s.inDevId) a.deviceId = { exact: s.inDevId };
    return a;
  }

  _buildMicGraph() {
    const ctx = this.ctx;
    this.micSrc = ctx.createMediaStreamSource(this.micStreamRaw);
    this.micGainNode = ctx.createGain(); this.micGainNode.gain.value = this._s.micGain;
    this.micDest = ctx.createMediaStreamDestination();
    this.micSrc.connect(this.micGainNode); this.micGainNode.connect(this.micDest);   // gain-controlled SENT audio
    this.micAnalyser = ctx.createAnalyser(); this.micAnalyser.fftSize = 512;
    this._micBuf = new Uint8Array(this.micAnalyser.fftSize);
    this.micSrc.connect(this.micAnalyser);                                            // VAD/meter tap (pre-gain)
    this.micStream = this.micDest.stream;
    this.micTrack = this.micStream.getAudioTracks()[0];
    if (this.micTrack) this.micTrack.enabled = false;                                 // gated until VAD/PTT opens it
    this._applySelfMonitor();
  }

  _buildOutputGraph() {
    const ctx = this.ctx;
    this.voiceMaster = ctx.createGain();
    this.voiceMaster.gain.value = this.voiceMuted ? 0 : this._s.voiceVol;
    this.voiceSink = ctx.createMediaStreamDestination();
    this.voiceMaster.connect(this.voiceSink);
    this.voiceOutEl = new Audio(); this.voiceOutEl.autoplay = true;
    this.voiceOutEl.srcObject = this.voiceSink.stream;
    this._applySink();
    this.voiceOutEl.play().catch(() => {});
  }

  _buildCrackle() {
    if (!this.ctx || this._crackleGain) return;
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    // shape white noise into a broad radio "shhhh": a gentle highpass kills the rumble, a wide bandpass gives the hiss body
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.45;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(hp); hp.connect(bp); bp.connect(g); if (this.voiceMaster) g.connect(this.voiceMaster);
    try { src.start(); } catch (e) {}
    this._crackleSrc = src; this._crackleGain = g;
  }
  _applySink() {
    const el = this.voiceOutEl, id = this._s.outDevId;
    if (el && id && el.setSinkId) el.setSinkId(id).catch(() => {});
  }

  _applySelfMonitor() {
    if (!this.ctx || !this.micSrc) return;
    const want = !!this._s.selfMonitor || this._micTest; // hear yourself if the toggle is on OR during an active mic test
    if (want && !this._monitorGain) {
      this._monitorGain = this.ctx.createGain(); this._monitorGain.gain.value = 1;
      this.micSrc.connect(this._monitorGain); this._monitorGain.connect(this.ctx.destination);
    } else if (!want && this._monitorGain) {
      try { this._monitorGain.disconnect(); } catch (e) {}
      this._monitorGain = null;
    }
  }

  // ---- mesh + signalling ------------------------------------------------------------------

  _enterMesh() { if (this.enabled) this._announce(true); }
  _exitMesh() { for (const id of [...this.peers.keys()]) this._dropPeer(id); this._voiceOn.clear(); }

  _announce(on) { const n = this._net; if (n) n.broadcast('vhello', { from: this.myId, on: on !== false }); }
  _sig(type, to, extra) { const n = this._net; if (n) n.broadcast(type, Object.assign({ to, from: this.myId }, extra)); }

  // presence: someone announced their voice on/off  (read d.from, NOT the relayed fromId)
  _onHello(d) {
    if (!d || d.from == null || d.from === this.myId) return;
    if (d.on) {
      const isNew = !this._voiceOn.has(d.from);
      this._voiceOn.add(d.from);
      if (this.enabled) { if (isNew) this._announce(true); this._ensurePeer(d.from); this._announceRadio(); }
    } else {
      this._voiceOn.delete(d.from); this._dropPeer(d.from);
    }
  }

  _ensurePeer(peerId) {
    if (peerId == null || peerId === this.myId || this.peers.has(peerId) || !this.ctx) return this.peers.get(peerId);
    const pc = new RTCPeerConnection(this._ice || undefined);
    const pv = { id: peerId, pc, polite: String(this.myId) > String(peerId),
                 makingOffer: false, ignoreOffer: false, occ: 0, occTarget: 0, speaking: false,
                 srcNode: null, panner: null, lowpass: null, gain: null, analyser: null, kickEl: null, _buf: null };
    this.peers.set(peerId, pv);
    if (this.micTrack) pc.addTrack(this.micTrack, this.micStream);
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    pc.onnegotiationneeded = async () => {
      try { pv.makingOffer = true; await pc.setLocalDescription(); this._sig('vsdp', peerId, { sdp: pc.localDescription }); }
      catch (e) {} finally { pv.makingOffer = false; }
    };
    pc.onicecandidate = ({ candidate }) => { if (candidate) this._sig('vice', peerId, { cand: candidate }); };
    pc.ontrack = ({ streams }) => this._attachRemote(peerId, streams[0]);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { const on = this._voiceOn.has(peerId); this._dropPeer(peerId); if (on && this.enabled) this._ensurePeer(peerId); }
    };
    return pv;
  }

  async _onSdp(d) {
    if (!d || d.to !== this.myId || d.from == null) return;
    const pv = this._ensurePeer(d.from); if (!pv) return;
    const pc = pv.pc, desc = d.sdp;
    try {
      const collision = desc.type === 'offer' && (pv.makingOffer || pc.signalingState !== 'stable');
      pv.ignoreOffer = !pv.polite && collision;
      if (pv.ignoreOffer) return;
      await pc.setRemoteDescription(desc);            // polite peer implicitly rolls back on collision
      if (desc.type === 'offer') { await pc.setLocalDescription(); this._sig('vsdp', d.from, { sdp: pc.localDescription }); }
    } catch (e) { if (typeof console !== 'undefined') console.warn('[voice] sdp', e && e.message); }
  }

  async _onIce(d) {
    if (!d || d.to !== this.myId || d.from == null) return;
    const pv = this.peers.get(d.from); if (!pv || !d.cand) return;
    try { await pv.pc.addIceCandidate(d.cand); } catch (e) { if (!pv.ignoreOffer && typeof console !== 'undefined') console.warn('[voice] ice', e && e.message); }
  }

  _attachRemote(peerId, stream) {
    const pv = this.peers.get(peerId); if (!pv || !this.ctx || !stream || pv.srcNode) return;
    pv.stream = stream;
    // Chrome quirk: a MediaStreamSource off an RTCPeerConnection track stays SILENT unless the
    // stream is ALSO sunk into a (muted) media element. This kick element is mandatory.
    pv.kickEl = new Audio(); pv.kickEl.muted = true; pv.kickEl.srcObject = stream; pv.kickEl.play().catch(() => {});
    const ctx = this.ctx;
    pv.srcNode = ctx.createMediaStreamSource(stream);
    pv.panner = ctx.createPanner();
    pv.panner.panningModel = 'HRTF'; pv.panner.distanceModel = 'inverse';
    pv.panner.refDistance = 2; pv.panner.maxDistance = 60; pv.panner.rolloffFactor = 1.2;
    pv.lowpass = ctx.createBiquadFilter(); pv.lowpass.type = 'lowpass'; pv.lowpass.frequency.value = OCC_LP_OPEN;
    pv.gain = ctx.createGain(); pv.gain.gain.value = this._peerVol(peerId);
    pv.analyser = ctx.createAnalyser(); pv.analyser.fftSize = 256; pv._buf = new Uint8Array(pv.analyser.fftSize);
    pv.srcNode.connect(pv.panner); pv.panner.connect(pv.lowpass); pv.lowpass.connect(pv.gain); pv.gain.connect(this.voiceMaster);
    pv.srcNode.connect(pv.analyser);
    // radio RECEIVE chain (2D "radio" timbre) off the SAME stream — gated each frame by tuning (§3). Loudspeaker/positional variant is a follow-up.
    pv.radioBP = ctx.createBiquadFilter(); pv.radioBP.type = 'bandpass'; pv.radioBP.frequency.value = 1650; pv.radioBP.Q.value = 1.1;
    pv.radioGain = ctx.createGain(); pv.radioGain.gain.value = 0;
    pv.srcNode.connect(pv.radioBP); pv.radioBP.connect(pv.radioGain); pv.radioGain.connect(this.voiceMaster);
  }

  _dropPeer(peerId) {
    const pv = this.peers.get(peerId); if (!pv) return;
    try { pv.pc && pv.pc.close(); } catch (e) {}
    try { pv.srcNode && pv.srcNode.disconnect(); } catch (e) {}
    try { pv.gain && pv.gain.disconnect(); } catch (e) {}
    try { if (pv.kickEl) { pv.kickEl.pause(); pv.kickEl.srcObject = null; } } catch (e) {}
    const rp = this.game.mp && this.game.mp.remotes && this.game.mp.remotes.get(peerId);
    if (rp && rp.setSpeaking) rp.setSpeaking(false);
    for (const sp of this.speakers.values()) { const t = sp.taps.get(peerId); if (t) { try { t.disconnect(); } catch (e) {} sp.taps.delete(peerId); } }
    this.peers.delete(peerId);
  }

  // ---- per-frame update (called after mp.update so remote .pos is fresh) -------------------

  update(dt) {
    // co-op edge -> join/leave mesh
    const inCoop = !!(this.game.mp && this.game.mp.active);
    if (inCoop !== this._inCoop) { this._inCoop = inCoop; if (inCoop) this._enterMesh(); else this._exitMesh(); }
    if (!this.enabled || !this.ctx) return;

    this._updateListener();
    this._updateLocalGate(dt);

    // throttle the raycast + meters to OCC_HZ
    this._occT -= dt;
    const tick = this._occT <= 0; if (tick) this._occT = 1 / OCC_HZ;

    const cam = this.game.engine && this.game.engine.camera;
    if (tick && cam) this._enclosureDb = this._enclosure(cam);
    this._recvClarity = 0;  // best clean reception this frame (station or voice), 0..1 → drives the static crossfade
    this._garble = 0;       // extra mush from two stations doubling on one channel
    for (const [id, pv] of this.peers) {
      const rp = this.game.mp.remotes && this.game.mp.remotes.get(id);
      if (rp && pv.panner) this._setPos(pv.panner, rp.pos);
      if (tick && cam && rp) pv.occTarget = this._occlusionTarget(cam, rp.pos);
      if (pv.lowpass && pv.gain) {
        pv.occ = damp(pv.occ, pv.occTarget, 6, dt);
        pv.lowpass.frequency.value = lerp(OCC_LP_OPEN, OCC_LP_BLOCK, pv.occ);
        pv.gain.gain.value = this._peerVol(id) * lerp(1, OCC_GAIN_BLOCK, pv.occ);
      }
      if (tick && pv.analyser) {
        const spk = this._rms(pv.analyser, pv._buf) > SPEAK_RMS;
        if (spk !== pv.speaking) { pv.speaking = spk; if (rp && rp.setSpeaking) rp.setSpeaking(spk); if (this.onSpeaking) this.onSpeaking(id, spk); }
      }
    }
    this._updateRadioReception(dt);
    this._updateStations(dt);
    this._updateSpeakers(dt);
    // STATIC crossfade: radio ON + nothing tuned = full open static; it recedes toward a whisper as a clean
    // signal (station or voice) locks in, so scanning the dial FEELS like a real radio hunting for a station.
    let staticTarget = 0;
    if (this.radioOn && !this.radioTx) {                            // keyed up = deaf on RX → no open static either (you're transmitting, not scanning)
      staticTarget = STATIC_FLOOR + (STATIC_OPEN - STATIC_FLOOR) * (1 - clamp(this._recvClarity || 0, 0, 1));
      staticTarget = Math.max(staticTarget, this._garble || 0);   // doubling on one channel = extra mush
    }
    if (this._crackleGain) this._crackleGain.gain.value = damp(this._crackleGain.gain.value, staticTarget * STATIC_OUT, STATIC_LAMBDA, dt);
  }

  _updateListener() {
    const cam = this.game.engine && this.game.engine.camera; if (!cam) return;
    const L = this.ctx.listener;
    cam.getWorldDirection(_fwd);
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      L.forwardX.value = _fwd.x; L.forwardY.value = _fwd.y; L.forwardZ.value = _fwd.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(_fwd.x, _fwd.y, _fwd.z, 0, 1, 0);
    }
  }

  _setPos(panner, p) {
    if (panner.positionX) { panner.positionX.value = p.x; panner.positionY.value = p.y; panner.positionZ.value = p.z; }
    else panner.setPosition(p.x, p.y, p.z);
  }

  _updateLocalGate(dt) {
    if (!this.micTrack) { this.localSpeaking = false; this._setRadioTx(false); return; }
    const mp = this.game.mp;
    const dead = !!(mp && mp._localDead);                                   // dead = receive-only (spec §16)
    let prox;
    if (dead) prox = false;
    else if (this.ptt) prox = this.game.input.isDown(this.pttKey);
    else {
      const rms = this._rms(this.micAnalyser, this._micBuf);
      if (rms > this.vadThresh) this._vadHang = VAD_HANG; else this._vadHang = Math.max(0, this._vadHang - dt);
      prox = this._vadHang > 0;
    }
    const radio = !dead && this.radioOn && this.game.input.isDown(this.radioPttKey); // hold radio-PTT to transmit on the channel
    this._setRadioTx(radio);
    this.localSpeaking = prox;
    const talk = prox || radio;                                            // mic opens for EITHER proximity or radio
    if (this.micTrack.enabled !== talk) this.micTrack.enabled = talk;      // free DTX when both are closed
  }
  _setRadioTx(tx) { if (tx !== this.radioTx) { this.radioTx = tx; this._announceRadio(); } }

  _occlusionTarget(cam, pos) {
    const grid = this.game.world && this.game.world.grid; if (!grid || !grid.raycast) return 0;
    let dx = pos.x - cam.position.x, dy = pos.y - cam.position.y, dz = pos.z - cam.position.z;
    const dist = Math.hypot(dx, dy, dz); if (dist < 0.6) return 0;
    dx /= dist; dy /= dist; dz /= dist;
    const hit = grid.raycast(cam.position.x, cam.position.y, cam.position.z, dx, dy, dz, dist - 0.5);
    return hit ? 1 : 0;
  }

  _rms(analyser, buf) {
    if (!analyser || !buf) return 0;
    analyser.getByteTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / buf.length);
  }

  // ---- per-player volume (persisted by STABLE pid, live graph keyed by session peerId) -----

  _pidOf(peerId) { const r = this.game.mp && this.game.mp.roster && this.game.mp.roster.get(peerId); return (r && r.pid) || peerId; }
  _peerVol(peerId) {
    const pv = this.peers.get(peerId); if (pv && pv.muted) return 0;
    const map = (this.game.settings && this.game.settings.data.perPlayerVolume) || {};
    const v = map[this._pidOf(peerId)]; return (v == null ? 1 : v);
  }
  peerVolumeRaw(peerId) { const map = (this.game.settings && this.game.settings.data.perPlayerVolume) || {}; const v = map[this._pidOf(peerId)]; return v == null ? 1 : v; } // slider init (ignores mute)
  setPeerVolume(peerId, v) {
    const map = this.game.settings.data.perPlayerVolume || (this.game.settings.data.perPlayerVolume = {});
    map[this._pidOf(peerId)] = clamp(v, 0, 2); this.game.settings.save();
    const pv = this.peers.get(peerId); if (pv && pv.gain) pv.gain.gain.value = this._peerVol(peerId) * lerp(1, OCC_GAIN_BLOCK, pv.occ);
  }
  setPeerMuted(peerId, m) { const pv = this.peers.get(peerId); if (pv) { pv.muted = !!m; if (pv.gain) pv.gain.gain.value = this._peerVol(peerId); } }
  isPeerMuted(peerId) { const pv = this.peers.get(peerId); return !!(pv && pv.muted); }

  toggleVoiceMute() { this.voiceMuted = !this.voiceMuted; if (this.voiceMaster) this.voiceMaster.gain.value = this.voiceMuted ? 0 : this._s.voiceVol; return this.voiceMuted; }

  // ---- field radio (Phase 2): tuning state is synced; audibility is computed locally (radiosim) ----
  setRadioFreq(f) { this.radioFreq = f; this._announceRadio(); }
  setRadioOn(on) { this.radioOn = !!on; this._announceRadio(); }
  _announceRadio() { const n = this._net; if (n) n.broadcast('rstate', { from: this.myId, rf: this.radioFreq, rt: this.radioTx, ro: this.radioOn }); }
  _onRadioState(d) { if (!d || d.from == null || d.from === this.myId) return; const pv = this.peers.get(d.from); if (pv) { pv.rf = d.rf; pv.rt = !!d.rt; pv.ro = !!d.ro; } }

  // A deployed radio broadcasts its channel out loud at its ground position — nearby players hear
  // whoever transmits on its freq WITHOUT their own radio. Called by world.js on place/tune/toggle.
  setSpeaker(id, x, y, z, freq, on) {
    if (!this.ctx) return;
    let sp = this.speakers.get(id);
    if (!sp) {
      const ctx = this.ctx;
      const panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 3; panner.maxDistance = 45; panner.rolloffFactor = 1.4;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1650; bp.Q.value = 1.0;
      bp.connect(panner); if (this.voiceMaster) panner.connect(this.voiceMaster);
      sp = { id, panner, bp, freq, on: !!on, taps: new Map(), stationTaps: new Map() };
      this.speakers.set(id, sp);
    }
    sp.freq = freq; sp.on = !!on;
    this._setPos(sp.panner, { x, y: (y || 0) + 0.7, z });
  }
  // Register a loudspeaker for every already-deployed R-105Д — setSpeaker no-ops while ctx is null (voice off),
  // so a radio placed before you opted into voice would otherwise never get a loudspeaker. Called from enable().
  _rescanSpeakers() {
    const b = this.game.build; if (!this.ctx || !b || !b.structures) return;
    for (const s of b.structures) if (s.kind === 'r105') this.setSpeaker(s.id, s.pos.x, s.pos.y, s.pos.z, s.freq || 40.150, s.on);
  }
  removeSpeaker(id) {
    const sp = this.speakers.get(id); if (!sp) return;
    for (const g of sp.taps.values()) { try { g.disconnect(); } catch (e) {} }
    if (sp.stationTaps) for (const g of sp.stationTaps.values()) { try { g.disconnect(); } catch (e) {} } // station taps hang off the session-lived station srcNode → cut them or they leak
    try { sp.bp.disconnect(); sp.panner.disconnect(); } catch (e) {}
    this.speakers.delete(id);
  }
  _updateSpeakers(dt) {
    // the deployed radio you're keying (panel open + transmitting through it) can't also RECEIVE on its loudspeaker
    const keyedId = (this.radioTx && this.game.radioPanel && this.game.radioPanel.struct) ? this.game.radioPanel.struct.id : null;
    for (const sp of this.speakers.values()) {
      const rx = sp.on && sp.id !== keyedId;   // receiving = on AND not the one you're transmitting through
      const gains = new Map();
      if (rx) this._applyChannel(this._resolveChannel(sp.freq, 0), gains);
      for (const [id, pv] of this.peers) {
        if (!pv.srcNode) continue;
        const target = gains.get(id) || 0;
        let tap = sp.taps.get(id);
        if (!tap && target > 0) { tap = this.ctx.createGain(); tap.gain.value = 0; pv.srcNode.connect(tap); tap.connect(sp.bp); sp.taps.set(id, tap); }
        if (tap) tap.gain.value = damp(tap.gain.value, target, 12, dt);
      }
      if (sp.stationTaps) for (const st of this.stations) {                 // deployed radio also plays preset stations out loud
        let g = 0;
        if (rx && withinPassband(sp.freq, st.freq)) g = 0.85 * quality(channelSnr(sp.freq - st.freq), RADIO.SQUELCH_DB).clarity;
        let tap = sp.stationTaps.get(st);
        if (!tap && g > 0) { tap = this.ctx.createGain(); tap.gain.value = 0; st.srcNode.connect(tap); tap.connect(sp.bp); sp.stationTaps.set(st, tap); if (st.el.paused) st.el.play().catch(() => {}); }
        if (tap) tap.gain.value = damp(tap.gain.value, g, 12, dt);
      }
    }
  }
  // Collect same-channel transmitters, resolve capture vs doubling/garble (radiosim §3.4). enclosureDb
  // subtracts from every candidate's SNR (underground/roofed receiver = worse reception).
  _resolveChannel(freq, enclosureDb) {
    const cands = [];
    for (const [id, pv] of this.peers) {
      if (!pv.rt || !pv.ro || !withinPassband(pv.rf, freq)) continue;
      const snr = channelSnr(pv.rf - freq, enclosureDb);
      cands.push({ id, snr });
    }
    return resolveReception(cands, RADIO.SQUELCH_DB);
  }
  // Fill `gains` (peerId → receive gain) for one resolved channel; RETURN the static contribution
  // { clarity, garble } so the caller decides whether it drives the local static (own radio) or not (a speaker).
  _applyChannel(res, gains) {
    if (res.mode === 'clear') {
      const q = quality(res.snr, RADIO.SQUELCH_DB);
      gains.set(res.id, 0.95 * q.clarity);
      return { clarity: q.clarity, garble: res.captured ? 0.12 : 0 };  // faint "someone doubling under it" texture
    } else if (res.mode === 'garble') {
      gains.set(res.top, 0.3 * (1 - res.intensity));          // the stronger voice only leaks faintly through the mush
      return { clarity: 0, garble: 0.6 + 0.35 * res.intensity };
    }
    return { clarity: 0, garble: 0 };
  }
  _updateRadioReception(dt) {
    const gains = new Map();
    if (this.radioOn && !this.radioTx) {                                   // half-duplex: transmitting = deaf on the radio (spec decision #5)
      const c = this._applyChannel(this._resolveChannel(this.radioFreq, this._enclosureDb || 0), gains);
      this._recvClarity = Math.max(this._recvClarity || 0, c.clarity);   // a clear voice cuts through the static
      this._garble = Math.max(this._garble || 0, c.garble);
    }
    for (const [id, pv] of this.peers) if (pv.radioGain) pv.radioGain.gain.value = damp(pv.radioGain.gain.value, gains.get(id) || 0, 12, dt);
  }
  _enclosure(cam) {                                          // roof/overhead mass above the receiver → dB penalty (§7 enclosure model)
    const grid = this.game.world && this.game.world.grid; if (!grid || !grid.raycast) return 0;
    const hit = grid.raycast(cam.position.x, cam.position.y, cam.position.z, 0, 1, 0, 14);
    return hit ? clamp(14 - hit.t, 0, 12) : 0;               // closer roof = more enclosed (up to 12 dB)
  }

  // ---- preset RADIO_STATIONS (design §4): local audio "always on" at a fixed freq; tune in to hear it ----
  _initStations() {
    if (this.stations.length || !this.ctx || !this.voiceMaster) return;
    this._addStation(44.100, 'assets/polyushko.mp3'); // «СЕКРЕТ» — hidden Soviet station (Полюшко-поле); single-machine test target
  }
  _addStation(freq, url) {
    const ctx = this.ctx;
    let el, srcNode;
    try { el = new Audio(url); el.loop = true; srcNode = ctx.createMediaElementSource(el); }
    catch (e) { if (typeof console !== 'undefined') console.warn('[voice] station load failed', url, e); return; }
    const cgain = ctx.createGain(); cgain.gain.value = 0;
    srcNode.connect(cgain); cgain.connect(this.voiceMaster);       // carried/private reception path
    el.play().catch(() => {});
    this.stations.push({ freq, el, srcNode, cgain });
  }
  _updateStations(dt) {
    for (const st of this.stations) {
      let g = 0;
      if (this.radioOn && !this.radioTx && withinPassband(this.radioFreq, st.freq)) { // half-duplex: keyed up = deaf on RX (spec decision #5)
        const snr = channelSnr(this.radioFreq - st.freq, this._enclosureDb || 0);
        const q = quality(snr, RADIO.SQUELCH_DB);
        g = 0.9 * q.clarity;
        this._recvClarity = Math.max(this._recvClarity || 0, q.clarity);  // station clarity ramps the static DOWN as you tune in
      }
      if (g > 0.02 && st.el.paused) st.el.play().catch(() => {});
      if (st.cgain) st.cgain.gain.value = damp(st.cgain.gain.value, g, 12, dt);
    }
  }

  // ---- settings + mic test ----------------------------------------------------------------

  async applySettings(data) {
    if (!data) return;
    const s = this._s, prev = Object.assign({}, s);
    s.voiceVol = num(data.voiceVol, 1); s.micGain = num(data.micGain, 1);
    s.echoCancel = num(data.echoCancel, 1); s.noiseSup = num(data.noiseSup, 1); s.autoGain = num(data.autoGain, 1);
    s.inDevId = data.inDevId || ''; s.outDevId = data.outDevId || ''; s.selfMonitor = num(data.selfMonitor, 0);
    this.ptt = !!data.ptt; this.pttKey = data.pttKey || this.pttKey;
    this.vadThresh = lerp(0.06, 0.004, clamp(num(data.vad, 0.5), 0, 1));   // higher sensitivity -> lower threshold
    if (!this.enabled) return;
    if (this.voiceMaster && !this.voiceMuted) this.voiceMaster.gain.value = s.voiceVol;
    if (this.micGainNode) this.micGainNode.gain.value = s.micGain;
    if (prev.outDevId !== s.outDevId) this._applySink();
    this._applySelfMonitor();
    // audio-processing constraints changed -> re-apply live; input DEVICE change needs a fresh capture
    if (this.micTrack && (prev.echoCancel !== s.echoCancel || prev.noiseSup !== s.noiseSup || prev.autoGain !== s.autoGain) && prev.inDevId === s.inDevId) {
      try { await this.micStreamRaw.getAudioTracks()[0].applyConstraints(this._micConstraints()); } catch (e) {}
    }
    if (prev.inDevId !== s.inDevId && !this.micDenied) await this._reacquireMic();
  }

  async _reacquireMic() {
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ audio: this._micConstraints() });
      if (this.micStreamRaw) for (const t of this.micStreamRaw.getTracks()) try { t.stop(); } catch (e) {}
      this.micStreamRaw = fresh;
      // rebuild the mic graph + swap the sent track on every live peer connection
      if (this.micSrc) try { this.micSrc.disconnect(); } catch (e) {}
      if (this._monitorGain) { try { this._monitorGain.disconnect(); } catch (e) {} this._monitorGain = null; } // else _buildMicGraph→_applySelfMonitor sees a stale gain and never re-taps the NEW micSrc (self-monitor goes silent)
      this._buildMicGraph();
      for (const pv of this.peers.values()) {
        const sender = pv.pc.getSenders().find(x => x.track && x.track.kind === 'audio');
        if (sender && this.micTrack) sender.replaceTrack(this.micTrack).catch(() => {});
      }
    } catch (e) { if (typeof console !== 'undefined') console.warn('[voice] reacquire mic failed', e && e.name); }
  }

  // level 0..1 for the settings mic-test meter
  getMicLevel() { return this._rms(this.micAnalyser, this._micBuf); }
  startMicTest() { this._micTest = true; this._applySelfMonitor(); }   // (meter is polled by the UI; monitor stays off unless the user opts in)
  stopMicTest() { this._micTest = false; this._applySelfMonitor(); }
}

function num(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }

// scratch (module-local; the game loop is single-threaded)
const _fwd = new THREE.Vector3();
