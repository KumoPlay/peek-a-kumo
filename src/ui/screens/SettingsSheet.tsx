import { useEffect, useState } from 'preact/hooks';
import { exportSaveCode, newSave, type SaveState } from '../../core';
import { fmt, s } from '../../i18n';
import { copyText, downloadText } from '../../platform/files';
import { isInstalled } from '../../platform/install';
import { askToKeepStorage, isSavingWorking } from '../../platform/storage';
import { BackupLoader } from '../common/BackupLoader';
import { Confirm } from '../common/Confirm';
import { Icon } from '../common/Icon';
import { InstallSteps } from '../common/InstallHint';
import { Sheet } from '../common/Sheet';
import { useSave, type Store } from '../store';

export function SettingsSheet({ store, onClose }: { store: Store; onClose: () => void }) {
  const save = useSave(store);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [kept, setKept] = useState<boolean | null>(null);
  const [pendingBackup, setPendingBackup] = useState<SaveState | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let active = true;
    void askToKeepStorage().then((answer) => {
      if (active) setKept(answer);
    });
    return () => {
      active = false;
    };
  }, []);

  const currentCode = (): string => exportSaveCode(store.get(), store.getRev());

  const copy = async (): Promise<void> => {
    const code = currentCode();
    if (await copyText(code)) {
      setCopyNote(s.settings.copied);
      setShownCode(null);
    } else {
      // The browser would not copy for us: show the code so it can be copied by hand.
      setCopyNote(s.settings.copyFailed);
      setShownCode(code);
    }
  };

  if (pendingBackup) {
    return (
      <Confirm
        title={s.settings.loadConfirmTitle}
        text={s.settings.loadConfirmText}
        safeLabel={s.settings.cancel}
        dangerLabel={s.settings.loadYes}
        onSafe={() => setPendingBackup(null)}
        onDanger={() => {
          store.replace(pendingBackup);
          setPendingBackup(null);
          onClose();
        }}
      />
    );
  }
  if (confirmReset) {
    return (
      <Confirm
        title={s.settings.resetConfirmTitle}
        text={s.settings.resetConfirmText}
        safeLabel={s.settings.keep}
        dangerLabel={s.settings.resetYes}
        onSafe={() => setConfirmReset(false)}
        onDanger={() => {
          // A fresh start keeps the player's settings and the notes they have already seen.
          const fresh = newSave();
          fresh.settings = { ...save.settings };
          fresh.seen.installHint = save.seen.installHint;
          store.replace(fresh);
          setConfirmReset(false);
          onClose();
        }}
      />
    );
  }

  const storageNote = !isSavingWorking()
    ? s.settings.storageBroken
    : kept
      ? s.settings.storageSafe
      : kept === false
        ? s.settings.storageMaybe
        : null;

  return (
    <Sheet title={s.settings.title} onClose={onClose}>
      <section class="settings-section">
        <h3>{s.settings.soundTitle}</h3>
        <button
          class="button"
          role="switch"
          aria-checked={save.settings.sound}
          onClick={() => store.update((draft) => void (draft.settings.sound = !draft.settings.sound))}
        >
          <Icon name={save.settings.sound ? 'ui/sound-on' : 'ui/sound-off'} />
          {save.settings.sound ? s.settings.soundOn : s.settings.soundOff}
        </button>
      </section>

      <section class="settings-section">
        <h3>{s.settings.wordsTitle}</h3>
        <p class="muted">{s.settings.wordsHelp}</p>
        <button
          class={`button switch${save.settings.words ? ' switch-on' : ''}`}
          role="switch"
          aria-checked={save.settings.words}
          onClick={() => store.update((draft) => void (draft.settings.words = !draft.settings.words))}
        >
          <Icon name={save.settings.words ? 'ui/check' : 'ui/close'} />
          {save.settings.words ? s.settings.wordsOn : s.settings.wordsOff}
        </button>
        <p class="muted small">{s.settings.motion}</p>
      </section>

      <section class="settings-section">
        <h3>{s.settings.installTitle}</h3>
        {isInstalled() ? (
          <p class="muted">{s.install.installed}</p>
        ) : (
          <>
            <p class="muted">{s.install.why}</p>
            <InstallSteps />
          </>
        )}
      </section>

      <section class="settings-section">
        <h3>{s.settings.backupTitle}</h3>
        <p class="muted">{s.settings.backupHelp}</p>
        {storageNote && <p class={isSavingWorking() ? 'note' : 'note note-warn'}>{storageNote}</p>}
        <div class="button-row">
          <button class="button" onClick={() => void copy()}>
            {s.settings.copyCode}
          </button>
          <button class="button" onClick={() => downloadText('peek-a-kumo-backup.txt', currentCode())}>
            {s.settings.saveFile}
          </button>
        </div>
        {copyNote && (
          <p class="note" role="status">
            {copyNote}
          </p>
        )}
        {shownCode && (
          <textarea
            class="code-box"
            rows={4}
            readOnly
            value={shownCode}
            onFocus={(event) => (event.currentTarget as HTMLTextAreaElement).select()}
          />
        )}
      </section>

      <section class="settings-section">
        <h3>{s.settings.loadTitle}</h3>
        <BackupLoader onLoad={setPendingBackup} />
      </section>

      <section class="settings-section">
        <h3>{s.settings.resetTitle}</h3>
        <button class="button button-danger" onClick={() => setConfirmReset(true)}>
          {s.settings.resetButton}
        </button>
      </section>

      <p class="made-by made-by-settings">
        <Icon name="app/kumoplay" class="made-by-mark" />
        <span>
          {s.settings.madeBy}
          <small class="muted"> · {fmt(s.settings.version, { v: __APP_VERSION__ })}</small>
        </span>
      </p>
    </Sheet>
  );
}
