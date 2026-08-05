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
suscripción (Lemon Squeezy) y la nube se activarán en la **1.1**.

### Por qué no hay botón de compra hoy
Los botones que abren el pago externo (`src/components/SubBanner.tsx:30` y
`src/App.tsx:267`) solo aparecen si `VITE_URL_COMPRA` tiene valor. Esa
variable no está puesta, así que **hoy no aparecen en ningún build**. ✔️

---

## ⚠️ Regla 3.1.1 — dos canales, dos builds

_Corregido el 4 ago 2026._ La nota anterior decía que el pago externo "podía
vivir en Mac" y **eso era falso**: la **Mac App Store es App Store**, y la
regla 3.1.1 (no llevar al usuario a comprar por fuera) rige allí igual que
en iOS. El corte no es iOS contra Mac — es **App Store contra descarga
directa**.

| Canal | `VITE_URL_COMPRA` | Botones de compra |
|---|---|---|
| Descarga directa (.dmg desde tamio.church) | puesta | Visibles |
| **Mac App Store** | **quitada** | **No se pintan** |
| **iOS / iPadOS** | **quitada** | **No se pintan** |

No hace falta detectar la plataforma en tiempo de ejecución: la variable se
lee al COMPILAR (`src/plan.ts:29` devuelve `null` si falta), así que son dos
builds del mismo código. La guía de la tienda lo explica en
`docs/guia-lemon-squeezy.md` → Fase 1-ter.

**Verificación obligatoria antes de firmar un build de App Store:**

- [ ] `VITE_URL_COMPRA` NO está en el `.env` (ni con valor, ni descomentada)
- [ ] En la app compilada, con un plan vencido de prueba, el aviso de
      vencimiento **no** trae botón "Renovar plan"
- [ ] La pantalla de "Plan vencido" **no** trae botón de compra

### ⚠️ El otro enlace externo: el aviso de versión nueva

**Hallado el 4 ago 2026. Hoy no dispara, pero hay que arreglarlo antes de
publicar en la Mac App Store con la tienda encendida.**

`src/components/UpdateBanner.tsx:53` abre `act.url`, que viene del
`version.json` publicado y apunta a **descargar un .dmg de GitHub
Releases**. Una app de la App Store no puede mandar al usuario a bajarse
software por su cuenta.

`src/services/update.ts:49` ya corta esto en iPhone y iPad (`if (esMovil())
return null`, con la regla 2.5.2 citada en el comentario), **pero en macOS
`esMovil()` es false**, así que un build de la Mac App Store sí consultaría
el manifiesto y sí mostraría el aviso.

**Por qué no bloquea la 1.0.8 que está en revisión:** el manifiesto sigue en
`1.0.0` y la app es `1.0.8`, así que `esMasNueva()` da false y el aviso
nunca se pinta. Es una barrera de DATOS, no de build: el día que se suba el
manifiesto a `1.1.0` para avisar a los clientes de descarga directa, las
copias de la Mac App Store empezarían a ofrecer el .dmg.

**Ojo con cuál es el archivo:** la app lee el `version.json` del repositorio
**`Tamio-web`** (`update.ts:17`), no el `web/version.json` de este repo, que
no lo lee nadie.

**Arreglo (1.1, mismo patrón de canal):** que `VITE_UPDATE_URL` admita un
valor de apagado, o una bandera de build, y que el build de App Store se
compile con el buscador de actualizaciones desactivado. Hoy un
`VITE_UPDATE_URL` vacío NO apaga nada: el `||` de `update.ts:16` cae al
valor por defecto.

### 🔒 CANDADO: no subir el manifiesto de `Tamio-web`

**Vale para el día de la aprobación y para todos los días hasta que el
arreglo de arriba esté publicado.**

El manifiesto que la app consulta vive en el repositorio **`Tamio-web`**, no
en este. Subirlo a una versión mayor que la instalada es lo que enciende el
aviso — y mientras los builds de App Store no lleven la guarda de canal, ese
aviso aparecería también en las copias de la Mac App Store, ofreciendo un
`.dmg` de GitHub.

- [ ] **NO tocar `version.json` de `Tamio-web`** hasta que un build con la
      guarda de canal esté publicado en las dos tiendas.
- [ ] Antes de tocarlo, confirmar a mano en qué versión está: la nota de
      `docs/ideas-futuras.md` (28 jul) dice `1.0.0`, pero **eso no se ha
      verificado desde entonces**.
- [ ] Si el manifiesto apunta a *GitHub Releases de este repositorio*,
      resolverlo ANTES de hacer el repo privado: un repo privado deja sus
      archivos de Releases sin descargar.

El orden completo de ese día está en `docs/dia-de-la-aprobacion.md`.

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

## 🚨 Después de lanzar: NO actualizar el `version.json` de `Tamio-web`

El banner de actualizaciones (`UpdateBanner`) también corre en iPhone y, si el
manifiesto de versión anuncia una versión mayor, mostraría a los usuarios de iOS
un botón para descargar un **`.dmg` de Mac** — prohibido por Apple (3.1.1 / 2.5.2).

> 🔴 **Corrección (1 ago 2026):** este checklist decía antes que el archivo era
> `web/version.json` **de este repo**. Era incorrecto. El que la app lee es el del
> **repo `Tamio-web`** (`src/services/update.ts:16`); el `web/` de aquí no lo lee
> nadie.

Hoy no se muestra (ese `version.json` = 1.0.0 < app 1.0.8), por eso no bloqueó la
1.0. **Antes de tocarlo, hay que ocultar el banner en iOS.** Detalle completo en
`ideas-futuras.md` → "BLOQUEANTE antes de publicar cualquier actualización".
