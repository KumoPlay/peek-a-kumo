import { describe, expect, it } from 'vitest';
import { scenes, type SceneDef } from '../content';
import type { Layout } from './layout/types';
import { markFound, startPlay } from './play';
import {
  isDifficultyOpen,
  isSceneOpen,
  latestPlay,
  newSave,
  recordFinish,
  recordKumo,
  recordStart,
  stickerId,
  today,
} from './progress';

const scene = scenes[0]!;
const layout: Layout = {
  seed: 1,
  items: [{ obj: 'teacup', tint: null, spot: 'x', x: 100, y: 100, size: 60, rot: 0, flip: false, z: 10, entry: 0 }],
  kumo: { spot: 'window', pose: 'front', x: 500, y: 300, size: 60, rot: 0, flip: false, z: 10 },
  entries: [{ obj: 'teacup', tint: null, count: 1 }],
};

describe('progress', () => {
  it('opens scenes one after another', () => {
    const fake: SceneDef[] = [{ ...scene, id: 'one' }, { ...scene, id: 'two' }];
    const save = newSave();
    expect(isSceneOpen(save, 'one', fake)).toBe(true);
    expect(isSceneOpen(save, 'two', fake)).toBe(false);
    save.scenes.one = { done: { easy: 1, normal: 0, tricky: 0 }, kumo: 0, lastKumo: null };
    expect(isSceneOpen(save, 'two', fake)).toBe(true);
  });

  it('opens Tricky once a scene is finished on any difficulty', () => {
    const save = newSave();
    expect(isDifficultyOpen(save, scene.id, 'easy')).toBe(true);
    expect(isDifficultyOpen(save, scene.id, 'normal')).toBe(true);
    expect(isDifficultyOpen(save, scene.id, 'tricky')).toBe(false);
    save.scenes[scene.id] = { done: { easy: 0, normal: 1, tricky: 0 }, kumo: 0, lastKumo: null };
    expect(isDifficultyOpen(save, scene.id, 'tricky')).toBe(true);
  });

  it('remembers where Kumo hid, so the next play hides it elsewhere', () => {
    const save = newSave();
    recordStart(save, startPlay(scene, 'easy', layout, 5));
    expect(save.scenes[scene.id]?.lastKumo).toBe('window');
    expect(latestPlay(save)?.difficulty).toBe('easy');
  });

  it('gives a sticker the first time a scene is finished on each difficulty', () => {
    const save = newSave();
    const play = markFound(startPlay(scene, 'easy', layout, 0), 0);
    recordStart(save, play);
    expect(recordFinish(save, play, '2026-11-21')).toBe(stickerId(scene.id, 'easy'));
    expect(save.stickers[`peek-a-kumo/${scene.id}/easy`]).toEqual({ at: '2026-11-21' });
    expect(save.plays).toEqual({});
    expect(recordFinish(save, play, '2026-11-22')).toBeNull();
    expect(save.scenes[scene.id]?.done.easy).toBe(2);
  });

  it('gives the Kumo sticker once, and finding Kumo after the end does not bring the play back', () => {
    const save = newSave();
    let play = startPlay(scene, 'normal', layout, 0);
    expect(recordKumo(save, { ...play, kumo: true }, '2026-11-21')).toBe(stickerId(scene.id, 'kumo'));
    expect(recordKumo(save, { ...play, kumo: true }, '2026-11-21')).toBeNull();
    play = markFound(play, 0);
    recordFinish(save, play, '2026-11-21');
    recordKumo(save, { ...play, kumo: true }, '2026-11-21');
    expect(save.plays).toEqual({});
    expect(save.stats.kumo).toBe(3);
  });

  it('writes dates as year-month-day', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
