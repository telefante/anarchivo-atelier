// Anarchivo · Mesa — qué hay sobre la mesa.
// Nada está sobre la mesa hasta que se pone: cada búsqueda (Enter) o foco suma una capa (chip arriba) y las
// anteriores se quedan. «+» en una imagen trae a sus vecinas (imagenes.yaml, CV, hilos tuyos); «−» las devuelve.
// El foco (doble clic) deja solo una foto y sus conexiones, cerca. Este módulo decide QUÉ módulos existen
// (tableIds → syncTable); dónde van lo decide layout.js y cómo se dibujan, draw.js.
import * as d3 from 'd3';
import { $, esc, vp } from '../util.js';
import { capOf } from '../data.js';
import { mx, saveMx, ms } from './state.js';
import { stage, fitView, applyView, animateTo, anillo, colocar } from './layout.js';

// ctx: datos (IMGS, DOSSIER_IMGS, byId, adj, neighbours, search, userRels) y las llamadas
// hacia arriba (renderTop, lit, setQuery, mxSchedule, closePair, syncTools) y makeMod (crea cada módulo: mesa/interact.js)
export function initCapas({ IMGS, DOSSIER_IMGS, byId, adj, neighbours, search, userRels, renderTop, lit, setQuery, mxSchedule, closePair, syncTools, makeMod }) {
  const { mods } = ms;
  // --- la mesa se llena por capas ---
  // Nada está sobre la mesa hasta que se pone: cada búsqueda (Enter) o foco suma
  // una capa (chip arriba) y las anteriores se quedan. «+» en una imagen trae a
  // sus vecinas (imagenes.yaml, CV, hilos tuyos); «−» las devuelve al archivo.
  const MAXCAPA = 80, MUESTRA = 30;
  const ALL_BY_PARENT = d3.group([...IMGS, ...DOSSIER_IMGS], (n) => n.parent);
  const isImg = (id) => { const n = byId.get(id); return !!(n && n.kind === 'imagen' && n.src); };

  // nodos (proyectos, conceptos, imágenes…) -> imágenes que les corresponden
  function imgsFromSet(S, cap = MAXCAPA) {
    const directos = [], viaProy = [];
    const proy = (pid) => (ALL_BY_PARENT.get(pid) || []).forEach((n) => viaProy.push(n.id));
    for (const id of S) {
      const n = byId.get(id);
      if (!n) continue;
      if (n.kind === 'imagen') { if (n.src) directos.push(id); }
      else if (n.kind === 'constelacion') n.imagenes.forEach((i) => isImg(i) && directos.push(i));
      else if (n.kind === 'concepto') {
        for (const o of neighbours(id)) { const m = byId.get(o); if (m.kind === 'imagen' && m.src) directos.push(o); else if (m.kind === 'activo') proy(o); }
      } else proy(id);
    }
    const all = [...new Set([...directos, ...viaProy])];
    return { ids: all.slice(0, cap), total: all.length };
  }
  // lo que está sobre la mesa: capas visibles + fijas + invitadas de imágenes que están
  function tableIds() {
    const s = new Set();
    // en foco solo cuenta la foto y sus conexiones; las capas esperan guardadas
    if (mx.foco) { s.add(mx.foco.id); imgNb(mx.foco.id).forEach((i) => s.add(i)); return s; }
    for (const c of mx.capas) if (!c.hidden) c.ids.forEach((i) => isImg(i) && s.add(i));
    mx.fijas.forEach((i) => isImg(i) && s.add(i));
    for (const [src, list] of Object.entries(mx.exp)) if (s.has(src)) list.forEach((i) => isImg(i) && s.add(i));
    return s;
  }
  const conocida = (id) => mx.capas.some((c) => c.ids.includes(id)) || mx.fijas.includes(id) || Object.values(mx.exp).some((l) => l.includes(id));
  function pruneExp() {
    for (let again = true; again;) { again = false; for (const k of Object.keys(mx.exp)) if (!conocida(k)) { delete mx.exp[k]; again = true; } }
  }
  function touch(id) { mx.tocadas = [id, ...mx.tocadas.filter((x) => x !== id)].slice(0, 60); }
  // vecinas de una imagen, las más fuertes primero: yaml > hilo tuyo > semejanza CV
  function imgNb(id) {
    if (ms.nbCache.has(id)) return ms.nbCache.get(id);
    const sc = new Map();
    for (const { id: o, l } of adj.get(id) || []) {
      if (!isImg(o)) continue;
      const v = l.type === 'relacionada' ? 3 : l.type === 'visual' ? 1 + (l.similarity || 0) : 0;
      if (v > (sc.get(o) || 0)) sc.set(o, v);
    }
    for (const k of userRels) { const [a, b] = k.split('||'); const o = a === id ? b : b === id ? a : null; if (o && isImg(o)) sc.set(o, Math.max(sc.get(o) || 0, 2.5)); }
    const out = [...sc].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([o]) => o);
    ms.nbCache.set(id, out);
    return out;
  }
  function muestraReciente() {
    const ok = new Set(IMGS.map((n) => n.id));
    const ids = mx.tocadas.filter((i) => ok.has(i)).slice(0, MUESTRA);
    const label = ids.length ? 'Últimas tocadas' : 'Muestra reciente';
    const porProy = new Map();
    for (const n of IMGS.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))) {
      if (ids.length >= MUESTRA) break;
      if (ids.includes(n.id) || (porProy.get(n.parent) || 0) >= 6) continue;
      porProy.set(n.parent, (porProy.get(n.parent) || 0) + 1); ids.push(n.id);
    }
    return { ids, label };
  }

  // pone sobre la mesa lo que falta y saca lo que ya no está en ninguna capa visible
  function syncTable(opts) { ms.syncQ = ms.syncQ.then(() => doSync(opts || {})).catch((e) => console.error(e)); return ms.syncQ; }
  async function doSync({ place = colocar, fit = false } = {}) {
    if (!ms.built) return;
    const T = tableIds();
    for (const [id, el] of [...mods]) if (!T.has(id)) {
      el.remove(); mods.delete(id);
      if (mx.pos[id] && !conocida(id)) mx.pos[id].gone = true;
      if (ms.sel === id) ms.sel = null;
      ms.sels.delete(id);
    }
    if (ms.pair && !(mods.has(ms.pair[0]) && mods.has(ms.pair[1]))) closePair();
    const fresh = [], loads = [];
    for (const id of T) {
      if (mods.has(id)) continue;
      const p = mx.pos[id], keep = !!p && (p.u || !p.gone);
      if (!keep) fresh.push(id);
      loads.push(makeMod(byId.get(id), !keep));
    }
    if (fresh.length) {
      // esperar las imágenes para conocer su alto; con tope, por si alguna tarda
      await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
      place(fresh.filter((i) => mods.has(i)));
    }
    // fit: una lista (encuadrar esas) · true (las recién llegadas) · 'todo' (lo que quede sobre la mesa)
    const target = (Array.isArray(fit) ? fit : fit === 'todo' ? [...mods.keys()] : fresh).filter((i) => mods.has(i) && !mods.get(i).dataset.pend);
    if (fit && target.length) fitView(target);
    // y pase lo que pase: si quedó algo sobre la mesa pero nada a la vista, la vista salta a donde están
    else if (mods.size && !ms.pair) {
      const tope = vp.H - ($('mx-barra')?.offsetHeight || 0);
      const seVe = (el) => { const r = el.getBoundingClientRect(); return r.width && r.right > 0 && r.left < vp.W && r.bottom > 0 && r.top + r.height / 2 < tope; };
      if (![...mods.values()].some(seVe)) fitView([...mods.keys()]);
    }
    $('mx-hint').hidden = mods.size > 0 || !IMGS.length;
    syncTools(); saveMx(); mxSchedule(); renderTop(lit());
  }

  function addCapa(label, ids, { id, total } = {}) {
    ids = [...new Set(ids)].filter(isImg);
    if (!ids.length) { ms.msg = `sin imágenes para «${label}»`; renderTop(lit()); return false; }
    ms.msg = '';
    salirFoco({ view: false });
    const T = tableIds(), nuevos = ids.filter((i) => !T.has(i));
    const prev = mx.capas.find((c) => (id ? c.id === id : c.label === label));
    if (prev) { prev.ids = ids; prev.total = total || ids.length; prev.hidden = false; }
    else mx.capas.push({ id: id || 'c' + Date.now(), label, ids, total: total || ids.length, hidden: false });
    syncTable({ fit: nuevos.length ? nuevos : ids });
    return true;
  }
  // «Ver todo el archivo» en modo Libre: una muestra repartida entre todos los proyectos (una de cada uno,
  // luego la segunda de cada uno…) hasta el tope de una capa. El archivo entero solo cabe en Alineado.
  function todoElArchivo() {
    const grupos = [...d3.group(IMGS, (n) => n.parent).values()], ids = [];
    for (let i = 0; ids.length < MAXCAPA && grupos.some((g) => i < g.length); i++) {
      for (const g of grupos) if (i < g.length && ids.length < MAXCAPA) ids.push(g[i].id);
    }
    return addCapa('Todo el archivo', ids, { id: 'todo', total: IMGS.length });
  }
  function removeCapa(cid) {
    salirFoco({ view: false });
    mx.capas = mx.capas.filter((c) => c.id !== cid);
    if (mx.solo === cid) { mx.solo = null; mx.capas.forEach((c) => { c.hidden = false; }); }
    pruneExp(); syncTable({ fit: 'todo' });
  }
  function toggleCapa(cid) { salirFoco({ view: false }); const c = mx.capas.find((x) => x.id === cid); if (c) { c.hidden = !c.hidden; mx.solo = null; syncTable({ fit: c.hidden ? 'todo' : c.ids }); } }
  function soloCapa(cid) {
    salirFoco({ view: false });
    if (mx.solo === cid) { mx.solo = null; mx.capas.forEach((c) => { c.hidden = false; }); }
    else { mx.solo = cid; mx.capas.forEach((c) => { c.hidden = c.id !== cid; }); }
    syncTable({ fit: mx.solo ? mx.capas.find((c) => c.id === cid)?.ids || 'todo' : 'todo' });
  }
  function fitCapa(cid) {
    const ids = (mx.capas.find((c) => c.id === cid)?.ids || []).filter((i) => mods.has(i));
    if (ids.length) { fitView(ids); saveMx(); }
  }
  function quitar(id) {
    mx.capas.forEach((c) => { c.ids = c.ids.filter((i) => i !== id); });
    mx.capas = mx.capas.filter((c) => c.ids.length);
    for (const k of Object.keys(mx.exp)) mx.exp[k] = mx.exp[k].filter((i) => i !== id);
    delete mx.exp[id];
    mx.fijas = mx.fijas.filter((i) => i !== id);
    pruneExp(); syncTable();
  }
  // «+» trae a las vecinas; «−» las devuelve (las que moviste o relacionaste quedan fijas)
  function toggleExp(id) {
    if (mx.foco) return enfocar(id); // en foco, «+»/«≈» recentra en esa foto
    touch(id);
    if (mx.exp[id]) {
      const list = mx.exp[id];
      delete mx.exp[id];
      for (const i of list) {
        const tuya = mx.pos[i]?.u || [...userRels].some((k) => k.split('||').includes(i)) || Object.keys(mx.notes).some((k) => k.split('||').includes(i));
        if (tuya && !mx.fijas.includes(i)) mx.fijas.push(i);
      }
      pruneExp(); syncTable();
    } else {
      const nb = imgNb(id);
      if (!nb.length) return;
      const T = tableIds(), nuevas = nb.filter((i) => !T.has(i));
      mx.exp[id] = nuevas;
      syncTable({ place: anillo(id), fit: nuevas.length ? [id, ...nuevas] : false });
    }
  }
  // doble clic: zoom a una foto y solo ella con sus conexiones, cerca. Esc o «salir» lo devuelve todo a su sitio
  async function enfocar(id) {
    if (!isImg(id)) return;
    if (mx.foco?.id === id) return salirFoco();
    const nb = imgNb(id), ids = [id, ...nb];
    const f = mx.foco || { prev: {}, view: { ...mx.view } }; // posiciones y cámara de antes, para volver
    for (const i of ids) if (mx.pos[i] && !f.prev[i]) f.prev[i] = { x: mx.pos[i].x, y: mx.pos[i].y, w: mx.pos[i].w };
    f.id = id; mx.foco = f;
    touch(id); ms.sel = id; ms.sels.clear(); closePair();
    await syncTable();
    if (mx.foco !== f || !mods.has(id)) return;
    const vecinas = nb.filter((i) => mods.has(i));
    anillo(id, 24)(vecinas);
    const todas = [id, ...vecinas];
    mods.get(id).style.zIndex = ++ms.z;
    animateTo(todas); fitView(todas, 1.8); // en foco sí se acerca: la foto crece hasta llenar el espacio
    renderTop(lit());
  }
  function salirFoco({ view = true } = {}) {
    const f = mx.foco;
    if (!f) return;
    mx.foco = null; ms.sel = null;
    for (const [i, p] of Object.entries(f.prev)) if (mx.pos[i]) Object.assign(mx.pos[i], p);
    syncTable().then(() => {
      animateTo([...mods.keys()]);
      if (view) { mx.view = f.view; stage.style.transition = 'transform .6s cubic-bezier(.3,.7,.2,1)'; applyView(); setTimeout(() => { stage.style.transition = ''; }, 650); saveMx(); }
      renderTop(lit());
    });
  }
  function focoHtml() {
    const n = byId.get(mx.foco.id);
    return `<span class="mx-chip solo"><button type="button" data-cfoco-fit title="Encuadrar la foto y sus conexiones">◎ ${esc(capOf(n))} · ${imgNb(n.id).length} conexiones</button>
      <button type="button" data-cficha title="Abrir la ficha">ficha</button>
      <button type="button" data-cfoco-x title="Volver a la mesa (Esc)">salir ×</button></span><span class="ax-muted">las capas siguen guardadas</span>`;
  }
  function mesaAddQuery(v) {
    const { ids, total } = imgsFromSet(new Set(search(v).map((n) => n.id)));
    if (addCapa(v.trim(), ids, { total })) setQuery('', null);
  }

  // --- construir (una vez, la primera vez que se abre la vista) ---
  function buildMesa() {
    ms.built = true;
    $('mx-vacio').hidden = IMGS.length > 0;
    if (mx.foco && !isImg(mx.foco.id)) mx.foco = null;
    // primera vez: una muestra de lo último que se tocó, no las ~1000 a la vez
    if (!mx.capas.length && !mx.iniciada) {
      mx.iniciada = true;
      const m = muestraReciente();
      if (m.ids.length) mx.capas.push({ id: 'recientes', label: m.label, ids: m.ids, total: m.ids.length, hidden: false });
    }
    applyView();
    syncTools();
    syncTable({ fit: true });
  }

  return { MAXCAPA, isImg, imgsFromSet, tableIds, touch, imgNb, muestraReciente, syncTable, addCapa, todoElArchivo, removeCapa, toggleCapa, soloCapa, fitCapa, quitar, toggleExp, enfocar, salirFoco, focoHtml, mesaAddQuery, buildMesa };
}
