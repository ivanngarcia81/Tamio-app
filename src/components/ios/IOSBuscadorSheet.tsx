/**
 * IOSBuscadorSheet.tsx — hoja de selección CON BUSCADOR, y con la opción de
 * escribir algo que no está en la lista.
 *
 * Por qué no valía `IOSPickerSheet`: aquél elige uno de una lista corta y
 * cerrada (moneda, método de pago). Aquí la lista es el padrón de la iglesia
 * —trescientas personas en una congregación mediana, sin techo— y además hay
 * un caso que no es "elegir": el aportante puede ser un VISITANTE que no está
 * registrado, y entonces lo que se guarda es el nombre escrito. Una hoja sin
 * buscador y sin texto libre no cubre ninguna de las dos cosas.
 *
 * Se apoya en `.ios-sheet` (la hoja alta con barra) y no en `.action-sheet`
 * (la que sube desde abajo con `max-height: 60vh`): con el teclado abierto,
 * que es el estado normal de un buscador, ese 60 % deja tres filas visibles.
 *
 * La pieza es genérica a propósito. Hoy la usa el aportante de Nuevo ingreso;
 * el mismo patrón sirve para elegir miembro en Cartas, en Servicios o en
 * Traslados, que hoy resuelven lo mismo cada uno a su manera.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "../Portal";
import { useEscapeClose } from "../../hooks/useEscapeClose";
import { normalizarTexto } from "../../db";
import { IconCheck } from "../../icons";
import { IosChevron } from "./FormularioIOS";

export interface OpcionBuscador {
  id: string;
  titulo: string;
  /** Segunda línea: lo que distingue a dos personas del mismo nombre. */
  sub?: string | null;
}

interface PropsHoja {
  title: string;
  placeholder: string;
  opciones: OpcionBuscador[];
  /** Id elegido, o null si lo que hay es texto libre (o nada). */
  seleccionado: string | null;
  /** Texto con el que se abre el buscador (el nombre ya escrito). */
  textoInicial?: string;
  /** Elegir de la lista. */
  onElegir: (op: OpcionBuscador) => void;
  /** Aceptar lo escrito tal cual. Si no se pasa, no se ofrece. */
  onTextoLibre?: (texto: string) => void;
  /** Etiqueta de esa fila, p. ej. «Anotar "Juan" como visitante». */
  etiquetaTextoLibre?: (texto: string) => string;
  /** Dejar el campo vacío. Si no se pasa, no se ofrece. */
  onLimpiar?: () => void;
  onCancel: () => void;
}

export function IOSBuscadorSheet({
  title, placeholder, opciones, seleccionado, textoInicial,
  onElegir, onTextoLibre, etiquetaTextoLibre, onLimpiar, onCancel,
}: PropsHoja) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);
  const [q, setQ] = useState(textoInicial ?? "");

  const filtradas = useMemo(() => {
    const busca = normalizarTexto(q);
    if (!busca) return opciones;
    return opciones.filter(
      (o) => normalizarTexto(o.titulo).includes(busca) || normalizarTexto(o.sub ?? "").includes(busca)
    );
  }, [q, opciones]);

  // La fila de texto libre solo aparece si hay algo escrito y no es, letra por
  // letra, alguien que ya está en la lista: ofrecer "anotar a Ana como
  // visitante" teniendo a Ana en el padrón invita a duplicarla.
  const escrito = q.trim();
  const yaEsta = filtradas.some((o) => normalizarTexto(o.titulo) === normalizarTexto(escrito));
  const ofrecerLibre = !!onTextoLibre && escrito.length > 0 && !yaEsta;

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="ios-sheet" role="dialog" aria-label={title}>
          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onCancel}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{title}</h1>
            <span className="ios-nav-status" />
          </div>

          <div className="ios-buscador">
            <input
              className="ios-buscador-campo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              autoFocus
              type="search"
              aria-label={placeholder}
            />
          </div>

          <div className="ios-sheet-body">
            {/* "Ninguno" arriba y "anotar lo escrito" ABAJO, no al revés:
                quitar la selección es un estado de la lista y se lee con
                ella; anotar un visitante es crear algo, y puesto encima le
                quitaba el sitio a las personas que sí están en el padrón. */}
            {onLimpiar && (
              <div className="ios-group ios-buscador-grupo">
                <button type="button" className="ios-field ios-field--link" onClick={onLimpiar}>
                  <span className="ios-field-label">{t("common.ninguno")}</span>
                  {seleccionado === null && !escrito && <IconCheck size={17} />}
                </button>
              </div>
            )}

            <div className="ios-group ios-buscador-grupo">
              {filtradas.length === 0 ? (
                <div className="ios-field ios-buscador-vacio">{t("common.sinResultados")}</div>
              ) : (
                filtradas.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="ios-field ios-field--link ios-buscador-fila"
                    onClick={() => onElegir(o)}
                  >
                    <span className="ios-buscador-texto">
                      <span className="ios-field-label">{o.titulo}</span>
                      {o.sub && <span className="ios-buscador-sub">{o.sub}</span>}
                    </span>
                    {o.id === seleccionado && <IconCheck size={17} />}
                  </button>
                ))
              )}
            </div>

            {ofrecerLibre && (
              <div className="ios-group ios-buscador-grupo">
                <button
                  type="button"
                  className="ios-field ios-field--action"
                  onClick={() => onTextoLibre!(escrito)}
                >
                  {etiquetaTextoLibre ? etiquetaTextoLibre(escrito) : escrito}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* ============================================================
   Variante de VARIOS nombres
   ============================================================
   La lista de presentes de un acta no es "elegir uno": son seis o diez
   personas, y en una junta puede haber alguien que no sea miembro. Comparte
   el buscador y las filas de arriba, y añade lo que aquello no tiene: fichas
   de lo ya elegido, marca en varias filas a la vez, y —solo en presentes— el
   atajo de la junta al completo.

   Aquí sí se edita sobre una COPIA y se confirma con "Listo": marcar diez
   nombres y darse cuenta a la mitad de que era la lista equivocada tiene que
   poder deshacerse de una vez. */

export interface MiembroNombre {
  nombre: string;
  /** Segunda línea: su cargo, cuando lo tiene. */
  cargo?: string | null;
}

export function IOSNombresSheet({
  title, valores, miembros, oficiales, onListo, onCancel,
}: {
  title: string;
  valores: string[];
  miembros: MiembroNombre[];
  /** Nombres de quienes tienen cargo. Vacío = no se ofrece el atajo (ausentes
   *  e invitados, donde no tiene sentido, y también cuando no hay ninguno). */
  oficiales: string[];
  onListo: (v: string[]) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);
  const [sel, setSel] = useState<string[]>(valores);
  const [q, setQ] = useState("");

  const filtrados = useMemo(() => {
    const busca = normalizarTexto(q);
    if (!busca) return miembros;
    return miembros.filter((m) => normalizarTexto(m.nombre).includes(busca));
  }, [q, miembros]);

  function alternar(nombre: string) {
    setSel((v) => (v.includes(nombre) ? v.filter((x) => x !== nombre) : [...v, nombre]));
  }

  const escrito = q.trim();
  const yaEnLista = miembros.some((m) => normalizarTexto(m.nombre) === normalizarTexto(escrito));
  const yaElegido = sel.some((n) => normalizarTexto(n) === normalizarTexto(escrito));
  const ofrecerLibre = escrito.length > 0 && !yaEnLista && !yaElegido;

  // Sin duplicar a quien ya esté: el atajo se pulsa a media lista tan a menudo
  // como al principio.
  const faltanOficiales = oficiales.filter((n) => !sel.includes(n));

  return (
    <Portal>
      <div className="ios-sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
        <div className="ios-sheet" role="dialog" aria-label={title}>
          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onCancel}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{title}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={() => onListo(sel)}>
                {t("common.listo")}
              </button>
            </span>
          </div>

          <div className="ios-buscador">
            <input
              className="ios-buscador-campo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("actas.buscarNombre")}
              autoFocus
              type="search"
              aria-label={t("actas.buscarNombre")}
            />
          </div>

          <div className="ios-sheet-body">
            {sel.length > 0 && (
              <section className="ios-section">
                <div className="ios-chips">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {sel.map((n) => (
                      <button key={n} type="button" className="chip active" onClick={() => alternar(n)}>
                        {n} ×
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <h2 className="ios-section-header">{t("actas.miembros")}</h2>
            <div className="ios-group ios-buscador-grupo">
              {filtrados.length === 0 ? (
                <div className="ios-field ios-buscador-vacio">{t("common.sinResultados")}</div>
              ) : (
                filtrados.map((m) => (
                  <button
                    key={m.nombre}
                    type="button"
                    className="ios-field ios-field--link ios-buscador-fila"
                    onClick={() => alternar(m.nombre)}
                  >
                    <span className="ios-buscador-texto">
                      <span className="ios-field-label">{m.nombre}</span>
                      {m.cargo && <span className="ios-buscador-sub">{m.cargo}</span>}
                    </span>
                    {sel.includes(m.nombre) && <IconCheck size={17} />}
                  </button>
                ))
              )}
            </div>

            {ofrecerLibre && (
              <div className="ios-group ios-buscador-grupo">
                <button
                  type="button"
                  className="ios-field ios-field--action"
                  onClick={() => { setSel((v) => [...v, escrito]); setQ(""); }}
                >
                  {t("actas.anotarNombre", { nombre: escrito })}
                </button>
              </div>
            )}

            {faltanOficiales.length > 0 && (
              <section className="ios-section">
                <div className="ios-group">
                  <button
                    type="button"
                    className="ios-field ios-field--action"
                    onClick={() => setSel((v) => [...v, ...oficiales.filter((n) => !v.includes(n))])}
                  >
                    {t("actas.anadirOficiales")}
                  </button>
                </div>
                <p className="ios-section-footer">{t("actas.oficialesPie")}</p>
              </section>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Fila de formulario que abre la hoja de arriba. Mismo aspecto que
 *  `IOSPickerField`, para que en una lista agrupada no se note que una abre
 *  una lista corta y la otra un buscador. */
export function IOSBuscadorField({
  label,
  valor,
  vacio,
  ...hoja
}: Omit<PropsHoja, "onCancel"> & { label: string; valor: string; vacio: string }) {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);

  return (
    <>
      <button type="button" className="ios-field ios-field--link" onClick={() => setAbierta(true)}>
        <span className="ios-field-label">{label}</span>
        <span className="ios-field-value">{valor || vacio}</span>
        <IosChevron />
      </button>
      {abierta && (
        <IOSBuscadorSheet
          {...hoja}
          onElegir={(o) => { hoja.onElegir(o); cerrar(); }}
          onTextoLibre={hoja.onTextoLibre && ((tx) => { hoja.onTextoLibre!(tx); cerrar(); })}
          onLimpiar={hoja.onLimpiar && (() => { hoja.onLimpiar!(); cerrar(); })}
          onCancel={cerrar}
        />
      )}
    </>
  );
}
