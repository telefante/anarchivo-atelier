// Anarchivo — estado de la app: búsqueda, ruta, filtros por tipo, modo y vista.
// Objeto plano que se muta; render() redibuja todo a partir de él.
export const state = { q: '', path: [], types: new Set(), mode: 'anarchivo', view: 'grafo', detail: 0 };
