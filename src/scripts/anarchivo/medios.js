// Anarchivo — los medios de un proyecto en su tarjeta: mini-reproductor para el audio y visor para los PDF.
// Las tarjetas se rearman con innerHTML en cada render, así que el sonido no vive en ellas: hay un solo
// `Audio` en este módulo y las filas solo lo reflejan (seguir navegando no corta lo que suena).
// `mediosHtml(n)` arma el bloque; `wireMedios(root)` cablea lo recién insertado.
import { esc, clamp, vp } from './util.js';
import { srcOf } from './data.js';

// «Mostrar en Finder» solo existe con el dashboard en local (scripts/finder.mjs), igual que en la ficha de una imagen
const mesaEl = () => document.getElementById('ax-mesa');
const local = () => mesaEl()?.dataset.local === '1';
const audio = new Audio();
audio.preload = 'none';
let sonando = ''; // src (ruta lógica) de la pista cargada
const mmss = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');
const peso = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const filas = (src) => [...document.querySelectorAll('.ax-audio')].filter((el) => !src || el.dataset.audio === src);

function pintar() {
  for (const el of filas()) {
    const mia = el.dataset.audio === sonando;
    el.classList.toggle('on', mia && !audio.paused);
    el.querySelector('[data-play]').textContent = mia && !audio.paused ? '❚❚' : '▶';
    el.querySelector('[data-play]').setAttribute('aria-label', mia && !audio.paused ? 'Pausar' : 'Reproducir');
    el.querySelector('.ax-audio-bar i').style.width = mia && audio.duration ? `${(audio.currentTime / audio.duration) * 100}%` : '0';
    el.querySelector('.ax-audio-t').textContent = mia && (audio.currentTime || audio.duration) ? `${mmss(audio.currentTime)} / ${mmss(audio.duration)}` : '';
  }
}
['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata'].forEach((ev) => audio.addEventListener(ev, pintar));

function tocar(src) {
  if (sonando !== src) { sonando = src; audio.src = srcOf({ src }); }
  else if (!audio.paused) return audio.pause();
  audio.play().catch(() => pintar()); // sin archivo o sin permiso: la fila vuelve a ▶
}

// visor de PDF: una ventana flotante dentro de la página, como las tarjetas — se arrastra por la barra, se
// estira por la esquina y no tapa el grafo ni la tarjeta. Abrir otro PDF reusa la misma ventana, donde esté.
// En pantallas táctiles el enlace se abre aparte (el visor del sistema): Safari en iOS solo dibuja la
// primera página en un marco.
let visor = null;
let sitio = null; // { x, y, w, h }: dónde la dejó el usuario, mientras dure la página
function cerrarPdf() {
  if (!visor) return;
  const r = visor.getBoundingClientRect();
  sitio = { x: r.left, y: r.top, w: r.width, h: r.height };
  visor.remove(); visor = null;
}
function abrirPdf(href, titulo) {
  if (!visor) {
    visor = document.createElement('div');
    visor.className = 'ax-pdf';
    visor.innerHTML = `<div class="ax-pdf-bar" title="Arrastrar"><span class="ax-grip" aria-hidden="true">⋮⋮</span><b></b>
        <a class="ax-pill sm" target="_blank" rel="noopener">Abrir aparte ↗</a>
        <button type="button" class="ax-fold" data-x aria-label="Cerrar el visor">×</button></div>
      <iframe></iframe>`;
    const w = sitio?.w ?? Math.min(560, vp.W - 32), h = sitio?.h ?? Math.min(720, vp.H - 110);
    const place = (x, y) => { visor.style.left = clamp(x, 0, vp.W - 120) + 'px'; visor.style.top = clamp(y, 0, vp.H - 48) + 'px'; };
    visor.style.width = w + 'px'; visor.style.height = h + 'px';
    place(sitio?.x ?? Math.max(16, (vp.W - w) / 2 - 220), sitio?.y ?? 90);
    visor.querySelector('[data-x]').onclick = cerrarPdf;
    visor.querySelector('.ax-pdf-bar').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button, a')) return;
      const r = visor.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
      visor.classList.add('moviendo'); // el marco se tragaría el puntero al pasar por encima
      const move = (m) => place(r.left + m.clientX - sx, r.top + m.clientY - sy);
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); visor?.classList.remove('moviendo'); };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
    document.body.append(visor);
  }
  visor.querySelector('b').textContent = titulo;
  visor.querySelector('a').href = href;
  const f = visor.querySelector('iframe');
  f.title = titulo;
  if (f.getAttribute('src') !== href) f.src = href;
}
// Esc cierra primero el visor (en captura: que no llegue a «salir del foco»)
addEventListener('keydown', (e) => { if (e.key === 'Escape' && visor) { e.stopImmediatePropagation(); cerrarPdf(); } }, true);

export function mediosHtml(n) {
  const ms = (n.medios || []).filter((m) => m.src);
  if (!ms.length) return '';
  const au = ms.filter((m) => m.tipo === 'audio'), pdf = ms.filter((m) => m.tipo === 'pdf');
  return `<div class="ax-group ax-medios">
    ${au.length ? `<span class="ax-kicker">Audio · ${au.length}</span>${au.map((m) => `
      <div class="ax-audio" data-audio="${esc(m.src)}">
        <button type="button" data-play aria-label="Reproducir">▶</button>
        <div class="ax-audio-main"><div class="ax-audio-top"><b>${esc(m.name)}</b>${local() ? `<button type="button" class="ax-pill sm" data-finder="${esc(m.file)}" data-proy="${esc(n.id)}">Mostrar en Finder</button>` : ''}</div>
          <div class="ax-audio-bar" title="Ir a este punto"><i></i></div></div>
        <span class="ax-audio-t"></span>
      </div>`).join('')}` : ''}
    ${pdf.length ? `<span class="ax-kicker">PDF · ${pdf.length}</span>${pdf.map((m) => `
      <a class="ax-item ax-pdf-item" href="${srcOf(m)}" target="_blank" rel="noopener" data-pdf="${esc(m.name)}"><b>${esc(m.name)}</b><span>${peso(m.bytes)}</span></a>`).join('')}` : ''}
  </div>`;
}

export function wireMedios(root) {
  root.querySelectorAll('.ax-audio').forEach((el) => {
    const src = el.dataset.audio;
    el.querySelector('[data-play]').onclick = () => tocar(src);
    const fb = el.querySelector('[data-finder]');
    if (fb) fb.onclick = async () => {
      let ok = false;
      try { ok = (await (await fetch(`${mesaEl().dataset.base || '/'}__finder?id=${encodeURIComponent(fb.dataset.proy)}&medio=${encodeURIComponent(fb.dataset.finder)}`, { method: 'POST' })).json()).ok; } catch { /* sin servicio local */ }
      if (!ok) fb.textContent = 'No se pudo abrir Finder';
    };
    el.querySelector('.ax-audio-bar').onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect(), f = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
      if (sonando !== src) tocar(src);
      if (audio.duration) audio.currentTime = f * audio.duration;
      else audio.addEventListener('loadedmetadata', () => { audio.currentTime = f * audio.duration; }, { once: true });
    };
  });
  root.querySelectorAll('[data-pdf]').forEach((a) => a.onclick = (e) => {
    if (matchMedia('(pointer: coarse)').matches) return; // en el teléfono: el visor del sistema
    e.preventDefault();
    abrirPdf(a.href, a.dataset.pdf);
  });
  pintar();
}
