from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from app.model_resolve import comfyui_root


@dataclass(frozen=True)
class ResolvedLora:
    path: str
    name: str
    weight: float
    adapter: str


# Auto-applied for SDXL person shots when present (or downloadable).
_DEFAULT_HAND_LORA = "HandFineTuning_XL.safetensors"
_DEFAULT_HAND_WEIGHT = 1.0
_DEFAULT_DETAIL_LORA = "Detail-Tweaker-XL.safetensors"
# Keep detail light — it fights the hand LoRA on fingers.
_DEFAULT_DETAIL_WEIGHT = 0.15

# Hugging Face fallback for the hand LoRA (no multi-GB checkpoint swap).
_HAND_HF_REPO = "Old-Fisherman/SDXL_Models"
_HAND_HF_FILE = "SDXL_loras/HandFineTuning_XL.safetensors"


def _lora_roots() -> list[Path]:
    roots: list[Path] = []
    explicit = os.environ.get("DIFFUSERS_LORA_DIR", "").strip()
    if explicit:
        path = Path(explicit).expanduser().resolve()
        if path.is_dir():
            roots.append(path)
    comfy = comfyui_root()
    if comfy is not None:
        candidate = comfy / "models" / "loras"
        if candidate.is_dir():
            roots.append(candidate)
    # Service-local cache for auto-downloaded adapters.
    local = Path(__file__).resolve().parents[1] / "loras"
    local.mkdir(parents=True, exist_ok=True)
    roots.append(local)
    return roots


def _find_lora_file(name: str) -> Path | None:
    needle = Path(name).name
    stems = {needle.lower(), Path(needle).stem.lower()}
    for root in _lora_roots():
        direct = root / needle
        if direct.is_file():
            return direct
        try:
            for child in root.iterdir():
                if not child.is_file():
                    continue
                if child.name.lower() in stems or child.stem.lower() in stems:
                    return child
        except OSError:
            continue
    return None


def _parse_spec(spec: str) -> tuple[str, float]:
    """
    Parse `name`, `name:0.7`, or `/path/to.safetensors:0.55`.
    """
    text = spec.strip()
    if not text:
        return "", 1.0
    # Windows drive letters aside — we run on Linux; split on last colon if float.
    if ":" in text:
        left, _, right = text.rpartition(":")
        try:
            weight = float(right)
            if left.strip():
                return left.strip(), weight
        except ValueError:
            pass
    return text, 1.0


def _ensure_hand_lora() -> Path | None:
    existing = _find_lora_file(_DEFAULT_HAND_LORA)
    if existing is not None:
        return existing
    if os.environ.get("DIFFUSERS_LORA_DOWNLOAD", "1").strip().lower() in (
        "0",
        "false",
        "no",
        "off",
    ):
        return None
    try:
        from huggingface_hub import hf_hub_download
    except Exception:
        return None

    cache_dir = Path(__file__).resolve().parents[1] / "loras"
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / _DEFAULT_HAND_LORA
    if target.is_file():
        return target
    try:
        print(
            f"[diffusers] downloading hand LoRA {_HAND_HF_REPO}/{_HAND_HF_FILE}",
            flush=True,
        )
        downloaded = hf_hub_download(
            repo_id=_HAND_HF_REPO,
            filename=_HAND_HF_FILE,
            local_dir=str(cache_dir / ".hf"),
        )
        src = Path(downloaded)
        if src.is_file():
            target.write_bytes(src.read_bytes())
            return target
    except Exception as error:
        print(f"[diffusers] hand LoRA download failed: {error}", flush=True)
    return _find_lora_file(_DEFAULT_HAND_LORA)


def resolve_loras(
    *,
    wants_person: bool = False,
    workshop_role: bool = False,
    workshop_mitts: bool | None = None,
) -> list[ResolvedLora]:
    """
    Resolve LoRAs to apply.

    `DIFFUSERS_LORA` overrides defaults (comma-separated `name[:weight]`).
    When unset and `wants_person`, auto-attach hand + optional detail XL LoRAs.
    """
    if workshop_mitts is not None:
        workshop_role = workshop_mitts
    explicit = os.environ.get("DIFFUSERS_LORA", "").strip()
    specs: list[tuple[str, float]] = []
    if explicit:
        for part in explicit.split(","):
            name, weight = _parse_spec(part)
            if name:
                specs.append((name, weight))
    elif wants_person:
        hand = _ensure_hand_lora()
        if hand is not None:
            specs.append((str(hand), _DEFAULT_HAND_WEIGHT))
        detail = _find_lora_file(_DEFAULT_DETAIL_LORA)
        if detail is None:
            detail = _find_lora_file("add-detail-xl.safetensors")
        if detail is not None:
            # Workshop frames already de-emphasize hands; keep detail light.
            weight = 0.12 if workshop_role else _DEFAULT_DETAIL_WEIGHT
            specs.append((str(detail), weight))

    resolved: list[ResolvedLora] = []
    seen: set[str] = set()
    for index, (name, weight) in enumerate(specs):
        path = Path(name).expanduser()
        if not path.is_file():
            found = _find_lora_file(name)
            if found is None:
                print(f"[diffusers] LoRA not found: {name}", flush=True)
                continue
            path = found
        key = str(path.resolve())
        if key in seen:
            continue
        seen.add(key)
        adapter = re.sub(r"[^a-zA-Z0-9_]+", "_", path.stem)[:48] or f"lora{index}"
        resolved.append(
            ResolvedLora(
                path=key,
                name=path.name,
                weight=max(0.0, min(weight, 1.5)),
                adapter=f"{adapter}_{index}",
            )
        )
    return resolved


def lora_cache_key(loras: list[ResolvedLora]) -> str:
    if not loras:
        return "none"
    return "|".join(f"{item.name}:{item.weight:.2f}" for item in loras)
