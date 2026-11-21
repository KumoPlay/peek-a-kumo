import { describe, expect, it } from 'vitest';
import { Gestures, type GestureEvent } from './gestures';

const taps = (events: GestureEvent[]) => events.filter((e) => e.type === 'tap');

describe('telling taps from zooming and panning', () => {
  it('a quick, still finger is a tap', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    g.move(1, 103, 102, 50);
    expect(g.up(1, 103, 102, 120)).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
  });

  it('a finger that moves is a pan, never a tap', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    const moved = g.move(1, 130, 100, 40);
    expect(moved).toEqual([{ type: 'start' }, { type: 'pan', dx: 30, dy: 0 }]);
    expect(g.move(1, 140, 110, 60)).toEqual([{ type: 'pan', dx: 10, dy: 10 }]);
    const end = g.up(1, 140, 110, 70);
    expect(taps(end)).toEqual([]);
    expect(end[0]?.type).toBe('end');
  });

  it('a pan that comes back to where it started is still not a tap', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    g.move(1, 160, 100, 50);
    g.move(1, 100, 100, 100);
    expect(taps(g.up(1, 100, 100, 150))).toEqual([]);
  });

  it('a long press is not a tap', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    expect(g.up(1, 100, 100, 900)).toEqual([]);
  });

  it('two fingers pinch, and nothing taps until every finger is up', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    expect(g.down(2, 200, 100, 10)).toEqual([{ type: 'start' }]);
    const pinch = g.move(2, 300, 100, 30);
    expect(pinch).toEqual([{ type: 'pinch', x: 200, y: 100, scale: 2, dx: 50, dy: 0 }]);
    // Lift one finger without moving the other: still no tap.
    expect(taps(g.up(2, 300, 100, 40))).toEqual([]);
    expect(taps(g.up(1, 100, 100, 50))).toEqual([]);
  });

  it('a second finger landing during a still press cancels the tap', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    g.down(2, 110, 100, 20);
    expect(taps(g.up(2, 110, 100, 40))).toEqual([]);
    expect(taps(g.up(1, 100, 100, 50))).toEqual([]);
  });

  it('after a pinch, the finger still down pans', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 10);
    g.up(2, 200, 100, 30);
    expect(g.move(1, 120, 100, 40)).toEqual([{ type: 'pan', dx: 20, dy: 0 }]);
    expect(g.up(1, 120, 100, 50)[0]?.type).toBe('end');
  });

  it('two quick taps in one place are a double-tap', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    expect(g.up(1, 100, 100, 60)).toEqual([{ type: 'tap', x: 100, y: 100, count: 1 }]);
    g.down(2, 110, 104, 200);
    expect(g.up(2, 110, 104, 250)).toEqual([{ type: 'tap', x: 110, y: 104, count: 2 }]);
    // A third tap starts counting again.
    g.down(3, 110, 104, 400);
    expect(taps(g.up(3, 110, 104, 450))[0]).toMatchObject({ count: 1 });
  });

  it('taps far apart or slow are two single taps', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    g.up(1, 100, 100, 50);
    g.down(2, 300, 100, 150);
    expect(taps(g.up(2, 300, 100, 200))[0]).toMatchObject({ count: 1 });
    g.down(3, 300, 100, 900);
    expect(taps(g.up(3, 300, 100, 950))[0]).toMatchObject({ count: 1 });
  });

  it('a mouse needs less wiggle to start a drag', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0, 'mouse');
    expect(g.move(1, 107, 100, 30)[0]).toEqual({ type: 'start' });
  });

  it('a cancelled finger never taps', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    expect(g.cancel(1)).toEqual([]);
    expect(g.up(1, 100, 100, 50)).toEqual([]);
  });

  it('measures the speed at the end of a pan, for a gentle glide', () => {
    const g = new Gestures();
    g.down(1, 0, 0, 0);
    g.move(1, 20, 0, 10);
    g.move(1, 60, 0, 30);
    g.move(1, 100, 0, 50);
    const end = g.up(1, 100, 0, 55);
    expect(end[0]).toMatchObject({ type: 'end' });
    if (end[0]?.type === 'end') expect(end[0].vx).toBeCloseTo(2, 1);
  });
});
