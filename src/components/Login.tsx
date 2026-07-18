import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase";
import { IconTamio } from "../icons";

type Modo = "login" | "registro" | "pedirCodigo" | "nuevaClave";

export default function Login() {
  const { t } = useTranslation();
  const [modo, setModo] = useState<Modo>("login");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [codigo, setCodigo] = useState("");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    if (!supabase || cargando) return;
    setCargando(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: pass,
    });
    if (err) { setError(t("login.error")); setCargando(false); }
    // En caso de éxito, onAuthStateChange vuelve a renderizar la app.
  }

  // Registro self-service: crea la cuenta. El rol de administrador se asigna
  // automáticamente con un trigger en Supabase (ver docs/registro.md). Si el
  // proyecto exige confirmar el correo, se avisa; si no, entra directo.
  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (!supabase || cargando) return;
    if (!email.trim()) { setError(t("login.escribeCorreo")); return; }
    if (pass.length < 6) { setError(t("login.claveCorta")); return; }
    setCargando(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: { data: { nombre: nombre.trim() } },
    });
    if (err) { setError(t("login.errorRegistro")); setCargando(false); return; }
    // Si no hay sesión, el proyecto pide confirmar el correo antes de entrar.
    if (!data.session) {
      setCargando(false);
      setAviso(t("login.confirmaCorreo", { email: email.trim() }));
      setModo("login");
    }
    // Con sesión, onAuthStateChange entra directo a la app.
  }

  // Paso 1: envía un código de recuperación al correo.
  async function enviarCodigo(e: FormEvent) {
    e.preventDefault();
    if (!supabase || cargando) return;
    if (!email.trim()) { setError(t("login.escribeCorreo")); return; }
    setCargando(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    setCargando(false);
    if (err) { setError(t("login.errorEnvio")); return; }
    setAviso(t("login.codigoEnviado", { email: email.trim() }));
    setModo("nuevaClave");
  }

  // Paso 2: verifica el código y establece la contraseña nueva.
  async function cambiarClave(e: FormEvent) {
    e.preventDefault();
    if (!supabase || cargando) return;
    if (codigo.trim().length < 6) { setError(t("login.codigoInvalido")); return; }
    if (nueva.length < 6) { setError(t("login.claveCorta")); return; }
    setCargando(true);
    setError(null);
    const { error: errOtp } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: codigo.trim(),
      type: "recovery",
    });
    if (errOtp) { setError(t("login.codigoInvalido")); setCargando(false); return; }
    const { error: errUpd } = await supabase.auth.updateUser({ password: nueva });
    if (errUpd) { setError(t("login.errorClave")); setCargando(false); return; }
    // Con la sesión ya iniciada tras verifyOtp, onAuthStateChange entra a la app.
  }

  function volverALogin() {
    setModo("login");
    setError(null); setAviso(null); setCodigo(""); setNueva(""); setNombre("");
  }

  return (
    <div className="login-screen">
      {modo === "login" && (
        <form className="login-card" onSubmit={entrar}>
          <div className="login-logo"><IconTamio size={56} /></div>
          <div className="login-title">Tamio</div>
          <div className="login-sub">{aviso ?? t("login.sub")}</div>

          <div className="form-group full">
            <label className="form-label">{t("login.email")}</label>
            <input className="form-input" type="email" autoFocus autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group full">
            <label className="form-label">{t("login.password")}</label>
            <input className="form-input" type="password" autoComplete="current-password"
              value={pass} onChange={(e) => setPass(e.target.value)} required />
          </div>

          {error && <div className="field-error">{error}</div>}

          <button className="btn primary login-btn" type="submit" disabled={cargando}>
            {cargando ? t("login.entrando") : t("login.entrar")}
          </button>

          <button type="button" className="login-link" onClick={() => { setModo("pedirCodigo"); setError(null); setAviso(null); }}>
            {t("login.olvidaste")}
          </button>
          <button type="button" className="login-link" onClick={() => { setModo("registro"); setError(null); setAviso(null); }}>
            {t("login.crearCuenta")}
          </button>
        </form>
      )}

      {modo === "registro" && (
        <form className="login-card" onSubmit={registrar}>
          <div className="login-logo"><IconTamio size={56} /></div>
          <div className="login-title">{t("login.registroTitulo")}</div>
          <div className="login-sub">{t("login.registroSub")}</div>

          <div className="form-group full">
            <label className="form-label">{t("login.nombre")} <span className="opt">{t("common.opcional")}</span></label>
            <input className="form-input" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="form-group full">
            <label className="form-label">{t("login.email")}</label>
            <input className="form-input" type="email" autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="form-group full">
            <label className="form-label">{t("login.password")}</label>
            <input className="form-input" type="password" autoComplete="new-password"
              value={pass} onChange={(e) => setPass(e.target.value)} required />
          </div>

          {error && <div className="field-error">{error}</div>}

          <button className="btn primary login-btn" type="submit" disabled={cargando}>
            {cargando ? t("login.registrando") : t("login.registrar")}
          </button>
          <button type="button" className="login-link" onClick={volverALogin}>
            {t("login.yaTengoCuenta")}
          </button>
        </form>
      )}

      {modo === "pedirCodigo" && (
        <form className="login-card" onSubmit={enviarCodigo}>
          <div className="login-logo"><IconTamio size={56} /></div>
          <div className="login-title">{t("login.recuperarTitulo")}</div>
          <div className="login-sub">{t("login.recuperarSub")}</div>

          <div className="form-group full">
            <label className="form-label">{t("login.email")}</label>
            <input className="form-input" type="email" autoFocus autoComplete="username"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {error && <div className="field-error">{error}</div>}

          <button className="btn primary login-btn" type="submit" disabled={cargando}>
            {cargando ? t("login.enviando") : t("login.enviarCodigo")}
          </button>
          <button type="button" className="login-link" onClick={volverALogin}>
            {t("login.volver")}
          </button>
        </form>
      )}

      {modo === "nuevaClave" && (
        <form className="login-card" onSubmit={cambiarClave}>
          <div className="login-logo"><IconTamio size={56} /></div>
          <div className="login-title">{t("login.nuevaClaveTitulo")}</div>
          <div className="login-sub">{aviso ?? t("login.nuevaClaveSub")}</div>

          <div className="form-group full">
            <label className="form-label">{t("login.codigo")}</label>
            <input className="form-input" inputMode="numeric" autoFocus
              value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="000000" required />
          </div>
          <div className="form-group full">
            <label className="form-label">{t("login.nuevaClave")}</label>
            <input className="form-input" type="password" autoComplete="new-password"
              value={nueva} onChange={(e) => setNueva(e.target.value)} required />
          </div>

          {error && <div className="field-error">{error}</div>}

          <button className="btn primary login-btn" type="submit" disabled={cargando}>
            {cargando ? t("login.guardandoClave") : t("login.cambiarClave")}
          </button>
          <button type="button" className="login-link" onClick={volverALogin}>
            {t("login.volver")}
          </button>
        </form>
      )}
    </div>
  );
}
