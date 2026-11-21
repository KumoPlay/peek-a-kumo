import type { DifficultyId, DifficultyRules, SceneDef } from './types';

/**
 * Easy, Normal and Tricky. A scene can change any of these for itself under
 * "difficulties" in its file, for example { "tricky": { "find": 11 } }.
 */
export const difficulties: Record<DifficultyId, DifficultyRules> = {
  easy: {
    find: 6,
    groups: [0, 0],
    decoys: 6,
    scale: 1.5,
    sizeJitter: 0.08,
    minVisible: 0.9,
    minVisibleArea: 1000,
    colors: 'contrast',
    hintSeconds: 10,
  },
  normal: {
    find: 9,
    groups: [0, 0],
    decoys: 12,
    scale: 1,
    sizeJitter: 0.1,
    minVisible: 0.55,
    minVisibleArea: 500,
    colors: 'any',
    hintSeconds: 20,
  },
  tricky: {
    find: 12,
    groups: [0, 2],
    decoys: 16,
    scale: 0.72,
    sizeJitter: 0.1,
    minVisible: 0.4,
    minVisibleArea: 260,
    colors: 'blend',
    hintSeconds: 30,
  },
};

/** Kumo peeks: part of it always shows, part is always tucked away. */
export const kumoRules = {
  minVisible: 0.25,
  maxVisible: 0.7,
};

/** A difficulty's rules for one scene, with the scene's own changes. */
export function rulesFor(scene: SceneDef, difficulty: DifficultyId): DifficultyRules {
  return { ...difficulties[difficulty], ...scene.difficulties[difficulty] };
}
