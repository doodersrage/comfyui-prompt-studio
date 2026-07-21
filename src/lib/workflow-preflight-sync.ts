import type { ComfyImageModel } from "./comfy-models";
import {
  collectWorkflowGraphPreflightIssues,
  summarizeWorkflowGraphPreflight,
  type WorkflowPreflightIssue,
} from "./workflow-preflight-core";
import type { ComfyUiModelLists } from "./comfyui-object-info";

export type { WorkflowPreflightIssue };

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
  void input.negativePrompt;
  return summarizeWorkflowGraphPreflight(input);
}

export { collectWorkflowGraphPreflightIssues };
