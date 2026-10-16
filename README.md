# ✏️ Excaliflow

**Hand-drawn diagrams with live animated flows.** Sketch out AI agents, RAG pipelines, or system architectures just like in Excalidraw, and watch data flow through your arrows in real time. Connect shapes, customize colors and sketch styles, and export a crisp 2x PNG or a 60fps video loop. Runs in a single HTML file with zero dependencies.

## Features

- **Hand-drawn look and feel.** Draw boxes, circles, decision diamonds, freehand sketches, and sticky notes using Excalidraw's hand-drawn fonts (`Excalifont`, `Virgil`, `Cascadia`) and sketch fills.
- **Live animated arrows.** Connect any two shapes and watch comets, pulses, neon streaks, or dashed streams travel along your arrows in order from start to finish.
- **Easy arrow editing.** Drag any arrow endpoint around the edge of a shape, pull the middle of an arrow to curve it, or double-click an arrow to straighten it.
- **Fast diagram building.** Press `Tab` or click a `+` port on any selected shape to add and connect the next step automatically, or drop a shape onto an existing arrow to split it in two.
- **Ready-made starter templates.** Load built-in diagrams for **AI Agent Swarm**, **RAG Pipeline**, **How Browsers Work**, and **Microservices** in one click.
- **Projects & canvases saved as files.** Group canvases into projects in the side panel. Every canvas autosaves to a plain `.excaliflow` file in a workspace folder on your disk, so it works in Safari, Chrome and Firefox and plays well with git or Dropbox.
- **Light & dark canvas + instant export.** Switch between a clean white canvas and a pitch-black neon canvas, then export a cropped 2x PNG, copy to clipboard, record a `.webm` video loop, or save and load `.excaliflow` / `.excalidraw` JSON files.

## How to Get Started

Requires **Node.js 18+** (or open `index.html` directly in any modern browser). Excaliflow has no external npm dependencies, so no install step is needed.

```sh
git clone https://github.com/Shubhamsaboo/awesome-llm-apps.git
cd awesome-llm-apps/advanced_llm_apps/excaliflow
npm start
```

Open **http://localhost:3000** in your browser.

## Projects & Workspace

When you run `npm start`, `server.js` stores your work in a **workspace folder**. Each project is a subfolder and each canvas is a `.excaliflow` file:

```text
workspace/
  Payments/
    Checkout.excaliflow
    Refunds.excaliflow
  .trash/              deleted canvases and projects land here, never hard-deleted
```

By default the workspace is `./workspace` next to the app (git-ignored). Point it anywhere you like:

```sh
WORKSPACE=~/Diagrams npm start
```

- Open the **Projects panel** with the folder button in the top-left (or `⌘⇧O`). Create, open, rename, duplicate and delete projects and canvases there. Double-click a name to rename it.
- Canvases **autosave** about a second after each change. The dot next to the canvas name in the header shows the save state. `⌘S` saves immediately.
- Undo history belongs to each canvas and resets when you switch.
- If a canvas file changes on disk while it's open (for example after `git pull`), Excaliflow won't overwrite it. It offers **Reload from disk**, **Overwrite** or **Save as copy**.
- **Import as Canvas** (⋯ menu) or dropping `.excaliflow` / `.excalidraw` files onto the window adds them as new canvases in the current project.
- Opening `index.html` directly (`file://`) still works, but only as an unsaved scratch canvas.

The API only listens on `127.0.0.1` and refuses requests from other websites, so a page you visit can't read or change your workspace.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `V` or `1` | Select, move, resize shapes, or bend arrows |
| `H` or `Space + Drag` | Pan around the canvas |
| `R` or `2` | Rectangle |
| `D` or `3` | Diamond / Decision |
| `O` or `4` | Circle / Ellipse |
| `A` or `5` | Animated Arrow |
| `P` or `7` | Freehand Pen |
| `T` or `8` | Text |
| `N` or `9` | Sticky Note |
| `K` | Laser Pointer |
| `E` or `0` | Eraser |
| `Q` | Keep selected tool active (Tool Lock) |
| `Tab` | Add and connect the next shape |
| `Double-click` | Add a node on empty canvas, edit text, or straighten an arrow |
| `Alt / Option + Drag` | Duplicate selection while dragging |
| `⌘Z` / `⇧⌘Z` | Undo / Redo |
| `⌘S` | Save the canvas now (downloads a file in scratch mode) |
| `⌘⇧O` | Show or hide the Projects panel |
| `⌘D` | Duplicate selection |
| `⌘\` | Show or hide the left style panel |

## Project Structure

```text
excaliflow/
|-- index.html            Complete single-file app (UI, sketch renderer, and animation loop)
|-- server.js             Zero-dependency local server: static files + workspace /api (http://localhost:3000)
|-- verify.js             Automated test suite for geometry, arrows, and interactions
|-- package.json          Start and test scripts
`-- README.md
```

## Development

Run the automated verification checks:

```sh
npm test
```

Licensed under the repository's [Apache-2.0 license](../../LICENSE).
