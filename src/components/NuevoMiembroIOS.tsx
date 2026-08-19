/**
 * NuevoMiembroIOS.tsx — "Nuevo miembro" en el iPhone: hoja que sube desde
 * abajo, con barra de Cancelar/Guardar y el formulario en lista agrupada.
 *
 * No tiene estado propio. Todo sale de `useFichaMiembro`, el mismo hook que
 * alimenta el modal de Mac, así que el `MemberFicha` que se guarda es el
 * mismo objeto con los mismos valores por omisión.
 *
 * Solo el ALTA usa esta hoja. Al EDITAR, el teléfono sigue enseñando la ficha
 * completa —las siete secciones, con asistencia, historial y documentos—
 * exactamente como antes: lo que cambia aquí es CUÁNDO se piden las cosas, no
 * qué se guarda ni qué se puede ver.
 *
 * Dos decisiones que no se ven en la pantalla:
 *
 * - **"Guardar" nace apagado y se enciende con el nombre.** Es la misma
 *   condición que ya validaba `guardar()` (nombre obligatorio al crear); al
 *   apagarla en la barra, el mensaje de error deja de hacer falta —aunque se
 *   sigue pintando si llegara, porque quitar la última red de un guardado no
 *   se compensa con nada.
 * - **Las tres pantallas de "Completar ahora" editan en vivo, sin copia.** Son
 *   pantallas empujadas dentro del mismo formulario, no diálogos aparte: quien
 *   quiera descartar todo tiene "Cancelar" en la hoja, y hasta ahí no se ha
 *   escrito nada en la base. Una copia con "Listo" obligaría además a decidir
 *   qué pasa con lo escrito en las otras dos.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "./Portal";
import { ActionField, FilaNativa, IOSPantalla, IosChevron, Section, SwitchField, TextField } from "./ios/FormularioIOS";
import { IOSPickerField } from "./ios/IOSPickerField";
import { IOSFilaTexto } from "./ios/IOSPantallaTexto";
import { ChipGroup, CARGOS, HABILIDADES, INSTRUMENTOS, MINISTERIOS } from "./FichaMiembroModal";
import { ESTADOS_REGISTRO, type useFichaMiembro } from "./fichaMiembro";
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

/* ============================================================
   Los tres bloques de "Completar ahora (opcional)"
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

/* ============================================================
   Las tres filas y sus pantallas
   ============================================================ */

type Bloque = "espiritual" | "servicio" | "personales";

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

/* ============================================================
   La hoja
   ============================================================ */

export default function NuevoMiembroIOS({ onClose, h }: { onClose: () => void; h: Ficha }) {
  const { t } = useTranslation();
  const titulo = t("recordModal.nuevoMiembro");
  const sinNombre = !h.nombre.trim();
  const [bloque, setBloque] = useState<Bloque | null>(null);

  // Con una pantalla abierta, Escape la cierra a ella y no la hoja entera:
  // salir del formulario desde dentro de un bloque tiraría lo escrito en los
  // otros dos sin avisar.
  useEscapeClose(bloque ? () => setBloque(null) : onClose);

  // Aviso, no bloqueo: normalmente alguien se congrega ANTES de ser recibido
  // como miembro. Al revés suele ser un dedo equivocado. Va en el pie de
  // "Membresía" —donde está la fecha de congregarse— para que se lea sin
  // entrar en ninguna pantalla, aunque la otra fecha viva dentro de una.
  const fechasInvertidas = !!h.fechaIngreso && !!h.fechaCongregacion && h.fechaIngreso < h.fechaCongregacion;

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

            <Section
              header={t("ficha.iosMembresia")}
              footer={
                <>
                  {t("ficha.iosMembresiaPie")}
                  {fechasInvertidas && (
                    <span className="ios-section-footer--error">{t("ficha.avisoFechasInvertidas")}</span>
                  )}
                </>
              }
            >
              <IOSPickerField
                label={t("membresia.colEstado")}
                options={ESTADOS_REGISTRO.map((es) => ({ value: es, label: t(`membresia.estado.${es}`) }))}
                value={h.estado}
                onSelect={h.setEstado}
              />
              <FilaNativa
                label={t("ficha.fechaCongregacion")}
                tipo="date"
                valor={h.fechaCongregacion}
                onChange={h.setFechaCongregacion}
              />
            </Section>

            <Section header={t("ficha.iosCompletar")} footer={t("ficha.iosCompletarPie")}>
              <FilaBloque titulo={t("ficha.iosVidaEspiritual")} bloque="espiritual" h={h} onPress={() => setBloque("espiritual")} />
              <FilaBloque titulo={t("ficha.secServicio")} bloque="servicio" h={h} onPress={() => setBloque("servicio")} />
              <FilaBloque titulo={t("ficha.iosMasPersonales")} bloque="personales" h={h} onPress={() => setBloque("personales")} />
            </Section>

            {h.error && (
              <p className="nm-aviso" role="alert">
                <IconWarn size={14} /> {h.error}
              </p>
            )}

            <Section>
              <ActionField
                label={t("recordModal.guardarYAgregarOtro")}
                onPress={() => h.guardar(false)}
                disabled={h.saving || sinNombre}
              />
            </Section>
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
    </Portal>
  );
}
