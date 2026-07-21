"use client";

import {
  requeueComfyJobFromEntry,
  requeueMoireCleanFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from "./comfyui-requeue";
import { queueMutatedGalleryJobs } from "./gallery-mutations";
import { queueSeedExperiment } from "./seed-experiment-queue";
import { loadComfyUiSettings } from "./comfyui-settings";
import { runLowRatingMutation } from "./rating-prompt-mutations";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { isQwenLightningModel } from "./model-sampling-patch";
import { isQwenRapidAioModel } from "./model-denoise-defaults";

function formatRequeueFailure(
  label: string,
  result: { ok: boolean; error?: string },
): string {
  return `Auto-improve: ${label} re-queue failed — ${result.error ?? "ComfyUI queue failed."}`;
}

async function improveHighRatingEntry(
  entry: ComfyGalleryEntry,
  qualityProfile: "final" | "max",
  options?: {
    refineAfterComplete?: "final" | "max";
  },
): Promise<{ ok: boolean; error?: string; kind: string }> {
  const model = entry.model ?? "qwen-image-2512";

  if (isQwenRapidAioModel(model)) {
    const result = await requeueMoireCleanFromGalleryEntry(entry, {
      qualityProfile,
    });
    return {
      ok: result.ok,
      error: result.error,
      kind: qualityProfile === "max" ? "moiré clean (Max)" : "moiré clean (Final)",
    };
  }

  if (isQwenLightningModel(model)) {
    const result = await requeueComfyJobFromEntry(entry, {
      newSeed: true,
      qualityProfile,
    });
    return {
      ok: result.ok,
      error: result.error,
      kind:
        qualityProfile === "max"
          ? "Lightning re-queue (Max, new seed)"
          : "Lightning re-queue (Final, new seed)",
    };
  }

  const result = await requeueUpscaleFromGalleryEntry(entry, {
    qualityProfile,
    refineAfterComplete: options?.refineAfterComplete,
  });
  return {
    ok: result.ok,
    error: result.error,
    kind: qualityProfile === "max" ? "Max upscale" : "Final upscale",
  };
}

export async function runAutoImproveOnRating(
  entry: ComfyGalleryEntry,
  rating: ComfyGalleryEntry["reviewRating"],
): Promise<string | null> {
  if (!rating) {
    return null;
  }

  if (rating <= 2) {
    if (loadComfyUiSettings().autoRefineOnLowRating !== false) {
      return runLowRatingMutation(entry, rating);
    }
    return null;
  }

  const settings = loadComfyUiSettings();
  const model = entry.model ?? "qwen-image-2512";

  if (rating === 5 && settings.autoRequeueMaxOnFiveStar !== false) {
    const refineAfterComplete =
      settings.autoImg2imgRefineOnFiveStar &&
      !isQwenLightningModel(model) &&
      !isQwenRapidAioModel(model)
        ? ("max" as const)
        : undefined;
    const maxResult = await improveHighRatingEntry(entry, "max", {
      refineAfterComplete,
    });
    if (maxResult.ok) {
      if (refineAfterComplete) {
        return `Auto-improve: ${maxResult.kind}; refine will queue when upscale finishes.`;
      }
      if (settings.autoImg2imgRefineOnFiveStar && isQwenLightningModel(model)) {
        return `Auto-improve: ${maxResult.kind} (Lightning skips img2img refine).`;
      }
      if (settings.autoImg2imgRefineOnFiveStar && isQwenRapidAioModel(model)) {
        return `Auto-improve: ${maxResult.kind} (Rapid AIO skips img2img refine after polish).`;
      }
      return `Auto-improve: ${maxResult.kind}.`;
    }

    if (settings.autoRequeueFinalOnHighRating !== false) {
      const finalResult = await improveHighRatingEntry(entry, "final");
      if (finalResult.ok) {
        return `Auto-improve: Max path failed (${maxResult.error ?? "queue error"}); used ${finalResult.kind} instead.`;
      }
      return formatRequeueFailure("Max and Final improve", finalResult);
    }

    return formatRequeueFailure(maxResult.kind, maxResult);
  }

  if (rating >= 4 && settings.autoRequeueFinalOnHighRating !== false) {
    const result = await improveHighRatingEntry(entry, "final");
    if (result.ok) {
      return `Auto-improve: ${result.kind}.`;
    }
    return formatRequeueFailure(result.kind, result);
  }

  if (rating >= 4 && settings.autoMutateOnHighRating) {
    const queued = await queueMutatedGalleryJobs({
      entry,
      kinds: ["variation", "location", "wardrobe"],
      count: 3,
    });
    return `Auto-improve: queued ${queued} mutations for ${rating}★ output.`;
  }

  if (rating >= 4 && settings.autoSeedExperimentOnHighRating) {
    const { queued } = await queueSeedExperiment({
      prompt: entry.prompt,
      model: entry.model ?? "qwen-image-2512",
      negativePrompt: entry.negativePrompt,
      hints: entry.prompt.slice(0, 200),
      count: 4,
    });
    return `Auto-improve: queued ${queued} seed experiments for ${rating}★ output.`;
  }

  return null;
}

export async function runAutoImproveOnFavorite(
  entry: ComfyGalleryEntry,
  favorite: boolean,
): Promise<string | null> {
  if (!favorite || !loadComfyUiSettings().autoSeedExperimentOnFavorite) {
    return null;
  }

  const { queued } = await queueSeedExperiment({
    prompt: entry.prompt,
    model: entry.model ?? "qwen-image-2512",
    negativePrompt: entry.negativePrompt,
    hints: entry.prompt.slice(0, 200),
    count: 3,
  });
  return `Auto-improve: queued ${queued} seed experiments for favorite.`;
}
