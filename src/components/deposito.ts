/**
 * deposito.ts — el estado y el guardado de un depósito bancario, sin una sola
 * línea de pintura.
 *
 * Vivía dentro de `DepositoModal.tsx`. Se sacó aquí cuando el teléfono dejó de
 * usar el modal de escritorio y pasó a una hoja de iOS: son dos formas de
 * enseñar el MISMO formulario, y con la lógica duplicada la segunda copia se
 * habría quedado atrás a la primera corrección.
 *
 * Aquí no se decide nada de aspecto. Los cuatro avisos contables —duplicado,
 * exceso de efectivo, período distinto de la fecha, y fecha/período futuros—
 * son los de siempre, movidos tal cual. Son la razón de ser de esta pantalla:
 * sin ellos es un formulario de ocho campos cualquiera.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  efectivoDisponibleHasta, findDuplicateDeposito, fmtMoney, insertDeposito,
  listDepositos, nowLocalIso, updateDeposito,
  type Church, type Deposito,
} from "../db";
import { guardarComprobante } from "../services/comprobantes";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { CERO, aTextoTecleado, deTextoTecleado, maximo, type Centavos } from "../dinero";
import { currencySymbol } from "../currencies";

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Igual que en Nuevo movimiento: el parseo vive en `dinero.ts` y aquí
 *  solo queda la regla de la pantalla (mayor que cero). */
export function parseMonto(s: string): Centavos | null {
  const c = deTextoTecleado(s);
  return c !== null && c > 0 ? c : null;
}

export interface PropsDeposito {
  church: Church;
  /** null = depósito nuevo. */
  editing: Deposito | null;
  onClose: () => void;
  onSaved: () => void;
}

/** Los campos que pueden bloquear el guardado (o avisar sin bloquear). */
export type CampoDeposito = "fecha" | "monto" | "cuenta" | "periodo";

export function useDeposito({ church, editing, onClose, onSaved }: PropsDeposito) {
  const { t } = useTranslation();
  const isEdit = editing !== null;
  const hoy = nowLocalIso().slice(0, 10);
  /** Mismo criterio que en Nuevo movimiento: el ejemplo lo escribe el mismo
   *  formateador que lee el campo. */
  const placeholderMonto = currencySymbol(church.moneda) + aTextoTecleado(CERO);

  const [fecha, setFecha] = useState(editing?.fecha.slice(0, 10) ?? hoy);
  const [periodo, setPeriodo] = useState(editing?.periodo ?? hoy.slice(0, 7));
  const [monto, setMonto] = useState(editing ? aTextoTecleado(editing.monto) : "");
  const [cuentaBanco, setCuentaBanco] = useState(editing?.cuenta_banco ?? "");
  const [referencia, setReferencia] = useState(editing?.referencia ?? "");
  const [notas, setNotas] = useState(editing?.notas ?? "");
  const [comprobantePath, setComprobantePath] = useState<string | null>(editing?.comprobante_path ?? null);
  const [periodoTocado, setPeriodoTocado] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Qué campo disparó el aviso, para que el iPhone pueda ponerlo al pie de SU
     sección en vez de todo junto al final. Mac sigue leyendo `error` y no se
     entera de esto. */
  const [campoError, setCampoError] = useState<CampoDeposito | null>(null);
  // Aviso no bloqueante: el primer Guardar advierte si el monto supera el
  // efectivo estimado en caja; el segundo procede (mismo patrón que el aviso
  // de miembros duplicados). Cambiar monto o fecha reinicia la confirmación.
  const [excedeConfirmado, setExcedeConfirmado] = useState(false);

  /* Las cuentas que ya se han usado. No hay catálogo de cuentas en la base
     —`cuenta_banco` es texto libre en cada depósito—, así que la lista se
     saca de lo ya registrado: quien deposita cada mes en la misma cuenta deja
     de teclearla, y quien estrena una la escribe igual que antes. */
  const [cuentasUsadas, setCuentasUsadas] = useState<string[]>([]);
  useEffect(() => {
    let cancelado = false;
    listDepositos(church.id)
      .then((ds) => {
        if (cancelado) return;
        const vistas = new Map<string, string>();
        for (const d of ds) {
          const nombre = d.cuenta_banco.trim();
          if (nombre && !vistas.has(nombre.toLowerCase())) vistas.set(nombre.toLowerCase(), nombre);
        }
        setCuentasUsadas([...vistas.values()]);
      })
      .catch(console.error);
    return () => { cancelado = true; };
  }, [church.id]);

  function onFechaChange(v: string) {
    setFecha(v);
    setExcedeConfirmado(false);
    if (!periodoTocado && v.length >= 7) setPeriodo(v.slice(0, 7));
  }

  function onMontoChange(v: string) {
    setMonto(v);
    setExcedeConfirmado(false);
  }

  function onPeriodoChange(v: string) {
    setPeriodo(v);
    setPeriodoTocado(true);
  }

  // Los totales y los reportes suman por PERÍODO, no por fecha. Los dos campos
  // pueden diferir a propósito (un depósito hecho en agosto con dinero de
  // julio), pero cuando difieren sin querer el depósito "desaparece" de los
  // totales del mes en que se ve la fecha. Se avisa, sin bloquear.
  const periodoDistinto = fecha.length >= 7 && periodo.length >= 7 && fecha.slice(0, 7) !== periodo;

  async function pickComprobante() {
    try {
      const path = await openFileDialog({
        multiple: false,
        title: t("depositos.seleccionarComprobante"),
        filters: [{ name: t("tx.comprobante"), extensions: ["pdf", "png", "jpg", "jpeg", "heic"] }],
      });
      if (typeof path === "string") setComprobantePath(path);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  async function guardar() {
    setError(null); setCampoError(null);
    const falla = (campo: CampoDeposito | null, msg: string) => { setCampoError(campo); setError(msg); };

    if (!fecha) { falla("fecha", t("depositos.fechaObligatoria")); return; }
    if (!periodo) { falla("periodo", t("depositos.periodoObligatorio")); return; }
    if (fecha > hoy) { falla("fecha", t("depositos.fechaFutura")); return; }
    if (periodo > hoy.slice(0, 7)) { falla("periodo", t("depositos.periodoFuturo")); return; }
    const m = parseMonto(monto);
    if (m === null) { falla("monto", t("common.montoInvalido")); return; }
    if (!cuentaBanco.trim()) { falla("cuenta", t("depositos.cuentaObligatoria")); return; }

    setSaving(true);
    try {
      const duplicado = await findDuplicateDeposito(
        church.id, fecha, m, cuentaBanco.trim(), editing?.id
      );
      if (duplicado) {
        falla("fecha", t("depositos.duplicado"));
        setSaving(false);
        return;
      }

      if (!excedeConfirmado) {
        const disponible = await efectivoDisponibleHasta(church, fecha, editing?.id);
        if (m > disponible) {
          setExcedeConfirmado(true);
          falla("monto", t("depositos.excedeEfectivo", {
            monto: fmtMoney(m),
            disponible: fmtMoney(maximo(disponible, CERO)),
          }));
          setSaving(false);
          return;
        }
      }

      // El comprobante se copia a la carpeta de la app y se guarda ESA ruta:
      // el archivo que eligió el usuario puede moverse o borrarse.
      const rutaGuardada = comprobantePath ? await guardarComprobante(comprobantePath) : null;
      const payload = {
        fecha,
        periodo,
        monto: m,
        cuenta_banco: cuentaBanco.trim(),
        referencia: referencia.trim() || null,
        comprobante_path: rutaGuardada,
        notas: notas.trim() || null,
      };
      if (isEdit) {
        await updateDeposito(editing.id, church.id, church.moneda, payload);
      } else {
        await insertDeposito(church.id, church.moneda, payload);
      }
      showToast(isEdit ? t("toast.cambiosGuardados") : t("toast.depositoGuardado"));
      playSound("guardado");
      onSaved();
      onClose();
    } catch (e) {
      falla(null, t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return {
    saving, error, campoError, isEdit, hoy, placeholderMonto,
    periodoDistinto, cuentasUsadas,

    fecha, onFechaChange, periodo, onPeriodoChange,
    monto, onMontoChange, cuentaBanco, setCuentaBanco,
    referencia, setReferencia, notas, setNotas,
    comprobantePath, setComprobantePath, pickComprobante,

    guardar,
  };
}
