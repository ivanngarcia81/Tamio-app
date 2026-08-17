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
}

export default function InstitucionSettingsIOS({ value, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="ios-form">
      <Section header={t("institucion.titulo")} footer={t("config.zona.institucionSub")}>
        <TextField
          label={t("institucion.direccion")}
          value={value.direccion}
          onChange={(v) => onChange({ direccion: v })}
          stacked
        />
        <TextField label={t("institucion.region")} value={value.region} onChange={(v) => onChange({ region: v })} />
        <TextField label={t("institucion.telefono")} value={value.telefono} onChange={(v) => onChange({ telefono: v })} />
        <TextField
          label={t("institucion.correo")}
          value={value.email}
          onChange={(v) => onChange({ email: v })}
          type="email"
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
        />
        <TextField
          label={t("institucion.secretariaCargo")}
          value={value.secretaria_cargo}
          onChange={(v) => onChange({ secretaria_cargo: v })}
        />
      </Section>
    </div>
  );
}
