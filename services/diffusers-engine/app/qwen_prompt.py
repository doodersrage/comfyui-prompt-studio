"""Light prompt shaping for native Qwen/Flux person gens (not SDXL CLIP packing)."""

from __future__ import annotations

import re

_PERSON_RE = re.compile(
    r"\b(man|woman|men|women|person|people|boy|girl|figure|model)\b",
    re.IGNORECASE,
)
# Face-covering gestures that usually melt; leave casual poses / holding alone.
_FACE_HAND_POSE_RE = re.compile(
    r",?\s*\b("
    r"hand\s+on\s+(her|his|their|the)\s+face|"
    r"hands?\s+on\s+(her|his|their|the)\s+(face|cheek|chin|jaw)|"
    r"fingers?\s+on\s+(her|his|their|the)\s+(lips|mouth|face)|"
    r"touching\s+(her|his|their|the)\s+face|"
    r"holding\s+(her|his|their|the)\s+face|"
    r"chin\s+rest|"
    r"hand\s+near\s+(her|his|their|the)\s+face|"
    r"covering\s+(her|his|their|the)\s+face"
    r")\b,?",
    re.IGNORECASE,
)
# Pattern-on-clothing phrases that models often misread as a literal field/scene.
_CLOTHING_MOTIF_RE = re.compile(
    r"\b((?:sunflower|floral|flower|daisy|rose|lily|striped|plaid|polka[\s-]?dot|"
    r"leopard|zebra|camo(?:uflage)?)\s+"
    r"(?:dress|skirt|top|blouse|shirt|gown|outfit|romper|jumpsuit|clothes|clothing))\b",
    re.IGNORECASE,
)
_CITY_RE = re.compile(
    r"\b(city|urban|street|downtown|alley|sidewalk|night\s+city|cityscape)\b",
    re.IGNORECASE,
)

_HAND_POSITIVE = (
    "natural human proportions, realistic limb length, "
    "natural hands with five short correctly proportioned fingers, "
    "normal finger length, realistic hand size relative to the body"
)
_HAND_NEGATIVE = (
    "elongated fingers, spider fingers, oversized hands, long thin fingers, "
    "extra-long fingers, stretched fingers, "
    "bad hands, fused fingers, extra fingers, missing fingers, malformed hands, "
    "hands covering face, hand on face, fingers on lips, "
    "elongated legs, stretched torso, giraffe neck, "
    "extra long limbs, mutant proportions, distorted anatomy"
)
_MOTIF_FIELD_NEGATIVE = (
    "sunflower field, flower field, field of flowers, meadow of sunflowers, "
    "standing in crops, agricultural field background"
)


def shape_qwen_prompts(
    prompt: str,
    negative_prompt: str,
) -> tuple[str, str]:
    """Bias person gens toward natural proportions and repaired visible hands."""
    positive = (prompt or "").strip()
    negative = (negative_prompt or "").strip()
    if not positive:
        return positive, negative

    wants_person = bool(_PERSON_RE.search(positive))
    clothing_motif = _CLOTHING_MOTIF_RE.search(positive)
    wants_city = bool(_CITY_RE.search(positive))

    if clothing_motif:
        motif_phrase = clothing_motif.group(1)
        clarifier = (
            f"wearing a {motif_phrase} as clothing only, "
            "pattern printed on the garment, not a literal field of that motif"
        )
        if clarifier.lower() not in positive.lower():
            positive = f"{positive}, {clarifier}"
        if wants_city and "urban city" not in positive.lower():
            positive = (
                f"{positive}, urban city street environment with buildings and lights"
            )
        if _MOTIF_FIELD_NEGATIVE.split(",")[0] not in negative.lower():
            negative = (
                f"{_MOTIF_FIELD_NEGATIVE}, {negative}" if negative else _MOTIF_FIELD_NEGATIVE
            )

    if wants_person:
        positive = _FACE_HAND_POSE_RE.sub("", positive)
        positive = re.sub(r"\s{2,}", " ", positive).strip(" ,")

        if "correctly proportioned fingers" not in positive.lower():
            positive = f"{positive}, {_HAND_POSITIVE}"

        if "elongated fingers" not in negative.lower():
            negative = f"{_HAND_NEGATIVE}, {negative}" if negative else _HAND_NEGATIVE

    return positive, negative


# Alias for Flux / shared callers.
shape_person_prompts = shape_qwen_prompts
