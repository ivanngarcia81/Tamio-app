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

## ✅ ENVIADO A REVISIÓN — 29 de julio de 2026

Tamio **1.0.8** se envió a App Review el 29 de julio de 2026 (build 1.0.8
adjuntado, versión de la ficha 1.0). Apple tarda normalmente 24–48 h y avisa por
correo. La versión está en **"Manually release"**, así que tras la aprobación hay
que publicarla a mano desde App Store Connect.

Todo lo que se envió:

- [x] Build **1.0.8** construido, subido con Transporter y seleccionado
- [x] Capturas de iPhone y iPad
- [x] Descripción, keywords, promo y subtítulo (es + en), sin prometer nube
- [x] Copyright, Support URL y Privacy Policy URL
- [x] Clasificación de edad → **4+** (con "Messaging and Chat" = YES)
- [x] Precio **Free**
- [x] App Privacy → **Data Not Collected**, coincidiendo con
      `PrivacyInfo.xcprivacy` y con la política de `privacidad.html`
- [x] Content Rights → sin contenido de terceros
- [x] **"Sign-in required" DESMARCADO** + Notes explicando "Explore with sample data"
- [x] Sin Mac App Store ni Vision Pro (menos superficie que revisar)
- [x] **Manually release this version**

### Si Apple rechaza
Es normal y no pasa nada: en Resolution Center indican la directriz concreta.
Se corrige, se sube un build nuevo (subiendo el número de versión) y se reenvía.

---

## 🚨 Después de lanzar: NO actualizar `version.json` todavía

El banner de actualizaciones (`UpdateBanner`) también corre en iPhone y, si
`web/version.json` anuncia una versión mayor, mostraría a los usuarios de iOS un
botón para descargar un **`.dmg` de Mac** — prohibido por Apple (3.1.1 / 2.5.2).

Hoy no se muestra (`version.json` = 1.0.0 < app 1.0.7), por eso no bloqueó la
1.0. **Antes de tocar `version.json`, hay que ocultar ese banner en iOS.**
Detalle completo en `ideas-futuras.md` → "BLOQUEANTE antes de publicar
cualquier actualización".
