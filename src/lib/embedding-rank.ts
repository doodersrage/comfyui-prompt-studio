export async function fetchEmbeddingRankIds(
  query: string,
  items: Array<{ id: string; text: string }>,
): Promise<string[] | null> {
  const trimmed = query.trim();
  if (!trimmed || items.length === 0) {
    return null;
  }

  try {
    const response = await fetch("/api/search/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: trimmed, items }),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { results?: Array<{ id: string }> };
    return data.results?.map((entry) => entry.id) ?? null;
  } catch {
    return null;
  }
}

export function sortByRankIds<T extends { id: string }>(
  items: T[],
  rankIds: string[] | null | undefined,
): T[] {
  if (!rankIds?.length) {
    return items;
  }
  const order = new Map(rankIds.map((id, index) => [id, index]));
  const allowed = new Set(rankIds);
  return [...items]
    .filter((item) => allowed.has(item.id))
    .sort((left, right) => (order.get(left.id) ?? 9999) - (order.get(right.id) ?? 9999));
}

export function galleryEntryCorpus(entry: {
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  promptId?: string;
  statusMessage?: string;
}): string {
  return [
    entry.prompt,
    entry.negativePrompt,
    entry.tool,
    entry.model,
    entry.promptId,
    entry.statusMessage,
  ]
    .filter(Boolean)
    .join("\n");
}
