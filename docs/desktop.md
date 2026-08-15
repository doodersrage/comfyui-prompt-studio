# Desktop app

Prompt Studio can ship as a **Tauri** window on macOS, Windows, and Linux. The installer bundles the Next.js standalone server and a Node 22 runtime. It does **not** bundle ComfyUI or model weights.

## Install

GitHub Releases on `vX.Y.Z` tags attach:

| OS | Artifact |
| --- | --- |
| macOS | `.dmg` |
| Windows | `.exe` (NSIS) |
| Linux | `.AppImage` and `.deb` |

Open the app, then set **Settings → ComfyUI** to your existing ComfyUI URL (`http://127.0.0.1:8188` by default).

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
3. `PROMPT_DATA_DIR` is the OS app-data directory.
4. The window navigates to `http://127.0.0.1:47832`.
5. Quitting the app stops the child server.

Adult Roleplay ratings and the Adult generator plugin still need `PROMPT_NSFW_GENERATOR_ENABLED` / `NEXT_PUBLIC_PROMPT_NSFW_GENERATOR_ENABLED` at **build** time (see [configuration](configuration.md)).
