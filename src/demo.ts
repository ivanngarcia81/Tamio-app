// Datos de ejemplo para explorar Tamio "lleno" en el primer arranque.
// Solo se ofrecen en modo local (sin login): así nada de esto viaja a la
// nube. Se eliminan desde Ajustes → Zona delicada → borrar datos.

import { insertMember, insertTx, listMembers, type NewTx } from "./db";
import { deDecimalHeredado as dinero } from "./dinero";

const MIEMBROS = [
  { nombre: "Ana Martínez", telefono: "555 123 4567", etiquetas: ["diezmador"] },
  { nombre: "Juan Pérez", telefono: "555 234 5678", etiquetas: ["diezmador"] },
  { nombre: "María López", telefono: "555 345 6789", etiquetas: ["diezmador"] },
  { nombre: "Pedro Ramírez", telefono: "555 456 7890", etiquetas: [] },
  { nombre: "Carmen Torres", telefono: "555 567 8901", etiquetas: ["diezmador"] },
  { nombre: "Luis Hernández", telefono: "555 678 9012", etiquetas: [] },
  { nombre: "Rosa Sánchez", telefono: "555 789 0123", etiquetas: ["diezmador"] },
  { nombre: "Miguel Flores", telefono: "555 890 1234", etiquetas: [] },
];

/** Fecha ISO (YYYY-MM-DD) de hace `dias` días. */
function hace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Siembra una iglesia de ejemplo: 8 miembros y ~3 meses de movimientos.
 *  Determinista (sin azar): los reportes siempre lucen coherentes. */
export async function cargarDatosDemo(churchId: number, moneda: string): Promise<void> {
  for (const m of MIEMBROS) {
    await insertMember(churchId, {
      nombre: m.nombre,
      telefono: m.telefono,
      etiquetas: m.etiquetas,
      fecha_ingreso: hace(400),
      notas: "demo",
    });
  }
  const miembros = await listMembers(churchId);
  const idDe = (nombre: string) => miembros.find((x) => x.nombre === nombre)?.id ?? null;

  const txs: NewTx[] = [];
  // Tres meses: domingos de diezmos/ofrendas + gastos fijos del mes.
  for (const mesAtras of [0, 1, 2]) {
    const base = mesAtras * 30;
    for (const semana of [0, 1, 2, 3]) {
      const fecha = hace(base + semana * 7 + 2);
      txs.push(
        { tipo: "ingreso", categoria: "diezmo", concepto: "Diezmo", fecha, monto: dinero(250), metodo_pago: "efectivo", member_id: idDe("Ana Martínez"), estado: "aprobado" },
        { tipo: "ingreso", categoria: "diezmo", concepto: "Diezmo", fecha, monto: dinero(300), metodo_pago: "transferencia", member_id: idDe("Juan Pérez"), estado: "aprobado" },
        { tipo: "ingreso", categoria: "diezmo", concepto: "Diezmo", fecha, monto: dinero(180), metodo_pago: "efectivo", member_id: idDe("Carmen Torres"), estado: "aprobado" },
        { tipo: "ingreso", categoria: "ofrenda", concepto: "Ofrenda del culto dominical", fecha, monto: dinero(420), metodo_pago: "efectivo", estado: "aprobado" },
      );
    }
    txs.push(
      { tipo: "ingreso", categoria: "donacion", concepto: "Donación para el ministerio de jóvenes", fecha: hace(base + 12), monto: dinero(500), metodo_pago: "transferencia", member_id: idDe("Rosa Sánchez"), estado: "aprobado" },
      { tipo: "gasto", categoria: "pastores", concepto: "Compensación pastoral", fecha: hace(base + 3), monto: dinero(1200), metodo_pago: "transferencia", beneficiario: "Pr. Roberto Díaz", estado: "aprobado" },
      { tipo: "gasto", categoria: "servicios", concepto: "Luz y agua del templo", fecha: hace(base + 8), monto: dinero(310), metodo_pago: "transferencia", beneficiario: "CFE / Agua municipal", estado: "aprobado" },
      { tipo: "gasto", categoria: "mantenimiento", concepto: "Limpieza y jardinería", fecha: hace(base + 15), monto: dinero(220), metodo_pago: "efectivo", beneficiario: "Servicios García", estado: "aprobado" },
      { tipo: "gasto", categoria: "musicos", concepto: "Cuerdas y accesorios de alabanza", fecha: hace(base + 20), monto: dinero(145), metodo_pago: "tarjeta", beneficiario: "Casa de Música", estado: "aprobado" },
    );
  }
  for (const tx of txs) await insertTx(churchId, moneda, tx);
}
