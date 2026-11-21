import { scenes } from '../content/scenes';
import { stickerId } from '../content/stickers';
import { DIFFICULTIES, type DifficultyId, type SceneDef } from '../content/types';
import { isComplete, type PlayState } from './play';

export { GAME_ID, stickerId, type StickerKind } from '../content/stickers';

export interface SceneProgress {
  /** Times finished, per difficulty. */
  done: Record<DifficultyId, number>;
  /** Times Kumo was found here. */
  kumo: number;
  /** Kumo's spot in the latest play, so the next play hides it somewhere new. */
  lastKumo: string | null;
}

export interface Settings {
  sound: boolean;
  /** Words under the pictures in the find list. */
  words: boolean;
}

export interface StickerRecord {
  /** The day it was earned, YYYY-MM-DD. */
  at: string;
}

/** Everything saved on the device. */
export interface SaveState {
  scenes: Record<string, SceneProgress>;
  /** Earned stickers by id, for example "peek-a-kumo/cozy-bedroom/easy". */
  stickers: Record<string, StickerRecord>;
  /** Unfinished plays, by "<scene>/<difficulty>". */
  plays: Record<string, PlayState>;
  settings: Settings;
  /** One-time tips the player has already seen. */
  seen: { installHint: boolean; zoomTip: boolean };
  stats: { finished: number; found: number; kumo: number };
}

export function newSceneProgress(): SceneProgress {
  return { done: { easy: 0, normal: 0, tricky: 0 }, kumo: 0, lastKumo: null };
}

export function newSave(): SaveState {
  return {
    scenes: {},
    stickers: {},
    plays: {},
    settings: { sound: true, words: true },
    seen: { installHint: false, zoomTip: false },
    stats: { finished: 0, found: 0, kumo: 0 },
  };
}

export function progressOf(state: SaveState, sceneId: string): SceneProgress {
  return state.scenes[sceneId] ?? newSceneProgress();
}

function progressFor(draft: SaveState, sceneId: string): SceneProgress {
  draft.scenes[sceneId] ??= newSceneProgress();
  return draft.scenes[sceneId];
}

export function timesFinished(state: SaveState, sceneId: string): number {
  const done = progressOf(state, sceneId).done;
  return DIFFICULTIES.reduce((sum, d) => sum + done[d], 0);
}

/** Scenes open one after another: a scene opens once the one before it is finished on any difficulty. */
export function isSceneOpen(state: SaveState, sceneId: string, list: readonly SceneDef[] = scenes): boolean {
  const index = list.findIndex((s) => s.id === sceneId);
  if (index <= 0) return index === 0;
  return timesFinished(state, list[index - 1]!.id) > 0;
}

/** Easy and Normal are open in an open scene; Tricky after finishing the scene once. */
export function isDifficultyOpen(state: SaveState, sceneId: string, difficulty: DifficultyId): boolean {
  if (!isSceneOpen(state, sceneId)) return false;
  return difficulty !== 'tricky' || timesFinished(state, sceneId) > 0;
}

export const playKey = (sceneId: string, difficulty: DifficultyId): string => `${sceneId}/${difficulty}`;


/** Today on this device, as YYYY-MM-DD. */
export function today(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The newest unfinished play, for the "Continue" button. */
export function latestPlay(state: SaveState): PlayState | null {
  let latest: PlayState | null = null;
  for (const play of Object.values(state.plays)) {
    if (!latest || play.started > latest.started) latest = play;
  }
  return latest;
}

/* ---------- Changes (each works on a draft copy of the save) ---------- */

/** A new play begins: remember it, and where Kumo hides this time. */
export function recordStart(draft: SaveState, play: PlayState): void {
  draft.plays[playKey(play.scene, play.difficulty)] = play;
  progressFor(draft, play.scene).lastKumo = play.layout.kumo?.spot ?? null;
}

/** Any change inside a play (a find, a hint). */
export function recordPlay(draft: SaveState, play: PlayState): void {
  draft.plays[playKey(play.scene, play.difficulty)] = play;
}

export function recordFind(draft: SaveState, play: PlayState): void {
  recordPlay(draft, play);
  draft.stats.found += 1;
}

/** Kumo found. Returns the sticker id when it is a new sticker. */
export function recordKumo(draft: SaveState, play: PlayState, day: string): string | null {
  // After the last object the play is finished; looking for Kumo then does not bring it back.
  if (!isComplete(play)) recordPlay(draft, play);
  progressFor(draft, play.scene).kumo += 1;
  draft.stats.kumo += 1;
  const id = stickerId(play.scene, 'kumo');
  if (draft.stickers[id]) return null;
  draft.stickers[id] = { at: day };
  return id;
}

/** The last object found. Returns the sticker id when it is a new sticker. */
export function recordFinish(draft: SaveState, play: PlayState, day: string): string | null {
  delete draft.plays[playKey(play.scene, play.difficulty)];
  progressFor(draft, play.scene).done[play.difficulty] += 1;
  draft.stats.finished += 1;
  const id = stickerId(play.scene, play.difficulty);
  if (draft.stickers[id]) return null;
  draft.stickers[id] = { at: day };
  return id;
}

/** The player left a play for good (for example "Start over"). */
export function dropPlay(draft: SaveState, sceneId: string, difficulty: DifficultyId): void {
  delete draft.plays[playKey(sceneId, difficulty)];
}
