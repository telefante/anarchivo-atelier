// Anarchivo — «Conversar»: un chat con un modelo local (LM Studio) sobre el archivo. Solo en local (`npm run dev`):
// el contexto lo arma scripts/chat.mjs leyendo los .md que el índice conoce, así que en lo publicado no existe.
// La página manda la conversación y los ids de lo que se nombra («Sobre»: chips, @menciones, «lo que tengo delante»);
// la respuesta llega en streaming y cita lo que usó como [[id]], que aquí se vuelve un enlace al nodo.
// La conversación vive en este navegador (clave propia, aparte de `mx`); «↓ .md» la descarga. No escribe en el playbook.
import { $, esc, clamp, isMobile, vp } from './util.js';
import { srcOf } from './data.js';

const KEY = 'ax-chat-v1';
const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };

export function initChat({ byId, search, state, ms, mx, go }) {
  const mesa = $('ax-mesa'), caja = $('ax-conversar'), panel = $('ax-chat');
  if (mesa.dataset.local !== '1') return;
  const base = mesa.dataset.base || '/';
  caja.hidden = false;

  const ch = leer();
  ch.msgs ||= []; ch.refs ||= []; ch.ctxn ||= 14000; ch.ver ??= true; ch.abierto ??= false;
  const guardar = () => { try { localStorage.setItem(KEY, JSON.stringify(ch)); } catch { /* lleno: la conversación sigue en la página */ } };

  const log = $('ax-chat-log'), entrada = $('ax-chat-in'), sel = $('ax-chat-modelo'), envBtn = $('ax-chat-env'), sug = $('ax-chat-sug');
  let modelos = [], corte = null;

  // ---------- abrir / cerrar ----------
  const abrir = (si) => {
    ch.abierto = si; guardar();
    panel.hidden = !si; $('ax-chat-btn').classList.toggle('on', si);
    if (si) { const r = panel.getBoundingClientRect(); puesto ||= { w: r.width, h: r.height }; cargarModelos(); entrada.focus(); log.scrollTop = log.scrollHeight; }
  };
  $('ax-chat-btn').onclick = () => abrir(panel.hidden);
  $('ax-chat-cerrar').onclick = () => { parar(); abrir(false); };
  // ---------- ventanita flotante: se arrastra por la barra y se agranda desde la esquina; se recuerda dónde quedó ----------
  // (en el teléfono no flota: queda fija abajo, a todo lo ancho)
  const bar = panel.querySelector('.ax-chat-bar');
  let puesto = null; // el tamaño que tenía antes del último pointerup: para saber si el tirador lo cambió
  const colocar = () => {
    const p = ch.pos;
    panel.classList.toggle('grande', !!ch.grande && !isMobile());
    $('ax-chat-grande').textContent = ch.grande ? '⤡' : '⤢';
    $('ax-chat-grande').title = ch.grande ? 'Volver al tamaño de antes' : 'Expandir la conversación a casi toda la pantalla';
    if (ch.grande && !isMobile()) { // expandida: centrada y grande, sin tocar la posición guardada
      const w = Math.min(1040, vp.W - 64), h = vp.H - 104;
      puesto = { w, h };
      Object.assign(panel.style, { width: `${w}px`, height: `${h}px`, right: 'auto', bottom: 'auto', left: `${(vp.W - w) / 2}px`, top: '72px' });
      return;
    }
    if (isMobile() || !p) { puesto = null; panel.style.left = panel.style.top = panel.style.width = panel.style.height = panel.style.right = panel.style.bottom = ''; return; }
    const w = clamp(p.w || 440, 320, vp.W - 16), y = clamp(p.y, 0, vp.H - 320);
    // la altura guardada se respeta mientras quepa; más abajo, la ventana encoge para no salirse de la pantalla
    const h = clamp(Math.min(p.h || vp.H - 108, vp.H - y - 8), 320, vp.H - 16);
    puesto = { w, h };
    Object.assign(panel.style, { width: `${w}px`, height: `${h}px`, right: 'auto', bottom: 'auto',
      left: `${clamp(p.x, 8 - w + 120, vp.W - 120)}px`, top: `${y}px` });
  };
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, select') || isMobile() || ch.grande) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect(), sx = e.clientX, sy = e.clientY;
    const h0 = ch.pos?.h || r.height;
    const mover = (m) => { ch.pos = { x: r.left + m.clientX - sx, y: r.top + m.clientY - sy, w: r.width, h: h0 }; colocar(); };
    const soltar = () => { removeEventListener('pointermove', mover); removeEventListener('pointerup', soltar); guardar(); };
    addEventListener('pointermove', mover); addEventListener('pointerup', soltar);
  });
  // el tamaño lo cambia el tirador de la esquina (CSS resize); al soltar queda guardado
  panel.addEventListener('pointerup', () => {
    if (isMobile() || panel.hidden || ch.grande) return;
    const r = panel.getBoundingClientRect();
    // solo si el tirador cambió el tamaño (un clic cualquiera dentro del panel no cuenta)
    if (!puesto || (Math.abs(r.width - puesto.w) < 2 && Math.abs(r.height - puesto.h) < 2)) { puesto = { w: r.width, h: r.height }; return; }
    ch.pos = { x: r.left, y: r.top, w: r.width, h: r.height }; colocar(); guardar();
  });
  // doble clic en la barra: expandida → vuelve; si no, vuelve a su sitio de siempre
  bar.addEventListener('dblclick', (e) => { if (e.target.closest('button, select')) return; if (ch.grande) ch.grande = false; else ch.pos = null; colocar(); guardar(); });
  $('ax-chat-grande').onclick = () => { ch.grande = !ch.grande; guardar(); colocar(); log.scrollTop = log.scrollHeight; entrada.focus(); };
  addEventListener('resize', colocar);
  colocar();

  // lo que se teclea aquí es del chat: ni «/» busca, ni Esc vacía el grafo
  panel.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && sug.hidden) abrir(false); });

  // ---------- modelos de LM Studio ----------
  async function cargarModelos() {
    sel.innerHTML = '<option>buscando LM Studio…</option>';
    try {
      const r = await fetch(`${base}__chat-modelos`);
      if (r.status === 404) throw new Error('El servidor local arrancó antes de que existiera el chat: detén npm run dev (Ctrl+C) y vuelve a lanzarlo.');
      const j = await r.json();
      if ('guardar' in j) Object.assign(alDisco, { guardar: j.guardar, carpeta: j.carpeta, firma: j.firma || alDisco.firma });
      if (!j.ok) throw new Error(j.error);
      modelos = j.modelos;
      if (!modelos.length) throw new Error('LM Studio no tiene modelos de chat todavía.');
      // los cargados primero: los demás LM Studio los carga al pedirlos (si la memoria alcanza), y tarda
      modelos.sort((a, b) => b.cargado - a.cargado);
      if (!modelos.some((m) => m.id === ch.modelo)) ch.modelo = modelos[0].id;
      sel.innerHTML = modelos.map((m) => `<option value="${esc(m.id)}" ${m.id === ch.modelo ? 'selected' : ''}>${esc(m.id)}${m.vision ? ' · ve' : ''}${m.cargado ? '' : ' (sin cargar)'}</option>`).join('');
      aviso('');
    } catch (e) {
      sel.innerHTML = '<option>sin LM Studio</option>';
      aviso(e.message || 'LM Studio no responde.', true);
    }
  }
  sel.onchange = () => { ch.modelo = sel.value; guardar(); };
  $('ax-chat-ctxn').value = ch.ctxn;
  $('ax-chat-ctxn').onchange = (e) => { ch.ctxn = +e.target.value; guardar(); };
  $('ax-chat-ver').checked = ch.ver;
  $('ax-chat-ver').onchange = (e) => { ch.ver = e.target.checked; guardar(); };
  // ---------- voz: leer las respuestas en voz alta con las voces del sistema (Web Speech API, sin red) ----------
  // Primero las de Latinoamérica (es-MX, es-US, es-419, es-AR…), luego las demás en español.
  const habla = window.speechSynthesis;
  const LATAM = /^es[-_](MX|US|419|AR|BO|CL|CO|CR|CU|DO|EC|GT|HN|NI|PA|PE|PR|PY|SV|UY|VE)\b/i;
  let voces = [], hablando = -1, turno = 0;
  ch.vel ||= 1; ch.leer ??= false;
  function cargarVoces() {
    if (!habla) return;
    const es = habla.getVoices().filter((v) => /^es\b/i.test(v.lang.replace('_', '-')));
    voces = [...es.filter((v) => LATAM.test(v.lang)), ...es.filter((v) => !LATAM.test(v.lang))];
    const caja = $('ax-chat-voz');
    caja.hidden = !voces.length;
    if (!voces.length) return;
    // por defecto: Paulina (es-MX) si está; si no, la primera latinoamericana
    if (!voces.some((v) => v.voiceURI === ch.voz)) ch.voz = (voces.find((v) => /paulina/i.test(v.name)) || voces[0]).voiceURI;
    $('ax-chat-vozsel').innerHTML = voces.map((v) => `<option value="${esc(v.voiceURI)}" ${v.voiceURI === ch.voz ? 'selected' : ''}>${esc(v.name.replace(/\s*\(.*\)$/, ''))} · ${esc(v.lang.replace('_', '-'))}</option>`).join('');
  }
  if (habla) { cargarVoces(); habla.addEventListener('voiceschanged', cargarVoces); }
  $('ax-chat-vozsel').onchange = (e) => { ch.voz = e.target.value; guardar(); };
  $('ax-chat-vel').value = ch.vel;
  $('ax-chat-vel').oninput = (e) => { ch.vel = +e.target.value; guardar(); };
  $('ax-chat-leer').checked = ch.leer;
  $('ax-chat-leer').onchange = (e) => { ch.leer = e.target.checked; guardar(); if (!ch.leer) parar(); };
  // lo que se dice: sin markdown, sin código, y las citas [[id]] con su nombre
  const paraDecir = (t) => t.replace(/```[\s\S]*?(```|$)/g, ' ').replace(/\[\[([^\]]+)\]\]/g, (all, id) => { const n = byId.get(id); return n ? etiqueta(n) : ''; })
    .replace(/https?:\/\/\S+/g, '').replace(/`([^`]*)`/g, '$1').replace(/[*_#>]+/g, '').replace(/^\s*([-•]|\d+[.)])\s+/gm, '').replace(/\s+/g, ' ').trim();
  function parar() { turno++; habla?.cancel(); if (hablando >= 0) { hablando = -1; pintar(); } }
  function decir(i) {
    if (!habla) return;
    parar();
    const voz = voces.find((v) => v.voiceURI === ch.voz), yo = ++turno;
    // en trozos de una o dos frases: Chrome corta las locuciones largas a los ~15 s
    const trozos = (paraDecir(separar(ch.msgs[i].content).dice).match(/[^.!?¿¡…]+[.!?…]*|[¿¡][^?!]*[?!]/g) || []).reduce((a, f) => {
      if (a.length && (a.at(-1) + f).length < 220) a[a.length - 1] += f; else a.push(f);
      return a;
    }, []).map((x) => x.trim()).filter(Boolean);
    if (!trozos.length) return;
    hablando = i; pintar();
    trozos.forEach((t, k) => {
      const u = new SpeechSynthesisUtterance(t);
      if (voz) { u.voice = voz; u.lang = voz.lang; } else u.lang = 'es-MX';
      u.rate = ch.vel;
      if (k === trozos.length - 1) u.onend = () => { if (yo === turno) { hablando = -1; pintar(); } };
      habla.speak(u);
    });
  }

  const aviso = (t, error) => { const a = $('ax-chat-aviso'); a.textContent = t; a.hidden = !t; a.classList.toggle('error', !!error); };

  // ---------- «Sobre»: lo que se nombra va entero al contexto ----------
  const etiqueta = (n) => (n.kind === 'imagen' ? n.title.replace(/\.(png|jpe?g|webp|gif)$/i, '') : n.short || n.title);
  function pintarRefs() {
    $('ax-chat-refs').innerHTML = ch.refs.map((id) => byId.get(id)).filter(Boolean).map((n) => `<span class="ax-pill sm ax-chat-ref" data-kind="${esc(n.kind)}">${n.kind === 'imagen' && n.src ? `<img src="${esc(srcOf(n))}" alt="" loading="lazy" />` : ''}<button type="button" data-chat-go="${esc(n.id)}" title="Abrir">${esc(etiqueta(n))}</button><button type="button" data-chat-quitar="${esc(n.id)}" aria-label="Quitar">×</button></span>`).join('')
      || '<span class="ax-muted">todo el archivo — nombra algo con @ para centrar la conversación</span>';
  }
  const sumar = (ids) => { for (const id of ids) if (byId.has(id) && !ch.refs.includes(id)) ch.refs.push(id); guardar(); pintarRefs(); };
  // lo que está abierto ahora: el foco del grafo (con su ruta) y lo elegido en la Mesa
  $('ax-chat-delante').onclick = () => {
    const ids = [...state.path, ...ms.sels, ms.sel].filter((id) => id && byId.get(id)?.kind !== 'concepto');
    const conceptos = state.path.filter((id) => byId.get(id)?.kind === 'concepto');
    if (!ids.length && !conceptos.length) return aviso('No hay nada abierto: elige un proyecto en el grafo o imágenes en la Mesa (⌘/Ctrl+clic).');
    sumar([...ids, ...conceptos]); aviso('');
  };
  $('ax-chat-refs').onclick = (e) => {
    const q = e.target.closest('[data-chat-quitar]');
    if (q) { ch.refs = ch.refs.filter((id) => id !== q.dataset.chatQuitar); guardar(); pintarRefs(); }
  };

  // ---------- @menciones ----------
  let hits = [], cur = 0;
  const mencion = () => { const m = entrada.value.slice(0, entrada.selectionStart).match(/(^|\s)@([^\s@]{0,40})$/); return m ? { q: m[2], ini: entrada.selectionStart - m[2].length - 1 } : null; };
  function pintarSug() {
    const m = mencion();
    hits = m ? (m.q ? search(m.q) : [...byId.values()].filter((n) => n.kind === 'activo')).filter((n) => n.kind !== 'concepto').slice(0, 8) : [];
    sug.hidden = !hits.length; cur = 0;
    sug.innerHTML = hits.map((n, i) => `<button type="button" data-i="${i}" class="${i === cur ? 'on' : ''}">${n.kind === 'imagen' && n.src ? `<img src="${esc(srcOf(n))}" alt="" loading="lazy" />` : ''}<span>${esc(etiqueta(n))}</span><small>${esc(n.kind)}</small></button>`).join('');
  }
  function elegir(i) {
    const m = mencion(), n = hits[i];
    if (!m || !n) return;
    // el nombre queda escrito en la frase (se lee como uno lo diría) y lo nombrado se suma a «Sobre», que destella
    const nombre = etiqueta(n), resto = entrada.value.slice(entrada.selectionStart);
    entrada.value = `${entrada.value.slice(0, m.ini)}${nombre}${/^\s/.test(resto) ? '' : ' '}${resto}`;
    entrada.selectionStart = entrada.selectionEnd = m.ini + nombre.length + 1;
    sumar([n.id]); sug.hidden = true; entrada.focus();
    const chip = $('ax-chat-refs').querySelector(`[data-chat-go="${CSS.escape(n.id)}"]`)?.closest('.ax-chat-ref');
    if (chip) { chip.classList.remove('nuevo'); void chip.offsetWidth; chip.classList.add('nuevo'); }
  }
  sug.onmousedown = (e) => { e.preventDefault(); const b = e.target.closest('[data-i]'); if (b) elegir(+b.dataset.i); };
  entrada.addEventListener('input', () => { pintarSug(); entrada.style.height = 'auto'; entrada.style.height = `${Math.min(entrada.scrollHeight, 180)}px`; });
  entrada.addEventListener('keydown', (e) => {
    if (!sug.hidden) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length; sug.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === cur)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); elegir(cur); return; }
      if (e.key === 'Escape') { sug.hidden = true; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); enviar(); }
  });

  // ---------- la conversación ----------
  // markdown mínimo: lo que suelen devolver los modelos (párrafos, listas, títulos, negrita, código) y los [[id]]
  function enlinea(t) {
    return t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
      .replace(/\[\[([^\]]+)\]\]/g, (all, id) => {
        const n = byId.get(id.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
        return n ? `<button type="button" class="ax-chat-link" data-chat-go="${esc(n.id)}">${esc(etiqueta(n))}</button>` : `<span class="ax-muted">${all}</span>`;
      });
  }
  function md(src) {
    const out = [], partes = esc(src).split(/```[^\n]*\n?/);
    partes.forEach((p, k) => {
      if (k % 2) { out.push(`<pre>${p}</pre>`); return; }
      for (const bl of p.split(/\n{2,}/)) {
        const ls = bl.split('\n').filter((l) => l.trim());
        if (!ls.length) continue;
        if (ls.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const tag = /^\s*\d/.test(ls[0]) ? 'ol' : 'ul';
          out.push(`<${tag}>${ls.map((l) => `<li>${enlinea(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</${tag}>`);
        } else if (/^#{1,4}\s/.test(ls[0]) && ls.length === 1) out.push(`<h4>${enlinea(ls[0].replace(/^#+\s*/, ''))}</h4>`);
        else out.push(`<p>${ls.map(enlinea).join('<br>')}</p>`);
      }
    });
    return out.join('');
  }
  // los modelos que «razonan» mandan su pensamiento entre <think>…</think> (o aparte): va plegado
  const separar = (t) => {
    const m = t.match(/^\s*<think>([\s\S]*?)(<\/think>|$)/);
    return m ? { piensa: m[1], dice: t.slice(m[0].length), pensando: !m[2] } : { piensa: '', dice: t, pensando: false };
  };
  function htmlMsg(m, i) {
    if (m.role === 'user') return `<div class="ax-chat-msg yo">${md(m.content)}</div>`;
    const { piensa, dice, pensando } = separar(m.content);
    const razon = (m.razon || '') + piensa;
    const fuentes = (m.fuentes || []).map((f) => byId.get(f.id)).filter(Boolean);
    const fotos = fuentes.filter((n) => n.kind === 'imagen' && n.src).slice(0, 8);
    return `<div class="ax-chat-msg ia">
      ${razon ? `<details class="ax-chat-think"${pensando && !dice ? ' open' : ''}><summary>${pensando ? 'pensando…' : 'cómo lo pensó'}</summary>${md(razon)}</details>` : ''}
      ${dice ? md(dice) : m.error ? '' : '<p class="ax-muted">…</p>'}
      ${m.error ? `<p class="ax-chat-err">${esc(m.error)}</p>` : ''}
      ${fotos.length ? `<div class="ax-chat-fotos">${fotos.map((n) => `<button type="button" data-chat-go="${esc(n.id)}" title="${esc(etiqueta(n))}"><img src="${esc(srcOf(n))}" alt="${esc(etiqueta(n))}" loading="lazy" /></button>`).join('')}</div>` : ''}
      ${fuentes.length ? `<details class="ax-chat-fuentes"><summary>${fuentes.length} ficha${fuentes.length === 1 ? '' : 's'} en el contexto${m.modelo ? ` · ${esc(m.modelo)}` : ''}${m.fotos?.length ? ` · miró ${m.fotos.length} foto${m.fotos.length === 1 ? '' : 's'}` : ''}</summary><div class="ax-pills">${fuentes.map((n) => `<button type="button" class="ax-pill sm" data-chat-go="${esc(n.id)}">${esc(etiqueta(n))}</button>`).join('')}</div></details>` : ''}
      ${(m.avisos || []).map((a) => `<p class="ax-muted">${esc(a)}</p>`).join('')}
      ${dice && !corte ? `<div class="ax-chat-acc">${voces.length ? `<button type="button" data-chat-voz="${i}">${hablando === i ? '■ parar' : '▶ escuchar'}</button>` : ''}<button type="button" data-chat-copiar="${i}">copiar</button></div>` : ''}
    </div>`;
  }
  function pintar() {
    const abajo = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    log.innerHTML = ch.msgs.length ? ch.msgs.map((m, i) => htmlMsg(m, i)).join('')
      : `<div class="ax-chat-vacio"><p>Conversa con un modelo local sobre el archivo: proyectos, obras publicadas, ensayos, bitácora, fotos y sus notas.</p><p class="ax-muted">Escribe <b>@</b> para nombrar algo, o usa «+ lo que tengo delante». Todo se queda en este Mac: la conversación va a LM Studio.</p></div>`;
    log.querySelectorAll('[data-chat-voz]').forEach((b) => { b.onclick = () => (hablando === +b.dataset.chatVoz ? parar() : decir(+b.dataset.chatVoz)); });
    log.querySelectorAll('[data-chat-copiar]').forEach((b) => {
      b.onclick = () => { navigator.clipboard?.writeText(separar(ch.msgs[+b.dataset.chatCopiar].content).dice.trim()); b.textContent = 'copiado ✓'; };
    });
    if (abajo) log.scrollTop = log.scrollHeight;
  }
  // un enlace a un nodo lo abre como cualquier clic del grafo
  panel.addEventListener('click', (e) => { const b = e.target.closest('[data-chat-go]'); if (b && byId.has(b.dataset.chatGo)) go(b.dataset.chatGo); });

  // notas de la Mesa (son de pares de imágenes) que tocan a lo nombrado
  function notasDe(ids) {
    const out = {};
    for (const [k, t] of Object.entries(mx.notes || {})) {
      const [a, b] = k.split('||');
      for (const [x, y] of [[a, b], [b, a]]) if (ids.includes(x)) out[x] = `${out[x] ? `${out[x]}\n` : ''}con [[${y}]]: ${t}`;
    }
    return out;
  }

  async function enviar() {
    const texto = entrada.value.trim();
    if (!texto || corte) return;
    entrada.value = ''; entrada.style.height = 'auto'; sug.hidden = true; aviso('');
    ch.msgs.push({ role: 'user', content: texto, fecha: Date.now() });
    const r = { role: 'assistant', content: '', razon: '' };
    ch.msgs.push(r); guardar();
    corte = new AbortController();
    envBtn.textContent = 'Parar'; pintar(); log.scrollTop = log.scrollHeight;
    try {
      const res = await fetch(`${base}__chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: corte.signal,
        body: JSON.stringify({ messages: ch.msgs.slice(0, -1).filter((m) => m.content && !m.error).map(({ role, content }) => ({ role, content: role === 'assistant' ? separar(content).dice : content })), refs: ch.refs, modelo: ch.modelo, contexto: ch.ctxn, ver: ch.ver, notas: notasDe(ch.refs) }),
      });
      if (res.status === 404) throw new Error('El servidor local arrancó antes de que existiera el chat: detén npm run dev (Ctrl+C) y vuelve a lanzarlo.');
      if (!(res.headers.get('content-type') || '').includes('event-stream')) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
      const rd = res.body.getReader(), dec = new TextDecoder();
      let buf = '', t = 0;
      for (;;) {
        const { value, done } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, i); buf = buf.slice(i + 2);
          const nombre = ev.match(/^event: (.*)$/m)?.[1], data = ev.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (!data || data === '[DONE]') continue;
          let j; try { j = JSON.parse(data); } catch { continue; }
          if (nombre === 'fuentes') Object.assign(r, { fuentes: j.fuentes, fotos: j.fotos, modelo: j.modelo, avisos: j.avisos });
          else if (j.error) throw new Error(j.error.message || j.error);
          else { const d = j.choices?.[0]?.delta || {}; r.content += d.content || ''; r.razon += d.reasoning_content || d.reasoning || ''; }
        }
        if (performance.now() - t > 80) { t = performance.now(); pintar(); }
      }
      if (!r.content.trim() && !r.razon) r.error = 'El modelo no respondió nada.';
    } catch (e) {
      if (e.name !== 'AbortError') r.error = e.message || 'Algo falló al hablar con LM Studio.';
    }
    corte = null; envBtn.textContent = 'Enviar';
    guardar(); pintar();
    if (ch.leer && !r.error && separar(r.content).dice.trim()) decir(ch.msgs.indexOf(r));
    r.fecha = Date.now();
    if (alDisco.guardar && !r.error && separar(r.content).dice.trim()) guardarConversacion();
  }
  $('ax-chat-form').onsubmit = (e) => { e.preventDefault(); corte ? corte.abort() : enviar(); };

  $('ax-chat-nueva').onclick = () => { verLista(false); parar(); if (corte) corte.abort(); ch.msgs = []; ch.conv = null; guardar(); pintar(); pintarDisco(); entrada.focus(); };

  // ---------- al archivo: cada conversación es un .md en la carpeta de conversaciones (por defecto 10-conversaciones/) ----------
  // Se guarda sola después de cada respuesta (si «Ajustes» → Conversar lo dice), o con «↥». El servidor crea el archivo
  // la primera vez y luego reescribe solo ese, y solo si nadie lo editó a mano; si cambió, abre uno nuevo.
  const alDisco = { guardar: false, carpeta: '10-conversaciones', firma: 'Yo', estado: '' };
  const btnDisco = $('ax-chat-guardar');
  function pintarDisco() {
    const c = ch.conv, linea = $('ax-chat-archivo');
    // dónde se está guardando, con los dos atajos para ir al archivo
    linea.hidden = !c?.archivo;
    if (c?.archivo) linea.innerHTML = `<code title="${esc(c.ruta || '')}">${esc(c.ruta || `${alDisco.carpeta}/${c.archivo}`)}</code><button type="button" data-abrir="obsidian" data-archivo-abrir="${esc(c.archivo)}" title="Abrir en Obsidian">Obsidian</button><button type="button" data-abrir="finder" data-archivo-abrir="${esc(c.archivo)}" title="Mostrar en Finder">Finder</button>`;
    btnDisco.textContent = alDisco.estado === 'guardando' ? '↥ …' : c?.archivo ? '↥ ✓' : '↥';
    btnDisco.classList.toggle('on', !!c?.archivo);
    btnDisco.title = c?.archivo ? `Guardada en ${c.ruta || `${alDisco.carpeta}/${c.archivo}`}${alDisco.guardar ? ' · se guarda sola tras cada respuesta' : ' · otro toque la vuelve a guardar'}`
      : `Guardar esta conversación como .md en ${alDisco.carpeta}/${alDisco.guardar ? ' (también se guarda sola tras cada respuesta)' : ''}`;
  }
  async function guardarConversacion() {
    const ms = ch.msgs.filter((m) => m.content && !m.error);
    if (!ms.length || alDisco.estado === 'guardando') return;
    alDisco.estado = 'guardando'; pintarDisco();
    const primera = ms.find((m) => m.role === 'user')?.content || 'Conversación';
    try {
      const r = await fetch(`${base}__conversacion`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(ch.conv || {}), titulo: primera.replace(/\s+/g, ' ').trim().slice(0, 70), sobre: ch.refs,
          mensajes: ms.map((m) => ({ role: m.role, content: m.role === 'assistant' ? separar(m.content).dice : m.content, modelo: m.modelo, fecha: m.fecha, fuentes: (m.fuentes || []).map((f) => f.id) })) }),
      });
      if (r.status === 404) throw new Error('El servidor local arrancó antes de que existiera esto: reinicia npm run dev (o la app).');
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      ch.conv = { id: j.id, archivo: j.archivo, hash: j.hash, ruta: j.ruta }; guardar();
      if (j.aviso) aviso(j.aviso);
    } catch (e) { aviso(`No se guardó la conversación: ${e.message}`, true); }
    alDisco.estado = ''; pintarDisco();
  }
  btnDisco.onclick = () => guardarConversacion();
  pintarDisco();

  // ---------- Guardadas: las conversaciones del archivo, para verlas y retomarlas ----------
  const lista = $('ax-chat-lista'), btnLista = $('ax-chat-guardadas');
  const verLista = (si) => { lista.hidden = !si; log.hidden = si; btnLista.classList.toggle('on', si); btnLista.setAttribute('aria-expanded', String(si)); };
  async function pintarLista() {
    lista.innerHTML = '<p class="ax-muted">Leyendo…</p>';
    try {
      const r = await fetch(`${base}__conversaciones`);
      if (r.status === 404) throw new Error('El servidor local arrancó antes de que existiera esto: reinicia npm run dev (o la app).');
      const j = await r.json();
      const fechaDe = (c) => (c.fecha ? new Date(`${c.fecha}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
      lista.innerHTML = j.conversaciones.length
        ? `<p class="ax-muted">En <code>${esc(j.carpeta)}/</code> · la más reciente primero</p>${j.conversaciones.map((c) => `<div class="ax-chat-item${c.archivo === ch.conv?.archivo ? ' on' : ''}"><button type="button" class="ax-chat-item-abrir" data-archivo="${esc(c.archivo)}" title="Retomarla aquí"><b>${esc(c.titulo)}</b><small>${esc(fechaDe(c))} · ${c.mensajes} mensaje${c.mensajes === 1 ? '' : 's'}${c.modelos.length ? ` · ${esc(c.modelos.join(', '))}` : ''}${c.sobre.length ? ` · sobre ${esc(c.sobre.map((id) => (byId.get(id) ? etiqueta(byId.get(id)) : id)).join(', '))}` : ''}</small></button><span class="ax-chat-item-acc"><button type="button" data-abrir="obsidian" data-archivo-abrir="${esc(c.archivo)}" title="Abrir en Obsidian">Obsidian</button><button type="button" data-abrir="finder" data-archivo-abrir="${esc(c.archivo)}" title="Mostrar en Finder">Finder</button></span></div>`).join('')}`
        : `<p class="ax-muted">Todavía no hay conversaciones guardadas en <code>${esc(j.carpeta)}/</code>.</p>`;
    } catch (e) { lista.innerHTML = `<p class="ax-chat-err">${esc(e.message)}</p>`; }
  }
  // «Obsidian» / «Finder» de una conversación (en la lista o en la línea de la actual)
  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-abrir]');
    if (!b) return;
    e.stopPropagation();
    try {
      const r = await fetch(`${base}__conversacion-abrir?archivo=${encodeURIComponent(b.dataset.archivoAbrir)}&con=${b.dataset.abrir}`, { method: 'POST' });
      if (r.status === 404 && !(r.headers.get('content-type') || '').includes('json')) throw new Error('reinicia npm run dev (o la app) para tener esto');
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
    } catch (err) { aviso(`No se pudo: ${err.message}`, true); }
  });
  btnLista.onclick = () => { const si = lista.hidden; verLista(si); if (si) pintarLista(); };
  lista.onclick = async (e) => {
    const b = e.target.closest('[data-archivo]');
    if (!b || corte) return;
    try {
      const j = await fetch(`${base}__conversacion?archivo=${encodeURIComponent(b.dataset.archivo)}`).then((r) => r.json());
      if (!j.ok) throw new Error(j.error);
      parar();
      // las fichas vuelven como ids: debajo de cada respuesta se ven otra vez las que leyó el modelo
      ch.msgs = j.mensajes.map((m) => (m.role === 'assistant' ? { ...m, fuentes: (m.fuentes || []).map((id) => ({ id })) } : m));
      ch.refs = j.sobre.filter((id) => byId.has(id));
      ch.conv = { id: j.id, archivo: j.archivo, hash: j.hash, ruta: j.ruta };
      guardar(); verLista(false); pintarRefs(); pintar(); pintarDisco();
      log.scrollTop = log.scrollHeight;
      aviso(j.reescribible ? `Retomada: ${j.ruta}. Lo que sigas se añade a ese archivo.` : `${j.ruta} se editó a mano: aquí está como quedó, y si sigues, la conversación se guarda en un archivo nuevo (el tuyo no se toca).`);
    } catch (err) { aviso(`No se pudo abrir: ${err.message}`, true); }
  };
  // la conversación como markdown, con los [[id]] tal cual — para llevarla a la bitácora o a un ensayo a mano
  $('ax-chat-md').onclick = () => {
    if (!ch.msgs.length) return;
    const titulo = (n) => (n ? `${etiqueta(n)} (${n.id})` : '');
    const txt = [`# Conversación — ${new Date().toLocaleDateString('sv')}`, ch.refs.length ? `Sobre: ${ch.refs.map((id) => titulo(byId.get(id))).filter(Boolean).join(' · ')}` : '',
      ...ch.msgs.map((m) => (m.role === 'user' ? `**${alDisco.firma}:** ${m.content}` : `**${m.modelo || 'modelo'}:** ${separar(m.content).dice.trim()}`))].filter(Boolean).join('\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`${txt}\n`], { type: 'text/markdown' }));
    a.download = `conversacion-${new Date().toLocaleDateString('sv')}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // cortado a medias (la página se recargó mientras respondía): queda como está, sin el «…»
  const ult = ch.msgs.at(-1);
  if (ult?.role === 'assistant' && !ult.content && !ult.error) { ult.error = 'Se interrumpió.'; guardar(); }
  pintarRefs(); pintar();
  if (ch.abierto) abrir(true);
  return { sumar, abrir };
}
