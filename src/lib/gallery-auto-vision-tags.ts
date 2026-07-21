"use client";

import { galleryEntryViewUrls, updateComfyGalleryEntryById, type ComfyGalleryEntry } from "./comfyui-gallery";
import { loadComfyUiSettings } from "./comfyui-settings";

type VisionReviewResult = {
  suggestedRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  critique: string;
};

export async function autoTagGalleryEntry(entry: ComfyGalleryEntry): Promise<void> {
  if (entry.visionTags?.length || entry.status !== "completed") {
    return;
  }
  if (loadComfyUiSettings().autoVisionTags === false) {
    return;
  }

  const imageUrl = galleryEntryViewUrls(entry)[0];
  if (!imageUrl) {
    return;
  }

  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(blob);
    });

    const reviewResponse = await fetch("/api/gallery/vision-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        prompt: entry.prompt,
      }),
    });
    if (!reviewResponse.ok) {
      return;
    }
    const review = (await reviewResponse.json()) as VisionReviewResult;
    if (review.tags.length > 0) {
      updateComfyGalleryEntryById(entry.id, { visionTags: review.tags });
    }
  } catch {
    // optional enrichment
  }
}
