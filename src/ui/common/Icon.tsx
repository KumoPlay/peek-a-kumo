import type { CSSProperties } from 'preact';
import { icon } from '../../art';

/** A picture from src/art, by name: <Icon name="ui/home" />. Decorative unless `label` is given. */
export function Icon({
  name,
  label,
  class: className,
  style,
}: {
  name: string;
  label?: string;
  class?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      class={className ? `icon ${className}` : 'icon'}
      src={icon(name)}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      draggable={false}
      style={style}
    />
  );
}
