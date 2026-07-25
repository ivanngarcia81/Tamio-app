//! Motor de base de datos cifrada (SQLCipher vía rusqlite).
//!
//! Reemplaza a tauri-plugin-sql conservando su contrato con el frontend:
//! `select(query, params)` devuelve filas como objetos JSON y
//! `execute(query, params)` devuelve { rowsAffected, lastInsertId }.
//! Los placeholders `$1..$N` se enlazan POR NOMBRE (parameter_index), no por
//! posición: `... $2 ... $1 ...` funciona igual que con sqlx.
//!
//! Este módulo no depende de Tauri: toda la lógica se prueba con un harness
//! standalone (rusqlite compila en cualquier plataforma). El pegamento con
//! Tauri (comandos, estado, Llavero) vive en lib.rs.

use rusqlite::types::ValueRef;
use rusqlite::Connection;
use serde_json::{Map, Value as JsonValue};
use std::path::{Path, PathBuf};

/// Una migración del esquema (equivalente a tauri_plugin_sql::Migration).
pub struct Migracion {
    pub version: i64,
    pub description: &'static str,
    pub sql: &'static str,
}

/// ¿El archivo es un SQLite SIN cifrar? (los cifrados no llevan la cabecera
/// en claro). Un archivo inexistente devuelve false.
pub fn es_sqlite_plano(path: &Path) -> bool {
    match std::fs::read(path) {
        Ok(bytes) => bytes.len() >= 16 && &bytes[..16] == b"SQLite format 3\0",
        Err(_) => false,
    }
}

/// Genera una clave hex de 32 bytes con el PRNG de SQLite (ChaCha20 sembrado
/// del sistema operativo) — evita depender de otro crate de aleatoriedad.
pub fn generar_clave() -> Result<String, rusqlite::Error> {
    let conn = Connection::open_in_memory()?;
    conn.query_row("SELECT lower(hex(randomblob(32)))", [], |r| r.get(0))
}

/// Abre la base cifrada y valida la clave (una clave mala truena aquí, no a
/// mitad de la app). Deja WAL y foreign_keys como los dejaba sqlx.
pub fn abrir(path: &Path, clave: &str) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "key", clave)?;
    // Validación temprana: con clave incorrecta esto devuelve NotADatabase.
    conn.query_row::<i64, _, _>("SELECT count(*) FROM sqlite_master", [], |r| r.get(0))?;
    conn.query_row::<String, _, _>("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    Ok(conn)
}

/// Migra el archivo SIN cifrar que dejó tauri-plugin-sql a uno cifrado.
///
/// Receta oficial de SQLCipher (sqlcipher_export): se abre el plano, se
/// adjunta el destino con clave y se exporta TODO (datos + esquema +
/// user_version). El original queda como `<nombre>.respaldo-sin-cifrar` —
/// nunca se destruye información en la migración.
pub fn migrar_a_cifrado(path: &Path, clave: &str) -> Result<(), String> {
    let destino: PathBuf = path.with_extension("db.cifrando");
    let _ = std::fs::remove_file(&destino); // intento anterior a medias

    {
        let plano = Connection::open(path).map_err(|e| e.to_string())?;
        // Absorbe el WAL pendiente de sqlx antes de exportar.
        let _: String = plano
            .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get::<_, i64>(0).map(|v| v.to_string()))
            .unwrap_or_default();
        plano
            .execute(
                "ATTACH DATABASE ?1 AS cifrada KEY ?2",
                rusqlite::params![destino.to_string_lossy(), clave],
            )
            .map_err(|e| e.to_string())?;
        plano
            .query_row("SELECT sqlcipher_export('cifrada')", [], |_| Ok(()))
            .map_err(|e| e.to_string())?;
        plano
            .execute("DETACH DATABASE cifrada", [])
            .map_err(|e| e.to_string())?;
    }

    // Verificación: el cifrado abre con la clave y NO es legible en claro.
    abrir(&destino, clave).map_err(|e| format!("verificación falló: {e}"))?;
    if es_sqlite_plano(&destino) {
        return Err("el destino quedó sin cifrar".into());
    }

    let respaldo = path.with_extension("db.respaldo-sin-cifrar");
    std::fs::rename(path, &respaldo).map_err(|e| e.to_string())?;
    std::fs::rename(&destino, path).map_err(|e| e.to_string())?;
    // Los -wal/-shm viejos pertenecen al archivo plano ya renombrado.
    for suf in ["-wal", "-shm"] {
        let mut p = path.as_os_str().to_owned();
        p.push(suf);
        let _ = std::fs::remove_file(PathBuf::from(p));
    }
    Ok(())
}

/// Corre las migraciones pendientes. Continúa donde se quedó sqlx: si existe
/// `_sqlx_migrations` (el registro del plugin viejo) se toma su última
/// versión como punto de partida; de ahí en adelante el registro vive en
/// `_migraciones`. Cada migración corre dentro de una transacción.
pub fn correr_migraciones(conn: &mut Connection, migraciones: &[Migracion]) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS _migraciones (
            version INTEGER PRIMARY KEY,
            descripcion TEXT NOT NULL,
            aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    let propia: i64 = conn
        .query_row("SELECT coalesce(max(version), 0) FROM _migraciones", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let de_sqlx: i64 = conn
        .query_row(
            "SELECT coalesce(max(version), 0) FROM _sqlx_migrations WHERE success = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0); // la tabla no existe en instalaciones nuevas
    let aplicada = propia.max(de_sqlx);

    for m in migraciones {
        if m.version <= aplicada {
            continue;
        }
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(m.sql)
            .map_err(|e| format!("migración v{}: {e}", m.version))?;
        tx.execute(
            "INSERT INTO _migraciones (version, descripcion) VALUES (?1, ?2)",
            rusqlite::params![m.version, m.description],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Enlaza `params[i]` al placeholder `$i+1` por NOMBRE. Un placeholder no
/// usado en el SQL simplemente se ignora (igual que hacía sqlx).
fn enlazar(stmt: &mut rusqlite::Statement, params: &[JsonValue]) -> rusqlite::Result<()> {
    for (i, v) in params.iter().enumerate() {
        let nombre = format!("${}", i + 1);
        let Some(idx) = stmt.parameter_index(&nombre)? else { continue };
        match v {
            JsonValue::Null => stmt.raw_bind_parameter(idx, rusqlite::types::Null)?,
            JsonValue::Bool(b) => stmt.raw_bind_parameter(idx, *b)?,
            JsonValue::Number(n) => {
                if let Some(e) = n.as_i64() {
                    stmt.raw_bind_parameter(idx, e)?;
                } else {
                    stmt.raw_bind_parameter(idx, n.as_f64().unwrap_or(0.0))?;
                }
            }
            JsonValue::String(s) => stmt.raw_bind_parameter(idx, s.as_str())?,
            otro => stmt.raw_bind_parameter(idx, otro.to_string())?,
        }
    }
    Ok(())
}

fn a_json(v: ValueRef<'_>) -> JsonValue {
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(n) => JsonValue::from(n),
        ValueRef::Real(f) => JsonValue::from(f),
        ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => JsonValue::String(String::from_utf8_lossy(b).into_owned()),
    }
}

/// SELECT → array de objetos { columna: valor }, como el plugin viejo.
pub fn seleccionar(conn: &Connection, query: &str, params: &[JsonValue]) -> Result<JsonValue, String> {
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    enlazar(&mut stmt, params).map_err(|e| e.to_string())?;
    let columnas: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut filas = Vec::new();
    let mut rows = stmt.raw_query();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut obj = Map::with_capacity(columnas.len());
        for (i, c) in columnas.iter().enumerate() {
            obj.insert(c.clone(), a_json(row.get_ref(i).map_err(|e| e.to_string())?));
        }
        filas.push(JsonValue::Object(obj));
    }
    Ok(JsonValue::Array(filas))
}

/// INSERT/UPDATE/DELETE → { rowsAffected, lastInsertId } (contrato del plugin).
pub fn ejecutar(conn: &Connection, query: &str, params: &[JsonValue]) -> Result<JsonValue, String> {
    let mut stmt = conn.prepare(query).map_err(|e| e.to_string())?;
    enlazar(&mut stmt, params).map_err(|e| e.to_string())?;
    let cambios = stmt.raw_execute().map_err(|e| e.to_string())?;
    let mut obj = Map::new();
    obj.insert("rowsAffected".into(), JsonValue::from(cambios as i64));
    obj.insert("lastInsertId".into(), JsonValue::from(conn.last_insert_rowid()));
    Ok(JsonValue::Object(obj))
}


/// Exporta una copia SIN cifrar de la base viva (respaldo elegido por el
/// usuario, igual de legible que los CSV que ya exporta la app). La receta es
/// la inversa de migrar_a_cifrado: destino adjuntado con clave vacía.
pub fn exportar_plano(conn: &Connection, destino: &Path) -> Result<(), String> {
    let _ = std::fs::remove_file(destino);
    conn.execute(
        "ATTACH DATABASE ?1 AS plano KEY ''",
        rusqlite::params![destino.to_string_lossy()],
    )
    .map_err(|e| e.to_string())?;
    let resultado = conn
        .query_row("SELECT sqlcipher_export('plano')", [], |_| Ok(()))
        .map_err(|e| e.to_string());
    conn.execute("DETACH DATABASE plano", []).map_err(|e| e.to_string())?;
    resultado?;
    if !es_sqlite_plano(destino) {
        return Err("el respaldo no quedó legible".into());
    }
    Ok(())
}

/// Última defensa: si la base cifrada no abre (clave perdida o archivo roto),
/// se aparta con marca de tiempo — la app arranca vacía y el usuario
/// resincroniza desde la nube. Nunca se borra el archivo ilegible.
pub fn apartar_ilegible(path: &Path) -> Option<PathBuf> {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let destino = path.with_extension(format!("db.ilegible-{ts}"));
    match std::fs::rename(path, &destino) {
        Ok(()) => {
            for suf in ["-wal", "-shm"] {
                let mut p = path.as_os_str().to_owned();
                p.push(suf);
                let _ = std::fs::remove_file(PathBuf::from(p));
            }
            Some(destino)
        }
        Err(_) => None,
    }
}
