import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import type { Plugin, ViteDevServer } from 'vite';

/**
 * Tap shapes, made from the art at build time.
 *
 * Every picture that can be tapped or can hide something (objects, Kumo, and
 * the props of each scene) is drawn once into a small black-and-white map of
 * where it has paint. The game uses these maps to decide taps and to check
 * that nothing is fully hidden; the editor and the tests use the very same maps.
 *
 *   import { shapes, sceneShapes } from 'virtual:shapes';
 *   shapes['objects/teacup']                       objects and Kumo, always loaded
 *   await sceneShapes['cozy-bedroom']()            one scene's props, loaded with the scene
 *
 * Swapping a picture updates its map by itself (the dev server reloads).
 */

/** One picture's map. Kept small: one bit per cell, as base64. */
export interface ShapeData {
  /** The picture's viewBox: x, y, width, height. */
  vb: [number, number, number, number];
  /** Map size in cells. */
  w: number;
  h: number;
  /** Row by row, one bit per cell (1 = paint), as base64. */
  bits: string;
}

const MAIN_ID = 'virtual:shapes';
const SCENE_ID = 'virtual:shapes/scene/';
/** Cells along the longest side. Objects are small on screen; props can be large. */
const OBJECT_CELLS = 64;
const PROP_CELLS = 128;
/** How opaque a pixel must be to count as paint (soft shadows do not count). */
const ALPHA_MIN = 96;

/** Colours written as var(--c1, #abc) are drawn with their fallback colour. */
function withPlainColours(svg: string): string {
  return svg.replace(/var\(\s*--[\w-]+\s*,\s*([^)]+?)\s*\)/g, '$1');
}

export function readViewBox(svg: string): [number, number, number, number] {
  const match = /viewBox\s*=\s*["']([^"']+)["']/.exec(svg);
  const numbers = match?.[1]?.trim().split(/[\s,]+/).map(Number) ?? [];
  if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n)) || numbers[2]! <= 0 || numbers[3]! <= 0) {
    throw new Error('needs a viewBox like viewBox="0 0 100 100"');
  }
  return numbers as [number, number, number, number];
}

/** Draws one SVG and returns its map. */
export function makeShape(svg: string, longest: number): ShapeData {
  const vb = readViewBox(svg);
  const width = Math.max(1, Math.round((vb[2] / Math.max(vb[2], vb[3])) * longest));
  const image = new Resvg(withPlainColours(svg), {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0, 0, 0, 0)',
  }).render();
  const w = image.width;
  const h = image.height;
  const pixels = image.pixels;
  const bytes = new Uint8Array(Math.ceil((w * h) / 8));
  for (let i = 0; i < w * h; i += 1) {
    if ((pixels[i * 4 + 3] ?? 0) >= ALPHA_MIN) bytes[i >> 3]! |= 1 << (i & 7);
  }
  return { vb, w, h, bits: Buffer.from(bytes).toString('base64') };
}

/** Pictures that slow phones down or clash when many are on one page. */
function artWarnings(svg: string): string[] {
  const warnings: string[] = [];
  if (/<(linearGradient|radialGradient)/.test(svg)) warnings.push('uses a gradient');
  if (/<filter/.test(svg)) warnings.push('uses a filter (blur or shadow effect)');
  if (/\sid\s*=/.test(svg)) warnings.push('uses an id (ids can clash when pictures share a page)');
  return warnings;
}

function listSvgs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.svg'))
    .sort();
}

export function shapesPlugin(artDir = path.resolve('src/art')): Plugin {
  const cache = new Map<string, { mtime: number; shape: ShapeData }>();
  let server: ViteDevServer | null = null;

  const shapeOf = (file: string, longest: number, warn: (message: string) => void): ShapeData => {
    const mtime = fs.statSync(file).mtimeMs;
    const cached = cache.get(file);
    if (cached && cached.mtime === mtime) return cached.shape;
    const svg = fs.readFileSync(file, 'utf8');
    const name = path.relative(artDir, file);
    for (const warning of artWarnings(svg)) warn(`${name} ${warning}`);
    let shape: ShapeData;
    try {
      shape = makeShape(svg, longest);
    } catch (error) {
      throw new Error(`Could not read ${name}: ${(error as Error).message}`, { cause: error });
    }
    cache.set(file, { mtime, shape });
    return shape;
  };

  const sceneFolders = (): string[] => {
    const dir = path.join(artDir, 'scenes');
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  };

  return {
    name: 'peek-a-kumo-shapes',
    resolveId(id) {
      if (id === MAIN_ID || id.startsWith(SCENE_ID)) return `\0${id}`;
      return null;
    },
    load(id) {
      if (!id.startsWith('\0virtual:shapes')) return null;
      const warn = (message: string): void => this.warn(message);
      const shapes: Record<string, ShapeData> = {};

      if (id === `\0${MAIN_ID}`) {
        for (const group of ['objects', 'kumo']) {
          // (New and removed pictures are noticed by the watcher in configureServer.)
          const dir = path.join(artDir, group);
          for (const name of listSvgs(dir)) {
            const file = path.join(dir, name);
            this.addWatchFile(file);
            shapes[`${group}/${name.slice(0, -4)}`] = shapeOf(file, OBJECT_CELLS, warn);
          }
        }
        const loaders = sceneFolders()
          .map((folder) => `  ${JSON.stringify(folder)}: () => import(${JSON.stringify(SCENE_ID + folder)}),`)
          .join('\n');
        return `export const shapes = ${JSON.stringify(shapes)};\nexport const sceneShapes = {\n${loaders}\n};\n`;
      }

      const folder = id.slice(`\0${SCENE_ID}`.length);
      const dir = path.join(artDir, 'scenes', folder);
      for (const name of listSvgs(dir)) {
        if (name === 'background.svg') continue; // always behind everything, so it never hides anything
        const file = path.join(dir, name);
        this.addWatchFile(file);
        shapes[`scenes/${folder}/${name.slice(0, -4)}`] = shapeOf(file, PROP_CELLS, warn);
      }
      return `export default ${JSON.stringify(shapes)};\n`;
    },
    configureServer(devServer) {
      server = devServer;
      // A new or removed picture changes the list itself, so rebuild the maps and reload.
      const onChange = (file: string): void => {
        if (!file.startsWith(artDir) || !file.endsWith('.svg') || !server) return;
        for (const module of server.moduleGraph.idToModuleMap.values()) {
          if (module.id?.startsWith('\0virtual:shapes')) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: 'full-reload' });
      };
      devServer.watcher.on('add', onChange);
      devServer.watcher.on('unlink', onChange);
      devServer.watcher.on('change', onChange);
    },
  };
}
