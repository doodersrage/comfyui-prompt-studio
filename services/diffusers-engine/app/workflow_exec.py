"""Execute compiled Comfy graphs on Diffusers pipelines."""

from __future__ import annotations

from typing import Any, Callable

from PIL import Image

from app.asset_inventory import resolve_asset_file
from app.comfy_graph import CompiledWorkflow
from app.pipeline import MOCK_MODE, pipeline_holder


def _resolve_required(name: str | None, *buckets: str) -> str:
    if not name or name.startswith("{{"):
        raise FileNotFoundError(f"Unresolved asset token: {name!r}")
    path = resolve_asset_file(name, *buckets)
    if path is None:
        raise FileNotFoundError(f"Asset not found in drop-in folders: {name}")
    return str(path)


def execute_compiled(
    compiled: CompiledWorkflow,
    *,
    on_step: Callable[[int, int], None] | None = None,
) -> Image.Image:
    if MOCK_MODE:
        image = Image.new("RGB", (compiled.width, compiled.height), (32, 36, 48))
        return image

    if compiled.family == "sdxl":
        ckpt = _resolve_required(compiled.checkpoint, "checkpoints")
        loras = []
        for item in compiled.loras:
            path = _resolve_required(item.name, "loras")
            loras.append((path, item.strength))
        return pipeline_holder.generate_compiled_sdxl(
            checkpoint_path=ckpt,
            vae_name=compiled.vae,
            loras=loras,
            prompt=compiled.positive,
            negative_prompt=compiled.negative,
            width=compiled.width,
            height=compiled.height,
            steps=compiled.steps,
            guidance_scale=compiled.cfg,
            seed=compiled.seed,
            on_step=on_step,
        )

    if compiled.family == "flux":
        unet = _resolve_required(compiled.unet, "diffusion_models", "checkpoints")
        return pipeline_holder.generate_compiled_flux(
            unet_path=unet,
            clip_name=compiled.clip,
            clip2_name=compiled.clip2,
            clip_type=compiled.clip_type,
            vae_name=compiled.vae,
            loras=[
                (_resolve_required(item.name, "loras"), item.strength)
                for item in compiled.loras
            ],
            prompt=compiled.positive,
            negative_prompt=compiled.negative,
            width=compiled.width,
            height=compiled.height,
            steps=compiled.steps,
            guidance_scale=compiled.cfg,
            seed=compiled.seed,
            max_shift=compiled.flux_max_shift,
            base_shift=compiled.flux_base_shift,
            on_step=on_step,
        )

    if compiled.family == "qwen":
        model_path = None
        if compiled.unet:
            model_path = _resolve_required(compiled.unet, "diffusion_models", "checkpoints")
        elif compiled.checkpoint:
            model_path = _resolve_required(compiled.checkpoint, "checkpoints")
        else:
            raise FileNotFoundError("Qwen workflow missing UNET/checkpoint.")
        return pipeline_holder.generate_compiled_qwen(
            model_path=model_path,
            clip_name=compiled.clip,
            vae_name=compiled.vae,
            aura_shift=compiled.aura_shift,
            is_rapid_aio=bool(
                compiled.checkpoint
                and "rapid" in compiled.checkpoint.lower()
                and "aio" in compiled.checkpoint.lower()
            ),
            loras=[
                (_resolve_required(item.name, "loras"), item.strength)
                for item in compiled.loras
            ],
            prompt=compiled.positive,
            negative_prompt=compiled.negative,
            width=compiled.width,
            height=compiled.height,
            steps=compiled.steps,
            guidance_scale=compiled.cfg,
            seed=compiled.seed,
            on_step=on_step,
        )

    raise RuntimeError(f"Unsupported compiled family: {compiled.family}")


def assets_preview(compiled: CompiledWorkflow | None) -> dict[str, Any]:
    if compiled is None:
        return {}
    return {
        "checkpoint": compiled.checkpoint,
        "unet": compiled.unet,
        "clip": compiled.clip,
        "clip2": compiled.clip2,
        "vae": compiled.vae,
        "loras": [item.name for item in compiled.loras],
        "family": compiled.family,
        "clip_type": compiled.clip_type,
        "aura_shift": compiled.aura_shift,
        "flux_max_shift": compiled.flux_max_shift,
        "flux_base_shift": compiled.flux_base_shift,
    }
