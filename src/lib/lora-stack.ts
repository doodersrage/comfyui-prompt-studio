import type { WorkflowDirectPatchCounts } from "./workflow-direct-patch";
import { loraFilenameImpliesLightning, loraNameIsLightningSlot } from "./workflow-lora-patch";

export type LoraLibraryEntry = {
  id: string;
  label: string;
  triggerPhrase: string;
  tokenValue: string;
  /** UNET/model-branch strength (0–2). Defaults to 1. */
  strengthModel?: number;
  /** CLIP-branch strength (0–2). Defaults to 1. */
  strengthClip?: number;
  /** Included in the active queue-time LoRA stack. Defaults to true. */
  enabled?: boolean;
  /** Explicit stack position; falls back to array order when omitted. */
  order?: number;
};

export type ActiveLoraStackEntry = {
  id: string;
  label: string;
  filename: string;
  strengthModel: number;
  strengthClip: number;
};

export const DEFAULT_LORA_STRENGTH = 1;
const MIN_LORA_STRENGTH = 0;
const MAX_LORA_STRENGTH = 2;

/** LoRA loader node types with a well-known, stable input schema we can safely patch/chain. */
export const STRENGTH_PATCHABLE_LORA_TYPES = new Set([
  "LoraLoader",
  "LoraLoaderModelOnly",
]);

export function clampLoraStrength(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_LORA_STRENGTH;
  }
  return Math.min(MAX_LORA_STRENGTH, Math.max(MIN_LORA_STRENGTH, value));
}

export function normalizeLoraLibraryEntry(entry: LoraLibraryEntry): LoraLibraryEntry {
  return {
    ...entry,
    strengthModel: clampLoraStrength(entry.strengthModel),
    strengthClip: clampLoraStrength(entry.strengthClip),
    enabled: entry.enabled ?? true,
  };
}

export function normalizeLoraLibrary(
  library: LoraLibraryEntry[] | undefined,
): LoraLibraryEntry[] {
  return (library ?? []).map(normalizeLoraLibraryEntry);
}

export function isLightningLibraryEntry(entry: LoraLibraryEntry): boolean {
  if (entry.id.trim().toUpperCase() === "LIGHTNING") {
    return true;
  }
  return loraFilenameImpliesLightning(entry.tokenValue ?? "");
}

/** Ordered, enabled, non-Lightning LoRA entries with concrete filenames — the "active stack". */
export function resolveActiveLoraStack(
  library: LoraLibraryEntry[] | undefined,
): ActiveLoraStackEntry[] {
  const normalized = normalizeLoraLibrary(library);
  return normalized
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (entry.enabled === false) {
        return false;
      }
      if (!entry.tokenValue?.trim()) {
        return false;
      }
      return !isLightningLibraryEntry(entry);
    })
    .sort((a, b) => {
      const orderA = a.entry.order ?? a.index;
      const orderB = b.entry.order ?? b.index;
      return orderA - orderB;
    })
    .map(({ entry }) => ({
      id: entry.id.trim(),
      label: entry.label.trim() || entry.id.trim() || "LoRA",
      filename: entry.tokenValue.trim(),
      strengthModel: clampLoraStrength(entry.strengthModel),
      strengthClip: clampLoraStrength(entry.strengthClip),
    }));
}

function formatStrength(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Minimal human-readable summary for the Settings UI / logs. */
export function describeLoraStack(stack: ActiveLoraStackEntry[]): string {
  if (stack.length === 0) {
    return "No LoRAs active.";
  }
  const parts = stack.map((entry) => {
    const strengths =
      entry.strengthModel === entry.strengthClip
        ? formatStrength(entry.strengthModel)
        : `${formatStrength(entry.strengthModel)}/${formatStrength(entry.strengthClip)}`;
    return `${entry.label} (${strengths})`;
  });
  return `${stack.length} LoRA${stack.length === 1 ? "" : "s"} active: ${parts.join(", ")}`;
}

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

function parseNumericNodeId(id: string): number | null {
  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNodeIds(a: string, b: string): number {
  const numA = parseNumericNodeId(a);
  const numB = parseNumericNodeId(b);
  if (numA != null && numB != null) {
    return numA - numB;
  }
  return a.localeCompare(b);
}

function nextWorkflowNodeId(workflow: Record<string, WorkflowNode>): string {
  let maxId = 0;
  for (const key of Object.keys(workflow)) {
    const parsed = parseNumericNodeId(key);
    if (parsed != null && parsed > maxId) {
      maxId = parsed;
    }
  }
  return String(maxId + 1);
}

function linkOutputIndex(value: unknown, nodeId: string): number | null {
  if (Array.isArray(value) && value[0] === nodeId && typeof value[1] === "number") {
    return value[1];
  }
  return null;
}

function findLoraAnchorNodeIds(workflow: Record<string, WorkflowNode>): string[] {
  const ids: string[] = [];
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!node?.inputs || !STRENGTH_PATCHABLE_LORA_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    if (!("lora_name" in node.inputs)) {
      continue;
    }
    if (loraNameIsLightningSlot(node.inputs.lora_name, {})) {
      continue;
    }
    ids.push(nodeId);
  }
  return ids.sort(compareNodeIds);
}

function applyEntryToNode(node: WorkflowNode, entry: ActiveLoraStackEntry): void {
  if (!node.inputs) {
    return;
  }
  node.inputs.lora_name = entry.filename;
  node.inputs.strength_model = entry.strengthModel;
  if (node.class_type === "LoraLoader") {
    node.inputs.strength_clip = entry.strengthClip;
  }
}

/** Rewrite links that point at `fromNodeId`'s outputs to `toNodeId`, skipping listed node ids. */
function rewireDownstreamReferences(
  workflow: Record<string, WorkflowNode>,
  fromNodeId: string,
  toNodeId: string,
  skipNodeIds: Set<string>,
): void {
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (skipNodeIds.has(nodeId) || !node?.inputs) {
      continue;
    }
    for (const [field, value] of Object.entries(node.inputs)) {
      const outputIndex = linkOutputIndex(value, fromNodeId);
      if (outputIndex != null) {
        node.inputs[field] = [toNodeId, outputIndex];
      }
    }
  }
}

export type ChainLoraStackResult = {
  workflow: Record<string, unknown>;
  patchedNodeIds: string[];
  insertedNodeIds: string[];
};

/**
 * Patch strengths onto existing LoraLoader/LoraLoaderModelOnly nodes for the first
 * entries in `stack`, then chain any remaining enabled LoRAs as new nodes after the
 * last anchor node — rewiring downstream MODEL/CLIP consumers through the new chain.
 * No-ops when the workflow has no non-Lightning LoRA loader node to anchor onto.
 */
export function chainLoraStackInWorkflow(
  workflow: Record<string, unknown>,
  stack: ActiveLoraStackEntry[],
): ChainLoraStackResult {
  if (stack.length === 0) {
    return { workflow, patchedNodeIds: [], insertedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const anchors = findLoraAnchorNodeIds(next);
  if (anchors.length === 0) {
    return { workflow: next, patchedNodeIds: [], insertedNodeIds: [] };
  }

  const patchedNodeIds: string[] = [];
  const directAssignCount = Math.min(stack.length, anchors.length);
  for (let i = 0; i < directAssignCount; i += 1) {
    const nodeId = anchors[i]!;
    applyEntryToNode(next[nodeId]!, stack[i]!);
    patchedNodeIds.push(nodeId);
  }

  const insertedNodeIds: string[] = [];
  const remaining = stack.slice(anchors.length);
  if (remaining.length > 0) {
    const lastAnchorId = anchors[anchors.length - 1]!;
    const lastAnchorNode = next[lastAnchorId]!;
    const chainSupportsClip = lastAnchorNode.class_type === "LoraLoader";
    const protectedNodeIds = new Set(anchors);

    let previousId = lastAnchorId;
    for (const entry of remaining) {
      const newNodeId = nextWorkflowNodeId(next);
      const inputs: Record<string, unknown> = {
        model: [previousId, 0],
        lora_name: entry.filename,
        strength_model: entry.strengthModel,
      };
      if (chainSupportsClip) {
        inputs.clip = [previousId, 1];
        inputs.strength_clip = entry.strengthClip;
      }
      next[newNodeId] = {
        class_type: lastAnchorNode.class_type,
        inputs,
      };

      rewireDownstreamReferences(
        next,
        previousId,
        newNodeId,
        new Set([...protectedNodeIds, newNodeId]),
      );

      protectedNodeIds.add(newNodeId);
      insertedNodeIds.push(newNodeId);
      previousId = newNodeId;
    }
  }

  return { workflow: next, patchedNodeIds, insertedNodeIds };
}

/** Convenience wrapper matching the `{ workflow, patched }` shape used by direct-patch helpers. */
export function applyLoraStackToWorkflow(
  workflow: Record<string, unknown>,
  library: LoraLibraryEntry[] | undefined,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const stack = resolveActiveLoraStack(library);
  if (stack.length === 0) {
    return { workflow, patched: {} };
  }

  const result = chainLoraStackInWorkflow(workflow, stack);
  const count = result.patchedNodeIds.length + result.insertedNodeIds.length;
  return {
    workflow: result.workflow,
    patched: count > 0 ? { loraStack: count } : {},
  };
}

const NON_LIGHTNING_LORA_PLACEHOLDER = /\{\{LORA_(?!LIGHTNING\b)[A-Z0-9_]*\}\}/;

/**
 * Warn when a workflow clearly expects a LoRA (unresolved `{{LORA_*}}` placeholder or a
 * LoraLoader/LoraLoaderModelOnly node) but the active LoRA stack has nothing to apply.
 * Pure helper — callers decide whether/where to surface it (e.g. queue prep audits).
 */
export function loraStackLintWarning(
  workflow: Record<string, unknown> | string,
  stack: ActiveLoraStackEntry[],
): string | null {
  if (stack.length > 0) {
    return null;
  }

  const hasPlaceholder = NON_LIGHTNING_LORA_PLACEHOLDER.test(
    typeof workflow === "string" ? workflow : JSON.stringify(workflow),
  );

  // Object form can distinguish Lightning-flavored loader nodes (excluded, handled by
  // the dedicated Lightning path); the string form falls back to placeholder text only.
  const hasLoraLoaderNode =
    typeof workflow === "string"
      ? false
      : findLoraAnchorNodeIds(workflow as Record<string, WorkflowNode>).length > 0;

  if (!hasPlaceholder && !hasLoraLoaderNode) {
    return null;
  }

  return "Workflow expects a LoRA but the active LoRA stack is empty — enable at least one LoRA in Settings → LoRA library.";
}
