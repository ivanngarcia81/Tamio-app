/**
 * InstitucionSettingsIOS.tsx — pantalla "Institución" con el patrón de
 * formulario plano de iOS, SOLO para iPhone. Mac/iPad siguen usando
 * `InstitucionSettings.tsx` sin cambios. Misma lógica que ese archivo
 * (sin validación propia, tal como estaba) — esto es una reescritura del
 * MARCADO, no del comportamiento.
 */
import { useTranslation } from "react-i18next";
import type { EstadoGuardado } from "./GuardadoChip";
import type { InstitucionFormValues } from "./InstitucionSettings";
import { Section, TextField } from "../ios/FormularioIOS";

interface Props {
  estado?: EstadoGuardado;
  value: InstitucionFormValues;
  onChange: (patch: Partial<InstitucionFormValues>) => void;
  /** El nombre de la iglesia vive en la zona «Iglesia», pero es el primer
   *  renglón del membrete: sin él la vista previa no se entiende. */
  churchNombre?: string;
}

export default function InstitucionSettingsIOS({ value, onChange, churchNombre }: Props) {
  const { t } = useTranslation();
  /* Las dos líneas del membrete, armadas como las arma el PDF: lo vacío no
     deja renglón, se cierra. Es la regla que explica el pie del grupo, y
     verla funcionando aquí vale más que leerla. */
  const lineaDir = [value.direccion, value.region].filter((x) => x && x.trim()).join(" · ");
  const lineaContacto = [value.telefono, value.email].filter((x) => x && x.trim()).join(" · ");
  return (
    <div className="ios-form">
      {/* El membrete de verdad, a escala. Es la única forma de que se entienda
          para qué sirven estos campos —y hace innecesario cualquier texto que
          lo explique (maqueta S4). */}
      <section className="ios-section">
        <div className="ios-membrete">
          <span className="im-nombre">{churchNombre || t("iglesia.nombreLabel")}</span>
          {lineaDir && <span className="im-linea">{lineaDir}</span>}
          {lineaContacto && <span className="im-linea">{lineaContacto}</span>}
          <span className="im-raya" aria-hidden="true" />
        </div>
        <p className="ios-section-footer">{t("institucion.membretePie")}</p>
      </section>

      {/* Todos los valores de esta zona son direcciones y razones sociales
          —largos por naturaleza—, así que el grupo entero usa la fila
          invertida. Una sola forma para las siete filas, no cinco cortas y
          dos largas: dos formas en la misma tarjeta se leen como un error de
          maquetado antes que como una distinción. */}
      <Section header={t("institucion.datosMembrete")} footer={t("institucion.vacioNoImprime")}>
        <TextField
          label={t("institucion.direccion")}
          value={value.direccion}
          onChange={(v) => onChange({ direccion: v })}
          placeholder={t("institucion.direccionPlaceholder")}
          stacked
        />
        <TextField
          label={t("institucion.region")}
          value={value.region}
          onChange={(v) => onChange({ region: v })}
          placeholder={t("institucion.regionPlaceholder")}
          stacked
        />
        <TextField
          label={t("institucion.telefono")}
          value={value.telefono}
          onChange={(v) => onChange({ telefono: v })}
          placeholder={t("institucion.telefonoPlaceholder")}
          stacked
        />
        <TextField
          label={t("institucion.correo")}
          value={value.email}
          onChange={(v) => onChange({ email: v })}
          placeholder={t("institucion.correoPlaceholder")}
          type="email"
          stacked
        />
        <TextField
          label={t("institucion.pie")}
          value={value.pie_institucional}
          onChange={(v) => onChange({ pie_institucional: v })}
          placeholder={t("institucion.piePlaceholder")}
          optional
          stacked
        />
        <TextField
          label={t("institucion.secretariaNombre")}
          value={value.secretaria_nombre}
          onChange={(v) => onChange({ secretaria_nombre: v })}
          placeholder={t("institucion.secretariaNombrePlaceholder")}
          stacked
        />
        <TextField
          label={t("institucion.secretariaCargo")}
          value={value.secretaria_cargo}
          onChange={(v) => onChange({ secretaria_cargo: v })}
          placeholder={t("institucion.secretariaCargoPlaceholder")}
          stacked
        />
      </Section>
    </div>
  );
}
