import type { SceneDef } from '../../content/types';
import { poseBySize, poseByWidth, type Pose, type ViewBox } from '../geometry';
import { objectArt, kumoArt, propArt, type Layout, type ShapeSet } from './types';

/** One thing to draw, with where it goes. */
export interface DrawEntry {
  kind: 'prop' | 'item' | 'kumo';
  /** Index in scene.props or layout.items (0 for Kumo). */
  index: number;
  art: string;
  pose: Pose;
  vb: ViewBox;
  z: number;
}

/**
 * Props, objects and Kumo in drawing order, back to front. The game, the
 * checks and the editor all use this, so what is drawn in front is also what
 * counts as in front.
 *
 * Order: lower layer (z) first. On the same layer, props come before objects
 * (so an object on a prop's layer sits on it). Then lower on screen is in front.
 */
export function drawList(scene: SceneDef, layout: Layout, shapes: ShapeSet): DrawEntry[] {
  const vbOf = (art: string): ViewBox => {
    const shape = shapes[art];
    if (!shape) throw new Error(`Missing picture: src/art/${art}.svg`);
    return shape.vb;
  };
  const entries: (DrawEntry & { rank: number; bottom: number; seq: number })[] = [];
  let seq = 0;

  scene.props.forEach((prop, index) => {
    const art = propArt(scene.art, prop.art);
    const vb = vbOf(art);
    const pose = poseByWidth(vb, prop.x, prop.y, prop.w, prop.rot);
    entries.push({ kind: 'prop', index, art, pose, vb, z: prop.z, rank: 0, bottom: prop.y + (vb[3] * pose.k) / 2, seq: seq++ });
  });
  layout.items.forEach((item, index) => {
    const art = objectArt(item.obj);
    const vb = vbOf(art);
    const pose = poseBySize(vb, item.x, item.y, item.size, item.rot, item.flip);
    entries.push({ kind: 'item', index, art, pose, vb, z: item.z, rank: 1, bottom: item.y + item.size / 2, seq: seq++ });
  });
  if (layout.kumo) {
    const k = layout.kumo;
    const art = kumoArt(k.pose);
    const vb = vbOf(art);
    const pose = poseBySize(vb, k.x, k.y, k.size, k.rot, k.flip);
    entries.push({ kind: 'kumo', index: 0, art, pose, vb, z: k.z, rank: 1, bottom: k.y + k.size / 2, seq: seq++ });
  }

  entries.sort((a, b) => a.z - b.z || a.rank - b.rank || a.bottom - b.bottom || a.seq - b.seq);
  return entries.map(({ kind, index, art, pose, vb, z }) => ({ kind, index, art, pose, vb, z }));
}
