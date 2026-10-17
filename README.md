# Anarchivo Atelier *(nombre provisional)*

> **English, in short.** Anarchivo Atelier is a local, read-only dashboard for an artist's working archive kept as plain markdown folders (projects, texts, a logbook, images). It turns them into a search box, a concept graph, a light table for images and an optional chat with a local model (LM Studio). It runs only on your computer: no account, no server, no cloud. `git clone`, `npm install`, `npm run dev` and open `http://localhost:4321`: it starts with a sample archive in `ejemplo/`. The interface and the docs are in Spanish. MIT licensed.

Un cuaderno de trabajo en markdown y una manera de recorrerlo. Tus proyectos, textos, bitácora e imágenes viven en carpetas de archivos `.md` que escribes tú, con el editor que quieras; Anarchivo los lee y arma encima un buscador, un grafo de conceptos, una mesa de luz para las imágenes y, si quieres, una conversación con un modelo que corre en tu ordenador.

No es un producto ni un servicio. **Funciona solo en local**: no pide cuentas, servidores ni nube, y nada sale de tu ordenador. No no guarda nada propio (si lo borras, tu archivo sigue entero) y solo lee: las pocas excepciones están en «Límites». Salió del taller de Luis Negrón van Grieken y se comparte para que otras personas se armen el suyo.

## Empezar

```
git clone https://github.com/telefante/anarchivo-atelier.git
cd anarchivo-atelier
npm install
npm run dev
```

y abre `http://localhost:4321`. Sin configurar nada, abre **`ejemplo/`**: un archivo de muestra con dos proyectos, un artefacto, un ensayo, una constelación y un vocabulario de seis conceptos. La primera vez descarga el modelo CLIP para comparar imágenes (menos de 100 MB).

Para pasar a tu archivo: **Ajustes** (arriba a la derecha) → Carpeta del archivo, o `cp anarchivo.config.example.json anarchivo.config.json` y cambia `playbook`. Tu `anarchivo.config.json` es tuyo y no se versiona.

**La guía para montar el tuyo** — la forma de las carpetas, el frontmatter, el vocabulario, Conversar, publicar: [docs/montar-tu-anarchivo.md](docs/montar-tu-anarchivo.md). Después: [docs/anarchivo.md](docs/anarchivo.md) (vistas, Mesa, subir material, publicar, problemas), [docs/documentar.md](docs/documentar.md) (catalogar originales grandes sin copiarlos), [desktop/README.md](desktop/README.md) (app de macOS), [docs/colaboracion-remota.md](docs/colaboracion-remota.md) (conversar con otra persona a distancia: investigación, sin construir).

Necesitas Node.js 20 o más nuevo. Opcionales: [LM Studio](https://lmstudio.ai) (Conversar, también en local) y [exiftool](https://exiftool.org) (notas dentro del archivo de imagen). Funciona mejor en macOS: «Mostrar en Finder», la app de escritorio y parte de la catalogación son de macOS.

## Maneras de usarlo

- **Local** (`npm run dev`) — en el navegador, con todo: subir fotos, notas de imagen, «Mostrar en Finder», «Conversar», «Ajustes».
- **Escritorio** — la app **Anarchivo** (`desktop/`, Electron): una ventana propia sobre el mismo servidor local. Ver [desktop/README.md](desktop/README.md).

Hay además dos piezas **online, avanzadas y apagadas** mientras no las configures: una copia publicada y la subida desde el teléfono. Ver «Avanzado» al final; para usar Anarchivo no hacen falta.

Astro, sin dependencias de servidor. `node scripts/sync.mjs` genera `src/data/index.json`; las páginas `.astro` solo lo consumen.

## Uso

```
npm run dev      # sync + astro dev
npm run build    # sync + astro build (a dist/)
npm run preview  # sirve dist/ ya construido
npm run sync     # solo regenerar src/data/index.json
```

`sync.mjs` busca el archivo en `PLAYBOOK_DIR`, o si no está definida, en la carpeta de «Ajustes» (`playbook` en `anarchivo.config.json`; por defecto `ejemplo/`; `..` si `dashboard/` vive dentro de tu archivo). Si esa carpeta no existe, cae a unos datos de ejemplo internos (distintos de `ejemplo/`): así sabes que el código anda y que falta la ruta. Nunca lee lo de «Nunca leer», ni `dashboard/`, `node_modules/` o `.git/`.

## Páginas

**`/anarchivo`** — la home (`/` redirige aquí). Entrada = un buscador grande; todo lo demás (proyecto, concepto, entrada) queda detrás. Grafo en d3 donde cada concepto es un área (conjuntos solapados), con tres niveles de detalle (Figura · Obra · Todo, también con la rueda); las áreas se pueden arrastrar. Tarjetas flotantes al abrir un nodo. No tiene la barra lateral de `Base.astro` — su logo enlaza a `/resumen`, hoy la única puerta hacia el resto del archivo.

Absorbe en uso (sin reemplazar) tres versiones congeladas, disponibles bajo "versiones anteriores" en la barra lateral:
- **`/resumen`** (v1) — tarjetas de estado: proyectos en curso, convocatorias abiertas, próximo plazo, ensayos, últimas entradas de bitácora. Es la única pieza que Anarchivo todavía no cubre.
- **`/ciclo-de-vida`** (v1) — cuatro columnas: fuente → en curso → publicado → laboratorio. Es la vista "Carpetas" de Anarchivo.
- **`/grafo`** (v2) — el mismo grafo d3 con sidebar en vez de tarjetas flotantes; Anarchivo hereda su lenguaje visual (islas de concepto por tamaño, dos niveles de color siempre visibles, atenuar en vez de apagar).

**`/bitacora`** — timeline de `bitacora.md`, más reciente arriba, solo lectura.

Estas tres quedan congeladas: no se desarrollan más salvo que se pida explícitamente.

## Código de Anarchivo

`src/pages/anarchivo.astro` es solo el HTML y el arranque (el JSON del grafo va inline en `#ax-data`). El CSS está en `src/styles/anarchivo.css` (global a propósito: casi toda la UI se crea con `innerHTML`, y un estilo con scope no la alcanzaría). El script vive en `src/scripts/anarchivo/` y se empaqueta como módulo; d3 viene de npm, así que funciona sin red.

```
main.js          cableado: render(), go(), setQuery(), setView(), lit() y el arranque
util.js          $, esc, norm, clamp, pairKey, idOf, isMobile, vp (tamaño de la ventana)
data.js          buildData(G): nodos, vecindad, búsqueda · KIND, srcOf, capOf, keyOf
app-state.js     state: búsqueda, ruta, filtros, modo y vista
graph.js         el grafo d3: layouts (anarchivo/archivo), posición por foco, arrastre, zona de toque de los nodos
constelas.js     la vista Constelaciones: las constelaciones (09-constelaciones/) como un grafo propio
pendientes.js    imágenes subidas desde la versión publicada que aún no están en el índice: miniatura en el navegador hasta el próximo deploy
cards.js         HTML de tarjetas y listas (agrupado por tipo, vecinos, ficha)
medios.js        PDF y audio de un proyecto en su tarjeta: mini-reproductor (un solo Audio, sigue sonando al navegar) y visor de PDF
entrada.js       el buscador de inicio como ventanita (arrastrar, plegar) y el plegado del buscador compacto
windows.js       tarjetas flotantes y dock
vistas.js        vistas Lista y Carpetas
top.js           la fila de arriba: ruta, filtros por tipo, capas y foco de la Mesa
publicar.js      «Publicar ↑»: lanza scripts/deploy.sh desde la página y muestra cómo va (solo en dev)
chat.js          «Conversar»: chat con un modelo local de LM Studio, ventanita flotante (arrastrar, agrandar, ⤢ expandir); @menciones y «lo que tengo delante» (solo en dev, vía scripts/chat.mjs)
mesa/
  state.js       mx (persistido en localStorage «ax-mesa-v1») y ms (estado efímero)
  semejanza.js   color + composición entre imágenes
  layout.js      geometría, colocar, anillos, ordenar, encuadrar
  draw.js        hilos, cercanías, contagio y el panel «Entre dos imágenes»
  capas.js       qué hay sobre la mesa: capas, expandir/contraer, foco
  interact.js    mover, agrandar, hilos, elegir (también el modo «Elegir»), pan/zoom con ratón y con dos dedos, Esc
  galeria.js     la Galería y el lightbox
  barra.js       la barra inferior: plegar «ver», hoja de herramientas en el teléfono, alto de la barra
  ficha.js       ⋯ y ✎ en cada imagen: proyecto, ruta, «Mostrar en Finder» y la nota (yaml + archivo; solo en dev, vía scripts/finder.mjs)
  subir.js       el «+» flotante: «Imagen» (08-imagenes/), «Artefacto» (02-artefactos/) y «+ Imagen» en la tarjeta de un proyecto (su imagenes/ y su imagenes.yaml). En dev escribe por scripts/finder.mjs y resincroniza; en la versión publicada manda al servicio ingest/ (con token)
  constelaciones.js  armar una constelación, guardarla en 09-constelaciones/ (solo en dev) y volver a ella como capa
  catalogar.js   «Catalogar original» (solo en dev): navegar las fuentes de 08-imagenes/archivo-fuentes.yaml y dejar su vista previa + ficha (scripts/archivo.mjs)
  export.js      Exportar (hilos y notas como markdown)
```

Convenciones: los módulos no importan la página; lo que necesitan de ella (y las llamadas «hacia arriba») llega por un `ctx` a `initX(ctx)`. `mx` es **un solo objeto** cuya clave y esquema no deben cambiar: es el único dato del usuario que no se regenera con `sync`.

## Conversar (LM Studio)

Un chat con un modelo local para pensar y generar ideas sobre el propio archivo. Solo en local: nada sale de tu ordenador.

1. En LM Studio, cargar un modelo y encender el servidor (pestaña Developer → Start Server; por defecto `http://localhost:1234`, otra dirección en «Ajustes» o con `LMSTUDIO_URL`).
2. `npm run dev` y, en Anarchivo, el botón **Conversar** (arriba a la derecha).

En cada pregunta, `scripts/chat.mjs` arma el contexto: un mapa del archivo (conceptos, proyectos en curso, artefactos, laboratorio, constelaciones); lo que se nombra — con `@` o «+ lo que tengo delante» (el nodo abierto en el grafo, lo elegido en la Mesa) — entero; y lo que más se parece a la pregunta, buscado en el texto completo de los `.md` que el índice conoce y en las notas de las imágenes. Con un modelo que ve imágenes (en el selector, «· ve») las fotos nombradas viajan reducidas a 768 px (hasta 4). «Contexto» (breve → muy amplio) decide cuánto texto va; los niveles altos piden un modelo cargado con ventana larga.

**Voz:** cada respuesta tiene «▶ escuchar», y «leer cada respuesta» la lee sola al terminar. Usa las voces del sistema (Web Speech API, sin red), primero las de Latinoamérica: en macOS Paulina (es-MX) por defecto; más voces, o versiones «mejoradas», en Ajustes del Sistema → Accesibilidad → Contenido leído. Se lee sin markdown y con las citas por su nombre.

El modelo cita lo que usa como `[[id]]`, que en el panel es un enlace al nodo; debajo de cada respuesta están las fichas que recibió.

**Al archivo:** cada conversación se guarda sola, tras cada respuesta, como un `.md` en la carpeta de conversaciones del archivo (por defecto `10-conversaciones/`) (`AAAA-MM-DD-<primera pregunta>.md`): frontmatter con título, fecha, modelos y `sobre:` (lo nombrado), y cada mensaje firmado (con tu firma de «Ajustes» / «modelo · <nombre>») con su hora y las fichas que leyó el modelo. «↥» en la barra la guarda a mano y dice dónde quedó (se apaga el guardado automático en «Ajustes»). El servidor crea el archivo la primera vez y después reescribe solo ese, y solo si nadie lo editó a mano (compara su sha256): si lo tocaste, lo deja y abre uno nuevo. El sync no lee esa carpeta: las conversaciones no entran al grafo ni al contexto del modelo. Se ven en **Guardadas** (en la barra de Conversar): la lista, la más reciente primero, cada una con «Obsidian» (si la carpeta del archivo es una bóveda) y «Finder»; la conversación en curso muestra su archivo con los mismos dos atajos bajo la barra. Al tocar una se retoma tal cual — mensajes, fichas de cada respuesta y lo nombrado —; lo que sigas se añade a ese mismo archivo. Si el archivo se editó a mano de una forma que ya no corresponde a mensajes (p. ej. un campo nuevo en el frontmatter), se muestra como quedó y lo que sigas va a un archivo nuevo. «↓ .md» sigue descargando una copia.

## Ajustes

El botón **Ajustes** (arriba a la derecha, solo en local; en la app, ⌘,) reúne cómo está montado el dashboard, y al lado de cada cosa cómo está en el disco — así sirve también para ver por qué algo no aparece:

- **El archivo:** el nombre (arriba a la izquierda y en el título), la firma (cómo apareces en las conversaciones), y dónde está la carpeta del archivo.
- **Carpetas:** cómo se llama cada una (proyectos, artefactos, ensayos, sueltas, constelaciones, conversaciones, convocatorias, obra publicada, laboratorio, bitácora), con ✓/✗ y cuánto tiene. Cambiar un nombre aquí **no renombra** la carpeta: le dice al dashboard cómo se llama.
- **Nunca leer**, el **vocabulario** (`concepts.ts`, y cuántos conceptos encontró), **Conversar** (dirección de LM Studio y si responde, guardar solas las conversaciones, la *presentación* que el modelo lee antes que nada) y **Publicar** (destino de rsync y subcarpeta, que usa `scripts/deploy.sh`).
- **Índice:** cuándo se generó y cuánto tiene; «Sincronizar ahora».

Se guarda en `dashboard/anarchivo.config.json` (no se versiona: es de cada quien; la plantilla es `anarchivo.config.example.json`; se puede editar a mano; lo lee `scripts/config.mjs`). Lo que falta toma los valores por defecto de `scripts/config.mjs`, y `PLAYBOOK_DIR`, `CONCEPTS_TS`, `LMSTUDIO_URL`, `REMOTE_BASE` siguen mandando si están definidas (el panel lo avisa). El nombre, Conversar y Publicar valen enseguida; si cambian la carpeta del archivo o las carpetas, el panel resincroniza, pero las escrituras (Subir, Catalogar, constelaciones, conversaciones) siguen yendo a las rutas de antes hasta reiniciar `npm run dev` (o, en la app, Anarchivo → Reiniciar el servidor).

## Datos (`src/data/index.json`)

Generado por `sync.mjs`, `.gitignore`d — no se versiona, se regenera en cada `dev`/`build`. Incluye: `bitacora`, `fuente`/`encurso`/`publicado`/`laboratorio` (ciclo de vida), `convocatorias`, `ensayos`, y `grafo` (`concepts`, `nodes`, `links` — construido a partir del frontmatter `concepts:`/`personas:`/`relacionados:` de cada proyecto en `07-proyectos/`, más las obras publicadas de la carpeta «Obra publicada» con sus `concepts:`).

### PDF y audio de un proyecto

`sync.mjs` recorre la carpeta de cada proyecto de `07-proyectos/` y recoge sus `.pdf`, `.mp3`, `.m4a` y `.ogg` (campo `medios` del nodo; no entra en `imagenes/` ni en las piezas que tienen su propio `concepto.md`). Los copia a `public/medios/<proyecto>/…` (`.gitignore`d, como `public/mesa`) para poder servirlos. En la tarjeta del proyecto el audio sale con un mini-reproductor (y, en local, «Mostrar en Finder») y los PDF se abren en una ventana flotante dentro de la página, que se arrastra y se estira; en el teléfono el PDF se abre en el visor del sistema. Los masters `.wav`/`.aif` quedan fuera. Estos archivos también suben con el deploy.

### Relaciones visuales automáticas (CLIP)

Además de los vínculos declarados a mano (`concepts:`, `relacionados:`, `relacionadas:` en `imagenes.yaml`), `sync.mjs` calcula relaciones visuales entre imágenes con un embedder CLIP local (`@xenova/transformers`, modelo `Xenova/clip-vit-base-patch32`, corre en Node vía ONNX — sin red ni servicio externo tras la primera descarga del modelo).

- Toma **todas** las imágenes catalogadas del grafo (`kind: 'imagen'`) sin importar su origen: mezcla `07-proyectos/…/imagenes/` y `_dossier-projects/…/images/` (obra publicada) y `08-imagenes/` (sueltas) en la misma comparación — no hay separación por proyecto ni por carpeta.
- Por cada par de imágenes calcula similitud coseno entre sus embeddings; por encima de `0.85` agrega un link `{ type: 'visual', similarity }` al grafo, salvo que esa relación ya esté declarada a mano (`relacionada`) — para no duplicar.
- Costo: recorre todas las imágenes del repo en cada `sync` (unas mil imágenes rondan el minuto). Los pares que fallan al leerse (p. ej. un PNG con canal alfa que `RawImage` no soporta) se saltan sin frenar el resto.
- Estuvo deshabilitado un tiempo por un bug: la tarea de pipeline correcta para CLIP es `'image-feature-extraction'`, no `'feature-extraction'` (esa es para modelos de texto — con CLIP dispara el tokenizer de texto sobre la imagen y tira `TypeError: text.split is not a function`). Ya corregido en `scripts/sync.mjs`.

## Scripts

- `scripts/sync.mjs` — el generador de datos, ver arriba.
- `scripts/add-image.mjs` — agrega una imagen a `08-imagenes/` y genera su entrada en `imagenes.yaml`. Uso: `npm run add-image -- ./foto.jpg "Descripción" "tag1,tag2"`.
- `scripts/archivo.mjs` y `scripts/catalogar.mjs` — el catálogo de originales: de un original grande (que no se copia) deja en el playbook una vista previa de 1600 px y su ficha con campos `original_*` en el `imagenes.yaml`. Uso: `npm run catalogar -- <archivo|carpeta> [--proyecto 07-proyectos/x] [--recursivo]`. Guía: [docs/documentar.md](docs/documentar.md).
- `scripts/finder.mjs` — los endpoints de escritura de `npm run dev` (Finder, notas de imagen, subir imagen/artefacto/imagen de proyecto, constelaciones, sync, deploy). Usa `ingest/core.mjs`.
- `scripts/chat.mjs` — «Conversar»: arma el contexto desde el índice y los `.md` y habla con LM Studio (`/__chat`, `/__chat-modelos`); guarda las conversaciones en `10-conversaciones/` (`/__conversacion`).
- `scripts/config.mjs` y `scripts/ajustes.mjs` — los ajustes (`anarchivo.config.json`): los leen sync, finder, chat, archivo, add-image y deploy; el panel «Ajustes» los muestra y guarda (`/__ajustes`).
- `desktop/` — la app de escritorio Anarchivo (Electron). Su propio `package.json` (Electron y el empaquetador, solo ahí) y su README. `cd desktop && npm start`, o `npm run app -- --instalar` para dejarla en `~/Applications`.
- `ingest/` — *(avanzado, opcional)* servicio de Railway (`anarchivo-ingest`): recibe imágenes y artefactos desde el teléfono y los escribe en Nextcloud por WebDAV. Su propio `package.json` (solo `sharp`) y su README. Subir cambios: `cd ingest && railway up --service <tu-servicio>`.
- `scripts/deploy.sh` — *(avanzado, opcional)* build con `NODE_ENV=production` y la subcarpeta de «Ajustes → Publicar» (por defecto `/anarchivo/`), y rsync a su destino (`usuario@servidor:/ruta/del/sitio`; sin destino no hace nada). El dashboard es privado (lee bitácora, notas y datos personales) — ese destino va protegido con Basic Auth, nunca lo toca este script (excluye `.htaccess`/`.htpasswd` del rsync).
- `scripts/setup-auth.sh` — *(avanzado, opcional)* configura usuario/contraseña de esa subcarpeta una sola vez (mismo destino que `deploy.sh`), antes del primer `deploy.sh`. El `.htpasswd` queda fuera del webroot remoto.

## Límites

- Solo lectura: no escribe de vuelta al playbook, salvo — en local — `add-image.mjs`, «Subir imagen / Artefacto / + Imagen de proyecto», «Catalogar original» (vista previa + ficha; nunca el original), la nota de una imagen de la Mesa, las constelaciones y las conversaciones de «Conversar» (`10-conversaciones/`); y, desde la versión publicada, esas mismas subidas a través del servicio `ingest/`. Nunca pisa un archivo existente.
- No inventa ni completa contenido — muestra lo que ya existe en el `.md`.
- El trabajo se hace en local (`npm run dev`); la copia online, si la montas, es solo para consulta.

## Avanzado: lo online (opcional)

Anarchivo se usa en local y así está completo. Las dos piezas de abajo vienen del taller donde nació y están **apagadas por defecto**: no aparecen en la página ni hacen nada mientras no las configures.

- **Publicar una copia** — una versión estática, con contraseña, en una subcarpeta de tu hosting (p. ej. `tusitio.org/anarchivo/`), para consultarla desde el teléfono. Pide un hosting con SSH + rsync. Se enciende al poner un destino en **Ajustes → Publicar una copia online**: entonces aparece «Publicar ↑». Antes, una vez, `scripts/setup-auth.sh` (contraseña). Ver [docs/anarchivo.md](docs/anarchivo.md).
- **Subir desde el teléfono a la copia publicada** — el servicio `ingest/` (Railway → tu Nextcloud). Solo tiene sentido con la copia publicada, y solo se activa si el build lleva `PUBLIC_INGEST_URL`. Ver [ingest/README.md](ingest/README.md).

## Licencia

MIT — ver [LICENSE](LICENSE).
