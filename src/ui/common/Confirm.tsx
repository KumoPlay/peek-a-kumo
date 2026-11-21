import { Sheet } from './Sheet';

/** A clear yes/no question. The safe answer is the big, first button. */
export function Confirm({
  title,
  text,
  safeLabel,
  dangerLabel,
  onSafe,
  onDanger,
}: {
  title: string;
  text: string;
  safeLabel: string;
  dangerLabel: string;
  onSafe: () => void;
  onDanger: () => void;
}) {
  return (
    <Sheet title={title} onClose={onSafe} small>
      <p class="confirm-text">{text}</p>
      <div class="confirm-buttons">
        <button class="button button-go button-wide" onClick={onSafe}>
          {safeLabel}
        </button>
        <button class="button button-danger button-wide" onClick={onDanger}>
          {dangerLabel}
        </button>
      </div>
    </Sheet>
  );
}
