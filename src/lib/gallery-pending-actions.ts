import type { QueueQualityProfile } from "./queue-quality-profile";

const pendingRefineAfterUpscale = new Map<
  string,
  { qualityProfile: Extract<QueueQualityProfile, "final" | "max"> }
>();

export function scheduleRefineAfterUpscaleComplete(
  promptId: string,
  qualityProfile: Extract<QueueQualityProfile, "final" | "max">,
): void {
  const trimmed = promptId.trim();
  if (!trimmed) {
    return;
  }
  pendingRefineAfterUpscale.set(trimmed, { qualityProfile });
}

export function consumePendingRefineAfterUpscale(
  promptId: string,
): { qualityProfile: Extract<QueueQualityProfile, "final" | "max"> } | undefined {
  const trimmed = promptId.trim();
  const pending = pendingRefineAfterUpscale.get(trimmed);
  pendingRefineAfterUpscale.delete(trimmed);
  return pending;
}
