// radiosim.js — deterministic analog field-radio audibility model (Phase 2). PURE functions, no
// side effects, no imports: audibility is f(freq, ptt, pos, power, battery), computed identically on
// every client → no host arbitration for "who hears whom". Design spec 2026-07-01 §3.
// NB: distinct from radio.js (the diegetic MUSIC stations) — this is the FIELD-RADIO sim.

export const RADIO = {
  BAND_MIN: 36.0, BAND_MAX: 46.1,   // MHz — R-105D band
  READOUT_STEP: 0.001,               // MHz dial resolution (1 kHz) — finer than TOL so a shared number reliably locks
  TOL: 8_000,                         // Hz — clean-window half-width (≈ R-105D ±8 kHz): land here = fully clear
  PASSBAND_EDGE: 60_000,             // Hz — beyond this the signal is filter-rejected → silence
  DETUNE_K: 14,                      // dB penalty ramp across the shoulder (TOL..PASSBAND_EDGE) — gentle, so you HEAR the static→signal fade over several dial clicks
  CAPTURE_DB: 6,                     // FM capture margin (stronger-by-this wins cleanly)
  CLEAR_DB: 20,                      // SNR (dB) for full clarity
  SQUELCH_DB: 9,                     // default squelch threshold (player-adjustable)
  NOISE_FLOOR_DBM: -110,
  POWER_W: 1,                        // R-105D TX power
  PATHLOSS_N: 3, PATHLOSS_L0: 32, PATHLOSS_D0: 1,
};

export function clampFreq(mhz) { return Math.min(RADIO.BAND_MAX, Math.max(RADIO.BAND_MIN, mhz)); }
export function snapReadout(mhz) { const s = RADIO.READOUT_STEP; return Math.round(mhz / s) * s; }
export function fmtFreq(mhz) { return clampFreq(mhz).toFixed(3); }   // "40.150"

// dBm radiated by an emitter; battery scales effective power (=1 before the battery phase).
export function txDbm(powerW, battery) {
  const p = Math.max((powerW == null ? RADIO.POWER_W : powerW) * (battery == null ? 1 : battery), 1e-6);
  return 30 + 10 * Math.log10(p);
}
// free-space-ish path loss (dB) — negligible at map scale for the radio; enclosure/obstruction dominates (§7).
export function pathLoss(dist) {
  const d = Math.max(dist || 0, RADIO.PATHLOSS_D0);
  return RADIO.PATHLOSS_L0 + 10 * RADIO.PATHLOSS_N * Math.log10(d / RADIO.PATHLOSS_D0);
}
// detune penalty in dB for a |Δf| in Hz; +Infinity beyond the passband edge (→ rejected → silence).
export function detunePenalty(dfHz) {
  const df = Math.abs(dfHz || 0);
  if (df <= RADIO.TOL) return 0;
  if (df >= RADIO.PASSBAND_EDGE) return Infinity;
  return RADIO.DETUNE_K * (df - RADIO.TOL) / (RADIO.PASSBAND_EDGE - RADIO.TOL);
}
// composed same-channel SNR (dB): full-clarity ceiling − detune penalty (|Δf| given in MHz) − receiver
// enclosure penalty. The single shared formula for the carried-radio, loudspeaker, and preset-station
// paths in voice.js, so their audibility can't drift out of sync.
export function channelSnr(dfMHz, enclosureDb = 0) {
  return RADIO.CLEAR_DB - detunePenalty(Math.abs(dfMHz || 0) * 1e6) - (enclosureDb || 0);
}
// effective SNR (dB) of emitter A as heard by listener B.
export function effectiveSnr({ powerW, battery, dist, obstructDb, dfHz } = {}) {
  const rx = txDbm(powerW, battery) - pathLoss(dist) - (obstructDb || 0);
  return (rx - RADIO.NOISE_FLOOR_DBM) - detunePenalty(dfHz);
}
// clarity 0..1 / crackle 0..1 from an effective SNR against the listener's squelch threshold.
export function quality(snr, squelchDb) {
  const sq = (squelchDb == null) ? RADIO.SQUELCH_DB : squelchDb;
  if (!isFinite(snr) || snr < sq) return { clarity: 0, crackle: 0, open: false };  // squelch closed → silence
  const clarity = Math.min(1, Math.max(0, (snr - sq) / (RADIO.CLEAR_DB - sq)));
  return { clarity, crackle: 1 - clarity, open: true };
}
// do two tuned frequencies (MHz) fall inside each other's audible passband?
export function withinPassband(freqA, freqB) { return Math.abs((freqA - freqB) * 1e6) < RADIO.PASSBAND_EDGE; }

// Resolve N simultaneous same-channel candidates into what the listener hears (Rule A gate already
// applied to build `candidates` = [{ id, snr }]). FM capture vs doubling/garble; deterministic
// tie-break by (snr desc, then id) so every client agrees. Returns:
//   { mode:'silence' } | { mode:'clear', id, snr, captured? } | { mode:'garble', intensity, top, second }
export function resolveReception(candidates, squelchDb) {
  const sq = (squelchDb == null) ? RADIO.SQUELCH_DB : squelchDb;
  const live = (candidates || []).filter(c => isFinite(c.snr) && c.snr >= sq)
    .sort((a, b) => (b.snr - a.snr) || String(a.id).localeCompare(String(b.id)));
  if (live.length === 0) return { mode: 'silence' };
  if (live.length === 1) return { mode: 'clear', id: live[0].id, snr: live[0].snr };
  const top = live[0], second = live[1];
  if (top.snr - second.snr >= RADIO.CAPTURE_DB) return { mode: 'clear', id: top.id, snr: top.snr, captured: true };
  return { mode: 'garble', intensity: 1 - (top.snr - second.snr) / RADIO.CAPTURE_DB, top: top.id, second: second.id };
}
