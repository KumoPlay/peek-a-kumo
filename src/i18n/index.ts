import type { SceneDef } from '../content/types';
import { en, type Strings } from './en';

/** The text for the current language. English only for now. */
export const s: Strings = en;

/** Fills {placeholders}: fmt('{found} of {total}', { found: 3, total: 9 }) → '3 of 9'. */
export function fmt(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in values ? String(values[key]) : whole));
}

export function objectName(id: string): string {
  return s.objects[id] ?? id;
}

export function sceneName(scene: SceneDef): string {
  return s.scenes[scene.id] ?? scene.name;
}

export function difficultyName(id: string): string {
  return s.difficulties[id] ?? id;
}
