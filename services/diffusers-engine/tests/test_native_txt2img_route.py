from __future__ import annotations

import unittest
from unittest import mock

from app.asset_inventory import infer_native_family
from app.pipeline import (
    _person_portrait_canvas,
    _prefer_qwen_lightning_bf16_path,
    _resolve_qwen_unet_path,
)


class NativeTxt2ImgRouteTests(unittest.TestCase):
    def test_infer_flux_and_qwen_families(self) -> None:
        self.assertEqual(infer_native_family("flux-2-klein-9b.safetensors"), "flux")
        self.assertEqual(infer_native_family("flux1-dev.safetensors"), "flux")
        self.assertEqual(infer_native_family("qwen_image_2512_bf16.safetensors"), "qwen")
        self.assertEqual(infer_native_family("Qwen-Rapid-AIO-SFW-v23.safetensors"), "qwen")
        self.assertIsNone(infer_native_family("RealVisXL_V5.0_fp16.safetensors"))

    def test_person_square_becomes_portrait(self) -> None:
        w, h = _person_portrait_canvas(
            "a woman in a wrap dress on a city street",
            1024,
            1024,
        )
        self.assertLess(w, h)
        self.assertAlmostEqual(w / h, 0.75, delta=0.05)

    def test_landscape_unchanged(self) -> None:
        w, h = _person_portrait_canvas(
            "a woman walking",
            1152,
            896,
        )
        self.assertEqual((w, h), (1152, 896))

    def test_non_person_square_unchanged(self) -> None:
        w, h = _person_portrait_canvas("a mountain lake at dawn", 1024, 1024)
        self.assertEqual((w, h), (1024, 1024))

    def test_lightning_prefers_bf16_over_fp8(self) -> None:
        from pathlib import Path

        hit = Path("/models/diffusion_models/qwen_image_2512_bf16.safetensors")
        with mock.patch(
            "app.asset_inventory.resolve_asset_file",
            return_value=hit,
        ), mock.patch.object(Path, "is_file", return_value=True):
            out = _prefer_qwen_lightning_bf16_path(
                "/models/qwen_image_2512_fp8_e4m3fn.safetensors"
            )
        self.assertEqual(out, str(hit))

    def test_resolve_unet_lightning_vs_vanilla(self) -> None:
        with mock.patch(
            "app.pipeline._prefer_qwen_lightning_bf16_path",
            return_value="/x/bf16.safetensors",
        ) as bf16, mock.patch(
            "app.pipeline._prefer_qwen_fp8_resident_path",
            return_value="/x/fp8.safetensors",
        ) as fp8, mock.patch("app.pipeline.LIGHTNING_BF16", False):
            # Default Lightning stays on fp8 resident path (fast on 24GB).
            self.assertEqual(
                _resolve_qwen_unet_path("/x/fp8.safetensors", lightning=True),
                "/x/fp8.safetensors",
            )
            bf16.assert_not_called()
            fp8.assert_called_once()
        with mock.patch(
            "app.pipeline._prefer_qwen_lightning_bf16_path",
            return_value="/x/bf16.safetensors",
        ) as bf16, mock.patch(
            "app.pipeline._prefer_qwen_fp8_resident_path",
            return_value="/x/fp8.safetensors",
        ) as fp8, mock.patch("app.pipeline.LIGHTNING_BF16", True):
            self.assertEqual(
                _resolve_qwen_unet_path("/x/fp8.safetensors", lightning=True),
                "/x/bf16.safetensors",
            )
            bf16.assert_called_once()
            fp8.assert_not_called()

    def test_generate_routes_flux_away_from_sdxl(self) -> None:
        from app.pipeline import PipelineHolder
        from app.model_resolve import ResolvedModel

        holder = PipelineHolder()
        with (
            mock.patch(
                "app.pipeline.resolve_model",
                return_value=ResolvedModel(
                    "single_file",
                    "/tmp/flux-2-klein-9b.safetensors",
                    "flux-2-klein-9b.safetensors",
                ),
            ),
            mock.patch.object(
                holder,
                "_generate_txt2img_flux",
                return_value="ok-flux",
            ) as flux_route,
            mock.patch.object(holder, "_ensure_loaded") as ensure,
        ):
            out = holder.generate(
                prompt="a woman in a city",
                negative_prompt="",
                model="flux-2-klein-9b.safetensors",
                width=1024,
                height=1024,
                steps=20,
                guidance_scale=7.0,
                seed=1,
            )
        self.assertEqual(out, "ok-flux")
        flux_route.assert_called_once()
        ensure.assert_not_called()


if __name__ == "__main__":
    unittest.main()
