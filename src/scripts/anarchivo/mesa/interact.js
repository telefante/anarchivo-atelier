// Anarchivo · Mesa — interacción: cada módulo (crearlo, moverlo, agrandarlo, tirar un hilo, elegir, comparar,
// expandir, quitar) y la mesa entera (desplazar, zoom) más Esc (cierra el par o sale del foco).
// `initInteract(ctx)` cablea los listeners y devuelve `makeMod`, que capas.js usa para crear los módulos.
import { esc, clamp, pairKey } from '../util.js';
import { srcOf, capOf } from '../data.js';
import { mx, saveMx, ms } from './state.js';
import { features } from './semejanza.js';
import { mesaEl, stage, applyPos, applyView, rectOf, center, toStage, K_MIN } from './layout.js';

// ctx: DOM (mxDots), projOf, userRels, y lo que viene de draw.js (openPair, closePair, mxSchedule), de capas.js
// (touch, salirFoco, enfocar, toggleExp, quitar) y de la página (renderTop, lit, syncTools, state)
export function initInteract({ mxDots, projOf, abrirFicha, abrirNota, notaLocal, userRels, openPair, closePair, mxSchedule, renderTop, lit, syncTools, state, touch, salirFoco, enfocar, toggleExp, quitar }) {
  const { mods, feats } = ms;
  function makeMod(n, fresh) {
    const id = n.id, p0 = mx.pos[id];
    if (fresh) mx.pos[id] = { x: 0, y: 0, w: 220, ar: p0?.ar, gone: false };
    const el = document.createElement('div');
    el.className = 'mx-mod';
    el.dataset.id = id;
    if (fresh) el.dataset.pend = '1';
    el.innerHTML = `<div class="mx-img"><img draggable="false" alt="${esc(n.title)}" /><span class="mx-tint"></span></div>
      <div class="mx-cap"><b>${esc(capOf(n))}</b><span>${esc(projOf(n))}</span><i class="mx-sim"></i></div>
      <span class="mx-hilo" title="Tirar un hilo hasta otra imagen para relacionarlas"></span>
      <button type="button" class="mx-exp"></button>
      <button type="button" class="mx-x" title="Quitar de la mesa">×</button>
      <button type="button" class="mx-i" title="Proyecto y archivo">⋯</button>
      <button type="button" class="mx-n" title="Nota de la imagen" ${!notaLocal && !n.nota ? 'hidden' : ''}>✎</button>
      <span class="mx-rs" title="Cambiar tamaño"></span>`;
    const img = el.querySelector('img');
    const loaded = new Promise((res) => {
      img.onload = () => {
        const p = mx.pos[id];
        // las verticales entran más angostas, para que una fila no se vuelva un muro
        if (fresh && img.naturalHeight > img.naturalWidth) { p.w = 150; if (mods.has(id)) applyPos(id); } // puede cargar después de que el módulo ya se quitó
        // la proporción se recuerda: la próxima vez el módulo reserva su alto antes de que cargue la imagen
        if (img.naturalWidth) { p.ar = +(img.naturalHeight / img.naturalWidth).toFixed(4); el.querySelector('.mx-img').style.aspectRatio = `1 / ${p.ar}`; }
        try { feats.set(id, features(img)); } catch {}
        mxSchedule(); res();
      };
      img.onerror = () => res();
    });
    if (mx.pos[id].ar) el.querySelector('.mx-img').style.aspectRatio = `1 / ${mx.pos[id].ar}`;
    img.src = srcOf(n);
    stage.insertBefore(el, mxDots);
    mods.set(id, el);
    applyPos(id);
    el.addEventListener('pointerdown', (e) => modDown(e, id));
    el.addEventListener('dblclick', () => enfocar(id));
    el.addEventListener('pointerenter', () => { ms.hover = id; mxSchedule(); });
    el.addEventListener('pointerleave', () => { if (ms.hover === id) { ms.hover = null; mxSchedule(); } });
    const ex = el.querySelector('.mx-exp'), qx = el.querySelector('.mx-x'), ib = el.querySelector('.mx-i'), nb = el.querySelector('.mx-n');
    for (const b of [ex, qx, ib, nb]) b.addEventListener('pointerdown', (e) => e.stopPropagation());
    nb.addEventListener('click', () => abrirNota(id, nb));
    nb.addEventListener('dblclick', (e) => e.stopPropagation());
    el.classList.toggle('con-nota', !!n.nota);
    ib.addEventListener('click', () => abrirFicha(id, ib));
    ib.addEventListener('dblclick', (e) => e.stopPropagation());
    ex.addEventListener('click', () => toggleExp(id));
    qx.addEventListener('click', () => quitar(id));
    return loaded;
  }

  // --- dos dedos: pellizco (zoom hacia el punto medio) y desplazar a la vez, estén sobre la mesa o sobre imágenes ---
  // Se escucha en fase de captura, antes que los módulos: al entrar el segundo dedo, lo que el primero había
  // empezado (mover una imagen, desplazar) se deshace (`enCurso`) y los dos dedos pasan a ser de la mesa entera.
  let enCurso = null, pinch = null;
  const dedos = new Map(); // pointerId -> [x, y]
  const medio = () => { const [a, b] = [...dedos.values()]; return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1 }; };
  mesaEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    dedos.set(e.pointerId, [e.clientX, e.clientY]);
    if (dedos.size !== 2) return;
    e.stopPropagation(); e.preventDefault();
    enCurso?.(); enCurso = null;
    pinch = { ...medio(), v: { ...mx.view } };
  }, true);
  mesaEl.addEventListener('pointermove', (e) => {
    if (!dedos.has(e.pointerId)) return;
    dedos.set(e.pointerId, [e.clientX, e.clientY]);
    if (!pinch || dedos.size < 2) return;
    e.stopPropagation();
    const m = medio(), k = clamp(pinch.v.k * (m.d / pinch.d), K_MIN, 3), r = k / pinch.v.k;
    // el punto de la mesa que estaba bajo el punto medio al empezar sigue bajo el punto medio de ahora
    mx.view.k = k; mx.view.x = m.x - (pinch.x - pinch.v.x) * r; mx.view.y = m.y - (pinch.y - pinch.v.y) * r;
    applyView();
  }, true);
  const soltar = (e) => {
    if (!dedos.delete(e.pointerId) || !pinch) return;
    e.stopPropagation(); // que levantar un dedo tras el pellizco no cuente como un clic sobre la imagen
    if (!dedos.size) { pinch = null; saveMx(); mxSchedule(); } // el dedo que queda no hace nada hasta que se levanta
  };
  mesaEl.addEventListener('pointerup', soltar, true);
  mesaEl.addEventListener('pointercancel', soltar, true);

  // --- interacción con un módulo: mover, agrandar, tirar un hilo ---
  function modDown(e, id) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = mods.get(id);
    el.style.zIndex = ++ms.z;
    const t = e.target;
    const p = mx.pos[id], p0 = { ...p }, sx = e.clientX, sy = e.clientY, k = mx.view.k;
    let moved = false, temp = null;
    const kind = t.closest('.mx-rs') ? 'rs' : t.closest('.mx-hilo') ? 'hilo' : 'mover';
    const elegir = ms.elegir && kind === 'mover'; // modo «Elegir»: el toque suma o quita, no arrastra
    if (kind === 'hilo') {
      temp = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      temp.setAttribute('class', 'mx-l tirando');
      mxDots.appendChild(temp);
    }
    el.setPointerCapture?.(e.pointerId);
    // si entra un segundo dedo esto era el principio de un pellizco: el módulo vuelve a su sitio
    enCurso = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); temp?.remove(); Object.assign(p, p0); applyPos(id); mxSchedule(); };
    const move = (ev) => {
      const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
      if (elegir) return;
      if (kind === 'mover') { p.x = p0.x + dx; p.y = p0.y + dy; p.u = true; applyPos(id); }
      else if (kind === 'rs') { p.w = clamp(p0.w + dx, 90, 1000); p.u = true; applyPos(id); }
      else {
        const [x1, y1] = center(rectOf(id)), [x2, y2] = toStage(ev.clientX, ev.clientY);
        temp.setAttribute('x1', x1); temp.setAttribute('y1', y1); temp.setAttribute('x2', x2); temp.setAttribute('y2', y2);
        return;
      }
      if (kind === 'mover' && !ms.sel) ms.sel = id; // mientras se arrastra, la semejanza se lee desde esta
      mxSchedule();
    };
    const up = (ev) => {
      enCurso = null;
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (kind === 'hilo') {
        temp.remove();
        const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.mx-mod')).find((x) => x && x.dataset.id !== id);
        if (hit) { const k2 = pairKey(id, hit.dataset.id); userRels.add(k2); mx.rels = [...userRels]; ms.nbCache.clear(); openPair(id, hit.dataset.id); renderTop(lit()); }
      } else if (!moved && kind === 'mover') {
        if (ev.shiftKey && ms.sel && ms.sel !== id) openPair(ms.sel, id);
        else if (ev.ctrlKey || ev.metaKey || ms.elegir) {
          // Ctrl/Cmd-click: multi-selección para constelación
          if (ms.sels.has(id)) ms.sels.delete(id);
          else ms.sels.add(id);
          if (!ms.sel) ms.sel = id;
          syncTools();
        }
        else { ms.sel = ms.sel === id ? null : id; ms.sels.clear(); syncTools(); }
      }
      if (kind !== 'hilo' || moved) touch(id);
      saveMx();
      mxSchedule();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // --- mover y acercar la mesa entera ---
  mesaEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.mx-mod, .mx-dot')) return;
    const sx = e.clientX, sy = e.clientY, v0 = { ...mx.view };
    let moved = false;
    mesaEl.setPointerCapture?.(e.pointerId);
    mesaEl.classList.add('panning');
    const move = (ev) => {
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 4) moved = true;
      mx.view.x = v0.x + ev.clientX - sx; mx.view.y = v0.y + ev.clientY - sy; applyView();
    };
    const quitar = () => { mesaEl.removeEventListener('pointermove', move); mesaEl.removeEventListener('pointerup', up); mesaEl.removeEventListener('pointercancel', up); mesaEl.classList.remove('panning'); };
    enCurso = quitar; // un segundo dedo lo convierte en pellizco, que sigue desde donde quedó la vista
    const up = () => {
      enCurso = null;
      quitar();
      if (!moved) { ms.sel = null; mxSchedule(); }
      saveMx();
    };
    mesaEl.addEventListener('pointermove', move);
    mesaEl.addEventListener('pointerup', up);
    mesaEl.addEventListener('pointercancel', up);
  });
  // rueda: desplazar · pellizco (ctrlKey en trackpad) o ⌘/ctrl+rueda: zoom hacia el cursor
  mesaEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const k0 = mx.view.k, k1 = clamp(k0 * Math.exp(-e.deltaY * 0.01), K_MIN, 3);
      mx.view.x = e.clientX - (e.clientX - mx.view.x) * (k1 / k0);
      mx.view.y = e.clientY - (e.clientY - mx.view.y) * (k1 / k0);
      mx.view.k = k1;
    } else { mx.view.x -= e.deltaX; mx.view.y -= e.deltaY; }
    applyView();
    clearTimeout(mesaEl._t); mesaEl._t = setTimeout(saveMx, 300);
  }, { passive: false });

  addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.view === 'mesa' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { if (ms.pair) closePair(); else if (mx.foco) salirFoco(); } });

  return { makeMod };
}
