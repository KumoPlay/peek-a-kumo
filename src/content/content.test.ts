import { describe, expect, it } from 'vitest';
import { hasArt, sceneArtNames, spriteSvg } from '../art';
import { shapesForScene } from '../art/shapes';
import { goodKumoSpots, checkRulesFor } from '../core/layout';
import { s } from '../i18n';
import { DIFFICULTIES, objects, parseScene, rulesFor, scenes, SceneFileError, stickerCatalog, stickerFrames, tints, tones } from '.';

/**
 * Guard rails for content. When you add an object or a scene, run `npm test`:
 * these tell you exactly what is missing.
 */
describe('the object library', () => {
  it('has unique, well-formed ids', () => {
    const ids = objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  for (const obj of objects) {
    it(`${obj.id} has a picture, a name and real colours`, () => {
      expect(hasArt(`objects/${obj.id}`), `draw src/art/objects/${obj.id}.svg`).toBe(true);
      expect(s.objects[obj.id], `add "${obj.id}" under objects in src/i18n/en.ts`).toBeTruthy();
      for (const tint of obj.tints) expect(tints[tint], `unknown colour "${tint}"`).toBeDefined();
      if (obj.tints.length > 0) {
        expect(spriteSvg(`objects/${obj.id}`), 'colourable objects mark their colours with var(--c1, …)').toContain('var(--c1');
      }
    });
  }

  it('has a library entry for every object picture', () => {
    const files = Object.keys(import.meta.glob('../art/objects/*.svg')).map((path) => path.slice('../art/objects/'.length, -4));
    for (const file of files) expect(objects.some((o) => o.id === file), `src/art/objects/${file}.svg is not in objects.ts`).toBe(true);
  });
});

describe('scene files', () => {
  it('there is at least one scene, and ids and orders are unique', () => {
    expect(scenes.length).toBeGreaterThan(0);
    expect(new Set(scenes.map((sc) => sc.id)).size).toBe(scenes.length);
    expect(new Set(scenes.map((sc) => sc.order)).size).toBe(scenes.length);
  });

  it('each file is named after its scene id', () => {
    const files = Object.keys(import.meta.glob('./scenes/*.json')).map((path) => path.slice('./scenes/'.length, -5));
    expect(files.sort()).toEqual(scenes.map((sc) => sc.id).sort());
  });

  it('a broken scene file explains what to fix', () => {
    expect(() => parseScene({ format: 1, id: 'Bad Name' }, 'x.json')).toThrow(SceneFileError);
    expect(() => parseScene({ format: 1, id: 'ok', name: 'Ok', order: 1, art: 'ok', spots: [{ id: 'a' }] }, 'x.json')).toThrow(
      /x\.json: spots\[0\]\.x must be a number/,
    );
  });

  for (const scene of scenes) {
    describe(scene.id, () => {
      it('has its pictures', () => {
        expect(sceneArtNames(scene.art), `add src/art/scenes/${scene.art}/background.svg`).toContain('background');
        expect(hasArt(`stickers/${scene.emblem}`), `draw its sticker picture, src/art/stickers/${scene.emblem}.svg`).toBe(true);
        for (const prop of scene.props) expect(hasArt(`scenes/${scene.art}/${prop.art}`), `prop ${prop.id}`).toBe(true);
        for (const k of scene.kumo) expect(hasArt(`kumo/${k.pose}`), `Kumo pose "${k.pose}"`).toBe(true);
      });

      it('only uses objects and colours that exist', () => {
        for (const id of scene.pool) expect(objects.some((o) => o.id === id), `pool has unknown object "${id}"`).toBe(true);
        for (const spot of scene.spots) expect(tones[spot.tone], `spot ${spot.id} has unknown tone "${spot.tone}"`).toBeDefined();
      });

      it('keeps every spot inside the scene', () => {
        const [w, h] = scene.size;
        for (const spot of [...scene.spots, ...scene.kumo]) {
          const middle = 'anchor' in spot && spot.anchor === 'bottom' ? spot.y - spot.size * 0.45 : spot.y;
          expect(spot.x - spot.size / 2 >= 0 && spot.x + spot.size / 2 <= w, `${spot.id} x`).toBe(true);
          expect(middle - spot.size / 2 >= 0 && middle + spot.size / 2 <= h, `${spot.id} y`).toBe(true);
        }
      });

      it('has room for every difficulty', () => {
        const pool = scene.pool.length ? scene.pool.length : objects.length;
        for (const d of DIFFICULTIES) {
          const rules = rulesFor(scene, d);
          const spots = scene.spots.filter((sp) => sp.for.includes(d)).length;
          expect(spots, `${d} needs more spots than objects to find, with room to shuffle`).toBeGreaterThanOrEqual(rules.find + 6);
          expect(pool, `${d} needs more kinds of objects than it asks for`).toBeGreaterThan(rules.find);
        }
      });

      it('has at least three good Kumo hiding places', async () => {
        const shapes = await shapesForScene(scene.art);
        const good = goodKumoSpots(scene, shapes, checkRulesFor(rulesFor(scene, 'normal')));
        const bad = scene.kumo.filter((k) => !good.includes(k)).map((k) => k.id);
        expect(bad, 'Kumo should show between 25% and 70% of itself here').toEqual([]);
        expect(good.length).toBeGreaterThanOrEqual(3);
      });
    });
  }
});

describe('stickers', () => {
  it('one per scene and difficulty, plus one Kumo sticker per scene, each with a unique id', () => {
    const all = stickerCatalog();
    expect(all).toHaveLength(scenes.length * 4);
    expect(new Set(all.map((sticker) => sticker.id)).size).toBe(all.length);
    for (const sticker of all) expect(sticker.id).toMatch(/^peek-a-kumo\/[a-z0-9-]+\/(easy|normal|tricky|kumo)$/);
  });

  it('every frame has a picture', () => {
    for (const frame of Object.values(stickerFrames)) expect(hasArt(frame), frame).toBe(true);
  });
});
