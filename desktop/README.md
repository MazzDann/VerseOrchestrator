# VerseOrchestrator Desktop (Electron)

The same app in its own windows, with no browser needed (branch `feat/desktop`). Electron brings
its own Chromium, so the engine is the same on Windows, macOS and Linux. The app itself is
unchanged: the launcher runs it as always, and phones still reach it on the local network.

What the shell adds:

- The presentation window and the stage open on the screen the app picks, **fullscreen at once**
  on a screen other than the control window's. No click, no permission prompt, no popup blocker.
- The app sees every screen without asking (the Window Management permission is granted to its
  own address only).
- When a screen is unplugged, its windows come back as ordinary windows on the control window's
  screen.
- A copy of the app already running on the port is used as it is, and left running at quit.

## Run it (development)

```bash
cd desktop
npm install          # Electron 44 (its own Chromium, ~110 MB download)
npm start            # builds dist/ and opens the app
```

`VO_PORT` picks the port (default 4747); `VO_NODE` the Node runtime for the launcher.

In a VS Code terminal, unset `ELECTRON_RUN_AS_NODE` first: VS Code sets it, and Electron then runs
as plain Node.

`desktop/` is its own npm project, not a workspace: the main install never downloads Electron.
