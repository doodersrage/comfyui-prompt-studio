import { clampScheduledBatchConfig, type ScheduledBatchConfig } from "./scheduled-batch";
import {
  mergeScheduledBatchProfile,
  normalizeScheduledBatchProfile,
  resolveScheduledBatchProfileFromEnv,
  type ScheduledBatchProfile,
} from "./scheduled-batch-profile";

type StoredScheduledBatch = {
  config?: ScheduledBatchConfig;
  lastRunAt?: number;
  /** Server-readable mirror of Studio Automation → Scheduled batch (model/detail/quality/etc). */
  profile?: ScheduledBatchProfile;
};

async function loadStored(): Promise<StoredScheduledBatch> {
  const { isServerStorageEnabled, readServerStorage } = await import("./server-storage");
  if (!isServerStorageEnabled()) {
    return {};
  }
  return readServerStorage<StoredScheduledBatch>("scheduled-batch") ?? {};
}

async function saveStored(data: StoredScheduledBatch): Promise<void> {
  const { isServerStorageEnabled, writeServerStorage } = await import("./server-storage");
  if (isServerStorageEnabled()) {
    writeServerStorage("scheduled-batch", data);
  }
}

/** Persisted profile (when server storage is enabled) merged over the `SERVER_SCHEDULED_BATCH_*` env fallback. */
export async function loadServerScheduledBatchProfile(): Promise<ScheduledBatchProfile> {
  const stored = await loadStored();
  return mergeScheduledBatchProfile(resolveScheduledBatchProfileFromEnv(), stored.profile);
}

/** Persists a batch profile update from Settings Automation. No-ops (but still returns the normalized profile) when server storage is disabled. */
export async function saveServerScheduledBatchProfile(
  profile: Partial<ScheduledBatchProfile>,
): Promise<{ profile: ScheduledBatchProfile; persisted: boolean }> {
  const normalized = normalizeScheduledBatchProfile(profile);
  const { isServerStorageEnabled } = await import("./server-storage");
  if (!isServerStorageEnabled()) {
    return { profile: normalized, persisted: false };
  }
  const stored = await loadStored();
  await saveStored({ ...stored, profile: normalized });
  return { profile: normalized, persisted: true };
}

/** Profile + last run status for display in Settings, regardless of storage availability. */
export async function loadServerScheduledBatchStatus(): Promise<{
  profile: ScheduledBatchProfile;
  lastRunAt?: number;
  persisted: boolean;
  enabled: boolean;
}> {
  const { isServerStorageEnabled } = await import("./server-storage");
  const stored = await loadStored();
  return {
    profile: mergeScheduledBatchProfile(resolveScheduledBatchProfileFromEnv(), stored.profile),
    lastRunAt: stored.lastRunAt,
    persisted: isServerStorageEnabled(),
    enabled: process.env.SERVER_SCHEDULED_BATCH === "true",
  };
}

/** Resolves the effective server scheduler config (enabled/interval from env, rest from the batch profile). */
export async function resolveServerScheduledBatchConfig(
  profile?: ScheduledBatchProfile,
): Promise<ScheduledBatchConfig> {
  const resolvedProfile = profile ?? (await loadServerScheduledBatchProfile());
  const intervalMinutes = Number(process.env.SERVER_SCHEDULED_BATCH_INTERVAL_MIN ?? "60");
  return clampScheduledBatchConfig({
    enabled: process.env.SERVER_SCHEDULED_BATCH === "true",
    intervalMinutes,
    target: resolvedProfile.target,
    count: resolvedProfile.count,
    autoQueueComfyUi: resolvedProfile.autoQueueComfyUi,
    genre: resolvedProfile.genre,
  });
}

async function fetchJson<T>(path: string, body: unknown): Promise<T> {
  const origin = process.env.PROMPT_API_URL?.trim() || "http://127.0.0.1:47832";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = process.env.PROMPT_API_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${origin}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Server batch call failed: ${path} HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function runServerScheduledBatch(
  configInput?: Partial<ScheduledBatchConfig>,
): Promise<{ prompts: string[]; queued: number }> {
  const profile = await loadServerScheduledBatchProfile();
  const baseConfig = await resolveServerScheduledBatchConfig(profile);
  const config = clampScheduledBatchConfig({
    ...baseConfig,
    enabled: true,
    ...configInput,
  });

  const prompts: string[] = [];
  const model = profile.model;
  const detail = profile.detail;

  if (config.target === "topics") {
    const data = await fetchJson<{ results?: Array<{ prompt?: string }> }>(
      "/api/topics/batch",
      {
        topics: Array.from({ length: config.count }, (_, index) =>
          config.genre?.trim()
            ? `${config.genre.trim()} scene ${index + 1}`
            : `Scheduled scene ${index + 1}`,
        ),
        target: "generate",
        model,
        detail,
      },
    );
    for (const entry of data.results ?? []) {
      if (entry.prompt?.trim()) {
        prompts.push(entry.prompt.trim());
      }
    }
  } else {
    for (let index = 0; index < config.count; index += 1) {
      const data = await fetchJson<{ prompt?: string }>("/api/random-scene", {
        model,
        detail,
        genre: config.genre?.trim() || undefined,
        includePeople: true,
        wildness: 50,
      });
      if (data.prompt?.trim()) {
        prompts.push(data.prompt.trim());
      }
    }
  }

  let queued = 0;
  if (config.autoQueueComfyUi && prompts.length > 0) {
    const { queueBatchToComfyUi } = await import("./comfyui-client");
    const { resolveQueueParams } = await import("./queue-params-settings");
    const paramsPerPrompt = prompts.map((_, index) =>
      resolveQueueParams({
        model,
        tool: "scheduled-batch",
        base: { seed: String(Math.floor(Math.random() * 2 ** 32) + index) },
        qualityProfile: profile.qualityProfile,
      }),
    );
    const batch = await queueBatchToComfyUi(
      prompts.map((prompt, index) => ({
        prompt,
        model,
        params: paramsPerPrompt[index],
      })),
    );
    queued = batch.queued;

    const { appendServerGalleryEntries } = await import("./server-gallery-storage");
    const queuedAt = Date.now();
    const entries = batch.results.flatMap((result, index) => {
      if (!result.ok || !result.promptId) {
        return [];
      }
      return [
        {
          id: crypto.randomUUID(),
          promptId: result.promptId,
          prompt: prompts[index] ?? "",
          tool: "scheduled-batch",
          model,
          comfyUrl: result.comfyUrl,
          queueParams: paramsPerPrompt[index],
          queueQualityProfile: profile.qualityProfile,
          status: "pending" as const,
          statusMessage: "Queued via server scheduled batch",
          queuedAt,
          images: [],
        },
      ];
    });
    await appendServerGalleryEntries(entries);
  }

  const stored = await loadStored();
  await saveStored({ ...stored, config, profile, lastRunAt: Date.now() });
  return { prompts, queued };
}

export async function notifyServerScheduledBatchComplete(result: {
  prompts: string[];
  queued: number;
  ranked?: boolean;
}): Promise<void> {
  const { notifyBatchCompleted } = await import("./email/notifications");
  await notifyBatchCompleted({
    kind: "server-scheduled",
    promptCount: result.prompts.length,
    queued: result.queued,
    ranked: result.ranked,
  });
}

export async function shouldRunServerScheduledBatch(
  config: ScheduledBatchConfig,
  now = Date.now(),
): Promise<boolean> {
  const configClamped = clampScheduledBatchConfig(config);
  if (!configClamped.enabled) {
    return false;
  }
  const stored = await loadStored();
  const intervalMs = configClamped.intervalMinutes * 60_000;
  const last = stored.lastRunAt ?? 0;
  return now - last >= intervalMs;
}
