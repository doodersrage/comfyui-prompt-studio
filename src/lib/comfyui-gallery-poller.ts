"use client";

import {
  pollComfyGalleryJob,
  type PollComfyGalleryJobOptions,
} from "./comfyui-gallery-client";
import { loadComfyGallery, type ComfyGalleryEntry } from "./comfyui-gallery";

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
  const promise = pollComfyGalleryJob(trimmed, options?.onStatus, {
    ...options,
    comfyUrl: options?.comfyUrl ?? entry?.comfyUrl,
    onJobUpdate: options?.onJobUpdate,
  }).finally(() => {
    activePolls.delete(trimmed);
  });

  activePolls.set(trimmed, promise);
  return promise;
}

export function resumePendingGalleryPolls(): void {
  if (typeof window === "undefined") {
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
