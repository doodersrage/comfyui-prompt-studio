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
import { clearComfyLivePreviewUrl } from "./comfyui-live-preview-store";
import {
  subscribeComfyUiWebSocket,
  type ComfyUiWebSocketSubscription,
} from "./comfyui-websocket";
import { dispatchWebhook } from "./webhook-settings";
import { noteScheduledBatchJobComplete } from "./scheduled-batch-tracker";
import { noteJobCompletionEmail } from "./job-completion-email";
import { autoTagGalleryEntry } from "./gallery-auto-vision-tags";
import { backfillHistoryGalleryLink } from "./prompt-lineage";
import { consumePendingRefineAfterUpscale } from "./gallery-pending-actions";
import type { WorkflowParamValues } from "./comfyui-config";
import { buildGalleryImageUrlsFromQueueParams } from "./queue-requeue-images";
import { freeComfyUiMemory } from "./comfyui-queue-control";
import { normalizeQueueQualityProfile } from "./queue-quality-profile";
import { loadSettingsCache } from "./settings-cache";
import { attemptOomAutoRetry } from "./oom-retry";
import { resolveGalleryRenderDurationMs } from "./comfyui-render-duration";

export type RegisterComfyGalleryJobInput = {
  promptId: string;
  prompt: string;
  negativePrompt?: string;
  tool?: string;
  model?: string;
  historyId?: string;
  parentGalleryEntryId?: string;
  derivedKind?: ComfyGalleryEntry["derivedKind"];
  queueParams?: WorkflowParamValues;
  sourceImageUrl?: string;
  maskImageUrl?: string;
  queueQualityProfile?: import("./queue-quality-profile").QueueQualityProfile;
  /** Session LoRA ids active at queue time (for re-edit same stack). */
  sessionActiveLoraIds?: string[];
  projectId?: string;
  comfyUrl: string;
  clientId?: string;
};

export type PollComfyGalleryJobOptions = {
  comfyUrl?: string;
  /** Must match the client_id used when the prompt was queued. */
  clientId?: string;
  maxAttempts?: number;
  intervalMs?: number;
  onJobUpdate?: (job: ComfyUiJobTrackerState) => void;
};

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_MAX_POLL_ATTEMPTS = 450;

/** Prompt IDs whose in-flight poll loop should stop on the next tick (e.g. cancelled jobs). */
const cancelledPollPromptIds = new Set<string>();

/** Marks an in-flight `pollComfyGalleryJob` loop for the given prompt to stop early. */
export function cancelComfyGalleryJobPoll(promptId: string): void {
  const trimmed = promptId.trim();
  if (trimmed) {
    cancelledPollPromptIds.add(trimmed);
  }
}

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

  const entry = addComfyGalleryEntry({
    promptId: input.promptId,
    prompt: input.prompt,
    negativePrompt: input.negativePrompt,
    tool: input.tool,
    model: input.model,
    historyId: input.historyId,
    parentGalleryEntryId: input.parentGalleryEntryId,
    derivedKind: input.derivedKind,
    queueParams: input.queueParams,
    sourceImageUrl: imageUrls.sourceImageUrl,
    maskImageUrl: imageUrls.maskImageUrl,
    queueQualityProfile: input.queueQualityProfile,
    sessionActiveLoraIds: input.sessionActiveLoraIds,
    projectId: input.projectId,
    comfyUrl: input.comfyUrl,
    clientId: input.clientId,
    status: "pending",
    statusMessage: "Queued",
  });
  backfillHistoryGalleryLink(entry);
  return entry;
}

/** Pure merge for history → gallery (import + upgrade thin duplicates). */
export function mergeHistoryImportItems(
  existing: ComfyGalleryEntry[],
  items: ComfyHistoryImportItem[],
  createId: () => string = () => crypto.randomUUID(),
  now: () => number = () => Date.now(),
): {
  entries: ComfyGalleryEntry[];
  imported: number;
  upgraded: number;
  skipped: number;
} {
  const nextExisting = existing.map((entry) => ({ ...entry }));
  const byPromptId = new Map(nextExisting.map((entry) => [entry.promptId, entry]));
  const imported: ComfyGalleryEntry[] = [];
  let upgraded = 0;
  let skipped = 0;

  for (const item of items) {
    const prior = byPromptId.get(item.promptId);
    if (prior) {
      const needsParams = !prior.queueParams || Object.keys(prior.queueParams).length === 0;
      if (needsParams && item.queueParams && Object.keys(item.queueParams).length > 0) {
        prior.queueParams = item.queueParams;
        if (!prior.model?.trim() && item.model?.trim()) {
          prior.model = item.model;
        }
        if (!prior.negativePrompt?.trim() && item.negativePrompt?.trim()) {
          prior.negativePrompt = item.negativePrompt;
        }
        prior.statusMessage = item.statusMessage ?? prior.statusMessage;
        upgraded += 1;
      } else {
        skipped += 1;
      }
      continue;
    }

    const entry: ComfyGalleryEntry = {
      id: createId(),
      promptId: item.promptId,
      prompt: item.prompt,
      negativePrompt: item.negativePrompt,
      model: item.model,
      tool: "comfyui-import",
      comfyUrl: item.comfyUrl,
      status: "completed",
      statusMessage: item.statusMessage ?? "Imported from ComfyUI history",
      queuedAt: item.executionStartedAt ?? now(),
      completedAt:
        item.executionStartedAt != null && item.renderDurationMs != null
          ? item.executionStartedAt + item.renderDurationMs
          : now(),
      ...(item.renderDurationMs != null
        ? { renderDurationMs: item.renderDurationMs }
        : {}),
      ...(item.executionStartedAt != null
        ? { executionStartedAt: item.executionStartedAt }
        : {}),
      images: item.images,
      queueParams: item.queueParams,
    };
    imported.push(entry);
    byPromptId.set(item.promptId, entry);
  }

  return {
    entries: [...imported, ...nextExisting],
    imported: imported.length,
    upgraded,
    skipped,
  };
}

export function importComfyGalleryFromHistory(
  items: ComfyHistoryImportItem[],
): { imported: number; upgraded: number; skipped: number } {
  const existing = loadComfyGallery();
  const merged = mergeHistoryImportItems(existing, items);
  if (merged.imported > 0 || merged.upgraded > 0) {
    saveComfyGallery(merged.entries);
  }
  return {
    imported: merged.imported,
    upgraded: merged.upgraded,
    skipped: merged.skipped,
  };
}

export async function fetchComfyHistoryImports(limit = 40, comfyUrl?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  const sticky = comfyUrl?.trim();
  if (sticky) {
    params.set("comfyUrl", sticky);
  }
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
    renderDurationMs?: number;
    executionStartedAt?: number;
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
    clearComfyLivePreviewUrl(promptId);
    const completedAt = Date.now();
    const prior = loadComfyGallery().find((item) => item.promptId === promptId);
    const renderDurationMs = resolveGalleryRenderDurationMs({
      renderDurationMs: status.renderDurationMs,
      queuedAt: prior?.queuedAt,
      completedAt,
    });
    const entry = updateComfyGalleryByPromptId(promptId, {
      status: "error",
      statusMessage: tracker.statusMessage,
      queuePosition: null,
      progressValue: undefined,
      progressMax: undefined,
      progressNode: undefined,
      completedAt,
      ...(status.executionStartedAt != null
        ? { executionStartedAt: status.executionStartedAt }
        : {}),
      ...(renderDurationMs != null ? { renderDurationMs } : {}),
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
      // Best-effort — never blocks the error path or surfaces failures to the user.
      void attemptOomAutoRetry(entry, tracker.statusMessage, onStatus);
    }
    return entry;
  }

  clearComfyLivePreviewUrl(promptId);
  const completedAt = Date.now();
  const priorCompleted = loadComfyGallery().find(
    (item) => item.promptId === promptId,
  );
  const renderDurationMs = resolveGalleryRenderDurationMs({
    renderDurationMs: status.renderDurationMs,
    queuedAt: priorCompleted?.queuedAt,
    completedAt,
  });
  const entry = updateComfyGalleryByPromptId(promptId, {
    status: "completed",
    statusMessage: tracker.statusMessage,
    queuePosition: null,
    progressValue: undefined,
    progressMax: undefined,
    progressNode: undefined,
    completedAt,
    ...(status.executionStartedAt != null
      ? { executionStartedAt: status.executionStartedAt }
      : {}),
    ...(renderDurationMs != null ? { renderDurationMs } : {}),
    comfyUrl: tracker.comfyUrl,
    images: status.images ?? [],
  });
  if (entry && loadComfyUiSettings().notifyOnComplete) {
    notifyComfyJobComplete(entry);
  }
  if (entry?.status === "completed") {
    backfillHistoryGalleryLink(entry);
    noteJobCompletionEmail({
      promptId,
      status: "completed",
      prompt: entry.prompt,
    });
    if (
      loadSettingsCache().shared.freeVramAfterMax === true &&
      normalizeQueueQualityProfile(entry.queueQualityProfile) === "max"
    ) {
      // Best-effort — never blocks the completion path or surfaces errors to the user.
      void freeComfyUiMemory(entry.comfyUrl);
    }
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

    const pendingRefine = consumePendingRefineAfterUpscale(promptId);
    if (pendingRefine && entry.derivedKind === "upscale") {
      void import("./comfyui-requeue").then(({ requeueRefineFromGalleryEntry }) =>
        requeueRefineFromGalleryEntry(entry, {
          qualityProfile: pendingRefine.qualityProfile,
          onStatus,
        }),
      );
    }
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
  let wsSubscription: ComfyUiWebSocketSubscription | undefined;
  let lastProgressWriteAt = 0;
  let trailingProgressTimer: number | null = null;
  let latestProgress: {
    value?: number;
    max?: number;
    node?: string | null;
    message?: string;
  } | null = null;

  const clearTrailingProgress = () => {
    if (trailingProgressTimer != null) {
      window.clearTimeout(trailingProgressTimer);
      trailingProgressTimer = null;
    }
  };

  const publishProgress = (force = false) => {
    if (!latestProgress) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastProgressWriteAt < 250) {
      if (trailingProgressTimer == null) {
        trailingProgressTimer = window.setTimeout(() => {
          trailingProgressTimer = null;
          publishProgress(true);
        }, 250);
      }
      return;
    }

    lastProgressWriteAt = now;
    clearTrailingProgress();

    const tracker: ComfyUiJobTrackerState = {
      promptId,
      status: "running",
      statusMessage: latestProgress.message ?? "Running in ComfyUI",
      comfyUrl,
      queuePosition: 0,
      progressValue: latestProgress.value,
      progressMax: latestProgress.max,
      progressNode: latestProgress.node,
    };
    onJobUpdate?.(tracker);
    onStatus?.(formatComfyUiJobStatusLine(tracker));
    updateComfyGalleryByPromptId(promptId, {
      status: "running",
      statusMessage: tracker.statusMessage,
      queuePosition: 0,
      progressValue: tracker.progressValue,
      progressMax: tracker.progressMax,
      progressNode: tracker.progressNode,
      comfyUrl,
    });
  };

  // Prefer explicit option, then gallery entry — must match /prompt client_id.
  if (settings.useWebSocketProgress !== false && comfyUrl) {
    const clientId =
      options?.clientId?.trim() ||
      loadComfyGallery()
        .find((entry) => entry.promptId === promptId)
        ?.clientId?.trim();
    wsSubscription = subscribeComfyUiWebSocket({
      // Live bridge resolves Comfy server-side; pass entry URL only as a hint.
      comfyUrl,
      promptId,
      clientId,
      onProgress: (progress) => {
        if (progress.status === "preview" && progress.previewUrl) {
          // Type-4 frames carry prompt_id; ignore frames for other jobs on a shared socket.
          if (
            progress.promptId &&
            progress.promptId !== promptId &&
            progress.promptId !== clientId
          ) {
            return;
          }
          // Preview bytes are already in the live-preview store from the bridge client.
          const tracker: ComfyUiJobTrackerState = {
            promptId,
            status: "running",
            statusMessage: latestProgress?.message ?? "Live preview",
            comfyUrl,
            queuePosition: 0,
            progressValue: latestProgress?.value,
            progressMax: latestProgress?.max,
            progressNode: latestProgress?.node,
            previewUrl: progress.previewUrl,
          };
          onJobUpdate?.(tracker);
          return;
        }

        if (progress.status === "finished") {
          wsFinished = true;
          clearTrailingProgress();
          if (progress.message) {
            onStatus?.(progress.message);
          }
          return;
        }

        if (progress.status === "error") {
          if (progress.message) {
            onStatus?.(progress.message);
          }
          return;
        }

        latestProgress = {
          value: progress.value ?? latestProgress?.value,
          max: progress.max ?? latestProgress?.max,
          node:
            progress.node !== undefined
              ? progress.node
              : latestProgress?.node,
          message: progress.message ?? latestProgress?.message,
        };
        publishProgress();
      },
    });
  }

  let cancelled = false;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (cancelledPollPromptIds.has(promptId)) {
        cancelled = true;
        break;
      }

      if (attempt > 0) {
        await sleep(wsFinished ? 250 : intervalMs);
        if (cancelledPollPromptIds.has(promptId)) {
          cancelled = true;
          break;
        }
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
    clearTrailingProgress();
    wsSubscription?.close();
    cancelledPollPromptIds.delete(promptId);
  }

  if (cancelled) {
    return null;
  }

  return updateComfyGalleryByPromptId(promptId, {
    status: "running",
    statusMessage: "Still processing in ComfyUI — checking continues in background",
    queuePosition: null,
    comfyUrl,
  });
}
