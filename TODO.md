# TODO

## Tooling

### Run the server automatically at login (macOS LaunchAgent)

**Goal:** stop having to run `npm start` before each use. Excaliflow should always be available at a bookmarked `http://localhost:<port>` in Safari.

**Approach:** a per-user LaunchAgent at `~/Library/LaunchAgents/com.excaliflow.server.plist` with these settings:
- `ProgramArguments`: `/usr/local/bin/node <repo>/server.js` (find the path with `which node` at install time)
- `WorkingDirectory`: the repo folder
- `EnvironmentVariables`: `PORT`, `WORKSPACE`
- `RunAtLoad` and `KeepAlive` set to `true`, so it starts at login and restarts after a crash
- `StandardOutPath` and `StandardErrorPath` pointing to `~/Library/Logs/excaliflow.log`

**Add these npm scripts** (backed by a small Node or shell script in the repo):
- `npm run service:install`: writes the plist, then runs `launchctl bootstrap gui/$UID …` (a `bootout` first if the agent is already loaded)
- `npm run service:uninstall`: runs `launchctl bootout`, then deletes the plist
- `npm run service:status`: shows whether it's running, plus the port, the workspace and the log location

**Open decisions:**
- Workspace folder: proposed `~/Diagrams`. Avoid Desktop, Documents and iCloud Drive, because macOS privacy rules (TCC) can block the background process from those folders.
- Port: proposed `3131`, to avoid clashing with other dev servers on 3000.

**Gotchas to document in the README:**
- Re-run `service:install` after editing `server.js`, after moving the repo, or after a Node upgrade that changes Node's path. Changes to `index.html` only need a page reload.
- Keep `HOST=127.0.0.1` so the server can't be reached from the LAN.

## Feature roadmap

Product direction: Excaliflow is the fastest way to explain how a system behaves, not just to draw it. The motion is the product. Each item below makes that explanation richer, quicker to create, or easier to share.

### Done
- [x] **Flow Stories**: step-by-step walkthroughs with spotlight, camera glide, captions, presenter mode (Shift+P), auto-drafted stories and 1080p story video export.

### Next, in order

#### 1. Data Tokens: show *what* flows, not just *that* it flows
- Arrows carry labelled tokens (`JWT`, `{order}`, `🖼️ img`, `SQL`) in place of anonymous particles.
- A node can declare a transform (`prompt → embedding`, `raw → cleaned`). The token visibly changes its label and colour as it passes through.
- Why: it turns "boxes and arrows" into an actual explanation of a pipeline (RAG, ETL, auth flows), and Stories get better with it.
- Where to start: `drawFlowParticleAt` (section 5/6). Token data would sit on the arrow element, and transforms on the node element. Validate both in `parseSceneJson`.

#### 2. Text → Flow: paste Mermaid or a simple DSL
- Paste a Mermaid `graph LR` or `A -> B -> C`. It's auto-laid out in layers by BFS depth, drawn hand-drawn and animated straight away.
- Optional: a two-way code panel next to the canvas.
- Why: acquisition. People already have Mermaid diagrams in their repos, and this gets them to "wow" in about 5 seconds.
- Where to start: parse into nodes and edges, then reuse `createElement`, the binding helpers and `computeGraphDepths` for layer placement. Open the result as a new canvas, the same way `openTemplate` does.

#### 3. Live Embed Player: the distribution loop
- Export one self-contained `.html` file (a stripped-down renderer plus the scene JSON) and an animated GIF/SVG for GitHub READMEs, Notion and docs.
- Every embed carries a small "Made with Excaliflow" link.
- Where to start: reuse `renderScenePasses` and the export path in section 14. The story player could be embedded too.

#### 4. Traffic & Chaos Simulator: the flagship "wow" release
- Nodes get an optional `capacity` (req/s) and `latency`. A source node emits traffic, and decision diamonds split it by a ratio (for example 70/30 yes/no).
- Overloaded nodes queue particles, swell and glow red. Throughput numbers float on the arrows.
- **Chaos click**: Alt-click a node to kill it. Downstream arrows go dark, error particles bounce back, and fallback arrows light up.
- Why: a sandbox for thinking through systems ("what if the cache dies?"). It makes Excaliflow more than a diagram tool.

### Later ideas
- **Trace Replay**: drop an OpenTelemetry trace or HAR file and replay the real request hop by hop, with its real timing.
- **Living Diagrams**: arrows bound to live metrics (polled through `server.js`), for an ops wall that looks hand-drawn.
- **Path Spotlight**: Shift-click two nodes to highlight the route between them and dim everything else.
- **Visual Version Diff**: compare two saved versions, with added items in green, removed ones as ghosts and moved ones with trails.
- **Flow Timeline Scrubber**: pause and rewind the animation to grab the perfect screenshot.

### Known issues
- Fit to screen can leave part of the diagram hidden under the side panels. `computeFitCamera` reserves fixed panel widths, which can be narrower than the real panels at some window sizes.
