import { scenes } from './scenes';
import type { DifficultyId, SceneDef } from './types';

/**
 * Stickers: one for each scene and difficulty, plus one for finding Kumo in
 * each scene. They come from the scene files, so a new scene brings its four
 * stickers with it. Each is drawn from a frame (by kind) and the scene's emblem.
 *
 * Ids are "<game>/<scene>/<kind>", e.g. "peek-a-kumo/cozy-bedroom/easy", so a
 * KumoPlay-wide album could one day show stickers from every game.
 */
export const GAME_ID = 'peek-a-kumo';

export type StickerKind = DifficultyId | 'kumo';
export const STICKER_KINDS: readonly StickerKind[] = ['easy', 'normal', 'tricky', 'kumo'];

/** Frame pictures, in src/art/stickers/. */
export const stickerFrames: Record<StickerKind, string> = {
  easy: 'stickers/frame-easy',
  normal: 'stickers/frame-normal',
  tricky: 'stickers/frame-tricky',
  kumo: 'stickers/frame-kumo',
};

export interface StickerDef {
  id: string;
  scene: string;
  kind: StickerKind;
  frame: string;
  /** The scene's emblem picture, in src/art/stickers/. */
  emblem: string;
}

export const stickerId = (sceneId: string, kind: StickerKind): string => `${GAME_ID}/${sceneId}/${kind}`;

export function stickerFor(scene: SceneDef, kind: StickerKind): StickerDef {
  return { id: stickerId(scene.id, kind), scene: scene.id, kind, frame: stickerFrames[kind], emblem: `stickers/${scene.emblem}` };
}

/** Every sticker there is, scene by scene. */
export function stickerCatalog(list: readonly SceneDef[] = scenes): StickerDef[] {
  return list.flatMap((scene) => STICKER_KINDS.map((kind) => stickerFor(scene, kind)));
}
