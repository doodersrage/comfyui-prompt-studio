import type { ComfyImageModel } from "./comfy-models";
import { modelUsesNegativePrompt } from "./prompt-pair";

export type AnatomyGuardMode = "off" | "standard" | "strict";

export const DEFAULT_ANATOMY_GUARD_MODE: AnatomyGuardMode = "standard";

export const ANATOMY_GUARD_OPTIONS: {
  id: AnatomyGuardMode;
  label: string;
  description: string;
}[] = [
  {
    id: "off",
    label: "Off",
    description: "No anatomy steering on queue.",
  },
  {
    id: "standard",
    label: "Standard",
    description: "Guards against extra limbs, mutations, and broken proportions.",
  },
  {
    id: "strict",
    label: "Strict",
    description: "Stronger hand, finger, and limb guards for people and creatures.",
  },
];

const ANATOMY_POSITIVE_SUFFIX: Record<Exclude<AnatomyGuardMode, "off">, string> = {
  standard:
    "accurate anatomy, correct proportions, natural limb count, coherent body structure",
  strict:
    "accurate anatomy, correct proportions, natural limb count, anatomically correct hands and fingers, symmetrical features, coherent body structure",
};

const ANATOMY_NEGATIVE_EXTRA: Record<Exclude<AnatomyGuardMode, "off">, string> = {
  standard:
    "mutated, mutation, deformed, bad anatomy, extra limbs, extra arms, extra legs, missing limbs, disfigured, malformed, gross proportions",
  strict:
    "mutated, mutation, deformed, bad anatomy, extra limbs, extra arms, extra legs, missing limbs, disfigured, malformed, gross proportions, extra fingers, too many fingers, fused fingers, extra hands, duplicate limbs, wrong number of limbs, body horror, anatomical nonsense",
};

const FLUX_ANATOMY_AVOID: Record<Exclude<AnatomyGuardMode, "off">, string> = {
  standard:
    "Avoid extra limbs, missing limbs, deformed anatomy, mutations, and broken proportions.",
  strict:
    "Avoid extra limbs, missing limbs, deformed anatomy, extra or fused fingers, duplicate hands, mutations, and broken proportions.",
};

const FLUX_KLEIN_DISTILLED_ANATOMY_EXTRA: Record<Exclude<AnatomyGuardMode, "off">, string> = {
  standard:
    "Prefer simple standing poses over seated, twisted, or multi-person interactions when anatomy matters.",
  strict:
    "Prefer simple standing poses and single-subject framing. Complex seated or intertwined figures increase hand and limb errors on distilled Klein.",
};

function isKleinDistilledModel(model: ComfyImageModel | string): boolean {
  return model === "flux-2-klein-4b-distilled" || model === "flux-2-klein-9b-distilled";
}

function isKleinBaseModel(model: ComfyImageModel | string): boolean {
  return model === "flux-2-klein" || model === "flux-2-klein-9b";
}

export function normalizeAnatomyGuardMode(value: unknown): AnatomyGuardMode {
  if (value === "standard" || value === "strict" || value === "off") {
    return value;
  }
  return DEFAULT_ANATOMY_GUARD_MODE;
}

function mergeCommaList(base: string | undefined, extra: string): string {
  const parts = `${base ?? ""}, ${extra}`
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(part);
  }
  return merged.join(", ");
}

function promptAlreadyHasAnatomyCue(prompt: string): boolean {
  return /\b(accurate anatomy|anatomically correct|correct proportions|natural limb count|coherent body structure)\b/i.test(
    prompt,
  );
}

export function applyAnatomyGuardToPositive(
  prompt: string,
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
): string {
  const trimmed = prompt.trim();
  if (!trimmed || mode === "off" || promptAlreadyHasAnatomyCue(trimmed)) {
    return trimmed;
  }

  const suffix = ANATOMY_POSITIVE_SUFFIX[mode];
  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}${suffix}`;
}

export function applyAnatomyGuardToNegative(
  negative: string | undefined,
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
): string | undefined {
  if (mode === "off") {
    return negative?.trim() || undefined;
  }

  const merged = mergeCommaList(negative, ANATOMY_NEGATIVE_EXTRA[mode]);
  return merged || undefined;
}

export function applyAnatomyGuardForModel(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  mode?: AnatomyGuardMode;
}): { positive: string; negative?: string } {
  const resolvedMode = input.mode ?? DEFAULT_ANATOMY_GUARD_MODE;
  if (resolvedMode === "off") {
    return {
      positive: input.positive.trim(),
      negative: input.negative?.trim() || undefined,
    };
  }

  let positive = applyAnatomyGuardToPositive(input.positive, resolvedMode);

  if (modelUsesNegativePrompt(input.model)) {
    return {
      positive,
      negative: applyAnatomyGuardToNegative(input.negative, resolvedMode),
    };
  }

  const avoid = FLUX_ANATOMY_AVOID[resolvedMode];
  if (!/\bavoid extra limbs\b/i.test(positive)) {
    const separator = /[.!?]$/.test(positive) ? " " : ". ";
    positive = `${positive}${separator}${avoid}`;
  }

  if (isKleinDistilledModel(input.model) && !/\bprefer simple standing poses\b/i.test(positive)) {
    const separator = /[.!?]$/.test(positive) ? " " : ". ";
    positive = `${positive}${separator}${FLUX_KLEIN_DISTILLED_ANATOMY_EXTRA[resolvedMode]}`;
  }

  if (
    isKleinBaseModel(input.model) &&
    resolvedMode === "strict" &&
    !/\bkeep poses straightforward\b/i.test(positive)
  ) {
    const separator = /[.!?]$/.test(positive) ? " " : ". ";
    positive = `${positive}${separator}Keep poses straightforward when hands, faces, or full figures must read cleanly.`;
  }

  return { positive, negative: undefined };
}

export function formatAnatomyGuardHint(
  mode: AnatomyGuardMode = DEFAULT_ANATOMY_GUARD_MODE,
): string {
  if (mode === "off") {
    return "Off — no anatomy guards on queue.";
  }
  const option =
    ANATOMY_GUARD_OPTIONS.find((entry) => entry.id === mode) ??
    ANATOMY_GUARD_OPTIONS[0];
  return `${option.label} — ${option.description}`;
}
