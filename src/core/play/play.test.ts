import { describe, expect, it } from 'vitest';
import { difficulties, type SceneDef } from '../../content';
import { boxShape } from '../shapes';
import type { Layout, PlacedItem, ShapeSet } from '../layout/types';
import {
  entryFound,
  hintFill,
  hintReady,
  indexPlay,
  isComplete,
  markFound,
  markKumo,
  remaining,
  settleHint,
  startPlay,
  takeHint,
  tapAt,
} from './play';

const vb = [0, 0, 100, 100] as const;
const solid = boxShape(vb, 10, 10);
const shapes: ShapeSet = { 'objects/a': solid, 'objects/b': solid, 'objects/c': solid, 'kumo/front': solid };

const scene: SceneDef = {
  format: 1,
  id: 'test-room',
  name: 'Test Room',
  order: 1,
  size: [1000, 1000],
  art: 'test-room',
  emblem: 'test-room',
  pool: [],
  props: [],
  spots: [],
  kumo: [],
  difficulties: {},
  rev: 'abc',
};

const item = (obj: string, x: number, entry: number): PlacedItem => ({
  obj,
  tint: null,
  spot: `s${x}`,
  x,
  y: 500,
  size: 60,
  rot: 0,
  flip: false,
  z: 10,
  entry,
});

// "Find 1 a" and "find 3 b"; c is a decoy; Kumo sits at x 900.
const layout: Layout = {
  seed: 1,
  items: [item('a', 100, 0), item('b', 200, 1), item('b', 300, 1), item('b', 400, 1), item('c', 600, -1)],
  kumo: { spot: 'k', pose: 'front', x: 900, y: 500, size: 60, rot: 0, flip: false, z: 10 },
  entries: [
    { obj: 'a', tint: null, count: 1 },
    { obj: 'b', tint: null, count: 3 },
  ],
};

describe('a play', () => {
  const index = indexPlay(scene, layout, shapes);

  it('finds an object when its shape is tapped', () => {
    const play = startPlay(scene, 'normal', layout, 0);
    expect(tapAt(play, index, 100, 500, 10)).toEqual({ kind: 'found', item: 0 });
    expect(tapAt(play, index, 100 + 30 + 5, 500, 10)).toEqual({ kind: 'found', item: 0 }); // just outside, within the margin
  });

  it('counts "find 3 of" one by one', () => {
    let play = startPlay(scene, 'normal', layout, 0);
    play = markFound(play, 2);
    play = markFound(play, 2); // a second tap on the same one changes nothing
    expect(entryFound(play, 1)).toBe(1);
    play = markFound(play, 1);
    play = markFound(play, 3);
    expect(entryFound(play, 1)).toBe(3);
    expect(isComplete(play)).toBe(false);
    play = markFound(play, 0);
    expect(isComplete(play)).toBe(true);
  });

  it('a found object cannot be found again', () => {
    const play = markFound(startPlay(scene, 'normal', layout, 0), 0);
    expect(tapAt(play, index, 100, 500, 10).kind).toBe('miss');
  });

  it('a decoy only wiggles, and an empty spot is a gentle miss', () => {
    const play = startPlay(scene, 'normal', layout, 0);
    expect(tapAt(play, index, 600, 500, 10)).toEqual({ kind: 'decoy', item: 4 });
    expect(markFound(play, 4)).toBe(play);
    expect(tapAt(play, index, 750, 100, 10)).toEqual({ kind: 'miss' });
  });

  it('finds Kumo once, and finishing never needs Kumo', () => {
    let play = startPlay(scene, 'normal', layout, 0);
    expect(tapAt(play, index, 900, 500, 10)).toEqual({ kind: 'kumo' });
    play = markKumo(play);
    expect(tapAt(play, index, 900, 500, 10).kind).toBe('miss');
    let other = startPlay(scene, 'normal', layout, 0);
    for (const i of [0, 1, 2, 3]) other = markFound(other, i);
    expect(isComplete(other)).toBe(true);
    expect(other.kumo).toBe(false);
  });
});

describe('hints', () => {
  const rules = difficulties.normal; // refills in 20 s

  it('are ready at the start and point at something still to find', () => {
    const play = markFound(startPlay(scene, 'normal', layout, 1000), 0);
    expect(hintReady(play, 1000)).toBe(true);
    const used = takeHint(play, rules, 1000, () => 0);
    expect(used?.item).toBe(1);
    expect(remaining(play)).toContain(used!.item);
  });

  it('refill by themselves after a short wait', () => {
    const used = takeHint(startPlay(scene, 'normal', layout, 0), rules, 0)!;
    expect(hintReady(used.play, 10_000)).toBe(false);
    expect(hintFill(used.play, rules, 10_000)).toBeCloseTo(0.5);
    expect(takeHint(used.play, rules, 10_000)).toBeNull();
    expect(hintReady(used.play, 20_000)).toBe(true);
    expect(hintFill(used.play, rules, 25_000)).toBe(1);
  });

  it('never point at Kumo, and stop when everything is found', () => {
    let play = startPlay(scene, 'normal', layout, 0);
    for (let n = 0; n < 50; n += 1) {
      const used = takeHint(play, rules, n * 30_000);
      expect(used && used.item >= 0 && used.item <= 3).toBe(true);
    }
    for (const i of [0, 1, 2, 3]) play = markFound(play, i);
    expect(takeHint(play, rules, 10_000_000)).toBeNull();
  });

  it('never make you wait longer than one refill, even if the clock jumped', () => {
    const play = { ...startPlay(scene, 'normal', layout, 0), hintAt: 99_999_999 };
    expect(settleHint(play, rules, 1000).hintAt).toBe(21_000);
  });
});
