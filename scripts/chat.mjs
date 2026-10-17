// «Conversar» — chat con un modelo local de LM Studio sobre lo que hay en el playbook. Solo en `npm run dev`
// (lo registra scripts/finder.mjs). Nada sale de este Mac: la página habla con el servidor de desarrollo, y este
// con LM Studio (servidor OpenAI-compatible, por defecto http://localhost:1234; otro con LMSTUDIO_URL).
//  · GET  /__chat-modelos — los modelos de LM Studio (cuáles están cargados y cuáles ven imágenes)
//  · POST /__chat         — { messages, refs, modelo, contexto, ver } → respuesta en streaming (SSE)
//  · POST /__conversacion — guardar la conversación como .md en la carpeta de conversaciones del archivo
//                           (por defecto 10-conversaciones/). Es la única escritura de este módulo: crea un
//                           archivo nuevo (nunca pisa otro) y después solo reescribe ESE archivo, y solo si nadie
//                           lo tocó a mano desde la última vez (se compara su sha256); si cambió, guarda uno nuevo.
//    GET  /__conversacion?archivo= — leer una guardada de vuelta a mensajes, para retomarla
//  · GET  /__conversaciones — las guardadas, la más reciente primero (título, fecha, cuántos mensajes)
//  · POST /__conversacion-abrir?archivo=&con=obsidian|finder — abrirla en Obsidian (si la carpeta del archivo es una
//                           bóveda) o mostrarla en Finder (macOS, `open`). Solo archivos de esa carpeta, por nombre.
// El contexto se arma aquí, en cada turno: lo que la página pide expresamente (`refs`: ids del índice, nunca rutas)
// y lo que más se parece a la pregunta, buscado en el texto completo de los .md que el índice ya conoce
// (proyectos, obras publicadas, ensayos, bitácora, artefactos, constelaciones) y en las notas de las imágenes.
// Con un modelo de visión, las fotos nombradas viajan también como imagen (reducidas a 768 px).
// Fuera de las conversaciones no escribe nada: ni en el playbook ni en el índice.
// La dirección de LM Studio, la presentación del interlocutor y la firma salen de los ajustes (scripts/config.mjs),
// leídos en cada petición: un cambio en «Ajustes» vale desde la pregunta siguiente.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cargar as ajustes } from './config.mjs';
import { slugDe } from '../ingest/core.mjs';

const lmDe = () => ajustes().lmstudio;
const sinLm = () => `LM Studio no responde en ${lmDe()}. Abre LM Studio, carga un modelo y enciende el servidor local (pestaña Developer → Start Server).`;
const KIND = { activo: 'proyecto en curso', publicado: 'obra publicada', laboratorio: 'proyecto de laboratorio', artefacto: 'artefacto', bitacora: 'entrada de bitácora', ensayo: 'ensayo', convocatoria: 'convocatoria', imagen: 'imagen', constelacion: 'constelación' };
const STOP = new Set(('que los las del por con una uno unos unas para como pero mas sus este esta esto estos estas ese esa eso hay sobre entre desde hasta cuando donde quien cual muy tambien todo toda todos todas otro otra ser estar tengo tiene tienen puede hacer algo nada aqui alli asi sin les nos mis tus ella ellos ello fue era han has hemos the and for with from that this what which are was were have has not you your der die das und mit von den dem ein eine ist nicht auch sich auf fur zum zur ich du wir sie es ideas idea dame quiero podria podrias puedes hablame sobre').split(' '));

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const raices = (t) => norm(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 6));
const sinFrente = (t) => t.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
const recorta = (t, n) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')} […]` : t);

export function registrarChat(server, { ROOT, INDEX, json, ajena }) {
  // --- el corpus: un documento por nodo del índice, con su texto completo. Se rehace cuando cambia el índice ---
  let corpus = null, version = '';
  function leerTexto(n, idx) {
    if (n.kind === 'bitacora') return idx.bitacora?.find((b) => b.date === n.date)?.body || n.sub || '';
    if (n.kind === 'imagen') return '';
    const abs = n.file && path.resolve(ROOT, n.file);
    if (!abs || !abs.startsWith(ROOT + path.sep) || !existsSync(abs)) return n.excerpt || n.sub || '';
    try {
      if (statSync(abs).isDirectory()) { // una convocatoria, una carpeta de ensayos: sus .md de primer nivel
        return readdirSync(abs).filter((f) => f.endsWith('.md')).sort().slice(0, 6)
          .map((f) => `## ${f}\n${sinFrente(readFileSync(path.join(abs, f), 'utf8'))}`).join('\n\n');
      }
      return abs.endsWith('.md') ? sinFrente(readFileSync(abs, 'utf8')) : n.excerpt || n.sub || '';
    } catch { return n.excerpt || n.sub || ''; }
  }
  function cargar() {
    let idx;
    try { idx = JSON.parse(readFileSync(INDEX, 'utf8')); } catch { return corpus; }
    if (corpus && idx.generado === version) return corpus;
    const g = idx.grafo, byId = new Map(g.nodes.map((n) => [n.id, n]));
    const concepto = new Map(g.concepts.map((c) => [c.slug, c.label]));
    const docs = g.nodes.map((n) => {
      const proy = n.parent && byId.get(n.parent);
      const meta = [n.sub, n.year, n.venue, n.tecnica, (n.concepts || []).map((c) => concepto.get(c) || c).join(', '), (n.personas || []).join(', '), (n.tags || []).join(', '), n.nota, proy?.title].filter(Boolean).join(' · ');
      const texto = leerTexto(n, idx);
      const cuenta = new Map();
      for (const r of raices(`${texto} ${meta}`)) cuenta.set(r, (cuenta.get(r) || 0) + 1);
      return { n, proy, meta, texto, titulo: new Set(raices(n.title)), cuenta };
    });
    // el mapa que va siempre: qué hay en el archivo, en una línea por cosa (sin las obras publicadas, que son muchas)
    const linea = (n) => `- ${n.title} [[${n.id}]]${n.concepts?.length ? ` — ${n.concepts.map((c) => concepto.get(c) || c).join(', ')}` : ''}`;
    const grupo = (k, t) => { const ns = g.nodes.filter((n) => n.kind === k); return ns.length ? `${t} (${ns.length}):\n${ns.map(linea).join('\n')}` : ''; };
    const mapa = [
      `Conceptos del vocabulario: ${g.concepts.filter((c) => c.count).map((c) => c.label).join(' · ')}.`,
      grupo('activo', 'Proyectos en curso'), grupo('artefacto', 'Artefactos'), grupo('laboratorio', 'Laboratorio'), grupo('constelacion', 'Constelaciones'),
      `Además: ${g.nodes.filter((n) => n.kind === 'publicado').length} obras publicadas, ${g.nodes.filter((n) => n.kind === 'ensayo').length} ensayos, ${g.nodes.filter((n) => n.kind === 'bitacora').length} entradas de bitácora y ${g.nodes.filter((n) => n.kind === 'imagen').length} imágenes (aparecen abajo solo si vienen al caso).`,
    ].filter(Boolean).join('\n\n');
    corpus = { docs, byId: new Map(docs.map((d) => [d.n.id, d])), imagenesDe: (id) => docs.filter((d) => d.n.kind === 'imagen' && d.n.parent === id), mapa };
    version = idx.generado;
    return corpus;
  }

  function puntuar(d, qs) {
    let s = 0;
    for (const q of qs) {
      if (d.titulo.has(q)) s += 6;
      const c = d.cuenta.get(q);
      if (c) s += 1 + Math.log(c);
    }
    return d.n.kind === 'imagen' ? s * 0.7 : s;
  }
  const ficha = (d, largo) => {
    const n = d.n, cab = `### ${n.title} [[${n.id}]]\n(${KIND[n.kind] || n.kind}${n.file ? ` · ${n.file}` : ''})`;
    if (n.kind === 'imagen') return `${cab}\n${[d.proy ? `del proyecto «${d.proy.title}»` : '', n.fecha, n.nota ? `nota: ${n.nota}` : 'sin nota', (n.tags || []).length ? `etiquetas: ${n.tags.join(', ')}` : ''].filter(Boolean).join(' · ')}`;
    return `${cab}\n${d.meta ? `${d.meta}\n` : ''}${recorta(d.texto || n.excerpt || '', largo)}`;
  };

  function contexto({ refs, consulta, presupuesto, notas }) {
    const c = cargar();
    if (!c) return { texto: '', fuentes: [], imagenes: [] };
    const elegidos = [...new Set(refs)].map((id) => c.byId.get(id)).filter(Boolean);
    const partes = [], fuentes = [];
    let resto = presupuesto;
    const ya = new Set();
    const poner = (d, largo, porque) => {
      if (ya.has(d.n.id)) return true;
      let t = ficha(d, largo);
      const nota = notas?.[d.n.id];
      if (nota) t += `\nnota en la Mesa: ${recorta(nota, 600)}`;
      if (t.length > resto) return false;
      partes.push(t); resto -= t.length; ya.add(d.n.id); fuentes.push({ id: d.n.id, title: d.n.title, kind: d.n.kind, porque });
      return true;
    };
    // lo nombrado va primero y más largo (repartido, pero al menos 1500 caracteres cada uno); después, sus imágenes con nota
    const largo = Math.max(1500, Math.floor((presupuesto * 0.6) / Math.max(1, elegidos.length)));
    for (const d of elegidos) poner(d, largo, 'elegido');
    for (const d of elegidos) {
      if (['activo', 'publicado', 'artefacto', 'laboratorio'].includes(d.n.kind)) { // sus imágenes con nota, para poder hablar de ellas
        for (const im of c.imagenesDe(d.n.id).filter((x) => x.n.nota).slice(0, 8)) poner(im, 300, 'imagen de lo elegido');
      }
    }
    // lo que más se parece a la pregunta
    const qs = [...new Set(raices(consulta))];
    if (qs.length) {
      const hits = c.docs.filter((d) => !ya.has(d.n.id)).map((d) => [d, puntuar(d, qs)]).filter(([, s]) => s > 1.5).sort((a, b) => b[1] - a[1]);
      let imgs = 0;
      for (const [d] of hits.slice(0, 14)) {
        if (d.n.kind === 'imagen' && ++imgs > 6) continue;
        if (resto < 400) break;
        poner(d, Math.min(2500, Math.floor(resto / 3)), 'parecido a la pregunta');
      }
    }
    // las fotos que el modelo puede mirar: las elegidas, y si no hay, las de los proyectos elegidos
    const imagenes = [...new Set([...elegidos.filter((d) => d.n.kind === 'imagen'), ...elegidos.flatMap((d) => (d.n.kind === 'imagen' ? [] : c.imagenesDe(d.n.id).slice(0, 2)))].map((d) => d.n))]
      .slice(0, 4);
    return { texto: `${c.mapa}\n\n---\n\n${partes.join('\n\n')}`, fuentes, imagenes };
  }

  async function comoDato(n) {
    const abs = n.file && path.resolve(ROOT, n.file);
    if (!abs || !abs.startsWith(ROOT + path.sep) || !existsSync(abs)) return null;
    try {
      const buf = await sharp(abs).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    } catch { return null; }
  }

  async function modelos() {
    const LM = lmDe();
    // /api/v0 es la API propia de LM Studio (dice qué está cargado y qué ve imágenes); /v1 es la compatible, por si acaso
    try {
      const r = await fetch(`${LM}/api/v0/models`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) return (await r.json()).data.filter((m) => m.type !== 'embeddings').map((m) => ({ id: m.id, cargado: m.state === 'loaded', vision: m.type === 'vlm' }));
    } catch { /* sigue con /v1 */ }
    const r = await fetch(`${LM}/v1/models`, { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error(`LM Studio respondió ${r.status}`);
    return (await r.json()).data.filter((m) => !/embed/i.test(m.id)).map((m) => ({ id: m.id, cargado: true, vision: false }));
  }

  // la presentación (quién es el artista, de qué va su práctica) se cambia en «Ajustes»; las reglas son fijas
  const sistema = (cfg) => `${cfg.conversar.presentacion}
Debajo tienes un mapa del archivo y fichas de lo que viene al caso en este turno: proyectos, obras publicadas, ensayos, bitácora, imágenes y sus notas.
- Apóyate en esas fichas. Cuando te refieras a algo de ellas, cita su id entre dobles corchetes, tal cual aparece, por ejemplo [[sala-mendoza]] o [[bitacora:2026-10-05]].
- No inventes datos sobre las obras (fechas, lugares, técnicas, colaboradores). Si algo no está en las fichas, dilo.
- Las ideas que propongas son propuestas tuyas: márcalas como tales, nunca como convicciones de ${cfg.firma}. Prefiere abrir preguntas, cruces entre proyectos y caminos posibles a cerrar conclusiones.
- Tono reflexivo y concreto, sin lenguaje de marketing. Responde en el idioma en que te escriben.`;

  server.middlewares.use('/__chat-modelos', async (req, res) => {
    if (req.method !== 'GET' || ajena(req)) return json(res, 403, { ok: false });
    const cfg = ajustes();
    try { json(res, 200, { ok: true, lm: cfg.lmstudio, guardar: cfg.conversar.guardar, carpeta: cfg.carpetas.conversaciones, firma: cfg.firma, modelos: await modelos() }); } catch { json(res, 502, { ok: false, error: sinLm(), guardar: cfg.conversar.guardar, carpeta: cfg.carpetas.conversaciones, firma: cfg.firma }); }
  });

  server.middlewares.use('/__chat', async (req, res) => {
    if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
    const b = await new Promise((ok) => {
      let s = '';
      req.on('data', (c) => { s += c; if (s.length > 2e6) req.destroy(); });
      req.on('end', () => { try { ok(JSON.parse(s)); } catch { ok(null); } });
      req.on('error', () => ok(null));
    });
    const msgs = Array.isArray(b?.messages) ? b.messages.filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string') : [];
    if (!msgs.length || msgs.at(-1).role !== 'user') return json(res, 400, { ok: false, error: 'falta la pregunta' });
    const presupuesto = Math.min(Math.max(Number(b.contexto) || 14000, 3000), 120000);
    const refs = Array.isArray(b.refs) ? b.refs.filter((x) => typeof x === 'string').slice(0, 40) : [];
    const notas = b.notas && typeof b.notas === 'object' ? b.notas : {};

    let lista;
    try { lista = await modelos(); } catch { return json(res, 502, { ok: false, error: sinLm() }); }
    const modelo = lista.find((m) => m.id === b.modelo) || lista.find((m) => m.cargado) || lista[0];
    if (!modelo) return json(res, 502, { ok: false, error: 'LM Studio no tiene ningún modelo de chat. Descarga uno en LM Studio (pestaña Discover).' });

    // la consulta para buscar: esta pregunta y la anterior (las preguntas cortas, «¿y eso?», viven de la anterior)
    const preguntas = msgs.filter((m) => m.role === 'user');
    const ctx = contexto({ refs, consulta: preguntas.slice(-2).map((m) => m.content).join(' '), presupuesto, notas });
    const avisos = [];
    let fotos = [];
    if (b.ver !== false && ctx.imagenes.length) {
      if (modelo.vision) fotos = (await Promise.all(ctx.imagenes.map(comoDato))).filter(Boolean);
      else avisos.push(`${modelo.id} no ve imágenes: de las fotos solo le llegan el nombre y la nota.`);
    }
    // la historia, de la más reciente hacia atrás, hasta la mitad del presupuesto
    const historia = [];
    for (let i = msgs.length - 2, resto = presupuesto / 2; i >= 0 && resto > 0; i--) { resto -= msgs[i].content.length; if (resto > 0) historia.unshift(msgs[i]); }
    const ultima = msgs.at(-1).content;
    const mensajes = [
      { role: 'system', content: `${sistema(ajustes())}\n\n# El archivo\n\n${ctx.texto}` },
      ...historia.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: fotos.length ? [{ type: 'text', text: `${ultima}\n\n(Te adjunto ${fotos.length === 1 ? 'la imagen' : `${fotos.length} imágenes`}: ${ctx.imagenes.slice(0, fotos.length).map((n) => `[[${n.id}]]`).join(', ')}.)` }, ...fotos.map((url) => ({ type: 'image_url', image_url: { url } }))] : ultima },
    ];

    const corte = new AbortController();
    res.on('close', () => corte.abort()); // la página paró o se cerró: LM Studio deja de generar
    let r;
    try {
      r = await fetch(`${lmDe()}/v1/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: corte.signal,
        body: JSON.stringify({ model: modelo.id, messages: mensajes, stream: true, temperature: Number(b.temperatura) || 0.7 }),
      });
    } catch { return json(res, 502, { ok: false, error: sinLm() }); }
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let e = t; try { e = JSON.parse(t).error?.message || JSON.parse(t).error || t; } catch { /* texto plano */ }
      return json(res, 502, { ok: false, error: `LM Studio: ${String(e).slice(0, 400) || r.status}` });
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache');
    const evento = (nombre, data) => res.write(`event: ${nombre}\ndata: ${JSON.stringify(data)}\n\n`);
    evento('fuentes', { modelo: modelo.id, fuentes: ctx.fuentes, fotos: ctx.imagenes.slice(0, fotos.length).map((n) => n.id), avisos });
    // las líneas de LM Studio pasan tal cual: «data: {…choices[0].delta…}» y al final «data: [DONE]»
    try { for await (const c of r.body) res.write(c); } catch { /* cortado */ }
    res.end();
  });

  // --- guardar la conversación: un .md por conversación en la carpeta de conversaciones del archivo ---
  const sha = (t) => createHash('sha256').update(t).digest('hex');
  const hora = (t) => (t ? new Date(t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : '');
  function comoMarkdown(b, cfg) {
    const msgs = b.mensajes, fecha = new Date(msgs[0]?.fecha || Date.now()).toLocaleDateString('sv');
    const modelos = [...new Set(msgs.filter((m) => m.role === 'assistant' && m.modelo).map((m) => m.modelo))];
    const lista = (k, vs) => (vs.length ? [`${k}:`, ...vs.map((v) => `  - ${JSON.stringify(v)}`)] : [`${k}: []`]);
    const fm = [`title: ${JSON.stringify(b.titulo)}`, `fecha: ${fecha}`, ...lista('modelos', modelos), ...lista('sobre', b.sobre), `conversacion: ${JSON.stringify(b.id)}`];
    const cuerpo = msgs.map((m) => {
      if (m.role === 'user') return `### ${cfg.firma}${m.fecha ? ` · ${hora(m.fecha)}` : ''}\n\n${m.content.trim()}`;
      const fichas = (m.fuentes || []).map((id) => `[[${id}]]`).join(' · ');
      return `### modelo${m.modelo ? ` · ${m.modelo}` : ''}${m.fecha ? ` · ${hora(m.fecha)}` : ''}\n\n${m.content.trim()}${fichas ? `\n\n> fichas: ${fichas}` : ''}`;
    }).join('\n\n');
    return `---\n${fm.join('\n')}\n---\n\n# ${b.titulo}\n\n*Conversación de «Conversar» (Anarchivo) con un modelo local. Lo que dice el modelo son propuestas suyas, no convicciones de ${cfg.firma}.*\n\n${cuerpo}\n`;
  }
  server.middlewares.use('/__conversacion', async (req, res) => {
    if (ajena(req) || !['GET', 'POST'].includes(req.method)) return json(res, 403, { ok: false });
    if (req.method === 'GET') {
      const cfg = ajustes(), archivo = new URL(req.url, 'http://localhost').searchParams.get('archivo') || '';
      const file = /^[\w.-]+\.md$/.test(archivo) && path.join(cfg.ruta('conversaciones'), archivo);
      if (!file || !existsSync(file)) return json(res, 404, { ok: false, error: 'no encuentro esa conversación' });
      const texto = readFileSync(file, 'utf8'), c = leerConversacion(texto, cfg);
      if (!c.mensajes.length) return json(res, 422, { ok: false, error: 'no reconozco los mensajes de ese archivo' });
      // ¿sigue tal cual lo escribimos? Entonces seguirla reescribe este archivo; si se editó a mano, seguirla abre otro
      const reescribible = comoMarkdown({ ...c }, cfg) === texto;
      return json(res, 200, { ok: true, ...c, archivo, hash: reescribible ? sha(texto) : '', reescribible, ruta: path.relative(cfg.raiz, file) });
    }
    const b = await new Promise((ok) => {
      let t = '';
      req.on('data', (c) => { t += c; if (t.length > 4e6) req.destroy(); });
      req.on('end', () => { try { ok(JSON.parse(t)); } catch { ok(null); } });
      req.on('error', () => ok(null));
    });
    const txt = (v, n) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').slice(0, n) : '');
    const mensajes = Array.isArray(b?.mensajes) ? b.mensajes.filter((m) => ['user', 'assistant'].includes(m?.role) && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: m.role, content: txt(m.content, 200000), modelo: txt(m.modelo, 200), fecha: Number(m.fecha) || 0, fuentes: Array.isArray(m.fuentes) ? m.fuentes.filter((x) => typeof x === 'string').slice(0, 60) : [] })) : [];
    if (!mensajes.length) return json(res, 400, { ok: false, error: 'no hay nada que guardar' });
    const id = /^[\w-]{4,60}$/.test(b.id || '') ? b.id : `c-${Date.now().toString(36)}`;
    const titulo = txt(b.titulo, 120).replace(/\s+/g, ' ').trim() || 'Conversación';
    const sobre = Array.isArray(b.sobre) ? b.sobre.filter((x) => typeof x === 'string').slice(0, 40) : [];
    const cfg = ajustes(), dir = cfg.ruta('conversaciones');
    const md = comoMarkdown({ id, titulo, sobre, mensajes }, cfg);
    mkdirSync(dir, { recursive: true });
    let aviso = '';
    // la misma conversación: se reescribe su archivo, si sigue siendo el que escribimos la última vez
    if (typeof b.archivo === 'string' && /^[\w.-]+\.md$/.test(b.archivo) && existsSync(path.join(dir, b.archivo))) {
      const file = path.join(dir, b.archivo), ahora = readFileSync(file, 'utf8');
      if (sha(ahora) === b.hash) {
        writeFileSync(file, md, 'utf8');
        return json(res, 200, { ok: true, id, archivo: b.archivo, hash: sha(md), ruta: path.relative(cfg.raiz, file) });
      }
      aviso = `«${b.archivo}» cambió a mano desde la última vez: no lo toco y guardo la conversación en un archivo nuevo.`;
    }
    const base = `${new Date(mensajes[0].fecha || Date.now()).toLocaleDateString('sv')}-${slugDe(titulo).slice(0, 50) || 'conversacion'}`;
    let nombre = `${base}.md`;
    for (let i = 2; existsSync(path.join(dir, nombre)); i++) nombre = `${base}-${i}.md`;
    writeFileSync(path.join(dir, nombre), md, { encoding: 'utf8', flag: 'wx' });
    json(res, 200, { ok: true, id, archivo: nombre, hash: sha(md), ruta: path.relative(cfg.raiz, path.join(dir, nombre)), aviso });
  });

  // de vuelta: el .md que escribe comoMarkdown → { id, titulo, sobre, mensajes }. Cada mensaje empieza con un
  // «### <firma> · hh:mm» o «### modelo · <nombre> · hh:mm»; las fichas del modelo van en «> fichas: [[…]] · …».
  function leerConversacion(texto, cfg) {
    const fm = texto.match(/^---\n([\s\S]*?)\n---\n?/), meta = fm ? fm[1] : '';
    const val = (k) => { const m = meta.match(new RegExp(`^${k}:\\s*(.*)$`, 'm')); if (!m) return ''; try { return JSON.parse(m[1]); } catch { return m[1].trim(); } };
    const lista = (k) => { const m = meta.match(new RegExp(`^${k}:\\n((?:  - .*\\n?)*)`, 'm')); return m ? m[1].split('\n').filter(Boolean).map((l) => { const v = l.replace(/^  - /, ''); try { return JSON.parse(v); } catch { return v; } }) : []; };
    const fecha = String(val('fecha') || new Date().toLocaleDateString('sv'));
    const cuerpo = fm ? texto.slice(fm[0].length) : texto;
    // solo cuentan como cabecera «### <firma>…» y «### modelo…»: los ### que escriba el modelo son parte del texto
    const firma = cfg.firma.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const partes = cuerpo.split(new RegExp(`^### ((?:${firma}|modelo)(?: · [^\\n]*)?)$`, 'm')); // [antes, cabecera, contenido, …]
    const mensajes = [];
    for (let i = 1; i < partes.length; i += 2) {
      const cab = partes[i].split(' · '), hhmm = /^\d{2}:\d{2}$/.test(cab.at(-1)) ? cab.pop() : '';
      const cuando = hhmm ? new Date(`${fecha}T${hhmm}:00`).getTime() : 0;
      let content = partes[i + 1].replace(/^\n+|\n+$/g, '');
      if (cab[0] === 'modelo') {
        const f = content.match(/\n\n> fichas: (.*)$/);
        const fuentes = f ? [...f[1].matchAll(/\[\[([^\]]+)\]\]/g)].map((x) => x[1]) : [];
        if (f) content = content.slice(0, f.index);
        mensajes.push({ role: 'assistant', content, modelo: cab.slice(1).join(' · '), fecha: cuando, fuentes });
      } else mensajes.push({ role: 'user', content, fecha: cuando });
    }
    return { id: String(val('conversacion') || ''), titulo: String(val('title') || ''), sobre: lista('sobre'), mensajes };
  }

  server.middlewares.use('/__conversacion-abrir', (req, res) => {
    if (req.method !== 'POST' || ajena(req)) return json(res, 403, { ok: false });
    if (process.platform !== 'darwin') return json(res, 501, { ok: false, error: 'solo en macOS' });
    const q = new URL(req.url, 'http://localhost').searchParams, archivo = q.get('archivo') || '', con = q.get('con');
    const file = /^[\w.-]+\.md$/.test(archivo) && path.join(ajustes().ruta('conversaciones'), archivo);
    if (!file || !existsSync(file)) return json(res, 404, { ok: false, error: 'no encuentro esa conversación' });
    // obsidian://open?path= abre cualquier archivo que esté dentro de una bóveda que Obsidian conoce
    const args = con === 'obsidian' ? [`obsidian://open?path=${encodeURIComponent(file)}`] : con === 'finder' ? ['-R', file] : null;
    if (!args) return json(res, 400, { ok: false, error: 'con=obsidian o con=finder' });
    execFile('open', args, (err) => json(res, err ? 500 : 200, err ? { ok: false, error: con === 'obsidian' ? 'no se pudo abrir Obsidian (¿está instalado?)' : err.message } : { ok: true }));
  });

  server.middlewares.use('/__conversaciones', (req, res) => {
    if (req.method !== 'GET' || ajena(req)) return json(res, 403, { ok: false });
    const cfg = ajustes(), dir = cfg.ruta('conversaciones');
    let out = [];
    try {
      out = readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('.')).map((archivo) => {
        const file = path.join(dir, archivo), texto = readFileSync(file, 'utf8'), c = leerConversacion(texto, cfg);
        return { archivo, titulo: c.titulo || archivo.replace(/\.md$/, ''), fecha: (texto.match(/^fecha:\s*(\S+)/m) || [])[1] || '', mensajes: c.mensajes.length,
          modelos: [...new Set(c.mensajes.map((m) => m.modelo).filter(Boolean))], sobre: c.sobre, mtime: statSync(file).mtimeMs };
      }).sort((a, b) => b.mtime - a.mtime);
    } catch { /* sin carpeta todavía */ }
    json(res, 200, { ok: true, carpeta: cfg.carpetas.conversaciones, conversaciones: out });
  });
}
