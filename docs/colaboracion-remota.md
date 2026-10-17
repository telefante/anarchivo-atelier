# Conversar con otra persona a distancia — cuánto cuesta

*Investigación, 2026-10-16. Nada de esto está construido; es para decidir si vale la pena y por dónde empezar. Está escrita para el taller donde nació Anarchivo (el de Luis, con su hosting y su Nextcloud): los nombres son de ese caso, las preguntas sirven para cualquiera.*

La pregunta: añadir al dashboard una **capa conversacional para colaborar a distancia con otra persona** — una curadora, un coautor, alguien de un proyecto — sobre el archivo. Hoy «Conversar» es un diálogo entre Luis y un modelo local, en su Mac. Abrirlo a una segunda persona cambia más de lo que parece: no es tanto un problema de chat como de **qué ve la otra persona, dónde queda lo dicho y dónde corre el modelo**.

---

## 1. Tres cosas distintas que se pueden querer

| | qué es | parecido a |
|---|---|---|
| **A. Hablar sobre el archivo** | dejarse mensajes alrededor de un proyecto, una foto, una constelación; cada uno a su ritmo | comentarios en un documento compartido |
| **B. Conversar los dos con el modelo** | una sala donde escriben Luis, la otra persona y el modelo, que lee lo que hay en la sala | un chat de tres |
| **C. Trabajar juntos en vivo** | ver la misma Mesa, mover imágenes, tirar hilos y conversar a la vez | una pizarra compartida |

A cabe en días; B, en semanas; C, en meses. Casi todo lo que se gana con C se consigue con A o B y una videollamada al lado.

## 2. De dónde se parte

Lo que el dashboard es hoy, y lo que eso implica:

- **Todo lo vivo corre en el Mac.** El servidor de `npm run dev` (o la app Anarchivo) es el único que escribe en el playbook y el único que arma el contexto del modelo. Si el Mac está apagado, no hay modelo ni escritura.
- **La copia publicada es estática:** HTML con contraseña (Basic Auth) en un hosting compartido, sin un servidor propio que pueda guardar mensajes. Es una foto del índice del último «Publicar».
- **Ya existe una pieza en la nube:** el servicio `ingest/` en Railway, que recibe fotos del teléfono con un token y las escribe en **Nextcloud** por WebDAV. Nextcloud ya sincroniza la carpeta del Atelier con el Mac. Es el camino natural para que algo de fuera llegue al archivo sin abrir el Mac a internet.
- **El modelo es local** (LM Studio, `localhost:1234`). Nada sale del Mac. Es una decisión, no un detalle técnico.
- **El archivo es privado.** La bitácora, las convocatorias y las notas nombran personas, plazos y dudas. El chat de hoy busca en **todo** el índice para armar el contexto; con otra persona en la sala, eso sería una fuga.
- **Reglas del playbook** que la colaboración toca de frente: el dashboard no escribe en el playbook salvo excepciones pedidas; la bitácora es *append-only*; no se escribe en nombre de Luis; lo que no es de Luis tiene que poder distinguirse.

## 3. Los cinco problemas de verdad

1. **Quién es la otra persona.** Hace falta una identidad mínima: un enlace con un token propio (como el del teléfono), o una cuenta. Sin eso no hay autoría ni forma de cortar el acceso.
2. **Qué puede ver.** Es lo más delicado. La propuesta razonable es una **sala acotada**: un conjunto con nombre de proyectos, fotos y textos, igual que una constelación. La otra persona ve solo eso, y el modelo también lee solo eso. La bitácora y las convocatorias quedan fuera salvo que se nombren una por una.
3. **Dónde queda lo dicho.** Si la conversación debe dejar rastro, lo natural en este playbook es un **archivo markdown por sala**, con cada mensaje fechado y firmado («Luis», «Ana», «modelo»), en una carpeta nueva y aparte (p. ej. `10-conversaciones/`). Esto es una escritura nueva al playbook: hay que pedirla y anotarla como excepción.
4. **Dónde corre el modelo.**
   - *En el Mac de Luis* (como hoy): privado, gratis, pero responde solo cuando el Mac está encendido, y con la velocidad de un modelo pequeño.
   - *Un modelo en la nube* (una API): siempre disponible y mejor, pero el contenido de la sala sale a un tercero. Rompe el «nada sale del Mac» y conviene decidirlo explícitamente.
5. **Tiempo real o no.** Lo asíncrono (cada uno a su ritmo) cabe en lo que ya hay: Nextcloud y un servicio pequeño. Lo simultáneo pide un servidor que mantenga conexiones abiertas (WebSocket) y presencia: quién está ahora.

## 4. Caminos posibles

### Camino 1 — Sala por archivo, asíncrona (recomendado para empezar)

- Luis crea una **sala** desde el dashboard: nombre + lo que entra (como «+ Constelación»). Se guarda como `10-conversaciones/<sala>.md`: frontmatter con la lista de lo compartido, y debajo los mensajes.
- La otra persona recibe un **enlace con su token** a una página de solo esa sala: las fichas y fotos compartidas y la conversación. La página se publica con el resto (estática). Los mensajes que escribe van al servicio de Railway, que los **añade al final** del archivo de la sala en Nextcloud, como hace hoy con las fotos.
- **El modelo** participa cuando Luis abre la sala en local: pulsa «preguntarle al modelo» y la respuesta se escribe en la sala con la firma «modelo» y el nombre del modelo. Su contexto son solo las fichas de la sala.
- **Lo que cuesta:** el formato del archivo de sala, la página de sala, un endpoint `/sala` en `ingest/` con tokens por invitado y escritura append-only, y en el dashboard leer y mostrar salas. **3 a 5 días.**
- **Lo bueno:** usa piezas que ya existen (Railway, Nextcloud, el chat local), deja rastro en markdown y el Mac nunca queda expuesto. **Lo que no:** no es instantáneo, porque la otra persona ve los mensajes nuevos cuando se vuelve a publicar o al recargar la página, si esta los lee del servicio. Y el modelo solo responde con Luis delante.

### Camino 2 — Sala en vivo con un relé

- Lo mismo que el Camino 1, más un **relé** en Railway (WebSocket o SSE) que reparte los mensajes al instante y muestra quién está.
- **El modelo como «trabajador»:** el servidor local del Mac se conecta *hacia fuera* al relé, sin abrir puertos. Cuando alguien en la sala le pregunta al modelo, el relé le pasa la pregunta al Mac, que arma el contexto de la sala, consulta LM Studio y devuelve la respuesta en streaming. Si el Mac está apagado, la sala sigue funcionando y el modelo aparece como «ausente».
- El archivo de la sala sigue siendo la memoria; el relé solo transmite.
- **Lo que cuesta:** el Camino 1, más el relé con reconexión, presencia y orden de mensajes, más el trabajador en el Mac (cola, cancelación, límite de uso por invitado). **2 a 3 semanas.**

### Camino 3 — Abrirle el Mac a la otra persona (rápido, arriesgado)

- Con una red privada como **Tailscale**, la otra persona entra a la misma red que el Mac y abre el dashboard local tal cual. LM Studio también puede servir en la red local.
- **Lo que cuesta:** **un día.** **Pero** la otra persona ve **todo** el archivo y tiene **todos** los botones que escriben: subir, catalogar, constelaciones, publicar. La protección actual de esos endpoints (`ajena()` en `scripts/finder.mjs`) frena a otras webs abiertas en el navegador, no a otra persona que entra a la página. Solo para alguien de total confianza y como prueba corta, no como forma de trabajar.

### Camino 4 — Usar algo que ya existe: Nextcloud Talk

- Nextcloud trae **Talk** (chat y videollamada) y permite **bots** que reciben los mensajes de una conversación por webhook y responden en ella. Un bot «Anarchivo», alojado en Railway o en el Mac, podría responder con el contexto de una sala.
- La conversación vive en Talk, con sus cuentas, sus notificaciones y su app de teléfono; el dashboard solo enlazaría la sala.
- **Lo que cuesta:** **una semana o algo más.** Depende de la versión de Nextcloud y de que el servidor permita instalar bots (hay que comprobarlo en el propio servidor). **Lo bueno:** identidad, notificaciones y videollamada resueltas. **Lo que no:** la conversación queda en la base de datos de Talk, no en el playbook, salvo que se exporte; y la otra persona necesita cuenta (o enlace de invitado) en ese Nextcloud.

### Camino 5 — Co-edición completa

- Mesa compartida en vivo (posiciones, hilos, notas), cursores y chat, con un CRDT (p. ej. Yjs) y un servidor de sincronización.
- Implica rehacer el estado de la Mesa (`mx`, hoy un objeto en el navegador con esquema fijo, que no se toca sin pedirlo), resolver conflictos y decidir qué de la Mesa compartida pasa al playbook.
- **Lo que cuesta:** **uno a dos meses.** Solo tiene sentido si trabajar juntos *sobre la Mesa*, a la vez, es el centro de una colaboración larga.

## 5. Comparación

| | asíncrono | en vivo | el Mac expuesto | rastro en el playbook | el modelo | esfuerzo |
|---|---|---|---|---|---|---|
| 1. Sala por archivo | sí | no | no | sí (`.md`) | local, cuando Luis abre la sala | 3–5 días |
| 2. Sala + relé | sí | sí | no (conexión saliente) | sí | local, si el Mac está encendido | 2–3 semanas |
| 3. Tailscale | — | sí | **sí, todo** | lo de hoy | local | 1 día |
| 4. Nextcloud Talk + bot | sí | sí | no | solo si se exporta | local o nube | ~1 semana |
| 5. Co-edición | sí | sí | no | a decidir | a decidir | 1–2 meses |

En todos los caminos, el trabajo más importante es el mismo y no es de chat: **acotar el contexto** a la sala. Hoy `scripts/chat.mjs` busca en todo el índice; para una sala tiene que buscar **solo** en lo compartido (lista de ids permitidos) y no mandar nunca el «mapa del archivo» completo. Medio día de trabajo, y la condición para cualquiera de los caminos.

## 6. Recomendación

1. **Empezar por el Camino 1**, con la sala como un archivo parecido a una constelación. Es poco trabajo, deja rastro en markdown, no abre el Mac y respeta que el modelo sea local. Probarlo con una persona y un proyecto concreto.
2. Si después hace falta inmediatez, **subir al Camino 2**. El archivo de sala y los tokens sirven tal cual; se añade el relé.
3. Si lo que se quiere es sobre todo **hablar** (con voz, con notificaciones en el teléfono), considerar el **Camino 4**: Talk ya resuelve la parte humana y el bot añade el archivo.
4. **Evitar el Camino 3** salvo como prueba corta con alguien de total confianza.

## 7. Lo que tiene que decidir Luis antes de construir

- **¿Basta con asíncrono?** ¿Es una colaboración de mensajes a lo largo de semanas, o de sesiones de trabajo juntos?
- **¿Qué puede ver la otra persona?** ¿Solo lo que se pone en la sala, o también la obra publicada en general? ¿Las imágenes en tamaño completo?
- **¿Modelo local o en la nube?** Si la otra persona tiene que poder preguntarle al modelo con el Mac apagado, hace falta la nube, y el contenido de la sala sale a un tercero.
- **¿La conversación entra al playbook?** Si sí, en qué carpeta y con qué firma; y es una nueva excepción a «el dashboard no escribe en el playbook». ¿Los aportes de la otra persona se pueden citar como material del Atelier?
- **¿Cómo entra la otra persona?** ¿Enlace con token (sin cuenta, como el teléfono) o cuenta de Nextcloud?
- **¿Cuándo se cierra una sala?** Revocar el token, archivarla y decidir qué queda.

## 8. Riesgos a tener presentes

- **Fugas por el modelo:** aunque la página muestre solo la sala, si el contexto del modelo no está acotado, el modelo puede citar la bitácora. Hay que probarlo con preguntas que intenten sacar lo de fuera.
- **Autoría confundida:** lo que dice el modelo no es de Luis ni de la otra persona; tiene que verse siempre firmado como «modelo», con su nombre.
- **Tokens que se filtran:** un enlace reenviado da acceso a la sala. Conviene un token por persona, que se pueda revocar, y que nunca dé acceso a nada fuera de su sala.
- **Coste y abuso,** si el modelo está en la nube: hace falta un límite por sala.
- **Dos versiones del índice:** la otra persona ve la copia publicada (una foto del último deploy) y Luis la local. Una ficha renombrada o movida puede romper referencias. Por eso la sala debe guardar ids *y* títulos, como hacen hoy las constelaciones con lo que el índice no conoce.

---

*Piezas del código que tocaría cualquier camino: `scripts/chat.mjs` (contexto acotado a una sala), `ingest/server.mjs` (escritura de salas con tokens por invitado), `scripts/sync.mjs` (leer `10-conversaciones/` como nodos), y una página o vista de sala en `src/`.*
