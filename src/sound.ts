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

/** Juegos de sonido. Todos avisan lo mismo; cambia el carácter del tono.
 *  `clasico` es el de siempre y sigue siendo el de fábrica. */
export const JUEGOS_SONIDO = ["clasico", "suave", "campana"] as const;
export type JuegoSonido = (typeof JUEGOS_SONIDO)[number];

const JUEGO_KEY = "tamio-juego-sonido";

export function juegoSonido(): JuegoSonido {
  try {
    const v = localStorage.getItem(JUEGO_KEY);
    if (v && (JUEGOS_SONIDO as readonly string[]).includes(v)) return v as JuegoSonido;
  } catch { /* noop */ }
  return "clasico";
}

export function setJuegoSonido(j: JuegoSonido): void {
  try { localStorage.setItem(JUEGO_KEY, j); } catch { /* noop */ }
}

/** Una nota: frecuencia en Hz, cuándo entra, cuánto dura y qué tan fuerte. */
type Nota = { f: number; t: number; d: number; p?: number };

const JUEGOS: Record<JuegoSonido, { onda: OscillatorType; notas: Record<SoundKind, Nota[]> }> = {
  // El de toda la vida: seno limpio, corto y directo.
  clasico: {
    onda: "sine",
    notas: {
      ingreso: [{ f: 660, t: 0, d: 0.12 }, { f: 880, t: 0.08, d: 0.18 }],
      gasto: [{ f: 480, t: 0, d: 0.16 }],
      eliminar: [{ f: 440, t: 0, d: 0.09 }, { f: 280, t: 0.06, d: 0.18 }],
      guardado: [{ f: 700, t: 0, d: 0.11 }],
    },
  },
  // Más grave, más largo y a menos volumen: para oficinas compartidas.
  suave: {
    onda: "sine",
    notas: {
      ingreso: [{ f: 392, t: 0, d: 0.2, p: 0.09 }, { f: 523, t: 0.11, d: 0.28, p: 0.09 }],
      gasto: [{ f: 330, t: 0, d: 0.26, p: 0.09 }],
      eliminar: [{ f: 294, t: 0, d: 0.14, p: 0.09 }, { f: 196, t: 0.09, d: 0.3, p: 0.09 }],
      guardado: [{ f: 440, t: 0, d: 0.2, p: 0.08 }],
    },
  },
  // Onda triangular y colas largas: suena a campanita de mostrador.
  campana: {
    onda: "triangle",
    notas: {
      ingreso: [{ f: 988, t: 0, d: 0.35, p: 0.11 }, { f: 1319, t: 0.07, d: 0.5, p: 0.09 }],
      gasto: [{ f: 784, t: 0, d: 0.42, p: 0.11 }],
      eliminar: [{ f: 659, t: 0, d: 0.16, p: 0.11 }, { f: 392, t: 0.09, d: 0.42, p: 0.1 }],
      guardado: [{ f: 1047, t: 0, d: 0.32, p: 0.1 }],
    },
  },
};

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function tone(audio: AudioContext, onda: OscillatorType, freq: number, start: number, duration: number, peak = 0.16) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = onda;
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
  reproducir(kind, juegoSonido());
}

/** Igual que `playSound` pero con un juego concreto y sin mirar el interruptor.
 *  Lo usa el selector de Ajustes para dejar oír cada opción al elegirla. */
export function probarSonido(kind: SoundKind, juego: JuegoSonido): void {
  reproducir(kind, juego);
}

function reproducir(kind: SoundKind, juego: JuegoSonido): void {
  try {
    const audio = getCtx();
    const { onda, notas } = JUEGOS[juego];
    for (const n of notas[kind]) tone(audio, onda, n.f, n.t, n.d, n.p);
  } catch {
    /* noop: audio no soportado o bloqueado por el navegador */
  }
}
