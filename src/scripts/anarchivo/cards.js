// Anarchivo — contenido de las tarjetas y las listas: agrupado por tipo, vecinos de un nodo, y el cuerpo de
// la tarjeta de búsqueda, de concepto y de ficha. Solo arma HTML (los clics los cablea quien lo inserta).
import { esc } from './util.js';
import { KIND, GROUP_ORDER, GROUP_LABEL, srcOf, capOf } from './data.js';
import { mediosHtml } from './medios.js';
import { mx } from './mesa/state.js';

// ctx: datos (adj, byId, reason, search) y state (búsqueda, ruta, filtros por tipo)
export function createCards({ adj, byId, reason, search, state, boveda, publicado }) {
  // cuántas imágenes tiene cada proyecto: para ofrecer el salto a la Mesa desde su tarjeta
  const imgsDe = new Map();
  for (const n of byId.values()) if (n.kind === 'imagen' && n.src) imgsDe.set(n.parent, (imgsDe.get(n.parent) || 0) + 1);
  function groupList(items, focus) {
    const groups = {};
    items.forEach(({ n, why }) => (groups[n.kind] ||= []).push({ n, why }));
    return GROUP_ORDER.filter((k) => groups[k]).map((k) => `
      <div class="ax-group"><span class="ax-kicker">${GROUP_LABEL[k]} · ${groups[k].length}</span>
      ${groups[k].slice(0, k === 'publicado' ? 8 : 12).map(({ n, why }) => `
        <button type="button" class="ax-item" data-go="${esc(n.id)}"><b>${esc(n.title)}${n.year && n.kind !== 'bitacora' ? ` <i>${esc(n.year)}</i>` : ''}</b>${why ? `<span>${esc(why)}</span>` : ''}</button>`).join('')}
      ${groups[k].length > (k === 'publicado' ? 8 : 12) ? `<span class="ax-muted">+ ${groups[k].length - (k === 'publicado' ? 8 : 12)} más</span>` : ''}
      </div>`).join('');
  }
  function neighbourItems(f, L) {
    const seen = new Set();
    return adj.get(f.id).filter((x) => (!L || L.has(x.id)) && !seen.has(x.id) && seen.add(x.id)).map((x) => ({ n: byId.get(x.id), why: reason(f, byId.get(x.id), x.l) }))
      .sort((a, b) => String(b.n.year || b.n.date || '').localeCompare(String(a.n.year || a.n.date || '')));
  }

  function searchBody() {
    const hits = search(state.q).filter((n) => !state.types.size || n.kind === 'concepto' || state.types.has(n.kind));
    return `<span class="ax-kicker ink">Resuena con «${esc(state.q)}»</span>` +
      (hits.length ? groupList(hits.map((n) => ({ n, why: n.kind === 'concepto' ? 'concepto del dossier' : n.estado || n.venue || '' }))) : '<p class="ax-muted">Nada resuena todavía.</p>');
  }
  function conceptBody(f, L) {
    return `<span class="ax-kicker ink">Resuena con «${esc(f.short.toLowerCase())}»</span>
      ${f.description ? `<p class="ax-desc">${esc(f.description)}</p>` : ''}` + groupList(neighbourItems(f, L));
  }
  // el panel de una constelación: sus imágenes, los textos que enlaza y las notas que hay sobre ellas
  // (la nota de cada imagen — imagenes.yaml — y las que se escribieron en la Mesa entre dos de sus imágenes)
  function constelHtml(n) {
    const imgs = n.imagenes.map((id) => byId.get(id)).filter((i) => i?.src);
    const textos = n.textos.map((id) => byId.get(id)).filter(Boolean);
    const dentro = new Set(n.imagenes);
    const pares = Object.entries(mx.notes || {}).filter(([k, v]) => v?.trim() && k.split('||').every((id) => dentro.has(id) && byId.has(id)));
    const corto = (t, max = 180) => (t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t);
    const conNota = imgs.filter((i) => i.nota);
    return `
      ${imgs.length ? `<div class="ax-group"><span class="ax-kicker">Imágenes · ${imgs.length}</span><div class="ax-cst-grid">${imgs.map((i) =>
        `<button type="button" data-go="${esc(i.id)}" title="${esc(capOf(i))}${i.nota ? ' — ' + esc(i.nota) : ''}"><img src="${srcOf(i)}" alt="${esc(i.title)}" loading="lazy" />${i.nota ? '<i>✎</i>' : ''}</button>`).join('')}</div></div>` : ''}
      ${textos.length ? `<div class="ax-group"><span class="ax-kicker">Textos · ${textos.length}</span>${textos.map((t) =>
        `<button type="button" class="ax-item" data-go="${esc(t.id)}"><b>${esc(t.title)} <i>${KIND[t.kind]}</i></b>${t.excerpt || t.sub ? `<em>${esc(corto(t.excerpt || t.sub))}</em>` : ''}</button>`).join('')}</div>` : ''}
      ${conNota.length || pares.length ? `<div class="ax-group"><span class="ax-kicker">Notas · ${conNota.length + pares.length}</span>
        ${conNota.map((i) => `<button type="button" class="ax-cst-nota" data-go="${esc(i.id)}"><img src="${srcOf(i)}" alt="" loading="lazy" /><span><b>${esc(capOf(i))}</b>${esc(i.nota)}</span></button>`).join('')}
        ${pares.map(([k, v]) => { const [a, b] = k.split('||').map((id) => byId.get(id)); return `<div class="ax-cst-nota"><span><b>${esc(capOf(a))} × ${esc(capOf(b))}</b>${esc(v.trim())}</span></div>`; }).join('')}
      </div>` : ''}`;
  }
  // «+ Imagen» en la tarjeta de un proyecto en curso o de un artefacto, solo donde hay a dónde subir
  // (el servidor local o PUBLIC_INGEST_URL); lo atiende mesa/subir.js
  const subible = (n) => (n.kind === 'activo' || n.kind === 'artefacto') && n.id !== (document.getElementById('ax-mesa')?.dataset.sueltas || '08-imagenes')
    && (() => { const m = document.getElementById('ax-mesa'); return !!m && (m.dataset.local === '1' || !!m.dataset.ingest); })();
  function windowBody(n, L, tab) {
    if (n.kind === 'concepto') return conceptBody(n, L);
    const rel = neighbourItems(n, null);
    const pathShown = state.path;
    const pill = (t, cls = '') => `<span class="ax-pill sm ${cls}">${esc(t)}</span>`;
    const concepts = (n.concepts || []).map((c) => byId.get(`c:${c}`)).filter(Boolean);
    const related = rel.filter((x) => x.n.kind === 'activo' || (n.kind === 'artefacto' && x.n.kind === 'publicado') || x.n.kind === 'artefacto').map((x) => x.n);
    const fields = [
      n.estado ? ['estado', pill(n.estado)] : null,
      concepts.length ? ['conceptos', concepts.map((c) => `<button type="button" class="ax-pill sm" data-go="${esc(c.id)}">${esc(c.short)}</button>`).join('')] : null,
      n.personas?.length ? ['personas', n.personas.map((p) => pill(p)).join('')] : null,
      related.length ? ['resuena', related.map((r) => `<button type="button" class="ax-pill sm soft" data-go="${esc(r.id)}">${esc(r.short)}</button>`).join('')] : null,
      n.kind === 'artefacto' && n.tecnica ? ['técnica', `<span class="ax-val">${esc(n.tecnica)}</span>`] : null,
      n.medidas ? ['medidas', `<span class="ax-val">${esc(n.medidas)}</span>`] : null,
      n.tirada ? ['tirada', `<span class="ax-val">${esc(n.tirada)}</span>`] : null,
      n.ubicacion ? ['dónde está', `<span class="ax-val">${esc(n.ubicacion)}</span>`] : null,
      n.kind === 'artefacto' && /^https?:\/\//.test(n.enlace || '') ? ['enlace', `<a class="ax-val" href="${esc(n.enlace)}" target="_blank" rel="noopener">${esc(n.enlace.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>`] : null,
      n.venue ? ['lugar', `<span class="ax-val">${esc(n.venue)}</span>`] : null,
      n.tags?.length ? ['tags', n.tags.map((t) => pill(t)).join('')] : null,
      n.fecha ? ['fecha', `<span class="ax-val">${esc(n.fecha)}</span>`] : null,
      n.fuente ? ['fuente', `<span class="ax-val">${esc(n.fuente)}</span>`] : null,
    ].filter(Boolean);
    const text = n.kind === 'concepto' ? n.description : (n.excerpt || n.sub || '');
    const file = n.file || n.path;
    const obsidian = file && boveda && !(publicado && file.startsWith(publicado)) ? `obsidian://open?vault=${encodeURIComponent(boveda)}&file=${encodeURIComponent(file.replace(/\.md$/, ''))}` : '';
    const next = concepts.filter((c) => !pathShown.includes(c.id));
    const typeLabel = n.kind === 'activo' ? `Proyecto · ${n.estado || 'en curso'}`
      : n.kind === 'laboratorio' ? 'Proyecto · laboratorio'
      : n.kind === 'artefacto' ? `Artefacto${n.tipo ? ' · ' + n.tipo.replace(/-/g, ' ') : ''}${n.year ? ' · ' + n.year : ''}`
      : n.kind === 'constelacion' ? `Constelación${n.date ? ' · ' + n.date : ''}`
      : n.kind === 'publicado' ? `Publicado${n.year ? ' · ' + n.year : ''}` : KIND[n.kind];
    return `
      <div class="ax-card-head">
        <div class="ax-pills">${pill(typeLabel)}</div>
        ${n.src ? `<img class="ax-card-img" src="${srcOf(n)}" alt="${esc(n.title)}" />` : ''}
        <h2>${esc(n.title)}</h2>
        ${n.sub && n.kind !== 'bitacora' ? `<p class="ax-desc">${esc(n.sub)}</p>` : ''}
        ${file ? `<code>${esc(file)}</code>` : ''}
      </div>
      <div class="ax-seg soft ax-tabs">
        <button type="button" data-tab="leer" class="${tab === 'leer' ? 'on' : ''}">Leer</button>
        <button type="button" disabled title="Decisión abierta: escritura en archivos">Editar</button>
        <button type="button" data-tab="rel" class="${tab === 'rel' ? 'on' : ''}">Relaciones ${rel.length}</button>
      </div>
      ${tab === 'rel' ? groupList(rel) : `
        ${n.kind === 'constelacion' && n.imagenes.length ? `<div class="ax-actions"><button type="button" class="ax-btn" data-mesa-proy="${esc(n.id)}">Poner en la mesa</button><span class="ax-muted">sus ${n.imagenes.length === 1 ? 'imagen entra' : `${n.imagenes.length} imágenes entran`} como una capa</span></div>` : ''}
        ${imgsDe.get(n.id) || subible(n) ? `<div class="ax-actions">${imgsDe.get(n.id) ? `<button type="button" class="ax-btn" data-mesa-proy="${esc(n.id)}">Ver en la mesa</button>` : ''}${subible(n) ? `<button type="button" class="ax-btn" data-subir-proy="${esc(n.id)}" title="Van a su carpeta imagenes/ y a su imagenes.yaml">+ Imagen</button>` : ''}<span class="ax-muted">${imgsDe.get(n.id) ? `${imgsDe.get(n.id)} ${imgsDe.get(n.id) === 1 ? 'imagen' : 'imágenes'} de este proyecto` : 'todavía sin imágenes'}</span></div>`
          : n.kind === 'activo' ? '<p class="ax-muted">Sin imágenes en la mesa: este proyecto todavía no tiene <code>imagenes/imagenes.yaml</code>.</p>' : ''}
        ${fields.length ? `<dl class="ax-fields">${fields.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
        ${text ? `<div class="ax-texto">${esc(text)}</div>` : ''}
        ${n.kind === 'constelacion' ? constelHtml(n) : ''}
        ${mediosHtml(n)}
        ${n.src ? `<div class="ax-actions"><button type="button" class="ax-btn" data-mesa="${esc(n.id)}">Ver en la mesa</button><span class="ax-muted">alt, tags y relacionadas: en imagenes.yaml</span></div>` : ''}
        ${obsidian && !n.src ? `<div class="ax-actions"><a class="ax-btn" href="${obsidian}">Abrir en Obsidian</a><span class="ax-muted">solo lectura</span></div>` : ''}
        ${next.length ? `<div class="ax-group"><span class="ax-kicker">Siguiente salto</span><div class="ax-pills">${next.map((c) => `<button type="button" class="ax-pill sm" data-go="${esc(c.id)}">${esc(c.short)}</button>`).join('')}</div></div>` : ''}
      `}`;
  }

  return { groupList, neighbourItems, searchBody, conceptBody, windowBody };
}
