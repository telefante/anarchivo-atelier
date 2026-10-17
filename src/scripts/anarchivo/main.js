// Anarchivo — script de la página (grafo d3, tarjetas, Lista/Carpetas, Mesa, Galería).
// Movido desde anarchivo.astro (antes <script is:inline>); util.js y data.js ya salieron de aquí.
// Depende de: #ax-data (JSON inline con el grafo). d3 viene de npm (antes: CDN), así que
// el dashboard funciona sin red.
import { $, esc, pairKey, idOf, vp } from './util.js';
import { KIND, buildData } from './data.js';
import { state } from './app-state.js';
import { mx, saveMx, ms } from './mesa/state.js';
import { initExport } from './mesa/export.js';
import { initConstelaciones } from './mesa/constelaciones.js';
import { initGaleria } from './mesa/galeria.js';
import { initBarra } from './mesa/barra.js';
import { initFicha } from './mesa/ficha.js';
import { initSubir } from './mesa/subir.js';
import { initPendientes } from './pendientes.js';
import { initCatalogar } from './mesa/catalogar.js';
import { initDraw } from './mesa/draw.js';
import { initCapas } from './mesa/capas.js';
import { initInteract } from './mesa/interact.js';
import { initGraph } from './graph.js';
import { createCards } from './cards.js';
import { initWindows } from './windows.js';
import { initVistas } from './vistas.js';
import { initConstelas } from './constelas.js';
import { initTop } from './top.js';
import { initEntrada } from './entrada.js';
import { initChat } from './chat.js';
import { initAjustes } from './ajustes.js';
import { env, rectOf, center, applyView, ordenarMesa, fitView } from './mesa/layout.js';

  (() => {
    const G = JSON.parse(document.getElementById('ax-data').textContent);
    const body = document.body;
    const { concepts, nodes, byId, links, adj, neighbours, reason, search } = buildData(G);
    // ---------- lienzo: el grafo d3 (graph.js) ----------
    const { nodeSel, blobSel, layout, renderGraph, setDetail } = initGraph({ nodes, links, byId, adj, neighbours, state, body, lit, up: () => up() });

    // conjunto «encendido»: vecinos del foco (o coincidencias de búsqueda), filtrados por tipo
    function lit() {
      const f = state.path.at(-1);
      let set;
      if (f) {
        // un concepto toca decenas de obras publicadas: quedan en primer plano las 8 más recientes
        const ns = neighbours(f).map((id) => byId.get(id));
        const pubs = ns.filter((n) => n.kind === 'publicado').sort((a, b) => String(b.year).localeCompare(String(a.year)));
        const keep = byId.get(f).kind === 'concepto' ? new Set(pubs.slice(0, 8).map((n) => n.id)) : null;
        set = new Set([f, ...ns.filter((n) => n.kind !== 'publicado' || !keep || keep.has(n.id)).map((n) => n.id)]);
      }
      else if (state.q) set = new Set(search(state.q).map((n) => n.id));
      else return null;
      if (state.types.size) for (const id of [...set]) { const n = byId.get(id); if (id !== f && n.kind !== 'concepto' && !state.types.has(n.kind)) set.delete(id); }
      return set;
    }

    function render(t = 450) {
      if (document.hidden) t = 0; // sin rAF las transiciones se congelan a medio camino
      const f = state.path.at(-1);
      body.dataset.state = f ? (byId.get(f).kind === 'concepto' && state.path.length === 1 ? 'concepto' : 'nodo')
        : state.q ? 'busqueda' : (state.view !== 'grafo' ? 'vista' : 'inicio');
      body.dataset.view = state.view;
      const L = lit();
      renderGraph(L, f, t);
      renderTop(L);
      syncWindows(L);
      renderLista(L);
      renderCarpetas();
      renderConstelas();
      renderMesa(L);
    }

    // ---------- UI: buscador, ruta, filtros ----------
    const entrada = initEntrada();
    // Safari en iOS ignora user-scalable=no: el pellizco de página se frena aquí.
    // Si la página ya quedó ampliada (Safari recuerda la escala), se deja pasar para poder volver.
    addEventListener('gesturestart', (e) => { if ((window.visualViewport?.scale ?? 1) <= 1.01) e.preventDefault(); });
    const qBig = $('ax-q-big'), q = $('ax-q');
    function setQuery(v, from) {
      state.q = v; state.path = []; ms.msg = '';
      if (from !== q) q.value = v;
      if (from !== qBig) qBig.value = v;
      const best = search(v)[0];
      const qt = $('ax-qtype');
      qt.hidden = !best; if (best) qt.textContent = KIND[best.kind];
      render();
      if (from === qBig && v) { entrada.unfoldTop(); q.focus(); }
    }
    [qBig, q].forEach((el) => {
      el.addEventListener('input', () => setQuery(el.value, el));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (state.view === 'mesa') mesaAddQuery(el.value);
          else { const best = search(el.value)[0]; if (best) go(best.id, true); }
        }
        if (e.key === 'Escape') { setQuery('', null); qBig.focus(); }
      });
    });
    // Esc fuera de un campo: salir del nodo o la búsqueda (en la Mesa, Esc ya sale del foco de imagen)
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.view !== 'mesa' && document.activeElement.tagName !== 'INPUT' && (state.path.length || state.q)) reset(); });
    addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); if (body.dataset.state === 'inicio') entrada.unfold(); else entrada.unfoldTop(); (body.dataset.state === 'inicio' ? qBig : q).focus(); } });

    function go(id, fresh) {
      // en la Mesa, enfocar un proyecto o concepto suma una capa (no reemplaza lo que ya hay)
      if (state.view === 'mesa' && byId.get(id).kind !== 'imagen') {
        const n = byId.get(id);
        // una constelación entra entera y con su propio id de capa: así el chip sabe si luego cambió
        if (n.kind === 'constelacion') constel.abrir(id);
        else { const { ids, total } = imgsFromSet(new Set([id])); addCapa(n.short, ids, { total }); }
        setQuery('', null);
        openWindow(id);
        return;
      }
      if (fresh) state.path = [];
      const i = state.path.indexOf(id);
      if (i >= 0) state.path = state.path.slice(0, i + 1); else state.path.push(id);
      openWindow(id);
      render();
    }
    // vuelta al total: sin foco, sin búsqueda, con todas las áreas a la vista
    function reset() { setQuery('', null); }
    function pop(i) { state.path = state.path.slice(0, i); render(); }
    // un paso hacia arriba: del nodo al anterior de la ruta; del primero, a las áreas
    function up() { state.path.length > 1 ? pop(state.path.length - 1) : reset(); }


    // ---------- contenido de tarjetas y listas (cards.js) ----------
    const { boveda, publicado } = document.getElementById('ax-mesa').dataset; // la bóveda de Obsidian = la carpeta del archivo
    const cards = createCards({ adj, byId, reason, search, state, boveda, publicado });

    // ---------- tarjetas flotantes: resultados (8) o tarjeta abierta (9) (windows.js) ----------
    // de la tarjeta de un proyecto a la Mesa: sus imágenes entran como una capa (en modo Libre), y la tarjeta sigue abierta
    function mesaProyecto(id) { setView('mesa'); if (mx.modo !== 'mesa') setModo('mesa'); go(id); }
    const { openWindow, syncWindows } = initWindows({ byId, state, lit, go, setView, mxFocus, mesaProyecto, cards });

    // ---------- vistas Lista y Carpetas (vistas.js) ----------
    const { renderLista, renderCarpetas } = initVistas({ nodes, byId, state, go, cards });
    // ---------- vista Constelaciones: las constelaciones como un grafo propio (constelas.js) ----------
    const { renderConstelas } = initConstelas({ nodes, byId, state, go });

    // ---------- vista Mesa: imágenes sueltas sobre una mesa de luz ----------
    // Tres cosas distintas que la mesa deja ver a la vez, sin mezclarlas:
    //  · relación  — declarada (imagenes.yaml, tinta) o tirada a mano (hilo, acento)
    //  · semejanza — calculada: color (histograma) + composición (luminancia 8×8)
    //  · cercanía  — la que arma el usuario al acercarlas; con «Contagio» cada
    //                imagen se tiñe del color de sus vecinas, en proporción.
    // Solo lectura respecto de los archivos: todo lo que se hace aquí vive en
    // este navegador (localStorage) y sale por «Exportar», como markdown.
    const mxLines = $('mx-lines'), mxDots = $('mx-dots'), mxPanel = $('mx-panel');
    // Por defecto: solo imágenes de 07-proyectos. Dossier se activa con botón.
    const IMGS = nodes.filter((n) => n.kind === 'imagen' && n.src && !n.parent?.startsWith('pub:'));
    const DOSSIER_IMGS = nodes.filter((n) => n.kind === 'imagen' && n.src && n.parent?.startsWith('pub:'));
    const pendientes = initPendientes({ byId, adj, IMGS }); // lo subido desde la versión publicada, a la espera del próximo índice
    pendientes.cargar();
    body.dataset.mx = mx.modo;
    const { syncBarra } = initBarra({ body, syncTools });
    const yamlRels = new Set(links.filter((l) => l.type === 'relacionada').map((l) => pairKey(idOf(l.source), idOf(l.target))));
    const userRels = new Set(mx.rels);
    const visualRels = new Set(links.filter((l) => l.type === 'visual').map((l) => pairKey(idOf(l.source), idOf(l.target))));
    const { mods } = ms; // el Map nunca se reasigna: el alias es seguro
    env.byId = byId; env.draw = () => mxDraw(); // lo que mesa/layout.js necesita de la página

    const projOf = (n) => (byId.get(n.parent)?.short || n.parent || '');

    // ---------- dibujo de la mesa y panel del par (mesa/draw.js) ----------
    // `imgNb` va diferida: draw.js se inicia antes que capas.js y solo la llama al dibujar
    const { mxSchedule, mxDraw, openPair, closePair } = initDraw({ byId, userRels, yamlRels, visualRels, mxPanel, mxLines, mxDots, projOf, imgNb: (id) => capas.imgNb(id), renderTop: (L) => renderTop(L), lit });

    // ---------- qué hay sobre la mesa: capas, expandir/contraer, foco (mesa/capas.js) ----------
    const capas = initCapas({ IMGS, DOSSIER_IMGS, byId, adj, neighbours, search, userRels, renderTop: (L) => renderTop(L), lit, setQuery, mxSchedule, closePair, syncTools, makeMod: (n, fresh) => interact.makeMod(n, fresh) });
    const { isImg, imgsFromSet, touch, muestraReciente, syncTable, addCapa, removeCapa, salirFoco, mesaAddQuery, buildMesa } = capas;

    // ---------- interacción con los módulos y con la mesa (mesa/interact.js) ----------
    const { abrirFicha, abrirNota, local: notaLocal } = initFicha({ byId, projOf, openWindow: (id) => openWindow(id) });
    const interact = initInteract({ mxDots, projOf, abrirFicha, abrirNota, notaLocal, userRels, openPair, closePair, mxSchedule, renderTop: (L) => renderTop(L), lit, syncTools, state, touch, salirFoco, enfocar: capas.enfocar, toggleExp: capas.toggleExp, quitar: capas.quitar });

    // ---------- constelaciones: armar, guardar y volver a ellas (mesa/constelaciones.js) ----------
    const constel = initConstelaciones({ nodes, byId, search, isImg, addCapa, mxPanel, closePair, syncTools, openWindow, setView, setModo: (m) => setModo(m) });

    // ---------- la fila de arriba: ruta, filtros, capas y foco (top.js) ----------
    const { renderTop } = initTop({ nodes, byId, neighbours, state, go, pop, reset, render, mesaResumen, setModo: (m) => setModo(m), capas, constel });
    // en la galería «ordenar» es un criterio que queda marcado; en la mesa, una acción de una vez
    function ordenar(kind) {
      if (mx.modo === 'galeria') { mx.galOrden = kind; saveMx(); syncTools(); renderGaleria(lit()); return; }
      ordenarMesa(kind);
    }
    document.querySelectorAll('[data-mx-orden]').forEach((b) => b.onclick = () => ordenar(b.dataset.mxOrden));
    document.querySelectorAll('[data-mx-capa]').forEach((b) => b.onclick = () => { mx[b.dataset.mxCapa] = !mx[b.dataset.mxCapa]; saveMx(); syncTools(); mxSchedule(); });
    function syncTools() {
      document.querySelectorAll('[data-mx-capa]').forEach((b) => b.classList.toggle('on', !!mx[b.dataset.mxCapa]));
      document.querySelectorAll('[data-mx-modo]').forEach((b) => b.classList.toggle('on', b.dataset.mxModo === mx.modo));
      // en la galería, «ordenar» es un criterio que queda marcado; en la mesa, una acción de una vez
      document.querySelectorAll('[data-mx-orden]').forEach((b) => b.classList.toggle('on', mx.modo === 'galeria' && b.dataset.mxOrden === mx.galOrden));
      $('mx-tam').value = mx.tam;
      body.dataset.foco = mx.foco ? '1' : '';
      document.querySelectorAll('[data-mx-rel]').forEach((b) => b.classList.toggle('on', b.dataset.mxRel === mx.rel));
      document.querySelectorAll('[data-mx-lcapa]').forEach((b) => { const k = b.dataset.mxLcapa; b.classList.toggle('on', k === 'hilos' ? !!mx.hilos : mx.lcapa[k] !== false); });
      $('mx-dossier')?.classList.toggle('on', mx.capas.some((c) => c.id === 'dossier'));
      syncBarra(); // lo que no aplica en este modo, el resumen de «ver» y la cuenta de lo elegido
    }

    // Dossier: las imágenes publicadas entran como una capa más
    $('mx-dossier').onclick = () => {
      if (mx.capas.some((c) => c.id === 'dossier')) return removeCapa('dossier');
      addCapa('Dossier', DOSSIER_IMGS.slice(0, 150).map((n) => n.id), { id: 'dossier', total: DOSSIER_IMGS.length });
    };
    $('mx-recientes').onclick = () => { const m = muestraReciente(); addCapa(m.label, m.ids, { id: 'recientes' }); };
    document.querySelectorAll('[data-mx-rel]').forEach((b) => b.onclick = () => { mx.rel = b.dataset.mxRel; saveMx(); syncTools(); mxSchedule(); });
    document.querySelectorAll('[data-mx-lcapa]').forEach((b) => b.onclick = () => {
      const k = b.dataset.mxLcapa;
      if (k === 'hilos') mx.hilos = !mx.hilos; else mx.lcapa[k] = mx.lcapa[k] === false;
      saveMx(); syncTools(); mxSchedule();
    });

    initExport({ byId, userRels, mxPanel, closePair }); // Exportar (mesa/export.js)

    // llegar a una imagen desde su tarjeta
    function mxFocus(id) {
      if (!ms.built) buildMesa();
      // si no está sobre la mesa, entra como fija y se encuadra
      if (!mods.has(id) && isImg(id)) { if (!mx.fijas.includes(id)) mx.fijas.push(id); syncTable({ fit: [id] }).then(() => { if (mods.has(id)) { ms.sel = id; mxSchedule(); } }); return; }
      if (!mods.has(id)) return;
      const r = rectOf(id), [x, y] = center(r);
      mx.view.x = vp.W / 2 - x * mx.view.k; mx.view.y = vp.H / 2 + 40 - y * mx.view.k;
      applyView(); ms.sel = id; mods.get(id).style.zIndex = ++ms.z; mxSchedule();
    }

    function mesaResumen() {
      const projs = new Set([...mods.keys()].map((id) => byId.get(id)?.parent)).size;
      const hilos = [...userRels].filter((k) => k.split('||').every((id) => mods.has(id))).length;
      const notas = Object.keys(mx.notes).length;
      return [`${mods.size} sobre la mesa · ${IMGS.length} en el archivo`, projs ? `${projs} proyecto${projs === 1 ? '' : 's'}` : '',
        hilos ? `${hilos} hilo${hilos === 1 ? '' : 's'} tuyo${hilos === 1 ? '' : 's'}` : '',
        notas ? `${notas} nota${notas === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    }
    // ---------- Galería (mesa/galeria.js) ----------
    // al volver a Libre: si hay imágenes sobre la mesa pero ninguna cae a la vista (quedó corrida, o detrás de la barra), encuadrarlas
    function asomar() {
      const tope = vp.H - ($('mx-barra').offsetHeight || 0);
      const seVe = (el) => { const r = el.getBoundingClientRect(); return r.width && r.right > 0 && r.left < vp.W && r.bottom > 0 && r.top + r.height / 2 < tope; };
      if (mods.size && ![...mods.values()].some(seVe)) fitView([...mods.keys()]);
    }
    const { setModo, renderGaleria } = initGaleria({ IMGS, byId, state, body, lit, closePair, mxSchedule, syncTools, mxFocus, go, projOf, asomar, abrirFicha, abrirNota, notaLocal });

    function renderMesa(L) {
      if (state.view !== 'mesa') return;
      if (!ms.built) buildMesa();
      // la búsqueda y el foco de arriba siguen valiendo aquí: lo que no resuena se atenúa
      // solo una búsqueda a medio escribir atenúa: lo que resuena se ve, lo demás espera
      const Lm = state.q && !state.path.length && L ? new Set([...L, ...imgsFromSet(L, Infinity).ids]) : null;
      for (const [id, el] of mods) el.classList.toggle('dim', !!Lm && !Lm.has(id));
      mxSchedule();
      renderGaleria(L);
    }

    // ---------- sugerencias, modos, vistas ----------
    $('ax-sug').innerHTML = concepts.slice().sort((a, b) => b.count - a.count).slice(0, 8)
      .map((c, i) => `<button type="button" class="ax-pill lg ${i === 0 ? 'accent' : ''}" data-go="${esc(c.id)}">${esc(c.short)}</button>`).join('');
    $('ax-sug').querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { const n = byId.get(b.dataset.go); q.value = n.short.toLowerCase(); $('ax-qtype').hidden = false; $('ax-qtype').textContent = 'Concepto'; state.q = q.value; go(n.id, true); });

    nodeSel.on('click', (e, n) => { e.stopPropagation(); if (body.dataset.state === 'inicio') { state.q = n.short; q.value = n.short.toLowerCase(); } go(n.id); });
    // clic en un área = clic en su concepto
    blobSel.on('click', (e, b) => { e.stopPropagation(); if (body.dataset.state === 'inicio') { state.q = b.c.short; q.value = b.c.short.toLowerCase(); } go(b.c.id); });
    function setView(v) {
      document.querySelectorAll('.ax-views [data-view]').forEach((x) => x.classList.toggle('on', x.dataset.view === v));
      state.view = v; render(300);
    }
    document.querySelectorAll('.ax-views [data-view]').forEach((b) => b.onclick = () => setView(b.dataset.view));
    addEventListener('resize', () => { vp.W = innerWidth; vp.H = innerHeight; layout(state.mode); render(0); });

    document.querySelectorAll('[data-detail]').forEach((b) => b.onclick = () => setDetail(+b.dataset.detail));
    layout(state.mode);
    render(0);
    // «Subir imagen» (solo en local); si la página viene de una subida, vuelve a la mesa con lo nuevo encima
    initSubir({ byId, setView, setModo: (m) => setModo(m), addCapa, pendientes }).retomar();
    initCatalogar({ nodes, cerrarMenu: () => { $('ax-fab-menu').hidden = true; $('ax-fab-btn').setAttribute('aria-expanded', 'false'); } });
    constel.retomar(); // lo mismo tras guardar una constelación
    initChat({ byId, search, state, ms, mx, go }); // «Conversar» con un modelo local (solo en local)
    initAjustes(); // «Ajustes» (solo en local)
  })();
