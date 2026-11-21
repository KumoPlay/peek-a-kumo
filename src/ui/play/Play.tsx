import type { Ref } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { loadSceneArt } from '../../art';
import { shapesForScene } from '../../art/shapes';
import { rulesFor, sceneById, stickerCatalog, type DifficultyId, type DifficultyRules, type SceneDef } from '../../content';
import {
  Gestures,
  indexPlay,
  isComplete,
  markFound,
  markKumo,
  newSeed,
  playKey,
  progressOf,
  recordFind,
  recordFinish,
  recordKumo,
  recordPlay,
  recordStart,
  remaining,
  settleHint,
  shuffleLayout,
  startPlay,
  takeHint,
  tapAt,
  today,
  type GestureEvent,
  type PlayIndex,
  type PlayState,
} from '../../core';
import { difficultyName, fmt, objectName, s, sceneName } from '../../i18n';
import { sfx } from '../../platform/audio';
import { Camera } from '../../render/camera';
import { confetti, flyKumo, flyObject, missPuff, prefersReducedMotion } from '../../render/fx';
import { SceneView } from '../../render/sceneView';
import { Icon } from '../common/Icon';
import type { Store } from '../store';
import { FindTray } from './FindTray';
import { FinishCard } from './FinishCard';
import { HintButton } from './HintButton';
import { MenuSheet } from './MenuSheet';

/** A tap may miss an object by this many screen pixels and still find it. */
const TAP_MARGIN_PX = 12;
/** How far in you can zoom, compared with the whole scene. */
const MAX_ZOOM = 4;
/** A miss wobble waits this long, so the first tap of a double-tap does not wobble. */
const MISS_DELAY_MS = 260;
/** Hint sparkles are at least this big on screen. */
const HINT_MIN_PX = 120;

interface Setup {
  scene: SceneDef;
  rules: DifficultyRules;
  index: PlayIndex;
  view: SceneView;
}

export function Play({
  store,
  sceneId,
  difficulty,
  fresh,
  onHome,
  onAgain,
}: {
  store: Store;
  sceneId: string;
  difficulty: DifficultyId;
  /** Start a new shuffle even if there is an unfinished play. */
  fresh: boolean;
  onHome: () => void;
  onAgain: () => void;
}) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [, setVersion] = useState(0);
  const redraw = useCallback(() => setVersion((n) => n + 1), []);
  const setupRef = useRef<Setup | null>(null);
  const playRef = useRef<PlayState | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const chips = useRef<(HTMLLIElement | null)[]>([]);
  const kumoChip = useRef<HTMLLIElement>(null);
  const [landed, setLanded] = useState<number[]>([]);
  const [kumoLanded, setKumoLanded] = useState(false);
  const [popping, setPopping] = useState<Set<number>>(new Set());
  const [finish, setFinish] = useState<'none' | 'open' | 'closed'>('none');
  const [announce, setAnnounce] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  /** Sticker ids earned during this play, for the finish card. */
  const [earned, setEarned] = useState<string[]>([]);
  const [tip, setTip] = useState(() => !store.get().seen.zoomTip);
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const controlsRef = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null);
  const touchFirst = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);

  // ---------- set up: load this scene's art, then continue or shuffle ----------
  useEffect(() => {
    let alive = true;
    void (async () => {
      const scene = sceneById(sceneId);
      if (!scene) throw new Error(`No scene ${sceneId}`);
      const [art, shapes] = await Promise.all([loadSceneArt(scene.art), shapesForScene(scene.art)]);
      if (!alive) return;
      const rules = rulesFor(scene, difficulty);
      const saved = fresh ? undefined : store.get().plays[playKey(sceneId, difficulty)];
      let play: PlayState;
      if (saved) {
        play = settleHint(saved, rules, Date.now());
      } else {
        const layout = shuffleLayout({
          scene,
          difficulty,
          shapes,
          seed: newSeed(),
          avoidKumo: progressOf(store.get(), sceneId).lastKumo,
        });
        play = startPlay(scene, difficulty, layout, Date.now());
        store.update((draft) => recordStart(draft, play));
      }
      const view = new SceneView(scene, play.layout, art, shapes, play.found, play.kumo);
      setupRef.current = { scene, rules, index: indexPlay(scene, play.layout, shapes), view };
      playRef.current = play;
      setLanded(play.found);
      setKumoLanded(play.kumo);
      setPhase('ready');
    })().catch((error: unknown) => {
      console.error(error);
      if (alive) setPhase('error');
    });
    return () => {
      alive = false;
      setupRef.current?.view.destroy();
      setupRef.current = null;
    };
  }, [sceneId, difficulty, fresh, store]);

  const showToast = (text: string): void => {
    setToast(text);
    setTimeout(() => setToast((current) => (current === text ? null : current)), 2200);
  };

  const dismissTip = useCallback(() => {
    setTip(false);
    if (!store.get().seen.zoomTip) store.update((draft) => void (draft.seen.zoomTip = true));
  }, [store]);

  /** Viewport pixels → page pixels, for things that fly across the screen. */
  const toPage = (vx: number, vy: number): { x: number; y: number } => {
    const box = viewportRef.current!.getBoundingClientRect();
    return { x: box.left + vx, y: box.top + vy };
  };

  const pop = (entry: number): void => {
    setPopping((prev) => new Set(prev).add(entry));
    setTimeout(
      () =>
        setPopping((prev) => {
          const next = new Set(prev);
          next.delete(entry);
          return next;
        }),
      450,
    );
  };

  const finishSoon = (play: PlayState): void => {
    const sticker = store.update((draft) => recordFinish(draft, play, today()));
    if (sticker) setEarned((prev) => [...prev, sticker]);
    setTimeout(
      () => {
        if (fxRef.current) confetti(fxRef.current);
        sfx.done();
        if (sticker) setTimeout(() => sfx.sticker(), 700);
        setFinish('open');
      },
      prefersReducedMotion() ? 150 : 900,
    );
  };

  const onFound = (item: number): void => {
    const setup = setupRef.current!;
    const camera = cameraRef.current!;
    const next = markFound(playRef.current!, item);
    playRef.current = next;
    const placed = next.layout.items[item]!;
    const place = setup.view.itemPlace(item)!;
    setup.view.hideItem(item);
    store.update((draft) => recordFind(draft, next));
    // The zoom tip has done its job once the player finds something.
    if (tipRef.current) dismissTip();
    setAnnounce(fmt(s.play.foundIt, { name: objectName(placed.obj) }));
    const at = toPage(camera.toView(place.x, place.y).x, camera.toView(place.x, place.y).y);
    const chip = chips.current[placed.entry];
    const total = next.layout.items.filter((it) => it.entry >= 0).length;
    const lineDone = next.found.filter((i) => next.layout.items[i]?.entry === placed.entry).length === next.layout.entries[placed.entry]!.count;
    if (lineDone && next.layout.entries[placed.entry]!.count > 1) sfx.lineDone();
    else sfx.found(next.found.length / total);
    const land = (): void => {
      setLanded((prev) => (prev.includes(item) ? prev : [...prev, item]));
      pop(placed.entry);
    };
    if (chip) {
      void flyObject(`objects/${placed.obj}`, placed.tint, { ...at, size: place.size * camera.scale, rot: place.rot, flip: place.flip }, chip).then(land);
    } else {
      land();
    }
    redraw();
    if (isComplete(next)) finishSoon(next);
  };

  const onKumo = (): void => {
    const setup = setupRef.current!;
    const camera = cameraRef.current!;
    const next = markKumo(playRef.current!);
    playRef.current = next;
    const place = setup.view.kumoPlace();
    setup.view.hideKumo();
    const sticker = store.update((draft) => recordKumo(draft, next, today()));
    if (sticker) setEarned((prev) => [...prev, sticker]);
    sfx.kumo();
    setAnnounce(s.play.kumoFound);
    showToast(s.play.kumoFound);
    const land = (): void => setKumoLanded(true);
    if (place && kumoChip.current) {
      const at = toPage(camera.toView(place.x, place.y).x, camera.toView(place.x, place.y).y);
      void flyKumo('kumo/front', { ...at, size: place.size * camera.scale, rot: 0, flip: false }, kumoChip.current).then(land);
    } else {
      land();
    }
    redraw();
    // Found after the list was done: celebrate again.
    if (isComplete(next)) setTimeout(() => setFinish('open'), prefersReducedMotion() ? 150 : 900);
  };

  const onHint = (): void => {
    const setup = setupRef.current;
    const play = playRef.current;
    if (!setup || !play) return;
    const used = takeHint(play, setup.rules, Date.now());
    if (!used) return;
    playRef.current = used.play;
    store.update((draft) => recordPlay(draft, used.play));
    const camera = cameraRef.current;
    setup.view.showHint(used.item, camera ? HINT_MIN_PX / camera.scale : 0);
    sfx.hint();
    const item = used.play.layout.items[used.item]!;
    camera?.reveal(item.x, item.y, item.size * camera.scale);
    redraw();
  };

  // ---------- the scene, the camera and the gestures ----------
  useEffect(() => {
    if (phase !== 'ready') return;
    const setup = setupRef.current;
    const viewport = viewportRef.current;
    const layer = layerRef.current;
    if (!setup || !viewport || !layer) return;
    layer.append(setup.view.el);
    const [w, h] = setup.scene.size;
    const camera = new Camera(layer, w, h, { maxZoom: MAX_ZOOM, reducedMotion: prefersReducedMotion(), margin: 8 });
    cameraRef.current = camera;
    const resize = new ResizeObserver(() => {
      const box = viewport.getBoundingClientRect();
      camera.setView(box.width, box.height);
    });
    resize.observe(viewport);

    const gestures = new Gestures();
    let pendingMiss: ReturnType<typeof setTimeout> | null = null;
    let lastTapHit = false;
    const cancelMiss = (): void => {
      if (pendingMiss) clearTimeout(pendingMiss);
      pendingMiss = null;
    };
    const zoomed = (): void => {
      if (tipRef.current) dismissTip();
    };

    const onTap = (vx: number, vy: number, count: 1 | 2): void => {
      const play = playRef.current;
      if (!play) return;
      // The second tap of a double-tap zooms, unless the first one found something.
      if (count === 2 && !lastTapHit) {
        cancelMiss();
        const point = camera.toScene(vx, vy);
        if (camera.zoom < MAX_ZOOM * 0.7) camera.animateTo(Math.min(camera.scale * 2.2, camera.maxScale), point.x, point.y);
        else camera.fit();
        zoomed();
        return;
      }
      const point = camera.toScene(vx, vy);
      const outcome = tapAt(play, setup.index, point.x, point.y, TAP_MARGIN_PX / camera.scale);
      lastTapHit = outcome.kind === 'found' || outcome.kind === 'kumo';
      if (outcome.kind === 'found') onFound(outcome.item);
      else if (outcome.kind === 'kumo') onKumo();
      else {
        const decoy = outcome.kind === 'decoy';
        if (decoy) {
          setup.view.wiggle(outcome.item);
          sfx.wiggle();
        }
        cancelMiss();
        pendingMiss = setTimeout(() => {
          pendingMiss = null;
          if (fxRef.current) missPuff(fxRef.current, vx, vy);
          if (!decoy) sfx.miss();
        }, MISS_DELAY_MS);
      }
    };

    const handle = (events: GestureEvent[]): void => {
      for (const event of events) {
        if (event.type === 'start') {
          camera.stop();
          cancelMiss();
        } else if (event.type === 'pan') {
          camera.panBy(event.dx, event.dy);
        } else if (event.type === 'pinch') {
          camera.zoomAt(event.x, event.y, event.scale);
          camera.panBy(event.dx, event.dy);
          zoomed();
        } else if (event.type === 'end') {
          camera.glide(event.vx, event.vy);
        } else if (event.type === 'tap') {
          onTap(event.x, event.y, event.count);
        }
      }
    };

    let box = viewport.getBoundingClientRect();
    const local = (event: PointerEvent): [number, number] => [event.clientX - box.left, event.clientY - box.top];
    const onDown = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      box = viewport.getBoundingClientRect();
      viewport.setPointerCapture(event.pointerId);
      const kind = event.pointerType === 'mouse' ? 'mouse' : event.pointerType === 'pen' ? 'pen' : 'touch';
      handle(gestures.down(event.pointerId, ...local(event), event.timeStamp, kind));
    };
    const onMove = (event: PointerEvent): void => handle(gestures.move(event.pointerId, ...local(event), event.timeStamp));
    const onUp = (event: PointerEvent): void => handle(gestures.up(event.pointerId, ...local(event), event.timeStamp));
    const onCancel = (event: PointerEvent): void => handle(gestures.cancel(event.pointerId));
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      camera.stop();
      box = viewport.getBoundingClientRect();
      // Trackpad pinches arrive as wheel events with ctrlKey; they need a stronger response.
      const unit = event.deltaMode === 1 ? 30 : event.deltaMode === 2 ? 300 : 1;
      const strength = event.ctrlKey ? 0.01 : 0.0018;
      camera.zoomAt(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * unit * strength));
      zoomed();
    };
    const onKey = (event: KeyboardEvent): void => {
      const step = 60;
      const actions: Record<string, () => void> = {
        ArrowLeft: () => camera.panBy(step, 0),
        ArrowRight: () => camera.panBy(-step, 0),
        ArrowUp: () => camera.panBy(0, step),
        ArrowDown: () => camera.panBy(0, -step),
        '+': () => camera.zoomAt(box.width / 2, box.height / 2, 1.3),
        '=': () => camera.zoomAt(box.width / 2, box.height / 2, 1.3),
        '-': () => camera.zoomAt(box.width / 2, box.height / 2, 1 / 1.3),
        '0': () => camera.fit(),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      box = viewport.getBoundingClientRect();
      action();
    };
    const noMenu = (event: Event): void => event.preventDefault();

    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onCancel);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('keydown', onKey);
    viewport.addEventListener('contextmenu', noMenu);
    controlsRef.current = {
      zoomIn: () => camera.zoomAt(box.width / 2, box.height / 2, 1.5),
      zoomOut: () => camera.zoomAt(box.width / 2, box.height / 2, 1 / 1.5),
      fit: () => camera.fit(),
    };
    return () => {
      cancelMiss();
      resize.disconnect();
      camera.destroy();
      cameraRef.current = null;
      controlsRef.current = null;
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onCancel);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('keydown', onKey);
      viewport.removeEventListener('contextmenu', noMenu);
    };
    // The handlers read the latest play through refs, so this runs once per scene.
  }, [phase]);

  const scene = sceneById(sceneId);
  const title = scene ? sceneName(scene) : '';

  if (phase !== 'ready' || !playRef.current || !setupRef.current) {
    return (
      <div class="play">
        <header class="play-top">
          <button class="round-button" onClick={onHome} aria-label={s.play.home}>
            <Icon name="ui/home" />
          </button>
          <h1 class="play-title">{title}</h1>
          <span class="round-spacer" />
        </header>
        <div class="play-loading">
          {phase === 'error' ? (
            <div class="card center">
              <p>{s.sceneError}</p>
              <button class="button button-go" onClick={() => location.reload()}>
                {s.tryAgain}
              </button>
            </div>
          ) : (
            <p class="muted">{s.loading}</p>
          )}
        </div>
      </div>
    );
  }

  const play = playRef.current;
  const setup = setupRef.current;
  const total = play.layout.items.filter((item) => item.entry >= 0).length;
  const foundPerEntry = play.layout.entries.map((_, i) => landed.filter((item) => play.layout.items[item]?.entry === i).length);
  const done = isComplete(play);
  const chipRef = (index: number): Ref<HTMLLIElement> => (el: HTMLLIElement | null) => {
    chips.current[index] = el;
  };

  return (
    <div class="play">
      <header class="play-top">
        <button class="round-button" onClick={onHome} aria-label={s.play.home}>
          <Icon name="ui/home" />
        </button>
        <div class="play-heading">
          <h1 class="play-title">{title}</h1>
          <p class="play-sub">
            {difficultyName(difficulty)} · {fmt(s.play.progress, { found: play.found.length, total })}
          </p>
        </div>
        <button class="round-button" onClick={() => setMenu(true)} aria-label={s.play.menu}>
          <Icon name="ui/gear" />
        </button>
      </header>

      <div class="play-stage">
        <div class="viewport" ref={viewportRef} tabIndex={0} role="application" aria-label={fmt(s.play.sceneLabel, { scene: title })}>
          <div class="camera" ref={layerRef} />
        </div>
        <div class="fx-layer" ref={fxRef} aria-hidden="true" />

        <div class="scene-controls scene-controls-left">
          <HintButton
            readyAt={play.hintAt}
            waitMs={setup.rules.hintSeconds * 1000}
            disabled={remaining(play).length === 0}
            onHint={onHint}
          />
        </div>
        <div class="scene-controls scene-controls-right">
          <button class="round-button" onClick={() => controlsRef.current?.zoomIn()} aria-label={s.play.zoomIn}>
            <Icon name="ui/zoom-in" />
          </button>
          <button class="round-button" onClick={() => controlsRef.current?.zoomOut()} aria-label={s.play.zoomOut}>
            <Icon name="ui/zoom-out" />
          </button>
          <button class="round-button" onClick={() => controlsRef.current?.fit()} aria-label={s.play.fit}>
            <Icon name="ui/fit" />
          </button>
        </div>

        {tip && finish !== 'open' && (
          <div class="tip" role="status">
            <p>{touchFirst ? s.play.tipTouch : s.play.tipMouse}</p>
            <button class="button button-small" onClick={dismissTip}>
              {s.play.gotIt}
            </button>
          </div>
        )}
        {toast && (
          <div class="toast" role="status">
            <Icon name="kumo/front" />
            {toast}
          </div>
        )}
      </div>

      <FindTray
        entries={play.layout.entries}
        found={foundPerEntry}
        words={store.get().settings.words}
        hasKumo={play.layout.kumo !== null}
        kumoFound={kumoLanded}
        chipRef={chipRef}
        kumoRef={kumoChip}
        popping={popping}
      />

      <p class="sr-only" aria-live="polite">
        {announce}
      </p>

      {done && finish === 'open' && (
        <FinishCard
          kumoFound={play.kumo}
          hasKumo={play.layout.kumo !== null}
          stickers={stickerCatalog().filter((sticker) => earned.includes(sticker.id)).sort((a, b) => earned.indexOf(a.id) - earned.indexOf(b.id))}
          onLookForKumo={() => setFinish('closed')}
          onAgain={onAgain}
          onHome={onHome}
        />
      )}
      {menu && <MenuSheet store={store} onClose={() => setMenu(false)} onStartOver={onAgain} onHome={onHome} />}
    </div>
  );
}
