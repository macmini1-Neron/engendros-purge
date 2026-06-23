// Shared lobby cosmetic pickers — a row of canvas swatches drawn via the pure painters. Extracted from
// PokerDomRenderer so BOTH the poker den lobby (poker-ui.js) and the co-op ROOM lobby (mp.js) build
// identical pickers without duplicating the locked/hint/selection logic. Pure DOM + pure painters;
// `document` is only touched at call time, so importing this module is node-safe (no THREE, no DOM at import).
import { CHIP_SKIN_LIST, CHIP_SKINS, drawChip } from './chipskins.js';
import { CARD_BACK_LIST, CARD_BACKS, drawCardBack } from './cardbacks.js';

// One picker engine for both cosmetics. `available` = ids the player owns (free + crate-unlocked); the
// rest render locked (🔒, not selectable, click → hint). On a real pick it highlights + fires onPick(id)
// — the caller persists/applies. `cfg` carries the only per-cosmetic differences (list/defs/painter/dims/
// default/extra class). draw() clears `hintEl` up front so a stale locked-hint never survives a re-mount.
function mountPicker(container, { current, available, hintEl, onPick } = {}, cfg) {
  if (!container) return;
  const { list, defs, defaultId, extraClass, cw, ch, paint } = cfg;
  const avail = Array.isArray(available) ? available : list;            // back-compat: all available
  let sel = (defs[current] && avail.includes(current)) ? current : defaultId;
  const draw = () => {
    container.innerHTML = '';
    if (hintEl) hintEl.textContent = '';                               // fresh mount/redraw → no stale (locked) hint
    for (const id of list) {
      const locked = !avail.includes(id);
      const btn = document.createElement('button');
      btn.className = 'pk-skinbtn' + extraClass + (id === sel ? ' sel' : '') + (locked ? ' locked' : '');
      btn.title = locked ? 'Locked — unlock from the Supply Crate' : defs[id].label;
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      paint(cv.getContext('2d'), id);
      const lab = document.createElement('span'); lab.textContent = (locked ? '🔒 ' : '') + defs[id].label;
      btn.appendChild(cv); btn.appendChild(lab);
      if (locked) {
        btn.addEventListener('click', () => { if (hintEl) hintEl.textContent = `“${defs[id].label}” is locked — unlock it from the Supply Crate.`; });
      } else {
        btn.addEventListener('click', () => { sel = id; draw(); onPick && onPick(id); });
      }
      container.appendChild(btn);
    }
  };
  draw();
}

// Chip-skin picker — square swatches painted as the representative $20 (red) chip.
export function mountChipSkinPicker(container, opts = {}) {
  mountPicker(container, opts, {
    list: CHIP_SKIN_LIST, defs: CHIP_SKINS, defaultId: 'dice', extraClass: '',
    cw: 44, ch: 44, paint: (ctx, id) => drawChip(ctx, 44, 20, id),
  });
}

// Card-back picker — same engine, drawn at 2× card aspect (CSS-scaled) via drawCardBack.
export function mountCardBackPicker(container, opts = {}) {
  mountPicker(container, opts, {
    list: CARD_BACK_LIST, defs: CARD_BACKS, defaultId: 'default', extraClass: ' back',
    cw: 76, ch: 106, paint: (ctx, id) => drawCardBack(ctx, 76, 106, id),
  });
}
