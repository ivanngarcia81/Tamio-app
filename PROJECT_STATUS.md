# Tamio — Estado del proyecto

App de administración para iglesias: **tesorería** (ingresos, gastos, depósitos,
reportes) y **secretaría** (membresía, actas, cartas, traslados, asistencia,
agenda). Corre en **macOS, iPad y iPhone** desde una sola base de código.

**Tauri 2 + React 19 + TypeScript.** Base de datos local **cifrada con SQLCipher**
(`rusqlite`), con la clave guardada en el **Llavero de macOS** (`keyring`).
Bilingüe ES/EN con paridad de claves verificada por el compilador.

> El identificador interno es `com.tesoreria.app` **a propósito**: de él depende
> la carpeta de datos de cada instalación existente. **No cambiarlo nunca.**

_Última actualización: 18 de agosto de 2026 · versión 1.0.8_

---

## Dónde está el proyecto ahora

- **Tamio 1.0 publicada** en la App Store el 13 de agosto de 2026.
- La 1.0 salió **gratis y 100% local**: sin login, sin nube, sin compras.
  Dos interruptores lo controlaban:
  - `LOGIN_HABILITADO` en `src/supabase.ts`
  - `SYNC_HABILITADO` en `src/syncManager.ts`
  La 1.1 los encendió (rama `centavos` fundida en `main`). Sin credenciales
  de Supabase en el `.env`, la app sigue funcionando 100% local igual.
- La suscripción ($23.99/mes por iglesia) llega con la 1.1, vía Lemon Squeezy
  — ver `docs/planes.md` y `docs/guia-lemon-squeezy.md`.

**Qué leer antes de tocar nada:**
- [`docs/ideas-futuras.md`](./docs/ideas-futuras.md) — hoja de ruta, **el
  bloqueante del banner de actualizaciones**, y los hallazgos de la auditoría del
  1 de agosto (con lo que resultó falso).
- [`docs/checklist-app-store.md`](./docs/checklist-app-store.md) — qué se declaró
  a Apple en el envío.

---

## Pendiente de verificar en la Mac

Anotado el 18 de agosto de 2026. La versión de escritorio se rediseñó entera
(tres paquetes: base, Ajustes y pantallas de datos) y todo se verificó con
arneses de Playwright, midiendo, **pero nada se ha abierto todavía en una Mac
ni en un iPhone reales**. Esta lista es lo que hay que comprobar cuando se
pueda, en orden de mayor a menor riesgo.

**Antes de nada — qué compilación estás mirando.** Ajustes → Zona sensible
muestra "Compilación del AAAA-MM-DD HH:MM UTC" (el sello de `vite.config.ts`).
Si esa fecha no es de hace un rato, lo que corre es un bundle viejo y cualquier
otra conclusión sobra.

En el iPhone, `devUrl` es `http://localhost:1420` y ahí `localhost` es el
PROPIO teléfono, no la Mac: sin `TAURI_DEV_HOST` el aparato no alcanza el
servidor y se queda con los assets embebidos la última vez que se instaló, sin
dar ningún error. Por eso el comando de desarrollo en un iPhone físico es
`npm run tauri -- ios dev --host`, con la Mac y el teléfono en la misma red.

1. **Los filtros filtran lo mismo que antes.** Es lo único que los arneses no
   pudieron comprobar: preservé estados, setters y condiciones —no se tocó una
   sola línea de `pasaFiltros` ni ninguna consulta— pero eso se prueba con
   datos. Probar Agenda con tipo + estado + rango de fechas a la vez, y los
   cuatro filtros de Informes de membresía.
2. **`AccentColor`.** El acento del sistema se lee con `@supports (color:
   AccentColor)`, que Chromium no soporta, así que los arneses solo ejercitaron
   la rama de repuesto (`--brand`). En WKWebView debería tomar el acento
   elegido en Ajustes del sistema: cambiarlo ahí y ver si el sidebar y las
   pestañas de Ajustes cambian con él.
3. **Arrastrar la ventana desde la toolbar.** `data-tauri-drag-region` está en
   las quince cabeceras (siempre condicionado con `esMac()`), pero el arrastre
   real no se puede probar en un navegador.
4. **Categorías editables** (Ajustes → Categorías): renombrar con doble clic,
   cambiar color desde la fila y el pie "+ / −". La lógica se probó contra un
   `db` simulado; falta contra la base real.
5. **El visor de PDF en iPhone.** Sigue sin diagnosticar por qué fallaba
   (`docs/` no lo recoge; el aviso amarillo era su síntoma). Hay una vuelta
   atrás que comparte el archivo directamente si el visor no carga, así que no
   deja al usuario sin PDF, pero la causa está pendiente: leer el error real
   con el Inspector Web de Safari conectado al teléfono.
6. **Ventanas de Mac entre 601 y 1023 px.** Ese rango era del iPad y ahora
   tiene su propia regla para escritorio; conviene abrir la ventana estrecha y
   ver que el sidebar sigue siendo una columna y no aparece la hamburguesa.

### Y la tienda, ahora que está encendida (18 ago 2026)

Lo de arriba es del rediseño; esto es del punto 3 de la 1.1. Detalle completo
en `docs/plan-1-1.md` → *Punto 3: la tienda encendida*.

7. **Recompilar con `VITE_URL_COMPRA`.** Es lo primero, porque sin ello no hay
   nada que mirar: el enlace se lee al COMPILAR (`src/plan.ts:37`), así que un
   build viejo no enseña "Comprar" ni "Renovar" aunque el `.env` esté puesto.
   El valor real ya está en `.env.example`. Se comprueba en la app: la tarjeta
   de plan (Ajustes) y el banner de suscripción deben mostrar el botón.
8. **El registro de entregas de Lemon Squeezy.** Buscar un
   `subscription_created` con respuesta **200**. Un **500** significa que falta
   `LEMON_WEBHOOK_SECRET` en Supabase (`pago-webhook/index.ts:134`), y ese es
   el caso feo: al comprador se le cobra y a la iglesia no se le activa el
   plan. Se arregla con `supabase secrets set LEMON_WEBHOOK_SECRET=...`.
9. **tamio.church, con Pages ya republicado.** Que se vea la sección *Download
   Tamio*, que el botón baje el `.dmg` y que el enlace de la App Store abra la
   ficha (`id6794741319`). No se pudieron abrir desde aquí: el proxy de salida
   bloquea tamio.church, lemonsqueezy.com y apps.apple.com.
10. **Una compra real de punta a punta**, cuando quieras cerrar el círculo:
    pagar, recibir el correo, instalar el `.dmg`, entrar con ese mismo correo y
    ver el plan activo con su vencimiento en Ajustes.

### Y la hoja de Nuevo ingreso/gasto (ramas `coma-decimal` y `hoja-nuevo-movimiento`)

11. **En un iPhone real, antes de fundir `hoja-nuevo-movimiento`:** que el
    teclado numérico salga al abrir (con el separador decimal del país del
    aparato), que la fecha y la hora abran la rueda nativa, que el tirador y
    la hoja se sientan de iOS, y que "1,50"/"1.50" —según la región— guarde
    $1.50 y no $150. Lo del arnés está medido; el teclado y la rueda son
    justo lo que un navegador no puede enseñar.
12. **En la Mac, tras fundir `coma-decimal`:** el modal debe verse idéntico a
    antes salvo el marcador del importe, que ahora sigue la región del
    sistema ("$0,00" en una Mac en español de España).

Además, lo que quedó explícitamente fuera y sigue pendiente de decisión:

- El pie **"+ / −" de la tabla de usuarios** (Ajustes → Acceso y áreas). Pide
  reestructurar `UsersSettings`, no re-vestirlo.
- **Vibrancy del sidebar** en Mac. El propio paquete lo marca como opcional y
  último; toca `tauri.conf.json` y quizá una dependencia, así que no se hace
  sin consultarlo.
- En Categorías, el **tipo solo se elige al crear**. La hoja de iPhone permite
  cambiarlo mientras no haya movimientos; se dejó más estricto a propósito.

---

## Mapa del código

- `src/db.ts` — toda la capa de datos. Único lugar a tocar para consultas.
- `src/App.tsx` — shell: rutas, sidebar, modal global, tema, puerta de login.
- `src/pages/` — Dashboard, Movimientos, Miembros, Depósitos, Bandeja, Reportes,
  Membresía, Actas, Servicios, Cartas, Agenda, Mensajes, Configuración.
- `src/components/` — tablas, modales, ajustes, skeletons, paginación.
- `src/services/print/` — motor de PDF (jsPDF nativo). Tema centralizado en
  `printUtils.ts`; ningún reporte fija tamaños por su cuenta. **No se usa
  `window.print()` a propósito.**
- `src/styles.css` — tokens de tipografía (`--fs-*`), color, sombras y layout.
  Punto de corte compacto (iPhone): `@media (max-width: 760px)`.
- `src/i18n/` — `es.ts` es la fuente; `en.ts` usa tipo espejo.
- `src-tauri/src/lib.rs` — migraciones SQL. **Van por la v37** (36 = centavos,
  37 = EIN/estado/código postal de la iglesia).
  Regla: NUNCA reusar un número; siempre agregar al final.
- `src-tauri/src/motordb.rs` — apertura de la base y `PRAGMA key` (SQLCipher).
- `supabase/functions/` — `pago-webhook` y `borrar-cuenta`.

---

## Reglas de trabajo

- Verificar con `npx tsc --noEmit` **y** `npm run build` antes de cada commit.
- **Mac e iPad ya funcionan bien.** Los ajustes de iPhone van detrás del
  breakpoint compacto; si un arreglo exige tocar código compartido, consultarlo
  antes.
- Commits y UI en español; nombres de código en español donde ya lo están.
- No introducir dependencias sin necesidad clara.
- El `.env` no se sube (solo `.env.example`). El repo es público: nada de claves.

## Compilar

```bash
npm run dist                                            # .dmg de macOS
npm run tauri ios build -- --export-method app-store-connect   # .ipa
```
