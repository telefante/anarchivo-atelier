#!/bin/bash
# Build el dashboard Astro y rsync a una subcarpeta de tu hosting (p. ej. tusitio.org/anarchivo/),
# sin tocar el resto del sitio.
#
# El dashboard es privado: lee bitácora, notas de proyecto y datos personales.
# La subcarpeta va protegida con Basic Auth (.htaccess + .htpasswd) — configúralo
# una vez con `scripts/setup-auth.sh` ANTES de correr esto la primera vez.
# Este script nunca toca /.htaccess ni /.htpasswd remotos (--exclude), así
# que no hace falta repetir setup-auth.sh en cada deploy.
set -e
set -u

cd "$(dirname "$0")/.."

# destino y subcarpeta: «Ajustes» → Publicar (anarchivo.config.json); REMOTE_BASE y ATELIER_BASE, si están, mandan
AJ_DESTINO="$(node -e "import('./scripts/config.mjs').then(m=>process.stdout.write(m.cargar().publicar.destino))")"
AJ_BASE="$(node -e "import('./scripts/config.mjs').then(m=>process.stdout.write(m.cargar().publicar.base))")"
REMOTE_BASE="${REMOTE_BASE:-$AJ_DESTINO}"
ATELIER_BASE="${ATELIER_BASE:-$AJ_BASE}"
if [ -z "$REMOTE_BASE" ]; then
    echo "✗ No hay destino de publicación. Ponlo en «Ajustes» → Publicar (usuario@servidor:/ruta/del/sitio),"
    echo "  o pásalo como REMOTE_BASE=… scripts/deploy.sh"
    exit 1
fi
# la subcarpeta del servidor es la misma que la base del sitio, sin barras: /anarchivo/ → anarchivo
SUB="$(echo "$ATELIER_BASE" | sed 's#^/##; s#/$##')"
REMOTE_PATH="$REMOTE_BASE/$SUB"

echo "Sincronizando datos del playbook..."
node scripts/sync.mjs

echo "Construyendo el dashboard (base ${ATELIER_BASE})..."
NODE_ENV=production ATELIER_BASE="$ATELIER_BASE" npx astro build

echo "Verificando el directorio dist..."
if [ ! -d "dist" ] || [ -z "$(ls -A dist 2>/dev/null)" ]; then
    echo "✗ Error: dist no fue creado o está vacío."
    exit 1
fi
echo "✓ dist verificado."

echo "¿El destino ya tiene .htaccess/.htpasswd? Este deploy NO los toca."
echo "  (si es la primera vez: Ctrl+C y corré antes scripts/setup-auth.sh)"
echo ""
echo "Sincronizando con ${REMOTE_PATH}/ ..."
rsync -avz --progress --delete \
    --exclude='/.htaccess' \
    --exclude='/.htpasswd' \
    dist/ "$REMOTE_PATH/"

echo ""
echo "🎉 Listo."
# si la carpeta del sitio se llama como su dominio (…/tusitio.org), la dirección se puede adivinar
SITIO="$(basename "${REMOTE_BASE#*:}")"
case "$SITIO" in
    *.*) echo "🌐 https://${SITIO}/${SUB}/anarchivo/" ;;
    *)   echo "🌐 <tu sitio>/${SUB}/anarchivo/" ;;
esac
echo "   (pide usuario/contraseña — configurados con setup-auth.sh)"
