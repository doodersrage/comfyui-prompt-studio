from __future__ import annotations

import unittest

from app.prompt_encode import (
    clean_studio_prompt,
    fit_negative_to_clip,
    fit_prompt_to_clip,
)


class PromptEncodeTests(unittest.TestCase):
    def test_strips_studio_header(self) -> None:
        raw = "# Positive (CLIPText Encode (Flux))\nA nurse in green scrubs"
        self.assertEqual(clean_studio_prompt(raw), "A nurse in green scrubs")

    def test_fit_keeps_short_prompt(self) -> None:
        text = "a red apple on a table"
        fitted = fit_prompt_to_clip(None, text)
        self.assertTrue(fitted.startswith(text))
        self.assertIn("photorealistic", fitted.lower())

    def test_fit_truncates_long_prompt(self) -> None:
        words = " ".join(f"word{i}" for i in range(120))
        words = words + " hyperrealistic photography natural skin"
        fitted = fit_prompt_to_clip(None, words, max_chars=200)
        self.assertLess(len(fitted), len(words))
        self.assertIn("photorealistic", fitted.lower())

    def test_fit_adds_quality_suffix_when_missing(self) -> None:
        fitted = fit_prompt_to_clip(
            None,
            "a glassblower in a misty distillery workshop",
            max_chars=200,
        )
        lower = fitted.lower()
        self.assertTrue("photograph" in lower or "photorealistic" in lower)

    def test_fit_locks_person_subject_first(self) -> None:
        text = (
            "the stoic and weather-beaten glassblower deftly gathered the molten "
            "glass on his pipe as verdant mist swirled through the perfume "
            "distillery room during the early morning hours, hyperrealistic "
            "photography, natural skin micro-texture, 8k"
        )
        fitted = fit_prompt_to_clip(None, text, max_chars=280)
        lower = fitted.lower()
        self.assertTrue(lower.startswith("photograph of"))
        self.assertIn("glassblower", lower)
        self.assertIn("perfume distillery", lower)
        self.assertLess(lower.index("glassblower"), lower.index("photograph, dslr"))
        self.assertIn("prominently in frame", lower)
        # Quality stays short — do not drag the whole studio style novel forward.
        self.assertNotIn("natural skin micro-texture", lower)
        # "portrait of" biases SDXL toward painted portraiture.
        self.assertNotIn("portrait of", lower)

    def test_negative_does_not_gain_quality_tags(self) -> None:
        fitted = fit_negative_to_clip(None, "blurry, low quality")
        self.assertEqual(fitted, "blurry, low quality")
        self.assertNotIn("photorealistic", fitted)

    def test_negative_reinforces_person(self) -> None:
        fitted = fit_negative_to_clip(
            None,
            "blurry, low quality",
            reinforce_person=True,
        )
        self.assertIn("still life", fitted.lower())
        self.assertIn("painting", fitted.lower())
        self.assertIn("fused fingers", fitted.lower())
        self.assertIn("long arms", fitted.lower())
        self.assertIn("blurry", fitted.lower())


if __name__ == "__main__":
    unittest.main()
