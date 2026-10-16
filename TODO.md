# TODO

## Run the server automatically at login (macOS LaunchAgent)

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
