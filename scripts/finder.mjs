// Lo que la Mesa solo puede hacer en local (`npm run dev`), porque un navegador no llega al disco:
//  · /__finder  — revelar en Finder una imagen, o un audio/PDF de un proyecto con `&medio=` (macOS, `open -R`)
//  · /__imagen  — leer y guardar la nota de una imagen: en su imagenes.yaml (campo `nota`) y dentro
//                 del propio archivo (XMP dc:description, con exiftool, sin recomprimir la imagen).
//                 Las imágenes del dossier son de otro repositorio y se publican: su nota NO se escribe
//                 allí ni en el archivo, sino en el playbook, en 02-artefactos/imagenes-dossier.yaml.
//  · /__finder?original=1 — lo mismo para el ORIGINAL de una imagen catalogada (el archivo grande que vive en una fuente)
//  · /__archivo-ls, /__catalogar — el diálogo «Catalogar»: recorrer las fuentes de archivo-fuentes.yaml y dejar en el
//                 playbook la vista previa + ficha de un original (scripts/archivo.mjs; el original no se copia)
//  · /__archivo-carpetas, /__archivo-fuente — «+ Fuente» del diálogo: elegir una carpeta del Mac y declararla como fuente
//                 (se añade al final de 08-imagenes/archivo-fuentes.yaml; nunca cambia lo que ya hay)
//  · /__subir   — guardar una foto nueva en 08-imagenes/ (nunca pisa una existente; se reduce a 2000 px y pasa a png)
//  · /__artefacto — crear la ficha de un artefacto nuevo (02-artefactos/<slug>/<slug>.md, nunca pisa otro) y, con
//                 /__artefacto-foto, guardar sus fotos en <slug>/imagenes/
//  · /__proyecto-imagen — añadir una imagen a un proyecto en curso: 07-proyectos/<proyecto>/imagenes/ + su entrada
//                 en imagenes.yaml (sin la entrada el índice no la vería)
//  · /__constelacion — guardar una constelación de la Mesa como archivo: 09-constelaciones/<slug>.md
//                 (crear una nueva, que nunca pisa otra, o cambiar las listas `imagenes`/`textos` de una que existe;
//                 el título, el texto y lo demás del archivo no se tocan)
//  · /__sync    — regenerar el índice (scripts/sync.mjs) para que lo recién subido entre a la Mesa
//  · /__deploy  — lanzar scripts/deploy.sh (sync + build + rsync a la versión online) y contar cómo va
//  · /__chat, /__chat-modelos — «Conversar»: chat con un modelo local de LM Studio sobre el archivo (scripts/chat.mjs)
//  · /__conversacion — guardar una conversación de «Conversar» como .md en 10-conversaciones/ (scripts/chat.mjs)
//  · /__ajustes — el panel «Ajustes» (scripts/ajustes.mjs): escribe dashboard/anarchivo.config.json, no el playbook
// Son las ÚNICAS escrituras del dashboard hacia el playbook además de add-image.mjs, y solo ocurren al
// pulsar «Guardar», «Subir imagen» o al guardar una constelación. Siempre recibe ids del índice, nunca una ruta.
// En el build estático (deploy) nada de esto existe.
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_FOTO, slugDe, limpiarNombre, esImagen, candidato, procesarImagen, tituloLimpio, tipoArt, fichaArtefacto, conFoto, rutaProyecto, conEntradaImagen } from '../ingest/core.mjs';
import { fileURLToPath } from 'node:url';
import { registrarChat } from './chat.mjs';
import { cargar } from './config.mjs';
import { registrarAjustes } from './ajustes.mjs';
import { leerFuentes, listar, catalogar, archivosDe, rutaAbsoluta, atajos, carpetasDe, sugerirFuente, crearFuente } from './archivo.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// el archivo y sus carpetas: anarchivo.config.json (panel «Ajustes»). Se leen al arrancar `npm run dev`:
// si cambian en Ajustes hay que reiniciar el servidor para que las escrituras vayan al sitio nuevo.
const CFG = cargar(), C = CFG.carpetas;
const ROOT = CFG.raiz;
const INDEX = path.join(here, '..', 'src', 'data', 'index.json');
const NOTAS_DOSSIER = path.join(ROOT, C.artefactos, 'imagenes-dossier.yaml');
const SUELTAS = path.join(ROOT, C.imagenes);

// guarda una imagen subida en `dir` (reducida y en png: ver ingest/core.mjs). Nunca pisa otra: añade -2, -3… al nombre.
async function guardarImagen(dir, limpio, buf) {
  const { base, ext, buf: out } = await procesarImagen(limpio, buf);
  mkdirSync(dir, { recursive: true });
  let nombre = candidato(base, ext, 1);
  for (let i = 2; existsSync(path.join(dir, nombre)); i++) nombre = candidato(base, ext, i);
  writeFileSync(path.join(dir, nombre), out, { flag: 'wx' });
  return nombre;
}
const CABECERA_DOSSIER = `# imagenes-dossier.yaml — notas de imágenes de obras publicadas (_dossier-projects/).\n# Esas imágenes viven en el repositorio del dossier y salen al público: la nota se guarda aquí,\n# en el playbook, y nunca dentro del archivo. Clave: "carpeta-del-proyecto/archivo.ext".\n# Lo escribe la Mesa del dashboard (botón ✎); se puede editar a mano.\n`;

// --- imagenes.yaml: edición quirúrgica de un campo de una entrada (el resto del archivo, comentarios incluidos, no se toca) ---
const bloque = (lines, key) => {
  const i = lines.findIndex((l) => l.trimEnd() === `${key}:`);
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && /^\s{2}\S/.test(lines[j])) j++;
  return { i, j }; // los campos de la entrada son lines[i+1 .. j-1]
};
export function leerNota(text, key) {
  const lines = text.split('\n'), b = bloque(lines, key);
  if (!b) return null;
  const l = lines.slice(b.i + 1, b.j).find((x) => /^\s{2}nota:/.test(x));
  if (!l) return '';
  const v = l.replace(/^\s{2}nota:\s*/, '').trim();
  try { return v.startsWith('"') ? JSON.parse(v) : v.replace(/^'|'$/g, ''); } catch { return v; }
}
export function ponerNota(text, key, nota) {
  const lines = text.split('\n'), b = bloque(lines, key);
  if (!b) return null;
  return ponerEn(lines, b, nota);
}
// en el archivo de notas del dossier las entradas nacen con su primera nota y se van con ella
export function ponerNotaDossier(text, key, nota) {
  const lines = text.split('\n'), b = bloque(lines, key);
  if (b) {
    if (nota) return ponerEn(lines, b, nota);
    lines.splice(b.i, b.j - b.i + (lines[b.j] === '' ? 1 : 0));
    return lines.join('\n');
  }
  return nota ? `${text.replace(/\n*$/, '\n')}\n${key}:\n  nota: ${JSON.stringify(nota)}\n` : text;
}
function ponerEn(lines, b, nota) {
  const k = lines.slice(b.i + 1, b.j).findIndex((x) => /^\s{2}nota:/.test(x));
  // una línea, entre comillas dobles con escapes: YAML válido, y los saltos de línea viajan como \n
  const linea = nota ? [`  nota: ${JSON.stringify(nota)}`] : [];
  if (k >= 0) lines.splice(b.i + 1 + k, 1, ...linea); else lines.splice(b.j, 0, ...linea);
  return lines.join('\n');
}

// --- constelaciones: 09-constelaciones/<slug>.md (lo lee scripts/sync.mjs, readConstelaciones) ---
const CONSTELACIONES = path.join(ROOT, C.constelaciones);
const ARTEFACTOS = path.join(ROOT, C.artefactos);
const listaYaml = (key, vs) => (vs.length ? [`${key}:`, ...vs.map((v) => `  - ${JSON.stringify(v)}`)] : [`${key}: []`]);
const frente = (text) => text.match(/^---\n([\s\S]*?)\n---/);
const tramo = (lines, key) => {
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i < 0) return null;
  let j = i + 1;
  while (j < lines.length && /^\s+-\s/.test(lines[j])) j++;
  return { i, j };
};
export function leerLista(text, key) {
  const m = frente(text), lines = m ? m[1].split('\n') : [], t = tramo(lines, key);
  if (!t) return [];
  const val = (v) => { v = v.trim(); try { return v.startsWith('"') ? JSON.parse(v) : v.replace(/^'|'$/g, ''); } catch { return v; } };
  const enLinea = lines[t.i].slice(key.length + 1).trim();
  if (enLinea.startsWith('[')) return enLinea.replace(/^\[|\]$/g, '').split(',').map(val).filter(Boolean);
  return lines.slice(t.i + 1, t.j).map((l) => val(l.replace(/^\s+-\s+/, '')));
}
// cambia (o añade) una lista del frontmatter; el resto del archivo queda igual
export function ponerLista(text, key, vs) {
  const m = frente(text);
  if (!m) return null;
  const lines = m[1].split('\n'), t = tramo(lines, key), nuevo = listaYaml(key, vs);
  if (t) lines.splice(t.i, t.j - t.i, ...nuevo); else lines.push(...nuevo);
  return `---\n${lines.join('\n')}\n---${text.slice(m[0].length)}`;
}

const imagen = (id) => {
  let n;
  try { n = JSON.parse(readFileSync(INDEX, 'utf8')).grafo.nodes.find((x) => x.id === id && x.kind === 'imagen'); } catch { /* sin índice */ }
  const abs = n?.file && path.resolve(ROOT, n.file);
  if (!abs || !abs.startsWith(ROOT + path.sep) || !existsSync(abs)) return null;
  const dossier = n.file.startsWith(`${C.publicado}/`) && n.file.slice(C.publicado.length + 1).match(/^([^/]+)\//);
  if (dossier) return { abs, yaml: NOTAS_DOSSIER, key: `${dossier[1]}/${path.basename(abs)}`, dossier: true };
  const yaml = path.join(path.dirname(abs), 'imagenes.yaml');
  // las sueltas pueden no tener yaml todavía: su entrada nace con la primera nota
  if (path.dirname(abs) === SUELTAS) return { abs, yaml, key: path.basename(abs), crea: true };
  return { abs, yaml: existsSync(yaml) ? yaml : null, key: path.basename(abs) };
};
// un PDF o audio de un proyecto: solo los que el índice ya conoce (campo `medios` del nodo), nunca una ruta libre
const medio = (id, file) => {
  // los acentos llegan compuestos (ó) desde el navegador y descompuestos (o + ´) desde el disco de macOS
  const nfc = file.normalize('NFC');
  let m;
  try { m = JSON.parse(readFileSync(INDEX, 'utf8')).grafo.nodes.find((x) => x.id === id)?.medios?.find((x) => x.file.normalize('NFC') === nfc); } catch { /* sin índice */ }
  const abs = m && path.resolve(ROOT, m.file);
  return abs && abs.startsWith(ROOT + path.sep) && existsSync(abs) ? { abs } : null;
};
// el original catalogado de una imagen: { abs } si su fuente está en este Mac y el archivo sigue ahí
const original = (id) => {
  let n; try { n = JSON.parse(readFileSync(INDEX, 'utf8')).grafo.nodes.find((x) => x.id === id && x.kind === 'imagen'); } catch { /* sin índice */ }
  const abs = n?.orig && rutaAbsoluta(n.orig);
  return abs ? { abs } : null;
};
const cuerpo = (req) => new Promise((res) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 50000) req.destroy(); });
  req.on('end', () => { try { res(JSON.parse(s)); } catch { res(null); } });
  req.on('error', () => res(null));
});

export default function finder() {
  return {
    name: 'anarchivo-finder',
    hooks: {
      'astro:server:setup': ({ server }) => {
        const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
        // solo desde la propia página: otra web abierta en el navegador no puede pedirlo
        const ajena = (req) => { const site = req.headers['sec-fetch-site']; return site && site !== 'same-origin'; };
        const idDe = (req) => new URL(req.url, 'http://localhost').searchParams.get('id');
        registrarChat(server, { ROOT, INDEX, json, ajena });
        registrarAjustes(server, { json, ajena, INDEX });

        server.middlewares.use('/__finder', (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          if (process.platform !== 'darwin') return json(res, 501, { ok: false, error: 'solo en macOS' });
          const file = new URL(req.url, 'http://localhost').searchParams.get('medio');
          const q = new URL(req.url, 'http://localhost').searchParams;
          const img = file ? medio(idDe(req), file) : q.get('original') ? original(idDe(req)) : imagen(idDe(req));
          if (!img) return json(res, 404, { ok: false, error: 'no encuentro el archivo' });
          execFile('open', ['-R', img.abs], (err) => json(res, err ? 500 : 200, { ok: !err }));
        });

        // una foto por petición, el cuerpo es el archivo tal cual; el nombre se limpia y nunca pisa a otra
        server.middlewares.use('/__subir', (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const crudo = new URL(req.url, 'http://localhost').searchParams.get('nombre') || '';
          const limpio = limpiarNombre(crudo);
          if (!esImagen(limpio)) return json(res, 415, { ok: false, error: `«${crudo}» no es jpg, png, webp ni gif` });
          const chunks = []; let n = 0, pasada = false;
          req.on('data', (c) => { n += c.length; if (n > MAX_FOTO) { pasada = true; req.destroy(); } else chunks.push(c); });
          req.on('error', () => { if (pasada) json(res, 413, { ok: false, error: 'pesa más de 80 MB' }); });
          req.on('end', async () => {
            if (!n) return json(res, 400, { ok: false, error: 'archivo vacío' });
            const nombre = await guardarImagen(SUELTAS, limpio, Buffer.concat(chunks));
            json(res, 200, { ok: true, nombre, id: `img:${C.imagenes}/${nombre}` });
          });
        });

        // navegar las fuentes de originales: GET sin `fuente` = la lista; con `fuente` y `dir`, el contenido de esa carpeta
        server.middlewares.use('/__archivo-ls', (req, res) => {
          if (req.method !== 'GET' || ajena(req)) return json(res, 403, { ok: false });
          const q = new URL(req.url, 'http://localhost').searchParams, fuentes = leerFuentes();
          if (!q.get('fuente')) return json(res, 200, { ok: true, fuentes: fuentes.map(({ id, nombre, tipo, existe }) => ({ id, nombre, tipo, existe })) });
          const f = fuentes.find((x) => x.id === q.get('fuente') && x.existe);
          if (!f) return json(res, 404, { ok: false, error: 'no encuentro esa fuente (¿está montada?)' });
          try { json(res, 200, { ok: true, ...listar(f, q.get('dir') || '') }); } catch (e) { json(res, 400, { ok: false, error: e.message }); }
        });
        // declarar fuentes sin editar el yaml: elegir una carpeta del Mac, qué se sugiere para ella, y guardarla
        server.middlewares.use('/__archivo-carpetas', (req, res) => {
          if (req.method !== 'GET' || ajena(req)) return json(res, 403, { ok: false });
          const q = new URL(req.url, 'http://localhost').searchParams;
          try { json(res, 200, { ok: true, ...(q.get('dir') ? carpetasDe(q.get('dir')) : { atajos: atajos(), ...carpetasDe('') }), ...(q.get('sugerir') ? { sugerencia: sugerirFuente(q.get('dir')) } : {}) }); }
          catch (e) { json(res, 400, { ok: false, error: e.message }); }
        });
        server.middlewares.use('/__archivo-fuente', async (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const b = await cuerpo(req);
          if (!b) return json(res, 400, { ok: false, error: 'petición ilegible' });
          try { json(res, 200, { ok: true, ...crearFuente(b) }); } catch (e) { json(res, 400, { ok: false, error: e.message }); }
        });
        // catalogar: { fuente, archivos: [ruta relativa], carpeta?, recursivo?, proyecto? } → vista previa + ficha de cada original
        server.middlewares.use('/__catalogar', async (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const b = await cuerpo(req), fuentes = leerFuentes(), f = fuentes.find((x) => x.id === b?.fuente && x.existe);
          if (!f) return json(res, 400, { ok: false, error: 'falta la fuente' });
          const dentro = (rel) => { const abs = path.resolve(f.ruta, rel || ''); return abs === path.resolve(f.ruta) || abs.startsWith(path.resolve(f.ruta) + path.sep) ? abs : null; };
          let lista = [];
          for (const rel of Array.isArray(b.archivos) ? b.archivos : []) { const a = dentro(String(rel)); if (a) lista.push(a); }
          if (typeof b.carpeta === 'string') { const d = dentro(b.carpeta); if (d) lista.push(...archivosDe(d, !!b.recursivo, 300)); }
          lista = [...new Set(lista)].slice(0, 300);
          if (!lista.length) return json(res, 400, { ok: false, error: 'no hay nada que catalogar' });
          const nuevas = [], repetidas = [], errores = [];
          for (const a of lista) {
            const r = await catalogar(a, { proyecto: typeof b.proyecto === 'string' ? b.proyecto : '', fuentes });
            (r.estado === 'nueva' ? nuevas : r.estado === 'repetida' ? repetidas : errores).push(r);
          }
          json(res, 200, { ok: true, nuevas: nuevas.map((r) => ({ nombre: r.nombre, id: r.id })), repetidas: repetidas.length, errores: errores.map((r) => ({ nombre: r.nombre, error: r.error })) });
        });

        // artefacto nuevo: solo título y tipo; el resto de la ficha queda en blanco para escribirlo luego (no se inventa nada)
        server.middlewares.use('/__artefacto', async (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const b = await cuerpo(req);
          const title = tituloLimpio(b?.title), base = slugDe(title);
          if (!base) return json(res, 400, { ok: false, error: 'falta el título' });
          let slug = base;
          for (let i = 2; existsSync(path.join(ARTEFACTOS, slug)); i++) slug = `${base}-${i}`;
          mkdirSync(path.join(ARTEFACTOS, slug, 'imagenes'), { recursive: true });
          writeFileSync(path.join(ARTEFACTOS, slug, `${slug}.md`), fichaArtefacto(title, tipoArt(b.tipo), new Date().toLocaleDateString('sv')), { encoding: 'utf8', flag: 'wx' });
          json(res, 200, { ok: true, slug, id: `art:${slug}` });
        });
        server.middlewares.use('/__artefacto-foto', (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const q = new URL(req.url, 'http://localhost').searchParams, slug = q.get('slug') || '';
          const ficha = path.join(ARTEFACTOS, slug, `${slug}.md`);
          if (!/^[a-z0-9-]+$/.test(slug) || !existsSync(ficha)) return json(res, 404, { ok: false, error: 'no encuentro ese artefacto' });
          const limpio = limpiarNombre(q.get('nombre'));
          if (!esImagen(limpio)) return json(res, 415, { ok: false, error: `«${limpio}» no es jpg, png, webp ni gif` });
          const chunks = []; let n = 0, pasada = false;
          req.on('data', (c) => { n += c.length; if (n > MAX_FOTO) { pasada = true; req.destroy(); } else chunks.push(c); });
          req.on('error', () => { if (pasada) json(res, 413, { ok: false, error: 'pesa más de 80 MB' }); });
          req.on('end', async () => {
            if (!n) return json(res, 400, { ok: false, error: 'archivo vacío' });
            const nombre = await guardarImagen(path.join(ARTEFACTOS, slug, 'imagenes'), limpio, Buffer.concat(chunks));
            writeFileSync(ficha, conFoto(readFileSync(ficha, 'utf8'), nombre), 'utf8');
            json(res, 200, { ok: true, nombre, id: `img:art:${slug}/${nombre}` });
          });
        });

        // imagen adicional de un proyecto en curso: el archivo va a <proyecto>/imagenes/ y su entrada al imagenes.yaml
        // (el índice solo cuenta lo que ese archivo lista). La ruta es la del nodo del índice y solo vale bajo 07-proyectos/.
        server.middlewares.use('/__proyecto-imagen', (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const q = new URL(req.url, 'http://localhost').searchParams, segs = rutaProyecto(q.get('ruta'), C.proyectos);
          const dir = segs && path.join(ROOT, ...segs);
          if (!dir || !existsSync(dir)) return json(res, 404, { ok: false, error: 'no encuentro ese proyecto' });
          const limpio = limpiarNombre(q.get('nombre'));
          if (!esImagen(limpio)) return json(res, 415, { ok: false, error: `«${limpio}» no es jpg, png, webp ni gif` });
          const chunks = []; let n = 0, pasada = false;
          req.on('data', (c) => { n += c.length; if (n > MAX_FOTO) { pasada = true; req.destroy(); } else chunks.push(c); });
          req.on('error', () => { if (pasada) json(res, 413, { ok: false, error: 'pesa más de 80 MB' }); });
          req.on('end', async () => {
            if (!n) return json(res, 400, { ok: false, error: 'archivo vacío' });
            const nombre = await guardarImagen(path.join(dir, 'imagenes'), limpio, Buffer.concat(chunks));
            const yaml = path.join(dir, 'imagenes', 'imagenes.yaml');
            writeFileSync(yaml, conEntradaImagen(existsSync(yaml) ? readFileSync(yaml, 'utf8') : null, nombre, new Date().toLocaleDateString('sv')), 'utf8');
            json(res, 200, { ok: true, nombre, id: `img:${segs.slice(1).join('/')}/${nombre}` });
          });
        });

        // constelación: la Mesa manda ids del índice (imágenes, textos) y slugs de concepto; lo que no está en el
        // índice no se escribe. Sin `slug` nace un archivo nuevo; con `slug` se cambian las listas de uno que existe.
        server.middlewares.use('/__constelacion', async (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          const b = await cuerpo(req);
          let g;
          try { g = JSON.parse(readFileSync(INDEX, 'utf8')).grafo; } catch { /* sin índice */ }
          if (!b || !g) return json(res, 400, { ok: false, error: 'no pude leer la petición o el índice' });
          const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
          const ids = (v) => [...new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])];
          const imagenes = ids(b.imagenes).filter((id) => kind.get(id) === 'imagen').map((id) => id.slice('img:'.length));
          const textos = ids(b.textos).filter((id) => kind.has(id) && !['imagen', 'constelacion'].includes(kind.get(id)));
          if (b.slug != null) {
            const file = path.join(CONSTELACIONES, `${b.slug}.md`);
            if (!/^[a-z0-9-]+$/.test(String(b.slug)) || !existsSync(file)) return json(res, 404, { ok: false, error: 'no encuentro esa constelación' });
            const text = readFileSync(file, 'utf8');
            // lo que el archivo nombra y el índice no conoce (una imagen movida, un texto renombrado) se conserva
            const ajenas = (key, conocida) => leerLista(text, key).filter((r) => !conocida(r));
            let next = ponerLista(text, 'imagenes', [...imagenes, ...ajenas('imagenes', (r) => kind.get(`img:${r.replace(/^img:/, '')}`) === 'imagen')]);
            if (next != null && Array.isArray(b.textos)) next = ponerLista(next, 'textos', [...textos, ...ajenas('textos', (r) => kind.has(r) || g.nodes.some((n) => n.file === r))]);
            if (next == null) return json(res, 409, { ok: false, error: 'ese archivo no tiene frontmatter' });
            writeFileSync(file, next, 'utf8');
            return json(res, 200, { ok: true, slug: b.slug, id: `cst:${b.slug}`, archivo: path.relative(ROOT, file) });
          }
          const title = typeof b.title === 'string' ? b.title.replace(/\s+/g, ' ').trim() : '';
          const base = slugDe(title);
          if (!base) return json(res, 400, { ok: false, error: 'falta el nombre' });
          if (!imagenes.length && !textos.length) return json(res, 400, { ok: false, error: 'una constelación necesita al menos una imagen o un texto' });
          const concepts = ids(b.concepts).filter((c) => g.concepts.some((x) => x.slug === c));
          const desc = typeof b.descripcion === 'string' ? b.descripcion.replace(/\r\n/g, '\n').trim() : '';
          mkdirSync(CONSTELACIONES, { recursive: true });
          let slug = base;
          for (let i = 2; existsSync(path.join(CONSTELACIONES, `${slug}.md`)); i++) slug = `${base}-${i}`;
          const file = path.join(CONSTELACIONES, `${slug}.md`);
          const fm = [`title: ${JSON.stringify(title)}`, `fecha: ${new Date().toLocaleDateString('sv')}`, `concepts: ${JSON.stringify(concepts)}`,
            ...listaYaml('imagenes', imagenes), ...listaYaml('textos', textos)];
          writeFileSync(file, `---\n${fm.join('\n')}\n---\n\n# ${title}\n${desc ? `\n${desc}\n` : ''}`, { encoding: 'utf8', flag: 'wx' });
          json(res, 200, { ok: true, slug, id: `cst:${slug}`, archivo: path.relative(ROOT, file) });
        });

        // el índice es de cuando arrancó el dashboard: tras subir hay que regenerarlo (la caché de CLIP lo hace corto)
        let sincronizando = null;
        server.middlewares.use('/__sync', (req, res) => {
          if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
          sincronizando ||= new Promise((ok) => execFile(process.execPath, [path.join(here, 'sync.mjs')], { cwd: path.join(here, '..'), env: process.env, maxBuffer: 1 << 26, timeout: 600000 },
            (err, _out, stderr) => { sincronizando = null; ok(err ? (stderr || err.message).trim().split('\n').pop() : ''); }));
          sincronizando.then((error) => json(res, error ? 500 : 200, { ok: !error, error }));
        });

        // publicar: el mismo deploy.sh de siempre, lanzado desde el botón. Uno a la vez; el estado vive aquí
        // (no en la página, que se recarga sola cuando el sync del deploy regenera el índice).
        const deploy = { estado: 'nunca', inicio: 0, fin: 0, log: '' };
        server.middlewares.use('/__deploy', (req, res) => {
          if (ajena(req) || !['GET', 'POST'].includes(req.method)) return json(res, 403, { ok: false });
          const ver = () => ({ ok: true, estado: deploy.estado, inicio: deploy.inicio, fin: deploy.fin, log: deploy.log.trim().split(/[\r\n]+/).slice(-6) });
          if (req.method === 'GET') return json(res, 200, ver());
          if (deploy.estado === 'corriendo') return json(res, 409, ver());
          Object.assign(deploy, { estado: 'corriendo', inicio: Date.now(), fin: 0, log: '' });
          // BatchMode: sin llave SSH cargada falla enseguida en vez de quedarse esperando una contraseña que nadie puede teclear
          const p = spawn('bash', [path.join(here, 'deploy.sh')], { cwd: path.join(here, '..'), env: { ...process.env, RSYNC_RSH: process.env.RSYNC_RSH || 'ssh -o BatchMode=yes' } });
          const anotar = (c) => { deploy.log = (deploy.log + c).slice(-6000); };
          p.stdout.on('data', anotar); p.stderr.on('data', anotar);
          p.on('error', (e) => { anotar(`\n${e.message}`); Object.assign(deploy, { estado: 'error', fin: Date.now() }); });
          p.on('close', (code) => { if (deploy.estado === 'corriendo') Object.assign(deploy, { estado: code === 0 ? 'ok' : 'error', fin: Date.now() }); });
          json(res, 202, ver());
        });

        server.middlewares.use('/__imagen', async (req, res) => {
          if (ajena(req) || !['GET', 'POST'].includes(req.method)) return json(res, 403, { ok: false });
          const img = imagen(idDe(req));
          if (!img) return json(res, 404, { ok: false, error: 'no encuentro el archivo' });
          if (!img.yaml) return json(res, 409, { ok: false, error: 'esta imagen no tiene imagenes.yaml' });
          const text = existsSync(img.yaml) ? readFileSync(img.yaml, 'utf8') : (img.dossier ? CABECERA_DOSSIER : '');
          const rel = path.relative(ROOT, img.yaml);
          if (req.method === 'GET') {
            const nota = leerNota(text, img.key) ?? (img.dossier || img.crea ? '' : null);
            return nota == null ? json(res, 404, { ok: false, error: `«${img.key}» no está en ${rel}` }) : json(res, 200, { ok: true, nota, yaml: rel });
          }
          const body = await cuerpo(req);
          if (typeof body?.nota !== 'string') return json(res, 400, { ok: false, error: 'falta la nota' });
          const nota = body.nota.replace(/\r\n/g, '\n').trim();
          const next = img.dossier ? ponerNotaDossier(text, img.key, nota)
            : ponerNota(text, img.key, nota) ?? (img.crea ? (nota ? ponerNotaDossier(text, img.key, nota) : text) : null);
          if (next == null) return json(res, 404, { ok: false, error: `«${img.key}» no está en ${rel}` });
          if (next !== text || existsSync(img.yaml)) { mkdirSync(path.dirname(img.yaml), { recursive: true }); writeFileSync(img.yaml, next, 'utf8'); }
          if (img.dossier) return json(res, 200, { ok: true, yaml: rel, archivo: false, aviso: 'En el archivo no: es una imagen publicada en el dossier.' });
          // dentro del archivo: solo metadatos (-P conserva la fecha del archivo; nota vacía borra la etiqueta)
          execFile('exiftool', ['-overwrite_original', '-P', '-q', `-XMP-dc:Description=${nota}`, img.abs], (err, _out, stderr) => {
            json(res, 200, { ok: true, yaml: rel, archivo: !err, aviso: err ? `En el archivo no: ${err.code === 'ENOENT' ? 'exiftool no está instalado' : (stderr || err.message).trim().split('\n')[0]}` : '' });
          });
        });
      },
    },
  };
}
