from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.lora_resolve import resolve_loras


class LoraResolveTests(unittest.TestCase):
    def test_explicit_lora_spec(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            weight = root / "HandFineTuning_XL.safetensors"
            weight.write_bytes(b"fake")
            with mock.patch.dict(
                os.environ,
                {
                    "DIFFUSERS_LORA": f"{weight}:0.65",
                    "DIFFUSERS_LORA_DIR": str(root),
                    "DIFFUSERS_LORA_DOWNLOAD": "0",
                },
                clear=False,
            ):
                resolved = resolve_loras(wants_person=False)
            self.assertEqual(len(resolved), 1)
            self.assertEqual(resolved[0].name, "HandFineTuning_XL.safetensors")
            self.assertAlmostEqual(resolved[0].weight, 0.65)

    def test_person_defaults_pick_local_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            hand = root / "HandFineTuning_XL.safetensors"
            detail = root / "Detail-Tweaker-XL.safetensors"
            hand.write_bytes(b"fake")
            detail.write_bytes(b"fake")
            env = {
                key: value
                for key, value in os.environ.items()
                if key != "DIFFUSERS_LORA"
            }
            env.update(
                {
                    "DIFFUSERS_LORA_DIR": str(root),
                    "DIFFUSERS_LORA_DOWNLOAD": "0",
                }
            )
            with mock.patch.dict(os.environ, env, clear=True):
                resolved = resolve_loras(wants_person=True)
            names = {item.name for item in resolved}
            self.assertIn("HandFineTuning_XL.safetensors", names)
            self.assertIn("Detail-Tweaker-XL.safetensors", names)


if __name__ == "__main__":
    unittest.main()
