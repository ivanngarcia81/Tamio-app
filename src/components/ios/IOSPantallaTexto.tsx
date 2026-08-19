/**
 * IOSPantallaTexto.tsx — editar un texto largo en su propia pantalla, como
 * hacen Notas, Recordatorios y Mail.
 *
 * Es el patrón que permite que un formulario de dieciocho campos quepa en un
 * teléfono: en la lista, la fila enseña el valor resumido; al tocarla, el
 * texto se edita a pantalla completa con el teclado y sin nada más alrededor.
 *
 * El valor se confirma al pulsar **Listo** y se descarta al **Cancelar**: se
 * edita sobre una copia, no sobre el estado del formulario. Sin esa copia,
 * cancelar no cancelaría nada —el formulario ya se habría ido modificando
 * letra a letra— y de paso cada pulsación marcaría el formulario como sucio,
 * que es lo que dispara el aviso de "cambios sin guardar".
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import Portal from "../Portal";
import { useEscapeClose } from "../../hooks/useEscapeClose";

export function IOSPantallaTexto({
  title, valor, placeholder, multilinea, onListo, onCancel,
}: {
  title: string;
  valor: string;
  placeholder?: string;
  /** Área de varias líneas en vez de una sola. */
  multilinea?: boolean;
  onListo: (v: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  useEscapeClose(onCancel);
  const [borrador, setBorrador] = useState(valor);

  return (
    <Portal>
      <div className="ios-sheet-overlay">
        <div className="ios-sheet" role="dialog" aria-label={title}>
          <div className="ios-nav">
            <button type="button" className="ios-back ios-sheet-cancelar" onClick={onCancel}>
              {t("common.cancelar")}
            </button>
            <h1 className="ios-nav-title">{title}</h1>
            <span className="ios-nav-status">
              <button type="button" className="ios-nav-action" onClick={() => onListo(borrador)}>
                {t("common.listo")}
              </button>
            </span>
          </div>
          <div className="ios-sheet-body ios-texto-cuerpo">
            {multilinea ? (
              <textarea
                className="ios-texto-campo"
                value={borrador}
                placeholder={placeholder}
                onChange={(e) => setBorrador(e.target.value)}
                autoFocus
                aria-label={title}
              />
            ) : (
              <input
                className="ios-texto-campo ios-texto-campo--linea"
                value={borrador}
                placeholder={placeholder}
                onChange={(e) => setBorrador(e.target.value)}
                autoFocus
                aria-label={title}
              />
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** Fila que abre la pantalla de arriba. El valor se resume a una línea: en
 *  una lista, un texto de tres renglones desalinea todo lo demás. */
export function IOSFilaTexto({
  label, valor, vacio, resumen, title, placeholder, multilinea, onChange,
}: {
  label: string;
  valor: string;
  /** Qué enseñar cuando está vacío ("Opcional", "Ninguno"…). */
  vacio: string;
  /** Qué enseñar EN VEZ del texto cuando lo útil no es el principio sino una
   *  cuenta ("4 puntos"). Solo cuando hay valor; vacío sigue mandando `vacio`. */
  resumen?: string;
  title?: string;
  placeholder?: string;
  multilinea?: boolean;
  onChange: (v: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button type="button" className="ios-field ios-field--link" onClick={() => setAbierta(true)}>
        <span className="ios-field-label">{label}</span>
        <span className="ios-field-value ios-field-value--resumen">{valor.trim() ? resumen ?? valor : vacio}</span>
        <span className="ios-chevron" aria-hidden="true">
          <svg viewBox="0 0 7 12"><path d="M1 1l5 5-5 5" /></svg>
        </span>
      </button>
      {abierta && (
        <IOSPantallaTexto
          title={title ?? label}
          valor={valor}
          placeholder={placeholder}
          multilinea={multilinea}
          onListo={(v) => { onChange(v); setAbierta(false); }}
          onCancel={() => setAbierta(false)}
        />
      )}
    </>
  );
}
