// Anarchivo · ingest — el servicio de Railway que deja subir imágenes y artefactos desde el teléfono sin que el
// Mac esté encendido. Recibe el archivo, lo reduce (ver core.mjs) y lo escribe por WebDAV en la carpeta del
// playbook dentro de Nextcloud; el cliente de sincronización lo baja al Mac. Mismos nombres de ruta y misma
// ficha que el servidor local (scripts/finder.mjs), así que da igual por cuál de los dos se subió.
//
//   GET  /salud                              — sin token; para saber que está vivo
//   POST /imagen?nombre=x.jpg                — cuerpo = el archivo → 08-imagenes/
//   POST /artefacto                          — { title, tipo } → 02-artefactos/<slug>/<slug>.md
//   POST /artefacto-foto?slug=…&nombre=x.jpg — cuerpo = el archivo → 02-artefactos/<slug>/imagenes/
//   POST /proyecto-imagen?ruta=07-proyectos/<p>&nombre=x.jpg — cuerpo = el archivo → <p>/imagenes/ + su entrada en imagenes.yaml
//
// Todo menos /salud pide `Authorization: Bearer <INGEST_TOKEN>`. Nunca pisa un archivo que ya existe (PUT con
// If-None-Match: *) y la ficha se reescribe solo si no cambió mientras tanto (If-Match). Variables:
//   NEXTCLOUD_URL · NEXTCLOUD_USER · NEXTCLOUD_APP_PASSWORD · NEXTCLOUD_ATELIER_PATH (la carpeta del archivo en Nextcloud, ej. /MiArchivo)
//   INGEST_TOKEN · ALLOWED_ORIGINS (coma; dónde está publicada la página, ej. https://tusitio.org) · PORT
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { MAX_FOTO, slugDe, limpiarNombre, esImagen, candidato, procesarImagen, tituloLimpio, tipoArt, fichaArtefacto, conFoto, rutaProyecto, conEntradaImagen } from './core.mjs';

const env = process.env;
const NC = String(env.NEXTCLOUD_URL || '').replace(/\/+$/, ''), USER = env.NEXTCLOUD_USER || '', PASS = env.NEXTCLOUD_APP_PASSWORD || '';
const RAIZ = String(env.NEXTCLOUD_ATELIER_PATH || '').split('/').filter(Boolean);
const TOKEN = env.INGEST_TOKEN || '';
const ORIGENES = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const PORT = Number(env.PORT) || 4100;
if (!NC || !USER || !PASS || !TOKEN || !RAIZ.length || !ORIGENES.length) { console.error('Faltan NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_APP_PASSWORD, NEXTCLOUD_ATELIER_PATH, INGEST_TOKEN o ALLOWED_ORIGINS'); process.exit(1); }
const AUTH = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

// --- WebDAV (rutas relativas a la carpeta del playbook, en segmentos: ['02-artefactos', slug, 'x.md']) ---
const url = (segs) => `${NC}/remote.php/dav/files/${encodeURIComponent(USER)}/${[...RAIZ, ...segs].map(encodeURIComponent).join('/')}`;
const dav = (method, segs, opts = {}) => fetch(url(segs), { method, signal: AbortSignal.timeout(30_000), ...opts, headers: { Authorization: AUTH, ...opts.headers } });
const hechas = new Set(); // carpetas que ya existen: no se vuelve a preguntar mientras viva el proceso
async function carpeta(segs) {
  for (let i = 1; i <= segs.length; i++) {
    const k = segs.slice(0, i).join('/');
    if (hechas.has(k)) continue;
    const r = await dav('MKCOL', segs.slice(0, i));
    if (r.status !== 201 && r.status !== 405) throw new Error(`MKCOL ${k} → HTTP ${r.status}`);
    hechas.add(k);
  }
}
// true si lo creó; false si ya había uno con ese nombre
async function ponerNuevo(segs, cuerpo, tipo) {
  const r = await dav('PUT', segs, { headers: { 'Content-Type': tipo, 'If-None-Match': '*' }, body: cuerpo });
  if (r.status === 412) return false;
  if (!r.ok) throw new Error(`PUT ${segs.join('/')} → HTTP ${r.status}`);
  return true;
}
async function leer(segs) {
  const r = await dav('GET', segs);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${segs.join('/')} → HTTP ${r.status}`);
  return { text: await r.text(), etag: r.headers.get('etag') || '' };
}
async function existe(segs) {
  const r = await dav('PROPFIND', segs, { headers: { Depth: '0', 'Content-Type': 'application/xml' }, body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>' });
  return r.status === 207;
}
async function guardarImagen(dir, limpio, buf) {
  const { base, ext, buf: out } = await procesarImagen(limpio, buf);
  await carpeta(dir);
  for (let i = 1; i < 500; i++) {
    const nombre = candidato(base, ext, i);
    if (await ponerNuevo([...dir, nombre], out, ext === '.png' ? 'image/png' : 'application/octet-stream')) return nombre;
  }
  throw new Error('demasiadas imágenes con ese nombre');
}

// --- HTTP ---
const json = (res, code, body) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
const iguales = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
class Corto extends Error { constructor(code, msg) { super(msg); this.code = code; } }
function cuerpo(req, max) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > max) { no(new Corto(413, `pesa más de ${Math.round(max / 1048576)} MB`)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => ok(Buffer.concat(chunks)));
    req.on('error', () => no(new Corto(400, 'la subida se cortó')));
  });
}

async function atender(req, res, u) {
  const q = u.searchParams;
  if (u.pathname === '/imagen') {
    const limpio = limpiarNombre(q.get('nombre'));
    if (!esImagen(limpio)) throw new Corto(415, `«${q.get('nombre')}» no es jpg, png, webp ni gif`);
    const buf = await cuerpo(req, MAX_FOTO);
    if (!buf.length) throw new Corto(400, 'archivo vacío');
    const nombre = await guardarImagen(['08-imagenes'], limpio, buf);
    return json(res, 200, { ok: true, nombre, id: `img:08-imagenes/${nombre}` });
  }
  if (u.pathname === '/artefacto') {
    let b; try { b = JSON.parse((await cuerpo(req, 50_000)).toString('utf8')); } catch { b = null; }
    const title = tituloLimpio(b?.title), base = slugDe(title);
    if (!base) throw new Corto(400, 'falta el título');
    await carpeta(['02-artefactos']);
    let slug = base;
    for (let i = 2; i < 500; i++) { // MKCOL crea o dice 405 si existe: así dos subidas a la vez no comparten carpeta
      const r = await dav('MKCOL', ['02-artefactos', slug]);
      if (r.status === 201) break;
      if (r.status !== 405) throw new Error(`MKCOL ${slug} → HTTP ${r.status}`);
      slug = `${base}-${i}`;
    }
    hechas.add(`02-artefactos/${slug}`);
    await carpeta(['02-artefactos', slug, 'imagenes']);
    const md = fichaArtefacto(title, tipoArt(b.tipo), new Date().toLocaleDateString('sv'));
    if (!(await ponerNuevo(['02-artefactos', slug, `${slug}.md`], md, 'text/markdown; charset=utf-8'))) throw new Corto(409, 'esa ficha ya existe');
    return json(res, 200, { ok: true, slug, id: `art:${slug}` });
  }
  if (u.pathname === '/artefacto-foto') {
    const slug = q.get('slug') || '', limpio = limpiarNombre(q.get('nombre'));
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Corto(404, 'no encuentro ese artefacto');
    if (!esImagen(limpio)) throw new Corto(415, `«${q.get('nombre')}» no es jpg, png, webp ni gif`);
    const ficha = ['02-artefactos', slug, `${slug}.md`];
    if (!(await leer(ficha))) throw new Corto(404, 'no encuentro ese artefacto');
    const buf = await cuerpo(req, MAX_FOTO);
    if (!buf.length) throw new Corto(400, 'archivo vacío');
    const nombre = await guardarImagen(['02-artefactos', slug, 'imagenes'], limpio, buf);
    // la ficha puede estar abierta en el Mac: si cambió entre leer y escribir (412), se vuelve a leer y se reintenta
    for (let i = 0; ; i++) {
      const f = await leer(ficha);
      const r = await dav('PUT', ficha, { headers: { 'Content-Type': 'text/markdown; charset=utf-8', ...(f.etag ? { 'If-Match': f.etag } : {}) }, body: conFoto(f.text, nombre) });
      if (r.ok) break;
      if (r.status !== 412 || i >= 4) throw new Error(`PUT ficha → HTTP ${r.status}`);
    }
    return json(res, 200, { ok: true, nombre, id: `img:art:${slug}/${nombre}` });
  }
  if (u.pathname === '/proyecto-imagen') {
    const segs = rutaProyecto(q.get('ruta')), limpio = limpiarNombre(q.get('nombre'));
    if (!segs || !(await existe(segs))) throw new Corto(404, 'no encuentro ese proyecto');
    if (!esImagen(limpio)) throw new Corto(415, `«${q.get('nombre')}» no es jpg, png, webp ni gif`);
    const buf = await cuerpo(req, MAX_FOTO);
    if (!buf.length) throw new Corto(400, 'archivo vacío');
    const nombre = await guardarImagen([...segs, 'imagenes'], limpio, buf);
    // el imagenes.yaml puede estar abierto en el Mac: se escribe solo si no cambió (If-Match) y, si no existe, solo si sigue sin existir
    const yaml = [...segs, 'imagenes', 'imagenes.yaml'], hoy = new Date().toLocaleDateString('sv');
    for (let i = 0; ; i++) {
      const f = await leer(yaml);
      if (!f) { if (await ponerNuevo(yaml, conEntradaImagen(null, nombre, hoy), 'text/plain; charset=utf-8')) break; continue; }
      const r = await dav('PUT', yaml, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...(f.etag ? { 'If-Match': f.etag } : {}) }, body: conEntradaImagen(f.text, nombre, hoy) });
      if (r.ok) break;
      if (r.status !== 412 || i >= 4) throw new Error(`PUT imagenes.yaml → HTTP ${r.status}`);
    }
    return json(res, 200, { ok: true, nombre, id: `img:${segs.slice(1).join('/')}/${nombre}` });
  }
  throw new Corto(404, 'no existe');
}

http.createServer(async (req, res) => {
  const origen = req.headers.origin;
  if (origen && ORIGENES.includes(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/salud') return json(res, 200, { ok: true });
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'solo POST' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !iguales(token, TOKEN)) return json(res, 401, { ok: false, error: 'token incorrecto' });
  try { await atender(req, res, u); } catch (e) {
    if (res.headersSent) return;
    if (e instanceof Corto) return json(res, e.code, { ok: false, error: e.message });
    console.error(e); json(res, 502, { ok: false, error: 'no pude escribir en Nextcloud' });
  }
}).listen(PORT, () => console.log(`anarchivo-ingest en :${PORT} → ${NC}/…/${RAIZ.join('/')}`));
