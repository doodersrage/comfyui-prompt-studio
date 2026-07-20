export type WorkflowNodeMapping = {
  nodeId: string;
  classType: string;
  title?: string;
  suggestedBinding?: "positive" | "negative" | "seed" | "steps" | "cfg" | "custom";
  reason: string;
};

type WorkflowNode = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

export function suggestWorkflowNodeMappings(workflowJson: string): WorkflowNodeMapping[] {
  let parsed: Record<string, WorkflowNode>;
  try {
    parsed = JSON.parse(workflowJson) as Record<string, WorkflowNode>;
  } catch {
    return [];
  }

  const mappings: WorkflowNodeMapping[] = [];

  for (const [nodeId, node] of Object.entries(parsed)) {
    const classType = node.class_type ?? "";
    const title = node._meta?.title?.toLowerCase() ?? "";
    const classLower = classType.toLowerCase();

    if (classLower.includes("cliptextencode") || classLower.includes("textencode")) {
      let binding: WorkflowNodeMapping["suggestedBinding"] = "custom";
      let reason = "Text encode node";
      if (title.includes("negative") || title.includes("neg")) {
        binding = "negative";
        reason = "Title suggests negative prompt encode";
      } else if (title.includes("positive") || title.includes("pos") || title.includes("prompt")) {
        binding = "positive";
        reason = "Title suggests positive prompt encode";
      } else if (!title.includes("negative")) {
        binding = "positive";
        reason = "Default positive prompt encode candidate";
      }
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: binding,
        reason,
      });
      continue;
    }

    if (classLower.includes("ksampler") || classLower.includes("sampler")) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "seed",
        reason: "Sampler node — map seed/steps/cfg placeholders here",
      });
    }
  }

  return mappings;
}
