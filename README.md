# Tamio

Software de administración para iglesias: reúne la **tesorería** y la
**secretaría** en una sola app, en **Mac, iPad y iPhone**.

🌐 [tamio.church](https://tamio.church)

## Qué hace

**Tesorería** — ingresos y gastos con folio y rastro de auditoría, depósitos
bancarios, movimientos recurrentes mensuales, y reportes financieros en PDF
listos para imprimir y firmar.

**Secretaría** — directorio y ficha de miembros, actas de reuniones, cartas
oficiales y traslados entre iglesias, registro de asistencia, agenda e informes
de membresía en PDF.

**En toda la app** — acceso por roles (administrador, tesorero, secretaria),
funcionamiento **sin conexión**, y datos guardados en una base **cifrada**
(SQLCipher) en el propio dispositivo. Disponible en español e inglés.

## Cómo está hecho

**Tauri 2 · React 19 · TypeScript · SQLite cifrado con SQLCipher.** Una sola base
de código para las tres plataformas; la clave de cifrado vive en el Llavero de
macOS.

## Desarrollo

```bash
npm install
npm run dev          # web en el navegador
npm run tauri dev    # app de escritorio
```

Verificar antes de cada commit:

```bash
npx tsc --noEmit && npm run build
```

Compilar para distribuir:

```bash
npm run dist                                                   # .dmg de macOS
npm run tauri ios build -- --export-method app-store-connect   # .ipa
```

## Documentación

- [`PROJECT_STATUS.md`](./PROJECT_STATUS.md) — estado actual, mapa del código y
  reglas de trabajo. **Empieza por aquí.**
- [`docs/ideas-futuras.md`](./docs/ideas-futuras.md) — hoja de ruta y hallazgos
  pendientes.
- [`docs/`](./docs) — distribución, privacidad, sincronización y notas de producto.

---

© 2026 Tamio
