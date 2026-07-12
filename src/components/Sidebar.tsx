import { NavLink } from "react-router-dom";
import type { Church } from "../db";
import {
  IconLogo, IconHome, IconIngreso, IconGasto, IconMiembros,
  IconReportes, IconBandeja, IconConfig, IconChevronDown,
} from "../icons";

interface Props {
  church: Church;
  memberCount: number;
  pendingCount: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}

export default function Sidebar({ church, memberCount, pendingCount, theme, onToggleTheme }: Props) {
  const initials = church.nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || church.nombre.slice(0, 2).toUpperCase();

  return (
    <aside className="sidebar">
      <div className="logo" title="Tesorería"><IconLogo /></div>

      <div className="church-select">
        <div className="church-avatar">{initials}</div>
        <div>
          <div className="church-name">{church.nombre}</div>
          <span className="church-sub">{church.ciudad || "—"}</span>
        </div>
        <span style={{ color: "var(--text-3)" }}><IconChevronDown /></span>
      </div>

      <nav className="nav">
        <NavLink to="/" end className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconHome /></span>
          Inicio
        </NavLink>
        <NavLink to="/ingresos" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconIngreso /></span>
          Ingresos
        </NavLink>
        <NavLink to="/gastos" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconGasto /></span>
          Gastos
        </NavLink>
        <NavLink to="/miembros" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconMiembros /></span>
          Miembros
          {memberCount > 0 && <span className="badge">{memberCount}</span>}
        </NavLink>
        <NavLink to="/reportes" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconReportes /></span>
          Reportes
        </NavLink>
        <NavLink to="/bandeja" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconBandeja /></span>
          Bandeja
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/configuracion" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconConfig /></span>
          Configuración
        </NavLink>
        <div className="theme-toggle" onClick={onToggleTheme}>
          <span>Modo oscuro</span>
          <div className={`switch${theme === "dark" ? " is-on" : ""}`} />
        </div>
      </div>
    </aside>
  );
}
