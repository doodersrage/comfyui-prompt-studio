import { applyLockedLocation } from "./locked-location";
import { enrichGenerateResult } from "./generation-diagnostics";
import { normalizeGenerationSettings } from "./generation-settings";
import { generatePrompt } from "./prompt-generator";
import { generateBackgroundPrompt } from "./specialized/background-generator";
import { generateCharacterPrompt } from "./specialized/character-generator";
import { generateFantasyPrompt } from "./specialized/fantasy-generator";
import { generatePetPrompt } from "./specialized/pet-generator";
import type { ComfyImageModel } from "./comfy-models/client";
import type { DetailLevel } from "./detail-level";
import type { LlmRequestOptions } from "./llm-request-options";

export type BatchFromTopicsTarget =
  | "generate"
  | "duo"
  | "character"
  | "pet"
  | "fantasy"
  | "background";

export type BatchFromTopicsOptions = {
  topics: string[];
  target: BatchFromTopicsTarget;
  model: ComfyImageModel;
  detail: DetailLevel;
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  recentClothing?: string[];
  recentLocations?: string[];
  blockedLocations?: string[];
  alwaysIncludeClothing?: boolean;
  distinctPeople?: boolean;
  teamKit?: boolean;
  llm?: LlmRequestOptions;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export type BatchFromTopicsItem = {
  topic: string;
  prompt: string;
  provider: "llm" | "template";
};

export type BatchFromTopicsResult = {
  results: BatchFromTopicsItem[];
  count: number;
};

export async function batchGenerateFromTopics(
  options: BatchFromTopicsOptions,
): Promise<BatchFromTopicsResult> {
  const topics = options.topics
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);

  const results: BatchFromTopicsItem[] = [];

  for (const topic of topics) {
    const hints = applyLockedLocation(topic, options.lockedLocation) ?? topic;
    const avoidance = {
      avoidedTokens: options.avoidedTokens,
      avoidedTokensInstruction: options.avoidedTokensInstruction,
    };

    if (options.target === "duo") {
      const result = await generateCharacterPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: "action",
        variationStrength: 50,
        presetOptions: { headcount: "duo" },
        alwaysIncludeClothing: options.alwaysIncludeClothing !== false,
        teamKit: options.teamKit === true,
        lockedWardrobeId: options.lockedWardrobeId,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        llm: options.llm,
        ...avoidance,
      });
      const enriched = enrichGenerateResult(result, hints, {
        teamKit: options.teamKit,
      });
      results.push({
        topic,
        prompt: enriched.prompt,
        provider: enriched.provider,
      });
      continue;
    }

    if (options.target === "character") {
      const result = await generateCharacterPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: "portrait",
        variationStrength: 50,
        alwaysIncludeClothing: options.alwaysIncludeClothing !== false,
        lockedWardrobeId: options.lockedWardrobeId,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        llm: options.llm,
        ...avoidance,
      });
      results.push({
        topic,
        prompt: result.prompt,
        provider: result.provider,
      });
      continue;
    }

    if (options.target === "pet") {
      const result = await generatePetPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: "action",
        variationStrength: 50,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        recentLocations: options.recentLocations,
        blockedLocations: options.blockedLocations,
        llm: options.llm,
        ...avoidance,
      });
      results.push({
        topic,
        prompt: result.prompt,
        provider: result.provider,
      });
      continue;
    }

    if (options.target === "fantasy") {
      const result = await generateFantasyPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: "action",
        wildness: 65,
        variationStrength: 50,
        lockedWardrobeId: options.lockedWardrobeId,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        recentLocations: options.recentLocations,
        blockedLocations: options.blockedLocations,
        alwaysIncludeClothing: options.alwaysIncludeClothing !== false,
        llm: options.llm,
        ...avoidance,
      });
      results.push({
        topic,
        prompt: result.prompt,
        provider: result.provider,
      });
      continue;
    }

    if (options.target === "background") {
      const result = await generateBackgroundPrompt({
        model: options.model,
        detail: options.detail,
        settingType: hints,
        recentLocations: options.recentLocations,
        blockedLocations: options.blockedLocations,
        llm: options.llm,
        ...avoidance,
      });
      results.push({
        topic,
        prompt: result.prompt,
        provider: result.provider,
      });
      continue;
    }

    const settings = normalizeGenerationSettings({
      model: options.model,
      detail: options.detail,
      distinctPeople: options.distinctPeople,
      alwaysIncludeClothing: options.alwaysIncludeClothing,
    });

    const result = await generatePrompt(hints, "positive", settings, {
      recentClothing: options.recentClothing,
      lockedWardrobeId: options.lockedWardrobeId,
      avoidedTokensInstruction: options.avoidedTokensInstruction,
    });

    results.push({
      topic,
      prompt: result.prompt,
      provider: result.provider,
    });
  }

  return { results, count: results.length };
}
