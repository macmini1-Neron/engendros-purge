// gpunotice.js — low-end-GPU helper banner. Shows in the menu/lobby when the browser is rendering
// on a weak (integrated / software / mobile) GPU: the Windows "use your real GPU" instructions plus
// a one-click "performance mode" button. Self-contained DOM + injected CSS. The decision of WHETHER
// a GPU is weak lives in gpucheck.js (pure, node-tested); this file is only the DOM/UX shell.
//
// Built with explicit DOM nodes (no innerHTML): the GPU label is untrusted-ish text from the driver,
// so it always goes in via textContent — never parsed as HTML.

const STYLE_ID = 'gpu-notice-style';

// tiny hyperscript: h('div', {class:'x', title:'y'}, child, 'text', ...) — strings become text nodes.
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const kid of kids) e.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  return e;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
.gpu-notice{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9000;
  max-width:min(700px,93vw);box-sizing:border-box;font-family:"Russo One","Arial Narrow",system-ui,sans-serif;
  background:rgba(20,18,12,.96);border:1px solid #d8a23a;border-left:5px solid #d8a23a;border-radius:6px;
  color:#f3e7cf;padding:11px 13px;box-shadow:0 6px 26px rgba(0,0,0,.55);font-size:13px;line-height:1.45;}
.gpu-notice.hidden{display:none;}
.gpu-notice b{color:#ffcf6b;}
.gpu-notice .gpu-notice-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.gpu-notice .gpu-notice-msg{flex:1;min-width:200px;}
.gpu-notice button{font-family:inherit;cursor:pointer;border-radius:5px;border:1px solid #5a6;
  padding:7px 12px;font-size:12px;white-space:nowrap;}
.gpu-notice .gpu-notice-apply{background:#2f8f6b;color:#fff;border-color:#3fb288;}
.gpu-notice .gpu-notice-apply:hover{background:#39a87e;}
.gpu-notice .gpu-notice-how{background:transparent;color:#cdb98f;border-color:#6a5d3c;}
.gpu-notice .gpu-notice-how:hover{color:#ffcf6b;}
.gpu-notice .gpu-notice-x{background:transparent;border:none;color:#a99;font-size:18px;line-height:1;padding:0 4px;}
.gpu-notice .gpu-notice-x:hover{color:#fff;}
.gpu-notice .gpu-notice-steps{display:none;margin-top:9px;padding-top:9px;border-top:1px solid #4a4330;color:#d8cdb2;}
.gpu-notice .gpu-notice-steps ol{margin:4px 0 0;padding-left:18px;}
.gpu-notice .gpu-notice-done{display:none;align-items:center;gap:10px;color:#9fe6c2;}
`;
  document.head.appendChild(s);
}

/**
 * makeGpuNotice({ info, onApplyPerfMode }) → { syncState(state), destroy() }
 * Returns an inert handle (no DOM) unless info.tier === 'weak', so the caller can wire it
 * unconditionally. `info` comes from gpucheck.classifyRenderer().
 */
export function makeGpuNotice({ info, onApplyPerfMode } = {}) {
  if (!info || info.tier !== 'weak' || typeof document === 'undefined') {
    return { syncState() {}, destroy() {} };
  }
  injectStyle();
  let dismissed = false;
  // Kind-aware headline; the raw label is only clean for integrated/mobile, so software hides it.
  const HEADLINE = { integrated: '⚠ Slabá grafika', mobile: '⚠ Mobilní grafika', software: '⚠ Softwarové vykreslování' };
  const headline = (HEADLINE[info.kind] || '⚠ Slabá grafika') +
    (info.kind !== 'software' && info.label ? ` (${info.label})` : '');

  const applyBtn = h('button', { class: 'gpu-notice-apply', type: 'button' }, 'Zapnout výkonný režim');
  const howBtn = h('button', { class: 'gpu-notice-how', type: 'button' }, 'Jak na plný výkon?');
  const steps = h('div', { class: 'gpu-notice-steps' },
    'Pro ', h('b', null, 'plný výkon'), ' přepni prohlížeč na výkonnou grafiku (jednou, drží to natrvalo):',
    h('ol', null,
      h('li', null, 'Windows: ', h('b', null, 'Nastavení → Systém → Obrazovka → Grafika')),
      h('li', null, 'Přidej svůj prohlížeč → ', h('b', null, 'Možnosti → Vysoký výkon')),
      h('li', null, 'Úplně zavři a znovu otevři prohlížeč')));
  const main = h('div', { class: 'gpu-notice-main' },
    h('div', { class: 'gpu-notice-row' },
      h('div', { class: 'gpu-notice-msg' },
        h('b', null, headline),
        ' — hra může na téhle grafice sekat.'),
      applyBtn, howBtn,
      h('button', { class: 'gpu-notice-x', type: 'button', title: 'Zavřít' }, '×')),
    steps);
  const done = h('div', { class: 'gpu-notice-done' },
    h('span', null, '✓ Výkonný režim zapnut (Low + adaptivní rozlišení). Pro plnou kvalitu přepni GPU ve Windows.'),
    h('button', { class: 'gpu-notice-x', type: 'button', title: 'Zavřít' }, '×'));

  const el = h('div', { class: 'gpu-notice hidden' }, main, done);
  document.body.appendChild(el);

  applyBtn.addEventListener('click', () => {
    try { if (onApplyPerfMode) onApplyPerfMode(); } catch (e) { /* swallow — UX must never throw */ }
    main.style.display = 'none';
    done.style.display = 'flex';
  });
  howBtn.addEventListener('click', () => {
    steps.style.display = steps.style.display === 'block' ? 'none' : 'block';
  });
  for (const x of el.querySelectorAll('.gpu-notice-x')) {
    x.addEventListener('click', () => { dismissed = true; el.classList.add('hidden'); });
  }

  let lastShow = null;
  return {
    // Show only on the menu / lobby screens; stays hidden once dismissed this session.
    // Guarded so calling it every frame only touches the DOM when visibility actually flips.
    syncState(state) {
      const show = !dismissed && (state === 'menu' || state === 'lobby');
      if (show === lastShow) return;
      lastShow = show;
      el.classList.toggle('hidden', !show);
    },
    destroy() { el.remove(); },
  };
}
