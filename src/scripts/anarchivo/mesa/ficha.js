// Anarchivo · Mesa — lo que cuelga de cada imagen, en dos ventanitas fijas en pantalla (no escalan
// con el zoom de la mesa, así se leen aunque las fotos estén chicas):
//  · ficha (⋯): a qué proyecto pertenece, dónde vive el archivo y, en local, «Mostrar en Finder». Si la imagen es la
//    vista previa de un original catalogado (scripts/archivo.mjs), también su formato, peso, ruta y cómo abrirlo
//  · nota (✎): una nota de la imagen. En local (`npm run dev`) se escribe y se guarda en su
//    imagenes.yaml (campo `nota`) y dentro del propio archivo (ver scripts/finder.mjs); desplegado, solo se lee.
// `initFicha(ctx)` devuelve `abrirFicha(id, ancla)` y `abrirNota(id, ancla)`.
import { $, esc, clamp, vp } from '../util.js';
import { capOf } from '../data.js';
import { ms } from './state.js';

// ctx: datos (byId, projOf) y la llamada hacia arriba `openWindow` (la tarjeta del proyecto)
const peso = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
export function initFicha({ byId, projOf, openWindow }) {
  const mesa = $('ax-mesa'), local = mesa.dataset.local === '1', base = mesa.dataset.base || '/';
  const el = document.createElement('div');
  el.className = 'mx-ficha'; el.hidden = true;
  document.body.appendChild(el);
  let abierta = null;
  const cerrar = () => { el.hidden = true; abierta = null; };

  function abrirFicha(id, ancla) {
    if (abierta === id) return cerrar();
    const n = byId.get(id), proj = byId.get(n.parent);
    el.innerHTML = `<span class="ax-kicker">Proyecto</span>
      <button type="button" class="ax-pill sm ink" data-proj ${proj ? '' : 'disabled'}>${esc(projOf(n))}</button>
      <code>${esc(n.file || '')}</code>
      ${local ? '<button type="button" class="ax-pill sm" data-finder>Mostrar en Finder</button>' : ''}
      ${n.orig ? `<span class="ax-kicker">Original</span>
        <code>${esc([n.orig.formato, n.orig.bytes && peso(n.orig.bytes), n.orig.px].filter(Boolean).join(' · '))}</code>
        <code>${esc(n.orig.ruta)}</code>
        ${n.orig.url ? `<a class="ax-pill sm ink" href="${esc(n.orig.url)}" target="_blank" rel="noopener">Abrir original ↗</a>` : ''}
        ${local ? '<button type="button" class="ax-pill sm" data-finder-orig>Mostrar original en Finder</button>' : n.orig.url ? '' : '<span class="ax-muted">el original está en el Mac</span>'}` : ''}
      <span class="ax-muted" data-msg></span>`;
    el.hidden = false; abierta = id;
    const r = ancla.getBoundingClientRect();
    el.style.left = clamp(r.left, 8, vp.W - el.offsetWidth - 8) + 'px';
    el.style.top = clamp(r.bottom + 6, 8, vp.H - el.offsetHeight - 8) + 'px';
    el.querySelector('[data-proj]').onclick = () => { cerrar(); openWindow(n.parent); };
    const fb = el.querySelector('[data-finder]'), fo = el.querySelector('[data-finder-orig]'), msg = el.querySelector('[data-msg]');
    const enFinder = (orig) => async () => {
      try {
        const res = await fetch(`${base}__finder?id=${encodeURIComponent(id)}${orig ? '&original=1' : ''}`, { method: 'POST' });
        const j = await res.json().catch(() => ({}));
        if (j.ok) cerrar(); else msg.textContent = j.error || (orig ? 'No encuentro el original: ¿está montada su fuente?' : 'No se pudo abrir Finder.');
      } catch { msg.textContent = 'Solo funciona con el dashboard corriendo en local.'; }
    };
    if (fb) fb.onclick = enFinder(false);
    if (fo) fo.onclick = enFinder(true);
  }
  // se cierra sola: clic fuera, Esc, o al mover/acercar la mesa
  addEventListener('pointerdown', (e) => { if (abierta && !e.target.closest('.mx-ficha, .mx-i')) cerrar(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
  addEventListener('wheel', () => { if (abierta) cerrar(); }, { passive: true });

  // --- nota: ventana flotante, se arrastra por su barra y se queda abierta hasta cerrarla ---
  const nw = document.createElement('div');
  nw.className = 'mx-notaw'; nw.hidden = true;
  nw.innerHTML = `<div class="mx-notaw-bar"><span class="ax-kicker">Nota</span><b></b><button type="button" data-x aria-label="Cerrar">×</button></div>
    <textarea rows="6" placeholder="Qué es, de dónde viene, qué hay que recordar de esta imagen…"></textarea>
    <div class="mx-notaw-pie"><span class="ax-muted" data-msg></span><button type="button" class="ax-btn" data-ok>Guardar</button></div>`;
  document.body.appendChild(nw);
  const ta = nw.querySelector('textarea'), nmsg = nw.querySelector('[data-msg]'), ok = nw.querySelector('[data-ok]'), bar = nw.querySelector('.mx-notaw-bar');
  let notaId = null;
  const url = (id) => `${base}__imagen?id=${encodeURIComponent(id)}`;
  const marcar = (id, nota) => {
    byId.get(id).nota = nota; ms.mods.get(id)?.classList.toggle('con-nota', !!nota);
    document.querySelectorAll('.mx-fig').forEach((f) => { if (f.dataset.id === id) f.classList.toggle('con-nota', !!nota); });
  };
  const cerrarNota = () => { nw.hidden = true; notaId = null; };

  async function abrirNota(id, ancla) {
    if (notaId === id) return cerrarNota();
    const n = byId.get(id);
    notaId = id; nw.hidden = false;
    nw.querySelector('b').textContent = capOf(n);
    ta.value = n.nota || ''; ta.readOnly = !local; ok.hidden = !local; ok.disabled = false; nmsg.textContent = local ? '' : 'Solo lectura: se edita con el dashboard en local.';
    const r = ancla.getBoundingClientRect();
    nw.style.left = clamp(r.right + 10, 8, vp.W - nw.offsetWidth - 8) + 'px';
    nw.style.top = clamp(r.top, 8, vp.H - nw.offsetHeight - 8) + 'px';
    if (!local) return;
    // lo que vale es el yaml de ahora, no el índice (que es de cuando arrancó el dashboard)
    try {
      const j = await (await fetch(url(id))).json();
      if (notaId !== id) return;
      if (j.ok) { ta.value = j.nota; marcar(id, j.nota); nmsg.textContent = j.yaml; }
      else { nmsg.textContent = j.error || 'No se pudo leer la nota.'; ok.disabled = true; }
    } catch { nmsg.textContent = 'No se pudo leer la nota.'; ok.disabled = true; }
    ta.focus();
  }
  async function guardar() {
    const id = notaId; if (!id || ok.disabled) return;
    ok.disabled = true; nmsg.textContent = 'Guardando…';
    try {
      const j = await (await fetch(url(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nota: ta.value }) })).json();
      if (j.ok) { marcar(id, ta.value.trim()); nmsg.textContent = j.archivo ? `Guardada en ${j.yaml} y en el archivo.` : `Guardada en ${j.yaml}. ${j.aviso}`; }
      else nmsg.textContent = j.error || 'No se pudo guardar.';
    } catch { nmsg.textContent = 'No se pudo guardar.'; }
    if (notaId === id) ok.disabled = false;
  }
  ok.onclick = guardar;
  nw.querySelector('[data-x]').onclick = cerrarNota;
  // escribir aquí no dispara los atajos de la página («/», Esc); ⌘/Ctrl+Enter guarda, Esc cierra
  nw.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) guardar();
    if (e.key === 'Escape') cerrarNota();
  });
  nw.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = nw.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const move = (m) => { nw.style.left = clamp(r.left + m.clientX - sx, 0, vp.W - 80) + 'px'; nw.style.top = clamp(r.top + m.clientY - sy, 0, vp.H - 40) + 'px'; };
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
  });
  return { abrirFicha, abrirNota, local };
}
