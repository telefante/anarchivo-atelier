// Lee el playbook en modo solo lectura y genera src/data/index.json.
// Ruta del playbook: variable PLAYBOOK_DIR, o el directorio padre de dashboard/.
// Si no hay playbook (p. ej. sin acceso a iCloud), usa datos de ejemplo.
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, RawImage } from '@xenova/transformers';
import sharp from 'sharp';
import { cargar } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// dónde está el archivo y cómo se llaman sus carpetas: anarchivo.config.json (panel «Ajustes»), ver scripts/config.mjs
const CFG = cargar();
const ROOT = CFG.raiz;
const C = CFG.carpetas;
const OUT = path.join(here, '..', 'src', 'data', 'index.json');

// Carpetas que el dashboard nunca lee (ver 05-ensayos/dashboard-astro.md, "Límites"): `nuncaLeer` de los ajustes,
// más dashboard/, node_modules/ y .git/ siempre. Las conversaciones tampoco: son del chat, no del archivo.
const BLOCKED = new Set([...CFG.bloqueadas, C.conversaciones]);

const exists = async (p) => !!(await fs.stat(p).catch(() => null)); // stat sigue symlinks

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([\p{L}\w-]+):\s*(.*)$/u); // \p{L}: claves como `año`
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

const firstHeading = (body) => body.match(/^#\s+(.+)$/m)?.[1]?.trim();
const firstParagraph = (body) =>
  body.split(/\n\s*\n/).map((s) => s.trim()).find((s) => s && !s.startsWith('#'))?.replace(/\s+/g, ' ');

// Parser mínimo para imagenes.yaml: un mapa a un nivel de {clave: {campos}}.
// No es YAML general — solo el subconjunto fijo que usa este archivo
// (ver la cabecera de cualquier imagenes.yaml para el esquema).
const stripQuotes = (s) => s.trim().replace(/^["']|["']$/g, '');
function parseFlowArray(v) {
  const inner = v.trim().replace(/^\[|\]$/g, '');
  if (!inner.trim()) return [];
  return inner.split(',').map(stripQuotes).filter(Boolean);
}
function parseImagenesYaml(text) {
  const out = {};
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^(\S.*?):\s*$/);
    if (top) { cur = out[top[1]] = {}; continue; }
    const field = line.match(/^\s{2}([\w-]+):\s*(.*)$/);
    if (field && cur) {
      const [, key, rawVal] = field;
      cur[key] = rawVal.trim().startsWith('[') ? parseFlowArray(rawVal) : (rawVal.trim() ? stripQuotes(rawVal) : '');
      // la nota (la escribe la Mesa, ver scripts/finder.mjs) va entre comillas dobles con escapes
      if (key === 'nota' && rawVal.trim().startsWith('"')) { try { cur[key] = JSON.parse(rawVal.trim()); } catch { /* se queda como texto */ } }
    }
  }
  return out;
}

// Notas de imágenes del dossier: esas imágenes viven en otro repositorio (y se publican), así que su
// nota no se escribe allí sino en el playbook, en este archivo aparte (lo escribe la Mesa, ver scripts/finder.mjs).
const NOTAS_DOSSIER = path.join(C.artefactos, 'imagenes-dossier.yaml');
let notasDossierP = null;
const notasDossier = () => (notasDossierP ||= fs.readFile(path.join(ROOT, NOTAS_DOSSIER), 'utf8').then(parseImagenesYaml).catch(() => ({})));

// el original de una imagen catalogada (scripts/archivo.mjs): la imagen del playbook es solo su vista previa y estos
// campos (original_* en el imagenes.yaml) dicen dónde vive el original, que no se copia. undefined si no es una.
const origenDe = (m) => (m?.original_ruta ? {
  fuente: m.original_fuente || '', ruta: m.original_ruta, formato: m.original_formato || '',
  bytes: Number(m.original_bytes) || 0, px: m.original_px || '', url: m.original_url || '',
} : undefined);

async function readImagenes(dir, projectId) {
  // Buscar imagenes.yaml (07-proyectos)
  const yamlFile = path.join(dir, 'imagenes', 'imagenes.yaml');
  if (await exists(yamlFile)) {
    const text = await fs.readFile(yamlFile, 'utf8').catch(() => '');
    const entries = parseImagenesYaml(text);
    return Object.entries(entries).map(([key, meta]) => ({
      key,
      projectId,
      file: path.join('imagenes', key),
      alt: meta.alt || '',
      tags: meta.tags || [],
      relacionadas: meta.relacionadas || [],
      fecha: meta.fecha || '',
      fuente: meta.fuente || '',
      nota: meta.nota || '',
      orig: origenDe(meta),
    }));
  }

  // Auto-descubrir imágenes en images/ (dossier)
  const imagesDir = path.join(dir, 'images');
  if (!(await exists(imagesDir))) return [];

  const files = await fs.readdir(imagesDir).catch(() => []);
  const notas = await notasDossier();
  const imageExts = /\.(jpe?g|png|webp|gif|svg)$/i;

  return files
    .filter(f => imageExts.test(f))
    .map(key => ({
      key,
      projectId,
      file: path.join('images', key),
      alt: key.replace(/\.[^.]+$/, ''),
      tags: [],
      relacionadas: [],
      fecha: '',
      fuente: '',
      nota: notas[`${path.basename(dir)}/${key}`]?.nota || '',
    }));
}

// 08-imagenes/ (sueltas): carpeta plana — las fotos van directo en ella (las pone add-image.mjs o
// el botón «Subir imagen» de la Mesa) y su imagenes.yaml, si existe, vive al lado. Una foto sin
// entrada en el yaml entra igual, con su nombre.
async function readSueltas(dir, projectId) {
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f) && !f.startsWith('.'));
  const meta = parseImagenesYaml(await fs.readFile(path.join(dir, 'imagenes.yaml'), 'utf8').catch(() => ''));
  return files.sort().map((key) => ({
    key, projectId, file: key,
    alt: meta[key]?.alt || '', tags: meta[key]?.tags || [], relacionadas: meta[key]?.relacionadas || [],
    fecha: meta[key]?.fecha || '', fuente: meta[key]?.fuente || '', nota: meta[key]?.nota || '', orig: origenDe(meta[key]),
  }));
}

// 02-artefactos/: los objetos (libros, gráficas enmarcadas, originales). Un artefacto = una carpeta con
// su ficha (<slug>/<slug>.md) y sus fotos en imagenes/ (el imagenes.yaml es opcional, como en las sueltas).
// Los archivos sueltos de la carpeta (artefactos.md, obras.md…) son índices, no artefactos.
async function readArtefactos() {
  const out = [];
  for (const e of await readDir(C.artefactos)) {
    const dir = path.join(ROOT, C.artefactos, e.slug);
    if (!e.file || !(await fs.stat(dir).catch(() => null))?.isDirectory()) continue;
    const id = `art:${e.slug}`;
    const imagenes = (await readSueltas(path.join(dir, 'imagenes'), id)).map((i) => ({ ...i, file: path.join('imagenes', i.key) }));
    // el texto de la ficha: el primer párrafo de «## Qué es» (la ficha abre con una foto y una nota de apertura)
    const que = (e._body || '').split(/^## +Qué es\s*$/m)[1]?.split(/^## /m)[0] || '';
    const excerpt = (que.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !/^(<!--|!\[)/.test(x)) || '')
      .replace(/\s*\*\([^)]*\)\*\s*$/, '').replace(/\s+/g, ' ');
    out.push({ ...e, excerpt, id, imagenes });
  }
  return out;
}

// 09-constelaciones/: un archivo por constelación — un conjunto con nombre que cruza imágenes y textos, el paso
// previo a un concepto. Frontmatter: title, fecha, concepts (opcional, del vocabulario del dossier) y dos listas
// en bloque (`  - "…"`): `imagenes` ("<proyecto>/<archivo>": el id de la imagen sin `img:`) y `textos` (ids de
// nodo — `ensayo:…`, `bitacora:AAAA-MM-DD`, un proyecto — o la ruta del archivo). El cuerpo es de quien la armó.
// Las escribe la Mesa (scripts/finder.mjs, /__constelacion) y se pueden editar a mano. Un .md de la carpeta
// sin ninguna de las dos listas (un índice, una nota) no es una constelación.
function parseConstelacion(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  let lista = null;
  const val = (v) => { v = v.trim(); if (v.startsWith('"')) { try { return JSON.parse(v); } catch { /* se queda como texto */ } } return stripQuotes(v); };
  for (const line of (m?.[1] || '').split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && lista) { lista.push(val(item[1])); continue; }
    const kv = line.match(/^([\p{L}\w-]+):\s*(.*)$/u);
    if (!kv) continue;
    lista = null;
    const v = kv[2].trim();
    if (!v) meta[kv[1]] = lista = [];
    else meta[kv[1]] = v.startsWith('[') ? parseList(v) : val(v);
  }
  return { meta, body: m ? text.slice(m[0].length) : text };
}
async function readConstelaciones() {
  const rel = C.constelaciones, dir = path.join(ROOT, rel);
  const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String);
  const texto = (v) => (typeof v === 'string' ? v : '');
  const out = [];
  for (const f of (await fs.readdir(dir).catch(() => [])).filter((x) => x.endsWith('.md') && !x.startsWith('.')).sort()) {
    const { meta, body } = parseConstelacion(await fs.readFile(path.join(dir, f), 'utf8').catch(() => ''));
    if (!('imagenes' in meta) && !('textos' in meta)) continue;
    const slug = f.replace(/\.md$/, '');
    const excerpt = (body.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !/^(#|<!--)/.test(x)) || '').replace(/\s+/g, ' ').slice(0, 600);
    out.push({
      slug, id: `cst:${slug}`, title: texto(meta.title) || firstHeading(body) || slug, fecha: texto(meta.fecha),
      concepts: lista(meta.concepts), imagenes: lista(meta.imagenes), textos: lista(meta.textos), excerpt, file: path.join(rel, f),
    });
  }
  return out;
}

// CV: calcula embeddings CLIP para encontrar relaciones automáticas entre imágenes
let imageEmbedder = null;
async function initImageEmbedder() {
  if (imageEmbedder) return imageEmbedder;
  console.log('▸ Cargando modelo CLIP para análisis visual...');
  try {
    // 'feature-extraction' es la tarea para modelos de texto — con CLIP
    // dispara el tokenizer de texto sobre la imagen (TypeError: text.split
    // is not a function). La tarea correcta para embeddings visuales es
    // 'image-feature-extraction' (ver models.js, CLIPVisionModelWithProjection).
    imageEmbedder = await pipeline('image-feature-extraction', CLIP_MODEL);
    console.log('✓ CLIP cargado');
    return imageEmbedder;
  } catch (e) {
    console.warn('✗ CLIP no disponible:', e.message);
    return null;
  }
}

async function getImageEmbedding(filePath) {
  try {
    if (!imageEmbedder) return null;
    // Cargar imagen como RawImage que transformers.js entiende
    const image = await RawImage.read(filePath);
    // Redimensionar a 224×224 (tamaño que espera CLIP)
    image.resize(224, 224);
    // Pasar a CLIP para obtener embeddings
    const result = await imageEmbedder(image);
    return Array.from(result.data);
  } catch (e) {
    console.warn(`✗ Error en embedding ${filePath}:`, e.message);
    return null;
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return Math.abs(dot) / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// Caché de embeddings: calcular CLIP de ~900 imágenes ronda el minuto, pero una imagen
// no cambia entre syncs. Se guarda por ruta con (tamaño, mtime); solo se recalculan las
// nuevas o modificadas. Cada vector va como Float32 en base64 (≈2 KB, no 512 números en JSON).
// Cambiar el modelo invalida todo (CLIP_MODEL forma parte del archivo). `.cache/` está en .gitignore.
const CLIP_MODEL = 'Xenova/clip-vit-base-patch32';
const CACHE_FILE = path.join(here, '..', '.cache', 'clip-embeddings.json');
const packVec = (v) => Buffer.from(new Float32Array(v).buffer).toString('base64');
const unpackVec = (b64) => { const b = Buffer.from(b64, 'base64'); return Array.from(new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4)); };

async function readEmbCache() {
  try {
    const c = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
    return c.model === CLIP_MODEL ? c.items : {};
  } catch { return {}; }
}

async function findAutoRelations(imageList) {
  const cache = await readEmbCache();
  const next = {};
  const embeddings = new Map();
  const pendientes = [];
  for (const img of imageList) {
    const st = await fs.stat(img.fullPath).catch(() => null);
    if (!st) continue;
    const hit = cache[img.fullPath];
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) {
      if (hit.emb) embeddings.set(img.id, unpackVec(hit.emb));
      next[img.fullPath] = hit; // también los fallidos (emb: null): no se reintentan hasta que el archivo cambie
    } else pendientes.push({ img, st });
  }
  console.log(`▸ Embeddings: ${embeddings.size} en caché, ${pendientes.length} por calcular`);

  if (pendientes.length) {
    const embedder = await initImageEmbedder();
    if (!embedder) return [];
    for (const { img, st } of pendientes) {
      const embedding = await getImageEmbedding(img.fullPath);
      if (embedding) embeddings.set(img.id, embedding);
      next[img.fullPath] = { size: st.size, mtimeMs: st.mtimeMs, emb: embedding ? packVec(embedding) : null };
    }
  }
  // la caché se reescribe con lo vigente: las imágenes que ya no existen salen solas
  await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify({ model: CLIP_MODEL, items: next }));
  console.log(`✓ ${embeddings.size} embeddings`);

  const relations = [];
  const ids = Array.from(embeddings.keys());
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const sim = cosineSimilarity(embeddings.get(ids[i]), embeddings.get(ids[j]));
      if (sim > 0.85) {
        relations.push({ source: ids[i], target: ids[j], similarity: sim, type: 'visual' });
      }
    }
  }
  console.log(`▸ Encontradas ${relations.length} relaciones visuales`);
  return relations;
}

async function readEntry(dir, name) {
  const full = path.join(dir, name);
  const st = await fs.stat(full).catch(() => null);
  if (!st) return null;
  let file = full;
  if (st.isDirectory()) {
    const inside = await fs.readdir(full).catch(() => []);
    // `<carpeta>.md` antes que cualquier otro .md: en el dossier el archivo principal se llama como la carpeta,
    // y su gemelo `index.es.md` (solo texto traducido, sin `concepts:`) no debe ganarle por orden alfabético
    const pick = ['concepto.md', 'README.md', 'index.md', 'readme.md', `${name}.md`].find((f) => inside.includes(f)) || inside.find((f) => f.endsWith('.md'));
    if (!pick) return { slug: name, title: name, meta: {}, excerpt: '', mtime: st.mtimeMs, path: name };
    file = path.join(full, pick);
  } else if (!name.endsWith('.md')) return null;
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  const { meta, body } = frontmatter(text);
  const fst = await fs.stat(file).catch(() => st);
  return {
    slug: name.replace(/\.md$/, ''),
    title: meta.titulo || firstHeading(body) || name.replace(/\.md$/, ''),
    meta,
    excerpt: (firstParagraph(body) || '').slice(0, 220),
    mtime: fst.mtimeMs,
    path: path.relative(ROOT, full),
    file: path.relative(ROOT, file),
    _body: body.slice(0, 20000), // solo para detectar menciones; no se escribe en index.json
  };
}

async function readDir(rel) {
  const dir = path.join(ROOT, rel);
  if (BLOCKED.has(rel) || !(await exists(dir))) return [];
  const names = (await fs.readdir(dir)).filter((n) => !n.startsWith('.') && !BLOCKED.has(n));
  const items = (await Promise.all(names.map((n) => readEntry(dir, n)))).filter(Boolean);
  return items.sort((a, b) => b.mtime - a.mtime);
}

async function readBitacora() {
  const file = path.join(ROOT, C.bitacora);
  if (!(await exists(file))) return [];
  const text = await fs.readFile(file, 'utf8');
  const entries = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^#{1,6}\s*(\d{4}-\d{2}-\d{2})\s*[-—:·]?\s*(.*)$/);
    if (h) {
      if (cur) entries.push(cur);
      cur = { date: h[1], title: h[2].trim(), lines: [] };
    } else if (cur) cur.lines.push(line);
  }
  if (cur) entries.push(cur);
  return entries
    .map((e) => {
      const body = e.lines.join('\n').trim();
      return { date: e.date, title: e.title || firstParagraph(body)?.slice(0, 80) || '', body: firstParagraph(body) || '', _body: body };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function readConvocatorias() {
  const items = await readDir(C.convocatorias);
  return items.map((c) => ({
    title: c.title,
    slug: c.slug,
    estado: (c.meta.estado || 'idea').toLowerCase(),
    deadline: c.meta.deadline || '',
    path: c.path,
    excerpt: c.excerpt,
    _body: c._body,
  }));
}

// ---------- Grafo: proyectos ↔ conceptos (vocabulario del dossier) ----------

// Listas en frontmatter: `["a", "b"]` (estilo dossier) o `a, b`.
function parseList(v) {
  if (!v) return [];
  if (v.startsWith('[')) {
    try { return JSON.parse(v.replace(/'/g, '"')); } catch { /* cae al split */ }
  }
  return v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
}

// El vocabulario es un concepts.ts: el de los ajustes, o el de la raíz del archivo, o el que está junto a la
// carpeta de obra publicada (en el Atelier, src/data/concepts.ts del repo del dossier, junto a src/data/projects).
async function readConceptVocabulary() {
  const real = await fs.realpath(path.join(ROOT, C.publicado)).catch(() => null);
  const enRaiz = existsSync(path.join(ROOT, 'concepts.ts')) && path.join(ROOT, 'concepts.ts');
  const file = process.env.CONCEPTS_TS || (CFG.vocabulario && path.resolve(ROOT, CFG.vocabulario)) || enRaiz || (real && path.join(real, '..', 'concepts.ts'));
  const text = file ? await fs.readFile(file, 'utf8').catch(() => '') : '';
  const vocab = {};
  for (const m of text.matchAll(/^ {2}'([a-z-]+)': \{([\s\S]*?)^ {2}\},/gm)) {
    const block = m[2];
    const en = block.match(/^ {4}label: '([^']+)'/m)?.[1];
    const es = block.match(/es: \{[\s\S]*?label: '([^']+)'/)?.[1];
    const desc = block.match(/es: \{[\s\S]*?description:\s*'([^']+)'/)?.[1];
    vocab[m[1]] = { label: es || en || m[1], description: desc || '' };
  }
  return vocab;
}

// PDFs y audio de un proyecto, para el visor y el mini-reproductor de su tarjeta. Recorre la carpeta
// (hasta 4 niveles) sin entrar en `imagenes/` ni en las piezas que son proyecto por sí mismas (tienen
// su concepto.md y su propia tarjeta). Los masters .wav/.aif quedan fuera: pesan demasiado para servirlos.
const MEDIO = { '.pdf': 'pdf', '.mp3': 'audio', '.m4a': 'audio', '.ogg': 'audio' };
async function readMedios(dir, depth = 0, base = dir) {
  const out = [];
  for (const d of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (d.name.startsWith('.') || d.name === 'imagenes' || d.name === 'node_modules') continue;
    const full = path.join(dir, d.name);
    const st = await fs.stat(full).catch(() => null); // stat sigue symlinks
    if (!st) continue;
    if (st.isDirectory()) {
      if (depth < 3 && !(await exists(path.join(full, 'concepto.md')))) out.push(...await readMedios(full, depth + 1, base));
      continue;
    }
    const tipo = MEDIO[path.extname(d.name).toLowerCase()];
    if (tipo) out.push({ tipo, name: d.name.replace(/\.[^.]+$/, ''), file: path.relative(ROOT, full), sub: path.relative(base, full), bytes: st.size });
  }
  return depth ? out : out.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.name.localeCompare(b.name));
}

// Proyectos en curso, incluidas las piezas dentro de carpetas paraguas
// (p. ej. proyectos/composiciones-sonoras/<pieza>/concepto.md).
async function readActiveProjects() {
  const top = await readDir(C.proyectos);
  const out = [];
  for (const p of top) {
    const dir = path.join(ROOT, C.proyectos, p.slug);
    out.push({ ...p, id: p.slug, imagenes: await readImagenes(dir, p.slug), medios: await readMedios(dir) });
    const subs = await fs.readdir(dir).catch(() => []);
    for (const s of subs) {
      if (s.startsWith('.')) continue;
      if (!(await exists(path.join(dir, s, 'concepto.md')))) continue;
      const e = await readEntry(dir, s);
      const subId = `${p.slug}/${s}`;
      if (e) out.push({ ...e, id: subId, parent: p.slug, path: path.join(C.proyectos, p.slug, s),
        imagenes: await readImagenes(path.join(dir, s), subId), medios: await readMedios(path.join(dir, s)) });
    }
  }
  return out;
}

function buildGraph(active, published, vocab, textos = {}, laboratorio = [], artefactos = [], constelaciones = []) {
  const nodes = [];
  const links = [];
  const count = {};
  const addConcepts = (id, list) => {
    for (const c of list) {
      if (!vocab[c]) continue;
      count[c] = (count[c] || 0) + 1;
      links.push({ source: id, target: `c:${c}`, type: 'concepto' });
    }
  };
  for (const p of active) {
    const concepts = parseList(p.meta.concepts);
    nodes.push({
      id: p.id, kind: 'activo', title: p.meta.title || p.title, sub: p.meta.subtitle || '',
      estado: p.meta.estado || '', concepts, personas: parseList(p.meta.personas),
      path: p.path, file: p.file, excerpt: p.excerpt, parent: p.parent || null, year: (p.meta.abierto || '').slice(0, 4),
      ...(p.medios?.length ? { medios: p.medios } : {}),
    });
    addConcepts(p.id, concepts);
    if (p.parent) links.push({ source: p.id, target: p.parent, type: 'carpeta' });
  }
  const ids = new Set(nodes.map((n) => n.id));
  for (const p of active) {
    for (const r of parseList(p.meta.relacionados)) {
      if (ids.has(r)) links.push({ source: p.id, target: r, type: 'relacion' });
    }
  }

  // Imágenes catalogadas (imagenes/imagenes.yaml, ver readImagenes): un nodo
  // por entrada, enlazado a su proyecto. `relacionadas` se declara a mano.
  // Se incluyen imágenes de 07-proyectos (active) y _dossier-projects (published).
  // Proyectos publicados solo tienen `.slug` en este punto (su `pub:` id se
  // asigna más abajo) — usamos el mismo prefijo aquí para que coincida.
  const projId = (p) => p.id || `pub:${p.slug}`;
  const imgKeysByProject = new Map(
    [...active, ...(published || []), ...artefactos].map((p) => [projId(p), new Set((p.imagenes || []).map((i) => i.key))])
  );
  for (const p of [...active, ...(published || []), ...artefactos]) {
    const pid = projId(p);
    for (const img of p.imagenes || []) {
      const id = `img:${pid}/${img.key}`;
      nodes.push({
        id, kind: 'imagen', title: img.alt || img.key, sub: img.tags.join(', '),
        tags: img.tags, fecha: img.fecha, fuente: img.fuente, nota: img.nota || '', parent: pid, ...(img.orig ? { orig: img.orig } : {}),
        path: path.join(p.path, img.file), file: path.join(p.path, img.file),
      });
      links.push({ source: id, target: pid, type: 'pertenece' });
    }
  }
  const resolveImgRef = (fromProjectId, ref) => {
    if (imgKeysByProject.get(fromProjectId)?.has(ref)) return `img:${fromProjectId}/${ref}`;
    const i = ref.indexOf('/');
    if (i > 0) {
      const otherProject = ref.slice(0, i);
      const otherKey = ref.slice(i + 1);
      if (imgKeysByProject.get(otherProject)?.has(otherKey)) return `img:${otherProject}/${otherKey}`;
    }
    return null;
  };
  for (const p of active) {
    for (const img of p.imagenes || []) {
      for (const ref of img.relacionadas) {
        const target = resolveImgRef(p.id, ref);
        if (target) links.push({ source: `img:${p.id}/${img.key}`, target, type: 'relacionada' });
      }
    }
  }
  for (const p of published) {
    const concepts = parseList(p.meta.concepts);
    if (!concepts.length) continue;
    const id = `pub:${p.slug}`;
    nodes.push({
      id, kind: 'publicado', title: p.meta.title || p.title, sub: p.meta.subtitle || '',
      year: p.meta.year || '', venue: p.meta.venue || '', concepts, path: p.path, file: p.file, excerpt: p.excerpt,
    });
    addConcepts(id, concepts);
  }
  // Artefactos (02-artefactos/): el objeto cuelga de la obra de la que salió — `proyecto:` (slug del
  // dossier) y `relacionados:` (ids de proyectos en curso). `concepts:` es opcional; sin él, llega a los
  // conceptos a través de su obra.
  for (const a of artefactos) {
    const m = a.meta, concepts = parseList(m.concepts);
    nodes.push({
      id: a.id, kind: 'artefacto', title: m.title || a.title, sub: [m.tecnica, m.medidas].filter(Boolean).join(' · '),
      year: m['año'] || '', tipo: m.tipo || '', tecnica: m.tecnica || '', medidas: m.medidas || '', tirada: m.tirada || '',
      estado: m.estado || '', ubicacion: m.ubicacion || '', enlace: m.enlace || m.dossier || '', concepts, path: a.path, file: a.file, excerpt: a.excerpt,
    });
    addConcepts(a.id, concepts);
    for (const r of [m.proyecto && `pub:${m.proyecto}`, ...parseList(m.relacionados)]) {
      if (r && nodes.some((n) => n.id === r)) links.push({ source: a.id, target: r, type: 'relacion' });
    }
  }
  // Laboratorio (_lab-projects/): sin frontmatter propio — entran igual, para
  // que el ciclo de vida completo (fuente → en curso → publicado → laboratorio)
  // sea visible. Sus vínculos salen solo de menciones de texto (abajo).
  for (const p of laboratorio) {
    nodes.push({
      id: `lab:${p.slug}`, kind: 'laboratorio', title: p.meta.title || p.title, sub: p.excerpt || '',
      concepts: [], path: p.path, file: p.file, excerpt: p.excerpt,
    });
  }

  // Bitácora, ensayos y convocatorias: nodos que se enlazan con los proyectos
  // (en curso o de laboratorio) que MENCIONAN en su texto (por slug o por
  // título corto). Los proyectos de laboratorio se cruzan entre sí igual.
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const keyOf = (id, titleRaw) => {
    const k = [norm(id.split('/').pop().replace(/[-_]/g, ' '))];
    const short = norm(titleRaw.split(/ — | – | · |\(/)[0].trim());
    if (short.length >= 8 && short !== 'live cinema') k.push(short);
    return { id, k: [...new Set(k)].filter((x) => x.length >= 5) };
  };
  const keys = [
    ...active.map((p) => keyOf(p.id, p.meta.title || p.title)),
    ...laboratorio.map((p) => keyOf(`lab:${p.slug}`, p.meta.title || p.title)),
  ];
  // los proyectos de laboratorio no declaran concepts/relacionados: sus
  // vínculos con proyectos activos u otros de laboratorio salen de menciones
  // en su propio texto (mismo mecanismo que bitácora/ensayos, ver addTexts).
  for (const p of laboratorio) {
    const text = norm(`${p.title || ''}\n${p._body || ''}`);
    const hits = keys.filter((k) => k.id !== `lab:${p.slug}` && k.k.some((x) => text.includes(x))).map((k) => k.id);
    for (const h of hits) links.push({ source: `lab:${p.slug}`, target: h, type: 'menciona' });
  }
  const addTexts = (kind, items, idOf, titleOf) => {
    for (const it of items) {
      const id = `${kind}:${idOf(it)}`;
      const text = norm(`${it.title || ''}\n${it._body || ''}`);
      const hits = keys.filter((k) => k.k.some((x) => text.includes(x))).map((k) => k.id);
      nodes.push({ id, kind, title: titleOf(it), sub: it.excerpt || it.body || '', year: (it.date || '').slice(0, 4),
        date: it.date || '', path: it.path || (kind === 'bitacora' ? C.bitacora : ''), file: it.file || it.path || C.bitacora, menciona: hits });
      for (const h of hits) links.push({ source: id, target: h, type: 'menciona' });
    }
  };
  addTexts('bitacora', textos.bitacora || [], (b) => b.date, (b) => `Bitácora ${b.date}`);
  addTexts('ensayo', textos.ensayos || [], (e) => e.slug, (e) => e.meta?.title || e.title);
  addTexts('convocatoria', textos.convocatorias || [], (c) => c.slug, (c) => c.title);

  // Constelaciones (09-constelaciones/): cada una enlaza sus imágenes y sus textos (`constela`). Sus `concepts:`
  // la anclan al vocabulario sin contarla como obra del concepto: no cambia el tamaño ni el orden de las áreas.
  // Una referencia que ya no se encuentra (imagen movida, texto renombrado) se salta; el archivo no se toca.
  const idDe = new Set(nodes.map((n) => n.id));
  const porArchivo = new Map(nodes.filter((n) => n.kind !== 'imagen' && n.kind !== 'bitacora' && n.file).map((n) => [n.file, n.id]));
  for (const c of constelaciones) {
    const imagenes = [...new Set(c.imagenes.map((r) => `img:${r.replace(/^img:/, '')}`))].filter((id) => idDe.has(id));
    const enlazados = [...new Set(c.textos.map((r) => (idDe.has(r) ? r : porArchivo.get(r))))].filter((id) => id && !id.startsWith('img:'));
    const cs = c.concepts.filter((s) => vocab[s]);
    nodes.push({
      id: c.id, kind: 'constelacion', title: c.title, sub: '', excerpt: c.excerpt, date: c.fecha, year: c.fecha.slice(0, 4),
      concepts: cs, imagenes, textos: enlazados, path: c.file, file: c.file,
    });
    for (const t of [...imagenes, ...enlazados]) links.push({ source: c.id, target: t, type: 'constela' });
    for (const s of cs) links.push({ source: c.id, target: `c:${s}`, type: 'concepto' });
  }

  const concepts = Object.entries(vocab).map(([id, v]) => ({ id: `c:${id}`, slug: id, ...v, count: count[id] || 0 }));
  return { concepts, nodes, links };
}

const sample = {
  fuente: [{ title: 'Idea de ejemplo A', path: 'proyectos/idea-a' }, { title: 'Idea de ejemplo B', path: 'proyectos/idea-b' }],
  encurso: [{ title: 'Proyecto de ejemplo 1', path: 'proyectos/ejemplo-1' }, { title: 'Proyecto de ejemplo 2', path: 'proyectos/ejemplo-2' }],
  publicado: [{ title: 'Proyecto publicado A', path: '_dossier-projects/a' }],
  laboratorio: [{ title: 'Laboratorio A', path: '_lab-projects/a' }],
  bitacora: [
    { date: '2026-09-26', title: 'Entrada de ejemplo', body: 'Texto de ejemplo de la bitácora.' },
    { date: '2026-09-19', title: 'Otra entrada', body: 'Otra nota breve, fechada.' },
  ],
  convocatorias: [{ title: 'Convocatoria de ejemplo', slug: 'ejemplo', estado: 'en trabajo', deadline: '2026-10-15' }],
  ensayos: [{ title: 'Ensayo de ejemplo', excerpt: 'Primera línea del ensayo.', path: 'ensayos/ejemplo.md' }],
};

// La Mesa (vista de imágenes en /anarchivo) necesita servir los archivos
// catalogados: se copian a public/mesa/<proyecto>/<clave> (.gitignored).
// Solo se copia si cambió el tamaño o la fecha — el original no se toca.
const MESA = path.join(here, '..', 'public', 'mesa');
async function copyImagenes(nodes) {
  for (const n of nodes) {
    if (n.kind !== 'imagen') continue;
    const src = path.join(ROOT, n.file);
    const st = await fs.stat(src).catch(() => null);
    if (!st) continue;
    // ':' rompe el resolvedor de rutas de Astro/Vite (pub:slug/...) — se
    // sanea solo en la ruta física servida, el id lógico interno no cambia.
    const rel = n.id.slice('img:'.length).replace(/:/g, '_');
    const dst = path.join(MESA, rel);
    const dt = await fs.stat(dst).catch(() => null);
    if (!dt || dt.size !== st.size || dt.mtimeMs < st.mtimeMs) {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(src, dst);
    }
    n.src = `mesa/${rel}`;
  }
}

// Lo mismo para los PDFs y el audio de cada proyecto: public/medios/<proyecto>/<ruta dentro del proyecto>.
const MEDIOS = path.join(here, '..', 'public', 'medios');
async function copyMedios(nodes) {
  for (const n of nodes) {
    for (const m of n.medios || []) {
      const src = path.join(ROOT, m.file);
      const st = await fs.stat(src).catch(() => null);
      if (!st) continue;
      const rel = path.join(n.id, m.sub).replace(/:/g, '_');
      const dst = path.join(MEDIOS, rel);
      const dt = await fs.stat(dst).catch(() => null);
      if (!dt || dt.size !== st.size || dt.mtimeMs < st.mtimeMs) {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.copyFile(src, dst);
      }
      m.src = `medios/${rel}`;
    }
  }
}

async function main() {
  const hasPlaybook = await exists(path.join(ROOT, C.proyectos)) || await exists(path.join(ROOT, C.bitacora));
  let data;
  if (!hasPlaybook) {
    console.warn(`[sync] Playbook no encontrado en ${ROOT}. Uso datos de ejemplo. Define PLAYBOOK_DIR.`);
    data = { ...sample, demo: true };
  } else {
    const proyectos = await readDir(C.proyectos);
    const fuente = proyectos.filter((p) => (p.meta.estado || '').toLowerCase() === 'fuente');
    const encurso = proyectos.filter((p) => (p.meta.estado || '').toLowerCase() !== 'fuente');
    const publicado = await readDir(C.publicado);
    // Cargar imágenes de cada proyecto publicado
    for (const p of publicado) {
      p.imagenes = await readImagenes(path.join(ROOT, C.publicado, p.slug), p.slug);
    }
    
    // Cargar imágenes de 08-imagenes (sueltas)
    const sueltasDir = path.join(ROOT, C.imagenes);
    const sueltasImagenes = await readSueltas(sueltasDir, C.imagenes);
    const sueltas = sueltasImagenes.length > 0 ? [{
      slug: C.imagenes,
      title: 'Sueltas',
      meta: {},
      excerpt: 'Imágenes añadidas manualmente',
      mtime: Date.now(),
      path: C.imagenes,
      file: C.imagenes,
      imagenes: sueltasImagenes,
    }] : [];

    data = {
      demo: false,
      fuente,
      encurso: [...encurso, ...sueltas],
      publicado,
      laboratorio: await readDir(C.laboratorio),
      bitacora: await readBitacora(),
      convocatorias: await readConvocatorias(),
      ensayos: await readDir(C.ensayos),
      artefactos: await readArtefactos(),
    };
  }
  if (!data.demo) {
    const vocab = await readConceptVocabulary();
    // las sueltas entran al grafo como un proyecto más («Sueltas»): sin él sus imágenes no tendrían de dónde colgar
    const sueltasGrafo = data.encurso.filter((p) => p.slug === C.imagenes).map((p) => ({ ...p, id: p.slug, meta: { estado: 'sueltas' } }));
    data.grafo = buildGraph([...await readActiveProjects(), ...sueltasGrafo], data.publicado, vocab,
      { bitacora: data.bitacora, ensayos: data.ensayos, convocatorias: data.convocatorias }, data.laboratorio, data.artefactos, await readConstelaciones());
  }
  if (data.grafo) {
    await copyImagenes(data.grafo.nodes);
    await copyMedios(data.grafo.nodes);
    // Relaciones visuales automáticas (CLIP): compara cada imagen catalogada
    // contra las demás sin importar su proyecto de origen — cruza imágenes
    // de 07-proyectos y de _dossier-projects/08-imagenes por igual.
    const imagenes = data.grafo.nodes
      .filter((n) => n.kind === 'imagen')
      .map((n) => ({ id: n.id, fullPath: path.join(ROOT, n.file) }));
    const visuales = await findAutoRelations(imagenes);
    const yaDeclaradas = new Set(
      data.grafo.links.filter((l) => l.type === 'relacionada').map((l) => `${l.source}\0${l.target}`)
    );
    for (const r of visuales) {
      const key1 = `${r.source}\0${r.target}`, key2 = `${r.target}\0${r.source}`;
      if (yaDeclaradas.has(key1) || yaDeclaradas.has(key2)) continue;
      data.grafo.links.push({ source: r.source, target: r.target, type: 'visual', similarity: r.similarity });
    }
  }

  data.generado = new Date().toISOString();
  data.atelier = { nombre: CFG.nombre, carpetas: C }; // para la página: el nombre del archivo y sus carpetas
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  // los campos `_…` (texto completo) solo sirven dentro del sync
  await fs.writeFile(OUT, JSON.stringify(data, (k, v) => (k.startsWith('_') ? undefined : v), 2));
  console.log(`[sync] ${OUT} · demo=${data.demo}`);
}

main();
