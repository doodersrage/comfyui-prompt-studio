import type { WorkflowDirectPatchCounts } from "./workflow-direct-patch";

const LORA_LOADER_TYPES = new Set([
  "LoraLoader",
  "LoraLoaderModelOnly",
  "Power Lora Loader (rgthree)",
]);

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === "string" && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
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
  customTokens: Array<{ token: string; value: string }>,
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
