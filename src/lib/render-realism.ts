import type { ComfyImageModel } from "./comfy-models";
import { modelUsesNegativePrompt } from "./prompt-pair";

export type RenderRealismMode = "off" | "realistic" | "hyper-realistic" | "anime";

export const DEFAULT_RENDER_REALISM_MODE: RenderRealismMode = "off";

export const RENDER_REALISM_OPTIONS: {
  id: RenderRealismMode;
  label: string;
  description: string;
}[] = [
  {
    id: "off",
    label: "Off",
    description: "Use prompts as generated — no style steering.",
  },
  {
    id: "realistic",
    label: "Realistic",
    description: "Photoreal cues and artifact guards for natural renders.",
  },
  {
    id: "hyper-realistic",
    label: "Hyper-realistic",
    description: "Maximum detail, texture, and DSLR-style fidelity.",
  },
  {
    id: "anime",
    label: "Anime",
    description: "Cel-shaded animation look — stylized, not photographic.",
  },
];

const REALISM_POSITIVE_SUFFIX: Record<Exclude<RenderRealismMode, "off">, string> = {
  realistic:
    "photorealistic, natural lighting, realistic skin texture, accurate anatomy, fine surface detail, cinematic depth of field",
  "hyper-realistic":
    "hyperrealistic photography, ultra-detailed skin pores and micro-texture, 8K clarity, studio-grade lighting, razor-sharp focus, lifelike materials, professional DSLR quality",
  anime:
    "anime illustration, cel shading, clean line art, vibrant color palette, expressive character design, dynamic composition, studio animation quality",
};

const REALISM_NEGATIVE_EXTRA: Record<Exclude<RenderRealismMode, "off">, string> = {
  realistic:
    "cartoon, anime, illustration, painting, CGI look, plastic skin, oversaturated, doll-like, blurry, low quality, watermark, text, deformed anatomy, extra limbs, extra fingers",
  "hyper-realistic":
    "cartoon, anime, illustration, painting, 3D render, CGI, plastic skin, waxy skin, airbrushed, oversharpened halos, uncanny valley, blurry, low quality, watermark, text, deformed anatomy, extra fingers",
  anime:
    "photorealistic, realistic photo, live action, 3D render, CGI, plastic skin, waxy skin, oversaturated, blurry, low quality, watermark, text, western cartoon, bad anatomy, extra limbs",
};

const FLUX_REALISM_AVOID: Record<Exclude<RenderRealismMode, "off">, string> = {
  realistic:
    "Avoid cartoon, illustration, and obvious CGI artifacts. Keep natural skin texture and believable lighting.",
  "hyper-realistic":
    "Avoid cartoon, illustration, CGI, plastic or waxy skin, and uncanny artifacts. Preserve lifelike micro-detail and clean optics.",
  anime:
    "Avoid photorealistic, photographic, and live-action looks. Keep stylized anime and animation aesthetics with clean cel shading.",
};

export function normalizeRenderRealismMode(value: unknown): RenderRealismMode {
  if (value === "animation") {
    return "anime";
  }
  if (value === "realistic" || value === "hyper-realistic" || value === "anime" || value === "off") {
    return value;
  }
  return DEFAULT_RENDER_REALISM_MODE;
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

function promptAlreadyHasRealismCue(prompt: string, mode: RenderRealismMode): boolean {
  const lower = prompt.toLowerCase();
  if (mode === "hyper-realistic") {
    return /\b(hyper[- ]?realistic|ultra[- ]?detailed|8k|dslr|micro-texture)\b/i.test(
      lower,
    );
  }
  if (mode === "realistic") {
    return /\b(photorealistic|photo[- ]?realistic|lifelike|natural lighting)\b/i.test(
      lower,
    );
  }
  if (mode === "anime") {
    return /\b(anime|cel[- ]?shad(?:ed|ing)?|animation style|studio animation)\b/i.test(
      lower,
    );
  }
  return false;
}

export function applyRenderRealismToPositive(
  prompt: string,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
): string {
  const trimmed = prompt.trim();
  if (!trimmed || mode === "off" || promptAlreadyHasRealismCue(trimmed, mode)) {
    return trimmed;
  }

  const suffix = REALISM_POSITIVE_SUFFIX[mode];
  const separator = /[.!?]$/.test(trimmed) ? " " : ". ";
  return `${trimmed}${separator}${suffix}`;
}

export function applyRenderRealismToNegative(
  negative: string | undefined,
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
): string | undefined {
  if (mode === "off") {
    return negative?.trim() || undefined;
  }

  const extra = REALISM_NEGATIVE_EXTRA[mode];
  const merged = mergeCommaList(negative, extra);
  return merged || undefined;
}

export function applyRenderRealismForModel(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  mode?: RenderRealismMode;
}): { positive: string; negative?: string } {
  const resolvedMode = input.mode ?? DEFAULT_RENDER_REALISM_MODE;
  if (resolvedMode === "off") {
    return {
      positive: input.positive.trim(),
      negative: input.negative?.trim() || undefined,
    };
  }

  let positive = applyRenderRealismToPositive(input.positive, resolvedMode);

  if (modelUsesNegativePrompt(input.model)) {
    return {
      positive,
      negative: applyRenderRealismToNegative(input.negative, resolvedMode),
    };
  }

  const avoid = FLUX_REALISM_AVOID[resolvedMode];
  const avoidAlreadyPresent =
    resolvedMode === "anime"
      ? /\bavoid photorealistic\b/i.test(positive)
      : /\bavoid\b/i.test(positive);
  if (!avoidAlreadyPresent) {
    const separator = /[.!?]$/.test(positive) ? " " : ". ";
    positive = `${positive}${separator}${avoid}`;
  }

  return { positive, negative: undefined };
}

export function formatRenderRealismHint(
  mode: RenderRealismMode = DEFAULT_RENDER_REALISM_MODE,
): string {
  if (mode === "off") {
    return "Off — prompts queue unchanged.";
  }
  const option =
    RENDER_REALISM_OPTIONS.find((entry) => entry.id === mode) ??
    RENDER_REALISM_OPTIONS[0];
  return `${option.label} — ${option.description}`;
}
