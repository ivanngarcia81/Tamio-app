# El día de la aprobación — orden de operaciones

_Escrito el 4 de agosto de 2026, con la 1.0.8 esperando en la cola de Apple._

> # ✅ PUBLICADA — 13 de agosto de 2026
>
> Apple aprobó la 1.0 (build 1.0.8) el 13 de agosto, quince días después del
> envío, sin ningún rechazo. Iván le dio a **Release This Version** el mismo
> día y **Tamio está viva en la App Store**.
>
> **Lo que se desbloquea hoy:** `main` deja de estar congelada. La razón del
> congelamiento era que un rechazo obliga a corregir y volver a subir el mismo
> día, y eso ya no puede pasar. La rama `centavos` se puede fundir en cuanto
> pasen las cinco pruebas del paso 5 en la Mac.
>
> **Lo que NO se desbloquea, y ahora importa de verdad:** el candado del
> `version.json` de `Tamio-web` sigue puesto. Antes era una precaución; ahora
> hay iglesias instalando la 1.0.8, que **no lleva la guarda de canal**. El día
> que ese manifiesto suba de versión, esas copias empezarían a ofrecerles
> descargar un `.dmg`. Se levanta cuando un build CON la guarda esté publicado
> —o sea, con la 1.1—, no antes.
>
> **Y una regla nueva que empieza hoy:** a partir de ahora los errores de
> `main` le pasan a gente de verdad. Lo que entre a `main` se prueba antes,
> aunque parezca pequeño.

## Por qué existe este documento

El día que Apple apruebe la 1.0.8 van a querer hacerse cuatro o cinco cosas a
la vez: encender el cobro, subir el manifiesto de actualizaciones, empezar los
centavos, cerrar el repositorio. **Ese es el día de más riesgo de todo el
proyecto**, porque varias operaciones irreversibles se juntan y cada una tiene
un orden correcto que no es obvio.

La regla que gobierna todo el documento: **el día de la aprobación, el número
correcto de cambios al producto ya publicado es CERO.** Lo que se hace ese día
es higiene de repositorio y arrancar la rama de la 1.1. Nada que toque lo que
los usuarios ya tienen instalado.

---

## Lo que NO se hace el día de la aprobación

### No subas el manifiesto de `Tamio-web`

Es el candado más importante y hoy no está escrito en ninguna otra parte.

`web/version.json` de este repo no lo lee nadie. **El que la app consulta es el
de `Tamio-web`** (`src/services/update.ts:17`).

> ⚠️ **Corrección de dato:** una versión anterior de esta nota decía "lo
> verifiqué: sigue en `1.0.0`". **Eso no se verificó.** `Tamio-web` es otro
> repositorio, fuera del alcance de esta sesión, y la red de este entorno
> bloquea las salidas a hosts arbitrarios. La afirmación de que sigue en
> `1.0.0` viene de `docs/ideas-futuras.md`, escrito el 28 de julio. **Antes de
> tocar nada ese día, Iván abre el archivo y confirma el número con sus
> ojos.** Si estuviera ya por encima de `1.0.8`, el problema de abajo no sería
> futuro sino presente.

El día que ese manifiesto suba a `1.1.0` para avisar a los clientes de descarga
directa, **las copias de la Mac App Store empezarán a ofrecer un `.dmg`**, y la
1.0.8 aprobada no lleva la guarda de canal (punto 9 del plan de la 1.1). Hoy no
dispara porque `esMasNueva()` da falso: es una barrera de datos, no de código.

> **Sobre el número de regla:** el comentario de `update.ts:46` cita la **2.5.2**
> (software autocontenido, no descargar ni ejecutar código), que es la que se
> invocó para iOS. Para macOS la sección específica es la **2.4.5**. Cuál de
> las dos cite Apple en un rechazo da igual: la conducta prohibida es la misma
> y el arreglo también.

**El manifiesto no se toca hasta que un build con la guarda de canal esté
publicado.** Ese acto es de Iván, en otro repositorio, sin pasar por ninguna
tarea de esta lista — por eso está escrito aquí y en
`docs/checklist-app-store.md`.

### No enciendas el modo real de la tienda

Y no por prudencia: **no hay nada que vender todavía.** La 1.0 sale gratis, con
el login desactivado y sin muro de pago. El cobro empieza a tener sentido
cuando exista el login de la 1.1, que es lo que le da al webhook el correo con
el que encontrar al comprador.

El modo de pruebas sí: eso se monta esta semana y valida firma, formato y
despliegue. Recuerda que el `404 usuario no encontrado` en esa prueba **es un
aprobado**, no un fallo.

### No subas ningún build nuevo hasta que la 1.1 esté lista

La aprobación no es una invitación a publicar. `tauri.conf.json` y
`package.json` siguen en `1.0.8`, la misma versión que Apple tiene en cola, y
así se quedan hasta que la 1.1 esté completa y probada.

---

## Lo que sí se hace, en este orden

### Paso 0 — Publicar la versión aprobada

**Añadido el 4 ago.** No estaba en la lista y es lo primero: la versión quedó
en **"Manually release"** (`docs/checklist-app-store.md`), así que aprobada no
es publicada. Hay que entrar a App Store Connect y darle a **Release this
version**.

No contradice la regla de cero cambios: no se cambia nada, se suelta lo que
Apple ya revisó. Si no se hace, la app no llega a nadie.

### Paso 1 — Comprobar el plan de GitHub antes de tocar nada

**En el plan gratuito, GitHub Pages exige repositorio público.** Si el repo se
cierra estando en plan gratuito, tamio.church se apaga — justo cuando Apple,
Lemon Squeezy y los primeros clientes están mirando.

Iván lo comprueba en la configuración de su cuenta. **Si el plan es gratuito,
el orden de abajo es obligatorio; no hay atajo.** Si es de pago, sigue siendo
el orden recomendado.

### Paso 2 — Mover el sitio a un repositorio propio

Los `.html` de `docs/` (`index`, `privacidad`, `terminos`, `reembolsos`) y el
`CNAME` se van fuera. **Los `.md` se quedan aquí**: son notas internas de
producto y pertenecen al repo del código.

**Dos avisos verificados el 4 ago:**

1. **Los archivos se copian desde `main`, no desde la rama.** Hoy Pages sirve
   desde `claude/hello-9v3atw`, que está **cero commits por delante de `main`**
   (y bastantes por detrás): lo que se ve en tamio.church es una foto vieja.
   Copiar desde la rama congelaría esa foto vieja para siempre.
2. **Hoy tamio.church no ofrece ninguna descarga.** `docs/index.html` no tiene
   ni un enlace al `.dmg`; los botones de descarga viven en `web/index.html` y
   `web/en.html`, que no los sirve nadie. Si el plan es que la gente descargue
   Tamio desde la web el día de la aprobación, **eso todavía hay que
   construirlo** — no es parte de mover archivos de sitio.

#### La trampa del manifiesto — resuelta

`Tamio-web` se sirve hoy como página de proyecto en
`ivanngarcia81.github.io/Tamio-web/`, que es exactamente la URL desde la que la
app lee el manifiesto (`update.ts:17`). Ponerle el dominio `tamio.church` a ese
repositorio hace que GitHub redirija la URL de `github.io` al dominio nuevo.

**El código dice que esa redirección rompería la comprobación de
actualizaciones, y por un motivo más duro que el redirect en sí.** El CSP de
`src-tauri/tauri.conf.json:37` lista los destinos permitidos:

```
"connect-src": "'self' ipc: http://ipc.localhost https://ivanngarcia81.github.io https://*.supabase.co"
```

`tamio.church` **no está en esa lista**. Aunque `fetch` siga la redirección, el
CSP se aplica también al destino, así que la petición muere ahí. Y como
`buscarActualizacion()` envuelve todo en un `try/catch` que devuelve `null`
(`update.ts:59-61`), **falla en silencio**: nadie se entera de que la
comprobación dejó de funcionar. El CSP viaja dentro del binario, así que las
copias ya instaladas se quedan rotas para siempre; no hay arreglo del lado del
servidor.

**Recomendación: la primera opción, y en su forma más estricta.**

> **El sitio público va a un repositorio NUEVO, y `Tamio-web` no se toca.**

`Tamio-web` sigue sirviendo solo el manifiesto, en la misma URL de
`github.io`, sin `CNAME` y sin dominio. Cero redirecciones, cero cambios de
CSP, cero riesgo para las máquinas que ya tienen Tamio instalado.

La segunda opción —mover el manifiesto al dominio nuevo y actualizar
`update.ts`— es estrictamente peor: obliga además a tocar el CSP, solo protege
a los builds futuros, y deja a las copias ya instaladas consultando una URL que
redirige a un destino que su propio CSP rechaza. Es decir, las rompe.

### Paso 3 — Verificar que el sitio carga

Con el dominio ya movido: abrir tamio.church, comprobar que carga, que el
certificado es válido (Pages tarda en reemitirlo) y que **la política de
privacidad y los términos responden** — son los enlaces que Apple y Lemon
Squeezy consultan.

**No pasar al paso 4 hasta que esto esté verificado.**

### Paso 4 — Apagar Pages en este repositorio

Ahora que el sitio vive en otro sitio y está comprobado.

### Paso 5 — Volver el repositorio a privado

Con el sitio fuera y Pages apagado, ya se puede cerrar. Lo que queda expuesto
mientras esté abierto: el código completo de una app de pago y el mecanismo de
cortesía documentado en `planes.md`.

> ⚠️ **Consecuencia que no estaba contemplada:** al hacer privado el
> repositorio, **los archivos adjuntos de GitHub Releases dejan de ser
> descargables** para quien no tenga acceso. Y `web/version.json:3` apunta a
> `github.com/ivanngarcia81/tesoreria-Mac-/releases/latest/download/Tamio_universal.dmg`.
>
> Hoy no rompe nada —ese archivo no lo lee nadie y el sitio no ofrece
> descargas— pero **si el manifiesto de `Tamio-web` apunta al mismo sitio, el
> día que se encienda el aviso de actualización el enlace estará muerto.** No
> pude comprobar a dónde apunta el de `Tamio-web`. **Iván lo mira antes de
> cerrar el repositorio**, y si apunta a Releases de este repo hay que decidir
> dónde vivirán los `.dmg`: un repositorio público solo para lanzamientos, o el
> propio sitio.

### Paso 6 — Borrar la rama `claude/hello-9v3atw`

Y no antes: hoy sigue existiendo **solo** porque Pages publica desde ella. Con
Pages apagado ya no sostiene nada.

**Comprobado el 4 ago:** la rama tiene **cero commits que no estén en `main`**.
Borrarla no pierde nada.

```
git push origin --delete claude/hello-9v3atw
```

### Paso 7 — Abrir la rama de los centavos

Recién ahora. `docs/plan-centavos.md` es el plan; se ejecuta en rama propia,
sin mezclar con nada. Es el punto 1 de la 1.1 y el más invasivo de todos.

---

## Resumen de un vistazo

| Orden | Qué | Quién | No seguir hasta |
|---|---|---|---|
| 0 | Publicar la versión aprobada ("Release this version") | Iván | — |
| 1 | Comprobar plan de GitHub | Iván | — |
| 2 | Mover sitio y `CNAME` a un repo **nuevo** (no a `Tamio-web`) | Iván | copiar los archivos desde `main` |
| 3 | Verificar tamio.church, privacidad y términos | Iván | que cargue con certificado válido |
| 4 | Apagar Pages aquí | Iván | paso 3 verificado |
| 5 | Repositorio a privado | Iván | comprobar a dónde apunta el manifiesto |
| 6 | Borrar la rama vieja | Claude Code | paso 4 hecho |
| 7 | Abrir rama de centavos | Claude Code | todo lo anterior |

**Nunca, ese día:** subir el manifiesto, encender el modo real de la tienda,
publicar un build nuevo.

---

## Los tres datos que Iván debe mirar con sus ojos

Ninguno de los tres se puede comprobar desde este repositorio, y los tres
cambian lo que se hace:

1. **La versión del manifiesto de `Tamio-web`.** Si ya está por encima de
   `1.0.8`, el problema del `.dmg` es presente, no futuro.
2. **A dónde apunta la URL de ese manifiesto.** Si es a Releases de este repo,
   hacerlo privado mata el enlace.
3. **El plan de la cuenta de GitHub.** Decide si el orden de los pasos 2 a 5 es
   obligatorio o solo recomendable.
