import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Church, Member } from "../db";
import { CuerpoFichaMiembro, IdentidadMiembro, useFichaMiembro } from "./MemberDetailModal";
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
 * Es la MISMA ficha que el modal de Mac/iPhone —identidad, tarjetas del año,
 * tabla de aportes, constancia— montada en el panel en vez de en un modal:
 * el estado vive en `useFichaMiembro` y las piezas en MemberDetailModal.tsx,
 * así que no hay una segunda ficha que mantener. Lo único propio de aquí son
 * los botones (Editar y Eliminar acompañan a Imprimir/Constancia, porque en
 * el panel no hay fila de tabla con lápiz al lado) y el botón de volver.
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

      <div>
        <CuerpoFichaMiembro church={church} f={f} />
      </div>
    </div>
  );
}
