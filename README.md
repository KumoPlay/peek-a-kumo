# Peek-a-Kumo ☁️🔍

A cozy hidden-object game in a little town on the clouds, made by KumoPlay. Look around six busy, charming scenes for the things on the list, and spot Kumo, a tiny cloud who peeks out from a new hiding place every time. Each scene takes two or three minutes, and every play shuffles the list and the hiding places, so scenes stay fresh.

- Runs in phone and computer browsers, upright or sideways. Installable ("Add to Home Screen") and playable offline after the first visit.
- No server, no accounts, no ads, no purchases, no links out, no data collection. Progress is saved in the player's own browser.
- Cozy by design: no timer and no score. A wrong tap only gets a soft wobble. Hints are free and refill by themselves. The list is pictures first, with optional words, so children who cannot read yet can play.

Play: <https://kumoplay.github.io/peek-a-kumo/> (once deployed)

## Run it

You need [Node.js](https://nodejs.org) 22.12 or newer (the deployment uses Node 24).

```sh
npm install
npm run dev
```

Open <http://localhost:5173/peek-a-kumo/>.

### Try it on your phone (same Wi-Fi)

```sh
npm run dev:phone
```

The terminal prints a line like `Network: http://192.168.1.23:5173/peek-a-kumo/`. Type that address into the phone's browser. The phone and the computer must be on the same Wi-Fi; if the computer asks whether Node may accept incoming connections, allow it.

Over this plain `http` address, browsers switch off a few things that only work on `https`: installing to the home screen, offline play, one-tap "Copy backup code" (the code is shown to copy by hand instead) and the request to keep storage. They all work on the real site.

## Check it

```sh
npm test          # game rules, saving, content checks, and the "every layout can be finished" test
npm run build     # type-check, then build into dist/
npm run preview   # serve the built game at http://localhost:4173/peek-a-kumo/ (offline support works here)
```

The most important test is `src/core/layout/findable.test.ts`. For every scene and difficulty it makes 300 shuffled layouts and plays each one to the end, tapping only where an object can actually be seen, with the same tap code the game uses. It also checks that Kumo always peeks (partly visible, partly tucked away) and never hides in the same place twice in a row. Set `FINDABLE_SEEDS=50` for a quicker run while working.

## Deploy

Every push to `main` runs the tests, builds the game and publishes it to GitHub Pages with `.github/workflows/deploy.yml`. The repository's Pages source must be set to "GitHub Actions". If a test fails, nothing is published.

The game is served from `/peek-a-kumo/`. That path is set once, as `base` in `vite.config.ts`.

## Where things are

| Folder | What is in it |
| --- | --- |
| `src/content/scenes/` | **One file per scene** (`<id>.json`), as the scene editor writes it. |
| `src/content/` | The other content: the object library (`objects.ts`), colours (`colors.ts`), difficulties (`difficulties.ts`) and stickers (`stickers.ts`). |
| `src/art/` | **Every picture**, one SVG per file. Swap a file and keep its name. |
| `src/i18n/` | **Every word** the player reads (`en.ts`). |
| `src/core/` | The game rules in plain TypeScript, with tests next to them. No drawing code. |
| `src/core/layout/` | Shuffling, the fairness checks, and drawing order. |
| `src/core/play/` | One play: taps, finds, Kumo, hints. |
| `src/core/gestures.ts` | Fingers and mouse → tap, double-tap, pan, pinch. |
| `src/core/save/` | The save format, upgrades for old saves, and backup codes. |
| `src/render/` | Drawing a scene (`sceneView.ts`), zoom and pan (`camera.ts`), little effects (`fx.ts`). |
| `src/ui/` | The screens (Preact and plain CSS): home, play, album, settings. |
| `src/editor/` | The scene editor (developer tool, not part of the game). |
| `src/platform/` | Browser things: storage, sounds, home-screen install, offline support. |
| `tools/` | Build helpers: tap shapes from the art, and the editor's "Save into project". |
| `public/` | The app icons. |

## How a play works

- **The shuffle.** When a scene starts, `shuffleLayout` (in `src/core/layout/shuffle.ts`) picks what to find from the scene's `pool` of objects (on Tricky, up to two lines are "find 3 of"), then decoys from the rest. An object type is never both on the list and a decoy. Each object goes in a random spot that the difficulty may use, with a random size around the spot's size, a turn within the spot's range, a small nudge, maybe a mirror flip, and a colour. Easy picks colours that stand out from the spot's `tone`, Tricky picks colours that blend in. Kumo goes in one of the scene's Kumo spots, never the one used last time.
- **The fairness check.** Every layout is checked before anyone sees it (`checkLayout`): each object on the list must show at least a share of itself (Easy 90%, Normal 55%, Tricky 40%) and a minimum area, sit fully inside the scene, and be found by a tap on its visible part. Kumo must show between 25% and 70% of itself, and no object may cover it. A layout that fails is changed or made again.
- **Taps.** A tap counts when it is on an object's real outline or within about 12 screen pixels of it, never more than a third of the object's size. When two objects are close, the nearer one wins. Tapped parts tucked behind something count too. The outlines are made from the art when the game is built (`tools/shapes-plugin.ts`), so swapping a picture updates its tap shape automatically.
- **Zoom and pan never count as taps.** A tap is one finger that moves less than 10 pixels and lifts within half a second. Moving further pans; a second finger pinches; after two fingers touched, nothing taps until every finger is up. Double-tap zooms in (or back out). On computers, the mouse wheel zooms, dragging pans, and +, −, 0 and the arrow keys work too.
- **Hints** sparkle around something still to find (never Kumo) and refill by themselves: 10 seconds on Easy, 20 on Normal, 30 on Tricky.
- **Saving inside a scene.** The layout, what was found, Kumo and the hint timer are saved after every find, so closing the game and coming back continues right there ("Continue" on the home screen). Each scene and difficulty can have its own unfinished play.
- **Finishing** gives a sticker the first time for each scene and difficulty, and finding Kumo gives that scene's Kumo sticker. After the last object, the player can keep looking for Kumo; it is never given away.
- **Opening scenes.** Scene 1 is open from the start. Finishing a scene on any difficulty opens the next one. In an open scene, Easy and Normal are open; Tricky opens after finishing that scene once. Openings are worked out from what was finished, not stored, so new scenes slot in by themselves.

## The scene editor

```sh
npm run editor
```

This opens <http://localhost:5173/peek-a-kumo/editor.html>. The editor is only in the development server; it is not built into the game or the offline download.

- **Open** a scene from the list, start a **New** one, or **Open file…** to load a scene file from anywhere.
- **Objects:** drag one from the library onto the scene to make a spot where objects may go. The ticks say which objects may appear in this scene (the scene's `pool`).
- **Select** a spot, Kumo spot or prop by clicking it, then drag it, nudge it with the arrow keys (Shift for bigger steps), or change its numbers in the pink panel. ⌘D duplicates, Delete removes, ⌘Z / ⇧⌘Z undo and redo. Drag the background to pan; use the wheel to zoom.
- **Spots:** green spots are used by every difficulty; blue ones only by the difficulties you ticked (usually tucked-away spots for Normal and Tricky). "Stands on a surface" makes objects of any size rest on the line at the spot's y, which suits shelves, tables and floors. The tone (the colour around the spot) is read from the background automatically; you can change it.
- **Kumo:** drag a pose onto the scene to add a hiding place, then tuck it partly behind a prop on a higher layer. The label shows how much of Kumo shows; 25% to 70% is right.
- **Props:** the buttons add the scene's prop pictures. Props are drawn in scene units, so they land exactly where they were drawn.
- **Preview:** "Shuffle easy / normal / tricky" shows a real layout with each object's visible share. "Check 300 shuffles" makes 300 layouts per difficulty and lists any problems, spots that are never used, and Kumo spots that need moving.
- **Export:** "Save into project" writes `src/content/scenes/<id>.json` directly. "Download .json" and "Copy" do the same by hand.

### Adding a scene

1. Draw the pictures and put them in a new folder, `src/art/scenes/<scene-id>/`:
   - `background.svg` with `viewBox="0 0 1000 1000"`, drawn behind everything.
   - One SVG per **prop**: anything objects or Kumo can tuck behind (a quilt, a crate, a curtain). Draw each prop in scene units: its `viewBox` is the rectangle where it sits in the 1000 × 1000 scene, for example `viewBox="616 600 284 154"`.
   - A sticker picture, `src/art/stickers/<scene-id>.svg` (`viewBox="0 0 100 100"`, drawn to sit inside a round frame).
2. `npm run editor`, click **New**, choose the art folder, set the id, name and order, add the props, drop objects to make 35 to 45 spots, and add four to seven Kumo spots.
3. **Check 300 shuffles** until every line says 300/300, then **Save into project**.
4. `npm test`, then push. The scene appears in the scene list after the scenes before it (`order`), with its four stickers in the album.

The scene's name comes from its file. A translation can rename it by id under `scenes` in its language file.

### Adding an object

1. Draw `src/art/objects/<id>.svg` with `viewBox="0 0 100 100"`, filling most of the box. Mark the colourable parts as `var(--c1, #F9A8C8)` (main), `var(--c2, #E07AA2)` (shade) and `var(--c3, #FFE0EC)` (light), with the default colours after the commas.
2. Add a line to `src/content/objects.ts`: its colours (`tints`, or `[]` to keep the picture's own colours), `group: true` if it can be a "find 3 of", `upright: true` if it should barely tilt, and `scale` if it is naturally smaller or bigger.
3. Add its name under `objects` in `src/i18n/en.ts`.
4. Tick it in the editor for the scenes it suits (or add it to their `pool`). `npm test` tells you if anything is missing.

## Scene file format

```jsonc
{
  "format": 1,                       // scene file version
  "id": "cozy-bedroom",              // same as the file name
  "name": "Cozy Bedroom",
  "order": 1,                        // place in the unlock order
  "size": [1000, 1000],
  "art": "cozy-bedroom",             // folder in src/art/scenes/ (can be another scene's)
  "emblem": "cozy-bedroom",          // sticker picture in src/art/stickers/
  "pool": ["teacup", "sock"],        // objects that may appear here; [] means all
  "props": [
    { "id": "quilt", "art": "quilt", "x": 754, "y": 677, "w": 284, "rot": 0, "z": 40 }
  ],
  "spots": [
    { "id": "bed-1", "x": 655, "y": 650, "size": 68, "rot": [-30, 30], "jitter": 8, "flip": true, "z": 50, "tone": "butter" },
    { "id": "shelf-2-left", "x": 140, "y": 369, "anchor": "bottom", "size": 62, "rot": [-12, 12], "jitter": 8, "flip": true, "z": 20, "tone": "peach", "for": ["normal", "tricky"] }
  ],
  "kumo": [
    { "id": "curtain-left", "x": 420, "y": 190, "size": 64, "rot": 0, "flip": false, "z": 30, "pose": "side" }
  ],
  "difficulties": { "tricky": { "find": 11 } }   // optional: changes to the difficulty defaults
}
```

The comments are only for this explanation; real scene files are plain JSON.

| Field | Meaning |
| --- | --- |
| `x`, `y` | The centre, in scene units (0 to 1000, y down). For `"anchor": "bottom"`, `y` is the line the object stands on. |
| `size` | A spot's natural object size (the longest side). Easy draws objects ×1.5, Normal ×1, Tricky ×0.72, with a little randomness. |
| `rot` | Rotation range in degrees. `upright` objects stay within ±12°. |
| `jitter` | Random nudge in scene units (sideways only for bottom-anchored spots). |
| `z` | Layer. Higher is drawn in front. An object on the same layer as a prop sits in front of it; a lower layer tucks it behind. |
| `tone` | The colour around the spot: `pink`, `peach`, `butter`, `mint`, `sky`, `lilac`, `cream`, `wood`, `white` or `plum`. |
| `for` | Difficulties that may use the spot (all three if left out). |
| `pose` | Kumo's picture: `front`, `side` or `upside` (from `src/art/kumo/`). |

## Tuning

| What | Where |
| --- | --- |
| Objects to find, "find 3 of" lines, decoys, sizes, how much must show, colours, hint refill time | `src/content/difficulties.ts` (or `difficulties` in one scene's file) |
| How much of Kumo shows | `kumoRules` in `src/content/difficulties.ts` |
| Tap margin, zoom range, hint sparkle size | the constants at the top of `src/ui/play/Play.tsx` |
| What counts as a tap, a double-tap or a drag | `defaultGestureOptions` in `src/core/gestures.ts` |
| Object colours and background tones | `src/content/colors.ts` |

Run `npm test` afterwards: the findability test catches changes that would make a layout unfair.

## Swapping in better art

Replace an SVG in `src/art/` and keep its file name. Nothing else changes; tap shapes are remade from the new picture. `src/art/index.ts` lists the naming rules and sizes. Keep pictures flat for phones: no gradients, no filters (blur, drop shadows) and no `id` attributes. The build warns about them.

Moving a prop's drawing means moving its entry in the scene file too (the editor does this). Moving where things are drawn inside the background needs the spots checked again: open the scene in the editor and run "Check 300 shuffles".

The home-screen icons in `public/` were exported from `src/art/app/icon.svg`; `public/favicon.svg` is the same picture with rounded corners. After changing the icon, export the sizes again, for example:

```sh
rsvg-convert -w 512 -h 512 src/art/app/icon.svg -o public/icon-512.png
rsvg-convert -w 192 -h 192 src/art/app/icon.svg -o public/icon-192.png
rsvg-convert -w 180 -h 180 src/art/app/icon.svg -o public/apple-touch-icon.png
rsvg-convert -w 32 -h 32 public/favicon.svg -o public/favicon-32.png
```

## Text and languages

All text is in `src/i18n/en.ts`, except scene names, which are in the scene files. To add Thai, copy `en.ts` to `th.ts`, translate the values (and rename scenes under `scenes` by id if you like), and choose the language in `src/i18n/index.ts`. Words in `{curly braces}` are filled in by the game and must stay as they are. The Nunito font has no Thai letters, so Thai also needs a font added in `src/ui/styles/main.css`.

## Sounds

Sounds are made in code, with no audio files: see `src/platform/audio.ts`. Each sound is a short list of notes that can be edited there. Nothing plays until the player has tapped once. Settings and the menu inside a scene have a sound switch.

## How saving works

- Progress (scenes finished, stickers, unfinished plays, settings) is saved in IndexedDB (database `peek-a-kumo`), with a mirror in localStorage (`peek-a-kumo.save`). On load the newest good copy wins, and a copy of the last save that loaded fine is kept as a backup.
- Every saved name starts with `peek-a-kumo`, and the service worker only covers `/peek-a-kumo/`, so the KumoPlay games that share kumoplay.github.io never touch each other's saves or caches.
- The game asks the browser to keep its storage, and once (after the first finished scene) gently suggests "Add to Home Screen": some browsers, Safari on iPhone in particular, may clear a website's storage after a while without visits.
- Settings has a backup code (copy, or save as a file) to move progress to another device, and "Reset progress" with a confirmation. A backup code from another KumoPlay game is recognised and politely refused.
- A second tab takes over politely: the older tab stops saving, so two tabs never overwrite each other.
- If an update changes a scene file, that scene's unfinished play starts fresh instead of breaking.

### Changing the save format

When the shape of the saved progress changes (`SaveState` in `src/core/progress.ts`):

1. Raise `SAVE_VERSION` in `src/core/save/schema.ts` by one.
2. Add a step under the old version number in `src/core/save/migrations.ts`. It receives the old shape and returns the new one.
3. Add a test with an example of the old save in `src/core/save/save.test.ts`.

Old saves are upgraded step by step when they load, and loaded data is checked and repaired (`normalizeState`), so a damaged save or a removed scene cannot crash the game.

## Stickers

There is one sticker per scene and difficulty and one Kumo sticker per scene: 24 with the six scenes. Each is drawn from a frame (`src/art/stickers/frame-<kind>.svg`) and the scene's emblem. The catalogue is built from the scene files (`src/content/stickers.ts`).

Earned stickers are saved as `stickers: { "peek-a-kumo/cozy-bedroom/easy": { "at": "2026-11-21" } }` in the save. The id always starts with the game's slug, so a future KumoPlay-wide album could read stickers from every game.

## Offline and install

`vite-plugin-pwa` builds a service worker that keeps a copy of the whole game on the device (about 0.6 MB). The first visit only downloads what the home screen and the first scene need; the rest comes down quietly afterwards. When a new version has been downloaded, the home screen shows an "Update" button rather than changing mid-play. The web app manifest (name, colours, icons) is in `vite.config.ts`.
