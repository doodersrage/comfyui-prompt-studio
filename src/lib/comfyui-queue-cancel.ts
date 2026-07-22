"use client";

import { updateComfyGalleryEntryById, type ComfyGalleryEntry } from "./comfyui-gallery";
import { cancelComfyGalleryPoll } from "./comfyui-gallery-poller";
import {
  deleteComfyQueuePrompt,
  interruptComfyUiQueue,
  type ComfyQueueActionResult,
} from "./comfyui-queue-control";

export type CancelComfyGalleryJobInput = Pick<
  ComfyGalleryEntry,
  "id" | "promptId" | "comfyUrl" | "status"
>;

/**
 * Cancels a pending or running gallery job: interrupts ComfyUI first when the
 * job is the one currently executing, deletes it from the queue, stops any
 * in-flight local poller, and marks the gallery entry as cancelled.
 */
export async function cancelComfyGalleryJob(
  entry: CancelComfyGalleryJobInput,
): Promise<ComfyQueueActionResult> {
  const promptId = entry.promptId?.trim();
  if (!promptId) {
    return { ok: false, error: "Missing prompt id." };
  }

  if (entry.status === "running") {
    // Best-effort — still attempt the queue delete below even if this fails.
    await interruptComfyUiQueue(entry.comfyUrl);
  }

  const deleted = await deleteComfyQueuePrompt({
    promptId,
    comfyUrl: entry.comfyUrl,
  });

  cancelComfyGalleryPoll(promptId);

  updateComfyGalleryEntryById(entry.id, {
    status: "error",
    statusMessage: "Cancelled",
    queuePosition: null,
    progressValue: undefined,
    progressMax: undefined,
    progressNode: undefined,
    completedAt: Date.now(),
  });

  return deleted;
}
