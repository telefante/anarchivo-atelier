// Anarchivo — la vista Constelaciones: todas las constelaciones (09-constelaciones/) como un grafo propio.
// Cada una es un nodo con sus imágenes (en miniatura) y sus textos alrededor; lo que dos constelaciones
// comparten queda entre ambas. A la izquierda, la lista. Un clic abre el nodo, como en Carpetas.
// Es un SVG aparte del grafo grande: no toca sus nodos ni su física (aquí cada nodo es una copia con su x/y).
// `initConstelas(ctx)` devuelve su render; la página lo llama en cada render() y solo dibuja al entrar a la vista.
import * as d3 from 'd3';
import { $, esc } from './util.js';
import { srcOf, capOf } from './data.js';

const TH = 46; // lado de la miniatura

// ctx: datos (nodes, byId), state y `go` (abrir un nodo)
export function initConstelas({ nodes, byId, state, go }) {
  const cs = nodes.filter((n) => n.kind === 'constelacion')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  let dentro = false;

  function build(el) {
    if (!cs.length) {
      el.innerHTML = '<p class="ax-muted ax-cg-vacio">— todavía no hay constelaciones: se arman en la Mesa (⌘/Ctrl+clic sobre las imágenes, «+ Constelación») —</p>';
      return;
    }
    el.innerHTML = `<svg></svg><div class="ax-cg-lista">${cs.map((c) => `
      <button type="button" class="ax-item" data-go="${esc(c.id)}"><b>${esc(c.title)}${c.date ? ` <i>${esc(c.date)}</i>` : ''}</b><span>${c.imagenes.length} imágenes · ${c.textos.length} enlaces</span></button>`).join('')}</div>`;
    el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));

    const W = el.clientWidth, H = el.clientHeight;
    // centros: una rejilla que reparte las constelaciones por el panel (a la derecha de la lista)
    const x0 = Math.min(280, W * 0.3), cols = Math.max(1, Math.ceil(Math.sqrt(cs.length * (W - x0) / H))), rows = Math.ceil(cs.length / cols);
    const centro = new Map(cs.map((c, i) => [c.id, [x0 + (W - x0) * ((i % cols) + 0.5) / cols, H * (Math.floor(i / cols) + 0.5) / rows]]));

    const ns = new Map(), ls = [];
    const nodo = (n) => ns.get(n.id) || (ns.set(n.id, { id: n.id, n, de: [] }), ns.get(n.id));
    for (const c of cs) {
      nodo(c).de.push(c.id);
      for (const id of [...c.imagenes, ...c.textos]) {
        const m = byId.get(id);
        if (!m) continue;
        nodo(m).de.push(c.id);
        ls.push({ source: c.id, target: id });
      }
    }
    const N = [...ns.values()];
    // cada nodo tira hacia el centro de su constelación; el que está en varias, hacia el medio de ellas
    N.forEach((d) => {
      d.cx = d3.mean(d.de, (c) => centro.get(c)[0]); d.cy = d3.mean(d.de, (c) => centro.get(c)[1]);
      d.x = d.cx + (Math.random() - 0.5) * 60; d.y = d.cy + (Math.random() - 0.5) * 60;
    });
    const esC = (d) => d.n.kind === 'constelacion', esImg = (d) => d.n.kind === 'imagen' && d.n.src;
    d3.forceSimulation(N).stop()
      .force('link', d3.forceLink(ls).id((d) => d.id).distance(120).strength(0.5))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('collide', d3.forceCollide().radius((d) => (esImg(d) ? TH * 0.75 : esC(d) ? 40 : 30)))
      .force('x', d3.forceX((d) => d.cx).strength((d) => (esC(d) ? 0.5 : 0.06)))
      .force('y', d3.forceY((d) => d.cy).strength((d) => (esC(d) ? 0.5 : 0.06)))
      .tick(300);

    const svg = d3.select(el).select('svg');
    const root = svg.append('g');
    svg.call(d3.zoom().scaleExtent([0.4, 4]).on('zoom', (e) => root.attr('transform', e.transform)));
    root.append('g').selectAll('line').data(ls).join('line').attr('class', 'ax-l constela')
      .attr('x1', (l) => l.source.x).attr('y1', (l) => l.source.y).attr('x2', (l) => l.target.x).attr('y2', (l) => l.target.y);
    const g = root.append('g').selectAll('g').data(N).join('g')
      .attr('class', (d) => `ax-n ax-cg-n ${d.n.kind}`).attr('transform', (d) => `translate(${d.x},${d.y})`)
      .on('click', (e, d) => go(d.id));
    g.append('title').text((d) => (d.n.kind === 'imagen' ? capOf(d.n) : d.n.title));
    const im = g.filter(esImg);
    im.append('image').attr('href', (d) => srcOf(d.n)).attr('x', -TH / 2).attr('y', -TH / 2).attr('width', TH).attr('height', TH)
      .attr('preserveAspectRatio', 'xMidYMid slice');
    im.append('rect').attr('class', 'marco').attr('x', -TH / 2).attr('y', -TH / 2).attr('width', TH).attr('height', TH).attr('rx', 6);
    const pt = g.filter((d) => !esImg(d));
    pt.append('circle').attr('class', 'shape').attr('r', (d) => (esC(d) ? 9 : 5));
    pt.append('text').attr('x', (d) => (esC(d) ? 0 : 10)).attr('y', (d) => (esC(d) ? -18 : null)).attr('dy', (d) => (esC(d) ? null : '0.35em'))
      .attr('text-anchor', (d) => (esC(d) ? 'middle' : null)).text((d) => d.n.short || d.n.title);
  }

  function renderConstelas() {
    const el = $('ax-constelas');
    if (state.view !== 'constelaciones') { if (dentro) { el.innerHTML = ''; dentro = false; } return; }
    if (dentro) return; // ya está dibujado: enfocar un nodo no lo rehace
    dentro = true;
    build(el);
  }

  return { renderConstelas };
}
