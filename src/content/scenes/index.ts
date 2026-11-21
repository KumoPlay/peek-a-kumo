import { parseScene } from '../sceneFormat';
import type { SceneDef } from '../types';

/**
 * Every scene file in this folder, in unlock order (their "order" field).
 * Adding a scene is dropping its .json file here; nothing else to change.
 */
const files = import.meta.glob<unknown>('./*.json', { eager: true, import: 'default' });

export const scenes: readonly SceneDef[] = Object.entries(files)
  .map(([path, raw]) => parseScene(raw, `src/content/scenes/${path.slice(2)}`))
  .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

export function sceneById(id: string): SceneDef | undefined {
  return scenes.find((scene) => scene.id === id);
}
