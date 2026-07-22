import { getComfyUiBaseUrl, resolveComfyUiConfig } from "./comfyui-client";
import type { ComfyUiRuntimeConfig, WorkflowParamValues } from "./comfyui-config";
import { detectWorkflowPlaceholders } from "./comfyui-config";
import {
  extractImagesFromOutputs,
  type ComfyOutputImage,
} from "./comfyui-outputs";
import { extractParamsFromWorkflow } from "./workflow-param-extract";

export type ComfyPromptStatus = {
  promptId: string;
  status: "pending" | "running" | "completed" | "error" | "unknown";
  statusMessage?: string;
  comfyUrl: string;
  images?: ComfyOutputImage[];
  /** 1-based pending queue position; 0 means running now. */
  queuePosition?: number | null;
};

type ComfyHistoryEntry = {
  status?: {
    status_str?: string;
    completed?: boolean;
    messages?: Array<[string, Record<string, unknown>]>;
  };
  outputs?: Record<string, unknown>;
  prompt?: unknown[];
};

export type ComfyHistoryImportItem = {
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  comfyUrl: string;
  images: ComfyOutputImage[];
  statusMessage?: string;
  /** Sampler/latent params extracted from the history workflow graph. */
  queueParams?: WorkflowParamValues;
  model?: string;
  workflowJson?: string;
};

type ComfyQueueResponse = {
  queue_running?: Array<[number, string, ...unknown[]]>;
  queue_pending?: Array<[number, string, ...unknown[]]>;
};

type QueueContext = {
  isRunning: boolean;
  pendingPosition: number | null;
};

async function resolveQueueContext(
  promptId: string,
  comfyUrl: string,
): Promise<QueueContext | null> {
  try {
    const response = await fetch(`${comfyUrl}/queue`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ComfyQueueResponse;
    const running = payload.queue_running ?? [];
    const pending = payload.queue_pending ?? [];

    if (running.some((item) => item[1] === promptId)) {
      return { isRunning: true, pendingPosition: null };
    }

    const pendingIndex = pending.findIndex((item) => item[1] === promptId);
    if (pendingIndex >= 0) {
      return { isRunning: false, pendingPosition: pendingIndex + 1 };
    }

    return null;
  } catch {
    return null;
  }
}

function applyQueueContext(
  status: ComfyPromptStatus,
  queue: QueueContext | null,
): ComfyPromptStatus {
  if (!queue || status.status === "completed" || status.status === "error") {
    return status;
  }

  if (queue.isRunning) {
    return {
      ...status,
      status: "running",
      queuePosition: 0,
      statusMessage: status.statusMessage?.trim()
        ? status.statusMessage
        : "Running now",
    };
  }

  if (queue.pendingPosition != null) {
    return {
      ...status,
      status: "pending",
      queuePosition: queue.pendingPosition,
      statusMessage: `Queue position ${queue.pendingPosition}`,
    };
  }

  return status;
}

export async function getComfyUiPromptStatus(
  promptId: string,
  runtime?: ComfyUiRuntimeConfig,
): Promise<ComfyPromptStatus> {
  const comfyUrl = getComfyUiBaseUrl(runtime);

  try {
    const response = await fetch(`${comfyUrl}/history/${promptId}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (response.ok) {
      const payload = (await response.json()) as Record<string, ComfyHistoryEntry>;
      const entry = payload[promptId] ?? (payload as unknown as ComfyHistoryEntry);
      const status = interpretHistoryEntry(promptId, comfyUrl, entry);
      const queue = await resolveQueueContext(promptId, comfyUrl);
      return applyQueueContext(status, queue);
    }

    const allResponse = await fetch(`${comfyUrl}/history`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!allResponse.ok) {
      return {
        promptId,
        status: "unknown",
        statusMessage: `HTTP ${allResponse.status}`,
        comfyUrl,
      };
    }

    const history = (await allResponse.json()) as Record<
      string,
      ComfyHistoryEntry
    >;
    const entry = history[promptId];
    const queue = await resolveQueueContext(promptId, comfyUrl);

    if (!entry) {
      return applyQueueContext(
        {
          promptId,
          status: "pending",
          statusMessage: "Not in history yet (still queued or running)",
          comfyUrl,
        },
        queue,
      );
    }

    return applyQueueContext(
      interpretHistoryEntry(promptId, comfyUrl, entry),
      queue,
    );
  } catch (error) {
    return {
      promptId,
      status: "unknown",
      statusMessage: error instanceof Error ? error.message : "Status check failed",
      comfyUrl,
    };
  }
}

export async function getComfyUiWorkflowSummary(runtime?: ComfyUiRuntimeConfig) {
  const config = resolveComfyUiConfig(runtime);
  const placeholders = config.workflow
    ? detectWorkflowPlaceholders(JSON.stringify(config.workflow), config.placeholderTokens)
    : { positive: 0, negative: 0 };

  return {
    apiUrl: config.apiUrl,
    workflowSource: config.workflowSource,
    placeholderTokens: config.placeholderTokens,
    placeholders,
    legacyNodeFallback: Boolean(config.legacyPositiveNodeId),
    hasWorkflow: Boolean(config.workflow),
  };
}

export function extractComfyExecutionErrorMessage(
  entry: ComfyHistoryEntry,
): string | undefined {
  const messages = entry.status?.messages;
  if (!Array.isArray(messages)) {
    return undefined;
  }

  for (const message of messages) {
    if (!Array.isArray(message) || message[0] !== "execution_error") {
      continue;
    }
    const payload = message[1];
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const exceptionMessage =
      typeof payload.exception_message === "string"
        ? payload.exception_message.trim()
        : "";
    const nodeType =
      typeof payload.node_type === "string" ? payload.node_type.trim() : "";
    const nodeId =
      typeof payload.node_id === "string" || typeof payload.node_id === "number"
        ? String(payload.node_id).trim()
        : "";

    if (exceptionMessage) {
      const prefix = [nodeType, nodeId ? `#${nodeId}` : ""]
        .filter(Boolean)
        .join(" ");
      return prefix ? `${prefix}: ${exceptionMessage}` : exceptionMessage;
    }
  }

  return undefined;
}

function interpretHistoryEntry(
  promptId: string,
  comfyUrl: string,
  entry: ComfyHistoryEntry,
): ComfyPromptStatus {
  const statusStr = entry.status?.status_str?.toLowerCase() ?? "";
  const images = extractImagesFromOutputs(entry.outputs);
  const completed = entry.status?.completed === true || images.length > 0;
  const executionError = extractComfyExecutionErrorMessage(entry);

  if (completed) {
    return {
      promptId,
      status: "completed",
      statusMessage: statusStr || "completed",
      comfyUrl,
      images,
    };
  }

  if (statusStr.includes("error") || executionError) {
    return {
      promptId,
      status: "error",
      statusMessage: executionError ?? statusStr,
      comfyUrl,
      images,
    };
  }

  if (statusStr.includes("running") || statusStr.includes("execut")) {
    return {
      promptId,
      status: "running",
      statusMessage: statusStr,
      comfyUrl,
    };
  }

  return {
    promptId,
    status: "pending",
    statusMessage: statusStr || "pending",
    comfyUrl,
  };
}

function extractWorkflowFromHistoryEntry(
  entry: ComfyHistoryEntry,
): Record<string, unknown> | null {
  const promptField = entry.prompt;
  if (!Array.isArray(promptField) || promptField.length < 3) {
    return null;
  }
  const workflow = promptField[2];
  if (!workflow || typeof workflow !== "object") {
    return null;
  }
  return workflow as Record<string, unknown>;
}

function extractPromptFromHistoryEntry(entry: ComfyHistoryEntry): {
  positive?: string;
  negative?: string;
} {
  const workflow = extractWorkflowFromHistoryEntry(entry);
  if (!workflow) {
    return {};
  }

  const texts: string[] = [];
  for (const node of Object.values(
    workflow as Record<string, { inputs?: Record<string, unknown> }>,
  )) {
    const text = typeof node.inputs?.text === "string" ? node.inputs.text.trim() : "";
    if (text) {
      texts.push(text);
    }
  }

  return {
    positive: texts[0],
    negative: texts[1],
  };
}

function extractCheckpointHintFromWorkflow(
  workflow: Record<string, unknown>,
): string | undefined {
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    const ckpt =
      typeof inputs?.ckpt_name === "string"
        ? inputs.ckpt_name.trim()
        : typeof inputs?.unet_name === "string"
          ? inputs.unet_name.trim()
          : "";
    if (ckpt && !ckpt.includes("{{")) {
      return ckpt;
    }
  }
  return undefined;
}

export async function listComfyUiHistoryImports(
  runtime?: ComfyUiRuntimeConfig,
  limit = 40,
): Promise<ComfyHistoryImportItem[]> {
  const comfyUrl = getComfyUiBaseUrl(runtime);

  try {
    const response = await fetch(`${comfyUrl}/history`, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return [];
    }

    const history = (await response.json()) as Record<string, ComfyHistoryEntry>;
    const items: ComfyHistoryImportItem[] = [];

    for (const [promptId, entry] of Object.entries(history)) {
      const status = interpretHistoryEntry(promptId, comfyUrl, entry);
      if (status.status !== "completed" || !status.images?.length) {
        continue;
      }

      const workflow = extractWorkflowFromHistoryEntry(entry);
      const extracted = extractPromptFromHistoryEntry(entry);
      const queueParams = workflow ? extractParamsFromWorkflow(workflow) : undefined;
      const hasParams = queueParams && Object.keys(queueParams).length > 0;
      items.push({
        promptId,
        prompt:
          extracted.positive?.trim() ||
          `Imported ComfyUI job ${promptId.slice(0, 8)}`,
        negativePrompt: extracted.negative,
        comfyUrl,
        images: status.images,
        statusMessage: status.statusMessage,
        queueParams: hasParams ? queueParams : undefined,
        model: workflow ? extractCheckpointHintFromWorkflow(workflow) : undefined,
        workflowJson: workflow ? JSON.stringify(workflow) : undefined,
      });
    }

    return items
      .sort((left, right) => right.promptId.localeCompare(left.promptId))
      .slice(0, limit);
  } catch {
    return [];
  }
}
