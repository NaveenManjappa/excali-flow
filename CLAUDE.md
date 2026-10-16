# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Excaliflow is an Excalidraw-style, hand-drawn diagram editor whose arrows animate data flowing between shapes. The whole app is one file, `index.html`, which holds the CSS, the markup and a single inline `<script>`. There are no npm dependencies, no build step and no bundler. Fonts load at runtime from Google Fonts and from esm.sh, which serves Excalidraw's own font files.

## Commands

```sh
npm start        # node server.js → http://localhost:3000 (PORT / HOST / WORKSPACE env vars override)
npm test         # node verify.js — the full verification suite
```

You can also open `index.html` directly in a browser. Node 18 or newer is required.

There is no test runner. `verify.js` is one sequential script of `assert` calls split into numbered `[PASS] N.` sections, and later sections reuse the elements and state that earlier ones created. You cannot run a single test on its own: run the whole file, and read the first failing assertion message to find the problem.

## How verify.js works (important when editing index.html)

- It uses a regex to pull the **first** `<script>…</script>` block out of `index.html` and runs it inside a Node `vm` sandbox. That sandbox has mock `document`, `window`, a canvas context and an instrumented `Path2D`. Do not add another inline `<script>` before the main one, and do not split the main script up.
- Tests can only reach functions that the `Object.assign(window, {...})` call at the end of the script exposes. If a new function needs testing, add it to that export list.
- Tests call `sandbox.initStudioDOM()` directly. `initStudioDOM` must therefore keep tolerating the mocked DOM: `getElementById` returns a generic stub, `querySelectorAll` returns `[]`, and `requestAnimationFrame` and `setTimeout` do nothing.
- Interactions are tested through the world-space entry points `pointerDownWorld`, `pointerMoveWorld`, `pointerUpWorld` and `handleKeyDown({ key })`, not through DOM events. Keep real input logic in those functions. The DOM listeners should stay thin wrappers that convert screen coordinates to world coordinates.
- The suite also checks the branding: the string `Excaliflow` must appear, including `<span>Excaliflow</span>`, and `AtelierFlow` must never appear.
- `server.js` is tested in-process: the test requires its module export and emits fake `request` events. `server.js` exports the server and only calls `listen` when it is run directly. API tests use `apiReq` (a `Readable` request with a body) and point the server at a temp folder with `server.setWorkspaceRoot(dir)`.
- The sandbox has no `fetch` or `location`, so `restoreWorkspace()` falls into scratch mode and loads the template synchronously. Test 1 depends on that. Workspace logic is tested by calling `connectWorkspace(createMemoryStore())` directly.

## Architecture of the script in index.html

The script is split into numbered sections, marked with `/* ---- N. Title ---- */` banners. Use those banners to find your way around. The big-picture flow:

- **State**: a single mutable `state` object (section 2) holds everything: the `elements` array, `selectedIds` (a Set), camera (`scrollX`, `scrollY`, `zoom`), the active tool, flow settings, `history`, the current `drag` operation and so on. There is no framework and no reactivity. UI chrome is synced by hand with `syncUIWithSelection` and `updateHeaderButtons`.
- **Elements** are plain objects that `createElement(type, props)` builds. The node types are rectangle, ellipse, diamond, sticky and text. Arrows use `x,y` → `x2,y2`, plus optional `startBinding` / `endBinding` (`{ elementId, focusAngle, gap }`), `curveType` (`straight` / `curved` / `elbow`) and `curveOffset`.
- **Sketch rendering** (section 3): `ShapeCache` turns each element into `fillPath`, `strokePath` and `hachurePath` Path2Ds. It draws them with seeded randomness (`mulberry32(seed ^ versionNonce)`), so shapes keep the same wobble from frame to frame. The cache is keyed on geometry and style fields (`keyFor`). If you add a style property that changes the geometry, add it to `keyFor`, or call `ShapeCache.invalidate(el)`, which also bumps `versionNonce`. `roughness` sets the sketch style: 0 is Clean, 0.85 is Artist and 1.75 is Cartoon, and anything above 1.2 switches to the multi-pass "cartoon" mode. Hachure fills are clipped analytically to the shape (`clipSegmentToShape`) **and** with `ctx.clip(fillPath)`, and the tests assert both.
- **Arrow geometry** (section 4): `getArrowGeometry(el)` is the single source of truth for arrows. It works out the bound endpoints on shape perimeters from `focusAngle` (`getBindingBoundaryPoint`), and also returns the waypoints, the curve or elbow handle point, the tip angle and arc-length data used for particle animation. Rendering, hit testing and dragging all go through it.
- **Flow animation** (section 5): `computeGraphDepths` runs a BFS over the node/arrow graph so that particles on arrows further downstream are phase-delayed. That delay is what makes flow look like it runs in order from start to finish. `triggerNodePulse` sends burst packets along a node's outgoing arrows.
- **Render loop** (section 16): it uses two stacked canvases. Every frame, `renderScenePasses` draws the scene onto the static canvas in three passes: shapes, then arrows and particles, then text, so that labels are never covered. `drawInteractiveOverlay` then draws selection, handles, ports and previews onto the interactive canvas. Exports in section 14 reuse `renderScenePasses` on an offscreen canvas.
- **Undo** (section 9): this is snapshot-based. `pushHistory()` stores a serialized snapshot of `elements` before each change. `discardRedundantUndoSnapshot` removes snapshots for interactions that changed nothing, for example clicking a node without moving it.
- **Workspace** (section 17 + `server.js` `/api`): projects are folders and canvases are `.excaliflow` files in the workspace root (`WORKSPACE`, default `./workspace`). Ids are the folder and file names. The client talks to a store interface: `createHttpStore` in the app, and `createMemoryStore` in tests with the same semantics. `state.workspace` tracks the open canvas. Autosave compares `sceneContentKey()`, which leaves out the camera, against `lastSavedKey` every second, and sends the file's mtime so the server can answer 409 when the file changed on disk. `openCanvas` saves the current canvas first and resets undo history. `sanitizeName` exists in both `server.js` and `index.html`, so keep the two copies in sync. The Templates menu goes through `openTemplate`, which creates a new canvas named after the template in the current project, so it never overwrites the open canvas. Only scratch mode calls `loadTemplate` in place.
- **Text tool**: this works like Excalidraw. Clicking a shape with T edits that shape's label. Clicking empty canvas creates an empty, left-aligned free-text element (`textAlign: 'left'`) anchored at the click. It grows right and down as you type (`isFreeText` / `autoFitElementToText`) and is discarded if left empty. Creating and typing the text is one undo step, because the creation snapshot is passed to `startInlineEditing` as `preSnap`. Text elements without `textAlign: 'left'` are older, centred ones. The pointerdown wrapper calls `preventDefault` when a press opens the editor, so focus doesn't jump back to the canvas.
- **Flow Stories** (section 18): `state.story.steps` (`{ id, caption, focusIds }`) is scene content. It is saved as `appState.story`, validated by `sanitizeStory`, and included in `sceneContentKey()`. It is not part of undo snapshots. `state.storyPlayer` is transient playback state and is never saved. A step stores no camera: framing comes from `getElementsBounds(focused)` through `computeFitCamera(..., { presenting: true })`, eased by `advanceStoryTween` in the render loop. Steps with an empty focus are "overview" steps. While a story plays, `renderScenePasses({ focusSet })` draws the unfocused layer, a background-coloured veil, then the focused layer. It uses a veil rather than `globalAlpha` because the renderer sets alpha absolutely. Presenter keys and clicks are intercepted at the top of `handleKeyDown` and `pointerDownWorld`. `loadTemplate` auto-drafts a story with `buildAutoStory`.
- **Import/export** (section 14): `importExcalidrawJson` handles untrusted input. It is a thin wrapper over `parseSceneJson` (validation, used for every canvas file read too) and `applyScene`. `parseSceneJson` filters element types against `ALLOWED_ELEMENT_TYPES`, validates `flowMode` against `ALLOWED_FLOW_MODES`, clamps `flowSpeed`, and converts Excalidraw's `points[]` arrows into `x2/y2`. Keep these guards in place when you extend the format.

## Invariants the tests enforce

Breaking any of these fails `npm test`:

- Arrows never render text and never cut gaps in their shaft (`labelBox === null`, `gapStartDist === -1`).
- An unselected arrow's endpoint can be grabbed with one click and dragged onto a different shape, which rebinds it.
- Switching `curveType` to straight or elbow resets `curveOffset` to 0. Switching to curved from an offset of 0 applies a default offset of at least 20.
- An elbow arrow never routes through the interior of its start shape.
- With nothing selected, `applyStyleProperty` applies the change to every shape on the canvas.
- Number-key tool shortcuts follow a fixed mapping: 1 select, 2 rectangle, 3 diamond, 4 ellipse, 5 and 6 arrow, 7 freedraw, 8 text, 9 sticky, 0 eraser.
- The static server rejects methods other than GET and HEAD with 405, a malformed URI with 400 and path traversal with 403. Only `/api/*` accepts other methods.
- The `/api` routes require an `X-Excaliflow: 1` header, a `localhost` / `127.0.0.1` Host and a JSON content type on writes. They reject bodies over 10 MB with 413 and names that `sanitizeName` would change with 400. Deletes move entries to `.trash`, and a PUT with a stale `If-Unmodified-Since-Ms` returns 409.
- Camera-only changes and rendering never make a canvas dirty. Switching canvases saves the previous one first and empties the undo and redo stacks.
