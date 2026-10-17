// Anarchivo — utilidades compartidas. Sin estado, salvo `vp`.
export const $ = (id) => document.getElementById(id);
export const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const norm = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
export const pairKey = (a, b) => [a, b].sort().join('||');
export const idOf = (x) => (typeof x === 'object' ? x.id : x);
export const isMobile = () => matchMedia('(max-width: 640px)').matches;
// Tamaño de la ventana. Es un objeto para poder reasignar campos desde cualquier módulo
// (un `let` importado es de solo lectura); el resize lo actualiza en main.js.
export const vp = { W: innerWidth, H: innerHeight };
