# Qué falta para poder enviar a la App Store

_29 de agosto de 2026. Medido contra el código de la 1.3.5, no contra la
memoria de julio._

Iván preguntó si la app está lista. La respuesta corta: **el código sí; los
papeles no.** Esta es la lista de lo que falta, en el orden en que conviene
hacerlo.

---

## Antes de nada: por qué esto pasó

El envío de la 1.0.8 (29 de julio) se preparó para una app que era **gratis,
local y sin cuentas**. `LOGIN_HABILITADO = false`, `SYNC_HABILITADO = false`,
y todo lo que se le declaró a Apple describía eso con precisión.

En la 1.1 se encendieron las dos. Hoy, en la 1.3.5:

```
src/supabase.ts:13    export const LOGIN_HABILITADO = true;
src/syncManager.ts:23 export const SYNC_HABILITADO = true;
```

El código cambió y los documentos se quedaron. No es un descuido de nadie en
particular: es lo que pasa siempre que la declaración vive en un archivo que
no se toca al programar. Lo mismo que pasó con `TABLAS_DATOS` y el borrado, y
por lo que existe `verificar-borrado`.

---

## LO QUE YA ESTÁ BIEN

No hace falta tocar nada de esto. Se comprobó el 29 de agosto:

| | |
|---|---|
| Arnés del iPad | 1138 ✓ / 0 ✗ |
| Las nueve verificaciones | las nueve en verde |
| `npx tsc --noEmit` | limpio |
| `npm run build:appstore` | correcto |
| Regla 3.1.1 — sin enlaces de pago | comprobado **en el bundle**, no en la variable |
| Regla 2.5.2 — sin ofrecer descargas | cortado por `VITE_CANAL` |
| **Regla 5.1.1(v) — borrar la cuenta** | existe, llega desde el teléfono, y borra **en el servidor** |

Sobre la última, porque es la que más apps suspende: `src/auth.ts:84` llama a
la función `borrar-cuenta` de Supabase, cierra sesión, y `App.tsx:846` vacía
lo local y recarga. Es un borrado real, no un cierre de sesión disfrazado.
Se llega por Ajustes → Cuenta → la tarjeta del perfil, en los tres aparatos.

Y la guarda de canal está bien planteada: `verificar-canal` **mira el bundle
construido**, no la variable de entorno. Es lo correcto, porque el bundle es
lo único que el revisor va a ver.

---

## LO QUE FALTA

### 1 · La declaración de privacidad de Apple está vacía, y es falsa

`src-tauri/gen/apple/tesoreria_iOS/PrivacyInfo.xcprivacy` declara:

```xml
<key>NSPrivacyCollectedDataTypes</key>
<array/>
```

El propio archivo lleva escrito, en un comentario, lo que había que hacer:

> «Cuando en 1.1 se active la sincronización en la nube, aquí volverán a
> declararse Email, Name y OtherUserContent (App Functionality).»

Se activó en la 1.1. Vamos por la 1.3.5.

**Lo que sale del aparato** (de `src/sync.ts`, quince tablas):

```
nombre · email · telefono · rfc · direccion · fecha_ingreso · etiquetas
```

Y no son solo datos del usuario: son de **los miembros de la iglesia**, gente
que no instaló la app y no aceptó nada. Ése es el fondo del asunto; el
rechazo de Apple sería solo el síntoma.

**Qué hay que declarar**, como mínimo:

| Tipo | Uso | ¿Ligado a identidad? |
|---|---|---|
| `NSPrivacyCollectedDataTypeEmailAddress` | App Functionality | sí |
| `NSPrivacyCollectedDataTypeName` | App Functionality | sí |
| `NSPrivacyCollectedDataTypePhoneNumber` | App Functionality | sí |
| `NSPrivacyCollectedDataTypePhysicalAddress` | App Functionality | sí |
| `NSPrivacyCollectedDataTypeOtherUserContent` | App Functionality | sí |

Ninguno para publicidad ni seguimiento — eso sigue siendo verdad y conviene
que se vea que lo es.

### 2 · La política de privacidad publicada dice lo contrario

`docs/privacidad.html`, que es la que está en tamio.church y la que se le dio
a Apple como Privacy Policy URL, fechada el 29 de julio, dice:

> «ni analítica, ni publicidad, ni **almacenamiento en la nube**, ni
> procesador de pagos»

Hoy eso es falso.

**Y hay un detalle que enseña cuánto se movió el suelo.** `docs/privacidad.md`
lleva arriba este aviso:

> «⚠️ Borrador desactualizado. Este archivo describe una versión con nube y
> cuentas que la 1.0 no tiene.»

Ese borrador es hoy **el que dice la verdad**. El aviso está al revés.

### 3 · Las notas al revisor prometen algo que ya no se cumple

`docs/notas-revisor-apple.md` está escrito para pegar tal cual en App Store
Connect, y dice:

> «NO SIGN-IN REQUIRED: The app opens directly, with no account and no login.
> All data is stored locally on the device… and never leaves»

Si el build lleva credenciales, el revisor abre la app y **se encuentra una
pantalla de acceso** que la ficha jura que no existe. Eso no es un matiz: es
la primera pantalla, y contradice lo primero que se le dijo.

### 4 · Lo que hay que cambiar en App Store Connect

No está en el repositorio, así que va aquí para que no se olvide:

- [ ] **App Privacy** → deja de ser «Data Not Collected». Hay que declarar los
      cinco tipos de arriba, todos como App Functionality y ligados a
      identidad.
- [ ] **Sign-in required** → hoy está DESMARCADO. Si el build lleva nube, hay
      que marcarlo **y dar una cuenta de prueba** (correo y contraseña) con
      datos dentro. Un revisor que no puede entrar rechaza sin mirar nada más.
- [ ] **Notes** → reescribir según el punto 3.
- [ ] **Clasificación de edad** → se declaró «Messaging and Chat = YES» cuando
      existía la pantalla de Mensajes. **Mensajes se retiró** (migración 51) y
      la sustituyó el Registro, que no es un chat: nadie escribe a nadie.
      Conviene revisar esa respuesta.

### 5 · Las capturas de la ficha son de julio

Se subieron con la 1.0.8. Desde entonces se rediseñaron **el iPhone y el iPad
enteros** — la puerta, el primer arranque, Movimientos, Ajustes, Depósitos,
Membresía, el Registro. Las capturas de la tienda no se parecen a la app.

Ya existe la herramienta para rehacerlas: `pruebas/capturas-iphone.mjs`
fotografía la app real a 393×852. Para la tienda hacen falta además los
tamaños que Apple pide (6,7" y 6,5" de iPhone, 12,9" de iPad).

---

## LA PREGUNTA QUE LO DECIDE TODO, Y NO SE PUEDE CONTESTAR DESDE AQUÍ

Las credenciales de Supabase vienen del `.env`, que **nunca se sube al repo**
(y así debe seguir: es público). Así que la app que llega a la tienda es una
u otra según lo que hubiera en la Mac de Iván al compilar:

```
src/supabase.ts:17
export const authHabilitado = LOGIN_HABILITADO && Boolean(url && anon);
```

- **Con `.env`** → la app tiene nube y login. Los tres documentos de arriba
  son falsos y hay que rehacerlos antes de enviar.
- **Sin `.env`** → la app arranca en modo local, los documentos vuelven a ser
  ciertos… pero entonces **nada de lo construido desde la 1.1** —login,
  invitaciones, roles, sincronización— llega a nadie.

Comprobado desde este contenedor: un build hecho **sin** `.env` no lleva el
proyecto de Supabase dentro. Lo único que aparece es el comodín `*.supabase.co`
del CSP, que es de la propia app y no una credencial.

**Cómo saberlo**, desde la Mac:

```
grep -c VITE_SUPABASE_URL .env
```

---

## EL ORDEN

1. **Contestar la pregunta del `.env`.** Todo lo demás depende de eso.
2. **Reescribir los tres documentos** contra lo que la app hace de verdad:
   el manifiesto, la política publicada y las notas al revisor.
3. **Cambiar las respuestas de App Store Connect**, incluida la de «Messaging
   and Chat», que se quedó de cuando existía Mensajes.
4. **Rehacer las capturas.**
5. **Preparar una cuenta de prueba** para el revisor, con datos dentro.
6. Y entonces sí, compilar y enviar.

Nada de esto es programar. Los puntos 2 y 3 son media tarde; el 4 es la única
parte lenta, y se puede repartir a los chats de diseño, que ya tienen las
herramientas de captura.

---

## LO QUE NO BLOQUEA, POR SI SE CONFUNDE

- **El Registro en el Mac.** `:root.mac` sigue a cero en `.reg-*` y el prompt
  está sin repartir. Es acabado, no requisito: la app no se envía a la Mac App
  Store (se decidió en el envío de la 1.0 «sin Mac App Store ni Vision Pro,
  menos superficie que revisar»).
- **El paso 2 de la retirada de Mensajes** (`drop table mensajes` en
  Supabase). Es limpieza del servidor y no toca a la app.
- **Los siete puntos de `docs/plan-1-4.md`.** Son alcance futuro.
