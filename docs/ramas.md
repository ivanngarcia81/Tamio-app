# Las ramas del repo, y qué hacer con ellas

_Escrito el 22 de agosto de 2026, cuando eran doce y sobraban diez. Hecha
ese mismo día: quedaron dos ramas y tres etiquetas._

## Lo que había

Doce ramas en `origin`. **Dos** estaban vivas; las otras diez eran cadáveres
de features que ya habían aterrizado.

| Rama | Estado |
|---|---|
| `main` | el tronco |
| `claude/design-review-execution-can5gv` | el rediseño de iPad completo + la 1.1.9. Sin fusionar |
| `claude/plaid-integration-planning-8hdyx0` | su único commit ya viajó a la rama de hoy (22 ago). Borrable |
| `actas-buscador` | su código ya está en `main` |
| `cartas-iphone` | ídem |
| `centavos` | ídem |
| `coma-decimal` | ídem |
| `ficha-iphone` | ídem |
| `hoja-nuevo-movimiento` | ídem |
| `informes-iphone` | ídem |
| `solicitud-iphone` | ídem |
| `claude/hello-9v3atw` | ídem (el sitio `tamio.church`) |

Que "su código ya está en `main`" se comprobó archivo por archivo, no por el
nombre de la rama: el buscador de actas, `carta-ios` en `CartaEditor`, el
script `verificar-centavos`, `dinero.ts`, `CarruselSecciones`, `nm-monto` en
`NuevoMovimientoIOS`, el `esIPhone` de `InformesMembresia`, `sol-tipo` en
`NuevaSolicitudIOS` y el enlace de la App Store en `docs/index.html`.

## Por qué git NO las da por fusionadas

`git branch --merged main` no devuelve ninguna, y no es que falte trabajo:
**`main` se re-fundó el 19 de agosto**. Su commit más viejo (`37b20b0`) no
tiene padres, así que el tronco guarda 50 commits y no comparte ningún
antepasado con las ramas viejas. El código viajó; el parentesco, no.

Consecuencia que importa: esas nueve ramas son **el único sitio donde vive
la historia anterior al 19 de agosto**. `solicitud-iphone` lleva 663 commits
y contiene a siete de las otras ocho; `claude/hello-9v3atw` aporta cinco
commits propios más (la página de activación de invitaciones, los precios,
los botones de compra y los enlaces de descarga). La etiqueta `v1.0.0` solo
ancla 259 de esos 663 — o sea que borrarlas a secas deja huérfanos unos
cuatrocientos commits, del 24 de julio al 19 de agosto, que GitHub acabaría
recogiendo con la basura.

Por eso el orden es: **etiquetar primero, borrar después.** Una etiqueta es
una referencia como cualquier otra: mientras exista, git conserva todo lo
que cuelga de ella, y no ensucia la lista de ramas.

## La limpieza, y cómo se hizo

Se corrió desde la Mac, y tenía que ser desde ahí: las sesiones de Claude
Code llevan el push acotado a su rama designada, así que al empujar una
etiqueta les contesta 403.

Primero las etiquetas de archivo:

```sh
git fetch origin
git tag -a archivo/historia-pre-rediseno origin/solicitud-iphone -m "Historia del repo anterior a la re-fundacion de main"
git tag -a archivo/sitio-web origin/claude/hello-9v3atw -m "Historia de la rama del sitio tamio.church"
git push origin archivo/historia-pre-rediseno archivo/sitio-web
```

Comprobar que subieron **antes** de borrar nada:

```sh
git ls-remote --tags origin
```

Y entonces sí, las diez:

```sh
git push origin --delete actas-buscador cartas-iphone centavos coma-decimal ficha-iphone hoja-nuevo-movimiento informes-iphone solicitud-iphone claude/hello-9v3atw claude/plaid-integration-planning-8hdyx0
```

La de Plaid entra en esta lista sin etiqueta de archivo: su único commit
—los tres documentos— se trajo con `git cherry-pick -x` a la rama del
rediseño, así que su contenido y su mensaje ya viven en la historia buena.

Para limpiar también las copias locales:

```sh
git fetch --prune origin
```

Quedó el repo en dos ramas —`main` y la del rediseño— y tres etiquetas
(`v1.0.0` y las dos de archivo). Antes de borrar se comprobó una por una que
la punta de cada rama colgara de una etiqueta: `archivo/historia-pre-rediseno`
ancla ocho de las nueve y `archivo/sitio-web` la restante, así que no quedó
nada huérfano. `git checkout archivo/historia-pre-rediseno` devuelve el árbol
completo de antes del rediseño, con sus 663 commits.

### El tropiezo del token

Empujar las etiquetas costó tres intentos, y el error engañaba:

```
remote: Permission to ivanngarcia81/Tamio-app.git denied to ivanngarcia81
```

Parece un problema de cuenta y no lo es: GitHub reconoció el token y lo
resolvió a la cuenta DUEÑA del repo, y aun así denegó la escritura. Cuando
dice eso, lo que falta es el permiso del token — la casilla `repo` en uno
clásico, o **Contents: Read and write** en uno *fine-grained*. El permiso de
un token no se edita: hay que generar otro. Y el nombre de usuario que pide
git da igual (aquí se escribió el correo y funcionó): con un token, GitHub
lo ignora.

El día que el token caduque volverá exactamente este 403, y a los tres meses
no se reconoce. Es esto.

## La que queda viva

- ~~**`claude/design-review-execution-can5gv`**~~ — **aterrizó en `main` el 22
  de agosto**, por avance directo (`a61a5b7..a8abf3c`). `main` ES ahora la
  1.1.9, la misma que está en TestFlight, así que la Mac ya puede compilar
  desde `main`. Por la regla de aquí abajo, esta rama se puede borrar: su
  trabajo está en `main`.

- **`claude/charming-sagan-hknqp1`** — la 1.2.0. Lleva `main` más el modo
  vertical del iPad y Membresía, y ya trae fusionada la rama de arriba (por
  eso también entra a `main` por avance directo). Se fusiona cuando la 1.2.0
  haya pasado la prueba en los iPads. **Mientras no se fusione, para compilar
  la 1.2.0 hay que estar EN esta rama**: desde `main` sale la 1.1.9.

> **Lo que costó el 22 de agosto, y de dónde sale la regla de abajo.** Ese día
> hubo DOS ramas haciendo el rediseño a la vez sin saberlo, las dos con su
> propia 1.1.9, y `main` en 1.1.8 detrás de las dos. Iván bumpeó a 1.2.0 y su
> Mac le seguía sacando la 1.1.9 — porque el bump estaba en la otra rama. Un
> `git pull` no trae lo que vive en otra rama. Antes de subir una versión,
> mirar en qué rama compila la Mac:
>
> ```sh
> for b in $(git branch -r | grep -v HEAD); do
>   echo -n "$b  "; git show "$b:src-tauri/tauri.conf.json" | grep '"version"'
> done
> ```

### Quién puede borrar una rama (y quién no)

**Una sesión de Claude Code en el contenedor no puede.** Comprobado el 22 de
agosto al intentar borrar `design-review-execution-can5gv` ya fusionada: sus
credenciales **crean y actualizan** refs —ese mismo día empujaron `main` y la
rama de la 1.2.0 sin problema— pero **borrar** una devuelve 403:

```
error: RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
send-pack: unexpected disconnect while reading sideband packet
```

Las dos sintaxis dan lo mismo (`git push origin --delete X` y
`git push origin :X`), y el servidor MCP de GitHub tiene `create_branch` y
`list_branches` pero **no** un borrado de ramas. No es el 403 del token de
arriba: aquel denegaba TODA escritura; este solo el borrado.

Así que el borrado es de Iván, desde su Mac:

```sh
git push origin --delete claude/design-review-execution-can5gv
git fetch --prune origin      # para que deje de aparecer en `git branch -r`
```

O desde GitHub: *Branches* → la papelera al lado del nombre. Si se borra por
error, GitHub la ofrece con *Restore* durante un tiempo, y el commit
`a8abf3c` sigue siendo la punta de `main`.

## La regla, para no volver aquí

Una rama se borra **en cuanto su trabajo llega a `main`**, no meses después.
Las diez de esta lista sobrevivieron porque nadie las cerró al aterrizar, y
cuando `main` se re-fundó dejaron de poder detectarse con `--merged`: lo que
era un `git branch -d` de un segundo se convirtió en esta investigación.
