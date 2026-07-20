export const DEFAULT_POSITIVE_TOKEN = "{{POSITIVE}}";
export const DEFAULT_NEGATIVE_TOKEN = "{{NEGATIVE}}";
export const DEFAULT_SEED_TOKEN = "{{SEED}}";
export const DEFAULT_WIDTH_TOKEN = "{{WIDTH}}";
export const DEFAULT_HEIGHT_TOKEN = "{{HEIGHT}}";
export const DEFAULT_CFG_TOKEN = "{{CFG}}";
export const DEFAULT_STEPS_TOKEN = "{{STEPS}}";

export type WorkflowParamValues = {
  seed?: string | number;
  width?: string | number;
  height?: string | number;
  cfg?: string | number;
  steps?: string | number;
};

export type CustomWorkflowToken = {
  token: string;
  value: string;
};

export type ComfyUiRuntimeConfig = {
  apiUrl?: string;
  workflowJson?: string;
  /** Server-side workflow file path from COMFYUI_WORKFLOW_DIR / COMFYUI_WORKFLOW_PATHS. */
  workflowFileId?: string;
  positiveToken?: string;
  negativeToken?: string;
  queueParams?: WorkflowParamValues;
  customTokens?: CustomWorkflowToken[];
};

export type WorkflowPlaceholderTokens = {
  positive: string;
  negative: string;
  seed: string;
  width: string;
  height: string;
  cfg: string;
  steps: string;
};

export type ResolvedComfyUiConfig = {
  apiUrl: string;
  workflow: Record<string, unknown> | null;
  placeholderTokens: WorkflowPlaceholderTokens;
  legacyPositiveNodeId?: string;
  legacyNegativeNodeId?: string;
  workflowSource: "client" | "env" | "none";
};

export type WorkflowInjectionResult = {
  workflow: Record<string, unknown>;
  positiveReplacements: number;
  negativeReplacements: number;
  paramReplacements: Partial<Record<keyof WorkflowParamValues, number>>;
  customReplacements?: Record<string, number>;
};

export function resolvePlaceholderTokens(
  runtime?: ComfyUiRuntimeConfig,
): WorkflowPlaceholderTokens {
  return {
    positive:
      runtime?.positiveToken?.trim() ||
      process.env.COMFYUI_POSITIVE_TOKEN?.trim() ||
      DEFAULT_POSITIVE_TOKEN,
    negative:
      runtime?.negativeToken?.trim() ||
      process.env.COMFYUI_NEGATIVE_TOKEN?.trim() ||
      DEFAULT_NEGATIVE_TOKEN,
    seed:
      process.env.COMFYUI_SEED_TOKEN?.trim() || DEFAULT_SEED_TOKEN,
    width:
      process.env.COMFYUI_WIDTH_TOKEN?.trim() || DEFAULT_WIDTH_TOKEN,
    height:
      process.env.COMFYUI_HEIGHT_TOKEN?.trim() || DEFAULT_HEIGHT_TOKEN,
    cfg: process.env.COMFYUI_CFG_TOKEN?.trim() || DEFAULT_CFG_TOKEN,
    steps:
      process.env.COMFYUI_STEPS_TOKEN?.trim() || DEFAULT_STEPS_TOKEN,
  };
}

export function resolveQueueParams(
  runtime?: ComfyUiRuntimeConfig,
  override?: WorkflowParamValues,
): Required<WorkflowParamValues> {
  const merged = {
    ...(runtime?.queueParams ?? {}),
    ...(override ?? {}),
  };

  return {
    seed:
      merged.seed?.toString().trim() ||
      String(Math.floor(Math.random() * 2 ** 32)),
    width: merged.width?.toString().trim() || "1024",
    height: merged.height?.toString().trim() || "1024",
    cfg: merged.cfg?.toString().trim() || "7",
    steps: merged.steps?.toString().trim() || "20",
  };
}

export function parseWorkflowJson(
  raw?: string,
): Record<string, unknown> | null {
  if (!raw?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw.trim()) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function listWorkflowNodeIds(workflow: Record<string, unknown>): string[] {
  return Object.keys(workflow)
    .filter((key) => /^\d+$/.test(key))
    .sort((left, right) => Number(left) - Number(right));
}

export function countPlaceholders(raw: string, token: string): number {
  if (!token || !raw) {
    return 0;
  }

  let count = 0;
  let index = raw.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = raw.indexOf(token, index + token.length);
  }
  return count;
}

export function detectWorkflowPlaceholders(
  raw: string,
  tokens: Pick<WorkflowPlaceholderTokens, "positive" | "negative"> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
  },
): {
  positive: number;
  negative: number;
  seed: number;
  width: number;
  height: number;
  cfg: number;
  steps: number;
} {
  return {
    positive: countPlaceholders(raw, tokens.positive),
    negative: countPlaceholders(raw, tokens.negative),
    seed: countPlaceholders(raw, DEFAULT_SEED_TOKEN),
    width: countPlaceholders(raw, DEFAULT_WIDTH_TOKEN),
    height: countPlaceholders(raw, DEFAULT_HEIGHT_TOKEN),
    cfg: countPlaceholders(raw, DEFAULT_CFG_TOKEN),
    steps: countPlaceholders(raw, DEFAULT_STEPS_TOKEN),
  };
}

export function normalizeCustomWorkflowTokens(
  tokens?: CustomWorkflowToken[],
): CustomWorkflowToken[] {
  if (!tokens?.length) {
    return [];
  }

  return tokens
    .map((entry) => ({
      token: entry.token?.trim() ?? "",
      value: entry.value?.trim() ?? "",
    }))
    .filter((entry) => entry.token.length > 0 && entry.value.length > 0);
}

export function resolveCustomWorkflowTokens(
  runtime?: ComfyUiRuntimeConfig,
): CustomWorkflowToken[] {
  return normalizeCustomWorkflowTokens(runtime?.customTokens);
}

export function detectCustomWorkflowPlaceholders(
  raw: string,
  customTokens: CustomWorkflowToken[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of customTokens) {
    const count = countPlaceholders(raw, entry.token);
    if (count > 0) {
      counts[entry.token] = count;
    }
  }
  return counts;
}

function replaceTokenInValue(
  value: unknown,
  token: string,
  replacement: string,
): [unknown, number] {
  if (typeof value === "string") {
    if (!value.includes(token)) {
      return [value, 0];
    }
    return [value.split(token).join(replacement), countPlaceholders(value, token)];
  }

  if (Array.isArray(value)) {
    let total = 0;
    const next = value.map((entry) => {
      const [replaced, count] = replaceTokenInValue(entry, token, replacement);
      total += count;
      return replaced;
    });
    return [next, total];
  }

  if (value && typeof value === "object") {
    let total = 0;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const [replaced, count] = replaceTokenInValue(entry, token, replacement);
      next[key] = replaced;
      total += count;
    }
    return [next, total];
  }

  return [value, 0];
}

function injectParamToken(
  workflow: Record<string, unknown>,
  token: string,
  value: string,
): [Record<string, unknown>, number] {
  const [next, count] = replaceTokenInValue(workflow, token, value);
  return [next as Record<string, unknown>, count];
}

export function injectWorkflowPlaceholders(
  workflow: Record<string, unknown>,
  input: {
    positive: string;
    negative?: string;
    params?: WorkflowParamValues;
    customTokens?: CustomWorkflowToken[];
  },
  tokens: WorkflowPlaceholderTokens,
): WorkflowInjectionResult {
  let current = structuredClone(workflow);
  const paramReplacements: Partial<Record<keyof WorkflowParamValues, number>> =
    {};
  const customReplacements: Record<string, number> = {};

  const [withPositive, positiveReplacements] = replaceTokenInValue(
    current,
    tokens.positive,
    input.positive,
  );
  current = withPositive as Record<string, unknown>;

  let negativeReplacements = 0;
  if (input.negative?.trim()) {
    const [withNegative, count] = replaceTokenInValue(
      current,
      tokens.negative,
      input.negative.trim(),
    );
    current = withNegative as Record<string, unknown>;
    negativeReplacements = count;
  }

  if (input.params) {
    const paramEntries: Array<[keyof WorkflowParamValues, string, string]> = [
      ["seed", tokens.seed, input.params.seed?.toString() ?? ""],
      ["width", tokens.width, input.params.width?.toString() ?? ""],
      ["height", tokens.height, input.params.height?.toString() ?? ""],
      ["cfg", tokens.cfg, input.params.cfg?.toString() ?? ""],
      ["steps", tokens.steps, input.params.steps?.toString() ?? ""],
    ];

    for (const [key, token, value] of paramEntries) {
      if (!value) {
        continue;
      }
      const [next, count] = injectParamToken(current, token, value);
      current = next;
      if (count > 0) {
        paramReplacements[key] = count;
      }
    }
  }

  for (const entry of normalizeCustomWorkflowTokens(input.customTokens)) {
    const [next, count] = injectParamToken(current, entry.token, entry.value);
    current = next;
    if (count > 0) {
      customReplacements[entry.token] = count;
    }
  }

  return {
    workflow: current,
    positiveReplacements,
    negativeReplacements,
    paramReplacements,
    customReplacements:
      Object.keys(customReplacements).length > 0 ? customReplacements : undefined,
  };
}

function isSamplerLikeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const lower = classType.toLowerCase();
  if (lower.includes("ksampler") || lower.includes("samplercustom")) {
    return true;
  }
  return "seed" in inputs && ("steps" in inputs || "cfg" in inputs);
}

export function patchSamplerParamsInWorkflow(
  workflow: Record<string, unknown>,
  params: WorkflowParamValues,
): {
  workflow: Record<string, unknown>;
  patched: Partial<Record<keyof WorkflowParamValues, number>>;
} {
  const next = structuredClone(workflow);
  const patched: Partial<Record<keyof WorkflowParamValues, number>> = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (!isSamplerLikeNode(record.class_type ?? "", inputs)) {
      continue;
    }

    if (params.seed != null && params.seed.toString().trim() !== "" && "seed" in inputs) {
      inputs.seed = Number(params.seed);
      patched.seed = (patched.seed ?? 0) + 1;
    }
    if (params.steps != null && params.steps.toString().trim() !== "" && "steps" in inputs) {
      inputs.steps = Number(params.steps);
      patched.steps = (patched.steps ?? 0) + 1;
    }
    if (params.cfg != null && params.cfg.toString().trim() !== "" && "cfg" in inputs) {
      inputs.cfg = Number(params.cfg);
      patched.cfg = (patched.cfg ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

const ALTERNATE_POSITIVE_TOKENS = ["{{PROMPT}}", "{{prompt}}", "{{PROMPT_POS}}"];
const ALTERNATE_NEGATIVE_TOKENS = ["{{NEG_PROMPT}}", "{{neg_prompt}}", "{{NEGATIVE_PROMPT}}"];

function setWorkflowNodeText(
  workflow: Record<string, unknown>,
  nodeId: string,
  text: string,
): boolean {
  const node = workflow[nodeId];
  if (!node || typeof node !== "object") {
    return false;
  }

  const record = node as { inputs?: Record<string, unknown> };
  if (!record.inputs || !("text" in record.inputs)) {
    return false;
  }

  record.inputs = { ...record.inputs, text };
  return true;
}

function classifyClipPromptBinding(
  classType: string,
  title: string,
): "positive" | "negative" | "unknown" {
  const classLower = classType.toLowerCase();
  if (!classLower.includes("cliptextencode") && !classLower.includes("textencode")) {
    return "unknown";
  }

  const titleLower = title.toLowerCase();
  if (titleLower.includes("negative") || titleLower.includes(" neg")) {
    return "negative";
  }
  if (
    titleLower.includes("positive") ||
    titleLower.includes(" pos") ||
    titleLower.includes("prompt")
  ) {
    return "positive";
  }

  return "positive";
}

export function patchClipPromptNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: { positive: string; negative?: string },
): {
  workflow: Record<string, unknown>;
  positivePatched: number;
  negativePatched: number;
} {
  const next = structuredClone(workflow);
  let positivePatched = 0;
  let negativePatched = 0;

  type ClipCandidate = {
    nodeId: string;
    binding: "positive" | "negative" | "unknown";
  };

  const candidates: ClipCandidate[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const record = node as {
      class_type?: string;
      _meta?: { title?: string };
      inputs?: Record<string, unknown>;
    };
    if (!record.inputs || !("text" in record.inputs)) {
      continue;
    }
    const binding = classifyClipPromptBinding(
      record.class_type ?? "",
      record._meta?.title ?? "",
    );
    if (binding === "unknown") {
      continue;
    }
    candidates.push({ nodeId, binding });
  }

  for (const candidate of candidates) {
    if (candidate.binding === "positive" && positivePatched === 0) {
      if (setWorkflowNodeText(next, candidate.nodeId, input.positive)) {
        positivePatched += 1;
      }
      continue;
    }
    if (
      candidate.binding === "negative" &&
      negativePatched === 0 &&
      input.negative?.trim()
    ) {
      if (setWorkflowNodeText(next, candidate.nodeId, input.negative.trim())) {
        negativePatched += 1;
      }
    }
  }

  if (positivePatched === 0) {
    for (const candidate of candidates) {
      if (candidate.binding !== "negative") {
        if (setWorkflowNodeText(next, candidate.nodeId, input.positive)) {
          positivePatched += 1;
          break;
        }
      }
    }
  }

  return { workflow: next, positivePatched, negativePatched };
}

function tryAlternatePromptTokens(
  workflow: Record<string, unknown>,
  input: { positive: string; negative?: string },
  tokens: WorkflowPlaceholderTokens,
  current: WorkflowInjectionResult,
): WorkflowInjectionResult {
  let result = current;

  if (result.positiveReplacements === 0) {
    for (const alt of ALTERNATE_POSITIVE_TOKENS) {
      if (alt === tokens.positive) {
        continue;
      }
      const [withAlt, count] = replaceTokenInValue(result.workflow, alt, input.positive);
      if (count > 0) {
        result = { ...result, workflow: withAlt as Record<string, unknown>, positiveReplacements: count };
        break;
      }
    }
  }

  if (result.negativeReplacements === 0 && input.negative?.trim()) {
    for (const alt of ALTERNATE_NEGATIVE_TOKENS) {
      if (alt === tokens.negative) {
        continue;
      }
      const [withAlt, count] = replaceTokenInValue(
        result.workflow,
        alt,
        input.negative.trim(),
      );
      if (count > 0) {
        result = {
          ...result,
          workflow: withAlt as Record<string, unknown>,
          negativeReplacements: count,
        };
        break;
      }
    }
  }

  return result;
}

export function injectPromptsWithFallbacks(
  workflow: Record<string, unknown>,
  input: {
    positive: string;
    negative?: string;
    params?: WorkflowParamValues;
    customTokens?: CustomWorkflowToken[];
  },
  tokens: WorkflowPlaceholderTokens,
  options?: {
    legacyPositiveNodeId?: string;
    legacyNegativeNodeId?: string;
  },
): WorkflowInjectionResult {
  let injected = injectWorkflowPlaceholders(workflow, input, tokens);
  injected = tryAlternatePromptTokens(injected.workflow, input, tokens, injected);

  const samplerPatch = patchSamplerParamsInWorkflow(
    injected.workflow,
    input.params ?? {},
  );
  injected = {
    ...injected,
    workflow: samplerPatch.workflow,
    paramReplacements: {
      ...injected.paramReplacements,
      ...Object.fromEntries(
        Object.entries(samplerPatch.patched).filter(([, count]) => (count ?? 0) > 0),
      ),
    },
  };

  if (
    injected.positiveReplacements === 0 &&
    options?.legacyPositiveNodeId &&
    setWorkflowNodeText(injected.workflow, options.legacyPositiveNodeId, input.positive)
  ) {
    injected = { ...injected, positiveReplacements: 1 };
  }

  if (
    injected.negativeReplacements === 0 &&
    input.negative?.trim() &&
    options?.legacyNegativeNodeId &&
    setWorkflowNodeText(
      injected.workflow,
      options.legacyNegativeNodeId,
      input.negative.trim(),
    )
  ) {
    injected = { ...injected, negativeReplacements: 1 };
  }

  if (
    injected.positiveReplacements === 0 ||
    (input.negative?.trim() && injected.negativeReplacements === 0)
  ) {
    const clipPatch = patchClipPromptNodesInWorkflow(injected.workflow, {
      positive: input.positive,
      negative: input.negative,
    });
    injected = {
      ...injected,
      workflow: clipPatch.workflow,
      positiveReplacements:
        injected.positiveReplacements > 0
          ? injected.positiveReplacements
          : clipPatch.positivePatched,
      negativeReplacements:
        injected.negativeReplacements > 0
          ? injected.negativeReplacements
          : clipPatch.negativePatched,
    };
  }

  return injected;
}

export function validateWorkflowJson(
  raw: string,
  tokens: Pick<WorkflowPlaceholderTokens, "positive" | "negative"> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
  },
): {
  ok: boolean;
  error?: string;
  nodeIds?: string[];
  placeholders?: ReturnType<typeof detectWorkflowPlaceholders>;
} {
  const workflow = parseWorkflowJson(raw);
  if (!workflow) {
    return { ok: false, error: "Workflow must be a JSON object." };
  }

  const nodeIds = listWorkflowNodeIds(workflow);
  if (nodeIds.length === 0) {
    return {
      ok: false,
      error: "No numeric node IDs found (expected ComfyUI API format).",
    };
  }

  const placeholders = detectWorkflowPlaceholders(raw, tokens);
  if (placeholders.positive === 0) {
    return {
      ok: false,
      error: `Workflow must include at least one ${tokens.positive} placeholder.`,
      nodeIds,
      placeholders,
    };
  }

  return { ok: true, nodeIds, placeholders };
}

export function stripEmptyComfyUiRuntime(
  runtime?: ComfyUiRuntimeConfig,
): ComfyUiRuntimeConfig | undefined {
  if (!runtime) {
    return undefined;
  }

  const cleaned: ComfyUiRuntimeConfig = {
    apiUrl: runtime.apiUrl?.trim() || undefined,
    workflowJson: runtime.workflowJson?.trim() || undefined,
    workflowFileId: runtime.workflowFileId?.trim() || undefined,
    positiveToken: runtime.positiveToken?.trim() || undefined,
    negativeToken: runtime.negativeToken?.trim() || undefined,
    queueParams: runtime.queueParams,
    customTokens: normalizeCustomWorkflowTokens(runtime.customTokens),
  };

  if (cleaned.queueParams) {
    const params = cleaned.queueParams;
    const hasParams = Boolean(
      params.seed?.toString().trim() ||
        params.width?.toString().trim() ||
        params.height?.toString().trim() ||
        params.cfg?.toString().trim() ||
        params.steps?.toString().trim(),
    );
    if (!hasParams) {
      cleaned.queueParams = undefined;
    }
  }

  const result: ComfyUiRuntimeConfig = {};
  if (cleaned.apiUrl) result.apiUrl = cleaned.apiUrl;
  if (cleaned.workflowJson) result.workflowJson = cleaned.workflowJson;
  if (cleaned.workflowFileId) result.workflowFileId = cleaned.workflowFileId;
  if (cleaned.positiveToken) result.positiveToken = cleaned.positiveToken;
  if (cleaned.negativeToken) result.negativeToken = cleaned.negativeToken;
  if (cleaned.queueParams) result.queueParams = cleaned.queueParams;
  if ((cleaned.customTokens?.length ?? 0) > 0) {
    result.customTokens = cleaned.customTokens;
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}

export const WORKFLOW_PARAM_TOKEN_HELP = [
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_CFG_TOKEN,
  DEFAULT_STEPS_TOKEN,
] as const;
