'use client';

import { Handle, Position, type NodeProps } from '@xyflow/react';
import { listEditableWidgets, type WorkflowRfNode } from '@/lib/workflow-react-flow';

export default function ComfyNodeCard({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowRfNode['data'];
  const widgets = listEditableWidgets(nodeData.inputs);
  return (
    <div
      className={`min-w-[200px] max-w-[260px] rounded-xl border bg-[var(--bg-base)]/90 px-3 py-2 shadow-lg backdrop-blur ${
        selected ? 'border-[var(--accent-border)]' : 'border-[var(--border-default)]/80'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-[var(--accent)]" />
      <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
        {nodeData.classType}
      </p>
      <p className="text-sm font-medium text-[var(--text-primary)]">{nodeData.title}</p>
      <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--text-muted)]">
        {widgets.slice(0, 4).map(widget => (
          <li key={widget.key} className="truncate">
            {widget.key}: {String(widget.value).slice(0, 28)}
          </li>
        ))}
      </ul>
      <Handle type="source" position={Position.Right} className="!bg-[var(--tint-success-text)]" />
    </div>
  );
}
