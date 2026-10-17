#!/bin/bash
# Configura la contraseña de la subcarpeta publicada (p. ej. tusitio.org/anarchivo/).
# Corré esto UNA VEZ antes del primer deploy.sh, y de nuevo solo si querés
# cambiar el usuario/contraseña. No pisa nada del deploy normal (deploy.sh
# excluye /.htaccess y /.htpasswd de su rsync).
#
# El .htpasswd queda FUERA del webroot (en la carpeta que contiene la del sitio),
# nunca dentro de la subcarpeta — así no es descargable aunque falle la config
# de Apache. El .htaccess de la subcarpeta solo referencia esa ruta absoluta.
#
# Destino y subcarpeta: los mismos que deploy.sh («Ajustes» → Publicar, o REMOTE_BASE / ATELIER_BASE).
set -e
set -u

cd "$(dirname "$0")/.."

AJ_DESTINO="$(node -e "import('./scripts/config.mjs').then(m=>process.stdout.write(m.cargar().publicar.destino))")"
AJ_BASE="$(node -e "import('./scripts/config.mjs').then(m=>process.stdout.write(m.cargar().publicar.base))")"
REMOTE_BASE="${REMOTE_BASE:-$AJ_DESTINO}"
ATELIER_BASE="${ATELIER_BASE:-$AJ_BASE}"
case "$REMOTE_BASE" in
    *:/*) ;;
    *) echo "✗ El destino tiene que ser usuario@servidor:/ruta/del/sitio («Ajustes» → Publicar, o REMOTE_BASE)."; exit 1 ;;
esac
SUB="$(echo "$ATELIER_BASE" | sed 's#^/##; s#/$##')"
REMOTE_HOST="${REMOTE_BASE%%:*}"
REMOTE_SITE="${REMOTE_BASE#*:}"
REMOTE_ROOT="$(dirname "$REMOTE_SITE")"
REMOTE_ATELIER="$REMOTE_SITE/$SUB"
HTPASSWD_REMOTE_PATH="$REMOTE_ROOT/secure-$SUB.htpasswd"

read -rp "Usuario para /$SUB/: " AUTH_USER
if command -v htpasswd >/dev/null 2>&1; then
    TMP_HTPASSWD="$(mktemp)"
    htpasswd -c "$TMP_HTPASSWD" "$AUTH_USER"
else
    echo "htpasswd no está instalado — genero el hash con openssl (pedirá la contraseña dos veces)."
    read -rsp "Contraseña: " AUTH_PASS; echo
    read -rsp "Repetí la contraseña: " AUTH_PASS2; echo
    if [ "$AUTH_PASS" != "$AUTH_PASS2" ]; then
        echo "✗ No coinciden."; exit 1
    fi
    TMP_HTPASSWD="$(mktemp)"
    echo "${AUTH_USER}:$(openssl passwd -apr1 "$AUTH_PASS")" > "$TMP_HTPASSWD"
    unset AUTH_PASS AUTH_PASS2
fi

echo "Subiendo .htpasswd fuera del webroot..."
scp "$TMP_HTPASSWD" "${REMOTE_HOST}:${HTPASSWD_REMOTE_PATH}"
rm -f "$TMP_HTPASSWD"

echo "Creando carpeta /$SUB/ y subiendo .htaccess..."
ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_ATELIER'"
HTACCESS="$(mktemp)"
cat > "$HTACCESS" <<EOF
AuthType Basic
AuthName "Anarchivo — privado"
AuthUserFile ${HTPASSWD_REMOTE_PATH}
Require valid-user
EOF
scp "$HTACCESS" "${REMOTE_HOST}:${REMOTE_ATELIER}/.htaccess"
rm -f "$HTACCESS"

echo ""
echo "✓ /$SUB/ queda protegido con usuario/contraseña."
echo "  Ahora sí: scripts/deploy.sh"
