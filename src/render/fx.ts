import { icon, symbolId } from '../art';
import { tintStyle } from '../content/colors';

/**
 * Little moments: a found object flying into the list, a soft wobble where a
 * tap missed, and confetti at the end. All are plain HTML on top of the scene,
 * animated with transforms and opacity only (cheap for phones), and all calm
 * down for players who prefer less motion.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Place {
  /** Centre on screen (client pixels). */
  x: number;
  y: number;
  /** Size on screen (pixels). */
  size: number;
  rot: number;
  flip: boolean;
}

function flyer(content: string, place: Place): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'flyer';
  el.style.left = `${place.x - place.size / 2}px`;
  el.style.top = `${place.y - place.size / 2}px`;
  el.style.width = `${place.size}px`;
  el.style.height = `${place.size}px`;
  el.innerHTML = content;
  document.body.append(el);
  return el;
}

async function flyTo(el: HTMLDivElement, place: Place, target: HTMLElement): Promise<void> {
  const box = target.getBoundingClientRect();
  const dx = box.left + box.width / 2 - place.x;
  const dy = box.top + box.height / 2 - place.y;
  const end = Math.max(0.2, (Math.min(box.width, box.height) * 0.8) / place.size);
  const mirror = place.flip ? -1 : 1;
  // Pop up a little, then swoop into the list.
  const animation = el.animate(
    [
      { transform: `translate(0, 0) rotate(${place.rot}deg) scale(${mirror}, 1)`, offset: 0 },
      { transform: `translate(0, -14px) rotate(${place.rot / 2}deg) scale(${1.25 * mirror}, 1.25)`, offset: 0.22 },
      { transform: `translate(${dx}px, ${dy}px) rotate(0deg) scale(${end}, ${end})`, offset: 1 },
    ],
    { duration: 720, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' },
  );
  try {
    await animation.finished;
  } catch {
    // Cancelled (the screen closed): nothing to do.
  }
  el.remove();
}

/** A found object flies from the scene into its place in the list. */
export function flyObject(art: string, tint: string | null, place: Place, target: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  const el = flyer(
    `<svg viewBox="0 0 100 100" width="100%" height="100%"><use href="#${symbolId(art)}" width="100" height="100" style="${tintStyle(tint)}"/></svg>`,
    place,
  );
  return flyTo(el, place, target);
}

/** Kumo hops, then floats into its secret slot. */
export function flyKumo(art: string, place: Place, target: HTMLElement): Promise<void> {
  if (prefersReducedMotion()) return Promise.resolve();
  const el = flyer(`<img src="${icon(art)}" alt="" width="100%" height="100%" draggable="false">`, place);
  return flyTo(el, place, target);
}

/** A soft ring where a tap found nothing: no penalty, just "not here". */
export function missPuff(container: HTMLElement, x: number, y: number): void {
  const el = document.createElement('div');
  el.className = prefersReducedMotion() ? 'puff puff-calm' : 'puff';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  container.append(el);
  setTimeout(() => el.remove(), 700);
}

const CONFETTI_COLOURS = ['#F9A8C8', '#FFDF85', '#A6E3C5', '#A9D3F7', '#CDB9F5', '#FFC29E'];
const SHAPES = [
  // a star, a heart and a tiny cloud
  '<svg viewBox="0 0 20 20"><path d="M10 1l2.6 5.6 6 .6-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.6z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 20 20"><path d="M10 18C3 13 1 10 1 7a4.5 4.5 0 0 1 9-1 4.5 4.5 0 0 1 9 1c0 3-2 6-9 11z" fill="currentColor"/></svg>',
  '<svg viewBox="0 0 24 16"><path d="M6 15a5 5 0 0 1 0-10 6 6 0 0 1 11-1 5 5 0 0 1 1 11z" fill="currentColor"/></svg>',
];

/** Gentle confetti falling over the scene. */
export function confetti(container: HTMLElement, pieces = 34): void {
  if (prefersReducedMotion()) return;
  const { width, height } = container.getBoundingClientRect();
  for (let i = 0; i < pieces; i += 1) {
    const el = document.createElement('div');
    el.className = 'confetti';
    const size = 12 + Math.random() * 12;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.left = `${Math.random() * width}px`;
    el.style.color = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length]!;
    el.innerHTML = SHAPES[i % SHAPES.length]!;
    container.append(el);
    const drift = (Math.random() - 0.5) * 120;
    const spin = (Math.random() - 0.5) * 540;
    const duration = 1800 + Math.random() * 1200;
    el.animate(
      [
        { transform: 'translate(0, -30px) rotate(0deg)', opacity: 0 },
        { opacity: 1, offset: 0.1 },
        { opacity: 1, offset: 0.8 },
        { transform: `translate(${drift}px, ${height + 40}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration, delay: Math.random() * 500, easing: 'cubic-bezier(.3,.6,.6,1)', fill: 'forwards' },
    );
    setTimeout(() => el.remove(), duration + 600);
  }
}
