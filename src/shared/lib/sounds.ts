/**
 * Sonidos de la app — 100% sintetizados con Web Audio.
 *
 * Por qué sintetizados y no archivos:
 *  - El himno/música oficial del Mundial es copyright de FIFA — no se puede
 *    embeber legalmente.
 *  - Cero assets = cero peso extra en el bundle y funciona offline (PWA).
 *  - Los browsers bloquean autoplay; estos sonidos solo suenan como
 *    respuesta a un gesto del usuario (guardar pronóstico, abrir un logro),
 *    que es exactamente cuando el AudioContext está permitido.
 *
 * Toda reproducción pasa por `play()`, que chequea la preferencia del
 * usuario (apagado por defecto) y falla silenciosamente si el browser no
 * soporta AudioContext.
 */
import { useThemeStore } from '@/theme/theme-store';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  // Safari deja el contexto en 'suspended' hasta el primer gesto.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Nota corta con envolvente — building block de todos los sonidos. */
function tone(
  ac: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  opts: { type?: OscillatorType; gain?: number } = {},
) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = opts.type ?? 'triangle';
  osc.frequency.value = freq;
  const peak = opts.gain ?? 0.12;
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(peak, startAt + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

const SOUNDS = {
  /** "¡Gol!" — arpegio ascendente rápido, festivo. Para guardar pronóstico. */
  goal(ac: AudioContext) {
    const t = ac.currentTime;
    tone(ac, 523.25, t, 0.12);          // C5
    tone(ac, 659.25, t + 0.08, 0.12);   // E5
    tone(ac, 783.99, t + 0.16, 0.22);   // G5
    tone(ac, 1046.5, t + 0.24, 0.35, { gain: 0.15 }); // C6
  },
  /** Chime suave de dos notas — confirmaciones (lineup, plantel guardado). */
  chime(ac: AudioContext) {
    const t = ac.currentTime;
    tone(ac, 880, t, 0.15, { type: 'sine' });        // A5
    tone(ac, 1318.5, t + 0.1, 0.4, { type: 'sine', gain: 0.1 }); // E6
  },
  /** Fanfarria corta — abrir un cromo de logro conseguido. */
  fanfare(ac: AudioContext) {
    const t = ac.currentTime;
    tone(ac, 392, t, 0.14, { type: 'square', gain: 0.06 });        // G4
    tone(ac, 523.25, t + 0.12, 0.14, { type: 'square', gain: 0.06 }); // C5
    tone(ac, 659.25, t + 0.24, 0.3, { type: 'square', gain: 0.07 });  // E5
    tone(ac, 783.99, t + 0.24, 0.45, { type: 'triangle', gain: 0.1 }); // G5 (acorde)
  },
} as const;

export type SoundName = keyof typeof SOUNDS;

/**
 * Reproduce un sonido si el usuario activó los sonidos en Ajustes.
 * Seguro de llamar desde cualquier lado — nunca lanza.
 */
export function play(name: SoundName): void {
  try {
    if (!useThemeStore.getState().soundEnabled) return;
    const ac = getCtx();
    if (!ac) return;
    SOUNDS[name](ac);
  } catch {
    // AudioContext bloqueado o no soportado — silencio, sin romper la UI.
  }
}
