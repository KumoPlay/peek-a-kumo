/**
 * Colours. Object pictures mark their colourable parts as
 * var(--c1, …) (main), var(--c2, …) (shade) and var(--c3, …) (light);
 * a tint fills in all three. Based on the KumoPlay logo palette.
 */
export interface Tint {
  c1: string;
  c2: string;
  c3: string;
}

export const tints: Record<string, Tint> = {
  pink: { c1: '#F9A8C8', c2: '#E07AA2', c3: '#FFE0EC' },
  peach: { c1: '#FFC29E', c2: '#EC9468', c3: '#FFE6D6' },
  butter: { c1: '#FFDF85', c2: '#E5B243', c3: '#FFF4CC' },
  mint: { c1: '#A6E3C5', c2: '#62BD95', c3: '#DDF7EA' },
  sky: { c1: '#A9D3F7', c2: '#5FA6E3', c3: '#DDEEFC' },
  lilac: { c1: '#CDB9F5', c2: '#9F88E6', c3: '#EEE6FD' },
};

/**
 * Background colours, for the `tone` of a spot: what is around it. Easy picks
 * object colours far from it, Tricky picks colours close to it.
 */
export const tones: Record<string, string> = {
  pink: '#F7CFDD',
  peach: '#FAD6C0',
  butter: '#FBEBB5',
  mint: '#CDEBD9',
  sky: '#CFE4F7',
  lilac: '#DDD2F5',
  cream: '#FFF4E4',
  wood: '#D9AE84',
  white: '#FFFFFF',
  plum: '#6E6496',
};

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** How different two colours look (bigger = more different). */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  const mean = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
}

/** CSS that applies a tint to an object picture. */
export function tintStyle(tint: string | null): string {
  const t = tint ? tints[tint] : undefined;
  return t ? `--c1:${t.c1};--c2:${t.c2};--c3:${t.c3}` : '';
}
