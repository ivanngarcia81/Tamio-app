# Plan de 4.2 — pasar el dinero a centavos enteros

**Estado: escrito, NO empezado.** Este documento existe para poder decidir con
datos antes de tocar una línea. Nada de lo que hay aquí está implementado.

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

**Paso 6 — Marcha atrás.** La migración no se puede deshacer sola. Antes de
publicar la versión que la lleve, la app tiene que **hacerse un respaldo
automático** de la base en su carpeta de datos. Si algo sale mal en un equipo
real, se restaura ese archivo.

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
