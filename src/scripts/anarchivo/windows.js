// Anarchivo — tarjetas flotantes: cada una es una ventana independiente que se arrastra por la barra,
// se cierra con × y se pliega a una ficha en el dock; abrir otra no cierra las que ya estaban.
// `initWindows(ctx)` devuelve `openWindow` (lo usa go) y `syncWindows` (lo llama cada render).
import { $, clamp, isMobile, vp } from './util.js';
import { wireMedios } from './medios.js';

// ctx: byId, state, `lit`, y las llamadas hacia arriba (go, setView, mxFocus, mesaProyecto); `cards` da el contenido de cada tarjeta
export function initWindows({ byId, state, lit, go, setView, mxFocus, mesaProyecto, cards }) {
  // Cada una es una ventana independiente: se arrastra por la barra
  // superior, se cierra con ×, y abrir otra no cierra las que ya estaban —
  // quedan una al lado de la otra, donde el usuario las deje.
  const winBox = $('ax-windows');
  const dockBox = $('ax-dock');
  const windows = new Map(); // id -> { el, x, y, tab }
  let zTop = 10;
  // como mucho 2 tarjetas grandes a la vez en escritorio (para comparar
  // un concepto con un proyecto, por ejemplo), 1 en el teléfono. Abrir una
  // de más no cierra la vieja — la pliega a una ficha en el dock.
  const CAP = () => (isMobile() ? 1 : 2);
  let expandedOrder = []; // ids abiertos como tarjeta grande, más reciente al final

  function defaultSpot() {
    const n = expandedOrder.length; // cuántas tarjetas GRANDES hay ya, no cuántas ventanas en total
    const w = Math.min(420, vp.W - 40);
    let x = clamp(vp.W - 40 - w - n * 34, 16, vp.W - w - 16);
    const y = clamp(92 + n * 34, 60, vp.H - 200);
    // con «Conversar» abierto, la tarjeta busca sitio a su izquierda (si no, una tarjeta abierta desde un
    // enlace del chat quedaba justo detrás de él); si no cabe, va encima igual
    const chat = document.getElementById('ax-chat');
    if (chat && !chat.hidden && !chat.classList.contains('grande')) {
      const c = chat.getBoundingClientRect();
      if (x < c.right && x + w > c.left && c.left - w - 16 - n * 34 >= 16) x = c.left - w - 16 - n * 34;
    }
    return { x, y, w };
  }
  // despliega una ficha del dock a tarjeta grande y flotante; si ya hay
  // CAP() desplegadas, pliega la más antigua para dejarle sitio.
  function expand(id) {
    const w = windows.get(id);
    if (!w) return;
    w.el.classList.remove('collapsed');
    if (!isMobile()) {
      const spot = defaultSpot();
      w.x = spot.x; w.y = spot.y;
      w.el.style.left = w.x + 'px'; w.el.style.top = w.y + 'px'; w.el.style.width = spot.w + 'px';
      winBox.appendChild(w.el);
    }
    bringToFront(id);
    expandedOrder = expandedOrder.filter((x) => x !== id);
    expandedOrder.push(id);
    while (expandedOrder.length > CAP()) collapseWindow(expandedOrder.shift());
  }
  // pliega una tarjeta grande a ficha compacta en el dock — sigue abierta,
  // solo que ocupa una línea y no una ventana.
  function collapseWindow(id) {
    const w = windows.get(id);
    if (!w) return;
    w.el.classList.add('collapsed');
    if (!isMobile()) dockBox.appendChild(w.el);
    expandedOrder = expandedOrder.filter((x) => x !== id);
  }
  function makeDraggable(el, id) {
    const bar = el.querySelector('.ax-float-bar');
    let sx, sy, ox, oy, on = false, moved = false;
    const move = (e) => {
      if (!on) return;
      const p = e.touches ? e.touches[0] : e;
      if (Math.abs(p.clientX - sx) + Math.abs(p.clientY - sy) > 5) moved = true;
      const w = windows.get(id);
      w.x = clamp(ox + (p.clientX - sx), -200, vp.W - 60);
      w.y = clamp(oy + (p.clientY - sy), 0, vp.H - 40);
      el.style.left = w.x + 'px'; el.style.top = w.y + 'px';
    };
    const up = () => {
      on = false;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      // un toque sin arrastrar (o cualquier toque en móvil, donde la
      // posición queda fija por CSS) pliega o despliega la tarjeta
      if (!moved) { el.classList.contains('collapsed') ? expand(id) : collapseWindow(id); }
    };
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('[data-close]')) return;
      on = true; moved = false; const w = windows.get(id);
      sx = e.clientX; sy = e.clientY; ox = w.x; oy = w.y;
      bringToFront(id);
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    el.addEventListener('pointerdown', () => bringToFront(id));
  }
  function bringToFront(id) { const w = windows.get(id); if (w) w.el.style.zIndex = ++zTop; }
  function closeWindow(id) {
    const w = windows.get(id);
    if (w) { w.el.remove(); windows.delete(id); expandedOrder = expandedOrder.filter((x) => x !== id); }
  }
  function openWindow(id) {
    if (windows.get(id)) { expand(id); updateWindow(id); return; }
    const el = document.createElement('div');
    el.className = 'ax-float collapsed';
    el.innerHTML = '<span class="ax-handle" aria-hidden="true"></span><div class="ax-float-bar"><span class="ax-grip">⋮⋮</span><span class="ax-float-title"></span><button type="button" class="ax-close" data-close>×</button></div><div class="ax-float-body"></div>';
    dockBox.appendChild(el);
    windows.set(id, { el, x: 0, y: 0, tab: 'leer' });
    el.querySelector('[data-close]').onclick = () => closeWindow(id);
    makeDraggable(el, id);
    updateWindow(id);
    expand(id); // lo que acabás de abrir es lo que querés ver: entra grande
  }
  function setWindowTab(id, tab) { const w = windows.get(id); if (w) { w.tab = tab; updateWindow(id); } }
  function updateWindow(id) {
    const w = windows.get(id);
    if (!w) return;
    const body = w.el.querySelector('.ax-float-body');
    const L = lit();
    const titleEl = w.el.querySelector('.ax-float-title');
    titleEl.textContent = id === '__search__' ? `«${state.q}»` : (byId.get(id).short || '');
    body.innerHTML = id === '__search__' ? cards.searchBody() : cards.windowBody(byId.get(id), L, w.tab);
    body.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
    body.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => setWindowTab(id, b.dataset.tab));
    body.querySelectorAll('[data-close-self]').forEach((b) => b.onclick = () => closeWindow(id));
    body.querySelectorAll('[data-mesa]').forEach((b) => b.onclick = () => { setView('mesa'); mxFocus(b.dataset.mesa); });
    body.querySelectorAll('[data-mesa-proy]').forEach((b) => b.onclick = () => mesaProyecto(b.dataset.mesaProy));
    wireMedios(body);
  }
  // se llama en cada render(): mantiene el contenido al día (filtros,
  // relaciones) sin tocar la posición de las ventanas ya abiertas.
  function syncWindows(L) {
    if (state.q && !state.path.length && !windows.get('__search__')) openWindow('__search__');
    if ((!state.q || state.path.length) && windows.get('__search__')) closeWindow('__search__');
    for (const id of windows.keys()) updateWindow(id);
  }

  return { openWindow, syncWindows };
}
