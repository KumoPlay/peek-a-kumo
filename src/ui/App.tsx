import { useEffect, useRef, useState } from 'preact/hooks';
import type { DifficultyId } from '../content';
import { s } from '../i18n';
import { askToKeepStorage, eraseGame, loadGame } from '../platform/storage';
import { watchForNewerTab } from '../platform/tabs';
import { Confirm } from './common/Confirm';
import { Icon } from './common/Icon';
import { Play } from './play/Play';
import { Album } from './screens/Album';
import { Home } from './screens/Home';
import { Store } from './store';

type Boot =
  | { phase: 'loading' }
  | { phase: 'play'; store: Store }
  | { phase: 'unreadable'; reason: 'corrupt' | 'too-new' }
  | { phase: 'elsewhere' };

type Screen =
  | { name: 'home' }
  | { name: 'album' }
  | { name: 'play'; scene: string; difficulty: DifficultyId; fresh: boolean; run: number };

/** Everything after loading: one screen at a time. */
function Game({ store }: { store: Store }) {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const run = useRef(0);
  const play = (scene: string, difficulty: DifficultyId, fresh: boolean): void =>
    setScreen({ name: 'play', scene, difficulty, fresh, run: (run.current += 1) });

  if (screen.name === 'play') {
    return (
      <Play
        key={screen.run}
        store={store}
        sceneId={screen.scene}
        difficulty={screen.difficulty}
        fresh={screen.fresh}
        onHome={() => setScreen({ name: 'home' })}
        onAgain={() => play(screen.scene, screen.difficulty, true)}
      />
    );
  }
  if (screen.name === 'album') return <Album store={store} onBack={() => setScreen({ name: 'home' })} />;
  return <Home store={store} onPlay={play} onAlbum={() => setScreen({ name: 'album' })} />;
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [confirmNew, setConfirmNew] = useState(false);
  const storeRef = useRef<Store | null>(null);

  const start = (store: Store): void => {
    storeRef.current = store;
    setBoot({ phase: 'play', store });
    // Ask the browser to keep the save even when space runs low. It may say no; that is fine.
    void askToKeepStorage();
  };

  useEffect(() => {
    let active = true;
    // Tell other tabs first, so they stop saving before this one reads the save.
    const stopWatching = watchForNewerTab(() => {
      active = false;
      storeRef.current?.stop();
      setBoot({ phase: 'elsewhere' });
    });
    void loadGame().then((result) => {
      if (!active) return;
      if (result.status === 'unreadable') setBoot({ phase: 'unreadable', reason: result.reason });
      else start(result.status === 'loaded' ? new Store(result.state, result.rev) : Store.startNew());
    });
    return () => {
      active = false;
      stopWatching();
    };
  }, []);

  const sky = (
    <div class="sky" aria-hidden="true">
      <span class="drift drift-1" />
      <span class="drift drift-2" />
      <span class="drift drift-3" />
    </div>
  );

  if (boot.phase === 'play') {
    return (
      <div class="app">
        {sky}
        <Game store={boot.store} />
      </div>
    );
  }

  let body;
  if (boot.phase === 'loading') {
    body = (
      <>
        <Icon name="kumo/front" class="boot-kumo" />
        <h1 class="boot-title">{s.title}</h1>
        <p class="muted">{s.loading}</p>
      </>
    );
  } else if (boot.phase === 'elsewhere') {
    body = (
      <div class="card">
        <h1>{s.tabs.title}</h1>
        <p class="muted">{s.tabs.text}</p>
        <button class="button button-go button-wide" onClick={() => location.reload()}>
          {s.tabs.here}
        </button>
      </div>
    );
  } else {
    body = (
      <div class="card">
        <h1>{s.recover.title}</h1>
        {boot.reason === 'too-new' ? (
          <>
            <p class="muted">{s.recover.tooNew}</p>
            <button class="button button-go button-wide" onClick={() => location.reload()}>
              {s.recover.reload}
            </button>
          </>
        ) : (
          <>
            <p class="muted">{s.recover.corrupt}</p>
            <button class="button button-danger button-wide" onClick={() => setConfirmNew(true)}>
              {s.recover.startNew}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div class="app">
      {sky}
      <main class="boot">{body}</main>
      {confirmNew && (
        <Confirm
          title={s.recover.confirmTitle}
          text={s.recover.confirmText}
          safeLabel={s.recover.cancel}
          dangerLabel={s.recover.confirmYes}
          onSafe={() => setConfirmNew(false)}
          onDanger={() => {
            setConfirmNew(false);
            void eraseGame().then(() => start(Store.startNew()));
          }}
        />
      )}
    </div>
  );
}
