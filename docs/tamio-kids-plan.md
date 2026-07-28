# Tamio Kids — Plan revisado

> **Evaluación de viabilidad (revisión técnica, 28 jul 2026):** ver la sección
> "Veredicto de viabilidad" al final. Resumen: el plan es sólido y **sí se puede
> implementar**. El **v1 (una sola máquina, sin red, sin QR, sin impresora
> térmica)** encaja directo con la arquitectura actual de Tamio y es un buen
> candidato a "Tamio 2.0". La parte de **Mac-como-servidor + iPads clientes por
> red local (v1.1)** es la única pieza arquitectónicamente nueva y la de mayor
> riesgo; conviene tratarla como hito aparte y prototiparla sola.

Documento técnico para implementación. Reemplaza el borrador anterior.

---

## 0. Las cinco decisiones que hay que cerrar antes de escribir código

Estas cinco eliminan la mayoría de la complejidad del borrador original.

**0.1 — Una sola base de datos, local y cifrada. No hay bóveda separada.**

El borrador partía los datos en dos: backend en la nube para lo administrativo y un "Vault" local para lo médico. Eso duplica sistemas sin ganar privacidad: si la base ya vive en la iglesia, ya es privada.

Decisión: una sola SQLite cifrada (SQLCipher) en la Mac de la iglesia. Los campos médicos viven en su propia tabla con permiso por rol, en el mismo archivo, la misma transacción y el mismo respaldo. Lo que protege el dato médico es el control de acceso y el cifrado en reposo, no vivir en otro archivo.

Si algún día hay sincronización a la nube, se sincronizan tablas explícitamente marcadas y las médicas nunca están en esa lista. Eso se decide con una bandera por tabla, no con una arquitectura paralela.

**0.2 — La Mac es el servidor. Los iPads son clientes de red local. No hay sincronización entre dispositivos.**

"Los registros se sincronizan cuando regresa la conexión" es una sola frase del borrador que esconde el problema más difícil de todo el sistema: tres iPads escribiendo a la misma sesión sin red, generando códigos que pueden chocar, marcando salidas que el otro dispositivo no ve.

Decisión: no se resuelve, se elimina. La Mac corre un servidor HTTP local anunciado por Bonjour (`_tamio._tcp`). Los iPads lo descubren y son clientes delgados. Un solo escritor, una sola verdad, cero conflictos.

Tamio Kids está offline **del internet**, no offline entre dispositivos. Eso es exactamente lo que la iglesia necesita: el internet se cae, la red local no.

Si la Mac muere a mitad del culto, los iPads pasan a modo degradado: cola local de solo-escritura y check-out solamente por código impreso verificado a mano. No intentan ser autoritativos.

**0.3 — Identidad en dispositivo compartido: dispositivo inscrito + PIN de turno.**

El iPad de la puerta pasa de mano en mano. Login por transacción es inusable; sin login la auditoría no vale nada ("¿quién entregó al niño?" → "el iPad").

Decisión: el dispositivo se inscribe una vez con una llave. El voluntario abre turno con un PIN de 4 dígitos, y la pantalla muestra siempre `Turno: María R.` con un botón grande para cambiar. Cada registro guarda dispositivo + voluntario de turno. El turno se cierra por inactividad de 20 minutos o al terminar el servicio.

**0.4 — Tres roles, no cinco.**

La rotación de voluntarios en ministerio infantil es altísima. Cada rol es una matriz de permisos que mantener y una capacitación más. Separar "voluntario de check-in" de "voluntario de check-out" es artificial: es la misma persona en la misma mañana.

Decisión: `administrador`, `encargado`, `voluntario`. El maestro de salón es un voluntario con un salón asignado; eso es un dato, no un rol.

**0.5 — Todo camino crítico tiene salida en papel.**

Si el QR falla, si la impresora se atasca, si la Mac se apaga, si se va la luz: el domingo tiene que terminar bien. Cada flujo de este documento define su camino manual.

---

## 1. Modelo de datos

```sql
-- Personas: reutiliza la tabla que Secretaría ya tiene.
-- Kids NO crea miembros. Crea fichas sobre personas existentes,
-- o personas marcadas como visitantes.

CREATE TABLE familias (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT NOT NULL,          -- "Familia García"
  token_qr        TEXT NOT NULL UNIQUE,   -- opaco, 22 chars, sin PII
  telefono        TEXT,
  direccion       TEXT,
  creada_en       TEXT NOT NULL,
  activa          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE familia_personas (
  familia_id      INTEGER NOT NULL REFERENCES familias(id),
  persona_id      INTEGER NOT NULL REFERENCES personas(id),
  rol             TEXT NOT NULL,          -- padre|madre|tutor|nino|otro
  contacto_primario INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (familia_id, persona_id)
);

CREATE TABLE ninos_ficha (
  persona_id      INTEGER PRIMARY KEY REFERENCES personas(id),
  fecha_nacimiento TEXT NOT NULL,         -- necesaria para asignar salón
  salon_id        INTEGER REFERENCES salones(id),
  estado          TEXT NOT NULL,          -- activo|visitante|inactivo
  inicio_asistencia TEXT,
  foto_ruta       TEXT,
  consentimiento_id INTEGER REFERENCES consentimientos(id),
  notas           TEXT
);

CREATE TABLE consentimientos (
  id              INTEGER PRIMARY KEY,
  persona_id      INTEGER NOT NULL REFERENCES personas(id),
  firmado_por     TEXT NOT NULL,          -- nombre del tutor
  fecha_firma     TEXT NOT NULL,
  medio           TEXT NOT NULL,          -- papel|digital
  permite_foto    INTEGER NOT NULL DEFAULT 0,
  permite_medico  INTEGER NOT NULL DEFAULT 0,
  vence_en        TEXT,                   -- renovación anual
  archivo_ruta    TEXT                    -- escaneo del papel firmado
);

-- Datos sensibles: misma base, tabla aparte, acceso por rol y auditado.
CREATE TABLE ninos_salud (
  persona_id      INTEGER PRIMARY KEY REFERENCES personas(id),
  alergias        TEXT,
  medicamentos    TEXT,
  instrucciones   TEXT,                   -- qué hacer en una reacción
  restricciones_alimentarias TEXT,
  contacto_emergencia_nombre TEXT,
  contacto_emergencia_tel    TEXT,
  gravedad        TEXT NOT NULL DEFAULT 'ninguna', -- ninguna|leve|grave
  actualizado_en  TEXT NOT NULL,
  actualizado_por INTEGER NOT NULL REFERENCES usuarios(id),
  informado_por   TEXT                    -- quién dio la información
);

CREATE TABLE autorizados_recogida (
  id              INTEGER PRIMARY KEY,
  nino_persona_id INTEGER NOT NULL REFERENCES personas(id),
  nombre          TEXT NOT NULL,
  relacion        TEXT NOT NULL,
  telefono        TEXT,
  foto_ruta       TEXT,
  estado          TEXT NOT NULL,          -- permanente|temporal|restringido
  vence_en        TEXT,                   -- obligatorio si temporal
  motivo_restriccion TEXT,                -- solo visible a encargado+
  documento_ruta  TEXT,                   -- orden judicial escaneada
  creado_por      INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en       TEXT NOT NULL
);

CREATE TABLE salones (
  id              INTEGER PRIMARY KEY,
  nombre          TEXT NOT NULL,
  edad_min        INTEGER NOT NULL,
  edad_max        INTEGER NOT NULL,
  capacidad       INTEGER NOT NULL,
  ratio_objetivo  INTEGER NOT NULL DEFAULT 8, -- niños por adulto
  activo          INTEGER NOT NULL DEFAULT 1
);

-- Cuelga del servicio que Secretaría ya registra.
CREATE TABLE sesiones_kids (
  id              INTEGER PRIMARY KEY,
  servicio_id     INTEGER NOT NULL REFERENCES servicios(id),
  abierta_en      TEXT NOT NULL,
  cerrada_en      TEXT,
  cerrada_por     INTEGER REFERENCES usuarios(id)
);

CREATE TABLE checkins (
  id              INTEGER PRIMARY KEY,
  sesion_id       INTEGER NOT NULL REFERENCES sesiones_kids(id),
  nino_persona_id INTEGER NOT NULL REFERENCES personas(id),
  salon_id        INTEGER NOT NULL REFERENCES salones(id),
  codigo          TEXT NOT NULL,          -- 4 chars, único en la sesión
  entrada_en      TEXT NOT NULL,
  entrada_por     INTEGER NOT NULL REFERENCES usuarios(id),
  entrada_dispositivo TEXT NOT NULL,
  entregado_por   TEXT,                   -- quién trajo al niño
  salida_en       TEXT,
  salida_por      INTEGER REFERENCES usuarios(id),
  salida_dispositivo TEXT,
  recogido_por    TEXT,
  recogido_autorizado_id INTEGER REFERENCES autorizados_recogida(id),
  estado          TEXT NOT NULL,          -- presente|recogido|manual|cerrado_auto
  excepcion_motivo TEXT,
  excepcion_aprobada_por INTEGER REFERENCES usuarios(id),
  UNIQUE (sesion_id, codigo)
);
-- checkins NUNCA se borra ni se edita. Es el registro legal.

CREATE TABLE traslados (
  id              INTEGER PRIMARY KEY,
  checkin_id      INTEGER NOT NULL REFERENCES checkins(id),
  salon_origen    INTEGER NOT NULL REFERENCES salones(id),
  salon_destino   INTEGER NOT NULL REFERENCES salones(id),
  motivo          TEXT,
  en              TEXT NOT NULL,
  por             INTEGER NOT NULL REFERENCES usuarios(id)
);

CREATE TABLE voluntarios_sesion (
  sesion_id       INTEGER NOT NULL REFERENCES sesiones_kids(id),
  usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
  salon_id        INTEGER REFERENCES salones(id),
  entrada_en      TEXT NOT NULL,
  salida_en       TEXT,
  PRIMARY KEY (sesion_id, usuario_id)
);

CREATE TABLE incidentes (
  id              INTEGER PRIMARY KEY,
  sesion_id       INTEGER NOT NULL REFERENCES sesiones_kids(id),
  nino_persona_id INTEGER NOT NULL REFERENCES personas(id),
  tipo            TEXT NOT NULL,          -- golpe|llanto|medicamento|conducta|otro
  descripcion     TEXT NOT NULL,
  en              TEXT NOT NULL,
  por             INTEGER NOT NULL REFERENCES usuarios(id),
  informado_a_tutor INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE auditoria (
  id              INTEGER PRIMARY KEY,
  en              TEXT NOT NULL,
  usuario_id      INTEGER REFERENCES usuarios(id),
  dispositivo     TEXT,
  accion          TEXT NOT NULL,          -- incluye 'consulta_salud'
  entidad         TEXT NOT NULL,
  entidad_id      INTEGER,
  antes           TEXT,                   -- JSON
  despues         TEXT
);
-- Solo inserción. Trigger que bloquea UPDATE y DELETE.
```

---

## 2. El código de seguridad — especificación exacta

El borrador decía "código único y temporal" sin definirlo. Hay que cerrarlo:

- **Alfabeto:** `ACDEFGHJKLMNPQRTUVWXY34679` — 26 caracteres, sin `0/O`, `1/I/L`, `S/5`, `B/8`, `2/Z`. Los voluntarios van a leerlos en voz alta y a mano.
- **Longitud:** 4 → 456.976 combinaciones. Unicidad garantizada por `UNIQUE (sesion_id, codigo)` con reintento; no por suerte.
- **Alcance:** único por sesión, no globalmente. Se puede repetir el próximo domingo.
- **Un código por niño**, no por familia.
- **El QR no contiene el código.** Contiene un token opaco de un uso ligado al `checkin_id`. Si alguien fotografía la etiqueta de otro, el token no le sirve porque la verificación también exige que la persona esté en la lista de autorizados.
- **Invalidación por niño.** Un recibo familiar puede listar tres códigos; entregar a Samuel invalida el de Samuel y deja vivos los otros dos.

### Recogida parcial

El borrador no la contempla y es el caso más común: mamá recoge a dos y el de 12 se queda al culto de jóvenes. La pantalla de check-out debe listar todos los niños presentes de esa familia con casillas, y entregar solo los marcados.

---

## 3. Autorizaciones y personas restringidas

Aquí está el valor legal del producto entero, y el borrador mezcla dos cosas muy distintas:

**No autorizado** = simplemente no está en la lista. Puede ser el abuelo que nadie registró. Se resuelve con el protocolo de excepción.

**Restringido** = hay una orden de custodia o una decisión pastoral. Es otra cosa:

- Solo un `administrador` puede crear o quitar una restricción, con documento adjunto.
- Al aparecer en la pantalla, no solo se bloquea: se notifica de inmediato al encargado del ministerio en su dispositivo, y queda en auditoría con o sin intento de entrega.
- **Ningún voluntario puede levantar una restricción**, ni con PIN de administrador en la puerta. Se resuelve fuera de la pantalla, con el encargado presente.
- El motivo de la restricción no se muestra al voluntario. Solo `Entrega bloqueada — llame al encargado`. El voluntario no necesita saber del divorcio, y no debe.

Pantalla roja a pantalla completa, sin botón de continuar. Eso el borrador lo tenía bien.

### Protocolo de excepción (etiqueta perdida, persona sin registrar)

1. Buscar a la persona en la lista de autorizados del niño.
2. Verificar identificación con foto.
3. Llamar al contacto primario de la familia desde el número en ficha, no del número que da el que está en la puerta.
4. PIN de `encargado` — no de voluntario.
5. Registrar motivo en texto libre, obligatorio.
6. `estado = 'manual'` en `checkins`, y sale en el reporte semanal de excepciones.

Si las excepciones pasan del 5% de las entregas, el sistema está mal configurado o los padres no están recibiendo su recibo. Ese número es una métrica de salud, no una estadística curiosa.

---

## 4. Máquina de estados

```
        (nada)
          │  check-in
          ▼
      presente ──── traslado ────► presente (otro salón)
          │
    ┌─────┼──────────────┬───────────────────┐
    │     │              │                   │
 recogido  manual   cerrado_auto        (emergencia)
                    al cerrar sesión     evacuado /
                    con aviso            entregado
```

Reglas duras:

- No se puede cerrar una `sesion_kids` con niños en `presente`. La pantalla obliga a resolver cada uno: recogido, manual, o `cerrado_auto` con motivo escrito.
- `cerrado_auto` genera alerta al encargado al día siguiente. Un niño que quedó "presente" el domingo pasado significa que alguien no cerró el proceso, y eso hay que corregirlo antes de que importe.
- Check-in fuera de ventana (más de 30 min después del inicio) se permite pero se marca `tardio`.
- Capacidad: al llegar al límite del salón, se advierte y se pide PIN de encargado. No se bloquea — bloquear en la puerta con la fila esperando garantiza que dejen de usar el sistema.

---

## 5. Etiquetas

El borrador acierta en lo importante: **nada médico en la etiqueta**. Un símbolo discreto y nada más. Mantenerlo.

Precisiones:

- **Etiqueta del niño:** nombre, salón, código, hora, símbolo `▲` si `gravedad != 'ninguna'`. Sin QR — al niño nadie lo escanea.
- **Recibo del tutor:** un solo recibo por familia con la lista de niños y el código de cada uno, más un QR con el token de la sesión familiar. Un recibo, no tres papeles que perder.
- **Etiqueta de artículos:** nombre + código, para pañalera y botella.

**Impresora:** un solo modelo soportado, de red, no USB. Brother QL-820NWB imprime desde cualquier iPad sin driver. Soportar dos modelos duplica el soporte técnico y no vende una licencia más.

**Camino de falla:** tarjetas pre-impresas numeradas en una caja. Si la impresora muere, el voluntario escribe el nombre en la tarjeta y captura el número en el iPad como código manual. El check-in se completa. La verificación de salida sigue funcionando porque el código está en la base.

---

## 6. Pantallas — siete, no quince

1. **Inicio** — tablero del día, alertas, estado de impresora y red.
2. **Puerta** — modo pantalla completa con PIN de salida. Check-in y check-out en la misma pantalla, con pestañas. No dos secciones distintas: es la misma mesa y la misma persona.
3. **Salones** — vista del maestro en vivo, con traslados, incidentes y "llamar al tutor".
4. **Personas** — niños, familias y autorizados en un solo lugar, navegando desde la familia. Salud es una sección dentro de la ficha del niño, con permiso, no una pantalla aparte.
5. **Asistencia y reportes**.
6. **Emergencia** — botón siempre visible.
7. **Configuración** — salones, servicios, impresora, usuarios, respaldos, retención.

El "Vault" no es una pantalla. Es un permiso.

---

## 7. Modo emergencia — va en v1, no en v2

El borrador lo pone como "después del lanzamiento". Es al revés: es la función más barata de construir (una consulta de solo lectura de quién está presente) y la que le justifica el gasto a un pastor en treinta segundos. También es el mejor demo que existe: haces un simulacro de incendio y vendes el producto.

- Un botón. Lista por salón, con conteo y maestro responsable.
- **Imprime automáticamente la hoja por salón al activarse.** En una evacuación real nadie está mirando un iPad; el maestro sale con papel en la mano.
- Cada maestro marca: evacuado / entregado al tutor / pendiente / requiere ayuda.
- El conteo de "todavía dentro del edificio" tiene que ser grande y visible desde lejos.

---

## 8. Consentimiento, retención y borrado

Nada de esto está en el borrador y todo es obligatorio cuando se trata de menores.

- **Inscripción:** formulario imprimible con tu kit de PDF actual, firmado por el tutor, con casillas separadas para foto y para información de salud. Se escanea y se adjunta. Sin consentimiento firmado, `ninos_salud` no se puede llenar — que lo impida el código, no el buen juicio del voluntario.
- **Renovación anual.** `vence_en` genera aviso al encargado.
- **Retención:** política escrita y configurable. Propuesta por defecto: `ninos_salud` se borra 12 meses después de la última asistencia; `checkins` se conserva 7 años pero se anonimiza a los 3 (queda el conteo, se van los nombres); fotos se borran al pasar a `inactivo`.
- **Herramienta de purga** en Configuración, con vista previa de qué se va a borrar y registro en auditoría de la purga misma.
- **Derecho de la familia:** botón para exportar todo lo que la iglesia tiene de un niño en un PDF, y para borrarlo si la familia se va. Va a llegar el día en que alguien lo pida.

---

## 9. Respaldo y recuperación de la llave

El borrador dice "respaldo manual" para la opción de iPad solo. Eso es pérdida de datos garantizada, y en este caso son datos de menores.

- Respaldo automático cifrado al cerrar cada sesión, a disco local y a un destino externo (disco USB o carpeta de red).
- **Llave de recuperación impresa en la instalación.** Si el administrador olvida el PIN y no hay escrow, la base está perdida para siempre. Esa hoja se guarda en la caja fuerte de la iglesia, con la misma seriedad que las actas.
- Restauración probada, no supuesta: la instalación no se considera terminada hasta que se restauró un respaldo en una máquina distinta una vez.
- La opción "solo un iPad" del borrador: elimínala. No es una configuración soportable. La Mac es requisito.

---

## 10. Alcance por versión

El "primera versión" del borrador tiene 16 puntos incluyendo bóveda, roles, auditoría, offline, QR en ambos sentidos e impresión. Eso no es una v1.

### v1 — una sola máquina, una sola estación

Objetivo: que una iglesia de 40 niños lo use un domingo entero sin ayuda.

- Familias, fichas de niños, salones
- Autorizados con los tres estados, incluyendo restringido
- Registro rápido de visitante
- Check-in y check-out con código impreso, búsqueda por nombre
- Recibo del tutor y etiqueta del niño en PDF a hoja adhesiva
- Salud con permiso por rol y consentimiento obligatorio
- Asistencia ligada al servicio de Secretaría
- Auditoría de solo inserción
- Modo emergencia con impresión
- Cierre de sesión obligatorio
- Respaldo cifrado automático y llave de recuperación
- Tres reportes: asistencia por salón, alergias por salón para pegar en la pared, excepciones

Sin QR. Sin red. Sin impresora térmica. **Corre en la Mac y nada más.**

Si v1 no funciona en una máquina, no va a funcionar en cinco.

### v1.1 — la puerta

- Servidor local + Bonjour, iPads como clientes
- PIN de turno y dispositivos inscritos
- QR familiar y token de recibo
- Impresora Brother de red
- Vista del maestro en vivo, traslados, incidentes, ratio

### v2

- Pase digital para el tutor (sin app: enlace con token, se guarda en Wallet)
- Notificación "necesitamos a la mamá de Samuel"
- Kiosco de autoservicio
- Firma digital de autorizaciones
- Varias sedes con consolidado por archivo exportado
- Reservas anticipadas

---

## 11. Protocolo de prueba antes del primer domingo

Esto no es opcional en un sistema donde el error es entregar un niño a la persona equivocada.

**Pruebas automatizadas obligatorias:**

- Código duplicado en la misma sesión → rechazado
- Token reutilizado → rechazado
- Persona restringida → bloqueo, sin ruta de escape para voluntario
- Recogida parcial → invalida solo los códigos entregados
- Cierre de sesión con niños presentes → bloqueado
- `UPDATE`/`DELETE` sobre `checkins` y `auditoria` → error del trigger
- Llenar `ninos_salud` sin consentimiento → rechazado
- Rol `voluntario` leyendo `ninos_salud` → 403 y registro en auditoría
- Restaurar respaldo en máquina limpia → base íntegra

**Ensayo con la iglesia, un miércoles:**

1. Diez familias de prueba, tres salones, 25 niños.
2. Corrida completa de check-in con cronómetro. Meta: menos de 45 segundos por familia. Si pasa de 90, el domingo se te hace una fila hasta la calle.
3. Simular: etiqueta perdida, impresora sin papel, persona restringida, hermanos en distinto salón, recogida parcial, y desconectar la Mac a media corrida.
4. Simulacro de evacuación con hoja impresa.
5. El voluntario más nuevo opera solo, sin ayuda. Si no puede, la interfaz está mal, no el voluntario.

---

## 12. Lo que Tamio Kids no debe hacer

- **No introducir dependencia de nube.** El borrador menciona "Tamio Cloud" y Supabase como almacenamiento principal. Si Tamio es local-first sobre SQLite, el módulo infantil es el peor lugar para estrenar la nube: es el único que tiene que funcionar sin falta a una hora exacta con gente esperando. Hay que resolver esa contradicción antes de empezar.
- **No app propia para padres en v1.** Un enlace con token que abre en el navegador cubre el 100% del caso sin pasar por App Store ni por soporte de instalación.
- **No expediente médico.** Alergias, medicamentos, instrucciones y contacto de emergencia. Nada más. Si un campo no cambia lo que un maestro hace en los próximos diez minutos, no va en el sistema.
- **No enseñanza, contenido ni juegos.** Es un sistema de seguridad y registro.
- **No dato de sexo "cuando la iglesia lo necesite".** O se usa para asignar salón y es obligatorio, o no está. Los campos opcionales ambiguos producen datos inconsistentes que después nadie puede reportar.

---

## Resumen del cambio

| Punto | Borrador | Revisado |
|---|---|---|
| Almacenamiento | Nube + bóveda local separada | Una SQLite cifrada local |
| Multi-dispositivo | Sync tras reconexión | Servidor en la Mac, iPads clientes |
| Roles | 5 | 3 |
| Pantallas | 15 | 7 |
| Emergencia | v2 | v1 |
| Consentimiento y retención | Ausente | Obligatorio, bloquea código |
| Recuperación de llave | Ausente | Hoja impresa en instalación |
| v1 | 16 funciones con QR y red | Una máquina, papel, sin QR |

---

## Veredicto de viabilidad (revisión técnica)

**Contexto:** Tamio hoy es Tauri 2 + React + SQLite/SQLCipher (una conexión Rust
bajo mutex, `foreign_keys ON`), con roles ya implementados, motor de PDF propio
(printUtils/pdfGenerator), respaldos en Configuración, y un arnés de pruebas
headless con `node:sqlite`. Contra esa base:

**✅ Encaja directo con la arquitectura actual (bajo riesgo):**
- Una sola SQLite cifrada con tablas por rol — es exactamente cómo Tamio ya
  guarda todo. Agregar estas tablas es trabajo mecánico, no nuevo.
- El modelo de datos completo (sección 1) es SQLite estándar sobre el mismo motor.
- Código de 4 caracteres con `UNIQUE (sesion_id, codigo)` + reintento — trivial.
- Autorizados / restringidos / máquina de estados — lógica de aplicación.
- Etiquetas y recibos en PDF — reutilizan el motor de PDF que ya existe (falta
  solo el formato de hoja adhesiva, que es trabajo de plantilla, no de motor).
- Salud con permiso por rol + consentimiento que bloquea — los roles ya existen.
- Auditoría de solo-inserción con triggers que bloquean UPDATE/DELETE — SQLite
  lo soporta nativo.
- Asistencia ligada al `servicio` de Secretaría — se conecta a la tabla actual.
- Respaldo cifrado + llave de recuperación — extiende el respaldo que ya hay.
- Todas las pruebas de la sección 11 caben en el arnés headless actual.

→ **El v1 de la sección 10 ("una sola máquina, sin red, sin QR, sin impresora
térmica, corre en la Mac y nada más") es muy factible.** Es MUCHO trabajo (muchas
tablas, siete pantallas, lógica legal), pero nada de eso es arquitectónicamente
nuevo ni riesgoso para Tamio. Es un buen candidato a ser el corazón de "Tamio 2.0".

**⚠️ La única parte arquitectónicamente nueva y de mayor riesgo (v1.1):**
- **Mac como servidor HTTP local + Bonjour + iPads como clientes delgados.** Hoy
  Tamio no tiene ese modelo: cada dispositivo es autónomo y sincroniza por la nube
  (Supabase). Montar un servidor local en Rust, anunciarlo por mDNS, y hacer que
  la app iOS funcione en "modo cliente" hablando HTTP a la Mac (con permisos de
  Red Local de iOS, entitlements de Bonjour, y el modo degradado si la Mac muere)
  es un proyecto propio. **Se puede** (Rust corre servidores sin problema), pero
  conviene prototiparlo aislado y no mezclarlo con el v1.
- Impresión a la Brother QL-820NWB de red desde iPad es integración real; también
  vive en v1.1.

**🔧 A reconciliar antes de empezar:**
- Tamio hoy sincroniza por la nube; Kids es local-only por diseño. Es compatible,
  pero hay que: (a) marcar las tablas de Kids (sobre todo `ninos_salud`) como
  "nunca sincronizar" con una bandera por tabla, y (b) asegurar que el respaldo
  local cifrado cubra Kids, porque no estará en la nube. La sección 12 y la 9 ya
  apuntan a esto; solo hay que volverlo explícito en el diseño.

**Recomendación de fases (después del lanzamiento en App Store):**
1. **Tamio 2.0 = el v1 de este plan** (una máquina). Alto valor, bajo riesgo,
   reutiliza casi todo lo que Tamio ya tiene. El modo emergencia con impresión va
   aquí, como dice el plan — es el mejor demo de venta.
2. **Tamio 2.1 = el v1.1** (la puerta: servidor local + iPads + impresora). Es el
   salto de arquitectura; se prototipa y prueba por separado.
3. **v2** como está descrito, más adelante.

**Conclusión:** el plan es realista y está bien pensado; las decisiones de la
sección 0 son las correctas y son justo las que quitan el riesgo. Sí se puede
hacer. Se ataca por el v1 (una máquina) después del lanzamiento, y se deja la
red local (v1.1) como su propio hito.
