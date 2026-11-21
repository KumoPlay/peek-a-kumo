import { useState } from 'preact/hooks';
import { importSaveCode, SaveError, type SaveState } from '../../core';
import { s } from '../../i18n';

function problemText(error: unknown): string {
  if (error instanceof SaveError) {
    if (error.code === 'too-new') return s.settings.newerCode;
    if (error.code === 'corrupt') return s.settings.brokenCode;
    if (error.code === 'other-game') return s.settings.otherGame;
  }
  return s.settings.badCode;
}

/** Paste a backup code or pick a backup file, then load it. */
export function BackupLoader({ onLoad }: { onLoad: (state: SaveState) => void }) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const tryLoad = (text: string): void => {
    try {
      onLoad(importSaveCode(text).state);
      setCode('');
      setProblem(null);
    } catch (error) {
      setProblem(problemText(error));
    }
  };

  const onFile = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then(
      (text) => {
        setCode(text.trim());
        setProblem(null);
      },
      () => setProblem(s.settings.badCode),
    );
  };

  return (
    <div class="backup-loader">
      <p class="muted">{s.settings.loadHelp}</p>
      <textarea
        class="code-box"
        rows={3}
        value={code}
        placeholder={s.settings.codePlaceholder}
        aria-label={s.settings.loadTitle}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
        onInput={(event) => {
          setCode((event.currentTarget as HTMLTextAreaElement).value);
          setProblem(null);
        }}
      />
      {problem && (
        <p class="problem" role="alert">
          {problem}
        </p>
      )}
      <div class="button-row">
        <label class="button button-quiet file-button">
          {s.settings.chooseFile}
          <input type="file" accept=".txt,text/plain" onChange={onFile} />
        </label>
        <button class="button" disabled={code.trim() === ''} onClick={() => tryLoad(code)}>
          {s.settings.load}
        </button>
      </div>
    </div>
  );
}
