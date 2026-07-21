"use client";

import { modelUsesNegativePrompt } from "./prompt-pair";
import type { ComfyImageModel } from "./comfy-models/client";
import {
  applyAnatomyGuardForModel,
  applyAnatomyGuardToNegative,
  applyAnatomyGuardToPositive,
  type AnatomyGuardMode,
} from "./anatomy-guard";
import { loadAnatomyGuardMode } from "./anatomy-guard-settings";
import {
  applyRenderRealismForModel,
  applyRenderRealismToNegative,
  applyRenderRealismToPositive,
  type RenderRealismMode,
} from "./render-realism";
import { loadRenderRealismMode } from "./render-realism-settings";
import type { AthleticSport } from "./athletic-sport-profiles";
import { resolveQueueNegativePromptRaw } from "./queue-negative";
import { isQwenLightningModel } from "./model-sampling-patch";
import { isQwenRapidAioModel } from "./model-denoise-defaults";

/** Distilled Lightning (CFG 1) softens with long auto-negatives — keep only short explicit ones. */
const LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS = 160;

/** Short CFG-1-friendly anti-moiré terms for Phr00t Rapid AIO. */
const RAPID_AIO_MOIRE_NEGATIVE =
  "moire, moiré, halftone, screen door, mesh pattern, wavy interference, grid artifacts, banding, crosshatch";

const RAPID_AIO_MOIRE_POSITIVE =
  "clean continuous tones, smooth natural skin texture, even gradients";

function appendUniqueCsv(base: string | undefined, extra: string): string {
  const existing = base?.trim() ?? "";
  if (!existing) {
    return extra;
  }
  const lower = existing.toLowerCase();
  const missing = extra
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part && !lower.includes(part.toLowerCase()));
  if (missing.length === 0) {
    return existing;
  }
  return `${existing}, ${missing.join(", ")}`;
}

export function applyQueuePromptSteering(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
}): { positive: string; negative?: string } {
  const realismMode = input.realismMode ?? loadRenderRealismMode();
  const anatomyMode = input.anatomyMode ?? loadAnatomyGuardMode();

  if (isQwenLightningModel(input.model)) {
    // CFG-1: skip long realism/anatomy positive suffixes — they soften distilled stacks.
    const explicit = input.negative?.trim();
    return {
      positive: input.positive,
      negative:
        explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS
          ? explicit
          : undefined,
    };
  }

  // Rapid AIO is CFG-1 distilled (Lightning baked in) — skip long auto-negatives
  // and long realism/anatomy positives; keep short anti-moiré cues only.
  if (isQwenRapidAioModel(input.model)) {
    const explicit = input.negative?.trim();
    const shortExplicit =
      explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS
        ? explicit
        : undefined;
    return {
      positive: appendUniqueCsv(input.positive, RAPID_AIO_MOIRE_POSITIVE),
      negative: appendUniqueCsv(shortExplicit, RAPID_AIO_MOIRE_NEGATIVE),
    };
  }

  const withRealism = applyRenderRealismForModel({
    positive: input.positive,
    negative: input.negative,
    model: input.model,
    mode: realismMode,
  });

  return applyAnatomyGuardForModel({
    positive: withRealism.positive,
    negative: withRealism.negative,
    model: input.model,
    mode: anatomyMode,
  });
}

export async function prepareQueuePrompts(input: {
  model: ComfyImageModel | string;
  positive: string;
  hints?: string;
  sport?: AthleticSport | null;
  tool?: string;
  explicitNegative?: string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
}): Promise<{ positive: string; negative?: string }> {
  let negative: string | undefined;
  const distilledCfg1 =
    isQwenLightningModel(input.model) || isQwenRapidAioModel(input.model);
  if (distilledCfg1) {
    // Skip auto-negative profiles — they fight CFG-1 distillation.
    negative = input.explicitNegative?.trim() || undefined;
  } else if (modelUsesNegativePrompt(input.model)) {
    negative = await resolveQueueNegativePromptRaw({
      model: input.model,
      hints: input.hints,
      sport: input.sport,
      tool: input.tool,
      explicitNegative: input.explicitNegative,
    });
  }

  return applyQueuePromptSteering({
    positive: input.positive,
    negative,
    model: input.model,
    realismMode: input.realismMode,
    anatomyMode: input.anatomyMode,
  });
}

export function preparePositiveForQueue(
  positive: string,
  options?: {
    realismMode?: RenderRealismMode;
    anatomyMode?: AnatomyGuardMode;
  },
): string {
  const withRealism = applyRenderRealismToPositive(
    positive,
    options?.realismMode ?? loadRenderRealismMode(),
  );
  return applyAnatomyGuardToPositive(
    withRealism,
    options?.anatomyMode ?? loadAnatomyGuardMode(),
  );
}

export function prepareNegativeForQueue(
  negative: string | undefined,
  options?: {
    realismMode?: RenderRealismMode;
    anatomyMode?: AnatomyGuardMode;
  },
): string | undefined {
  const withRealism = applyRenderRealismToNegative(
    negative,
    options?.realismMode ?? loadRenderRealismMode(),
  );
  return applyAnatomyGuardToNegative(
    withRealism,
    options?.anatomyMode ?? loadAnatomyGuardMode(),
  );
}
