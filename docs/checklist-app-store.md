# Checklist de envío a la App Store (Tamio)

Pasos antes de dar "Submit for Review" en App Store Connect.

_Última actualización: 28 de julio de 2026_

---

## Modelo de la versión 1.0: app gratis y 100% local

Para el lanzamiento, Tamio sale como una app **gratis, sin inicio de sesión y sin
nube**. Todo se guarda cifrado en el propio dispositivo y **nada sale de él**.

- **Sin login** (`LOGIN_HABILITADO = false` en `src/supabase.ts`).
- **Sin sincronización** (`SYNC_HABILITADO = false` en `src/syncManager.ts`).
- **Sin compras dentro de la app**, sin muro de pago y sin enlaces al pago externo.

Esto elimina de raíz los riesgos con Apple (login innecesario 5.1.1(v), pago
externo / anti-steering) y hace que el revisor pueda usar la app de inmediato. La
suscripción (Paddle) y la nube se activarán en la **1.1**.

### Por qué no hay botón de compra en iOS
Los botones que abren el pago externo (`src/components/SubBanner.tsx` y
`src/App.tsx`) solo aparecen si `VITE_URL_COMPRA` tiene valor **y** hay login
activo. Con el login apagado y esa variable vacía, **nunca aparecen** en el build
de iOS. ✔️

> ⚠️ **Para la 1.1:** cuando se reactive el login y el pago, antes de enviar a iOS
> hay que ocultar el botón de compra en iOS aunque `urlCompra` tenga valor
> (detección de plataforma), para que el pago externo pueda vivir en Mac/web sin
> arriesgar la app de iOS.

---

## Resto del checklist de envío

### Build
- [x] Versión del proyecto en **1.0.7** (ya hecho en el código)
- [ ] Construir `.ipa` en la Mac: `npm run tauri ios build -- --export-method app-store-connect`
- [ ] Subir con **Transporter** y esperar 10–30 min a que procese
- [ ] En App Store Connect, campo **Version = `1.0.7`** (que coincida con el build)
- [ ] Seleccionar el **build 1.0.7** en el "+"

### Ficha (metadata)
- [x] Capturas iPhone 6.9" + iPad 13"
- [ ] Descripción, keywords, promo (español + inglés) — **quitar toda mención a
      sincronización en la nube / cuentas** (la 1.0 es local). Ver texto abajo.
- [ ] **Copyright:** `2026 Iván García`
- [ ] **Support URL:** `https://tamio.church`
- [ ] **Privacy Policy URL:** `https://tamio.church/privacidad.html`
- [ ] **Clasificación de edad:** responder todo "None" → 4+
- [ ] **Precio:** Free
- [ ] **Privacidad de la app:** responder **"No recopilo datos"** (Data Not
      Collected) — ver `notas-revisor-apple.md` §3

### Revisión
- [ ] **App Review → Notes:** pegar el texto de `notas-revisor-apple.md` §1
- [ ] **Dejar "Sign-in required" DESMARCADO** (la app no pide login)
- [ ] **Submit for Review** 🚀
