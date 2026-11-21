import type { Ref } from 'preact';
import type { FindEntry } from '../../core';
import { fmt, objectName, s } from '../../i18n';
import { Icon } from '../common/Icon';
import { ObjectArt } from '../common/ObjectArt';

/**
 * The list of things to find: pictures first (for players who cannot read
 * yet), with an optional word under each. "Find 3 of" shows 0/3.
 * The last slot is Kumo's secret spot.
 */
export function FindTray({
  entries,
  found,
  words,
  hasKumo,
  kumoFound,
  chipRef,
  kumoRef,
  popping,
}: {
  entries: FindEntry[];
  /** How many of each line have landed in the list so far. */
  found: number[];
  words: boolean;
  hasKumo: boolean;
  kumoFound: boolean;
  chipRef: (index: number) => Ref<HTMLLIElement>;
  kumoRef: Ref<HTMLLIElement>;
  /** Lines that just got a find, for a little pop. */
  popping: ReadonlySet<number>;
}) {
  return (
    <section class={words ? 'tray' : 'tray tray-no-words'} aria-label={s.play.list}>
      <ul class="tray-list">
        {entries.map((entry, i) => {
          const got = found[i] ?? 0;
          const done = got >= entry.count;
          const name = objectName(entry.obj);
          const classes = ['chip-find', done ? 'is-done' : '', popping.has(i) ? 'is-pop' : ''].filter(Boolean).join(' ');
          return (
            <li key={i} class={classes} ref={chipRef(i)} aria-label={fmt(done ? s.play.foundIt : s.play.stillToFind, { name })}>
              <span class="chip-pic">
                <ObjectArt obj={entry.obj} tint={entry.tint} class="chip-art" />
                {entry.count > 1 && !done && (
                  <span class="chip-count">
                    {got}/{entry.count}
                  </span>
                )}
                {done && <Icon name="ui/check" class="chip-check" />}
              </span>
              {words && <span class="chip-word">{name}</span>}
            </li>
          );
        })}
        {hasKumo && (
          <li class={kumoFound ? 'chip-find chip-kumo is-done' : 'chip-find chip-kumo'} ref={kumoRef} aria-label={kumoFound ? s.play.kumoFound : s.play.kumoSlot}>
            <span class="chip-pic">
              <Icon name="kumo/front" class="chip-art" />
              {!kumoFound && <span class="chip-secret">?</span>}
            </span>
            {words && <span class="chip-word">{kumoFound ? 'Kumo' : '???'}</span>}
          </li>
        )}
      </ul>
    </section>
  );
}
