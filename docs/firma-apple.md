# Firmar y notarizar Tamio con Apple Developer

Guía completa para que el `.dmg` de Tamio abra en **cualquier Mac sin el aviso**
de "desarrollador no identificado". Todo esto se hace **en tu Mac** (yo no puedo:
requiere tu cuenta de Apple y tu certificado personal).

> **Concepto:** para repartir una app fuera de la App Store necesitas dos cosas:
> **firmarla** (con un certificado "Developer ID Application") y **notarizarla**
> (Apple la revisa y le pone un sello). Tauri hace las dos **automáticamente** si
> le das tus credenciales por variables de entorno. El script `npm run firmar`
> ya lo tiene todo cableado.

---

## Resumen de una vez (lo que harás)

1. Inscribirte en el Apple Developer Program ($99/año).
2. Crear el certificado **Developer ID Application** (con Xcode).
3. Generar una **contraseña específica de app** para notarizar.
4. Copiar `.env.firma.example` a `.env.firma` y rellenar 4 datos.
5. Correr `npm run firmar`.

---

## Paso 1 · Inscribirte en Apple Developer ($99/año)

1. Entra a <https://developer.apple.com/programs/> → **Enroll**.
2. Inicia sesión con tu Apple ID y paga los **$99 USD/año**.
3. La aprobación tarda de **unas horas hasta ~2 días**. No sigas hasta que tu
   cuenta esté **activa**.
4. Anota tu **Team ID** (10 caracteres): aparece en
   <https://developer.apple.com/account> → **Membership details**.

## Paso 2 · Crear el certificado "Developer ID Application"

La forma más fácil es con **Xcode** (que ya tienes):

1. Abre **Xcode** → menú **Xcode → Settings… → Accounts**.
2. Pulsa **+** y agrega tu **Apple ID** (el de la cuenta de desarrollador).
3. Selecciona tu equipo → botón **Manage Certificates…**
4. Pulsa el **+** (abajo a la izquierda) → elige **Developer ID Application**.
5. Se crea y se instala solo en tu **Llavero**. Listo.

> Si "Developer ID Application" aparece gris, tu inscripción del Paso 1 aún no
> está activa, o tu cuenta es individual sin permisos. Espera a que Apple la
> active.

### Comprobar que quedó instalado
En la Terminal:
```bash
security find-identity -v -p codesigning
```
Debe aparecer una línea como:
```
1) A1B2C3... "Developer ID Application: Tu Nombre (ABCDE12345)"
```
Copia el texto entre comillas **tal cual** — es tu `APPLE_SIGNING_IDENTITY`.

## Paso 2-bis · Firmar desde OTRA Mac (segunda máquina)

Si ya creaste el certificado en una Mac y ahora quieres firmar desde otra,
**no repitas el Paso 2**. Dos motivos:

1. **La clave privada no se puede volver a descargar.** El certificado que ves
   en developer.apple.com es solo la mitad pública; la privada se generó en el
   Llavero de la Mac donde lo creaste y no sale de ahí salvo que la exportes.
   Sin ella, el certificado no firma nada.
2. **Apple limita los certificados "Developer ID Application"** (unos 5 por
   cuenta) y revocarlos afecta a las versiones ya repartidas. Gastar uno por
   máquina es tirar un recurso escaso sin necesidad.

Lo correcto es **exportar el par certificado + clave** desde la Mac original.

### En la Mac que YA firma

1. Abre **Acceso a Llaveros** (Keychain Access).
2. Barra lateral: **Inicio de sesión** → categoría **Mis certificados**.
   *(Tiene que ser "Mis certificados", no "Certificados": esa categoría solo
   muestra los que tienen la clave privada, que es lo que importa.)*
3. Busca **Developer ID Application: Tu Nombre (TEAM_ID)**. Despliega la
   flecha: debajo debe colgar una clave privada. Si no cuelga nada, ese
   certificado no sirve para firmar.
4. Clic derecho sobre él → **Exportar…** → formato **Intercambio de información
   personal (.p12)**.
5. Te pide una contraseña para proteger el archivo. Pon una y **anótala**: hace
   falta al importar.

### En la Mac nueva

1. Pasa el `.p12` (AirDrop, pendrive — no por correo si puedes evitarlo: lleva
   tu clave privada dentro).
2. Doble clic en el archivo → escribe la contraseña que pusiste al exportar.
3. Comprueba que quedó:
   ```bash
   security find-identity -v -p codesigning
   ```
   Tiene que aparecer la línea de **Developer ID Application**.
4. **Borra el `.p12`** de las dos máquinas cuando termines. Es tu identidad de
   firma: quien lo tenga junto con su contraseña puede publicar software en tu
   nombre.

### Y no olvides `.env.firma`

Está en `.gitignore`, así que **no viene con el `git clone`**. Hay que
recrearlo en cada máquina:

```bash
cp .env.firma.example .env.firma
```

y rellenar los cuatro valores (Paso 4). La contraseña específica de app del
Paso 3 sirve igual en las dos Macs: es de la cuenta, no del equipo.

## Paso 3 · Contraseña específica de app (para notarizar)

La notarización necesita entrar a tu cuenta, pero **no se usa tu contraseña
normal**, sino una "contraseña específica de app":

1. Entra a <https://appleid.apple.com> → **Iniciar sesión y seguridad**.
2. **Contraseñas específicas de app** → **+** → nómbrala `Tamio notarización`.
3. Copia la contraseña que te da (formato `xxxx-xxxx-xxxx-xxxx`).

## Paso 4 · Poner tus datos en `.env.firma`

En la carpeta del proyecto:
```bash
cd ~/Desktop/tesoreria-mac-
cp .env.firma.example .env.firma
```
Abre `.env.firma` y rellena los 4 valores:

| Variable | De dónde sale |
|---|---|
| `APPLE_SIGNING_IDENTITY` | Paso 2 (`security find-identity`) |
| `APPLE_ID` | tu correo de Apple Developer |
| `APPLE_PASSWORD` | Paso 3 (la de `xxxx-xxxx-xxxx-xxxx`) |
| `APPLE_TEAM_ID` | Paso 1 (Membership, 10 caracteres) |

> `.env.firma` **está ignorado por git**: tus claves nunca se suben. No pongas
> valores reales en `.env.firma.example`.

## Paso 5 · Firmar y notarizar

Un solo comando (**usar el manual — es el que funciona**):
```bash
npm run firmar:manual
```

> ✅ **Validado el 2026-07-19**: con este comando Apple aceptó y notarizó Tamio
> (status: Accepted + staple OK). `npm run firmar` (el firmado interno de
> Tauri) falla por el `com.apple.FinderInfo` que macOS re-estampa en las
> carpetas `.app`; `firmar:manual` lo esquiva firmando la carpeta renombrada.
Esto construye el `.dmg` universal (Intel + Apple Silicon), lo **firma** y lo
manda a **notarizar** a Apple. La notarización puede tardar de **2 a 15 minutos**.
Al terminar, el archivo queda en:
```
src-tauri/target/universal-apple-darwin/release/bundle/dmg/Tamio_universal.dmg
```

## Paso 6 · Comprobar que quedó bien

```bash
spctl -a -vvv -t install \
  "src-tauri/target/universal-apple-darwin/release/bundle/macos/Tamio.app"
```
Debe decir **`accepted`** y **`source=Notarized Developer ID`**.

Ahora ese `.dmg` **abre en cualquier Mac sin avisos**. 🎉

---

## Preguntas frecuentes

**¿Se abre Xcode para firmar el `.dmg`?**
No. Xcode solo se usó en el Paso 2 para crear el certificado. La firma real la
hace Tauri al construir. (Para la app de **iPad**, en cambio, Xcode sí es el
protagonista — ver `docs/ipad-plan.md`.)

**¿Esto sirve para la App Store?**
No directamente. El certificado **Developer ID** es para repartir el `.dmg` por
tu cuenta (web, USB, correo). Para la **App Store** se usa otro flujo (Xcode +
certificado "Apple Distribution"). Para vender fuera de la tienda, Developer ID
es justo lo que quieres.

**¿Cada año hay que rehacer todo?**
El pago es anual. El certificado dura ~5 años. Mientras la cuenta esté activa y
el certificado válido, solo corres `npm run firmar` cada vez que saques versión.

**Errores comunes**
- *"No identity found"* → el certificado no está en el Llavero (repite Paso 2) o
  `APPLE_SIGNING_IDENTITY` está mal escrito.
- *Notarización rechazada por credenciales* → revisa `APPLE_ID`, la contraseña
  específica de app y el `APPLE_TEAM_ID`.
- *Cuelga en "notarizing"* → es normal que tarde varios minutos; espera.
