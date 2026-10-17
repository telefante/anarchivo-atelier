// Anarchivo · Mesa — geometría y colocación: dónde está cada módulo, cómo se encuadra y se ordena.
// Lo que viene de fuera lo pone main.js en `env` (los nodos y el redibujado): este módulo no importa la página.
import * as d3 from 'd3';
import { $, clamp, isMobile, vp } from '../util.js';
import { mx, saveMx, ms } from './state.js';
import { semejanza } from './semejanza.js';

export const R_CERCA = 90; // px (en la mesa) a partir de los cuales dos imágenes dejan de «tocarse»
export const mesaEl = $('ax-mesa'), stage = $('mx-stage');
export const env = { byId: new Map(), draw: () => {} };
const { mods } = ms;

// --- geometría ---
export function rectOf(id) { const p = mx.pos[id], el = mods.get(id); return { x: p.x, y: p.y, w: p.w, h: el.offsetHeight || p.w * 0.75 }; }
export const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];
export function gapOf(a, b) {
  const dx = Math.max(0, b.x - (a.x + a.w), a.x - (b.x + b.w));
  const dy = Math.max(0, b.y - (a.y + a.h), a.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
export const cercania = (a, b) => clamp(1 - gapOf(rectOf(a), rectOf(b)) / R_CERCA, 0, 1);
const LEJOS = 0.75; // por debajo de este zoom las fotos son chicas y los iconos las taparían
export function applyView() {
  const { x, y, k } = mx.view;
  stage.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  stage.style.setProperty('--ik', 1 / k); // para lo que debe medir lo mismo en pantalla a cualquier zoom (⋯ y ✎ de cada imagen)
  stage.classList.toggle('lejos', k < LEJOS); // de lejos, ⋯ y ✎ se reducen a un punto (igual se pueden pulsar)
  mesaEl.style.backgroundPosition = `${x}px ${y}px`;
  mesaEl.style.backgroundSize = `${24 * k}px ${24 * k}px`;
}
export function applyPos(id) { const p = mx.pos[id], el = mods.get(id); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; el.style.width = p.w + 'px'; }
export const toStage = (cx, cy) => [(cx - mx.view.x) / mx.view.k, (cy - mx.view.y) / mx.view.k];

export function soltar(id) { delete mods.get(id).dataset.pend; mx.pos[id].gone = false; }
// capa nueva: en filas por proyecto, debajo de lo que ya hay
export function colocar(ids) {
  const S = new Set(ids);
  const otros = [...mods].filter(([i, el]) => !S.has(i) && !el.dataset.pend).map(([i]) => rectOf(i));
  let x0, y0;
  if (otros.length) { x0 = Math.min(...otros.map((r) => r.x)); y0 = Math.max(...otros.map((r) => r.y + r.h)) + 90; }
  else [x0, y0] = toStage(isMobile() ? 16 : 60, 250);
  const GAP = R_CERCA + 12, xMax = x0 + (isMobile() ? vp.W - 32 : vp.W - 480) / 0.75;
  let y = y0;
  for (const [, proj] of d3.groups(ids, (id) => env.byId.get(id).parent)) {
    let x = x0, line = [], hMax = 0;
    const flush = () => { if (line.length) { y += hMax + GAP; line = []; hMax = 0; } };
    for (const id of proj) {
      const r = rectOf(id);
      if (line.length && x + r.w > xMax) { flush(); x = x0; }
      mx.pos[id].x = x; mx.pos[id].y = y; x += r.w + GAP; line.push(id); hMax = Math.max(hMax, r.h);
    }
    flush();
  }
  ids.forEach((id) => { applyPos(id); soltar(id); });
}
// vecinas en anillos alrededor de src: las más fuertes (primeras) en el anillo de dentro
export const anillo = (src, gap = R_CERCA + 30) => (ids) => {
  if (!ids.length) return;
  const rs = rectOf(src), [cx, cy] = center(rs);
  const rr = ids.map(rectOf), avg = rr.reduce((a, r) => a + Math.max(r.w, r.h), 0) / ids.length;
  let rad = Math.max(rs.w, rs.h) / 2 + avg / 2 + gap, i = 0;
  while (i < ids.length) {
    const n = Math.min(Math.max(1, Math.floor(2 * Math.PI * rad / (avg + gap))), ids.length - i);
    for (let j = 0; j < n; j++, i++) {
      const id = ids[i], a = -Math.PI / 2 + j * 2 * Math.PI / n, r = rr[i];
      mx.pos[id].x = cx + Math.cos(a) * rad - r.w / 2; mx.pos[id].y = cy + Math.sin(a) * rad - r.h / 2;
      applyPos(id); soltar(id);
    }
    rad += avg + gap;
  }
};

// --- ordenar: por semejanza (fuerzas) o por proyecto (filas) ---
export function animateTo(ids) {
  stage.classList.add('mx-anim');
  ids.forEach(applyPos);
  saveMx();
  // sin rAF (pestaña en segundo plano) la transición no avanza: sin animación, directo
  if (document.hidden) { stage.classList.remove('mx-anim'); env.draw(); return; }
  const t0 = performance.now();
  const loop = () => { env.draw(); if (performance.now() - t0 < 650) requestAnimationFrame(loop); else stage.classList.remove('mx-anim'); };
  requestAnimationFrame(loop);
}
export function ordenarMesa(kind) {
  const ids = [...mods.keys()];
  if (!ids.length) return;
  // el centro deja libre la columna del panel «Entre dos imágenes» (340 + márgenes)
  const [cx, cy] = toStage(isMobile() ? vp.W / 2 : (vp.W - 380) / 2, vp.H / 2 + 60);
  if (kind === 'proyecto') {
    const rows = d3.groups(ids, (id) => env.byId.get(id).parent);
    const rowH = (row) => Math.max(...row.map((id) => rectOf(id).h));
    // huecos más anchos que R_CERCA: al ordenar nada «se toca» — la cercanía la arma quien mira
    const GAP = R_CERCA + 12;
    // desde arriba a la izquierda (bajo el buscador), cada proyecto en su
    // fila; si no cabe en el ancho libre (sin la columna del panel), sigue abajo
    const [x0, y0] = toStage(isMobile() ? 16 : 60, 250);
    // ancho de fila pensado para verse a ~0.75 (fitView ajusta después): menos filas, más grandes
    const xMax = x0 + (isMobile() ? vp.W - 32 : vp.W - 480) / 0.75;
    let y = y0;
    for (const [, proj] of rows) {
      let x = x0, line = [];
      const flush = () => { if (line.length) { y += rowH(line) + GAP; line = []; } };
      for (const id of proj) {
        const w = rectOf(id).w;
        if (line.length && x + w > xMax) { flush(); x = x0; }
        mx.pos[id].x = x; mx.pos[id].y = y; x += w + GAP; line.push(id);
      }
      flush();
    }
  } else {
    const ns = ids.map((id) => { const r = rectOf(id); const [x, y] = center(r); return { id, x, y, r: Math.hypot(r.w, r.h) / 2 }; });
    const ls = [];
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) ls.push({ source: ns[i], target: ns[j], s: semejanza(ns[i].id, ns[j].id)?.total ?? 0.5 });
    // la escala absoluta de la semejanza no dice mucho: se estira al rango real de esta mesa
    const [lo, hi] = d3.extent(ls, (l) => l.s);
    ls.forEach((l) => { l.n = hi > lo ? (l.s - lo) / (hi - lo) : 0.5; });
    d3.forceSimulation(ns).stop()
      .force('link', d3.forceLink(ls).distance((l) => (l.source.r + l.target.r) * (0.95 + 3 * (1 - l.n) ** 1.5)).strength((l) => 0.04 + 0.5 * l.n ** 2))
      .force('collide', d3.forceCollide((n) => n.r + 16).strength(1))
      .force('center', d3.forceCenter(cx, cy))
      .tick(400);
    ns.forEach((n) => { const r = rectOf(n.id); mx.pos[n.id].x = n.x - r.w / 2; mx.pos[n.id].y = n.y - r.h / 2; });
  }
  fitView(ids);
  animateTo(ids);
}
// encuadrar: que todo lo ordenado quepa entre el buscador y la barra de abajo
// (y fuera de la columna del panel); nunca agranda más allá de 1
export const K_MIN = 0.15; // lo más lejos que se aleja la mesa (encuadre y rueda)
export function fitView(ids, kMax = 1) {
  const rs = ids.map(rectOf);
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y));
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h));
  // la barra de abajo cambia de alto (filas, plegado): se mide, no se supone
  const barra = document.getElementById('mx-barra')?.offsetHeight || 150;
  const L = isMobile() ? 16 : 60, T = isMobile() ? 170 : 230, R = isMobile() ? vp.W - 16 : vp.W - 420, B = Math.max(T + 120, vp.H - barra - 24);
  const cabe = Math.min(kMax, (R - L) / (x1 - x0 || 1), (B - T) / (y1 - y0 || 1)), k = Math.max(K_MIN, cabe);
  if (cabe >= K_MIN) mx.view = { k, x: L - x0 * k, y: T - y0 * k };
  else {
    // no caben todas ni al mínimo: en vez de la esquina del conjunto (que suele estar vacía), el centro de
    // la vista va a la imagen más cercana al punto medio — donde hay más
    const cs = rs.map((r) => [r.x + r.w / 2, r.y + r.h / 2]);
    const mxm = d3.median(cs, (c) => c[0]), mym = d3.median(cs, (c) => c[1]);
    const [cx, cy] = d3.least(cs, (c) => Math.hypot(c[0] - mxm, c[1] - mym));
    mx.view = { k, x: (L + R) / 2 - cx * k, y: (T + B) / 2 - cy * k };
  }
  saveMx();
  stage.style.transition = 'transform .6s cubic-bezier(.3,.7,.2,1)';
  applyView();
  setTimeout(() => { stage.style.transition = ''; }, 650);
}
