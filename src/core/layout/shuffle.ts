import { colorDistance, tints, tones } from '../../content/colors';
import { kumoRules, rulesFor } from '../../content/difficulties';
import { objects as library } from '../../content/objects';
import type { DifficultyId, DifficultyRules, KumoSpotDef, ObjectDef, SceneDef, SpotDef } from '../../content/types';
import { createRng, type Rng } from '../rng';
import { checkLayout, type CheckRules } from './check';
import { objectArt, type FindEntry, type Layout, type PlacedItem, type PlacedKumo, type ShapeSet } from './types';

/**
 * Makes a fresh layout for one play: which objects to find, which decoys,
 * where everything goes, and where Kumo hides. Every layout it returns has
 * passed checkLayout, so every object on the list can be seen and tapped.
 */
export interface ShuffleInput {
  scene: SceneDef;
  difficulty: DifficultyId;
  shapes: ShapeSet;
  seed: number;
  /** Kumo's spot last time, so it hides somewhere new. */
  avoidKumo?: string | null;
  /** Defaults to the object library and the difficulty's rules for this scene. */
  objects?: readonly ObjectDef[];
  rules?: DifficultyRules;
}

export class LayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LayoutError';
  }
}

/** Whole-layout tries before giving up (each try uses a new seed). */
const LAYOUT_TRIES = 40;
/** Spots tried for one object to find. */
const SPOT_TRIES = 40;
/** Spots tried for one decoy (decoys are skipped if they do not fit). */
const DECOY_TRIES = 6;
/** Most an "upright" object may tilt. */
const UPRIGHT_TILT = 12;
/** How far below its middle an object's picture ends, as a share of its size (pictures leave a small margin). */
const BOTTOM_SHARE = 0.45;

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function checkRulesFor(rules: DifficultyRules): CheckRules {
  return {
    minVisible: rules.minVisible,
    minVisibleArea: rules.minVisibleArea,
    kumoMin: kumoRules.minVisible,
    kumoMax: kumoRules.maxVisible,
  };
}

function pickTint(obj: ObjectDef, spot: SpotDef, rules: DifficultyRules, rng: Rng): string | null {
  const choices = obj.tints.filter((t) => t in tints);
  if (choices.length === 0) return null;
  const tone = tones[spot.tone];
  if (rules.colors === 'any' || !tone) return rng.pick(choices) ?? null;
  const sorted = [...choices].sort((a, b) => colorDistance(tints[a]!.c1, tone) - colorDistance(tints[b]!.c1, tone));
  const shortlist = rules.colors === 'blend' ? sorted.slice(0, 2) : sorted.slice(-2);
  return rng.pick(shortlist) ?? null;
}

function placeOn(obj: ObjectDef, spot: SpotDef, rules: DifficultyRules, rng: Rng, tint: string | null, entry: number): PlacedItem {
  const size = spot.size * rules.scale * (obj.scale ?? 1) * rng.range(1 - rules.sizeJitter, 1 + rules.sizeJitter);
  let [low, high] = spot.rot;
  if (obj.upright) {
    low = Math.max(-UPRIGHT_TILT, Math.min(UPRIGHT_TILT, low));
    high = Math.max(-UPRIGHT_TILT, Math.min(UPRIGHT_TILT, high));
  }
  let dx: number;
  let dy: number;
  if (spot.anchor === 'bottom') {
    // Standing on a surface: slide along it, and sit on it whatever the size.
    dx = rng.range(-spot.jitter, spot.jitter);
    dy = -size * BOTTOM_SHARE;
  } else {
    const angle = rng.range(0, Math.PI * 2);
    const nudge = spot.jitter * Math.sqrt(rng.next());
    dx = Math.cos(angle) * nudge;
    dy = Math.sin(angle) * nudge;
  }
  return {
    obj: obj.id,
    tint,
    spot: spot.id,
    x: round1(spot.x + dx),
    y: round1(spot.y + dy),
    size: round1(size),
    rot: round1(rng.range(low, high)),
    flip: spot.flip && rng.next() < 0.5,
    z: spot.z,
    entry,
  };
}

function kumoAt(spot: KumoSpotDef): PlacedKumo {
  return { spot: spot.id, pose: spot.pose, x: spot.x, y: spot.y, size: spot.size, rot: spot.rot, flip: spot.flip, z: spot.z };
}

/** Kumo spots that work on their own (with just the props around them). */
export function goodKumoSpots(scene: SceneDef, shapes: ShapeSet, checkRules: CheckRules): KumoSpotDef[] {
  return scene.kumo.filter((spot) => {
    const report = checkLayout(scene, { seed: 0, items: [], kumo: kumoAt(spot), entries: [] }, shapes, checkRules);
    return report.kumo?.ok === true;
  });
}

function tryLayout(input: Required<ShuffleInput>, rng: Rng, kumoSpots: KumoSpotDef[], checkRules: CheckRules): Layout | null {
  const { scene, difficulty, shapes, rules } = input;
  const pool = rng.shuffle(
    input.objects.filter((o) => (scene.pool.length === 0 || scene.pool.includes(o.id)) && objectArt(o.id) in shapes),
  );
  const spots = rng.shuffle(scene.spots.filter((s) => s.for.includes(difficulty)));
  const used = new Set<string>();

  // Kumo first: somewhere new if possible.
  const fresh = kumoSpots.filter((k) => k.id !== input.avoidKumo);
  const kumoSpot = rng.pick(fresh.length ? fresh : kumoSpots);
  const layout: Layout = { seed: input.seed, items: [], kumo: kumoSpot ? kumoAt(kumoSpot) : null, entries: [] };

  // What to find: some "find 3 of", the rest single objects.
  const groupable = pool.filter((o) => o.group);
  const groupCount = Math.min(rng.int(rules.groups[0], rules.groups[1]), groupable.length, Math.floor(rules.find / 3));
  const groups = groupable.slice(0, groupCount);
  const singles = pool.filter((o) => !groups.includes(o)).slice(0, rules.find - groupCount * 3);
  if (singles.length < rules.find - groupCount * 3) return null;
  const targets = rng.shuffle([...groups.map((obj) => ({ obj, count: 3 })), ...singles.map((obj) => ({ obj, count: 1 }))]);
  layout.entries = targets.map(({ obj }) => ({ obj: obj.id, tint: null, count: 0 }));

  const accept = (item: PlacedItem): boolean => {
    layout.items.push(item);
    if (checkLayout(scene, layout, shapes, checkRules).ok) return true;
    layout.items.pop();
    return false;
  };

  for (let entry = 0; entry < targets.length; entry += 1) {
    const { obj, count } = targets[entry]!;
    const line: FindEntry = layout.entries[entry]!;
    for (let copy = 0; copy < count; copy += 1) {
      let placed = false;
      let tries = 0;
      for (const spot of spots) {
        if (used.has(spot.id)) continue;
        if (tries++ >= SPOT_TRIES) break;
        // Copies of a "find 3 of" share one colour, so the list picture matches all three.
        const tint = copy === 0 ? pickTint(obj, spot, rules, rng) : line.tint;
        if (accept(placeOn(obj, spot, rules, rng, tint, entry))) {
          used.add(spot.id);
          line.tint = tint;
          line.count += 1;
          placed = true;
          break;
        }
      }
      if (!placed) return null;
    }
  }

  // Decoys: never the same kind of object as anything on the list.
  const decoyKinds = pool.filter((o) => !targets.some((t) => t.obj === o));
  for (let d = 0; d < rules.decoys && decoyKinds.length > 0; d += 1) {
    const obj = decoyKinds[d % decoyKinds.length]!;
    let tries = 0;
    for (const spot of spots) {
      if (used.has(spot.id)) continue;
      if (tries++ >= DECOY_TRIES) break;
      if (accept(placeOn(obj, spot, rules, rng, pickTint(obj, spot, { ...rules, colors: 'any' }, rng), -1))) {
        used.add(spot.id);
        break;
      }
    }
  }

  return layout;
}

export function shuffleLayout(options: ShuffleInput): Layout {
  const input: Required<ShuffleInput> = {
    avoidKumo: null,
    objects: library,
    rules: rulesFor(options.scene, options.difficulty),
    ...options,
  };
  const checkRules = checkRulesFor(input.rules);
  const kumoSpots = goodKumoSpots(input.scene, input.shapes, checkRules);
  for (let attempt = 0; attempt < LAYOUT_TRIES; attempt += 1) {
    const rng = createRng((input.seed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const layout = tryLayout(input, rng, kumoSpots, checkRules);
    if (layout) return layout;
  }
  throw new LayoutError(
    `Could not make a fair ${input.difficulty} layout for ${input.scene.id}. Add more spots, or make the props hide less.`,
  );
}
