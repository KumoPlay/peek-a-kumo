import { useState } from 'preact/hooks';
import { s } from '../../i18n';
import { Confirm } from '../common/Confirm';
import { Icon } from '../common/Icon';
import { Sheet } from '../common/Sheet';
import { useSave, type Store } from '../store';

/** The menu inside a scene: sound, words, a new shuffle, and home. */
export function MenuSheet({
  store,
  onClose,
  onStartOver,
  onHome,
}: {
  store: Store;
  onClose: () => void;
  onStartOver: () => void;
  onHome: () => void;
}) {
  const save = useSave(store);
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <Confirm
        title={s.menu.startOverTitle}
        text={s.menu.startOverText}
        safeLabel={s.menu.keepPlaying}
        dangerLabel={s.menu.startOverYes}
        onSafe={() => setConfirm(false)}
        onDanger={onStartOver}
      />
    );
  }

  return (
    <Sheet title={s.menu.title} onClose={onClose} small>
      <div class="menu-buttons">
        <button class="button button-go button-wide" onClick={onClose}>
          <Icon name="ui/play" />
          {s.menu.keepPlaying}
        </button>
        <div class="button-pair">
          <button
            class={`button switch${save.settings.sound ? ' switch-on' : ''}`}
            role="switch"
            aria-checked={save.settings.sound}
            onClick={() => store.update((draft) => void (draft.settings.sound = !draft.settings.sound))}
          >
            <Icon name={save.settings.sound ? 'ui/sound-on' : 'ui/sound-off'} />
            {save.settings.sound ? s.play.soundOn : s.play.soundOff}
          </button>
          <button
            class={`button switch${save.settings.words ? ' switch-on' : ''}`}
            role="switch"
            aria-checked={save.settings.words}
            onClick={() => store.update((draft) => void (draft.settings.words = !draft.settings.words))}
          >
            <Icon name={save.settings.words ? 'ui/check' : 'ui/close'} />
            {save.settings.words ? s.settings.wordsOn : s.settings.wordsOff}
          </button>
        </div>
        <button class="button button-wide" onClick={() => setConfirm(true)}>
          <Icon name="ui/replay" />
          {s.menu.startOver}
        </button>
        <button class="button button-wide" onClick={onHome}>
          <Icon name="ui/home" />
          {s.menu.home}
        </button>
      </div>
    </Sheet>
  );
}
