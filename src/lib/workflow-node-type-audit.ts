import { settingsComfyUiSectionHref } from './settings-comfyui-nav';

export type WorkflowNodeTypeIssue = {
  severity: 'error' | 'warn';
  message: string;
  /** Optional deep-link for queue-failure playbooks / toasts. */
  href?: string;
};

export function listWorkflowClassTypes(
  workflowJson?: string,
  workflow?: Record<string, unknown> | null
): string[] {
  let graph = workflow ?? null;
  if (!graph) {
    if (!workflowJson?.trim()) {
      return [];
    }
    try {
      graph = JSON.parse(workflowJson) as Record<string, unknown>;
    } catch {
      return [];
    }
  }

  const types = new Set<string>();
  for (const node of Object.values(graph)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const classType = (node as { class_type?: string }).class_type?.trim();
    if (classType) {
      types.add(classType);
    }
  }
  return [...types];
}

export function auditWorkflowNodeTypes(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  knownNodeTypes?: Set<string> | string[];
}): WorkflowNodeTypeIssue[] {
  const known =
    input.knownNodeTypes instanceof Set
      ? input.knownNodeTypes
      : new Set(input.knownNodeTypes ?? []);

  if (known.size === 0) {
    return [];
  }

  const issues: WorkflowNodeTypeIssue[] = [];
  for (const classType of listWorkflowClassTypes(input.workflowJson, input.workflow)) {
    if (!known.has(classType)) {
      issues.push({
        severity: 'error',
        message: `Workflow node type “${classType}” is not installed in ComfyUI — install the custom node pack or pick a different workflow.`,
        href: settingsComfyUiSectionHref('workflow-map'),
      });
    }
  }

  return issues;
}

/** Unique class_type values that object_info does not know about. */
export function collectMissingWorkflowNodeTypes(
  workflows: Array<{ workflowJson?: string; workflow?: Record<string, unknown> | null }>,
  knownNodeTypes?: Set<string> | string[]
): string[] {
  const known = knownNodeTypes instanceof Set ? knownNodeTypes : new Set(knownNodeTypes ?? []);
  if (known.size === 0) {
    return [];
  }
  const missing = new Set<string>();
  for (const workflow of workflows) {
    for (const classType of listWorkflowClassTypes(workflow.workflowJson, workflow.workflow)) {
      if (!known.has(classType)) {
        missing.add(classType);
      }
    }
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}
