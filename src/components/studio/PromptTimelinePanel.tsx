"use client";

import type { IterationTreeNode } from "@/lib/prompt-iteration-tree";
import { EmptyState } from "@/components/ui/ViewState";

type PromptTimelinePanelProps = {
  nodes: IterationTreeNode[];
  onSelect?: (historyId: string) => void;
  selectedId?: string;
};

function TimelineNode({
  node,
  depth,
  onSelect,
  selectedId,
}: {
  node: IterationTreeNode;
  depth: number;
  onSelect?: (historyId: string) => void;
  selectedId?: string;
}) {
  const active = selectedId === node.entry.id;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onSelect?.(node.entry.id)}
        className={`block w-full rounded-lg border px-3 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] active:scale-[0.99] ${
          active
            ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
            : "border-zinc-800/80 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        }`}
        style={{ marginLeft: depth * 12 }}
      >
        <span className="block truncate font-medium text-zinc-200">{node.entry.tool}</span>
        <span className="block truncate text-zinc-500">{node.entry.prompt.slice(0, 72)}</span>
      </button>
      {node.children.map((child) => (
        <TimelineNode
          key={child.entry.id}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          selectedId={selectedId}
        />
      ))}
    </div>
  );
}

export default function PromptTimelinePanel({
  nodes,
  onSelect,
  selectedId,
}: PromptTimelinePanelProps) {
  if (nodes.length === 0) {
    return (
      <EmptyState
        compact
        icon="diff"
        title="No iteration branches yet"
        description="Save refined prompts to history with lineage to build a parent/child timeline here."
      />
    );
  }

  return (
    <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-3">
      {nodes.map((node) => (
        <TimelineNode key={node.entry.id} node={node} depth={0} onSelect={onSelect} selectedId={selectedId} />
      ))}
    </div>
  );
}
