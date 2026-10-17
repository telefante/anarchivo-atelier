# anarchivo-ingest

Servicio de Railway para subir **imágenes** y **artefactos** desde el teléfono sin que el Mac esté encendido.

```
teléfono ──(HTTPS + token)──▶ Railway ──(WebDAV)──▶ Nextcloud ──(sync)──▶ el Mac
```

Escribe lo mismo que el servidor local del dashboard (`scripts/finder.mjs`), con el código compartido de `core.mjs`:
imágenes reducidas a 2000 px y en png (`08-imagenes/`), y artefactos con su carpeta y ficha en blanco
(`02-artefactos/<slug>/`). Nunca pisa un archivo que ya existe. Solo dependencia: `sharp`.

## Puesta en marcha (una vez)

1. **Nextcloud** → Ajustes → Seguridad → «Dispositivos y sesiones» → crear una *contraseña de aplicación*
   (con un usuario que vea la carpeta de tu archivo).
2. **Token**: `openssl rand -hex 24`. Es lo que escribirás una vez en el teléfono.
3. **Railway** → New service desde este repositorio, **Root Directory = `ingest`**. Variables:

   | variable | valor |
   |---|---|
   | `NEXTCLOUD_URL` | la dirección de tu Nextcloud, ej. `https://nube.ejemplo.org` |
   | `NEXTCLOUD_USER` | el usuario de Nextcloud |
   | `NEXTCLOUD_APP_PASSWORD` | la contraseña de aplicación del paso 1 |
   | `NEXTCLOUD_ATELIER_PATH` | la ruta de la carpeta de tu archivo en Nextcloud, ej. `/MiArchivo` |
   | `INGEST_TOKEN` | el token del paso 2 |
   | `ALLOWED_ORIGINS` | dónde está publicada la página, ej. `https://tusitio.org` (varias, separadas por comas) |

   Comprobar: `curl https://<tu-servicio>.up.railway.app/salud` → `{"ok":true}`.
4. **Dashboard**: crear `dashboard/.env` (ignorado por git) con
   `PUBLIC_INGEST_URL=https://<tu-servicio>.up.railway.app` y publicar con «Publicar ↑». Solo entonces aparecen
   «Subir imagen» y «+ Artefacto» en la versión publicada. La primera subida pide el token y lo recuerda.

## Qué esperar

La página publicada es una foto del índice del último deploy: lo subido llega a Nextcloud al instante, pero aparece
en Anarchivo cuando el Mac sincroniza, corre `sync` y se vuelve a publicar.

## Probar en local

```
NEXTCLOUD_URL=… NEXTCLOUD_USER=… NEXTCLOUD_APP_PASSWORD=… INGEST_TOKEN=… npm start   # (dentro de ingest/, tras npm i)
```
