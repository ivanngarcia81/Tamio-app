# Tamio en iPad/iPhone — Fase 0 (preparación del repo)

Estado: el repo ya compila con destino iOS sin romper nada del Mac.
Lo que se hizo y lo que sigue.

## Qué se preparó en esta fase

- **Rust listo para iOS**: el menú nativo de la ventana, sus eventos y el
  ícono del tray son de escritorio y quedaron tras `#[cfg(desktop)]`.
  Los comandos que el frontend invoca (`menu_language`, `tray_balance`)
  existen en iOS como no-op, así el mismo frontend corre en ambos.
- **SQLCipher y Llavero**: rusqlite (bundled-sqlcipher-vendored-openssl) y
  keyring (apple-native) compilan para iOS — la base cifrada y la clave en
  el Llavero funcionan igual que en la Mac.
- **Frontend con base táctil**: `main.tsx` detecta iOS (incluido iPadOS,
  que se disfraza de Mac) y pone la clase `movil` en la raíz; el CSS
  respeta las safe-areas del notch/home indicator, oculta la barra de
  título de macOS, y con `pointer: coarse` los botones crecen a 44pt,
  los inputs usan 16px (evita el zoom automático de iOS) y las acciones
  de hover se muestran siempre.
- **Viewport** con `viewport-fit=cover` y sin zoom de pinza.

## Fase 1 — primeros pasos en tu Mac (requiere Xcode)

```bash
# 1. Instala Xcode desde el App Store (una vez) y ábrelo para que
#    termine su configuración inicial.

# 2. Destinos de Rust para iOS (una vez):
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# 3. Genera el proyecto iOS dentro del repo (una vez):
cd ~/Desktop/tesoreria-mac-
npm run tauri ios init

# 4. Corre en el simulador de iPad:
npm run tauri ios dev
# (elige un simulador de iPad; con "npm run tauri ios dev -- --open"
#  se abre en Xcode para elegir dispositivo)
```

La primera compilación para iOS es larga (compila SQLCipher/OpenSSL para
los destinos móviles). Las siguientes son rápidas.

## Qué evaluar en el simulador (alimenta la Fase 2)

- Sidebar en iPad vertical y en iPhone (probablemente necesite volverse
  un cajón deslizable en pantallas angostas — Fase 2).
- Modales grandes (ServicioModal, NewRecordModal) en pantalla chica.
- Los PDFs: en iOS no hay "abrir en Finder"; revisar exportación con la
  hoja de compartir de iOS (Fase 2).
- Login y sync contra Supabase (deberían funcionar tal cual).

## TestFlight (Fase 2/3)

1. En App Store Connect crea la app con el identifier `com.tesoreria.app`
   (o cámbialo en `tauri.conf.json` antes de `ios init` si prefieres otro).
2. `npm run tauri ios build` genera el .ipa firmado con tu equipo de
   Apple Developer (se configura en Xcode la primera vez).
3. Súbelo con Xcode → Organizer → Distribute → TestFlight e invita a tus
   revisores por correo.
