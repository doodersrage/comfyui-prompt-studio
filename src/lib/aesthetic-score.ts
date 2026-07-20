import type { ComfyGalleryEntry } from "./comfyui-gallery";

export type AestheticScoreResult = {
  score: number;
  method: "heuristic" | "embedding";
  notes: string[];
};

export function scoreGalleryEntryHeuristic(entry: ComfyGalleryEntry): AestheticScoreResult {
  const notes: string[] = [];
  let score = 50;

  if (entry.reviewRating) {
    score = entry.reviewRating * 20;
    notes.push(`User review: ${entry.reviewRating}/5`);
  }
  if (entry.favorite) {
    score += 10;
    notes.push("Favorited");
  }
  if (entry.status === "completed") {
    score += 5;
  } else if (entry.status === "error") {
    score -= 20;
    notes.push("Job failed");
  }
  if (entry.prompt.length >= 80 && entry.prompt.length <= 420) {
    score += 5;
    notes.push("Prompt length in healthy range");
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    method: "heuristic",
    notes,
  };
}
