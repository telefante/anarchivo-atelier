#!/usr/bin/env node
// Cataloga originales: deja en el playbook su vista previa y su ficha, con el enlace al original (que no se copia).
// Uso: npm run catalogar -- <archivo|carpeta>... [--proyecto 07-proyectos/<proyecto>] [--recursivo]
// Sin --proyecto, la vista previa va a 08-imagenes/ («Sueltas»). Las fuentes se declaran en 08-imagenes/archivo-fuentes.yaml.
import { statSync } from 'node:fs';
import path from 'node:path';
import { catalogar, archivosDe, leerFuentes, FUENTES, CATALOGABLES } from './archivo.mjs';

const args = process.argv.slice(2);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args.splice(i, 2)[1] : ''; };
const proyecto = val('--proyecto');
const rec = args.includes('--recursivo') && !!args.splice(args.indexOf('--recursivo'), 1);
const rutas = args.filter((a) => !a.startsWith('--'));
if (!rutas.length) {
  console.error('Uso: npm run catalogar -- <archivo|carpeta>... [--proyecto 07-proyectos/<proyecto>] [--recursivo]');
  process.exit(1);
}
const fuentes = leerFuentes();
if (!fuentes.length) { console.error(`No hay fuentes declaradas. Créalas en ${FUENTES} (ver docs/documentar.md).`); process.exit(1); }

const lista = [];
for (const r of rutas) {
  const abs = path.resolve(r);
  let st; try { st = statSync(abs); } catch { console.error(`✗ no existe: ${r}`); continue; }
  if (st.isDirectory()) { const a = archivosDe(abs, rec); if (!a.length) console.error(`· ${r}: sin archivos catalogables${rec ? '' : ' (¿falta --recursivo?)'}`); lista.push(...a); }
  else if (CATALOGABLES.has(path.extname(abs).toLowerCase())) lista.push(abs);
  else console.error(`✗ formato no catalogable: ${r}`);
}
const mb = (b) => (b / 1048576).toFixed(b > 1e8 ? 0 : 1);
let nuevas = 0, repetidas = 0, errores = 0;
for (const [i, abs] of lista.entries()) {
  const r = await catalogar(abs, { proyecto, fuentes });
  const pre = `[${i + 1}/${lista.length}]`;
  if (r.estado === 'nueva') { nuevas++; console.log(`${pre} ✓ ${r.nombre}  (${mb(r.bytes)} MB) → ${r.key}`); }
  else if (r.estado === 'repetida') { repetidas++; console.log(`${pre} = ${r.nombre}  ya catalogado en ${r.en}`); }
  else { errores++; console.error(`${pre} ✗ ${r.nombre}: ${r.error}`); }
}
console.log(`\n${nuevas} nuevas · ${repetidas} repetidas · ${errores} con error`);
if (nuevas) console.log('Para verlas en Anarchivo: npm run sync (o recarga con npm run dev).');
process.exit(errores && !nuevas ? 1 : 0);
