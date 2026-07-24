# Diffusers engine (Prompt Studio)

Narrow **txt2img** FastAPI service used when Prompt Studio’s inference engine is set to Diffusers.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/health` | `{ ok, device, model, mock }` |
| GET | `/v1/models` | Local SDXL/SD1.5 checkpoints (skips Qwen/Flux/refiner) |
| POST | `/v1/txt2img` | Queue one job |
| GET | `/v1/jobs/{prompt_id}` | Status + images |
| GET | `/v1/view?filename=&subfolder=&type=` | Image bytes |
| POST | `/v1/upload` | Multipart input image |

Default listen URL: `http://127.0.0.1:8190`

## Quick start (mock, no GPU / no model download)

```bash
cd services/diffusers-engine
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn python-multipart pydantic Pillow
DIFFUSERS_MOCK=1 uvicorn app.main:app --host 127.0.0.1 --port 8190
```

## Real Diffusers (GPU recommended)

```bash
cd services/diffusers-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# Reuse Comfy checkpoints (e.g. sd_xl_base_1.0.safetensors) when HF cache is empty:
COMFYUI_ROOT=/opt/comfyui uvicorn app.main:app --host 127.0.0.1 --port 8190
```

With `COMFYUI_ROOT` set, a miss on Hugging Face will use local Comfy weights. Preferred order for studio/Flux aliases:

1. `RealVisXL_V5.0_fp16.safetensors` (photoreal finetune)
2. `sd_xl_base_1.0.safetensors`
3. Hub `stabilityai/sdxl-turbo`

Local SDXL defaults (best when Comfy is unloaded / restarted):

- **fp16** + `madebyollin/sdxl-vae-fp16-fix` (`force_upcast=False` — keeps color)
- **Full GPU residency** (no CPU offload)
- Prompts **fit to 77 CLIP tokens** before encode (stops the `241 > 77` truncation)
- Person jobs auto-attach hand + detail LoRAs when available
- Optional **SDXL refiner** pass (`sd_xl_refiner_1.0.safetensors`) after the base decode

```bash
# Share VRAM with a loaded ComfyUI:
DIFFUSERS_CPU_OFFLOAD=1

# Opt-in long prompts (VRAM heavy):
DIFFUSERS_LONG_PROMPT=1

# Optional LoRA override (comma-separated name[:weight]):
# DIFFUSERS_LORA="HandFineTuning_XL:0.7,Detail-Tweaker-XL:0.35"
```

For person prompts, Diffusers auto-attaches an SDXL hand LoRA (downloads once if missing) plus `Detail-Tweaker-XL` / `add-detail-xl` when those files exist under Comfy `models/loras`. Workshop roles (glassblower, blacksmith, etc.) force a head-and-shoulders crop and strip hand/tool stage directions from the Studio novel — SDXL still botches workshop grips when hands stay in frame. Studio Settings → Inference engine can force crop on/off via `workshop_crop` (`null` = auto). Default checkpoint is RealVisXL when Studio sends Flux/Qwen aliases.

## Env

| Variable | Default | Notes |
|----------|---------|-------|
| `DIFFUSERS_MOCK` | off | Solid-color PNG jobs (smoke / CI) |
| `DIFFUSERS_MODEL` | `stabilityai/sdxl-turbo` | HF model id (fallback) |
| `COMFYUI_ROOT` | auto | Searches `models/diffusers`, `checkpoints`, `diffusion_models`. Auto-detects `/opt/comfyui` and reads repo `.env.local` when unset. |
| `DIFFUSERS_MODEL_DIR` | unset | Extra local search root |
| `DIFFUSERS_LORA` | auto | Comma-separated `name[:weight]`; empty = person auto hand+detail |
| `DIFFUSERS_LORA_DIR` | unset | Extra LoRA search root (also `$COMFYUI_ROOT/models/loras`) |
| `DIFFUSERS_LORA_DOWNLOAD` | on | Fetch hand LoRA from HF on first person job |
| `DIFFUSERS_REFINER` | auto-on | SDXL img2img refine when `sd_xl_refiner_1.0` is present; set `0` to disable |
| `DIFFUSERS_REFINER_STRENGTH` | `0.18` | Img2img strength for the refiner pass (keep low to avoid limb warp) |
| `DIFFUSERS_REFINER_PATH` | auto | Override path to a refiner checkpoint |
| `DIFFUSERS_OUTPUT_DIR` | `./outputs` | Generated PNGs |
| `DIFFUSERS_INPUT_DIR` | `./inputs` | Uploads |
| `DIFFUSERS_ENGINE_URL` | `http://127.0.0.1:8190` | Returned as `engine_url` |

### Model resolution order

1. Explicit filesystem path  
2. Local folders (`DIFFUSERS_MODEL_DIR`, then `$COMFYUI_ROOT/models/{diffusers,checkpoints,diffusion_models,unet}`)  
3. Hugging Face hub id  
4. If hub/single-file load fails → try local `sd_xl_base_1.0.safetensors` under Comfy checkpoints  

Studio model ids like `sdxl` / `flux` are aliased to likely Comfy filenames. Flux/Qwen single files often are not Diffusers-compatible; those fall back to SDXL when present.

## Studio wiring

1. Set `DIFFUSERS_API_URL=http://127.0.0.1:8190` in `.env.local` (server proxy).
2. In Settings → **Inference engine**, choose Diffusers (and optionally set the Diffusers URL).
3. Queue from Generate — jobs go through `/api/diffusers/*` → this service.
