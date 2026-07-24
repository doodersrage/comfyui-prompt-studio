from __future__ import annotations

import unittest
from unittest import mock

from app.asset_inventory import infer_native_family
from app.pipeline import _person_portrait_canvas


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
