"use client";

import { modelUsesNegativePrompt } from "./prompt-pair";
import type { ComfyImageModel } from "./comfy-models";
import {
  applyAnatomyGuardForModel,
  applyAnatomyGuardToNegative,
  applyAnatomyGuardToPositive,
  type AnatomyGuardMode,
} from "./anatomy-guard";
import { loadAnatomyGuardMode } from "./anatomy-guard-settings";
import {
  applyRenderRealismForModel,
  applyRenderRealismToPositive,
  type RenderRealismMode,
} from "./render-realism";
import { loadRenderRealismMode } from "./render-realism-settings";
import type { AthleticSport } from "./athletic-sport-profiles";
import { resolveQueueNegativePromptRaw } from "./queue-negative";

export function applyQueuePromptSteering(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
}): { positive: string; negative?: string } {
  const withRealism = applyRenderRealismForModel({
    positive: input.positive,
    negative: input.negative,
    model: input.model,
    mode: input.realismMode ?? loadRenderRealismMode(),
  });

  return applyAnatomyGuardForModel({
    positive: withRealism.positive,
    negative: withRealism.negative,
    model: input.model,
    mode: input.anatomyMode ?? loadAnatomyGuardMode(),
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
  if (modelUsesNegativePrompt(input.model)) {
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
