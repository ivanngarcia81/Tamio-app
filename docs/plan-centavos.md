# Plan de 4.2 — pasar el dinero a centavos enteros

**Estado (11 ago 2026): EN CURSO, en la rama `centavos`. `main` sin tocar.**

| Paso | Estado |
|---|---|
| 0. Rama propia | ✅ `centavos` |
| 1. `src/dinero.ts` y el tipo `Centavos` | ✅ 38 comprobaciones (`npm run verificar-dinero`) |
| 2. Las funciones de formato reciben `Centavos` | ✅ 112 errores = la lista de tareas del paso 4 |
| 3. La migración de la base | ✅ migración **36** (`npm run verificar-migracion-36`) |
| 4. Las fronteras y la aritmética | ✅ 112 → 0 errores; compila, `cargo check` y build en verde |
| 5. Pruebas antes de fundir | ✅ las cinco automatizadas · ⏳ falta la vuelta en la Mac |
| 6. Respaldo automático antes de migrar | ✅ `motordb::respaldo_antes_de_migrar` (`cd harness-db && cargo run`) |

**Comprobado al cerrar el paso 4:** no queda ni una división entre 100 fuera de
`src/dinero.ts` en todo `src/`. Esa es la invariante de la que depende todo lo
demás, y desde el paso 5 hay una prueba que se pone roja si alguien la rompe.

### Las pruebas — `npm run verificar-centavos`

Ese comando ejecuta las cinco de una vez. **No dependen de `node_modules`:**
solo usan `node:sqlite` y `src/dinero.ts`, así que corren en un clon recién
hecho sin instalar nada.

| Prueba del paso 5 | Dónde vive |
|---|---|
| 1. Respaldo de antes, restaurado después | `scripts/verificar-respaldo.mjs` |
| 2. CSV de la versión vieja | `scripts/verificar-csv-centavos.ts` |
| 3. `0.01`, `1.15` y `999999.99` | `scripts/verificar-estado-financiero.ts` |
| 4. El total cuadra con la suma de sus líneas | `scripts/verificar-estado-financiero.ts` |
| 5. Pantalla y PDF, la misma cifra | `scripts/verificar-estado-financiero.ts` |
| — la migración en sí | `scripts/verificar-migracion-36.mjs` |
| — `dinero.ts`, operación por operación | `scripts/verificar-dinero.ts` |

Las tres pruebas que leen SQL o código **lo extraen del archivo de verdad**
(`lib.rs`, `db.ts`) en vez de copiarlo. Una copia se habría desviado en
silencio el día que alguien edite el original, que es la peor forma de tener una
prueba: verde y sin mirar nada.

**Lo que las pruebas automáticas NO cubren, y por qué.** El respaldo real es un
ZIP con la base cifrada con SQLCipher más la carpeta de documentos, y el
recorrido entero —hacer el ZIP, restaurarlo, reiniciar, fusionar los
documentos— solo existe dentro de la app. Lo automatizado es la parte por donde
se pierde dinero: que la migración conserve el total, que restaurar una base sin
migrar dé la misma cifra que la que nunca se restauró, y que la 36 **no pueda
aplicarse dos veces** (aplicarla dos veces no daría ningún error: multiplicaría
el libro entero por 100). La vuelta con la app abierta hay que darla en la Mac.

**Lo que queda para fundir en `main`:** la vuelta en la Mac del paso 5, y que
Apple apruebe la 1.0.

> 🔴 **Antes de abrir un build de esta rama en la Mac:** la migración corre sola
> al arrancar. Desde el paso 6 la app se hace una copia sola justo antes, pero
> ese archivo vive en la misma carpeta y está cifrado con la clave de esa Mac.
> Hazte además el respaldo de Ajustes y guárdalo fuera: es el único que se puede
> abrir en otro equipo.

---

## 1. El problema, y de qué tamaño es de verdad

Hoy el dinero se guarda como número con decimales (`REAL` en SQLite, `number` en
JavaScript). Un `REAL` es coma flotante de doble precisión, y en coma flotante
hay cifras decimales corrientes que no se pueden representar exactas: `0.1` se
guarda como algo un pelo distinto de una décima. Por eso `0.1 + 0.2` da
`0.30000000000000004` y no `0.3`.

En una app de tesorería eso se manifiesta así:

- **Los totales pueden desviarse un centavo.** No en 3 movimientos: en cientos o
  miles, sumados con `SUM(monto)`, el error se acumula. Un estado financiero
  cuyo total no cuadra con la suma de sus líneas es un estado financiero que el
  concilio devuelve.
- **Los porcentajes de los reportes se calculan sobre esos totales.** Si el
  total deriva, las tartas de categorías dejan de sumar 100 %.
- **Las comparaciones fallan de forma invisible.** `if (a === b)` entre dos
  importes que "deberían" ser iguales puede dar falso. Hoy esto afecta al aviso
  de depósito que excede el efectivo disponible y a la detección de duplicados.

Lo que **no** es: no es un fallo que esté rompiendo la app hoy con los datos de
prueba. Es un fallo que aparece cuando hay volumen real y que, cuando aparece,
es carísimo de diagnosticar porque no hay error, solo un número que no cuadra.

La solución estándar en cualquier software contable es guardar **centavos como
número entero**: 125.50 se guarda como `12550`. Los enteros no derivan. Se
divide entre 100 únicamente en el último paso, al mostrar o imprimir.

## 2. Por qué se hace DESPUÉS de que Apple apruebe la 1.0

No es por miedo a corromper datos durante la revisión: la migración solo corre
en un build que alguien instale, y mientras la 1.0 está en revisión no le pasa
nada a los datos de nadie.

**El motivo real es otro: si Apple rechaza y hay que mandar un arreglo urgente,
no se quiere tener `main` a medio migrar la base.** Un rechazo obliga a corregir
algo pequeño y volver a subir el mismo día; con la migración a medias, `main` no
está en condiciones de generar un build. Por eso este trabajo va en su propia
rama y no se funde hasta que la 1.0 esté aprobada.

## 3. Qué hay que tocar (inventario verificado)

**Cuatro columnas de dinero**, todas en `src-tauri/src/lib.rs`:

| Columna | Línea | Tabla |
|---|---|---|
| `monto` | 43 | `transactions` |
| `monto` | 84 | `depositos_bancarios` |
| `monto` | 136 | `gastos_recurrentes` |
| `saldo_inicial` | 663 | `churches` |

**En el frontend:** 29 archivos mencionan `monto` y hay 130 llamadas a las tres
funciones de formato (`fmtMoney`, `fmtMoneyPdf`, `fmtMoneyPlain`). La mayoría no
hay que tocarlas — ese es justamente el objetivo del diseño del paso 4.

**Puntos donde el dinero cruza la frontera y sí hay que revisar uno a uno:**

- Entrada por teclado: `parseMonto()` en `NewRecordModal` y en `DepositoModal`.
- Importación de CSV: `importMiembrosCsv` / el importador de movimientos.
- Exportación de CSV: `movimientosToCsv` — el CSV **debe seguir escribiendo
  decimales** (`125.50`), porque lo abre Excel y lo lee gente.
- Los PDF: `printUtils`, `pdfGenerator` y los `print*.ts`.
- La sincronización: lo que se sube y se baja de Supabase.
- El respaldo `.db`: un respaldo hecho con el formato viejo restaurado en la
  versión nueva tiene que migrarse igual que la base principal.

## 4. Cómo se hace, en orden

**Paso 0 — Rama propia.** `git checkout -b centavos`. No se funde hasta que la
1.0 esté aprobada y hasta que las pruebas del paso 5 pasen.

**Paso 1 — Un tipo, no un número suelto.** Crear `src/dinero.ts` con un tipo
`Centavos` (un `number` marcado, para que TypeScript no deje mezclarlo con un
importe decimal por accidente) y las cuatro operaciones que hacen falta:
`deTexto()` (lo que teclea el usuario → centavos), `aDecimal()` (centavos →
number, solo para formatear), `sumar()` y `porcentaje()`. Todo el redondeo vive
aquí y en ningún otro sitio.

**Paso 2 — Las funciones de formato reciben centavos.** `fmtMoney`,
`fmtMoneyPdf` y `fmtMoneyPlain` pasan a aceptar `Centavos` y dividir entre 100
al final. Ese es el truco que hace que las 130 llamadas no haya que revisarlas
una a una: si el valor que llega ya es de tipo `Centavos`, la llamada no cambia,
y si es un decimal el compilador se queja. **El compilador hace de lista de
tareas.**

**Paso 3 — La migración de la base.** Una migración nueva que, para cada una de
las cuatro columnas, cree la columna entera, la rellene con
`CAST(ROUND(monto * 100) AS INTEGER)` y sustituya la vieja. `ROUND` antes de
`CAST` es obligatorio: `CAST(1.15 * 100 AS INTEGER)` da **114**, porque 1.15 en
coma flotante es un pelo menor que 1.15 y `CAST` trunca. Ese detalle es el que
convierte una migración en una pérdida de un centavo por fila.

**Paso 4 — Las fronteras.** Los puntos de la lista del apartado 3, uno a uno.

**Paso 5 — Pruebas antes de fundir.** Como mínimo:

1. Un respaldo hecho **antes** de la migración, restaurado **después**, da
   exactamente los mismos totales.
2. Importar un CSV exportado por la versión vieja da los mismos importes.
3. Un movimiento de `0.01`, uno de `1.15` (el caso del `CAST`) y uno de
   `999999.99` se guardan, se ven y se imprimen bien.
4. El total del estado financiero coincide con la suma de sus líneas al
   centavo, con al menos unos cientos de movimientos.
5. El PDF y la pantalla muestran la misma cifra.

**Las cinco están automatizadas** (`npm run verificar-centavos`; la tabla de
arriba dice qué script cubre cuál). Lo que sigue es la vuelta que hay que dar en
la Mac, que no sustituye a las pruebas sino que comprueba lo único que ellas no
pueden tocar: la app entera funcionando.

**La vuelta en la Mac — en este orden, y no antes del paso 6:**

1. **Respaldo a mano primero**, guardado fuera de la carpeta de la app.
   Ajustes → Respaldo completo. Este archivo es la marcha atrás de todo lo
   demás.
2. Apuntar en un papel el **total de ingresos, el de gastos y el balance** del
   mes con más movimientos, tal y como los muestra la 1.0.8.
3. Abrir el build de la rama. La migración corre sola al arrancar.
4. Volver a ese mes: los tres números tienen que ser **idénticos** a los del
   papel. Si alguno cambia, parar ahí y restaurar el respaldo del punto 1.
5. Exportar el estado financiero de ese mes en PDF y comparar el total del PDF
   con el de la pantalla (prueba 5, la mitad que se ve con los ojos).
6. Registrar un movimiento de **1.15**, otro de **0.01** y otro de
   **999999.99**; comprobar que se ven bien en la lista, en el total y en el
   PDF.
7. Restaurar el respaldo del punto 1 —el que se hizo **antes** de migrar— y
   comprobar que los totales vuelven a salir iguales (prueba 1, con el ZIP
   cifrado de verdad y los documentos).

**Paso 6 — Marcha atrás.** ✅ **Hecho.** La migración no se puede deshacer sola,
así que la app **se copia la base antes de tocarla**:
`motordb::respaldo_antes_de_migrar()`, llamada desde `iniciar_db()` justo antes
de `correr_migraciones()`. El archivo queda al lado de la base, como
`tesoreria.db.antes-de-migrar-<marca>-v36`.

No vale para la 36 sola: **toda migración futura hereda la red gratis.**

Cuatro decisiones que no son obvias:

- **Solo copia si de verdad hay algo pendiente.** En un arranque normal la
  función no toca el disco. El coste se paga una vez por actualización con
  esquema nuevo, que es justo cuando importa. Tampoco copia en una instalación
  nueva: se comprueba que no se haya migrado nunca **y** que no exista ni una
  tabla, porque el archivo ya pesa desde que se abre —activar WAL le escribe una
  cabecera— y mirar solo el tamaño hacía una copia inútil en cada instalación.
- **Consolida el diario (WAL) antes de copiar.** El `.db` por sí solo puede no
  tener los últimos movimientos: están en el `-wal`. Copiarlo sin absorberlo
  daría un respaldo al que le faltan justo los registros más recientes. Si el
  checkpoint no termina, se copian también el `-wal` y el `-shm`.
- **Si no cabe en el disco, NO se migra.** La app no abre y dice por qué, con la
  frase "la base de datos NO se ha tocado". Es la decisión incómoda: cambia un
  fallo molesto y reversible —liberar espacio y volver a abrir— por evitar uno
  irreversible.
- **Se guardan las tres más recientes.** Solo se crea una por actualización con
  esquema nuevo, así que tres cubre tres versiones hacia atrás. Se ordenan por
  la marca del nombre y no por la fecha del archivo: copiar la carpeta cambia
  las fechas del sistema y dejaría el orden al azar.

**Cómo se prueba:** `cd harness-db && cargo run`. `motordb.rs` no depende de
Tauri a propósito, pero hasta ahora no había forma de ejecutarlo sin compilar la
app entera —y la app entera no compila fuera de una Mac, porque arrastra WebKit
y GTK. `harness-db/` incluye el módulo con `#[path]`, sin duplicarlo, y lo
ejerce con SQLite de verdad. Fue el harness el que encontró que la primera
versión respaldaba también en instalaciones nuevas.

**Lo que este respaldo NO es:** no sustituye al respaldo del tesorero. Es una
copia del archivo cifrado, con la clave del Llavero de **esa** Mac, así que
sirve para volver atrás en el mismo equipo y no para llevársela a otro. El
respaldo portátil sigue siendo el ZIP de Ajustes.

## 5. Riesgos

- **La migración es de ida.** De ahí el paso 6.
- **La sincronización con la nube tiene que migrar a la vez.** Si un dispositivo
  queda en la versión vieja y otro en la nueva, uno de los dos multiplica o
  divide por 100 todos los importes de la iglesia. Con el login desactivado en
  la 1.0 el riesgo hoy es cero, pero si el login vuelve antes que esto, la
  versión con centavos **tiene que ser obligatoria**, no opcional.
- **El `CAST` sin `ROUND`.** Ya está explicado en el paso 3; se repite aquí
  porque es el error concreto que hay que no cometer.

## 6. Qué NO entra en este trabajo

Cambiar cómo se ve el dinero, cuántos decimales se muestran, o el formato por
país. Eso ya está resuelto y funcionando; esto es un cambio de fontanería que el
usuario no debe notar en ninguna pantalla.

> **Actualización (18 ago 2026):** el formato por país de la ENTRADA sí se hizo
> después, como trabajo aparte (rama `coma-decimal`): teclear `1,50` guardaba
> $150.00 porque la coma se descartaba como millares. Lo tecleado pasa ahora por
> `deTextoTecleado` (`src/dinero.ts`), que resuelve el separador con la
> configuración regional del dispositivo. `deTexto` —el parser de este plan— se
> quedó tal cual como parser de FORMATO FIJO de los CSV, así que el viaje
> exportar → importar de la sección 3 no cambió.
