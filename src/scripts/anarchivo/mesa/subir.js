// Anarchivo · Mesa — «Subir imagen» y «+ Artefacto»: añadir material nuevo desde el navegador, con dos destinos:
//  · local (`npm run dev`): se guarda en el disco (ver scripts/finder.mjs), luego se regenera el índice y la
//    página se recarga; al volver, lo recién subido queda sobre la mesa como la capa «Nuevas».
//  · publicada, con `PUBLIC_INGEST_URL` en el build: se manda al servicio de Railway (ingest/server.mjs), que lo
//    escribe en Nextcloud con un token (se pide una vez y se recuerda en este navegador). La página publicada
//    es una foto del índice, así que lo subido no aparece aquí hasta que el Mac sincronice y se publique de nuevo.
// `initSubir(ctx)` cablea el botón y devuelve `retomar()`, que la página llama una vez al arrancar.
import { $ } from '../util.js';
import { miniatura } from '../pendientes.js';

export const KEY = 'ax-subidas'; // ids recién subidos, a la espera de la recarga (sessionStorage: solo esta pestaña)

// ctx: byId y las llamadas hacia arriba (setView, setModo, addCapa)
export function initSubir({ byId, setView, setModo, addCapa, pendientes }) {
  const mesa = $('ax-mesa'), local = mesa.dataset.local === '1', base = mesa.dataset.base || '/';
  const remoto = !local && (mesa.dataset.ingest || '').replace(/\/+$/, '');
  const fab = $('ax-fab'), fabBtn = $('ax-fab-btn'), menu = $('ax-fab-menu'), aviso = $('ax-fab-msg');
  const btn = $('mx-subir'), input = $('mx-subir-input');
  fab.hidden = !local && !remoto;
  const proyInput = $('mx-proy-input');
  const abrirMenu = (v) => { menu.hidden = !v; fabBtn.setAttribute('aria-expanded', String(v)); };
  fabBtn.onclick = () => abrirMenu(menu.hidden);
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('#ax-fab')) abrirMenu(false); });
  // a dónde van las peticiones: el servidor local (sin token) o el de Railway (con token)
  const ruta = local ? { imagen: `${base}__subir`, artefacto: `${base}__artefacto`, foto: `${base}__artefacto-foto`, proyecto: `${base}__proyecto-imagen` }
    : { imagen: `${remoto}/imagen`, artefacto: `${remoto}/artefacto`, foto: `${remoto}/artefacto-foto`, proyecto: `${remoto}/proyecto-imagen` };
  const TOKEN = 'ax-ingest-token';
  const token = () => { try { return localStorage.getItem(TOKEN) || prompt('Token de subida (se recuerda en este navegador):')?.trim() || ''; } catch { return ''; } };
  class SinToken extends Error {}
  async function llamar(url, init = {}) {
    const headers = { ...init.headers };
    if (remoto) {
      const t = token();
      if (!t) throw new SinToken('falta el token');
      headers.Authorization = `Bearer ${t}`;
    }
    const r = await fetch(url, { ...init, headers });
    if (remoto && r.status === 401) { try { localStorage.removeItem(TOKEN); } catch { /* nada */ } throw new SinToken('token incorrecto'); }
    const j = await r.json();
    if (remoto && j.ok) { try { localStorage.setItem(TOKEN, headers.Authorization.slice(7)); } catch { /* nada */ } }
    return j;
  }
  // versión publicada: lo subido aún no está en el índice; entra a la Mesa con una miniatura hasta el próximo deploy
  async function aLaMesa(subidas, parent) { // subidas: [{ id, file }]
    const items = [];
    for (const { id, file } of subidas) items.push({ id, title: id.split('/').pop(), parent, fecha: new Date().toISOString().slice(0, 10), src: await miniatura(file) });
    pendientes.guardar(items);
    const ids = pendientes.registrar(items);
    if (ids.length) { setView('mesa'); setModo('mesa'); addCapa(`Subidas · ${new Date().toLocaleDateString('es')}`, ids); }
    return ids.length;
  }
  const decir = (s) => { aviso.textContent = s; }; // el estado de la subida, junto al «+»
  btn.onclick = () => { abrirMenu(false); input.click(); };
  // un fallo se dice junto al «+» (un tooltip no se ve en el teléfono) y se apaga solo
  const fallo = (t) => { btn.disabled = false; decir(t); clearTimeout(fallo.t); fallo.t = setTimeout(() => decir(''), 9000); };
  // sube un lote: `urlDe(file)` da la dirección de cada archivo y `parent` el proyecto al que pertenece lo que se muestra
  async function subirLote(files, urlDe, parent) {
   try {
    if (!files.length) return;
    btn.disabled = true;
    const ids = [], fallos = [], subidas = [];
    for (const [i, f] of files.entries()) {
      decir(`Subiendo ${i + 1} de ${files.length}…`);
      try {
        const j = await llamar(urlDe(f), { method: 'POST', body: f });
        if (j.ok) { ids.push(j.id); subidas.push({ id: j.id, file: f }); } else fallos.push(j.error || f.name);
      } catch (e) { if (e instanceof SinToken) { fallos.push(e.message); break; } fallos.push(`${f.name} (${e.message || 'sin conexión'})`); }
    }
    if (!ids.length) { btn.title = `No se subió nada: ${fallos.join(' · ')}`; return fallo(`No se subió: ${fallos.join(' · ') || 'sin respuesta'}`); }
    if (remoto) { await aLaMesa(subidas, parent); btn.disabled = false; decir(`Subido ✓ ${ids.length}`); btn.title = 'Está en Nextcloud; aquí es una miniatura hasta que el Mac sincronice y se publique'; setTimeout(() => decir(''), 4000); return; }
    try { sessionStorage.setItem(KEY, JSON.stringify({ ids, fallos })); } catch { /* sin almacenamiento: se suben igual, solo no se abren solas */ }
    decir('Catalogando…');
    try {
      const j = await (await fetch(`${base}__sync`, { method: 'POST' })).json();
      if (!j.ok) throw new Error(j.error);
      location.reload(); // el índice cambió: el servidor suele recargar solo; por si acaso
    } catch (e) {
      btn.disabled = false; decir('');
      btn.title = `Las fotos están en 08-imagenes/, pero no se pudo regenerar el índice (${e.message || 'error'}). Reinicia npm run dev.`;
    }
     } catch (e) { fallo(`No se subió: ${e.message || 'error'}`); }
  }
  input.onchange = () => { const files = [...input.files]; input.value = ''; return subirLote(files, (f) => `${ruta.imagen}?nombre=${encodeURIComponent(f.name)}`, '08-imagenes'); };
  // «+ Imagen» en la tarjeta de un proyecto en curso o de un artefacto (cards.js): sus imágenes van a su carpeta
  // imagenes/ y a su imagenes.yaml (un artefacto: a su ficha). El clic se atiende aquí, por delegación, porque
  // las tarjetas se vuelven a dibujar en cada render.
  let destino = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-subir-proy]');
    if (!b) return;
    destino = byId.get(b.dataset.subirProy) || null;
    if (destino) proyInput.click();
  });
  proyInput.onchange = () => {
    const files = [...proyInput.files], n = destino; proyInput.value = '';
    if (!n) return;
    const urlDe = n.kind === 'artefacto'
      ? (f) => `${ruta.foto}?slug=${encodeURIComponent(n.id.slice('art:'.length))}&nombre=${encodeURIComponent(f.name)}`
      : (f) => `${ruta.proyecto}?ruta=${encodeURIComponent(n.path)}&nombre=${encodeURIComponent(f.name)}`;
    return subirLote(files, urlDe, n.id);
  };

  // --- artefacto nuevo: crea su carpeta y ficha (sin inventar nada), sube sus fotos y regenera el índice ---
  const dlg = $('mx-art-dlg'), art = $('mx-art'), msg = $('mx-art-msg'), ok = $('mx-art-ok');
  art.onclick = () => { abrirMenu(false); $('mx-art-form').reset(); ok.disabled = false; dlg.showModal(); $('mx-art-titulo').focus(); };
  $('mx-art-cancel').onclick = () => dlg.close();
  $('mx-art-form').onsubmit = async (e) => {
    e.preventDefault();
    const fotos = [...$('mx-art-fotos').files];
    ok.disabled = true; msg.textContent = 'Creando la ficha…';
    try {
      const a = await llamar(ruta.artefacto, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: $('mx-art-titulo').value, tipo: $('mx-art-tipo').value }) });
      if (!a.ok) throw new Error(a.error);
      const ids = [], fallos = [], subidas = [];
      for (const [i, f] of fotos.entries()) {
        msg.textContent = `Subiendo foto ${i + 1} de ${fotos.length}…`;
        try {
          const j = await llamar(`${ruta.foto}?slug=${encodeURIComponent(a.slug)}&nombre=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
          if (j.ok) { ids.push(j.id); subidas.push({ id: j.id, file: f }); } else fallos.push(j.error || f.name);
        } catch { fallos.push(f.name); }
      }
      if (remoto) {
        if (subidas.length) { await aLaMesa(subidas, $('mx-art-titulo').value.trim()); dlg.close(); }
        msg.textContent = fallos.length ? `Ficha creada en Nextcloud, pero no se subieron: ${fallos.join(' · ')}` : `Subido a Nextcloud ✓ (${ids.length} ${ids.length === 1 ? 'imagen' : 'imágenes'}). Aparecerá aquí cuando el Mac sincronice y se publique.`;
        ok.disabled = false; return;
      }
      try { sessionStorage.setItem(KEY, JSON.stringify({ ids, fallos })); } catch { /* se sube igual, solo no se abre solo */ }
      msg.textContent = 'Catalogando…';
      const j = await (await fetch(`${base}__sync`, { method: 'POST' })).json();
      if (!j.ok) throw new Error(j.error);
      location.reload();
    } catch (err) { ok.disabled = false; msg.textContent = `No se pudo: ${err.message || 'error'}. Si la ficha ya se creó, está en 02-artefactos/.`; }
  };
  // tras la recarga: volver a la mesa con lo nuevo encima
  function retomar() {
    let p; try { p = JSON.parse(sessionStorage.getItem(KEY)); sessionStorage.removeItem(KEY); } catch { /* nada pendiente */ }
    const ids = (p?.ids || []).filter((id) => byId.has(id));
    if (!ids.length) return;
    setView('mesa'); setModo('mesa');
    addCapa(`Nuevas · ${new Date().toLocaleDateString('es')}`, ids);
    if (p.fallos?.length) btn.title = `No se subieron: ${p.fallos.join(' · ')}`;
  }
  return { retomar };
}
