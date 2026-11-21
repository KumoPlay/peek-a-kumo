/**
 * Zoom and pan. The scene is drawn once at full size; the camera only moves
 * and scales it with a CSS transform, which phones do on the graphics chip.
 *
 * While a gesture is going on, the scene is promoted to its own layer and
 * simply stretched (smooth, a little soft). Shortly after the fingers lift,
 * the layer is released so the browser redraws it sharp at the new zoom.
 */
export interface CameraOptions {
  /** How far in you can zoom, compared with seeing the whole scene. */
  maxZoom: number;
  reducedMotion: boolean;
  /** Empty space kept around the whole scene when zoomed out, in pixels. */
  margin: number;
}

/** How long after the last move the scene is redrawn sharp. */
const SETTLE_MS = 160;

export class Camera {
  scale = 1;
  x = 0;
  y = 0;
  private viewW = 0;
  private viewH = 0;
  private fitScale = 1;
  private frame = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly layer: HTMLElement,
    private readonly sceneW: number,
    private readonly sceneH: number,
    private readonly options: CameraOptions,
  ) {}

  get minScale(): number {
    return this.fitScale;
  }

  get maxScale(): number {
    return this.fitScale * this.options.maxZoom;
  }

  /** 1 when the whole scene shows, up to maxZoom. */
  get zoom(): number {
    return this.scale / this.fitScale;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The viewport changed size (rotation, window resize). Keeps the same spot in view. */
  setView(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    const first = this.viewW === 0;
    const zoom = first ? 1 : this.zoom;
    const centre = first ? { x: this.sceneW / 2, y: this.sceneH / 2 } : this.toScene(this.viewW / 2, this.viewH / 2);
    this.viewW = width;
    this.viewH = height;
    const m = this.options.margin;
    this.fitScale = Math.max(0.01, Math.min((width - m * 2) / this.sceneW, (height - m * 2) / this.sceneH));
    this.centreOn(centre.x, centre.y, this.fitScale * zoom);
  }

  /** A point in the viewport (pixels) → the scene. */
  toScene(vx: number, vy: number): { x: number; y: number } {
    return { x: (vx - this.x) / this.scale, y: (vy - this.y) / this.scale };
  }

  /** A scene point → the viewport (pixels). */
  toView(sx: number, sy: number): { x: number; y: number } {
    return { x: this.x + sx * this.scale, y: this.y + sy * this.scale };
  }

  /** The part of the scene that is on screen. */
  visibleRect(): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.toScene(0, 0);
    const b = this.toScene(this.viewW, this.viewH);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  zoomAt(vx: number, vy: number, factor: number): void {
    const next = this.clampScale(this.scale * factor);
    const k = next / this.scale;
    this.x = vx - (vx - this.x) * k;
    this.y = vy - (vy - this.y) * k;
    this.scale = next;
    this.commit();
  }

  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.commit();
  }

  centreOn(sx: number, sy: number, scale: number = this.scale): void {
    this.scale = this.clampScale(scale);
    this.x = this.viewW / 2 - sx * this.scale;
    this.y = this.viewH / 2 - sy * this.scale;
    this.commit();
  }

  /** Glides to a zoom and centre (instantly with reduced motion). */
  animateTo(scale: number, sx: number, sy: number, ms = 320): void {
    this.stop();
    if (this.options.reducedMotion || ms <= 0) {
      this.centreOn(sx, sy, scale);
      return;
    }
    const from = { scale: this.scale, ...this.toScene(this.viewW / 2, this.viewH / 2) };
    const to = { scale: this.clampScale(scale), x: sx, y: sy };
    const start = performance.now();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / ms);
      const e = 1 - (1 - t) ** 3;
      // Zoom evenly (in steps that feel the same at any zoom), and move the centre along.
      const s = from.scale * (to.scale / from.scale) ** e;
      this.centreOn(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e, s);
      if (t < 1) this.frame = requestAnimationFrame(step);
      else this.frame = 0;
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Keeps moving a little after a quick pan, slowing down softly. Speed in pixels per millisecond. */
  glide(vx: number, vy: number): void {
    this.stop();
    if (this.options.reducedMotion || Math.hypot(vx, vy) < 0.08) return;
    let last = performance.now();
    let speedX = Math.max(-4, Math.min(4, vx));
    let speedY = Math.max(-4, Math.min(4, vy));
    const step = (now: number): void => {
      const dt = Math.min(32, now - last);
      last = now;
      const before = { x: this.x, y: this.y };
      this.panBy(speedX * dt, speedY * dt);
      const friction = 0.93 ** (dt / 16);
      // Stop at the edges instead of pushing against them.
      speedX = this.x === before.x ? 0 : speedX * friction;
      speedY = this.y === before.y ? 0 : speedY * friction;
      if (Math.hypot(speedX, speedY) > 0.02) this.frame = requestAnimationFrame(step);
      else this.frame = 0;
    };
    this.frame = requestAnimationFrame(step);
  }

  fit(animate = true): void {
    this.animateTo(this.fitScale, this.sceneW / 2, this.sceneH / 2, animate ? 320 : 0);
  }

  /** Stops a glide or animation. */
  stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  /** Brings a scene point into view if it is near the edge or off screen. */
  reveal(sx: number, sy: number, padding: number): void {
    const r = this.visibleRect();
    const pad = padding / this.scale;
    if (sx > r.x0 + pad && sx < r.x1 - pad && sy > r.y0 + pad && sy < r.y1 - pad) return;
    this.animateTo(this.scale, sx, sy);
  }

  destroy(): void {
    this.stop();
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.listeners.clear();
  }

  private clampScale(scale: number): number {
    return Math.max(this.minScale, Math.min(this.maxScale, scale));
  }

  /** Keeps the scene on screen: centred when smaller than the view, edges never pulled inside when larger. */
  private clampPosition(): void {
    const w = this.sceneW * this.scale;
    const h = this.sceneH * this.scale;
    const m = this.options.margin;
    this.x = w + m * 2 <= this.viewW ? (this.viewW - w) / 2 : Math.min(m, Math.max(this.viewW - w - m, this.x));
    this.y = h + m * 2 <= this.viewH ? (this.viewH - h) / 2 : Math.min(m, Math.max(this.viewH - h - m, this.y));
  }

  private commit(): void {
    this.clampPosition();
    const style = this.layer.style;
    style.transform = `translate3d(${this.x}px, ${this.y}px, 0) scale(${this.scale})`;
    style.willChange = 'transform';
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      style.willChange = 'auto';
    }, SETTLE_MS);
    this.listeners.forEach((listener) => listener());
  }
}
