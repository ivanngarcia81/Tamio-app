// Comprobantes de movimientos y depósitos: dónde viven los archivos.
//
// Hasta ahora la app guardaba en `comprobante_path` **la ruta que el usuario
// eligió en el diálogo** — su Escritorio, Descargas, iCloud, un pendrive — y la
// leía de ahí cada vez. Eso tiene dos problemas independientes:
//
//   1. Frágil. Si el usuario mueve, renombra o borra el archivo original (o
//      desconecta el disco donde estaba), el comprobante del asiento se pierde
//      sin aviso. Un comprobante existe justamente para poder demostrar el
//      movimiento tres años después.
//   2. Obliga a que la app tenga permiso de lectura sobre toda la carpeta del
//      usuario, porque el archivo puede estar en cualquier sitio.
//
// Se copia el archivo a la carpeta de datos de la app, igual que ya se hace con
// el logo, las firmas y los adjuntos de cartas (`services/cartas/adjuntos.ts`).

import { appDataDir, join } from "@tauri-apps/api/path";
import { copyFile, exists, mkdir } from "@tauri-apps/plugin-fs";

const CARPETA = "comprobantes";

function separador(dir: string): string {
  return dir.includes("\\") ? "\\" : "/";
}

/** Carpeta interna donde se guardan las copias. */
export async function carpetaComprobantes(): Promise<string> {
  return join(await appDataDir(), CARPETA);
}

/**
 * ¿La ruta ya está dentro de la carpeta de datos de la app? Se comprueba para
 * no volver a copiar en cada edición del mismo asiento (se acumularían copias)
 * y para saber qué hay que migrar.
 */
export async function esRutaInterna(path: string): Promise<boolean> {
  const dir = (await appDataDir()).replace(/[\\/]+$/, "");
  const sep = separador(dir);
  return path === dir || path.startsWith(dir + sep);
}

/** Nombre de archivo sin caracteres problemáticos, conservando algo legible. */
function nombreSeguro(s: string): string {
  return (
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "comprobante"
  );
}

/**
 * Copia el comprobante elegido a la carpeta de la app y devuelve la ruta
 * interna, que es la que se guarda en la base.
 *
 * Si la copia falla (disco lleno, permisos, unidad desconectada) **no se
 * interrumpe el guardado**: se devuelve la ruta original y el asiento se
 * registra igual. Perder el enlace al comprobante es malo; perder el asiento
 * contable por no poder copiar un PDF sería peor.
 */
export async function guardarComprobante(rutaOrigen: string): Promise<string> {
  try {
    if (await esRutaInterna(rutaOrigen)) return rutaOrigen;
    const carpeta = await carpetaComprobantes();
    await mkdir(carpeta, { recursive: true });
    const nombre = rutaOrigen.split(/[\\/]/).pop() ?? "comprobante";
    const punto = nombre.lastIndexOf(".");
    const base = punto > 0 ? nombre.slice(0, punto) : nombre;
    const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "bin";
    const destino = await join(carpeta, `${Date.now()}-${nombreSeguro(base)}.${ext}`);
    await copyFile(rutaOrigen, destino);
    return destino;
  } catch {
    return rutaOrigen;
  }
}

/** ¿Sigue existiendo el archivo? Se usa para avisar en la vista previa. */
export async function comprobanteDisponible(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}
