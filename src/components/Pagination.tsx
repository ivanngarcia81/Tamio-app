import { useTranslation } from "react-i18next";
import { IconChevronLeft, IconChevronRight } from "../icons";

interface Props {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Controles Anterior/Siguiente + "Página X de Y", reutilizados por las
 *  tablas que pueden crecer mucho (movimientos, miembros, bandeja). */
export default function Pagination({ page, totalPages, onPageChange }: Props) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <span
        className={`icon-btn${page <= 1 ? " disabled" : ""}`}
        title={t("paginacion.anterior")}
        onClick={() => page > 1 && onPageChange(page - 1)}
      >
        <IconChevronLeft size={16} />
      </span>
      <span className="pagination-label">{t("paginacion.pagina", { page, total: totalPages })}</span>
      <span
        className={`icon-btn${page >= totalPages ? " disabled" : ""}`}
        title={t("paginacion.siguiente")}
        onClick={() => page < totalPages && onPageChange(page + 1)}
      >
        <IconChevronRight size={16} />
      </span>
    </div>
  );
}
