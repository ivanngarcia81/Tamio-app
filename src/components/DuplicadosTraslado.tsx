/**
 * DuplicadosTraslado.tsx — "esta persona ya podría estar en el padrón".
 *
 * Sale al pulsar "Crear miembro con esta información" cuando el nombre, el
 * teléfono o el correo se parecen a los de alguien que ya existe. Vive en su
 * propio archivo porque lo enseñan las DOS vistas del traslado de entrada (el
 * modal de Mac y la hoja del iPhone) y duplicar la lista de coincidencias
 * habría sido duplicar la única pantalla que evita miembros repetidos.
 *
 * Se queda con el diálogo centrado también en el teléfono, a propósito: es una
 * decisión con consecuencias en los datos, no una acción de lista, y en iOS eso
 * es una alerta, no una hoja de acciones.
 */
import { useTranslation } from "react-i18next";
import type { Member } from "../db";

export default function DuplicadosTraslado({
  nombre, duplicados, onVincular, onCrearIgual, onCancel,
}: {
  /** El nombre tal cual se escribió, para el mensaje. */
  nombre: string;
  duplicados: Member[];
  onVincular: (m: Member) => void;
  onCrearIgual: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="modal-overlay modal-overlay--confirm">
      <div className="confirm-card">
        <div className="confirm-title">{t("traslados.duplicadoTitulo")}</div>
        <div className="confirm-message">{t("traslados.duplicadoMensaje", { nombre })}</div>
        <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Cuatro como mucho: con más, la lista empuja los botones fuera de
              la pantalla de un teléfono y la decisión deja de verse entera. */}
          {duplicados.slice(0, 4).map((m) => (
            <button key={m.id} type="button" className="btn secondary" onClick={() => onVincular(m)}>
              {t("traslados.vincularA", { nombre: m.nombre })}
            </button>
          ))}
        </div>
        <div className="confirm-actions">
          <button className="btn secondary" onClick={onCancel}>{t("common.cancelar")}</button>
          <button className="btn primary" onClick={onCrearIgual}>{t("traslados.crearDeTodasFormas")}</button>
        </div>
      </div>
    </div>
  );
}
