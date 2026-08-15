//! Pruebas del respaldo automático previo a las migraciones.
//!
//! `cd harness-db && cargo run`
//!
//! Es el paso 6 de docs/plan-centavos.md: la migración 36 reescribe las cuatro
//! columnas de dinero y no se puede deshacer, así que la app se copia la base
//! antes de tocarla. Este archivo comprueba que esa copia se hace cuando toca,
//! que sirve para algo, y —lo más importante— que **no** se hace cuando no hace
//! falta, porque una copia en cada arranque llenaría el disco del tesorero.

// Se incluye el módulo tal cual, sin duplicarlo: lo que se prueba es el archivo
// que compila la app, no una copia que se desviaría al primer cambio.
#[path = "../../src-tauri/src/motordb.rs"]
#[allow(dead_code)] // el harness solo ejerce una parte del módulo
mod motordb;

use motordb::{
    correr_migraciones, respaldo_antes_de_migrar, version_aplicada, Migracion,
    MARCA_ANTES_DE_MIGRAR,
};
use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

static FALLOS: AtomicU32 = AtomicU32::new(0);

fn chk(ok: bool, q: &str) {
    if ok {
        println!("  ✓ {q}");
    } else {
        FALLOS.fetch_add(1, Ordering::Relaxed);
        println!("  ✗ {q}");
    }
}

/// Una cadena de migraciones de mentira, todas inofensivas: aquí no se prueba
/// qué hace cada migración, sino cuándo se hace la copia.
fn migs(hasta: i64) -> Vec<Migracion> {
    (1..=hasta)
        .map(|v| Migracion {
            version: v,
            description: "prueba",
            sql: "CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, monto REAL NOT NULL)",
        })
        .collect()
}

/// Los respaldos automáticos que hay ahora mismo junto a la base, ordenados.
fn copias(ruta: &Path) -> Vec<PathBuf> {
    let base = ruta.file_stem().unwrap().to_str().unwrap();
    let prefijo = format!("{base}.{MARCA_ANTES_DE_MIGRAR}");
    let mut v: Vec<PathBuf> = std::fs::read_dir(ruta.parent().unwrap())
        .unwrap()
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            let n = p.file_name().unwrap().to_str().unwrap();
            n.starts_with(&prefijo) && !n.ends_with("-wal") && !n.ends_with("-shm")
        })
        .collect();
    v.sort();
    v
}

fn main() {
    let dir = std::env::temp_dir().join(format!("harness-db-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let ruta = dir.join("tesoreria.db");

    // Igual que motordb::abrir: WAL activado. Importa, porque el WAL es
    // justo lo que puede dejar un respaldo incompleto.
    let mut conn = Connection::open(&ruta).unwrap();
    conn.query_row::<String, _, _>("PRAGMA journal_mode = WAL", [], |r| r.get(0)).unwrap();

    println!("\nInstalación nueva: no hay nada que respaldar");
    // El archivo YA pesa aquí: poner WAL le escribe una cabecera. Por eso no
    // basta con mirar el tamaño para saber si hay datos.
    chk(
        respaldo_antes_de_migrar(&conn, &ruta, &migs(3), None).unwrap().is_none(),
        "base recién creada, sin tablas ni migraciones: no copia",
    );
    correr_migraciones(&mut conn, &migs(3)).unwrap();
    conn.execute("INSERT INTO t (monto) VALUES (1.15)", []).unwrap();
    chk(version_aplicada(&conn) == 3, "version_aplicada lee el esquema 3");

    println!("\nArranque normal: no hay migraciones pendientes");
    chk(
        respaldo_antes_de_migrar(&conn, &ruta, &migs(3), None).unwrap().is_none(),
        "nada pendiente: no toca el disco",
    );
    chk(copias(&ruta).is_empty(), "no dejó ningún archivo");

    println!("\nActualización que trae esquema nuevo");
    let copia = respaldo_antes_de_migrar(&conn, &ruta, &migs(5), None)
        .unwrap()
        .expect("con migraciones pendientes tenía que respaldar");
    chk(copia.exists(), "se creó el respaldo");
    chk(
        copia.file_name().unwrap().to_str().unwrap().ends_with("-v5"),
        "el nombre dice hasta qué versión se iba a migrar",
    );

    println!("\nEl respaldo abre solo y tiene los datos de ANTES");
    let c2 = Connection::open(&copia).unwrap();
    chk(
        c2.query_row::<f64, _, _>("SELECT monto FROM t", [], |r| r.get(0)).unwrap() == 1.15,
        "el movimiento de 1.15 está en la copia",
    );
    chk(version_aplicada(&c2) == 3, "la copia quedó en el esquema 3, sin migrar");
    drop(c2);

    println!("\nEl diario (WAL): lo escrito justo antes de migrar también entra");
    conn.execute("INSERT INTO t (monto) VALUES (999999.99)", []).unwrap();
    let copia2 = respaldo_antes_de_migrar(&conn, &ruta, &migs(6), None).unwrap().unwrap();
    let c3 = Connection::open(&copia2).unwrap();
    chk(
        c3.query_row::<i64, _, _>("SELECT count(*) FROM t", [], |r| r.get(0)).unwrap() == 2,
        "los dos movimientos, incluido el que aún estaba en el diario",
    );
    drop(c3);

    println!("\nSi no cabe en el disco, no se migra");
    let e = respaldo_antes_de_migrar(&conn, &ruta, &migs(7), Some(1024)).unwrap_err();
    chk(e.contains("NO se ha tocado"), "el error le dice al tesorero que su base sigue intacta");
    chk(copias(&ruta).len() == 2, "y no dejó ninguna copia a medias");

    println!("\nSolo se guardan las tres más recientes");
    // Un segundo entre copias: la marca del nombre va en segundos, y sin la
    // espera todas se llamarían igual y se pisarían.
    for v in 7..=11 {
        std::thread::sleep(std::time::Duration::from_millis(1100));
        respaldo_antes_de_migrar(&conn, &ruta, &migs(v), None).unwrap().unwrap();
        correr_migraciones(&mut conn, &migs(v)).unwrap();
    }
    let quedan = copias(&ruta);
    chk(quedan.len() == 3, &format!("de 7 copias quedan {}", quedan.len()));
    chk(
        quedan.last().unwrap().to_str().unwrap().ends_with("-v11"),
        "y las que se conservan son las más recientes",
    );

    std::fs::remove_dir_all(&dir).ok();
    let f = FALLOS.load(Ordering::Relaxed);
    println!(
        "{}",
        if f == 0 {
            "\n✔ el respaldo automático funciona.\n".to_string()
        } else {
            format!("\n✗ {f} fallo(s) en el respaldo automático.\n")
        }
    );
    std::process::exit(i32::from(f != 0));
}
