// Lo que comparten el servidor local (scripts/finder.mjs, escribe en disco) y el servicio de Railway
// (ingest/server.mjs, escribe en Nextcloud por WebDAV): limpiar nombres, reducir imágenes y la ficha de un
// artefacto. Aquí no hay entrada/salida de archivos, solo funciones puras (más sharp): así los dos destinos
// guardan exactamente lo mismo.
import path from 'node:path';
import sharp from 'sharp';

export const MAX_FOTO = 80 * 1024 * 1024;
export const MAX_LADO = 2000; // lado mayor, en px, al que se reduce lo que se sube
export const TIPOS_ART = ['libro', 'grafica-enmarcada', 'original', 'fotografia', 'video', 'codigo'];
const EXT_IMG = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

export const slugDe = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');

// nombre de archivo seguro: sin carpetas, sin caracteres raros, sin punto inicial
export const limpiarNombre = (crudo) => path.basename(String(crudo || '')).normalize('NFC').replace(/[^\p{L}\p{N} ._()\-]/gu, '_').replace(/^\.+/, '');
export const esImagen = (limpio) => !!limpio && EXT_IMG.includes(path.extname(limpio).toLowerCase());
// el i-ésimo nombre posible: foto.png, foto-2.png, foto-3.png…
export const candidato = (base, ext, i) => (i < 2 ? `${base}${ext}` : `${base}-${i}${ext}`);

// se endereza según su EXIF, se reduce a MAX_LADO y se pasa a png (un gif se deja tal cual, para no perder la
// animación). Devuelve { base, ext, buf }; si no se puede leer, el original sin tocar.
export async function procesarImagen(limpio, buf) {
  let ext = path.extname(limpio), out = buf;
  const base = limpio.slice(0, -ext.length);
  if (ext.toLowerCase() !== '.gif') {
    try {
      out = await sharp(buf).rotate().resize({ width: MAX_LADO, height: MAX_LADO, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
      ext = '.png';
    } catch { /* no se pudo leer: se guarda como llegó */ }
  }
  return { base, ext, buf: out };
}

export const tituloLimpio = (t) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim() : '');
export const tipoArt = (t) => (TIPOS_ART.includes(t) ? t : 'original');

// ficha nueva: solo título y tipo; el resto queda en blanco para escribirlo luego (no se inventa nada)
export function fichaArtefacto(title, tipo, hoy) {
  const fm = [`title: ${JSON.stringify(title)}`, `tipo: ${tipo}`, 'año:', 'tecnica:', 'medidas:', 'tirada:', 'estado:', 'ubicacion:', 'precio:', 'enlace:', 'imagen:', `abierto: ${hoy}`];
  return `---\n${fm.join('\n')}\n---\n\n# ${title}\n\n## Qué es\n\n<!--\nEn tus palabras: ¿qué es, de qué está hecho, dónde está?\n-->\n\n## Imágenes\n\n`;
}

// la primera foto es la portada; todas se enlazan al final de la ficha
export function conFoto(text, nombre) {
  const t = text.replace(/^imagen:[ \t]*$/m, `imagen: ./imagenes/${nombre}`);
  return `${t.replace(/\s*$/, '')}\n\n![](./imagenes/${nombre})\n`;
}

// --- imágenes adicionales de un proyecto en curso: 07-proyectos/<proyecto>[/<pieza>]/imagenes/ + su imagenes.yaml ---
// Solo esas rutas (uno o dos niveles, sin «..» ni carpetas ocultas): el cliente manda la ruta del nodo del índice.
export function rutaProyecto(r, carpeta = '07-proyectos') {
  const s = String(r || '');
  if (!s.startsWith(`${carpeta}/`)) return null;
  const m = s.slice(carpeta.length + 1).match(/^([^/\\.][^/\\]*)(?:\/([^/\\.][^/\\]*))?$/);
  return m ? [carpeta, m[1], ...(m[2] ? [m[2]] : [])] : null;
}
export const CABECERA_IMAGENES = `# imagenes.yaml — catálogo de material visual de este proyecto.
# Nada se infiere del contenido: cada campo lo llena quien cataloga.
# Campos: alt (descripción corta, alimenta la búsqueda), tags (vocabulario libre,
# no el de concepts.ts), relacionadas (otras claves de este archivo, o
# "otro-proyecto/archivo.ext" para cruzar proyectos), fecha, fuente (crédito,
# solo si no es material propio).
`;
// el texto del imagenes.yaml con la entrada de `nombre` añadida al final (texto null = el archivo no existe aún);
// lo que ya había, comentarios incluidos, no se toca. Si la clave ya estaba, devuelve el texto tal cual.
// `extra` ({ campo: valor }) añade campos al final de la entrada (el catálogo de originales pone `original_*`).
export function conEntradaImagen(texto, nombre, hoy, extra = {}) {
  const base = texto == null ? CABECERA_IMAGENES : texto;
  if (base.split('\n').some((l) => l.trimEnd() === `${nombre}:`)) return base;
  const campos = Object.entries(extra).map(([k, v]) => `  ${k}: ${v}\n`).join('');
  return `${base.replace(/\s*$/, '')}\n\n${nombre}:\n  alt:\n  tags: []\n  relacionadas: []\n  fecha: ${hoy}\n  fuente:\n${campos}`;
}
