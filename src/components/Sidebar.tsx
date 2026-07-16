import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { readFile } from "@tauri-apps/plugin-fs";
import { useTranslation } from "react-i18next";
import type { Church } from "../db";
import type { Role } from "../role";
import {
  IconBandeja, IconBank, IconBookOpen, IconCalendar, IconChevronDown,
  IconClipboardList, IconConfig, IconFileText, IconGasto,
  IconHome, IconIdBadge, IconIngreso, IconLogout, IconMail, IconMiembros, IconReportes, IconTamio,
} from "../icons";

interface Props {
  church: Church;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
  role: Role;
  /** Con login activo se muestra el correo de la sesión y el botón de salir. */
  authActivo?: boolean;
  sesionEmail?: string | null;
  onSalir?: () => void;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

type GroupId = "tesoreria" | "secretaria";

const GROUPS_KEY = "tesoreria-nav-groups";
const RUTAS_TESORERIA = ["/ingresos", "/gastos", "/miembros", "/reportes", "/depositos"];
const RUTAS_SECRETARIA = ["/membresia", "/actas", "/servicios", "/cartas", "/reporte-miembros", "/agenda"];

function initialOpen(): Record<GroupId, boolean> {
  try {
    const saved = localStorage.getItem(GROUPS_KEY);
    if (saved) return { tesoreria: true, secretaria: true, ...JSON.parse(saved) };
  } catch { /* noop */ }
  return { tesoreria: true, secretaria: true };
}

function Item({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink to={to} end={to === "/"} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
      <span className="icon">{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && <span className="badge">{badge}</span>}
    </NavLink>
  );
}

function Grupo({ abierto, etiqueta, onToggle, children }: {
  abierto: boolean;
  etiqueta: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`nav-group${abierto ? "" : " closed"}`}>
      <button type="button" className="nav-group-head" onClick={onToggle} aria-expanded={abierto}>
        {etiqueta}
        <span className="chev"><IconChevronDown size={12} strokeWidth={2.2} /></span>
      </button>
      <div className="nav-group-body">
        <div className="nav-group-items">{children}</div>
      </div>
    </div>
  );
}

export default function Sidebar({ church, memberCount, pendingCount, unreadCount, role, authActivo, sesionEmail, onSalir }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  // Separación estricta de funciones:
  // - La secretaria solo ve Secretaría + el Reporte de Tesorería.
  // - El tesorero solo ve Tesorería (no el grupo de Secretaría).
  const esSecretaria = role === "secretaria";
  const esTesorero = role === "tesorero";
  const initials = church.nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || church.nombre.slice(0, 2).toUpperCase();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<GroupId, boolean>>(initialOpen);

  useEffect(() => {
    let cancelled = false;
    if (!church.logo_path) {
      setLogoUrl(null);
      return;
    }
    readFile(church.logo_path)
      .then((bytes) => {
        if (cancelled) return;
        setLogoUrl(`data:image/png;base64,${uint8ToBase64(bytes)}`);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [church.logo_path]);

  // El grupo que contiene la ruta activa se abre solo: el usuario nunca
  // "pierde" la página en la que está detrás de un menú cerrado.
  useEffect(() => {
    const grupo: GroupId | null = RUTAS_TESORERIA.includes(location.pathname)
      ? "tesoreria"
      : RUTAS_SECRETARIA.includes(location.pathname)
        ? "secretaria"
        : null;
    if (grupo) setOpen((o) => (o[grupo] ? o : { ...o, [grupo]: true }));
  }, [location.pathname]);

  function toggle(g: GroupId) {
    setOpen((o) => {
      const next = { ...o, [g]: !o[g] };
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <aside className="sidebar">
      {/* Muestra el logo de la iglesia (Configuración → Subir logo) en cuanto
          existe; mientras tanto una capilla atenuada hace de placeholder. */}
      <div className={`logo${logoUrl ? "" : " placeholder"}`} title={logoUrl ? church.nombre : "Tamio"}>
        {logoUrl ? <img src={logoUrl} alt={church.nombre} /> : <IconTamio size={44} />}
      </div>

      <div className="church-select">
        <div className="church-avatar">
          {logoUrl ? <img src={logoUrl} alt="" /> : initials}
        </div>
        <div className="church-info">
          <div className="church-name" title={church.nombre}>{church.nombre}</div>
          <span className="church-sub">{church.ciudad || "—"}</span>
        </div>
        <span className="church-chevron" style={{ color: "var(--text-3)" }}><IconChevronDown /></span>
      </div>

      <nav className="nav">
        <Item to="/" icon={<IconHome />} label={t("nav.inicio")} />

        <Grupo abierto={open.tesoreria} etiqueta={t("nav.grupoTesoreria")} onToggle={() => toggle("tesoreria")}>
          {!esSecretaria && <Item to="/ingresos" icon={<IconIngreso />} label={t("nav.ingresos")} />}
          {!esSecretaria && <Item to="/gastos" icon={<IconGasto />} label={t("nav.gastos")} />}
          {!esSecretaria && <Item to="/miembros" icon={<IconMiembros />} label={t("nav.miembros")} badge={memberCount} />}
          <Item to="/reportes" icon={<IconReportes />} label={t("nav.reportes")} />
          {!esSecretaria && <Item to="/depositos" icon={<IconBank />} label={t("nav.depositos")} />}
        </Grupo>

        {!esTesorero && (
          <Grupo abierto={open.secretaria} etiqueta={t("nav.grupoSecretaria")} onToggle={() => toggle("secretaria")}>
            <Item to="/membresia" icon={<IconIdBadge size={18} />} label={t("nav.membresia")} />
            <Item to="/actas" icon={<IconFileText size={18} />} label={t("nav.actas")} />
            <Item to="/servicios" icon={<IconBookOpen />} label={t("nav.servicios")} />
            <Item to="/cartas" icon={<IconMail />} label={t("nav.cartas")} />
            <Item to="/reporte-miembros" icon={<IconClipboardList />} label={t("nav.reporteMiembros")} />
            <Item to="/agenda" icon={<IconCalendar />} label={t("nav.agenda")} />
          </Grupo>
        )}
      </nav>

      <div className="sidebar-footer">
        <Item to="/inbox" icon={<IconMail />} label={t("nav.inbox")} badge={unreadCount} />
        {!esSecretaria && <Item to="/bandeja" icon={<IconBandeja />} label={t("nav.porRevisar")} badge={pendingCount} />}
        <Item to="/configuracion" icon={<IconConfig />} label={t("nav.configuracion")} />
        {authActivo && (
          <>
            {sesionEmail && <div className="sidebar-session-email" title={sesionEmail}>{sesionEmail}</div>}
            <button type="button" className="nav-item nav-signout" onClick={onSalir}>
              <span className="icon"><IconLogout /></span>
              {t("login.salir")}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
