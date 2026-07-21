export type WorkflowNodeTypeIssue = {
  severity: "error" | "warn";
  message: string;
};

export function listWorkflowClassTypes(workflowJson?: string): string[] {
  if (!workflowJson?.trim()) {
    return [];
  }

  let workflow: Record<string, unknown>;
  try {
    workflow = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return [];
  }

  const types = new Set<string>();
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") {
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
  for (const classType of listWorkflowClassTypes(input.workflowJson)) {
    if (!known.has(classType)) {
      issues.push({
        severity: "error",
        message: `Workflow node type “${classType}” is not installed in ComfyUI — install the custom node pack or pick a different workflow.`,
      });
    }
  }

  return issues;
}
