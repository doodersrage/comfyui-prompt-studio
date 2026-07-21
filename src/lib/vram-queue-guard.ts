import type { ComfyUiRuntimeConfig } from "./comfyui-config";
import type { QueueQualityProfile } from "./queue-quality-profile";
import { normalizeQueueQualityProfile } from "./queue-quality-profile";

/** Free VRAM below this (bytes) → Max enrich is too heavy for most 24GB cards mid-queue. */
export const MAX_VRAM_FREE_BYTES_THRESHOLD = 6 * 1e9;

export type VramSnapshot = { free?: number; total?: number };

export function isVramTightForMax(vram?: VramSnapshot | null): boolean {
  const free = vram?.free;
  if (typeof free !== "number" || !Number.isFinite(free)) {
    return false;
  }
  return free < MAX_VRAM_FREE_BYTES_THRESHOLD;
}

/**
 * When Max would run and free VRAM is tight, downgrade to Final (skip neural/refiner peak).
 */
export function maybeDowngradeMaxForVram(
  profile: QueueQualityProfile | undefined,
  vram?: VramSnapshot | null,
): { profile: QueueQualityProfile; downgraded: boolean } {
  const normalized = normalizeQueueQualityProfile(profile);
  if (normalized !== "max" || !isVramTightForMax(vram)) {
    return { profile: normalized, downgraded: false };
  }
  return { profile: "final", downgraded: true };
}

export async function fetchComfyVramSnapshot(): Promise<VramSnapshot | null> {
  try {
    const response = await fetch("/api/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as {
      comfyui?: { vram?: VramSnapshot };
    };
    return data.comfyui?.vram ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch VRAM + downgrade Max→Final on a runtime (and optional override profile).
 * Use before every /api/comfyui post that may run Max enrich.
 */
export async function guardQueueQualityForVram(input: {
  profile?: QueueQualityProfile;
  runtime?: ComfyUiRuntimeConfig;
}): Promise<{
  profile: QueueQualityProfile;
  runtime?: ComfyUiRuntimeConfig;
  downgraded: boolean;
}> {
  const base =
    input.profile ??
    input.runtime?.queueQualityProfile ??
    normalizeQueueQualityProfile(undefined);
  const vram = await fetchComfyVramSnapshot();
  const guard = maybeDowngradeMaxForVram(base, vram);
  return {
    profile: guard.profile,
    downgraded: guard.downgraded,
    runtime: input.runtime
      ? { ...input.runtime, queueQualityProfile: guard.profile }
      : undefined,
  };
}
