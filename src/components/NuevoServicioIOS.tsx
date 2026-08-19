/**
 * NuevoServicioIOS.tsx — el culto en el iPhone: hoja con lista agrupada,
 * Cancelar y Guardar en la barra, y el padrón fuera del formulario.
 *
 * No tiene estado propio: todo sale de `useServicio`, el mismo hook que
 * alimenta el modal de Mac, así que el `NewServicio` que se escribe es
 * idéntico —mismos campos, mismos `null`— y las confirmaciones son las mismas.
 *
 * Tres cosas que se conservan tal cual y conviene no tocar sin leerlas:
 *
 * - **El culto vacío se confirma, no se bloquea.** Sin nadie marcado y con el
 *   conteo en cero, la app no puede distinguir "no vino nadie" de "no se tomó
 *   la asistencia" — pero un culto legítimamente vacío existe, así que se
 *   pregunta y se deja guardar.
 * - **"Desmarcar a todos" sigue pidiendo confirmación**, aunque ahora sea una
 *   fila de acción y no un botón.
 * - **`anotarAusencias` nace en `true` solo al editar.** Al crear, todos
 *   arrancan ausentes y los motivos serían quince controles estorbando justo
 *   cuando la tarea es marcar presentes rápido.
 *
 * El diseño de referencia dibujaba además dos interruptores —"Hubo quórum" y
 * "Confidencial"— que en este formulario NO EXISTEN: son campos del acta. No
 * se añaden; el registro guardado tiene que ser el mismo de antes. Por eso en
 * el teléfono esta pantalla no tiene ni un interruptor.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import {
  ActionField, FilaNativa, IOSPantalla, IosChevron, Section, SwitchField, TextField,
} from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IOSFilaTexto, IOSPantallaTexto } from "./ios/IOSPantallaTexto";
import ConfirmDialog from "./ConfirmDialog";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { RAZONES_AUSENCIA, VISITANTE_VACIO, type RosterState, type useServicio } from "./servicio";
import type { Servicio, ServicioVisitante } from "../db";

type Hoja = ReturnType<typeof useServicio>;

/** Fila de conteo: la cifra y un −/+ pegado a ella. El teclado numérico para
 *  subir de uno en uno es el control equivocado — contar asistentes es tocar
 *  "+" doce veces, no escribir "12" y volver a cerrar el teclado. */
function FilaConteo({ label, valor, onChange }: {
  label: string; valor: number; onChange: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="ios-field">
      <span className="ios-field-label">{label}</span>
      <span className="ios-conteo">
        <span className="ios-conteo-cifra">{valor}</span>
        <span className="ios-stepper">
          <button
            type="button"
            aria-label={t("servicios.restar")}
            disabled={valor <= 0}
            onClick={() => onChange(Math.max(0, valor - 1))}
          >
            −
          </button>
          <button type="button" aria-label={t("servicios.sumar")} onClick={() => onChange(valor + 1)}>
            +
          </button>
        </span>
      </span>
    </div>
  );
}

/** Fila con el nombre a la izquierda y el check a la derecha. Marcar quién
 *  vino es selección múltiple: el interruptor es para ajustes que se quedan
 *  encendidos, no para una lista de quince personas. */
export function FilaMiembro({ nombre, presente, etiqueta, sub, onToggle, onDetalle }: {
  nombre: string;
  presente: boolean;
  /** Estado en el padrón (visitante, en proceso) cuando no es "activo". */
  etiqueta?: string | null;
  /** Segunda línea: el motivo de la ausencia, cuando se está anotando. */
  sub?: string | null;
  onToggle: () => void;
  /** Abre la pantalla de motivo. Solo para ausentes con `anotarAusencias`. */
  onDetalle?: () => void;
}) {
  return (
    <div className="ios-field ios-miembro">
      <button type="button" className="ios-miembro-marcar" onClick={onToggle}>
        <span className="ios-buscador-texto">
          <span className="ios-field-label">{nombre}</span>
          {sub && <span className="ios-buscador-sub">{sub}</span>}
        </span>
        {etiqueta && <span className="ios-miembro-etiqueta">{etiqueta}</span>}
        {presente && <span className="ios-check" aria-hidden="true">✓</span>}
      </button>
      {onDetalle && (
        <button type="button" className="ios-miembro-detalle" onClick={onDetalle} aria-label={nombre}>
          <IosChevron />
        </button>
      )}
    </div>
  );
}

/* ============================================================
   Pantallas
   ============================================================ */

function PantallaVisitante({ v, volverA, onCambiar, onQuitar, onPadron, onVolver }: {
  v: ServicioVisitante;
  volverA: string;
  onCambiar: (patch: Partial<ServicioVisitante>) => void;
  onQuitar: () => void;
  onPadron: () => void;
  onVolver: () => void;
}) {
  const { t } = useTranslation();
  return (
    <IOSPantalla titulo={t("servicios.visitante")} volverA={volverA} onVolver={onVolver}>
      <Section>
        <TextField label={t("servicios.visitanteNombre")} value={v.nombre} onChange={(x) => onCambiar({ nombre: x })} autoFocus={!v.nombre} />
        <TextField label={t("tesorero.telefono")} value={v.telefono ?? ""} onChange={(x) => onCambiar({ telefono: x })} inputMode="tel" optional />
        <TextField label={t("tesorero.correo")} value={v.correo ?? ""} onChange={(x) => onCambiar({ correo: x })} type="email" inputMode="email" optional />
        <TextField label={t("servicios.visitanteInvitadoPor")} value={v.invitado_por ?? ""} onChange={(x) => onCambiar({ invitado_por: x })} optional />
      </Section>
      <Section>
        <label className="ios-field">
          <span className="ios-field-label">{t("servicios.visitantePrimeraVisita")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={v.primera_visita}
            className="ios-switch"
            onClick={() => onCambiar({ primera_visita: !v.primera_visita })}
          />
        </label>
        <IOSFilaTexto
          label={t("recordModal.notas")}
          valor={v.notas ?? ""}
          vacio={t("common.opcional")}
          placeholder={t("servicios.visitanteNotas")}
          multilinea
          onChange={(x) => onCambiar({ notas: x })}
        />
      </Section>
      <Section footer={t("servicios.agregarAlPadronTooltip")}>
        <ActionField label={t("servicios.agregarAlPadron")} onPress={onPadron} disabled={!v.nombre.trim()} />
      </Section>
      <Section>
        <ActionField label={t("common.eliminar")} destructive onPress={onQuitar} />
      </Section>
    </IOSPantalla>
  );
}

/** El motivo de una ausencia, en su propia pantalla: razón, "otra" cuando
 *  hace falta y seguimiento no caben en una fila de 44 px, y meterlos dentro
 *  convertiría la lista en un acordeón justo cuando la tarea es recorrerla. */
function PantallaMotivo({ e, volverA, onRazon, onRazonOtra, onSeguimiento, onVolver }: {
  e: RosterState;
  volverA: string;
  onRazon: (v: string) => void;
  onRazonOtra: (v: string) => void;
  onSeguimiento: (v: boolean) => void;
  onVolver: () => void;
}) {
  const { t } = useTranslation();
  return (
    <IOSPantalla titulo={e.nombre} volverA={volverA} onVolver={onVolver}>
      <Section header={t("servicios.razonAusencia")}>
        <IOSPickerField
          label={t("servicios.motivoFila")}
          sheetTitle={t("servicios.razonAusencia")}
          options={[
            { value: "", label: t("servicios.sinRazon") },
            ...RAZONES_AUSENCIA.map((r) => ({ value: r, label: t(`servicios.razon.${r}`) })),
          ]}
          value={e.razon}
          placeholder={t("servicios.sinRazon")}
          onSelect={onRazon}
        />
        {e.razon === "otra" && (
          <TextField
            label={t("servicios.razon.otra")}
            value={e.razonOtra}
            onChange={onRazonOtra}
            placeholder={t("servicios.razonOtraPlaceholder")}
            autoFocus
          />
        )}
      </Section>
      <Section>
        <SwitchField label={t("servicios.seguimiento")} checked={e.seguimiento} onChange={onSeguimiento} />
      </Section>
    </IOSPantalla>
  );
}

/** El padrón, fuera del formulario. Una sola lista alfabética con check a la
 *  derecha — no dos grupos de presentes y ausentes: en el teléfono cada toque
 *  haría saltar la fila de un grupo al otro y se perdería el sitio.
 *
 *  Marcar y desmarcar a todos siguen operando sobre lo VISIBLE, o sea sobre lo
 *  que filtra el buscador, que es lo que hacían los dos botones de Mac. Y
 *  desmarcar sigue pidiendo confirmación. */
function PantallaMiembros({ h, guardado, volverA, onVolver }: {
  h: Hoja;
  /** Culto ya guardado: el roster vacío entonces significa "se guardó antes
   *  del pase de lista", no "no hay miembros". Son dos mensajes distintos y
   *  solo uno ofrece cargar el padrón. */
  guardado: boolean;
  volverA: string;
  onVolver: () => void;
}) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState<number | null>(null);
  const enMotivo = motivo !== null ? h.roster.get(motivo) : undefined;

  const resumen = (e: RosterState) => {
    if (e.presente) return null;
    const partes = [];
    if (e.razon) partes.push(e.razon === "otra" ? e.razonOtra.trim() || t("servicios.razon.otra") : t(`servicios.razon.${e.razon}`));
    if (e.seguimiento) partes.push(t("servicios.seguimiento"));
    return partes.join(" · ") || null;
  };

  return (
    <>
      <IOSPantalla
        titulo={t("servicios.presentes")}
        volverA={volverA}
        onVolver={onVolver}
        accion={<button type="button" className="ios-nav-action" onClick={onVolver}>{t("common.listo")}</button>}
        bajoBarra={
          <div className="ios-buscador">
            <input
              className="ios-buscador-campo"
              type="search"
              value={h.busqueda}
              onChange={(ev) => h.setBusqueda(ev.target.value)}
              placeholder={t("servicios.buscarMiembro")}
              aria-label={t("servicios.buscarMiembro")}
            />
          </div>
        }
      >
        {h.roster.size === 0 && guardado ? (
          <Section footer={t("servicios.servicioSinRoster")}>
            <ActionField label={t("servicios.cargarActivos")} onPress={() => void h.cargarActivos()} />
          </Section>
        ) : h.roster.size === 0 ? (
          <Section>
            <div className="ios-field ios-buscador-vacio">{t("servicios.sinMiembrosActivos")}</div>
          </Section>
        ) : h.visibles.length === 0 ? (
          <Section footer={t("servicios.rosterSinResultados")}>
            <div className="ios-field ios-buscador-vacio">{t("common.sinResultados")}</div>
          </Section>
        ) : (
          <Section>
            {h.visibles.map(([id, e]) => (
              <FilaMiembro
                key={id}
                nombre={e.nombre}
                presente={e.presente}
                etiqueta={e.estadoMiembro && e.estadoMiembro !== "activo" ? t(`membresia.estado.${e.estadoMiembro}`) : null}
                sub={h.anotarAusencias ? resumen(e) : null}
                onToggle={() => h.toggle(id)}
                onDetalle={h.anotarAusencias && !e.presente ? () => setMotivo(id) : undefined}
              />
            ))}
          </Section>
        )}

        <Section
          footer={t("servicios.resumenPadron", {
            presentes: h.totalPresentes,
            ausentes: h.roster.size - h.totalPresentes,
            total: h.roster.size,
          })}
        >
          <ActionField
            label={t("servicios.marcarTodos")}
            disabled={h.ausentesVisibles.length === 0}
            onPress={() => h.marcarVisibles(true)}
          />
          <ActionField
            label={t("servicios.desmarcarTodos")}
            disabled={h.presentesVisibles.length === 0}
            onPress={() => h.setConfirmDesmarcar(true)}
          />
          {/* Al crear, los motivos nacen apagados: todos arrancan ausentes y
              quince controles serían una pared. Esta fila los enciende. */}
          {!h.anotarAusencias && h.ausentesVisibles.length > 0 && (
            <ActionField label={t("servicios.anotarMotivos")} onPress={() => h.setAnotarAusencias(true)} />
          )}
        </Section>
      </IOSPantalla>

      {enMotivo && (
        <PantallaMotivo
          e={enMotivo}
          volverA={t("servicios.presentes")}
          onRazon={(v) => h.setRazon(motivo!, v)}
          onRazonOtra={(v) => h.setRazonOtra(motivo!, v)}
          onSeguimiento={(v) => h.setSeguimiento(motivo!, v)}
          onVolver={() => setMotivo(null)}
        />
      )}
    </>
  );
}

/* ============================================================
   La hoja
   ============================================================ */

export default function NuevoServicioIOS({
  servicio, h, tipos,
}: {
  servicio: Servicio | null;
  h: Hoja;
  tipos: readonly string[];
}) {
  const { t } = useTranslation();
  const titulo = servicio ? t("servicios.editarServicio") : t("servicios.nuevoServicio");
  const [miembrosAbierto, setMiembrosAbierto] = useState(false);
  const [participacion, setParticipacion] = useState<number | null>(null);
  const [visitante, setVisitante] = useState<number | null>(null);

  useEscapeClose(h.pedirCerrar);

  const resumenMiembros = h.rosterLoading
    ? t("common.preparando")
    : t("servicios.deTotal", { n: h.totalPresentes, total: h.roster.size });

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) h.pedirCerrar(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={h.pedirCerrar} disabled={h.saving}>
              {t("common.cancelar")}
            </button>
            {/* Sin subtítulo con el tipo de culto, aunque el diseño lo pinte:
                `.ios-nav` tiene alto fijo y la usan otras nueve pantallas, y
                el tipo se lee igual en la primera sección, una fila más
                abajo. No merece tocar la barra de toda la app. */}
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button
                type="button"
                className="ios-nav-action"
                onClick={() => void h.guardar()}
                disabled={h.saving || h.rosterLoading}
              >
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body">
            <Section header={t("servicios.secServicio")}>
              <FilaNativa label={t("tx.colFecha")} tipo="date" valor={h.fecha} onChange={h.setFecha} />
              <IOSPickerField
                label={t("servicios.tipoServicio")}
                options={tipos.map((ti) => ({ value: ti, label: t(`servicios.tipo.${ti}`) }))}
                value={h.tipo}
                onSelect={h.setTipo}
              />
              <TextField label={t("servicios.dirige")} value={h.dirige} onChange={h.setDirige} optional />
              <TextField label={t("servicios.predica")} value={h.predica} onChange={h.setPredica} optional />
            </Section>

            <Section header={t("servicios.secParticipaciones")}>
              {h.participaciones.map((p, i) => (
                <button key={i} type="button" className="ios-field ios-field--link" onClick={() => setParticipacion(i)}>
                  <span className="ios-field-label">{p}</span>
                  <IosChevron />
                </button>
              ))}
              <ActionField
                label={t("servicios.anadirParticipacion")}
                onPress={() => {
                  h.setParticipaciones((ps) => [...ps, ""]);
                  setParticipacion(h.participaciones.length);
                }}
              />
            </Section>

            <Section
              header={t("servicios.secConteo")}
              footer={
                <>
                  {t("servicios.conteoPie")}
                  {h.totalConteo > 0 && h.totalPresentes === 0 && (
                    <span className="ios-section-footer--aviso">{t("servicios.avisoConteoSinLista", { n: h.totalConteo })}</span>
                  )}
                </>
              }
            >
              <FilaConteo label={t("servicios.ninos")} valor={h.ninos} onChange={h.setNinos} />
              <FilaConteo label={t("servicios.jovenes")} valor={h.jovenes} onChange={h.setJovenes} />
              <FilaConteo label={t("servicios.adultos")} valor={h.adultos} onChange={h.setAdultos} />
              {/* El total no se escribe: es niños + jóvenes + adultos. */}
              <div className="ios-field ios-total">
                <span className="ios-field-label">{t("servicios.totalPresentes")}</span>
                <span className="ios-field-value">{h.totalConteo}</span>
              </div>
            </Section>

            <Section
              header={t("servicios.secAsistenciaMiembro")}
              footer={
                <>
                  {t("servicios.asistenciaPie")}
                  {h.totalPresentes > 0 && h.totalConteo === 0 && (
                    <span className="ios-section-footer--aviso">{t("servicios.avisoListaSinConteo", { count: h.totalPresentes })}</span>
                  )}
                </>
              }
            >
              <button
                type="button"
                className="ios-field ios-field--link"
                disabled={h.rosterLoading}
                onClick={() => setMiembrosAbierto(true)}
              >
                <span className="ios-field-label">{t("servicios.presentes")}</span>
                <span className="ios-field-value">{resumenMiembros}</span>
                <IosChevron />
              </button>
            </Section>

            <Section header={t("servicios.secMensaje")}>
              <TextField label={t("servicios.tituloMensaje")} value={h.tituloMensaje} onChange={h.setTituloMensaje} />
              <TextField
                label={t("servicios.textoBiblico")}
                value={h.textoBiblico}
                onChange={h.setTextoBiblico}
                placeholder={t("servicios.textoBiblicoPlaceholder")}
              />
              <IOSFilaTexto
                label={t("servicios.resumenMensaje")}
                valor={h.resumenMensaje}
                vacio={t("common.opcional")}
                multilinea
                onChange={h.setResumenMensaje}
              />
            </Section>

            <Section header={t("servicios.secEscuelaVisitantes")}>
              <TextField label={t("servicios.temaEscuela")} value={h.temaEscuela} onChange={h.setTemaEscuela} />
              <TextField label={t("servicios.maestroEscuela")} value={h.maestroEscuela} onChange={h.setMaestroEscuela} />
              {h.visitantes.map((v, i) => (
                <button key={i} type="button" className="ios-field ios-field--link" onClick={() => setVisitante(i)}>
                  <span className="ios-field-label">{v.nombre.trim() || t("servicios.visitante")}</span>
                  <IosChevron />
                </button>
              ))}
              <ActionField
                label={t("servicios.agregarVisitante")}
                onPress={() => {
                  h.setVisitantes((vs) => [...vs, { ...VISITANTE_VACIO }]);
                  setVisitante(h.visitantes.length);
                }}
              />
            </Section>

            {/* Sin encabezado: una sección de una fila cuyo rótulo diría lo
                mismo que la fila. */}
            <Section>
              <IOSFilaTexto
                label={t("servicios.secEventos")}
                valor={h.eventos}
                vacio={t("common.opcional")}
                placeholder={t("servicios.eventosPlaceholder")}
                multilinea
                onChange={h.setEventos}
              />
            </Section>

            {h.error && <p className="nm-aviso" role="alert"><IconWarn size={14} /> {h.error}</p>}
          </div>
        </div>
      </div>

      {participacion !== null && (
        <IOSPantallaTexto
          title={t("servicios.participacion")}
          valor={h.participaciones[participacion] ?? ""}
          placeholder={t("servicios.agregarParticipacion")}
          onListo={(v) => {
            /* Vacía = quitada: en una lista de filas no hay dónde poner una
               papelera sin robarle sitio al texto, y borrarlo todo es el gesto
               natural para deshacerse de una. */
            h.setParticipaciones((ps) =>
              v.trim() ? ps.map((p, j) => (j === participacion ? v.trim() : p)) : ps.filter((_, j) => j !== participacion)
            );
            setParticipacion(null);
          }}
          onCancel={() => {
            h.setParticipaciones((ps) => ps.filter((p, j) => j !== participacion || p.trim()));
            setParticipacion(null);
          }}
        />
      )}

      {visitante !== null && h.visitantes[visitante] && (
        <PantallaVisitante
          v={h.visitantes[visitante]}
          volverA={titulo}
          onCambiar={(patch) => h.setVisitante(visitante, patch)}
          onQuitar={() => { h.setVisitantes((vs) => vs.filter((_, j) => j !== visitante)); setVisitante(null); }}
          onPadron={() => void h.agregarAlPadron(visitante).then(() => setVisitante(null))}
          onVolver={() => {
            /* Una fila enteramente vacía no se guarda; tampoco tiene por qué
               quedarse en la lista ocupando sitio. */
            const v = h.visitantes[visitante];
            const vacia = !v.nombre.trim() && ![v.telefono, v.correo, v.invitado_por, v.notas].some((x) => (x ?? "").trim());
            if (vacia) h.setVisitantes((vs) => vs.filter((_, j) => j !== visitante));
            setVisitante(null);
          }}
        />
      )}

      {miembrosAbierto && (
        <PantallaMiembros h={h} guardado={servicio !== null} volverA={titulo} onVolver={() => { h.setBusqueda(""); setMiembrosAbierto(false); }} />
      )}

      {h.confirmVacio && (
        <ConfirmDialog
          title={t("servicios.confirmarVacioTitulo")}
          message={t("servicios.confirmarVacioMensaje")}
          confirmLabel={t("servicios.confirmarVacioBoton")}
          onConfirm={() => { h.setConfirmVacio(false); void h.guardar(true); }}
          onCancel={() => h.setConfirmVacio(false)}
        />
      )}

      {h.confirmDesmarcar && (
        <ConfirmDialog
          title={t("servicios.desmarcarTitulo")}
          message={t("servicios.desmarcarMensaje", { count: h.presentesVisibles.length })}
          confirmLabel={t("servicios.desmarcarTodos")}
          danger
          onConfirm={() => { h.marcarVisibles(false); h.setConfirmDesmarcar(false); }}
          onCancel={() => h.setConfirmDesmarcar(false)}
        />
      )}

      {h.confirmClose && (
        <ConfirmDialog
          title={t("servicios.cambiosSinGuardarTitulo")}
          message={t("servicios.cambiosSinGuardarMensaje")}
          confirmLabel={t("servicios.descartarCambios")}
          danger
          onConfirm={h.onCerrarDeVerdad}
          onCancel={() => h.setConfirmClose(false)}
        />
      )}
    </Portal>
  );
}
