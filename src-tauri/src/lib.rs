use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "esquema inicial: iglesias, miembros y movimientos",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 3,
        description: "moneda por defecto: dolares en vez de pesos",
        kind: MigrationKind::Up,
        sql: r#"
            UPDATE churches SET moneda = 'USD' WHERE moneda = 'MXN';
            UPDATE transactions SET moneda = 'USD' WHERE moneda = 'MXN';
        "#,
    }, Migration {
        version: 4,
        description: "datos del tesorero para identificar quien genera los reportes",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE churches ADD COLUMN tesorero_nombre TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_cargo TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_email TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_telefono TEXT;
            ALTER TABLE churches ADD COLUMN tesorero_firma_path TEXT;
        "#,
    }, Migration {
        version: 5,
        description: "depositos bancarios",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 6,
        description: "directorio de usuarios administrativos (sin login todavia — preparado para el backend futuro)",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 7,
        description: "categorias personalizadas de ingreso/gasto por iglesia",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 8,
        description: "gastos fijos recurrentes (se materializan como transacciones cada mes)",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 9,
        description: "movimientos recurrentes (ingreso o gasto) + vinculo con la transaccion generada",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE gastos_recurrentes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'gasto';
            ALTER TABLE transactions ADD COLUMN recurrente_id INTEGER REFERENCES gastos_recurrentes(id) ON DELETE SET NULL;
        "#,
    }, Migration {
        version: 10,
        description: "datos del pastor para el bloque de firmas en los reportes PDF",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE churches ADD COLUMN pastor_nombre TEXT;
            ALTER TABLE churches ADD COLUMN pastor_cargo TEXT;
            ALTER TABLE churches ADD COLUMN pastor_email TEXT;
            ALTER TABLE churches ADD COLUMN pastor_telefono TEXT;
            ALTER TABLE churches ADD COLUMN pastor_firma_path TEXT;
        "#,
    }, Migration {
        version: 11,
        description: "baja de miembros con fecha y motivo (registro de membresía)",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE members ADD COLUMN fecha_baja TEXT;
            ALTER TABLE members ADD COLUMN motivo_baja TEXT;
        "#,
    }, Migration {
        version: 12,
        description: "ficha completa del miembro: membresía, vida espiritual y servicio",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 13,
        description: "actas de reuniones: información básica, asistencia, mociones, acuerdos y aprobación",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 14,
        description: "registro de servicios: culto, mensaje, escuela bíblica y asistencia",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 15,
        description: "asistencia por miembro en servicios: roster relacional con snapshot de nombre",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 16,
        description: "cartas y traslados fase 1: tabla de cartas, datos institucionales y secretaría",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 17,
        description: "cartas y traslados fase 2: solicitudes de cartas con vínculo bidireccional",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 18,
        description: "cartas y traslados fase 3: traslados de salida y de entrada",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 19,
        description: "cartas y traslados fase 4: plantillas de cartas con variables",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 20,
        description: "informes de membresía: cargos, historial de estados, seguimiento y umbrales",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE members ADD COLUMN cargos TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN historial_estados TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE members ADD COLUMN seguimiento_revisado_en TEXT;
            ALTER TABLE members ADD COLUMN seguimiento_notas TEXT NOT NULL DEFAULT '[]';
            ALTER TABLE churches ADD COLUMN umbrales_informes TEXT;
        "#,
    }, Migration {
        version: 21,
        description: "agendas y calendarios: actividades, recurrencia, recordatorios",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 22,
        description: "mensajes internos entre tesorería y secretaría",
        kind: MigrationKind::Up,
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
    }, Migration {
        version: 23,
        description: "sincronización E3: metadatos (uid/updated_at/deleted) en members",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE members ADD COLUMN uid TEXT;
            ALTER TABLE members ADD COLUMN updated_at TEXT;
            ALTER TABLE members ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE members SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE members SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_members_sync ON members(church_id, updated_at);
        "#,
    }, Migration {
        version: 24,
        description: "sincronización T1: metadatos (uid/updated_at/deleted) en transactions",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE transactions ADD COLUMN uid TEXT;
            ALTER TABLE transactions ADD COLUMN updated_at TEXT;
            ALTER TABLE transactions ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE transactions SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE transactions SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_tx_sync ON transactions(church_id, updated_at);
        "#,
    }, Migration {
        version: 25,
        description: "sincronización D1: metadatos (uid/updated_at/deleted) en depositos_bancarios",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE depositos_bancarios ADD COLUMN uid TEXT;
            ALTER TABLE depositos_bancarios ADD COLUMN updated_at TEXT;
            ALTER TABLE depositos_bancarios ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE depositos_bancarios SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE depositos_bancarios SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_depositos_sync ON depositos_bancarios(church_id, updated_at);
        "#,
    }, Migration {
        version: 26,
        description: "sincronización A1: metadatos (uid/updated_at/deleted) en actas",
        kind: MigrationKind::Up,
        sql: r#"
            ALTER TABLE actas ADD COLUMN uid TEXT;
            ALTER TABLE actas ADD COLUMN updated_at TEXT;
            ALTER TABLE actas ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
            UPDATE actas SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL;
            UPDATE actas SET updated_at = datetime('now') WHERE updated_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_actas_sync ON actas(church_id, updated_at);
        "#,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tesoreria.db", migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
