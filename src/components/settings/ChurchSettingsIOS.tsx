/**
 * ChurchSettingsIOS.tsx — pantalla "Iglesia" con el patrón de formulario
 * plano de iOS, SOLO para iPhone (ver `enIPhone` en Configuracion.tsx).
 * Mac/iPad siguen usando `ChurchSettings.tsx` sin cambios.
 *
 * Mismo estado, validación y guardado automático que `ChurchSettings.tsx`
 * (las props son idénticas a propósito): esto es una reescritura del
 * MARCADO, no de la lógica.
 */
import { useEffect, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { mkdir, readFile, writeFile } from "@tauri-apps/plugin-fs";
import { CARPETA_IMAGENES, rutaEnDatos } from "../../services/archivos";
import { appDataDir, join } from "@tauri-apps/api/path";
import { useTranslation } from "react-i18next";
import { IconBuilding } from "../../icons";
import { currentLang } from "../../i18n";
import { CURRENCIES, currencyLabel } from "../../currencies";
import { esIPad } from "../../movil";
import { fmtMoney } from "../../db";
import { UMBRAL_COMPROBANTE } from "../../services/bandeja/alertas";
import { SwitchField } from "../ios/FormularioIOS";
import { convertirImagenAPng } from "../../services/imagenLogo";
import type { EstadoGuardado } from "./GuardadoChip";
import type { ChurchFormValues } from "./ChurchSettings";
import { PickerField, Section, TextField } from "../ios/FormularioIOS";
import IOSPickerSheet from "../ios/IOSPickerSheet";
import ActionSheet from "../ActionSheet";

interface Props {
  value: ChurchFormValues;
  estado?: EstadoGuardado;
  onChange: (patch: Partial<ChurchFormValues>) => void;
  error?: string | null;
  saldoError?: string | null;
  /** Aviso del umbral de comprobante, cuando lo escrito no es un importe. */
  umbralError?: string | null;
  logoPath: string | null;
  onLogoPathChange: (path: string | null) => void;
  showCurrency?: boolean;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export default function ChurchSettingsIOS({
  value, onChange, error, saldoError, umbralError, logoPath, onLogoPathChange, showCurrency = true,
}: Props) {
  const { t } = useTranslation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoMenuAbierto, setLogoMenuAbierto] = useState(false);
  const [monedaAbierta, setMonedaAbierta] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!logoPath) {
      setPreviewUrl(null);
      return;
    }
    rutaEnDatos(logoPath).then(readFile)
      .then((bytes) => {
        if (cancelled) return;
        setPreviewUrl(`data:image/png;base64,${uint8ToBase64(bytes)}`);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  async function pickLogo() {
    setLogoError(null);
    try {
      const selected = await openFileDialog({
        multiple: false,
        title: t("iglesia.seleccionarLogo"),
        filters: [{ name: t("iglesia.imagen"), extensions: ["png", "jpg", "jpeg", "heic", "heif", "webp"] }],
      });
      if (typeof selected !== "string") return;
      const bytes = await readFile(selected);
      const pngBytes = await convertirImagenAPng(bytes, selected);
      const relativa = `${CARPETA_IMAGENES}/logo-${Date.now()}.png`;
      const carpeta = await join(await appDataDir(), CARPETA_IMAGENES);
      await mkdir(carpeta, { recursive: true });
      await writeFile(await join(await appDataDir(), relativa), pngBytes);
      onLogoPathChange(relativa);
    } catch (e) {
      setLogoError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  return (
    <div className="ios-form">
      <Section footer={logoError ?? t("iglesia.logoHint")}>
        <button
          type="button"
          className="ios-field ios-field--link ios-field--avatar"
          onClick={() => (previewUrl ? setLogoMenuAbierto(true) : pickLogo())}
        >
          <span className="ios-field-label">{t("iglesia.logoFila")}</span>
          <span className="ios-field-value" />
          <span className="ios-avatar">
            {previewUrl ? <img src={previewUrl} alt={t("iglesia.logoAlt")} /> : <IconBuilding size={20} />}
          </span>
        </button>
      </Section>

      <Section header={t("iglesia.titulo")} footer={t("iglesia.einHint")}>
        <TextField label={t("iglesia.nombreLabel")} value={value.nombre} onChange={(v) => onChange({ nombre: v })} error={error} />
        <TextField label={t("iglesia.ciudad")} value={value.ciudad} onChange={(v) => onChange({ ciudad: v })} optional />
        <TextField
          label={t("iglesia.estadoProvincia")}
          value={value.estadoProvincia}
          onChange={(v) => onChange({ estadoProvincia: v })}
          optional
        />
        <TextField label={t("iglesia.pais")} value={value.pais} onChange={(v) => onChange({ pais: v })} optional />
        <TextField
          label={t("iglesia.codigoPostal")}
          value={value.codigoPostal}
          onChange={(v) => onChange({ codigoPostal: v })}
          optional
        />
        <TextField
          label={t("iglesia.ein")}
          value={value.ein}
          onChange={(v) => onChange({ ein: v })}
          optional
          stacked
        />
      </Section>

      {showCurrency && (
        <Section header={t("iglesia.moneda")} footer={t("iglesia.saldoInicialHint")}>
          <PickerField
            label={t("iglesia.moneda")}
            value={currencyLabel(value.moneda, currentLang())}
            onPress={() => setMonedaAbierta(true)}
          />
          <TextField
            label={t("iglesia.saldoInicial")}
            value={value.saldoInicial}
            onChange={(v) => onChange({ saldoInicial: v })}
            placeholder="0.00"
            inputMode="decimal"
            error={saldoError}
          />
        </Section>
      )}

      {/* ---- Controles de tesorería (handoff 1) ----
          Los cuatro que el handoff 1 dibujaba aquí. Empezaron pintados y
          apagados con su explicación (23 ago); con la migración 45 el grupo
          se parte en dos mitades que ya no se parecen:

            · **Los dos avisos, con motor.** El del comprobante y el de
              duplicados describían algo que la app YA hacía —`alertas.ts`— y
              lo único que faltaba era poder cambiarlo. Ahora se encienden, se
              apagan y el umbral se escribe, y lo que se cambia llega a Por
              revisar de verdad.
            · **Los otros dos NO son deuda, son decisiones**, y por eso se
              quedan apagados diciendo qué se decidió: la doble firma es la
              opción que Iván no eligió (constancia, no acuse), y el mes se
              cierra por calendario — "último domingo" no es un ajuste, es
              otra forma de contar (`services/inicio/periodo.ts`).

          Solo iPad, y solo con tesorería a la vista. */}
      {esIPad() && showCurrency && (
        <Section
          header={t("controlesTesoreria.titulo")}
          footer={t("controlesTesoreria.hint")}
        >
          {/* Los dos primeros, con motor desde la migración 45. Iban
              encendidos y apagados como mando —describían algo que la app ya
              hacía y no se podía cambiar—; ahora se cambian, y lo que se
              cambia LLEGA a Por revisar (`services/bandeja/alertas.ts`). */}
          <SwitchField
            label={t("controlesTesoreria.comprobante")}
            sub={t("controlesTesoreria.comprobanteSub")}
            checked={value.avisarSinComprobante}
            onChange={(v) => onChange({ avisarSinComprobante: v })}
          />
          {/* El importe solo se pide cuando el aviso está encendido: un umbral
              para un aviso apagado es un campo que no significa nada. Vacío
              vuelve a la constante, y el pie lo dice con su cifra en vez de
              dejarlo a la adivinanza. */}
          {value.avisarSinComprobante && (
            <TextField
              label={t("controlesTesoreria.comprobanteDesde")}
              value={value.umbralComprobante}
              onChange={(v) => onChange({ umbralComprobante: v })}
              placeholder={fmtMoney(UMBRAL_COMPROBANTE)}
              inputMode="decimal"
              error={umbralError}
            />
          )}
          <SwitchField
            label={t("controlesTesoreria.duplicados")}
            sub={t("controlesTesoreria.duplicadosSub")}
            checked={value.avisarDuplicados}
            onChange={(v) => onChange({ avisarDuplicados: v })}
          />
          {/* Los dos de abajo NO son ajustes pendientes, son decisiones:
              · Doble firma — Iván eligió constancia (se anota a quién se le
                entregó el corte) y no acuse (que el que recibe confirme). El
                interruptor se queda apagado enseñando la opción que no se
                tomó, no un hueco.
              · Cierre de mes — la app cierra por mes natural (ver
                `services/inicio/periodo.ts`, y ahí está el porqué); "último
                domingo" no es una opción, es otra forma de contar. */}
          {/* **Encendido desde la migración 47.** Es la POLÍTICA: los cortes
              nacen pidiendo la segunda firma o no. La hoja del corte puede
              cambiarlo suelto — el handoff dibuja un control en cada sitio y
              ahora los dos significan algo. */}
          <SwitchField
            label={t("controlesTesoreria.dobleFirma")}
            sub={t("controlesTesoreria.dobleFirmaSub")}
            checked={value.pedirDobleFirma}
            onChange={(v) => onChange({ pedirDobleFirma: v })}
          />
          <div className="ios-field ios-field--apagado" title={t("controlesTesoreria.cierreMesSub")}>
            <span className="ios-field-textos">
              <span className="ios-field-label">{t("controlesTesoreria.cierreMes")}</span>
              <span className="ios-field-sub">{t("controlesTesoreria.cierreMesSub")}</span>
            </span>
            <span className="ios-field-value">{t("controlesTesoreria.cierreMesValor")}</span>
          </div>
          <p className="ios-section-footer ios-pie-suelto">
            {t("controlesTesoreria.comprobanteDesdePie", { monto: `${fmtMoney(UMBRAL_COMPROBANTE)} ${value.moneda}` })}
          </p>
        </Section>
      )}

      {logoMenuAbierto && (
        <ActionSheet
          options={[
            { label: t("iglesia.cambiarLogo"), onClick: () => { setLogoMenuAbierto(false); pickLogo(); } },
            { label: t("iglesia.eliminarLogo"), danger: true, onClick: () => { setLogoMenuAbierto(false); onLogoPathChange(null); } },
          ]}
          onCancel={() => setLogoMenuAbierto(false)}
        />
      )}

      {monedaAbierta && (
        <IOSPickerSheet
          title={t("iglesia.moneda")}
          value={value.moneda}
          options={CURRENCIES.map((c) => ({ value: c.code, label: currencyLabel(c.code, currentLang()) }))}
          onSelect={(v) => { onChange({ moneda: v }); setMonedaAbierta(false); }}
          onCancel={() => setMonedaAbierta(false)}
        />
      )}
    </div>
  );
}
