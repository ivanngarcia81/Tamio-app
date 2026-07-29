# Notas para el revisor de Apple + etiqueta de privacidad

Todo listo para copiar/pegar en App Store Connect cuando enviemos a revisión.

> **Modelo de la 1.0:** Tamio es una app **gratis y 100% local**. No pide iniciar
> sesión, no crea cuentas y no envía datos a ningún servidor. La sincronización en
> la nube y la suscripción llegarán en una versión futura (1.1). Todo lo de abajo
> refleja ese modelo.

---

## 1. App Review Information → "Notes" (pegar tal cual, en inglés)

```
Tamio is a business (B2B) administration app for churches: treasury (income,
expenses, deposits, reports) and secretariat (member records, minutes, letters,
attendance).

NO SIGN-IN REQUIRED: The app opens directly, with no account and no login. All
data is stored locally on the device in an encrypted database and never leaves
the device. There is no server and no cloud account in this version.

HOW TO REVIEW: On first launch, tap "Explore with sample data" on the welcome
screen. This loads a fictional church with sample members and several months of
sample records, so you can see every area of the app immediately. (You can also
choose "Get started" to begin with an empty church.)

SUBSCRIPTION: The app is free and there is no in-app purchase, no paywall, and no
links or buttons to any external purchase. Everything in the app is fully usable
for free in this version.

Support: https://tamio.church  ·  Privacy: https://tamio.church/privacidad.html
```

## 2. Sign-In Information

- **No dejes marcado "Sign-in required".** Déjalo **desmarcado**: la app no pide
  inicio de sesión. No hay usuario ni contraseña que dar.

> Ya no hace falta la cuenta demo de Supabase: el revisor entra directo y usa
> "Explore with sample data". (La cuenta demo la puedes conservar para la 1.1.)

---

## 3. App Privacy → "Data Not Collected"

Como la app es 100% local y **ningún dato sale del dispositivo**, en "App Privacy"
de App Store Connect responde que **NO recopilas datos**:

- Pregunta "Do you or your third-party partners collect data from this app?" →
  **No, we do not collect data from this app.**

> Esto coincide con el manifiesto `PrivacyInfo.xcprivacy`, donde
> `NSPrivacyCollectedDataTypes` está **vacío** y `NSPrivacyTracking = false`.
> Cuando en la 1.1 se active la nube, hay que actualizar **los dos** a la vez
> (volver a declarar Email, Name y Other User Content como App Functionality).

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
