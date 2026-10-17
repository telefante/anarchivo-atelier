# Anarchivo — versión de escritorio

Anarchivo como app de macOS (Electron). No es una copia ni otra versión del dashboard: es una ventana propia sobre el **mismo servidor local** de `npm run dev`, así que tiene todo lo que solo existe en local — Conversar, Subir, Catalogar, Mostrar en Finder, Publicar ↑ — y siempre usa el código y el playbook al día.

## Cómo arranca

1. Si ya hay un `npm run dev` corriendo en `localhost:4321`, lo usa tal cual (y no lo apaga al salir).
2. Si no, busca la carpeta `dashboard/` (variable `ANARCHIVO_DASHBOARD`, la elegida antes, la anotada al empaquetar, o la carpeta de al lado), corre `scripts/sync.mjs` y levanta `astro dev` en un puerto libre desde 4322. Mientras tanto muestra una pantalla de espera con lo que va pasando. Al salir, apaga ese servidor.
3. Usa el `node` de tu terminal (lo pregunta a tu shell de login, así encuentra nvm o Homebrew); si no hay, el propio Electron hace de node. Del mismo shell toma el `PATH`, para que `exiftool`, `rsync` y `ssh` (Publicar) sigan funcionando.

La primera vez el sync calcula la semejanza CLIP de todas las imágenes (~1 min); después va rápido. Menú **Anarchivo → Arrancar sin sincronizar** lo salta.

## Uso

```
cd dashboard/desktop
npm install          # una vez: Electron y el empaquetador, solo aquí (no toca las dependencias de dashboard/)
npm start            # abrir en modo desarrollo
npm run app          # armar out/Anarchivo-darwin-arm64/Anarchivo.app
npm run app -- --instalar   # …y copiarla a ~/Applications
npm run icono        # regenerar build/icono.png e icono.icns desde build/icono.svg
```

La `.app` no lleva el dashboard dentro (pesa lo que pesa Electron, ~290 MB): anota dónde está `dashboard/`. Si la carpeta se mueve, la app pregunta; también desde **Anarchivo → Elegir la carpeta dashboard/…**.

## La ventana

- Sin barra de título: el semáforo queda dentro, y una franja de 22 px arriba sirve para arrastrar la ventana.
- Recuerda tamaño y posición (`~/Library/Application Support/Anarchivo/anarchivo.json`, junto con la carpeta elegida).
- Los enlaces de fuera (tu web, Nextcloud…) se abren en el navegador o en su app; lo del servidor, en la ventana.
- Menú **Ir**: Anarchivo (⌘1), Resumen (⌘2), Bitácora (⌘3), Atrás (⌘[). **Anarchivo → Sincronizar el archivo** (⌘⇧S) regenera el índice y recarga.
- **Anarchivo → Ajustes…** (⌘,) abre el panel de ajustes del dashboard. **Anarchivo → Reiniciar el servidor** relanza la app con su servidor: hace falta después de cambiar en Ajustes la carpeta del archivo o los nombres de carpetas. (Si la app está usando un `npm run dev` de la terminal, ese hay que reiniciarlo allí.)

## Icono

`build/icono.svg`: tres áreas de concepto que se solapan, como en el grafo, y un hilo bermellón (`#DA3A16`) entre obras, sobre el gris oscuro del dashboard. `npm run icono` lo pasa a png e icns con el `sharp` de `dashboard/` y `iconutil`.

## Archivos

```
main.cjs            proceso principal: encontrar o levantar el servidor, la ventana, el menú
espera.html         pantalla de espera mientras sincroniza y arranca
build/icono.svg     el icono (fuente) → icono.png, icono.icns
build/icono.mjs     genera el icono
build/empaquetar.mjs  arma la .app con @electron/packager
```

Para probar que arranque su propio servidor aunque haya un `npm run dev` abierto: `ANARCHIVO_PROPIO=1 npm start`.
