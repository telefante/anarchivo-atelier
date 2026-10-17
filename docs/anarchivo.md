# Anarchivo — guía

Anarchivo es la home del dashboard (`/anarchivo`; `/` redirige aquí). Una sola puerta al archivo: un buscador, y detrás de él los proyectos, las obras, los textos y las imágenes con lo que resuena entre ellos. Esta guía explica cómo se usa, cómo entra material nuevo (desde el ordenador o desde el teléfono) y cómo se publica. Para usarlo como **archivo de originales grandes** (20–200 MB, que no se copian), ver [documentar.md](documentar.md). La estructura del código está en el [README](../README.md#código-de-anarchivo).

## Las vistas

La fila de abajo cambia de vista: **Grafo · Lista · Tiempo · Carpetas · Constelaciones · Mesa** (Tiempo está desactivada, «próxima etapa»).

- **Grafo** — cada concepto del vocabulario (`concepts.ts`) es un **área** (el casco de sus obras); un proyecto con varios conceptos queda en la intersección. Tres niveles de detalle, **Figura · Obra · Todo** (abajo a la derecha; también con la rueda en el ordenador). Un nodo abre su tarjeta; con un foco abierto, sus vecinos se ordenan en anillo. Los nodos «silenciosos» (bitácora, ensayos, convocatorias, obra publicada, imágenes) solo muestran su nombre cuando están encendidos por un foco o una búsqueda; tienen una zona de toque ampliada para el dedo.
- **Lista** y **Carpetas** — lo mismo como lista agrupada por tipo, y como las cuatro columnas del ciclo de vida (fuente → en curso → publicado → laboratorio, más los artefactos).
- **Constelaciones** — las constelaciones guardadas (`09-constelaciones/`) como un grafo propio: cada una con sus imágenes en miniatura y sus textos alrededor.
- **Mesa** — una mesa de luz con imágenes sueltas (ver abajo).

## Tarjetas

Al abrir un nodo sale una **tarjeta flotante** (en el teléfono, una hoja). Pestañas **Leer** y **Relaciones**. En la de un proyecto en curso o de un artefacto, la fila de acciones tiene **Ver en la mesa** y **+ Imagen** (solo donde hay a dónde subir, ver «Subir material»).

## La Mesa

Las imágenes entran como **capas** (una búsqueda, un foco, «Últimas tocadas», «Dossier», una constelación…). Se arrastran, se agrandan, y se relacionan **tirando un hilo** de una a otra. Dos modos: **Libre** y **Alineado** (Galería en filas).

- **Elegir** (grupo «Selección» de la barra): con el modo activo, tocar una imagen la suma o la quita de la selección, y las imágenes no se arrastran. Con ratón también vale ⌘/Ctrl+clic. Lo elegido se guarda como constelación con **+ Constelación**.
- **Gestos en el teléfono**: un dedo mueve el fondo o una imagen; **dos dedos** hacen zoom y desplazan a la vez, sobre el fondo o sobre imágenes. En el grafo, un dedo desplaza y dos amplían (sin cambiar de nivel: para eso están Figura · Obra · Todo).
- **Constelaciones**: una constelación es un conjunto con nombre de imágenes y textos, el paso previo a un concepto. En local se guarda como `09-constelaciones/<slug>.md`; en la versión publicada queda en este navegador.
- **Notas de imagen** (✎) y «Mostrar en Finder» (⋯) existen solo en local. El ⋯ de una imagen que es la vista previa de un original catalogado añade el bloque **Original**: formato, peso, dimensiones, «Abrir original ↗» (si vive en Nextcloud) y, en local, «Mostrar original en Finder».
- **Exportar** saca los hilos y las notas como markdown, para llevarlos a la bitácora.

El estado de la Mesa (posiciones, hilos, notas, capas) vive en el navegador: `localStorage` «ax-mesa-v1», un solo objeto cuya clave y esquema no cambian. Es el único dato del usuario que no se regenera con `sync`.

## Subir material

El botón **+** (círculo rojo, abajo a la derecha, en todas las vistas) abre dos opciones:

| Opción | Qué crea | Dónde |
|---|---|---|
| **Imagen** | imágenes sueltas | `08-imagenes/` |
| **Artefacto** | un artefacto nuevo: carpeta, ficha en blanco y sus fotos | `02-artefactos/<slug>/` (`<slug>.md` + `imagenes/`) |
| **Catalogar original** (solo en local) | la vista previa y la ficha de un original grande que vive en otra carpeta; el original no se copia | `08-imagenes/` o `<proyecto>/imagenes/`, con campos `original_*` en su `imagenes.yaml` (ver [documentar.md](documentar.md)) |
| **+ Imagen** (en la tarjeta de un proyecto) | imágenes adicionales de ese proyecto | `07-proyectos/<proyecto>/imagenes/` **y** una entrada en su `imagenes.yaml` |

Sobre una tarjeta de **artefacto**, «+ Imagen» añade las fotos a su `imagenes/` y las enlaza en su ficha.

Qué se hace con cada archivo:

- Se endereza según su EXIF, se **reduce a 2000 px** (lado mayor, sin agrandar) y se guarda como **PNG**. Un GIF se deja tal cual.
- **Nunca pisa** un archivo que ya existe: añade `-2`, `-3`… al nombre.
- La ficha de un artefacto solo lleva título y tipo; año, técnica, medidas, tirada… quedan en blanco, y «Qué es» lleva la pregunta guía en comentario. No se inventa nada.
- El `imagenes.yaml` se edita añadiendo la entrada al final (`alt`, `tags`, `relacionadas`, `fecha` de hoy, `fuente`); cabecera, comentarios y entradas anteriores no se tocan. Si no existe, se crea con la cabecera estándar. Sin esa entrada el índice no vería la imagen.

### Dos destinos

El mismo botón escribe en un sitio u otro según dónde esté la página:

- **En local** (`npm run dev`): `scripts/finder.mjs` escribe directo en el disco del playbook (`/__subir`, `/__artefacto`, `/__artefacto-foto`, `/__proyecto-imagen`), regenera el índice (`/__sync`) y recarga; lo recién subido queda como la capa «Nuevas».
- **En la versión publicada**: la página llama al servicio de Railway (`ingest/`, ver abajo), que escribe en Nextcloud. Si la subida se hace desde el teléfono, no hace falta tener el Mac encendido.

Para usarlo desde el teléfono con el servidor local: `npm run dev -- --host` (con `--`, o npm se queda con la opción) y abrir la IP que imprime Astro, en la misma wifi. Con `--host` los endpoints de escritura quedan accesibles a toda la red: no hacerlo en una red pública.

### Lo subido desde la versión publicada

La página publicada es una foto del índice del último deploy. Lo que subes llega a Nextcloud al instante, pero **no existe en el índice** hasta que el Mac sincronice, corra `sync` y se publique de nuevo. Mientras tanto, la imagen entra a la Mesa como **miniatura** (unos 640 px, guardada en este navegador, las últimas 12; «ax-pendientes-v1») y se descarta sola cuando el índice trae la de verdad, que se reconoce por el mismo nombre. Si borras los datos del sitio antes de publicar, se pierde la miniatura; el archivo sigue en Nextcloud.

Si la subida falla, el motivo aparece junto al «+» durante unos segundos.

## El servicio de subida (`ingest/`) · avanzado, opcional

Solo para quien publica una copia online y quiere subir desde el teléfono; apagado por defecto (sin `PUBLIC_INGEST_URL` en el build no existe). En local no hace falta: allí se sube directo al disco.

Un servicio de Railway (`anarchivo-ingest`), sin Express: solo `node:http` y `sharp`.

```
teléfono ──(HTTPS + token)──▶ Railway ──(WebDAV)──▶ Nextcloud ──(sync)──▶ el Mac
```

- Rutas: `GET /salud`, `POST /imagen`, `/artefacto`, `/artefacto-foto`, `/proyecto-imagen`. Todas menos `/salud` piden `Authorization: Bearer <INGEST_TOKEN>`.
- **CORS** limitado a `ALLOWED_ORIGINS` (obligatoria: dónde está publicada la página, p. ej. `https://tusitio.org`).
- Escribe con `If-None-Match: *` (nunca pisa) y reescribe fichas y yaml con `If-Match` (si el archivo cambió en el Mac mientras tanto, vuelve a leer y reintenta).
- `ingest/core.mjs` es el código que comparte con el servidor local (limpiar nombres, reducir imágenes, plantilla de ficha, entrada del yaml): subir por un camino o por otro guarda exactamente lo mismo.
- Variables de entorno, puesta en marcha y cómo probarlo: [ingest/README.md](../ingest/README.md).
- El token se pide una vez en cada navegador y se recuerda («ax-ingest-token»). La contraseña de aplicación de Nextcloud vive solo en las variables de Railway.
- Para que la página publicada muestre el «+», el build necesita `PUBLIC_INGEST_URL` (en `dashboard/.env`, ignorado por git).
- Cada cambio del servicio hay que subirlo: `cd ingest && railway up --service <tu-servicio>`.

## Publicar · avanzado, opcional

Apagado por defecto: «Publicar ↑» solo aparece cuando hay un destino en **Ajustes → Publicar una copia online** (o `REMOTE_BASE`).

`scripts/deploy.sh` (o **Publicar ↑**, en local, con un segundo toque) hace `sync`, `astro build` con `ATELIER_BASE` = la subcarpeta de «Ajustes → Publicar» (por defecto `/anarchivo/`) y `NODE_ENV=production`, y rsync al destino de «Ajustes → Publicar» (p. ej. `tusitio.org/anarchivo/`; sin destino no hace nada). El contenido es privado: la subcarpeta va con Basic Auth, que el deploy nunca toca (`scripts/setup-auth.sh`, una sola vez).

Cosas que ya dieron problemas:

- **«local» vs publicada.** La página decide si está en local con `import.meta.env.DEV && !process.env.ATELIER_BASE`. Un deploy lanzado desde Publicar ↑ hereda `NODE_ENV=development`, y sin esa segunda condición la página publicada se creía local y pedía endpoints que no existen (`/anarchivo/__subir` → 404).
- **403 «unable to read htaccess file».** El `.htaccess` de la subcarpeta tiene que ser legible por Apache (`chmod 644`); copiado con permisos restrictivos, el servidor deniega todo.
- **Se ve la versión vieja.** El HTML conserva el nombre entre deploys y el navegador lo guarda: probar en una pestaña privada o borrar los datos del sitio.
- **Sin contraseña no debe abrir.** Una petición sin credenciales a `/<subcarpeta>/anarchivo/` tiene que dar 401. Si da 200, la protección no está puesta.

## Datos y claves del navegador

`src/data/index.json` se genera con `node scripts/sync.mjs` en cada `dev`/`build` (`.gitignore`d) y el grafo va inline en la página. El sync también calcula similitud visual (CLIP) entre unas 900 imágenes (≈1 min). Lo que se guarda en el navegador:

| Clave | Qué |
|---|---|
| `ax-mesa-v1` | estado de la Mesa (`mx`) |
| `ax-barra-v1` | si la fila «ver» de la barra está plegada |
| `ax-ingest-token` | token de subida (solo versión publicada) |
| `ax-pendientes-v1` | miniaturas de lo subido y aún sin índice |
| `ax-subidas` (sesión) | ids recién subidos o catalogados, a la espera de la recarga (local) |

## Si algo no va

| Síntoma | Causa probable |
|---|---|
| La subida pide `/<subcarpeta>/__subir` y da 404 | versión vieja en caché, o un deploy hecho antes del arreglo de «local» |
| «No se subió: token incorrecto» | el token guardado no coincide con `INGEST_TOKEN`; se borra solo, vuelve a pedirse |
| «No se subió: … (Failed to fetch)» | sin conexión, o el origen no está en `ALLOWED_ORIGINS` |
| `curl …/salud` no responde | el servicio de Railway está caído: `railway logs --service <tu-servicio>` |
| La imagen llegó a Nextcloud pero no está en el índice | falta que el Mac sincronice y se publique de nuevo |
| El botón «+» no aparece | no hay a dónde subir: falta `PUBLIC_INGEST_URL` en el build, o no es `npm run dev` |
| «Catalogar original» no lista fuentes | falta `08-imagenes/archivo-fuentes.yaml` o su carpeta no está montada (ver [documentar.md](documentar.md#si-algo-no-va)) |
| 404 en `/icons/lupa.svg` | falta `public/icons/lupa.svg` (lo usa el buscador) |
