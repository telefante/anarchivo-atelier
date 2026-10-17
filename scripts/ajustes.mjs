// «Ajustes» — el panel que reúne cómo está montado el dashboard: el nombre del archivo, dónde está y cómo se llaman
// sus carpetas, qué no se lee nunca, el vocabulario, Conversar y a dónde se publica. Solo en `npm run dev`.
//  · GET  /__ajustes   — los ajustes, qué es cada carpeta, cómo está cada una en el disco y el índice actual
//  · POST /__ajustes   — guardar (solo campos conocidos, validados) en dashboard/anarchivo.config.json
// Las rutas de escritura (Subir, Catalogar, constelaciones…) se leen al arrancar `npm run dev`: si cambian la carpeta
// del archivo o los nombres de carpetas, hay que reiniciarlo (Node guarda los módulos en caché; un reinicio de Astro
// por dentro no basta). El índice sí vale enseguida: el panel resincroniza.
// Lo que escribe es anarchivo.config.json, que es del dashboard: nunca toca el playbook ni renombra carpetas.
import { readFileSync } from 'node:fs';
import { cargar, guardar, estado, ROLES, DEFAULTS, SIEMPRE_FUERA } from './config.mjs';

export function registrarAjustes(server, { json, ajena, INDEX }) {
  const cuerpo = (req) => new Promise((ok) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 100000) req.destroy(); });
    req.on('end', () => { try { ok(JSON.parse(s)); } catch { ok(null); } });
    req.on('error', () => ok(null));
  });

  server.middlewares.use('/__ajustes', async (req, res) => {
    if (ajena(req) || !['GET', 'POST'].includes(req.method)) return json(res, 403, { ok: false });
    if (req.method === 'POST') {
      const b = await cuerpo(req);
      if (!b) return json(res, 400, { ok: false, errores: ['petición ilegible'] });
      const r = guardar(b);
      return json(res, r.ok ? 200 : 400, r);
    }
    const c = cargar();
    let indice = null;
    try {
      const d = JSON.parse(readFileSync(INDEX, 'utf8')), cuentas = {};
      for (const n of d.grafo?.nodes || []) cuentas[n.kind] = (cuentas[n.kind] || 0) + 1;
      indice = { generado: d.generado, demo: !!d.demo, cuentas, conceptos: (d.grafo?.concepts || []).filter((x) => x.count).length };
    } catch { /* todavía sin índice */ }
    json(res, 200, {
      ok: true,
      ajustes: { nombre: c.nombre, firma: c.firma, playbook: c.playbook, carpetas: c.carpetas, nuncaLeer: c.nuncaLeer, vocabulario: c.vocabulario, conversar: c.conversar, publicar: c.publicar },
      defaults: DEFAULTS, roles: ROLES, siempreFuera: SIEMPRE_FUERA, estado: estado(c), indice,
    });
  });
}
