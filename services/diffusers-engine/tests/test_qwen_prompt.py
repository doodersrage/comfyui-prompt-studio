from __future__ import annotations

import unittest

from app.qwen_prompt import shape_qwen_prompts


class QwenPromptTests(unittest.TestCase):
    def test_adds_hand_repair_not_hide_for_people(self) -> None:
        pos, neg = shape_qwen_prompts(
            "a woman in a red coat walking through a rainy street",
            "blurry",
        )
        self.assertNotIn("medium-wide shot", pos.lower())
        self.assertNotIn("no hands or fingers visible", pos.lower())
        self.assertIn("correctly proportioned fingers", pos.lower())
        self.assertIn("natural human proportions", pos.lower())
        self.assertIn("elongated fingers", neg.lower())
        self.assertIn("stretched torso", neg.lower())
        self.assertNotIn("disproportionately tall", neg.lower())
        self.assertNotIn("close-up face crop", neg.lower())

    def test_portrait_gets_hand_repair_without_composition(self) -> None:
        pos, _neg = shape_qwen_prompts(
            "portrait of a woman with blue hair",
            "",
        )
        self.assertNotIn("medium-wide shot", pos.lower())
        self.assertIn("correctly proportioned fingers", pos.lower())

    def test_strips_face_hand_poses_keeps_holding(self) -> None:
        pos, _neg = shape_qwen_prompts(
            "a woman, hand on her face, holding a coffee cup, soft light",
            "",
        )
        self.assertNotIn("hand on her face", pos.lower())
        self.assertIn("holding a coffee cup", pos.lower())
        self.assertIn("correctly proportioned fingers", pos.lower())

    def test_keeps_arms_crossed(self) -> None:
        pos, _neg = shape_qwen_prompts(
            "a woman, arms crossed, soft light",
            "",
        )
        self.assertIn("arms crossed", pos.lower())

    def test_sunflower_dress_stays_clothing_not_field(self) -> None:
        pos, neg = shape_qwen_prompts(
            "a woman in a sunflower dress in a city at night",
            "",
        )
        self.assertIn("clothing only", pos.lower())
        self.assertIn("urban city", pos.lower())
        self.assertIn("sunflower field", neg.lower())
        self.assertNotIn("field of sunflowers", pos.lower())

    def test_closeup_still_gets_hand_repair_for_people(self) -> None:
        pos, _neg = shape_qwen_prompts(
            "close-up of a woman, face focus",
            "",
        )
        self.assertIn("correctly proportioned fingers", pos.lower())
        self.assertNotIn("medium-wide shot", pos.lower())


if __name__ == "__main__":
    unittest.main()
