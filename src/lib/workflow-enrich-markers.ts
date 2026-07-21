export const PROMPT_STUDIO_META_PREFIX = "Prompt Studio —";

type WorkflowNodeMeta = {
  class_type?: string;
  _meta?: { title?: string };
  inputs?: Record<string, unknown>;
};

export function isPromptStudioEnrichedNode(meta?: { title?: string }): boolean {
  const title = meta?.title?.trim() ?? "";
  return title.startsWith(PROMPT_STUDIO_META_PREFIX);
}

export function isPromptStudioProtectedSampler(node: WorkflowNodeMeta): boolean {
  if (!isPromptStudioEnrichedNode(node._meta)) {
    return false;
  }
  const title = node._meta?.title?.toLowerCase() ?? "";
  return title.includes("refiner pass") || title.includes("refiner ksampler");
}

/** Skip global queue sampler patch on enriched refiner passes and low-denoise stages. */
export function shouldSkipGlobalSamplerPatch(node: WorkflowNodeMeta): boolean {
  if (isPromptStudioProtectedSampler(node)) {
    return true;
  }

  const inputs = node.inputs;
  if (!inputs || !("denoise" in inputs)) {
    return false;
  }

  const denoise = Number(inputs.denoise);
  return Number.isFinite(denoise) && denoise > 0 && denoise < 0.95;
}

export function isPromptStudioOutputUpscaleNode(node: WorkflowNodeMeta): boolean {
  if (!isPromptStudioEnrichedNode(node._meta)) {
    return false;
  }
  const title = node._meta?.title?.toLowerCase() ?? "";
  return title.includes("upscale") || title.includes("sharpen") || title.includes("polish");
}
