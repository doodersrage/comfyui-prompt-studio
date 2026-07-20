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

    if (mapping.suggestedBinding === "positive" && typeof inputs.text === "string") {
      const text = inputs.text;
      if (text.includes(tokens.positive) || text.includes(tokens.negative)) {
        return false;
      }
    }

    if (mapping.suggestedBinding === "negative" && typeof inputs.text === "string") {
      const text = inputs.text;
      if (text.includes(tokens.negative) || text.includes(tokens.positive)) {
        return false;
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
}): WorkflowQueueOptimizeResult {
  const enabled = input.enabled !== false;
  const enrichGraph = input.enrichGraph !== false;
  let workflowJson = JSON.stringify(input.workflow, null, 2);
  const changes: WorkflowQueueOptimizeChange[] = [];
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

  let workflow = JSON.parse(workflowJson) as Record<string, unknown>;

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
