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
import { isQwenLightningModel, isWanLightningModel } from "./model-sampling-patch";
import { isQwenRapidAioModel, isWanRapidAioModel } from "./model-denoise-defaults";
import { expandWildcardText } from "./wildcard-expand";
import {
  loadCustomWildcardLists,
  loadWildcardExpansionEnabled,
  loadWildcardSeed,
} from "./wildcard-settings";

/** Distilled Lightning (CFG 1) softens with long auto-negatives — keep only short explicit ones. */
const LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS = 160;

/**
 * Cap combined realism + anatomy growth so scene-specific positive text stays dominant.
 * Negatives are budgeted separately and can stay longer.
 */
const MAX_QUEUE_POSITIVE_SUFFIX_CHARS = 200;

/** Short CFG-1-friendly anti-moiré terms for Phr00t Rapid AIO. */
const RAPID_AIO_MOIRE_NEGATIVE =
  "moire, moiré, halftone, screen door, mesh pattern, wavy interference, grid artifacts, banding, crosshatch";

const RAPID_AIO_MOIRE_POSITIVE =
  "clean continuous tones, smooth natural skin texture, even gradients";

/** Short CFG-1-friendly temporal / anatomy cues for WAN Lightning 4-step. */
export const WAN_LIGHTNING_ARTIFACT_NEGATIVE =
  "flicker, morphing, identity drift, abrupt cuts, extra limbs, warped hands, duplicate subjects, floating props";

export const WAN_LIGHTNING_ARTIFACT_POSITIVE =
  "stable identity, consistent limb count, coherent hands, temporal continuity";

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

  // WAN Lightning / Rapid AIO are CFG-1 distilled — long video-motion + anatomy lists fight them.
  // Keep short temporal/limb cues instead of full still-image steering.
  if (isWanLightningModel(input.model) || isWanRapidAioModel(input.model)) {
    const explicit = input.negative?.trim();
    const shortExplicit =
      explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS
        ? explicit
        : undefined;
    return {
      positive: appendUniqueCsv(input.positive, WAN_LIGHTNING_ARTIFACT_POSITIVE),
      negative: appendUniqueCsv(shortExplicit, WAN_LIGHTNING_ARTIFACT_NEGATIVE),
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

  const baseLength = input.positive.trim().length;
  const withRealism = applyRenderRealismForModel({
    positive: input.positive,
    negative: input.negative,
    model: input.model,
    mode: realismMode,
    maxPositiveAppendChars: MAX_QUEUE_POSITIVE_SUFFIX_CHARS,
  });
  const realismGrowth = Math.max(
    0,
    withRealism.positive.trim().length - baseLength,
  );

  return applyAnatomyGuardForModel({
    positive: withRealism.positive,
    negative: withRealism.negative,
    model: input.model,
    mode: anatomyMode,
    maxPositiveAppendChars: Math.max(
      0,
      MAX_QUEUE_POSITIVE_SUFFIX_CHARS - realismGrowth,
    ),
  });
}

/**
 * Wildcards / dynamic prompts: `__name__` list tokens and `{a|b|c}` choice
 * groups, expanded before any other queue-prep step. Gated by the shared
 * `expandWildcards` setting (default on) and reproducible via `wildcardSeed`.
 */
function expandWildcardsForQueue(
  text: string | undefined,
  options?: { expandWildcards?: boolean; wildcardSeed?: string },
): string | undefined {
  if (!text) {
    return text;
  }
  const enabled = options?.expandWildcards ?? loadWildcardExpansionEnabled();
  if (!enabled) {
    return text;
  }
  return expandWildcardText(text, {
    seed: options?.wildcardSeed ?? loadWildcardSeed(),
    wildcards: loadCustomWildcardLists(),
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
  /** Overrides the shared `expandWildcards` setting for this call. */
  expandWildcards?: boolean;
  /** Overrides the shared `wildcardSeed` setting for this call (reproducible expands). */
  wildcardSeed?: string;
}): Promise<{ positive: string; negative?: string }> {
  const wildcardOptions = {
    expandWildcards: input.expandWildcards,
    wildcardSeed: input.wildcardSeed,
  };
  const positive =
    expandWildcardsForQueue(input.positive, wildcardOptions) ?? input.positive;
  const hints = expandWildcardsForQueue(input.hints, wildcardOptions);
  const explicitNegative = expandWildcardsForQueue(
    input.explicitNegative,
    wildcardOptions,
  );

  let negative: string | undefined;
  const distilledCfg1 =
    isQwenLightningModel(input.model) ||
    isWanLightningModel(input.model) ||
    isWanRapidAioModel(input.model) ||
    isQwenRapidAioModel(input.model);
  if (distilledCfg1) {
    // Skip auto-negative profiles — they fight CFG-1 distillation.
    // WAN Lightning gets a short artifact pack in applyQueuePromptSteering.
    negative = explicitNegative?.trim() || undefined;
  } else if (modelUsesNegativePrompt(input.model)) {
    negative = await resolveQueueNegativePromptRaw({
      model: input.model,
      hints,
      sport: input.sport,
      tool: input.tool,
      explicitNegative,
    });
  }

  return applyQueuePromptSteering({
    positive,
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
