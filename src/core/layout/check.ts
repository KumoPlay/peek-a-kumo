import type { SceneDef } from '../../content/types';
import { mapper, sceneBox, toLocal } from '../geometry';
import { hasPaint, hitTest, tappable, type Tappable } from '../shapes';
import { drawList, type DrawEntry } from './drawList';
import type { Layout, ShapeSet } from './types';

/**
 * Checks that a layout is fair: every object on the list can be seen and
 * tapped, and Kumo peeks without hiding completely.
 *
 * The scene is drawn back to front onto a grid of small cells (4 scene units).
 * What an object still shows at the end is the part you can see.
 */
export interface CheckRules {
  /** Share of each object to find that must stay visible. */
  minVisible: number;
  /** Visible area needed, in square scene units. */
  minVisibleArea: number;
  /** Kumo shows at least this share of itself… */
  kumoMin: number;
  /** …and at most this share. */
  kumoMax: number;
}

export interface ItemReport {
  index: number;
  isTarget: boolean;
  /** Share of the outline that can be seen, 0 to 1. */
  visible: number;
  /** Visible area in square scene units. */
  area: number;
  /** Part of it sticks out of the scene. */
  outside: boolean;
  /** It covers part of Kumo. */
  overKumo: boolean;
  /** A tap on its visible part finds it (always true for decoys). */
  tappable: boolean;
  ok: boolean;
}

export interface CheckReport {
  ok: boolean;
  items: ItemReport[];
  kumo: { visible: number; outside: boolean; tappable: boolean; ok: boolean } | null;
  /** Plain-words problems, for the editor and test messages. */
  problems: string[];
}

/** Grid cell size in scene units. */
export const GRID = 4;
/** The tap margin used by the check: as generous as the game ever is (fully zoomed out). */
export const CHECK_MARGIN = 30;
/** How many visible cells to try before deciding an object cannot be tapped. */
const TAP_TRIES = 400;

/** The scene drawn onto the grid: who owns each cell, and how much of each thing shows. */
export interface Coverage {
  /** Objects and Kumo, back to front. (Props are summed up in `propTop`.) */
  list: DrawEntry[];
  cols: number;
  rows: number;
  /** Index in `list` of the object drawn last in each cell, or -1. */
  owner: Int16Array;
  /** The highest prop layer covering each cell (NO_PROP where there is none). */
  propTop: Int16Array;
  /** The cells each entry paints. */
  cells: Int32Array[];
  /** Cells each entry paints in total (including outside the scene), and cells where it can be seen. */
  total: Int32Array;
  seen: Int32Array;
  outside: Uint8Array;
  overKumo: Uint8Array;
  kumoAt: number;
}

const NO_PROP = -32768;

/** The grid cells a picture paints. Worked out once per placed picture and kept. */
interface Painted {
  cells: Int32Array;
  total: number;
  outside: boolean;
}

const paintedCache = new WeakMap<object, Painted>();
const propCache = new WeakMap<SceneDef, WeakMap<ShapeSet, Int16Array>>();

function paint(entry: DrawEntry, shapes: ShapeSet, cols: number, rows: number): Painted {
  const shape = shapes[entry.art]!;
  const m = mapper(entry.pose, entry.vb);
  const box = sceneBox(m);
  const c0 = Math.floor(box.x0 / GRID);
  const c1 = Math.floor(box.x1 / GRID);
  const r0 = Math.floor(box.y0 / GRID);
  const r1 = Math.floor(box.y1 / GRID);
  const cells: number[] = [];
  let total = 0;
  let outside = false;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const { u, v } = toLocal(m, (c + 0.5) * GRID, (r + 0.5) * GRID);
      if (!hasPaint(shape, u, v)) continue;
      total += 1;
      if (c < 0 || r < 0 || c >= cols || r >= rows) outside = true;
      else cells.push(r * cols + c);
    }
  }
  return { cells: Int32Array.from(cells), total, outside };
}

/** For each cell, the highest layer of any prop covering it. Props never move, so this is worked out once per scene. */
function propTopFor(scene: SceneDef, shapes: ShapeSet, cols: number, rows: number): Int16Array {
  let byShapes = propCache.get(scene);
  if (!byShapes) {
    byShapes = new WeakMap();
    propCache.set(scene, byShapes);
  }
  let top = byShapes.get(shapes);
  if (!top) {
    top = new Int16Array(cols * rows).fill(NO_PROP);
    for (const entry of drawList(scene, { seed: 0, items: [], kumo: null, entries: [] }, shapes)) {
      for (const cell of paint(entry, shapes, cols, rows).cells) top[cell] = Math.max(top[cell]!, entry.z);
    }
    byShapes.set(shapes, top);
  }
  return top;
}

/**
 * Draws a layout onto the grid. An object can be seen in a cell when it is the
 * last object drawn there and no prop on a higher layer covers it (a prop on
 * the same layer is behind it, as in drawList).
 */
export function coverage(scene: SceneDef, layout: Layout, shapes: ShapeSet): Coverage {
  const [width, height] = scene.size;
  const cols = Math.ceil(width / GRID);
  const rows = Math.ceil(height / GRID);
  const propTop = propTopFor(scene, shapes, cols, rows);
  const list = drawList(scene, layout, shapes).filter((entry) => entry.kind !== 'prop');
  const owner = new Int16Array(cols * rows).fill(-1);
  const total = new Int32Array(list.length);
  const seen = new Int32Array(list.length);
  const outside = new Uint8Array(list.length);
  const overKumo = new Uint8Array(list.length);
  const cells: Int32Array[] = [];

  list.forEach((entry, n) => {
    const key = entry.kind === 'kumo' ? layout.kumo! : layout.items[entry.index]!;
    let painted = paintedCache.get(key);
    if (!painted) {
      painted = paint(entry, shapes, cols, rows);
      paintedCache.set(key, painted);
    }
    cells[n] = painted.cells;
    total[n] = painted.total;
    outside[n] = painted.outside ? 1 : 0;
    for (const cell of painted.cells) owner[cell] = n;
  });

  const kumoAt = list.findIndex((entry) => entry.kind === 'kumo');
  const kumoCells = kumoAt >= 0 ? new Set(cells[kumoAt]) : null;
  list.forEach((entry, n) => {
    let count = 0;
    for (const cell of cells[n]!) {
      if (owner[cell] === n && propTop[cell]! <= entry.z) count += 1;
      if (kumoCells && n !== kumoAt && overKumo[n] === 0 && kumoCells.has(cell)) overKumo[n] = 1;
    }
    seen[n] = count;
  });
  return { list, cols, rows, owner, propTop, cells, total, seen, outside, overKumo, kumoAt };
}

function isVisible(cov: Coverage, n: number, cell: number): boolean {
  return cov.owner[cell] === n && cov.propTop[cell]! <= cov.list[n]!.z;
}

/** Centres of the cells where an item (or Kumo, key -1) can be seen. */
export function visiblePoints(cov: Coverage, key: number): { x: number; y: number }[] {
  const n = cov.list.findIndex((entry) => (key === -1 ? entry.kind === 'kumo' : entry.kind === 'item' && entry.index === key));
  if (n < 0) return [];
  const points: { x: number; y: number }[] = [];
  for (const cell of cov.cells[n]!) {
    if (isVisible(cov, n, cell)) points.push({ x: ((cell % cov.cols) + 0.5) * GRID, y: (Math.floor(cell / cov.cols) + 0.5) * GRID });
  }
  return points;
}

export function checkLayout(scene: SceneDef, layout: Layout, shapes: ShapeSet, rules: CheckRules): CheckReport {
  const cov = coverage(scene, layout, shapes);
  const { list, cols, total, seen, outside, overKumo, kumoAt } = cov;

  // Everything that can be tapped, exactly as the game sees it.
  const tappables: Tappable[] = [];
  list.forEach((entry, n) => {
    if (entry.kind === 'kumo') tappables.push(tappable(-1, shapes[entry.art]!, entry.pose, n));
    if (entry.kind === 'item' && layout.items[entry.index]!.entry >= 0) {
      tappables.push(tappable(entry.index, shapes[entry.art]!, entry.pose, n));
    }
  });
  const indexOfItem = new Map<number, number>();
  list.forEach((entry, n) => {
    if (entry.kind === 'item') indexOfItem.set(entry.index, n);
  });

  /** Tries taps on cells where this entry is visible, until one finds it. */
  const canTap = (n: number, key: number): boolean => {
    let tries = 0;
    for (const cell of cov.cells[n]!) {
      if (!isVisible(cov, n, cell)) continue;
      if (tries++ >= TAP_TRIES) break;
      const x = ((cell % cols) + 0.5) * GRID;
      const y = (Math.floor(cell / cols) + 0.5) * GRID;
      if (hitTest(tappables, x, y, CHECK_MARGIN)?.key === key) return true;
    }
    return false;
  };

  const problems: string[] = [];
  const items: ItemReport[] = layout.items.map((item, index) => {
    const n = indexOfItem.get(index)!;
    const isTarget = item.entry >= 0;
    const visible = total[n]! > 0 ? seen[n]! / total[n]! : 0;
    const area = seen[n]! * GRID * GRID;
    const report: ItemReport = {
      index,
      isTarget,
      visible,
      area,
      outside: outside[n] === 1,
      overKumo: overKumo[n] === 1,
      tappable: isTarget ? canTap(n, index) : true,
      ok: true,
    };
    const name = `${item.obj} at ${item.spot}`;
    if (report.outside) problems.push(`${name} sticks out of the scene`);
    if (report.overKumo) problems.push(`${name} covers Kumo`);
    if (isTarget) {
      if (visible < rules.minVisible) problems.push(`${name} is only ${Math.round(visible * 100)}% visible`);
      if (area < rules.minVisibleArea) problems.push(`${name} shows too little (${Math.round(area)} units²)`);
      if (!report.tappable) problems.push(`${name} cannot be tapped`);
    }
    report.ok =
      !report.outside &&
      !report.overKumo &&
      (!isTarget || (visible >= rules.minVisible && area >= rules.minVisibleArea && report.tappable));
    return report;
  });

  let kumo: CheckReport['kumo'] = null;
  if (kumoAt >= 0 && layout.kumo) {
    const visible = total[kumoAt]! > 0 ? seen[kumoAt]! / total[kumoAt]! : 0;
    const kumoOutside = outside[kumoAt] === 1;
    const kumoTap = canTap(kumoAt, -1);
    const ok = !kumoOutside && visible >= rules.kumoMin && visible <= rules.kumoMax && kumoTap;
    if (!ok) {
      const at = `Kumo at ${layout.kumo.spot}`;
      if (kumoOutside) problems.push(`${at} sticks out of the scene`);
      if (visible < rules.kumoMin) problems.push(`${at} is hidden too much (${Math.round(visible * 100)}% visible)`);
      if (visible > rules.kumoMax) problems.push(`${at} is not hidden enough (${Math.round(visible * 100)}% visible)`);
      if (!kumoTap) problems.push(`${at} cannot be tapped`);
    }
    kumo = { visible, outside: kumoOutside, tappable: kumoTap, ok };
  }

  return { ok: problems.length === 0, items, kumo, problems };
}
