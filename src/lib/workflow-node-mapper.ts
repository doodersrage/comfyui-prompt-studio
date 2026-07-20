export type WorkflowNodeMapping = {
  nodeId: string;
  classType: string;
  title?: string;
  suggestedBinding?:
    | "positive"
    | "negative"
    | "seed"
    | "sampler"
    | "latent"
    | "steps"
    | "cfg"
    | "custom";
  reason: string;
};

type WorkflowNode = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

function isLatentSizeNode(classLower: string, inputs: Record<string, unknown>): boolean {
  if (!("width" in inputs) || !("height" in inputs)) {
    return false;
  }
  return (
    classLower.includes("emptylatent") ||
    classLower.includes("latentimage") ||
    classLower.includes("empty") && classLower.includes("latent")
  );
}

function isSamplerNode(classLower: string, inputs: Record<string, unknown>): boolean {
  if (classLower.includes("ksampler") || classLower.includes("sampler")) {
    return true;
  }
  return "seed" in inputs && ("steps" in inputs || "cfg" in inputs);
}

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
    const inputs = node.inputs ?? {};

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

    if (isLatentSizeNode(classLower, inputs)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "latent",
        reason: "Latent size node — map width/height placeholders here",
      });
      continue;
    }

    if (isSamplerNode(classLower, inputs)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "sampler",
        reason: "Sampler node — map seed/steps/cfg placeholders here",
      });
    }
  }

  return mappings;
}
