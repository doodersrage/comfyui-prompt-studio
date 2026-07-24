from __future__ import annotations

import unittest

from app.sampling import plan_sampling


class _FakeXL:
    pass


class _FakeTurbo:
    pass


# Name heuristics look at class __name__.
_FakeXL.__name__ = "StableDiffusionXLPipeline"
_FakeTurbo.__name__ = "StableDiffusionXLPipeline"


class SamplingPlanTests(unittest.TestCase):
    def test_sdxl_lifts_turbo_params(self) -> None:
        plan = plan_sampling(
            pipe=_FakeXL(),
            width=512,
            height=512,
            steps=4,
            guidance_scale=0,
            negative_prompt="",
            resolved_label="sd_xl_base_1.0.safetensors",
        )
        self.assertEqual(plan.family, "sdxl")
        self.assertGreaterEqual(plan.width, 768)
        self.assertGreaterEqual(plan.height, 768)
        self.assertGreaterEqual(plan.steps, 28)
        self.assertGreaterEqual(plan.guidance_scale, 6.0)
        self.assertTrue(plan.negative_prompt)

    def test_turbo_keeps_low_guidance(self) -> None:
        plan = plan_sampling(
            pipe=_FakeTurbo(),
            width=1024,
            height=1024,
            steps=4,
            guidance_scale=0,
            negative_prompt="",
            resolved_label="sdxl-turbo",
        )
        self.assertEqual(plan.family, "turbo")
        self.assertLessEqual(plan.steps, 8)
        self.assertEqual(plan.guidance_scale, 0.0)

    def test_realvis_uses_mid_cfg(self) -> None:
        plan = plan_sampling(
            pipe=_FakeXL(),
            width=1024,
            height=1024,
            steps=4,
            guidance_scale=0,
            negative_prompt="",
            resolved_label="RealVisXL_V5.0_fp16.safetensors",
        )
        self.assertEqual(plan.family, "sdxl")
        self.assertGreaterEqual(plan.steps, 30)
        self.assertAlmostEqual(plan.guidance_scale, 5.5)

    def test_realvis_softens_stock_cfg_seven(self) -> None:
        plan = plan_sampling(
            pipe=_FakeXL(),
            width=1024,
            height=1024,
            steps=40,
            guidance_scale=7.0,
            negative_prompt="",
            resolved_label="RealVisXL_V5.0_fp16.safetensors",
        )
        self.assertAlmostEqual(plan.guidance_scale, 5.5)


if __name__ == "__main__":
    unittest.main()
