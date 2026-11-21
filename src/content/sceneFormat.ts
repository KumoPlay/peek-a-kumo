import { hashText } from '../core/hash';
import {
  DIFFICULTIES,
  type DifficultyId,
  type DifficultyRules,
  type KumoSpotDef,
  type PropDef,
  type SceneDef,
  type SpotDef,
} from './types';

/**
 * Reads a scene file (src/content/scenes/<id>.json) and fills in defaults.
 * A mistake stops with a message that says which file and which field to fix.
 */
export class SceneFileError extends Error {
  constructor(file: string, where: string, problem: string) {
    super(`${file}: ${where} ${problem}`);
    this.name = 'SceneFileError';
  }
}

type Raw = Record<string, unknown>;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseScene(raw: unknown, file: string): SceneDef {
  const fail = (where: string, problem: string): never => {
    throw new SceneFileError(file, where, problem);
  };
  const num = (obj: Raw, key: string, where: string, fallback?: number): number => {
    const value = obj[key] ?? fallback;
    if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`${where}.${key}`, 'must be a number');
    return value;
  };
  const text = (obj: Raw, key: string, where: string): string => {
    const value = obj[key];
    if (typeof value !== 'string' || value.trim() === '') return fail(`${where}.${key}`, 'must be some text');
    return value;
  };
  const id = (obj: Raw, key: string, where: string): string => {
    const value = text(obj, key, where);
    if (!ID.test(value)) fail(`${where}.${key}`, `"${value}" must be lowercase letters, numbers and dashes`);
    return value;
  };
  const list = (obj: Raw, key: string, where: string): unknown[] => {
    const value = obj[key] ?? [];
    if (!Array.isArray(value)) return fail(`${where}.${key}`, 'must be a list [ … ]');
    return value;
  };
  const pair = (obj: Raw, key: string, where: string, fallback: [number, number]): [number, number] => {
    const value = obj[key] ?? fallback;
    if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      return fail(`${where}.${key}`, 'must be two numbers, like [-10, 10]');
    }
    const [a, b] = value as [number, number];
    return a <= b ? [a, b] : [b, a];
  };
  const unique = (ids: string[], where: string): void => {
    const seen = new Set<string>();
    for (const one of ids) {
      if (seen.has(one)) fail(where, `has the id "${one}" twice`);
      seen.add(one);
    }
  };

  if (!isRecord(raw)) return fail('the file', 'must be a JSON object { … }');
  if (raw.format !== 1) fail('format', 'must be 1');

  const sceneId = id(raw, 'id', 'scene');
  const size = pair(raw, 'size', 'scene', [1000, 1000]);
  if (size[0] < 100 || size[1] < 100) fail('scene.size', 'is too small');

  const props: PropDef[] = list(raw, 'props', 'scene').map((entry, i) => {
    const where = `props[${i}]`;
    if (!isRecord(entry)) return fail(where, 'must be an object { … }');
    return {
      id: id(entry, 'id', where),
      art: id(entry, 'art', where),
      x: num(entry, 'x', where),
      y: num(entry, 'y', where),
      w: num(entry, 'w', where),
      rot: num(entry, 'rot', where, 0),
      z: num(entry, 'z', where),
    };
  });

  const readFor = (entry: Raw, where: string): DifficultyId[] => {
    if (entry.for === undefined) return [...DIFFICULTIES];
    const values = list(entry, 'for', where);
    for (const value of values) {
      if (!DIFFICULTIES.includes(value as DifficultyId)) fail(`${where}.for`, `"${String(value)}" must be easy, normal or tricky`);
    }
    return DIFFICULTIES.filter((d) => values.includes(d));
  };

  const spots: SpotDef[] = list(raw, 'spots', 'scene').map((entry, i) => {
    const where = `spots[${i}]`;
    if (!isRecord(entry)) return fail(where, 'must be an object { … }');
    const spot: SpotDef = {
      id: id(entry, 'id', where),
      x: num(entry, 'x', where),
      y: num(entry, 'y', where),
      anchor: entry.anchor === 'bottom' ? 'bottom' : 'center',
      size: num(entry, 'size', where),
      rot: pair(entry, 'rot', where, [0, 0]),
      jitter: num(entry, 'jitter', where, 0),
      flip: entry.flip !== false,
      z: num(entry, 'z', where),
      tone: typeof entry.tone === 'string' ? entry.tone : 'cream',
      for: readFor(entry, where),
    };
    if (spot.size <= 0) fail(`${where}.size`, 'must be more than 0');
    if (entry.anchor !== undefined && entry.anchor !== 'center' && entry.anchor !== 'bottom') {
      fail(`${where}.anchor`, 'must be "center" or "bottom"');
    }
    return spot;
  });

  const kumo: KumoSpotDef[] = list(raw, 'kumo', 'scene').map((entry, i) => {
    const where = `kumo[${i}]`;
    if (!isRecord(entry)) return fail(where, 'must be an object { … }');
    return {
      id: id(entry, 'id', where),
      x: num(entry, 'x', where),
      y: num(entry, 'y', where),
      size: num(entry, 'size', where),
      rot: num(entry, 'rot', where, 0),
      flip: entry.flip === true,
      z: num(entry, 'z', where),
      pose: id(entry, 'pose', where),
    };
  });

  unique(props.map((p) => p.id), 'props');
  unique(spots.map((s) => s.id), 'spots');
  unique(kumo.map((k) => k.id), 'kumo');

  const difficulties: SceneDef['difficulties'] = {};
  if (raw.difficulties !== undefined) {
    if (!isRecord(raw.difficulties)) fail('difficulties', 'must be an object { … }');
    for (const [key, value] of Object.entries(raw.difficulties as Raw)) {
      if (!DIFFICULTIES.includes(key as DifficultyId)) fail('difficulties', `has "${key}", which must be easy, normal or tricky`);
      if (!isRecord(value)) fail(`difficulties.${key}`, 'must be an object { … }');
      difficulties[key as DifficultyId] = value as Partial<DifficultyRules>;
    }
  }

  return {
    format: 1,
    id: sceneId,
    name: text(raw, 'name', 'scene'),
    order: num(raw, 'order', 'scene'),
    size,
    art: id(raw, 'art', 'scene'),
    emblem: typeof raw.emblem === 'string' ? raw.emblem : sceneId,
    pool: list(raw, 'pool', 'scene').map((value, i) => {
      if (typeof value !== 'string') return fail(`pool[${i}]`, 'must be an object id');
      return value;
    }),
    props,
    spots,
    kumo,
    difficulties,
    rev: hashText(JSON.stringify(raw)),
  };
}
