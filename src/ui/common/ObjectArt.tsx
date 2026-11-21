import { symbolId } from '../../art';
import { tintStyle } from '../../content/colors';

/** An object picture in its colour, drawn from the shared symbol (same as in the scene). */
export function ObjectArt({ obj, tint, class: className }: { obj: string; tint: string | null; class?: string }) {
  return (
    <svg class={className} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <use href={`#${symbolId(`objects/${obj}`)}`} width="100" height="100" style={tintStyle(tint)} />
    </svg>
  );
}
