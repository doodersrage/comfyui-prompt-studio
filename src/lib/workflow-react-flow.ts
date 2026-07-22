/**
 * Convert Comfy API-format workflow JSON ↔ React Flow graph for the editor.
 */

export type ComfyApiNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
  _meta?: { title?: string };
};

export type WorkflowEditorNodeData = {
  classType: string;
  title: string;
  inputs: Record<string, unknown>;
  comfyId: string;
};

export type WorkflowRfNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: WorkflowEditorNodeData;
};

export type WorkflowRfEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

function isLink(value: unknown): value is [string, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "string" &&
    typeof value[1] === "number"
  );
}

/** Layout nodes in a simple grid from API workflow. */
export function comfyApiWorkflowToReactFlow(
  workflow: Record<string, unknown>,
): { nodes: WorkflowRfNode[]; edges: WorkflowRfEdge[] } {
  const entries = Object.entries(workflow).filter(
    ([, node]) => node && typeof node === "object" && "class_type" in (node as object),
  );
  const nodes: WorkflowRfNode[] = [];
  const edges: WorkflowRfEdge[] = [];
  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)));

  entries.forEach(([id, raw], index) => {
    const node = raw as ComfyApiNode;
    const col = index % cols;
    const row = Math.floor(index / cols);
    nodes.push({
      id,
      type: "comfy",
      position: { x: col * 280, y: row * 160 },
      data: {
        classType: node.class_type ?? "Unknown",
        title: node._meta?.title ?? node.class_type ?? id,
        inputs: { ...(node.inputs ?? {}) },
        comfyId: id,
      },
    });

    for (const [key, value] of Object.entries(node.inputs ?? {})) {
      if (!isLink(value)) {
        continue;
      }
      const [sourceId, sourceSlot] = value;
      edges.push({
        id: `e-${sourceId}-${sourceSlot}-${id}-${key}`,
        source: sourceId,
        target: id,
        sourceHandle: `out-${sourceSlot}`,
        targetHandle: `in-${key}`,
      });
    }
  });

  return { nodes, edges };
}

/** Rebuild API workflow from RF nodes/edges (widget values + rewired links). */
export function reactFlowToComfyApiWorkflow(
  nodes: WorkflowRfNode[],
  edges: WorkflowRfEdge[],
): Record<string, unknown> {
  const workflow: Record<string, ComfyApiNode> = {};

  for (const node of nodes) {
    const inputs: Record<string, unknown> = { ...node.data.inputs };
    // Clear prior links; re-apply from edges.
    for (const [key, value] of Object.entries(inputs)) {
      if (isLink(value)) {
        delete inputs[key];
      }
    }
    workflow[node.id] = {
      class_type: node.data.classType,
      inputs,
      _meta: { title: node.data.title },
    };
  }

  for (const edge of edges) {
    const target = workflow[edge.target];
    if (!target?.inputs) {
      continue;
    }
    const handle = edge.targetHandle?.replace(/^in-/, "") ?? "";
    const sourceSlot = Number(edge.sourceHandle?.replace(/^out-/, "") ?? 0);
    if (!handle) {
      continue;
    }
    target.inputs[handle] = [edge.source, Number.isFinite(sourceSlot) ? sourceSlot : 0];
  }

  return workflow as Record<string, unknown>;
}

export function updateWorkflowNodeWidget(
  nodes: WorkflowRfNode[],
  nodeId: string,
  key: string,
  value: string | number | boolean,
): WorkflowRfNode[] {
  return nodes.map((node) => {
    if (node.id !== nodeId) {
      return node;
    }
    return {
      ...node,
      data: {
        ...node.data,
        inputs: {
          ...node.data.inputs,
          [key]: value,
        },
      },
    };
  });
}

export function listEditableWidgets(
  inputs: Record<string, unknown>,
): Array<{ key: string; value: string | number | boolean }> {
  const widgets: Array<{ key: string; value: string | number | boolean }> = [];
  for (const [key, value] of Object.entries(inputs)) {
    if (isLink(value)) {
      continue;
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      widgets.push({ key, value });
    }
  }
  return widgets;
}
