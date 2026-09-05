# Desktop app

Prompt Studio can ship as a **Tauri** window on macOS, Windows, and Linux. The installer bundles the Next.js standalone server and a Node 22 runtime. It does **not** bundle ComfyUI or model weights.

## Install

[Latest GitHub Release](https://github.com/doodersrage/llm-prompt-studio/releases/latest) on `vX.Y.Z` tags attach:

| OS | Artifact |
| --- | --- |
| macOS | `.dmg` |
| Windows | `.exe` (NSIS) |
| Linux | `.deb`, `.AppImage` |

Linux installers use the name `PromptStudio` (no space). The window title stays **Prompt Studio**.

## First launch

1. Open the app. The first launch goes to **Settings → ComfyUI → Connection**.
2. ComfyUI is expected at `http://127.0.0.1:8188`. Leave **Use server defaults** on if that is your URL; otherwise uncheck it and set **ComfyUI API URL**.
3. Gallery, settings, and `server.log` live in the OS app-data folder (`PROMPT_DATA_DIR`).
4. Later launches open the home page.

Adult Roleplay ratings and the Adult generator plugin are **on** in desktop builds (`PROMPT_NSFW_GENERATOR_ENABLED` and `NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED`). Rebuild with those flags unset to ship a locked build. Web/Docker stays env-gated. See [configuration](configuration.md).

If the window stays on “Starting the local server…”, the splash shows the error. Check `desktop.log` and `server.log` in the app-data folder (Linux: `~/.local/share/app.promptstudio.desktop`; macOS: `~/Library/Application Support/app.promptstudio.desktop`). The bundled Node binary is named `node-<target-triple>` (for example `node-aarch64-apple-darwin`); the server files live under `Contents/Resources/resources/server`.

### Linux AppImage notes

On some GPUs / Wayland sessions, WebKit aborts immediately with a black window and:

`Could not create GBM EGL display`

Prompt Studio sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` automatically on Linux. If you are on an older build that still crashes, launch with:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 ./PromptStudio_*.AppImage
```

The `.deb` install uses system WebKit and is often more reliable on rolling distros.

## Local build

See [desktop/README.md](../desktop/README.md). From the repo root:

```bash
npm install
cd desktop && npm install && cd ..
npm run desktop:build
```

## How it runs

1. The shell looks for a server already on `127.0.0.1:47832`.
2. If none, it starts the bundled `server.js` with the bundled Node sidecar.
3. `PROMPT_DATA_DIR` is the OS app-data directory. `PROMPT_DESKTOP=1` and auth-off are set for the child process.
4. The window navigates to the local server (connection settings on first launch).
5. Quitting the app stops the child server.
