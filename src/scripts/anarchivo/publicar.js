// Anarchivo — «Publicar»: lanza scripts/deploy.sh desde la página (sync + build + rsync a la versión
// online). Solo en local (`npm run dev`) y solo si hay destino en «Ajustes → Publicar» (o REMOTE_BASE): sin él,
// Anarchivo es solo local y el botón no aparece. En lo desplegado no existe. Pide confirmar con un
// segundo toque, porque publica. El estado lo lleva el servidor de desarrollo (ver scripts/finder.mjs):
// la página se recarga sola a mitad del deploy (cuando el sync regenera el índice) y al volver lo retoma.
import { $ } from './util.js';

export function initPublicar() {
  const mesa = $('ax-mesa'), caja = $('ax-publicar'), btn = $('ax-deploy');
  if (mesa.dataset.local !== '1' || mesa.dataset.publicar !== '1') return;
  const url = `${mesa.dataset.base || '/'}__deploy`;
  const REPOSO = 'Publicar ↑';
  caja.hidden = false;
  let armado = null, reloj = null;
  const hora = (t) => new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const pintar = (j) => {
    const ultima = (j.log || []).at(-1) || '';
    btn.classList.toggle('on', j.estado === 'corriendo');
    btn.classList.toggle('accent', j.estado === 'error');
    if (j.estado === 'corriendo') { btn.textContent = 'Publicando…'; btn.title = ultima || 'deploy.sh en marcha'; }
    else if (j.estado === 'ok') { btn.textContent = `Publicado ${hora(j.fin)} ✓`; btn.title = 'La versión online está al día. Otro toque vuelve a publicar.'; }
    else if (j.estado === 'error') { btn.textContent = 'No se publicó'; btn.title = (j.log || []).slice(-3).join(' · ') || 'deploy.sh falló'; }
    else { btn.textContent = REPOSO; }
    clearTimeout(reloj);
    if (j.estado === 'corriendo') reloj = setTimeout(mirar, 2000);
  };
  // el servicio se carga al arrancar `npm run dev`: si el servidor es anterior, no lo tiene (404) y no sirve insistir
  const sinServicio = () => { clearTimeout(reloj); btn.classList.remove('on'); btn.classList.add('accent'); btn.textContent = 'Reinicia npm run dev'; btn.title = 'El servidor local arrancó antes de que existiera este botón. Detenlo (Ctrl+C) y vuelve a correr npm run dev.'; };
  let caidas = 0;
  async function mirar() {
    try {
      const res = await fetch(url);
      if (res.status === 404) return sinServicio();
      caidas = 0; pintar(await res.json());
    } catch { if (++caidas < 8) reloj = setTimeout(mirar, 4000); /* el servidor se está reiniciando: unos pocos reintentos y ya */ }
  }
  btn.onclick = async () => {
    if (btn.classList.contains('on')) return; // ya hay uno en marcha
    if (!armado) {
      btn.textContent = '¿Publicar? otro toque'; btn.classList.add('accent');
      armado = setTimeout(() => { armado = null; mirar(); }, 4000);
      return;
    }
    clearTimeout(armado); armado = null;
    try {
      const res = await fetch(url, { method: 'POST' });
      if (res.status === 404) return sinServicio();
      pintar(await res.json());
    } catch { btn.textContent = 'No se publicó'; btn.title = 'El servidor local no responde. Reinicia npm run dev.'; }
  };
  mirar();
}
