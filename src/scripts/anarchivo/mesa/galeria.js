// Anarchivo · Mesa — Galería: todas las imágenes a la vista, y el lightbox.
// Filas sin recortar (cada imagen a la misma altura, su ancho propio),
// agrupadas por proyecto — o, «por semejanza», una secuencia donde cada
// imagen se parece a la anterior (desde la elegida): un montaje, no un orden.
// `initGaleria(ctx)` cablea los botones Mesa/Galería, el tamaño y el lightbox, y devuelve lo que la página llama.
import * as d3 from 'd3';
import { $, esc, clamp } from '../util.js';
import { srcOf, capOf } from '../data.js';
import { mx, saveMx, ms } from './state.js';
import { semejanza, pct } from './semejanza.js';

// ctx: lo que viene de la página — datos (IMGS, byId), estado (state, body) y las llamadas hacia arriba
export function initGaleria({ IMGS, byId, state, body, lit, closePair, mxSchedule, syncTools, mxFocus, go, projOf, asomar, abrirFicha, abrirNota, notaLocal }) {
  const { feats } = ms;
  const galEl = $('mx-galeria'), lb = $('mx-lb');
  let galSeq = [], lbIdx = -1;
  function setModo(m) {
    mx.modo = m; body.dataset.mx = m; saveMx(); syncTools();
    if (m === 'galeria') { closePair(); renderGaleria(lit()); } else { closeLb(); mxSchedule(); asomar(); }
  }
  document.querySelectorAll('[data-mx-modo]').forEach((b) => b.onclick = () => setModo(b.dataset.mxModo));
  $('mx-tam').addEventListener('input', (e) => {
    mx.tam = +e.target.value; galEl.style.setProperty('--gh', mx.tam + 'px');
    clearTimeout(galEl._t); galEl._t = setTimeout(saveMx, 300);
  });
  function secuencia() {
    const rest = IMGS.filter((n) => feats.has(n.id)), sin = IMGS.filter((n) => !feats.has(n.id));
    if (!rest.length) return IMGS.slice();
    let cur = rest.find((n) => n.id === ms.sel) || rest[0];
    const out = [cur];
    rest.splice(rest.indexOf(cur), 1);
    while (rest.length) {
      let bi = 0, bs = -1;
      rest.forEach((n, i) => { const s = semejanza(cur.id, n.id).total; if (s > bs) { bs = s; bi = i; } });
      cur = rest.splice(bi, 1)[0];
      out.push(cur);
    }
    return out.concat(sin);
  }
  function renderGaleria(L) {
    if (state.view !== 'mesa' || mx.modo !== 'galeria') return;
    galEl.style.setProperty('--gh', mx.tam + 'px');
    // los mismos ⋯ (proyecto, archivo, Finder) y ✎ (nota) que en modo Libre
    const fig = (n, extra = '') => `<figure class="mx-fig${L && !L.has(n.id) ? ' dim' : ''}${n.id === ms.sel ? ' sel' : ''}${n.nota ? ' con-nota' : ''}" data-id="${esc(n.id)}">
      <button type="button" class="mx-i" title="Proyecto y archivo">⋯</button>
      <button type="button" class="mx-n" title="Nota de la imagen" ${!notaLocal && !n.nota ? 'hidden' : ''}>✎</button>
      <img src="${srcOf(n)}" alt="${esc(n.title)}" loading="lazy" draggable="false"${mx.pos[n.id]?.ar ? ` style="aspect-ratio: 1 / ${mx.pos[n.id].ar}"` : ''} />
      <figcaption><b>${esc(capOf(n))}</b><span>${esc(projOf(n))}</span>${extra}</figcaption></figure>`;
    if (!IMGS.length) { galEl.innerHTML = '<p class="ax-muted">Todavía no hay imágenes catalogadas.</p>'; return; }
    if (mx.galOrden === 'semejanza') {
      galSeq = secuencia();
      galEl.innerHTML = `<section><span class="ax-kicker ink">Secuencia por semejanza · desde ${esc(capOf(galSeq[0]))}</span><div class="mx-fila">` +
        galSeq.map((n, i) => {
          const s = i ? semejanza(galSeq[i - 1].id, n.id) : null;
          return (i ? `<span class="mx-eslabon" title="semejanza con la anterior">${s ? '≈ ' + pct(s.total) : '·'}</span>` : '') + fig(n);
        }).join('') + '</div></section>';
    } else {
      const groups = d3.groups(IMGS, (n) => n.parent);
      galSeq = groups.flatMap(([, ns]) => ns);
      galEl.innerHTML = groups.map(([p, ns]) => `<section><span class="ax-kicker ink">${esc(byId.get(p)?.title || p)} · ${ns.length}</span>
        <div class="mx-fila">${ns.map((n) => fig(n, [n.fecha, ...(n.tags || [])].filter(Boolean).length ? `<i>${esc([n.fecha, ...(n.tags || [])].filter(Boolean).join(' · '))}</i>` : '')).join('')}</div></section>`).join('');
    }
    galEl.querySelectorAll('.mx-fig').forEach((f) => {
      f.onclick = () => openLb(galSeq.findIndex((n) => n.id === f.dataset.id));
      const ib = f.querySelector('.mx-i'), nb = f.querySelector('.mx-n');
      ib.onclick = (e) => { e.stopPropagation(); abrirFicha(f.dataset.id, ib); };
      nb.onclick = (e) => { e.stopPropagation(); abrirNota(f.dataset.id, nb); };
    });
  }
  // una imagen en grande: ← → recorren la galería en su orden actual
  function openLb(i) {
    const n = galSeq[i];
    if (!n) return;
    lbIdx = i; lb.hidden = false;
    const prev = galSeq[i - 1], s = prev && mx.galOrden === 'semejanza' ? semejanza(prev.id, n.id) : null;
    lb.innerHTML = `<button type="button" class="ax-close mx-lb-x" data-lb="x" aria-label="Cerrar">×</button>
      <button type="button" class="mx-lb-nav" data-lb="-1" aria-label="Anterior" ${i ? '' : 'disabled'}>‹</button>
      <figure>
        <img src="${srcOf(n)}" alt="${esc(n.title)}" />
        <figcaption><b>${esc(capOf(n))}</b> <span>${esc(projOf(n))}</span>${n.fecha ? ` <span>${esc(n.fecha)}</span>` : ''}${s ? ` <em>≈ ${pct(s.total)} con la anterior</em>` : ''} <i>${i + 1} / ${galSeq.length}</i></figcaption>
        <div class="ax-pills">
          <button type="button" class="ax-pill sm" data-lb="mesa">Ver en la mesa</button>
          <button type="button" class="ax-pill sm" data-lb="desde">Secuencia desde esta</button>
          <button type="button" class="ax-pill sm" data-lb="ficha">Abrir ficha</button>
        </div>
      </figure>
      <button type="button" class="mx-lb-nav" data-lb="1" aria-label="Siguiente" ${i < galSeq.length - 1 ? '' : 'disabled'}>›</button>`;
    lb.querySelectorAll('[data-lb]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); lbAct(b.dataset.lb); });
  }
  function lbAct(a) {
    if (a === 'x') return closeLb();
    if (a === '1' || a === '-1') return openLb(clamp(lbIdx + +a, 0, galSeq.length - 1));
    const n = galSeq[lbIdx];
    closeLb();
    if (a === 'mesa') { setModo('mesa'); mxFocus(n.id); }
    if (a === 'desde') { ms.sel = n.id; mx.galOrden = 'semejanza'; saveMx(); syncTools(); renderGaleria(lit()); }
    if (a === 'ficha') go(n.id);
  }
  function closeLb() { lb.hidden = true; lb.innerHTML = ''; lbIdx = -1; }
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
  addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowRight') lbAct('1');
    if (e.key === 'ArrowLeft') lbAct('-1');
  });

  return { setModo, renderGaleria };
}
