# HTTP API

JSON REST API for scripts, ComfyUI nodes, and external integrations. Live catalog: `GET /api`.

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

| Endpoint            | Method | Purpose                                                                      |
| ------------------- | ------ | ---------------------------------------------------------------------------- |
| `/api`              | GET    | API catalog and schema documentation                                         |
| `/api/models`       | GET    | List models (`?category=`, `?id=`)                                           |
| `/api/generate`     | POST   | Keywords → model-ready prompt                                                |
| `/api/format`       | POST   | Existing draft → model-ready prompt                                          |
| `/api/topics`       | POST   | Seed theme (optional) → list of topic ideas                                  |
| `/api/random-scene` | POST   | Random cohesive scene prompt (also available via Generate → Random surprise) |
| `/api/character`    | POST   | Detailed single-person prompt                                                |
| `/api/background`   | POST   | People-free environment prompt                                               |
| `/api/image-prompt` | POST   | Image upload/base64 → prompt (vision LLM)                                    |

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
