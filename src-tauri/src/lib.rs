mod motordb;

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
        .item(&MenuItemBuilder::new(tr("Guía de bienvenida (tour)", "Welcome guide (tour)")).id("tour").build(app)?)
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
fn copiar_comprobante(app: tauri::AppHandle, origen: String) -> Result<String, String> {
    let base = dir_datos(&app)?;
    let origen_path = std::path::Path::new(&origen);

    // Ya está dentro: solo hay que devolver su forma relativa, sin duplicarlo.
    if let Ok(rel) = origen_path.strip_prefix(&base) {
        return Ok(rel.to_string_lossy().replace('\\', "/"));
    }

    if !origen_path.is_file() {
        return Err(format!("no existe: {origen}"));
    }
    let carpeta = base.join("comprobantes");
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
    Ok(format!("comprobantes/{archivo}"))
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
fn iniciar_db(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    use tauri::Manager;
    let carpeta = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&carpeta).map_err(|e| e.to_string())?;
    let ruta = carpeta.join("tesoreria.db");
    let clave = clave_db()?;

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
    motordb::correr_migraciones(&mut conn, &migraciones())?;
    Ok(conn)
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
            let conn = iniciar_db(app.handle()).map_err(|e| format!("base de datos: {e}"))?;
            app.manage(DbCifrada(std::sync::Mutex::new(conn)));

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
            comprobante_existe, copiar_comprobante
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
                "tour" => { let _ = app.emit("menu-tour", ()); }
                _ => {}
            }
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
