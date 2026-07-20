import type { ComfyHistoryImportItem } from "./comfyui-status";
import {
  addComfyGalleryEntry,
  loadComfyGallery,
  saveComfyGallery,
  updateComfyGalleryByPromptId,
  type ComfyGalleryEntry,
  type ComfyGalleryJobStatus,
} from "./comfyui-gallery";
import {
  formatComfyUiJobStatusLine,
  type ComfyUiJobTrackerState,
} from "./comfyui-job-status";
import { notifyComfyJobComplete } from "./comfyui-notifications";
import { resolveComfyUiRuntime } from "./comfyui-runtime";
import { loadComfyUiSettings } from "./comfyui-settings";
import { subscribeComfyUiWebSocket } from "./comfyui-websocket";
import { dispatchWebhook } from "./webhook-settings";
import { noteScheduledBatchJobComplete } from "./scheduled-batch-tracker";
import { noteJobCompletionEmail } from "./job-completion-email";
import { autoTagGalleryEntry } from "./gallery-auto-vision-tags";
import type { WorkflowParamValues } from "./comfyui-config";
import { buildGalleryImageUrlsFromQueueParams } from "./queue-requeue-images";

export type RegisterComfyGalleryJobInput = {
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  historyId?: string;
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  queueQualityProfile?: import("./queue-quality-profile").QueueQualityProfile;
  projectId?: string;
  comfyUrl: string;
};

export type PollComfyGalleryJobOptions = {
  comfyUrl?: string;
  maxAttempts?: number;
  intervalMs?: number;
  onJobUpdate?: (job: ComfyUiJobTrackerState) => void;
};

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 450;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resolveComfyUrlForJob(promptId: string, comfyUrl?: string): string | undefined {
  return (
    comfyUrl?.trim().replace(/\/+$/, "") ||
    loadComfyGallery()
      .find((entry) => entry.promptId === promptId)
      ?.comfyUrl?.trim()
      .replace(/\/+$/, "") ||
    resolveComfyUiRuntime()?.apiUrl?.trim().replace(/\/+$/, "")
  );
}

export function registerComfyGalleryJob(
  input: RegisterComfyGalleryJobInput,
): ComfyGalleryEntry {
  const imageUrls = buildGalleryImageUrlsFromQueueParams({
    comfyUrl: input.comfyUrl,
    queueParams: input.queueParams,
    sourceImageUrl: input.sourceImageUrl,
    maskImageUrl: input.maskImageUrl,
  });

  return addComfyGalleryEntry({
    promptId: input.promptId,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    tool: input.tool,
    model: input.model,
    historyId: input.historyId,
    queueParams: input.queueParams,
    sourceImageUrl: imageUrls.sourceImageUrl,
    maskImageUrl: imageUrls.maskImageUrl,
    queueQualityProfile: input.queueQualityProfile,
    projectId: input.projectId,
    comfyUrl: input.comfyUrl,
    status: "pending",
    statusMessage: "Queued",
  });
}

export function importComfyGalleryFromHistory(
  items: ComfyHistoryImportItem[],
): { imported: number; skipped: number } {
  const existing = loadComfyGallery();
  const known = new Set(existing.map((entry) => entry.promptId));
  const imported: ComfyGalleryEntry[] = [];
  let skipped = 0;

  for (const item of items) {
    if (known.has(item.promptId)) {
      skipped += 1;
      continue;
    }

    imported.push({
      id: crypto.randomUUID(),
      promptId: item.promptId,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      tool: "comfyui-import",
      comfyUrl: item.comfyUrl,
      status: "completed",
      statusMessage: item.statusMessage ?? "Imported from ComfyUI history",
      queuedAt: Date.now(),
      completedAt: Date.now(),
      images: item.images,
    });
    known.add(item.promptId);
  }

  if (imported.length > 0) {
    saveComfyGallery([...imported, ...existing]);
  }

  return { imported: imported.length, skipped };
}

export async function fetchComfyHistoryImports(limit = 40) {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`/api/comfyui/history?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Could not load ComfyUI history.");
  }
  return (await response.json()) as {
    items: ComfyHistoryImportItem[];
    count: number;
    comfyUrl?: string;
  };
}

export async function fetchComfyJobStatus(
  promptId: string,
  comfyUrl?: string,
) {
  const params = new URLSearchParams({ promptId });
  const resolvedUrl = resolveComfyUrlForJob(promptId, comfyUrl);
  if (resolvedUrl) {
    params.set("comfyUrl", resolvedUrl);
  }

  const response = await fetch(`/api/comfyui/status?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  return (await response.json()) as {
    status?: string;
    statusMessage?: string;
    comfyUrl?: string;
    queuePosition?: number | null;
    images?: ComfyGalleryEntry["images"];
  };
}

function normalizeTrackerStatus(
  status: string | undefined,
): ComfyGalleryJobStatus | null {
  if (
    status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "error"
  ) {
    return status;
  }

  return null;
}

function buildTrackerState(
  promptId: string,
  status: NonNullable<Awaited<ReturnType<typeof fetchComfyJobStatus>>>,
): ComfyUiJobTrackerState | null {
  const normalized = normalizeTrackerStatus(status.status);
  if (!normalized) {
    return null;
  }

  return {
    promptId,
    status: normalized,
    statusMessage: status.statusMessage,
    comfyUrl: status.comfyUrl,
    queuePosition: status.queuePosition,
    imageCount: status.images?.length,
  };
}

function applyComfyJobStatus(
  promptId: string,
  status: NonNullable<Awaited<ReturnType<typeof fetchComfyJobStatus>>>,
  onStatus?: (message: string) => void,
  onJobUpdate?: (job: ComfyUiJobTrackerState) => void,
): ComfyGalleryEntry | null {
  const tracker = buildTrackerState(promptId, status);
  if (!tracker) {
    return null;
  }

  onJobUpdate?.(tracker);
  onStatus?.(formatComfyUiJobStatusLine(tracker));

  if (tracker.status === "running" || tracker.status === "pending") {
    updateComfyGalleryByPromptId(promptId, {
      status: tracker.status,
      statusMessage: tracker.statusMessage,
      queuePosition: tracker.queuePosition,
      comfyUrl: tracker.comfyUrl,
    });
    return null;
  }

  if (tracker.status === "error") {
    const entry = updateComfyGalleryByPromptId(promptId, {
      status: "error",
      statusMessage: tracker.statusMessage,
      queuePosition: null,
      completedAt: Date.now(),
      comfyUrl: tracker.comfyUrl,
    });
    if (entry) {
      noteJobCompletionEmail({
        promptId,
        status: "error",
        prompt: entry.prompt,
      });
      void dispatchWebhook({
        event: "comfyui.job.error",
        promptId,
        prompt: entry.prompt,
        negativePrompt: entry.negativePrompt,
        model: entry.model,
        tool: entry.tool,
        status: entry.status,
        completedAt: Date.now(),
      });
    }
    return entry;
  }

  const entry = updateComfyGalleryByPromptId(promptId, {
    status: "completed",
    statusMessage: tracker.statusMessage,
    queuePosition: null,
    completedAt: Date.now(),
    comfyUrl: tracker.comfyUrl,
    images: status.images ?? [],
  });
  if (entry && loadComfyUiSettings().notifyOnComplete) {
    notifyComfyJobComplete(entry);
  }
  if (entry?.status === "completed") {
    noteJobCompletionEmail({
      promptId,
      status: "completed",
      prompt: entry.prompt,
    });
    void autoTagGalleryEntry(entry);
    noteScheduledBatchJobComplete(entry.tool);
    void dispatchWebhook({
      event: "comfyui.job.completed",
      promptId,
      prompt: entry.prompt,
      negativePrompt: entry.negativePrompt,
      model: entry.model,
      tool: entry.tool,
      status: entry.status,
      imageCount: entry.images.length,
      queueParams: entry.queueParams,
      completedAt: entry.completedAt ?? Date.now(),
    });
  }
  return entry;
}

export async function pollComfyGalleryJob(
  promptId: string,
  onStatus?: (message: string) => void,
  options?: PollComfyGalleryJobOptions,
): Promise<ComfyGalleryEntry | null> {
  const comfyUrl = resolveComfyUrlForJob(promptId, options?.comfyUrl);
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;
  const intervalMs = options?.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const onJobUpdate = options?.onJobUpdate;
  const settings = loadComfyUiSettings();
  let wsFinished = false;
  let unsubscribe: (() => void) | undefined;

  if (settings.useWebSocketProgress && comfyUrl) {
    unsubscribe = subscribeComfyUiWebSocket({
      comfyUrl,
      promptId,
      onProgress: (progress) => {
        if (progress.message) {
          onStatus?.(progress.message);
        }
        if (progress.status === "finished") {
          wsFinished = true;
        }
      },
    });
  }

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(wsFinished ? 250 : intervalMs);
      }

      try {
        const status = await fetchComfyJobStatus(promptId, comfyUrl);
        if (!status) {
          continue;
        }

        const entry = applyComfyJobStatus(
          promptId,
          status,
          onStatus,
          onJobUpdate,
        );
        if (entry) {
          return entry;
        }
      } catch {
        // keep polling
      }
    }
  } finally {
    unsubscribe?.();
  }

  return updateComfyGalleryByPromptId(promptId, {
    status: "running",
    statusMessage: "Still processing in ComfyUI — checking continues in background",
    queuePosition: null,
    comfyUrl,
  });
}
