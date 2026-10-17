# Montar tu propio Anarchivo

Una guía para quien quiera usar este dashboard en su **propia práctica artística o de investigación**: un cuaderno de trabajo en markdown (proyectos, textos, bitácora, imágenes) y, encima, una forma de recorrerlo — un grafo de conceptos, una mesa de luz para las imágenes y una conversación con un modelo local.

No es un producto ni un servicio. **Anarchivo Atelier** salió del taller de Luis Negrón van Grieken; aquí se cuenta para que otra persona pueda armarse el suyo. Hay cosas que vienen de la manera de trabajar de ese taller; aquí se dice cuáles son y cómo cambiarlas.

Si solo quieres verlo andar, clónalo y lanza `npm run dev` (§5): abre un archivo de muestra, `ejemplo/`, que tiene la misma forma que se describe aquí.

---

## 1. La idea antes que el código

El dashboard **no guarda nada propio**. Todo vive en carpetas de archivos `.md` e imágenes que escribes tú, con el editor que quieras (Obsidian, iA Writer, VS Code…). El dashboard las lee, arma un índice y te deja moverte por él. Si mañana lo borras, tu archivo sigue entero.

Tres consecuencias que conviene aceptar desde el principio:

- **El orden lo pones tú.** El grafo sale de lo que declaras en cada proyecto (sus conceptos, con quién, con qué se relaciona). No adivina relaciones a partir del texto. La única relación automática es la semejanza visual entre imágenes (CLIP), y no mueve el grafo.
- **Es lento a propósito.** Escribir un proyecto con su frontmatter, catalogar una imagen con su nota… es trabajo de archivo. El dashboard lo hace visible; no lo reemplaza.
- **Es local.** Corre en tu ordenador y no necesita nada más: ni cuentas, ni servidores, ni nube. (Hay piezas online opcionales, apagadas por defecto: §9.)

## 2. Qué necesitas

| | para qué | ¿imprescindible? |
|---|---|---|
| macOS (o Linux) | el dashboard es multiplataforma; «Mostrar en Finder», la app de escritorio y los iconos son de macOS | sí (Linux con algunos límites) |
| [Node.js](https://nodejs.org) 20 o más nuevo | correr el dashboard | sí |
| git | traer el código y versionar tu archivo | muy recomendable |
| [exiftool](https://exiftool.org) | escribir la nota de una imagen también dentro del archivo (XMP) | no |
| [LM Studio](https://lmstudio.ai) | «Conversar» con un modelo local sobre tu archivo | no |
| un hosting con SSH + rsync | solo si quieres una copia online (§9, avanzado) | no |

Nada de esto pide cuentas en servicios de pago. La conversación con el modelo, la semejanza visual y todo el índice se calculan en tu máquina.

## 3. La forma del archivo

El dashboard espera un directorio (tu «playbook») con algunas carpetas de nombre fijo. Ninguna es obligatoria: lo que no exista, simplemente no aparece.

```
mi-archivo/
├── 07-proyectos/            proyectos en curso: una carpeta por proyecto
│   └── mi-proyecto/
│       ├── concepto.md      (o README.md) con frontmatter — ver abajo
│       ├── imagenes/
│       │   ├── foto-1.jpg
│       │   └── imagenes.yaml   el catálogo de las imágenes de ese proyecto
│       └── (pdf, mp3… aparecen en la tarjeta del proyecto)
├── 02-artefactos/           lo que existe como cosa: libros, originales, fotografías, videos, código
│   └── mi-libro/
│       ├── mi-libro.md
│       └── imagenes/
├── 05-ensayos/              textos largos, un .md por texto
├── 08-imagenes/             imágenes sueltas, todavía sin proyecto
├── 09-constelaciones/       conjuntos con nombre de imágenes y textos (los crea la Mesa)
├── bitacora.md              diario: entradas `## AAAA-MM-DD`, la más reciente arriba
├── convocatorias/           (opcional) una carpeta por candidatura
├── _dossier-projects/       (opcional) obra ya publicada, ver §5
├── _lab-projects/           (opcional) proyectos de otra práctica, sin frontmatter
└── dashboard/               este código
```

Los números de las carpetas son una convención (la del taller donde nació, que ordena por función). `ejemplo/` tiene esta misma forma: ábrelo para verla. Si las tuyas se llaman distinto, dilo en **Ajustes** (§10): cada carpeta tiene su campo, y al lado aparece si existe y cuánto contiene. Cambiar el nombre ahí no renombra nada en el disco; solo le dice al dashboard cómo se llama cada cosa.

### Un proyecto

`07-proyectos/mi-proyecto/concepto.md`:

```markdown
---
title: "Mi proyecto — subtítulo de trabajo"
subtitle: "instalación sonora para un espacio vacío"
estado: en-curso
concepts: ["sound-archaeology", "site-specific", "memory-archive"]
personas: ["Nombre de una colaboradora"]
relacionados: ["otro-proyecto"]
---

# Mi proyecto

## Qué es
El primer párrafo es lo que el dashboard muestra en la tarjeta…
```

- `concepts:` — 2 a 5 conceptos del **vocabulario** (§4). Es lo que coloca el proyecto en el grafo: cada concepto es un área, y un proyecto con varios queda en la intersección.
- `personas:` — con quién, a quién se cita. Entran a la búsqueda.
- `relacionados:` — el nombre de la carpeta de otros proyectos en curso. Dibuja un vínculo.

### Las imágenes de un proyecto

Una imagen entra al dashboard cuando está **listada** en el `imagenes.yaml` de su carpeta. Así decides qué se cataloga y qué no:

```yaml
foto-1.jpg:
  alt: maqueta de la sala, vista desde la entrada
  tags: [maqueta, luz]
  relacionadas: [foto-2.jpg, otro-proyecto/plano.png]
  fecha: 2026-08-09
  fuente:
  nota: "la primera vez que la luz entra por el lado norte"
```

`alt` y `nota` son lo que la búsqueda y la conversación «saben» de una foto. Una imagen sin descripción es, para el modelo, solo un nombre de archivo, salvo que el modelo pueda verla (§7).

No hace falta escribir el yaml a mano: el **«+»** de la página sube imágenes (a `08-imagenes/` o a un proyecto) y crea la entrada, y el ✎ de cada imagen en la Mesa guarda su nota.

### La bitácora

`bitacora.md`, entradas fechadas, la más reciente arriba:

```markdown
## 2026-10-05
Hoy reescribí el texto de la propuesta en una versión más simple…
```

Si una entrada nombra un proyecto, el grafo dibuja la mención.

## 4. El vocabulario de conceptos

Es la pieza más personal y la que más conviene pensar. En el taller donde nació, los conceptos son 18 y viven en el repositorio de su web, porque el mismo vocabulario ordena la obra publicada.

Para tu archivo, escribe tu propio `concepts.ts` — la plantilla es [`ejemplo/concepts.ts`](../ejemplo/concepts.ts). Si lo dejas en la **raíz de tu archivo**, el dashboard lo encuentra solo. Si está en otro sitio, dile dónde: en **Ajustes → Vocabulario**, que además cuenta cuántos conceptos encuentra, o con la variable `CONCEPTS_TS`:

```ts
// mi-vocabulario/concepts.ts — el formato importa: dos espacios, comillas simples
export const concepts = {
  'sound-archaeology': {
    label: 'Sound archaeology',
    es: { label: 'Arqueología del sonido', description: 'Escuchar los medios como estratos de tiempo.' },
  },
  'site-specific': {
    label: 'Site-specific',
    es: { label: 'Obra en sitio', description: 'La obra nace del lugar y no se traslada.' },
  },
};
```

```
CONCEPTS_TS=~/mi-vocabulario/concepts.ts npm run dev
```

Unos consejos que vienen del uso:

- **Pocos y amplios** (entre 8 y 20). Un concepto con un solo proyecto es una isla; uno con todos no distingue nada.
- **Los slugs no se cambian a la ligera**: los usan los frontmatter de todos tus proyectos. Para cambiar un nombre, cambia el `label`, no el slug.
- **No inventes conceptos dentro de un proyecto.** Si un proyecto pide uno nuevo, primero se añade al vocabulario. Las *constelaciones* (§6) sirven justo para eso: un conjunto todavía inestable que, si se asienta, se vuelve concepto.

Sin vocabulario el dashboard funciona igual, pero el grafo pierde sus áreas: quedan los proyectos y sus vínculos.

## 5. Poner a andar el dashboard

```
cd mi-archivo
git clone https://github.com/telefante/anarchivo-atelier.git dashboard
cd dashboard
npm install
npm run dev
```

y abre `http://localhost:4321`. Sin configurar nada, lo que ves es **`ejemplo/`**, el archivo de muestra. La primera vez el `sync` descarga el modelo CLIP (menos de 100 MB) y compara todas las imágenes: tarda alrededor de un minuto por cada mil. Las veces siguientes reutiliza lo calculado.

Para pasar a **tu** archivo, dile dónde está:

- **Ajustes → Carpeta del archivo**: `..` si clonaste el dashboard *dentro* de tu archivo (como arriba), o la ruta completa si está en otro sitio; o
- copia la plantilla, `cp anarchivo.config.example.json anarchivo.config.json`, y cambia `"playbook"`; o
- de una vez: `PLAYBOOK_DIR=~/mi-archivo npm run dev`.

Si la carpeta que indicas no existe, el dashboard muestra unos datos de ejemplo internos (no los de `ejemplo/`, otros más pobres). Así sabes que el código anda y que falta la ruta.

**Lo que nunca lee:** lo que pongas en **Ajustes → Nunca leer** (p. ej. `crudo/` o `papeles/`), más siempre `dashboard/`, `node_modules/` y `.git/`. Es el sitio para lo que no quieres que aparezca: material crudo, papeles personales, otra vida laboral.

**Obra publicada (opcional).** Si tienes un sitio con tu obra en archivos `.md` (cada obra en una carpeta con `images/`), un symlink hacia esa carpeta (con el nombre de **Ajustes → Carpetas → Obra publicada**, por defecto `_dossier-projects`) la trae al grafo como «publicado», con sus `concepts:`. Si no lo tienes, ignóralo.

## 6. Recorrerlo

La [guía de Anarchivo](anarchivo.md) cuenta cada vista en detalle. En corto:

- **Grafo** — la entrada es un buscador. Un concepto abre su área; un proyecto, su tarjeta. Tres niveles de detalle: Figura, Obra, Todo.
- **Lista** y **Carpetas** — lo mismo, ordenado como texto o según el ciclo de vida: en curso → publicado → laboratorio.
- **Mesa** — una mesa de luz con tus imágenes: moverlas, tirar hilos entre ellas, anotar por qué dos fotos van juntas, verlas ordenadas por semejanza. Lo que haces en la Mesa queda en tu navegador; «Exportar» lo pasa a markdown para la bitácora.
- **Constelaciones** — eliges imágenes y textos (⌘/Ctrl+clic), les das un nombre y se guardan en `09-constelaciones/`. Es el paso previo a un concepto.

## 7. Conversar con tu archivo (opcional)

Un chat con un modelo que corre en tu ordenador, sin internet, al que el dashboard le da a leer lo que viene al caso de tu archivo.

1. Instala [LM Studio](https://lmstudio.ai), descarga un modelo y cárgalo. Para empezar, uno de 4 a 8 mil millones de parámetros va bien en un portátil con 16 GB. Si eliges uno **con visión** (en LM Studio, los que marcan *vision*), también podrá mirar las fotos que nombres.
2. En LM Studio: pestaña **Developer → Start Server** (queda en `http://localhost:1234`).
3. En el dashboard, botón **Conversar**. Escribe `@` para nombrar un proyecto, una foto o un ensayo, o pulsa «+ lo que tengo delante».

Lo que el modelo recibe en cada pregunta: un mapa de tu archivo, lo que nombraste (entero) y lo que más se parece a la pregunta. Cita lo que usa y cada cita lleva al nodo. Debajo de cada respuesta puedes ver qué fichas recibió: así sabes si habló de lo que hay o de lo que imagina. Cada respuesta se puede escuchar en voz alta con las voces del sistema.

Cada conversación se guarda sola como un `.md` en la carpeta de conversaciones (`10-conversaciones/`), con cada mensaje firmado y fechado. Si editas ese archivo a mano, el dashboard no lo pisa: la siguiente vez abre otro.

Dos advertencias honestas:

- Un modelo pequeño **se equivoca con seguridad**. Las instrucciones le piden no inventar datos de las obras y marcar sus ideas como propuestas, pero conviene leerlo como a un interlocutor, no como a una fuente.
- Sirve para **abrir preguntas y cruzar proyectos**. Lo que el modelo escribe no es tu voz; la conversación se descarga como `.md` para que tú decidas qué pasa al archivo, y cómo.

## 8. La app de escritorio (opcional, macOS)

```
cd dashboard/desktop
npm install
npm run app -- --instalar
```

deja **Anarchivo.app** en `~/Applications`. Es una ventana propia sobre el mismo servidor local: al abrirla sincroniza y arranca el dashboard, y al cerrarla lo apaga. Para cambiar el nombre o el icono: `productName` en `desktop/package.json` y `desktop/build/icono.svg` (luego `npm run icono`). Detalles en [desktop/README.md](../desktop/README.md).

## 9. Avanzado: una copia online (opcional, apagada por defecto)

Nada de esta sección hace falta: Anarchivo está completo en local. Mientras no pongas un destino, el botón «Publicar ↑» no aparece y no sale nada de tu ordenador.

Para mirar el archivo desde el teléfono: `scripts/deploy.sh` (o el botón **Publicar ↑**) construye una versión estática y la sube por rsync. A dónde, lo dices en **Ajustes → Publicar**: el destino (`usuario@servidor:/ruta/del/sitio`) y la subcarpeta (por defecto `/anarchivo/`). Sin destino no publica nada.

Tu archivo es privado: bitácora, notas, nombres de personas. La copia publicada **tiene que ir con contraseña**. `scripts/setup-auth.sh` prepara un `.htpasswd` con Basic Auth en hostings Apache, con el mismo destino; el deploy nunca toca esos archivos. Sin una protección así, no publiques.

Para subir fotos desde el teléfono a la copia publicada existe además un pequeño servicio (`ingest/`, en Railway, que escribe en Nextcloud). Es la pieza más específica: necesita tu propio Nextcloud y un servicio en Railway. Su README cuenta cómo montarla, pero no es necesaria para nada de lo anterior.

## 10. Hacerlo tuyo: Ajustes

Casi todo lo que cambia de un archivo a otro está en el botón **Ajustes** (arriba a la derecha, en local; en la app, ⌘,), y se guarda en `dashboard/anarchivo.config.json`. Ese archivo es tuyo: **no se versiona** (está en `.gitignore`), así que un `git pull` nunca lo pisa. La plantilla es `anarchivo.config.example.json`.

| en Ajustes | qué es |
|---|---|
| Nombre, firma | lo que aparece arriba y en el título; cómo te firman las conversaciones guardadas |
| Carpeta del archivo | dónde está tu playbook |
| Carpetas | cómo se llama cada una en tu archivo, y si existe |
| Nunca leer | lo privado, que no aparece nunca |
| Vocabulario | tu `concepts.ts` |
| Conversar → Presentación | quién eres y de qué va tu práctica: el modelo lo lee antes que nada |
| Publicar una copia online | opcional, apagado por defecto: a dónde sube la copia privada (§9) |

La **presentación** merece un rato: de ella depende mucho el tono de la conversación. Escríbela con tus palabras. Las reglas que van detrás (citar lo que usa, no inventar datos, marcar sus ideas como suyas) no cambian.

Si cambias la carpeta del archivo o los nombres de carpetas, el panel resincroniza; para que las escrituras (subir, catalogar, constelaciones, conversaciones) vayan al sitio nuevo, reinicia `npm run dev` (en la app: Anarchivo → Reiniciar el servidor).

Lo que queda fuera de Ajustes, porque es diseño y no datos:

| qué | dónde |
|---|---|
| colores y tipografía (gris neutro, Barlow Semi Condensed, acento bermellón `#da3a16`) | `src/styles/global.css` (tokens en `:root`) y `src/styles/anarchivo.css` |
| el nombre y el icono de la app de escritorio | `desktop/package.json`, `desktop/build/icono.svg` |
| el servicio de subida desde el teléfono (`ingest/`) | sus variables en Railway; usa los nombres de carpeta por defecto |

## 11. Cuando algo no anda

- **El grafo sale vacío o con datos de ejemplo** → el dashboard no encuentra tu archivo: abre **Ajustes** y mira la carpeta del archivo y los ✓/✗ de cada carpeta (hace falta al menos la de proyectos o la bitácora).
- **Un proyecto no tiene área** → sus `concepts:` no están en el vocabulario (Ajustes → Vocabulario dice cuántos conceptos encontró).
- **Una imagen no aparece** → no está listada en el `imagenes.yaml` de su carpeta (las de `08-imagenes/` entran solas).
- **«Conversar» dice que LM Studio no responde** → el servidor de LM Studio no está encendido o no hay un modelo cargado.
- **Un botón dice «Reinicia npm run dev»** → el servidor arrancó antes de que existiera esa función: detenlo (Ctrl+C) y vuelve a lanzarlo.
- Más casos en la [guía de Anarchivo](anarchivo.md#si-algo-no-va).

---

*Escrito el 2026-10-16, revisado el 2026-10-17 para Anarchivo Atelier. Si algo de esto deja de ser verdad, la referencia es el código: `scripts/config.mjs` dice qué se puede ajustar, `scripts/sync.mjs` decide qué se lee; `README.md` y `CLAUDE.md` del dashboard cuentan el resto.*
