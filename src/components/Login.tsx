import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../supabase";
import { esIPhone } from "../movil";
import { IconTamio, IconBank, IconMiembros, IconGlobe, IconChevronLeft, IconEye, IconWarn } from "../icons";
import IOSFormSheet from "./ios/IOSFormSheet";
import { Section, TextField } from "./ios/FormularioIOS";

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
  /* Ver la contraseña. En un teclado de teléfono, escribir doce caracteres a
     ciegas y equivocarse en el noveno es el motivo más común de «no puedo
     entrar»; el ojo lo resuelve sin bajar la seguridad de nada. */
  const [verClave, setVerClave] = useState(false);

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

  /* ---------- iPhone: la puerta, con la forma de una pantalla de iOS ----------
     No hay barra verde ni pestañas: antes de entrar no hay secciones a las que
     ir, y una cabecera aquí sería decorado. Lo que hay es lo que iOS pone en
     sus propias pantallas de cuenta — identidad centrada arriba, una lista
     agrupada inset con los campos, un solo botón de 50 y el resto como texto
     teñido. El fondo es el verde de marca, así que el botón se INVIERTE:
     blanco relleno con la letra verde.

     Las tres tarjetas de venta del escritorio («Tesorería clara», «Secretaría
     completa», «En la nube») se resumen en un renglón: nadie lee tres
     argumentos en la pantalla donde solo quiere teclear su clave.

     Va después de todos los `useState` a propósito: un `return` por encima de
     un hook cambiaría el número de hooks entre renders. */
  if (esIPhone()) {
    const puedeEntrar = !!email.trim() && !!pass && !cargando;
    const puedeRegistrar = !!email.trim() && pass.length >= 6 && !cargando;

    /* «Crear cuenta» es una PANTALLA y no una hoja: aquí vuelve el patrón de
       la app —título grande de 34, grupo con encabezado y pie— porque ya es un
       formulario, no una puerta. */
    if (modo === "registro") {
      return (
        <div className="login-ios login-ios--claro">
          <div className="login-ios-barra">
            <button type="button" className="login-ios-volver" onClick={volverALogin}>
              <IconChevronLeft size={17} strokeWidth={2.4} /> {t("login.entrar")}
            </button>
          </div>
          <h1 className="login-ios-titulo">{t("login.registroTitulo")}</h1>
          <p className="login-ios-sub">{t("login.registroSubIOS")}</p>

          <form className="ios-form login-ios-form" onSubmit={registrar}>
            <Section header={t("login.grupoCuenta")} footer={t("login.registroPie")}>
              <TextField
                label={t("login.nombre")}
                value={nombre}
                onChange={setNombre}
                placeholder={t("login.nombrePlaceholder")}
                optional
                autoFocus
              />
              <TextField
                label={t("login.email")}
                value={email}
                onChange={setEmail}
                type="email"
                inputMode="email"
                placeholder={t("login.correoPlaceholder")}
              />
              <TextField
                label={t("login.password")}
                value={pass}
                onChange={setPass}
                type="password"
                placeholder={t("login.claveMinima")}
              />
            </Section>

            {error && <p className="login-ios-aviso login-ios-aviso--error"><IconWarn size={15} /> {error}</p>}

            {/* Nace apagado: en iOS un botón lleno promete que algo va a
                pasar, y sin correo ni contraseña no puede pasar nada. */}
            <button type="submit" className="login-ios-btn" disabled={!puedeRegistrar}>
              {cargando ? t("login.registrando") : t("login.registrar")}
            </button>
          </form>

          <p className="login-ios-nota">{t("login.privacidadPie")}</p>
        </div>
      );
    }

    return (
      <div className="login-ios">
        <div className="login-ios-marca">
          <IconTamio size={64} />
          <span className="login-ios-nombre">Tamio</span>
          <span className="login-ios-tagline">{t("login.taglineCorta")}</span>
        </div>

        <form className="login-ios-form" onSubmit={entrar}>
          <div className="ios-group">
            <label className="ios-field login-ios-campo">
              <input
                className="ios-field-input"
                type="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="off"
                placeholder={t("login.email")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="ios-field login-ios-campo">
              <input
                className="ios-field-input"
                type={verClave ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("login.password")}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
              />
              <button
                type="button"
                className="login-ios-ojo"
                aria-label={verClave ? t("login.ocultarClave") : t("login.verClave")}
                onClick={() => setVerClave((v) => !v)}
              >
                <IconEye size={20} />
              </button>
            </label>
          </div>

          {/* El aviso va de PIE del grupo, donde iOS pone las reglas, y no en
              una alerta modal que obliga a un toque extra para seguir. */}
          {(error || aviso) && (
            <p className={`login-ios-aviso${error ? " login-ios-aviso--error" : ""}`}>
              {error && <IconWarn size={15} />} {error ?? aviso}
            </p>
          )}

          <button type="submit" className="login-ios-btn" disabled={!puedeEntrar}>
            {cargando ? t("login.entrando") : t("login.entrar")}
          </button>
        </form>

        <div className="login-ios-enlaces">
          <button type="button" onClick={() => { setModo("pedirCodigo"); setError(null); setAviso(null); }}>
            {t("login.olvidaste")}
          </button>
          <button type="button" onClick={() => { setModo("registro"); setError(null); setAviso(null); }}>
            {t("login.crearCuenta")}
          </button>
        </div>

        <p className="login-ios-nota login-ios-nota--pie">{t("login.privacidadPie")}</p>

        {/* Recuperar es una HOJA y no una pantalla: detrás se sigue viendo la
            puerta, y volver no borra lo que ya estaba escrito. El correo llega
            puesto desde el campo de arriba — quien pulsa «olvidé mi
            contraseña» acaba de teclearlo. */}
        {modo === "pedirCodigo" && (
          <IOSFormSheet
            title={t("login.recuperarTitulo")}
            saveLabel={t("login.enviar")}
            canSave={!!email.trim() && !cargando}
            onSave={() => enviarCodigo(new Event("submit") as unknown as FormEvent)}
            onCancel={volverALogin}
          >
            <Section footer={t("login.recuperarPie")}>
              <TextField
                label={t("login.email")}
                value={email}
                onChange={setEmail}
                type="email"
                inputMode="email"
                autoFocus
                placeholder={t("login.correoPlaceholder")}
              />
            </Section>
            {error && <p className="ios-section-footer ios-pie-aviso"><IconWarn size={13} /> {error}</p>}
          </IOSFormSheet>
        )}

        {modo === "nuevaClave" && (
          <IOSFormSheet
            title={t("login.nuevaClaveTitulo")}
            saveLabel={t("login.cambiarClave")}
            canSave={codigo.trim().length >= 6 && nueva.length >= 6 && !cargando}
            onSave={() => cambiarClave(new Event("submit") as unknown as FormEvent)}
            onCancel={volverALogin}
          >
            <Section footer={aviso ?? t("login.nuevaClaveSub")}>
              <TextField
                label={t("login.codigo")}
                value={codigo}
                onChange={setCodigo}
                inputMode="numeric"
                autoFocus
                placeholder="000000"
              />
              <TextField
                label={t("login.nuevaClave")}
                value={nueva}
                onChange={setNueva}
                type="password"
                placeholder={t("login.claveMinima")}
              />
            </Section>
            {error && <p className="ios-section-footer ios-pie-aviso"><IconWarn size={13} /> {error}</p>}
          </IOSFormSheet>
        )}
      </div>
    );
  }

  return (
    <div className="login-screen">
      <div className="login-split">
        <aside className="login-hero">
          <div className="login-hero-brand">
            <IconTamio size={38} />
            <span className="login-hero-word">Tamio</span>
          </div>
          <h1 className="login-hero-title">{t("login.heroTitulo")}</h1>
          <p className="login-hero-tagline">{t("login.heroTagline")}</p>
          <ul className="login-hero-feats">
            <li>
              <span className="lhf-ico"><IconBank size={17} /></span>
              <div><b>{t("login.feat1t")}</b><span>{t("login.feat1d")}</span></div>
            </li>
            <li>
              <span className="lhf-ico"><IconMiembros size={17} /></span>
              <div><b>{t("login.feat2t")}</b><span>{t("login.feat2d")}</span></div>
            </li>
            <li>
              <span className="lhf-ico"><IconGlobe size={17} /></span>
              <div><b>{t("login.feat3t")}</b><span>{t("login.feat3d")}</span></div>
            </li>
          </ul>
        </aside>

        <div className="login-forms">
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
          <div className="login-foot">{t("login.privacidadPie")}</div>
        </div>
      </div>
    </div>
  );
}
