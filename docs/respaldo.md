# El respaldo de Tamio

## Qué es

Un archivo `.zip` (`tamio-respaldo-2026-08-02.zip`) con dos cosas dentro:

```
tamio.db      la base de datos, DESCIFRADA y legible en cualquier equipo
datos/        comprobantes, adjuntos de cartas, logo y firmas
```

## Por qué dejó de ser solo el `.db`

Hasta la 1.0.8 el respaldo era el archivo de la base y nada más. Eso funcionaba
por accidente: los comprobantes se guardaban con la ruta del archivo que el
usuario había elegido, así que vivían en su Escritorio o en Descargas y se los
llevaba su Time Machine o su iCloud.

Al mover los comprobantes dentro de la carpeta de la app —que era lo correcto,
porque así no se pierden cuando alguien ordena su Escritorio— ese accidente
desapareció: restaurar el `.db` solo en otra Mac dejaba la base apuntando a
archivos que allí no existen, y todos los comprobantes desaparecían en
silencio. Justo después de haberlos "protegido".

Para una tesorería auditable eso es lo contrario de lo que se buscaba, así que
el respaldo pasa a llevarse también los documentos.

## Detalles técnicos

- **Sin comprimir.** Los comprobantes son JPG y PDF, que ya vienen comprimidos.
  La base sí comprimiría, pero no compensa arrastrar un compresor por eso.
- **El ZIP se escribe a mano** (`src-tauri/src/paquete.rs`, ~100 líneas) en vez
  de usar una caja externa. El formato ZIP clásico está congelado desde 1989 y
  la validación del diseño se hizo replicando byte a byte la misma lógica en
  Python y abriéndola con `zipfile`.
- **Tope de 3,5 GB.** Por encima haría falta ZIP64. Se corta antes con un
  mensaje claro en vez de escribir un archivo corrupto que nadie descubriría
  hasta necesitarlo.
- **La base sin cifrar solo existe dentro del paquete.** Se exporta a un
  temporal en la carpeta de la app, entra al ZIP y se borra. Nunca queda suelta
  en el disco del usuario.
- **Nunca entra la base viva** (`tesoreria.db` y sus `-wal`/`-shm`): está
  cifrada y sería ilegible sin la clave del Llavero de esa Mac.

## Restaurar

⚠️ **Hoy la app NO tiene función de restaurar.** Verificado: `services/backup.ts`
solo exporta, y no hay ningún comando ni pantalla que importe una base. Se
restaura a mano, reemplazando los archivos en la carpeta de datos de la app.

Cuando se implemente, esta es la política decidida y el motivo.

### Qué pasa con los archivos que ya están en la carpeta: **FUSIONAR**

Al restaurar, el contenido de `datos/` se copia encima de la carpeta actual sin
borrar nada de lo que ya hubiera.

**Por qué fusionar y no reemplazar:**

1. **La invariante que importa es que la base nunca apunte a archivos que no
   están.** Fusionar la garantiza: todo lo que la base restaurada referencia
   viene dentro del paquete y se escribe. Los archivos que ya estaban sobran,
   pero no rompen nada.
2. **Reemplazar (vaciar la carpeta primero) es destructivo y no hace falta.**
   Si la restauración se corta a medias —disco lleno, ZIP dañado, cierre
   accidental— con "reemplazar" el usuario se queda sin lo viejo y sin lo
   nuevo. Con "fusionar", lo peor que pasa es que sobren archivos.
3. **Las colisiones de nombre son prácticamente imposibles.** Cada comprobante
   se guarda como `<milisegundos>-<nombre>.<ext>`, y cada adjunto de carta como
   `<folio>-<milisegundos>.<ext>`. Dos archivos distintos con el mismo nombre
   exigirían el mismo milisegundo y el mismo nombre original. Si aun así
   ocurriera, gana el del paquete: es el que la base restaurada referencia.

**El coste** de fusionar es espacio: quedan archivos huérfanos que ninguna fila
de la base menciona. Eso se limpia aparte, con la tarjeta "Compactar base de
datos" de Ajustes, que puede barrer los adjuntos sin referencia. Es una
operación segura de posponer; perder un comprobante no lo es.

### Reconocer el formato

Cuando exista la importación tiene que aceptar los dos: el paquete `.zip` nuevo
y el `.db` suelto de siempre, para no romper los respaldos ya guardados. La
detección va **por contenido, no por extensión** — el usuario renombra archivos.
`paquete::es_zip()` ya mira la firma `PK\x03\x04`; un `.db` de SQLite empieza
por `SQLite format 3\0`, que es lo que comprueba `motordb::es_sqlite_plano()`.
