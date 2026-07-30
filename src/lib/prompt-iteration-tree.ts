import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';

export type IterationTreeNode = {
  entry: PromptHistoryEntry;
  children: IterationTreeNode[];
};

export function buildPromptIterationForest(entries: PromptHistoryEntry[]): IterationTreeNode[] {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const childrenByParent = new Map<string, PromptHistoryEntry[]>();

  for (const entry of entries) {
    const parentId =
      typeof entry.metadata?.parentHistoryId === 'string'
        ? entry.metadata.parentHistoryId
        : undefined;
    if (!parentId || !byId.has(parentId)) {
      continue;
    }
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(entry);
    childrenByParent.set(parentId, siblings);
  }

  function buildNode(entry: PromptHistoryEntry): IterationTreeNode {
    const children = (childrenByParent.get(entry.id) ?? [])
      .sort((a, b) => a.timestamp - b.timestamp)
      .map(buildNode);
    return { entry, children };
  }

  const roots = entries
    .filter(entry => {
      const parentId =
        typeof entry.metadata?.parentHistoryId === 'string'
          ? entry.metadata.parentHistoryId
          : undefined;
      return !parentId || !byId.has(parentId);
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return roots.map(buildNode);
}

export function flattenIterationTree(nodes: IterationTreeNode[]): PromptHistoryEntry[] {
  const flat: PromptHistoryEntry[] = [];
  const walk = (node: IterationTreeNode) => {
    flat.push(node.entry);
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const node of nodes) {
    walk(node);
  }
  return flat;
}
