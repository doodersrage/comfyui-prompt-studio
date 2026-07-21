import type { ComfyImageModel } from "./comfy-models/client";
import { isQwenLightningModel } from "./model-sampling-patch";
import { auditWorkflowStackCompatibility } from "./workflow-stack-fingerprint";
import { auditWorkflowPreviewIssues } from "./workflow-placeholder-audit";
import { auditWorkflowNodeTypes } from "./workflow-node-type-audit";
import { auditDualClipNodesInWorkflow } from "./workflow-dual-clip-audit";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import { auditLightningWorkflowIssues } from "./workflow-lightning-queue";
import { auditLoaderFilenamesInWorkflow } from "./workflow-loader-filename-audit";
import { buildLightningLoraFilenameMap } from "./workflow-lora-patch";

export type WorkflowPreflightIssue = {
  severity: "error" | "warn";
  message: string;
};

export type WorkflowGraphPreflightInput = {
  workflowJson?: string;
  model: ComfyImageModel | string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  syncWorkflowLoadersToModel?: boolean;
  knownNodeTypes?: Set<string> | string[];
  models?: ComfyUiModelLists | null;
  objectInfoUnavailable?: boolean;
  customTokens?: Array<{ token: string; value: string }>;
};

/**
 * Shared graph audits used by client preview preflight and server queue preflight.
 * Keep Lightning + inventory checks here so UI and /prompt cannot diverge.
 */
export function collectWorkflowGraphPreflightIssues(
  input: WorkflowGraphPreflightInput,
): WorkflowPreflightIssue[] {
  const issues: WorkflowPreflightIssue[] = [];

  issues.push(
    ...auditWorkflowPreviewIssues({
      workflowJson: input.workflowJson,
      model: input.model,
      hasInputImage: input.hasInputImage,
      hasMaskImage: input.hasMaskImage,
    }),
  );

  issues.push(
    ...auditWorkflowStackCompatibility({
      workflowJson: input.workflowJson,
      model: input.model,
      syncWorkflowLoadersToModel: input.syncWorkflowLoadersToModel,
    }),
  );

  issues.push(
    ...auditWorkflowNodeTypes({
      workflowJson: input.workflowJson,
      knownNodeTypes: input.knownNodeTypes,
    }),
  );

  const loraFilenames = buildLightningLoraFilenameMap(
    input.customTokens ?? [],
    String(input.model),
    input.models?.loras,
  );

  issues.push(
    ...auditLightningWorkflowIssues({
      workflowJson: input.workflowJson,
      model: input.model,
      loraFilenames,
    }),
  );

  if (input.objectInfoUnavailable) {
    issues.push({
      severity: isQwenLightningModel(input.model) ? "error" : "warn",
      message: isQwenLightningModel(input.model)
        ? "ComfyUI object_info unavailable — cannot verify Lightning LoRA/loader inventory. Ensure ComfyUI is reachable before queueing."
        : "ComfyUI object_info unavailable — skipped loader filename and node-type inventory checks.",
    });
  }

  if (input.models) {
    issues.push(
      ...auditDualClipNodesInWorkflow({
        workflowJson: input.workflowJson,
        models: input.models,
      }),
    );
    issues.push(
      ...auditLoaderFilenamesInWorkflow({
        workflowJson: input.workflowJson,
        models: input.models,
      }),
    );
  }

  return issues;
}

export function summarizeWorkflowGraphPreflight(
  input: WorkflowGraphPreflightInput,
): { ok: boolean; issues: WorkflowPreflightIssue[] } {
  const issues = collectWorkflowGraphPreflightIssues(input);
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
