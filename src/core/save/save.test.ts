import { describe, expect, it } from 'vitest';
import { scenes } from '../../content';
import type { Layout } from '../layout/types';
import { markFound, startPlay } from '../play';
import { newSave, playKey } from '../progress';
import {
  decodeSaveCode,
  encodeSaveCode,
  exportSaveCode,
  importSaveCode,
  migrateSave,
  normalizeState,
  openSave,
  SAVE_VERSION,
  SaveError,
  toSaveFile,
  type SaveFile,
} from '.';

const scene = scenes[0]!;
const layout: Layout = {
  seed: 42,
  items: [
    { obj: 'teacup', tint: 'pink', spot: 'bed-1', x: 655, y: 650, size: 68.5, rot: -4.2, flip: true, z: 50, entry: 0 },
    { obj: 'star', tint: 'butter', spot: 'bed-2', x: 730, y: 672, size: 50, rot: 3, flip: false, z: 50, entry: 1 },
    { obj: 'sock', tint: null, spot: 'bed-3', x: 810, y: 680, size: 70, rot: 0, flip: false, z: 50, entry: -1 },
  ],
  kumo: { spot: 'window', pose: 'front', x: 545, y: 336, size: 60, rot: 0, flip: false, z: 15 },
  entries: [
    { obj: 'teacup', tint: 'pink', count: 1 },
    { obj: 'star', tint: 'butter', count: 1 },
  ],
};

function errorCode(run: () => unknown): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof SaveError ? error.code : 'other';
  }
}

function fullSave() {
  const save = newSave();
  save.scenes[scene.id] = { done: { easy: 2, normal: 1, tricky: 0 }, kumo: 1, lastKumo: 'window' };
  save.stickers[`peek-a-kumo/${scene.id}/easy`] = { at: '2026-11-21' };
  save.plays[playKey(scene.id, 'normal')] = { ...markFound(startPlay(scene, 'normal', layout, 1000), 0), hintAt: 5000 };
  save.settings = { sound: false, words: false };
  save.seen = { installHint: true, zoomTip: true };
  save.stats = { finished: 3, found: 30, kumo: 1 };
  return save;
}

describe('save files', () => {
  it('open again exactly as they were saved, including a play in progress', () => {
    const save = fullSave();
    const opened = openSave(JSON.parse(JSON.stringify(toSaveFile(save, 7))));
    expect(opened).toEqual({ state: save, rev: 7 });
  });

  it('repair damaged or strange values instead of failing', () => {
    const save = normalizeState({
      scenes: { [scene.id]: { done: { easy: -3, normal: 'x', tricky: 2.7 }, kumo: Number.NaN } },
      stickers: { 'peek-a-kumo/old-scene/easy': { at: 'yesterday' }, 'kumo-cafe/whatever': { at: '2026-01-01' } },
      settings: { words: 'no' },
      stats: { found: -1 },
    });
    expect(save.scenes[scene.id]).toEqual({ done: { easy: 0, normal: 0, tricky: 2 }, kumo: 0, lastKumo: null });
    // A sticker from a scene this version does not know is kept; another game's id is not ours.
    expect(save.stickers).toEqual({ 'peek-a-kumo/old-scene/easy': { at: '' } });
    expect(save.settings).toEqual({ sound: true, words: true });
    expect(save.stats.found).toBe(0);
  });

  it('drop an unfinished play that no longer fits, so the scene simply starts fresh', () => {
    const good = fullSave().plays[playKey(scene.id, 'normal')]!;
    const key = playKey(scene.id, 'normal');
    const tryPlay = (play: unknown) => normalizeState({ plays: { [key]: play } }).plays[key];
    expect(tryPlay(good)).toEqual(good);
    expect(tryPlay({ ...good, rev: 'older-scene-file' })).toBeUndefined();
    expect(tryPlay({ ...good, scene: 'no-such-scene' })).toBeUndefined();
    expect(tryPlay({ ...good, layout: { ...good.layout, items: [{ obj: 'dragon' }] } })).toBeUndefined();
    expect(tryPlay({ ...good, layout: { ...good.layout, entries: [{ obj: 'teacup', tint: null, count: 3 }] } })).toBeUndefined();
    expect(tryPlay({ ...good, found: [0, 1] })).toBeUndefined(); // everything found: it was finished
    expect(tryPlay({ ...good, found: [0, 0, 2, 99, 'x'] })?.found).toEqual([0]);
    expect(normalizeState({ plays: { 'wrong-key': good } }).plays).toEqual({});
  });

  it('refuse things that are not saves', () => {
    expect(errorCode(() => openSave('hello'))).toBe('not-a-save');
    expect(errorCode(() => openSave({ app: 'kumo-cafe', v: 1, rev: 1, state: {} }))).toBe('other-game');
    expect(errorCode(() => openSave({ app: 'peek-a-kumo', v: 1, rev: 1, state: 'scrambled' }))).toBe('corrupt');
  });

  it('refuse a save from a newer version of the game, rather than damage it', () => {
    expect(errorCode(() => openSave({ ...toSaveFile(newSave(), 1), v: SAVE_VERSION + 1 }))).toBe('too-new');
  });
});

describe('backup codes', () => {
  it('bring back exactly the same progress', () => {
    const save = fullSave();
    expect(importSaveCode(exportSaveCode(save, 12))).toEqual({ state: save, rev: 12 });
  });

  it('survive spaces and line breaks from copying', () => {
    const code = exportSaveCode(fullSave(), 3);
    const messy = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} ${code.slice(50)}\n`;
    expect(importSaveCode(messy).rev).toBe(3);
  });

  it('notice a code that was cut short or changed', () => {
    const code = exportSaveCode(fullSave(), 3);
    expect(errorCode(() => importSaveCode(code.slice(0, -10)))).toBe('corrupt');
    expect(errorCode(() => importSaveCode(code.replace(/.(?=\.[0-9a-f]{8}$)/, 'Q')))).toBe('corrupt');
    expect(errorCode(() => importSaveCode('hello'))).toBe('not-a-save');
  });

  it('recognise a code from another KumoPlay game', () => {
    const other = encodeSaveCode({ app: 'kumo-farm', v: 1, rev: 1, state: {} } as unknown as SaveFile);
    expect(errorCode(() => decodeSaveCode(other))).toBe('other-game');
  });
});

describe('save upgrades', () => {
  it('walk an old save through every step, in order', () => {
    const file: SaveFile = { app: 'peek-a-kumo', v: 1, rev: 4, state: { log: [] } };
    const table = {
      1: (state: Record<string, unknown>) => ({ ...state, log: [...(state.log as string[]), 'one'] }),
      2: (state: Record<string, unknown>) => ({ ...state, log: [...(state.log as string[]), 'two'] }),
    };
    const upgraded = migrateSave(file, table, 3);
    expect(upgraded).toEqual({ app: 'peek-a-kumo', v: 3, rev: 4, state: { log: ['one', 'two'] } });
    expect(file.state).toEqual({ log: [] });
  });

  it('report a missing step as damage instead of guessing', () => {
    expect(errorCode(() => migrateSave({ app: 'peek-a-kumo', v: 1, rev: 1, state: {} }, {}, 2))).toBe('corrupt');
  });
});
