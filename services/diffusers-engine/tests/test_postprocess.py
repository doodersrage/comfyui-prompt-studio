from __future__ import annotations

import unittest

from PIL import Image

from app.postprocess import apply_output_post, apply_output_upscale


class PostprocessTests(unittest.TestCase):
    def test_noop_when_scale_missing_or_one(self) -> None:
        img = Image.new("RGB", (100, 80), color=(12, 34, 56))
        self.assertIs(apply_output_upscale(img, scale=None), img)
        self.assertIs(apply_output_upscale(img, scale=1.0), img)
        self.assertIs(apply_output_upscale(img, scale=1.001), img)

    def test_lanczos_lightning_max_scale(self) -> None:
        img = Image.new("RGB", (1152, 1536), color=(20, 40, 60))
        out = apply_output_upscale(img, scale=1.28, method="lanczos")
        self.assertEqual(out.size, (1475, 1966))

    def test_vanilla_chroma_guard(self) -> None:
        img = Image.new("RGB", (1024, 1024), color=(1, 2, 3))
        out = apply_output_upscale(img, scale=1.25, method="lanczos")
        self.assertEqual(out.size, (1280, 1280))

    def test_moire_blur_then_bicubic_keeps_target_size(self) -> None:
        img = Image.new("RGB", (1152, 1536), color=(20, 40, 60))
        out = apply_output_post(
            img,
            scale=1.18,
            method="bicubic",
            moire_blur_sigma=0.4,
        )
        self.assertEqual(out.size, (1359, 1812))

    def test_max_moire_resample_preserves_size(self) -> None:
        img = Image.new("RGB", (100, 100), color=(10, 20, 30))
        out = apply_output_post(
            img,
            scale=1.28,
            method="bicubic",
            moire_blur_sigma=0.5,
            moire_downscale=0.92,
        )
        self.assertEqual(out.size, (128, 128))


if __name__ == "__main__":
    unittest.main()
