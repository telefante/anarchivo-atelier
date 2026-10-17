// Anarchivo · Mesa — constelaciones: un conjunto con nombre de imágenes (y de textos), para volver a él.
//  · armar    — ⌘/Ctrl+clic elige imágenes; «+ Constelación» les pone nombre, o las suma a una que ya existe,
//               y deja enlazar textos, proyectos o conceptos.
//  · guardar  — en local (`npm run dev`) cada una es un archivo: 09-constelaciones/<slug>.md (lo escribe
//               scripts/finder.mjs, /__constelacion). Luego se regenera el índice y la página se recarga, como
//               en «Subir imagen»: la constelación vuelve como nodo del grafo. En la versión publicada no hay
//               disco: queda en este navegador (`mx.constelaciones`), y en el taller se puede pasar al playbook.
//  · volver   — «Constelaciones» las lista; tocar una abre su panel flotante (imágenes, textos enlazados y
//               notas: cards.js) y «a la mesa» pone sus imágenes como una capa. Si después se le quita una
//               foto (×), el chip de la capa ofrece guardar el cambio.
// `initConstelaciones(ctx)` cablea el modal y los botones; devuelve lo que usan la fila de arriba y el arranque.
import { $, esc } from '../util.js';
import { KIND } from '../data.js';
import { mx, saveMx, ms } from './state.js';

const KEY = 'ax-constel'; // id recién guardado, a la espera de la recarga (sessionStorage: solo esta pestaña)

// ctx: datos (nodes, byId, search, isImg), el panel de la mesa (mxPanel, closePair) y las llamadas hacia arriba
// (addCapa, syncTools, openWindow, setView, setModo)
export function initConstelaciones({ nodes, byId, search, isImg, addCapa, mxPanel, closePair, syncTools, openWindow, setView, setModo }) {
  const mesa = $('ax-mesa'), local = mesa.dataset.local === '1', base = mesa.dataset.base || '/';
  const modal = $('mx-constel-modal'), aviso = $('mx-constel-aviso'), dest = $('mx-constel-dest'), ok = $('mx-constel-ok');
  const nombre = $('mx-constel-nombre'), desc = $('mx-constel-desc');
  const q = $('mx-constel-q'), hits = $('mx-constel-hits'), puestos = $('mx-constel-links');
  const guardadas = nodes.filter((n) => n.kind === 'constelacion').sort((a, b) => String(b.date).localeCompare(String(a.date)));
  let enlaces = []; // lo enlazado en el modal: ids de textos, proyectos o conceptos

  $('mx-constels').querySelector('span').textContent = `Constelaciones · ${guardadas.length + mx.constelaciones.length}`;

  // escribe el archivo, regenera el índice y recarga; `despues` corre entre lo uno y lo otro
  async function escribir(body, despues) {
    const j = await (await fetch(`${base}__constelacion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json()
      .catch(() => ({ error: 'el servicio local no conoce todavía las constelaciones: reinicia npm run dev' }));
    if (!j.ok) throw new Error(j.error || 'no se pudo guardar');
    despues?.();
    try { sessionStorage.setItem(KEY, j.id); } catch { /* sin almacenamiento: se guarda igual, solo no se abre sola */ }
    const s = await (await fetch(`${base}__sync`, { method: 'POST' })).json().catch(() => ({}));
    if (!s.ok) throw new Error(`Guardada en ${j.archivo}, pero no se pudo regenerar el índice (${s.error || 'error'}). Reinicia npm run dev.`);
    location.reload(); // el índice cambió: el servidor suele recargar solo; por si acaso
  }

  // sus imágenes entran como una capa propia (reabrirla la devuelve a como está guardada)
  function abrir(id) {
    const n = byId.get(id), l = mx.constelaciones.find((c) => c.id === id);
    closePair();
    if (n) addCapa(n.short, n.imagenes, { id });
    else if (l) addCapa(l.nombre, l.imagenes, { id });
  }

  // ---------- la lista: volver a una constelación ----------
  function lista(nota = '') {
    const L = mx.constelaciones;
    const cuenta = (n, t = 0) => `${n} ${n === 1 ? 'imagen' : 'imágenes'}${t ? ` · ${t} ${t === 1 ? 'enlace' : 'enlaces'}` : ''}`;
    const fila = (id, titulo, fecha, sub, extra, panel) => `<div class="mx-cst">
      <button type="button" class="ax-item" data-cst${panel ? '-panel' : ''}="${esc(id)}" title="${panel ? 'Abrir su panel: imágenes, textos y notas' : 'Poner sus imágenes sobre la mesa'}"><b>${esc(titulo)}${fecha ? ` <i>${esc(fecha)}</i>` : ''}</b><span>${sub}</span></button>${extra}</div>`;
    ms.pair = null;
    mxPanel.classList.add('open');
    mxPanel.innerHTML = `
      <div class="mx-panel-head"><span class="ax-kicker ink">Constelaciones</span><button type="button" class="ax-close" data-mx-cerrar>×</button></div>
      ${nota ? `<p class="ax-muted">${esc(nota)}</p>` : ''}
      ${guardadas.map((n) => fila(n.id, n.title, n.date, cuenta(n.imagenes.length, n.textos.length), `<button type="button" class="ax-pill sm" data-cst="${esc(n.id)}" title="Poner sus imágenes sobre la mesa, como una capa">a la mesa</button>`, true)).join('')}
      ${L.length ? `<span class="ax-kicker">Solo en este navegador · ${L.length}</span>` + L.map((c) => fila(c.id, c.nombre, c.fecha, cuenta(c.imagenes.length),
        local ? `<button type="button" class="ax-pill sm" data-cst-subir="${esc(c.id)}" title="Guardarla como archivo en 09-constelaciones/">al playbook ↥</button>` : '')).join('') : ''}
      ${guardadas.length || L.length ? '' : '<p class="ax-muted">Todavía no hay ninguna. Elige imágenes con ⌘/Ctrl+clic y pulsa «+ Constelación».</p>'}
      <span class="ax-muted" id="mx-cst-aviso"></span>`;
    mxPanel.querySelector('[data-mx-cerrar]').onclick = closePair;
    mxPanel.querySelectorAll('[data-cst]').forEach((b) => b.onclick = () => abrir(b.dataset.cst));
    mxPanel.querySelectorAll('[data-cst-panel]').forEach((b) => b.onclick = () => { closePair(); openWindow(b.dataset.cstPanel); });
    mxPanel.querySelectorAll('[data-cst-subir]').forEach((b) => b.onclick = async () => {
      const c = mx.constelaciones.find((x) => x.id === b.dataset.cstSubir);
      b.disabled = true; b.textContent = 'guardando…';
      try {
        await escribir({ title: c.nombre, descripcion: c.descripcion, imagenes: c.imagenes },
          () => { mx.constelaciones = mx.constelaciones.filter((x) => x !== c); saveMx(); });
      } catch (e) { b.disabled = false; b.textContent = 'al playbook ↥'; $('mx-cst-aviso').textContent = e.message; }
    });
  }
  $('mx-constels').onclick = () => lista();

  // ---------- el modal: armar una nueva o sumar a una que existe ----------
  const cerrar = () => { modal.hidden = true; nombre.value = ''; desc.value = ''; q.value = ''; hits.innerHTML = ''; ok.disabled = false; };
  // con destino elegido sobran el nombre y el texto (son del archivo, se editan allí)
  function pintar() {
    nombre.closest('label').hidden = desc.closest('label').hidden = !!dest.value;
    ok.textContent = dest.value ? 'Añadir' : 'Crear';
    // un concepto se declara al crear; a una constelación que ya existe se le añade en su archivo (`concepts:`)
    if (dest.value) enlaces = enlaces.filter((id) => byId.get(id).kind !== 'concepto');
    puestos.innerHTML = enlaces.map((id) => `<button type="button" class="ax-pill sm ink" data-del="${esc(id)}">${esc(byId.get(id).short)}&nbsp;&nbsp;×</button>`).join('');
    puestos.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { enlaces = enlaces.filter((id) => id !== b.dataset.del); pintar(); });
  }
  q.oninput = () => {
    const rs = search(q.value).filter((n) => !['imagen', 'constelacion'].includes(n.kind) && !(dest.value && n.kind === 'concepto') && !enlaces.includes(n.id)).slice(0, 6);
    hits.innerHTML = rs.map((n) => `<button type="button" class="ax-pill sm" data-add="${esc(n.id)}">+ ${esc(n.short)} · ${KIND[n.kind]}</button>`).join('');
    hits.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { enlaces.push(b.dataset.add); q.value = ''; hits.innerHTML = ''; pintar(); q.focus(); });
  };
  dest.onchange = pintar;
  $('mx-constelacion').onclick = () => {
    if (!ms.sels.size) return lista('Para armar una nueva: pulsa «Elegir», toca las imágenes (o ⌘/Ctrl+clic) y vuelve a «+ Constelación».');
    enlaces = [];
    $('mx-constel-count').textContent = `${ms.sels.size} ${ms.sels.size === 1 ? 'imagen elegida' : 'imágenes elegidas'}`;
    dest.innerHTML = '<option value="">Nueva constelación</option>' + guardadas.map((n) => `<option value="${esc(n.id)}">${esc(n.title)}</option>`).join('');
    dest.value = '';
    dest.closest('label').hidden = !local || !guardadas.length;
    q.closest('label').hidden = !local; // los enlaces a textos solo existen en el archivo
    aviso.textContent = local ? '' : 'Aquí queda en este navegador. En el taller (npm run dev) se guarda como archivo en 09-constelaciones/.';
    pintar();
    modal.hidden = false;
    nombre.focus();
  };
  ok.onclick = async () => {
    const sel = [...ms.sels], cuerpo = dest.value ? null : { title: nombre.value.trim(), descripcion: desc.value.trim() };
    if (cuerpo && !cuerpo.title) { aviso.textContent = 'Falta el nombre.'; nombre.focus(); return; }
    if (!local) {
      const c = { id: 'cst:' + Date.now(), nombre: cuerpo.title, descripcion: cuerpo.descripcion, imagenes: sel, fecha: new Date().toLocaleDateString('sv') };
      mx.constelaciones.push(c); saveMx();
      cerrar(); ms.sels.clear(); syncTools(); abrir(c.id);
      return;
    }
    ok.disabled = true; aviso.textContent = 'Guardando y catalogando…';
    try {
      const n = byId.get(dest.value);
      if (n) await escribir({ slug: n.id.slice('cst:'.length), imagenes: [...n.imagenes, ...sel], textos: [...n.textos, ...enlaces] });
      else await escribir({ ...cuerpo, imagenes: sel, textos: enlaces.filter((id) => byId.get(id).kind !== 'concepto'),
        concepts: enlaces.map((id) => byId.get(id)).filter((x) => x.kind === 'concepto').map((x) => x.slug) });
    } catch (e) { ok.disabled = false; aviso.textContent = e.message; }
  };
  $('mx-constel-cancel').onclick = cerrar;
  modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrar(); } });

  // ---------- el chip de la capa: guardar lo que cambió sobre la mesa ----------
  // ¿la capa viene de una constelación guardada y ya no tiene las mismas imágenes?
  function cambiada(c) {
    const n = local && byId.get(c.id);
    if (!n || n.kind !== 'constelacion') return false;
    const a = new Set(c.ids), b = n.imagenes.filter(isImg);
    return a.size !== b.length || b.some((i) => !a.has(i));
  }
  async function guardarCapa(cid, btn) {
    const c = mx.capas.find((x) => x.id === cid), n = byId.get(cid);
    if (!c || !n) return;
    btn.disabled = true; btn.textContent = 'guardando…';
    // las que el índice conoce pero no pudo servir (archivo ausente) no están en la capa: no se pierden por eso
    try { await escribir({ slug: cid.slice('cst:'.length), imagenes: [...c.ids, ...n.imagenes.filter((i) => !isImg(i))] }); }
    catch (e) { btn.disabled = false; btn.textContent = 'guardar ↥'; btn.title = e.message; }
  }

  // tras la recarga: volver a la mesa con la constelación recién guardada encima
  function retomar() {
    let id; try { id = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch { /* nada pendiente */ }
    if (!id || !byId.has(id)) return;
    setView('mesa'); setModo('mesa'); abrir(id); openWindow(id);
  }

  return { abrir, cambiada, guardarCapa, retomar };
}
