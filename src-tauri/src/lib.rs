mod motordb;
mod paquete;

/// Versión de esquema más alta que conoce esta compilación de Tamio. Se usa
/// para rechazar un respaldo hecho con una versión más nueva: las migraciones
/// solo van hacia adelante.
fn version_esquema_conocida() -> i64 {
    migraciones().iter().map(|m| m.version).max().unwrap_or(0)
}

fn migraciones() -> Vec<motordb::Migracion> {
    vec![motordb::Migracion {
        version: 1,
        description: "esquema inicial: iglesias, miembros y movimientos",
        sql: r#"
            CREATE TABLE IF NOT EXISTS churches (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                nombre      TEXT NOT NULL,
                ciudad      TEXT,
                pais        TEXT DEFAULT 'México',
                moneda      TEXT NOT NULL DEFAULT 'MXN',
                logo_path   TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS members (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id     INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                nombre        TEXT NOT NULL,
                email         TEXT,
                telefono      TEXT,
                rfc           TEXT,
                direccion     TEXT,
                etiquetas     TEXT NOT NULL DEFAULT '[]', -- JSON: ["diezmador","rfc","comite",...]
                fecha_ingreso TEXT,
                notas         TEXT,
                activo        INTEGER NOT NULL DEFAULT 1,
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_members_church ON members(church_id);

            CREATE TABLE IF NOT EXISTS transactions (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id        INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                tipo             TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto')),
                categoria        TEXT NOT NULL,          -- ofrenda|diezmo|donacion|otros / pastores|musicos|...
                subcategoria     TEXT,                   -- texto libre reutilizable (para "otros")
                concepto         TEXT NOT NULL,
                detalle          TEXT,
                fecha            TEXT NOT NULL,           -- ISO: YYYY-MM-DD HH:MM
                monto            REAL NOT NULL,
                moneda           TEXT NOT NULL DEFAULT 'MXN',
                metodo_pago      TEXT NOT NULL,           -- efectivo|transferencia|tarjeta|cheque
                member_id        INTEGER REFERENCES members(id) ON DELETE SET NULL,
                beneficiario     TEXT,
                beneficiario_rfc TEXT,
                comprobante_path TEXT,
                emitir_constancia INTEGER NOT NULL DEFAULT 0,
                estado           TEXT NOT NULL DEFAULT 'aprobado' CHECK (estado IN ('pendiente','aprobado','rechazado')),
                notas            TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_tx_church_fecha ON transactions(church_id, fecha);
            CREATE INDEX IF NOT EXISTS idx_tx_tipo ON transactions(church_id, tipo);
        "#,
    }, motordb::Migracion {
        version: 3,
        description: "moneda por defecto: dolares en vez de pesos",
        sql: r#"
            UPDATE churches SET moneda = 'USD' WHERE moneda = 'MXN';
            UPDATE transactions SET moneda = 'USD' WHERE moneda = 'MXN';
        "#,
    }, motordb::Migracion {
        version: 4,
        description: "datos del tesorero para identificar quien genera los reportes",
        sql: r#"
            ALTER TABLE churches ADD COLUMN tesorero_nombre TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_cargo TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_email TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_telefono TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_firma_path TEXT;
        "#,
    }, motordb::Migracion {
        version: 5,
        description: "depositos bancarios",
        sql: r#"
            CREATE TABLE IF NOT EXISTS depositos_bancarios (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id        INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                fecha            TEXT NOT NULL,   -- YYYY-MM-DD
                periodo          TEXT NOT NULL,   -- YYYY-MM
                monto            REAL NOT NULL,
                moneda           TEXT NOT NULL DEFAULT 'USD',
                cuenta_banco     TEXT NOT NULL,
                referencia       TEXT,
                comprobante_path TEXT,
                notas            TEXT,
                created_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_depositos_church_fecha ON depositos_bancarios(church_id, fecha);
            CREATE INDEX IF NOT EXISTS idx_depositos_periodo ON depositos_bancarios(church_id, periodo);
        "#,
    }, motordb::Migracion {
        version: 6,
        description: "directorio de usuarios administrativos (sin login todavia — preparado para el backend futuro)",
        sql: r#"
            CREATE TABLE IF NOT EXISTS usuarios (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id  INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                nombre     TEXT NOT NULL,
                rol        TEXT NOT NULL,
                email      TEXT,
                telefono   TEXT,
                notas      TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_usuarios_church ON usuarios(church_id);
        "#,
    }, motordb::Migracion {
        version: 7,
        description: "categorias personalizadas de ingreso/gasto por iglesia",
        sql: r#"
            CREATE TABLE IF NOT EXISTS categorias_custom (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id  INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                tipo       TEXT NOT NULL CHECK (tipo IN ('ingreso','gasto')),
                nombre     TEXT NOT NULL,
                color      TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_categorias_custom_church ON categorias_custom(church_id);
        "#,
    }, motordb::Migracion {
        version: 8,
        description: "gastos fijos recurrentes (se materializan como transacciones cada mes)",
        sql: r#"
            CREATE TABLE IF NOT EXISTS gastos_recurrentes (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id           INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                categoria           TEXT NOT NULL,
                subcategoria        TEXT,
                concepto            TEXT NOT NULL,
                detalle             TEXT,
                monto               REAL NOT NULL,
                metodo_pago         TEXT NOT NULL,
                beneficiario        TEXT,
                beneficiario_rfc    TEXT,
                dia                 INTEGER NOT NULL,
                mes_inicio          TEXT NOT NULL,
                ultimo_mes_generado TEXT,
                created_at          TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_gastos_recurrentes_church ON gastos_recurrentes(church_id);
        "#,
    }, motordb::Migracion {
        version: 9,
        description: "movimientos recurrentes (ingreso o gasto) + vinculo con la transaccion generada",
        sql: r#"
            ALTER TABLE gastos_recurrentes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto';
            ALTER TABLE transactions ADD COLUMN recurrente_id INTEGER REFERENCES gastos_recurrentes(id) ON DELETE SET NULL;
        "#,
    }, motordb::Migracion {
        version: 10,
        description: "datos del pastor para el bloque de firmas en los reportes PDF",
        sql: r#"
            ALTER TABLE churches ADD COLUMN pastor_nombre TEXT;
            ALTER TABLE churches ADD COLUMN pastor_cargo TEXT;
            ALTER TABLE churches ADD COLUMN pastor_email TEXT;
            ALTER TABLE churches ADD COLUMN pastor_telefono TEXT;
            ALTER TABLE churches ADD COLUMN pastor_firma_path TEXT;
        "#,
    }, motordb::Migracion {
        version: 11,
        description: "baja de miembros con fecha y motivo (registro de membresía)",
        sql: r#"
            ALTER TABLE members ADD COLUMN fecha_baja TEXT;
            ALTER TABLE members ADD COLUMN motivo_baja TEXT;
        "#,
    }, motordb::Migracion {
        version: 12,
        description: "ficha completa del miembro: membresía, vida espiritual y servicio",
        sql: r#"
            ALTER TABLE members ADD COLUMN estado_membresia TEXT NOT NULL DEFAULT 'activo';
            ALTER TABLE members ADD COLUMN fecha_congregacion TEXT;
            ALTER TABLE members ADD COLUMN iglesia_anterior TEXT;
            ALTER TABLE members ADD COLUMN bautizado_agua INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE members ADD COLUMN fecha_bautismo_agua TEXT;
            ALTER TABLE members ADD COLUMN bautizado_espiritu INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE members ADD COLUMN fecha_bautismo_espiritu TEXT;
            ALTER TABLE members ADD COLUMN curso_membresia INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE members ADD COLUMN ministerios TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN ministerios_interes TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN instrumentos TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN habilidades TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN disponibilidad TEXT;
            ALTER TABLE members ADD COLUMN interes_servir INTEGER NOT NULL DEFAULT 0;
        "#,
    }, motordb::Migracion {
        version: 13,
        description: "actas de reuniones: información básica, asistencia, mociones, acuerdos y aprobación",
        sql: r#"
            CREATE TABLE IF NOT EXISTS actas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                folio TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'administrativa',
                titulo TEXT NOT NULL,
                fecha TEXT NOT NULL,
                hora_inicio TEXT,
                hora_cierre TEXT,
                lugar TEXT,
                preside TEXT,
                secretario TEXT,
                presentes TEXT NOT NULL DEFAULT '[]',
                ausentes TEXT NOT NULL DEFAULT '[]',
                invitados TEXT NOT NULL DEFAULT '[]',
                quorum INTEGER NOT NULL DEFAULT 0,
                agenda TEXT,
                resumen TEXT,
                mociones TEXT NOT NULL DEFAULT '[]',
                acuerdos TEXT NOT NULL DEFAULT '[]',
                estado TEXT NOT NULL DEFAULT 'borrador',
                confidencial INTEGER NOT NULL DEFAULT 0,
                fecha_aprobacion TEXT,
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_actas_church_fecha ON actas(church_id, fecha DESC);
        "#,
    }, motordb::Migracion {
        version: 14,
        description: "registro de servicios: culto, mensaje, escuela bíblica y asistencia",
        sql: r#"
            CREATE TABLE IF NOT EXISTS servicios (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                fecha TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'dominical',
                dirige TEXT,
                predica TEXT,
                titulo_mensaje TEXT,
                texto_biblico TEXT,
                resumen_mensaje TEXT,
                participaciones TEXT NOT NULL DEFAULT '[]',
                tema_escuela TEXT,
                maestro_escuela TEXT,
                asistentes TEXT NOT NULL DEFAULT '[]',
                ausentes TEXT NOT NULL DEFAULT '[]',
                visitantes TEXT NOT NULL DEFAULT '[]',
                ninos INTEGER NOT NULL DEFAULT 0,
                jovenes INTEGER NOT NULL DEFAULT 0,
                adultos INTEGER NOT NULL DEFAULT 0,
                eventos TEXT,
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_servicios_church_fecha ON servicios(church_id, fecha DESC);
        "#,
    }, motordb::Migracion {
        version: 15,
        description: "asistencia por miembro en servicios: roster relacional con snapshot de nombre",
        sql: r#"
            CREATE TABLE IF NOT EXISTS servicio_asistencia (
                servicio_id INTEGER NOT NULL REFERENCES servicios(id),
                member_id INTEGER NOT NULL REFERENCES members(id),
                presente INTEGER NOT NULL DEFAULT 0,
                razon TEXT,
                razon_otra TEXT,
                seguimiento INTEGER NOT NULL DEFAULT 0,
                nombre_snapshot TEXT NOT NULL,
                PRIMARY KEY (servicio_id, member_id)
            );
            CREATE INDEX IF NOT EXISTS idx_asistencia_member ON servicio_asistencia(member_id);
        "#,
    }, motordb::Migracion {
        version: 16,
        description: "cartas y traslados fase 1: tabla de cartas, datos institucionales y secretaría",
        sql: r#"
            ALTER TABLE churches ADD COLUMN direccion TEXT;
            ALTER TABLE churches ADD COLUMN region TEXT;
            ALTER TABLE churches ADD COLUMN telefono TEXT;
            ALTER TABLE churches ADD COLUMN email TEXT;
            ALTER TABLE churches ADD COLUMN pie_institucional TEXT;
            ALTER TABLE churches ADD COLUMN secretaria_nombre TEXT;
            ALTER TABLE churches ADD COLUMN secretaria_cargo TEXT;
            CREATE TABLE IF NOT EXISTS cartas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                numero_seq INTEGER NOT NULL,
                folio TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'recomendacion',
                fecha_emision TEXT NOT NULL,
                lugar_emision TEXT,
                destinatario_tipo TEXT NOT NULL DEFAULT 'personalizado',
                member_id INTEGER REFERENCES members(id),
                destinatario_nombre TEXT NOT NULL DEFAULT '',
                destinatario_direccion TEXT,
                asunto TEXT,
                saludo TEXT,
                cuerpo_html TEXT NOT NULL DEFAULT '',
                despedida TEXT,
                firmas TEXT NOT NULL DEFAULT '[]',
                observaciones TEXT,
                estado TEXT NOT NULL DEFAULT 'borrador',
                historial_estados TEXT NOT NULL DEFAULT '[]',
                entregada_a TEXT,
                fecha_entrega TEXT,
                solicitud_id INTEGER,
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                modificado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_cartas_church ON cartas(church_id, fecha_emision DESC);
        "#,
    }, motordb::Migracion {
        version: 17,
        description: "cartas y traslados fase 2: solicitudes de cartas con vínculo bidireccional",
        sql: r#"
            CREATE TABLE IF NOT EXISTS solicitudes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                numero_seq INTEGER NOT NULL,
                folio TEXT NOT NULL,
                member_id INTEGER REFERENCES members(id),
                solicitante_externo TEXT,
                tipo_carta TEXT NOT NULL DEFAULT 'recomendacion',
                motivo TEXT,
                fecha_solicitud TEXT NOT NULL,
                fecha_requerida TEXT,
                medio_entrega TEXT,
                responsable TEXT,
                prioridad TEXT NOT NULL DEFAULT 'normal',
                estado TEXT NOT NULL DEFAULT 'nueva',
                observaciones TEXT,
                carta_id INTEGER REFERENCES cartas(id),
                historial_estados TEXT NOT NULL DEFAULT '[]',
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                modificado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_solicitudes_church ON solicitudes(church_id, fecha_solicitud DESC);
        "#,
    }, motordb::Migracion {
        version: 18,
        description: "cartas y traslados fase 3: traslados de salida y de entrada",
        sql: r#"
            CREATE TABLE IF NOT EXISTS traslados_salida (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                numero_seq INTEGER NOT NULL,
                folio TEXT NOT NULL,
                member_id INTEGER NOT NULL REFERENCES members(id),
                fecha_solicitud TEXT NOT NULL,
                motivo TEXT,
                iglesia_destino TEXT,
                pastor_receptor TEXT,
                direccion TEXT,
                ciudad TEXT,
                region TEXT,
                pais TEXT,
                telefono TEXT,
                email TEXT,
                fecha_aprobacion TEXT,
                aprobado_por TEXT,
                carta_id INTEGER REFERENCES cartas(id),
                fecha_entrega TEXT,
                metodo_entrega TEXT,
                confirmacion_recibida INTEGER NOT NULL DEFAULT 0,
                fecha_confirmacion TEXT,
                observaciones TEXT,
                estado TEXT NOT NULL DEFAULT 'borrador',
                historial_estados TEXT NOT NULL DEFAULT '[]',
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                modificado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE TABLE IF NOT EXISTS traslados_entrada (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                numero_seq INTEGER NOT NULL,
                folio TEXT NOT NULL,
                nombre TEXT NOT NULL,
                fecha_nacimiento TEXT,
                telefono TEXT,
                correo TEXT,
                direccion TEXT,
                iglesia_procedencia TEXT,
                pastor_anterior TEXT,
                direccion_anterior TEXT,
                fecha_emision_carta TEXT,
                fecha_recepcion TEXT,
                referencia_carta TEXT,
                adjunto_path TEXT,
                adjunto_nombre TEXT,
                adjunto_fecha TEXT,
                fecha_congregacion TEXT,
                fecha_entrevista TEXT,
                entrevistador TEXT,
                decision TEXT,
                fecha_aprobacion TEXT,
                observaciones TEXT,
                estado TEXT NOT NULL DEFAULT 'recibida',
                member_id INTEGER REFERENCES members(id),
                historial_estados TEXT NOT NULL DEFAULT '[]',
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                modificado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_ts_church ON traslados_salida(church_id, fecha_solicitud DESC);
            CREATE INDEX IF NOT EXISTS idx_te_church ON traslados_entrada(church_id, fecha_recepcion DESC);
        "#,
    }, motordb::Migracion {
        version: 19,
        description: "cartas y traslados fase 4: plantillas de cartas con variables",
        sql: r#"
            CREATE TABLE IF NOT EXISTS plantillas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                nombre TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'personalizada',
                asunto TEXT,
                saludo TEXT,
                cuerpo_html TEXT NOT NULL DEFAULT '',
                despedida TEXT,
                activa INTEGER NOT NULL DEFAULT 1,
                predeterminada INTEGER NOT NULL DEFAULT 0,
                es_inicial INTEGER NOT NULL DEFAULT 0,
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                modificado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
        "#,
    }, motordb::Migracion {
        version: 20,
        description: "informes de membresía: cargos, historial de estados, seguimiento y umbrales",
        sql: r#"
            ALTER TABLE members ADD COLUMN cargos TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN historial_estados TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN seguimiento_revisado_en TEXT;
            ALTER TABLE members ADD COLUMN seguimiento_notas TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE churches ADD COLUMN umbrales_informes TEXT;
        "#,
    }, motordb::Migracion {
        version: 21,
        description: "agendas y calendarios: actividades, recurrencia, recordatorios",
        sql: r#"
            CREATE TABLE IF NOT EXISTS agenda (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                nombre TEXT NOT NULL,
                tipo TEXT NOT NULL DEFAULT 'otra',
                tipo_personalizado TEXT,
                fecha TEXT NOT NULL,
                hora_inicio TEXT,
                hora_fin TEXT,
                dia_completo INTEGER NOT NULL DEFAULT 0,
                lugar TEXT,
                descripcion TEXT,
                responsable_member_id INTEGER,
                responsable_persona TEXT,
                responsable_ministerio TEXT,
                invitado TEXT,
                contacto TEXT,
                estado TEXT NOT NULL DEFAULT 'programada',
                recurrencia TEXT NOT NULL DEFAULT '{"tipo":"ninguna"}',
                excepciones TEXT NOT NULL DEFAULT '[]',
                recordatorios TEXT NOT NULL DEFAULT '[]',
                es_fecha_importante INTEGER NOT NULL DEFAULT 0,
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                modificado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_agenda_church_fecha ON agenda(church_id, fecha);
        "#,
    }, motordb::Migracion {
        version: 22,
        description: "mensajes internos entre tesorería y secretaría",
        sql: r#"
            CREATE TABLE IF NOT EXISTS mensajes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id INTEGER NOT NULL REFERENCES churches(id),
                de_rol TEXT NOT NULL,
                cuerpo TEXT NOT NULL,
                leido INTEGER NOT NULL DEFAULT 0,
                creado_en TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );
            CREATE INDEX IF NOT EXISTS idx_mensajes_church ON mensajes(church_id, id);
        "#,
    }, motordb::Migracion {
        version: 23,
        description: "sincronización E3: metadatos (uid/updated_at/deleted) en members",
        sql: r#"
            ALTER TABLE members ADD COLUMN uid TEXT;
            ALTER TABLE members ADD COLUMN updated_at TEXT;
            ALTER TABLE members ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE members SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE members SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_members_sync ON members(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 24,
        description: "sincronización T1: metadatos (uid/updated_at/deleted) en transactions",
        sql: r#"
            ALTER TABLE transactions ADD COLUMN uid TEXT;
            ALTER TABLE transactions ADD COLUMN updated_at TEXT;
            ALTER TABLE transactions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE transactions SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE transactions SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_tx_sync ON transactions(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 25,
        description: "sincronización D1: metadatos (uid/updated_at/deleted) en depositos_bancarios",
        sql: r#"
            ALTER TABLE depositos_bancarios ADD COLUMN uid TEXT;
            ALTER TABLE depositos_bancarios ADD COLUMN updated_at TEXT;
            ALTER TABLE depositos_bancarios ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE depositos_bancarios SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE depositos_bancarios SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_depositos_sync ON depositos_bancarios(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 26,
        description: "sincronización A1: metadatos (uid/updated_at/deleted) en actas",
        sql: r#"
            ALTER TABLE actas ADD COLUMN uid TEXT;
            ALTER TABLE actas ADD COLUMN updated_at TEXT;
            ALTER TABLE actas ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE actas SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE actas SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_actas_sync ON actas(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 27,
        description: "sincronización C1: metadatos (uid/updated_at/deleted) en cartas y solicitudes",
        sql: r#"
            ALTER TABLE cartas ADD COLUMN uid TEXT;
            ALTER TABLE cartas ADD COLUMN updated_at TEXT;
            ALTER TABLE cartas ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE cartas SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE cartas SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_cartas_sync ON cartas(church_id, updated_at);
            ALTER TABLE solicitudes ADD COLUMN uid TEXT;
            ALTER TABLE solicitudes ADD COLUMN updated_at TEXT;
            ALTER TABLE solicitudes ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE solicitudes SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE solicitudes SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_solicitudes_sync ON solicitudes(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 28,
        description: "sincronización TR1: metadatos (uid/updated_at/deleted) en traslados",
        sql: r#"
            ALTER TABLE traslados_salida ADD COLUMN uid TEXT;
            ALTER TABLE traslados_salida ADD COLUMN updated_at TEXT;
            ALTER TABLE traslados_salida ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE traslados_salida SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE traslados_salida SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_traslados_salida_sync ON traslados_salida(church_id, updated_at);
            ALTER TABLE traslados_entrada ADD COLUMN uid TEXT;
            ALTER TABLE traslados_entrada ADD COLUMN updated_at TEXT;
            ALTER TABLE traslados_entrada ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE traslados_entrada SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE traslados_entrada SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_traslados_entrada_sync ON traslados_entrada(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 29,
        description: "sincronización SV1: metadatos (uid/updated_at/deleted) en servicios",
        sql: r#"
            ALTER TABLE servicios ADD COLUMN uid TEXT;
            ALTER TABLE servicios ADD COLUMN updated_at TEXT;
            ALTER TABLE servicios ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE servicios SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE servicios SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_servicios_sync ON servicios(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 30,
        description: "sincronización AG1/MSG1: metadatos (uid/updated_at/deleted) en agenda y mensajes",
        sql: r#"
            ALTER TABLE agenda ADD COLUMN uid TEXT;
            ALTER TABLE agenda ADD COLUMN updated_at TEXT;
            ALTER TABLE agenda ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE agenda SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE agenda SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_agenda_sync ON agenda(church_id, updated_at);
            ALTER TABLE mensajes ADD COLUMN uid TEXT;
            ALTER TABLE mensajes ADD COLUMN updated_at TEXT;
            ALTER TABLE mensajes ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE mensajes SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE mensajes SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_mensajes_sync ON mensajes(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 31,
        description: "suscripción: plan/estado/vencimiento por iglesia (default completo/activa)",
        sql: r#"
            ALTER TABLE churches ADD COLUMN plan TEXT NOT NULL DEFAULT 'completo';
            ALTER TABLE churches ADD COLUMN sub_estado TEXT NOT NULL DEFAULT 'activa';
            ALTER TABLE churches ADD COLUMN sub_vence TEXT;
        "#,
    }, motordb::Migracion {
        version: 32,
        description: "sincronización P1/CAT1/SV2: metadatos en plantillas, categorias_custom y roster",
        sql: r#"
            ALTER TABLE plantillas ADD COLUMN uid TEXT;
            ALTER TABLE plantillas ADD COLUMN updated_at TEXT;
            ALTER TABLE plantillas ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE plantillas SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE plantillas SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_plantillas_sync ON plantillas(church_id, updated_at);

            ALTER TABLE categorias_custom ADD COLUMN uid TEXT;
            ALTER TABLE categorias_custom ADD COLUMN updated_at TEXT;
            ALTER TABLE categorias_custom ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE categorias_custom SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE categorias_custom SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_categorias_custom_sync ON categorias_custom(church_id, updated_at);

            -- El roster (servicio_asistencia) no tenía church_id: se hereda del
            -- servicio al que pertenece cada fila para poder aislarlo por iglesia.
            ALTER TABLE servicio_asistencia ADD COLUMN church_id INTEGER;
            ALTER TABLE servicio_asistencia ADD COLUMN uid TEXT;
            ALTER TABLE servicio_asistencia ADD COLUMN updated_at TEXT;
            ALTER TABLE servicio_asistencia ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE servicio_asistencia
               SET church_id = (SELECT s.church_id FROM servicios s WHERE s.id = servicio_asistencia.servicio_id)
             WHERE church_id IS NULL;
            UPDATE servicio_asistencia SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE servicio_asistencia SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_roster_sync ON servicio_asistencia(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 33,
        description: "categorías portables: referencia custom-<uid> en movimientos (en vez de id local)",
        sql: r#"
            -- Los movimientos guardaban la categoría personalizada como
            -- 'custom-<id local>', que difiere entre equipos. Se reescribe a
            -- 'custom-<uid global>' para que la referencia viaje bien en la
            -- sincronización. Se sube updated_at para que se re-suban.
            UPDATE transactions
               SET categoria = 'custom-' || (
                     SELECT c.uid FROM categorias_custom c
                      WHERE 'custom-' || c.id = transactions.categoria
                        AND c.church_id = transactions.church_id
                   ),
                   updated_at = datetime('now')
             WHERE categoria LIKE 'custom-%'
               AND EXISTS (
                     SELECT 1 FROM categorias_custom c
                      WHERE 'custom-' || c.id = transactions.categoria
                        AND c.church_id = transactions.church_id
                   );

            UPDATE gastos_recurrentes
               SET categoria = 'custom-' || (
                     SELECT c.uid FROM categorias_custom c
                      WHERE 'custom-' || c.id = gastos_recurrentes.categoria
                        AND c.church_id = gastos_recurrentes.church_id
                   )
             WHERE categoria LIKE 'custom-%'
               AND EXISTS (
                     SELECT 1 FROM categorias_custom c
                      WHERE 'custom-' || c.id = gastos_recurrentes.categoria
                        AND c.church_id = gastos_recurrentes.church_id
                   );
        "#,
    }, motordb::Migracion {
        version: 34,
        description: "saldo de apertura: dinero en caja al empezar a usar Tamio",
        sql: r#"
            -- Dinero que la tesorería ya tenía ANTES del primer movimiento
            -- registrado en Tamio. El estado financiero lo suma al acumulado
            -- de movimientos para que el "saldo anterior" sea el saldo real
            -- también en iglesias que migran con caja previa. Configuración →
            -- Iglesia. Default 0: instalaciones que arrancan de cero no
            -- cambian en nada.
            ALTER TABLE churches ADD COLUMN saldo_inicial REAL NOT NULL DEFAULT 0;
        "#,
    }, motordb::Migracion {
        version: 35,
        description: "agenda: enlace local al servicio registrado desde el puente",
        sql: r#"
            -- Servicio de la Bitácora creado desde esta actividad (puente
            -- Agenda→Servicios). Columna local: el sync de agenda usa lista
            -- explícita de columnas y no la envía; el estado 'completada'
            -- sí viaja.
            ALTER TABLE agenda ADD COLUMN servicio_id INTEGER;
        "#,
    }, motordb::Migracion {
        version: 36,
        description: "dinero en centavos enteros (plan-centavos.md)",
        sql: r#"
            -- Los cuatro importes de la app pasan de REAL (coma flotante) a
            -- INTEGER de centavos: $125.50 se guarda como 12550. En coma
            -- flotante hay decimales corrientes que no se representan exactos,
            -- y sumados con SUM() en cientos de movimientos la deriva produce
            -- un estado financiero cuyo total no cuadra con sus líneas.
            --
            -- ROUND ANTES DEL CAST, y no es opcional: CAST trunca, y
            -- 1.15 * 100 en coma flotante da 114.99999999999999, así que
            -- CAST(1.15 * 100 AS INTEGER) devuelve 114. Sin ROUND esta
            -- migración pierde un centavo en una de cada tantas filas, en
            -- silencio y sin vuelta atrás.
            --
            -- Se hace con ADD/UPDATE/DROP/RENAME en vez de reconstruir la
            -- tabla: reconstruir obligaría a reproducir a mano el esquema
            -- acumulado por 35 migraciones de ALTER TABLE, y equivocarse ahí
            -- se lleva datos por delante. Comprobado antes de escribir esto:
            -- ninguna de las cuatro columnas está en un índice, en un UNIQUE,
            -- ni hay triggers o vistas en todo el esquema, que son los casos
            -- en los que DROP COLUMN falla.
            --
            -- El orden de las columnas cambia (la nueva queda al final). No
            -- afecta a nadie: los SELECT * se mapean por NOMBRE a objetos
            -- tipados, y el sync usa listas explícitas de columnas.

            ALTER TABLE transactions ADD COLUMN monto_centavos INTEGER NOT NULL DEFAULT 0;
            UPDATE transactions SET monto_centavos = CAST(ROUND(monto * 100) AS INTEGER);
            ALTER TABLE transactions DROP COLUMN monto;
            ALTER TABLE transactions RENAME COLUMN monto_centavos TO monto;

            ALTER TABLE depositos_bancarios ADD COLUMN monto_centavos INTEGER NOT NULL DEFAULT 0;
            UPDATE depositos_bancarios SET monto_centavos = CAST(ROUND(monto * 100) AS INTEGER);
            ALTER TABLE depositos_bancarios DROP COLUMN monto;
            ALTER TABLE depositos_bancarios RENAME COLUMN monto_centavos TO monto;

            ALTER TABLE gastos_recurrentes ADD COLUMN monto_centavos INTEGER NOT NULL DEFAULT 0;
            UPDATE gastos_recurrentes SET monto_centavos = CAST(ROUND(monto * 100) AS INTEGER);
            ALTER TABLE gastos_recurrentes DROP COLUMN monto;
            ALTER TABLE gastos_recurrentes RENAME COLUMN monto_centavos TO monto;

            ALTER TABLE churches ADD COLUMN saldo_inicial_centavos INTEGER NOT NULL DEFAULT 0;
            UPDATE churches SET saldo_inicial_centavos = CAST(ROUND(saldo_inicial * 100) AS INTEGER);
            ALTER TABLE churches DROP COLUMN saldo_inicial;
            ALTER TABLE churches RENAME COLUMN saldo_inicial_centavos TO saldo_inicial;
        "#,
    }, motordb::Migracion {
        version: 37,
        description: "identificación fiscal (EIN), estado y código postal de la iglesia",
        sql: r#"
            -- Número de identificación fiscal de la iglesia (EIN en EE. UU.,
            -- o su equivalente en otros países), más estado/provincia y
            -- código postal — junto a ciudad y país, para completar la
            -- dirección. Los tres se muestran junto al nombre de la iglesia
            -- en los PDF.
            ALTER TABLE churches ADD COLUMN ein TEXT;
            ALTER TABLE churches ADD COLUMN estado_provincia TEXT;
            ALTER TABLE churches ADD COLUMN codigo_postal TEXT;
        "#,
    }, motordb::Migracion {
        version: 38,
        description: "cortes de caja: el dinero que sale de la caja en manos de alguien",
        sql: r#"
            -- Un CORTE es el dinero en efectivo y cheques que la tesorera
            -- cuenta junto y entrega a una persona para que lo lleve al
            -- banco. Definido con Iván el 24 ago 2026; el porqué está en
            -- docs/cascaras-1-2.md.
            --
            -- Cubre el hueco que hasta ahora no se registraba: entre que el
            -- dinero sale de la caja y aparece un depósito en el banco no
            -- había ningún rastro de quién lo llevó. Ese hueco es justo donde
            -- una tesorera necesita estar protegida.
            --
            -- `responsable` es TEXTO, no una referencia a `usuarios`: quien
            -- lleva el dinero puede no estar dado de alta en la app, y el
            -- nombre tiene que quedar escrito aunque esa persona se borre
            -- después. La interfaz propone los de `usuarios` y deja escribir
            -- uno nuevo — el mismo trato que `cuenta_banco` en los depósitos.
            --
            -- `estado`: 'abierto' (entregado, todavía no en el banco) o
            -- 'depositado' (cerrado, con su `deposito_id`). No hay un estado
            -- previo: crear el corte ES entregarlo.
            CREATE TABLE IF NOT EXISTS cortes (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id    INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                fecha        TEXT NOT NULL,   -- YYYY-MM-DD: el día que sale de la caja
                nombre       TEXT NOT NULL,
                cuenta_banco TEXT,
                responsable  TEXT,
                estado       TEXT NOT NULL DEFAULT 'abierto',
                deposito_id  INTEGER REFERENCES depositos_bancarios(id) ON DELETE SET NULL,
                notas        TEXT,
                created_at   TEXT NOT NULL DEFAULT (datetime('now')),
                uid          TEXT,
                updated_at   TEXT,
                deleted      INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_cortes_church_estado ON cortes(church_id, estado);
            CREATE INDEX IF NOT EXISTS idx_cortes_deposito ON cortes(deposito_id);
            CREATE INDEX IF NOT EXISTS idx_cortes_sync ON cortes(church_id, updated_at);

            -- La puente. Un movimiento pertenece a UN corte como mucho: por
            -- eso el índice único sobre `tx_id` y no sobre el par. Sin él,
            -- el mismo billete podría contarse en dos cortes y las cifras de
            -- "efectivo por depositar" dejarían de cuadrar en silencio.
            CREATE TABLE IF NOT EXISTS corte_movimientos (
                corte_id  INTEGER NOT NULL REFERENCES cortes(id) ON DELETE CASCADE,
                tx_id     INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
                church_id INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                PRIMARY KEY (corte_id, tx_id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_corte_movs_tx ON corte_movimientos(tx_id);
            CREATE INDEX IF NOT EXISTS idx_corte_movs_church ON corte_movimientos(church_id);
        "#,
    }, motordb::Migracion {
        version: 39,
        description: "quién registró cada movimiento, depósito y corte",
        sql: r#"
            -- "Registrado por". Lo pone la app sola con quien tiene la sesión
            -- abierta: nadie lo teclea y nadie puede atribuírselo a otro.
            --
            -- Es lo que el handoff 1 dibujaba como "Registrado por · Rosa
            -- Elena Vega · tesorera" y como rastro de auditoría, y lo que §4
            -- del rediseño apuntó como "lo único del documento que no es
            -- maquetación". Decidido con Iván el 24 ago 2026: la
            -- administradora invita a la tesorera, cada una entra con SU
            -- cuenta, y si un día cubre el administrador porque la tesorera
            -- está enferma, el registro dice su nombre. Eso es justo lo que lo
            -- hace valer: no es "la página de la tesorera", es quién lo hizo.
            --
            -- **Instantánea, no referencia.** Se guarda el NOMBRE y el ROL tal
            -- como eran al registrar, no un id que apunte a `perfiles`. Un
            -- rastro de auditoría tiene que seguir diciendo quién fue aunque
            -- esa persona deje la iglesia y su perfil desaparezca; y si
            -- alguien cambia de rol, lo que se hizo siendo tesorera se hizo
            -- siendo tesorera. Es el mismo criterio que `cortes.responsable`.
            --
            -- Nacen vacías y solo se llenan de aquí en adelante: rellenar el
            -- pasado con suposiciones sería peor que dejarlo en blanco.
            ALTER TABLE transactions ADD COLUMN registrado_por TEXT;
            ALTER TABLE transactions ADD COLUMN registrado_rol TEXT;
            ALTER TABLE depositos_bancarios ADD COLUMN registrado_por TEXT;
            ALTER TABLE depositos_bancarios ADD COLUMN registrado_rol TEXT;
            ALTER TABLE cortes ADD COLUMN registrado_por TEXT;
            ALTER TABLE cortes ADD COLUMN registrado_rol TEXT;
        "#,
    }, motordb::Migracion {
        version: 40,
        description: "corte_movimientos con metadatos de sincronización",
        sql: r#"
            -- Para que un corte hecho en el iPad de la tesorera llegue al del
            -- administrador, su tabla puente necesita lo mismo que todas las
            -- demás: `uid` propio, `updated_at` y borrado en BLANDO. Las
            -- referencias entre aparatos van por uid y nunca por el id local,
            -- que no significa nada fuera de su base — es el patrón que ya
            -- usa `servicio_asistencia` con `servicio_uid` y `member_uid`.
            --
            -- El borrado en blando obliga a cambiar el índice único: mientras
            -- un enganche borrado siguiera contando, su movimiento no podría
            -- volver a entrar en otro corte. Pasa a ser PARCIAL —solo sobre
            -- las filas vivas—, que es lo que dice la regla de verdad: un
            -- movimiento pertenece a un corte VIGENTE como mucho.
            ALTER TABLE corte_movimientos ADD COLUMN uid TEXT;
            ALTER TABLE corte_movimientos ADD COLUMN updated_at TEXT;
            ALTER TABLE corte_movimientos ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE corte_movimientos SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE corte_movimientos SET updated_at = datetime('now') WHERE updated_at IS NULL;

            DROP INDEX IF EXISTS idx_corte_movs_tx;
            CREATE UNIQUE INDEX IF NOT EXISTS idx_corte_movs_tx_vivo
                ON corte_movimientos(tx_id) WHERE deleted = 0;
            CREATE INDEX IF NOT EXISTS idx_corte_movs_sync
                ON corte_movimientos(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 41,
        description: "el testigo del acta, la tercera firma",
        sql: r#"
            -- El renglón de "Testigo" ya se imprimía —con su raya, para
            -- firmarlo a mano— pero no tenía dónde guardar el nombre: `actas`
            -- solo conocía a quien preside y a quien redacta. Es la columna
            -- que le faltaba, al lado de las otras dos.
            ALTER TABLE actas ADD COLUMN testigo TEXT;
        "#,
    }, motordb::Migracion {
        version: 42,
        description: "nacimiento y estado civil del miembro",
        sql: r#"
            -- Las dos columnas que le faltaban a la ficha personal. La
            -- tercera del diseño, `direccion`, existe desde la migración 1:
            -- estaba en la tabla y en la sincronización, pero sin campo en
            -- ningún formulario, así que nunca se pudo llenar. Con estas dos
            -- se cablean las tres a la vez.
            --
            -- Las dos van sueltas (NULL) a propósito: son datos de una
            -- persona, no del sistema. Un valor por omisión —una fecha, un
            -- "soltero"— se leería como un dato capturado, y la ficha
            -- distingue "no lo sabemos" de "lo preguntamos y es esto".
            ALTER TABLE members ADD COLUMN fecha_nacimiento TEXT;
            -- Clave del catálogo (soltero|casado|unionLibre|divorciado|
            -- viudo|separado) o texto libre, igual que ministerios y cargos:
            -- el catálogo no puede prever todos los casos de una iglesia.
            ALTER TABLE members ADD COLUMN estado_civil TEXT;
        "#,
    }, motordb::Migracion {
        version: 43,
        description: "roster por puestos y orden del culto",
        sql: r#"
            -- Los dos huecos grandes que quedaban de Servicios, y son el
            -- mismo hueco visto de dos maneras: QUIÉN hace cada cosa en el
            -- culto y CUÁNDO se hace.
            --
            -- Hasta aquí un servicio guardaba `predica` y `dirige` —dos
            -- columnas sueltas— y una lista JSON de `participaciones` sin
            -- forma. El handoff dibuja seis puestos; dos existían y cuatro
            -- decían "Sin asignar" con un botón apagado al lado. El catálogo
            -- de puestos NO es una tabla: vive en la constante `PUESTOS` de
            -- `src/db.ts`, con los otros catálogos, porque son los seis del
            -- diseño y
            -- una iglesia no los inventa cada domingo. Lo que sí cambia cada
            -- domingo —quién los cubre— es lo que se guarda aquí.
            --
            -- `nombre` es una INSTANTÁNEA, como `cortes.responsable` y como
            -- `registrado_por`: quien toca el teclado el domingo puede no
            -- estar en el padrón (un visitante que ayuda en sonido), y el
            -- histórico tiene que seguir diciendo quién fue aunque esa
            -- persona se dé de baja. `member_id` se guarda ADEMÁS cuando sale
            -- del padrón, para poder contar después cuántas veces sirvió
            -- alguien sin depender de cómo se escribió su nombre.
            --
            -- El índice único es PARCIAL —solo sobre las filas vivas—, la
            -- lección de la migración 40: con el borrado en blando, un puesto
            -- soltado seguiría ocupando su sitio y no se podría reasignar.
            CREATE TABLE IF NOT EXISTS servicio_puestos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                servicio_id INTEGER NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
                puesto      TEXT NOT NULL,   -- clave del catálogo: alabanza|ujieres|ofrenda|sonido
                nombre      TEXT NOT NULL,
                member_id   INTEGER REFERENCES members(id) ON DELETE SET NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                uid         TEXT,
                updated_at  TEXT,
                deleted     INTEGER NOT NULL DEFAULT 0
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_servicio_puestos_vivo
                ON servicio_puestos(servicio_id, puesto) WHERE deleted = 0;
            CREATE INDEX IF NOT EXISTS idx_servicio_puestos_sync
                ON servicio_puestos(church_id, updated_at);

            -- El minuto a minuto. `posicion` manda sobre `hora`, y no al
            -- revés: un culto puede tener pasos sin hora ("Ofrenda", después
            -- de la predicación, cuando toque) y ordenarlos por una hora que
            -- no existe los mandaría todos al principio. La hora es un dato
            -- que se enseña; el orden es la posición.
            CREATE TABLE IF NOT EXISTS servicio_orden (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                church_id   INTEGER NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
                servicio_id INTEGER NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
                posicion    INTEGER NOT NULL DEFAULT 0,
                hora        TEXT,            -- "HH:MM", suelta a propósito
                titulo      TEXT NOT NULL,
                encargado   TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now')),
                uid         TEXT,
                updated_at  TEXT,
                deleted     INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_servicio_orden_servicio
                ON servicio_orden(servicio_id, posicion);
            CREATE INDEX IF NOT EXISTS idx_servicio_orden_sync
                ON servicio_orden(church_id, updated_at);
        "#,
    }, motordb::Migracion {
        version: 44,
        description: "firmas del acta: quién ha firmado y cuándo",
        sql: r#"
            -- "Recopilar firmas". El acta sabía QUIÉNES firman —preside,
            -- secretario y, desde la 41, testigo— pero no si habían firmado
            -- ni cuándo, así que el botón salía apagado y un acta aprobada no
            -- se distinguía de una que sigue dando vueltas sin firmar.
            --
            -- Es JSON y no tres columnas de fecha, y la razón no es la pereza:
            -- las cartas resuelven exactamente esto con `cartas.firmas` desde
            -- hace versiones (ver `CartaFirma`), y dos formas distintas de
            -- guardar lo mismo en la misma app se acaban comportando
            -- distinto. El arreglo lleva {rol, firmado, fecha} por firmante.
            --
            -- El NOMBRE no entra en el JSON: sigue en `preside`, `secretario`
            -- y `testigo`. Duplicarlo dejaría dos copias que se separan a la
            -- primera corrección de un nombre mal escrito.
            ALTER TABLE actas ADD COLUMN firmas TEXT NOT NULL DEFAULT '[]';
        "#,
    }]
}

/// Si el efecto translúcido (vibrancy) del sidebar quedó activo en esta
/// ventana. El frontend lo consulta para encender los fondos transparentes
/// SOLO cuando el efecto nativo existe (si no, se queda el fondo sólido).
struct VibrancyOk(bool);

#[tauri::command]
fn vibrancy_ok(state: tauri::State<VibrancyOk>) -> bool {
    state.0
}

/// Ítem "Balance del mes" del menú de la barra de menús (tray). Se guarda el
/// handle para que el frontend pueda actualizar el texto con el balance real
/// cada vez que recalcula los totales del mes.
#[cfg(desktop)]
struct TrayBalance(tauri::menu::MenuItem<tauri::Wry>);

#[tauri::command]
fn tray_balance(app: tauri::AppHandle, texto: String) {
    #[cfg(desktop)]
    {
        use tauri::Manager;
        if let Some(state) = app.try_state::<TrayBalance>() {
            let _ = state.0.set_text(texto);
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, texto);
}

#[cfg(desktop)]
/// Menú nativo de la ventana, armado según el idioma de la app.
/// El frontend llama `menu_language` al arrancar y al cambiar el idioma en
/// Configuración; aquí se reconstruye el menú completo con los mismos ids,
/// así on_menu_event sigue funcionando sin cambios.
fn construir_menu(app: &tauri::AppHandle, en: bool) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
    let tr = |es_txt: &'static str, en_txt: &'static str| if en { en_txt } else { es_txt };

    let acerca = AboutMetadata {
        name: Some("Tamio".into()),
        comments: Some(tr("Tesorería y secretaría para iglesias", "Treasury and secretariat for churches").to_string()),
        copyright: Some("© 2026 Tamio".into()),
        ..Default::default()
    };

    let menu_app = SubmenuBuilder::new(app, "Tamio")
        .item(&PredefinedMenuItem::about(app, Some(tr("Acerca de Tamio", "About Tamio")), Some(acerca))?)
        .separator()
        .item(&MenuItemBuilder::new(tr("Ajustes…", "Settings…")).id("ajustes").accelerator("CmdOrCtrl+,").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some(tr("Ocultar Tamio", "Hide Tamio")))?)
        .item(&PredefinedMenuItem::hide_others(app, Some(tr("Ocultar otros", "Hide Others")))?)
        .item(&PredefinedMenuItem::show_all(app, Some(tr("Mostrar todo", "Show All")))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some(tr("Salir de Tamio", "Quit Tamio")))?)
        .build()?;

    let menu_archivo = SubmenuBuilder::new(app, tr("Archivo", "File"))
        .item(&MenuItemBuilder::new(tr("Nuevo registro…", "New record…")).id("nuevo").accelerator("CmdOrCtrl+N").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new(tr("Sincronizar ahora", "Sync now")).id("sync").accelerator("CmdOrCtrl+R").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some(tr("Cerrar ventana", "Close Window")))?)
        .build()?;

    let menu_edicion = SubmenuBuilder::new(app, tr("Edición", "Edit"))
        .item(&PredefinedMenuItem::undo(app, Some(tr("Deshacer", "Undo")))?)
        .item(&PredefinedMenuItem::redo(app, Some(tr("Rehacer", "Redo")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(tr("Cortar", "Cut")))?)
        .item(&PredefinedMenuItem::copy(app, Some(tr("Copiar", "Copy")))?)
        .item(&PredefinedMenuItem::paste(app, Some(tr("Pegar", "Paste")))?)
        .item(&PredefinedMenuItem::select_all(app, Some(tr("Seleccionar todo", "Select All")))?)
        .build()?;

    // "Ver" como navegación completa de la app, con atajos ⌘1–⌘9.
    // Los ids "nav:<ruta>" se emiten al frontend, que navega (y sus
    // guardas por rol/plan redirigen si esa área no aplica).
    let menu_ver = SubmenuBuilder::new(app, tr("Ver", "View"))
        .item(&MenuItemBuilder::new(tr("Paleta de comandos…", "Command palette…")).id("cmdk").accelerator("CmdOrCtrl+K").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new(tr("Inicio", "Home")).id("nav:/").accelerator("CmdOrCtrl+1").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new(tr("Ingresos", "Income")).id("nav:/ingresos").accelerator("CmdOrCtrl+2").build(app)?)
        .item(&MenuItemBuilder::new(tr("Gastos", "Expenses")).id("nav:/gastos").accelerator("CmdOrCtrl+3").build(app)?)
        .item(&MenuItemBuilder::new(tr("Reportes", "Reports")).id("nav:/reportes").accelerator("CmdOrCtrl+4").build(app)?)
        .item(&MenuItemBuilder::new(tr("Depósitos", "Deposits")).id("nav:/depositos").accelerator("CmdOrCtrl+5").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new(tr("Membresía", "Membership")).id("nav:/membresia").accelerator("CmdOrCtrl+6").build(app)?)
        .item(&MenuItemBuilder::new(tr("Cartas", "Letters")).id("nav:/cartas").accelerator("CmdOrCtrl+7").build(app)?)
        .item(&MenuItemBuilder::new(tr("Agenda", "Agenda")).id("nav:/agenda").accelerator("CmdOrCtrl+8").build(app)?)
        .separator()
        .item(&MenuItemBuilder::new(tr("Mensajes", "Messages")).id("nav:/inbox").accelerator("CmdOrCtrl+9").build(app)?)
        .separator()
        .item(&PredefinedMenuItem::fullscreen(app, Some(tr("Pantalla completa", "Full Screen")))?)
        .build()?;

    let menu_ventana = SubmenuBuilder::new(app, tr("Ventana", "Window"))
        .item(&PredefinedMenuItem::minimize(app, Some(tr("Minimizar", "Minimize")))?)
        .item(&PredefinedMenuItem::maximize(app, Some(tr("Ampliar", "Zoom")))?)
        .build()?;

    let menu_ayuda = SubmenuBuilder::new(app, tr("Ayuda", "Help"))
        .item(&MenuItemBuilder::new(tr("Ayuda de Tamio", "Tamio Help")).id("ayuda").build(app)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&menu_app, &menu_archivo, &menu_edicion, &menu_ver, &menu_ventana, &menu_ayuda])
        .build()
}

/// Cambia el idioma del menú nativo. Lo llama el frontend con "es"/"en".
/// En iOS/Android no hay menú de ventana: el comando existe pero no hace nada.
#[tauri::command]
fn menu_language(app: tauri::AppHandle, lang: String) {
    #[cfg(desktop)]
    {
        let en = lang.starts_with("en");
        if let Ok(menu) = construir_menu(&app, en) {
            let _ = app.set_menu(menu);
        }
    }
    #[cfg(not(desktop))]
    let _ = (app, lang);
}

/// Conexión única a la base cifrada (SQLite es rápido; el Mutex basta).
struct DbCifrada(std::sync::Mutex<rusqlite::Connection>);

#[tauri::command]
fn db_select(
    state: tauri::State<'_, DbCifrada>,
    query: String,
    params: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    motordb::seleccionar(&conn, &query, &params)
}

#[tauri::command]
fn db_execute(
    state: tauri::State<'_, DbCifrada>,
    query: String,
    params: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    motordb::ejecutar(&conn, &query, &params)
}

/// Respaldo manual: exporta una copia SIN cifrar a la ruta que eligió el
/// usuario en el diálogo de guardar (una decisión consciente, como los CSV).
#[tauri::command]
fn db_backup(state: tauri::State<'_, DbCifrada>, destino: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    motordb::exportar_plano(&conn, std::path::Path::new(&destino))
}

/// Archivos que NUNCA entran en el respaldo: la base viva (cifrada, ilegible
/// sin la clave del Llavero) y sus temporales de SQLite.
fn es_archivo_de_base(nombre: &str) -> bool {
    nombre.starts_with("tesoreria.db")
        || nombre == "respaldo-temporal.db"
        || nombre.ends_with("-wal")
        || nombre.ends_with("-shm")
}

/// Carpetas cuyo contenido SÍ es del usuario y no se puede regenerar.
const CARPETAS_DE_DOCUMENTOS: [&str; 3] = ["comprobantes", "adjuntos", "imagenes"];

/// ¿Es un archivo suelto que vale la pena guardar?
///
/// En la carpeta de datos no solo viven los documentos del usuario: la
/// impresión deja ahí cada PDF que se genera (printUtils los escribe para
/// abrirlos con Vista Previa) y cada carta se escribe como .html. Eso es
/// material DERIVADO: se vuelve a generar con un clic desde los mismos datos,
/// y meterlo en el respaldo solo lo engorda y lo llena de ruido.
///
/// Se guardan las imágenes sueltas —el logo y las firmas antiguas— porque esas
/// sí son originales que el usuario aportó y que no se pueden rehacer.
fn es_documento_del_usuario(nombre: &str) -> bool {
    let n = nombre.to_lowercase();
    n.ends_with(".png") || n.ends_with(".jpg") || n.ends_with(".jpeg")
}

/// Recorre una carpeta y añade al ZIP todo lo que cuelgue de ella.
fn anadir_carpeta(zip: &mut paquete::Zip, dir: &std::path::Path, prefijo: &str) -> Result<(), String> {
    let entradas = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()), // carpeta que no existe: no es un error
    };
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        let nombre = entrada.file_name().to_string_lossy().to_string();
        if ruta.is_dir() {
            anadir_carpeta(zip, &ruta, &format!("{prefijo}{nombre}/"))?;
        } else {
            zip.anadir(&ruta, &format!("{prefijo}{nombre}"))?;
        }
    }
    Ok(())
}

/// Añade al ZIP lo que es del usuario: las carpetas de documentos enteras y las
/// imágenes sueltas de la raíz. Todo lo demás de la carpeta de datos queda
/// fuera a propósito.
fn anadir_documentos(zip: &mut paquete::Zip, dir: &std::path::Path, prefijo: &str) -> Result<(), String> {
    for carpeta in CARPETAS_DE_DOCUMENTOS {
        let sub = dir.join(carpeta);
        if sub.is_dir() {
            anadir_carpeta(zip, &sub, &format!("{prefijo}{carpeta}/"))?;
        }
    }
    let entradas = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };
    for entrada in entradas.flatten() {
        let ruta = entrada.path();
        if ruta.is_dir() { continue; }
        let nombre = entrada.file_name().to_string_lossy().to_string();
        if es_archivo_de_base(&nombre) || !es_documento_del_usuario(&nombre) { continue; }
        zip.anadir(&ruta, &format!("{prefijo}{nombre}"))?;
    }
    Ok(())
}

/// Respaldo COMPLETO: un ZIP con la base descifrada más todos los documentos.
///
/// El respaldo era solo el `.db`, y eso dejó de bastar cuando los comprobantes
/// pasaron a vivir dentro de la carpeta de la app. Antes al menos estaban en el
/// Escritorio del usuario y se los llevaba su Time Machine; ahora, restaurar en
/// otra Mac dejaba la base apuntando a archivos que allí no existen y todos los
/// comprobantes desaparecían en silencio, justo después de haberlos
/// "protegido". Para una tesorería auditable eso es lo contrario de lo que se
/// buscaba.
///
/// Dentro del ZIP:
///   tamio.db          — la base, descifrada y legible en cualquier parte
///   datos/…           — comprobantes, adjuntos de cartas, logo y firmas
#[tauri::command]
fn db_backup_paquete(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbCifrada>,
    destino: String,
) -> Result<(), String> {
    use tauri::Manager;
    let datos = dir_datos(&app)?;
    let config = app.path().app_config_dir().map_err(|e| e.to_string())?;

    // La copia descifrada se hace primero en un temporal dentro de la carpeta
    // de la app, y de ahí entra al ZIP. Nunca se deja suelta en el disco del
    // usuario: la base sin cifrar solo debe existir dentro del paquete.
    std::fs::create_dir_all(&datos).map_err(|e| e.to_string())?;
    let temporal = datos.join("respaldo-temporal.db");
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        motordb::exportar_plano(&conn, &temporal)?;
    }

    let resultado = (|| -> Result<(), String> {
        let mut zip = paquete::Zip::crear(std::path::Path::new(&destino))?;
        zip.anadir(&temporal, "tamio.db")?;
        anadir_documentos(&mut zip, &datos, "datos/")?;
        // En Linux config y datos son carpetas distintas; en macOS son la
        // misma y esta segunda pasada no añade nada (ya está todo).
        if config != datos {
            anadir_documentos(&mut zip, &config, "datos/")?;
        }
        zip.cerrar()
    })();

    let _ = std::fs::remove_file(&temporal);
    resultado
}

// ---------------------------------------------------------------------------
// Comprobantes
//
// Estas tres funciones existen en Rust y no en el frontend por una razón
// concreta: `fs:scope` limita al WEBVIEW, no al lado Rust. La migración que
// trae adentro los comprobantes viejos tiene que poder leer iCloud Drive
// (~/Library/Mobile Documents), discos externos en /Volumes y carpetas que el
// usuario eligió hace un año, todas fuera del alcance acotado. Si esto viviera
// en el frontend, `exists()` daría falso sobre un archivo que SÍ está y la app
// acusaría al tesorero de haberlo borrado.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Restaurar un respaldo
//
// Tamio tenía respaldo y no tenía restauración: si la Mac se moría, el tesorero
// tenía el archivo en la mano y no había dónde ponerlo.
//
// La sustitución NO se hace en caliente. `DbCifrada` mantiene un Mutex con la
// conexión abierta desde el arranque, y el único momento en que nadie tiene la
// base abierta es ANTES de abrirla. Así que restaurar ocurre en dos tiempos:
// se prepara todo en `restauracion/`, se deja un marcador y la app se reinicia;
// al arrancar, antes de abrir la base, se aplica. Ver docs/restaurar.md.
// ---------------------------------------------------------------------------

const CARPETA_RESTAURACION: &str = "restauracion";
const MARCADOR: &str = "APLICAR";
const BASE_DEL_PAQUETE: &str = "tamio.db";
/// Archivo junto a la base que deja la sincronización en pausa tras aplicar
/// un respaldo. Lo escribe `aplicar_restauracion_pendiente`; el frontend lo
/// consulta (`sync_pausada`) y lo borra cuando un humano decide reactivar
/// (`sync_pausa_quitar`). Vive fuera de la base a propósito: la base es
/// justamente lo que el respaldo reemplaza.
const PAUSA_SYNC: &str = "sync-en-pausa-por-restauracion";

/// Lo que se le enseña al usuario ANTES de tocar nada: qué trae el paquete.
/// Un "¿seguro?" genérico no basta para la operación más destructiva de la app.
#[derive(serde::Serialize)]
struct ResumenRespaldo {
    /// De qué congregación es el paquete. Sin esto, restaurar por error el
    /// respaldo de otra iglesia con cifras parecidas no se puede notar.
    iglesia: String,
    movimientos: i64,
    miembros: i64,
    depositos: i64,
    /// Fecha del movimiento más reciente que trae ("2026-05-14"), o vacío.
    hasta: String,
    /// true si venía como `.db` suelto (respaldo anterior a los paquetes).
    formato_antiguo: bool,
    /// Documentos incluidos (comprobantes, adjuntos, logo, firmas).
    documentos: usize,
}

/// Versión de esquema de una base ya extraída.
///
/// **No se lee `PRAGMA user_version`**: Tamio nunca lo ha usado. La versión
/// aplicada vive en la tabla `_migraciones` (ver `motordb::correr_migraciones`),
/// y `sqlcipher_export` copia las tablas, así que viaja dentro del respaldo.
/// Preguntarle a `user_version` devolvería 0 siempre — un candado que no cierra.
fn version_del_paquete(conn: &rusqlite::Connection) -> i64 {
    conn.query_row("SELECT coalesce(max(version), 0) FROM _migraciones", [], |r| r.get(0))
        .unwrap_or(0)
}

fn dir_restauracion(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(dir_datos(app)?.join(CARPETA_RESTAURACION))
}

/// Espacio libre en el volumen donde está esa carpeta, en bytes.
/// `None` si el sistema no lo sabe decir — en ese caso no se bloquea nada.
#[cfg(unix)]
fn espacio_libre(dir: &std::path::Path) -> Option<u64> {
    use std::os::unix::ffi::OsStrExt;
    let c = std::ffi::CString::new(dir.as_os_str().as_bytes()).ok()?;
    // SAFETY: `stat` se rellena entero antes de leerlo, y `c` vive hasta el
    // final de la llamada.
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    if unsafe { libc::statvfs(c.as_ptr(), &mut stat) } != 0 {
        return None;
    }
    // f_bavail: bloques disponibles para un proceso sin privilegios, que es lo
    // que de verdad puede usar la app (f_bfree incluye la reserva de root).
    //
    // Los `as u64` parecen de más y clippy los marca — en Linux los dos campos
    // YA son u64. Pero en macOS `f_bavail` es un u32 y `f_frsize` un u64, así
    // que quitarlos deja un `u32 * u64` que no compila donde de verdad importa.
    // Un aviso de clippy en Linux vale menos que un build roto en la Mac.
    #[allow(clippy::unnecessary_cast)]
    Some(stat.f_bavail as u64 * stat.f_frsize as u64)
}

#[cfg(not(unix))]
fn espacio_libre(_dir: &std::path::Path) -> Option<u64> {
    None
}

/// Comprueba que cabe el respaldo antes de empezar a extraerlo.
///
/// El pico de espacio es más del doble del paquete: se extrae entero dentro de
/// la carpeta de la app Y la base anterior se aparta sin borrarse. Quedarse sin
/// disco a mitad de la extracción deja un respaldo a medias y una base apartada
/// — recuperable, pero un susto innecesario cuando se puede avisar antes.
///
/// Se pide 2,5 veces el tamaño del paquete: el doble por extracción + copia
/// apartada, más medio de margen para los temporales de SQLite.
fn comprobar_espacio(paquete: &std::path::Path, destino: &std::path::Path) -> Result<(), String> {
    let tam = std::fs::metadata(paquete).map(|m| m.len()).unwrap_or(0);
    let necesario = tam.saturating_mul(5) / 2;
    let Some(libre) = espacio_libre(destino) else { return Ok(()) };
    if libre < necesario {
        let mb = |b: u64| b / 1_048_576;
        return Err(format!(
            "No hay espacio suficiente para restaurar. El respaldo ocupa {} MB y hacen falta \
             unos {} MB libres (se extrae el paquete y además se conserva la base actual). \
             Ahora mismo quedan {} MB. Libera espacio y vuelve a intentarlo.",
            mb(tam), mb(necesario), mb(libre)
        ));
    }
    Ok(())
}

fn contar(conn: &rusqlite::Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |r| r.get(0)).unwrap_or(0)
}

/// Extrae el respaldo elegido y devuelve qué trae, SIN tocar la base actual.
/// Si el archivo no vale, se descubre aquí y no se ha cambiado nada todavía.
#[tauri::command]
fn restaurar_preparar(app: tauri::AppHandle, origen: String) -> Result<ResumenRespaldo, String> {
    let origen = std::path::Path::new(&origen);
    let dir = dir_restauracion(&app)?;
    let _ = std::fs::remove_dir_all(&dir); // intento anterior a medias
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    comprobar_espacio(origen, &dir)?;

    // El formato se reconoce por CONTENIDO, no por extensión: el usuario
    // renombra archivos, y un `.zip` puede ser cualquier cosa.
    let mut documentos = 0usize;
    let formato_antiguo = if paquete::es_zip(origen) {
        let escritos = paquete::extraer(origen, &dir)?;
        documentos = escritos.saturating_sub(1); // menos la propia base
        false
    } else if motordb::es_sqlite_plano(origen) {
        std::fs::copy(origen, dir.join(BASE_DEL_PAQUETE)).map_err(|e| e.to_string())?;
        true
    } else {
        let _ = std::fs::remove_dir_all(&dir);
        return Err("ese archivo no es un respaldo de Tamio".into());
    };

    let base = dir.join(BASE_DEL_PAQUETE);
    if !motordb::es_sqlite_plano(&base) {
        let _ = std::fs::remove_dir_all(&dir);
        return Err("el respaldo no contiene una base de datos legible".into());
    }

    // Viene descifrada, así que se lee sin clave.
    let conn = rusqlite::Connection::open(&base).map_err(|e| e.to_string())?;

    // Un respaldo de una versión MÁS NUEVA no se puede aplicar: las migraciones
    // solo van hacia adelante, así que la app abriría una base con columnas y
    // tablas que no conoce. De los fallos posibles al restaurar, este es el
    // único que acaba en datos perdidos, así que se corta aquí — antes de
    // apartar nada y antes de enseñar la confirmación.
    let del_paquete = version_del_paquete(&conn);
    let conocida = version_esquema_conocida();
    if del_paquete > conocida {
        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
        return Err(format!(
            "Este respaldo se hizo con una versión más nueva de Tamio (esquema {del_paquete}; \
             esta versión entiende hasta el {conocida}). Actualiza Tamio y vuelve a intentarlo."
        ));
    }

    let resumen = ResumenRespaldo {
        iglesia: conn
            .query_row("SELECT nombre FROM churches ORDER BY id LIMIT 1", [], |r| r.get::<_, String>(0))
            .unwrap_or_default(),
        movimientos: contar(&conn, "SELECT count(*) FROM transactions WHERE deleted = 0"),
        miembros: contar(&conn, "SELECT count(*) FROM members WHERE deleted = 0"),
        depositos: contar(&conn, "SELECT count(*) FROM depositos_bancarios WHERE deleted = 0"),
        hasta: conn
            .query_row(
                "SELECT COALESCE(MAX(substr(fecha,1,10)), '') FROM transactions WHERE deleted = 0",
                [],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_default(),
        formato_antiguo,
        documentos,
    };
    drop(conn);
    Ok(resumen)
}

/// Confirma: deja el marcador para que el próximo arranque aplique el respaldo.
#[tauri::command]
fn restaurar_confirmar(app: tauri::AppHandle) -> Result<(), String> {
    let dir = dir_restauracion(&app)?;
    if !dir.join(BASE_DEL_PAQUETE).is_file() {
        return Err("no hay ningún respaldo preparado".into());
    }
    std::fs::write(dir.join(MARCADOR), b"1").map_err(|e| e.to_string())
}

/// El usuario se echó atrás: se tira lo preparado y no ha pasado nada.
#[tauri::command]
fn restaurar_cancelar(app: tauri::AppHandle) -> Result<(), String> {
    let dir = dir_restauracion(&app)?;
    let _ = std::fs::remove_dir_all(&dir);
    Ok(())
}

/// Ruta del bundle `.app` que contiene a este ejecutable, si lo hay.
/// `/…/Tamio.app/Contents/MacOS/tesoreria` → `/…/Tamio.app`.
#[cfg(target_os = "macos")]
fn ruta_bundle() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let bundle = exe.parent()?.parent()?.parent()?; // MacOS → Contents → .app
    if bundle.extension().is_some_and(|e| e == "app") {
        Some(bundle.to_path_buf())
    } else {
        None // `tauri dev`: el binario está suelto, no dentro de un bundle
    }
}

/// Reinicia la app para que el arranque aplique el respaldo.
///
/// **No se usa `AppHandle::restart()`.** Esa función vuelve a ejecutar
/// el binario de dentro del bundle (`Contents/MacOS/tesoreria`) como si fuera
/// un programa suelto, y el proceso resultante queda mal registrado ante el
/// sistema de ventanas: la ventana abre pero nunca pinta nada. El síntoma es
/// una ventana en blanco después de restaurar, con la app por lo demás
/// perfectamente sana — cerrarla y abrirla a mano funcionaba.
///
/// En su lugar se lanza `open -n` sobre el propio `.app`, que es como macOS
/// espera que se arranque una aplicación, con un segundo de espera para que
/// este proceso haya terminado de cerrarse antes de que el nuevo abra la base.
///
/// Si algo de esto fallara, el respaldo ya está preparado y con su marcador
/// puesto: basta con volver a abrir Tamio a mano para que se aplique.
#[tauri::command]
fn restaurar_reiniciar() {
    // Se lanza un ayudante que espera un segundo y vuelve a abrir Tamio. La
    // espera es para que este proceso haya terminado de cerrarse antes de que
    // el nuevo toque la base.
    #[cfg(target_os = "macos")]
    if let Some(bundle) = ruta_bundle() {
        // La ruta va como argumento ($1) y no interpolada en el script, para
        // que un espacio o una comilla en el nombre no rompan nada.
        let _ = std::process::Command::new("/bin/sh")
            .arg("-c")
            .arg("sleep 1; exec /usr/bin/open -n \"$1\"")
            .arg("--")
            .arg(&bundle)
            .spawn();
    }

    // Y se sale de inmediato con `std::process::exit`.
    //
    // NO se usan `app.restart()` ni `app.exit()`. Los dos hacen su trabajo
    // desde el hilo principal, y esto corre en un hilo de trabajo del runtime
    // de comandos: la llamada se queda esperando un turno que nunca llega, el
    // proceso no se cierra, y el `invoke` del frontend jamás se resuelve. El
    // síntoma es el botón "Restaurar y reiniciar" que se queda pulsado para
    // siempre — que es exactamente lo que pasaba.
    //
    // Salir a lo bruto es seguro aquí: el marcador ya está escrito en disco y
    // la base todavía no se ha tocado (se sustituye en el arranque siguiente).
    // Lo peor que puede pasar es que SQLite tenga que recuperar su diario al
    // abrir, que es para lo que existe.
    std::process::exit(0);
}

/// Copia el contenido de una carpeta sobre otra **fusionando**: no borra nada de
/// lo que ya hubiera. La política y el porqué están en docs/respaldo.md.
fn fusionar(origen: &std::path::Path, destino: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(destino).map_err(|e| e.to_string())?;
    for entrada in std::fs::read_dir(origen).map_err(|e| e.to_string())?.flatten() {
        let ruta = entrada.path();
        let nombre = entrada.file_name();
        if ruta.is_dir() {
            fusionar(&ruta, &destino.join(nombre))?;
        } else {
            std::fs::copy(&ruta, destino.join(nombre)).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn marca_de_tiempo() -> String {
    motordb::marca_de_tiempo()
}

/// Aplica el respaldo preparado. Se llama en el arranque, ANTES de abrir la
/// base: es el único instante en que nadie la tiene abierta.
///
/// Devuelve true si aplicó algo (para avisar al usuario después).
fn aplicar_restauracion_pendiente(
    app: &tauri::AppHandle,
    ruta_db: &std::path::Path,
    clave: &str,
) -> Result<bool, String> {
    let dir = dir_restauracion(app)?;
    if !dir.join(MARCADOR).is_file() {
        return Ok(false);
    }
    let base_nueva = dir.join(BASE_DEL_PAQUETE);
    if !motordb::es_sqlite_plano(&base_nueva) {
        // Preparación a medias: se descarta y se arranca con lo de siempre.
        let _ = std::fs::remove_dir_all(&dir);
        return Ok(false);
    }

    // El marcador se quita ANTES de empezar. Si algo falla a mitad, el arranque
    // siguiente NO vuelve a intentarlo: un fallo que se repite en cada apertura
    // deja la app inutilizable y va apartando una base más cada vez. Se intenta
    // una vez, y si sale mal el usuario lo vuelve a lanzar a mano sabiendo qué
    // pasó.
    let _ = std::fs::remove_file(dir.join(MARCADOR));

    // La pausa de sincronización se escribe AQUÍ, en el mismo instante en que
    // el respaldo empieza a aplicarse — no después, desde el frontend. Antes
    // la marcaba el frontend al arrancar, y si la app se cerraba entre aplicar
    // y arrancar la interfaz, la pausa no se escribía nunca: la sincronización
    // habría corrido sola sobre datos recién restaurados, exactamente lo que
    // el diseño existe para evitar. Se escribe antes del intercambio de bases:
    // si la restauración fallara a medias, quedarse en pausa de más es el lado
    // seguro del error.
    let _ = std::fs::write(ruta_db.with_file_name(PAUSA_SYNC), b"1");

    // La base actual se APARTA, nunca se borra: si el paquete resultara estar
    // dañado a medio camino, el tesorero no puede quedarse sin las dos.
    let apartada = if ruta_db.exists() {
        let destino = ruta_db.with_extension(format!("db.antes-de-restaurar-{}", marca_de_tiempo()));
        std::fs::rename(ruta_db, &destino).map_err(|e| e.to_string())?;
        for suf in ["-wal", "-shm"] {
            let mut p = ruta_db.as_os_str().to_owned();
            p.push(suf);
            let _ = std::fs::remove_file(std::path::PathBuf::from(p));
        }
        Some(destino)
    } else {
        None
    };

    // A partir de aquí la base vieja ya no está en su sitio. Si algo falla, se
    // devuelve tal cual estaba: es preferible arrancar como si no se hubiera
    // restaurado nada que arrancar sin base ninguna.
    let resultado = (|| -> Result<(), String> {
        std::fs::copy(&base_nueva, ruta_db).map_err(|e| e.to_string())?;
        // ESTE es el paso que hace portable un respaldo: la base del paquete
        // viene descifrada a propósito, porque la clave del Llavero del equipo
        // de origen no existe aquí. Se cifra al llegar, con la clave de ESTA
        // Mac.
        motordb::migrar_a_cifrado(ruta_db, clave)?;
        // migrar_a_cifrado deja el original en claro como .respaldo-sin-cifrar.
        // Ahí no puede quedarse: son los datos de la iglesia sin cifrar en el
        // disco.
        let _ = std::fs::remove_file(ruta_db.with_extension("db.respaldo-sin-cifrar"));

        let documentos = dir.join("datos");
        if documentos.is_dir() {
            fusionar(&documentos, &dir_datos(app)?)?;
        }
        Ok(())
    })();

    match resultado {
        Ok(()) => {
            let _ = std::fs::remove_dir_all(&dir);
            Ok(true)
        }
        Err(e) => {
            // Marcha atrás: vuelve la base de antes y se conserva `restauracion/`
            // por si sirve para diagnosticar.
            let _ = std::fs::remove_file(ruta_db);
            if let Some(previa) = apartada {
                let _ = std::fs::rename(&previa, ruta_db);
            }
            Err(e)
        }
    }
}

/// ¿El arranque de esta sesión aplicó un respaldo? Lo consulta el frontend para
/// avisar y para dejar la sincronización en pausa.
struct RestauroAlArrancar(bool);

#[tauri::command]
fn restauracion_aplicada(state: tauri::State<'_, RestauroAlArrancar>) -> bool {
    state.0
}

/// Ruta del archivo de pausa (junto a la base, en app_config_dir).
fn ruta_pausa_sync(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join(PAUSA_SYNC))
}

/// ¿La sincronización está en pausa por una restauración? El frontend lo lee
/// en el arranque, antes de encender el motor de sincronización.
#[tauri::command]
fn sync_pausada(app: tauri::AppHandle) -> bool {
    ruta_pausa_sync(&app).map(|p| p.is_file()).unwrap_or(false)
}

/// Un humano revisó los datos y decidió reactivar: se quita el archivo.
#[tauri::command]
fn sync_pausa_quitar(app: tauri::AppHandle) -> Result<(), String> {
    let ruta = ruta_pausa_sync(&app)?;
    match std::fs::remove_file(&ruta) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Carpeta de datos de la app. Todo lo que guarda Tamio cuelga de aquí.
fn dir_datos(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Nombre de archivo sin caracteres problemáticos, conservando algo legible.
fn nombre_seguro(s: &str) -> String {
    let limpio: String = s
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let recortado = limpio.trim_matches('-').replace("--", "-");
    let corto: String = recortado.chars().take(40).collect();
    let corto = corto.trim_matches('-').to_string();
    if corto.is_empty() { "comprobante".into() } else { corto }
}

/// ¿Existe el archivo? Lo pregunta Rust porque el `exists()` del plugin miente
/// (da falso) sobre cualquier ruta fuera del alcance del webview, y una cosa es
/// "no lo puedo leer" y otra muy distinta "ya no está".
#[tauri::command]
fn comprobante_existe(ruta: String) -> bool {
    std::path::Path::new(&ruta).is_file()
}

/// Copia un comprobante a la carpeta de la app y devuelve su ruta **RELATIVA**
/// a esa carpeta (`comprobantes/1754…-recibo.pdf`).
///
/// Relativa y no absoluta a propósito: una ruta absoluta lleva dentro el nombre
/// de usuario del Mac donde se creó (`/Users/ivan/Library/…`). Al restaurar un
/// respaldo en otro equipo ese usuario no existe y TODOS los comprobantes
/// fallan, aunque los archivos vengan en el paquete.
#[tauri::command]
fn copiar_a_datos(app: tauri::AppHandle, origen: String, subcarpeta: String) -> Result<String, String> {
    let base = dir_datos(&app)?;
    let origen_path = std::path::Path::new(&origen);

    // Ya está dentro: solo hay que devolver su forma relativa, sin duplicarlo.
    if let Ok(rel) = origen_path.strip_prefix(&base) {
        return Ok(rel.to_string_lossy().replace('\\', "/"));
    }

    if !origen_path.is_file() {
        return Err(format!("no existe: {origen}"));
    }
    let carpeta = base.join(&subcarpeta);
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;

    let nombre = origen_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "comprobante".into());
    let ext = origen_path
        .extension()
        .map(|s| s.to_string_lossy().to_lowercase())
        .unwrap_or_else(|| "bin".into());
    let marca = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let archivo = format!("{marca}-{}.{ext}", nombre_seguro(&nombre));

    std::fs::copy(origen_path, carpeta.join(&archivo)).map_err(|e| e.to_string())?;
    Ok(format!("{subcarpeta}/{archivo}"))
}

/// Clave del cifrado, guardada en el Llavero de macOS (keyring). La primera
/// vez se genera una aleatoria de 32 bytes; después siempre se reutiliza.
fn clave_db() -> Result<String, String> {
    let entrada = keyring::Entry::new("Tamio", "clave-base-datos").map_err(|e| e.to_string())?;
    match entrada.get_password() {
        Ok(c) => Ok(c),
        Err(keyring::Error::NoEntry) => {
            let clave = motordb::generar_clave().map_err(|e| e.to_string())?;
            entrada.set_password(&clave).map_err(|e| e.to_string())?;
            Ok(clave)
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Abre (migrando si hace falta) la base cifrada en app_config_dir — la misma
/// carpeta y el mismo nombre de archivo que usaba tauri-plugin-sql, así la
/// actualización toma los datos existentes tal cual.
fn iniciar_db(app: &tauri::AppHandle) -> Result<(rusqlite::Connection, bool), String> {
    use tauri::Manager;
    let carpeta = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    let ruta = carpeta.join("tesoreria.db");
    let clave = clave_db()?;

    // Un respaldo preparado se aplica AQUÍ, antes de abrir nada: es el único
    // instante en que la base no está en uso. Si falla, se avisa pero se
    // arranca igual — quedarse sin app es peor que quedarse sin restaurar.
    let restaurado = match aplicar_restauracion_pendiente(app, &ruta, &clave) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("no se pudo aplicar el respaldo: {e}");
            false
        }
    };

    // Base heredada del plugin viejo (sin cifrar): se cifra una sola vez y el
    // original queda como tesoreria.db.respaldo-sin-cifrar.
    if motordb::es_sqlite_plano(&ruta) {
        motordb::migrar_a_cifrado(&ruta, &clave)?;
    }

    let mut conn = match motordb::abrir(&ruta, &clave) {
        Ok(c) => c,
        Err(_) if ruta.exists() => {
            // Clave perdida o archivo corrupto: se aparta (nunca se borra) y
            // se arranca vacío; con sesión en la nube, el sync repuebla.
            motordb::apartar_ilegible(&ruta);
            motordb::abrir(&ruta, &clave).map_err(|e| e.to_string())?
        }
        Err(e) => return Err(e.to_string()),
    };
    // Red de seguridad ANTES de migrar: una migración no se deshace sola. Solo
    // copia si de verdad hay algo pendiente, así que en un arranque normal no
    // cuesta nada. Si devuelve error, NO se migra — ver la explicación larga en
    // motordb::respaldo_antes_de_migrar.
    if let Some(copia) = motordb::respaldo_antes_de_migrar(
        &conn,
        &ruta,
        &migraciones(),
        espacio_libre(&carpeta),
    )? {
        eprintln!("respaldo previo a la migración: {}", copia.display());
    }
    motordb::correr_migraciones(&mut conn, &migraciones())?;
    Ok((conn, restaurado))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(desktop)]
    use tauri::menu::{MenuBuilder, MenuItemBuilder};
    use tauri::Emitter;
    use tauri::Manager;

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Base de datos cifrada: se abre (y migra si hace falta) antes de
            // mostrar nada; si truena, el error detiene el arranque con causa.
            let (conn, restaurado) = iniciar_db(app.handle()).map_err(|e| format!("base de datos: {e}"))?;
            app.manage(DbCifrada(std::sync::Mutex::new(conn)));
            app.manage(RestauroAlArrancar(restaurado));

            // Menú nativo de macOS. Arranca en español; el frontend llama
            // menu_language con el idioma real apenas inicia i18n.
            #[cfg(desktop)]
            app.set_menu(construir_menu(app.handle(), false)?)?;

            // Ícono en la barra de menús (junto al reloj): muestra el balance
            // del mes y accesos rápidos aunque la ventana esté cerrada.
            #[cfg(desktop)]
            {
                use tauri::tray::TrayIconBuilder;

                let balance_item = MenuItemBuilder::new("Balance del mes: —")
                    .id("tray-balance")
                    .enabled(false)
                    .build(app)?;
                let tray_menu = MenuBuilder::new(app)
                    .item(&balance_item)
                    .separator()
                    .item(&MenuItemBuilder::new("Abrir Tamio").id("tray-abrir").build(app)?)
                    .item(&MenuItemBuilder::new("Nuevo registro…").id("tray-nuevo").build(app)?)
                    .build()?;

                let mut tray = TrayIconBuilder::with_id("tamio-tray")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(true)
                    .tooltip("Tamio");
                if let Some(icono) = app.default_window_icon() {
                    tray = tray.icon(icono.clone());
                }
                tray.build(app)?;
                app.manage(TrayBalance(balance_item));
            }

            // Vibrancy del sidebar (translúcido estilo Finder), solo macOS.
            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
                let ok = app
                    .get_webview_window("main")
                    .map(|w| apply_vibrancy(&w, NSVisualEffectMaterial::Sidebar, None, None).is_ok())
                    .unwrap_or(false);
                app.manage(VibrancyOk(ok));
            }
            #[cfg(not(target_os = "macos"))]
            app.manage(VibrancyOk(false));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vibrancy_ok, tray_balance, menu_language, db_select, db_execute, db_backup,
            db_backup_paquete, comprobante_existe, copiar_a_datos,
            restaurar_preparar, restaurar_confirmar, restaurar_cancelar, restaurar_reiniciar,
            restauracion_aplicada, sync_pausada, sync_pausa_quitar
        ]);

    // El menú de ventana (y sus eventos) solo existe en escritorio.
    #[cfg(desktop)]
    let builder = builder.on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if let Some(ruta) = id.strip_prefix("nav:") {
                let _ = app.emit("menu-nav", ruta.to_string());
                return;
            }
            // La ventana puede estar cerrada cuando se usa el menú del tray.
            let mostrar = |app: &tauri::AppHandle| {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.unminimize();
                    let _ = w.set_focus();
                }
            };
            match id {
                "tray-abrir" => mostrar(app),
                "tray-nuevo" => {
                    mostrar(app);
                    let _ = app.emit("menu-nuevo", ());
                }
                "nuevo" => { let _ = app.emit("menu-nuevo", ()); }
                "cmdk" => { let _ = app.emit("menu-cmdk", ()); }
                "ajustes" => { let _ = app.emit("menu-ajustes", ()); }
                "sync" => { let _ = app.emit("menu-sync", ()); }
                "ayuda" => { let _ = app.emit("menu-ayuda", ()); }
                _ => {}
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ---------------------------------------------------------------------------
// Pruebas de la cadena de migraciones (punto 5.3 de la auditoría).
//
// Una instalación vieja de Tamio se actualiza corriendo las migraciones que le
// falten, y hasta ahora nadie había comprobado que la cadena entera funcione:
// ni desde una base vacía (instalación nueva) ni desde un punto intermedio
// (instalación vieja que se salta varias versiones de golpe). Van en memoria:
// rusqlite con SQLCipher abre bases en memoria sin clave.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod pruebas_migraciones {
    use super::*;

    fn base_vacia() -> rusqlite::Connection {
        rusqlite::Connection::open_in_memory().expect("base en memoria")
    }

    fn tiene_tabla(conn: &rusqlite::Connection, nombre: &str) -> bool {
        conn.query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            [nombre],
            |r| r.get::<_, i64>(0),
        )
        .unwrap_or(0)
            == 1
    }

    #[test]
    fn las_versiones_van_en_orden_y_sin_repetirse() {
        // correr_migraciones aplica "todo lo mayor que la versión actual" en
        // el orden del vector: un vector desordenado o con versiones repetidas
        // aplicaría de más o de menos sin avisar.
        let migs = migraciones();
        assert_eq!(migs.first().map(|m| m.version), Some(1), "la cadena empieza en 1");
        for par in migs.windows(2) {
            assert!(
                par[0].version < par[1].version,
                "la v{} no puede ir después de la v{}",
                par[1].version,
                par[0].version
            );
        }
    }

    #[test]
    fn una_base_vacia_llega_a_la_ultima_version() {
        let mut conn = base_vacia();
        motordb::correr_migraciones(&mut conn, &migraciones())
            .expect("la cadena completa debe aplicar sin error");
        assert_eq!(version_del_paquete(&conn), version_esquema_conocida());
        // Y el esquema resultante trae de verdad las dos secciones de la app.
        for tabla in [
            "churches", "members", "transactions", "depositos_bancarios",
            "servicios", "servicio_asistencia", "actas", "cartas", "agenda",
            "cortes", "corte_movimientos",
        ] {
            assert!(tiene_tabla(&conn, tabla), "falta la tabla {tabla}");
        }
    }

    #[test]
    fn una_base_a_media_cadena_se_completa_desde_cualquier_punto() {
        // Simula todas las instalaciones viejas posibles: la que se quedó en
        // la v1, la que se quedó en la v2… y comprueba que cada una llega a
        // la última. Si una migración dependiera de algo que una anterior ya
        // no deja como ella espera, esto lo delata con el corte exacto.
        let migs = migraciones();
        for corte in 1..migs.len() {
            let mut conn = base_vacia();
            motordb::correr_migraciones(&mut conn, &migs[..corte])
                .unwrap_or_else(|e| panic!("aplicando hasta la v{}: {e}", migs[corte - 1].version));
            motordb::correr_migraciones(&mut conn, &migs)
                .unwrap_or_else(|e| panic!("completando desde la v{}: {e}", migs[corte - 1].version));
            assert_eq!(version_del_paquete(&conn), version_esquema_conocida());
        }
    }

    #[test]
    fn correr_dos_veces_no_hace_nada_la_segunda() {
        let mut conn = base_vacia();
        motordb::correr_migraciones(&mut conn, &migraciones()).expect("primera pasada");
        let filas: i64 = conn
            .query_row("SELECT count(*) FROM _migraciones", [], |r| r.get(0))
            .unwrap();
        motordb::correr_migraciones(&mut conn, &migraciones()).expect("segunda pasada");
        let despues: i64 = conn
            .query_row("SELECT count(*) FROM _migraciones", [], |r| r.get(0))
            .unwrap();
        assert_eq!(filas, despues, "la segunda pasada no debe registrar nada nuevo");
    }
}
