# Cómo documentar en Anarchivo — onboarding

Esta guía es para empezar a usar Anarchivo **como archivo**: tener a la vista, en un solo sitio, piezas que pesan entre 20 y 200 MB (un TIFF, un RAW, un PSD, un PDF de imprenta, un video) sin llevarlas dentro del playbook. Si solo quieres subir una foto o crear un artefacto, mira [anarchivo.md](anarchivo.md#subir-material).

La catalogación es más completa en macOS: allí usa también `sips` y Quick Look (HEIC, RAW, PSD, PDF). En Linux quedan `sharp` (JPG, PNG, WebP, GIF, TIFF, AVIF) y `ffmpeg` (video).

## La idea en un minuto

- El **original** se queda donde ya está (Nextcloud, iCloud, un disco). No se copia, no se mueve, no se renombra.
- En el playbook solo entra la **vista previa** (un JPG de 1600 px, unos 200–400 KB) y la **ficha** de esa pieza, con un enlace al original.
- Para Anarchivo la pieza es una imagen más: aparece en la Mesa, en el grafo, en las constelaciones y en la búsqueda. La diferencia es que su ⋯ trae un bloque **Original** con el formato, el peso, la ruta y «Abrir original ↗».
- Catalogar una pieza no la documenta. **Documentar** es lo que haces después: decir qué es, de dónde viene y con qué se relaciona (ver «Documentar de verdad»).

```
original (200 MB, en Nextcloud)  ──catalogar──▶  vista previa 1600 px + ficha (en el playbook)
                                                      │
                                                      └─ «Abrir original ↗» lleva de vuelta al original
```

## Antes de empezar: declarar las fuentes (una vez)

Una **fuente** es una carpeta donde ya tienes originales. Se declaran en `08-imagenes/archivo-fuentes.yaml`:

```yaml
nextcloud:
  nombre: Nextcloud · nube.ejemplo.org
  tipo: nextcloud
  ruta: ~/Nextcloud                     # la carpeta en este Mac
  remota: /                             # esa carpeta vista desde el servidor
  url: https://nube.ejemplo.org

disco-externo:
  nombre: Disco de originales
  tipo: disco
  ruta: /Volumes/NOMBRE-DEL-DISCO
```

| Campo | Para qué |
|---|---|
| `tipo` | `nextcloud`, `icloud` o `disco`. Decide cómo se abre el original. |
| `ruta` | La carpeta en **este** Mac (admite `~`). Solo se puede catalogar lo que esté dentro de una fuente. |
| `remota` y `url` | Solo `nextcloud`: permiten el enlace «Abrir original ↗», que funciona desde cualquier dispositivo. |

Puedes tener varias fuentes. Si una carpeta de una fuente está dentro de otra, gana la más específica. Si un disco no está montado, su fuente simplemente no aparece en el diálogo.

## Catalogar

### Desde el dashboard (lo habitual)

1. `npm run dev` y abre Anarchivo.
2. **+** → **Catalogar original**. (Solo existe en local: el Mac es el que ve las carpetas.)
3. Elige la **fuente** y navega por sus carpetas.
4. Marca archivos y pulsa **Catalogar los elegidos**, o entra en una carpeta y pulsa **Catalogar esta carpeta** (con la casilla «incluir subcarpetas» si quieres todo lo de dentro).
5. En «Va a» elige un proyecto en curso, o déjalo en **Sueltas**.
6. Al terminar, la página se recarga con lo nuevo sobre la Mesa (capa «Nuevas»).

### Desde la línea de comandos (para lotes)

```
npm run catalogar -- "<archivo o carpeta>"… [--proyecto 07-proyectos/<proyecto>] [--recursivo]
```

Ejemplo: `npm run catalogar -- ~/Nextcloud/2024_serie/escaneos --recursivo --proyecto 07-proyectos/mi-proyecto`. Luego `npm run sync` (o recarga con `npm run dev`) para verlo.

### Qué hace por cada original

1. Comprueba que está dentro de una fuente.
2. Calcula su **sha256**. Si ya está catalogado (mismo hash, aunque cambie el nombre), lo salta y te lo dice: no hay duplicados.
3. Genera la vista previa: JPG de 1600 px, endereza la orientación y convierte a sRGB. Usa `sharp` (JPG, PNG, WebP, GIF, TIFF, AVIF); si no puede, `sips` de macOS (HEIC, RAW, PDF…) o Quick Look; para video, `ffmpeg` (un fotograma). Un PSD o un RAW exótico lo hace Quick Look, si macOS lo entiende.
4. La guarda como `<nombre>.jpg` en `<proyecto>/imagenes/` (o en `08-imagenes/`), sin pisar nada (`-2`, `-3`…).
5. Añade su entrada al `imagenes.yaml` de esa carpeta con los campos `original_*`.

**Qué formatos entran:** imágenes (JPG, PNG, WebP, GIF, TIFF, AVIF, BMP, HEIC), RAW (DNG, CR2/CR3, NEF, ARW, RAF, ORF, RW2), PSD, AI, EPS, SVG, PDF y video (MOV, MP4, M4V, AVI, MKV, WebM). El audio y los datos no tienen vista previa y se saltan. Tope: 300 archivos por catalogación.

### Qué queda en el playbook

```yaml
foto grande.jpg:
  alt:
  tags: []
  relacionadas: []
  fecha: 2026-10-11
  fuente:
  original_fuente: nextcloud
  original_ruta: 2024_serie/escaneos/foto grande.tif
  original_formato: TIF
  original_bytes: 187000000
  original_px: 9000x6000
  original_sha256: 231842dd…
  original_url: https://nube.ejemplo.org/index.php/apps/files/?dir=…&scrollto=…
```

`original_ruta` es relativa a la fuente, así sigue valiendo aunque la carpeta se monte en otro sitio. `original_url` solo existe para fuentes `nextcloud`. El peso en el repo es el del JPG, no el del original.

## Documentar de verdad

Catalogar deja `alt`, `tags`, `relacionadas` y `fuente` **vacíos a propósito**: Anarchivo no infiere nada del contenido. Esa parte es tuya, y es la que hace que la pieza se encuentre y se entienda dentro de un año.

Se escribe en el `imagenes.yaml` de su carpeta (el mismo archivo donde está su entrada) o, para una nota larga, con ✎ en la Mesa.

| Campo | Qué poner | Ejemplo |
|---|---|---|
| `alt` | Qué se ve, en una línea. Alimenta la búsqueda y es el título que sale en la Mesa. | `Escaneo del plano, versión con anotaciones a lápiz` |
| `tags` | Vocabulario libre tuyo (no el de `concepts.ts`). Pocas, reutilizadas. | `[plano, escaneo, mi-proyecto]` |
| `relacionadas` | Otras piezas con las que dialoga: su clave en este archivo, o `otro-proyecto/archivo.jpg`. Dibuja hilos en el grafo. | `[plano-v1.jpg, otro-proyecto/foto-sala.jpg]` |
| `fecha` | Se rellena con el día en que catalogas. Cámbiala por la fecha de la pieza si es otra. | `2025-03-14` |
| `fuente` | Solo si **no** es material propio: el crédito. | `Archivo municipal` |
| nota (✎) | Lo que hay que recordar: de dónde viene, para qué sirvió, qué la hace distinta. | |

Reglas:

- **Escribe tú.** Ni el catálogo ni nadie rellena estos campos por ti; si dudas, déjalos vacíos.
- **No toques las líneas `original_*`.** Son las que enlazan con el original.
- **Una pieza, una entrada.** Si la misma imagen ya está catalogada, no la repitas: usa `relacionadas`.
- **Cuanto antes, mejor.** Un lote sin `alt` aparece en la Mesa con el nombre del archivo; es útil para verlo, no para encontrarlo.

## Abrir el original

En la Mesa, el **⋯** de la imagen:

| Dónde vive | Qué ves | En el teléfono |
|---|---|---|
| Fuente `nextcloud` | **Abrir original ↗** (se abre la carpeta en Nextcloud con el archivo resaltado) | sí |
| Fuente `icloud` o `disco`, en local | **Mostrar original en Finder** | no: «el original está en el Mac» |

Lo que sí se ve siempre es la vista previa, el formato, el peso y las dimensiones del original.

## Si mueves o renombras un original

El enlace guarda la ruta, no una identidad. Si mueves el archivo dentro de su fuente, edita `original_ruta` (y `original_url`) en el `imagenes.yaml`. El `original_sha256` no cambia, y sirve para reconocer el archivo y para que no se catalogue dos veces. Un comando que repare los enlaces solo, buscando por hash, está pendiente.

## Desde el teléfono

- **Leer:** navegar por las vistas previas y, si el original está en Nextcloud, abrirlo.
- **Capturar con la cámara:** el «+» → **Imagen** acepta fotos nuevas. Se guardan reducidas (2000 px, PNG); la cámara no se trata como un original.
- **Catalogar** originales grandes no se hace desde el teléfono: las carpetas las ve el Mac.

## Checklist del primer día

- [ ] `08-imagenes/archivo-fuentes.yaml` tiene al menos una fuente con `existe: true` (es decir, su `ruta` está montada).
- [ ] Catalogaste **una** pieza de prueba y aparece en la Mesa con su bloque Original en el ⋯.
- [ ] «Abrir original ↗» (o «Mostrar original en Finder») te lleva al archivo.
- [ ] Llenaste `alt` y un par de `tags` de esa pieza y la encuentras buscándola.
- [ ] Sabes a qué proyecto va lo que catalogues (o decidiste dejarlo en Sueltas).

## Si algo no va

| Síntoma | Causa probable |
|---|---|
| «Catalogar original» no aparece en el «+» | no estás en `npm run dev` (en la versión publicada no existe) |
| El diálogo no lista ninguna fuente | `archivo-fuentes.yaml` no existe, está mal escrito o su `ruta` no está montada |
| «no está en ninguna fuente» | el archivo no está dentro de la `ruta` de ninguna fuente |
| «no sé dibujar una vista previa de este formato» | ni `sharp`, ni `sips`, ni Quick Look, ni `ffmpeg` lo leen |
| «ya catalogado en …» | mismo contenido (sha256) que una pieza que ya tiene ficha |
| Catalogaste pero no se ve | falta `npm run sync` (o recargar con `npm run dev`) |
| No hay «Abrir original ↗» | la fuente no es `nextcloud`, o le faltan `remota`/`url` |
 m