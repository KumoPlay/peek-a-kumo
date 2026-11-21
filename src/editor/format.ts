import { DIFFICULTIES, type KumoSpotDef, type PropDef, type SceneDef, type SpotDef } from '../content/types';

/**
 * Scene files as the editor writes them: one prop, spot or Kumo spot per line,
 * so a change shows up as a small, readable difference in git. The scene
 * files in src/content/scenes/ are in exactly this format.
 */
export type RawScene = Record<string, unknown>;

const round = (n: number): number => Math.round(n * 10) / 10;

function one(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(one).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, v]) => `${JSON.stringify(key)}: ${one(v)}`)
      .join(', ')}}`;
  }
  return JSON.stringify(value);
}

export function rawProp(p: PropDef): RawScene {
  return { id: p.id, art: p.art, x: round(p.x), y: round(p.y), w: round(p.w), rot: round(p.rot), z: p.z };
}

export function rawSpot(s: SpotDef): RawScene {
  const raw: RawScene = { id: s.id, x: round(s.x), y: round(s.y) };
  if (s.anchor === 'bottom') raw.anchor = 'bottom';
  Object.assign(raw, { size: round(s.size), rot: [round(s.rot[0]), round(s.rot[1])], jitter: round(s.jitter), flip: s.flip, z: s.z, tone: s.tone });
  if (s.for.length !== DIFFICULTIES.length) raw.for = [...s.for];
  return raw;
}

export function rawKumo(k: KumoSpotDef): RawScene {
  return { id: k.id, x: round(k.x), y: round(k.y), size: round(k.size), rot: round(k.rot), flip: k.flip, z: k.z, pose: k.pose };
}

/** A scene back into plain data, in the order the file uses. */
export function toRaw(scene: SceneDef): RawScene {
  const raw: RawScene = {
    format: 1,
    id: scene.id,
    name: scene.name,
    order: scene.order,
    size: [...scene.size],
    art: scene.art,
    emblem: scene.emblem,
    pool: [...scene.pool],
    props: scene.props.map(rawProp),
    spots: scene.spots.map(rawSpot),
    kumo: scene.kumo.map(rawKumo),
  };
  if (Object.keys(scene.difficulties).length > 0) raw.difficulties = scene.difficulties;
  return raw;
}

/** The text of a scene file. */
export function formatScene(raw: RawScene): string {
  const lines = ['{'];
  const keys = Object.keys(raw);
  keys.forEach((key, i) => {
    const value = raw[key];
    const comma = i < keys.length - 1 ? ',' : '';
    if (Array.isArray(value) && value.length > 0 && value.every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      lines.push(`  ${JSON.stringify(key)}: [`);
      value.forEach((item, j) => lines.push(`    ${one(item)}${j < value.length - 1 ? ',' : ''}`));
      lines.push(`  ]${comma}`);
    } else {
      lines.push(`  ${JSON.stringify(key)}: ${one(value)}${comma}`);
    }
  });
  lines.push('}');
  return `${lines.join('\n')}\n`;
}
