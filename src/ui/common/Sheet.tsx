import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { s } from '../../i18n';
import { Icon } from './Icon';

/** A panel that slides up from the bottom on phones and sits in the middle on big screens. */
export function Sheet({
  title,
  onClose,
  children,
  small,
}: {
  title: string;
  onClose?: () => void;
  children: ComponentChildren;
  small?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Without preventScroll, focusing a panel that is still sliding in would nudge the whole page.
    panel.current?.focus({ preventScroll: true });
    if (!onClose) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="sheet-layer">
      <div class="sheet-backdrop" onClick={onClose} />
      <div
        class={small ? 'sheet sheet-small' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <header class="sheet-head">
          <h2>{title}</h2>
          {onClose && (
            <button class="round-button" onClick={onClose} aria-label={s.close}>
              <Icon name="ui/close" />
            </button>
          )}
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
