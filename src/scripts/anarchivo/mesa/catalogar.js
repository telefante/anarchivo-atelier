// Anarchivo · Mesa — «Catalogar original» (solo en local): dejar en el playbook la vista previa y la ficha de un original
// grande que vive en otra carpeta (una fuente de 08-imagenes/archivo-fuentes.yaml). El original no se copia ni se mueve.
// Navega las fuentes por el servidor local (scripts/finder.mjs → /__archivo-ls) y catalogar es /__catalogar
// (scripts/archivo.mjs). Después regenera el índice y la página se recarga con lo nuevo sobre la mesa (como «Subir imagen»).
// Las fuentes también se crean aquí («+ Fuente»): se elige una carpeta del Mac y se añade a archivo-fuentes.yaml.
// `initCatalogar(ctx)` cablea el botón del menú del «+».
import { $, esc } from '../util.js';
import { KEY } from './subir.js';

const peso = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);

// ctx: nodes (para listar los proyectos a donde puede ir) y `cerrarMenu` (el menú del «+»)
export function initCatalogar({ nodes, cerrarMenu }) {
  const mesa = $('ax-mesa'), local = mesa.dataset.local === '1', base = mesa.dataset.base || '/';
  const btn = $('mx-cat'), dlg = $('mx-cat-dlg');
  btn.hidden = !local;
  if (!local) return;
  const sel = $('mx-cat-fuente'), ruta = $('mx-cat-ruta'), lista = $('mx-cat-lista'), proy = $('mx-cat-proy'), msg = $('mx-cat-msg');
  const bCarp = $('mx-cat-carp'), bSel = $('mx-cat-sel');
  let dir = '', elegidos = new Set();
  const decir = (t) => { msg.textContent = t; };
  const ocupado = (v) => { bCarp.disabled = bSel.disabled = v; };
  const get = (u) => fetch(base + u).then((r) => r.json());

  // cómo se llaman las carpetas de sueltas y de proyectos: «Ajustes», vía data-* de la página
  const { sueltas = '08-imagenes', proyectos = '07-proyectos' } = document.getElementById('ax-mesa')?.dataset || {};
  proy.innerHTML = `<option value="">Sueltas (${sueltas}/)</option>` + nodes
    .filter((n) => n.kind === 'activo' && n.id !== sueltas && (n.path || '').startsWith(`${proyectos}/`))
    .sort((a, b) => a.short.localeCompare(b.short)).map((n) => `<option value="${esc(n.path)}">${esc(n.short)}</option>`).join('');

  async function ver(rel = '') {
    dir = rel; elegidos = new Set(); decir('');
    if (!sel.value) { lista.innerHTML = '<div class="vacio">No hay fuentes todavía: crea una con «+ Fuente» (o escríbela en 08-imagenes/archivo-fuentes.yaml).</div>'; ruta.innerHTML = ''; return; }
    const j = await get(`__archivo-ls?fuente=${encodeURIComponent(sel.value)}&dir=${encodeURIComponent(rel)}`).catch(() => ({ ok: false }));
    if (!j.ok) { lista.innerHTML = `<div class="vacio">${esc(j.error || 'No se pudo leer la carpeta.')}</div>`; return; }
    const partes = j.rel ? j.rel.split('/') : [];
    ruta.innerHTML = [`<button type="button" data-d="">${esc(sel.selectedOptions[0].textContent)}</button>`,
      ...partes.map((p, i) => `<span>/</span><button type="button" data-d="${esc(partes.slice(0, i + 1).join('/'))}">${esc(p)}</button>`)].join('');
    ruta.querySelectorAll('button').forEach((b) => b.onclick = () => ver(b.dataset.d));
    lista.innerHTML = (j.carpetas.length || j.archivos.length)
      ? j.carpetas.map((c) => `<button type="button" data-c="${esc(c)}">📁 ${esc(c)}</button>`).join('')
        + j.archivos.map((a) => `<label><input type="checkbox" data-f="${esc(a.nombre)}" /><span>${esc(a.nombre)}</span><i>${peso(a.bytes)}</i></label>`).join('')
      : '<div class="vacio">Nada catalogable aquí (imágenes, TIFF, RAW, PSD, PDF, video).</div>';
    lista.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => ver(j.rel ? `${j.rel}/${b.dataset.c}` : b.dataset.c));
    lista.querySelectorAll('[data-f]').forEach((c) => c.onchange = () => { const r = j.rel ? `${j.rel}/${c.dataset.f}` : c.dataset.f; c.checked ? elegidos.add(r) : elegidos.delete(r); });
  }

  async function catalogar(cuerpo) {
    ocupado(true); decir('Catalogando… (los originales grandes tardan unos segundos cada uno)');
    try {
      const j = await (await fetch(`${base}__catalogar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fuente: sel.value, proyecto: proy.value, ...cuerpo }) })).json();
      if (!j.ok) throw new Error(j.error);
      const partes = [`${j.nuevas.length} nuevas`, j.repetidas && `${j.repetidas} ya estaban`, j.errores.length && `${j.errores.length} con error (${j.errores.map((e) => `${e.nombre}: ${e.error}`).join(' · ')})`].filter(Boolean);
      if (!j.nuevas.length) { decir(partes.join(' · ')); ocupado(false); return; }
      try { sessionStorage.setItem(KEY, JSON.stringify({ ids: j.nuevas.map((n) => n.id), fallos: j.errores.map((e) => e.nombre) })); } catch { /* se cataloga igual */ }
      decir(`${partes.join(' · ')} — actualizando el índice…`);
      const s = await (await fetch(`${base}__sync`, { method: 'POST' })).json();
      if (!s.ok) throw new Error(s.error);
      location.reload();
    } catch (e) { decir(`No se pudo: ${e.message || 'error'}`); ocupado(false); }
  }

  async function cargarFuentes(elegir) {
    const j = await get('__archivo-ls').catch(() => ({ ok: false }));
    sel.innerHTML = (j.fuentes || []).filter((f) => f.existe).map((f) => `<option value="${esc(f.id)}">${esc(f.nombre)}</option>`).join('');
    if (elegir) sel.value = elegir;
    return ver('');
  }
  const vista = (nueva) => { $('mx-cat-main').hidden = nueva; $('mx-fn').hidden = !nueva; $('mx-cat-nueva-btn').hidden = nueva; };
  btn.onclick = async () => { cerrarMenu?.(); dlg.showModal(); vista(false); ocupado(false); decir(''); await cargarFuentes(); if (!sel.value) abrirNueva(); };
  sel.onchange = () => ver('');
  $('mx-cat-cancel').onclick = () => dlg.close();
  bCarp.onclick = () => catalogar({ carpeta: dir, recursivo: $('mx-cat-rec').checked });
  bSel.onclick = () => (elegidos.size ? catalogar({ archivos: [...elegidos] }) : decir('Marca primero los archivos que quieres catalogar.'));

  // --- «+ Fuente»: declarar una carpeta como fuente de originales ---
  const fn = { ruta: $('mx-fn-ruta'), nav: $('mx-fn-nav'), nombre: $('mx-fn-nombre'), tipo: $('mx-fn-tipo'), nc: $('mx-fn-nc'), url: $('mx-fn-url'), remota: $('mx-fn-remota'), msg: $('mx-fn-msg'), ok: $('mx-fn-ok') };
  const tipoVista = () => { fn.nc.hidden = fn.tipo.value !== 'nextcloud'; };
  function abrirNueva() {
    for (const k of ['ruta', 'nombre', 'url', 'remota']) fn[k].value = '';
    fn.tipo.value = 'disco'; tipoVista(); fn.nav.hidden = true; fn.msg.textContent = ''; fn.ok.disabled = false; vista(true);
  }
  $('mx-cat-nueva-btn').onclick = abrirNueva;
  fn.tipo.onchange = tipoVista;
  // el navegador de carpetas: parte de los atajos (inicio, iCloud, discos) y baja carpeta a carpeta
  async function navegar(dir = '') {
    const j = await get(`__archivo-carpetas${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`).catch(() => ({ ok: false }));
    fn.nav.hidden = false;
    if (!j.ok) { fn.nav.innerHTML = `<div class="vacio">${esc(j.error || 'No se pudo leer la carpeta.')}</div>`; return; }
    fn.nav.innerHTML = `<button type="button" class="usar" data-u="${esc(j.dir)}">✓ Usar ${esc(j.dir)}</button>`
      + (j.padre ? `<button type="button" data-d="${esc(j.padre)}">↑ ..</button>` : '')
      + (j.atajos && !dir ? j.atajos.map((a) => `<button type="button" data-d="${esc(a.ruta)}">⌂ ${esc(a.nombre)}</button>`).join('') : '')
      + j.carpetas.map((c) => `<button type="button" data-d="${esc(`${j.dir}/${c}`)}">📁 ${esc(c)}</button>`).join('')
      || '<div class="vacio">Sin subcarpetas.</div>';
    fn.nav.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => navegar(b.dataset.d));
    fn.nav.querySelector('[data-u]').onclick = (e) => usar(e.currentTarget.dataset.u);
  }
  // al elegir la carpeta, el servidor sugiere tipo, dirección y ruta en el servidor (si cae dentro de otra fuente Nextcloud)
  async function usar(dir) {
    fn.ruta.value = dir; fn.nav.hidden = true; fn.msg.textContent = '';
    if (!fn.nombre.value) fn.nombre.value = dir.split('/').filter(Boolean).pop() || '';
    const j = await get(`__archivo-carpetas?dir=${encodeURIComponent(dir)}&sugerir=1`).catch(() => null);
    const sug = j?.sugerencia; if (!sug) return;
    fn.tipo.value = sug.tipo; tipoVista();
    if (sug.url) fn.url.value = sug.url;
    if (sug.remota) fn.remota.value = sug.remota;
    if (sug.tipo === 'nextcloud') fn.msg.textContent = 'Está dentro de una carpeta que ya sincroniza con Nextcloud: copié su dirección y calculé la ruta en el servidor. Revísalas.';
  }
  $('mx-fn-elegir').onclick = () => navegar('');
  $('mx-fn-cancel').onclick = () => { vista(false); if (!sel.value) dlg.close(); };
  fn.ok.onclick = async () => {
    fn.ok.disabled = true; fn.msg.textContent = 'Guardando…';
    try {
      const j = await (await fetch(`${base}__archivo-fuente`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: fn.nombre.value, tipo: fn.tipo.value, ruta: fn.ruta.value, url: fn.url.value, remota: fn.remota.value }) })).json();
      if (!j.ok) throw new Error(j.error);
      vista(false); await cargarFuentes(j.id); decir('Fuente guardada en 08-imagenes/archivo-fuentes.yaml.');
    } catch (e) { fn.msg.textContent = `No se pudo: ${e.message || 'error'}`; fn.ok.disabled = false; }
  };
}
