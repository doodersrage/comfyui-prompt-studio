import { isModelSamplingFluxNode, isModelSamplingPatchNode } from "./model-sampling-patch";

export type WorkflowNodeMapping = {
  nodeId: string;
  classType: string;
  title?: string;
  suggestedBinding?:
    | "positive"
    | "negative"
    | "seed"
    | "sampler"
    | "modelSampling"
    | "latent"
    | "inputImage"
    | "maskImage"
    | "checkpointLoader"
    | "unetLoader"
    | "vaeLoader"
    | "upscaleModelLoader"
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

function isSamplerNode(classType: string, inputs: Record<string, unknown>): boolean {
  if (isModelSamplingPatchNode(classType)) {
    return false;
  }
  const classLower = classType.toLowerCase();
  if (classLower.includes("ksampler") || classLower.includes("samplercustom")) {
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

    if (isModelSamplingPatchNode(classType)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "modelSampling",
        reason: isModelSamplingFluxNode(classType)
          ? "Flux model sampling — map shift curve and resolution placeholders here"
          : "Model sampling patch — map shift placeholder here",
      });
      continue;
    }

    if (isSamplerNode(classType, inputs)) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "sampler",
        reason: "Sampler node — map seed/steps/cfg/denoise placeholders here",
      });
      continue;
    }

    if (
      (classType === "LoadImage" || classType === "LoadImageOutput") &&
      "image" in inputs
    ) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "inputImage",
        reason: "Load image node — map input image placeholder here",
      });
      continue;
    }

    if (classType === "LoadImageMask" && "image" in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "maskImage",
        reason: "Load mask node — map inpaint mask placeholder here",
      });
      continue;
    }

    if (
      (classType === "CheckpointLoaderSimple" || classType === "CheckpointLoader") &&
      "ckpt_name" in inputs
    ) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "checkpointLoader",
        reason: "Checkpoint loader — map {{CHECKPOINT}} placeholder here",
      });
      continue;
    }

    if (
      (classType === "UNETLoader" || classType === "UnetLoaderGGUF") &&
      "unet_name" in inputs
    ) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "unetLoader",
        reason: "UNET loader — map {{UNET}} placeholder here",
      });
      continue;
    }

    if (classType === "VAELoader" && "vae_name" in inputs) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "vaeLoader",
        reason: "VAE loader — map {{VAE}} placeholder here",
      });
      continue;
    }

    if (
      (classType === "UpscaleModelLoader" || classType === "UpscaleModel") &&
      "model_name" in inputs
    ) {
      mappings.push({
        nodeId,
        classType,
        title: node._meta?.title,
        suggestedBinding: "upscaleModelLoader",
        reason: "Upscale model loader — map {{UPSCALE_MODEL}} placeholder here",
      });
    }
  }

  return mappings;
}
