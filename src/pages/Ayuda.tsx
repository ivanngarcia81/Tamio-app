import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Role } from "../role";
import { esIPhone, esMovil, esMac } from "../movil";
import { IosChevron } from "../components/ios/FormularioIOS";

interface Props {
  role: Role;
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

/** Mismo bloque en el teléfono: lista agrupada de iOS con las preguntas
 *  plegadas. Con once preguntas abiertas de par en par la página medía casi
 *  1700 px de alto y las respuestas —tres o cuatro líneas cada una— tapaban
 *  el índice; plegadas caben todas de una vez, que es para lo que se mira
 *  una lista de preguntas frecuentes. */
function SeccionIOS({
  titulo, items, base, abierta, onAbrir,
}: {
  titulo: string;
  items: QA[];
  base: string;
  abierta: string | null;
  onAbrir: (id: string | null) => void;
}) {
  return (
    <section className="ios-section">
      <h2 className="ios-section-header">{titulo}</h2>
      <div className="ios-group">
        {items.map((it, i) => {
          const id = `${base}.${i}`;
          const abierto = abierta === id;
          return (
            <div className={`ayuda-ios-item${abierto ? " abierto" : ""}`} key={i}>
              <button
                type="button"
                className="ayuda-ios-p"
                aria-expanded={abierto}
                aria-controls={`ayuda-r-${base}-${i}`}
                onClick={() => onAbrir(abierto ? null : id)}
              >
                <span className="ayuda-ios-pregunta">{it.p}</span>
                <IosChevron />
              </button>
              {abierto && (
                <div className="ayuda-ios-d" id={`ayuda-r-${base}-${i}`}>{it.d}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Página de Ayuda: guías escritas filtradas por rol. Es común a todos los
 *  roles (siempre visible en el sidebar; en el teléfono se llega desde
 *  Ajustes → Cuenta → Ayuda). */
export default function Ayuda({ role }: Props) {
  const { t } = useTranslation();
  const enIPhone = esIPhone();
  const esAdmin = role === "administrador";
  const verTes = esAdmin || role === "tesorero";
  const verSec = esAdmin || role === "secretaria";
  // Una respuesta abierta a la vez, como los desplegables de iOS.
  const [abierta, setAbierta] = useState<string | null>(null);

  // En táctil no hay atajos de teclado ni clic, y en el TELÉFONO tampoco hay
  // "menú de la izquierda" ni botón ☰ —el sidebar no existe ahí, lo
  // sustituyen la barra de pestañas y el carrusel de secciones—, así que una
  // respuesta puede tener hasta tres versiones: ...Iphone, ...Movil (iPad) y
  // la de escritorio. Se usa la más específica que exista; las que no tienen
  // variante (la mayoría) sirven el mismo texto en todas las plataformas.
  const respuesta = (clave: string): string => {
    const enEscritorio = t(clave);
    const enTactil = esMovil() ? t(`${clave}Movil`, { defaultValue: enEscritorio }) : enEscritorio;
    return enIPhone ? t(`${clave}Iphone`, { defaultValue: enTactil }) : enTactil;
  };

  const bloque = (base: string, n: number): QA[] =>
    Array.from({ length: n }, (_, i) => ({
      p: t(`${base}.p${i + 1}`),
      d: respuesta(`${base}.d${i + 1}`),
    }));

  const secciones = [
    { base: "ayuda.basico", titulo: t("ayuda.basicoTitulo"), n: 3, visible: true },
    { base: "ayuda.tes", titulo: t("ayuda.tesTitulo"), n: 4, visible: verTes },
    { base: "ayuda.sec", titulo: t("ayuda.secTitulo"), n: 4, visible: verSec },
  ].filter((s) => s.visible);

  return (
    <>
      <div className="header" data-tauri-drag-region={esMac() || undefined}>
        <div>
          <div className="page-title">{t("ayuda.titulo")}</div>
          {!esMac() && <div className="page-sub">{t("ayuda.sub")}</div>}
        </div>
      </div>

      <div className="content">
        {enIPhone
          ? secciones.map((s) => (
              <SeccionIOS
                key={s.base}
                base={s.base}
                titulo={s.titulo}
                items={bloque(s.base, s.n)}
                abierta={abierta}
                onAbrir={setAbierta}
              />
            ))
          : secciones.map((s) => (
              <Seccion key={s.base} titulo={s.titulo} items={bloque(s.base, s.n)} />
            ))}
      </div>
    </>
  );
}
