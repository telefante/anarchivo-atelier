// Anarchivo · Mesa — dibujo: hilos, cercanías, contagio y semejanza respecto de lo elegido (mxDraw),
// y el panel «Entre dos imágenes» (openPair / pairStats / closePair).
// `initDraw(ctx)` recibe lo que vive en la página (datos, relaciones, y las llamadas hacia arriba) y devuelve las funciones públicas.
import { $, esc, clamp, pairKey, isMobile, vp } from '../util.js';
import { srcOf, capOf } from '../data.js';
import { mx, saveMx, ms } from './state.js';
import { semejanza, pct } from './semejanza.js';
import { R_CERCA, rectOf, center, gapOf, cercania, toStage, animateTo } from './layout.js';

// ctx: byId · userRels/yamlRels/visualRels (Set de pares) · mxPanel/mxLines/mxDots (DOM) · projOf · imgNb (vecinas) · renderTop/lit (página)
export function initDraw({ byId, userRels, yamlRels, visualRels, mxPanel, mxLines, mxDots, projOf, imgNb, renderTop, lit }) {
  const { mods, feats } = ms;
  // --- dibujar: hilos, cercanías, contagio, semejanza respecto de la elegida ---
  function mxSchedule() {
    if (ms.raf) return;
    const run = () => { ms.raf = 0; mxDraw(); };
    ms.raf = document.hidden ? setTimeout(run, 0) : requestAnimationFrame(run);
  }
  function mxDraw() {
    if (!ms.built) return;
    const ids = [...mods].filter(([, el]) => !el.dataset.pend).map(([id]) => id);
    const R = new Map(ids.map((id) => [id, rectOf(id)]));
    const tint = new Map(ids.map((id) => [id, { r: 0, g: 0, b: 0, w: 0 }]));
    // relaciones: ninguna · las de lo elegido / bajo el cursor / expandido · todas (tope: con muchas, solo las de lo elegido)
    const modo = mx.rel === 'todas' && ids.length > 160 ? 'sel' : mx.rel;
    const F = new Set([...(ms.sel ? [ms.sel] : []), ...ms.sels, ...(ms.hover ? [ms.hover] : []), ...(ms.pair || []), ...Object.keys(mx.exp).filter((k) => mods.has(k))]);
    const best = new Map(); // id -> sus 2 más parecidas (para «Hilos»)
    if (mx.hilos && mx.lcapa.hilo !== false) for (const a of (modo === 'todas' ? ids : modo === 'sel' ? [...F].filter((i) => mods.has(i)) : [])) best.set(a, ids.filter((b) => b !== a && semejanza(a, b)).sort((x, y) => semejanza(a, y).total - semejanza(a, x).total).slice(0, 2));
    let lines = '', dots = '';
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j], k = pairKey(a, b), ra = R.get(a), rb = R.get(b);
      const c = clamp(1 - gapOf(ra, rb) / R_CERCA, 0, 1);
      const on = ms.pair && pairKey(...ms.pair) === k ? ' on' : '';
      if (c > 0 && mx.contagio) {
        const fa = feats.get(a), fb = feats.get(b);
        if (fb) { const t = tint.get(a); t.r += fb.mean[0] * c; t.g += fb.mean[1] * c; t.b += fb.mean[2] * c; t.w += c; }
        if (fa) { const t = tint.get(b); t.r += fa.mean[0] * c; t.g += fa.mean[1] * c; t.b += fa.mean[2] * c; t.w += c; }
      }
      const visible = on || modo === 'todas' || (modo === 'sel' && (F.has(a) || F.has(b)));
      if (!visible) continue;
      const s = semejanza(a, b);
      const L_ = mx.lcapa;
      const rel = userRels.has(k) && L_.rel !== false, yml = yamlRels.has(k) && L_.yaml !== false, visual = visualRels.has(k) && L_.visual !== false;
      const cerca = c > 0 && L_.cerca !== false;
      const hilo = mx.hilos && (best.get(a)?.includes(b) || best.get(b)?.includes(a));
      if (!(on || rel || yml || visual || cerca || hilo)) continue;
      const [x1, y1] = center(ra), [x2, y2] = center(rb);
      const cls = rel ? 'rel' : yml ? 'yaml' : visual ? 'visual' : cerca ? 'cerca' : 'hilo';
      const op = cls === 'cerca' ? 0.25 + c * 0.75 : cls === 'hilo' && s ? 0.3 + s.total * 0.6 : 1;
      lines += `<line class="mx-l ${cls}${on}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="opacity:${op.toFixed(2)}" />`;
      if (cls !== 'hilo' || on) {
        // el punto va en el hueco entre las dos, no en el centro geométrico (que puede caer sobre una imagen)
        const mx_ = (Math.max(ra.x, rb.x) + Math.min(ra.x + ra.w, rb.x + rb.w)) / 2;
        const my_ = (Math.max(ra.y, rb.y) + Math.min(ra.y + ra.h, rb.y + rb.h)) / 2;
        const note = mx.notes[k] ? ' nota' : '';
        dots += `<g class="mx-dot${on}${note} ${cls}" data-pair="${esc(k)}" transform="translate(${mx_},${my_})"><circle r="15" /><text dy="0.35em">${s ? Math.round(s.total * 100) : '·'}</text></g>`;
      }
    }
    mxLines.innerHTML = lines;
    mxDots.innerHTML = dots;
    mxDots.querySelectorAll('[data-pair]').forEach((g) => g.addEventListener('pointerdown', (e) => { e.stopPropagation(); openPair(...g.dataset.pair.split('||')); }));
    for (const id of ids) {
      const el = mods.get(id), t = tint.get(id);
      const tintEl = el.querySelector('.mx-tint');
      if (mx.contagio && t.w > 0) {
        tintEl.style.background = `rgb(${t.r / t.w | 0},${t.g / t.w | 0},${t.b / t.w | 0})`;
        tintEl.style.opacity = Math.min(0.55, t.w * 0.4).toFixed(2);
      } else tintEl.style.opacity = 0;
      el.classList.toggle('sel', id === ms.sel || ms.sels.has(id));
      el.classList.toggle('par', !!ms.pair && ms.pair.includes(id));
      const s = ms.sel && id !== ms.sel ? semejanza(ms.sel, id) : null;
      el.querySelector('.mx-sim').textContent = s ? `≈ ${pct(s.total)}` : '';
      // «+N» trae a las N vecinas que faltan; «−» las devuelve; «≈» solo muestra sus relaciones
      const ex = el.querySelector('.mx-exp'), nb = imgNb(id), falta = nb.filter((i) => !mods.has(i)).length, abierta = !!mx.exp[id];
      ex.hidden = !nb.length;
      ex.textContent = abierta ? '−' : falta ? `+${falta}` : '≈';
      ex.title = abierta ? 'Contraer: devolver al archivo las vecinas que trajo' : falta ? `Expandir: traer ${falta} imagen${falta === 1 ? '' : 'es'} relacionada${falta === 1 ? '' : 's'}` : 'Mostrar sus relaciones';
      el.classList.toggle('abierta', abierta);
    }
    if (ms.pair) pairStats();
  }

  // --- par: lo que pasa entre dos imágenes ---
  function openPair(a, b) {
    ms.pair = [a, b]; // en el orden en que se eligieron: la primera es desde donde se mira
    const k = pairKey(a, b), A = byId.get(ms.pair[0]), B = byId.get(ms.pair[1]);
    mxPanel.classList.add('open');
    mxPanel.innerHTML = `
      <div class="mx-panel-head"><span class="ax-kicker ink">Entre dos imágenes</span><button type="button" class="ax-close" data-mx-cerrar>×</button></div>
      <div class="mx-par"><img src="${srcOf(A)}" alt="" /><span>×</span><img src="${srcOf(B)}" alt="" /></div>
      <p class="mx-par-t"><span><b>${esc(capOf(A))}</b> <i>${esc(projOf(A))}</i></span><span><b>${esc(capOf(B))}</b> <i>${esc(projOf(B))}</i></span></p>
      <dl class="mx-stats" id="mx-stats"></dl>
      <label class="mx-nota"><span>¿Qué cambia en cada una al ponerlas juntas?</span><textarea id="mx-nota" rows="4"></textarea></label>
      <div class="ax-pills">
        <button type="button" class="ax-pill sm" data-mx-rel></button>
        <button type="button" class="ax-pill sm" data-mx-juntar title="Poner la segunda al lado de la primera">Juntar</button>
        <button type="button" class="ax-pill sm" data-mx-separar title="Alejarlas fuera del alcance de la cercanía">Separar</button>
      </div>
      <span class="ax-muted">Las notas viven en este navegador — «Exportar» las lleva a la bitácora.</span>`;
    const ta = $('mx-nota');
    ta.value = mx.notes[k] || '';
    ta.oninput = () => { if (ta.value.trim()) mx.notes[k] = ta.value; else delete mx.notes[k]; clearTimeout(ta._t); ta._t = setTimeout(() => { saveMx(); mxSchedule(); renderTop(lit()); }, 300); };
    mxPanel.querySelector('[data-mx-cerrar]').onclick = closePair;
    mxPanel.querySelector('[data-mx-rel]').onclick = () => {
      userRels.has(k) ? userRels.delete(k) : userRels.add(k);
      mx.rels = [...userRels]; ms.nbCache.clear(); saveMx(); mxSchedule(); renderTop(lit());
    };
    const shift = (fn) => { const [a2, b2] = ms.pair, ra = rectOf(a2), p = mx.pos[b2]; fn(ra, p); animateTo([b2]); };
    mxPanel.querySelector('[data-mx-juntar]').onclick = () => shift((ra, p) => {
      // a la derecha, salvo que caiga bajo el panel: entonces a la izquierda
      const derecha = ra.x + ra.w + 14, limite = toStage(isMobile() ? vp.W : vp.W - 400, 0)[0];
      p.x = derecha + p.w <= limite ? derecha : ra.x - p.w - 14; p.y = ra.y;
    });
    mxPanel.querySelector('[data-mx-separar]').onclick = () => shift((ra, p) => {
      const rb = rectOf(ms.pair[1]), [ax, ay] = center(ra), [bx, by] = center(rb);
      const d = Math.hypot(bx - ax, by - ay) || 1, need = Math.max(ra.w, ra.h) / 2 + Math.max(rb.w, rb.h) / 2 + R_CERCA + 40;
      p.x = ax + (bx - ax) / d * need - rb.w / 2; p.y = ay + (by - ay) / d * need - rb.h / 2;
    });
    mxSchedule();
  }
  function pairStats() {
    const [a, b] = ms.pair, k = pairKey(a, b), s = semejanza(a, b), c = cercania(a, b);
    const st = $('mx-stats');
    if (!st) return;
    const bar = (v, ink) => `<span class="mx-bar${ink ? ' ink' : ''}"><i style="width:${(v * 100).toFixed(0)}%"></i></span><span class="mx-pct">${pct(v)}</span>`;
    st.innerHTML = [
      ['semejanza', s ? bar(s.total) : '<span class="ax-muted">calculando…</span>'],
      s ? ['· color', bar(s.color)] : null,
      s ? ['· forma', bar(s.forma)] : null,
      ['cercanía', c > 0 ? bar(c, true) : '<span class="ax-muted">lejos — no se tocan</span>'],
      ['relación', yamlRels.has(k) ? '<span class="ax-pill sm">imagenes.yaml</span>' : userRels.has(k) ? '<span class="ax-pill sm soft">hilo tuyo</span>' : '<span class="ax-muted">—</span>'],
    ].filter(Boolean).map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('');
    const rb = mxPanel.querySelector('[data-mx-rel]');
    if (rb) { rb.textContent = userRels.has(k) ? 'Soltar hilo' : 'Tirar hilo'; rb.classList.toggle('soft', userRels.has(k)); }
  }
  function closePair() { ms.pair = null; mxPanel.classList.remove('open'); mxPanel.innerHTML = ''; mxSchedule(); }

  return { mxSchedule, mxDraw, openPair, closePair };
}
