import { useTranslation } from "react-i18next";
import { IconIdBadge, IconMiembros, IconUser } from "../../icons";
import type { Role } from "../../role";

interface Props {
  value: Role;
  onChange: (r: Role) => void;
}

const ICONO_POR_ROL: Record<Role, typeof IconUser> = {
  administrador: IconMiembros,
  tesorero: IconUser,
  secretaria: IconIdBadge,
};

/** Selector de rol en modo local (sin login): decide qué áreas ve esta
 *  instalación. El administrador ve todo; tesorero y secretaria solo su área.
 *  Con Supabase el rol lo fija el servidor y esta tarjeta no se muestra. */
export default function RoleSettings({ value, onChange }: Props) {
  const { t } = useTranslation();
  const opciones: { id: Role; label: string }[] = [
    { id: "administrador", label: t("rol.administrador") },
    { id: "tesorero", label: t("rol.tesorero") },
    { id: "secretaria", label: t("rol.secretaria") },
  ];

  return (
    /* El pie de nota explica el bloque entero, así que vive FUERA de la caja
       —es lo que hace Ajustes del Sistema— y por eso hay un envoltorio: la
       tarjeta es la raíz del componente y sin él la nota no podría ser su
       hermana. Ver `.settings-bloque` en styles.css. */
    <div className="settings-bloque">
      <div className="card pad-lg settings-card">
        <div className="card-head">
          <div className="card-head-left">
            <div className="card-icon"><IconUser size={16} /></div>
            <div className="card-head-titles">
              <div className="card-title-lg">{t("rolConfig.titulo")}</div>
              <div className="card-title-sub">{t("rolConfig.sub")}</div>
            </div>
          </div>
        </div>

        <div className="tabs-segmented" style={{ marginBottom: 10 }}>
          {opciones.map((opt) => {
            const Icono = ICONO_POR_ROL[opt.id];
            return (
              <button type="button" key={opt.id} className={`seg${value === opt.id ? " active" : ""}`} aria-pressed={value === opt.id} onClick={() => onChange(opt.id)}>
                <Icono size={14} strokeWidth={2} /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <p className="settings-nota">{t("rolConfig.hint")}</p>
    </div>
  );
}
