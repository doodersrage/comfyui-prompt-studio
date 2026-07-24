from __future__ import annotations

import math
import os
import re
import threading
import warnings
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from app.asset_inventory import (
    default_flux_txt2img_stack,
    default_qwen_txt2img_stack,
    infer_native_family,
)
from app.lora_resolve import lora_cache_key, resolve_loras
from app.model_resolve import (
    ResolvedModel,
    describe_search_paths,
    resolve_model,
    resolve_sdxl_refiner,
)
from app.prompt_encode import (
    encode_sdxl_prompts,
    prompt_is_workshop_role,
    prompt_wants_person,
)
from app.sampling import plan_sampling


def _person_portrait_canvas(prompt: str, width: int, height: int) -> tuple[int, int]:
    """Full-body people on 1:1 latents stretch — nudge square → ~3:4, keep area."""
    if height <= 0 or width <= 0:
        return width, height
    if not prompt_wants_person(prompt):
        return width, height
    ratio = width / float(height)
    if ratio < 0.92 or ratio > 1.08:
        return width, height
    area = float(width * height)
    new_h = max(64, int(round(math.sqrt(area * 4.0 / 3.0) / 16.0) * 16))
    new_w = max(64, int(round(math.sqrt(area * 3.0 / 4.0) / 16.0) * 16))
    if (new_w, new_h) != (width, height):
        print(
            f"[diffusers] person+square canvas {width}x{height} → {new_w}x{new_h}",
            flush=True,
        )
    return new_w, new_h


def _qwen_lora_haystack(loras: list[tuple[str, float]]) -> str:
    return " ".join(Path(path).name.lower() for path, _ in loras)


def _qwen_loras_are_lightning(loras: list[tuple[str, float]]) -> bool:
    hay = _qwen_lora_haystack(loras)
    return "lightning" in hay or "lightx2v" in hay


def _qwen_path_is_lightning(model_path: str) -> bool:
    return "lightning" in Path(model_path).name.lower()


def _lightning_step_target(loras: list[tuple[str, float]], steps: int) -> int:
    hay = _qwen_lora_haystack(loras)
    if "4step" in hay or "4-step" in hay or "4_step" in hay:
        return 4
    if "8step" in hay or "8-step" in hay or "8_step" in hay:
        return 8
    if steps in (4, 8):
        return steps
    return 8


_ENGINE_ROOT = Path(__file__).resolve().parents[1]
_FLUX2_KLEIN_9B_CONFIG = _ENGINE_ROOT / "configs" / "flux2-klein-9b"
_FLUX2_KLEIN_4B_CONFIG = _ENGINE_ROOT / "configs" / "flux2-klein-4b"
_FLUX2_VAE_CONFIG = _ENGINE_ROOT / "configs" / "flux2-vae" / "config.json"
_QWEN3_CHAT_TEMPLATE = _ENGINE_ROOT / "configs" / "qwen3_chat_template.jinja"


def _flux2_klein_config_dir(unet_label: str) -> Path:
    """Local Diffusers config repo for Klein — avoids gated FLUX.2-dev hub lookup."""
    token = unet_label.lower().replace("_", "-")
    if "4b" in token:
        path = _FLUX2_KLEIN_4B_CONFIG
    else:
        path = _FLUX2_KLEIN_9B_CONFIG
    if not (path / "transformer" / "config.json").is_file():
        raise FileNotFoundError(
            f"Missing local Flux2-Klein config at {path / 'transformer' / 'config.json'}"
        )
    return path


def _ensure_qwen3_chat_template(tokenizer: Any) -> Any:
    """Flux2KleinPipeline requires apply_chat_template(enable_thinking=False)."""
    if getattr(tokenizer, "chat_template", None):
        return tokenizer
    if _QWEN3_CHAT_TEMPLATE.is_file():
        tokenizer.chat_template = _QWEN3_CHAT_TEMPLATE.read_text(encoding="utf-8")
    else:
        tokenizer.chat_template = (
            "{%- for message in messages %}"
            "{{- '<|im_start|>' + message['role'] + '\\n' + message['content'] + '<|im_end|>' + '\\n' }}"
            "{%- endfor %}"
            "{%- if add_generation_prompt %}"
            "{{- '<|im_start|>assistant\\n' }}"
            "{%- if enable_thinking is defined and enable_thinking is false %}"
            "{{- '<think>\\n\\n</think>\\n\\n' }}"
            "{%- endif %}"
            "{%- endif %}"
        )
    print("[diffusers] Qwen3 tokenizer chat_template installed (local)", flush=True)
    return tokenizer


def _load_qwen3_tokenizer_for_flux(clip_name: str | None) -> Any:
    """Load Qwen3 tokenizer matched to TE size; ensure chat_template is present."""
    from transformers import AutoTokenizer

    name = (clip_name or "").lower()
    if "4b" in name:
        hub_id = "Qwen/Qwen3-4B"
    elif "klein" in name or "8b" in name:
        hub_id = "Qwen/Qwen3-8B"
    else:
        hub_id = "Qwen/Qwen3-8B"
    # Prefer size match; fall back across sizes for incomplete local caches.
    candidates = [hub_id, "Qwen/Qwen3-4B", "Qwen/Qwen3-8B"]
    seen: set[str] = set()
    last_error: Exception | None = None
    for repo in candidates:
        if repo in seen:
            continue
        seen.add(repo)
        try:
            tokenizer = AutoTokenizer.from_pretrained(repo, local_files_only=True)
            return _ensure_qwen3_chat_template(tokenizer)
        except Exception as exc:
            last_error = exc
            continue
    for repo in seen:
        try:
            tokenizer = AutoTokenizer.from_pretrained(repo)
            return _ensure_qwen3_chat_template(tokenizer)
        except Exception as exc:
            last_error = exc
            continue
    raise RuntimeError(
        f"Failed to load Qwen3 tokenizer for Flux2-Klein ({clip_name}). "
        f"Last error: {last_error}"
    )


def _load_flux2_vae_local(vae_path: str | Path, dtype: Any) -> Any:
    """Load drop-in flux2-vae without hitting gated FLUX.2-dev config download."""
    from diffusers import AutoencoderKLFlux2
    from safetensors.torch import load_file

    if _FLUX2_VAE_CONFIG.is_file():
        vae = AutoencoderKLFlux2.from_config(str(_FLUX2_VAE_CONFIG))
    else:
        vae = AutoencoderKLFlux2()
    state = load_file(str(vae_path))
    missing, unexpected = vae.load_state_dict(state, strict=False)
    if missing:
        raise RuntimeError(
            f"Flux2 VAE load missing {len(missing)} keys (e.g. {missing[:3]})"
        )
    if unexpected:
        print(
            f"[diffusers] Flux2 VAE ignored {len(unexpected)} unexpected keys",
            flush=True,
        )
    try:
        vae.to(dtype=dtype)
    except Exception:
        pass
    return vae


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def env_flag_default_on(name: str) -> bool:
    """True unless explicitly disabled (0/false/no/off)."""
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return True
    return str(raw).strip().lower() not in ("0", "false", "no", "off")


@contextmanager
def _silence_model_warnings() -> Iterator[None]:
    """Hide known-noisy load/cast warnings that don't affect quality."""
    import logging

    # Diffusers often emits these via logging, not warnings.warn.
    noisy_loggers = (
        "diffusers",
        "diffusers.pipelines.pipeline_utils",
        "diffusers.models.modeling_utils",
        "transformers",
        "huggingface_hub",
    )
    previous_levels = {
        name: logging.getLogger(name).level for name in noisy_loggers
    }
    for name in noisy_loggers:
        logging.getLogger(name).setLevel(logging.ERROR)
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message=r".*should be kept in float32.*")
            warnings.filterwarnings(
                "ignore",
                message=r".*local_dir_use_symlinks.*",
            )
            warnings.filterwarnings(
                "ignore",
                message=r".*Siglip2ImageProcessorFast.*",
            )
            warnings.filterwarnings(
                "ignore",
                message=r".*clean_up_tokenization_spaces.*",
            )
            warnings.filterwarnings(
                "ignore",
                message=r".*unauthenticated requests to the HF Hub.*",
            )
            warnings.filterwarnings(
                "ignore",
                message=r".*cannot run with `cpu` device.*",
            )
            warnings.filterwarnings(
                "ignore",
                message=r".*float16` operations on this device.*",
            )
            yield
    finally:
        for name, level in previous_levels.items():
            logging.getLogger(name).setLevel(level)


DEFAULT_MODEL = os.environ.get(
    "DIFFUSERS_MODEL", "qwen_image_2512_bf16.safetensors"
).strip()
MOCK_MODE = env_flag("DIFFUSERS_MOCK")
SDXL_CONFIG_ID = os.environ.get(
    "DIFFUSERS_SDXL_CONFIG",
    "stabilityai/stable-diffusion-xl-base-1.0",
).strip()
SDXL_REFINER_CONFIG_ID = os.environ.get(
    "DIFFUSERS_SDXL_REFINER_CONFIG",
    "stabilityai/stable-diffusion-xl-refiner-1.0",
).strip()
SDXL_VAE_ID = os.environ.get(
    "DIFFUSERS_SDXL_VAE",
    "madebyollin/sdxl-vae-fp16-fix",
).strip()
SDXL_FORCE_FP32 = env_flag("DIFFUSERS_SDXL_FP32")
CPU_OFFLOAD = env_flag("DIFFUSERS_CPU_OFFLOAD")
# Auto-on when a local refiner checkpoint exists; set DIFFUSERS_REFINER=0 to skip.
REFINER_ENABLED = env_flag_default_on("DIFFUSERS_REFINER")
# Keep refine gentle — high strength warps hands/arms on RealVis.
REFINER_STRENGTH = float(os.environ.get("DIFFUSERS_REFINER_STRENGTH", "0.18") or 0.18)


class PipelineHolder:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pipe: Any = None
        self._refiner: Any = None
        self._refiner_key: str | None = None
        self._model_key: str | None = None
        self._resolved: ResolvedModel | None = None
        self._lora_key: str = "none"
        self.device = "cpu"
        self._offloaded = False

    def describe(self) -> tuple[str, str, bool]:
        if MOCK_MODE:
            return "cpu", DEFAULT_MODEL, True
        if self._resolved is not None:
            mode = "offload" if self._offloaded else self.device
            return mode, f"{self._resolved.kind}:{self._resolved.label}", False
        return self.device, DEFAULT_MODEL, False

    def _is_xl_name(self, name: str) -> bool:
        label = name.lower()
        return any(
            token in label
            for token in ("xl", "sdxl", "pony", "illustrious", "noobai", "realvis")
        )

    def _load_single_file(self, path: str, dtype: Any) -> Any:
        from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline

        label = Path(path).name.lower()
        use_xl = self._is_xl_name(label)
        common: dict[str, Any] = {
            "torch_dtype": dtype,
            "use_safetensors": path.endswith(".safetensors"),
        }

        with _silence_model_warnings():
            if use_xl:
                try:
                    return StableDiffusionXLPipeline.from_single_file(
                        path,
                        config=SDXL_CONFIG_ID,
                        **common,
                    )
                except Exception:
                    return StableDiffusionXLPipeline.from_single_file(path, **common)

            try:
                return StableDiffusionPipeline.from_single_file(path, **common)
            except Exception:
                try:
                    return StableDiffusionXLPipeline.from_single_file(
                        path,
                        config=SDXL_CONFIG_ID,
                        **common,
                    )
                except Exception:
                    return StableDiffusionXLPipeline.from_single_file(path, **common)

    def _attach_sdxl_vae(self, pipe: Any, dtype: Any) -> None:
        from diffusers import AutoencoderKL

        vae = AutoencoderKL.from_pretrained(
            SDXL_VAE_ID,
            torch_dtype=dtype,
            use_safetensors=True,
        )
        if hasattr(vae, "config"):
            vae.config.force_upcast = False
        pipe.vae = vae
        print(f"[diffusers] VAE={SDXL_VAE_ID} force_upcast=False dtype={dtype}", flush=True)

    def _empty_cuda(self) -> None:
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass

    def _finalize_pipe(
        self,
        pipe: Any,
        device: str,
        dtype: Any,
        *,
        label: str | None = None,
    ) -> Any:
        import torch
        from diffusers import DPMSolverMultistepScheduler

        is_xl = "xl" in type(pipe).__name__.lower()
        if is_xl:
            try:
                pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                    pipe.scheduler.config,
                    use_karras_sigmas=True,
                    algorithm_type="dpmsolver++",
                )
            except Exception:
                try:
                    pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                        pipe.scheduler.config
                    )
                except Exception:
                    pass

        if is_xl and dtype == torch.float16:
            try:
                self._attach_sdxl_vae(pipe, dtype)
            except Exception as vae_error:
                if not env_flag("DIFFUSERS_ALLOW_STOCK_VAE"):
                    raise RuntimeError(
                        f"Need {SDXL_VAE_ID} for clean SDXL fp16 color. {vae_error}"
                    ) from vae_error

        try:
            pipe.set_progress_bar_config(disable=True)
        except Exception:
            pass

        vae = getattr(pipe, "vae", None)
        if vae is not None:
            for name in ("disable_tiling", "disable_slicing"):
                fn = getattr(vae, name, None)
                if callable(fn):
                    try:
                        fn()
                    except Exception:
                        pass

        self._offloaded = False
        if device == "cuda" and CPU_OFFLOAD:
            try:
                pipe.enable_model_cpu_offload()
                self._offloaded = True
                self.device = "cuda"
                return pipe
            except Exception:
                pass

        # Single move — avoid re-casting VAE after the fact (causes washed outputs).
        with _silence_model_warnings():
            pipe = pipe.to(device)
        self.device = device
        for tok_name in ("tokenizer", "tokenizer_2"):
            tok = getattr(pipe, tok_name, None)
            if tok is not None and hasattr(tok, "clean_up_tokenization_spaces"):
                try:
                    tok.clean_up_tokenization_spaces = False
                except Exception:
                    pass
        sched = type(getattr(pipe, "scheduler", None)).__name__
        model_label = label or (self._resolved.label if self._resolved else "?")
        print(
            f"[diffusers] pipeline ready model={model_label} device={device} "
            f"dtype={dtype} offload={self._offloaded} "
            f"class={type(pipe).__name__} scheduler={sched}",
            flush=True,
        )
        return pipe

    def _dtype_for_resolved(self, resolved: ResolvedModel, device: str) -> Any:
        import torch

        if device != "cuda":
            return torch.float32
        if resolved.kind == "single_file" and self._is_xl_name(resolved.label):
            return torch.float32 if SDXL_FORCE_FP32 else torch.float16
        return torch.float16

    def _load_pipe(self, resolved: ResolvedModel) -> Any:
        import torch
        from diffusers import AutoPipelineForText2Image

        self._empty_cuda()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = self._dtype_for_resolved(resolved, device)
        common: dict[str, Any] = {"torch_dtype": dtype}
        if device == "cuda" and dtype == torch.float16:
            common["variant"] = "fp16"

        try:
            with _silence_model_warnings():
                if resolved.kind == "single_file":
                    pipe = self._load_single_file(resolved.source, dtype)
                    pipe = self._finalize_pipe(
                        pipe, device, dtype, label=resolved.label
                    )
                elif resolved.kind == "diffusers_dir":
                    pipe = AutoPipelineForText2Image.from_pretrained(
                        resolved.source,
                        local_files_only=True,
                        torch_dtype=dtype,
                    )
                    pipe = self._finalize_pipe(
                        pipe, device, dtype, label=resolved.label
                    )
                else:
                    try:
                        pipe = AutoPipelineForText2Image.from_pretrained(
                            resolved.source,
                            **common,
                        )
                    except TypeError:
                        pipe = AutoPipelineForText2Image.from_pretrained(
                            resolved.source,
                            torch_dtype=dtype,
                        )
                    pipe = self._finalize_pipe(
                        pipe, device, dtype, label=resolved.label
                    )
        except Exception as load_error:
            # Never silently remap Flux/Qwen UNETs onto RealVis/SDXL.
            if infer_native_family(resolved.label) in ("flux", "qwen"):
                raise load_error
            if resolved.label != "sd_xl_base_1.0.safetensors":
                fallback = resolve_model("sdxl", default_hub=DEFAULT_MODEL)
                if (
                    fallback.kind != "hub"
                    and fallback.source != resolved.source
                    and infer_native_family(fallback.label) is None
                ):
                    print(
                        f"[diffusers] load failed for {resolved.label}; "
                        f"falling back to {fallback.label}",
                        flush=True,
                    )
                    return self._load_pipe(fallback)
            raise load_error

        return pipe

    def _ensure_loaded(self, model: str) -> Any:
        if MOCK_MODE:
            return None

        resolved = resolve_model(model, default_hub=DEFAULT_MODEL)
        model_key = (
            f"{resolved.kind}:{resolved.source}:"
            f"{'fp32' if SDXL_FORCE_FP32 else 'fp16'}:"
            f"{'offload' if CPU_OFFLOAD else 'gpu'}:v4"
        )

        with self._lock:
            if self._pipe is not None and self._model_key == model_key:
                return self._pipe

            try:
                pipe = self._load_pipe(resolved)
            except Exception as first_error:
                if resolved.kind != "hub":
                    paths = ", ".join(describe_search_paths()) or "(none)"
                    raise RuntimeError(
                        f"Failed to load model {resolved.label!r} from {resolved.source}. "
                        f"Searched: {paths}. {first_error}"
                    ) from first_error

                local = resolve_model(
                    Path(resolved.source).name,
                    default_hub=DEFAULT_MODEL,
                )
                if local.kind == "hub":
                    local = resolve_model("sdxl", default_hub=DEFAULT_MODEL)
                if local.kind == "hub":
                    paths = ", ".join(describe_search_paths()) or "(none)"
                    raise RuntimeError(
                        f"Model {resolved.source!r} not on Hugging Face and not found under "
                        f"ComfyUI folders ({paths}). Set COMFYUI_ROOT or place weights in "
                        f"models/checkpoints or models/diffusers. {first_error}"
                    ) from first_error
                pipe = self._load_pipe(local)
                resolved = local
                model_key = (
                    f"{resolved.kind}:{resolved.source}:"
                    f"{'fp32' if SDXL_FORCE_FP32 else 'fp16'}:"
                    f"{'offload' if CPU_OFFLOAD else 'gpu'}:v4"
                )

            self._pipe = pipe
            self._model_key = model_key
            self._resolved = resolved
            self._lora_key = "none"
            return pipe

    def _fuse_kohya_lora(self, pipe: Any, path: str, weight: float) -> None:
        """
        Fuse a Kohya/Civitai SDXL LoRA into the UNet.

        Full `load_lora_weights()` often crashes on these files (empty TE rank map
        → IndexError). Mapping with `unet_config` + UNet-only inject is reliable.
        """
        from diffusers import StableDiffusionXLPipeline

        lora_path = Path(path)
        state_dict, network_alphas = StableDiffusionXLPipeline.lora_state_dict(
            str(lora_path.parent),
            weight_name=lora_path.name,
            unet_config=pipe.unet.config,
        )
        unet_state = {
            key: value
            for key, value in state_dict.items()
            if key.startswith("unet.")
        }
        if not unet_state:
            raise RuntimeError(f"No UNet LoRA keys in {lora_path.name}")
        unet_alphas = None
        if isinstance(network_alphas, dict):
            unet_alphas = {
                key: value
                for key, value in network_alphas.items()
                if key.startswith("unet.") or ".unet." in key
            }
            if not unet_alphas:
                unet_alphas = network_alphas
        pipe.load_lora_into_unet(
            unet_state,
            network_alphas=unet_alphas,
            unet=pipe.unet,
        )
        pipe.fuse_lora(lora_scale=float(weight))
        try:
            pipe.unload_lora_weights()
        except Exception:
            pass

    def _apply_loras(
        self,
        pipe: Any,
        *,
        wants_person: bool,
        workshop_role: bool = False,
    ) -> Any:
        """Fuse SDXL LoRAs for this generate (hand fix + optional detail)."""
        is_xl = "xl" in type(pipe).__name__.lower()
        if not is_xl:
            return pipe
        loras = resolve_loras(
            wants_person=wants_person,
            workshop_role=workshop_role,
        )
        key = lora_cache_key(loras)
        if key == self._lora_key:
            return pipe

        # Fused LoRAs bake into weights — reload a clean base when the set changes.
        if self._lora_key != "none" and self._resolved is not None:
            print("[diffusers] reloading base checkpoint to swap LoRAs", flush=True)
            pipe = self._load_pipe(self._resolved)
            self._pipe = pipe

        if not loras:
            self._lora_key = "none"
            return pipe

        fused = 0
        for item in loras:
            try:
                self._fuse_kohya_lora(pipe, item.path, item.weight)
                fused += 1
                print(
                    f"[diffusers] LoRA fused {item.name} weight={item.weight:.2f}",
                    flush=True,
                )
            except Exception as error:
                print(f"[diffusers] LoRA load failed {item.name}: {error}", flush=True)
        if workshop_role:
            print("[diffusers] workshop role: crop hands out of frame", flush=True)
        self._lora_key = key if fused else "none"
        return pipe

    def _park_pipe(self, pipe: Any) -> None:
        """Park a pipeline on CPU safely (fp16 cannot live on CPU)."""
        import torch

        if pipe is None:
            return
        with _silence_model_warnings():
            try:
                pipe.to(dtype=torch.float32)
            except Exception:
                pass
            try:
                pipe.to("cpu")
            except Exception:
                pass
        self._empty_cuda()

    def _release_pipe(self) -> None:
        """Drop the cached pipeline so the next load starts from a clean base."""
        import gc

        pipe = self._pipe
        self._pipe = None
        self._model_key = None
        self._lora_key = "none"
        self._resolved = None
        self._offloaded = False
        if pipe is not None:
            try:
                self._park_pipe(pipe)
            except Exception:
                pass
            del pipe
        gc.collect()
        self._empty_cuda()

    def _place_compiled_pipe(
        self,
        pipe: Any,
        dtype: Any,
        *,
        prefer_offload: bool = False,
    ) -> Any:
        """Move a Flux/Qwen compiled pipeline onto CUDA (or leave on CPU)."""
        import torch

        del dtype  # placement only; dtypes already set at load time
        device = "cuda" if torch.cuda.is_available() else "cpu"
        self._offloaded = False
        if device == "cuda":
            # Qwen TE+transformer barely fits a 24GB card — prefer offload.
            if CPU_OFFLOAD or prefer_offload:
                try:
                    # Sequential is safer for Qwen TE + large transformer on 24GB.
                    if prefer_offload and hasattr(pipe, "enable_sequential_cpu_offload"):
                        pipe.enable_sequential_cpu_offload()
                    else:
                        pipe.enable_model_cpu_offload()
                    self._offloaded = True
                    self.device = "cuda"
                    print(
                        f"[diffusers] offload={'sequential' if prefer_offload else 'model'}",
                        flush=True,
                    )
                    return pipe
                except Exception as exc:
                    print(f"[diffusers] cpu_offload failed: {exc}", flush=True)
            pipe = pipe.to(device)
        self.device = device
        return pipe

    def _wake_pipe(self, pipe: Any, device: str, dtype: Any) -> None:
        """Restore a parked pipeline to the inference device/dtype."""
        if pipe is None:
            return
        with _silence_model_warnings():
            pipe.to(device=device, dtype=dtype)

    def _ensure_refiner(self, dtype: Any, device: str) -> Any | None:
        """Lazily load SDXL img2img refiner when enabled and present on disk."""
        if not REFINER_ENABLED:
            return None
        resolved = resolve_sdxl_refiner()
        if resolved is None:
            return None
        key = f"{resolved.kind}:{resolved.source}"
        if self._refiner is not None and self._refiner_key == key:
            return self._refiner

        from diffusers import (
            DPMSolverMultistepScheduler,
            StableDiffusionXLImg2ImgPipeline,
        )

        import torch

        print(f"[diffusers] loading refiner {resolved.label}", flush=True)
        # Load in float32 so CPU parking between jobs is valid; cast on wake.
        common: dict[str, Any] = {
            "torch_dtype": torch.float32,
            "use_safetensors": resolved.source.endswith(".safetensors"),
        }
        with _silence_model_warnings():
            try:
                refiner = StableDiffusionXLImg2ImgPipeline.from_single_file(
                    resolved.source,
                    config=SDXL_REFINER_CONFIG_ID,
                    **common,
                )
            except Exception:
                refiner = StableDiffusionXLImg2ImgPipeline.from_single_file(
                    resolved.source,
                    **common,
                )
            try:
                self._attach_sdxl_vae(refiner, torch.float32)
            except Exception:
                pass
            try:
                refiner.scheduler = DPMSolverMultistepScheduler.from_config(
                    refiner.scheduler.config,
                    use_karras_sigmas=True,
                    algorithm_type="dpmsolver++",
                )
            except Exception:
                pass
            try:
                refiner.set_progress_bar_config(disable=True)
            except Exception:
                pass
            self._park_pipe(refiner)

        self._refiner = refiner
        self._refiner_key = key
        return refiner

    def _refine_image(
        self,
        *,
        image: Image.Image,
        prompt: str,
        negative_prompt: str,
        steps: int,
        guidance_scale: float,
        seed: int,
        device: str,
        dtype: Any,
    ) -> Image.Image:
        import torch

        refiner = self._ensure_refiner(dtype, device)
        if refiner is None:
            return image

        strength = max(0.05, min(REFINER_STRENGTH, 0.6))
        refine_steps = max(12, min(steps, 28))
        print(
            f"[diffusers] refine steps={refine_steps} strength={strength:.2f} "
            f"cfg={guidance_scale}",
            flush=True,
        )

        # Free base VRAM, run refiner on GPU, then restore base.
        base = self._pipe
        try:
            if base is not None and device == "cuda":
                self._park_pipe(base)
            if device == "cuda":
                self._wake_pipe(refiner, device, dtype)
            generator = torch.Generator(device=device).manual_seed(seed + 1)
            # Prompt is already CLIP-fitted by the base pass — clamp only, no re-lock.
            encoded = encode_sdxl_prompts(
                refiner,
                prompt=prompt,
                negative_prompt=negative_prompt,
                device=device,
            )
            with _silence_model_warnings():
                result = refiner(
                    image=image,
                    num_inference_steps=refine_steps,
                    strength=strength,
                    guidance_scale=guidance_scale,
                    generator=generator,
                    **encoded,
                )
            return result.images[0]
        except torch.cuda.OutOfMemoryError:
            print("[diffusers] refine OOM — returning base image", flush=True)
            self._empty_cuda()
            return image
        except Exception as error:
            print(f"[diffusers] refine failed: {error}", flush=True)
            return image
        finally:
            self._park_pipe(refiner)
            if base is not None and device == "cuda" and not self._offloaded:
                try:
                    self._wake_pipe(base, device, dtype)
                    self._pipe = base
                except Exception as restore_error:
                    print(
                        f"[diffusers] base restore failed: {restore_error}",
                        flush=True,
                    )

    def _decode_latents_fp32(self, pipe: Any, latents: Any) -> Image.Image:
        """Decode in float32 — stock/fp16 VAE paths often wash to grey soup."""
        import torch

        vae = pipe.vae
        scaling = float(getattr(vae.config, "scaling_factor", 0.13025))
        original_dtype = next(vae.parameters()).dtype

        # Diffusers warns on temporary fp32 cast even when intentional for color.
        with _silence_model_warnings():
            vae_fp32 = vae.to(dtype=torch.float32)
            latents_fp32 = latents.to(dtype=torch.float32) / scaling
            with torch.inference_mode():
                decoded = vae_fp32.decode(latents_fp32, return_dict=False)[0]
            try:
                vae.to(dtype=original_dtype)
            except Exception:
                pass

        decoded = (decoded / 2 + 0.5).clamp(0, 1)
        decoded = decoded.detach().cpu().permute(0, 2, 3, 1).float().numpy()
        decoded = (decoded * 255.0).round().astype("uint8")
        image = Image.fromarray(decoded[0])
        arr = decoded[0].astype("float32")
        color = float(
            np.abs(arr[:, :, 0] - arr[:, :, 1]).mean()
            + np.abs(arr[:, :, 1] - arr[:, :, 2]).mean()
        )
        print(f"[diffusers] decode color_spread={color:.3f}", flush=True)
        return image

    def generate(
        self,
        *,
        prompt: str,
        negative_prompt: str,
        model: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        on_step: Callable[[int, int], None] | None = None,
        workshop_crop: bool | None = None,
    ) -> Image.Image:
        model_id = (model or DEFAULT_MODEL).strip() or DEFAULT_MODEL

        if MOCK_MODE:
            if on_step:
                on_step(1, max(steps, 1))
            image = Image.new("RGB", (width, height), (28, 32, 48))
            draw = ImageDraw.Draw(image)
            draw.text((24, 24), "DIFFUSERS_MOCK", fill=(220, 220, 230))
            draw.text((24, 48), prompt[:80], fill=(180, 190, 210))
            draw.text((24, 72), f"seed={seed}", fill=(140, 150, 170))
            if on_step:
                on_step(max(steps, 1), max(steps, 1))
            return image

        # Flux/Qwen UNETs cannot load via AutoPipeline/SDXL — route natively.
        # (Silent RealVis fallback was producing elongated "Flux"/"Qwen" outputs.)
        native = infer_native_family(model_id)
        if native in ("flux", "qwen"):
            resolved = resolve_model(model_id, default_hub=DEFAULT_MODEL)
            if resolved.kind == "hub":
                raise RuntimeError(
                    f"Native {native} weights not found for {model_id!r}. "
                    f"Searched: {', '.join(describe_search_paths()) or '(none)'}."
                )
            gen_w, gen_h = _person_portrait_canvas(prompt, int(width), int(height))
            if native == "flux":
                return self._generate_txt2img_flux(
                    unet_path=resolved.source,
                    prompt=prompt,
                    negative_prompt=negative_prompt,
                    width=gen_w,
                    height=gen_h,
                    steps=steps,
                    guidance_scale=guidance_scale,
                    seed=seed,
                    on_step=on_step,
                )
            return self._generate_txt2img_qwen(
                model_path=resolved.source,
                prompt=prompt,
                negative_prompt=negative_prompt,
                width=gen_w,
                height=gen_h,
                steps=steps,
                guidance_scale=guidance_scale,
                seed=seed,
                on_step=on_step,
            )

        import torch

        self._empty_cuda()
        pipe = self._ensure_loaded(model_id)
        wants_person = prompt_wants_person(prompt)
        if workshop_crop is True:
            workshop_role = True
        elif workshop_crop is False:
            workshop_role = False
        else:
            workshop_role = prompt_is_workshop_role(prompt)
        pipe = self._apply_loras(
            pipe,
            wants_person=wants_person,
            workshop_role=workshop_role,
        )
        self._pipe = pipe
        plan = plan_sampling(
            pipe=pipe,
            width=width,
            height=height,
            steps=steps,
            guidance_scale=guidance_scale,
            negative_prompt=negative_prompt,
            resolved_label=self._resolved.label if self._resolved else None,
        )

        gen_width, gen_height = plan.width, plan.height
        if self._offloaded and max(gen_width, gen_height) > 896:
            scale = 896 / max(gen_width, gen_height)
            gen_width = max(768, int(gen_width * scale) // 8 * 8)
            gen_height = max(768, int(gen_height * scale) // 8 * 8)

        device_for_gen = "cuda" if torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=device_for_gen).manual_seed(seed)

        if on_step:
            on_step(1, plan.steps)

        run_kwargs: dict[str, Any] = {
            "width": gen_width,
            "height": gen_height,
            "num_inference_steps": plan.steps,
            "guidance_scale": plan.guidance_scale,
            "generator": generator,
            "output_type": "latent",
        }

        is_xl = "xl" in type(pipe).__name__.lower()
        if is_xl:
            run_kwargs.update(
                encode_sdxl_prompts(
                    pipe,
                    prompt=prompt,
                    negative_prompt=plan.negative_prompt,
                    device=device_for_gen,
                    workshop_crop=workshop_crop,
                )
            )
            # SDXL clarity helper — reduces washed midtones / overcooked CFG look.
            run_kwargs["guidance_rescale"] = 0.7
        else:
            run_kwargs["prompt"] = prompt
            run_kwargs["negative_prompt"] = plan.negative_prompt or None

        model_label = self._resolved.label if self._resolved else model_id
        print(
            f"[diffusers] sample model={model_label} "
            f"{gen_width}x{gen_height} steps={plan.steps} "
            f"cfg={plan.guidance_scale}",
            flush=True,
        )

        try:
            with _silence_model_warnings():
                result = pipe(**run_kwargs)
            latents = result.images
            image = self._decode_latents_fp32(pipe, latents)
        except torch.cuda.OutOfMemoryError:
            self._empty_cuda()
            run_kwargs["width"] = 768
            run_kwargs["height"] = 768
            run_kwargs["generator"] = torch.Generator(device=device_for_gen).manual_seed(
                seed
            )
            with _silence_model_warnings():
                result = pipe(**run_kwargs)
            image = self._decode_latents_fp32(pipe, result.images)
        finally:
            self._empty_cuda()

        # Refiner needs a full-GPU base swap; skip under CPU offload.
        if is_xl and REFINER_ENABLED and not self._offloaded:
            dtype = self._dtype_for_resolved(
                self._resolved
                or ResolvedModel("hub", model_id, model_id),
                device_for_gen,
            )
            # Use the CLIP-fitted prompt text when available.
            refine_prompt = run_kwargs.get("prompt") or prompt
            refine_negative = (
                run_kwargs.get("negative_prompt") or plan.negative_prompt or ""
            )
            if on_step:
                on_step(max(plan.steps - 1, 1), plan.steps)
            image = self._refine_image(
                image=image,
                prompt=str(refine_prompt),
                negative_prompt=str(refine_negative or ""),
                steps=plan.steps,
                guidance_scale=plan.guidance_scale,
                seed=seed,
                device=device_for_gen,
                dtype=dtype,
            )

        if on_step:
            on_step(plan.steps, plan.steps)
        return image

    def generate_compiled_sdxl(
        self,
        *,
        checkpoint_path: str,
        vae_name: str | None,
        loras: list[tuple[str, float]],
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        on_step: Callable[[int, int], None] | None = None,
        workshop_crop: bool | None = None,
    ) -> Image.Image:
        """
        Native SDXL from a Comfy graph — same quality stack as txt2img
        (CLIP fit, hand LoRA, RealVis CFG, fp32 VAE decode).
        """
        import torch
        from diffusers import (
            DPMSolverMultistepScheduler,
            StableDiffusionXLPipeline,
        )

        if MOCK_MODE:
            if on_step:
                on_step(1, max(steps, 1))
            image = Image.new("RGB", (width, height), (28, 32, 48))
            if on_step:
                on_step(max(steps, 1), max(steps, 1))
            return image

        path = Path(checkpoint_path)
        # Ignore graph LoRA list in the cache key's fuse set; quality LoRAs applied below.
        key = f"compiled-sdxl:{path}:{vae_name or 'auto'}"
        with self._lock:
            if self._model_key != key or self._pipe is None:
                self._release_pipe()
                pipe = StableDiffusionXLPipeline.from_single_file(
                    str(path),
                    torch_dtype=torch.float16,
                    use_safetensors=True,
                )
                if vae_name and not vae_name.startswith("{{"):
                    from app.asset_inventory import resolve_asset_file
                    from diffusers import AutoencoderKL

                    vae_path = resolve_asset_file(vae_name, "vaes", "checkpoints")
                    if vae_path is not None:
                        try:
                            pipe.vae = AutoencoderKL.from_single_file(
                                str(vae_path),
                                torch_dtype=torch.float32,
                            )
                        except Exception as exc:
                            print(f"[diffusers] compiled VAE load failed: {exc}", flush=True)
                            self._upgrade_sdxl_vae(pipe)
                    else:
                        self._upgrade_sdxl_vae(pipe)
                else:
                    self._upgrade_sdxl_vae(pipe)
                pipe.scheduler = DPMSolverMultistepScheduler.from_config(
                    pipe.scheduler.config,
                    use_karras_sigmas=True,
                    algorithm_type="dpmsolver++",
                )
                pipe = self._place_compiled_pipe(pipe, torch.float16)
                self._pipe = pipe
                self._model_key = key
                self._lora_key = "none"
                self._resolved = ResolvedModel(
                    "single_file",
                    str(path),
                    path.name,
                )

            pipe = self._pipe

        wants_person = prompt_wants_person(prompt)
        if workshop_crop is True:
            workshop_role = True
        elif workshop_crop is False:
            workshop_role = False
        else:
            workshop_role = prompt_is_workshop_role(prompt)

        # Auto hand/detail LoRAs first (quality baseline), then graph LoRAs.
        pipe = self._apply_loras(
            pipe,
            wants_person=wants_person,
            workshop_role=workshop_role,
        )
        if loras:
            for lora_path, strength in loras:
                try:
                    self._fuse_kohya_lora(pipe, lora_path, strength)
                except Exception as exc:
                    print(f"[diffusers] compiled LoRA skip {lora_path}: {exc}", flush=True)
            self._lora_key = f"{self._lora_key}+graph:{sorted(loras)}"
        self._pipe = pipe

        plan = plan_sampling(
            pipe=pipe,
            width=width,
            height=height,
            steps=steps,
            guidance_scale=guidance_scale,
            negative_prompt=negative_prompt,
            resolved_label=self._resolved.label if self._resolved else path.name,
        )
        gen_width, gen_height = plan.width, plan.height
        if self._offloaded and max(gen_width, gen_height) > 896:
            scale = 896 / max(gen_width, gen_height)
            gen_width = max(768, int(gen_width * scale) // 8 * 8)
            gen_height = max(768, int(gen_height * scale) // 8 * 8)

        device_for_gen = "cuda" if torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=device_for_gen).manual_seed(int(seed) & 0xFFFFFFFF)

        if on_step:
            on_step(1, plan.steps)

        run_kwargs: dict[str, Any] = {
            "width": gen_width,
            "height": gen_height,
            "num_inference_steps": plan.steps,
            "guidance_scale": plan.guidance_scale,
            "generator": generator,
            "output_type": "latent",
            "guidance_rescale": 0.7,
        }
        run_kwargs.update(
            encode_sdxl_prompts(
                pipe,
                prompt=prompt,
                negative_prompt=plan.negative_prompt,
                device=device_for_gen,
                workshop_crop=workshop_crop,
            )
        )
        print(
            f"[diffusers] compiled-sdxl model={path.name} "
            f"{gen_width}x{gen_height} steps={plan.steps} "
            f"cfg={plan.guidance_scale}",
            flush=True,
        )

        try:
            with _silence_model_warnings():
                result = pipe(**run_kwargs)
            image = self._decode_latents_fp32(pipe, result.images)
        except torch.cuda.OutOfMemoryError:
            self._empty_cuda()
            run_kwargs["width"] = 768
            run_kwargs["height"] = 768
            run_kwargs["generator"] = torch.Generator(device=device_for_gen).manual_seed(
                int(seed) & 0xFFFFFFFF
            )
            with _silence_model_warnings():
                result = pipe(**run_kwargs)
            image = self._decode_latents_fp32(pipe, result.images)
        finally:
            self._empty_cuda()

        if REFINER_ENABLED and not self._offloaded:
            refine_prompt = run_kwargs.get("prompt") or prompt
            refine_negative = (
                run_kwargs.get("negative_prompt") or plan.negative_prompt or ""
            )
            if on_step:
                on_step(max(plan.steps - 1, 1), plan.steps)
            image = self._refine_image(
                image=image,
                prompt=str(refine_prompt),
                negative_prompt=str(refine_negative or ""),
                steps=plan.steps,
                guidance_scale=plan.guidance_scale,
                seed=seed,
                device=device_for_gen,
                dtype=self._dtype_for_resolved(
                    self._resolved
                    or ResolvedModel("single_file", str(path), path.name),
                    device_for_gen,
                ),
            )

        if on_step:
            on_step(plan.steps, plan.steps)
        return image

    def _load_flux_pipeline(
        self,
        *,
        unet_path: str,
        clip_name: str | None,
        clip2_name: str | None,
        clip_type: str | None,
        vae_name: str | None,
        dtype: Any,
    ) -> Any:
        """Load Flux / Flux2-Klein from drop-in UNET + TE + VAE files."""
        from app.asset_inventory import resolve_asset_file
        from app.dropin_loaders import (
            is_flux_klein_unet,
            is_fp8_scaled_name,
            load_clip_l_text_encoder,
            load_qwen3_causal_from_single_file,
        )
        from diffusers import (
            AutoencoderKL,
            Flux2KleinPipeline,
            Flux2Transformer2DModel,
            FluxPipeline,
            FluxTransformer2DModel,
        )
        from transformers import CLIPTokenizer, Qwen2Tokenizer, T5EncoderModel, T5TokenizerFast

        unet_label = Path(unet_path).name
        clip_type_l = (clip_type or "").lower()
        klein = clip_type_l == "flux2" or is_flux_klein_unet(unet_label)

        if klein:
            from diffusers import FlowMatchEulerDiscreteScheduler

            print(f"[diffusers] Flux2-Klein load {unet_label}", flush=True)
            # Diffusers maps all Flux2 single-files to gated FLUX.2-dev for config.
            # Point at vendored Klein configs so drop-in UNETs load offline.
            klein_config = _flux2_klein_config_dir(unet_label)
            # from_single_file only auto-sets subfolder=transformer when config is
            # inferred from the checkpoint — not when config= is passed explicitly.
            klein_transformer_config = klein_config / "transformer"
            print(
                f"[diffusers] Flux2-Klein config={klein_config.name}/transformer (local)",
                flush=True,
            )
            transformer = Flux2Transformer2DModel.from_single_file(
                unet_path,
                config=str(klein_transformer_config),
                torch_dtype=dtype,
                local_files_only=True,
            )
            if not clip_name or str(clip_name).startswith("{{"):
                raise FileNotFoundError(
                    "Flux2-Klein workflow missing CLIPLoader drop-in (qwen_3_*)."
                )
            clip_path = resolve_asset_file(clip_name, "text_encoders", "clip")
            if clip_path is None:
                raise FileNotFoundError(
                    f"Flux2 text encoder not found in drop-in folders: {clip_name}"
                )
            text_encoder = load_qwen3_causal_from_single_file(clip_path, dtype=dtype)
            tokenizer = _load_qwen3_tokenizer_for_flux(clip_path.name)

            if vae_name and not str(vae_name).startswith("{{"):
                vae_path = resolve_asset_file(vae_name, "vaes")
            else:
                vae_path = resolve_asset_file("flux2-vae.safetensors", "vaes")
            if vae_path is None:
                raise FileNotFoundError(
                    "Flux2-Klein requires flux2-vae.safetensors in models/vae."
                )
            vae = _load_flux2_vae_local(vae_path, dtype=dtype)
            try:
                scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(
                    "black-forest-labs/FLUX.1-dev",
                    subfolder="scheduler",
                    local_files_only=True,
                )
            except Exception:
                scheduler = FlowMatchEulerDiscreteScheduler()
            distilled = "base" not in unet_label.lower()
            pipe = Flux2KleinPipeline(
                scheduler=scheduler,
                vae=vae,
                text_encoder=text_encoder,
                tokenizer=tokenizer,
                transformer=transformer,
                is_distilled=distilled,
            )
            try:
                pipe.set_progress_bar_config(disable=True)
            except Exception:
                pass
            print(
                f"[diffusers] Flux2-Klein assembled TE={clip_path.name} "
                f"VAE={vae_path.name} distilled={distilled}",
                flush=True,
            )
            return pipe

        # Classic FLUX.1
        print(f"[diffusers] Flux.1 load {unet_label}", flush=True)
        transformer = FluxTransformer2DModel.from_single_file(
            unet_path,
            torch_dtype=dtype,
        )

        text_encoder = None
        if clip_name and not str(clip_name).startswith("{{"):
            clip_path = resolve_asset_file(clip_name, "text_encoders", "clip")
            if clip_path is None:
                raise FileNotFoundError(
                    f"Flux CLIP (clip_l) not found in drop-in folders: {clip_name}"
                )
            text_encoder = load_clip_l_text_encoder(clip_path, dtype=dtype)
            print(f"[diffusers] Flux CLIP-L {clip_path.name}", flush=True)

        text_encoder_2 = None
        if clip2_name and not str(clip2_name).startswith("{{"):
            clip2_path = resolve_asset_file(clip2_name, "text_encoders", "clip")
            if clip2_path is None:
                raise FileNotFoundError(
                    f"Flux T5 encoder not found in drop-in folders: {clip2_name}"
                )
            if is_fp8_scaled_name(clip2_path.name):
                # Diffusers can't ingest Comfy fp8-scaled T5 directly — use hub TE2.
                print(
                    f"[diffusers] Flux T5 {clip2_path.name} is fp8-scaled; "
                    "using hub T5EncoderModel (weights on disk kept for Comfy)",
                    flush=True,
                )
            else:
                try:
                    text_encoder_2 = T5EncoderModel.from_pretrained(
                        str(clip2_path.parent),
                        torch_dtype=dtype,
                    )
                except Exception as exc:
                    print(f"[diffusers] local T5 load failed ({exc}); hub TE2", flush=True)

        vae = None
        if vae_name and not str(vae_name).startswith("{{"):
            vae_path = resolve_asset_file(vae_name, "vaes")
            if vae_path is None:
                raise FileNotFoundError(
                    f"Flux VAE not found in drop-in folders: {vae_name}"
                )
            vae = AutoencoderKL.from_single_file(str(vae_path), torch_dtype=dtype)
            print(f"[diffusers] Flux VAE {vae_path.name}", flush=True)

        # Shell from hub for tokenizers / missing TE2; never replace local transformer.
        hub_kwargs: dict[str, Any] = {
            "transformer": transformer,
            "torch_dtype": dtype,
        }
        if text_encoder is not None:
            hub_kwargs["text_encoder"] = text_encoder
        if text_encoder_2 is not None:
            hub_kwargs["text_encoder_2"] = text_encoder_2
        if vae is not None:
            hub_kwargs["vae"] = vae
        try:
            pipe = FluxPipeline.from_pretrained(
                "black-forest-labs/FLUX.1-dev",
                local_files_only=True,
                **hub_kwargs,
            )
        except Exception:
            pipe = FluxPipeline.from_pretrained(
                "black-forest-labs/FLUX.1-dev",
                **hub_kwargs,
            )
        # Ensure tokenizers exist even when TE came from drop-ins.
        if getattr(pipe, "tokenizer", None) is None:
            pipe.tokenizer = CLIPTokenizer.from_pretrained(
                "openai/clip-vit-large-patch14"
            )
        if getattr(pipe, "tokenizer_2", None) is None:
            pipe.tokenizer_2 = T5TokenizerFast.from_pretrained("google/t5-v1_1-xxl")
        print(
            f"[diffusers] Flux.1 assembled transformer={unet_label} "
            f"clip_l={'drop-in' if text_encoder is not None else 'hub'} "
            f"t5={'drop-in' if text_encoder_2 is not None else 'hub'} "
            f"vae={'drop-in' if vae is not None else 'hub'}",
            flush=True,
        )
        return pipe

    def _qwen_hub_snapshot(self) -> Path | None:
        """Locate a usable cached Qwen/Qwen-Image snapshot (TE/tokenizer/scheduler/vae)."""
        hub = Path.home() / ".cache/huggingface/hub/models--Qwen--Qwen-Image/snapshots"
        if not hub.is_dir():
            return None
        for snap in sorted(hub.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            required = [
                snap / "model_index.json",
                snap / "text_encoder" / "config.json",
                snap / "tokenizer" / "tokenizer_config.json",
                snap / "scheduler" / "scheduler_config.json",
                snap / "transformer" / "config.json",
            ]
            if all(path.is_file() for path in required):
                return snap
        return None

    def _ensure_qwen_hub_snap(self) -> Path:
        from huggingface_hub import snapshot_download

        snap = self._qwen_hub_snapshot()
        if snap is not None and (snap / "vae" / "config.json").is_file():
            return snap
        print("[diffusers] ensuring Qwen hub TE/VAE cache…", flush=True)
        snap_str = snapshot_download(
            "Qwen/Qwen-Image",
            allow_patterns=[
                "model_index.json",
                "scheduler/*",
                "text_encoder/*",
                "tokenizer/*",
                "transformer/config.json",
                "vae/*",
            ],
        )
        return Path(snap_str)

    def _load_qwen_pipeline(
        self,
        *,
        model_path: str,
        clip_name: str | None,
        vae_name: str | None,
        dtype: Any,
        is_rapid_aio: bool = False,
    ) -> Any:
        """Load Qwen-Image from local UNET/Rapid-AIO + drop-in or hub TE/VAE."""
        from app.asset_inventory import resolve_asset_file
        from app.dropin_loaders import (
            extract_rapid_aio_components,
            is_rapid_aio_name,
            load_qwen25_vl_from_single_file,
        )
        from transformers import Qwen2Tokenizer, Qwen2_5_VLForConditionalGeneration
        from diffusers import (
            AutoencoderKLQwenImage,
            FlowMatchEulerDiscreteScheduler,
            QwenImagePipeline,
            QwenImageTransformer2DModel,
        )

        path = Path(model_path)
        if path.is_dir():
            pipe = QwenImagePipeline.from_pretrained(str(path), torch_dtype=dtype)
            print(f"[diffusers] Qwen from_pretrained dir {path.name}", flush=True)
            return pipe

        snap = self._ensure_qwen_hub_snap()
        te_tmp: Path | None = None
        text_encoder = None
        transformer = None

        rapid = is_rapid_aio or is_rapid_aio_name(path.name)
        if rapid:
            print(f"[diffusers] Qwen Rapid-AIO unpack {path.name}", flush=True)
            te_tmp, te_state, _vae_state = extract_rapid_aio_components(path)
            try:
                transformer = QwenImageTransformer2DModel.from_single_file(
                    str(te_tmp),
                    torch_dtype=dtype,
                    config=str(snap / "transformer"),
                    local_files_only=True,
                )
            finally:
                try:
                    te_tmp.unlink(missing_ok=True)
                except Exception:
                    pass
            from app.dropin_loaders import remap_qwen25_vl_comfy_keys

            text_encoder = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                str(snap / "text_encoder"),
                torch_dtype=dtype,
                local_files_only=True,
            )
            remapped = remap_qwen25_vl_comfy_keys(te_state)
            missing, unexpected = text_encoder.load_state_dict(remapped, strict=False)
            print(
                f"[diffusers] Rapid-AIO TE applied matched≈{len(remapped) - len(unexpected)} "
                f"missing={len(missing)} unexpected={len(unexpected)}",
                flush=True,
            )
            # Comfy VAE layout ≠ Diffusers AutoencoderKLQwenImage; keep hub VAE.
        else:
            print(f"[diffusers] Qwen assembling from {path.name}", flush=True)
            transformer = QwenImageTransformer2DModel.from_single_file(
                str(path),
                torch_dtype=dtype,
                config=str(snap / "transformer"),
                local_files_only=True,
            )
            if clip_name and not str(clip_name).startswith("{{"):
                clip_path = resolve_asset_file(clip_name, "text_encoders", "clip")
                if clip_path is None:
                    raise FileNotFoundError(
                        f"Qwen CLIP not found in drop-in folders: {clip_name}"
                    )
                try:
                    text_encoder = load_qwen25_vl_from_single_file(
                        clip_path,
                        config_dir=snap / "text_encoder",
                        dtype=dtype,
                    )
                except Exception as exc:
                    print(
                        f"[diffusers] Qwen drop-in TE failed ({exc}); hub TE",
                        flush=True,
                    )
            if text_encoder is None:
                text_encoder = Qwen2_5_VLForConditionalGeneration.from_pretrained(
                    str(snap / "text_encoder"),
                    torch_dtype=dtype,
                    local_files_only=True,
                )
                print("[diffusers] Qwen TE from hub cache", flush=True)

        if vae_name and not str(vae_name).startswith("{{"):
            # Comfy qwen_image_vae key layout differs; prefer hub Diffusers VAE.
            print(
                f"[diffusers] Qwen VAE drop-in {vae_name} noted; "
                "using Diffusers AutoencoderKLQwenImage (hub cache)",
                flush=True,
            )

        tokenizer = Qwen2Tokenizer.from_pretrained(
            str(snap / "tokenizer"),
            local_files_only=True,
        )
        scheduler = FlowMatchEulerDiscreteScheduler.from_pretrained(
            str(snap / "scheduler"),
            local_files_only=True,
        )
        vae = AutoencoderKLQwenImage.from_pretrained(
            str(snap / "vae"),
            torch_dtype=dtype,
            local_files_only=True,
        )
        pipe = QwenImagePipeline(
            scheduler=scheduler,
            vae=vae,
            text_encoder=text_encoder,
            tokenizer=tokenizer,
            transformer=transformer,
        )
        try:
            pipe.set_progress_bar_config(disable=True)
        except Exception:
            pass
        print(
            f"[diffusers] Qwen pipeline ready model={path.name} rapid={rapid}",
            flush=True,
        )
        return pipe

    def _fuse_pipeline_loras(self, pipe: Any, loras: list[tuple[str, float]]) -> int:
        """Load + fuse Comfy-style LoRAs (Flux/Qwen transformer adapters).

        Returns the number of LoRAs successfully applied. Callers must not cache
        a LoRA key when this returns 0 — silent skips previously looked like
        success and blocked retries.
        """
        if not loras:
            return 0

        adapter_names: list[str] = []
        adapter_weights: list[float] = []
        for index, (lora_path, strength) in enumerate(loras):
            path = Path(lora_path)
            # PEFT adapter names cannot contain '.' (Lightning filenames have versions).
            stem = re.sub(r"[^A-Za-z0-9_]+", "_", path.stem).strip("_")
            adapter = f"ps{index}_{stem}"[:60]
            try:
                pipe.load_lora_weights(
                    str(path.parent),
                    weight_name=path.name,
                    adapter_name=adapter,
                )
                adapter_names.append(adapter)
                adapter_weights.append(float(strength))
                print(
                    f"[diffusers] loaded LoRA {path.name} as {adapter} @{strength}",
                    flush=True,
                )
            except Exception as exc:
                print(f"[diffusers] LoRA skip {path.name}: {exc}", flush=True)

        if not adapter_names:
            return 0

        try:
            if hasattr(pipe, "set_adapters"):
                pipe.set_adapters(adapter_names, adapter_weights)
            if hasattr(pipe, "fuse_lora"):
                try:
                    pipe.fuse_lora(
                        adapter_names=adapter_names,
                        lora_scale=1.0,
                    )
                except TypeError:
                    # Older Diffusers: scale per fuse only.
                    pipe.fuse_lora(lora_scale=1.0)
            print(
                f"[diffusers] fused {len(adapter_names)} LoRA(s): "
                + ", ".join(
                    f"{name}@{weight}"
                    for name, weight in zip(adapter_names, adapter_weights)
                ),
                flush=True,
            )
        except Exception as exc:
            print(f"[diffusers] LoRA fuse failed: {exc}", flush=True)
            return 0
        finally:
            try:
                pipe.unload_lora_weights()
            except Exception:
                pass
        return len(adapter_names)

    def _generate_txt2img_flux(
        self,
        *,
        unet_path: str,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        on_step: Callable[[int, int], None] | None = None,
    ) -> Image.Image:
        """Bridge /v1/txt2img Flux requests onto the native compiled path."""
        from app.dropin_loaders import is_flux_klein_unet

        stack = default_flux_txt2img_stack(Path(unet_path).name)
        if stack.get("clip_type") == "flux2" and not stack.get("clip"):
            raise FileNotFoundError(
                "Flux2-Klein needs qwen_3_*.safetensors in models/text_encoders."
            )
        cfg = float(guidance_scale)
        # Studio often still sends SDXL CFG (~7); Klein distilled wants ~1.
        if is_flux_klein_unet(Path(unet_path).name) and (
            "base" not in Path(unet_path).name.lower()
        ):
            if cfg <= 0 or cfg >= 3.5:
                cfg = 1.0
        elif cfg <= 0 or cfg >= 6.0:
            cfg = 3.5
        print(
            f"[diffusers] txt2img→native-flux model={Path(unet_path).name} "
            f"TE={stack.get('clip')} cfg={cfg}",
            flush=True,
        )
        return self.generate_compiled_flux(
            unet_path=unet_path,
            clip_name=stack.get("clip"),  # type: ignore[arg-type]
            clip2_name=stack.get("clip2"),  # type: ignore[arg-type]
            clip_type=stack.get("clip_type"),  # type: ignore[arg-type]
            vae_name=stack.get("vae"),  # type: ignore[arg-type]
            loras=[],
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            steps=steps,
            guidance_scale=cfg,
            seed=seed,
            max_shift=1.15,
            base_shift=0.5,
            on_step=on_step,
        )

    def _generate_txt2img_qwen(
        self,
        *,
        model_path: str,
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        on_step: Callable[[int, int], None] | None = None,
    ) -> Image.Image:
        """Bridge /v1/txt2img Qwen requests onto the native compiled path."""
        from app.asset_inventory import resolve_asset_file

        stack = default_qwen_txt2img_stack(Path(model_path).name)
        cfg = float(guidance_scale)
        step_count = max(1, int(steps))
        loras: list[tuple[str, float]] = []
        aura_shift: float | None = None

        # Heuristic: 4/8-step schedules match Comfy Lightning (cfg=1, shift=3, LoRA).
        lightning_guess = step_count in (4, 8)
        if lightning_guess and not stack.get("is_rapid_aio"):
            want4 = step_count == 4
            candidates = (
                (
                    "Qwen-Image-Lightning-4steps-V1.0.safetensors",
                    "Qwen-Image-2512-Lightning-4steps-V1.0.safetensors",
                )
                if want4
                else (
                    "Qwen-Image-2512-Lightning-8steps-V1.0-bf16.safetensors",
                    "Qwen-Image-Lightning-8steps-V2.0-bf16.safetensors",
                    "Qwen-Image-Lightning-8steps-V2.0.safetensors",
                )
            )
            for name in candidates:
                hit = resolve_asset_file(name, "loras")
                if hit is not None:
                    loras.append((str(hit), 1.0))
                    print(f"[diffusers] txt2img Lightning LoRA {hit.name}", flush=True)
                    break
            if loras:
                aura_shift = 3.0
                cfg = 1.0
                if step_count not in (4, 8):
                    step_count = 4 if want4 else 8
            elif cfg <= 0 or cfg >= 6.0:
                cfg = 2.5
        elif cfg <= 0 or cfg >= 6.0:
            # Studio SDXL CFG=7 is too high for Qwen-Image; prefer mid/low.
            cfg = 2.5
        else:
            pass

        if aura_shift is None and not stack.get("is_rapid_aio"):
            aura_shift = 3.1

        print(
            f"[diffusers] txt2img→native-qwen model={Path(model_path).name} "
            f"TE={stack.get('clip')} cfg={cfg} steps={step_count} "
            f"shift={aura_shift} rapid={stack.get('is_rapid_aio')} "
            f"loras={len(loras)}",
            flush=True,
        )
        return self.generate_compiled_qwen(
            model_path=model_path,
            clip_name=stack.get("clip"),  # type: ignore[arg-type]
            vae_name=stack.get("vae"),  # type: ignore[arg-type]
            loras=loras,
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width,
            height=height,
            steps=step_count,
            guidance_scale=cfg,
            seed=seed,
            aura_shift=aura_shift,
            is_rapid_aio=bool(stack.get("is_rapid_aio")),
            on_step=on_step,
        )

    def generate_compiled_flux(
        self,
        *,
        unet_path: str,
        clip_name: str | None,
        clip2_name: str | None,
        clip_type: str | None = None,
        vae_name: str | None,
        loras: list[tuple[str, float]],
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        max_shift: float,
        base_shift: float,
        on_step: Callable[[int, int], None] | None = None,
    ) -> Image.Image:
        """Native Flux / Flux2-Klein from drop-in UNET + TE + VAE (+ LoRA)."""
        import torch

        from app.qwen_prompt import shape_person_prompts

        shaped_prompt, shaped_negative = shape_person_prompts(prompt, negative_prompt)
        width, height = _person_portrait_canvas(shaped_prompt, int(width), int(height))

        key = (
            f"compiled-flux:{unet_path}:{clip_name}:{clip2_name}:"
            f"{clip_type}:{vae_name}"
        )
        with self._lock:
            if self._model_key != key or self._pipe is None:
                self._release_pipe()
                device = "cuda" if torch.cuda.is_available() else "cpu"
                dtype = torch.bfloat16 if device == "cuda" else torch.float32
                pipe = self._load_flux_pipeline(
                    unet_path=unet_path,
                    clip_name=clip_name,
                    clip2_name=clip2_name,
                    clip_type=clip_type,
                    vae_name=vae_name,
                    dtype=dtype,
                )
                if loras:
                    applied = self._fuse_pipeline_loras(pipe, loras)
                    self._lora_key = f"flux:{sorted(loras)}" if applied else "none"
                else:
                    self._lora_key = "none"
                pipe = self._place_compiled_pipe(pipe, dtype, prefer_offload=True)
                self._pipe = pipe
                self._model_key = key
                self._resolved = ResolvedModel(
                    "single_file",
                    unet_path,
                    Path(unet_path).name,
                )
            else:
                pipe = self._pipe
                flux_lora_key = f"flux:{sorted(loras)}"
                if loras and self._lora_key != flux_lora_key:
                    print(
                        "[diffusers] Flux LoRA set changed — reload base to re-fuse",
                        flush=True,
                    )
                    self._release_pipe()
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    dtype = torch.bfloat16 if device == "cuda" else torch.float32
                    pipe = self._load_flux_pipeline(
                        unet_path=unet_path,
                        clip_name=clip_name,
                        clip2_name=clip2_name,
                        clip_type=clip_type,
                        vae_name=vae_name,
                        dtype=dtype,
                    )
                    applied = self._fuse_pipeline_loras(pipe, loras)
                    self._lora_key = flux_lora_key if applied else "none"
                    pipe = self._place_compiled_pipe(pipe, dtype, prefer_offload=True)
                    self._pipe = pipe
                    self._model_key = key
                pipe = self._pipe

        # Flux typically wants low CFG; Klein distilled often ~1.
        cfg = float(guidance_scale)
        if cfg <= 0:
            cfg = 1.0
        step_count = max(1, int(steps))
        # ModelSamplingFlux shifts — apply when scheduler exposes them.
        try:
            if max_shift is not None and hasattr(pipe, "scheduler"):
                if hasattr(pipe.scheduler.config, "max_shift"):
                    pipe.scheduler.config.max_shift = float(max_shift)
                if hasattr(pipe.scheduler.config, "base_shift") and base_shift is not None:
                    pipe.scheduler.config.base_shift = float(base_shift)
        except Exception:
            pass

        generator = torch.Generator(device="cpu").manual_seed(int(seed) & 0xFFFFFFFF)
        callback_on_step_end = None
        if on_step is not None:
            def _cb(pipe_ref, step_index, timestep, callback_kwargs):  # type: ignore[no-untyped-def]
                on_step(int(step_index) + 1, step_count)
                return callback_kwargs

            callback_on_step_end = _cb

        kwargs: dict[str, Any] = {
            "prompt": shaped_prompt,
            "width": int(width),
            "height": int(height),
            "num_inference_steps": step_count,
            "generator": generator,
        }
        # guidance_scale / true_cfg differ by pipeline class.
        try:
            import inspect

            sig = inspect.signature(pipe.__call__)
            if "guidance_scale" in sig.parameters:
                kwargs["guidance_scale"] = cfg
            if "true_cfg_scale" in sig.parameters and cfg > 1.0:
                kwargs["true_cfg_scale"] = cfg
            if "callback_on_step_end" in sig.parameters:
                kwargs["callback_on_step_end"] = callback_on_step_end
            if shaped_negative.strip() and "negative_prompt" in sig.parameters:
                kwargs["negative_prompt"] = shaped_negative
        except Exception:
            kwargs["guidance_scale"] = cfg
            if callback_on_step_end is not None:
                kwargs["callback_on_step_end"] = callback_on_step_end
            if shaped_negative.strip():
                kwargs["negative_prompt"] = shaped_negative

        print(
            f"[diffusers] compiled-flux model={Path(unet_path).name} "
            f"{width}x{height} steps={step_count} cfg={cfg} type={clip_type}",
            flush=True,
        )
        try:
            result = pipe(**kwargs)
            return result.images[0]
        finally:
            self._empty_cuda()

    def _qwen_anatomy_loras(
        self,
        *,
        prompt: str,
        existing: list[tuple[str, float]],
    ) -> list[tuple[str, float]]:
        """Auto-attach GenatomyFixer when generating people and graph omitted it."""
        from app.asset_inventory import list_asset_inventory, resolve_asset_file

        if not re.search(
            r"\b(man|woman|men|women|person|people|boy|girl|figure)\b",
            prompt,
            flags=re.IGNORECASE,
        ):
            return existing
        if any("genatomy" in Path(path).name.lower() for path, _ in existing):
            return existing
        fixer = resolve_asset_file("Qwen-Image-GenatomyFixer.safetensors", "loras")
        if fixer is None:
            for item in list_asset_inventory().get("loras", []):
                if "genatomy" in item.id.lower():
                    fixer = Path(item.path)
                    break
        if fixer is None:
            return existing
        print(f"[diffusers] Qwen anatomy LoRA {fixer.name}", flush=True)
        return [(str(fixer), 1.0), *existing]

    def generate_compiled_qwen(
        self,
        *,
        model_path: str,
        clip_name: str | None,
        vae_name: str | None,
        loras: list[tuple[str, float]],
        prompt: str,
        negative_prompt: str,
        width: int,
        height: int,
        steps: int,
        guidance_scale: float,
        seed: int,
        aura_shift: float | None = None,
        is_rapid_aio: bool = False,
        on_step: Callable[[int, int], None] | None = None,
    ) -> Image.Image:
        """Native Qwen-Image from drop-in weights (+ optional VAE/Lightning LoRA)."""
        import torch

        from app.qwen_prompt import shape_qwen_prompts

        shaped_prompt, shaped_negative = shape_qwen_prompts(prompt, negative_prompt)
        width, height = _person_portrait_canvas(shaped_prompt, int(width), int(height))
        loras = self._qwen_anatomy_loras(prompt=shaped_prompt, existing=list(loras))

        key = f"compiled-qwen:{model_path}:{clip_name}:{vae_name}:{is_rapid_aio}"
        with self._lock:
            if self._model_key != key or self._pipe is None:
                self._release_pipe()
                device = "cuda" if torch.cuda.is_available() else "cpu"
                dtype = torch.bfloat16 if device == "cuda" else torch.float32
                pipe = self._load_qwen_pipeline(
                    model_path=model_path,
                    clip_name=clip_name,
                    vae_name=vae_name,
                    dtype=dtype,
                    is_rapid_aio=is_rapid_aio,
                )
                # Fuse LoRAs before offload so adapters attach on CPU-resident modules.
                if loras:
                    applied = self._fuse_pipeline_loras(pipe, loras)
                    self._lora_key = f"qwen:{sorted(loras)}" if applied else "none"
                    if not applied:
                        print("[diffusers] Qwen LoRAs failed to apply", flush=True)
                else:
                    self._lora_key = "none"
                pipe = self._place_compiled_pipe(pipe, dtype, prefer_offload=True)
                self._pipe = pipe
                self._model_key = key
                self._resolved = ResolvedModel(
                    "single_file",
                    model_path,
                    Path(model_path).name,
                )
            else:
                pipe = self._pipe
                qwen_lora_key = f"qwen:{sorted(loras)}"
                if loras and self._lora_key != qwen_lora_key:
                    # Reload clean base when LoRA set changes (fused weights stick).
                    self._release_pipe()
                    device = "cuda" if torch.cuda.is_available() else "cpu"
                    dtype = torch.bfloat16 if device == "cuda" else torch.float32
                    pipe = self._load_qwen_pipeline(
                        model_path=model_path,
                        clip_name=clip_name,
                        vae_name=vae_name,
                        dtype=dtype,
                        is_rapid_aio=is_rapid_aio,
                    )
                    applied = self._fuse_pipeline_loras(pipe, loras)
                    self._lora_key = qwen_lora_key if applied else "none"
                    if not applied:
                        print("[diffusers] Qwen LoRAs failed to apply", flush=True)
                    pipe = self._place_compiled_pipe(pipe, dtype, prefer_offload=True)
                    self._pipe = pipe
                    self._model_key = key
                pipe = self._pipe

        # ModelSamplingAuraFlow.shift → scheduler when exposed.
        lightning = _qwen_loras_are_lightning(loras) or _qwen_path_is_lightning(
            model_path
        )
        if aura_shift is None:
            aura_shift = 3.0 if lightning else 3.1
        if aura_shift is not None:
            try:
                if hasattr(pipe, "scheduler") and hasattr(pipe.scheduler, "config"):
                    if hasattr(pipe.scheduler.config, "shift"):
                        pipe.scheduler.config.shift = float(aura_shift)
                        print(
                            f"[diffusers] Qwen AuraFlow shift={aura_shift}"
                            f"{' (lightning)' if lightning else ''}",
                            flush=True,
                        )
            except Exception as exc:
                print(f"[diffusers] AuraFlow shift skipped: {exc}", flush=True)

        cfg = float(guidance_scale) if float(guidance_scale) > 0 else (1.0 if lightning else 2.5)
        # true_cfg_scale <= 1 disables negatives. Comfy Lightning keeps cfg=1 —
        # do not bump (that grainy look vs Comfy). Non-lightning can bump slightly.
        if (
            not lightning
            and shaped_negative.strip()
            and cfg <= 1.0
            and "elongated fingers" in shaped_negative.lower()
        ):
            cfg = 1.5
            print("[diffusers] Qwen CFG bumped to 1.5 so hand negatives apply", flush=True)
        if lightning and cfg > 1.25:
            print(
                f"[diffusers] Lightning CFG {cfg} → 1.0 (Comfy LightX2V default)",
                flush=True,
            )
            cfg = 1.0
        step_count = max(1, int(steps))
        if lightning and step_count not in (4, 8) and step_count > 12:
            target = _lightning_step_target(loras, step_count)
            print(
                f"[diffusers] Lightning steps {step_count} → {target} (Comfy default)",
                flush=True,
            )
            step_count = target
        # Keep caller canvas; only bump tiny sizes. Avoid extreme tall bias (mutant limbs).
        gen_width, gen_height = int(width), int(height)
        if min(gen_width, gen_height) < 768:
            gen_width = max(gen_width, 768)
            gen_height = max(gen_height, 1024)
        gen_width = max(64, (gen_width // 16) * 16)
        gen_height = max(64, (gen_height // 16) * 16)

        generator = torch.Generator(device="cpu").manual_seed(int(seed) & 0xFFFFFFFF)
        callback_on_step_end = None
        if on_step is not None:
            def _cb(pipe_ref, step_index, timestep, callback_kwargs):  # type: ignore[no-untyped-def]
                on_step(int(step_index) + 1, step_count)
                return callback_kwargs

            callback_on_step_end = _cb

        kwargs: dict[str, Any] = {
            "prompt": shaped_prompt,
            "width": gen_width,
            "height": gen_height,
            "num_inference_steps": step_count,
            "generator": generator,
            "callback_on_step_end": callback_on_step_end,
        }
        # Qwen-Image uses true_cfg_scale; fall back to guidance_scale if needed.
        try:
            import inspect

            sig = inspect.signature(pipe.__call__)
            if "true_cfg_scale" in sig.parameters:
                kwargs["true_cfg_scale"] = cfg
            else:
                kwargs["guidance_scale"] = cfg
        except Exception:
            kwargs["true_cfg_scale"] = cfg
        if shaped_negative.strip():
            kwargs["negative_prompt"] = shaped_negative

        print(
            f"[diffusers] compiled-qwen model={Path(model_path).name} "
            f"{gen_width}x{gen_height} steps={step_count} cfg={cfg}",
            flush=True,
        )
        try:
            result = pipe(**kwargs)
            return result.images[0]
        finally:
            self._empty_cuda()


pipeline_holder = PipelineHolder()
