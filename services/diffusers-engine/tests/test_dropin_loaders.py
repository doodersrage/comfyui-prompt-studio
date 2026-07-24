from __future__ import annotations

import unittest

from app.dropin_loaders import (
    is_flux_klein_unet,
    is_fp8_scaled_name,
    is_rapid_aio_name,
    remap_qwen_unet_comfy_keys,
)


class DropinLoaderHelpers(unittest.TestCase):
    def test_rapid_aio_name(self) -> None:
        self.assertTrue(is_rapid_aio_name("Qwen-Rapid-AIO-SFW-v23.safetensors"))
        self.assertFalse(is_rapid_aio_name("qwen_image_2512_bf16.safetensors"))

    def test_flux_klein_unet(self) -> None:
        self.assertTrue(is_flux_klein_unet("flux-2-klein-9b-distilled.safetensors"))
        self.assertTrue(is_flux_klein_unet("flux-2-klein-9b.safetensors"))
        self.assertTrue(is_flux_klein_unet("FLUX.2-klein-base-9b.safetensors"))
        self.assertFalse(is_flux_klein_unet("flux1-dev.safetensors"))

    def test_fp8_scaled(self) -> None:
        self.assertTrue(is_fp8_scaled_name("t5xxl_fp8_e4m3fn_scaled.safetensors"))
        self.assertFalse(is_fp8_scaled_name("clip_l.safetensors"))

    def test_remap_qwen_unet_comfy_keys(self) -> None:
        remapped = remap_qwen_unet_comfy_keys(
            {
                "model.diffusion_model.img_in.weight": 1,
                "model.diffusion_model.img_in.bias": 2,
                "already_ok": 3,
            }
        )
        self.assertEqual(
            remapped,
            {"img_in.weight": 1, "img_in.bias": 2, "already_ok": 3},
        )


if __name__ == "__main__":
    unittest.main()
