import { spriteSvg, svgParts, symbolId } from '../art';
import { tintStyle } from '../content/colors';
import type { SceneDef } from '../content/types';
import { drawList, svgTransform, type Layout, type ShapeSet } from '../core';

/**
 * Draws one scene: the background, the props, the objects and Kumo, in one
 * SVG, built once per play. Objects are <use> copies of shared symbols, so
 * each picture is defined only once however many are on screen.
 *
 * Anything that moves (sparkles, flying objects) lives in the HTML layer on
 * top, not inside the SVG, so the big scene picture does not have to be
 * redrawn while it moves.
 */
export class SceneView {
  readonly el: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly items: (SVGGElement | null)[] = [];
  private kumo: SVGGElement | null = null;
  private hint: HTMLDivElement | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly scene: SceneDef,
    private readonly layout: Layout,
    art: Record<string, string>,
    shapes: ShapeSet,
    found: readonly number[],
    kumoFound: boolean,
  ) {
    const [w, h] = scene.size;
    const parts: string[] = [
      `<svg class="scene-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">`,
    ];
    const background = art.background ? svgParts(art.background) : null;
    if (background) {
      parts.push(`<svg viewBox="${background.viewBox}" width="${w}" height="${h}" preserveAspectRatio="none">${background.inner}</svg>`);
    }
    for (const entry of drawList(scene, layout, shapes)) {
      const transform = svgTransform(entry.pose, entry.vb);
      if (entry.kind === 'prop') {
        const prop = scene.props[entry.index]!;
        parts.push(`<g transform="${transform}">${svgParts(art[prop.art] ?? '').inner}</g>`);
      } else if (entry.kind === 'item') {
        const item = layout.items[entry.index]!;
        const [vx, vy, vw, vh] = entry.vb;
        const hidden = found.includes(entry.index) ? ' style="display:none"' : '';
        parts.push(
          `<g class="it" data-i="${entry.index}" transform="${transform}"${hidden}><g class="wig">` +
            `<use href="#${symbolId(entry.art)}" x="${vx}" y="${vy}" width="${vw}" height="${vh}" style="${tintStyle(item.tint)}"/>` +
            `</g></g>`,
        );
      } else {
        const hidden = kumoFound ? ' style="display:none"' : '';
        parts.push(`<g class="kumo" transform="${transform}"${hidden}>${svgParts(spriteSvg(entry.art) ?? '').inner}</g>`);
      }
    }
    parts.push('</svg>');

    this.el = document.createElement('div');
    this.el.className = 'scene';
    this.el.style.width = `${w}px`;
    this.el.style.height = `${h}px`;
    this.el.innerHTML = parts.join('');
    this.overlay = document.createElement('div');
    this.overlay.className = 'scene-overlay';
    this.el.append(this.overlay);

    this.el.querySelectorAll<SVGGElement>('g.it').forEach((g) => {
      this.items[Number(g.dataset.i)] = g;
    });
    this.kumo = this.el.querySelector<SVGGElement>('g.kumo');
  }

  hideItem(index: number): void {
    const g = this.items[index];
    if (g) g.style.display = 'none';
    if (this.hint?.dataset.item === String(index)) this.clearHint();
  }

  hideKumo(): void {
    if (this.kumo) this.kumo.style.display = 'none';
  }

  /** A little "not that one" wiggle on an object that is not on the list. */
  wiggle(index: number): void {
    const inner = this.items[index]?.querySelector<SVGGElement>('.wig');
    if (!inner) return;
    inner.classList.remove('wiggle');
    // Restart the animation even if it is still running.
    void inner.getBoundingClientRect();
    inner.classList.add('wiggle');
    setTimeout(() => inner.classList.remove('wiggle'), 600);
  }

  /**
   * Soft sparkles around an object, for a hint. `minSize` (scene units) keeps
   * them easy to notice when the whole scene is in view.
   */
  showHint(index: number, minSize = 0): void {
    this.clearHint();
    const item = this.layout.items[index];
    if (!item) return;
    const size = Math.max(item.size * 1.6, minSize);
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.dataset.item = String(index);
    hint.style.left = `${item.x - size / 2}px`;
    hint.style.top = `${item.y - size / 2}px`;
    hint.style.width = `${size}px`;
    hint.style.height = `${size}px`;
    hint.innerHTML =
      '<span class="hint-glow"></span><span class="hint-ring">' +
      Array.from({ length: 6 }, (_, i) => `<i style="--a:${i * 60}deg;--d:${(i % 3) * 0.25}s"></i>`).join('') +
      '</span>';
    this.overlay.append(hint);
    this.hint = hint;
    this.hintTimer = setTimeout(() => this.fadeHint(), 9000);
  }

  clearHint(): void {
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this.hint?.remove();
    this.hint = null;
  }

  private fadeHint(): void {
    const hint = this.hint;
    if (!hint) return;
    hint.classList.add('hint-out');
    setTimeout(() => {
      if (this.hint === hint) this.clearHint();
    }, 600);
  }

  /** Where an object is, for flying it to the list. */
  itemPlace(index: number): { x: number; y: number; size: number; rot: number; flip: boolean } | null {
    const item = this.layout.items[index];
    return item ? { x: item.x, y: item.y, size: item.size, rot: item.rot, flip: item.flip } : null;
  }

  kumoPlace(): { x: number; y: number; size: number } | null {
    const k = this.layout.kumo;
    return k ? { x: k.x, y: k.y, size: k.size } : null;
  }

  get sceneSize(): [number, number] {
    return this.scene.size;
  }

  destroy(): void {
    this.clearHint();
    this.el.remove();
  }
}
