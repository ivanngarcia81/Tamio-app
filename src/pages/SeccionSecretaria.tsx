import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../components/TxList";
import { IconClipboardList, IconFileText, IconIdBadge, IconMail } from "../icons";

export type SeccionId = "membresia" | "actas" | "cartas" | "reporteMiembros";

const ICONOS: Record<SeccionId, ReactNode> = {
  membresia: <IconIdBadge size={22} strokeWidth={1.6} />,
  actas: <IconFileText size={22} strokeWidth={1.6} />,
  cartas: <IconMail size={22} strokeWidth={1.6} />,
  reporteMiembros: <IconClipboardList size={22} strokeWidth={1.6} />,
};

/** Página provisional de las secciones de Secretaría: presenta qué hará
 *  cada sección mientras se construye, con el mismo encabezado y tarjetas
 *  que el resto de la app. Se irá reemplazando sección por sección. */
export default function SeccionSecretaria({ seccion }: { seccion: SeccionId }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t(`secretaria.${seccion}.titulo`)}</div>
          <div className="page-sub">{t(`secretaria.${seccion}.sub`)}</div>
        </div>
      </div>

      <div className="content">
        <div className="card enter">
          <EmptyState
            icon={ICONOS[seccion]}
            titulo={t("secretaria.enDesarrolloTitulo")}
            sub={t(`secretaria.${seccion}.desc`)}
          />
        </div>
      </div>
    </>
  );
}
