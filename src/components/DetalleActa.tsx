import { useTranslation } from "react-i18next";
import { fmtFechaCorta, type Acta, type Church } from "../db";
import { parseAcuerdos, parseMociones } from "./ActaModal";
import { IconChevronLeft, IconEdit, IconPrinter, IconTrash } from "../icons";

interface Props {
  church: Church;
  acta: Acta;
  /** Título de la lista ("Actas"): el texto del botón de volver del modo de
   *  empuje. En columnas el CSS lo esconde, igual que en movimientos. */
  tituloLista: string;
  onVolver: () => void;
  onEditar: (a: Acta) => void;
  onImprimir: (a: Acta) => void;
  onEliminar: (a: Acta) => void;
  imprimiendo: boolean;
}

const BADGE_ESTADO: Record<string, string> = {
  borrador: "baja",
  pendiente: "servicios",
  aprobada: "activo",
  corregida: "donacion",
  archivada: "administracion",
};

function nombres(json: string): string | null {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) && v.length > 0 ? v.join(", ") : null;
  } catch {
    return null;
  }
}

/**
 * DetalleActa — la columna derecha del maestro-detalle de Actas.
 *
 * El panel enseña el acta COMO DOCUMENTO: la misma hoja serif del diseño de
 * iPad, con las mismas secciones (y en el mismo orden) que el PDF de
 * `printActa.ts` — información básica, asistencia, agenda/resumen, mociones,
 * acuerdos y las líneas de firma. Solo pinta lo que el acta tiene: una sin
 * mociones no enseña un rótulo "Mociones" vacío.
 *
 * El diseño de referencia traía además "Recopilar firmas" y "Cerrar acta"
 * como flujos con hoja propia. No existen: el estado del acta se cambia
 * editándola (ActaModal) y las firmas son líneas del documento impreso, no
 * un registro digital. Se toma la estructura (lista de 358px + el documento
 * al lado), no los flujos inventados (docs/ipad-rediseno.md §4).
 */
export default function DetalleActa({ church, acta, tituloLista, onVolver, onEditar, onImprimir, onEliminar, imprimiendo }: Props) {
  const { t } = useTranslation();
  const mociones = parseMociones(acta.mociones);
  const acuerdos = parseAcuerdos(acta.acuerdos);
  const presentes = nombres(acta.presentes);
  const ausentes = nombres(acta.ausentes);
  const invitados = nombres(acta.invitados);

  const dato = (etiqueta: string, valor: string | null | undefined) =>
    valor ? (
      <div className="papel-dato">
        <span className="papel-dato-k">{etiqueta}</span>
        <span className="papel-dato-v">{valor}</span>
      </div>
    ) : null;

  return (
    <div className="dm dm-doc">
      <button type="button" className="dm-volver" onClick={onVolver}>
        <IconChevronLeft size={17} strokeWidth={2.4} /> {tituloLista}
      </button>

      <div className="dm-cab">
        <div className="dm-chips">
          <span className={`tag ${BADGE_ESTADO[acta.estado] ?? "otros"}`}>{t(`actas.estado.${acta.estado}`)}</span>
          {acta.confidencial === 1 && <span className="tag pastores">{t("actas.confidencial")}</span>}
        </div>
        <h2 className="dm-doc-titulo">{acta.titulo}</h2>
        <p className="dm-sub">
          {[acta.folio, fmtFechaCorta(acta.fecha), t(`actas.tipo.${acta.tipo}`)].join(" · ")}
        </p>
        <div className="dm-acciones">
          <button type="button" className="btn secondary dm-eliminar" onClick={() => onEliminar(acta)}>
            <IconTrash size={14} strokeWidth={2} /> {t("common.eliminar")}
          </button>
          <button type="button" className="btn secondary" onClick={() => onImprimir(acta)} disabled={imprimiendo}>
            <IconPrinter size={14} /> {imprimiendo ? t("common.preparando") : t("common.imprimir")}
          </button>
          <button type="button" className="btn primary" onClick={() => onEditar(acta)}>
            <IconEdit size={14} strokeWidth={2} /> {t("common.editar")}
          </button>
        </div>
      </div>

      <div className="papel">
        <div className="papel-cabecera">
          <div className="papel-titulo">{acta.titulo}</div>
          <div className="papel-sub">
            {church.nombre}{church.ciudad ? ` · ${church.ciudad}` : ""} · {acta.folio}
          </div>
        </div>

        <div className="papel-datos">
          {dato(t("actas.tipoReunion"), t(`actas.tipo.${acta.tipo}`))}
          {dato(t("tx.colFecha"), fmtFechaCorta(acta.fecha))}
          {dato(t("actas.horaInicio"), acta.hora_inicio)}
          {dato(t("actas.horaCierre"), acta.hora_cierre)}
          {dato(t("actas.lugar"), acta.lugar)}
          {dato(t("actas.preside"), acta.preside)}
          {dato(t("actas.secretarioRedacta"), acta.secretario)}
          {dato(t("actas.quorum"), acta.quorum === 1 ? t("common.si") : t("common.no"))}
        </div>

        {(presentes || ausentes || invitados) && (
          <>
            <div className="papel-rotulo">{t("actas.secAsistencia")}</div>
            <div className="papel-datos una-col">
              {dato(t("actas.presentes"), presentes)}
              {dato(t("actas.ausentes"), ausentes)}
              {dato(t("actas.invitados"), invitados)}
            </div>
          </>
        )}

        {acta.agenda && (
          <>
            <div className="papel-rotulo">{t("actas.agenda")}</div>
            <p className="papel-parrafo">{acta.agenda}</p>
          </>
        )}
        {acta.resumen && (
          <>
            <div className="papel-rotulo">{t("actas.resumen")}</div>
            <p className="papel-parrafo">{acta.resumen}</p>
          </>
        )}

        {mociones.length > 0 && (
          <>
            <div className="papel-rotulo">{t("actas.secMociones")}</div>
            <ol className="papel-lista">
              {mociones.map((m, i) => (
                <li key={i}>
                  {m.texto}
                  {(m.presenta || m.secunda || m.resultado) && (
                    <span className="papel-lista-meta">
                      {[
                        m.presenta ? `${t("actas.colPresenta")}: ${m.presenta}` : null,
                        m.secunda ? `${t("actas.colSecunda")}: ${m.secunda}` : null,
                        m.resultado ? `${t("actas.colResultado")}: ${m.resultado}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {acuerdos.length > 0 && (
          <>
            <div className="papel-rotulo">{t("actas.secAcuerdos")}</div>
            <ol className="papel-lista">
              {acuerdos.map((a, i) => (
                <li key={i}>
                  {a.texto}
                  {(a.responsable || a.fecha_limite) && (
                    <span className="papel-lista-meta">
                      {[
                        a.responsable ? `${t("actas.acuerdoResponsable")}: ${a.responsable}` : null,
                        a.fecha_limite ? `${t("actas.colFechaLimite")}: ${fmtFechaCorta(a.fecha_limite)}` : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </>
        )}

        {acta.fecha_aprobacion && (
          <div className="papel-datos" style={{ marginTop: 16 }}>
            {dato(t("actas.fechaAprobacion"), fmtFechaCorta(acta.fecha_aprobacion))}
          </div>
        )}

        <div className="papel-firmas">
          <div className="papel-firma">
            <div className="papel-firma-linea" />
            <div className="papel-firma-nombre">{acta.secretario ?? ""}</div>
            <div className="papel-firma-rol">{t("actas.rolSecretario")}</div>
          </div>
          <div className="papel-firma">
            <div className="papel-firma-linea" />
            <div className="papel-firma-nombre">{acta.preside ?? church.pastor_nombre ?? ""}</div>
            <div className="papel-firma-rol">{acta.preside ? t("actas.rolPreside") : church.pastor_cargo ?? t("rol.pastor")}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
