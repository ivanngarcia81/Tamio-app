import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  catNombre, countTxByCategoria, customCatRef, deleteCategoriaCustom, getCategoriasGasto,
  getCategoriasIngreso, insertCategoriaCustom, type Church,
} from "../../db";
import ConfirmDialog from "../ConfirmDialog";
import { showToast } from "../../toast";
import { playSound } from "../../sound";
import { IconClose, IconPlus, IconTag, IconWarn } from "../../icons";

/** Paleta para categorías nuevas — colores con buen contraste en claro y oscuro. */
const COLORES = ["#0369a1", "#0f766e", "#4d7c0f", "#92400e", "#9a3412", "#9f1239", "#86198f", "#3730a3"];

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

  return (
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
                <span key={c.id} className={`tag ${c.tagClass}`} style={{ opacity: 0.75 }}>
                  {catNombre(c.id)}
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

      <div className="form-hint" style={{ marginTop: 12 }}>{t("categorias.hint")}</div>

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
  );
}
