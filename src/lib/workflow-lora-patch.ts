import type { WorkflowDirectPatchCounts } from "./workflow-direct-patch";

const LORA_LOADER_TYPES = new Set([
  "LoraLoader",
  "LoraLoaderModelOnly",
  "Power Lora Loader (rgthree)",
]);

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === "string" && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

export function isConcreteLoraFilename(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /\.safetensors$/i.test(value.trim()) &&
    !isUnresolvedWorkflowPlaceholder(value)
  );
}

const LIGHTNING_LORA_FILENAME_HINT =
  /lightning|lightx2v|(\b4[\s-]?step\b)|(\b8[\s-]?step\b)|4steps|8steps/i;

export const LIGHTNING_LORA_TOKEN = "{{LORA_LIGHTNING}}";

export function loraFilenameImpliesLightning(filename: string): boolean {
  return LIGHTNING_LORA_FILENAME_HINT.test(filename.trim());
}

export function loraNameImpliesLightning(
  loraName: unknown,
  loraFilenames: Record<string, string> = {},
): boolean {
  if (typeof loraName !== "string" || !loraName.trim()) {
    return false;
  }
  const trimmed = loraName.trim();
  // Unresolved placeholders only count once mapped to a concrete Lightning file.
  if (isUnresolvedWorkflowPlaceholder(trimmed)) {
    const mapped = loraFilenames[trimmed]?.trim();
    return Boolean(mapped && loraFilenameImpliesLightning(mapped));
  }
  return loraFilenameImpliesLightning(trimmed);
}

/** True for Lightning LoRA slots, including unresolved {{LORA_LIGHTNING}} placeholders. */
export function loraNameIsLightningSlot(
  loraName: unknown,
  loraFilenames: Record<string, string> = {},
): boolean {
  if (typeof loraName === "string") {
    const trimmed = loraName.trim();
    if (
      trimmed === LIGHTNING_LORA_TOKEN ||
      /^\{\{LORA_.*(LIGHTNING|LIGHTX2V).*\}\}$/i.test(trimmed)
    ) {
      return true;
    }
  }
  return loraNameImpliesLightning(loraName, loraFilenames);
}

export function resolveLoraLoaderFilename(
  loraName: unknown,
  loraFilenames: Record<string, string>,
): string | null {
  if (typeof loraName !== "string" || !loraName.trim()) {
    return null;
  }
  const trimmed = loraName.trim();
  if (isUnresolvedWorkflowPlaceholder(trimmed)) {
    return loraFilenames[trimmed]?.trim() ?? null;
  }
  return trimmed;
}

function shouldPatchLoraField(current: unknown, nextValue: string | undefined): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (typeof current === "string") {
    return isUnresolvedWorkflowPlaceholder(current) || current.trim() === "";
  }
  return current == null;
}

/** Patch unresolved {{LORA_*}} placeholders on LoRA loader nodes. */
export function patchLoraNodesInWorkflow(
  workflow: Record<string, unknown>,
  loraFilenames: Record<string, string>,
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  let patchedCount = 0;

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    if (!LORA_LOADER_TYPES.has(record.class_type ?? "") || !record.inputs) {
      continue;
    }

    for (const [field, value] of Object.entries(record.inputs)) {
      if (typeof value !== "string" || !isUnresolvedWorkflowPlaceholder(value)) {
        continue;
      }
      const filename = loraFilenames[value.trim()];
      if (filename && shouldPatchLoraField(value, filename)) {
        record.inputs[field] = filename;
        patchedCount += 1;
      }
    }

    if (
      "lora_name" in record.inputs &&
      typeof record.inputs.lora_name === "string" &&
      isUnresolvedWorkflowPlaceholder(record.inputs.lora_name)
    ) {
      const token = record.inputs.lora_name.trim();
      const filename = loraFilenames[token];
      if (filename && shouldPatchLoraField(record.inputs.lora_name, filename)) {
        record.inputs.lora_name = filename;
        patchedCount += 1;
      }
    }
  }

  return {
    workflow: next,
    patched: patchedCount > 0 ? { lora: patchedCount } : {},
  };
}

export function listLoraBindTokens(
  customTokens: Array<{ token: string; value: string }>,
): string[] {
  return customTokens
    .map((entry) => entry.token.trim())
    .filter((token) => token.startsWith("{{LORA_"));
}

export function buildLoraFilenameMapFromCustomTokens(
  customTokens: Array<{ token: string; value: string }> = [],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of customTokens) {
    const token = entry.token.trim();
    const value = entry.value?.trim();
    if (token.startsWith("{{LORA_") && value) {
      map[token] = value;
    }
  }
  return map;
}

function scoreLightningLoraCandidate(name: string, model?: string): number {
  const modelId = model?.trim().toLowerCase() ?? "";
  const wantsEdit = /edit/.test(modelId);
  const wants2511 = /2511/.test(modelId);
  const want4 = /lightning-4|lightning_4/.test(modelId);
  const want8 = /lightning-8|lightning_8/.test(modelId);
  const lower = name.toLowerCase();
  let score = 1;
  if (wantsEdit && /edit/.test(lower)) {
    score += 4;
  }
  if (!wantsEdit && !/edit/.test(lower)) {
    score += 3;
  }
  if (wantsEdit && !/edit/.test(lower)) {
    score -= 5;
  }
  if (!wantsEdit && /edit/.test(lower)) {
    score -= 5;
  }
  if (wants2511 && /2511/.test(lower)) {
    score += 2;
  }
  if (want4 && /(4[\s-]?step|4steps)/i.test(lower)) {
    score += 2;
  }
  if (want8 && /(8[\s-]?step|8steps)/i.test(lower)) {
    score += 2;
  }
  if (/lightx2v/.test(lower)) {
    score += 1;
  }
  return score;
}

function pickPreferredLightningLora(
  candidates: string[],
  model?: string,
): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const ranked = [...candidates]
    .map((name) => ({ name, score: scoreLightningLoraCandidate(name, model) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.name;
}

/**
 * Score Lightning LoRAs in inventory for the active model (edit vs t2i, 4 vs 8 step).
 * Single source used by pack soft-repair and queue `{{LORA_LIGHTNING}}` resolution.
 */
export function pickLightningLoraFromInventory(
  model: string | undefined,
  loras: string[],
): string | undefined {
  if (!loras.length) {
    return undefined;
  }
  const candidates = loras
    .map((name) => name.trim())
    .filter((name) => name && loraFilenameImpliesLightning(name));
  return pickPreferredLightningLora(candidates, model);
}

function inferLightningLoraFilenameFromTokens(
  customTokens: Array<{ token: string; value: string }>,
  model?: string,
): string | undefined {
  const modelId = model?.trim().toLowerCase() ?? "";
  const stepMatch =
    modelId.includes("lightning-8") || modelId.includes("lightning_8")
      ? /\b8[\s-]?step|8steps/i
      : modelId.includes("lightning-4") || modelId.includes("lightning_4")
        ? /\b4[\s-]?step|4steps/i
        : undefined;

  const fromLightningTokens: string[] = [];
  for (const entry of customTokens) {
    const token = entry.token.trim();
    const value = entry.value?.trim();
    if (!value || !token.startsWith("{{LORA_")) {
      continue;
    }
    if (/lightning|lightx2v/i.test(token) && loraFilenameImpliesLightning(value)) {
      if (!stepMatch || stepMatch.test(value)) {
        fromLightningTokens.push(value);
      }
    }
  }
  const preferredToken = pickPreferredLightningLora(fromLightningTokens, model);
  if (preferredToken) {
    return preferredToken;
  }

  const fromAny: string[] = [];
  for (const entry of customTokens) {
    const value = entry.value?.trim();
    if (!value || !loraFilenameImpliesLightning(value)) {
      continue;
    }
    if (!stepMatch || stepMatch.test(value)) {
      fromAny.push(value);
    }
  }
  return pickPreferredLightningLora(fromAny, model);
}

/** Prefer step-matched LightX2V files from ComfyUI's loras inventory. */
export function inferLightningLoraFromInventory(
  availableLoras: string[] | undefined,
  model?: string,
): string | undefined {
  return pickLightningLoraFromInventory(model, availableLoras ?? []);
}

export function lightningLoraMatchesModel(filename: string, model?: string): boolean {
  if (!loraFilenameImpliesLightning(filename)) {
    return false;
  }
  const modelId = model?.trim().toLowerCase() ?? "";
  if (!modelId) {
    return true;
  }
  const modelWantsEdit = /edit/.test(modelId);
  const loraIsEdit = /edit/.test(filename.toLowerCase());
  return modelWantsEdit === loraIsEdit;
}

/** Resolve {{LORA_LIGHTNING}} and related placeholders from custom tokens / LoRA library / inventory. */
export function buildLightningLoraFilenameMap(
  customTokens: Array<{ token: string; value: string }> = [],
  model?: string,
  availableLoras?: string[],
): Record<string, string> {
  const map = buildLoraFilenameMapFromCustomTokens(customTokens);
  const existing = map[LIGHTNING_LORA_TOKEN]?.trim();
  if (existing && lightningLoraMatchesModel(existing, model)) {
    return map;
  }

  const inferred = inferLightningLoraFilenameFromTokens(customTokens, model);
  if (inferred && lightningLoraMatchesModel(inferred, model)) {
    map[LIGHTNING_LORA_TOKEN] = inferred;
    return map;
  }

  const fromInventory = inferLightningLoraFromInventory(availableLoras, model);
  if (fromInventory) {
    map[LIGHTNING_LORA_TOKEN] = fromInventory;
    return map;
  }

  // Keep a mismatched library mapping only when nothing better is available.
  if (existing) {
    map[LIGHTNING_LORA_TOKEN] = existing;
  } else if (inferred) {
    map[LIGHTNING_LORA_TOKEN] = inferred;
  }

  return map;
}

/**
 * Rewrite concrete Lightning LoRA filenames that don't match the selected model
 * family (Edit-2511 vs T2I 2512). Wrong-family LoRAs cause worm/melt artifacts.
 */
export function alignLightningLoraFamilyInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {},
): { workflow: Record<string, unknown>; realignedNodeIds: string[] } {
  const preferred = loraFilenames[LIGHTNING_LORA_TOKEN]?.trim();
  if (!preferred || !lightningLoraMatchesModel(preferred, model)) {
    return { workflow, realignedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  const realignedNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !LORA_LOADER_TYPES.has(node.class_type ?? "")) {
      continue;
    }
    const current = node.inputs.lora_name;
    if (typeof current !== "string" || !current.trim()) {
      continue;
    }
    if (isUnresolvedWorkflowPlaceholder(current)) {
      continue;
    }
    if (!loraFilenameImpliesLightning(current)) {
      continue;
    }
    if (lightningLoraMatchesModel(current, model)) {
      continue;
    }
    node.inputs.lora_name = preferred;
    realignedNodeIds.push(nodeId);
  }

  return { workflow: next, realignedNodeIds };
}
