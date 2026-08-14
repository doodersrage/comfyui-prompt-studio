'use client';

import {
  galleryEntryThumbUrls,
  updateComfyGalleryEntryById,
  type ComfyGalleryEntry,
} from './comfyui-gallery';
import { loadComfyUiSettings } from './comfyui-settings';
import { galleryUploadPromptLooksGeneric } from './gallery-local-import';

type VisionReviewResult = {
  suggestedRating: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  critique: string;
};

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.readAsDataURL(blob);
  });
}

export async function autoTagGalleryEntry(entry: ComfyGalleryEntry): Promise<void> {
  if (entry.visionTags?.length || entry.status !== 'completed') {
    return;
  }
  if (loadComfyUiSettings().autoVisionTags === false) {
    return;
  }

  // Prefer thumbnails to cut bandwidth/CPU vs full-resolution outputs.
  const imageUrl = galleryEntryThumbUrls(entry)[0];
  if (!imageUrl) {
    return;
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return;
    }
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    let prompt = entry.prompt.trim() || 'Uploaded still';

    if (galleryUploadPromptLooksGeneric(entry)) {
      const captionResponse = await fetch('/api/gallery/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      if (captionResponse.ok) {
        const captioned = (await captionResponse.json()) as { caption?: string };
        const caption = captioned.caption?.trim();
        if (caption) {
          prompt = caption;
          updateComfyGalleryEntryById(entry.id, { prompt });
        }
      }
    }

    const reviewResponse = await fetch('/api/gallery/vision-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        prompt,
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

/** Sequential so a batch of uploads does not stampede the vision LLM. */
export function queueGalleryVisionScans(entries: ComfyGalleryEntry[]): void {
  if (entries.length === 0) {
    return;
  }
  void (async () => {
    for (const entry of entries) {
      await autoTagGalleryEntry(entry);
    }
  })();
}
