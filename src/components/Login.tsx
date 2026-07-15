import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase";
import { IconChurch } from "../icons";

export default function Login() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={entrar}>
        <div className="login-logo"><IconChurch /></div>
        <div className="login-title">Tamio</div>
        <div className="login-sub">{t("login.sub")}</div>

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
      </form>
    </div>
  );
}
