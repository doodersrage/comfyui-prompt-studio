type ComfyUiNodeError = {
  errors?: Array<{
    type?: string;
    message?: string;
    details?: string;
  }>;
  class_type?: string;
};

type ComfyUiValidationPayload = {
  error?: { type?: string; message?: string };
  node_errors?: Record<string, ComfyUiNodeError>;
};

function summarizeNodeError(nodeId: string, nodeError: ComfyUiNodeError): string | null {
  const first = nodeError.errors?.[0];
  if (!first) {
    return null;
  }

  const classType = nodeError.class_type ? `${nodeError.class_type} ` : "";
  const detail = first.details?.trim() || first.message?.trim();
  if (!detail) {
    return null;
  }

  if (
    nodeError.class_type === "DualCLIPLoader" &&
    /qwen_image/.test(detail) &&
    /not in/i.test(detail)
  ) {
    return `${classType}(node ${nodeId}): Qwen Image must use CLIPLoader (type qwen_image), not DualCLIPLoader — run Settings → Optimize all or queue again to auto-repair.`;
  }

  return `${classType}(node ${nodeId}): ${detail}`;
}

export function formatComfyUiQueueValidationError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed) as ComfyUiValidationPayload;
    const nodeErrors = parsed.node_errors;
    if (!nodeErrors || typeof nodeErrors !== "object") {
      return trimmed;
    }

    const summaries = Object.entries(nodeErrors)
      .map(([nodeId, nodeError]) => summarizeNodeError(nodeId, nodeError))
      .filter((entry): entry is string => Boolean(entry));

    if (summaries.length === 0) {
      return parsed.error?.message?.trim() || trimmed;
    }

    return summaries.join(" · ");
  } catch {
    return trimmed;
  }
}
