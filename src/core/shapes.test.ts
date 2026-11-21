import { describe, expect, it } from 'vitest';
import { poseBySize } from './geometry';
import { boxShape, decodeShape, distanceToPaint, hitTest, isOnPaint, tappable } from './shapes';

const vb = [0, 0, 100, 100] as const;
/** A ring: paint only where 30 ≤ distance from the centre ≤ 45 (64 × 64 cells). */
const ring = () =>
  boxShape(vb, 64, 64, (i, j) => {
    const d = Math.hypot(i + 0.5 - 32, j + 0.5 - 32) * (100 / 64);
    return d >= 30 && d <= 45;
  });

describe('tap shapes', () => {
  it('read the bit maps made at build time', () => {
    // 4 × 2 cells: top row 1010, bottom row 0101 → bits 0,2,5,7 → 0b10100101 = 0xa5
    const shape = decodeShape({ vb: [0, 0, 4, 2], w: 4, h: 2, bits: btoa(String.fromCharCode(0xa5)) });
    expect([...shape.mask]).toEqual([1, 0, 1, 0, 0, 1, 0, 1]);
  });

  it('follow the real outline, not a box around it', () => {
    const t = tappable(1, ring(), poseBySize(vb, 500, 500, 100, 0, false), 0);
    expect(isOnPaint(t, 500 + 38, 500)).toBe(true); // on the ring
    expect(isOnPaint(t, 500, 500)).toBe(false); // the hole in the middle
    expect(hitTest([t], 500, 500, 10)).toBeNull(); // too far from the paint, even inside the box
  });

  it('give taps a margin around the paint, measured in scene units', () => {
    const shape = ring();
    const t = tappable(1, shape, poseBySize(vb, 500, 500, 100, 0, false), 0);
    expect(distanceToPaint(shape, 50 + 52, 50)).toBeGreaterThan(5);
    expect(hitTest([t], 500 + 52, 500, 4)).toBeNull();
    expect(hitTest([t], 500 + 52, 500, 12)?.key).toBe(1);
  });

  it('never stretch the margin past a third of the object', () => {
    const t = tappable(1, ring(), poseBySize(vb, 500, 500, 30, 0, false), 0);
    // 30 units wide: the margin stops at about 10 units however generous the zoom is.
    expect(hitTest([t], 500 + 15 + 8, 500, 100)?.key).toBe(1);
    expect(hitTest([t], 500 + 15 + 14, 500, 100)).toBeNull();
  });

  it('pick the closest object when margins overlap', () => {
    const solid = boxShape(vb, 10, 10);
    const left = tappable(1, solid, poseBySize(vb, 100, 100, 40, 0, false), 0);
    const right = tappable(2, solid, poseBySize(vb, 160, 100, 40, 0, false), 1);
    expect(hitTest([left, right], 125, 100, 20)?.key).toBe(1);
    expect(hitTest([left, right], 135, 100, 20)?.key).toBe(2);
  });

  it('pick the one in front when both are right under the finger', () => {
    const solid = boxShape(vb, 10, 10);
    const back = tappable(1, solid, poseBySize(vb, 100, 100, 40, 0, false), 0);
    const front = tappable(2, solid, poseBySize(vb, 110, 100, 40, 0, false), 5);
    expect(hitTest([back, front], 105, 100, 10)?.key).toBe(2);
  });

  it('work for turned and mirrored objects', () => {
    // Paint only on the right half of the picture.
    const half = boxShape(vb, 10, 10, (i) => i >= 5);
    const turned = tappable(1, half, poseBySize(vb, 0, 0, 100, 90, false), 0);
    expect(isOnPaint(turned, 0, 30)).toBe(true); // the right half now points down
    expect(isOnPaint(turned, 0, -30)).toBe(false);
    const mirrored = tappable(1, half, poseBySize(vb, 0, 0, 100, 0, true), 0);
    expect(isOnPaint(mirrored, -30, 0)).toBe(true);
    expect(isOnPaint(mirrored, 30, 0)).toBe(false);
  });
});
