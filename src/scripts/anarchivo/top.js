// Anarchivo — la fila de arriba: ruta (migas), filtros por tipo, y en la Mesa las capas o el chip de foco.
// `initTop(ctx)` devuelve `renderTop(L)`, que la página llama en cada render y cuando cambia la mesa.
import { $, esc } from './util.js';
import { KIND } from './data.js';
import { mx, ms } from './mesa/state.js';
import { fitView } from './mesa/layout.js';

// ctx: datos (nodes, byId, neighbours), state, las llamadas hacia arriba (go, pop, reset, render, mesaResumen, setModo)
// y `capas` (lo que hay sobre la mesa: sus chips, el foco y las acciones de cada chip); `constel` dice si la capa
// de una constelación cambió sobre la mesa, y la guarda
export function initTop({ nodes, byId, neighbours, state, go, pop, reset, render, mesaResumen, setModo, capas, constel }) {
  const { mods } = ms;

  // capas de la Mesa: encuadrar · ocultar (queda guardada) · solo esta · quitar
  function capasHtml() {
    return mx.capas.map((c) => `<span class="mx-chip${c.hidden ? ' off' : ''}${mx.solo === c.id ? ' solo' : ''}">
      <button type="button" data-cfit="${esc(c.id)}" title="Encuadrar esta capa">${esc(c.label)} · ${c.total > c.ids.length ? `${c.ids.length} de ${c.total}` : c.ids.length}</button>
      <button type="button" data-ceye="${esc(c.id)}" title="${c.hidden ? 'Mostrar' : 'Ocultar (queda guardada)'}">${c.hidden ? '○' : '◉'}</button>
      ${constel.cambiada(c) ? `<button type="button" data-cguardar="${esc(c.id)}" title="La capa ya no coincide con la constelación guardada: escribir el cambio en su archivo">guardar ↥</button>` : ''}
      <button type="button" data-csolo="${esc(c.id)}" title="Ver solo esta capa">solo</button>
      <button type="button" data-cx="${esc(c.id)}" title="Quitar esta capa de la mesa">×</button></span>`).join('');
  }
  function renderTop(L) {
    const ruta = $('ax-ruta');
    const mesa = state.view === 'mesa';
    const behind = L ? nodes.length - L.size : 0;
    let html = mesa ? (mx.foco ? capas.focoHtml() : capasHtml()) : '';
    // salida siempre a mano: con un nodo enfocado o una búsqueda, un toque vuelve al grafo completo con todas las áreas
    if (state.path.length || state.q) html = `<button type="button" class="ax-pill sm" data-reset title="Volver al grafo completo (Esc)">◂ Todo</button>` + html;
    if (state.path.length) {
      html += state.path.map((id, i) => {
        const n = byId.get(id);
        return `${i ? '<span class="ax-sep">›</span>' : ''}<button type="button" class="ax-pill ${i === 0 ? 'accent' : 'ink'}" data-pop="${i}">${esc(n.short)}&nbsp;&nbsp;×</button>`;
      }).join('');
      const f = state.path.at(-1);
      if (byId.get(f).kind !== 'concepto' || state.path.length > 1) html += `<span class="ax-muted">${neighbours(f).length} conexiones${mesa ? '' : ` · ${behind} quedan detrás`}</span>`;
    }
    // en la Mesa los filtros por tipo no dicen nada (todo es imagen): lo que hay sobre ella y cómo sumar más
    if (mesa && !state.path.length) {
      if (state.q && L) {
        const n = capas.imgsFromSet(L, Infinity).total;
        html += n ? `<button type="button" class="ax-pill accent" data-poner>+ Poner ${n > capas.MAXCAPA ? `${capas.MAXCAPA} de ${n}` : n} en la mesa ↵</button>` : `<span class="ax-muted">ninguna imagen resuena con «${esc(state.q)}»</span>`;
      } else if (ms.msg) html += `<span class="ax-muted">${esc(ms.msg)}</span>`;
      html += `<span class="ax-muted">${mesaResumen()}</span><button type="button" class="ax-pill sm" data-todo title="${mx.modo === 'galeria' ? 'Todas las imágenes del archivo, en filas' : `Pone sobre la mesa una muestra de todo el archivo (hasta ${capas.MAXCAPA}, repartidas entre los proyectos). Entero solo cabe en Alineado.`}">Ver todo el archivo</button>`;
    } else if (!mesa && (!state.path.length || (state.path.length === 1 && byId.get(state.path[0]).kind === 'concepto'))) {
      html += ['activo', 'publicado', 'artefacto', 'laboratorio', 'ensayo', 'bitacora', 'constelacion'].map((k) =>
        `<button type="button" class="ax-pill ${state.types.has(k) ? 'ink' : ''}" data-type="${k}">${state.types.has(k) ? KIND[k] + '&nbsp;&nbsp;×' : '+ ' + KIND[k]}</button>`).join('');
      if (L) html += `<span class="ax-muted">${behind} quedan detrás</span>`;
    }
    ruta.innerHTML = html;
    ruta.querySelectorAll('[data-reset]').forEach((b) => b.onclick = () => reset());
    ruta.querySelectorAll('[data-pop]').forEach((b) => b.onclick = () => pop(+b.dataset.pop));
    ruta.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => {
      const k = b.dataset.type; state.types.has(k) ? state.types.delete(k) : state.types.add(k); render(150);
    });
    ruta.querySelectorAll('[data-cfoco-fit]').forEach((b) => b.onclick = () => fitView([mx.foco.id, ...capas.imgNb(mx.foco.id)].filter((i) => mods.has(i)), 1.8));
    ruta.querySelectorAll('[data-cficha]').forEach((b) => b.onclick = () => go(mx.foco.id));
    ruta.querySelectorAll('[data-cfoco-x]').forEach((b) => b.onclick = () => capas.salirFoco());
    ruta.querySelectorAll('[data-cfit]').forEach((b) => b.onclick = () => capas.fitCapa(b.dataset.cfit));
    ruta.querySelectorAll('[data-ceye]').forEach((b) => b.onclick = () => capas.toggleCapa(b.dataset.ceye));
    ruta.querySelectorAll('[data-cguardar]').forEach((b) => b.onclick = () => constel.guardarCapa(b.dataset.cguardar, b));
    ruta.querySelectorAll('[data-csolo]').forEach((b) => b.onclick = () => capas.soloCapa(b.dataset.csolo));
    ruta.querySelectorAll('[data-cx]').forEach((b) => b.onclick = () => capas.removeCapa(b.dataset.cx));
    ruta.querySelectorAll('[data-poner]').forEach((b) => b.onclick = () => capas.mesaAddQuery(state.q));
    ruta.querySelectorAll('[data-todo]').forEach((b) => b.onclick = () => (mx.modo === 'galeria' ? setModo('galeria') : capas.todoElArchivo()));
  }

  return { renderTop };
}
