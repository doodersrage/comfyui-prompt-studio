import type { ComfyImageModel } from "./comfy-models";
import { auditWorkflowStackCompatibility } from "./workflow-stack-fingerprint";
import { auditWorkflowPreviewIssues } from "./workflow-placeholder-audit";
import { auditWorkflowNodeTypes } from "./workflow-node-type-audit";
import { auditDualClipNodesInWorkflow } from "./workflow-dual-clip-audit";
import type { ComfyUiModelLists } from "./comfyui-object-info";
import type { WorkflowPreflightIssue } from "./workflow-preflight";

export function runWorkflowPreflightSync(input: {
  workflowJson?: string;
  model: ComfyImageModel | string;
  negativePrompt?: string;
  hasInputImage?: boolean;
  hasMaskImage?: boolean;
  syncWorkflowLoadersToModel?: boolean;
  knownNodeTypes?: Set<string> | string[];
  models?: ComfyUiModelLists | null;
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

  if (input.models) {
    issues.push(
      ...auditDualClipNodesInWorkflow({
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
