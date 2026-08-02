//! Escritor de ZIP mínimo para el respaldo en paquete.
//!
//! ¿Por qué a mano y no con la caja `zip`? Porque el respaldo tiene que
//! funcionar a la primera en la Mac de Iván, y una dependencia nueva que aquí
//! no se puede compilar (este repo se toca desde Linux sin GTK, donde `cargo
//! check` de un proyecto Tauri ni arranca) es un riesgo peor que 100 líneas de
//! formato documentado desde 1989.
//!
//! Todo se guarda **sin comprimir** (método 0, "stored"). No es pereza: los
//! comprobantes son JPG y PDF, que ya vienen comprimidos, y comprimir un JPG no
//! ahorra nada. La base sí comprimiría, pero no compensa arrastrar un
//! compresor por eso.
//!
//! Límites: el formato ZIP clásico usa contadores de 32 bits. Por encima de 4
//! GB haría falta ZIP64, así que se corta antes con un mensaje claro en vez de
//! escribir un archivo corrupto que nadie descubriría hasta necesitarlo.

use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::Path;

const TOPE: u64 = 3_500_000_000; // 3,5 GB — margen antes del límite de ZIP64

/// CRC-32 (el polinomio de PKZIP/zlib), calculado con tabla al vuelo para no
/// depender de nada.
fn crc32(datos: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in datos {
        crc ^= b as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xEDB8_8320 } else { crc >> 1 };
        }
    }
    !crc
}

struct Entrada {
    nombre: Vec<u8>,
    crc: u32,
    tam: u32,
    offset: u32,
}

pub struct Zip {
    salida: BufWriter<File>,
    entradas: Vec<Entrada>,
    pos: u64,
}

impl Zip {
    pub fn crear(destino: &Path) -> Result<Self, String> {
        let f = File::create(destino).map_err(|e| e.to_string())?;
        Ok(Zip { salida: BufWriter::new(f), entradas: Vec::new(), pos: 0 })
    }

    fn escribir(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.salida.write_all(bytes).map_err(|e| e.to_string())?;
        self.pos += bytes.len() as u64;
        Ok(())
    }

    /// Añade un archivo del disco con el nombre que tendrá dentro del ZIP.
    pub fn anadir(&mut self, origen: &Path, nombre: &str) -> Result<(), String> {
        let mut datos = Vec::new();
        File::open(origen)
            .map_err(|e| format!("{}: {e}", origen.display()))?
            .read_to_end(&mut datos)
            .map_err(|e| format!("{}: {e}", origen.display()))?;

        if self.pos + datos.len() as u64 > TOPE {
            return Err(
                "el respaldo supera los 3,5 GB; exporta los CSV y copia la carpeta a mano".into()
            );
        }

        let nb = nombre.replace('\\', "/").into_bytes();
        let crc = crc32(&datos);
        let tam = datos.len() as u32;
        let offset = self.pos as u32;

        // Cabecera local
        let mut h = Vec::with_capacity(30);
        h.extend_from_slice(&0x0403_4b50u32.to_le_bytes()); // firma
        h.extend_from_slice(&20u16.to_le_bytes());          // versión necesaria
        h.extend_from_slice(&0u16.to_le_bytes());           // banderas
        h.extend_from_slice(&0u16.to_le_bytes());           // método: sin comprimir
        h.extend_from_slice(&0u16.to_le_bytes());           // hora
        h.extend_from_slice(&0u16.to_le_bytes());           // fecha
        h.extend_from_slice(&crc.to_le_bytes());
        h.extend_from_slice(&tam.to_le_bytes());            // tamaño comprimido
        h.extend_from_slice(&tam.to_le_bytes());            // tamaño real
        h.extend_from_slice(&(nb.len() as u16).to_le_bytes());
        h.extend_from_slice(&0u16.to_le_bytes());           // campo extra
        self.escribir(&h)?;
        self.escribir(&nb)?;
        self.escribir(&datos)?;

        self.entradas.push(Entrada { nombre: nb, crc, tam, offset });
        Ok(())
    }

    /// Cierra el ZIP escribiendo el directorio central. Sin esto el archivo no
    /// lo abre nadie.
    pub fn cerrar(mut self) -> Result<(), String> {
        let inicio_cd = self.pos as u32;
        let entradas = std::mem::take(&mut self.entradas);
        for e in &entradas {
            let mut h = Vec::with_capacity(46);
            h.extend_from_slice(&0x0201_4b50u32.to_le_bytes()); // firma
            h.extend_from_slice(&20u16.to_le_bytes());          // versión creadora
            h.extend_from_slice(&20u16.to_le_bytes());          // versión necesaria
            h.extend_from_slice(&0u16.to_le_bytes());           // banderas
            h.extend_from_slice(&0u16.to_le_bytes());           // método
            h.extend_from_slice(&0u16.to_le_bytes());           // hora
            h.extend_from_slice(&0u16.to_le_bytes());           // fecha
            h.extend_from_slice(&e.crc.to_le_bytes());
            h.extend_from_slice(&e.tam.to_le_bytes());
            h.extend_from_slice(&e.tam.to_le_bytes());
            h.extend_from_slice(&(e.nombre.len() as u16).to_le_bytes());
            h.extend_from_slice(&0u16.to_le_bytes());           // extra
            h.extend_from_slice(&0u16.to_le_bytes());           // comentario
            h.extend_from_slice(&0u16.to_le_bytes());           // disco
            h.extend_from_slice(&0u16.to_le_bytes());           // atributos internos
            h.extend_from_slice(&0u32.to_le_bytes());           // atributos externos
            h.extend_from_slice(&e.offset.to_le_bytes());
            self.escribir(&h)?;
            let nombre = e.nombre.clone();
            self.escribir(&nombre)?;
        }
        let tam_cd = self.pos as u32 - inicio_cd;
        let n = entradas.len() as u16;

        let mut fin = Vec::with_capacity(22);
        fin.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
        fin.extend_from_slice(&0u16.to_le_bytes()); // disco
        fin.extend_from_slice(&0u16.to_le_bytes()); // disco del directorio
        fin.extend_from_slice(&n.to_le_bytes());
        fin.extend_from_slice(&n.to_le_bytes());
        fin.extend_from_slice(&tam_cd.to_le_bytes());
        fin.extend_from_slice(&inicio_cd.to_le_bytes());
        fin.extend_from_slice(&0u16.to_le_bytes()); // comentario
        self.escribir(&fin)?;

        self.salida.flush().map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// ¿Es un ZIP? Se mira la firma, no la extensión: el usuario puede renombrar
/// el archivo y el importador tiene que seguir reconociéndolo.
pub fn es_zip(ruta: &Path) -> bool {
    let mut buf = [0u8; 4];
    File::open(ruta)
        .and_then(|mut f| f.read_exact(&mut buf))
        .map(|_| buf == [0x50, 0x4b, 0x03, 0x04])
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

fn u16le(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}
fn u32le(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

/// Impide que un nombre dentro del ZIP escriba fuera de la carpeta de destino
/// ("zip slip"): `../../algo`, rutas absolutas o nombres de disco de Windows.
/// El paquete lo genera Tamio, pero un archivo que llega por correo o WhatsApp
/// puede venir manipulado, y aquí se está escribiendo en el disco del usuario.
fn nombre_seguro_zip(nombre: &str) -> Option<String> {
    if nombre.is_empty() || nombre.starts_with('/') || nombre.contains(':') {
        return None;
    }
    let mut partes = Vec::new();
    for parte in nombre.split('/') {
        match parte {
            "" | "." => continue,
            ".." => return None,
            p => partes.push(p),
        }
    }
    if partes.is_empty() { None } else { Some(partes.join("/")) }
}

/// Extrae el ZIP a una carpeta. Devuelve cuántos archivos escribió.
///
/// Solo entiende entradas SIN COMPRIMIR, que es como Tamio las escribe. Si
/// alguien descomprime el paquete y lo vuelve a comprimir con el Finder o con
/// WinRAR, las entradas pasan a estar en "deflate" y esto lo dice con todas las
/// letras en vez de fallar de una forma rara.
pub fn extraer(origen: &Path, destino: &Path) -> Result<usize, String> {
    let datos = std::fs::read(origen).map_err(|e| e.to_string())?;

    // El directorio central se localiza desde el final del archivo.
    let eocd = (0..datos.len().saturating_sub(21))
        .rev()
        .find(|&i| datos[i..i + 4] == [0x50, 0x4b, 0x05, 0x06])
        .ok_or("el archivo no es un paquete de Tamio (falta el índice del ZIP)")?;
    let total = u16le(&datos, eocd + 10) as usize;
    let mut pos = u32le(&datos, eocd + 16) as usize;

    std::fs::create_dir_all(destino).map_err(|e| e.to_string())?;
    let mut escritos = 0usize;

    for _ in 0..total {
        if pos + 46 > datos.len() || datos[pos..pos + 4] != [0x50, 0x4b, 0x01, 0x02] {
            return Err("el índice del paquete está dañado".into());
        }
        let metodo = u16le(&datos, pos + 10);
        let tam = u32le(&datos, pos + 24) as usize;
        let n_nombre = u16le(&datos, pos + 28) as usize;
        let n_extra = u16le(&datos, pos + 30) as usize;
        let n_com = u16le(&datos, pos + 32) as usize;
        let offset = u32le(&datos, pos + 42) as usize;
        let nombre = String::from_utf8_lossy(&datos[pos + 46..pos + 46 + n_nombre]).to_string();
        pos += 46 + n_nombre + n_extra + n_com;

        if nombre.ends_with('/') { continue; } // carpeta
        if metodo != 0 {
            return Err(format!(
                "«{nombre}» viene comprimido y Tamio solo lee sus propios paquetes sin comprimir. \
                 Usa el archivo .zip tal como lo guardó la app, sin descomprimirlo ni volver a comprimirlo."
            ));
        }
        let seguro = nombre_seguro_zip(&nombre)
            .ok_or_else(|| format!("el paquete trae una ruta no válida: «{nombre}»"))?;

        // La cabecera local repite el nombre y puede traer otro campo extra,
        // así que el inicio de los datos se calcula desde ella, no desde el
        // directorio central.
        if offset + 30 > datos.len() || datos[offset..offset + 4] != [0x50, 0x4b, 0x03, 0x04] {
            return Err(format!("«{nombre}» no se encuentra dentro del paquete"));
        }
        let inicio = offset + 30 + u16le(&datos, offset + 26) as usize + u16le(&datos, offset + 28) as usize;
        let fin = inicio + tam;
        if fin > datos.len() {
            return Err(format!("«{nombre}» está incompleto: el paquete se cortó"));
        }
        let contenido = &datos[inicio..fin];
        if crc32(contenido) != u32le(&datos, offset + 14) {
            return Err(format!("«{nombre}» está dañado (no cuadra la suma de verificación)"));
        }

        let ruta = destino.join(&seguro);
        if let Some(padre) = ruta.parent() {
            std::fs::create_dir_all(padre).map_err(|e| e.to_string())?;
        }
        std::fs::write(&ruta, contenido).map_err(|e| format!("{}: {e}", ruta.display()))?;
        escritos += 1;
    }
    Ok(escritos)
}

// ---------------------------------------------------------------------------
// Pruebas
//
// El formato ZIP se escribe a mano en este archivo, así que estas pruebas son
// lo único que impide que un cambio inocente lo rompa. Cubren las cinco cosas
// que de verdad importan: que lo que escribimos se pueda volver a leer, que un
// archivo manipulado no escriba fuera de su carpeta, que uno cortado no deje
// medio respaldo aplicado, que uno comprimido lo diga con todas las letras, y
// que se acepte un ZIP hecho por otra herramienta.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod pruebas {
    use super::*;

    /// ZIP sin comprimir generado por la librería `zipfile` de Python — es
    /// decir, por una herramienta que no es esta. Contiene `tamio.db` y
    /// `datos/comprobantes/recibo.pdf`. Sirve para comprobar que el lector no
    /// depende de detalles que solo pone nuestro escritor.
    const ZIP_DE_OTRA_HERRAMIENTA: &[u8] = &[
    80, 75, 3, 4, 20, 0, 0, 0, 0, 0, 117, 184, 2, 93, 11, 224, 246, 244, 16, 0, 0, 0, 16, 0,
    0, 0, 8, 0, 0, 0, 116, 97, 109, 105, 111, 46, 100, 98, 83, 81, 76, 105, 116, 101, 32,
    102, 111, 114, 109, 97, 116, 32, 51, 0, 80, 75, 3, 4, 20, 0, 0, 0, 0, 0, 117, 184, 2,
    93, 162, 186, 89, 233, 8, 0, 0, 0, 8, 0, 0, 0, 29, 0, 0, 0, 100, 97, 116, 111, 115, 47,
    99, 111, 109, 112, 114, 111, 98, 97, 110, 116, 101, 115, 47, 114, 101, 99, 105, 98, 111,
    46, 112, 100, 102, 37, 80, 68, 70, 45, 49, 46, 52, 80, 75, 1, 2, 20, 3, 20, 0, 0, 0, 0,
    0, 117, 184, 2, 93, 11, 224, 246, 244, 16, 0, 0, 0, 16, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 128, 1, 0, 0, 0, 0, 116, 97, 109, 105, 111, 46, 100, 98, 80, 75, 1, 2, 20,
    3, 20, 0, 0, 0, 0, 0, 117, 184, 2, 93, 162, 186, 89, 233, 8, 0, 0, 0, 8, 0, 0, 0, 29, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 1, 54, 0, 0, 0, 100, 97, 116, 111, 115, 47, 99, 111,
    109, 112, 114, 111, 98, 97, 110, 116, 101, 115, 47, 114, 101, 99, 105, 98, 111, 46, 112,
    100, 102, 80, 75, 5, 6, 0, 0, 0, 0, 2, 0, 2, 0, 129, 0, 0, 0, 121, 0, 0, 0, 0, 0
    ];

    /// El mismo, pero con las entradas comprimidas (deflate), que es lo que
    /// deja el Finder si alguien descomprime el paquete y lo vuelve a comprimir.
    const ZIP_COMPRIMIDO: &[u8] = &[
    80, 75, 3, 4, 20, 0, 0, 0, 8, 0, 117, 184, 2, 93, 11, 224, 246, 244, 18, 0, 0, 0, 16, 0,
    0, 0, 8, 0, 0, 0, 116, 97, 109, 105, 111, 46, 100, 98, 11, 14, 244, 201, 44, 73, 85, 72,
    203, 47, 202, 77, 44, 81, 48, 102, 0, 0, 80, 75, 3, 4, 20, 0, 0, 0, 8, 0, 117, 184, 2,
    93, 175, 138, 13, 166, 8, 0, 0, 0, 144, 1, 0, 0, 11, 0, 0, 0, 100, 97, 116, 111, 115,
    47, 120, 46, 116, 120, 116, 75, 76, 28, 5, 131, 9, 0, 0, 80, 75, 1, 2, 20, 3, 20, 0, 0,
    0, 8, 0, 117, 184, 2, 93, 11, 224, 246, 244, 18, 0, 0, 0, 16, 0, 0, 0, 8, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 128, 1, 0, 0, 0, 0, 116, 97, 109, 105, 111, 46, 100, 98, 80, 75, 1, 2,
    20, 3, 20, 0, 0, 0, 8, 0, 117, 184, 2, 93, 175, 138, 13, 166, 8, 0, 0, 0, 144, 1, 0, 0,
    11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 1, 56, 0, 0, 0, 100, 97, 116, 111, 115, 47,
    120, 46, 116, 120, 116, 80, 75, 5, 6, 0, 0, 0, 0, 2, 0, 2, 0, 111, 0, 0, 0, 105, 0, 0,
    0, 0, 0
    ];

    fn carpeta_temporal(nombre: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("tamio-prueba-{nombre}"));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn ida_y_vuelta_completa() {
        let dir = carpeta_temporal("ida-vuelta");
        let origen = dir.join("base.db");
        let contenido = b"SQLite format 3\0datos de la iglesia";
        std::fs::write(&origen, contenido).unwrap();

        let zip = dir.join("respaldo.zip");
        let mut z = Zip::crear(&zip).unwrap();
        z.anadir(&origen, "tamio.db").unwrap();
        z.anadir(&origen, "datos/comprobantes/recibo.pdf").unwrap();
        z.cerrar().unwrap();

        assert!(es_zip(&zip), "lo que escribimos tiene que reconocerse como ZIP");

        let destino = dir.join("extraido");
        let escritos = extraer(&zip, &destino).unwrap();
        assert_eq!(escritos, 2);
        assert_eq!(std::fs::read(destino.join("tamio.db")).unwrap(), contenido);
        assert_eq!(
            std::fs::read(destino.join("datos/comprobantes/recibo.pdf")).unwrap(),
            contenido,
            "el contenido tiene que llegar byte a byte"
        );
    }

    #[test]
    fn rechaza_rutas_que_escriben_fuera() {
        // "zip slip": el paquete lo genera Tamio, pero llega por correo o
        // WhatsApp y aquí se está escribiendo en el disco del usuario.
        assert_eq!(nombre_seguro_zip("../../.ssh/id_rsa"), None);
        assert_eq!(nombre_seguro_zip("/etc/passwd"), None);
        assert_eq!(nombre_seguro_zip("C:\\Windows\\algo"), None);
        assert_eq!(nombre_seguro_zip(""), None);
        assert_eq!(nombre_seguro_zip("datos/./a/../a/b.png").as_deref(), None);
        // Y lo normal sí pasa.
        assert_eq!(nombre_seguro_zip("datos/comprobantes/x.pdf").as_deref(),
                   Some("datos/comprobantes/x.pdf"));
    }

    #[test]
    fn rechaza_un_paquete_cortado_sin_escribir_nada() {
        let dir = carpeta_temporal("cortado");
        let origen = dir.join("base.db");
        std::fs::write(&origen, vec![7u8; 5000]).unwrap();
        let zip = dir.join("respaldo.zip");
        let mut z = Zip::crear(&zip).unwrap();
        z.anadir(&origen, "tamio.db").unwrap();
        z.cerrar().unwrap();

        // Se corta por la mitad: el índice del final desaparece.
        let bytes = std::fs::read(&zip).unwrap();
        let cortado = dir.join("cortado.zip");
        std::fs::write(&cortado, &bytes[..bytes.len() / 2]).unwrap();

        let destino = dir.join("extraido");
        assert!(extraer(&cortado, &destino).is_err());
        assert!(
            !destino.join("tamio.db").exists(),
            "un paquete cortado no puede dejar medio archivo escrito"
        );
    }

    #[test]
    fn rechaza_comprimido_con_mensaje_claro() {
        let dir = carpeta_temporal("comprimido");
        let zip = dir.join("deflate.zip");
        std::fs::write(&zip, ZIP_COMPRIMIDO).unwrap();
        let e = extraer(&zip, &dir.join("extraido")).unwrap_err();
        assert!(
            e.contains("comprimido"),
            "el mensaje tiene que decir qué pasó y qué hacer, no fallar de forma rara: {e}"
        );
    }

    #[test]
    fn acepta_un_zip_de_otra_herramienta() {
        let dir = carpeta_temporal("ajeno");
        let zip = dir.join("ajeno.zip");
        std::fs::write(&zip, ZIP_DE_OTRA_HERRAMIENTA).unwrap();
        let destino = dir.join("extraido");
        let escritos = extraer(&zip, &destino).unwrap();
        assert_eq!(escritos, 2);
        assert_eq!(
            std::fs::read(destino.join("tamio.db")).unwrap(),
            b"SQLite format 3\0"
        );
        assert_eq!(
            std::fs::read(destino.join("datos/comprobantes/recibo.pdf")).unwrap(),
            b"%PDF-1.4"
        );
    }

    #[test]
    fn detecta_el_formato_por_la_firma_y_no_por_el_nombre() {
        let dir = carpeta_temporal("firma");
        let falso = dir.join("respaldo.zip"); // extensión de ZIP…
        std::fs::write(&falso, b"SQLite format 3\0").unwrap(); // …contenido de otra cosa
        assert!(!es_zip(&falso));
    }
}
