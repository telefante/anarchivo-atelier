// Anarchivo — el grafo d3: nodos y enlaces, los dos layouts (anarchivo = conjuntos · archivo = tiempo),
// la posición según el foco (vecinos en anillo) y el arrastre de nodos y de áreas.
// «Anarchivo» dibuja cada concepto como un área (casco de sus miembros) — un proyecto con varios
// conceptos queda en la intersección. La física sigue viva: arrastrar un área mueve su concepto
// y los miembros la siguen.
// `initGraph(ctx)` crea el SVG y devuelve lo que la página necesita: los nodos (para el clic), `layout` y `renderGraph`.
import * as d3 from 'd3';
import { isMobile, vp } from './util.js';

// ctx: datos (nodes, links, byId, adj, neighbours), state, body, `lit` (el conjunto «encendido» que calcula la página)
// y `up` (hacia arriba: salir del foco un paso, hasta volver a las áreas)
export function initGraph({ nodes, links, byId, adj, neighbours, state, body, lit, up }) {
  const svg = d3.select('#ax-graph');
  const root = svg.append('g');
  // zoom semántico: acercar/alejar también cambia el nivel de detalle (ver setDetail)
  let kBase = 1;
  const zoom = d3.zoom().scaleExtent([0.4, 3]).on('zoom', (e) => {
    root.attr('transform', e.transform);
    const k = e.transform.k;
    // en el teléfono el pellizco solo acerca y aleja: cambiar de nivel o salir del foco con los dedos pasaba
    // sin querer, y para eso están Figura · Obra · Todo y «◂ Todo»
    if (isMobile()) return;
    if (k > kBase * 1.35 && state.detail < 2) { kBase = k; setDetail(state.detail + 1, true); }
    // alejar con un foco abierto es salir de él: el foco manda sobre el nivel (lo encendido se ve siempre)
    else if (k < kBase / 1.35 && state.path.length) { kBase = k; up(); }
    else if (k < kBase / 1.35 && state.detail > 0) { kBase = k; setDetail(state.detail - 1, true); }
  });
  // en el teléfono: un dedo desplaza, dos dedos amplían (zoom geométrico, sin cambiar de nivel: ver arriba)
  zoom.filter((e) => (!e.ctrlKey || e.type === 'wheel') && !e.button && !(isMobile() && e.type === 'wheel'));
  svg.call(zoom).on('dblclick.zoom', null);
  // clic en el fondo (nodos y áreas frenan su propio clic): un paso hacia arriba
  svg.on('click', () => { if (state.path.length) up(); });
  const gBlobs = root.append('g');
  const gLinks = root.append('g');
  const gHalo = root.append('g');
  const gNodes = root.append('g');

  // lenguaje visual de /grafo: islas de concepto por tamaño, dos niveles de
  // color (proyecto vivo = acento, registro/obra = apagado), siempre visibles
  // — no grises hasta buscar; el foco se atenúa lo demás, como allá.
  const QUIET = new Set(['publicado', 'bitacora', 'ensayo', 'convocatoria', 'imagen']);
  const r = (n) => n.kind === 'concepto' ? 5
    : (n.kind === 'activo' || n.kind === 'laboratorio') ? 7 : (n.kind === 'artefacto' || n.kind === 'constelacion') ? 5 : 3.5;
  // radio de colisión de un concepto: crece con su cantidad de miembros, pero se deja solapar (conjuntos)
  const cr = (n) => (30 + Math.sqrt(n.count) * 14) * 0.85;
  const sgnOf = (i) => (i % 2 ? 1 : -1);

  // áreas: un casco por concepto con sus miembros directos (obras, proyectos; no imágenes ni entradas)
  const eid = (x) => (typeof x === 'object' ? x.id : x);
  // los enlaces `visual` no entran en la física (ver layout), así que forceLink no los resuelve:
  // se pasan a objetos aquí, una vez, para que draw/applyDetail los traten igual que al resto
  links.forEach((l) => { l.source = byId.get(eid(l.source)); l.target = byId.get(eid(l.target)); });
  const AREA = new Set(['activo', 'publicado', 'laboratorio']);
  const blobs = nodes.filter((n) => n.kind === 'concepto').map((c) => ({ c, members: [] })).sort((a, b) => b.c.count - a.c.count);
  const blobOf = new Map(blobs.map((b) => [b.c.id, b]));
  links.filter((l) => l.type === 'concepto').forEach((l) => {
    const [a, b] = [eid(l.source), eid(l.target)];
    const bl = blobOf.get(a) || blobOf.get(b), m = byId.get(blobOf.has(a) ? b : a);
    if (bl && m && AREA.has(m.kind)) bl.members.push(m);
  });
  // un proyecto con varios conceptos se siente atraído sobre todo por el más específico (el de menos miembros);
  // los demás tiran poco: así cada área conserva un núcleo propio y el solape queda en los bordes
  const conceptOf = (l) => (l.source.kind === 'concepto' ? l.source : l.target);
  const W_RANK = [0.4, 0.16, 0.07, 0.05, 0.05];
  const byOwner = new Map();
  links.filter((l) => l.type === 'concepto').forEach((l) => {
    const o = (l.source.kind === 'concepto' ? l.target : l.source).id;
    if (!byOwner.has(o)) byOwner.set(o, []);
    byOwner.get(o).push(l);
  });
  byOwner.forEach((ls) => ls.sort((a, b) => conceptOf(a).count - conceptOf(b).count).forEach((l, i) => { l.w = W_RANK[Math.min(i, 4)]; }));
  const blobSel = gBlobs.selectAll('path').data(blobs).join('path').attr('class', 'ax-blob');
  blobSel.append('title').text((b) => `${b.c.title} · ${b.c.count}`);
  const PAD = 20;
  const hullLine = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));
  // casco suavizado: cada punto se infla a un círculo de PAD px (ocho puntos) y se envuelve
  function blobPath(b) {
    const pts = [];
    // sin los más lejanos (15 %): un proyecto atado a otros conceptos no debe estirar el área hasta el otro lado
    const [cx, cy] = pos.get(b.c.id);
    const dist = (n) => { const [x, y] = pos.get(n.id); return Math.hypot(x - cx, y - cy); };
    let ms = b.members;
    if (ms.length > 6) { const lim = d3.quantile(ms.map(dist).sort(d3.ascending), 0.85); ms = ms.filter((n) => dist(n) <= lim); }
    [b.c, ...ms].forEach((n) => {
      const [x, y] = pos.get(n.id);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; pts.push([x + PAD * Math.cos(a), y + PAD * Math.sin(a)]); }
    });
    const hull = d3.polygonHull(pts);
    b.area = hull ? d3.polygonArea(hull) : 1;
    return hull ? hullLine(hull) : null;
  }

  const linkSel = gLinks.selectAll('path').data(links).join('path').attr('class', (l) => `ax-l ${l.type}`);
  const halo = gHalo.append('circle').attr('class', 'ax-halo').attr('r', 26).style('display', 'none');
  const nodeSel = gNodes.selectAll('g').data(nodes).join('g').attr('class', (n) => `ax-n ${n.kind}${QUIET.has(n.kind) ? ' q' : ''}`);
  // zona de toque invisible: un punto de 3,5 px no se acierta con el dedo
  nodeSel.append('circle').attr('class', 'hit').attr('r', (n) => Math.max(r(n) + 4, 12));
  nodeSel.append('circle').attr('class', 'shape').attr('r', r);
  // los «silenciosos» también llevan texto, pero solo se ve cuando están encendidos (foco o búsqueda)
  nodeSel.append('text')
    .attr('class', 'ax-lbl').attr('x', (n) => n.kind === 'concepto' ? 0 : r(n) + 6)
    .attr('y', (n) => n.kind === 'concepto' ? -12 : null).attr('dy', (n) => n.kind === 'concepto' ? null : '0.35em')
    .text((n) => n.kind === 'concepto' ? n.short.toUpperCase() : n.short);
  nodeSel.append('title').text((n) => n.title + (n.year ? ` · ${n.year}` : ''));

  // ---------- layouts: anarchivo (fuerzas) · archivo (tiempo) ----------
  const years = nodes.map((n) => +String(n.year || n.date || '').slice(0, 4)).filter((y) => y > 1990);
  const yScale = d3.scaleLinear().domain([d3.min(years) || 2000, d3.max(years) || 2026]).range([0.12, 0.88]);
  const BAND = { concepto: 0.18, constelacion: 0.3, activo: 0.42, publicado: 0.58, artefacto: 0.63, laboratorio: 0.68, ensayo: 0.78, bitacora: 0.86, convocatoria: 0.92 };
  let sim; // referencia viva — el drag la reactiva (alphaTarget/restart), como en /grafo
  function layout(mode) {
    nodes.forEach((n, i) => { const a = i * 2.39996, d = 10 * Math.sqrt(i); n.x = vp.W / 2 + d * Math.cos(a); n.y = vp.H / 2 + d * Math.sin(a); });
    if (sim) sim.stop();
    // las 1263 relaciones visuales (CLIP) no entran en la física: dominaban la figura y no son estructura
    const phys = links.filter((l) => l.type !== 'visual');
    const big = (n) => n.kind === 'activo' || n.kind === 'laboratorio';
    sim = d3.forceSimulation(nodes).stop()
      .force('link', d3.forceLink(phys).id((n) => n.id)
        .distance((l) => l.type === 'concepto' ? 26 + Math.sqrt(conceptOf(l).count) * 7 : l.type === 'pertenece' ? 20 : 70)
        .strength((l) => mode === 'archivo' ? 0.02 : l.type === 'concepto' ? l.w : l.type === 'pertenece' ? 0.6 : 0.12))
      .force('charge', d3.forceManyBody().strength((n) => n.kind === 'concepto' ? -4500 : big(n) ? -140 : n.kind === 'imagen' ? -6 : -25).distanceMax(1000))
      .force('collide', d3.forceCollide().radius((n) => n.kind === 'concepto' ? cr(n) : big(n) ? r(n) + 14 : r(n) + 4));
    if (mode === 'archivo') {
      sim.force('x', d3.forceX((n) => { const y = +String(n.year || n.date || '').slice(0, 4); return (y > 1990 ? yScale(y) : 0.5) * vp.W; }).strength(0.6))
         .force('y', d3.forceY((n) => BAND[n.kind] * vp.H).strength(0.5));
    } else {
      // los nodos sin vínculos (entradas que no mencionan nada) se quedan cerca, no empujan el marco
      const deg = (n) => adj.get(n.id).length;
      sim.force('x', d3.forceX(vp.W / 2).strength((n) => deg(n) ? 0.03 : 0.12))
         .force('y', d3.forceY(vp.H / 2).strength((n) => deg(n) ? 0.045 : 0.16));
    }
    sim.tick(400);
    // encajar en el viewport
    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
    xs.sort(d3.ascending); ys.sort(d3.ascending);
    const [x0, x1, y0, y1] = [d3.quantile(xs, 0.02), d3.quantile(xs, 0.98), d3.quantile(ys, 0.02), d3.quantile(ys, 0.98)];
    const k = Math.min((vp.W - 200) / (x1 - x0 || 1), (vp.H - 220) / (y1 - y0 || 1));
    const ox = (vp.W - (x1 - x0) * k) / 2, oy = 110 + (vp.H - 220 - (y1 - y0) * k) / 2;
    nodes.forEach((n) => { n.bx = ox + (n.x - x0) * k; n.by = oy + (n.y - y0) * k; n.x = n.bx; n.y = n.by; n.vx = 0; n.vy = 0; });
    // recién ahora se engancha el tick en vivo — si se conecta antes, las
    // 300 vueltas del precálculo de arriba redibujan de más, para nada.
    // Mientras la simulación está en reposo (alpha en 0) esto no dispara
    // nunca; el drag es quien la reactiva — igual que en /grafo.
    sim.on('tick', () => {
      nodes.forEach((n) => { n.bx = n.x; n.by = n.y; });
      place(state.path.at(-1));
      draw(0);
    });
  }

  // posiciones según estado: en foco, los vecinos se ordenan en anillo
  const pos = new Map();
  function place(focusId) {
    pos.clear();
    nodes.forEach((n) => pos.set(n.id, [n.bx, n.by]));
    if (!focusId) return;
    const f = byId.get(focusId);
    // en el teléfono el grafo ocupa toda la pantalla, pero arriba están el buscador y la ruta y abajo las
    // vistas y la hoja de la tarjeta: el foco se centra en el espacio libre entre ambos y el anillo se ajusta
    // al ancho, para que ningún vecino nazca fuera de la pantalla.
    const mini = isMobile() && body.dataset.view === 'grafo';
    // las tarjetas flotan libres (el usuario las corre); solo se reserva un
    // margen orientativo para que el anillo no nazca tapado por la primera.
    const reserve = !mini && body.dataset.view === 'grafo' ? 380 : 0;
    const cx = mini ? vp.W * 0.5 : (vp.W - reserve) * 0.46;
    const cy = mini ? 190 + (vp.H - 190 - 110) * 0.45 : vp.H * 0.55; // entre la fila de arriba (~190px) y las vistas (~110px)
    const dx = cx - f.bx, dy = cy - f.by;
    nodes.forEach((n) => pos.set(n.id, [n.bx + dx, n.by + dy]));
    const L = lit();
    const ns = neighbours(focusId).filter((id) => !L || L.has(id));
    const R = mini ? Math.min(vp.W * 0.36, (vp.H - 300) * 0.4) : Math.min(320, Math.max(230, 60 + ns.length * 14), (vp.H - 260) / 2);
    ns.map((id) => byId.get(id))
      .map((m) => ({ m, a: Math.atan2(m.by - f.by, m.bx - f.bx) }))
      .sort((a, b) => a.a - b.a)
      .forEach(({ m }, i, arr) => {
        const a = -Math.PI / 2 + (i / arr.length) * Math.PI * 2;
        const r = R * (arr.length > 14 ? (i % 2 ? 1 : 0.72) : 1);
        pos.set(m.id, [cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      });
    pos.set(focusId, [cx, cy]);
  }
  function draw(t = 0) {
    const sel = t ? nodeSel.transition().duration(t) : nodeSel;
    sel.attr('transform', (n) => `translate(${pos.get(n.id)[0]},${pos.get(n.id)[1]})`);
    const ls = t ? linkSel.transition().duration(t) : linkSel;
    // hilos curvos y tenues (como en la referencia): una curva cuadrática, curvatura fija por enlace
    ls.attr('d', (l, i) => {
      const [x1, y1] = pos.get(l.source.id), [x2, y2] = pos.get(l.target.id);
      const dx = x2 - x1, dy = y2 - y1, amt = 0.14 * sgnOf(i);
      return `M${x1},${y1}Q${(x1 + x2) / 2 - dy * amt},${(y1 + y2) / 2 + dx * amt} ${x2},${y2}`;
    });
    // áreas: siguen a sus miembros en vivo; con foco se retiran (los vecinos van en anillo)
    blobSel.attr('d', blobPath);
    const dens = d3.max(blobs, (b) => b.members.length / (b.area || 1)) || 1;
    blobSel.style('--d', (b) => ((b.members.length / (b.area || 1)) / dens).toFixed(2));
    const f = state.path.at(-1);
    if (f) { const [x, y] = pos.get(f); (t ? halo.transition().duration(t) : halo).attr('cx', x).attr('cy', y); }
  }

  // arrastrar un nodo — como en /grafo: mueve su posición base (bx/by),
  // así que se sostiene entre renders, hasta el próximo layout()/foco que
  // recalcule desde cero (d3.drag no pisa el click: solo suprime el click
  // cuando hubo arrastre real).
  // arrastrar despierta la simulación (como en /grafo): mientras dura, las
  // fuerzas de enlace y repulsión siguen vivas — los vecinos reaccionan,
  // se apartan, y al soltar decantan solos en vez de quedarse rígidos.
  // un área se arrastra por su concepto: el casco la sigue y los miembros, atados por los enlaces `concepto`, también
  // con el dedo las áreas no se arrastran: ocupan casi toda la pantalla y se tragarían el desplazar y el pellizco
  // (d3.drag frena el toque antes de que llegue al zoom). Un nodo sí se arrastra con el dedo; un área, con el ratón.
  const dragOf = (nodeOf, lift) => d3.drag()
    .filter((e) => !e.ctrlKey && !e.button && (lift || !e.type.startsWith('touch')))
    // el ancla tiene que ser la posición REAL en pantalla (pos, que puede
    // estar reordenada en anillo si hay foco) — no n.x/n.y viejos.
    .subject((e, d) => { const n = nodeOf(d); const [x, y] = pos.get(n.id) || [n.bx, n.by]; return { x, y }; })
    .on('start', function (e, d) {
      const n = nodeOf(d);
      if (lift) d3.select(this).raise();
      n.x = n.bx; n.y = n.by;
      if (!e.active) sim.alphaTarget(0.2).restart();
      n.fx = n.x; n.fy = n.y;
    })
    .on('drag', (e, d) => { const n = nodeOf(d); n.fx = e.x; n.fy = e.y; })
    .on('end', (e, d) => {
      const n = nodeOf(d);
      if (!e.active) sim.alphaTarget(0);
      n.fx = null; n.fy = null;
    });
  nodeSel.call(dragOf((n) => n, true));
  blobSel.call(dragOf((b) => b.c, false));

  // estado visual del grafo según el foco f y el conjunto encendido L: como en /grafo, todo se ve coloreado
  // siempre; enfocar solo atenúa (dim) lo que no resuena, no apaga el mundo hasta que buscás algo.
  // niveles de detalle: 0 figura (conceptos + proyectos, sin etiquetas de proyecto) ·
  // 1 + obra publicada y laboratorio · 2 todo (bitácora, ensayos, convocatorias, imágenes).
  // Lo que está en el foco o en la búsqueda se ve siempre, sea cual sea el nivel.
  const SHOWN = [new Set(['concepto', 'activo']), new Set(['concepto', 'activo', 'publicado', 'artefacto', 'laboratorio', 'constelacion'])];
  let last = { L: null, f: null };
  function setDetail(d, fromZoom) {
    state.detail = d;
    if (!fromZoom) kBase = d3.zoomTransform(svg.node()).k;
    document.querySelectorAll('[data-detail]').forEach((b) => b.classList.toggle('on', +b.dataset.detail === d));
    applyDetail();
  }
  function applyDetail() {
    const { L } = last, d = state.detail;
    const vis = (n) => d >= 2 || SHOWN[d].has(n.kind) || !!(L && L.has(n.id));
    svg.attr('class', `lv${d}${L ? ' lit' : ''}`);
    nodeSel.classed('hid', (n) => !vis(n));
    linkSel.classed('hid', (l) => !vis(l.source) || !vis(l.target));
  }
  function renderGraph(L, f, t) {
    last = { L, f };
    applyDetail();
    nodeSel.classed('dim', (n) => !!L && !L.has(n.id)).classed('focus', (n) => n.id === f);
    linkSel.classed('dim', (l) => !!L && !(L.has(l.source.id) && L.has(l.target.id)));
    blobSel.classed('dim', (b) => !!L && !L.has(b.c.id)).classed('away', !!f);
    halo.style('display', f ? null : 'none');
    place(f);
    draw(t);
  }

  return { nodeSel, blobSel, layout, renderGraph, setDetail };
}
