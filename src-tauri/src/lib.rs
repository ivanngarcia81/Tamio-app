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
