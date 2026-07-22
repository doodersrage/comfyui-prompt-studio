/**
 * OOM / execution_error auto-retry + pool failover.
 *
 * `isOomOrExecutionErrorMessage` / `decideOomRetry` are pure and unit-tested
 * directly. `attemptOomAutoRetry` is the orchestration hook wired into the
 * gallery job error path (comfyui-gallery-client.ts) — it loads settings,
 * marks the failed entry so it can only auto-retry once, and re-queues via a
 * dynamic import of comfyui-requeue.ts (kept dynamic to avoid a circular
 * import, since comfyui-requeue.ts imports comfyui-gallery-client.ts).
 */

import type { ComfyGalleryEntry } from "./comfyui-gallery-entry";
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from "./queue-quality-profile";

const OOM_OR_EXECUTION_ERROR_PATTERN =
  /out[\s_-]*of[\s_-]*memory|\boom\b|cuda (error|out of memory)|cuda_error|allocat\w* .*(memory|failed)|insufficient (gpu )?memory|execution_?error|runtimeerror|vram/i;

/** Detects OOM / CUDA / out-of-memory / execution_error signatures in a gallery job failure message. */
export function isOomOrExecutionErrorMessage(
  message: string | undefined | null,
): boolean {
  const text = message?.trim();
  if (!text) {
    return false;
  }
  return OOM_OR_EXECUTION_ERROR_PATTERN.test(text);
}

/** Max → Final → Draft on retry; Draft/followSettings have no lower tier to fall back to. */
export function downgradeQueueQualityProfile(
  profile: QueueQualityProfile | undefined,
): QueueQualityProfile | null {
  const normalized = normalizeQueueQualityProfile(profile);
  if (normalized === "max") {
    return "final";
  }
  if (normalized === "final") {
    return "draft";
  }
  return null;
}

function normalizeUrlForCompare(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/** First pool URL that isn't (a normalized match of) the current endpoint, or `undefined`. */
export function pickAlternateComfyUrl(
  poolUrls: string[] | undefined,
  currentUrl: string | undefined,
): string | undefined {
  if (!poolUrls || poolUrls.length < 2) {
    return undefined;
  }
  const currentNormalized = currentUrl ? normalizeUrlForCompare(currentUrl) : "";
  return poolUrls.find(
    (url) => url.trim() && normalizeUrlForCompare(url) !== currentNormalized,
  );
}

export type OomRetryDecision =
  | { action: "none"; reason: string }
  | { action: "downgrade"; nextProfile: QueueQualityProfile; reason: string }
  | { action: "switch-endpoint"; nextComfyUrl: string; reason: string }
  | {
      action: "downgrade-and-switch";
      nextProfile: QueueQualityProfile;
      nextComfyUrl: string;
      reason: string;
    };

export type DecideOomRetryInput = {
  /** Gallery job failure message (statusMessage / error text). */
  statusMessage?: string | null;
  /** Quality profile the failed job was queued with. */
  queueQualityProfile?: QueueQualityProfile;
  /** True once this entry has already been auto-retried (never retry twice). */
  alreadyRetried?: boolean;
  /** `autoRetryOnOom` shared setting — defaults to enabled. */
  autoRetryOnOom?: boolean;
  /** `oomRetryDowngrade` shared setting — defaults to enabled. */
  downgradeEnabled?: boolean;
  /** Known ComfyUI pool endpoint URLs, when a pool is configured. */
  poolUrls?: string[];
  /** The endpoint the failed job ran on. */
  currentComfyUrl?: string;
};

/**
 * Pure decision helper: given a failure message + context, decides whether
 * to auto-retry, and how (downgrade quality, switch to an alternate pool
 * endpoint, or both). Only downgrades Max/Final jobs per spec — Draft jobs
 * with no lower tier only get an endpoint switch (when a pool exists).
 */
export function decideOomRetry(input: DecideOomRetryInput): OomRetryDecision {
  if (input.autoRetryOnOom === false) {
    return { action: "none", reason: "auto-retry on OOM is disabled" };
  }
  if (input.alreadyRetried) {
    return { action: "none", reason: "already auto-retried once" };
  }
  if (!isOomOrExecutionErrorMessage(input.statusMessage)) {
    return { action: "none", reason: "not an OOM/execution_error failure" };
  }

  const profile = normalizeQueueQualityProfile(input.queueQualityProfile);
  const isMaxOrFinal = profile === "max" || profile === "final";
  const altUrl = pickAlternateComfyUrl(input.poolUrls, input.currentComfyUrl);

  if (!isMaxOrFinal) {
    if (altUrl) {
      return {
        action: "switch-endpoint",
        nextComfyUrl: altUrl,
        reason: `${profile} job hit OOM — retrying on alternate pool endpoint`,
      };
    }
    return {
      action: "none",
      reason: `${profile} job has no lower quality tier and no alternate endpoint`,
    };
  }

  const downgraded =
    input.downgradeEnabled !== false
      ? downgradeQueueQualityProfile(profile)
      : null;

  if (downgraded && altUrl) {
    return {
      action: "downgrade-and-switch",
      nextProfile: downgraded,
      nextComfyUrl: altUrl,
      reason: `${profile} job hit OOM — downgrading to ${downgraded} and switching pool endpoint`,
    };
  }
  if (downgraded) {
    return {
      action: "downgrade",
      nextProfile: downgraded,
      reason: `${profile} job hit OOM — downgrading to ${downgraded} and retrying on the same host`,
    };
  }
  if (altUrl) {
    return {
      action: "switch-endpoint",
      nextComfyUrl: altUrl,
      reason: `${profile} job hit OOM — retrying on alternate pool endpoint`,
    };
  }
  return {
    action: "none",
    reason: "no downgrade tier or alternate endpoint available",
  };
}

/** Best-effort: fetches known ComfyUI pool endpoint URLs from `/api/health`. Returns `[]` on any failure. */
export async function fetchComfyUiPoolUrlsForRetry(): Promise<string[]> {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) {
      return [];
    }
    const data = (await response.json()) as {
      comfyuiPool?: { enabled?: boolean; endpoints?: Array<{ url?: string }> };
    };
    if (!data.comfyuiPool?.enabled) {
      return [];
    }
    return (data.comfyuiPool.endpoints ?? [])
      .map((endpoint) => endpoint.url?.trim())
      .filter((url): url is string => Boolean(url));
  } catch {
    return [];
  }
}

export type OomAutoRetryResult = {
  decision: OomRetryDecision;
  requeued: boolean;
  promptId?: string;
  error?: string;
};

/**
 * Orchestrates a single OOM auto-retry attempt for a failed gallery entry:
 * loads settings, resolves pool endpoints, decides an action, marks the
 * entry so it can't retry twice, and (when the decision isn't "none")
 * re-queues via comfyui-requeue.ts. Returns `null` when no retry is
 * attempted (settings disabled, not OOM, already retried, or no action).
 */
export async function attemptOomAutoRetry(
  entry: ComfyGalleryEntry,
  statusMessage: string | undefined,
  onStatus?: (message: string) => void,
): Promise<OomAutoRetryResult | null> {
  if (entry.oomRetryAttempted) {
    return null;
  }
  if (!isOomOrExecutionErrorMessage(statusMessage)) {
    return null;
  }

  const [{ loadSettingsCache }, { updateComfyGalleryByPromptId }] = await Promise.all([
    import("./settings-cache"),
    import("./comfyui-gallery"),
  ]);
  const shared = loadSettingsCache().shared;

  const poolUrls = await fetchComfyUiPoolUrlsForRetry();
  const decision = decideOomRetry({
    statusMessage,
    queueQualityProfile: entry.queueQualityProfile,
    // Already checked above — `entry.oomRetryAttempted` is guaranteed falsy here.
    alreadyRetried: false,
    autoRetryOnOom: shared.autoRetryOnOom,
    downgradeEnabled: shared.oomRetryDowngrade,
    poolUrls,
    currentComfyUrl: entry.comfyUrl,
  });

  if (decision.action === "none") {
    return { decision, requeued: false };
  }

  // Mark before requeueing — never allow a second auto-retry even if the requeue itself fails.
  updateComfyGalleryByPromptId(entry.promptId, { oomRetryAttempted: true });

  onStatus?.(`Auto-retry: ${decision.reason}…`);

  const nextProfile =
    decision.action === "downgrade" || decision.action === "downgrade-and-switch"
      ? decision.nextProfile
      : normalizeQueueQualityProfile(entry.queueQualityProfile);
  const comfyUrlOverride =
    decision.action === "switch-endpoint" || decision.action === "downgrade-and-switch"
      ? decision.nextComfyUrl
      : undefined;

  try {
    const { requeueComfyJobFromEntry } = await import("./comfyui-requeue");
    const result = await requeueComfyJobFromEntry(entry, {
      qualityProfile: nextProfile,
      comfyUrlOverride,
      onStatus,
    });
    if (!result.ok) {
      return { decision, requeued: false, error: result.error };
    }
    return { decision, requeued: true, promptId: result.promptId };
  } catch (error) {
    return {
      decision,
      requeued: false,
      error: error instanceof Error ? error.message : "Auto-retry requeue failed.",
    };
  }
}
