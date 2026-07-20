#!/usr/bin/env bash
# Construye Tamio para macOS firmado y notarizado por Apple.
#
# Requisitos (una sola vez): ver docs/firma-apple.md
#   - Cuenta Apple Developer activa.
#   - Certificado "Developer ID Application" instalado en el Llavero.
#   - Archivo .env.firma con tus credenciales (copiado de .env.firma.example).
#
# Uso:   npm run firmar
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.firma ]; then
  echo "✖  Falta el archivo .env.firma"
  echo "   Cópialo de la plantilla y rellena tus datos:"
  echo "     cp .env.firma.example .env.firma"
  echo "   Guía completa: docs/firma-apple.md"
  exit 1
fi

# Carga las credenciales (APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID).
set -a
# shellcheck disable=SC1091
source .env.firma
set +a

falta=""
for v in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!v:-}" ]; then falta="$falta $v"; fi
done
if [ -n "$falta" ]; then
  echo "✖  Faltan variables en .env.firma:$falta"
  exit 1
fi

echo "▸  Firmando como: $APPLE_SIGNING_IDENTITY"
echo "▸  Notarizando con Apple ID: $APPLE_ID (equipo $APPLE_TEAM_ID)"
echo "▸  Construyendo .dmg universal (Intel + Apple Silicon)…"
echo

# macOS pega "atributos extendidos" (resource forks / Finder info) a los
# archivos al copiarlos o descargarlos, y codesign los rechaza con
# "resource fork, Finder information, or similar detritus not allowed".
# Se limpian los assets que entran al bundle y se borra cualquier bundle
# previo a medio firmar, para que la firma parta limpia.
echo "▸  Limpiando atributos extendidos (evita el error de 'detritus')…"
# Limpia TODO el proyecto menos node_modules (que no entra al bundle). Cubre
# src, public, icons, capabilities, Info.plist y los artefactos ya compilados.
find . -path ./node_modules -prune -o -print0 2>/dev/null | xargs -0 xattr -c 2>/dev/null || true
# Borra el bundle previo (puede traer FinderInfo de un vistazo en Finder) para
# que la app se reensamble limpia.
rm -rf src-tauri/target/universal-apple-darwin/release/bundle 2>/dev/null || true
rm -rf src-tauri/target/release/bundle 2>/dev/null || true

# Tauri firma con APPLE_SIGNING_IDENTITY y notariza con APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID.
npm run dist:universal

echo
echo "✔  Listo. El .dmg firmado y notarizado está en:"
echo "   src-tauri/target/universal-apple-darwin/release/bundle/dmg/"
echo
echo "   Verifica la firma con:"
echo "     spctl -a -vvv -t install \"src-tauri/target/universal-apple-darwin/release/bundle/macos/Tamio.app\""
