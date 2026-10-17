// Genera el icono de la app desde build/icono.svg: icono.png (1024) e icono.icns (macOS, con iconutil).
// Usa el sharp que ya tiene dashboard/ — no añade dependencias.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(path.join(here, '..', '..', 'package.json'))('sharp');
const svg = readFileSync(path.join(here, 'icono.svg'));
await sharp(svg, { density: 300 }).resize(1024, 1024).png().toFile(path.join(here, 'icono.png'));

const set = path.join(here, 'icono.iconset');
rmSync(set, { recursive: true, force: true }); mkdirSync(set);
for (const s of [16, 32, 128, 256, 512]) {
  await sharp(svg, { density: 300 }).resize(s, s).png().toFile(path.join(set, `icon_${s}x${s}.png`));
  await sharp(svg, { density: 300 }).resize(s * 2, s * 2).png().toFile(path.join(set, `icon_${s}x${s}@2x.png`));
}
execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(here, 'icono.icns')]);
rmSync(set, { recursive: true, force: true });
console.log('build/icono.png y build/icono.icns listos');
