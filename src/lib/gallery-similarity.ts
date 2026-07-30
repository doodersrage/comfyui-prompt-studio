import type { ComfyGalleryEntry } from './comfyui-gallery';
import { semanticRelevanceScore } from './semantic-search';

export type GallerySimilarityScore = {
  entry: ComfyGalleryEntry;
  score: number;
  promptScore: number;
  paramScore: number;
};

function paramSimilarity(reference: ComfyGalleryEntry, candidate: ComfyGalleryEntry): number {
  const a = reference.queueParams;
  const b = candidate.queueParams;
  if (!a || !b) {
    return 0;
  }
  let matches = 0;
  let total = 0;
  for (const key of ['cfg', 'steps', 'width', 'height'] as const) {
    if (a[key] != null || b[key] != null) {
      total += 1;
      if (String(a[key] ?? '') === String(b[key] ?? '')) {
        matches += 1;
      }
    }
  }
  if (reference.model && candidate.model && reference.model === candidate.model) {
    total += 1;
    matches += 1;
  }
  return total > 0 ? matches / total : 0;
}

export function rankGallerySimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): GallerySimilarityScore[] {
  const referenceCorpus = [
    reference.prompt,
    reference.negativePrompt,
    reference.tool,
    reference.model,
  ]
    .filter(Boolean)
    .join(' ');

  return entries
    .filter(entry => entry.id !== reference.id)
    .map(entry => {
      const promptScore = semanticRelevanceScore(entry.prompt, referenceCorpus);
      const paramScore = paramSimilarity(reference, entry);
      const score = promptScore * 0.78 + paramScore * 0.22;
      return { entry, score, promptScore, paramScore };
    })
    .filter(item => item.score > 0.12)
    .sort((a, b) => b.score - a.score || b.promptScore - a.promptScore);
}

export function orderGalleryBySimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): ComfyGalleryEntry[] {
  const ranked = rankGallerySimilarity(entries, reference);
  const rankedIds = new Set(ranked.map(item => item.entry.id));
  const tail = entries.filter(entry => !rankedIds.has(entry.id) && entry.id !== reference.id);
  const ordered = [...ranked.map(item => item.entry), ...tail];
  if (entries.some(entry => entry.id === reference.id)) {
    return [reference, ...ordered];
  }
  return ordered;
}
