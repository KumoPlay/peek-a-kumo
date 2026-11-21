import type { JSX } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { icon, kumoPoses, loadSceneArt, sceneArtNames, sceneFolders, spriteSvg, svgParts } from '../art';
import { shapesForScene } from '../art/shapes';
import {
  colorDistance,
  DIFFICULTIES,
  objects,
  parseScene,
  rulesFor,
  scenes,
  tones,
  type DifficultyId,
  type KumoSpotDef,
  type PropDef,
  type SceneDef,
  type SpotDef,
} from '../content';
import {
  checkLayout,
  checkRulesFor,
  clone,
  goodKumoSpots,
  newSeed,
  poseBySize,
  shuffleLayout,
  svgTransform,
  type CheckReport,
  type Layout,
  type ShapeSet,
} from '../core';
import { objectName } from '../i18n';
import { downloadText } from '../platform/files';
import { Camera } from '../render/camera';
import { SceneView } from '../render/sceneView';
import { formatScene, toRaw } from './format';

/**
 * The scene editor (developer tool, not part of the game). Arrange a scene's
 * spots, Kumo's hiding places and props, preview shuffles, check 300 of them,
 * and export the scene file.
 */
type Selection = { kind: 'spot' | 'kumo' | 'prop'; id: string } | null;

interface Preview {
  difficulty: DifficultyId;
  seed: number;
  layout: Layout | null;
  report: CheckReport | null;
  error: string | null;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BOTTOM_SHARE = 0.45;

function blankScene(folder: string): SceneDef {
  return parseScene(
    { format: 1, id: 'new-scene', name: 'New Scene', order: scenes.length + 1, size: [1000, 1000], art: folder, emblem: folder, pool: [], props: [], spots: [], kumo: [] },
    'new-scene.json',
  );
}

function uniqueId(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

function nearestTone(r: number, g: number, b: number): string {
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  let best = 'cream';
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const [name, colour] of Object.entries(tones)) {
    const d = colorDistance(hex, colour);
    if (d < bestDistance) {
      best = name;
      bestDistance = d;
    }
  }
  return best;
}

/** A layout that shows every spot with an example object, for editing. */
function exampleLayout(scene: SceneDef, examples: Record<string, string>): Layout {
  const pool = scene.pool.length ? scene.pool : objects.map((o) => o.id);
  return {
    seed: 0,
    kumo: null,
    entries: [],
    items: scene.spots.map((spot, i) => ({
      obj: examples[spot.id] ?? pool[i % pool.length]!,
      tint: null,
      spot: spot.id,
      x: spot.x,
      y: spot.anchor === 'bottom' ? spot.y - spot.size * BOTTOM_SHARE : spot.y,
      size: spot.size,
      rot: (spot.rot[0] + spot.rot[1]) / 2,
      flip: false,
      z: spot.z,
      entry: -1,
    })),
  };
}

function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label class="ed-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(event) => {
          const n = Number((event.currentTarget as HTMLInputElement).value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

function TextField({ label, value, onChange, pattern }: { label: string; value: string; onChange: (s: string) => void; pattern?: RegExp }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const bad = pattern ? !pattern.test(text) : text.trim() === '';
  return (
    <label class={bad ? 'ed-field is-bad' : 'ed-field'}>
      <span>{label}</span>
      <input
        type="text"
        value={text}
        onInput={(event) => setText((event.currentTarget as HTMLInputElement).value)}
        onChange={() => {
          if (!bad) onChange(text.trim());
        }}
      />
    </label>
  );
}

export function Editor() {
  const [doc, setDoc] = useState<SceneDef>(() => clone(scenes[0] ?? blankScene(sceneFolders()[0] ?? 'cozy-bedroom')));
  const [history, setHistory] = useState<{ past: SceneDef[]; future: SceneDef[] }>({ past: [], future: [] });
  const [selected, setSelected] = useState<Selection>(null);
  const [examples, setExamples] = useState<Record<string, string>>({});
  /** The pictures and tap shapes of one art folder (only used while that folder is the scene's). */
  const [loaded, setLoaded] = useState<{ folder: string; art: Record<string, string>; shapes: ShapeSet } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checkText, setCheckText] = useState<string[] | null>(null);
  const [status, setStatus] = useState('');
  const [autoTone, setAutoTone] = useState(true);
  const ready = loaded && loaded.folder === doc.art ? loaded : null;
  const art = ready?.art ?? null;
  const shapes = ready?.shapes ?? null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const toneRef = useRef<CanvasRenderingContext2D | null>(null);
  const dragRef = useRef<{ kind: 'pan' | 'move'; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [w, h] = doc.size;

  // ---------- changing the scene, with undo ----------
  const change = useCallback((edit: (draft: SceneDef) => void, record = true) => {
    setDoc((current) => {
      const draft = clone(current);
      edit(draft);
      if (record) setHistory((hist) => ({ past: [...hist.past.slice(-80), current], future: [] }));
      return draft;
    });
    setPreview(null);
  }, []);

  const undo = useCallback(() => {
    setHistory((hist) => {
      const previous = hist.past[hist.past.length - 1];
      if (!previous) return hist;
      setDoc((current) => {
        hist.future.unshift(current);
        return previous;
      });
      return { past: hist.past.slice(0, -1), future: hist.future };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((hist) => {
      const next = hist.future[0];
      if (!next) return hist;
      setDoc((current) => {
        hist.past.push(current);
        return next;
      });
      return { past: hist.past, future: hist.future.slice(1) };
    });
  }, []);

  const open = (scene: SceneDef): void => {
    setDoc(clone(scene));
    setHistory({ past: [], future: [] });
    setSelected(null);
    setExamples({});
    setPreview(null);
    setCheckText(null);
  };

  // ---------- this scene's pictures and tap shapes ----------
  useEffect(() => {
    let alive = true;
    const folder = doc.art;
    toneRef.current = null;
    void Promise.all([loadSceneArt(folder), shapesForScene(folder)]).then(async ([pictures, loadedShapes]) => {
      if (!alive) return;
      setLoaded({ folder, art: pictures, shapes: loadedShapes });
      // The background drawn small, to read the colour under each spot.
      if (pictures.background) {
        const image = new Image();
        image.src = `data:image/svg+xml,${encodeURIComponent(pictures.background)}`;
        await image.decode().catch(() => undefined);
        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx && alive) {
          ctx.drawImage(image, 0, 0, 500, 500);
          toneRef.current = ctx;
        }
      }
    });
    return () => {
      alive = false;
    };
  }, [doc.art]);

  const toneAt = (x: number, y: number): string => {
    const ctx = toneRef.current;
    if (!ctx) return 'cream';
    const [r = 255, g = 255, b = 255] = ctx.getImageData(Math.max(0, Math.min(499, (x / w) * 500)), Math.max(0, Math.min(499, (y / h) * 500)), 1, 1).data;
    return nearestTone(r, g, b);
  };

  // ---------- the camera ----------
  useEffect(() => {
    const viewport = viewportRef.current;
    const layer = layerRef.current;
    if (!viewport || !layer) return;
    const camera = new Camera(layer, w, h, { maxZoom: 6, reducedMotion: true, margin: 24 });
    cameraRef.current = camera;
    const resize = new ResizeObserver(() => {
      const box = viewport.getBoundingClientRect();
      camera.setView(box.width, box.height);
    });
    resize.observe(viewport);
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const box = viewport.getBoundingClientRect();
      camera.zoomAt(event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0018)));
    };
    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      resize.disconnect();
      viewport.removeEventListener('wheel', onWheel);
      camera.destroy();
    };
  }, [w, h]);

  // ---------- the picture: examples in edit mode, a real layout in preview ----------
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !art || !shapes || dragging) return;
    let view: SceneView;
    try {
      view = preview?.layout
        ? new SceneView(doc, preview.layout, art, shapes, [], false)
        : new SceneView(doc, exampleLayout(doc, examples), art, shapes, [], false);
    } catch (error) {
      setStatus(String(error));
      return;
    }
    host.replaceChildren(view.el);
    return () => view.destroy();
  }, [doc, art, shapes, examples, preview, dragging]);

  // ---------- Kumo spots: how much of Kumo shows ----------
  const kumoVisibility = useMemo(() => {
    const out: Record<string, { visible: number; ok: boolean }> = {};
    if (!shapes) return out;
    const rules = checkRulesFor(rulesFor(doc, 'normal'));
    for (const k of doc.kumo) {
      if (!shapes[`kumo/${k.pose}`]) continue;
      try {
        const report = checkLayout(doc, { seed: 0, items: [], kumo: { spot: k.id, ...k }, entries: [] }, shapes, rules);
        out[k.id] = { visible: report.kumo?.visible ?? 0, ok: report.kumo?.ok ?? false };
      } catch {
        // A prop picture is missing: the scene panel shows the problem.
      }
    }
    return out;
  }, [doc, shapes]);

  // ---------- pointer: move things, or pan ----------
  const scenePoint = (event: { clientX: number; clientY: number }): { x: number; y: number } => {
    const box = viewportRef.current!.getBoundingClientRect();
    return cameraRef.current!.toScene(event.clientX - box.left, event.clientY - box.top);
  };

  const findSelected = (sel: Selection, scene: SceneDef = doc): SpotDef | KumoSpotDef | PropDef | undefined => {
    if (!sel) return undefined;
    const list: (SpotDef | KumoSpotDef | PropDef)[] = sel.kind === 'spot' ? scene.spots : sel.kind === 'kumo' ? scene.kumo : scene.props;
    return list.find((item) => item.id === sel.id);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = (event.target as Element).closest<SVGElement>('[data-sel]');
    viewportRef.current!.setPointerCapture(event.pointerId);
    const p = scenePoint(event);
    if (target && !preview) {
      const [kind, id] = target.dataset.sel!.split(':') as ['spot' | 'kumo' | 'prop', string];
      setSelected({ kind, id });
      const item = findSelected({ kind, id });
      if (!item) return;
      dragRef.current = { kind: 'move', x: p.x, y: p.y, ox: item.x, oy: item.y, moved: false };
      setHistory((hist) => ({ past: [...hist.past.slice(-80), doc], future: [] }));
    } else {
      dragRef.current = { kind: 'pan', x: event.clientX, y: event.clientY, ox: 0, oy: 0, moved: false };
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === 'pan') {
      cameraRef.current?.panBy(event.clientX - drag.x, event.clientY - drag.y);
      drag.x = event.clientX;
      drag.y = event.clientY;
      return;
    }
    const p = scenePoint(event);
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    if (!drag.moved) setDragging(true);
    drag.moved = true;
    const sel = selected;
    change((draft) => {
      const item = findSelected(sel, draft);
      if (!item) return;
      item.x = Math.round(drag.ox + dx);
      item.y = Math.round(drag.oy + dy);
    }, false);
  };

  const onPointerUp = (): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (drag?.kind === 'move' && drag.moved && selected?.kind === 'spot' && autoTone) {
      const sel = selected;
      change((draft) => {
        const spot = draft.spots.find((s) => s.id === sel.id);
        if (spot) spot.tone = toneAt(spot.x, spot.anchor === 'bottom' ? spot.y - spot.size * BOTTOM_SHARE : spot.y);
      }, false);
    }
  };

  // ---------- adding things ----------
  const addSpot = (objectId: string, x: number, y: number): void => {
    const id = uniqueId(`spot-${doc.spots.length + 1}`, doc.spots.map((s) => s.id));
    change((draft) => {
      draft.spots.push({ id, x: Math.round(x), y: Math.round(y), anchor: 'center', size: 64, rot: [-12, 12], jitter: 8, flip: true, z: 20, tone: toneAt(x, y), for: [...DIFFICULTIES] });
    });
    setExamples((prev) => ({ ...prev, [id]: objectId }));
    setSelected({ kind: 'spot', id });
  };

  const addKumo = (pose: string, x: number, y: number): void => {
    const id = uniqueId(`kumo-${doc.kumo.length + 1}`, doc.kumo.map((k) => k.id));
    change((draft) => {
      draft.kumo.push({ id, x: Math.round(x), y: Math.round(y), size: 60, rot: 0, flip: false, z: 25, pose });
    });
    setSelected({ kind: 'kumo', id });
  };

  const addProp = (name: string): void => {
    const vb = shapes?.[`scenes/${doc.art}/${name}`]?.vb;
    if (!vb) return;
    const id = uniqueId(name, doc.props.map((p) => p.id));
    change((draft) => {
      // Props are drawn in scene units, so their own viewBox says where they belong.
      draft.props.push({ id, art: name, x: vb[0] + vb[2] / 2, y: vb[1] + vb[3] / 2, w: vb[2], rot: 0, z: 40 });
    });
    setSelected({ kind: 'prop', id });
  };

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    const data = event.dataTransfer?.getData('text/plain') ?? '';
    const p = scenePoint(event);
    if (data.startsWith('object:')) addSpot(data.slice(7), p.x, p.y);
    if (data.startsWith('kumo:')) addKumo(data.slice(5), p.x, p.y);
  };

  const removeSelected = (): void => {
    const sel = selected;
    if (!sel) return;
    change((draft) => {
      if (sel.kind === 'spot') draft.spots = draft.spots.filter((s) => s.id !== sel.id);
      if (sel.kind === 'kumo') draft.kumo = draft.kumo.filter((k) => k.id !== sel.id);
      if (sel.kind === 'prop') draft.props = draft.props.filter((p) => p.id !== sel.id);
    });
    setSelected(null);
  };

  const duplicateSelected = (): void => {
    const sel = selected;
    if (!sel || sel.kind === 'prop') return;
    if (sel.kind === 'spot') {
      const spot = doc.spots.find((s) => s.id === sel.id);
      if (!spot) return;
      const id = uniqueId(spot.id, doc.spots.map((s) => s.id));
      change((draft) => void draft.spots.push({ ...clone(spot), id, x: spot.x + 30 }));
      setSelected({ kind: 'spot', id });
    } else {
      const k = doc.kumo.find((s) => s.id === sel.id);
      if (!k) return;
      const id = uniqueId(k.id, doc.kumo.map((s) => s.id));
      change((draft) => void draft.kumo.push({ ...clone(k), id, x: k.x + 30 }));
      setSelected({ kind: 'kumo', id });
    }
  };

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.target as Element).closest('input, textarea, select')) return;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelected();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        removeSelected();
      } else if (event.key.startsWith('Arrow') && selected) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        const sel = selected;
        change((draft) => {
          const item = findSelected(sel, draft);
          if (item) {
            item.x += dx;
            item.y += dy;
          }
        });
      } else if (event.key === 'Escape') {
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- preview and checks ----------
  const shuffle = (difficulty: DifficultyId, seed = newSeed()): void => {
    if (!shapes) return;
    try {
      const layout = shuffleLayout({ scene: doc, difficulty, shapes, seed });
      const report = checkLayout(doc, layout, shapes, checkRulesFor(rulesFor(doc, difficulty)));
      setPreview({ difficulty, seed, layout, report, error: null });
    } catch (error) {
      setPreview({ difficulty, seed, layout: null, report: null, error: (error as Error).message });
    }
    setSelected(null);
  };

  const checkMany = (): void => {
    if (!shapes) return;
    setCheckText(['Checking…']);
    setTimeout(() => {
      const lines: string[] = [];
      for (const difficulty of DIFFICULTIES) {
        let ok = 0;
        let ms = 0;
        const used = new Map<string, number>();
        for (let seed = 1; seed <= 300; seed += 1) {
          const start = performance.now();
          try {
            const layout = shuffleLayout({ scene: doc, difficulty, shapes, seed });
            ok += 1;
            for (const item of layout.items) used.set(item.spot, (used.get(item.spot) ?? 0) + 1);
          } catch {
            // counted as a failure below
          }
          ms += performance.now() - start;
        }
        const eligible = doc.spots.filter((s) => s.for.includes(difficulty));
        const never = eligible.filter((s) => !used.has(s.id)).map((s) => s.id);
        lines.push(`${difficulty}: ${ok}/300 fair layouts, ${(ms / 300).toFixed(1)} ms each${never.length ? ` · never used: ${never.join(', ')}` : ''}`);
      }
      const good = goodKumoSpots(doc, shapes, checkRulesFor(rulesFor(doc, 'normal')));
      const bad = doc.kumo.filter((k) => !good.includes(k)).map((k) => k.id);
      lines.push(`Kumo: ${good.length} good hiding places${bad.length ? ` · needs moving: ${bad.join(', ')}` : ''}`);
      setCheckText(lines);
    }, 30);
  };

  // ---------- export ----------
  const text = (): string => formatScene(toRaw(doc));
  const saveToProject = async (): Promise<void> => {
    try {
      const response = await fetch('/__editor/save-scene', { method: 'POST', body: JSON.stringify({ id: doc.id, text: text() }) });
      setStatus(await response.text());
    } catch {
      setStatus('Saving into the project only works from "npm run editor".');
    }
  };
  const importFile = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    void file.text().then((contents) => {
      try {
        open(parseScene(JSON.parse(contents), file.name));
        setStatus(`Opened ${file.name}`);
      } catch (error) {
        setStatus((error as Error).message);
      }
    });
  };

  // ---------- drawing the markers ----------
  const sel = findSelected(selected);
  const markers: JSX.Element[] = [];
  if (!preview) {
    for (const prop of doc.props) {
      const vb = shapes?.[`scenes/${doc.art}/${prop.art}`]?.vb;
      if (!vb) continue;
      const ph = (vb[3] * prop.w) / vb[2];
      const isSel = selected?.kind === 'prop' && selected.id === prop.id;
      markers.push(
        <rect
          key={`p-${prop.id}`}
          data-sel={`prop:${prop.id}`}
          class={isSel ? 'ed-prop is-sel' : 'ed-prop'}
          x={prop.x - prop.w / 2}
          y={prop.y - ph / 2}
          width={prop.w}
          height={ph}
          transform={`rotate(${prop.rot} ${prop.x} ${prop.y})`}
        />,
      );
    }
    for (const spot of doc.spots) {
      const cy = spot.anchor === 'bottom' ? spot.y - spot.size * BOTTOM_SHARE : spot.y;
      const isSel = selected?.kind === 'spot' && selected.id === spot.id;
      const cls = `ed-spot${spot.for.length < 3 ? ' is-tucked' : ''}${isSel ? ' is-sel' : ''}`;
      markers.push(
        <g key={`s-${spot.id}`} class={cls} data-sel={`spot:${spot.id}`}>
          <circle cx={spot.x} cy={cy} r={spot.size / 2} />
          {spot.anchor === 'bottom' && <path d={`M${spot.x - spot.size / 2} ${spot.y}h${spot.size}`} />}
          {isSel && spot.jitter > 0 && <circle class="ed-jitter" cx={spot.x} cy={cy} r={spot.size / 2 + spot.jitter} />}
          <text x={spot.x} y={cy + spot.size / 2 + 12}>
            {spot.id} · z{spot.z}
          </text>
        </g>,
      );
    }
    for (const k of doc.kumo) {
      const vb = shapes?.[`kumo/${k.pose}`]?.vb ?? [0, 0, 100, 100];
      const info = kumoVisibility[k.id];
      const isSel = selected?.kind === 'kumo' && selected.id === k.id;
      markers.push(
        <g key={`k-${k.id}`} class={`ed-kumo${isSel ? ' is-sel' : ''}${info && !info.ok ? ' is-bad' : ''}`} data-sel={`kumo:${k.id}`}>
          <g transform={svgTransform(poseBySize(vb, k.x, k.y, k.size, k.rot, k.flip), vb)} dangerouslySetInnerHTML={{ __html: svgParts(spriteSvg(`kumo/${k.pose}`) ?? '').inner }} />
          <circle cx={k.x} cy={k.y} r={k.size / 2} />
          <text x={k.x} y={k.y + k.size / 2 + 13}>
            Kumo {k.id} · {info ? `${Math.round(info.visible * 100)}%` : '…'}
          </text>
        </g>,
      );
    }
  } else if (preview.report && preview.layout) {
    preview.report.items.forEach((report) => {
      const item = preview.layout!.items[report.index]!;
      if (!report.isTarget) return;
      markers.push(
        <g key={`r-${report.index}`} class={report.ok ? 'ed-target' : 'ed-target is-bad'}>
          <circle cx={item.x} cy={item.y} r={item.size * 0.62} />
          <text x={item.x} y={item.y - item.size * 0.62 - 4}>
            {Math.round(report.visible * 100)}%
          </text>
        </g>,
      );
    });
  }

  const propNames = sceneArtNames(doc.art).filter((name) => name !== 'background');
  const pool = new Set(doc.pool.length ? doc.pool : objects.map((o) => o.id));

  return (
    <div class="ed">
      <div
        class="ed-canvas"
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <div class="camera" ref={layerRef} style={{ width: `${w}px`, height: `${h}px` }}>
          <div ref={hostRef} />
          <svg class="ed-overlay" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
            {markers}
          </svg>
        </div>
        {!art && <p class="ed-loading">Loading pictures…</p>}
        <p class="ed-help">Drag objects from the library onto the scene to make spots · drag to move · wheel to zoom · drag the background to pan · ⌘Z undo · Delete removes</p>
      </div>

      <aside class="ed-panel">
        <section>
          <h2>Scene</h2>
          <div class="ed-row">
            <select
              value={scenes.some((s) => s.id === doc.id) ? doc.id : ''}
              onChange={(event) => {
                const found = scenes.find((s) => s.id === (event.currentTarget as HTMLSelectElement).value);
                if (found) open(found);
              }}
            >
              <option value="" disabled>
                Open a scene…
              </option>
              {scenes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.order}. {s.name}
                </option>
              ))}
            </select>
            <button onClick={() => open(blankScene(doc.art))}>New</button>
            <label class="ed-file">
              Open file…
              <input type="file" accept=".json,application/json" onChange={importFile} />
            </label>
          </div>
          <div class="ed-grid">
            <TextField label="id (file name)" value={doc.id} pattern={ID} onChange={(v) => change((d) => void (d.id = v))} />
            <TextField label="name" value={doc.name} onChange={(v) => change((d) => void (d.name = v))} />
            <NumberField label="order" value={doc.order} onChange={(n) => change((d) => void (d.order = n))} />
            <label class="ed-field">
              <span>art folder</span>
              <select value={doc.art} onChange={(event) => change((d) => void (d.art = (event.currentTarget as HTMLSelectElement).value))}>
                {sceneFolders().map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="sticker emblem" value={doc.emblem} pattern={ID} onChange={(v) => change((d) => void (d.emblem = v))} />
          </div>
        </section>

        {sel && selected && (
          <section class="ed-inspector">
            <h2>
              {selected.kind === 'spot' ? 'Spot' : selected.kind === 'kumo' ? 'Kumo spot' : 'Prop'} <code>{selected.id}</code>
            </h2>
            <div class="ed-grid">
              <TextField
                label="id"
                value={sel.id}
                pattern={ID}
                onChange={(v) => {
                  const old = selected;
                  change((d) => {
                    const item = findSelected(old, d);
                    if (item) item.id = v;
                  });
                  setSelected({ ...old, id: v });
                }}
              />
              <NumberField label="x" value={sel.x} onChange={(n) => change((d) => void (findSelected(selected, d)!.x = n))} />
              <NumberField label="y" value={sel.y} onChange={(n) => change((d) => void (findSelected(selected, d)!.y = n))} />
              <NumberField label="layer (z)" value={sel.z} onChange={(n) => change((d) => void (findSelected(selected, d)!.z = Math.round(n)))} />
              {'size' in sel && (
                <NumberField label="size" value={sel.size} onChange={(n) => change((d) => void ((findSelected(selected, d) as SpotDef | KumoSpotDef).size = Math.max(10, n)))} />
              )}
              {'w' in sel && <NumberField label="width" value={sel.w} onChange={(n) => change((d) => void ((findSelected(selected, d) as PropDef).w = Math.max(10, n)))} />}
              {'rot' in sel && typeof sel.rot === 'number' && (
                <NumberField label="rotation" value={sel.rot} onChange={(n) => change((d) => void ((findSelected(selected, d) as KumoSpotDef | PropDef).rot = n))} />
              )}
            </div>
            {selected.kind === 'spot' && 'anchor' in sel && (
              <>
                <div class="ed-grid">
                  <label class="ed-field">
                    <span>stands on</span>
                    <select
                      value={sel.anchor}
                      onChange={(event) => change((d) => void ((findSelected(selected, d) as SpotDef).anchor = (event.currentTarget as HTMLSelectElement).value as 'center' | 'bottom'))}
                    >
                      <option value="center">nothing (centre on x, y)</option>
                      <option value="bottom">a surface (bottom on y)</option>
                    </select>
                  </label>
                  <NumberField label="turn from" value={sel.rot[0]} onChange={(n) => change((d) => void ((findSelected(selected, d) as SpotDef).rot[0] = n))} />
                  <NumberField label="turn to" value={sel.rot[1]} onChange={(n) => change((d) => void ((findSelected(selected, d) as SpotDef).rot[1] = n))} />
                  <NumberField label="nudge" value={sel.jitter} onChange={(n) => change((d) => void ((findSelected(selected, d) as SpotDef).jitter = Math.max(0, n)))} />
                  <label class="ed-field">
                    <span>tone around it</span>
                    <select value={sel.tone} onChange={(event) => change((d) => void ((findSelected(selected, d) as SpotDef).tone = (event.currentTarget as HTMLSelectElement).value))}>
                      {Object.keys(tones).map((tone) => (
                        <option key={tone} value={tone}>
                          {tone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label class="ed-field">
                    <span>example object</span>
                    <select value={examples[sel.id] ?? ''} onChange={(event) => setExamples((prev) => ({ ...prev, [sel.id]: (event.currentTarget as HTMLSelectElement).value }))}>
                      <option value="">(any)</option>
                      {objects.map((o) => (
                        <option key={o.id} value={o.id}>
                          {objectName(o.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div class="ed-row">
                  <label>
                    <input type="checkbox" checked={sel.flip} onChange={() => change((d) => void ((findSelected(selected, d) as SpotDef).flip = !sel.flip))} /> may be mirrored
                  </label>
                  {DIFFICULTIES.map((difficulty) => (
                    <label key={difficulty}>
                      <input
                        type="checkbox"
                        checked={sel.for.includes(difficulty)}
                        onChange={() =>
                          change((d) => {
                            const spot = findSelected(selected, d) as SpotDef;
                            spot.for = spot.for.includes(difficulty) ? spot.for.filter((x) => x !== difficulty) : DIFFICULTIES.filter((x) => x === difficulty || spot.for.includes(x));
                          })
                        }
                      />{' '}
                      {difficulty}
                    </label>
                  ))}
                </div>
              </>
            )}
            {selected.kind === 'kumo' && 'pose' in sel && (
              <div class="ed-row">
                <select value={sel.pose} onChange={(event) => change((d) => void ((findSelected(selected, d) as KumoSpotDef).pose = (event.currentTarget as HTMLSelectElement).value))}>
                  {kumoPoses().map((pose) => (
                    <option key={pose} value={pose}>
                      {pose}
                    </option>
                  ))}
                </select>
                <label>
                  <input type="checkbox" checked={sel.flip} onChange={() => change((d) => void ((findSelected(selected, d) as KumoSpotDef).flip = !sel.flip))} /> mirrored
                </label>
                <span class={kumoVisibility[sel.id]?.ok ? 'ed-good' : 'ed-bad'}>
                  {Math.round((kumoVisibility[sel.id]?.visible ?? 0) * 100)}% of Kumo shows (25–70% is right)
                </span>
              </div>
            )}
            {selected.kind === 'prop' && 'art' in sel && (
              <div class="ed-row">
                <select value={sel.art} onChange={(event) => change((d) => void ((findSelected(selected, d) as PropDef).art = (event.currentTarget as HTMLSelectElement).value))}>
                  {propNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div class="ed-row">
              {selected.kind !== 'prop' && <button onClick={duplicateSelected}>Duplicate (⌘D)</button>}
              <button class="ed-danger" onClick={removeSelected}>
                Delete
              </button>
            </div>
          </section>
        )}

        <section>
          <h2>Objects</h2>
          <p class="ed-note">Drag onto the scene to add a spot. Ticked objects can appear in this scene ({pool.size}).</p>
          <ul class="ed-library">
            {objects.map((o) => (
              <li key={o.id}>
                <img
                  src={icon(`objects/${o.id}`)}
                  alt={objectName(o.id)}
                  title={objectName(o.id)}
                  draggable
                  onDragStart={(event) => event.dataTransfer?.setData('text/plain', `object:${o.id}`)}
                />
                <input
                  type="checkbox"
                  aria-label={`${objectName(o.id)} can appear here`}
                  checked={pool.has(o.id)}
                  onChange={() =>
                    change((d) => {
                      const set = new Set(d.pool.length ? d.pool : objects.map((x) => x.id));
                      if (set.has(o.id)) set.delete(o.id);
                      else set.add(o.id);
                      d.pool = set.size === objects.length ? [] : objects.map((x) => x.id).filter((id) => set.has(id));
                    })
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Kumo and props</h2>
          <p class="ed-note">Drag Kumo onto the scene to add a hiding place. Kumo should be partly tucked behind a prop.</p>
          <div class="ed-row">
            {kumoPoses().map((pose) => (
              <img
                key={pose}
                class="ed-kumo-pose"
                src={icon(`kumo/${pose}`)}
                alt={pose}
                title={pose}
                draggable
                onDragStart={(event) => event.dataTransfer?.setData('text/plain', `kumo:${pose}`)}
              />
            ))}
          </div>
          <div class="ed-row">
            {propNames
              .filter((name) => !doc.props.some((p) => p.art === name))
              .map((name) => (
                <button key={name} onClick={() => addProp(name)}>
                  + {name}
                </button>
              ))}
          </div>
          <label class="ed-row">
            <input type="checkbox" checked={autoTone} onChange={() => setAutoTone(!autoTone)} /> pick each spot’s tone from the background
          </label>
        </section>

        <section>
          <h2>Preview</h2>
          <div class="ed-row">
            {DIFFICULTIES.map((difficulty) => (
              <button key={difficulty} class={preview?.difficulty === difficulty ? 'is-on' : ''} onClick={() => shuffle(difficulty)}>
                Shuffle {difficulty}
              </button>
            ))}
            {preview && <button onClick={() => setPreview(null)}>Back to editing</button>}
          </div>
          {preview?.error && <p class="ed-bad">{preview.error}</p>}
          {preview?.layout && (
            <p class="ed-note">
              Seed {preview.seed}. To find: {preview.layout.entries.map((e) => `${objectName(e.obj)}${e.count > 1 ? ` ×${e.count}` : ''}`).join(', ')}. Kumo: {preview.layout.kumo?.spot ?? 'none'}.{' '}
              {preview.report?.problems.length ? preview.report.problems.join('; ') : 'Everything can be found.'}
            </p>
          )}
          <div class="ed-row">
            <button onClick={checkMany}>Check 300 shuffles</button>
          </div>
          {checkText && (
            <ul class="ed-check">
              {checkText.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>Export</h2>
          <p class="ed-note">
            Save as <code>src/content/scenes/{doc.id}.json</code>. Its pictures go in <code>src/art/scenes/{doc.art}/</code>.
          </p>
          <div class="ed-row">
            <button onClick={() => downloadText(`${doc.id}.json`, text())}>Download .json</button>
            <button onClick={() => void navigator.clipboard.writeText(text()).then(() => setStatus('Copied'))}>Copy</button>
            {import.meta.env.DEV && <button onClick={() => void saveToProject()}>Save into project</button>}
            <button disabled={history.past.length === 0} onClick={undo}>
              Undo
            </button>
            <button disabled={history.future.length === 0} onClick={redo}>
              Redo
            </button>
          </div>
          {status && <p class="ed-note">{status}</p>}
        </section>
      </aside>
    </div>
  );
}
