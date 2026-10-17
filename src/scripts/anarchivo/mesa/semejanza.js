// Anarchivo · Mesa — semejanza entre imágenes, calculada en el navegador.
//   color       — histograma RGB de 64 cubetas (intersección)
//   forma       — composición: luminancia 8×8, correlación (dónde está la luz, no cuánta)
//   total       — promedio de ambas
// `features(img)` se calcula al cargar cada imagen y se guarda en ms.feats; `semejanza(a, b)` las compara.
import { pairKey } from '../util.js';
import { ms } from './state.js';

export function features(img) {
  const S = 24, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, S, S);
  const d = g.getImageData(0, 0, S, S).data;
  const hist = new Float32Array(64), lum = new Float32Array(64);
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < S * S; i++) {
    const r = d[i * 4], gr = d[i * 4 + 1], b = d[i * 4 + 2];
    hist[(r >> 6) * 16 + (gr >> 6) * 4 + (b >> 6)] += 1 / (S * S);
    mr += r; mg += gr; mb += b;
    const x = i % S, y = (i / S) | 0;
    lum[((y / 3) | 0) * 8 + ((x / 3) | 0)] += (0.299 * r + 0.587 * gr + 0.114 * b) / 9;
  }
  // media 0, norma 1: la correlación mide composición (dónde está la luz), no brillo
  const m = lum.reduce((a, v) => a + v, 0) / 64;
  let nn = 0;
  for (let i = 0; i < 64; i++) { lum[i] -= m; nn += lum[i] * lum[i]; }
  nn = Math.sqrt(nn) || 1;
  for (let i = 0; i < 64; i++) lum[i] /= nn;
  return { hist, lum, mean: [mr, mg, mb].map((v) => Math.round(v / (S * S))) };
}
const simCache = new Map();
export function semejanza(a, b) {
  const k = pairKey(a, b);
  if (simCache.has(k)) return simCache.get(k);
  const A = ms.feats.get(a), B = ms.feats.get(b);
  if (!A || !B) return null;
  let inter = 0, corr = 0;
  for (let i = 0; i < 64; i++) { inter += Math.min(A.hist[i], B.hist[i]); corr += A.lum[i] * B.lum[i]; }
  const forma = (corr + 1) / 2;
  const s = { color: inter, forma, total: 0.5 * inter + 0.5 * forma };
  simCache.set(k, s);
  return s;
}
export const pct = (v) => `${Math.round(v * 100)}%`;
