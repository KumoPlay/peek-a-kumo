import { describe, expect, it } from 'vitest';
import { mapper, poseBySize, sceneBox, svgTransform, toLocal, toScene } from './geometry';

describe('placing pictures in a scene', () => {
  const vb = [0, 0, 100, 100] as const;

  it('turns scene points into picture points and back', () => {
    for (const flip of [false, true]) {
      const m = mapper(poseBySize(vb, 300, 400, 80, 33, flip), vb);
      for (const [u, v] of [[0, 0], [50, 50], [100, 20], [12, 88]] as const) {
        const p = toScene(m, u, v);
        const back = toLocal(m, p.x, p.y);
        expect(back.u).toBeCloseTo(u, 6);
        expect(back.v).toBeCloseTo(v, 6);
      }
    }
  });

  it('puts the picture centre on the spot and scales by the longest side', () => {
    const m = mapper(poseBySize(vb, 300, 400, 80, 0, false), vb);
    expect(toScene(m, 50, 50)).toEqual({ x: 300, y: 400 });
    expect(toScene(m, 100, 50).x).toBeCloseTo(340);
  });

  it('mirrors left to right when flipped', () => {
    const m = mapper(poseBySize(vb, 0, 0, 100, 0, true), vb);
    expect(toScene(m, 100, 50).x).toBeCloseTo(-50);
  });

  it('rotates clockwise like SVG does', () => {
    const m = mapper(poseBySize(vb, 0, 0, 100, 90, false), vb);
    const p = toScene(m, 100, 50); // the right edge turns to point down
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(50);
  });

  it('finds the area a turned picture covers', () => {
    const box = sceneBox(mapper(poseBySize(vb, 0, 0, 100, 45, false), vb));
    expect(box.x1).toBeCloseTo(Math.SQRT2 * 50);
    expect(box.y0).toBeCloseTo(-Math.SQRT2 * 50);
  });

  it('writes the matching SVG transform', () => {
    expect(svgTransform(poseBySize(vb, 300, 400, 80, 10, true), vb)).toBe(
      'translate(300 400) rotate(10) scale(-0.8 0.8) translate(-50 -50)',
    );
  });
});
