import type { WorkflowDirectPatchCounts } from "./workflow-direct-patch";
import {
  isLoraLoaderClassType,
  loraFilenameImpliesLightning,
  loraNameIsLightningSlot,
} from "./workflow-lora-patch";

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
  /**
   * When not enabled, previously loaded if the prompt contained `triggerPhrase`.
   * Ignored — use the tool sidebar LoRA stack (or Settings Enabled) instead.
   * @deprecated
   */
  autoFromPrompt?: boolean;
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

function isStrengthPatchableLoraType(classType: string | undefined): boolean {
  if (!classType) {
    return false;
  }
  if (STRENGTH_PATCHABLE_LORA_TYPES.has(classType)) {
    return true;
  }
  // ComfyUI-Custom-Scripts: LoraLoader|pysssss
  return isLoraLoaderClassType(classType) && classType !== "Power Lora Loader (rgthree)";
}

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
    autoFromPrompt: entry.autoFromPrompt === true,
  };
}

/** Stem of a LoRA filename without extension / folder prefix. */
export function loraFilenameStem(filename: string): string {
  const base = filename.trim().split(/[/\\]/).pop() ?? filename.trim();
  return base.replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
}

/** Suggest a stable {{LORA_<id>}} id from a ComfyUI LoRA filename. */
export function suggestLoraIdFromFilename(filename: string): string {
  const stem = loraFilenameStem(filename);
  if (!stem) {
    return `lora-${Date.now().toString(36)}`;
  }
  if (loraFilenameImpliesLightning(filename)) {
    return "LIGHTNING";
  }
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `lora-${Date.now().toString(36)}`;
}

/** Suggest a human label from a ComfyUI LoRA filename. */
export function suggestLoraLabelFromFilename(filename: string): string {
  const stem = loraFilenameStem(filename);
  if (!stem) {
    return "";
  }
  return stem
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ensure the suggested id is unique within an existing library. */
export function uniqueLoraLibraryId(
  preferredId: string,
  existingIds: Iterable<string>,
): string {
  const taken = new Set(
    [...existingIds].map((id) => id.trim().toLowerCase()).filter(Boolean),
  );
  const base = preferredId.trim() || `lora-${Date.now().toString(36)}`;
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`.toLowerCase())) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function createLoraLibraryEntryFromFilename(
  filename: string,
  existing?: LoraLibraryEntry[],
): LoraLibraryEntry {
  const tokenValue = filename.trim();
  const preferredId = suggestLoraIdFromFilename(tokenValue);
  const id = uniqueLoraLibraryId(
    preferredId,
    (existing ?? []).map((entry) => entry.id),
  );
  return {
    id,
    label: suggestLoraLabelFromFilename(tokenValue),
    triggerPhrase: "",
    tokenValue,
    strengthModel: 1,
    strengthClip: 1,
    enabled: false,
    autoFromPrompt: false,
  };
}

export function createEmptyLoraLibraryEntry(): LoraLibraryEntry {
  return {
    id: `lora-${Date.now().toString(36)}`,
    label: "",
    triggerPhrase: "",
    tokenValue: "",
    strengthModel: 1,
    strengthClip: 1,
    enabled: false,
    autoFromPrompt: false,
  };
}

/** Case-insensitive substring match (legacy helper; keyword activation removed). */
export function promptContainsLoraTrigger(
  prompt: string | undefined,
  triggerPhrase: string | undefined,
): boolean {
  const trigger = triggerPhrase?.trim() ?? "";
  if (!trigger) {
    return false;
  }
  const haystack = prompt?.trim() ?? "";
  if (!haystack) {
    return false;
  }
  return haystack.toLowerCase().includes(trigger.toLowerCase());
}

function loraEntryActiveForPrompt(entry: LoraLibraryEntry): boolean {
  return entry.enabled !== false;
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

/**
 * Session override for which catalog LoRAs are active at queue time.
 * `undefined` → follow Settings `enabled` flags.
 * `string[]` → only these ids are enabled (explicit picks).
 */
export function applySessionLoraSelection(
  library: LoraLibraryEntry[] | undefined,
  sessionActiveLoraIds: string[] | undefined,
): LoraLibraryEntry[] {
  const normalized = normalizeLoraLibrary(library);
  if (sessionActiveLoraIds === undefined) {
    return normalized;
  }
  const active = new Set(
    sessionActiveLoraIds.map((id) => id.trim()).filter(Boolean),
  );
  return normalized.map((entry) => {
    if (isLightningLibraryEntry(entry)) {
      return entry;
    }
    return {
      ...entry,
      enabled: active.has(entry.id),
      autoFromPrompt: false,
    };
  });
}

/** Non-Lightning catalog entries shown in the session picker. */
export function listSelectableLoraLibraryEntries(
  library: LoraLibraryEntry[] | undefined,
): LoraLibraryEntry[] {
  return normalizeLoraLibrary(library).filter(
    (entry) => entry.tokenValue?.trim() && !isLightningLibraryEntry(entry),
  );
}

/** Effective selected ids for UI (session override or Settings enabled flags). */
export function resolveSessionActiveLoraIds(
  library: LoraLibraryEntry[] | undefined,
  sessionActiveLoraIds: string[] | undefined,
): string[] {
  const selectable = listSelectableLoraLibraryEntries(library);
  if (sessionActiveLoraIds !== undefined) {
    const allowed = new Set(selectable.map((entry) => entry.id));
    return sessionActiveLoraIds
      .map((id) => id.trim())
      .filter((id) => allowed.has(id));
  }
  return selectable
    .filter((entry) => entry.enabled !== false)
    .map((entry) => entry.id);
}

export type ResolveActiveLoraStackOptions = {
  /** @deprecated Keyword auto-activation removed; kept for call-site compat. */
  prompt?: string;
};

/** Ordered active non-Lightning LoRA entries with concrete filenames — the "active stack". */
export function resolveActiveLoraStack(
  library: LoraLibraryEntry[] | undefined,
  _options?: ResolveActiveLoraStackOptions,
): ActiveLoraStackEntry[] {
  const normalized = normalizeLoraLibrary(library);
  return normalized
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      if (!loraEntryActiveForPrompt(entry)) {
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
    if (!node?.inputs || !isStrengthPatchableLoraType(node.class_type)) {
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
  const baseClass = (node.class_type ?? "").split("|")[0]?.trim() ?? "";
  if (baseClass === "LoraLoader") {
    node.inputs.strength_clip = entry.strengthClip;
  }
}

function loraClassSupportsClip(classType: string | undefined): boolean {
  const baseClass = (classType ?? "").split("|")[0]?.trim() ?? "";
  return baseClass === "LoraLoader";
}

function linkedModelNodeId(value: unknown): string | null {
  if (Array.isArray(value) && (typeof value[0] === "string" || typeof value[0] === "number")) {
    return String(value[0]);
  }
  return null;
}

/** Sampler-nearest active Lightning loader — used to chain style LoRAs when no other anchors exist. */
function findActiveLightningLoaderId(
  workflow: Record<string, WorkflowNode>,
): string | null {
  const samplerTypes = new Set([
    "KSampler",
    "KSamplerAdvanced",
    "SamplerCustom",
    "SamplerCustomAdvanced",
    "ModelSamplingAuraFlow",
  ]);
  let start: string | null = null;
  for (const node of Object.values(workflow)) {
    if (!samplerTypes.has(node?.class_type ?? "")) {
      continue;
    }
    start = linkedModelNodeId(node?.inputs?.model);
    if (start) {
      break;
    }
  }
  if (!start) {
    return null;
  }
  const seen = new Set<string>();
  let cursor: string | null = start;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const node = workflow[cursor];
    if (!node?.inputs) {
      break;
    }
    const strength = node.inputs.strength_model;
    const active =
      typeof strength !== "number" || !Number.isFinite(strength) || strength > 0;
    if (
      active &&
      isStrengthPatchableLoraType(node.class_type) &&
      loraNameIsLightningSlot(node.inputs.lora_name, {})
    ) {
      return cursor;
    }
    cursor = linkedModelNodeId(node.inputs.model);
  }
  return null;
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

function neutralizeLoraNodeStrengths(node: WorkflowNode): void {
  if (!node.inputs) {
    return;
  }
  if ("strength_model" in node.inputs) {
    node.inputs.strength_model = 0;
  }
  if ("strength_clip" in node.inputs) {
    node.inputs.strength_clip = 0;
  }
  if ("strength" in node.inputs) {
    node.inputs.strength = 0;
  }
}

/**
 * Patch strengths onto existing LoraLoader/LoraLoaderModelOnly nodes for the first
 * entries in `stack`, then chain any remaining enabled LoRAs as new nodes after the
 * last anchor node — rewiring downstream MODEL/CLIP consumers through the new chain.
 * Empty stack (or leftover anchors beyond the stack) get strength 0 so baked-in /
 * previously resolved LoRAs cannot keep firing after the sidebar Clear / deselection.
 * On Lightning graphs with no style anchors, chains selected LoRAs after the active
 * Lightning loader (before AuraFlow / sampler).
 */
export function chainLoraStackInWorkflow(
  workflow: Record<string, unknown>,
  stack: ActiveLoraStackEntry[],
): ChainLoraStackResult {
  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const anchors = findLoraAnchorNodeIds(next);

  if (anchors.length === 0) {
    if (stack.length === 0) {
      return { workflow: next, patchedNodeIds: [], insertedNodeIds: [] };
    }
    const lightningId = findActiveLightningLoaderId(next);
    if (!lightningId) {
      return { workflow: next, patchedNodeIds: [], insertedNodeIds: [] };
    }
    const insertedNodeIds: string[] = [];
    const protectedNodeIds = new Set<string>([lightningId]);
    let previousId = lightningId;
    for (const entry of stack) {
      const newNodeId = nextWorkflowNodeId(next);
      next[newNodeId] = {
        class_type: "LoraLoaderModelOnly",
        inputs: {
          model: [previousId, 0],
          lora_name: entry.filename,
          strength_model: entry.strengthModel,
        },
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
    return { workflow: next, patchedNodeIds: [], insertedNodeIds };
  }

  const patchedNodeIds: string[] = [];
  if (stack.length === 0) {
    for (const nodeId of anchors) {
      neutralizeLoraNodeStrengths(next[nodeId]!);
      patchedNodeIds.push(nodeId);
    }
    return { workflow: next, patchedNodeIds, insertedNodeIds: [] };
  }

  const directAssignCount = Math.min(stack.length, anchors.length);
  for (let i = 0; i < directAssignCount; i += 1) {
    const nodeId = anchors[i]!;
    applyEntryToNode(next[nodeId]!, stack[i]!);
    patchedNodeIds.push(nodeId);
  }
  for (let i = directAssignCount; i < anchors.length; i += 1) {
    const nodeId = anchors[i]!;
    neutralizeLoraNodeStrengths(next[nodeId]!);
    patchedNodeIds.push(nodeId);
  }

  const insertedNodeIds: string[] = [];
  const remaining = stack.slice(anchors.length);
  if (remaining.length > 0) {
    const lastAnchorId = anchors[anchors.length - 1]!;
    const lastAnchorNode = next[lastAnchorId]!;
    const chainSupportsClip = loraClassSupportsClip(lastAnchorNode.class_type);
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
  options?: ResolveActiveLoraStackOptions,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const stack = resolveActiveLoraStack(library, options);
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
