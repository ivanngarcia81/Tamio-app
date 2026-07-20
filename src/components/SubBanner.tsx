import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Church } from "../db";
import { evaluarVigencia, urlCompra } from "../plan";
import { IconWarn } from "../icons";

/** Aviso de vigencia de la suscripción. No bloquea; solo informa cuando está
 *  por vencer, en gracia o vencida. En cortesía o sin fecha no muestra nada,
 *  así que la cuenta del dueño (cortesía) nunca lo ve. */
export default function SubBanner({ church }: { church: Church }) {
  const { t } = useTranslation();
  const compra = urlCompra;
  if (church.sub_estado === "cortesia") return null;

  const vig = evaluarVigencia(church.sub_estado, church.sub_vence);
  const dias = vig.diasRestantes;
  const porVencer = dias !== null && dias >= 0 && dias <= 7;
  if (!vig.vencida && !vig.enGracia && !porVencer) return null;

  const texto = vig.vencida
    ? t("plan.bannerVencida")
    : vig.enGracia
      ? t("plan.bannerGracia", { dias: vig.diasGracia ?? 0 })
      : t("plan.bannerPorVencer", { dias: dias ?? 0 });

  return (
    <div className={`sub-banner${vig.vencida ? " grave" : ""}`} role="status">
      <IconWarn size={15} />
      <span>{texto}</span>
      {compra && (
        <button
          type="button"
          className="sub-banner-btn"
          onClick={() => { void openUrl(compra).catch(console.error); }}
        >
          {t("plan.renovar")}
        </button>
      )}
    </div>
  );
}
