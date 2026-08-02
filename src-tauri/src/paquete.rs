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
