/**
 * Turns fingers and mouse presses into taps, double-taps, pans and pinches.
 * Plain logic with no browser parts, so the rules are tested directly.
 *
 * The rules that keep zooming and panning from ever counting as a tap:
 *  - A tap is one finger (or mouse press) that moves less than a few pixels
 *    and lifts within half a second.
 *  - Moving further turns it into a pan; a second finger turns it into a pinch.
 *  - Once two fingers have touched, nothing is a tap until every finger is up.
 */
export interface GestureOptions {
  /** How far a finger may wander and still tap, in pixels. */
  touchSlop: number;
  mouseSlop: number;
  /** Longest press that still counts as a tap. */
  tapMaxMs: number;
  /** Two taps this close in time and space are a double-tap. */
  doubleTapMs: number;
  doubleTapDistance: number;
}

export const defaultGestureOptions: GestureOptions = {
  touchSlop: 10,
  mouseSlop: 5,
  tapMaxMs: 500,
  doubleTapMs: 320,
  doubleTapDistance: 40,
};

export type PointerKind = 'touch' | 'mouse' | 'pen';

export type GestureEvent =
  /** count 2 is the second tap of a double-tap. */
  | { type: 'tap'; x: number; y: number; count: 1 | 2 }
  /** A pan or pinch has begun. */
  | { type: 'start' }
  | { type: 'pan'; dx: number; dy: number }
  /** Zoom by `scale` around (x, y), and move by (dx, dy). */
  | { type: 'pinch'; x: number; y: number; scale: number; dx: number; dy: number }
  /** Every finger is up after a pan or pinch. Speed in pixels per millisecond, for a gentle glide. */
  | { type: 'end'; vx: number; vy: number };

interface Finger {
  x: number;
  y: number;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

type Mode = 'idle' | 'press' | 'pan' | 'pinch';

/** Speed is measured over this last stretch of a pan. */
const SPEED_WINDOW_MS = 100;
/** A finger that rested this long before lifting does not glide. */
const REST_MS = 60;

export class Gestures {
  private readonly options: GestureOptions;
  private readonly fingers = new Map<number, Finger>();
  private mode: Mode = 'idle';
  /** Two or more fingers have touched since the first one went down. */
  private multi = false;
  private press: (Sample & { kind: PointerKind }) | null = null;
  private lastTap: Sample | null = null;
  private pinch = { distance: 1, x: 0, y: 0 };
  private samples: Sample[] = [];

  constructor(options: Partial<GestureOptions> = {}) {
    this.options = { ...defaultGestureOptions, ...options };
  }

  /** True while a pan or pinch is going on. */
  get busy(): boolean {
    return this.mode === 'pan' || this.mode === 'pinch';
  }

  down(id: number, x: number, y: number, t: number, kind: PointerKind = 'touch'): GestureEvent[] {
    this.fingers.set(id, { x, y });
    if (this.fingers.size === 1) {
      this.mode = 'press';
      this.multi = false;
      this.press = { x, y, t, kind };
      this.samples = [{ x, y, t }];
      return [];
    }
    this.multi = true;
    const events: GestureEvent[] = [];
    if (this.mode === 'press') events.push({ type: 'start' });
    if (this.mode === 'press' || this.mode === 'pan' || this.mode === 'pinch') {
      this.mode = 'pinch';
      this.pinch = this.pinchNow();
    }
    return events;
  }

  move(id: number, x: number, y: number, t: number): GestureEvent[] {
    const finger = this.fingers.get(id);
    if (!finger) return [];
    const before = { ...finger };
    finger.x = x;
    finger.y = y;

    if (this.mode === 'press' && this.press) {
      const slop = this.press.kind === 'mouse' ? this.options.mouseSlop : this.options.touchSlop;
      if (Math.hypot(x - this.press.x, y - this.press.y) <= slop) return [];
      this.mode = 'pan';
      this.addSample(x, y, t);
      // The content catches up with the finger, so it does not jump.
      return [{ type: 'start' }, { type: 'pan', dx: x - this.press.x, dy: y - this.press.y }];
    }
    if (this.mode === 'pan') {
      this.addSample(x, y, t);
      return [{ type: 'pan', dx: x - before.x, dy: y - before.y }];
    }
    if (this.mode === 'pinch') {
      const now = this.pinchNow();
      const event: GestureEvent = {
        type: 'pinch',
        x: now.x,
        y: now.y,
        scale: now.distance / this.pinch.distance,
        dx: now.x - this.pinch.x,
        dy: now.y - this.pinch.y,
      };
      this.pinch = now;
      return [event];
    }
    return [];
  }

  up(id: number, x: number, y: number, t: number): GestureEvent[] {
    if (!this.fingers.has(id)) return [];
    this.fingers.delete(id);
    const left = this.fingers.size;

    if (this.mode === 'press') {
      this.mode = left === 0 ? 'idle' : this.mode;
      if (left > 0 || this.multi || !this.press) return [];
      if (t - this.press.t > this.options.tapMaxMs) return [];
      const last = this.lastTap;
      const isDouble =
        last !== null &&
        t - last.t <= this.options.doubleTapMs &&
        Math.hypot(x - last.x, y - last.y) <= this.options.doubleTapDistance;
      this.lastTap = isDouble ? null : { x, y, t };
      return [{ type: 'tap', x: this.press.x, y: this.press.y, count: isDouble ? 2 : 1 }];
    }

    if (this.mode === 'pinch') {
      if (left >= 2) {
        this.pinch = this.pinchNow();
      } else if (left === 1) {
        // The finger still down carries on panning (it can never tap now).
        this.mode = 'pan';
        const rest = [...this.fingers.values()][0]!;
        this.samples = [{ x: rest.x, y: rest.y, t }];
      } else {
        this.mode = 'idle';
        return [{ type: 'end', vx: 0, vy: 0 }];
      }
      return [];
    }

    if (this.mode === 'pan' && left === 0) {
      this.mode = 'idle';
      this.lastTap = null;
      return [{ type: 'end', ...this.speed(t) }];
    }
    return [];
  }

  /** The browser took the finger away (a system gesture, for example). Never a tap. */
  cancel(id: number): GestureEvent[] {
    if (!this.fingers.has(id)) return [];
    this.fingers.delete(id);
    if (this.fingers.size > 0) {
      if (this.mode === 'pinch' && this.fingers.size >= 2) this.pinch = this.pinchNow();
      if (this.mode === 'pinch' && this.fingers.size === 1) this.mode = 'pan';
      return [];
    }
    const wasBusy = this.busy;
    this.mode = 'idle';
    this.press = null;
    return wasBusy ? [{ type: 'end', vx: 0, vy: 0 }] : [];
  }

  /** Forget everything, for example when the screen changes. */
  reset(): void {
    this.fingers.clear();
    this.mode = 'idle';
    this.multi = false;
    this.press = null;
    this.lastTap = null;
    this.samples = [];
  }

  private pinchNow(): { distance: number; x: number; y: number } {
    const [a, b] = [...this.fingers.values()];
    if (!a || !b) return { distance: 1, x: a?.x ?? 0, y: a?.y ?? 0 };
    return { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private addSample(x: number, y: number, t: number): void {
    this.samples.push({ x, y, t });
    while (this.samples.length > 2 && t - this.samples[0]!.t > SPEED_WINDOW_MS) this.samples.shift();
  }

  private speed(t: number): { vx: number; vy: number } {
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    if (!first || !last || last === first || t - last.t > REST_MS) return { vx: 0, vy: 0 };
    const dt = last.t - first.t;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
  }
}
