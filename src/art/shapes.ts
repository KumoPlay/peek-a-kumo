import { sceneShapes, shapes as mainShapes } from 'virtual:shapes';
import type { ShapeSet } from '../core/layout/types';
import { decodeShape, type Shape, type ShapeData } from '../core/shapes';

/**
 * Tap shapes for a scene: the objects and Kumo (always there) plus that
 * scene's props (loaded with the scene). Decoded once and kept.
 */
const decoded = new Map<string, Shape>();

function decodeAll(data: Record<string, ShapeData>): Record<string, Shape> {
  const out: Record<string, Shape> = {};
  for (const [name, shape] of Object.entries(data)) {
    let one = decoded.get(name);
    if (!one) {
      one = decodeShape(shape);
      decoded.set(name, one);
    }
    out[name] = one;
  }
  return out;
}

export function objectShapes(): Record<string, Shape> {
  return decodeAll(mainShapes);
}

export async function shapesForScene(artFolder: string): Promise<ShapeSet> {
  const load = sceneShapes[artFolder];
  const props = load ? (await load()).default : {};
  return { ...decodeAll(mainShapes), ...decodeAll(props) };
}
