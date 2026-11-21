/**
 * Soft little sounds, made with the Web Audio API (no audio files to download).
 * Nothing can play until the player has tapped the screen once: browsers
 * require that, and it is also what we want.
 */
type AudioContextClass = typeof AudioContext;

let context: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Call from a tap. Later calls wake the sound up again if the browser paused it. */
export function unlockAudio(): void {
  try {
    if (!context) {
      const Context: AudioContextClass | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
      if (!Context) return;
      context = new Context();
    }
    if (context.state === 'suspended') void context.resume();
  } catch {
    context = null;
  }
}

interface Note {
  /** Pitch in hertz. */
  freq: number;
  /** Seconds after the sound starts. */
  at?: number;
  /** Length in seconds. */
  length?: number;
  /** Pitch to glide to, for a "bloop". */
  glideTo?: number;
  volume?: number;
  wave?: OscillatorType;
}

function play(notes: Note[]): void {
  if (!enabled || !context || context.state !== 'running') return;
  try {
    const now = context.currentTime;
    for (const note of notes) {
      const start = now + (note.at ?? 0);
      const length = note.length ?? 0.16;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.wave ?? 'sine';
      oscillator.frequency.setValueAtTime(note.freq, start);
      if (note.glideTo) oscillator.frequency.exponentialRampToValueAtTime(note.glideTo, start + length);
      // A quick, gentle rise and a soft fade, so nothing clicks or startles.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.volume ?? 0.07, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + length + 0.02);
    }
  } catch {
    // Sound is a nice extra; never let it break the game.
  }
}

/** Every sound in the game. To change one, edit its notes here. */
export const sfx = {
  tap: () => play([{ freq: 520, length: 0.06, volume: 0.03, wave: 'triangle' }]),
  /** A tap that found nothing: a soft, friendly "boop", never a buzzer. */
  miss: () => play([{ freq: 300, glideTo: 260, length: 0.12, volume: 0.035, wave: 'triangle' }]),
  /** A tap on something that is not on the list. */
  wiggle: () => play([{ freq: 420, glideTo: 520, length: 0.08, volume: 0.035, wave: 'triangle' }, { freq: 520, glideTo: 420, at: 0.08, length: 0.1, volume: 0.03, wave: 'triangle' }]),
  /** Found one. The chime climbs as the list gets shorter. `progress` is 0 to 1. */
  found: (progress: number) => {
    const base = 659 * 2 ** (Math.round(progress * 7) / 12);
    play([
      { freq: base, length: 0.14, volume: 0.06 },
      { freq: base * 1.5, at: 0.07, length: 0.22, volume: 0.045 },
    ]);
  },
  /** All three of a "find 3 of". */
  lineDone: () =>
    play([
      { freq: 784, length: 0.1, volume: 0.05 },
      { freq: 988, at: 0.08, length: 0.1, volume: 0.05 },
      { freq: 1319, at: 0.16, length: 0.25, volume: 0.045 },
    ]),
  /** Kumo! A little giggle. */
  kumo: () =>
    play([
      { freq: 880, glideTo: 1175, length: 0.08, volume: 0.05 },
      { freq: 988, glideTo: 1319, at: 0.1, length: 0.08, volume: 0.05 },
      { freq: 1109, glideTo: 1480, at: 0.2, length: 0.14, volume: 0.045 },
    ]),
  hint: () =>
    play([
      { freq: 1568, length: 0.12, volume: 0.03 },
      { freq: 2093, at: 0.08, length: 0.18, volume: 0.025 },
      { freq: 1760, at: 0.18, length: 0.24, volume: 0.02 },
    ]),
  done: () =>
    play([
      { freq: 523, length: 0.14 },
      { freq: 659, at: 0.12, length: 0.14 },
      { freq: 784, at: 0.24, length: 0.14 },
      { freq: 1047, at: 0.36, length: 0.45 },
      { freq: 1319, at: 0.36, length: 0.45, volume: 0.04 },
    ]),
  sticker: () =>
    play([
      { freq: 1047, length: 0.1, volume: 0.04 },
      { freq: 1319, at: 0.06, length: 0.12, volume: 0.04 },
      { freq: 1568, at: 0.12, length: 0.3, volume: 0.035 },
    ]),
};
