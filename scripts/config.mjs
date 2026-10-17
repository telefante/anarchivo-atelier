// Ajustes del dashboard: cómo se llama el archivo, dónde está y cómo se llaman sus carpetas, qué no se lee nunca,
// el vocabulario, Conversar y a dónde se publica. Viven en dashboard/anarchivo.config.json (lo escribe el panel
// «Ajustes» en local; se puede editar a mano; es de cada quien y no se versiona: la plantilla es
// anarchivo.config.example.json). Lo que falta en el archivo toma el valor de DEFAULTS, y las variables de entorno de siempre (PLAYBOOK_DIR, CONCEPTS_TS, LMSTUDIO_URL, REMOTE_BASE)
// siguen ganando sobre el archivo.
// Cambiar un nombre aquí NO renombra la carpeta en el disco: le dice al dashboard cómo se llama.
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DASHBOARD = path.join(here, '..');
export const ARCHIVO_CONFIG = path.join(DASHBOARD, 'anarchivo.config.json');

export const DEFAULTS = {
  nombre: 'Anarchivo',
  firma: 'Yo',
  playbook: 'ejemplo', // relativo a dashboard/, o absoluto; '..' cuando dashboard/ vive dentro del archivo
  carpetas: {
    proyectos: '07-proyectos',
    artefactos: '02-artefactos',
    ensayos: '05-ensayos',
    imagenes: '08-imagenes',
    constelaciones: '09-constelaciones',
    conversaciones: '10-conversaciones',
    convocatorias: 'convocatorias',
    publicado: '_dossier-projects',
    laboratorio: '_lab-projects',
    bitacora: 'bitacora.md',
  },
  nuncaLeer: [],
  vocabulario: '', // ruta a concepts.ts; vacía = concepts.ts en la raíz del archivo, o junto a la carpeta de obra publicada
  conversar: {
    lmstudio: 'http://localhost:1234',
    guardar: true, // cada conversación se guarda sola en la carpeta de conversaciones
    presentacion: 'Eres un interlocutor para un archivo de trabajo artístico: proyectos, textos, una bitácora e imágenes. Conversas con quien lo lleva sobre su propio archivo para pensar y generar ideas.',
  },
  publicar: {
    destino: '', // usuario@servidor:/ruta/del/sitio — vacío = no se publica
    base: '/anarchivo/',
  },
};

// qué es cada carpeta, para el panel (y para quien monta su propio archivo)
export const ROLES = {
  proyectos: { label: 'Proyectos en curso', tipo: 'carpeta', ayuda: 'una carpeta por proyecto, con concepto.md (o README.md) e imagenes/' },
  artefactos: { label: 'Artefactos', tipo: 'carpeta', ayuda: 'lo que existe como cosa: <slug>/<slug>.md + imagenes/' },
  ensayos: { label: 'Ensayos', tipo: 'carpeta', ayuda: 'textos largos, un .md por texto' },
  imagenes: { label: 'Imágenes sueltas', tipo: 'carpeta', ayuda: 'fotos todavía sin proyecto; aquí guarda «Subir imagen»' },
  constelaciones: { label: 'Constelaciones', tipo: 'carpeta', ayuda: 'un .md por constelación; las escribe la Mesa' },
  conversaciones: { label: 'Conversaciones', tipo: 'carpeta', ayuda: 'las conversaciones de «Conversar», un .md cada una' },
  convocatorias: { label: 'Convocatorias', tipo: 'carpeta', ayuda: 'una subcarpeta por candidatura (opcional)' },
  publicado: { label: 'Obra publicada', tipo: 'carpeta', ayuda: 'proyectos ya publicados, cada uno con images/ (opcional; p. ej. un symlink a los datos de tu web)' },
  laboratorio: { label: 'Laboratorio', tipo: 'carpeta', ayuda: 'proyectos de otra práctica, sin frontmatter (opcional)' },
  bitacora: { label: 'Bitácora', tipo: 'archivo', ayuda: 'un .md con entradas «## AAAA-MM-DD», la más reciente arriba' },
};
// lo que nunca se lee, se ponga lo que se ponga en los ajustes
export const SIEMPRE_FUERA = ['dashboard', 'node_modules', '.git'];

const leerArchivo = () => { try { return JSON.parse(readFileSync(ARCHIVO_CONFIG, 'utf8')); } catch { return {}; } };

export function cargar() {
  const f = leerArchivo();
  const c = {
    ...DEFAULTS, ...f,
    carpetas: { ...DEFAULTS.carpetas, ...(f.carpetas || {}) },
    conversar: { ...DEFAULTS.conversar, ...(f.conversar || {}) },
    publicar: { ...DEFAULTS.publicar, ...(f.publicar || {}) },
    nuncaLeer: Array.isArray(f.nuncaLeer) ? f.nuncaLeer : DEFAULTS.nuncaLeer,
  };
  c.raiz = path.resolve(process.env.PLAYBOOK_DIR || path.resolve(DASHBOARD, c.playbook || '..'));
  c.ruta = (rol) => path.join(c.raiz, c.carpetas[rol]);
  c.bloqueadas = new Set([...SIEMPRE_FUERA, ...c.nuncaLeer]);
  c.vocabularioEnv = process.env.CONCEPTS_TS || '';
  c.lmstudio = (process.env.LMSTUDIO_URL || c.conversar.lmstudio).replace(/\/+$/, '');
  return c;
}

// un nombre de carpeta: relativo, sin «..», sin barras al principio
const nombreValido = (v) => typeof v === 'string' && v.trim() && !path.isAbsolute(v) && !v.split(/[\\/]/).includes('..');

// guarda lo que llega del panel (solo campos conocidos, validados) y devuelve qué cambió
export function guardar(nuevo) {
  const antes = cargar(), f = leerArchivo(), errores = [];
  const out = { ...f };
  const texto = (v, max = 4000) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : undefined);
  if (texto(nuevo.nombre)) out.nombre = texto(nuevo.nombre, 80);
  if (texto(nuevo.firma)) out.firma = texto(nuevo.firma, 40);
  if (texto(nuevo.playbook) != null) {
    const p = texto(nuevo.playbook);
    if (!p || existsSync(path.resolve(DASHBOARD, p))) out.playbook = p || '..'; else errores.push(`no encuentro la carpeta del archivo «${p}»`);
  }
  if (nuevo.carpetas && typeof nuevo.carpetas === 'object') {
    out.carpetas = { ...(f.carpetas || {}) };
    for (const k of Object.keys(ROLES)) {
      const v = texto(nuevo.carpetas[k], 200);
      if (v == null) continue;
      if (nombreValido(v)) out.carpetas[k] = v; else errores.push(`«${v}» no vale como nombre de ${ROLES[k].label.toLowerCase()}`);
    }
  }
  if (Array.isArray(nuevo.nuncaLeer)) out.nuncaLeer = [...new Set(nuevo.nuncaLeer.map((x) => texto(x, 200)).filter((x) => x && nombreValido(x)))];
  if (texto(nuevo.vocabulario) != null) out.vocabulario = texto(nuevo.vocabulario, 500);
  if (nuevo.conversar && typeof nuevo.conversar === 'object') {
    out.conversar = { ...(f.conversar || {}) };
    const u = texto(nuevo.conversar.lmstudio, 300);
    if (u != null) { if (/^https?:\/\/[^\s]+$/.test(u)) out.conversar.lmstudio = u; else errores.push('la dirección de LM Studio tiene que empezar por http:// o https://'); }
    if (typeof nuevo.conversar.guardar === 'boolean') out.conversar.guardar = nuevo.conversar.guardar;
    if (texto(nuevo.conversar.presentacion)) out.conversar.presentacion = texto(nuevo.conversar.presentacion, 4000);
  }
  if (nuevo.publicar && typeof nuevo.publicar === 'object') {
    out.publicar = { ...(f.publicar || {}) };
    const d = texto(nuevo.publicar.destino, 500), b = texto(nuevo.publicar.base, 100);
    if (d != null) out.publicar.destino = d;
    if (b != null) { if (/^\/[\w\-./]*\/$/.test(b)) out.publicar.base = b; else errores.push('la subcarpeta de publicación va entre barras, p. ej. /anarchivo/'); }
  }
  if (errores.length) return { ok: false, errores };
  writeFileSync(ARCHIVO_CONFIG, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  const despues = cargar();
  // lo que el servidor de desarrollo leyó al arrancar (rutas de escritura) pide reiniciarlo; lo demás vale ya
  const reiniciar = antes.raiz !== despues.raiz || JSON.stringify(antes.carpetas) !== JSON.stringify(despues.carpetas);
  const resincronizar = reiniciar || JSON.stringify(antes.nuncaLeer) !== JSON.stringify(despues.nuncaLeer) || antes.vocabulario !== despues.vocabulario;
  return { ok: true, reiniciar, resincronizar };
}

// cómo está cada cosa en el disco: para el panel, que así sirve también de diagnóstico
export function estado(c = cargar()) {
  const cuenta = (abs) => {
    try {
      const st = statSync(abs);
      if (!st.isDirectory()) return { existe: true, tipo: 'archivo', bytes: st.size };
      const xs = readdirSync(abs).filter((n) => !n.startsWith('.'));
      return { existe: true, tipo: 'carpeta', elementos: xs.length };
    } catch { return { existe: false }; }
  };
  const carpetas = Object.fromEntries(Object.keys(ROLES).map((k) => [k, cuenta(c.ruta(k))]));
  const vocab = c.vocabularioEnv || c.vocabulario || (existsSync(path.join(c.raiz, 'concepts.ts')) && 'concepts.ts') || (() => { try { return path.join(realpathSync(c.ruta('publicado')), '..', 'concepts.ts'); } catch { return ''; } })();
  let conceptos = 0;
  try { conceptos = [...readFileSync(path.resolve(c.raiz, vocab), 'utf8').matchAll(/^ {2}'[a-z-]+': \{/gm)].length; } catch { /* sin vocabulario */ }
  return {
    raiz: c.raiz, raizExiste: existsSync(c.raiz), carpetas,
    vocabulario: { ruta: vocab, conceptos, desdeEntorno: !!c.vocabularioEnv },
    entorno: { PLAYBOOK_DIR: process.env.PLAYBOOK_DIR || '', CONCEPTS_TS: process.env.CONCEPTS_TS || '', LMSTUDIO_URL: process.env.LMSTUDIO_URL || '', REMOTE_BASE: process.env.REMOTE_BASE || '' },
    archivo: path.relative(path.join(DASHBOARD, '..'), ARCHIVO_CONFIG),
  };
}
