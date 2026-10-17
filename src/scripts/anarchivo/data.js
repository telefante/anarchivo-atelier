// Anarchivo — datos del grafo: nodos, vecindad, búsqueda. Sin DOM salvo `srcOf`.
// `buildData(G)` recibe el JSON de #ax-data y devuelve todo lo que la página consulta.
import { norm } from './util.js';

export const KIND = {
  concepto: 'Concepto', activo: 'Proyecto', publicado: 'Publicado', laboratorio: 'Laboratorio', artefacto: 'Artefacto',
  bitacora: 'Bitácora', ensayo: 'Ensayo', convocatoria: 'Convocatoria', imagen: 'Imagen', constelacion: 'Constelación',
};
// orden del ciclo de vida del repo: fuente → en curso → publicado → laboratorio
export const GROUP_ORDER = ['constelacion', 'activo', 'publicado', 'artefacto', 'laboratorio', 'ensayo', 'bitacora', 'convocatoria', 'imagen', 'concepto'];
export const GROUP_LABEL = { activo: 'Proyectos · en curso', publicado: 'Publicado', artefacto: 'Artefactos', laboratorio: 'Laboratorio', ensayo: 'Ensayos', bitacora: 'Bitácora', convocatoria: 'Convocatorias', imagen: 'Imágenes', concepto: 'Conceptos', constelacion: 'Constelaciones' };

export function buildData(G) {
  const concepts = G.concepts.filter((c) => c.count > 0).map((c) => ({ ...c, kind: 'concepto', title: c.label, short: c.label.split(/ y | e |, /)[0] }));
  const nodes = [...concepts, ...G.nodes.map((n) => ({ ...n, short: n.title.split(/ — | – | · /)[0].replace(/ \(.*\)$/, '') }))];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = G.links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l }));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  links.forEach((l) => { adj.get(l.source).push({ id: l.target, l }); adj.get(l.target).push({ id: l.source, l }); });
  const neighbours = (id) => [...new Set(adj.get(id).map((x) => x.id))];

  // por qué resuena un vecino con el nodo en foco
  function reason(focus, other, l) {
    if (l.type === 'concepto') {
      if (focus.kind !== 'concepto') return `concepto: ${other.short}`;
      if (other.kind === 'activo') return other.estado || 'en curso';
      return other.venue || other.sub || '';
    }
    if (l.type === 'relacion') return 'relacionado';
    if (l.type === 'carpeta') return 'misma carpeta';
    if (l.type === 'pertenece') return other.kind === 'imagen' ? 'imagen' : 'proyecto';
    if (l.type === 'relacionada') return 'imagen relacionada';
    if (l.type === 'constela') return other.kind === 'constelacion' ? 'constelación' : other.kind === 'imagen' ? 'imagen' : 'enlazado';
    if (l.type === 'menciona') return l.source === focus.id || l.source.id === focus.id ? `menciona ${other.short}` : `menciona ${focus.short}`;
    return '';
  }


  function search(q) {
    const s = norm(q.trim());
    if (!s) return [];
    const score = (n) => {
      const t = norm(n.title), sh = norm(n.short), extra = norm([n.slug, ...(n.personas || []), ...(n.concepts || [])].join(' '));
      if (sh === s || t === s) return 100;
      if (sh.startsWith(s) || t.startsWith(s)) return 80;
      if (t.includes(s)) return 60;
      if (extra.includes(s)) return 40;
      if (norm(n.sub || n.excerpt || '').includes(s)) return 20;
      return 0;
    };
    return nodes.map((n) => [n, score(n) + (n.kind === 'concepto' ? 5 : n.kind === 'activo' ? 3 : 0)])
      .filter(([, sc]) => sc > 5).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }


  return { concepts, nodes, byId, links, adj, neighbours, reason, search };
}

// ruta de una imagen respetando el base de Astro ('/' en dev, la subcarpeta de Publicar en el deploy)
export function srcOf(n) {
  if (n.src.startsWith('data:')) return n.src; // una imagen recién subida, todavía sin archivo en el índice
  const base = document.getElementById('ax-mesa')?.dataset.base || '/';
  return base + n.src.split('/').map(encodeURIComponent).join('/');
}

// nombre corto de una imagen (sin carpeta ni extensión) y su clave dentro de imagenes.yaml
export const capOf = (n) => n.title.split('/').pop().replace(/\.(png|jpe?g|webp|gif)$/i, '');
export const keyOf = (n) => n.id.slice(`img:${n.parent}/`.length);
