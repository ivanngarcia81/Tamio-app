import Papa from "papaparse";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import type { Member } from "../../db";
import i18n from "../../i18n";
import type { AsistenciaMiembro } from "./membresia";
import { estadoEfectivo } from "./membresia";

function lista(json: string, prefijo: string): string {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return "";
    return arr.map((v: string) => (i18n.exists(`${prefijo}.${v}`) ? i18n.t(`${prefijo}.${v}`) : v)).join("; ");
  } catch {
    return "";
  }
}

export interface FilaInforme {
  miembro: Member;
  asistencia?: AsistenciaMiembro;
}

/** Exporta la tabla filtrada a CSV (con BOM para Excel), sin datos financieros. */
export async function exportarInformeCsv(filas: FilaInforme[]): Promise<boolean> {
  const t = i18n.t.bind(i18n);
  const rows = filas.map(({ miembro: m, asistencia: a }) => ({
    [t("usuarios.colNombre")]: m.nombre,
    [t("membresia.colEstado")]: t(`membresia.estado.${estadoEfectivo(m)}`),
    [t("ficha.fechaCongregacion")]: m.fecha_congregacion ?? "",
    [t("ficha.fechaIngreso")]: m.fecha_ingreso ?? "",
    [t("informes.colMinisterio")]: lista(m.ministerios, "ficha.ministerio"),
    [t("ficha.cargosLabel")]: lista(m.cargos, "ficha.cargo"),
    [t("informes.colInstrumento")]: lista(m.instrumentos, "ficha.instrumento"),
    [t("informes.colAsistencia")]: a && a.pct !== null ? `${a.pct}%` : "",
    [t("informes.colUltima")]: a?.ultimaAsistencia ?? "",
    [t("tesorero.correo")]: m.email ?? "",
    [t("tesorero.telefono")]: m.telefono ?? "",
  }));
  const csv = Papa.unparse(rows);
  const fecha = new Date().toISOString().slice(0, 10);
  const path = await save({
    defaultPath: `informe-membresia-${fecha}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return false;
  await writeFile(path, new TextEncoder().encode("﻿" + csv));
  return true;
}
