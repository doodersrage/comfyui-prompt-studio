# Prompt Studio

A Next.js app that turns topics or keywords into model-specific prompts for ComfyUI image workflows, and reformats existing drafts for any supported architecture.

Contributor map (storage, queue path, auth/ACL, plugins): [docs/architecture.md](docs/architecture.md).

## Workspace modes

Use **Simple / Studio / Full** from the sidebar footer or **Profile → Appearance**:

| Mode | Sidebar | Shared controls | Studio tabs |
|------|---------|-----------------|-------------|
| **Simple** | Essentials + More tools | Advanced collapsed | History, Compare, Templates, Presets, Analytics |
| **Studio** (default) | Edit / Media / Library groups | Collapsed advanced sections | All tabs |
| **Full** | Same as Studio, groups expanded | Quality sections open by default | All tabs |

New installs see a one-time welcome picker. Returning users keep Studio silently.

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

Audio and 3D architectures are available via dedicated **Audio** (`/audio`) and **3D Mesh** (`/mesh`) tools — not as rows in the still-image family table above. **WAN / Hunyuan Video** use the **Video** tool (`/video`).

### Import real Comfy packs

1. In ComfyUI, open the workflow and use **Save (API Format)** (not the UI nodes/links export).
2. In Prompt Studio, use **Settings → ComfyUI → workflow library → Import Comfy pack**, or the import card on **Video / Audio / Mesh**.
3. Select one or more `.json` files, or a `.zip` containing API workflows.
4. Leave **Auto-map** on so graphs bind to `wan-video` / `stable-audio` / `hunyuan-3d` (and friends) from filename + node types; media tokens (`{{AUDIO_SECONDS}}`, `{{MESH_RESOLUTION}}`, video frames) are attached when the graph matches.

Starter scaffolds still auto-create when you open those tools with nothing mapped — replace them with pack graphs when you have them.

### Curated model weight downloads (same machine)

Set `COMFYUI_ROOT` to your ComfyUI install directory, then use **Settings → ComfyUI → Model assets**. Prompt Studio installs allowlisted Hugging Face weights into `models/checkpoints`, `diffusion_models`, `vae`, `loras`, and `upscale_models`. Entries without a public URL stay docs-only (expected filename only). Custom nodes are not installed here.

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
| **Inpaint** | `/inpaint` | Mask a region and queue FLUX/Qwen inpaint with `{{INPUT_IMAGE}}` / `{{MASK_IMAGE}}` |
| **Outpaint** | `/outpaint` | Expand canvas borders (pad + mask) and queue through the inpaint path with Final quality recipes |
| **Compose** | `/compose` | Multi-image transfer / edit with optional identity lock, regional edit, and gallery re-edit handoffs |
| **Workflow editor** | `/workflow-editor` | Edit Comfy API graphs (React Flow), save to library, queue |
| **Audio** | `/audio` | Stable Audio prompts + `{{AUDIO_SECONDS}}`; auto-creates a starter scaffold (replace with your pack graph when ready) |
| **3D Mesh** | `/mesh` | Hunyuan3D-style mesh prompts + optional reference image + `{{MESH_RESOLUTION}}`; auto-creates a starter scaffold |
| **Video** | `/video` | Motion/camera prompts for WAN / Hunyuan Video; optional init image + `{{VIDEO_FRAMES}}` / `{{VIDEO_FPS}}` / `{{INIT_IMAGE}}` for I2V workflows; auto-scaffold like Audio/Mesh |
| **Negative** | `/negative` | Sport-aware negative/preserve prompts for SD models |
| **Studio** | `/studio` | History, iteration tree, projects, compare, portfolio, campaign, analytics, catalog, templates |
| **Lint** | `/lint` | Paste prompts for diagnostics, fix, compact, reformat |
| **Refine** | `/refine` | Refine an existing prompt with image + intent hints |
| **Settings** | `/settings` | Sub-nav (Overview, LLM, ComfyUI, Automation, Data), health checks, `.env.local` catalog, webhooks, backup |
| **Gallery** | `/gallery` | Stats dashboard, grid/dense/list layouts, review focus, compare modal, semantic search |
| **Variations** | `/variations` | Roll N prompt variations and batch-queue to ComfyUI |
| **ControlNet** | `/controlnet` | Structure prompts (text or image-assisted) |
| **Plugins** | `/plugins` | Installable plugin manifests (nav + queue mutators + custom tool pages) |

Legacy URLs `/duo` and `/random-scene` redirect to Character and Generate. Character’s scene-compose mode lives at `/character?mode=compose`. `/compose` is the multi-image Compose / Transfer tool.

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
- **User accounts & feature ACL** — optional login with default admin, groups, per-user/per-group blocked features, **viewer** role (Dashboard/Gallery/Studio only), per-user ComfyUI URL override, and per-user/group API quotas (Settings → Users). When auth is enabled, prompt history and gallery are scoped per user in the browser; analytics snapshots sync to the server for admin review. **Profile** page for password change, export toggle, and scheduled campaign settings.
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
- **Workflow takeover** — at queue time the app can auto-bind placeholders, patch latents/loaders/samplers, insert FLUX sampling nodes, and upscale outputs; see [Workflow takeover](#workflow-takeover) below
- **Queue quality profiles** — sidebar Draft / Final / Max profiles adjust sampler tier, resolution, and optional Lanczos upscale; per-tool overrides in Settings; gallery stores and re-queues with stored profile
- **Gallery tools** — favorites, status/tool filters, image download, and sidecar JSON export per entry
- **Variation grid** — `/variations` rolls N prompt variations and batch-queues them with unique ComfyUI seeds
- **Completion notifications** — optional browser notifications when ComfyUI jobs finish (Settings)
- **Backup v2** — export/import includes ComfyUI settings, gallery entries, and imported workflow JSON files
- **Re-queue** — gallery entries and Studio history can be sent to ComfyUI again (same params, new seed, upscale same image, or new variation at Final/Max quality)
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
- **Preview workflow** — dry-run before queue on Generate, Character, Format, Lint, Refine, Image→Prompt, Negative, ControlNet, Video, and other result panels using the shared export pipeline
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
- **Regional prompt composer** — Character tool merges labeled subject/background/lighting text segments (prompt text only — not ComfyUI regional/attention-mask nodes)
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
- **Server storage sync** — optional `PROMPT_DATA_DIR` file-backed namespaces via `/api/storage`; per-user paths when logged in
- **Admin tools** — audit log, user impersonation, shared read-only preset library, analytics trends over time
- **Command palette** — `Ctrl+K` / `⌘K` quick navigation across tools
- **Auto storage sync** — pull on login when browser is empty; conflict merge UI when local/server diverge
- **Per-user API keys** — `pt_…` tokens for CLI/inbound hooks with user quotas
- **Vision gallery review** — AI-suggested rating, tags, and critique in review mode
- **LLM usage dashboard** — per-user call/token stats in Settings → Advanced
- **Central job queue** — `/queue` page for pending ComfyUI jobs
- **Shared projects** — admin assigns group-scoped projects via `/api/shared-projects`
- **Style transplant** — Studio → Experiments applies lighting/camera mood from one prompt to another
- **Duplicate detection** — Studio → Experiments finds near-identical history clusters
- **Session management** — list/revoke sessions on Profile
- **Workflow diff** — Settings compares two workflow JSON files
- **Multi-ComfyUI pool** — `COMFYUI_POOL` env for round-robin routing
- **ELO tournament** — bracket compare mode in gallery compare
- **Inbound webhooks** — `POST /api/hooks/generate` with user API key or `INBOUND_WEBHOOK_SECRET`
- **TOTP 2FA** — optional authenticator setup on Profile
- **Encrypted exports** — `POST /api/storage/export` with optional passphrase
- **Onboarding checklist** — Dashboard getting-started steps
- **Gallery PWA** — optional service worker (`sw-gallery.js`) caches `/api/comfyui/view` image responses for faster revisits; does not cache gallery HTML/RSC or provide full offline app mode
- **Keyboard shortcut editor** — customize bindings on Profile
- **Prompt brief** — export/import portable prompt bundles from Studio Presets
- **Webhook templates** — Discord/Slack rich payload formats in Settings
- **Mobile gallery review** — touch-friendly rating bar in gallery review mode
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
- **VRAM-aware Max → Final** — when free VRAM is under ~6 GB, Max queues downgrade to Final (status chip + gallery enhance)
- **Hold Max until idle** — optional park for Max Generate / re-queue / Upscale / Moiré / Refine / batches until ComfyUI is empty; flush from Orchestration
- **Sampler memory** — 4–5★ gallery ratings remember per-model CFG/steps/sampler/scheduler (Settings → Sampler memory)
- **Server storage pull** — Settings advanced panel restores server namespaces into the app database
- **IP-Adapter multi-ref merge** — Image tool roles + per-reference strength influence (`/api/image-prompt/multi`). This is a **prompt-merge** tool: reference images are described by a vision LLM and blended into the text prompt — no ComfyUI IP-Adapter nodes involved.
- **Portable IP-Adapter identity** — Settings → ComfyUI → "IP-Adapter identity reference" sets a session-wide reference image/strength/optional model. At queue time the app patches existing `{{IPADAPTER_*}}` tokens/nodes **or auto-inserts** a minimal IPAdapter chain (requires ComfyUI-IPAdapter-Plus-class nodes). InstantID / PuLID are bring-your-own workflows — use the multi-ref merge above when you only need text blending.
- **Character identity bundles with saved list** — Studio → Character identity bundles now also saves to a browser-local list (descriptor, LoRA trigger phrases, IP-Adapter ref) alongside the existing JSON export/import, for quick apply without a file round-trip.
- **ControlNet from image** — upload reference for vision-assisted structure extraction on `/controlnet`
- **Token / weight inspector** — `(tag:1.2)` analysis on Lint, Format, and result panels
- **Low-rating refine loop** — 1–2★ gallery ratings open Refine with corrective intent automatically
- **Campaign templates** — save/load campaign recipes on Studio Campaign tab
- **Portfolio diff export** — cross-model Markdown/HTML diff from Studio Portfolio tab
- **Observability dashboard** — Settings advanced panel shows API volume, errors, and slow routes
- **Best-of-N vision campaigns** — scheduled profile campaigns optionally rank N variants with vision LLM before queue
- **Global search** — command palette (`Ctrl+K` / `Ctrl+Shift+K`) searches history, gallery, and scene presets
- **Auto-push storage** — history and gallery saves debounce-push to server when storage sync is enabled
- **Ambient background** — subtle animated orbs; intensity toggle on Profile → Appearance
- **Light theme** — Profile → Appearance switches dark/light tokens
- **Notification center** — in-app alerts bell in sidebar when jobs complete
- **Gallery review auto-advance** — optional jump to next unreviewed item after rating
- **Gallery vision tags** — auto-tag completed outputs; filter by “Vision tags” and click chips to search
- **Fullscreen slideshow** — gallery filter bar starts immersive slideshow with keyboard controls
- **Encrypted server export** — Settings → Advanced exports signed-in user data with optional passphrase
- **Queue upgrades** — `/queue` shows ComfyUI queue stats, failed jobs, and bulk retry
- **Prompt recipes** — Settings → Advanced chains lint/fix/compact/queue steps
- **Model recommender** — Generate sidebar suggests models from prompt text (`/api/models/recommend`)
- **Negative prompt learner** — learns tokens from low gallery ratings; Settings → Advanced
- **Same-seed shootout** — queue one prompt across models with identical seed (Settings → Advanced)
- **Full user backup** — Profile downloads/restores complete local studio backup JSON
- **Multi-tab sync** — BroadcastChannel refreshes gallery/history across open tabs
- **Shared projects UI** — admin CRUD in Settings → Users; adopt in Studio → Projects
- **Email notifications** — SMTP alerts for batch/campaign completion and password changes (Profile → Email)
- **Workflow node auto-map** — suggested positive/negative bindings while editing workflow JSON
- **Video prompt builder** — `/video` + `wan-video` / `hunyuan-video` model profiles
- **Project bundles** — export/import project history + gallery JSON from Studio Projects tab
- **Aesthetic scoring** — heuristic gallery score on cards; `POST /api/aesthetic/score` for snapshots
- **PWA manifest** — installable web app metadata (`manifest.json`); gallery service worker is optional and separate from Next.js dev HMR
- **Plugin registry** — `/plugins` lists built-in tools and accepts custom localStorage **nav bookmarks** (not a runnable plugin runtime)

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

### First-run setup (new installs)

1. Copy `.env.example` → `.env.local` and set `COMFYUI_API_URL`, `LLM_MODEL`, and ideally `LLM_VISION_MODEL` (e.g. `qwen3-vl:latest` for Image → Prompt).
2. Open the app — pick a workspace density, then **Heal & ready** (also under Settings → Overview).
3. That enables **system workflows**, adapts loader maps from ComfyUI when reachable, and checks LLM + Comfy health.
4. Open **Generate**, create a prompt, and **Send to ComfyUI**.

The Dashboard checklist deep-links each remaining step. A connection chip in the sidebar shows LLM / Comfy status at a glance.

### Security notes

This app is designed for a **trusted local / LAN** setup. By default the HTTP API is open (CORS `*`) so ComfyUI custom nodes and CLI tools can call it.

When exposing beyond localhost:

1. Set `PROMPT_AUTH_ENABLED=true` (or create users under `PROMPT_DATA_DIR/auth/`) and sign in — default admin username/password come from `PROMPT_ADMIN_USERNAME` / `PROMPT_ADMIN_PASSWORD` (defaults: `admin` / `admin`; change immediately).
2. Set `PROMPT_API_TOKEN` — cross-origin and non-browser clients must send `Authorization: Bearer <token>` (same-origin UI still works). ComfyUI nodes read the same token from `PROMPT_API_TOKEN`. Service tokens bypass user login but should be kept secret.
3. Set `COMFYUI_ALLOW_CLIENT_URL=false` so callers cannot override the ComfyUI base URL (SSRF).
4. Prefer binding to loopback (`127.0.0.1`) — `docker-compose.yml` already does this.
5. Webhook dispatch blocks private/metadata URLs unless `WEBHOOK_ALLOW_PRIVATE=true`.

### Production checklist

Before exposing Prompt Studio beyond a trusted LAN:

- [ ] Set strong `PROMPT_ADMIN_PASSWORD` and rotate after first login
- [ ] Set `PROMPT_SESSION_SECRET` (long random string; do not reuse API tokens)
- [ ] Enable `PROMPT_AUTH_ENABLED=true` and create non-admin users with blocked features as needed
- [ ] Set `PROMPT_API_TOKEN` for CLI/ComfyUI nodes; issue per-user `pt_…` keys from Profile when sharing access
- [ ] Configure SMTP for password reset and batch/campaign email (`SMTP_*` in `.env.local`)
- [ ] Set `COMFYUI_ALLOW_CLIENT_URL=false` and pin `COMFYUI_API_URL` or `COMFYUI_POOL`
- [ ] Back up `PROMPT_DATA_DIR` (auth, analytics, storage sync) on a schedule
- [ ] Run `npm run lint`, `npm test`, and `npm run test:e2e` before deploy (CI runs these on push)
- [ ] For Playwright with auth enabled locally, credentials load from `.env.local` (`PROMPT_ADMIN_*`) or set `PROMPT_E2E_USERNAME` / `PROMPT_E2E_PASSWORD`

**Batch tools:** Topics and Variations show per-row readiness scores; toggle **Ready only** before queueing. Workflow library **Apply bindings** injects `{{POSITIVE}}` / `{{NEGATIVE}}` placeholders from suggested node maps. Gallery **Tag untagged** backfills vision tags on completed entries.

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

## Workflow takeover

Community ComfyUI workflows rarely match this app’s model picker, sampler defaults, or edit/inpaint image inputs out of the box. **Workflow takeover** applies a consistent queue-time pipeline so imported JSON behaves like a first-class template:

```
Target model + tool → resolveRuntimeForQueue
  → resolveQueueParams (quality profile, checkpoint/upscale maps)
  → optimizeWorkflowForQueue (auto-bind placeholders)
  → enrichWorkflowGraph (ModelSamplingFlux, Lanczos upscale on Final/Max)
  → injectPromptsWithFallbacks (tokens + direct patch + KSampler patch)
  → POST /api/comfyui → gallery entry (stores queueParams + queueQualityProfile)
```

### Placeholders

Standard tokens: `{{POSITIVE}}`, `{{NEGATIVE}}`, `{{SEED}}`, `{{WIDTH}}`, `{{HEIGHT}}`, `{{CFG}}`, `{{STEPS}}`, `{{DENOISE}}`, `{{INPUT_IMAGE}}`, `{{MASK_IMAGE}}`.

Video tokens (WAN Video / Hunyuan Video, patched from the **Video** tool's optional init image + frames/FPS fields):

| Token | Typical target |
|-------|-----------------|
| `{{INIT_IMAGE}}` | `LoadImage` feeding an I2V node's start-frame input — resolves to the same uploaded/fetched filename as `{{INPUT_IMAGE}}` |
| `{{VIDEO_FRAMES}}` | Frame count / length, e.g. `EmptyHunyuanLatentVideo.length` |
| `{{VIDEO_FPS}}` | Output frame rate, e.g. `SaveAnimatedWEBP.fps` |

These are only injected when the Video tool has a value for that field — add them to your library workflow's nodes and they'll be patched at queue time like any other placeholder. **Scaffold for model** in the workflow library builds a starter WAN/Hunyuan Video graph with all three wired in when `wan-video` / `hunyuan-video` is the selected model.

Loader / upscale tokens (patched directly even when placeholders are missing, when **Direct workflow patching** is enabled):

| Token | Settings source |
|-------|-----------------|
| `{{CHECKPOINT}}` | **Settings → Checkpoint map** (also sets UNET when no separate UNET map) |
| `{{UNET}}` | Checkpoint map, registry hints (FLUX Klein), or custom tokens |
| `{{VAE}}` | **VAE map**, category defaults (`flux2-vae.safetensors` for FLUX), or custom tokens |
| `{{UPSCALE_MODEL}}` | **Upscale model map** (optional) — neural UpscaleModel on Final/Max when set; otherwise Lanczos upscale |

Loader placeholders are replaced at queue time via token injection and direct patching. Use **Settings → Merge suggested loader maps** to fill checkpoint/VAE/refiner defaults for common models (your entries win). If ComfyUI reports `value_not_in_list` for `{{UNET}}` or `{{VAE}}`, add the exact filename from the error’s allowed list to the checkpoint or VAE map.

Use **Optimize & save copy** in the workflow library to persist auto-bound placeholders on community JSON.

### Queue quality profiles

| Profile | Effect |
|---------|--------|
| **Follow sidebar** | Uses your sampler preset + resolution tier from Settings |
| **Draft** | Faster sampler tier, smaller resolution |
| **Final** | Optimized sampler, medium+ resolution, SDXL refiner pass (latent upscale), optional neural UpscaleModel or 1.25× Lanczos before SaveImage |
| **Max** | Max-quality sampler/resolution, SDXL refiner at higher denoise, neural upscale + 1.05× Lanczos polish (sharpen off by default) |

Loader precision: queue injection detects **fp8 vs bf16** from existing workflow loaders and resolves `{{UNET}}`/`{{CHECKPOINT}}` to the matching tier (defaults to bf16 when unknown).

- Sidebar chips on each tool page override the global default for that session.
- **Settings → Per-tool queue quality** sets persistent overrides (Generate, Variations, Refine, etc.).
- Gallery entries store the profile used at queue time; **Upscale (Final/Max)**, **New variation (Final/Max)**, and sidecar import restore or override it. Derived entries record lineage (`upscaled from prior`, etc.).

### Settings toggles (Workflow patching & checkpoints)

| Toggle | Purpose |
|--------|---------|
| Direct workflow patching | Patch `EmptyLatentImage`, loaders, LoadImage/Mask, UpscaleModel without placeholders |
| Optimize workflows on queue | Auto-bind missing placeholders before injection |
| Insert model-sampling nodes | Add `ModelSamplingFlux` / shift nodes when loader → KSampler is direct |
| Auto improve on 4–5★ | Final-quality improve: upscale (same pixels); Rapid AIO → moiré clean; Lightning → re-queue new seed (on by default). When enabled, mutate/seed-experiment toggles only run if this path fails or is off |
| Auto improve on 5★ | Max-quality improve (same model-aware paths as above; neural upscale falls back to Lanczos when the mapped file is missing) |
| Auto img2img refine on 5★ | Optional low-denoise refine after 5★ upscale (experimental, off by default; skipped for Lightning and Rapid AIO) |
| Subtle sharpen after upscale (Max) | Optional ImageSharpen — off by default to avoid waxy skin |
| WebSocket progress | On by default — faster gallery job status via ComfyUI WebSocket |

Gallery **5★** auto-improve is model-aware: standard models upscale, Rapid AIO runs moiré clean, Lightning re-queues a Final/Max seed. Set an upscale model map entry only when that file exists in ComfyUI; missing entries fall back to Lanczos automatically.

Use **Optimize all in library** (Settings → workflow library) after importing community JSON so placeholders bind to your checkpoint/VAE filenames.

Gallery card menus separate **Upscale** (same pixels), **Refine** (low-denoise img2img), **Clean moiré** (Rapid AIO), and **New variation** (new seed). Bulk actions from multi-select → Queue adapt labels to the selection.

Preflight and **Workflow configuration** on gallery entries show unresolved tokens and the stored/effective params.

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
| `PROMPT_DATA_DIR` | _(empty)_ | Server file storage root for `/api/storage` and auth data |
| `SERVER_USER_MAINTENANCE` | `false` | Enable `/api/maintenance/run` for per-user scheduled campaigns and export snapshots |
| `SERVER_USER_MAINTENANCE_INTERVAL_MIN` | `15` | When `SERVER_USER_MAINTENANCE=true`, run maintenance on this interval (minutes) |
| `API_RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) for API proxy |
| `API_RATE_LIMIT_MAX` | `120` | Default max requests per window; overridable per user/group in Settings → Users |
| `COMFYUI_API_URL` | `http://127.0.0.1:8188` | Default ComfyUI base URL |
| `COMFYUI_ROOT` | _(empty)_ | Absolute path to the ComfyUI install (same machine). Enables **Settings → ComfyUI → Model assets** curated weight downloads into `models/checkpoints`, `diffusion_models`, `vae`, etc. |
| `HF_TOKEN` | _(empty)_ | Optional Hugging Face token for curated downloads (also accepts `HUGGING_FACE_HUB_TOKEN`) |
| `COMFYUI_ALLOW_CLIENT_URL` | `true` | Allow clients to override ComfyUI URL |
| `COMFYUI_ALLOWED_HOSTS` | _(empty)_ | Optional comma-separated ComfyUI host allowlist |
| `WEBHOOK_ALLOW_PRIVATE` | `false` | Allow webhook POSTs to private/LAN URLs |
| `PROMPT_EMAIL_ENABLED` | auto | Set `true` to force email on when SMTP is configured |
| `PROMPT_SMTP_HOST` | _(empty)_ | SMTP server hostname |
| `PROMPT_SMTP_PORT` | `587` | SMTP port |
| `PROMPT_SMTP_SECURE` | `false` | Use TLS directly (typical for port 465) |
| `PROMPT_SMTP_USER` | _(empty)_ | SMTP auth username |
| `PROMPT_SMTP_PASS` | _(empty)_ | SMTP auth password |
| `PROMPT_EMAIL_FROM` | _(empty)_ | From header, e.g. `Prompt Studio <noreply@example.com>` |
| `PROMPT_ADMIN_EMAIL` | _(empty)_ | Fallback recipient for server batches when users have no email |
| `PROMPT_EMAIL_NOTIFY_BATCH` | `true` | Send email when scheduled batches/campaigns finish |
| `PROMPT_EMAIL_NOTIFY_PASSWORD` | `true` | Send email when a password is changed |

**Password reset:** With auth and SMTP enabled, `POST /api/email/forgot-password` sends a link to `/login?reset=…`. Users complete reset via `POST /api/auth/reset-password`.

**Queue interrupt:** `POST /api/comfyui/interrupt` forwards an interrupt to ComfyUI (also available on the Queue page).

**Webhooks → email:** Outbound webhooks fire on job completion/error. When signed in with batch email notifications enabled, the gallery client also batches completion emails via `POST /api/email/jobs-completed` (debounced ~8s). Server scheduled batches use `POST /api/email/batch-completed`.

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

## License

[MIT](./LICENSE) © 2026 Robert McDowell. Third-party model weights you download (e.g. via Hugging Face) remain under their own licenses.
