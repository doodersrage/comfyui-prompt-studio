from __future__ import annotations

import json
import urllib.parse

from .api_client import extract_prompt, get_json, post_json, resolve_api_base
from .constants import (
    DEFAULT_MODEL,
    DETAIL_LEVELS,
    IMAGE_FOCUS_OPTIONS,
    MODEL_IDS,
    PORTRAIT_STYLES,
    PROMPT_MODES,
    SPORT_PRESET_IDS,
)
from .image_utils import tensor_to_data_url


class PromptToolsBase:
    CATEGORY = "prompt tools"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    OUTPUT_NODE = False

    @staticmethod
    def metadata_json(response: dict) -> str:
        payload = {key: value for key, value in response.items() if key != "prompt"}
        return json.dumps(payload, ensure_ascii=False)

    @classmethod
    def api_input(cls):
        return {
            "api_base_url": (
                "STRING",
                {
                    "default": resolve_api_base(""),
                },
            ),
        }

    @classmethod
    def avoidance_inputs(cls):
        return {
            "avoided_tokens": ("STRING", {"default": "", "multiline": True}),
        }

    @staticmethod
    def apply_avoidance(payload: dict, avoided_tokens: str) -> None:
        raw = (avoided_tokens or "").strip()
        if not raw:
            return
        tokens = [
            token.strip().lower()
            for token in raw.replace("\n", ",").split(",")
            if token.strip()
        ]
        if not tokens:
            return
        payload["avoidedTokens"] = tokens[:80]
        payload["avoidedTokensInstruction"] = (
            "Avoid these overused or low-rated motifs: "
            f"{', '.join(tokens[-20:])}."
        )

    @classmethod
    def model_detail_inputs(cls):
        return {
            "model": (MODEL_IDS, {"default": DEFAULT_MODEL}),
            "detail": (DETAIL_LEVELS, {"default": "balanced"}),
        }


class PromptToolsGenerate(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "neon alley, rain, black cat",
                    },
                ),
                **cls.model_detail_inputs(),
                "mode": (PROMPT_MODES, {"default": "positive"}),
                "distinct_people": ("BOOLEAN", {"default": True}),
                "variation_enabled": ("BOOLEAN", {"default": True}),
                "variation_strength": (
                    "INT",
                    {"default": 65, "min": 0, "max": 100, "step": 1},
                ),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        input: str,
        model: str,
        detail: str,
        mode: str,
        distinct_people: bool,
        variation_enabled: bool,
        variation_strength: int,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        text = input.strip()
        if not text:
            raise RuntimeError("Input is required.")

        payload = {
            "input": text,
            "model": model,
            "detail": detail,
            "mode": mode,
            "distinctPeople": distinct_people,
            "variation": {
                "enabled": variation_enabled,
                "strength": variation_strength,
            },
        }
        self.apply_avoidance(payload, avoided_tokens)
        response = post_json(
            api_base_url,
            "/api/generate",
            payload,
        )
        return (extract_prompt(response),)


class PromptToolsFormat(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": (
                    "STRING",
                    {
                        "multiline": True,
                        "default": "1girl, neon alley, rain, masterpiece",
                    },
                ),
                **cls.model_detail_inputs(),
                "mode": (PROMPT_MODES, {"default": "positive"}),
                "smart_format": ("BOOLEAN", {"default": True}),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "format"

    def format(
        self,
        input: str,
        model: str,
        detail: str,
        mode: str,
        smart_format: bool,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        text = input.strip()
        if not text:
            raise RuntimeError("Input is required.")

        payload = {
            "input": text,
            "model": model,
            "detail": detail,
            "mode": mode,
            "smartFormat": smart_format,
        }
        self.apply_avoidance(payload, avoided_tokens)
        response = post_json(
            api_base_url,
            "/api/format",
            payload,
        )
        return (extract_prompt(response),)


class PromptToolsRandomScene(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "genre": ("STRING", {"default": "", "multiline": False}),
                "include_people": ("BOOLEAN", {"default": True}),
                "wildness": ("INT", {"default": 65, "min": 0, "max": 100, "step": 1}),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        genre: str,
        include_people: bool,
        wildness: int,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "includePeople": include_people,
            "wildness": wildness,
        }
        if genre.strip():
            payload["genre"] = genre.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/random-scene", payload)
        return (extract_prompt(response),)


class PromptToolsCharacter(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "hints": ("STRING", {"default": "", "multiline": True}),
                "portrait_style": (PORTRAIT_STYLES, {"default": "portrait"}),
                "variation_strength": (
                    "INT",
                    {"default": 50, "min": 0, "max": 100, "step": 1},
                ),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        hints: str,
        portrait_style: str,
        variation_strength: int,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "portraitStyle": portrait_style,
            "variationStrength": variation_strength,
        }
        if hints.strip():
            payload["hints"] = hints.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/character", payload)
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsPet(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "hints": ("STRING", {"default": "", "multiline": True}),
                "portrait_style": (PORTRAIT_STYLES, {"default": "portrait"}),
                "variation_strength": (
                    "INT",
                    {"default": 50, "min": 0, "max": 100, "step": 1},
                ),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        hints: str,
        portrait_style: str,
        variation_strength: int,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "portraitStyle": portrait_style,
            "variationStrength": variation_strength,
        }
        if hints.strip():
            payload["hints"] = hints.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/pet", payload)
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsFantasy(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "hints": ("STRING", {"default": "", "multiline": True}),
                "portrait_style": (PORTRAIT_STYLES, {"default": "portrait"}),
                "wildness": ("INT", {"default": 65, "min": 0, "max": 100, "step": 1}),
                "variation_strength": (
                    "INT",
                    {"default": 50, "min": 0, "max": 100, "step": 1},
                ),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        hints: str,
        portrait_style: str,
        wildness: int,
        variation_strength: int,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "portraitStyle": portrait_style,
            "wildness": wildness,
            "variationStrength": variation_strength,
            "fantasyWardrobe": True,
        }
        if hints.strip():
            payload["hints"] = hints.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/fantasy", payload)
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsBackground(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "setting_type": ("STRING", {"default": "", "multiline": False}),
                "time_of_day": ("STRING", {"default": "", "multiline": False}),
                "mood": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        setting_type: str,
        time_of_day: str,
        mood: str,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
        }
        if setting_type.strip():
            payload["settingType"] = setting_type.strip()
        if time_of_day.strip():
            payload["timeOfDay"] = time_of_day.strip()
        if mood.strip():
            payload["mood"] = mood.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/background", payload)
        return (extract_prompt(response),)


class PromptToolsImageToPrompt(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                **cls.model_detail_inputs(),
                "focus": (IMAGE_FOCUS_OPTIONS, {"default": "full"}),
                "extra_hints": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": cls.api_input(),
        }

    FUNCTION = "generate"

    def generate(
        self,
        image,
        model: str,
        detail: str,
        focus: str,
        extra_hints: str,
        api_base_url: str = "",
    ):
        image_data_url, mime_type = tensor_to_data_url(image)
        payload = {
            "image": image_data_url,
            "mimeType": mime_type,
            "model": model,
            "detail": detail,
            "focus": focus,
        }
        if extra_hints.strip():
            payload["extraHints"] = extra_hints.strip()

        response = post_json(api_base_url, "/api/image-prompt", payload)
        return (extract_prompt(response),)


class PromptToolsDuo(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "hints": ("STRING", {"default": "", "multiline": True}),
                "sport_preset": (SPORT_PRESET_IDS, {"default": "gravel-duo-race"}),
                "team_kit": ("BOOLEAN", {"default": False}),
                "variation_strength": (
                    "INT",
                    {"default": 50, "min": 0, "max": 100, "step": 1},
                ),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        hints: str,
        sport_preset: str,
        team_kit: bool,
        variation_strength: int,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "portraitStyle": "action",
            "variationStrength": variation_strength,
            "teamKit": team_kit,
            "sportPresetId": sport_preset,
        }
        if hints.strip():
            payload["hints"] = hints.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/duo", payload)
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsBatch(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "hints": ("STRING", {"default": "", "multiline": True}),
                "count": ("INT", {"default": 3, "min": 1, "max": 12, "step": 1}),
                "team_kit": ("BOOLEAN", {"default": False}),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        hints: str,
        count: int,
        team_kit: bool,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "portraitStyle": "action",
            "count": count,
            "teamKit": team_kit,
            "presetOptions": {"headcount": "duo"},
        }
        if hints.strip():
            payload["hints"] = hints.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/batch", payload)
        results = response.get("results")
        if isinstance(results, list) and results:
            prompts = [
                entry.get("prompt", "").strip()
                for entry in results
                if isinstance(entry, dict) and entry.get("prompt")
            ]
            if prompts:
                return ("\n---\n".join(prompts), self.metadata_json(response))
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsTopicsBatch(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "topics": (
                    "STRING",
                    {
                        "default": "sunset gravel ride\nrainy alley portrait",
                        "multiline": True,
                    },
                ),
                "target": (
                    ["generate", "duo", "character", "pet", "fantasy", "background"],
                    {"default": "generate"},
                ),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        model: str,
        detail: str,
        topics: str,
        target: str,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        topic_list = [
            line.strip()
            for line in topics.replace(",", "\n").splitlines()
            if line.strip()
        ]
        if not topic_list:
            raise RuntimeError("At least one topic is required.")

        payload = {
            "model": model,
            "detail": detail,
            "topics": topic_list[:12],
            "target": target,
        }
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/topics/batch", payload)
        results = response.get("results")
        if isinstance(results, list) and results:
            prompts = [
                entry.get("prompt", "").strip()
                for entry in results
                if isinstance(entry, dict) and entry.get("prompt")
            ]
            if prompts:
                return ("\n---\n".join(prompts), self.metadata_json(response))
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsLint(PromptToolsBase):
    RETURN_NAMES = ("diagnostics_json",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "hints": ("STRING", {"default": "", "multiline": True}),
                "prompt": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": cls.api_input(),
        }

    FUNCTION = "lint"

    def lint(self, hints: str, prompt: str, api_base_url: str = ""):
        response = post_json(
            api_base_url,
            "/api/lint",
            {"hints": hints.strip(), "prompt": prompt.strip()},
        )
        return (json.dumps(response, ensure_ascii=False),)


class PromptToolsNegative(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "sport": ("STRING", {"default": "cycling", "multiline": False}),
                "preserve_subject": ("BOOLEAN", {"default": False}),
                "extra": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "generate"

    def generate(
        self,
        sport: str,
        preserve_subject: bool,
        extra: str,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "sport": sport.strip(),
            "preserveSubject": preserve_subject,
        }
        if extra.strip():
            payload["extra"] = extra.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/negative", payload)
        return (extract_prompt(response),)


class PromptToolsFix(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                "hints": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": cls.api_input(),
        }

    FUNCTION = "fix"

    def fix(self, prompt: str, hints: str, api_base_url: str = ""):
        text = prompt.strip()
        if not text:
            raise RuntimeError("Prompt is required.")

        response = post_json(
            api_base_url,
            "/api/fix",
            {"prompt": text, "hints": hints.strip()},
        )
        fixed = response.get("prompt")
        if not isinstance(fixed, str) or not fixed.strip():
            raise RuntimeError("Fix API did not return a prompt string.")
        return (fixed,)


class PromptToolsCompose(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                **cls.model_detail_inputs(),
                "background_prompt": ("STRING", {"default": "", "multiline": True}),
                "subject_prompt": ("STRING", {"default": "", "multiline": True}),
                "compose_style": (["layered", "inline"], {"default": "layered"}),
            },
            "optional": {**cls.api_input(), **cls.avoidance_inputs()},
        }

    FUNCTION = "compose"

    def compose(
        self,
        model: str,
        detail: str,
        background_prompt: str,
        subject_prompt: str,
        compose_style: str,
        api_base_url: str = "",
        avoided_tokens: str = "",
    ):
        payload = {
            "model": model,
            "detail": detail,
            "composeStyle": compose_style,
            "background": {"settingType": background_prompt.strip()},
            "hints": subject_prompt.strip(),
            "subjectMode": "duo",
        }
        self.apply_avoidance(payload, avoided_tokens)
        response = post_json(api_base_url, "/api/compose", payload)
        return (extract_prompt(response),)


class PromptToolsCompact(PromptToolsBase):
    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("prompt", "metadata_json")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
                **cls.model_detail_inputs(),
            },
            "optional": cls.api_input(),
        }

    FUNCTION = "compact"

    def compact(self, prompt: str, model: str, detail: str, api_base_url: str = ""):
        text = prompt.strip()
        if not text:
            raise RuntimeError("Prompt is required.")

        response = post_json(
            api_base_url,
            "/api/compact",
            {"prompt": text, "model": model, "detail": detail},
        )
        return (extract_prompt(response), self.metadata_json(response))


class PromptToolsRefine(PromptToolsBase):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                **cls.model_detail_inputs(),
                "current_prompt": ("STRING", {"default": "", "multiline": True}),
                "intent_hints": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": cls.api_input(),
        }

    FUNCTION = "refine"

    def refine(
        self,
        image,
        model: str,
        detail: str,
        current_prompt: str,
        intent_hints: str,
        api_base_url: str = "",
    ):
        image_data_url, mime_type = tensor_to_data_url(image)
        payload = {
            "image": image_data_url,
            "mimeType": mime_type,
            "model": model,
            "detail": detail,
        }
        if current_prompt.strip():
            payload["currentPrompt"] = current_prompt.strip()
        if intent_hints.strip():
            payload["intentHints"] = intent_hints.strip()

        response = post_json(api_base_url, "/api/refine", payload)
        return (extract_prompt(response),)


class PromptToolsQueueComfyUi(PromptToolsBase):
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                **cls.api_input(),
                **cls.avoidance_inputs(),
                "negative_prompt": ("STRING", {"default": "", "multiline": True}),
            },
        }

    FUNCTION = "queue"

    def queue(
        self,
        prompt: str,
        api_base_url: str = "",
        negative_prompt: str = "",
        avoided_tokens: str = "",
    ):
        text = prompt.strip()
        if not text:
            raise RuntimeError("Prompt is required.")

        payload = {"prompt": text}
        if negative_prompt.strip():
            payload["negativePrompt"] = negative_prompt.strip()
        self.apply_avoidance(payload, avoided_tokens)

        response = post_json(api_base_url, "/api/comfyui", payload)
        parts = [
            response.get("promptId") and f"prompt_id {response['promptId']}",
            response.get("comfyUrl"),
            response.get("workflowSource") and f"workflow: {response['workflowSource']}",
        ]
        status = " · ".join(part for part in parts if part) or "queued"
        return (status,)


class PromptToolsJobStatus(PromptToolsBase):
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt_id": ("STRING", {"default": ""}),
            },
            "optional": {
                **cls.api_input(),
            },
        }

    FUNCTION = "poll"

    def poll(self, prompt_id: str, api_base_url: str = ""):
        pid = prompt_id.strip()
        if not pid:
            raise RuntimeError("prompt_id is required.")

        response = get_json(
            api_base_url,
            f"/api/comfyui/status?promptId={urllib.parse.quote(pid)}",
        )
        parts = [
            response.get("status"),
            response.get("statusMessage"),
            response.get("previewUrl") and "preview ready",
        ]
        status = " · ".join(str(part) for part in parts if part) or "unknown"
        return (status,)


NODE_CLASS_MAPPINGS = {
    "PromptToolsGenerate": PromptToolsGenerate,
    "PromptToolsFormat": PromptToolsFormat,
    "PromptToolsRandomScene": PromptToolsRandomScene,
    "PromptToolsCharacter": PromptToolsCharacter,
    "PromptToolsPet": PromptToolsPet,
    "PromptToolsFantasy": PromptToolsFantasy,
    "PromptToolsBackground": PromptToolsBackground,
    "PromptToolsImageToPrompt": PromptToolsImageToPrompt,
    "PromptToolsDuo": PromptToolsDuo,
    "PromptToolsBatch": PromptToolsBatch,
    "PromptToolsTopicsBatch": PromptToolsTopicsBatch,
    "PromptToolsLint": PromptToolsLint,
    "PromptToolsNegative": PromptToolsNegative,
    "PromptToolsFix": PromptToolsFix,
    "PromptToolsCompose": PromptToolsCompose,
    "PromptToolsCompact": PromptToolsCompact,
    "PromptToolsRefine": PromptToolsRefine,
    "PromptToolsQueueComfyUi": PromptToolsQueueComfyUi,
    "PromptToolsJobStatus": PromptToolsJobStatus,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptToolsGenerate": "Prompt Tools · Generate",
    "PromptToolsFormat": "Prompt Tools · Format",
    "PromptToolsRandomScene": "Prompt Tools · Random Scene",
    "PromptToolsCharacter": "Prompt Tools · Character",
    "PromptToolsPet": "Prompt Tools · Pet",
    "PromptToolsFantasy": "Prompt Tools · Fantasy",
    "PromptToolsBackground": "Prompt Tools · Background",
    "PromptToolsImageToPrompt": "Prompt Tools · Image → Prompt",
    "PromptToolsDuo": "Prompt Tools · Duo / Sport",
    "PromptToolsBatch": "Prompt Tools · Batch Roll",
    "PromptToolsTopicsBatch": "Prompt Tools · Topics Batch",
    "PromptToolsLint": "Prompt Tools · Lint",
    "PromptToolsNegative": "Prompt Tools · Negative",
    "PromptToolsFix": "Prompt Tools · Fix Prompt",
    "PromptToolsCompose": "Prompt Tools · Compose Scene",
    "PromptToolsCompact": "Prompt Tools · Compact Prompt",
    "PromptToolsRefine": "Prompt Tools · Refine Prompt",
    "PromptToolsQueueComfyUi": "Prompt Tools · Queue ComfyUI",
    "PromptToolsJobStatus": "Prompt Tools · Job Status",
}
