import { useEffect, useState } from 'preact/hooks';
import { DIFFICULTIES, scenes, STICKER_KINDS, stickerCatalog, stickerFor, type DifficultyId, type SceneDef } from '../../content';
import { isDifficultyOpen, isSceneOpen, latestPlay, playKey, progressOf, type SaveState } from '../../core';
import { difficultyName, fmt, s, sceneName } from '../../i18n';
import { shouldSuggestInstall } from '../../platform/install';
import { isUpdateReady, onUpdateReady, updateNow } from '../../platform/pwa';
import { Icon } from '../common/Icon';
import { InstallHint } from '../common/InstallHint';
import { Emblem, Sticker } from '../common/Sticker';
import { useSave, type Store } from '../store';
import { SettingsSheet } from './SettingsSheet';

function countFound(save: SaveState, sceneId: string, difficulty: DifficultyId): { found: number; total: number } | null {
  const play = save.plays[playKey(sceneId, difficulty)];
  if (!play) return null;
  return { found: play.found.length, total: play.layout.items.filter((item) => item.entry >= 0).length };
}

function SceneCard({
  scene,
  save,
  onPlay,
}: {
  scene: SceneDef;
  save: SaveState;
  onPlay: (sceneId: string, difficulty: DifficultyId) => void;
}) {
  const open = isSceneOpen(save, scene.id);
  const progress = progressOf(save, scene.id);
  return (
    <article class={open ? 'scene-card' : 'scene-card is-locked'}>
      <header class="scene-card-head">
        <span class="scene-card-emblem">
          <Emblem name={scene.emblem} />
          {!open && <Icon name="ui/lock" class="scene-card-lock" />}
        </span>
        <div class="scene-card-title">
          <h2>{sceneName(scene)}</h2>
          {!open && <p class="muted small">{s.home.locked}</p>}
          <ul class="mini-stickers" aria-hidden="true">
          {STICKER_KINDS.map((kind) => {
            const sticker = stickerFor(scene, kind);
            return (
              <li key={kind}>
                <Sticker sticker={sticker} earned={Boolean(save.stickers[sticker.id])} class="mini-sticker" />
              </li>
            );
          })}
          </ul>
        </div>
      </header>
      {open && (
        <div class="level-list" role="group" aria-label={s.home.pickLevel}>
          {DIFFICULTIES.map((difficulty) => {
            const allowed = isDifficultyOpen(save, scene.id, difficulty);
            const going = countFound(save, scene.id, difficulty);
            const finished = progress.done[difficulty] > 0;
            return (
              <button
                key={difficulty}
                class={`level level-${difficulty}`}
                disabled={!allowed}
                onClick={() => onPlay(scene.id, difficulty)}
              >
                <span class="level-name">
                  {!allowed && <Icon name="ui/lock" class="level-check" />}
                  {difficultyName(difficulty)}
                  {finished && <Icon name="ui/check" class="level-check" />}
                </span>
                <span class="level-help">
                  {!allowed ? s.home.trickyLocked : going ? fmt(s.home.found, going) : (s.difficultyHelp[difficulty] ?? '')}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}

export function Home({
  store,
  onPlay,
  onAlbum,
}: {
  store: Store;
  onPlay: (sceneId: string, difficulty: DifficultyId, fresh: boolean) => void;
  onAlbum: () => void;
}) {
  const save = useSave(store);
  const [settings, setSettings] = useState(false);
  const [updateReady, setUpdateReady] = useState(isUpdateReady());
  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);
  const latest = latestPlay(save);
  const latestScene = latest ? scenes.find((scene) => scene.id === latest.scene) : undefined;
  const all = stickerCatalog();
  const earned = all.filter((sticker) => save.stickers[sticker.id]).length;
  const showInstallHint = save.stats.finished >= 1 && !save.seen.installHint && shouldSuggestInstall();

  return (
    <main class="home">
      <div class="home-top">
        <button class="pill-button" onClick={onAlbum}>
          <Sticker sticker={stickerFor(scenes[0]!, 'kumo')} earned class="pill-sticker" />
          <span>
            {s.home.album}
            <small>{fmt(s.home.stickers, { n: earned, total: all.length })}</small>
          </span>
        </button>
        <button class="round-button" onClick={() => setSettings(true)} aria-label={s.home.settings}>
          <Icon name="ui/gear" />
        </button>
      </div>

      <header class="home-head">
        <div class="logo-card">
          <Icon name="kumo/side" class="logo-kumo" />
          <h1>{s.title}</h1>
        </div>
        <p class="home-tagline">{s.tagline}</p>
      </header>

      {updateReady && (
        <div class="note-card" role="status">
          <span>{s.update.ready}</span>
          <button class="button button-small" onClick={updateNow}>
            {s.update.reload}
          </button>
        </div>
      )}

      {latest && latestScene && (
        <button class="button button-go button-big continue" onClick={() => onPlay(latest.scene, latest.difficulty, false)}>
          <Icon name="ui/play" />
          <span class="continue-text">
            {s.home.continue}
            <small>
              {sceneName(latestScene)} · {difficultyName(latest.difficulty)} ·{' '}
              {fmt(s.home.found, countFound(save, latest.scene, latest.difficulty) ?? { found: 0, total: 0 })}
            </small>
          </span>
        </button>
      )}

      {showInstallHint && <InstallHint onDone={() => store.update((draft) => void (draft.seen.installHint = true))} />}

      <section class="scene-list">
        {scenes.map((scene) => (
          <SceneCard key={scene.id} scene={scene} save={save} onPlay={(id, difficulty) => onPlay(id, difficulty, false)} />
        ))}
      </section>

      <footer class="made-by">
        <Icon name="app/kumoplay" />
        <span>{s.madeBy}</span>
      </footer>
      {settings && <SettingsSheet store={store} onClose={() => setSettings(false)} />}
    </main>
  );
}
