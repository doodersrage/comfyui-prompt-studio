import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_STEPS_TOKEN,
  type WorkflowPlaceholderTokens,
} from "./comfyui-config";
import type { WorkflowNodeMapping } from "./workflow-node-mapper";

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

export type WorkflowBindingChange = {
  nodeId: string;
  field: string;
  before: string;
  after: string;
};

export function applyWorkflowNodeBindings(
  workflowJson: string,
  mappings: WorkflowNodeMapping[],
  tokens: Pick<WorkflowPlaceholderTokens, "positive" | "negative"> &
    Partial<Pick<WorkflowPlaceholderTokens, "seed" | "steps" | "cfg">> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
    seed: DEFAULT_SEED_TOKEN,
    steps: DEFAULT_STEPS_TOKEN,
    cfg: DEFAULT_CFG_TOKEN,
  },
): { json: string; changes: WorkflowBindingChange[] } {
  let parsed: Record<string, WorkflowNode>;
  try {
    parsed = JSON.parse(workflowJson) as Record<string, WorkflowNode>;
  } catch {
    return { json: workflowJson, changes: [] };
  }

  const changes: WorkflowBindingChange[] = [];

  for (const mapping of mappings) {
    const node = parsed[mapping.nodeId];
    if (!node?.inputs) {
      continue;
    }

    const binding = mapping.suggestedBinding;
    if (binding === "positive" && "text" in node.inputs) {
      applyTextInput(node, mapping.nodeId, "text", tokens.positive, changes);
      continue;
    }
    if (binding === "negative" && "text" in node.inputs) {
      applyTextInput(node, mapping.nodeId, "text", tokens.negative, changes);
      continue;
    }
    if (binding === "seed") {
      if ("seed" in node.inputs && tokens.seed) {
        applyScalarInput(node, mapping.nodeId, "seed", tokens.seed, changes);
      }
      if ("steps" in node.inputs && tokens.steps) {
        applyScalarInput(node, mapping.nodeId, "steps", tokens.steps, changes);
      }
      if ("cfg" in node.inputs && tokens.cfg) {
        applyScalarInput(node, mapping.nodeId, "cfg", tokens.cfg, changes);
      }
    }
  }

  return { json: JSON.stringify(parsed, null, 2), changes };
}

function applyTextInput(
  node: WorkflowNode,
  nodeId: string,
  field: string,
  token: string,
  changes: WorkflowBindingChange[],
): void {
  const before = String(node.inputs?.[field] ?? "");
  if (before.includes(token)) {
    return;
  }
  node.inputs![field] = token;
  changes.push({ nodeId, field, before, after: token });
}

function applyScalarInput(
  node: WorkflowNode,
  nodeId: string,
  field: string,
  token: string,
  changes: WorkflowBindingChange[],
): void {
  const current = node.inputs?.[field];
  if (typeof current === "string" && current.includes(token)) {
    return;
  }
  if (typeof current === "number" || typeof current === "boolean") {
    const before = String(current);
    node.inputs![field] = token;
    changes.push({ nodeId, field, before, after: token });
    return;
  }
  if (current == null || current === "") {
    node.inputs![field] = token;
    changes.push({ nodeId, field, before: String(current ?? ""), after: token });
  }
}

export function summarizeBindingChanges(changes: WorkflowBindingChange[]): string {
  if (changes.length === 0) {
    return "No binding changes (placeholders already present).";
  }
  return changes
    .map((change) => `${change.nodeId}.${change.field}: ${change.before || "∅"} → ${change.after}`)
    .join("\n");
}
