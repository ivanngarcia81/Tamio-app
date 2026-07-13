const STORAGE_KEY = "tesoreria-sonido";

export function sonidoActivado(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setSonidoActivado(activo: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, activo ? "1" : "0");
  } catch {
    /* noop */
  }
}

export type SoundKind = "ingreso" | "gasto" | "eliminar" | "guardado";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(audio: AudioContext, freq: number, start: number, duration: number, peak = 0.16) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = audio.currentTime + start;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Reproduce un sonido corto y distinto según la acción. No hace nada si el
 *  usuario lo desactivó en Configuración o si el navegador bloquea el audio. */
export function playSound(kind: SoundKind): void {
  if (!sonidoActivado()) return;
  try {
    const audio = getCtx();
    switch (kind) {
      case "ingreso":
        tone(audio, 660, 0, 0.12);
        tone(audio, 880, 0.08, 0.18);
        break;
      case "gasto":
        tone(audio, 480, 0, 0.16);
        break;
      case "eliminar":
        tone(audio, 440, 0, 0.09);
        tone(audio, 280, 0.06, 0.18);
        break;
      case "guardado":
        tone(audio, 700, 0, 0.11);
        break;
    }
  } catch {
    /* noop: audio no soportado o bloqueado por el navegador */
  }
}
