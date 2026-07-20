"use client";

import { requeueComfyJobFromEntry } from "./comfyui-requeue";
import { queueMutatedGalleryJobs } from "./gallery-mutations";
import { queueSeedExperiment } from "./seed-experiment-queue";
import { loadComfyUiSettings } from "./comfyui-settings";
import { runLowRatingMutation } from "./rating-prompt-mutations";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

function formatRequeueFailure(
  label: string,
  result: { ok: boolean; error?: string },
): string {
  return `Auto-improve: ${label} re-queue failed — ${result.error ?? "ComfyUI queue failed."}`;
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

  if (rating === 5 && settings.autoRequeueMaxOnFiveStar !== false) {
    const maxResult = await requeueComfyJobFromEntry(entry, {
      newSeed: true,
      qualityProfile: "max",
    });
    if (maxResult.ok) {
      return "Auto-improve: re-queued winner at Max quality (new seed).";
    }

    if (settings.autoRequeueFinalOnHighRating !== false) {
      const finalResult = await requeueComfyJobFromEntry(entry, {
        newSeed: true,
        qualityProfile: "final",
      });
      if (finalResult.ok) {
        return `Auto-improve: Max failed (${maxResult.error ?? "queue error"}); re-queued at Final instead.`;
      }
      return formatRequeueFailure("Max and Final", finalResult);
    }

    return formatRequeueFailure("Max", maxResult);
  }

  if (rating >= 4 && settings.autoRequeueFinalOnHighRating !== false) {
    const result = await requeueComfyJobFromEntry(entry, {
      newSeed: true,
      qualityProfile: "final",
    });
    if (result.ok) {
      return "Auto-improve: re-queued winner at Final quality (new seed).";
    }
    return formatRequeueFailure("Final", result);
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
