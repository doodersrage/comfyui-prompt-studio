from __future__ import annotations

import os
import re
from typing import Any


_HEADER_RE = re.compile(
    r"^\s*#\s*Positive\b[^\n]*\n?",
    re.IGNORECASE,
)

# ~4 chars/token; leave room for the quality suffix inside 77 CLIP tokens.
_DEFAULT_CHAR_BUDGET = 280
_QUALITY_SUFFIX = "photorealistic, sharp focus, highly detailed, natural colors"
# Avoid "portrait" here — SDXL often reads that as painted portraiture.
_PERSON_QUALITY_SUFFIX = (
    "photograph, DSLR, sharp focus, natural skin, detailed hands, five fingers, "
    "natural arm proportions"
)
_SUBJECT_PREFIX = "photograph of"

# Roles / people words that should stay locked at the front of the CLIP window.
_PERSON_RE = re.compile(
    r"\b("
    r"glassblower|blacksmith|potter|chef|nurse|doctor|soldier|wizard|witch|"
    r"knight|pirate|samurai|monk|priest|farmer|hunter|artist|painter|"
    r"sculptor|scientist|alchemist|merchant|bard|warrior|assassin|"
    r"man|woman|boy|girl|child|person|people|worker|craftsman|craftswoman|"
    r"elder|gentleman|lady|figure"
    r")\b",
    re.IGNORECASE,
)

_QUALITY_MARKERS = (
    "hyperrealistic",
    "photorealistic",
    "professional dslr",
    "natural skin",
    "8k",
    "highly detailed",
    "professional photography",
)

_STILL_LIFE_NEGATIVE = (
    "still life, product shot, empty room, no people, objects only"
)
_PAINTING_NEGATIVE = "painting, illustration, digital art, brush strokes, anime"
_HAND_NEGATIVE = (
    "bad hands, fused fingers, extra fingers, missing fingers, "
    "mutated hands, poorly drawn hands, extra arms, floating hands, "
    "disembodied hand, extra limbs, long arms, elongated arms, "
    "disproportionate limbs, extra long arms"
)

# Distinctive places that Studio novels mention once and CLIP then drops.
_SETTING_RE = re.compile(
    r"\b("
    r"perfume\s+distillery|distillery|glassworks|forge|foundry|"
    r"laboratory|workshop|atelier|kitchen|cathedral|marketplace|"
    r"harbor|forest clearing|throne room|castle courtyard"
    r")\b",
    re.IGNORECASE,
)

_TRAILING_PREP_RE = re.compile(
    r"\b(as|and|or|with|of|the|a|an|during|through|in|on|at|to|for|from|by)$",
    re.IGNORECASE,
)


def _trim_clause(text: str) -> str:
    out = text.strip(" ,;")
    while out and _TRAILING_PREP_RE.search(out):
        out = _TRAILING_PREP_RE.sub("", out).strip(" ,;")
    return out


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in ("1", "true", "yes", "on")


def clean_studio_prompt(prompt: str) -> str:
    """Strip Studio/Comfy header lines that waste CLIP tokens."""
    text = (prompt or "").strip()
    text = _HEADER_RE.sub("", text).strip()
    lines = [
        line
        for line in text.splitlines()
        if line.strip() and not line.strip().lower().startswith("# positive")
    ]
    return " ".join(" ".join(lines).split())


def _strip_quality_tail(text: str) -> str:
    lower = text.lower()
    cut = len(text)
    for marker in _QUALITY_MARKERS:
        idx = lower.find(marker)
        if 40 < idx < cut:
            cut = idx
    return text[:cut].strip(" ,;")


def _person_role(text: str) -> str | None:
    match = _PERSON_RE.search(text)
    return match.group(1).lower() if match else None


def prompt_wants_person(text: str) -> bool:
    return _person_role(clean_studio_prompt(text)) is not None


def _setting_lock(text: str) -> str:
    match = _SETTING_RE.search(text)
    if not match:
        return ""
    place = re.sub(r"\s+", " ", match.group(1).strip().lower())
    return f"in a {place}"


def _subject_lock(text: str) -> str:
    """
    Pull a short subject phrase CLIP should see first.

    Studio novels bury the person under setting/style tokens; SDXL then renders
    the props (glass, mist, marble) and drops the human.
    """
    body = _strip_quality_tail(text)
    role = _person_role(body)
    if not role:
        return ""

    # Descriptors through the role word only — action/setting stay in the body.
    match = _PERSON_RE.search(body)
    assert match is not None
    start = max(0, match.end() - 80)
    phrase = body[start : match.end()].strip(" ,;")
    if start > 0 and " " in phrase:
        phrase = phrase.split(" ", 1)[1]
    lower = phrase.lower()
    if lower.startswith("photograph of") or lower.startswith("photo of"):
        return phrase
    return f"{_SUBJECT_PREFIX} {phrase}"


def _clamp_with_tokenizer(
    tokenizer: Any | None,
    text: str,
    *,
    max_tokens: int,
) -> str:
    if tokenizer is None:
        return text
    try:
        ids = tokenizer(
            text,
            truncation=True,
            max_length=max_tokens,
            add_special_tokens=False,
            padding=False,
            clean_up_tokenization_spaces=False,
        )["input_ids"]
        decoded = tokenizer.decode(ids, skip_special_tokens=True).strip()
        decoded = decoded.replace(" - ", "-")
        decoded = re.sub(r"\s+,", ",", decoded)
        decoded = re.sub(r"\s{2,}", " ", decoded)
        return decoded
    except Exception:
        return text


def fit_prompt_to_clip(
    tokenizer: Any | None,
    text: str,
    *,
    max_tokens: int = 75,
    max_chars: int = _DEFAULT_CHAR_BUDGET,
    add_quality: bool = True,
) -> str:
    """
    Fit a long Studio prompt into CLIP's window without tokenizing the full
    novel first (that triggers transformers' 241 > 77 warnings).

    Person subjects are locked at the front; quality tags stay short at the end
    so props/style don't steal the composition.
    """
    cleaned = clean_studio_prompt(text)
    if not cleaned:
        return _QUALITY_SUFFIX if add_quality else ""

    role = _person_role(cleaned)
    quality = ""
    if add_quality:
        quality = _PERSON_QUALITY_SUFFIX if role else _QUALITY_SUFFIX

    subject = _subject_lock(cleaned) if role else ""
    setting = _setting_lock(cleaned)
    lock_parts = [p for p in (subject,) if p]
    if subject and role:
        lock_parts.append(f"{role} prominently in frame")
    if subject and setting:
        lock_parts.append(setting)
    lock = ", ".join(lock_parts)
    body = _strip_quality_tail(cleaned)

    # Drop the duplicated subject lead from the shrinkable middle.
    remainder = body
    if subject:
        raw_subject = re.sub(
            r"^(photograph|photo|portrait)\s+of\s+",
            "",
            subject,
            flags=re.IGNORECASE,
        )
        if remainder.lower().startswith(raw_subject.lower()):
            remainder = remainder[len(raw_subject) :].strip(" ,;")
    if setting:
        place = setting.replace("in a ", "")
        remainder = re.sub(re.escape(place), "", remainder, count=1, flags=re.IGNORECASE)
        remainder = re.sub(r"\s{2,}", " ", remainder).strip(" ,;")
    remainder = _trim_clause(remainder)

    parts: list[str] = []
    if lock:
        parts.append(lock)
    if remainder:
        parts.append(remainder)
    if quality:
        parts.append(quality)
    assembled = ", ".join(parts)

    # Soft char budget before tokenizer clamp.
    if len(assembled) > max_chars:
        # Keep lock + quality; shrink the middle.
        fixed = len(lock) + len(quality) + (4 if lock and quality else 0)
        mid_budget = max(40, max_chars - fixed)
        mid = remainder[:mid_budget]
        if len(remainder) > mid_budget:
            mid = mid.rsplit(" ", 1)[0]
        mid = _trim_clause(mid)
        pieces = [p for p in (lock, mid, quality) if p]
        assembled = ", ".join(pieces)

    return _clamp_with_tokenizer(tokenizer, assembled, max_tokens=max_tokens)


def fit_negative_to_clip(
    tokenizer: Any | None,
    text: str,
    *,
    max_tokens: int = 75,
    reinforce_person: bool = False,
) -> str:
    """Truncate negatives only — never append positive quality tags."""
    cleaned = clean_studio_prompt(text)
    if reinforce_person:
        # Hands first — CLIP negatives truncate from the end.
        extra = f"{_HAND_NEGATIVE}, {_STILL_LIFE_NEGATIVE}, {_PAINTING_NEGATIVE}"
        cleaned = f"{cleaned}, {extra}" if cleaned else extra
    if not cleaned:
        return ""
    # Negatives can be a bit longer than positives; still clamp for CLIP.
    neg_budget = max(_DEFAULT_CHAR_BUDGET, 360)
    if len(cleaned) > neg_budget:
        cleaned = cleaned[:neg_budget].rsplit(" ", 1)[0]
    return _clamp_with_tokenizer(tokenizer, cleaned, max_tokens=max_tokens)


def encode_sdxl_prompts(
    pipe: Any,
    *,
    prompt: str,
    negative_prompt: str,
    device: str,
) -> dict[str, Any]:
    """Return CLIP-safe prompt kwargs and a debug preview string."""
    del device  # reserved for Compel / device-side encodes later
    positive = clean_studio_prompt(prompt)
    negative = clean_studio_prompt(negative_prompt)
    wants_person = _person_role(positive) is not None

    fitted = fit_prompt_to_clip(pipe.tokenizer, positive, max_tokens=75)
    fitted_neg = fit_negative_to_clip(
        pipe.tokenizer,
        negative,
        max_tokens=75,
        reinforce_person=wants_person,
    )

    print(
        f"[diffusers] CLIP-fitted prompt ({len(fitted)} chars): {fitted[:180]}"
        + ("…" if len(fitted) > 180 else ""),
        flush=True,
    )
    if wants_person:
        print("[diffusers] subject lock: person/role reinforced", flush=True)

    return {
        "prompt": fitted,
        "prompt_2": fitted,
        "negative_prompt": fitted_neg or None,
        "negative_prompt_2": fitted_neg or None,
    }
