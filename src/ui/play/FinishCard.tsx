import { useEffect, useRef } from 'preact/hooks';
import type { StickerDef } from '../../content';
import { s } from '../../i18n';
import { Icon } from '../common/Icon';
import { Sticker } from '../common/Sticker';

/** The celebration after the last find. Looking for Kumo stays optional and is never given away. */
export function FinishCard({
  kumoFound,
  hasKumo,
  stickers,
  onLookForKumo,
  onAgain,
  onHome,
}: {
  kumoFound: boolean;
  hasKumo: boolean;
  /** Stickers earned in this play, newest last. */
  stickers: StickerDef[];
  onLookForKumo: () => void;
  onAgain: () => void;
  onHome: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus({ preventScroll: true }), []);

  return (
    <div class="finish-layer">
      <div class="finish card" role="dialog" aria-modal="true" aria-labelledby="finish-title" tabIndex={-1} ref={card}>
        <Icon name="kumo/front" class="finish-kumo" />
        <h2 id="finish-title">{s.finish.title}</h2>
        {stickers.length > 0 && (
          <div class="new-stickers">
            {stickers.map((sticker) => (
              <figure key={sticker.id} class="new-sticker">
                <Sticker sticker={sticker} earned class="sticker-pop" />
                <figcaption>{sticker.kind === 'kumo' ? s.finish.kumoSticker : s.finish.newSticker}</figcaption>
              </figure>
            ))}
          </div>
        )}
        {hasKumo && <p class="finish-kumo-line">{kumoFound ? s.finish.kumoToo : s.finish.kumoHiding}</p>}
        {hasKumo && !kumoFound && (
          <button class="button button-wide" onClick={onLookForKumo}>
            <Icon name="ui/sparkle" />
            {s.finish.keepLooking}
          </button>
        )}
        <div class="button-pair">
          <button class="button button-go" onClick={onAgain}>
            <Icon name="ui/replay" />
            {s.finish.again}
          </button>
          <button class="button" onClick={onHome}>
            <Icon name="ui/home" />
            {s.finish.home}
          </button>
        </div>
      </div>
    </div>
  );
}
