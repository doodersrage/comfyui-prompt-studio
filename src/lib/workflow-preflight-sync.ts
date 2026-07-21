import type { ComfyImageModel } from "./comfy-models";
import { auditWorkflowStackCompatibility } from "./workflow-stack-fingerprint";
import { auditWorkflowPreviewIssues } from "./workflow-placeholder-audit";
import { auditWorkflowNodeTypes } from "./workflow-node-type-audit";
import { auditDualClipNodesInWorkflow } from "./workflow-dual-clip-audit";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import type { WorkflowPreflightIssue } from "./workflow-preflight";
import { auditLightningWorkflowIssues } from "./workflow-lightning-queue";
import { auditLoaderFilenamesInWorkflow } from "./workflow-loader-filename-audit";

export function runWorkflowPreflightSync(input: {
  workflowJson?: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  syncWorkflowLoadersToModel?: boolean;
  knownNodeTypes?: Set<string> | string[];
  models?: ComfyUiModelLists | null;
  objectInfoUnavailable?: boolean;
}): { ok: boolean; issues: WorkflowPreflightIssue[] } {
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

  issues.push(...auditLightningWorkflowIssues({
    workflowJson: input.workflowJson,
    model: input.model,
  }));

  if (input.objectInfoUnavailable) {
    issues.push({
      severity: "warn",
      message:
        "ComfyUI object_info unavailable — skipped loader filename and node-type inventory checks.",
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

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
