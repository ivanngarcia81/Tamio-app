import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { readFile } from "@tauri-apps/plugin-fs";
import { rutaEnDatos } from "../services/archivos";
import { useTranslation } from "react-i18next";
import type { Church } from "../db";
import type { Role } from "../role";
import { incluyeTesoreria, incluyeSecretaria } from "../plan";
import { iniciales } from "../services/avatar";
import SyncIndicator from "./SyncIndicator";
import {
  IconBandeja, IconBank, IconBookOpen, IconCalendar, IconChevronDown, IconChevronRight,
  IconClipboardList, IconConfig, IconFileText, IconGasto, IconHelp,
  IconHome, IconIdBadge, IconIngreso, IconLogout, IconMail, IconMiembros, IconReportes, IconTamio, IconUser,
} from "../icons";

interface Props {
  church: Church;
  memberCount: number;
  pendingCount: number;
  unreadCount: number;
  role: Role;
  /** Con login activo se muestra el perfil de la sesión y el botón de salir. */
  authActivo?: boolean;
  sesionEmail?: string | null;
  sesionNombre?: string | null;
  sesionFoto?: string | null;
  onEditarPerfil?: () => void;
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

/** El acordeón (un solo grupo abierto a la vez) es exclusivo del ancho
 *  compacto del iPhone. Se mide por viewport y NO por esMovil(): en iPad
 *  (>= 768 px) esMovil() es true pero hay sitio de sobra, y su
 *  comportamiento no debe cambiar. El umbral coincide con el breakpoint
 *  compacto del CSS. */
function anchoCompacto(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
}

function Item({ to, icon, label, badge, dataTour }: { to: string; icon: ReactNode; label: string; badge?: number; dataTour?: string }) {
  return (
    <NavLink to={to} end={to === "/"} data-tour={dataTour} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
      <span className="icon">{icon}</span>
      {label}
      {badge !== undefined && badge > 0 && <span className="badge">{badge}</span>}
    </NavLink>
  );
}

function Grupo({ abierto, etiqueta, onToggle, children, dataTour }: {
  abierto: boolean;
  etiqueta: string;
  onToggle: () => void;
  children: ReactNode;
  dataTour?: string;
}) {
  return (
    <div className={`nav-group${abierto ? "" : " closed"}`} data-tour={dataTour}>
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

export default function Sidebar({ church, memberCount, pendingCount, unreadCount, role, authActivo, sesionEmail, sesionNombre, sesionFoto, onEditarPerfil, onSalir }: Props) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // Separación estricta de funciones:
  // - La secretaria solo ve Secretaría + el Reporte de Tesorería.
  // - El tesorero solo ve Tesorería (no el grupo de Secretaría).
  const esSecretaria = role === "secretaria";
  const esTesorero = role === "tesorero";
  // Gate por plan de suscripción (además del gate por rol). Por defecto la
  // iglesia es "completo", así que esto no cambia nada salvo en planes por
  // módulo, donde oculta el área no contratada.
  const verGrupoTesoreria = incluyeTesoreria(church.plan);
  const verGrupoSecretaria = incluyeSecretaria(church.plan);
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
    rutaEnDatos(church.logo_path).then(readFile)
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
  // "pierde" la página en la que está detrás de un menú cerrado. En el
  // iPhone, además, se cierra el otro grupo (acordeón) para que la lista
  // quepa con menos scroll; en Mac/iPad solo se asegura de abrir el activo.
  useEffect(() => {
    const grupo: GroupId | null = RUTAS_TESORERIA.includes(location.pathname)
      ? "tesoreria"
      : RUTAS_SECRETARIA.includes(location.pathname)
        ? "secretaria"
        : null;
    if (!grupo) return;
    setOpen((o) => {
      if (anchoCompacto()) {
        return { tesoreria: grupo === "tesoreria", secretaria: grupo === "secretaria" };
      }
      return o[grupo] ? o : { ...o, [grupo]: true };
    });
  }, [location.pathname]);

  function toggle(g: GroupId) {
    setOpen((o) => {
      // En el iPhone los grupos son un acordeón: al abrir uno se cierra el
      // otro. En Mac/iPad cada grupo se abre y cierra por su cuenta (igual
      // que siempre).
      const abriendo = !o[g];
      const next: Record<GroupId, boolean> = anchoCompacto() && abriendo
        ? { tesoreria: g === "tesoreria", secretaria: g === "secretaria" }
        : { ...o, [g]: !o[g] };
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <aside className="sidebar">
      {/* Tarjeta de marca: logo de la iglesia (Configuración → Subir logo) o
          sus iniciales, con nombre y ciudad. Es el único bloque de identidad
          del sidebar (antes había además un logo grande duplicado arriba). */}
      <button
        type="button"
        className="church-select"
        data-tour="marca"
        onClick={() => navigate("/configuracion")}
        title={t("iglesia.abrirAjustes")}
      >
        <div className={`church-avatar${logoUrl ? "" : " ini"}`}>
          {logoUrl ? <img src={logoUrl} alt="" /> : (initials || <IconTamio size={26} />)}
        </div>
        <div className="church-info">
          <div className="church-name" title={church.nombre}>{church.nombre}</div>
          {church.ciudad && <span className="church-sub">{church.ciudad}</span>}
        </div>
        <span className="church-chevron"><IconChevronRight size={16} /></span>
      </button>

      <nav className="nav">
        <Item to="/" icon={<IconHome />} label={t("nav.inicio")} dataTour="inicio" />

        {verGrupoTesoreria && (
          <Grupo abierto={open.tesoreria} etiqueta={t("nav.grupoTesoreria")} onToggle={() => toggle("tesoreria")} dataTour="tesoreria">
            {!esSecretaria && <Item to="/ingresos" icon={<IconIngreso />} label={t("nav.ingresos")} />}
            {!esSecretaria && <Item to="/gastos" icon={<IconGasto />} label={t("nav.gastos")} />}
            {!esSecretaria && <Item to="/miembros" icon={<IconMiembros />} label={t("nav.miembros")} badge={memberCount} />}
            <Item to="/reportes" icon={<IconReportes />} label={t("nav.reportes")} />
            {!esSecretaria && <Item to="/depositos" icon={<IconBank />} label={t("nav.depositos")} />}
          </Grupo>
        )}

        {verGrupoSecretaria && !esTesorero && (
          <Grupo abierto={open.secretaria} etiqueta={t("nav.grupoSecretaria")} onToggle={() => toggle("secretaria")} dataTour="secretaria">
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
        {verGrupoTesoreria && !esSecretaria && <Item to="/bandeja" icon={<IconBandeja />} label={t("nav.porRevisar")} badge={pendingCount} />}
        <Item to="/ayuda" icon={<IconHelp />} label={t("nav.ayuda")} dataTour="ayuda" />
        <Item to="/configuracion" icon={<IconConfig />} label={t("nav.configuracion")} dataTour="config" />
        {authActivo && (
          <>
            <SyncIndicator />
            <button type="button" className="sidebar-perfil" onClick={onEditarPerfil} title={t("perfil.editar")}>
              <span className={`perfil-avatar${sesionFoto ? " tiene-foto" : ""}`}>
                {sesionFoto
                  ? <img src={sesionFoto} alt="" />
                  : (iniciales(sesionNombre ?? null, sesionEmail ?? null) || <IconUser size={16} />)}
              </span>
              <span className="sidebar-perfil-textos">
                {(sesionNombre && sesionNombre.trim()) && <span className="sidebar-perfil-nombre">{sesionNombre}</span>}
                {sesionEmail && <span className="sidebar-perfil-email" title={sesionEmail}>{sesionEmail}</span>}
              </span>
            </button>
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
