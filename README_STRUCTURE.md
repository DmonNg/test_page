# MyRoad / UTM Shuttle Buddy — file structure (split version)

The old single `index.html` (≈ 242 KB with three images and all code inside) is now split into small files that the browser can download in parallel and cache separately. **Nothing in the app logic changed** — the JavaScript was cut at section boundaries, in the same order, and rebuilt line-for-line to confirm it is identical to the original.

## 1. Folder layout

```
index.html              page markup only (≈ 9 KB)
css/
  styles.css            all styling (≈ 20 KB)
js/                     loaded in this exact order (see section 3)
  schedule.js           bus schedule parser, timeline, trip finder       (no DOM)
  i18n.js               EN / MS / 中文 text, tx(), applyLang()
  map.js                loading bar, clock, day/night, Leaflet map, DigiWorld 3D overlay,
                        route + journey drawing, KRP_G11 highlight (setTipStop)
  tabs.js               bottom sheet, tab switching, populate()
  routes-tab.js         Routes & timetable tab + KRP_G11 tip card
  plan.js               trip timeline, Plan tab, KRP_G11 planner tip, quick buttons, target pin
  stops-gps.js          stop popup, GPS
  app.js                tilt, map style, settings, language, schedule download,
                        lazy-loading of the 3D library
assets/img/
  basu-sprite.jpg       loader running animation (was embedded in the CSS)
  trainer-avatar.jpg    top-bar avatar (was embedded in the HTML)
  stop-disc.jpg         stop popup picture (was embedded in the HTML)
Model/
  pokestop_bedrock_model.glb   <- already in your repo; keep it next to index.html
```

## 2. What makes the first load lighter

| Change | Effect |
|--------|--------|
| 3 base64 images moved to `assets/img/*.jpg` | HTML/CSS shrink by ≈ 145 KB; images are cached by the browser and no longer re-downloaded inside every HTML/CSS change |
| CSS and JS in separate files | browser downloads them in parallel and caches them; editing one file does not invalidate the others |
| all scripts use `defer` | the page and loading screen are drawn first; scripts run after the HTML is parsed |
| **three.js (≈ 600 KB) + GLTFLoader loaded after the app is on screen** (`loadThree()` in `app.js`) | previously these two blocked the page before anything started; now only the 3D stop models wait for them |
| `preconnect` to cdnjs and raw.githubusercontent.com | schedule download and Leaflet start connecting earlier |

Approximate first-screen download: HTML 9 KB + CSS 20 KB + JS 73 KB + loader sprite 93 KB + Leaflet (CDN) — then 3D libraries and the `.glb` model load in the background.

## 3. Load order (do not reorder)

All files are classic scripts that share one global scope, exactly as the old single `<script>` did. Each file may use things defined in the files above it.

| # | File | Needs from earlier files |
|---|------|--------------------------|
| 0 | Leaflet (CDN) | — |
| 1 | `schedule.js` | — |
| 2 | `i18n.js` | `Bus` |
| 3 | `map.js` | `L`, `tx`, `places`, `buses` |
| 4 | `tabs.js` | map layers, `tx` |
| 5 | `routes-tab.js` | `timeline`, `depsFor`, `selectRoute` |
| 6 | `plan.js` | everything above |
| 7 | `stops-gps.js` | `nextAtStop`, `openStop` helpers |
| 8 | `app.js` | all of the above; starts the schedule download and the 3D loader |

## 4. Where the KRP_G11 "Wait here" feature lives now

| Piece | File | Function / name |
|-------|------|-----------------|
| Is a stop after KRP_G11? | `plan.js` | `afterKrp()` |
| Decision + minutes saved | `plan.js` | `krpTip()` |
| Tip card in Plan results | `plan.js` | `addTip()` inside `plan()` |
| Tip card in Routes tab | `routes-tab.js` | `routeTipInfo()`, `routeTipHtml()` |
| Tip in stop popup | `stops-gps.js` | `openStop()` (`#stopTip`) |
| Ring, label, 3D tilt, glowing 3D model | `map.js` | `setTipStop()`, `schedulePokestopRender()`, `updatePokestopStyle()` |
| Texts | `i18n.js` | keys starting with `tip_` |
| Styling | `css/styles.css` | `.tip`, `.tipmark`, `@keyframes tipPulse` |

The earlier `README_KRP_G11_tip.md` explains each of these line by line; its line numbers refer to the old single-file `index.html`, but the function names are the same.

## 5. Deploying on GitHub Pages

1. Copy the **contents** of this folder (`index.html`, `css/`, `js/`, `assets/`) into your repo root, next to the existing `Model/` folder. Delete the old single-file `index.html` (it is replaced).
2. Commit and push; wait for Pages to publish.
3. After any later edit, bump the version in the `?v4` part of the `<link>`/`<script>` tags in `index.html` (e.g. `?v5`). This forces browsers (especially desktop Chrome) to fetch the new file instead of a cached one.
4. Check the build: Settings (⚙) shows `build: krp-tip-3d v4 (split files)` and the browser console prints the same line.

## 6. Notes

- This is still **one page**. The Plan, Routes and map views share a single live map, so they are tabs rather than separate `.html` pages; separate pages would reload the map and 3D layer on every click.
- Opening `index.html` by double-click (`file://`) loads the page, but the browser blocks the `.glb` 3D model there; use GitHub Pages or a local server (`python -m http.server`) to test the 3D view.
- Not run in a real browser here: the split was verified by syntax checks, a line-for-line rebuild of the original script, a check that every referenced file exists, and re-running the tip logic from the new files.
