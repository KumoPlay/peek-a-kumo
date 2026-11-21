import { beforeAll, describe, expect, it } from 'vitest';
import { shapesForScene } from '../../art/shapes';
import { scenes } from '../../content';
import { mapper, sceneBox, toLocal } from '../geometry';
import { hasPaint } from '../shapes';
import { coverage, GRID } from './check';
import { drawList } from './drawList';
import { shuffleLayout } from './shuffle';
import type { Layout, ShapeSet } from './types';

/**
 * The checker takes a shortcut (props are summed up once per scene). This
 * compares it with the plain way: drawing every prop and object back to
 * front onto the grid and counting what each object still shows.
 */
function plainSeen(scene: (typeof scenes)[number], layout: Layout, shapes: ShapeSet): Map<string, number> {
  const cols = Math.ceil(scene.size[0] / GRID);
  const rows = Math.ceil(scene.size[1] / GRID);
  const list = drawList(scene, layout, shapes);
  const owner = new Int16Array(cols * rows).fill(-1);
  list.forEach((entry, n) => {
    const m = mapper(entry.pose, entry.vb);
    const box = sceneBox(m);
    for (let r = Math.max(0, Math.floor(box.y0 / GRID)); r <= Math.min(rows - 1, Math.floor(box.y1 / GRID)); r += 1) {
      for (let c = Math.max(0, Math.floor(box.x0 / GRID)); c <= Math.min(cols - 1, Math.floor(box.x1 / GRID)); c += 1) {
        const { u, v } = toLocal(m, (c + 0.5) * GRID, (r + 0.5) * GRID);
        if (hasPaint(shapes[entry.art]!, u, v)) owner[r * cols + c] = n;
      }
    }
  });
  const seen = new Map<string, number>();
  owner.forEach((n) => {
    if (n < 0) return;
    const entry = list[n]!;
    if (entry.kind === 'prop') return;
    const key = `${entry.kind}${entry.index}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  });
  return seen;
}

const shapeSets = new Map<string, ShapeSet>();
beforeAll(async () => {
  for (const scene of scenes) shapeSets.set(scene.id, await shapesForScene(scene.art));
});

describe('the quick visibility count', () => {
  for (const scene of scenes) {
    it(`matches drawing everything back to front in ${scene.id}`, () => {
      const shapes = shapeSets.get(scene.id)!;
      for (const difficulty of ['easy', 'normal', 'tricky'] as const) {
        for (let seed = 1; seed <= 5; seed += 1) {
          const layout = shuffleLayout({ scene, difficulty, shapes, seed });
          const cov = coverage(scene, layout, shapes);
          const plain = plainSeen(scene, layout, shapes);
          cov.list.forEach((entry, n) => {
            expect(cov.seen[n], `${entry.kind} ${entry.index}`).toBe(plain.get(`${entry.kind}${entry.index}`) ?? 0);
          });
        }
      }
    });
  }
});
