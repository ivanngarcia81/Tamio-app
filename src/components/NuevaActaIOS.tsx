/**
 * NuevaActaIOS.tsx — el acta en el iPhone: hoja que sube desde abajo, cinco
 * secciones de lista agrupada y cada cosa larga en su propia pantalla.
 *
 * No tiene estado propio: todo sale de `useActa`, el mismo hook que alimenta
 * el modal de Mac, así que el `NewActa` que se escribe es idéntico —mismos
 * campos, mismas mociones, mismos acuerdos— y las tres validaciones son las
 * mismas, incluida la que exige presidió y redactó para pasar de borrador.
 *
 * Dos cosas que conviene saber antes de tocar esto:
 *
 * - **El error de validación se pinta al pie de SU sección**, no todo junto al
 *   final: por eso el hook expone `campoError` además del mensaje. Con seis
 *   secciones, un aviso al final no dice cuál de los treinta campos falta.
 * - **Las pantallas editan en vivo, sin copia ni "Listo".** Son pantallas
 *   empujadas dentro del mismo formulario; quien quiera descartar todo tiene
 *   "Cancelar" en la hoja, y hasta ahí no se ha escrito nada en la base.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import {
  ActionField, FilaNativa, IOSPantalla, IosChevron, Section, SwitchField, TextField,
} from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IOSFilaTexto } from "./ios/IOSPantallaTexto";
import { CARGOS, etiquetaCatalogo } from "./FichaMiembroModal";
import { IOSNombresSheet, type MiembroNombre } from "./ios/IOSBuscadorSheet";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { iaHabilitada } from "../ia";
import { parseNombres, type CampoActa, type useActa } from "./acta";
import { listMembers, type Acta, type Member } from "../db";

type Hoja = ReturnType<typeof useActa>;

/** Cuántos temas tiene la agenda. Es texto libre de una línea por tema —así lo
 *  dice su propio marcador de posición—, así que el conteo son las líneas con
 *  algo escrito. Solo se usa para pintar la fila; lo que se guarda es el texto. */
export function cuentaAgenda(agenda: string): number {
  return agenda.split("\n").filter((l) => l.trim()).length;
}

/** Fila de una lista: etiqueta a la izquierda y el número de elementos a la
 *  derecha, que es lo que permite que seis listas quepan en una pantalla. */
function FilaConteo({ label, conteo, vacio, onPress }: {
  label: string;
  conteo: number;
  /** Qué enseñar cuando no hay ninguno; sin esto un "0" gris parece un error. */
  vacio: string;
  onPress: () => void;
}) {
  return (
    <button type="button" className="ios-field ios-field--link" onClick={onPress}>
      <span className="ios-field-label">{label}</span>
      <span className="ios-field-value">{conteo > 0 ? conteo : vacio}</span>
      <IosChevron />
    </button>
  );
}

/* ============================================================
   Los bloques que viven en su propia pantalla
   ============================================================ */

export function BloqueHorario({ h }: { h: Hoja }) {
  const { t } = useTranslation();
  return (
    <Section footer={t("actas.horarioPie")}>
      <FilaNativa label={t("actas.horaInicio")} tipo="time" valor={h.horaInicio} onChange={h.setHoraInicio} />
      <FilaNativa label={t("actas.horaCierre")} tipo="time" valor={h.horaCierre} onChange={h.setHoraCierre} />
    </Section>
  );
}

export function BloqueMociones({ h }: { h: Hoja }) {
  const { t } = useTranslation();
  return (
    <>
      {h.mociones.map((m, i) => (
        <Section key={i} header={`${t("actas.filaMociones")} ${i + 1}`}>
          <TextField label={t("actas.mocionTexto")} value={m.texto} onChange={(v) => h.setMocion(i, { texto: v })} stacked />
          <TextField label={t("actas.colPresenta")} value={m.presenta} onChange={(v) => h.setMocion(i, { presenta: v })} />
          <TextField label={t("actas.colSecunda")} value={m.secunda} onChange={(v) => h.setMocion(i, { secunda: v })} />
          <TextField label={t("actas.colResultado")} value={m.resultado} onChange={(v) => h.setMocion(i, { resultado: v })} />
          <ActionField
            label={t("common.eliminar")}
            destructive
            onPress={() => h.setMociones((ms) => ms.filter((_, j) => j !== i))}
          />
        </Section>
      ))}
      <Section>
        <ActionField
          label={t("actas.agregarMocion")}
          onPress={() => h.setMociones((ms) => [...ms, { texto: "", presenta: "", secunda: "", resultado: "" }])}
        />
      </Section>
    </>
  );
}

export function BloqueAcuerdos({ h }: { h: Hoja }) {
  const { t } = useTranslation();
  return (
    <>
      {h.acuerdos.map((a, i) => (
        <Section key={i} header={`${t("actas.filaAcuerdos")} ${i + 1}`}>
          <TextField label={t("actas.acuerdoTexto")} value={a.texto} onChange={(v) => h.setAcuerdo(i, { texto: v })} stacked />
          <TextField label={t("actas.acuerdoResponsable")} value={a.responsable} onChange={(v) => h.setAcuerdo(i, { responsable: v })} />
          <FilaNativa
            label={t("actas.acuerdoFechaLimite")}
            tipo="date"
            valor={a.fecha_limite ?? ""}
            onChange={(v) => h.setAcuerdo(i, { fecha_limite: v || null })}
          />
          <ActionField
            label={t("common.eliminar")}
            destructive
            onPress={() => h.setAcuerdos((as) => as.filter((_, j) => j !== i))}
          />
        </Section>
      ))}
      <Section footer={t("actas.acuerdosPie")}>
        <ActionField
          label={t("actas.agregarAcuerdo")}
          onPress={() => h.setAcuerdos((as) => [...as, { texto: "", responsable: "", fecha_limite: null }])}
        />
      </Section>
    </>
  );
}

/** La hoja de la IA: los puntos en viñetas y el botón de generar. */
function HojaIA({ h, onCerrar }: { h: Hoja; onCerrar: () => void }) {
  const { t } = useTranslation();
  return (
    <IOSPantalla
      titulo={t("actas.ia.titulo")}
      volverA={t("common.cancelar")}
      onVolver={onCerrar}
      accion={
        <button type="button" className="ios-nav-action" onClick={h.generarActaIA} disabled={h.iaGenerando || !h.iaPuntos.trim()}>
          {h.iaGenerando ? t("cartas.ia.generando") : t("cartas.ia.generar")}
        </button>
      }
    >
      <Section
        footer={
          <>
            {t("actas.ia.sub")}
            {h.resumen.trim().length > 0 && <span>{t("actas.ia.reemplazar")}</span>}
            {h.iaError && <span className="ios-section-footer--error">{h.iaError}</span>}
          </>
        }
      >
        <label className="ios-field ios-field--stacked">
          <span className="ios-field-label">{t("actas.filaResumen")}</span>
          <textarea
            className="ios-texto-campo ios-ia-campo"
            value={h.iaPuntos}
            placeholder={t("actas.ia.placeholder")}
            disabled={h.iaGenerando}
            autoFocus
            onChange={(e) => h.setIaPuntos(e.target.value)}
          />
        </label>
      </Section>
    </IOSPantalla>
  );
}

/* ============================================================
   La hoja
   ============================================================ */

type Pantalla = "horario" | "mociones" | "acuerdos";
type Lista = "presentes" | "ausentes" | "invitados";

export default function NuevaActaIOS({
  churchId, acta, onClose, onImprimir, h, tipos, estados,
}: {
  churchId: number;
  acta: Acta | null;
  onClose: () => void;
  onImprimir?: () => void;
  h: Hoja;
  tipos: readonly string[];
  estados: readonly string[];
}) {
  const { t } = useTranslation();
  const titulo = acta ? acta.folio : t("actas.nuevaActa");
  const [pantalla, setPantalla] = useState<Pantalla | null>(null);
  const [lista, setLista] = useState<Lista | null>(null);

  /* El padrón, para poder marcar nombres en vez de teclearlos. Se pide aquí y
     no en el hook a propósito: Mac no lo necesita —allí los nombres siguen
     siendo fichas de texto libre— y no tiene por qué pagar la consulta. */
  const [miembros, setMiembros] = useState<Member[]>([]);
  useEffect(() => {
    let cancelado = false;
    listMembers(churchId)
      .then((ms) => { if (!cancelado) setMiembros(ms); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [churchId]);

  /* "Oficial" = quien tiene algún cargo en su ficha. Es el único criterio que
     existe en los datos, y es el mismo que usa el informe de membresía. */
  const nombres: MiembroNombre[] = useMemo(
    () => miembros.map((m) => {
      const cargos = parseNombres(m.cargos);
      return { nombre: m.nombre, cargo: cargos.map((c) => etiquetaCatalogo(t, "ficha.cargo", c, CARGOS)).join(" · ") || null };
    }),
    [miembros, t]
  );
  const oficiales = useMemo(
    () => miembros.filter((m) => parseNombres(m.cargos).length > 0).map((m) => m.nombre),
    [miembros]
  );

  const listas: Record<Lista, { titulo: string; valores: string[]; set: (v: string[]) => void }> = {
    presentes: { titulo: t("actas.presentes"), valores: h.presentes, set: h.setPresentes },
    ausentes: { titulo: t("actas.ausentes"), valores: h.ausentes, set: h.setAusentes },
    invitados: { titulo: t("actas.invitados"), valores: h.invitados, set: h.setInvitados },
  };

  // Con una pantalla abierta, Escape la cierra a ella y no la hoja entera:
  // salir del formulario desde dentro de una lista tiraría lo escrito en el
  // resto sin avisar.
  useEscapeClose(
    pantalla ? () => setPantalla(null)
      : lista ? () => setLista(null)
      : h.iaAbierta ? () => h.setIaAbierta(false)
      : onClose
  );

  /** El aviso de validación, al pie de la sección donde está el campo que falta. */
  const avisoDe = (...campos: CampoActa[]) =>
    h.error && h.campoError && campos.includes(h.campoError)
      ? <span className="ios-section-footer--error">{h.error}</span>
      : null;

  const horario = [h.horaInicio, h.horaCierre].filter(Boolean).join(" – ");

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose} disabled={h.saving}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={h.guardar} disabled={h.saving}>
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body">
            <Section header={t("actas.secReunion")} footer={avisoDe("titulo", "fecha")}>
              <IOSPickerField
                label={t("actas.filaTipo")}
                sheetTitle={t("actas.tipoReunion")}
                options={tipos.map((k) => ({ value: k, label: t(`actas.tipo.${k}`) }))}
                value={h.tipo}
                onSelect={h.setTipo}
              />
              <TextField
                label={t("actas.filaTitulo")}
                value={h.titulo}
                onChange={h.setTitulo}
                placeholder={t("actas.tituloPlaceholder")}
                stacked
                autoFocus={!acta}
              />
              <FilaNativa label={t("tx.colFecha")} tipo="date" valor={h.fecha} onChange={h.setFecha} />
              <TextField label={t("actas.filaLugar")} value={h.lugar} onChange={h.setLugar} optional />
              <button type="button" className="ios-field ios-field--link" onClick={() => setPantalla("horario")}>
                <span className="ios-field-label">{t("actas.filaHorario")}</span>
                <span className="ios-field-value">{horario || t("common.opcional")}</span>
                <IosChevron />
              </button>
            </Section>

            <Section header={t("actas.secQuien")} footer={avisoDe("preside", "secretario")}>
              <TextField label={t("actas.filaPreside")} value={h.preside} onChange={h.setPreside} />
              <TextField label={t("actas.filaRedacto")} value={h.secretario} onChange={h.setSecretario} />
              <FilaConteo label={t("actas.filaPresentes")} conteo={h.presentes.length} vacio={t("common.ninguno")} onPress={() => setLista("presentes")} />
              <FilaConteo label={t("actas.filaAusentes")} conteo={h.ausentes.length} vacio={t("common.ninguno")} onPress={() => setLista("ausentes")} />
              <FilaConteo label={t("actas.filaInvitados")} conteo={h.invitados.length} vacio={t("common.ninguno")} onPress={() => setLista("invitados")} />
              <SwitchField label={t("actas.filaQuorum")} checked={h.quorum} onChange={h.setQuorum} />
            </Section>

            <Section header={t("actas.secContenido")}>
              <IOSFilaTexto
                label={t("actas.filaAgenda")}
                title={t("actas.agenda")}
                valor={h.agenda}
                vacio={t("common.opcional")}
                resumen={cuentaAgenda(h.agenda) > 0 ? t("actas.agendaPuntos", { count: cuentaAgenda(h.agenda) }) : undefined}
                placeholder={t("actas.agendaPlaceholder")}
                multilinea
                onChange={h.setAgenda}
              />
              <IOSFilaTexto
                label={t("actas.filaResumen")}
                title={t("actas.resumen")}
                valor={h.resumen}
                vacio={t("actas.escribir")}
                placeholder={t("actas.resumenPlaceholder")}
                multilinea
                onChange={h.setResumen}
              />
              {iaHabilitada && (
                <ActionField label={t("actas.ia.boton")} onPress={() => { h.setIaError(null); h.setIaAbierta(true); }} />
              )}
            </Section>

            <Section header={t("actas.secMocionesAcuerdos")} footer={t("actas.acuerdosPie")}>
              <FilaConteo label={t("actas.filaMociones")} conteo={h.mociones.length} vacio={t("common.ninguno")} onPress={() => setPantalla("mociones")} />
              <FilaConteo label={t("actas.filaAcuerdos")} conteo={h.acuerdos.length} vacio={t("common.ninguno")} onPress={() => setPantalla("acuerdos")} />
            </Section>

            <Section
              header={t("actas.secAprobacion")}
              footer={<>{t("actas.aprobacionPie")}<span>{t("actas.notaFirmas")}</span></>}
            >
              <IOSPickerField
                label={t("actas.filaEstado")}
                sheetTitle={t("actas.estadoActa")}
                options={estados.map((k) => ({ value: k, label: t(`actas.estado.${k}`) }))}
                value={h.estado}
                onSelect={h.setEstado}
              />
              {h.muestraAprobacion && (
                <FilaNativa label={t("actas.fechaAprobacion")} tipo="date" valor={h.fechaAprobacion} onChange={h.setFechaAprobacion} />
              )}
              <SwitchField label={t("actas.filaConfidencial")} checked={h.confidencial} onChange={h.setConfidencial} />
            </Section>

            {/* Red de seguridad: si algún día una validación nueva no dijera de
                qué campo es, el aviso se seguiría viendo en vez de perderse. */}
            {h.error && !h.campoError && (
              <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.error}</p>
            )}

            {acta && onImprimir && (
              <Section>
                <ActionField label={t("common.imprimir")} onPress={onImprimir} />
              </Section>
            )}
          </div>
        </div>
      </div>

      {pantalla === "horario" && (
        <IOSPantalla titulo={t("actas.filaHorario")} volverA={titulo} onVolver={() => setPantalla(null)}>
          <BloqueHorario h={h} />
        </IOSPantalla>
      )}
      {pantalla === "mociones" && (
        <IOSPantalla titulo={t("actas.secMociones")} volverA={titulo} onVolver={() => setPantalla(null)}>
          <BloqueMociones h={h} />
        </IOSPantalla>
      )}
      {pantalla === "acuerdos" && (
        <IOSPantalla titulo={t("actas.secAcuerdos")} volverA={titulo} onVolver={() => setPantalla(null)}>
          <BloqueAcuerdos h={h} />
        </IOSPantalla>
      )}
      {lista && (
        <IOSNombresSheet
          title={listas[lista].titulo}
          valores={listas[lista].valores}
          miembros={nombres}
          /* El atajo solo en presentes: en ausentes y en invitados no
             significa nada. */
          oficiales={lista === "presentes" ? oficiales : []}
          onListo={(v) => { listas[lista].set(v); setLista(null); }}
          onCancel={() => setLista(null)}
        />
      )}
      {h.iaAbierta && <HojaIA h={h} onCerrar={() => h.setIaAbierta(false)} />}
    </Portal>
  );
}
