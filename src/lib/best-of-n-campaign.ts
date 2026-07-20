import { reviewGalleryImage } from "./gallery-vision-review";

export type BestOfNCandidate = {
  id: string;
  prompt: string;
  imageDataUrl: string;
  score?: number;
};

export async function rankBestOfN(
  candidates: BestOfNCandidate[],
): Promise<BestOfNCandidate[]> {
  const ranked: BestOfNCandidate[] = [];
  for (const candidate of candidates) {
    try {
      const review = await reviewGalleryImage({
        imageDataUrl: candidate.imageDataUrl,
        prompt: candidate.prompt,
      });
      ranked.push({ ...candidate, score: review.suggestedRating });
    } catch {
      ranked.push({ ...candidate, score: 0 });
    }
  }
  return ranked.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function pickTopCandidates<T extends { score?: number }>(
  ranked: T[],
  keep = 3,
): T[] {
  return ranked.slice(0, keep);
}
