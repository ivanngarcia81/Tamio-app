> ⚠️ **Borrador desactualizado.** La política de privacidad vigente de Tamio es
> **[docs/privacidad.html](privacidad.html)** (publicada en
> https://tamio.church/privacidad.html). Este archivo describe una versión con
> nube y cuentas que la 1.0 no tiene; se conserva solo como referencia para
> cuando se reactive la sincronización en la 1.1.

# Política de privacidad de Tamio

**Última actualización: 19 de julio de 2026**

> Esta política describe qué datos maneja Tamio y qué se hace con ellos.
> Está escrita para ser leída por personas, no solo por abogados.
>
> **Nota para el dueño:** antes de publicarla, sustituye `[CORREO DE CONTACTO]`
> por el correo real de soporte. Cuando exista página web, publica esta política
> en una URL pública (Apple y las tiendas la piden); mientras tanto puede
> entregarse como documento.

---

## 1. Quiénes somos

Tamio es una aplicación de escritorio para Mac que ayuda a las iglesias a
llevar su tesorería (ingresos, gastos, reportes) y su secretaría (membresía,
actas, cartas). El responsable del tratamiento es el desarrollador de Tamio.
Contacto: `[CORREO DE CONTACTO]`.

## 2. La idea central: tus datos viven en tu Mac

Tamio funciona **primero en local**. Toda la información que registras
(movimientos financieros, miembros, actas, cartas, asistencia) se guarda en una
base de datos **dentro de tu computadora**. Sin iniciar sesión en la nube, nada
sale de tu Mac y la app funciona completa sin internet.

**Nosotros no vemos ni recibimos tus datos financieros ni de miembros.**

## 3. Qué datos se procesan y dónde

| Dato | Dónde vive | Cuándo sale de tu Mac |
|---|---|---|
| Movimientos financieros (montos, categorías, aportantes) | Tu Mac (base local) | Solo si activas la sincronización |
| Miembros (nombre, contacto, RFC, ficha de membresía) | Tu Mac (base local) | Solo si activas la sincronización |
| Actas, cartas, traslados, servicios, agenda, mensajes | Tu Mac (base local) | Solo si activas la sincronización |
| Correo y contraseña de tu cuenta | Supabase (autenticación) | Al crear la cuenta / iniciar sesión |
| Puntos que escribes para redactar una carta con IA | Se envían a la IA al usarla | Solo si usas "Redactar con IA" |
| Datos de pago (tarjeta) | El procesador de pagos | Solo al comprar una suscripción |

## 4. Sincronización en la nube (opcional)

Si la iglesia inicia sesión, Tamio sincroniza sus datos entre sus propias
computadoras a través de **Supabase** (infraestructura en la nube con cifrado
en tránsito y en reposo). Puntos clave:

- Los datos de **cada iglesia están aislados**: reglas de seguridad a nivel de
  base de datos (RLS) impiden que una iglesia vea datos de otra.
- La sincronización existe **para ti**: para que tesorería y secretaría vean lo
  mismo en distintas Macs. No usamos esos datos para publicidad, perfiles ni
  venta a terceros. **Nunca vendemos datos.**
- Puedes trabajar sin conexión; la app sincroniza cuando vuelve el internet.

## 5. Funciones de inteligencia artificial (opcionales)

Tamio puede redactar el cuerpo de cartas formales con IA (Claude, de
Anthropic). Cómo cuidamos la privacidad ahí:

- La IA **solo recibe lo mínimo** para redactar: el tipo de carta, los puntos
  que tú escribes y, si eliges, el nombre del destinatario, de la iglesia y del
  pastor.
- **No se envían datos financieros** (montos, aportes, saldos) ni la base de
  miembros a la IA.
- La función es **opcional**: si no la usas, nada se envía.
- Las llamadas pasan por nuestro servidor (Supabase); la clave del servicio de
  IA nunca está en tu computadora.

## 6. Pagos

Cuando exista la suscripción de pago, el cobro lo procesará un proveedor
especializado (p. ej. Lemon Squeezy/Paddle). **Tamio nunca ve ni guarda tu
número de tarjeta**; recibimos solo la confirmación del pago (correo del
comprador, plan y vigencia) para activar tu cuenta.

## 7. Qué NO hacemos

- No vendemos ni rentamos datos a nadie.
- No usamos tus datos para publicidad.
- No leemos tus datos financieros ni de miembros para ningún fin propio.
- No enviamos tus datos a la IA sin que tú uses una función de IA.

## 8. Retención y eliminación

- **Datos locales:** están bajo tu control; se eliminan borrando la app y su
  base de datos, y puedes exportar respaldos desde Configuración.
- **Datos sincronizados:** permanecen mientras la cuenta exista. Si pides
  eliminar tu cuenta, se eliminan los datos de tu iglesia de la nube en un
  plazo máximo de 30 días.
- **Cuenta vencida:** al vencer una suscripción los datos NO se borran; quedan
  esperando la renovación.

## 9. Seguridad

- Cifrado en tránsito (HTTPS/TLS) hacia la nube y la IA.
- Aislamiento por iglesia con reglas a nivel de base de datos (RLS).
- Claves y secretos del lado del servidor, nunca dentro de la app.
- La app de Mac está firmada y notarizada por Apple.

## 10. Tus derechos

Puedes solicitar acceso, corrección o eliminación de los datos de tu cuenta
escribiendo a `[CORREO DE CONTACTO]`. Respondemos en un máximo de 30 días.
Los datos de miembros de la iglesia los administra la propia iglesia (ella es
quien decide qué registra); Tamio solo provee la herramienta.

## 11. Menores de edad

Tamio es una herramienta administrativa para iglesias, operada por adultos.
Las fichas de membresía pueden incluir datos de menores **registrados por la
iglesia**; su tratamiento es responsabilidad de la iglesia como administradora
de su propia información.

## 12. Cambios a esta política

Si esta política cambia, se actualizará la fecha de arriba y, en cambios
importantes, se avisará dentro de la app.

---
---

# Tamio Privacy Policy (English)

**Last updated: July 19, 2026**

## 1. Who we are
Tamio is a Mac desktop app that helps churches manage their treasury (income,
expenses, reports) and secretariat (membership, minutes, letters). Data
controller: the Tamio developer. Contact: `[CONTACT EMAIL]`.

## 2. The core idea: your data lives on your Mac
Tamio is **local-first**. Everything you record (financial movements, members,
minutes, letters, attendance) is stored in a database **inside your computer**.
Without signing in to the cloud, nothing leaves your Mac and the app works
fully offline. **We do not see or receive your financial or membership data.**

## 3. Cloud sync (optional)
If the church signs in, Tamio syncs its data between its own computers through
**Supabase** (cloud infrastructure with encryption in transit and at rest).
Each church's data is **isolated** by database-level security rules (RLS). Sync
exists for you — so treasury and secretariat see the same data on different
Macs. We never sell data or use it for advertising.

## 4. AI features (optional)
Tamio can draft formal letter bodies with AI (Claude, by Anthropic). The AI
receives **only the minimum**: the letter type, the bullet points you write
and, if you choose, the recipient/church/pastor names. **Financial data and
the membership database are never sent to the AI.** If you don't use an AI
feature, nothing is sent. Calls go through our server; the AI key is never in
your computer.

## 5. Payments
When paid subscriptions exist, payment is processed by a specialized provider
(e.g. Lemon Squeezy/Paddle). **Tamio never sees or stores your card number**;
we only receive the payment confirmation (buyer email, plan, term) to activate
your account.

## 6. What we do NOT do
No selling or renting data. No advertising use. No reading your financial or
membership data for our own purposes. Nothing goes to the AI unless you use an
AI feature.

## 7. Retention & deletion
Local data is under your control (delete the app/database; export backups from
Settings). Synced data persists while the account exists; upon account
deletion request, your church's cloud data is removed within 30 days. Expired
subscriptions do NOT delete data — it waits for renewal.

## 8. Security
HTTPS/TLS in transit; church isolation via RLS; keys and secrets server-side
only; the Mac app is signed and notarized by Apple.

## 9. Your rights
Request access, correction or deletion of your account data at
`[CONTACT EMAIL]`. We respond within 30 days. Member data is administered by
the church itself; Tamio only provides the tool.

## 10. Children
Tamio is an administrative tool operated by adults. Membership records may
include minors' data **registered by the church**, whose treatment is the
church's responsibility as administrator of its own information.

## 11. Changes
If this policy changes, the date above will be updated and significant changes
will be announced in the app.
