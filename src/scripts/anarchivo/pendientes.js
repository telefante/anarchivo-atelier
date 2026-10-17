// Anarchivo — imágenes subidas desde la versión publicada que todavía no están en el índice. La página publicada es
// una foto del índice del último deploy: lo que sube el teléfono llega a Nextcloud, pero el Mac tiene que sincronizar
// y publicarse de nuevo para que exista aquí. Mientras tanto se guarda una miniatura en este navegador y la imagen
// entra a la Mesa como cualquier otra. Cuando el índice trae la de verdad (mismo id), la miniatura se descarta.
// Solo se registran en `byId`, `adj` e `IMGS` — no en `nodes`, para no meter puntos sueltos en el grafo.
const KEY = 'ax-pendientes-v1';
const MAX = 12, LADO = 640;
const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const escribir = (v) => {
  for (let l = v; ; l = l.slice(1)) { // si el almacenamiento se llena, se sueltan las más viejas
    try { localStorage.setItem(KEY, JSON.stringify(l)); return; } catch { if (!l.length) return; }
  }
};

// miniatura jpeg de un File, en data URL
export function miniatura(file) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, LADO / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(''); };
    img.src = url;
  });
}

export function initPendientes({ byId, adj, IMGS }) {
  function registrar(items) {
    const ids = [];
    for (const it of items) {
      if (!it.src || byId.has(it.id)) continue; // sin miniatura, o ya está en el índice
      const n = { id: it.id, kind: 'imagen', title: it.title, short: it.title, sub: '', tags: [], fecha: it.fecha || '', fuente: '', nota: '', parent: it.parent, path: it.id.slice(4), file: it.id.slice(4), src: it.src, pendiente: true };
      byId.set(n.id, n); adj.set(n.id, []); IMGS.push(n); ids.push(n.id);
    }
    return ids;
  }
  // al arrancar: lo que el índice ya trae se descarta; lo demás vuelve a la Mesa
  function cargar() {
    const todas = leer(), siguen = todas.filter((it) => !byId.has(it.id));
    if (siguen.length !== todas.length) escribir(siguen);
    return registrar(siguen);
  }
  function guardar(items) { escribir([...leer().filter((o) => !items.some((it) => it.id === o.id)), ...items.filter((it) => it.src)].slice(-MAX)); }
  return { cargar, registrar, guardar };
}
