import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import { auditWorkflowPreviewIssues } from "./workflow-placeholder-audit";
import { workflowContentHash } from "./workflow-content-hash";
import { resolveOptimizeModelForWorkflowFile } from "./workflow-optimize-model";
import type { ModelWorkflowMap } from "./model-workflow-map";
import { isEditCapableModel } from "./model-denoise-defaults";
import { auditWorkflowStackCompatibility } from "./workflow-stack-fingerprint";

export type WorkflowHealthIssue = {
  workflowId: string;
  workflowName: string;
  severity: "error" | "warn";
  message: string;
  /** When set, UI can focus this workflow in the library panel. */
  action?: "open-workflow" | "optimize-workflow";
};

export type WorkflowLibraryHealthReport = {
  scanned: number;
  healthy: number;
  issues: WorkflowHealthIssue[];
};

export function auditWorkflowLibraryHealth(input: {
  workflowFiles: ComfyWorkflowFile[];
  modelWorkflowMap?: ModelWorkflowMap;
}): WorkflowLibraryHealthReport {
  const issues: WorkflowHealthIssue[] = [];

  for (const file of input.workflowFiles) {
    const json = file.workflowJson.trim();
    if (!json) {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: "warn",
        message: "Workflow JSON is empty.",
        action: "open-workflow",
      });
      continue;
    }

    try {
      JSON.parse(json);
    } catch {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: "error",
        message: "Workflow JSON is invalid.",
        action: "open-workflow",
      });
      continue;
    }

    if (
      file.lastOptimizedHash &&
      file.lastOptimizedHash !== workflowContentHash(json)
    ) {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: "warn",
        message: "Workflow changed since last optimize — re-run Optimize all or Optimize copy.",
        action: "optimize-workflow",
      });
    }

    const optimizeModel = resolveOptimizeModelForWorkflowFile(
      file,
      undefined,
      input.modelWorkflowMap,
    );
    issues.push(
      ...auditWorkflowPreviewIssues({
        workflowJson: json,
        model: optimizeModel,
        hasInputImage: isEditCapableModel(optimizeModel),
      }).map((issue) => ({
        workflowId: file.id,
        workflowName: file.name,
        severity: issue.severity,
        message: `[${optimizeModel}] ${issue.message}`,
        action:
          issue.severity === "error"
            ? ("optimize-workflow" as const)
            : ("open-workflow" as const),
      })),
    );

    issues.push(
      ...auditWorkflowStackCompatibility({
        workflowJson: json,
        model: optimizeModel,
      }).map((issue) => ({
        workflowId: file.id,
        workflowName: file.name,
        severity: issue.severity,
        message: `[${optimizeModel}] ${issue.message}`,
        action:
          issue.severity === "error"
            ? ("optimize-workflow" as const)
            : ("open-workflow" as const),
      })),
    );
  }

  const affectedIds = new Set(issues.map((issue) => issue.workflowId));
  const scanned = input.workflowFiles.length;
  const healthy = Math.max(0, scanned - affectedIds.size);

  return { scanned, healthy, issues };
}

export function summarizeWorkflowLibraryHealth(
  report: WorkflowLibraryHealthReport,
): string {
  if (report.scanned === 0) {
    return "No workflows in library — import JSON or use Optimize all after import.";
  }
  if (report.issues.length === 0) {
    return `${report.scanned} workflow(s) look ready — no unresolved placeholders.`;
  }
  const errors = report.issues.filter((issue) => issue.severity === "error").length;
  const warns = report.issues.length - errors;
  return `${report.healthy}/${report.scanned} workflow(s) clean · ${errors} error(s) · ${warns} review note(s).`;
}

/** @deprecated tokens param unused — kept for future model-specific audits */
export function auditWorkflowLibraryHealthLegacy(input: {
  workflowFiles: ComfyWorkflowFile[];
  tokens?: import("./comfyui-config").WorkflowPlaceholderTokens;
  model?: string;
}): WorkflowLibraryHealthReport {
  return auditWorkflowLibraryHealth({ workflowFiles: input.workflowFiles });
}

export const WORKFLOW_HEALTH_SELECT_EVENT = "workflow-health-select-file";

export function dispatchWorkflowHealthSelect(
  workflowId: string,
  action?: WorkflowHealthIssue["action"],
): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(WORKFLOW_HEALTH_SELECT_EVENT, {
      detail: { workflowId, action },
    }),
  );
}
