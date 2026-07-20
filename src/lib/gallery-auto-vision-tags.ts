"use client";

import { reviewGalleryImage } from "./gallery-vision-review";
import { galleryEntryViewUrls, updateComfyGalleryEntryById, type ComfyGalleryEntry } from "./comfyui-gallery";
import { loadComfyUiSettings } from "./comfyui-settings";

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

    const review = await reviewGalleryImage({
      imageDataUrl: dataUrl,
      prompt: entry.prompt,
    });
    if (review.tags.length > 0) {
      updateComfyGalleryEntryById(entry.id, { visionTags: review.tags });
    }
  } catch {
    // optional enrichment
  }
}
