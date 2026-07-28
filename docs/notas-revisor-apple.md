# Notas para el revisor de Apple + etiqueta de privacidad

Todo listo para copiar/pegar en App Store Connect cuando enviemos a revisión.

---

## 1. App Review Information → "Notes" (pegar tal cual, en inglés)

```
Tamio is a business (B2B) administration app for churches: treasury (income,
expenses, deposits, reports) and secretariat (member records, minutes, letters,
attendance). It is sold to churches; a church admin manages their team.

SIGN-IN: The app requires an account. A demo administrator account with sample
data is provided in the Sign-In section below. With this account you can see all
areas of the app.

ROLES: Access is role-based (administrator, treasurer, secretary). The
administrator account sees all areas. If you would like to test a specific role,
please contact us and we will provide a treasurer/secretary account.

ACCOUNT DELETION (Guideline 5.1.1): After signing in, tap the profile avatar at
the top of the side menu ("My profile"), then tap "Delete my account". This
permanently deletes the account and its data.

SUBSCRIPTION: Tamio is free to download. The optional subscription for churches is
a business service purchased outside the app on our website. The app does not sell
or unlock any digital content via in-app purchase, and contains no links or
buttons to an external purchase. The demo account is provided with full access so
no paywall is encountered during review.

The app works offline with a local encrypted database and optionally syncs to the
cloud (Supabase). Support: https://tamio.church  ·  Privacy: https://tamio.church/privacidad.html
```

## 2. Sign-In Information (marcar "Sign-in required")

- **Username:** `[correo de la cuenta demo — la creamos juntos]`
- **Password:** `[contraseña de la cuenta demo]`

> Debe ser una cuenta **administrador**, marcada **cortesía** en Supabase (plan
> activo, sin muro de pago), con datos de ejemplo cargados. **Datos ficticios**,
> no de una iglesia real.

---

## 3. App Privacy (la etiqueta debe COINCIDIR con PrivacyInfo.xcprivacy)

Cuando llenes "App Privacy" en App Store Connect, declara exactamente esto:

- **Data used to track you:** ninguno. (No tracking.)
- **Data linked to you** (App Functionality; no tracking):
  - **Contact Info → Email Address** (correo de la cuenta)
  - **Contact Info → Name** (nombre de perfil, opcional)
  - **User Content → Other User Content** (datos administrativos de la iglesia:
    miembros, movimientos, actas, cartas)
- **Data not linked to you:** ninguno.

> Coincide con el manifiesto `PrivacyInfo.xcprivacy` (email, name, other user
> content; NSPrivacyTracking = false). Si cambian los datos que recoge la app,
> hay que actualizar **los dos** a la vez.

### Required-reason APIs ya declaradas en el manifiesto
- **UserDefaults** — motivo `CA92.1` (uso interno de la app / WKWebView).
- **File timestamp** — motivo `C617.1` (leer archivos dentro del contenedor de la app).
- **Disk space** — motivo `85F4.1` (verificar espacio antes de escribir respaldos/PDF).

---

## 4. Otros campos del envío
- **ITSAppUsesNonExemptEncryption:** `false` (ya declarado en Info.plist).
- **Age Rating:** responder todo "None" → 4+.
- **Copyright:** `2026 Iván García`.
- **Support URL:** `https://tamio.church`.
- **Privacy Policy URL:** `https://tamio.church/privacidad.html`.
