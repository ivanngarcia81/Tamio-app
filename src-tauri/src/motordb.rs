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

/// Segundos desde el epoch, para nombrar archivos apartados.
pub fn marca_de_tiempo() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}

/// Versión de esquema ya aplicada en esta base. Cuenta también el registro del
/// plugin viejo (`_sqlx_migrations`), igual que `correr_migraciones`. Si aún no
/// existe ninguna de las dos tablas, es una base nueva: 0.
pub fn version_aplicada(conn: &Connection) -> i64 {
    let propia: i64 = conn
        .query_row("SELECT coalesce(max(version), 0) FROM _migraciones", [], |r| r.get(0))
        .unwrap_or(0);
    let de_sqlx: i64 = conn
        .query_row(
            "SELECT coalesce(max(version), 0) FROM _sqlx_migrations WHERE success = 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    propia.max(de_sqlx)
}

/// ¿Hay alguna tabla de la app? Se descartan las internas de SQLite y las de
/// contabilidad de migraciones, que no son datos de nadie.
fn tiene_tablas(conn: &Connection) -> bool {
    conn.query_row(
        "SELECT count(*) FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name NOT IN ('_migraciones', '_sqlx_migrations')",
        [],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

/// Marca de los respaldos que se hacen solos antes de migrar.
pub const MARCA_ANTES_DE_MIGRAR: &str = "db.antes-de-migrar-";

/// Cuántos se conservan. Solo se crea uno por actualización que traiga esquema
/// nuevo, así que tres cubre tres versiones hacia atrás; más allá de eso el
/// respaldo que sirve es el que el tesorero se guarda él.
const RESPALDOS_QUE_SE_GUARDAN: usize = 3;

/// **Copia de seguridad automática antes de aplicar migraciones pendientes.**
///
/// Existe por una razón concreta: una migración no se puede deshacer. La 36
/// (dinero a centavos) reescribe las cuatro columnas de importes, y si algo
/// saliera mal en la Mac de alguien no habría forma de volver — salvo que
/// exista este archivo. Ver `docs/plan-centavos.md`, paso 6.
///
/// Tres decisiones que no son obvias:
///
/// - **Solo copia si hay algo pendiente.** En el 99 % de los arranques no hay
///   migraciones nuevas y esta función no toca el disco. El coste se paga una
///   vez por actualización con esquema nuevo, que es exactamente cuando importa.
/// - **Consolida el diario (WAL) antes de copiar.** El archivo `.db` por sí
///   solo puede no tener los últimos movimientos: están en el `-wal`. Copiarlo
///   sin absorberlo daría un respaldo al que le faltan justo los registros más
///   recientes. Si el checkpoint no termina, se copian también `-wal` y `-shm`,
///   para que el respaldo esté completo pase lo que pase.
/// - **Si no cabe, NO se migra.** Es la decisión incómoda: la app no abre y
///   dice por qué. La alternativa —migrar igual, sin red— cambia un fallo
///   molesto y reversible (liberar disco y volver a abrir) por uno irreversible.
///
/// Devuelve la ruta del respaldo, o `None` si no había nada pendiente.
pub fn respaldo_antes_de_migrar(
    conn: &Connection,
    ruta: &Path,
    migraciones: &[Migracion],
    espacio_libre: Option<u64>,
) -> Result<Option<PathBuf>, String> {
    let aplicada = version_aplicada(conn);
    let Some(hasta) = migraciones.iter().map(|m| m.version).filter(|v| *v > aplicada).max() else {
        return Ok(None); // nada pendiente: ni copia ni coste
    };
    // Instalación nueva: no hay datos que proteger. Se comprueban las DOS
    // cosas —que no se haya migrado nunca y que no haya ni una tabla— porque el
    // archivo existe y ya pesa desde que se abre: poner WAL le escribe una
    // cabecera. Mirar solo el tamaño hacía una copia inútil en cada instalación
    // nueva; mirar solo la versión dejaría sin red a una base con datos y sin
    // registro de migraciones, que es justo la que más falta le hace.
    let Ok(meta) = std::fs::metadata(ruta) else { return Ok(None) };
    let tamano = meta.len();
    if tamano == 0 || (aplicada == 0 && !tiene_tablas(conn)) {
        return Ok(None);
    }

    // Mismo criterio que al restaurar: la copia más el margen que SQLite
    // necesita para reescribir tablas durante la propia migración.
    if let Some(libre) = espacio_libre {
        let necesario = tamano.saturating_mul(5) / 2;
        if libre < necesario {
            let mb = |b: u64| b / 1_048_576;
            return Err(format!(
                "No hay espacio para el respaldo automático que Tamio hace antes de \
                 actualizar la base de datos. Hacen falta unos {} MB libres y quedan {} MB. \
                 Libera espacio y vuelve a abrir Tamio. La base de datos NO se ha tocado.",
                mb(necesario), mb(libre)
            ));
        }
    }

    let _ = conn.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |r| r.get::<_, i64>(0));

    let destino = ruta.with_extension(format!("{MARCA_ANTES_DE_MIGRAR}{}-v{hasta}", marca_de_tiempo()));
    std::fs::copy(ruta, &destino).map_err(|e| {
        let _ = std::fs::remove_file(&destino); // nunca dejar una copia a medias
        format!("no se pudo respaldar la base antes de actualizarla: {e}")
    })?;
    // Por si el checkpoint no vació el diario: el respaldo tiene que poder
    // abrirse solo, sin depender de archivos que la app va a seguir usando.
    for suf in ["-wal", "-shm"] {
        let mut origen = ruta.as_os_str().to_owned();
        origen.push(suf);
        let origen = PathBuf::from(origen);
        if origen.metadata().map(|m| m.len() > 0).unwrap_or(false) {
            let mut d = destino.as_os_str().to_owned();
            d.push(suf);
            let _ = std::fs::copy(&origen, PathBuf::from(d));
        }
    }

    limpiar_respaldos_viejos(ruta);
    Ok(Some(destino))
}

/// Deja solo los `RESPALDOS_QUE_SE_GUARDAN` más recientes. Se ordenan por
/// nombre y no por fecha del archivo: el nombre lleva la marca de tiempo de
/// cuando se hizo, que es el dato de verdad — copiar o mover la carpeta cambia
/// las fechas del sistema de archivos y dejaría el orden al azar.
fn limpiar_respaldos_viejos(ruta: &Path) {
    let (Some(dir), Some(base)) = (ruta.parent(), ruta.file_stem().and_then(|s| s.to_str())) else {
        return;
    };
    let prefijo = format!("{base}.{MARCA_ANTES_DE_MIGRAR}");
    let Ok(entradas) = std::fs::read_dir(dir) else { return };
    let mut copias: Vec<PathBuf> = entradas
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                // Los -wal/-shm de cada copia se van con ella, no cuentan aparte.
                .is_some_and(|n| n.starts_with(&prefijo) && !n.ends_with("-wal") && !n.ends_with("-shm"))
        })
        .collect();
    if copias.len() <= RESPALDOS_QUE_SE_GUARDAN {
        return;
    }
    copias.sort();
    for vieja in &copias[..copias.len() - RESPALDOS_QUE_SE_GUARDAN] {
        let _ = std::fs::remove_file(vieja);
        for suf in ["-wal", "-shm"] {
            let mut p = vieja.as_os_str().to_owned();
            p.push(suf);
            let _ = std::fs::remove_file(PathBuf::from(p));
        }
    }
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

    let aplicada = version_aplicada(conn);

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
    let destino = path.with_extension(format!("db.ilegible-{}", marca_de_tiempo()));
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
