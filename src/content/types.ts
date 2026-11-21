/** The shapes of all content. Data files in this folder follow these. */

export const DIFFICULTIES = ['easy', 'normal', 'tricky'] as const;
export type DifficultyId = (typeof DIFFICULTIES)[number];

/** How object colours are chosen against the background where they sit. */
export type ColorRule = 'contrast' | 'any' | 'blend';

export interface DifficultyRules {
  /** Objects to find in total (a "find 3 of" counts as 3). */
  find: number;
  /** How many of them are "find 3 of" the same thing: smallest and largest. */
  groups: [number, number];
  /** Extra objects that are not on the list, to make the scene busy. */
  decoys: number;
  /** Object size compared with the spot's natural size. */
  scale: number;
  /** Random size change, as a share (0.1 = up to 10% bigger or smaller). */
  sizeJitter: number;
  /** Share of each object's outline that must stay visible. */
  minVisible: number;
  /** Visible area each object needs at least, in square scene units, so it can be tapped. */
  minVisibleArea: number;
  colors: ColorRule;
  /** Seconds for the hint to refill. */
  hintSeconds: number;
}

/** An object in the library. Its picture is src/art/objects/<id>.svg and its name is in i18n. */
export interface ObjectDef {
  id: string;
  /** Colours it can come in. Empty: it keeps the colours of its picture. */
  tints: readonly string[];
  /** Can be a "find 3 of". */
  group?: boolean;
  /** Stays nearly upright (at most 12° tilt), like a cupcake or a candle. */
  upright?: boolean;
  /** Size compared with other objects (1 = normal). */
  scale?: number;
}

/** A piece of the scene drawn over the background that can tuck objects behind it. */
export interface PropDef {
  id: string;
  /** Picture: src/art/scenes/<scene art>/<art>.svg */
  art: string;
  /** Centre. */
  x: number;
  y: number;
  /** Width in scene units (the height follows the picture). */
  w: number;
  rot: number;
  /** Layer: higher is in front. */
  z: number;
}

/** A place where an object may go. */
export interface SpotDef {
  id: string;
  /** Centre, or with anchor 'bottom' the middle of the line the object rests on. */
  x: number;
  y: number;
  /**
   * 'center': the object's middle goes on (x, y), for things on a wall or tucked away.
   * 'bottom': the object stands on (x, y) whatever its size, for shelves, tables and floors.
   */
  anchor: 'center' | 'bottom';
  /** Natural object size here (longest side); each difficulty scales it. */
  size: number;
  /** Rotation range in degrees, smallest and largest. */
  rot: [number, number];
  /** Random nudge, up to this many scene units (sideways only for 'bottom' spots). */
  jitter: number;
  /** May be mirrored. */
  flip: boolean;
  /** Layer: higher is in front. Objects on the same layer as a prop sit in front of it. */
  z: number;
  /** The background colour around this spot (a tone from colors.ts). */
  tone: string;
  /** Difficulties that may use this spot. */
  for: DifficultyId[];
}

/** A place where Kumo may hide. */
export interface KumoSpotDef {
  id: string;
  x: number;
  y: number;
  size: number;
  rot: number;
  flip: boolean;
  z: number;
  /** Picture: src/art/kumo/<pose>.svg */
  pose: string;
}

/** One scene, as stored in src/content/scenes/<id>.json. */
export interface SceneDef {
  format: 1;
  id: string;
  name: string;
  /** Place in the unlock chain. */
  order: number;
  size: [number, number];
  /** Art folder: src/art/scenes/<art>/ */
  art: string;
  /** Sticker picture name. */
  emblem: string;
  /** Objects that may appear here. Empty: every object. */
  pool: string[];
  props: PropDef[];
  spots: SpotDef[];
  kumo: KumoSpotDef[];
  /** Changes to the difficulty defaults for this scene. */
  difficulties: Partial<Record<DifficultyId, Partial<DifficultyRules>>>;
  /** Changes whenever the file changes; an unfinished play of an older version starts fresh. */
  rev: string;
}
