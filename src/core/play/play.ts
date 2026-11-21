import type { DifficultyId, DifficultyRules, SceneDef } from '../../content/types';
import { drawList, type Layout, type ShapeSet } from '../layout';
import { hitTest, isOnPaint, tappable, type Tappable } from '../shapes';

/**
 * One play of a scene: what is found so far, Kumo, and the hint. Saved after
 * every find, so closing the game and coming back continues right here.
 */
export interface PlayState {
  scene: string;
  difficulty: DifficultyId;
  /** The scene file's version when this play started. */
  rev: string;
  layout: Layout;
  /** Item numbers found, in the order they were found. */
  found: number[];
  kumo: boolean;
  /** When the hint is ready again (milliseconds since 1970). */
  hintAt: number;
  started: number;
}

export function startPlay(scene: SceneDef, difficulty: DifficultyId, layout: Layout, now: number): PlayState {
  return { scene: scene.id, difficulty, rev: scene.rev, layout, found: [], kumo: false, hintAt: now, started: now };
}

export function isTarget(play: PlayState, item: number): boolean {
  return (play.layout.items[item]?.entry ?? -1) >= 0;
}

/** Objects on the list not found yet. */
export function remaining(play: PlayState): number[] {
  return play.layout.items.flatMap((item, i) => (item.entry >= 0 && !play.found.includes(i) ? [i] : []));
}

export function targetCount(play: PlayState): number {
  return play.layout.items.filter((item) => item.entry >= 0).length;
}

export function isComplete(play: PlayState): boolean {
  return remaining(play).length === 0;
}

/** How many of one list line are found. */
export function entryFound(play: PlayState, entry: number): number {
  return play.found.filter((i) => play.layout.items[i]?.entry === entry).length;
}

/** Tap shapes for everything in this play, in drawing order. Made once per play. */
export interface PlayIndex {
  /** Objects by item number. */
  items: Tappable[];
  kumo: Tappable | null;
}

export function indexPlay(scene: SceneDef, layout: Layout, shapes: ShapeSet): PlayIndex {
  const items: Tappable[] = [];
  let kumo: Tappable | null = null;
  drawList(scene, layout, shapes).forEach((entry, order) => {
    const shape = shapes[entry.art]!;
    if (entry.kind === 'item') items[entry.index] = tappable(entry.index, shape, entry.pose, order);
    if (entry.kind === 'kumo') kumo = tappable(-1, shape, entry.pose, order);
  });
  return { items, kumo };
}

export type TapOutcome =
  | { kind: 'found'; item: number }
  | { kind: 'kumo' }
  /** Right on an object that is not on the list: it gives a little wiggle. */
  | { kind: 'decoy'; item: number }
  | { kind: 'miss' };

/**
 * What a tap at scene point (x, y) means. `margin` is how far off a tap may
 * be, in scene units (the game turns ~10 screen pixels into scene units).
 */
export function tapAt(play: PlayState, index: PlayIndex, x: number, y: number, margin: number): TapOutcome {
  const open = remaining(play).map((i) => index.items[i]!);
  if (index.kumo && !play.kumo) open.push(index.kumo);
  const hit = hitTest(open, x, y, margin);
  if (hit) return hit.key === -1 ? { kind: 'kumo' } : { kind: 'found', item: hit.key };

  let decoy: Tappable | null = null;
  for (const t of index.items) {
    if (!t || isTarget(play, t.key) || !isOnPaint(t, x, y)) continue;
    if (!decoy || t.order > decoy.order) decoy = t;
  }
  return decoy ? { kind: 'decoy', item: decoy.key } : { kind: 'miss' };
}

export function markFound(play: PlayState, item: number): PlayState {
  if (!isTarget(play, item) || play.found.includes(item)) return play;
  return { ...play, found: [...play.found, item] };
}

export function markKumo(play: PlayState): PlayState {
  return play.kumo || !play.layout.kumo ? play : { ...play, kumo: true };
}

/* ---------- Hints: free, and they refill by themselves ---------- */

export function hintReady(play: PlayState, now: number): boolean {
  return now >= play.hintAt;
}

/** How full the hint is, 0 to 1. */
export function hintFill(play: PlayState, rules: DifficultyRules, now: number): number {
  const wait = rules.hintSeconds * 1000;
  if (wait <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - (play.hintAt - now) / wait));
}

/**
 * Uses the hint: picks an object still to find and starts the refill.
 * `choose` picks from a list (random in the game, fixed in tests).
 */
export function takeHint(
  play: PlayState,
  rules: DifficultyRules,
  now: number,
  choose: (count: number) => number = (count) => Math.floor(Math.random() * count),
): { play: PlayState; item: number } | null {
  const open = remaining(play);
  if (!hintReady(play, now) || open.length === 0) return null;
  const item = open[Math.min(open.length - 1, Math.max(0, choose(open.length)))]!;
  return { play: { ...play, hintAt: now + rules.hintSeconds * 1000 }, item };
}

/** After loading: a clock that jumped (or a changed setting) never makes the wait longer than one refill. */
export function settleHint(play: PlayState, rules: DifficultyRules, now: number): PlayState {
  const latest = now + rules.hintSeconds * 1000;
  return play.hintAt > latest ? { ...play, hintAt: latest } : play;
}
