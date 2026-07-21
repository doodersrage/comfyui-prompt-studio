import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  detectWorkflowPlaceholders,
  listWorkflowNodeIds,
  type WorkflowPlaceholderTokens,
} from "./comfyui-config";
import {
  applyWorkflowNodeBindings,
  type WorkflowBindingChange,
} from "./workflow-apply-bindings";
import { suggestWorkflowNodeMappings } from "./workflow-node-mapper";
import { enrichWorkflowGraph } from "./workflow-graph-enrich";
import { listLoraBindTokens } from "./workflow-lora-patch";
import { mergeLoraLibraryIntoCustomTokens, loadComfyUiSettings } from "./comfyui-settings";
import { resolvePromptEncodeTextField } from "./workflow-prompt-encode";
import { workflowContentHash } from "./workflow-content-hash";
import { repairQwenImageClipLoaderNodes } from "./workflow-qwen-clip-repair";

export type WorkflowQueueAudit = {
  nodeCount: number;
  placeholders: ReturnType<typeof detectWorkflowPlaceholders>;
  hasPositivePlaceholder: boolean;
  hasLatentSizeBinding: boolean;
  hasSamplerBinding: boolean;
  hasCheckpointBinding: boolean;
  hasInputImageBinding: boolean;
  warnings: string[];
};

export type WorkflowQueueOptimizeChange = {
  kind: "binding" | "audit";
  severity: "info" | "warn";
  message: string;
};

export type WorkflowQueueOptimizeResult = {
  workflow: Record<string, unknown>;
  workflowJson: string;
  bindingChanges: WorkflowBindingChange[];
  changes: WorkflowQueueOptimizeChange[];
  audit: WorkflowQueueAudit;
};

const CHECKPOINT_LOADER_TYPES = new Set([
  "CheckpointLoaderSimple",
  "CheckpointLoader",
]);

const UNET_LOADER_TYPES = new Set(["UNETLoader", "UnetLoaderGGUF"]);

function countToken(raw: string, token: string): number {
  if (!token) {
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

function workflowHasLoaderType(
  parsed: Record<string, { class_type?: string }>,
  loaderTypes: Set<string>,
): boolean {
  return Object.values(parsed).some((node) =>
    loaderTypes.has(node.class_type ?? ""),
  );
}

export function auditWorkflowStructure(
  workflowJson: string,
  tokens: WorkflowPlaceholderTokens,
): WorkflowQueueAudit {
  const placeholders = detectWorkflowPlaceholders(workflowJson, tokens);
  let parsed: Record<string, { class_type?: string }> = {};
  try {
    parsed = JSON.parse(workflowJson) as Record<string, { class_type?: string }>;
  } catch {
    return {
      nodeCount: 0,
      placeholders,
      hasPositivePlaceholder: placeholders.positive > 0,
      hasLatentSizeBinding: placeholders.width > 0 && placeholders.height > 0,
      hasSamplerBinding:
        placeholders.seed > 0 && placeholders.steps > 0 && placeholders.cfg > 0,
      hasCheckpointBinding: false,
      hasInputImageBinding: placeholders.inputImage > 0,
      warnings: ["Workflow JSON is invalid."],
    };
  }

  const nodeCount = listWorkflowNodeIds(parsed).length;
  const hasPositivePlaceholder = placeholders.positive > 0;
  const hasLatentSizeBinding = placeholders.width > 0 && placeholders.height > 0;
  const hasSamplerBinding =
    placeholders.seed > 0 && placeholders.steps > 0 && placeholders.cfg > 0;
  const hasCheckpointToken =
    countToken(workflowJson, DEFAULT_CHECKPOINT_TOKEN) > 0 ||
    countToken(workflowJson, DEFAULT_UNET_TOKEN) > 0;
  const hasLoaderNodes =
    workflowHasLoaderType(parsed, CHECKPOINT_LOADER_TYPES) ||
    workflowHasLoaderType(parsed, UNET_LOADER_TYPES);
  const hasCheckpointBinding = !hasLoaderNodes || hasCheckpointToken;
  const hasInputImageBinding = placeholders.inputImage > 0;

  const warnings: string[] = [];
  if (!hasPositivePlaceholder) {
    warnings.push(
      `No ${tokens.positive} placeholder — prompt injection may rely on CLIP heuristics only.`,
    );
  }
  if (!hasLatentSizeBinding) {
    warnings.push(
      "Latent width/height placeholders missing — direct patch will still set EmptyLatentImage when enabled.",
    );
  }
  if (!hasSamplerBinding) {
    warnings.push(
      "Sampler placeholders missing — KSampler nodes are patched directly from queue params.",
    );
  }
  if (!hasCheckpointBinding) {
    warnings.push(
      "Checkpoint/UNET loader present without {{CHECKPOINT}}/{{UNET}} — set model checkpoint map or save an optimized copy with bindings.",
    );
  }

  return {
    nodeCount,
    placeholders,
    hasPositivePlaceholder,
    hasLatentSizeBinding,
    hasSamplerBinding,
    hasCheckpointBinding,
    hasInputImageBinding,
    warnings,
  };
}

export function suggestedOptimizedWorkflowName(baseName: string): string {
  const trimmed = baseName.trim() || "workflow";
  if (/\(optimized\)$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed} (optimized)`;
}

function filterMappingsForOptimize(
  workflowJson: string,
  mappings: ReturnType<typeof suggestWorkflowNodeMappings>,
  tokens: WorkflowPlaceholderTokens,
): ReturnType<typeof suggestWorkflowNodeMappings> {
  let parsed: Record<string, { inputs?: Record<string, unknown> }> = {};
  try {
    parsed = JSON.parse(workflowJson) as Record<string, { inputs?: Record<string, unknown> }>;
  } catch {
    return [];
  }

  return mappings.filter((mapping) => {
    if (!mapping.suggestedBinding || mapping.suggestedBinding === "custom") {
      return false;
    }

    const inputs = parsed[mapping.nodeId]?.inputs;
    if (!inputs) {
      return false;
    }

    if (mapping.suggestedBinding === "positive") {
      const promptField = resolvePromptEncodeTextField(inputs);
      const field = promptField ?? (typeof inputs.text === "string" ? "text" : null);
      if (field && typeof inputs[field] === "string") {
        const text = inputs[field] as string;
        if (text.includes(tokens.positive) || text.includes(tokens.negative)) {
          return false;
        }
      }
    }

    if (mapping.suggestedBinding === "negative") {
      const promptField = resolvePromptEncodeTextField(inputs);
      const field = promptField ?? (typeof inputs.text === "string" ? "text" : null);
      if (field && typeof inputs[field] === "string") {
        const text = inputs[field] as string;
        if (text.includes(tokens.negative) || text.includes(tokens.positive)) {
          return false;
        }
      }
    }

    if (mapping.suggestedBinding === "sampler") {
      const seed = inputs.seed;
      const steps = inputs.steps;
      const cfg = inputs.cfg;
      if (
        typeof seed === "string" &&
        seed.includes(tokens.seed) &&
        typeof steps === "string" &&
        steps.includes(tokens.steps) &&
        typeof cfg === "string" &&
        cfg.includes(tokens.cfg)
      ) {
        return false;
      }
    }

    if (mapping.suggestedBinding === "latent") {
      const width = inputs.width;
      const height = inputs.height;
      if (
        typeof width === "string" &&
        width.includes(tokens.width) &&
        typeof height === "string" &&
        height.includes(tokens.height)
      ) {
        return false;
      }
    }

    if (mapping.suggestedBinding === "controlNetLoader") {
      const value = inputs.control_net_name;
      if (typeof value === "string" && value.includes("{{CONTROLNET")) {
        return false;
      }
    }

    if (mapping.suggestedBinding === "loraLoader") {
      const value = inputs.lora_name;
      if (typeof value === "string" && /^\{\{LORA_/.test(value.trim())) {
        return false;
      }
    }

    if (mapping.suggestedBinding === "controlImage") {
      const value = inputs.image;
      if (typeof value === "string" && value.includes("{{CONTROL_IMAGE}}")) {
        return false;
      }
    }

    return true;
  });
}

function workflowIsFullyBound(audit: WorkflowQueueAudit): boolean {
  return (
    audit.hasPositivePlaceholder &&
    audit.hasLatentSizeBinding &&
    audit.hasSamplerBinding &&
    audit.hasCheckpointBinding
  );
}

export function optimizeWorkflowForQueue(input: {
  workflow: Record<string, unknown>;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  qualityProfile?: import("./queue-quality-profile").QueueQualityProfile;
  upscaleModelFilename?: string;
  refinerCheckpointFilename?: string;
  enabled?: boolean;
  enrichGraph?: boolean;
  enrichSdxlRefiner?: boolean;
  enrichNeuralPolish?: boolean;
  enrichSharpen?: boolean;
  loraBindTokens?: string[];
  /** When set and matches current workflow hash, skip optimize/enrich if already fully bound. */
  contentHash?: string;
  skipIfUnchanged?: boolean;
}): WorkflowQueueOptimizeResult {
  const enabled = input.enabled !== false;
  const enrichGraph = input.enrichGraph !== false;
  const loraBindTokens =
    input.loraBindTokens ??
    (typeof window !== "undefined"
      ? listLoraBindTokens(mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings()).customTokens ?? [])
      : []);
  const qwenClipRepair = repairQwenImageClipLoaderNodes(input.workflow);
  let workflow = qwenClipRepair.workflow;
  let workflowJson = JSON.stringify(workflow, null, 2);
  const changes: WorkflowQueueOptimizeChange[] = [];
  if (qwenClipRepair.repairedNodeIds.length > 0) {
    changes.push({
      kind: "audit",
      severity: "info",
      message: `Repaired Qwen CLIP loader on node(s) ${qwenClipRepair.repairedNodeIds.join(", ")} — Qwen Image uses CLIPLoader (type qwen_image), not DualCLIPLoader.`,
    });
  }

  if (input.skipIfUnchanged && input.contentHash) {
    const currentHash = workflowContentHash(workflowJson);
    if (currentHash === input.contentHash) {
      const audit = auditWorkflowStructure(workflowJson, input.tokens);
      if (workflowIsFullyBound(audit)) {
        return {
          workflow,
          workflowJson,
          bindingChanges: [],
          changes,
          audit,
        };
      }
    }
  }

  let bindingChanges: WorkflowBindingChange[] = [];

  if (enabled) {
    const initialAudit = auditWorkflowStructure(workflowJson, input.tokens);
    if (!workflowIsFullyBound(initialAudit)) {
      const mappings = filterMappingsForOptimize(
        workflowJson,
        suggestWorkflowNodeMappings(workflowJson),
        input.tokens,
      );

      if (mappings.length > 0) {
        const applied = applyWorkflowNodeBindings(
          workflowJson,
          mappings,
          input.tokens,
          { loraBindTokens },
        );
        if (applied.changes.length > 0) {
          workflowJson = applied.json;
          bindingChanges = applied.changes;
          changes.push({
            kind: "binding",
            severity: "info",
            message: `Auto-bound ${applied.changes.length} workflow field(s) for queue takeover.`,
          });
        }
      }
    }
  }

  workflow = JSON.parse(workflowJson) as Record<string, unknown>;

  if (enabled && enrichGraph) {
    const enriched = enrichWorkflowGraph({
      workflow,
      tokens: input.tokens,
      model: input.model,
      qualityProfile: input.qualityProfile,
      upscaleModelFilename: input.upscaleModelFilename,
      refinerCheckpointFilename: input.refinerCheckpointFilename,
      enrichSdxlRefiner: input.enrichSdxlRefiner,
      enrichNeuralPolish: input.enrichNeuralPolish,
      enrichSharpen: input.enrichSharpen,
    });
    workflow = enriched.workflow;
    workflowJson = JSON.stringify(workflow, null, 2);
    changes.push(...enriched.changes);
  }

  const audit = auditWorkflowStructure(workflowJson, input.tokens);
  for (const warning of audit.warnings) {
    changes.push({
      kind: "audit",
      severity: "warn",
      message: warning,
    });
  }

  return {
    workflow,
    workflowJson,
    bindingChanges,
    changes,
    audit,
  };
}
