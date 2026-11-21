import type { ObjectDef } from './types';

/**
 * The object library. Each object can appear in any scene that lists it in its
 * pool, at different sizes, angles, layers and colours.
 *
 * To add one: add a line here, draw src/art/objects/<id>.svg (viewBox 0 0 100 100,
 * colourable parts as var(--c1, …), var(--c2, …), var(--c3, …)), and add its
 * name under `objects` in src/i18n/en.ts. `npm test` checks all three.
 */
const ALL = ['pink', 'peach', 'butter', 'mint', 'sky', 'lilac'] as const;

export const objects: readonly ObjectDef[] = [
  { id: 'teacup', tints: ALL, upright: true },
  { id: 'spoon', tints: ['pink', 'mint', 'sky', 'butter', 'lilac'], scale: 0.95 },
  { id: 'key', tints: ['butter', 'sky', 'pink', 'lilac', 'mint'], scale: 0.9 },
  { id: 'button', tints: ALL, group: true, scale: 0.75 },
  { id: 'mitten', tints: ALL },
  { id: 'sock', tints: ALL },
  { id: 'glasses', tints: ['pink', 'sky', 'lilac', 'mint', 'peach'], scale: 0.95 },
  { id: 'candle', tints: ALL, upright: true, scale: 0.95 },
  { id: 'bell', tints: ['butter', 'pink', 'sky', 'mint', 'lilac'], upright: true, scale: 0.9 },
  { id: 'envelope', tints: ['pink', 'sky', 'butter', 'lilac', 'mint', 'peach'] },
  { id: 'umbrella', tints: ALL, scale: 1.15 },
  { id: 'paper-boat', tints: ALL },
  { id: 'rubber-duck', tints: ['butter', 'pink', 'sky', 'mint', 'peach'], upright: true },
  { id: 'yarn-ball', tints: ALL },
  { id: 'paintbrush', tints: ALL, scale: 1.05 },
  { id: 'pencil', tints: ALL, scale: 1.05 },
  { id: 'kite', tints: ALL, scale: 1.1 },
  { id: 'balloon', tints: ALL, scale: 1.05 },
  { id: 'crown', tints: ['butter', 'pink', 'lilac', 'sky', 'peach'], upright: true, scale: 0.9 },
  { id: 'bow', tints: ALL, scale: 0.9 },
  { id: 'cupcake', tints: ['pink', 'mint', 'sky', 'lilac', 'butter'], upright: true },
  { id: 'lollipop', tints: ALL },
  { id: 'star', tints: ['butter', 'pink', 'sky', 'mint', 'lilac', 'peach'], group: true, scale: 0.85 },
  { id: 'heart', tints: ['pink', 'peach', 'lilac', 'sky', 'mint', 'butter'], group: true, scale: 0.85 },
  { id: 'feather', tints: ALL, group: true },
  { id: 'shell', tints: ['peach', 'pink', 'butter', 'lilac', 'sky'], group: true, scale: 0.9 },
  { id: 'snail', tints: ['lilac', 'pink', 'butter', 'mint', 'sky', 'peach'] },
  { id: 'ladybug', tints: [], group: true, scale: 0.75 },
  { id: 'acorn', tints: [], group: true, upright: true, scale: 0.8 },
  { id: 'leaf', tints: ['mint', 'butter', 'peach', 'pink'], group: true, scale: 0.9 },
  { id: 'daisy', tints: ['pink', 'butter', 'sky', 'lilac', 'peach'], group: true, scale: 0.9 },
  { id: 'mushroom', tints: ['pink', 'peach', 'butter', 'lilac', 'sky'], upright: true },
  { id: 'cherry', tints: [], group: true, scale: 0.85 },
  { id: 'strawberry', tints: [], group: true, scale: 0.85 },
  { id: 'cookie', tints: [], group: true, scale: 0.85 },
  { id: 'donut', tints: ['pink', 'mint', 'sky', 'lilac', 'butter'] },
  { id: 'carrot', tints: [], scale: 1.05 },
  { id: 'magnifier', tints: ALL },
  { id: 'watering-can', tints: ALL, upright: true, scale: 1.1 },
  { id: 'beret', tints: ALL },
];

export function objectById(id: string): ObjectDef | undefined {
  return objects.find((o) => o.id === id);
}
