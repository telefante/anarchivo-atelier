// Anarchivo · Mesa — estado.
//  · `mx`  persistido en localStorage (posiciones, hilos, notas, capas, constelaciones…).
//          UN solo objeto, clave y esquema intactos: es el único dato del usuario que no se regenera.
//  · `ms`  efímero (selección, par abierto, hover…). Campos de un objeto en vez de `let` sueltos:
//          un binding importado es de solo lectura, un campo se puede asignar desde cualquier módulo.
export const MX_KEY = 'ax-mesa-v1';
export const mx = (() => { try { return JSON.parse(localStorage.getItem(MX_KEY)) || {}; } catch { return {}; } })();
mx.pos ||= {}; mx.rels ||= []; mx.notes ||= {}; mx.view ||= { x: 0, y: 0, k: 1 };
mx.contagio ??= true; mx.hilos ??= false;
mx.modo ||= 'mesa'; mx.tam ||= 220; mx.galOrden ||= 'proyecto';
mx.constelaciones ||= []; // { id, nombre, descripcion, imagenes: [ids], fecha }
mx.capas ||= [];   // { id, label, ids: [imgIds], total, hidden } — cada búsqueda o foco pone una capa sobre la mesa
mx.exp ||= {};     // imgId -> [invitadas]: las vecinas que esa imagen trajo con «+»
mx.fijas ||= [];   // invitadas que se movieron o relacionaron: quedan aunque se contraiga
mx.tocadas ||= []; // últimas imágenes tocadas, la más reciente primero
mx.rel ||= 'sel';  // relaciones a la vista: off · sel (de lo elegido) · todas
mx.lcapa ||= { rel: true, yaml: true, visual: true, cerca: true };
// posiciones de la mesa «completa» de antes: se recolocan al entrar de nuevo (salvo las movidas a mano)
if (!mx.v2) { for (const p of Object.values(mx.pos)) p.gone = true; mx.v2 = true; }

export const saveMx = () => { try { localStorage.setItem(MX_KEY, JSON.stringify(mx)); } catch {} };

export const ms = {
  built: false,          // la mesa ya se construyó (primera vez que se abre la vista)
  sel: null,             // imagen elegida (desde donde se lee la semejanza)
  sels: new Set(),       // multi-selección (ctrl+clic, o tocar con «Elegir») para constelaciones
  elegir: false,         // modo «Elegir»: tocar suma o quita de `sels`, y las imágenes no se arrastran
  pair: null,            // par abierto en el panel «Entre dos imágenes»
  hover: null,           // imagen bajo el cursor
  z: 1,                  // z-index del último módulo traído al frente
  raf: 0,                // redibujado pendiente (mxSchedule)
  msg: '',               // aviso en la fila de capas («sin imágenes para…»)
  syncQ: Promise.resolve(), // cola de syncTable: una sincronización a la vez
  nbCache: new Map(),    // id -> vecinas de esa imagen (se vacía al tirar o soltar un hilo)
  mods: new Map(),       // id -> elemento de los módulos que están sobre la mesa
  feats: new Map(),      // id -> { hist, lum, mean } (semejanza, calculada al cargar cada imagen)
};
