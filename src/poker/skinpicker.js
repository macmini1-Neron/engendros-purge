// Shared lobby cosmetic pickers — a row of canvas swatches drawn via the pure painters. Extracted from
// PokerDomRenderer so BOTH the poker den lobby (poker-ui.js) and the co-op ROOM lobby (mp.js) build
// identical pickers without duplicating the locked/hint logic. Pure DOM + pure painters; `document` is
// only touched at call time, so importing this module is node-safe (no THREE, no DOM at import).
import { CHIP_SKIN_LIST, CHIP_SKINS, drawChip } from './chipskins.js';
import { CARD_BACK_LIST, CARD_BACKS, drawCardBack } from './cardbacks.js';

// Chip-skin picker. `available` = ids the player owns (free + crate-unlocked); the rest render locked
// (🔒, not selectable). On a real pick it highlights + fires onPick(id) — the caller persists/applies.
export function mountChipSkinPicker(container, { current, available, hintEl, onPick } = {}) {
  if (!container) return;
  const avail = Array.isArray(available) ? available : CHIP_SKIN_LIST; // back-compat: all available
  let sel = (CHIP_SKINS[current] && avail.includes(current)) ? current : 'dice';
  const draw = () => {
    container.innerHTML = '';
    for (const id of CHIP_SKIN_LIST) {
      const locked = !avail.includes(id);
      const btn = document.createElement('button');
      btn.className = 'pk-skinbtn' + (id === sel ? ' sel' : '') + (locked ? ' locked' : '');
      btn.title = locked ? 'Locked — unlock from the Supply Crate' : CHIP_SKINS[id].label;
      const cv = document.createElement('canvas'); cv.width = cv.height = 44;
      drawChip(cv.getContext('2d'), 44, 20, id);              // representative $20 (red) chip
      const lab = document.createElement('span'); lab.textContent = (locked ? '🔒 ' : '') + CHIP_SKINS[id].label;
      btn.appendChild(cv); btn.appendChild(lab);
      if (locked) {
        btn.addEventListener('click', () => { if (hintEl) hintEl.textContent = `“${CHIP_SKINS[id].label}” is locked — unlock it from the Supply Crate.`; });
      } else {
        btn.addEventListener('click', () => { sel = id; draw(); if (hintEl) hintEl.textContent = ''; onPick && onPick(id); });
      }
      container.appendChild(btn);
    }
  };
  draw();
}

// Card-back picker — same machinery, drawn at card aspect via drawCardBack.
export function mountCardBackPicker(container, { current, available, hintEl, onPick } = {}) {
  if (!container) return;
  const avail = Array.isArray(available) ? available : CARD_BACK_LIST;
  let sel = (CARD_BACKS[current] && avail.includes(current)) ? current : 'default';
  const draw = () => {
    container.innerHTML = '';
    for (const id of CARD_BACK_LIST) {
      const locked = !avail.includes(id);
      const btn = document.createElement('button');
      btn.className = 'pk-skinbtn back' + (id === sel ? ' sel' : '') + (locked ? ' locked' : '');
      btn.title = locked ? 'Locked — unlock from the Supply Crate' : CARD_BACKS[id].label;
      const cv = document.createElement('canvas'); cv.width = 76; cv.height = 106;   // 2× card aspect, CSS-scaled
      drawCardBack(cv.getContext('2d'), 76, 106, id);
      const lab = document.createElement('span'); lab.textContent = (locked ? '🔒 ' : '') + CARD_BACKS[id].label;
      btn.appendChild(cv); btn.appendChild(lab);
      if (locked) {
        btn.addEventListener('click', () => { if (hintEl) hintEl.textContent = `“${CARD_BACKS[id].label}” is locked — unlock it from the Supply Crate.`; });
      } else {
        btn.addEventListener('click', () => { sel = id; draw(); if (hintEl) hintEl.textContent = ''; onPick && onPick(id); });
      }
      container.appendChild(btn);
    }
  };
  draw();
}
