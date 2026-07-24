from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from app.asset_inventory import list_asset_inventory, resolve_asset_file
from app.comfy_graph import compile_workflow


def _sdxl_graph(ckpt: str = "RealVisXL_V5.0_fp16.safetensors") -> dict:
    return {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": ckpt},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "a glassblower", "clip": ["1", 1]},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "blurry", "clip": ["1", 1]},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 42,
                "steps": 28,
                "cfg": 5.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
        },
        "7": {
            "class_type": "SaveImage",
            "inputs": {"images": ["6", 0], "filename_prefix": "ComfyUI"},
        },
    }


def _flux_graph() -> dict:
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": "flux1-dev.safetensors", "weight_dtype": "default"},
        },
        "2": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": "clip_l.safetensors",
                "clip_name2": "t5xxl_fp16.safetensors",
                "type": "flux",
            },
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": "ae.safetensors"},
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "flux prompt", "clip": ["2", 0]},
        },
        "5": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "", "clip": ["2", 0]},
        },
        "6": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "7": {
            "class_type": "ModelSamplingFlux",
            "inputs": {
                "max_shift": 1.15,
                "base_shift": 0.5,
                "width": 1024,
                "height": 1024,
                "model": ["1", 0],
            },
        },
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 1,
                "steps": 20,
                "cfg": 3.5,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["7", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0],
            },
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["8", 0], "vae": ["3", 0]},
        },
        "10": {
            "class_type": "SaveImage",
            "inputs": {"images": ["9", 0], "filename_prefix": "flux"},
        },
    }


def _qwen_graph() -> dict:
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": "qwen_image_bf16.safetensors", "weight_dtype": "default"},
        },
        "2": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen_2.5_vl_7b.safetensors",
                "type": "qwen_image",
            },
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": "qwen_image_vae.safetensors"},
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "qwen prompt", "clip": ["2", 0]},
        },
        "5": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": "", "clip": ["2", 0]},
        },
        "6": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "7": {
            "class_type": "ModelSamplingAuraFlow",
            "inputs": {"shift": 3.1, "model": ["1", 0]},
        },
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 7,
                "steps": 20,
                "cfg": 2.5,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0,
                "model": ["7", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["6", 0],
            },
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["8", 0], "vae": ["3", 0]},
        },
        "10": {
            "class_type": "SaveImage",
            "inputs": {"images": ["9", 0], "filename_prefix": "qwen"},
        },
    }


class AssetInventoryTests(unittest.TestCase):
    def test_lists_drop_in_buckets(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            ckpt = root / "models" / "checkpoints"
            unet = root / "models" / "diffusion_models"
            te = root / "models" / "text_encoders"
            vae = root / "models" / "vae"
            lora = root / "models" / "loras"
            for path in (ckpt, unet, te, vae, lora):
                path.mkdir(parents=True)
            (ckpt / "RealVisXL_V5.0_fp16.safetensors").write_bytes(b"x")
            (ckpt / "Qwen-Rapid-AIO-SFW-v23.safetensors").write_bytes(b"x")
            (unet / "flux1-dev.safetensors").write_bytes(b"x")
            (unet / "qwen_image_2512_bf16.safetensors").write_bytes(b"x")
            (te / "clip_l.safetensors").write_bytes(b"x")
            (vae / "ae.safetensors").write_bytes(b"x")
            (lora / "detail.safetensors").write_bytes(b"x")

            with mock.patch.dict(os.environ, {"COMFYUI_ROOT": str(root)}, clear=False):
                inventory = list_asset_inventory()
                self.assertTrue(
                    any(item.id == "RealVisXL_V5.0_fp16.safetensors" for item in inventory["checkpoints"])
                )
                qwen_ckpt = next(
                    item
                    for item in inventory["checkpoints"]
                    if item.id == "Qwen-Rapid-AIO-SFW-v23.safetensors"
                )
                self.assertEqual(qwen_ckpt.family, "qwen")
                flux = next(
                    item
                    for item in inventory["diffusion_models"]
                    if item.id == "flux1-dev.safetensors"
                )
                self.assertEqual(flux.family, "flux")
                qwen_unet = next(
                    item
                    for item in inventory["diffusion_models"]
                    if item.id == "qwen_image_2512_bf16.safetensors"
                )
                self.assertEqual(qwen_unet.family, "qwen")
                resolved = resolve_asset_file("ae.safetensors", "vaes")
                self.assertIsNotNone(resolved)
                self.assertEqual(resolved.name, "ae.safetensors")


class ComfyGraphTests(unittest.TestCase):
    def test_compiles_sdxl(self) -> None:
        result = compile_workflow(_sdxl_graph())
        self.assertTrue(result.supported)
        self.assertEqual(result.family, "sdxl")
        assert result.compiled is not None
        self.assertEqual(result.compiled.positive, "a glassblower")
        self.assertEqual(result.compiled.checkpoint, "RealVisXL_V5.0_fp16.safetensors")
        self.assertEqual(result.compiled.steps, 28)

    def test_compiles_flux(self) -> None:
        result = compile_workflow(_flux_graph())
        self.assertTrue(result.supported)
        self.assertEqual(result.family, "flux")
        assert result.compiled is not None
        self.assertEqual(result.compiled.unet, "flux1-dev.safetensors")
        self.assertEqual(result.compiled.flux_max_shift, 1.15)

    def test_compiles_qwen(self) -> None:
        result = compile_workflow(_qwen_graph())
        self.assertTrue(result.supported)
        self.assertEqual(result.family, "qwen")
        assert result.compiled is not None
        self.assertEqual(result.compiled.clip_type, "qwen_image")
        self.assertEqual(result.compiled.aura_shift, 3.1)

    def test_compiles_qwen_rapid_aio_checkpoint(self) -> None:
        graph = {
            "1": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "Qwen-Rapid-AIO-SFW-v23.safetensors"},
            },
            "2": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "a woman", "clip": ["1", 1]},
            },
            "3": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "", "clip": ["1", 1]},
            },
            "4": {
                "class_type": "EmptySD3LatentImage",
                "inputs": {"width": 768, "height": 1024, "batch_size": 1},
            },
            "5": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 1,
                    "steps": 8,
                    "cfg": 1.0,
                    "sampler_name": "euler",
                    "scheduler": "simple",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0],
                },
            },
            "6": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
            },
            "7": {
                "class_type": "SaveImage",
                "inputs": {"images": ["6", 0], "filename_prefix": "rapid"},
            },
        }
        result = compile_workflow(graph)
        self.assertTrue(result.supported, result.reason)
        self.assertEqual(result.family, "qwen")
        assert result.compiled is not None
        self.assertEqual(
            result.compiled.checkpoint,
            "Qwen-Rapid-AIO-SFW-v23.safetensors",
        )

    def test_compiles_flux_klein_cliploader(self) -> None:
        graph = {
            "1": {
                "class_type": "UNETLoader",
                "inputs": {
                    "unet_name": "flux-2-klein-9b.safetensors",
                    "weight_dtype": "default",
                },
            },
            "2": {
                "class_type": "CLIPLoader",
                "inputs": {
                    "clip_name": "qwen_3_8b_fp8mixed.safetensors",
                    "type": "flux2",
                },
            },
            "3": {
                "class_type": "VAELoader",
                "inputs": {"vae_name": "flux2-vae.safetensors"},
            },
            "4": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "klein prompt", "clip": ["2", 0]},
            },
            "5": {
                "class_type": "CLIPTextEncode",
                "inputs": {"text": "", "clip": ["2", 0]},
            },
            "6": {
                "class_type": "EmptyLatentImage",
                "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
            },
            "8": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": 1,
                    "steps": 4,
                    "cfg": 1.0,
                    "sampler_name": "euler",
                    "scheduler": "simple",
                    "denoise": 1.0,
                    "model": ["1", 0],
                    "positive": ["4", 0],
                    "negative": ["5", 0],
                    "latent_image": ["6", 0],
                },
            },
            "9": {
                "class_type": "VAEDecode",
                "inputs": {"samples": ["8", 0], "vae": ["3", 0]},
            },
            "10": {
                "class_type": "SaveImage",
                "inputs": {"images": ["9", 0], "filename_prefix": "klein"},
            },
        }
        result = compile_workflow(graph)
        self.assertTrue(result.supported, result.reason)
        self.assertEqual(result.family, "flux")
        assert result.compiled is not None
        self.assertEqual(result.compiled.clip_type, "flux2")
        self.assertEqual(result.compiled.clip, "qwen_3_8b_fp8mixed.safetensors")

    def test_collects_power_lora_and_loader_nodes(self) -> None:
        graph = _qwen_graph()
        graph["11"] = {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {
                "model": ["1", 0],
                "lora_name": "Qwen-Image-Lightning-4steps-V1.0.safetensors",
                "strength_model": 1.0,
            },
        }
        graph["12"] = {
            "class_type": "Power Lora Loader (rgthree)",
            "inputs": {
                "model": ["11", 0],
                "lora_1": {
                    "on": True,
                    "lora": "Qwen-Image-GenatomyFixer.safetensors",
                    "strength": 0.9,
                },
                "lora_2": {
                    "on": False,
                    "lora": "ignored.safetensors",
                    "strength": 1.0,
                },
            },
        }
        graph["7"]["inputs"]["model"] = ["12", 0]
        result = compile_workflow(graph)
        self.assertTrue(result.supported, result.reason)
        assert result.compiled is not None
        names = [(item.name, item.strength) for item in result.compiled.loras]
        self.assertIn(
            ("Qwen-Image-Lightning-4steps-V1.0.safetensors", 1.0),
            names,
        )
        self.assertIn(("Qwen-Image-GenatomyFixer.safetensors", 0.9), names)
        self.assertFalse(any(name == "ignored.safetensors" for name, _ in names))

    def test_controlnet_unsupported(self) -> None:
        graph = _sdxl_graph()
        graph["99"] = {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {"strength": 1.0},
        }
        result = compile_workflow(graph)
        self.assertFalse(result.supported)
        self.assertIn("ControlNetApplyAdvanced", result.unsupported_nodes)

    def test_denoise_img2img_unsupported(self) -> None:
        graph = _sdxl_graph()
        graph["5"]["inputs"]["denoise"] = 0.65
        result = compile_workflow(graph)
        self.assertFalse(result.supported)
        self.assertIn("denoise", result.reason.lower())


if __name__ == "__main__":
    unittest.main()
