// icons.js — crisp blocky-stencil SVG icon set that replaces every emoji in the UI.
// Pure leaf module (zero deps). `icon(name)` returns an inline <svg> string that
// inherits color via `currentColor` and sizes to 1em (so font-size controls it).
// Kind→name mapping stays in ui.js / inventory.js where WEAPONS/ITEM_DEFS live.

const OPEN = '<svg class="ic" viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" '
  + 'xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">';

// Blocky silhouettes (fill); a few use fill-rule="evenodd" for negative-space detail,
// and line details (wire barbs, gear, antenna waves, sun rays) set stroke per-element.
const ICONS = {
  // ---- weapons (melee variants by key) ----
  knife:    '<path d="M2 10h6v4H2z"/><path d="M8 9h2v6H8z"/><path d="M10 10l12-1-12 5z"/>',
  machete:  '<path d="M2 13h6v3H2z"/><path d="M8 12h2v5H8z"/><path d="M10 12l12-2c.3 4-3 7.4-12 8z"/>',
  cleaver:  '<path fill-rule="evenodd" d="M3 5h14v9H3zM6 7.4a1.3 1.3 0 100 2.6 1.3 1.3 0 100-2.6z"/><path d="M17 8.4h5v2.6h-5z"/>',
  shovel:   '<path d="M11 5h2v9h-2z"/><path fill-rule="evenodd" d="M9 2h6v4h-2V4h-2v2H9z"/><path d="M8 13h8v3l-4 4.5-4-4.5z"/>',
  axe:      '<path d="M11 3h2v18h-2z"/><path d="M13 3c4.4 0 7.5 2.2 7.5 5s-3.1 5-7.5 5z"/>',
  pistol:   '<path d="M3 7h16v4h-5l-1 2h-2v-2H3z"/><path d="M5 13h4l-1 4H6z"/>',
  rifle:    '<path d="M2 9h20v3h-3v2h-2v-2h-3l-1 2h-2v-2H2z"/><path d="M9 14h3v4l-3-1z"/>',
  smg:      '<path d="M4 8h13v3h-2v2h-2v-2H4z"/><path d="M7 13h3v6H7z"/>',
  shotgun:  '<path d="M4 9h18v3H4z"/><path d="M2 8h3v6H2z"/><path d="M9 12h5v2H9z"/>',
  sniper:   '<path d="M2 11h20v2H2z"/><path d="M8 6h7v3H8z"/><path d="M5 13h2v4H5z"/><path d="M16 13h2v3h-2z"/>',
  launcher: '<path d="M3 9h14v5H3z"/><path d="M17 8l5 3.5-5 3.5z"/><path d="M7 14h3v4H7z"/>',
  // ---- tools ----
  flashlight: '<path d="M3 9h9v6H3z"/><path d="M12 10l3-1v8l-3-1z"/><path d="M16 8l5-2v12l-5-2z" opacity=".45"/>',
  binoculars: '<path fill-rule="evenodd" d="M4 5h6v4H4zM14 5h6v4h-6z"/>'
    + '<path fill-rule="evenodd" d="M7 8a5 5 0 100 10A5 5 0 007 8zm0 3a2 2 0 100 4 2 2 0 100-4z"/>'
    + '<path fill-rule="evenodd" d="M17 8a5 5 0 100 10 5 5 0 100-10zm0 3a2 2 0 100 4 2 2 0 100-4z"/>'
    + '<path d="M10 11h4v3h-4z"/>',
  compass: '<path fill-rule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16z"/>'
    + '<path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z"/><circle cx="12" cy="12" r="1.1"/>',
  // ---- throwables / gadgets ----
  grenade:  '<path d="M8 6h6v3H8z"/><path d="M14 6h4v2h-2l-2 2z"/><circle cx="11" cy="15" r="6"/>',
  molotov:  '<path d="M9 8h6v3l2 4v6H7v-6l2-4z"/><path d="M11 2l2 5h-4z"/>',
  flare:    '<path d="M11 10h2v11h-2z"/><circle cx="12" cy="7" r="3"/>'
    + '<g stroke="currentColor" stroke-width="2" fill="none"><path d="M12 1v2M6 4l1.6 1.6M18 4l-1.6 1.6"/></g>',
  beacon:   '<path d="M11 9h2v11h-2z"/><path d="M6 20h12v2H6z"/><circle cx="12" cy="6" r="3"/>'
    + '<g stroke="currentColor" stroke-width="1.6" fill="none"><path d="M16.5 3a6 6 0 010 8M7.5 3a6 6 0 000 8"/></g>',
  // ---- consumables / materials ----
  medkit:   '<path fill-rule="evenodd" d="M3 7h18v13H3zM10.8 9.5h2.4v2.5h2.4v2.4h-2.4v2.6h-2.4v-2.6H8.4v-2.4h2.4z"/>',
  ration:   '<path fill-rule="evenodd" d="M6 6h12v14H6zM6 11h12v3H6z"/>',
  armor:    '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  ammo:     '<path d="M3 11h18v9H3z"/><path d="M5 5h3v6H5zM10 5h3v6h-3zM15 5h3v6h-3z"/>',
  splint:   '<path fill-rule="evenodd" d="M3 9h18v6H3zM9 10.5h6v3H9z"/>',
  sandbag:  '<rect x="7" y="6" width="10" height="6" rx="2"/><rect x="3" y="13" width="8" height="6" rx="2"/><rect x="13" y="13" width="8" height="6" rx="2"/>',
  wire:     '<g stroke="currentColor" stroke-width="2" fill="none"><path d="M2 12h20"/>'
    + '<path d="M6 9v6M4 10l4 4M8 10l-4 4"/><path d="M12 9v6M10 10l4 4M14 10l-4 4"/><path d="M18 9v6M16 10l4 4M20 10l-4 4"/></g>',
  barricade:'<path d="M3 7h18v4H3zM3 13h18v4H3z"/><path d="M5 5h3l12 14h-3z"/>',
  radio:    '<path fill-rule="evenodd" d="M3 9h16v11H3zM5 11v5h6v-5z"/><path d="M14 9l3-6 1.6.8-2.4 5.2z"/><circle cx="15" cy="13" r="1.6"/><circle cx="15" cy="17.2" r="1.4"/>',
  // ---- survival / state ----
  skull:    '<path fill-rule="evenodd" d="M12 3c4.5 0 7.5 3 7.5 7.5 0 2.4-1.2 4-2 4.8V18h-1.8v-1.8h-1.4V18h-4.6v-1.8H8.3V18H6.5v-2.7c-.8-.8-2-2.4-2-4.8C4.5 6 7.5 3 12 3zM9 9.5a1.7 1.7 0 100 3.4 1.7 1.7 0 100-3.4zm6 0a1.7 1.7 0 100 3.4 1.7 1.7 0 100-3.4z"/>',
  leg:      '<path d="M9 3h4v7l2 6-4 1-3-7z"/><path d="M7 17h7v3H5l1-2z"/>',
  fire:     '<path d="M13 2c.5 4-3 5-3 8 0 1.5 1 2.5 2 2.5 1.5 0 2-1.5 1.5-3 2 1 3 3 3 5a6.5 6.5 0 1 1-13 0c0-4 4-6 6-9 .8-1.2 1-2.5.5-3.5z"/>',
  sun:      '<circle cx="12" cy="12" r="4.5"/><g stroke="currentColor" stroke-width="2" fill="none"><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></g>',
  moon:     '<path d="M15 3a9 9 0 1 0 6 15A7 7 0 0 1 15 3z"/>',
  blood:    '<circle cx="12" cy="12" r="6"/>',
  // ---- nav / meta ----
  play:     '<path d="M6 4l14 8-14 8z"/>',
  crate:    '<path fill-rule="evenodd" d="M3 6h18v14H3V6zm2 2v10h14V8H5z"/><path d="M3 11h18v2H3z"/><path d="M9 8h2v10H9z"/><path d="M13 8h2v10h-2z"/>',
  users:    '<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6z"/><circle cx="17" cy="9" r="2.8"/><path d="M14.6 14.2c3 .2 5.4 2.6 5.4 5.8h-4"/>',
  gear:     '<path fill-rule="evenodd" d="M13.4 2l.5 2.4 2.2.9 2-1.4 1.5 1.5-1.4 2 .9 2.2 2.4.5v2.2l-2.4.5-.9 2.2 1.4 2-1.5 1.5-2-1.4-2.2.9-.5 2.4h-2.2l-.5-2.4-2.2-.9-2 1.4-1.5-1.5 1.4-2-.9-2.2L2 13.4v-2.2l2.4-.5.9-2.2-1.4-2 1.5-1.5 2 1.4 2.2-.9L10.6 2zM12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"/>',
  wrench:   '<path d="M20.4 5.4a4.6 4.6 0 0 1-6 5.5L6 19.3l-2.8-2.8 8.4-8.4a4.6 4.6 0 0 1 5.5-6L14.5 4.6l1.6 1.6 2.7-2.7z"/>',
  cash:     '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>'
    + '<text x="12" y="16.5" text-anchor="middle" font-size="12.5" font-weight="700" font-family="Oswald,sans-serif" fill="currentColor">₽</text>',
  key:      '<path fill-rule="evenodd" d="M9 7a4 4 0 1 1 .9 5.5L6 16.4l1.4 1.4-1.4 1.4-1.4-1.4-1.5 1.5L1.7 18l5.4-5.4A4 4 0 0 1 9 7zm0 1.6a1.6 1.6 0 100 3.2A1.6 1.6 0 009 8.6z"/>',
  back:     '<path d="M11 5l-7 7 7 7v-4h9v-6h-9z"/>',
  supply:   '<path d="M3 9a9 5 0 0 1 18 0z"/><rect x="8" y="14" width="8" height="6"/>'
    + '<g stroke="currentColor" stroke-width="1.4" fill="none"><path d="M4 9l4 5M20 9l-4 5M12 9v5"/></g>',
  star:     '<path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.6 5 20.4l1.4-6.8L1.3 9l6.9-.7z"/>',
  // ---- ФОНОТЕКА transport ----
  pause:    '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
  skipback: '<path d="M7 5h2.4v14H7z"/><path d="M21 5v14l-11-7z"/>',
  skipfwd:  '<path d="M14.6 5H17v14h-2.4z"/><path d="M3 5l11 7-11 7z"/>',
  shuffle:  '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h3.5l9 10H19"/><path d="M3 17h3.5l3-3.3"/><path d="M12.5 9.3L15.5 7H19"/></g><path d="M17.5 4.5L22 7l-4.5 2.5z"/><path d="M17.5 14.5L22 17l-4.5 2.5z"/>',
  repeat:   '<g fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h11v4"/><path d="M17 17H6v-4"/></g><path d="M16 3.5L20.5 7 16 10.5z"/><path d="M8 20.5L3.5 17 8 13.5z"/>',
  search:   '<circle cx="10.5" cy="10.5" r="6.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.2 15.2l6 6" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  // ---- genre glyphs (mono, for the filter bar) ----
  sickle:   '<path d="M4 3l2-1 6 10.5-2 1z"/><path d="M11 11c5 1 8-1 9-5 1 4-1 9-7 9-3 0-5-1.5-5-3 0-.7.4-1.2 1.5-1.2 1.4 0 1.6 1 3 1 1 0 1.6-.5 1.6-1.2 0-.8-1.3-1.2-3.6-1.6z"/>',
  wheat:    '<g fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 21V8"/><path d="M12 8c0-2-1.4-3.4-3-4 0 2 1.2 3.4 3 4zM12 8c0-2 1.4-3.4 3-4 0 2-1.2 3.4-3 4z"/><path d="M12 13c0-2-1.4-3.4-3-4 0 2 1.2 3.4 3 4zM12 13c0-2 1.4-3.4 3-4 0 2-1.2 3.4-3 4z"/><path d="M12 18c0-2-1.4-3.4-3-4 0 2 1.2 3.4 3 4zM12 18c0-2 1.4-3.4 3-4 0 2-1.2 3.4-3 4z"/></g>',
  crane:    '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 13c3.2 0 4.2-3.2 6-3.2s2.4 2.2 4 2.2 2.2-2.2 4-2.2 2.8 3.2 6 3.2"/></g>',
  mic:      '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0012 0" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 17.5v3.5M8.5 21h7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
  disc:     '<path fill-rule="evenodd" d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 7a2 2 0 100 4 2 2 0 000-4z"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="currentColor" stroke-width="1" opacity=".5"/>',
  guitar:   '<path d="M18.5 2.5l3 3-2.2 1.7.9.9-1.8 1.8-1-1-3.6 3.6a4.2 4.2 0 11-2.1-2.1l3.6-3.6-1-1 1.8-1.8.9.9z"/><circle cx="9.5" cy="14.5" r="1.5" fill="#1a120a"/>',
  bolt:     '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  volume:   '<path d="M4 9h3l4-3.5v13L7 15H4z"/><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 9.2a4 4 0 010 5.6"/><path d="M17.5 6.8a7.5 7.5 0 010 10.4"/></g>',
};

export function icon(name) { return OPEN + (ICONS[name] || ICONS.crate) + '</svg>'; }
export const hasIcon = (n) => Object.prototype.hasOwnProperty.call(ICONS, n);

// Kind -> icon-name maps (kept here so ui.js & inventory.js share one source of truth).
// WEAPON_ICON is keyed by a weapon's `.class`; ITEM_ICON by an ITEM_DEFS kind.
export const WEAPON_ICON = { pistol: 'pistol', smg: 'smg', shotgun: 'shotgun', sniper: 'sniper', rifle: 'rifle', launcher: 'launcher' };
// Per-weapon-key overrides (distinct melee silhouettes); falls back to class/knife.
export const KEY_ICON = { machete: 'machete', cleaver: 'cleaver', shovel: 'shovel', axe: 'axe' };
export const ITEM_ICON = {
  medkit: 'medkit', food: 'ration', armor: 'armor', ammo: 'ammo', splint: 'splint',
  airbeacon: 'beacon', flare: 'flare', grenade: 'grenade', molotov: 'molotov',
  sandbag: 'sandbag', wire: 'wire', wood: 'barricade', radio: 'radio',
  flashlight: 'flashlight', binoculars: 'binoculars',
};
