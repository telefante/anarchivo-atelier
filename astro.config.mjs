import { defineConfig } from 'astro/config';
import finder from './scripts/finder.mjs';

// Dashboard local, solo lectura. Deploy opcional y protegido con contraseña
// en una subcarpeta de tu hosting (p. ej. /anarchivo/, ver scripts/deploy.sh) — el
// contenido sigue siendo privado, la protección la pone el .htaccess, no
// esto. En dev sirve desde la raíz; el build de deploy pasa ATELIER_BASE.
export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  base: process.env.ATELIER_BASE || '/',
  integrations: [finder()], // solo actúa en dev: «Mostrar en Finder» de la Mesa
});
