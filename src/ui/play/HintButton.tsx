import { useEffect, useState } from 'preact/hooks';
import { s } from '../../i18n';
import { Icon } from '../common/Icon';

/** The free hint. Its ring fills up by itself; when full, a tap sparkles one thing still to find. */
export function HintButton({
  readyAt,
  waitMs,
  disabled,
  onHint,
}: {
  readyAt: number;
  waitMs: number;
  disabled: boolean;
  onHint: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const ready = now >= readyAt;

  useEffect(() => {
    if (Date.now() >= readyAt) {
      setNow(Date.now());
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= readyAt) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, [readyAt]);

  const fill = ready ? 1 : Math.max(0, Math.min(1, 1 - (readyAt - now) / waitMs));
  const usable = ready && !disabled;
  return (
    <button
      class={usable ? 'hint-button is-ready' : 'hint-button'}
      style={{ '--fill': `${Math.round(fill * 360)}deg` }}
      onClick={usable ? onHint : undefined}
      aria-label={usable ? s.play.hint : s.play.hintWait}
      aria-disabled={!usable}
    >
      <span class="hint-face">
        <Icon name="ui/sparkle" />
      </span>
    </button>
  );
}
