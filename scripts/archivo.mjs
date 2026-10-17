// Catálogo de originales — Anarchivo como archivo: de cada original (20–200 MB, que vive donde ya está: Nextcloud,
// iCloud, un disco) solo se guarda en el playbook una vista previa ligera (jpg de 1600 px) y su ficha, con un
// enlace al original. El original NO se copia ni se mueve.
//
// Lo usan scripts/catalogar.mjs (línea de comandos) y scripts/finder.mjs (el diálogo «Catalogar» del dashboard
// local). Solo escribe en el playbook: el jpg en <proyecto>/imagenes/ (o en 08-imagenes/) y una entrada en su
// imagenes.yaml con los campos `original_*`. Nunca pisa un archivo; un original ya catalogado (mismo sha256) se salta.
//
// Las fuentes (dónde viven los originales) se declaran en 08-imagenes/archivo-fuentes.yaml.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { cargar } from './config.mjs';
import { limpiarNombre, candidato, rutaProyecto, conEntradaImagen, slugDe } from '../ingest/core.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CFG = cargar(), C = CFG.carpetas;
export const ROOT = CFG.raiz;
export const FUENTES = path.join(ROOT, C.imagenes, 'archivo-fuentes.yaml');
export const LADO = 1600; // lado mayor de la vista previa, en px

const SHARP = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.avif']);
const VIDEO = new Set(['.mov', '.mp4', '.m4v', '.avi', '.mkv', '.webm']);
// lo que se cataloga al recorrer una carpeta (imágenes, y lo que macOS o ffmpeg saben dibujar); audio y datos no
export const CATALOGABLES = new Set([...SHARP, ...VIDEO, '.heic', '.heif', '.psd', '.pdf', '.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2', '.bmp', '.ai', '.eps', '.svg']);

// --- fuentes: un mapa plano de {id: {campos}} (el mismo subconjunto de YAML que imagenes.yaml) ---
export function parseFuentes(text) {
  const out = {}; let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\t/g, '  ');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const top = line.match(/^(\S.*?):\s*$/);
    if (top) { cur = out[top[1]] = {}; continue; }
    const f = line.match(/^\s{2}([\w-]+):\s*(.*)$/);
    if (f && cur) cur[f[1]] = f[2].replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const contraer = (p) => (p === os.homedir() || p.startsWith(os.homedir() + path.sep) ? '~' + p.slice(os.homedir().length) : p);
const expandir = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
export function leerFuentes() {
  let t = ''; try { t = readFileSync(FUENTES, 'utf8'); } catch { return []; }
  return Object.entries(parseFuentes(t)).filter(([, f]) => f.ruta).map(([id, f]) => {
    const ruta = expandir(f.ruta).replace(/\/+$/, '');
    return { id, nombre: f.nombre || id, tipo: f.tipo || 'disco', ruta, remota: f.remota || '/', url: (f.url || '').replace(/\/+$/, ''), existe: existsSync(ruta) };
  });
}
const real = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
// a qué fuente pertenece un archivo (la ruta más específica) y su ruta relativa; null si no está en ninguna
export function fuenteDe(abs, fuentes = leerFuentes()) {
  const a = real(abs);
  const f = fuentes.filter((x) => x.existe).map((x) => ({ x, r: real(x.ruta) }))
    .filter(({ r }) => a === r || a.startsWith(r + path.sep)).sort((p, q) => q.r.length - p.r.length)[0];
  return f ? { fuente: f.x, rel: path.relative(f.r, a).split(path.sep).join('/') } : null;
}
// enlace para abrir el original en el navegador (solo Nextcloud: carpeta y nombre; el fileid exigiría red o claves)
export function enlaceDe(fuente, rel) {
  if (fuente.tipo !== 'nextcloud' || !fuente.url) return '';
  const remoto = path.posix.join(fuente.remota, rel);
  return `${fuente.url}/index.php/apps/files/?dir=${encodeURIComponent(path.posix.dirname(remoto))}&scrollto=${encodeURIComponent(path.posix.basename(remoto))}`;
}
// la ruta absoluta de un original ya catalogado ({fuente, ruta}); null si la fuente no está o se sale de ella
export function rutaAbsoluta(orig, fuentes = leerFuentes()) {
  const f = fuentes.find((x) => x.id === orig?.fuente && x.existe);
  if (!f || !orig.ruta || orig.ruta.split('/').includes('..')) return null;
  const abs = path.join(f.ruta, orig.ruta);
  return existsSync(abs) ? abs : null;
}

// --- vista previa: sharp si puede; si no, sips (HEIC, RAW, PDF…), Quick Look, o ffmpeg para video ---
async function jpgDe(entrada, salida) {
  await sharp(entrada, { limitInputPixels: false, failOn: 'none' }).rotate().resize({ width: LADO, height: LADO, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb').flatten({ background: '#ffffff' }).jpeg({ quality: 82, mozjpeg: true }).toFile(salida);
}
async function vistaPrevia(abs, salida) {
  const ext = path.extname(abs).toLowerCase(), tmp = path.join(os.tmpdir(), `anarchivo-${process.pid}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    if (SHARP.has(ext)) { try { await jpgDe(abs, salida); return; } catch { /* se prueba con macOS */ } }
    if (VIDEO.has(ext)) {
      const png = path.join(tmp, 'f.png');
      await run('ffmpeg', ['-y', '-v', 'error', '-ss', '1', '-i', abs, '-frames:v', '1', png]).catch(() => run('ffmpeg', ['-y', '-v', 'error', '-i', abs, '-frames:v', '1', png]));
      await jpgDe(png, salida); return;
    }
    if (process.platform === 'darwin') {
      const png = path.join(tmp, 's.jpg');
      try { await run('sips', ['-s', 'format', 'jpeg', '-Z', String(LADO), abs, '--out', png]); await jpgDe(png, salida); return; } catch { /* Quick Look */ }
      await run('qlmanage', ['-t', '-s', String(LADO), '-o', tmp, abs]);
      const hecho = readdirSync(tmp).find((f) => f.endsWith('.png'));
      if (hecho) { await jpgDe(path.join(tmp, hecho), salida); return; }
    }
    throw new Error('no sé dibujar una vista previa de este formato');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
const sha256 = (abs) => new Promise((ok, no) => { const h = createHash('sha256'); createReadStream(abs).on('data', (c) => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', no); });

// ¿ya está catalogado este original? (mismo sha256 en algún imagenes.yaml del playbook)
function yamls() {
  const out = [path.join(ROOT, C.imagenes, 'imagenes.yaml')];
  const sub = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => path.join(d, e.name)); } catch { return []; } };
  for (const p of sub(path.join(ROOT, C.proyectos))) { out.push(path.join(p, 'imagenes', 'imagenes.yaml')); for (const q of sub(p)) out.push(path.join(q, 'imagenes', 'imagenes.yaml')); }
  return out.filter((f) => existsSync(f));
}
export function yaCatalogado(hash) {
  for (const f of yamls()) { if (readFileSync(f, 'utf8').includes(`original_sha256: ${hash}`)) return path.relative(ROOT, f); }
  return null;
}

// cataloga UN original. `proyecto` = ruta del proyecto (07-proyectos/…) o vacío para 08-imagenes/.
// → { estado: 'nueva' | 'repetida' | 'error', nombre, id, ... }
export async function catalogar(abs, { proyecto = '', hoy = new Date().toLocaleDateString('sv'), fuentes = leerFuentes() } = {}) {
  const nombre = path.basename(abs);
  try {
    const ubic = fuenteDe(abs, fuentes);
    if (!ubic) return { estado: 'error', nombre, error: 'no está en ninguna fuente de archivo-fuentes.yaml' };
    const st = statSync(abs);
    if (!st.isFile()) return { estado: 'error', nombre, error: 'no es un archivo' };
    const hash = await sha256(abs), repetida = yaCatalogado(hash);
    if (repetida) return { estado: 'repetida', nombre, en: repetida };
    let segs = null, dir = path.join(ROOT, C.imagenes);
    if (proyecto) {
      segs = rutaProyecto(proyecto, C.proyectos);
      if (!segs || !existsSync(path.join(ROOT, ...segs))) return { estado: 'error', nombre, error: `no encuentro el proyecto ${proyecto}` };
      dir = path.join(ROOT, ...segs, 'imagenes');
    }
    mkdirSync(dir, { recursive: true });
    const base = limpiarNombre(path.basename(abs, path.extname(abs))) || 'original';
    let key = candidato(base, '.jpg', 1);
    for (let i = 2; existsSync(path.join(dir, key)); i++) key = candidato(base, '.jpg', i);
    await vistaPrevia(abs, path.join(dir, key));
    const px = await sharp(path.join(dir, key)).metadata().then((m) => `${m.width}x${m.height}`).catch(() => '');
    const ox = SHARP.has(path.extname(abs).toLowerCase()) ? await sharp(abs, { limitInputPixels: false }).metadata().then((m) => `${m.width}x${m.height}`).catch(() => px) : px;
    const yaml = path.join(dir, 'imagenes.yaml');
    const extra = {
      original_fuente: ubic.fuente.id, original_ruta: ubic.rel, original_formato: path.extname(abs).slice(1).toUpperCase(),
      original_bytes: st.size, original_px: ox, original_sha256: hash,
      ...(enlaceDe(ubic.fuente, ubic.rel) ? { original_url: enlaceDe(ubic.fuente, ubic.rel) } : {}),
    };
    writeFileSync(yaml, conEntradaImagen(existsSync(yaml) ? readFileSync(yaml, 'utf8') : null, key, hoy, extra), 'utf8');
    return { estado: 'nueva', nombre, key, id: `img:${segs ? segs.slice(1).join('/') : C.imagenes}/${key}`, bytes: st.size };
  } catch (e) { return { estado: 'error', nombre, error: e.message || String(e) }; }
}

// los archivos catalogables de una carpeta (recursivo opcional), sin ocultos
export function archivosDe(dir, recursivo = false, max = 500) {
  const out = [];
  (function ir(d) {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= max) return;
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (recursivo) ir(p); } else if (CATALOGABLES.has(path.extname(e.name).toLowerCase())) out.push(p);
    }
  })(dir);
  return out;
}
// el contenido de una carpeta de una fuente, para el navegador del diálogo (nunca sale de la fuente)
export function listar(fuente, rel = '') {
  const raiz = real(fuente.ruta), abs = real(path.join(raiz, rel));
  if (abs !== raiz && !abs.startsWith(raiz + path.sep)) throw new Error('fuera de la fuente');
  const es = readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  return {
    rel: path.relative(raiz, abs).split(path.sep).join('/'),
    carpetas: es.filter((e) => e.isDirectory()).map((e) => e.name).sort((a, b) => a.localeCompare(b)),
    archivos: es.filter((e) => e.isFile() && CATALOGABLES.has(path.extname(e.name).toLowerCase()))
      .map((e) => ({ nombre: e.name, bytes: statSync(path.join(abs, e.name)).size })).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };
}

// --- declarar fuentes desde el dashboard (el mismo archivo que se edita a mano) ---
const CABECERA_FUENTES = `# archivo-fuentes.yaml — dónde viven los originales grandes (20–200 MB).
# Anarchivo no los guarda: solo su vista previa y una ficha con el enlace. Cada fuente es una carpeta donde ya
# tienes originales; solo se puede catalogar lo que esté dentro de una. Se crean desde «Catalogar original» (+ Fuente)
# o a mano. Guía: dashboard/docs/documentar.md
# Campos: nombre · tipo (nextcloud | icloud | disco) · ruta (en ESTE Mac, admite ~) · remota y url (solo nextcloud)
`;
// por dónde empezar a elegir una carpeta: el Mac del usuario y sus discos (el servidor solo muestra carpetas bajo ~ y /Volumes)
export function atajos() {
  const home = os.homedir(), icloud = path.join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  const vols = (() => { try { return readdirSync('/Volumes').filter((v) => !v.startsWith('.')).map((v) => ({ nombre: v, ruta: path.join('/Volumes', v) })); } catch { return []; } })();
  return [{ nombre: 'Inicio (~)', ruta: home }, ...(existsSync(icloud) ? [{ nombre: 'iCloud Drive', ruta: icloud }] : []), ...vols].filter((a) => existsSync(a.ruta));
}
const permitida = (abs) => { const a = real(abs), h = real(os.homedir()); return a === h || a.startsWith(h + path.sep) || a === '/Volumes' || a.startsWith('/Volumes' + path.sep); };
export function carpetasDe(dir) {
  const abs = real(expandir(dir || os.homedir()));
  if (!permitida(abs)) throw new Error('solo se pueden elegir carpetas bajo tu inicio o /Volumes');
  if (!statSync(abs).isDirectory()) throw new Error('no es una carpeta');
  const padre = path.dirname(abs);
  return {
    dir: abs, padre: permitida(padre) && padre !== abs ? padre : '',
    carpetas: readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith('.') && (e.isDirectory() || (e.isSymbolicLink() && (() => { try { return statSync(path.join(abs, e.name)).isDirectory(); } catch { return false; } })())))
      .map((e) => e.name).sort((a, b) => a.localeCompare(b)),
  };
}
// qué tipo y qué datos sugiere una carpeta: si está dentro de otra fuente nextcloud, su url y su ruta en el servidor
export function sugerirFuente(ruta) {
  const abs = real(expandir(ruta)), fuentes = leerFuentes();
  if (abs.startsWith(real(path.join(os.homedir(), 'Library', 'Mobile Documents')) + path.sep)) return { tipo: 'icloud' };
  if (abs.startsWith('/Volumes/')) return { tipo: 'disco' };
  const nc = fuentes.filter((f) => f.tipo === 'nextcloud' && f.existe).map((f) => ({ f, r: real(f.ruta) })).filter(({ r }) => abs === r || abs.startsWith(r + path.sep)).sort((a, b) => b.r.length - a.r.length)[0];
  if (nc) return { tipo: 'nextcloud', url: nc.f.url, remota: path.posix.join(nc.f.remota, path.relative(nc.r, abs).split(path.sep).join('/')) };
  const otra = fuentes.find((f) => f.tipo === 'nextcloud' && f.url);
  return { tipo: 'disco', ...(otra ? { url: otra.url } : {}) };
}
// añade una fuente al final de archivo-fuentes.yaml (crea el archivo con su cabecera si falta); nunca cambia lo que ya hay
export function crearFuente({ nombre, tipo, ruta, remota, url }) {
  const limpio = (v) => String(v ?? '').replace(/\s+/g, ' ').replace(/\s#/g, ' ·').trim();
  nombre = limpio(nombre); tipo = limpio(tipo); ruta = limpio(ruta); remota = limpio(remota); url = limpio(url).replace(/\/+$/, '');
  const id = slugDe(nombre);
  if (!id) throw new Error('falta el nombre');
  if (!['nextcloud', 'icloud', 'disco'].includes(tipo)) throw new Error('el tipo debe ser nextcloud, icloud o disco');
  const abs = real(expandir(ruta));
  if (!ruta || !existsSync(abs) || !statSync(abs).isDirectory()) throw new Error('esa carpeta no existe en este Mac');
  if (!permitida(abs)) throw new Error('solo carpetas bajo tu inicio o /Volumes');
  if (tipo === 'nextcloud') {
    if (!/^https?:\/\/[^\s]+$/.test(url)) throw new Error('falta la dirección del servidor Nextcloud (https://…)');
    if (!remota.startsWith('/')) remota = '/' + remota;
  }
  const previo = existsSync(FUENTES) ? readFileSync(FUENTES, 'utf8') : null;
  if (leerFuentes().some((f) => f.id === id) || (previo && parseFuentes(previo)[id])) throw new Error(`ya hay una fuente «${id}»; elige otro nombre`);
  const lineas = [`${id}:`, `  nombre: ${nombre}`, `  tipo: ${tipo}`, `  ruta: ${contraer(abs)}`, ...(tipo === 'nextcloud' ? [`  remota: ${remota}`, `  url: ${url}`] : [])];
  mkdirSync(path.dirname(FUENTES), { recursive: true });
  writeFileSync(FUENTES, `${(previo ?? CABECERA_FUENTES).replace(/\s*$/, '')}\n\n${lineas.join('\n')}\n`, 'utf8');
  return { id };
}
