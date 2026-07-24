from __future__ import annotations

import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from app.model_resolve import resolve_model


class ModelResolveTests(unittest.TestCase):
    def test_resolves_checkpoint_under_comfy_root(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            ckpt_dir = root / "models" / "checkpoints"
            ckpt_dir.mkdir(parents=True)
            weight = ckpt_dir / "sd_xl_base_1.0.safetensors"
            weight.write_bytes(b"fake")

            with mock.patch.dict(os.environ, {"COMFYUI_ROOT": str(root)}, clear=False):
                resolved = resolve_model("sdxl", default_hub="stabilityai/sdxl-turbo")

            self.assertEqual(resolved.kind, "single_file")
            self.assertEqual(Path(resolved.source), weight)

    def test_resolves_diffusers_dir_under_comfy_root(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            model_dir = root / "models" / "diffusers" / "my-local-model"
            model_dir.mkdir(parents=True)
            (model_dir / "model_index.json").write_text("{}", encoding="utf-8")

            with mock.patch.dict(os.environ, {"COMFYUI_ROOT": str(root)}, clear=False):
                resolved = resolve_model(
                    "my-local-model",
                    default_hub="stabilityai/sdxl-turbo",
                )

            self.assertEqual(resolved.kind, "diffusers_dir")
            self.assertEqual(Path(resolved.source), model_dir)

    def test_falls_back_to_hub_id(self) -> None:
        with TemporaryDirectory() as tmp:
            with mock.patch.dict(
                os.environ,
                {"COMFYUI_ROOT": tmp, "DIFFUSERS_MODEL_DIR": ""},
                clear=False,
            ):
                # Empty models tree → hub.
                resolved = resolve_model(
                    "stabilityai/sdxl-turbo",
                    default_hub="stabilityai/sdxl-turbo",
                )
            self.assertEqual(resolved.kind, "hub")
            self.assertEqual(resolved.source, "stabilityai/sdxl-turbo")

    def test_flux_studio_id_prefers_local_sdxl_checkpoint(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            ckpt_dir = root / "models" / "checkpoints"
            diff_dir = root / "models" / "diffusion_models"
            ckpt_dir.mkdir(parents=True)
            diff_dir.mkdir(parents=True)
            sdxl = ckpt_dir / "sd_xl_base_1.0.safetensors"
            sdxl.write_bytes(b"fake")
            (diff_dir / "flux-2-klein-9b.safetensors").write_bytes(b"fake")

            with mock.patch.dict(os.environ, {"COMFYUI_ROOT": str(root)}, clear=False):
                resolved = resolve_model(
                    "flux-2-klein-9b-distilled",
                    default_hub="stabilityai/sdxl-turbo",
                )

            self.assertEqual(resolved.kind, "single_file")
            self.assertEqual(Path(resolved.source), sdxl)

    def test_prefers_realvis_over_stock_sdxl(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            ckpt_dir = root / "models" / "checkpoints"
            ckpt_dir.mkdir(parents=True)
            stock = ckpt_dir / "sd_xl_base_1.0.safetensors"
            realvis = ckpt_dir / "RealVisXL_V5.0_fp16.safetensors"
            stock.write_bytes(b"fake")
            realvis.write_bytes(b"fake")

            with mock.patch.dict(os.environ, {"COMFYUI_ROOT": str(root)}, clear=False):
                resolved = resolve_model("sdxl", default_hub="stabilityai/sdxl-turbo")

            self.assertEqual(resolved.kind, "single_file")
            self.assertEqual(Path(resolved.source), realvis)

    def test_flux_prefers_realvis_when_present(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            ckpt_dir = root / "models" / "checkpoints"
            diff_dir = root / "models" / "diffusion_models"
            ckpt_dir.mkdir(parents=True)
            diff_dir.mkdir(parents=True)
            stock = ckpt_dir / "sd_xl_base_1.0.safetensors"
            realvis = ckpt_dir / "RealVisXL_V5.0_fp16.safetensors"
            stock.write_bytes(b"fake")
            realvis.write_bytes(b"fake")
            (diff_dir / "flux-2-klein-9b.safetensors").write_bytes(b"fake")

            with mock.patch.dict(os.environ, {"COMFYUI_ROOT": str(root)}, clear=False):
                resolved = resolve_model(
                    "flux-2-klein-9b-distilled",
                    default_hub="stabilityai/sdxl-turbo",
                )

            self.assertEqual(Path(resolved.source), realvis)


if __name__ == "__main__":
    unittest.main()
