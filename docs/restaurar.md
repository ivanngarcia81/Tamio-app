# Restaurar un respaldo — diseño acordado

**Estado: diseñado, NO implementado.** No se escribe una línea de Rust hasta que
`main` compile en la Mac. Este documento es lo que se va a construir y por qué.

## El agujero que cierra

Tamio tiene respaldo y no tiene restauración. Si la Mac se muere, el tesorero
abre Tamio en la nueva, tiene el archivo en la mano y no hay ningún botón donde
ponerlo. Lo único reimportable hoy es el CSV de movimientos y el de miembros, así
que en un desastre real se pierden los depósitos bancarios, las actas, las
cartas, los registros de cultos con su asistencia, la agenda y todos los
comprobantes. La mitad de Secretaría no tiene ni exportación.

Convertir el respaldo en paquete fue lo correcto, pero mejoró la mitad del
mecanismo que no faltaba.

## Decisión 1 — Cómo se sustituye la base con la conexión abierta

`DbCifrada` mantiene un `Mutex<Connection>` vivo desde el arranque, así que no se
puede cambiar el archivo por debajo.

**Elegido: preparar a un lado y aplicar en el arranque siguiente, reiniciando la
app.**

Descartada la alternativa (cerrar la conexión en caliente, sustituir, reabrir y
migrar) por tres motivos:

1. **El único momento en que nadie tiene la base abierta es antes de abrirla.**
   Aplicar el cambio ahí no necesita cirugía en el `Mutex` ni convertirlo en
   `Mutex<Option<Connection>>`, que obligaría a tocar todos los comandos.
2. **El frontend no se entera.** Restaurar en caliente cambia todos los datos
   bajo una interfaz que tiene meses, miembros y páginas ya cargados en estado
   de React. Habría que invalidar todo a mano y cualquier hueco muestra datos
   viejos sobre una base nueva. Reiniciar lo evita entero.
3. **Un fallo a medias no deja al tesorero sin nada.** Si el paquete está
   dañado, se descubre al prepararlo y la base actual no se ha tocado todavía.

Coste: el usuario ve «Tamio se va a reiniciar para aplicar el respaldo». Es
aceptable — restaurar pasa una vez en la vida y ese aviso además comunica bien
lo serio que es.

### Secuencia

1. El usuario elige el archivo en el diálogo.
2. Rust reconoce el formato **por contenido, no por extensión**: firma
   `PK\x03\x04` → paquete (`paquete::es_zip`); `SQLite format 3\0` → `.db` suelto
   de un respaldo antiguo (`motordb::es_sqlite_plano`). Cualquier otra cosa se
   rechaza aquí.
3. Se extrae a `restauracion/` dentro de la carpeta de la app.
4. Se abre la base extraída (viene descifrada, se lee sin clave) y se cuentan
   movimientos, miembros y la fecha del último registro. **Esos números son los
   que ve el usuario en la confirmación** — no un «¿seguro?» genérico.
5. Doble confirmación, con el mismo tratamiento que el reinicio de fábrica: qué
   trae el paquete, de qué fecha, y que la base actual se aparta.
6. Al confirmar se escribe un marcador y la app se reinicia.
7. En el arranque, **antes** de abrir la base:
   - la base actual se aparta como `tesoreria.db.antes-de-restaurar-AAAA-MM-DD-HHMM`
     (apartar, nunca borrar);
   - la base del paquete se cifra con la clave del Llavero **de esta Mac**
     (`motordb::migrar_a_cifrado`) y ocupa su sitio;
   - `datos/` se **fusiona** con la carpeta actual (política de `docs/respaldo.md`);
   - se borra `restauracion/`.
8. Arranque normal: las migraciones corren solas, como siempre.

**El punto que hace portable el respaldo** es el cifrado del paso 7: el
`tamio.db` del paquete viene descifrado a propósito, porque la clave del Llavero
del equipo de origen no existe en el destino. Se cifra al llegar, con la clave
de aquí.

## Decisión 2 — Restaurar con la nube encendida

`src/sync.ts` es last-write-wins por `uid` comparando `updated_at`. Eso deja dos
comportamientos, y los dos están mal:

- **Nube con datos:** es la autoridad. Al restaurar un respaldo de hace tres
  meses, la primera sincronización sobrescribe casi todo lo recién restaurado y
  los borrados propagados vuelven a borrar. El tesorero ve aparecer sus datos y
  desaparecer solos.
- **Nube vacía o reiniciada:** lo restaurado se sube como verdad, incluidas las
  filas que se habían borrado a propósito desde otro dispositivo.

**Elegido: restaurar es una operación deliberadamente local. Al terminar, la
sincronización queda PAUSADA con un aviso visible** («Revisa que los datos estén
bien y luego reactiva la sincronización»).

El motivo de fondo: quien restaura lo hace porque algo salió mal. Dejar que el
equipo que quizá causó el problema empiece a empujar o a tirar de la nube en
automático es exactamente lo contrario de lo que hace falta. Ninguna regla
automática acierta en los dos casos, así que la decisión es de un humano — y
este es el único momento en que se puede parar a mirarlos.

Hoy esto no cuesta nada: el login está desactivado en la 1.0 (`LOGIN_HABILITADO
= false`), así que la sincronización ni corre. Se deja decidido y construido
para cuando vuelva.

## Alcance

Solo escritorio en la primera versión. En iPad/iPhone la app se actualiza y se
respalda por otros caminos, y `restart()` no existe igual; se añadirá después si
hace falta.

## Pendiente aparte (no entra aquí)

La mitad de Secretaría no tiene exportación a CSV: actas, cartas, servicios con
su asistencia y agenda solo salen dentro del paquete. Con la restauración hecha
deja de ser urgente, pero sigue siendo una asimetría que conviene cerrar.
