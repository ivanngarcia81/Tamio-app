import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../supabase";
import { ROLES_ACCESO, type Role } from "../../role";
import { IconMail, IconPlus } from "../../icons";
import { showToast } from "../../toast";
import { playSound } from "../../sound";

/**
 * Invitar a alguien a ESTA iglesia con un rol de acceso.
 *
 * **No confundir con la tarjeta Usuarios** (`UsersSettings`), que está justo
 * al lado y administra el directorio LOCAL de personas: nombres, teléfonos y
 * cargos descriptivos (pastor, auditor, consejo…) que no dan acceso a nada.
 * Esto de aquí crea cuentas de verdad. Conviven a propósito: una iglesia
 * quiere tener apuntado a su pastor sin darle por eso una contraseña.
 *
 * El trabajo de servidor lo hace la Edge Function `invitar-usuario`, que es
 * donde viven las reglas de seguridad — sobre todo la de que **la iglesia no
 * viaja en la petición**, se lee del perfil de quien invita. Aquí no se manda
 * ningún `church_id` ni se puede.
 */
/**
 * Estado y envío de la invitación, sin nada de presentación. Lo comparten
 * esta tarjeta (Mac/iPad) y `AccesosSettingsIOS` (iPhone), que pintan lo
 * mismo de dos formas: duplicar el `invoke` a la Edge Function y, sobre
 * todo, la traducción del error POR CÓDIGO habría dejado dos copias de la
 * parte del archivo que más fácil se desincroniza.
 */
export function useInvitacion() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Role>("tesorero");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invitar() {
    if (!supabase || enviando) return;
    setError(null);
    setEnviando(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("invitar-usuario", {
        body: { email: email.trim(), nombre: nombre.trim(), rol },
      });

      // `invoke` da error cuando la respuesta no es 2xx, y el cuerpo con el
      // motivo viaja dentro. Sin leerlo, un "ya pertenece a otra iglesia"
      // llegaría al usuario como "Edge Function returned a non-2xx status".
      const cuerpo = (err
        ? await leerCuerpo(err)
        : (data as { ok?: boolean; resultado?: string; codigo?: string; error?: string } | null)) ?? {};

      if (err || cuerpo.error) {
        // Se traduce por CÓDIGO: el servidor escribe en español y la app es
        // bilingüe. El texto del servidor solo se usa si llega un código que
        // esta versión todavía no conoce.
        const clave = cuerpo.codigo ? `invitar.error.${cuerpo.codigo}` : "";
        const traducido = clave && t(clave) !== clave ? t(clave) : null;
        setError(traducido ?? cuerpo.error ?? t("invitar.error.generico"));
        return;
      }

      playSound("guardado");
      showToast(t(`invitar.ok.${cuerpo.resultado ?? "invitado"}`, { email: email.trim() }));
      setEmail("");
      setNombre("");
    } catch (e) {
      console.warn("invitar-usuario falló:", e);
      setError(t("invitar.error.generico"));
    } finally {
      setEnviando(false);
    }
  }

  const listo = email.trim().length > 3 && !enviando;

  return { email, setEmail, nombre, setNombre, rol, setRol, enviando, error, setError, listo, invitar };
}

export default function InvitarUsuario() {
  const { t } = useTranslation();
  const { email, setEmail, nombre, setNombre, rol, setRol, enviando, error, setError, listo, invitar } = useInvitacion();

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-icon"><IconMail size={16} /></span>
        <div>
          <div className="card-title">{t("invitar.titulo")}</div>
          <div className="card-sub">{t("invitar.sub")}</div>
        </div>
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="invitar-email">{t("invitar.correo")}</label>
        <input
          id="invitar-email"
          className="form-input"
          type="email"
          autoComplete="off"
          placeholder="tesorero@iglesia.org"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="invitar-nombre">{t("invitar.nombre")}</label>
        <input
          id="invitar-nombre"
          className="form-input"
          placeholder={t("invitar.nombreOpcional")}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label className="form-label" htmlFor="invitar-rol">{t("invitar.rol")}</label>
        {/* Sin rama de iPhone: esta tarjeta ya solo se pinta en Mac/iPad —
            el teléfono usa `AccesosSettingsIOS`, que monta el mismo hook. */}
        <select
          id="invitar-rol"
          className="form-select"
          value={rol}
          onChange={(e) => setRol(e.target.value as Role)}
        >
          {ROLES_ACCESO.map((r) => (
            <option key={r} value={r}>{t(`rolAcceso.${r}`)}</option>
          ))}
        </select>
        <div className="form-hint">{t(`invitar.queVe.${rol}`)}</div>
      </div>

      {error && <div className="field-error">{error}</div>}

      <button className="btn primary" onClick={() => void invitar()} disabled={!listo}>
        <IconPlus size={14} /> {enviando ? t("invitar.enviando") : t("invitar.enviar")}
      </button>
    </div>
  );
}

/** El cuerpo de un error de `functions.invoke` viene en `context`, que es la
 *  `Response` original. Se lee con cuidado: si no es JSON, se devuelve vacío
 *  y el llamador cae al mensaje genérico. */
async function leerCuerpo(err: unknown): Promise<Record<string, string> | null> {
  try {
    const ctx = (err as { context?: unknown }).context;
    if (ctx instanceof Response) return await ctx.json();
  } catch { /* no era JSON */ }
  return null;
}
