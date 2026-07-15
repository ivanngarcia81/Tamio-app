# Ideas: Inteligencia artificial en Tamio

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
