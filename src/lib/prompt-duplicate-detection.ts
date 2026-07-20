export function tokenizePrompt(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 3),
  );
}

export function promptSimilarity(a: string, b: string): number {
  const tokensA = tokenizePrompt(a);
  const tokensB = tokenizePrompt(b);
  if (tokensA.size === 0 || tokensB.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(tokensA.size, tokensB.size);
}

export function findDuplicatePrompts<T extends { id: string; prompt: string }>(
  entries: T[],
  threshold = 0.85,
): Array<{ ids: string[]; similarity: number; prompt: string }> {
  const groups: Array<{ ids: string[]; similarity: number; prompt: string }> = [];
  const used = new Set<string>();

  for (let i = 0; i < entries.length; i += 1) {
    if (used.has(entries[i].id)) {
      continue;
    }
    const cluster = [entries[i].id];
    let maxSim = 0;
    for (let j = i + 1; j < entries.length; j += 1) {
      const sim = promptSimilarity(entries[i].prompt, entries[j].prompt);
      if (sim >= threshold) {
        cluster.push(entries[j].id);
        used.add(entries[j].id);
        maxSim = Math.max(maxSim, sim);
      }
    }
    if (cluster.length > 1) {
      used.add(entries[i].id);
      groups.push({ ids: cluster, similarity: maxSim, prompt: entries[i].prompt });
    }
  }

  return groups.sort((a, b) => b.ids.length - a.ids.length);
}
