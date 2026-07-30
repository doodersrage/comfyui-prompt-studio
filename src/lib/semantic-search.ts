function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
  );
}

function bigrams(text: string): string[] {
  const list = [...tokenize(text)];
  const pairs: string[] = [];
  for (let index = 0; index < list.length - 1; index += 1) {
    pairs.push(`${list[index]} ${list[index + 1]}`);
  }
  return pairs;
}

export function semanticRelevanceScore(query: string, corpus: string): number {
  const queryTokens = tokenize(query);
  if (queryTokens.size === 0) {
    return 0;
  }
  const corpusTokens = tokenize(corpus);
  const corpusLower = corpus.toLowerCase();
  let overlap = 0;
  for (const token of queryTokens) {
    if (corpusTokens.has(token)) {
      overlap += 1;
    }
  }
  let score = overlap / queryTokens.size;

  const phrase = query.trim().toLowerCase();
  if (phrase.length > 4 && corpusLower.includes(phrase)) {
    score += 0.35;
  }

  for (const pair of bigrams(query)) {
    if (corpusLower.includes(pair)) {
      score += 0.08;
    }
  }

  return Math.min(1, score);
}

export function rankBySemanticQuery<T>(
  items: T[],
  query: string,
  toCorpus: (item: T) => string
): Array<{ item: T; score: number }> {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map(item => ({ item, score: 0 }));
  }
  return items
    .map(item => ({
      item,
      score: semanticRelevanceScore(trimmed, toCorpus(item)),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function rankSimilarToCorpus<T>(
  items: T[],
  reference: string,
  toCorpus: (item: T) => string
): Array<{ item: T; score: number }> {
  const trimmed = reference.trim();
  if (!trimmed) {
    return items.map(item => ({ item, score: 0 }));
  }
  return items
    .map(item => ({
      item,
      score: semanticRelevanceScore(trimmed, toCorpus(item)),
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

export function filterBySemanticQuery<T>(
  items: T[],
  query: string,
  toCorpus: (item: T) => string,
  minScore = 0.15
): T[] {
  const ranked = rankBySemanticQuery(items, query, toCorpus);
  if (ranked.length === 0) {
    return items.filter(item => toCorpus(item).toLowerCase().includes(query.trim().toLowerCase()));
  }
  return ranked.filter(entry => entry.score >= minScore).map(entry => entry.item);
}
