# Documentation

Prompt Studio docs are split by audience so the [main README](../README.md) stays a short landing page.

**Browse with search:** run `npm run docs:serve` and open [http://127.0.0.1:8000](http://127.0.0.1:8000) (requires Python 3 + `pip install -r docs/requirements-docs.txt`).

**GitHub Pages:** pushes to `main` that touch `docs/` or `mkdocs.yml` publish to [doodersrage.github.io/llm-prompt-studio](https://doodersrage.github.io/llm-prompt-studio/). Actions → **Docs** → **Run workflow** republishes without a docs change.

## Getting started

| Doc | Contents |
| --- | --- |
| [Main README](../README.md) | What it is, quick start, tools table, supported models |
| [Operator guide](operator.md) | Heal & ready, [10-minute loop](operator.md#10-minute-loop), second GPU, backup, invite + SMTP |
| [Configuration & deployment](configuration.md) | `.env.local`, LLM, auth, security, production checklist, Docker |
| [Desktop app](desktop.md) | Tauri installers (macOS / Windows / Linux) |
| [ComfyUI custom nodes](../comfyui/comfyui_image_prompt_tools/README.md) | Install `PromptTools*` nodes into ComfyUI |

## Using the app

| Doc | Contents |
| --- | --- |
| [Features](features.md) | Full feature list by area (Gallery, Studio, Queue, Auth, …) |
| [Workflow takeover](workflow-takeover.md) | Placeholders, quality profiles, queue-time patching |
| [Prompt limits](prompt-limits.md) | Character limits by model × detail level |
| [Prompt examples](prompt-examples.md) | Sample outputs for SDXL, Qwen Edit, FLUX, SD1.5 |
| [HTTP API](http-api.md) | REST endpoints, curl examples, health/probe/invite, error shape |
| [Data catalogs](data-catalogs.md) | Location & clothing library generator scripts |

### Features by area

Quick jumps inside [features.md](features.md):

- [Prompt generation & models](features.md#prompt-generation)
- [Scene tools & catalogs](features.md#scene-tools)
- [Studio](features.md#studio)
- [Gallery](features.md#gallery)
- [Queue & ComfyUI](features.md#queue-comfyui)
- [Workflows & library](features.md#workflows)
- [Settings, storage & backup](features.md#settings-storage)
- [Auth, admin & API](features.md#auth-api)
- [Operator guide](operator.md) — second GPU, backup v5, SMTP invite
- [Automation & integrations](features.md#automation)
- [UI & UX](features.md#ui-ux)

## Contributors & ops

| Doc | Contents |
| --- | --- |
| [Architecture](architecture.md) | Storage, queue path, auth, plugins, engine adapter |
| [Releases](releasing.md) | Cut `vX.Y.Z` GitHub Releases and GHCR images |
| [Plugin iframe host](plugin-iframe-host.md) | postMessage protocol + example HTML for iframe tools |
| [Performance & scripts](performance/guide.md) | npm scripts, build, Prettier, monitoring checklist |
| [Diffusers engine](../services/diffusers-engine/README.md) | Optional FastAPI stills-only sidecar (not Play film) |

## In the repo

- **Agent rules:** [AGENTS.md](../AGENTS.md) (Next.js conventions for AI assistants)
- **CI:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — lint, unit tests, build, Playwright
- **Releases:** [releasing.md](releasing.md) — tag `vX.Y.Z` or Actions → Release; GitHub Release + GHCR image
- **Env template:** [`.env.example`](../.env.example)
