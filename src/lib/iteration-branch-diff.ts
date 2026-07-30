import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import { diffPromptWords } from './prompt-diff';
import {
  buildPromptIterationForest,
  flattenIterationTree,
  type IterationTreeNode,
} from './prompt-iteration-tree';

export type BranchDiffResult = {
  left: PromptHistoryEntry;
  right: PromptHistoryEntry;
  diff: ReturnType<typeof diffPromptWords>;
};

export function diffHistoryEntries(
  left: PromptHistoryEntry,
  right: PromptHistoryEntry
): BranchDiffResult {
  return {
    left,
    right,
    diff: diffPromptWords(left.prompt, right.prompt),
  };
}

function findInNode(node: IterationTreeNode, id: string): IterationTreeNode | null {
  if (node.entry.id === id) {
    return node;
  }
  for (const child of node.children) {
    const found = findInNode(child, id);
    if (found) {
      return found;
    }
  }
  return null;
}

export function findIterationNodeById(
  forest: IterationTreeNode[],
  id: string
): IterationTreeNode | null {
  for (const node of forest) {
    const found = findInNode(node, id);
    if (found) {
      return found;
    }
  }
  return null;
}

export function listIterationEntries(entries: PromptHistoryEntry[]): PromptHistoryEntry[] {
  return flattenIterationTree(buildPromptIterationForest(entries));
}
