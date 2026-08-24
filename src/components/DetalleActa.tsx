import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fmtFechaCorta, guardarFirmasActa, parseFirmasActa,
  type Acta, type ActaAcuerdo, type ActaFirma, type ActaMocion, type Church,
} from "../db";
import RecopilarFirmasIOS from "./RecopilarFirmasIOS";
import { showToast } from "../toast";
import { playSound } from "../sound";
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
  /** "Cerrar acta" del handoff. Solo se pasa cuando el acta puede cerrarse;
   *  una ya aprobada no vuelve a cerrarse. */
  onCerrar?: (acta: Acta) => void;
  /** Recargar la lista tras recoger firmas: el acta cambia bajo el panel. */
  onCambiado: () => void;
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
 * **La barra del handoff, con sus dos botones, y los dos tienen motor.**
 * "Cerrar acta" lo tuvo desde el principio: el estado `aprobada` y
 * `fecha_aprobacion` estaban en la tabla, y lo que faltaba era poder
 * cambiarlos sin reabrir el formulario entero (`cerrarActa` en db.ts).
 * "Recopilar firmas" lo tiene desde la migración 44 (`actas.firmas`), que es
 * el mismo molde que las cartas usaban desde hacía versiones.
 *
 * Lo que recoge es una **constancia, no una firma digital**: se marca que
 * fulano firmó el papel y en qué fecha. Quien firma un acta de asamblea lo
 * hace con un bolígrafo delante de la mesa; pedirle que entre en la app a
 * confirmarlo convertiría un trámite de un minuto en uno de tres días. Es la
 * misma elección que Iván hizo en los cortes.
 *
 * El TERCER renglón de firma ("Testigo") tiene columna desde la migración
 * 41; sin nombre se sigue imprimiendo en blanco, para firmarlo a mano. Ver
 * §20.
 */
export default function DetalleActa({ acta, church, tituloLista, onVolver, onEditar, onEliminar, onImprimir, imprimiendo, onCerrar, onCambiado }: Props) {
  const { t } = useTranslation();
  const [firmasAbierto, setFirmasAbierto] = useState(false);

  /* Se leen de la fila en cada render y no en un estado propio: el panel
     re-busca el acta por id en cada recarga (patrón de `Movimientos.tsx`),
     así que una copia local se quedaría atrás en cuanto se guardara. */
  const firmas = parseFirmasActa(acta.firmas);
  const firmaDe = (rol: string) => firmas.find((f) => f.rol === rol && f.firmado) ?? null;
  const cuantasFirmas = firmas.filter((f) => f.firmado).length;
  /** Los renglones que el acta puede recoger: los que tienen nombre. */
  const firmantes = [acta.preside, acta.secretario, acta.testigo].filter(Boolean).length;

  /** El pie del renglón de firma: "Firmó el 24 ago". Solo cuando la hay —
   *  una raya sin pie es un renglón por firmar, que es lo que era antes y
   *  sigue siendo verdad. */
  const pieFirma = (rol: string) => {
    const f = firmaDe(rol);
    if (!f) return null;
    return (
      <div className="da-firma-fecha">
        {f.fecha ? t("actas.firmoEl", { fecha: fmtFechaCorta(f.fecha) }) : t("cartas.firmado")}
      </div>
    );
  };

  async function guardarFirmas(v: ActaFirma[]) {
    try {
      await guardarFirmasActa(acta.id, acta.church_id, v);
      playSound("guardado");
      onCambiado();
    } catch (e) {
      showToast(t("common.noSePudoGuardar", { error: String(e) }));
    }
    setFirmasAbierto(false);
  }

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

      {/* La barra del handoff: en qué estado está el acta y las dos acciones
          que la mueven de estado, pegadas al documento. Imprimir, editar y
          eliminar se quedan abajo con la ficha: son de la hoja, no del
          trámite. */}
      <div className="ac-barra">
        <span className={`tag ${BADGE_ESTADO[acta.estado] ?? "otros"}`}>{t(`actas.estado.${acta.estado}`)}</span>
        {acta.fecha_aprobacion && (
          <span className="ac-barra-nota">{t("actas.aprobadaEl", { fecha: fmtFechaCorta(acta.fecha_aprobacion) })}</span>
        )}
        <div className="ac-barra-hueco" />
        {/* "Recopilar firmas", con motor desde la migración 44. Se apaga en
            un solo caso, y no por falta de columna: cuando el acta no tiene
            ni un firmante con nombre. No se recoge la firma de alguien que
            todavía no es nadie — y el `title` dice dónde se escriben. */}
        <button
          type="button"
          className="chip"
          onClick={() => setFirmasAbierto(true)}
          disabled={firmantes === 0}
          title={firmantes === 0 ? t("actas.firmasSinFirmantes") : undefined}
        >
          {cuantasFirmas > 0
            ? t("actas.firmasRecogidas", { n: cuantasFirmas, total: firmantes })
            : t("actas.recopilarFirmas")}
        </button>
        {onCerrar && (
          <button type="button" className="chip chip-mes" onClick={() => onCerrar(acta)}>
            {t("actas.cerrarActa")}
          </button>
        )}
      </div>

      <div className="dm-cab">
        <div className="dm-chips">
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

        {/* Las tres rayas del handoff. Las dos primeras se llenan con quien
            preside y quien redacta; la de "Testigo" se dibuja vacía porque el
            acta todavía no guarda ese nombre — un acta impresa lleva tres
            firmas y la hoja tiene que tener dónde ponerlas. */}
        {(acta.preside || acta.secretario) && (
          <footer className="da-firmas">
            {acta.preside && (
              <div className="da-firma">
                <div className="da-firma-raya" />
                <div className="da-firma-nombre">{acta.preside}</div>
                <div className="da-firma-cargo">{t("actas.preside")}</div>
                {pieFirma("preside")}
              </div>
            )}
            {acta.secretario && (
              <div className="da-firma">
                <div className="da-firma-raya" />
                <div className="da-firma-nombre">{acta.secretario}</div>
                <div className="da-firma-cargo">{t("actas.secretarioRedacta")}</div>
                {pieFirma("secretario")}
              </div>
            )}
            {/* El testigo. Con motor desde la migración 41: si el acta lo
                trae, se firma con su nombre como las otras dos; si no, el
                renglón sigue saliendo en blanco para firmarlo a mano, que es
                como se usaba antes de que la columna existiera. Por eso no
                desaparece cuando está vacío: en un acta, un renglón de firma
                sin nombre sigue sirviendo. */}
            <div className={`da-firma${acta.testigo ? "" : " da-firma--enblanco"}`}>
              <div className="da-firma-raya" />
              <div className="da-firma-nombre">{acta.testigo || "\u00a0"}</div>
              <div className="da-firma-cargo">{t("actas.testigo")}</div>
              {pieFirma("testigo")}
            </div>
          </footer>
        )}

        {acta.fecha_aprobacion && (
          <p className="da-aprobada">{t("actas.aprobadaEl", { fecha: fmtFechaCorta(acta.fecha_aprobacion) })}</p>
        )}
      </article>
      {firmasAbierto && (
        <RecopilarFirmasIOS
          acta={acta}
          firmas={firmas}
          onGuardar={(v) => void guardarFirmas(v)}
          onClose={() => setFirmasAbierto(false)}
        />
      )}
    </div>
  );
}
