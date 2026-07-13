import type { NewMember } from "../db";
import type { CsvField } from "./csvImport";

export const MIEMBROS_FIELDS: CsvField[] = [
  { key: "nombre", label: "Nombre completo", required: true, aliases: ["nombre", "name", "nombre completo", "full_name"] },
  { key: "email", label: "Correo electrónico", required: false, aliases: ["email", "correo", "correo electronico", "correo electrónico", "e-mail"] },
  { key: "telefono", label: "Teléfono", required: false, aliases: ["telefono", "teléfono", "phone", "celular", "tel"] },
  { key: "rfc", label: "RFC", required: false, aliases: ["rfc"] },
  { key: "notas", label: "Notas", required: false, aliases: ["notas", "notes", "observaciones", "comentarios"] },
];

export const MIEMBROS_CSV_TEMPLATE =
  "nombre,email,telefono,rfc,notas\n" +
  "Juan Pérez,juan@ejemplo.com,555-0000,,\n" +
  "Ana Ruiz,,555-1111,,Diezmadora desde 2020\n";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,20}$/;

export function validarFilaMiembro(row: Record<string, string>): { data?: NewMember; error?: string } {
  const nombre = (row.nombre ?? "").trim();
  if (!nombre) {
    return { error: "El nombre es obligatorio." };
  }

  const email = (row.email ?? "").trim();
  if (email && !EMAIL_RE.test(email)) {
    return { error: `Correo con formato inválido: "${email}".` };
  }

  const telefono = (row.telefono ?? "").trim();
  if (telefono && !PHONE_RE.test(telefono)) {
    return { error: `Teléfono con formato inválido: "${telefono}".` };
  }

  return {
    data: {
      nombre,
      email: email || null,
      telefono: telefono || null,
      rfc: (row.rfc ?? "").trim() || null,
      notas: (row.notas ?? "").trim() || null,
    },
  };
}
