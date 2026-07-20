import { clampScheduledBatchConfig, type ScheduledBatchConfig } from "./scheduled-batch";

type StoredScheduledBatch = {
  config?: ScheduledBatchConfig;
  lastRunAt?: number;
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
  const config = clampScheduledBatchConfig({
    enabled: true,
    intervalMinutes: 60,
    target: "random-scene",
    count: 3,
    autoQueueComfyUi: false,
    ...configInput,
  });

  const prompts: string[] = [];
  const model = process.env.LLM_MODEL ?? "dolphin-llama3";
  const detail = "balanced";

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
    const batch = await queueBatchToComfyUi(
      prompts.map((prompt) => ({ prompt })),
      undefined,
    );
    queued = batch.queued;
  }

  const stored = await loadStored();
  await saveStored({ ...stored, config, lastRunAt: Date.now() });
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
