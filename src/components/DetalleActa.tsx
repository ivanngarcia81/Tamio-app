import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type Acta, type ActaAcuerdo, type ActaMocion, type Church } from "../db";
import { IconChevronLeft, IconEdit, IconPrinter, IconTrash } from "../icons";

interface Props {
  acta: Acta;
  church: Church;
  /** Título de la lista de la que se vino: el texto del botón de volver.
   *  Solo se pinta en el modo de empuje; en columnas lo esconde el CSS. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (acta: Acta) => void;
  onEliminar: (acta: Acta) => void;
  onImprimir: (acta: Acta) => void;
  imprimiendo: boolean;
}

const BADGE_ESTADO: Record<string, string> = {
  borrador: "baja",
  pendiente: "servicios",
  aprobada: "activo",
  corregida: "donacion",
  archivada: "administracion",
};

/** Un arreglo JSON de la base. Si trae basura, la sección se queda vacía en
 *  vez de tumbar el panel entero. */
function lista<T>(json: string | null): T[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * DetalleActa — la columna derecha del maestro-detalle de Actas.
 *
 * A diferencia de `DetalleMovimiento`, aquí el panel no es una ficha de
 * campos: es el **documento**. Es lo que dibuja el handoff y lo que tiene
 * sentido en un iPad — un acta se lee de arriba abajo, con su encabezado,
 * sus acuerdos y sus firmas, no como una tabla de etiqueta·valor. La ficha
 * sigue existiendo: es el formulario que abre "Editar".
 *
 * Todo lo que se pinta sale de la fila: `lugar`, las horas, `presentes` /
 * `ausentes` / `invitados`, `quorum`, `agenda`, `resumen`, `mociones`,
 * `acuerdos`, `preside` y `secretario`. Una sección sin dato NO se pinta —un
 * acta sin mociones no enseña un "Mociones" vacío.
 *
 * **Lo que el handoff pone aquí y no existe:** sus dos botones "Recopilar
 * firmas" y "Cerrar acta", que son pantallas suyas sin nada detrás en la app
 * (el estado del acta se cambia en el formulario), y una tercera línea de
 * firma para un "Testigo" que el modelo no guarda. Las acciones del panel son
 * las que esta pantalla ya tenía: imprimir, editar y eliminar.
 */
export default function DetalleActa({ acta, church, tituloLista, onVolver, onEditar, onEliminar, onImprimir, imprimiendo }: Props) {
  const { t } = useTranslation();

  const presentes = lista<string>(acta.presentes);
  const ausentes = lista<string>(acta.ausentes);
  const invitados = lista<string>(acta.invitados);
  const mociones = lista<ActaMocion>(acta.mociones);
  const acuerdos = lista<ActaAcuerdo>(acta.acuerdos);

  /* La línea de encabezado del documento: dónde, cuándo y a qué hora. Se
     arma con lo que haya —un acta sin lugar ni hora sigue teniendo fecha— en
     vez de pintar "—" en los huecos. */
  const encabezado = [
    acta.lugar,
    fmtFechaCorta(acta.fecha),
    [acta.hora_inicio, acta.hora_cierre].filter(Boolean).join("–") || null,
  ].filter(Boolean).join(" · ");

  const seccion = (titulo: string, cuerpo: React.ReactNode) => (
    <section className="da-seccion">
      <h3 className="da-seccion-titulo">{titulo}</h3>
      {cuerpo}
    </section>
  );

  return (
    <div className="dm da">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <div className="dm-chips">
          <span className={`tag ${BADGE_ESTADO[acta.estado] ?? "otros"}`}>{t(`actas.estado.${acta.estado}`)}</span>
          {acta.confidencial === 1 && <span className="tag baja">{t("actas.confidencial")}</span>}
        </div>
        <h2 className="da-titulo">{acta.titulo}</h2>
        <p className="dm-sub">
          {[acta.folio, t(`actas.tipo.${acta.tipo}`), fmtFechaCorta(acta.fecha)].filter(Boolean).join(" · ")}
        </p>
        <div className="dm-acciones">
          <button type="button" className="btn secondary" onClick={() => onImprimir(acta)} disabled={imprimiendo}>
            <IconPrinter size={14} strokeWidth={2} /> {imprimiendo ? t("common.preparando") : t("common.imprimir")}
          </button>
          <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(acta)}>
            <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(acta)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      {/* El documento. Papel blanco con su propio ritmo de lectura, no una
          tarjeta de datos: es lo que separa "ver un acta" de "ver una fila". */}
      <article className="da-doc">
        <header className="da-doc-cab">
          <div className="da-doc-iglesia">{church.nombre}{church.ciudad ? ` · ${church.ciudad}` : ""}</div>
          <div className="da-doc-folio">{acta.folio}</div>
          {encabezado && <div className="da-doc-linea">{encabezado}</div>}
        </header>

        {(presentes.length > 0 || ausentes.length > 0 || invitados.length > 0 || acta.quorum === 1) &&
          seccion(t("actas.secQuien"), (
            <div className="da-campos">
              {acta.preside && (
                <div className="da-campo"><span>{t("actas.preside")}</span><span>{acta.preside}</span></div>
              )}
              {acta.secretario && (
                <div className="da-campo"><span>{t("actas.secretarioRedacta")}</span><span>{acta.secretario}</span></div>
              )}
              {presentes.length > 0 && (
                <div className="da-campo"><span>{t("actas.presentes")}</span><span>{presentes.join(", ")}</span></div>
              )}
              {ausentes.length > 0 && (
                <div className="da-campo"><span>{t("actas.ausentes")}</span><span>{ausentes.join(", ")}</span></div>
              )}
              {invitados.length > 0 && (
                <div className="da-campo"><span>{t("actas.invitados")}</span><span>{invitados.join(", ")}</span></div>
              )}
              <div className="da-campo">
                <span>{t("actas.quorum")}</span>
                <span>{acta.quorum === 1 ? t("common.si") : t("common.no")}</span>
              </div>
            </div>
          ))}

        {acta.agenda && seccion(t("actas.agenda"), <p className="da-parrafo">{acta.agenda}</p>)}
        {acta.resumen && seccion(t("actas.resumen"), <p className="da-parrafo">{acta.resumen}</p>)}

        {mociones.length > 0 && seccion(t("actas.filaMociones"), (
          <ol className="da-numerada">
            {mociones.map((m, i) => (
              <li key={i}>
                <div className="da-item-texto">{m.texto}</div>
                <div className="da-item-pie">
                  {[
                    m.presenta ? t("actas.colPresenta") + ": " + m.presenta : null,
                    m.secunda ? t("actas.colSecunda") + ": " + m.secunda : null,
                    m.resultado || null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ol>
        ))}

        {acuerdos.length > 0 && seccion(t("actas.filaAcuerdos"), (
          <ol className="da-numerada">
            {acuerdos.map((a, i) => (
              <li key={i}>
                <div className="da-item-texto">{a.texto}</div>
                <div className="da-item-pie">
                  {[
                    a.responsable || null,
                    a.fecha_limite ? t("actas.colFechaLimite") + ": " + fmtFechaCorta(a.fecha_limite) : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </li>
            ))}
          </ol>
        ))}

        {/* Las firmas del documento. Dos rayas y no las tres del handoff: el
            acta guarda quién preside y quién es secretario, y nada más — un
            tercer renglón para un "Testigo" sería una raya que nadie firma. */}
        {(acta.preside || acta.secretario) && (
          <footer className="da-firmas">
            {acta.preside && (
              <div className="da-firma">
                <div className="da-firma-raya" />
                <div className="da-firma-nombre">{acta.preside}</div>
                <div className="da-firma-cargo">{t("actas.preside")}</div>
              </div>
            )}
            {acta.secretario && (
              <div className="da-firma">
                <div className="da-firma-raya" />
                <div className="da-firma-nombre">{acta.secretario}</div>
                <div className="da-firma-cargo">{t("actas.secretarioRedacta")}</div>
              </div>
            )}
          </footer>
        )}

        {acta.fecha_aprobacion && (
          <p className="da-aprobada">{t("actas.aprobadaEl", { fecha: fmtFechaCorta(acta.fecha_aprobacion) })}</p>
        )}
      </article>
    </div>
  );
}
