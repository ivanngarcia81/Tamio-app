#!/usr/bin/env bash
# Prepara un entorno Linux (contenedor de Claude Code en la nube, CI, etc.)
# para poder COMPROBAR el Rust de Tamio sin una Mac delante.
#
# Por qué existe:
#   Tamio es una app de Tauri, y `cargo check` en Linux falla antes de empezar
#   porque el crate `gdk-sys` busca las cabeceras de GTK con pkg-config. El
#   error ("The system library `gdk-3.0` required by crate `gdk-sys` was not
#   found") parece de configuración de Rust y en realidad son paquetes del
#   sistema que faltan.
#
#   Sin esto, el Rust se escribe a ciegas y el primer compilador de verdad es
#   la Mac del usuario. Los errores de tipos aparecen a los diez minutos de
#   `npm run tauri build`, en otra máquina y con otra persona delante. Con
#   esto, salen en dos minutos y aquí mismo.
#
# Uso:  bash scripts/preparar-nube.sh
#
# El contenedor es efímero: hay que correrlo una vez por sesión.

set -euo pipefail

echo "▸  Instalando las librerías de sistema que necesita Tauri…"
apt-get update -qq
apt-get install -y --no-install-recommends \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev

echo
echo "▸  Comprobando que el Rust compila…"
cd "$(dirname "$0")/../src-tauri"
cargo check

cat <<'FIN'

✔  Listo. A partir de aquí, `cargo check` dentro de src-tauri/ valida el Rust.

⚠️  LO QUE ESTO **NO** COMPRUEBA

    Todo lo que está detrás de `#[cfg(target_os = "macos")]` o `#[cfg(desktop)]`
    (once bloques en lib.rs) no se compila en Linux. En concreto:

      · ruta_bundle()            — resolver el .app que contiene al ejecutable
      · la rama de macOS de restaurar_reiniciar()  — el relanzamiento con `open`
      · el menú nativo, el icono de la barra y la vibrancy

    Esos siguen necesitando una compilación en la Mac. Todo lo demás —el
    escritor y lector de ZIP, la restauración, los comandos de comprobantes,
    el respaldo— sí queda verificado aquí.
FIN
