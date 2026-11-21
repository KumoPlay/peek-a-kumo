import { tints } from '../../content/colors';
import { objectById } from '../../content/objects';
import { sceneById } from '../../content/scenes';
import { DIFFICULTIES, type DifficultyId } from '../../content/types';
import type { FindEntry, Layout, PlacedItem, PlacedKumo } from '../layout/types';
import type { PlayState } from '../play';
import { GAME_ID } from '../../content/stickers';
import { newSave, newSceneProgress, playKey, type SaveState, type SceneProgress } from '../progress';

/**
 * The save format version. Raise it by one whenever the shape of SaveState
 * changes, and add a matching step in migrations.ts.
 */
export const SAVE_VERSION = 1;
export const SAVE_APP = GAME_ID;

/** What is written to storage and into backup codes. */
export interface SaveFile {
  app: typeof SAVE_APP;
  /** Save format version this file was written with. */
  v: number;
  /** Counts up with every save. The highest number is the newest save. */
  rev: number;
  state: unknown;
}

/** 'other-game' is a backup from another KumoPlay game, such as Kumo Café. */
export type SaveErrorCode = 'not-a-save' | 'other-game' | 'corrupt' | 'too-new';

export class SaveError extends Error {
  readonly code: SaveErrorCode;
  constructor(code: SaveErrorCode) {
    super(`Save problem: ${code}`);
    this.name = 'SaveError';
    this.code = code;
  }
}

export function toSaveFile(state: SaveState, rev: number): SaveFile {
  return { app: SAVE_APP, v: SAVE_VERSION, rev, state };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks the outer wrapper of a save. Throws SaveError when it is not one of ours. */
export function asSaveFile(raw: unknown): SaveFile {
  if (isRecord(raw) && typeof raw.app === 'string' && raw.app !== SAVE_APP) throw new SaveError('other-game');
  if (!isRecord(raw) || raw.app !== SAVE_APP) throw new SaveError('not-a-save');
  if (!Number.isInteger(raw.v) || (raw.v as number) < 0 || !isRecord(raw.state)) throw new SaveError('corrupt');
  return { app: SAVE_APP, v: raw.v as number, rev: wholeNumber(raw.rev, 0), state: raw.state };
}

function wholeNumber(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

const isNum = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function readScene(raw: unknown): SceneProgress {
  const progress = newSceneProgress();
  if (!isRecord(raw)) return progress;
  const done = isRecord(raw.done) ? raw.done : {};
  for (const d of DIFFICULTIES) progress.done[d] = wholeNumber(done[d], 0);
  progress.kumo = wholeNumber(raw.kumo, 0);
  progress.lastKumo = isText(raw.lastKumo) ? raw.lastKumo : null;
  return progress;
}

/** A saved layout, checked piece by piece. Anything odd: null, and the play starts fresh. */
function readLayout(raw: unknown): Layout | null {
  if (!isRecord(raw) || !Array.isArray(raw.items) || !Array.isArray(raw.entries)) return null;
  const entries: FindEntry[] = [];
  for (const e of raw.entries) {
    if (!isRecord(e) || !isText(e.obj) || !objectById(e.obj) || !isNum(e.count) || e.count < 1) return null;
    if (e.tint !== null && !(isText(e.tint) && e.tint in tints)) return null;
    entries.push({ obj: e.obj, tint: e.tint, count: Math.floor(e.count) });
  }
  const items: PlacedItem[] = [];
  for (const it of raw.items) {
    if (!isRecord(it) || !isText(it.obj) || !objectById(it.obj) || !isText(it.spot)) return null;
    if (![it.x, it.y, it.size, it.rot, it.z, it.entry].every(isNum) || typeof it.flip !== 'boolean') return null;
    if (it.tint !== null && !(isText(it.tint) && it.tint in tints)) return null;
    const entry = Math.floor(it.entry as number);
    if (entry >= entries.length || entry < -1) return null;
    items.push({
      obj: it.obj,
      tint: it.tint,
      spot: it.spot,
      x: it.x as number,
      y: it.y as number,
      size: it.size as number,
      rot: it.rot as number,
      flip: it.flip,
      z: it.z as number,
      entry,
    });
  }
  // Every list line needs exactly as many objects as it asks for.
  for (let e = 0; e < entries.length; e += 1) {
    if (items.filter((it) => it.entry === e).length !== entries[e]!.count) return null;
  }
  let kumo: PlacedKumo | null = null;
  if (raw.kumo !== null && raw.kumo !== undefined) {
    const k = raw.kumo;
    if (!isRecord(k) || !isText(k.spot) || !isText(k.pose)) return null;
    if (![k.x, k.y, k.size, k.rot, k.z].every(isNum) || typeof k.flip !== 'boolean') return null;
    kumo = {
      spot: k.spot,
      pose: k.pose,
      x: k.x as number,
      y: k.y as number,
      size: k.size as number,
      rot: k.rot as number,
      flip: k.flip,
      z: k.z as number,
    };
  }
  return { seed: wholeNumber(raw.seed, 0, 0, 0xffffffff), items, kumo, entries };
}

function readPlay(raw: unknown, key: string): PlayState | null {
  if (!isRecord(raw) || !isText(raw.scene) || !DIFFICULTIES.includes(raw.difficulty as DifficultyId)) return null;
  const scene = sceneById(raw.scene);
  const difficulty = raw.difficulty as DifficultyId;
  // A scene that was removed or changed by an update: its unfinished play starts fresh.
  if (!scene || raw.rev !== scene.rev || key !== playKey(scene.id, difficulty)) return null;
  const layout = readLayout(raw.layout);
  if (!layout) return null;
  const found = Array.isArray(raw.found) ? raw.found : [];
  const foundItems = [...new Set(found.filter((i): i is number => Number.isInteger(i)))].filter(
    (i) => (layout.items[i]?.entry ?? -1) >= 0,
  );
  // A finished play is never kept as unfinished.
  if (foundItems.length >= layout.items.filter((it) => it.entry >= 0).length) return null;
  return {
    scene: scene.id,
    difficulty,
    rev: scene.rev,
    layout,
    found: foundItems,
    kumo: raw.kumo === true && layout.kumo !== null,
    hintAt: isNum(raw.hintAt) ? raw.hintAt : 0,
    started: isNum(raw.started) ? raw.started : 0,
  };
}

/**
 * Turns loaded data into a SaveState the game can trust: missing or broken
 * values get safe defaults, and a broken unfinished play is dropped (the scene
 * simply starts fresh). Throws SaveError('corrupt') only when there is nothing to work with.
 */
export function normalizeState(raw: unknown): SaveState {
  if (!isRecord(raw)) throw new SaveError('corrupt');
  const save = newSave();

  // Progress for scenes that no longer exist is kept, in case they come back.
  if (isRecord(raw.scenes)) {
    for (const [id, value] of Object.entries(raw.scenes)) save.scenes[id] = readScene(value);
  }
  // Stickers are never thrown away, even ones this version does not know.
  if (isRecord(raw.stickers)) {
    for (const [id, value] of Object.entries(raw.stickers)) {
      if (id.startsWith(`${GAME_ID}/`) && isRecord(value)) save.stickers[id] = { at: isDay(value.at) ? value.at : '' };
    }
  }
  if (isRecord(raw.plays)) {
    for (const [key, value] of Object.entries(raw.plays)) {
      const play = readPlay(value, key);
      if (play) save.plays[key] = play;
    }
  }
  const settings = isRecord(raw.settings) ? raw.settings : {};
  save.settings = { sound: settings.sound !== false, words: settings.words !== false };
  const seen = isRecord(raw.seen) ? raw.seen : {};
  save.seen = { installHint: seen.installHint === true, zoomTip: seen.zoomTip === true };
  const stats = isRecord(raw.stats) ? raw.stats : {};
  save.stats = {
    finished: wholeNumber(stats.finished, 0),
    found: wholeNumber(stats.found, 0),
    kumo: wholeNumber(stats.kumo, 0),
  };
  return save;
}
