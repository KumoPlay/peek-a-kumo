/**
 * Where a picture sits in a scene. Scene units: x to the right, y down,
 * (0, 0) at the top left. A picture's own units are its viewBox.
 */
export type ViewBox = readonly [number, number, number, number];

export interface Pose {
  /** Centre of the picture in the scene. */
  x: number;
  y: number;
  /** Scene units per picture unit. */
  k: number;
  /** Degrees, clockwise. */
  rot: number;
  /** Mirrored left to right. */
  flip: boolean;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A pose for something sized by its longest side (objects and Kumo). */
export function poseBySize(vb: ViewBox, x: number, y: number, size: number, rot: number, flip: boolean): Pose {
  return { x, y, k: size / Math.max(vb[2], vb[3]), rot, flip };
}

/** A pose for something sized by its width (props). */
export function poseByWidth(vb: ViewBox, x: number, y: number, width: number, rot: number): Pose {
  return { x, y, k: width / vb[2], rot, flip: false };
}

/** Precomputed numbers for turning scene points into picture points quickly. */
export interface Mapper {
  pose: Pose;
  vb: ViewBox;
  cos: number;
  sin: number;
  cx: number;
  cy: number;
}

export function mapper(pose: Pose, vb: ViewBox): Mapper {
  const radians = (pose.rot * Math.PI) / 180;
  return { pose, vb, cos: Math.cos(radians), sin: Math.sin(radians), cx: vb[0] + vb[2] / 2, cy: vb[1] + vb[3] / 2 };
}

/** A scene point → the same point in the picture's own units. */
export function toLocal(m: Mapper, px: number, py: number): { u: number; v: number } {
  const dx = px - m.pose.x;
  const dy = py - m.pose.y;
  let rx = dx * m.cos + dy * m.sin;
  const ry = -dx * m.sin + dy * m.cos;
  if (m.pose.flip) rx = -rx;
  return { u: rx / m.pose.k + m.cx, v: ry / m.pose.k + m.cy };
}

/** A picture point → the same point in the scene. */
export function toScene(m: Mapper, u: number, v: number): { x: number; y: number } {
  let ax = (u - m.cx) * m.pose.k;
  const ay = (v - m.cy) * m.pose.k;
  if (m.pose.flip) ax = -ax;
  return { x: m.pose.x + ax * m.cos - ay * m.sin, y: m.pose.y + ax * m.sin + ay * m.cos };
}

/** The scene area the picture's viewBox covers (turned with it). */
export function sceneBox(m: Mapper): Box {
  const [vx, vy, vw, vh] = m.vb;
  const corners = [
    toScene(m, vx, vy),
    toScene(m, vx + vw, vy),
    toScene(m, vx, vy + vh),
    toScene(m, vx + vw, vy + vh),
  ];
  return {
    x0: Math.min(...corners.map((c) => c.x)),
    y0: Math.min(...corners.map((c) => c.y)),
    x1: Math.max(...corners.map((c) => c.x)),
    y1: Math.max(...corners.map((c) => c.y)),
  };
}

/** The SVG transform that draws the picture (with its viewBox at 0 0) in this pose. */
export function svgTransform(pose: Pose, vb: ViewBox): string {
  const cx = vb[0] + vb[2] / 2;
  const cy = vb[1] + vb[3] / 2;
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const sx = pose.flip ? -pose.k : pose.k;
  return `translate(${round(pose.x)} ${round(pose.y)}) rotate(${round(pose.rot)}) scale(${round(sx)} ${round(pose.k)}) translate(${round(-cx)} ${round(-cy)})`;
}
