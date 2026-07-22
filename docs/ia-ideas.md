# Ideas: Inteligencia artificial en Tamio

> **Estado (2026-07-21):** construidos los casos 1 y 2 — **cartas** (botón en el
> editor), **actas** (botón en el desarrollo del acta) y **resúmenes del mes**
> (botón "Resumen IA" en Reportes, con cifras precalculadas por la app). Todo
> tras la bandera `VITE_IA_HABILITADA` y la función `redactar-ia` (modos
> carta/acta/resumen). Tras cambiar la función hay que redesplegarla:
> `supabase functions deploy redactar-ia`. Pendientes: preguntas sobre datos,
> registro por lenguaje natural y OCR de recibos.

> Meta futura, exploratoria. Se retoma **después** de cerrar la versión Mac
> (login Supabase + `.dmg`). Técnicamente sencillo de integrar (Tamio es
> JS/React; llamar a una IA es una petición web), pero con consideraciones de
> privacidad importantes por tratarse de datos financieros y de miembros.

## Casos de uso (ordenados por valor / menor riesgo)

1. **Redactar cartas y actas** *(mejor punto de entrada).*
   A partir de unas viñetas, la IA redacta el cuerpo formal. Complementa las
   plantillas existentes. **No toca dinero → bajo riesgo.**

2. **Resúmenes en lenguaje natural.**
   Convierte los números del mes/año en un párrafo listo para leer en reunión
   ("Ingresos $2,500, 12% más que junio; mayor gasto: compensación").

3. **Registro por lenguaje natural.**
   "Ofrenda de 500 el domingo" → transacción pre-llenada (categoría, monto,
   fecha) para que el usuario **confirme**.

4. **Preguntas sobre los datos.**
   "¿Cuánto llevamos gastado en servicios este año?" respondiendo sobre la base
   local.

5. **Foto de recibo → gasto** (OCR + IA): extrae monto, fecha y concepto de una
   factura fotografiada.

## Consideraciones (lo que hay que cuidar)

- **Privacidad (lo más delicado).** Tamio maneja dinero y datos de miembros. Las
  IA potentes viven en la nube → usarlas implica enviar información fuera de la
  Mac. Requiere: consentimiento, enviar solo lo mínimo (o anonimizado) y definir
  qué datos **nunca** salen.
- **Rompe el offline.** Hoy la app funciona 100% sin internet; la IA en la nube
  necesita conexión.
- **Costo.** Se paga por uso; a escala de una iglesia sería muy bajo (centavos),
  pero es recurrente y necesita una **API key**.
- **Confiabilidad.** En temas de dinero, siempre **"sugerir, el usuario
  confirma"**, nunca automático.

## Recomendación

- Empezar por **redacción de cartas/actas** y **resúmenes de reportes**: mucho
  valor, cero riesgo financiero.
- Como ya se usará la nube (Supabase), integrar la **API de Claude** encaja
  natural.
- Dejar lo que toca dinero (registro por voz/texto, OCR) para una fase madura,
  siempre con confirmación humana.

## Orden sugerido
1. Terminar Supabase (login + roles) y el `.dmg`.
2. (Opcional) Tamio para iPad — ver `docs/ipad-plan.md`.
3. IA: primero cartas/actas + resúmenes; luego, con cuidado, el resto.

---

## Preguntas sobre los datos en Tesorería (caso #4, con detalle)

Un cuadro en Tesorería donde el usuario escribe (o dicta) una pregunta en
español y recibe la respuesta con **el dato real de su base**. Ejemplos:

- *"¿Cuánto se gastó este año?"*
  → "En 2026 se han gastado $44,150. Mayor rubro: compensación pastoral
    ($18,000), seguido de servicios ($12,300)."
- *"¿Cuánto se recibió en diezmos en julio?"*
- *"¿Cuál fue el mes con más ofrendas?"*
- *"¿Cuánto saldo le queda a la iglesia?"*
- *"¿Cuánto ha aportado Juan este año?"*

### Regla de oro: **la app calcula, la IA explica**
En temas de dinero la IA **NO debe inventar ni estimar cifras**. El flujo seguro:

1. La **app** calcula el número exacto, con las MISMAS funciones que ya usan los
   reportes (`monthTotals`, `yearTotals`, `yearCategoriaTotals`, `memberStats`,
   etc. en `db.ts`) — cifras ya auditadas.
2. La **IA** solo redacta la respuesta en lenguaje natural sobre ese número.

Así los números siempre son exactos; la IA aporta la conversación, no el cálculo.
Técnicamente: la IA interpreta la intención de la pregunta → elige qué función/
periodo consultar (o se le pasan totales precalculados como contexto) → redacta.

### Enlace con reportes/PDF
La respuesta puede **ofrecer el reporte**: "¿Genero el PDF del gasto anual?" y
dispararlo con el motor de PDF que ya existe (`printDashboard` / reporte anual).

### Privacidad
Se envía a la IA **solo el dato/total necesario** para redactar (no toda la base).
Nunca salen datos sensibles que no hagan falta para responder.
