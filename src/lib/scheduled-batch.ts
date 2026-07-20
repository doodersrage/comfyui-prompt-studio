export const SCHEDULED_BATCH_KEY = "comfy-scheduled-batch-v1";

export type ScheduledBatchConfig = {
  enabled: boolean;
  intervalMinutes: number;
  lastRunAt?: number;
  target: "random-scene" | "topics";
  count: number;
  autoQueueComfyUi: boolean;
  genre?: string;
};

export const DEFAULT_SCHEDULED_BATCH: ScheduledBatchConfig = {
  enabled: false,
  intervalMinutes: 60,
  target: "random-scene",
  count: 3,
  autoQueueComfyUi: false,
};

const MAX_SCHEDULED_COUNT = 12;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 24 * 60;

export function clampScheduledBatchConfig(
  config: ScheduledBatchConfig,
): ScheduledBatchConfig {
  const count = Number.isFinite(config.count)
    ? Math.min(MAX_SCHEDULED_COUNT, Math.max(1, Math.floor(config.count)))
    : DEFAULT_SCHEDULED_BATCH.count;
  const intervalMinutes = Number.isFinite(config.intervalMinutes)
    ? Math.min(
        MAX_INTERVAL_MINUTES,
        Math.max(MIN_INTERVAL_MINUTES, Math.floor(config.intervalMinutes)),
      )
    : DEFAULT_SCHEDULED_BATCH.intervalMinutes;

  return {
    ...DEFAULT_SCHEDULED_BATCH,
    ...config,
    count,
    intervalMinutes,
    target: config.target === "topics" ? "topics" : "random-scene",
    autoQueueComfyUi: Boolean(config.autoQueueComfyUi),
    enabled: Boolean(config.enabled),
  };
}

export function loadScheduledBatchConfig(): ScheduledBatchConfig {
  if (typeof window === "undefined") {
    return DEFAULT_SCHEDULED_BATCH;
  }
  try {
    const raw = window.localStorage.getItem(SCHEDULED_BATCH_KEY);
    if (!raw) {
      return DEFAULT_SCHEDULED_BATCH;
    }
    return clampScheduledBatchConfig({
      ...DEFAULT_SCHEDULED_BATCH,
      ...(JSON.parse(raw) as ScheduledBatchConfig),
    });
  } catch {
    return DEFAULT_SCHEDULED_BATCH;
  }
}

export function saveScheduledBatchConfig(config: ScheduledBatchConfig): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(
    SCHEDULED_BATCH_KEY,
    JSON.stringify(clampScheduledBatchConfig(config)),
  );
}

export function shouldRunScheduledBatch(config: ScheduledBatchConfig, now = Date.now()): boolean {
  const clamped = clampScheduledBatchConfig(config);
  if (!clamped.enabled) {
    return false;
  }
  const intervalMs = clamped.intervalMinutes * 60_000;
  const last = clamped.lastRunAt ?? 0;
  return now - last >= intervalMs;
}
