// Anarchivo — las vistas Lista y Carpetas (el ciclo de vida: fuente → en curso → publicado → laboratorio).
// `initVistas(ctx)` devuelve sus renders; cada render() de la página las repinta solo si es la vista activa.
import { $, esc, norm } from './util.js';

// ctx: datos (nodes, byId), state, `go` (abrir un nodo) y `cards` (agrupado y vecinos, compartidos con las tarjetas)
export function initVistas({ nodes, byId, state, go, cards }) {
  // ---------- vista Lista ----------
  function renderLista(L) {
    const el = $('ax-lista');
    if (state.view !== 'lista') { el.innerHTML = ''; return; }
    const f = state.path.at(-1);
    const items = f ? cards.neighbourItems(byId.get(f), L) : (L ? [...L].map((id) => ({ n: byId.get(id), why: '' })) : nodes.filter((n) => n.kind !== 'publicado').map((n) => ({ n, why: '' })));
    el.innerHTML = cards.groupList(items);
    el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
  }

  // ---------- vista Carpetas: el ciclo de vida (fuente → en curso → publicado → laboratorio) ----------
  const STAGES = [
    { id: 'fuente', label: 'Fuente', test: (n) => n.kind === 'activo' && norm(n.estado) === 'fuente' },
    { id: 'encurso', label: 'En curso', test: (n) => n.kind === 'activo' && norm(n.estado) !== 'fuente' },
    { id: 'publicado', label: 'Publicado', test: (n) => n.kind === 'publicado' },
    { id: 'artefactos', label: 'Artefactos', test: (n) => n.kind === 'artefacto' },
    { id: 'laboratorio', label: 'Laboratorio', test: (n) => n.kind === 'laboratorio' },
    { id: 'constelaciones', label: 'Constelaciones', test: (n) => n.kind === 'constelacion' },
  ];
  const collapsedStages = new Set(); // columnas contraídas — persiste entre renders
  function renderCarpetas() {
    const el = $('ax-carpetas');
    if (state.view !== 'carpetas') { el.innerHTML = ''; return; }
    // el ciclo de vida completo, siempre — no depende de tener un concepto
    // enfocado (si dependiera, se queda vacío en cuanto se borra la búsqueda).
    const pool = nodes;
    el.innerHTML = STAGES.map((s) => {
      const items = pool.filter(s.test).sort((a, b) => String(b.year || '').localeCompare(String(a.year || '')));
      const collapsed = collapsedStages.has(s.id);
      // cada columna hace su propio scroll, así que entran todos — sin recortar
      return `<div class="ax-col${collapsed ? ' collapsed' : ''}" data-stage="${s.id}">
        <button type="button" class="ax-kicker ink" data-toggle="${s.id}">${s.label} · ${items.length}</button>
        ${!collapsed ? (items.length ? items.map((n) => `
          <button type="button" class="ax-item" data-go="${esc(n.id)}"><b>${esc(n.title)}${n.year ? ` <i>${esc(n.year)}</i>` : ''}</b>${n.venue || n.kind === 'artefacto' && n.sub ? `<span>${esc(n.venue || n.sub)}</span>` : n.kind === 'constelacion' ? `<span>${n.imagenes.length} imágenes · ${n.textos.length} enlaces</span>` : ''}</button>`).join('')
          : '<p class="ax-muted">— nada por ahora —</p>') : ''}
      </div>`;
    }).join('');
    el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
    el.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => {
      const id = b.dataset.toggle;
      collapsedStages.has(id) ? collapsedStages.delete(id) : collapsedStages.add(id);
      renderCarpetas();
    });
  }

  return { renderLista, renderCarpetas };
}
