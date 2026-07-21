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
  if (typeof loraName === "string") {
    const trimmed = loraName.trim();
    if (trimmed === LIGHTNING_LORA_TOKEN || /^\{\{LORA_.*(LIGHTNING|LIGHTX2V)/i.test(trimmed)) {
      return true;
    }
  }
  const filename = resolveLoraLoaderFilename(loraName, loraFilenames);
  return Boolean(filename && loraFilenameImpliesLightning(filename));
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

  for (const entry of customTokens) {
    const token = entry.token.trim();
    const value = entry.value?.trim();
    if (!value || !token.startsWith("{{LORA_")) {
      continue;
    }
    if (/lightning|lightx2v/i.test(token) && loraFilenameImpliesLightning(value)) {
      if (!stepMatch || stepMatch.test(value)) {
        return value;
      }
    }
  }

  for (const entry of customTokens) {
    const value = entry.value?.trim();
    if (!value || !loraFilenameImpliesLightning(value)) {
      continue;
    }
    if (!stepMatch || stepMatch.test(value)) {
      return value;
    }
  }

  return undefined;
}

/** Resolve {{LORA_LIGHTNING}} and related placeholders from custom tokens / LoRA library. */
export function buildLightningLoraFilenameMap(
  customTokens: Array<{ token: string; value: string }> = [],
  model?: string,
): Record<string, string> {
  const map = buildLoraFilenameMapFromCustomTokens(customTokens);
  if (map[LIGHTNING_LORA_TOKEN]?.trim()) {
    return map;
  }

  const inferred = inferLightningLoraFilenameFromTokens(customTokens, model);
  if (inferred) {
    map[LIGHTNING_LORA_TOKEN] = inferred;
  }

  return map;
}
