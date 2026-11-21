import { useState } from 'preact/hooks';
import { scenes, STICKER_KINDS, stickerCatalog, stickerFor, type StickerDef } from '../../content';
import { fmt, s, sceneName } from '../../i18n';
import { Icon } from '../common/Icon';
import { Sheet } from '../common/Sheet';
import { Sticker } from '../common/Sticker';
import { useSave, type Store } from '../store';

function formatDay(day: string): string {
  if (!day) return '';
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(document.documentElement.lang || 'en', { day: 'numeric', month: 'long', year: 'numeric' });
}

function howToEarn(sticker: StickerDef): string {
  const scene = scenes.find((sc) => sc.id === sticker.scene);
  const name = scene ? sceneName(scene) : sticker.scene;
  const template = { easy: s.album.howEasy, normal: s.album.howNormal, tricky: s.album.howTricky, kumo: s.album.howKumo }[sticker.kind];
  return fmt(template, { scene: name });
}

/** Every sticker, scene by scene. Missing ones show how to earn them. */
export function Album({ store, onBack }: { store: Store; onBack: () => void }) {
  const save = useSave(store);
  const [open, setOpen] = useState<StickerDef | null>(null);
  const all = stickerCatalog();
  const earnedCount = all.filter((sticker) => save.stickers[sticker.id]).length;
  const record = open ? save.stickers[open.id] : undefined;

  return (
    <main class="album">
      <header class="top-row">
        <button class="round-button" onClick={onBack} aria-label={s.back}>
          <Icon name="ui/back" />
        </button>
        <div class="album-heading">
          <h1>{s.album.title}</h1>
          <p class="muted">{fmt(s.album.count, { n: earnedCount, total: all.length })}</p>
        </div>
        <span class="round-spacer" />
      </header>
      <div class="album-pages">
        {scenes.map((scene) => (
          <section key={scene.id} class="album-page" aria-label={sceneName(scene)}>
            <h2>{sceneName(scene)}</h2>
            <ul class="album-row">
              {STICKER_KINDS.map((kind) => {
                const sticker = stickerFor(scene, kind);
                const earned = Boolean(save.stickers[sticker.id]);
                return (
                  <li key={kind}>
                    <button
                      class="album-slot"
                      onClick={() => setOpen(sticker)}
                      aria-label={`${s.stickerKinds[kind]}: ${earned ? '' : s.album.missing}`}
                    >
                      <Sticker sticker={sticker} earned={earned} class="album-sticker" />
                      <span class="album-label">{s.stickerKinds[kind]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {open && (
        <Sheet title={s.stickerKinds[open.kind] ?? ''} onClose={() => setOpen(null)} small>
          <div class="sticker-detail">
            <Sticker sticker={open} earned={Boolean(record)} class="sticker-big" />
            <p>{sceneName(scenes.find((sc) => sc.id === open.scene) ?? scenes[0]!)}</p>
            <p class="muted">{record ? (formatDay(record.at) ? fmt(s.album.earned, { date: formatDay(record.at) }) : '') : howToEarn(open)}</p>
          </div>
        </Sheet>
      )}
    </main>
  );
}
