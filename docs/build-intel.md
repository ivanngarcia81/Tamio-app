# Compilar Tamio para Macs Intel

> Se ejecuta **en tu Mac** (necesita macOS + Xcode). Tus Macs son Apple Silicon,
> pero pueden compilar para Intel (cross-compile). No se puede hacer desde el
> entorno de Claude (Linux).

## Preparación (una sola vez)

Instala los targets de Rust para Intel y para el binario universal:

```bash
rustup target add x86_64-apple-darwin aarch64-apple-darwin
```

## Opción recomendada — DMG Universal (Intel + Apple Silicon en uno)

Un solo `.dmg` que corre **nativo** en Mac Intel y en Mac Apple Silicon. Es lo
mejor para repartir: una sola descarga sirve para todos.

```bash
cd ~/Desktop/tesoreria-mac-
git pull origin claude/hello-9v3atw
npm install
npm run dist:universal
```

Queda en:

```
src-tauri/target/universal-apple-darwin/release/bundle/dmg/Tamio_1.0.0_universal.dmg
```

## Opción — solo Intel

Si prefieres un `.dmg` exclusivamente para Intel:

```bash
cd ~/Desktop/tesoreria-mac-
git pull origin claude/hello-9v3atw
npm install
npm run dist:intel
```

Queda en:

```
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/Tamio_1.0.0_x64.dmg
```

## Notas

- **Sin firma de Apple todavía:** al abrirlo en otra Mac saldrá la advertencia de
  "desarrollador no identificado". Para instalar: **clic derecho sobre la app →
  Abrir → Abrir**. Esto se resuelve cuando saquemos el Apple Developer y
  notaricemos el DMG (ver `docs/apple-firma.md` cuando exista).
- Si el build falla con un `.dmg` montado de una compilación anterior:
  `hdiutil detach /Volumes/Tamio` y `rm -rf src-tauri/target/*/release/bundle`,
  luego reintenta.
- El binario universal pesa más (trae las dos arquitecturas); es normal.
```
