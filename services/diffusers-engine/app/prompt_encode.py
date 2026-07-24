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
# Anatomy/solo stay next to the subject lock so CLIP truncation cannot drop them.
_PERSON_ANATOMY_SUFFIX = (
    "detailed hands with five fingers each, natural arm length, solo"
)
# Workshop crafts: SDXL can't fix hand geometry reliably — crop hands away.
# Action verbs in Studio novels ("gathered… on his pipe") force hands back in.
_WORKSHOP_ANATOMY_SUFFIX = (
    "head and shoulders crop above the elbows, no hands visible, face sharp, solo"
)
_WORKSHOP_HAND_NEGATIVE = (
    "hands, fingers, gloves, mitts, holding, gripping, hands in foreground, "
    "object in hand, flask in hand, tool in hand, vial in hand"
)
# Strip tool-hand stage directions from the shrinkable middle for workshop roles.
_WORKSHOP_ACTION_RE = re.compile(
    r"\b(?:"
    r"deftly\s+\w+(?:\s+\w+){0,8}|"
    r"(?:holding|gripping|grasping|wielding|gathering|blowing)\b[^,]{0,48}|"
    r"on (?:his|her|their) (?:pipe|blowpipe|tools?|hammer)|"
    r"with (?:both )?hands?(?:\s+\w+){0,6}"
    r")",
    re.IGNORECASE,
)
_WORKSHOP_ROLES = frozenset(
    {
        "glassblower",
        "blacksmith",
        "potter",
        "worker",
        "craftsman",
        "craftswoman",
        "sculptor",
        "alchemist",
        "farmer",
        "hunter",
    }
)
_PERSON_STYLE_SUFFIX = "photograph, DSLR, sharp focus, natural skin"
_PERSON_QUALITY_SUFFIX = f"{_PERSON_ANATOMY_SUFFIX}, {_PERSON_STYLE_SUFFIX}"
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

_STILL_LIFE_NEGATIVE = "still life, product shot, objects only"
_PAINTING_NEGATIVE = "painting, illustration, digital art, anime"
_HAND_NEGATIVE = (
    "bad hands, fused fingers, missing fingers, blob hands, sausage fingers, "
    "oversized gloves, bulky mitts, puffy gloves, close-up of hands, "
    "hand focus, long arms, long forearms"
)
_CROWD_NEGATIVE = (
    "crowd, multiple people, second person, extra person, two people, "
    "bystanders, face in background"
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


def prompt_is_workshop_role(text: str) -> bool:
    role = _person_role(clean_studio_prompt(text))
    return bool(role and role in _WORKSHOP_ROLES)


# Back-compat alias used by older call sites / tests.
prompt_wants_workshop_mitts = prompt_is_workshop_role


def _strip_workshop_hand_actions(text: str) -> str:
    """Remove hand/tool stage directions that pull digits into frame."""
    cleaned = _WORKSHOP_ACTION_RE.sub(" ", text)
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"\s+,", ",", cleaned)
    return _trim_clause(cleaned)


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


def _cleanup_decoded(text: str) -> str:
    decoded = text.replace(" - ", "-")
    decoded = re.sub(r"\s+,", ",", decoded)
    decoded = re.sub(r"\s{2,}", " ", decoded)
    return decoded.strip(" ,;")


def _token_len(tokenizer: Any | None, text: str) -> int:
    if tokenizer is None:
        return max(1, (len(text) + 3) // 4)
    try:
        return len(
            tokenizer(
                text,
                add_special_tokens=True,
                truncation=False,
                padding=False,
                clean_up_tokenization_spaces=False,
            )["input_ids"]
        )
    except Exception:
        return max(1, (len(text) + 3) // 4)


def _clamp_with_tokenizer(
    tokenizer: Any | None,
    text: str,
    *,
    max_tokens: int,
) -> str:
    if tokenizer is None:
        return text
    try:
        # Match CLIP runtime: special tokens count toward the 77 budget.
        ids = tokenizer(
            text,
            truncation=True,
            max_length=max_tokens,
            add_special_tokens=True,
            padding=False,
            clean_up_tokenization_spaces=False,
        )["input_ids"]
        decoded = tokenizer.decode(ids, skip_special_tokens=True).strip()
        return _cleanup_decoded(decoded)
    except Exception:
        return text


def _join_prompt_parts(*parts: str) -> str:
    return ", ".join(part for part in parts if part)


def _fit_parts_to_tokens(
    tokenizer: Any | None,
    *,
    lock: str,
    anatomy: str,
    remainder: str,
    style: str,
    max_tokens: int,
    max_chars: int,
) -> str:
    """
    Keep lock + anatomy + style fixed; shrink only the scene middle until the
    prompt fits the CLIP window. End-truncation must not eat hand/solo tags.
    """
    fixed = _join_prompt_parts(lock, anatomy, style)
    if _token_len(tokenizer, fixed) > max_tokens:
        return _clamp_with_tokenizer(tokenizer, fixed, max_tokens=max_tokens)

    mid = _trim_clause(remainder)
    if len(fixed) + (len(mid) + 2 if mid else 0) > max_chars and mid:
        budget = max(0, max_chars - len(fixed) - 2)
        mid = _trim_clause(mid[:budget].rsplit(" ", 1)[0] if budget else "")

    assembled = _join_prompt_parts(lock, anatomy, mid, style)
    if _token_len(tokenizer, assembled) <= max_tokens:
        return _cleanup_decoded(assembled)

    # Binary-search a shorter middle that still fits.
    lo, hi = 0, len(mid)
    best = fixed
    while lo <= hi:
        cut = (lo + hi) // 2
        candidate_mid = _trim_clause(mid[:cut].rsplit(" ", 1)[0] if cut else "")
        candidate = _join_prompt_parts(lock, anatomy, candidate_mid, style)
        if _token_len(tokenizer, candidate) <= max_tokens:
            best = candidate
            lo = cut + 1
        else:
            hi = cut - 1
    return _cleanup_decoded(best)


def _already_fitted(text: str) -> bool:
    """True when this looks like our own prior CLIP-fit output."""
    lower = text.lower()
    return "prominently in frame" in lower and (
        lower.startswith("photograph of")
        or lower.startswith("photo of")
        or lower.startswith("portrait of")
    )


def _resolve_workshop_crop(
    role: str | None,
    workshop_crop: bool | None,
) -> bool:
    if workshop_crop is True:
        return True
    if workshop_crop is False:
        return False
    return bool(role and role in _WORKSHOP_ROLES)


def fit_prompt_to_clip(
    tokenizer: Any | None,
    text: str,
    *,
    max_tokens: int = 77,
    max_chars: int = _DEFAULT_CHAR_BUDGET,
    add_quality: bool = True,
    workshop_crop: bool | None = None,
) -> str:
    """
    Fit a long Studio prompt into CLIP's window without tokenizing the full
    novel first (that triggers transformers' 241 > 77 warnings).

    Person subjects are locked at the front; quality tags stay short at the end
    so props/style don't steal the composition. Idempotent on already-fitted text
    (refiner must not re-lock and duplicate the subject).
    """
    cleaned = clean_studio_prompt(text)
    if not cleaned:
        return _QUALITY_SUFFIX if add_quality else ""

    # Refiner / second encode: clamp only — do not re-apply subject lock.
    if _already_fitted(cleaned):
        return _clamp_with_tokenizer(tokenizer, cleaned, max_tokens=max_tokens)

    role = _person_role(cleaned)
    use_workshop = _resolve_workshop_crop(role, workshop_crop)
    anatomy = ""
    style = ""
    if add_quality:
        if role:
            anatomy = (
                _WORKSHOP_ANATOMY_SUFFIX if use_workshop else _PERSON_ANATOMY_SUFFIX
            )
            style = _PERSON_STYLE_SUFFIX
        else:
            style = _QUALITY_SUFFIX

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
    remainder = re.sub(
        r"^(photograph|photo|portrait)\s+of\s+",
        "",
        remainder,
        flags=re.IGNORECASE,
    ).strip(" ,;")
    if subject:
        raw_subject = re.sub(
            r"^(photograph|photo|portrait)\s+of\s+",
            "",
            subject,
            flags=re.IGNORECASE,
        )
        if remainder.lower().startswith(raw_subject.lower()):
            remainder = remainder[len(raw_subject) :].strip(" ,;")
    if role:
        remainder = re.sub(
            rf",?\s*{re.escape(role)}\s+prominently in frame\b",
            "",
            remainder,
            flags=re.IGNORECASE,
        )
    if setting:
        place = setting.replace("in a ", "")
        remainder = re.sub(re.escape(place), "", remainder, count=1, flags=re.IGNORECASE)
        remainder = re.sub(
            rf",?\s*{re.escape(setting)}\b",
            "",
            remainder,
            flags=re.IGNORECASE,
        )
    remainder = re.sub(r"\s{2,}", " ", remainder).strip(" ,;")
    remainder = _trim_clause(remainder)
    if use_workshop:
        remainder = _strip_workshop_hand_actions(remainder)

    return _fit_parts_to_tokens(
        tokenizer,
        lock=lock,
        anatomy=anatomy,
        remainder=remainder,
        style=style,
        max_tokens=max_tokens,
        max_chars=max_chars,
    )


def fit_negative_to_clip(
    tokenizer: Any | None,
    text: str,
    *,
    max_tokens: int = 77,
    reinforce_person: bool = False,
    workshop_role: bool = False,
) -> str:
    """Truncate negatives only — never append positive quality tags."""
    cleaned = clean_studio_prompt(text)
    if reinforce_person:
        # Hands/crowd first — CLIP negatives truncate from the end.
        parts = [_HAND_NEGATIVE]
        if workshop_role:
            parts.insert(0, _WORKSHOP_HAND_NEGATIVE)
        parts.extend(
            [_CROWD_NEGATIVE, _PAINTING_NEGATIVE, _STILL_LIFE_NEGATIVE]
        )
        extra = ", ".join(parts)
        cleaned = f"{cleaned}, {extra}" if cleaned else extra
    if not cleaned:
        return ""
    # Negatives can be a bit longer than positives; still clamp for CLIP.
    neg_budget = max(_DEFAULT_CHAR_BUDGET, 420)
    if len(cleaned) > neg_budget:
        cleaned = cleaned[:neg_budget].rsplit(" ", 1)[0]
    return _clamp_with_tokenizer(tokenizer, cleaned, max_tokens=max_tokens)


def encode_sdxl_prompts(
    pipe: Any,
    *,
    prompt: str,
    negative_prompt: str,
    device: str,
    workshop_crop: bool | None = None,
) -> dict[str, Any]:
    """Return CLIP-safe prompt kwargs and a debug preview string."""
    del device  # reserved for Compel / device-side encodes later
    positive = clean_studio_prompt(prompt)
    negative = clean_studio_prompt(negative_prompt)
    role = _person_role(positive)
    wants_person = role is not None
    workshop_role = _resolve_workshop_crop(role, workshop_crop)

    already = _already_fitted(positive)
    fitted = fit_prompt_to_clip(
        pipe.tokenizer,
        positive,
        max_tokens=77,
        workshop_crop=workshop_crop,
    )
    fitted_neg = fit_negative_to_clip(
        pipe.tokenizer,
        negative,
        max_tokens=77,
        # Avoid stacking hand/still-life negatives again on the refiner pass.
        reinforce_person=wants_person and "fused fingers" not in negative.lower(),
        workshop_role=workshop_role,
    )

    if not already:
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
