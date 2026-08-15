# Prompt Studio desktop

Tauri 2 shell that starts the Next.js standalone server with a bundled Node 22 runtime, then opens `http://127.0.0.1:47832`.

ComfyUI is not bundled. Point Settings → ComfyUI at a local or LAN install after launch.

## Prerequisites

- Node.js 22+
- Rust (`rustup`) for `tauri build`
- Linux: WebKitGTK 4.1 (`libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`)

## Commands (from the repo root)

```bash
npm install
cd desktop && npm install && cd ..

# Dev: start Next if needed, then the Tauri window
npm run desktop:dev

# Production installers (dmg / nsis / AppImage+deb depending on the host)
npm run desktop:build
```

`desktop:build` runs `next build`, stages `.next/standalone` into `desktop/src-tauri/resources/server`, downloads a platform Node binary as a Tauri sidecar, then `tauri build`.

Installers land in `desktop/src-tauri/target/release/bundle/`.

## Data

The app sets `PROMPT_DATA_DIR` to the OS app-data folder (Application Support / AppData / `~/.local/share/app.promptstudio.desktop`).
