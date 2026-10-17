// Anarchivo — la entrada (buscador de inicio) como ventanita flotante: se arrastra por la barra
// y se pliega a solo la barra. Posición y plegado se recuerdan en este navegador (localStorage).
// En el teléfono no flota: queda fija arriba, solo se pliega.
// El buscador compacto (ax-top, con un foco o una búsqueda abiertos) se pliega igual: queda la lupa.
import { $, clamp, isMobile, vp } from './util.js';

const KEY = 'ax-entrada-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin almacenamiento: no pasa nada */ } };

export function initEntrada() {
  const el = $('ax-entrada'), bar = el.querySelector('.ax-entrada-bar'), fold = $('ax-fold');
  const st = load(); // { x, y, folded, top }
  const place = () => {
    if (isMobile() || st.x == null) { el.style.left = el.style.top = ''; return; }
    el.style.left = clamp(st.x, 0, vp.W - 120) + 'px';
    el.style.top = clamp(st.y, 0, vp.H - 48) + 'px';
  };
  const setFolded = (f) => { st.folded = f; el.classList.toggle('folded', f); fold.textContent = f ? '+' : '–'; fold.setAttribute('aria-expanded', String(!f)); save(st); };

  fold.onclick = () => setFolded(!st.folded);
  bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) setFolded(!st.folded); });
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || isMobile()) return;
    const r = el.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const move = (m) => {
      st.x = clamp(r.left + m.clientX - sx, 0, vp.W - 120);
      st.y = clamp(r.top + m.clientY - sy, 0, vp.H - 48);
      place();
    };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); save(st); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  });
  addEventListener('resize', place);
  place();
  setFolded(!!st.folded);

  const top = document.querySelector('.ax-top'), foldTop = $('ax-fold-top'), q = $('ax-q');
  const setTop = (f) => { st.top = f; top.classList.toggle('folded', f); foldTop.textContent = f ? '+' : '–'; foldTop.setAttribute('aria-expanded', String(!f)); foldTop.setAttribute('aria-label', f ? 'Abrir el buscador' : 'Plegar el buscador'); save(st); };
  // plegado, todo el óvalo es el botón de abrir; abierto, solo el «–» pliega
  top.querySelector('.ax-search--top').addEventListener('click', (e) => {
    if (!e.target.closest('#ax-fold-top') && !st.top) return;
    e.preventDefault();
    setTop(!st.top);
    if (!st.top) q.focus();
  });
  setTop(!!st.top);
  return { unfold: () => setFolded(false), unfoldTop: () => setTop(false) };
}
