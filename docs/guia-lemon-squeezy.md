# Guía paso a paso — Conectar Lemon Squeezy a Tamio

> Cuenta **aprobada el 3 de agosto de 2026**. El webhook `pago-webhook` ya
> habla el formato de Lemon Squeezy (se adaptó ese mismo día; antes era de
> Paddle). Esta guía se hace **toda en modo de prueba (test mode)**: la venta
> real arranca cuando Apple apruebe la 1.0 y la 1.1 traiga el login.
>
> ⚠️ **Regla de oro de Lemon Squeezy: jamás compres con tu tarjeta real.**
> Ellos mismos avisan que un pago real de prueba puede interpretarse como
> lavado de dinero. En test mode se usa la tarjeta falsa `4242 4242 4242 4242`.

Tiempo total: 30–45 minutos, con la Mac y el navegador. Cada fase termina en
un punto seguro: se puede parar y seguir otro día.

---

## Fase 0 — Lo que ya está hecho (nada que hacer aquí)

- ✅ Cuenta de Lemon Squeezy aprobada (correo del 3 ago, firma "Deerga").
- ✅ `supabase/functions/pago-webhook/index.ts` adaptado a Lemon Squeezy:
  verifica la firma `X-Signature`, identifica al comprador por correo y
  escribe `plan / sub_estado / sub_vence` en la tabla `iglesias`.
- ✅ Regla de producto único: mientras no se configuren los secretos
  `LEMON_PLAN_*`, todo pago da plan "completo" (lo correcto hoy).

## Fase 1 — Crear el producto en Lemon Squeezy (~10 min, en el navegador)

1. Entra a <https://app.lemonsqueezy.com> con tu cuenta.
2. **Activa el modo de prueba:** abajo a la izquierda hay un interruptor
   "Test mode". Debe quedar ENCENDIDO (la pantalla suele mostrar una franja
   o etiqueta de test). Todo lo de esta guía ocurre ahí dentro.
3. Ve a **Store → Products → + New product**.
4. Llénalo así:
   - **Name:** `Tamio`
   - **Description:** breve, por ejemplo:
     *"Treasury and administration software for churches. Monthly
     subscription, full access."*
   - **Pricing:** elige **Subscription**, `$23.99 USD`, cada `1 month`.
   - Imagen: el logo de Tamio si lo tienes a mano (opcional).
5. Guarda ("Publish").
6. Abre el producto recién creado y localiza el botón **Share** (o
   "Copy link" en la variante): copia el **enlace del checkout**. Se ve así:
   `https://TU-TIENDA.lemonsqueezy.com/checkout/buy/XXXXXXXX`.
   **Guárdalo en tus notas** — es el enlace de venta.

### 1-bis. Meter ese enlace en la app

Este paso faltaba en la guía y es el que conecta la tienda con Tamio. La app
ya tiene los botones "Comprar" y "Renovar" escritos (pantalla de acceso y
aviso de plan vencido), pero **no se pintan si no hay enlace configurado** —
por eso hoy no se ven por ningún lado.

1. En `/Users/ivangarcia/Desktop/tesoreria-mac-`, abre el archivo `.env`
   (si no existe, cópialo de `.env.example`).
2. Añade la línea con TU enlace del paso anterior:

   ```
   VITE_URL_COMPRA=https://TU-TIENDA.lemonsqueezy.com/checkout/buy/XXXXXXXX
   ```

3. **Se lee al compilar, no al arrancar**: hasta que no recompiles, la app
   sigue sin los botones. Y como no se puede subir un build nuevo mientras
   Apple revisa, esto queda puesto en el `.env` y entra en el envío
   siguiente. En modo de prueba (Fase 4) da igual: ahí el checkout se abre
   a mano en el navegador, sin pasar por la app.

### 1-ter. ⚠️ Dos canales, dos builds — regla 3.1.1 de Apple

**Esto es motivo de rechazo si se hace mal, así que va antes que nada más.**

Tamio se vende por dos canales: directo (Lemon Squeezy) y Mac App Store. La
regla **3.1.1** de Apple prohíbe que una app de la App Store lleve al
usuario a comprar por fuera — botón, enlace o llamada a la acción. Si el
build que se sube a la App Store se compila con `VITE_URL_COMPRA` puesta, la
app le enseña al revisor un botón "Renovar plan" que abre un checkout
externo. Rechazo.

La solución sale de la propiedad de arriba: **la variable se lee al
compilar**, así que basta con compilar dos veces el mismo código:

| Canal | `VITE_URL_COMPRA` | Resultado |
|---|---|---|
| **Descarga directa** (.dmg) | puesta | Botones "Comprar" y "Renovar" visibles |
| **Mac App Store** | **quitada o comentada** | No se pinta ningún botón de compra |

Sin condicionales ni banderas en tiempo de ejecución: dos builds del mismo
código. `src/plan.ts:29` devuelve `null` si la variable falta, y los dos
sitios que la usan están detrás de ese `null`.

**Antes de firmar el build de la App Store**, comprueba en la app compilada
que no aparece ningún botón de compra. La lista completa de comprobación
está en `docs/checklist-app-store.md`.

## Fase 2 — Crear el webhook en Lemon Squeezy (~5 min, en el navegador)

1. La URL de tu función es esta (ya con tu proyecto de Supabase; es la misma
   que aparece en `docs/planes.md`):

   ```
   https://hkpbkpojeierxqtbmagh.supabase.co/functions/v1/pago-webhook
   ```

2. Inventa un **signing secret**: una frase larga y aleatoria (mínimo 6
   caracteres; usa 30+). Ejemplo del estilo (NO uses este):
   `tamio-lemon-2026-Kx9mQ4vR8pW2nZ7j`. **Apúntalo** — se usa en la Fase 3.
3. En Lemon Squeezy: **Settings → Webhooks → +**.
   - **Callback URL:** la URL del paso 1.
   - **Signing secret:** el que inventaste.
   - **Events:** marca estos siete:
     `subscription_created`, `subscription_updated`, `subscription_resumed`,
     `subscription_paused`, `subscription_unpaused`,
     `subscription_cancelled`, `subscription_expired`.
4. Guarda. (Asegúrate de seguir en test mode al crearlo: los webhooks de
   test y de producción son independientes.)

## Fase 3 — Desplegar la función con su secreto (~10 min, en la Terminal)

1. Si nunca has instalado la CLI de Supabase en esta Mac:

   ```
   brew install supabase/tap/supabase
   ```

2. Inicia sesión (abre el navegador para autorizar):

   ```
   supabase login
   ```

3. Necesitas el **project ref**: entra a <https://app.supabase.com>, abre tu
   proyecto, y cópialo de la URL del navegador —
   `https://app.supabase.com/project/ESTE-CODIGO` — o de Settings → General.
4. En la Terminal, dentro de la carpeta del proyecto
   (`/Users/ivangarcia/Desktop/tesoreria-mac-`), guarda el secreto
   (cambia `EL-SECRETO` y `TU-REF` por los tuyos):

   ```
   supabase secrets set LEMON_WEBHOOK_SECRET=EL-SECRETO --project-ref TU-REF
   ```

5. Y despliega la función:

   ```
   supabase functions deploy pago-webhook --no-verify-jwt --project-ref TU-REF
   ```

   El `--no-verify-jwt` es necesario: quien llama es Lemon Squeezy, no un
   usuario con sesión; la seguridad la pone la firma `X-Signature`.

## Fase 4 — La compra de prueba (~10 min)

1. Abre el enlace del checkout (Fase 1.6) en el navegador, **añadiéndole el
   correo de tu cuenta de Tamio en la nube** al final:

   ```
   ...checkout/buy/XXXXXXXX?checkout[custom][email]=tu-correo@gmail.com
   ```

   Ese correo es cómo el webhook encuentra tu iglesia.
2. Paga con la tarjeta de prueba: número `4242 4242 4242 4242`, cualquier
   fecha futura, cualquier CVC, cualquier nombre.
3. Verifica que el aviso llegó: Lemon Squeezy → **Settings → Webhooks →**
   tu webhook → pestaña de entregas ("Recent deliveries"). Debe haber un
   `subscription_created` con respuesta **200** y cuerpo `ok`.
4. Verifica el resultado en Supabase: **Table Editor → `iglesias`** → tu
   iglesia debe tener `plan = completo`, `sub_estado = activa` y
   `sub_vence` con la fecha de dentro de un mes.
5. En Tamio (con login activo, cuando lo haya), la tarjeta "Áreas" de
   Ajustes mostrará ese plan al sincronizar.

**Si algo sale distinto**, el propio registro de entregas dice qué pasó:
- `401 firma inválida` → el signing secret de la Fase 2 y el de la Fase 3
  no coinciden. Repite el `secrets set` y vuelve a desplegar.
- `404 usuario no encontrado` → el correo del paso 1 no tiene cuenta en la
  nube de Tamio. **Con el login de la 1.0 desactivado esto es lo esperado**
  si nunca creaste tu cuenta: la firma y el formato ya quedaron probados,
  y la compra completa se prueba cuando la 1.1 traiga el login.
- `400 sin correo` → el enlace no llevaba `?checkout[custom][email]=...`.

## Fase 5 — Cuando llegue la venta real (después de Apple + 1.1)

1. Apagar test mode y **repetir las Fases 1 y 2 en modo real** (productos y
   webhooks de test no pasan a producción: se crean de nuevo).
2. Guardar el nuevo signing secret de producción con el mismo comando de la
   Fase 3.4 y volver a desplegar (Fase 3.5).
3. Poner el enlace del checkout real en tamio.church.
4. Recordatorio de costos: Lemon Squeezy cobra ~5% + 50¢ por venta como
   Merchant of Record (ellos se encargan de los impuestos de cada país).

---

## Lista de cotejo

- [ ] Fase 1 — Producto "Tamio" creado en test mode y enlace guardado
- [ ] Fase 1-bis — `VITE_URL_COMPRA` puesto en el `.env`
- [ ] Fase 2 — Webhook creado con URL + secreto + 7 eventos
- [ ] Fase 3 — Secreto guardado y función desplegada
- [ ] Fase 4 — Compra falsa con 200 `ok` (o el 404 esperado sin login)
- [ ] Fase 5 — (esperar a Apple + 1.1)

## Cómo saber si la función ya está desplegada

Desde el repositorio no se puede saber: el código estar en `supabase/functions/`
no significa que esté corriendo. Dos formas de comprobarlo en un minuto:

- **En el navegador:** <https://app.supabase.com> → tu proyecto → **Edge
  Functions**. Si `pago-webhook` aparece en la lista, está desplegada, y la
  columna de la derecha dice cuándo fue la última vez.
- **En la Terminal:** `supabase functions list --project-ref TU-REF`.

Y para los secretos: **Project Settings → Edge Functions → Secrets**, o
`supabase secrets list --project-ref TU-REF` (muestra los nombres y un
resumen, nunca el valor).
