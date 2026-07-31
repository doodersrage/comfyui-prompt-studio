import type { ComfyGalleryEntry } from './comfyui-gallery';
import { tokenize, bigrams } from './semantic-search';

export type GallerySimilarityScore = {
  entry: ComfyGalleryEntry;
  score: number;
  promptScore: number;
  paramScore: number;
};

// Pre-compute token sets for fast overlap checking.
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

/** Fast similarity score using pre-tokenized reference corpus. */
function fastSimilarityScore(
  entryPrompt: string,
  queryTokens: Set<string>,
  queryBigrams: string[],
  referenceLower: string
): number {
  const candidateTokens = tokenize(entryPrompt);
  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }
  let score = overlap / queryTokens.size;

  // Direct string inclusion check is cheaper than re-tokenizing.
  const entryLower = entryPrompt.toLowerCase();
  for (const pair of queryBigrams) {
    if (entryLower.includes(pair)) {
      score += 0.08;
    }
  }

  return Math.min(1, score);
}

export function rankGallerySimilarity(
  entries: ComfyGalleryEntry[],
  reference: ComfyGalleryEntry
): GallerySimilarityScore[] {
  // Pre-tokenize the reference once instead of re-tokenizing per entry.
  const queryTokens = tokenize(
    [reference.prompt, reference.negativePrompt, reference.tool, reference.model]
      .filter(Boolean)
      .join(' ')
  );

  if (queryTokens.size === 0) {
    return entries
      .filter(entry => entry.id !== reference.id)
      .map(entry => ({
        entry,
        score: 0,
        promptScore: 0,
        paramScore: paramSimilarity(reference, entry),
      }));
  }

  const queryBigrams = bigrams(
    [reference.prompt, reference.negativePrompt, reference.tool, reference.model]
      .filter(Boolean)
      .join(' ')
  );

  return entries
    .filter(entry => entry.id !== reference.id)
    .map(entry => {
      const promptScore = fastSimilarityScore(
        entry.prompt,
        queryTokens,
        queryBigrams,
        [reference.prompt, reference.negativePrompt, reference.tool, reference.model]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
      );
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
