import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listMembers, type Church, type Member } from "../db";
import type { Role } from "../role";
import { puedeVer } from "../role";
import { rutaPermitidaPorPlan } from "../plan";
import { authHabilitado } from "../supabase";
import { ejecutarSync } from "../syncManager";
import { showToast } from "../toast";

interface Props {
  church: Church;
  role: Role;
  onClose: () => void;
  onNavigate: (ruta: string) => void;
  /** Abre el modal de nuevo registro en la pestaña indicada. */
  onNuevo: (tab: "ingreso" | "gasto" | "miembro") => void;
  onEditMember: (m: Member) => void;
}

interface Item {
  id: string;
  seccion: "nav" | "accion" | "miembro";
  label: string;
  detalle?: string;
  run: () => void;
}

/** Quita acentos y pasa a minúsculas para comparar sin fricción. */
function plano(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const NAV: Array<{ ruta: string; clave: string }> = [
  { ruta: "/", clave: "nav.inicio" },
  { ruta: "/ingresos", clave: "nav.ingresos" },
  { ruta: "/gastos", clave: "nav.gastos" },
  { ruta: "/miembros", clave: "nav.miembros" },
  { ruta: "/reportes", clave: "nav.reportes" },
  { ruta: "/depositos", clave: "nav.depositos" },
  { ruta: "/membresia", clave: "nav.membresia" },
  { ruta: "/actas", clave: "nav.actas" },
  { ruta: "/servicios", clave: "nav.servicios" },
  { ruta: "/cartas", clave: "nav.cartas" },
  { ruta: "/reporte-miembros", clave: "nav.reporteMiembros" },
  { ruta: "/agenda", clave: "nav.agenda" },
  { ruta: "/inbox", clave: "nav.inbox" },
  { ruta: "/bandeja", clave: "nav.porRevisar" },
  { ruta: "/ayuda", clave: "nav.ayuda" },
  { ruta: "/configuracion", clave: "nav.configuracion" },
];

export default function CmdPalette({ church, role, onClose, onNavigate, onNuevo, onEditMember }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [miembros, setMiembros] = useState<Member[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Los miembros se cargan una vez al abrir (búsqueda instantánea después).
  useEffect(() => {
    listMembers(church.id).then(setMiembros).catch(() => {});
  }, [church.id]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const items = useMemo<Item[]>(() => {
    const q = plano(query.trim());
    const out: Item[] = [];

    // Navegación (respeta rol y plan; el guard de rutas es la red de seguridad).
    for (const n of NAV) {
      if (!puedeVer(role, n.ruta) || !rutaPermitidaPorPlan(church.plan, n.ruta)) continue;
      const label = t(n.clave);
      if (q && !plano(label).includes(q)) continue;
      out.push({ id: `nav${n.ruta}`, seccion: "nav", label, run: () => onNavigate(n.ruta) });
    }

    // Acciones rápidas.
    const acciones: Array<{ id: string; label: string; visible: boolean; run: () => void }> = [
      { id: "nuevo-ingreso", label: t("cmdk.nuevoIngreso"), visible: role !== "secretaria", run: () => onNuevo("ingreso") },
      { id: "nuevo-gasto", label: t("cmdk.nuevoGasto"), visible: role !== "secretaria", run: () => onNuevo("gasto") },
      { id: "nuevo-miembro", label: t("cmdk.nuevoMiembro"), visible: true, run: () => onNuevo("miembro") },
      {
        id: "sync", label: t("cmdk.sincronizar"), visible: authHabilitado,
        run: () => { void ejecutarSync(); showToast(t("cmdk.sincronizando")); },
      },
    ];
    for (const a of acciones) {
      if (!a.visible) continue;
      if (q && !plano(a.label).includes(q)) continue;
      out.push({ id: a.id, seccion: "accion", label: a.label, run: a.run });
    }

    // Miembros: solo con 2+ letras, para no inundar la lista.
    if (q.length >= 2) {
      for (const m of miembros.filter((x) => plano(x.nombre).includes(q)).slice(0, 6)) {
        out.push({
          id: `m${m.id}`,
          seccion: "miembro",
          label: m.nombre,
          detalle: m.telefono ?? m.email ?? undefined,
          run: () => onEditMember(m),
        });
      }
    }
    return out.slice(0, 14);
  }, [query, miembros, role, church.plan, t, onNavigate, onNuevo, onEditMember]);

  useEffect(() => { setSel(0); }, [query]);

  function ejecutar(i: Item) {
    onClose();
    i.run();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter" && items[sel]) { e.preventDefault(); ejecutar(items[sel]); }
  }

  // El seleccionado se mantiene a la vista al navegar con flechas.
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  let seccionPrevia: string | null = null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-label={t("cmdk.titulo")}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder={t("cmdk.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmdk-list" ref={listRef}>
          {items.length === 0 && <div className="cmdk-vacio">{t("cmdk.sinResultados")}</div>}
          {items.map((i, idx) => {
            const cabecera = i.seccion !== seccionPrevia
              ? <div className="cmdk-seccion" key={`h-${i.seccion}`}>{t(`cmdk.seccion.${i.seccion}`)}</div>
              : null;
            seccionPrevia = i.seccion;
            return (
              <div key={i.id}>
                {cabecera}
                <div
                  className={`cmdk-item${idx === sel ? " sel" : ""}`}
                  data-idx={idx}
                  onMouseEnter={() => setSel(idx)}
                  onMouseDown={(e) => { e.preventDefault(); ejecutar(i); }}
                >
                  <span className="cmdk-label">{i.label}</span>
                  {i.detalle && <span className="cmdk-detalle">{i.detalle}</span>}
                  {idx === sel && <span className="cmdk-kbd">↵</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="cmdk-pie">
          <span><b>↑↓</b> {t("cmdk.pieNavegar")}</span>
          <span><b>↵</b> {t("cmdk.pieAbrir")}</span>
          <span><b>esc</b> {t("cmdk.pieCerrar")}</span>
        </div>
      </div>
    </div>
  );
}
