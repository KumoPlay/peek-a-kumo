import type { Shape } from '../shapes';

/** Tap shapes by picture name, for example 'objects/teacup' or 'scenes/cozy-bedroom/quilt'. */
export type ShapeSet = Readonly<Record<string, Shape>>;

/** One object placed in the scene for this play. */
export interface PlacedItem {
  obj: string;
  /** Colour from colors.ts, or null for the picture's own colours. */
  tint: string | null;
  spot: string;
  x: number;
  y: number;
  /** Longest side, in scene units. */
  size: number;
  rot: number;
  flip: boolean;
  z: number;
  /** Which line of the find list it belongs to, or -1 for a decoy. */
  entry: number;
}

export interface PlacedKumo {
  spot: string;
  pose: string;
  x: number;
  y: number;
  size: number;
  rot: number;
  flip: boolean;
  z: number;
}

/** One line of the find list: "find 1 teacup" or "find 3 stars". */
export interface FindEntry {
  obj: string;
  tint: string | null;
  count: number;
}

/** Everything one play looks like. Saved as is, so a play continues exactly as it was. */
export interface Layout {
  seed: number;
  items: PlacedItem[];
  kumo: PlacedKumo | null;
  entries: FindEntry[];
}

export const objectArt = (id: string): string => `objects/${id}`;
export const kumoArt = (pose: string): string => `kumo/${pose}`;
export const propArt = (sceneArt: string, art: string): string => `scenes/${sceneArt}/${art}`;
