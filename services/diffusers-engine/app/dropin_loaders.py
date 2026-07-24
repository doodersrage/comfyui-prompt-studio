"""Load Comfy-style drop-in TE / packed Rapid-AIO weights into Diffusers modules."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from safetensors.torch import load_file, save_file


def _strip_prefix(state: dict[str, Any], prefix: str) -> dict[str, Any]:
    if not prefix:
        return state
    out: dict[str, Any] = {}
    for key, value in state.items():
        if key.startswith(prefix):
            out[key[len(prefix) :]] = value
        else:
            out[key] = value
    return out


def load_clip_l_text_encoder(path: str | Path, dtype: Any) -> Any:
    """Load Comfy clip_l.safetensors into transformers CLIPTextModel."""
    from transformers import CLIPTextConfig, CLIPTextModel

    path = Path(path)
    raw = load_file(str(path))
    state = _strip_prefix(raw, "text_model.")
    config = CLIPTextConfig(
        vocab_size=49408,
        hidden_size=768,
        intermediate_size=3072,
        num_hidden_layers=12,
        num_attention_heads=12,
        max_position_embeddings=77,
        hidden_act="quick_gelu",
        layer_norm_eps=1e-5,
        dropout=0.0,
        attention_dropout=0.0,
        initializer_range=0.02,
        initializer_factor=1.0,
        pad_token_id=1,
        bos_token_id=0,
        eos_token_id=2,
        model_type="clip_text_model",
        projection_dim=768,
    )
    model = CLIPTextModel(config)
    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing:
        raise RuntimeError(
            f"clip_l load incomplete ({path.name}): missing {len(missing)} keys"
        )
    if unexpected:
        print(
            f"[diffusers] clip_l unexpected keys ignored: {len(unexpected)}",
            flush=True,
        )
    return model.to(dtype=dtype)


def remap_qwen25_vl_comfy_keys(state: dict[str, Any]) -> dict[str, Any]:
    """Map Comfy / older HF Qwen2.5-VL keys onto current transformers layout."""
    out: dict[str, Any] = {}
    for key, value in state.items():
        new_key = key
        if new_key.startswith("transformer."):
            new_key = new_key[len("transformer.") :]
        if new_key.startswith("model.layers."):
            new_key = "model.language_model.layers." + new_key[len("model.layers.") :]
        elif new_key.startswith("model.embed_tokens."):
            new_key = "model.language_model.embed_tokens." + new_key[
                len("model.embed_tokens.") :
            ]
        elif new_key.startswith("model.norm."):
            new_key = "model.language_model.norm." + new_key[len("model.norm.") :]
        elif new_key.startswith("visual."):
            new_key = "model.visual." + new_key[len("visual.") :]
        elif new_key == "lm_head.weight":
            new_key = "lm_head.weight"
        out[new_key] = value
    return out


def load_qwen25_vl_from_single_file(
    path: str | Path,
    *,
    config_dir: str | Path,
    dtype: Any,
) -> Any:
    """Load Comfy qwen_2.5_vl_*.safetensors into Qwen2_5_VLForConditionalGeneration."""
    from transformers import Qwen2_5_VLForConditionalGeneration

    path = Path(path)
    config_dir = Path(config_dir)
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        str(config_dir),
        torch_dtype=dtype,
        local_files_only=True,
    )
    state = remap_qwen25_vl_comfy_keys(load_file(str(path)))
    missing, unexpected = model.load_state_dict(state, strict=False)
    loaded = len(state) - len(unexpected)
    if loaded < 100:
        raise RuntimeError(
            f"Qwen TE load failed for {path.name}: only {loaded} keys matched "
            f"(missing={len(missing)} unexpected={len(unexpected)})"
        )
    print(
        f"[diffusers] Qwen TE from drop-in {path.name} "
        f"(matched≈{loaded}, missing={len(missing)})",
        flush=True,
    )
    return model.to(dtype=dtype)


def load_qwen3_causal_from_single_file(
    path: str | Path,
    *,
    dtype: Any,
    hub_id: str = "Qwen/Qwen3-8B",
) -> Any:
    """Load Comfy qwen_3_*.safetensors into Qwen3ForCausalLM (Flux2 Klein TE)."""
    from transformers import Qwen3Config, Qwen3ForCausalLM

    path = Path(path)
    # Prefer config from a matching Hub size when possible.
    name = path.name.lower()
    if "4b" in name:
        hub_id = "Qwen/Qwen3-4B"
    elif "klein" in name or "8b" in name:
        hub_id = "Qwen/Qwen3-8B"

    model = None
    try:
        model = Qwen3ForCausalLM.from_pretrained(
            hub_id,
            torch_dtype=dtype,
            local_files_only=True,
        )
    except Exception:
        try:
            model = Qwen3ForCausalLM.from_pretrained(hub_id, torch_dtype=dtype)
        except Exception as hub_exc:
            # Offline / gated: build config from weight shapes (bf16/fp16 drop-ins).
            print(
                f"[diffusers] Qwen3 hub shell unavailable ({hub_exc}); "
                "inferring config from drop-in weights",
                flush=True,
            )
            model = _qwen3_from_weight_shapes(path, dtype=dtype)

    state = load_file(str(path))
    # Drop Comfy quant metadata keys.
    state = {
        key: value
        for key, value in state.items()
        if not key.endswith(".comfy_quant") and "weight_scale" not in key
    }
    # Skip clearly broken fp8-mixed shards (mixed dtypes / packed uint8).
    bad = [
        key
        for key, value in state.items()
        if hasattr(value, "dtype")
        and str(value.dtype) in ("torch.uint8",)
    ]
    if bad:
        raise RuntimeError(
            f"Qwen3 TE {path.name} looks like Comfy fp8-mixed/packed weights "
            f"({len(bad)} uint8 tensors). Use flux2-klein-9b-base.safetensors "
            "or a bf16/fp16 qwen_3_8b drop-in instead."
        )
    missing, unexpected = model.load_state_dict(state, strict=False)
    loaded = len(state) - len(unexpected)
    if loaded < 50:
        raise RuntimeError(
            f"Qwen3 TE load failed for {path.name}: matched≈{loaded} "
            f"(missing={len(missing)} unexpected={len(unexpected)})"
        )
    print(
        f"[diffusers] Flux2 TE from drop-in {path.name} (matched≈{loaded})",
        flush=True,
    )
    return model.to(dtype=dtype)


def _qwen3_from_weight_shapes(path: Path, *, dtype: Any) -> Any:
    """Instantiate Qwen3ForCausalLM from drop-in weight shapes (no Hub)."""
    from safetensors import safe_open
    from transformers import Qwen3Config, Qwen3ForCausalLM

    with safe_open(str(path), framework="pt") as handle:
        embed = handle.get_tensor("model.embed_tokens.weight")
        gate = handle.get_tensor("model.layers.0.mlp.gate_proj.weight")
        key_w = handle.get_tensor("model.layers.0.self_attn.k_proj.weight")
        layer_ids: set[int] = set()
        for key in handle.keys():
            parts = key.split(".")
            for i, part in enumerate(parts[:-1]):
                if part == "layers" and parts[i + 1].isdigit():
                    layer_ids.add(int(parts[i + 1]))
        vocab, hidden = int(embed.shape[0]), int(embed.shape[1])
        intermediate = int(gate.shape[0])
        head_dim = 128
        num_kv = max(1, int(key_w.shape[0]) // head_dim)
        num_heads = max(1, hidden // head_dim)
        n_layers = (max(layer_ids) + 1) if layer_ids else 36

    config = Qwen3Config(
        vocab_size=vocab,
        hidden_size=hidden,
        intermediate_size=intermediate,
        num_hidden_layers=n_layers,
        num_attention_heads=num_heads,
        num_key_value_heads=num_kv,
        head_dim=head_dim,
    )
    model = Qwen3ForCausalLM(config)
    try:
        model.to(dtype=dtype)
    except Exception:
        pass
    return model


def extract_rapid_aio_components(path: str | Path) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    """Split Rapid-AIO packed safetensors into transformer temp file + TE/VAE dicts.

    Returns (transformer_temp_path, text_encoder_state, vae_state).
    Caller should unlink the temp transformer file when done loading.
    """
    path = Path(path)
    raw = load_file(str(path))
    transformer: dict[str, Any] = {}
    text_encoder: dict[str, Any] = {}
    vae: dict[str, Any] = {}
    te_prefix = None
    for key, value in raw.items():
        if key.startswith("model.diffusion_model."):
            transformer[key] = value
        elif key.startswith("text_encoders."):
            # text_encoders.<name>.transformer.<rest> or text_encoders.<name>.<rest>
            parts = key.split(".", 2)
            if len(parts) < 3:
                continue
            rest = parts[2]
            if rest.startswith("transformer."):
                rest = rest[len("transformer.") :]
            if rest in ("logit_scale",):
                continue
            text_encoder[rest] = value
            te_prefix = parts[1]
        elif key.startswith("vae."):
            vae[key[len("vae.") :]] = value
    if not transformer:
        raise RuntimeError(f"Rapid-AIO missing diffusion_model weights: {path.name}")
    if not text_encoder:
        raise RuntimeError(f"Rapid-AIO missing text_encoders weights: {path.name}")
    tmp = tempfile.NamedTemporaryFile(suffix=".safetensors", delete=False)
    tmp_path = Path(tmp.name)
    tmp.close()
    save_file(transformer, str(tmp_path))
    print(
        f"[diffusers] Rapid-AIO {path.name}: "
        f"transformer={len(transformer)} te={len(text_encoder)}({te_prefix}) "
        f"vae={len(vae)}",
        flush=True,
    )
    return tmp_path, text_encoder, vae


def is_rapid_aio_name(name: str | None) -> bool:
    if not name:
        return False
    lower = name.lower()
    return "rapid" in lower and "aio" in lower and "qwen" in lower


def is_flux_klein_unet(name: str | None) -> bool:
    if not name:
        return False
    lower = name.lower()
    return "klein" in lower or "flux2" in lower or "flux-2" in lower


def is_fp8_scaled_name(name: str | None) -> bool:
    if not name:
        return False
    lower = name.lower()
    return "fp8" in lower and "scaled" in lower
