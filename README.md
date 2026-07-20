# ComfyUI Image Prompt Tools

A Next.js app that turns topics or keywords into model-specific prompts for ComfyUI image workflows, and reformats existing drafts for any supported architecture.

## Supported models

The app includes **40+ ComfyUI image model targets**, grouped by architecture family:

| Family | Examples | Prompt style |
|--------|----------|--------------|
| **Stable Diffusion** | SD 1.5, SD 2.0, SD 2.1 | Short weighted tags or brief phrases |
| **SDXL** | SDXL Base, Refiner, SSD-1B, Segmind Vega | Natural-language scene descriptions |
| **SD3 / AuraFlow** | SD3 Medium/Large, SD 3.5, AuraFlow | Longer NLP; quote visible text in `"quotes"` |
| **Flux / Chroma** | FLUX Dev/Schnell/2/Klein, Chroma | Subject-first photographic prose |
| **Qwen Image** | Edit, Edit-2511, Image-2512, Image-2.0 | Edit instructions or factual/rich T2I prose |
| **Hunyuan / HiDream** | Hunyuan DiT, Hunyuan Image 2.1, HiDream | Descriptive unified scene prose |
| **Other DiT** | PixArt, Lumina 2, Z-Image, OmniGen2, Kandinsky 5, Stable Cascade | Architecture-tuned NLP or instructions |
| **Instruct / Edit** | SD1.5/SDXL InstructPix2Pix, Lotus-D | Short imperative edit instructions |

Use the **search + category filter** in the UI to pick a model. Each entry shows its ComfyUI node name (e.g. `CLIP Text Encode (Flux)`, `TextEncodeQwenImageEditPlus`).

Video, audio, and 3D-only architectures (WAN, Hunyuan Video, Stable Audio, etc.) are not included—their prompt semantics differ from static image generation.

## Tools

| Page | Route | Purpose |
|------|-------|---------|
| **Dashboard** | `/dashboard` | Pending jobs, queue status, recent outputs, active project |
| **Generate** | `/` | Keywords or random surprise → model-ready prompt |
| **Format** | `/format` | Adapt an existing prompt draft for a selected model |
| **Character** | `/character` | Solo person, duo/sport, or subject + background compose |
| **Pet** | `/pet` | Pet-focused prompts with scene pools |
| **Fantasy** | `/fantasy` | Fantasy character/scene prompts |
| **Topics** | `/topics` | Topic lists for batch prompt builds |
| **Background** | `/background` | Environment-only prompt with no people |
| **Image → Prompt** | `/image-prompt` | Upload an image; vision LLM writes the prompt |
| **Negative** | `/negative` | Sport-aware negative/preserve prompts for SD models |
| **Studio** | `/studio` | History, iteration tree, projects, compare, portfolio, campaign, analytics, catalog, templates |
| **Lint** | `/lint` | Paste prompts for diagnostics, fix, compact, reformat |
| **Refine** | `/refine` | Refine an existing prompt with image + intent hints |
| **Settings** | `/settings` | Sub-nav (Overview, LLM, ComfyUI, Automation, Data), health checks, `.env.local` catalog, webhooks, backup |
| **Gallery** | `/gallery` | Stats dashboard, grid/dense/list layouts, review focus, compare modal, semantic search |
| **Variations** | `/variations` | Roll N prompt variations and batch-queue to ComfyUI |
| **ControlNet** | `/controlnet` | Structure prompts (text or image-assisted) |
| **Video** | `/video` | Motion / camera prompts for video workflows |
| **Plugins** | `/plugins` | Tool plugin registry |

Legacy URLs `/duo`, `/compose`, and `/random-scene` redirect to the merged Character and Generate pages.

## Features

- Searchable model picker with architecture-family filters
- Profile-based prompt styles shared across related checkpoints
- Prompt detail levels (Concise / Balanced / Rich) with **combined model × detail size limits**
- Minimum character enforcement for long-form models (Image-2.0 Rich, FLUX Rich, etc.)
- Positive and negative/preserve prompt modes
- Uncensored system prompts (no content filtering or refusals)
- One-click copy for ComfyUI paste
- LLM-powered generation/formatting with rules fallback
- **App database (Dexie)** — settings, history, presets, workflows, webhooks, and gallery persist in IndexedDB (`comfy-prompt-studio-v1`); existing `localStorage` data migrates automatically on first load
- **User accounts & feature ACL** — optional login with default admin, groups, and per-user/per-group blocked features (Settings → Users). When auth is enabled, prompt history and gallery are scoped per user in the browser; analytics snapshots sync to the server for admin review.
- **Settings cache** — target model, detail level, and per-tool options persist in the app database across reloads and pages
- **Prompt diagnostics** — lint sport/duo/helmet conflicts before or after generation
- **Character generator** — solo, duo/sport, and compose-with-background modes; sport presets, team kit, batch roll, ComfyUI queue
- **Studio** — prompt history with ratings, model compare, catalog browser, templates
- **Location blocklist** — block locations in Studio catalog; all generators respect the list
- **Locked wardrobe** — pin a catalog outfit from Studio; Character and batch tools reuse it
- **Locked location & variation seed** — pin scene place and environment seed for reproducible rolls
- **Scene compose mode** — Character tool merges background + subject into one scene prompt
- **Lint playground** — `/lint` for paste-and-fix without generating a new scene
- **Compact & cross-model reformat** — trim to model limits or reformat for the alternate model from any result panel
- **Studio presets & diff** — named scene lock bundles, history search/filters/tags, word-level prompt diff, custom templates, shareable `?scene=` preset URLs
- **Topics batch build** — turn a topic list into full Generate or Character (duo) prompts via `/api/topics/batch`; queue the whole batch to ComfyUI
- **Export pipeline** — “Prepare for ComfyUI” runs lint → fix → compact → copy pair → optional ComfyUI queue from any result panel
- **Prompt sidecar** — download JSON sidecar (prompt, model, diagnostics, seed) from result panels or Studio history
- **ComfyUI job status** — polls ComfyUI history after queue and shows pending/running/completed in the UI
- **ComfyUI gallery** — `/gallery` stores queued jobs in IndexedDB (Dexie) and displays output images when ComfyUI finishes; previews appear inline on result panels
- **Gallery stats bar** — at-a-glance totals (completed, in queue, favorites, unreviewed, avg rating) with one-click filter chips
- **Gallery layout modes** — Grid, Dense, or List view (persisted); list mode for scanning prompts; dense for more thumbnails per row
- **Gallery review focus** — review mode auto-selects the first card, highlights focus, scrolls into view; keyboard 1–5 / F / N / P
- **Gallery compare modal** — compare 2–4 selected outputs in a full-screen overlay instead of inline scroll
- **Gallery card polish** — hover quick actions (Open, Improve) on thumbnails; storage cap warning near 5,000 IndexedDB entries
- **ComfyUI workflow params** — `{{SEED}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{CFG}}`, `{{STEPS}}` placeholders plus queue defaults in Settings; **multiple workflow JSON files** (import in Settings or configure `COMFYUI_WORKFLOW_DIR` / `COMFYUI_WORKFLOW_PATHS` on the server) with a selector next to **Send to ComfyUI**
- **Gallery tools** — favorites, status/tool filters, image download, and sidecar JSON export per entry
- **Variation grid** — `/variations` rolls N prompt variations and batch-queues them with unique ComfyUI seeds
- **Completion notifications** — optional browser notifications when ComfyUI jobs finish (Settings)
- **Backup v2** — export/import includes ComfyUI settings, gallery entries, and imported workflow JSON files
- **Re-queue** — gallery entries and Studio history can be sent to ComfyUI again (same params or new seed)
- **Sidecar import** — load sidecar JSON on Gallery, Lint, and Variations to restore prompts or re-queue
- **Workflow dry-run** — preview injected workflow JSON in Settings (and from Lint result panels) before queueing
- **Custom workflow tokens** — user-defined placeholders like `{{CHECKPOINT}}` and `{{LORA}}` with values in Settings
- **Gallery compare panel** — pick winner, rate, favorite, mutate, or improve from 2–4 selected outputs; bulk **Seed experiment** queues same prompt with varied seeds
- **Studio analytics** — Per-user history + gallery activity summary and gallery rating token stats (high vs low motifs) on Studio Analytics tab
- **Iteration tree actions** — Regenerate, Refine, and re-queue from iteration tree nodes
- **Matrix CSV export** — Variations matrix mode exports row×column grid to CSV
- **Portfolio CLI queue** — `npm run prompt:cli -- portfolio --input "..." --queue` formats and queues each model to ComfyUI
- **Wardrobe avoided tokens** — low-rated motifs filter catalog wardrobe picks across generators
- **Batch history auto-save** — batch ComfyUI queue saves one lineage history entry when auto-save is enabled
- **ComfyUI avoided tokens** — optional `avoided_tokens` input on generator nodes passes motif avoidance to the API
- **Avoided tokens settings** — view, add, remove, and clear the local avoidance list in Settings
- **Studio analytics actions** — add negative-scoring tokens to avoidance from the Analytics tab
- **Gallery project filter** — filter `/gallery` by the active Studio project
- **Compare winner lineage** — pick winner sets lineage parent when the entry has history
- **Param experiment queue** — sweep CFG, steps, width, or seed from a selected gallery output
- **Gallery A/B export** — export compare selections as JSON or HTML side-by-side reports
- **Webhook event log** — Settings shows recent webhook deliveries with retry
- **Auto-improve loop** — optional auto-mutate or seed-experiment on high ratings / favorites
- **Find similar outputs** — rank gallery entries by prompt similarity to a selection
- **Iteration tree export** — download parent/child history branches as structured JSON
- **Docker Compose** — `docker compose up` for app + Ollama (+ optional ComfyUI profile)
- **GitHub Actions CI** — runs unit tests, build, and Playwright smoke on push/PR
- **Preview workflow everywhere** — all ComfyUI-enabled result panels include a dry-run preview button
- **Generate sport presets** — sport preset chips on Generate (positive mode) with shareable scene URLs
- **Settings hub** — `/settings` for service health checks and local data backup/reset
- **Batch ComfyUI queue** — queue all duo batch rolls to ComfyUI with shared negative
- **Pre-lint + rule fix** — Duo shows hint lint before generate; **Fix prompt (rules)** applies helmets, sport strips, etc.
- **ComfyUI workflow** — optional `COMFYUI_WORKFLOW_PATH` with `{{POSITIVE}}` / `{{NEGATIVE}}` placeholders, or configure URL + workflow JSON in **Settings → ComfyUI queue settings** (stored in this browser)
- **CLI** — `npm run prompt:cli -- duo --hints "..."` over the HTTP API (includes `topics-batch`, `compact`, `comfyui`, `portfolio`, `webhook-test`, `pet`, `fantasy`, `background`, LLM flags)
- **Gallery → Refine / Image→Prompt** — open completed outputs in Refine or Image→Prompt with image + prompt pre-loaded
- **Auto-negative on queue** — optional Settings toggle + negative profile library for SD-family ComfyUI queue
- **Topics → Variations handoff** — send a topics batch to `/variations` as an imported grid
- **Batch lint gate** — Topics and Variations bulk queue lint prompts first (fix-all or skip errors)
- **Prompt lineage** — gallery entries link to Studio history when queued from result panels
- **Visual model compare** — Studio Compare tab can queue both models to ComfyUI and show outputs side-by-side
- **Character identity bundles** — export/import reusable character sheets from Studio Presets
- **Gallery ZIP export** — bulk export selected entries as images + sidecars
- **Smart workflow defaults** — Settings maps workflow filenames to model categories automatically
- **ComfyUI WebSocket progress** — optional faster job updates in Settings
- **Qwen Edit builder** — segment-based edit instruction builder on Generate for Qwen Edit models
- **Rating-driven random** — history/gallery favorites and downvotes subtly adjust random-scene wildness
- **Improve output pipeline** — one-click Improve from gallery or result panels opens Refine with image + intent
- **Context-aware negatives** — ComfyUI queue picks negative profiles from tool/hints (pet, fantasy, sport, etc.)
- **Prompt iteration tree** — Studio tab shows parent/child history branches via `parentHistoryId`
- **Studio deep links** — `/studio?history=<id>` highlights a saved prompt; gallery links back to history
- **Prompt projects** — named campaigns filter Studio history; new saves attach active project id
- **Gallery review mode** — rate completed outputs 1–5; low ratings feed wildness/avoidance bias
- **Preset packs** — import/export bundles of scene presets from Studio Presets tab
- **Hint source** — Manual, From history, or Random on Generate, Character, Pet, Fantasy, Background, Topics, and Variations
- **Scene starter catalog** — ~294 searchable presets on Generate/Character (category, framing, tag filters; `/` focuses search)
- **User scene starter presets** — save current hints or promote gallery analytics tokens; export/import starter packs in Studio Presets
- **Use as hints** — Studio history rows open the source tool with hints prefilled (`hintSource=manual`)
- **Queue from preset** — selected scene preset → **Queue 4 variations** handoff to `/variations?from=preset`
- **Persisted preset filters** — search, framing, and tag filters survive reload via settings cache
- **Settings env panel** — copy `.env` snippet and re-run LLM/ComfyUI health tests from Overview
- **Multi-model portfolio** — Studio Portfolio tab formats one draft for several models and batch-queues
- **Workflow pre-flight** — Topics/Variations batch queue validates workflow placeholders before submit
- **ComfyUI param recovery** — gallery re-queue restores saved seed/params from `queueParams`
- **Regional/inpaint builder** — Character tool composes labeled subject/background/lighting segments
- **Semantic search** — token-overlap ranking in Studio history and Gallery filters
- **Scheduled batch** — Settings configures periodic random-scene/topics generation (+ optional ComfyUI queue)
- **Webhooks** — POST job completion payloads to an external URL via server proxy
- **Active character descriptor** — shared mandatory character sheet injected into Character API requests
- **Home dashboard** — pending ComfyUI jobs, recent outputs, and active project on `/dashboard`
- **Keyboard shortcuts** — Ctrl+Enter generate (all scene tools), Ctrl+Shift+C copy pair, Ctrl+Shift+G queue ComfyUI; `/` focuses scene preset search on Generate/Character
- **Queue param overrides** — optional seed/width/height/cfg/steps overrides in Settings and result panels
- **LoRA trigger injection** — missing trigger phrases from the LoRA library append on ComfyUI queue
- **Avoided tokens** — low gallery ratings record motifs to avoid; all generators honor avoidance via LLM instruction and template pool filtering
- **Auto-save on queue** — Settings toggle; skips duplicate history when you already saved manually
- **Catalog rating bias** — Studio catalog sorts clothing/locations by gallery review scores; click **Insert** to add to hints
- **Gallery compare** — select 2–4 completed entries for side-by-side review on `/gallery`
- **Mutate winner** — re-queue gallery entries with location/wardrobe/wildness/variation mutations
- **Negative A/B** — same-seed ComfyUI queue with/without negative for SD-family models
- **Refine diff panel** — word-level diff when refining from a saved history parent
- **Auto lineage** — Improve/Refine/Reformat saves attach `parentHistoryId` for Studio iteration tree
- **Gallery handoffs** — send selected prompts to Topics batch or Variations matrix (`?matrix=1`)
- **History/gallery export** — CSV and JSONL export from Studio and Gallery bulk actions
- **Prompt matrix mode** — `/variations?matrix=1` for row×column variation grids
- **Studio backup v3** — export/import avoided tokens, webhook log/settings, projects, scheduled batch
- **Avoided tokens import/export** — JSON list management on Settings
- **Gallery project filter & assign** — filter by project dropdown; bulk assign entries to projects
- **Gallery param grid** — CFG × steps experiment grid from a selected entry
- **Gallery review shortcuts** — 1–5 rate, F favorite, N/P navigate in review mode
- **Compare pick-winner auto-improve** — high-rated winner triggers auto-improve loop
- **Studio campaign runner** — batch random scenes or topics with optional ComfyUI queue
- **Iteration branch diff** — compare parent/child prompts on Studio iteration tab
- **History batch re-queue** — re-queue saved `batchPrompts` from batch ComfyUI sends
- **Analytics live refresh** — Studio analytics updates when gallery ratings change
- **Webhook log UI** — event filter and payload preview on Settings
- **ComfyUI Topics Batch node** — `PromptToolsTopicsBatch` calls `/api/topics/batch`
- **Prompt readiness score** — pre-queue lint badge on result panels (`/api/readiness`)
- **Cherry-pick merge** — Studio Diff tab merges two prompts with lint checks
- **Experiment dashboard** — Studio Experiments tab groups gallery outputs by prompt/seed variants
- **Multi-ref image prompts** — Image tool accepts up to 4 references (`/api/image-prompt/multi`)
- **ControlNet prompt builder** — `/controlnet` tool for depth/pose/canny/normal/lineart conditioning text
- **Embedding search** — semantic history filter uses Ollama embeddings when available (`/api/search/embeddings`)
- **Avoidance preview** — Settings shows matched tokens and LLM instruction before generation
- **Workflow preset packs** — import/export bundled presets in Settings workflow library
- **Server storage sync** — optional `PROMPT_DATA_DIR` file-backed namespaces via `/api/storage`
- **API usage & rate limits** — proxy logs usage; optional `PROMPT_API_TOKEN` + rate limit env vars
- **Server scheduled batch** — `SERVER_SCHEDULED_BATCH=true` or manual `POST /api/scheduled-batch/run`
- **ComfyUI job status node** — `PromptToolsJobStatus` polls `/api/comfyui/status`
- **Queue artifacts** — optional `COMFYUI_QUEUE_EXPORT_DIR` writes JSON sidecars after queue
- **Readiness-gated queue** — result panels warn below score 60; confirm or fix before ComfyUI queue
- **Readiness auto-fix** — one-click compact / rule-fix / reformat from readiness panel
- **Experiment winner workflow** — crown winners, compare export, re-queue groups on Studio Experiments tab
- **Gallery embedding search** — semantic and find-similar use `/api/search/embeddings` when available
- **Workflow preset pack builder** — add workflows or settings snapshots to packs; install packs into library
- **Queue orchestration panel** — home/gallery view of ComfyUI server queue, VRAM, and local tracked jobs
- **Server storage pull** — Settings advanced panel restores server namespaces into the app database
- **IP-Adapter multi-ref merge** — Image tool roles + per-reference strength influence (`/api/image-prompt/multi`)
- **ControlNet from image** — upload reference for vision-assisted structure extraction on `/controlnet`
- **Token / weight inspector** — `(tag:1.2)` analysis on Lint, Format, and result panels
- **Low-rating refine loop** — 1–2★ gallery ratings open Refine with corrective intent automatically
- **Campaign templates** — save/load campaign recipes on Studio Campaign tab
- **Portfolio diff export** — cross-model Markdown/HTML diff from Studio Portfolio tab
- **Observability dashboard** — Settings advanced panel shows API volume, errors, and slow routes
- **Workflow node auto-map** — suggested positive/negative bindings while editing workflow JSON
- **Video prompt builder** — `/video` + `wan-video` / `hunyuan-video` model profiles
- **Project bundles** — export/import project history + gallery JSON from Studio Projects tab
- **Aesthetic scoring** — heuristic gallery score on cards; `POST /api/aesthetic/score` for snapshots
- **PWA manifest** — installable web app metadata (`manifest.json`); offline service worker disabled (conflicted with Next.js HMR)
- **Plugin registry** — `/plugins` lists built-in tools and accepts custom localStorage plugin entries

## Prompt size limits (selected models)

Limits are enforced per **model × detail** combination. All models have Concise / Balanced / Rich presets; long-form models also enforce `minChars`:

| Detail | Qwen-Image-Edit | Edit-2511 | Image-2512 | Image-2.0 | FLUX.2 Klein | SDXL | SD1.5 |
|--------|-----------------|-----------|------------|-----------|--------------|------|-------|
| Concise | ~280 chars | ~220 chars | ~320 chars | ~400 chars | ~250 chars | ~280 chars | ~220 chars |
| Balanced | ~520 chars | ~420 chars | ~380–650 chars | ~550–800 chars | ~450–700 chars | ~520 chars | ~380 chars |
| Rich | ~920 chars | ~680 chars | **700–1000 chars** | **1100–1400 chars** | **900–1200 chars** | ~780 chars | ~520 chars |

Other families use limits tuned to their encoder (see `src/lib/comfy-models/limits.ts`).

## Quick start

Requires **Node.js 22+**.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:47832](http://localhost:47832).

### Security notes

This app is designed for a **trusted local / LAN** setup. By default the HTTP API is open (CORS `*`) so ComfyUI custom nodes and CLI tools can call it.

When exposing beyond localhost:

1. Set `PROMPT_AUTH_ENABLED=true` (or create users under `PROMPT_DATA_DIR/auth/`) and sign in — default admin username/password come from `PROMPT_ADMIN_USERNAME` / `PROMPT_ADMIN_PASSWORD` (defaults: `admin` / `admin`; change immediately).
2. Set `PROMPT_API_TOKEN` — cross-origin and non-browser clients must send `Authorization: Bearer <token>` (same-origin UI still works). ComfyUI nodes read the same token from `PROMPT_API_TOKEN`. Service tokens bypass user login but should be kept secret.
3. Set `COMFYUI_ALLOW_CLIENT_URL=false` so callers cannot override the ComfyUI base URL (SSRF).
4. Prefer binding to loopback (`127.0.0.1`) — `docker-compose.yml` already does this.
5. Webhook dispatch blocks private/metadata URLs unless `WEBHOOK_ALLOW_PRIVATE=true`.

## Docker

```bash
docker build -t qwen-image-prompt .
docker run --rm -p 127.0.0.1:47832:47832 \
  -e LLM_API_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=dolphin-llama3 \
  -e LLM_VISION_MODEL=qwen3-vl:latest \
  qwen-image-prompt

  From Docker Hub:
docker run -d \
  -p 47832:47832 \
  --name=comfyui-prompt-studio \
  --restart=always \
  -e LLM_API_BASE_URL=http://host.docker.internal:11434/v1 \
  -e LLM_MODEL=hermes3 \
  -e LLM_VISION_MODEL=gemma4:latest \
  doodersrage/comfyui-prompt-studio:latest
```

On Linux, add `--add-host=host.docker.internal:host-gateway` if Ollama runs on the host. Override `PORT` only if you map a different host port.

## ComfyUI custom nodes

Six nodes under **prompt tools** call this app's HTTP API and output a `prompt` string you can wire into `CLIP Text Encode`, `TextEncodeQwenImageEditPlus`, or any text input.

Install into the ComfyUI instance you actually run (on this machine, `/opt/comfyui` on port 8188):

```bash
sudo ./comfyui/install.sh --copy /opt/comfyui
```

**Do not symlink into `~/Projects/...` for `/opt/comfyui`.** ComfyUI runs as the `comfy` user and cannot read your home directory (`/home/robertsm` is mode `700`), so symlinks fail with `IMPORT FAILED` in the log.

For a user-owned ComfyUI under your home directory, a symlink is fine:

```bash
./comfyui/install.sh --link ~/comfy/ComfyUI
```

Verify with ComfyUI's Python: `/opt/comfyui/venv/bin/python comfyui/verify_install.py`

If nodes do not appear: fully restart ComfyUI, search **Prompt Tools**, and check `/opt/comfyui/user/comfyui_8188.log`.

Set `COMFY_PROMPT_API_URL=http://127.0.0.1:47832` on the ComfyUI host if the API is not on localhost.

## LLM configuration

The generator calls any **OpenAI-compatible** chat completions API. Configure via `.env.local`:

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_BASE_URL` | `http://localhost:11434/v1` | API base URL |
| `LLM_API_KEY` | _(empty)_ | Bearer token if required |
| `LLM_MODEL` | `dolphin-llama3` | Model name |
| `LLM_TEMPERATURE` | `0.95` | Sampling temperature (higher = more variation) |
| `LLM_ENABLED` | `true` | Set `false` for template-only mode |
| `ALLOW_TEMPLATE_FALLBACK` | `true` | Fall back if LLM is unreachable |
| `PROMPT_API_TOKEN` | _(empty)_ | Optional API bearer token for non-browser clients |
| `PROMPT_AUTH_ENABLED` | `false` | Enable login and feature access control |
| `PROMPT_ADMIN_USERNAME` | `admin` | Default admin username (seeded on first enable) |
| `PROMPT_ADMIN_PASSWORD` | `admin` | Default admin password (change in production) |
| `PROMPT_SESSION_SECRET` | _(falls back to API token)_ | HMAC secret for session cookies |
| `PROMPT_AUTH_DIR` | _(uses `PROMPT_DATA_DIR/auth`)_ | Directory for `users.json`, `groups.json`, and `analytics-snapshots.json` |
| `COMFYUI_API_URL` | `http://127.0.0.1:8188` | Default ComfyUI base URL |
| `COMFYUI_ALLOW_CLIENT_URL` | `true` | Allow clients to override ComfyUI URL |
| `COMFYUI_ALLOWED_HOSTS` | _(empty)_ | Optional comma-separated ComfyUI host allowlist |
| `WEBHOOK_ALLOW_PRIVATE` | `false` | Allow webhook POSTs to private/LAN URLs |

### Ollama (local, uncensored)

```bash
ollama pull dolphin-llama3
```

```env
LLM_API_BASE_URL=http://localhost:11434/v1
LLM_MODEL=dolphin-llama3
```

## Prompt format examples

**SDXL (Balanced):**

> A narrow cyberpunk alley at midnight, rain-slick asphalt mirroring magenta and cyan neon signs. Steam curls from sidewalk grates between cracked pavement. A sleek black cat crouches on a rusted fire escape, amber eyes catching a stray beam of light.

**Qwen-Image-Edit-2511 (Balanced):**

> Keep the subject's facial features, pose, and proportions unchanged. Replace the background with a gothic cathedral interior, candle flames cutting through low fog above worn flagstones.

**FLUX.2 Klein (Rich):**

> A sleek black cat crouches on a rusted fire escape… [subject first, named materials, photographic lighting, camera/composition detail]

**SD1.5 (Concise):**

> neon alley, rain, black cat, cyberpunk, night, wet pavement

Use **Negative / Preserve** mode for protective conditioning. **Note:** FLUX models ignore negative prompts—the generator outputs positive preservation phrasing instead.

## HTTP API

All endpoints return **JSON** (`Content-Type: application/json`) and support **CORS** (`Access-Control-Allow-Origin: *`) for use from scripts, ComfyUI custom nodes, or other apps.

### Discovery

```bash
# API catalog: tools, request/response shapes, curl examples
curl -sS http://localhost:47832/api | jq .

# Supported models (47 targets) with limits per detail level
curl -sS http://localhost:47832/api/models | jq .

# Filter by family or fetch one model
curl -sS "http://localhost:47832/api/models?category=flux" | jq .
curl -sS "http://localhost:47832/api/models?id=sdxl" | jq .
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api` | GET | API catalog and schema documentation |
| `/api/models` | GET | List models (`?category=`, `?id=`) |
| `/api/generate` | POST | Keywords → model-ready prompt |
| `/api/format` | POST | Existing draft → model-ready prompt |
| `/api/topics` | POST | Seed theme (optional) → list of topic ideas |
| `/api/random-scene` | POST | Random cohesive scene prompt (also available via Generate → Random surprise) |
| `/api/character` | POST | Detailed single-person prompt |
| `/api/background` | POST | People-free environment prompt |
| `/api/image-prompt` | POST | Image upload/base64 → prompt (vision LLM) |

Errors use a consistent shape: `{ "error": "message" }` with an appropriate HTTP status (400, 404, 405, 500).

### Format API

```bash
curl -X POST http://localhost:47832/api/format \
  -H "Content-Type: application/json" \
  -d '{"input":"1girl, neon alley, rain, masterpiece","model":"flux-2-klein","detail":"balanced","smartFormat":true}'
```

Set `"smartFormat": false` for instant rules-only cleanup (no LLM).

## Generate API

```bash
curl -X POST http://localhost:47832/api/generate \
  -H "Content-Type: application/json" \
  -d '{"input":"neon alley, rain, black cat","mode":"positive","model":"sdxl","detail":"balanced"}'
```

Response:

```json
{
  "prompt": "...",
  "mode": "positive",
  "provider": "llm",
  "model": "sdxl",
  "comfyNode": "CLIP Text Encode (Prompt)",
  "limits": {
    "maxChars": 520,
    "maxSentences": 3,
    "maxTokens": 380
  }
}
```

Model IDs match the registry in `src/lib/comfy-models/registry.ts`.

## Random location pool

Named scene locations power random scene rolls, Background, Character, and Topics seeds. The pool is split across batch files under `src/lib/` and merged at build time.

| Command | Purpose |
|---------|---------|
| `npm run locations:count` | Show current unique location count |
| `npm run locations:generate` | Add **500** new locations (writes next batch file) |
| `npm run locations:generate:dry` | Preview generation without writing files |

Advanced CLI (`node scripts/generate-locations.mjs`):

```bash
# Grow pool to a target size
npm run locations:generate -- --target 5000

# Add a specific number with a reproducible seed
npm run locations:generate -- --add 1000 --seed 42

# Write a specific batch number
npm run locations:generate -- --add 250 --batch 4
```

New batches land in `src/lib/location-catalog-extra-N.ts`. The script updates `src/lib/location-catalog-batches.ts` automatically — do not edit that index by hand. Word pools live in `scripts/location-word-pools.mjs`.

## Clothing library

The character tool includes a **2,000+ entry clothing catalog** (outfits, tops, bottoms, outerwear, footwear, accessories) used for wardrobe presets and random outfit rolls.

| Command | Purpose |
|---------|---------|
| `npm run clothing:count` | Show catalog size by category |
| `npm run clothing:dedupe` | Remove duplicate category+label entries across batches |
| `npm run clothing:generate` | Add **500** new clothing entries |
| `npm run clothing:generate:dry` | Preview without writing files |

```bash
npm run clothing:generate -- --target 5000
npm run clothing:generate -- --add 1000 --seed 42
```

In the Character tool, open **Wardrobe & props** presets to pick library items (grouped dropdowns covering all **16 categories**: tops, bottoms, outerwear, footwear, swimwear, intimates, hosiery, formalwear, sleepwear, underwear, socks, headwear, traditional dress, and more). Custom text fields override library picks. **Every catalog item is always selectable** in the dropdowns (gender filtering only). Random outfit rolls still respect scene context for specialized items. Word pools: `scripts/clothing-word-pools.mjs`.
