# Configuration & deployment

Environment variables, security, production checklist, and Docker.

## Security notes

This app is designed for a **trusted local / LAN** setup. By default the HTTP API is open (CORS `*`) so ComfyUI custom nodes and CLI tools can call it.

When exposing beyond localhost:

1. Set `PROMPT_AUTH_ENABLED=true` (or create users under `PROMPT_DATA_DIR/auth/`) and sign in — default admin username/password come from `PROMPT_ADMIN_USERNAME` / `PROMPT_ADMIN_PASSWORD` (defaults: `admin` / `admin`; change immediately).
2. Set `PROMPT_API_TOKEN` — cross-origin and non-browser clients must send `Authorization: Bearer <token>` (same-origin UI still works). ComfyUI nodes read the same token from `PROMPT_API_TOKEN`. Service tokens bypass user login but should be kept secret.
3. Set `COMFYUI_ALLOW_CLIENT_URL=false` so callers cannot override the ComfyUI base URL (SSRF).
4. Prefer binding to loopback (`127.0.0.1`) — `docker-compose.yml` already does this.
5. Webhook dispatch blocks private/metadata URLs unless `WEBHOOK_ALLOW_PRIVATE=true`.

## Production checklist

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

## LLM configuration

The generator calls any **OpenAI-compatible** chat completions API. Configure via `.env.local`:

| Variable                               | Default                         | Description                                                                                                                                                                            |
| -------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_API_BASE_URL`                     | `http://localhost:11434/v1`     | API base URL                                                                                                                                                                           |
| `LLM_API_KEY`                          | _(empty)_                       | Bearer token if required                                                                                                                                                               |
| `LLM_MODEL`                            | `dolphin-llama3`                | Model name                                                                                                                                                                             |
| `LLM_TEMPERATURE`                      | `0.95`                          | Sampling temperature (higher = more variation)                                                                                                                                         |
| `LLM_ENABLED`                          | `true`                          | Set `false` for template-only mode                                                                                                                                                     |
| `ALLOW_TEMPLATE_FALLBACK`              | `true`                          | Fall back if LLM is unreachable                                                                                                                                                        |
| `PROMPT_API_TOKEN`                     | _(empty)_                       | Optional API bearer token for non-browser clients                                                                                                                                      |
| `PROMPT_AUTH_ENABLED`                  | `false`                         | Enable login and feature access control                                                                                                                                                |
| `PROMPT_ADMIN_USERNAME`                | `admin`                         | Default admin username (seeded on first enable)                                                                                                                                        |
| `PROMPT_ADMIN_PASSWORD`                | `admin`                         | Default admin password (change in production)                                                                                                                                          |
| `PROMPT_SESSION_SECRET`                | _(falls back to API token)_     | HMAC secret for session cookies                                                                                                                                                        |
| `PROMPT_AUTH_DIR`                      | _(uses `PROMPT_DATA_DIR/auth`)_ | Directory for `users.json`, `groups.json`, and `analytics-snapshots.json`                                                                                                              |
| `PROMPT_DATA_DIR`                      | _(empty)_                       | Server file storage root for `/api/storage` and auth data                                                                                                                              |
| `SERVER_USER_MAINTENANCE`              | `false`                         | Enable `/api/maintenance/run` for per-user scheduled campaigns and export snapshots                                                                                                    |
| `SERVER_USER_MAINTENANCE_INTERVAL_MIN` | `15`                            | When `SERVER_USER_MAINTENANCE=true`, run maintenance on this interval (minutes)                                                                                                        |
| `API_RATE_LIMIT_WINDOW_MS`             | `60000`                         | Rate limit window (ms) for API proxy                                                                                                                                                   |
| `API_RATE_LIMIT_MAX`                   | `120`                           | Default max requests per window; overridable per user/group in Settings → Users                                                                                                        |
| `COMFYUI_API_URL`                      | `http://127.0.0.1:8188`         | Default ComfyUI base URL                                                                                                                                                               |
| `COMFYUI_ROOT`                         | _(empty)_                       | Absolute path to the ComfyUI install (same machine). Enables **Settings → ComfyUI → Model assets** curated weight downloads into `models/checkpoints`, `diffusion_models`, `vae`, etc. |
| `HF_TOKEN`                             | _(empty)_                       | Optional Hugging Face token for curated downloads (also accepts `HUGGING_FACE_HUB_TOKEN`)                                                                                              |
| `COMFYUI_ALLOW_CLIENT_URL`             | `true`                          | Allow clients to override ComfyUI URL                                                                                                                                                  |
| `COMFYUI_ALLOWED_HOSTS`                | _(empty)_                       | Optional comma-separated ComfyUI host allowlist                                                                                                                                        |
| `WEBHOOK_ALLOW_PRIVATE`                | `false`                         | Allow webhook POSTs to private/LAN URLs                                                                                                                                                |
| `PROMPT_EMAIL_ENABLED`                 | auto                            | Set `true` to force email on when SMTP is configured                                                                                                                                   |
| `PROMPT_SMTP_HOST`                     | _(empty)_                       | SMTP server hostname                                                                                                                                                                   |
| `PROMPT_SMTP_PORT`                     | `587`                           | SMTP port                                                                                                                                                                              |
| `PROMPT_SMTP_SECURE`                   | `false`                         | Use TLS directly (typical for port 465)                                                                                                                                                |
| `PROMPT_SMTP_USER`                     | _(empty)_                       | SMTP auth username                                                                                                                                                                     |
| `PROMPT_SMTP_PASS`                     | _(empty)_                       | SMTP auth password                                                                                                                                                                     |
| `PROMPT_EMAIL_FROM`                    | _(empty)_                       | From header, e.g. `Prompt Studio <noreply@example.com>`                                                                                                                                |
| `PROMPT_ADMIN_EMAIL`                   | _(empty)_                       | Fallback recipient for server batches when users have no email                                                                                                                         |
| `PROMPT_EMAIL_NOTIFY_BATCH`            | `true`                          | Send email when scheduled batches/campaigns finish                                                                                                                                     |
| `PROMPT_EMAIL_NOTIFY_PASSWORD`         | `true`                          | Send email when a password is changed                                                                                                                                                  |

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
