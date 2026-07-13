import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { readFile } from "@tauri-apps/plugin-fs";
import type { Church } from "../db";
import {
  IconLogo, IconHome, IconIngreso, IconGasto, IconMiembros,
  IconReportes, IconBandeja, IconBank, IconConfig, IconChevronDown,
} from "../icons";

interface Props {
  church: Church;
  memberCount: number;
  pendingCount: number;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function Sidebar({ church, memberCount, pendingCount }: Props) {
  const initials = church.nombre
    .split(" ")
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || church.nombre.slice(0, 2).toUpperCase();

  const [logoUrl, setLogoUrl] = useState<string | null>(null);

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

  return (
    <aside className="sidebar">
      <div className="logo" title="Tesorería"><IconLogo /></div>

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
        <NavLink to="/depositos" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconBank /></span>
          Depósito bancario
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/bandeja" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconBandeja /></span>
          Bandeja
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
        </NavLink>
        <NavLink to="/configuracion" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="icon"><IconConfig /></span>
          Configuración
        </NavLink>
      </div>
    </aside>
  );
}
