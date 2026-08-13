// Canal de distribución: por dónde llegó esta copia de Tamio al usuario.
//
// El mismo código se publica por dos caminos con reglas distintas:
//
//   descarga  — el .dmg firmado que se baja de tamio.church. Puede cobrar por
//               su cuenta y puede avisar de que hay una versión nueva.
//   appstore  — Mac App Store, iPad y iPhone. Apple prohíbe las dos cosas:
//               mandar al usuario a pagar fuera (3.1.1) y ofrecerle descargar
//               software que no venga de la tienda (2.5.2 / 2.4.5).
//
// **Es una decisión de compilación, no de ejecución.** Se elige al construir y
// queda cocida en el binario. Una bandera que se pudiera cambiar en caliente
// sería, para el revisor de Apple, exactamente lo que la regla prohíbe: una
// tienda escondida esperando a activarse.
//
// Una sola variable manda sobre las dos reglas a propósito. Con un interruptor
// por regla, tarde o temprano se quedan en desacuerdo —la de compras apagada y
// la de actualizaciones encendida— y ese build llega a revisión.
//
// El valor por defecto es `descarga` porque olvidarse de ponerlo en un .dmg
// solo significa que el .dmg sale bien. Olvidarse en un build de App Store lo
// caza `scripts/verificar-canal.mjs`, que mira el bundle YA construido y no la
// intención de quien lo construyó.

export type Canal = "descarga" | "appstore";

/** ¿Este build va a una tienda de Apple? Si sí: ni enlaces de compra ni aviso
 *  de versión nueva.
 *
 *  **La comparación va escrita así, cruda y sin `.trim()`, a propósito.** Vite
 *  sustituye `import.meta.env.VITE_CANAL` por el literal al compilar, así que
 *  esto queda en `"appstore" === "appstore"` y el empaquetador lo puede
 *  resolver a `true` — que es lo que le permite BORRAR del bundle la rama que
 *  no se usa, con su dirección dentro. Con un `?.trim()` de por medio ya no es
 *  una expresión constante, no se resuelve, y las dos ramas sobreviven: el
 *  primer intento de esto dejaba la dirección del manifiesto dentro del build
 *  de App Store. Lo cazó `verificar-canal.mjs` mirando el bundle.
 *
 *  Que no admita espacios sobrantes es una ventaja, no un descuido:
 *  `VITE_CANAL="appstore "` no se parece a `appstore`, el build sale de canal
 *  `descarga`, y el verificador lo para en seco en vez de dejarlo pasar a medio
 *  configurar. */
export const esAppStore: boolean = import.meta.env.VITE_CANAL === "appstore";

export const CANAL: Canal = esAppStore ? "appstore" : "descarga";

/** Manifiesto de versión que consulta el buscador de actualizaciones, o `null`
 *  si este build no debe buscar ninguna.
 *
 *  El `null` va PRIMERO en el ternario para que la dirección no llegue siquiera
 *  a nombrarse en un build de tienda: lo que no está en el bundle no lo puede
 *  encontrar nadie leyéndolo. Es lo que comprueba `verificar-canal.mjs`. */
export const URL_ACTUALIZACION: string | null = esAppStore
  ? null
  : (import.meta.env.VITE_UPDATE_URL as string | undefined) ||
    "https://ivanngarcia81.github.io/Tamio-web/version.json";
