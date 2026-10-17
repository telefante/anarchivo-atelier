// Arma Anarchivo.app (macOS) en desktop/out/. La app no lleva el dashboard dentro: anota dónde está
// (dashboard-path.txt) y al abrir levanta su servidor desde ahí, así que siempre usa el código y el playbook al día.
// Si se mueve la carpeta, la app pregunta dónde quedó (menú Anarchivo → Elegir la carpeta dashboard/…).
import { packager } from '@electron/packager';
import { writeFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.join(here, '..');
writeFileSync(path.join(raiz, 'dashboard-path.txt'), path.resolve(raiz, '..') + '\n');
if (!existsSync(path.join(here, 'icono.icns'))) await import('./icono.mjs');

const [salida] = await packager({
  dir: raiz, out: path.join(raiz, 'out'), overwrite: true,
  name: 'Anarchivo', executableName: 'Anarchivo', appBundleId: 'de.nvgstudio.anarchivo', appCategoryType: 'public.app-category.productivity',
  icon: path.join(here, 'icono.icns'), platform: 'darwin', arch: process.arch,
  ignore: [/^\/out($|\/)/, /^\/node_modules($|\/)/, /^\/\.gitignore$/, /^\/build\/(empaquetar|icono)\.mjs$/, /^\/build\/icono\.(svg|icns)$/, /^\/README\.md$/],
  prune: true, asar: true,
});
rmSync(path.join(raiz, 'dashboard-path.txt'), { force: true });
const app = path.join(salida, 'Anarchivo.app');
console.log(`listo: ${app}`);
// --instalar: copiarla a ~/Applications (sin pedir permisos de administrador)
if (process.argv.includes('--instalar')) {
  const destino = path.join(process.env.HOME, 'Applications', 'Anarchivo.app');
  rmSync(destino, { recursive: true, force: true });
  cpSync(app, destino, { recursive: true, verbatimSymlinks: true });
  console.log(`instalada en ${destino}`);
}
