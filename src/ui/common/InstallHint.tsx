import { useEffect, useState } from 'preact/hooks';
import { s } from '../../i18n';
import { askToInstall, installWay, onInstallChange } from '../../platform/install';
import { Icon } from './Icon';

/** How to add the game to the home screen, in the way this browser does it. */
export function InstallSteps({ onDone }: { onDone?: () => void }) {
  const [, redraw] = useState(0);
  useEffect(() => onInstallChange(() => redraw((n) => n + 1)), []);
  const way = installWay();
  if (way === 'button') {
    return (
      <div class="button-row">
        <button
          class="button button-go"
          onClick={() => {
            void askToInstall().then(() => onDone?.());
          }}
        >
          <Icon name="ui/home-screen" />
          {s.install.add}
        </button>
        {onDone && (
          <button class="button button-quiet" onClick={onDone}>
            {s.install.later}
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      <p class="note">{way === 'ios' ? s.install.ios : s.install.other}</p>
      {onDone && (
        <div class="button-row">
          <button class="button" onClick={onDone}>
            {s.install.ok}
          </button>
        </div>
      )}
    </>
  );
}

/** A gentle, one-time suggestion. It never comes back once it has been closed. */
export function InstallHint({ onDone }: { onDone: () => void }) {
  return (
    <aside class="hint-card">
      <p>
        <Icon name="ui/home-screen" />
        <span>{s.install.why}</span>
      </p>
      <InstallSteps onDone={onDone} />
    </aside>
  );
}
