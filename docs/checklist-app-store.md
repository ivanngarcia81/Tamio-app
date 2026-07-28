# Checklist de envío a la App Store (Tamio)

Pasos antes de dar "Submit for Review" en App Store Connect.

_Última actualización: 28 de julio de 2026_

---

## 🚨 PASO OBLIGATORIO DE CUMPLIMIENTO (no saltarlo)

**El build de iOS NO debe tener botón de "Comprar / Renovar" ni ningún enlace que
lleve al pago externo (Paddle).** Apple rechaza —o banea— apps que dirigen al
usuario a pagar fuera de la app (reglas de anti-steering / In-App Purchase).

**Modelo correcto de Tamio (legal):** el pago ocurre en la web (tamio.church,
con Paddle); la app **solo inicia sesión** y revisa en Supabase si el plan está
activo. Nunca cobra ni empuja a pagar desde dentro.

### Cómo se controla en el código
- Los dos botones que abren el pago externo están en:
  - `src/components/SubBanner.tsx` (botón "Renovar" del aviso de vencimiento)
  - `src/App.tsx` (~línea 243, botón que abre `urlCompra`)
- **Ambos solo aparecen si `urlCompra` tiene valor**, y `urlCompra` viene de la
  variable de entorno **`VITE_URL_COMPRA`** (`src/plan.ts`).

### Regla para el build de iOS
- ✅ **Construir el build de iOS SIN `VITE_URL_COMPRA`** (que quede vacía). Así
  ningún botón de compra aparece y la app cumple.
- **Estado actual:** `VITE_URL_COMPRA` **no está configurada** en ningún `.env`,
  así que el build de iOS ya sale limpio por defecto. ✔️

### ⚠️ Riesgo futuro (importante)
Si algún día se configura `VITE_URL_COMPRA` (p. ej. para activar el pago en la
**web** o en **Mac**), el código actual **también mostraría el botón en iOS**,
porque no distingue plataforma. Antes de volver a enviar a iOS habría que:
- Dejar `VITE_URL_COMPRA` vacía para el build de iOS, **o**
- (Mejor) modificar el código para **ocultar el botón de compra en iOS** aunque
  `urlCompra` tenga valor (detección de plataforma). Así el pago externo puede
  vivir en Mac/web sin arriesgar la app de iOS.

**Verificación antes de enviar:** abrir el build de iOS con una cuenta de plan
vencido y confirmar que **no aparece ningún botón de comprar/renovar** — solo un
aviso neutral.

---

## Resto del checklist de envío

### Build
- [ ] Versión del proyecto en **1.0.6** (ya hecho en el código)
- [ ] Construir `.ipa` en la Mac: `npm run tauri ios build -- --export-method app-store-connect`
- [ ] Subir con **Transporter** y esperar 10–30 min a que procese
- [ ] En App Store Connect, campo **Version = `1.0.6`** (que coincida con el build)
- [ ] Seleccionar el **build 1.0.6** en el "+"

### Ficha (metadata)
- [x] Capturas iPhone 6.9" + iPad 13"
- [x] Descripción, keywords, promo (español + inglés)
- [ ] **Copyright:** `2026 Iván García`
- [ ] **Support URL:** `https://tamio.church`
- [ ] **Privacy Policy URL:** `https://tamio.church/privacidad.html`
- [ ] **Clasificación de edad:** responder todo "None" → 4+
- [ ] **Precio:** Free (el cobro es externo por Paddle)
- [ ] **Privacidad de la app** (cuestionario de datos que recoge)

### Revisión
- [ ] **Cuenta de prueba** para el revisor (correo + contraseña con plan activo)
- [ ] Confirmar el PASO OBLIGATORIO de arriba (sin botón de compra en iOS)
- [ ] **Submit for Review** 🚀

### Aparte (fuera de Apple)
- [ ] Marcar la iglesia propia como **cortesía** en Supabase (no pagar nunca)
- [ ] Paddle: terminar verificación de identidad; desplegar `pago-webhook`
