import { mapper, toLocal, type Mapper, type Pose, type ViewBox } from './geometry';

/**
 * Tap shapes: where a picture has paint, as a small grid of cells. Made from
 * the art at build time (tools/shapes-plugin.ts) and used for taps and for
 * checking that objects are not hidden too much.
 */
export interface ShapeData {
  vb: [number, number, number, number];
  w: number;
  h: number;
  /** One bit per cell, row by row, as base64. */
  bits: string;
}

export interface Shape {
  vb: ViewBox;
  /** Grid size in cells. */
  w: number;
  h: number;
  /** Picture units per cell. */
  cellW: number;
  cellH: number;
  /** 1 where the picture has paint. */
  mask: Uint8Array;
  /** Distance to the nearest paint, worked out the first time it is needed. */
  field: DistanceField | null;
}

interface DistanceField {
  /** Extra cells around the grid, so taps just outside the picture can be measured. */
  pad: number;
  w: number;
  h: number;
  /** Distance in thirds of a cell (0 on paint). */
  dist: Uint16Array;
}

/** The share of an object's size a tap may miss by and still count, at most. */
export const MAX_MARGIN_SHARE = 0.34;

function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function decodeShape(data: ShapeData): Shape {
  const bytes = decodeBase64(data.bits);
  const mask = new Uint8Array(data.w * data.h);
  for (let i = 0; i < mask.length; i += 1) mask[i] = ((bytes[i >> 3] ?? 0) >> (i & 7)) & 1;
  return {
    vb: data.vb,
    w: data.w,
    h: data.h,
    cellW: data.vb[2] / data.w,
    cellH: data.vb[3] / data.h,
    mask,
    field: null,
  };
}

/** A shape made from a filled rectangle, for tests. */
export function boxShape(vb: ViewBox, w: number, h: number, fill: (i: number, j: number) => boolean = () => true): Shape {
  const mask = new Uint8Array(w * h);
  for (let j = 0; j < h; j += 1) for (let i = 0; i < w; i += 1) mask[j * w + i] = fill(i, j) ? 1 : 0;
  return { vb, w, h, cellW: vb[2] / w, cellH: vb[3] / h, mask, field: null };
}

/** True when the picture has paint at this point (picture units). */
export function hasPaint(shape: Shape, u: number, v: number): boolean {
  const i = Math.floor((u - shape.vb[0]) / shape.cellW);
  const j = Math.floor((v - shape.vb[1]) / shape.cellH);
  if (i < 0 || j < 0 || i >= shape.w || j >= shape.h) return false;
  return shape.mask[j * shape.w + i] === 1;
}

/** Two-pass chamfer distance (3 straight, 4 diagonal), about a third of a cell accurate. */
function buildField(shape: Shape): DistanceField {
  const pad = Math.ceil(Math.max(shape.w, shape.h) * (MAX_MARGIN_SHARE + 0.06));
  const w = shape.w + pad * 2;
  const h = shape.h + pad * 2;
  const far = 65000;
  const dist = new Uint16Array(w * h).fill(far);
  for (let j = 0; j < shape.h; j += 1) {
    for (let i = 0; i < shape.w; i += 1) {
      if (shape.mask[j * shape.w + i]) dist[(j + pad) * w + i + pad] = 0;
    }
  }
  const at = (i: number, j: number): number => (i < 0 || j < 0 || i >= w || j >= h ? far : dist[j * w + i]!);
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      const here = dist[j * w + i]!;
      if (here === 0) continue;
      dist[j * w + i] = Math.min(here, at(i - 1, j) + 3, at(i, j - 1) + 3, at(i - 1, j - 1) + 4, at(i + 1, j - 1) + 4);
    }
  }
  for (let j = h - 1; j >= 0; j -= 1) {
    for (let i = w - 1; i >= 0; i -= 1) {
      const here = dist[j * w + i]!;
      if (here === 0) continue;
      dist[j * w + i] = Math.min(here, at(i + 1, j) + 3, at(i, j + 1) + 3, at(i + 1, j + 1) + 4, at(i - 1, j + 1) + 4);
    }
  }
  return { pad, w, h, dist };
}

/** How far this point is from the picture's paint, in picture units (0 on paint). */
export function distanceToPaint(shape: Shape, u: number, v: number): number {
  shape.field ??= buildField(shape);
  const field = shape.field;
  const i = Math.floor((u - shape.vb[0]) / shape.cellW) + field.pad;
  const j = Math.floor((v - shape.vb[1]) / shape.cellH) + field.pad;
  if (i < 0 || j < 0 || i >= field.w || j >= field.h) return Number.POSITIVE_INFINITY;
  const d = field.dist[j * field.w + i]!;
  return d >= 65000 ? Number.POSITIVE_INFINITY : (d / 3) * Math.max(shape.cellW, shape.cellH);
}

/** Something that can be tapped, placed in the scene. */
export interface Tappable {
  /** Who it is: an item number, or -1 for Kumo. */
  key: number;
  shape: Shape;
  m: Mapper;
  /** Drawing order: higher is in front. */
  order: number;
}

export function tappable(key: number, shape: Shape, pose: Pose, order: number): Tappable {
  return { key, shape, m: mapper(pose, shape.vb), order };
}

/** The longest side of a placed picture, in scene units. */
export function sceneSize(t: Tappable): number {
  return Math.max(t.shape.vb[2], t.shape.vb[3]) * t.m.pose.k;
}

/**
 * Which of these a tap at (px, py) is meant for. A tap counts when it is on
 * the picture's paint or within `margin` scene units of it (never more than a
 * third of the picture's size). The closest wins; on a tie, the one in front.
 * Parts tucked behind other things count too: being generous is the point.
 */
export function hitTest(list: readonly Tappable[], px: number, py: number, margin: number): Tappable | null {
  let best: Tappable | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const t of list) {
    const { u, v } = toLocal(t.m, px, py);
    const distance = distanceToPaint(t.shape, u, v) * t.m.pose.k;
    const limit = Math.min(margin, MAX_MARGIN_SHARE * sceneSize(t));
    if (distance > limit) continue;
    const closer = distance < bestDistance - 1e-6;
    const tieInFront = Math.abs(distance - bestDistance) <= 1e-6 && best !== null && t.order > best.order;
    if (closer || tieInFront) {
      best = t;
      bestDistance = distance;
    }
  }
  return best;
}

/** True when the point is right on the picture's paint. */
export function isOnPaint(t: Tappable, px: number, py: number): boolean {
  const { u, v } = toLocal(t.m, px, py);
  return hasPaint(t.shape, u, v);
}
