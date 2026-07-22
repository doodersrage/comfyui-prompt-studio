"use client";

import {
  cancelComfyGalleryJobPoll,
  pollComfyGalleryJob,
  type PollComfyGalleryJobOptions,
} from "./comfyui-gallery-client";
import {
  loadComfyGallery,
  updateComfyGalleryByPromptId,
  type ComfyGalleryEntry,
} from "./comfyui-gallery";
import {
  forgetPendingGalleryPoll,
  listPendingGalleryPollMeta,
  rememberPendingGalleryPoll,
} from "./gallery-pending-polls";

export {
  scheduleRefineAfterUpscaleComplete,
  consumePendingRefineAfterUpscale,
} from "./gallery-pending-actions";

const activePolls = new Map<string, Promise<ComfyGalleryEntry | null>>();

export type ScheduleComfyGalleryPollOptions = PollComfyGalleryJobOptions & {
  onStatus?: (message: string) => void;
};

export function scheduleComfyGalleryPoll(
  promptId: string,
  options?: ScheduleComfyGalleryPollOptions,
): Promise<ComfyGalleryEntry | null> {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return Promise.resolve(null);
  }

  const existing = activePolls.get(trimmed);
  if (existing) {
    return existing;
  }

  const entry = loadComfyGallery().find((item) => item.promptId === trimmed);
  const comfyUrl = options?.comfyUrl ?? entry?.comfyUrl;
  const clientId = options?.clientId?.trim() || entry?.clientId?.trim();
  if (clientId && !entry?.clientId?.trim()) {
    updateComfyGalleryByPromptId(trimmed, { clientId });
  }
  rememberPendingGalleryPoll(trimmed, comfyUrl);

  const promise = pollComfyGalleryJob(trimmed, options?.onStatus, {
    ...options,
    comfyUrl,
    clientId,
    onJobUpdate: options?.onJobUpdate,
  })
    .then((result) => {
      if (!result || result.status === "completed" || result.status === "error") {
        forgetPendingGalleryPoll(trimmed);
      }
      return result;
    })
    .finally(() => {
      activePolls.delete(trimmed);
    });

  activePolls.set(trimmed, promise);
  return promise;
}

export function resumePendingGalleryPolls(): void {
  if (typeof window === "undefined") {
    return;
  }

  const pendingMeta = listPendingGalleryPollMeta();
  if (pendingMeta.length > 0) {
    for (const item of pendingMeta) {
      void scheduleComfyGalleryPoll(item.promptId, { comfyUrl: item.comfyUrl });
    }
    return;
  }

  for (const entry of loadComfyGallery()) {
    if (entry.status === "pending" || entry.status === "running") {
      void scheduleComfyGalleryPoll(entry.promptId, { comfyUrl: entry.comfyUrl });
    }
  }
}

export function isComfyGalleryPollActive(promptId: string): boolean {
  return activePolls.has(promptId.trim());
}

/** Stops any in-flight poll for a cancelled job and forgets its resume metadata. */
export function cancelComfyGalleryPoll(promptId: string): void {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return;
  }
  cancelComfyGalleryJobPoll(trimmed);
  forgetPendingGalleryPoll(trimmed);
  activePolls.delete(trimmed);
}
