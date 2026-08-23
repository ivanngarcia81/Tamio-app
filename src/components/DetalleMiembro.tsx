import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Church, Member } from "../db";
import { IdentidadMiembro, useFichaMiembro } from "./MemberDetailModal";
import FichaMiembroIPad from "./FichaMiembroIPad";
import { IconChevronLeft, IconEdit, IconFileText, IconPrinter, IconTrash } from "../icons";

interface Props {
  church: Church;
  member: Member;
  /** Título de la lista ("Aportantes"): el texto del botón de volver del modo
   *  de empuje. En columnas el CSS lo esconde, igual que en movimientos. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (m: Member) => void;
  onEliminar: (m: Member) => void;
  /** Sustituye Editar/Eliminar por otras. En la Bandeja el miembro está
   *  archivado y la única acción que tiene sentido es "Restaurar"; imprimir
   *  la constancia se queda, que es del cuerpo de la ficha. */
  acciones?: ReactNode;
}

/**
 * DetalleMiembro — la columna derecha del maestro-detalle de Aportantes.
 *
 * Comparte el ESTADO con el modal de Mac/iPhone —`useFichaMiembro` carga los
 * años, el año elegido y los aportes— pero desde el handoff 2 el CUERPO es
 * propio: el diseño pide un segmentado de cuatro pestañas con el expediente a
 * la izquierda y el dinero fijo a la derecha, y eso no es lo que hace un modal
 * de 640px en el Mac. La carga sigue siendo una sola, así que no hay dos
 * fichas que mantener: hay una fuente de datos y dos maneras de enseñarla.
 * Ver `FichaMiembroIPad`.
 */
export default function DetalleMiembro({ church, member, tituloLista, onVolver, onEditar, onEliminar, acciones }: Props) {
  const { t } = useTranslation();
  const f = useFichaMiembro(church, member);

  return (
    <div className="dm">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <IdentidadMiembro member={member} />
        <div className="dm-acciones">
          {acciones ?? (
            <>
              <button type="button" className="btn secondary" onClick={() => onEditar(member)}>
                <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
              </button>
              <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(member)}>
                <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
              </button>
            </>
          )}
          <button type="button" className="btn secondary" onClick={f.handlePrint} disabled={f.exporting !== null || f.aportes.length === 0}>
            <IconPrinter size={14} /> {f.exporting === "print" ? t("common.preparando") : t("common.imprimir")}
          </button>
          <button type="button" className="btn primary" onClick={f.handleConstancia} disabled={f.exporting !== null || f.aportes.length === 0}>
            <IconFileText size={13} /> {f.exporting === "pdf" ? t("common.generando") : t("detalleMiembro.constanciaPdf")}
          </button>
        </div>
      </div>

      <FichaMiembroIPad
        church={church}
        member={member}
        aportes={f.aportes}
        total={f.total}
        year={f.year}
        years={f.years}
        onYear={f.setYear}
      />
      {f.error && (
        <div className="form-warning" style={{ marginTop: 12 }}>{f.error}</div>
      )}
    </div>
  );
}
