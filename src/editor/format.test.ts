import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseScene, scenes } from '../content';
import { formatScene, toRaw } from './format';

describe('the editor writes scene files', () => {
  for (const scene of scenes) {
    it(`exactly as ${scene.id}.json is written (so exports make small, clean changes)`, () => {
      const file = path.resolve('src/content/scenes', `${scene.id}.json`);
      const text = fs.readFileSync(file, 'utf8');
      expect(formatScene(toRaw(parseScene(JSON.parse(text), file)))).toBe(text);
    });
  }
});
