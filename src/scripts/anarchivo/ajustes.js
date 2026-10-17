// Anarchivo — «Ajustes»: cómo está montado el dashboard, en un solo sitio. Solo en local (`npm run dev`).
// Muestra y deja cambiar el nombre del archivo, dónde está y cómo se llaman sus carpetas, qué no se lee nunca,
// el vocabulario, Conversar y a dónde se publica; y, al lado de cada cosa, cómo está en el disco (existe, cuánto
// tiene), así que sirve también para ver por qué algo no aparece. Guarda en dashboard/anarchivo.config.json
// (scripts/ajustes.mjs). Cambiar un nombre aquí no renombra la carpeta: le dice al dashboard cómo se llama.
import { $, esc } from './util.js';

export function initAjustes() {
  const mesa = $('ax-mesa'), caja = $('ax-ajustes'), dlg = $('ax-aj-dlg'), cuerpo = $('ax-aj-cuerpo'), msg = $('ax-aj-msg');
  if (mesa.dataset.local !== '1') return;
  const base = mesa.dataset.base || '/';
  caja.hidden = false;
  let datos = null;

  const decir = (t, error) => { msg.textContent = t; msg.classList.toggle('error', !!error); };
  const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
  const KIND = { activo: 'proyectos', publicado: 'obras publicadas', artefacto: 'artefactos', laboratorio: 'laboratorio', ensayo: 'ensayos', bitacora: 'entradas de bitácora', convocatoria: 'convocatorias', imagen: 'imágenes', constelacion: 'constelaciones' };

  function estadoDe(e) {
    if (!e?.existe) return '<span class="ax-aj-no">✗ no existe</span>';
    return e.tipo === 'archivo' ? `<span class="ax-aj-si">✓ ${Math.round(e.bytes / 1024)} KB</span>` : `<span class="ax-aj-si">✓ ${e.elementos} dentro</span>`;
  }
  const campo = (k, v, ph = '') => `<input type="text" data-k="${k}" value="${esc(v ?? '')}" placeholder="${esc(ph)}" spellcheck="false" />`;

  function pintar() {
    const { ajustes: a, defaults: d, roles, estado: e, indice: i, siempreFuera } = datos;
    const env = Object.entries(e.entorno).filter(([, v]) => v);
    cuerpo.innerHTML = `
      <section>
        <h4>El archivo</h4>
        <label>Nombre <small>arriba a la izquierda y en el título de la ventana</small>${campo('nombre', a.nombre, d.nombre)}</label>
        <label>Firma <small>cómo apareces en las conversaciones guardadas, y en quién no debe inventar el modelo</small>${campo('firma', a.firma, d.firma)}</label>
        <label>Carpeta del archivo <small>relativa a dashboard/ (<code>..</code> = la carpeta de al lado) o una ruta absoluta</small>${campo('playbook', a.playbook, '..')}</label>
        <p class="ax-aj-estado">${e.raizExiste ? '<span class="ax-aj-si">✓</span>' : '<span class="ax-aj-no">✗ no existe</span>'} <code>${esc(e.raiz)}</code></p>
      </section>
      <section>
        <h4>Carpetas <small>cómo se llama cada una dentro del archivo. Cambiar el nombre aquí no renombra la carpeta</small></h4>
        <div class="ax-aj-tabla">
          ${Object.entries(roles).map(([k, r]) => `<label class="ax-aj-fila"><span><b>${esc(r.label)}</b><small>${esc(r.ayuda)}</small></span>${campo(`carpetas.${k}`, a.carpetas[k], d.carpetas[k])}<span class="ax-aj-estado">${estadoDe(e.carpetas[k])}</span></label>`).join('')}
        </div>
      </section>
      <section>
        <h4>Nunca leer <small>carpetas del archivo que el dashboard no mira nunca (una por línea). Siempre fuera: ${siempreFuera.map((x) => `<code>${esc(x)}</code>`).join(' ')} y las conversaciones</small></h4>
        <textarea data-k="nuncaLeer" rows="3" spellcheck="false">${esc(a.nuncaLeer.join('\n'))}</textarea>
      </section>
      <section>
        <h4>Vocabulario de conceptos</h4>
        <label>Archivo <code>concepts.ts</code> <small>vacío = concepts.ts en la raíz del archivo, o junto a la carpeta de obra publicada</small>${campo('vocabulario', a.vocabulario, 'junto a la obra publicada')}</label>
        <p class="ax-aj-estado">${e.vocabulario.conceptos ? `<span class="ax-aj-si">✓ ${e.vocabulario.conceptos} conceptos</span>` : '<span class="ax-aj-no">✗ sin conceptos: el grafo pierde sus áreas</span>'} <code>${esc(e.vocabulario.ruta || '—')}</code>${e.vocabulario.desdeEntorno ? ' <small>(lo fija CONCEPTS_TS)</small>' : ''}</p>
      </section>
      <section>
        <h4>Conversar</h4>
        <label>Dirección de LM Studio ${campo('conversar.lmstudio', a.conversar.lmstudio, d.conversar.lmstudio)}</label>
        <p class="ax-aj-estado" id="ax-aj-lm">comprobando…</p>
        <label class="ax-aj-chk"><input type="checkbox" data-k="conversar.guardar" ${a.conversar.guardar ? 'checked' : ''} /> guardar cada conversación sola en <code>${esc(a.carpetas.conversaciones)}/</code>, tras cada respuesta</label>
        <label>Presentación <small>quién eres y de qué va tu práctica: el modelo la lee antes que nada. Las reglas (citar, no inventar, marcar sus ideas) van aparte y no cambian</small>
          <textarea data-k="conversar.presentacion" rows="4">${esc(a.conversar.presentacion)}</textarea></label>
      </section>
      <section>
        <details class="ax-aj-mas"${a.publicar.destino ? ' open' : ''}>
          <summary><h4>Publicar una copia online · opcional <small>Anarchivo funciona solo en local. Con un destino aparece «Publicar ↑» (scripts/deploy.sh), que sube una copia estática; tiene que ir con contraseña. Sin destino, nada sale de este ordenador</small></h4></summary>
          <label>Destino (rsync) ${campo('publicar.destino', a.publicar.destino, 'usuario@servidor:/ruta/al/sitio')}</label>
          <label>Subcarpeta <small>la dirección queda en <code>sitio${esc(a.publicar.base)}</code></small>${campo('publicar.base', a.publicar.base, '/anarchivo/')}</label>
        </details>
      </section>
      <section>
        <h4>Índice</h4>
        <p class="ax-aj-estado">${i ? `${i.demo ? '<span class="ax-aj-no">datos de ejemplo: no encontró el archivo</span> · ' : ''}generado ${esc(fecha(i.generado))} · ${i.conceptos} conceptos · ${Object.entries(i.cuentas).map(([k, n]) => `${n} ${esc(KIND[k] || k)}`).join(' · ')}` : 'todavía sin índice'}</p>
        <button type="button" class="ax-chat-mini" id="ax-aj-sync">Sincronizar ahora</button>
      </section>
      ${env.length ? `<section><h4>Variables de entorno <small>mandan sobre lo de aquí mientras estén definidas</small></h4><p class="ax-aj-estado">${env.map(([k, v]) => `<code>${esc(k)}=${esc(v)}</code>`).join('<br>')}</p></section>` : ''}
      <p class="ax-muted">Se guarda en <code>${esc(e.archivo)}</code>, que se puede editar a mano.</p>`;
    $('ax-aj-sync').onclick = () => sincronizar();
    comprobarLm();
  }

  async function comprobarLm() {
    const el = $('ax-aj-lm');
    try {
      const j = await fetch(`${base}__chat-modelos`).then((r) => r.json());
      el.innerHTML = j.ok ? `<span class="ax-aj-si">✓ responde · ${j.modelos.length} modelo${j.modelos.length === 1 ? '' : 's'}${j.modelos.some((m) => m.cargado) ? `, cargado: ${esc(j.modelos.find((m) => m.cargado).id)}` : ''}</span>` : `<span class="ax-aj-no">✗ ${esc(j.error || 'no responde')}</span>`;
    } catch { el.innerHTML = '<span class="ax-aj-no">✗ no responde</span>'; }
  }

  // lo que hay en el formulario, con la forma de los ajustes
  function leerFormulario() {
    const out = { carpetas: {}, conversar: {}, publicar: {} };
    cuerpo.querySelectorAll('[data-k]').forEach((el) => {
      const [k, sub] = el.dataset.k.split('.');
      const v = el.type === 'checkbox' ? el.checked : k === 'nuncaLeer' ? el.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean) : el.value.trim();
      if (sub) out[k][sub] = v; else out[k] = v;
    });
    return out;
  }

  // `reiniciar`: las rutas de escritura se leen al arrancar el servidor; el índice, en cambio, ya sale con lo nuevo
  async function sincronizar(reiniciar) {
    decir('Sincronizando: leyendo el archivo de nuevo (la semejanza de imágenes puede tardar)…');
    const r = await fetch(`${base}__sync`, { method: 'POST' }).then((x) => x.json()).catch((e) => ({ ok: false, error: e.message }));
    if (!r.ok) return decir(`No se pudo sincronizar: ${r.error || 'error'}`, true);
    if (reiniciar === true) return decir('Guardado y sincronizado. Para que Subir, Catalogar y las constelaciones escriban en las carpetas nuevas, reinicia el servidor: npm run dev (Ctrl+C y otra vez) o, en la app, Anarchivo → Reiniciar el servidor. Después, recarga.', true);
    decir('Listo. Recargando…'); setTimeout(() => location.reload(), 400);
  }

  async function guardarAjustes() {
    decir('Guardando…');
    const r = await fetch(`${base}__ajustes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(leerFormulario()) })
      .then((x) => x.json()).catch((e) => ({ ok: false, errores: [e.message] }));
    if (!r.ok) return decir(`No se guardó: ${(r.errores || ['error']).join(' · ')}`, true);
    if (r.resincronizar) return sincronizar(r.reiniciar);
    decir('Guardado. Recargando…'); setTimeout(() => location.reload(), 400);
  }

  async function abrir() {
    decir('');
    cuerpo.innerHTML = '<p class="ax-muted">Leyendo…</p>';
    if (!dlg.open) dlg.showModal();
    try {
      const r = await fetch(`${base}__ajustes`);
      if (r.status === 404) throw new Error('El servidor local arrancó antes de que existiera este panel: detén npm run dev (Ctrl+C) y vuelve a lanzarlo.');
      datos = await r.json();
      if (!datos.ok) throw new Error('no se pudieron leer los ajustes');
      pintar();
    } catch (e) { cuerpo.innerHTML = ''; decir(e.message, true); }
  }

  $('ax-ajustes-btn').onclick = abrir;
  $('ax-aj-cancel').onclick = () => dlg.close();
  $('ax-aj-ok').onclick = guardarAjustes;
  // lo que se teclea en el panel es del panel: ni «/» busca, ni Esc vacía el grafo (Esc sí cierra el diálogo)
  dlg.addEventListener('keydown', (e) => e.stopPropagation());
  // desde la app de escritorio (menú Anarchivo → Ajustes…, ⌘,)
  addEventListener('anarchivo:ajustes', abrir);
  return { abrir };
}
