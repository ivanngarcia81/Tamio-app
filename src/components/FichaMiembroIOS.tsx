/**
 * FichaMiembroIOS.tsx — la ficha de miembro en lo táctil: hoja que sube desde
 * abajo, con barra de Cancelar/Guardar y el formulario en lista agrupada.
 *
 * No tiene estado propio. Todo sale de `useFichaMiembro`, el mismo hook que
 * alimenta el modal de Mac, así que el `MemberFicha` que se guarda es el
 * mismo objeto con los mismos valores por omisión.
 *
 * Sirve para las DOS cosas, y no se pintan igual:
 *
 * - **Alta** (`h.crear`): "Quién es" → "Membresía" → "Completar ahora", más
 *   "Guardar y agregar otro". Es la hoja de siempre, sin un cambio.
 * - **Edición**: no hay "Quién es". Nombre, correo, teléfono, ID fiscal y
 *   notas **no se guardan al editar** —`updateMemberFicha` solo escribe la
 *   ficha— y el hook ni siquiera los precarga, así que pintarlos sería
 *   enseñar cinco campos vacíos que además se tragarían lo que se escriba en
 *   ellos. El modal de escritorio hace exactamente lo mismo desde siempre
 *   (`{crear && <Seccion "Datos personales">}`); aquí solo se hereda.
 *   A cambio, "Membresía" recoge los cuatro campos que sí son de membresía
 *   —estado, congregación, ingreso e iglesia anterior—, que es la sección
 *   que dibuja el modal de Mac al editar, y aparecen las tres cosas que solo
 *   tienen sentido sobre alguien que ya existe: el expediente, la pantalla de
 *   lectura (asistencia, historial y documentos) y "Generar informe".
 *
 * La edición táctil llega aquí desde el iPad (23 ago 2026). El iPhone sigue
 * abriendo la ficha completa de siempre al editar: ahí no hay panel detrás
 * que enseñe al miembro, y esa decisión se toma en `FichaMiembroModal`.
 *
 * Dos decisiones que no se ven en la pantalla:
 *
 * - **"Guardar" nace apagado y se enciende con el nombre —solo en el alta.**
 *   Es la misma condición que ya validaba `guardar()` (nombre obligatorio al
 *   crear); al apagarla en la barra, el mensaje de error deja de hacer falta
 *   —aunque se sigue pintando si llegara, porque quitar la última red de un
 *   guardado no se compensa con nada. Al editar no aplica: el nombre no está
 *   en esta hoja, y condicionar el botón a él dejaría "Guardar" muerto.
 * - **Las pantallas empujadas editan en vivo, sin copia.** Son pantallas
 *   dentro del mismo formulario, no diálogos aparte: quien quiera descartar
 *   todo tiene "Cancelar" en la hoja, y hasta ahí no se ha escrito nada en la
 *   base. Una copia con "Listo" obligaría además a decidir qué pasa con lo
 *   escrito en las otras.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { ActionField, FilaNativa, IOSPantalla, IosChevron, Section, SwitchField, TextField } from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IOSFilaTexto } from "./ios/IOSPantallaTexto";
import { ChipGroup, CARGOS, HABILIDADES, INSTRUMENTOS, MINISTERIOS } from "./FichaMiembroModal";
import { ESTADOS_REGISTRO, type useFichaMiembro } from "./fichaMiembro";
import { fmtFechaCorta, type Church, type Member } from "../db";
import { printInformeIndividual } from "../services/informes/printInforme";
import { showToast } from "../toast";
import { IconWarn } from "../icons";
import { useEscapeClose } from "../hooks/useEscapeClose";

type Ficha = ReturnType<typeof useFichaMiembro>;

/** Un grupo de chips con su etiqueta encima, en una sección propia: dentro de
 *  `.ios-group` no cabe —una fila de lista es una línea, y aquí hay cincuenta
 *  chips— así que la etiqueta pasa a ser el encabezado de la sección, que es
 *  justo lo que iOS hace con las listas de selección múltiple. */
function SeccionChips({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="ios-section">
      <h2 className="ios-section-header">{titulo}</h2>
      <div className="ios-chips">{children}</div>
    </section>
  );
}

/** Fila de solo lectura: etiqueta a la izquierda, dato a la derecha. No es un
 *  botón —no lleva a ningún sitio— así que va en `div`, que es lo que hace
 *  que no salga con el resalte de pulsación de las filas que sí actúan. */
function FilaLectura({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="ios-field">
      <span className="ios-field-label">{label}</span>
      <span className="ios-field-value">{valor}</span>
    </div>
  );
}

/** Una línea suelta de texto dentro de un grupo: para lo que no es par
 *  etiqueta/valor —una nota administrativa con su fecha encima, o el aviso de
 *  que una sección todavía no tiene nada—. Reaprovecha `--stacked`, que ya
 *  pone la etiqueta encima; lo único nuevo es que el texto de abajo envuelve,
 *  cosa que `.ios-field-value` no hace por estar pensado para un dato corto. */
function FilaTexto({ arriba, texto }: { arriba: string; texto: string }) {
  return (
    <div className="ios-field ios-field--stacked">
      <span className="ios-field-label">{arriba}</span>
      <span className="ios-field-nota">{texto}</span>
    </div>
  );
}

/* ============================================================
   Los bloques que se abren en su propia pantalla
   ============================================================ */

export function BloqueEspiritual({ h }: { h: Ficha }) {
  const { t } = useTranslation();
  return (
    <Section footer={h.bautizadoEspiritu ? t("ficha.fechaAproximada") : undefined}>
      <SwitchField label={t("ficha.bautizadoAgua")} checked={h.bautizadoAgua} onChange={h.setBautizadoAgua} />
      {/* La fecha va pegada a su switch y solo cuando está encendido: es el
          mismo par que en Mac, y `guardar()` la anula si el switch se apaga. */}
      {h.bautizadoAgua && (
        <FilaNativa label={t("recordModal.fecha")} tipo="date" valor={h.fechaBautismoAgua} onChange={h.setFechaBautismoAgua} />
      )}
      <SwitchField label={t("ficha.bautizadoEspiritu")} checked={h.bautizadoEspiritu} onChange={h.setBautizadoEspiritu} />
      {h.bautizadoEspiritu && (
        <FilaNativa label={t("recordModal.fecha")} tipo="date" valor={h.fechaBautismoEspiritu} onChange={h.setFechaBautismoEspiritu} />
      )}
      <SwitchField label={t("ficha.cursoMembresia")} checked={h.cursoMembresia} onChange={h.setCursoMembresia} />
    </Section>
  );
}

export function BloqueServicio({ h }: { h: Ficha }) {
  const { t } = useTranslation();
  return (
    <>
      <SeccionChips titulo={t("ficha.ministerios")}>
        <ChipGroup catalogo={MINISTERIOS} prefijo="ficha.ministerio" valores={h.ministerios} onChange={h.setMinisterios} placeholder={t("ficha.otroMinisterio")} />
      </SeccionChips>
      <SeccionChips titulo={t("ficha.cargosLabel")}>
        <ChipGroup catalogo={CARGOS} prefijo="ficha.cargo" valores={h.cargos} onChange={h.setCargos} placeholder={t("ficha.otroCargo")} />
      </SeccionChips>
      <SeccionChips titulo={t("ficha.ministeriosInteres")}>
        <ChipGroup catalogo={MINISTERIOS} prefijo="ficha.ministerio" valores={h.ministeriosInteres} onChange={h.setMinisteriosInteres} placeholder={t("ficha.otroMinisterio")} />
      </SeccionChips>
      <SeccionChips titulo={t("ficha.instrumentos")}>
        <ChipGroup catalogo={INSTRUMENTOS} prefijo="ficha.instrumento" valores={h.instrumentos} onChange={h.setInstrumentos} placeholder={t("ficha.otroInstrumento")} />
      </SeccionChips>
      <SeccionChips titulo={t("ficha.habilidades")}>
        <ChipGroup catalogo={HABILIDADES} prefijo="ficha.habilidad" valores={h.habilidades} onChange={h.setHabilidades} placeholder={t("ficha.otraHabilidad")} />
      </SeccionChips>
      <Section>
        <TextField
          label={t("ficha.disponibilidad")}
          value={h.disponibilidad}
          onChange={h.setDisponibilidad}
          placeholder={t("ficha.disponibilidadPlaceholder")}
          stacked
        />
        <SwitchField label={t("ficha.interesServir")} checked={h.interesServir} onChange={h.setInteresServir} />
      </Section>
    </>
  );
}

/** Solo en el ALTA: los cinco campos de `members` que únicamente se escriben
 *  al crear. Al editar esta pantalla no existe —ver la cabecera del archivo—,
 *  y por eso "Iglesia anterior" y "Fecha de ingreso", que sí son de la ficha,
 *  suben a "Membresía" en ese modo. */
export function BloquePersonales({ h }: { h: Ficha }) {
  const { t } = useTranslation();
  return (
    <Section footer={t("recordModal.rfcMiembroHint")}>
      <IOSFilaTexto
        label={t("recordModal.rfc")}
        valor={h.rfc}
        vacio={t("common.opcional")}
        placeholder={t("recordModal.rfcMiembroPlaceholder")}
        onChange={h.setRfc}
      />
      <IOSFilaTexto
        label={t("recordModal.notas")}
        valor={h.notas}
        vacio={t("common.opcional")}
        placeholder={t("usuarios.notasPlaceholder")}
        multilinea
        onChange={h.setNotas}
      />
      <IOSFilaTexto
        label={t("ficha.iglesiaAnterior")}
        valor={h.iglesiaAnterior}
        vacio={t("ficha.siAplica")}
        onChange={h.setIglesiaAnterior}
      />
      <FilaNativa label={t("ficha.fechaIngreso")} tipo="date" valor={h.fechaIngreso} onChange={h.setFechaIngreso} />
    </Section>
  );
}

/** Solo en la EDICIÓN: las tres secciones que el modal de escritorio pinta
 *  bajo `{!crear && …}` y que no se editan —asistencia, historial y
 *  documentos—. Aquí se van a su propia pantalla en vez de alargar la hoja:
 *  lo que se viene a hacer a esta hoja es CAMBIAR algo, y tres bloques de
 *  lectura entre medias empujan los campos fuera de la pantalla.
 *
 *  El panel de detalle del iPad ya enseña la asistencia y los movimientos,
 *  pero no las notas administrativas, los cambios de estado ni las cartas y
 *  traslados: sin esta pantalla, pasar la edición a la hoja los perdería. */
export function BloqueHistorial({ h, member }: { h: Ficha; member: Member }) {
  const { t } = useTranslation();
  const { asistencia, docs } = h;

  let cambios: { de: string; a: string; fecha: string }[] = [];
  let notasAdmin: { fecha: string; texto: string }[] = [];
  try { cambios = JSON.parse(member.historial_estados); } catch { /* noop */ }
  try { notasAdmin = JSON.parse(member.seguimiento_notas); } catch { /* noop */ }

  const nombreEstado = (k: string) =>
    ["activo", "inactivo", "visitante", "enProceso", "trasladado", "retirado", "fallecido", "baja"].includes(k)
      ? t(`membresia.estado.${k}`) : k;

  return (
    <>
      <Section
        header={t("ficha.secAsistencia")}
        footer={asistencia && asistencia.enRoster > 0
          ? t("ficha.deServicios", { asistencias: asistencia.asistencias, total: asistencia.enRoster })
          : undefined}
      >
        {!asistencia ? (
          <FilaLectura label={t("ficha.pctAsistencia")} valor={t("common.preparando")} />
        ) : asistencia.enRoster === 0 ? (
          <FilaTexto arriba={t("ficha.secAsistencia")} texto={t("ficha.sinAsistencias")} />
        ) : (
          <>
            <FilaLectura label={t("ficha.pctAsistencia")} valor={asistencia.pct !== null ? `${asistencia.pct}%` : "—"} />
            <FilaLectura
              label={t("ficha.ultimaAsistencia")}
              valor={asistencia.ultimaAsistencia ? fmtFechaCorta(asistencia.ultimaAsistencia) : "—"}
            />
          </>
        )}
      </Section>

      <Section header={t("ficha.secHistorial")}>
        <FilaLectura
          label={t("ficha.iosRegistrado")}
          valor={member.created_at ? member.created_at.slice(0, 10) : "—"}
        />
      </Section>

      {cambios.length > 0 && (
        <Section header={t("ficha.cambiosEstado")}>
          {cambios.slice().reverse().map((c, i) => (
            <FilaLectura
              key={i}
              label={c.fecha.slice(0, 10)}
              valor={c.de ? `${nombreEstado(c.de)} → ${nombreEstado(c.a)}` : nombreEstado(c.a)}
            />
          ))}
        </Section>
      )}

      {notasAdmin.length > 0 && (
        <Section header={t("ficha.notasAdmin")}>
          {notasAdmin.slice().reverse().map((n, i) => (
            <FilaTexto key={i} arriba={n.fecha.slice(0, 16).replace("T", " ")} texto={n.texto} />
          ))}
        </Section>
      )}

      <Section header={t("ficha.secDocumentos")}>
        {!docs ? (
          <FilaTexto arriba={t("ficha.secDocumentos")} texto={t("common.preparando")} />
        ) : docs.length === 0 ? (
          <FilaTexto arriba={t("ficha.secDocumentos")} texto={t("ficha.sinDocumentos")} />
        ) : (
          docs.slice(0, 12).map((d, i) => (
            <FilaLectura
              key={i}
              label={`${d.folio} · ${t(`ficha.docClase.${d.clase}`)}`}
              valor={fmtFechaCorta(d.fecha)}
            />
          ))
        )}
      </Section>
    </>
  );
}

/* ============================================================
   Las filas y sus pantallas
   ============================================================ */

type Bloque = "espiritual" | "servicio" | "personales" | "historial";

/** Cuántos campos tiene cada bloque y cuántos llevan ya algo escrito.
 *
 *  El total sale de contar los campos que hay dentro —no de una constante
 *  suelta— y el "con dato" es el mismo criterio que usa el resumen de la
 *  sección plegable de Mac: enseñar lo que hay guardado dentro para no
 *  esconderlo en silencio, que es media razón de que estas pantallas existan. */
function cuentaBloque(b: Bloque, h: Ficha): { total: number; conDato: number } {
  const campos: unknown[] =
    b === "espiritual"
      ? [h.bautizadoAgua, h.bautizadoEspiritu, h.cursoMembresia]
      : b === "servicio"
        ? [h.ministerios.length, h.cargos.length, h.ministeriosInteres.length,
           h.instrumentos.length, h.habilidades.length, h.disponibilidad.trim(), h.interesServir]
        : [h.rfc.trim(), h.notas.trim(), h.iglesiaAnterior.trim(), h.fechaIngreso];
  return { total: campos.length, conDato: campos.filter(Boolean).length };
}

/** Fila que abre un bloque, con el número de campos que hay dentro. Cuando ya
 *  hay algo escrito, el número pasa a "3 de 7" y se tiñe: sin eso, un bloque
 *  relleno se ve igual que uno vacío. */
function FilaBloque({ titulo, bloque, h, onPress }: {
  titulo: string; bloque: Bloque; h: Ficha; onPress: () => void;
}) {
  const { t } = useTranslation();
  const { total, conDato } = cuentaBloque(bloque, h);
  return (
    <button type="button" className="ios-field ios-field--link" onClick={onPress}>
      <span className="ios-field-label">{titulo}</span>
      <span className="ios-cuenta" data-lleno={conDato > 0}>
        {conDato > 0 ? t("ficha.iosConDato", { n: conDato, total }) : total}
      </span>
      <IosChevron />
    </button>
  );
}

/** Fila que abre una pantalla sin nada que contar (la de solo lectura). */
function FilaPantalla({ titulo, onPress }: { titulo: string; onPress: () => void }) {
  return (
    <button type="button" className="ios-field ios-field--link" onClick={onPress}>
      <span className="ios-field-label">{titulo}</span>
      <IosChevron />
    </button>
  );
}

/* ============================================================
   La hoja
   ============================================================ */

export default function FichaMiembroIOS({ onClose, h, church, member, onFusionar }: {
  onClose: () => void;
  h: Ficha;
  church: Church;
  /** El miembro que se edita, o null en el alta. */
  member: Member | null;
  onFusionar?: () => void;
}) {
  const { t } = useTranslation();
  const editar = !h.crear && member !== null;
  const titulo = editar ? member.nombre : t("recordModal.nuevoMiembro");
  // Solo el alta exige nombre, y solo el alta lo tiene en esta hoja: al
  // editar, `h.nombre` está vacío a propósito y condicionar "Guardar" a él
  // dejaría el botón muerto para siempre.
  const sinNombre = h.crear && !h.nombre.trim();
  const [bloque, setBloque] = useState<Bloque | null>(null);

  // Con una pantalla abierta, Escape la cierra a ella y no la hoja entera:
  // salir del formulario desde dentro de un bloque tiraría lo escrito en los
  // otros dos sin avisar.
  useEscapeClose(bloque ? () => setBloque(null) : onClose);

  // Aviso, no bloqueo: normalmente alguien se congrega ANTES de ser recibido
  // como miembro. Al revés suele ser un dedo equivocado. Va en el pie de
  // "Membresía" —donde están las fechas— para que se lea sin entrar en
  // ninguna pantalla, aunque en el alta la otra fecha viva dentro de una.
  const fechasInvertidas = !!h.fechaIngreso && !!h.fechaCongregacion && h.fechaIngreso < h.fechaCongregacion;

  const pieMembresia = (
    <>
      {!editar && t("ficha.iosMembresiaPie")}
      {fechasInvertidas && (
        <span className="ios-section-footer--error">{t("ficha.avisoFechasInvertidas")}</span>
      )}
    </>
  );

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="ios-sheet nm-hoja" role="dialog" aria-label={editar ? t("recordModal.editarMiembro") : titulo}>
          <span className="nm-tirador" aria-hidden="true" />

          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onClose} disabled={h.saving}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{titulo}</h1>
            <span className="ios-nav-status">
              <button
                type="button"
                className="ios-nav-action"
                onClick={() => h.guardar(true)}
                disabled={h.saving || sinNombre}
              >
                {h.saving ? t("common.guardando") : t("common.guardar")}
              </button>
            </span>
          </div>

          <div className="ios-sheet-body">
            {/* Nombre, correo y teléfono solo al dar de alta: al editar no se
                guardan (ver la cabecera), igual que en el modal de Mac. */}
            {!editar && (
              <Section header={t("ficha.iosQuienEs")}>
                <TextField
                  label={t("recordModal.nombreFamilia")}
                  value={h.nombre}
                  onChange={h.setNombre}
                  placeholder={t("recordModal.nombreFamiliaPlaceholder")}
                  stacked
                  autoFocus
                />
                <TextField
                  label={t("tesorero.telefono")}
                  value={h.telefono}
                  onChange={h.setTelefono}
                  placeholder={t("tesorero.telefonoPlaceholder")}
                  inputMode="tel"
                  optional
                />
                <TextField
                  label={t("tesorero.correo")}
                  value={h.email}
                  onChange={h.setEmail}
                  placeholder={t("tesorero.correoPlaceholder")}
                  type="email"
                  inputMode="email"
                  optional
                />
              </Section>
            )}

            <Section header={t("ficha.iosMembresia")} footer={pieMembresia}>
              {/* A un miembro dado de baja no se le cambia el estado desde
                  aquí: se reactiva desde la lista. Misma regla que en Mac,
                  donde el desplegable sale deshabilitado con esta nota. */}
              {h.esBaja ? (
                <FilaLectura label={t("membresia.colEstado")} valor={t("ficha.estadoBajaNota")} />
              ) : (
                <IOSPickerField
                  label={t("membresia.colEstado")}
                  options={ESTADOS_REGISTRO.map((es) => ({ value: es, label: t(`membresia.estado.${es}`) }))}
                  value={h.estado}
                  onSelect={h.setEstado}
                />
              )}
              <FilaNativa
                label={t("ficha.fechaCongregacion")}
                tipo="date"
                valor={h.fechaCongregacion}
                onChange={h.setFechaCongregacion}
              />
              {/* Al editar suben aquí los dos campos de membresía que en el
                  alta viven dentro de "Más datos personales": esa pantalla no
                  existe en edición, y son justo los que el modal de Mac pinta
                  en esta misma sección. */}
              {editar && (
                <>
                  <FilaNativa
                    label={t("ficha.fechaIngreso")}
                    tipo="date"
                    valor={h.fechaIngreso}
                    onChange={h.setFechaIngreso}
                  />
                  <IOSFilaTexto
                    label={t("ficha.iglesiaAnterior")}
                    valor={h.iglesiaAnterior}
                    vacio={t("ficha.siAplica")}
                    onChange={h.setIglesiaAnterior}
                  />
                </>
              )}
            </Section>

            {editar ? (
              <Section header={t("ficha.iosExpediente")}>
                <FilaBloque titulo={t("ficha.iosVidaEspiritual")} bloque="espiritual" h={h} onPress={() => setBloque("espiritual")} />
                <FilaBloque titulo={t("ficha.secServicio")} bloque="servicio" h={h} onPress={() => setBloque("servicio")} />
                <FilaPantalla titulo={t("ficha.iosHistorialFila")} onPress={() => setBloque("historial")} />
              </Section>
            ) : (
              <Section header={t("ficha.iosCompletar")} footer={t("ficha.iosCompletarPie")}>
                <FilaBloque titulo={t("ficha.iosVidaEspiritual")} bloque="espiritual" h={h} onPress={() => setBloque("espiritual")} />
                <FilaBloque titulo={t("ficha.secServicio")} bloque="servicio" h={h} onPress={() => setBloque("servicio")} />
                <FilaBloque titulo={t("ficha.iosMasPersonales")} bloque="personales" h={h} onPress={() => setBloque("personales")} />
              </Section>
            )}

            {h.error && (
              <p className="nm-aviso" role="alert">
                <IconWarn size={14} /> {h.error}
              </p>
            )}

            {editar ? (
              /* Las dos acciones del pie del modal de escritorio. "Fusionar"
                 solo llega cuando la página lo pasa —en Mac sigue en el menú
                 de la fila—, así que la fila aparece o no según eso. */
              <Section>
                <ActionField
                  label={t("ficha.generarInforme")}
                  onPress={() => printInformeIndividual(church, member)
                    .catch((e) => showToast(t("common.noSePudoImprimir", { error: String(e) })))}
                />
                {onFusionar && <ActionField label={t("fusion.accion")} onPress={onFusionar} />}
              </Section>
            ) : (
              <Section>
                <ActionField
                  label={t("recordModal.guardarYAgregarOtro")}
                  onPress={() => h.guardar(false)}
                  disabled={h.saving || sinNombre}
                />
              </Section>
            )}
          </div>
        </div>
      </div>

      {bloque === "espiritual" && (
        <IOSPantalla volverA={titulo} titulo={t("ficha.iosVidaEspiritual")} onVolver={() => setBloque(null)}>
          <BloqueEspiritual h={h} />
        </IOSPantalla>
      )}
      {bloque === "servicio" && (
        <IOSPantalla volverA={titulo} titulo={t("ficha.secServicio")} onVolver={() => setBloque(null)}>
          <BloqueServicio h={h} />
        </IOSPantalla>
      )}
      {bloque === "personales" && (
        <IOSPantalla volverA={titulo} titulo={t("ficha.iosMasPersonales")} onVolver={() => setBloque(null)}>
          <BloquePersonales h={h} />
        </IOSPantalla>
      )}
      {bloque === "historial" && member && (
        <IOSPantalla volverA={titulo} titulo={t("ficha.iosHistorialFila")} onVolver={() => setBloque(null)}>
          <BloqueHistorial h={h} member={member} />
        </IOSPantalla>
      )}
    </Portal>
  );
}
