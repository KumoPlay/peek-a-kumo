/**
 * Every picture in the game lives in this folder, one SVG file per picture.
 * To swap in better art, replace a file and keep its name; nothing else needs
 * to change (tap shapes are remade from the new picture automatically).
 *
 *   objects/<id>.svg              the things to find (viewBox 0 0 100 100). Colourable
 *                                 parts use var(--c1, …), var(--c2, …), var(--c3, …).
 *   kumo/<pose>.svg               Kumo's peeking poses (viewBox 0 0 100 100)
 *   scenes/<scene>/background.svg a scene's background (viewBox 0 0 1000 1000)
 *   scenes/<scene>/<prop>.svg     pieces drawn over the background that can hide
 *                                 things. Drawn in scene units: the viewBox is where
 *                                 the prop sits in the scene.
 *   stickers/frame-<kind>.svg     sticker frames: easy, normal, tricky, kumo (viewBox 0 0 100 100)
 *   stickers/<emblem>.svg         each scene's sticker picture, named in its scene file (0 0 100 100)
 *   ui/<name>.svg                 buttons and small symbols (viewBox 0 0 64 64)
 *   app/<name>.svg                the KumoPlay mark
 *
 * Rules that keep scenes smooth on phones: flat colours, no gradients, no
 * filters (blur, drop shadows) and no ids. The build warns about them.
 */
const sprites = import.meta.glob<string>(['./objects/*.svg', './kumo/*.svg'], {
  eager: true,
  query: '?raw',
  import: 'default',
});
const icons = import.meta.glob<string>(['./ui/*.svg', './app/*.svg'], { eager: true, query: '?raw', import: 'default' });
const stickers = import.meta.glob<string>('./stickers/*.svg', { eager: true, query: '?raw', import: 'default' });
/** Scene pictures load only when their scene opens. */
const sceneFiles = import.meta.glob<string>('./scenes/*/*.svg', { query: '?raw', import: 'default' });

/** The viewBox and inside of an SVG file. */
export function svgParts(svg: string): { viewBox: string; inner: string } {
  const open = /<svg\b[^>]*>/.exec(svg);
  const close = svg.lastIndexOf('</svg>');
  if (!open || close < 0) return { viewBox: '0 0 100 100', inner: '' };
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/.exec(open[0])?.[1] ?? '0 0 100 100';
  return { viewBox, inner: svg.slice(open.index + open[0].length, close) };
}

/** True when a picture with this name exists, e.g. hasArt('objects/teacup'). */
export function hasArt(name: string): boolean {
  const path = `./${name}.svg`;
  return path in sprites || path in icons || path in stickers || path in sceneFiles;
}

/** The raw SVG of an object, Kumo or sticker picture. */
export function spriteSvg(name: string): string | undefined {
  return sprites[`./${name}.svg`] ?? stickers[`./${name}.svg`];
}

export const symbolId = (name: string): string => `pk-${name.replace(/\//g, '-')}`;

/** All objects as <symbol>s in one hidden SVG, so each is defined once and drawn with <use>. */
export function spriteSheet(): string {
  const symbols = Object.entries(sprites)
    .filter(([path]) => path.startsWith('./objects/'))
    .map(([path, svg]) => {
      const { viewBox, inner } = svgParts(svg);
      return `<symbol id="${symbolId(path.slice(2, -4))}" viewBox="${viewBox}">${inner}</symbol>`;
    });
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden">${symbols.join('')}</svg>`;
}

const iconCache = new Map<string, string>();

/** A URL for <img src>. Unknown names give a soft placeholder instead of breaking. */
export function icon(name: string): string {
  let url = iconCache.get(name);
  if (!url) {
    const svg = icons[`./${name}.svg`] ?? sprites[`./${name}.svg`] ?? icons['./ui/missing.svg'] ?? '';
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    iconCache.set(name, url);
  }
  return url;
}

/** Every picture of one scene folder, by name ('background', 'quilt', …). */
export async function loadSceneArt(folder: string): Promise<Record<string, string>> {
  const prefix = `./scenes/${folder}/`;
  const entries = Object.entries(sceneFiles).filter(([path]) => path.startsWith(prefix));
  const loaded = await Promise.all(entries.map(async ([path, load]) => [path.slice(prefix.length, -4), await load()] as const));
  return Object.fromEntries(loaded);
}

/** Every scene art folder (each has a background.svg). */
export function sceneFolders(): string[] {
  return Object.keys(sceneFiles)
    .filter((path) => path.endsWith('/background.svg'))
    .map((path) => path.split('/')[2]!)
    .sort();
}

/** Kumo's poses: the files in kumo/. */
export function kumoPoses(): string[] {
  return Object.keys(sprites)
    .filter((path) => path.startsWith('./kumo/'))
    .map((path) => path.slice('./kumo/'.length, -4))
    .sort();
}

/** Names of the pictures in one scene folder. */
export function sceneArtNames(folder: string): string[] {
  const prefix = `./scenes/${folder}/`;
  return Object.keys(sceneFiles)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length, -4));
}
