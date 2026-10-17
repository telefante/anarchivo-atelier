// Anarchivo · Mesa — la barra inferior: grupos con nombre y sitio fijo (Figma v6). Aquí solo lo que
// es de la barra misma: plegar la fila «ver» en un resumen, la hoja de herramientas del teléfono,
// atenuar (sin quitar) lo que no aplica en el modo, y avisar su alto al resto de la página.
// El plegado se recuerda en este navegador (localStorage), aparte del estado de la Mesa.
// `initBarra(ctx)` devuelve `syncBarra()`, que la página llama desde `syncTools`.
import { $ } from '../util.js';
import { mx, ms } from './state.js';

const KEY = 'ax-barra-v1';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin almacenamiento: no pasa nada */ } };
const REL = { off: 'Sin relaciones', sel: 'Relaciones de la selección', todas: 'Todas las relaciones' };

// ctx: `syncTools` (repinta la barra al cambiar el modo «Elegir»), `body` (recibe --mx-barra, el alto de la barra, para que tarjetas, panel y galería no queden debajo)
export function initBarra({ body, syncTools }) {
  const barra = $('mx-barra'), ver = $('mx-ver'), pliegue = $('mx-pliegue'), herr = $('mx-herr');
  const st = load(); // { plegada }
  const setPlegada = (f) => {
    st.plegada = f; ver.classList.toggle('plegada', f);
    pliegue.textContent = f ? '+' : '–'; pliegue.setAttribute('aria-expanded', String(!f));
    pliegue.setAttribute('aria-label', f ? 'Desplegar lo que se ve' : 'Plegar lo que se ve');
    save(st);
  };
  pliegue.onclick = () => setPlegada(!st.plegada);
  $('mx-resumen').onclick = () => setPlegada(false);
  // sin elección guardada: «ver» nace plegada donde no cabe en una sola línea o la ventana es baja
  setPlegada(st.plegada ?? (innerWidth < 1280 || innerHeight < 800));

  $('mx-elegir').onclick = () => { ms.elegir = !ms.elegir; syncTools(); };

  herr.onclick = () => {
    const open = barra.classList.toggle('abierta');
    herr.textContent = open ? 'Herramientas –' : 'Herramientas +';
    herr.classList.toggle('on', open); herr.setAttribute('aria-expanded', String(open));
  };

  new ResizeObserver(() => body.style.setProperty('--mx-barra', barra.offsetHeight + 'px')).observe(barra);

  function syncBarra() {
    document.querySelectorAll('.mx-g[data-solo]').forEach((g) => { g.inert = g.dataset.solo !== mx.modo; });
    const lineas = ['rel', 'yaml', 'visual', 'cerca'].filter((k) => mx.lcapa[k] !== false).length + (mx.hilos ? 1 : 0);
    $('mx-resumen-txt').textContent = `${REL[mx.rel] || ''} · ${lineas} líneas de 5 · ${mx.contagio ? 'con' : 'sin'} contagio`;
    const n = $('mx-constel-n');
    const el = $('mx-elegir'); el.classList.toggle('on', ms.elegir); el.setAttribute('aria-pressed', String(ms.elegir));
    n.textContent = ms.sels.size; n.classList.toggle('on', ms.sels.size > 0);
  }
  return { syncBarra };
}
