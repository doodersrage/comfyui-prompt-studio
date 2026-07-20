import {
  buildMandatoryLocationBlock,
  parseSettingHint,
} from "../hint-location";
import {
  buildGenerateWardrobeAssignments,
  buildGenerateWardrobeUserDirective,
  mergeGenerateWardrobeIntoPrompt,
} from "../generate-wardrobe";
import {
  buildNoClothingUserDirective,
  hintsImplyNoClothing,
} from "../clothing-tags";
import { getDetailLimits } from "../detail-level";
import { isMultiPersonInput } from "../distinct-people";
import { DEFAULT_GENERATION_SETTINGS } from "../generation-settings";
import { generatePrompt } from "../prompt-generator";
import { mergeLocationExclusions } from "../location-exclusions";
import { applyLockedLocation } from "../locked-location";
import { applyLockedVariationSeed } from "../locked-variation-seed";
import { buildRandomSceneSeed } from "./scene-pools";
import { buildToolResult, runSpecializedPrompt } from "./runner";
import type { RandomSceneOptions, ToolGenerateResult } from "./types";

export async function generateRandomScene(
  options: RandomSceneOptions,
): Promise<ToolGenerateResult> {
  const effectiveGenre = applyLockedLocation(options.genre, options.lockedLocation);
  const genreHint = parseSettingHint(effectiveGenre);
  const pinnedLocation =
    options.lockedLocation?.trim() || genreHint.location || null;
  const includePeople = options.includePeople !== false;
  const alwaysIncludeClothing = options.alwaysIncludeClothing !== false;
  const { seed: rolledSeed, location: sceneLocation } = buildRandomSceneSeed({
    genre: options.genre,
    includePeople,
    recentLocations: mergeLocationExclusions(
      options.recentLocations,
      options.blockedLocations,
    ),
    avoidedTokens: options.avoidedTokens,
  });
  const seed = applyLockedVariationSeed(rolledSeed, options.variationSeed);
  const locationBlock = buildMandatoryLocationBlock(pinnedLocation);

  const wildness = Math.min(100, Math.max(0, options.wildness ?? 65));
  const distinctPeople = isMultiPersonInput(seed);
  const wardrobeSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    model: options.model,
    detail: options.detail,
    alwaysIncludeClothing,
    distinctPeople,
    variation: {
      enabled: true,
      strength: wildness,
    },
  };
  const wardrobeAssignments =
    includePeople && alwaysIncludeClothing
      ? buildGenerateWardrobeAssignments(seed, wardrobeSettings, {
          assumePeople: true,
          recentClothing: options.recentClothing,
          lockedWardrobeId: options.lockedWardrobeId,
          avoidedTokens: options.avoidedTokens,
        })
      : null;
  const clothingDirective = wardrobeAssignments?.length
    ? buildGenerateWardrobeUserDirective(wardrobeAssignments)
    : hintsImplyNoClothing(seed)
      ? buildNoClothingUserDirective()
      : null;

  const toolInstructions = `You are a random scene prompt generator for ComfyUI.
- Invent ONE cohesive scene from the provided random ingredients.
- When a MANDATORY SETTING block is present, use that exact place. Do not substitute a different location.
- Follow the target model's prompt style exactly.
- ${includePeople === false ? "Do not include any people, figures, silhouettes, or crowds." : "If people appear, give them specific visual identity—not generic figures."}
- When wardrobe ingredients are assigned, keep every garment in the final prompt with scene-appropriate styling.
- Surprise the viewer with at least one unexpected but coherent detail.
- Wildness level: ${wildness}/100 (higher = stranger combinations, still one unified image).`;

  const userMessage = [
    locationBlock,
    `Random scene ingredients:\n${seed}`,
    clothingDirective,
    options.avoidedTokensInstruction,
    "Write a single model-ready prompt using every major ingredient above.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const metadata = {
    seed,
    includePeople,
    alwaysIncludeClothing,
    wildness,
    genre: options.genre?.trim() || null,
    location: genreHint.location,
    sceneLocation,
    randomOutfit: wardrobeAssignments,
  };

  const postProcessPrompt = wardrobeAssignments?.length
    ? (prompt: string) => {
        const { maxChars } = getDetailLimits(options.detail, options.model);
        return mergeGenerateWardrobeIntoPrompt(
          prompt,
          wardrobeAssignments,
          maxChars,
          seed,
        );
      }
    : undefined;

  const templateFallback = async () => {
    const result = await generatePrompt(seed, "positive", {
      ...wardrobeSettings,
      alwaysIncludeClothing: false,
    });
    if (!wardrobeAssignments?.length) {
      return result.prompt;
    }
    const { maxChars } = getDetailLimits(options.detail, options.model);
    return mergeGenerateWardrobeIntoPrompt(
      result.prompt,
      wardrobeAssignments,
      maxChars,
      seed,
    );
  };

  try {
    return await runSpecializedPrompt({
      model: options.model,
      detail: options.detail,
      toolInstructions,
      userMessage,
      templateFallback,
      sanitizeInput: seed,
      postProcessPrompt,
      temperature: options.llm?.temperature ?? 0.85 + wildness / 200,
      allowTemplateFallback: options.llm?.allowTemplateFallback,
      seed,
      metadata,
    });
  } catch {
    const result = await templateFallback();
    return buildToolResult(
      result,
      "template",
      options.model,
      options.detail,
      {
        seed,
        metadata,
      },
    );
  }
}
