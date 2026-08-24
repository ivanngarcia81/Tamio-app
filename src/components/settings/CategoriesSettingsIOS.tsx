/**
 * CategoriesSettingsIOS.tsx — pantalla "Categorías" con el patrón de lista
 * editable de iOS, SOLO para iPhone. Mac/iPad siguen usando
 * `CategoriesSettings.tsx` (pastillas + compositor en línea) sin cambios.
 *
 * Decisiones de UX tomadas del paquete v2 (reemplaza a la v1):
 *  - Sin la etiqueta "Del sistema" repetida en cada fila: se explica una
 *    vez en el pie de la última sección (reutiliza `categorias.hint`).
 *  - Chevron y deslizar-para-borrar SOLO en las categorías propias; las
 *    del sistema son filas estáticas.
 *  - Sin botón "Editar" en la nav bar: no hay reordenamiento que lo
 *    justifique. Borrar tiene dos vías — deslizar (atajo) y una fila roja
 *    "Borrar categoría" dentro de la hoja — ambas piden confirmación en
 *    ActionSheet.
 *  - El tipo llega preseleccionado según de qué fila "Nueva categoría de…"
 *    se abrió la hoja (la v1 tenía este bug: siempre arrancaba en Egreso).
 *
 * La edición de nombre/color/tipo es funcionalidad NUEVA (v1 solo agregaba
 * y borraba) — usa `updateCategoriaCustom` (db.ts). El tipo se bloquea si
 * la categoría ya tiene movimientos: cambiarlo la reclasificaría en
 * reportes/PDF sin haber tocado ningún movimiento. El borrado sigue
 * exactamente la misma regla que ya tenía v1 (bloqueado si está en uso) —
 * nada de eso cambia aquí, solo el marcado.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, conteoPorCategoria, countTxByCategoria, customCatRef, deleteCategoriaCustom,
  getCategoriasGasto, getCategoriasIngreso,
  insertCategoriaCustom, updateCategoriaCustom, type CategoriaUI, type Church,
} from "../../db";
import { showToast } from "../../toast";
import { playSound } from "../../sound";
import { hayGesto, useFilaDeslizable } from "../useFilaDeslizable";
import { IosChevron, Section, TextField } from "../ios/FormularioIOS";
import IOSSegmented from "../ios/IOSSegmented";
import IOSFormSheet from "../ios/IOSFormSheet";
import ActionSheet from "../ActionSheet";

/** Misma paleta que ya usaba v1 — ocho colores con buen contraste probado en
 *  claro y oscuro. Los doce "colores de sistema de iOS" del paquete de
 *  referencia no se adoptan: alguno (el amarillo) apenas se lee en claro. */
const COLORES = ["#0369a1", "#0f766e", "#4d7c0f", "#92400e", "#9a3412", "#9f1239", "#86198f", "#3730a3"];

type Kind = "ingreso" | "gasto";

interface Props {
  church: Church;
  onChanged: () => void;
}

/* ---------------- Fila ---------------- */

function CategoryRow({
  cat, activo, conteo, onPress, onDelete,
}: {
  cat: CategoriaUI;
  activo: boolean;
  /** Cuántos movimientos la usan. El handoff lo pone bajo el nombre. */
  conteo: number;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const desliza = useFilaDeslizable(activo && !!cat.custom, false, () => {});
  const colorDot = cat.color ?? `var(--cat-${cat.tagClass})`;
  // `catNombre` ya resuelve las dos formas: traduce las del sistema
  // (`cat.<id>` de i18n) y devuelve el nombre tal cual para las propias
  // (que no llevan traducción, es texto libre del usuario) — una sola
  // llamada sirve para ambas filas, sin bifurcar aquí la lógica.
  const nombre = catNombre(cat.id);

  if (!cat.custom) {
    return (
      <div className="ios-swipe">
        <div className="ios-row ios-row--dot ios-row--static">
          <span className="ios-dot" style={{ color: colorDot }} />
          <span className="ios-row-label">{nombre}</span>
          <span className="cat-conteo">{t("categorias.nMovimientos", { count: conteo })}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ios-swipe">
      <button type="button" className="ios-swipe-delete" onClick={() => { desliza.cerrar(); onDelete(); }}>
        {t("common.eliminar")}
      </button>
      <button
        type="button"
        className="ios-row ios-row--dot"
        ref={desliza.ref}
        onClick={() => (desliza.x > 0 ? desliza.cerrar() : onPress())}
      >
        <span className="ios-dot" style={{ color: colorDot }} />
        <span className="ios-row-label">{nombre}</span>
        <span className="cat-conteo">{t("categorias.nMovimientos", { count: conteo })}</span>
        <IosChevron />
      </button>
    </div>
  );
}

/* ---------------- Hoja de crear/editar ---------------- */

function CategorySheet({
  initial, tipoInicial, tipoBloqueado, nombresExistentes, onCancel, onSave, onDelete,
}: {
  initial?: CategoriaUI;
  tipoInicial: Kind;
  tipoBloqueado: boolean;
  /** Nombres ya usados en el tipo actual (para detectar duplicados), sin
   *  incluir el de la categoría que se está editando. */
  nombresExistentes: (tipo: Kind) => string[];
  onCancel: () => void;
  onSave: (data: { nombre: string; color: string; tipo: Kind }) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORES[0]!);
  const [tipo, setTipo] = useState<Kind>(tipoInicial);
  const [error, setError] = useState<string | null>(null);

  function guardar() {
    const n = nombre.trim();
    if (!n) return;
    if (nombresExistentes(tipo).some((existente) => existente.toLowerCase() === n.toLowerCase())) {
      setError(t("categorias.duplicada"));
      return;
    }
    onSave({ nombre: n, color, tipo });
  }

  return (
    <IOSFormSheet
      title={initial ? t("categorias.editar") : t("categorias.nueva")}
      onCancel={onCancel}
      onSave={guardar}
      canSave={nombre.trim().length > 0}
    >
      <Section footer={error}>
        <TextField
          label={t("categorias.nombreLabel")}
          value={nombre}
          onChange={(v) => { setNombre(v); setError(null); }}
          placeholder={t("categorias.nombrePlaceholder")}
        />
      </Section>

      {/* El segmentado va directamente sobre el fondo gris, sin `Section`:
          esa mete siempre un `.ios-group` blanco alrededor de sus hijos, y
          la pista gris del control quedaba con ~13 px de blanco a cada
          lado — el de la derecha se leía como una tercera casilla vacía. En
          iOS (Fotos, Libros) un segmentado dentro de un formulario no lleva
          tarjeta. Se repiten a mano las dos piezas de `Section` que sí
          hacen falta, encabezado y pie, en vez de tocar `Section`, que la
          usan todas las pantallas de Ajustes. La alineación con las
          tarjetas de arriba y abajo ya la da el `margin: 0 16px` que
          `.ios-segmented` tiene de suyo. */}
      <section className="ios-section">
        <h2 className="ios-section-header">{t("categorias.tipoLabel")}</h2>
        <IOSSegmented
          options={[
            { value: "ingreso", label: t("tx.ingreso") },
            { value: "gasto", label: t("tx.gasto") },
          ]}
          value={tipo}
          onChange={tipoBloqueado ? () => {} : setTipo}
        />
        {tipoBloqueado && <p className="ios-section-footer">{t("categorias.tipoBloqueado")}</p>}
      </section>

      <Section header={t("categorias.colorLabel")}>
        <div className="ios-colors">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              className="ios-color"
              style={{ color: c }}
              aria-selected={c === color}
              aria-label={c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </Section>

      {onDelete && (
        <Section>
          <button type="button" className="ios-delete-row" onClick={onDelete}>
            {t("categorias.borrarCategoria")}
          </button>
        </Section>
      )}
    </IOSFormSheet>
  );
}

/* ---------------- Pantalla ---------------- */

type SheetState =
  | null
  | { mode: "new"; tipo: Kind }
  | { mode: "edit"; uid: string; tipoBloqueado: boolean };

export default function CategoriesSettingsIOS({ church, onChanged }: Props) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [confirm, setConfirm] = useState<{ uid: string; nombre: string } | null>(null);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const [, setBump] = useState(0);
  const gesto = hayGesto();

  const ingresos = getCategoriasIngreso();
  const gastos = getCategoriasGasto();

  // `CategoriaUI` no lleva su propio tipo (ingreso/gasto) — es implícito en
  // de cuál de las dos listas viene — así que hay que buscarlo por lista.
  const editingKind: Kind | undefined = sheet?.mode === "edit"
    ? (ingresos.some((c) => c.uid === sheet.uid) ? "ingreso" : gastos.some((c) => c.uid === sheet.uid) ? "gasto" : undefined)
    : undefined;
  const editing = editingKind ? (editingKind === "ingreso" ? ingresos : gastos).find((c) => c.uid === (sheet as { uid: string }).uid) : undefined;

  function nombresExistentes(tipo: Kind): string[] {
    const lista = tipo === "ingreso" ? ingresos : gastos;
    // catNombre(c.id), no c.nombre: para las del sistema c.nombre es el
    // canónico en español, y el duplicado hay que detectarlo contra lo que
    // el usuario VE (el traducido) — si no, "Offering" no chocaba con
    // "Ofrenda" con la app en inglés.
    return lista
      .filter((c) => c.uid !== (sheet?.mode === "edit" ? sheet.uid : undefined))
      .map((c) => catNombre(c.id));
  }

  async function abrirEditar(c: CategoriaUI) {
    if (!c.uid) return;
    setErrorLista(null);
    const n = await countTxByCategoria(church.id, c.id);
    setSheet({ mode: "edit", uid: c.uid, tipoBloqueado: n > 0 });
  }

  async function pedirBorrar(c: CategoriaUI) {
    if (!c.uid) return;
    setErrorLista(null);
    const n = await countTxByCategoria(church.id, c.id);
    if (n > 0) {
      setErrorLista(t("categorias.enUso", { count: n }));
      return;
    }
    setConfirm({ uid: c.uid, nombre: c.nombre });
  }

  async function confirmarBorrar() {
    if (!confirm) return;
    await deleteCategoriaCustom(confirm.uid, church.id);
    setConfirm(null);
    setBump((b) => b + 1);
    showToast(t("categorias.eliminada"));
    playSound("eliminar");
    onChanged();
  }

  async function guardarSheet(data: { nombre: string; color: string; tipo: Kind }) {
    try {
      if (editing?.uid) {
        await updateCategoriaCustom(editing.uid, church.id, data);
      } else {
        await insertCategoriaCustom(church.id, data.tipo, data.nombre, data.color);
        showToast(t("categorias.agregada"));
        playSound("guardado");
      }
      setSheet(null);
      setBump((b) => b + 1);
      onChanged();
    } catch (e) {
      setErrorLista(t("common.noSePudoGuardar", { error: String(e) }));
      setSheet(null);
    }
  }

  /* "N movimientos" por categoría (handoff de iPad): una sola consulta
     agrupada y no una por fila, que serían veinte para pintar una lista. */
  const [conteos, setConteos] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelado = false;
    conteoPorCategoria(church.id)
      .then((c) => { if (!cancelado) setConteos(c); })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);
  /** Con la MISMA clave que guarda `transactions.categoria`: el id del
   *  catálogo, o la referencia de la personalizada. */
  const conteoDe = (c: CategoriaUI) => conteos[c.custom && c.uid ? customCatRef(c.uid) : c.id] ?? 0;

  const Grupo = ({ tipo, lista }: { tipo: Kind; lista: CategoriaUI[] }) => (
    <div className="ios-group">
      {lista.map((c) => (
        <CategoryRow
          key={c.id}
          cat={c}
          activo={gesto}
          conteo={conteoDe(c)}
          onPress={() => abrirEditar(c)}
          onDelete={() => pedirBorrar(c)}
        />
      ))}
      <button type="button" className="ios-new-row" onClick={() => setSheet({ mode: "new", tipo })}>
        <span className="ios-new-icon" aria-hidden="true">
          <svg viewBox="0 0 13 13"><path d="M6.5 1.5v10M1.5 6.5h10" /></svg>
        </span>
        <span>{tipo === "ingreso" ? t("categorias.nuevaIngreso") : t("categorias.nuevaEgreso")}</span>
      </button>
    </div>
  );

  return (
    <div className="ios-form">
      <Section header={t("charts.ingresos")}>
        <Grupo tipo="ingreso" lista={ingresos} />
      </Section>

      <Section header={t("charts.gastos")} footer={errorLista ?? t("categorias.hint")}>
        <Grupo tipo="gasto" lista={gastos} />
      </Section>

      {sheet && (
        <CategorySheet
          initial={editing}
          tipoInicial={sheet.mode === "new" ? sheet.tipo : editingKind ?? "gasto"}
          tipoBloqueado={sheet.mode === "edit" ? sheet.tipoBloqueado : false}
          nombresExistentes={nombresExistentes}
          onCancel={() => setSheet(null)}
          onSave={guardarSheet}
          onDelete={
            editing
              ? () => { setSheet(null); pedirBorrar(editing); }
              : undefined
          }
        />
      )}

      {confirm && (
        <ActionSheet
          title={t("categorias.eliminarMensaje", { nombre: confirm.nombre })}
          options={[{ label: t("categorias.borrarCategoria"), danger: true, onClick: confirmarBorrar }]}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
