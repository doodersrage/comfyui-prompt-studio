from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

from .constants import DEFAULT_API_BASE

DEFAULT_TIMEOUT_SECONDS = 300


def get_default_api_base() -> str:
    return os.environ.get("COMFY_PROMPT_API_URL", DEFAULT_API_BASE).rstrip("/")


def resolve_api_base(api_base_url: str) -> str:
    trimmed = (api_base_url or "").strip()
    return trimmed.rstrip("/") if trimmed else get_default_api_base()


def extract_prompt(response: dict) -> str:
    prompt = response.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise RuntimeError("API response did not include a prompt string.")
    return prompt


def _auth_headers() -> dict[str, str]:
    token = (os.environ.get("PROMPT_API_TOKEN") or "").strip()
    if not token:
        return {}
    return {
        "Authorization": f"Bearer {token}",
        "X-Prompt-Api-Token": token,
    }


def post_json(api_base_url: str, path: str, payload: dict) -> dict:
    base = resolve_api_base(api_base_url)
    url = f"{base}{path}"
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            **_auth_headers(),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            parsed = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(raw).get("error", raw)
        except json.JSONDecodeError:
            message = raw or str(error)
        raise RuntimeError(f"Prompt API error ({error.code}): {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(
            f"Could not reach prompt API at {url}: {error.reason}"
        ) from error

    if not isinstance(parsed, dict):
        raise RuntimeError("Prompt API returned an unexpected response.")

    if "error" in parsed and "prompt" not in parsed:
        raise RuntimeError(str(parsed["error"]))

    return parsed
