"use client";

import { queueMutatedGalleryJobs } from "./gallery-mutations";
import { queueSeedExperiment } from "./seed-experiment-queue";
import { loadComfyUiSettings } from "./comfyui-settings";
import { runLowRatingMutation } from "./rating-prompt-mutations";
import type { ComfyGalleryEntry } from "./comfyui-gallery";

export async function runAutoImproveOnRating(
  entry: ComfyGalleryEntry,
  rating: ComfyGalleryEntry["reviewRating"],
): Promise<string | null> {
  if (!rating) {
    return null;
  }

  if (rating <= 2) {
    return runLowRatingMutation(entry, rating);
  }

  const settings = loadComfyUiSettings();

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
