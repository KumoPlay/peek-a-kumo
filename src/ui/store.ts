import { useEffect, useState } from 'preact/hooks';
import { clone, newSave, type SaveState } from '../core';
import { setSoundEnabled } from '../platform/audio';
import { saveGame } from '../platform/storage';

type Listener = () => void;

/**
 * Holds the player's progress and is the only place that changes it. Every
 * change works on a copy and is saved at once: every find, every hint, every
 * finished scene and every settings change.
 */
export class Store {
  private state: SaveState;
  private rev: number;
  private stopped = false;
  private readonly listeners = new Set<Listener>();

  constructor(state: SaveState, rev: number) {
    this.state = state;
    this.rev = rev;
    setSoundEnabled(state.settings.sound);
  }

  static startNew(): Store {
    const store = new Store(newSave(), 0);
    store.save();
    return store;
  }

  get(): SaveState {
    return this.state;
  }

  getRev(): number {
    return this.rev;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Changes progress, saves, and tells the screens. Returns whatever `change` returns. */
  update<T>(change: (draft: SaveState) => T): T {
    const draft = clone(this.state);
    const result = change(draft);
    if (this.stopped) return result;
    this.state = draft;
    setSoundEnabled(draft.settings.sound);
    this.save();
    this.listeners.forEach((listener) => listener());
    return result;
  }

  save(): void {
    if (this.stopped) return;
    this.rev += 1;
    saveGame(this.state, this.rev);
  }

  /** Swaps in other progress: a loaded backup, or a fresh start. */
  replace(state: SaveState): void {
    if (this.stopped) return;
    this.state = state;
    setSoundEnabled(state.settings.sound);
    this.save();
    this.listeners.forEach((listener) => listener());
  }

  /** Stops saving, when another tab has taken over. */
  stop(): void {
    this.stopped = true;
  }
}

/** The current progress, kept up to date in a component. */
export function useSave(store: Store): SaveState {
  const [, redraw] = useState(0);
  useEffect(() => store.subscribe(() => redraw((n) => n + 1)), [store]);
  return store.get();
}
