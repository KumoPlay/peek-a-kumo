import { spriteSvg, svgParts } from '../../art';
import type { StickerDef } from '../../content';

const innerOf = (name: string): string => svgParts(spriteSvg(name) ?? '').inner;

/** A sticker: its frame (by kind) with the scene's emblem; Kumo's stickers have Kumo peeking beside it. */
export function stickerMarkup(sticker: StickerDef): string {
  const frame = innerOf(sticker.frame);
  const emblem = innerOf(sticker.emblem);
  if (sticker.kind === 'kumo') {
    return `${frame}<g transform="translate(40 34) scale(.5)">${emblem}</g><g transform="translate(14 26) scale(.48)">${innerOf('kumo/front')}</g>`;
  }
  return `${frame}<g transform="translate(11 11) scale(.78)">${emblem}</g>`;
}

export function Sticker({ sticker, earned, class: className }: { sticker: StickerDef; earned: boolean; class?: string }) {
  return (
    <span class={['sticker', earned ? '' : 'is-missing', className ?? ''].filter(Boolean).join(' ')}>
      <svg
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
        dangerouslySetInnerHTML={{ __html: earned ? stickerMarkup(sticker) : innerOf(sticker.frame) }}
      />
      {!earned && <span class="sticker-secret">?</span>}
    </span>
  );
}

/** A scene's emblem on its own, for the scene list. */
export function Emblem({ name, class: className }: { name: string; class?: string }) {
  return (
    <svg
      class={className}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: innerOf(`stickers/${name}`) }}
    />
  );
}
