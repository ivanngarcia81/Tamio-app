#!/usr/bin/env bash
# Firma y notariza Tamio EN DOS PASOS controlados por nosotros.
#
# Por qué existe: el firmado interno de Tauri falla con
#   "resource fork, Finder information, or similar detritus not allowed"
# porque Tauri le pega un com.apple.FinderInfo a Tamio.app al ponerle el ícono,
# justo antes de firmar, y no hay forma de limpiarlo entre medias. Aquí:
#   1) construimos la app SIN firmar,
#   2) limpiamos sus atributos extendidos,
#   3) la firmamos nosotros (hardened runtime + entitlements),
#   4) armamos el .dmg, lo firmamos, lo notarizamos y le pegamos el sello.
#
# Uso:   npm run firmar:manual
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.firma ]; then
  echo "✖  Falta .env.firma (cópialo de .env.firma.example). Ver docs/firma-apple.md"
  exit 1
fi
set -a; # shellcheck disable=SC1091
source .env.firma; set +a

for v in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!v:-}" ]; then echo "✖  Falta $v en .env.firma"; exit 1; fi
done

TARGET="universal-apple-darwin"
APP="src-tauri/target/$TARGET/release/bundle/macos/Tamio.app"
ENT="scripts/entitlements.plist"
DMG_DIR="src-tauri/target/$TARGET/release/bundle/dmg"
DMG="$DMG_DIR/Tamio_universal.dmg"

echo "▸  [1/5] Construyendo la app SIN firmar (Tauri no firma si no hay identidad)…"
rm -rf "src-tauri/target/$TARGET/release/bundle"
# Se QUITAN (no se vacían) las variables de firma/notarización para que Tauri
# no intente firmar ni notarizar en este paso; lo haremos nosotros después.
env -u APPLE_SIGNING_IDENTITY -u APPLE_ID -u APPLE_PASSWORD -u APPLE_TEAM_ID \
  npx tauri build --bundles app --target "$TARGET"

if [ ! -d "$APP" ]; then echo "✖  No se encontró $APP"; exit 1; fi

echo "▸  [2/5] Firmando la app (hardened runtime + entitlements)…"
# CLAVE: macOS (LaunchServices) le re-estampa com.apple.FinderInfo a CUALQUIER
# carpeta que termine en .app (la marca como aplicación), y codesign rechaza
# ese atributo. Por eso limpiar antes no basta: reaparece.
# Solución: renombrar la carpeta FUERA de .app mientras se firma (así no la
# re-estampa), limpiar y firmar, y renombrar de vuelta. El nombre real de la
# app lo da el Info.plist, no la carpeta, así que la firma es correcta. El
# FinderInfo que macOS re-agregue después NO invalida la firma (no está sellado).
SIGNDIR="$(dirname "$APP")/Tamio_firmando"
rm -rf "$SIGNDIR"
mv "$APP" "$SIGNDIR"
xattr -cr "$SIGNDIR" 2>/dev/null || true
codesign --force --deep --options runtime --timestamp \
  --entitlements "$ENT" \
  --sign "$APPLE_SIGNING_IDENTITY" "$SIGNDIR"
mv "$SIGNDIR" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "   Firma verificada."

echo "▸  [3/4] Armando el .dmg…"
mkdir -p "$DMG_DIR"
rm -f "$DMG"
STAGING="$(mktemp -d)"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
xattr -cr "$STAGING" || true
hdiutil create -volname "Tamio" -srcfolder "$STAGING" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGING"
codesign --force --timestamp --sign "$APPLE_SIGNING_IDENTITY" "$DMG"

echo "▸  [4/4] Notarizando con Apple (esto tarda 2–15 min, espera)…"
xcrun notarytool submit "$DMG" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
echo "   Pegando el sello de notarización (staple)…"
xcrun stapler staple "$DMG"

echo
echo "✔  LISTO. El .dmg firmado y notarizado está en:"
echo "   $DMG"
echo
echo "   Compruébalo con:"
echo "     spctl -a -vvv -t open --context context:primary-signature \"$DMG\""
