import type { ComfyGalleryEntry } from "./comfyui-gallery";

export { MAX_GALLERY_ENTRIES as GALLERY_ENTRY_LIMIT } from "./comfyui-gallery";

export type GalleryStats = {
  total: number;
  completed: number;
  pending: number;
  running: number;
  error: number;
  favorites: number;
  unreviewed: number;
  avgRating: number | null;
};

export function computeGalleryStats(entries: ComfyGalleryEntry[]): GalleryStats {
  let completed = 0;
  let pending = 0;
  let running = 0;
  let error = 0;
  let favorites = 0;
  let unreviewed = 0;
  let ratingSum = 0;
  let ratingCount = 0;

  for (const entry of entries) {
    if (entry.status === "completed") {
      completed += 1;
    } else if (entry.status === "pending") {
      pending += 1;
    } else if (entry.status === "running") {
      running += 1;
    } else if (entry.status === "error") {
      error += 1;
    }

    if (entry.favorite) {
      favorites += 1;
    }

    if (entry.status === "completed" && !entry.reviewRating) {
      unreviewed += 1;
    }

    if (entry.reviewRating) {
      ratingSum += entry.reviewRating;
      ratingCount += 1;
    }
  }

  return {
    total: entries.length,
    completed,
    pending,
    running,
    error,
    favorites,
    unreviewed,
    avgRating: ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : null,
  };
}
