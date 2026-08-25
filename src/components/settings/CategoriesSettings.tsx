import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, conteoPorCategoria, countTxByCategoria, customCatRef, deleteCategoriaCustom,
  getCategoriasGasto, getCategoriasIngreso, insertCategoriaCustom, updateCategoriaCustom,
  type CategoriaUI, type Church,
} from "../../db";
import ConfirmDialog from "../ConfirmDialog";
import { showToast } from "../../toast";
import { playSound } from "../../sound";
import { IconClose, IconPlus, IconTag, IconWarn } from "../../icons";
import { esMac } from "../../movil";

/** Paleta para categorías nuevas — colores con buen contraste en claro y oscuro. */
const COLORES = ["#0369a1", "#0f766e", "#4d7c0f", "#92400e", "#9a3412", "#9f1239", "#86198f", "#3730a3"];

/** Una fila de la tabla editable de Mac.
 *
 *  A NIVEL DE MÓDULO a propósito. Definida dentro del cuerpo de
 *  `CategoriesSettings` era un tipo de componente NUEVO en cada pintado, así
 *  que React desmontaba y volvía a montar la fila entera cada vez —y con
 *  ella el campo de renombrar—. Medido: al pulsar Intro el nombre se
 *  guardaba pero el campo seguía montado, la celda quedaba en blanco (un
 *  input no tiene texto) y el doble clic siguiente "editaba" hasta las
 *  categorías del sistema, porque el campo que encontraba era el de antes. */
function FilaTabla({
  c, seleccionada, enEdicion, texto, paletaAbierta, colores, etiquetaTipo, etiquetaSistema,
  refInput, onSeleccionar, onEditar, onTexto, onGuardar, onCancelar, onPaleta, onColor, tituloColor,
}: {
  c: CategoriaUI;
  seleccionada: boolean;
  enEdicion: boolean;
  texto: string;
  paletaAbierta: boolean;
  colores: readonly string[];
  etiquetaTipo: string;
  etiquetaSistema: string;
  refInput: React.RefObject<HTMLInputElement | null>;
  onSeleccionar: () => void;
  onEditar: () => void;
  onTexto: (v: string) => void;
  onGuardar: () => void;
  onCancelar: () => void;
  onPaleta: () => void;
  onColor: (cl: string) => void;
  tituloColor: string;
}) {
  const editable = !!c.custom;
  return (
    <div
      className={`cat-tr${seleccionada ? " sel" : ""}${editable ? "" : " sistema"}`}
      /* `stopPropagation`: la tabla escucha el clic para DESELECCIONAR al
         tocar el vacío, y sin esto el clic en una fila la seleccionaba y
         acto seguido el mismo evento la deseleccionaba al burbujear — el
         "−" del pie no llegaba a habilitarse nunca. */
      onClick={(e) => { e.stopPropagation(); onSeleccionar(); }}
      onDoubleClick={() => { if (editable) onEditar(); }}
    >
      <div className="cat-td cat-nombre">
        {enEdicion ? (
          <input
            ref={refInput}
            className="cat-input"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            onBlur={onGuardar}
            onKeyDown={(e) => {
              if (e.key === "Enter") onGuardar();
              if (e.key === "Escape") onCancelar();
            }}
          />
        ) : (
          /* El nombre de una categoría propia vive en `nombre`; `catNombre`
             traduce los ids del catálogo integrado y con un id propio no
             devuelve nada. */
          c.custom ? c.nombre : catNombre(c.id)
        )}
      </div>
      <div className="cat-td">{etiquetaTipo}</div>
      <div className="cat-td cat-color">
        <button
          type="button"
          className="cat-muestra"
          style={{ background: c.color ?? "var(--mac-tertiary)" }}
          disabled={!editable}
          aria-label={tituloColor}
          onClick={(e) => { e.stopPropagation(); onPaleta(); }}
        />
        {paletaAbierta && (
          <div className="cat-paleta" onClick={(e) => e.stopPropagation()}>
            {colores.map((cl) => (
              <button
                type="button"
                key={cl}
                className="cat-muestra"
                style={{ background: cl }}
                aria-label={cl}
                onClick={() => onColor(cl)}
              />
            ))}
          </div>
        )}
      </div>
      <div className="cat-td cat-sistema">{editable ? "" : etiquetaSistema}</div>
    </div>
  );
}

interface Props {
  church: Church;
  /** Notifica al resto de la app que el catálogo cambió. */
  onChanged: () => void;
}

export default function CategoriesSettings({ church, onChanged }: Props) {
  const { t } = useTranslation();
  const [tipo, setTipo] = useState<"ingreso" | "gasto">("gasto");
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState(COLORES[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ uid: string; nombre: string } | null>(null);
  // Contador local para re-render tras editar la caché de categorías.
  const [, setBump] = useState(0);

  /* "N movimientos" por categoría (handoff de iPad). Una sola consulta
     agrupada, no una por fila: son veinte categorías. Se recarga con
     `bump` porque crear o borrar una cambia la lista, no los conteos —pero
     un movimiento reclasificado desde otra pantalla sí, y la de Ajustes se
     abre bastante después. */
  const [conteos, setConteos] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelado = false;
    conteoPorCategoria(church.id)
      .then((c) => { if (!cancelado) setConteos(c); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);

  /** El conteo de una categoría, con la MISMA clave que guarda
   *  `transactions.categoria`: el id del catálogo o la referencia de la
   *  personalizada. */
  const conteoDe = (c: CategoriaUI) => conteos[c.custom && c.uid ? customCatRef(c.uid) : c.id] ?? 0;

  // --- Tabla editable (solo Mac). En iPad se conserva la lista de pastillas:
  // renombrar con doble clic y elegir color de una paleta minúscula son
  // gestos de ratón, no de dedo.
  const enMac = esMac();
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [textoEdicion, setTextoEdicion] = useState("");
  const [paleta, setPaleta] = useState<string | null>(null);
  /** Fila en blanco al final mientras se crea una categoría. Se escribe en la
   *  base recién al confirmar: una fila abandonada no deja rastro. */
  const [borrador, setBorrador] = useState<{ tipo: "ingreso" | "gasto"; color: string } | null>(null);
  const inputEdicion = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editando || borrador) inputEdicion.current?.focus();
  }, [editando, borrador]);

  const listas: { tipo: "ingreso" | "gasto"; label: string; cats: ReturnType<typeof getCategoriasIngreso> }[] = [
    { tipo: "ingreso", label: t("charts.ingresos"), cats: getCategoriasIngreso() },
    { tipo: "gasto", label: t("charts.gastos"), cats: getCategoriasGasto() },
  ];

  async function agregar() {
    setError(null);
    const n = nombre.trim();
    if (!n) {
      setError(t("validacion.nombreObligatorio"));
      return;
    }
    const existentes = tipo === "ingreso" ? getCategoriasIngreso() : getCategoriasGasto();
    if (existentes.some((c) => catNombre(c.id).toLowerCase() === n.toLowerCase())) {
      setError(t("categorias.duplicada"));
      return;
    }
    setSaving(true);
    try {
      await insertCategoriaCustom(church.id, tipo, n, color);
      setNombre("");
      setBump((b) => b + 1);
      showToast(t("categorias.agregada"));
      playSound("guardado");
      onChanged();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
    } finally {
      setSaving(false);
    }
  }

  async function requestDelete(c: { uid: string; nombre: string }) {
    setError(null);
    const n = await countTxByCategoria(church.id, customCatRef(c.uid));
    if (n > 0) {
      setError(t("categorias.enUso", { count: n }));
      return;
    }
    setPendingDelete(c);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteCategoriaCustom(pendingDelete.uid, church.id);
    setPendingDelete(null);
    setBump((b) => b + 1);
    showToast(t("categorias.eliminada"));
    playSound("eliminar");
    onChanged();
  }

  /** Renombrar. `updateCategoriaCustom` ya acepta nombre, color y tipo (db.ts
   *  ~400), así que no hizo falta operación nueva: antes había que borrar la
   *  categoría y volver a crearla, que además le cambiaba el uid y dejaba
   *  huérfanos los movimientos que la usaban. */
  async function guardarNombre(c: CategoriaUI, tipo: "ingreso" | "gasto") {
    const n = textoEdicion.trim();
    setEditando(null);
    if (!c.uid || !n || n === c.nombre) return;
    const hermanas = tipo === "ingreso" ? getCategoriasIngreso() : getCategoriasGasto();
    if (hermanas.some((h) => h.uid !== c.uid && catNombre(h.id).toLowerCase() === n.toLowerCase())) {
      setError(t("categorias.duplicada"));
      return;
    }
    setError(null);
    await updateCategoriaCustom(c.uid, church.id, { nombre: n, color: c.color ?? COLORES[0], tipo });
    setBump((b) => b + 1);
    onChanged();
  }

  async function guardarColor(c: CategoriaUI, tipo: "ingreso" | "gasto", cl: string) {
    setPaleta(null);
    if (!c.uid || cl === c.color) return;
    await updateCategoriaCustom(c.uid, church.id, { nombre: c.nombre, color: cl, tipo });
    setBump((b) => b + 1);
    onChanged();
  }

  /** Confirma la fila en blanco: reutiliza `agregar()`, que ya valida vacío y
   *  duplicado y hace el toast y el sonido. */
  async function confirmarBorrador() {
    const n = textoEdicion.trim();
    if (!n) { setBorrador(null); return; }
    setTipo(borrador!.tipo);
    setColor(borrador!.color);
    setNombre(n);
  }

  // `agregar()` lee de los estados del formulario de siempre, así que la fila
  // en blanco los rellena y este efecto dispara el alta cuando ya están
  // puestos — sin duplicar la validación en dos sitios.
  useEffect(() => {
    if (!borrador || !nombre) return;
    void agregar().then(() => { setBorrador(null); setTextoEdicion(""); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombre]);

  if (enMac) {
    const seleccionada = listas
      .flatMap((l) => l.cats.map((c) => ({ c, tipo: l.tipo })))
      .find(({ c, tipo }) => `${tipo}:${c.id}` === seleccion);
    return (
      /* El pie de nota explica el bloque entero, así que vive FUERA de la caja
         —es lo que hace Ajustes del Sistema— y por eso hay un envoltorio: la
         tarjeta es la raíz del componente y sin él la nota no podría ser su
         hermana. Ver `.settings-bloque` en styles.css. */
      <div className="settings-bloque">
        <div className="card pad-lg settings-card">
          <div className="card-head">
            <div className="card-head-left">
              <div className="card-head-titles">
                <div className="card-title-lg">{t("categorias.titulo")}</div>
              </div>
            </div>
          </div>

          <div className="cat-tabla" onClick={() => { setSeleccion(null); setPaleta(null); }}>
            <div className="cat-thead">
              <div className="cat-th">{t("categorias.nombreLabel")}</div>
              <div className="cat-th">{t("categorias.tipoLabel")}</div>
              <div className="cat-th">{t("categorias.colorLabel")}</div>
              <div className="cat-th" />
            </div>
            {listas.map((l) =>
              l.cats.map((c) => {
                const clave = `${l.tipo}:${c.id}`;
                return (
                  <FilaTabla
                    key={clave}
                    c={c}
                    seleccionada={seleccion === clave}
                    enEdicion={editando === clave}
                    texto={textoEdicion}
                    paletaAbierta={paleta === clave}
                    colores={COLORES}
                    etiquetaTipo={l.tipo === "ingreso" ? t("tx.ingreso") : t("tx.gasto")}
                    etiquetaSistema={t("categorias.delSistema")}
                    tituloColor={t("categorias.colorLabel")}
                    refInput={inputEdicion}
                    onSeleccionar={() => setSeleccion(clave)}
                    onEditar={() => { setTextoEdicion(c.nombre); setEditando(clave); }}
                    onTexto={setTextoEdicion}
                    onGuardar={() => guardarNombre(c, l.tipo)}
                    onCancelar={() => setEditando(null)}
                    onPaleta={() => setPaleta(paleta === clave ? null : clave)}
                    onColor={(cl) => guardarColor(c, l.tipo, cl)}
                  />
                );
              })
            )}
            {borrador && (
              <div className="cat-tr sel">
                <div className="cat-td cat-nombre">
                  <input
                    ref={inputEdicion}
                    className="cat-input"
                    value={textoEdicion}
                    placeholder={t("categorias.nombrePlaceholder")}
                    onChange={(e) => setTextoEdicion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmarBorrador();
                      if (e.key === "Escape") { setBorrador(null); setTextoEdicion(""); }
                    }}
                  />
                </div>
                <div className="cat-td">
                  {/* El tipo solo se elige al CREAR: cambiárselo después a una
                      categoría que ya tiene movimientos los mudaría de columna
                      en los reportes. */}
                  <select
                    className="cat-select"
                    value={borrador.tipo}
                    onChange={(e) => setBorrador({ ...borrador, tipo: e.target.value as "ingreso" | "gasto" })}
                  >
                    <option value="ingreso">{t("tx.ingreso")}</option>
                    <option value="gasto">{t("tx.gasto")}</option>
                  </select>
                </div>
                <div className="cat-td cat-color">
                  <div className="cat-paleta-fija">
                    {COLORES.map((cl) => (
                      <button
                        type="button"
                        key={cl}
                        className={`cat-muestra${borrador.color === cl ? " activa" : ""}`}
                        style={{ background: cl }}
                        aria-label={cl}
                        onClick={() => setBorrador({ ...borrador, color: cl })}
                      />
                    ))}
                  </div>
                </div>
                <div className="cat-td" />
              </div>
            )}
            {/* Pie "+ / −": el patrón de macOS para editar una lista, en vez de
                una fila de creación con desplegable, campo, ocho colores y botón
                apretados en una línea. */}
            <div className="cat-pie" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="cat-pie-btn"
                aria-label={t("categorias.agregar")}
                disabled={saving || !!borrador}
                onClick={() => { setTextoEdicion(""); setBorrador({ tipo: "gasto", color: COLORES[0] }); }}
              >
                <IconPlus size={12} strokeWidth={2.2} />
              </button>
              <button
                type="button"
                className="cat-pie-btn"
                aria-label={t("common.eliminar")}
                disabled={!seleccionada?.c.custom}
                onClick={() => {
                  const c = seleccionada?.c;
                  if (c?.uid) requestDelete({ uid: c.uid, nombre: c.nombre });
                }}
              >
                <IconClose size={12} strokeWidth={2.2} />
              </button>
            </div>
          </div>


          {error && (
            <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
              <IconWarn size={13} /> {error}
            </div>
          )}

          {pendingDelete && (
            <ConfirmDialog
              title={t("categorias.eliminarTitulo")}
              message={t("categorias.eliminarMensaje", { nombre: pendingDelete.nombre })}
              confirmLabel={t("common.eliminar")}
              danger
              onConfirm={confirmDelete}
              onCancel={() => setPendingDelete(null)}
            />
          )}
        </div>
        <p className="settings-nota">{t("categorias.hintMac")}</p>
      </div>
    );
  }

  return (
    /* El pie de nota explica el bloque entero, así que vive FUERA de la caja
       —es lo que hace Ajustes del Sistema— y por eso hay un envoltorio: la
       tarjeta es la raíz del componente y sin él la nota no podría ser su
       hermana. Ver `.settings-bloque` en styles.css. */
    <div className="settings-bloque">
      <div className="card pad-lg settings-card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-icon"><IconTag size={16} /></div>
            <div className="card-head-titles">
              <div className="card-title-lg">{t("categorias.titulo")}</div>
              <div className="card-title-sub">{t("categorias.sub")}</div>
            </div>
          </div>
        </div>

        {listas.map((lista) => (
          <div className="form-group full" key={lista.tipo}>
            <label className="form-label">{lista.label}</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {lista.cats.map((c) =>
                c.custom ? (
                  <span
                    key={c.id}
                    className="tag otros"
                    style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: c.color, flexShrink: 0 }} />
                    {c.nombre}
                    <span className="cat-conteo">{t("categorias.nMovimientos", { count: conteoDe(c) })}</span>
                    <span
                      style={{ cursor: "pointer", display: "inline-flex", opacity: 0.7 }}
                      title={t("common.eliminar")}
                      onClick={() => {
                        if (c.uid) requestDelete({ uid: c.uid, nombre: c.nombre });
                      }}
                    >
                      <IconClose size={10} strokeWidth={2.2} />
                    </span>
                  </span>
                ) : (
                  <span
                    key={c.id}
                    className={`tag ${c.tagClass}`}
                    style={{ opacity: 0.75, display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    {catNombre(c.id)}
                    <span className="cat-conteo">{t("categorias.nMovimientos", { count: conteoDe(c) })}</span>
                  </span>
                )
              )}
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
          <select className="form-select" style={{ width: "auto" }} value={tipo} onChange={(e) => setTipo(e.target.value as "ingreso" | "gasto")}>
            <option value="ingreso">{t("tx.ingreso")}</option>
            <option value="gasto">{t("tx.gasto")}</option>
          </select>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 160 }}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") agregar(); }}
            placeholder={t("categorias.nombrePlaceholder")}
          />
          <div style={{ display: "flex", gap: 4 }}>
            {COLORES.map((cl) => (
              <span
                key={cl}
                onClick={() => setColor(cl)}
                style={{
                  width: 18, height: 18, borderRadius: 99, background: cl, cursor: "pointer",
                  outline: color === cl ? "2px solid var(--ink)" : "none", outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <button className="btn secondary" onClick={agregar} disabled={saving}>
            <IconPlus size={13} /> {t("categorias.agregar")}
          </button>
        </div>


        {error && (
          <div className="form-warning" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
            <IconWarn size={13} /> {error}
          </div>
        )}

        {pendingDelete && (
          <ConfirmDialog
            title={t("categorias.eliminarTitulo")}
            message={t("categorias.eliminarMensaje", { nombre: pendingDelete.nombre })}
            confirmLabel={t("common.eliminar")}
            danger
            onConfirm={confirmDelete}
            onCancel={() => setPendingDelete(null)}
          />
        )}
      </div>
      <p className="settings-nota">{t("categorias.hint")}</p>
    </div>
  );
}
