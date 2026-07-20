import type { WorkflowPlaceholderTokens } from "./comfyui-config";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import { findUnresolvedPlaceholderTokens } from "./workflow-placeholder-audit";

export type WorkflowHealthIssue = {
  workflowId: string;
  workflowName: string;
  severity: "error" | "warn";
  message: string;
};

export type WorkflowLibraryHealthReport = {
  scanned: number;
  healthy: number;
  issues: WorkflowHealthIssue[];
};

const LOADER_TOKENS = new Set(["{{CHECKPOINT}}", "{{UNET}}", "{{VAE}}"]);

export function auditWorkflowLibraryHealth(input: {
  workflowFiles: ComfyWorkflowFile[];
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
      });
      continue;
    }

    const unresolved = findUnresolvedPlaceholderTokens(json);
    if (unresolved.length === 0) {
      continue;
    }

    for (const token of unresolved) {
      issues.push({
        workflowId: file.id,
        workflowName: file.name,
        severity: LOADER_TOKENS.has(token) ? "error" : "warn",
        message: `Unresolved ${token} — run Optimize all in library or set loader maps.`,
      });
    }
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
  tokens?: WorkflowPlaceholderTokens;
  model?: string;
}): WorkflowLibraryHealthReport {
  return auditWorkflowLibraryHealth({ workflowFiles: input.workflowFiles });
}
