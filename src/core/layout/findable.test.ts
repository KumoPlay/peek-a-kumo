import { beforeAll, describe, expect, it } from 'vitest';
import { shapesForScene } from '../../art/shapes';
import { kumoRules, rulesFor, scenes, type DifficultyId, type SceneDef } from '../../content';
import { indexPlay, isComplete, markFound, markKumo, startPlay, tapAt } from '../play';
import { checkLayout, coverage, visiblePoints } from './check';
import { checkRulesFor, shuffleLayout } from './shuffle';
import type { ShapeSet } from './types';

/**
 * The promise of the game: every shuffled layout leaves every object on the
 * list findable. Each layout is played to the end by tapping only where an
 * object can actually be seen, with the same tap code the game uses.
 */
const SEEDS = Number(process.env.FINDABLE_SEEDS ?? 300);
/** Difficulties each scene must support. Tricky joins in step 3. */
const PLAYABLE: DifficultyId[] = ['easy', 'normal', 'tricky'];
/** The tap margin on a phone at the furthest zoom: about 10 px at ~0.39 px per scene unit. */
const PHONE_MARGIN = 26;

const shapeSets = new Map<string, ShapeSet>();
beforeAll(async () => {
  for (const scene of scenes) shapeSets.set(scene.id, await shapesForScene(scene.art));
});

function playThrough(scene: SceneDef, difficulty: DifficultyId, seed: number, shapes: ShapeSet, avoidKumo: string | null) {
  const rules = rulesFor(scene, difficulty);
  const layout = shuffleLayout({ scene, difficulty, shapes, seed, avoidKumo });
  const report = checkLayout(scene, layout, shapes, checkRulesFor(rules));
  expect(report.problems, `${scene.id} ${difficulty} seed ${seed}`).toEqual([]);

  // The list asks for exactly what was placed.
  expect(layout.entries.reduce((sum, e) => sum + e.count, 0)).toBe(rules.find);
  layout.entries.forEach((entry, i) => {
    expect(layout.items.filter((item) => item.entry === i).every((item) => item.obj === entry.obj && item.tint === entry.tint)).toBe(true);
  });
  // A decoy is never the same kind of object as something on the list.
  const wanted = new Set(layout.entries.map((e) => e.obj));
  expect(layout.items.filter((item) => item.entry < 0).some((item) => wanted.has(item.obj))).toBe(false);
  // Each spot holds at most one object.
  expect(new Set(layout.items.map((item) => item.spot)).size).toBe(layout.items.length);

  // Play it: tap the middle of what can be seen of each object.
  let play = startPlay(scene, difficulty, layout, 0);
  const index = indexPlay(scene, layout, shapes);
  const cov = coverage(scene, layout, shapes);
  layout.items.forEach((item, i) => {
    if (item.entry < 0) return;
    const points = visiblePoints(cov, i);
    expect(points.length, `${item.obj} at ${item.spot} has nothing visible`).toBeGreaterThan(0);
    const middle = points[Math.floor(points.length / 2)]!;
    const outcome = tapAt(play, index, middle.x, middle.y, PHONE_MARGIN);
    expect(outcome, `${scene.id} ${difficulty} seed ${seed}: tap on ${item.obj} at ${item.spot}`).toEqual({ kind: 'found', item: i });
    play = markFound(play, i);
  });
  expect(isComplete(play)).toBe(true);

  // Kumo peeks: partly visible, partly tucked away, and tappable.
  if (layout.kumo) {
    expect(report.kumo!.visible).toBeGreaterThanOrEqual(kumoRules.minVisible);
    expect(report.kumo!.visible).toBeLessThanOrEqual(kumoRules.maxVisible);
    const points = visiblePoints(cov, -1);
    const middle = points[Math.floor(points.length / 2)]!;
    expect(tapAt(play, index, middle.x, middle.y, PHONE_MARGIN)).toEqual({ kind: 'kumo' });
    play = markKumo(play);
    expect(play.kumo).toBe(true);
  }
  return layout;
}

describe('every shuffled layout can be finished', () => {
  for (const scene of scenes) {
    for (const difficulty of PLAYABLE) {
      it(`${scene.id} on ${difficulty} (${SEEDS} shuffles)`, () => {
        const shapes = shapeSets.get(scene.id)!;
        let lastKumo: string | null = null;
        const kumoSpots = new Set<string>();
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          const layout = playThrough(scene, difficulty, seed, shapes, lastKumo);
          // Kumo never hides in the same place twice in a row.
          if (layout.kumo) {
            expect(layout.kumo.spot).not.toBe(lastKumo);
            kumoSpots.add(layout.kumo.spot);
            lastKumo = layout.kumo.spot;
          }
        }
        // Over many plays, Kumo uses several hiding places.
        if (scene.kumo.length > 1) expect(kumoSpots.size).toBeGreaterThan(1);
      }, 600_000);
    }
  }
});

describe('shuffles feel fresh', () => {
  it('different seeds give different lists and places', () => {
    const scene = scenes[0]!;
    const shapes = shapeSets.get(scene.id)!;
    const a = shuffleLayout({ scene, difficulty: 'normal', shapes, seed: 1 });
    const b = shuffleLayout({ scene, difficulty: 'normal', shapes, seed: 2 });
    expect(a.entries.map((e) => e.obj)).not.toEqual(b.entries.map((e) => e.obj));
    expect(a.items.map((i) => i.spot)).not.toEqual(b.items.map((i) => i.spot));
  });

  it('the same seed gives the same layout (so tests and the editor can repeat one)', () => {
    const scene = scenes[0]!;
    const shapes = shapeSets.get(scene.id)!;
    expect(shuffleLayout({ scene, difficulty: 'easy', shapes, seed: 7 })).toEqual(
      shuffleLayout({ scene, difficulty: 'easy', shapes, seed: 7 }),
    );
  });

  it('Easy objects are bigger than Normal ones, and Tricky ones smaller', () => {
    const scene = scenes[0]!;
    const shapes = shapeSets.get(scene.id)!;
    const average = (difficulty: DifficultyId) => {
      let total = 0;
      let count = 0;
      for (let seed = 1; seed <= 20; seed += 1) {
        for (const item of shuffleLayout({ scene, difficulty, shapes, seed }).items) {
          total += item.size;
          count += 1;
        }
      }
      return total / count;
    };
    const easy = average('easy');
    const normal = average('normal');
    const tricky = average('tricky');
    expect(easy).toBeGreaterThan(normal * 1.2);
    expect(tricky).toBeLessThan(normal * 0.85);
  });
});
