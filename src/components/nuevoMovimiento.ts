/**
 * nuevoMovimiento.ts — el estado y la lógica de "Nuevo ingreso / gasto /
 * miembro", sin una sola línea de pintura.
 *
 * Vivía dentro de `NewRecordModal.tsx`. Se sacó aquí cuando el teléfono dejó
 * de usar el modal de escritorio y pasó a una hoja de iOS: son dos formas de
 * enseñar EXACTAMENTE el mismo formulario, y con la lógica duplicada la
 * segunda copia se habría quedado atrás a la primera corrección — de esas que
 * no dan error, solo un importe que no cuadra en una de las dos plataformas.
 *
 * Aquí no se decide nada de aspecto. `guardar()`, la validación de fecha
 * futura, el aviso de posible duplicado y los recurrentes son los de siempre,
 * movidos tal cual.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CERO, aTextoTecleado, deDecimalHeredado, deTextoTecleado, type Centavos } from "../dinero";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { } from "@tauri-apps/plugin-opener";
import { readFile } from "@tauri-apps/plugin-fs";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { guardarComprobante, rutaComprobante } from "../services/comprobantes";
import {
  METODOS_PAGO, buscarPosiblesDuplicados, catNombre, getCategoriasGasto, getCategoriasIngreso, metodoNombre,
  insertMovimientoRecurrente, insertMember, insertTx, listMembers,
  nowLocalIso, updateMember, updateTx,
  type Church, type Member, type Tx,
} from "../db";
import { currencySymbol } from "../currencies";
import { showToast } from "../toast";
import { playSound } from "../sound";
import { useEscapeClose } from "../hooks/useEscapeClose";
import { interpretarMovimiento, type MovimientoInterpretado } from "../ia";

export function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Tipos de imagen que Claude puede leer para el OCR (HEIC y PDF no van como
 *  imagen, así que para esos no se ofrece "Leer con IA"). */
export const OCR_MEDIA: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
};

function bytesABase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export type ModalTab = "ingreso" | "gasto" | "miembro";

export type ModalMode =
  | { kind: "create"; tab: ModalTab; bloquearPestana?: boolean }
  | { kind: "editTx"; tx: Tx }
  | { kind: "editMember"; member: Member };

export interface Props {
  church: Church;
  mode: ModalMode;
  onClose: () => void;
  onSaved: () => void;
}

/** Lo que teclea el tesorero → centavos, o null si no sirve.
 *
 *  El parseo vive en `dinero.ts`; aquí solo queda la regla de esta pantalla:
 *  un movimiento tiene que ser mayor que cero. */
export function parseMonto(s: string): Centavos | null {
  const c = deTextoTecleado(s);
  return c !== null && c > 0 ? c : null;
}

export function useNuevoMovimiento({ church, mode, onClose, onSaved }: Props) {
  const { t, i18n } = useTranslation();
  useEscapeClose(onClose);
  const isEdit = mode.kind !== "create";
  // Cuando se abre desde Membresía (Secretaría) la pestaña queda fija en
  // "miembro" y no se muestran Ingreso/Gasto (no aplican a su rol).
  const pestanaBloqueada = mode.kind === "create" && mode.bloquearPestana === true;
  const initialTab: ModalTab =
    mode.kind === "create" ? mode.tab : mode.kind === "editTx" ? mode.tx.tipo : "miembro";

  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true tras avisar de un posible duplicado: el siguiente Guardar procede.
  const [duplicadoConfirmado, setDuplicadoConfirmado] = useState(false);

  // --- estado ingreso/gasto ---
  const now = nowLocalIso();
  const hoy = now.slice(0, 10);
  const [categoria, setCategoria] = useState<string>(initialTab === "gasto" ? "servicios" : "ofrenda");
  const [subcategoria, setSubcategoria] = useState("");
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(now.slice(0, 10));
  // Sin prerrellenar: antes tomaba la hora del reloj y, como nadie la
  // corrige, el registro acababa mostrando la hora de captura como si
  // fuera la del movimiento (gastos "de las 2:29 de la madrugada").
  const [hora, setHora] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState("efectivo");
  const [detalle, setDetalle] = useState("");
  const [aportanteQuery, setAportanteQuery] = useState("");
  const [aportanteId, setAportanteId] = useState<number | null>(null);
  const [beneficiario, setBeneficiario] = useState("");
  const [beneficiarioRfc, setBeneficiarioRfc] = useState("");
  const [constancia, setConstancia] = useState(false);
  const [marcarPendiente, setMarcarPendiente] = useState(false);
  const [esRecurrente, setEsRecurrente] = useState(false);
  // Mes desde el que la serie recurrente llena el histórico. Vacío = el mes
  // de la fecha del movimiento (por defecto NO se rellena nada hacia atrás).
  const [recDesde, setRecDesde] = useState("");
  const [comprobantePath, setComprobantePath] = useState<string | null>(null);
  const [dropActivo, setDropActivo] = useState(false);

  // --- captura por IA (lenguaje natural + OCR de comprobantes) ---
  const [iaTexto, setIaTexto] = useState("");
  const [iaCargando, setIaCargando] = useState(false);
  // Categoría que la IA quiere aplicar tras cambiar de pestaña; el efecto de
  // cambio de pestaña la usa en vez del valor por defecto (si no, lo pisaría).
  const catPendiente = useRef<string | null>(null);

  // Arrastrar y soltar un comprobante (PDF/imagen) sobre el modal lo adjunta.
  // Los eventos de arrastre nativos llegan por la API del webview de Tauri.
  useEffect(() => {
    if (tab === "miembro") return;
    let off: (() => void) | undefined;
    let cancelado = false;
    getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop") {
        setDropActivo(false);
        const p = e.payload.paths.find((x) => /\.(pdf|png|jpe?g|heic)$/i.test(x));
        if (p) {
          setComprobantePath(p);
          showToast(t("recordModal.comprobanteAdjunto"));
        }
      } else if (e.payload.type === "leave") {
        setDropActivo(false);
      } else {
        setDropActivo(true);
      }
    }).then((f) => { if (cancelado) f(); else off = f; }).catch(() => {});
    return () => { cancelado = true; off?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const [members, setMembers] = useState<Member[]>([]);

  // --- estado miembro ---
  const [mNombre, setMNombre] = useState("");
  const [mEmail, setMEmail] = useState("");
  const [mTelefono, setMTelefono] = useState("");
  const [mRfc, setMRfc] = useState("");
  const [mNotas, setMNotas] = useState("");
  // Alta rápida desde Tesorería: distingue miembro (activo) de visitante.
  const [mEstado, setMEstado] = useState<"activo" | "visitante">("activo");

  useEffect(() => {
    listMembers(church.id).then(setMembers).catch(() => {});
  }, [church.id]);

  // Si cambian los datos de identidad, el aviso de duplicado ya no aplica y
  // el próximo Guardar vuelve a verificar.
  useEffect(() => { setDuplicadoConfirmado(false); }, [mNombre, mTelefono, mEmail]);

  // Precargar el formulario cuando se abre en modo edición
  useEffect(() => {
    if (mode.kind === "editTx") {
      const tx = mode.tx;
      setCategoria(tx.categoria);
      setSubcategoria(tx.subcategoria ?? "");
      setConcepto(tx.concepto);
      setFecha(tx.fecha.slice(0, 10));
      setHora(tx.fecha.slice(11, 16));
      setMonto(aTextoTecleado(tx.monto));
      setMetodo(tx.metodo_pago);
      setDetalle(tx.detalle ?? "");
      setAportanteId(tx.member_id ?? null);
      // Si no es miembro (visitante), el nombre quedó guardado en beneficiario.
      setAportanteQuery(tx.member_nombre ?? tx.beneficiario ?? "");
      setBeneficiario(tx.beneficiario ?? "");
      setBeneficiarioRfc(tx.beneficiario_rfc ?? "");
      setConstancia(!!tx.emitir_constancia);
      setMarcarPendiente(tx.estado === "pendiente");
      setComprobantePath(tx.comprobante_path ?? null);
    } else if (mode.kind === "editMember") {
      const m = mode.member;
      setMNombre(m.nombre);
      setMEmail(m.email ?? "");
      setMTelefono(m.telefono ?? "");
      setMRfc(m.rfc ?? "");
      setMNotas(m.notas ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode.kind !== "create") return;
    // Si la IA dejó una categoría pendiente para esta pestaña, se respeta;
    // si no, se vuelve al valor por defecto del tipo.
    if (catPendiente.current) {
      setCategoria(catPendiente.current);
      catPendiente.current = null;
    } else {
      setCategoria(tab === "gasto" ? "servicios" : "ofrenda");
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const sugerencias = useMemo(() => {
    const q = aportanteQuery.trim().toLowerCase();
    if (q.length < 2 || aportanteId !== null) return [];
    return members.filter((m) => m.nombre.toLowerCase().includes(q)).slice(0, 4);
  }, [aportanteQuery, aportanteId, members]);

  // Descripción contextual: para Diezmo y Ofrenda la categoría ya define el
  // ingreso por completo, así que el campo se oculta y se guarda el nombre de
  // la categoría; para Donación es visible pero opcional (propósito del
  // donativo); para Otros y categorías personalizadas sigue siendo requerido.
  const descripcionOculta = tab === "ingreso" && (categoria === "diezmo" || categoria === "ofrenda");
  const descripcionOpcional = tab === "ingreso" && categoria === "donacion";
  /** Concepto a persistir, o null si falta y es obligatorio. */
  function conceptoFinal(): string | null {
    const escrito = concepto.trim();
    if (descripcionOculta) return catNombre(categoria);
    if (!escrito) return descripcionOpcional ? catNombre(categoria) : null;
    return escrito;
  }

  /** Nombre a guardar en `beneficiario`. Para gasto es el beneficiario normal.
   *  Para ingreso: si se eligió un miembro se liga por member_id y esto queda
   *  null; si se escribió un nombre libre (un visitante que NO es miembro) se
   *  guarda ese nombre aquí para que la fila muestre quién aportó. */
  function beneficiarioFinal(): string | null {
    if (tab === "gasto") return beneficiario.trim() || null;
    if (tab === "ingreso" && !aportanteId) return aportanteQuery.trim() || null;
    return null;
  }

  /** "$0.00", "RD$0.00", "$0" en pesos chilenos. El cero sale del mismo
   *  formateador que llena el campo al editar, así que el ejemplo que se
   *  enseña es exactamente lo que la app sabe leer. */
  const placeholderMonto = currencySymbol(church.moneda) + aTextoTecleado(CERO);

  const titulo = isEdit
    ? tab === "miembro" ? t("recordModal.editarMiembro") : tab === "ingreso" ? t("recordModal.editarIngreso") : t("recordModal.editarGasto")
    : tab === "miembro" ? t("recordModal.nuevoMiembro") : tab === "ingreso" ? t("recordModal.nuevoIngreso") : t("recordModal.nuevoGasto");
  const subtitulo = tab === "miembro"
    ? t("recordModal.subMiembro")
    : tab === "ingreso" ? t("recordModal.subIngreso") : t("recordModal.subGasto");
  const botonGuardar = saving
    ? t("common.guardando")
    : isEdit ? t("common.guardarCambios") : tab === "miembro" ? t("recordModal.guardarMiembro") : tab === "ingreso" ? t("recordModal.guardarIngreso") : t("recordModal.guardarGasto");

  /** Vuelca en el formulario los campos que la IA logró deducir. Nada se
   *  guarda: el humano revisa y confirma. Valida categoría/método contra los
   *  catálogos reales y descarta lo que no encaje. */
  function aplicarInterpretacion(it: MovimientoInterpretado): boolean {
    const tipoX: ModalTab =
      (it.tipo === "ingreso" || it.tipo === "gasto") && !pestanaBloqueada ? it.tipo : tab;
    const listaCat = tipoX === "gasto" ? getCategoriasGasto() : getCategoriasIngreso();
    const cat = it.categoria && listaCat.some((c) => c.id === it.categoria) ? it.categoria : null;

    let algo = false;
    if (tipoX !== tab) {
      catPendiente.current = cat; // el efecto de cambio de pestaña la aplica
      setTab(tipoX);
      algo = true;
    } else if (cat) {
      setCategoria(cat);
      algo = true;
    }
    if (it.concepto) { setConcepto(it.concepto); algo = true; }
    // OJO: lo que devuelve la IA es un DECIMAL (lee "125.50" del comprobante),
    // no centavos, así que primero pasa por `deDecimalHeredado` y solo
    // entonces se escribe en el campo.
    //
    // Antes iba con `String(it.monto)`, que da "125.5" con PUNTO siempre. En
    // un aparato configurado en España o Brasil el punto es separador de
    // millares, así que el campo se quedaba con un importe que la propia
    // pantalla rechazaba al guardar: la IA leía bien el comprobante y el
    // usuario veía "escribe un monto válido".
    if (typeof it.monto === "number" && it.monto > 0) {
      setMonto(aTextoTecleado(deDecimalHeredado(it.monto)));
      algo = true;
    }
    if (it.fecha && /^\d{4}-\d{2}-\d{2}$/.test(it.fecha) && it.fecha <= hoy) { setFecha(it.fecha); algo = true; }
    if (it.metodo && METODOS_PAGO.some((m) => m.id === it.metodo)) { setMetodo(it.metodo); algo = true; }
    if (it.persona) {
      algo = true;
      if (tipoX === "gasto") {
        setBeneficiario(it.persona);
      } else {
        const p = it.persona.toLowerCase();
        const m = members.find((mm) => mm.nombre.toLowerCase() === p)
          ?? members.find((mm) => mm.nombre.toLowerCase().includes(p));
        if (m) { setAportanteId(m.id); setAportanteQuery(m.nombre); }
        else { setAportanteId(null); setAportanteQuery(it.persona); }
      }
    }
    return algo;
  }

  async function interpretarTexto() {
    const texto = iaTexto.trim();
    if (!texto || iaCargando) return;
    setIaCargando(true);
    setError(null);
    try {
      const it = await interpretarMovimiento({
        texto,
        hoy,
        categoriasIngreso: getCategoriasIngreso().map((c) => ({ id: c.id, nombre: catNombre(c.id) })),
        categoriasGasto: getCategoriasGasto().map((c) => ({ id: c.id, nombre: catNombre(c.id) })),
        metodos: METODOS_PAGO.map((m) => ({ id: m.id, nombre: metodoNombre(m.id) })),
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      const algo = aplicarInterpretacion(it);
      showToast(algo ? t("recordModal.ia.listo") : t("recordModal.ia.nada"));
      if (algo) setIaTexto("");
    } catch (e) {
      setError(t("recordModal.ia.error", { error: String(e) }));
    } finally {
      setIaCargando(false);
    }
  }

  async function interpretarComprobante() {
    if (!comprobantePath || iaCargando) return;
    const ext = comprobantePath.split(".").pop()?.toLowerCase() ?? "";
    const media = OCR_MEDIA[ext];
    if (!media) return;
    setIaCargando(true);
    setError(null);
    try {
      const bytes = await readFile(await rutaComprobante(comprobantePath));
      const it = await interpretarMovimiento({
        imagen: { media_type: media, data: bytesABase64(bytes) },
        hoy,
        categoriasIngreso: getCategoriasIngreso().map((c) => ({ id: c.id, nombre: catNombre(c.id) })),
        categoriasGasto: getCategoriasGasto().map((c) => ({ id: c.id, nombre: catNombre(c.id) })),
        metodos: METODOS_PAGO.map((m) => ({ id: m.id, nombre: metodoNombre(m.id) })),
        idioma: i18n.language?.startsWith("en") ? "en" : "es",
      });
      const algo = aplicarInterpretacion(it);
      showToast(algo ? t("recordModal.ia.listo") : t("recordModal.ia.nada"));
    } catch (e) {
      setError(t("recordModal.ia.error", { error: String(e) }));
    } finally {
      setIaCargando(false);
    }
  }

  const comprobanteEsImagen =
    !!comprobantePath && !!OCR_MEDIA[comprobantePath.split(".").pop()?.toLowerCase() ?? ""];

  async function pickComprobante() {
    try {
      const path = await openFileDialog({
        multiple: false,
        title: t("recordModal.seleccionarComprobante"),
        filters: [{ name: t("tx.comprobante"), extensions: ["pdf", "png", "jpg", "jpeg", "heic"] }],
      });
      if (typeof path === "string") setComprobantePath(path);
    } catch (e) {
      setError(t("common.noSePudoAbrirSelector", { error: String(e) }));
    }
  }

  async function agregarALosMeses() {
    if (mode.kind !== "editTx") return;
    if (tab !== "ingreso" && tab !== "gasto") return;
    setError(null);
    const m = parseMonto(monto);
    const conceptoGuardar = conceptoFinal();
    if (conceptoGuardar === null) { setError(t("common.conceptoObligatorio")); return; }
    if (m === null) { setError(t("common.montoInvalido")); return; }
    if (fecha > hoy) {
      setError(tab === "ingreso" ? t("recordModal.fechaFuturaIngresos") : t("recordModal.fechaFuturaGastos"));
      return;
    }
    setSaving(true);
    try {
      const rutaGuardada = comprobantePath ? await guardarComprobante(comprobantePath) : null;
      await updateTx(mode.tx.id, church.id, church.moneda, {
        tipo: tab,
        categoria,
        subcategoria: tab === "ingreso" && categoria === "otros" ? subcategoria.trim() || null : null,
        concepto: conceptoGuardar,
        detalle: detalle.trim() || null,
        fecha: hora ? `${fecha} ${hora}` : fecha,
        monto: m,
        metodo_pago: metodo,
        member_id: tab === "ingreso" ? aportanteId : null,
        beneficiario: beneficiarioFinal(),
        beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
        emitir_constancia: tab === "ingreso" ? constancia : false,
        estado: marcarPendiente ? "pendiente" : "aprobado",
        comprobante_path: rutaGuardada,
      });
      const mesesRegistrados = await insertMovimientoRecurrente(
        church.id,
        church.moneda,
        {
          tipo: tab,
          categoria,
          subcategoria: null,
          concepto: conceptoGuardar,
          detalle: detalle.trim() || null,
          monto: m,
          metodo_pago: metodo,
          beneficiario: tab === "gasto" ? beneficiario.trim() || null : null,
          beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
          dia: Number(fecha.slice(8, 10)),
          // Desde el mes del propio movimiento (no enero): así no se llenan
          // meses en los que la serie todavía no existía.
          mes_inicio: recDesde || fecha.slice(0, 7),
        },
        fecha.slice(0, 7) // el mes de este movimiento ya existe — no se duplica
      );
      showToast(
        mesesRegistrados > 0
          ? t("recurrente.toastCreado", { count: mesesRegistrados })
          : t("recurrente.toastCreadoSinMeses")
      );
      playSound("guardado");
      onSaved();
      onClose();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  /** Deja el modal listo para el siguiente registro: limpia los campos de la
   *  entrada pero conserva el tipo (ingreso/gasto/miembro), la categoría, la
   *  fecha, la hora y el método de pago, para meter varios seguidos. */
  function limpiarParaOtro() {
    setConcepto("");
    setSubcategoria("");
    setMonto("");
    setDetalle("");
    setAportanteQuery("");
    setAportanteId(null);
    setBeneficiario("");
    setBeneficiarioRfc("");
    setConstancia(false);
    setMarcarPendiente(false);
    setEsRecurrente(false);
    setComprobantePath(null);
    setMNombre("");
    setMEmail("");
    setMTelefono("");
    setMRfc("");
    setMNotas("");
    setMEstado("activo");
    setError(null);
    setSaving(false);
  }

  async function guardar(cerrar = true) {
    setError(null);
    try {
      if (tab === "miembro") {
        if (!mNombre.trim()) { setError(t("validacion.nombreObligatorio")); return; }
        const payload = {
          nombre: mNombre.trim(),
          email: mEmail.trim() || null,
          telefono: mTelefono.trim() || null,
          rfc: mRfc.trim() || null,
          notas: mNotas.trim() || null,
        };
        // Aviso de posible duplicado (nombre/teléfono/correo normalizados).
        // No bloquea: el primer intento avisa con los nombres encontrados y el
        // segundo clic guarda de todos modos (los homónimos reales existen).
        if (mode.kind !== "editMember" && !duplicadoConfirmado) {
          const dups = await buscarPosiblesDuplicados(church.id, {
            nombre: payload.nombre, telefono: payload.telefono, correo: payload.email,
          });
          if (dups.length > 0) {
            setDuplicadoConfirmado(true);
            setError(t("recordModal.posibleDuplicado", {
              nombres: dups.slice(0, 3).map((d) => d.nombre).join(", "),
            }));
            return;
          }
        }
        setSaving(true);
        if (mode.kind === "editMember") {
          await updateMember(mode.member.id, church.id, payload);
        } else {
          // La fecha de alta del registro de membresía es el día en que se
          // agrega el miembro (el CSV puede traer fechas históricas propias).
          await insertMember(church.id, { ...payload, fecha_ingreso: hoy, estado_membresia: mEstado });
        }
      } else {
        const m = parseMonto(monto);
        const conceptoGuardar = conceptoFinal();
        if (conceptoGuardar === null) { setError(t("common.conceptoObligatorio")); return; }
        if (m === null) { setError(t("common.montoInvalido")); return; }
        if (fecha > hoy) {
          setError(tab === "ingreso" ? t("recordModal.fechaFuturaIngresos") : t("recordModal.fechaFuturaGastos"));
          return;
        }
        setSaving(true);
        if ((tab === "gasto" || tab === "ingreso") && !isEdit && esRecurrente) {
          const dia = Number(fecha.slice(8, 10));
          const mesesRegistrados = await insertMovimientoRecurrente(church.id, church.moneda, {
            tipo: tab,
            categoria,
            subcategoria: null,
            concepto: conceptoGuardar,
            detalle: detalle.trim() || null,
            monto: m,
            metodo_pago: metodo,
            beneficiario: tab === "gasto" ? beneficiario.trim() || null : null,
            beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
            dia,
            mes_inicio: recDesde || fecha.slice(0, 7),
          });
          showToast(
            mesesRegistrados > 0
              ? t("recurrente.toastCreado", { count: mesesRegistrados })
              : t("recurrente.toastCreadoSinMeses")
          );
          playSound(tab === "ingreso" ? "ingreso" : "gasto");
          onSaved();
          if (cerrar) onClose(); else limpiarParaOtro();
          return;
        }
        // El comprobante se copia a la carpeta de la app y se guarda ESA ruta:
        // el archivo que eligió el usuario puede moverse o borrarse.
        const rutaGuardada = comprobantePath ? await guardarComprobante(comprobantePath) : null;
        const payload = {
          tipo: tab,
          categoria,
          subcategoria: categoria === "otros" ? subcategoria.trim() || null : null,
          concepto: conceptoGuardar,
          detalle: detalle.trim() || null,
          fecha: hora ? `${fecha} ${hora}` : fecha,
          monto: m,
          metodo_pago: metodo,
          member_id: tab === "ingreso" ? aportanteId : null,
          beneficiario: beneficiarioFinal(),
          beneficiario_rfc: tab === "gasto" ? beneficiarioRfc.trim() || null : null,
          emitir_constancia: tab === "ingreso" ? constancia : false,
          estado: marcarPendiente ? "pendiente" : "aprobado",
          comprobante_path: rutaGuardada,
        } as const;
        if (mode.kind === "editTx") {
          await updateTx(mode.tx.id, church.id, church.moneda, payload);
        } else {
          await insertTx(church.id, church.moneda, payload);
        }
      }
      showToast(
        isEdit
          ? t("toast.cambiosGuardados")
          : tab === "miembro"
            ? t("toast.miembroGuardado")
            : tab === "ingreso"
              ? t("toast.ingresoGuardado")
              : t("toast.gastoGuardado")
      );
      playSound(isEdit || tab === "miembro" ? "guardado" : tab === "ingreso" ? "ingreso" : "gasto");
      onSaved();
      if (cerrar) onClose(); else limpiarParaOtro();
    } catch (e) {
      setError(t("common.noSePudoGuardar", { error: String(e) }));
      setSaving(false);
    }
  }

  return {
    tab,
    setTab,
    saving,
    setSaving,
    error,
    setError,
    duplicadoConfirmado,
    setDuplicadoConfirmado,
    categoria,
    setCategoria,
    subcategoria,
    setSubcategoria,
    concepto,
    setConcepto,
    fecha,
    setFecha,
    hora,
    setHora,
    monto,
    setMonto,
    metodo,
    setMetodo,
    detalle,
    setDetalle,
    aportanteQuery,
    setAportanteQuery,
    aportanteId,
    setAportanteId,
    beneficiario,
    setBeneficiario,
    beneficiarioRfc,
    setBeneficiarioRfc,
    constancia,
    setConstancia,
    marcarPendiente,
    setMarcarPendiente,
    esRecurrente,
    setEsRecurrente,
    recDesde,
    setRecDesde,
    comprobantePath,
    setComprobantePath,
    dropActivo,
    setDropActivo,
    iaTexto,
    setIaTexto,
    iaCargando,
    setIaCargando,
    members,
    setMembers,
    mNombre,
    setMNombre,
    mEmail,
    setMEmail,
    mTelefono,
    setMTelefono,
    mRfc,
    setMRfc,
    mNotas,
    setMNotas,
    mEstado,
    setMEstado,
    isEdit,
    pestanaBloqueada,
    initialTab,
    now,
    hoy,
    catPendiente,
    sugerencias,
    descripcionOculta,
    descripcionOpcional,
    placeholderMonto,
    titulo,
    subtitulo,
    botonGuardar,
    comprobanteEsImagen,
    conceptoFinal,
    beneficiarioFinal,
    aplicarInterpretacion,
    interpretarTexto,
    interpretarComprobante,
    pickComprobante,
    agregarALosMeses,
    limpiarParaOtro,
    guardar,
  };
}
