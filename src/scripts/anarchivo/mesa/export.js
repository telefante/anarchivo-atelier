// Anarchivo · Mesa — Exportar: hilos y notas como markdown para la bitácora, más líneas `relacionadas:`
// para imagenes.yaml. (Las constelaciones tienen su módulo: constelaciones.js.)
// Nada se escribe en los archivos del playbook: sale por el portapapeles.
import { $ } from '../util.js';
import { capOf, keyOf } from '../data.js';
import { mx, ms } from './state.js';
import { semejanza, pct } from './semejanza.js';
import { cercania } from './layout.js';

// `closePair` = cerrar el panel del par
export function initExport({ byId, userRels, mxPanel, closePair }) {
  $('mx-export').onclick = () => {
    const hoy = new Date().toISOString().slice(0, 10);
    const pares = [...new Set([...userRels, ...Object.keys(mx.notes)])].filter((k) => k.split('||').every((id) => byId.has(id)));
    const out = [`### Mesa · ${hoy}`, ''];
    for (const k of pares) {
      const [a, b] = k.split('||'), s = semejanza(a, b), c = cercania(a, b);
      const extra = [s ? `semejanza ${pct(s.total)}` : '', c > 0 ? `juntas (${pct(c)})` : '', userRels.has(k) ? 'hilo' : ''].filter(Boolean).join(' · ');
      out.push(`- **${capOf(byId.get(a))}** × **${capOf(byId.get(b))}** — ${extra}`);
      if (mx.notes[k]) out.push(...mx.notes[k].trim().split('\n').map((l) => `  > ${l}`));
    }
    // hilos tuyos como líneas `relacionadas:` listas para imagenes.yaml
    const porImg = new Map();
    for (const k of userRels) {
      const [a, b] = k.split('||');
      if (!byId.has(a) || !byId.has(b)) continue;
      for (const [x, y] of [[a, b], [b, a]]) {
        const X = byId.get(x), Y = byId.get(y);
        const ref = X.parent === Y.parent ? keyOf(Y) : `${Y.parent}/${keyOf(Y)}`;
        (porImg.get(x) || porImg.set(x, []).get(x)).push(ref);
      }
    }
    if (porImg.size) {
      out.push('', '<!-- para imagenes.yaml -->');
      for (const [x, refs] of porImg) { const X = byId.get(x); out.push(`<!-- 07-proyectos/${X.parent}/imagenes/imagenes.yaml → ${keyOf(X)} -->`, `<!--   relacionadas: [${refs.map((r) => JSON.stringify(r)).join(', ')}] -->`); }
    }
    const text = pares.length ? out.join('\n') : '';
    ms.pair = null;
    mxPanel.classList.add('open');
    mxPanel.innerHTML = `
      <div class="mx-panel-head"><span class="ax-kicker ink">Exportar</span><button type="button" class="ax-close" data-mx-cerrar>×</button></div>
      ${text ? `<textarea readonly rows="12" id="mx-out"></textarea><span class="ax-muted" id="mx-copiado">Para pegar en la bitácora (entrada nueva, no editar las viejas).</span>`
        : '<p class="ax-muted">Todavía no hay hilos ni notas en la mesa. Tirá un hilo desde el ◦ de una imagen hasta otra, o elegí dos (clic, shift+clic) y escribí qué cambia entre ellas.</p>'}`;
    mxPanel.querySelector('[data-mx-cerrar]').onclick = closePair;
    if (text) {
      const ta = $('mx-out');
      ta.value = text; ta.select();
      navigator.clipboard?.writeText(text).then(() => { $('mx-copiado').textContent = 'Copiado. Para pegar en la bitácora (entrada nueva, no editar las viejas).'; }).catch(() => {});
    }
  };
}
