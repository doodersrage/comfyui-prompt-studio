import type { PromptHistoryEntry } from '@/hooks/usePromptHistory';
import {
  buildPromptIterationForest,
  flattenIterationTree,
  type IterationTreeNode,
} from './prompt-iteration-tree';
import { downloadTextFile } from './history-export-formats';

export type IterationTreeExportNode = {
  id: string;
  parentId?: string;
  tool: string;
  model: string;
  timestamp: number;
  prompt: string;
  hints?: string;
  children: IterationTreeExportNode[];
};

function serializeNode(node: IterationTreeNode): IterationTreeExportNode {
  const parentId =
    typeof node.entry.metadata?.parentHistoryId === 'string'
      ? node.entry.metadata.parentHistoryId
      : undefined;
  return {
    id: node.entry.id,
    parentId,
    tool: node.entry.tool,
    model: node.entry.model,
    timestamp: node.entry.timestamp,
    prompt: node.entry.prompt,
    hints: node.entry.hints,
    children: node.children.map(serializeNode),
  };
}

export function exportIterationForest(entries: PromptHistoryEntry[]): IterationTreeExportNode[] {
  return buildPromptIterationForest(entries).map(serializeNode);
}

export function exportIterationForestJson(entries: PromptHistoryEntry[]): string {
  const forest = exportIterationForest(entries);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      nodeCount: flattenIterationTree(buildPromptIterationForest(entries)).length,
      forest,
    },
    null,
    2
  );
}

export function downloadIterationForestJson(
  entries: PromptHistoryEntry[],
  filename = 'iteration-tree.json'
): void {
  downloadTextFile(exportIterationForestJson(entries), filename, 'application/json;charset=utf-8');
}
