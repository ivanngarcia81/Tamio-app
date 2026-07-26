import { useTranslation } from "react-i18next";
import type { Role } from "../role";
import { esMovil } from "../movil";

interface Props {
  role: Role;
  onIniciarTour: () => void;
}

interface QA { p: string; d: string; }

function Seccion({ titulo, items }: { titulo: string; items: QA[] }) {
  return (
    <div className="card pad-lg">
      <div className="card-title-lg" style={{ marginBottom: 14 }}>{titulo}</div>
      <div className="ayuda-list">
        {items.map((it, i) => (
          <div className="ayuda-item" key={i}>
            <div className="ayuda-q">{it.p}</div>
            <div className="ayuda-a">{it.d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Página de Ayuda: guías escritas filtradas por rol + acceso al tutorial
 *  guiado. Es común a todos los roles (siempre visible en el sidebar). */
export default function Ayuda({ role, onIniciarTour }: Props) {
  const { t } = useTranslation();
  const esAdmin = role === "administrador";
  const verTes = esAdmin || role === "tesorero";
  const verSec = esAdmin || role === "secretaria";

  // En táctil no hay atajos de teclado, ni "menú de la izquierda", ni clic:
  // cuando existe una variante ...Movil de la respuesta, se usa esa. Las que
  // no la tienen (la mayoría) siguen sirviendo el mismo texto en todas
  // las plataformas, así que no hay que duplicar el catálogo entero.
  const bloque = (base: string, n: number): QA[] =>
    Array.from({ length: n }, (_, i) => {
      const clave = `${base}.d${i + 1}`;
      return {
        p: t(`${base}.p${i + 1}`),
        d: esMovil() ? t(`${clave}Movil`, { defaultValue: t(clave) }) : t(clave),
      };
    });

  return (
    <>
      <div className="header">
        <div>
          <div className="page-title">{t("ayuda.titulo")}</div>
          <div className="page-sub">{t("ayuda.sub")}</div>
        </div>
      </div>

      <div className="content">
        <div className="card pad-lg ayuda-hero">
          <div>
            <div className="card-title-lg">{t("ayuda.tourTitulo")}</div>
            <div className="card-title-sub">{t("ayuda.tourSub")}</div>
          </div>
          <button className="btn primary" onClick={onIniciarTour}>{t("ayuda.verTour")}</button>
        </div>

        <Seccion titulo={t("ayuda.basicoTitulo")} items={bloque("ayuda.basico", 3)} />
        {verTes && <Seccion titulo={t("ayuda.tesTitulo")} items={bloque("ayuda.tes", 4)} />}
        {verSec && <Seccion titulo={t("ayuda.secTitulo")} items={bloque("ayuda.sec", 4)} />}
      </div>
    </>
  );
}
