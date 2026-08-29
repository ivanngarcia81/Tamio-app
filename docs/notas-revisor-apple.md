# Notas para el revisor de Apple + etiqueta de privacidad

Todo listo para copiar/pegar en App Store Connect.

_Reescrito el 29 de agosto de 2026 para la 1.3.5._

> **Modelo de hoy:** Tamio es una app **gratis, con cuenta y con sincronización
> en la nube**. Se inicia sesión, los datos de la iglesia se guardan cifrados en
> el dispositivo Y en el servidor, y los distintos aparatos de una misma iglesia
> ven lo mismo. No hay compras dentro de la app ni enlaces de pago.
>
> **Esto CAMBIÓ respecto a la 1.0.** Aquella versión era gratis y 100 % local:
> sin cuenta, sin servidor. La nube se encendió en la 1.1 (`LOGIN_HABILITADO`
> en `src/supabase.ts`, `SYNC_HABILITADO` en `src/syncManager.ts`) y estas
> notas, el manifiesto de privacidad y la política publicada se quedaron
> describiendo la 1.0 hasta el 29 de agosto de 2026. Los tres se corrigieron a
> la vez; si alguno vuelve a desfasarse, los otros dos también estarán mal.

---

## 0 · LO PRIMERO: el revisor NO puede entrar sin cuenta

`src/App.tsx:486`:

```tsx
if (authHabilitado) {
  if (!authEstado.autenticado) return <Login />;
```

Con credenciales en el build —que es como se compila para la tienda—, **la
primera pantalla es la de acceso**. El botón «Explorar con datos de ejemplo»
existe todavía, pero vive en la pantalla de bienvenida, que solo aparece
DESPUÉS de entrar y solo si la cuenta no tiene iglesia.

Consecuencia práctica, y es la que hunde envíos:

- **«Sign-in required» va MARCADO.** En la 1.0 iba desmarcado y era correcto;
  hoy no lo es.
- **Hay que dar una cuenta de prueba** en Sign-In Information, y tiene que
  funcionar el día que el revisor la use.

---

## 1 · App Review Information → "Notes" (pegar tal cual, en inglés)

```
Tamio is a business (B2B) administration app for churches: treasury (income,
expenses, deposits, bank reconciliation, reports) and secretariat (member
records, minutes, letters, attendance, services).

SIGN-IN IS REQUIRED. Please use the demo account provided in the Sign-In
Information section. The app syncs a church's data across the devices of that
same church, so an account is needed to identify which church you belong to.

HOW TO REVIEW:
1. Sign in with the demo account below.
2. The account already belongs to a sample church with fictional members and
   several months of sample records, so every area of the app is populated.
3. If you prefer to start from scratch, create a new account: after signing in
   with a fresh account you will see a welcome screen with two options, "Get
   started" (empty church) and "Explore with sample data" (fictional church).

ACCOUNT DELETION (guideline 5.1.1(v)): Settings -> Account -> tap the profile
card at the top -> "Delete account". This calls a server function that deletes
the account and, if it was the last account of that church, deletes all of the
church's data from our servers as well. It is a real deletion, not a sign-out.

DATA: The app stores the church's records both on the device (encrypted with
SQLCipher) and on our server (Supabase), so that several devices of the same
church stay in sync. Some of this data belongs to third parties -- the church's
members (name, email, phone, address, tax ID) -- and is declared accordingly in
the privacy manifest and in App Store Connect. There is no analytics, no
advertising, no tracking and no profiling.

ROLES: What each person sees depends on their role. The treasurer does not see
the member roll and the secretary does not see the cash, unless the
administrator grants it. The demo account is an administrator, so it sees
everything.

SUBSCRIPTION: The app is free. There is no in-app purchase, no paywall, and no
link or button to any external purchase anywhere in this build.

Support: https://tamio.church  ·  Privacy: https://tamio.church/privacidad.html
```

---

## 2 · Sign-In Information

- **"Sign-in required" → MARCADO.**
- **Usuario y contraseña:** los de una cuenta de prueba creada a propósito.

**La cuenta de prueba tiene que cumplir tres cosas**, o el revisor rechaza:

1. **Existir y funcionar el día de la revisión.** No una que hayas borrado
   probando.
2. **Tener datos dentro.** Una cuenta vacía enseña pantallas vacías y el
   revisor no puede juzgar nada. Lo más rápido: crear la cuenta, entrar, y
   pulsar «Explorar con datos de ejemplo» en la bienvenida.
3. **Ser administrador**, para que se vea la app entera y no media.

> Y no la borres tú probando el botón de borrar cuenta. Para esa prueba, una
> tercera cuenta desechable.

---

## 3 · App Privacy → SÍ se recopilan datos

En la 1.0 esto era "Data Not Collected" y era verdad. **Ya no.** Hay que
responder que sí y declarar seis tipos, **todos**:

- ligados a la identidad del usuario (*Linked to You*): **sí**
- usados para seguimiento (*Tracking*): **no**
- finalidad: **App Functionality**, y ninguna más

| Tipo en App Store Connect | Qué es en Tamio |
|---|---|
| **Email Address** | el de quien inicia sesión, y el de los miembros del padrón |
| **Name** | el del perfil, y el de cada miembro |
| **Phone Number** | el de los miembros del padrón |
| **Physical Address** | la de los miembros y la de la iglesia, que va en las cartas |
| **Photos or Videos** | la foto de perfil, si la persona pone una |
| **Other User Content** | movimientos, cortes, depósitos, actas, cartas, acuerdos, asistencia, agenda, el registro y el RFC |

**Contactos ("Contacts") NO.** La app no lee la agenda del teléfono: los datos
de los miembros se escriben a mano dentro de la app. Es una distinción que
importa: declarar Contacts sugeriría un permiso que la app no pide.

> Esto tiene que coincidir **exactamente** con
> `src-tauri/gen/apple/tesoreria_iOS/PrivacyInfo.xcprivacy`, donde están los
> mismos seis con `Linked = true` y `Tracking = false`. Si cambias uno, cambia
> el otro en el mismo commit.

### Required-reason APIs ya declaradas en el manifiesto
- **UserDefaults** — motivo `CA92.1` (uso interno de la app / WKWebView).
- **File timestamp** — motivo `C617.1` (leer archivos dentro del contenedor).
- **Disk space** — motivo `85F4.1` (comprobar espacio antes de escribir respaldos/PDF).

---

## 4 · Otros campos del envío

- **ITSAppUsesNonExemptEncryption:** `false` (ya declarado en Info.plist).
- **Age Rating → "Messaging and Chat": ahora NO.**

  En la 1.0 se respondió **YES** porque existía la pantalla de **Mensajes**,
  donde un rol le escribía a otro. **Mensajes se retiró** (migración 51, 26 de
  agosto de 2026) y la sustituyó el **Registro**, que no es un chat: es un
  diario de lo que ha pasado en la iglesia, escrito por la app. Lo único que
  escribe una persona es una nota, que queda a la vista de su área y **no se
  dirige a nadie ni admite respuesta**.

  El resto de "Features": **NO** a todo (parental controls, age assurance,
  acceso web sin restricción, social feed, publicidad). Contenido (violencia,
  sexo, drogas, apuestas, terror): **None** en todo. Con esto la clasificación
  vuelve a **4+**.

- **Copyright:** `2026 Iván García`.
- **Support URL:** `https://tamio.church`.
- **Privacy Policy URL:** `https://tamio.church/privacidad.html`.

---

## 5 · Antes de dar "Submit for Review"

- [ ] La política publicada en `tamio.church/privacidad.html` es la del 29 de
      agosto de 2026, la que describe la nube. **Comprobarlo en el sitio, no en
      el repositorio**: son dos cosas distintas y solo cuenta la publicada.
- [ ] `VITE_URL_COMPRA` **no** está en el `.env` al compilar. Lo vigila
      `verificar-canal` mirando el bundle, pero mirarlo dos veces no sobra.
- [ ] La cuenta de prueba entra, tiene datos y es administradora.
- [ ] El botón de borrar cuenta se probó con una cuenta desechable, y después
      de borrarla **no se puede volver a entrar** con ese correo.
- [ ] Las capturas son de esta versión, no de julio.
