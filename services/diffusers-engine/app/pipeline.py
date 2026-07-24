from __future__ import annotations

import os
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw

from app.lora_resolve import lora_cache_key, resolve_loras
from app.model_resolve import ResolvedModel, describe_search_paths, resolve_model
from app.prompt_encode import encode_sdxl_prompts, prompt_wants_person
from app.sampling import plan_sampling


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


DEFAULT_MODEL = os.environ.get("DIFFUSERS_MODEL", "stabilityai/sdxl-turbo").strip()
MOCK_MODE = env_flag("DIFFUSERS_MOCK")
SDXL_CONFIG_ID = os.environ.get(
    "DIFFUSERS_SDXL_CONFIG",
    "stabilityai/stable-diffusion-xl-base-1.0",
).strip()
SDXL_VAE_ID = os.environ.get(
    "DIFFUSERS_SDXL_VAE",
    "madebyollin/sdxl-vae-fp16-fix",
).strip()
SDXL_FORCE_FP32 = env_flag("DIFFUSERS_SDXL_FP32")
CPU_OFFLOAD = env_flag("DIFFUSERS_CPU_OFFLOAD")


class PipelineHolder:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pipe: Any = None
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
            if resolved.label != "sd_xl_base_1.0.safetensors":
                fallback = resolve_model("sdxl", default_hub=DEFAULT_MODEL)
                if (
                    fallback.kind != "hub"
                    and fallback.source != resolved.source
                ):
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

    def _apply_loras(self, pipe: Any, *, wants_person: bool) -> Any:
        """Fuse SDXL LoRAs for this generate (hand fix + optional detail)."""
        is_xl = "xl" in type(pipe).__name__.lower()
        if not is_xl:
            return pipe
        loras = resolve_loras(wants_person=wants_person)
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
        self._lora_key = key if fused else "none"
        return pipe

    def _decode_latents_fp32(self, pipe: Any, latents: Any) -> Image.Image:
        """Decode in float32 — stock/fp16 VAE paths often wash to grey soup."""
        import warnings

        import torch

        vae = pipe.vae
        scaling = float(getattr(vae.config, "scaling_factor", 0.13025))
        original_dtype = next(vae.parameters()).dtype

        # Diffusers warns on temporary fp32 cast even when intentional for color.
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message=r".*should be kept in float32.*",
            )
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

        import torch

        self._empty_cuda()
        pipe = self._ensure_loaded(model_id)
        wants_person = prompt_wants_person(prompt)
        pipe = self._apply_loras(pipe, wants_person=wants_person)
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
            result = pipe(**run_kwargs)
            image = self._decode_latents_fp32(pipe, result.images)
        finally:
            self._empty_cuda()

        if on_step:
            on_step(plan.steps, plan.steps)
        return image


pipeline_holder = PipelineHolder()
