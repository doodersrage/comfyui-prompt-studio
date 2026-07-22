/**
 * Portable IP-Adapter tokens — the "identity reference" analogue of the
 * ControlNet map pattern (see model-controlnet-map.ts / workflow-direct-patch.ts's
 * patchControlNetNodesInWorkflow). Any workflow JSON that contains these tokens
 * can be queued with a session-level reference image/strength/model without
 * hand-editing node IDs:
 *
 *   {{IPADAPTER_IMAGE}}    — LoadImage node's `image` filename field
 *   {{IPADAPTER_STRENGTH}} — IPAdapter-family node's weight/strength field (0–1)
 *   {{IPADAPTER_MODEL}}    — IPAdapter loader node's ipadapter_file field (optional)
 */

export const DEFAULT_IPADAPTER_IMAGE_TOKEN = "{{IPADAPTER_IMAGE}}";
export const DEFAULT_IPADAPTER_STRENGTH_TOKEN = "{{IPADAPTER_STRENGTH}}";
export const DEFAULT_IPADAPTER_MODEL_TOKEN = "{{IPADAPTER_MODEL}}";

export const IPADAPTER_WORKFLOW_TOKENS = [
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
] as const;

const IMAGE_LOADER_TYPES = new Set(["LoadImage", "LoadImageOutput"]);
const IPADAPTER_CLASS_PATTERN = /ipadapter/i;
const IPADAPTER_STRENGTH_FIELDS = ["weight", "strength", "ip_weight"] as const;
const IPADAPTER_MODEL_FIELDS = ["ipadapter_file"] as const;

const MIN_IPADAPTER_STRENGTH = 0;
const MAX_IPADAPTER_STRENGTH = 1;

export type IpAdapterPatchInput = {
  imageFilename?: string;
  /** 0–1; values outside range are clamped. */
  strength?: number | string;
  modelFilename?: string;
};

export type IpAdapterPatchCounts = {
  image?: number;
  strength?: number;
  model?: number;
};

export type IpAdapterPatchResult = {
  workflow: Record<string, unknown>;
  patched: IpAdapterPatchCounts;
};

export function clampIpAdapterStrength(value: number | string | undefined): number | undefined {
  if (value == null || value.toString().trim() === "") {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return Math.min(MAX_IPADAPTER_STRENGTH, Math.max(MIN_IPADAPTER_STRENGTH, numeric));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function containsToken(value: unknown, token: string): boolean {
  return isString(value) && value.includes(token);
}

type WorkflowNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

/**
 * Node-aware pass: patches known LoadImage / IPAdapter-family node fields when
 * they currently hold the matching `{{IPADAPTER_*}}` token.
 */
export function patchIpAdapterNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: IpAdapterPatchInput,
): IpAdapterPatchResult {
  const next = structuredClone(workflow) as Record<string, WorkflowNode>;
  const patched: IpAdapterPatchCounts = {};

  const imageFilename = input.imageFilename?.trim();
  const strength = clampIpAdapterStrength(input.strength);
  const modelFilename = input.modelFilename?.trim();

  for (const node of Object.values(next)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const classType = node.class_type ?? "";
    const inputs = node.inputs;
    if (!inputs) {
      continue;
    }

    if (
      imageFilename &&
      IMAGE_LOADER_TYPES.has(classType) &&
      "image" in inputs &&
      containsToken(inputs.image, DEFAULT_IPADAPTER_IMAGE_TOKEN)
    ) {
      inputs.image = imageFilename;
      patched.image = (patched.image ?? 0) + 1;
    }

    if (!IPADAPTER_CLASS_PATTERN.test(classType)) {
      continue;
    }

    if (strength != null) {
      for (const field of IPADAPTER_STRENGTH_FIELDS) {
        if (field in inputs && containsToken(inputs[field], DEFAULT_IPADAPTER_STRENGTH_TOKEN)) {
          inputs[field] = strength;
          patched.strength = (patched.strength ?? 0) + 1;
        }
      }
    }

    if (modelFilename) {
      for (const field of IPADAPTER_MODEL_FIELDS) {
        if (field in inputs && containsToken(inputs[field], DEFAULT_IPADAPTER_MODEL_TOKEN)) {
          inputs[field] = modelFilename;
          patched.model = (patched.model ?? 0) + 1;
        }
      }
    }
  }

  return { workflow: next, patched };
}

/**
 * Fallback: raw JSON string replace for tokens on fields/nodes the node-aware
 * pass above doesn't recognize (custom/community IPAdapter node variants).
 * Runs after the node-aware pass, so already-resolved tokens are no-ops.
 */
export function replaceIpAdapterTokensInWorkflowJson(
  workflow: Record<string, unknown>,
  input: IpAdapterPatchInput,
): Record<string, unknown> {
  const imageFilename = input.imageFilename?.trim();
  const strength = clampIpAdapterStrength(input.strength);
  const modelFilename = input.modelFilename?.trim();

  if (!imageFilename && strength == null && !modelFilename) {
    return workflow;
  }

  let json = JSON.stringify(workflow);
  if (!json.includes("{{IPADAPTER_")) {
    return workflow;
  }

  if (imageFilename) {
    json = json.split(DEFAULT_IPADAPTER_IMAGE_TOKEN).join(imageFilename);
  }
  if (strength != null) {
    json = json.split(DEFAULT_IPADAPTER_STRENGTH_TOKEN).join(String(strength));
  }
  if (modelFilename) {
    json = json.split(DEFAULT_IPADAPTER_MODEL_TOKEN).join(modelFilename);
  }

  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return workflow;
  }
}

/** Combined node-aware + fallback string-replace pass — the single entry point for queue injection. */
export function patchIpAdapterTokensInWorkflow(
  workflow: Record<string, unknown>,
  input: IpAdapterPatchInput,
): IpAdapterPatchResult {
  if (!input.imageFilename?.trim() && input.strength == null && !input.modelFilename?.trim()) {
    return { workflow, patched: {} };
  }

  const nodePatch = patchIpAdapterNodesInWorkflow(workflow, input);
  const withFallback = replaceIpAdapterTokensInWorkflowJson(nodePatch.workflow, input);
  return { workflow: withFallback, patched: nodePatch.patched };
}

/** Detects unresolved `{{IPADAPTER_*}}` placeholders — useful for preflight / health checks. */
export function findUnresolvedIpAdapterTokens(workflow: Record<string, unknown> | string): string[] {
  const raw = typeof workflow === "string" ? workflow : JSON.stringify(workflow);
  return IPADAPTER_WORKFLOW_TOKENS.filter((token) => raw.includes(token));
}
