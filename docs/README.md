# TeleSculpt frontend (`/docs`)

Static single-page app served by GitHub Pages. Vanilla ES modules, no build step.
Three.js 0.160.0 is loaded via a CDN import map in `index.html` (unpkg, module build).

## Files

| File | Purpose |
|---|---|
| `index.html` | SPA shell — one `<section class="screen">` per screen, import map, favicon, manifest |
| `css/style.css` | Dark indigo/plum theme, glass cards, touch-first controls |
| `js/config.js` | `API_BASE` — auto-targets `http://localhost:7071/api` on localhost; `PLACEHOLDER_PROD_API` is replaced by deploy tooling |
| `js/api.js` | Fetch wrappers for the frozen API contract (throws `Error` with server message; `err.status` set) |
| `js/app.js` | Screen router, 2s state polling, countdown timers, submit flows, session restore |
| `js/scene.js` | **Shared Three.js setup** (renderer, camera, damped OrbitControls, lights, shadow ground, voxel InstancedMesh helpers, palette constants) — used by both sculptor and viewer |
| `js/sculptor.js` | Touch voxel editor (BUILD / ERASE / ROTATE modes, raycast placement, undo, serialize) |
| `js/viewer.js` | Turntable sculpture viewer (guess screen + reveal) |
| `js/reveal.js` | Chain-by-chain reveal flow + canvas confetti |
| `manifest.json` | PWA manifest (standalone, SVG data-URI icon) |

## Run locally

```sh
npx http-server docs -p 8080
# or: python -m http.server 8080 --directory docs
```

`js/config.js` auto-detects localhost and calls the Functions host at
`http://localhost:7071/api`.

## Game flow (client side)

- Poll `GET /rooms/{code}/state?playerId=…` every 2s.
- `phase=lobby` → lobby screen (host gets Start at ≥2 players).
- `phase=playing` → if `youSubmitted` → WAITING, else `GET /task` routes to
  WRITE / SCULPT / GUESS by `task.type`. Re-routing is guarded by a
  `phase:step:youSubmitted` key so polling never rebuilds an active screen.
- `phase=reveal` → `GET /reveal` once → local, self-paced reveal gallery.
- `playerId` + `roomCode` are kept in `sessionStorage`; refreshing mid-game
  re-polls state and lands back on the correct screen.
- Soft timers: 45s write/guess (auto-submits `…mysterious silence…` if empty),
  120s sculpt (auto-uploads whatever exists).

### Sculpt submit sequence

1. `POST /rooms/{code}/upload-url` → `{ sasUrl, blobUrl }`
2. `PUT sasUrl` with headers `x-ms-blob-type: BlockBlob`, `Content-Type: application/json`
   and the sculpture JSON body
3. `POST /rooms/{code}/submit` with `{ playerId, blobUrl }`

## Debug hooks (used by Playwright tests)

`window.__ts` is always defined:

| Hook | Returns / does |
|---|---|
| `__ts.getState()` | `{ screen, roomCode, playerId, phase, step, task, voxelCount }` — `screen` is one of `home\|lobby\|write\|sculpt\|guess\|waiting\|reveal` |
| `__ts.forceScreen(name)` | Shows that screen without game state (lazily creates the sculptor / guess viewer for `'sculpt'` / `'guess'`), and stops any running countdown. Lets the sculptor be exercised standalone: `__ts.forceScreen('sculpt')`. |
| `__ts.sculptor` | The live `Sculptor` instance (getter; `null` until the sculpt screen has been shown) |
| `__ts.debugPlaceVoxel(x, y, z, colorIndex = 0)` | Places a voxel programmatically (creates the sculptor if needed). Returns `true` if placed, `false` if out of bounds / occupied. Coordinates are 0–15 ints. |
| `__ts.debugSerialize()` | Returns the sculpture JSON exactly as it would be uploaded: `{ v: 1, size: 16, palette: [...8 colors], voxels: [[x,y,z,paletteIndex], …] }` |

Example (Playwright):

```js
await page.evaluate(() => {
  __ts.forceScreen('sculpt');
  __ts.debugPlaceVoxel(8, 0, 8, 3);
  return __ts.debugSerialize();
});
```

## Notes / decisions

- Shared Three.js scene setup lives in `js/scene.js` (not duplicated in
  sculptor/viewer) — this is the "small js/scene.js" option from the design.
- Voxel cap: 512 (rendering uses one `InstancedMesh` with per-instance color).
- Sculpting interaction: explicit BUILD / ERASE / ROTATE mode buttons; a tap
  (pointer press that moves <10px) acts in build/erase mode; pinch/wheel zoom
  works in every mode; one-finger drag orbits only in ROTATE mode.
- Building from an empty grid works by raycasting the ground plane (no starter
  block); building on existing voxels raycasts faces and places adjacent.
- Reveal advancement is local — each player taps Next at their own pace.
