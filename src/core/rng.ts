/**
 * A small seeded random number generator (mulberry32). The same seed always
 * gives the same shuffle, so layouts are repeatable in tests and in the editor.
 */
export interface Rng {
  /** A number from 0 (included) to 1 (not included). */
  next(): number;
  /** A number from min to max. */
  range(min: number, max: number): number;
  /** A whole number from min to max, both included. */
  int(min: number, max: number): number;
  /** One entry, or undefined for an empty list. */
  pick<T>(list: readonly T[]): T | undefined;
  /** A shuffled copy. */
  shuffle<T>(list: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => (list.length ? list[Math.floor(next() * list.length)] : undefined),
    shuffle: (list) => {
      const copy = [...list];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}

/** A fresh seed for a new play. */
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
