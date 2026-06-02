// radio.js — station list + audio helpers for the diegetic field-radio prop.
// Streams play through a plain HTMLAudioElement (NOT Web Audio): cross-origin
// streams need no CORS that way. Distance volume is applied per-frame by BuildManager.
// URLs are data — swap freely. VERIFY each plays before relying on it (streams rot).
export const RADIO_STATIONS = [
  { name: 'Evropa 2',      genre: 'CZ pop',     url: 'https://ice.actve.net/fm-evropa2-128' },
  { name: 'Power 181',     genre: 'US Top 40',  url: 'https://listen.181fm.com/181-power_128k.mp3' },
  { name: 'Highway 181',   genre: 'US country', url: 'https://listen.181fm.com/181-highway_128k.mp3' },
  { name: 'Energy 98',     genre: 'US dance',   url: 'https://listen.181fm.com/181-energy98_128k.mp3' },
];

export const RADIO_INNER = 3.5;   // full volume within this radius (m)
export const RADIO_OUTER = 22;    // silent beyond this radius (m)

export function radioAttenuation(dist) {
  if (dist <= RADIO_INNER) return 1;
  if (dist >= RADIO_OUTER) return 0;
  const f = 1 - (dist - RADIO_INNER) / (RADIO_OUTER - RADIO_INNER);
  return f * f; // ease-out falloff
}

export function stationLabel(i) {
  const n = RADIO_STATIONS.length;
  const s = RADIO_STATIONS[((i % n) + n) % n];
  return s ? `${s.name} · ${s.genre}` : '—';
}
