# Operator guide

Stand up Prompt Studio, add a second ComfyUI box, move a studio to a new machine, and invite users. Product features live in [features.md](features.md); env names and production hardening live in [configuration.md](configuration.md).

Jump to: [First launch](#first-launch) · [Settings map](#settings-map) · [Second GPU](#second-gpu) · [New machine](#new-machine) · [Auth and mail](#auth-and-mail) · [Cluster behavior](#cluster-behavior) · [What stays in env](#what-stays-in-env)

---

## First launch

Requires **Node.js 22+**.

```bash
npm install
cp .env.example .env.local
# Set at least:
#   COMFYUI_API_URL=http://127.0.0.1:8188
#   LLM_MODEL=…
#   LLM_VISION_MODEL=…   # required for Image → Prompt, Refine critique, gallery tags
npm run dev
```

Open [http://localhost:47832](http://localhost:47832) → **Settings → Overview**.

1. Click **Heal & ready**. That enables system workflows, merges suggested loader maps, adapts from ComfyUI inventory when reachable, installs missing custom-node packs via ComfyUI-Manager on each pool host (then restarts those hosts), and refreshes health.
2. Confirm the heal checklist: LLM, ComfyUI, vision model, `PROMPT_DATA_DIR`, auth, SMTP.
3. Generate a prompt on **Generate**, then **Send to ComfyUI**.

If vision tools fail, `LLM_VISION_MODEL` is unset or the model is text-only. Settings → LLM can override the session text model; the vision model still comes from env (or the LLM panel override when present).

---

## Settings map

| Tab            | Use it for                                                                             |
| -------------- | -------------------------------------------------------------------------------------- |
| **Overview**   | Heal & ready, health, `.env` catalog, **Export / Import backup**, collab backend       |
| **LLM**        | Session model override, template-only / force-on, embedding model override             |
| **ComfyUI**    | Connection, workflow map, model assets, cluster (extra hosts, load-balance, OOM retry) |
| **Automation** | Webhooks, avoided tokens, browser scheduled batch, **server** scheduled batch overlay  |
| **Data**       | Gallery snapshot, reliability, settings bundle, full studio backup, local reset        |
| **Users**      | SMTP overlay, accounts, groups, audit, **Invite by email**                             |

Profile (`/profile`) holds appearance, 2FA, sessions, personal email, and the same full backup/restore JSON.

---

## Second GPU {#second-gpu}

Settings extras can _list_ another ComfyUI URL. They cannot change the SSRF allowlist. Probe and queue still require the hostname on `COMFYUI_ALLOWED_HOSTS` when that list is set.

### Flow

1. Settings → ComfyUI → **ComfyUI cluster**.
2. Paste the new box, e.g. `http://192.168.1.20:8188`.
3. **Test**. The server only fetches the host if it is already allowlisted.
4. Copy the **New-box .env snippet** (`COMFYUI_POOL` + `COMFYUI_ALLOWED_HOSTS`).
5. Paste into `.env.local`, restart the Prompt Studio process, then **Test** again.
6. Optionally **Add host** so Settings extras keep the URL if you have not put it in `COMFYUI_POOL` yet. Env pool members still win as the durable source after restart.

If Test says the host is not on `COMFYUI_ALLOWED_HOSTS`, copy the snippet anyway — that is the expected first pass on a locked-down box.

### After it is up

- **Preferred pool host** pins gallery stills / sticky retry to one URL.
- **Load-balance** skips hosts at or above the busy threshold.
- **Retry on OOM or unreachable host** fails over to another pool member; optional quality downgrade on OOM.

---

## New machine {#new-machine}

Two layers of data. Export both if you care about a full move.

### Browser studio backup (one-click)

Settings → Overview (**Move to a new machine**) or Settings → Data or Profile.

- **Export backup** downloads `prompt-studio-backup-*.json` (backup **v5**).
- **Import backup** on the other browser, then **reload**.

v5 includes history, settings cache, gallery entries, ComfyUI settings and workflow JSON, projects, recipes, webhooks, avoided tokens, **and `extras`** (gallery ELO, saved views, appearance, keyboard shortcuts, plugin registry, and the rest of `studio-extras`). Older v1–v4 files still import; v4 now restores Comfy settings/gallery that were previously skipped.

This file is **local browser state**. It does not include server auth users, SMTP passwords, or files under `PROMPT_DATA_DIR`.

### Server data directory

Set `PROMPT_DATA_DIR` (absolute path) so settings, history, gallery, and extras sync to `{PROMPT_DATA_DIR}/studio.sqlite`. With auth on, each user’s namespaces are scoped inside that database. Leftover JSON files are imported once and renamed `*.json.imported`.

Also stored there when configured:

| File                      | Contents                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `studio.sqlite`           | Auth, gallery rows, settings/history/extras, SMTP overlay, collab rooms (copy `-wal` / `-shm` too if the app is running) |
| `users/{userId}/exports/` | Per-user export snapshots (still JSON files)                                                                             |
| `*.json.imported`         | One-shot leftovers from the pre-SQLite layout                                                                            |

Copy or snapshot `PROMPT_DATA_DIR` as part of host backups. Settings → Advanced can pull/push namespaces when storage is enabled.

---

## Auth and mail {#auth-and-mail}

### Enable accounts

```env
PROMPT_AUTH_ENABLED=true
PROMPT_ADMIN_USERNAME=admin
PROMPT_ADMIN_PASSWORD="change-me"
PROMPT_SESSION_SECRET=use-a-long-random-string
PROMPT_DATA_DIR=/var/lib/prompt-studio
PROMPT_API_URL=https://studio.example.com
```

Quote passwords that contain `$` or `#`. Restart after changing admin credentials — the bootstrap admin syncs from env on startup. Sign in at `/login`.

`PROMPT_API_URL` is the public origin used in **invite and password-reset links**. If it is unset, emails point at `http://127.0.0.1:47832`.

### SMTP

Env (`PROMPT_SMTP_*`, `PROMPT_EMAIL_FROM`) is the fallback. Settings → Users → **SMTP** writes an overlay in SQLite (or an in-memory overlay until restart if `PROMPT_DATA_DIR` is unset). Saving SMTP rebuilds the mailer so **Send test** uses the values you just saved.

1. Enable outbound mail, fill host/port/from, save.
2. **Send test** — defaults to your profile email; pass a recipient if auth is off.
3. Confirm the message arrives before inviting anyone.

### Invite a user

Settings → Users → **+ New user** → username + email → **Invite by email**.

- Creates the account with an unknown random password.
- Sends a branded email with `/login?reset=…` (valid **1 hour**).
- Existing users: **Send invite / reset email** (does not change their current password until they use the link).

Forgot password on `/login` uses the same mailer and token store.

Users can opt out of batch or security mail on their profile. Invites always send when SMTP is configured.

---

## Cluster behavior {#cluster-behavior}

At queue time the server merges:

1. `COMFYUI_POOL` (env, durable)
2. Settings `comfyPoolUrls` extras (browser / `settings-cache` sync)

Each extra URL is validated against `COMFYUI_ALLOWED_HOSTS` and dropped if it fails. Invalid extras do not abort the whole pool.

**Heal & ready** walks every pool URL (env + Settings extras + health endpoints): missing system-workflow node types are installed via ComfyUI-Manager, then that host is restarted and polled until `/system_stats` (via health) answers. A host without Manager is reported, not skipped silently. Gallery import and Queue orphan lists walk the same pool.

`COMFYUI_ALLOW_CLIENT_URL` and `COMFYUI_ALLOWED_HOSTS` are **env only**. The UI never writes them.

`POST /api/comfyui/probe` health-checks a URL only after allowlist normalization. An allowlist miss returns `code: "allowlist"` without fetching the host.

---

## What stays in env {#what-stays-in-env}

| Knob                                                                   | Why it is not a Settings toggle                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `COMFYUI_ALLOW_CLIENT_URL`                                             | SSRF: callers must not point the server at arbitrary URLs |
| `COMFYUI_ALLOWED_HOSTS`                                                | Same; the cluster panel copies a snippet instead          |
| `PROMPT_SESSION_SECRET` / `PROMPT_API_TOKEN` / `PROMPT_ADMIN_PASSWORD` | Secrets                                                   |
| `PROMPT_DATA_DIR`                                                      | Process-level filesystem root                             |

Settings **can** overlay: SMTP, queue-export directory, extra pool members, session LLM model, server scheduled-batch flags (still need `PROMPT_DATA_DIR` for headless persistence).

---

## Checklist (new install)

- [ ] `.env.local` from `.env.example`; ComfyUI + LLM + vision model
- [ ] Heal & ready is green
- [ ] `PROMPT_DATA_DIR` set if you want sync, SMTP persistence, or headless batch
- [ ] Auth on for anything beyond loopback; rotate admin password
- [ ] `PROMPT_API_URL` matches the URL in invite emails
- [ ] SMTP test succeeded before inviting
- [ ] Second GPU: snippet in env, restart, Test green
- [ ] Export a studio backup after the first real session
