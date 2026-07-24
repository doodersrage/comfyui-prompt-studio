from __future__ import annotations

from dataclasses import dataclass
from typing import Any


DEFAULT_SDXL_NEGATIVE = (
    "blurry, low quality, deformed, disfigured, bad anatomy, extra limbs, "
    "bad hands, fused fingers, extra fingers, missing fingers, "
    "extra arms, floating hands, disembodied hand, "
    "long arms, elongated arms, disproportionate limbs, "
    "watermark, text, logo, oversaturated"
)


@dataclass(frozen=True)
class SamplingPlan:
    width: int
    height: int
    steps: int
    guidance_scale: float
    negative_prompt: str
    family: str  # "sdxl" | "turbo" | "sd15" | "other"


def _snap_dim(value: int, *, minimum: int, maximum: int = 2048) -> int:
    snapped = max(minimum, min(maximum, int(value)))
    # Diffusers latents want multiples of 8.
    return max(minimum, (snapped // 8) * 8)


def detect_family(pipe: Any, resolved_label: str | None = None) -> str:
    name = type(pipe).__name__.lower()
    label = (resolved_label or "").lower()
    haystack = f"{name} {label}"
    if "turbo" in haystack or "lcm" in haystack or "lightning" in haystack:
        return "turbo"
    if "xl" in haystack or "sdxl" in haystack:
        return "sdxl"
    if "stable diffusion" in name or name.startswith("stablediffusionpipeline"):
        return "sd15"
    return "other"


def plan_sampling(
    *,
    pipe: Any,
    width: int,
    height: int,
    steps: int,
    guidance_scale: float,
    negative_prompt: str,
    resolved_label: str | None = None,
) -> SamplingPlan:
    """Normalize studio/Turbo queue params into Diffusers-friendly sampling."""
    family = detect_family(pipe, resolved_label)

    if family == "turbo":
        return SamplingPlan(
            width=_snap_dim(width or 1024, minimum=512),
            height=_snap_dim(height or 1024, minimum=512),
            steps=max(1, min(steps or 4, 8)),
            guidance_scale=0.0 if guidance_scale <= 0 else guidance_scale,
            negative_prompt=negative_prompt or "",
            family=family,
        )

    if family == "sdxl":
        # Grey mush is common when studio sends draft/Turbo sizes + cfg=0.
        w = width if width >= 768 else 1024
        h = height if height >= 768 else 1024
        # Preserve aspect if one side was already large.
        if width >= 768 and height < 768:
            h = max(768, int(round(width * (height / max(width, 1)))))
        if height >= 768 and width < 768:
            w = max(768, int(round(height * (width / max(height, 1)))))
        label = (resolved_label or "").lower()
        # RealVis / photoreal finetunes prefer mid CFG; stock base likes ~7.
        is_realvis = "realvis" in label
        default_cfg = 5.5 if is_realvis else 7.0
        if guidance_scale < 3.0:
            cfg = default_cfg
        elif is_realvis and guidance_scale >= 6.5:
            # Studio/proxy often still sends stock CFG=7 — soften for RealVis.
            cfg = 5.5
        else:
            cfg = guidance_scale
        # More steps = more SDXL detail once VRAM is free (Comfy unloaded).
        min_steps = 30 if is_realvis else 28
        default_steps = 40
        step_count = steps if steps >= min_steps else default_steps
        neg = negative_prompt.strip() or DEFAULT_SDXL_NEGATIVE
        return SamplingPlan(
            width=_snap_dim(w, minimum=768),
            height=_snap_dim(h, minimum=768),
            steps=min(step_count, 50),
            guidance_scale=min(cfg, 12.0),
            negative_prompt=neg,
            family=family,
        )

    # SD1.5 / other
    cfg = guidance_scale if guidance_scale >= 1.0 else 7.0
    step_count = steps if steps >= 20 else 25
    return SamplingPlan(
        width=_snap_dim(width or 512, minimum=512),
        height=_snap_dim(height or 512, minimum=512),
        steps=min(step_count, 50),
        guidance_scale=min(cfg, 15.0),
        negative_prompt=negative_prompt.strip() or DEFAULT_SDXL_NEGATIVE,
        family=family,
    )
